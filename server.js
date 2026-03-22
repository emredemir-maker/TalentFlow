// server.js - Backend API for Web Scraper (ESM Version)
import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import admin from 'firebase-admin';

dotenv.config();

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
    });
}
const db = admin.firestore();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfLib = require('pdf-parse');
const pdf = async (buffer) => {
    try {
        const PDFClass = pdfLib.PDFParse || pdfLib.default;
        if (PDFClass && typeof PDFClass === 'function') {
            try {
                // Try as class first
                const instance = new PDFClass({ data: buffer });
                const result = await instance.getText();
                await instance.destroy().catch(() => { });
                return result;
            } catch (err) {
                if (err.message.includes("cannot be invoked without 'new'")) {
                    // This shouldn't happen if we used new, but let's be safe
                    throw err;
                }
                // If it's the old pdf-parse function style
                if (typeof pdfLib === 'function') {
                    return await pdfLib(buffer);
                }
                throw err;
            }
        } else if (typeof pdfLib === 'function') {
            return await pdfLib(buffer);
        }
        throw new Error('PDF parsing library not found or invalid');
    } catch (err) {
        console.error('PDF Error:', err);
        return { text: 'PDF Error: ' + err.message };
    }
};
const mammoth = require('mammoth');
const multer = require('multer');

