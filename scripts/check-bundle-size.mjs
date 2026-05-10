#!/usr/bin/env node
// Bundle-size regression guard.
//
// Runs after `npm run build` and asserts that the main app chunk
// (`dist/assets/index-*.js`) stays under a budget. PR #35 brought it
// down from ~295 KB gzip to ~73 KB gzip via route-level lazy loading;
// the budget below is generous enough to accommodate normal feature
// growth but tight enough to catch a regression where someone
// reintroduces a static import of a large page module.
//
// Why a separate Node script instead of a Playwright test:
// Playwright tests run against a built+previewed app and only see
// network sizes. This script reads the build artifact directly, which
// is what we actually care about (and runs in milliseconds, no
// browser).
//
// CI usage:  npm run build && node scripts/check-bundle-size.mjs
// Override:  BUDGET_INDEX_GZIP_KB=100 node scripts/check-bundle-size.mjs
//
// Exit codes:
//   0  budget respected
//   1  budget exceeded (and prints the over-budget chunks + size diff)
//   2  build artifacts not found (ran before `npm run build`?)

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(REPO_ROOT, 'dist', 'assets');

// Budgets in kilobytes (gzipped). Tightened after PR #35 (route-level
// lazy loading); keep some headroom for organic growth.
const BUDGETS = {
    // Main app entry — the only chunk every visitor downloads on first
    // paint. PR #35 shipped this at 73.1 KB gzip. 130 KB allows ~80%
    // headroom before failing.
    'index-': Number(process.env.BUDGET_INDEX_GZIP_KB) || 130,
};

async function listAssetFiles() {
    try {
        return await fs.readdir(ASSETS_DIR);
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.error(`[check-bundle-size] dist/assets not found — did you run \`npm run build\` first?`);
            process.exit(2);
        }
        throw err;
    }
}

async function gzippedSizeKb(filePath) {
    const buf = await fs.readFile(filePath);
    const gz = gzipSync(buf, { level: 9 });
    return gz.length / 1024;
}

async function main() {
    const files = await listAssetFiles();
    const violations = [];
    const checked = [];

    for (const [prefix, budgetKb] of Object.entries(BUDGETS)) {
        const matches = files.filter((f) => f.startsWith(prefix) && f.endsWith('.js'));
        if (matches.length === 0) {
            console.error(`[check-bundle-size] no chunk matched prefix "${prefix}" — build output changed?`);
            process.exit(2);
        }
        for (const f of matches) {
            const full = path.join(ASSETS_DIR, f);
            const sizeKb = await gzippedSizeKb(full);
            const status = sizeKb > budgetKb ? 'FAIL' : 'OK  ';
            const line = `${status}  ${f.padEnd(48)}  ${sizeKb.toFixed(1).padStart(7)} KB gz  (budget ${budgetKb} KB)`;
            checked.push(line);
            if (sizeKb > budgetKb) {
                violations.push({ file: f, sizeKb, budgetKb, overBy: sizeKb - budgetKb });
            }
        }
    }

    console.log(checked.join('\n'));

    if (violations.length > 0) {
        console.error('\n[check-bundle-size] BUDGET EXCEEDED:');
        for (const v of violations) {
            console.error(`  ${v.file}: ${v.sizeKb.toFixed(1)} KB gz exceeds ${v.budgetKb} KB by ${v.overBy.toFixed(1)} KB`);
        }
        console.error('\nIf this growth is intentional (new heavy feature on the initial route),');
        console.error('raise BUDGET_INDEX_GZIP_KB in scripts/check-bundle-size.mjs after reviewing');
        console.error('whether the new code could be route-lazy-loaded instead.');
        process.exit(1);
    }

    console.log('\n[check-bundle-size] All chunks within budget.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
