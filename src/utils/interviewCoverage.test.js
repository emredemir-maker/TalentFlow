// CV taraması + mülakat birleşimi.
//
// Üç şeyi sabitliyor:
//   1. Mülakat CV'yi EZMEZ — ikisi ayrı kanıt, birleşim okuma anında.
//   2. `inconclusive` hiçbir şeyi değiştirmez. Soru atlandı diye aday
//      cezalandırılmaz.
//   3. Damga tutmuyorsa birleşim YAPILMAZ. Bugün bu hatanın beş görünümünü
//      düzelttik; altıncısı adayın odada verdiği cevabı yanlış maddeye yazardı.
import { describe, expect, it } from 'vitest';

import {
    mergeInterviewCoverage, interviewAdjustedScore, interviewCoverageFor,
    statusLabel, isUpgrade,
} from './interviewCoverage';
import { requirementsFingerprint } from './positionRequirements';

const POSITION = {
    title: 'Growth Product Manager',
    requirementsMeta: [
        { text: 'Funnel sahipliği', must: true },
        { text: 'A/B test kurgulama', must: true },
        { text: 'CX ürünü geliştirmiş olmak', must: true },
        { text: 'GA4 hakimiyeti', must: false },
    ],
};
const FP = requirementsFingerprint(POSITION);

const cvAnalysis = (statuses) => ({
    requirementsFingerprint: FP,
    requirementCoverage: {
        assessments: statuses.map((status, i) => ({ index: i + 1, status, kind: 'deneyim', note: `not ${i + 1}` })),
    },
    starAnalysis: { Situation: { score: 2 }, Task: { score: 2 }, Action: { score: 2 }, Result: { score: 2 } },
});

const withInterview = (verdicts, fingerprint = FP) => ({
    interviewCoverage: {
        [POSITION.title]: {
            sessionId: 'mi-1',
            date: '2026-08-12',
            verdicts,
            requirementsFingerprint: fingerprint,
        },
    },
});

const v = (requirementIndex, verdict, quote = '') => ({ requirementIndex, verdict, quote });

describe('interviewCoverageFor', () => {
    it('returns the verdicts when they match the current requirement list', () => {
        const cov = interviewCoverageFor(withInterview([v(3, 'partial')]), POSITION);
        expect(cov.verdicts).toHaveLength(1);
    });

    it('refuses verdicts recorded against an older requirement list', () => {
        expect(interviewCoverageFor(withInterview([v(3, 'partial')], 'rESKI'), POSITION)).toBeNull();
    });

    it('keeps coverage separate per position', () => {
        const cand = { interviewCoverage: { 'Başka Pozisyon': { verdicts: [v(1, 'met')], requirementsFingerprint: FP } } };
        expect(interviewCoverageFor(cand, POSITION)).toBeNull();
    });

    it('treats empty or malformed coverage as none', () => {
        expect(interviewCoverageFor(withInterview([]), POSITION)).toBeNull();
        expect(interviewCoverageFor({}, POSITION)).toBeNull();
        expect(interviewCoverageFor(null, POSITION)).toBeNull();
        expect(interviewCoverageFor(withInterview([v(1, 'met')]), null)).toBeNull();
    });
});

