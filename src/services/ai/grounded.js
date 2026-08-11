// KAYNAKLI cevap — Gemini + Google Arama.
//
// Uygulamadaki diğer AI çağrıları hesaplanmış veriyi anlatıyor. Terim
// açıklaması gibi GENEL BİLGİ soruları farklı: modelin hafızasından gelen
// cevap makul görünür ama tarihsizdir ve kaynağı yoktur. İşe alım kararında
// kullanılacak bir bilginin izi sürülebilmeli.
//
// Bu uç gerçek bir arama yapar ve kullandığı kaynakları döndürür.
//
// GOOGLE'IN GÖSTERİM ŞARTI: Google Arama ile grounding kullanıldığında
// "Arama Önerileri" bloğu (searchSuggestionHtml) kullanıcıya OLDUĞU GİBİ
// gösterilmek zorunda. Süs değil, kullanım şartı.

import { getAuthHeaders } from './config.js';
import { fetchWithRetry } from './retry.js';

/**
 * @param {string} prompt
 * @param {{maxOutputTokens?: number}} options
 * @returns {Promise<{
 *   text: string,
 *   sources: Array<{title: string, uri: string}>,
 *   searchSuggestionHtml: string,
 *   grounded: boolean,
 * }>}
 *   grounded=false: arama aracı kullanılamadı, cevap modelin kendi
 *   hatırladığı. Arayüz bunu SÖYLEMEK zorunda — sessizce kaynaklıymış gibi
 *   sunmak, kaynaksız cevaptan daha kötü.
 */
export async function askGrounded(prompt, { maxOutputTokens = 1024 } = {}) {
    const res = await fetchWithRetry('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ prompt, maxOutputTokens }),
    });

    if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.error || `Kaynak araması başarısız (${res.status})`);
    }

    const data = await res.json();
    return {
        text: String(data?.text || '').trim(),
        sources: Array.isArray(data?.sources) ? data.sources : [],
        searchSuggestionHtml: String(data?.searchSuggestionHtml || ''),
        grounded: Boolean(data?.grounded),
    };
}
