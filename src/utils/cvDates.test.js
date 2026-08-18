// CV TARİHLERİ — yanlış okunan bir tarih, bir insanı yalancılıkla suçlar.
//
// Bu testlerin en önemlileri OKUYAMADIĞINI SÖYLEYENLER. Ayrıştırılamayan bir
// aralığı sessizce "0 ay" saymak toplam deneyimi küçültür ve tam da sahtecilik
// bayrağını tetikler — yani ayrıştırıcı hatası, kullanıcıya adayın yalanı
// olarak görünür. null dönmek bir başarısızlık değil, doğru cevap.
import { describe, expect, it } from 'vitest';

import {
    parseDatePart,
    parseDuration,
    toWindow,
    unionMonths,
    overlapMonths,
    formatMonths,
    currentYearMonth,
} from './cvDates';

const TODAY = { year: 2026, month: 8 };

describe('parseDatePart', () => {
    it('reads Turkish month names, short and long', () => {
        expect(parseDatePart('Oca 2020')).toEqual({ year: 2020, month: 1 });
        expect(parseDatePart('Ocak 2020')).toEqual({ year: 2020, month: 1 });
        expect(parseDatePart('Ağustos 2021')).toEqual({ year: 2021, month: 8 });
        expect(parseDatePart('Ağu 2021')).toEqual({ year: 2021, month: 8 });
        expect(parseDatePart('Aralık 2019')).toEqual({ year: 2019, month: 12 });
    });

    // 'İ' bazen tek kod noktası, bazen 'i' + birleşik nokta geliyor. Bu tuzağı
    // bu projede defalarca gördük (bkz. utils/turkishText.js).
    it('survives Turkish casing traps', () => {
        expect(parseDatePart('EYLÜL 2022')).toEqual({ year: 2022, month: 9 });
        expect(parseDatePart('şubat 2018')).toEqual({ year: 2018, month: 2 });
        expect(parseDatePart('ŞUBAT 2018')).toEqual({ year: 2018, month: 2 });
    });

    it('reads English month names', () => {
        expect(parseDatePart('January 2020')).toEqual({ year: 2020, month: 1 });
        expect(parseDatePart('Sept 2020')).toEqual({ year: 2020, month: 9 });
    });

    it('reads numeric forms in either order', () => {
        expect(parseDatePart('01/2020')).toEqual({ year: 2020, month: 1 });
        expect(parseDatePart('2020-03')).toEqual({ year: 2020, month: 3 });
        expect(parseDatePart('12.2019')).toEqual({ year: 2019, month: 12 });
    });

    // Ay yoksa UYDURULMAZ. null ay, "belirsiz" demek.
    it('keeps the month unknown when only a year is given', () => {
        expect(parseDatePart('2020')).toEqual({ year: 2020, month: null });
    });

    it('rejects things that are not dates', () => {
        expect(parseDatePart('')).toBeNull();
        expect(parseDatePart(null)).toBeNull();
        expect(parseDatePart('%300 büyüme')).toBeNull();
        // 45 bir yıl değil; bu bir metrik ya da yaş.
        expect(parseDatePart('45')).toBeNull();
    });
});

describe('parseDuration', () => {
    it('reads the common CV forms', () => {
        expect(parseDuration('Oca 2020 - Mar 2023')).toEqual({
            start: { year: 2020, month: 1 },
            end: { year: 2023, month: 3 },
            current: false,
            precision: 'month',
        });
        expect(parseDuration('2020-2023')).toMatchObject({
            start: { year: 2020, month: null },
            end: { year: 2023, month: null },
            precision: 'year',
        });
        expect(parseDuration('01/2020 – 03/2023')).toMatchObject({ precision: 'month' });
    });

    // "Halen" tanınmazsa görev süresi ölçülemez ve aday deneyimini
    // şişirmiş gibi görünür. Liste eksik kalırsa bedeli bu.
    it('recognises every way a CV says "still working here"', () => {
        for (const word of ['Halen', 'halen devam ediyor', 'Günümüz', 'Devam', 'Şu an', 'Present', 'current', 'ongoing']) {
            const parsed = parseDuration(`Ocak 2020 - ${word}`);
            expect(parsed, word).toMatchObject({ current: true, end: null });
        }
    });

    it('treats a lone date as a start with no measurable length', () => {
        expect(parseDuration('2020')).toEqual({
            start: { year: 2020, month: null },
            end: null,
            current: false,
            precision: 'year',
        });
    });

    // Okunamadığını SÖYLEMEK zorunda — sessizce sıfır dönmek yanlış suçlama üretir.
    it('returns null rather than guessing', () => {
        expect(parseDuration('')).toBeNull();
        expect(parseDuration(null)).toBeNull();
        expect(parseDuration('uzun yıllar')).toBeNull();
        expect(parseDuration('Halen')).toBeNull();
    });
});

