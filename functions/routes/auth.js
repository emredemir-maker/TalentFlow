// OAuth 2.0 connect/refresh flows for Google and Microsoft 365.
//
// Each provider exposes the same three-step pattern:
//   GET  /api/auth/<provider>/url       — build the consent URL the SPA opens
//                                         in a popup. Embeds an HMAC-less
//                                         state blob (just userId+ts; the
//                                         exchange endpoint re-validates).
//   POST /api/auth/<provider>/exchange  — swap the auth code for tokens, fetch
//                                         the user's email, and persist the
//                                         tokens onto users/{uid}.integrations.
//                                         Falls back to the Firestore REST API
//                                         (fsPatch) when Admin SDK writes are
//                                         blocked by GCP auth issues in dev.
//   POST /api/auth/<provider>/refresh   — exchange refreshToken for a fresh
//                                         accessToken; persist the new
//                                         expiresAt in-place.
//
// integrationConfigs (clientId/clientSecret/tenantId/redirectUri) is loaded
// from Firestore at startup and updated via /api/admin/integrations.
import { Router } from 'express';

import { verifyFirebaseToken } from '../middleware/auth.js';
import { db } from '../config/firebaseAdmin.js';
import { integrationConfigs } from '../config/integrations.js';
import { fsPatch } from '../services/firestoreRest.js';
import { childLogger } from '../services/logger.js';
const log = childLogger('auth');

const router = Router();

// ─── Microsoft 365 ────────────────────────────────────────────────────────────
const MS_SCOPES = 'openid profile email offline_access User.Read Mail.Send Calendars.ReadWrite OnlineMeetings.ReadWrite';

