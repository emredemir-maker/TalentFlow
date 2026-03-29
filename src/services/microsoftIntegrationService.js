// src/services/microsoftIntegrationService.js
// Microsoft 365 (Outlook + Calendar + Teams) OAuth integration

import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

const USERS_PATH = 'artifacts/talent-flow/public/data/users';
const TOKEN_TTL_MS = 55 * 60 * 1000; // 55 min (tokens live ~60 min)

// ─── CONNECT (open popup) ──────────────────────────────────────────────────────
export const connectMicrosoftWorkspace = async (userId) => {
    try {
        // 1. Get the Microsoft OAuth URL from the server
        const urlRes = await fetch(`/api/auth/microsoft/url?userId=${encodeURIComponent(userId)}`, {
            headers: { 'Content-Type': 'application/json' }
        });
        if (!urlRes.ok) {
            const errData = await urlRes.json().catch(() => ({}));
            throw new Error(errData.error || 'Microsoft entegrasyonu yapılandırılmamış. Lütfen önce admin panelinden yapılandırın.');
        }
        const { url } = await urlRes.json();

        // 2. Open Microsoft login in a popup
        return new Promise((resolve, reject) => {
            const w = 500, h = 650;
            const left = window.screenLeft + (window.outerWidth - w) / 2;
            const top = window.screenTop + (window.outerHeight - h) / 2;
            const popup = window.open(url, 'microsoft-oauth', `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`);

            if (!popup) {
                reject(new Error('Popup engellendi. Lütfen tarayıcı popup engelleyicisini devre dışı bırakın.'));
                return;
            }

            // 3. Listen for postMessage from callback page
            const handleMessage = (event) => {
                if (event.origin !== window.location.origin) return;
                if (event.data?.type !== 'MICROSOFT_OAUTH_CALLBACK') return;
                window.removeEventListener('message', handleMessage);
                clearInterval(checkClosed);

                if (event.data.error) {
                    reject(new Error(event.data.error));
                } else {
                    resolve({ success: true, email: event.data.email });
                }
            };
            window.addEventListener('message', handleMessage);

            // 4. Detect if popup was closed manually
            const checkClosed = setInterval(() => {
                if (popup.closed) {
                    clearInterval(checkClosed);
                    window.removeEventListener('message', handleMessage);
                    reject(new Error('Bağlantı penceresi kapatıldı.'));
                }
            }, 500);
        });
    } catch (error) {
        console.error('[Microsoft] Connect error:', error);
        return { success: false, error: error.message };
    }
};

// ─── DISCONNECT ───────────────────────────────────────────────────────────────
export const disconnectMicrosoftWorkspace = async (userId) => {
    try {
        await updateDoc(doc(db, USERS_PATH, userId), {
            'integrations.microsoft': {
                connected: false,
                disconnectedAt: new Date().toISOString()
            }
        });
        return { success: true };
    } catch (error) {
        console.error('[Microsoft] Disconnect error:', error);
        return { success: false, error: error.message };
    }
};

// ─── ENSURE VALID TOKEN ────────────────────────────────────────────────────────
export const ensureValidMicrosoftToken = async (userId, userProfile, idToken) => {
    const integration = userProfile?.integrations?.microsoft;
    if (!integration?.connected || !integration?.accessToken) return null;

    const now = Date.now();
    if (integration.tokenExpiresAt && now < integration.tokenExpiresAt) {
        return integration.accessToken;
    }

    // Attempt silent refresh via server
    try {
        const res = await fetch('/api/auth/microsoft/refresh', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ userId, refreshToken: integration.refreshToken })
        });

        if (!res.ok) return null;
        const data = await res.json();
        return data.accessToken || null;
    } catch {
        return null;
    }
};

// ─── SEND OUTLOOK EMAIL ───────────────────────────────────────────────────────
export const sendOutlookEmail = async (accessToken, emailData) => {
    try {
        const { to, subject, bodyHtml, bodyText } = emailData;
        const message = {
            subject,
            body: { contentType: bodyHtml ? 'HTML' : 'Text', content: bodyHtml || bodyText || '' },
            toRecipients: [{ emailAddress: { address: to } }]
        };

        const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message, saveToSentItems: true })
        });

        if (res.status === 202) return { success: true };
        if (res.status === 401) throw new Error('TOKEN_EXPIRED: Microsoft oturum süresi dolmuş.');
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Outlook e-postası gönderilemedi (${res.status})`);
    } catch (error) {
        console.error('[Microsoft] Send email error:', error);
        return { success: false, error: error.message };
    }
};

// ─── CREATE TEAMS/OUTLOOK CALENDAR EVENT ─────────────────────────────────────
export const createOutlookCalendarEvent = async (accessToken, eventData) => {
    try {
        const { summary, description, startDateTime, endDateTime, guestEmails, timeZone } = eventData;
        const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

        const event = {
            subject: summary,
            body: { contentType: 'HTML', content: description || '' },
            start: { dateTime: startDateTime, timeZone: tz },
            end:   { dateTime: endDateTime,   timeZone: tz },
            isOnlineMeeting: true,
            onlineMeetingProvider: 'teamsForBusiness',
            attendees: (guestEmails || []).map(email => ({
                emailAddress: { address: email },
                type: 'required'
            }))
        };

        const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(event)
        });

        const data = await res.json();
        if (!res.ok) {
            if (res.status === 401) throw new Error('TOKEN_EXPIRED');
            throw new Error(data.error?.message || `Takvim etkinliği oluşturulamadı (${res.status})`);
        }

        const teamsLink = data.onlineMeeting?.joinUrl || null;
        return { success: true, eventId: data.id, htmlLink: data.webLink, teamsLink };
    } catch (error) {
        console.error('[Microsoft] Calendar event error:', error);
        return { success: false, error: error.message };
    }
};
