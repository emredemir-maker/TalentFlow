// Firestore kuralları — BUGÜNKÜ davranışın sabitlenmesi (çok şirketli geçiş, PR 0).
//
// Bu dosya kuralları DEĞİŞTİRMEZ, yalnızca bugün ne yaptıklarını yazılı hâle
// getirir: kurallar yeniden yazılırken (PR 1) neyin bilerek değiştiğini, neyin
// kazara bozulduğunu ayırt edebilmek için. Bazı beklentiler bugünkü zayıflıkları
// da sabitliyor (ör. jetondaki `role` talebine güven, anonimin her adayı tekil
// okuyabilmesi); onlar "BUGÜN" notuyla işaretli ve PR 1'de tersine döner.
import { describe, it, beforeAll, afterAll } from 'vitest';
import { createEnv, strictCtx, anonCtx, unauthCtx, seed, allow, deny } from './helpers.js';

const D = 'artifacts/talent-flow/public/data';

let env;

// Kimlikler: profil belgesi D/users/{uid} içinde tohumlanır.
const U = {
    superAdmin: 'u-super',
    recruiter: 'u-rec',
    dept: 'u-dept', // departments: ['Eng']
    deptNone: 'u-dept-none', // departmansız department_user
    noProfile: 'u-noprofile', // oturum var, profil yok
};

beforeAll(async () => {
    env = await createEnv();
    await env.clearFirestore();
    await seed(env, {
        [`${D}/users/${U.superAdmin}`]: {
            uid: U.superAdmin,
            role: 'super_admin',
            email: `${U.superAdmin}@example.test`,
        },
        [`${D}/users/${U.recruiter}`]: {
            uid: U.recruiter,
            role: 'recruiter',
            email: `${U.recruiter}@example.test`,
        },
        [`${D}/users/${U.dept}`]: {
            uid: U.dept,
            role: 'department_user',
            departments: ['Eng'],
            email: `${U.dept}@example.test`,
        },
        [`${D}/users/${U.deptNone}`]: {
            uid: U.deptNone,
            role: 'department_user',
            email: `${U.deptNone}@example.test`,
        },
        [`${D}/settings/system`]: { allowedDomains: ['allowed.test'] },
        [`${D}/settings/branding`]: { logoUrl: 'x' },
        [`${D}/settings/emailTemplates`]: { a: 1 },
        [`${D}/settings/api_keys`]: { gemini: 'secret' },
        [`${D}/settings/integrations`]: { clientSecret: 'secret' },
        [`${D}/invitations/inv-1`]: {
            email: 'invitee@example.test',
            role: 'department_user',
            departments: ['Eng'],
            status: 'pending',
        },
        [`${D}/positions/p-open`]: { status: 'open', title: 'Açık' },
        [`${D}/positions/p-closed`]: { status: 'closed', title: 'Kapalı' },
        [`${D}/applications/a-1`]: { positionId: 'p-open', email: 'c@example.test' },
        [`${D}/candidates/c-eng`]: { name: 'Eng aday', department: 'Eng' },
        [`${D}/candidates/c-sales`]: { name: 'Sales aday', department: 'Sales' },
        [`${D}/candidates/c-shared`]: {
            name: 'Paylaşılan',
            department: 'Sales',
            visibleToDepartments: ['Eng'],
        },
        [`${D}/integrationSecrets/${U.recruiter}`]: { enc: 'x' },
        [`${D}/departments/d-eng`]: { name: 'Eng' },
        [`${D}/sources/s-1`]: { name: 'LinkedIn', createdAt: 1 },
        [`${D}/companyIntel/ci-1`]: { name: 'Acme' },
        [`${D}/infoRequests/ir-1`]: { candidateId: 'c-eng' },
        [`${D}/emailThreads/t-1`]: { recruiterId: U.recruiter },
        [`${D}/messageQueue/m-1`]: { to: 'x' },
        [`${D}/participantInvites/pi-1`]: { participantIds: [U.dept] },
        [`${D}/bulkImportJobs/j-1`]: { createdBy: U.recruiter, status: 'done' },
        [`${D}/bulkImportJobs/j-1/items/i-1`]: { text: 'ham CV' },
        [`${D}/accessLogs/l-1`]: { uid: U.recruiter },
        [`${D}/usage/2026-10-29`]: { tokens: 1 },
        [`interviews/s-1`]: { candidateId: 'c-eng', transcript: [], aiAnalysis: null },
        [`elsewhere/x`]: { a: 1 },
    });
});

