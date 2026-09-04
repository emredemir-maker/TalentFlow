// YARIDA KESİLMİŞ CEVAPTAN KURTARMA.
//
// Canlıda görüldü: mülakat soruları üretilirken model 10 madde için yazı
// yazıyor, çıktı bütçesi bitiyor ve JSON bir dizenin ortasında kesiliyor
// ("Unterminated string in JSON at position 979"). Eski davranışta bu, o ana
// kadar YAZILMIŞ soruların hepsinin çöpe gitmesi demekti.
import { describe, expect, it } from 'vitest';
import { salvageTruncatedArray, parseAIJson } from './utils';

/** Canlıda görülen kesilmenin birebir şekli. */
const KESIK = `{
  "questions": [
    {
      "requirementIndex": 6,
      "question": "Değer bazlı fiyatlandırma kurduğunuz bir örneği anlatır mısınız?",
      "followUp": "Fiyatı neye göre belirlediniz?",
      "listenFor": "Somut rakam ve karar gerekçesi"
    },
    {
      "requirementIndex": 7,
      "question": "CX ürününde sahibi olduğunuz akış neydi?",
      "followUp": "Ekipte kaç kişiydiniz?",
      "listenFor": "Sahiplik sınırı"
    },
    {
      "requirementIndex": 9,
      "question": "Ürün veya hizmetler için de`;

describe('salvageTruncatedArray', () => {
    it('TAMAMLANMIŞ ÖĞELER KURTARILIYOR, YARIM KALAN ATILIYOR', () => {
        const out = salvageTruncatedArray(KESIK);
        expect(out.questions).toHaveLength(2);
        expect(out.questions[0].requirementIndex).toBe(6);
        expect(out.questions[1].requirementIndex).toBe(7);
    });

    it('DİZE İÇİNDEKİ PARANTEZ SAYIMI BOZMUYOR', () => {
        // Bir cevabın içinde "{" geçmesi öğe sınırını kaydırırsa kurtarma
        // yanlış yerden keser ve geçerli öğeleri de kaybederiz.
        const metin = '{"questions":[{"question":"JSON {a:1} nedir?","note":"bak}"},{"question":"kesik';
        const out = salvageTruncatedArray(metin);
        expect(out.questions).toHaveLength(1);
        expect(out.questions[0].question).toContain('{a:1}');
    });

    it('kaçışlı tırnak sayımı bozmuyor', () => {
        const metin = '{"questions":[{"q":"o \\"iyi\\" dedi"},{"q":"kesi';
        expect(salvageTruncatedArray(metin).questions).toHaveLength(1);
    });

    it('tam ve kapanmış dizide de çalışıyor', () => {
        const out = salvageTruncatedArray('{"items":[{"a":1},{"a":2}]}');
        expect(out.items).toHaveLength(2);
    });

    it('kurtarılacak öğe yoksa null', () => {
        expect(salvageTruncatedArray('{"questions":[')).toBeNull();
        expect(salvageTruncatedArray('düz metin')).toBeNull();
        expect(salvageTruncatedArray('')).toBeNull();
    });

    it('alan adı korunuyor', () => {
        expect(Object.keys(salvageTruncatedArray('{"probes":[{"x":1},{"x"'))).toEqual(['probes']);
    });
});

describe('parseAIJson kesilmiş cevapta', () => {
    it('SORULARIN HEPSİ ÇÖPE GİTMİYOR', () => {
        const out = parseAIJson(KESIK, { questions: [] });
        expect(out.questions).toHaveLength(2);
    });

    it('sağlam cevapta davranış değişmedi', () => {
        expect(parseAIJson('{"questions":[{"a":1}]}')).toEqual({ questions: [{ a: 1 }] });
        expect(parseAIJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    });

    it('kurtarılacak hiçbir şey yoksa varsayılan dönüyor', () => {
        expect(parseAIJson('tamamen bozuk', { questions: [] })).toEqual({ questions: [] });
        expect(parseAIJson('', null)).toBeNull();
    });
});
