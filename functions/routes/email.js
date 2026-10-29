// All email-sending and email-receiving (IMAP) flows live here. Six endpoints
// + the IMAP poller for candidate replies. İç kullanıcı uçları
// requireTenant(WRITER_ROLES) arkasında; kayıtlar şirketin yolunda
// (tenants/{t}/infoRequests, tenants/{t}/interviews).
//
//   (POST /api/send-invite KALDIRILDI — K3: üyelik yalnız Hub'dan.)
//   POST /api/send-feedback            — post-application outcome email.
//                                         Accepts a pre-built HTML body from
//                                         the frontend template service or
//                                         falls back to the inline builder.
//   POST /api/send-interview-invite    — generic html+ics email body, used
//                                         by the interview wizard's
//                                         "Google'dan bağımsız" path.
//   POST /api/send-info-request        — sends a candidate a request for
//                                         additional information; persists
//                                         an infoRequests/{requestId} doc.
//   POST /api/candidate-respond        — public endpoint candidates use to
//                                         submit a response from the
//                                         /respond/:id route.
//   POST /api/check-info-replies       — recruiter-triggered IMAP fetch that
//                                         scans the support inbox for replies
//                                         and matches them to open requests.
//   POST /api/send-participant-invite  — extra-attendee invite when a
//                                         live-interview wizard adds someone
//                                         after the session is created.
//
// `cleanupOldFiles(uploadBaseDir)` is also exported here — it's the GDPR/KVKK
// CV-disk-purge job that server.js calls on startup. It only depends on the
// uploads dir, but lives next to the email code historically because the
// support inbox + CV uploads share retention semantics.
import { Router } from 'express';
import nodemailer from 'nodemailer';
import Imap from 'imap';
import fs from 'fs';
import path from 'path';

import { generalLimiter } from '../middleware/rateLimit.js';
import { randomUUID } from 'crypto';

import { requireTenant, loadPublicTenant, WRITER_ROLES } from '../middleware/auth.js';
import { isValidDocId } from '../services/tenantPaths.js';
import { db, admin } from '../config/firebaseAdmin.js';
import { childLogger } from '../services/logger.js';
const log = childLogger('email');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
// Candidate Feedback Email Endpoint (Task #7)
router.post('/api/send-feedback', generalLimiter, requireTenant(WRITER_ROLES), async (req, res) => {
    const { to, candidateName, recruiterName, position, outcome, feedbackText, branding, html: prebuiltHtml } = req.body;
    if (!to || !feedbackText) return res.status(400).json({ error: 'Email ve geri bildirim metni gereklidir.' });
    if (!EMAIL_RE.test(to)) return res.status(400).json({ error: 'Geçersiz email adresi.' });
    if (typeof feedbackText !== 'string' || feedbackText.length > 10000) return res.status(400).json({ error: 'Geri bildirim metni geçersiz.' });
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return res.status(500).json({ error: 'Sistem email yapılandırması eksik.' });
    }

    // Derive subject/from fields at function scope so they're available to sendMail
    // regardless of whether pre-built HTML or the fallback builder is used.
    const b = branding || { companyName: 'Talent-Inn', primaryColor: '#1E3A8A' };
    const fromName = b.companyName || 'Talent-Inn';
    const outcomeLabel = outcome === 'positive' ? 'Olumlu' : outcome === 'negative' ? 'Olumsuz' : 'Beklemede';

    // Use the branded HTML generated by the frontend template service when available;
    // fall back to the inline HTML builder when not provided.
    let html;
    if (prebuiltHtml && typeof prebuiltHtml === 'string' && prebuiltHtml.length > 100 && prebuiltHtml.length <= 200000) {
        html = prebuiltHtml;
    } else {
        const outcomeColor = outcome === 'positive' ? '#10B981' : outcome === 'negative' ? '#EF4444' : '#F59E0B';
        html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:40px 0;background:#EFF6FF;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
<tr><td style="height:5px;background:${outcomeColor};"></td></tr>
<tr><td style="padding:36px 48px 0;"><span style="font-size:22px;font-weight:900;color:${outcomeColor};">${fromName}</span></td></tr>
<tr><td style="padding:24px 48px 0;">
<span style="background:${outcomeColor}20;border:1px solid ${outcomeColor}40;border-radius:10px;padding:8px 16px;font-size:13px;font-weight:700;color:${outcomeColor};">${outcomeLabel}</span>
</td></tr>
<tr><td style="padding:24px 48px 0;">
<p style="margin:0;font-size:15px;color:#334155;">Sayın <strong>${candidateName || 'Aday'}</strong>,</p>
${position ? `<p style="margin:8px 0 0;font-size:12px;color:#64748B;">Başvurulan Pozisyon: <strong>${position}</strong></p>` : ''}
<p style="margin:16px 0 0;font-size:14px;color:#475569;line-height:1.7;">Başvurunuz değerlendirilmiştir. Aşağıda sürecinize ilişkin geri bildiriminizi bulabilirsiniz.</p>
</td></tr>
<tr><td style="padding:24px 48px 0;">
<div style="background:#F8FAFC;border-left:4px solid ${outcomeColor};border-radius:0 12px 12px 0;padding:20px 24px;">
<p style="margin:0 0 8px;font-size:10px;font-weight:700;color:#94A3B8;letter-spacing:0.1em;text-transform:uppercase;">Geri Bildirim</p>
<p style="margin:0;font-size:14px;color:#334155;line-height:1.7;white-space:pre-line;">${feedbackText}</p>
</div>
</td></tr>
<tr><td style="padding:32px 48px 40px;">
<p style="margin:0;font-size:13px;color:#94A3B8;">Saygılarımızla,</p>
<p style="margin:4px 0 0;font-size:14px;font-weight:700;color:#334155;">${recruiterName || 'İK Ekibi'}</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
    }

    try {
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com', port: 465, secure: true,
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
            connectionTimeout: 10000, greetingTimeout: 5000, socketTimeout: 20000
        });
        await transporter.sendMail({
            from: `"${fromName}" <${process.env.EMAIL_USER}>`,
            to,
            subject: `Başvurunuz Hakkında Geri Bildirim — ${outcomeLabel}`,
            html,
        });
        res.json({ success: true });
    } catch (error) {
        log.error({ err: error }, '❌ Feedback email error');
        res.status(500).json({ error: 'Mail gönderilemedi: ' + (error.code || error.message) });
    }
});

