// Aday e-postaları ve bilgi talebi yanıtları. İç kullanıcı uçları
// requireTenant(WRITER_ROLES) arkasında; kayıtlar şirketin yolunda
// (tenants/{t}/infoRequests, tenants/{t}/interviews).
//
// GÖNDERİM (PR 7b, K7): services/mailer.js — Resend, `noreply@clyrolabs.com`,
// From adı ŞİRKET adı, Reply-To oturumdaki işe alımcının doğrulanmış e-postası.
// İçerik services/emailRender.js ile şirketin kayıtlı şablonundan sunucuda
// üretilir; istemciden gelen hazır HTML YOK SAYILIR (ortak alan adından
// keyfi içerik gönderilemesin). Eski tek Gmail hesabı (EMAIL_USER/EMAIL_PASS,
// nodemailer, IMAP) kaldırıldı.
//
//   (POST /api/send-invite KALDIRILDI — K3: üyelik yalnız Hub'dan.)
//   GET  /api/email/status             — gönderim açık mı, yanıt kutusu bağlı mı.
//   POST /api/send-feedback            — başvuru sonucu (şablon: feedback).
//   POST /api/send-interview-invite    — mülakat daveti / tarih değişikliği /
//                                         onay (şablon: invite | reschedule |
//                                         confirmation) + isteğe bağlı .ics.
//   POST /api/send-info-request        — ek bilgi talebi; infoRequests kaydı.
//   POST /api/candidate-respond        — aday /respond/:id sayfasından yanıt.
//   POST /api/check-info-replies       — işe alımcının KENDİ kutusunda (Gmail ya
//                                         da Microsoft 365 bağlıysa) talep
//                                         yanıtlarını arar. Yanıtlar Reply-To
//                                         ile işe alımcıya gittiği için ortak
//                                         bir gelen kutusu yok.
//   POST /api/send-participant-invite  — mülakata eklenen katılımcıya davet.
//
// `cleanupOldFiles(uploadBaseDir)` is also exported here — it's the GDPR/KVKK
// CV-disk-purge job that server.js calls on startup.
import { Router } from 'express';
import fs from 'fs';
import path from 'path';

import { generalLimiter } from '../middleware/rateLimit.js';
import { randomUUID } from 'crypto';

import { requireTenant, loadPublicTenant, WRITER_ROLES, SELF_WRITER_ROLES } from '../middleware/auth.js';
import { isValidDocId } from '../services/tenantPaths.js';
import { db, admin } from '../config/firebaseAdmin.js';
import { sendEmail, sendMailerError, mailerConfig, isEmail } from '../services/mailer.js';
import { renderEmail, cleanVars, loadEmailSettings } from '../services/emailRender.js';
import { tokenStore } from '../services/integrationTokenStore.js';
import { IntegrationError } from '../services/integrationTokens.js';
import { childLogger } from '../services/logger.js';
const log = childLogger('email');


const router = Router();

// Adaya giden "bilgi talebine yanıt ver" bağlantısının kökü: dağıtımın verdiği
// adres (functions/.env → APP_URL, firebase-deploy.yml site adından türetir).
// Eskiden burada eski projenin adresi sabit yazılıydı. Proje kimliğinden
// <proje>.web.app TÜRETİLMİYOR: proje paylaşılıyor ve uygulama adlı bir sitede;
// varsayılan site başka bir uygulamanın adresi olabilir. Yanlış uygulamaya
// giden bir bağlantı, boş kökten daha kötü.
export function resolveAppUrl(env = process.env) {
    const explicit = env.VITE_APP_URL || env.APP_URL || '';
    return explicit.replace(/\/+$/, '');
}

// --- Cleanup Routine (GDPR/KVKK Compliance) ---
// uploadBaseDir is supplied by the caller (server.js) on startup so this
// module doesn't need to know whether it's running in /tmp or in the local
// functions/ dir.
export function cleanupOldFiles(uploadBaseDir) {
    const dir = path.join(uploadBaseDir, 'uploads', 'cvs');
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);
    const now = Date.now();
    const expiry = 15 * 24 * 60 * 60 * 1000; // 15 gün

    let count = 0;
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > expiry) {
            fs.unlinkSync(filePath);
            count++;
        }
    });
    if (count > 0) log.info(`🧹 KVKK Veri Minimizasyonu: ${count} adet eski ham CV dosyası diskten silindi. (İletişim kayıtları korunuyor)`);
}
/**
 * Gönderim bağlamı: şirket adı (marka ayarı > şirket belgesi), işe alımcının
 * doğrulanmış e-postası (Reply-To) ve şirketin şablonları. İstemcinin
 * gönderdiği `branding`, `recruiterEmail`, `html` kullanılmaz.
 */
