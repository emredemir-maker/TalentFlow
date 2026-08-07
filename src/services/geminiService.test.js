// Derin tarama skorunun bileşimi.
//
// Eskiden skor YALNIZCA STAR ortalamasıydı: iyi yazılmış ama ilanla ilgisiz bir
// CV yüksek, ilana birebir uyan ama sade yazılmış bir CV düşük alıyordu ve
// ilanın gereksinimlerini değiştirmek skoru neredeyse hiç oynatmıyordu.
// Artık skor = gereksinim karşılama (%60) + STAR kanıt kalitesi (%40).
import { describe, expect, it, vi } from 'vitest';

// Gemini/Firebase bağımlılıklarını yükletmeden saf fonksiyonu test et
vi.mock('./ai/config.js', () => ({ getModel: vi.fn(), getAuthHeaders: vi.fn() }));

const { calculateHybridScore, explainHybridScore } = await import('./geminiService.js');

const star = (n) => ({
    Situation: { score: n }, Task: { score: n }, Action: { score: n }, Result: { score: n },
});

describe('calculateHybridScore', () => {
    it('weights requirement coverage and STAR equally', () => {
        // %100 karşılama + 8/10 STAR → 100*0.5 + 80*0.5 = 90
        expect(calculateHybridScore({
            requirementCoverage: { coverageScore: 100 },
            starAnalysis: star(8),
        })).toBe(90);
    });

    it('keeps a well-written but irrelevant CV well below the hiring bar', () => {
        // Mükemmele yakın anlatım (STAR 9) ama ilanla ilgisi yok → 45 (STAR ağırlığı %50 olduğu için yükseldi;
        // yine de işe alım eşiğinin altında kalması testin asıl güvencesi)
        const score = calculateHybridScore({
            requirementCoverage: { coverageScore: 0 },
            starAnalysis: star(9),
        });
        expect(score).toBe(45);
        expect(score).toBeLessThan(50);
    });

    it('rewards a plainly-written CV that actually meets the requirements', () => {
        // İlana uyuyor (90) ama anlatımı zayıf (STAR 4) → 65
        expect(calculateHybridScore({
            requirementCoverage: { coverageScore: 90 },
            starAnalysis: star(4),
        })).toBe(65);
    });

    it('derives coverage from met/partial/missing when coverageScore is absent', () => {
        // 2 tam + 1 yarım + 1 yok = 2.5/4 = %62.5 → 63; STAR 6 → 63*0.5+60*0.5 = 62
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
        // zorunlu 2/2 → 85, tercihen 1/1 → 15 ⇒ coverage 100; STAR 80 ⇒ 90
        expect(calculateHybridScore(assess(['met', 'met', 'met']), REQS)).toBe(90);
    });

    it('penalises a missing must-have far more than a missing nice-to-have', () => {
        const missingMust = calculateHybridScore(assess(['met', 'missing', 'met']), REQS);
        const missingNice = calculateHybridScore(assess(['met', 'met', 'missing']), REQS);
        expect(missingMust).toBeLessThan(missingNice);
        // zorunlu yarısı eksik: 42.5 + 15 = 57.5 → 58; 58*0.5 + 80*0.5 = 69
        expect(missingMust).toBe(69);
        // yalnızca tercih edilen eksik: 85 → 85*0.5 + 80*0.5 = 83
        expect(missingNice).toBe(83);
    });

    it('gives a nice-to-have only a limited advantage', () => {
        const withNice = calculateHybridScore(assess(['met', 'met', 'met']), REQS);
        const withoutNice = calculateHybridScore(assess(['met', 'met', 'missing']), REQS);
        expect(withNice - withoutNice).toBeLessThanOrEqual(10);
        expect(withNice).toBeGreaterThan(withoutNice);
    });

    it('counts a partial as half', () => {
        // zorunlu 1.5/2 = 0.75 → 63.75, tercihen 1 → 15 ⇒ 78.75 → 79; 79*0.5+80*0.5 = 80
        expect(calculateHybridScore(assess(['met', 'partial', 'met']), REQS)).toBe(80);
    });

    it('falls back to the model score when the position has no priorities', () => {
        const legacy = [{ text: 'A', must: null }];
        expect(calculateHybridScore({
            requirementCoverage: { assessments: [{ index: 1, status: 'missing' }], coverageScore: 90 },
            starAnalysis: star(8),
        }, legacy)).toBe(85); // 90*0.5 + 80*0.5
    });

    it('falls back when the model omits assessments', () => {
        expect(calculateHybridScore({
            requirementCoverage: { coverageScore: 50 },
            starAnalysis: star(8),
        }, REQS)).toBe(65); // 50*0.5 + 80*0.5
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// Yetkinlik > araç.
//
// Kullanici bildirdi: "adayin bu isle alakali yapmis olduklari, arac
// gereksinimlerinden oncelikli olmali". Ayni gereksinim kumesinde
// "funnel sahipligi" (yetkinlik) ile "GA4 hakimiyeti" (arac) esit sayilinca,
// isi yillarca yapmis ama CV'sinde arac adi gecmeyen aday gereksiz dusuyordu.
// ─────────────────────────────────────────────────────────────────────────────
describe('calculateHybridScore — yetkinlik / araç ayrımı', () => {
    const REQS_KIND = [
        { text: 'Funnel sahipliği', must: true },
        { text: 'A/B test kurgulama', must: true },
        { text: 'GA4 / Amplitude hakimiyeti', must: true },
    ];
    const withKinds = (statuses, kinds) => ({
        requirementCoverage: {
            assessments: statuses.map((status, i) => ({ index: i + 1, status, kind: kinds[i] })),
        },
        starAnalysis: star(8),
    });

    it('scores a candidate who did the work but lacks the tool above one who only knows the tool', () => {
        const didTheWork = calculateHybridScore(
            withKinds(['met', 'met', 'missing'], ['deneyim', 'deneyim', 'arac']), REQS_KIND
        );
        const toolOnly = calculateHybridScore(
            withKinds(['missing', 'missing', 'met'], ['deneyim', 'deneyim', 'arac']), REQS_KIND
        );
        expect(didTheWork).toBeGreaterThan(toolOnly);
        expect(didTheWork - toolOnly).toBeGreaterThan(20);
    });

    it('costs less to miss a tool than to miss a capability', () => {
        const missingTool = calculateHybridScore(
            withKinds(['met', 'met', 'missing'], ['deneyim', 'deneyim', 'arac']), REQS_KIND
        );
        const missingCapability = calculateHybridScore(
            withKinds(['met', 'missing', 'met'], ['deneyim', 'deneyim', 'arac']), REQS_KIND
        );
        expect(missingTool).toBeGreaterThan(missingCapability);
    });

    it('treats an unlabelled requirement as a capability (eski kayıtlar şişmesin)', () => {
        const labelled = calculateHybridScore(
            withKinds(['met', 'met', 'missing'], ['deneyim', 'deneyim', 'deneyim']), REQS_KIND
        );
        const unlabelled = calculateHybridScore(
            withKinds(['met', 'met', 'missing'], [undefined, undefined, undefined]), REQS_KIND
        );
        expect(unlabelled).toBe(labelled);
    });

    it('falls back cleanly when every requirement is a tool', () => {
        const allTools = calculateHybridScore(
            withKinds(['met', 'met', 'met'], ['arac', 'arac', 'arac']), REQS_KIND
        );
        // Yetkinlik kümesi boşsa araç kümesi tüm ağırlığı alır → coverage 85
        expect(allTools).toBe(90); // coverage 100 → 100*0.5 + 80*0.5
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Skor kırılımı GERÇEK hesabı göstermeli.
//
// Şeffaflık ekranının tek değeri, gösterdiği sayıların gerçekten skoru
// üretmesi. Kırılım ayrı bir yerde yeniden hesaplansaydı ekran zamanla
// gerçek skordan sapar ve "neden 54?" sorusuna yanlış cevap verirdi.
// Bu testler toplamın skora eşit kaldığını sabitler.
// ─────────────────────────────────────────────────────────────────────────────
describe('explainHybridScore', () => {
    const REQS_X = [
        { text: 'Funnel sahipliği', must: true },
        { text: 'A/B test kurgulama', must: true },
        { text: 'GA4 hakimiyeti', must: true },
        { text: 'PLG deneyimi', must: false },
    ];
    const build = (statuses, kinds) => ({
        requirementCoverage: {
            assessments: statuses.map((status, i) => ({
                index: i + 1, status, kind: kinds[i], note: `not ${i + 1}`,
            })),
        },
        starAnalysis: star(7),
    });

    const sumEarned = (exp) => exp.coverage.tiers
        .flatMap((t) => t.groups)
        .flatMap((g) => g.items)
        .reduce((s, it) => s + it.earned, 0);

    it('breaks the score down into parts that add back up to it', () => {
        const data = build(['met', 'partial', 'missing', 'met'], ['deneyim', 'deneyim', 'arac', 'deneyim']);
        const exp = explainHybridScore(data, REQS_X);
        const total = sumEarned(exp) + exp.star.points;
        expect(Math.round(total)).toBe(exp.score);
    });

    it('adds up for a perfect candidate too', () => {
        const data = build(['met', 'met', 'met', 'met'], ['deneyim', 'deneyim', 'arac', 'deneyim']);
        const exp = explainHybridScore(data, REQS_X);
        expect(Math.round(sumEarned(exp) + exp.star.points)).toBe(exp.score);
    });

    it('adds up when nothing is met', () => {
        const data = build(['missing', 'missing', 'missing', 'missing'], ['deneyim', 'deneyim', 'arac', 'deneyim']);
        const exp = explainHybridScore(data, REQS_X);
        expect(sumEarned(exp)).toBe(0);
        expect(Math.round(exp.star.points)).toBe(exp.score);
    });

    it('agrees with calculateHybridScore', () => {
        const data = build(['met', 'partial', 'missing', 'met'], ['deneyim', 'deneyim', 'arac', 'deneyim']);
        expect(explainHybridScore(data, REQS_X).score).toBe(calculateHybridScore(data, REQS_X));
    });

    it('shows a missing tool as costing less than a missing capability', () => {
        const missTool = explainHybridScore(
            build(['met', 'met', 'missing', 'met'], ['deneyim', 'deneyim', 'arac', 'deneyim']), REQS_X
        );
        const missCap = explainHybridScore(
            build(['met', 'missing', 'met', 'met'], ['deneyim', 'deneyim', 'arac', 'deneyim']), REQS_X
        );
        const lost = (exp) => exp.coverage.tiers.flatMap((t) => t.groups).flatMap((g) => g.items)
            .filter((i) => i.status === 'missing').reduce((s, i) => s + i.max, 0);
        expect(lost(missTool)).toBeLessThan(lost(missCap));
    });

    it('carries the AI note for every requirement so the user sees the reasoning', () => {
        const exp = explainHybridScore(
            build(['met', 'met', 'met', 'met'], ['deneyim', 'deneyim', 'arac', 'deneyim']), REQS_X
        );
        const items = exp.coverage.tiers.flatMap((t) => t.groups).flatMap((g) => g.items);
        expect(items).toHaveLength(4);
        expect(items.every((i) => i.note.startsWith('not '))).toBe(true);
    });

    it('still explains legacy records that have no per-requirement assessments', () => {
        const exp = explainHybridScore(
            { requirementCoverage: { coverageScore: 80 }, starAnalysis: star(6) }, REQS_X
        );
        expect(exp.coverage.score).toBe(80);
        expect(exp.coverage.tiers).toEqual([]);
        expect(exp.score).toBe(calculateHybridScore(
            { requirementCoverage: { coverageScore: 80 }, starAnalysis: star(6) }, REQS_X
        ));
    });

    it('gives STAR the whole weight when there is no coverage data', () => {
        const exp = explainHybridScore({ starAnalysis: star(8) }, REQS_X);
        expect(exp.coverage).toBeNull();
        expect(exp.star.weight).toBe(1);
        expect(exp.score).toBe(80);
    });
});
