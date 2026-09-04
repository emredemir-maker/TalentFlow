// ŞİRKET ÇÖZÜMLEME — CV'de geçen bir şirket gerçekten var mı, ne yapıyor, kimin?
//
// İki ayrı işi besler:
//   1. DOĞRULAMA  — şirket var mı, kuruluşu iddia edilen dönemi tutuyor mu,
//                   kurucusu aday mı (bkz. utils/companyClaims.js)
//   2. SEKTÖR UYUMU — adayın kariyerinin ne kadarı hedef sektörde geçmiş
//                   (bkz. utils/sectorFit.js)
//
// Tek çözümleme iki soruyu birden cevaplıyor; şirket başına ikinci bir arama
// yapmak saf israf olurdu.
//
// ── KAYNAKSIZ KANIT GÖSTERİLMEZ ─────────────────────────────────────────────
// Kural marketResearch.js'ten devralındı ve burada DAHA kritik: oradaki
// çıktının yanlışı bir bütçe kararını kaydırır, buradakinin yanlışı bir insanı
// yalancılıkla suçlar. Model "bu şirket bulunamadı" diye hatırlayabilir;
// hatırlamak arama değildir. Arama sonucu gösteremiyorsak HİÇBİR ŞEY
// söylemiyoruz ve bunu açıkça yazıyoruz.
//
// ── "BULAMADIM" BİR SONUÇ DEĞİL ─────────────────────────────────────────────
// Türkiye'de web sitesi olmayan gerçek şirket sayısı çok. Bu yüzden VAR_MI
// alanının varsayılanı "bilinmiyor"; modele "yoksa hayır yaz" DEMİYORUZ.
// "Hayır" yalnızca kaynak şirketin kapandığını/hiç var olmadığını açıkça
// söylüyorsa yazılır.

import { askGrounded } from './grounded.js';
import { sanitizeForPrompt } from './utils.js';
import { foldTr } from '../../utils/turkishText.js';
import { resolveSector, resolveModel, resolveType } from '../../utils/sectorTaxonomy.js';
import { SIZE_BANDS } from '../../utils/companyClaims.js';

const INTEL_PROMPT = `
Sen bir kurumsal istihbarat araştırmacısısın. Sana bir ŞİRKET ADI veriliyor.
Görevin bu şirketi ARAYARAK kamuya açık kaynaklardan tanımlamak.

ARAMA ZORUNLU. Aklından bilgi yazma. Yazdığın her satır bulduğun bir sayfaya
dayanmalı; dayanmıyorsa o satıra "bilinmiyor" yaz.

BULAMAMAK BİR SONUÇ DEĞİLDİR. Şirketi bulamadıysan VAR_MI satırına
"bilinmiyor" yaz — "hayir" YAZMA. Web sitesi olmayan, küçük ölçekli ya da
yalnızca yerel faaliyet gösteren çok sayıda gerçek şirket var. "Hayır"
yalnızca bir kaynak şirketin hiç var olmadığını ya da kapandığını AÇIKÇA
söylüyorsa yazılır.

KİŞİ ADI UYDURMA. Kurucu/ortak adlarını yalnızca bir kaynakta AÇIKÇA
geçiyorsa yaz. Bu alan, bir adayın kendi şirketinde çalışıp çalışmadığını
belirlemek için kullanılıyor; uydurulmuş bir isim doğrudan bir insan hakkında
yanlış iddiaya dönüşür.

TİCARET SİCİLİ AYRI TUTULUR. Ticaret Sicil Gazetesi, MERSİS ya da eşdeğeri
resmî bir sicil kaydı bulduysan SICIL_ ile başlayan satırlara yaz. Resmî
sicil ile bir haber sitesinin yazdığı aynı ağırlıkta değil.

ÖNCE 2-3 CÜMLE DÜZ METİN YAZ: hangi kaynak ne söylüyor, şirket ne iş yapıyor.
Bu bölüm süs değil — Google Arama ile grounding alıntıları düz metne bağlıyor.
Yalnızca etiketli satır yazarsan cevap hiçbir sayfaya bağlanmaz ve kaynaksız
kaldığı için EKRANDA GÖSTERİLMEZ.

Sonra bir boş satır bırak ve şu etiketli satırları yaz:

VAR_MI: evet | hayir | bilinmiyor
WEB_SITESI: alan adı (ör. ornek.com) ya da bilinmiyor
KURULUS_YILI: yalnızca yıl ya da bilinmiyor
OLCEK: 1-10 | 11-50 | 51-200 | 201-1000 | 1000+ | bilinmiyor
SEKTOR: şirketin faaliyet alanı, kısa (ör. "çağrı merkezi yazılımı")
IS_MODELI: b2b | b2c | b2b2c | bilinmiyor
GELIR_TIPI: saas | pazaryeri | hizmet | uretim | perakende | finans | kamu | bilinmiyor
MERKEZ: şehir, ülke ya da bilinmiyor
KURUCULAR: kurucu/ortak adları, noktalı virgülle. Kaynakta yoksa bilinmiyor.
SICIL_KURULUS: resmî sicildeki kuruluş yılı ya da bilinmiyor
SICIL_KURUCULAR: resmî sicildeki ortak adları, noktalı virgülle, ya da bilinmiyor
NOT: okuyanın bu bilgiyi yanlış kullanmasını engelleyecek tek cümle.
  Söylenecek bir şey yoksa bu satırı yazma.
`;

