// Metindeki açıklanabilir terimlerin bulunması.
//
// Bu katman KASITLI olarak AI'sız: modele "bu metinde hangi terimler var"
// diye sormak aynı metinde her açılışta farklı kelimeleri işaretlerdi.
// Terimler deterministik bulunur, AI yalnızca bulunan terimi açıklar.
import { describe, expect, it } from 'vitest';

import { spotTerms, splitByTerms } from './termSpotting';

const terms = (text) => spotTerms(text).map((s) => s.term);

describe('spotTerms', () => {
    it('finds abbreviations the reader is likely to not know', () => {
        const found = terms("PLG akışında CAC'ı %20 düşürdü, NPS 45'e çıktı");
        expect(found).toEqual(expect.arrayContaining(['PLG', 'CAC', 'NPS']));
    });

    it('finds multi-word domain terms from the skill vocabulary', () => {
        const found = terms('Uçtan uca funnel sahipliği ve müşteri deneyimi yönetimi');
        expect(found).toEqual(expect.arrayContaining(['funnel sahipliği']));
    });

    it('prefers the longest match so a short one cannot split it', () => {
        // "müşteri deneyimi" içinde "deneyim" de geçiyor; bölünmemeli
        const found = terms('müşteri deneyimi tarafında çalıştı');
        expect(found).toContain('müşteri deneyimi');
        expect(found).not.toContain('deneyim');
    });

    it('keeps the spelling as written, not the dictionary form', () => {
        // Gösterimde kullanıcının gördüğü kelime durmalı
        const [first] = spotTerms('CRM ürünü geliştirdi');
        expect(first.term).toBe('CRM');
    });

    it('respects word boundaries', () => {
        expect(terms('scrmble kelimesi')).not.toContain('crm');
    });

    it('tolerates Turkish suffixes on a term', () => {
        const found = terms("CRM'de ve GA4'te çalıştı");
        expect(found).toEqual(expect.arrayContaining(['CRM', 'GA4']));
    });

    it('ignores words that only look like abbreviations', () => {
        // Türkçe büyük harfli bağlaçlar ve bizim kendi jargonumuz terim değil
        const found = terms('VE İLE BİR arasında CV ve STAR değerlendirmesi');
        expect(found).not.toContain('VE');
        expect(found).not.toContain('CV');
        expect(found).not.toContain('STAR');
    });

    it('reports positions so the text can be rendered around them', () => {
        const [spot] = spotTerms('Önce PLG kurdu');
        expect('Önce PLG kurdu'.slice(spot.start, spot.end)).toBe('PLG');
    });

    it('caps the number of terms so a paragraph does not become a link farm', () => {
        const many = 'PLG CAC NPS ARR MRR LTV CTR CPA ROAS GMV'.repeat(3);
        expect(spotTerms(many).length).toBeLessThanOrEqual(8);
        expect(spotTerms(many, { limit: 3 })).toHaveLength(3);
    });

    it('handles empty and malformed input', () => {
        expect(spotTerms('')).toEqual([]);
        expect(spotTerms('   ')).toEqual([]);
        expect(spotTerms(null)).toEqual([]);
        expect(spotTerms(undefined)).toEqual([]);
    });

    it('returns nothing for plain prose with no jargon', () => {
        expect(terms('Ekip içinde iyi iletişim kurduğu yazıyor')).toEqual([]);
    });
});

describe('splitByTerms', () => {
    it('splits into plain and term pieces that rebuild the original', () => {
        const text = "PLG akışında CAC'ı düşürdü";
        const parts = splitByTerms(text);
        expect(parts.map((p) => p.text).join('')).toBe(text);
        expect(parts.filter((p) => p.term).map((p) => p.term)).toEqual(['PLG', 'CAC']);
    });

    it('returns a single plain piece when there is no term', () => {
        expect(splitByTerms('düz bir cümle')).toEqual([{ text: 'düz bir cümle', term: null }]);
    });

    it('returns nothing for empty text', () => {
        expect(splitByTerms('')).toEqual([]);
        expect(splitByTerms(null)).toEqual([]);
    });

    it('never loses or duplicates characters', () => {
        const text = "GA4 ve NPS ölçümlerini kurdu; CRM tarafında da çalıştı.";
        expect(splitByTerms(text).map((p) => p.text).join('')).toBe(text);
    });
});
