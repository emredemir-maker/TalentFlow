// Derin tarama skorunun bileşimi.
//
// Eskiden skor YALNIZCA STAR ortalamasıydı: iyi yazılmış ama ilanla ilgisiz bir
// CV yüksek, ilana birebir uyan ama sade yazılmış bir CV düşük alıyordu ve
// ilanın gereksinimlerini değiştirmek skoru neredeyse hiç oynatmıyordu.
// Artık skor = gereksinim karşılama (%70) + STAR kanıt yoğunluğu (%30).
// STAR ağırlığı bilerek düşük: bir MÜLAKAT aracı olduğu için CV'ye
// uygulandığında adayın niteliğini değil, ne kadar açık edebildiğini ölçer.
import { describe, expect, it, vi } from 'vitest';

// Gemini/Firebase bağımlılıklarını yükletmeden saf fonksiyonu test et
vi.mock('./ai/config.js', () => ({ getModel: vi.fn(), getAuthHeaders: vi.fn() }));

const { calculateHybridScore, explainHybridScore } = await import('./geminiService.js');

const star = (n) => ({
    Situation: { score: n }, Task: { score: n }, Action: { score: n }, Result: { score: n },
});

describe('calculateHybridScore', () => {
    it('weights requirement coverage above STAR', () => {
        // uyum 100, STAR 80 → güven 0,94 ⇒ 100 × 0,94 = 94
        expect(calculateHybridScore({
            requirementCoverage: { coverageScore: 100 },
            starAnalysis: star(8),
        })).toBe(94);
    });

    it('keeps a well-written but irrelevant CV well below the hiring bar', () => {
        // STAR artık çarpan: uyum 0 ise anlatım ne olursa olsun sonuç 0.
        // Eski toplamalı modelde bu aday 27 alıyordu — yani ilanla hiç ilgisi
        // olmayan bir CV yalnızca iyi yazıldığı için puan topluyordu.
        const score = calculateHybridScore({
            requirementCoverage: { coverageScore: 0 },
            starAnalysis: star(9),
        });
        expect(score).toBe(0);
        expect(score).toBeLessThan(50);
    });

    it('rewards a plainly-written CV that actually meets the requirements', () => {
        // uyum 90, STAR 40 → güven 0,82 ⇒ 90 × 0,82 = 73,8 → 74
        // Zayıf anlatım cezalandırıyor ama uyumu silmiyor: taban 0,70.
        expect(calculateHybridScore({
            requirementCoverage: { coverageScore: 90 },
            starAnalysis: star(4),
        })).toBe(74);
    });

    it('derives coverage from met/partial/missing when coverageScore is absent', () => {
        // 2 tam + 1 yarım + 1 yok = 2,5/4 = %62,5 → 63; STAR 60 → güven 0,88
        // ⇒ 63 × 0,88 = 55,4 → 55
        expect(calculateHybridScore({
            requirementCoverage: { met: ['a', 'b'], partial: ['c'], missing: ['d'] },
            starAnalysis: star(6),
        })).toBe(55);
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
        // zorunlu 2/2 → 85, tercihen 1/1 → 15 ⇒ uyum 100; güven 0,94 ⇒ 94
        expect(calculateHybridScore(assess(['met', 'met', 'met']), REQS)).toBe(94);
    });

    it('penalises a missing must-have far more than a missing nice-to-have', () => {
        const missingMust = calculateHybridScore(assess(['met', 'missing', 'met']), REQS);
        const missingNice = calculateHybridScore(assess(['met', 'met', 'missing']), REQS);
        expect(missingMust).toBeLessThan(missingNice);
        // zorunlu yarısı eksik: 42,5 + 15 = 57,5 → 58; 58 × 0,94 = 54,5 → 55
        expect(missingMust).toBe(55);
        // yalnızca tercih edilen eksik: 85 → 85 × 0,94 = 79,9 → 80
        expect(missingNice).toBe(80);
    });

    it('gives a nice-to-have only a limited advantage', () => {
        // Tercihen kefesi kapsamanın %15'i. Eski toplamalı modelde bu pay
        // 0,7 ile çarpılıp ~10 puana iniyordu: ilan 15 diyor, sistem 10
        // uyguluyordu. Çarpan modelinde madde ne diyorsa o kadar ediyor.
        const withNice = calculateHybridScore(assess(['met', 'met', 'met']), REQS);
        const withoutNice = calculateHybridScore(assess(['met', 'met', 'missing']), REQS);
        expect(withNice - withoutNice).toBeLessThanOrEqual(15);
        expect(withNice).toBeGreaterThan(withoutNice);
    });

    it('counts a partial as half', () => {
        // zorunlu 1,5/2 = 0,75 → 63,75, tercihen 1 → 15 ⇒ 78,75 → 79
        // 79 × 0,94 = 74,3 → 74
        expect(calculateHybridScore(assess(['met', 'partial', 'met']), REQS)).toBe(74);
    });

    it('falls back to the model score when the position has no priorities', () => {
        const legacy = [{ text: 'A', must: null }];
        expect(calculateHybridScore({
            requirementCoverage: { assessments: [{ index: 1, status: 'missing' }], coverageScore: 90 },
            starAnalysis: star(8),
        }, legacy)).toBe(85); // 90 × 0,94 = 84,6
    });

    it('falls back when the model omits assessments', () => {
        expect(calculateHybridScore({
            requirementCoverage: { coverageScore: 50 },
            starAnalysis: star(8),
        }, REQS)).toBe(47); // 50 × 0,94 = 47
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
        expect(allTools).toBe(94); // coverage 100 → 100*0.7 + 80*0.3
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

    // STAR artık toplanan bir parça değil, madde puanlarına uygulanmış bir
    // çarpan. Değişmez bu yüzden daha güçlü: madde puanları TEK BAŞINA skora
    // eşit olmalı.
    it('breaks the score down into parts that add back up to it', () => {
        const data = build(['met', 'partial', 'missing', 'met'], ['deneyim', 'deneyim', 'arac', 'deneyim']);
        const exp = explainHybridScore(data, REQS_X);
        expect(Math.round(sumEarned(exp))).toBe(exp.score);
    });

    it('adds up for a perfect candidate too', () => {
        const data = build(['met', 'met', 'met', 'met'], ['deneyim', 'deneyim', 'arac', 'deneyim']);
        const exp = explainHybridScore(data, REQS_X);
        expect(Math.round(sumEarned(exp))).toBe(exp.score);
    });

    it('scores zero when nothing is met — STAR cannot carry an unfit candidate', () => {
        // Eski modelde bu aday hiçbir gereksinimi karşılamadığı hâlde STAR'ın
        // getirdiği puanı alıyordu
        const data = build(['missing', 'missing', 'missing', 'missing'], ['deneyim', 'deneyim', 'arac', 'deneyim']);
        const exp = explainHybridScore(data, REQS_X);
        expect(sumEarned(exp)).toBe(0);
        expect(exp.score).toBe(0);
    });

    it('reports STAR as a confidence multiplier, not a component', () => {
        const data = build(['met', 'met', 'met', 'met'], ['deneyim', 'deneyim', 'arac', 'deneyim']);
        const exp = explainHybridScore(data, REQS_X);
        // STAR 70 → güven 0,7 + 0,3 × 0,70 = 0,91
        expect(exp.confidence).toBeCloseTo(0.91, 5);
        expect(exp.star.confidence).toBeCloseTo(0.91, 5);
        expect(exp.star.points).toBeUndefined();
        // Kanıt eksikliğinin götürdüğü puan: 100 × 0,09
        expect(Math.round(exp.star.penalty)).toBe(9);
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

    it('falls back to STAR alone when there is no coverage data at all', () => {
        // Çarpacak bir uyum skoru yoksa çarpan da uygulanmaz; eski kayıtların
        // skoru olduğu gibi kalır. Bu adayı 0'a çekmek, ölçülmemiş bir şey
        // yüzünden cezalandırmak olurdu.
        const exp = explainHybridScore({ starAnalysis: star(8) }, REQS_X);
        expect(exp.coverage).toBeNull();
        expect(exp.confidence).toBe(1);
        expect(exp.star.penalty).toBe(0);
        expect(exp.score).toBe(80);
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// STAR ölçek geçişi.
//
// Yeni model boyutları 0-3 çapalı ölçekle puanlıyor (0 bilgi yok, 1 anılmış,
// 2 anlatılmış, 3 ölçülmüş). Eski kayıtlar 1-10'du. Sabit bir bölen kullanmak
// eskileri tavana yapıştırır ya da yenileri yok sayardı.
// ─────────────────────────────────────────────────────────────────────────────
describe('starScoreOf — ölçek algılama', () => {
    const only = (analysis) => calculateHybridScore({ starAnalysis: analysis });
    const dims = (a, b, c, d) => ({
        Situation: { score: a }, Task: { score: b }, Action: { score: c }, Result: { score: d },
    });

    it('reads a new 0-3 record on the 0-3 scale', () => {
        expect(only(dims(3, 3, 3, 3))).toBe(100);
        expect(only(dims(0, 0, 0, 0))).toBe(0);
        // 2+2+1+1 = 6 / 12 → %50
        expect(only(dims(2, 2, 1, 1))).toBe(50);
    });

    it('still reads a legacy 0-10 record correctly', () => {
        expect(only(dims(8, 8, 8, 8))).toBe(80);
        expect(only(dims(10, 10, 10, 10))).toBe(100);
    });

    it('decides the scale from the whole record, not one dimension', () => {
        // Result 2 almış ama kayıt eski (diğerleri 7-9). Boyut boyut bakılsaydı
        // bu kayıt 0-3 sanılıp şişirilirdi.
        expect(only(dims(9, 8, 7, 2))).toBe(65);
    });

    it('treats a malformed score as zero instead of NaN', () => {
        expect(only(dims(3, 3, 'çok iyi', 3))).toBe(75);
    });
});