async function mailContext(req) {
    const settings = await loadEmailSettings(db, req.paths);
    const companyName = String(settings.branding?.companyName || req.tenant.name || '').trim();
    return {
        settings: { ...settings, tenantName: req.tenant.name || '' },
        fromName: companyName,
        replyTo: isEmail(req.user.email) ? req.user.email : null,
    };
}

/** Değişkenler + sunucunun bildiği alanlar (yanıt adresi, gönderen). */
function varsFor(key, body, req, extra = {}) {
    const vars = cleanVars(key, { ...(body?.vars || {}), ...pick(body, TEMPLATE_BODY_FIELDS) }, { appUrl: resolveAppUrl() });
    return { ...vars, companyEmail: req.user.email || '', ...extra };
}
const TEMPLATE_BODY_FIELDS = ['candidateName', 'recruiterName', 'position', 'outcome', 'feedbackText', 'requestMessage', 'requestedItems'];
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o && o[k] != null).map((k) => [k, o[k]]));

// Gönderim açık mı, yanıt kontrolü için kutu bağlı mı — arayüz uyarıları için.
router.get('/api/email/status', requireTenant(), async (req, res) => {
    const cfg = mailerConfig();
    const connected = {};
    for (const provider of ['google', 'microsoft']) {
        try {
            await tokenStore.getAccessToken(req.tenant.id, req.user.uid, provider);
            connected[provider] = true;
        } catch {
            connected[provider] = false;
        }
    }
    res.json({
        enabled: cfg.enabled,
        fromAddress: cfg.fromAddress,
        replyTo: req.user.email || null,
        replyInbox: connected,
    });
});

// Başvuru sonucu geri bildirimi.
router.post('/api/send-feedback', generalLimiter, requireTenant(WRITER_ROLES), async (req, res) => {
    const { to, feedbackText } = req.body || {};
    if (!to || !feedbackText) return res.status(400).json({ error: 'Email ve geri bildirim metni gereklidir.' });
    if (!isEmail(String(to).trim())) return res.status(400).json({ error: 'Geçersiz email adresi.' });
    if (typeof feedbackText !== 'string' || feedbackText.length > 10000) return res.status(400).json({ error: 'Geri bildirim metni geçersiz.' });
    try {
        const ctx = await mailContext(req);
        const vars = varsFor('feedback', req.body, req);
        const { subject, html } = renderEmail('feedback', vars, ctx.settings);
        await sendEmail({ tenantId: req.tenant.id, fromName: ctx.fromName, replyTo: ctx.replyTo, to, subject, html, text: feedbackText, kind: 'feedback' });
        res.json({ success: true });
    } catch (error) {
        if (sendMailerError(res, error)) return;
        log.error({ err: error?.message }, '❌ Feedback email error');
        res.status(500).json({ error: 'Mail gönderilemedi.' });
    }
});

const INVITE_TEMPLATES = new Set(['invite', 'reschedule', 'confirmation']);

/** .ics eki: düz metin takvim, makul boyut. */
export function validIcs(ics) {
    return typeof ics === 'string' && ics.length <= 20000 && /^BEGIN:VCALENDAR\r?\n/.test(ics) && /END:VCALENDAR\s*$/.test(ics);
}

