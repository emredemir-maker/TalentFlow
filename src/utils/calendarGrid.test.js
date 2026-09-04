import { describe, it, expect } from 'vitest';
import { monthGrid, monthLabel, dayKey, dayKeyOfDateString, bucketByDay, WEEKDAYS } from './calendarGrid';

describe('ay ızgarası', () => {
    it('hafta Pazartesi başlıyor', () => {
        expect(WEEKDAYS[0]).toBe('Pzt');
        expect(WEEKDAYS[6]).toBe('Paz');
    });

    it('IZGARA HER ZAMAN TAM HAFTA — boş kutuyla başlamıyor', () => {
        // Ayın ilk günü Pazar'a denk geldiğinde boş kutu bırakan bir ızgara
        // altı boş hücreyle başlayan bir takvim üretiyordu.
        for (const [y, m] of [[2026, 8], [2026, 1], [2027, 7], [2024, 1]]) {
            const g = monthGrid(y, m);
            expect(g.length % 7).toBe(0);
            expect(g[0].date.getDay()).toBe(1); // Pazartesi
        }
    });

    it('ayın tüm günleri ızgarada ve doğru işaretli', () => {
        const g = monthGrid(2026, 8); // Eylül 2026, 30 gün
        expect(g.filter((c) => c.inMonth)).toHaveLength(30);
        expect(g.find((c) => c.key === '2026-09-01').inMonth).toBe(true);
        expect(g.find((c) => c.key === '2026-08-31').inMonth).toBe(false);
    });

    it('artık yıl şubatı doğru', () => {
        expect(monthGrid(2024, 1).filter((c) => c.inMonth)).toHaveLength(29);
        expect(monthGrid(2026, 1).filter((c) => c.inMonth)).toHaveLength(28);
    });

    it('ay başlığı Türkçe', () => {
        expect(monthLabel(2026, 8)).toContain('2026');
        expect(monthLabel(2026, 8).toLocaleLowerCase('tr')).toContain('eylül');
    });
});

describe('gün anahtarı', () => {
    it('YEREL GÜNE GÖRE — UTC kaydırması yok', () => {
        // `toISOString` gece yarısına yakın saatlerde günü bir gün öne/geriye
        // kaydırıyor ve kayıt yanlış güne düşüyordu.
        const gece = new Date(2026, 8, 5, 23, 30);
        expect(dayKey(gece)).toBe('2026-09-05');
        const sabah = new Date(2026, 8, 5, 0, 30);
        expect(dayKey(sabah)).toBe('2026-09-05');
    });

    it('metin tarihini saat dilimine sokmadan okuyor', () => {
        expect(dayKeyOfDateString('2026-09-05')).toBe('2026-09-05');
        expect(dayKeyOfDateString('2026-09-05T22:00:00.000Z')).toBe('2026-09-05');
    });

    it('bozuk değerde boş dönüyor', () => {
        expect(dayKey('bozuk')).toBe('');
        expect(dayKey(null)).toBe('');
        expect(dayKeyOfDateString('')).toBe('');
    });
});

describe('günlere dağıtım', () => {
    const oturum = { id: 'iv-1', date: '2026-09-05', time: '14:30', candidateName: 'Kerem' };
    const etkinlik = { id: 'evt-1', title: 'Sprint', start: new Date(2026, 8, 5, 10, 0), allDay: false };
    const tumGun = { id: 'evt-2', title: 'İzin', start: new Date(2026, 8, 5, 0, 0), allDay: true };

    it('İKİ KAYNAK BİRLEŞİYOR AMA AYRI KALIYOR', () => {
        // Sistemde kaydı olmayan bir toplantıyı mülakat sanmak, takvimden
        // okunan bir satırı uygulamanın kaydıymış gibi göstermek olurdu.
        const m = bucketByDay([oturum], [etkinlik]);
        const gun = m.get('2026-09-05');
        expect(gun).toHaveLength(2);
        expect(gun.map((x) => x.kind).sort()).toEqual(['event', 'session']);
    });

    it('gün içinde saate göre sıralı', () => {
        const m = bucketByDay([oturum], [etkinlik]);
        expect(m.get('2026-09-05').map((x) => x.time)).toEqual(['10:00', '14:30']);
    });

    it('TÜM GÜN ETKİNLİĞİNE SAAT UYDURULMUYOR — günün başında', () => {
        const m = bucketByDay([oturum], [tumGun, etkinlik]);
        const gun = m.get('2026-09-05');
        expect(gun[0].time).toBe('');
        expect(gun[0].event.id).toBe('evt-2');
    });

    it('tarihi olmayan kayıt düşürülüyor, çökertmiyor', () => {
        const m = bucketByDay([{ id: 'x' }, oturum], [{ id: 'y' }]);
        expect(m.size).toBe(1);
        expect(m.get('2026-09-05')).toHaveLength(1);
    });

    it('boş girdide boş harita', () => {
        expect(bucketByDay().size).toBe(0);
        expect(bucketByDay(null, null).size).toBe(0);
    });
});
