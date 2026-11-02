// Şirket başına AI bütçesi — emülatöre bağlı uçtan uca (PR 7, K8).
//
// Gerçek Express yönlendiricileri + gerçek Firestore işlemleri (transaction).
// Bellek içi sahtenin (functions/services/aiQuota.test.js) göremediği şey:
// gerçek Firestore'un eşzamanlı işlemlerde koşul + artırımı birlikte tutması.
// Gemini'ye hiç gidilmez: kota reddi modelden ÖNCE gelir; geçen çağrılar için
// sahte anahtar yalnız "anahtar yok" kapısını geçmek için.
//
// Çalıştırma: npm run test:rules (emülatörleri açar; vitest.rules.config.js).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PROJECT = 'demo-talentflow-rules';

Object.assign(process.env, {
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
    STORAGE_EMULATOR_HOST: 'http://127.0.0.1:9199',
    FIREBASE_PROJECT_ID: PROJECT,
    GCLOUD_PROJECT: PROJECT,
    GEMINI_API_KEY: 'emulator-fake-key',
});
delete process.env.VITE_FIREBASE_PROJECT_ID;

let db;
let admin;
let server;
let base;
let reserveAi;
let buildAiContext;
let QuotaError;

const day = 24 * 60 * 60 * 1000;
const inDays = (n) => new Date(Date.now() + n * day);
const today = () => new Date().toISOString().slice(0, 10);

