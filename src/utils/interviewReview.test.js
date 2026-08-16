// MÜLAKAT İNCELEMESİNİN ÇERÇEVESİ.
//
// Asistanın ikinci aracı. Kural değişmedi: ÖLÇÜM KODDA, model yalnızca ifade
// eder. Bu testlerin işi, modele hiç güvenmeden doğru olması gereken üç şeyi
// sabitlemek:
//
//   1. Sayısal sonucu olmayan görüşme ORTALAMAYA GİRMEZ ve sayılır.
//   2. Hiç sorulmamış madde bir EKSİKLİK DEĞİL, bilgi yokluğudur.
//   3. Alıntılar KODUN seçtiği alanlardan gelir, anlatım anında üretilmez.
import { describe, expect, it } from 'vitest';

import { buildInterviewReview, reviewSummaryForPrompt } from './interviewReview';
import { requirementsFingerprint } from './positionRequirements';

const POSITION = {
    title: 'Growth PM',
    requirementsMeta: [
        { text: 'PLG deneyimi', must: true },
        { text: 'SQL', must: true },
        { text: 'B2B pazarlama', must: false },
    ],
};
const FP = requirementsFingerprint(POSITION);

/** Ölçülmüş bir görüşme kaydı. */
const session = (over = {}) => ({
    requirementsFingerprint: FP,
    evidence: { score: 70, asked: 2, met: 1, partial: 1, missing: 0, inconclusive: 0, mustMissing: 0 },
    recommendedOutcome: 'positive',
    questions: [
        { question: 'PLG deneyimin?', answer: 'Freemium funnel kurdum', requirementIndex: 1 },
        { question: 'SQL?', answer: 'Günlük kullanıyorum', requirementIndex: 2 },
    ],
    requirementVerdicts: [
        { requirementIndex: 1, verdict: 'met', quote: 'Freemium funnel kurdum' },
        { requirementIndex: 2, verdict: 'partial', quote: 'Günlük kullanıyorum' },
    ],
    ...over,
});

const entry = (name, over) => ({ candidateId: name, candidateName: name, session: session(over) });

describe('buildInterviewReview', () => {
    it('tallies verdicts across interviews', () => {
        const out = buildInterviewReview([entry('Ayşe'), entry('Mehmet')], POSITION);
        expect(out.interviewCount).toBe(2);
        expect(out.scored).toBe(2);
        expect(out.tally).toEqual({ met: 2, partial: 2, missing: 0, inconclusive: 0 });
    });

    // "3 görüşmenin ortalaması" derken 2'sinin hiç ölçülmediğini söylememek,
    // olmayan bir ölçümü varmış gibi göstermektir.
    it('excludes an unscored interview from the tally and reports it', () => {
        const broken = entry('Onur', {
            evidence: { score: null }, requirementVerdicts: [], noScoreReason: 'grading-failed',
        });
        const out = buildInterviewReview([entry('Ayşe'), broken], POSITION);
        expect(out.interviewCount).toBe(2);
        expect(out.scored).toBe(1);
        expect(out.tally.met).toBe(1);
        expect(out.unscored).toEqual([{ name: 'Onur', reason: 'grading-failed' }]);
    });

    // Sorulmamış madde adayın kusuru değil; karıştırmak onu olmayan bir
    // eksikle cezalandırır.
    it('lists a requirement that was never asked, separate from a failed one', () => {
        const out = buildInterviewReview([entry('Ayşe')], POSITION);
        expect(out.neverAsked.map((r) => r.text)).toEqual(['B2B pazarlama']);
        expect(out.tally.missing).toBe(0);
    });

    it('counts per-requirement coverage', () => {
        const out = buildInterviewReview([entry('Ayşe'), entry('Mehmet')], POSITION);
        const plg = out.requirementCoverage.find((r) => r.text === 'PLG deneyimi');
        expect(plg).toMatchObject({ asked: 2, met: 2, must: true });
    });

    // Alıntı damga çağrısının CEVAPTAN çıkardığı metin; anlatım anında model
    // tarafından üretilmez.
    it('carries code-selected quotes, not narration-time text', () => {
        const out = buildInterviewReview([entry('Ayşe')], POSITION);
        expect(out.perCandidate[0].quotes).toContainEqual({
            requirement: 'PLG deneyimi', verdict: 'Karşılıyor', quote: 'Freemium funnel kurdum',
        });
    });

    it('drops inconclusive items from the quote list', () => {
        const out = buildInterviewReview([entry('Ayşe', {
            requirementVerdicts: [{ requirementIndex: 1, verdict: 'inconclusive', quote: '' }],
        })], POSITION);
        expect(out.perCandidate[0].quotes).toEqual([]);
    });

    // İlan görüşmeden sonra değiştiyse damgalar ESKİ listeye ait.
    it('counts interviews whose verdicts belong to an older requirement list', () => {
        const out = buildInterviewReview([entry('Ayşe', { requirementsFingerprint: 'eski' })], POSITION);
        expect(out.staleCount).toBe(1);
    });

    it('survives an empty list and a missing position', () => {
        expect(buildInterviewReview([], POSITION).interviewCount).toBe(0);
        expect(buildInterviewReview([entry('Ayşe')], null).interviewCount).toBe(1);
    });
});

