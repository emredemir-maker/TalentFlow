import { describe, it, expect } from 'vitest';
import { normalizeCandidate } from './normalizeCandidate';

describe('normalizeCandidate', () => {
    it('doğru tipteki kaydı DEĞİŞTİRMEZ — aynı referansı döndürür', () => {
        // Kritik: bugün çalışan hiçbir adayın verisi değişmemeli. Aynı
        // referans, gereksiz yeniden render'ı da önler.
        const c = {
            id: 'c1', name: 'Ada Lovelace', email: 'ada@x.com', position: 'Analist',
            skills: ['SQL', 'Python'], experiences: [{ company: 'X', duration: '2020' }],
        };
        expect(normalizeCandidate(c)).toBe(c);
    });

    it('metin gelen yetenek alanını diziye çevirir', () => {
        expect(normalizeCandidate({ skills: 'React, TS' }).skills).toEqual(['React', 'TS']);
    });

    it('dizi olmayan deneyim alanını boş diziye indirger', () => {
        // Beyaz ekranın kaynağı: `rawExperiences.filter is not a function`.
        expect(normalizeCandidate({ experiences: 'ODTÜ mezunu' }).experiences).toEqual([]);
        expect(normalizeCandidate({ careerHistory: { a: 1 } }).careerHistory).toEqual([]);
    });

    it('deneyim listesindeki metin öğelerini eler, nesneleri korur', () => {
        const out = normalizeCandidate({ experiences: [{ company: 'X' }, 'bozuk', null] });
        expect(out.experiences).toEqual([{ company: 'X' }]);
    });

    it('sayı gelen metin alanını metne çevirir', () => {
        // `(candidate.position || '').toLowerCase()` sayıda çöküyordu.
        expect(normalizeCandidate({ position: 42 }).position).toBe('42');
        expect(normalizeCandidate({ source: 123 }).source).toBe('123');
    });

    it('nesne gelen metin alanını okunabilir metne çevirir — bilgi silinmez', () => {
        const out = normalizeCandidate({ education: { school: 'ODTÜ', degree: 'Lisans' } });
        expect(out.education).toBe('ODTÜ · Lisans');
    });

    it('null ve undefined OLDUĞU GİBİ kalır', () => {
        // `matchedPositionTitle === null` kodda "eşleşme yok" anlamına
        // geliyor; boş metne çevirmek o mantığı bozardı.
        const out = normalizeCandidate({ matchedPositionTitle: null, position: undefined, name: 'A' });
        expect(out.matchedPositionTitle).toBeNull();
        expect(out.position).toBeUndefined();
    });

    it('aday olmayan girdide bir şey uydurmaz', () => {
        expect(normalizeCandidate(null)).toBeNull();
        expect(normalizeCandidate(undefined)).toBeUndefined();
        expect(normalizeCandidate('metin')).toBe('metin');
    });

    it('nesne gelen CV metnini metne çevirir', () => {
        // `parseCareerFromCvData` içinde `.matchAll` çağrılıyor.
        const out = normalizeCandidate({ cvData: { ozet: 'Yazılım geliştirici', yil: 5 } });
        expect(typeof out.cvData).toBe('string');
        expect(out.cvData).toContain('Yazılım geliştirici');
    });
});
