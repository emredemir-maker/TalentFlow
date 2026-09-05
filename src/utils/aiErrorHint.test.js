// AI hatasının DOĞRU tavsiyeye çevrilmesi.
//
// Canlıda oldu: aylık harcama tavanı doldu, Gemini 429 döndürdü, arayüz
// "1 dakika bekleyip tekrar deneyin" dedi. Kullanıcı bekledi, tekrar denedi,
// yine olmadı. Yanlış tavsiye hiç tavsiye vermemekten kötü — insanı
// çalışmayacak bir şeyi tekrarlamaya yolluyor.
import { describe, expect, it } from 'vitest';

import { aiErrorHint, isRetryable } from './aiErrorHint';

// Canlıda gelen mesajın birebir kendisi
const LIVE_SPEND_CAP =
    '[GoogleGenerativeAI Error]: Error fetching from '
    + 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: '
    + '[429 Too Many Requests] Your billing account has exceeded its monthly spending cap. '
    + 'Please go to AI Studio at https://ai.studio/billing to manage your billing.';

describe('harcama tavanı', () => {
    it('recognises the exact message we saw in production', () => {
        expect(aiErrorHint(LIVE_SPEND_CAP).kind).toBe('spend-cap');
    });

    it('does NOT tell the user to wait a minute', () => {
        // Asıl hata buydu: mesajın içinde 429 geçtiği için hız sınırı sanıldı
        const { hint } = aiErrorHint(LIVE_SPEND_CAP);
        expect(hint).not.toMatch(/1 dakika|bekleyip tekrar/);
        expect(hint).toMatch(/Beklemek bunu çözmez/);
    });

    it('says exactly where to go', () => {
        expect(aiErrorHint(LIVE_SPEND_CAP).hint).toMatch(/AI Studio → Billing/);
    });

    it('wins over the rate-limit pattern even though 429 appears in the text', () => {
        // Sıralama kritik: RATE_LIMIT deseni '429' ile eşleşiyor
        expect(aiErrorHint('429 spending cap reached').kind).toBe('spend-cap');
    });

    it('is not worth retrying', () => {
        expect(isRetryable(LIVE_SPEND_CAP)).toBe(false);
    });
});

describe('diğer türler', () => {
    it('separates a daily quota from a per-minute limit', () => {
        expect(aiErrorHint('RESOURCE_EXHAUSTED: quota exceeded').kind).toBe('quota');
        expect(aiErrorHint('429 Too Many Requests: rate limit').kind).toBe('rate-limit');
    });

    it('still tells the user to wait when waiting actually helps', () => {
        expect(aiErrorHint('Rate limit exceeded').hint).toMatch(/1 dakika bekleyip/);
        expect(isRetryable('Rate limit exceeded')).toBe(true);
    });

    it('points at the settings page for a bad key', () => {
        expect(aiErrorHint('API_KEY_INVALID').kind).toBe('auth');
        expect(aiErrorHint('API_KEY_INVALID').hint).toMatch(/Ayarlar → API/);
    });

    it('does not retry an auth failure', () => {
        // Üç kez yanlış anahtarla denemek yalnızca kullanıcıyı bekletir
        expect(isRetryable('PERMISSION_DENIED')).toBe(false);
    });

    it('treats gateway errors as transient', () => {
        for (const msg of ['502 Bad Gateway', 'service unavailable', 'socket hang up', 'fetch failed']) {
            expect(aiErrorHint(msg).kind).toBe('gateway');
            expect(isRetryable(msg)).toBe(true);
        }
    });

    it('says nothing rather than guessing on an unfamiliar error', () => {
        // Uydurma tavsiye, tavsiye yokluğundan kötü
        expect(aiErrorHint('Beklenmeyen bir şey oldu')).toEqual({ kind: null, hint: '' });
        expect(aiErrorHint('')).toEqual({ kind: null, hint: '' });
        expect(aiErrorHint(null)).toEqual({ kind: null, hint: '' });
        expect(aiErrorHint(undefined).kind).toBeNull();
    });

    it('retries an unclassified error, since we cannot rule out a blip', () => {
        expect(isRetryable('bilinmeyen hata')).toBe(true);
    });
});

// ── KURULUMUN KENDİ BÜTÇESİ ─────────────────────────────────────────────────
// Google'ın kotasıyla karıştırılırsa kullanıcı, hiç ilgisi olmayan bir
// Billing sayfasına yollanır. Sunucudaki im: aiBudget.js BUDGET_MARKER.
describe('günlük kurulum bütçesi', () => {
    const MESAJ = 'AI_DAILY_BUDGET_EXCEEDED: Bu kurulumun günlük AI bütçesi doldu '
        + '(2.000.000 / 2.000.000 token, en çok ~$5.00). Sayaç UTC gece yarısı sıfırlanır.';

    it('kendi bütçesi olarak tanınıyor', () => {
        expect(aiErrorHint(MESAJ).kind).toBe('budget');
    });

    it('GOOGLE KOTASIYLA KARIŞTIRILMIYOR', () => {
        // Mesajın içinde "günlük" geçiyor ve kota kalıbına da uyabilirdi;
        // sıralama bu yüzden önemli.
        expect(aiErrorHint(MESAJ).hint).toContain('Google kotanızla');
        expect(aiErrorHint(MESAJ).hint).not.toContain('planı yükselt');
    });

    it('tekrar denemek çözmüyor', () => {
        expect(isRetryable(MESAJ)).toBe(false);
    });

    it('Google kotası hâlâ kota olarak sınıflanıyor', () => {
        expect(aiErrorHint('429 RESOURCE_EXHAUSTED quota exceeded').kind).toBe('quota');
    });
});
