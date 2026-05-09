#!/usr/bin/env node
// scripts/check-deps-sync.mjs
//
// Phase 4c.5 — guard against the regression that broke Phase 4b deploy.
//
// Symptom: pino was added to root package.json (npm install --save) but
// not to functions/package.json. CI lint+build passed locally, the merge
// went through, then Cloud Run deploy crashed at startup with
// ERR_MODULE_NOT_FOUND because Firebase Functions only ships the
// functions/ directory.
//
// Root cause: this repo has two parallel dependency lists (root for the
// Vite frontend + local-dev concurrently invocation; functions/ for the
// deployed Cloud Run container). Adding a backend import without also
// updating functions/package.json silently breaks production.
//
// What this script does:
//   1. Walks functions/**/*.js (excluding node_modules and tests).
//   2. Extracts every bare-specifier import / require.
//   3. Strips Node built-ins.
//   4. Verifies each remaining package is listed in functions/package.json
//      dependencies or devDependencies.
//   5. Exits non-zero with a clear message if any are missing.
//
// Run via `npm run check:deps`. Wired into the CI lint job so PRs that
// import a new package without registering it in functions/package.json
// fail before they can land.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const FUNCTIONS_DIR = join(REPO_ROOT, 'functions');

// ─── Walk functions/ source files ───────────────────────────────────────
function walkJs(dir, acc = []) {
    for (const entry of readdirSync(dir)) {
        // Skip node_modules and uploads — never traverse those.
        if (entry === 'node_modules' || entry === 'uploads' || entry === 'lib') continue;
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
            walkJs(full, acc);
        } else if (
            entry.endsWith('.js') &&
            !entry.endsWith('.test.js') &&
            entry !== 'package-lock.json'
        ) {
            acc.push(full);
        }
    }
    return acc;
}

// ─── Extract bare-specifier imports from a source file ──────────────────
// Matches:
//   import x from 'pkg'
//   import x from "pkg"
//   import { x } from 'pkg'
//   import * as x from 'pkg'
//   import 'pkg'                       (side-effect)
//   await import('pkg')                (dynamic)
//   require('pkg')                     (CommonJS via createRequire)
//
// Excludes: relative ('./x', '../x'), absolute ('/x'), node: protocol,
// and bare node built-ins.
const IMPORT_RE = /(?:^|\s)import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const builtins = new Set(builtinModules);

function packageNameOf(specifier) {
    if (specifier.startsWith('node:')) return null;
    if (specifier.startsWith('.') || specifier.startsWith('/')) return null;
    if (builtins.has(specifier.split('/')[0])) return null;
    // Scoped: '@google/generative-ai' or '@google/generative-ai/sub'
    if (specifier.startsWith('@')) {
        return specifier.split('/').slice(0, 2).join('/');
    }
    // Unscoped: 'pino' or 'pino/file'
    return specifier.split('/')[0];
}

function extractImports(source) {
    const found = new Set();
    for (const re of [IMPORT_RE, DYNAMIC_IMPORT_RE, REQUIRE_RE]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(source)) !== null) {
            const pkg = packageNameOf(m[1]);
            if (pkg) found.add(pkg);
        }
    }
    return found;
}

// ─── Main check ─────────────────────────────────────────────────────────
const fnsPkg = JSON.parse(readFileSync(join(FUNCTIONS_DIR, 'package.json'), 'utf-8'));
const declared = new Set([
    ...Object.keys(fnsPkg.dependencies || {}),
    ...Object.keys(fnsPkg.devDependencies || {}),
]);

const files = walkJs(FUNCTIONS_DIR);
const allImports = new Map(); // pkg → first file that imports it

for (const file of files) {
    const src = readFileSync(file, 'utf-8');
    for (const pkg of extractImports(src)) {
        if (!allImports.has(pkg)) allImports.set(pkg, relative(REPO_ROOT, file));
    }
}

const missing = [];
for (const [pkg, firstFile] of allImports) {
    if (!declared.has(pkg)) missing.push({ pkg, firstFile });
}

if (missing.length > 0) {
    console.error('\n❌ Backend imports not declared in functions/package.json:\n');
    for (const { pkg, firstFile } of missing) {
        console.error(`  • ${pkg}  (first imported in ${firstFile})`);
    }
    console.error(
        '\nWhy this matters: Firebase Functions only ships the functions/ directory.\n' +
            'A bare import not declared in functions/package.json will compile and lint\n' +
            'fine locally (the package is in root node_modules), but Cloud Run will\n' +
            'crash at startup with ERR_MODULE_NOT_FOUND.\n\n' +
            'Fix: add each missing package to functions/package.json dependencies and\n' +
            'run `npm install` inside functions/ to update functions/package-lock.json.\n'
    );
    process.exit(1);
}

console.log(
    `✅ All ${allImports.size} backend imports are declared in functions/package.json`
);
