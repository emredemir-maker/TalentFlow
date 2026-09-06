// SAKLAMA SÜRESİ VE İMHA — hangi aday kaydı süresini doldurdu?
//
// ── NEDEN VAR ───────────────────────────────────────────────────────────────
// Aday kayıtları bugüne kadar süresiz duruyordu. KVKK'da kişisel veri, işleme
// amacı ortadan kalktığında silinmek zorunda; "işimize yarayabilir" bir
// saklama sebebi değil. Süresi belirlenmemiş bir havuz, denetimde tek başına
// bulgu.
//
// ── KARAR SAF, SİLME AYRI ───────────────────────────────────────────────────
// Bu dosya hiçbir şey silmiyor: yalnızca "bu kayıt süresini doldurdu mu"
// sorusunu cevaplıyor. Geri alınamayan bir işlemin kararı, veritabanına
// dokunmadan test edilebilmeli.
//
// ── YAŞI BİLİNMEYEN KAYIT SİLİNMEZ ──────────────────────────────────────────
// Tarih alanı okunamıyorsa kayıt DURUYOR. Alternatifi, tarihi bozuk diye eski
// sayıp silmek olurdu — geri dönüşü olmayan bir işlemde en kötü varsayım.
// Aynı ilke doğrulama tarafında da geçerli (utils/cvDates.js): okunamayan
// tarih bir sonuç değil, bir boşluktur.

/** Silme kararında bakılan tarih alanları — sırayla denenir. */
const DATE_FIELDS = ['appliedDate', 'createdAt', 'updatedAt'];

/**
 * İşe alınmış adaylar imha dışında.
 *
 * Kişi çalışan hâline geldiğinde verisi başka bir hukuki sebeple ve başka bir
 * süreyle saklanıyor; işe alım havuzunun saklama süresi ona uygulanamaz.
 * Silinecek olsa da bunun kararı İK'nın özlük süreçlerine ait.
 */
const KORUNAN_DURUMLAR = new Set(['hired']);

/** Firestore Timestamp, ISO metin ya da Date — hepsini Date'e indirger. */
export function toDate(value) {
    if (!value) return null;
    if (typeof value?.toDate === 'function') {
        const d = value.toDate();
        return Number.isNaN(d?.getTime?.()) ? null : d;
    }
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number') {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === 'string') {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
}

/** Kaydın yaşını belirleyen tarih; hiçbiri okunamıyorsa null. */
export function recordDate(candidate) {
    for (const f of DATE_FIELDS) {
        const d = toDate(candidate?.[f]);
        if (d) return d;
    }
    return null;
}

/**
 * Saklama süresinin bittiği an.
 *
 * @param {number} months
 * @param {Date} now
 * @returns {Date|null} ay değeri geçersizse null (fren kapalı)
 */
export function retentionCutoff(months, now = new Date()) {
    const n = Number(months);
    if (!Number.isFinite(n) || n <= 0) return null;
    const d = new Date(now.getTime());
    d.setMonth(d.getMonth() - Math.floor(n));
    return d;
}

/**
 * Bu kayıt süresini doldurdu mu?
 *
 * @returns {{due: boolean, reason: string}} reason: neden silinmediğini de
 *   söylüyor — ekranda "12 kayıt atlandı" demek yetmiyor, sebebi gerekiyor.
 */
export function retentionVerdict(candidate, { months, now = new Date() } = {}) {
    const cutoff = retentionCutoff(months, now);
    if (!cutoff) return { due: false, reason: 'sure-tanimsiz' };

    const status = String(candidate?.status || '').toLowerCase();
    if (KORUNAN_DURUMLAR.has(status)) return { due: false, reason: 'ise-alindi' };

    const d = recordDate(candidate);
    if (!d) return { due: false, reason: 'tarih-okunamadi' };

    return d < cutoff
        ? { due: true, reason: 'sure-doldu' }
        : { due: false, reason: 'sure-dolmadi' };
}

/** Sebeplerin Türkçesi — ekran ve rapor aynı kelimeleri kullansın. */
export const REASON_TEXT = {
    'sure-tanimsiz': 'Saklama süresi tanımlı değil',
    'ise-alindi': 'İşe alınmış — özlük süreçlerine ait',
    'tarih-okunamadi': 'Kaydın tarihi okunamadı',
    'sure-dolmadi': 'Süresi dolmadı',
    'sure-doldu': 'Süresi doldu',
};

/**
 * Bir listeyi süresi dolanlar / duranlar diye ayırır.
 *
 * @returns {{due: Array, kept: Array, reasons: Record<string, number>}}
 */
export function splitByRetention(candidates, options = {}) {
    const list = Array.isArray(candidates) ? candidates : [];
    const due = [];
    const kept = [];
    const reasons = {};

    for (const c of list) {
        const v = retentionVerdict(c, options);
        reasons[v.reason] = (reasons[v.reason] || 0) + 1;
        (v.due ? due : kept).push(c);
    }
    return { due, kept, reasons };
}

/**
 * Firebase Storage indirme adresinden nesne yolunu çıkarır.
 *
 * İmha yalnızca Firestore kaydını silmek değil: CV dosyasının kendisi
 * Storage'da duruyor ve asıl hassas belge o. Kayıt silinip dosya kalırsa
 * "imha edildi" demek yanlış olur.
 *
 * Adres şu biçimde: .../o/cvs%2F1712345_ab.pdf?alt=media&token=...
 *
 * @returns {string|null} çözülemezse null — çözemediğimiz bir yolu silmeye
 *   çalışmak, yanlış dosyayı silme riski demek.
 */
export function storagePathFromUrl(url) {
    const s = String(url || '');
    const m = s.match(/\/o\/([^?]+)/);
    if (!m) return null;
    try {
        const yol = decodeURIComponent(m[1]);
        // Yalnızca bilinen klasörler: adresin bir kısmını yanlış çözüp
        // rastgele bir nesneyi silmeye çalışmamak için.
        return /^(cvs|bulk-imports)\//.test(yol) ? yol : null;
    } catch {
        return null;
    }
}