// Mülakat daveti / tarih değişikliği / onay (Google bağlı olmayan yol).
router.post('/api/send-interview-invite', generalLimiter, requireTenant(WRITER_ROLES), async (req, res) => {
    const { to, ics } = req.body || {};
    const templateKey = INVITE_TEMPLATES.has(req.body?.templateKey) ? req.body.templateKey : 'invite';
    if (!to) return res.status(400).json({ error: 'Email gereklidir.' });
    if (!isEmail(String(to).trim())) return res.status(400).json({ error: 'Geçersiz email adresi.' });
    if (ics != null && !validIcs(ics)) return res.status(400).json({ error: 'Takvim eki geçersiz.' });
    try {
        const ctx = await mailContext(req);
        const vars = varsFor(templateKey, req.body, req);
        const { subject, html } = renderEmail(templateKey, vars, ctx.settings);
        await sendEmail({
            tenantId: req.tenant.id,
            fromName: ctx.fromName,
            replyTo: ctx.replyTo,
            to,
            subject,
            html,
            kind: templateKey,
            ...(ics ? { attachments: [{ filename: 'mulakat.ics', content: ics, contentType: 'text/calendar; charset=utf-8; method=REQUEST' }] } : {}),
        });
        log.info({ templateKey }, '✉️ Interview email sent');
        res.json({ success: true });
    } catch (error) {
        if (sendMailerError(res, error)) return;
        log.error({ err: error?.message }, '❌ Interview invite email error');
        res.status(500).json({ error: 'Mail gönderilemedi.' });
    }
});


// /api/gemini-stt moved to routes/ai.js
router.post('/api/send-info-request', generalLimiter, requireTenant(WRITER_ROLES), async (req, res) => {
    // requestId ve respondUrl istemciden ALINMAZ: yanıt konudaki kimlikle
    // eşleşiyor; istemci kimliği seçebilseydi başka bir talebin kimliğini
    // kopyalayıp yanıtını kendine çekebilirdi. Yanıt adresi (Reply-To) de
    // istemciden değil doğrulanmış kimlikten.
    const { to, candidateName, sessionId, candidateId } = req.body || {};
    if (!to || !candidateName) return res.status(400).json({ error: 'Email ve aday adı gereklidir.' });
    if (!isEmail(String(to).trim())) return res.status(400).json({ error: 'Geçersiz email adresi.' });
    try {
        const requestId = `ir-${randomUUID()}`;
        const APP_URL = resolveAppUrl();
        // Şirket kimliği bağlantıda (geçici — PR 5'te publicLinks).
        const respondUrl = `${APP_URL}/respond/${requestId}?type=info&tenantId=${encodeURIComponent(req.tenant.id)}`;
        const ctx = await mailContext(req);
        const vars = varsFor('infoRequest', req.body, req, {});
        // Sunucunun ürettiği bağlantı her durumda (APP_URL boşsa göreli kalmasın diye safeLink'ten geçmez).
        vars.respondUrl = respondUrl;
        try {
            // Rol ve şirket requireTenant'ta denetlendi; kayıt şirketin yolunda.
            await db.doc(req.paths.infoRequest(requestId)).set({
                requestId,
                candidateId: candidateId || null,
                sessionId: sessionId || null,
                candidateEmail: to.trim().toLowerCase(),
                candidateName: vars.candidateName || '',
                // Yanıtlar bu kişinin kutusuna gider; check-info-replies onun
                // bağladığı Gmail/Microsoft hesabında arar.
                recruiterUid: req.user.uid,
                recruiterEmail: req.user.email || '',
                recruiterName: vars.recruiterName || '',
                position: vars.position || '',
                requestMessage: vars.requestMessage || '',
                requestedItems: vars.requestedItems || [],
                status: 'pending',
                createdAt: new Date(),
            });
        } catch (dbErr) {
            log.warn({ err: dbErr.message }, '⚠️ infoRequests Firestore write failed (non-fatal)');
        }
        const rendered = renderEmail('infoRequest', vars, ctx.settings);
        // Konudaki kimlik eşleştirmenin anahtarı — şablon ne olursa olsun eklenir.
        const subject = `${rendered.subject} [#${requestId}]`;
        await sendEmail({ tenantId: req.tenant.id, fromName: ctx.fromName, replyTo: ctx.replyTo, to, subject, html: rendered.html, kind: 'info-request' });
        log.info({ requestId }, '✉️ Info request sent');
        res.json({ success: true, requestId, respondUrl });
    } catch (error) {
        if (sendMailerError(res, error)) return;
        log.error({ err: error?.message }, '❌ Info request email error');
        res.status(500).json({ error: 'Bilgi talebi gönderilemedi.' });
    }
});

