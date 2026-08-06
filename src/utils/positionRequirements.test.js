// Pozisyon gereksinim girdisinin ayrıştırılması.
//
// Kritik hata: eski kod yalnızca virgülle bölüyordu ve gerçek ilan maddeleri
// madde İÇİNDE virgül taşıyor. "3-5 yıl ürün yönetimi deneyimi, en az 1-2
// yılı growth odaklı" tek bir gereksinimdir; ikiye bölününce hem skorlama
// hem de AI'a giden ilan metni bozuluyordu.
import { describe, expect, it } from 'vitest';

import {
    parseRequirementsInput, formatRequirementsInput,
    parseRequirementGroups, formatRequirementGroups,
    requirementsOf, hasPrioritizedRequirements, buildJobDescription,
} from './positionRequirements';

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


// ─────────────────────────────────────────────────────────────────────────────
// Zorunlu / tercihen ayrımı.
// GERİYE DÖNÜK NÖTRLÜK kuralı: meta yoksa hiçbir madde işaretli sayılmaz ve
// skorlama bugünkü davranışını korur — mevcut ilanların puanları kullanıcı
// açıkça işaretleme yapana kadar değişmemeli.
// ─────────────────────────────────────────────────────────────────────────────
describe('parseRequirementGroups / formatRequirementGroups', () => {
    it('marks the two boxes as must and nice', () => {
        const meta = parseRequirementGroups({
            mustText: '3-5 yıl ürün yönetimi, growth odaklı\nA/B test kurma',
            niceText: 'Tercihen B2B SaaS',
        });
        expect(meta).toEqual([
            { text: '3-5 yıl ürün yönetimi, growth odaklı', must: true },
            { text: 'A/B test kurma', must: true },
            { text: 'Tercihen B2B SaaS', must: false },
        ]);
    });

    it('round-trips back into the two boxes', () => {
        const groups = { mustText: 'A\nB', niceText: 'C' };
        expect(formatRequirementGroups(parseRequirementGroups(groups))).toEqual(groups);
    });

    it('handles empty boxes', () => {
        expect(parseRequirementGroups({})).toEqual([]);
        expect(formatRequirementGroups(null)).toEqual({ mustText: '', niceText: '' });
    });
});

describe('requirementsOf', () => {
    it('reads priorities from requirementsMeta', () => {
        expect(requirementsOf({ requirementsMeta: [{ text: 'A', must: true }, { text: 'B', must: false }] }))
            .toEqual([{ text: 'A', must: true }, { text: 'B', must: false }]);
    });

    it('returns must:null for legacy positions so scoring stays neutral', () => {
        expect(requirementsOf({ requirements: ['A', 'B'] }))
            .toEqual([{ text: 'A', must: null }, { text: 'B', must: null }]);
        expect(hasPrioritizedRequirements({ requirements: ['A'] })).toBe(false);
        expect(hasPrioritizedRequirements({ requirementsMeta: [{ text: 'A', must: true }] })).toBe(true);
    });

    it('tolerates a missing/empty position', () => {
        expect(requirementsOf(null)).toEqual([]);
        expect(requirementsOf({})).toEqual([]);
    });
});

describe('buildJobDescription', () => {
    it('numbers the requirements and labels their priority', () => {
        const text = buildJobDescription({
            title: 'Growth PM',
            requirementsMeta: [{ text: 'Funnel sahipliği', must: true }, { text: 'B2B SaaS', must: false }],
            description: 'Kısa açıklama',
        });
        expect(text).toContain('1. [ZORUNLU] Funnel sahipliği');
        expect(text).toContain('2. [TERCİHEN] B2B SaaS');
        expect(text).toContain('Kısa açıklama');
    });

    it('leaves legacy requirements unlabelled', () => {
        const text = buildJobDescription({ title: 'X', requirements: ['A'] });
        expect(text).toContain('1. A');
        expect(text).not.toContain('ZORUNLU');
    });
});
