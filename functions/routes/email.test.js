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

describe('yanıt kutusu okuma (PR 7b — işe alımcının kutusu)', async () => {
    const { fetchGmailReplies, fetchGraphReplies, stripPlainReply, validIcs } = await import('./email.js');
    const ID = 'ir-123e4567-e89b-12d3-a456-426614174000';
    const b64u = (s) => Buffer.from(s).toString('base64url');
    const jsonRes = (data) => ({ ok: true, status: 200, json: async () => data });

    it('Gmail: konuda talep kimliği olan mesajın gönderenini ve yeni metnini çıkarır', async () => {
        const fetchImpl = async (url) => {
            if (url.includes('/messages?')) return jsonRes({ messages: [{ id: 'm1' }, { id: 'm2' }] });
            if (url.includes('/m1')) {
                return jsonRes({
                    payload: {
                        headers: [{ name: 'Subject', value: `Re: Bilgi Talebi [#${ID}]` }, { name: 'From', value: 'Aday <Aday@X.test>' }],
                        mimeType: 'multipart/alternative',
                        parts: [{ mimeType: 'text/plain', body: { data: b64u('Belgeler ekte.\n\nOn Mon, X wrote:\n> eski') } }],
                    },
                });
            }
            return jsonRes({ payload: { headers: [{ name: 'Subject', value: 'Başka bir konu ir' }] } });
        };
        const out = await fetchGmailReplies('tok', fetchImpl);
        expect(out).toEqual([{ requestId: ID, from: 'aday@x.test', subject: `Re: Bilgi Talebi [#${ID}]`, replyBody: 'Belgeler ekte.' }]);
    });

    it('Microsoft Graph: HTML gövdeden alıntı atılır', async () => {
        const fetchImpl = async () =>
            jsonRes({ value: [{ subject: `YNT: Talep [#${ID}]`, from: { emailAddress: { address: 'Aday@X.test' } }, body: { contentType: 'html', content: '<p>Tamam</p><blockquote>eski</blockquote>' } }] });
        const out = await fetchGraphReplies('tok', fetchImpl);
        expect(out[0]).toMatchObject({ requestId: ID, from: 'aday@x.test', replyBody: 'Tamam' });
    });

    it('Türkçe alıntı satırı da kesilir; .ics doğrulaması', () => {
        expect(stripPlainReply('Evet\n\n2 Kas 2026 tarihinde İK şunu yazdı:\n> soru')).toBe('Evet');
        expect(validIcs('BEGIN:VCALENDAR\r\nEND:VCALENDAR')).toBe(true);
        expect(validIcs('<script>')).toBe(false);
    });
});
