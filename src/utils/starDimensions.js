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

/**
 * STAR ölçeğinin ÜST SINIRI — 0-3.
 *
 * Sabit olarak burada duruyor çünkü canlıda bir ekran hâlâ "/10" yazıyordu:
 * 0-10'dan 0-3'e geçilirken kırılım paneli atlanmış. Tam not alan bir boyut
 * ekranda "3/10" görünüyordu — felaket gibi okunan, aslında kusursuz bir
 * sonuç. Ölçeği yazan her ekran buradan okusun.
 */
export const STAR_MAX = 3;

/** 0-3 çapalarının insan okunur karşılığı. */
export const ANCHOR_LABELS = ['Bilgi yok', 'Anılmış', 'Anlatılmış', 'Ölçülmüş'];

/**
 * Boyut adlarının Türkçesi.
 *
 * Ham İngilizce anahtarı ekrana basıp CSS ile büyütmek YANLIŞ: sayfa
 * `lang="tr"` ve tarayıcı Türkçe büyütme kuralı uyguluyor — 'Situation'
 * ekranda **SİTUATİON** çıkıyordu (noktalı İ). Bugün aynı tuzağa altıncı kez
 * düşüldü, bu sefer JS'te değil CSS'te.
 */
export const STAR_LABELS = {
    Situation: 'Durum',
    Task: 'Görev',
    Action: 'Eylem',
    Result: 'Sonuç',
};

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
    const blank = { evidence: '', missing: '', conflict: '', confidentiality: false, legacy: false };
    if (raw === null || raw === undefined) {
        return { score: 0, max: scaleMax || 3, ...blank };
    }
    if (typeof raw === 'number') {
        return { score: raw, max: scaleMax || (raw > 3 ? 10 : 3), ...blank };
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
            // Gizlilik beyanı PUANA ETKİ ETMEZ. Yalnızca sorunun nasıl
            // sorulacağını ve ekrandaki çerçeveyi değiştirir. Bayrağa puan
            // bağlamak "NDA yazan herkes yüksek alır" oyununu açardı.
            confidentiality: Boolean(raw.confidentiality),
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
        confidentiality: false,
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

/**
 * STAR yüzdesi (0-100) — TEK kaynak.
 *
 * Bunu ayrı yerlerde yeniden hesaplamak 2026-08-08'de gerçek bir hataya yol
 * açtı: CandidateProcessPage başlığındaki rozet kendi kopyasını taşıyordu ve
 * `(toplam / 4) * 10` ile eski 0-10 ölçeğini varsayıyordu. Yeni 0-3 ölçeğinde
 * S3+T2+A2+R3 = 10 için rozet %25 gösterirken gerçek değer %83'tü.
 *
 * (Sayı tesadüfen skora KATKIYA eşitti: (toplam/4)*10 ile
 * (toplam/12)*100*0.3 cebirsel olarak aynı — ikisi de toplam × 2,5. Bu da
 * hatayı fark etmeyi zorlaştırıyordu.)
 *
 * @returns {number|null} analiz yoksa null
 */
export function starPercent(starAnalysis) {
    const dims = normalizeStarAnalysis(starAnalysis);
    if (!dims) return null;
    const max = dims[0]?.max || 3;
    const sum = dims.reduce((acc, d) => acc + d.score, 0);
    return Math.min(100, Math.max(0, Math.round((sum / (dims.length * max)) * 100)));
}

/** Gizlilik beyanı bulunan boyutlar. */
export function confidentialDimensions(starAnalysis) {
    const dims = normalizeStarAnalysis(starAnalysis);
    if (!dims) return [];
    return dims.filter((d) => d.confidentiality).map((d) => d.key);
}
