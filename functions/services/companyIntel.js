// ŞİRKET BİLGİSİ ÖNBELLEĞİ — PLATFORMDA ORTAK (K6).
//
// CV'de geçen bir şirketin kamuya açık bilgisi (var mı, ne iş yapıyor, sicil)
// her şirket için aynı; aynı firmayı her müşteri için ayrı aratmak aynı soruya
// defalarca para ödemek olurdu. Bu yüzden önbellek platformda tek:
// `platform/companyIntel/entries/{id}` (istemciye kapalı, firestore.rules).
//
// ── NEDEN SUNUCUDA ve NEDEN YALNIZ SUNUCU YAZIYOR ───────────────────────────
// Önbellek ortak olunca bir şirketin yazdığı kayıt öteki şirketlere de
// gösterilir. İstemcinin hazırladığı sonucu yazdırmak, bir müşterinin bütün
// müşterilere sahte şirket bilgisi göstermesinin yolunu açardı. Bu yüzden:
//   • anahtar sunucuda addan türetilir (istemcinin verdiği anahtar yok);
//   • sorgu metni sunucuda kurulur (yalnız şirket adı — aday bağlamı YOK);
//   • kaydedilen şey Gemini'nin kaynaklı yanıtıdır, istemcinin yorumu değil.
//
// ── YAN KANAL YOK ───────────────────────────────────────────────────────────
// Kayıtta hangi şirketin ya da kişinin sorguladığı tutulmaz; aday bağlamı
// (şehir, rol — eski istemcideki `hint`) sorguya girmez, çünkü yanıt metni onu
// yansıtıp başka müşterilere taşıyabilirdi. Elle girilen doğrulama kaydı bir
// müşterinin kendi yargısıdır: o şirketin ağacında kalır
// (tenants/{t}/companyIntelManual/{id}) ve yalnız o şirkete döner.
//
// Ayrıştırma (etiketli satırlar → alanlar) istemcide kalır (PR 3): sunucu ham
// kaynaklı yanıtı saklar ve döndürür.

/** Bulunan kaydın tazelik süresi. Şirket bilgisi hızlı değişmez. */
export const FRESH_DAYS = 180;
/** Kaynak gösterilemeyen kaydın tazelik süresi — web bu arada değişmiş olabilir. */
export const FRESH_DAYS_WITHHELD = 30;

/** src/utils/turkishText.js#foldTr ile aynı. */
function foldTr(raw) {
    return String(raw ?? '')
        .replace(/[İIı]/g, 'i')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

/** src/services/ai/companyIntel.js#companyKey ile aynı — önbellek anahtarı. */
export function companyKey(name) {
    return foldTr(String(name || ''))
        .toLowerCase()
        .replace(/[^a-z0-9ğüşiöç ]+/gi, ' ')
        .replace(/\b(a s|as|ltd|sti|inc|llc|gmbh|bv|co|corp|company|holding|grup|group)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** src/services/companyIntelStore.js#docIdFor ile aynı. */
export function docIdFor(key) {
    const id = String(key || '').trim().replace(/[/\\.#$[\]]+/g, ' ').replace(/\s+/g, '-').slice(0, 200);
    return id || null;
}

/** Ortak kayıt hâlâ taze mi? */
export function isFresh(record, now = Date.now()) {
    if (!record?.resolvedAt) return false;
    const at = Date.parse(record.resolvedAt);
    if (!Number.isFinite(at)) return false;
    const days = record.withheld ? FRESH_DAYS_WITHHELD : FRESH_DAYS;
    return now - at < days * 24 * 60 * 60 * 1000;
}

// İstemcideki istemle (src/services/ai/companyIntel.js) aynı metin; PR 3'te
// istemci kendi kopyasını bırakıp bu uca geçer.
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

/** Sorgu metni — YALNIZ şirket adı (aday bağlamı ortak önbelleğe girmez). */
export function buildCompanyQuery(name, sanitize) {
    return [INTEL_PROMPT, `ŞİRKET ADI: ${sanitize(String(name || '').trim(), 300)}`].join('\n\n');
}

/** Gemini yanıtından saklanacak alanlar — yalnız kamuya açık sonuç. */
export function cacheRecordFrom(name, answer, now = new Date()) {
    const sources = Array.isArray(answer?.sources) ? answer.sources.slice(0, 20) : [];
    const searchQueries = Array.isArray(answer?.searchQueries) ? answer.searchQueries.slice(0, 10) : [];
    return {
        name: String(name || '').trim().slice(0, 300),
        answer: {
            text: String(answer?.text || '').slice(0, 20000),
            sources,
            searchQueries,
            grounded: Boolean(answer?.grounded),
            searchSuggestionHtml: String(answer?.searchSuggestionHtml || '').slice(0, 20000),
        },
        // Kaynaksız yanıt gösterilmez (istemci kuralı); kısa tazelik süresi.
        withheld: sources.length === 0,
        resolvedAt: now.toISOString(),
    };
}
