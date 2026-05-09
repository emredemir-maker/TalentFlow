// ESLint config — Phase 4a quality infrastructure.
//
// Strategy: enforce "real bug" rules as errors, demote pre-existing
// cosmetic/architectural issues to warnings. CI tracks the warning count via
// `npm run lint:ci` (--max-warnings <baseline>) so the backlog can only shrink,
// never grow. As future PRs touch files, lint-staged auto-fixes formatting and
// the warnings drain incrementally.
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Build artifacts and vendored binaries are never linted.
  globalIgnores([
    'dist',
    'functions/lib',
    'functions/uploads',
    'attached_assets',
    'chrome-session',
    'public',
    'scripts/legacy',
    'coverage',
  ]),
  // Frontend (browser) — React + Vite.
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Real bugs — keep as errors.
      'no-undef': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      // Pre-existing backlog — demote so CI can baseline-lock with --max-warnings
      // and we can drain incrementally instead of in one giant diff.
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      // The react-hooks plugin's compiler-based checks (set-state-in-effect,
      // bailouts) flag widespread pre-existing patterns. Keep as warnings until
      // a dedicated pass refactors the offending effects.
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      // Context files intentionally export both the Provider component and the
      // useXxx() hook; HMR Fast Refresh tolerates this in practice.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  // Backend (Node) — Express server, services, scripts.
  {
    files: [
      'functions/**/*.js',
      'scripts/**/*.{js,mjs,cjs}',
      'eslint.config.js',
      'vite.config.js',
    ],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node, ...globals.es2022 },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // Console is fine on the server today — Phase 4b switches to pino, at
      // which point this gate flips back to warn for `console.*`.
      'no-console': 'off',
    },
  },
  // Puppeteer files — page.evaluate(() => document.foo) callbacks run inside
  // the headless browser context, so document/window are valid there. Allow
  // both Node and browser globals to avoid no-undef false positives.
  {
    files: ['functions/routes/scrape.js', 'functions/services/scrape.js', 'cli-scraper.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, ...globals.es2022 },
    },
  },
])
