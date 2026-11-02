// Aday e-postaları — emülatöre bağlı uçtan uca (PR 7b, K7).
//
// Gerçek Express yönlendiricisi + Firestore emülatörü. Resend'e gidilmez:
// global fetch yalnız api.resend.com için yakalanır, giden gövde incelenir.
// Senaryo: A ve B şirketleri; her biri kendi adıyla ve kendi şablonuyla
// gönderir, yanıt adresi oturumdaki işe alımcı, istemcinin HTML'i yok sayılır.
//
// Çalıştırma: npm run test:rules (emülatörleri açar; vitest.rules.config.js).
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const PROJECT = 'demo-talentflow-rules';

Object.assign(process.env, {
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
    STORAGE_EMULATOR_HOST: 'http://127.0.0.1:9199',
    FIREBASE_PROJECT_ID: PROJECT,
    GCLOUD_PROJECT: PROJECT,
    APP_URL: 'https://talent.clyro.test',
});
delete process.env.VITE_FIREBASE_PROJECT_ID;

let db;
let admin;
let server;
let base;
const sent = [];
const realFetch = globalThis.fetch;

const day = 24 * 60 * 60 * 1000;
const inDays = (n) => new Date(Date.now() + n * day);

function token(uid) {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    return [
        b64({ alg: 'none', typ: 'JWT' }),
        b64({
            iss: `https://securetoken.google.com/${PROJECT}`,
            aud: PROJECT,
            sub: uid,
            user_id: uid,
            auth_time: now,
            iat: now,
            exp: now + 3600,
            email: `${uid}@${uid[0]}.test`,
            email_verified: true,
            firebase: { sign_in_provider: 'custom', identities: {} },
        }),
        '',
    ].join('.');
}

async function call(method, path, { uid, tenant, body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (uid) headers.Authorization = `Bearer ${token(uid)}`;
    if (tenant) headers['X-Tenant-Id'] = tenant;
    const res = await realFetch(`${base}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try {
        json = await res.json();
    } catch {
        /* gövdesiz */
    }
    return { status: res.status, body: json };
}

beforeAll(async () => {
    await realFetch(
        `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
        {
            method: 'DELETE',
        }
    );
    // Yalnız Resend yakalanır; emülatör ve uygulama çağrıları gerçek fetch.
    globalThis.fetch = async (url, init) => {
        if (String(url).startsWith('https://api.resend.com/')) {
            sent.push({ url, headers: init.headers, body: JSON.parse(init.body) });
            return { ok: true, status: 200, json: async () => ({ id: `em_${sent.length}` }) };
        }
        return realFetch(url, init);
    };
    ({ db, admin } = await import('../../functions/config/firebaseAdmin.js'));
    const express = (await import('express')).default;
    const app = express();
    app.use(express.json());
    app.use((await import('../../functions/routes/email.js')).default);
    await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;

    const T = (t) => `tenants/${t}`;
    const active = { status: 'active', writeUntil: inDays(365), readUntil: inDays(365) };
    const docs = {
        [T('A')]: { name: 'Alfa Teknoloji', ...active },
        [T('B')]: { name: 'Beta Lojistik', ...active },
        [`${T('A')}/members/aRec`]: { role: 'recruiter', status: 'active' },
        [`${T('B')}/members/bRec`]: { role: 'recruiter', status: 'active' },
        // A'nın kendi şablonu ve markası; B yerleşik şablonu kullanır.
        [`${T('A')}/settings/emailTemplates`]: {
            feedback: {
                subject: '{{companyName}} sonucu',
                html: '<p>A-ŞABLON {{candidateName}}: {{feedbackText}}</p>',
            },
        },
        [`${T('A')}/settings/branding`]: { companyName: 'Alfa Tek.' },
    };
    const batch = db.batch();
    for (const [p, d] of Object.entries(docs)) batch.set(db.doc(p), d);
    await batch.commit();
    for (const uid of ['aRec', 'bRec'])
        await admin
            .auth()
            .createUser({ uid })
            .catch(() => {});
}, 60_000);

afterEach(() => {
    sent.length = 0;
    delete process.env.RESEND_API_KEY;
});

afterAll(async () => {
    globalThis.fetch = realFetch;
    await new Promise((r) => (server ? server.close(r) : r()));
});

