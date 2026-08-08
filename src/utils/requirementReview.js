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

import { requirementsOf } from './positionRequirements';

/** Anlamlı oran üretmek için gereken en az değerlendirilmiş aday sayısı. */
export const MIN_SAMPLE = 5;

/** Bir maddeyi "karşılıyor" saymak: met ve partial. */
const isMet = (status) => status === 'met' || status === 'partial';

/** Adayın BU pozisyon için kayıtlı madde değerlendirmeleri. */
function assessmentsFor(candidate, positionTitle) {
    const analysis = candidate?.positionAnalyses?.[positionTitle];
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
        return { scanned: 0, enoughData: false, items: [] };
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
            if (it.must === true && it.eliminationRate >= 0.8) it.flags.push('over-restrictive');
            if (it.eliminationRate === 0) it.flags.push('no-signal');
        }
        if (it.redundantWith.length > 0) it.flags.push('redundant');
    }

    return { scanned, enoughData, items };
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
        detail: 'Değerlendirilen adayların büyük bölümü bu zorunlu maddede eleniyor.',
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
