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
import { buildStructuredPrompt } from './promptGuard.js';
import { childLogger } from './logger.js';

const log = childLogger('gemini');

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
                log.info('key loaded from firestore');
                return { key: String(raw).trim(), source: 'firestore' };
            }
        }
    } catch {
        log.warn('firestore key lookup failed; falling back to env');
    }

    // 2. Fallback to env
    const envKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (envKey && envKey.trim() !== '' && envKey !== 'null' && envKey !== 'undefined') {
        log.info('key loaded from env');
        return { key: envKey.trim(), source: 'env' };
    }

    log.warn('no API key configured (firestore and env both empty)');
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
            log.debug('cache hit');
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
            log.warn(
                { attempt: attempt + 1, maxAttempts: MAX_RETRIES + 1, backoffMs, error: msg.slice(0, 120) },
                'transient gemini error, retrying'
            );
            await new Promise(r => setTimeout(r, backoffMs));
        }
    }
    throw lastErr;
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUNDED ANSWERS — Gemini + Google Search
//
// generateText() answers from the model's memory: plausible, undated, and
// unciteable. For "what is CAC" or "what does the EU AI Act require" that is
// not good enough — a hiring decision needs a claim you can trace.
//
// Grounding runs a real Google Search and returns the sources it used. The
// caller gets them back and MUST display them.
//
// GOOGLE'S DISPLAY REQUIREMENT: when Grounding with Google Search is used,
// the Search Suggestions block (groundingMetadata.searchEntryPoint) has to be
// shown to the end user as-is. It is not optional decoration; it is a term of
// use. We return it verbatim so the UI can render it.
//
// TOOL NAME COMPATIBILITY: Gemini 2.x expects `google_search`; the 1.5-era
// name was `google_search_retrieval` and this SDK (0.24.x) still types only
// the old one. We try the new name first and fall back, because guessing
// wrong should degrade to an ungrounded answer — never break the feature.
const SEARCH_TOOLS = [
    [{ google_search: {} }],
    [{ googleSearchRetrieval: {} }],
];

/** Grounding metadata → the few fields the UI actually needs. */
function readGrounding(response) {
    const meta = response?.candidates?.[0]?.groundingMetadata;
    if (!meta) return { sources: [], searchSuggestionHtml: '' };

    const seen = new Set();
    const sources = [];
    for (const chunk of meta.groundingChunks || []) {
        const web = chunk?.web;
        if (!web?.uri || seen.has(web.uri)) continue;
        seen.add(web.uri);
        sources.push({ title: String(web.title || web.uri), uri: String(web.uri) });
    }
    return {
        sources: sources.slice(0, 8),
        searchSuggestionHtml: String(meta.searchEntryPoint?.renderedContent || ''),
    };
}

/**
 * Ask Gemini with Google Search grounding.
 *
 * Returns prose, not JSON: response schemas and search tools do not combine,
 * and a cited answer is worth more here than a parseable one.
 *
 * @returns {Promise<{text: string, sources: Array, searchSuggestionHtml: string, grounded: boolean}>}
 *   grounded=false means the search tool was unavailable and this is the
 *   model's own recollection — the UI has to say so.
 */
export async function generateGrounded(prompt, options = {}) {
    const { modelId = 'gemini-2.5-flash', maxOutputTokens = 1024, useCache = true } = options;

    const key = useCache ? cacheKey(('grounded-search:' + prompt), modelId, { maxOutputTokens }) : null;
    if (key) {
        const cached = cacheGet(key);
        if (cached !== null) {
            log.debug('grounded cache hit');
            return cached;
        }
    }

    const apiKey = await getApiKey();
    if (!apiKey) throw new Error('AI service unavailable — API key missing');
    const genAI = new GoogleGenerativeAI(apiKey);

    let lastErr = null;
    for (const tools of SEARCH_TOOLS) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelId,
                tools,
                generationConfig: { temperature: 0.2, maxOutputTokens },
            });
            const result = await model.generateContent(prompt);
            const value = {
                text: result.response.text(),
                ...readGrounding(result.response),
                grounded: true,
            };
            if (key) cacheSet(key, value);
            return value;
        } catch (err) {
            lastErr = err;
            // Transient failures are not a tool-name problem; stop trying
            // alternatives and let the ungrounded fallback handle it.
            if (TRANSIENT_ERR.test(err?.message || '')) break;
            log.warn({ error: (err?.message || '').slice(0, 160) }, 'search tool rejected, trying next shape');
        }
    }

    // Son çare: aramasız cevap. Kullanıcıya "kaynaksız" olarak gösterilir —
    // sessizce kaynaklıymış gibi sunmak en kötüsü olurdu.
    log.warn({ error: (lastErr?.message || '').slice(0, 160) }, 'grounding unavailable, answering without search');
    const text = await generateText(prompt, {
        modelId,
        generationConfig: { temperature: 0.2, maxOutputTokens },
    });
    const value = { text, sources: [], searchSuggestionHtml: '', grounded: false };
    if (key) cacheSet(key, value);
    return value;
}

// CV parsing model — defaults to Gemini, but operators can flip to Gemma
// (or any other Google AI Studio model id) without redeploy by setting the
// CV_PARSING_MODEL env var. Per-call modelId still wins if explicitly
// passed. Evaluated per-call so a runtime env update takes effect on the
// next request without restart.
//
// Why CV parsing first:
//   - Highest-volume task (every uploaded CV)
//   - Text-in / JSON-out — no audio/multimodal Gemini lock-in
//   - parseProfile already returns null on failure → safe failure mode
//     during A/B testing (frontend handles null gracefully)
//   - Other tasks (STT, STAR analysis, screening) stay on Gemini until
//     this one's quality is validated in production.
export function getDefaultCvParsingModel() {
    return process.env.CV_PARSING_MODEL || 'gemini-2.5-flash';
}

export async function parseProfile(text, modelId) {
    const effectiveModelId = modelId || getDefaultCvParsingModel();
    // Profil metni güvenilmeyen girdidir (kazınmış sayfa / yüklenen CV) —
    // buildStructuredPrompt onu sınırlandırılmış veri bloğuna alır.
    const prompt = buildStructuredPrompt(
        `You are a strict JSON parser.
    Extract the following fields from the LinkedIn profile text in the PROFILE_TEXT block:
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

    Return ONLY raw JSON. No markdown.`,
        { PROFILE_TEXT: String(text ?? '').slice(0, 20000) }
    );

    try {
        log.info({ modelId: effectiveModelId }, '🤖 Parsing profile');
        const responseText = (await generateText(prompt, { modelId: effectiveModelId }))
            .replace(/```json/g, '').replace(/```/g, '').trim();
        const json = JSON.parse(responseText);
        log.info({ name: json.name, modelId: effectiveModelId }, '✅ Parsed profile');
        return json;
    } catch (e) {
        log.error({ err: e, modelId: effectiveModelId }, 'Profile parse error');
        return null;
    }
}
