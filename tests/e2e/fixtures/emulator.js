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
 * Create an Auth user with email + password. Returns both the localId
 * (Firebase UID) AND the idToken so callers can write a matching
 * profile doc *as that user* — the project's Firestore rules require
 * authenticated writes for `users/{uid}`.
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
    return { uid: data.localId, idToken: data.idToken };
}

/** JS değeri → Firestore REST değer zarfı (yalnız tohumda kullanılan tipler). */
function fsValue(v) {
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(fsValue) } };
    if (v && typeof v === 'object') {
        return {
            mapValue: {
                fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fsValue(x)])),
            },
        };
    }
    if (typeof v === 'number') return { integerValue: String(v) };
    if (typeof v === 'boolean') return { booleanValue: v };
    return { stringValue: String(v) };
}

/**
 * Bir belgeyi kuralları atlayarak yazar (emülatöre özel "Bearer owner").
 * Çok şirketli modelde üyeliği ve şirket listesini istemci yazamaz — yalnız
 * sunucu (Hub senkronu, PR 4) yazar; testte onun yerine tohum yazıyor.
 */
export async function seedDoc(docPath, data) {
    const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsValue(v)]));
    const res = await fetch(`${FIRESTORE_BASE}/${docPath}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ fields }),
    });
    if (!res.ok) throw new Error(`Seed failed for ${docPath}: ${res.status} ${await res.text()}`);
}

/** Şirket belgesi (açık, 1 yıl yazılabilir). */
export async function seedTenant(tenantId, name) {
    const inAYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await seedDoc(`tenants/${tenantId}`, {
        name,
        status: 'active',
        writeUntil: inAYear,
        readUntil: inAYear,
    });
}

/**
 * Kişiyi şirketlere üye yapar: tenants/{t}/members/{uid} + userTenants/{uid}.
 * @param {{uid: string, email: string, displayName: string, memberships: Array<{tenantId: string, name: string, role: string}>}} p
 */
export async function seedMemberships({ uid, email, displayName, memberships }) {
    const map = {};
    for (const m of memberships) {
        await seedDoc(`tenants/${m.tenantId}/members/${uid}`, {
            role: m.role,
            status: 'active',
            departments: [],
            email,
            displayName,
        });
        map[m.tenantId] = { name: m.name, role: m.role };
    }
    await seedDoc(`userTenants/${uid}`, { tenants: map });
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
