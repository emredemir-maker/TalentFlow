// Token ölçümü.
//
// Canlıda oldu: aylık $2.000'lık Gemini tavanı doldu ve servis durdu.
// "Nereye gitti?" sorusunun cevabı YOKTU — Gemini her yanıtta usageMetadata
// döndürüyor, biz atıyorduk.
//
// Ölçüm olmadan optimizasyon tahmindir ve yanlış yeri optimize etmek hiç
// optimize etmemekten pahalıdır: emek harcanır, fatura düşmez.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/firebaseAdmin.js', () => ({
    db: { doc: () => ({ set: async () => {} }) },
    admin: { firestore: { FieldValue: { increment: (n) => ({ __inc: n }) } } },
}));

const { readUsage, normalizeLabel, dayKey, estimateCost, summarize, LABELS } =
    await import('./usage.js');

describe('readUsage', () => {
    it('reads the token counts Gemini returns', () => {
        expect(readUsage({ usageMetadata: { promptTokenCount: 5000, candidatesTokenCount: 800, totalTokenCount: 5800 } }))
            .toEqual({ inTokens: 5000, outTokens: 800, totalTokens: 5800 });
    });

    it('counts thinking tokens as output, because they are billed', () => {
        // Düşünme token'ları faturaya giriyor; saymazsak ölçüm gerçek
        // maliyetin altında kalır ve yanlış yeri optimize ederiz
        const u = readUsage({
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200, thoughtsTokenCount: 500 },
        });
        expect(u.outTokens).toBe(700);
    });

    it('derives the total when the API omits it', () => {
        expect(readUsage({ usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 } }).totalTokens).toBe(150);
    });

    it('never produces NaN from a missing or malformed field', () => {
        // Tek bir NaN tüm günlük toplamı bozar
        for (const bad of [{}, { usageMetadata: null }, { usageMetadata: { promptTokenCount: 'çok' } }, null]) {
            const u = readUsage(bad);
            expect(Number.isFinite(u.inTokens)).toBe(true);
            expect(Number.isFinite(u.outTokens)).toBe(true);
            expect(Number.isFinite(u.totalTokens)).toBe(true);
        }
    });
});

describe('normalizeLabel', () => {
    it('keeps the labels we actually attribute cost to', () => {
        expect(normalizeLabel('coverage')).toBe('coverage');
        expect(normalizeLabel('narrative')).toBe('narrative');
        expect(normalizeLabel('CV-PARSE')).toBe('cv-parse');
    });

    it('sends anything unknown to "other" instead of throwing', () => {
        // Ölçüm asla iş akışını durdurmaz
        expect(normalizeLabel('hayalet')).toBe('other');
        expect(normalizeLabel('')).toBe('other');
        expect(normalizeLabel(null)).toBe('other');
        expect(normalizeLabel(undefined)).toBe('other');
    });

    it('separates the two halves of a deep scan', () => {
        // Bu ayrım optimizasyonun tamamı: skoru belirleyen çağrı küçük,
        // anlatım büyük ve çoğu aday için hiç okunmuyor
        expect(LABELS.has('coverage')).toBe(true);
        expect(LABELS.has('narrative')).toBe(true);
    });
});

describe('dayKey', () => {
    it('uses UTC so the day does not shift with the server timezone', () => {
        expect(dayKey(new Date('2026-08-12T23:30:00Z'))).toBe('2026-08-12');
        expect(dayKey(new Date('2026-08-13T00:30:00Z'))).toBe('2026-08-13');
    });
});

