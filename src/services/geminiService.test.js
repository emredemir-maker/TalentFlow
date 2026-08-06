// Derin tarama skorunun bileşimi.
//
// Eskiden skor YALNIZCA STAR ortalamasıydı: iyi yazılmış ama ilanla ilgisiz bir
// CV yüksek, ilana birebir uyan ama sade yazılmış bir CV düşük alıyordu ve
// ilanın gereksinimlerini değiştirmek skoru neredeyse hiç oynatmıyordu.
// Artık skor = gereksinim karşılama (%60) + STAR kanıt kalitesi (%40).
import { describe, expect, it, vi } from 'vitest';

// Gemini/Firebase bağımlılıklarını yükletmeden saf fonksiyonu test et
vi.mock('./ai/config.js', () => ({ getModel: vi.fn(), getAuthHeaders: vi.fn() }));

const { calculateHybridScore } = await import('./geminiService.js');

const star = (n) => ({
    Situation: { score: n }, Task: { score: n }, Action: { score: n }, Result: { score: n },
});

describe('calculateHybridScore', () => {
    it('weights requirement coverage at 60% and STAR at 40%', () => {
        // %100 karşılama + 8/10 STAR → 100*0.6 + 80*0.4 = 92
        expect(calculateHybridScore({
            requirementCoverage: { coverageScore: 100 },
            starAnalysis: star(8),
        })).toBe(92);
    });

    it('keeps a well-written but irrelevant CV well below the hiring bar', () => {
        // Mükemmele yakın anlatım (STAR 9) ama ilanla ilgisi yok → 36
        const score = calculateHybridScore({
            requirementCoverage: { coverageScore: 0 },
            starAnalysis: star(9),
        });
        expect(score).toBe(36);
        expect(score).toBeLessThan(50);
    });

    it('rewards a plainly-written CV that actually meets the requirements', () => {
        // İlana uyuyor (90) ama anlatımı zayıf (STAR 4) → 70
        expect(calculateHybridScore({
            requirementCoverage: { coverageScore: 90 },
            starAnalysis: star(4),
        })).toBe(70);
    });

    it('derives coverage from met/partial/missing when coverageScore is absent', () => {
        // 2 tam + 1 yarım + 1 yok = 2.5/4 = %62.5 → 63; STAR 6 → 63*0.6+60*0.4 = 62
        expect(calculateHybridScore({
            requirementCoverage: { met: ['a', 'b'], partial: ['c'], missing: ['d'] },
            starAnalysis: star(6),
        })).toBe(62);
    });

    it('falls back to STAR-only when the model returns no coverage (eski kayıtlar)', () => {
        expect(calculateHybridScore({ starAnalysis: star(7) })).toBe(70);
    });

    it('uses coverage alone when STAR is missing', () => {
        expect(calculateHybridScore({ requirementCoverage: { coverageScore: 55 } })).toBe(55);
    });

    it('falls back to experience + keywords when neither signal exists', () => {
        // 4 yıl → 20, 3/4 anahtar kelime → 30 ⇒ 50
        expect(calculateHybridScore({
            totalYearsOfExperience: 4,
            matchedKeywords: ['a', 'b', 'c'],
            missingKeywords: ['d'],
        })).toBe(50);
    });

    it('clamps out-of-range and malformed model output', () => {
        expect(calculateHybridScore({ requirementCoverage: { coverageScore: 480 } })).toBe(100);
        expect(calculateHybridScore({ requirementCoverage: { coverageScore: -20 } })).toBe(0);
        expect(calculateHybridScore({ requirementCoverage: { coverageScore: 'çok iyi' }, starAnalysis: star(5) })).toBe(50);
        expect(calculateHybridScore(null)).toBe(0);
    });

    it('ignores an empty coverage object instead of scoring it as zero', () => {
        // met/partial/missing hepsi boşsa oran hesaplanamaz → STAR'a düşülür
        expect(calculateHybridScore({
            requirementCoverage: { met: [], partial: [], missing: [] },
            starAnalysis: star(8),
        })).toBe(80);
    });
});


describe('calculateHybridScore — zorunlu/tercihen ağırlıkları', () => {
    const REQS = [
        { text: 'Funnel sahipliği', must: true },
        { text: 'A/B test', must: true },
        { text: 'B2B SaaS', must: false },
    ];
    const assess = (statuses) => ({
        requirementCoverage: { assessments: statuses.map((status, i) => ({ index: i + 1, status })) },
        starAnalysis: star(8),
    });

    it('rewards meeting every must-have', () => {
        // zorunlu 2/2 → 85, tercihen 1/1 → 15 ⇒ coverage 100; STAR 80 ⇒ 92
        expect(calculateHybridScore(assess(['met', 'met', 'met']), REQS)).toBe(92);
    });

    it('penalises a missing must-have far more than a missing nice-to-have', () => {
        const missingMust = calculateHybridScore(assess(['met', 'missing', 'met']), REQS);
        const missingNice = calculateHybridScore(assess(['met', 'met', 'missing']), REQS);
        expect(missingMust).toBeLessThan(missingNice);
        // zorunlu yarısı eksik: 42.5 + 15 = 57.5 → 58; 58*0.6 + 80*0.4 = 67
        expect(missingMust).toBe(67);
        // yalnızca tercih edilen eksik: 85 → 85*0.6 + 80*0.4 = 83
        expect(missingNice).toBe(83);
    });

    it('gives a nice-to-have only a limited advantage', () => {
        const withNice = calculateHybridScore(assess(['met', 'met', 'met']), REQS);
        const withoutNice = calculateHybridScore(assess(['met', 'met', 'missing']), REQS);
        expect(withNice - withoutNice).toBeLessThanOrEqual(10);
        expect(withNice).toBeGreaterThan(withoutNice);
    });

    it('counts a partial as half', () => {
        // zorunlu 1.5/2 = 0.75 → 63.75, tercihen 1 → 15 ⇒ 78.75 → 79; 79*0.6+80*0.4 = 79
        expect(calculateHybridScore(assess(['met', 'partial', 'met']), REQS)).toBe(79);
    });

    it('falls back to the model score when the position has no priorities', () => {
        const legacy = [{ text: 'A', must: null }];
        expect(calculateHybridScore({
            requirementCoverage: { assessments: [{ index: 1, status: 'missing' }], coverageScore: 90 },
            starAnalysis: star(8),
        }, legacy)).toBe(86); // 90*0.6 + 80*0.4
    });

    it('falls back when the model omits assessments', () => {
        expect(calculateHybridScore({
            requirementCoverage: { coverageScore: 50 },
            starAnalysis: star(8),
        }, REQS)).toBe(62); // 50*0.6 + 80*0.4
    });
});
