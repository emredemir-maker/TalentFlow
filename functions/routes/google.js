// Gmail + Google Calendar çağrıları — SPA'nın kullanıcı adına yaptığı her
// Google API isteği buradan geçer.
//
// ── NEDEN SUNUCUDA ──────────────────────────────────────────────────────────
// Eskiden SPA, kullanıcı dokümanındaki düz metin erişim jetonunu okuyup
// Google'a kendisi gidiyordu; bu yüzden jeton istemciye açık durmak
// zorundaydı. Artık jeton yalnızca sunucuda, şifreli depoda
// (services/integrationTokens.js) ve kimin adına çağrı yapılacağı DOĞRULANMIŞ
// Firebase kimliğinden (req.user.uid) geliyor — istemci jeton taşımıyor.
//
//   POST /api/google/send-email        — Gmail.send (düz / HTML / HTML+ICS)
//   GET  /api/google/thread/:threadId  — konuşma başlıkları (Mesajlar sayfası)
//   GET  /api/google/check-messages    — ilk eşleşen mesajın içeriği
//   GET  /api/google/calendar-events   — aralıktaki etkinlikler
//   POST /api/google/calendar-events   — etkinlik + otomatik Meet bağlantısı
//
// Hata yanıtları `code` taşır: REAUTH_REQUIRED / NOT_CONNECTED (bağlantı
// yenilenmeli), TOKEN_EXPIRED (Google 401), AUTH_SCOPE (Google 403).
import { Router } from 'express';

import { requireTenant, SELF_WRITER_ROLES } from '../middleware/auth.js';
import { IntegrationError } from '../services/integrationTokens.js';
import { tokenStore } from '../services/integrationTokenStore.js';
import { childLogger } from '../services/logger.js';
const log = childLogger('google');

const router = Router();

// RFC2822 başlıklarına ham interpolasyon yapıldığı için adresler katı
// doğrulanır — CRLF/başlık enjeksiyonunu ve rastgele alıcıya göndermeyi keser.
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;

const isEmail = (v) => typeof v === 'string' && EMAIL_RE.test(v.trim());

/** "a@x.com, b@y.com" → ['a@x.com','b@y.com']; geçersiz biri varsa null. */
export function parseRecipients(to) {
    if (typeof to !== 'string') return null;
    const list = to.split(',').map((s) => s.trim()).filter(Boolean);
    if (!list.length || !list.every(isEmail)) return null;
    return list;
}

