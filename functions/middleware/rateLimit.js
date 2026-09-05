// Rate limiters — all three live here so the request-throttling story is in
// one place.
//
//   generalLimiter: blanket 200 req / 15 min — applied globally in server.js
//   aiLimiter:      20 req / min — gates Gemini-backed routes
//                   (/api/ai/*, /scrape, /process-cv, /direct-add, /gemini-stt,
//                    /score-screening-answers, /suggest-screening-questions,
//                    /improve-screening-question)
//   inviteLimiter:  10 req / hour — kimliksiz davetiye sorgusu (e-posta sayımına karşı)
//   sessionLimiter: 60 req / min — for the public live-interview heartbeat
//                                  endpoints; tight enough to block sessionId
//                                  enumeration, loose enough for normal polling.
import rateLimit from 'express-rate-limit';

export const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla istek gönderildi. Lütfen 15 dakika sonra tekrar deneyin.' }
});

export const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'AI istek limiti aşıldı. Lütfen 1 dakika sonra tekrar deneyin.' },
});

// DAVET SORGUSU AYRI VE DAR. Uç kimlik istemiyor (hesap henüz yok) ve
// "bu e-posta davetli mi" sorusunu cevaplıyor — yani bir sayım yüzeyi.
// Genel 200/15dk buna göre çok geniş: saatte 10 deneme, gerçek bir kayıt
// için fazlasıyla yeterli, liste taraması için işe yaramaz.
export const inviteLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla davetiye sorgusu. Lütfen bir süre sonra tekrar deneyin.' },
});

export const sessionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla oturum sorgusu. Lütfen bekleyin.' }
});
