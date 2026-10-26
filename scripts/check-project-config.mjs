#!/usr/bin/env node
// FIREBASE PROJE / SİTE KORUMASI — CI ve dağıtım bu kontrolden geçmeden ilerlemez.
//
// ── NEDEN VAR ────────────────────────────────────────────────────────────────
// Üretim, eski şirketin Google organizasyonundaki `talentflow-84bb6` projesinden
// önce `deploy-n8n-local`'e taşındı; o projenin (ve diğer yedek projenin)
// Hosting arka ucu Google tarafında bozuk çıktı. TalentFlow şimdi Hub-Inn
// platform projesinde (`agentinn-nyqpx`) — veri taşınmadan, temiz kurulum.
// Hedef iki değerle tanımlı ve her biri TEK yerde duruyor:
//   - proje kimliği  → `.firebaserc` → projects.default
//   - Hosting sitesi → `firebase.json` → hosting.site
// Proje Hub-Inn ve CX-Inn ile PAYLAŞILIYOR. Projenin varsayılan sitesi
// (agentinn-nyqpx) Hub-Inn'in, `cxinn` CX-Inn'in; TalentFlow kendi adlı
// sitesine dağıtılıyor ve adres (https://<site>.web.app) site adından türüyor.
// Fonksiyon da kendi codebase'inde (`talentflow`): Hub-Inn'in `api`
// codebase'ine ve aynı adlı fonksiyonuna dokunulmamalı.
//
// Betik şu hataları yakalıyor:
//   1. Yer tutucu (`NEW_PROJECT_ID`) ya da eski proje kimliği .firebaserc'de.
//   2. firebase.json'da site yok, birden fazla hosting girdisi var, ya da site
//      başka bir uygulamanınki (projenin varsayılan sitesi, cxinn, eski site).
//   3. Fonksiyonlar `talentflow` codebase'inde değil ya da /api/** yönlendirmesi
//      TalentFlow'un fonksiyonuna (talentflowApi, europe-west1) gitmiyor —
//      ör. "api" yazılırsa istekler Hub-Inn'in fonksiyonuna giderdi.
//   4. Eski kimlik / eski web uygulamasının numarası koda geri sızmış — yeni
//      kurulum sessizce eski projenin Auth/Firestore'una konuşurdu.
//
// Kullanım:
//   node scripts/check-project-config.mjs              # denetle, sorun varsa çık(1)
//   node scripts/check-project-config.mjs --print      # denetle + proje kimliğini yazdır
//   node scripts/check-project-config.mjs --print-site # denetle + site adını yazdır
//   node scripts/check-project-config.mjs --demo-only ID
//        # yalnızca demo kimliğini denetle (demo workflow'ları; üretim
//        # yapılandırmasındaki bir sorun demo dağıtımını engellemesin diye ayrı)
//
// Geçmiş kayıtlar (scripts/legacy, docs/) taranmıyor: oradaki eski kimlikler
// tarihçe, değiştirilmeleri istenmiyor.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

export const PLACEHOLDER = 'NEW_PROJECT_ID';

// Bir daha HİÇBİR çalışan dosyada görünmemesi gereken değerler: eski projelerin
// kimlikleri (talentflow-84bb6 aynı zamanda eski site adı), eski web
// uygulamasının gönderici numarası (appId bunu içeriyor) ve Hosting'i bozuk
// çıkan ara projenin site adı.
export const RETIRED_VALUES = ['talentflow-84bb6', '132883257197', 'deploy-n8n-local', 'talentinn-app'];

// Paylaşılan projede başka uygulamalara ait Hosting siteleri: TalentFlow buraya
// dağıtılırsa o uygulamanın yayındaki sürümünün üzerine yazar. Projenin
// varsayılan sitesi (site kimliği = proje kimliği) ayrıca reddediliyor.
export const FOREIGN_SITES = ['agentinn-nyqpx', 'cxinn'];

// Fonksiyonun tek tanımı functions/index.js; codebase firebase.json'da.
export const FUNCTIONS_CODEBASE = 'talentflow';
export const API_FUNCTION_ID = 'talentflowApi';
export const API_FUNCTION_REGION = 'europe-west1';

