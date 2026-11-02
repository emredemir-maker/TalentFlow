// Clyro Hub köprüsü (docs/coklu-sirket-plani.md §2.3, PR 4).
//
// Signals'ın deseniyle aynı (lead-radar src/auth/hub-membership.ts, src/auth/hub-events.ts):
//
//   1. Giriş: Hub, Talent'ı `/hub-giris#code=…` ile açar. Tarayıcı kodu Talent SUNUCUSUNA verir
//      (POST /api/hub/exchange). Talent sunucusu kodu Hub'ın sunucudan sunucuya yolunda değiştirir:
//      POST {HUB}/api/apps/server-exchange, `Authorization: Bearer <HUB_EXCHANGE_SECRET>`, Origin YOK,
//      yönlendirme izlenmez. Hub değişim anında üyeliği, alanın etkinliğini, denemeyi ve uygulama
//      erişimini yeniden denetler; yanıtta Firebase giriş jetonu + alan + rol + plan + deneme bitişi
//      döner. Şirket bilgisi tarayıcıdan hiç geçmez.
//      Plan "OIDC kimlik jetonu" diyordu; Hub'daki mevcut desen paylaşılan gizli değer olduğu için o
//      kullanıldı (CX, Meet, Signals ile aynı; plan §2.3 notu).
//   2. Hub → Talent olayları: üyelikten çıkarma ve destek erişimi. Kimlik YALNIZ CLYRO-M2M-V1 HMAC
//      imzası (ham gövdenin SHA-256'sı dahil), gönderen `hub`, ±120 sn pencere, tek kullanımlık nonce.
//      Gizli değer `HUB_EVENTS_SECRET` (Hub'da aynı değer `TALENT_EVENTS_SECRET`; ters yön ayrı değer).
//
// Yazımlar Firestore transaction'ında: şirket belgesi, üyelik, kişinin şirket listesi (userTenants)
// birlikte değişir. Hub'ın verdiği rol yalnız BAŞLANGIÇ değeri (K2): var olan üyenin rolü ve
// departmanları Hub senkronunda ezilmez.
//
// Hub doğrulamasının tazeliği: Hub üyeliği yalnız kod değişiminde denetler. Hub'dan çıkarılan kişinin
// Firebase oturumu Talent'ta sürmesin diye üyeliğin `expiresAt`'i son başarılı Hub girişinden
// HUB_VERIFY_MAX_AGE_HOURS (varsayılan 24) saat sonrasıdır; kurallar ve sunucu bu alanı zaten denetler
// (isMember / decideTenantAccess). Süre dolunca kişi Hub'dan Talent'ı yeniden açar. Çıkarma olayı
// (membership-revoked) bu süreyi beklemeden üyeliği kapatır.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { admin } from '../config/firebaseAdmin.js';
import { isValidDocId, isValidTenantId, PLATFORM_PATHS, tenantDocPath, tenantPaths } from './tenantPaths.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** K5: deneme bitince 14 gün salt okunur, sonra kapalı. */
export const READ_ONLY_GRACE_MS = 14 * DAY_MS;
/** Ücretli (süresiz) planın süre alanları — kurallar `request.time < readUntil` ister. */
export const FAR_FUTURE = new Date('9999-12-31T00:00:00Z');
/** K11: destek üyeliği en çok 24 saat. */
export const SUPPORT_MAX_MS = DAY_MS;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Ortam ────────────────────────────────────────────────────────────────────

/** En az 32 karakter (Hub da aynı alt sınırı uygular); yoksa null → uç kapalı (503). */
function secretOf(v) {
    const s = typeof v === 'string' ? v.trim() : '';
    return s.length >= 32 ? s : null;
}

/** Talent → Hub kod değişimi gizli değeri (Hub'da APP_EXCHANGE_SECRETS içindeki `talent=`). */
export const hubExchangeSecret = (env = process.env) => secretOf(env.HUB_EXCHANGE_SECRET);

/**
 * Hub → Talent olay imzası gizli değeri. Değişim değeriyle aynıysa null: iki yön aynı değeri
 * paylaşırsa biri sızınca iki yön birden açılırdı (Hub tarafı da aynı kuralı uygular).
 */
