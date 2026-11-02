// ŞİRKET BAŞINA AI BÜTÇESİ — atomik ayırma, sonra kapatma (plan §5.2, K8).
//
// ── NEDEN "ÖNCE SAY SONRA YAZ" DEĞİL ────────────────────────────────────────
// Eski fren (aiBudget.js) günün toplamını OKUYUP sınırla karşılaştırıyor,
// tüketimi çağrı bitince ayrıca YAZIYORDU. Arada geçen süre (bir Gemini
// çağrısı saniyeler sürer) boyunca aynı anda başlayan her istek aynı eski
// toplamı görür ve hepsi geçer: 20 eşzamanlı istek, 20 kez "bütçe var" der.
// Örnek sayısı arttıkça (maxInstances) sapma da büyür.
//
// Burada sınır denetimi ve sayaç artırımı TEK bir Firestore işleminde
// (transaction) yapılıyor: işlem belgeyi okur, koşul sağlanıyorsa AYNI işlemde
// "ayrılan" (reserved) sayacı artırır. İki eşzamanlı işlem aynı belgeyi
// değiştirmeye kalkarsa Firestore birini yeniden çalıştırır ve o, diğerinin
// ayırmasını görerek karar verir. Yani koşul ile yazma arasında başka bir
// isteğin araya girebileceği an yok.
//
// ── AYIR → KAPAT ────────────────────────────────────────────────────────────
// Bir çağrının kaç token yakacağı ancak bittiğinde bilinir. Bu yüzden:
//   1. reserveAi: tahmini tutar `quota.reserved`'a eklenir (koşullu, işlemde)
//   2. çağrı yapılır
//   3. settleAi: gerçek tüketim `totals`'a eklenir, tahmin `reserved`'dan düşülür
//      (koşulsuz artırım — FieldValue.increment zaten atomik, işlem gerekmez)
//   Çağrı başarısızsa releaseAi yalnız tahmini geri bırakır.
// Denetim `kullanılan + ayrılan + bu tahmin > sınır` ise reddeder; eşzamanlı
// çağrılar birbirinin ayırmasını gördüğü için toplam sınırı en fazla son
// çağrının tahmin hatası kadar aşabilir (tahmin < gerçek olduğunda).
//
// ── GÜN DÖNÜMÜ ──────────────────────────────────────────────────────────────
// Sayaç belgesi `tenants/{t}/usage/{YYYY-MM-DD}` (UTC; Türkiye saatiyle 03:00).
// Yeni gün yeni belge demek: "aşınca dur, ertesi gün kendiliğinden devam"
// (K8) için ayrı bir sıfırlama işi yok. Süreç ayırıp kapatamadan çökerse
// ayrılan tutar o günün belgesinde asılı kalır; ertesi gün zaten sıfırdan
// başlanır.
//
// ── SIRA (plan §5.2) ────────────────────────────────────────────────────────
//   (1) platform güvenlik tavanı — aiBudget.js, ortam değişkenleri
//   (2) şirket günlük token tavanı
//   (3) şirket günlük aramalı çağrı adedi
//   (4) kullanıcı başına pay (aday tarafı tek kova: 'anon')
//   (+) şirket genelinde dakikalık çağrı sayısı (tüm sunucu örnekleri)
//
// ── ALTYAPI HATASI ──────────────────────────────────────────────────────────
// Firestore'a ulaşılamazsa (ağ, kota, işlem çakışması tükendi) çağrı
// DURDURULMAZ ve "degraded" kira ile devam eder; gerçek tüketim yine yazılmaya
// çalışılır. Bilerek: ölçüm sistemi arızası müşterinin işini durdurmamalı
// (usage.js ile aynı ilke). Maliyet güvencesi bu durumda (1) platform tavanı.
// Bütçe aşımı ise asla bu yola düşmez: QuotaError işlemin İÇİNDE atılır.
import crypto from 'node:crypto';
import { db, admin } from '../config/firebaseAdmin.js';
import { childLogger } from './logger.js';
import { dayKey, normalizeLabel } from './usage.js';
import { tenantPaths, isValidTenantId } from './tenantPaths.js';
import { PLAN_UNITS } from './plans.js';

