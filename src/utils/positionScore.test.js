// Skor okuma anında hesaplanır.
//
// Sorun canlıda oluştu: STAR çarpan olunca formül değişti ama listeler
// saklanan eski sayıyı okumaya devam etti. Skor kırılımı paneli ise anlık
// hesaplıyordu — aynı aday için liste 80, panel 72 gösteriyordu.
//
// Bu testler iki şeyi sabitliyor: (1) skor gerçekten yeniden hesaplanıyor,
// (2) ham verisi olmayan eski kayıtlar bozulmuyor.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/ai/config.js', () => ({ getModel: vi.fn(), getAuthHeaders: vi.fn() }));

const { analysisScoreFor, analysisScoreForTitle, analysisFor } = await import('./positionScore.js');
const { calculateHybridScore } = await import('../services/geminiService.js');

const star = (n) => ({
    Situation: { score: n }, Task: { score: n }, Action: { score: n }, Result: { score: n },
});

const position = {
    title: 'Growth PM',
    requirementsMeta: [
        { text: 'Funnel sahipliği', must: true },
        { text: 'A/B test', must: true },
        { text: 'B2B SaaS', must: false },
    ],
};

const candidate = (analysis) => ({ id: 'c1', name: 'Aday', positionAnalyses: { 'Growth PM': analysis } });

describe('analysisScoreFor', () => {
    it('ignores a stale stored score and recomputes from the raw analysis', () => {
        // Asıl hata buydu: saklanan 80, bugünkü formüle göre 55
        const c = candidate({
            score: 80, // eski formülle yazılmış
            starAnalysis: star(8),
            requirementCoverage: {
                assessments: [
                    { index: 1, status: 'met' },
                    { index: 2, status: 'missing' },
                    { index: 3, status: 'met' },
                ],
            },
        });
        expect(analysisScoreFor(c, position)).toBe(55);
        expect(analysisScoreFor(c, position)).not.toBe(80);
    });

    it('agrees with the score the breakdown panel computes', () => {
        // İki ekranın ayrışmaması bu testin tek işi
        const analysis = {
            score: 999,
            starAnalysis: star(7),
            requirementCoverage: { assessments: [{ index: 1, status: 'met' }, { index: 2, status: 'met' }, { index: 3, status: 'met' }] },
        };
        const c = candidate(analysis);
        expect(analysisScoreFor(c, position)).toBe(
            calculateHybridScore(analysis, position.requirementsMeta)
        );
    });

    it('applies must/nice weights from the CURRENT position, not the stored ones', () => {
        const analysis = {
            score: 50,
            starAnalysis: star(10),
            requirementCoverage: { assessments: [{ index: 1, status: 'met' }, { index: 2, status: 'met' }, { index: 3, status: 'missing' }] },
        };
        const c = candidate(analysis);
        // Zorunlular tam, tercihen eksik → uyum 85, güven 1,00
        expect(analysisScoreFor(c, position)).toBe(85);

        // Aynı analiz, 3. madde artık ZORUNLU → uyum düşer
        const stricter = {
            ...position,
            requirementsMeta: position.requirementsMeta.map((r, i) => (i === 2 ? { ...r, must: true } : r)),
        };
        expect(analysisScoreFor(c, stricter)).toBeLessThan(85);
    });

    it('keeps the stored score for records with no raw data to recompute from', () => {
        // Çok eski kayıt: ne kapsama ne STAR var. Yeniden hesaplamaya
        // kalkışmak deneyim+anahtar kelime yedeğine düşerdi ve o alanlar
        // analizin kökünde değil scoreData içinde — sonuç uydurma olurdu.
        const c = candidate({ score: 64, summary: 'eski kayıt' });
        expect(analysisScoreFor(c, position)).toBe(64);
    });

    it('returns 0 when the candidate has no analysis for this position', () => {
        expect(analysisScoreFor(candidate({ score: 70 }), { title: 'Başka Pozisyon' })).toBe(0);
        expect(analysisScoreFor({ id: 'x' }, position)).toBe(0);
        expect(analysisScoreFor(null, position)).toBe(0);
        expect(analysisScoreFor(candidate({ score: 70 }), null)).toBe(0);
    });

    it('survives a malformed stored score', () => {
        expect(analysisScoreFor(candidate({ score: 'çok iyi' }), position)).toBe(0);
        expect(analysisScoreFor(candidate({}), position)).toBe(0);
    });
});

describe('analysisScoreForTitle', () => {
    it('works without a position object, using the model score', () => {
        const c = candidate({ score: 80, requirementCoverage: { coverageScore: 60 }, starAnalysis: star(5) });
        // Gereksinim listesi yok → ağırlıklı kapsama uygulanamaz, model sayısı
        // kullanılır: 60 × (0,7 + 0,3 × 0,5) = 51
        expect(analysisScoreForTitle(c, 'Growth PM')).toBe(51);
    });

    it('falls back to the stored score for old records', () => {
        expect(analysisScoreForTitle(candidate({ score: 44 }), 'Growth PM')).toBe(44);
    });
});

describe('analysisFor', () => {
    it('reads the analysis for a title', () => {
        expect(analysisFor(candidate({ score: 1 }), 'Growth PM').score).toBe(1);
        expect(analysisFor(candidate({ score: 1 }), 'Yok')).toBeNull();
        expect(analysisFor(null, 'Growth PM')).toBeNull();
        expect(analysisFor(candidate({ score: 1 }), null)).toBeNull();
    });
});
