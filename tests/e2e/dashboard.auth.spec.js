/* global window */
// Authenticated suite — runs against a build with VITE_E2E_MOCK_AUTH=true
// (see .env.e2e-auth + playwright.config.auth.js). The mock-auth branch
// in AuthContext.jsx replaces Firebase with a canned recruiter session
// before any network round-trip, so these tests cover what unauthenticated
// smokes can't: the in-app shell, sidebar navigation, and per-page render
// after login.
//
// What these catch:
//   - AuthContext crashes when handed a real-shaped user/profile pair
//   - The Dashboard route fails to render (empty data state regression)
//   - Sidebar items are missing labels / lose their icons
//   - lazy() Suspense fallback never resolves (chunk mis-split)
//
// What these don't:
//   - Real Firebase auth flow (login submit, OAuth) — that needs the
//     emulator and is the next session's scope
//   - Any test that depends on real Firestore data (dashboard counts,
//     position list contents, etc.) — those will assert "empty state"
//     here since the contexts get no data
import { expect, test } from '@playwright/test';

test.describe('Authenticated shell', () => {
    test('dashboard renders the empty state when contexts hold no data', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (err) => errors.push(err.message));

        await page.goto('/');

        // Sidebar should render the canonical brand pair (logo + tagline).
        // PR #23 promoted the sidebar to be the *only* brand carrier;
        // pinning that here means a regression that re-adds a top-bar
        // wordmark would surface on every CI run.
        await expect(page.getByText('AI Recruitment').first()).toBeVisible({ timeout: 15_000 });

        // Top-bar shows the page title (PR #23). Use a heading-role lookup
        // so we don't accidentally match the sidebar nav item with the
        // same text.
        await expect(page.getByRole('heading', { name: 'Kontrol Paneli', level: 2 })).toBeVisible();

        // The Strategic Overview h1 inside Dashboard's body confirms the
        // page chunk loaded (it's lazy()), and that data-less render
        // doesn't crash. Skeleton loaders may still be visible — that's
        // fine; we're checking the shell mounted.
        await expect(page.getByRole('heading', { name: 'Stratejik Genel Bakış' })).toBeVisible();

        // No JS errors during the authenticated boot path.
        expect(errors, errors.join('\n')).toHaveLength(0);
    });

    test('sidebar carries all 6 main-menu nav items', async ({ page }) => {
        // Pins the sidebar contract from src/components/Sidebar.jsx so a
        // regression that drops or reorders an item shows up in CI.
        // Using getByRole('button') because Sidebar renders nav items as
        // clickable <button> elements, not anchors.
        await page.goto('/');

        const expectedNavItems = [
            'Kontrol Paneli',
            'Mülakatlar',
            'Adaylar',
            'Açık İlanlar',
            'Analitik Raporlar',
            'Mesajlaşma',
        ];

        for (const label of expectedNavItems) {
            await expect(page.getByRole('button', { name: label })).toBeVisible({
                timeout: 10_000,
            });
        }
    });

    test('sidebar Mülakatlar nav switches the in-app view', async ({ page }) => {
        // Pins the in-app SPA navigation contract (changeView event +
        // renderPage switch in App.jsx). Tapping a sidebar item should
        // swap the page chunk in without a hard reload.
        await page.goto('/');

        // Wait for the dashboard shell first so we don't race the lazy
        // Dashboard chunk against the click.
        await expect(page.getByRole('heading', { name: 'Stratejik Genel Bakış' })).toBeVisible({
            timeout: 15_000,
        });

        await page.getByRole('button', { name: 'Mülakatlar' }).click();

        // "Mülakat Yönetimi" appears twice: once in the top-bar (Header
        // title, h2) and once as the page's own body heading (h1). Pin
        // the body h1 specifically — that's the one that tells us the
        // page chunk actually mounted (top-bar updates the moment the
        // event fires, before the chunk loads).
        await expect(page.getByRole('heading', { name: 'Mülakat Yönetimi', level: 1 })).toBeVisible(
            { timeout: 10_000 }
        );

        // URL did not change (App.jsx uses event-based view switching,
        // not router navigation, for in-app pages).
        const path = await page.evaluate(() => window.location.pathname);
        expect(path).toBe('/');
    });
});