const log = childLogger('aiQuota');

/** Arayüzün tanıdığı sabit im (src/utils/aiErrorHint.js). */
export const BUDGET_CODE = 'AI_DAILY_BUDGET_EXCEEDED';
export const RATE_CODE = 'AI_RATE_LIMITED';
export const PLAN_CODE = 'PLAN_LIMIT_REACHED';

/** Aday tarafının (anonim oturum) ortak kovası. */
export const ANON_KEY = 'anon';

/** Dakikalık sayaç belgesinin ömrü — Firestore TTL ilkesi `expiresAt` alanında. */
const RATE_DOC_TTL_MS = 2 * 60 * 1000;

export class QuotaError extends Error {
    /**
     * @param {string} code BUDGET_CODE | RATE_CODE | PLAN_CODE
     * @param {string} message kullanıcıya gösterilecek Türkçe metin
     * @param {object} [detail]
     */
    constructor(code, message, detail = {}) {
        super(`${code}: ${message}`);
        this.name = 'QuotaError';
        this.code = code;
        this.userMessage = message;
        this.status = 429;
        this.detail = detail;
    }
}

/** Gün belgesinin anahtarı (UTC). */
export { dayKey };

/** Aylık paket sayacı belgesi: `month-YYYY-MM`. */
export function monthKey(now) {
    return `month-${now.toISOString().slice(0, 7)}`;
}

/** Dakikalık sayaç belgesi: `YYYYMMDDHHmm` (UTC). */
export function minuteKey(now) {
    return now.toISOString().slice(0, 16).replace(/[-T:]/g, '');
}

/** Sonraki UTC gece yarısı — "yarın 03:00'te yenilenir" metni için. */
export function nextResetAt(now) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    return d.toISOString();
}

/**
 * Kullanıcı anahtarı Firestore alan adına güvenle girsin. Biçime uymayan uid
 * aday kovasına DÜŞMEZ (iç kullanıcı aday payını tüketmesin): özetlenir.
 * Boş anahtar (ör. işi açanı bilinmeyen eski toplu iş) ayrı 'system' kovası.
 */
