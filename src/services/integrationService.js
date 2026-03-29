// src/services/integrationService.js
// Google Workspace (Gmail + Calendar) integration.
//
// HYBRID MODE:
//   - Admin Entegrasyon Merkezi'nden özel credentials girdiyse → server-side OAuth popup
//     (yeni Firebase projesine deploy için, refresh_token ile kalıcı bağlantı)
//   - Admin credentials girmemişse → Firebase signInWithPopup fallback
//     (mevcut test ortamı, hemen çalışır, yapılandırma gerekmez)

import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

const USERS_PATH = 'artifacts/talent-flow/public/data/users';
const TOKEN_TTL_MS = 55 * 60 * 1000;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const getIdToken = async () => {
    const user = getAuth().currentUser;
    return user ? user.getIdToken() : null;
};

const buildGoogleProvider = (forceConsent = false) => {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/gmail.modify');
    provider.addScope('https://www.googleapis.com/auth/calendar.events');
    provider.setCustomParameters({
        access_type: 'offline',
        include_granted_scopes: 'true',
        ...(forceConsent ? { prompt: 'consent' } : {})
    });
    return provider;
};

// ─── CONNECT VIA SERVER-SIDE OAUTH (admin credentials yapılandırılmışsa) ──────
const _connectViaServer = (userId, oauthUrl) => {
    return new Promise((resolve, reject) => {
        const w = 500, h = 650;
        const left = window.screenLeft + (window.outerWidth - w) / 2;
        const top  = window.screenTop  + (window.outerHeight - h) / 2;
        const popup = window.open(oauthUrl, 'google-oauth', `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`);

        if (!popup) {
            reject(new Error('Popup engellendi. Lütfen tarayıcı popup engelleyicisini devre dışı bırakın.'));
            return;
        }

        const handleMessage = (event) => {
            if (event.origin !== window.location.origin) return;
            if (event.data?.type !== 'GOOGLE_OAUTH_CALLBACK') return;
            window.removeEventListener('message', handleMessage);
            clearInterval(checkClosed);
            if (event.data.error) reject(new Error(event.data.error));
            else resolve({ success: true, email: event.data.email });
        };
        window.addEventListener('message', handleMessage);

        const checkClosed = setInterval(() => {
            if (popup.closed) {
                clearInterval(checkClosed);
                window.removeEventListener('message', handleMessage);
                reject(new Error('Bağlantı penceresi kapatıldı.'));
            }
        }, 500);
    });
};

// ─── CONNECT VIA FIREBASE (fallback — özel credentials yoksa) ─────────────────
const _connectViaFirebase = async (userId, forceConsent) => {
    const provider = buildGoogleProvider(forceConsent);
    const result = await signInWithPopup(getAuth(), provider);

    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;
    if (!token) throw new Error('Erişim belirteci (Access Token) alınamadı.');

    const expiresAt = Date.now() + TOKEN_TTL_MS;
    await updateDoc(doc(db, USERS_PATH, userId), {
        'integrations.google': {
            connected: true,
            email: result.user.email,
            accessToken: token,
            tokenExpiresAt: expiresAt,
            connectedAt: new Date().toISOString(),
            authMode: 'firebase'
        }
    });

    return { success: true, email: result.user.email, token };
};

// ─── CONNECT — HİBRİT GİRİŞ NOKTASI ─────────────────────────────────────────
export const connectGoogleWorkspace = async (userId, forceConsent = false) => {
    try {
        const idToken = await getIdToken();

        // Admin credentials yapılandırılmış mı? Server'a sor.
        const urlRes = await fetch(
            `/api/auth/google/url?userId=${encodeURIComponent(userId)}&force=${forceConsent ? '1' : '0'}`,
            idToken ? { headers: { 'Authorization': `Bearer ${idToken}` } } : {}
        );

        if (urlRes.ok) {
            // ✅ Admin credentials var → server-side OAuth (deploy-taşınabilir)
            console.log('[Google] Admin credentials mevcut, server-side OAuth kullanılıyor');
            const { url } = await urlRes.json();
            return await _connectViaServer(userId, url);
        } else {
            // ⬇️ Credentials yok → Firebase OAuth fallback (test ortamı)
            console.log('[Google] Admin credentials yok, Firebase OAuth fallback kullanılıyor');
            return await _connectViaFirebase(userId, forceConsent);
        }
    } catch (error) {
        console.error('[Google] Connect error:', error);
        let errorMessage = error.message;
        if (error.code === 'auth/popup-closed-by-user') errorMessage = 'Bağlantı penceresi kapatıldı.';
        if (error.code === 'auth/popup-blocked') errorMessage = 'Tarayıcı popup\'ı engelledi. Lütfen popup engelleyiciyi devre dışı bırakın.';
        return { success: false, error: errorMessage };
    }
};

