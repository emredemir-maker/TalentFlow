import { describe, expect, it, vi } from 'vitest';

vi.mock('./ai/config', () => ({ getAuthHeaders: async () => ({ Authorization: 'Bearer t' }) }));

const { hasStoredCv, fetchCandidateCvObjectUrl } = await import('./candidateCvFile.js');
const { hasOriginalCvFile, isEmbeddableCv } = await import('../utils/candidateCv.js');

describe('aday CV dosyası (PR 6)', () => {
    it('yeni kayıt Storage yolu taşır; eski kayıt yalnız adres', () => {
        expect(hasStoredCv({ id: 'c1', cvPath: 'tenants/A/cvs/x.pdf' })).toBe(true);
        expect(hasStoredCv({ id: 'c1', cvUrl: 'https://x/cv.pdf' })).toBe(false);
        expect(hasStoredCv({ cvPath: 'tenants/A/cvs/x.pdf' })).toBe(false);
        expect(hasOriginalCvFile({ cvPath: 'tenants/A/cvs/x.pdf' })).toBe(true);
        expect(isEmbeddableCv({ cvPath: 'tenants/A/cvs/x.pdf' })).toBe(true);
        expect(isEmbeddableCv({ cvPath: 'tenants/A/cvs/x.docx' })).toBe(false);
    });

    it('dosya sunucu ucundan kimlikle istenir; 404 anlaşılır hata', async () => {
        const fetchImpl = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['pdf']) }));
        const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
        expect(await fetchCandidateCvObjectUrl('c 1', { fetchImpl })).toBe('blob:x');
        expect(fetchImpl.mock.calls[0][0]).toBe('/api/candidates/c%201/cv');
        expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer t');
        created.mockRestore();
        const notFound = vi.fn(async () => ({ ok: false, status: 404 }));
        await expect(fetchCandidateCvObjectUrl('c1', { fetchImpl: notFound })).rejects.toThrow('CV dosyası bulunamadı.');
    });
});
