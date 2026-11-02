import { describe, expect, it } from 'vitest';

import { isValidLinkId, isValidSessionId, linkPathFor, newLinkId } from './publicLinks.js';

describe('publicLinks (sunucu)', () => {
    it('yeni kimlik 128 bit, 22 karakter base64url ve her seferinde farklı', () => {
        const ids = new Set(Array.from({ length: 200 }, () => newLinkId()));
        expect(ids.size).toBe(200);
        for (const id of ids) expect(isValidLinkId(id)).toBe(true);
    });
    it('biçimsiz kimlikler reddedilir (yol kaydırma dahil)', () => {
        for (const bad of ['', 'x', '../../../../../../../xx', 'a'.repeat(23), null, 5]) {
            expect(isValidLinkId(bad)).toBe(false);
        }
    });
    it('oturum kimliği iv- önekli ve yeterince uzun olmalı', () => {
        expect(isValidSessionId('iv-6f1c2a8e-1d2b-4c3d-9e8f-0123456789ab')).toBe(true);
        expect(isValidSessionId('iv-1')).toBe(false);
        expect(isValidSessionId('cand-123456789')).toBe(false);
        expect(isValidSessionId('iv-aaaa/bbbb/cccc')).toBe(false);
    });
    it('tür → aday sayfası yolu', () => {
        expect(linkPathFor('position', 'x')).toBe('/apply/x');
        expect(linkPathFor('interview', 'x')).toBe('/join/x');
        expect(linkPathFor('infoRequest', 'x')).toBe('/respond/x');
        expect(() => linkPathFor('admin', 'x')).toThrow();
    });
});
