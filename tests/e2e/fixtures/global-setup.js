// Playwright global setup for the real-auth (emulator) suite.
// Runs once before any test in playwright.config.emulator.js. Wipes
// the emulators and seeds a known recruiter user so the tests have
// a stable starting state.

import { clearEmulators, createAuthUser, writeUserProfile } from './emulator.js';

export const TEST_USER = {
    email: 'recruiter@talentflow-e2e.local',
    password: 'TestPass123!',
    displayName: 'Test Recruiter',
};

export default async function globalSetup() {
    // Wait for emulators to come up. firebase-tools `emulators:exec`
    // starts them before the inner command runs, but the readiness
    // check is best-effort; we retry with a short backoff.
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const res = await fetch('http://127.0.0.1:9099/');
            if (res.status === 200 || res.status === 404) break;
        } catch {
            /* not up yet */
        }
        if (i === maxAttempts - 1) {
            throw new Error('Auth emulator did not become ready within ~15s');
        }
        await new Promise((r) => setTimeout(r, 500));
    }

    await clearEmulators();
    const { uid, idToken } = await createAuthUser(TEST_USER);
    await writeUserProfile({
        uid,
        idToken,
        email: TEST_USER.email,
        displayName: TEST_USER.displayName,
        role: 'recruiter',
    });
    console.info(`[global-setup] Seeded recruiter ${TEST_USER.email} (uid=${uid})`);
}
