// İstemci yol modülü: etkin şirket olmadan yol KURULMAZ (eski köke ya da başka
// şirkete düşmek yerine hata), kimlik biçimi sunucuyla aynı.
import { afterEach, describe, expect, it } from 'vitest';

import {
    memberPath,
    setActiveTenantId,
    storagePaths,
    tc,
    tenantFromLocation,
    withTenantParam,
    getActiveTenantId,
} from './tenantPaths';

afterEach(() => setActiveTenantId(null));

describe('tenantPaths (istemci)', () => {
    it('etkin şirket yoksa yol kurmaz', () => {
        expect(() => tc('candidates')).toThrow(/Şirket/);
        expect(() => storagePaths.cv('a.pdf')).toThrow();
    });
    it('etkin şirket altında yol kurar; geçersiz kimlik etkin olmaz', () => {
        setActiveTenantId('T1');
        expect(tc('candidates')).toBe('tenants/T1/candidates');
        expect(memberPath('u1')).toBe('tenants/T1/members/u1');
        expect(storagePaths.bulkImport('u1', 'tok/0-a.pdf')).toBe('tenants/T1/bulk-imports/u1/tok/0-a.pdf');
        setActiveTenantId('a/b');
        expect(getActiveTenantId()).toBeNull();
    });
    it('aday bağlantısına şirket parametresi eklenir ve geri okunur', () => {
        setActiveTenantId('T1');
        expect(withTenantParam('/join/iv-1')).toBe('/join/iv-1?tenantId=T1');
        expect(withTenantParam('/respond/x?type=info')).toBe('/respond/x?type=info&tenantId=T1');
        expect(tenantFromLocation('?tenantId=T2')).toBe('T2');
        expect(tenantFromLocation('?tenantId=../x')).toBeNull();
    });
});