export function hubEventsSecret(env = process.env) {
    const v = secretOf(env.HUB_EVENTS_SECRET);
    return v && v !== hubExchangeSecret(env) ? v : null;
}

/** Hub API kökü (…/api). Üretimde https zorunlu; bozuksa null (uç kapalı). */
export function hubApiBase(env = process.env) {
    const raw = String(env.HUB_API_URL || '').trim().replace(/\/+$/, '');
    if (!raw) return null;
    try {
        const u = new URL(raw);
        const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
        if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
        if (u.username || u.password || u.search || u.hash) return null;
        return raw;
    } catch {
        return null;
    }
}

/**
 * Hub doğrulamasının geçerlik süresi (saat, 1–24); varsayılan ve üst sınır 24 (Signals ile aynı). Üst sınır
 * bilerek dar: Hub'dan çıkarılan kişinin erişimi, çıkarma olayı gelmezse en çok bu kadar sürer.
 */
export function hubVerifyMaxAgeMs(env = process.env) {
    const n = Number(env.HUB_VERIFY_MAX_AGE_HOURS);
    const hours = Number.isInteger(n) && n >= 1 && n <= 24 ? n : 24;
    return hours * 60 * 60 * 1000;
}

// ── Saf kurallar ─────────────────────────────────────────────────────────────

/** Hub alan kimliği: uuid, küçük harfe çevrilir; değilse null (büyük harfli kopya ikinci şirket açmasın). */
export function hubTenantIdOf(v) {
    const id = typeof v === 'string' ? v.trim().toLowerCase() : '';
    return UUID_RE.test(id) && isValidTenantId(id) ? id : null;
}

const str = (v, max = 200) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null);

/** Hub kullanıcı kimliği = Firebase uid (ortak Auth). Belge kimliği olarak geçerli olmalı. */
function uidOf(v) {
    const u = str(v, 128);
    return u && isValidDocId(u) ? u : null;
}

function emailOf(v) {
    const e = typeof v === 'string' ? v.trim().toLowerCase() : '';
    return e && e.length <= 320 && EMAIL_RE.test(e) ? e : null;
}

/** K2: Hub rolü → Talent rolü. Bilinmeyen rol en dar yetki (departmansız department_user aday görmez). */
export function talentRoleFromHub(hubRole) {
    if (hubRole === 'tenant_admin') return 'admin';
    if (hubRole === 'manager') return 'recruiter';
    return 'department_user';
}

/**
 * K5: Hub planı → şirketin süre alanları. Ücretli plan süresiz; deneme `trialEndsAt`'e kadar yazılır,
 * 14 gün daha okunur. Plan bilinmiyorsa ya da deneme bitişi yoksa null (yanıt geçersiz sayılır).
 */
export function tenantTimingFromHub({ plan, trialEndsAt }) {
    if (plan === 'active') return { status: 'active', plan, writeUntil: FAR_FUTURE, readUntil: FAR_FUTURE, trialEndsAt: null };
    if (plan !== 'trial') return null;
    const end = trialEndsAt == null ? NaN : Date.parse(String(trialEndsAt));
    if (!Number.isFinite(end)) return null;
    return {
        status: 'trial',
        plan,
        writeUntil: new Date(end),
        readUntil: new Date(end + READ_ONLY_GRACE_MS),
        trialEndsAt: new Date(end),
    };
}

/**
 * Hub'ın sunucu değişimi yanıtını doğrular. SAF.
 * @returns {{kind:'ok', token, uid, email, displayName, tenant:{id,name,slug,role,plan,trialEndsAt}}
 *   | {kind:'denied', uid, tenantId, reason} | {kind:'invalid'} | {kind:'failed'}}
 */
