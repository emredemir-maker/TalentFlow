// resolveAppUrl: adaya giden yanıt bağlantısının kökü. Eskiden eski projenin
// adresi sabitti; proje değişince bağlantıların yeni kuruluma gittiğini
// bu testler koruyor.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/firebaseAdmin.js', () => ({ db: {}, admin: {} }));

import { replyPatch, resolveAppUrl } from './email.js';

describe('resolveAppUrl', () => {
    it('dağıtımın verdiği adresi kullanır (sondaki / atılır)', () => {
        expect(resolveAppUrl({ APP_URL: 'https://ornek.web.app/' })).toBe('https://ornek.web.app');
        expect(resolveAppUrl({ VITE_APP_URL: 'https://a.example', APP_URL: 'https://b.example' })).toBe(
            'https://a.example'
        );
    });

    it('proje kimliğinden adres TÜRETMEZ — varsayılan site başka bir uygulamanın olabilir', () => {
        expect(resolveAppUrl({ GCLOUD_PROJECT: 'agentinn-nyqpx' })).toBe('');
        expect(resolveAppUrl({ FIREBASE_CONFIG: JSON.stringify({ projectId: 'x' }) })).toBe('');
    });

    it('hiçbir bilgi yoksa boş döner — eski bir adrese düşmez', () => {
        expect(resolveAppUrl({})).toBe('');
    });
});

describe('replyPatch (ortak gelen kutusu)', () => {
    const req = { candidateEmail: 'Aday@X.test', status: 'pending' };
    it('talebin gönderildiği adresten gelen yanıt uygulanır', () => {
        const p = replyPatch(req, { from: 'aday@x.test', subject: 's', replyBody: 'b' }, new Date(0));
        expect(p).toEqual({ replySubject: 's', replyBody: 'b', status: 'responded', respondedAt: new Date(0) });
    });
    it('başka adresten gelen yanıt (kimliği bilen üçüncü kişi) uygulanmaz', () => {
        expect(replyPatch(req, { from: 'saldirgan@y.test', subject: 's', replyBody: 'b' })).toBeNull();
        expect(replyPatch({ status: 'pending' }, { from: '', replyBody: 'b' })).toBeNull();
    });
    it('yanıtlanmış ve gövdesi dolu talep ezilmez', () => {
        expect(replyPatch({ ...req, status: 'responded', replyBody: 'eski' }, { from: 'aday@x.test' })).toBeNull();
    });
});
