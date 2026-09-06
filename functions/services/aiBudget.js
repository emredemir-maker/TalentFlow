// GÜNLÜK AI BÜTÇESİ — ölçüm değil, FREN.
//
// ── NEDEN GEREKLİ ───────────────────────────────────────────────────────────
// services/usage.js her çağrının tokenını sayıyor ama hiçbir şeyi durdurmuyor.
// Canlıda aylık $2.000'lık Gemini tavanı doldu ve servis, kimse fark etmeden
// durdu. Ölçüm o olaydan sonra eklendi; "ne kadar harcadık" sorusunun cevabı
// artık var, "yeter, dur" diyen bir şey hâlâ yok.
//
// Bu, kurulum topluluğa açıldığında bir tercih meselesi olmaktan çıkıyor:
// paylaşılan bir demoda anahtar İŞLETMECİNİN, faturayı da o ödüyor. Tavanı
// Google'ın kesmesine bırakmak, faturayı tavan kadar ödemek demek.
//
// ── İKİ AYRI TAVAN, ÇÜNKÜ İKİ AYRI FATURA KALEMİ ────────────────────────────
//   AI_DAILY_TOKEN_LIMIT    — günlük toplam token
//   AI_DAILY_GROUNDED_LIMIT — günlük ARAMALI çağrı ADEDİ
//
// İkincisi şart: Google, arama destekli çağrıları (Grounding with Google
// Search) token'dan BAĞIMSIZ olarak istek başına faturalandırıyor. Aramalı bir
// çağrı az token yakıp çok fatura yazabiliyor, yani token tavanı bu kalemi
// GÖRMÜYOR. Şirket doğrulaması tam da bunu kullanıyor ve demo ortamında en
// kolay tetiklenen özellik.
//
// Aynı sebeple usage.js'teki maliyet tahmini de bu kalemi göstermiyor
// (PRICING yalnızca token fiyatı taşıyor) — ekranda "arama çağrısı" adedi ayrı
// gösteriliyor ki fatura ile rapor arasındaki fark görünür olsun.
//
// ── NE YAPMIYOR ─────────────────────────────────────────────────────────────
// Tek bir çağrıyı ortasından kesmiyor. Bir çağrının kaç token yakacağı ancak
// bittiğinde bilinir, dolayısıyla kural şu: "günün toplamı sınırı geçtiyse
// YENİ çağrı başlatma". Sınırı aşan son çağrı tamamlanır — yani gerçek
// tüketim sınırın bir miktar üstünde durabilir. Bunu bilerek kabul ediyoruz;
// alternatifi, yarım kalmış cevapları kullanıcıya hata olarak göstermek.
//
// ── VARSAYILAN KAPALI ───────────────────────────────────────────────────────
// Değişkenler tanımlı değilse ya da 0 ise fren yoktur ve davranış bugünküyle
// birebir aynıdır. Mevcut kurulumun çalışma biçimini bir ortam değişkeni
// sessizce değiştirmemeli; freni isteyen açar.
//
// Token sınırı TOKEN cinsinden, çünkü ölçtüğümüz şey bu. Para karşılığı bir
// TAHMİN (bkz. usage.js PRICING: fiyatlar değişir) ve tahmine dayanarak
// servisi durdurmak istemedik. Kabaca çevirmek için: gemini-2.5-flash'ta 1M
// çıktı token'ı ≈ $2.50, 1M girdi ≈ $0.30. Günde ~$5'lık bir tavan için
// 2_000_000 iyi bir başlangıç.

import { db } from '../config/firebaseAdmin.js';
import { childLogger } from './logger.js';
import { dayKey, estimateCost } from './usage.js';

const log = childLogger('aiBudget');

/** Firestore'a en fazla bu sıklıkta sorulur — her AI çağrısında değil. */
const REFRESH_MS = 60_000;

/** Hatanın makine tarafında tanınması için sabit im. */
export const BUDGET_MARKER = 'AI_DAILY_BUDGET_EXCEEDED';

/**
 * Ortam değişkenini pozitif tam sayıya çevirir.
 *
 * Sayı olmayan değer 0 döndürüyor VE loglanıyor: "AI_DAILY_TOKEN_LIMIT=iki
 * milyon" yazan biri freni kurduğunu sanıp korumasız kalırdı.
 */
function limitFromEnv(name) {
    const raw = process.env[name];
    if (raw === undefined || raw === null || String(raw).trim() === '') return 0;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
        log.warn({ name, raw }, 'sınır sayı değil — bu fren KAPALI');
        return 0;
    }
    return Math.floor(n);
}

/**
 * Yürürlükteki günlük sınırlar.
 *
 * Her çağrıda okunuyor (modül yüklenirken bir kez değil): testler değeri
 * değiştirebilsin ve dağıtım sonrası değişiklik yeniden başlatma beklemesin.
 *
 * @returns {{tokens: number, groundedCalls: number}} 0 = o fren kapalı
 */
export function budgetLimits() {
    return {
        tokens: limitFromEnv('AI_DAILY_TOKEN_LIMIT'),
        groundedCalls: limitFromEnv('AI_DAILY_GROUNDED_LIMIT'),
    };
}

// Günün harcaması — Firestore'a her çağrıda gitmemek için bellekte tutuluyor.
// Süreç başına ayrı; birden fazla örnek çalışıyorsa her biri kendi payını
// sayar ve gerçek toplam ancak yenilemede görünür. Bu yüzden yenileme aralığı
// kısa: sapma en fazla bir dakikalık trafik kadar olabilir.
let cache = { day: null, tokens: 0, groundedCalls: 0, at: 0 };