describe('gönderici kuralları (K7)', () => {
    it('RESEND_API_KEY yoksa 503 EMAIL_DISABLED; hiçbir şey gönderilmez', async () => {
        const r = await call('POST', '/api/send-feedback', {
            uid: 'aRec',
            tenant: 'A',
            body: { to: 'aday@x.test', candidateName: 'Ali', feedbackText: 'teşekkürler' },
        });
        expect(r.status).toBe(503);
        expect(r.body.code).toBe('EMAIL_DISABLED');
        expect(sent).toHaveLength(0);
    });

    it("A: From şirket adıyla noreply@clyrolabs.com, Reply-To oturumdaki işe alımcı, A'nın şablonu", async () => {
        process.env.RESEND_API_KEY = 're_test';
        const r = await call('POST', '/api/send-feedback', {
            uid: 'aRec',
            tenant: 'A',
            body: {
                to: 'aday@x.test',
                candidateName: '<b>Ali</b>',
                feedbackText: 'teşekkürler',
                // İstemcinin seçtikleri YOK SAYILIR:
                recruiterEmail: 'saldirgan@kotu.test',
                branding: { companyName: 'Sahte Banka' },
                html: '<a href="https://kotu.test/phish">tıkla</a>'.repeat(10),
            },
        });
        expect(r.status).toBe(200);
        expect(sent).toHaveLength(1);
        const m = sent[0].body;
        expect(m.from).toBe('"Alfa Tek." <noreply@clyrolabs.com>');
        expect(m.reply_to).toBe('aRec@a.test');
        expect(m.subject).toBe('Alfa Tek. sonucu');
        expect(m.html).toBe('<p>A-ŞABLON &lt;b&gt;Ali&lt;/b&gt;: teşekkürler</p>');
        expect(JSON.stringify(m)).not.toMatch(/kotu\.test|Sahte Banka/);
        expect(m.tags).toContainEqual({ name: 'tenant', value: 'A' });
    });

    it("B: kendi adıyla ve yerleşik şablonla; A'nın şablonu/markası sızmaz", async () => {
        process.env.RESEND_API_KEY = 're_test';
        const r = await call('POST', '/api/send-feedback', {
            uid: 'bRec',
            tenant: 'B',
            body: {
                to: 'aday@x.test',
                candidateName: 'Veli',
                feedbackText: 'olumlu',
                outcome: 'positive',
            },
        });
        expect(r.status).toBe(200);
        const m = sent[0].body;
        expect(m.from).toBe('"Beta Lojistik" <noreply@clyrolabs.com>');
        expect(m.reply_to).toBe('bRec@b.test');
        expect(m.html).not.toMatch(/A-ŞABLON|Alfa/);
        expect(m.subject).toMatch(/Olumlu/);
    });

    it('A üyesi B başlığıyla gönderemez (403), hiçbir şey gitmez', async () => {
        process.env.RESEND_API_KEY = 're_test';
        const r = await call('POST', '/api/send-feedback', {
            uid: 'aRec',
            tenant: 'B',
            body: { to: 'aday@x.test', candidateName: 'x', feedbackText: 'y' },
        });
        expect(r.status).toBe(403);
        expect(sent).toHaveLength(0);
    });

    it('davet: bağlantı yalnız uygulamanın adresi; .ics eki; kötü bağlantı e-postaya girmez', async () => {
        process.env.RESEND_API_KEY = 're_test';
        const ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR';
        const ok = await call('POST', '/api/send-interview-invite', {
            uid: 'aRec',
            tenant: 'A',
            body: {
                to: 'aday@x.test',
                templateKey: 'invite',
                vars: {
                    candidateName: 'Ali',
                    joinLink: 'https://talent.clyro.test/join/s1',
                    date: '3 Kasım',
                },
                ics,
            },
        });
        expect(ok.status).toBe(200);
        expect(sent[0].body.html).toContain('href="https://talent.clyro.test/join/s1"');
        expect(sent[0].body.attachments[0].filename).toBe('mulakat.ics');
        const bad = await call('POST', '/api/send-interview-invite', {
            uid: 'aRec',
            tenant: 'A',
            body: {
                to: 'aday@x.test',
                templateKey: 'invite',
                vars: { candidateName: 'Ali', joinLink: 'https://kotu.test/x' },
            },
        });
        expect(bad.status).toBe(200);
        expect(sent[1].body.html).not.toContain('kotu.test');
        const badIcs = await call('POST', '/api/send-interview-invite', {
            uid: 'aRec',
            tenant: 'A',
            body: { to: 'aday@x.test', ics: '<script>' },
        });
        expect(badIcs.status).toBe(400);
    });

    it('bilgi talebi: konuda sunucunun kimliği, kayıtta işe alımcının uid/e-postası (Reply-To ile aynı)', async () => {
        process.env.RESEND_API_KEY = 're_test';
        const r = await call('POST', '/api/send-info-request', {
            uid: 'aRec',
            tenant: 'A',
            body: {
                to: 'Aday@X.test',
                candidateName: 'Ali',
                recruiterEmail: 'saldirgan@kotu.test',
                requestedItems: ['Diploma'],
            },
        });
        expect(r.status).toBe(200);
        expect(sent[0].body.subject).toMatch(new RegExp(`\\[#${r.body.requestId}\\]$`));
        expect(sent[0].body.reply_to).toBe('aRec@a.test');
        const rec = (await db.doc(`tenants/A/infoRequests/${r.body.requestId}`).get()).data();
        expect(rec).toMatchObject({
            recruiterUid: 'aRec',
            recruiterEmail: 'aRec@a.test',
            candidateEmail: 'aday@x.test',
        });
        expect(r.body.respondUrl).toMatch(/^https:\/\/talent\.clyro\.test\/respond\/ir-/);
    });
});

describe('yanıt kontrolü yalnız bağlı kutuda', () => {
    it('Gmail/Microsoft bağlı değilse 409 MAILBOX_NOT_CONNECTED ve açıklama', async () => {
        const r = await call('POST', '/api/check-info-replies', { uid: 'aRec', tenant: 'A' });
        expect(r.status).toBe(409);
        expect(r.body.code).toBe('MAILBOX_NOT_CONNECTED');
        expect(r.body.error).toMatch(/Gmail ya da Microsoft 365/);
    });

    it('durum ucu: gönderim açık mı, yanıt adresi, kutular', async () => {
        process.env.RESEND_API_KEY = 're_test';
        const r = await call('GET', '/api/email/status', { uid: 'aRec', tenant: 'A' });
        expect(r.status).toBe(200);
        expect(r.body).toEqual({
            enabled: true,
            fromAddress: 'noreply@clyrolabs.com',
            replyTo: 'aRec@a.test',
            replyInbox: { google: false, microsoft: false },
        });
    });
});
