// Gereksinim gözden geçirme — ÖLÇÜM katmanı.
//
// Skorlama artık gereksinimleri sadık biçimde yansıtıyor. Bunun yan etkisi:
// gereksinimler sistemin en büyük kaldıracı hâline geldi ve onları kimse
// denetlemiyor. Ezbere yazılmış bir madde ("PLG deneyimi") artık sessizce
// değil, çok net biçimde aday eliyor.
//
// Buradaki hiçbir sayı AI'dan gelmez. Hepsi adayların kayıtlı madde bazlı
// değerlendirmelerinden (positionAnalyses[title].requirementCoverage) sayılır.
// AI yalnızca en sonda, ölçülmüş bulgular için alternatif ifade önerir —
// "bu gereksinim gerekli mi?" diye modele sormak, bugün iki kez yaşadığımız
// genel-cevap tuzağına düşerdi.

import { requirementsOf, requirementsFingerprint } from './positionRequirements';

/** Anlamlı oran üretmek için gereken en az değerlendirilmiş aday sayısı. */
export const MIN_SAMPLE = 5;

/**
 * Bir zorunlu maddeyi "havuzu daraltıyor" saymak için eleme eşiği.
 *
 * Önce %80'di ve pratikte hiçbir şey yakalamıyordu: gerçek bir ilanda en çok
 * eleyen zorunlu madde %63'te kaldı ve işaretlenmedi. Adayların üçte ikisini
 * eleyen bir madde kesinlikle bakılmayı hak ediyor.
 */
export const OVER_RESTRICTIVE_RATE = 0.6;

/** Bir maddeyi "karşılıyor" saymak: met ve partial. */
const isMet = (status) => status === 'met' || status === 'partial';

/** Adayın BU pozisyon için kayıtlı analizi. */
function analysisFor(candidate, positionTitle) {
    return candidate?.positionAnalyses?.[positionTitle] || null;
}

/** Adayın BU pozisyon için kayıtlı madde değerlendirmeleri. */
function assessmentsFor(candidate, positionTitle) {
    const analysis = analysisFor(candidate, positionTitle);
    const direct = analysis?.requirementCoverage?.assessments;
    if (Array.isArray(direct)) return direct;
    const nested = analysis?.scoreData?.requirementCoverage?.assessments;
    return Array.isArray(nested) ? nested : null;
}

/**
 * Her gereksinim için havuz etkisi.
 *
 * @param {object} position
 * @param {Array} candidates — tüm aday havuzu
 * @returns {{
 *   scanned: number,           // bu pozisyon için derin taraması olan aday
 *   enoughData: boolean,       // oran üretmeye yetiyor mu
 *   items: Array<{
 *     index: number, text: string, must: boolean|null, kind: 'deneyim'|'arac'|null,
 *     evaluated: number, eliminated: number, eliminationRate: number|null,
 *     redundantWith: number[], flags: string[]
 *   }>
 * }}
 */