// Configure storage for uploads
const isServerless = !!process.env.K_SERVICE || !!process.env.FUNCTION_NAME || !!process.env.FUNCTIONS_EMULATOR;
const uploadBaseDir = isServerless ? '/tmp' : __dirname;

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(uploadBaseDir, 'uploads', 'cvs');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `cv-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB Limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Desteklenmeyen dosya formatı. Sadece PDF ve DOCX yükleyebilirsiniz.'));
        }
    }
});

const app = express();
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5000',
    'http://localhost:3000',
    process.env.VITE_APP_URL,
    process.env.APP_URL
].filter(Boolean);

// Replit preview domains are dynamic — allow all *.replit.dev and *.replit.app origins
const isAllowedOrigin = (origin) => {
    if (!origin) return true; // curl / mobile / server-to-server
    if (allowedOrigins.includes(origin)) return true;
    if (/^https:\/\/.*\.replit\.dev$/.test(origin)) return true;
    if (/^https:\/\/.*\.replit\.app$/.test(origin)) return true;
    if (/^https:\/\/.*\.pike\.replit\.dev$/.test(origin)) return true;
    return false;
};

// --- Security Middlewares ---
app.use(helmet({
    contentSecurityPolicy: false,
}));
app.use(hpp());

// Rate limiters
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla istek gönderildi. Lütfen 15 dakika sonra tekrar deneyin.' }
});

const aiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'AI istek limiti aşıldı. Lütfen 1 dakika sonra tekrar deneyin.' }
});

// Public session polling + candidate status updates.
// 60 req/min is plenty for a live interview heartbeat but blocks enumeration.
const sessionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla oturum sorgusu. Lütfen bekleyin.' }
});

// Trust the first reverse-proxy hop (Replit's ingress layer adds X-Forwarded-For)
// This lets express-rate-limit use the real client IP instead of the proxy IP.
app.set('trust proxy', 1);

// Strict CORS setup
app.use(cors({
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
            callback(null, true);
        } else {
            console.warn(`🛑 Blocked CORS request from: ${origin}`);
            callback(new Error('CORS Policy: Not allowed origin'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(generalLimiter);

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(uploadBaseDir, 'uploads')));

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// Load API Key (Priority: Env -> Firestore)
async function getApiKey() {
    // 1. Check process.env (Vite convention or standard)
    const envKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (envKey && envKey !== 'null' && envKey !== 'undefined' && envKey.length > 5) {
        return envKey;
    }

    // 2. Fallback to Firestore (System Settings)
    try {
        const settingsRef = db.doc('artifacts/talent-flow/public/data/settings/api_keys');
        const doc = await settingsRef.get();
        if (doc.exists && doc.data().gemini) {
            return doc.data().gemini;
        }
    } catch (err) {
        console.error('Firestore API Key fetch error:', err);
    }

    console.warn('⚠️ Gemini API Key is missing in BOTH environment and Firestore. AI features will not work.');
    return null;
}

// Gemini Parser Function
async function parseProfile(text, modelId = 'gemini-2.0-flash') {
    const apiKey = await getApiKey();
    if (!apiKey) {
        console.error('Gemini Parse Error: API Key missing');
        return null;
    }

    const prompt = `You are a strict JSON parser.
    Extract the following fields from the LinkedIn profile text below:
    - name (Full Name)
    - position (Current Job Title)
    - company (Current Company)
    - location (City, Country)
    - skills (Array of strings)
    - experience (Total years as number)
    - education (Last school/degree)
    - summary (Professional summary in TURKISH, max 400 chars)

    Mark missing fields as null.
    Add "source": "Auto Scraper".
    IMPORTANT: The input text might be in any language, but ALL output text fields MUST be in TURKISH.

    TEXT:
    ${text.substring(0, 20000)}

    Return ONLY raw JSON. No markdown.`;

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelId });
        const result = await model.generateContent(prompt);
        let responseText = result.response.text();

        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

        const json = JSON.parse(responseText);
        console.log(`✅ Parsed: ${json.name}`);
        return json;
    } catch (e) {
        console.error('Gemini Parse Error:', e.message);
        return null;
    }
}

// Scrape Endpoint
app.get('/api/scrape', aiLimiter, async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Query parameter "q" is required.' });

    console.log(`🔍 Received Request: "${query}"`);
    const isVisual = req.query.visual === 'true';

    // Check if the query is a direct LinkedIn/Sales Navigator URL
    if (query.includes('linkedin.com')) {
        console.log('🔗 Direct URL detected. Jumping straight to profile...');
        // We'll define this helper function or handle it inline
        return await handleDirectUrl(query, res, isVisual);
    }

    const MAX_RESULTS = isVisual ? 8 : 3;
    const sessionPath = path.resolve(__dirname, 'chrome-session');
    let SEARCH_URLS = [
        `https://www.google.com/search?q=${encodeURIComponent('site:linkedin.com/in ' + query)}`,
        `https://www.bing.com/search?q=${encodeURIComponent('linkedin site:linkedin.com ' + query)}`,
        `https://www.google.com/search?q=${encodeURIComponent('linkedin profile ' + query)}`
    ];

    // In Visual Mode, we prioritize the direct LinkedIn search
    if (isVisual) {
        const priorityQuery = `${query} "open to work" OR "#opentowork"`;
        SEARCH_URLS.unshift(`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(priorityQuery)}&origin=GLOBAL_SEARCH_HEADER`);
    }

    let browser;
    try {
        console.log(`🌐 Launching browser (Visual: ${isVisual}, Profile: ${sessionPath})...`);

        browser = await puppeteer.launch({
            headless: isVisual ? false : 'new',
            userDataDir: sessionPath,
            defaultViewport: null,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--no-first-run',
                '--no-default-browser-check'
            ]
        });

        // Clean up previous session tabs if any (since we use userDataDir)
        const pages = await browser.pages();
        for (let i = 0; i < pages.length; i++) {
            if (i > 0) await pages[i].close().catch(() => { });
        }

        const page = pages.length > 0 ? pages[0] : await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });

        console.log(`🔎 Searching across engines for "${query}"...`);
        let scrapedData = [];
        let seenUrls = new Set();

        for (const url of SEARCH_URLS) {
            if (scrapedData.length >= 5) break;

            console.log(`📡 Trying engine: ${url}`);
            try {
                // Use a more relaxed waitUntil to avoid 'blank page' issues with slow trackers
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

                // Extra wait for dynamic content
                await new Promise(r => setTimeout(r, 2000));

                // If page seems blank or loading failed, try one more wait
                const isBlank = await page.evaluate(() => document.body.innerText.length < 100);
                if (isBlank) {
                    console.log('⚠️ Page looks empty, waiting longer for dynamic content...');
                    await new Promise(r => setTimeout(r, 5000));
                }

                // If we are directly on LinkedIn, wait for results to load
                if (url.includes('linkedin.com/search')) {
                    console.log('⏳ Waiting for LinkedIn search results UI...');
                    await page.waitForSelector('.reusable-search__result-container, .artdeco-list__item, .entity-result', { timeout: 15000 }).catch(() => {
                        console.log('Timeout waiting for LinkedIn results, proceeding with current content.');
                    });
                }

                await new Promise(r => setTimeout(r, isVisual ? 4000 : 2000));

                // Check for block/captcha
                const pageBody = await page.evaluate(() => document.body.innerText.toLowerCase());
                if (pageBody.includes('security check') || pageBody.includes('not a robot') || pageBody.includes('captcha')) {
                    console.warn(`🛑 CAPTCHA detected on: ${url.split('/')[2]}`);
                    if (isVisual) {
                        console.log('👀 Visual Mode: Waiting 30 seconds for manual resolution...');
                        await new Promise(r => setTimeout(r, 30000));
                    }
                }

                const itemsFromPage = await page.evaluate(() => {
                    const results = [];
                    // Match LinkedIn profile patterns inside any URL
                    const linkedinPattern = /linkedin\.com\/(in|sales\/profile)\/([^/?#&"'>\s]+)/i;

                    // Search in all anchors
                    const allAnchors = Array.from(document.querySelectorAll('a'));
                    console.log(`[Evaluate] Checking ${allAnchors.length} anchors...`);

                    allAnchors.forEach(a => {
                        const href = a.href || '';
                        const match = href.match(linkedinPattern);
                        const text = a.innerText.trim();

                        if (match && !href.includes('/dir/') && !href.includes('/pub/dir/')) {
                            const type = match[1];
                            const id = match[2];
                            const cleanUrl = `https://www.linkedin.com/${type}/${id}/`;

                            // Find the most relevant title/snippet
                            let title = text;
                            let snippet = '';

                            // Go up to find result container
                            // Google: .g, .kvH9Zd | Bing: .b_algo | LinkedIn: .reusable-search__result-container, .base-search-card
                            let container = a.closest('.g, .b_algo, .reusable-search__result-container, .base-search-card, .entity-result, .t-black');

                            if (container) {
                                snippet = container.innerText.replace(/\n/g, ' ').substring(0, 300);
                                if (!title || title.length < 5) {
                                    const h3 = container.querySelector('h3, h4, .entity-result__title, .base-search-card__title');
                                    if (h3) title = h3.innerText.trim();
                                }
                            }

                            if (title && title.length > 2) {
                                const lowerText = (title + ' ' + snippet).toLowerCase();
                                const isUrgent = lowerText.includes('open to work') ||
                                    lowerText.includes('#opentowork') ||
                                    lowerText.includes('looking for') ||
                                    lowerText.includes('active');

                                results.push({
                                    url: cleanUrl,
                                    rawTitle: title,
                                    rawSnippet: snippet || title,
                                    name: title.split(/ - | \| | \/ /)[0].replace(/LinkedIn|Profil|Member|User/gi, '').trim(),
                                    priority: isUrgent ? 2 : 1
                                });
                            }
                        }
                    });

                    // Extra pass for LinkedIn search results that might not have traditional anchors
                    if (window.location.href.includes('linkedin.com/search')) {
                        document.querySelectorAll('.reusable-search__result-container, .entity-result').forEach(el => {
                            const link = el.querySelector('a');
                            if (link && link.href.includes('/in/') || link && link.href.includes('/sales/profile/')) {
                                // Already handled by general anchor scan, but we can double check here
                            }
                        });
                    }

                    // Deduplicate and Sort by Priority
                    const unique = [];
                    const seen = new Set();
                    results.sort((a, b) => b.priority - a.priority); // High priority first

                    for (const res of results) {
                        const key = res.url.toLowerCase();
                        if (!seen.has(key)) {
                            seen.add(key);
                            unique.push(res);
                        }
                    }
                    return unique;
                });

                console.log(`✅ Engine ${url.split('/')[2]} found ${itemsFromPage.length} potential items.`);

                for (const item of itemsFromPage) {
                    if (scrapedData.length >= MAX_RESULTS) break;
                    if (seenUrls.has(item.url)) continue;
                    seenUrls.add(item.url);

                    console.log(`🚀 Processing candidate: ${item.name}`);
                    let profileText = `TITLE: ${item.rawTitle}\nSNIPPET: ${item.rawSnippet}`;
                    let extractionMethod = 'snippet';

                    if (isVisual && (item.url.includes('/in/') || item.url.includes('/sales/profile/'))) {
                        console.log(`🔍 Visiting profile: ${item.url}`);
                        try {
                            const detailPage = await browser.newPage();
                            await detailPage.setUserAgent(await page.evaluate(() => navigator.userAgent));
                            await detailPage.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

                            // Human-like wait
                            await new Promise(r => setTimeout(r, 4000 + Math.random() * 2000));

                            const fullText = await detailPage.evaluate(() => document.body.innerText);

                            // More accurate block detection: Blocked if content is very short OR only has login text
                            const isVeryShort = fullText.length < 800;
                            const hasLoginText = (fullText.includes("Giriş yap") || fullText.includes("Sign in")) &&
                                (fullText.includes("LinkedIn'e katılın") || fullText.includes("Join LinkedIn"));

                            if (fullText.length > 1000 && !hasLoginText) {
                                console.log(`📄 Detail Page captured (${fullText.length} chars)`);
                                profileText = fullText;
                                extractionMethod = 'full-page';
                            } else {
                                console.log(`⚠️ Profile hidden or restricted. Using snippet as fallback.`);
                            }
                            await detailPage.close();
                        } catch (detailErr) {
                            console.warn(`⚠️ Detail visit failed: ${item.url}. Error: ${detailErr.message}`);
                        }
                    }

                    console.log(`🤖 Gemini Parsing (${extractionMethod}): ${item.name}...`);
                    let refined = await parseProfile(profileText, 'gemini-2.0-flash');

                    // Final Fallback: If full-page parse failed, try snippet one last time
                    if (!refined && extractionMethod === 'full-page') {
                        console.log('🔄 Full-page parse failed. Retrying with original snippet...');
                        profileText = `TITLE: ${item.rawTitle}\nSNIPPET: ${item.rawSnippet}`;
                        refined = await parseProfile(profileText, 'gemini-2.0-flash');
                    }

                    if (refined && (refined.name || item.name)) {
                        const finalCandidate = {
                            ...refined,
                            name: refined.name || item.name, // Ensure we have a name
                            linkedinUrl: item.url,
                            status: 'new',
                            matchScore: 0,
                            appliedDate: new Date().toISOString(),
                            source: isVisual ? `Visual (${extractionMethod})` : 'Auto (Deep Search)'
                        };

                        scrapedData.push(finalCandidate);
                        console.log(`✅ Candidate Added: ${finalCandidate.name}`);
                    } else {
                        console.warn(`❌ No data extracted for: ${item.name}`);
                    }
                }

                // If we found results on LinkedIn (first engine), no need to check Google/Bing
                if (scrapedData.length > 0) {
                    console.log('✨ Found enough candidates on LinkedIn. Skipping other engines.');
                    break;
                }
            } catch (e) {
                console.warn(`⚠️ Engine failed: ${url.split('/')[2]}`, e.message);
            }
        }

        if (scrapedData.length === 0 && isVisual) {
            console.log('⚠️ No profiles found in Visual Mode. Keeping browser open for 15s for inspection...');
            await new Promise(r => setTimeout(r, 15000));
        }

        await browser.close();
        console.log(`🎉 Scraping session finished. Total: ${scrapedData.length}`);
        res.json({ candidates: scrapedData, message: `Successfully found ${scrapedData.length} profiles from deep search.` });

    } catch (error) {
        console.error('💥 Critical Server Scrape Error:', error);
        if (browser) try { await browser.close(); } catch (e) { }
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

// Helper for direct URL scraping
async function handleDirectUrl(url, res, isVisual = false) {
    const sessionPath = path.resolve(__dirname, 'chrome-session');
    let browser;
    try {
        console.log(`🌐 Launching browser for direct URL (Visual: ${isVisual}, Profile: ${sessionPath})...`);

        browser = await puppeteer.launch({
            headless: isVisual ? false : 'new',
            userDataDir: sessionPath,
            defaultViewport: null,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        // Clean up previous session tabs
        const pages = await browser.pages();
        for (let i = 0; i < pages.length; i++) {
            if (i > 0) await pages[i].close().catch(() => { });
        }

        const page = pages.length > 0 ? pages[0] : await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log(`🚀 Visiting direct URL: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Special case for Login/Setup
        if (url.includes('login') || url.includes('linkedin.com') && !url.includes('/in/') && !url.includes('/sales/')) {
            console.log('🔑 Setup mode detected. Waiting for user to complete login...');
            if (isVisual) {
                // Wait for 2 minutes or until closed to let user log in
                await new Promise(r => setTimeout(r, 120000));
            }
            await browser.close();
            return res.json({ message: 'Oturum hazırlama süresi doldu veya tamamlandı.' });
        }

        await new Promise(r => setTimeout(r, 2000));
        const bodyText = await page.evaluate(() => document.body.innerText);

        if (bodyText.includes("Sign In") || bodyText.includes("Security Check") || bodyText.length < 1000) {
            console.warn('❌ LinkedIn block detected on direct visit.');
            await browser.close();
            return res.json({ candidates: [], message: 'LinkedIn bu sayfayı görmemizi engelledi (Giriş duvarı). Lütfen "Tarayıcıda Oturumu Hazırla" butonunu kullanarak giriş yapın.' });
        }

        const candidate = await parseProfile(bodyText, 'gemini-2.0-flash');
        if (candidate && candidate.name && candidate.name !== 'Belirtilmemiş') {
            candidate.linkedinUrl = url;
            candidate.source = 'Direct URL Scrape';
            candidate.status = 'new';
            candidate.appliedDate = new Date().toISOString();
            await browser.close();
            return res.json({ candidates: [candidate], message: 'Profil başarıyla çekildi.' });
        }

        await browser.close();
        res.json({ candidates: [], message: 'Profil verisi bu sayfadan ayrıştırılamadı.' });
    } catch (e) {
        console.error('💥 Direct URL Error:', e.message);
        if (browser) await browser.close();
        res.status(500).json({ error: e.message });
    }
}

// Direct Add from Browser Extension / Console Script
app.post('/api/direct-add', aiLimiter, async (req, res) => {
    try {
        const { text, url } = req.body;
        console.log(`📥 Direct Add request for: ${url}`);

        const candidate = await parseProfile(text, 'gemini-2.0-flash');
        if (candidate && candidate.name) {
            candidate.linkedinUrl = url;
            candidate.source = 'Browser Extension';
            candidate.status = 'new';
            candidate.matchScore = 0;
            candidate.appliedDate = new Date().toISOString();
            res.json({ success: true, candidate });
        } else {
            res.status(400).json({ error: 'Could not parse candidate data.' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Process CV Uploads (Bulk)
app.post('/api/process-cv', aiLimiter, upload.array('cvs', 20), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Dosya seçilmedi' });

        console.log(`📂 Processing ${req.files.length} uploaded CVs...`);

        const results = await Promise.all(req.files.map(async (file) => {
            try {
                let text = '';
                const fileBuffer = fs.readFileSync(file.path);

                if (file.mimetype === 'application/pdf') {
                    const data = await pdf(fileBuffer);
                    text = data.text;
                } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                    const result = await mammoth.extractRawText({ buffer: fileBuffer });
                    text = result.value;
                } else {
                    return { fileName: file.originalname, error: 'Desteklenmeyen format' };
                }

                if (!text || text.length < 50) {
                    return { fileName: file.originalname, error: 'İçerik okunamadı' };
                }

                const candidate = await parseProfile(text, 'gemini-2.0-flash');
                if (!candidate) return { fileName: file.originalname, error: 'AI ayrıştırma hatası' };

                // Add the URL to the stored file
                const baseUrl = process.env.SERVER_URL || 'http://localhost:3001';
                candidate.cvUrl = `${baseUrl}/uploads/cvs/${file.filename}`;

                return { fileName: file.originalname, candidate, success: true };
            } catch (err) {
                console.error(`Error processing ${file.originalname}:`, err);
                return { fileName: file.originalname, error: err.message };
            }
        }));

        res.json({ results });
    } catch (err) {
        console.error('Bulk CV Processing Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Gemini STT Endpoint (Audio to Text)
// Accepts both multipart/form-data (LiveInterviewPage) and base64 JSON (SettingsPage)
const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
app.post('/api/gemini-stt', aiLimiter, (req, res, next) => {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('multipart/form-data')) {
        audioUpload.single('audio')(req, res, next);
    } else {
        next();
    }
}, async (req, res) => {
    try {
        let audioBase64, mimeType;

        if (req.file) {
            // Path 1: multipart/form-data upload (LiveInterviewPage)
            audioBase64 = req.file.buffer.toString('base64');
            mimeType = (req.file.mimetype || 'audio/webm').split(';')[0];
            console.log(`🎙️ STT (multipart) ${mimeType} ${(req.file.buffer.length / 1024).toFixed(1)}KB`);
        } else if (req.body?.audio) {
            // Path 2: base64 JSON body (SettingsPage — avoids proxy/xss-clean issues with binary)
            audioBase64 = req.body.audio;
            mimeType = (req.body.mimeType || 'audio/webm').split(';')[0];
            const sizeKB = (audioBase64.length * 0.75 / 1024).toFixed(1);
            console.log(`🎙️ STT (base64) ${mimeType} ~${sizeKB}KB`);
        } else {
            return res.status(400).json({ error: 'Ses dosyası bulunamadı' });
        }

        const apiKey = await getApiKey();
        if (!apiKey) return res.status(500).json({ error: 'Gemini API Key eksik' });

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const result = await model.generateContent([
            { inlineData: { data: audioBase64, mimeType } },
            `Bu ses dosyasını analiz et. YALNIZCA aşağıdaki JSON formatında yanıt döndür, başka hiçbir şey yazma:
{"text":"türkçe transkript metni","stress":30,"excitement":70,"confidence":60,"hesitation":20}
Kurallar:
- text: konuşulan Türkçe sözcükler. Konuşma yoksa boş string.
- stress: stres/gerginlik seviyesi 0-100
- excitement: heyecan/coşku seviyesi 0-100
- confidence: özgüven/kararlılık seviyesi 0-100
- hesitation: tereddüt/dolgu sesi seviyesi 0-100
- Skorlar 0-100 arası tam sayı olmalı.
- 'Sessizlik', 'Ses yok', 'Boş' gibi ifadeler text alanına YAZMA.`
        ]);

        const raw = result.response.text().trim();
        let text = raw;
        let emotion = null;
        try {
            const m = raw.match(/\{[\s\S]*\}/);
            if (m) {
                const parsed = JSON.parse(m[0]);
                text = typeof parsed.text === 'string' ? parsed.text : '';
                emotion = {
                    stress: Math.min(100, Math.max(0, parseInt(parsed.stress) || 0)),
                    excitement: Math.min(100, Math.max(0, parseInt(parsed.excitement) || 0)),
                    confidence: Math.min(100, Math.max(0, parseInt(parsed.confidence) || 0)),
                    hesitation: Math.min(100, Math.max(0, parseInt(parsed.hesitation) || 0)),
                };
            }
        } catch { /* fallback: use raw as text */ }

        console.log(`✅ STT: "${text.substring(0, 60)}" | emotion: ${JSON.stringify(emotion)}`);
        res.json({ success: true, text, emotion });
    } catch (err) {
        console.error('💥 Gemini STT Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Invite Email Endpoint
app.post('/api/send-invite', async (req, res) => {
    const { email, role, inviteLink } = req.body;
    console.log(`✉️ Received invite request for: ${email}, role: ${role}`);

    if (!email || !inviteLink) {
        console.warn('❌ Missing email or inviteLink in request');
        return res.status(400).json({ error: 'Email ve davet linki gereklidir.' });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error('❌ Email configuration missing in .env (EMAIL_USER or EMAIL_PASS)');
        return res.status(500).json({ error: 'Sistem email yapılandırması eksik (.env kontrol edin).' });
    }

    try {
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            connectionTimeout: 10000,
            greetingTimeout: 5000,
            socketTimeout: 20000
        });

        // Skip extra verify() call if it hangs, sendMail will throw if failed
        // await transporter.verify();

        const mailOptions = {
            from: `"Talent-Inn" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Talent-Inn\'a Davet Edildiniz',
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
                    <h2 style="color: #4f46e5; border-bottom: 2px solid #f3f4f6; padding-bottom: 10px;">Talent-Inn'a Hoş Geldiniz!</h2>
                    <p style="color: #374151; font-size: 16px;">Merhaba,</p>
                    <p style="color: #374151; font-size: 15px; line-height: 1.5;">Talent-Inn platformuna <strong>${role === 'super_admin' ? 'Süper Admin' : 'Recruiter'}</strong> olarak davet edildiniz.</p>
                    <p style="color: #374151; font-size: 15px;">Aşağıdaki butona tıklayarak hesabınızı oluşturabilir ve ekibe katılabilirsiniz:</p>
                    <div style="text-align: center; margin: 35px 0;">
                        <a href="${inviteLink}" style="background-color: #4f46e5; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">Daveti Kabul Et</a>
                    </div>
                    <p style="color: #6b7280; font-size: 12px; border-top: 1px solid #f3f4f6; padding-top: 20px;">
                        Eğer butona tıklayamıyorsanız, bu bağlantıyı tarayıcınıza yapıştırın:<br/>
                        <span style="color: #4f46e5;">${inviteLink}</span>
                    </p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`✉️ Invite email sent successfully to: ${email}`);
        res.json({ success: true, message: 'Davet maili başarıyla gönderildi.' });
    } catch (error) {
        console.error('❌ Nodemailer Error:', error);
        res.status(500).json({ error: 'Mail gönderilirken bir hata oluştu: ' + (error.code || error.message) });
    }
});

// --- Cleanup Routine (GDPR/KVKK Compliance) ---
function cleanupOldFiles() {
    const dir = path.join(uploadBaseDir, 'uploads', 'cvs');
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);
    const now = Date.now();
    const expiry = 15 * 24 * 60 * 60 * 1000; // 15 gün

    let count = 0;
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > expiry) {
            fs.unlinkSync(filePath);
            count++;
        }
    });
    if (count > 0) console.log(`🧹 KVKK Veri Minimizasyonu: ${count} adet eski ham CV dosyası diskten silindi. (İletişim kayıtları korunuyor)`);
}

