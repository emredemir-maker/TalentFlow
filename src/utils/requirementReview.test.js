// Gereksinim gözden geçirme — ölçüm.
//
// Buradaki sayıların tamamı adayların kayıtlı değerlendirmelerinden gelir.
// Kritik nokta: TARANMAMIŞ aday hiçbir orana girmez. Onları "eksik" saymak
// eleme oranını tamamen uydurma yapardı ve kullanıcı gerçek olmayan bir
// veriye bakıp ilanını değiştirirdi.
import { describe, expect, it } from 'vitest';
import {
    reviewRequirements, flaggedRequirements, MIN_SAMPLE, candidatesByRequirements,
} from './requirementReview.js';
import { requirementsFingerprint } from './positionRequirements.js';

const POSITION = {
    title: 'Growth Product Manager',
    requirementsMeta: [
        { text: 'Funnel sahipliği', must: true },
        { text: 'A/B test kurgulama', must: true },
        { text: 'GA4 hakimiyeti', must: true },
        { text: 'PLG deneyimi', must: false },
    ],
};

/** statuses: her gereksinim için durum; kinds opsiyonel. */
const cand = (id, statuses, kinds = []) => ({
    id,
    positionAnalyses: {
        'Growth Product Manager': {
            requirementCoverage: {
                assessments: statuses.map((status, i) => ({
                    index: i + 1, status, ...(kinds[i] ? { kind: kinds[i] } : {}),
                })),
            },
        },
    },
});

const many = (n, statuses, kinds) =>
    Array.from({ length: n }, (_, i) => cand(`c${i}`, statuses, kinds));

describe('reviewRequirements — örneklem', () => {
    it('ignores candidates with no analysis for this position', () => {
        const pool = [
            cand('a', ['met', 'met', 'met', 'met']),
            { id: 'b' },                                   // hiç taranmamış
            { id: 'c', positionAnalyses: { 'Başka Pozisyon': {} } },  // başka ilan
        ];
        const r = reviewRequirements(POSITION, pool);
        expect(r.scanned).toBe(1);
        expect(r.items[0].evaluated).toBe(1);
    });

    it('refuses to produce a rate below the minimum sample', () => {
        const r = reviewRequirements(POSITION, many(MIN_SAMPLE - 1, ['missing', 'met', 'met', 'met']));
        expect(r.enoughData).toBe(false);
        expect(r.items[0].eliminationRate).toBeNull();
        // Sayım yine de yapılır; yalnızca ORAN üretilmez
        expect(r.items[0].eliminated).toBe(MIN_SAMPLE - 1);
    });

    it('produces rates once there is enough data', () => {
        const pool = [
            ...many(8, ['missing', 'met', 'met', 'met']),
            ...many(2, ['met', 'met', 'met', 'met']),
        ];
        const r = reviewRequirements(POSITION, pool);
        expect(r.enoughData).toBe(true);
        expect(r.items[0].evaluated).toBe(10);
        expect(r.items[0].eliminated).toBe(8);
        expect(r.items[0].eliminationRate).toBeCloseTo(0.8);
    });

    it('handles a position with no requirements', () => {
        expect(reviewRequirements({ title: 'X' }, [cand('a', [])]).items).toEqual([]);
        expect(reviewRequirements(null, []).items).toEqual([]);
    });
});

