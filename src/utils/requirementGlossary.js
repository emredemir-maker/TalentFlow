// Gereksinim sözlüğü — "bu madde bu işte neyi ölçüyor?"
//
// İhtiyaç şuradan çıktı: bir aday değerlendirmesinde "GA4 hakimiyeti"
// yazıyor ve kullanıcı bunun O İŞTE ne için istendiğini göremiyor. Madde
// metni ne ölçtüğünü söylemez; herkes kafasında farklı bir şey anlar ve
// "karşılıyor" damgası olduğundan fazlasını ifade etmeye başlar.
//
// Sözlük üç şey söyler:
//   olcut    — bu madde aslında hangi yetkinliği ölçmeye çalışıyor
//   sinyaller— CV'de bunun kanıtı olarak neye bakılır
//   olcmez   — bu maddenin ölçMEDİĞİ, ama ölçüyor sanılan şey
//
// Üçüncüsü en kıymetlisi. "GA4 hakimiyeti" veri okuma yetkinliğini ölçer,
// veri ALTYAPISI kurmayı ölçmez. Yazılmazsa madde şişer.
//
// SAKLAMA: sözlük pozisyona yazılır ve gereksinim parmak iziyle damgalanır.
// Metin değişince sözlük eskir ve bunu SÖYLERİZ — sessizce eski tanımı
// göstermek, tam da gereksinim panelinde düzelttiğimiz hatanın aynısı olurdu.

import { requirementsOf, requirementsFingerprint } from './positionRequirements';

/** Sözlük girdisinin serbest metin alanları — hepsi isteğe bağlı. */
const TEXT_FIELDS = ['olcut', 'sinyaller', 'olcmez'];

/** Tek bir girdiyi güvenli hâle getirir; eksik alan boş string olur. */
function normalizeEntry(raw, index, text) {
    const entry = { index, text };
    for (const f of TEXT_FIELDS) {
        entry[f] = typeof raw?.[f] === 'string' ? raw[f].trim() : '';
    }
    return entry;
}

/** Girdide gösterilecek bir şey var mı? */
export function hasContent(entry) {
    return TEXT_FIELDS.some((f) => Boolean(entry?.[f]));
}

/**
 * Pozisyonun kayıtlı sözlüğü.
 *
 * @returns {{
 *   entries: Array<{index, text, olcut, sinyaller, olcmez}>,
 *   byIndex: Map<number, object>,
 *   stale: boolean,     // gereksinimler sözlük üretildikten sonra değişti mi
 *   missing: boolean,   // hiç üretilmemiş mi
 *   generatedAt: any,
 * }}
 */
export function glossaryFor(position) {
    const reqs = requirementsOf(position);
    const stored = position?.requirementGlossary;
    const rawEntries = Array.isArray(stored?.entries) ? stored.entries : [];

    // Girdiler madde NUMARASINA bağlı. Eşleştirmeyi numaradan yapıyoruz ama
    // metni GÜNCEL listeden alıyoruz; böylece bayat bir sözlük yanlış madde
    // metnini gösteremez.
    const byRaw = new Map(rawEntries.map((e) => [Number(e?.index), e]));
    const entries = reqs.map((r, i) => normalizeEntry(byRaw.get(i + 1), i + 1, r.text));

    const missing = rawEntries.length === 0;
    const stale = !missing && stored?.fingerprint !== requirementsFingerprint(position);

    return {
        entries,
        byIndex: new Map(entries.map((e) => [e.index, e])),
        stale,
        missing,
        generatedAt: stored?.generatedAt || null,
    };
}

/** Tek maddenin sözlük girdisi — arayüzde satır başına çağrılır. */
export function glossaryEntry(position, index) {
    return glossaryFor(position).byIndex.get(Number(index)) || null;
}

/**
 * AI çıktısını pozisyona yazılacak hâle getirir.
 *
 * Parmak izi burada damgalanır: sözlüğün HANGİ gereksinim metnine ait olduğu
 * kaydın içinde durur, tahmin edilmez.
 *
 * @param {object} position
 * @param {Array} aiEntries — modelin döndürdüğü ham girdiler
 * @param {any} generatedAt — çağıranın verdiği zaman damgası (saf kalsın diye)
 */
export function buildGlossaryRecord(position, aiEntries, generatedAt = null) {
    const reqs = requirementsOf(position);
    const byRaw = new Map((Array.isArray(aiEntries) ? aiEntries : []).map((e) => [Number(e?.index), e]));
    const entries = reqs
        .map((r, i) => normalizeEntry(byRaw.get(i + 1), i + 1, r.text))
        // Metin alanını saklamıyoruz: madde metni zaten pozisyonda duruyor,
        // iki kopya tutmak ikisinin ayrışmasına davetiye olur.
        .map(({ index, olcut, sinyaller, olcmez }) => ({ index, olcut, sinyaller, olcmez }))
        .filter((e) => TEXT_FIELDS.some((f) => e[f]));

    return {
        fingerprint: requirementsFingerprint(position),
        generatedAt,
        entries,
    };
}
