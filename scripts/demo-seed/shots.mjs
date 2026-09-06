// TANITIM EKRAN GÖRÜNTÜLERİ — uydurma veriyle, elle değil.
//
// ── NEDEN SCRIPT ────────────────────────────────────────────────────────────
// Tanıtım sayfasındaki görüntüler gerçek adaylardan alınamaz: ekranlarda ad,
// e-posta, CV metni ve mülakat transkripti var. Bu script demo veri setiyle
// (dataset.mjs) çalışan bir yapıyı gezip görüntüleri üretiyor.
//
// Elle çekmeye göre farkı, tekrarlanabilir olması: ekran değiştiğinde
// görüntüler yeniden üretilir ve tanıtım sayfası ürünün bugünkü hâlini
// gösterir. Elle çekilen görüntüler birkaç sürüm sonra yalan söylemeye başlar.
//
// ── ÇALIŞTIRMA ─────────────────────────────────────────────────────────────
//   npm run build:e2e-auth          (mock-auth'lu yapı; Firebase'e çıkmaz)
//   npx vite preview --port 4174
//   node scripts/demo-seed/shots.mjs
//
// `?__demo=1` bayrağı, veri setini bağlamların içine enjekte eden geçici
// fikstürü açıyor. Fikstür depoda DURMUYOR — çekim bitince kaldırılıyor.

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.SHOT_BASE || 'http://localhost:4174';
const OUT = path.resolve('public/tanitim');

/** Çekilecek ekranlar. `wait` görüntü alınmadan önce beklenen metin. */
const SHOTS = [
    {
        file: 'aday-havuzu.png',
        url: '/adaylar',
        wait: 'Aday havuzu',
        // Tam sayfa DEĞİL: tanıtımda gösterilen şey ekranın ilk hâli, uzun bir
        // liste değil. Yükseklik kırpması kasıtlı.
        clip: { x: 0, y: 0, width: 1440, height: 620 },
    },
    {
        file: 'dogrulama.png',
        url: '/aday-detayi?aday=aday-zeynep',
        wait: 'Zeynep Aksoy',
        click: 'Doğrulama',
        clip: { x: 0, y: 0, width: 1440, height: 760 },
    },
    {
        file: 'cv-uyum.png',
        url: '/aday-detayi?aday=aday-zeynep',
        wait: 'Zeynep Aksoy',
        click: 'CV & Uyum',
        clip: { x: 0, y: 0, width: 1440, height: 760 },
    },
    {
        file: 'takvim.png',
        url: '/mulakatlar',
        wait: 'Takvim',
        // Ekran listeyle açılıyor; takvim görünümü bir tıkla geliyor.
        click: 'Takvim',
        clip: { x: 0, y: 0, width: 1440, height: 800 },
    },
];


const shots = [];

const browser = await chromium.launch();
const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    // 2× — tanıtım sayfası retina ekranda bulanık görünmesin.
    deviceScaleFactor: 2,
});

await mkdir(OUT, { recursive: true });

for (const shot of SHOTS) {
    const url = `${BASE}${shot.url}${shot.url.includes('?') ? '&' : '?'}__demo=1`;
    process.stdout.write(`→ ${shot.file}  ${url}\n`);
    await page.goto(url, { waitUntil: 'networkidle' });
    try {
        await page.getByText(shot.wait).first().waitFor({ timeout: 8000 });
    } catch {
        process.stdout.write(`   uyarı: "${shot.wait}" bulunamadı, yine de çekiliyor\n`);
    }
    if (shot.click) {
        try {
            await page.getByRole('button', { name: shot.click, exact: true }).first().click();
            await page.waitForTimeout(600);
        } catch {
            process.stdout.write(`   uyarı: "${shot.click}" düğmesine tıklanamadı
`);
        }
    }
    // Yazı tiplerinin ve geçişlerin oturması için kısa bekleme.
    await page.waitForTimeout(1200);
    const file = path.join(OUT, shot.file);
    await page.screenshot({ path: file, clip: shot.clip });
    shots.push(file);
}

await browser.close();
process.stdout.write(`\n${shots.length} görüntü yazıldı: ${OUT}\n`);
