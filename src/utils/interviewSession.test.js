import { describe, it, expect } from 'vitest';
import { isSessionDone, hasCompletedInterview, isSessionPast } from './interviewSession';

describe('mülakat oturumu bitti mi', () => {
    it("durum 'completed' ise bitmiştir", () => {
        expect(isSessionDone({ status: 'completed' })).toBe(true);
    });

    it('canlı oturum skoru olsa bile bitmemiştir', () => {
        expect(isSessionDone({ status: 'live', aiOverallScore: 80 })).toBe(false);
    });

    it('durum geride kalsa da skor/özet varsa bitmiştir', () => {
        expect(isSessionDone({ status: 'scheduled', aiOverallScore: 72 })).toBe(true);
        expect(isSessionDone({ status: 'scheduled', aiSummary: 'özet' })).toBe(true);
        expect(isSessionDone({ status: 'scheduled', finalScore: 65 })).toBe(true);
    });

    it('boş oturum çökertmiyor', () => {
        expect(isSessionDone(null)).toBe(false);
        expect(isSessionDone('metin')).toBe(false);
    });

    it('İPTAL EDİLEN OTURUM ADAYI İLERLETMEZ', () => {
        // isSessionDone bugünkü ekran davranışını koruyor (iptal + skor = bitmiş),
        // ama aday aşaması bu tuhaflığı miras almıyor.
        expect(isSessionDone({ status: 'cancelled', finalScore: 70 })).toBe(true);
        expect(hasCompletedInterview({ interviewSessions: [{ status: 'cancelled', finalScore: 70 }] })).toBe(false);
    });

    it('en az bir tamamlanmış oturum yeter', () => {
        expect(hasCompletedInterview({
            interviewSessions: [{ status: 'scheduled' }, { status: 'completed' }],
        })).toBe(true);
    });

    it('oturum yoksa ya da alan bozuksa false', () => {
        expect(hasCompletedInterview({})).toBe(false);
        expect(hasCompletedInterview({ interviewSessions: 'metin' })).toBe(false);
        expect(hasCompletedInterview(null)).toBe(false);
    });
});

describe('görüşmenin saati geçti mi', () => {
    const now = new Date('2026-09-12T15:00:00');

    it('geçmiş saatteki görüşme geçmiş sayılıyor', () => {
        expect(isSessionPast({ date: '2026-09-12', time: '14:30' }, now)).toBe(true);
        expect(isSessionPast({ date: '2026-09-11', time: '23:00' }, now)).toBe(true);
    });

    it('gelecekteki görüşme geçmiş sayılmıyor', () => {
        expect(isSessionPast({ date: '2026-09-12', time: '16:00' }, now)).toBe(false);
        expect(isSessionPast({ date: '2026-09-13', time: '09:00' }, now)).toBe(false);
    });

    it('SAAT YOKSA GÜN SONUNA KADAR BEKLENİYOR', () => {
        // Saatsiz kaydı öğlen "geçti" saymak, yapılmamış görüşmeyi yapılmış
        // gibi gösterip listedeki birincil düğmeyi yanlış işe çevirirdi.
        expect(isSessionPast({ date: '2026-09-12' }, now)).toBe(false);
        expect(isSessionPast({ date: '2026-09-11' }, now)).toBe(true);
    });

    it('bozuk ya da eksik tarihte çökmüyor', () => {
        expect(isSessionPast({}, now)).toBe(false);
        expect(isSessionPast({ date: 'bozuk' }, now)).toBe(false);
        expect(isSessionPast(null, now)).toBe(false);
    });
});
