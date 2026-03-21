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

const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';

/**
 * Returns a lightweight proxy object that forwards generateContent() calls
 * to the backend /api/ai/generate endpoint.
 */
export async function getModel(modelId = DEFAULT_GEMINI_MODEL) {
    return {
        generateContent: async (prompt) => {
            const res = await fetch('/api/ai/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, modelId }),
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
 * Kept for backwards compatibility — components that imported this
 * previously will still compile.  It is no longer needed; the key lives
 * only on the server.
 */
export async function getGlobalGeminiKey() {
    return null;
}