afterAll(async () => {
    await env?.cleanup();
});

const db = (ctx) => ctx.firestore();
const as = (uid, claims) => db(strictCtx(env, uid, claims));
const anon = () => db(anonCtx(env));
const unauth = () => db(unauthCtx(env));

describe('positions (genel ilan panosu)', () => {
    it('kimliksiz ziyaretçi açık ve kapalı ilanı okur, listeler (BUGÜN)', async () => {
        await allow(unauth().doc(`${D}/positions/p-open`).get());
        await allow(unauth().doc(`${D}/positions/p-closed`).get());
        await allow(unauth().collection(`${D}/positions`).get());
    });
    it('yalnız recruiter yazar', async () => {
        await allow(as(U.recruiter).doc(`${D}/positions/p-new`).set({ status: 'open' }));
        await deny(as(U.dept).doc(`${D}/positions/p-new2`).set({ status: 'open' }));
        await deny(anon().doc(`${D}/positions/p-new3`).set({ status: 'open' }));
        await deny(as(U.noProfile).doc(`${D}/positions/p-new4`).set({ status: 'open' }));
    });
    it('jetondaki role=recruiter talebi profilsiz yazdırır (BUGÜN — PR 1 kaldırır)', async () => {
        await allow(
            as(U.noProfile, { role: 'recruiter' })
                .doc(`${D}/positions/p-claim`)
                .set({ status: 'open' })
        );
    });
});

describe('applications', () => {
    it('kimliksiz başvuru oluşturur ama okuyamaz', async () => {
        await allow(unauth().collection(`${D}/applications`).add({ positionId: 'p-open' }));
        await deny(unauth().doc(`${D}/applications/a-1`).get());
        await deny(anon().collection(`${D}/applications`).get());
    });
    it('recruiter okur ve yönetir; department_user okuyamaz', async () => {
        await allow(as(U.recruiter).collection(`${D}/applications`).get());
        await allow(as(U.recruiter).doc(`${D}/applications/a-1`).update({ seen: true }));
        await deny(as(U.dept).doc(`${D}/applications/a-1`).get());
    });
});

describe('candidates', () => {
    it('anonim oturum aday oluşturur ve herhangi bir adayı tekil okur (BUGÜN — PR 1 kapatır)', async () => {
        await allow(anon().collection(`${D}/candidates`).add({ name: 'x' }));
        await allow(anon().doc(`${D}/candidates/c-sales`).get());
    });
    it('anonim liste ve kimliksiz okuma reddedilir', async () => {
        await deny(anon().collection(`${D}/candidates`).get());
        await deny(unauth().doc(`${D}/candidates/c-eng`).get());
    });
    it('recruiter ve super_admin hepsini okur, günceller, siler', async () => {
        await allow(as(U.recruiter).collection(`${D}/candidates`).get());
        await allow(as(U.recruiter).doc(`${D}/candidates/c-sales`).update({ note: 'x' }));
        await allow(as(U.superAdmin).doc(`${D}/candidates/c-sales`).get());
    });
    it('department_user yalnız kendi departmanındaki adayı tekil okur', async () => {
        await allow(as(U.dept).doc(`${D}/candidates/c-eng`).get());
        await deny(as(U.dept).doc(`${D}/candidates/c-sales`).get());
        await deny(as(U.deptNone).doc(`${D}/candidates/c-eng`).get());
    });
    it('department_user süzgeçsiz listeleyemez, kendi departman süzgeciyle listeler', async () => {
        await deny(as(U.dept).collection(`${D}/candidates`).get());
        await allow(
            as(U.dept).collection(`${D}/candidates`).where('department', 'in', ['Eng']).get()
        );
        await deny(
            as(U.dept).collection(`${D}/candidates`).where('department', 'in', ['Sales']).get()
        );
    });
    // BUGÜN: istemcinin ikinci sorgusu (CandidatesContext, visibleToDepartments
    // array-contains-any) kuralda `departments.hasAny(resource.data.visibleToDepartments)`
    // ile karşılanıyor ama Firestore bunu sorgu kısıtından KANITLAYAMIYOR ve
    // sorguyu reddediyor. İstemci hatayı yutuyor (console.error); yani
    // "başka departmana açılmış aday" bugün department_user'a hiç görünmüyor.
    it('BUGÜN: visibleToDepartments sorgusu reddediliyor (paylaşılan aday görünmüyor)', async () => {
        await deny(
            as(U.dept)
                .collection(`${D}/candidates`)
                .where('visibleToDepartments', 'array-contains-any', ['Eng'])
                .get()
        );
    });
    it('department_user ve profilsiz oturum aday yazamaz', async () => {
        await deny(as(U.dept).doc(`${D}/candidates/c-eng`).update({ note: 'x' }));
        await deny(as(U.noProfile).doc(`${D}/candidates/c-eng`).get());
    });
});