// --- Interview Invite via Nodemailer (Google-bağımsız fallback) ---
router.post('/api/send-interview-invite', generalLimiter, requireTenant(WRITER_ROLES), async (req, res) => {
    const { to, subject, html, ics, candidateName, branding } = req.body;
    if (!to || !html) return res.status(400).json({ error: 'Email ve HTML içerik gereklidir.' });
    if (!EMAIL_RE.test(to)) return res.status(400).json({ error: 'Geçersiz email adresi.' });
    if (typeof html !== 'string' || html.length > 200000) return res.status(400).json({ error: 'HTML içerik geçersiz.' });
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return res.status(500).json({ error: 'Sistem email yapılandırması eksik.' });
    }
    const b = branding || { companyName: 'Talent-Inn', primaryColor: '#1E3A8A' };
    const fromName = (b.companyName || 'Talent-Inn').slice(0, 100);
    try {
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com', port: 465, secure: true,
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
            connectionTimeout: 10000, greetingTimeout: 5000, socketTimeout: 20000
        });
        const mailOptions = {
            from: `"${fromName}" <${process.env.EMAIL_USER}>`,
            to,
            subject: (subject || `Mülakat Davetiniz — ${candidateName || 'Aday'}`).slice(0, 200),
            html,
        };
        if (ics && typeof ics === 'string') {
            mailOptions.attachments = [{
                filename: 'mulakat.ics',
                content: ics,
                contentType: 'text/calendar; charset=utf-8; method=REQUEST',
            }];
        }
        await transporter.sendMail(mailOptions);
        log.info(`✉️ Interview invite sent to: ${to}`);
        res.json({ success: true });
    } catch (error) {
        log.error({ err: error }, '❌ Interview invite email error');
        res.status(500).json({ error: 'Mail gönderilemedi: ' + (error.code || error.message) });
    }
});


