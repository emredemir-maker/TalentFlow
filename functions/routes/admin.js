// Super-admin-only management endpoints. Each is gated by
// requireAuth(['super_admin']) so a regular recruiter or department user
// returns 403 even with a valid Firebase ID token.
//
//   DELETE /api/admin/auth-user/:uid     — purge a Firebase Auth account.
//                                          Self-deletion blocked. 'user-not-
//                                          found' is treated as already-done
//                                          (idempotent).
//   GET  /api/admin/integrations         — read OAuth client config (Microsoft
//                                          365 today; Google added later).
//                                          clientSecret is masked to a boolean
//                                          (clientSecretSet) so the UI never
//                                          sees the actual secret.
//   POST /api/admin/integrations         — write OAuth client config and
//                                          mutate the live integrationConfigs
//                                          cache so subsequent /api/auth/<x>/url
//                                          calls see the new values without
//                                          a server restart.
import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import { admin, db } from '../config/firebaseAdmin.js';
import { integrationConfigs } from '../config/integrations.js';
import { childLogger } from '../services/logger.js';
const log = childLogger('admin');

const router = Router();

const INTEGRATIONS_DOC = 'artifacts/talent-flow/public/data/settings/integrations';
const API_KEYS_DOC = 'artifacts/talent-flow/public/data/settings/api_keys';

router.delete('/api/admin/auth-user/:uid', requireAuth(['super_admin']), async (req, res) => {
    try {
        const { uid } = req.params;
        if (!uid) return res.status(400).json({ error: 'uid gerekli' });
        if (uid === req.user?.uid) return res.status(403).json({ error: 'Kendi hesabınızı silemezsiniz.' });
        await admin.auth().deleteUser(uid);
        log.info(`[admin] Firebase Auth kullanıcısı silindi: ${uid}`);
        res.json({ success: true });
    } catch (err) {
        if (err.code === 'auth/user-not-found') return res.json({ success: true, note: 'Zaten silinmiş' });
        log.error('[admin/delete-auth-user]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Admin SDK ile okunur/yazılır: firestore.rules bu dokümanı client'a tamamen
// kapatır (isSecretSetting) — kullanıcı tokenıyla REST erişimi artık mümkün
// değil ve requireAuth zaten req.firebaseToken set etmiyordu (eski kod bu
// yüzden her zaman 500 dönüyordu).
router.get('/api/admin/integrations', requireAuth(['super_admin']), async (req, res) => {
    try {
        const snap = await db.doc(INTEGRATIONS_DOC).get();
        if (!snap.exists) return res.json({ microsoft365: null });
        const stored = snap.data() || {};
        const data = {};
        if (stored.microsoft365) {
            const ms = stored.microsoft365;
            data.microsoft365 = {
                clientId: ms.clientId || '',
                tenantId: ms.tenantId || '',
                clientSecretSet: !!ms.clientSecret,
                redirectUri: ms.redirectUri || '',
                enabled: ms.enabled !== false,
                configuredAt: ms.configuredAt || null,
                configuredBy: ms.configuredBy || null,
            };
        }
        res.json(data);
    } catch (err) {
        log.error({ err }, '[admin/integrations GET]');
        res.status(500).json({ error: 'Entegrasyon ayarları okunamadı.' });
    }
});

router.post('/api/admin/integrations', requireAuth(['super_admin']), async (req, res) => {
    try {
        const { provider, config } = req.body;
        if (!provider || !config) return res.status(400).json({ error: 'provider and config required' });
        if (provider !== 'google' && provider !== 'microsoft365') {
            return res.status(400).json({ error: 'Geçersiz provider.' });
        }
        // Önce kalıcı yazım, sonra bellek içi cache — persist başarısızsa
        // cache eski (doğru) değerlerde kalır.
        await db.doc(INTEGRATIONS_DOC).set({ [provider]: config }, { merge: true });
        integrationConfigs[provider === 'google' ? 'google' : 'microsoft365'] = config;
        log.info(`[integrations] ${provider} config updated by ${req.user.uid}`);
        res.json({ success: true });
    } catch (err) {
        log.error({ err }, '[admin/integrations POST]');
        res.status(500).json({ error: 'Entegrasyon ayarları kaydedilemedi.' });
    }
});

// ── Gemini API anahtarı yönetimi ─────────────────────────────────────────────
// Anahtar client'a asla dönmez: GET yalnızca "ayarlı mı + son 4 hane" verir,
// POST yeni anahtarı yazar. firestore.rules api_keys dokümanını client'a
// kapattığı için tek erişim yolu budur.
router.get('/api/admin/api-keys', requireAuth(['super_admin']), async (req, res) => {
    try {
        const snap = await db.doc(API_KEYS_DOC).get();
        const key = snap.exists ? String(snap.data()?.gemini || '') : '';
        res.json({
            gemini: key
                ? { set: true, last4: key.slice(-4) }
                : { set: false, last4: null },
        });
    } catch (err) {
        log.error({ err }, '[admin/api-keys GET]');
        res.status(500).json({ error: 'Anahtar durumu okunamadı.' });
    }
});

router.post('/api/admin/api-keys', requireAuth(['super_admin']), async (req, res) => {
    try {
        const raw = req.body?.gemini;
        const key = typeof raw === 'string' ? raw.trim() : '';
        if (key.length < 20 || /\s/.test(key)) {
            return res.status(400).json({ error: 'Geçersiz anahtar formatı.' });
        }
        await db.doc(API_KEYS_DOC).set({
            gemini: key,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.uid,
        }, { merge: true });
        log.info(`[api-keys] Gemini anahtarı güncellendi (by ${req.user.uid})`);
        res.json({ success: true, last4: key.slice(-4) });
    } catch (err) {
        log.error({ err }, '[admin/api-keys POST]');
        res.status(500).json({ error: 'Anahtar kaydedilemedi.' });
    }
});

export default router;
