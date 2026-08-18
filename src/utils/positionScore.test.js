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

const { analysisScoreFor, analysisScoreForTitle, analysisFor, analysisScoreDetail, isStaleFor } = await import('./positionScore.js');
const { requirementsFingerprint } = await import('./positionRequirements.js');
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

// Değerlendirmeler madde NUMARASINA bağlı; damga hangi listeye ait
// olduklarını söyler. Damgasız ya da damgası tutmayan kayıt BAYATtır.
const FRESH = () => requirementsFingerprint(position);
const candidate = (analysis) => ({ id: 'c1', name: 'Aday', positionAnalyses: { 'Growth PM': analysis } });
const fresh = (analysis) => candidate({ requirementsFingerprint: FRESH(), ...analysis });

describe('analysisScoreFor', () => {
    it('ignores a stale stored score and recomputes from the raw analysis', () => {
        // Asıl hata buydu: saklanan 80, bugünkü formüle göre 55
        const c = fresh({
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
            requirementsFingerprint: FRESH(),
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
        const coverage = { assessments: [{ index: 1, status: 'met' }, { index: 2, status: 'met' }, { index: 3, status: 'missing' }] };
        const c = fresh({ score: 50, starAnalysis: star(10), requirementCoverage: coverage });
        // Zorunlular tam, tercihen eksik → uyum 85, güven 1,00
        expect(analysisScoreFor(c, position)).toBe(85);

        // Aynı analiz, 3. madde artık ZORUNLU. Liste değiştiği için damga da
        // tutmaz; aday YENİDEN TARANMALI. Ağırlıkları eski yargılara
        // uygulamak sessiz bir hata olurdu.
        const stricter = {
            ...position,
            requirementsMeta: position.requirementsMeta.map((r, i) => (i === 2 ? { ...r, must: true } : r)),
        };
        const rescanned = candidate({
            requirementsFingerprint: requirementsFingerprint(stricter),
            score: 50, starAnalysis: star(10), requirementCoverage: coverage,
        });
        expect(analysisScoreFor(rescanned, stricter)).toBeLessThan(85);
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

// ─────────────────────────────────────────────────────────────────────────────
// BAYATLIK.
//
// Canlıda ölçüldü: aynı aday, aynı formül — bayat değerlendirmeyle 77, taze
// taramayla 65. Kayıtlı değerlendirmeler madde NUMARASINA bağlı; gereksinim
// listesi değişince o numara başka bir maddeye denk geliyor ve eski yargı
// yanlış maddeye yapışıyor. Sessiz, on iki puanlık bir hata.
// ─────────────────────────────────────────────────────────────────────────────
describe('bayat analiz', () => {
    const coverage = {
        assessments: [{ index: 1, status: 'met' }, { index: 2, status: 'met' }, { index: 3, status: 'met' }],
    };

    it('treats a fingerprint mismatch as stale', () => {
        const c = candidate({ requirementsFingerprint: 'rESKI', score: 70, starAnalysis: star(8), requirementCoverage: coverage });
        expect(analysisScoreDetail(c, position).stale).toBe(true);
    });

    it('treats an unstamped record as stale — we cannot know which list it belongs to', () => {
        const c = candidate({ score: 70, starAnalysis: star(8), requirementCoverage: coverage });
        expect(analysisScoreDetail(c, position).stale).toBe(true);
    });

    it('does NOT map old judgements onto the new requirement numbers', () => {
        // Taze olsaydı 3/3 zorunlu+tercihen → 100. Bayat olduğu için madde
        // bazlı ağırlıklandırma uygulanmaz.
        const staleC = candidate({ requirementsFingerprint: 'rESKI', score: 77, starAnalysis: star(10), requirementCoverage: coverage });
        const freshC = fresh({ score: 77, starAnalysis: star(10), requirementCoverage: coverage });
        expect(analysisScoreFor(freshC, position)).toBe(100);
        expect(analysisScoreFor(staleC, position)).toBe(77);
    });

    it('shows the stored score for a stale record, not a STAR-only number', () => {
        // STAR'a düşmek, yeni kaldırdığımız alana kör sayıya geri dönmek olurdu
        const c = candidate({ requirementsFingerprint: 'rESKI', score: 65, starAnalysis: star(10), requirementCoverage: coverage });
        expect(analysisScoreFor(c, position)).toBe(65);
        expect(analysisScoreFor(c, position)).not.toBe(100);
    });

    it('is not stale when there are no item-level assessments to mismap', () => {
        const c = candidate({ score: 55, requirementCoverage: { coverageScore: 55 }, starAnalysis: star(8) });
        expect(analysisScoreDetail(c, position).stale).toBe(false);
    });

    // toMatchObject, toEqual değil: dönen nesneye doğrulama alanları eklendi
    // (verificationEffect, preVerificationScore) ve bu testin iddiası onlar
    // değil — "bu pozisyonda analiz yoksa taranmamış say".
    it('reports scanned=false when the candidate has no analysis here', () => {
        expect(analysisScoreDetail(candidate({ score: 1 }), { title: 'Yok' }))
            .toMatchObject({ score: 0, stale: false, scanned: false, interviewed: false, cvScore: 0 });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// MÜLAKAT SKORA GİRER — çünkü listeler bu fonksiyonu okuyor.
//
// Ayrı bir "mülakat skoru" alanı eklenseydi tablo eski sayıyı göstermeye
// devam eder, aday sayfası yenisini gösterirdi. Bu modül tam da o sapmayı
// önlemek için yazılmıştı.
// ─────────────────────────────────────────────────────────────────────────────
describe('mülakat skora yansır', () => {
    // 1. ve 2. zorunlu karşılanıyor, 3. tercihen eksik
    const coverage = {
        assessments: [
            { index: 1, status: 'met' },
            { index: 2, status: 'met' },
            { index: 3, status: 'missing' },
        ],
    };

    const withVerdicts = (base, verdicts) => ({
        ...base,
        interviewCoverage: {
            [position.title]: {
                sessionId: 'mi-1',
                date: '2026-08-12',
                verdicts,
                requirementsFingerprint: requirementsFingerprint(position),
            },
        },
    });

    it('raises the list score when the interview closed a gap', () => {
        const base = fresh({ score: 50, starAnalysis: star(10), requirementCoverage: coverage });
        const cvOnly = analysisScoreDetail(base, position);
        const after = analysisScoreDetail(
            withVerdicts(base, [{ requirementIndex: 1, verdict: 'missing', quote: 'O işi yapmadım' }]),
            position
        );
        // 1. madde met → missing: skor DÜŞMELİ, ve iki alan da dönmeli
        expect(after.score).toBeLessThan(cvOnly.score);
        expect(after.cvScore).toBe(cvOnly.score);
        expect(after.interviewed).toBe(true);
    });

    it('keeps cvScore alongside so the UI can explain the difference', () => {
        // Sessizce değişen bir skor, açıklanamayan bir skordur
        const base = fresh({ score: 50, starAnalysis: star(10), requirementCoverage: coverage });
        const after = analysisScoreDetail(
            withVerdicts(base, [{ requirementIndex: 1, verdict: 'partial' }]),
            position
        );
        expect(after.cvScore).not.toBe(after.score);
    });

    it('leaves the score untouched when the interview was inconclusive', () => {
        const base = fresh({ score: 50, starAnalysis: star(10), requirementCoverage: coverage });
        const after = analysisScoreDetail(
            withVerdicts(base, [{ requirementIndex: 1, verdict: 'inconclusive' }]),
            position
        );
        expect(after.score).toBe(after.cvScore);
        expect(after.interviewed).toBe(true);
    });

    it('ignores interview verdicts stamped against an older requirement list', () => {
        const base = fresh({ score: 50, starAnalysis: star(10), requirementCoverage: coverage });
        const stale = {
            ...base,
            interviewCoverage: {
                [position.title]: {
                    verdicts: [{ requirementIndex: 1, verdict: 'missing' }],
                    requirementsFingerprint: 'rESKI',
                },
            },
        };
        expect(analysisScoreDetail(stale, position).score).toBe(analysisScoreDetail(base, position).score);
        expect(analysisScoreDetail(stale, position).interviewed).toBe(false);
    });

    it('reports interviewed=false for a candidate who has not been interviewed', () => {
        const base = fresh({ score: 50, starAnalysis: star(10), requirementCoverage: coverage });
        expect(analysisScoreDetail(base, position).interviewed).toBe(false);
    });
});

describe('isStaleFor', () => {
    const coverage = { assessments: [{ index: 1, status: 'met' }] };

    it('compares the stamp against the CURRENT requirements', () => {
        expect(isStaleFor({ requirementsFingerprint: FRESH(), requirementCoverage: coverage }, position)).toBe(false);
        expect(isStaleFor({ requirementsFingerprint: 'rESKI', requirementCoverage: coverage }, position)).toBe(true);
    });

    it('says stale when there is no position to compare against', () => {
        expect(isStaleFor({ requirementsFingerprint: FRESH(), requirementCoverage: coverage }, null)).toBe(true);
    });

    it('handles missing input', () => {
        expect(isStaleFor(null, position)).toBe(false);
        expect(isStaleFor({}, position)).toBe(false);
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

// ── Doğrulamanın skora etkisi ───────────────────────────────────────────────
// Doğrulama, analizin SÜRÜMÜNE değil CV'nin kendisine bakıyor. Bu yüzden
// bayat ya da yeniden hesaplanamayan kayıtlarda da geçerli olmak zorunda —
// erken dönüşlerden birinde unutulsaydı aynı aday iki ekranda iki farklı skor
// gösterirdi.
describe('doğrulama etkisi', () => {
    const clean = { counts: { celiski: 0 }, companies: { total: 0 }, lookupComplete: true, sector: null };
    const contradicted = { at: 'x', counts: { celiski: 1 }, companies: { total: 0 }, lookupComplete: true, sector: null };

    const withVerification = (analysis, verification) => ({
        ...fresh(analysis),
        verification,
    });

    const base = { score: 70, requirementCoverage: { coverageScore: 70 }, starAnalysis: star(8) };

    it('leaves the score alone when verification never ran', () => {
        const d = analysisScoreDetail(fresh(base), position);
        expect(d.verificationEffect.applied).toBe(false);
        expect(d.score).toBe(d.preVerificationScore);
    });

    it('leaves the score alone for a clean verification', () => {
        const d = analysisScoreDetail(withVerification(base, { at: 'x', ...clean }), position);
        expect(d.score).toBe(d.preVerificationScore);
    });

    it('lowers the score when a contradiction was measured', () => {
        const d = analysisScoreDetail(withVerification(base, contradicted), position);
        expect(d.score).toBeLessThan(d.preVerificationScore);
        expect(d.verificationEffect.verification.reasons[0].code).toBe('celiski');
    });

    // Bayat analizde de uygulanmalı: çelişki analizin sürümünde değil,
    // CV'nin kendisinde. Damgası tutmayan kayıt bayattır (bkz. yukarısı).
    it('applies to a stale analysis too', () => {
        const staleCandidate = {
            ...candidate({
                requirementsFingerprint: 'rESKI',
                score: 60,
                starAnalysis: star(8),
                requirementCoverage: { assessments: [{ index: 1, status: 'met' }, { index: 2, status: 'met' }, { index: 3, status: 'met' }] },
            }),
            verification: contradicted,
        };
        const d = analysisScoreDetail(staleCandidate, position);
        expect(d.stale).toBe(true);
        expect(d.preVerificationScore).toBe(60);
        expect(d.score).toBeLessThan(60);
    });

    // Ham verisi olmayan eski kayıtta saklanan skor gösteriliyor; doğrulama
    // ona da uygulanmalı.
    it('applies to a record that cannot be recomputed', () => {
        const legacy = { ...candidate({ score: 64 }), verification: contradicted };
        const d = analysisScoreDetail(legacy, position);
        expect(d.scanned).toBe(true);
        expect(d.preVerificationScore).toBe(64);
        expect(d.score).toBeLessThan(64);
    });

    it('reports sector and verification deductions separately', () => {
        const d = analysisScoreDetail(
            withVerification(base, { at: 'x', counts: { celiski: 1 }, companies: { total: 0 }, lookupComplete: true, sector: { verdict: 'yok' } }),
            position
        );
        expect(d.verificationEffect.verification.multiplier).toBeLessThan(1);
        expect(d.verificationEffect.sector.multiplier).toBeLessThan(1);
    });
});
