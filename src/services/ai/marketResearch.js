// PİYASA ARAŞTIRMASI — ücret bandı ve yan haklar, KAYNAĞIYLA.
//
// Asistanın maaş sorusuna bugüne kadar verdiği cevap prompt'ta birebir yazılı
// bir cümleydi: "Sistemde maaş beklentisi alanı tutulmuyor." Doğruydu ama
// kullanıcının sorduğu şey bu değildi: "bu role ne veriliyor" bir PİYASA
// sorusu, bir veritabanı sorusu değil.
//
// ── NEDEN ARAMA, NEDEN MODELİN HAFIZASI DEĞİL ───────────────────────────────
// Modelin hatırladığı bir maaş rakamı makul görünür, tarihsizdir ve kaynağı
// yoktur. Bu zincirin çıktısı bir BÜTÇE KARARI: birine yapılacak teklif.
// İzlenemeyen bir sayıyla teklif verdirmek, uydurmayı veri diye sunmaktır.
//
// ── KODUN DAYATTIĞI İKİ KURAL ───────────────────────────────────────────────
// 1. KAYNAK YOKSA RAKAM YOK. Model bir bant üretse bile, arama sonucu
//    gösteremiyorsak sayıyı GÖSTERMİYORUZ ve bunu söylüyoruz. Prompt'a
//    "kaynaksız yazma" demek yeterli değil; kural kodda duruyor.
// 2. BAZIN VARSAYILANI YOK. Kaynak brüt mü net mi demiyorsa boş kalır —
//    Türkiye'de bu fark %30-40 ve YANLIŞ OLDUĞU HÂLDE MAKUL göründüğü için
//    kimse fark etmez (gerekçe: utils/salaryBand.js).

import { askGrounded } from './grounded.js';
import { sanitizeForPrompt } from './utils.js';
import { foldTr } from '../../utils/turkishText.js';
import { normalizeBand } from '../../utils/salaryBand.js';

const RESEARCH_PROMPT = `
Sen deneyimli bir işe alım uzmanısın. Sana bir ROL, SEVİYE ve KONUM veriliyor.
Görevin bu rol için piyasadaki ücret aralığını ve yaygın yan hakları ARAYARAK
bulmak.

ARAMA ZORUNLU. Aklından sayı yazma. Bulduğun her rakam bir kaynağa dayanmalı;
dayanmıyorsa o satıra "yok" yaz. Uydurulmuş bir maaş rakamı, birine yapılacak
teklifin dayanağı olur.

TEK SAYI DEĞİL ARALIK. "Ortalama 100 bin" bir ölçüm değil, bir noktadır;
işe alımcı bandın iki ucunu bilmek zorunda. Kaynaklar yalnızca tek bir sayı
veriyorsa BANT_ALT ve BANT_UST'a aynı sayıyı yaz ve UYARI satırında bunu
söyle.

BAZI UYDURMA. Kaynak açıkça "brüt" ya da "net" demiyorsa BAZ satırına
"bilinmiyor" yaz. Türkiye'de aday genelde net konuşur ama "genelde" bir ölçüm
değildir ve yanlış baz farkı %30-40 kaydırır.

ÖNCE 2-3 CÜMLE DÜZ METİN YAZ: hangi kaynak ne söylüyor, sayılar nereden
geliyor. Bu bölüm süs değil — Google Arama ile grounding, alıntıları düz
metne bağlıyor. Yalnızca etiketli satır yazarsan cevap hiçbir sayfaya
bağlanmaz ve kaynaksız kaldığı için EKRANDA GÖSTERİLMEZ.

Sonra bir boş satır bırak ve şu etiketli satırları yaz:

BANT_ALT: yalnızca rakam (ayraçsız) ya da yok
BANT_UST: yalnızca rakam (ayraçsız) ya da yok
PARA_BIRIMI: TRY | USD | EUR
DONEM: aylik | yillik
BAZ: brut | net | bilinmiyor
TARIH: verinin ait olduğu dönem (ör. 2026 ilk yarı). Bilinmiyorsa bilinmiyor.
KAPSAM: kaynaklar NEYİ ölçüyor — hangi ülke/şehir, hangi seviye, ne tür veri
  (ilan taraması mı, anket mi). Tek cümle.
YAN_HAKLAR: bu rolde yaygın olan yan haklar, noktalı virgülle ayrılmış.
  Kaynaklarda geçmiyorsa yok yaz.
UYARI: okuyanın bu bandı yanlış kullanmasını engelleyecek tek cümle.
  Söylenecek bir şey yoksa bu satırı yazma.
`;

/** Modelin yazdığı dönem/baz etiketlerini sistemin sözlüğüne çevirir. */
const PERIOD_MAP = { aylik: 'monthly', monthly: 'monthly', yillik: 'yearly', yearly: 'yearly' };
const BASIS_MAP = { brut: 'gross', gross: 'gross', net: 'net' };

/** "yok", "bilinmiyor", "-" gibi cevapları boş sayar. */
const EMPTY = new Set(['yok', 'bilinmiyor', 'belirtilmemis', 'belirsiz', '-', 'n/a', 'na']);

const isEmptyAnswer = (v) => EMPTY.has(foldTr(String(v || '').trim()).toLowerCase());

/**
 * Sorgu metni — pozisyon başlığı + seviye + konumdan kurulur.
 *
 * Eksik parçalar UYDURULMAZ, "belirtilmemiş" olarak geçer: seviyesi
 * söylenmemiş bir rol için "senior" varsaymak, bandı sessizce yukarı çeker.
 */