// /api/gemini-stt moved to routes/ai.js
router.post('/api/send-info-request', generalLimiter, requireTenant(WRITER_ROLES), async (req, res) => {
    // requestId ve respondUrl istemciden ALINMAZ: gelen kutusu tüm şirketlerde
    // ortak ve yanıt konudaki kimlikle eşleşiyor; istemci kimliği seçebilseydi
    // başka şirketin talebinin kimliğini kopyalayıp yanıtını kendine çekebilirdi.
    const { to, candidateName, recruiterName, recruiterEmail, position, requestMessage, requestedItems, sessionId, candidateId, branding } = req.body;
    if (!to || !candidateName) return res.status(400).json({ error: 'Email ve aday adı gereklidir.' });
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRe.test(to)) return res.status(400).json({ error: 'Geçersiz email adresi.' });
    // recruiterEmail flows into the SMTP `replyTo` header, so reject anything
    // that isn't a clean address (incl. CRLF that could splice extra headers).
    if (recruiterEmail && (!emailRe.test(recruiterEmail) || /[\r\n]/.test(recruiterEmail))) {
        return res.status(400).json({ error: 'Geçersiz recruiter email adresi.' });
    }
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return res.status(500).json({ error: 'Sistem email yapılandırması eksik.' });
    }
    const b = branding || { companyName: 'Talent-Inn', primaryColor: '#1E3A8A' };
    const fromName = (b.companyName || 'Talent-Inn').slice(0, 100);
    try {
        const requestId = `ir-${randomUUID()}`;
        const APP_URL = resolveAppUrl();
        // Şirket kimliği bağlantıda (geçici — PR 5'te publicLinks).
        const respondUrl = `${APP_URL}/respond/${requestId}?type=info&tenantId=${encodeURIComponent(req.tenant.id)}`;
        try {
            // Rol ve şirket requireTenant'ta denetlendi; kayıt şirketin yolunda.
            await db.doc(req.paths.infoRequest(requestId)).set(
                {
                    requestId,
                    candidateId: candidateId || null,
                    sessionId: sessionId || null,
                    candidateEmail: to,
                    candidateName,
                    recruiterEmail: recruiterEmail || process.env.EMAIL_USER || '',
                    recruiterName: recruiterName || '',
                    position: position || '',
                    requestMessage: requestMessage || '',
                    requestedItems: requestedItems || [],
                    status: 'pending',
                    createdAt: new Date(),
                }
            );
            log.info(`✅ infoRequest Firestore'a yazıldı: ${requestId}`);
        } catch (dbErr) {
            log.warn({ err: dbErr.message }, '⚠️ infoRequests Firestore write failed (non-fatal)');
        }
        const items = Array.isArray(requestedItems) && requestedItems.length
            ? requestedItems.map(i => `<li style="margin:6px 0;">📎 ${i}</li>`).join('') : '';
        const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#334155;max-width:600px;margin:0 auto;padding:32px;">
            <h2 style="color:${b.primaryColor||'#0E7490'};">${b.companyName || 'Talent-Inn'}</h2>
            <p>Sayın <strong>${candidateName}</strong>,</p>
            ${position ? `<p style="color:#64748B;">Başvurulan Pozisyon: <strong>${position}</strong></p>` : ''}
            <p>Başvurunuzu inceleme sürecimizde sizden bazı ek bilgi veya belgeler talep etmekteyiz.</p>
            ${requestMessage ? `<div style="background:#F8FAFC;border-left:4px solid #0E7490;padding:16px;margin:16px 0;"><p style="margin:0;white-space:pre-line;">${requestMessage}</p></div>` : ''}
            ${items ? `<p><strong>Talep Edilenler:</strong></p><ul>${items}</ul>` : ''}
            <div style="text-align:center;margin:32px 0;">
                <a href="${respondUrl}" style="background:${b.primaryColor||'#0E7490'};color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;">📝 Bilgi Gönder</a>
            </div>
            <p style="color:#94A3B8;">Saygılarımızla, <strong>${recruiterName || 'İK Ekibi'}</strong></p>
        </body></html>`;
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com', port: 465, secure: true,
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
            connectionTimeout: 10000, greetingTimeout: 5000, socketTimeout: 20000,
        });
        await transporter.sendMail({
            from: `"${fromName}" <${process.env.EMAIL_USER}>`,
            replyTo: recruiterEmail || process.env.EMAIL_USER,
            to,
            subject: `Bilgi Talebi — ${position || 'Başvurunuz'} [#${requestId}]`,
            html,
        });
        log.info(`✉️ Info request sent to: ${to} | requestId: ${requestId}`);
        res.json({ success: true, requestId, respondUrl });
    } catch (error) {
        log.error({ err: error }, '❌ Info request email error');
        res.status(500).json({ error: 'Bilgi talebi gönderilemedi: ' + (error.code || error.message) });
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

// ── Decode RFC 2047 encoded-word subjects ─────────────────────────────────────
function decodeEncodedWords(str) {
    if (!str) return '';
    str = str.replace(/\r?\n[ \t]+/g, '');
    return str.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, _cs, enc, text) => {
        try {
            if (enc.toUpperCase() === 'B') return Buffer.from(text, 'base64').toString('utf8');
            const qp = text.replace(/_/g, '\x20').replace(/=([0-9A-Fa-f]{2})/g, (__, h) => String.fromCharCode(parseInt(h, 16)));
            return Buffer.from(qp, 'binary').toString('utf8');
        } catch { return text; }
    });
}

