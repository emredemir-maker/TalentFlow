// Yol modülü — sunucudaki tek yol kaynağı. Kimlik doğrulaması bir şirketin
// ağacından çıkmayı ya da başka bir alt koleksiyona kaymayı engeller.
import { describe, expect, it } from 'vitest';

import {
    PLATFORM_PATHS,
    storagePaths,
    tenantColl,
    tenantIdFromPath,
    tenantPaths,
} from './tenantPaths.js';

describe('tenantPaths', () => {
    it('şirket altında yol kurar', () => {
        const p = tenantPaths('A');
        expect(p.candidate('c1')).toBe('tenants/A/candidates/c1');
        expect(p.bulkItems('j1')).toBe('tenants/A/bulkImportJobs/j1/items');
        expect(p.member('u1')).toBe('tenants/A/members/u1');
        expect(storagePaths.cv('A', 'cv.pdf')).toBe('tenants/A/cvs/cv.pdf');
        expect(PLATFORM_PATHS.companyIntel('acme')).toBe('platform/companyIntel/entries/acme');
    });
    it('geçersiz şirket kimliği reddedilir', () => {
        for (const t of ['', 'a/b', '..', 'x y', null, undefined, 'a'.repeat(65)]) {
            expect(() => tenantPaths(t)).toThrow(/şirket/);
        }
    });
    it("'/' içeren ya da '.'/'..' kimlik reddedilir (alt koleksiyona kayma yok)", () => {
        const p = tenantPaths('A');
        for (const id of ['a/b', '..', '.', '', 'x/../../B/candidates/y', '__x__']) {
            expect(() => p.candidate(id)).toThrow(/kimliği/);
        }
    });
    it('bilinmeyen koleksiyon reddedilir', () => {
        expect(() => tenantColl('A', 'users')).toThrow(/Bilinmeyen/);
    });
    it('işçi yolundan şirket kimliği', () => {
        expect(tenantIdFromPath('tenants/A/bulkImportJobs/j')).toBe('A');
        expect(tenantIdFromPath('artifacts/x/public/data/bulkImportJobs/j')).toBeNull();
        expect(tenantIdFromPath('tenants/A/x/y/bulkImportJobs/j')).toBeNull();
    });
});
