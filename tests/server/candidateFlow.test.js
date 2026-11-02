// Aday akışı — uçtan uca (plan §2.5, §3.3). Gerçek Express uçları + gerçek
// Firestore kuralları + emülatör. Tarayıcı yok; aday tarafının yaptığı her
// adım (bağlantıyı çözmek, Firestore'dan tekil okumak/yazmak, sunucu uçları)
// aynı sırayla ve aynı kimlikle yapılır:
//
//   recruiter ilan bağlantısı ister → aday bağlantıyı çözer → ilanı kurallarla
//   okur → başvurur → recruiter başvuruyu görür; mülakat bağlantısı → aday
//   oturuma katılır, transkript yazar, daveti onaylar; bilgi talebi → aday yanıtlar.
//   Her adımda ikinci şirket (T2) ilk şirketin kaydına ulaşamaz.
//
// Çalıştırma: npm run test:rules (emülatörleri açar).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEnv, anonCtx, strictCtx, allow, deny } from '../rules/helpers.js';

const PROJECT = 'demo-talentflow-rules';

Object.assign(process.env, {
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
    STORAGE_EMULATOR_HOST: 'http://127.0.0.1:9199',
    FIREBASE_PROJECT_ID: PROJECT,
    GCLOUD_PROJECT: PROJECT,
    FIREBASE_STORAGE_BUCKET: 'agentinn-nyqpx.firebasestorage.app',
});
delete process.env.VITE_FIREBASE_PROJECT_ID;

const inDays = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

let db;
let admin;
let env;
let server;
let base;

function token(uid, provider = 'custom') {
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
            email: `${uid}@x.test`,
            email_verified: true,
            firebase: { sign_in_provider: provider, identities: {} },
        }),
        '',
    ].join('.');
}

