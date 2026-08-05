// Firebase Admin SDK — single initialization point.
//
// `projectId` is set explicitly so that local dev (where ADC may resolve to
// a different default project) reliably hits this app's Firestore. In the
// Cloud Functions runtime the service account already targets the right
// project, but the explicit value is harmless there.
//
// Importing this module gives you a ready-to-use Firestore handle. Other
// modules should `import { db } from '../config/firebaseAdmin.js';`
// instead of calling `admin.firestore()` themselves.
import admin from 'firebase-admin';

import { childLogger } from '../services/logger.js';
const log = childLogger('firebaseAdmin');

// The Cloud Functions runtime provides FIREBASE_CONFIG (JSON with projectId,
// storageBucket, …). Passing an explicit options object to initializeApp()
// disables that auto-detection, so we parse it ourselves — otherwise the
// default Storage bucket used for CV uploads (routes/cv.js) would be unset
// in production.
const runtimeConfig = (() => {
    try { return JSON.parse(process.env.FIREBASE_CONFIG || '{}'); } catch { return {}; }
})();

const storageBucket = process.env.FIREBASE_STORAGE_BUCKET
    || process.env.VITE_FIREBASE_STORAGE_BUCKET
    || runtimeConfig.storageBucket;

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
        storageBucket,
    });
    // Boot-time signal so a misconfigured deploy shows up in the first
    // minutes of logs instead of as scattered per-upload warnings.
    if (storageBucket) {
        log.info(`Storage bucket resolved: ${storageBucket}`);
    } else {
        log.warn('No Storage bucket resolved (FIREBASE_STORAGE_BUCKET / VITE_FIREBASE_STORAGE_BUCKET / FIREBASE_CONFIG) — CV uploads will not persist to Storage');
    }
}

export const db = admin.firestore();

// Lazy accessor — admin.storage().bucket() throws when no bucket name could
// be resolved (typical for local dev without Firebase env vars). Callers
// invoke this inside try/catch and fall back to local static serving.
export function getStorageBucket() {
    return admin.storage().bucket();
}

export { admin };
