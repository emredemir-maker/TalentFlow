// Rapor kayıtta ne varsa onu göstermeli — ne eksik ne uydurma.
//
// Manuel görüşmede rapor BOŞ çıkıyordu: sayfa canlı akışın alanlarını
// (starScores, aiSummary, finalScore) okuyordu, manuel akış ise bambaşka
// alanlar yazıyor. Değerlendirme kaydın içindeydi ve kimse okumuyordu.
import { describe, expect, it } from 'vitest';
import {
    buildInterviewReport,
    hasCompetencyScores,
    hasStarScores,
    NO_SCORE_TEXT,
} from './interviewReport.js';
import { requirementsFingerprint } from './positionRequirements.js';

const POSITION = {
    title: 'Ürün Müdürü',
    // requirementsMeta: zorunlu/tercihen işaretli liste (requirementsOf bunu okur)
    requirementsMeta: [
        { text: 'Funnel sahipliği', must: true },
        { text: 'A/B test kurgusu', must: true },
        { text: 'CX ürünü deneyimi', must: false },
    ],
};

/** Kaydın gerçek şekli — functions/routes/interview.js ne yazıyorsa o. */
function manualSession(overrides = {}) {
    return {
        mode: 'manual',
        evalSchema: 2,
        questions: [
            { question: 'Funnel sahipliği?', answer: 'Uçtan uca sahiptim', requirementIndex: 1 },
            { question: 'A/B test?', answer: 'Kurguladım', requirementIndex: 2 },
        ],
        requirementVerdicts: [
            { requirementIndex: 1, verdict: 'met', quote: 'uçtan uca sahiptim' },
            { requirementIndex: 2, verdict: 'partial', quote: 'kurguladım' },
        ],
        evidence: { score: 75, asked: 2, met: 1, partial: 1, missing: 0, inconclusive: 0, mustMissing: 0 },
        recommendedOutcome: 'positive',
        aiAnalysis: {
            summary: 'Aday funnel tarafında güçlü.',
            strengths: ['Funnel sahipliği net'],
            concerns: ['A/B tarafı sığ'],
            questions: [
                { question: 'Funnel sahipliği?', observation: 'Somut örnek verdi' },
                { question: 'A/B test?', observation: 'Yüzeysel kaldı' },
            ],
        },
        ...overrides,
    };
}

