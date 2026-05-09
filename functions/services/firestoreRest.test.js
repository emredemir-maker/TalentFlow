// Tests for the Firestore REST helpers — Phase 4c.
//
// toFsValue() is the interesting bit (recursive type-envelope encoding)
// and is fully covered. fsGet/fsPatch/fsSet are tested with vi.stubGlobal
// against fetch() to confirm the URL + headers + body shape, and the
// 404-as-null behavior of fsGet.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fsGet, fsPatch, fsSet, toFsValue } from './firestoreRest.js';

describe('toFsValue', () => {
    it('encodes null and undefined as nullValue', () => {
        expect(toFsValue(null)).toEqual({ nullValue: null });
        expect(toFsValue(undefined)).toEqual({ nullValue: null });
    });

    it('encodes booleans', () => {
        expect(toFsValue(true)).toEqual({ booleanValue: true });
        expect(toFsValue(false)).toEqual({ booleanValue: false });
    });

    it('encodes integers as stringified integerValue (Firestore quirk)', () => {
        // Firestore's REST API expects integers as strings to preserve precision
        // for 64-bit values that JS cannot represent. Easy thing to forget.
        expect(toFsValue(0)).toEqual({ integerValue: '0' });
        expect(toFsValue(42)).toEqual({ integerValue: '42' });
        expect(toFsValue(-7)).toEqual({ integerValue: '-7' });
    });

    it('encodes floats as doubleValue (number, not string)', () => {
        expect(toFsValue(1.5)).toEqual({ doubleValue: 1.5 });
        expect(toFsValue(-0.1)).toEqual({ doubleValue: -0.1 });
    });

    it('encodes Date as ISO timestampValue', () => {
        const d = new Date('2024-06-15T12:34:56.789Z');
        expect(toFsValue(d)).toEqual({ timestampValue: '2024-06-15T12:34:56.789Z' });
    });

    it('encodes strings', () => {
        expect(toFsValue('hello')).toEqual({ stringValue: 'hello' });
        expect(toFsValue('')).toEqual({ stringValue: '' });
    });

    it('coerces non-primitive non-special values to stringValue', () => {
        // Defensive fallback — anything that fell through the type ladder
        // becomes a string. This shouldn't actually trigger in practice.
        expect(toFsValue(Symbol('x')).stringValue).toMatch(/Symbol/);
    });

    it('encodes arrays recursively', () => {
        expect(toFsValue([1, 'a', true])).toEqual({
            arrayValue: {
                values: [
                    { integerValue: '1' },
                    { stringValue: 'a' },
                    { booleanValue: true },
                ],
            },
        });
    });

    it('encodes nested objects recursively', () => {
        expect(toFsValue({ name: 'Ada', age: 30, active: true })).toEqual({
            mapValue: {
                fields: {
                    name: { stringValue: 'Ada' },
                    age: { integerValue: '30' },
                    active: { booleanValue: true },
                },
            },
        });
    });

    it('handles deeply nested mixed structures', () => {
        const result = toFsValue({
            tags: ['a', 'b'],
            meta: { count: 3, ts: new Date('2024-01-01T00:00:00.000Z') },
        });
        expect(result.mapValue.fields.tags).toEqual({
            arrayValue: { values: [{ stringValue: 'a' }, { stringValue: 'b' }] },
        });
        expect(result.mapValue.fields.meta.mapValue.fields.count).toEqual({
            integerValue: '3',
        });
        expect(result.mapValue.fields.meta.mapValue.fields.ts).toEqual({
            timestampValue: '2024-01-01T00:00:00.000Z',
        });
    });
});

