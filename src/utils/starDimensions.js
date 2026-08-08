// STAR boyutlarının okunması — iki biçim bir arada.
//
// ESKİ biçim: { score: 1-10, reason: "Pozitif (+): … Negatif (-): …" }
// YENİ biçim: { score: 0-3, evidence, missing, conflict }
//
// Neden değişti: eski biçim her boyut için bir POZİTİF ve bir NEGATİF
// istiyordu. Ölçülen şey ("CV'de ne kadar kanıt var") tek kutuplu olduğu için
// negatif tarafta yazacak gerçek bir şey çoğu zaman yoktu; model kaçamak
// üretiyordu. Sonuç, aynı boyutta çelişen iki cümle:
//   Pozitif: "bağlamı net bir şekilde belirtiyor"
//   Negatif: "başlangıç durumları daha detaylı açıklanabilirdi"
//
// Daha kötüsü, o "negatif"lerin çoğu kusur değil EKSİK BİLGİYDİ — aday
// gizlilik yükümlülüğü ya da yer kısıtı yüzünden yazmamıştı. Artık üç ayrı
// kova var ve eksik bilgi mülakat sorusuna dönüşüyor.

export const STAR_KEYS = ['Situation', 'Task', 'Action', 'Result'];

/** 0-3 çapalarının insan okunur karşılığı. */
export const ANCHOR_LABELS = ['Bilgi yok', 'Anılmış', 'Anlatılmış', 'Ölçülmüş'];

/** Eski "Pozitif (+): … Negatif (-): …" metnini ikiye böler. */
function splitLegacyReason(text) {
    const raw = String(text || '');
    if (!raw.trim()) return { positive: '', negative: '' };
    const parts = raw.split('Negatif (-):');
    return {
        positive: parts[0].replace('Pozitif (+):', '').trim(),
        negative: (parts[1] || '').trim(),
    };
}

/**
 * Bir STAR boyutunu biçimden bağımsız okur.
 *
 * @returns {{score: number, max: number, evidence: string, missing: string,
 *            conflict: string, legacy: boolean}}
 */
export function normalizeStarDimension(raw, { scaleMax } = {}) {
    if (raw === null || raw === undefined) {
        return { score: 0, max: scaleMax || 3, evidence: '', missing: '', conflict: '', legacy: false };
    }
    if (typeof raw === 'number') {
        return { score: raw, max: scaleMax || (raw > 3 ? 10 : 3), evidence: '', missing: '', conflict: '', legacy: false };
    }

    const score = Number(raw.score ?? 0) || 0;
    const max = scaleMax || (score > 3 ? 10 : 3);

    // Yeni biçim
    if (raw.evidence !== undefined || raw.missing !== undefined || raw.conflict !== undefined) {
        return {
            score, max,
            evidence: String(raw.evidence || '').trim(),
            missing: String(raw.missing || '').trim(),
            conflict: String(raw.conflict || '').trim(),
            legacy: false,
        };
    }

    // Eski biçim — negatifi "eksik bilgi" kovasına koyuyoruz. Çelişki olarak
    // saymıyoruz: o metinlerin çoğu gerçek bir tutarsızlık değil, yalnızca
    // CV'de bulunmayan bilgiydi. Çelişki gibi göstermek eski adaylara
    // haksızlık olurdu.
    const { positive, negative } = splitLegacyReason(raw.reason);
    const meaningless = /^(yok|yoktur|-|—)\.?$/i.test(negative);
    return {
        score, max,
        evidence: positive,
        missing: meaningless ? '' : negative,
        conflict: '',
        legacy: true,
    };
}

/**
 * Tüm boyutlar — ortak ölçekle.
 * Ölçek boyut boyut değil, KAYIT genelinde belirlenir: tek bir boyutun 3'ün
 * altında kalması, eski bir kaydı yanlışlıkla 0-3 saydırmamalı.
 */
export function normalizeStarAnalysis(starAnalysis) {
    if (!starAnalysis) return null;
    const rawScores = STAR_KEYS.map((k) => {
        const v = starAnalysis[k];
        if (typeof v === 'number') return v;
        return Number(v?.score ?? 0) || 0;
    });
    const scaleMax = rawScores.some((n) => n > 3) ? 10 : 3;

    return STAR_KEYS.map((key) => ({
        key,
        ...normalizeStarDimension(starAnalysis[key], { scaleMax }),
    }));
}

/** Puanın çapa etiketi (yalnızca 0-3 ölçeğinde anlamlı). */
export function anchorLabel(score, max) {
    if (max !== 3) return null;
    const i = Math.max(0, Math.min(3, Math.round(score)));
    return ANCHOR_LABELS[i];
}

/** Kayıtta gerçek bir tutarsızlık var mı? */
export function starConflicts(starAnalysis) {
    const dims = normalizeStarAnalysis(starAnalysis);
    if (!dims) return [];
    return dims.filter((d) => d.conflict).map((d) => ({ key: d.key, text: d.conflict }));
}
