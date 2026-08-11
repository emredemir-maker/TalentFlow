// Geçici hatalarda yeniden deneme.
//
// Canlıda ölçüldü: 70 adaylık yeniden taramada 3 aday "AI isteği başarısız:
// 502" ile düştü. 502'yi Gemini değil, önündeki ağ geçidi üretiyor — backend'in
// kendi döngüsü devreye giremiyor çünkü istek oraya hiç ulaşmıyor.
//
// Testler iki şeyi sabitliyor: geçici olanlar tekrar deneniyor, KALICI olanlar
// denenmiyor. İkincisi önemli: 401'i üç kez denemek kullanıcıyı bekletir ve
// hiçbir şeyi düzeltmez.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { fetchWithRetry, RETRYABLE_STATUS, MAX_ATTEMPTS } from './retry';

const ok = () => ({ ok: true, status: 200 });
const fail = (status) => ({ ok: false, status });

beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch');
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

/**
 * Sahte zamanlayıcıyla beklemeleri atlayarak çağrıyı bitirir.
 *
 * Reddetme ÖNCE yakalanır: zamanlayıcılar ilerletilirken söz reddedilirse
 * bir an için sahipsiz kalıyor ve vitest bunu "unhandled error" sayıyor.
 */
async function run(promise) {
    const settled = promise.then((value) => ({ value }), (error) => ({ error }));
    await vi.runAllTimersAsync();
    const out = await settled;
    if ('error' in out) throw out.error;
    return out.value;
}

describe('fetchWithRetry', () => {
    it('returns immediately on success without retrying', async () => {
        globalThis.fetch.mockResolvedValue(ok());
        const res = await run(fetchWithRetry('/api/ai/generate', {}));
        expect(res.status).toBe(200);
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('retries a 502 and succeeds — the exact live failure', async () => {
        globalThis.fetch
            .mockResolvedValueOnce(fail(502))
            .mockResolvedValueOnce(ok());
        const res = await run(fetchWithRetry('/api/ai/generate', {}));
        expect(res.ok).toBe(true);
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('retries every gateway-level status', async () => {
        for (const status of [408, 429, 500, 502, 503, 504]) {
            globalThis.fetch.mockReset();
            globalThis.fetch.mockResolvedValueOnce(fail(status)).mockResolvedValueOnce(ok());
            await run(fetchWithRetry('/x', {}));
            expect(globalThis.fetch, `durum ${status}`).toHaveBeenCalledTimes(2);
        }
    });

    it('does NOT retry a permanent error', async () => {
        // 401 yetki, 400 hatalı istek: üç kez denemek kullanıcıyı bekletir
        // ve hiçbir şeyi düzeltmez
        for (const status of [400, 401, 403, 404, 422]) {
            globalThis.fetch.mockReset();
            globalThis.fetch.mockResolvedValue(fail(status));
            const res = await run(fetchWithRetry('/x', {}));
            expect(res.status).toBe(status);
            expect(globalThis.fetch, `durum ${status}`).toHaveBeenCalledTimes(1);
        }
    });

    it('retries a network-level failure that has no status', async () => {
        globalThis.fetch
            .mockRejectedValueOnce(new Error('Failed to fetch'))
            .mockResolvedValueOnce(ok());
        const res = await run(fetchWithRetry('/x', {}));
        expect(res.ok).toBe(true);
    });

    it('gives up after the cap and returns the last response', async () => {
        // Yanıtı fırlatmıyoruz: çağıran taraf gövdedeki gerçek hata mesajını
        // okuyabilsin
        globalThis.fetch.mockResolvedValue(fail(502));
        const res = await run(fetchWithRetry('/x', {}));
        expect(res.status).toBe(502);
        expect(globalThis.fetch).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    });

    it('throws when every attempt failed at the network level', async () => {
        globalThis.fetch.mockRejectedValue(new Error('Failed to fetch'));
        await expect(run(fetchWithRetry('/x', {}))).rejects.toThrow('Failed to fetch');
        expect(globalThis.fetch).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    });

    it('reports each retry so the caller can log it', async () => {
        const seen = [];
        globalThis.fetch.mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(ok());
        await run(fetchWithRetry('/x', {}, { onRetry: (i) => seen.push(i.reason) }));
        expect(seen).toEqual(['503']);
    });

    it('honours a custom attempt count', async () => {
        globalThis.fetch.mockResolvedValue(fail(502));
        await run(fetchWithRetry('/x', {}, { attempts: 2 }));
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
});

describe('RETRYABLE_STATUS', () => {
    it('covers gateway errors but not client errors', () => {
        expect(RETRYABLE_STATUS.has(502)).toBe(true);
        expect(RETRYABLE_STATUS.has(504)).toBe(true);
        expect(RETRYABLE_STATUS.has(401)).toBe(false);
        expect(RETRYABLE_STATUS.has(400)).toBe(false);
    });
});