// Google Cloud proje kimliği kuralı: 6-30 karakter, küçük harfle başlar,
// küçük harf/rakam/tire, tireyle bitmez.
const PROJECT_ID_RE = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
// Hosting site kimliği: küçük harf/rakam/tire, harf ya da rakamla başlar/biter.
const SITE_ID_RE = /^[a-z0-9][a-z0-9-]{2,61}[a-z0-9]$/;

// Bu dosyalar eski/yer tutucu değerleri BİLEREK adıyla anıyor.
const SCAN_ALLOWLIST = new Set([
    'scripts/check-project-config.mjs',
    'tests/check-project-config.test.js',
    'scripts/setup-new-project.sh',
]);
const SCAN_SKIP_PREFIXES = ['scripts/legacy/', 'docs/', '.firebase/'];
const SCAN_SKIP_FILES = new Set(['package-lock.json', 'functions/package-lock.json']);
const SCAN_SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|otf|zip|mp3|mp4|wav)$/i;

/** Kimlik geçerli mi? Hata metni döner; geçerliyse null. */
export function validateProjectId(id, label = 'Proje kimliği') {
    if (!id) return `${label} tanımlı değil.`;
    if (id === PLACEHOLDER) {
        return `${label} hâlâ yer tutucu (${PLACEHOLDER}). Firebase projesinin kimliğini yazın.`;
    }
    if (RETIRED_VALUES.includes(id)) {
        return `${label} eski projeyi gösteriyor (${id}). Bu proje artık kullanılmıyor.`;
    }
    if (!PROJECT_ID_RE.test(id)) return `${label} geçerli bir Google Cloud proje kimliği değil: "${id}".`;
    return null;
}

/** Demo kimliği: genel kurallar + "demo" içermeli (seed.mjs aynı şartı arıyor). */
export function validateDemoProjectId(id) {
    const err = validateProjectId(id, 'Demo proje kimliği (DEMO_FIREBASE_PROJECT_ID)');
    if (err) return err;
    if (!/demo/i.test(id)) {
        return `Demo proje kimliği "demo" içermiyor (${id}); tohumlama betiği bu projede çalışmayı reddeder.`;
    }
    return null;
}

const hostingEntries = (config) =>
    Array.isArray(config.hosting) ? config.hosting : [config.hosting].filter(Boolean);

/**
 * Üretim config'i (firebase.json): tek bir hosting girdisi ve adlı bir site
 * ŞART. Site adı yoksa dağıtım paylaşılan projenin varsayılan sitesine gider.
 * Hata metni döner; geçerliyse null.
 */
export function productionSiteProblem(config, file = 'firebase.json', projectId = '') {
    const hosting = hostingEntries(config);
    if (hosting.length !== 1) return `${file} → tam olarak bir hosting girdisi bekleniyor (${hosting.length} var).`;
    const site = hosting[0].site;
    if (!site) {
        return `${file} → hosting.site tanımlı değil. Proje paylaşılıyor; uygulama adlı bir siteye dağıtılmalı.`;
    }
    if (site === PLACEHOLDER || RETIRED_VALUES.includes(site)) return `${file} → hosting.site eski/yer tutucu: "${site}".`;
    if (FOREIGN_SITES.includes(site) || (projectId && site === projectId)) {
        return `${file} → hosting.site "${site}" başka bir uygulamanın sitesi (Hub-Inn/CX-Inn ya da projenin varsayılan sitesi); dağıtım onun üzerine yazardı.`;
    }
    if (!SITE_ID_RE.test(site)) return `${file} → hosting.site geçerli bir site kimliği değil: "${site}".`;
    return null;
}

/**
 * Fonksiyonlar ve /api yönlendirmesi: tek functions girdisi, codebase
 * `talentflow`; hosting'deki her fonksiyon yönlendirmesi talentflowApi'ye
 * (europe-west1). Paylaşılan projede başka codebase'e ya da Hub-Inn'in `api`
 * fonksiyonuna giden bir yapılandırma ya onu değiştirir ya da TalentFlow
 * isteklerini ona yollar. Hata metni döner; geçerliyse null.
 */
