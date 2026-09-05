// AI hatasını DOĞRU tavsiyeye çevirir.
//
// Canlıda görüldü: aylık harcama tavanı dolduğunda Gemini 429 döndürüyor ve
// arayüz "Dakikalık istek sınırına takılmış olabilirsiniz, 1 dakika bekleyip
// tekrar deneyin" diyordu. Kullanıcı bekledi, tekrar denedi, yine olmadı —
// çünkü beklemek bu hatayı çözmez. Yanlış tavsiye, hiç tavsiye vermemekten
// kötü: insanı çalışmayacak bir şeyi tekrar tekrar denemeye yolluyor.
//
// Aynı 429 kodu ÜÇ farklı duruma karşılık geliyor ve üçünün de çözümü farklı:
//   - dakikalık istek sınırı  → beklemek işe yarar
//   - günlük/aylık kota       → yarın ya da plan yükseltme
//   - harcama tavanı          → beklemek İŞE YARAMAZ, tavan yükseltilmeli
// Ayırt eden şey durum kodu değil, gövdedeki metin.

/**
 * @typedef {'budget'|'spend-cap'|'quota'|'rate-limit'|'auth'|'gateway'|null} AiErrorKind
 */

/**
 * KURULUMUN KENDİ GÜNLÜK BÜTÇESİ — Google'ın kotası değil.
 *
 * İkisini ayırmak şart, çünkü çözümleri farklı: Google kotasında plan
 * yükseltilir, bunda kurulumu işleten kişi sınırı değiştirir. Aynı kefeye
 * koymak, kullanıcıyı hiç ilgisi olmayan bir Google sayfasına yollardı.
 * Sunucu tarafındaki im: functions/services/aiBudget.js BUDGET_MARKER.
 */
const OWN_BUDGET = /AI_DAILY_BUDGET_EXCEEDED/;

/** Harcama tavanı — beklemekle geçmez, insan müdahalesi gerekir. */
const SPEND_CAP = /spending cap|spend cap|billing account has exceeded|harcama (üst )?(sınırı|tavanı)/i;

/** Gün/ay kotası — sıfırlanmasını beklemek ya da planı yükseltmek gerekir. */
const QUOTA = /quota exceeded|daily limit|RESOURCE_EXHAUSTED|kota/i;

/** Dakikalık hız sınırı — kısa bir bekleme gerçekten çözer. */
const RATE_LIMIT = /rate limit|too many requests|429/i;

const AUTH = /API key|API_KEY_INVALID|PERMISSION_DENIED|unauthorized|401|403/i;

const GATEWAY = /\b(500|502|503|504)\b|unavailable|overloaded|timeout|socket hang up|fetch failed/i;

/**
 * Hata metnini sınıflandırır ve ne yapılması gerektiğini söyler.
 *
 * Sıra ÖNEMLİ: harcama tavanı mesajı içinde "429" da geçiyor, önce o
 * denenmezse hız sınırı sanılır ve yanlış tavsiye verilir — canlıdaki hata
 * tam olarak buydu.
 *
 * @param {unknown} message
 * @returns {{kind: AiErrorKind, hint: string}}
 */
export function aiErrorHint(message) {
    const text = String(message ?? '');
    if (!text.trim()) return { kind: null, hint: '' };

    // EN BAŞTA: mesaj "token" ve "günlük" gibi kelimeler taşıyor, aşağıdaki
    // kota kalıbına da uyar ve yanlış tavsiye verilirdi.
    if (OWN_BUDGET.test(text)) {
        return {
            kind: 'budget',
            hint: 'Bu kurulum için belirlenmiş günlük AI bütçesi dolmuş — Google kotanızla '
                + 'ilgisi yok. Sayaç UTC gece yarısı sıfırlanır; daha yüksek bir sınır '
                + 'gerekiyorsa kurulumu işleten kişiye söyleyin.',
        };
    }
    if (SPEND_CAP.test(text)) {
        return {
            kind: 'spend-cap',
            hint: 'Google AI hesabınızın aylık harcama tavanı dolmuş. Beklemek bunu çözmez — '
                + 'AI Studio → Billing sayfasından tavanı yükseltmeniz gerekiyor.',
        };
    }
    if (QUOTA.test(text)) {
        return {
            kind: 'quota',
            hint: 'Günlük/aylık kota dolmuş görünüyor. Kota sıfırlanana kadar beklemeniz '
                + 'ya da planı yükseltmeniz gerekir.',
        };
    }
    if (RATE_LIMIT.test(text)) {
        return {
            kind: 'rate-limit',
            hint: 'Dakikalık istek sınırına takılmış olabilirsiniz; 1 dakika bekleyip tekrar deneyin.',
        };
    }
    if (AUTH.test(text)) {
        return {
            kind: 'auth',
            hint: 'API anahtarı geçersiz ya da yetkisiz. Ayarlar → API bölümünden anahtarı kontrol edin.',
        };
    }
    if (GATEWAY.test(text)) {
        return {
            kind: 'gateway',
            hint: 'Servise ulaşılamadı (geçici). Birkaç dakika sonra tekrar deneyin.',
        };
    }
    return { kind: null, hint: '' };
}

/**
 * Yeniden denemek bu hatayı çözebilir mi?
 *
 * Harcama tavanı ve yetki hataları için CEVAP HAYIR: üç kez denemek yalnızca
 * kullanıcıyı bekletir ve hiçbir şeyi değiştirmez.
 */
export function isRetryable(message) {
    const { kind } = aiErrorHint(message);
    // Günlük bütçe de tekrar denemeyle geçmez: sayaç gece yarısına kadar
    // yerinde duruyor ve her deneme aynı yanıtı alır.
    return kind !== 'spend-cap' && kind !== 'auth' && kind !== 'budget';
}
