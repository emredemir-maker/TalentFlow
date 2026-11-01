// Mülakat başına saatlik AI kotası — saf mantık (sahte Firestore ile).
import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/firebaseAdmin.js', () => ({ db: {}, admin: {} }));
const { consumeInterviewQuota, hourKey, isValidInterviewId, INTERVIEW_AI_LIMITS } = await import('./interviewAiQuota.js');

function makeDb(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
        store,
        doc: (path) => ({ path }),
        runTransaction: async (fn) => {
            const writes = [];
            const out = await fn({
                get: async (ref) => ({ exists: store.has(ref.path), data: () => store.get(ref.path) }),
                set: (ref, data) => writes.push([ref.path, data]),
            });
            for (const [p, d] of writes) store.set(p, { ...(store.get(p) || {}), ...d });
            return out;
        },
    };
}

describe('consumeInterviewQuota', () => {
    it('keys the counter by interview id + UTC hour and resets the next hour', async () => {
        const db = makeDb({ 'interviews/iv-1': {} });
        const t0 = new Date('2026-11-01T13:59:00Z');
        for (let i = 0; i < INTERVIEW_AI_LIMITS.analysis; i++) {
            expect((await consumeInterviewQuota({ interviewId: 'iv-1', kind: 'analysis', now: t0, db })).allowed).toBe(true);
        }
        expect(await consumeInterviewQuota({ interviewId: 'iv-1', kind: 'analysis', now: t0, db }))
            .toMatchObject({ allowed: false, reason: 'limit' });
        expect([...db.store.keys()]).toContain('artifacts/talent-flow/public/data/interviewAiQuota/iv-1_2026-11-01T13');

        const t1 = new Date('2026-11-01T14:00:00Z');
        expect((await consumeInterviewQuota({ interviewId: 'iv-1', kind: 'analysis', now: t1, db })).allowed).toBe(true);
    });

    it('refuses an interview that does not exist', async () => {
        const db = makeDb();
        expect(await consumeInterviewQuota({ interviewId: 'iv-x', kind: 'analysis', db }))
            .toEqual({ allowed: false, reason: 'not_found' });
    });

    it('fails open when Firestore is unreachable (other brakes stay on)', async () => {
        const db = { doc: (p) => ({ path: p }), runTransaction: async () => { throw new Error('UNAVAILABLE'); } };
        expect((await consumeInterviewQuota({ interviewId: 'iv-1', kind: 'followup', db })).allowed).toBe(true);
    });

    it('validates ids and hour keys', () => {
        expect(isValidInterviewId('iv-0f8c1b2a-1234-4abc-9def-001122334455')).toBe(true);
        expect(isValidInterviewId('a/b')).toBe(false);
        expect(isValidInterviewId('..')).toBe(false);
        expect(isValidInterviewId('')).toBe(false);
        expect(isValidInterviewId(42)).toBe(false);
        expect(hourKey(new Date('2026-11-01T13:05:00Z'))).toBe('2026-11-01T13');
    });
});
