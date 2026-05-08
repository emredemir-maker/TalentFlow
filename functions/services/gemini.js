// Gemini API access layer.
//
//   getApiKeyDetailed() — { key, source } where source is 'firestore' | 'env' | 'none'.
//                         Firestore-saved key (Settings → API) takes priority over env so
//                         the env var can be rotated without losing service. We deliberately
//                         do NOT expose key length, suffix, or raw firestore error detail
//                         to callers — those leaked through logs and HTTP error bodies in
//                         the past (audit finding C5).
//
//   getApiKey()         — convenience wrapper that returns just the key string (or null).
//
//   generateText(prompt, options?) — single funnel for every Gemini text-generation call.
//                         Adds two cross-cutting concerns the inline call sites kept
//                         re-implementing (or skipping):
//                           - Retry on transient errors (429 / RESOURCE_EXHAUSTED / 503 /
//                             UNAVAILABLE / overloaded) with exponential backoff + jitter.
//                           - In-memory LRU-ish cache keyed on SHA256(modelId + prompt +
//                             generation options), TTL 1h. Aynı CV / aynı pozisyon eşlemesi
//                             tekrar tekrar Gemini'a gönderilmek zorunda kalmaz.
//                         options: { modelId?, generationConfig?, useCache? } — useCache
//                         defaults to true for non-streaming text and is opt-out (stt-style
//                         audio inputs that always vary should pass useCache: false).
//
//   parseProfile(text)  — runs a LinkedIn-profile-to-structured-JSON prompt against Gemini
//                         and returns a parsed object, or null on any failure. Now goes
//                         through generateText() so it gets retry + cache for free.
//                         Returns Turkish output regardless of input language.
import crypto from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../config/firebaseAdmin.js';

// In-memory cache. Bounded by MAX_CACHE_ENTRIES with FIFO eviction so a long-
// running Cloud Functions instance doesn't accumulate unbounded state. Each
// entry has its own expiresAt — checked lazily on read.
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_ENTRIES = 200;
const cache = new Map();

function cacheKey(prompt, modelId, generationConfig) {
    const h = crypto.createHash('sha256');
    h.update(modelId);
    h.update('\0');
    h.update(typeof prompt === 'string' ? prompt : JSON.stringify(prompt));
    if (generationConfig) {
        h.update('\0');
        h.update(JSON.stringify(generationConfig));
    }
    return h.digest('hex');
}

function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
    }
    // Move to the end so FIFO eviction approximates LRU
    cache.delete(key);
    cache.set(key, entry);
    return entry.value;
}

function cacheSet(key, value) {
    if (cache.size >= MAX_CACHE_ENTRIES) {
        // Evict the oldest entry (first inserted) — Map preserves insertion order
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
    }
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function getApiKeyDetailed() {
    // 1. Firestore (admin saved via Settings → API & Ses Motoru)
    try {
        const settingsDoc = await db.doc('artifacts/talent-flow/public/data/settings/api_keys').get();
        if (settingsDoc.exists) {
            const raw = settingsDoc.data()?.gemini;
            if (raw && String(raw).length > 5) {
                console.log('[gemini] key loaded from firestore');
                return { key: String(raw).trim(), source: 'firestore' };
            }
        }
    } catch {
        console.warn('[gemini] firestore key lookup failed; falling back to env');
    }

    // 2. Fallback to env
    const envKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (envKey && envKey.trim() !== '' && envKey !== 'null' && envKey !== 'undefined') {
        console.log('[gemini] key loaded from env');
        return { key: envKey.trim(), source: 'env' };
    }

    console.warn('[gemini] no API key configured (firestore and env both empty)');
    return { key: null, source: 'none' };
}

export async function getApiKey() {
    const info = await getApiKeyDetailed();
    return info.key;
}

const TRANSIENT_ERR = /429|RESOURCE_EXHAUSTED|quota|503|UNAVAILABLE|overloaded/i;
const MAX_RETRIES = 4;

/**
 * Single funnel for every Gemini text-generation call.
 * @param {string|Array} prompt — plain string or @google/generative-ai content array
 * @param {object} [options]
 * @param {string} [options.modelId='gemini-2.5-flash']
 * @param {object} [options.generationConfig] — passed through to getGenerativeModel
 * @param {boolean} [options.useCache=true] — disable for inputs that always differ (audio)
 * @returns {Promise<string>} — the response text (caller parses JSON if needed)
 * @throws if no API key is configured or if all retries are exhausted
 */
export async function generateText(prompt, options = {}) {
    const { modelId = 'gemini-2.5-flash', generationConfig, useCache = true } = options;

    const key = useCache ? cacheKey(prompt, modelId, generationConfig) : null;
    if (key) {
        const cached = cacheGet(key);
        if (cached !== null) {
            console.log('[gemini] cache hit');
            return cached;
        }
    }

    const apiKey = await getApiKey();
    if (!apiKey) throw new Error('AI service unavailable — API key missing');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: modelId,
        ...(generationConfig ? { generationConfig } : {}),
    });

    let lastErr = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            if (key) cacheSet(key, text);
            return text;
        } catch (err) {
            lastErr = err;
            const msg = err.message || '';
            if (!TRANSIENT_ERR.test(msg) || attempt === MAX_RETRIES) break;
            const backoffMs = Math.min(1000 * Math.pow(2, attempt), 16000) + Math.floor(Math.random() * 500);
            console.warn(`[gemini] transient (attempt ${attempt + 1}/${MAX_RETRIES + 1}), backoff ${backoffMs}ms: ${msg.slice(0, 120)}`);
            await new Promise(r => setTimeout(r, backoffMs));
        }
    }
    throw lastErr;
}

export async function parseProfile(text, modelId = 'gemini-2.5-flash') {
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
        console.log(`🤖 Using Gemini (${modelId}) to parse profile...`);
        const responseText = (await generateText(prompt, { modelId }))
            .replace(/```json/g, '').replace(/```/g, '').trim();
        const json = JSON.parse(responseText);
        console.log(`✅ Parsed: ${json.name}`);
        return json;
    } catch (e) {
        console.error('Gemini Parse Error:', e.message);
        return null;
    }
}
