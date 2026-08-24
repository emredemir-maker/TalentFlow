import { describe, it, expect } from 'vitest';
import { normalizePosition } from './normalizePosition';
import { calculateMatchScore, detectPositionDomain } from '../services/matchService';

const ADAY = {
    id: 'c1',
    name: 'Aday',
    position: 'Frontend Developer',
    skills: ['React', 'SQL'],
    cvText: 'React ve SQL ile üç yıl deneyim.',
};

describe('normalizePosition', () => {
    it('doğru tipteki kaydı DEĞİŞTİRMEZ — aynı referansı döndürür', () => {
        // Kritik: bugün çalışan hiçbir ilanın verisi değişmemeli.
        const p = {
            id: 'p1',
            title: 'Frontend Developer',
            department: 'Teknoloji',
            status: 'open',
            requirements: ['React', 'TypeScript'],
        };
        expect(normalizePosition(p)).toBe(p);
    });

    it('gereksinim nesne dizisi geldiğinde metne indirger', () => {
        // Gerçek şema `string[]`; zorunlu/tercihen işareti requirementsMeta'da.
        const out = normalizePosition({
            requirements: [{ text: 'React ile 3 yıl', must: true }, 'SQL'],
        });
        expect(out.requirements).toEqual(['React ile 3 yıl · true', 'SQL']);
    });

    it('SKOR HESABI ARTIK ÇÖKMÜYOR — canlıda yaşanan hata', () => {
        // TypeError: K.toLowerCase is not a function
        // Kaynak: matchService → (position.requirements || []).map(r => r.toLowerCase())
        const bozuk = {
            id: 'p1',
            title: 'Frontend Developer',
            status: 'open',
            description: 'React geliştirici',
            requirements: [{ text: 'React', must: true }, { text: 'SQL', must: false }],
        };
        expect(() => calculateMatchScore(ADAY, bozuk)).toThrow();
        expect(() => calculateMatchScore(ADAY, normalizePosition(bozuk))).not.toThrow();
    });

    it('alan tespiti de bozuk gereksinimle çalışır', () => {
        const bozuk = { title: 'Frontend Developer', requirements: [{ text: 'React' }] };
        expect(() => detectPositionDomain(normalizePosition(bozuk))).not.toThrow();
    });

    it('nesne gelen metin alanlarını okunabilir metne çevirir', () => {
        // React "Objects are not valid as a React child" ile ağacı söküyordu.
        const out = normalizePosition({ title: { ad: 'Frontend' }, department: { d: 'Teknoloji' } });
        expect(out.title).toBe('Frontend');
        expect(out.department).toBe('Teknoloji');
    });

    it('ekranda basılan minExperience nesne olamaz', () => {
        expect(typeof normalizePosition({ minExperience: { yil: 3 } }).minExperience).toBe('string');
        expect(normalizePosition({ minExperience: 3 }).minExperience).toBe(3);
    });

    it('dizi olmayan nesne listelerini boşaltır', () => {
        // `pos.matchedCandidates.reduce is not a function`
        expect(normalizePosition({ matchedCandidates: 'metin' }).matchedCandidates).toEqual([]);
    });

    it('null ve undefined OLDUĞU GİBİ kalır', () => {
        const out = normalizePosition({ title: null, department: undefined, status: 'open' });
        expect(out.title).toBeNull();
        expect(out.department).toBeUndefined();
    });

    it('pozisyon olmayan girdide bir şey uydurmaz', () => {
        expect(normalizePosition(null)).toBeNull();
        expect(normalizePosition('metin')).toBe('metin');
    });
});
