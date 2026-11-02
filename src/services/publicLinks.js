// Herkese açık aday bağlantıları (docs/coklu-sirket-plani.md §2.5).
//
// Aday bağlantısı yalnız rastgele bir kimlik taşır: `/apply/{linkId}`,
// `/join/{linkId}`, `/respond/{linkId}`. Şirketi ve hedef kaydı sunucu
// `publicLinks/{linkId}` belgesinden çözer (GET /api/public/resolve/:linkId).
// İç kullanıcı ekranları bağlantıyı sunucudan ister (POST /api/public-links);
// aynı kayıt için sunucu var olan bağlantıyı döner.
import { getActiveTenantId } from '../config/tenantPaths';
import { getAuthHeaders } from './ai/config';

const API_BASE = import.meta.env?.VITE_SERVER_URL || '';

/** Sunucuyla aynı biçim: 16 bayt base64url → 22 karakter. */
const LINK_ID_RE = /^[A-Za-z0-9_-]{22}$/;

export function isValidLinkId(id) {
    return typeof id === 'string' && LINK_ID_RE.test(id);
}

/** Aday bağlantısının yolu — sunucudaki linkPathFor ile aynı. */
export function linkPathFor(kind, linkId) {
    if (kind === 'position') return `/apply/${linkId}`;
    if (kind === 'interview') return `/join/${linkId}`;
    if (kind === 'infoRequest') return `/respond/${linkId}`;
    throw new Error(`Bilinmeyen bağlantı türü: ${kind}`);
}

const resolveCache = new Map();

/**
 * Bağlantıyı çözer → { kind, targetId, tenantId }. Geçersiz/bilinmeyen
 * bağlantıda hata fırlatır (mesaj adaya gösterilebilir).
 */
export function resolvePublicLink(linkId, { fetchImpl = fetch } = {}) {
    if (!isValidLinkId(linkId)) return Promise.reject(new Error('Bağlantı geçersiz.'));
    if (!resolveCache.has(linkId)) {
        const p = fetchImpl(`${API_BASE}/api/public/resolve/${encodeURIComponent(linkId)}`)
            .then(async (res) => {
                if (res.status === 404) throw new Error('Bağlantı geçersiz ya da süresi dolmuş.');
                if (!res.ok) throw new Error('Bağlantı şu an doğrulanamadı. Lütfen biraz sonra tekrar deneyin.');
                return res.json();
            })
            .catch((err) => {
                resolveCache.delete(linkId); // geçici hatada yeniden denenebilsin
                throw err;
            });
        resolveCache.set(linkId, p);
    }
    return resolveCache.get(linkId);
}

const linkCache = new Map();

/**
 * İç kullanıcı: bir ilan ya da mülakat için aday bağlantısı ister.
 * İstek etkin şirket adına (X-Tenant-Id, tenantFetch) ve kimlik jetonuyla gider.
 * @returns {Promise<{ linkId: string, url: string }>}
 */
export async function requestPublicLink(kind, targetId, { candidateId, getHeaders = getAuthHeaders, origin } = {}) {
    const tenant = getActiveTenantId();
    const key = `${tenant}|${kind}|${targetId}`;
    if (linkCache.has(key)) return linkCache.get(key);
    const headers = { 'Content-Type': 'application/json', ...(await getHeaders()) };
    const res = await fetch(`${API_BASE}/api/public-links`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ kind, targetId, ...(candidateId ? { candidateId } : {}) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !isValidLinkId(body.linkId)) {
        throw new Error(body.error || 'Aday bağlantısı oluşturulamadı.');
    }
    const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
    const out = { linkId: body.linkId, url: `${base}${linkPathFor(kind, body.linkId)}` };
    linkCache.set(key, out);
    return out;
}
