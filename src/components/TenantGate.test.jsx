// Şirket kapısı: engel ekranı uygulamanın yerini aldığında başka şirkete geçiş
// ve çıkış yolu kalmalı; çıkış hatırlanan seçimi unutmalı.
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

// Test ortamında JSX klasik dönüşümle derleniyor; bileşen dosyaları React'i içe aktarmıyor.
globalThis.React = React;

vi.mock('../config/firebase', () => ({ auth: null, db: {}, isFirebaseConfigured: false }));

const { default: AuthContext, forgetRememberedTenant, LAST_TENANT_KEY, hubVerificationExpired } = await import('../context/AuthContext.jsx');
const { tenantGateScreen } = await import('./TenantGate.jsx');

const base = {
    tenants: [
        { id: 'A', name: 'Alfa' },
        { id: 'B', name: 'Beta' },
    ],
    tenantId: 'A',
    userProfile: null,
    tenant: { status: 'active' },
    tenantReadable: true,
    tenantSuspended: false,
    selectTenant: () => {},
    logout: () => {},
};

const render = (ctx) =>
    renderToString(<AuthContext.Provider value={ctx}>{tenantGateScreen(ctx)}</AuthContext.Provider>);

describe('TenantGate', () => {
    it('Hub doğrulaması dolan üyeye Hub\'dan yeniden açmasını söyler (PR 4)', () => {
        const html = render({ ...base, hubVerificationExpired: true });
        expect(html).toContain('Clyro Hub');
        expect(html).toContain('yeniden açın');
        expect(html).not.toContain('Bu şirkette erişiminiz yok');
    });
    it('hubVerificationExpired: yalnız etkin, destek dışı, süresi geçmiş üyelik', () => {
        const now = 1_000_000;
        expect(hubVerificationExpired({ status: 'active', role: 'recruiter', expiresAt: now - 1 }, now)).toBe(true);
        expect(hubVerificationExpired({ status: 'active', role: 'recruiter', expiresAt: now + 1 }, now)).toBe(false);
        expect(hubVerificationExpired({ status: 'active', role: 'support', expiresAt: now - 1 }, now)).toBe(false);
        expect(hubVerificationExpired({ status: 'removed', role: 'recruiter', expiresAt: now - 1 }, now)).toBe(false);
        expect(hubVerificationExpired({ status: 'active', role: 'admin' }, now)).toBe(false);
        expect(hubVerificationExpired(null, now)).toBe(false);
    });
    it('üyeliği olmayan / askıdaki şirkette başka şirkete geçiş düğmesi gösterir', () => {
        const noAccess = render(base);
        expect(noAccess).toContain('Bu şirkette erişiminiz yok');
        expect(noAccess).toContain('Beta');
        expect(noAccess).not.toContain('>Alfa<');
        const suspended = render({ ...base, tenantSuspended: true });
        expect(suspended).toContain('askıya alınmış');
        expect(suspended).toContain('Beta');
    });
    it('tek şirkette geçiş listesi yok, çıkış var', () => {
        const html = render({ ...base, tenants: [{ id: 'A', name: 'Alfa' }] });
        expect(html).not.toContain('Başka bir şirketle');
        expect(html).toContain('Çıkış yap');
    });
});

describe('forgetRememberedTenant', () => {
    it('hatırlanan seçimi siler', () => {
        const store = new Map([[LAST_TENANT_KEY, 'A']]);
        const fake = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
        forgetRememberedTenant(fake);
        expect(fake.getItem(LAST_TENANT_KEY)).toBeNull();
    });
});
