// CANLI MÜLAKAT AI KOTASI — mülakat başına, saat başına sayaç.
//
// İstemci canlı analizi 3 dakikada bir toplu çalıştırıyor ve saatte 20 ile
// sınırlıyor; takip sorusu da saatte 10. Ama istemci sınırı tek başına koruma
// değil: sayfa yenilenince sayaç sıfırlanır, değiştirilmiş bir istemci döngüyü
// sıklaştırabilir. Bu sayaç aynı sınırı sunucuda, mülakat kimliği + UTC saat
// anahtarıyla uygular.
//
// NEDEN SABİT SAAT, KAYAN PENCERE DEĞİL: istemci kayan 60 dakikalık pencereyle
// sayıyor. Kayan pencereye uyan bir istemci, herhangi bir sabit saat diliminde
// de sınırı aşamaz; yani dürüst istemci bu uçta hiç 429 görmez. Sabit saat
// tek bir doküman ve tek bir transaction demek — ucuz.
//
// NEDEN MÜLAKAT DOKÜMANI KONTROL EDİLİYOR: yalnız sayaç olsaydı, istemci her
// çağrıda uydurma bir kimlik göndererek her seferinde boş bir kova açardı.
// Kimlik gerçek bir /interviews dokümanına ait olmalı.

import { db as defaultDb } from '../config/firebaseAdmin.js';
import { childLogger } from './logger.js';

const log = childLogger('interviewAiQuota');

/** Saatlik sınırlar — istemcideki sabitlerle aynı (src/utils/liveInterviewBudget.js). */
export const INTERVIEW_AI_LIMITS = {
    analysis: 20, // canlı STAR analizi — otomatik + "Şimdi analiz et" birlikte
    followup: 10, // takip sorusu düğmesi
};

/** Kota uygulanan ölçüm etiketleri ve hangi kovaya yazıldıkları. */
export const LIVE_LABEL_KIND = {
    'interview-live': 'analysis',
    'interview-followup': 'followup',
};

// Firestore doküman kimliği olarak güvenli: eğik çizgi ve nokta yok.
// Gerçek kimlikler `iv-<uuid>` biçiminde.
const INTERVIEW_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidInterviewId(id) {
    return typeof id === 'string' && INTERVIEW_ID_RE.test(id);
}

/** UTC saat anahtarı: 2026-11-01T13 */
export function hourKey(date) {
    return date.toISOString().slice(0, 13);
}

/**
 * Bir canlı mülakat AI çağrısı için kotadan bir hak düşer.
 *
 * Hak Gemini çağrısından ÖNCE düşülür: aynı anda gönderilen istekler de
 * sayılsın diye. Çağrı başarısız olursa hak geri verilmez — istemci de
 * denemeyi sayıyor, iki taraf aynı şeyi sayar.
 *
 * @returns {Promise<{allowed: boolean, reason?: 'limit'|'not_found', used?: number, limit?: number}>}
 */
export async function consumeInterviewQuota({ interviewId, kind, now = new Date(), db = defaultDb }) {
    const limit = INTERVIEW_AI_LIMITS[kind];
    if (!limit) throw new Error(`bilinmeyen kota türü: ${kind}`);

    const interviewRef = db.doc(`interviews/${interviewId}`);
    const quotaRef = db.doc(`artifacts/talent-flow/public/data/interviewAiQuota/${interviewId}_${hourKey(now)}`);

    try {
        return await db.runTransaction(async (tx) => {
            const [interviewSnap, quotaSnap] = await Promise.all([tx.get(interviewRef), tx.get(quotaRef)]);
            if (!interviewSnap.exists) return { allowed: false, reason: 'not_found' };

            const used = Number(quotaSnap.exists ? quotaSnap.data()?.[kind] : 0) || 0;
            if (used >= limit) return { allowed: false, reason: 'limit', used, limit };

            tx.set(
                quotaRef,
                { interviewId, hour: hourKey(now), [kind]: used + 1, updatedAt: now.toISOString() },
                { merge: true }
            );
            return { allowed: true, used: used + 1, limit };
        });
    } catch (err) {
        // ALTYAPI HATASINDA AÇIK KALIR. Firestore'a ulaşılamadı diye süren bir
        // mülakatın canlı analizini kesmek, kotanın koruduğundan daha pahalı
        // bir arıza. Geri kalan frenler ayakta: aiLimiter (dakikada 20/IP) ve
        // aylık bütçe freni (services/aiBudget.js).
        log.warn({ err: err?.message, kind }, 'mülakat kotası okunamadı — çağrıya izin verildi');
        return { allowed: true };
    }
}
