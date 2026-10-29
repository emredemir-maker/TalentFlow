// Firestore kuralları — çok şirketli model (docs/coklu-sirket-plani.md §3.1, §3.3).
//
// Üç katman:
//   1. Matris (tests/rules/matrix.js): her şirket koleksiyonu × her kimlik ×
//      {get, list, create, update, delete}, A şirketine karşı. B üyeleri, üye
//      olmayanlar, anonim ve kimliksiz için de aynı tablo → şirketler arası
//      okuma/yazma reddi her koleksiyonda sınanıyor.
//   2. Şirket durumu (K5): salt okunur (C), kapalı (D), askıda (E).
//   3. Kritik durumlar: departman süzgeci, üyelik kurcalama, destek süresi,
//      anonim aday, platform belgeleri, eski kök, jetondaki `role` talebi.
import { readFileSync } from 'node:fs';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createEnv, ctxFor, strictCtx, anonCtx, unauthCtx, seed, allow, deny } from './helpers.js';
import {
    TENANTS,
    IDENTITIES,
    MATRIX_IDENTITIES,
    COLLECTIONS,
    RULE_NAMES_COVERED_ELSEWHERE,
    inDays,
} from './matrix.js';

let env;

const T = (t) => `tenants/${t}`;
const collPath = (t, c) => `${T(t)}/${COLLECTIONS[c].path}`;
const existingId = (c) => COLLECTIONS[c].existingId || 'existing';

function memberDoc(uid, m) {
    const doc = {
        uid,
        email: `${uid}@example.test`,
        role: m.role,
        departments: m.departments || [],
        status: m.status || 'active',
        hubRole: 'member',
    };
    if (m.expiresAt) doc.expiresAt = m.expiresAt;
    return doc;
}

function seedDocs() {
    const docs = {};
    for (const [t, data] of Object.entries(TENANTS)) {
        docs[T(t)] = data;
        for (const [c, def] of Object.entries(COLLECTIONS)) {
            if (c === 'members') continue;
            docs[`${collPath(t, c)}/${existingId(c)}`] = def.doc;
            for (const key of Object.keys(IDENTITIES))
                docs[`${collPath(t, c)}/del-${key}`] = def.doc;
        }
        docs[`${T(t)}/bulkImportJobs/j-1`] = { status: 'done' };
        docs[`${T(t)}/positions/open`] = { title: 'Açık ilan', status: 'open' };
        docs[`${T(t)}/settings/system`] = { retentionDays: 365 };
        docs[`${T(t)}/settings/branding`] = { orgName: data.name };
        docs[`${T(t)}/settings/api_keys`] = { gemini: 'sır' };
        docs[`${T(t)}/candidates/c-eng`] = { name: 'Eng aday', department: 'Eng' };
        docs[`${T(t)}/candidates/c-shared`] = {
            name: 'Paylaşılan',
            department: 'Sales',
            visibleToDepartments: ['Eng'],
        };
        docs[`${T(t)}/interviews/s-1`] = { candidateId: 'c-eng', transcript: [], aiAnalysis: null };
    }
    for (const [key, id] of Object.entries(IDENTITIES)) {
        for (const [t, m] of Object.entries(id.memberships || {})) {
            docs[`${T(t)}/members/${key}`] = memberDoc(key, m);
            docs[`${T(t)}/members/${key}/preferences/ui`] = { theme: 'dark' };
        }
    }
    // Silme denemeleri için üyelik belgeleri.
    for (const key of Object.keys(IDENTITIES)) {
        docs[`${T('A')}/members/del-${key}`] = memberDoc(`del-${key}`, { role: 'recruiter' });
    }
    docs['userTenants/aAdmin'] = { tenants: { A: { name: 'Şirket A', role: 'admin' } } };
    docs['publicLinks/l-1'] = { tenantId: 'A', kind: 'interview', targetId: 's-1' };
    docs['platform/config'] = { aiCap: 1 };
    docs['platform/secrets'] = { gemini: 'sır' };
    docs['platform/companyIntel/items/ci-1'] = { name: 'Acme' };
    docs['platformUsage/2026-10-29'] = { tokens: 1 };
    // Eski ortak kök: eski düzende super_admin olan bir profil de dahil.
    const L = 'artifacts/talent-flow/public/data';
    docs[`${L}/users/aAdmin`] = { uid: 'aAdmin', role: 'super_admin' };
    docs[`${L}/candidates/old-1`] = { name: 'Eski aday' };
    docs[`${L}/positions/old-p`] = { status: 'open' };
    docs[`${L}/settings/system`] = { allowedDomains: ['example.test'] };
    docs['interviews/old-s'] = { candidateId: 'old-1' };
    return docs;
}

