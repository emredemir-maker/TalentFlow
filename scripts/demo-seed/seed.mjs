// DEMO KURULUMUNU TOHUMLAR — havuzu siler ve uydurma veriyle yeniden yazar.
//
// ── NE YAPIYOR ──────────────────────────────────────────────────────────────
//   1. Demo havuzundaki adayları ve ilanları siler
//   2. dataset.mjs'teki uydurma kayıtları yazar
//   3. Paylaşılan demo hesabını oluşturur/günceller (rol: recruiter)
//   4. settings/system'i demo değerleriyle yazar
//
// ── NEDEN SİLİP YENİDEN YAZIYOR ─────────────────────────────────────────────
// Demo havuzu ORTAK: ziyaretçilerin eklediği her kayıt diğerlerinde görünüyor.
// Üzerine ekleyerek tohumlamak, havuzu her turda biraz daha kalabalık ve
// biraz daha az anlaşılır bırakırdı. Her çalıştırma havuzu bilinen bir
// başlangıç noktasına döndürüyor — gecelik sıfırlama da bu script.
//
// ── NEDEN SÜPER ADMİN DEĞİL ─────────────────────────────────────────────────
// Paylaşılan hesabın rolü `recruiter`. Süper admin olsaydı ziyaretçiler API
// anahtarı ekranını, kullanım raporunu ve kullanıcı yönetimini görürdü —
// üçü de işletme bilgisi ve hiçbiri demonun anlatmak istediği şey değil.
//
// ── ÇALIŞTIRMA ─────────────────────────────────────────────────────────────
//   GOOGLE_APPLICATION_CREDENTIALS=<servis-hesabi.json> \
//   DEMO_PROJECT_ID=talentflow-demo-6b894 \
//   DEMO_USER_EMAIL=... DEMO_USER_PASSWORD=... \
//   node scripts/demo-seed/seed.mjs
//
// ÜRETİME KARŞI KORUMA: proje kimliği "demo" içermiyorsa script çalışmayı
// reddediyor. Yanlış kimlik bilgisiyle çalıştırılan bir tohumlama, gerçek
// aday havuzunu siler — geri dönüşü olmayan tek hata bu.

import admin from 'firebase-admin';
import { DEMO_CANDIDATES, DEMO_POSITIONS } from './dataset.mjs';

const BASE = 'artifacts/talent-flow/public/data';

// GÖRÜNMEZ KARAKTERLER KIRPILIYOR. GitHub secret'ına yapıştırırken sona bir
// satır sonu ya da boşluk karışması çok kolay ve secret değeri aynen
// saklanıyor. Kırpılmazsa hesabın şifresi o karakterle birlikte kaydediliyor:
// kullanıcı doğru şifreyi yazıyor, giriş "e-posta veya şifre hatalı" diyor ve
// hiçbir yerde bunu açıklayan bir iz kalmıyor. Canlıda tam olarak bu yaşandı.
const projectId = (process.env.DEMO_PROJECT_ID || '').trim();
const email = (process.env.DEMO_USER_EMAIL || '').trim();
const password = (process.env.DEMO_USER_PASSWORD || '').trim();

function bitir(mesaj) {
    process.stderr.write(`HATA: ${mesaj}\n`);
    process.exit(1);
}

if (!projectId) bitir('DEMO_PROJECT_ID tanımlı değil.');
// Tek satırlık bu denetim, script'in en önemli parçası.
if (!/demo/i.test(projectId)) {
    bitir(`Proje kimliği "demo" içermiyor (${projectId}). Bu script havuzu SİLİYOR; `
        + 'üretim projesine karşı çalıştırılmasını engellemek için reddedildi.');
}
if (!email || !password) bitir('DEMO_USER_EMAIL ve DEMO_USER_PASSWORD gerekli.');
if (password.length < 8) bitir('Demo şifresi en az 8 karakter olmalı.');

admin.initializeApp({ projectId });
const db = admin.firestore();
const auth = admin.auth();

/** Bir koleksiyonun tamamını siler — demo havuzu küçük, sayfalama gerekmiyor. */
async function koleksiyonuTemizle(yol) {
    const snap = await db.collection(yol).get();
    if (snap.empty) return 0;
    // 500 belgelik toplu yazma sınırı; demo havuzu bunun çok altında ama
    // ziyaretçiler kayıt eklediği için üst sınır belli değil.
    let silinen = 0;
    for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = db.batch();
        for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
        await batch.commit();
        silinen += Math.min(400, snap.docs.length - i);
    }
    return silinen;
}

async function yaz(yol, kayitlar) {
    const batch = db.batch();
    for (const k of kayitlar) {
        const { id, ...veri } = k;
        batch.set(db.doc(`${yol}/${id}`), { ...veri, demoSeed: true });
    }
    await batch.commit();
}

/** Paylaşılan demo hesabı — varsa şifresi tazeleniyor, yoksa oluşturuluyor. */
async function demoHesabi() {
    let user;
    try {
        user = await auth.getUserByEmail(email);
        await auth.updateUser(user.uid, { password, emailVerified: true });
    } catch (err) {
        if (err.code !== 'auth/user-not-found') throw err;
        user = await auth.createUser({
            email,
            password,
            emailVerified: true,
            displayName: 'Demo Kullanıcısı',
        });
    }

    await db.doc(`${BASE}/users/${user.uid}`).set({
        uid: user.uid,
        email: email.toLowerCase(),
        displayName: 'Demo Kullanıcısı',
        name: 'Demo Kullanıcısı',
        // recruiter — süper admin DEĞİL. Gerekçe dosyanın başında.
        role: 'recruiter',
        departments: [],
        status: 'active',
        demoSeed: true,
    }, { merge: true });

    return user.uid;
}

const log = (m) => process.stdout.write(`${m}\n`);

log(`Demo tohumlama · ${projectId}`);

const silinenAday = await koleksiyonuTemizle(`${BASE}/candidates`);
const silinenIlan = await koleksiyonuTemizle(`${BASE}/positions`);
log(`  silindi: ${silinenAday} aday, ${silinenIlan} ilan`);

await yaz(`${BASE}/candidates`, DEMO_CANDIDATES);
await yaz(`${BASE}/positions`, DEMO_POSITIONS);
log(`  yazıldı: ${DEMO_CANDIDATES.length} aday, ${DEMO_POSITIONS.length} ilan`);

// KAYIT KAPALI: allowedDomains boş bırakılıyor, yani paylaşılan hesap dışında
// kimse kendi hesabını açamıyor. Demo tek kiracılı bir havuz; ayrı hesaplar
// ayrı veri anlamına gelmiyor, yalnızca kontrolsüz bir kullanıcı listesi
// üretirdi.
await db.doc(`${BASE}/settings/system`).set({
    allowedDomains: [],
    demoSeed: true,
}, { merge: true });

const uid = await demoHesabi();
log(`  demo hesabı hazır: ${email} (${uid})`);

log('Tamam.');
process.exit(0);