describe('buildInterviewReport', () => {
    it('surfaces the evaluation that was already in the record', () => {
        const r = buildInterviewReport(manualSession(), POSITION);
        expect(r.summary).toBe('Aday funnel tarafında güçlü.');
        expect(r.evidence.score).toBe(75);
        expect(r.outcome).toBe('positive');
        expect(r.items).toHaveLength(2);
        expect(r.hasAnything).toBe(true);
    });

    it('joins verdict, question, answer and requirement text on one row', () => {
        // Bunlar üç ayrı yerde duruyor; ekranda tek satır olmazsa kullanıcı
        // "hangi maddeye ne dedi" sorusunu cevaplayamaz
        const [first] = buildInterviewReport(manualSession(), POSITION).items;
        expect(first).toMatchObject({
            requirementIndex: 1,
            text: 'Funnel sahipliği',
            must: true,
            verdict: 'met',
            quote: 'uçtan uca sahiptim',
            question: 'Funnel sahipliği?',
            answer: 'Uçtan uca sahiptim',
            observation: 'Somut örnek verdi',
        });
    });

    it('matches observations by question text, never by order', () => {
        // Model bir soruyu atlarsa sıra kayar ve gözlem yanlış soruya yazılır.
        // Aynı sınıf hatanın altı görünümünü düzelttik; yedincisi burada olurdu.
        const session = manualSession({
            aiAnalysis: {
                summary: '',
                questions: [{ question: 'A/B test?', observation: 'Yüzeysel kaldı' }],
            },
        });
        const items = buildInterviewReport(session, POSITION).items;
        expect(items[0].observation).toBe('');            // eşleşme yok → boş
        expect(items[1].observation).toBe('Yüzeysel kaldı');
    });

    it('sorts by requirement index even when verdicts arrive shuffled', () => {
        const session = manualSession({
            requirementVerdicts: [
                { requirementIndex: 2, verdict: 'partial', quote: '' },
                { requirementIndex: 1, verdict: 'met', quote: '' },
            ],
        });
        expect(buildInterviewReport(session, POSITION).items.map((i) => i.requirementIndex))
            .toEqual([1, 2]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// İLAN DEĞİŞTİYSE MADDE METNİ GÖSTERİLMEZ.
//
// Damgalar bir madde LİSTESİNE ait. Liste değiştiğinde numaralar başka
// maddelere denk gelir ve adayın odada verdiği cevap yanlış maddeye yazılır.
// ─────────────────────────────────────────────────────────────────────────────
describe('ilan değişmişse', () => {
    const stale = manualSession({ requirementsFingerprint: 'eski-parmak-izi' });

    it('flags the record instead of mapping old verdicts onto new requirements', () => {
        const r = buildInterviewReport(stale, POSITION);
        expect(r.requirementsStale).toBe(true);
        expect(r.items.every((i) => i.text === null)).toBe(true);
    });

    it('explains why no number is shown', () => {
        expect(buildInterviewReport(stale, POSITION).noScoreReason).toBe('stale');
        expect(NO_SCORE_TEXT.stale).toMatch(/yanlış maddelere/);
    });

    it('still shows the verdicts and quotes — they are real evidence', () => {
        // Damga eskimiş olabilir ama adayın söylediği söz duruyor
        const r = buildInterviewReport(stale, POSITION);
        expect(r.items).toHaveLength(2);
        expect(r.items[0].quote).toBe('uçtan uca sahiptim');
    });

    it('is not stale when the fingerprint still matches', () => {
        const fresh = manualSession({ requirementsFingerprint: requirementsFingerprint(POSITION) });
        const r = buildInterviewReport(fresh, POSITION);
        expect(r.requirementsStale).toBe(false);
        expect(r.items[0].text).toBe('Funnel sahipliği');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SAYI ÜRETİLEMEDİYSE SEBEBİ YAZILIR.
//
// Ölçemediği şeyi 0 diye yazmak, olmayan bir ölçümü varmış gibi göstermektir.
// ─────────────────────────────────────────────────────────────────────────────
describe('sayısal sonuç yoksa', () => {
    it('names the missing link when questions were not tied to requirements', () => {
        const session = manualSession({ requirementVerdicts: [], evidence: null });
        const r = buildInterviewReport(session, POSITION);
        expect(r.noScoreReason).toBe('no-link');
        expect(NO_SCORE_TEXT['no-link']).toMatch(/Mülakat Planı/);
    });

    it('separates "nothing was decided" from "nothing was asked"', () => {
        // Hepsi inconclusive: sorular maddeye BAĞLIYDI ama cevaplardan hüküm
        // çıkmadı. Farklı sebep, farklı çözüm.
        const session = manualSession({
            requirementVerdicts: [{ requirementIndex: 1, verdict: 'inconclusive', quote: '' }],
            evidence: { score: null, asked: 0, met: 0, partial: 0, missing: 0, inconclusive: 1, mustMissing: 0 },
        });
        expect(buildInterviewReport(session, POSITION).noScoreReason).toBe('no-verdict');
    });

    it('reports no reason when a score exists', () => {
        expect(buildInterviewReport(manualSession(), POSITION).noScoreReason).toBeNull();
    });
});

describe('maddeye bağlı olmayan sorular', () => {
    it('keeps them visible instead of dropping them', () => {
        // Skora girmiyorlar ama konuşuldular; yok saymak mülakatçının emeğini siler
        const session = manualSession({
            questions: [
                ...manualSession().questions,
                { question: 'Neden ayrıldınız?', answer: 'Yeniden yapılanma' },
            ],
            aiAnalysis: {
                ...manualSession().aiAnalysis,
                questions: [{ question: 'Neden ayrıldınız?', observation: 'Net ve sakin' }],
            },
        });
        const r = buildInterviewReport(session, POSITION);
        expect(r.unlinked).toHaveLength(1);
        expect(r.unlinked[0].observation).toBe('Net ve sakin');
        expect(r.items.every((i) => i.question !== 'Neden ayrıldınız?')).toBe(true);
    });
});

describe('eski şema', () => {
    it('marks records whose number came from the model, not from verdicts', () => {
        // Şema 1'de sayıyı model üretiyordu ve çıpasızdı: canlıda kötü geçen
        // görüşme 90, daha iyi aday 80 aldı
        expect(buildInterviewReport(manualSession({ evalSchema: 1 }), POSITION).legacySchema).toBe(true);
        expect(buildInterviewReport(manualSession(), POSITION).legacySchema).toBe(false);
    });

    it('does not mark records that carry no schema stamp at all', () => {
        expect(buildInterviewReport(manualSession({ evalSchema: undefined }), POSITION).legacySchema)
            .toBe(false);
    });
});

describe('bozuk / eksik kayıt', () => {
    it('survives an empty session', () => {
        const r = buildInterviewReport(null, null);
        expect(r.items).toEqual([]);
        expect(r.hasAnything).toBe(false);
    });

    it('survives malformed verdicts and questions', () => {
        const session = manualSession({
            requirementVerdicts: [null, { requirementIndex: 'abc' }, 5],
            questions: 'metin',
            aiAnalysis: { questions: 'metin' },
        });
        const r = buildInterviewReport(session, POSITION);
        expect(r.items).toEqual([]);
        expect(r.unlinked).toEqual([]);
    });

    it('works without a position — verdicts stay, texts do not appear', () => {
        const r = buildInterviewReport(manualSession(), null);
        expect(r.items).toHaveLength(2);
        expect(r.items[0].text).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// CANLI AKIŞIN ALANLARI — varsa gösterilir, yoksa BÖLÜM HİÇ ÇIKMAZ.
//
// Dört boş STAR kutusu basıp "analiz edilmedi" yazmak, ölçülmeyen bir şeyi
// ölçülmüş gibi göstermenin yumuşak hâli.
// ─────────────────────────────────────────────────────────────────────────────
describe('hasStarScores / hasCompetencyScores', () => {
    it('is false for a manual interview', () => {
        expect(hasStarScores(manualSession())).toBe(false);
        expect(hasCompetencyScores(manualSession())).toBe(false);
    });

    it('is true for a live interview record', () => {
        const live = { starScores: { S: 70, T: 60, A: 80, R: 50 } };
        expect(hasStarScores(live)).toBe(true);
    });

    it('needs all five axes before drawing the radar', () => {
        // Eksik köşe NaN üretiyor ve poligon sessizce çizilmiyordu
        expect(hasCompetencyScores({ starScores: { technical: 70, communication: 60 } })).toBe(false);
        expect(hasCompetencyScores({
            starScores: {
                technical: 70, communication: 60, problemSolving: 50, cultureFit: 40, adaptability: 30,
            },
        })).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SEBEBİ SUNUCU BİLİR.
//
// Kayıt anında elinde soru, cevap ve damga hepsi vardı. Rapordan geriye dönük
// tahmin "bağ yok" ile "cevap yok"u ayıramaz — canlıda tam olarak bu ikisi
// karıştı ve kullanıcı zaten yaptığı işi tekrar yapmaya gönderildi.
// ─────────────────────────────────────────────────────────────────────────────
describe('kayitli sebep', () => {
    const noScore = { requirementVerdicts: [], evidence: null };

    it('uses the reason the server recorded', () => {
        const r = buildInterviewReport({ ...noScore, noScoreReason: 'no-answer' }, POSITION);
        expect(r.noScoreReason).toBe('no-answer');
        expect(NO_SCORE_TEXT['no-answer']).toMatch(/cevap kutuları boştu/);
    });

    it('tells the user the transcript box alone is not enough', () => {
        // Transkripti yapıştırmak ölçüm için yetmiyor; cevapların kutulara
        // dağıtılması gerekiyor ve bunu kullanıcının bilmesi lazım
        expect(NO_SCORE_TEXT['no-answer']).toMatch(/Transkriptten cevapları doldur/);
        expect(NO_SCORE_TEXT['no-answer']).toMatch(/transkriptin kendisi soru bazında ölçülmüyor/);
    });

    it('ignores an unknown reason instead of showing an empty box', () => {
        const r = buildInterviewReport({ ...noScore, noScoreReason: 'kim-bilir' }, POSITION);
        expect(NO_SCORE_TEXT[r.noScoreReason]).toBeTruthy();
    });

    it('falls back to guessing for records saved before the field existed', () => {
        expect(buildInterviewReport(noScore, POSITION).noScoreReason).toBe('no-questions');
        expect(buildInterviewReport({ ...noScore, questions: [{ question: 'S' }] }, POSITION).noScoreReason)
            .toBe('no-link');
    });

    it('lets a stale requirement list override the stored reason', () => {
        // İlan değiştiyse damgaların hangi listeye ait olduğu belirsiz;
        // bu, cevap eksikliğinden daha önemli bir uyarı
        const r = buildInterviewReport(
            { ...noScore, noScoreReason: 'no-answer', requirementsFingerprint: 'eski' },
            POSITION
        );
        expect(r.noScoreReason).toBe('stale');
    });
});
