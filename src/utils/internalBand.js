// KENDİ İLANLARINIZIN BANDI — dışarıdan değil, içeriden.
//
// Piyasa araştırması (services/ai/marketResearch.js) dışarıya bakar ve bir AI
// çağrısı yakar. Bu dosya hiçbir şey yakmaz: kendi açık ilanlarınızın bütçe
// bantlarını toplar. Kendi verimiz, ölçülmüş ve tartışmasız.
//
// ── ÇEVRİM YOK, BU YÜZDEN KARIŞIK BİRİM YOK ─────────────────────────────────
// Bantlar farklı birimlerde tutulmuş olabilir (biri yıllık USD, öbürü aylık
// TRY brüt). Bunları tek bir aralıkta toplamak, kur ve dönem uydurmak
// demektir — projenin baştan reddettiği şey (utils/salaryBand.js). Aynı
// birimden yeterli ilan yoksa SAYI VERİLMEZ, sebebi yazılır.
//
// ── EŞİK ────────────────────────────────────────────────────────────────────
// İki ilandan bir "bant" çıkarmak istatistik değil, kılık değiştirmiş tahmin.
// Aynı gerekçe maaş zincirinin 4/4 adımında da yazılı.

import { normalizeBand, BASIS_LABEL, PERIOD_LABEL } from './salaryBand';

/** Referans verebilmek için gereken en az ilan sayısı. */
export const MIN_POSITIONS = 3;

const norm = (s) => String(s || '').trim().toLocaleLowerCase('tr');

/**
 * Kendi ilanlarınızdan referans bant.
 *
 * @param {Array} positions
 * @param {{department?: string, excludeTitle?: string}} filter
 * @returns {{band: object|null, count: number, titles: string[], reason: string, mixedUnits: boolean}}
 *   band null ise `reason` NEDEN olmadığını söyler — boş dönmek yetmez,
 *   kullanıcı sayının yokluğunu "band yok" mu "yeterli veri yok" mu diye
 *   ayırt edebilmeli.
 */
export function internalBand(positions = [], { department = '', excludeTitle = '' } = {}) {
    const wantedDept = norm(department);
    const skip = norm(excludeTitle);

    const usable = [];
    let withoutBand = 0;
    let withoutBasis = 0;

    for (const p of Array.isArray(positions) ? positions : []) {
        if (!p) continue;
        if (skip && norm(p.title) === skip) continue;
        if (wantedDept && norm(p.department) !== wantedDept) continue;
        const band = normalizeBand(p.salaryBand);
        if (!band) { withoutBand += 1; continue; }
        // BAZI OLMAYAN BAND REFERANS OLAMAZ: brüt mü net mi bilinmeyen bir
        // sayı, karşılaştırılabilir bir ölçüm değil.
        if (!band.basis) { withoutBasis += 1; continue; }
        usable.push({ title: String(p.title || ''), band });
    }

    if (usable.length === 0) {
        return {
            band: null, count: 0, titles: [], mixedUnits: false,
            reason: withoutBand + withoutBasis > 0
                ? `Bütçe bandı tanımlı ilan yok (${withoutBand} ilanda band yok, ${withoutBasis} ilanda brüt/net belirtilmemiş).`
                : 'Karşılaştırılacak ilan bulunamadı.',
        };
    }

    // Birim başına grupla; en kalabalık grup temsil eder. Grupları birleştirmek
    // kur ve dönem uydurmak olurdu.
    const groups = new Map();
    for (const item of usable) {
        const key = `${item.band.currency}|${item.band.period}|${item.band.basis}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    }
    const ranked = [...groups.values()].sort((a, b) => b.length - a.length);
    const best = ranked[0];
    const mixedUnits = ranked.length > 1;

    if (best.length < MIN_POSITIONS) {
        const { currency, period, basis } = best[0].band;
        return {
            band: null, count: best.length, titles: best.map((x) => x.title), mixedUnits,
            reason: mixedUnits
                ? `Bantlar farklı birimlerde (en kalabalık grup ${best.length} ilan: ${currency}, `
                  + `${PERIOD_LABEL[period]}, ${BASIS_LABEL[basis]}). Çevrim yapmıyoruz; `
                  + `referans için aynı birimden en az ${MIN_POSITIONS} ilan gerekiyor.`
                : `Yalnızca ${best.length} ilanda karşılaştırılabilir band var; referans vermek için `
                  + `en az ${MIN_POSITIONS} gerekiyor. Az veriden bant üretmek istatistik değil, tahmindir.`,
        };
    }

    // Gözlenen aralık: en düşük alt uç, en yüksek üst uç. Tek uçlu bantlarda
    // (yalnız tavan) var olan uç kullanılır — yarısını uydurmuyoruz.
    let low = Infinity;
    let high = -Infinity;
    for (const { band } of best) {
        const a = band.min ?? band.max;
        const b = band.max ?? band.min;
        if (a != null) low = Math.min(low, a);
        if (b != null) high = Math.max(high, b);
    }
    const { currency, period, basis } = best[0].band;

    return {
        band: { min: low, max: high, currency, period, basis },
        count: best.length,
        titles: best.map((x) => x.title).slice(0, 6),
        mixedUnits,
        reason: '',
    };
}
