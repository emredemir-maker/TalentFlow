import { describe, it, expect } from 'vitest';
import {
    normalizeCalendarEvent,
    matchCandidate,
    eventMinutes,
    sessionForEvent,
    looksLikeInterview,
    buildSessionFromEvent,
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

describe('mülakat ihtimali olan etkinlikler', () => {
    const ev = (title, description = '') => normalizeCalendarEvent({
        id: 'e', summary: title, description, start: { dateTime: '2026-09-05T10:00:00Z' },
    });

    it('İK ve mülakat ifadeleri yakalanıyor', () => {
        for (const t of [
            'Kerem ile mülakat',
            'İK Görüşmesi — Ayşe',
            'Teknik görüşme',
            'Ön görüşme',
            'Aday görüşmesi',
            'Interview with Kerem',
            'HR interview',
            'İşe alım toplantısı',
        ]) {
            expect(looksLikeInterview(ev(t))).toBe(true);
        }
    });

    it('açıklamadaki ifade de sayılıyor', () => {
        expect(looksLikeInterview(ev('Toplantı', 'Aday: Kerem — mülakat'))).toBe(true);
    });

    it('"GÖRÜŞME" TEK BAŞINA MÜLAKAT SAYILMIYOR', () => {
        // Türkçede her toplantı "görüşme"; tek başına eşleştirmek takvimin
        // yarısını mülakat gibi işaretlerdi.
        expect(looksLikeInterview(ev('Müşteri görüşmesi'))).toBe(false);
        expect(looksLikeInterview(ev('Tedarikçi görüşmesi'))).toBe(false);
        expect(looksLikeInterview(ev('Sprint planlama'))).toBe(false);
        expect(looksLikeInterview(ev('Diş hekimi'))).toBe(false);
    });

    it('boş etkinlikte çökmüyor', () => {
        expect(looksLikeInterview(null)).toBe(false);
        expect(looksLikeInterview({})).toBe(false);
    });
});

describe('takvim kaydından mülakat oturumu', () => {
    const event = normalizeCalendarEvent({
        id: 'evt-9',
        summary: 'İK Görüşmesi — Kerem',
        location: 'https://teams.microsoft.com/l/x',
        start: { dateTime: '2026-09-05T14:30:00+03:00' },
        end: { dateTime: '2026-09-05T15:30:00+03:00' },
    });
    const aday = { id: 'c1', name: 'Kerem Can Demirtaş', position: 'Growth PM', positionId: 'p1' };

    it('etkinlikten planlı bir oturum kuruyor', () => {
        const s = buildSessionFromEvent(event, aday, { interviewerName: 'Emre', interviewerId: 'u1' });
        expect(s.status).toBe('scheduled');
        expect(s.calendarEventId).toBe('evt-9');
        expect(s.candidateId).toBe('c1');
        expect(s.candidateName).toBe('Kerem Can Demirtaş');
        expect(s.positionTitle).toBe('Growth PM');
        expect(s.title).toBe('İK Görüşmesi — Kerem');
        expect(s.meetLink).toContain('teams.microsoft.com');
        expect(s.interviewer).toBe('Emre');
    });

    it('AYNI ETKİNLİK İKİ KEZ İŞARETLENİRSE İKİNCİ KAYIT OLUŞMUYOR', () => {
        // Kimlik etkinlikten türüyor; `sessionForEvent` de bunu buluyor.
        const a = buildSessionFromEvent(event, aday);
        const b = buildSessionFromEvent(event, aday);
        expect(a.id).toBe(b.id);
        expect(sessionForEvent(event, { interviewSessions: [a] })).not.toBeNull();
    });

    it('tarih ve saat yerel güne göre', () => {
        const s = buildSessionFromEvent(event, aday);
        expect(s.date).toBe('2026-09-05');
        expect(s.time).toMatch(/^\d{2}:\d{2}$/);
    });

    it('TÜM GÜN ETKİNLİĞİNE SAAT UYDURULMUYOR', () => {
        const tumGun = normalizeCalendarEvent({ id: 'e2', summary: 'İzin', start: { date: '2026-09-05' } });
        expect(buildSessionFromEvent(tumGun, aday).time).toBe('');
    });

    it('KANAL VARSAYILMIYOR — takvimde Meet yazsa bile Teams olabilir', () => {
        expect(buildSessionFromEvent(event, aday).type).toBe('other');
    });

    it('eksik girdide null', () => {
        expect(buildSessionFromEvent(null, aday)).toBeNull();
        expect(buildSessionFromEvent(event, null)).toBeNull();
        expect(buildSessionFromEvent({ id: 'x' }, aday)).toBeNull();
    });
});