export function buildMarketQuery({ title = '', level = '', location = '', subject = 'maas' } = {}) {
    const role = String(title || '').trim();
    const odak = subject === 'yan_haklar'
        ? 'Ağırlık YAN HAKLARDA olsun; ücret bandını yine de ver.'
        : 'Ağırlık ÜCRET BANDINDA olsun; yan hakları kısa geç.';
    return [
        RESEARCH_PROMPT,
        `ROL: ${sanitizeForPrompt(role || 'belirtilmemiş')}`,
        `SEVİYE: ${sanitizeForPrompt(String(level || '').trim() || 'belirtilmemiş')}`,
        `KONUM: ${sanitizeForPrompt(String(location || '').trim() || 'belirtilmemiş')}`,
        odak,
    ].join('\n\n');
}

/**
 * Etiketli satırları ayrıştırır.
 *
 * Arama araçları JSON şemasıyla birlikte çalışmadığı için düz metin
 * istiyoruz — aynı düzen terimExplainer'da da var.
 */
export function parseMarketAnswer(raw) {
    const text = String(raw || '').trim();
    const empty = {
        min: null, max: null, currency: 'TRY', period: 'monthly', basis: null,
        date: '', scope: '', benefits: [], caution: '',
    };
    if (!text) return empty;

    // Eşleştirme KATLANMIŞ metinle: modelin "İ" harfi bazen tek kod noktası,
    // bazen 'i' + birleşik nokta geliyor. Bu tuzağı bu projede beşinci kez
    // görüyoruz (bkz. utils/turkishText.js).
    const grab = (label) => {
        const folded = foldTr(label);
        for (const line of text.split(/\r?\n/)) {
            const at = line.indexOf(':');
            if (at === -1) continue;
            if (foldTr(line.slice(0, at)).trim() === folded) return line.slice(at + 1).trim();
        }
        return '';
    };

    // Rakam dışındaki her şey atılır: "90.000 TL" de "90 000" de aynı sayı.
    const num = (v) => {
        if (isEmptyAnswer(v)) return null;
        const digits = String(v).replace(/[^\d]/g, '');
        if (!digits) return null;
        const n = Number(digits);
        return Number.isFinite(n) && n > 0 ? n : null;
    };

    const currency = String(grab('PARA_BIRIMI') || '').trim().toUpperCase();
    const period = PERIOD_MAP[foldTr(grab('DONEM')).toLowerCase()] || 'monthly';
    const basis = BASIS_MAP[foldTr(grab('BAZ')).toLowerCase()] || null;
    const benefitsRaw = grab('YAN_HAKLAR');

    return {
        min: num(grab('BANT_ALT')),
        max: num(grab('BANT_UST')),
        currency: ['TRY', 'USD', 'EUR'].includes(currency) ? currency : 'TRY',
        period,
        basis,
        date: isEmptyAnswer(grab('TARIH')) ? '' : grab('TARIH'),
        scope: grab('KAPSAM'),
        benefits: isEmptyAnswer(benefitsRaw)
            ? []
            : benefitsRaw.split(/[;•]/).map((s) => s.trim()).filter(Boolean).slice(0, 8),
        caution: grab('UYARI'),
    };
}

/**
 * Piyasa araştırması yapar.
 *
 * @param {{title: string, level?: string, location?: string, subject?: string}} input
 * @returns {Promise<{
 *   band: object|null,
 *   withheld: boolean,
 *   grounded: boolean,
 *   date: string, scope: string, benefits: string[], caution: string,
 *   sources: Array<{title: string, uri: string}>,
 *   searchSuggestionHtml: string,
 *   query: {title: string, level: string, location: string},
 * }>}
 *   withheld=true: model bir bant üretti ama KAYNAK gösteremedi; sayı
 *   gizlendi. Bu bir hata değil, kuralın çalışması.
 */
export async function researchMarket({ title = '', level = '', location = '', subject = 'maas' } = {}) {
    const answer = await askGrounded(
        buildMarketQuery({ title, level, location, subject }),
        { maxOutputTokens: 1024 }
    );
    const parsed = parseMarketAnswer(answer.text);
    const sources = Array.isArray(answer.sources) ? answer.sources : [];
    const searchQueries = Array.isArray(answer.searchQueries) ? answer.searchQueries : [];

    // KAYNAKSIZ RAKAM GÖSTERİLMEZ — kural burada, prompt'ta değil. Modele
    // "kaynaksız yazma" demek bir dilek; bu bir kısıt.
    const parsedBand = normalizeBand(parsed);
    const band = sources.length > 0 ? parsedBand : null;

    return {
        band,
        withheld: sources.length === 0 && parsedBand !== null,
        // NEDEN gizlendi — canlıda ikisi karıştı. Arama hiç yapılamamış olmakla,
        // arama yapılıp hiçbir sayfanın kaynak gösterilmemesi farklı şeyler ve
        // kullanıcı ekranda Google'ın arama bloğunu görürken "hiçbir kaynağa
        // dayanmıyor" cümlesini okuyunca haklı olarak çelişki görüyor.
        withheldReason: sources.length > 0
            ? ''
            : (searchQueries.length > 0 ? 'searched-uncited' : 'not-searched'),
        searchQueries,
        grounded: Boolean(answer.grounded),
        date: parsed.date,
        scope: parsed.scope,
        benefits: parsed.benefits,
        caution: parsed.caution,
        sources,
        searchSuggestionHtml: answer.searchSuggestionHtml || '',
        query: {
            title: String(title || '').trim(),
            level: String(level || '').trim(),
            location: String(location || '').trim(),
        },
    };
}
