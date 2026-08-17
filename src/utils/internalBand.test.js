// KENDİ İLANLARINIZIN BANDI — en önemli test KARIŞIK BİRİMİ REDDEDEN test.
//
// Farklı birimlerdeki bantları tek aralıkta toplamak kur ve dönem uydurmak
// demek. İkinci önemli test EŞİK: iki ilandan bant çıkarmak istatistik değil,
// kılık değiştirmiş tahmin.
import { describe, expect, it } from 'vitest';

import { internalBand, MIN_POSITIONS } from './internalBand';

const pos = (title, band, department = 'Ürün') => ({ title, department, salaryBand: band });
const TRY_G = (min, max) => ({ min, max, currency: 'TRY', period: 'monthly', basis: 'gross' });

describe('internalBand', () => {
    it('spans the observed range across same-unit bands', () => {
        const out = internalBand([
            pos('A', TRY_G(80000, 120000)),
            pos('B', TRY_G(90000, 150000)),
            pos('C', TRY_G(70000, 100000)),
        ]);
        expect(out.band).toEqual({ min: 70000, max: 150000, currency: 'TRY', period: 'monthly', basis: 'gross' });
        expect(out.count).toBe(3);
    });

    // Az veriden bant üretmek istatistik değil, kılık değiştirmiş tahmindir.
    it('refuses below the threshold and says why', () => {
        const out = internalBand([pos('A', TRY_G(80000, 120000)), pos('B', TRY_G(90000, 150000))]);
        expect(out.band).toBeNull();
        expect(out.reason).toContain(String(MIN_POSITIONS));
    });

    // ÇEVRİM YOK: aylık TRY ile yıllık USD'yi tek aralıkta toplamak, kur ve
    // dönem uydurmaktır.
    it('never mixes units — it picks the largest same-unit group', () => {
        const out = internalBand([
            pos('A', TRY_G(80000, 120000)),
            pos('B', TRY_G(90000, 150000)),
            pos('C', TRY_G(70000, 100000)),
            pos('D', { min: 100000, max: 140000, currency: 'USD', period: 'yearly', basis: 'net' }),
        ]);
        expect(out.band.currency).toBe('TRY');
        expect(out.count).toBe(3);
        expect(out.mixedUnits).toBe(true);
    });

    it('explains a mixed-unit pool that has no majority', () => {
        const out = internalBand([
            pos('A', TRY_G(80000, 120000)),
            pos('B', { min: 5000, max: 7000, currency: 'USD', period: 'monthly', basis: 'net' }),
        ]);
        expect(out.band).toBeNull();
        expect(out.reason).toContain('farklı birimlerde');
    });

    // Brüt mü net mi bilinmeyen bir sayı karşılaştırılabilir bir ölçüm değil.
    it('leaves out bands with no basis and counts them in the reason', () => {
        const out = internalBand([
            pos('A', { min: 80000, max: 120000, currency: 'TRY', period: 'monthly' }),
            pos('B', { min: 90000, max: 150000, currency: 'TRY', period: 'monthly' }),
        ]);
        expect(out.band).toBeNull();
        expect(out.reason).toContain('brüt/net');
    });

    it('filters by department and skips the position being drafted', () => {
        const list = [
            pos('A', TRY_G(80000, 120000)),
            pos('B', TRY_G(90000, 150000)),
            pos('C', TRY_G(70000, 100000)),
            pos('D', TRY_G(1000, 2000), 'Satış'),
        ];
        expect(internalBand(list, { department: 'Ürün' }).count).toBe(3);
        expect(internalBand(list, { department: 'Ürün', excludeTitle: 'A' }).band).toBeNull();
    });

    it('uses the single end of an open-ended band instead of inventing the other', () => {
        const out = internalBand([
            pos('A', { max: 120000, currency: 'TRY', period: 'monthly', basis: 'gross' }),
            pos('B', { max: 150000, currency: 'TRY', period: 'monthly', basis: 'gross' }),
            pos('C', { max: 100000, currency: 'TRY', period: 'monthly', basis: 'gross' }),
        ]);
        expect(out.band).toMatchObject({ min: 100000, max: 150000 });
    });

    it('says there is nothing to compare when no position has a band', () => {
        const out = internalBand([{ title: 'A', department: 'Ürün' }]);
        expect(out.band).toBeNull();
        expect(out.reason).toBeTruthy();
    });
});