// ─── SILENT TOKEN REFRESH ─────────────────────────────────────────────────────
const _silentRefreshViaServer = async (userId, integration, idToken) => {
    try {
        const res = await fetch('/api/auth/google/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ userId, refreshToken: integration.refreshToken })
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.accessToken || null;
    } catch {
        return null;
    }
};

const _silentRefreshViaFirebase = async (userId, integration) => {
    try {
        const provider = buildGoogleProvider(false);
        const result = await signInWithPopup(getAuth(), provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const token = credential?.accessToken;
        if (!token) throw new Error('Token alınamadı');

        const expiresAt = Date.now() + TOKEN_TTL_MS;
        await updateDoc(doc(db, USERS_PATH, userId), {
            'integrations.google': {
                ...integration,
                accessToken: token,
                tokenExpiresAt: expiresAt,
                email: result.user.email,
                connected: true
            }
        });

        console.log('[Google] Firebase token yenilendi, geçerli:', new Date(expiresAt).toLocaleTimeString());
        return token;
    } catch (err) {
        console.error('[Google] Firebase refresh başarısız:', err);
        return null;
    }
};

// ─── ENSURE VALID TOKEN ────────────────────────────────────────────────────────
export const ensureValidGoogleToken = async (userId, userProfile) => {
    const integration = userProfile?.integrations?.google;
    if (!integration?.connected || !integration?.accessToken) return null;

    const now = Date.now();
    const expiresAt = integration.tokenExpiresAt ?? 0;
    if (expiresAt && now < expiresAt) return integration.accessToken;

    console.log('[Google] Token süresi dolmuş, yenileniyor...');

    // Server-side OAuth ile bağlandıysa (refreshToken var) → API ile yenile
    if (integration.refreshToken && integration.authMode !== 'firebase') {
        const idToken = await getIdToken();
        if (idToken) return _silentRefreshViaServer(userId, integration, idToken);
    }

    // Firebase OAuth ile bağlandıysa → signInWithPopup ile yenile
    return _silentRefreshViaFirebase(userId, integration);
};

// ─── DISCONNECT ───────────────────────────────────────────────────────────────
export const disconnectGoogleWorkspace = async (userId) => {
    try {
        await updateDoc(doc(db, USERS_PATH, userId), {
            'integrations.google': {
                connected: false,
                disconnectedAt: new Date().toISOString()
            }
        });
        return { success: true };
    } catch (error) {
        console.error('[Google] Disconnect error:', error);
        return { success: false, error: error.message };
    }
};

// ─── SEND EMAIL (unchanged — token-based) ────────────────────────────────────
export const sendDirectEmail = async (userId, token, emailData) => {
    try {
        const { to, subject, body, html, replyTo, ics } = emailData;

        const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;

        let rawMessage;
        if (html && ics) {
            const outer = `outer_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const inner = `inner_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const parts = [
                `To: ${to}`,
                `Subject: ${utf8Subject}`,
                ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
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
                `--${outer}--`
            ];
            rawMessage = parts.join('\r\n');
        } else if (html) {
            const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const parts = [
                `To: ${to}`,
                `Subject: ${utf8Subject}`,
                ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
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
                `--${boundary}--`
            ];
            rawMessage = parts.join('\r\n');
        } else {
            rawMessage = [
                `To: ${to}`,
                `Subject: ${utf8Subject}`,
                ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
                'Content-Type: text/plain; charset="UTF-8"',
                'MIME-Version: 1.0',
                '',
                body
            ].join('\n');
        }

        const encodedMessage = btoa(unescape(encodeURIComponent(rawMessage)))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw: encodedMessage })
        });

        const data = await response.json();
        if (!response.ok) {
            if (response.status === 401) throw new Error('TOKEN_EXPIRED: Oturum süresi dolmuş.');
            if (response.status === 403) throw new Error('AUTH_SCOPE: E-posta gönderme yetkisi yetersiz (403).');
            throw new Error(data.error?.message || `E-posta gönderilemedi (${response.status})`);
        }

        return { success: true, messageId: data.id, threadId: data.threadId };
    } catch (error) {
        console.error('[Google] Send email error:', error);
        return { success: false, error: error.message };
    }
};

// ─── FETCH EMAIL THREAD ───────────────────────────────────────────────────────
export const fetchEmailThread = async (token, threadId) => {
    try {
        const response = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (!response.ok) return { success: false, messages: [] };
        const data = await response.json();
        const messages = (data.messages || []).map(msg => {
            const headers = msg.payload?.headers || [];
            const get = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
            return {
                id: msg.id, threadId: msg.threadId,
                from: get('From'), to: get('To'),
                subject: get('Subject'), date: get('Date'),
                snippet: msg.snippet || '', labelIds: msg.labelIds || []
            };
        });
        return { success: true, messages };
    } catch (err) {
        return { success: false, messages: [], error: err.message };
    }
};

