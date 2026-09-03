// ELLE ŞİRKET DOĞRULAMA — insanın girdiği kanıt.
//
// ── NEDEN GEREKLİ ───────────────────────────────────────────────────────────
// Otomatik çözümleme bazı şirketleri hiçbir zaman bulamaz: küçük ölçekli,
// yerel, yurtdışı merkezli, kapanmış ya da hiç dijital iz bırakmamış
// işletmeler. Rapor bunlara "doğrulanamadı" diyor ve bu HAKLI — ama İK'nın
// elinde bilgi olduğunda (şirketin sitesini buldu, eski çalışanı aradı,
// ticaret sicilinden baktı) o bilgiyi sisteme yazacak hiçbir yer yoktu.
// Bilgi İK'nın kafasında kalıyor, rapor "doğrulanamadı" demeye devam ediyor
// ve üstelik %60 eşiğini aşınca adayın skorundan kesiliyordu.
//
// ── KANIT GÜCÜ: SİCİL DEĞİL, ARAMA SEVİYESİ ─────────────────────────────────
// Elle girilen kuruluş yılı `registry` alanına DEĞİL, arama sonucu alanına
// yazılıyor. Sebep companyClaims.js'teki basamaklı kural: sicil kaydı
// "çelişki" (kırmızı bayrak) üretirken arama sonucu "dikkat" üretiyor.
// İnsanın elle girdiği bir yıl hukuki belge değil — yanlış hatırlanmış ya da
// yanlış yazılmış olabilir. Aynı basamağa koymak, bir yazım hatasının adaya
// kırmızı bayrak takması demekti.
//
// ── ŞİRKETİN ALTINDA DURUR, ADAYIN DEĞİL ────────────────────────────────────
// Kayıt companyIntel önbelleğine yazılıyor. "Acme Yazılım"ı bir kez elle
// doğrulayan İK uzmanı, o şirketi CV'sinde taşıyan HER adaya aynı bilgiyi
// kazandırmış oluyor. Aynı şirketi her aday için yeniden doğrulatmak, aynı
// telefonu on kez ettirmek olurdu.
//
// ── NE DEĞİLDİR ─────────────────────────────────────────────────────────────
// Bu kayıt "bu kişi bu şirkette çalıştı" demez. Şirketin VAR OLDUĞUNU ve ne
// olduğunu söyler. Kişinin o şirketteki görevi hâlâ CV beyanıdır ve rapor
// bunu doğrulanmış gibi göstermez.

/** Elle girilen kaydın kanıt kaynağı etiketi. */
export const MANUAL_SOURCE = 'manual';

/** Kuruluş yılı için makul aralık — dışı yazım hatasıdır. */
const MIN_YEAR = 1800;

/** Şirket ölçek bantları — companyClaims.SIZE_BANDS ile aynı liste. */
export const MANUAL_SIZE_BANDS = ['1-10', '11-50', '51-200', '201-1000', '1000+'];

/**
 * Kullanıcının yazdığı adresi tam bir URL'ye çevirir.
 *
 * "acme.com.tr" yazan kullanıcıya "geçersiz adres" demek gereksiz sürtünme;
 * şema eksikse https varsayılıyor. Ama `javascript:` gibi şemalar KABUL
 * EDİLMEZ: bu değer ekranda tıklanabilir bir bağlantı olarak basılıyor.
 *
 * @returns {string} normalize edilmiş URL, geçersizse boş metin
 */
export function normalizeWebsite(raw) {
    const text = String(raw ?? '').trim();
    if (!text) return '';
    const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    let url;
    try {
        url = new URL(withScheme);
    } catch {
        return '';
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    // En az bir nokta ve TLD benzeri bir son: "acme" tek başına adres değil.
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname)) return '';
    return url.toString();
}

/** Kuruluş yılı — aralık dışı ve sayı olmayan değerler `null`. */
export function normalizeFoundedYear(raw, now = new Date()) {
    if (raw === '' || raw === null || raw === undefined) return null;
    const year = Number(raw);
    if (!Number.isInteger(year)) return null;
    if (year < MIN_YEAR || year > now.getFullYear() + 1) return null;
    return year;
}

/**
 * Formda doğrulanabilir bir şey var mı?
 *
 * En az BİR somut alan gerekiyor. Yalnızca "doğruladım" kutusunu işaretleyip
 * hiçbir bilgi vermemek, raporda kanıtsız bir "doğrulandı" üretirdi — bu
 * aracın yapmamaya söz verdiği tam olarak o.
 */
export function hasManualEvidence(form) {
    return Boolean(
        normalizeWebsite(form?.website)
        || normalizeFoundedYear(form?.foundedYear)
        || form?.sizeBand
        || form?.sector
        || String(form?.headquarters || '').trim()
        || String(form?.note || '').trim()
    );
}

/**
 * Form girdisini, otomatik kayıtla AYNI ŞEKİLLİ bir kanıt kaydına çevirir.
 *
 * Aynı şekilde olması şart: kanıtı okuyan her yer (iddia karşılaştırması,
 * sektör uyumu, ekran) tek bir biçim biliyor. Elle giren için ayrı bir yol
 * açmak, o yolların her birinde ikinci bir dal demekti.
 *
 * @param {string} name — şirketin CV'deki adı
 * @param {object} form — {website, foundedYear, sizeBand, sector, model, type,
 *                         headquarters, note}
 * @param {{by?: string, at?: string}} meta — kim, ne zaman girdi
 * @returns {object} companyIntel kaydı
 */
export function buildManualCompanyRecord(name, form = {}, meta = {}) {
    const website = normalizeWebsite(form.website);
    const foundedYear = normalizeFoundedYear(form.foundedYear);
    const note = String(form.note || '').trim();
    const headquarters = String(form.headquarters || '').trim();
    const sectorRaw = String(form.sectorRaw || '').trim();

    // Web sitesi aynı zamanda bir KAYNAK. Kaynak listesi ekranda tıklanabilir
    // duruyor; elle doğrulamanın da denetlenebilir olması gerekiyor.
    const sources = website
        ? [{ title: 'Şirket web sitesi (elle girildi)', uri: website }]
        : [];

    return {
        name: String(name || '').trim(),
        exists: 'evet',
        website,
        // SİCİL DEĞİL: dosya başındaki gerekçe. Elle girilen yıl, arama
        // sonucuyla aynı ağırlıkta değerlendirilir.
        foundedYear,
        sizeBand: form.sizeBand || null,
        sector: form.sector || null,
        sectorRaw,
        model: form.model || null,
        type: form.type || null,
        headquarters,
        founders: [],
        registry: null,
        caution: '',
        withheld: false,
        withheldReason: '',
        grounded: false,
        searchQueries: [],
        sources,
        searchSuggestionHtml: '',
        source: MANUAL_SOURCE,
        manual: {
            by: String(meta.by || '').trim() || 'Bilinmiyor',
            at: meta.at || new Date().toISOString(),
            note,
        },
        resolvedAt: meta.at || new Date().toISOString(),
    };
}

/** Kayıt elle mi girilmiş? */
export function isManualRecord(record) {
    return record?.source === MANUAL_SOURCE;
}

/** Kayıttan forma geri dönüş — düzenleme ekranı bunu kullanıyor. */
export function formFromRecord(record) {
    return {
        website: record?.website || '',
        foundedYear: record?.foundedYear ?? '',
        sizeBand: record?.sizeBand || '',
        sector: record?.sector || '',
        model: record?.model || '',
        type: record?.type || '',
        sectorRaw: record?.sectorRaw || '',
        headquarters: record?.headquarters || '',
        note: record?.manual?.note || '',
    };
}