export function parseServerExchange(status, body) {
    if (status === 401) return { kind: 'invalid' };
    if (status === 403 && body?.code === 'workspace_access_denied') {
        const uid = uidOf(body.uid);
        const tenantId = hubTenantIdOf(body.tenantId);
        // Gerekçe (Hub-Inn PR'ı ekler); eski Hub göndermez → 'unknown'.
        const reason = ['not_member', 'inactive', 'trial_expired', 'app_disabled'].includes(body.reason) ? body.reason : 'unknown';
        return uid && tenantId ? { kind: 'denied', uid, tenantId, reason } : { kind: 'failed' };
    }
    if (status !== 200 || !body || typeof body !== 'object') return { kind: 'failed' };
    const t = body.tenant && typeof body.tenant === 'object' ? body.tenant : null;
    const token = str(body.token, 8192);
    const uid = uidOf(body.uid);
    const email = emailOf(body.email);
    const tenant = t && {
        id: hubTenantIdOf(t.id),
        name: str(t.name),
        slug: str(t.slug, 100),
        role: str(t.role, 40),
        plan: str(t.plan, 20),
        trialEndsAt: t.trialEndsAt ?? null,
    };
    if (!token || !uid || !email || !tenant?.id || !tenant.name || !tenant.role) return { kind: 'failed' };
    if (!tenantTimingFromHub(tenant)) return { kind: 'failed' };
    return { kind: 'ok', token, uid, email, displayName: str(body.displayName, 200), tenant };
}

/**
 * Kodu Hub'ın sunucu yolunda değiştirir. Origin başlığı gönderilmez (Hub tarayıcı isteğini reddeder);
 * gizli değer Bearer olarak gider; yönlendirme izlenmez (gizli değer başka adrese taşınmasın).
 */
export async function exchangeHubCode(code, { apiBase, secret, fetch: doFetch = fetch, timeoutMs = 10_000 }) {
    const res = await doFetch(`${apiBase}/apps/server-exchange`, {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
        body: JSON.stringify({ app: 'talent', code }),
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
    }).catch(() => null);
    if (!res) return { kind: 'failed' };
    const body = await res.json().catch(() => null);
    return parseServerExchange(res.status, body);
}

// ── CLYRO-M2M-V1 (Hub → Talent) ─────────────────────────────────────────────
// Hub-Inn apps/api/src/services/cx-m2m.ts ve lead-radar src/auth/hub-events.ts ile birebir aynı metin:
//   CLYRO-M2M-V1 / YÖNTEM / yol+sorgu / Unix saniye / nonce / gönderen ("hub") / gövdenin SHA-256'sı (hex)

export const M2M_VERSION = 'CLYRO-M2M-V1';
export const M2M_HEADERS = {
    timestamp: 'x-clyro-m2m-timestamp',
    nonce: 'x-clyro-m2m-nonce',
    actor: 'x-clyro-m2m-actor',
    signature: 'x-clyro-m2m-signature',
};
export const M2M_WINDOW_SEC = 120;
export const HUB_ACTOR = 'hub';
const NONCE_RE = /^[A-Za-z0-9_-]{22,64}$/;
const TS_RE = /^\d{1,12}$/;
const SIG_RE = /^v1=([0-9a-f]{64})$/;

export const sha256Hex = (b) => createHash('sha256').update(b).digest('hex');

export function m2mCanonical(p) {
    return [M2M_VERSION, p.method.toUpperCase(), p.path, p.timestamp, p.nonce, p.actor, p.bodySha256].join('\n');
}

/** İmza (Hub tarafının üreteceği; testler ve belge için). */
export function m2mSign(secret, p) {
    return `v1=${createHmac('sha256', secret).update(m2mCanonical(p)).digest('hex')}`;
}

/** SAF: imzayı doğrular; nonce'un tekrar kullanılmadığına çağıran bakar. */
export function verifyHubSignature(secret, req, nowMs = Date.now()) {
    const h = (name) => {
        const v = req.headers[name];
        return typeof v === 'string' ? v : undefined;
    };
    const timestamp = h(M2M_HEADERS.timestamp);
    const nonce = h(M2M_HEADERS.nonce);
    const actor = h(M2M_HEADERS.actor);
    const signature = h(M2M_HEADERS.signature);
    if (!timestamp || !nonce || !actor || !signature) return { ok: false, reason: 'missing' };
    const sig = SIG_RE.exec(signature);
    if (!TS_RE.test(timestamp) || !NONCE_RE.test(nonce) || !sig) return { ok: false, reason: 'malformed' };
    if (actor !== HUB_ACTOR) return { ok: false, reason: 'actor' };
    if (Math.abs(nowMs / 1000 - Number(timestamp)) > M2M_WINDOW_SEC) return { ok: false, reason: 'expired' };
    const expected = createHmac('sha256', secret)
        .update(m2mCanonical({ method: req.method, path: req.path, timestamp, nonce, actor, bodySha256: sha256Hex(req.body) }))
        .digest();
    const given = Buffer.from(sig[1], 'hex');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'bad_signature' };
    return { ok: true, nonce };
}