export function safeUserKey(k) {
    const s = String(k || '');
    if (s === ANON_KEY || /^[A-Za-z0-9_-]{1,128}$/.test(s)) return s;
    if (!s) return 'system';
    return `h_${crypto.createHash('sha256').update(s).digest('hex').slice(0, 32)}`;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Bir çağrının token tahmini. Girdi metni ~3 karakter/token (Türkçe için
 * muhafazakâr). Ses/dosya girdisi BAYT üzerinden: Gemini sesi saniyede ~32
 * token sayar; düşük bit hızlı (16 kbps ≈ 2 KB/sn) seste bile 1 KB ≈ 16
 * tokendan aşağı düşülmez → çözülmüş bayt / 64 (≈ 2 kat pay). Çıktı payı
 * istenen tavanın TAMAMI (en çok 32k): düşük tahmin, eşzamanlı çağrılarda
 * sınırın tahmin farkı kadar aşılması demek.
 */
export function estimateTokens(prompt, maxOutputTokens = 8192) {
    let chars = 0;
    let binaryTokens = 0;
    if (typeof prompt === 'string') chars = prompt.length;
    else if (Array.isArray(prompt)) {
        for (const p of prompt) {
            if (typeof p === 'string') chars += p.length;
            else if (p?.inlineData?.data) binaryTokens += Math.ceil((String(p.inlineData.data).length * 0.75) / 64);
            else if (p?.text) chars += String(p.text).length;
        }
    } else if (prompt != null) chars = JSON.stringify(prompt).length;
    const out = Math.min(Math.max(num(maxOutputTokens) || 8192, 256), 32768);
    return Math.ceil(chars / 3) + binaryTokens + out;
}

/**
 * Ayırma kararı — saf fonksiyon, Firestore'suz testlenir.
 *
 * @param {object} p
 * @param {object} p.usage    gün belgesi (yoksa {})
 * @param {object} p.rate     dakika belgesi (yoksa {})
 * @param {object} p.limits   resolveAiLimits çıktısı
 * @param {string} p.userKey
 * @param {boolean} p.anonymous
 * @param {number} p.estimate
 * @param {boolean} p.grounded
 * @returns {{ ok: true } | { ok: false, code: string, reason: string, detail: object }}
 */
export function decideReservation({ usage = {}, rate = {}, limits, userKey, anonymous, estimate, grounded }) {
    const used = num(usage?.totals?.totalTokens);
    const reserved = num(usage?.quota?.reserved);
    const user = usage?.byUser?.[userKey] || {};
    const userUsed = num(user.totalTokens) + num(user.reserved);
    const sharePct = anonymous ? limits.anonSharePct : limits.userSharePct;
    const userLimit = Math.floor((limits.dailyTokens * sharePct) / 100);
    const deny = (code, reason, detail) => ({ ok: false, code, reason, detail });

    // Aday tarafının KENDİ dakikalık sınırı: bağlantıyı bilen biri şirket
    // genelindeki dakikalık hakkı doldurup iç kullanıcıları durduramasın.
    if (anonymous && num(rate?.anon) >= limits.anonPerMinuteCalls) {
        return deny(RATE_CODE, 'anon-minute', { count: num(rate?.anon), limit: limits.anonPerMinuteCalls });
    }
    if (num(rate?.count) >= limits.perMinuteCalls) {
        return deny(RATE_CODE, 'tenant-minute', { count: num(rate?.count), limit: limits.perMinuteCalls });
    }
    if (used + reserved + estimate > limits.dailyTokens) {
        return deny(BUDGET_CODE, 'tenant-tokens', { used, reserved, limit: limits.dailyTokens });
    }
    if (grounded && num(usage?.quota?.groundedCalls) >= limits.dailyGroundedCalls) {
        return deny(BUDGET_CODE, 'tenant-grounded', {
            used: num(usage?.quota?.groundedCalls),
            limit: limits.dailyGroundedCalls,
        });
    }
    if (userUsed + estimate > userLimit) {
        return deny(BUDGET_CODE, anonymous ? 'anon-share' : 'user-share', { used: userUsed, limit: userLimit });
    }
    return { ok: true };
}

const fmt = (n) => num(n).toLocaleString('tr-TR');

/** Reddin kullanıcıya gösterilecek metni. */
export function denyMessage(reason, detail = {}) {
    switch (reason) {
        case 'tenant-tokens':
            return `Şirketinizin bugünkü AI kotası doldu (${fmt(detail.used)} / ${fmt(detail.limit)} token). `
                + "Kota yarın 03:00'te (TSİ) yenilenir.";
        case 'tenant-grounded':
            return `Şirketinizin bugünkü aramalı AI sorgusu hakkı doldu (${fmt(detail.used)} / ${fmt(detail.limit)}). `
                + "Hak yarın 03:00'te (TSİ) yenilenir.";
        case 'user-share':
            return `Bugünkü kişisel AI payınız doldu (${fmt(detail.used)} / ${fmt(detail.limit)} token); `
                + "şirketin kalan kotası diğer kullanıcılar için ayrıldı. Pay yarın 03:00'te (TSİ) yenilenir.";
        case 'anon-share':
            return 'Aday tarafı için ayrılan bugünkü AI kotası doldu. Başvurunuz yine kaydedilir; '
                + 'otomatik doldurma ve değerlendirme şu an yapılamıyor.';
        case 'anon-minute':
            return 'Şu an çok sayıda başvuru işleniyor. Lütfen bir dakika sonra tekrar deneyin.';
        case 'tenant-minute':
            return 'Şirketiniz için dakikalık AI istek sınırına ulaşıldı. Lütfen bir dakika sonra tekrar deneyin.';
        default:
            return 'AI kotası doldu.';
    }
}

/** Firestore işlem çakışması / zaman aşımı mı (gRPC ABORTED = 10, DEADLINE_EXCEEDED = 4)? */
export function isContention(err) {
    return [10, 4, 'aborted', 'deadline-exceeded'].includes(err?.code)
        || /ABORTED|contention|DEADLINE_EXCEEDED/i.test(String(err?.message || ''));
}

/** Ret sayacının belgesi (gün belgesinden ayrı; `day` alanı yok → günlük listeye girmez). */
export function rejectedKey(day) {
    return `rejected-${day}`;
}

const DEGRADED_PER_MINUTE = 30;
let degraded = { minute: '', n: 0 };
/** Testler için. */
export function resetDegradedSlots() {
    degraded = { minute: '', n: 0 };
}
function takeDegradedSlot(now) {
    const m = minuteKey(now);
    if (degraded.minute !== m) degraded = { minute: m, n: 0 };
    if (degraded.n >= DEGRADED_PER_MINUTE) return false;
    degraded.n += 1;
    return true;
}

function inc(n) {
    return admin.firestore.FieldValue.increment(n);
}

function usageRef(tenantId, now) {
    return db.doc(tenantPaths(tenantId).usageDay(dayKey(now)));
}

/**
 * Bütçeden tahmini tutarı atomik olarak ayırır.
 *
 * @param {import('./aiContext.js').AiContext} ctx
 * @param {{ estimate: number, grounded?: boolean, now?: Date }} opts
 * @returns {Promise<object>} kira — settleAi / releaseAi'ye verilir
 * @throws {QuotaError} sınır aşıldıysa
 */
export async function reserveAi(ctx, { estimate, grounded = false, now = new Date() }) {
    if (!ctx || !isValidTenantId(ctx.tenantId)) throw new Error('AI_TENANT_REQUIRED');
    const userKey = safeUserKey(ctx.userKey);
    const est = Math.max(1, Math.ceil(num(estimate)));
    const day = dayKey(now);
    const lease = { tenantId: ctx.tenantId, userKey, day, estimate: est, grounded, degraded: false, settled: false };
    const uRef = usageRef(ctx.tenantId, now);
    const rRef = db.doc(tenantPaths(ctx.tenantId).rateMinute(minuteKey(now)));

    try {
        await db.runTransaction(async (tx) => {
            const [uSnap, rSnap] = await tx.getAll(uRef, rRef);
            const decision = decideReservation({
                usage: uSnap.exists ? uSnap.data() : {},
                rate: rSnap.exists ? rSnap.data() : {},
                limits: ctx.limits,
                userKey,
                anonymous: !!ctx.anonymous,
                estimate: est,
                grounded,
            });
            if (!decision.ok) {
                throw new QuotaError(decision.code, denyMessage(decision.reason, decision.detail), {
                    reason: decision.reason,
                    resetAt: decision.code === RATE_CODE ? null : nextResetAt(now),
                });
            }
            tx.set(
                uRef,
                {
                    day,
                    quota: { reserved: inc(est), ...(grounded ? { groundedCalls: inc(1) } : {}) },
                    byUser: { [userKey]: { reserved: inc(est) } },
                },
                { merge: true }
            );
            tx.set(
                rRef,
                { count: inc(1), ...(ctx.anonymous ? { anon: inc(1) } : {}), expiresAt: new Date(now.getTime() + RATE_DOC_TTL_MS) },
                { merge: true }
            );
        });
    } catch (err) {
        if (err instanceof QuotaError) {
            // Ret sayısı panel için — AYRI belgede: reddedilen istek akını
            // ayırma belgesinde çakışma yaratıp geçerli çağrıları düşürmesin.
            void db
                .doc(tenantPaths(ctx.tenantId).usageDay(rejectedKey(day)))
                .set({ count: inc(1) }, { merge: true })
                .catch(() => {});
            log.warn({ tenantId: ctx.tenantId, reason: err.detail?.reason }, 'AI çağrısı kotaya takıldı');
            throw err;
        }
        // İŞLEM ÇAKIŞMASI (ABORTED) altyapı arızası değil, yoğunluk: aynı
        // şirketin çok sayıda eşzamanlı çağrısı. Burada "ölçümsüz devam"
        // demek, kotayı yoğunluk yaratarak atlatmanın yolu olurdu; geçici ret
        // (dakikalık sınırla aynı kod, bekleyip yeniden denenir).
        if (isContention(err)) {
            log.warn({ tenantId: ctx.tenantId }, 'kota işlemi çakıştı — geçici ret');
            throw new QuotaError(RATE_CODE, 'Şirketiniz için şu an çok sayıda eşzamanlı AI isteği var. Lütfen birkaç saniye sonra tekrar deneyin.', {
                reason: 'contention',
                resetAt: null,
            });
        }
        // Aday tarafı ölçümsüz geçmez: altyapı arızasında da geçici ret.
        if (ctx.anonymous) {
            log.warn({ err: err?.message, tenantId: ctx.tenantId }, 'kota ayrılamadı — aday çağrısı reddedildi');
            throw new QuotaError(RATE_CODE, 'AI hizmeti şu an yoğun. Lütfen biraz sonra tekrar deneyin.', { reason: 'unavailable', resetAt: null });
        }
        // İç kullanıcı: süreç başına dakikada en çok DEGRADED_PER_MINUTE ölçümsüz
        // kira; arıza sürerse o da geçici ret.
        if (!takeDegradedSlot(now)) {
            throw new QuotaError(RATE_CODE, 'AI hizmeti şu an yoğun. Lütfen biraz sonra tekrar deneyin.', { reason: 'unavailable', resetAt: null });
        }
        log.warn({ err: err?.message, tenantId: ctx.tenantId }, 'kota ayrılamadı — çağrı ölçümle devam ediyor');
        lease.degraded = true;
    }
    return lease;
}

/** Etiket/kullanıcı/toplam artırımları — settle ve önbellek isabeti ortak. */
function usageIncrements({ label, modelId, inTokens, outTokens, totalTokens, cached, day }) {
    const key = normalizeLabel(label);
    const block = {
        calls: inc(1),
        cacheHits: inc(cached ? 1 : 0),
        inTokens: inc(inTokens),
        outTokens: inc(outTokens),
        totalTokens: inc(totalTokens),
    };
    return {
        day,
        totals: block,
        byLabel: { [key]: { ...block, model: modelId || 'bilinmiyor' } },
    };
}

/**
 * Biten çağrının gerçek tüketimini yazar ve ayırmayı kapatır.
 * Ölçüm hatası işi durdurmaz (yutulur, loglanır).
 */
export async function settleAi(lease, { label, modelId = '', usage, now = new Date() } = {}) {
    if (!lease || lease.settled) return;
    lease.settled = true;
    const inTokens = num(usage?.inTokens);
    const outTokens = num(usage?.outTokens);
    const totalTokens = num(usage?.totalTokens) || inTokens + outTokens;
    const paths = tenantPaths(lease.tenantId);
    const base = usageIncrements({ label, modelId, inTokens, outTokens, totalTokens, cached: false, day: lease.day });
    const reservedBack = lease.degraded ? 0 : -lease.estimate;
    try {
        const batch = db.batch();
        batch.set(
            db.doc(paths.usageDay(lease.day)),
            {
                ...base,
                quota: { reserved: inc(reservedBack) },
                byUser: {
                    [lease.userKey]: {
                        calls: inc(1),
                        totalTokens: inc(totalTokens),
                        reserved: inc(reservedBack),
                    },
                },
            },
            { merge: true }
        );
        // Aylık toplam (raporlama): ayrı belge, `day` alanı yok → günlük
        // listeye karışmaz.
        batch.set(
            db.doc(paths.usageDay(monthKey(now))),
            {
                month: monthKey(now).slice(6),
                totals: { calls: inc(1), totalTokens: inc(totalTokens), inTokens: inc(inTokens), outTokens: inc(outTokens) },
            },
            { merge: true }
        );
        await batch.commit();
    } catch (err) {
        log.warn({ err: err?.message, tenantId: lease.tenantId }, 'şirket kullanımı yazılamadı');
    }
}

/** Çağrı başarısız: yalnız ayrılan tahmini geri bırakır. */
export async function releaseAi(lease) {
    if (!lease || lease.settled) return;
    lease.settled = true;
    if (lease.degraded) return;
    try {
        await db.doc(tenantPaths(lease.tenantId).usageDay(lease.day)).set(
            {
                // Başarısız aramalı çağrı adet hakkından da düşmez.
                quota: { reserved: inc(-lease.estimate), ...(lease.grounded ? { groundedCalls: inc(-1) } : {}) },
                byUser: { [lease.userKey]: { reserved: inc(-lease.estimate) } },
            },
            { merge: true }
        );
    } catch (err) {
        log.warn({ err: err?.message, tenantId: lease.tenantId }, 'ayrılan kota geri bırakılamadı');
    }
}

/** Önbellek isabeti: token yok, kota yok; yalnız sayılır (önbellek oranı). */
export async function recordCacheHit(ctx, { label, modelId = '', now = new Date() } = {}) {
    if (!ctx || !isValidTenantId(ctx.tenantId)) return;
    try {
        await usageRef(ctx.tenantId, now).set(
            usageIncrements({ label, modelId, inTokens: 0, outTokens: 0, totalTokens: 0, cached: true, day: dayKey(now) }),
            { merge: true }
        );
    } catch (err) {
        log.warn({ err: err?.message }, 'önbellek isabeti yazılamadı');
    }
}

/**
 * Aylık paket birimini atomik olarak düşer (ön analiz, mülakat değerlendirmesi).
 * Sınır yoksa (null) yalnız sayar. Aynı ilke: koşul ve artırım tek işlemde.
 *
 * @param {import('./aiContext.js').AiContext} ctx
 * @param {'prescreen'|'interviewEval'|'interviewHour'} unit
 * @param {number} [n=1]
 * @throws {QuotaError} PLAN_CODE
 */
export async function consumePlanUnit(ctx, unit, n = 1, now = new Date()) {
    const field = PLAN_UNITS[unit];
    if (!field) throw new Error(`Bilinmeyen paket birimi: ${unit}`);
    if (!ctx || !isValidTenantId(ctx.tenantId)) throw new Error('AI_TENANT_REQUIRED');
    const count = Math.max(1, Math.floor(num(n)));
    const limit = ctx.planLimits ? ctx.planLimits[field] : null;
    const ref = db.doc(tenantPaths(ctx.tenantId).usageDay(monthKey(now)));
    try {
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const used = num(snap.exists ? snap.data()?.units?.[unit] : 0);
            if (limit != null && used + count > limit) {
                throw new QuotaError(
                    PLAN_CODE,
                    `Paketinizin bu ayki ${unitLabel(unit)} hakkı doldu (${fmt(used)} / ${fmt(limit)}). `
                        + 'Hak ay başında yenilenir; paketinizi yükseltmek için yöneticinizle görüşün.',
                    { unit, used, limit }
                );
            }
            tx.set(ref, { month: monthKey(now).slice(6), units: { [unit]: inc(count) } }, { merge: true });
        });
    } catch (err) {
        if (err instanceof QuotaError) throw err;
        // Aynı ilke: sayaç arızası işi durdurmaz.
        log.warn({ err: err?.message, tenantId: ctx.tenantId, unit }, 'paket birimi düşülemedi');
    }
}

