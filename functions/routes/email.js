// All email-sending and email-receiving (IMAP) flows live here. Six endpoints
// + the HTML invite-email template + the IMAP poller for candidate replies.
//
//   POST /api/send-invite              — recruiter/admin/department-user
//                                         platform invitation. Uses the
//                                         buildInviteEmailHtml() template.
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
import { verifyFirebaseToken } from '../middleware/auth.js';
import { db } from '../config/firebaseAdmin.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const router = Router();

// ─── Email HTML Template Builder ─────────────────────────────────────────────
function buildInviteEmailHtml({ companyName = 'Talent-Inn' }, { inviteLink, role, invitedByName = '' }) {
    const roleLabel = role === 'super_admin' ? 'Süper Admin' : role === 'department_user' ? 'Departman Kullanıcısı' : 'Recruiter';
    const TI_COLOR = '#1E3A8A';
    const TI_LIGHT = '#EEF2FF';
    return `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Talent-Inn Daveti</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(30,58,138,0.10);">

  <!-- TALENT-INN HEADER — always platform branded -->
  <tr><td style="background:linear-gradient(135deg,${TI_COLOR} 0%,#3B5FD9 100%);padding:36px 40px 28px 40px;text-align:center;">
    <div style="display:inline-block;background:rgba(255,255,255,0.12);border-radius:14px;padding:10px 22px;margin-bottom:14px;">
      <span style="color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.5px;">Talent</span><span style="color:#93C5FD;font-size:26px;font-weight:800;letter-spacing:-0.5px;">-Inn</span>
    </div>
    <p style="color:rgba(255,255,255,0.80);font-size:13px;margin:0;letter-spacing:0.02em;">AI Destekli İK Yönetimi &amp; Otonom Mülakat Koçu</p>
  </td></tr>

  <!-- BODY -->
  <tr><td style="padding:36px 40px 28px 40px;">
    <h2 style="color:#0F172A;font-size:22px;font-weight:800;margin:0 0 6px 0;">Platforma Davet Edildiniz! 🎉</h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 28px 0;">
      ${invitedByName ? `<strong style="color:#0F172A;">${invitedByName}</strong> sizi ` : 'Siz '}
      <strong style="color:#0F172A;">${companyName}</strong> adına
      <strong>Talent-Inn</strong> platformuna
      <span style="display:inline-block;background:${TI_LIGHT};color:${TI_COLOR};font-weight:700;font-size:13px;padding:2px 10px;border-radius:6px;border:1px solid #C7D2FE;">${roleLabel}</span>
      olarak davet etti.
    </p>

    <!-- WHAT IS TALENT-INN -->
    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;padding:22px 26px;margin-bottom:28px;">
      <p style="color:#64748B;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;margin:0 0 14px 0;">Talent-Inn nedir?</p>
      <p style="color:#334155;font-size:14px;line-height:1.65;margin:0 0 16px 0;">
        Talent-Inn; yapay zeka destekli bir <strong>İnsan Kaynakları yönetimi ve işe alım platformudur</strong>.
        CV analizi, aday pipeline takibi ve <strong>otonom mülakat koçu</strong> sayesinde işe alım süreçlerinizi uçtan uca dijitalleştirir.
      </p>
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="width:50%;vertical-align:top;padding:4px 8px 4px 0;">
            <span style="color:${TI_COLOR};font-size:15px;">&#10003;</span>
            <span style="color:#334155;font-size:13px;"> AI CV Analizi &amp; Skorlama</span>
          </td>
          <td style="width:50%;vertical-align:top;padding:4px 0 4px 8px;">
            <span style="color:${TI_COLOR};font-size:15px;">&#10003;</span>
            <span style="color:#334155;font-size:13px;"> Otonom Mülakat Koçu</span>
          </td>
        </tr>
        <tr>
          <td style="width:50%;vertical-align:top;padding:4px 8px 4px 0;">
            <span style="color:${TI_COLOR};font-size:15px;">&#10003;</span>
            <span style="color:#334155;font-size:13px;"> Aday Pipeline Yönetimi</span>
          </td>
          <td style="width:50%;vertical-align:top;padding:4px 0 4px 8px;">
            <span style="color:${TI_COLOR};font-size:15px;">&#10003;</span>
            <span style="color:#334155;font-size:13px;"> Gerçek Zamanlı Raporlama</span>
          </td>
        </tr>
        <tr>
          <td style="width:50%;vertical-align:top;padding:4px 8px 4px 0;">
            <span style="color:${TI_COLOR};font-size:15px;">&#10003;</span>
            <span style="color:#334155;font-size:13px;"> STAR Yetkinlik Değerlendirmesi</span>
          </td>
          <td style="width:50%;vertical-align:top;padding:4px 0 4px 8px;">
            <span style="color:${TI_COLOR};font-size:15px;">&#10003;</span>
            <span style="color:#334155;font-size:13px;"> Departman Bazlı Erişim</span>
          </td>
        </tr>
      </table>
    </div>

    <!-- INVITE DETAILS BOX -->
    <div style="background:${TI_LIGHT};border:1px solid #C7D2FE;border-radius:12px;padding:18px 22px;margin-bottom:28px;">
      <p style="color:#3730A3;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;margin:0 0 10px 0;">Davet Detayları</p>
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr><td style="color:#6366F1;font-size:13px;padding:3px 0;width:110px;">Şirket</td><td style="color:#1E1B4B;font-size:13px;font-weight:700;padding:3px 0;">${companyName}</td></tr>
        <tr><td style="color:#6366F1;font-size:13px;padding:3px 0;">Rol</td><td style="color:#1E1B4B;font-size:13px;font-weight:700;padding:3px 0;">${roleLabel}</td></tr>
        ${invitedByName ? `<tr><td style="color:#6366F1;font-size:13px;padding:3px 0;">Davet Eden</td><td style="color:#1E1B4B;font-size:13px;font-weight:700;padding:3px 0;">${invitedByName}</td></tr>` : ''}
        <tr><td style="color:#6366F1;font-size:13px;padding:3px 0;">Platform</td><td style="color:#1E1B4B;font-size:13px;font-weight:700;padding:3px 0;">Talent-Inn</td></tr>
      </table>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:28px;">
      <a href="${inviteLink}" style="background:linear-gradient(135deg,${TI_COLOR} 0%,#3B5FD9 100%);color:#ffffff;padding:16px 40px;text-decoration:none;border-radius:12px;font-weight:800;font-size:15px;display:inline-block;letter-spacing:0.01em;">Daveti Kabul Et &amp; Başla →</a>
    </div>

    <!-- ONE-TIME LINK WARNING -->
    <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <p style="color:#92400E;font-size:12px;margin:0;"><strong>&#9888; Not:</strong> Bu davet linki kişiseldir ve yalnızca bir kez kullanılabilir. Başkasıyla paylaşmayın.</p>
    </div>

    <p style="color:#94A3B8;font-size:11px;margin:0;">Butona tıklayamıyorsanız bu bağlantıyı kopyalayın:<br/><a href="${inviteLink}" style="color:${TI_COLOR};word-break:break-all;font-size:11px;">${inviteLink}</a></p>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#F8FAFC;padding:20px 40px;border-top:1px solid #E2E8F0;text-align:center;">
    <p style="color:#64748B;font-size:12px;font-weight:700;margin:0 0 4px 0;">Talent-Inn &mdash; AI Destekli İK &amp; Mülakat Platformu</p>
    <p style="color:#94A3B8;font-size:11px;margin:0;">Bu e-posta <strong>${companyName}</strong> adına Talent-Inn tarafından gönderilmiştir.</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

// Invite Email Endpoint
router.post('/api/send-invite', async (req, res) => {
    const { email, role, inviteLink, branding, invitedByName } = req.body;
    console.log(`✉️ Received invite request for: ${email}, role: ${role}`);

    if (!email || !inviteLink) {
        console.warn('❌ Missing email or inviteLink in request');
        return res.status(400).json({ error: 'Email ve davet linki gereklidir.' });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error('❌ Email configuration missing in .env (EMAIL_USER or EMAIL_PASS)');
        return res.status(500).json({ error: 'Sistem email yapılandırması eksik (.env kontrol edin).' });
    }

    try {
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            connectionTimeout: 10000,
            greetingTimeout: 5000,
            socketTimeout: 20000
        });

        const brandingData = branding || {};
        const companyName = brandingData.companyName || 'Talent-Inn';
        const roleLabel = role === 'super_admin' ? 'Süper Admin' : role === 'department_user' ? 'Departman Kullanıcısı' : 'Recruiter';

        const mailOptions = {
            from: `"Talent-Inn" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `Talent-Inn'e Davet Edildiniz — ${roleLabel} | ${companyName}`,
            html: buildInviteEmailHtml({ companyName }, { inviteLink, role, invitedByName })
        };

        await transporter.sendMail(mailOptions);
        console.log(`✉️ Invite email sent successfully to: ${email}`);
        res.json({ success: true, message: 'Davet maili başarıyla gönderildi.' });
    } catch (error) {
        console.error('❌ Nodemailer Error:', error);
        res.status(500).json({ error: 'Mail gönderilirken bir hata oluştu: ' + (error.code || error.message) });
    }
});

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
    if (count > 0) console.log(`🧹 KVKK Veri Minimizasyonu: ${count} adet eski ham CV dosyası diskten silindi. (İletişim kayıtları korunuyor)`);
}
// Candidate Feedback Email Endpoint (Task #7)
router.post('/api/send-feedback', generalLimiter, verifyFirebaseToken, async (req, res) => {
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
        console.error('❌ Feedback email error:', error);
        res.status(500).json({ error: 'Mail gönderilemedi: ' + (error.code || error.message) });
    }
});

