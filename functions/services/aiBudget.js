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
// ── NE YAPMIYOR ─────────────────────────────────────────────────────────────
// Tek bir çağrıyı ortasından kesmiyor. Bir çağrının kaç token yakacağı ancak
// bittiğinde bilinir, dolayısıyla kural şu: "günün toplamı sınırı geçtiyse
// YENİ çağrı başlatma". Sınırı aşan son çağrı tamamlanır — yani gerçek
// tüketim sınırın bir miktar üstünde durabilir. Bunu bilerek kabul ediyoruz;
// alternatifi, yarım kalmış cevapları kullanıcıya hata olarak göstermek.
//
// ── VARSAYILAN KAPALI ───────────────────────────────────────────────────────
// `AI_DAILY_TOKEN_LIMIT` tanımlı değilse ya da 0 ise fren yoktur ve davranış
// bugünküyle birebir aynıdır. Mevcut kurulumun çalışma biçimini bir ortam
// değişkeni sessizce değiştirmemeli; freni isteyen açar.
//
// Sınır TOKEN cinsinden, çünkü ölçtüğümüz şey bu. Para karşılığı bir TAHMİN
// (bkz. usage.js PRICING: fiyatlar değişir) ve tahmine dayanarak servisi
// durdurmak istemedik. Kabaca çevirmek için: gemini-2.5-flash'ta 1M çıktı
// token'ı ≈ $2.50, 1M girdi ≈ $0.30. Günde ~$5'lık bir tavan için
// 2_000_000 iyi bir başlangıç.

import { db } from '../config/firebaseAdmin.js';
import { childLogger } from './logger.js';
import { dayKey, estimateCost } from './usage.js';

const log = childLogger('aiBudget');

/** Firestore'a en fazla bu sıklıkta sorulur — her AI çağrısında değil. */
const REFRESH_MS = 60_000;

/**
 * Ortam değişkeninden günlük token sınırı.
 *
 * Her çağrıda okunuyor (modül yüklenirken bir kez değil): testler değeri
 * değiştirebilsin ve yanlış yazılmış bir değer sessizce "sınırsız"a
 * dönüşmesin diye ayrı bir fonksiyon.
 *
 * @returns {number} 0 = fren kapalı
 */
export function budgetLimit() {
    const raw = process.env.AI_DAILY_TOKEN_LIMIT;
    if (raw === undefined || raw === null || String(raw).trim() === '') return 0;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
        // SESSİZ KALMIYOR. "AI_DAILY_TOKEN_LIMIT=iki milyon" yazan biri freni
        // kurduğunu sanıp korumasız kalırdı.
        log.warn({ raw }, 'AI_DAILY_TOKEN_LIMIT sayı değil — günlük bütçe freni KAPALI');
        return 0;
    }
    return Math.floor(n);
}

/** Hatanın makine tarafında tanınması için sabit im. */
export const BUDGET_MARKER = 'AI_DAILY_BUDGET_EXCEEDED';

// Günün harcaması — Firestore'a her çağrıda gitmemek için bellekte tutuluyor.
// Süreç başına ayrı; birden fazla örnek çalışıyorsa her biri kendi payını
// sayar ve gerçek toplam ancak yenilemede görünür. Bu yüzden yenileme aralığı
// kısa: sapma en fazla bir dakikalık trafik kadar olabilir.
let cache = { day: null, used: 0, at: 0 };

/** Testler için — modül durumu sıfırlanır. */
export function resetBudgetCache() {
    cache = { day: null, used: 0, at: 0 };
}

/** Günün toplam token'ını Firestore'daki ölçüm dokümanından okur. */
async function fetchUsedFromFirestore(day) {
    const snap = await db.doc(`artifacts/talent-flow/public/data/usage/${day}`).get();
    return Number(snap.data()?.totals?.totalTokens) || 0;
}

/**
 * Günün harcamasını döndürür; gerekiyorsa Firestore'dan tazeler.
 *
 * @param {Date} now
 * @param {(day: string) => Promise<number>} fetchUsed — testler için
 */
export async function usedToday(now, fetchUsed = fetchUsedFromFirestore) {
    const day = dayKey(now);
    const sameDay = cache.day === day;
    if (sameDay && Date.now() - cache.at < REFRESH_MS) return cache.used;

    try {
        const used = await fetchUsed(day);
        // YEREL SAYIM KAYBOLMASIN. Firestore'daki yazma gecikmeli
        // (recordUsage beklenmiyor); tazeleme sırasında elimizdeki sayı
        // sunucudakinden büyükse büyüğü tutuyoruz, yoksa fren bir dakikalık
        // trafiği görmezden gelir.
        cache = { day, used: sameDay ? Math.max(used, cache.used) : used, at: Date.now() };
    } catch (err) {
        // ÖLÇÜM HATASI SERVİSİ DURDURMAZ — usage.js ile aynı kural. Okuyamadık
        // diye "bütçe doldu" demek, çalışan bir kurulumu kapatmak olurdu.
        log.warn({ err: err.message }, 'günlük kullanım okunamadı — eldeki sayıyla devam');
        if (!sameDay) cache = { day, used: 0, at: Date.now() };
    }
    return cache.used;
}

/**
 * Biten bir çağrının tüketimini yerel sayaca ekler.
 *
 * Firestore'a yazma zaten `recordUsage` ile yapılıyor ama beklenmiyor; iki
 * tazeleme arasında freni ayakta tutan şey bu yerel toplam.
 */
export function noteSpend(totalTokens, now = new Date()) {
    const n = Number(totalTokens);
    if (!Number.isFinite(n) || n <= 0) return;
    const day = dayKey(now);
    if (cache.day !== day) cache = { day, used: 0, at: Date.now() };
    cache.used += n;
}

/**
 * Bütçe doluysa hata fırlatır.
 *
 * @throws {Error} mesajı BUDGET_MARKER içerir — arayüz bunu Google'ın
 *   kotasından ayırt edip doğru tavsiyeyi verebilsin diye (utils/aiErrorHint).
 */
export async function assertWithinBudget({ now = new Date(), fetchUsed } = {}) {
    const limit = budgetLimit();
    if (limit <= 0) return;

    const used = await usedToday(now, fetchUsed || fetchUsedFromFirestore);
    if (used < limit) return;

    // Tamamı çıktı token'ı sayılarak hesaplanıyor: çıktı girdinin ~8 katı
    // fiyatlı olduğu için bu bir ÜST SINIR, gerçek tutar bunun altında.
    // Elimizde yalnızca toplam var; ikisini ayırmak için ölçüm dokümanını
    // etiket etiket okumak gerekirdi ve bu satır bir hata mesajı.
    const enCok = estimateCost({ outTokens: used, modelId: 'gemini-2.5-flash' });
    log.warn({ used, limit }, 'günlük AI bütçesi doldu — yeni çağrı başlatılmıyor');
    throw new Error(
        `${BUDGET_MARKER}: Bu kurulumun günlük AI bütçesi doldu `
        + `(${used.toLocaleString('tr-TR')} / ${limit.toLocaleString('tr-TR')} token, `
        + `en çok ~$${enCok.toFixed(2)}). Sayaç UTC gece yarısı sıfırlanır.`
    );
}
