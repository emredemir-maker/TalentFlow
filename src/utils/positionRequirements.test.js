// Pozisyon gereksinim girdisinin ayrıştırılması.
//
// Kritik hata: eski kod yalnızca virgülle bölüyordu ve gerçek ilan maddeleri
// madde İÇİNDE virgül taşıyor. "3-5 yıl ürün yönetimi deneyimi, en az 1-2
// yılı growth odaklı" tek bir gereksinimdir; ikiye bölününce hem skorlama
// hem de AI'a giden ilan metni bozuluyordu.
import { describe, expect, it } from 'vitest';

import { parseRequirementsInput, formatRequirementsInput } from './positionRequirements';

describe('parseRequirementsInput', () => {
    it('splits on lines and keeps commas inside a requirement', () => {
        const input = [
            '3-5 yıl ürün yönetimi deneyimi, en az 1-2 yılı growth/funnel odaklı',
            'Funnel sahipliği: kayıt, aktivasyon, elde tutma, gelir',
            'A/B test ve deney kurma deneyimi',
        ].join('\n');
        expect(parseRequirementsInput(input)).toEqual([
            '3-5 yıl ürün yönetimi deneyimi, en az 1-2 yılı growth/funnel odaklı',
            'Funnel sahipliği: kayıt, aktivasyon, elde tutma, gelir',
            'A/B test ve deney kurma deneyimi',
        ]);
    });

    it('falls back to comma splitting for legacy single-line input', () => {
        expect(parseRequirementsInput('React, TypeScript, SQL')).toEqual(['React', 'TypeScript', 'SQL']);
    });

    it('strips bullet markers and numbering', () => {
        expect(parseRequirementsInput('- Funnel sahipliği\n• A/B test\n* PLG\n1. SQL')).toEqual([
            'Funnel sahipliği', 'A/B test', 'PLG', 'SQL',
        ]);
    });

    it('drops blank lines and trims whitespace', () => {
        expect(parseRequirementsInput('  Growth  \n\n\n   \n  PLG ')).toEqual(['Growth', 'PLG']);
    });

    it('handles empty and non-string input', () => {
        expect(parseRequirementsInput('')).toEqual([]);
        expect(parseRequirementsInput('   ')).toEqual([]);
        expect(parseRequirementsInput(null)).toEqual([]);
        expect(parseRequirementsInput(undefined)).toEqual([]);
    });

    it('caps the list so a pasted document cannot explode the position doc', () => {
        const many = Array.from({ length: 50 }, (_, i) => `Gereksinim ${i}`).join('\n');
        expect(parseRequirementsInput(many)).toHaveLength(30);
    });

    it('handles CRLF line endings (Windows kopyala-yapıştır)', () => {
        expect(parseRequirementsInput('Growth\r\nPLG')).toEqual(['Growth', 'PLG']);
    });
});

describe('formatRequirementsInput', () => {
    it('renders one requirement per line for editing', () => {
        expect(formatRequirementsInput(['Growth', 'PLG'])).toBe('Growth\nPLG');
    });

    it('round-trips through parse without corrupting inner commas', () => {
        const reqs = ['3-5 yıl deneyim, growth odaklı', 'A/B test'];
        expect(parseRequirementsInput(formatRequirementsInput(reqs))).toEqual(reqs);
    });

    it('tolerates missing or non-array values', () => {
        expect(formatRequirementsInput(null)).toBe('');
        expect(formatRequirementsInput(undefined)).toBe('');
        expect(formatRequirementsInput('Growth')).toBe('Growth');
    });
});
