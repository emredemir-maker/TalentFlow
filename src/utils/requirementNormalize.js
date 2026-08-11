// Düz metin gereksinimleri DÜZENLİ maddelere çevirmenin doğrulama katmanı.
//
// Sorun canlıda görüldü: tek bir madde üç ayrı şey soruyordu —
//   "PLG/self-servis akış, fiyatlandırma-paketleme, CX-helpdesk-CRM ürün geçmişi"
// Aday bunlardan birine sahipse model "kısmen" diyor ve YARIM puan veriyor.
// Yani kritik bir eksiğin bedeli tavanda ~4 puanda kalıyor; zorunlu kapısı da
// hiç yanmıyor çünkü "kısmen" knockout sayılmaz.
//
// Çözüm maddeleri girişte atomik hâle getirmek. Bölme işi dile ait, yani
// modelin; ama modelin GEREKSİNİM UYDURMASI kabul edilemez — ilan metnini
// değiştirir, adayları etkiler.
//
// Bu dosya o güvenceyi verir: kod, önerilen maddelerin gerçekten girdideki
// içerikten geldiğini doğrular. Model önerir, kod denetler, kullanıcı onaylar.

import { foldTr } from './turkishText';

// Anlam taşımayan kelimeler. KATLANMIŞ tutulur: karşılaştırma da katlanmış
// metinle yapılıyor, ham hâlde bırakılsa 'geçmişi' hiçbir zaman eşleşmez ve
// her maddede taşınan kelimeler içerik sanılırdı.
const NOISE = new Set([
    've', 'veya', 'ile', 'bir', 'bu', 'da', 'de', 'için', 'olan', 'olarak',
    'en', 'az', 'çok', 'gibi', 'her', 'tüm', 'the', 'and', 'or', 'of', 'in',
    'deneyim', 'deneyimi', 'tecrübe', 'tecrübesi', 'bilgisi', 'yetkinlik',
    'geçmişi', 'geçmiş', 'olmak', 'sahibi', 'konusunda', 'alanında', 'yapmış',
    'yapmis', 'edilmiş', 'kurmuş', 'minimum', 'yıl', 'yil',
].map(foldTr));

/**
 * Bir maddenin anlam taşıyan kelimeleri.
 *
 * Eşik iki harf: "CX", "UX", "C#", "JS" gerçek terimler ve tam da bu
 * özelliğin peşinde olduğu şeyler. Üç harf eşiği CX'i görünmez yapıyordu —
 * yani modelin CX'i düşürmesini fark edemezdik.
 */
