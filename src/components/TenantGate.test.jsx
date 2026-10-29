// Şirket kapısı: engel ekranı uygulamanın yerini aldığında başka şirkete geçiş
// ve çıkış yolu kalmalı; çıkış hatırlanan seçimi unutmalı.
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

// Test ortamında JSX klasik dönüşümle derleniyor; bileşen dosyaları React'i içe aktarmıyor.
globalThis.React = React;

vi.mock('../config/firebase', () => ({ auth: null, db: {}, isFirebaseConfigured: false }));

const { default: AuthContext, forgetRememberedTenant, LAST_TENANT_KEY } = await import('../context/AuthContext.jsx');
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