// ─── Candidate Respond (public — no auth required) ────────────────────────────
// Şirket: bağlantıdaki `tenantId` (geçici — PR 5'te publicLinks çözücüsü
// gelir ve bağlantı yalnız rastgele bir kimlik taşır). Kimlik hâlâ yetki
// anahtarı; şirket kimliği yalnız aramayı o şirketin ağacına daraltır.
router.post('/api/candidate-respond', generalLimiter, async (req, res) => {
    const { id, type, action, responseData, tenantId } = req.body;
    if (!id || !type) return res.status(400).json({ error: 'id ve type gereklidir.' });
    if (!isValidDocId(id)) return res.status(404).json({ error: 'Talep bulunamadı.' });
    try {
        // Kapalı/salt okunur/askıdaki şirkete aday yazımı yok (K5).
        const tenant = await loadPublicTenant(String(tenantId || ''), { write: true });
        if (!tenant) return res.status(404).json({ error: 'Talep bulunamadı.' });
        const paths = tenant.paths;
        const now = admin.firestore.FieldValue.serverTimestamp();
        if (type === 'info') {
            const ref = db.doc(paths.infoRequest(id));
            const snap = await ref.get();
            if (!snap.exists) return res.status(404).json({ error: 'Talep bulunamadı.' });
            await ref.update({ status: 'responded', responseData: responseData || '', respondedAt: now });
            const data = snap.data();
            if (data.sessionId && isValidDocId(data.sessionId)) {
                await db.doc(paths.interview(data.sessionId)).set({
                    infoResponses: admin.firestore.FieldValue.arrayUnion({
                        requestId: id,
                        candidateName: data.candidateName,
                        responseData: responseData || '',
                        respondedAt: new Date().toISOString(),
                    }),
                }, { merge: true });
            }
        } else if (type === 'invite') {
            const validActions = ['confirm', 'decline'];
            if (!validActions.includes(action)) return res.status(400).json({ error: 'Geçersiz action.' });
            // Yalnız VAR OLAN oturum: merge ile set, olmayan kimlikte boş bir
            // mülakat belgesi açardı.
            const ref = db.doc(paths.interview(id));
            const snap = await ref.get();
            if (!snap.exists) return res.status(404).json({ error: 'Talep bulunamadı.' });
            await ref.set({
                candidateResponse: { status: action, respondedAt: new Date().toISOString() },
            }, { merge: true });
        } else {
            return res.status(400).json({ error: 'Geçersiz type.' });
        }
        res.json({ success: true });
    } catch (error) {
        log.error({ err: error }, '❌ Candidate respond error');
        res.status(500).json({ error: 'Yanıt kaydedilemedi.' });
    }
});

// ── Bilgi talebi yanıtlarını işe alımcının kutusunda bulma ─────────────────
//
// Yanıtlar Reply-To ile işe alımcının kendi adresine gidiyor. Okuyabildiğimiz
// tek yer, kişinin Talent'a BAĞLADIĞI Gmail ya da Microsoft 365 hesabı
// (şifreli jeton, services/integrationTokens.js). Bağlı değilse otomatik
// kontrol yapılamaz; ekran bunu söyler ve aday yanıtı /respond bağlantısından
// yine kaydedilir.

