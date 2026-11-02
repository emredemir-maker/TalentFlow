// ADAY E-POSTALARI — tek gönderim noktası (çok şirketli PR 7b, K7).
//
// ── KİMDEN, KİME YANIT ──────────────────────────────────────────────────────
//   From:     "<Şirket adı>" <noreply@clyrolabs.com>
//   Reply-To: işe alımcının (oturumdaki kullanıcının) e-postası
// Eskiden tüm şirketlerin e-postası tek bir Gmail hesabından (EMAIL_USER)
// gidiyordu: gönderen adını istemci seçiyor, yanıtlar ortak bir gelen kutusuna
// düşüyordu. Artık gönderim Clyro'nun doğrulanmış alan adından (Resend; Hub ile
// aynı hizmet, RESEND_API_KEY), gönderen adı ŞİRKET belgesinden, yanıt adresi
// DOĞRULANMIŞ kimlikten gelir — istemci ne gönderen adını ne yanıt adresini
// seçebilir (başka bir şirket ya da kişi adına e-posta atılamaz).
//
// ── ANAHTAR YOKSA ───────────────────────────────────────────────────────────
// RESEND_API_KEY tanımlı değilse gönderim KAPALI: MailerDisabledError → 503
// EMAIL_DISABLED. Sessizce "gönderildi" demek yok; yerel geliştirmede ve
// testte gerçek adayın kutusuna e-posta gitmesi de yok.
//
// ── KÖTÜYE KULLANIM ─────────────────────────────────────────────────────────
// Ortak alan adının itibarı tüm şirketlerin teslim edilebilirliği demek. Şirket
// başına günlük gönderim tavanı (EMAIL_DAILY_LIMIT_PER_TENANT, varsayılan 300)
// tek Firestore işleminde koşullu artırımla tutulur; her gönderim etiketinde
// şirket kimliği var (Resend panelinde şirket bazında izlenebilir).
import { db, admin } from '../config/firebaseAdmin.js';
import { tenantPaths } from './tenantPaths.js';
import { childLogger } from './logger.js';

const log = childLogger('mailer');

const RESEND_URL = 'https://api.resend.com/emails';
export const DEFAULT_FROM_ADDRESS = 'noreply@clyrolabs.com';
const SEND_TIMEOUT_MS = 15_000;

// Başlıklara giren adresler: boşluk, virgül, noktalı virgül, köşeli parantez,
// tırnak ve satır sonu yok (başlık enjeksiyonu ve çoklu alıcı sızdırma).
const EMAIL_RE = /^[^\s@,;<>"'()\\]+@[^\s@,;<>"'()\\]+\.[^\s@,;<>"'()\\]{2,}$/;

export class MailerDisabledError extends Error {
    constructor() {
        super('E-posta gönderimi bu ortamda kapalı (RESEND_API_KEY tanımlı değil).');
        this.name = 'MailerDisabledError';
        this.code = 'EMAIL_DISABLED';
        this.status = 503;
    }
}

export class MailerError extends Error {
    constructor(message, { status = 502, code = 'EMAIL_SEND_FAILED' } = {}) {
        super(message);
        this.name = 'MailerError';
        this.status = status;
        this.code = code;
    }
}

/** Katı: baştaki/sondaki boşluk dahil hiçbir boşluk yok (çağıran gerekirse önce kırpar). */
export function isEmail(v) {
    return typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v);
}

/** Yürürlükteki gönderim ayarları — her çağrıda okunur (dağıtım sonrası yeniden başlatma beklemez). */
export function mailerConfig(env = process.env) {
    const apiKey = String(env.RESEND_API_KEY || '').trim();
    const fromAddress = String(env.MAIL_FROM_ADDRESS || DEFAULT_FROM_ADDRESS).trim().toLowerCase();
    const n = Number(env.EMAIL_DAILY_LIMIT_PER_TENANT);
    return {
        enabled: apiKey.length > 0 && isEmail(fromAddress),
        apiKey,
        fromAddress,
        dailyLimit: Number.isFinite(n) && n > 0 ? Math.floor(n) : 300,
    };
}

/**
 * Gönderen görünen adı: şirket adı. Başlığı bozabilecek her şey atılır
 * (satır sonu, tırnak, köşeli parantez, denetim karakterleri); boşsa ürün adı.
 */
export function sanitizeDisplayName(name) {
    const clean = String(name ?? '')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f"<>\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
    return clean || 'Clyro Talent';
}

/** `"Şirket" <noreply@clyrolabs.com>` */
export function formatFrom(name, address) {
    return `"${sanitizeDisplayName(name)}" <${address}>`;
}

/** Konu: tek satır, 200 karakter. */
export function sanitizeSubject(subject) {
    return String(subject ?? '')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
}

/** Etiket değeri (Resend: harf, rakam, _ ve -). */
function tagValue(v) {
    return String(v || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256) || 'none';
}

/** Gün anahtarı (UTC). */
function dayKey(now) {
    return now.toISOString().slice(0, 10);
}

/**
 * Şirketin günlük gönderim hakkından `n` düşer — koşul ve artırım tek işlemde.
 * @returns {Promise<boolean>} false = tavan doldu
 */
