// Kimlik ve yetki ara katmanları.
//
//   verifyFirebaseToken — Firebase ID jetonunu doğrular (anonim dahil). Aday
//     tarafındaki herkese açık uçlar ve AI uçları için; rol/şirket bakmaz.
//   rejectAnonymous     — verifyFirebaseToken'dan sonra; anonim oturumu reddeder.
//   requireTenant(roles, opts) — şirket verisine dokunan HER uç. Ayrıntı aşağıda.
//   requirePlatformAdmin — platform ayarları (Gemini anahtarı, OAuth uygulaması).
//
// Yetki jetondaki talepten (`token.role`) ASLA okunmaz: Firebase Auth Hub ve CX
// ile ortak; global bir talep başka uygulamada verilmiş bir yetkiyi buraya
// taşırdı (docs/coklu-sirket-plani.md §2.2, K1).
import { db, admin } from '../config/firebaseAdmin.js';
import { isValidTenantId, tenantDocPath, tenantPaths } from '../services/tenantPaths.js';

export async function verifyFirebaseToken(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Kimlik doğrulama gereklidir.' });
    try {
        // Admin SDK imza + audience doğrular ve token içeriğini çözümler.
        // Eski Identity Toolkit REST kontrolü tokenı yalnızca doğruluyor,
        // uid'yi ÇIKARMIYORDU — bu yüzden /api/auth/* uçları userId'yi
        // istemcinin gönderdiği değerden almak zorunda kalıyordu (IDOR).
        const decoded = await admin.auth().verifyIdToken(token);
        req.firebaseToken = token;
        req.authUser = {
            uid: decoded.uid,
            provider: decoded.firebase?.sign_in_provider || '',
            email: decoded.email || '',
        };
        return next();
    } catch {
        return res.status(401).json({ error: 'Geçersiz kimlik bilgileri.' });
    }
}

// Anonim oturumları reddeden ek katman — verifyFirebaseToken'dan SONRA
// kullanılır. Kullanıcı hesabına veri yazan uçlar (OAuth token persist)
// public sayfaların otomatik anon oturumlarıyla çağrılamamalıdır.
export function rejectAnonymous(req, res, next) {
    if (!req.authUser || req.authUser.provider === 'anonymous') {
        return res.status(403).json({ error: 'Bu işlem için hesapla giriş yapılmalıdır.' });
    }
    return next();
}

// ── Şirket bağlamı ──────────────────────────────────────────────────────────
//
// İstemci etkin şirketi `X-Tenant-Id` başlığıyla bildirir (TenantContext, PR 3).
// Başlık yalnız bir İSTEK: yetki, o şirketteki üyelik belgesinden gelir
// (`tenants/{t}/members/{uid}`) — firestore.rules'taki isMember/canRead/canWrite
// ile birebir aynı kurallar:
//   • üyelik `status == 'active'`, süreli üyelikte (destek, K11) `expiresAt` dolmamış;
//   • rol `roles` listesinde;
//   • şirket okunabilir: durum trial|active|readonly ve `readUntil` geçmemiş;
//   • yazma isteğinde ayrıca durum trial|active ve `writeUntil` geçmemiş (K5),
//     destek rolü hiç yazamaz.
//
// Yanıtlar: üye değil / şirket yok / rol yetmiyor → 403 (şirketin varlığı
// sızdırılmaz); askıya alınmış şirket → 403 TENANT_SUSPENDED; deneme süresi
// bitmiş (salt okunur bantta yazma) → 402 TENANT_READ_ONLY; tamamen kapanmış →
// 402 TENANT_CLOSED.

export const TENANT_HEADER = 'x-tenant-id';
export const ALL_ROLES = ['admin', 'recruiter', 'department_user', 'support'];
export const WRITER_ROLES = ['admin', 'recruiter'];
export const READ_ALL_ROLES = ['admin', 'recruiter', 'support'];
// Kendi adına iş yapan (OAuth bağlama, toplu yükleme kuyruğu) ama aday
// yazmayan roller — destek hariç herkes.
export const SELF_WRITER_ROLES = ['admin', 'recruiter', 'department_user'];

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Firestore Timestamp | Date | ISO | ms → ms; çözülemezse NaN. */
export function toMillis(v) {
    if (v == null) return NaN;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return Date.parse(v);
    if (typeof v._seconds === 'number') return v._seconds * 1000;
    return NaN;
}

