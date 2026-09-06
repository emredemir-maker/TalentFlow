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
