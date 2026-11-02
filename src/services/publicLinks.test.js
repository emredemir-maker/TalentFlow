import { describe, expect, it, vi } from 'vitest';

vi.mock('./ai/config', () => ({ getAuthHeaders: async () => ({}) }));

const { isValidLinkId, linkPathFor, resolvePublicLink } = await import('./publicLinks.js');

const ID = 'abcdefghijklmnopqrstuv';

describe('publicLinks (istemci)', () => {
    it('bağlantı kimliği biçimi sunucuyla aynı (22 karakter base64url)', () => {
        expect(isValidLinkId(ID)).toBe(true);
        expect(isValidLinkId('kisa')).toBe(false);
        expect(isValidLinkId(`${ID.slice(0, 21)}/`)).toBe(false);
        expect(isValidLinkId(null)).toBe(false);
    });

    it('tür → aday sayfası yolu; bilinmeyen tür hata', () => {
        expect(linkPathFor('position', ID)).toBe(`/apply/${ID}`);
        expect(linkPathFor('interview', ID)).toBe(`/join/${ID}`);
        expect(linkPathFor('infoRequest', ID)).toBe(`/respond/${ID}`);
        expect(() => linkPathFor('x', ID)).toThrow();
    });

    it('biçimsiz kimlik sunucuya gitmeden reddedilir; 404 adaya anlaşılır mesaj', async () => {
        const fetchImpl = vi.fn();
        await expect(resolvePublicLink('../../x', { fetchImpl })).rejects.toThrow('Bağlantı geçersiz.');
        expect(fetchImpl).not.toHaveBeenCalled();
        const notFound = vi.fn(async () => ({ status: 404, ok: false }));
        await expect(resolvePublicLink('n'.repeat(22), { fetchImpl: notFound })).rejects.toThrow(/geçersiz/);
    });

    it('başarılı çözüm önbelleklenir; geçici hata önbelleğe girmez', async () => {
        const fail = vi.fn(async () => ({ status: 500, ok: false }));
        await expect(resolvePublicLink('t'.repeat(22), { fetchImpl: fail })).rejects.toThrow();
        const ok = vi.fn(async () => ({ status: 200, ok: true, json: async () => ({ kind: 'position', targetId: 'p', tenantId: 'T' }) }));
        expect(await resolvePublicLink('t'.repeat(22), { fetchImpl: ok })).toEqual({ kind: 'position', targetId: 'p', tenantId: 'T' });
        await resolvePublicLink('t'.repeat(22), { fetchImpl: ok });
        expect(ok).toHaveBeenCalledTimes(1);
    });
});
