// resolveAppUrl: adaya giden yanıt bağlantısının kökü. Eskiden eski projenin
// adresi sabitti; proje değişince bağlantıların yeni kuruluma gittiğini
// bu testler koruyor.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/firebaseAdmin.js', () => ({ db: {}, admin: {} }));

import { resolveAppUrl } from './email.js';

describe('resolveAppUrl', () => {
    it('dağıtımın verdiği adresi kullanır (sondaki / atılır)', () => {
        expect(resolveAppUrl({ APP_URL: 'https://ornek.web.app/' })).toBe('https://ornek.web.app');
        expect(resolveAppUrl({ VITE_APP_URL: 'https://a.example', APP_URL: 'https://b.example' })).toBe(
            'https://a.example'
        );
    });

    it('proje kimliğinden adres TÜRETMEZ — varsayılan site başka bir uygulamanın olabilir', () => {
        expect(resolveAppUrl({ GCLOUD_PROJECT: 'deploy-n8n-local' })).toBe('');
        expect(resolveAppUrl({ FIREBASE_CONFIG: JSON.stringify({ projectId: 'x' }) })).toBe('');
    });

    it('hiçbir bilgi yoksa boş döner — eski bir adrese düşmez', () => {
        expect(resolveAppUrl({})).toBe('');
    });
});