export function productionFunctionsProblem(config, file = 'firebase.json') {
    const fns = Array.isArray(config.functions) ? config.functions : [config.functions].filter(Boolean);
    if (fns.length !== 1) return `${file} → tam olarak bir functions girdisi bekleniyor (${fns.length} var).`;
    if (fns[0].codebase !== FUNCTIONS_CODEBASE) {
        return `${file} → functions codebase "${fns[0].codebase || 'default'}"; "${FUNCTIONS_CODEBASE}" olmalı (paylaşılan projede yalnızca kendi codebase'imiz dağıtılır).`;
    }
    for (const h of hostingEntries(config)) {
        for (const r of h.rewrites || []) {
            if (r.function === undefined) continue;
            const id = typeof r.function === 'string' ? r.function : r.function?.functionId;
            // Dize biçiminde bölge üst düzey "region" alanında; yoksa CLI us-central1 varsayar.
            const region =
                (typeof r.function === 'string' ? r.region : r.function?.region) || 'us-central1';
            if (id !== API_FUNCTION_ID || region !== API_FUNCTION_REGION) {
                return `${file} → "${r.source}" yönlendirmesi ${id}@${region} fonksiyonuna gidiyor; ${API_FUNCTION_ID}@${API_FUNCTION_REGION} olmalı.`;
            }
        }
    }
    return null;
}

/**
 * Storage kuralları hangi bucket'a gidiyor? Bucket adı yazılmazsa CLI Firebase'den "varsayılan bucket"ı
 * soruyor; agentinn-nyqpx'te bu sorgu bucket var olduğu hâlde 404 dönüyor ve dağıtım duruyor. Bu yüzden
 * tek girdi ve projenin kendi bucket'ı (<proje>.firebasestorage.app ya da <proje>.appspot.com) zorunlu.
 * Hata metni döner; geçerliyse null.
 */
export function productionStorageProblem(config, projectId, file = 'firebase.json') {
    const st = config.storage;
    if (!Array.isArray(st) || st.length !== 1) {
        return `${file} → storage tek girdili dizi olmalı ve bucket adı açıkça yazılmalı ([{ "bucket": "...", "rules": "storage.rules" }]).`;
    }
    const allowed = [`${projectId}.firebasestorage.app`, `${projectId}.appspot.com`];
    if (!allowed.includes(st[0].bucket)) {
        return `${file} → storage.bucket "${st[0].bucket || ''}"; ${allowed.join(' ya da ')} olmalı.`;
    }
    if (!st[0].rules) return `${file} → storage.rules eksik.`;
    return null;
}

/**
 * functions/index.js gerçekten talentflowApi'yi europe-west1'de mi dışa
 * veriyor? firebase.json'daki yönlendirme ile kaynak ayrışırsa /api/** ya
 * boşa ya da başka bir uygulamanın fonksiyonuna gider. Hata metni; yoksa null.
 */
export function functionSourceProblem(source, file = 'functions/index.js') {
    if (!new RegExp(`export const ${API_FUNCTION_ID}\\s*=\\s*onRequest\\(`).test(source)) {
        return `${file} → "${API_FUNCTION_ID}" adlı onRequest dışa aktarımı yok (firebase.json yönlendirmesi bu adı bekliyor).`;
    }
    if (/export const api\s*=/.test(source)) {
        return `${file} → "api" adlı fonksiyon var; bu ad paylaşılan projede Hub-Inn'in fonksiyonu.`;
    }
    if (!new RegExp(`region:\\s*["']${API_FUNCTION_REGION}["']`).test(source)) {
        return `${file} → bölge ${API_FUNCTION_REGION} değil (firebase.json yönlendirmesi bu bölgeyi bekliyor).`;
    }
    return null;
}

/** Demo config'i: site sabitlenmemeli — demo hedefi tek yerde (repo değişkeni). */
export function demoSiteProblem(config, file = 'firebase.demo.json') {
    for (const h of hostingEntries(config)) {
        if (h && h.site) return `${file} → hosting.site sabitlenmiş ("${h.site}"). Kaldırın; demo hedefi --project'ten gelir.`;
    }
    return null;
}

