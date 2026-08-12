// Mülakat sayısı kodda hesaplanır.
//
// Canlıda ölçüldü: kullanıcı iyi geçmediğini söylediği bir görüşmeye 90,
// daha uygun bulduğu adayın görüşmesine 80 verildi. Sıralama TERS döndü.
//
// Sebep prompt'taydı: modelden çıpasız bir 0-100 isteniyordu. Ne 70 ile 90'ın
// farkı tanımlıydı ne de neyin ölçüldüğü. Böyle bir istekte model akıcılığı
// yetkinlik sanar ve uzun konuşan aday kazanır.
import { describe, expect, it } from 'vitest';

import { interviewEvidence, suggestOutcome, EVAL_SCHEMA } from './interviewScore.js';

const REQS = [
    { text: 'Funnel sahipliği', must: true },
    { text: 'A/B test', must: true },
    { text: 'GA4', must: false },
    { text: 'SQL', must: false },
];

const v = (requirementIndex, verdict) => ({ requirementIndex, verdict });

describe('interviewEvidence — oran', () => {
    it('gives 100 only when every asked item came back met', () => {
        const e = interviewEvidence([v(1, 'met'), v(2, 'met')], REQS);
        expect(e.score).toBe(100);
        expect(e.asked).toBe(2);
    });

    it('gives 0 when nothing came back', () => {
        expect(interviewEvidence([v(1, 'missing'), v(2, 'missing')], REQS).score).toBe(0);
    });

    it('counts a partial as half', () => {
        expect(interviewEvidence([v(1, 'partial')], REQS).score).toBe(50);
    });

    it('weighs a must-have far above a nice-to-have', () => {
        // Zorunluyu karşılayıp tercih edileni karşılamamak, tersinden çok daha iyi
        const mustOnly = interviewEvidence([v(1, 'met'), v(3, 'missing')], REQS);
        const niceOnly = interviewEvidence([v(1, 'missing'), v(3, 'met')], REQS);
        expect(mustOnly.score).toBeGreaterThan(niceOnly.score);
        expect(mustOnly.score).toBe(85);
        expect(niceOnly.score).toBe(15);
    });

    it('treats unmarked requirements as full weight, like the scoring side does', () => {
        const unmarked = [{ text: 'A', must: null }, { text: 'B', must: null }];
        expect(interviewEvidence([v(1, 'met'), v(2, 'missing')], unmarked).score).toBe(50);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// INCONCLUSIVE PAYDAYA GİRMEZ.
//
// Soru atlanmışsa o madde ölçülmemiştir. Paydaya koymak, cevaplanmamış soruyu
// yanlış cevap saymak olurdu — mülakatçının süresi bitti diye aday cezalanmaz.
// ─────────────────────────────────────────────────────────────────────────────
describe('inconclusive', () => {
    it('does not lower the ratio', () => {
        const withIt = interviewEvidence([v(1, 'met'), v(2, 'inconclusive')], REQS);
        const without = interviewEvidence([v(1, 'met')], REQS);
        expect(withIt.score).toBe(without.score);
        expect(withIt.score).toBe(100);
    });

    it('is counted and reported separately', () => {
        const e = interviewEvidence([v(1, 'met'), v(2, 'inconclusive')], REQS);
        expect(e.inconclusive).toBe(1);
        expect(e.asked).toBe(1);
    });

    it('leaves no score at all when everything was inconclusive', () => {
        // Hiçbir şey ölçülmediyse sayı UYDURULMAZ
        const e = interviewEvidence([v(1, 'inconclusive'), v(2, 'inconclusive')], REQS);
        expect(e.score).toBeNull();
        expect(e.asked).toBe(0);
    });
});

describe('interviewEvidence — sayı üretilmeyen durumlar', () => {
    it('returns null when there are no verdicts at all', () => {
        // Ham transkript girişi: sorular gereksinime bağlı değil, ölçülecek
        // bir şey yok. Uydurma bir 90 basmaktansa boş bırakılır.
        expect(interviewEvidence([], REQS).score).toBeNull();
        expect(interviewEvidence(null, REQS).score).toBeNull();
    });

    it('ignores verdicts it does not recognise', () => {
        const e = interviewEvidence([v(1, 'harika'), v(2, 'met')], REQS);
        expect(e.asked).toBe(1);
        expect(e.score).toBe(100);
    });

    it('survives junk input', () => {
        expect(interviewEvidence(undefined, undefined).score).toBeNull();
        expect(interviewEvidence([null, 5, {}], REQS).score).toBeNull();
    });
});

describe('mustMissing', () => {
    it('counts must-haves that fell in the room', () => {
        const e = interviewEvidence([v(1, 'missing'), v(3, 'missing')], REQS);
        expect(e.mustMissing).toBe(1); // yalnızca 1. madde zorunlu
    });

    it('does not count a partial must-have as fallen', () => {
        expect(interviewEvidence([v(1, 'partial')], REQS).mustMissing).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ÖNERİ DE MODELDEN SORULMUYOR.
//
// Eskiden model positive/negative/pending seçiyordu ve puanla aynı sorunu
// taşıyordu: neye göre karar verdiği yazılı değildi. Kural artık okunabilir.
// ─────────────────────────────────────────────────────────────────────────────
describe('suggestOutcome', () => {
    it('never says positive when a must-have fell in the room', () => {
        // Kapı burada kapanır; skor yüksek olsa bile
        const e = interviewEvidence([v(1, 'missing'), v(2, 'met'), v(3, 'met'), v(4, 'met')], REQS);
        expect(e.mustMissing).toBe(1);
        expect(suggestOutcome(e)).toBe('negative');
    });

    it('suggests positive only on strong evidence', () => {
        expect(suggestOutcome(interviewEvidence([v(1, 'met'), v(2, 'met')], REQS))).toBe('positive');
        expect(suggestOutcome(interviewEvidence([v(1, 'partial'), v(2, 'partial')], REQS))).toBe('pending');
    });

    it('stays pending when nothing was measured', () => {
        // Ölçmediğimiz bir şeye dayanarak aday hakkında hüküm vermeyiz
        expect(suggestOutcome(interviewEvidence([], REQS))).toBe('pending');
        expect(suggestOutcome(interviewEvidence([v(1, 'inconclusive')], REQS))).toBe('pending');
        expect(suggestOutcome(null)).toBe('pending');
    });

    it('leaves the middle band to the human', () => {
        // 40-75 arası "belki" demek; sistem karar vermez.
        // Zorunlu KISMEN karşılanıyor — düşmüş değil, o yüzden kapı kapanmıyor.
        const mid = interviewEvidence([v(1, 'partial'), v(3, 'met')], REQS);
        expect(mid.mustMissing).toBe(0);
        expect(mid.score).toBeGreaterThanOrEqual(40);
        expect(mid.score).toBeLessThan(75);
        expect(suggestOutcome(mid)).toBe('pending');
    });

    it('a fallen must-have outranks a high ratio', () => {
        // Bu ayrım kritik: tercih edilen maddelerin hepsi karşılansa bile
        // zorunlu bir madde odada düştüyse öneri olumlu olamaz
        const e = interviewEvidence([v(2, 'missing'), v(3, 'met'), v(4, 'met')], REQS);
        expect(e.mustMissing).toBe(1);
        expect(suggestOutcome(e)).toBe('negative');
    });
});

describe('eval şeması', () => {
    it('marks the anchored generation so old inflated records stay distinguishable', () => {
        // 1 = modelin çıpasız 0-100'ü (canlıda 90 vs 80 tersliği)
        // 2 = damgalardan hesaplanan kanıt oranı
        expect(EVAL_SCHEMA).toBe(2);
    });
});
