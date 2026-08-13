// SAYI NEDEN ÜRETİLMEDİ? — dört ayrı sebep, dört ayrı çözüm.
//
// Arayüz bugüne kadar hepsine aynı cümleyi yazıyordu: "sorular ilanın
// maddelerine bağlı değil". Canlıda bu YANLIŞ çıktı. Kullanıcı:
//   1. Aday sayfasında Mülakat Planı'ndan soruları ürettirdi
//   2. Sorular modalda göründü — yani bağ vardı
//   3. Transkripti yapıştırdı, kaydetti
//   4. "Sayısal sonuç üretilmedi — sorular maddelere bağlı değil" gördü
//
// Eksik olan bağ değil, CEVAPTI: transkript kutuya yapıştırılmıştı ama
// cevaplar soru kutularına dağıtılmamıştı ve sunucu cevapsız soruyu
// değerlendirmeye almıyor.
//
// Yanlış teşhis, teşhis koymamaktan kötüdür: kullanıcıyı zaten yaptığı işi
// tekrar yapmaya gönderir.
import { describe, expect, it } from 'vitest';
import { scoreBlockReason } from './interviewGrader.js';

const linked = (answer) => ({ question: 'Funnel?', answer, requirementIndex: 1 });
const loose = (answer) => ({ question: 'Neden ayrıldınız?', answer });
const item = { requirementIndex: 1, requirementText: 'Funnel', must: true, question: 'Funnel?', answer: 'var' };
const verdict = { requirementIndex: 1, verdict: 'met', quote: 'var' };

describe('scoreBlockReason', () => {
    it('returns null when a score was produced', () => {
        expect(scoreBlockReason([linked('var')], [item], [verdict])).toBeNull();
    });

    it('says no-questions when only a transcript or note was entered', () => {
        expect(scoreBlockReason([], [], [])).toBe('no-questions');
    });

    it('says no-link when questions exist but none is tied to a requirement', () => {
        expect(scoreBlockReason([loose('cevap')], [], [])).toBe('no-link');
    });

    it('says no-answer when the link is there but the boxes are empty', () => {
        // CANLIDA KAÇIRILAN DURUM. Bağ vardı, cevap yoktu; ekran "bağ yok"
        // diyordu ve kullanıcıyı plandan soru üretmeye gönderiyordu — oysa
        // planı zaten üretmişti.
        expect(scoreBlockReason([linked('')], [], [])).toBe('no-answer');
        expect(scoreBlockReason([linked('   ')], [], [])).toBe('no-answer');
    });

    it('does not blame the link when SOME answers are missing but one is not', () => {
        // Tek bir cevap bile ölçüm için yeter; kalanlar "karar verilemedi" olur
        expect(scoreBlockReason([linked(''), linked('var')], [item], [verdict])).toBeNull();
    });

    it('says no-verdict when answers were graded but nothing was decided', () => {
        expect(scoreBlockReason([linked('var')], [item], [])).toBe('no-verdict');
    });

    it('checks link before answer — an unlinked question has no answer to grade', () => {
        // Sıra önemli: cevapsız VE bağsızsa asıl eksik bağdır, çünkü cevap
        // girilse bile ölçüm yapılamaz
        expect(scoreBlockReason([loose('')], [], [])).toBe('no-link');
    });

    it('survives malformed input', () => {
        expect(scoreBlockReason(null, null, null)).toBe('no-questions');
        expect(scoreBlockReason([{ requirementIndex: 'abc', answer: 'x' }], null, null)).toBe('no-link');
        expect(scoreBlockReason([{ requirementIndex: 0, answer: 'x' }], null, null)).toBe('no-link');
    });
});
