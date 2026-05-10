// Playwright config — authenticated suite.
//
// Why a second config?
// The default `playwright.config.js` exercises the SPA in its
// unauthenticated state (login page, public routes, mobile shell).
// Authenticated flows need the app to start with a signed-in session,
// which we wire via the build-time env `VITE_E2E_MOCK_AUTH=true`. That
// flag short-circuits AuthContext to a canned recruiter user before any
// Firebase call is made (see src/context/AuthContext.jsx).
//
// Splitting configs is cheaper than juggling project-level webServer
// overrides — each config builds and serves its own preview on a
// different port and runs its own test glob.
//
// Run:        npm run test:e2e:auth
// Run UI:     npx playwright test --config=playwright.config.auth.js --ui
// CI:         the e2e-auth job in .github/workflows/ci.yml

import { defineConfig, devices } from '@playwright/test';

const PORT = 4174; // distinct from public-suite port 4173 so both can run
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /.*\.auth\.spec\.js$/,
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI
        ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-auth' }]]
        : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-auth' }]],
    timeout: 30_000,
    expect: { timeout: 7_000 },
    use: {
        baseURL: BASE_URL,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [
        {
            name: 'chromium-auth',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: process.env.E2E_BASE_URL
        ? undefined
        : {
              // Build with the mock-auth flag so AuthContext starts in a
              // pre-authenticated state. Bash-style env prefix works
              // cross-platform with the `env` field in webServer config.
              command: 'npm run build:e2e-auth && npm run preview -- --port 4174 --host 127.0.0.1',
              url: BASE_URL,
              reuseExistingServer: !process.env.CI,
              timeout: 120_000,
              stdout: 'ignore',
              stderr: 'pipe',
          },
});