function unitLabel(unit) {
    return { prescreen: 'ön analiz', interviewEval: 'mülakat değerlendirmesi', interviewHour: 'mülakat saati' }[unit] || unit;
}

/**
 * Bugünkü şirket tüketimi ve kalan bütçe — panel ve toplu iş ön denetimi.
 * @returns {Promise<{ used: number, reserved: number, remaining: number, groundedCalls: number, byUser: object, rejected: number }>}
 */
export async function tenantUsageToday(tenantId, limits, now = new Date()) {
    const [snap, rej] = await db.getAll(usageRef(tenantId, now), db.doc(tenantPaths(tenantId).usageDay(rejectedKey(dayKey(now)))));
    const d = snap.exists ? snap.data() : {};
    const used = num(d?.totals?.totalTokens);
    const reserved = Math.max(0, num(d?.quota?.reserved));
    return {
        used,
        reserved,
        remaining: Math.max(0, limits.dailyTokens - used - reserved),
        groundedCalls: num(d?.quota?.groundedCalls),
        rejected: num(rej.exists ? rej.data()?.count : 0),
        byUser: d?.byUser || {},
    };
}

/** Bu ayın paket birimleri. */
export async function tenantUnitsThisMonth(tenantId, now = new Date()) {
    const snap = await db.doc(tenantPaths(tenantId).usageDay(monthKey(now))).get();
    const u = snap.exists ? snap.data()?.units || {} : {};
    return { prescreen: num(u.prescreen), interviewEval: num(u.interviewEval), interviewHour: num(u.interviewHour) };
}

