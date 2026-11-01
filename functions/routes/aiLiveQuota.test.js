// /api/ai/generate — canlı mülakat kotası ve düşünme beyaz listesi.
//
// İstemci saatte 20 analiz / 10 takip sorusu sınırını uyguluyor, ama sayfa
// yenilenince sayacı sıfırlanıyor ve değiştirilmiş bir istemci döngüyü
// sıklaştırabilir. Bu testler aynı sınırın SUNUCUDA, mülakat kimliği + saat
// anahtarıyla tutulduğunu ve sınır dolunca Gemini'ye HİÇ gidilmediğini
// sabitler.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';

const generateText = vi.fn(async () => '{"ok":true}');

// Bellekte sahte Firestore — yalnızca kotanın kullandığı yüzey.
const store = new Map();
const fakeDb = {
    doc: (path) => ({ path }),
    runTransaction: async (fn) => {
        const writes = [];
        const tx = {
            get: async (ref) => ({ exists: store.has(ref.path), data: () => store.get(ref.path) }),
            set: (ref, data, opts) => writes.push([ref.path, data, opts]),
        };
        const out = await fn(tx);
        for (const [path, data, opts] of writes) {
            store.set(path, opts?.merge ? { ...(store.get(path) || {}), ...data } : data);
        }
        return out;
    },
};

let authUser = { uid: 'r1', provider: 'password' };
vi.mock('../middleware/auth.js', () => ({
    verifyFirebaseToken: (req, res, next) => { req.authUser = authUser; next(); },
}));
vi.mock('../config/firebaseAdmin.js', () => ({ db: fakeDb, admin: {} }));
vi.mock('../middleware/rateLimit.js', () => ({ aiLimiter: (req, res, next) => next() }));
vi.mock('../services/gemini.js', () => ({
    generateText: (...args) => generateText(...args),
    generateGrounded: vi.fn(),
    getApiKeyDetailed: vi.fn(async () => ({ key: 'x', source: 'test' })),
}));

const { default: aiRouter, resolveThinkingConfig } = await import('./ai.js');

let server;
let base;
beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(aiRouter);
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
    generateText.mockClear();
    store.clear();
    store.set('interviews/iv-1', { status: 'active' });
    authUser = { uid: 'r1', provider: 'password' };
});

const post = (body) =>
    fetch(`${base}/api/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'p', ...body }),
    });

describe('thinking whitelist', () => {
    it('maps only known preset names to a server-chosen config', () => {
        expect(resolveThinkingConfig('low')).toEqual({ thinkingBudget: 512 });
        expect(resolveThinkingConfig('high')).toBeUndefined();
        expect(resolveThinkingConfig({ thinkingBudget: 100000 })).toBeUndefined();
        expect(resolveThinkingConfig('__proto__')).toBeUndefined();
        expect(resolveThinkingConfig(undefined)).toBeUndefined();
    });

    it('passes the whitelisted preset through and drops anything else', async () => {
        await post({ thinking: 'low' });
        expect(generateText.mock.calls[0][1].generationConfig.thinkingConfig).toEqual({ thinkingBudget: 512 });
        await post({ thinking: { thinkingBudget: 99999 } });
        expect(generateText.mock.calls[1][1].generationConfig.thinkingConfig).toBeUndefined();
        await post({});
        expect(generateText.mock.calls[2][1].generationConfig.thinkingConfig).toBeUndefined();
    });
});

describe('interview-live quota (analysis: 20/hour per interview)', () => {
    it('forces the live caps even if the client asks for more', async () => {
        const res = await post({ label: 'interview-live', interviewId: 'iv-1', maxOutputTokens: 32768, thinking: 'nope' });
        expect(res.status).toBe(200);
        const cfg = generateText.mock.calls[0][1].generationConfig;
        expect(cfg.maxOutputTokens).toBe(1024);
        expect(cfg.thinkingConfig).toEqual({ thinkingBudget: 512 });
        expect(generateText.mock.calls[0][1].label).toBe('interview-live');
    });

    it('allows 20 calls, rejects the 21st with 429 and never calls Gemini for it', async () => {
        for (let i = 0; i < 20; i++) {
            const res = await post({ label: 'interview-live', interviewId: 'iv-1' });
            expect(res.status).toBe(200);
        }
        const res = await post({ label: 'interview-live', interviewId: 'iv-1' });
        expect(res.status).toBe(429);
        const body = await res.json();
        expect(body.code).toBe('INTERVIEW_AI_LIMIT');
        expect(body.kind).toBe('analysis');
        expect(generateText).toHaveBeenCalledTimes(20);
    });

    it('counts per interview — another interview has its own bucket', async () => {
        store.set('interviews/iv-2', {});
        for (let i = 0; i < 20; i++) await post({ label: 'interview-live', interviewId: 'iv-1' });
        expect((await post({ label: 'interview-live', interviewId: 'iv-2' })).status).toBe(200);
    });

    it('requires a real interview id (no fresh bucket per made-up id)', async () => {
        expect((await post({ label: 'interview-live' })).status).toBe(400);
        expect((await post({ label: 'interview-live', interviewId: '../x' })).status).toBe(400);
        expect((await post({ label: 'interview-live', interviewId: 'iv-uydurma' })).status).toBe(404);
        expect(generateText).not.toHaveBeenCalled();
    });

    it('rejects anonymous (candidate) sessions', async () => {
        authUser = { uid: 'anon', provider: 'anonymous' };
        expect((await post({ label: 'interview-live', interviewId: 'iv-1' })).status).toBe(403);
        expect(generateText).not.toHaveBeenCalled();
    });
});

describe('interview-followup quota (10/hour per interview)', () => {
    it('allows 10 follow-ups and rejects the 11th, separate from the analysis bucket', async () => {
        for (let i = 0; i < 10; i++) {
            expect((await post({ label: 'interview-followup', interviewId: 'iv-1' })).status).toBe(200);
        }
        const res = await post({ label: 'interview-followup', interviewId: 'iv-1' });
        expect(res.status).toBe(429);
        expect((await res.json()).kind).toBe('followup');
        // Analiz kovası etkilenmedi
        expect((await post({ label: 'interview-live', interviewId: 'iv-1' })).status).toBe(200);
    });
});

describe('other labels', () => {
    it('are not subject to the interview quota and keep their own caps', async () => {
        const res = await post({ label: 'interview-plan', maxOutputTokens: 16384 });
        expect(res.status).toBe(200);
        expect(generateText.mock.calls[0][1].generationConfig.maxOutputTokens).toBe(16384);
    });
});