beforeAll(async () => {
    env = await createEnv();
    await env.clearFirestore();
    await seed(env, seedDocs());
});

afterAll(async () => {
    await env?.cleanup();
});

const dbFor = (key) => ctxFor(env, key, IDENTITIES[key]).firestore();

function attempt(db, tenant, c, op, key) {
    const def = COLLECTIONS[c];
    const coll = db.collection(collPath(tenant, c));
    switch (op) {
        case 'get':
            return coll.doc(existingId(c)).get();
        case 'list':
            return coll.get();
        case 'create':
            return coll.doc(`new-${key}`).set(def.createData ? def.createData(key) : { name: 'x' });
        case 'update':
            return coll.doc(existingId(c)).update(def.update || { touched: key });
        case 'delete':
            return coll.doc(`del-${key}`).delete();
        default:
            throw new Error(op);
    }
}

const OPS = ['get', 'list', 'create', 'update', 'delete'];

// ── 0. Tablo kuralları kapsıyor mu ───────────────────────────────────────────
describe('matris kapsamı', () => {
    it('firestore.rules şirket bloğundaki her koleksiyonun matriste satırı var (ve tersi)', () => {
        const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
        const start = rules.indexOf('TENANT KOLEKSİYONLARI BAŞI');
        const end = rules.indexOf('TENANT KOLEKSİYONLARI SONU');
        expect(start).toBeGreaterThan(0);
        expect(end).toBeGreaterThan(start);
        const names = [...rules.slice(start, end).matchAll(/match \/(\{?\w+\}?)\//g)].map(
            (m) => m[1]
        );
        const missing = names.filter(
            (n) => !(n in COLLECTIONS) && !RULE_NAMES_COVERED_ELSEWHERE.includes(n)
        );
        expect(missing).toEqual([]);
        expect(Object.keys(COLLECTIONS).filter((c) => !names.includes(c))).toEqual([]);
    });
});

// ── 1. Matris: her koleksiyon × her kimlik × her işlem (A şirketi) ───────────
describe('matris — A şirketi', () => {
    for (const [c, def] of Object.entries(COLLECTIONS)) {
        describe(c, () => {
            for (const key of MATRIX_IDENTITIES) {
                const expected = OPS.map(
                    (op) => `${op}:${def.ops[op].includes(key) ? '✓' : '✗'}`
                ).join(' ');
                it(`${key} → ${expected}`, async () => {
                    const db = dbFor(key);
                    for (const op of OPS) {
                        const p = attempt(db, 'A', c, op, key);
                        if (def.ops[op].includes(key)) await allow(p);
                        else await deny(p);
                    }
                });
            }
        });
    }

    it('olumlu denetim: B üyesi kendi şirketinde okur ve yazar', async () => {
        await allow(
            dbFor('bRecruiter')
                .doc(`${collPath('B', 'candidates')}/existing`)
                .get()
        );
        await allow(dbFor('bRecruiter').collection(collPath('B', 'candidates')).get());
        await allow(
            dbFor('bAdmin')
                .doc(`${collPath('B', 'departments')}/new-b`)
                .set({ name: 'x' })
        );
    });

    it('iki şirkette üye: rol ve departman şirket başına', async () => {
        // multi: B'de admin, A'da Eng departmanlı department_user.
        await allow(
            dbFor('multi')
                .doc(`${collPath('B', 'settings')}/emailTemplates`)
                .set({ a: 2 })
        );
        await deny(
            dbFor('multi')
                .doc(`${collPath('A', 'settings')}/emailTemplates`)
                .set({ a: 2 })
        );
        await allow(
            dbFor('multi')
                .doc(`${T('B')}/candidates/existing`)
                .get()
        );
        await deny(
            dbFor('multi')
                .doc(`${T('A')}/candidates/existing`)
                .get()
        );
        await allow(
            dbFor('multi')
                .doc(`${T('A')}/candidates/c-eng`)
                .get()
        );
    });
});

// ── 2. Şirket durumu (K5) ────────────────────────────────────────────────────
describe('şirket durumu', () => {
    // C (yazma süresi geçmiş) ve F (durumu "readonly") şirketlerindeki
    // admin/recruiter, A'daki aynı roldeki kimlikle aynı okuma hakkına sahip;
    // hiçbir yazma geçmez (accessLogs ekleme hariç: okumalar kaydedilir).
    const readOnly = [
        ['cAdmin', 'C', 'aAdmin'],
        ['cRecruiter', 'C', 'aRecruiter'],
        ['fAdmin', 'F', 'aAdmin'],
    ];
    for (const [key, t, aTwin] of readOnly) {
        it(`salt okunur şirket (${t}): ${key} okur, yazamaz`, async () => {
            const db = dbFor(key);
            for (const [c, def] of Object.entries(COLLECTIONS)) {
                // members satırı aDeptNone'un belgesini hedefliyor; burada yok.
                if (c === 'members') continue;
                for (const op of ['get', 'list']) {
                    const p = attempt(db, t, c, op, key);
                    if (def.ops[op].includes(aTwin)) await allow(p);
                    else await deny(p);
                }
                for (const op of ['create', 'update', 'delete']) {
                    const p = attempt(db, t, c, op, key);
                    if (c === 'accessLogs' && op === 'create') await allow(p);
                    else await deny(p);
                }
            }
            await allow(db.collection(`${T(t)}/members`).get());
            await deny(db.doc(`${T(t)}/members/${key}`).update({ displayName: 'x' }));
            await deny(db.doc(`${T(t)}/members/${key}/preferences/ui`).set({ a: 1 }));
        });
    }

    it('salt okunur şirket (C, F): aday mülakat transkriptini de yazamaz, okur', async () => {
        await deny(
            dbFor('anon')
                .doc(`${T('F')}/interviews/s-1`)
                .update({ transcript: ['x'] })
        );
        await deny(
            dbFor('anon')
                .doc(`${T('C')}/interviews/s-1`)
                .update({ transcript: ['x'] })
        );
        await allow(
            dbFor('anon')
                .doc(`${T('C')}/interviews/s-1`)
                .get()
        );
    });

    for (const [key, t, label] of [
        ['dAdmin', 'D', 'kapalı (D)'],
        ['eAdmin', 'E', 'askıdaki (E)'],
    ]) {
        it(`${label} şirket: ${key} hiçbir şeyi okuyamaz, yazamaz`, async () => {
            const db = dbFor(key);
            for (const c of Object.keys(COLLECTIONS)) {
                for (const op of OPS) await deny(attempt(db, t, c, op, key));
            }
            await deny(db.collection(`${T(t)}/members`).get());
            await deny(db.doc(`${T(t)}/members/${key}/preferences/ui`).get());
        });
        it(`${label} şirket: herkese açık yetki anahtarı okumaları da kapalı`, async () => {
            await deny(
                dbFor('anon')
                    .doc(`${T(t)}/interviews/s-1`)
                    .get()
            );
            await deny(
                dbFor('unauth')
                    .doc(`${T(t)}/infoRequests/existing`)
                    .get()
            );
            await deny(
                dbFor('anon')
                    .doc(`${T(t)}/positions/open`)
                    .get()
            );
            await deny(
                dbFor('anon')
                    .collection(`${T(t)}/sources`)
                    .get()
            );
        });
        it(`${label} şirket: üye şirket belgesini yine görür (durumu göstermek için)`, async () => {
            await allow(dbFor(key).doc(T(t)).get());
        });
    }

    it('şirket belgesi olmayan yol: üyelik belgesi olsa da reddedilir', async () => {
        await seed(env, {
            [`${T('ghost')}/members/ghostAdmin`]: memberDoc('ghostAdmin', { role: 'admin' }),
        });
        const db = strictCtx(env, 'ghostAdmin').firestore();
        await deny(db.collection(`${T('ghost')}/candidates`).get());
        await deny(db.doc(`${T('ghost')}/candidates/x`).set({ name: 'x' }));
    });
});

// ── 3. Kritik durumlar ───────────────────────────────────────────────────────
describe('şirket belgesi', () => {
    it('üye kendi şirketini okur; başka şirketi ve listeyi okuyamaz; kimse yazamaz', async () => {
        await allow(dbFor('aDept').doc(T('A')).get());
        await deny(dbFor('aDept').doc(T('B')).get());
        await deny(dbFor('aAdmin').collection('tenants').get());
        await deny(
            dbFor('aAdmin')
                .doc(T('A'))
                .update({ status: 'active', writeUntil: inDays(9999) })
        );
        await deny(dbFor('nonMember').doc(T('Z')).set({ status: 'active' }));
        await deny(dbFor('aRemoved').doc(T('A')).get());
    });
});

describe('departman süzgeci', () => {
    const cands = (key) => dbFor(key).collection(`${T('A')}/candidates`);
    it('department_user süzgeçsiz listeleyemez', async () => {
        await deny(cands('aDept').get());
        await deny(cands('aDeptClaim').get());
    });
    it('kendi departmanı süzgeciyle listeler; başka departman süzgeciyle reddedilir', async () => {
        await allow(cands('aDept').where('department', 'in', ['Eng']).get());
        await deny(cands('aDept').where('department', 'in', ['Sales']).get());
        await deny(cands('aDept').where('department', 'in', ['Eng', 'Sales']).get());
    });
    it('kendi departmanına açılmış adayları listeler (visibleToDepartments)', async () => {
        const snap = await allow(
            cands('aDept').where('visibleToDepartments', 'array-contains-any', ['Eng']).get()
        );
        expect(snap.docs.map((d) => d.id)).toEqual(['c-shared']);
        await deny(
            cands('aDept').where('visibleToDepartments', 'array-contains-any', ['Sales']).get()
        );
    });
    it('tekil okuma: kendi departmanı ve açılmış aday evet, diğeri hayır', async () => {
        await allow(
            dbFor('aDept')
                .doc(`${T('A')}/candidates/c-eng`)
                .get()
        );
        await allow(
            dbFor('aDept')
                .doc(`${T('A')}/candidates/c-shared`)
                .get()
        );
        await deny(
            dbFor('aDept')
                .doc(`${T('A')}/candidates/existing`)
                .get()
        );
    });
    it('departmansız department_user hiçbir aday görmez (K2)', async () => {
        await deny(
            dbFor('aDeptNone')
                .doc(`${T('A')}/candidates/c-eng`)
                .get()
        );
        await deny(cands('aDeptNone').where('department', 'in', ['Eng']).get());
    });
});

describe('üyelik kurcalama', () => {
    const me = (key) => dbFor(key).doc(`${T('A')}/members/${key}`);
    it('kendi rolünü, departmanını, durumunu, süresini, e-postasını değiştiremez', async () => {
        await deny(me('aDept').update({ role: 'admin' }));
        await deny(me('aDept').update({ departments: ['Eng', 'Sales'] }));
        await deny(me('aRecruiter').update({ role: 'admin' }));
        await deny(me('aSupport').update({ expiresAt: inDays(365) }));
        await deny(me('aDept').update({ email: 'boss@example.test' }));
        await deny(me('aDept').update({ hubRole: 'tenant_admin' }));
        await deny(me('aDept').set(memberDoc('aDept', { role: 'admin' })));
        await deny(me('aDept').delete());
    });
    it('izinli alanları değiştirir; destek üyesi (salt okunur) değiştiremez', async () => {
        await allow(me('aDept').update({ displayName: 'Yeni ad' }));
        await deny(me('aSupport').update({ displayName: 'Destek' }));
    });
    it('üyeliği kaldırılmış kişi kendi belgesini yeniden etkinleştiremez, okuyamaz', async () => {
        await deny(me('aRemoved').update({ status: 'active' }));
        await deny(me('aRemoved').get());
    });
    it('kendine üyelik açamaz: ne başka şirkette ne üye olmadığı şirkette', async () => {
        await deny(
            dbFor('aAdmin')
                .doc(`${T('B')}/members/aAdmin`)
                .set(memberDoc('aAdmin', { role: 'admin' }))
        );
        await deny(
            dbFor('nonMember')
                .doc(`${T('A')}/members/nonMember`)
                .set(memberDoc('nonMember', { role: 'admin' }))
        );
        await deny(
            dbFor('anon')
                .doc(`${T('A')}/members/anon`)
                .set(memberDoc('anon', { role: 'admin' }))
        );
    });
    it('admin bile başkasının rolünü istemciden değiştiremez (yalnız sunucu)', async () => {
        await deny(
            dbFor('aAdmin')
                .doc(`${T('A')}/members/aDept`)
                .update({ role: 'recruiter' })
        );
        await deny(
            dbFor('aAdmin')
                .doc(`${T('A')}/members/aDept`)
                .delete()
        );
    });
    it('alt koleksiyon: yalnız sahibi; eşleşme üyelik belgesinin kendisini kapsamaz', async () => {
        await allow(
            dbFor('aDept')
                .doc(`${T('A')}/members/aDept/preferences/ui`)
                .get()
        );
        await allow(
            dbFor('aDept')
                .doc(`${T('A')}/members/aDept/assistantChats/c1`)
                .set({ m: 'x' })
        );
        await deny(
            dbFor('aAdmin')
                .doc(`${T('A')}/members/aDept/preferences/ui`)
                .get()
        );
        await deny(
            dbFor('bAdmin')
                .doc(`${T('A')}/members/bAdmin/preferences/ui`)
                .set({ a: 1 })
        );
        await deny(
            dbFor('aRemoved')
                .doc(`${T('A')}/members/aRemoved/preferences/ui`)
                .get()
        );
        // Destek üyesi kendi alt koleksiyonunu okur ama yazamaz.
        await allow(
            dbFor('aSupport')
                .doc(`${T('A')}/members/aSupport/preferences/ui`)
                .get()
        );
        await deny(
            dbFor('aSupport')
                .doc(`${T('A')}/members/aSupport/preferences/ui`)
                .set({ a: 1 })
        );
    });
});

describe('destek üyeliği (K11)', () => {
    it('süre içinde okur, hiçbir şey yazamaz; süresi dolunca hiçbir şey okuyamaz', async () => {
        await allow(
            dbFor('aSupport')
                .collection(`${T('A')}/candidates`)
                .get()
        );
        await deny(
            dbFor('aSupport')
                .doc(`${T('A')}/candidates/existing`)
                .update({ note: 'x' })
        );
        await deny(
            dbFor('aSupportExpired')
                .collection(`${T('A')}/candidates`)
                .get()
        );
        await deny(dbFor('aSupportExpired').doc(T('A')).get());
    });
    it('okumalarını denetim defterine yazar ama defteri okuyamaz', async () => {
        await allow(
            dbFor('aSupport')
                .collection(`${T('A')}/accessLogs`)
                .add({ uid: 'aSupport' })
        );
        await deny(
            dbFor('aSupport')
                .collection(`${T('A')}/accessLogs`)
                .get()
        );
        await deny(
            dbFor('aSupport')
                .collection(`${T('A')}/accessLogs`)
                .add({ uid: 'aAdmin' })
        );
    });
});

describe('anonim aday', () => {
    it('açık ilanı okur; kapalı ilanı ve listeyi okuyamaz', async () => {
        await allow(
            dbFor('anon')
                .doc(`${T('A')}/positions/open`)
                .get()
        );
        await allow(
            dbFor('unauth')
                .doc(`${T('A')}/positions/open`)
                .get()
        );
        await deny(
            dbFor('anon')
                .doc(`${T('A')}/positions/existing`)
                .get()
        );
        await deny(
            dbFor('anon')
                .collection(`${T('A')}/positions`)
                .get()
        );
    });
    it('aday ve başvuru oluşturamaz (yalnız sunucu)', async () => {
        await deny(
            dbFor('anon')
                .collection(`${T('A')}/candidates`)
                .add({ name: 'x' })
        );
        await deny(
            dbFor('anon')
                .collection(`${T('A')}/applications`)
                .add({ positionId: 'open' })
        );
        await deny(
            dbFor('aRecruiter')
                .collection(`${T('A')}/applications`)
                .add({ positionId: 'open' })
        );
    });
    it('mülakat transkriptini yazar; korumalı alanlara dokunamaz; oturum açamaz', async () => {
        const s = dbFor('anon').doc(`${T('A')}/interviews/s-1`);
        await allow(s.update({ transcript: ['merhaba'] }));
        for (const field of [
            'aiAnalysis',
            'aggregateScore',
            'questions',
            'currentQuestionIndex',
            'candidateId',
        ]) {
            await deny(s.update({ [field]: 1 }));
        }
        await allow(
            dbFor('aRecruiter')
                .doc(`${T('A')}/interviews/s-1`)
                .update({ aiAnalysis: { score: 50 } })
        );
        await deny(
            dbFor('anon')
                .doc(`${T('A')}/interviews/s-new`)
                .set({ candidateId: 'x' })
        );
        await deny(
            dbFor('anon')
                .doc(`${T('A')}/interviews/s-1`)
                .delete()
        );
    });
    it('kaynak listesi dışında şirket verisi göremez', async () => {
        await allow(
            dbFor('anon')
                .collection(`${T('A')}/sources`)
                .get()
        );
        await deny(
            dbFor('anon')
                .doc(`${T('A')}/settings/branding`)
                .get()
        );
        await deny(
            dbFor('anon')
                .collection(`${T('A')}/infoRequests`)
                .get()
        );
        await deny(
            dbFor('anon')
                .collection(`${T('A')}/interviews`)
                .get()
        );
        await deny(
            dbFor('anon')
                .doc(`${T('A')}/candidates/c-eng`)
                .get()
        );
    });
});

describe('ayarlar', () => {
    it('system/branding her üyeye; diğerleri tam okuyuculara; sırlar kimseye', async () => {
        await allow(
            dbFor('aDeptNone')
                .doc(`${T('A')}/settings/system`)
                .get()
        );
        await allow(
            dbFor('aDept')
                .doc(`${T('A')}/settings/branding`)
                .get()
        );
        await deny(
            dbFor('bAdmin')
                .doc(`${T('A')}/settings/branding`)
                .get()
        );
        await deny(
            dbFor('aAdmin')
                .doc(`${T('A')}/settings/api_keys`)
                .get()
        );
        await deny(
            dbFor('aAdmin')
                .doc(`${T('A')}/settings/api_keys`)
                .set({ gemini: 'x' })
        );
        await deny(
            dbFor('aAdmin')
                .doc(`${T('A')}/settings/integrations`)
                .set({ clientSecret: 'x' })
        );
    });
});

describe('platform ve köprü belgeleri', () => {
    it('userTenants: yalnız kendi belgesi okunur; liste ve yazma kapalı', async () => {
        await allow(dbFor('aAdmin').doc('userTenants/aAdmin').get());
        await deny(dbFor('aRecruiter').doc('userTenants/aAdmin').get());
        await deny(dbFor('anon').doc('userTenants/anon').get());
        await deny(dbFor('aAdmin').collection('userTenants').get());
        await deny(
            dbFor('aAdmin')
                .doc('userTenants/aAdmin')
                .set({ tenants: { B: { role: 'admin' } } })
        );
    });
    it('publicLinks, platform/*, platformUsage: istemciye tamamen kapalı', async () => {
        for (const key of ['aAdmin', 'claimAdmin', 'anon', 'unauth']) {
            const db = dbFor(key);
            await deny(db.doc('publicLinks/l-1').get());
            await deny(db.collection('publicLinks').get());
            await deny(db.doc('publicLinks/l-2').set({ tenantId: 'A' }));
            await deny(db.doc('platform/config').get());
            await deny(db.doc('platform/secrets').get());
            await deny(db.doc('platform/companyIntel/items/ci-1').get());
            await deny(db.doc('platform/config').set({ aiCap: 999 }));
            await deny(db.doc('platformUsage/2026-10-29').get());
        }
    });
});

describe('eski ortak kök (K10)', () => {
    const L = 'artifacts/talent-flow/public/data';
    it('herkes için kapalı — eski super_admin profili ve jeton talebi dahil', async () => {
        for (const key of ['aAdmin', 'claimAdmin', 'nonMember', 'anon', 'unauth']) {
            const db = dbFor(key);
            await deny(db.doc(`${L}/users/aAdmin`).get());
            await deny(db.doc(`${L}/candidates/old-1`).get());
            await deny(db.collection(`${L}/candidates`).get());
            await deny(db.doc(`${L}/positions/old-p`).get());
            await deny(db.doc(`${L}/settings/system`).get());
            await deny(db.doc(`${L}/candidates/new`).set({ name: 'x' }));
            await deny(db.doc(`${L}/users/${key}`).set({ uid: key, role: 'recruiter' }));
            await deny(db.doc('interviews/old-s').get());
            await deny(db.collection('interviews').get());
            await deny(db.doc('interviews/new').set({ candidateId: 'x' }));
        }
    });
});

describe('jetondaki `role` talebine güvenilmez', () => {
    it('super_admin talepli, üye olmayan oturum A verisine erişemez', async () => {
        const db = dbFor('claimAdmin');
        await deny(db.collection(`${T('A')}/candidates`).get());
        await deny(db.doc(T('A')).get());
        await deny(db.doc(`${T('A')}/settings/emailTemplates`).set({ a: 1 }));
    });
    it('super_admin talepli department_user, department_user gibi davranır', async () => {
        const db = dbFor('aDeptClaim');
        await deny(db.collection(`${T('A')}/candidates`).get());
        await deny(db.doc(`${T('A')}/candidates/existing`).update({ note: 'x' }));
        await deny(db.doc(`${T('A')}/departments/new-claim`).set({ name: 'x' }));
    });
});

describe('başka şirketin verisi', () => {
    it('A üyeleri B’nin aday/ilan/ayar/üye/defter belgelerine get ve list yapamaz', async () => {
        for (const key of ['aAdmin', 'aRecruiter', 'aSupport', 'aDept']) {
            const db = dbFor(key);
            for (const c of [
                'candidates',
                'positions',
                'settings',
                'members',
                'accessLogs',
                'emailThreads',
            ]) {
                await deny(db.doc(`${collPath('B', c)}/${existingId(c)}`).get());
                await deny(db.collection(collPath('B', c)).get());
            }
        }
    });
    it('mülakat belgesi: B üyesi anonimden fazlasını alamaz (liste, korumalı alan, oluşturma)', async () => {
        const db = dbFor('bAdmin');
        await deny(db.collection(`${T('A')}/interviews`).get());
        await deny(db.doc(`${T('A')}/interviews/s-1`).update({ aiAnalysis: { score: 100 } }));
        await deny(db.doc(`${T('A')}/interviews/s-2`).set({ candidateId: 'x' }));
    });
    it('kimliksiz istek hiçbir yazma yapamaz; anonim kendine üyelik açamaz', async () => {
        await deny(
            unauthCtx(env)
                .firestore()
                .doc(`${T('A')}/interviews/s-1`)
                .update({ transcript: ['x'] })
        );
        await deny(
            anonCtx(env, 'x')
                .firestore()
                .doc(`${T('A')}/members/x`)
                .set({ role: 'admin', status: 'active' })
        );
    });
});