describe('reviewRequirements — bayraklar', () => {
    it('flags a tool marked as must-have', () => {
        const pool = many(10, ['met', 'met', 'met', 'met'], ['deneyim', 'deneyim', 'arac', 'deneyim']);
        const r = reviewRequirements(POSITION, pool);
        expect(r.items[2].kind).toBe('arac');
        expect(r.items[2].flags).toContain('tool-must');
    });

    it('does not flag a tool that is only nice-to-have', () => {
        const nicePos = {
            title: 'Growth Product Manager',
            requirementsMeta: [{ text: 'GA4', must: false }],
        };
        const pool = many(10, ['met'], ['arac']);
        expect(reviewRequirements(nicePos, pool).items[0].flags).not.toContain('tool-must');
    });

    it('flags a must-have that eliminates most of the pool', () => {
        const pool = [
            ...many(9, ['missing', 'met', 'met', 'met']),
            ...many(1, ['met', 'met', 'met', 'met']),
        ];
        expect(reviewRequirements(POSITION, pool).items[0].flags).toContain('over-restrictive');
    });

    it('does not call a nice-to-have over-restrictive', () => {
        // Tercih edilen madde zaten eleme yapmaz; darlığı sorun değil
        const pool = many(10, ['met', 'met', 'met', 'missing']);
        expect(reviewRequirements(POSITION, pool).items[3].flags).not.toContain('over-restrictive');
    });

    it('flags a requirement everyone satisfies as making no distinction', () => {
        const pool = many(10, ['met', 'met', 'met', 'met']);
        expect(reviewRequirements(POSITION, pool).items[1].flags).toContain('no-signal');
    });

    it('flags two requirements that split the pool identically', () => {
        // 1 ve 2 hep birlikte karşılanıyor/karşılanmıyor → biri fazlalık
        const pool = [
            ...many(6, ['met', 'met', 'met', 'met']),
            ...many(6, ['missing', 'missing', 'met', 'met']),
        ];
        const r = reviewRequirements(POSITION, pool);
        expect(r.items[0].redundantWith).toContain(2);
        expect(r.items[1].redundantWith).toContain(1);
        expect(r.items[0].flags).toContain('redundant');
    });

    it('does not call two universally-met requirements redundant', () => {
        // Herkes karşılıyorsa bu "fazlalık" değil "ayırt etmiyor"dur;
        // ikisini karıştırmak yanlış tavsiyeye yol açardı
        const r = reviewRequirements(POSITION, many(10, ['met', 'met', 'met', 'met']));
        expect(r.items[0].redundantWith).toEqual([]);
        expect(r.items[0].flags).toContain('no-signal');
    });

    it('leaves a healthy requirement unflagged', () => {
        // Yarısını eleyen, başka maddeyle örtüşmeyen bir yetkinlik
        const pool = [
            ...many(5, ['met', 'missing', 'met', 'met'], ['deneyim', 'deneyim', 'deneyim', 'deneyim']),
            ...many(5, ['missing', 'met', 'met', 'met'], ['deneyim', 'deneyim', 'deneyim', 'deneyim']),
        ];
        const r = reviewRequirements(POSITION, pool);
        expect(r.items[0].flags).toEqual([]);
    });
});