const OCCURRED_FUTURE_SKEW_MS = M2M_WINDOW_SEC * 1000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

/** SAF: ISO 8601 (saat dilimli) ya da Unix ms; bozuk/gelecekteki değer undefined, yoksa null. */
export function parseOccurredAt(v, nowMs = Date.now()) {
    if (v === undefined || v === null) return null;
    let ms;
    if (typeof v === 'number') ms = v;
    else if (typeof v === 'string' && ISO_RE.test(v.trim())) ms = Date.parse(v.trim());
    else return undefined;
    if (!Number.isFinite(ms) || !Number.isInteger(ms) || ms < Date.UTC(2020, 0, 1) || ms > nowMs + OCCURRED_FUTURE_SKEW_MS) {
        return undefined;
    }
    return new Date(ms);
}

/**
 * SAF: `membership.removed` gövdesi — Signals'a giden olayla aynı biçim (Hub-Inn PR #67):
 * { type, tenantId, uid, email?, occurredAt? }. Bozuksa null.
 */
export function parseMembershipRemoved(json, nowMs = Date.now()) {
    if (!json || typeof json !== 'object' || json.type !== 'membership.removed') return null;
    const tenantId = hubTenantIdOf(json.tenantId);
    const uid = uidOf(json.uid);
    if (!tenantId || !uid) return null;
    let email = null;
    if (json.email !== undefined && json.email !== null) {
        email = emailOf(json.email);
        if (!email) return null;
    }
    const occurredAt = parseOccurredAt(json.occurredAt, nowMs);
    if (occurredAt === undefined) return null;
    return { type: 'membership.removed', tenantId, uid, email, occurredAt };
}

/**
 * SAF: destek erişimi gövdesi (K11, Hub yönetim konsolu):
 *   { type: 'support.grant', tenantId, uid, email, reason, requestedBy, ttlHours? (1–24, varsayılan 24) }
 *   { type: 'support.revoke', tenantId, uid, requestedBy }
 * Gerekçe zorunlu (10–500 karakter): denetim kaydına girer.
 */
export function parseSupportAccess(json) {
    if (!json || typeof json !== 'object') return null;
    const tenantId = hubTenantIdOf(json.tenantId);
    const uid = uidOf(json.uid);
    const requestedBy = emailOf(json.requestedBy);
    if (!tenantId || !uid || !requestedBy) return null;
    if (json.type === 'support.revoke') return { type: 'support.revoke', tenantId, uid, requestedBy };
    if (json.type !== 'support.grant') return null;
    const email = emailOf(json.email);
    const reason = typeof json.reason === 'string' ? json.reason.trim() : '';
    if (!email || reason.length < 10 || reason.length > 500) return null;
    let ttlHours = 24;
    if (json.ttlHours !== undefined) {
        if (!Number.isInteger(json.ttlHours) || json.ttlHours < 1 || json.ttlHours > 24) return null;
        ttlHours = json.ttlHours;
    }
    return { type: 'support.grant', tenantId, uid, email, reason, requestedBy, ttlMs: Math.min(ttlHours * 3_600_000, SUPPORT_MAX_MS) };
}

const toMs = (v) => {
    if (v == null) return NaN;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'string') return Date.parse(v);
    return NaN;
};

/**
 * SAF: Hub girişinde var olan üyeliğe ne olacağı.
 *   'create'  — üyelik yok: Hub rolüyle açılır.
 *   'refresh' — etkin üye: Hub doğrulaması yenilenir, rol ve departmanlar KORUNUR (K2).
 *   'rejoin'  — Hub'ın kapattığı üyelik (kişi Hub'dan çıkarılıp yeniden eklendi): eski Talent rolü GERİ
 *               GELMEZ (ör. eski yönetici sıradan üye olarak yeniden eklendiyse); rol Hub'dan, departman yok.
 *   'convert' — destek üyeliği (süreli, salt okunur) Hub üyeliğine döner: rol Hub'dan.
 *   'blocked' — Talent yöneticisinin kaldırdığı (ya da yolu bilinmeyen eski) üyelik: Hub girişi yeniden
 *               AÇMAZ (Signals 3b-4 ile aynı). Destek kaydı da bu engeli aşamaz (güvenlik incelemesi).
 */
