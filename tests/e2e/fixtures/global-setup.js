// Playwright global setup for the real-auth (emulator) suite.
// Runs once before any test in playwright.config.emulator.js. Wipes
// the emulators and seeds a known recruiter user so the tests have
// a stable starting state.

import {
    clearEmulators,
    createAuthUser,
    seedDoc,
    seedMemberships,
    seedTenant,
} from './emulator.js';

export const TEST_USER = {
    email: 'recruiter@talentflow-e2e.local',
    password: 'TestPass123!',
    displayName: 'Test Recruiter',
};

// İki şirketli kullanıcı: şirket seçici ve yalıtım (plan §3.3 madde 4).
export const MULTI_USER = {
    email: 'multi@talentflow-e2e.local',
    password: 'TestPass123!',
    displayName: 'Multi Recruiter',
};

export const TENANTS = {
    A: { id: 'e2e-tenant-a', name: 'Alfa Şirketi', candidate: 'Ayşe Alfa' },
    B: { id: 'e2e-tenant-b', name: 'Beta Şirketi', candidate: 'Bora Beta' },
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
    // Üyelik ve şirket listesi yalnız sunucu tarafından yazılır (kurallar
    // istemciye kapalı); testte tohum doğrudan emülatöre yazılır.
    for (const t of Object.values(TENANTS)) {
        await seedTenant(t.id, t.name);
        await seedDoc(`tenants/${t.id}/candidates/c-${t.id}`, {
            name: t.candidate,
            email: `${t.id}@aday.test`,
            status: 'new',
            appliedDate: new Date().toISOString(),
        });
    }
    const { uid } = await createAuthUser(TEST_USER);
    await seedMemberships({
        uid,
        email: TEST_USER.email,
        displayName: TEST_USER.displayName,
        memberships: [{ tenantId: TENANTS.A.id, name: TENANTS.A.name, role: 'recruiter' }],
    });
    const multi = await createAuthUser(MULTI_USER);
    await seedMemberships({
        uid: multi.uid,
        email: MULTI_USER.email,
        displayName: MULTI_USER.displayName,
        memberships: [
            { tenantId: TENANTS.A.id, name: TENANTS.A.name, role: 'recruiter' },
            { tenantId: TENANTS.B.id, name: TENANTS.B.name, role: 'recruiter' },
        ],
    });
    console.info(`[global-setup] Seeded recruiter ${TEST_USER.email} (uid=${uid})`);
}
