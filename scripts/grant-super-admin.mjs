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
 *   node scripts/grant-super-admin.mjs emre.demir@infoset.app
 *
 *   # Grant by uid
 *   node scripts/grant-super-admin.mjs --uid abc123XYZ
 *
 *   # Revoke (clears claim and demotes Firestore role to 'recruiter')
 *   node scripts/grant-super-admin.mjs emre.demir@infoset.app --revoke
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
import admin from 'firebase-admin';

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

const projectId = process.env.VITE_FIREBASE_PROJECT_ID
    || process.env.FIREBASE_PROJECT_ID
    || 'talentflow-84bb6';

if (!admin.apps.length) {
    admin.initializeApp({ projectId });
}
const auth = admin.auth();
const db = admin.firestore();

async function resolveUid() {
    if (explicitUid) return explicitUid;
    const user = await auth.getUserByEmail(positional);
    return user.uid;
}

async function main() {
    const uid = await resolveUid();
    const targetRole = revoke ? 'recruiter' : 'super_admin';

    // 1. Custom claim
    const newClaims = revoke ? { role: null } : { role: 'super_admin' };
    await auth.setCustomUserClaims(uid, newClaims);

    // 2. Firestore user doc (merge so other fields are preserved)
    const docRef = db.doc(`artifacts/talent-flow/public/data/users/${uid}`);
    await docRef.set({ role: targetRole }, { merge: true });

    const action = revoke ? 'revoked super_admin from' : 'granted super_admin to';
    console.log(`[grant-super-admin] ${action} uid=${uid}`);
    console.log('[grant-super-admin] user must sign out and back in for the new token to take effect');
}

main().catch((err) => {
    console.error('[grant-super-admin] failed:', err.message);
    process.exit(1);
});