function token(uid, { provider = 'custom' } = {}) {
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

// Test bağlantı kimliği: 22 karakter base64url (sunucudaki biçim).
const L = (name) => name.padEnd(22, '0');

async function call(method, path, { uid, tenant, body, anon = false, link } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (uid) headers.Authorization = `Bearer ${token(uid, anon ? { provider: 'anonymous' } : {})}`;
    if (tenant) headers['X-Tenant-Id'] = tenant;
    if (link) headers['X-Public-Link'] = link;
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

beforeAll(async () => {
    await fetch(
        `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
        {
            method: 'DELETE',
        }
    );
    ({ db, admin } = await import('../../functions/config/firebaseAdmin.js'));
    ({ reserveAi, QuotaError } = await import('../../functions/services/aiQuota.js'));
    ({ buildAiContext } = await import('../../functions/services/aiContext.js'));
    const express = (await import('express')).default;
    const app = express();
    app.use(express.json());
    for (const mod of ['ai', 'screening', 'publicAi', 'admin', 'cv']) {
        app.use((await import(`../../functions/routes/${mod}.js`)).default);
    }
    await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;

    const T = (t) => `tenants/${t}`;
    const active = { status: 'active', writeUntil: inDays(365), readUntil: inDays(365) };
    const docs = {
        // A: bugünkü kotası DOLU (küçük sınır). B: boş. C: salt okunur.
        [T('A')]: { name: 'A', ...active, aiLimits: { dailyTokens: 10_000 } },
        [T('B')]: { name: 'B', ...active, aiLimits: { dailyTokens: 10_000 } },
        [T('C')]: { name: 'C', status: 'trial', writeUntil: inDays(-1), readUntil: inDays(13) },
        [T('P')]: {
            name: 'P',
            ...active,
            plan: 'active',
            talentPlan: 'baslangic',
            planLimits: { monthlyPrescreens: 0 },
        },
        [`${T('A')}/members/aAdmin`]: { role: 'admin', status: 'active', email: 'aAdmin@x.test' },
        [`${T('A')}/members/aRec`]: { role: 'recruiter', status: 'active', email: 'aRec@x.test' },
        [`${T('B')}/members/bRec`]: { role: 'recruiter', status: 'active' },
        [`${T('P')}/members/pRec`]: { role: 'recruiter', status: 'active' },
        [`${T('A')}/usage/${today()}`]: {
            day: today(),
            totals: { totalTokens: 10_000, calls: 3 },
            byUser: { aRec: { totalTokens: 10_000, calls: 3 } },
        },
        [`${T('A')}/positions/pa`]: {
            title: 'A ilanı',
            status: 'open',
            screeningQuestions: ['Neden biz?'],
        },
        [`${T('B')}/positions/pbClosed`]: {
            title: 'B kapalı',
            status: 'closed',
            screeningQuestions: ['?'],
        },
        [`${T('C')}/positions/pc`]: { title: 'C ilanı', status: 'open', screeningQuestions: ['?'] },
        // Herkese açık bağlantılar (aday AI uçları şirketi ve ilanı bunlardan alır).
        [`publicLinks/${L('posA')}`]: { tenantId: 'A', kind: 'position', targetId: 'pa' },
        [`publicLinks/${L('posBClosed')}`]: {
            tenantId: 'B',
            kind: 'position',
            targetId: 'pbClosed',
        },
        [`publicLinks/${L('posC')}`]: { tenantId: 'C', kind: 'position', targetId: 'pc' },
        [`publicLinks/${L('ivA')}`]: {
            tenantId: 'A',
            kind: 'interview',
            targetId: 'iv-a-0001',
            candidateId: 'x',
        },
    };
    const batch = db.batch();
    for (const [p, d] of Object.entries(docs)) batch.set(db.doc(p), d);
    await batch.commit();
    for (const uid of ['aAdmin', 'aRec', 'bRec', 'pRec', 'anonX', 'plat']) {
        await admin
            .auth()
            .createUser({ uid })
            .catch(() => {});
    }
}, 60_000);

afterAll(async () => {
    await new Promise((r) => (server ? server.close(r) : r()));
});

describe('serbest istem yalnız şirket üyesine', () => {
    it('anonim oturum /api/ai/generate ve /api/ai/ask açamaz (403)', async () => {
        for (const p of ['/api/ai/generate', '/api/ai/ask']) {
            const r = await call('POST', p, {
                uid: 'anonX',
                anon: true,
                tenant: 'B',
                body: { prompt: 'herhangi bir şey' },
            });
            expect(r.status).toBe(403);
        }
    });

    it("A'nın üyesi B başlığıyla AI çağıramaz (B'nin bütçesine yazamaz)", async () => {
        const r = await call('POST', '/api/ai/generate', {
            uid: 'aRec',
            tenant: 'B',
            body: { prompt: 'x' },
        });
        expect(r.status).toBe(403);
    });
});

describe('bütçe aşımı → 429, model çağrılmaz', () => {
    it('kotası dolu şirketin üyesi 429 + AI_DAILY_BUDGET_EXCEEDED + yenilenme zamanı alır', async () => {
        const r = await call('POST', '/api/ai/generate', {
            uid: 'aAdmin',
            tenant: 'A',
            body: { prompt: 'özetle' },
        });
        expect(r.status).toBe(429);
        expect(r.body.code).toBe('AI_DAILY_BUDGET_EXCEEDED');
        expect(r.body.error).toMatch(/03:00/);
        expect(r.body.resetAt).toMatch(/T00:00:00\.000Z$/);
    });

    it('A dolu iken B etkilenmez (ayırma B belgesine yazılır)', async () => {
        const ctx = buildAiContext({
            tenantId: 'B',
            uid: 'bRec',
            tenant: { aiLimits: { dailyTokens: 10_000 } },
        });
        const lease = await reserveAi(ctx, { estimate: 1000 });
        expect(lease.degraded).toBe(false);
        const b = (await db.doc(`tenants/B/usage/${today()}`).get()).data();
        expect(b.quota.reserved).toBeGreaterThanOrEqual(1000);
        const a = (await db.doc(`tenants/A/usage/${today()}`).get()).data();
        expect(a.quota?.reserved || 0).toBe(0);
    });

    it('GERÇEK FIRESTORE İŞLEMİ: 12 eşzamanlı ayırma, 5 çağrılık yer → tam 5 geçer', async () => {
        await db
            .doc('tenants/Q')
            .set({ name: 'Q', status: 'active', writeUntil: inDays(1), readUntil: inDays(1) });
        const ctx = buildAiContext({
            tenantId: 'Q',
            uid: 'q1',
            tenant: { aiLimits: { dailyTokens: 5_000, userSharePct: 100 } },
        });
        const results = await Promise.allSettled(
            Array.from({ length: 12 }, () => reserveAi(ctx, { estimate: 1000 }))
        );
        const ok = results.filter((r) => r.status === 'fulfilled');
        // Hiçbiri ölçümsüz (degraded) geçmez; çakışmada geçici RATE reddi
        // olabilir, ama ASLA 5'ten fazlası geçmez ve sayaç geçenlerle birebir.
        expect(ok.every((r) => !r.value.degraded)).toBe(true);
        expect(ok.length).toBeGreaterThanOrEqual(1);
        expect(ok.length).toBeLessThanOrEqual(5);
        expect(
            results
                .filter((r) => r.status === 'rejected')
                .every((r) => r.reason instanceof QuotaError)
        ).toBe(true);
        const q = (await db.doc(`tenants/Q/usage/${today()}`).get()).data();
        expect(q.quota.reserved).toBe(ok.length * 1000);
        // Ardından sırayla doldurulabilir: tam 5'e kadar, sonrası bütçe reddi.
        for (let i = ok.length; i < 5; i++) await reserveAi(ctx, { estimate: 1000 });
        const over = await reserveAi(ctx, { estimate: 1000 }).catch((e) => e);
        expect(over.code).toBe('AI_DAILY_BUDGET_EXCEEDED');
    });
});

describe('aday tarafı amaca özel uçlar — şirket ve ilan bağlantıdan', () => {
    const anon = { uid: 'anonX', anon: true };
    it('ön eleme puanı: kapalı ilan 404, salt okunur şirket 404, bağlantısız 404', async () => {
        const closed = await call('POST', '/api/score-screening-answers', {
            ...anon,
            link: L('posBClosed'),
            body: { answers: ['a'] },
        });
        expect(closed.status).toBe(404);
        const ro = await call('POST', '/api/score-screening-answers', {
            ...anon,
            link: L('posC'),
            body: { answers: ['a'] },
        });
        expect(ro.status).toBe(404);
        const none = await call('POST', '/api/score-screening-answers', {
            ...anon,
            body: { positionId: 'pa', answers: ['a'] },
        });
        expect(none.status).toBe(404);
        expect(none.body.code).toBe('LINK_REQUIRED');
    });

    it('aday şirketi X-Tenant-Id ya da gövdedeki tenantId ile SEÇEMEZ (eski yol kapalı)', async () => {
        for (const opts of [{ tenant: 'A' }, { body: { tenantId: 'A' } }]) {
            const r = await call('POST', '/api/public/apply/parse-cv', {
                ...anon,
                ...opts,
                body: { ...(opts.body || {}), positionId: 'pa', cvText: 'x'.repeat(100) },
            });
            expect(r.status).toBe(404);
        }
    });

    it('bağlantı türü uca uymalı: mülakat bağlantısıyla başvuru AI, ilan bağlantısıyla STT yok', async () => {
        const cv = await call('POST', '/api/public/apply/parse-cv', {
            ...anon,
            link: L('ivA'),
            body: { cvText: 'x'.repeat(100) },
        });
        expect(cv.status).toBe(404);
        const stt = await call('POST', '/api/ai/stt', {
            ...anon,
            link: L('posA'),
            body: { audio: 'AAAA', mimeType: 'audio/webm' },
        });
        expect(stt.status).toBe(404);
    });

    it('kotası dolu şirketin başvuru formu 429 alır (aday kovası); gövdedeki positionId ilanı değiştiremez', async () => {
        // A'nın aday kovası boş ama şirket toplamı dolu → şirket sınırı.
        const r = await call('POST', '/api/public/apply/parse-cv', {
            ...anon,
            link: L('posA'),
            body: { cvText: 'Deneyimli yazılım geliştirici. '.repeat(5) },
        });
        expect(r.status).toBe(429);
        // B'nin kapalı ilanını gövdeyle göstermek işe yaramaz: ilan bağlantının (pa).
        const body = await call('POST', '/api/public/apply/parse-cv', {
            ...anon,
            link: L('posA'),
            body: { positionId: 'pbClosed', cvText: 'x'.repeat(100) },
        });
        expect(body.status).toBe(429);
        // A başlığıyla B'nin kapalı ilan bağlantısı: şirket bağlantının (B), ilan kapalı → 404.
        const cross = await call('POST', '/api/public/apply/parse-cv', {
            ...anon,
            tenant: 'A',
            link: L('posBClosed'),
            body: { cvText: 'x'.repeat(100) },
        });
        expect(cross.status).toBe(404);
    });

    it('oturumu açık üye başvuru bağlantısını açınca da ilan bağlantıdan gelir (aday kovası)', async () => {
        // bRec B'nin üyesi; A'nın ilan bağlantısıyla çağırır → bağlantı yolu,
        // A'nın (dolu) bütçesi → 429. Bağlantı yolu kurulmasaydı positionId
        // olmadığı için 400 dönerdi.
        const r = await call('POST', '/api/public/apply/parse-cv', {
            uid: 'bRec',
            tenant: 'B',
            link: L('posA'),
            body: { cvText: 'Deneyimli yazılım geliştirici. '.repeat(5) },
        });
        expect(r.status).toBe(429);
        // Bağlantısız üye çağrısı üyelik kapısından geçer; ilan gövdeden.
        const m = await call('POST', '/api/public/apply/parse-cv', {
            uid: 'bRec',
            tenant: 'B',
            body: { cvText: 'x'.repeat(100) },
        });
        expect(m.status).toBe(400);
    });

    it('paket hakkı 0 olan şirkette CV ayrıştırma PLAN_LIMIT_REACHED ile durur', async () => {
        const r = await call('POST', '/api/direct-add', {
            uid: 'pRec',
            tenant: 'P',
            body: { text: 'CV metni '.repeat(20), url: 'https://x.test' },
        });
        expect(r.status).toBe(429);
        expect(r.body.code).toBe('PLAN_LIMIT_REACHED');
    });
});

describe('kullanım paneli ve platform sınırları', () => {
    it('şirket yöneticisi kendi kotasını, kalanını ve kişi paylarını görür', async () => {
        const r = await call('GET', '/api/admin/usage', { uid: 'aAdmin', tenant: 'A' });
        expect(r.status).toBe(200);
        expect(r.body.limits.tokens).toBe(10_000);
        expect(r.body.quota.remaining).toBe(0);
        expect(r.body.quota.users[0]).toMatchObject({
            key: 'aRec',
            label: 'aRec@x.test',
            tokens: 10_000,
        });
        expect(r.body.plan.plan).toBe('trial');
    });

    it('recruiter paneli açamaz; platform yöneticisi olmayan sınır yazamaz', async () => {
        expect((await call('GET', '/api/admin/usage', { uid: 'aRec', tenant: 'A' })).status).toBe(
            403
        );
        const w = await call('PUT', '/api/platform/tenants/A/limits', {
            uid: 'aAdmin',
            tenant: 'A',
            body: { plan: 'kurumsal' },
        });
        expect(w.status).toBe(403);
    });
});
