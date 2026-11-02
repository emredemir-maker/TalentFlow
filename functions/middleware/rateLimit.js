// Rate limiters — all three live here so the request-throttling story is in
// one place.
//
//   generalLimiter: blanket 200 req / 15 min — applied globally in server.js
//   aiLimiter:      20 req / min / (şirket:kullanıcı | IP) — gates Gemini-backed routes
//                   (/api/ai/*, /process-cv, /direct-add, /gemini-stt,
//                    /score-screening-answers, /suggest-screening-questions,
//                    /improve-screening-question)
//   sessionLimiter: 60 req / min — for the public live-interview heartbeat
//                                  endpoints; tight enough to block sessionId
//                                  enumeration, loose enough for normal polling.
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * AI sınırının anahtarı. Kimlik/şirket çözüldükten SONRA konulduğunda
 * (req.aiContext) `şirket:kullanıcı`: aynı ofisin NAT'ı arkasındaki
 * kullanıcılar birbirinin payını yemez, bir kullanıcı da IP değiştirerek
 * sınırı aşamaz. Aday tarafı (anonim) `şirket:anon:IP`. Bağlam yoksa
 * (kimlikten önce konulmuşsa) eskisi gibi IP.
 * Not: bellek içi ve sunucu örneği başına; şirket genelinde dakikalık sınır
 * Firestore'da (services/aiQuota.js, perMinuteCalls).
 */
export function aiKey(req) {
    const ctx = req.aiContext;
    const ip = ipKeyGenerator(req.ip || '');
    if (ctx?.tenantId) return ctx.anonymous ? `${ctx.tenantId}:anon:${ip}` : `${ctx.tenantId}:${ctx.userKey}`;
    return ip;
}

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
    keyGenerator: aiKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'AI istek limiti aşıldı. Lütfen 1 dakika sonra tekrar deneyin.' },
});

export const sessionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla oturum sorgusu. Lütfen bekleyin.' }
});