export function reviewRequirements(position, candidates) {
    const reqs = requirementsOf(position).map((r, i) => ({ ...r, index: i + 1 }));
    const title = position?.title;
    if (reqs.length === 0 || !title) {
        return { scanned: 0, fresh: 0, stale: 0, enoughData: false, items: [], mustCount: 0, mustEvaluated: 0, mustPass: null, mustPassRate: null };
    }

    // index → aday başına durum. Yalnızca değerlendirilmiş adaylar sayılır;
    // taranmamış adayı "eksik" saymak oranı tamamen uydurma yapardı.
    const statusByIndex = new Map(reqs.map((r) => [r.index, []]));
    const kindByIndex = new Map();
    let scanned = 0;

    for (const c of candidates || []) {
        const assessments = assessmentsFor(c, title);
        if (!assessments) continue;
        scanned += 1;
        for (const a of assessments) {
            const idx = Number(a?.index);
            if (!statusByIndex.has(idx)) continue;
            const status = String(a?.status || '').toLowerCase();
            statusByIndex.get(idx).push(status);
            if (!kindByIndex.has(idx) && a?.kind) {
                kindByIndex.set(idx, String(a.kind).toLowerCase().startsWith('ara') ? 'arac' : 'deneyim');
            }
        }
    }

    // Analizler HANGİ gereksinim metnine ait? Metin değişince kayıtlı
    // değerlendirmeler eskir ama görünüşte hiçbir şey değişmez: panel eski
    // yargıyı göstermeye devam eder ve kullanıcı uyguladığı öneriyi tekrar
    // tekrar alır. Damgayı karşılaştırıp bunu söyleyebiliyoruz.
    const currentFingerprint = requirementsFingerprint(position);
    let fresh = 0;
    for (const c of candidates || []) {
        const a = analysisFor(c, title);
        if (!a || !assessmentsFor(c, title)) continue;
        if (a.requirementsFingerprint === currentFingerprint) fresh += 1;
    }
    const stale = scanned - fresh;

    const enoughData = scanned >= MIN_SAMPLE;

    const items = reqs.map((r) => {
        const statuses = statusByIndex.get(r.index) || [];
        const evaluated = statuses.length;
        const eliminated = statuses.filter((s) => s === 'missing').length;
        return {
            index: r.index,
            text: r.text,
            must: r.must,
            kind: kindByIndex.get(r.index) || null,
            evaluated,
            eliminated,
            eliminationRate: evaluated >= MIN_SAMPLE ? eliminated / evaluated : null,
            redundantWith: [],
            flags: [],
        };
    });

    // ── Fazlalık: iki madde adayları neredeyse aynı biçimde ayırıyorsa,
    // ikincisi yeni bilgi taşımıyor demektir.
    if (enoughData) {
        for (let i = 0; i < items.length; i++) {
            for (let j = i + 1; j < items.length; j++) {
                const a = statusByIndex.get(items[i].index) || [];
                const b = statusByIndex.get(items[j].index) || [];
                const n = Math.min(a.length, b.length);
                if (n < MIN_SAMPLE) continue;
                let agree = 0;
                for (let k = 0; k < n; k++) if (isMet(a[k]) === isMet(b[k])) agree += 1;
                // Her iki madde de herkes tarafından karşılanıyorsa bu
                // "fazlalık" değil "ayırt etmiyor"dur; onu ayrı bayrak yakalar.
                const bothUniversal = items[i].eliminationRate === 0 && items[j].eliminationRate === 0;
                if (!bothUniversal && agree / n >= 0.9) {
                    items[i].redundantWith.push(items[j].index);
                    items[j].redundantWith.push(items[i].index);
                }
            }
        }
    }

    for (const it of items) {
        // Zorunlu işaretli bir ARAÇ her zaman şüphelidir: aracı bilmek işi
        // yapmış olmakla aynı şey değil ve araç öğrenilebilir.
        if (it.must === true && it.kind === 'arac') it.flags.push('tool-must');
        if (it.eliminationRate !== null) {
            if (it.must === true && it.eliminationRate >= OVER_RESTRICTIVE_RATE) it.flags.push('over-restrictive');
            if (it.eliminationRate === 0) it.flags.push('no-signal');
        }
        if (it.redundantWith.length > 0) it.flags.push('redundant');
    }

    // ── BİRLEŞİK GEÇİŞ: tüm zorunlu maddeleri karşılayan aday sayısı.
    //
    // Tek tek eleme oranları ilanın gerçek darlığını göstermiyor. Adaylar
    // FARKLI maddelerde elendiği için, hiçbir madde tek başına yüksek
    // görünmese bile hepsini birden geçen aday sayısı çok düşük olabilir.
    // Kullanıcının aslında ihtiyaç duyduğu sayı bu.
    const mustIndexes = reqs.filter((r) => r.must === true).map((r) => r.index);
    let mustPass = null;
    let mustEvaluated = 0;
    if (mustIndexes.length > 0) {
        mustPass = 0;
        for (const c of candidates || []) {
            const assessments = assessmentsFor(c, title);
            if (!assessments) continue;
            const byIdx = new Map(
                assessments
                    .filter((a) => Number.isFinite(Number(a?.index)))
                    .map((a) => [Number(a.index), String(a?.status || '').toLowerCase()])
            );
            // Değerlendirilmemiş zorunlu maddesi olan aday sayıma girmez —
            // "geçti" de "kaldı" da diyemeyiz.
            if (!mustIndexes.every((i) => byIdx.has(i))) continue;
            mustEvaluated += 1;
            if (mustIndexes.every((i) => isMet(byIdx.get(i)))) mustPass += 1;
        }
    }

    return {
        scanned,
        fresh,
        stale,
        enoughData,
        items,
        mustCount: mustIndexes.length,
        mustEvaluated,
        mustPass,
        mustPassRate: mustEvaluated >= MIN_SAMPLE ? mustPass / mustEvaluated : null,
    };
}