export async function consumeEmailQuota(tenantId, n, { limit, now = new Date() } = {}) {
    const ref = db.doc(tenantPaths(tenantId).usageDay(dayKey(now)));
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const sent = Number(snap.exists ? snap.data()?.email?.sent : 0) || 0;
        if (sent + n > limit) return false;
        tx.set(
            ref,
            { day: dayKey(now), email: { sent: admin.firestore.FieldValue.increment(n) } },
            { merge: true }
        );
        return true;
    });
}

/**
 * Tek bir e-posta gönderir.
 *
 * @param {object} p
 * @param {string} p.tenantId
 * @param {string} p.fromName      şirket adı (sunucudan)
 * @param {string} [p.replyTo]     işe alımcının doğrulanmış e-postası
 * @param {string|string[]} p.to
 * @param {string} p.subject
 * @param {string} p.html
 * @param {string} [p.text]
 * @param {Array<{filename: string, content: string, contentType?: string}>} [p.attachments]  content düz metin
 * @param {string} [p.kind]        etiket: feedback | invite | info-request | participant …
 * @param {{ fetchImpl?: Function, env?: object, now?: Date, skipQuota?: boolean }} [opts]
 * @returns {Promise<{ id: string|null }>}
 */
export async function sendEmail(p, { fetchImpl = globalThis.fetch, env = process.env, now = new Date(), skipQuota = false } = {}) {
    const cfg = mailerConfig(env);
    if (!cfg.enabled) throw new MailerDisabledError();

    const to = (Array.isArray(p.to) ? p.to : [p.to]).map((x) => String(x || '').trim());
    if (to.length === 0 || to.length > 10 || !to.every(isEmail)) {
        throw new MailerError('Geçersiz alıcı adresi.', { status: 400, code: 'EMAIL_BAD_RECIPIENT' });
    }
    const subject = sanitizeSubject(p.subject);
    if (!subject) throw new MailerError('Konu boş olamaz.', { status: 400, code: 'EMAIL_BAD_SUBJECT' });
    if (typeof p.html !== 'string' || p.html.length === 0 || p.html.length > 300_000) {
        throw new MailerError('E-posta içeriği geçersiz.', { status: 400, code: 'EMAIL_BAD_BODY' });
    }
    const replyTo = typeof p.replyTo === 'string' && isEmail(p.replyTo.trim()) ? p.replyTo.trim() : null;

    if (!skipQuota) {
        const ok = await consumeEmailQuota(p.tenantId, to.length, { limit: cfg.dailyLimit, now });
        if (!ok) {
            throw new MailerError(
                `Şirketinizin bugünkü e-posta gönderim sınırı (${cfg.dailyLimit}) doldu. Yarın tekrar deneyin.`,
                { status: 429, code: 'EMAIL_DAILY_LIMIT' }
            );
        }
    }

    const body = {
        from: formatFrom(p.fromName, cfg.fromAddress),
        to,
        subject,
        html: p.html,
        ...(p.text ? { text: String(p.text).slice(0, 100_000) } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
        tags: [
            { name: 'tenant', value: tagValue(p.tenantId) },
            { name: 'kind', value: tagValue(p.kind || 'candidate') },
        ],
        ...(Array.isArray(p.attachments) && p.attachments.length
            ? {
                attachments: p.attachments.slice(0, 3).map((a) => ({
                    filename: String(a.filename || 'ek').replace(/[^\w.-]/g, '_').slice(0, 100),
                    content: Buffer.from(String(a.content || ''), 'utf8').toString('base64'),
                    ...(a.contentType ? { content_type: String(a.contentType).slice(0, 100) } : {}),
                })),
            }
            : {}),
    };

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), SEND_TIMEOUT_MS);
    let res;
    try {
        res = await fetchImpl(RESEND_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: ac.signal,
        });
    } catch (err) {
        log.warn({ err: err?.name, tenantId: p.tenantId }, 'e-posta hizmetine ulaşılamadı');
        throw new MailerError('E-posta hizmetine ulaşılamadı. Biraz sonra tekrar deneyin.');
    } finally {
        clearTimeout(timer);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        // Hizmetin hata metni anahtar içermez ama ham hali kullanıcıya
        // gösterilmez; loga yalnız durum ve ad.
        log.warn({ status: res.status, name: data?.name, tenantId: p.tenantId }, 'e-posta gönderilemedi');
        throw new MailerError(
            res.status === 422 || res.status === 400
                ? 'E-posta reddedildi (adres ya da içerik geçersiz).'
                : 'E-posta gönderilemedi. Biraz sonra tekrar deneyin.',
            { status: res.status === 429 ? 429 : 502 }
        );
    }
    return { id: typeof data?.id === 'string' ? data.id : null };
}

/** Gönderici hatası → HTTP yanıtı. true dönerse yanıt yazıldı. */
export function sendMailerError(res, err) {
    if (err instanceof MailerDisabledError || err instanceof MailerError) {
        res.status(err.status).json({ success: false, error: err.message, code: err.code });
        return true;
    }
    return false;
}