export function decideHubLogin(member) {
    if (!member) return 'create';
    if (member.status === 'removed' && member.removedVia === 'admin') return 'blocked';
    if (member.role === 'support') return 'convert';
    if (member.status === 'removed') return member.removedVia === 'hub' ? 'rejoin' : 'blocked';
    return 'refresh';
}

/** Kişinin şirket listesindeki satır. */
const listEntry = (name, role) => ({ name, role });

// ── Firestore yazımları ─────────────────────────────────────────────────────

/**
 * Başarılı Hub girişi: şirket belgesi (yoksa açılır; ad, plan ve K5 süreleri Hub'dan), üyelik ve
 * şirket listesi tek transaction'da. Askıya alınmış (`suspended`) şirketin durumu Hub senkronunda
 * değişmez (yalnız platform kaldırır).
 * @returns {Promise<{ status: 'ok', role: string, created: boolean } | { status: 'blocked' }>}
 */
export async function applyHubLogin({ db, hub, now = new Date(), env = process.env, startedAt = now }) {
    const t = hub.tenant;
    const paths = tenantPaths(t.id);
    const tenantRef = db.doc(tenantDocPath(t.id));
    const memberRef = db.doc(paths.member(hub.uid));
    const listRef = db.doc(PLATFORM_PATHS.userTenants(hub.uid));
    const timing = tenantTimingFromHub(t);
    const verifiedUntil = new Date(now.getTime() + hubVerifyMaxAgeMs(env));

    return db.runTransaction(async (tx) => {
        const [tenantSnap, memberSnap] = await tx.getAll(tenantRef, memberRef);
        const cur = tenantSnap.exists ? tenantSnap.data() : null;
        const tenantPatch = {
            name: t.name,
            slug: t.slug || null,
            hubTenantId: t.id,
            plan: timing.plan,
            trialEndsAt: timing.trialEndsAt,
            writeUntil: timing.writeUntil,
            readUntil: timing.readUntil,
            // Askı ve elle verilen salt okunur durum yalnız platformdan kalkar; Hub senkronu ezmez.
            status: ['suspended', 'readonly'].includes(cur?.status) ? cur.status : timing.status,
            hubSyncedAt: now,
        };
        if (cur) tx.update(tenantRef, tenantPatch);
        else tx.set(tenantRef, { ...tenantPatch, createdAt: now, createdVia: 'hub' });

        const member = memberSnap.exists ? memberSnap.data() : null;
        const action = decideHubLogin(member);
        if (action === 'blocked') return { status: 'blocked' };
        // Yarış (güvenlik incelemesi): Hub kodu doğruladıktan sonra gelen çıkarma olayı üyeliği kapattıysa,
        // o eski doğrulama üyeliği yeniden açmaz. Hub doğrulaması `startedAt`'ten sonra yapıldı; kapanış
        // ondan sonraysa kişi Hub'dan yeniden girmeli.
        if (action === 'rejoin' && toMs(member.hubRemovedAt) >= startedAt.getTime()) return { status: 'stale' };

        const hubFields = {
            status: 'active',
            hubRole: t.role,
            email: hub.email,
            hubVerifiedAt: now,
            expiresAt: verifiedUntil,
            source: 'hub',
        };
        let role;
        if (action === 'create' || action === 'convert' || action === 'rejoin') {
            role = talentRoleFromHub(t.role);
            const base = { ...hubFields, role, departments: [], ...(hub.displayName ? { displayName: hub.displayName } : {}) };
            const del = admin.firestore.FieldValue.delete();
            if (action === 'create') tx.set(memberRef, { ...base, createdAt: now });
            else {
                tx.update(memberRef, {
                    ...base,
                    supportReason: del,
                    supportRequestedBy: del,
                    removedAt: del,
                    removedBy: del,
                    removedVia: del,
                    hubRemovedAt: del,
                });
            }
        } else {
            role = member.role;
            tx.update(memberRef, {
                ...hubFields,
                removedAt: admin.firestore.FieldValue.delete(),
                removedBy: admin.firestore.FieldValue.delete(),
                removedVia: admin.firestore.FieldValue.delete(),
                hubRemovedAt: admin.firestore.FieldValue.delete(),
            });
        }
        tx.set(listRef, { tenants: { [t.id]: listEntry(t.name, role) } }, { merge: true });
        tx.create(db.collection(paths.accessLogs()).doc(), {
            action: action === 'create' ? 'member_joined_from_hub' : member?.status === 'removed' ? 'member_restored_from_hub' : 'hub_login',
            uid: hub.uid,
            email: hub.email,
            role,
            at: now.toISOString(),
        });
        return { status: 'ok', role, created: action === 'create' };
    });
}

