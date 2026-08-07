// Kaçışsız tırnak onarımı ve ayrıştırma teşhisi.
//
// NEDEN: 2026-08-07'de bir aday analizi "AI yanıtı JSON olarak okunamadı
// (uzunluk: 7572)" ile düştü. Yanıt KESİK DEĞİLDİ — düzgün `" } }` ile
// kapanıyordu. Sebep, metin alanının içinde kalmış kaçışsız bir çift
// tırnaktı. sanitizeControlChars bunu kurtaramıyor: her `"` karakterini
// dizi aç/kapa saydığı için kaçışsız tırnak durumu ters çevirip yanıtın
// geri kalanını da bozuyor.
//
// Tetikleyici muhtemelen bizim kendi prompt değişikliğimizdi (#89):
// modelden "CV'den kısa alıntı" istedik, model de alıntıyı çift tırnakla
// yazdı.
import { describe, expect, it } from 'vitest';
import { parseAIJson, repairUnescapedQuotes, jsonFailureContext } from './utils.js';

describe('repairUnescapedQuotes', () => {
    it('escapes a stray quote inside a string value', () => {
        const broken = '{"note": "CV\'de "funnel sahipliği" yazılmış."}';
        expect(JSON.parse(repairUnescapedQuotes(broken)).note)
            .toBe('CV\'de "funnel sahipliği" yazılmış.');
    });

    it('leaves valid JSON byte-identical', () => {
        const valid = '{"a": "düz metin", "b": [1, 2], "c": {"d": null}}';
        expect(repairUnescapedQuotes(valid)).toBe(valid);
    });

    it('does not touch quotes that are already escaped', () => {
        const valid = '{"note": "model \\"böyle\\" yazdı"}';
        expect(JSON.parse(repairUnescapedQuotes(valid)).note).toBe('model "böyle" yazdı');
    });

    it('still recognises the real closing quote before , : } and ]', () => {
        const broken = '{"a": "x "y" z", "b": ["p "q" r"], "c": {"d": "m "n" o"}}';
        const parsed = JSON.parse(repairUnescapedQuotes(broken));
        expect(parsed.a).toBe('x "y" z');
        expect(parsed.b[0]).toBe('p "q" r');
        expect(parsed.c.d).toBe('m "n" o');
    });

    it('handles the shape that actually broke: a long summary with quoted requirements', () => {
        const broken = '{"evidence": {"summary": "Aday, "ekip yönetimi" ve "veri okuryazarlığı" '
            + 'zorunlu gereksinimleri için yeterli kanıt sunmamaktadır."}}';
        const parsed = JSON.parse(repairUnescapedQuotes(broken));
        expect(parsed.evidence.summary).toContain('ekip yönetimi');
        expect(parsed.evidence.summary).toContain('veri okuryazarlığı');
    });

    it('documents the known limitation: inner quote followed by a comma', () => {
        // Sezgi burada yanılır — içteki tırnaktan sonra virgül geldiği için
        // kapanış sayılır. Kasıtlı bir ödün: son çare olarak tamamen
        // başarısız olmaktansa denemek. Test bunu belgelemek için var.
        const tricky = '{"a": "o dedi ki: "tamam", sonra gitti"}';
        expect(() => JSON.parse(repairUnescapedQuotes(tricky))).toThrow();
    });
});

describe('parseAIJson — son çare onarımı', () => {
    it('recovers a response that only fails because of a stray quote', () => {
        const raw = '{"extractedData": {"coverageScore": 62}, '
            + '"evidence": {"summary": "Aday "funnel" deneyimini anlatmış."}}';
        const parsed = parseAIJson(raw);
        expect(parsed).not.toBeNull();
        expect(parsed.extractedData.coverageScore).toBe(62);
    });

    it('still parses clean JSON without going through repair', () => {
        expect(parseAIJson('{"a": 1}')).toEqual({ a: 1 });
    });

    it('still handles markdown fences', () => {
        expect(parseAIJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    });

    it('still escapes raw newlines inside strings', () => {
        expect(parseAIJson('{"a": "iki\nsatır"}').a).toBe('iki\nsatır');
    });

    it('returns the default when the text is genuinely unusable', () => {
        expect(parseAIJson('bu JSON değil', 'yedek')).toBe('yedek');
        expect(parseAIJson('', 'yedek')).toBe('yedek');
    });

    it('returns the default for a truncated response', () => {
        // Kesik yanıtta kapanış parantezi yok; onarım da kurtaramaz
        expect(parseAIJson('{"a": "yarıda kes')).toBeNull();
    });
});

describe('jsonFailureContext', () => {
    it('returns null when the text parses', () => {
        expect(jsonFailureContext('{"a": 1}')).toBeNull();
    });

    it('points at where the break happened, not at the end of the response', () => {
        // Asıl teşhis sorunu buydu: yanıt sonu gösteriliyordu ama kırılma
        // ortadaydı, dolayısıyla ekran görüntüsü hiçbir şey söylemiyordu.
        const padding = 'x'.repeat(400);
        const broken = `{"a": "bozuk"tirnak", "b": "${padding}"}`;
        const ctx = jsonFailureContext(broken);
        expect(ctx.position).toBeGreaterThan(0);
        expect(ctx.position).toBeLessThan(40);
        expect(ctx.snippet).toContain('bozuk');
    });

    it('falls back to the tail when the engine gives no position', () => {
        const ctx = jsonFailureContext('bu JSON değil');
        expect(ctx.message).toBeTruthy();
        expect(ctx.snippet).toBeTruthy();
    });
});
