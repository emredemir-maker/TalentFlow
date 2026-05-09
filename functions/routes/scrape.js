// LinkedIn scraper — runs puppeteer against Google/Bing/LinkedIn search to
// find candidate profiles, then proxies the page text through Gemini for
// structured extraction.
//
// Two paths:
//   1. URL form  — when q starts with http(s)://, the SSRF guard
//                  (services/scrape.isSafeLinkedInUrl) gates the request and,
//                  if it passes, handleDirectUrl visits that single profile.
//   2. Query form — anything else is treated as a search keyword string and
//                   tried against multiple engines until enough profiles are
//                   collected.
//
// Visual mode (?visual=true) launches a non-headless browser with extra wait
// times so the operator can solve CAPTCHAs / log into LinkedIn manually.
import { Router } from 'express';
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

import { aiLimiter } from '../middleware/rateLimit.js';
import { isSafeLinkedInUrl } from '../services/scrape.js';
import { parseProfile, getApiKey } from '../services/gemini.js';
import { childLogger } from '../services/logger.js';
const log = childLogger('scrape');

const __filename = fileURLToPath(import.meta.url);
// Chrome user-data lives at the repo root, not inside functions/routes/.
// Three .. hops: routes/scrape.js -> routes/ -> functions/ -> repo root.
const __dirname = path.dirname(__filename);
const sessionPath = path.resolve(__dirname, '..', '..', 'chrome-session');

const router = Router();

