// TOKEN ÖLÇÜMÜ — hangi özellik ne yakıyor?
//
// Canlıda oldu: aylık $2.000'lık Gemini tavanı doldu ve servis durdu. "Nereye
// gitti?" sorusunun cevabı YOKTU — Gemini her yanıtta `usageMetadata`
// döndürüyor, biz atıyorduk.
//
// Ölçüm olmadan optimizasyon tahmindir. "Anlatım çağrısı pahalı olmalı" ya da
// "önbellek çalışmıyor olabilir" cümlelerinin ikisi de makul; hangisinin doğru
// olduğunu ancak sayı söyler. Yanlış yeri optimize etmek, hiç optimize
// etmemekten daha pahalı: emek harcanır, fatura düşmez.
//
// GÜNLÜK TOPLAM, çağrı başına kayıt DEĞİL. Her AI çağrısı için ayrı bir
// Firestore dokümanı yazmak hem maliyet hem gürültü. Günlük tek doküman,
// etiket başına artırılıyor: `usage/2026-08-12` → { coverage: {calls, in, out} }
//
// ÖLÇÜM HİÇBİR ZAMAN İŞİ DURDURMAZ. Yazma hatası yutulur ve loglanır; token
// sayamadık diye bir aday taraması düşmemeli.

import { db, admin } from '../config/firebaseAdmin.js';
import { childLogger } from './logger.js';

const log = childLogger('usage');

/** Etiketler — hangi özellik. Bilinmeyen etiket 'other'a düşer. */
export const LABELS = new Set([
    'cv-parse',        // CV metnini yapılandırılmış veriye çevirme
    'coverage',        // madde damgaları — skoru BU belirliyor
    'narrative',       // anlatım: not/dayanak/fark/özet — skoru etkilemez
    'prescreen',       // başvuru formu ön eleme
    'interview-grade', // mülakat cevaplarının madde damgaları
    'interview-eval',  // mülakat gözlem metni
    'interview-plan',  // mülakat sorularının yazılması
    'requirement',     // ilan danışmanı / sözlük / normalleştirme
    'assistant',       // İK asistanı
    'grounded',        // Google aramalı yanıt
    'other',
]);

/** Bilinmeyen etiketi 'other'a indirger — ölçüm asla hata fırlatmaz. */
export function normalizeLabel(raw) {
    const label = String(raw || '').trim().toLowerCase();
    return LABELS.has(label) ? label : 'other';
}

/**
 * Gemini yanıtından token sayılarını çıkarır.
 *
 * SDK sürümleri alan adlarında farklılaşıyor ve eksik alan sessizce NaN
 * üretip toplamı bozuyordu. Sayı olmayan her şey 0.
 *
 * @param {object} response — result.response
 * @returns {{inTokens: number, outTokens: number, totalTokens: number}}
 */
export function readUsage(response) {
    const m = response?.usageMetadata || {};
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const inTokens = num(m.promptTokenCount);
    // Düşünme token'ları da faturaya giriyor; çıktıya dahil edilmezse
    // ölçüm gerçek maliyetin altında kalır.
    const outTokens = num(m.candidatesTokenCount) + num(m.thoughtsTokenCount);
    const total = num(m.totalTokenCount);
    return {
        inTokens,
        outTokens,
        // totalTokenCount gelmezse parçalardan toplanır
        totalTokens: total || inTokens + outTokens,
    };
}

/** Günlük doküman kimliği — UTC, fatura döngüsüyle aynı eksende. */
export function dayKey(date) {
    return date.toISOString().slice(0, 10);
}

/**
 * Bir çağrının tüketimini günlük toplama ekler.
 *
 * `cached: true` ise token harcanmadı — çağrı sayılır ama tokenlar sıfırdır.
 * Önbellek isabetini ayrı saymak, önbelleğin işe yarayıp yaramadığını
 * gösteren tek sayı.
 *
 * @param {{label: string, modelId?: string, usage?: object, cached?: boolean, now?: Date}} input
 */
