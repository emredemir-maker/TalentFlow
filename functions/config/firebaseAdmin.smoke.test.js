// GERÇEK MODÜL YÜKLENİYOR — MOCK YOK. Testin bütün mesele olduğu yer bu.
//
// ── NEDEN VAR ───────────────────────────────────────────────────────────────
// İki kez aynı şey oldu: bir bağımlılık güncellemesi `firebase-admin`'i 14'e
// çıkardı, ana dal kırıldı ve CI BUNU GÖRMEDİ. Sürüm 14 eski "namespace"
// API'sini kaldırmış; `admin.apps` artık yok ve modül yüklenirken
// `Cannot read properties of undefined (reading 'length')` ile patlıyor.
//
// CI'ın görmemesinin sebebi şu: fonksiyon testlerinin HEPSİ
// `config/firebaseAdmin.js`'i `vi.mock` ile değiştiriyor. Birim testinde
// doğrusu da bu — gerçek Firebase'e bağlanmak istemiyoruz. Ama sonuç olarak
// gerçek modülün yüklenip yüklenmediğini kontrol eden hiçbir şey kalmıyordu.
//
// Hata ilk kez, dağıtımın "codebase analizi" adımında ortaya çıkıyordu:
// yani MERGE'DEN SONRA. İkinci seferinde bu, acil bir üretim düzeltmesinin
// canlıya çıkmasını engelledi.
//
// ── NE ÖLÇÜYOR ──────────────────────────────────────────────────────────────
// Ağa çıkmıyor, kimlik doğrulaması yapmıyor. Yalnızca modülün import
// edilebildiğini ve dışa verdiği tutamakların şeklinin doğru olduğunu
// söylüyor. Kırılma zaten import anında, ilk ağ çağrısından çok önce oluyor —
// ölçmek için gereken tek şey bu.
//
// ── NE ZAMAN KIRILIR ────────────────────────────────────────────────────────
// firebase-admin'in ana sürümü, kullandığımız API'yi kaldıracak şekilde
// değiştiğinde. O zaman düzeltmesi `docs/FIREBASE-ADMIN-14-GOCU.md` içinde
// yazıyor — sürümü geri almak değil, göçü yapmak.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// ── ORTAM DEĞİŞKENLERİ GERİ ALINIYOR ────────────────────────────────────────
// `process.env` test dosyaları arasında PAYLAŞILIYOR (modül kayıtları izole,
// süreç ortamı değil). İlk yazdığım hâlde bu test FIREBASE_CONFIG'i set edip
// bırakıyordu ve aynı işçide koşan cv testleri "Bucket name not specified"
// ile kararsız düşüyordu — süitin bir koşusu kırmızı, sonraki yeşil.
// Kararsız bir test, olmayan testten kötüdür: insanlara kırmızıyı yok saymayı
// öğretir. Ne dokunduysak geri koyuyoruz.
const YEDEK = {};
const AYARLAR = {
    // Gerçek değerler değil; hiçbir yere bağlanılmıyor. initializeApp'in
    // açıkça verilen seçeneklerle çalışması için yeterli.
    FIREBASE_CONFIG: JSON.stringify({
        projectId: 'smoke-test',
        storageBucket: 'smoke-test.appspot.com',
    }),
    VITE_FIREBASE_PROJECT_ID: 'smoke-test',
};

beforeAll(() => {
    for (const [ad, deger] of Object.entries(AYARLAR)) {
        YEDEK[ad] = process.env[ad];
        if (process.env[ad] === undefined) process.env[ad] = deger;
    }
});

afterAll(() => {
    for (const [ad, eskiDeger] of Object.entries(YEDEK)) {
        if (eskiDeger === undefined) delete process.env[ad];
        else process.env[ad] = eskiDeger;
    }
});

describe('firebaseAdmin gerçekten yükleniyor', () => {
    it('modül import edilebiliyor', async () => {
        const mod = await import('./firebaseAdmin.js');
        expect(mod).toBeTruthy();
    });

    it('Firestore tutamağı dışa veriliyor', async () => {
        const { db } = await import('./firebaseAdmin.js');
        expect(db).toBeTruthy();
        // Uygulama bu iki metodu her yerde kullanıyor; şekil değişirse
        // yüzlerce çağrı sessizce bozulur.
        expect(typeof db.collection).toBe('function');
        expect(typeof db.doc).toBe('function');
    });

    it('admin nesnesi kullandığımız API yüzeyini taşıyor', async () => {
        const { admin } = await import('./firebaseAdmin.js');
        expect(admin).toBeTruthy();
        // Kırılmanın tam olarak olduğu yer: 14'te `admin.apps` undefined.
        expect(Array.isArray(admin.apps)).toBe(true);
        expect(admin.apps.length).toBeGreaterThan(0);
        // Kod tabanı bunları da namespace üzerinden çağırıyor.
        expect(typeof admin.firestore).toBe('function');
        expect(typeof admin.auth).toBe('function');
        expect(typeof admin.storage).toBe('function');
        expect(admin.firestore.FieldValue).toBeTruthy();
    });

    it('ikinci import aynı uygulamayı veriyor — çift initializeApp yok', async () => {
        const bir = await import('./firebaseAdmin.js');
        const iki = await import('./firebaseAdmin.js');
        expect(bir.db).toBe(iki.db);
        expect(bir.admin.apps.length).toBe(1);
    });
});
