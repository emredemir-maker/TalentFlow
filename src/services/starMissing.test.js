// STAR ÖLÇÜLMEMİŞSE BU SESSİZ KALMAMALI.
//
// Skor şöyle hesaplanıyor:  skor = uyum × güven,  güven = 0,70 + 0,30 × STAR/100
//
// STAR yoksa çarpan hiç uygulanmıyor — yani güven 1,00 kabul ediliyor. Bu,
// "CV'deki kanıt %100" ile BİREBİR aynı sonuç. Ölçmediğimiz bir şeye mümkün
// olan en iyi değeri vermek, ölçülmüş adayların aleyhine çalışıyor:
//
//   uyum 80, STAR 60 ölçülmüş → 0,88 × 80 = 70
//   uyum 80, STAR hiç ölçülmemiş →       = 80   ← ölçülmemiş olan kazanıyor
//
// Sayıyı burada DÜŞÜRMÜYORUZ: ölçüm yapılmamış olması adayın kusuru değil,
// sistemin eksiği ve 0,70 tabanını uygulamak eski kayıtların hepsini haksızca
// %30 aşağı çekerdi. Yaptığımız şey farkı GÖRÜNÜR kılmak.
import { describe, expect, it, vi } from 'vitest';

vi.mock('./ai/config.js', () => ({ getModel: vi.fn(), getAuthHeaders: vi.fn() }));

const { calculateHybridScore, explainHybridScore } = await import('./geminiService.js');

const star = (n) => ({
    Situation: { score: n }, Task: { score: n }, Action: { score: n }, Result: { score: n },
});

describe('starMissing', () => {
    it('is true when coverage exists but STAR was never measured', () => {
        const exp = explainHybridScore({ requirementCoverage: { coverageScore: 80 } }, null);
        expect(exp.starMissing).toBe(true);
        expect(exp.confidence).toBe(1);
    });

    it('is false once STAR is measured — even at zero', () => {
        // STAR 0 "ölçülmedi" DEĞİL: ölçtük ve CV'de kanıt bulamadık.
        // İkisini aynı kovaya koymak, iki farklı gerçeği tek şeye indirger.
        const exp = explainHybridScore(
            { requirementCoverage: { coverageScore: 80 }, starAnalysis: star(0) },
            null
        );
        expect(exp.starMissing).toBe(false);
        expect(exp.confidence).toBeCloseTo(0.7, 2);
    });

    it('is false when there is no coverage either — nothing to qualify', () => {
        const exp = explainHybridScore({ starAnalysis: star(2) }, null);
        expect(exp.starMissing).toBe(false);
    });

    it('does not change the score itself', () => {
        // İşaretleme bir uyarıdır, ceza değil. Sayıyı burada düşürmek eski
        // kayıtların hepsini haksızca aşağı çekerdi.
        const analysis = { requirementCoverage: { coverageScore: 80 } };
        expect(calculateHybridScore(analysis, null)).toBe(80);
        expect(explainHybridScore(analysis, null).score).toBe(80);
    });

    it('shows the gap it is warning about', () => {
        // Aynı uyum, iki aday: biri ölçülmüş biri ölçülmemiş
        const measured = calculateHybridScore(
            { requirementCoverage: { coverageScore: 80 }, starAnalysis: star(2) }, null
        );
        const unmeasured = calculateHybridScore({ requirementCoverage: { coverageScore: 80 } }, null);
        expect(unmeasured).toBeGreaterThan(measured);
    });
});
