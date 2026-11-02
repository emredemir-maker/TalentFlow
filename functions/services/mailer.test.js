// Aday e-postası göndericisi (PR 7b, K7): kimden, kime yanıt, ne zaman kapalı.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ docs: new Map() }));
vi.mock('../config/firebaseAdmin.js', () => {
    const snap = (p) => ({ exists: store.docs.has(p), data: () => store.docs.get(p) });
    return {
        db: {
            doc: (p) => ({ path: p }),
            runTransaction: async (fn) =>
                fn({
                    get: async (r) => snap(r.path),
                    set: (r, d) => {
                        const cur = store.docs.get(r.path) || {};
                        const sent = (cur.email?.sent || 0) + (d.email?.sent?.__inc || 0);
                        store.docs.set(r.path, { ...cur, ...d, email: { sent } });
                    },
                }),
        },
        admin: { firestore: { FieldValue: { increment: (n) => ({ __inc: n }) } } },
    };
});

const { sendEmail, mailerConfig, formatFrom, sanitizeDisplayName, sanitizeSubject, MailerDisabledError, MailerError, isEmail } =
    await import('./mailer.js');

const ENV = { RESEND_API_KEY: 're_test_123' };

function fakeFetch(status = 200, body = { id: 'em_1' }) {
    const calls = [];
    const fn = async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        return { ok: status >= 200 && status < 300, status, json: async () => body };
    };
    fn.calls = calls;
    return fn;
}

const base = { tenantId: 'A', fromName: 'Acme A.Ş.', replyTo: 'ik@acme.test', to: 'aday@x.test', subject: 'Merhaba', html: '<p>x</p>' };

beforeEach(() => store.docs.clear());

describe('mailerConfig', () => {
    it('ANAHTAR YOKSA KAPALI — gerçek adaya e-posta gitmez, sessiz "gönderildi" yok', async () => {
        expect(mailerConfig({}).enabled).toBe(false);
        const f = fakeFetch();
        await expect(sendEmail(base, { env: {}, fetchImpl: f })).rejects.toBeInstanceOf(MailerDisabledError);
        expect(f.calls).toHaveLength(0);
    });

    it('varsayılan gönderen noreply@clyrolabs.com; günlük şirket tavanı 300', () => {
        expect(mailerConfig(ENV)).toMatchObject({ enabled: true, fromAddress: 'noreply@clyrolabs.com', dailyLimit: 300 });
    });
});

describe('başlıklar', () => {
    it('From: "Şirket" <noreply@clyrolabs.com>, Reply-To işe alımcı, şirket etiketi', async () => {
        const f = fakeFetch();
        await sendEmail(base, { env: ENV, fetchImpl: f });
        const { url, init, body } = f.calls[0];
        expect(url).toBe('https://api.resend.com/emails');
        expect(init.headers.Authorization).toBe('Bearer re_test_123');
        expect(body.from).toBe('"Acme A.Ş." <noreply@clyrolabs.com>');
        expect(body.reply_to).toBe('ik@acme.test');
        expect(body.to).toEqual(['aday@x.test']);
        expect(body.tags).toContainEqual({ name: 'tenant', value: 'A' });
    });

    it('BAŞLIK ENJEKSİYONU YOK: görünen addaki satır sonu/tırnak/köşeli parantez atılır', () => {
        expect(sanitizeDisplayName('Acme"\r\nBcc: kurban@x.test <evil@x.test>')).toBe('Acme Bcc: kurban@x.test evil@x.test');
        expect(formatFrom('', 'noreply@clyrolabs.com')).toBe('"Clyro Talent" <noreply@clyrolabs.com>');
        expect(sanitizeSubject('Konu\r\nBcc: x@y.z')).toBe('Konu Bcc: x@y.z');
    });

    it('geçersiz Reply-To yazılmaz (CRLF, çoklu adres)', async () => {
        for (const bad of ['ik@acme.test\r\nBcc: x@y.z', 'a@b.c, d@e.f', '<a@b.c>']) {
            const f = fakeFetch();
            await sendEmail({ ...base, replyTo: bad }, { env: ENV, fetchImpl: f });
            expect(f.calls[0].body.reply_to).toBeUndefined();
        }
    });

    it('alıcı doğrulanır; en çok 10 alıcı', async () => {
        await expect(sendEmail({ ...base, to: 'a@b.c, d@e.f' }, { env: ENV, fetchImpl: fakeFetch() })).rejects.toBeInstanceOf(MailerError);
        await expect(sendEmail({ ...base, to: Array(11).fill('a@b.co') }, { env: ENV, fetchImpl: fakeFetch() })).rejects.toThrow(/alıcı/);
        expect(isEmail('aday@x.test')).toBe(true);
        expect(isEmail('aday@x.test\n')).toBe(false);
    });

    it('.ics eki base64 ve dosya adı temiz', async () => {
        const f = fakeFetch();
        await sendEmail({ ...base, attachments: [{ filename: '../../mülakat.ics', content: 'BEGIN:VCALENDAR', contentType: 'text/calendar' }] }, { env: ENV, fetchImpl: f });
        const a = f.calls[0].body.attachments[0];
        expect(a.filename).toBe('.._.._m_lakat.ics');
        expect(Buffer.from(a.content, 'base64').toString()).toBe('BEGIN:VCALENDAR');
    });
});

describe('hata ve tavan', () => {
    it('hizmet hatası anahtar/ham metin sızdırmadan MailerError', async () => {
        const err = await sendEmail(base, { env: ENV, fetchImpl: fakeFetch(422, { name: 'validation_error', message: 'secret detail' }) }).catch((e) => e);
        expect(err).toBeInstanceOf(MailerError);
        expect(err.message).not.toMatch(/secret|re_test/);
    });

    it('şirket başına günlük tavan: dolunca 429 EMAIL_DAILY_LIMIT, başka şirket etkilenmez', async () => {
        const env = { ...ENV, EMAIL_DAILY_LIMIT_PER_TENANT: '2' };
        const now = new Date('2026-11-02T10:00:00Z');
        await sendEmail(base, { env, fetchImpl: fakeFetch(), now });
        await sendEmail(base, { env, fetchImpl: fakeFetch(), now });
        const err = await sendEmail(base, { env, fetchImpl: fakeFetch(), now }).catch((e) => e);
        expect(err.code).toBe('EMAIL_DAILY_LIMIT');
        expect(err.status).toBe(429);
        await expect(sendEmail({ ...base, tenantId: 'B' }, { env, fetchImpl: fakeFetch(), now })).resolves.toEqual({ id: 'em_1' });
        // Ertesi gün yeniden açılır.
        await expect(sendEmail(base, { env, fetchImpl: fakeFetch(), now: new Date('2026-11-03T00:00:01Z') })).resolves.toBeTruthy();
    });
});