/** Metinde yasaklı değerlerden biri geçiyor mu? Geçenleri döner. */
export function findForbidden(text) {
    return [...RETIRED_VALUES, PLACEHOLDER].filter((v) => text.includes(v));
}

function shouldScan(file) {
    if (SCAN_ALLOWLIST.has(file) || SCAN_SKIP_FILES.has(file)) return false;
    if (SCAN_SKIP_PREFIXES.some((p) => file.startsWith(p))) return false;
    if (SCAN_SKIP_EXT.test(file)) return false;
    return true;
}

function fail(problems) {
    for (const p of problems) process.stderr.write(`✗ ${p}\n`);
    process.stderr.write('Ayrıntı: docs/yeni-proje-kurulumu.md\n');
    process.exit(1);
}

function main(argv) {
    const demoOnly = argv.indexOf('--demo-only');
    if (demoOnly >= 0) {
        const err = validateDemoProjectId(argv[demoOnly + 1] || '');
        if (err) fail([err]);
        process.stdout.write(`✓ Demo proje kimliği tamam (${argv[demoOnly + 1]})\n`);
        return;
    }

    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const read = (f) => readFileSync(path.join(root, f), 'utf8');
    const problems = [];

    let projectId = '';
    try {
        projectId = JSON.parse(read('.firebaserc'))?.projects?.default || '';
    } catch (err) {
        problems.push(`.firebaserc okunamadı: ${err.message}`);
    }
    const idErr = validateProjectId(projectId, '.firebaserc → projects.default');
    if (idErr) problems.push(idErr);

    let site = '';
    try {
        const cfg = JSON.parse(read('firebase.json'));
        const p = productionSiteProblem(cfg, 'firebase.json', projectId);
        if (p) problems.push(p);
        else site = hostingEntries(cfg)[0].site;
        const f = productionFunctionsProblem(cfg);
        if (f) problems.push(f);
        const st = productionStorageProblem(cfg, projectId);
        if (st) problems.push(st);
    } catch (err) {
        problems.push(`firebase.json okunamadı: ${err.message}`);
    }
    try {
        const demoCfg = JSON.parse(read('firebase.demo.json'));
        const p = demoSiteProblem(demoCfg);
        if (p) problems.push(p);
        // Demo da aynı kaynaktan dağıtılıyor: yönlendirme fonksiyonun gerçek
        // adına/bölgesine gitmeli. Codebase demo projesinde serbest.
        const f = productionFunctionsProblem({ ...demoCfg, functions: [{ codebase: FUNCTIONS_CODEBASE }] }, 'firebase.demo.json');
        if (f) problems.push(f);
    } catch (err) {
        problems.push(`firebase.demo.json okunamadı: ${err.message}`);
    }

    try {
        const p = functionSourceProblem(read('functions/index.js'));
        if (p) problems.push(p);
    } catch (err) {
        problems.push(`functions/index.js okunamadı: ${err.message}`);
    }

    // Depodaki izlenen dosyalarda eski kimlik / yer tutucu taraması. .firebaserc
    // yukarıda ayrıca denetlendi; mesajı tekrarlamamak için atlanıyor.
    let files = [];
    try {
        files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
            .split('\0')
            .filter(Boolean);
    } catch {
        problems.push('git ls-files çalıştırılamadı; tarama yapılamadı.');
    }
    for (const f of files) {
        if (f === '.firebaserc' || !shouldScan(f)) continue;
        let text;
        try {
            text = read(f);
        } catch {
            continue; // silinmiş ama henüz commit'lenmemiş dosya
        }
        for (const v of findForbidden(text)) problems.push(`${f} içinde "${v}" geçiyor.`);
    }

    if (problems.length) fail(problems);
    if (argv.includes('--print')) process.stdout.write(projectId);
    else if (argv.includes('--print-site')) process.stdout.write(site);
    else process.stdout.write(`✓ Firebase yapılandırması tamam (proje ${projectId}, site ${site})\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2));
}