// --- Interview Invite via Nodemailer (Google-bağımsız fallback) ---
router.post('/api/send-interview-invite', generalLimiter, verifyFirebaseToken, async (req, res) => {
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
        console.log(`✉️ Interview invite sent to: ${to}`);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Interview invite email error:', error);
        res.status(500).json({ error: 'Mail gönderilemedi: ' + (error.code || error.message) });
    }
});


// /api/gemini-stt moved to routes/ai.js
router.post('/api/send-info-request', generalLimiter, verifyFirebaseToken, async (req, res) => {
    const { to, candidateName, recruiterName, recruiterEmail, position, requestMessage, requestedItems, sessionId, candidateId, branding, requestId: clientRequestId, respondUrl: clientRespondUrl } = req.body;
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
        const requestId = clientRequestId || `ir-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const APP_URL = process.env.VITE_APP_URL || 'https://talentflow-84bb6.web.app';
        const respondUrl = clientRespondUrl || `${APP_URL}/respond/${requestId}?type=info`;
        try {
            await fsSet(
                'artifacts/talent-flow/public/data/infoRequests',
                requestId,
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
                },
                req.firebaseToken
            );
            console.log(`✅ infoRequest Firestore'a yazıldı: ${requestId}`);
        } catch (dbErr) {
            console.warn('⚠️ infoRequests Firestore write failed (non-fatal):', dbErr.message);
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
        console.log(`✉️ Info request sent to: ${to} | requestId: ${requestId}`);
        res.json({ success: true, requestId, respondUrl });
    } catch (error) {
        console.error('❌ Info request email error:', error);
        res.status(500).json({ error: 'Bilgi talebi gönderilemedi: ' + (error.code || error.message) });
    }
});

