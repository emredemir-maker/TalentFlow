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
/**
 * Backend AI uçları kimlik doğrulaması ister (anonim oturumlar dahil —
 * başvuru formu ve canlı mülakat adayı da Firebase anon oturumla gelir).
 * Token alınamazsa header gönderilmez ve sunucu 401 döner.
 */
import { fetchWithRetry } from './retry.js';

export async function getAuthHeaders() {
    try {
        const { auth } = await import('../../config/firebase');
        const token = await auth.currentUser?.getIdToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
        return {};
    }
}

export async function getModel(modelId = DEFAULT_GEMINI_MODEL) {
    return {
        generateContent: async (prompt, options = {}) => {
            const body = { prompt, modelId };
            if (options.maxOutputTokens != null) body.maxOutputTokens = options.maxOutputTokens;
            if (options.mimeType) body.mimeType = options.mimeType;

            // 502'yi Gemini degil, onundeki ag gecidi uretiyor: backend'in
            // kendi yeniden deneme dongusune istek hic ulasmiyor. Bu yuzden
            // tekrar deneme ISTEMCIDE olmak zorunda. Canlida 70 adaylik bir
            // taramada 3 aday bu yuzden sessizce atlanmisti.
            const res = await fetchWithRetry('/api/ai/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
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
