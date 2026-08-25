import { describe, it, expect } from 'vitest';
import { kwScoreCandidate, kwScorePosition, kwScorePage, aranabilirMetin } from './globalSearchScore';

describe('genel arama puanlaması', () => {
    it('SAYI OLAN DENEYİM ARTIK ÇÖKERTMİYOR — canlıda yaşanan hata', () => {
        // TypeError: (a.experience || "").toLowerCase is not a function
        // Arama kutusuna yazılan ilk harfte Header düşüyor, ekran beyaz kalıyordu.
        expect(() => kwScoreCandidate({ name: 'Ayşe', experience: 5 }, ['a'])).not.toThrow();
    });

    it('deneyim yılı sayıyla da aranabiliyor', () => {
        expect(kwScoreCandidate({ experience: 5 }, ['5'])).toBe(1);
        expect(kwScoreCandidate({ experience: '5' }, ['5'])).toBe(1);
    });

    it('bozuk tipli her alan sessizce eşleşmiyor, çökmüyor', () => {
        const bozuk = {
            name: { ad: 'Ayşe' },
            position: 42,
            skills: 'React, SQL',
            summary: ['a', 'b'],
            email: null,
            department: undefined,
            experience: { yil: 3 },
        };
        expect(() => kwScoreCandidate(bozuk, ['react'])).not.toThrow();
        // skills metin gelse bile normalizeSkills diziye çeviriyor.
        expect(kwScoreCandidate(bozuk, ['react'])).toBe(4);
    });

    it('AĞIRLIKLAR DEĞİŞMEDİ — ad 5, beceri 4, pozisyon 3, özet 2, e-posta 2, birim 1', () => {
        const aday = {
            name: 'React Uzmanı',
            position: 'React Developer',
            skills: ['React'],
            summary: 'react ile çalıştı',
            email: 'react@ornek.com',
            department: 'React Ekibi',
            experience: 3,
        };
        expect(kwScoreCandidate(aday, ['react'])).toBe(5 + 3 + 4 + 2 + 2 + 1);
    });

    it('eşleşmeyen kelime sıfır veriyor', () => {
        expect(kwScoreCandidate({ name: 'Ayşe', experience: 5 }, ['golang'])).toBe(0);
    });

    it('ilan ve sayfa puanları da bozuk tiple çökmüyor', () => {
        expect(() => kwScorePosition({ title: 12, department: {}, description: [] }, ['a'])).not.toThrow();
        expect(kwScorePosition({ title: 'Frontend', department: 'Teknoloji', description: 'react' }, ['react'])).toBe(1);
        expect(kwScorePage({ label: 'Adaylar', desc: 'Aday listesi' }, ['aday'])).toBe(7);
    });

    it('aranabilirMetin nesneyi eşleştirmiyor', () => {
        expect(aranabilirMetin({ a: 1 })).toBe('');
        expect(aranabilirMetin(['a'])).toBe('');
        expect(aranabilirMetin(null)).toBe('');
        expect(aranabilirMetin(7)).toBe('7');
        expect(aranabilirMetin('Ayşe')).toBe('ayşe');
    });
});
