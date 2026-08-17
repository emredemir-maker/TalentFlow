// TARAMA SÜRÜCÜSÜ — hız, dayanıklılık ve durdurma.
//
// En önemli iki test: tek satırın hatası taramayı DURDURMUYOR (bir 502 yüzünden
// 59 satır taranmadan kalmasın) ve çağrılar arasında sunucunun dakikalık
// limitini aşmayacak bir aralık bırakılıyor (aksi hâlde satırlar 429 alıp
// "model bulamadı" gibi görünür).
import { describe, expect, it, vi } from 'vitest';

import { scanRows, estimateMs, MIN_INTERVAL_MS, CALLS_PER_MINUTE } from './salaryScan';

const rows = (n) => Array.from({ length: n }, (_, i) => ({ sessionId: `s${i}`, transcript: 'metin' }));

/** Test saatini ve uykusunu kendimiz sürüyoruz — gerçek beklemeye gerek yok. */
function fakeClock() {
    let t = 0;
    return {
        now: () => t,
        sleep: async (ms) => { t += ms; },
        advance: (ms) => { t += ms; },
        get time() { return t; },
    };
}

describe('scanRows', () => {
    it('reports found / none separately — not finding a number is not an error', async () => {
        const clock = fakeClock();
        const extract = vi.fn()
            .mockResolvedValueOnce({ min: 95000, quote: 'net 95 bin' })
            .mockResolvedValueOnce(null);

        const seen = [];
        const result = await scanRows(rows(2), {
            extract, now: clock.now, sleep: clock.sleep,
            onResult: (row, r) => seen.push([row.sessionId, r.status]),
        });

        expect(result).toMatchObject({ done: 2, found: 1, none: 1, failed: 0, stopped: false });
        expect(seen).toEqual([['s0', 'found'], ['s1', 'none']]);
    });

    // Tek bir 502 yüzünden kalan satırları taramadan bırakmak, kullanıcıyı
    // en baştan başlatır.
    it('keeps going after a failed row', async () => {
        const clock = fakeClock();
        const extract = vi.fn()
            .mockRejectedValueOnce(new Error('AI isteği başarısız: 502'))
            .mockResolvedValueOnce({ min: 80000, quote: '80 bin' });

        const results = [];
        const result = await scanRows(rows(2), {
            extract, now: clock.now, sleep: clock.sleep, onResult: (_row, r) => results.push(r),
        });

        expect(result).toMatchObject({ done: 2, found: 1, failed: 1 });
        expect(results[0]).toMatchObject({ status: 'error', error: 'AI isteği başarısız: 502' });
    });

    // Sunucu dakikada 20 istek geçiriyor; aralıksız sürmek 429 duvarı demek.
    it('paces calls so the per-minute limit is not blown', async () => {
        const clock = fakeClock();
        // Her çağrı 1 sn sürsün — aradaki bekleme buna göre kısalmalı.
        const extract = vi.fn(async () => { clock.advance(1000); return null; });

        await scanRows(rows(3), { extract, now: clock.now, sleep: clock.sleep });

        // İki aralık × MIN_INTERVAL + son çağrının süresi.
        expect(clock.time).toBe(2 * MIN_INTERVAL_MS + 1000);
        expect(MIN_INTERVAL_MS * CALLS_PER_MINUTE).toBeGreaterThanOrEqual(60000);
    });

    it('stops between rows when asked, leaving the rest untouched', async () => {
        const clock = fakeClock();
        const extract = vi.fn(async () => null);
        let stop = false;

        const result = await scanRows(rows(5), {
            extract, now: clock.now, sleep: clock.sleep,
            shouldStop: () => stop,
            onResult: () => { stop = true; },   // ilk satırdan sonra "dur"
        });

        expect(result).toMatchObject({ done: 1, stopped: true });
        expect(extract).toHaveBeenCalledTimes(1);
    });

    // "Dur" dendikten sonra ekranı bir aralık boyunca daha meşgul tutmanın
    // karşılığı yok.
    it('does not wait out the pacing interval after a stop', async () => {
        const clock = fakeClock();
        let stop = false;
        const extract = vi.fn(async () => { clock.advance(1000); return null; });

        await scanRows(rows(3), {
            extract, now: clock.now, sleep: clock.sleep,
            shouldStop: () => stop,
            onResult: () => { stop = true; },
        });

        expect(clock.time).toBe(1000);
    });

    it('handles an empty list', async () => {
        const result = await scanRows([], { extract: vi.fn() });
        expect(result).toMatchObject({ done: 0, stopped: false });
    });
});

describe('estimateMs', () => {
    it('gives an honest wall-clock estimate', () => {
        expect(estimateMs(0)).toBe(0);
        expect(estimateMs(1)).toBe(MIN_INTERVAL_MS);
        expect(estimateMs(60)).toBe(60 * MIN_INTERVAL_MS);
    });
});
