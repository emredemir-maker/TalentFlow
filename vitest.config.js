// Vitest config — Phase 4c.
//
// Two project setups so we can run frontend and backend tests under one
// command but with the right environment for each:
//   - frontend (jsdom-flavored happy-dom) — for code that touches DOM/window
//   - backend (node) — for functions/ services and pure utils
//
// Coverage uses v8 (built into Node) — much faster than istanbul, and the
// thresholds below cover services/ specifically. Pages/components are not
// in scope for unit tests; that's Phase 4d (Playwright) territory.
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Default to node — most of our tests are pure logic / services. The
        // few tests that need DOM globals can opt in with @vitest-environment
        // happy-dom file-level annotation.
        environment: 'node',
        globals: false,
        include: [
            'src/**/*.test.{js,jsx}',
            'functions/**/*.test.js',
            'tests/**/*.test.{js,jsx}',
        ],
        exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/coverage/**',
            'attached_assets/**',
            'artifacts/**',
            // Playwright E2E specs live under tests/e2e/ — they're driven
            // by `npm run test:e2e` (a separate runner), not vitest.
            'tests/e2e/**',
        ],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary', 'html'],
            // Phase 4c covers a curated slice — only the modules with tests.
            // As future PRs add tests for matchService scorer, cvParser,
            // ai/* helpers, etc., they extend this list. Keeping include
            // narrow means CI coverage gates fail on regression in tested
            // code, not on the absence of tests for code we haven't gotten
            // to yet.
            include: [
                'functions/services/firestoreRest.js',
                'functions/services/gemini.js',
                'src/utils/pii.js',
                'src/utils/emailTemplates.js',
                'src/services/matchService.js',
            ],
            // bulkWorker.js's extractCvText is unit-tested but the rest of
            // the file (claimNextQueuedJob, recoverStaleJobs, the polling
            // loop) is Firestore-dependent — integration test territory.
            // Excluded from coverage gate so the loop's untested LOC don't
            // drag the unit-coverage floor down.
            exclude: ['**/*.test.js'],
            thresholds: {
                lines: 50,
                functions: 50,
                branches: 50,
                statements: 50,
            },
        },
        // Reasonable test timeout — most pure-logic tests finish in <50ms.
        // Anything longer probably has a hung mock and should fail fast.
        testTimeout: 5000,
    },
});