describe('mergeInterviewCoverage — birleştirme kuralı', () => {
    it('lets the interview close a gap the CV had left open', () => {
        // Asıl kazanım bu: CV'de yoktu, aday odada anlattı
        const merged = mergeInterviewCoverage(
            cvAnalysis(['met', 'met', 'missing', 'met']),
            withInterview([v(3, 'partial', 'Employee engagement ürününü yönettim')]),
            POSITION
        );
        expect(merged.changes).toHaveLength(1);
        expect(merged.changes[0]).toMatchObject({
            requirementIndex: 3,
            from: 'missing',
            to: 'partial',
            must: true,
        });
        expect(merged.changes[0].quote).toContain('Employee engagement');
        expect(merged.assessments.find((a) => a.index === 3).status).toBe('partial');
    });

    it('lets the interview lower a verdict the CV had granted', () => {
        // Tek yönlü olsaydı sistem gerçeği değil iyimserliği ölçerdi
        const merged = mergeInterviewCoverage(
            cvAnalysis(['met', 'met', 'met', 'met']),
            withInterview([v(1, 'missing', 'O projede ben yoktum')]),
            POSITION
        );
        expect(merged.changes[0]).toMatchObject({ from: 'met', to: 'missing' });
    });

    it('marks the source so the origin of a verdict stays traceable', () => {
        const merged = mergeInterviewCoverage(
            cvAnalysis(['missing', 'met', 'met', 'met']),
            withInterview([v(1, 'met', 'Funnel benim sorumluluğumdaydı')]),
            POSITION
        );
        const item = merged.assessments.find((a) => a.index === 1);
        expect(item.source).toBe('interview');
        expect(item.interviewQuote).toContain('Funnel');
    });

    it('leaves untouched requirements exactly as the CV scan had them', () => {
        const merged = mergeInterviewCoverage(
            cvAnalysis(['met', 'partial', 'missing', 'met']),
            withInterview([v(3, 'met')]),
            POSITION
        );
        expect(merged.assessments.find((a) => a.index === 2)).toMatchObject({ status: 'partial', note: 'not 2' });
        expect(merged.assessments.find((a) => a.index === 2).source).toBeUndefined();
    });

    it('counts an agreeing verdict as confirmation, not a change', () => {
        const merged = mergeInterviewCoverage(
            cvAnalysis(['met', 'met', 'met', 'met']),
            withInterview([v(1, 'met'), v(2, 'met')]),
            POSITION
        );
        expect(merged.changes).toEqual([]);
        expect(merged.unchanged).toBe(2);
    });

    it('keeps the assessment list ordered by requirement number', () => {
        const merged = mergeInterviewCoverage(
            cvAnalysis(['missing', 'missing', 'missing', 'missing']),
            withInterview([v(4, 'met'), v(1, 'met')]),
            POSITION
        );
        expect(merged.assessments.map((a) => a.index)).toEqual([1, 2, 3, 4]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// INCONCLUSIVE — bilgi yokluğu kusur değildir.
//
// Mülakatta soru atlanır, süre biter, mülakatçı konuyu değiştirir. Bunların
// hiçbiri adayın eksiği değil ve hiçbiri skoruna dokunmamalı.
// ─────────────────────────────────────────────────────────────────────────────
describe('inconclusive', () => {
    it('changes nothing at all', () => {
        const merged = mergeInterviewCoverage(
            cvAnalysis(['met', 'met', 'missing', 'met']),
            withInterview([v(3, 'inconclusive', '')]),
            POSITION
        );
        expect(merged.changes).toEqual([]);
        expect(merged.assessments.find((a) => a.index === 3).status).toBe('missing');
    });

    it('is reported separately so the interviewer knows what stayed open', () => {
        const merged = mergeInterviewCoverage(
            cvAnalysis(['met', 'met', 'missing', 'met']),
            withInterview([v(3, 'inconclusive')]),
            POSITION
        );
        expect(merged.inconclusive).toEqual([
            { requirementIndex: 3, text: 'CX ürünü geliştirmiş olmak', must: true },
        ]);
    });

    it('does not move the score', () => {
        const analysis = cvAnalysis(['met', 'met', 'missing', 'met']);
        const out = interviewAdjustedScore(analysis, withInterview([v(3, 'inconclusive')]), POSITION);
        expect(out.delta).toBe(0);
        expect(out.score).toBe(out.cvScore);
    });
});

describe('bayat kayıtlarda birleşim', () => {
    it('refuses to merge when the interview verdicts predate an ad change', () => {
        const merged = mergeInterviewCoverage(
            cvAnalysis(['met', 'met', 'missing', 'met']),
            withInterview([v(3, 'met')], 'rESKI'),
            POSITION
        );
        expect(merged.hasInterview).toBe(false);
        expect(merged.changes).toEqual([]);
    });

    it('refuses to merge onto a stale CV scan', () => {
        // Eski yargıları yeni numaralara dizip üstüne mülakat eklemek,
        // hatayı katlamak olurdu
        const stale = { ...cvAnalysis(['met', 'met', 'missing', 'met']), requirementsFingerprint: 'rESKI' };
        const merged = mergeInterviewCoverage(stale, withInterview([v(3, 'met')]), POSITION);
        expect(merged.cvStale).toBe(true);
        expect(merged.hasInterview).toBe(false);
        expect(merged.changes).toEqual([]);
    });

    it('drops a verdict pointing past the end of the requirement list', () => {
        const merged = mergeInterviewCoverage(
            cvAnalysis(['met', 'met', 'missing', 'met']),
            withInterview([v(99, 'met')]),
            POSITION
        );
        expect(merged.changes).toEqual([]);
    });

    it('handles an analysis with no item-level assessments', () => {
        const merged = mergeInterviewCoverage({ score: 70 }, withInterview([v(1, 'met')]), POSITION);
        expect(merged.hasInterview).toBe(false);
        expect(merged.assessments).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SKOR — mülakat öncesi ve sonrası AYNI ölçekte olmalı.
//
// Farklı bir formül yazılsaydı iki sayı kıyaslanamazdı ve "mülakattan sonra
// 65'ten 78'e çıktı" cümlesi anlamsız olurdu.
// ─────────────────────────────────────────────────────────────────────────────
describe('interviewAdjustedScore', () => {
    it('raises the score when the interview closed a must-have gap', () => {
        const analysis = cvAnalysis(['met', 'met', 'missing', 'met']);
        const out = interviewAdjustedScore(analysis, withInterview([v(3, 'met', 'kanıt')]), POSITION);
        expect(out.score).toBeGreaterThan(out.cvScore);
        expect(out.delta).toBe(out.score - out.cvScore);
        expect(out.hasInterview).toBe(true);
    });

    it('lowers it when the interview took one away', () => {
        const analysis = cvAnalysis(['met', 'met', 'met', 'met']);
        const out = interviewAdjustedScore(analysis, withInterview([v(1, 'missing', 'kanıt')]), POSITION);
        expect(out.score).toBeLessThan(out.cvScore);
        expect(out.delta).toBeLessThan(0);
    });

    it('returns the plain CV score when there is no interview', () => {
        const analysis = cvAnalysis(['met', 'met', 'missing', 'met']);
        const out = interviewAdjustedScore(analysis, {}, POSITION);
        expect(out.score).toBe(out.cvScore);
        expect(out.hasInterview).toBe(false);
        expect(out.delta).toBe(0);
    });

    it('stays on the same scale as the CV score', () => {
        // Aynı calculateHybridScore; ayrı bir formül iki sayıyı
        // kıyaslanamaz yapardı
        const analysis = cvAnalysis(['missing', 'missing', 'missing', 'missing']);
        const all = interviewAdjustedScore(
            analysis,
            withInterview([v(1, 'met'), v(2, 'met'), v(3, 'met'), v(4, 'met')]),
            POSITION
        );
        const asIfCv = interviewAdjustedScore(cvAnalysis(['met', 'met', 'met', 'met']), {}, POSITION);
        expect(all.score).toBe(asIfCv.cvScore);
    });

    it('does not throw without an analysis', () => {
        expect(interviewAdjustedScore(null, withInterview([v(1, 'met')]), POSITION).score).toBe(0);
    });
});

describe('statusLabel ve isUpgrade', () => {
    it('names every status in Turkish', () => {
        expect(statusLabel('met')).toBe('karşılıyor');
        expect(statusLabel('partial')).toBe('kısmen');
        expect(statusLabel('missing')).toBe('yok');
        expect(statusLabel('inconclusive')).toBe('karar verilemedi');
        expect(statusLabel('hayalet')).toBe('bilinmiyor');
    });

    it('recognises which direction a change went', () => {
        expect(isUpgrade('missing', 'partial')).toBe(true);
        expect(isUpgrade('partial', 'met')).toBe(true);
        expect(isUpgrade('unknown', 'met')).toBe(true);
        expect(isUpgrade('met', 'partial')).toBe(false);
        expect(isUpgrade('met', 'missing')).toBe(false);
        expect(isUpgrade('partial', 'partial')).toBe(false);
    });
});
