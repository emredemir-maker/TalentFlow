/**
 * AI config — client-side facade.
 *
 * ALL Gemini calls are proxied through the backend (/api/ai/generate) so the
 * API key NEVER reaches the browser bundle.  The returned "model" object
 * matches the @google/generative-ai interface that callers already use:
 *
 *   const model = await getModel(modelId);
 *   const result = await model.generateContent(prompt);
 *   const text = result.response.text();
 *
 * Rate-limiting and cost control are enforced by the backend's aiLimiter
 * (20 req / min), so there is no need for a separate client-side queue.
 */

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Returns a lightweight proxy object that forwards generateContent() calls
 * to the backend /api/ai/generate endpoint.
 *
 * generateContent accepts an optional `options` arg so callers that need
 * a higher token cap (e.g. CV parsing on very long resumes) or plain-text
 * output can opt in:
 *
 *   model.generateContent(prompt)
 *   model.generateContent(prompt, { maxOutputTokens: 32768 })
 *   model.generateContent(prompt, { mimeType: 'text/plain' })
 *
 * Backend clamps maxOutputTokens to [512, 32768]; values above that are
 * silently capped, values below default to 8192.
 */
export async function getModel(modelId = DEFAULT_GEMINI_MODEL) {
    return {
        generateContent: async (prompt, options = {}) => {
            const body = { prompt, modelId };
            if (options.maxOutputTokens != null) body.maxOutputTokens = options.maxOutputTokens;
            if (options.mimeType) body.mimeType = options.mimeType;

            const res = await fetch('/api/ai/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `AI isteği başarısız: ${res.status}`);
            }

            const { text } = await res.json();
            // Mimic the @google/generative-ai response shape
            return { response: { text: () => text } };
        },
    };
}

/**
 * Returns the admin-saved Gemini API key from Firestore (Settings → API).
 * Used by SettingsPage to populate the input so the admin can see whether
 * a key is currently saved and edit/replace it.  AI features themselves
 * never use this — they all go through /api/ai/generate, which fetches
 * the key on the server.
 *
 * Returns null if no key is saved or read fails (e.g., user not logged in).
 */
export async function getGlobalGeminiKey() {
    try {
        const { db } = await import('../../config/firebase');
        const { doc, getDoc } = await import('firebase/firestore');
        const snap = await getDoc(doc(db, 'artifacts/talent-flow/public/data/settings', 'api_keys'));
        if (snap.exists()) {
            const k = snap.data()?.gemini;
            if (k && typeof k === 'string') return k;
        }
    } catch (_err) {
        // Silent fail — input simply stays empty
    }
    return null;
}
