// GÜNLÜK AI BÜTÇESİ.
//
// Bu modülün iki yanlış davranışı var ve ikisi de pahalı:
//   • gereksiz yere durdurmak → çalışan bir kurulum sessizce kapanır
//   • durdurmamak             → fatura tavana kadar yazılır
// Testler ağırlıklı olarak BİRİNCİSİNİ kovalıyor: ölçüm okunamadığında,
// sınır yanlış yazıldığında ya da gün döndüğünde fren tutmamalı.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
    budgetLimits,
    assertWithinBudget,
    todayUsage,
    noteSpend,
    resetBudgetCache,
    BUDGET_MARKER,
} from './aiBudget.js';

const ONCE = new Date('2026-09-05T10:00:00.000Z');
const SONRA = new Date('2026-09-06T10:00:00.000Z');

/** Sabit değer döndüren ölçüm okuyucusu. */
const okuyucu = (tokens, groundedCalls = 0) => async () => ({ tokens, groundedCalls });

beforeEach(() => {
    resetBudgetCache();
    delete process.env.AI_DAILY_TOKEN_LIMIT;
    delete process.env.AI_DAILY_GROUNDED_LIMIT;
});
afterEach(() => {
    delete process.env.AI_DAILY_TOKEN_LIMIT;
    delete process.env.AI_DAILY_GROUNDED_LIMIT;
});

describe('budgetLimits', () => {
    it('VARSAYILAN KAPALI — değişken yoksa fren yok', () => {
        expect(budgetLimits().tokens).toBe(0);
        process.env.AI_DAILY_TOKEN_LIMIT = '';
        expect(budgetLimits().tokens).toBe(0);
    });

    it('sayı okunuyor', () => {
        process.env.AI_DAILY_TOKEN_LIMIT = '2000000';
        expect(budgetLimits().tokens).toBe(2000000);
    });

    it('SAYI OLMAYAN DEĞER FRENİ AÇIK SANDIRMIYOR', () => {
        // "iki milyon" yazan biri korunduğunu sanır. Sıfır dönüyor ve modül
        // bunu uyarı olarak logluyor.
        process.env.AI_DAILY_TOKEN_LIMIT = 'iki milyon';
        expect(budgetLimits().tokens).toBe(0);
        process.env.AI_DAILY_TOKEN_LIMIT = '-5';
        expect(budgetLimits().tokens).toBe(0);
    });
});

describe('assertWithinBudget', () => {
    it('sınır yokken hiç ölçüm okumuyor', async () => {
        let okundu = false;
        await assertWithinBudget({ now: ONCE, fetchToday: async () => { okundu = true; return { tokens: 9e9, groundedCalls: 0 }; } });
        expect(okundu).toBe(false);
    });

    it('sınırın altında geçiyor', async () => {
        process.env.AI_DAILY_TOKEN_LIMIT = '1000';
        await expect(assertWithinBudget({ now: ONCE, fetchToday: okuyucu(999) })).resolves.toBeUndefined();
    });

    it('SINIRA ULAŞINCA DURUYOR', async () => {
        process.env.AI_DAILY_TOKEN_LIMIT = '1000';
        await expect(assertWithinBudget({ now: ONCE, fetchToday: okuyucu(1000) }))
            .rejects.toThrow(BUDGET_MARKER);
    });

    it('hata mesajı sayıyı ve sıfırlanma zamanını söylüyor', async () => {
        process.env.AI_DAILY_TOKEN_LIMIT = '1000';
        await expect(assertWithinBudget({ now: ONCE, fetchToday: okuyucu(1500) }))
            .rejects.toThrow(/UTC gece yarısı/);
    });

    it('ÖLÇÜM OKUNAMAZSA SERVİS DURMUYOR', async () => {
        // usage.js ile aynı kural: ölçüm hatası işi durdurmaz. Aksi hâlde
        // Firestore'daki geçici bir arıza tüm AI özelliklerini kapatırdı.
        process.env.AI_DAILY_TOKEN_LIMIT = '1000';
        const patlayan = async () => { throw new Error('firestore yok'); };
        await expect(assertWithinBudget({ now: ONCE, fetchToday: patlayan })).resolves.toBeUndefined();
    });
});

describe('gün dönümü', () => {
    it('YENİ GÜNDE SAYAÇ SIFIRLANIYOR', async () => {
        process.env.AI_DAILY_TOKEN_LIMIT = '1000';
        await expect(assertWithinBudget({ now: ONCE, fetchToday: okuyucu(5000) })).rejects.toThrow();
        // Ertesi gün ölçüm dokümanı da yeni: fren açılmalı.
        await expect(assertWithinBudget({ now: SONRA, fetchToday: okuyucu(0) })).resolves.toBeUndefined();
    });

    it('yerel sayaç gün değişince sıfırlanıyor', async () => {
        noteSpend({ totalTokens: 900, now: ONCE });
        expect((await todayUsage(ONCE, okuyucu(0))).tokens).toBe(900);
        noteSpend({ totalTokens: 10, now: SONRA });
        expect((await todayUsage(SONRA, okuyucu(0))).tokens).toBe(10);
    });
});

