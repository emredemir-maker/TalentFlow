// Anında önyargı uyarısı — AI çağrısı yok, mülakatçı cümlesi düştüğü an.
import { describe, expect, it } from 'vitest';
import { detectBiasKeywords, findLatestBiasHit } from './biasKeywords.js';

describe('detectBiasKeywords', () => {
    it.each([
        ['Kaç yaşındasınız?', 'yaş'],
        ['Evli misin, çocuğun var mı?', 'medeni hâl'],
        ['Yakında çocuk düşünüyor musunuz?', 'aile planı'],
        ['Aslen nerelisiniz?', 'etnik köken'],
        ['Namaz kılıyor musunuz?', 'din'],
        ['Askerliğinizi yaptınız mı?', 'askerlik'],
        ['Askerlik durumunuz nedir?', 'askerlik'],
        ['Kronik hastalığınız var mı?', 'sağlık / engellilik'],
    ])('flags "%s" as %s', (text, topic) => {
        const hit = detectBiasKeywords(text);
        expect(hit).not.toBeNull();
        expect(hit.topics).toContain(topic);
        expect(hit.detail).toMatch(/işe alım kararında kullanılamaz/);
    });

    it.each([
        'Bu projede hangi metrikleri takip ettiniz?',
        'Ekibinizle bir çatışmayı nasıl çözdünüz?',
        'Kaç yıllık deneyiminiz var?',
        'Yeni bir dili ne kadar sürede öğrenirsiniz?',
        '',
    ])('stays quiet on a normal question: "%s"', (text) => {
        expect(detectBiasKeywords(text)).toBeNull();
    });

    it('handles Turkish uppercase (İ/I) the same way', () => {
        expect(detectBiasKeywords('NERELİSİNİZ?')).not.toBeNull();
    });
});

describe('findLatestBiasHit', () => {
    it('only scans recruiter lines, never the candidate', () => {
        const t = [{ role: 'ADAY', text: 'Evli misin diye sordular bir keresinde', time: '1' }];
        expect(findLatestBiasHit(t)).toBeNull();
    });

    it('returns the most recent flagged recruiter line with a stable key', () => {
        const t = [
            { role: 'YÖNETİCİ', text: 'Kaç yaşındasınız?', time: '10:00' },
            { role: 'ADAY', text: 'Otuz.', time: '10:01' },
            { role: 'YÖNETİCİ', text: 'Evli misiniz?', time: '10:02' },
            { role: 'YÖNETİCİ', text: 'Peki son projeniz?', time: '10:03' },
        ];
        const hit = findLatestBiasHit(t);
        expect(hit.key).toBe('10:02|Evli misiniz?');
        expect(hit.topics).toEqual(['medeni hâl']);
    });
});