// ─── CREATE CALENDAR EVENT ────────────────────────────────────────────────────
export const createDirectCalendarEvent = async (userId, token, eventData) => {
    try {
        const { summary, description, startDateTime, endDateTime, guestEmail, guestEmails, timeZone } = eventData;
        const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

        const event = {
            summary,
            description,
            start: { dateTime: startDateTime, timeZone: tz },
            end:   { dateTime: endDateTime,   timeZone: tz },
            conferenceData: {
                createRequest: {
                    requestId: `tf-${Date.now()}`,
                    conferenceSolutionKey: { type: 'hangoutsMeet' }
                }
            },
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'email', minutes: 60 },
                    { method: 'popup', minutes: 10 }
                ]
            }
        };

        const allGuests = [];
        if (guestEmail) allGuests.push(guestEmail);
        if (Array.isArray(guestEmails)) guestEmails.forEach(e => { if (e && !allGuests.includes(e)) allGuests.push(e); });
        if (allGuests.length > 0) {
            event.attendees = allGuests.map(email => ({ email }));
            event.guestsCanModify = false;
        }

        const response = await fetch(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none',
            {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(event)
            }
        );

        const data = await response.json();
        if (!response.ok) {
            if (response.status === 401) throw new Error('TOKEN_EXPIRED: Oturum süresi dolmuş.');
            if (response.status === 403) throw new Error('AUTH_SCOPE: Takvim erişim yetkisi yetersiz (403).');
            throw new Error(data.error?.message || `Takvim etkinliği oluşturulamadı (${response.status})`);
        }

        const meetLink = data.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri
            || data.conferenceData?.entryPoints?.[0]?.uri
            || null;

        return { success: true, htmlLink: data.htmlLink, meetLink, eventId: data.id };
    } catch (error) {
        console.error('[Google] Calendar event error:', error);
        return { success: false, error: error.message };
    }
};

// ─── GET CALENDAR EVENTS ──────────────────────────────────────────────────────
export const getCalendarEvents = async (token, timeMin, timeMax) => {
    try {
        const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok) {
            if (response.status === 401) throw new Error('TOKEN_EXPIRED: Oturum süresi dolmuş.');
            throw new Error(data.error?.message || 'Takvim verileri alınamadı.');
        }
        return { success: true, events: data.items || [] };
    } catch (error) {
        console.error('[Google] Get calendar events error:', error);
        return { success: false, error: error.message };
    }
};

// ─── CHECK GMAIL ──────────────────────────────────────────────────────────────
export const checkGmailMessages = async (token, query) => {
    try {
        const searchResponse = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=1`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        if (!searchResponse.ok) {
            if (searchResponse.status === 401) throw new Error('TOKEN_EXPIRED: Oturum süresi dolmuş.');
            if (searchResponse.status === 403) throw new Error('AUTH_SCOPE: Mail okuma yetkisi yetersiz (403).');
            const errData = await searchResponse.json();
            throw new Error(errData.error?.message || `Mail aranırken hata (${searchResponse.status})`);
        }

        const searchData = await searchResponse.json();
        if (!searchData.messages?.length) return { success: true, found: false };

        const msgId = searchData.messages[0].id;
        const msgResponse = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        if (!msgResponse.ok) {
            if (msgResponse.status === 401) throw new Error('TOKEN_EXPIRED: Oturum süresi dolmuş.');
            const errData = await msgResponse.json();
            throw new Error(errData.error?.message || 'Mail içeriği alınamadı');
        }

        const msgData = await msgResponse.json();
        const decodeBase64 = (str) => {
            const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
            try { return decodeURIComponent(escape(atob(base64))); }
            catch (e) { return atob(base64); }
        };

        let body = '';
        if (msgData.payload.parts) {
            const part = msgData.payload.parts.find(p => p.mimeType === 'text/plain') || msgData.payload.parts[0];
            if (part?.body?.data) body = decodeBase64(part.body.data);
        } else if (msgData.payload.body?.data) {
            body = decodeBase64(msgData.payload.body.data);
        }

        return {
            success: true, found: true,
            message: {
                id: msgId, snippet: msgData.snippet, body,
                from: msgData.payload.headers.find(h => h.name === 'From')?.value,
                date: msgData.payload.headers.find(h => h.name === 'Date')?.value
            }
        };
    } catch (error) {
        console.error('[Google] Check Gmail error:', error);
        return { success: false, error: error.message };
    }
};