// ─── Candidate Respond (public — no auth required) ────────────────────────────
router.post('/api/candidate-respond', generalLimiter, async (req, res) => {
    const { id, type, action, responseData } = req.body;
    if (!id || !type) return res.status(400).json({ error: 'id ve type gereklidir.' });
    try {
        const now = admin.firestore.FieldValue.serverTimestamp();
        if (type === 'info') {
            const ref = db.doc(`artifacts/talent-flow/public/data/infoRequests/${id}`);
            const snap = await ref.get();
            if (!snap.exists) return res.status(404).json({ error: 'Talep bulunamadı.' });
            await ref.update({ status: 'responded', responseData: responseData || '', respondedAt: now });
            const data = snap.data();
            if (data.sessionId) {
                await db.doc(`interviews/${data.sessionId}`).set({
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
            await db.doc(`interviews/${id}`).set({
                candidateResponse: { status: action, respondedAt: new Date().toISOString() },
            }, { merge: true });
        } else {
            return res.status(400).json({ error: 'Geçersiz type.' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Candidate respond error:', error);
        res.status(500).json({ error: 'Yanıt kaydedilemedi: ' + error.message });
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
            console.log(`📬 IMAP SINCE: ${since.toISOString().slice(0, 10)}`);
            imap.search([['SINCE', since]], (err, uids) => {
                if (err || !uids || uids.length === 0) {
                    console.log(`📬 SINCE sonuç: ${err ? err.message : 0} UID`);
                    return finish();
                }
                console.log(`📬 SINCE araması: ${uids.length} UID bulundu`);
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
                            console.log(`  ✅ Match: requestId=${idMatch[1]} from=${emailMatch[1]}`);
                            const cleanBody = extractReplyText(bodyText, raw);
                            replies.push({ requestId: idMatch[1].trim(), from: emailMatch[1].trim().toLowerCase(), subject, replyBody: cleanBody });
                        }
                        tryFinish();
                    });
                });
                f.once('error', (e) => { console.error('❌ fetch error:', e); finish(); });
                f.once('end', () => { fetchEnded = true; tryFinish(); });
            });
        }

        imap.once('ready', () => {
            imap.openBox('[Gmail]/All Mail', true, (err) => {
                if (err) {
                    console.warn('⚠️ [Gmail]/All Mail açılamadı, INBOX deneniyor:', err.message);
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

router.post('/api/check-info-replies', generalLimiter, verifyFirebaseToken, async (req, res) => {
    try {
        const replies = await fetchImapInfoReplies();
        console.log(`📬 IMAP tarama tamamlandı: ${replies.length} eşleşme`, replies.map(r => r.requestId));
        let updated = 0;
        const token = req.firebaseToken;
        for (const reply of replies) {
            try {
                const docPath = `artifacts/talent-flow/public/data/infoRequests/${reply.requestId}`;
                const existing = await fsGet(docPath, token);
                if (!existing) { console.warn(`⚠️ requestId ${reply.requestId} bulunamadı`); continue; }
                const status = existing.fields?.status?.stringValue;
                const existingReplyBody = existing.fields?.replyBody?.stringValue || '';
                if (status !== 'pending' && existingReplyBody) continue;
                const patch = { replySubject: reply.subject, replyBody: reply.replyBody || '' };
                if (status === 'pending') { patch.status = 'responded'; patch.respondedAt = new Date(); }
                await fsPatch(docPath, patch, token);
                updated++;
                console.log(`✅ Yanıt işaretlendi: ${reply.requestId}`);
            } catch (err) {
                console.error(`❌ ${reply.requestId} güncellenemedi:`, err.message);
            }
        }
        console.log(`📬 Tamamlandı: ${replies.length} tarandı, ${updated} güncellendi.`);
        res.json({ success: true, scanned: replies.length, updated });
    } catch (error) {
        console.error('❌ IMAP check-info-replies error:', error);
        res.status(500).json({ error: 'IMAP kontrolü başarısız: ' + (error.message || error) });
    }
});

// ── Send participant invite emails when a quick-start interview goes live
router.post('/api/send-participant-invite', generalLimiter, async (req, res) => {
    const { participants, joinLink, sessionId, candidateName, recruiterName } = req.body;
    if (!participants || !Array.isArray(participants) || participants.length === 0) {
        return res.status(400).json({ error: 'participants listesi gereklidir.' });
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
        if (failed.length > 0) console.warn('⚠️ Bazı katılımcı davetleri gönderilemedi:', failed);
        res.json({ success: true, sent: results.filter(r => r.status === 'fulfilled').length, failed: failed.length });
    } catch (error) {
        console.error('❌ send-participant-invite error:', error);
        res.status(500).json({ error: 'Davet gönderilemedi: ' + error.message });
    }
});

export default router;