/**
 * Hub'ın üyelikten çıkardığı kişinin Talent üyeliğini KAPATIR (silmez; departman ataması korunur,
 * yeniden eklenirse geri gelir). `removedVia: 'hub'`: sonraki başarılı Hub girişi yeniden açar;
 * Talent yöneticisinin kaldırdığı üyelik Hub tarafından açılmaz.
 *
 * `occurredAt` (Signals güvenlik incelemesi, 2026-11-02): geciken/yeniden denenen olay, o andan SONRA
 * Hub'dan yeniden girmiş (hubVerifiedAt daha yeni) üyeliği kapatmaz. Destek üyeliği bu olayla
 * kapanmaz (Hub'daki alan üyeliğiyle ilgisi yok; kendi süresi ve iptal olayı var).
 * Son yönetici kilidi UYGULANMAZ: Hub'dan çıkarılan kişi Talent'ta yönetici kalamaz (yönetici Hub'da
 * yeniden atanır, ilk girişinde Talent yöneticisi olur).
 * @returns {Promise<'closed'|'stale'|'none'>}
 */
export async function closeMembershipFromHub({ db, tenantId, uid, occurredAt = null, now = new Date(), reason = 'hub_removed' }) {
    const paths = tenantPaths(tenantId);
    const memberRef = db.doc(paths.member(uid));
    const listRef = db.doc(PLATFORM_PATHS.userTenants(uid));
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(memberRef);
        const m = snap.exists ? snap.data() : null;
        if (!m || m.status !== 'active' || m.role === 'support') return 'none';
        if (occurredAt && toMs(m.hubVerifiedAt) > occurredAt.getTime()) return 'stale';
        tx.update(memberRef, {
            status: 'removed',
            removedAt: now.toISOString(),
            removedBy: 'hub',
            // Kaldırma yolu ayrı alanda: `removedBy` yöneticinin uid'si de olabilir.
            removedVia: 'hub',
            // Kapanış anı (Date): uçuştaki bir Hub girişi bundan önce doğrulandıysa üyeliği yeniden açmaz.
            hubRemovedAt: now,
            hubVerifiedAt: admin.firestore.FieldValue.delete(),
        });
        tx.set(listRef, { tenants: { [tenantId]: admin.firestore.FieldValue.delete() } }, { merge: true });
        tx.create(db.collection(paths.accessLogs()).doc(), {
            action: 'member_removed_by_hub',
            uid: 'hub',
            target: uid,
            reason,
            at: now.toISOString(),
        });
        return 'closed';
    });
}

/**
 * K11: süreli, salt okunur destek üyeliği. Şirket Talent'ta yoksa 'no_tenant'. Kişinin şirkette destek
 * dışı bir üyelik kaydı varsa (etkin ya da kaldırılmış) 'already_member': destek kaydı onu ezmez. Açılış
 * şirketin denetim defterine (accessLogs) gerekçesiyle yazılır; şirket yöneticisi kendi defterinde görür.
 * @returns {Promise<'granted'|'no_tenant'|'already_member'>}
 */
