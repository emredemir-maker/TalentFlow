// Hub köprüsü — uçtan uca, emülatöre bağlı (PR 4, plan §2.3).
//
// Gerçek Talent yönlendiricileri + gerçek Admin SDK + Firestore/Auth emülatörü; Hub yerine sahte bir
// Hub sunucusu (`/api/apps/server-exchange`) koşar. Senaryolar:
//   • iki şirketli izolasyon: Hub'dan A'ya giren kişi B'nin verisini açamaz;
//   • K2 rol eşlemesi ve Talent'taki elle değişikliğin Hub girişinde korunması;
//   • üyelikten çıkarılan kişinin düşmesi (imzalı olay ve Hub reddi), geciken olayın taze girişi kapatmaması,
//     yöneticinin kaldırdığı üyeliğin Hub'dan açılamaması;
//   • K5: süresi biten deneme salt okunur, 14 gün sonra kapalı;
//   • Hub doğrulamasının süresi (24 saat) dolunca erişim düşer;
//   • K11 destek erişimi: süreli, salt okunur, gerçek üyeliği ezmez;
//   • imza: yanlış imza, tekrar (nonce), tarayıcı kökeni, gizli değer yok.
//
// Çalıştırma: npm run test:rules (vitest.rules.config.js).
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PROJECT = 'demo-talentflow-rules';

Object.assign(process.env, {
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
    STORAGE_EMULATOR_HOST: 'http://127.0.0.1:9199',
    FIREBASE_PROJECT_ID: PROJECT,
    GCLOUD_PROJECT: PROJECT,
});
delete process.env.VITE_FIREBASE_PROJECT_ID;

const EXCHANGE_SECRET = 'x'.repeat(40);
const EVENTS_SECRET = 'e'.repeat(40);
const TA = 'aaaaaaaa-1111-4111-8111-111111111111';
const TB = '22222222-2222-4222-8222-222222222222';
const TC = '33333333-3333-4333-8333-333333333333';
const day = 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();

let db;
let admin;
let talent;
let hub;
let base;
let hubBase;
const env = {};
// Sahte Hub: kod → yanıt. Her istek kaydedilir (Origin/Bearer denetimi için).
const hubAnswers = new Map();
const hubRequests = [];

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
            email: `${uid}@x.test`,
            email_verified: true,
            firebase: { sign_in_provider: 'custom', identities: {} },
        }),
        '',
    ].join('.');
}

