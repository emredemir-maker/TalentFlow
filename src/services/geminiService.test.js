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