export async function recordUsage({ label, modelId = '', usage, cached = false, now = new Date() } = {}) {
    const key = normalizeLabel(label);
    const { inTokens, outTokens, totalTokens } = cached
        ? { inTokens: 0, outTokens: 0, totalTokens: 0 }
        : (usage || { inTokens: 0, outTokens: 0, totalTokens: 0 });

    try {
        // HER ŞEY try İÇİNDE.
        //
        // İlk sürümde bu satır dışarıdaydı ve CI'da patladı: admin mock'lanmamış
        // bir test ortamında `admin.firestore` undefined ve erişim try'a
        // girmeden fırlıyordu. Yani "ölçüm işi durdurmaz" kuralını kendi
        // kodumda çiğnemişim — üstelik yerel çalıştırmada admin gerçekten
        // başladığı için görünmüyordu.
        const inc = admin?.firestore?.FieldValue?.increment;
        if (typeof inc !== 'function') return;

        await db.doc(`artifacts/talent-flow/public/data/usage/${dayKey(now)}`).set(
            {
                day: dayKey(now),
                totals: {
                    calls: inc(1),
                    cacheHits: inc(cached ? 1 : 0),
                    inTokens: inc(inTokens),
                    outTokens: inc(outTokens),
                    totalTokens: inc(totalTokens),
                },
                byLabel: {
                    [key]: {
                        calls: inc(1),
                        cacheHits: inc(cached ? 1 : 0),
                        inTokens: inc(inTokens),
                        outTokens: inc(outTokens),
                        totalTokens: inc(totalTokens),
                        model: modelId || 'bilinmiyor',
                    },
                },
            },
            { merge: true }
        );
    } catch (err) {
        // Ölçüm işi DURDURMAZ. Token sayamadık diye bir tarama düşmemeli.
        log.warn({ err: err.message, label: key }, 'usage kaydedilemedi');
    }
}

/**
 * Ham token sayılarını yaklaşık maliyete çevirir.
 *
 * Fiyatlar DEĞİŞİR ve buradaki tablo bir tahmindir — gerçek rakam faturada.
 * Amaç kuruş hesabı değil, "hangi özellik diğerinin kaç katı" sorusuna
 * cevap vermek; oran fiyat değişse de büyük ölçüde korunur.
 *
 * Milyon token başına USD.
 */
export const PRICING = {
    'gemini-2.5-flash': { input: 0.30, output: 2.50 },
    'gemini-2.5-pro': { input: 1.25, output: 10.00 },
    default: { input: 0.30, output: 2.50 },
};

/** @returns {number} yaklaşık USD */
export function estimateCost({ inTokens = 0, outTokens = 0, modelId = '' }) {
    const p = PRICING[modelId] || PRICING.default;
    return (inTokens / 1e6) * p.input + (outTokens / 1e6) * p.output;
}

/**
 * Günlük kaydı okunur bir dökümana çevirir — en pahalı özellik başta.
 *
 * ÇIKTI TOKEN'I PAHALI: çıktı, girdinin ~8 katı fiyatlı. Yalnızca çağrı
 * sayısına bakmak yanıltıcı — 100 küçük çağrı, 10 büyük çağrıdan ucuz
 * olabilir. Sıralama maliyete göre.
 */
export function summarize(doc) {
    const byLabel = doc?.byLabel || {};
    const rows = Object.entries(byLabel).map(([label, v]) => ({
        label,
        calls: Number(v?.calls) || 0,
        cacheHits: Number(v?.cacheHits) || 0,
        inTokens: Number(v?.inTokens) || 0,
        outTokens: Number(v?.outTokens) || 0,
        cost: estimateCost({
            inTokens: Number(v?.inTokens) || 0,
            outTokens: Number(v?.outTokens) || 0,
            modelId: v?.model,
        }),
    }));
    rows.sort((a, b) => b.cost - a.cost);

    const totalCost = rows.reduce((s, r) => s + r.cost, 0);
    const calls = rows.reduce((s, r) => s + r.calls, 0);
    const cacheHits = rows.reduce((s, r) => s + r.cacheHits, 0);
    return {
        day: doc?.day || '',
        rows,
        totalCost,
        calls,
        // Önbelleğin işe yarayıp yaramadığını gösteren TEK sayı.
        cacheHitRate: calls > 0 ? cacheHits / calls : 0,
    };
}