describe('users (profil ve rol)', () => {
    it('kişi kendi profilini okur; department_user başkasını okuyamaz; recruiter herkesi okur', async () => {
        await allow(as(U.dept).doc(`${D}/users/${U.dept}`).get());
        await deny(as(U.dept).doc(`${D}/users/${U.recruiter}`).get());
        await allow(as(U.recruiter).collection(`${D}/users`).get());
    });
    // ── BUGÜN AÇIK: kendine rol yazma ───────────────────────────────────────
    // `users/{userId}` altındaki `match /{allChildren=**}` rules_version 2'de
    // SIFIR ya da daha fazla yol parçasıyla eşleşiyor, yani alt koleksiyonları
    // değil profil belgesinin KENDİSİNİ de kapsıyor. Kurallar OR'landığı için
    // kayıt doğrulaması (davet / izinli alan adı) ve "rolünü değiştiremez"
    // koşulu bu eşleşmeyle atlanıyor: anonim olmayan her oturum kendi profiline
    // super_admin yazabiliyor. Bu PR davranışı değiştirmiyor; düzeltme ayrı PR'da
    // (`fix(rules): …`) ve aşağıdaki iki test orada tersine döner.
    it('BUGÜN AÇIK: oturum açan herkes kendine super_admin profili açar', async () => {
        const uid = 'u-escalate';
        const ctx = db(strictCtx(env, uid, { email: 'x@other.test' }));
        await allow(
            ctx.doc(`${D}/users/${uid}`).set({ uid, role: 'super_admin', email: 'x@other.test' })
        );
    });
    it('BUGÜN AÇIK: kişi kendi rolünü ve departmanını değiştirir', async () => {
        const uid = 'u-escalate-2';
        await seed(env, {
            [`${D}/users/${uid}`]: { uid, role: 'department_user', departments: [] },
        });
        const me = as(uid).doc(`${D}/users/${uid}`);
        await allow(me.update({ role: 'super_admin' }));
        await allow(me.update({ departments: ['Eng', 'Sales'] }));
    });
    it('başkasının profilini açmak ya da değiştirmek reddedilir; anonim profil açamaz', async () => {
        await deny(
            as(U.noProfile).doc(`${D}/users/u-someone`).set({ uid: 'u-someone', role: 'recruiter' })
        );
        await deny(as(U.dept).doc(`${D}/users/${U.deptNone}`).update({ role: 'recruiter' }));
        await deny(
            anon().doc(`${D}/users/anon-visitor`).set({ uid: 'anon-visitor', role: 'recruiter' })
        );
    });
    it('recruiter yalnız departman atar; super_admin her alanı değiştirir', async () => {
        await allow(
            as(U.recruiter)
                .doc(`${D}/users/${U.deptNone}`)
                .update({ departments: ['Eng'] })
        );
        await deny(as(U.recruiter).doc(`${D}/users/${U.deptNone}`).update({ role: 'recruiter' }));
        await allow(
            as(U.superAdmin).doc(`${D}/users/${U.deptNone}`).update({ role: 'department_user' })
        );
        await deny(as(U.recruiter).doc(`${D}/users/${U.deptNone}`).delete());
    });
    it('alt koleksiyonlar: sahibi ve super_admin', async () => {
        await allow(as(U.dept).doc(`${D}/users/${U.dept}/settings/preferences`).set({ a: 1 }));
        await deny(as(U.recruiter).doc(`${D}/users/${U.dept}/settings/preferences`).get());
        await allow(as(U.superAdmin).doc(`${D}/users/${U.dept}/settings/preferences`).get());
    });
});