const b64 = (s) => Buffer.from(String(s ?? ''), 'utf8').toString('base64');
const b64url = (s) => b64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const boundaryOf = (tag) => `${tag}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

/**
 * Gmail'e gidecek RFC2822 mesajını kurar (base64url). Eskiden istemcideki
 * integrationService.sendDirectEmail'in yaptığıyla birebir aynı yapı.
 * Doğrulama çağıranda: buraya gelen to/replyTo/subject temiz kabul edilir.
 */
export function buildRawEmail({ to, subject, body, html, replyTo, ics }) {
    const head = [
        `To: ${to}`,
        `Subject: =?utf-8?B?${b64(subject)}?=`,
        ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    ];
    let raw;
    if (html && ics) {
        const outer = boundaryOf('outer');
        const inner = boundaryOf('inner');
        raw = [
            ...head,
            'MIME-Version: 1.0',
            `Content-Type: multipart/mixed; boundary="${outer}"`,
            '',
            `--${outer}`,
            `Content-Type: multipart/alternative; boundary="${inner}"`,
            '',
            `--${inner}`,
            'Content-Type: text/plain; charset="UTF-8"',
            '',
            body || '',
            '',
            `--${inner}`,
            'Content-Type: text/html; charset="UTF-8"',
            '',
            html,
            '',
            `--${inner}--`,
            '',
            `--${outer}`,
            'Content-Type: text/calendar; method=REQUEST; charset="UTF-8"',
            'Content-Disposition: attachment; filename="invite.ics"',
            '',
            ics,
            '',
            `--${outer}--`,
        ].join('\r\n');
    } else if (html) {
        const boundary = boundaryOf('boundary');
        raw = [
            ...head,
            'MIME-Version: 1.0',
            `Content-Type: multipart/alternative; boundary="${boundary}"`,
            '',
            `--${boundary}`,
            'Content-Type: text/plain; charset="UTF-8"',
            '',
            body || '',
            '',
            `--${boundary}`,
            'Content-Type: text/html; charset="UTF-8"',
            '',
            html,
            '',
            `--${boundary}--`,
        ].join('\r\n');
    } else {
        raw = [
            ...head,
            'Content-Type: text/plain; charset="UTF-8"',
            'MIME-Version: 1.0',
            '',
            body || '',
        ].join('\n');
    }
    return b64url(raw);
}

/** Hata → HTTP yanıtı; istemci `code`a bakarak yeniden bağlanma önerir. */
function sendError(res, err, fallback) {
    if (err instanceof IntegrationError) {
        const status = err.code === 'BAD_PROVIDER' ? 400 : 401;
        return res.status(status).json({ success: false, code: err.code, authMode: err.authMode, error: err.message });
    }
    if (err?.status === 401) return res.status(401).json({ success: false, code: 'TOKEN_EXPIRED', error: 'Google oturum süresi dolmuş.' });
    if (err?.status === 403) return res.status(403).json({ success: false, code: 'AUTH_SCOPE', error: `Google erişim yetkisi yetersiz (403): ${err.message}` });
    log.error({ err: err?.message }, `[google] ${fallback}`);
    return res.status(err?.status && err.status < 600 ? err.status : 500).json({ success: false, error: err?.message || fallback });
}

/** Kullanıcının jetonuyla Google API çağrısı; hata durumunda status taşıyan Error fırlatır. */
async function googleFetch(req, url, init = {}) {
    // Jeton bu şirketteki bağlantıdan: başka şirketteki bağlantı kullanılamaz.
    const token = await tokenStore.getAccessToken(req.tenant.id, req.user.uid, 'google');
    const res = await fetch(url, {
        ...init,
        headers: { ...(init.headers || {}), 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.error?.message || `Google API hatası (${res.status})`);
        err.status = res.status;
        throw err;
    }
    return data;
}

router.post('/api/google/send-email', requireTenant(SELF_WRITER_ROLES), async (req, res) => {
    const { to, subject = '', body, html, replyTo, ics } = req.body || {};
    const recipients = parseRecipients(to);
    if (!recipients) return res.status(400).json({ success: false, error: 'Geçersiz alıcı adresi.' });
    if (replyTo && !isEmail(replyTo)) return res.status(400).json({ success: false, error: 'Geçersiz yanıt adresi.' });
    if (typeof subject !== 'string' || /[\r\n]/.test(subject)) {
        return res.status(400).json({ success: false, error: 'Geçersiz konu satırı.' });
    }
    for (const part of [body, html, ics]) {
        if (part != null && typeof part !== 'string') return res.status(400).json({ success: false, error: 'Geçersiz mesaj gövdesi.' });
    }

    try {
        const raw = buildRawEmail({ to: recipients.join(', '), subject, body, html, replyTo: replyTo?.trim(), ics });
        const data = await googleFetch(req, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw }),
        });
        res.json({ success: true, messageId: data.id, threadId: data.threadId });
    } catch (err) {
        sendError(res, err, 'E-posta gönderilemedi.');
    }
});

router.get('/api/google/thread/:threadId', requireTenant(SELF_WRITER_ROLES), async (req, res) => {
    const { threadId } = req.params;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(threadId)) return res.status(400).json({ success: false, error: 'Geçersiz konuşma kimliği.' });
    try {
        const data = await googleFetch(
            req,
            `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`
        );
        const messages = (data.messages || []).map((msg) => {
            const headers = msg.payload?.headers || [];
            const get = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
            return {
                id: msg.id, threadId: msg.threadId,
                from: get('From'), to: get('To'),
                subject: get('Subject'), date: get('Date'),
                snippet: msg.snippet || '', labelIds: msg.labelIds || [],
            };
        });
        res.json({ success: true, messages });
    } catch (err) {
        sendError(res, err, 'Konuşma alınamadı.');
    }
});

router.get('/api/google/check-messages', requireTenant(SELF_WRITER_ROLES), async (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== 'string') return res.status(400).json({ success: false, error: 'Query is required.' });

    try {
        const searchData = await googleFetch(req, `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=1`);
        if (!searchData.messages?.length) return res.json({ success: true, found: false });

        const msgId = searchData.messages[0].id;
        const msgData = await googleFetch(req, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(msgId)}`);

        const decode = (data) => Buffer.from(data, 'base64').toString('utf-8');
        let body = '';
        if (msgData.payload?.parts) {
            const part = msgData.payload.parts.find((p) => p.mimeType === 'text/plain') || msgData.payload.parts[0];
            if (part?.body?.data) body = decode(part.body.data);
        } else if (msgData.payload?.body?.data) {
            body = decode(msgData.payload.body.data);
        }
        const headers = msgData.payload?.headers || [];
        res.json({
            success: true,
            found: true,
            message: {
                id: msgId,
                snippet: msgData.snippet,
                body,
                from: headers.find((h) => h.name === 'From')?.value,
                date: headers.find((h) => h.name === 'Date')?.value,
            },
        });
    } catch (err) {
        sendError(res, err, 'Mail aranırken hata.');
    }
});