describe('flaggedRequirements', () => {
    it('returns only the items worth reviewing', () => {
        const pool = many(10, ['met', 'met', 'met', 'met'], ['deneyim', 'deneyim', 'arac', 'deneyim']);
        const flagged = flaggedRequirements(reviewRequirements(POSITION, pool));
        expect(flagged.length).toBeGreaterThan(0);
        expect(flagged.every((f) => f.flags.length > 0)).toBe(true);
    });

    it('is empty for a clean review', () => {
        expect(flaggedRequirements({ items: [{ flags: [] }] })).toEqual([]);
        expect(flaggedRequirements(null)).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Birleşik geçiş.
//
// Tek tek eleme oranları ilanin gerçek darlığını göstermiyor. Gerçek bir
// ilanda en çok eleyen zorunlu madde %63'te kaldı ve hiçbir madde "havuzu
// daraltıyor" diye işaretlenmedi — ama adaylar FARKLI maddelerde elendiği
// için hepsini birden geçen aday sayısı çok daha düşüktü. Kullanıcının
// aslında ihtiyaç duyduğu sayı bu.
// ─────────────────────────────────────────────────────────────────────────────
describe('birleşik zorunlu geçişi', () => {
    it('counts only candidates who pass EVERY must-have', () => {
        // Her aday tek bir zorunluda eleniyor; tek tek oranlar düşük görünür
        // ama hiçbiri hepsini geçmiyor.
        const pool = [
            ...many(4, ['missing', 'met', 'met', 'met']),
            ...many(4, ['met', 'missing', 'met', 'met']),
            ...many(4, ['met', 'met', 'missing', 'met']),
        ];
        const r = reviewRequirements(POSITION, pool);
        expect(r.mustCount).toBe(3);
        expect(r.mustEvaluated).toBe(12);
        expect(r.mustPass).toBe(0);
        // Tek tek oranlar yalnızca 1/3 — ama birleşik geçiş sıfır
        expect(r.items[0].eliminationRate).toBeCloseTo(4 / 12);
    });

    it('ignores the nice-to-have when deciding who passes', () => {
        const pool = many(10, ['met', 'met', 'met', 'missing']);
        const r = reviewRequirements(POSITION, pool);
        expect(r.mustPass).toBe(10);
        expect(r.mustPassRate).toBe(1);
    });

    it('counts partial as passing, same as the coverage model', () => {
        const pool = many(10, ['partial', 'met', 'met', 'met']);
        expect(reviewRequirements(POSITION, pool).mustPass).toBe(10);
    });

    it('excludes candidates whose must-haves were not all assessed', () => {
        // Bir zorunlusu hiç degerlendirilmemis adaya "gecti" de "kaldi" da
        // diyemeyiz; sayima girmemeli
        const partialAssessment = {
            id: 'x',
            positionAnalyses: {
                'Growth Product Manager': {
                    requirementCoverage: { assessments: [{ index: 1, status: 'met' }] },
                },
            },
        };
        const r = reviewRequirements(POSITION, [...many(6, ['met', 'met', 'met', 'met']), partialAssessment]);
        expect(r.scanned).toBe(7);
        expect(r.mustEvaluated).toBe(6);
    });

    it('withholds the rate below the minimum sample', () => {
        expect(reviewRequirements(POSITION, many(3, ['met', 'met', 'met', 'met'])).mustPassRate).toBeNull();
    });

    it('reports nothing when the position marks no must-haves', () => {
        const legacy = { title: 'Growth Product Manager', requirements: ['A', 'B'] };
        const r = reviewRequirements(legacy, many(10, ['met', 'met']));
        expect(r.mustCount).toBe(0);
        expect(r.mustPassRate).toBeNull();
    });
});

describe('over-restrictive eşiği', () => {
    it('flags a must-have that eliminates two thirds of the pool', () => {
        // %80 esigiyle bu yakalanmiyordu; gercek ilanda en yuksek deger %63'tu
        const pool = [
            ...many(7, ['missing', 'met', 'met', 'met']),
            ...many(3, ['met', 'met', 'met', 'met']),
        ];
        expect(reviewRequirements(POSITION, pool).items[0].flags).toContain('over-restrictive');
    });

    it('leaves a moderately selective requirement alone', () => {
        const pool = [
            ...many(4, ['missing', 'met', 'met', 'met']),
            ...many(6, ['met', 'met', 'met', 'met']),
        ];
        expect(reviewRequirements(POSITION, pool).items[0].flags).not.toContain('over-restrictive');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gereksinime göre aday listesi.
//
// "31/86 eleniyor" sayısı tek başına karar verdirmiyor; kullanıcı KİMLER
// olduğunu görmek istiyor. Asıl kullanım: birkaç maddeyi seçip "bunları
// kaldırsam kim havuza geri girer?" sorusunu canlı görmek.
// ─────────────────────────────────────────────────────────────────────────────
describe('candidatesByRequirements', () => {
    const pool = [
        cand('hepsi', ['met', 'met', 'met', 'met']),
        cand('bir-eksik', ['met', 'missing', 'met', 'met']),
        cand('iki-eksik', ['missing', 'missing', 'met', 'met']),
        cand('kismi', ['partial', 'partial', 'met', 'met']),
    ];

    it('lists candidates who meet ALL selected requirements', () => {
        const r = candidatesByRequirements(POSITION, pool, { indexes: [1, 2] });
        expect(r.matched.map((c) => c.id)).toEqual(['hepsi', 'kismi']);
    });

    it('counts partial as meeting, same as everywhere else', () => {
        const r = candidatesByRequirements(POSITION, pool, { indexes: [1] });
        expect(r.matched.map((c) => c.id)).toContain('kismi');
    });

    it('lists who fails at least one when asked the other way', () => {
        const r = candidatesByRequirements(POSITION, pool, { indexes: [1, 2], mode: 'misses' });
        expect(r.matched.map((c) => c.id)).toEqual(['bir-eksik', 'iki-eksik']);
    });

    it('shows the pool growing when a requirement is dropped', () => {
        // Asıl kullanım: 2. maddeyi çıkarınca kim geri geliyor?
        const withBoth = candidatesByRequirements(POSITION, pool, { indexes: [1, 2] });
        const withoutSecond = candidatesByRequirements(POSITION, pool, { indexes: [1] });
        expect(withoutSecond.matched.length).toBeGreaterThan(withBoth.matched.length);
        expect(withoutSecond.matched.map((c) => c.id)).toContain('bir-eksik');
    });

    it('skips candidates whose selected requirements were not all assessed', () => {
        // Değerlendirilmemiş maddeye "karşılıyor" da "karşılamıyor" da diyemeyiz
        const partial = {
            id: 'yarim',
            positionAnalyses: {
                'Growth Product Manager': {
                    requirementCoverage: { assessments: [{ index: 1, status: 'met' }] },
                },
            },
        };
        const r = candidatesByRequirements(POSITION, [...pool, partial], { indexes: [1, 2] });
        expect(r.skipped).toBe(1);
        expect(r.evaluated).toBe(4);
        expect(r.matched.map((c) => c.id)).not.toContain('yarim');
    });

    it('returns nothing when no requirement is selected', () => {
        const r = candidatesByRequirements(POSITION, pool, { indexes: [] });
        expect(r.matched).toEqual([]);
        expect(r.evaluated).toBe(0);
    });

    it('handles a missing position safely', () => {
        expect(candidatesByRequirements(null, pool, { indexes: [1] }).matched).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bayat analiz tespiti.
//
// Kullanıcı öneriyi uygulayıp AYNI öneriyi tekrar aldığını bildirdi. Sebep:
// panel kayıtlı analizlerden okuyor ve o analizler ESKİ gereksinim metnine
// ait. Metni değiştirmek yargıyı değiştirmiyor; yeniden tarama gerekiyor.
// Panel bunu artık sayıp söyleyebiliyor.
// ─────────────────────────────────────────────────────────────────────────────
describe('bayat analiz tespiti', () => {
    const withStamp = (id, stamp) => ({
        id,
        positionAnalyses: {
            'Growth Product Manager': {
                requirementsFingerprint: stamp,
                requirementCoverage: {
                    assessments: [1, 2, 3, 4].map((i) => ({ index: i, status: 'met' })),
                },
            },
        },
    });

    it('counts an analysis stamped with the current requirements as fresh', () => {
        const stamp = requirementsFingerprint(POSITION);
        const r = reviewRequirements(POSITION, [withStamp('a', stamp), withStamp('b', stamp)]);
        expect(r.fresh).toBe(2);
        expect(r.stale).toBe(0);
    });

    it('counts an analysis from an older wording as stale', () => {
        const r = reviewRequirements(POSITION, [withStamp('a', 'reski'), withStamp('b', 'reski')]);
        expect(r.stale).toBe(2);
        expect(r.fresh).toBe(0);
    });

    it('treats an unstamped legacy analysis as stale', () => {
        // Damga eklenmeden önce yazılmış kayıtlar; güncel olduklarını
        // varsaymak kullanıcıyı yanıltırdı
        const r = reviewRequirements(POSITION, [cand('eski', ['met', 'met', 'met', 'met'])]);
        expect(r.stale).toBe(1);
    });

    it('reports the mix when only some candidates were rescanned', () => {
        // Eşikli tarama yalnızca bir kısmını tazeler — gerçek senaryo
        const stamp = requirementsFingerprint(POSITION);
        const r = reviewRequirements(POSITION, [
            withStamp('taze1', stamp), withStamp('taze2', stamp),
            withStamp('bayat1', 'reski'), withStamp('bayat2', 'reski'), withStamp('bayat3', 'reski'),
        ]);
        expect(r.fresh).toBe(2);
        expect(r.stale).toBe(3);
        expect(r.scanned).toBe(5);
    });
});
