// Sunucu şirket yalıtımı — uçtan uca, emülatöre bağlı (plan §3.3 madde 2).
//
// Gerçek Express yönlendiricileri, gerçek Admin SDK, Firestore + Storage
// emülatörü. Kimlik: Auth emülatörü kipinde Admin SDK imzasız jetonu kabul
// eder (FIREBASE_AUTH_EMULATOR_HOST; kullanıcı kaydı emülatörde olmalı); jetonu test kendisi üretir — üretimdeki
// verifyIdToken yolu aynen çalışır, yalnız imza denetimi emülatör kipinde yok.
//
// Senaryo: A ve B şirketleri. Her uç A'nın kullanıcısıyla çağrılır; B'nin
// kimliği başlığa/gövdeye/parametreye konur → 403 ya da 404, B'nin verisi
// değişmez. Ayrıca K5 (salt okunur/kapalı/askı), K11 (destek) ve platform
// yöneticisi ayrımı.
//
// Çalıştırma: npm run test:rules (emülatörleri açar; vitest.rules.config.js).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PROJECT = 'demo-talentflow-rules';
const BUCKET = 'agentinn-nyqpx.firebasestorage.app';

Object.assign(process.env, {
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
    STORAGE_EMULATOR_HOST: 'http://127.0.0.1:9199',
    FIREBASE_PROJECT_ID: PROJECT,
    GCLOUD_PROJECT: PROJECT,
    FIREBASE_STORAGE_BUCKET: BUCKET,
    PLATFORM_ADMIN_EMAILS: 'platform@clyro.test',
});
delete process.env.VITE_FIREBASE_PROJECT_ID;

let db;
let admin;
let server;
let base;
let claimNextQueuedJob;

const day = 24 * 60 * 60 * 1000;
const inDays = (n) => new Date(Date.now() + n * day);

// İmzasız emülatör jetonu.
function token(uid, { email = `${uid}@x.test`, provider = 'custom', verified = true } = {}) {
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
            email,
            email_verified: verified,
            firebase: { sign_in_provider: provider, identities: {} },
        }),
        '',
    ].join('.');
}

async function call(method, path, { uid, tenant, body, anon = false, tokenOpts } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (uid)
        headers.Authorization = `Bearer ${token(uid, { ...(anon ? { provider: 'anonymous' } : {}), ...tokenOpts })}`;
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
        /* gövdesiz yanıt */
    }
    return { status: res.status, body: json };
}

const get = (p) => db.doc(p).get();

