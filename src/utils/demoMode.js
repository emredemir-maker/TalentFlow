// DEMO KURULUMU MU?
//
// Yapı zamanında karar veriliyor (`VITE_DEMO_MODE`), çalışma zamanında değil:
// değişken tanımsızsa Rollup ölü dalı tamamen atıyor ve üretim paketine demo
// koduna ait tek satır girmiyor.
//
// ── ARAYÜZ TARAFI TEK BAŞINA KORUMA DEĞİLDİR ────────────────────────────────
// Buradaki bayrak yalnızca GÖRÜNÜMÜ değiştiriyor: uyarı bandını gösteriyor,
// çalışmayacak düğmeyi gizliyor. Asıl kilit sunucuda
// (functions/middleware/demoMode.js) — uçlar herkese açık adreste duruyor ve
// düğmeyi gizlemek isteği engellemiyor.

export const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

/**
 * Demo havuzunun ne olduğu — banttan ve giriş ekranından aynı metin okunuyor.
 *
 * Metin, CV yüklemesi geçici hale getirildikten sonra değişti. Eskisi
 * "eklediğiniz her şeyi diğer ziyaretçiler de görür. Gerçek bir CV
 * yüklemeyin." diyordu; bu artık DOĞRU DEĞİL ve yanlış olduğu için de
 * zararlı: ziyaretçiye hâlâ bir risk varmış gibi anlatmak, olmayan bir
 * tehlikeden korkutup demonun en ikna edici kısmını denemesini engeller.
 * CV artık ne Storage'a ne havuza yazılıyor (bkz. utils/demoUpload.js).
 *
 * Havuzdaki HAZIR kayıtlar hâlâ ortak — onlar zaten uydurma.
 */
export const DEMO_NOTICE =
    'Bu bir demo kurulumu. Havuzdaki kayıtların tamamı uydurma ve ortak; '
    + 'yaptığınız değişiklikleri diğer ziyaretçiler de görür. Yüklediğiniz '
    + 'CV\'ler ise kaydedilmez — yalnızca analiz edilir, hiçbir yere yazılmaz.';

// ── PAYLAŞILAN DEMO HESABI ──────────────────────────────────────────────────
// Bu şifre GİZLİ DEĞİL: paylaşılan bir demo hesabına ait ve zaten herkese
// açık olması gerekiyor. Yapı zamanında geldiği için depoya yazılmıyor;
// değiştirmek isteyen secret'ı güncelleyip yeniden dağıtıyor.
//
// Üretim yapısında bu değişkenler tanımlı olmadığı için sabitler boş kalıyor
// ve giriş formu bugünkü gibi boş açılıyor.
export const DEMO_LOGIN = {
    email: import.meta.env.VITE_DEMO_LOGIN_EMAIL || '',
    password: import.meta.env.VITE_DEMO_LOGIN_PASSWORD || '',
};

/** Formu hazır doldurabilecek kadar bilgi var mı? */
export const HAS_DEMO_LOGIN = Boolean(IS_DEMO && DEMO_LOGIN.email && DEMO_LOGIN.password);