async function call(method, path, { uid, tenant, body, anon = false } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (uid) headers.Authorization = `Bearer ${token(uid, anon ? 'anonymous' : 'custom')}`;
    if (tenant) headers['X-Tenant-Id'] = tenant;
    const res = await fetch(`${base}${path}`, {
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

// Aday tarayıcısının Firestore'u: anonim oturum, gerçek kurallar.
const candidateDb = () => anonCtx(env, 'aday-tarayici').firestore();
const memberDb = (uid) => strictCtx(env, uid).firestore();

beforeAll(async () => {
    await fetch(
        `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
        {
            method: 'DELETE',
        }
    );
    env = await createEnv();
    ({ db, admin } = await import('../../functions/config/firebaseAdmin.js'));
    const express = (await import('express')).default;
    const app = express();
    app.use(express.json());
    for (const mod of ['positions', 'interview', 'email', 'publicLinks']) {
        app.use((await import(`../../functions/routes/${mod}.js`)).default);
    }
    await new Promise((r) => {
        server = app.listen(0, '127.0.0.1', r);
    });
    base = `http://127.0.0.1:${server.address().port}`;

    const live = { status: 'active', writeUntil: inDays(30), readUntil: inDays(30) };
    const docs = {
        'tenants/T1': { name: 'Bir', ...live },
        'tenants/T2': { name: 'İki', ...live },
        'tenants/T1/members/r1': { role: 'recruiter', status: 'active' },
        'tenants/T2/members/r2': { role: 'admin', status: 'active' },
        'tenants/T1/positions/p1': { title: 'Backend', status: 'open' },
        'tenants/T1/candidates/c1': {
            name: 'Ayşe',
            email: 'ayse@x.test',
            interviewSessions: [{ id: 'iv-akis-0001', candidateStatus: null, questions: [] }],
        },
    };
    const batch = db.batch();
    for (const [p, d] of Object.entries(docs)) batch.set(db.doc(p), d);
    await batch.commit();
    for (const uid of ['r1', 'r2'])
        await admin
            .auth()
            .createUser({ uid })
            .catch(() => {});
}, 60_000);

afterAll(async () => {
    await new Promise((r) => (server ? server.close(r) : r()));
    await env?.cleanup();
});

const tenantIdUnderTest = 'T1';
const positionIdUnderTest = 'p1';

describe('başvuru akışı', () => {
    let linkId;
    it('recruiter ilan bağlantısı alır; bağlantı şirket ya da ilan kimliği taşımaz', async () => {
        const r = await call('POST', '/api/public-links', {
            uid: 'r1',
            tenant: 'T1',
            body: { kind: 'position', targetId: 'p1' },
        });
        expect(r.status).toBe(200);
        linkId = r.body.linkId;
        expect(r.body.path).toBe(`/apply/${linkId}`);
        // Yol tek bir rastgele segment; şirket ya da ilan kimliği değil.
        // (Kimliklerin alt dizgisi olarak aranmaz: base64url kimlik tesadüfen
        // "p1" içerebilir.)
        const segments = r.body.path.split('/').filter(Boolean);
        expect(segments).toEqual(['apply', linkId]);
        expect(linkId).toMatch(/^[A-Za-z0-9_-]{22}$/);
        expect([tenantIdUnderTest, positionIdUnderTest]).not.toContain(linkId);
        // Başka şirketin yöneticisi T1'in ilanına bağlantı açamaz.
        expect(
            (
                await call('POST', '/api/public-links', {
                    uid: 'r2',
                    tenant: 'T2',
                    body: { kind: 'position', targetId: 'p1' },
                })
            ).status
        ).toBe(404);
        expect(
            (
                await call('POST', '/api/public-links', {
                    uid: 'r2',
                    tenant: 'T1',
                    body: { kind: 'position', targetId: 'p1' },
                })
            ).status
        ).toBe(403);
    });
    it('aday bağlantıyı çözer, ilanı kurallarla tekil okur, listeleyemez, başvurur', async () => {
        const res = await call('GET', `/api/public/resolve/${linkId}`);
        expect(res.status).toBe(200);
        const { tenantId, targetId, kind } = res.body;
        expect({ tenantId, targetId, kind }).toEqual({
            tenantId: 'T1',
            targetId: 'p1',
            kind: 'position',
        });

        const cdb = candidateDb();
        const snap = await allow(cdb.doc(`tenants/${tenantId}/positions/${targetId}`).get());
        expect(snap.data().title).toBe('Backend');
        await deny(cdb.collection(`tenants/${tenantId}/positions`).get());
        await deny(cdb.collection(`tenants/${tenantId}/candidates`).add({ name: 'çöp' }));

        const app = await call('POST', '/api/applications', {
            uid: 'aday-tarayici',
            anon: true,
            body: { link: linkId, name: 'Ayşe', email: 'AYSE@x.test', phone: '555' },
        });
        expect(app.status).toBe(200);
        // Recruiter başvuruyu görür; T2 yöneticisi göremez.
        const list = await allow(memberDb('r1').collection('tenants/T1/applications').get());
        expect(list.docs.map((d) => d.data().email)).toEqual(['ayse@x.test']);
        await deny(memberDb('r2').collection('tenants/T1/applications').get());
    });
});

describe('mülakat akışı', () => {
    const sessionId = 'iv-akis-0001';
    let linkId;
    it('recruiter oturum bağlantısı alır ve oturumu açar', async () => {
        const r = await call('POST', '/api/public-links', {
            uid: 'r1',
            tenant: 'T1',
            body: { kind: 'interview', targetId: sessionId, candidateId: 'c1' },
        });
        expect(r.status).toBe(200);
        linkId = r.body.linkId;
        const init = await call('POST', '/api/init-interview-session', {
            uid: 'r1',
            tenant: 'T1',
            body: { sessionId, initialData: { status: 'scheduled', candidateId: 'c1' } },
        });
        expect(init.status).toBe(200);
    });
    it('aday bağlantıyla katılır: oturumu okur, transkript yazar, korumalı alana yazamaz', async () => {
        const { body } = await call('GET', `/api/public/resolve/${linkId}`);
        expect(body).toEqual({ kind: 'interview', targetId: sessionId, tenantId: 'T1' });
        const ref = candidateDb().doc(`tenants/${body.tenantId}/interviews/${body.targetId}`);
        await allow(ref.get());
        await allow(ref.update({ transcript: ['Merhaba'] }));
        await deny(ref.update({ aiAnalysis: { score: 100 } }));
        await deny(candidateDb().collection('tenants/T1/interviews').get());

        // Sunucu ucu (lobi durumu) bağlantıyla.
        expect(
            (
                await call('POST', '/api/init-interview-session', {
                    body: { link: linkId, initialData: { candidateStatus: 'lobi' } },
                })
            ).status
        ).toBe(200);
        const s = await call('GET', `/api/session/${linkId}`);
        expect(s.status).toBe(200);
        expect(s.body.candidateName).toBe('Ayşe');
        expect(
            (
                await call('POST', '/api/candidate-respond', {
                    body: { link: linkId, type: 'invite', action: 'confirm' },
                })
            ).status
        ).toBe(200);
        const iv = (await db.doc(`tenants/T1/interviews/${sessionId}`).get()).data();
        expect(iv).toMatchObject({
            candidateStatus: 'lobi',
            transcript: ['Merhaba'],
            candidateId: 'c1',
        });
        expect(iv.candidateResponse.status).toBe('confirm');
        // İkinci şirketin yöneticisi T1'in mülakatlarını listeleyemez.
        await deny(memberDb('r2').collection('tenants/T1/interviews').get());
    });
});

describe('bilgi talebi akışı', () => {
    it('recruiter talep gönderir; aday bağlantıyla talebi okur ve yanıtlar', async () => {
        process.env.EMAIL_USER = 'noreply@clyro.test';
        process.env.EMAIL_PASS = 'x';
        try {
            // Posta sunucusuna ulaşılamasa da talep ve bağlantı önce yazılır.
            await call('POST', '/api/send-info-request', {
                uid: 'r1',
                tenant: 'T1',
                body: { to: 'ayse@x.test', candidateName: 'Ayşe', candidateId: 'c1' },
            });
        } finally {
            delete process.env.EMAIL_USER;
            delete process.env.EMAIL_PASS;
        }
        const links = await db.collection('publicLinks').where('kind', '==', 'infoRequest').get();
        expect(links.size).toBe(1);
        const linkId = links.docs[0].id;
        const { body } = await call('GET', `/api/public/resolve/${linkId}`);
        expect(body.tenantId).toBe('T1');
        const snap = await allow(
            candidateDb().doc(`tenants/T1/infoRequests/${body.targetId}`).get()
        );
        expect(snap.data().status).toBe('pending');
        const r = await call('POST', '/api/candidate-respond', {
            body: { link: linkId, type: 'info', responseData: 'Belgeler ekte' },
        });
        expect(r.status).toBe(200);
        expect(
            (await db.doc(`tenants/T1/infoRequests/${body.targetId}`).get()).data()
        ).toMatchObject({
            status: 'responded',
            responseData: 'Belgeler ekte',
        });
    }, 30_000);
});
