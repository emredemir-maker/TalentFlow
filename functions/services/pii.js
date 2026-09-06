// KİŞİSEL VERİ MASKELEME — sunucu tarafı.
//
// ── NEDEN VAR ───────────────────────────────────────────────────────────────
// Uygulamada CV ayrıştırmanın İKİ yolu var ve ikisi farklı davranıyordu:
//
//   İstemci (AddCandidateModal → geminiService.parseCandidateFromText)
//     Ad, e-posta, telefon, LinkedIn ve GitHub'ı metinden REGEX ile ayıklıyor,
//     yerlerine [E-POSTA] gibi imler koyuyor ve modele yalnızca maskelenmiş
//     metni gönderiyor. İletişim bilgileri kayda sonradan yerel olarak
//     ekleniyor.
//
//   Sunucu (routes/cv.js → gemini.parseProfile)
//     HAM metni gönderip adı, konumu ve şirketi modelden İSTİYORDU.
//
// Yani aynı ürün, hangi yoldan geçtiğine göre farklı bir gizlilik sözü
// veriyordu. "CV'deki kimlik bilgileri modele gönderilmez" cümlesi ancak iki
// yol da aynı şeyi yapıyorsa savunulabilir.
//
// ── NEDEN KOPYA ─────────────────────────────────────────────────────────────
// Kurallar src/utils/pii.ts içinde de duruyor. functions/ ayrı bir paket ve
// ayrı dağıtılıyor; oradan içe aktarmak mümkün değil. İki dosya ayrışırsa iki
// farklı gizlilik davranışı geri döner — testler bu yüzden iki tarafta da
// AYNI beklentileri sabitliyor.
//
// ── MASKELEME KUSURSUZ DEĞİL ────────────────────────────────────────────────
// Regex tabanlı: alışılmadık biçimde yazılmış bir e-posta ya da ad kalıbı
// gözden kaçabilir. Bunu bir güvence olarak değil, gönderilen veriyi asgariye
// indiren bir tedbir olarak sunmak gerekiyor.

/**
 * Metnin ilk satırlarından ad çıkarır.
 *
 * CV'lerde ad neredeyse her zaman ilk birkaç satırda ve tek başına duruyor.
 * Daha akıllı bir arama (her büyük harfli kelimeyi ad saymak) unvanları da
 * maskeliyordu — "Müdür" gibi kelimeler bozuluyordu; bkz. src/utils/pii.ts.
 */
export function extractNameFromText(text) {
    if (!text || typeof text !== 'string') return null;
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines.slice(0, 5)) {
        if (/^[A-ZÇĞİÖŞÜ][a-zçğışöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğışöşü]+){1,3}$/.test(line)) {
            return line;
        }
    }
    return null;
}

/**
 * İletişim bilgilerini metinden ayıklar — MASKELEMEDEN ÖNCE çağrılır.
 *
 * Ayıklanan değerler kayda sonradan geri ekleniyor: aday kaydında e-posta ve
 * telefon duruyor ama modele hiç gitmiyor.
 */
export function extractPiiFromText(text) {
    if (!text || typeof text !== 'string') {
        return { name: null, email: null, phone: null, linkedinUrl: null };
    }
    const email = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
    const phone = text.match(/(?:\+?\d[\d\s().-]{6,}\d)/);
    const linkedin = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/i);
    return {
        name: extractNameFromText(text),
        email: email?.[0] || null,
        phone: phone?.[0]?.trim() || null,
        linkedinUrl: linkedin
            ? (linkedin[0].startsWith('http') ? linkedin[0] : `https://www.${linkedin[0]}`)
            : null,
    };
}

/**
 * Metindeki kimlik bilgilerini imlerle değiştirir.
 *
 * @param {string} text
 * @param {string|null} knownName — extractPiiFromText'in bulduğu ad
 */
export function redactPiiFromText(text, knownName = null) {
    if (!text || typeof text !== 'string') return text;

    let result = text
        .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[E-POSTA]')
        .replace(/(?:\+?\d[\d\s().-]{6,}\d)/g, '[TELEFON]')
        .replace(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/gi, '[LINKEDIN]')
        .replace(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+/gi, '[GITHUB]');

    if (knownName && knownName.trim()) {
        // Adın her parçası ayrı ayrı maskeleniyor: metnin ilerisinde yalnızca
        // ilk ad geçebiliyor ("Zeynep'in yönettiği ekip...").
        const parcalar = knownName.trim().split(/\s+/).filter((p) => p.length > 2);
        for (const p of parcalar) {
            result = result.replace(new RegExp(kacir(p), 'gi'), '[İSİM]');
        }
        result = result.replace(new RegExp(kacir(knownName.trim()), 'gi'), '[İSİM]');
    }
    return result;
}

/** Regex'te özel anlam taşıyan karakterleri etkisizleştirir. */
function kacir(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