// ── Extract only the "new" part of a reply email (strip quoted content) ───────
function extractReplyText(rawBodyText, rawHeaders) {
    const ctLine = (rawHeaders || '').match(/^Content-Type:\s*(.+?)(?:\r?\n(?!\s)|\r?\n\r?\n|$)/im)?.[1] || '';
    const ct = ctLine.toLowerCase();
    const isMultipart = ct.includes('multipart/');
    const boundaryMatch = ctLine.match(/boundary=(?:"([^"]+)"|([^\s;]+))/i);
    const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]) : null;
    const hdrs = (rawHeaders || '').toLowerCase();

    function decodeQP(str) {
        return str.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => {
            try { return String.fromCharCode(parseInt(h, 16)); } catch { return ''; }
        });
    }
    function decodeB64(str) {
        try { return Buffer.from(str.replace(/\s+/g, ''), 'base64').toString('utf8'); } catch { return str; }
    }
    function decodePartBody(body, partHeaders) {
        const ph = partHeaders.toLowerCase();
        if (ph.includes('quoted-printable')) return decodeQP(body);
        if (ph.includes('base64')) return decodeB64(body);
        return body;
    }
    function stripHtmlReply(html) {
        return html
            .replace(/<div[^>]*class="[^"]*gmail_quote[^"]*"[\s\S]*?<\/div\s*>/gi, '')
            .replace(/<div[^>]*class="[^"]*gmail_attr[^"]*"[\s\S]*?<\/div\s*>/gi, '')
            .replace(/<blockquote[\s\S]*?<\/blockquote\s*>/gi, '')
            .replace(/<\/?(p|div|br|h[1-6]|li|tr)[^>]*>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
            .replace(/[ \t]+/g, ' ').replace(/\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n')
            .trim();
    }
    function stripPlainReply(str) {
        const onWroteIdx = str.search(/^On .{0,200}wrote:\s*$/m);
        if (onWroteIdx > 10) str = str.slice(0, onWroteIdx);
        return str.split('\n').filter(ln => !ln.trimStart().startsWith('>')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    if (isMultipart && boundary) {
        const esc = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const parts = rawBodyText.split(new RegExp(`--${esc}(?:--)?`));
        let plainPart = '', htmlPart = '';
        for (const part of parts) {
            const sep = part.search(/\r?\n\r?\n/);
            if (sep === -1) continue;
            const ph = part.slice(0, sep);
            const pb = part.slice(sep).replace(/^\r?\n/, '');
            const decoded = decodePartBody(pb, ph);
            if (/content-type:\s*text\/plain/i.test(ph)) plainPart = decoded;
            else if (/content-type:\s*text\/html/i.test(ph)) htmlPart = decoded;
        }
        if (plainPart) return stripPlainReply(plainPart);
        if (htmlPart) return stripHtmlReply(htmlPart);
        return '';
    }

    const enc = hdrs.includes('quoted-printable') ? 'qp' : hdrs.includes('base64') ? 'b64' : 'raw';
    const decoded = enc === 'qp' ? decodeQP(rawBodyText) : enc === 'b64' ? decodeB64(rawBodyText) : rawBodyText;
    const looksHtml = /<html|<div|<p[ >]|<br/i.test(decoded.slice(0, 500));
    return looksHtml ? stripHtmlReply(decoded) : stripPlainReply(decoded);
}

// ── Check for email replies to info requests via IMAP ─────────────────────────
function fetchImapInfoReplies() {
    return new Promise((resolve, reject) => {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            return reject(new Error('EMAIL_USER veya EMAIL_PASS tanımlanmamış.'));
        }
        const imap = new Imap({
            user: process.env.EMAIL_USER,
            password: process.env.EMAIL_PASS,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            tlsOptions: { rejectUnauthorized: false },
            connTimeout: 20000,
            authTimeout: 15000,
        });
        const replies = [];
        function finish() { try { imap.end(); } catch (_) {} resolve(replies); }
        imap.once('error', err => { try { imap.end(); } catch (_) {} reject(err); });

        function runSearch() {
            const since = new Date();
            since.setDate(since.getDate() - 7);
            log.info(`📬 IMAP SINCE: ${since.toISOString().slice(0, 10)}`);
            imap.search([['SINCE', since]], (err, uids) => {
                if (err || !uids || uids.length === 0) {
                    log.info(`📬 SINCE sonuç: ${err ? err.message : 0} UID`);
                    return finish();
                }
                log.info(`📬 SINCE araması: ${uids.length} UID bulundu`);
                const slice = uids.slice(-200);
                const f = imap.fetch(slice, { bodies: ['HEADER.FIELDS (FROM SUBJECT DATE CONTENT-TYPE CONTENT-TRANSFER-ENCODING MIME-VERSION)', 'TEXT'], struct: false });
                let pending = 0;
                let fetchEnded = false;
                const tryFinish = () => { if (fetchEnded && pending === 0) finish(); };
                f.on('message', (msg) => {
                    pending++;
                    let raw = '';
                    let bodyText = '';
                    msg.on('body', (stream, info) => {
                        let buf = '';
                        stream.on('data', c => buf += c.toString('utf8'));
                        stream.once('end', () => {
                            if (info.which === 'TEXT') bodyText = buf;
                            else raw = buf;
                        });
                    });
                    msg.once('end', () => {
                        pending--;
                        // Unfold multi-line (folded) Subject header reliably
                        const rawLines = raw.split(/\r?\n/);
                        const subjLines = [];
                        let inSubj = false;
                        for (const ln of rawLines) {
                            if (/^Subject:/i.test(ln)) { inSubj = true; subjLines.push(ln.replace(/^Subject:\s*/i, '')); }
                            else if (inSubj && /^[ \t]/.test(ln)) { subjLines.push(ln.trim()); }
                            else if (inSubj) break;
                        }
                        const subject = decodeEncodedWords(subjLines.join(' '));
                        const idMatch = subject.match(/\[#(ir-[^\]]+)\]/);
                        const fromRaw = (raw.match(/^From:[ \t]*(.+)/im) || [])[1] || '';
                        const fromDecoded = decodeEncodedWords(fromRaw.trim());
                        const emailMatch = fromDecoded.match(/<([^>]+@[^>]+)>/) || fromDecoded.match(/([^\s<>]+@[^\s<>]+)/);
                        if (idMatch && emailMatch) {
                            log.info(`  ✅ Match: requestId=${idMatch[1]} from=${emailMatch[1]}`);
                            const cleanBody = extractReplyText(bodyText, raw);
                            replies.push({ requestId: idMatch[1].trim(), from: emailMatch[1].trim().toLowerCase(), subject, replyBody: cleanBody });
                        }
                        tryFinish();
                    });
                });
                f.once('error', (e) => { log.error({ err: e }, '❌ fetch error'); finish(); });
                f.once('end', () => { fetchEnded = true; tryFinish(); });
            });
        }

        imap.once('ready', () => {
            imap.openBox('[Gmail]/All Mail', true, (err) => {
                if (err) {
                    log.warn({ err: err.message }, '⚠️ [Gmail]/All Mail açılamadı, INBOX deneniyor');
                    imap.openBox('INBOX', true, (err2) => {
                        if (err2) return reject(err2);
                        runSearch();
                    });
                } else {
                    runSearch();
                }
            });
        });
        imap.connect();
    });
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

router.post('/api/check-info-replies', generalLimiter, requireTenant(WRITER_ROLES), async (req, res) => {
    try {
        const replies = await fetchImapInfoReplies();
        log.info({ err: replies.map(r => r.requestId) }, `📬 IMAP tarama tamamlandı: ${replies.length} eşleşme`);
        let updated = 0;
        for (const reply of replies) {
            try {
                // Gelen kutusu ortak; yalnız BU ŞİRKETİN talebiyle eşleşen yanıt
                // işlenir. Başka şirketin talebi burada "bulunamadı" olur.
                if (!isValidDocId(reply.requestId)) continue;
                const ref = db.doc(req.paths.infoRequest(reply.requestId));
                const snap = await ref.get();
                if (!snap.exists) continue;
                const patch = replyPatch(snap.data() || {}, reply);
                if (!patch) continue;
                await ref.update(patch);
                updated++;
                log.info(`✅ Yanıt işaretlendi: ${reply.requestId}`);
            } catch (err) {
                log.error({ err: err.message }, `❌ ${reply.requestId} güncellenemedi`);
            }
        }
        log.info(`📬 Tamamlandı: ${replies.length} tarandı, ${updated} güncellendi.`);
        res.json({ success: true, scanned: replies.length, updated });
    } catch (error) {
        log.error({ err: error }, '❌ IMAP check-info-replies error');
        res.status(500).json({ error: 'IMAP kontrolü başarısız: ' + (error.message || error) });
    }
});

// ── Send participant invite emails when a quick-start interview goes live
// requireTenant: mülakatı başlatan recruiter çağırır; alıcı listesi doğrulanır.
router.post('/api/send-participant-invite', generalLimiter, requireTenant(WRITER_ROLES), async (req, res) => {
    const { participants, joinLink, sessionId, candidateName, recruiterName } = req.body;
    if (!participants || !Array.isArray(participants) || participants.length === 0) {
        return res.status(400).json({ error: 'participants listesi gereklidir.' });
    }
    if (participants.length > 10 || participants.some(p => typeof p !== 'string' || !EMAIL_RE.test(p))) {
        return res.status(400).json({ error: 'Geçersiz katılımcı listesi (en fazla 10 geçerli e-posta).' });
    }
    if (!joinLink) return res.status(400).json({ error: 'joinLink gereklidir.' });
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        });
        const results = await Promise.allSettled(participants.map(email =>
            transporter.sendMail({
                from: `"Talent-Inn" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: `Mülakat Daveti — ${candidateName || 'Aday'} ile Görüşme`,
                html: `
                    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
                        <h2 style="color:#0F172A">Canlı Mülakat Davetiyesi</h2>
                        <p>Merhaba,</p>
                        <p><strong>${recruiterName || 'Mülakatçı'}</strong> sizi <strong>${candidateName || 'aday'}</strong> ile gerçekleştirilecek canlı mülakata davet etti.</p>
                        <p>Aşağıdaki bağlantıya tıklayarak katılabilirsiniz:</p>
                        <a href="${joinLink}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#2563EB;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">Mülakata Katıl</a>
                        <p style="color:#64748B;font-size:12px;margin-top:24px;">Bu e-posta Talent-Inn tarafından otomatik gönderilmiştir.<br>Oturum ID: ${sessionId}</p>
                    </div>
                `,
            })
        ));
        const failed = results.filter(r => r.status === 'rejected').map(r => r.reason?.message);
        if (failed.length > 0) log.warn({ err: failed }, '⚠️ Bazı katılımcı davetleri gönderilemedi');
        res.json({ success: true, sent: results.filter(r => r.status === 'fulfilled').length, failed: failed.length });
    } catch (error) {
        log.error({ err: error }, '❌ send-participant-invite error');
        res.status(500).json({ error: 'Davet gönderilemedi: ' + error.message });
    }
});

export default router;