describe('estimateCost', () => {
    it('prices output far above input, which is the whole point', () => {
        // Yalnızca çağrı sayısına bakmak yanıltıcı: çıktı ~8 kat pahalı
        const sameTokens = 1e6;
        const inputOnly = estimateCost({ inTokens: sameTokens, modelId: 'gemini-2.5-flash' });
        const outputOnly = estimateCost({ outTokens: sameTokens, modelId: 'gemini-2.5-flash' });
        expect(outputOnly).toBeGreaterThan(inputOnly * 5);
    });

    it('falls back to flash pricing for an unknown model', () => {
        expect(estimateCost({ inTokens: 1e6, modelId: 'gemma-3-27b-it' }))
            .toBe(estimateCost({ inTokens: 1e6, modelId: 'gemini-2.5-flash' }));
    });

    it('returns zero for an empty call', () => {
        expect(estimateCost({})).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ÖZET — en pahalı özellik başta.
//
// "Hangi ekran ne yakıyor?" sorusuna cevap vermeyen bir ölçüm işe yaramaz.
// Sıralama ÇAĞRI SAYISINA göre olsaydı yanıltırdı: 100 küçük çağrı, 10 büyük
// çağrıdan ucuz olabilir.
// ─────────────────────────────────────────────────────────────────────────────
describe('summarize', () => {
    const doc = {
        day: '2026-08-12',
        byLabel: {
            // Çok çağrı, küçük çıktı
            coverage: { calls: 400, cacheHits: 0, inTokens: 2_000_000, outTokens: 120_000, model: 'gemini-2.5-flash' },
            // Az çağrı, büyük çıktı — asıl pahalı olan bu
            narrative: { calls: 400, cacheHits: 0, inTokens: 2_000_000, outTokens: 1_200_000, model: 'gemini-2.5-flash' },
            assistant: { calls: 10, cacheHits: 5, inTokens: 20_000, outTokens: 5_000, model: 'gemini-2.5-flash' },
        },
    };

    it('ranks by cost, not by call count', () => {
        const s = summarize(doc);
        expect(s.rows[0].label).toBe('narrative');
        expect(s.rows[0].calls).toBe(s.rows[1].calls); // aynı çağrı sayısı…
        expect(s.rows[0].cost).toBeGreaterThan(s.rows[1].cost); // …ama pahalı olan bu
    });

    it('reports the cache hit rate — the one number that says if caching works', () => {
        const s = summarize(doc);
        expect(s.calls).toBe(810);
        expect(s.cacheHitRate).toBeCloseTo(5 / 810, 5);
    });

    it('totals the cost across labels', () => {
        const s = summarize(doc);
        const sum = s.rows.reduce((t, r) => t + r.cost, 0);
        expect(s.totalCost).toBeCloseTo(sum, 8);
    });

    it('survives an empty or malformed document', () => {
        expect(summarize(null)).toMatchObject({ rows: [], totalCost: 0, calls: 0, cacheHitRate: 0 });
        expect(summarize({ byLabel: { x: {} } }).rows[0].cost).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ÖLÇÜM ASLA İŞİ DURDURMAZ.
//
// CI'da yakalandı: `admin.firestore.FieldValue` erişimi try bloğunun
// DIŞINDAYDI. admin mock'lanmamış bir ortamda undefined olunca hata try'a
// girmeden fırlıyor, çağrı `await`'siz olduğu için de yakalanamayan bir
// reddedilmeye dönüşüyordu.
//
// Yerel çalıştırmada görünmedi çünkü orada admin gerçekten başlıyor. Kural
// yazılıydı, uygulaması eksikti.
// ─────────────────────────────────────────────────────────────────────────────
describe('recordUsage — dayanıklılık', () => {
    it('resolves quietly when the Firestore admin SDK is unavailable', async () => {
        vi.resetModules();
        vi.doMock('../config/firebaseAdmin.js', () => ({ db: undefined, admin: undefined }));
        const { recordUsage } = await import('./usage.js');
        await expect(recordUsage({ label: 'coverage' })).resolves.toBeUndefined();
        vi.doUnmock('../config/firebaseAdmin.js');
    });

    it('resolves quietly when the write itself fails', async () => {
        vi.resetModules();
        vi.doMock('../config/firebaseAdmin.js', () => ({
            db: { doc: () => ({ set: async () => { throw new Error('permission denied'); } }) },
            admin: { firestore: { FieldValue: { increment: (n) => ({ __inc: n }) } } },
        }));
        const { recordUsage } = await import('./usage.js');
        await expect(recordUsage({ label: 'narrative' })).resolves.toBeUndefined();
        vi.doUnmock('../config/firebaseAdmin.js');
    });

    it('never rejects for any input', async () => {
        vi.resetModules();
        const { recordUsage } = await import('./usage.js');
        for (const bad of [undefined, {}, { label: null }, { label: 'x', usage: 'metin' }]) {
            await expect(recordUsage(bad)).resolves.toBeUndefined();
        }
    });
});