// fetch-based helper tests — stub the global fetch and assert on call shape.
describe('fsGet / fsPatch / fsSet', () => {
    const origEnv = {
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
        VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID,
    };
    let fetchMock;

    beforeEach(() => {
        // FS_BASE() prefers VITE_FIREBASE_PROJECT_ID — root .env can leak it
        // into the test process, so override both to keep assertions stable.
        process.env.VITE_FIREBASE_PROJECT_ID = 'test-proj';
        process.env.FIREBASE_PROJECT_ID = 'test-proj';
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        process.env.FIREBASE_PROJECT_ID = origEnv.FIREBASE_PROJECT_ID;
        process.env.VITE_FIREBASE_PROJECT_ID = origEnv.VITE_FIREBASE_PROJECT_ID;
        vi.unstubAllGlobals();
    });

    describe('fsGet', () => {
        it('returns parsed JSON on 200', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ fields: { x: { stringValue: 'y' } } }),
            });
            const result = await fsGet('docs/abc', 'TOKEN_123');
            expect(result).toEqual({ fields: { x: { stringValue: 'y' } } });
            expect(fetchMock).toHaveBeenCalledWith(
                'https://firestore.googleapis.com/v1/projects/test-proj/databases/(default)/documents/docs/abc',
                expect.objectContaining({
                    headers: expect.objectContaining({ Authorization: 'Bearer TOKEN_123' }),
                })
            );
        });

        it('returns null on 404 (intentional swallow — caller distinguishes "missing" from "error")', async () => {
            fetchMock.mockResolvedValue({ ok: false, status: 404 });
            await expect(fsGet('docs/missing', 'T')).resolves.toBeNull();
        });

        it('throws on other non-ok statuses', async () => {
            fetchMock.mockResolvedValue({ ok: false, status: 500 });
            await expect(fsGet('docs/x', 'T')).rejects.toThrow(/Firestore GET failed: 500/);
        });
    });

    describe('fsPatch', () => {
        it('sends PATCH with updateMask query params and typed body', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ name: 'docs/abc' }),
            });
            await fsPatch('docs/abc', { status: 'done', count: 5 }, 'T');

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [url, init] = fetchMock.mock.calls[0];
            // Field mask must include both keys (order doesn't matter for the
            // REST API but we want both present).
            expect(url).toContain('updateMask.fieldPaths=status');
            expect(url).toContain('updateMask.fieldPaths=count');
            expect(init.method).toBe('PATCH');
            expect(init.headers.Authorization).toBe('Bearer T');
            expect(init.headers['Content-Type']).toBe('application/json');
            expect(JSON.parse(init.body)).toEqual({
                fields: {
                    status: { stringValue: 'done' },
                    count: { integerValue: '5' },
                },
            });
        });

        it('throws on non-ok with body included for triage', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 403,
                text: async () => 'permission_denied',
            });
            await expect(fsPatch('docs/x', { a: 1 }, 'T')).rejects.toThrow(
                /Firestore PATCH failed: 403 permission_denied/
            );
        });

        it('URL-encodes special characters in field paths', async () => {
            // Field paths with spaces or special chars still encode safely.
            // Dots are kept as-is (valid URL char) — Firestore treats them
            // as map navigation, which is the caller's intent.
            fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
            await fsPatch('docs/abc', { 'a b': 1 }, 'T');
            const [url] = fetchMock.mock.calls[0];
            expect(url).toContain('updateMask.fieldPaths=a%20b');
        });
    });

    describe('fsSet', () => {
        it('POSTs to the collection with documentId query param', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ name: 'collX/myDoc' }),
            });
            await fsSet('collX', 'myDoc', { foo: 'bar' }, 'T');

            const [url, init] = fetchMock.mock.calls[0];
            expect(url).toBe(
                'https://firestore.googleapis.com/v1/projects/test-proj/databases/(default)/documents/collX?documentId=myDoc'
            );
            expect(init.method).toBe('POST');
            expect(JSON.parse(init.body)).toEqual({
                fields: { foo: { stringValue: 'bar' } },
            });
        });

        it('throws on non-ok with body for triage', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 400,
                text: async () => 'invalid documentId',
            });
            await expect(fsSet('coll', 'bad/id', { a: 1 }, 'T')).rejects.toThrow(
                /Firestore SET failed: 400 invalid documentId/
            );
        });
    });
});
