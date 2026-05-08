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
import { admin } from '../config/firebaseAdmin.js';
import { integrationConfigs } from '../config/integrations.js';
import { fsGet, fsPatch } from '../services/firestoreRest.js';

const router = Router();

router.delete('/api/admin/auth-user/:uid', requireAuth(['super_admin']), async (req, res) => {
    try {
        const { uid } = req.params;
        if (!uid) return res.status(400).json({ error: 'uid gerekli' });
        if (uid === req.user?.uid) return res.status(403).json({ error: 'Kendi hesabınızı silemezsiniz.' });
        await admin.auth().deleteUser(uid);
        console.log(`[admin] Firebase Auth kullanıcısı silindi: ${uid}`);
        res.json({ success: true });
    } catch (err) {
        if (err.code === 'auth/user-not-found') return res.json({ success: true, note: 'Zaten silinmiş' });
        console.error('[admin/delete-auth-user]', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.get('/api/admin/integrations', requireAuth(['super_admin']), async (req, res) => {
    try {
        const snap = await fsGet('artifacts/talent-flow/public/data/settings/integrations', req.firebaseToken);
        if (!snap) return res.json({ microsoft365: null });
        const data = {};
        const fields = snap.fields || {};
        if (fields.microsoft365?.mapValue?.fields) {
            const ms = fields.microsoft365.mapValue.fields;
            data.microsoft365 = {
                clientId: ms.clientId?.stringValue || '',
                tenantId: ms.tenantId?.stringValue || '',
                clientSecretSet: !!(ms.clientSecret?.stringValue),
                redirectUri: ms.redirectUri?.stringValue || '',
                enabled: ms.enabled?.booleanValue !== false,
                configuredAt: ms.configuredAt?.stringValue || null,
                configuredBy: ms.configuredBy?.stringValue || null,
            };
        }
        res.json(data);
    } catch (err) {
        console.error('[admin/integrations GET]', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/admin/integrations', requireAuth(['super_admin']), async (req, res) => {
    try {
        const { provider, config } = req.body;
        if (!provider || !config) return res.status(400).json({ error: 'provider and config required' });
        if (provider === 'google') {
            integrationConfigs.google = config;
            console.log('[integrations] Google config updated in-memory');
        }
        if (provider === 'microsoft365') {
            integrationConfigs.microsoft365 = config;
            console.log('[integrations] Microsoft 365 config updated in-memory');
        }
        const docPath = 'artifacts/talent-flow/public/data/settings/integrations';
        await fsPatch(docPath, { [provider]: config }, req.firebaseToken);
        res.json({ success: true });
    } catch (err) {
        console.error('[admin/integrations POST]', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
