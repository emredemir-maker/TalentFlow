// Test fixtures for the real-auth Playwright suite.
//
// Talks to the Firebase Auth and Firestore emulators directly via
// their REST APIs (no SDK, no auth headers — emulators happily accept
// the fake "Bearer owner" token). Used by the global setup to seed a
// recruiter user + a couple of Firestore docs before the suite runs.
//
// Why REST instead of the JS SDK in setup?
//   - The SDK init pulls in firebase/app + firebase/auth + ~150KB of
//     polyfills just to make a handful of writes.
//   - The emulator's REST surface is documented and stable, so setup
//     stays fast (sub-second) and has fewer moving parts.

// `demo-` prefix: firebase-tools recognises this as a demo project ID
// and skips the auth/login check that real project IDs require. Lets
// the emulators run on CI without any service account or token.
const PROJECT_ID = 'demo-talentflow';
const AUTH_HOST = '127.0.0.1:9099';
const FIRESTORE_HOST = '127.0.0.1:8080';

const AUTH_BASE = `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1`;
const FIRESTORE_BASE = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/**
 * Wipe all auth users + firestore data for the project. Idempotent:
 * fine to call between test runs to start fresh.
 */
export async function clearEmulators() {
    await Promise.all([
        // Wipe Auth: identitytoolkit's accounts:delete endpoint nukes
        // every user under the project.
        fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
            method: 'DELETE',
        }).catch(() => {}),
        // Wipe Firestore: the `documents` namespace under a project.
        fetch(
            `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
            {
                method: 'DELETE',
            }
        ).catch(() => {}),
    ]);
}

/**
 * Create an Auth user with email + password. Returns the localId
 * (Firebase UID) so callers can write a matching profile doc.
 */
export async function createAuthUser({ email, password, displayName }) {
    const res = await fetch(`${AUTH_BASE}/accounts:signUp?key=fake-emulator-api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName, returnSecureToken: true }),
    });
    if (!res.ok) {
        throw new Error(`Auth user creation failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return data.localId;
}

/**
 * Write a recruiter-shaped profile doc at
 * artifacts/talent-flow/public/data/users/{uid}. Mirrors the shape
 * AuthContext expects so the in-app shell renders normally.
 */
export async function writeUserProfile({ uid, email, displayName, role }) {
    const docPath = `artifacts/talent-flow/public/data/users/${uid}`;
    const res = await fetch(`${FIRESTORE_BASE}/${docPath}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            fields: {
                uid: { stringValue: uid },
                email: { stringValue: email },
                displayName: { stringValue: displayName },
                name: { stringValue: displayName },
                role: { stringValue: role },
                status: { stringValue: 'active' },
                departments: { arrayValue: { values: [] } },
            },
        }),
    });
    if (!res.ok) {
        throw new Error(`Profile write failed: ${res.status} ${await res.text()}`);
    }
}

/**
 * Quick health check — used by the webServer step to wait until both
 * emulators are listening before kicking off Playwright.
 */
export async function emulatorsReady() {
    try {
        const [a, f] = await Promise.all([
            fetch(`http://${AUTH_HOST}/`).then((r) => r.ok || r.status === 404),
            fetch(`http://${FIRESTORE_HOST}/`).then((r) => r.ok || r.status === 404),
        ]);
        return a && f;
    } catch {
        return false;
    }
}