export function significantWords(text) {
    return foldTr(text)
        .split(/[^\p{L}\p{N}+#]+/u)
        .map((w) => w.trim())
        .filter((w) => w.length >= 2 && !NOISE.has(w));
}

/** Öncelik metne değil, işarete aittir. Metinde geçerse çelişki doğar. */
const PRIORITY_PHRASES = [
    'tercih sebebi', 'tercihen', 'tercih edilir', 'artı olur', 'arti olur',
    'avantaj', 'olmasi iyi olur', 'olması iyi olur', 'plus', 'nice to have',
    'zorunlu', 'olmazsa olmaz', 'sart', 'şart',
];

/**
 * Metninde öncelik ifadesi geçen maddeler.
 *
 * Canlı örnek: "… (tercih sebebi)" yazan bir madde ZORUNLU işaretliydi. Model
 * değerlendirirken metni okuyor ve "tercih sebebi" görünce yumuşuyor — yani
 * işaret bir şey, metin başka bir şey söylüyor ve model metne inanıyor.
 *
 * @returns {Array<{index:number, text:string, phrase:string, must:boolean|null}>}
 */
export function priorityInText(items) {
    const found = [];
    (items || []).forEach((it, i) => {
        const folded = foldTr(it?.text);
        const phrase = PRIORITY_PHRASES.find((p) => folded.includes(foldTr(p)));
        if (phrase) found.push({ index: i + 1, text: it?.text || '', phrase, must: it?.must ?? null });
    });
    return found;
}

/**
 * Kelime havuzda var mı — EK TOLERANSLI.
 *
 * Türkçe sondan eklemeli: "ürün" ile "ürünü" aynı şeydir ama string olarak
 * eşit değildir. Tam eşitlik arayan ilk sürüm, modelin doğru yaptığı yeniden
 * yazımları "kayıp" sanıyordu. Ortak önek yeterli.
 */
const STEM_MIN = 4;

function inPool(word, pool) {
    if (pool.has(word)) return true;
    for (const p of pool) {
        const n = Math.min(word.length, p.length);
        if (n >= STEM_MIN && word.slice(0, n) === p.slice(0, n)) return true;
    }
    return false;
}

/** İki metin aynı içeriği mi taşıyor? (kelime örtüşmesi) */
function overlapRatio(words, pool) {
    if (words.length === 0) return 1;
    const hit = words.filter((w) => inPool(w, pool)).length;
    return hit / words.length;
}

/**
 * Öncelik ifadeleri havuzdan düşer.
 *
 * "(tercih sebebi)" ibaresinin metinden çıkarılması DÜZELTMEDİR, kayıp değil —
 * öncelik işaretle söylenir. Havuzda bırakılsaydı doğru davranışı hata olarak
 * raporlardık.
 */
function contentPool(text) {
    let cleaned = foldTr(text);
    for (const p of PRIORITY_PHRASES) cleaned = cleaned.split(foldTr(p)).join(' ');
    return new Set(significantWords(cleaned));
}

/** Önerilen bir maddenin girdiden gelmiş sayılması için gereken en az örtüşme. */
export const MIN_OVERLAP = 0.6;

/**
 * Önerilen maddeleri girdiye karşı doğrular.
 *
 * İki risk var ve ikisi de sessizce ilan metnini bozar:
 *   uydurma — girdide olmayan bir gereksinim eklenmiş
 *   kayıp   — girdideki bir konu hiçbir maddeye girmemiş
 *
 * @param {string} originalText — kullanıcının yazdığı ham metin (iki kutu birleşik)
 * @param {Array<{text:string, must:boolean}>} proposed
 * @returns {{
 *   ok: boolean,
 *   invented: Array<{text:string, unknownWords:string[]}>,
 *   dropped: string[],
 * }}
 */
export function verifyNormalization(originalText, proposed) {
    const pool = contentPool(originalText);
    const items = Array.isArray(proposed) ? proposed : [];

    const invented = [];
    for (const it of items) {
        const words = significantWords(it?.text);
        if (overlapRatio(words, pool) >= MIN_OVERLAP) continue;
        invented.push({
            text: it?.text || '',
            unknownWords: words.filter((w) => !pool.has(w)),
        });
    }

    // Kayıp: girdideki anlamlı kelimelerden hiçbir maddede geçmeyenler.
    const covered = new Set(items.flatMap((it) => significantWords(it?.text)));
    const dropped = [...pool].filter((w) => !inPool(w, covered));

    return { ok: invented.length === 0 && dropped.length === 0, invented, dropped };
}

/**
 * Önce/sonra karşılaştırması — kullanıcı onaylamadan hiçbir şey değişmez.
 *
 * @returns {{
 *   before: number, after: number,
 *   split: number,      // bölünerek artan madde sayısı
 *   unchanged: Array<string>,
 *   added: Array<{text:string, must:boolean}>,
 *   removed: Array<string>,
 * }}
 */
export function normalizationDiff(beforeItems, afterItems) {
    const before = (beforeItems || []).map((r) => (typeof r === 'string' ? r : r?.text || ''));
    const after = (afterItems || []).map((r) => ({ text: r?.text || '', must: Boolean(r?.must) }));

    const beforeSet = new Set(before.map((t) => foldTr(t).trim()));
    const afterSet = new Set(after.map((r) => foldTr(r.text).trim()));

    return {
        before: before.length,
        after: after.length,
        split: Math.max(0, after.length - before.length),
        unchanged: before.filter((t) => afterSet.has(foldTr(t).trim())),
        added: after.filter((r) => !beforeSet.has(foldTr(r.text).trim())),
        removed: before.filter((t) => !afterSet.has(foldTr(t).trim())),
    };
}
