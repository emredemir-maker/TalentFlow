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

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
    });
}

export const db = admin.firestore();
export { admin };
