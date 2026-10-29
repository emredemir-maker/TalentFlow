#!/usr/bin/env node
// scripts/check-tenant-paths.mjs — sunucu yolları için statik denetim.
//
// Çok şirketli modelde (docs/coklu-sirket-plani.md §3.3 madde 3) sunucu Admin
// SDK ile kuralları ATLAYARAK çalışır; şirket yalıtımının sunucudaki güvencesi
// her yolun functions/services/tenantPaths.js'ten, doğrulanmış şirket
// kimliğiyle kurulması. Bu betik o disiplini CI'da zorlar:
//
//   1. Eski ortak kök (`artifacts/talent-flow`, URL kodlu hâli dahil) functions/
//      ve src/ altında yalnız sunucu yol modülünde geçebilir.
//   2. Kök `interviews/` koleksiyonuna dizgiyle giden yol yok.
//   3. `db.collection(…)`, `db.doc(…)`, `db.collectionGroup(…)` ilk argümanı
//      dizgi/şablon olamaz — yol yol modülünden gelmeli. (Bir şirket belgesine
//      bağlı göreli alt koleksiyon — `jobRef.collection('items')` — serbest.)
//   4. İstemcide `collection(db, '…')` / `doc(db, '…')` aynı şekilde yasak.
//
// Test dosyaları (*.test.js) ve node_modules taranmaz.
// Çalıştırma: npm run check:tenant-paths (CI lint işinde).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const FUNCTIONS = join(ROOT, 'functions');
const SRC = join(ROOT, 'src');
// Yol modülleri: sunucu ve istemci. Eski kök yalnız sunucu modülünün açıklamasında.
const PATH_MODULE = 'functions/services/tenantPaths.js';
const CLIENT_PATH_MODULE = 'src/config/tenantPaths.js';

const RULES = [
    {
        id: 'eski-kok',
        re: /artifacts(\/|%2F)talent-flow/i,
        msg: 'eski ortak kök (artifacts/talent-flow) — yol tenantPaths.js üzerinden kurulmalı',
        allow: (file) => file === PATH_MODULE,
    },
    {
        id: 'kok-interviews',
        re: /['"`]\/?interviews\//,
        msg: 'kök interviews/ koleksiyonu — tenantPaths(t).interview(id) kullanın',
    },
    {
        id: 'sabit-yol',
        re: /\bdb\s*\.\s*(collection|doc|collectionGroup)\s*\(\s*['"`]/,
        msg: 'db.collection/doc/collectionGroup içinde sabit yol — tenantPaths.js kullanın',
    },
    {
        // İstemci SDK'sı: collection(db, '…') / doc(db, '…') ilk yol argümanı
        // sabit dizgi olamaz — şirket yolu src/config/tenantPaths.js'ten.
        // (userTenants yolu da oradan: userTenantsPath.)
        id: 'istemci-sabit-yol',
        re: /\b(collection|doc|collectionGroup)\s*\(\s*db\s*,\s*(['"]|`(?!\$\{))/,
        msg: 'collection(db, …)/doc(db, …) içinde sabit yol — src/config/tenantPaths.js kullanın',
        allow: (file) => file === CLIENT_PATH_MODULE,
    },
];

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules') continue;
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) walk(full, out);
        else if (/\.(js|jsx|mjs)$/.test(name) && !/\.test\.(js|jsx)$/.test(name)) out.push(full);
    }
    return out;
}

/** Saf denetim — testlenebilir: { file (göreli), text } → ihlaller. */
export function findViolations(files) {
    const found = [];
    for (const { file, text } of files) {
        const lines = text.split(/\r?\n/);
        lines.forEach((line, i) => {
            for (const rule of RULES) {
                if (rule.allow?.(file)) continue;
                if (rule.re.test(line)) found.push({ file, line: i + 1, rule: rule.id, msg: rule.msg });
            }
        });
    }
    return found;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
    const files = [...walk(FUNCTIONS), ...walk(SRC)].map((full) => ({
        file: relative(ROOT, full).split(sep).join('/'),
        text: readFileSync(full, 'utf8'),
    }));
    const violations = findViolations(files);
    if (violations.length > 0) {
        console.error(`❌ Şirket yolu denetimi: ${violations.length} ihlal`);
        for (const v of violations) console.error(`  ${v.file}:${v.line} [${v.rule}] ${v.msg}`);
        process.exit(1);
    }
    console.log(`✅ Şirket yolu denetimi: ${files.length} dosya temiz`);
}