/** Kota hatası → HTTP yanıtı (rotalar ortak kullanır). true dönerse yanıt yazıldı. */
export function sendQuotaError(res, err) {
    if (!(err instanceof QuotaError)) return false;
    res.status(429).json({
        error: err.userMessage,
        code: err.code,
        reason: err.detail?.reason || null,
        resetAt: err.detail?.resetAt || null,
    });
    return true;
}

/** Toplu içe aktarmada CV başına ortalama token (ön denetim tahmini). */
export function bulkTokensPerCv(env = process.env) {
    const n = Number(env.BULK_TOKENS_PER_CV);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5000;
}

/**
 * Toplu iş BAŞLAMADAN önce: tahmini maliyet bugünkü kalan bütçeye ve bu ayki
 * paket hakkına sığıyor mu? Sığmıyorsa iş reddedilir (plan §5.2: yarım iş
 * bırakmamak için). Okuma anlık; asıl fren yine her çağrıdaki atomik ayırma.
 *
 * @returns {Promise<{ ok: true } | { ok: false, code: string, message: string }>}
 */
export async function checkBulkBudget(ctx, count, now = new Date()) {
    const n = Math.max(0, Math.floor(num(count)));
    if (n === 0) return { ok: true };
    try {
        const usage = await tenantUsageToday(ctx.tenantId, ctx.limits, now);
        const userKey = safeUserKey(ctx.userKey);
        const u = usage.byUser?.[userKey] || {};
        const userLimit = Math.floor((ctx.limits.dailyTokens * ctx.limits.userSharePct) / 100);
        const userRemaining = Math.max(0, userLimit - num(u.totalTokens) - Math.max(0, num(u.reserved)));
        const remaining = Math.min(usage.remaining, userRemaining);
        const need = n * bulkTokensPerCv();
        if (need > remaining) {
            const fits = Math.floor(remaining / bulkTokensPerCv());
            return {
                ok: false,
                code: BUDGET_CODE,
                message: `Bu iş tahminen ${fmt(need)} token gerektiriyor; bugün kalan AI kotanız ${fmt(remaining)} token `
                    + `(yaklaşık ${fmt(fits)} CV). Yarım iş bırakmamak için başlatılmadı: işi daha küçük parçalara `
                    + "bölün ya da yarın 03:00'ten (TSİ) sonra deneyin.",
            };
        }
        const limit = ctx.planLimits?.monthlyPrescreens;
        if (limit != null) {
            const units = await tenantUnitsThisMonth(ctx.tenantId, now);
            if (units.prescreen + n > limit) {
                return {
                    ok: false,
                    code: PLAN_CODE,
                    message: `Paketinizin bu ayki ön analiz hakkı bu iş için yetmiyor `
                        + `(kullanılan ${fmt(units.prescreen)} / ${fmt(limit)}, iş ${fmt(n)} CV).`,
                };
            }
        }
    } catch (err) {
        // Okuma hatası işi engellemez; atomik ayırma yine tutar.
        log.warn({ err: err?.message }, 'toplu iş bütçe ön denetimi okunamadı');
    }
    return { ok: true };
}