const EMPTY = new Set(['bilinmiyor', 'yok', 'belirtilmemis', 'belirsiz', '-', 'n/a', 'na', 'null']);

const isEmptyAnswer = (v) => EMPTY.has(foldTr(String(v || '').trim()).toLowerCase());

/**
 * Sorgu metni.
 *
 * `hint` — CV'den gelen ek bağlam (adayın rolü, şirketin şehri). Aynı adı
 * taşıyan farklı şirketleri ayırmaya yarar: "Delta Yazılım" araması bağlamsız
 * yapıldığında Türkiye'deki üç ayrı Delta'dan hangisi olduğu belli olmaz ve
 * yanlış şirketin verisi adayın CV'sine yapıştırılır.
 */
export function buildCompanyQuery(company, { hint = '' } = {}) {
    return [
        INTEL_PROMPT,
        `ŞİRKET ADI: ${sanitizeForPrompt(String(company || '').trim())}`,
        hint ? `EK BAĞLAM: ${sanitizeForPrompt(String(hint).trim())}` : '',
    ].filter(Boolean).join('\n\n');
}

/** Etiketli satırları okur — marketResearch.js'teki ayrıştırıcının ikizi. */
function makeGrabber(text) {
    // Model düz metin isterken satırları markdown'la biçimliyor:
    // '**VAR_MI:** evet', '- VAR_MI: evet'. Süsü ayıklamayan bir eşleştirme
    // bu satırları görmez ve alan sessizce boş kalır.
    const labelOf = (raw) => foldTr(raw).replace(/[*_`#>\-–—•\s]/g, '');
    return (label) => {
        const wanted = labelOf(label);
        for (const line of String(text || '').split(/\r?\n/)) {
            const at = line.indexOf(':');
            if (at === -1) continue;
            if (labelOf(line.slice(0, at)) === wanted) {
                return line.slice(at + 1).replace(/\*+/g, '').trim();
            }
        }
        return '';
    };
}

const parseYear = (v) => {
    if (isEmptyAnswer(v)) return null;
    const m = String(v).match(/\b(19|20)\d{2}\b/);
    if (!m) return null;
    const n = Number(m[0]);
    return n >= 1900 && n <= new Date().getFullYear() + 1 ? n : null;
};

/** Kişi adı listesi. Tek kelimelik "isimler" atılır — soyadsız eşleşme yapılmıyor. */
const parseNames = (v) => {
    if (isEmptyAnswer(v)) return [];
    return String(v)
        .split(/[;,]/)
        .map((s) => s.replace(/\s+/g, ' ').trim())
        .filter((s) => s.length >= 5 && s.length <= 60 && s.split(' ').length >= 2)
        .slice(0, 8);
};

/** Alan adını normalize eder: protokol, www ve yol atılır. */
const parseDomain = (v) => {
    if (isEmptyAnswer(v)) return '';
    const s = String(v).trim().toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split(/[/?#\s]/)[0];
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : '';
};

const parseExists = (v) => {
    const s = foldTr(String(v || '')).toLowerCase().trim();
    if (s.startsWith('evet') || s.startsWith('yes')) return 'evet';
    if (s.startsWith('hayir') || s.startsWith('no')) return 'hayir';
    return 'bilinmiyor';
};

/** Model cevabını yapılandırılmış kanıta çevirir. */
export function parseCompanyAnswer(raw) {
    const grab = makeGrabber(raw);
    const sizeRaw = String(grab('OLCEK') || '').trim();
    const registryYear = parseYear(grab('SICIL_KURULUS'));
    const registryFounders = parseNames(grab('SICIL_KURUCULAR'));

    return {
        exists: parseExists(grab('VAR_MI')),
        website: parseDomain(grab('WEB_SITESI')),
        foundedYear: parseYear(grab('KURULUS_YILI')),
        sizeBand: SIZE_BANDS.includes(sizeRaw) ? sizeRaw : null,
        sector: resolveSector(grab('SEKTOR')),
        sectorRaw: isEmptyAnswer(grab('SEKTOR')) ? '' : grab('SEKTOR'),
        model: resolveModel(grab('IS_MODELI')),
        type: resolveType(grab('GELIR_TIPI')),
        headquarters: isEmptyAnswer(grab('MERKEZ')) ? '' : grab('MERKEZ'),
        founders: parseNames(grab('KURUCULAR')),
        // Sicil kaydı yalnızca gerçekten bir şey içeriyorsa var sayılır —
        // boş bir `registry` nesnesi, companyClaims'te "hukuki kayıt bulundu"
        // gibi okunur ve o kanıdan CELISKI ağırlığı doğar.
        registry: (registryYear || registryFounders.length > 0)
            ? { source: 'Ticaret sicili', foundedYear: registryYear, founders: registryFounders }
            : null,
        caution: isEmptyAnswer(grab('NOT')) ? '' : grab('NOT'),
    };
}

/**
 * Bir şirketi çözümler.
 *
 * @param {string} company
 * @param {{hint?: string}} options
 * @returns {Promise<object>} companyClaims.verifyCompanyClaim ve
 *   sectorFit.buildSectorEntries'in beklediği kanıt nesnesi.
 *
 *   withheld=true: model bilgi üretti ama KAYNAK gösteremedi; alanlar
 *   boşaltıldı. Bu bir hata değil, kuralın çalışması.
 */
export async function resolveCompany(company, { hint = '' } = {}) {
    const name = String(company || '').trim();
    if (!name) throw new Error('Şirket adı gerekli.');

    // 4096: marketResearch.js'te 1024 ve 2048 CANLIDA YETMEDİ. Gemini 2.5'te
    // düşünme token'ları da çıktı bütçesinden yeniyor; arama yapan bir çağrıda
    // düşünme payı tek başına tavanı doldurup cevabı kesiyor. Kesilen cevapta
    // etiketli satırlar eksik kalıyor VE grounding metadata boşalıyor — iki
    // belirti, tek sebep.
    const answer = await askGrounded(buildCompanyQuery(name, { hint }), { maxOutputTokens: 4096 });

    const parsed = parseCompanyAnswer(answer.text);
    const sources = Array.isArray(answer.sources) ? answer.sources : [];
    const searchQueries = Array.isArray(answer.searchQueries) ? answer.searchQueries : [];

    // KAYNAKSIZ KANIT GÖSTERİLMEZ — kural burada, prompt'ta değil. Modele
    // "kaynaksız yazma" demek bir dilek; bu bir kısıt.
    if (sources.length === 0) {
        return {
            name,
            exists: 'bilinmiyor',
            website: '', foundedYear: null, sizeBand: null,
            sector: null, sectorRaw: '', model: null, type: null,
            headquarters: '', founders: [], registry: null, caution: '',
            withheld: true,
            // NEDEN gizlendi: arama hiç yapılamamış olmakla, arama yapılıp
            // hiçbir sayfanın kaynak gösterilmemesi farklı şeyler. Arayüz
            // ikisini aynı cümleyle anlatırsa kullanıcı haklı olarak çelişki
            // görür (marketResearch.js'te canlıda yaşandı).
            withheldReason: searchQueries.length > 0 ? 'searched-uncited' : 'not-searched',
            grounded: Boolean(answer.grounded),
            searchQueries,
            sources: [],
            searchSuggestionHtml: answer.searchSuggestionHtml || '',
            resolvedAt: new Date().toISOString(),
        };
    }

    return {
        name,
        ...parsed,
        withheld: false,
        withheldReason: '',
        grounded: Boolean(answer.grounded),
        searchQueries,
        sources,
        searchSuggestionHtml: answer.searchSuggestionHtml || '',
        resolvedAt: new Date().toISOString(),
    };
}

/**
 * KULLANICININ VERDİĞİ SİTEDEN ARAŞTIRMA.
 *
 * ── NEDEN AYRI BİR SORGU ────────────────────────────────────────────────────
 * Otomatik çözümleme yalnızca ADI biliyor ve Türkiye'de aynı adı taşıyan
 * onlarca şirket var — "Delta Yazılım" araması bağlamsız yapıldığında hangi
 * Delta olduğu belli olmuyor ve şirket "bulunamadı" kalıyordu. Kullanıcı
 * doğru alan adını biliyorsa belirsizlik ortadan kalkıyor: araştırma o
 * alan adına ÇAPALANIYOR.
 *
 * ── YİNE DE OTOMATİK DEĞİL ──────────────────────────────────────────────────
 * Bu çağrının sonucu doğrudan kaydedilmiyor; FORMU DOLDURUYOR. Kullanıcı
 * gördüğü alanları düzeltip kaydediyor. Alan adı yanlış girilmiş ya da park
 * edilmiş bir siteyse modelin anlattığı şirket bambaşka olabilir; araya bir
 * insan onayı koymadan bu veriyi yazmak, yanlış şirketi adayın CV'sine
 * yapıştırmak olurdu.
 */
const SITE_PROMPT = `
ALAN ADI KULLANICI TARAFINDAN VERİLDİ ve şirketin doğru sitesi olduğu
söyleniyor. Araştırmanı BU ALAN ADINA ÇAPALA:
- Önce bu sitenin kendi sayfalarına bak (hakkımızda, kurumsal, iletişim).
- Sonra bu alan adına ya da bu şirkete atıf yapan dış kaynaklara bak.

BENZER ADLI BAŞKA BİR ŞİRKETİ ANLATMA. Bulduğun kaynak bu alan adıyla
ilişkili değilse KULLANMA ve ilgili satıra "bilinmiyor" yaz. Aynı adı
taşıyan farklı bir şirketin verisini buraya yazmak, bir adayın geçmişine
başka bir şirketin bilgisini yapıştırmak olur.

SİTE ULAŞILAMIYORSA ya da içeriği şirketi tanıtmıyorsa (park edilmiş alan
adı, boş sayfa) bunu NOT satırında söyle ve alanları "bilinmiyor" bırak.
`;

/** Alan adına çapalanmış sorgu metni. */
export function buildSiteQuery(company, website, { hint = '' } = {}) {
    return [
        INTEL_PROMPT,
        SITE_PROMPT,
        `ŞİRKET ADI: ${sanitizeForPrompt(String(company || '').trim())}`,
        `ŞİRKETİN ALAN ADI: ${sanitizeForPrompt(String(website || '').trim())}`,
        hint ? `EK BAĞLAM: ${sanitizeForPrompt(String(hint).trim())}` : '',
    ].filter(Boolean).join('\n\n');
}

/**
 * Verilen siteden şirketi araştırır.
 *
 * @param {string} company — şirketin CV'deki adı
 * @param {string} website — kullanıcının girdiği alan adı ya da adres
 * @param {{hint?: string}} options
 * @returns {Promise<object>} `resolveCompany` ile AYNI şekilli kanıt kaydı;
 *   kaynak gösterilemediyse `withheld: true`
 */
export async function researchCompanySite(company, website, { hint = '' } = {}) {
    const name = String(company || '').trim();
    const site = String(website || '').trim();
    if (!name) throw new Error('Şirket adı gerekli.');
    if (!site) throw new Error('Şirketin web adresi gerekli.');

    const answer = await askGrounded(buildSiteQuery(name, site, { hint }), { maxOutputTokens: 4096 });
    const parsed = parseCompanyAnswer(answer.text);
    const sources = Array.isArray(answer.sources) ? answer.sources : [];
    const searchQueries = Array.isArray(answer.searchQueries) ? answer.searchQueries : [];

    // KAYNAKSIZ KANIT GÖSTERİLMEZ — `resolveCompany` ile aynı kısıt. Modele
    // "kaynaksız yazma" demek bir dilek; bu bir kural.
    if (sources.length === 0) {
        return {
            name,
            exists: 'bilinmiyor',
            website: site, foundedYear: null, sizeBand: null,
            sector: null, sectorRaw: '', model: null, type: null,
            headquarters: '', founders: [], registry: null, caution: '',
            withheld: true,
            withheldReason: searchQueries.length > 0 ? 'searched-uncited' : 'not-searched',
            grounded: Boolean(answer.grounded),
            searchQueries,
            sources: [],
            searchSuggestionHtml: answer.searchSuggestionHtml || '',
            resolvedAt: new Date().toISOString(),
        };
    }

    return {
        name,
        ...parsed,
        // KULLANICININ VERDİĞİ ADRES KORUNUR. Model siteyi başka bir alan adı
        // olarak okuyabiliyor (yönlendirme, alt alan adı); kullanıcının
        // yazdığını onun tahminiyle değiştirmek, girdiğinin kaybolması demek.
        website: parsed.website || site,
        withheld: false,
        withheldReason: '',
        grounded: Boolean(answer.grounded),
        searchQueries,
        sources,
        searchSuggestionHtml: answer.searchSuggestionHtml || '',
        resolvedAt: new Date().toISOString(),
    };
}

/**
 * CV'deki BENZERSİZ şirketleri çıkarır.
 *
 * Aynı şirket birden çok görevde geçebilir (terfi, departman değişikliği) ve
 * iki kez aratmak iki kat maliyet demek. Anahtar, ad normalize edilerek
 * kurulur: "Infoset", "INFOSET", "Infoset A.Ş." aynı şirkettir.
 */
export function uniqueCompanies(experiences) {
    const seen = new Map();
    for (const e of Array.isArray(experiences) ? experiences : []) {
        const raw = String(e?.company || '').trim();
        if (!raw) continue;
        const key = companyKey(raw);
        if (!seen.has(key)) seen.set(key, raw);
    }
    return [...seen.entries()].map(([key, name]) => ({ key, name }));
}

/**
 * Önbellek anahtarı — şirket adının normalize hâli.
 *
 * Şirket türü ekleri (A.Ş., Ltd. Şti.) atılır: aynı şirket CV'lerde farklı
 * uzunlukta yazılıyor ve ek yüzünden ıskalanan her eşleşme yeni bir arama
 * demek.
 */
export function companyKey(name) {
    return foldTr(String(name || ''))
        .toLowerCase()
        .replace(/[^a-z0-9ğüşiöç ]+/gi, ' ')
        .replace(/\b(a s|as|ltd|sti|inc|llc|gmbh|bv|co|corp|company|holding|grup|group)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