/** Testler için — modül durumu sıfırlanır. */
export function resetBudgetCache() {
    cache = { day: null, tokens: 0, groundedCalls: 0, at: 0 };
}

/** Ölçüm dokümanını okur. Aramalı çağrı adedi `byLabel.grounded.calls`. */
async function fetchTodayFromFirestore(day) {
    const snap = await db.doc(`artifacts/talent-flow/public/data/usage/${day}`).get();
    const d = snap.data() || {};
    return {
        tokens: Number(d?.totals?.totalTokens) || 0,
        groundedCalls: Number(d?.byLabel?.grounded?.calls) || 0,
    };
}

/**
 * Günün tüketimini döndürür; gerekiyorsa Firestore'dan tazeler.
 *
 * @param {Date} now
 * @param {(day: string) => Promise<{tokens: number, groundedCalls: number}>} fetchToday
 * @returns {Promise<{tokens: number, groundedCalls: number}>}
 */
export async function todayUsage(now, fetchToday = fetchTodayFromFirestore) {
    const day = dayKey(now);
    const sameDay = cache.day === day;
    if (sameDay && Date.now() - cache.at < REFRESH_MS) {
        return { tokens: cache.tokens, groundedCalls: cache.groundedCalls };
    }

    try {
        const uzak = await fetchToday(day);
        // YEREL SAYIM KAYBOLMASIN. Firestore'daki yazma gecikmeli
        // (recordUsage beklenmiyor); tazeleme sırasında elimizdeki sayı
        // sunucudakinden büyükse büyüğü tutuyoruz, yoksa fren bir dakikalık
        // trafiği görmezden gelir.
        cache = {
            day,
            tokens: sameDay ? Math.max(uzak.tokens, cache.tokens) : uzak.tokens,
            groundedCalls: sameDay ? Math.max(uzak.groundedCalls, cache.groundedCalls) : uzak.groundedCalls,
            at: Date.now(),
        };
    } catch (err) {
        // ÖLÇÜM HATASI SERVİSİ DURDURMAZ — usage.js ile aynı kural. Okuyamadık
        // diye "bütçe doldu" demek, çalışan bir kurulumu kapatmak olurdu.
        log.warn({ err: err.message }, 'günlük kullanım okunamadı — eldeki sayıyla devam');
        if (!sameDay) cache = { day, tokens: 0, groundedCalls: 0, at: Date.now() };
    }
    return { tokens: cache.tokens, groundedCalls: cache.groundedCalls };
}

/**
 * Biten bir çağrının tüketimini yerel sayaca ekler.
 *
 * Firestore'a yazma zaten `recordUsage` ile yapılıyor ama beklenmiyor; iki
 * tazeleme arasında freni ayakta tutan şey bu yerel toplam.
 *
 * @param {{totalTokens?: number, grounded?: boolean, now?: Date}} input
 */
export function noteSpend({ totalTokens = 0, grounded = false, now = new Date() } = {}) {
    const day = dayKey(now);
    if (cache.day !== day) cache = { day, tokens: 0, groundedCalls: 0, at: Date.now() };
    const n = Number(totalTokens);
    if (Number.isFinite(n) && n > 0) cache.tokens += n;
    if (grounded) cache.groundedCalls += 1;
}

/**
 * Bütçe doluysa hata fırlatır.
 *
 * @param {{grounded?: boolean, now?: Date, fetchToday?: Function}} input
 *   grounded — aramalı çağrı mı? Öyleyse ADET tavanı da denetlenir.
 * @throws {Error} mesajı BUDGET_MARKER içerir — arayüz bunu Google'ın
 *   kotasından ayırt edip doğru tavsiyeyi verebilsin diye (utils/aiErrorHint).
 */
export async function assertWithinBudget({ grounded = false, now = new Date(), fetchToday } = {}) {
    const limits = budgetLimits();
    const denetlenecek = limits.tokens > 0 || (grounded && limits.groundedCalls > 0);
    if (!denetlenecek) return;

    const used = await todayUsage(now, fetchToday || fetchTodayFromFirestore);

    if (grounded && limits.groundedCalls > 0 && used.groundedCalls >= limits.groundedCalls) {
        log.warn({ used: used.groundedCalls, limit: limits.groundedCalls }, 'günlük aramalı çağrı sınırı doldu');
        throw new Error(
            `${BUDGET_MARKER}: Bu kurulumun günlük aramalı arama sınırı doldu `
            + `(${used.groundedCalls} / ${limits.groundedCalls} çağrı). `
            + 'Arama destekli çağrılar token dışında ayrıca faturalanır. '
            + 'Sayaç UTC gece yarısı sıfırlanır.'
        );
    }

    if (limits.tokens > 0 && used.tokens >= limits.tokens) {
        // Tamamı çıktı token'ı sayılarak hesaplanıyor: çıktı girdinin ~8 katı
        // fiyatlı olduğu için bu bir ÜST SINIR, gerçek tutar bunun altında.
        const enCok = estimateCost({ outTokens: used.tokens, modelId: 'gemini-2.5-flash' });
        log.warn({ used: used.tokens, limit: limits.tokens }, 'günlük AI bütçesi doldu — yeni çağrı başlatılmıyor');
        throw new Error(
            `${BUDGET_MARKER}: Bu kurulumun günlük AI bütçesi doldu `
            + `(${used.tokens.toLocaleString('tr-TR')} / ${limits.tokens.toLocaleString('tr-TR')} token, `
            + `en çok ~$${enCok.toFixed(2)}). Sayaç UTC gece yarısı sıfırlanır.`
        );
    }
}
