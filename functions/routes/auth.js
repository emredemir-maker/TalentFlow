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
//                                         integrationSecrets/{uid}'e; profilde
//                                         yalnızca connected/email kalır
//                                         (services/integrationTokens.js).
//                                         uid DOĞRULANMIŞ Firebase tokenından
//                                         gelir (req.authUser.uid); anonim
//                                         oturumlar reddedilir.
//
// Yenileme artık burada değil: istemci refresh token'ı hiç görmüyor; sunucu
// jetonu kullanacağı anda services/integrationTokens.js#getAccessToken ile
// kendisi yeniliyor.
//
// integrationConfigs (clientId/clientSecret/tenantId/redirectUri) is loaded
// from Firestore at startup and updated via /api/admin/integrations.
import { Router } from 'express';

import { verifyFirebaseToken, rejectAnonymous } from '../middleware/auth.js';
import { inviteLimiter } from '../middleware/rateLimit.js';
import { db } from '../config/firebaseAdmin.js';
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

router.post('/api/auth/microsoft/exchange', verifyFirebaseToken, rejectAnonymous, async (req, res) => {
    try {
        const cfg = integrationConfigs.microsoft365;
        if (!cfg?.clientId || !cfg?.tenantId || !cfg?.clientSecret) {
            return res.status(400).json({ error: 'Microsoft 365 yapılandırması eksik.' });
        }
        const { code, redirectUri } = req.body;
        if (!code) return res.status(400).json({ error: 'OAuth kodu eksik.' });

        // Tokenlar YALNIZCA çağıranın kendi profiline yazılır — userId asla
        // istemci verisinden (state blob / body) alınmaz (IDOR düzeltmesi).
        const userId = req.authUser.uid;

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

        await tokenStore.connect(userId, 'microsoft', {
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

router.post('/api/auth/google/exchange', verifyFirebaseToken, rejectAnonymous, async (req, res) => {
    try {
        const cfg = integrationConfigs.google;
        if (!cfg?.clientId || !cfg?.clientSecret) {
            return res.status(400).json({ error: 'Google yapılandırması eksik.' });
        }
        const { code, redirectUri } = req.body;
        if (!code) return res.status(400).json({ error: 'OAuth kodu eksik.' });

        // IDOR düzeltmesi: userId doğrulanmış tokendan gelir, state yok sayılır.
        const userId = req.authUser.uid;

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

        await tokenStore.connect(userId, 'google', {
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

router.post('/api/auth/google/firebase-token', verifyFirebaseToken, rejectAnonymous, async (req, res) => {
    const { accessToken, email } = req.body || {};
    if (typeof accessToken !== 'string' || accessToken.length < 10 || accessToken.length > 4096) {
        return res.status(400).json({ error: 'Geçersiz erişim jetonu.' });
    }
    try {
        await tokenStore.connect(req.authUser.uid, 'google', {
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
router.post('/api/auth/:provider/disconnect', verifyFirebaseToken, rejectAnonymous, async (req, res) => {
    const { provider } = req.params;
    if (provider !== 'google' && provider !== 'microsoft') return res.status(400).json({ error: 'Bilinmeyen sağlayıcı.' });
    try {
        await tokenStore.disconnect(req.authUser.uid, provider);
        res.json({ success: true });
    } catch (err) {
        log.error({ err: err.message }, `[${provider}/disconnect]`);
        res.status(500).json({ error: 'Bağlantı kesilemedi.' });
    }
});

// ─── Davetiye sorgusu ─────────────────────────────────────────────────────────
//
// ── NEDEN SUNUCUDA ──────────────────────────────────────────────────────────
// Kayıt akışı, hesap HENÜZ YOKKEN "bu e-postaya bekleyen bir davet var mı"
// sorusunu sormak zorunda: kullanıcı dokümanını yazan Firestore kuralı,
// istenen rolün karşılığında bir davet kimliği (`inviteId`) görmek istiyor.
//
// Bu yüzden davetiye koleksiyonunda `allow read: if true` duruyordu. Ama
// Firestore'da `read` hem `get` hem `list` demek: kural, kimliksiz bir
// istemcinin koleksiyonun TAMAMINI dökmesine — yani davet edilmiş bütün
// e-posta adreslerini ve rollerini tek istekte okumasına — izin veriyordu.
//
// Sorgu buraya taşındı. Admin SDK kuralların dışında çalıştığı için istemcinin
// koleksiyona hiç erişmesi gerekmiyor; kural artık super_admin'e kapalı.
// Geriye kalan tek bilgi sızıntısı "şu e-posta davetli mi" cevabı — bu, akışın
// çalışması için zorunlu ve `inviteLimiter` ile saatte 10 denemeye bağlı.

const INVITATIONS_PATH = 'artifacts/talent-flow/public/data/invitations';

/**
 * Davet dokümanını istemcinin ihtiyaç duyduğu asgari alanlara indirger.
 *
 * SADECE ÜÇ ALAN dönüyor: davet dokümanının kendisini olduğu gibi vermek,
 * kimliksiz bir uçtan davet edenin kimliği ve zaman damgaları gibi alanları da
 * sızdırırdı.
 *
 * Departman listesi eski tekil `department` alanını da tolere ediyor — aynı
 * geri düşme zinciri Firestore kuralında da var (`inviteDepartments`); ikisi
 * ayrışırsa kural, istemcinin yazdığı profili reddeder.
 */
export function invitationPayload(doc) {
    const d = (typeof doc?.data === 'function' ? doc.data() : null) || {};
    const departments = Array.isArray(d.departments)
        ? d.departments
        : (d.department ? [d.department] : []);
    return { inviteId: doc.id, role: d.role || 'recruiter', departments };
}

router.post('/api/auth/invitation-lookup', inviteLimiter, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Geçerli bir e-posta adresi gerekli.' });
    }
    try {
        const snap = await db.collection(INVITATIONS_PATH)
            .where('email', '==', email)
            .where('status', '==', 'pending')
            .limit(1)
            .get();
        if (snap.empty) return res.json({ found: false });
        return res.json({ found: true, ...invitationPayload(snap.docs[0]) });
    } catch (err) {
        log.error({ err: err.message }, '[invitation-lookup]');
        return res.status(500).json({ error: 'Davetiye kontrolü yapılamadı.' });
    }
});

export default router;
