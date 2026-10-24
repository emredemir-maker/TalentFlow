// src/services/microsoftIntegrationService.js
// Microsoft 365 (Outlook + Calendar + Teams) OAuth integration
//
// Jetonlar sunucuda şifreli duruyor (functions/services/integrationTokens.js);
// istemci yalnızca bağlanıyor ve bağlantıyı kesiyor.

import { getAuth } from 'firebase/auth';

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
export const disconnectMicrosoftWorkspace = async () => {
    try {
        const idToken = await getAuth().currentUser?.getIdToken();
        const res = await fetch('/api/auth/microsoft/disconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: '{}'
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Bağlantı kesilemedi.');
        }
        return { success: true };
    } catch (error) {
        console.error('[Microsoft] Disconnect error:', error);
        return { success: false, error: error.message };
    }
};
