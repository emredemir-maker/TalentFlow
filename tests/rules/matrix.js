// Firestore kural matrisi — beklenen sonuçların TEK tablosu.
//
// Her şirket koleksiyonu için: kim {get, list, create, update, delete}
// yapabilir. Tablo A şirketi üzerinde koşar; A dışındaki her kimlik (B üyesi,
// üye olmayan oturum, anonim, kimliksiz) yalnız açıkça yazılmışsa (herkese açık
// yetki anahtarı okumaları) geçer. firestore.test.js, firestore.rules'taki
// "TENANT KOLEKSİYONLARI" bloğundaki her koleksiyonun burada bir satırı
// olduğunu denetler: yeni koleksiyon tabloya eklenmeden test geçmez.

const DAY = 24 * 60 * 60 * 1000;
export const inDays = (n) => new Date(Date.now() + n * DAY);

// ── Şirketler ────────────────────────────────────────────────────────────────
export const TENANTS = {
    A: { name: 'Şirket A', status: 'active', writeUntil: inDays(365), readUntil: inDays(365) },
    B: { name: 'Şirket B', status: 'active', writeUntil: inDays(365), readUntil: inDays(365) },
    // Deneme bitti: yazma süresi geçti, 14 günlük okuma bandında (K5).
    C: { name: 'Salt okunur', status: 'trial', writeUntil: inDays(-1), readUntil: inDays(13) },
    // Okuma süresi de geçti: tamamen kapalı.
    D: { name: 'Kapalı', status: 'trial', writeUntil: inDays(-15), readUntil: inDays(-1) },
    // Süreler ileride ama askıya alınmış.
    E: { name: 'Askıda', status: 'suspended', writeUntil: inDays(365), readUntil: inDays(365) },
    // Durumu salt okunur, süreleri ileride: yazmayı durum alanı da kapatmalı.
    F: {
        name: 'Salt okunur durum',
        status: 'readonly',
        writeUntil: inDays(365),
        readUntil: inDays(365),
    },
};

// ── Kimlikler ────────────────────────────────────────────────────────────────
// kind: 'member' (üyelik belgesi tohumlanır), 'signed' (oturum var, üyelik yok),
// 'anon', 'unauth'. claims: jetona eklenecek ek talepler.
export const IDENTITIES = {
    aAdmin: { kind: 'member', memberships: { A: { role: 'admin' } } },
    aRecruiter: { kind: 'member', memberships: { A: { role: 'recruiter' } } },
    aDept: {
        kind: 'member',
        memberships: { A: { role: 'department_user', departments: ['Eng'] } },
    },
    aDeptNone: { kind: 'member', memberships: { A: { role: 'department_user', departments: [] } } },
    aSupport: { kind: 'member', memberships: { A: { role: 'support', expiresAt: inDays(1) } } },
    aSupportExpired: {
        kind: 'member',
        memberships: { A: { role: 'support', expiresAt: new Date(Date.now() - 60 * 60 * 1000) } },
    },
    aRemoved: { kind: 'member', memberships: { A: { role: 'recruiter', status: 'removed' } } },
    // Jetonunda eski düzenin super_admin talebi olan department_user: kural
    // talebe bakmamalı, A'da department_user gibi davranmalı.
    aDeptClaim: {
        kind: 'member',
        memberships: { A: { role: 'department_user', departments: ['Eng'] } },
        claims: { role: 'super_admin' },
    },
    // İki şirkette üye: B'de admin, A'da department_user. Rol şirket başına.
    multi: {
        kind: 'member',
        memberships: { A: { role: 'department_user', departments: ['Eng'] }, B: { role: 'admin' } },
    },
    bAdmin: { kind: 'member', memberships: { B: { role: 'admin' } } },
    bRecruiter: { kind: 'member', memberships: { B: { role: 'recruiter' } } },
    cAdmin: { kind: 'member', memberships: { C: { role: 'admin' } } },
    cRecruiter: { kind: 'member', memberships: { C: { role: 'recruiter' } } },
    dAdmin: { kind: 'member', memberships: { D: { role: 'admin' } } },
    eAdmin: { kind: 'member', memberships: { E: { role: 'admin' } } },
    fAdmin: { kind: 'member', memberships: { F: { role: 'admin' } } },
    nonMember: { kind: 'signed' },
    // Üye olmayan, jetonunda her türlü eski yetki talebi olan oturum.
    claimAdmin: { kind: 'signed', claims: { role: 'super_admin', admin: true, tid: 'A' } },
    anon: { kind: 'anon' },
    // Anonim oturumun uid'sine bir üyelik belgesi yazılmış olsa bile (sunucu
    // hatası) iç kullanıcı sayılmamalı.
    anonWithMembership: { kind: 'anon', memberships: { A: { role: 'admin' } } },
    unauth: { kind: 'unauth' },
};

// Matriste A şirketine karşı denenen kimlikler (C/D/E üyeleri ayrı testte).
export const MATRIX_IDENTITIES = Object.keys(IDENTITIES).filter((k) => !/^[cdef][A-Z]/.test(k));

// ── Kümeler (A şirketine göre) ───────────────────────────────────────────────
const A_ADMIN = ['aAdmin'];
const A_WRITERS = ['aAdmin', 'aRecruiter'];
const A_READ_ALL = ['aAdmin', 'aRecruiter', 'aSupport'];
const A_ALL = ['aAdmin', 'aRecruiter', 'aDept', 'aDeptNone', 'aSupport', 'aDeptClaim', 'multi'];
const ANY_AUTH = MATRIX_IDENTITIES.filter((k) => k !== 'unauth');
const EVERYONE = MATRIX_IDENTITIES;
const NONE = [];