const REQUEST_TAG_RE = /\[#(ir-[0-9a-f-]{36})\]/i;

/** HTML gövdeden yalnız yeni yazılan kısmı düz metne indirger. */
export function stripHtmlReply(html) {
    return String(html || '')
        .replace(/<div[^>]*class="[^"]*gmail_quote[^"]*"[\s\S]*?<\/div\s*>/gi, '')
        .replace(/<div[^>]*id="?divRplyFwdMsg"?[\s\S]*$/gi, '')
        .replace(/<blockquote[\s\S]*?<\/blockquote\s*>/gi, '')
        .replace(/<(style|script)[\s\S]*?<\/\1\s*>/gi, '')
        .replace(/<\/?(p|div|br|h[1-6]|li|tr)[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/[ \t]+/g, ' ').replace(/\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Düz metin gövdeden alıntıyı atar. */
export function stripPlainReply(str) {
    let s = String(str || '');
    const onWroteIdx = s.search(/^(On .{0,200}wrote:|.{0,200} tarihinde .{0,200} şunu yazdı:)\s*$/m);
    if (onWroteIdx > 0) s = s.slice(0, onWroteIdx);
    return s.split('\n').filter((ln) => !ln.trimStart().startsWith('>')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** "Ad <a@b.c>" → a@b.c */
function addressOf(from) {
    const m = String(from || '').match(/<([^>]+@[^>]+)>/) || String(from || '').match(/([^\s<>"]+@[^\s<>"]+)/);
    return m ? m[1].trim().toLowerCase() : '';
}

async function jsonFetch(url, token, fetchImpl) {
    const r = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
        const err = new Error(`HTTP ${r.status}`);
        err.status = r.status;
        throw err;
    }
    return data;
}

/** Gmail: son 14 gündeki, konusunda talep kimliği olan mesajlar. */
export async function fetchGmailReplies(token, fetchImpl = fetch) {
    const base = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
    const list = await jsonFetch(`${base}?q=${encodeURIComponent('newer_than:14d subject:ir')}&maxResults=50`, token, fetchImpl);
    const out = [];
    for (const m of list.messages || []) {
        const msg = await jsonFetch(`${base}/${encodeURIComponent(m.id)}?format=full`, token, fetchImpl);
        const headers = msg.payload?.headers || [];
        const h = (n) => headers.find((x) => String(x.name).toLowerCase() === n)?.value || '';
        const tag = REQUEST_TAG_RE.exec(h('subject'));
        if (!tag) continue;
        const parts = [];
        const walk = (p) => {
            if (!p) return;
            if (p.body?.data && /^text\/(plain|html)/.test(p.mimeType || '')) parts.push(p);
            (p.parts || []).forEach(walk);
        };
        walk(msg.payload);
        const decode = (d) => Buffer.from(String(d).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        const plain = parts.find((p) => p.mimeType.startsWith('text/plain'));
        const html = parts.find((p) => p.mimeType.startsWith('text/html'));
        const replyBody = plain ? stripPlainReply(decode(plain.body.data)) : html ? stripHtmlReply(decode(html.body.data)) : '';
        out.push({ requestId: tag[1].toLowerCase(), from: addressOf(h('from')), subject: h('subject'), replyBody });
    }
    return out;
}

/** Microsoft Graph: konusunda talep kimliği olan mesajlar (Mail.Read). */
export async function fetchGraphReplies(token, fetchImpl = fetch) {
    const url = 'https://graph.microsoft.com/v1.0/me/messages'
        + `?$search=${encodeURIComponent('"subject:ir"')}&$top=50&$select=subject,from,body`;
    const list = await jsonFetch(url, token, fetchImpl);
    const out = [];
    for (const m of list.value || []) {
        const tag = REQUEST_TAG_RE.exec(m.subject || '');
        if (!tag) continue;
        const content = m.body?.content || '';
        const replyBody = m.body?.contentType === 'html' ? stripHtmlReply(content) : stripPlainReply(content);
        out.push({ requestId: tag[1].toLowerCase(), from: String(m.from?.emailAddress?.address || '').toLowerCase(), subject: m.subject || '', replyBody });
    }
    return out;
}

/**
 * Gelen yanıt bu talebe uygulanacak mı; uygulanacaksa yazılacak alanlar.
 * Yalnız talebin gönderildiği adresten gelen yanıt: konudaki kimliği bilen
 * başkası (ortak gelen kutusuna yazan herkes) yanıt enjekte edemesin.
 * @returns {object|null}
 */
export function replyPatch(existing, reply, now = new Date()) {
    const from = String(reply?.from || '').trim().toLowerCase();
    if (!from || String(existing?.candidateEmail || '').trim().toLowerCase() !== from) return null;
    const status = existing.status;
    if (status !== 'pending' && existing.replyBody) return null;
    const patch = { replySubject: reply.subject, replyBody: reply.replyBody || '' };
    if (status === 'pending') {
        patch.status = 'responded';
        patch.respondedAt = now;
    }
    return patch;
}

router.post('/api/check-info-replies', generalLimiter, requireTenant(SELF_WRITER_ROLES), async (req, res) => {
    // Yalnız oturumdaki kişinin kendi bağlı kutusu. İkisi de bağlı değilse
    // 409 MAILBOX_NOT_CONNECTED: ekran "Gmail ya da Microsoft hesabınızı
    // bağlayın" der.
    let replies = null;
    let provider = null;
    let reauth = false;
    for (const p of ['google', 'microsoft']) {
        let token;
        try {
            token = await tokenStore.getAccessToken(req.tenant.id, req.user.uid, p);
        } catch (err) {
            if (err instanceof IntegrationError && err.code === 'REAUTH_REQUIRED') reauth = true;
            continue;
        }
        try {
            replies = p === 'google' ? await fetchGmailReplies(token) : await fetchGraphReplies(token);
            provider = p;
            break;
        } catch (err) {
            log.warn({ provider: p, status: err?.status }, 'yanıt kutusu okunamadı');
            if (err?.status === 401 || err?.status === 403) reauth = true;
        }
    }
    if (!replies) {
        return res.status(409).json({
            success: false,
            code: reauth ? 'MAILBOX_REAUTH_REQUIRED' : 'MAILBOX_NOT_CONNECTED',
            error: reauth
                ? 'E-posta hesabınızın bağlantısı yenilenmeli (Microsoft için posta okuma izni gerekir). Ayarlar → Entegrasyonlar.'
                : 'Aday yanıtları sizin e-posta kutunuza gider. Otomatik kontrol için Gmail ya da Microsoft 365 hesabınızı bağlayın (Ayarlar → Entegrasyonlar).',
        });
    }
    let updated = 0;
    for (const reply of replies) {
        try {
            // Yalnız BU ŞİRKETİN talebi; başka şirketin kimliği burada "yok".
            if (!isValidDocId(reply.requestId)) continue;
            const ref = db.doc(req.paths.infoRequest(reply.requestId));
            const snap = await ref.get();
            if (!snap.exists) continue;
            const patch = replyPatch(snap.data() || {}, reply);
            if (!patch) continue;
            await ref.update(patch);
            updated++;
        } catch (err) {
            log.error({ err: err.message }, `❌ ${reply.requestId} güncellenemedi`);
        }
    }
    log.info({ provider, scanned: replies.length, updated }, '📬 yanıt kontrolü tamamlandı');
    res.json({ success: true, provider, scanned: replies.length, updated });
});

// ── Send participant invite emails when a quick-start interview goes live
// requireTenant: mülakatı başlatan recruiter çağırır; alıcı listesi doğrulanır.
router.post('/api/send-participant-invite', generalLimiter, requireTenant(WRITER_ROLES), async (req, res) => {
    const { participants, joinLink, sessionId } = req.body || {};
    if (!participants || !Array.isArray(participants) || participants.length === 0) {
        return res.status(400).json({ error: 'participants listesi gereklidir.' });
    }
    if (participants.length > 10 || participants.some((p) => typeof p !== 'string' || !isEmail(p.trim()))) {
        return res.status(400).json({ error: 'Geçersiz katılımcı listesi (en fazla 10 geçerli e-posta).' });
    }
    if (!joinLink) return res.status(400).json({ error: 'joinLink gereklidir.' });
    try {
        const ctx = await mailContext(req);
        const vars = varsFor('participant', { ...req.body, vars: { ...(req.body.vars || {}), meetLink: joinLink } }, req);
        if (!vars.meetLink) return res.status(400).json({ error: 'Katılım bağlantısı geçersiz.' });
        const { subject, html } = renderEmail('participant', vars, ctx.settings);
        const results = await Promise.allSettled(
            participants.map((email) =>
                sendEmail({ tenantId: req.tenant.id, fromName: ctx.fromName, replyTo: ctx.replyTo, to: email, subject, html, kind: 'participant' })
            )
        );
        const failed = results.filter((r) => r.status === 'rejected');
        if (failed.length === results.length && failed[0]?.reason && sendMailerError(res, failed[0].reason)) return;
        if (failed.length > 0) log.warn({ failed: failed.length, sessionId }, '⚠️ Bazı katılımcı davetleri gönderilemedi');
        res.json({ success: true, sent: results.length - failed.length, failed: failed.length });
    } catch (error) {
        if (sendMailerError(res, error)) return;
        log.error({ err: error?.message }, '❌ send-participant-invite error');
        res.status(500).json({ error: 'Davet gönderilemedi.' });
    }
});

export default router;