router.get('/api/auth/microsoft/url', async (req, res) => {
    try {
        const cfg = integrationConfigs.microsoft365;
        if (!cfg?.clientId || !cfg?.tenantId) {
            return res.status(400).json({ error: 'Microsoft 365 entegrasyonu henüz yapılandırılmamış. Lütfen Entegrasyon Merkezi\'nden yapılandırın.' });
        }
        const { userId } = req.query;
        const state = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString('base64url');
        const redirectUri = cfg.redirectUri || `${req.protocol}://${req.get('host')}/auth/microsoft/callback`;
        const params = new URLSearchParams({
            client_id: cfg.clientId,
            response_type: 'code',
            redirect_uri: redirectUri,
            scope: MS_SCOPES,
            state,
            response_mode: 'query',
            prompt: 'select_account',
        });
        const url = `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/authorize?${params}`;
        res.json({ url });
    } catch (err) {
        log.error('[microsoft/url]', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/auth/microsoft/exchange', verifyFirebaseToken, async (req, res) => {
    try {
        const cfg = integrationConfigs.microsoft365;
        if (!cfg?.clientId || !cfg?.tenantId || !cfg?.clientSecret) {
            return res.status(400).json({ error: 'Microsoft 365 yapılandırması eksik.' });
        }
        const { code, state, redirectUri } = req.body;
        if (!code) return res.status(400).json({ error: 'OAuth kodu eksik.' });

        let userId;
        try {
            const decoded = JSON.parse(Buffer.from(state || '', 'base64url').toString());
            userId = decoded.userId;
        } catch {
            return res.status(400).json({ error: 'Geçersiz state parametresi.' });
        }
        if (!userId) return res.status(400).json({ error: 'userId eksik.' });

        const redirect = redirectUri || cfg.redirectUri || `${req.protocol}://${req.get('host')}/auth/microsoft/callback`;

        const tokenRes = await fetch(
            `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: cfg.clientId,
                    client_secret: cfg.clientSecret,
                    code,
                    redirect_uri: redirect,
                    grant_type: 'authorization_code',
                    scope: MS_SCOPES,
                }),
            }
        );

        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || tokenData.error) {
            return res.status(400).json({ error: tokenData.error_description || 'Token değişimi başarısız.' });
        }

        const { access_token, refresh_token, expires_in } = tokenData;

        let email = '';
        try {
            const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
                headers: { 'Authorization': `Bearer ${access_token}` }
            });
            const profile = await profileRes.json();
            email = profile.mail || profile.userPrincipalName || '';
        } catch { /* non-fatal */ }

        const tokenExpiresAt = Date.now() + (expires_in - 60) * 1000;
        const integrationData = {
            connected: true,
            email,
            accessToken: access_token,
            refreshToken: refresh_token,
            tokenExpiresAt,
            connectedAt: new Date().toISOString(),
        };

        try {
            await db.doc(`artifacts/talent-flow/public/data/users/${userId}`).update({
                'integrations.microsoft': integrationData
            });
        } catch {
            await fsPatch(
                `artifacts/talent-flow/public/data/users/${userId}`,
                { 'integrations.microsoft': integrationData },
                req.firebaseToken
            );
        }

        log.info(`[microsoft/exchange] User ${userId} connected Microsoft: ${email}`);
        res.json({ success: true, email });
    } catch (err) {
        log.error('[microsoft/exchange]', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/auth/microsoft/refresh', verifyFirebaseToken, async (req, res) => {
    try {
        const cfg = integrationConfigs.microsoft365;
        if (!cfg?.clientId || !cfg?.tenantId || !cfg?.clientSecret) {
            return res.status(400).json({ error: 'Microsoft 365 yapılandırması eksik.' });
        }
        const { userId, refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ error: 'refreshToken gerekli.' });

        const tokenRes = await fetch(
            `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: cfg.clientId,
                    client_secret: cfg.clientSecret,
                    refresh_token: refreshToken,
                    grant_type: 'refresh_token',
                    scope: MS_SCOPES,
                }),
            }
        );

        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || tokenData.error) {
            return res.status(400).json({ error: tokenData.error_description || 'Token yenileme başarısız.' });
        }

        const { access_token, refresh_token: new_refresh, expires_in } = tokenData;
        const tokenExpiresAt = Date.now() + (expires_in - 60) * 1000;

        try {
            await db.doc(`artifacts/talent-flow/public/data/users/${userId}`).update({
                'integrations.microsoft.accessToken': access_token,
                'integrations.microsoft.refreshToken': new_refresh || refreshToken,
                'integrations.microsoft.tokenExpiresAt': tokenExpiresAt,
            });
        } catch { /* non-fatal */ }

        res.json({ success: true, accessToken: access_token });
    } catch (err) {
        log.error('[microsoft/refresh]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── Google ───────────────────────────────────────────────────────────────────
const GOOGLE_SCOPES = [
    'openid', 'profile', 'email',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar.events'
].join(' ');

router.get('/api/auth/google/url', async (req, res) => {
    try {
        const cfg = integrationConfigs.google;
        if (!cfg?.clientId || !cfg?.clientSecret) {
            return res.status(400).json({ error: 'Google entegrasyonu henüz yapılandırılmamış. Lütfen Entegrasyon Merkezi\'nden yapılandırın.' });
        }
        const { userId, force } = req.query;
        const state = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString('base64url');
        const redirectUri = cfg.redirectUri || `${req.protocol}://${req.get('host')}/auth/google/callback`;
        const params = new URLSearchParams({
            client_id: cfg.clientId,
            response_type: 'code',
            redirect_uri: redirectUri,
            scope: GOOGLE_SCOPES,
            state,
            access_type: 'offline',
            include_granted_scopes: 'true',
            ...(force === '1' ? { prompt: 'consent' } : {})
        });
        res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    } catch (err) {
        log.error('[google/url]', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/auth/google/exchange', verifyFirebaseToken, async (req, res) => {
    try {
        const cfg = integrationConfigs.google;
        if (!cfg?.clientId || !cfg?.clientSecret) {
            return res.status(400).json({ error: 'Google yapılandırması eksik.' });
        }
        const { code, state, redirectUri } = req.body;
        if (!code) return res.status(400).json({ error: 'OAuth kodu eksik.' });

        let userId;
        try {
            const decoded = JSON.parse(Buffer.from(state || '', 'base64url').toString());
            userId = decoded.userId;
        } catch {
            return res.status(400).json({ error: 'Geçersiz state.' });
        }
        if (!userId) return res.status(400).json({ error: 'userId eksik.' });

        const redirect = redirectUri || cfg.redirectUri || `${req.protocol}://${req.get('host')}/auth/google/callback`;

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: cfg.clientId,
                client_secret: cfg.clientSecret,
                code,
                redirect_uri: redirect,
                grant_type: 'authorization_code',
            }),
        });

        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || tokenData.error) {
            return res.status(400).json({ error: tokenData.error_description || 'Token değişimi başarısız.' });
        }

        const { access_token, refresh_token, expires_in } = tokenData;
        let email = '';
        try {
            const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { 'Authorization': `Bearer ${access_token}` }
            });
            const profile = await profileRes.json();
            email = profile.email || '';
        } catch { /* non-fatal */ }

        const tokenExpiresAt = Date.now() + ((expires_in || 3600) - 60) * 1000;
        const integrationData = {
            connected: true, email, accessToken: access_token,
            refreshToken: refresh_token, tokenExpiresAt,
            connectedAt: new Date().toISOString(),
        };

        try {
            await db.doc(`artifacts/talent-flow/public/data/users/${userId}`).update({
                'integrations.google': integrationData
            });
        } catch {
            await fsPatch(`artifacts/talent-flow/public/data/users/${userId}`,
                { 'integrations.google': integrationData }, req.firebaseToken);
        }

        log.info(`[google/exchange] User ${userId} connected: ${email}`);
        res.json({ success: true, email });
    } catch (err) {
        log.error('[google/exchange]', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/auth/google/refresh', verifyFirebaseToken, async (req, res) => {
    try {
        const cfg = integrationConfigs.google;
        if (!cfg?.clientId || !cfg?.clientSecret) {
            return res.status(400).json({ error: 'Google yapılandırması eksik.' });
        }
        const { userId, refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ error: 'refreshToken gerekli.' });

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: cfg.clientId,
                client_secret: cfg.clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
        });

        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || tokenData.error) {
            return res.status(400).json({ error: tokenData.error_description || 'Token yenileme başarısız.' });
        }

        const { access_token, expires_in } = tokenData;
        const tokenExpiresAt = Date.now() + ((expires_in || 3600) - 60) * 1000;

        try {
            await db.doc(`artifacts/talent-flow/public/data/users/${userId}`).update({
                'integrations.google.accessToken': access_token,
                'integrations.google.tokenExpiresAt': tokenExpiresAt,
            });
        } catch { /* non-fatal */ }

        res.json({ success: true, accessToken: access_token });
    } catch (err) {
        log.error('[google/refresh]', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
