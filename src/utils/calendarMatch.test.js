import { describe, it, expect } from 'vitest';
import {
    normalizeCalendarEvent,
    matchCandidate,
    eventMinutes,
    sessionForEvent,
    MATCH_SOURCE,
} from './calendarMatch';

const HAM = {
    id: 'evt-1',
    summary: 'Kerem Can Demirtaş — Growth Ürün Yöneticisi',
    description: 'Aday: Kerem Can Demirtaş\nPozisyon: Growth Ürün Yöneticisi',
    location: 'https://teams.microsoft.com/l/x',
    htmlLink: 'https://calendar.google.com/event?eid=1',
    start: { dateTime: '2026-09-05T14:00:00+03:00' },
    end: { dateTime: '2026-09-05T15:00:00+03:00' },
    attendees: [{ email: 'IK@ornek.com' }, { email: 'Kerem@ornek.com' }],
    organizer: { email: 'ik@ornek.com' },
};

const ADAY = { id: 'c1', name: 'Kerem Can Demirtaş', email: 'kerem@ornek.com' };
const BASKA = { id: 'c2', name: 'Ayşe Yılmaz', email: 'ayse@ornek.com' };

describe('takvim etkinliğinin sadeleştirilmesi', () => {
    it('saatli etkinliği okuyor', () => {
        const e = normalizeCalendarEvent(HAM);
        expect(e.id).toBe('evt-1');
        expect(e.allDay).toBe(false);
        expect(e.attendees).toEqual(['ik@ornek.com', 'kerem@ornek.com']);
        expect(e.location).toContain('teams.microsoft.com');
    });

    it('TÜM GÜN SÜREN ETKİNLİK ÇÖKERTMİYOR', () => {
        // `start.dateTime` yok, `start.date` var — ikisini karıştırmak
        // "Invalid Date" üretiyor ve satır boş görünüyordu.
        const e = normalizeCalendarEvent({ id: 'x', summary: 'İzin', start: { date: '2026-09-05' }, end: { date: '2026-09-06' } });
        expect(e.allDay).toBe(true);
        expect(Number.isNaN(e.start.getTime())).toBe(false);
    });

    it('başlangıcı olmayan ya da bozuk kayıt düşürülüyor', () => {
        expect(normalizeCalendarEvent({ id: 'x' })).toBeNull();
        expect(normalizeCalendarEvent({ id: 'x', start: { dateTime: 'bozuk' } })).toBeNull();
        expect(normalizeCalendarEvent(null)).toBeNull();
    });

    it('başlıksız etkinliğe okunabilir bir ad veriliyor', () => {
        expect(normalizeCalendarEvent({ id: 'x', start: { dateTime: '2026-09-05T10:00:00Z' } }).title)
            .toBe('Başlıksız etkinlik');
    });

    it('süre dakika olarak çıkıyor', () => {
        expect(eventMinutes(normalizeCalendarEvent(HAM))).toBe(60);
        expect(eventMinutes({ start: new Date(), end: null })).toBeNull();
    });
});

describe('adayla eşleştirme', () => {
    const e = normalizeCalendarEvent(HAM);

    it('KATILIMCI E-POSTASI EN GÜVENİLİR SİNYAL', () => {
        const { candidate, source } = matchCandidate(e, [BASKA, ADAY]);
        expect(candidate.id).toBe('c1');
        expect(source).toBe(MATCH_SOURCE.EMAIL);
    });

    it('e-posta büyük/küçük harf farkını yutuyor', () => {
        const { candidate } = matchCandidate(e, [{ ...ADAY, email: 'KEREM@ornek.com' }]);
        expect(candidate.id).toBe('c1');
    });

    it('e-posta yoksa davet açıklamasına bakılıyor', () => {
        const sade = { ...e, attendees: [] };
        const { candidate, source } = matchCandidate(sade, [{ ...ADAY, email: '' }]);
        expect(candidate.id).toBe('c1');
        expect(source).toBe(MATCH_SOURCE.DESCRIPTION);
    });

    it('son çare başlıktaki ad', () => {
        const sade = { ...e, attendees: [], description: '' };
        const { source } = matchCandidate(sade, [{ ...ADAY, email: '' }]);
        expect(source).toBe(MATCH_SOURCE.TITLE);
    });

    it('YALNIZCA İLK AD EŞLEŞMESİ KABUL EDİLMİYOR', () => {
        // Yanlış eşleşmenin bedeli, bir adayın görüşme kaydının başka birinin
        // altına yazılması. Türkiye'de yaygın adlarda bu sürekli olurdu.
        const sade = { ...e, attendees: [], description: '', title: 'Kerem ile görüşme' };
        expect(matchCandidate(sade, [{ ...ADAY, email: '' }]).candidate).toBeNull();
    });

    it('ELLE BAĞLANAN HER TAHMİNİN ÜSTÜNDE', () => {
        const elle = { ...BASKA, calendarEventIds: ['evt-1'] };
        const { candidate, source } = matchCandidate(e, [elle, ADAY]);
        expect(candidate.id).toBe('c2');
        expect(source).toBe(MATCH_SOURCE.MANUAL);
    });

    it('eşleşme yoksa gizlenmiyor, boş dönüyor', () => {
        const sade = { ...e, attendees: [], description: '', title: 'Sprint planlama' };
        expect(matchCandidate(sade, [ADAY])).toEqual({ candidate: null, source: null });
    });

    it('aday listesi boş ya da bozuksa çökmüyor', () => {
        expect(matchCandidate(e, null).candidate).toBeNull();
        expect(matchCandidate(null, [ADAY]).candidate).toBeNull();
    });
});

describe('etkinliğe bağlı görüşme kaydı', () => {
    it('AYNI GÖRÜŞME İKİ KEZ GİRİLMESİN diye kayıt bulunuyor', () => {
        const aday = { interviewSessions: [{ id: 'mi-1', calendarEventId: 'evt-1' }] };
        expect(sessionForEvent({ id: 'evt-1' }, aday).id).toBe('mi-1');
    });

    it('bağlı kayıt yoksa null', () => {
        expect(sessionForEvent({ id: 'evt-1' }, { interviewSessions: [{ id: 'mi-1' }] })).toBeNull();
        expect(sessionForEvent({ id: 'evt-1' }, null)).toBeNull();
    });
});