async function call(method, path, { uid, tenant, body, headers = {} } = {}) {
    const h = { 'Content-Type': 'application/json', ...headers };
    if (uid) h.Authorization = `Bearer ${token(uid)}`;
    if (tenant) h['X-Tenant-Id'] = tenant;
    const res = await fetch(`${base}${path}`, {
        method,
        headers: h,
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

let codeSeq = 0;
/** Sahte Hub'a bir kod tanımlar ve Talent'ta değiştirir. */
async function hubLogin({
    uid,
    tenantId = TA,
    name = 'Firma A',
    role = 'tenant_admin',
    plan = 'active',
    trialEndsAt = null,
    status = 200,
    body,
}) {
    const code = `kod-${String(++codeSeq).padStart(4, '0')}-${'z'.repeat(24)}`;
    hubAnswers.set(code, {
        status,
        body: body ?? {
            token: `firebase-token-${uid}`,
            uid,
            email: `${uid}@x.test`,
            displayName: uid,
            tenant: {
                id: tenantId,
                name,
                slug: name.toLowerCase().replace(/\s/g, '-'),
                role,
                plan,
                trialEndsAt,
            },
        },
    });
    return call('POST', '/api/hub/exchange', { body: { code } });
}

/** Hub → Talent imzalı olay (CLYRO-M2M-V1). */
async function hubEvent(
    path,
    payload,
    { secret = EVENTS_SECRET, nonce = randomBytes(18).toString('base64url'), ts, origin, raw } = {}
) {
    const body = raw ?? JSON.stringify(payload);
    const timestamp = String(ts ?? Math.floor(Date.now() / 1000));
    const text = [
        'CLYRO-M2M-V1',
        'POST',
        path,
        timestamp,
        nonce,
        'hub',
        createHash('sha256').update(body).digest('hex'),
    ].join('\n');
    const headers = {
        'content-type': 'application/json',
        'x-clyro-m2m-timestamp': timestamp,
        'x-clyro-m2m-nonce': nonce,
        'x-clyro-m2m-actor': 'hub',
        'x-clyro-m2m-signature': `v1=${createHmac('sha256', secret).update(text).digest('hex')}`,
    };
    if (origin) headers.origin = origin;
    const res = await fetch(`${base}${path}`, { method: 'POST', headers, body });
    return { status: res.status, body: await res.json().catch(() => null) };
}

const member = async (t, uid) => (await db.doc(`tenants/${t}/members/${uid}`).get()).data();
const tenantDoc = async (t) => (await db.doc(`tenants/${t}`).get()).data();
const userTenants = async (uid) => (await db.doc(`userTenants/${uid}`).get()).data()?.tenants || {};

beforeAll(async () => {
    await fetch(
        `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
        { method: 'DELETE' }
    );
    ({ db, admin } = await import('../../functions/config/firebaseAdmin.js'));
    const express = (await import('express')).default;

    // Sahte Hub.
    const hubApp = express();
    hubApp.post('/api/apps/server-exchange', express.json(), (req, res) => {
        hubRequests.push({ headers: req.headers, body: req.body });
        if (
            req.headers.authorization !== `Bearer ${EXCHANGE_SECRET}` ||
            req.headers.origin !== undefined
        ) {
            return res.status(401).json({ error: 'Yetkisiz' });
        }
        const a = hubAnswers.get(req.body?.code);
        hubAnswers.delete(req.body?.code);
        if (!a || req.body?.app !== 'talent')
            return res.status(401).json({ error: 'süresi dolmuş' });
        return res.status(a.status).json(a.body);
    });
    await new Promise((r) => {
        hub = hubApp.listen(0, '127.0.0.1', r);
    });
    hubBase = `http://127.0.0.1:${hub.address().port}/api`;
    Object.assign(env, {
        HUB_API_URL: hubBase,
        HUB_EXCHANGE_SECRET: EXCHANGE_SECRET,
        HUB_EVENTS_SECRET: EVENTS_SECRET,
    });

    const { createHubRouter } = await import('../../functions/routes/hub.js');
    const app = express();
    app.use(createHubRouter({ env, exchangePerMinute: 1000 }));
    app.use(express.json());
    for (const mod of ['users', 'admin'])
        app.use((await import(`../../functions/routes/${mod}.js`)).default);
    await new Promise((r) => {
        talent = app.listen(0, '127.0.0.1', r);
    });
    base = `http://127.0.0.1:${talent.address().port}`;

    for (const uid of ['ali', 'ayse', 'bora', 'can', 'deniz', 'destek', 'eski', 'fatih', 'gul']) {
        await admin
            .auth()
            .createUser({ uid })
            .catch(() => {});
    }
}, 60_000);

afterAll(async () => {
    await new Promise((r) => (talent ? talent.close(r) : r()));
    await new Promise((r) => (hub ? hub.close(r) : r()));
});

describe('POST /api/hub/exchange', () => {
    it('Hub girişi şirketi, üyeliği ve şirket listesini yazar; jeton ve şirket kimliği döner', async () => {
        const r = await hubLogin({ uid: 'ali', tenantId: TA, role: 'tenant_admin' });
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ token: 'firebase-token-ali', tenantId: TA });
        expect(await tenantDoc(TA)).toMatchObject({
            name: 'Firma A',
            status: 'active',
            plan: 'active',
            hubTenantId: TA,
        });
        const m = await member(TA, 'ali');
        expect(m).toMatchObject({
            role: 'admin',
            status: 'active',
            hubRole: 'tenant_admin',
            email: 'ali@x.test',
            source: 'hub',
        });
        // Hub doğrulaması 24 saat geçerli.
        expect(m.expiresAt.toMillis() - Date.now()).toBeGreaterThan(23 * 3_600_000);
        expect(await userTenants('ali')).toEqual({ [TA]: { name: 'Firma A', role: 'admin' } });
    });
    it('Talent → Hub isteği sunucudan: Origin yok, Bearer gizli değer, uygulama talent', async () => {
        const last = hubRequests.at(-1);
        expect(last.headers.origin).toBeUndefined();
        expect(last.headers.authorization).toBe(`Bearer ${EXCHANGE_SECRET}`);
        expect(last.body.app).toBe('talent');
    });
    it('geçersiz kod 400, süresi dolmuş kod 401, Hub bozuk yanıt 502', async () => {
        expect((await call('POST', '/api/hub/exchange', { body: { code: 'kısa' } })).status).toBe(
            400
        );
        expect(
            (await call('POST', '/api/hub/exchange', { body: { code: 'y'.repeat(43) } })).status
        ).toBe(401);
        expect((await hubLogin({ uid: 'ali', body: { token: 'x' } })).status).toBe(502);
    });
    it('gizli değer ya da Hub adresi yoksa 503 (uç kapalı)', async () => {
        const saved = env.HUB_EXCHANGE_SECRET;
        env.HUB_EXCHANGE_SECRET = 'kisa';
        try {
            expect(
                (await call('POST', '/api/hub/exchange', { body: { code: 'y'.repeat(43) } })).status
            ).toBe(503);
        } finally {
            env.HUB_EXCHANGE_SECRET = saved;
        }
    });
});

describe('iki şirketli izolasyon', () => {
    it('A ile giren kişi B başlığıyla hiçbir şeyi açamaz; B yalnız kendi üyelerini görür', async () => {
        expect(
            (await hubLogin({ uid: 'bora', tenantId: TB, name: 'Firma B', role: 'tenant_admin' }))
                .status
        ).toBe(200);
        expect((await call('GET', '/api/users', { uid: 'ali', tenant: TB })).status).toBe(403);
        expect((await call('GET', '/api/users', { uid: 'bora', tenant: TA })).status).toBe(403);
        const a = await call('GET', '/api/users', { uid: 'ali', tenant: TA });
        expect(a.status).toBe(200);
        const ids = JSON.stringify(a.body);
        expect(ids).toContain('ali');
        expect(ids).not.toContain('bora');
        expect(Object.keys(await userTenants('bora'))).toEqual([TB]);
    });
    it('aynı kişi iki şirkette: iki ayrı üyelik, şirket listesinde ikisi', async () => {
        expect(
            (await hubLogin({ uid: 'ali', tenantId: TB, name: 'Firma B', role: 'member' })).status
        ).toBe(200);
        expect((await member(TB, 'ali')).role).toBe('department_user');
        expect((await member(TA, 'ali')).role).toBe('admin');
        expect(Object.keys(await userTenants('ali')).sort()).toEqual([TA, TB].sort());
    });
    it('Hub alan kimliği büyük harfle gelse de ikinci şirket açılmaz', async () => {
        expect((await hubLogin({ uid: 'ali', tenantId: TA.toUpperCase() })).body.tenantId).toBe(TA);
        expect((await db.doc(`tenants/${TA.toUpperCase()}`).get()).exists).toBe(false);
    });
});

describe('K2 rol eşlemesi', () => {
    it('manager → recruiter, member → department_user (departmansız)', async () => {
        await hubLogin({ uid: 'ayse', tenantId: TA, role: 'manager' });
        await hubLogin({ uid: 'can', tenantId: TA, role: 'member' });
        expect(await member(TA, 'ayse')).toMatchObject({ role: 'recruiter', departments: [] });
        expect(await member(TA, 'can')).toMatchObject({ role: 'department_user', departments: [] });
    });
    it("Talent'taki elle değişiklik Hub girişinde ezilmez; Hub rolü yalnız hubRole'e yazılır", async () => {
        const p = await call('PATCH', '/api/admin/members/can', {
            uid: 'ali',
            tenant: TA,
            body: { role: 'department_user', departments: ['Eng'] },
        });
        expect(p.status).toBe(200);
        await hubLogin({ uid: 'can', tenantId: TA, role: 'manager' });
        expect(await member(TA, 'can')).toMatchObject({
            role: 'department_user',
            departments: ['Eng'],
            hubRole: 'manager',
        });
    });
});

describe('üyelikten çıkarılan kişi düşer', () => {
    it('imzalı membership.removed olayı üyeliği kapatır ve şirket listesinden siler', async () => {
        expect((await call('GET', '/api/users', { uid: 'ayse', tenant: TA })).status).toBe(200);
        const r = await hubEvent('/api/hub/membership-revoked', {
            type: 'membership.removed',
            tenantId: TA,
            uid: 'ayse',
            occurredAt: iso(Date.now()),
        });
        expect(r.status).toBe(202);
        expect(await member(TA, 'ayse')).toMatchObject({ status: 'removed', removedVia: 'hub' });
        expect(await userTenants('ayse')).toEqual({});
        expect((await call('GET', '/api/users', { uid: 'ayse', tenant: TA })).status).toBe(403);
    });
    it('Hub yeniden eklerse sonraki giriş üyeliği açar (rol korunur)', async () => {
        expect((await hubLogin({ uid: 'ayse', tenantId: TA, role: 'member' })).status).toBe(200);
        expect(await member(TA, 'ayse')).toMatchObject({ status: 'active', role: 'recruiter' });
    });
    it("geciken olay, ondan SONRA Hub'dan yeniden girmiş üyeliği kapatmaz", async () => {
        const r = await hubEvent('/api/hub/membership-revoked', {
            type: 'membership.removed',
            tenantId: TA,
            uid: 'ayse',
            occurredAt: iso(Date.now() - 60_000),
        });
        expect(r.status).toBe(202);
        expect((await member(TA, 'ayse')).status).toBe('active');
    });
    it('Hub reddi (üye değil) üyeliği kapatır; deneme bitişi / askı reddi kapatmaz', async () => {
        await hubLogin({ uid: 'deniz', tenantId: TA, role: 'manager' });
        const deny = (reason) => ({
            code: 'workspace_access_denied',
            uid: 'deniz',
            tenantId: TA,
            ...(reason ? { reason } : {}),
            error: 'x',
        });
        expect(
            (await hubLogin({ uid: 'deniz', status: 403, body: deny('trial_expired') })).status
        ).toBe(403);
        expect((await member(TA, 'deniz')).status).toBe('active');
        expect((await hubLogin({ uid: 'deniz', status: 403, body: deny('inactive') })).status).toBe(
            403
        );
        expect((await member(TA, 'deniz')).status).toBe('active');
        const r = await hubLogin({ uid: 'deniz', status: 403, body: deny('not_member') });
        expect(r.body.code).toBe('WORKSPACE_ACCESS_DENIED');
        expect((await member(TA, 'deniz')).status).toBe('removed');
    });
    it("yöneticinin kaldırdığı üyeliği Hub açamaz; yönetici yeniden açınca kişi Hub'dan girmeli", async () => {
        await hubLogin({ uid: 'fatih', tenantId: TA, role: 'manager' });
        expect(
            (await call('DELETE', '/api/admin/members/fatih', { uid: 'ali', tenant: TA })).status
        ).toBe(200);
        const r = await hubLogin({ uid: 'fatih', tenantId: TA, role: 'manager' });
        expect(r.status).toBe(403);
        expect(r.body.code).toBe('MEMBER_REMOVED');
        expect((await member(TA, 'fatih')).status).toBe('removed');

        expect(
            (await call('POST', '/api/admin/members/fatih/restore', { uid: 'ali', tenant: TA }))
                .status
        ).toBe(200);
        // Hub doğrulaması süresi dolmuş açılır.
        expect((await call('GET', '/api/users', { uid: 'fatih', tenant: TA })).status).toBe(403);
        expect((await hubLogin({ uid: 'fatih', tenantId: TA, role: 'manager' })).status).toBe(200);
        expect((await call('GET', '/api/users', { uid: 'fatih', tenant: TA })).status).toBe(200);
    });
    it('Hub doğrulaması 24 saati geçince erişim düşer, Hub girişi yeniler', async () => {
        await db
            .doc(`tenants/${TA}/members/fatih`)
            .update({ expiresAt: new Date(Date.now() - 1000) });
        const r = await call('GET', '/api/users', { uid: 'fatih', tenant: TA });
        expect(r.status).toBe(403);
        expect(r.body.code).toBe('NOT_A_MEMBER');
        await hubLogin({ uid: 'fatih', tenantId: TA, role: 'manager' });
        expect((await call('GET', '/api/users', { uid: 'fatih', tenant: TA })).status).toBe(200);
    });
});

describe('K5 deneme süresi', () => {
    it('deneme sürerken yazılır', async () => {
        await hubLogin({
            uid: 'gul',
            tenantId: TC,
            name: 'Firma C',
            plan: 'trial',
            trialEndsAt: iso(Date.now() + 5 * day),
        });
        expect((await tenantDoc(TC)).status).toBe('trial');
        expect(
            (
                await call('POST', '/api/admin/retention', {
                    uid: 'gul',
                    tenant: TC,
                    body: { months: 6 },
                })
            ).status
        ).toBe(200);
    });
    it('deneme bitti: 14 gün salt okunur (okuma 200, yazma 402)', async () => {
        await hubLogin({
            uid: 'gul',
            tenantId: TC,
            name: 'Firma C',
            plan: 'trial',
            trialEndsAt: iso(Date.now() - 2 * day),
        });
        expect((await call('GET', '/api/admin/retention', { uid: 'gul', tenant: TC })).status).toBe(
            200
        );
        const w = await call('POST', '/api/admin/retention', {
            uid: 'gul',
            tenant: TC,
            body: { months: 6 },
        });
        expect(w.status).toBe(402);
        expect(w.body.code).toBe('TENANT_READ_ONLY');
    });
    it('deneme + 14 gün geçti: kapalı (402)', async () => {
        await hubLogin({
            uid: 'gul',
            tenantId: TC,
            name: 'Firma C',
            plan: 'trial',
            trialEndsAt: iso(Date.now() - 15 * day),
        });
        const r = await call('GET', '/api/admin/retention', { uid: 'gul', tenant: TC });
        expect(r.status).toBe(402);
        expect(r.body.code).toBe('TENANT_CLOSED');
    });
    it('ücretli plana geçince Hub iki süreyi ileri alır', async () => {
        await hubLogin({ uid: 'gul', tenantId: TC, name: 'Firma C', plan: 'active' });
        expect(
            (
                await call('POST', '/api/admin/retention', {
                    uid: 'gul',
                    tenant: TC,
                    body: { months: 6 },
                })
            ).status
        ).toBe(200);
    });
    it('askıdaki şirket Hub senkronunda askıda kalır', async () => {
        await db.doc(`tenants/${TC}`).update({ status: 'suspended' });
        await hubLogin({ uid: 'gul', tenantId: TC, name: 'Firma C', plan: 'active' });
        expect((await tenantDoc(TC)).status).toBe('suspended');
        expect(
            (await call('GET', '/api/admin/retention', { uid: 'gul', tenant: TC })).body.code
        ).toBe('TENANT_SUSPENDED');
        await db.doc(`tenants/${TC}`).update({ status: 'active' });
    });
});

describe('K11 destek erişimi', () => {
    const grant = (over = {}) => ({
        type: 'support.grant',
        tenantId: TA,
        uid: 'destek',
        email: 'destek@clyrolabs.com',
        reason: 'Müşteri talebi #42: aday listesi boş görünüyor',
        requestedBy: 'emre@clyrolabs.com',
        ...over,
    });
    it('süreli destek üyeliği açılır: okur, yazamaz; denetim kaydı gerekçeyle', async () => {
        const r = await hubEvent('/api/hub/support-access', grant());
        expect(r.status).toBe(200);
        const m = await member(TA, 'destek');
        expect(m).toMatchObject({
            role: 'support',
            status: 'active',
            supportReason: grant().reason,
        });
        expect(m.expiresAt.toMillis() - Date.now()).toBeLessThanOrEqual(day);
        expect((await call('GET', '/api/users', { uid: 'destek', tenant: TA })).status).toBe(200);
        expect(
            (
                await call('POST', '/api/admin/retention', {
                    uid: 'destek',
                    tenant: TA,
                    body: { months: 3 },
                })
            ).status
        ).toBe(403);
        const logs = await db
            .collection(`tenants/${TA}/accessLogs`)
            .where('action', '==', 'support_access_granted')
            .get();
        expect(logs.docs[0].data()).toMatchObject({
            target: 'destek',
            requestedBy: 'emre@clyrolabs.com',
            reason: grant().reason,
        });
    });
    it('süre dolunca kendiliğinden kapanır', async () => {
        await db
            .doc(`tenants/${TA}/members/destek`)
            .update({ expiresAt: new Date(Date.now() - 1000) });
        expect((await call('GET', '/api/users', { uid: 'destek', tenant: TA })).status).toBe(403);
    });
    it('iptal olayı süresinden önce kapatır', async () => {
        await hubEvent('/api/hub/support-access', grant({ ttlHours: 2 }));
        expect((await call('GET', '/api/users', { uid: 'destek', tenant: TA })).status).toBe(200);
        const r = await hubEvent('/api/hub/support-access', {
            type: 'support.revoke',
            tenantId: TA,
            uid: 'destek',
            requestedBy: 'emre@clyrolabs.com',
        });
        expect(r.status).toBe(200);
        expect((await call('GET', '/api/users', { uid: 'destek', tenant: TA })).status).toBe(403);
    });
    it("şirketin gerçek üyesine destek kaydı yazılmaz (409); Talent'ta olmayan şirket 404", async () => {
        expect((await hubEvent('/api/hub/support-access', grant({ uid: 'ali' }))).status).toBe(409);
        expect((await member(TA, 'ali')).role).toBe('admin');
        expect(
            (
                await hubEvent(
                    '/api/hub/support-access',
                    grant({ tenantId: '99999999-9999-4999-8999-999999999999' })
                )
            ).status
        ).toBe(404);
    });
    it("destek üyeliği B'ye geçmez", async () => {
        await hubEvent('/api/hub/support-access', grant());
        expect((await call('GET', '/api/users', { uid: 'destek', tenant: TB })).status).toBe(403);
    });
});

describe('imzalı olay ucu korumaları', () => {
    const ev = { type: 'membership.removed', tenantId: TB, uid: 'bora' };
    it('yanlış gizli değer 401; üyelik değişmez', async () => {
        expect(
            (await hubEvent('/api/hub/membership-revoked', ev, { secret: 'y'.repeat(40) })).status
        ).toBe(401);
        // Başka uca imzalanmış istek (yol imzalı) bu uçta geçmez.
        expect((await member(TB, 'bora')).status).toBe('active');
    });
    it('aynı nonce ikinci kez 401 (tekrar oynatma)', async () => {
        const nonce = randomBytes(18).toString('base64url');
        const ok = { type: 'membership.removed', tenantId: TB, uid: 'yok-kisi' };
        expect((await hubEvent('/api/hub/membership-revoked', ok, { nonce })).status).toBe(202);
        expect((await hubEvent('/api/hub/membership-revoked', ok, { nonce })).status).toBe(401);
    });
    it('eski zaman damgası 401, tarayıcı kökeni 403, bozuk gövde 400, büyük gövde 413', async () => {
        expect(
            (
                await hubEvent('/api/hub/membership-revoked', ev, {
                    ts: Math.floor(Date.now() / 1000) - 600,
                })
            ).status
        ).toBe(401);
        expect(
            (await hubEvent('/api/hub/membership-revoked', ev, { origin: 'https://evil.test' }))
                .status
        ).toBe(403);
        expect(
            (await hubEvent('/api/hub/membership-revoked', null, { raw: '{bozuk' })).status
        ).toBe(400);
        expect(
            (
                await hubEvent('/api/hub/membership-revoked', null, {
                    raw: JSON.stringify({ ...ev, pad: 'p'.repeat(5000) }),
                })
            ).status
        ).toBe(413);
        expect((await member(TB, 'bora')).status).toBe('active');
    });
    it('olay gizli değeri tanımsızsa 503', async () => {
        const saved = env.HUB_EVENTS_SECRET;
        delete env.HUB_EVENTS_SECRET;
        try {
            expect((await hubEvent('/api/hub/membership-revoked', ev)).status).toBe(503);
        } finally {
            env.HUB_EVENTS_SECRET = saved;
        }
    });
});
