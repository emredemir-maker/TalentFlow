// Playwright config — real-auth suite (Firebase emulator-backed).
//
// Unlike playwright.config.auth.js (which uses a build-time mock that
// short-circuits AuthContext), this config exercises the *real*
// Firebase JS SDK pointed at local emulators. Tests can submit the
// login form, navigate through authenticated routes, and read seeded
// Firestore data.
//
// How it ties together:
//   1. firebase.json declares the emulators (auth:9099, firestore:8080).
//   2. .env.e2e-emulator sets VITE_USE_FIREBASE_EMULATOR=true plus a
//      stable fake Firebase config (the project id matters; the SDK
//      uses it to scope emulator data).
//   3. src/config/firebase.js calls connectAuthEmulator / connect-
//      FirestoreEmulator when the env var is on.
//   4. The webServer command below wraps `vite preview` with
//      `firebase emulators:exec`, so the emulators are guaranteed
//      to be running before tests start.
//   5. Global setup (tests/e2e/fixtures/global-setup.js) wipes the
//      emulators and seeds a known recruiter user via REST.
//
// Run:  npm run test:e2e:emulator

import { defineConfig, devices } from '@playwright/test';

const PORT = 4175; // distinct from public (4173) + auth-mock (4174)
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /.*\.real-auth\.spec\.js$/,
    globalSetup: './tests/e2e/fixtures/global-setup.js',
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI
        ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-emulator' }]]
        : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-emulator' }]],
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
            name: 'chromium-real-auth',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    // Wraps the preview server in `firebase emulators:exec` so the
    // emulators are running for the entire test lifecycle. The
    // `--project` flag pins the project id used in Firestore data
    // namespacing.
    webServer: process.env.E2E_BASE_URL
        ? undefined
        : {
              // `npx` runs the firebase-tools binary whether it's a
              // global install (CI) or a local devDependency (future).
              // `demo-` project ID skips firebase-tools' auth check —
              // the emulators don't care, and CI has no service account.
              command:
                  'npx firebase emulators:exec --only auth,firestore --project demo-talentflow "npm run build:e2e-emulator && npm run preview -- --port 4175 --host 127.0.0.1"',
              url: BASE_URL,
              reuseExistingServer: !process.env.CI,
              timeout: 180_000,
              // stdout piped so a CI failure's webServer log lands in
              // the Playwright report instead of disappearing into
              // GitHub Actions' group-collapsed step output.
              stdout: 'pipe',
              stderr: 'pipe',
          },
});