/** Şirket okunabilir mi (firestore.rules → tenantReadable). */
export function tenantIsReadable(tenant, now = Date.now()) {
    const status = typeof tenant?.status === 'string' ? tenant.status : '';
    return ['trial', 'active', 'readonly'].includes(status) && now < toMillis(tenant.readUntil);
}

/** Şirket yazmaya açık mı (firestore.rules → tenantOpenForWrites). */
export function tenantIsWritable(tenant, now = Date.now()) {
    const status = typeof tenant?.status === 'string' ? tenant.status : '';
    return ['trial', 'active'].includes(status)
        && now < toMillis(tenant.writeUntil)
        && now < toMillis(tenant.readUntil);
}

/**
 * Üyelik + şirket belgesinden erişim kararı — saf fonksiyon (testlenir).
 * @returns {{ ok: true } | { ok: false, status: number, code: string }}
 */
export function decideTenantAccess({ tenant, member, roles, write, now = Date.now() }) {
    const deny = (status, code) => ({ ok: false, status, code });
    if (!tenant || !member) return deny(403, 'NOT_A_MEMBER');
    if (member.status !== 'active') return deny(403, 'NOT_A_MEMBER');
    if (member.expiresAt != null && !(now < toMillis(member.expiresAt))) return deny(403, 'NOT_A_MEMBER');
    const role = typeof member.role === 'string' ? member.role : '';
    if (!ALL_ROLES.includes(role)) return deny(403, 'NOT_A_MEMBER');

    if (tenant.status === 'suspended') return deny(403, 'TENANT_SUSPENDED');
    if (!tenantIsReadable(tenant, now)) return deny(402, 'TENANT_CLOSED');

    if (!roles.includes(role)) return deny(403, 'FORBIDDEN');

    if (write) {
        if (role === 'support') return deny(403, 'FORBIDDEN');
        if (!tenantIsWritable(tenant, now)) return deny(402, 'TENANT_READ_ONLY');
    }
    return { ok: true };
}

const DENY_MESSAGES = {
    NOT_A_MEMBER: 'Bu şirkette yetkiniz yok.',
    FORBIDDEN: 'Bu işlem için yetkiniz yok.',
    TENANT_SUSPENDED: 'Şirket hesabı askıya alınmış.',
    TENANT_CLOSED: 'Şirketin deneme süresi sona erdi; erişim kapalı.',
    TENANT_READ_ONLY: 'Şirketin deneme süresi sona erdi; alan salt okunur.',
};

async function verifyBearer(req) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return null;
    try {
        return await admin.auth().verifyIdToken(token);
    } catch {
        return null;
    }
}

/**
 * Şirket verisine dokunan uçların kapısı.
 *
 * @param {string[]} roles izin verilen roller (varsayılan: tüm roller)
 * @param {{ write?: boolean }} opts `write` verilmezse GET/HEAD dışındaki her
 *   yöntem yazma sayılır. Veri yazmayan POST uçları (sorgu, müsaitlik) `write: false`.
 *
 * Başarılıysa: req.tenant = { id, name, status, data }, req.member (belge),
 * req.user = { uid, email, role, departments }, req.paths = tenantPaths(id).
 */
/**
 * İsteğin jetonu + verilen şirket için yetki kararı; yanıt YAZMAZ.
 * requireTenant ve kimliği isteğe bağlı uçlar (init-interview-session) kullanır.
 * @returns {Promise<{ ok: true, ctx: object } | { ok: false, status: number, body: object }>}
 */
