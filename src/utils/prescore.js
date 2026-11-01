// ÖN ANALİZ: CV ayrıştırma + ön uyum skoru TEK AI çağrısında.
//
// Toplu yükleme bunu zaten böyle yapıyor (functions/services/bulkWorker.js
// parseTextWithGemini). Elle ekleme ve başvuru formu ise CV'yi ayrıştırdıktan
// sonra kendiliğinden tam bir detaylı analiz (2 çağrı daha) çalıştırıyordu.
// Karar: ön analiz her yolda tek çağrı; detaylı analiz yalnızca kullanıcı
// isteyince. Buradaki kurallar bulkWorker'daki skor bağlamının istemci
// ikizidir — biri değişirse diğeri de değişmeli.

const clampScore = (v) => Math.min(100, Math.max(0, Math.round(Number(v) || 0)));

/** Başlık karşılaştırması: büyük/küçük harf ve boşluk farkı eşleşmeyi bozmasın. */
function foldTitle(t) {
    return String(t || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
}

/**
 * Ayrıştırma talimatına eklenecek skor bağlamı ve JSON alanları.
 * @param {{positionTitle?: string, openPositionTitles?: string[]}} scoring
 * @returns {string}
 */
export function prescoreInstruction({ positionTitle = '', openPositionTitles = [] } = {}) {
    const titles = (openPositionTitles || []).filter(Boolean);
    const context = positionTitle
        ? `Hedef pozisyon: "${positionTitle}". matchScore'u SADECE bu pozisyona uygunluğa göre ver ve matchedPosition alanına aynen "${positionTitle}" yaz.`
        : titles.length > 0
            ? `Şirketteki açık pozisyonlar: ${titles.map((t) => `"${t}"`).join(', ')}. matchedPosition alanına SADECE bu listeden bir başlığı AYNEN yaz — listede olmayan bir başlık ASLA yazma. Aday hiçbirine uygun değilse matchedPosition alanına null yaz ve matchScore'u 0 ver.`
            : 'Açık pozisyon listesi yok. matchScore\'u adayın profil kalitesine göre ver; matchedPosition alanına null yaz.';
    return `
ÖN UYUM SKORU (aynı yanıtta, ek alanlar olarak):
${context}
JSON'a şu alanları da ekle:
  "matchScore": 0-100 arası tam sayı,
  "matchedPosition": "Skorun verildiği pozisyon başlığı" veya null,
  "matchReason": "1-2 cümlelik skor gerekçesi (Türkçe)"`;
}

/**
 * AI yanıtındaki skor alanlarını doğrular. Listede olmayan bir başlık
 * eşleşme sayılmaz (model bazen CV'deki serbest unvanı yazıyor).
 *
 * @returns {{score: number, matchedTitle: string|null, reason: string}|null}
 *   AI skor alanı hiç döndürmediyse null — çağıran anahtar-kelime skoruna düşer.
 */
export function normalizePrescore(parsed, { positionTitle = '', openPositionTitles = [] } = {}) {
    if (!parsed || parsed.matchScore == null || !Number.isFinite(Number(parsed.matchScore))) return null;
    const reason = String(parsed.matchReason || '').trim().slice(0, 400);
    // Hedef pozisyon verildiyse skor tanım gereği ona aittir (başvuru formu).
    if (positionTitle) return { score: clampScore(parsed.matchScore), matchedTitle: positionTitle, reason };
    const allowed = (openPositionTitles || []).filter(Boolean);
    const wanted = foldTitle(parsed.matchedPosition);
    const matchedTitle = wanted ? allowed.find((t) => foldTitle(t) === wanted) || null : null;
    // Pozisyon listesi verildiyse ama başlık listede yoksa skor bir pozisyona
    // ait değildir — "uygun açık pozisyon yok" olarak 0'a iner.
    if (allowed.length > 0 && !matchedTitle) return { score: 0, matchedTitle: null, reason };
    return { score: clampScore(parsed.matchScore), matchedTitle, reason };
}

/** Skor alanları aday kaydına sızmasın — ayrı döndürülür. */
export function stripPrescoreFields(parsed) {
    if (!parsed || typeof parsed !== 'object') return parsed;
    const { matchScore: _s, matchedPosition: _p, matchReason: _r, ...rest } = parsed;
    return rest;
}
