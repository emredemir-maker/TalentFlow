// Kendi API'mize giden her isteğe etkin şirketi ekler (`X-Tenant-Id`).
//
// Sunucu (functions/middleware/auth.js → requireTenant) iç kullanıcı uçlarında
// bu başlığı ister; yetki yine sunucuda üyelik belgesinden gelir — başlık
// yalnız "hangi şirket adına" sorusunun cevabı. Uygulamada /api/* çağrısı
// onlarca yerde ve kendi başlıklarını kuruyor; her birine elle eklemek bir
// tanesini unutmak demekti. Bu yüzden fetch tek noktada sarılıyor.
//
// YALNIZ KENDİ API'MİZ: göreli `/api/…` ya da VITE_SERVER_URL köküyle başlayan
// adres. Dış adreslere (Google, Microsoft, Hub) şirket kimliği gönderilmez.
import { getActiveTenantId } from '../config/tenantPaths';

export const TENANT_HEADER = 'X-Tenant-Id';

/** Bu adres bizim API'miz mi? */
export function isOwnApi(url, { serverUrl = '', origin = '' } = {}) {
    const u = String(url || '');
    if (u.startsWith('/api/')) return true;
    const roots = [serverUrl, origin].filter(Boolean).map((r) => r.replace(/\/+$/, ''));
    return roots.some((r) => u.startsWith(`${r}/api/`));
}

/** fetch argümanlarına başlığı ekler (zaten varsa dokunmaz). Saf — testlenir. */
export function withTenantHeader(input, init, tenantId, opts) {
    if (!tenantId) return [input, init];
    const url = typeof input === 'string' ? input : input?.url;
    if (!isOwnApi(url, opts)) return [input, init];
    const headers = new Headers(init?.headers || (typeof input === 'object' ? input.headers : undefined));
    if (!headers.has(TENANT_HEADER)) headers.set(TENANT_HEADER, tenantId);
    return [input, { ...(init || {}), headers }];
}

let installed = false;

/** main.jsx bir kez çağırır. */
export function installTenantFetch() {
    if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
    installed = true;
    const original = window.fetch.bind(window);
    const opts = {
        serverUrl: import.meta.env.VITE_SERVER_URL || '',
        origin: window.location.origin,
    };
    window.fetch = (input, init) => original(...withTenantHeader(input, init, getActiveTenantId(), opts));
}