export async function resolveTenantAccess(req, tenantId, roles = ALL_ROLES, { write } = {}) {
    const decoded = await verifyBearer(req);
    if (!decoded) return { ok: false, status: 401, body: { error: 'Kimlik doğrulama gereklidir.' } };
    if (decoded.firebase?.sign_in_provider === 'anonymous') {
        return { ok: false, status: 403, body: { error: 'Bu işlem için hesapla giriş yapılmalıdır.' } };
    }
    if (!isValidTenantId(tenantId)) {
        return { ok: false, status: 400, body: { error: 'Şirket seçilmedi.', code: 'TENANT_REQUIRED' } };
    }
    const [tenantSnap, memberSnap] = await db.getAll(
        db.doc(tenantDocPath(tenantId)),
        db.doc(tenantPaths(tenantId).member(decoded.uid))
    );
    const tenant = tenantSnap.exists ? tenantSnap.data() : null;
    const member = memberSnap.exists ? memberSnap.data() : null;
    const isWrite = typeof write === 'boolean' ? write : !READ_METHODS.has(req.method);

    const decision = decideTenantAccess({ tenant, member, roles, write: isWrite });
    if (!decision.ok) {
        return { ok: false, status: decision.status, body: { error: DENY_MESSAGES[decision.code], code: decision.code } };
    }
    return {
        ok: true,
        ctx: {
            tenant: { id: tenantId, name: tenant.name || '', status: tenant.status, data: tenant },
            member,
            user: {
                uid: decoded.uid,
                email: decoded.email || '',
                role: member.role,
                departments: Array.isArray(member.departments) ? member.departments : [],
            },
            paths: tenantPaths(tenantId),
        },
    };
}

/**
 * Şirket verisine dokunan uçların kapısı.
 *
 * @param {string[]} roles izin verilen roller (varsayılan: tüm roller)
 * @param {{ write?: boolean }} opts `write` verilmezse GET/HEAD dışındaki her
 *   yöntem yazma sayılır. Veri yazmayan POST uçları (sorgu, müsaitlik) `write: false`.
 *
 * Başarılıysa: req.tenant = { id, name, status, data }, req.member (belge),
 * req.user = { uid, email, role, departments }, req.paths = tenantPaths(id).
 */
export const requireTenant = (roles = ALL_ROLES, opts = {}) => async (req, res, next) => {
    try {
        const r = await resolveTenantAccess(req, String(req.headers[TENANT_HEADER] || ''), roles, opts);
        if (!r.ok) return res.status(r.status).json(r.body);
        Object.assign(req, r.ctx);
        return next();
    } catch {
        return res.status(500).json({ error: 'Yetki denetlenemedi.' });
    }
};

// ── Platform yöneticisi ─────────────────────────────────────────────────────
// Hub'daki PLATFORM_ADMIN_EMAILS deseni: liste ortam değişkeninden HER İSTEKTE
// okunur (değişiklik yeniden başlatmadan geçerli), e-posta doğrulanmış olmalı.
// Platform yöneticisi bu yetkiyle şirket verisi GÖREMEZ — yalnız platform
// ayarları (Gemini anahtarı, OAuth uygulaması). Şirket verisi için üyelik şart.
export function platformAdminEmails(env = process.env) {
    return String(env.PLATFORM_ADMIN_EMAILS || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}

export async function requirePlatformAdmin(req, res, next) {
    const decoded = await verifyBearer(req);
    if (!decoded) return res.status(401).json({ error: 'Kimlik doğrulama gereklidir.' });
    const email = String(decoded.email || '').toLowerCase();
    const ok = decoded.firebase?.sign_in_provider !== 'anonymous'
        && decoded.email_verified === true
        && email
        && platformAdminEmails().includes(email);
    if (!ok) return res.status(403).json({ error: 'Bu işlem için yetkiniz yok.' });
    req.user = { uid: decoded.uid, email, role: 'platform_admin' };
    return next();
}

// ── Herkese açık (aday) uçlar için şirket durumu ────────────────────────────
// Aday tarafı üye değil; yine de kapanmış/askıdaki şirketin bağlantıları
// çalışmamalı (K5) — kurallardaki tenantReadable/tenantOpenForWrites'ın aynası.
// Şirket yoksa ya da okunamıyorsa null: çağıran 404 döner (varlık sızmaz).
export async function loadPublicTenant(tenantId, { write = false } = {}) {
    if (!isValidTenantId(tenantId)) return null;
    const snap = await db.doc(tenantDocPath(tenantId)).get();
    if (!snap.exists) return null;
    const tenant = snap.data();
    if (!tenantIsReadable(tenant)) return null;
    if (write && !tenantIsWritable(tenant)) return null;
    return { id: tenantId, data: tenant, paths: tenantPaths(tenantId) };
}
