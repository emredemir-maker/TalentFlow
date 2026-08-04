// Tests for the bulk-import worker — Phase 4c.
//
// Scope: extractCvText (the dispatch logic for PDF/DOCX parsing).
// The worker loop itself (claimNextQueuedJob, runBulkWorkerLoop) interacts
// with Firestore + admin SDK and belongs in integration tests.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock pdf.js (ESM) — vi.mock intercepts. Mammoth is loaded via
// createRequire(import.meta.url) in bulkWorker.js, which bypasses vi.mock,
// so docx-path coverage is left for an integration test or a future PR
// that converts the createRequire import to ESM.
const mockPdf = vi.hoisted(() => vi.fn());
vi.mock('./pdf.js', () => ({ pdf: mockPdf }));

// Avoid pulling firebase-admin into tests. `mockWhereGet(field, value)`
// stands in for collection().where(field,'==',value).limit(1).get() so
// findDuplicateCandidate's query fan-out is testable.
const mockWhereGet = vi.hoisted(() => vi.fn());
vi.mock('../config/firebaseAdmin.js', () => ({
    db: {
        collection: () => ({
            where: (field, _op, value) => ({ limit: () => ({ get: () => mockWhereGet(field, value) }) }),
        }),
        runTransaction: vi.fn(),
    },
    admin: {
        firestore: { FieldValue: { serverTimestamp: () => ({}) } },
    },
}));

const { extractCvText, findDuplicateCandidate, resolvePreScore } = await import('./bulkWorker.js');

beforeEach(() => {
    mockPdf.mockReset();
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('extractCvText', () => {
    it('routes pdf buffers to the pdf-parse helper', async () => {
        mockPdf.mockResolvedValue({ text: 'PDF body content here' });
        const buf = Buffer.from('fake-pdf-bytes');

        const result = await extractCvText(buf, 'pdf');

        expect(result).toBe('PDF body content here');
        expect(mockPdf).toHaveBeenCalledTimes(1);
        expect(mockPdf).toHaveBeenCalledWith(buf);
    });

    it('trims surrounding whitespace from extracted text', async () => {
        mockPdf.mockResolvedValue({ text: '\n\n   actual content   \n\n' });
        const result = await extractCvText(Buffer.from('x'), 'pdf');
        expect(result).toBe('actual content');
    });

    it('returns empty string when the parser yields no text', async () => {
        mockPdf.mockResolvedValue({ text: undefined });
        const result = await extractCvText(Buffer.from('x'), 'pdf');
        expect(result).toBe('');
    });

    it('throws on unsupported format with a Turkish error (caught + reported by the worker)', async () => {
        await expect(extractCvText(Buffer.from('x'), 'txt')).rejects.toThrow(
            /Desteklenmeyen format: txt/
        );
        await expect(extractCvText(Buffer.from('x'), 'jpg')).rejects.toThrow(
            /Desteklenmeyen format: jpg/
        );
    });

    it('propagates parser errors to the caller (worker treats them as item failure)', async () => {
        mockPdf.mockRejectedValue(new Error('corrupt PDF'));
        await expect(extractCvText(Buffer.from('x'), 'pdf')).rejects.toThrow(/corrupt PDF/);
    });
});

describe('findDuplicateCandidate', () => {
    const emptySnap = { empty: true, docs: [] };
    const hitSnap = { empty: false, docs: [{ id: 'existing-1', data: () => ({}) }] };

    beforeEach(() => {
        mockWhereGet.mockReset();
    });

    it('returns null without querying when neither email nor phone exists', async () => {
        const result = await findDuplicateCandidate({ name: 'Ali' }, {});
        expect(result).toBeNull();
        expect(mockWhereGet).not.toHaveBeenCalled();
    });

    it('finds an existing candidate by lowercased email', async () => {
        mockWhereGet.mockImplementation((field, value) =>
            Promise.resolve(field === 'email' && value === 'ali@firma.com' ? hitSnap : emptySnap)
        );
        const result = await findDuplicateCandidate({ email: '  Ali@Firma.com ' }, {});
        expect(result).toEqual({ id: 'existing-1', foundBy: 'email' });
    });

    it('uses the item email when the parsed profile has none', async () => {
        mockWhereGet.mockImplementation((field, value) =>
            Promise.resolve(field === 'email' && value === 'json@kayit.com' ? hitSnap : emptySnap)
        );
        const result = await findDuplicateCandidate(null, { email: 'json@kayit.com' });
        expect(result).toEqual({ id: 'existing-1', foundBy: 'email' });
    });

    it('falls back to normalized phone matching when email misses', async () => {
        mockWhereGet.mockImplementation((field, value) =>
            Promise.resolve(field === 'phone' && value === '905551112233' ? hitSnap : emptySnap)
        );
        const result = await findDuplicateCandidate({ email: 'yeni@aday.com', phone: '+90 555 111 22 33' }, {});
        expect(result).toEqual({ id: 'existing-1', foundBy: 'phone' });
    });

    it('returns null when no email or phone matches', async () => {
        mockWhereGet.mockResolvedValue(emptySnap);
        const result = await findDuplicateCandidate({ email: 'yok@aday.com', phone: '+90 555 000 00 00' }, {});
        expect(result).toBeNull();
    });
});

describe('resolvePreScore', () => {
    it('uses the Gemini score when valid and clamps to 0-100', () => {
        expect(resolvePreScore({ matchScore: 82, matchedPosition: 'Frontend Dev' }, '')).toEqual({ score: 82, matchedTitle: 'Frontend Dev' });
        expect(resolvePreScore({ matchScore: 140, matchedPosition: 'X' }, '').score).toBe(100);
        expect(resolvePreScore({ matchScore: 76.6, matchedPosition: 'X' }, '').score).toBe(77);
    });

    it('prefers the Gemini-matched position over the upload selection', () => {
        expect(resolvePreScore({ matchScore: 60, matchedPosition: 'Backend Dev' }, 'İK Uzmanı').matchedTitle).toBe('Backend Dev');
        expect(resolvePreScore({ matchScore: 60 }, 'İK Uzmanı').matchedTitle).toBe('İK Uzmanı');
    });

    it('falls back to the keyword score when the AI score is missing or zero', () => {
        const parsed = { position: 'frontend developer', skills: ['react'], matchScore: 0 };
        const { score, matchedTitle } = resolvePreScore(parsed, 'Frontend Developer');
        expect(matchedTitle).toBe('Frontend Developer');
        expect(score).toBeGreaterThan(0); // anahtar-kelime eşleşmesi ('frontend', 'developer')
        expect(resolvePreScore({ matchScore: 'abc', position: '' }, '').score).toBe(0);
    });
});
