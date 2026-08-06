// Pozisyon formundaki serbest metin gereksinim girdisini listeye çevirir.
//
// Eski davranış yalnızca virgülle bölüyordu ve gereksinim alanı tek satırlık
// bir input'tu. Gerçek ilan maddeleri madde İÇİNDE virgül taşır:
//
//   "3-5 yıl ürün yönetimi deneyimi, en az 1-2 yılı growth/funnel odaklı"
//
// Bu madde virgülden bölününce iki anlamsız gereksinime dönüşüyor ve hem
// skorlama hem de AI'a giden ilan metni bozuluyordu.
//
// Kural: metinde satır sonu varsa SATIR bazlı ayrıştırılır (madde içi
// virgüller korunur); tek satırlıksa eski virgül davranışına düşülür ki
// "React, TypeScript, SQL" gibi mevcut girdiler aynı şekilde çalışsın.

/** Madde başındaki "-", "•", "*", "1." gibi işaretleri temizler. */
function stripBullet(line) {
    return line.replace(/^\s*(?:[-–—•*]|\d+[.)])\s*/, '').trim();
}

/**
 * @param {string} raw — textarea içeriği
 * @returns {string[]} temizlenmiş gereksinim listesi (en fazla 30)
 */
export function parseRequirementsInput(raw) {
    const text = String(raw ?? '').trim();
    if (!text) return [];
    const hasLines = /\r?\n/.test(text);
    const parts = hasLines ? text.split(/\r?\n/) : text.split(',');
    return parts
        .map(stripBullet)
        .filter(Boolean)
        .slice(0, 30);
}

/** Kayıtlı listeyi textarea'da düzenlenebilir metne çevirir (satır başına bir madde). */
export function formatRequirementsInput(requirements) {
    if (!Array.isArray(requirements)) return String(requirements ?? '');
    return requirements.join('\n');
}
