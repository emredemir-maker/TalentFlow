// DEMO MODU — paylaşılan kurulumda dışarı çıkan her şeyi kapatır.
//
// ── NEDEN SUNUCUDA ──────────────────────────────────────────────────────────
// Arayüzde düğmeyi gizlemek yetmez: uçlar herkese açık adreste duruyor ve
// giriş yapmış bir ziyaretçi tarayıcı konsolundan doğrudan çağırabilir.
// Kapatma, isteğin geçtiği tek yerde olmalı.
//
// ── EN ÖNEMLİSİ E-POSTA ─────────────────────────────────────────────────────
// Uygulama aday davetleri, bilgi talepleri ve geri bildirim mesajları
// gönderiyor; gönderen adres kurulumu işletenin kendi hesabı (EMAIL_USER).
// Demo açıkken bir ziyaretçi istediği adrese o hesaptan mesaj attırabilir.
// Bu bir maliyet meselesi değil, kötüye kullanım kapısı: hesabın spam
// göndermek için kullanılması, alan adının itibarını da yakar.
//
// ── İKİNCİSİ TOPLU YÜKLEME ──────────────────────────────────────────────────
// Tek istekte 20 CV, her biri ayrı bir AI çağrısı. Günlük token tavanı bunu
// sonunda durdurur ama tavanın tamamı tek bir ziyaretçinin merakına gidebilir
// ve demo günün geri kalanında ölü kalır.
//
// ── NE KAPATMIYOR ───────────────────────────────────────────────────────────
// Tek aday ekleme, CV ayrıştırma, skorlama, doğrulama, mülakat planı ve
// raporlar AÇIK. Demonun anlatmaya çalıştığı şey bunlar; kapatırsak geriye
// "bak ama dokunma" kalır ve ürünün en ikna edici kısmı gösterilemez.
// Maliyet tarafını services/aiBudget.js'teki günlük tavanlar tutuyor.

import { childLogger } from '../services/logger.js';

const log = childLogger('demoMode');

/** Demo kurulumu mu? Değişken yoksa HAYIR — üretim davranışı varsayılan. */
export function isDemoMode() {
    return String(process.env.DEMO_MODE || '').trim().toLowerCase() === 'true';
}

/**
 * Demoda kapalı uçlar.
 *
 * Tam yol yerine ÖNEK eşleşmesi: `/api/send-invite`, `/api/send-info-request`
 * gibi uçların hepsi aynı önekten geçiyor ve email.js'e yarın eklenecek bir
 * `/api/send-...` ucu da otomatik olarak kapalı doğuyor. Tek tek saymak,
 * listeye eklenmesi unutulan bir ucun sessizce açık kalması demekti.
 */
const BLOCKED_PREFIXES = [
    { prefix: '/api/send-', reason: 'E-posta gönderimi' },
    { prefix: '/api/bulk-import', reason: 'Toplu CV yükleme' },
    // Aday yanıt ucu da e-posta üretiyor (İK'ya bildirim).
    { prefix: '/api/candidate-respond', reason: 'Aday yanıt bildirimi' },
    { prefix: '/api/check-info-replies', reason: 'Gelen kutusu okuma' },
];

/** GET güvenli: iş durumunu okumak dışarı bir şey göndermiyor. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Demoda kapalı bir uca gelen isteği 403 ile döndürür.
 *
 * Sessizce başarı dönmüyor: arayüz "gönderildi" deyip hiçbir şey göndermezse
 * kullanıcı e-postanın yolda olduğunu sanır. Sebebi söyleyen açık bir hata,
 * demoda doğru davranış.
 */
export function demoBlock(req, res, next) {
    if (!isDemoMode() || SAFE_METHODS.has(req.method)) return next();

    const hit = BLOCKED_PREFIXES.find((b) => req.path.startsWith(b.prefix));
    if (!hit) return next();

    log.info({ path: req.path }, 'demo modunda kapalı uç reddedildi');
    return res.status(403).json({
        error: `${hit.reason} bu demo kurulumunda kapalı. `
            + 'Kendi kurulumunuzda bu özellik çalışıyor.',
        demoMode: true,
    });
}