beforeAll(async () => {
    // Bütün emülatör verisini temizle (kural testleriyle aynı emülatör).
    await fetch(
        `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
        {
            method: 'DELETE',
        }
    );

    ({ db, admin } = await import('../../functions/config/firebaseAdmin.js'));
    const express = (await import('express')).default;
    const app = express();
    app.use(express.json());
    for (const mod of [
        'users',
        'admin',
        'cv',
        'maintenance',
        'interview',
        'email',
        'positions',
        'companyIntel',
        'auth',
    ]) {
        app.use((await import(`../../functions/routes/${mod}.js`)).default);
    }
    const { createBulkRouter } = await import('../../functions/routes/bulk.js');
    app.use(createBulkRouter('/tmp'));
    ({ claimNextQueuedJob } = await import('../../functions/services/bulkWorker.js'));

    await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;

    const T = (t) => `tenants/${t}`;
    const docs = {
        [T('A')]: { name: 'A', status: 'active', writeUntil: inDays(365), readUntil: inDays(365) },
        [T('B')]: { name: 'B', status: 'active', writeUntil: inDays(365), readUntil: inDays(365) },
        [T('C')]: { name: 'C', status: 'trial', writeUntil: inDays(-1), readUntil: inDays(13) },
        [T('D')]: { name: 'D', status: 'trial', writeUntil: inDays(-15), readUntil: inDays(-1) },
        [T('E')]: {
            name: 'E',
            status: 'suspended',
            writeUntil: inDays(365),
            readUntil: inDays(365),
        },
        [`${T('A')}/members/aAdmin`]: { role: 'admin', status: 'active', email: 'aAdmin@x.test' },
        [`${T('A')}/members/aRecruiter`]: {
            role: 'recruiter',
            status: 'active',
            email: 'aRecruiter@x.test',
        },
        [`${T('A')}/members/aDept`]: {
            role: 'department_user',
            status: 'active',
            departments: ['Eng'],
        },
        [`${T('A')}/members/aSupport`]: { role: 'support', status: 'active', expiresAt: inDays(1) },
        [`${T('A')}/members/aSupportOld`]: {
            role: 'support',
            status: 'active',
            expiresAt: inDays(-1),
        },
        [`${T('A')}/members/aRemoved`]: { role: 'recruiter', status: 'removed' },
        [`${T('B')}/members/bAdmin`]: { role: 'admin', status: 'active', email: 'bAdmin@x.test' },
        [`${T('B')}/members/bRecruiter`]: {
            role: 'recruiter',
            status: 'active',
            email: 'bRecruiter@x.test',
        },
        [`${T('C')}/members/cAdmin`]: { role: 'admin', status: 'active' },
        [`${T('D')}/members/dAdmin`]: { role: 'admin', status: 'active' },
        [`${T('E')}/members/eAdmin`]: { role: 'admin', status: 'active' },
        // A'da aday + mükerrer; B'de aday.
        [`${T('A')}/candidates/a1`]: {
            name: 'Ali',
            email: 'ali@a.test',
            createdAt: new Date(1000),
        },
        [`${T('A')}/candidates/a2`]: {
            name: 'Ali',
            email: 'ali@a.test',
            createdAt: new Date(2000),
            // B'nin dosyasını gösteren CV adresi — imhada silinmemeli.
            cvUrl: `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/tenants%2FB%2Fcvs%2Fb.pdf?alt=media`,
            appliedDate: '2020-01-01T00:00:00Z',
            status: 'rejected',
        },
        [`${T('B')}/candidates/b1`]: {
            name: 'Veli',
            email: 'veli@b.test',
            createdAt: new Date(1000),
            appliedDate: '2020-01-01T00:00:00Z',
            status: 'rejected',
            interviewSessions: [{ id: 'iv-b1', candidateStatus: 'waiting', questions: [] }],
        },
        [`${T('B')}/candidates/b2`]: {
            name: 'Veli',
            email: 'veli@b.test',
            createdAt: new Date(2000),
        },
        [`${T('A')}/positions/pa`]: { title: 'A ilanı', status: 'open' },
        [`${T('C')}/positions/pc`]: { title: 'C ilanı', status: 'open' },
        [`${T('B')}/positions/pb`]: { title: 'B ilanı', status: 'open' },
        [`${T('B')}/positions/pbClosed`]: { title: 'B kapalı', status: 'closed' },
        [`${T('B')}/interviews/iv-b1`]: { sessionId: 'iv-b1', candidateId: 'b1', transcript: '' },
        [`${T('B')}/infoRequests/ir-b1`]: { requestId: 'ir-b1', status: 'pending' },
        [`${T('B')}/bulkImportJobs/jb1`]: { status: 'done', createdBy: 'bRecruiter' },
        [`${T('B')}/settings/system`]: { retentionMonths: 1, retentionEnabled: true },
        [`${T('A')}/settings/system`]: { retentionMonths: 1, retentionEnabled: true },
        [`${T('B')}/companyIntelManual/acme`]: { source: 'manual', website: 'b-ozel.test' },
        'platform/companyIntel/entries/acme': {
            key: 'acme',
            name: 'Acme',
            answer: { text: 'ortak', sources: [{ uri: 'https://acme.test' }] },
            withheld: false,
            resolvedAt: new Date().toISOString(),
        },
        'userTenants/bRecruiter': { tenants: { B: { name: 'B', role: 'recruiter' } } },
    };
    const batch = db.batch();
    for (const [p, d] of Object.entries(docs)) batch.set(db.doc(p), d);
    await batch.commit();

    // Auth emülatörü jetonu doğrularken kullanıcı kaydını da arıyor.
    const uids = [
        'aAdmin',
        'aRecruiter',
        'aDept',
        'aSupport',
        'aSupportOld',
        'aRemoved',
        'bAdmin',
        'bRecruiter',
        'cAdmin',
        'dAdmin',
        'eAdmin',
        'anonX',
        'plat',
    ];
    for (const uid of uids) {
        await admin
            .auth()
            .createUser({ uid })
            .catch(() => {});
    }

    // B'nin CV dosyası (imha testinde dokunulmamalı).
    await admin.storage().bucket(BUCKET).file('tenants/B/cvs/b.pdf').save(Buffer.from('pdf'));
}, 60_000);

afterAll(async () => {
    await new Promise((r) => (server ? server.close(r) : r()));
});

describe('requireTenant: başlık, üyelik, rol', () => {
    it('şirket başlığı yoksa 400, jeton yoksa 401, anonim 403', async () => {
        expect((await call('GET', '/api/users', { uid: 'aAdmin' })).status).toBe(400);
        expect((await call('GET', '/api/users', { tenant: 'A' })).status).toBe(401);
        expect(
            (await call('GET', '/api/users', { uid: 'aAdmin', tenant: 'A', anon: true })).status
        ).toBe(403);
    });
    it("A'nın kullanıcısı B başlığıyla hiçbir şirket ucunu açamaz (403)", async () => {
        const uçlar = [
            ['GET', '/api/users'],
            ['GET', '/api/maintenance/duplicate-scan'],
            ['GET', '/api/maintenance/bulk-jobs'],
            ['GET', '/api/admin/retention'],
            ['GET', '/api/admin/usage'],
            ['POST', '/api/check-duplicate', { email: 'veli@b.test' }],
            ['GET', '/api/bulk-import/jb1'],
            ['POST', '/api/company-intel/resolve', { name: 'Acme' }],
        ];
        for (const uid of ['aAdmin', 'aRecruiter']) {
            for (const [m, p, body] of uçlar) {
                const r = await call(m, p, { uid, tenant: 'B', body });
                expect(r.status, `${uid} ${m} ${p}`).toBe(403);
            }
        }
    });
    it('kaldırılmış ve süresi dolmuş destek üyesi 403; üye olmayan şirket ile var olmayan şirket aynı yanıt', async () => {
        expect((await call('GET', '/api/users', { uid: 'aRemoved', tenant: 'A' })).status).toBe(
            403
        );
        expect((await call('GET', '/api/users', { uid: 'aSupportOld', tenant: 'A' })).status).toBe(
            403
        );
        const yok = await call('GET', '/api/users', { uid: 'aAdmin', tenant: 'ZZ' });
        const başka = await call('GET', '/api/users', { uid: 'aAdmin', tenant: 'B' });
        expect(yok).toEqual(başka);
    });
    it('rol listede değilse 403 (department_user bakım uçlarını açamaz)', async () => {
        expect(
            (await call('GET', '/api/maintenance/duplicate-scan', { uid: 'aDept', tenant: 'A' }))
                .status
        ).toBe(403);
        expect(
            (await call('GET', '/api/admin/retention', { uid: 'aRecruiter', tenant: 'A' })).status
        ).toBe(403);
    });
});

describe('K5 şirket durumu ve K11 destek', () => {
    it('salt okunur (C): okuma 200, yazma 402; kapalı (D) 402; askıda (E) 403', async () => {
        expect(
            (await call('GET', '/api/admin/retention', { uid: 'cAdmin', tenant: 'C' })).status
        ).toBe(200);
        const w = await call('POST', '/api/admin/retention', {
            uid: 'cAdmin',
            tenant: 'C',
            body: { months: 6 },
        });
        expect(w.status).toBe(402);
        expect(w.body.code).toBe('TENANT_READ_ONLY');
        const d = await call('GET', '/api/admin/retention', { uid: 'dAdmin', tenant: 'D' });
        expect(d.status).toBe(402);
        expect(d.body.code).toBe('TENANT_CLOSED');
        const e = await call('GET', '/api/admin/retention', { uid: 'eAdmin', tenant: 'E' });
        expect(e.status).toBe(403);
        expect(e.body.code).toBe('TENANT_SUSPENDED');
    });
    it('destek üyesi okur, yazamaz', async () => {
        expect((await call('GET', '/api/users', { uid: 'aSupport', tenant: 'A' })).status).toBe(
            200
        );
        expect(
            (await call('DELETE', '/api/admin/members/aDept', { uid: 'aSupport', tenant: 'A' }))
                .status
        ).toBe(403);
        expect(
            (
                await call('POST', '/api/check-duplicate', {
                    uid: 'aSupport',
                    tenant: 'A',
                    body: { email: 'x@y.z' },
                })
            ).status
        ).toBe(403);
    });
});

describe('veri yalıtımı', () => {
    it('/api/users yalnız bu şirketin etkin üyelerini döner (destek ve kaldırılmış hariç)', async () => {
        const r = await call('GET', '/api/users', { uid: 'aRecruiter', tenant: 'A' });
        expect(r.status).toBe(200);
        const ids = r.body.users.map((u) => u.id).sort();
        expect(ids).toEqual(['aAdmin', 'aDept', 'aRecruiter']);
    });
    it("müsaitlik: B'nin üyesi A'dan sorgulanamaz", async () => {
        const r = await call('POST', '/api/users/availability', {
            uid: 'aRecruiter',
            tenant: 'A',
            body: { userIds: ['bRecruiter', '../x'], date: '2026-11-02', time: '10:00' },
        });
        expect(r.status).toBe(200);
        expect(r.body.availability).toEqual({ bRecruiter: 'unknown', '../x': 'unknown' });
    });
    it("mükerrer kontrolü B'nin adayını bulmaz, A'nınkini bulur", async () => {
        const b = await call('POST', '/api/check-duplicate', {
            uid: 'aRecruiter',
            tenant: 'A',
            body: { email: 'veli@b.test' },
        });
        expect(b.body.isDuplicate).toBe(false);
        const a = await call('POST', '/api/check-duplicate', {
            uid: 'aRecruiter',
            tenant: 'A',
            body: { email: 'ali@a.test' },
        });
        expect(a.body.isDuplicate).toBe(true);
    });
    it("mükerrer taraması yalnız A'nın havuzu; B kimlikleriyle temizlik hiçbir şey silmez", async () => {
        const scan = await call('GET', '/api/maintenance/duplicate-scan', {
            uid: 'aRecruiter',
            tenant: 'A',
        });
        expect(scan.body.totalCandidates).toBe(2);
        const clean = await call('POST', '/api/maintenance/duplicate-clean', {
            uid: 'aRecruiter',
            tenant: 'A',
            body: { ids: ['b1', 'b2'] },
        });
        expect(clean.body.deleted).toBe(0);
        expect((await get('tenants/B/candidates/b2')).exists).toBe(true);
    });
    it("toplu iş: B'nin işi A'dan 404", async () => {
        expect(
            (await call('GET', '/api/bulk-import/jb1', { uid: 'aAdmin', tenant: 'A' })).status
        ).toBe(404);
        expect(
            (await call('GET', '/api/bulk-import/jb1', { uid: 'bRecruiter', tenant: 'B' })).status
        ).toBe(200);
    });
    it("mülakat yeniden değerlendirme: B'nin oturumu A'dan 404", async () => {
        const r = await call('POST', '/api/reevaluate-interview', {
            uid: 'aRecruiter',
            tenant: 'A',
            body: { sessionId: 'iv-b1' },
        });
        expect(r.status).toBe(404);
    });
    it("saklama imhası yalnız A'nın adayını ve A'nın dosyasını siler", async () => {
        const r = await call('POST', '/api/admin/retention/purge', { uid: 'aAdmin', tenant: 'A' });
        expect(r.status).toBe(200);
        // B'nin adayı ve B'nin dosyası (A'nın kaydı gösterse bile) yerinde.
        expect((await get('tenants/B/candidates/b1')).exists).toBe(true);
        const [var_] = await admin.storage().bucket(BUCKET).file('tenants/B/cvs/b.pdf').exists();
        expect(var_).toBe(true);
        expect(r.body.files).toBe(0);
        // Denetim kaydı A'nın defterinde.
        const logs = await db
            .collection('tenants/A/accessLogs')
            .where('action', '==', 'purge')
            .get();
        expect(logs.size).toBeGreaterThanOrEqual(r.body.deleted > 0 ? 1 : 0);
        const bLogs = await db.collection('tenants/B/accessLogs').get();
        expect(bLogs.size).toBe(0);
    });
});

describe('üyelik kaldırma (auth-user silme yerine)', () => {
    it("A yöneticisi B'nin kullanıcısını kaldıramaz (A'da üyeliği yok → 404); B'deki üyelik değişmez", async () => {
        const r = await call('DELETE', '/api/admin/members/bRecruiter', {
            uid: 'aAdmin',
            tenant: 'A',
        });
        expect(r.status).toBe(404);
        expect((await get('tenants/B/members/bRecruiter')).data().status).toBe('active');
        expect((await get('userTenants/bRecruiter')).data().tenants.B).toBeTruthy();
    });
    it('son yönetici kaldırılamaz (409); recruiter kaldırılır, Firebase hesabı silinmez', async () => {
        expect(
            (await call('DELETE', '/api/admin/auth-user/aAdmin', { uid: 'aAdmin', tenant: 'A' }))
                .status
        ).toBe(409);
        const r = await call('DELETE', '/api/admin/auth-user/aRecruiter', {
            uid: 'aAdmin',
            tenant: 'A',
        });
        expect(r.status).toBe(200);
        expect((await get('tenants/A/members/aRecruiter')).data().status).toBe('removed');
        // Kaldırılan üye artık giremez.
        expect((await call('GET', '/api/users', { uid: 'aRecruiter', tenant: 'A' })).status).toBe(
            403
        );
    });
});

describe('platform yöneticisi', () => {
    it('şirket yöneticisi platform ayarlarını açamaz; platform yöneticisi açar', async () => {
        expect(
            (await call('GET', '/api/admin/api-keys', { uid: 'aAdmin', tenant: 'A' })).status
        ).toBe(403);
        expect(
            (await call('GET', '/api/admin/integrations', { uid: 'aAdmin', tenant: 'A' })).status
        ).toBe(403);
        const p = { uid: 'plat', tokenOpts: { email: 'platform@clyro.test' } };
        expect((await call('GET', '/api/admin/api-keys', p)).status).toBe(200);
        expect((await call('GET', '/api/platform/usage', p)).status).toBe(200);
        // E-postası doğrulanmamışsa liste yetmez.
        const unverified = {
            uid: 'plat',
            tokenOpts: { email: 'platform@clyro.test', verified: false },
        };
        expect((await call('GET', '/api/admin/api-keys', unverified)).status).toBe(403);
    });
    it('platform yöneticisi üye olmadan şirket verisini göremez', async () => {
        const r = await call('GET', '/api/users', {
            uid: 'plat',
            tenant: 'A',
            tokenOpts: { email: 'platform@clyro.test' },
        });
        expect(r.status).toBe(403);
    });
});

describe('herkese açık (aday) uçlar — bağlantıdaki şirket', () => {
    it("ilan: B'nin ilanı A kimliğiyle 404; B ile 200; kapalı ilan 403", async () => {
        expect((await call('GET', '/api/positions/pb?tenantId=A')).status).toBe(404);
        expect((await call('GET', '/api/positions/pb?tenantId=B')).status).toBe(200);
        expect((await call('GET', '/api/positions/pbClosed?tenantId=B')).status).toBe(403);
        expect((await call('GET', '/api/positions/pb')).status).toBe(404);
    });
    it("başvuru: B'nin ilanına A kimliğiyle 404; doğru şirkette yalnız o şirketin ağacına yazılır", async () => {
        const body = { positionId: 'pb', name: 'Aday', email: 'aday@x.test', phone: '1' };
        expect(
            (await call('POST', '/api/applications', { body: { ...body, tenantId: 'A' } })).status
        ).toBe(404);
        const ok = await call('POST', '/api/applications', {
            body: { ...body, tenantId: 'B', positionTitle: 'Sahte' },
        });
        expect(ok.status).toBe(200);
        const saved = (await get(`tenants/B/applications/${ok.body.id}`)).data();
        expect(saved.positionTitle).toBe('B ilanı');
        expect((await db.collection('tenants/A/applications').get()).size).toBe(0);
    });
    it('salt okunur şirketin açık ilanı okunur ama başvuru yazılamaz (K5)', async () => {
        expect((await call('GET', '/api/positions/pc?tenantId=C')).status).toBe(200);
        const body = { positionId: 'pc', name: 'Aday', email: 'aday@x.test', phone: '1' };
        expect(
            (await call('POST', '/api/applications', { body: { ...body, tenantId: 'C' } })).status
        ).toBe(404);
        expect((await db.collection('tenants/C/applications').get()).size).toBe(0);
    });
    it("mülakat oturumu: B'nin oturumu A kimliğiyle bulunmaz", async () => {
        expect((await call('GET', '/api/session/iv-b1?tenantId=A')).status).toBe(404);
        expect((await call('GET', '/api/session/iv-b1?tenantId=B')).status).toBe(200);
        const upd = await call('POST', '/api/update-candidate-status', {
            body: {
                tenantId: 'A',
                sessionId: 'iv-b1',
                candidateId: 'b1',
                updates: { candidateStatus: 'x' },
            },
        });
        expect(upd.status).toBe(404);
    });
    it("yeni oturum açmak şirketin recruiter/admin'ine özel; anonim ve başka şirketin üyesi açamaz", async () => {
        const body = { tenantId: 'A', sessionId: 'iv-new1', initialData: { candidateId: 'a1' } };
        expect((await call('POST', '/api/init-interview-session', { body })).status).toBe(401);
        expect(
            (await call('POST', '/api/init-interview-session', { body, uid: 'anonX', anon: true }))
                .status
        ).toBe(403);
        expect(
            (await call('POST', '/api/init-interview-session', { body, uid: 'bAdmin' })).status
        ).toBe(403);
        expect((await get('tenants/A/interviews/iv-new1')).exists).toBe(false);
        expect(
            (await call('POST', '/api/init-interview-session', { body, uid: 'aAdmin' })).status
        ).toBe(200);
        expect((await get('tenants/A/interviews/iv-new1')).exists).toBe(true);
        expect((await get('tenants/B/interviews/iv-new1')).exists).toBe(false);
    });
    it("aday yanıtı: B'nin talebi A kimliğiyle 404, B'deki kayıt değişmez", async () => {
        const r = await call('POST', '/api/candidate-respond', {
            body: { tenantId: 'A', id: 'ir-b1', type: 'info', responseData: 'x' },
        });
        expect(r.status).toBe(404);
        expect((await get('tenants/B/infoRequests/ir-b1')).data().status).toBe('pending');
        const inv = await call('POST', '/api/candidate-respond', {
            body: { tenantId: 'A', id: 'iv-b1', type: 'invite', action: 'confirm' },
        });
        expect(inv.status).toBe(404);
        expect((await get('tenants/A/interviews/iv-b1')).exists).toBe(false);
    });
});

describe('şirket bilgisi (K6)', () => {
    it("B'nin elle girdiği kayıt A'ya dönmez; A ortak önbelleği görür", async () => {
        const a = await call('POST', '/api/company-intel/resolve', {
            uid: 'aAdmin',
            tenant: 'A',
            body: { name: 'Acme' },
        });
        expect(a.status).toBe(200);
        expect(a.body.source).toBe('cache');
        expect(JSON.stringify(a.body)).not.toContain('b-ozel');
        const b = await call('POST', '/api/company-intel/resolve', {
            uid: 'bAdmin',
            tenant: 'B',
            body: { name: 'ACME A.Ş.' },
        });
        expect(b.body.source).toBe('manual');
    });
    it('elle kayıt yalnız kendi şirketine yazılır; ortak önbellek değişmez', async () => {
        const r = await call('PUT', '/api/company-intel/manual', {
            uid: 'aAdmin',
            tenant: 'A',
            body: { name: 'Acme', record: { source: 'manual', website: 'a.test' } },
        });
        expect(r.status).toBe(200);
        expect((await get('tenants/A/companyIntelManual/acme')).data().website).toBe('a.test');
        expect((await get('platform/companyIntel/entries/acme')).data().answer.text).toBe('ortak');
        expect((await get('tenants/B/companyIntelManual/acme')).data().website).toBe('b-ozel.test');
    });
});

describe('toplu içe aktarma işçisi (collection group)', () => {
    it('yalnız şirket ağacındaki işi alır; eski ortak kökteki iş işlenmez', async () => {
        await db
            .doc('legacy/x/bulkImportJobs/old')
            .set({ status: 'queued', createdAt: new Date(0) });
        await db
            .doc('tenants/B/bulkImportJobs/jq')
            .set({ status: 'queued', createdAt: new Date(1) });
        const claimed = await claimNextQueuedJob();
        expect(claimed).toBe('tenants/B/bulkImportJobs/jq');
        expect((await get('legacy/x/bulkImportJobs/old')).data().status).toBe('queued');
        expect(await claimNextQueuedJob()).toBeNull();
    });
});