export async function grantSupportAccess({ db, ev, now = new Date() }) {
    const paths = tenantPaths(ev.tenantId);
    const tenantRef = db.doc(tenantDocPath(ev.tenantId));
    const memberRef = db.doc(paths.member(ev.uid));
    const listRef = db.doc(PLATFORM_PATHS.userTenants(ev.uid));
    const expiresAt = new Date(now.getTime() + ev.ttlMs);
    return db.runTransaction(async (tx) => {
        const [tenantSnap, memberSnap] = await tx.getAll(tenantRef, memberRef);
        if (!tenantSnap.exists) return 'no_tenant';
        const m = memberSnap.exists ? memberSnap.data() : null;
        // Gerçek (destek dışı) üyelik hangi durumda olursa olsun ezilmez: kaldırılmış üyeliğin üzerine destek
        // kaydı yazılsaydı yöneticinin engeli (removedVia: 'admin') ve rol/departman kaydı kaybolurdu.
        if (m && m.role !== 'support') return 'already_member';
        tx.set(memberRef, {
            role: 'support',
            departments: [],
            status: 'active',
            email: ev.email,
            expiresAt,
            supportReason: ev.reason,
            supportRequestedBy: ev.requestedBy,
            source: 'support',
            createdAt: now,
        });
        tx.set(listRef, { tenants: { [ev.tenantId]: listEntry(tenantSnap.data()?.name || ev.tenantId, 'support') } }, { merge: true });
        tx.create(db.collection(paths.accessLogs()).doc(), {
            action: 'support_access_granted',
            uid: 'hub',
            target: ev.uid,
            email: ev.email,
            requestedBy: ev.requestedBy,
            reason: ev.reason,
            expiresAt: expiresAt.toISOString(),
            at: now.toISOString(),
        });
        return 'granted';
    });
}

/** Destek üyeliğini süresinden önce kapatır. Destek dışı üyeliğe dokunmaz. */
export async function revokeSupportAccess({ db, ev, now = new Date() }) {
    const paths = tenantPaths(ev.tenantId);
    const memberRef = db.doc(paths.member(ev.uid));
    const listRef = db.doc(PLATFORM_PATHS.userTenants(ev.uid));
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(memberRef);
        const m = snap.exists ? snap.data() : null;
        if (!m || m.role !== 'support' || m.status !== 'active') return 'none';
        tx.update(memberRef, { status: 'removed', removedAt: now.toISOString(), removedBy: 'hub', removedVia: 'support_revoked', expiresAt: now });
        tx.set(listRef, { tenants: { [ev.tenantId]: admin.firestore.FieldValue.delete() } }, { merge: true });
        tx.create(db.collection(paths.accessLogs()).doc(), {
            action: 'support_access_revoked',
            uid: 'hub',
            target: ev.uid,
            requestedBy: ev.requestedBy,
            at: now.toISOString(),
        });
        return 'revoked';
    });
}

/**
 * Nonce'u bir kez yazar (`create` var olan belgede başarısız olur → tekrar). `expireAt`: Firestore TTL
 * politikası tanımlanırsa eski kayıtlar kendiliğinden silinir (imza penceresinden uzun: 10 dk).
 */
export async function consumeHubNonce(db, nonce, now = new Date()) {
    try {
        await db.doc(PLATFORM_PATHS.hubNonce(nonce)).create({ seenAt: now, expireAt: new Date(now.getTime() + 10 * 60_000) });
        return true;
    } catch (err) {
        if (err?.code === 6 || /already exists/i.test(String(err?.message))) return false;
        throw err;
    }
}

/**
 * Hub deneme bitişi nedeniyle reddettiyse (K5): şirketin yazma süresi hemen kapanır, okuma 14 gün daha
 * açık kalır (zaten daha erken kapanıyorsa öne alınmaz). Ücretli plandan düşen şirket de böylece salt
 * okunur banda girer; açık oturumlar Hub doğrulamasının süresini beklemez.
 */
export async function clampTenantForExpiredTrial({ db, tenantId, now = new Date() }) {
    const ref = db.doc(tenantDocPath(tenantId));
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return false;
        const t = snap.data();
        const readCap = now.getTime() + READ_ONLY_GRACE_MS;
        const patch = {};
        if (!(toMs(t.writeUntil) <= now.getTime())) patch.writeUntil = now;
        if (!(toMs(t.readUntil) <= readCap)) patch.readUntil = new Date(readCap);
        if (Object.keys(patch).length === 0) return false;
        tx.update(ref, { ...patch, hubSyncedAt: now });
        return true;
    });
}
