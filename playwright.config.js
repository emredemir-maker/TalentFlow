// Playwright config — Phase 4d.
//
// Strategy for v1: smoke-test the static built bundle (vite build → vite
// preview). This catches the highest-frequency regression class — "the SPA
// fails to mount, login form doesn't render, route resolution is broken"
// — without requiring a Firebase emulator, Gemini key, or test user
// fixtures in CI. Future PRs can add authenticated flows by layering a
// Firebase-emulator-backed config on top.
//
// Public routes covered (no auth needed):
//   /             → redirects to /login when unauthenticated
//   /login        → SPA login screen
//   /apply/:id    → public candidate apply form
//   /exit         → post-interview thank-you page
//
// Authenticated flows (recruiter dashboard, CV upload, live interview)
// require a logged-in session — left for a follow-up PR with proper
// auth fixtures.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173; // Vite preview's default
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
    testDir: './tests/e2e',
    // *.auth.spec.js files belong to the authenticated suite — they
    // need a build with VITE_E2E_MOCK_AUTH=true and run via
    // `playwright.config.auth.js`. Skip them here so the default suite
    // doesn't try to run them against an unauthenticated build.
    testIgnore: /.*\.auth\.spec\.js$/,
    // CI: be strict — flaky tests are a contagion. 1 retry just smooths
    // network blips. Local: 0 retries so authors see the actual failure.
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI
        ? [['github'], ['html', { open: 'never' }]]
        : [['list'], ['html', { open: 'never' }]],
    timeout: 30_000,
    expect: {
        // Allow a generous default for SPA hydration. Individual asserts
        // can override with `toBeVisible({ timeout: ... })`.
        timeout: 7_000,
    },
    use: {
        baseURL: BASE_URL,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [
        // Single browser project for v1 — Chromium is a representative
        // baseline. Adding firefox/webkit triples CI time without finding
        // proportionally more bugs at this scale.
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    // Auto-start Vite preview before tests, kill after. Skipped if
    // E2E_BASE_URL is set externally (e.g., when running against a
    // deployed staging environment).
    webServer: process.env.E2E_BASE_URL
        ? undefined
        : {
              command: 'npm run preview -- --port 4173 --host 127.0.0.1',
              url: BASE_URL,
              reuseExistingServer: !process.env.CI,
              timeout: 60_000,
              stdout: 'ignore',
              stderr: 'pipe',
          },
});
