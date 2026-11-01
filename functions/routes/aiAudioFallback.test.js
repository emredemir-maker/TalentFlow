// Gemini ses yedeği anahtarı — sunucu tarafı reddi.
//
// Pahalı ses yedeği (3 sn'lik parçalar → saatte ~1.200 Gemini çağrısı)
// varsayılan KAPALI. İstemcideki bayrak tek başına koruma değil: eski bir
// paket ya da elle atılan istek de uca ulaşabilir. Bu testler, anahtar
// kapalıyken ses uçlarının Gemini'ye HİÇ gitmeden 403 döndüğünü sabitler.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';

const generateText = vi.fn(async () => '{"text":"merhaba","stress":1,"excitement":2,"confidence":3,"hesitation":4}');

vi.mock('../middleware/auth.js', () => ({
    verifyFirebaseToken: (req, res, next) => next(),
}));
vi.mock('../services/gemini.js', () => ({
    generateText: (...args) => generateText(...args),
    generateGrounded: vi.fn(),
    getApiKeyDetailed: vi.fn(async () => ({ key: 'x', source: 'test' })),
}));

const { default: aiRouter } = await import('./ai.js');
const { isAudioFallbackEnabled } = await import('../services/audioFallback.js');

let server;
let base;

beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '5mb' }));
    app.use(aiRouter);
    await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
    generateText.mockClear();
    delete process.env.AUDIO_FALLBACK_ENABLED;
});

const postJson = (path) =>
    fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: 'AAAA', mimeType: 'audio/webm' }),
    });

describe('isAudioFallbackEnabled', () => {
    it('is off by default and for unknown values', () => {
        expect(isAudioFallbackEnabled({})).toBe(false);
        expect(isAudioFallbackEnabled({ AUDIO_FALLBACK_ENABLED: '' })).toBe(false);
        expect(isAudioFallbackEnabled({ AUDIO_FALLBACK_ENABLED: 'false' })).toBe(false);
        expect(isAudioFallbackEnabled({ AUDIO_FALLBACK_ENABLED: '0' })).toBe(false);
        expect(isAudioFallbackEnabled({ AUDIO_FALLBACK_ENABLED: 'belki' })).toBe(false);
    });

    it('turns on only for explicit truthy values', () => {
        for (const v of ['true', 'TRUE', ' 1 ', 'on', 'yes', 'evet']) {
            expect(isAudioFallbackEnabled({ AUDIO_FALLBACK_ENABLED: v })).toBe(true);
        }
    });
});

describe('audio STT routes when the switch is OFF (default)', () => {
    it('POST /api/ai/stt returns 403 and never calls Gemini', async () => {
        const res = await postJson('/api/ai/stt');
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.code).toBe('AUDIO_FALLBACK_DISABLED');
        expect(body.error).toBe('Bu özellik için Chrome kullanın');
        expect(generateText).not.toHaveBeenCalled();
    });

    it('POST /api/gemini-stt returns 403 and never calls Gemini', async () => {
        const res = await postJson('/api/gemini-stt');
        expect(res.status).toBe(403);
        expect(generateText).not.toHaveBeenCalled();
    });

    it('GET /api/ai/stt-config reports disabled', async () => {
        const res = await fetch(`${base}/api/ai/stt-config`);
        expect(await res.json()).toEqual({ audioFallbackEnabled: false });
    });
});

describe('audio STT routes when the switch is ON', () => {
    beforeEach(() => {
        process.env.AUDIO_FALLBACK_ENABLED = 'true';
    });

    it('POST /api/ai/stt transcribes as before', async () => {
        const res = await postJson('/api/ai/stt');
        expect(res.status).toBe(200);
        expect(generateText).toHaveBeenCalledTimes(1);
    });

    it('POST /api/gemini-stt transcribes as before', async () => {
        const res = await postJson('/api/gemini-stt');
        expect(res.status).toBe(200);
        expect((await res.json()).text).toBe('merhaba');
    });

    it('GET /api/ai/stt-config reports enabled', async () => {
        const res = await fetch(`${base}/api/ai/stt-config`);
        expect(await res.json()).toEqual({ audioFallbackEnabled: true });
    });
});
