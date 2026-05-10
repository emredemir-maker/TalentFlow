// Real-auth suite — runs against a build pointed at the local Firebase
// emulators. Unlike dashboard.auth.spec.js (mock-auth shim), these
// tests exercise the actual Firebase SDK code paths: form submit,
// onAuthStateChanged, Firestore profile listener, route protection.
//
// What these catch (that the mock-auth suite can't):
//   - Login form submit handler regression (e.g., a wiring bug in
//     LoginPage that swallows submit events)
//   - AuthContext profile-listener race conditions
//   - Firestore rules misconfiguration that locks out a real recruiter
//   - Route protection: hard-loading a path while unauthenticated
//
// What these still don't:
//   - Google OAuth popup flow (browser popup mocking is fragile;
//     skipped intentionally — emulator + email/password is enough
//     to cover the auth context contract)
//   - File uploads, Gemini calls, integration tokens — those need
//     real third-party services and live in manual QA

import { expect, test } from '@playwright/test';
import { TEST_USER } from './fixtures/global-setup.js';

test.describe('Real-auth login + dashboard', () => {
    test('email/password login lands on the dashboard', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (err) => errors.push(err.message));

        await page.goto('/');

        // Unauthenticated → router redirects to LoginPage. Wait for
        // the canonical right-panel heading instead of the URL because
        // App.jsx renders LoginPage *without* a router push.
        await expect(page.getByRole('heading', { name: 'Hoş Geldiniz' })).toBeVisible({
            timeout: 15_000,
        });

        // Fill credentials seeded by global-setup. The submit handler
        // calls Firebase signInWithEmailAndPassword against the emulator.
        await page.locator('input[type="email"]').first().fill(TEST_USER.email);
        await page.locator('input[type="password"]').first().fill(TEST_USER.password);

        // Find the submit button by its visible label. LoginPage uses
        // "Giriş Yap" for both initial and submitted states.
        await page.getByRole('button', { name: /Giriş Yap/i }).click();

        // After successful auth, AuthContext sets user + profile and
        // App.jsx flips to AuthenticatedApp. The Dashboard's body
        // heading is the canonical "we mounted post-auth" signal.
        await expect(page.getByRole('heading', { name: 'Stratejik Genel Bakış' })).toBeVisible({
            timeout: 20_000,
        });

        // No JS errors during the auth round-trip
        expect(errors, errors.join('\n')).toHaveLength(0);
    });

    test('refreshing while authenticated keeps the user in the dashboard', async ({ page }) => {
        // Pin the persistence contract: Firebase auth state survives a
        // page reload (token in IndexedDB). After a full reload, the
        // user shouldn't bounce back to LoginPage.
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'Hoş Geldiniz' })).toBeVisible({
            timeout: 15_000,
        });
        await page.locator('input[type="email"]').first().fill(TEST_USER.email);
        await page.locator('input[type="password"]').first().fill(TEST_USER.password);
        await page.getByRole('button', { name: /Giriş Yap/i }).click();
        await expect(page.getByRole('heading', { name: 'Stratejik Genel Bakış' })).toBeVisible({
            timeout: 20_000,
        });

        await page.reload();

        // Same dashboard heading should appear again, no bounce to login.
        await expect(page.getByRole('heading', { name: 'Stratejik Genel Bakış' })).toBeVisible({
            timeout: 20_000,
        });
        // And the LoginPage heading should NOT be visible
        await expect(page.getByRole('heading', { name: 'Hoş Geldiniz' })).toBeHidden();
    });
});
