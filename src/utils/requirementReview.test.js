// Gereksinim gözden geçirme — ölçüm.
//
// Buradaki sayıların tamamı adayların kayıtlı değerlendirmelerinden gelir.
// Kritik nokta: TARANMAMIŞ aday hiçbir orana girmez. Onları "eksik" saymak
// eleme oranını tamamen uydurma yapardı ve kullanıcı gerçek olmayan bir
// veriye bakıp ilanını değiştirirdi.
import { describe, expect, it } from 'vitest';
import { reviewRequirements, flaggedRequirements, MIN_SAMPLE } from './requirementReview.js';

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
