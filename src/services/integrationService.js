// src/services/integrationService.js
// Google Workspace (Gmail + Calendar) integration.
//
// HYBRID MODE:
//   - Admin Entegrasyon Merkezi'nden özel credentials girdiyse → server-side OAuth popup
//     (yeni Firebase projesine deploy için, refresh_token ile kalıcı bağlantı)
//   - Admin credentials girmemişse → Firebase signInWithPopup fallback
//     (mevcut test ortamı, hemen çalışır, yapılandırma gerekmez)
//
// JETONLAR İSTEMCİDE DEĞİL: OAuth jetonları sunucuda şifreli duruyor
// (functions/services/integrationTokens.js). Gmail/Calendar çağrılarının hepsi
// /api/google/* üzerinden gidiyor; sunucu jetonu kimliği doğrulanmış
// kullanıcı için kendisi çözüyor ve gerekirse yeniliyor. Profilde yalnızca
// `integrations.google.{connected,email,authMode}` görünür.

import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

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

const authedJson = async (url, { method = 'GET', body } = {}) => {
    const idToken = await getIdToken();
    if (!idToken) throw new Error('Oturum bulunamadı.');
    const res = await fetch(url, {
        method,
        headers: {
            'Authorization': `Bearer ${idToken}`,
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
};

// Sunucunun hata kodunu eski mesaj öneklerine çeviriyor — sayfalar hâlâ
// 'TOKEN_EXPIRED' / 'AUTH_SCOPE' öneklerine bakıyor.
const errorMessage = ({ status, data }) => {
    const msg = data?.error || `İstek başarısız (${status})`;
    if (data?.code === 'REAUTH_REQUIRED' || data?.code === 'NOT_CONNECTED' || data?.code === 'TOKEN_EXPIRED') {
        return `TOKEN_EXPIRED: ${msg} Ayarlar → Entegrasyonlar bölümünden Google hesabınızı yeniden bağlayın.`;
    }
    if (data?.code === 'AUTH_SCOPE') return `AUTH_SCOPE: ${msg}`;
    return msg;
};

/** Profilde Google bağlantısı işaretli mi (jetonun geçerliliğini sunucu denetler). */
export const isGoogleConnected = (userProfile) => Boolean(userProfile?.integrations?.google?.connected);

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
// Popup'tan gelen kısa ömürlü erişim jetonu sunucuya gidiyor; sunucu onu
// şifreleyip saklıyor. İstemci jetonu Firestore'a yazmıyor.
const _connectViaFirebase = async (forceConsent) => {
    const provider = buildGoogleProvider(forceConsent);
    const result = await signInWithPopup(getAuth(), provider);

    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;
    if (!token) throw new Error('Erişim belirteci (Access Token) alınamadı.');

    const saved = await authedJson('/api/auth/google/firebase-token', {
        method: 'POST',
        body: { accessToken: token, email: result.user.email }
    });
    if (!saved.ok) throw new Error(saved.data?.error || 'Google bağlantısı kaydedilemedi.');

    return { success: true, email: result.user.email };
};

/**
 * /api/google/* çağrısı. Firebase popup ile bağlanmış hesabın jetonu dolduysa
 * (refresh token yok) popup'ı bir kez yeniden açıp isteği tekrarlıyor —
 * eski istemci tarafı yenilemenin davranışı.
 */
const googleApi = async (url, opts) => {
    let result = await authedJson(url, opts);
    if (!result.ok && result.data?.code === 'REAUTH_REQUIRED' && result.data?.authMode === 'firebase') {
        const reauth = await _connectViaFirebase(false).catch(() => null);
        if (reauth?.success) result = await authedJson(url, opts);
    }
    if (!result.ok) throw new Error(errorMessage(result));
    return result.data;
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
            return await _connectViaFirebase(forceConsent);
        }
    } catch (error) {
        console.error('[Google] Connect error:', error);
        let errorMessage = error.message;
        if (error.code === 'auth/popup-closed-by-user') errorMessage = 'Bağlantı penceresi kapatıldı.';
        if (error.code === 'auth/popup-blocked') errorMessage = 'Tarayıcı popup\'ı engelledi. Lütfen popup engelleyiciyi devre dışı bırakın.';
        return { success: false, error: errorMessage };
    }
};

// ─── DISCONNECT ───────────────────────────────────────────────────────────────
export const disconnectGoogleWorkspace = async () => {
    try {
        const res = await authedJson('/api/auth/google/disconnect', { method: 'POST', body: {} });
        if (!res.ok) throw new Error(res.data?.error || 'Bağlantı kesilemedi.');
        return { success: true };
    } catch (error) {
        console.error('[Google] Disconnect error:', error);
        return { success: false, error: error.message };
    }
};

// ─── SEND EMAIL ───────────────────────────────────────────────────────────────
// emailData: { to, subject, body, html?, replyTo?, ics? } — MIME sunucuda kuruluyor.
export const sendDirectEmail = async (emailData) => {
    try {
        const data = await googleApi('/api/google/send-email', { method: 'POST', body: emailData });
        return { success: true, messageId: data.messageId, threadId: data.threadId };
    } catch (error) {
        console.error('[Google] Send email error:', error);
        return { success: false, error: error.message };
    }
};

// ─── FETCH EMAIL THREAD ───────────────────────────────────────────────────────
export const fetchEmailThread = async (threadId) => {
    try {
        const data = await googleApi(`/api/google/thread/${encodeURIComponent(threadId)}`);
        return { success: true, messages: data.messages || [] };
    } catch (err) {
        return { success: false, messages: [], error: err.message };
    }
};

// ─── CREATE CALENDAR EVENT ────────────────────────────────────────────────────
export const createDirectCalendarEvent = async (eventData) => {
    try {
        const timeZone = eventData.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        const data = await googleApi('/api/google/calendar-events', { method: 'POST', body: { ...eventData, timeZone } });
        return { success: true, htmlLink: data.htmlLink, meetLink: data.meetLink, eventId: data.eventId };
    } catch (error) {
        console.error('[Google] Calendar event error:', error);
        return { success: false, error: error.message };
    }
};

// ─── GET CALENDAR EVENTS ──────────────────────────────────────────────────────
export const getCalendarEvents = async (timeMin, timeMax) => {
    try {
        const qs = `timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
        const data = await googleApi(`/api/google/calendar-events?${qs}`);
        return { success: true, events: data.events || [] };
    } catch (error) {
        console.error('[Google] Get calendar events error:', error);
        return { success: false, error: error.message };
    }
};

// ─── CHECK GMAIL ──────────────────────────────────────────────────────────────
export const checkGmailMessages = async (query) => {
    try {
        const data = await googleApi(`/api/google/check-messages?q=${encodeURIComponent(query)}`);
        return data.found ? { success: true, found: true, message: data.message } : { success: true, found: false };
    } catch (error) {
        console.error('[Google] Check Gmail error:', error);
        return { success: false, error: error.message };
    }
};
