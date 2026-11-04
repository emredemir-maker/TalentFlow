// /api/init-interview-session kimlik istemez; kapanan görüşmeyi açmamalı, sahte değerlendirme yazdırmamalı.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/firebaseAdmin.js', () => ({ db: {}, admin: {} }));
vi.mock('../services/gemini.js', () => ({ generateText: vi.fn() }));

import { filterNewSession, filterSessionMerge, isClosedSession } from './interview.js';

describe('isClosedSession', () => {
    it.each([
        [{ status: 'completed' }],
        [{ status: 'superseded' }],
        [{ mode: 'manual' }],
        [{ aiAnalysis: { score: 1 } }],
        [{ aiOverallScore: 0 }],
    ])('%j kapalıdır', (data) => {
        expect(isClosedSession(data)).toBe(true);
    });
    it.each([[{ status: 'live' }], [{ status: 'scheduled', aiAnalysis: null }], [{}]])('%j açıktır', (data) => {
        expect(isClosedSession(data)).toBe(false);
    });
});

describe('alan süzme', () => {
    it('yeni oturumda değerlendirme ve mod düşer, soru ve aday kimliği kalır', () => {
        expect(
            filterNewSession({ candidateId: 'c', questions: [], aiAnalysis: { score: 100 }, mode: 'manual' })
        ).toEqual({ candidateId: 'c', questions: [] });
    });
    it('var olan oturumda mod yazılamaz', () => {
        expect(filterSessionMerge({ mode: 'manual', lastActive: 'x' }).safe).toEqual({ lastActive: 'x' });
    });
});
