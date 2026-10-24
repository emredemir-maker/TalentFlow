// integrationTokens.js fabrikasının gerçek Firestore'a bağlı örneği.
import { FieldValue } from 'firebase-admin/firestore';

import { db } from '../config/firebaseAdmin.js';
import { createIntegrationTokenStore } from './integrationTokens.js';
import { refreshProviderToken } from './oauthProviders.js';
import { childLogger } from './logger.js';

export const tokenStore = createIntegrationTokenStore({
    db,
    deleteField: () => FieldValue.delete(),
    refreshProvider: refreshProviderToken,
    log: childLogger('integrationTokens'),
});
