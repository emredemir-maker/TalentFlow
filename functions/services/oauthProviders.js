// Google ve Microsoft 365 OAuth sabitleri + refresh token ile yenileme.
//
// Kapsamlar routes/auth.js'teki onay akışıyla AYNI olmak zorunda — yenileme
// isteği, onay verilmemiş bir kapsam isterse Microsoft reddediyor.
import { integrationConfigs } from '../config/integrations.js';

export const MS_SCOPES = 'openid profile email offline_access User.Read Mail.Send Calendars.ReadWrite OnlineMeetings.ReadWrite';

export const GOOGLE_SCOPES = [
    'openid', 'profile', 'email',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar.events'
].join(' ');

// Sağlayıcının verdiği süreden bir dakika erken "dolmuş" sayılır: istek
// yoldayken süresi biten jeton 401 ile döner.
export const expiresAtFrom = (expiresIn, now = Date.now()) => now + ((expiresIn || 3600) - 60) * 1000;

async function postToken(url, params) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error_description || data.error || `Token yenileme başarısız (${res.status})`);
    return data;
}

/** @returns {Promise<{accessToken: string, refreshToken?: string, tokenExpiresAt: number}>} */
export async function refreshProviderToken(provider, refreshToken) {
    if (provider === 'google') {
        const cfg = integrationConfigs.google;
        if (!cfg?.clientId || !cfg?.clientSecret) throw new Error('Google yapılandırması eksik.');
        const data = await postToken('https://oauth2.googleapis.com/token', {
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        });
        return { accessToken: data.access_token, refreshToken: data.refresh_token, tokenExpiresAt: expiresAtFrom(data.expires_in) };
    }
    if (provider === 'microsoft') {
        const cfg = integrationConfigs.microsoft365;
        if (!cfg?.clientId || !cfg?.tenantId || !cfg?.clientSecret) throw new Error('Microsoft 365 yapılandırması eksik.');
        const data = await postToken(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`, {
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
            scope: MS_SCOPES,
        });
        return { accessToken: data.access_token, refreshToken: data.refresh_token, tokenExpiresAt: expiresAtFrom(data.expires_in) };
    }
    throw new Error(`Bilinmeyen sağlayıcı: ${provider}`);
}