// --- Google API Endpoints ---
app.post('/api/google/send-email', async (req, res) => {
    const { token, to, subject, body } = req.body;
    if (!token || !to) return res.status(400).json({ success: false, error: 'Token and recipient are required.' });

    try {
        // Construct the RFC2822 message
        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        const str = [
            `To: ${to}`,
            `Subject: ${utf8Subject}`,
            'Content-Type: text/plain; charset=utf-8',
            'MIME-Version: 1.0',
            '',
            body
        ].join('\r\n');

        const encodedMail = Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ raw: encodedMail })
        });

        const data = await response.json();
        if (data.id) return res.json({ success: true, messageId: data.id });
        res.status(response.status).json({ success: false, error: data.error?.message || 'Gmail Send Error' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/google/check-messages', async (req, res) => {
    const { token, q } = req.query;
    if (!token || !q) return res.status(400).json({ success: false, error: 'Token and query are required.' });

    try {
        // 1. Search for messages
        const searchResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=1`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const searchData = await searchResponse.json();

        if (!searchData.messages || searchData.messages.length === 0) {
            return res.json({ success: true, found: false });
        }

        // 2. Get the latest message content
        const msgId = searchData.messages[0].id;
        const msgResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const msgData = await msgResponse.json();

        // Extract body (this is a bit simplified, but works for plain/html text)
        let body = "";
        if (msgData.payload.parts) {
            const part = msgData.payload.parts.find(p => p.mimeType === 'text/plain') || msgData.payload.parts[0];
            if (part && part.body && part.body.data) {
                body = Buffer.from(part.body.data, 'base64').toString('utf-8');
            }
        } else if (msgData.payload.body && msgData.payload.body.data) {
            body = Buffer.from(msgData.payload.body.data, 'base64').toString('utf-8');
        }

        const snippet = msgData.snippet;
        const fromHeader = msgData.payload.headers.find(h => h.name === 'From')?.value;
        const dateHeader = msgData.payload.headers.find(h => h.name === 'Date')?.value;

        res.json({
            success: true,
            found: true,
            message: {
                id: msgId,
                snippet,
                body,
                from: fromHeader,
                date: dateHeader
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/google/create-calendar-event', async (req, res) => {
    const { token, summary, description, startDateTime, endDateTime, location, guestEmail } = req.body;
    if (!token || !summary || !startDateTime) return res.status(400).json({ success: false, error: 'Missing parameters.' });

    try {
        const event = {
            summary,
            description,
            location,
            start: { dateTime: startDateTime },
            end: { dateTime: endDateTime },
            attendees: guestEmail ? [{ email: guestEmail }] : [],
            conferenceData: {
                createRequest: {
                    requestId: `tf-${Date.now()}`,
                    conferenceSolutionKey: { type: 'hangoutsMeet' }
                }
            }
        };

        const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(event)
        });

        const data = await response.json();
        if (data.id) return res.json({ success: true, eventId: data.id, htmlLink: data.htmlLink, meetLink: data.hangoutLink });
        res.status(response.status).json({ success: false, error: data.error?.message || 'Calendar Create Error' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/session/:sessionId - Public endpoint for candidates to poll session status
app.get('/api/session/:sessionId', sessionLimiter, async (req, res) => {
    const { sessionId } = req.params;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    try {
        // Session IDs are now cryptographically random UUIDs (iv-<uuid>), so we
        // can't extract a candidateId prefix.  Full scan is required; the rate
        // limiter (sessionLimiter) keeps this from being abused.
        const snapshot = await db.collection('artifacts/talent-flow/public/data/candidates').get();
        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const session = (data.interviewSessions || []).find(s => s.id === sessionId);
            if (session) {
                const visibleQuestions = (session.questions || []).filter(q => q.visibleToCandidate);
                console.log(`[GET /api/session] Found session ${sessionId} — ${visibleQuestions.length} visible question(s), status: ${session.candidateStatus}`);
                return res.json({
                    found: true,
                    candidateId: docSnap.id,
                    candidateName: data.name,
                    status: session.status,
                    candidateStatus: session.candidateStatus,
                    recruiterPresence: session.recruiterPresence,
                    lastActive: session.lastActive,
                    questions: visibleQuestions,
                    currentQuestionIndex: session.currentQuestionIndex,
                });
            }
        }
        return res.status(404).json({ found: false, error: 'Seans bulunamadı.' });
    } catch (err) {
        console.error('GET /api/session error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Fields the CANDIDATE side is permitted to write — everything else is recruiter-only.
// This prevents a tampered client from inflating AI scores or clearing session data.
const CANDIDATE_ALLOWED_FIELDS = new Set([
    'candidateStatus',      // lobby state (waiting, ready, left)
    'candidateConnected',   // WebRTC readiness flag
    'candidatePresence',    // heartbeat timestamp
    'lastActive',           // ISO timestamp
    'hasConsent',           // KVKK flag set by candidate UI
]);

// ─────────────────────────────────────────────────────────────
// INTERVIEW SESSION INITIALIZER
// Creates the /interviews/{sessionId} document via Admin SDK so
// clients only need UPDATE permission for all subsequent writes.
// This bypasses the allow create: if false rule that intentionally
// blocks direct client creation.
// ─────────────────────────────────────────────────────────────
app.post('/api/init-interview-session', sessionLimiter, async (req, res) => {
    const { sessionId, initialData } = req.body;
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.startsWith('iv-')) {
        return res.status(400).json({ error: 'Invalid sessionId.' });
    }
    if (initialData && typeof initialData !== 'object') {
        return res.status(400).json({ error: 'initialData must be an object.' });
    }
    try {
        const sessionRef = db.doc(`interviews/${sessionId}`);
        const snap = await sessionRef.get();
        if (!snap.exists) {
            await sessionRef.set({ sessionId, createdAt: new Date().toISOString(), ...(initialData || {}) });
            console.log(`[init-interview-session] Created /interviews/${sessionId}`);
        } else {
            // Doc already exists — merge the initialData if provided
            if (initialData && Object.keys(initialData).length > 0) {
                await sessionRef.set(initialData, { merge: true });
            }
            console.log(`[init-interview-session] /interviews/${sessionId} already exists.`);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('[init-interview-session] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/update-candidate-status', sessionLimiter, async (req, res) => {
    const { sessionId, candidateId, updates } = req.body;
    if (!sessionId || !candidateId || !updates || typeof updates !== 'object') {
        return res.status(400).json({ error: "Missing required fields." });
    }

    // ── Field whitelist: strip any keys the candidate should never touch ──
    const safeUpdates = {};
    for (const key of Object.keys(updates)) {
        if (CANDIDATE_ALLOWED_FIELDS.has(key)) {
            safeUpdates[key] = updates[key];
        } else {
            console.warn(`[update-candidate-status] Blocked field "${key}" from session ${sessionId}`);
        }
    }
    if (Object.keys(safeUpdates).length === 0) {
        return res.status(400).json({ error: "No permitted fields to update." });
    }

    try {
        const candidateRef = db.doc(`artifacts/talent-flow/public/data/candidates/${candidateId}`);
        await db.runTransaction(async (t) => {
            const doc = await t.get(candidateRef);
            if (!doc.exists) throw new Error("Candidate not found.");

            const data = doc.data();
            const sessions = data.interviewSessions || [];

            // ── Ownership check: session must belong to this candidateId ──
            const sessionExists = sessions.some(s => s.id === sessionId);
            if (!sessionExists) throw new Error("Session not found for this candidate.");

            const newSessions = sessions.map(session =>
                session.id === sessionId ? { ...session, ...safeUpdates } : session
            );
            t.update(candidateRef, { interviewSessions: newSessions });
        });

        res.json({ success: true });
    } catch (error) {
        console.error("Failed to update candidate session via proxy:", error);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────
// PUBLIC JOB APPLICATION SYSTEM
// Uses Firestore REST API so no Admin SDK credentials needed
// ─────────────────────────────────────────────────────────────
const FS_PROJECT = process.env.VITE_FIREBASE_PROJECT_ID;
const FS_API_KEY = process.env.VITE_FIREBASE_API_KEY;
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FS_PROJECT}/databases/(default)/documents`;

function fsVal(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return { integerValue: String(Math.round(v)) };
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(fsVal) } };
    if (typeof v === 'object') {
        const fields = {};
        for (const [k, val] of Object.entries(v)) fields[k] = fsVal(val);
        return { mapValue: { fields } };
    }
    return { stringValue: String(v) };
}

function fsToJs(fields) {
    if (!fields) return {};
    const out = {};
    for (const [k, v] of Object.entries(fields)) {
        if ('stringValue' in v) out[k] = v.stringValue;
        else if ('integerValue' in v) out[k] = Number(v.integerValue);
        else if ('doubleValue' in v) out[k] = v.doubleValue;
        else if ('booleanValue' in v) out[k] = v.booleanValue;
        else if ('nullValue' in v) out[k] = null;
        else if ('arrayValue' in v) out[k] = (v.arrayValue.values || []).map(i => fsToJs(i.mapValue?.fields || { _: i }));
        else if ('mapValue' in v) out[k] = fsToJs(v.mapValue.fields);
        else out[k] = null;
    }
    return out;
}

// GET /api/positions/:positionId — fetch position for public apply form
app.get('/api/positions/:positionId', async (req, res) => {
    try {
        const url = `${FS_BASE}/artifacts%2Ftalent-flow%2Fpublic%2Fdata%2Fpositions/${req.params.positionId}?key=${FS_API_KEY}`;
        const r = await fetch(url);
        if (r.status === 404) return res.status(404).json({ error: 'Pozisyon bulunamadı.' });
        if (!r.ok) {
            const errBody = await r.text();
            console.error('Firestore GET position error:', r.status, errBody);
            return res.status(500).json({ error: 'Pozisyon yüklenirken hata oluştu.' });
        }
        const doc = await r.json();
        const data = fsToJs(doc.fields || {});
        if (data.status !== 'open') return res.status(403).json({ error: 'Bu pozisyon şu an başvuruya kapalı.' });
        res.json({ id: req.params.positionId, ...data });
    } catch (err) {
        console.error('GET /api/positions/:id error:', err);
        res.status(500).json({ error: 'Pozisyon yüklenirken hata oluştu.' });
    }
});

// POST /api/applications — save a job application (public, no auth required)
app.post('/api/applications', async (req, res) => {
    try {
        const {
            positionId, positionTitle,
            name, email, phone, linkedin,
            cvText, cvFileName,
            source,
            parsedCandidate, aiScore, aiScoreBreakdown, aiSummary,
        } = req.body;
        if (!positionId || !name || !email || !phone) {
            return res.status(400).json({ error: 'Zorunlu alanlar eksik.' });
        }
        const fields = {
            positionId: fsVal(positionId),
            positionTitle: fsVal(positionTitle || ''),
            name: fsVal(String(name).trim()),
            email: fsVal(String(email).trim().toLowerCase()),
            phone: fsVal(String(phone).trim()),
            linkedin: fsVal(String(linkedin || '').trim()),
            cvFileName: fsVal(cvFileName || ''),
            cvText: fsVal(cvText ? String(cvText).slice(0, 6000) : ''),
            source: fsVal(source || 'Direkt'),
            aiScore: fsVal(aiScore || 0),
            aiSummary: fsVal(aiSummary || ''),
            status: fsVal('new'),
            kvkkConsent: fsVal(true),
        };
        if (parsedCandidate) fields.parsedCandidate = fsVal(parsedCandidate);
        if (aiScoreBreakdown) fields.aiScoreBreakdown = fsVal(aiScoreBreakdown);

        const url = `${FS_BASE}/artifacts%2Ftalent-flow%2Fpublic%2Fdata%2Fapplications?key=${FS_API_KEY}`;
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields }),
        });
        if (!r.ok) {
            const errBody = await r.text();
            console.error('Firestore POST application error:', r.status, errBody);
            return res.status(500).json({ error: 'Başvuru kaydedilemedi.' });
        }
        const doc = await r.json();
        const id = doc.name?.split('/').pop();
        res.json({ id });
    } catch (err) {
        console.error('POST /api/applications error:', err);
        res.status(500).json({ error: 'Başvuru kaydedilemedi.' });
    }
});