describe('invitations', () => {
    it('yalnız super_admin', async () => {
        await allow(as(U.superAdmin).collection(`${D}/invitations`).get());
        await deny(as(U.recruiter).doc(`${D}/invitations/inv-1`).get());
        await deny(unauth().collection(`${D}/invitations`).get());
    });
    it('jetondaki role=super_admin talebi profilsiz yetki verir (BUGÜN — PR 1 kaldırır)', async () => {
        await allow(as(U.noProfile, { role: 'super_admin' }).doc(`${D}/invitations/inv-1`).get());
    });
});

describe('integrationSecrets', () => {
    it('istemciye tamamen kapalı (sahibi ve super_admin dahil)', async () => {
        await deny(as(U.recruiter).doc(`${D}/integrationSecrets/${U.recruiter}`).get());
        await deny(as(U.superAdmin).doc(`${D}/integrationSecrets/${U.recruiter}`).get());
        await deny(as(U.recruiter).doc(`${D}/integrationSecrets/${U.recruiter}`).set({ enc: 'y' }));
    });
});

describe('departments', () => {
    it('her iç oturum okur (profilsiz dahil, BUGÜN); anonim okuyamaz', async () => {
        await allow(as(U.noProfile).collection(`${D}/departments`).get());
        await deny(anon().doc(`${D}/departments/d-eng`).get());
    });
    it('yalnız super_admin yazar', async () => {
        await deny(as(U.recruiter).doc(`${D}/departments/d-new`).set({ name: 'X' }));
        await allow(as(U.superAdmin).doc(`${D}/departments/d-new`).set({ name: 'X' }));
    });
});

describe('sources', () => {
    it('anonim okur (başvuru formu); kimliksiz okuyamaz', async () => {
        await allow(anon().collection(`${D}/sources`).orderBy('createdAt', 'asc').get());
        await deny(unauth().doc(`${D}/sources/s-1`).get());
    });
    it('yalnız recruiter yazar', async () => {
        await allow(as(U.recruiter).doc(`${D}/sources/s-2`).set({ name: 'X' }));
        await deny(as(U.dept).doc(`${D}/sources/s-3`).set({ name: 'X' }));
    });
});

describe('companyIntel', () => {
    it('recruiter tekil okur ve yazar; liste kapalı; department_user göremez', async () => {
        await allow(as(U.recruiter).doc(`${D}/companyIntel/ci-1`).get());
        await allow(as(U.recruiter).doc(`${D}/companyIntel/ci-2`).set({ name: 'B' }));
        await deny(as(U.recruiter).collection(`${D}/companyIntel`).get());
        await deny(as(U.dept).doc(`${D}/companyIntel/ci-1`).get());
    });
});

describe('settings', () => {
    it('system ve branding her iç oturuma açık (profilsiz dahil); anonime kapalı', async () => {
        await allow(as(U.noProfile).doc(`${D}/settings/system`).get());
        await allow(as(U.noProfile).doc(`${D}/settings/branding`).get());
        await deny(anon().doc(`${D}/settings/system`).get());
    });
    it('diğer ayarlar recruiter; sırlar hiç kimse; liste kapalı', async () => {
        await allow(as(U.recruiter).doc(`${D}/settings/emailTemplates`).get());
        await deny(as(U.dept).doc(`${D}/settings/emailTemplates`).get());
        await deny(as(U.superAdmin).doc(`${D}/settings/api_keys`).get());
        await deny(as(U.superAdmin).doc(`${D}/settings/integrations`).get());
        await deny(as(U.superAdmin).collection(`${D}/settings`).get());
    });
    it('yazma yalnız super_admin ve sır olmayan belgeye', async () => {
        await allow(
            as(U.superAdmin)
                .doc(`${D}/settings/system`)
                .set({ allowedDomains: ['allowed.test'] })
        );
        await deny(
            as(U.recruiter)
                .doc(`${D}/settings/system`)
                .set({ allowedDomains: ['evil.test'] })
        );
        await deny(as(U.superAdmin).doc(`${D}/settings/api_keys`).set({ gemini: 'x' }));
    });
});

describe('infoRequests (aday yanıt bağlantısı)', () => {
    it('kimliksiz tekil okur, listeleyemez', async () => {
        await allow(unauth().doc(`${D}/infoRequests/ir-1`).get());
        await deny(unauth().collection(`${D}/infoRequests`).get());
        await deny(anon().collection(`${D}/infoRequests`).get());
    });
    it('iç oturum listeler (profilsiz dahil, BUGÜN); yalnız recruiter yazar', async () => {
        await allow(as(U.noProfile).collection(`${D}/infoRequests`).get());
        await allow(as(U.recruiter).doc(`${D}/infoRequests/ir-2`).set({ a: 1 }));
        await deny(as(U.dept).doc(`${D}/infoRequests/ir-3`).set({ a: 1 }));
    });
});

