// GÜNLÜK AI BÜTÇESİ.
//
// Bu modülün iki yanlış davranışı var ve ikisi de pahalı:
//   • gereksiz yere durdurmak → çalışan bir kurulum sessizce kapanır
//   • durdurmamak             → fatura tavana kadar yazılır
// Testler ağırlıklı olarak BİRİNCİSİNİ kovalıyor: ölçüm okunamadığında,
// sınır yanlış yazıldığında ya da gün döndüğünde fren tutmamalı.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
    budgetLimit,
    assertWithinBudget,
    usedToday,
    noteSpend,
    resetBudgetCache,
    BUDGET_MARKER,
} from './aiBudget.js';

const ONCE = new Date('2026-09-05T10:00:00.000Z');
const SONRA = new Date('2026-09-06T10:00:00.000Z');

/** Sabit bir sayı döndüren ölçüm okuyucusu. */
const okuyucu = (n) => async () => n;

beforeEach(() => {
    resetBudgetCache();
    delete process.env.AI_DAILY_TOKEN_LIMIT;
});
afterEach(() => {
    delete process.env.AI_DAILY_TOKEN_LIMIT;
});

describe('budgetLimit', () => {
    it('VARSAYILAN KAPALI — değişken yoksa fren yok', () => {
        expect(budgetLimit()).toBe(0);
        process.env.AI_DAILY_TOKEN_LIMIT = '';
        expect(budgetLimit()).toBe(0);
    });

    it('sayı okunuyor', () => {
        process.env.AI_DAILY_TOKEN_LIMIT = '2000000';
        expect(budgetLimit()).toBe(2000000);
    });

    it('SAYI OLMAYAN DEĞER FRENİ AÇIK SANDIRMIYOR', () => {
        // "iki milyon" yazan biri korunduğunu sanır. Sıfır dönüyor ve modül
        // bunu uyarı olarak logluyor.
        process.env.AI_DAILY_TOKEN_LIMIT = 'iki milyon';
        expect(budgetLimit()).toBe(0);
        process.env.AI_DAILY_TOKEN_LIMIT = '-5';
        expect(budgetLimit()).toBe(0);
    });
});

describe('assertWithinBudget', () => {
    it('sınır yokken hiç ölçüm okumuyor', async () => {
        let okundu = false;
        await assertWithinBudget({ now: ONCE, fetchUsed: async () => { okundu = true; return 9e9; } });
        expect(okundu).toBe(false);
    });

    it('sınırın altında geçiyor', async () => {
        process.env.AI_DAILY_TOKEN_LIMIT = '1000';
        await expect(assertWithinBudget({ now: ONCE, fetchUsed: okuyucu(999) })).resolves.toBeUndefined();
    });

    it('SINIRA ULAŞINCA DURUYOR', async () => {
        process.env.AI_DAILY_TOKEN_LIMIT = '1000';
        await expect(assertWithinBudget({ now: ONCE, fetchUsed: okuyucu(1000) }))
            .rejects.toThrow(BUDGET_MARKER);
    });

    it('hata mesajı sayıyı ve sıfırlanma zamanını söylüyor', async () => {
        process.env.AI_DAILY_TOKEN_LIMIT = '1000';
        await expect(assertWithinBudget({ now: ONCE, fetchUsed: okuyucu(1500) }))
            .rejects.toThrow(/UTC gece yarısı/);
    });

    it('ÖLÇÜM OKUNAMAZSA SERVİS DURMUYOR', async () => {
        // usage.js ile aynı kural: ölçüm hatası işi durdurmaz. Aksi hâlde
        // Firestore'daki geçici bir arıza tüm AI özelliklerini kapatırdı.
        process.env.AI_DAILY_TOKEN_LIMIT = '1000';
        const patlayan = async () => { throw new Error('firestore yok'); };
        await expect(assertWithinBudget({ now: ONCE, fetchUsed: patlayan })).resolves.toBeUndefined();
    });
});

describe('gün dönümü', () => {
    it('YENİ GÜNDE SAYAÇ SIFIRLANIYOR', async () => {
        process.env.AI_DAILY_TOKEN_LIMIT = '1000';
        await expect(assertWithinBudget({ now: ONCE, fetchUsed: okuyucu(5000) })).rejects.toThrow();
        // Ertesi gün ölçüm dokümanı da yeni: fren açılmalı.
        await expect(assertWithinBudget({ now: SONRA, fetchUsed: okuyucu(0) })).resolves.toBeUndefined();
    });

    it('yerel sayaç gün değişince sıfırlanıyor', async () => {
        noteSpend(900, ONCE);
        expect(await usedToday(ONCE, okuyucu(0))).toBe(900);
        noteSpend(10, SONRA);
        expect(await usedToday(SONRA, okuyucu(0))).toBe(10);
    });
});

describe('yerel sayaç', () => {
    it('TAZELEME YEREL SAYIMI SİLMİYOR', async () => {
        // recordUsage beklenmiyor: Firestore'daki sayı gecikmeli. Tazeleme
        // sırasında küçüğü almak, bir dakikalık trafiği görmezden gelirdi.
        expect(await usedToday(ONCE, okuyucu(100))).toBe(100);
        noteSpend(500, ONCE);
        expect(await usedToday(ONCE, okuyucu(100))).toBe(600);
    });

    it('sunucudaki sayı daha büyükse o kabul ediliyor', async () => {
        // Birden fazla örnek çalışıyorsa gerçek toplam ancak burada görünür.
        await usedToday(ONCE, okuyucu(100));
        noteSpend(50, ONCE);
        resetBudgetCache();
        expect(await usedToday(ONCE, okuyucu(900))).toBe(900);
    });

    it('geçersiz tüketim yok sayılıyor', async () => {
        noteSpend(NaN, ONCE);
        noteSpend(-5, ONCE);
        noteSpend(undefined, ONCE);
        expect(await usedToday(ONCE, okuyucu(0))).toBe(0);
    });
});