// ── Koleksiyonlar ────────────────────────────────────────────────────────────
// path: şirket kökünden koleksiyon yolu. doc: tohum belgesi (department'lı
// adaylar için departman 'Sales' — A'daki department_user'lar 'Eng').
// createData(uid): oluşturma denemesinin gövdesi (varsayılan { name: 'x' }).
// update: güncelleme denemesinin alanları.
export const COLLECTIONS = {
    members: {
        path: 'members',
        // Hedef: aDeptNone'un üyelik belgesi (kendi belgesi kendisine okunur).
        existingId: 'aDeptNone',
        update: { displayName: 'x' },
        ops: {
            get: [...A_READ_ALL, 'aDeptNone'],
            list: A_READ_ALL,
            create: NONE,
            // Yalnız belgenin sahibi ve yalnız izinli alanlar (displayName);
            // rol/departman kurcalaması firestore.test.js → "üyelik kurcalama".
            update: ['aDeptNone'],
            delete: NONE,
        },
    },
    candidates: {
        path: 'candidates',
        doc: { name: 'Aday', department: 'Sales' },
        ops: {
            get: A_READ_ALL,
            list: A_READ_ALL,
            create: A_WRITERS,
            update: A_WRITERS,
            delete: A_WRITERS,
        },
    },
    positions: {
        path: 'positions',
        doc: { title: 'Kapalı ilan', status: 'closed' },
        ops: { get: A_ALL, list: A_ALL, create: A_WRITERS, update: A_WRITERS, delete: A_WRITERS },
    },
    applications: {
        path: 'applications',
        doc: { positionId: 'p', email: 'c@example.test' },
        ops: {
            get: A_READ_ALL,
            list: A_READ_ALL,
            create: NONE,
            update: A_WRITERS,
            delete: A_WRITERS,
        },
    },
    departments: {
        path: 'departments',
        doc: { name: 'Sales' },
        ops: { get: A_ALL, list: A_ALL, create: A_ADMIN, update: A_ADMIN, delete: A_ADMIN },
    },
    sources: {
        path: 'sources',
        doc: { name: 'LinkedIn' },
        ops: {
            get: ANY_AUTH,
            list: ANY_AUTH,
            create: A_WRITERS,
            update: A_WRITERS,
            delete: A_WRITERS,
        },
    },
    settings: {
        path: 'settings',
        existingId: 'emailTemplates',
        doc: { a: 1 },
        ops: { get: A_READ_ALL, list: NONE, create: A_ADMIN, update: A_ADMIN, delete: A_ADMIN },
    },
    infoRequests: {
        path: 'infoRequests',
        doc: { candidateId: 'c' },
        ops: {
            get: EVERYONE,
            list: A_ALL,
            create: A_WRITERS,
            update: A_WRITERS,
            delete: A_WRITERS,
        },
    },
    emailThreads: {
        path: 'emailThreads',
        doc: { subject: 's' },
        ops: {
            get: A_READ_ALL,
            list: A_READ_ALL,
            create: A_WRITERS,
            update: A_WRITERS,
            delete: A_WRITERS,
        },
    },
    messageQueue: {
        path: 'messageQueue',
        doc: { to: 'x' },
        ops: { get: A_ALL, list: A_ALL, create: A_WRITERS, update: A_WRITERS, delete: A_WRITERS },
    },
    participantInvites: {
        path: 'participantInvites',
        doc: { participantIds: ['aDept'] },
        ops: { get: A_ALL, list: A_ALL, create: A_WRITERS, update: A_WRITERS, delete: A_WRITERS },
    },
    bulkImportJobs: {
        path: 'bulkImportJobs',
        doc: { status: 'done' },
        ops: { get: A_READ_ALL, list: A_READ_ALL, create: NONE, update: NONE, delete: NONE },
    },
    items: {
        path: 'bulkImportJobs/j-1/items',
        doc: { text: 'ham CV' },
        ops: { get: A_READ_ALL, list: A_READ_ALL, create: NONE, update: NONE, delete: NONE },
    },
    accessLogs: {
        path: 'accessLogs',
        doc: { uid: 'aAdmin' },
        // Kayıt yalnız kendi uid'siyle; anonim/üye olmayan da kendi uid'sini
        // yazsa reddedilir.
        createData: (uid) => ({ uid }),
        ops: { get: A_ADMIN, list: A_ADMIN, create: A_ALL, update: NONE, delete: NONE },
    },
    usage: {
        path: 'usage',
        doc: { tokens: 1 },
        ops: { get: A_ADMIN, list: A_ADMIN, create: NONE, update: NONE, delete: NONE },
    },
    interviews: {
        path: 'interviews',
        doc: { candidateId: 'c', transcript: [] },
        // Korumasız alan: aday tarafı (anonim dahil) yazar. Destek üyesi (K11)
        // salt okunur: bu daldan da yazamaz.
        update: { transcript: ['merhaba'] },
        ops: {
            get: EVERYONE,
            list: A_ALL,
            create: A_WRITERS,
            update: ANY_AUTH.filter((k) => k !== 'aSupport'),
            delete: NONE,
        },
    },
    integrationSecrets: {
        path: 'integrationSecrets',
        doc: { enc: 'x' },
        ops: { get: NONE, list: NONE, create: NONE, update: NONE, delete: NONE },
    },
};

// Matristeki adlar ile firestore.rules bloğundaki eşleşme adları arasındaki
// eşleme (members altındaki `{collection}` kişinin kendi alt koleksiyonları —
// ayrı testte).
export const RULE_NAMES_COVERED_ELSEWHERE = ['{collection}'];
