// OAuth 2.0 connect/refresh flows for Google and Microsoft 365.
//
// Each provider exposes the same three-step pattern:
//   GET  /api/auth/<provider>/url       — build the consent URL the SPA opens
//                                         in a popup. State blob yalnızca
//                                         popup yönlendirmesi içindir; sunucu
//                                         kimlik için ASLA kullanmaz.
//   POST /api/auth/<provider>/exchange  — swap the auth code for tokens, fetch
//                                         the user's email, and persist the
//                                         tokens ŞİFRELİ olarak
//                                         tenants/{t}/integrationSecrets/{uid}'e;
//                                         üyelik belgesinde yalnızca
//                                         connected/email kalır
//                                         (services/integrationTokens.js).
//                                         uid ve şirket requireTenant'tan
//                                         gelir (req.user, req.tenant); anonim
//                                         oturumlar reddedilir.
//
// Yenileme artık burada değil: istemci refresh token'ı hiç görmüyor; sunucu
// jetonu kullanacağı anda services/integrationTokens.js#getAccessToken ile
// kendisi yeniliyor.
//
// integrationConfigs (clientId/clientSecret/tenantId/redirectUri) is loaded
// from Firestore at startup and updated via /api/admin/integrations.
import { Router } from 'express';

import { requireTenant, SELF_WRITER_ROLES } from '../middleware/auth.js';
import { integrationConfigs } from '../config/integrations.js';
import { tokenStore } from '../services/integrationTokenStore.js';
import { GOOGLE_SCOPES, MS_SCOPES, expiresAtFrom } from '../services/oauthProviders.js';
import { childLogger } from '../services/logger.js';
const log = childLogger('auth');

const router = Router();

// ─── Microsoft 365 ────────────────────────────────────────────────────────────

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
        log.error({ err: err.message }, '[microsoft/url]');
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/auth/microsoft/exchange', requireTenant(SELF_WRITER_ROLES), async (req, res) => {
    try {
        const cfg = integrationConfigs.microsoft365;
        if (!cfg?.clientId || !cfg?.tenantId || !cfg?.clientSecret) {
            return res.status(400).json({ error: 'Microsoft 365 yapılandırması eksik.' });
        }
        const { code, redirectUri } = req.body;
        if (!code) return res.status(400).json({ error: 'OAuth kodu eksik.' });

        // Tokenlar YALNIZCA çağıranın kendi profiline yazılır — userId asla
        // istemci verisinden (state blob / body) alınmaz (IDOR düzeltmesi).
        const userId = req.user.uid;

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

        await tokenStore.connect(req.tenant.id, userId, 'microsoft', {
            email,
            accessToken: access_token,
            refreshToken: refresh_token,
            tokenExpiresAt: expiresAtFrom(expires_in),
            authMode: 'server',
        });

        log.info(`[microsoft/exchange] User ${userId} connected Microsoft: ${email}`);
        res.json({ success: true, email });
    } catch (err) {
        log.error({ err: err.message }, '[microsoft/exchange]');
        res.status(500).json({ error: err.message });
    }
});

// ─── Google ───────────────────────────────────────────────────────────────────

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
        log.error({ err: err.message }, '[google/url]');
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/auth/google/exchange', requireTenant(SELF_WRITER_ROLES), async (req, res) => {
    try {
        const cfg = integrationConfigs.google;
        if (!cfg?.clientId || !cfg?.clientSecret) {
            return res.status(400).json({ error: 'Google yapılandırması eksik.' });
        }
        const { code, redirectUri } = req.body;
        if (!code) return res.status(400).json({ error: 'OAuth kodu eksik.' });

        // IDOR düzeltmesi: userId doğrulanmış tokendan gelir, state yok sayılır.
        const userId = req.user.uid;

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

        await tokenStore.connect(req.tenant.id, userId, 'google', {
            email,
            accessToken: access_token,
            refreshToken: refresh_token,
            tokenExpiresAt: expiresAtFrom(expires_in),
            authMode: 'server',
        });

        log.info(`[google/exchange] User ${userId} connected: ${email}`);
        res.json({ success: true, email });
    } catch (err) {
        log.error({ err: err.message }, '[google/exchange]');
        res.status(500).json({ error: err.message });
    }
});

// ─── Firebase popup ile Google bağlantısı ──────────────────────────────────────
// Admin OAuth istemcisi yapılandırılmamışsa SPA Google'a Firebase
// signInWithPopup ile bağlanıyor ve elinde kısa ömürlü bir erişim jetonu
// oluyor (refresh token YOK). Eskiden SPA bunu profile düz yazıyordu; artık
// buraya gönderiyor, sunucu şifreli depoya yazıyor. Süresi dolunca
// getAccessToken REAUTH_REQUIRED döner ve SPA popup'ı yeniden açar.
const FIREBASE_TOKEN_TTL_MS = 55 * 60 * 1000;

router.post('/api/auth/google/firebase-token', requireTenant(SELF_WRITER_ROLES), async (req, res) => {
    const { accessToken, email } = req.body || {};
    if (typeof accessToken !== 'string' || accessToken.length < 10 || accessToken.length > 4096) {
        return res.status(400).json({ error: 'Geçersiz erişim jetonu.' });
    }
    try {
        await tokenStore.connect(req.tenant.id, req.user.uid, 'google', {
            email: typeof email === 'string' ? email : '',
            accessToken,
            tokenExpiresAt: Date.now() + FIREBASE_TOKEN_TTL_MS,
            authMode: 'firebase',
        });
        res.json({ success: true });
    } catch (err) {
        log.error({ err: err.message }, '[google/firebase-token]');
        res.status(500).json({ error: 'Bağlantı kaydedilemedi.' });
    }
});

// ─── Bağlantıyı kes ───────────────────────────────────────────────────────────
// Profildeki `integrations` alanı firestore.rules'ta istemci yazımına kapalı
// (jeton alanları bir daha oraya yazılamasın diye) — kesme de sunucudan.
router.post('/api/auth/:provider/disconnect', requireTenant(SELF_WRITER_ROLES), async (req, res) => {
    const { provider } = req.params;
    if (provider !== 'google' && provider !== 'microsoft') return res.status(400).json({ error: 'Bilinmeyen sağlayıcı.' });
    try {
        await tokenStore.disconnect(req.tenant.id, req.user.uid, provider);
        res.json({ success: true });
    } catch (err) {
        log.error({ err: err.message }, `[${provider}/disconnect]`);
        res.status(500).json({ error: 'Bağlantı kesilemedi.' });
    }
});

// Davetiye sorgusu (`/api/auth/invitation-lookup`) KALDIRILDI (K3): Talent'a
// giriş yalnız Hub'dan; üyelik Hub'dan gelir, Talent'ın kendi daveti yok.

export default router;
