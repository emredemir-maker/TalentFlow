// Firestore / Storage yolları — TEK KAYNAK.
//
// Çok şirketli modelde (docs/coklu-sirket-plani.md §2.2) şirkete ait her veri
// `tenants/{tenantId}/…` altında. Sunucu Admin SDK ile çalışır ve güvenlik
// kurallarını ATLAR; bu yüzden yalıtımın sunucudaki tek güvencesi yolun hep
// buradan, doğrulanmış bir şirket kimliğiyle kurulması.
//
//   • `functions/` içinde başka hiçbir dosya ham yol dizgisi yazmaz; eski ortak
//     kök (`artifacts/talent-flow`) hiç geçmez. Denetim:
//     scripts/check-tenant-paths.mjs (CI).
//   • Kimlikler yola girmeden önce doğrulanır: '/' içeren bir kimlik yolu başka
//     bir alt koleksiyona kaydırabilirdi (ör. `x/../..` ya da `a/items/b`).
//   • Şirket kimliği Hub'daki `tenants.id` (UUID); testler kısa kimlik kullanır.

/** Şirket kimliği: Hub UUID'si ya da test kimliği. Yol ayırıcı ve nokta yok. */
const TENANT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Belge kimliği: Firestore'un izin verdiği küme, ama '/' ve tek başına '.'/'..' yok. */
const DOC_ID_RE = /^[^/\s]{1,200}$/;

export class TenantPathError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TenantPathError';
        this.status = 400;
    }
}

export function isValidTenantId(t) {
    return typeof t === 'string' && TENANT_ID_RE.test(t);
}

export function isValidDocId(id) {
    return typeof id === 'string' && DOC_ID_RE.test(id) && id !== '.' && id !== '..' && !id.startsWith('__');
}

function tid(t) {
    if (!isValidTenantId(t)) throw new TenantPathError('Geçersiz şirket kimliği.');
    return t;
}

function did(id) {
    if (!isValidDocId(id)) throw new TenantPathError('Geçersiz kayıt kimliği.');
    return id;
}

// Şirket altındaki koleksiyonlar. firestore.rules'taki "TENANT KOLEKSİYONLARI"
// bloğuyla aynı küme + yalnız sunucunun kullandığı companyIntelManual (kural
// yok → istemciye varsayılan red).
const TENANT_COLLECTIONS = new Set([
    'members',
    'candidates',
    'positions',
    'applications',
    'departments',
    'sources',
    'settings',
    'infoRequests',
    'emailThreads',
    'messageQueue',
    'participantInvites',
    'bulkImportJobs',
    'accessLogs',
    'usage',
    'interviews',
    'integrationSecrets',
    'companyIntelManual',
]);

/** `tenants/{t}` */
export function tenantDocPath(t) {
    return `tenants/${tid(t)}`;
}

/** `tenants/{t}/{coll}` — koleksiyon adı izin listesinde olmalı. */
export function tenantColl(t, coll) {
    if (!TENANT_COLLECTIONS.has(coll)) throw new TenantPathError(`Bilinmeyen koleksiyon: ${coll}`);
    return `${tenantDocPath(t)}/${coll}`;
}

/** `tenants/{t}/{coll}/{id}` */
export function tenantDoc(t, coll, id) {
    return `${tenantColl(t, coll)}/${did(id)}`;
}

/** Şirkete bağlı yol kurucu — rotalar `paths(req.tenant.id).candidate(id)` biçiminde kullanır. */
export function tenantPaths(t) {
    tid(t);
    return {
        root: tenantDocPath(t),
        member: (uid) => tenantDoc(t, 'members', uid),
        members: () => tenantColl(t, 'members'),
        candidates: () => tenantColl(t, 'candidates'),
        candidate: (id) => tenantDoc(t, 'candidates', id),
        positions: () => tenantColl(t, 'positions'),
        position: (id) => tenantDoc(t, 'positions', id),
        applications: () => tenantColl(t, 'applications'),
        settings: (id) => tenantDoc(t, 'settings', id),
        infoRequests: () => tenantColl(t, 'infoRequests'),
        infoRequest: (id) => tenantDoc(t, 'infoRequests', id),
        bulkJobs: () => tenantColl(t, 'bulkImportJobs'),
        bulkJob: (id) => tenantDoc(t, 'bulkImportJobs', id),
        bulkItems: (jobId) => `${tenantDoc(t, 'bulkImportJobs', jobId)}/items`,
        accessLogs: () => tenantColl(t, 'accessLogs'),
        usage: () => tenantColl(t, 'usage'),
        usageDay: (day) => tenantDoc(t, 'usage', day),
        interview: (sessionId) => tenantDoc(t, 'interviews', sessionId),
        integrationSecret: (uid) => tenantDoc(t, 'integrationSecrets', uid),
        companyIntelManual: (id) => tenantDoc(t, 'companyIntelManual', id),
    };
}

// ── Platform yolları — şirkete ait değil, istemciye kapalı (firestore.rules) ──
export const PLATFORM_PATHS = {
    /** Gemini anahtarı (eski settings/api_keys). */
    apiKeys: 'platform/api_keys',
    /** Google / Microsoft OAuth uygulaması (eski settings/integrations). */
    integrations: 'platform/integrations',
    /** Ortak şirket bilgisi önbelleği (K6). */
    companyIntel: (id) => `platform/companyIntel/entries/${did(id)}`,
    /** Tüm şirketlerin günlük AI toplamı (global güvenlik tavanı bunu okur). */
    usageDay: (day) => `platformUsage/${did(day)}`,
    usage: 'platformUsage',
    /** Kişinin şirket listesi (şirket seçici). */
    userTenants: (uid) => `userTenants/${did(uid)}`,
};

// ── Storage ────────────────────────────────────────────────────────────────
export const storagePaths = {
    /** `tenants/{t}/cvs/{file}` */
    cv: (t, fileName) => `${tenantDocPath(t)}/cvs/${did(fileName)}`,
    /** `tenants/{t}/` — bir dosya yolunun bu şirkete ait olup olmadığını sınamak için. */
    tenantPrefix: (t) => `${tenantDocPath(t)}/`,
    /** `tenants/{t}/bulk-imports/{uid}/` */
    bulkImportPrefix: (t, uid) => `${tenantDocPath(t)}/bulk-imports/${did(uid)}/`,
};

/**
 * İşçi collection group sorgusundan gelen bir belge yolunun şirket kimliğini
 * çıkarır: `tenants/{t}/bulkImportJobs/{id}` → t. Beklenen biçim değilse null.
 */
export function tenantIdFromPath(path) {
    const m = /^tenants\/([^/]+)\/bulkImportJobs\/[^/]+$/.exec(String(path || ''));
    return m && isValidTenantId(m[1]) ? m[1] : null;
}