describe('toWindow', () => {
    it('counts the end month as worked', () => {
        // Oca 2020 - Oca 2020 bir aylık görevdir, sıfır değil.
        const w = toWindow(parseDuration('Oca 2020 - Oca 2020'), TODAY);
        expect(w.to - w.from).toBe(1);
    });

    it('measures a plain range in months', () => {
        const w = toWindow(parseDuration('Oca 2020 - Ara 2020'), TODAY);
        expect(w.to - w.from).toBe(12);
    });

    it('runs an ongoing role up to today', () => {
        const w = toWindow(parseDuration('Oca 2026 - Halen'), TODAY);
        expect(w.to - w.from).toBe(8); // Oca..Ağu 2026
    });

    // Yıl-only kayıtları Ocak→Aralık saymak her kaydı 12 aya yuvarlar ve
    // toplamı sistematik olarak şişirir. İki uçta da yılın ortası alınır.
    it('does not inflate year-only ranges to full years', () => {
        const w = toWindow(parseDuration('2020-2023'), TODAY);
        expect(w.to - w.from).toBe(37); // 3 yıl + bitiş ayı, 4 yıl değil
    });

    it('returns null when there is nothing to measure', () => {
        expect(toWindow(parseDuration('2020'), TODAY)).toBeNull();
        expect(toWindow(null, TODAY)).toBeNull();
        // Ters aralık ölçülemez.
        expect(toWindow(parseDuration('Oca 2023 - Oca 2020'), TODAY)).toBeNull();
    });
});

describe('unionMonths', () => {
    it('adds up windows that do not touch', () => {
        expect(unionMonths([{ from: 0, to: 12 }, { from: 24, to: 36 }])).toBe(24);
    });

    // ASIL MESELE BU: paralel iki görev toplanırsa 4 yıllık kariyer 8 yıl
    // görünür, aday beyanından fazla çıkar ve hiçbir bayrak tetiklenmez.
    it('counts overlapping roles once', () => {
        expect(unionMonths([{ from: 0, to: 24 }, { from: 12, to: 36 }])).toBe(36);
    });

    it('merges a window fully contained in another', () => {
        expect(unionMonths([{ from: 0, to: 48 }, { from: 12, to: 24 }])).toBe(48);
    });

    it('ignores nulls and handles an empty list', () => {
        expect(unionMonths([])).toBe(0);
        expect(unionMonths([null, { from: 0, to: 6 }, null])).toBe(6);
    });
});

describe('overlapMonths', () => {
    it('measures the shared span', () => {
        expect(overlapMonths({ from: 0, to: 24 }, { from: 12, to: 36 })).toBe(12);
    });

    it('is zero for adjacent or disjoint windows', () => {
        expect(overlapMonths({ from: 0, to: 12 }, { from: 12, to: 24 })).toBe(0);
        expect(overlapMonths({ from: 0, to: 12 }, { from: 24, to: 36 })).toBe(0);
        expect(overlapMonths(null, { from: 0, to: 12 })).toBe(0);
    });
});

describe('formatMonths', () => {
    it('writes durations the way a recruiter reads them', () => {
        expect(formatMonths(0)).toBe('0 ay');
        expect(formatMonths(5)).toBe('5 ay');
        expect(formatMonths(12)).toBe('1 yıl');
        expect(formatMonths(38)).toBe('3 yıl 2 ay');
    });
});

describe('currentYearMonth', () => {
    it('reports a 1-based month', () => {
        expect(currentYearMonth(new Date(2026, 7, 18))).toEqual({ year: 2026, month: 8 });
    });
});