const isDateString = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

router.get('/api/google/calendar-events', requireTenant(SELF_WRITER_ROLES), async (req, res) => {
    const { timeMin, timeMax } = req.query;
    if (!isDateString(timeMin) || !isDateString(timeMax)) {
        return res.status(400).json({ success: false, error: 'timeMin ve timeMax geçerli tarih olmalı.' });
    }
    try {
        const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
        const data = await googleFetch(req, url);
        res.json({ success: true, events: data.items || [] });
    } catch (err) {
        sendError(res, err, 'Takvim verileri alınamadı.');
    }
});

router.post('/api/google/calendar-events', requireTenant(SELF_WRITER_ROLES), async (req, res) => {
    const { summary, description, startDateTime, endDateTime, guestEmail, guestEmails, timeZone } = req.body || {};
    if (!summary || !isDateString(startDateTime) || !isDateString(endDateTime)) {
        return res.status(400).json({ success: false, error: 'Eksik parametre.' });
    }
    const guests = [];
    for (const e of [guestEmail, ...(Array.isArray(guestEmails) ? guestEmails : [])]) {
        if (!e) continue;
        if (!isEmail(e)) return res.status(400).json({ success: false, error: 'Geçersiz davetli adresi.' });
        if (!guests.includes(e.trim())) guests.push(e.trim());
    }
    const tz = (typeof timeZone === 'string' && timeZone) || 'UTC';

    const event = {
        summary,
        description,
        start: { dateTime: startDateTime, timeZone: tz },
        end: { dateTime: endDateTime, timeZone: tz },
        conferenceData: {
            createRequest: {
                requestId: `tf-${Date.now()}`,
                conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
        },
        reminders: {
            useDefault: false,
            overrides: [
                { method: 'email', minutes: 60 },
                { method: 'popup', minutes: 10 },
            ],
        },
        ...(guests.length ? { attendees: guests.map((email) => ({ email })), guestsCanModify: false } : {}),
    };

    try {
        const data = await googleFetch(
            req,
            'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none',
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event) }
        );
        const meetLink = data.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri
            || data.conferenceData?.entryPoints?.[0]?.uri
            || null;
        res.json({ success: true, htmlLink: data.htmlLink, meetLink, eventId: data.id });
    } catch (err) {
        sendError(res, err, 'Takvim etkinliği oluşturulamadı.');
    }
});

export default router;
