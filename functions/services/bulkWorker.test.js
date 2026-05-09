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

// Avoid pulling firebase-admin into tests
vi.mock('../config/firebaseAdmin.js', () => ({
    db: {
        collection: () => ({
            where: () => ({ limit: () => ({ get: vi.fn() }) }),
        }),
        runTransaction: vi.fn(),
    },
    admin: {
        firestore: { FieldValue: { serverTimestamp: () => ({}) } },
    },
}));

const { extractCvText } = await import('./bulkWorker.js');

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