router.get('/api/scrape', aiLimiter, async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Query parameter "q" is required.' });

    log.info(`🔍 Received Request: "${query}"`);
    const isVisual = req.query.visual === 'true';

    // If the query parses as a URL, only allow https://*.linkedin.com hostnames.
    // Anything that looks URL-ish but is not a safe LinkedIn URL is rejected to
    // prevent SSRF (e.g., http://169.254.169.254, http://localhost, raw IPs).
    if (/^https?:\/\//i.test(query)) {
        if (!isSafeLinkedInUrl(query)) {
            return res.status(400).json({ error: 'Yalnızca https LinkedIn URL\'lerine izin verilir.' });
        }
        log.info('🔗 Direct URL detected. Jumping straight to profile...');
        return await handleDirectUrl(query, res, isVisual);
    }

    const MAX_RESULTS = isVisual ? 8 : 3;
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
        log.info(`🌐 Launching browser (Visual: ${isVisual}, Profile: ${sessionPath})...`);

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

        log.info(`🔎 Searching across engines for "${query}"...`);
        let scrapedData = [];
        let seenUrls = new Set();

        for (const url of SEARCH_URLS) {
            if (scrapedData.length >= 5) break;

            log.info(`📡 Trying engine: ${url}`);
            try {
                // Use a more relaxed waitUntil to avoid 'blank page' issues with slow trackers
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

                // Extra wait for dynamic content
                await new Promise(r => setTimeout(r, 2000));

                // If page seems blank or loading failed, try one more wait
                const isBlank = await page.evaluate(() => document.body.innerText.length < 100);
                if (isBlank) {
                    log.info('⚠️ Page looks empty, waiting longer for dynamic content...');
                    await new Promise(r => setTimeout(r, 5000));
                }

                // If we are directly on LinkedIn, wait for results to load
                if (url.includes('linkedin.com/search')) {
                    log.info('⏳ Waiting for LinkedIn search results UI...');
                    await page.waitForSelector('.reusable-search__result-container, .artdeco-list__item, .entity-result', { timeout: 15000 }).catch(() => {
                        log.info('Timeout waiting for LinkedIn results, proceeding with current content.');
                    });
                }

                await new Promise(r => setTimeout(r, isVisual ? 4000 : 2000));

                // Check for block/captcha
                const pageBody = await page.evaluate(() => document.body.innerText.toLowerCase());
                if (pageBody.includes('security check') || pageBody.includes('not a robot') || pageBody.includes('captcha')) {
                    log.warn(`🛑 CAPTCHA detected on: ${url.split('/')[2]}`);
                    if (isVisual) {
                        log.info('👀 Visual Mode: Waiting 30 seconds for manual resolution...');
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

                log.info(`✅ Engine ${url.split('/')[2]} found ${itemsFromPage.length} potential items.`);

                for (const item of itemsFromPage) {
                    if (scrapedData.length >= MAX_RESULTS) break;
                    if (seenUrls.has(item.url)) continue;
                    seenUrls.add(item.url);

                    log.info(`🚀 Processing candidate: ${item.name}`);
                    let profileText = `TITLE: ${item.rawTitle}\nSNIPPET: ${item.rawSnippet}`;
                    let extractionMethod = 'snippet';

                    if (isVisual && (item.url.includes('/in/') || item.url.includes('/sales/profile/'))) {
                        log.info(`🔍 Visiting profile: ${item.url}`);
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
                                log.info(`📄 Detail Page captured (${fullText.length} chars)`);
                                profileText = fullText;
                                extractionMethod = 'full-page';
                            } else {
                                log.info(`⚠️ Profile hidden or restricted. Using snippet as fallback.`);
                            }
                            await detailPage.close();
                        } catch (detailErr) {
                            log.warn(`⚠️ Detail visit failed: ${item.url}. Error: ${detailErr.message}`);
                        }
                    }

                    log.info(`🤖 Gemini Parsing (${extractionMethod}): ${item.name}...`);
                    let refined = await parseProfile(profileText, 'gemini-2.5-flash');

                    // Final Fallback: If full-page parse failed, try snippet one last time
                    if (!refined && extractionMethod === 'full-page') {
                        log.info('🔄 Full-page parse failed. Retrying with original snippet...');
                        profileText = `TITLE: ${item.rawTitle}\nSNIPPET: ${item.rawSnippet}`;
                        refined = await parseProfile(profileText, 'gemini-2.5-flash');
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
                        log.info(`✅ Candidate Added: ${finalCandidate.name}`);
                    } else {
                        log.warn(`❌ No data extracted for: ${item.name}`);
                    }
                }

                // If we found results on LinkedIn (first engine), no need to check Google/Bing
                if (scrapedData.length > 0) {
                    log.info('✨ Found enough candidates on LinkedIn. Skipping other engines.');
                    break;
                }
            } catch (e) {
                log.warn(`⚠️ Engine failed: ${url.split('/')[2]}`, e.message);
            }
        }

        if (scrapedData.length === 0 && isVisual) {
            log.info('⚠️ No profiles found in Visual Mode. Keeping browser open for 15s for inspection...');
            await new Promise(r => setTimeout(r, 15000));
        }

        await browser.close();
        log.info(`🎉 Scraping session finished. Total: ${scrapedData.length}`);
        res.json({ candidates: scrapedData, message: `Successfully found ${scrapedData.length} profiles from deep search.` });

    } catch (error) {
        log.error('💥 Critical Server Scrape Error:', error);
        if (browser) try { await browser.close(); } catch (e) { }
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

// Direct-URL pipeline (used when caller already has a known LinkedIn profile URL).
async function handleDirectUrl(url, res, isVisual = false) {
    let browser;
    try {
        log.info(`🌐 Launching browser for direct URL (Visual: ${isVisual}, Profile: ${sessionPath})...`);

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

        log.info(`🚀 Visiting direct URL: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Special case for Login/Setup
        if (url.includes('login') || url.includes('linkedin.com') && !url.includes('/in/') && !url.includes('/sales/')) {
            log.info('🔑 Setup mode detected. Waiting for user to complete login...');
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
            log.warn('❌ LinkedIn block detected on direct visit.');
            await browser.close();
            return res.json({ candidates: [], message: 'LinkedIn bu sayfayı görmemizi engelledi (Giriş duvarı). Lütfen "Tarayıcıda Oturumu Hazırla" butonunu kullanarak giriş yapın.' });
        }

        const apiKey = await getApiKey();
        const candidate = apiKey ? await parseProfile(bodyText, 'gemini-pro') : null;
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
        log.error('💥 Direct URL Error:', e.message);
        if (browser) await browser.close();
        res.status(500).json({ error: e.message });
    }
}

export default router;
