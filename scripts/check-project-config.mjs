#!/usr/bin/env node
// FIREBASE PROJE / SİTE KORUMASI — CI ve dağıtım bu kontrolden geçmeden ilerlemez.
//
// ── NEDEN VAR ────────────────────────────────────────────────────────────────
// Üretim, eski şirketin Google organizasyonundaki `talentflow-84bb6` projesinden
// kişisel hesaptaki bir projeye taşınıyor (veri taşınmadan, temiz kurulum).
// Hedef iki değerle tanımlı ve her biri TEK yerde duruyor:
//   - proje kimliği  → `.firebaserc` → projects.default
//   - Hosting sitesi → `firebase.json` → hosting.site
// Proje başka işlerle paylaşılan, yeniden kullanılan bir proje olduğu için
// uygulama projenin varsayılan sitesine değil, ADLI bir siteye dağıtılıyor;
// adres (https://<site>.web.app) site adından türetiliyor.
//
// Betik şu hataları yakalıyor:
//   1. Yer tutucu (`NEW_PROJECT_ID`) ya da eski proje kimliği .firebaserc'de.
//   2. firebase.json'da site yok — dağıtım projenin varsayılan sitesine (başka
//      bir uygulamanın adresine) giderdi.
//   3. Eski kimlik / eski web uygulamasının numarası koda geri sızmış — yeni
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

// Bir daha HİÇBİR çalışan dosyada görünmemesi gereken değerler: eski projenin
// kimliği (aynı zamanda eski site adı) ve eski web uygulamasının gönderici
// numarası (appId bunu içeriyor).
export const RETIRED_VALUES = ['talentflow-84bb6', '132883257197'];

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
export function productionSiteProblem(config, file = 'firebase.json') {
    const hosting = hostingEntries(config);
    if (hosting.length !== 1) return `${file} → tam olarak bir hosting girdisi bekleniyor (${hosting.length} var).`;
    const site = hosting[0].site;
    if (!site) {
        return `${file} → hosting.site tanımlı değil. Proje paylaşılıyor; uygulama adlı bir siteye dağıtılmalı.`;
    }
    if (site === PLACEHOLDER || RETIRED_VALUES.includes(site)) return `${file} → hosting.site eski/yer tutucu: "${site}".`;
    if (!SITE_ID_RE.test(site)) return `${file} → hosting.site geçerli bir site kimliği değil: "${site}".`;
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
        const p = productionSiteProblem(cfg);
        if (p) problems.push(p);
        else site = hostingEntries(cfg)[0].site;
    } catch (err) {
        problems.push(`firebase.json okunamadı: ${err.message}`);
    }
    try {
        const p = demoSiteProblem(JSON.parse(read('firebase.demo.json')));
        if (p) problems.push(p);
    } catch (err) {
        problems.push(`firebase.demo.json okunamadı: ${err.message}`);
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