// ─── AI Generate Proxy ──────────────────────────────────────────────────────
// Routes ALL Gemini calls through the backend so VITE_GEMINI_API_KEY never
// reaches the browser bundle. Rate-limited to 20 req/min via aiLimiter.
app.post('/api/ai/generate', aiLimiter, async (req, res) => {
    const { prompt, modelId = 'gemini-2.0-flash' } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'prompt is required' });
    }

    const apiKey = await getApiKey();
    if (!apiKey) {
        return res.status(503).json({ error: 'AI service unavailable — API key missing' });
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: modelId,
            generationConfig: {
                temperature: 0,
                topP: 0,
                topK: 1,
                maxOutputTokens: 2048,
                responseMimeType: 'application/json',
            },
        });
        const result = await model.generateContent(prompt);
        res.json({ text: result.response.text() });
    } catch (err) {
        console.error('AI Generate Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── STT + Emotion Analysis Proxy ───────────────────────────────────────────
// Accepts raw base64 audio from LiveInterviewPage and returns transcript +
// emotion scores.  Gemini API key NEVER leaves the server.
app.post('/api/ai/stt', aiLimiter, async (req, res) => {
    const { audio, mimeType = 'audio/webm' } = req.body || {};
    if (!audio || typeof audio !== 'string') {
        return res.status(400).json({ error: 'audio (base64) is required' });
    }

    const apiKey = await getApiKey();
    if (!apiKey) return res.status(503).json({ error: 'AI service unavailable' });

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const result = await model.generateContent([
            { inlineData: { data: audio, mimeType } },
            `Bu ses dosyasını analiz et. YALNIZCA aşağıdaki JSON formatında yanıt döndür, başka hiçbir şey yazma:\n{"text":"türkçe transkript metni","stress":30,"excitement":70,"confidence":60,"hesitation":20}\nKurallar:\n- text: konuşulan Türkçe sözcükler. Konuşma yoksa boş string.\n- stress/excitement/confidence/hesitation: 0-100 tam sayı.\n- 'Sessizlik', 'Ses yok', 'Boş' gibi ifadeler text alanına YAZMA.`
        ]);
        res.json({ text: result.response.text() });
    } catch (err) {
        console.error('STT Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── Server-side Duplicate Candidate Check ──────────────────────────────────
// Checks Firestore directly — catches duplicates even when client cache is stale
// or two users submit simultaneously. Fails open (isDuplicate: false) on error.
app.post('/api/check-duplicate', async (req, res) => {
    try {
        const norm = (s) => (s || '').trim().toLowerCase().replace(/[\s\-().+]/g, '');
        const email = norm(req.body?.email);
        const phone = norm(req.body?.phone);

        if (!email && !phone) return res.json({ isDuplicate: false });

        const candidatesRef = db.collection('artifacts/talent-flow/public/data/candidates');
        let existing = null;
        let foundBy = null;

        if (email) {
            const snap = await candidatesRef
                .where('email', '==', email)
                .limit(1)
                .get();
            if (!snap.empty) {
                existing = { id: snap.docs[0].id, ...snap.docs[0].data() };
                foundBy = 'email';
            }
        }

        if (!existing && phone) {
            const snap = await candidatesRef
                .where('phone', '==', phone)
                .limit(1)
                .get();
            if (!snap.empty) {
                existing = { id: snap.docs[0].id, ...snap.docs[0].data() };
                foundBy = 'phone';
            }
        }

        res.json({
            isDuplicate: !!existing,
            foundBy,
            existingName: existing?.name || null,
        });
    } catch (err) {
        console.error('Duplicate check error:', err.message);
        res.json({ isDuplicate: false }); // fail open — never block the user
    }
});

// GET /api/users — List platform users for participant selection in interview wizard
app.get('/api/users', async (req, res) => {
    try {
        const usersRef = db.collection('artifacts/talent-flow/public/data/users');
        const snapshot = await usersRef.get();
        const users = snapshot.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                displayName: data.displayName || data.name || data.email || 'Kullanıcı',
                email: data.email || null,
                role: data.role || 'unknown',
                departments: data.departments || [],
                photoURL: data.photoURL || null,
                googleConnected: !!(data.integrations?.google?.connected),
            };
        });
        res.json({ users });
    } catch (err) {
        console.error('[API /api/users] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/users/availability — Check Google Calendar free/busy for multiple platform users
app.post('/api/users/availability', async (req, res) => {
    const { userIds, date, time } = req.body;
    if (!Array.isArray(userIds) || !date || !time) {
        return res.status(400).json({ error: 'userIds[], date, and time are required.' });
    }
    const slotStartMs = new Date(`${date}T${time}:00`).getTime();
    if (isNaN(slotStartMs)) return res.status(400).json({ error: 'Invalid date/time format.' });
    const slotStart = new Date(slotStartMs).toISOString();
    const slotEnd = new Date(slotStartMs + 60 * 60 * 1000).toISOString();

    const results = {};
    await Promise.all(userIds.map(async (uid) => {
        try {
            const userDoc = await db.doc(`artifacts/talent-flow/public/data/users/${uid}`).get();
            if (!userDoc.exists) { results[uid] = 'unknown'; return; }
            const googleIntegration = userDoc.data()?.integrations?.google;
            if (!googleIntegration?.connected || !googleIntegration?.accessToken) { results[uid] = 'unknown'; return; }
            const resp = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${googleIntegration.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ timeMin: slotStart, timeMax: slotEnd, items: [{ id: 'primary' }] })
            });
            if (!resp.ok) { results[uid] = 'unknown'; return; }
            const fbData = await resp.json();
            const busy = fbData.calendars?.primary?.busy || [];
            results[uid] = busy.length > 0 ? 'busy' : 'available';
        } catch (err) {
            console.warn(`[Availability] uid=${uid}:`, err.message);
            results[uid] = 'unknown';
        }
    }));
    res.json({ availability: results });
});

const PORT = process.env.PORT || 3001;

// Only listen if this is the main module
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Backend Server running on http://localhost:${PORT}`);
        console.log(`📡 Health: http://localhost:${PORT}/api/health`);
        cleanupOldFiles();
    });
}

export default app;
