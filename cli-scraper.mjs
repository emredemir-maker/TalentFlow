import puppeteer from 'puppeteer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = process.cwd();

// Read API Key from .env manually
function getApiKey() {
    try {
        const envPath = path.join(rootDir, '.env');
        if (!fs.existsSync(envPath)) return null;

        const content = fs.readFileSync(envPath, 'utf-8');
        const match = content.match(/VITE_GEMINI_API_KEY=(.*)/);
        return match ? match[1].trim().replace(/["']/g, '') : null;
    } catch (e) {
        return null;
    }
}

const API_KEY = getApiKey();

if (!API_KEY) {
    console.error('❌ HATA: .env dosyasında VITE_GEMINI_API_KEY bulunamadı!');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

// Use command line argument as query
const query = process.argv[2];
if (!query) {
    console.log('❌ Lütfen bir arama terimi girin.');
    console.log('Örnek: node cli-scraper.mjs "Senior React Developer Istanbul"');
    process.exit(1);
}

// Config
const MAX_RESULTS = 3; // How many profiles to scrape
// Use Bing HTML Version (More stable selector)
const SEARCH_URL = `https://www.bing.com/search?q=site:linkedin.com/in+${encodeURIComponent(query)}`;

// Gemini Parser (from geminiService.js)
async function parseProfile(text, modelId = 'gemini-pro') {
    const prompt = `You are a strict JSON parser.
    Extract the following fields from the LinkedIn profile text below:
    - name (Full Name)
    - position (Current Job Title)
    - company (Current Company)
    - location (City, Country)
    - skills (Array of strings)
    - experience (Total years as number)
    - education (Last school/degree)
    - about (Summary max 200 chars)

    Mark missing fields as null.
    Add "source": "CLI Scraper".

    TEXT:
    ${text.substring(0, 20000)}

    Return ONLY raw JSON. No markdown.`;

    const model = genAI.getGenerativeModel({ model: modelId });
    try {
        const result = await model.generateContent(prompt);
        let responseText = result.response.text();
        // Cleanup markdown
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(responseText);
    } catch (e) {
        // console.error('Gemini Parse Error:', e.message);
        return null;
    }
}

async function run() {
    console.log(`🔍 Arama başlatılıyor (Bing): "${query}"`);
    console.log(`🚀 Hedef: site:linkedin.com/in (${MAX_RESULTS} sonuç)`);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Set User Agent to look like a real browser
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    try {
        // 1. Search on Bing
        await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Extract Links from Bing results
        const links = await page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('li.b_algo h2 a'));
            return anchors
                .map(a => a.href)
                .filter(href => href.includes('linkedin.com/in/') && !href.includes('/dir/'))
                .slice(0, 5); // Get top 5
        });

        console.log(`🔗 Bulunan Linkler (${links.length}):`);
        links.forEach(l => console.log(`  - ${l}`));

        if (links.length === 0) {
            console.log('⚠️ Sonuç bulunamadı. Lütfen arama terimini değiştirin.');
            await browser.close();
            return;
        }

        const scrapedData = [];

        // 2. Visit Profiles
        let count = 0;
        for (const link of links) {
            if (count >= MAX_RESULTS) break; // Limit

            console.log(`\nAnalyzing (${count + 1}/${MAX_RESULTS}): ${link}`);
            try {
                // New page for each profile to be clean
                const profilePage = await browser.newPage();
                await profilePage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

                // Go to profile
                await profilePage.goto(link, { waitUntil: 'domcontentloaded', timeout: 45000 });

                // Extract Content
                const content = await profilePage.evaluate(() => document.body.innerText);

                // Check if we hit a login wall
                if (content.includes("Sign In") || content.includes("Join LinkedIn") || content.length < 500) {
                    console.log('⚠️ Giriş duvarı veya yetersiz içerik.');
                    // Still try to parse what we got
                }

                // AI Parsing
                console.log('🤖 Gemini analiz ediyor...');
                const profile = await parseProfile(content);

                if (profile && profile.name) {
                    profile.linkedinUrl = link;
                    // Add extra metadata for the system
                    profile.status = 'new';
                    profile.matchScore = 0;
                    profile.appliedDate = new Date().toISOString();

                    scrapedData.push(profile);
                    console.log(`✅ ${profile.name} eklendi.`);
                    count++;
                } else {
                    console.log('❌ Profil ayrıştırılamadı (AI sonucu boş).');
                }

                await profilePage.close();

                // Random delay to avoid bot detection
                await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));

            } catch (err) {
                console.error(`Link hatası: ${err.message}`);
            }
        }

        // 3. Save to JSON
        if (scrapedData.length > 0) {
            const outputPath = path.join(rootDir, 'scraped_candidates.json');

            let finalData = scrapedData;
            // Read existing if any to append
            if (fs.existsSync(outputPath)) {
                try {
                    const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
                    if (Array.isArray(existing)) {
                        // Avoid duplicates by linkedinUrl
                        const existingUrls = new Set(existing.map(c => c.linkedinUrl));
                        const newUnique = scrapedData.filter(c => !existingUrls.has(c.linkedinUrl));
                        finalData = [...existing, ...newUnique];
                    }
                } catch (e) { }
            }

            fs.writeFileSync(outputPath, JSON.stringify(finalData, null, 2));
            console.log(`\n💾 ${scrapedData.length} aday kaydedildi: scraped_candidates.json`);
            console.log("👉 Scraper sayfasına gidip 'Dosyadan Yükle' butonunu kullanın!");
        } else {
            console.log('\n⚠️ Hiçbir aday kaydedilmedi.');
        }

    } catch (error) {
        console.error('Genel Hata:', error);
    } finally {
        await browser.close();
    }
}

run();
