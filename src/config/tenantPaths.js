// İstemci Firestore/Storage yolları — TEK KAYNAK (sunucudaki karşılığı:
// functions/services/tenantPaths.js).
//
// Çok şirketli modelde (docs/coklu-sirket-plani.md §2.2) şirkete ait her veri
// `tenants/{tenantId}/…` altında. Etkin şirket bir kez seçilir
// (TenantContext → setActiveTenantId) ve bütün yol kurucular onu okur; servis
// modülleri (React dışı) da aynı kaynağı kullanabilsin diye durum burada,
// modül düzeyinde tutulur.
//
// Yol HER ÇAĞRIDA kurulur (modül yüklenirken sabitlenmez): şirket değişince
// eski şirketin yolu bir yerde asılı kalmasın.
//
// Etkin şirket yoksa yol kurucular HATA FIRLATIR: şirketsiz bir yol eski ortak
// köke ya da başka bir şirkete gitmek yerine güvenli biçimde düşer.

/** Sunucuyla aynı biçim: Hub UUID'si ya da test kimliği. */
const TENANT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

let activeTenantId = null;
const listeners = new Set();

export function isValidTenantId(t) {
    return typeof t === 'string' && TENANT_ID_RE.test(t);
}

/** Etkin şirketi değiştirir (TenantContext ve aday sayfaları çağırır). */
export function setActiveTenantId(t) {
    const next = isValidTenantId(t) ? t : null;
    if (next === activeTenantId) return;
    activeTenantId = next;
    for (const fn of listeners) fn(next);
}

export function getActiveTenantId() {
    return activeTenantId;
}

export function onActiveTenantChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

function requireTenant(t) {
    const id = t ?? activeTenantId;
    if (!isValidTenantId(id)) throw new Error('Şirket seçilmedi.');
    return id;
}

/** `tenants/{t}` */
export function tenantRoot(t) {
    return `tenants/${requireTenant(t)}`;
}

/** `tenants/{t}/{coll}` — etkin şirket (ya da verilen şirket) altında. */
export function tc(coll, t) {
    return `${tenantRoot(t)}/${coll}`;
}

/** `tenants/{t}/members/{uid}` — eski `users/{uid}` profilinin yerini alan üyelik. */
export function memberPath(uid, t) {
    return `${tc('members', t)}/${uid}`;
}

/** Kişinin şirket listesi (şirket seçici). */
export function userTenantsPath(uid) {
    return `userTenants/${uid}`;
}

/** Storage: şirketin CV klasörü, toplu yükleme klasörü, logo klasörü. */
export const storagePaths = {
    cv: (fileName, t) => `${tenantRoot(t)}/cvs/${fileName}`,
    bulkImport: (uid, rest, t) => `${tenantRoot(t)}/bulk-imports/${uid}/${rest}`,
    branding: (fileName, t) => `${tenantRoot(t)}/branding/${fileName}`,
};

// ── Aday bağlantısının şirketi (PR 5, §2.5) ─────────────────────────────────
// Aday sayfaları (/apply, /join, /respond) şirketi adresten DEĞİL, sunucunun
// çözdüğü bağlantıdan alır (PublicLinkGate). Oturumu açık bir iç kullanıcı da
// bu sayfayı açabilir: şirket listesi yüklenince AuthContext'in kendi seçimi
// bağlantının şirketini ezmesin diye ayrı tutulur ve önceliklidir.
let linkTenantId = null;
let activeLinkId = null;

/** @param {string|null} t  @param {string|null} [linkId] çözülen bağlantının kimliği */
export function setLinkTenantId(t, linkId = null) {
    linkTenantId = isValidTenantId(t) ? t : null;
    activeLinkId = linkTenantId && typeof linkId === 'string' ? linkId : null;
    if (linkTenantId) setActiveTenantId(linkTenantId);
}

export function getLinkTenantId() {
    return linkTenantId;
}

/** Aday sayfasında çözülmüş bağlantının kimliği (X-Public-Link başlığı için). */
export function getActiveLinkId() {
    return activeLinkId;
}

/**
 * İç ekranlar arası gezinmede şirket ipucu (?tenantId=…): yeni sekmede açılan
 * /live-interview, /interview-report, /face-interview sayfası doğru şirketi
 * seçsin. Yetki vermez — okuma/yazma yine üyelikle. ADAYA VERİLEN
 * BAĞLANTILARDA KULLANILMAZ (aday bağlantısı yalnız publicLinks kimliği).
 */
export const TENANT_QUERY_PARAM = 'tenantId';

/** `?tenantId=…` ekli iç bağlantı. */
export function withTenantParam(url, t) {
    const id = requireTenant(t);
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}${TENANT_QUERY_PARAM}=${encodeURIComponent(id)}`;
}

/** Adresteki şirket ipucu (iç ekranlar; aday bağlantı sayfalarında okunmaz). */
export function tenantFromLocation(search = typeof window !== 'undefined' ? window.location.search : '') {
    const t = new URLSearchParams(search).get(TENANT_QUERY_PARAM);
    return isValidTenantId(t) ? t : null;
}
