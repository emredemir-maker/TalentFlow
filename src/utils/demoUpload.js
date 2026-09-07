// DEMO'DA CV YÜKLEME KOTASI.
//
// ── NEDEN KAYDETMİYORUZ ─────────────────────────────────────────────────────
// Demo havuzu ORTAK. Bir ziyaretçinin yüklediği CV, kaydedildiği anda diğer
// bütün ziyaretçilerin ekranına düşüyordu. Uyarı bandı "gerçek CV yüklemeyin"
// diyor ama uyarı bir kontrol değil: ürünü ciddiye alan biri onu elindeki
// gerçek bir CV ile dener. Yirmi kişilik bir grupta bu kesin olur.
//
// Çözüm izolasyon kurmak değil, HİÇ KAYDETMEMEK. Demo modunda CV:
//   • Storage'a yüklenmiyor,
//   • Firestore'a aday kaydı olarak yazılmıyor,
//   • yalnızca ayrıştırılıp skorlanıyor ve sonuç ekranda gösteriliyor.
//
// Böylece paylaşılan havuz sorunu da, saklama süresi/KVKK sorunu da ortadan
// kalkıyor — ortada saklanan kişisel veri yok. Demonun anlatmak istediği şey
// (CV'den yapı çıkarma + pozisyonla eşleştirme + gerekçe) tamamen duruyor.
//
// ── NEDEN 3 ─────────────────────────────────────────────────────────────────
// Her CV en az iki AI çağrısı demek (ayrıştırma + eşleşme analizi). Günlük
// token tavanı sonunda durdurur, ama tavanın tamamı tek bir ziyaretçiye
// gidebilir ve demo günün geri kalanında ölü kalır. Üç CV, ürünü anlamaya
// yeter; bir günü tüketmeye yetmez.
//
// ── NEDEN sessionStorage ────────────────────────────────────────────────────
// Kota bir güvenlik sınırı değil, nezaket sınırı: sekmeyi kapatan ya da gizli
// pencere açan biri sıfırlar. Bunu localStorage'a yazmak da engellemezdi —
// gerçek maliyet koruması sunucudaki günlük token tavanı (services/aiBudget.js).
// Buradaki sayaç, sıradan bir ziyaretçinin demoyu farkında olmadan
// tüketmesini önlüyor.

const ANAHTAR = 'tf_demo_cv_sayaci';

/** Demo oturumunda ayrıştırılabilecek en fazla CV. */
export const DEMO_CV_LIMITI = 3;

/**
 * sessionStorage her ortamda okunamıyor: gizli pencere, site verisi kapalı
 * tarayıcı, gömülü görünümler. Erişimin KENDİSİ hata fırlatabildiği için
 * her okuma/yazma sarmalanıyor. Kota okunamazsa kullanılmamış sayılıyor —
 * ziyaretçiyi, bizim ölçemediğimiz bir şey yüzünden dışarıda bırakmak
 * yanlış olurdu.
 */
function oku() {
    try {
        const ham = window.sessionStorage.getItem(ANAHTAR);
        const n = Number.parseInt(ham ?? '', 10);
        return Number.isInteger(n) && n > 0 ? n : 0;
    } catch {
        return 0;
    }
}

function yaz(n) {
    try {
        window.sessionStorage.setItem(ANAHTAR, String(n));
    } catch {
        // Yazamıyorsak kota takip edilemiyor demektir; sunucudaki günlük
        // tavan yine devrede. Sessizce geçiyoruz.
    }
}

/** Bu oturumda kaç CV ayrıştırıldı. */
export function kullanilanKota() {
    return Math.min(oku(), DEMO_CV_LIMITI);
}

/** Kaç CV hakkı kaldı. */
export function kalanKota() {
    return Math.max(0, DEMO_CV_LIMITI - kullanilanKota());
}

/** Ayrıştırılan CV'leri sayaca ekler. */
export function kotaDus(adet) {
    // `Number(adet)` ile başlamıyoruz BİLEREK: `Number(null)` 0, `Number('2')`
    // 2 döner ve ikisi de `Number.isInteger`'dan geçer. Bu kod tabanında aynı
    // dönüşüm daha önce üç kez hataya yol açtı. Sayaç yalnızca gerçek bir
    // sayıyla artıyor.
    if (typeof adet !== 'number' || !Number.isInteger(adet) || adet < 1) return;
    yaz(Math.min(kullanilanKota() + adet, DEMO_CV_LIMITI));
}

/**
 * Seçilen dosyaları kalan kotaya göre ikiye ayırır.
 *
 * Elenenleri de döndürüyor ki ekran "3 dosyadan 1'i alındı" diyebilsin.
 * Sessizce kırpmak, ziyaretçinin yüklediğini sandığı bir CV'nin hiç
 * işlenmediğini fark etmemesine yol açardı.
 */
export function kotayaGoreAyir(dosyalar) {
    const liste = Array.isArray(dosyalar) ? dosyalar : [];
    const hak = kalanKota();
    return { alinan: liste.slice(0, hak), elenen: liste.slice(hak) };
}

/** Sayacı sıfırlar — testler ve "demoyu baştan dene" akışı için. */
export function kotaSifirla() {
    try {
        window.sessionStorage.removeItem(ANAHTAR);
    } catch {
        // yoksay
    }
}
