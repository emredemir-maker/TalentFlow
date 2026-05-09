// In-memory cache of OAuth client configs (Google, Microsoft 365) loaded from
// Firestore on startup. Updated at runtime by POST /api/admin/integrations.
//
// Routes that need OAuth credentials should import the live `integrationConfigs`
// object — values are mutated in place so a single import sees fresh state.
import { db } from './firebaseAdmin.js';
import { childLogger } from '../services/logger.js';
const log = childLogger('integrations');

export const integrationConfigs = { google: null, microsoft365: null };

export async function loadIntegrationConfigs() {
    try {
        const snap = await db.doc('artifacts/talent-flow/public/data/settings/integrations').get();
        if (snap.exists) {
            const data = snap.data();
            if (data.google) {
                integrationConfigs.google = data.google;
                log.info('[integrations] Google config loaded from Firestore');
            }
            if (data.microsoft365) {
                integrationConfigs.microsoft365 = data.microsoft365;
                log.info('[integrations] Microsoft 365 config loaded from Firestore');
            }
        }
    } catch (err) {
        log.warn('[integrations] Could not load integration configs:', err.message);
    }
}

// Defer first read until after admin SDK is fully wired up. Same 3s grace
// period as the original inline version.
setTimeout(loadIntegrationConfigs, 3000);
