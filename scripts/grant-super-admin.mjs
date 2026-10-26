#!/usr/bin/env node
/**
 * Grant or revoke the `super_admin` role for a Firebase Auth user.
 *
 * The role is written in two places at once so either path can survive
 * if the other breaks:
 *   1. Firebase Auth custom claims  (token.role = 'super_admin')
 *      -> evaluated by Firestore rules at request.auth.token.role
 *   2. Firestore user doc           (users/{uid}.role = 'super_admin')
 *      -> evaluated by Firestore rules via getUserProfile().role
 *
 * Usage (run from repo root):
 *
 *   # Grant by email
 *   node scripts/grant-super-admin.mjs emredemir@gmail.com
 *
 *   # Grant by uid
 *   node scripts/grant-super-admin.mjs --uid abc123XYZ
 *
 *   # Revoke (clears claim and demotes Firestore role to 'recruiter')
 *   node scripts/grant-super-admin.mjs emredemir@gmail.com --revoke
 *
 * Project: read from .firebaserc (projects.default) — the single place the
 * Firebase project ID lives. VITE_FIREBASE_PROJECT_ID / FIREBASE_PROJECT_ID
 * override it (e.g. to target the demo project).
 *
 * İLK YÖNETİCİ (temiz kurulum): boş bir projede davet ya da izinli alan adı
 * olmadığı için ilk giriş "Erişim yetkiniz bulunmuyor" ile reddedilir — ama
 * Firebase Auth kullanıcısı oluşmuş olur. Bu betik o kullanıcıya rolü verir ve
 * kullanıcı belgesi hiç yoksa uygulamanın beklediği alanlarla oluşturur.
 *
 * Auth: uses Application Default Credentials. Locally:
 *   gcloud auth application-default login
 * In CI / Cloud Run / Functions: the service account's IAM bindings cover it.
 *
 * After running, the affected user must SIGN OUT and SIGN BACK IN for
 * the new ID token to carry the updated custom claim. Existing tokens
 * remain unchanged until they expire (~1 hour).
 */
import process from 'node:process';
import { readFileSync } from 'node:fs';
import admin from 'firebase-admin';
import { validateProjectId } from './check-project-config.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const arg = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
};

const revoke = flag('--revoke');
const explicitUid = arg('--uid');
const positional = args.find((a) => !a.startsWith('--') && a !== explicitUid);

if (!explicitUid && !positional) {
    console.error('Usage: node scripts/grant-super-admin.mjs <email> [--revoke]');
    console.error('   or: node scripts/grant-super-admin.mjs --uid <uid> [--revoke]');
    process.exit(1);
}

function projectFromFirebaserc() {
    try {
        const rc = JSON.parse(readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8'));
        return rc?.projects?.default || '';
    } catch {
        return '';
    }
}

const projectId = process.env.VITE_FIREBASE_PROJECT_ID
    || process.env.FIREBASE_PROJECT_ID
    || projectFromFirebaserc();

const projectErr = validateProjectId(projectId);
if (projectErr) {
    console.error(`[grant-super-admin] ${projectErr} (.firebaserc → projects.default)`);
    process.exit(1);
}
console.log(`[grant-super-admin] project=${projectId}`);

if (!admin.apps.length) {
    admin.initializeApp({ projectId });
}
const auth = admin.auth();
const db = admin.firestore();

async function resolveUser() {
    try {
        return explicitUid ? await auth.getUser(explicitUid) : await auth.getUserByEmail(positional);
    } catch (err) {
        if (err.code === 'auth/user-not-found') {
            throw new Error('kullanıcı bulunamadı — önce uygulamaya bir kez giriş yapın (Google ya da '
                + 'e-posta ile kayıt); giriş reddedilse bile Auth kullanıcısı oluşur, sonra bu betiği yeniden çalıştırın');
        }
        throw err;
    }
}

async function main() {
    const user = await resolveUser();
    const uid = user.uid;
    const targetRole = revoke ? 'recruiter' : 'super_admin';

    // 1. Custom claim
    const newClaims = revoke ? { role: null } : { role: 'super_admin' };
    await auth.setCustomUserClaims(uid, newClaims);

    // 2. Firestore user doc (merge so other fields are preserved)
    const docRef = db.doc(`artifacts/talent-flow/public/data/users/${uid}`);
    const existing = await docRef.get();
    if (existing.exists || revoke) {
        await docRef.set({ role: targetRole }, { merge: true });
    } else {
        // Temiz kurulumdaki ilk yönetici: AuthContext'in davetle oluşturduğu
        // profille aynı alanlar — yalnızca `role` yazılsaydı arayüz adı, e-postayı
        // ve durumu boş görürdü.
        const email = (user.email || '').toLowerCase();
        await docRef.set({
            uid,
            email,
            displayName: user.displayName || email.split('@')[0] || '',
            photoURL: user.photoURL || '',
            role: targetRole,
            departments: [],
            status: 'active',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log('[grant-super-admin] user doc did not exist — created full profile');
    }

    const action = revoke ? 'revoked super_admin from' : 'granted super_admin to';
    console.log(`[grant-super-admin] ${action} uid=${uid}`);
    console.log('[grant-super-admin] user must sign out and back in for the new token to take effect');
}

main().catch((err) => {
    console.error('[grant-super-admin] failed:', err.message);
    process.exit(1);
});
