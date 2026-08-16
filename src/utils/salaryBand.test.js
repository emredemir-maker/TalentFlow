// MAAŞ BANDI — yarım ölçümle karar verdirmemek.
//
// Bu testlerin en önemlisi karşılaştırmayı REDDEDENLER. "120000" tek başına
// bir sayı değil: aylık mı yıllık mı, TL mi dolar mı? Eksik birimli iki sayıyı
// sessizce kıyaslamak, bu projede düzelttiğimiz hatanın en pahalı hâli olurdu
// — çünkü çıktısı bir bütçe kararı.
//
// Kur ÇEVİRMİYORUZ. Uydurma bir kur, uydurma bir karşılaştırma üretir.
import { describe, expect, it } from 'vitest';

import { normalizeBand, formatBand, compareToBand } from './salaryBand';

const BAND = { min: 80000, max: 120000, currency: 'TRY', period: 'monthly' };

describe('normalizeBand', () => {
    it('reads a full band', () => {
        expect(normalizeBand({ min: '80000', max: '120000', currency: 'TRY', period: 'monthly' })).toEqual(BAND);
    });

    // "En fazla 80 bin" gerçek bir bütçe ifadesi; yarısını uydurmak yerine
    // olduğu gibi tutmak doğru.
    it('accepts an open-ended band', () => {
        expect(normalizeBand({ max: 80000 })).toEqual({ min: null, max: 80000, currency: 'TRY', period: 'monthly' });
        expect(normalizeBand({ min: 80000 })).toEqual({ min: 80000, max: null, currency: 'TRY', period: 'monthly' });
    });

    it('repairs a reversed range instead of rejecting it', () => {
        expect(normalizeBand({ min: 120000, max: 80000 })).toMatchObject({ min: 80000, max: 120000 });
    });

    it('returns null when there is no number at all', () => {
        expect(normalizeBand({ currency: 'TRY' })).toBeNull();
        expect(normalizeBand(null)).toBeNull();
        expect(normalizeBand({ min: 'abc' })).toBeNull();
    });

    it('falls back to sane units rather than storing a half-defined band', () => {
        expect(normalizeBand({ min: 50000, currency: 'XYZ', period: 'hourly' }))
            .toMatchObject({ currency: 'TRY', period: 'monthly' });
    });
});

describe('formatBand', () => {
    it('renders a range with unit and period', () => {
        expect(formatBand(BAND)).toBe('80.000 – 120.000 ₺ (aylık)');
    });

    it('renders open ends readably', () => {
        expect(formatBand({ min: 80000 })).toBe('80.000+ ₺ (aylık)');
        expect(formatBand({ max: 80000 })).toBe('en fazla 80.000 ₺ (aylık)');
    });

    it('is empty when there is no band', () => {
        expect(formatBand(null)).toBe('');
    });
});

describe('compareToBand', () => {
    it('places an expectation inside the band', () => {
        expect(compareToBand(100000, BAND)).toEqual({ status: 'within' });
    });

    it('reports how far above the ceiling an expectation sits', () => {
        const out = compareToBand(150000, BAND);
        expect(out.status).toBe('above');
        expect(out.overshoot).toBeCloseTo(0.25);
    });

    it('places a low expectation below the floor', () => {
        expect(compareToBand(50000, BAND)).toEqual({ status: 'below' });
    });

    // Aday bir aralık söylediyse pazarlığın başlayabileceği en düşük nokta
    // esas alınır.
    it('uses the low end when the candidate gave a range', () => {
        expect(compareToBand({ min: 110000, max: 200000 }, BAND)).toEqual({ status: 'within' });
    });

    // ─── KARŞILAŞTIRMAYI REDDEDENLER ───────────────────────────────────────
    it('refuses to compare across currencies', () => {
        const out = compareToBand({ min: 5000, currency: 'USD', period: 'monthly' }, BAND);
        expect(out.status).toBe('unknown');
        expect(out.reason).toMatch(/kur çevirmiyoruz/i);
    });

    it('refuses to compare monthly against yearly', () => {
        const out = compareToBand({ min: 1200000, currency: 'TRY', period: 'yearly' }, BAND);
        expect(out.status).toBe('unknown');
        expect(out.reason).toMatch(/Dönemler farklı/);
    });

    it('says which side is missing instead of guessing', () => {
        expect(compareToBand(null, BAND).reason).toMatch(/beklentisi kayıtlı değil/);
        expect(compareToBand(100000, null).reason).toMatch(/bütçe bandı tanımlı değil/);
    });

    // Tek uçlu bantta yalnızca tanımlı uç hüküm verir.
    it('only judges against the end that exists', () => {
        expect(compareToBand(200000, { max: 120000 })).toMatchObject({ status: 'above' });
        expect(compareToBand(200000, { min: 80000 })).toEqual({ status: 'within' });
    });
});
