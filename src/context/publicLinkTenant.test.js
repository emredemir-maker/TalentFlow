// Aday bağlantısında şirket adresten DEĞİL, sunucunun çözdüğü bağlantıdan
// gelir (§2.5); iç sayfada adresteki ipucu geçerli kalır.
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../config/firebase', () => ({ auth: null, db: {}, isFirebaseConfigured: false }));

const { isCandidateLinkPath, publicPageTenant, resolveActiveTenant } = await import('./AuthContext.jsx');
const { setLinkTenantId, getActiveTenantId, getLinkTenantId } = await import('../config/tenantPaths.js');

describe('aday bağlantısı şirketi', () => {
    beforeEach(() => setLinkTenantId(null));

    it('aday bağlantı yolları ayrı; iç herkese açık sayfalar değil', () => {
        expect(isCandidateLinkPath('/apply/abc')).toBe(true);
        expect(isCandidateLinkPath('/join/abc')).toBe(true);
        expect(isCandidateLinkPath('/respond/abc')).toBe(true);
        expect(isCandidateLinkPath('/live-interview/iv-1')).toBe(false);
        expect(isCandidateLinkPath('/interview-report/iv-1')).toBe(false);
    });

    it('aday bağlantısında adresteki ?tenantId yok sayılır; çözülen bağlantı şirketi kullanılır', () => {
        expect(publicPageTenant('/apply/abc', '?tenantId=SALDIRGAN')).toBeNull();
        setLinkTenantId('T1');
        expect(getLinkTenantId()).toBe('T1');
        expect(getActiveTenantId()).toBe('T1');
        expect(publicPageTenant('/join/abc', '?tenantId=SALDIRGAN')).toBe('T1');
    });

    it('iç herkese açık sayfada adresteki ipucu; giriş yapılmamış sayfada hiçbiri', () => {
        expect(publicPageTenant('/live-interview/iv-1', '?tenantId=T2')).toBe('T2');
        expect(publicPageTenant('/dashboard', '?tenantId=T2')).toBeNull();
    });

    it('iki şirketli recruiter aday bağlantısını açınca bağlantının şirketi kazanır', () => {
        setLinkTenantId('B');
        const urlTenant = publicPageTenant('/apply/abc', '');
        const r = resolveActiveTenant({ ids: ['A', 'B'], last: 'A', publicPath: true, urlTenant });
        expect(r.active).toBe('B');
    });

    it('geçersiz şirket kimliği bağlantı şirketi olamaz', () => {
        setLinkTenantId('../x');
        expect(getLinkTenantId()).toBeNull();
    });
});

describe('aday bağlantı sayfasından ayrılış', async () => {
    const { leaveCandidateLink } = await import('./PublicLinkContext.jsx');

    it('iç ekrana geçişte bağlantı şirketi bırakılır ve sayfa tam yeniden yüklenir', () => {
        setLinkTenantId('B');
        const reload = vi.fn();
        expect(leaveCandidateLink({ nextPath: '/panel', reload })).toBe(true);
        expect(reload).toHaveBeenCalledTimes(1);
        expect(getLinkTenantId()).toBeNull();
    });

    it('başka bir aday bağlantısına geçişte ya da bağlantı çözülmemişken yeniden yükleme yok', () => {
        const reload = vi.fn();
        setLinkTenantId('B');
        expect(leaveCandidateLink({ nextPath: '/join/abc', reload })).toBe(false);
        expect(getLinkTenantId()).toBe('B');
        setLinkTenantId(null);
        expect(leaveCandidateLink({ nextPath: '/panel', reload })).toBe(false);
        expect(reload).not.toHaveBeenCalled();
    });
});
