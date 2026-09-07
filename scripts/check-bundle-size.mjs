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
//
// Each entry: prefix → max gzipped KB. Multiple chunks matching a
// prefix are checked individually (e.g. several `index-*.js` files,
// though Vite typically emits one).
const BUDGETS = {
    // Main app entry — the only JS chunk every visitor downloads on
    // first paint. PR #35 shipped this at 73.1 KB gzip.
    //
    // 130 → 134 (PR #220). Ölçüm: main 129.5 KB, dal 130.9 KB — büyüme
    // 1.4 KB ve tamamı BİLEREK eager olan iki dosyadan geliyor:
    //
    //   components/ErrorBoundary.jsx  — ilk rota yüklenmeden ÖNCE var
    //     olmak zorunda; asıl işlerinden biri parça (chunk) yükleme
    //     hatasını yakalamak, dolayısıyla kendisi lazy olamaz.
    //   utils/normalizeCandidate.js   — CandidatesContext içinde, veri
    //     uygulamaya girerken çalışıyor.
    //
    // Bütçe zaten tavana dayanmıştı (main 129.5/130). 134 hem bu iki
    // dosyayı hem de ~3 KB organik büyüme payını karşılıyor. Bir sonraki
    // aşma gerçek bir inceleme istesin diye daha yükseğe çekilmedi.
    //
    // 134 → 138 (aday statüleri). Ölçüm: main 132.7 KB, dal 133.8 KB —
    // büyüme 1.1 KB ve kaynağı, `CandidatesContext` içinden eager olarak
    // çekilen üç küçük dosya: utils/pipelineStages (aşama tanımları),
    // utils/candidateTable (aşama çözümlemesi) ve utils/interviewSession.
    // Aşama süzgeci veri uygulamaya girerken çalıştığı için lazy olamıyor.
    // 138, aşma anında gerçek bir inceleme yapılmasını sağlayacak kadar dar.
    'index-': Number(process.env.BUDGET_INDEX_GZIP_KB) || 138,

    // Firebase SDK — app + auth + storage. Firestore ARTIK BURADA DEĞİL,
    // kendi parçasında (aşağıda). Ayrımın sebebi ölçümdü: tek parçadayken
    // "firebase büyüdü" diyebiliyorduk, hangisinin büyüdüğünü değil.
    //
    // 200 → 70. Bu bir GEVŞETME değil, sıkılaştırma: ölçüm 55.2 KB
    // (firebase 12.9.0) ve 53.0 KB (12.18.0) — auth/app/storage tarafı
    // büyümüyor, hatta hafif küçülüyor. 70, gerçek bir wildcard import
    // kazasını (firebase-functions gibi ağır bir alt paketin sızması)
    // yakalayacak kadar dar.
    'firebase-': Number(process.env.BUDGET_FIREBASE_GZIP_KB) || 70,

    // Firestore. İlk ağdaki EN AĞIR ikinci kalem ve kütüphanenin kendi
    // büyümesi burada yoğunlaşıyor.
    //
    // ÖLÇÜM (aynı kod, yalnızca sürüm farkı):
    //   firebase 12.9.0  → 104.8 KB gz
    //   firebase 12.18.0 → 161.0 KB gz   (+56.2 KB, %54)
    //
    // Artışın tamamı @firebase/firestore 4.11.0 → 4.17.1'den geliyor;
    // bizim eklediğimiz kod değil. Bütçe 175 ile 12.18.0'ı geçirecek
    // şekilde AÇIK — yani bir sürüm yükseltmesi bu kapıda durmasın diye
    // bilerek önden açıldı.
    //
    // ── TEMBEL YÜKLEME NEDEN YAPILMADI ───────────────────────────────
    // İlk düşünce firestore'u ilk rotadan çıkarmaktı. Ölçünce olmadığı
    // görüldü: AuthContext, onAuthStateChanged geri çağrısının İÇİNDE
    // doc()/onSnapshot çağırıyor — oturum çözülür çözülmez firestore
    // gerekiyor. Şu an auth ile firestore PARALEL iniyor; tembelleştirmek
    // bunu şelaleye çevirir (auth in → token doğrula → sonra 161 KB
    // inmeye başla) ve giriş yapmış kullanıcı için DAHA YAVAŞ olur.
    // Kazanç yalnızca giriş ekranını gören kullanıcıda kalırdı.
    //
    // Ayrıca 38 dosya `db`'yi config/firebase.js'ten doğrudan alıyor ve
    // initializeFirestore(persistentLocalCache) her firestore çağrısından
    // ÖNCE koşmak zorunda. O sıralamayı kaçıran bir refactor, IndexedDB
    // kalıcı önbelleğini sessizce bellek önbelleğine düşürür — daha önce
    // çözülmüş bir yavaşlık sorununu geri getirir.
    //
    // Bir sonraki aşmada doğru soru "bütçeyi yükseltelim mi" değil,
    // "firestore neden yine büyüdü ve bu sürümü almak zorunda mıyız".
    'firestore-': Number(process.env.BUDGET_FIRESTORE_GZIP_KB) || 175,

    // React + react-router. Tiny and stable; the budget exists mostly
    // to flag a runtime that flips into an unminified mode.
    'react-vendor-': Number(process.env.BUDGET_REACT_GZIP_KB) || 30,

    // lucide-react icon set. Tree-shaking should keep this small even
    // as we add icons; a regression here usually means a `*` re-export
    // somewhere defeating the shake.
    'icons-': Number(process.env.BUDGET_ICONS_GZIP_KB) || 25,
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
