// Gereksinim düzenleyicinin doğrulama katmanı.
//
// Model maddeleri bölerken ilan metnini DEĞİŞTİRİYOR. Uydurulmuş bir
// gereksinim gerçek adayları eler; kaybolan bir gereksinim kritik bir eksiği
// görünmez kılar. İkisi de sessizce olursa fark edilmez — bu yüzden kod
// denetliyor, kullanıcı onaylıyor.
import { describe, expect, it } from 'vitest';

import {
    verifyNormalization, normalizationDiff, priorityInText, significantWords, MIN_OVERLAP,
} from './requirementNormalize';

// Canlıda soruna yol açan gerçek madde
const COMPOUND = 'PLG/self-servis akış, fiyatlandırma-paketleme, CX-helpdesk-CRM ürün geçmişi (tercih sebebi)';

describe('significantWords', () => {
    it('drops carrier nouns that appear in every requirement', () => {
        // "deneyim", "bilgisi" gibi kelimeler her maddede geçer; örtüşme
        // sayarken bunları saymak her şeyi eşleşmiş gösterirdi
        const w = significantWords('CRM ürünü geliştirme deneyimi');
        expect(w).toContain('crm');
        expect(w).not.toContain('deneyimi');
    });

    it('folds Turkish so casing cannot hide a match', () => {
        expect(significantWords('İSTANBUL')).toEqual(['istanbul']);
    });

    it('keeps technical tokens with symbols', () => {
        expect(significantWords('C# ve Node.js')).toEqual(expect.arrayContaining(['c#', 'node', 'js']));
    });
});

describe('verifyNormalization', () => {
    it('accepts a faithful split of the real compound requirement', () => {
        const result = verifyNormalization(COMPOUND, [
            { text: 'PLG / self-servis akış kurmuş olmak', must: true },
            { text: 'Fiyatlandırma ve paketleme sahipliği', must: true },
            { text: 'CX, helpdesk veya CRM ürün geçmişi', must: false },
        ]);
        expect(result.invented).toEqual([]);
        expect(result.ok).toBe(true);
    });

    it('catches a requirement the model INVENTED', () => {
        // En tehlikeli hata: ilanda olmayan bir şart eklemek gerçek adayları eler
        const result = verifyNormalization(COMPOUND, [
            { text: 'PLG / self-servis akış', must: true },
            { text: 'Fiyatlandırma paketleme', must: true },
            { text: 'CX helpdesk CRM', must: true },
            { text: 'Yurtdışında yüksek lisans yapmış olmak', must: true },
        ]);
        expect(result.ok).toBe(false);
        expect(result.invented).toHaveLength(1);
        expect(result.invented[0].text).toContain('yüksek lisans');
        expect(result.invented[0].unknownWords).toEqual(expect.arrayContaining(['lisans']));
    });

    it('catches a topic the model DROPPED', () => {
        // Kaybolan gereksinim kritik bir eksiği görünmez kılar
        const result = verifyNormalization(COMPOUND, [
            { text: 'PLG / self-servis akış', must: true },
            { text: 'Fiyatlandırma paketleme', must: true },
        ]);
        expect(result.ok).toBe(false);
        expect(result.dropped).toEqual(expect.arrayContaining(['helpdesk', 'crm']));
    });

    it('tolerates rewording as long as the content is carried over', () => {
        // Modelin "CX-helpdesk-CRM ürün geçmişi" yerine "CX, helpdesk veya CRM
        // ürünü geliştirmiş olmak" yazması iyileştirmedir, uydurma değil
        const result = verifyNormalization(
            'CX-helpdesk-CRM ürün geçmişi',
            [{ text: 'CX, helpdesk veya CRM ürünü geliştirmiş olmak', must: true }]
        );
        expect(result.ok).toBe(true);
    });

    it('requires most of a proposal to come from the input', () => {
        const half = verifyNormalization('CRM', [{ text: 'CRM ve Salesforce ve Hubspot ve Zendesk', must: true }]);
        expect(half.ok).toBe(false);
        expect(MIN_OVERLAP).toBeGreaterThan(0.5);
    });

    it('handles empty and malformed input', () => {
        expect(verifyNormalization('', []).ok).toBe(true);
        expect(verifyNormalization('CRM', null).dropped).toEqual(['crm']);
        expect(verifyNormalization('CRM', [{}]).ok).toBe(false);
    });
});

describe('priorityInText', () => {
    it('finds the contradiction that made the model go soft', () => {
        // Canlı örnek: metin "(tercih sebebi)" diyor, işaret ZORUNLU diyor.
        // Model metni okuyor ve metne inanıyor.
        const found = priorityInText([{ text: COMPOUND, must: true }]);
        expect(found).toHaveLength(1);
        expect(found[0].phrase).toBe('tercih sebebi');
        expect(found[0].must).toBe(true);
    });

    it('flags priority words regardless of the flag — the text should never carry them', () => {
        const found = priorityInText([
            { text: 'B2B SaaS geçmişi tercihen', must: false },
            { text: 'SQL bilgisi zorunlu', must: true },
            { text: 'Funnel sahipliği', must: true },
        ]);
        expect(found.map((f) => f.index)).toEqual([1, 2]);
    });

    it('survives the Turkish casing trap', () => {
        expect(priorityInText([{ text: 'Şart: SQL', must: true }])).toHaveLength(1);
        expect(priorityInText([{ text: 'TERCİHEN B2B', must: false }])).toHaveLength(1);
    });

    it('returns nothing for clean items', () => {
        expect(priorityInText([{ text: 'Funnel sahipliği', must: true }])).toEqual([]);
        expect(priorityInText(null)).toEqual([]);
    });
});

describe('normalizationDiff', () => {
    it('reports how many items the split produced', () => {
        const d = normalizationDiff(
            [{ text: COMPOUND, must: true }],
            [
                { text: 'PLG / self-servis akış', must: true },
                { text: 'Fiyatlandırma paketleme', must: true },
                { text: 'CX helpdesk CRM ürün geçmişi', must: false },
            ]
        );
        expect(d.before).toBe(1);
        expect(d.after).toBe(3);
        expect(d.split).toBe(2);
        expect(d.added).toHaveLength(3);
        expect(d.removed).toHaveLength(1);
    });

    it('leaves untouched items out of the diff', () => {
        const same = [{ text: 'Funnel sahipliği', must: true }];
        const d = normalizationDiff(same, same);
        expect(d.added).toEqual([]);
        expect(d.removed).toEqual([]);
        expect(d.unchanged).toEqual(['Funnel sahipliği']);
    });

    it('accepts plain strings for the before side', () => {
        const d = normalizationDiff(['Funnel sahipliği'], [{ text: 'Funnel sahipliği', must: true }]);
        expect(d.unchanged).toHaveLength(1);
    });

    it('handles empty sides', () => {
        expect(normalizationDiff(null, null)).toMatchObject({ before: 0, after: 0, split: 0 });
    });
});