describe('yerel sayaç', () => {
    it('TAZELEME YEREL SAYIMI SİLMİYOR', async () => {
        // recordUsage beklenmiyor: Firestore'daki sayı gecikmeli. Tazeleme
        // sırasında küçüğü almak, bir dakikalık trafiği görmezden gelirdi.
        expect((await todayUsage(ONCE, okuyucu(100))).tokens).toBe(100);
        noteSpend({ totalTokens: 500, now: ONCE });
        expect((await todayUsage(ONCE, okuyucu(100))).tokens).toBe(600);
    });

    it('sunucudaki sayı daha büyükse o kabul ediliyor', async () => {
        // Birden fazla örnek çalışıyorsa gerçek toplam ancak burada görünür.
        await todayUsage(ONCE, okuyucu(100));
        noteSpend({ totalTokens: 50, now: ONCE });
        resetBudgetCache();
        expect((await todayUsage(ONCE, okuyucu(900))).tokens).toBe(900);
    });

    it('geçersiz tüketim yok sayılıyor', async () => {
        noteSpend({ totalTokens: NaN, now: ONCE });
        noteSpend({ totalTokens: -5, now: ONCE });
        noteSpend({ totalTokens: undefined, now: ONCE });
        expect((await todayUsage(ONCE, okuyucu(0))).tokens).toBe(0);
    });
});

// ── ARAMALI ÇAĞRI TAVANI ────────────────────────────────────────────────────
// Google, arama destekli çağrıları token'dan BAĞIMSIZ olarak istek başına
// faturalandırıyor. Aramalı bir çağrı az token yakıp çok fatura yazabiliyor:
// token tavanı bu kalemi görmüyor, bu yüzden ayrı bir adet tavanı var.
describe('aramalı çağrı tavanı', () => {
    it('yalnızca ARAMALI çağrıları durduruyor', async () => {
        process.env.AI_DAILY_GROUNDED_LIMIT = '5';
        const okuma = okuyucu(0, 5);
        await expect(assertWithinBudget({ grounded: true, now: ONCE, fetchToday: okuma }))
            .rejects.toThrow(BUDGET_MARKER);
        // Aramasız çağrı etkilenmiyor — token tavanı yok, bu fren onu tutmaz.
        await expect(assertWithinBudget({ now: ONCE, fetchToday: okuma })).resolves.toBeUndefined();
    });

    it('sınırın altında geçiyor', async () => {
        process.env.AI_DAILY_GROUNDED_LIMIT = '5';
        await expect(assertWithinBudget({ grounded: true, now: ONCE, fetchToday: okuyucu(0, 4) }))
            .resolves.toBeUndefined();
    });

    it('hata mesajı ayrı faturalandığını söylüyor', async () => {
        process.env.AI_DAILY_GROUNDED_LIMIT = '1';
        await expect(assertWithinBudget({ grounded: true, now: ONCE, fetchToday: okuyucu(0, 1) }))
            .rejects.toThrow(/ayrıca faturalanır/);
    });

    it('TOKEN TAVANI ARAMALI ÇAĞRIYI DA TUTUYOR', async () => {
        // İki fren bağımsız ama ikisi de geçerli: token dolduysa aramalı
        // çağrı da başlamamalı.
        process.env.AI_DAILY_TOKEN_LIMIT = '100';
        await expect(assertWithinBudget({ grounded: true, now: ONCE, fetchToday: okuyucu(200, 0) }))
            .rejects.toThrow(/token/);
    });

    it('hiçbir sınır yokken ölçüm okunmuyor', async () => {
        let okundu = false;
        await assertWithinBudget({
            grounded: true,
            now: ONCE,
            fetchToday: async () => { okundu = true; return { tokens: 9e9, groundedCalls: 9e9 }; },
        });
        expect(okundu).toBe(false);
    });

    it('yerel sayaç aramalı çağrıyı ayrı sayıyor', () => {
        noteSpend({ totalTokens: 10, grounded: true, now: ONCE });
        noteSpend({ totalTokens: 10, now: ONCE });
        // İki çağrı, tek aramalı.
        return todayUsage(ONCE, okuyucu(0, 0)).then((u) => {
            expect(u.tokens).toBe(20);
            expect(u.groundedCalls).toBe(1);
        });
    });
});