describe('emailThreads', () => {
    it('yalnız recruiter', async () => {
        await allow(as(U.recruiter).collection(`${D}/emailThreads`).get());
        await deny(as(U.dept).doc(`${D}/emailThreads/t-1`).get());
    });
});

describe('messageQueue ve participantInvites', () => {
    for (const coll of ['messageQueue', 'participantInvites']) {
        it(`${coll}: her iç oturum okur, yalnız recruiter yazar, anonim okuyamaz`, async () => {
            await allow(as(U.dept).collection(`${D}/${coll}`).get());
            await deny(anon().collection(`${D}/${coll}`).get());
            await deny(as(U.dept).doc(`${D}/${coll}/new`).set({ a: 1 }));
            await allow(as(U.recruiter).doc(`${D}/${coll}/new`).set({ a: 1 }));
        });
    }
});

describe('bulkImportJobs', () => {
    it('recruiter okur (items dahil); kimse yazamaz; department_user okuyamaz', async () => {
        await allow(as(U.recruiter).doc(`${D}/bulkImportJobs/j-1`).get());
        await allow(as(U.recruiter).collection(`${D}/bulkImportJobs/j-1/items`).get());
        await deny(as(U.superAdmin).doc(`${D}/bulkImportJobs/j-1`).update({ status: 'queued' }));
        await deny(as(U.superAdmin).doc(`${D}/bulkImportJobs/j-1/items/i-2`).set({ a: 1 }));
        await deny(as(U.dept).doc(`${D}/bulkImportJobs/j-1`).get());
    });
});

describe('accessLogs (denetim defteri)', () => {
    it('iç oturum yalnız kendi uid’siyle kayıt ekler; düzenleme ve silme kapalı', async () => {
        await allow(as(U.dept).collection(`${D}/accessLogs`).add({ uid: U.dept }));
        await deny(as(U.dept).collection(`${D}/accessLogs`).add({ uid: U.recruiter }));
        await deny(as(U.superAdmin).doc(`${D}/accessLogs/l-1`).update({ uid: 'x' }));
        await deny(as(U.superAdmin).doc(`${D}/accessLogs/l-1`).delete());
    });
    it('yalnız super_admin okur', async () => {
        await allow(as(U.superAdmin).collection(`${D}/accessLogs`).get());
        await deny(as(U.recruiter).doc(`${D}/accessLogs/l-1`).get());
    });
});

describe('usage', () => {
    it('kural yok → istemciye kapalı', async () => {
        await deny(as(U.superAdmin).doc(`${D}/usage/2026-10-29`).get());
    });
});

describe('interviews (kök koleksiyon)', () => {
    it('kimliksiz tekil okur, listeleyemez; iç oturum listeler', async () => {
        await allow(unauth().doc('interviews/s-1').get());
        await deny(unauth().collection('interviews').get());
        await deny(anon().collection('interviews').get());
        await allow(as(U.noProfile).collection('interviews').get());
    });
    it('yalnız iç oturum oluşturur; silme kapalı', async () => {
        await allow(as(U.noProfile).doc('interviews/s-2').set({ candidateId: 'c-eng' }));
        await deny(anon().doc('interviews/s-3').set({ candidateId: 'c-eng' }));
        await deny(as(U.recruiter).doc('interviews/s-1').delete());
    });
    it('anonim aday transkripti yazar ama değerlendirme alanlarına dokunamaz', async () => {
        await allow(
            anon()
                .doc('interviews/s-1')
                .update({ transcript: ['merhaba'] })
        );
        await deny(
            anon()
                .doc('interviews/s-1')
                .update({ aiAnalysis: { score: 100 } })
        );
        await deny(anon().doc('interviews/s-1').update({ candidateId: 'c-sales' }));
        await allow(
            as(U.recruiter)
                .doc('interviews/s-1')
                .update({ aiAnalysis: { score: 50 } })
        );
    });
});

describe('varsayılan red', () => {
    it('kuralı olmayan yol super_admin’e de kapalı', async () => {
        await deny(as(U.superAdmin).doc('elsewhere/x').get());
        await deny(as(U.superAdmin).doc('elsewhere/y').set({ a: 1 }));
    });
});