/** Gözden geçirmeye değer maddeler — AI önerisi yalnızca bunlar için istenir. */
export function flaggedRequirements(review) {
    return (review?.items || []).filter((it) => it.flags.length > 0);
}

/** Bayrak açıklamaları — arayüz metni tek yerden. */
export const FLAG_LABELS = {
    'tool-must': {
        title: 'Zorunlu işaretli bir araç',
        detail: 'Aracı bilmek işi yapmış olmakla aynı şey değil; araç öğrenilebilir. Tercihene almayı düşünün.',
    },
    'over-restrictive': {
        title: 'Havuzu çok daraltıyor',
        detail: 'Değerlendirilen adayların büyük bölümü yalnızca bu zorunlu madde yüzünden eleniyor.',
    },
    'no-signal': {
        title: 'Ayırt etmiyor',
        detail: 'Değerlendirilen her aday bu maddeyi karşılıyor; madde seçim yapmıyor.',
    },
    redundant: {
        title: 'Başka bir maddeyle örtüşüyor',
        detail: 'Bu madde adayları başka bir maddeyle neredeyse aynı biçimde ayırıyor; yeni bilgi taşımıyor.',
    },
};

/**
 * Seçilen gereksinimlere göre aday listesi.
 *
 * Panel "31/86 eleniyor" diyor ama KİMLER olduğunu göstermiyordu. Asıl
 * kullanım şu: birkaç maddeyi seçip "bunları kaldırsam kim havuza geri
 * girer?" sorusunu canlı görmek. Sayı tek başına bu kararı verdirmiyor.
 *
 * @param {object} position
 * @param {Array} candidates
 * @param {{indexes: number[], mode?: 'meets'|'misses'}} options
 *   - meets  : SEÇİLEN MADDELERİN TAMAMINI karşılayanlar
 *   - misses : seçilenlerden EN AZ BİRİNİ karşılamayanlar
 * @returns {{matched: Array, evaluated: number, skipped: number}}
 *   skipped: seçilen maddelerden biri hiç değerlendirilmemiş adaylar —
 *   onlara "karşılıyor" da "karşılamıyor" da diyemeyiz, sayıma girmezler.
 */
export function candidatesByRequirements(position, candidates, { indexes = [], mode = 'meets' } = {}) {
    const title = position?.title;
    if (!title || indexes.length === 0) return { matched: [], evaluated: 0, skipped: 0 };

    const matched = [];
    let evaluated = 0;
    let skipped = 0;

    for (const c of candidates || []) {
        const assessments = assessmentsFor(c, title);
        if (!assessments) continue;
        const byIdx = new Map(
            assessments
                .filter((a) => Number.isFinite(Number(a?.index)))
                .map((a) => [Number(a.index), String(a?.status || '').toLowerCase()])
        );
        if (!indexes.every((i) => byIdx.has(i))) { skipped += 1; continue; }
        evaluated += 1;
        const meetsAll = indexes.every((i) => isMet(byIdx.get(i)));
        if (mode === 'meets' ? meetsAll : !meetsAll) matched.push(c);
    }

    return { matched, evaluated, skipped };
}
