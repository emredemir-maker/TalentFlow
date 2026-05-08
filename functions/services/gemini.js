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
//   parseProfile(text)  — runs a LinkedIn-profile-to-structured-JSON prompt against Gemini
//                         and returns a parsed object, or null on any failure. Returns
//                         Turkish output regardless of input language.
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../config/firebaseAdmin.js';

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

export async function parseProfile(text, modelId = 'gemini-2.5-flash') {
    const apiKey = await getApiKey();
    if (!apiKey) {
        console.error('Gemini Parse Error: API Key missing');
        return null;
    }

    console.log(`🤖 Using model: ${modelId} for parsing...`);
    const genAI = new GoogleGenerativeAI(apiKey);
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
        const model = genAI.getGenerativeModel({ model: modelId });
        const result = await model.generateContent(prompt);
        let responseText = result.response.text();

        // Clean markdown code blocks if present
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

        const json = JSON.parse(responseText);
        console.log(`✅ Parsed: ${json.name}`);
        return json;
    } catch (e) {
        console.error('Gemini Parse Error:', e.message);
        return null;
    }
}
