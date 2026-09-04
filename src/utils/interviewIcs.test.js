import { describe, it, expect } from 'vitest';
import { buildInterviewIcs, icsDosyaAdi } from './interviewIcs';

const OTURUM = {
    id: 'iv-123',
    title: 'Teknik Mülakat',
    date: '2026-09-12',
    time: '14:30',
    candidateName: 'Kaan Yenidağ',
    positionTitle: 'Frontend Developer',
    meetLink: 'https://zoom.us/j/999',
};

describe('görüşme takvim dosyası', () => {
    it('geçerli bir VEVENT üretiyor', () => {
        const ics = buildInterviewIcs(OTURUM, { organizer: { name: 'İK', email: 'ik@ornek.com' } });
        expect(ics).toContain('BEGIN:VCALENDAR');
        expect(ics).toContain('BEGIN:VEVENT');
        expect(ics).toContain('DTSTART:20260912T143000');
        expect(ics).toContain('END:VCALENDAR');
    });

    it('aday, pozisyon ve görüşme linki dosyada', () => {
        const ics = buildInterviewIcs(OTURUM);
        expect(ics).toContain('Kaan Yenidağ');
        expect(ics).toContain('Frontend Developer');
        expect(ics).toContain('https://zoom.us/j/999');
    });

    it('GÖRÜŞME NEREDE YAPILIRSA YAPILSIN SAAT BLOKE EDİLİYOR', () => {
        // Zoom, Teams ya da yüz yüze — takvimin dolu görünmesi buna bağlı değil.
        const disarida = { ...OTURUM, meetLink: 'https://teams.microsoft.com/l/x' };
        expect(buildInterviewIcs(disarida)).toContain('DTSTART:20260912T143000');
        const linksiz = { ...OTURUM, meetLink: '' };
        expect(buildInterviewIcs(linksiz)).toContain('DTSTART:20260912T143000');
    });

    it('AYNI OTURUM İKİNCİ KEZ EKLENİRSE ÇİFT ETKİNLİK OLMUYOR', () => {
        // Takvim uygulamaları aynı UID'yi güncelleme olarak işler.
        const a = buildInterviewIcs(OTURUM);
        const b = buildInterviewIcs({ ...OTURUM, time: '15:30' });
        expect(a).toContain('UID:iv-123-organizer@talentflow');
        expect(b).toContain('UID:iv-123-organizer@talentflow');
    });

    it('TARİH YA DA SAAT YOKSA DOSYA ÜRETİLMİYOR', () => {
        // Varsayılan bir saat uydurmak takvime yanlış saatte blok koyardı.
        expect(buildInterviewIcs({ ...OTURUM, time: '' })).toBeNull();
        expect(buildInterviewIcs({ ...OTURUM, date: '' })).toBeNull();
        expect(buildInterviewIcs(null)).toBeNull();
    });

    it('dosya adı Türkçe karakter ve boşluk taşımıyor', () => {
        expect(icsDosyaAdi(OTURUM, 'Kaan Yenidağ')).toBe('mulakat-kaan-yenidag-2026-09-12.ics');
        expect(icsDosyaAdi({}, '')).toBe('mulakat.ics');
    });
});
