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

/** Demo havuzunun ne olduğu — banttan ve giriş ekranından aynı metin okunuyor. */
export const DEMO_NOTICE =
    'Bu bir demo kurulumu. Havuzdaki kayıtların tamamı uydurma ve ortak: '
    + 'eklediğiniz her şeyi diğer ziyaretçiler de görür. Gerçek bir CV yüklemeyin.';

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
