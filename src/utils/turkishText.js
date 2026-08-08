// Türkçe metin katlama.
//
// JavaScript'in varsayılan küçültmesi Türkçede iki yerde bozuluyor ve ikisi de
// bu projede canlı hataya yol açtı:
//
//   'İstanbul'.toLowerCase()  →  'i̇stanbul'   (i + BİRLEŞİK NOKTA, iki kod noktası)
//   'KALDIR'.toLowerCase()    →  'kaldir'      (noktasız ı kayboldu)
//
// Birincisi konum filtresini, ikincisi danışman kararının okunmasını bozdu.
// Karşılaştırma yapan her yer önce buradan geçmeli — üçüncü kez yaşamayalım.

/**
 * Aksanları ASCII'ye indirip küçültür. Karşılaştırma içindir, gösterim için
 * değil: çıktı kullanıcıya gösterilecek metin olarak kullanılmamalı.
 *
 * @param {unknown} raw
 * @returns {string}
 */
export function foldTr(raw) {
    return String(raw ?? '')
        .replace(/[İIı]/g, 'i')
        .replace(/[Şş]/g, 's')
        .replace(/[Ğğ]/g, 'g')
        .replace(/[Üü]/g, 'u')
        .replace(/[Öö]/g, 'o')
        .replace(/[Çç]/g, 'c')
        .toLowerCase();
}

/** Katlanmış metinde katlanmış parçayı arar. */
export function foldedIncludes(haystack, needle) {
    const n = foldTr(needle).trim();
    if (!n) return false;
    return foldTr(haystack).includes(n);
}
