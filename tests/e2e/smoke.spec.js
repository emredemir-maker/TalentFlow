/* global document, window */
// `page.evaluate(...)` callbacks execute inside the browser, so document/
// window are valid there even though the file itself is loaded by Node.

// Smoke tests — Phase 4d.
//
// Verifies the SPA mounts, public routes resolve, and critical text/form
// landmarks render. These run against `vite build && vite preview` (no
// Firebase, no Gemini, no real user) so they're fast and zero-secret.
//
// What these catch:
//   - SPA fails to mount (white screen of death)
//   - Route registration regression (404s on public paths)
//   - Critical bundle missing (e.g., a manualChunks split that excludes
//     a routing dependency)
//   - Login screen regressing to direct sign-in/sign-up (K3, K4)
//
// What these don't catch (deferred to follow-up auth-fixtured PR):
//   - Login submission (needs a real Firebase account)
//   - CV upload + AI parse (needs Gemini key)
//   - Live interview (needs Firestore session doc)
import { expect, test } from '@playwright/test';

test.describe('SPA boot & public routes', () => {
    test('root shows the Hub sign-in screen to unauthenticated users', async ({ page }) => {
        // Capture console errors so a silent SPA crash surfaces in the
        // test report instead of looking like an empty page.
        const errors = [];
        page.on('pageerror', (err) => errors.push(err.message));

        await page.goto('/');

        // Giriş yalnız Clyro Hub'dan (K3): giriş ekranı Hub'a yönlendiren
        // düğmeyi gösterir.
        await expect(page.getByRole('heading', { name: 'Hoş Geldiniz' })).toBeVisible({
            timeout: 10_000,
        });
        await expect(page.getByRole('button', { name: 'Clyro Hub ile giriş yap' })).toBeVisible();

        // No JS errors during boot
        expect(errors, errors.join('\n')).toHaveLength(0);
    });

    test('production build has no direct email/password sign-in or sign-up (K3, K4)', async ({
        page,
    }) => {
        await page.goto('/login');
        await expect(page.getByRole('heading', { name: 'Hoş Geldiniz' })).toBeVisible();
        // Talent'ın kendi e-posta/şifre girişi, kaydı ve Google girişi kalktı.
        await expect(page.locator('input[type="password"]')).toHaveCount(0);
        await expect(
            page.getByRole('button', { name: /Sisteme Giriş Yap|Kayıt|Google/ })
        ).toHaveCount(0);
    });

    test('exit page renders the post-interview thank-you', async ({ page }) => {
        // /exit is a public terminal page candidates land on after
        // finishing a live interview. No params, no Firestore lookup.
        await page.goto('/exit');
        await expect(page.getByRole('heading', { name: 'Mülakat Tamamlandı' })).toBeVisible();
    });

    test('SPA serves the index shell on unknown routes (client-side routing fallback)', async ({
        page,
    }) => {
        // Vite preview is configured to serve index.html for any path so
        // the React Router can take over client-side. A regression that
        // breaks this (e.g., misconfigured rewrite rule) would 404 on
        // every direct link to /login, /apply/x, etc. This test pins
        // that contract.
        const response = await page.goto('/some/nonexistent/deep/route');
        expect(response?.status() ?? 0).toBeLessThan(400);

        // The bundle's <title> from index.html should be present even on
        // an unknown route, since the SPA shell serves regardless.
        await expect(page).toHaveTitle(/Talent/i);
    });

    test('login renders inside a mobile viewport without horizontal scroll', async ({ page }) => {
        // Pins the mobile-responsive shell from PR #25. Before that PR the
        // 240px fixed sidebar would overlap the login form on a phone-
        // width viewport, and the body would scroll sideways. A
        // regression here means a recruiter on a phone can't even reach
        // the login form.
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/login');

        // The login form's right-panel heading must still render.
        await expect(page.getByRole('heading', { name: 'Hoş Geldiniz' })).toBeVisible();

        // No horizontal overflow — document width must not exceed the
        // viewport width. A few pixels of slop are tolerated for
        // scrollbar gutter rendering quirks.
        const overflow = await page.evaluate(() => {
            const docW = document.documentElement.scrollWidth;
            const winW = window.innerWidth;
            return { docW, winW };
        });
        expect(overflow.docW).toBeLessThanOrEqual(overflow.winW + 4);
    });
});