describe('reviewSummaryForPrompt', () => {
    // Ham transcript modele HİÇ girmez: adayın kendi sözleri, CV'den bile açık
    // bir enjeksiyon kanalı.
    it('never carries the raw transcript into the prompt payload', () => {
        const withTranscript = entry('Ayşe', { transcript: 'ÇOK UZUN HAM TRANSKRİPT'.repeat(50) });
        const summary = reviewSummaryForPrompt(buildInterviewReview([withTranscript], POSITION));
        expect(JSON.stringify(summary)).not.toContain('HAM TRANSKRİPT');
    });

    it('keeps the numbers the narrator is allowed to cite', () => {
        const summary = reviewSummaryForPrompt(buildInterviewReview([entry('Ayşe')], POSITION));
        expect(summary.damga_dagilimi.met).toBe(1);
        expect(summary.hic_sorulmamis_maddeler).toEqual(['B2B pazarlama']);
        expect(summary.pozisyon).toBe('Growth PM');
    });
});

// ÖRNEKLEM GİZLENEMEZ.
//
// İlk sürümde seçim adayların dizi sırasınaydı ve kesme bilgisi anlatıcıya
// HİÇ gitmiyordu: 200 görüşmenin keyfi 25'inden çıkan dağılım, bütünün
// dağılımı gibi anlatılabiliyordu. Kullanıcı bunu fark edemezdi.
describe('reviewSummaryForPrompt — örneklem', () => {
    it('tells the narrator when it is looking at a subset', () => {
        const review = buildInterviewReview([entry('Ayşe')], POSITION);
        const summary = reviewSummaryForPrompt(review, { totalSessions: 200 });
        expect(summary.orneklem).toEqual({
            okunan_gorusme: 1,
            toplam_gorusme: 200,
            tamami_mi: false,
            kural: 'en yeni görüşmeler önce',
        });
    });

    it('marks a complete read as complete', () => {
        const review = buildInterviewReview([entry('Ayşe'), entry('Mehmet')], POSITION);
        const summary = reviewSummaryForPrompt(review, { totalSessions: 2 });
        expect(summary.orneklem.tamami_mi).toBe(true);
        expect(summary.orneklem.kural).toBeNull();
    });

    // Örneklem bilgisi verilmezse okunan sayı toplam sayılır — uydurma bir
    // "toplam" üretmektense elimizdekini beyan etmek doğru.
    it('does not invent a total when none was supplied', () => {
        const summary = reviewSummaryForPrompt(buildInterviewReview([entry('Ayşe')], POSITION));
        expect(summary.orneklem.toplam_gorusme).toBe(1);
        expect(summary.orneklem.tamami_mi).toBe(true);
    });
});

// BÜTÇE FARKI — "adaylar iyi ama bütçemin çok üzerindeler" ölçülebilir olsun.
//
// En kritik kural: BEKLENTİSİ BİLİNMEYEN aday "bandın içinde" sayılmaz.
// Saymak, ölçülmemiş bir şeyi ölçülmüş göstermek ve tabloyu olduğundan
// iyimser yapmak olurdu — üstelik çıktısı bir bütçe kararı.
describe('bütçe farkı', () => {
    const BANDED = { ...POSITION, salaryBand: { min: 80000, max: 120000, currency: 'TRY', period: 'monthly' } };
    const withSalary = (name, salary) => entry(name, { candidateSalary: salary });
    const TRY_ = (n) => ({ min: n, max: n, currency: 'TRY', period: 'monthly' });

    it('places each candidate against the band', () => {
        const out = buildInterviewReview([
            withSalary('Ayşe', TRY_(150000)),
            withSalary('Mehmet', TRY_(100000)),
            withSalary('Zeynep', TRY_(50000)),
        ], BANDED);
        expect(out.salaryTally).toEqual({ above: 1, within: 1, below: 1, unknown: 0 });
    });

    it('counts a missing expectation as unknown, never as within', () => {
        const out = buildInterviewReview([withSalary('Ayşe', null), withSalary('Mehmet', TRY_(100000))], BANDED);
        expect(out.salaryTally).toEqual({ above: 0, within: 1, below: 0, unknown: 1 });
    });

    // Kur çevirmiyoruz; çeviremediğimiz aday "bandın içinde" sayılamaz.
    it('counts a mismatched currency as unknown', () => {
        const out = buildInterviewReview([withSalary('Ayşe', { min: 5000, max: 5000, currency: 'USD', period: 'monthly' })], BANDED);
        expect(out.salaryTally.unknown).toBe(1);
        expect(out.perCandidate[0].salary.reason).toMatch(/kur çevirmiyoruz/i);
    });

    // Ortanca: tek bir uç aday tabloyu bozmasın.
    it('reports the median overshoot, not the mean', () => {
        const out = buildInterviewReview([
            withSalary('A', TRY_(132000)),   // %10
            withSalary('B', TRY_(150000)),   // %25
            withSalary('C', TRY_(600000)),   // %400 — uç
        ], BANDED);
        expect(out.medianOvershoot).toBeCloseTo(0.25);
    });

    it('says nothing about budget when the position has no band', () => {
        const out = buildInterviewReview([withSalary('Ayşe', TRY_(150000))], POSITION);
        expect(out.hasBand).toBe(false);
        expect(reviewSummaryForPrompt(out).butce).toBeNull();
    });

    it('hands the narrator the budget table when a band exists', () => {
        const summary = reviewSummaryForPrompt(buildInterviewReview([withSalary('Ayşe', TRY_(150000))], BANDED));
        expect(summary.butce).toMatchObject({ bandin_ustunde: 1, beklentisi_bilinmiyor: 0 });
    });
});
