// Şirket başlığı yalnız kendi API'mize gider; dış adreslere sızmaz.
import { describe, expect, it } from 'vitest';

import { isOwnApi, withTenantHeader, TENANT_HEADER } from './tenantFetch';

const opts = { serverUrl: 'https://api.ornek.test', origin: 'https://app.ornek.test' };

describe('tenantFetch', () => {
    it('kendi API: göreli /api, sunucu kökü, sayfa kökü', () => {
        expect(isOwnApi('/api/users', opts)).toBe(true);
        expect(isOwnApi('https://api.ornek.test/api/x', opts)).toBe(true);
        expect(isOwnApi('https://app.ornek.test/api/x', opts)).toBe(true);
    });
    it('dış adres ve /api ile başlamayan yol değil', () => {
        expect(isOwnApi('https://www.googleapis.com/api/x', opts)).toBe(false);
        expect(isOwnApi('https://hub.ornek.test/api/apps/exchange', opts)).toBe(false);
        expect(isOwnApi('/apix', opts)).toBe(false);
        expect(isOwnApi('https://api.ornek.test.evil.com/api/x', opts)).toBe(false);
    });
    it('başlığı ekler, var olanı ezmez, dışarıya eklemez', () => {
        const [, init] = withTenantHeader('/api/users', { headers: { A: '1' } }, 'T1', opts);
        expect(init.headers.get(TENANT_HEADER)).toBe('T1');
        expect(init.headers.get('A')).toBe('1');
        const [, kept] = withTenantHeader('/api/users', { headers: { [TENANT_HEADER]: 'T2' } }, 'T1', opts);
        expect(kept.headers.get(TENANT_HEADER)).toBe('T2');
        const [, ext] = withTenantHeader('https://www.googleapis.com/x', {}, 'T1', opts);
        expect(ext?.headers).toBeUndefined();
        const [, none] = withTenantHeader('/api/users', undefined, null, opts);
        expect(none).toBeUndefined();
    });
});
