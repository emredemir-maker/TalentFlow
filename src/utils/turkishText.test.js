// Türkçe katlama.
//
// Bu iki tuzak projede canlı hataya yol açtı, ikisi de ayrı ayrı:
//   'İstanbul'.toLowerCase() → 'i̇stanbul' (birleşik nokta) → konum filtresi bozuldu
//   'KALDIR'.toLowerCase()   → 'kaldir'    (noktasız ı gitti) → karar okunamadı
import { describe, expect, it } from 'vitest';

import { foldTr, foldedIncludes } from './turkishText';

describe('foldTr', () => {
    it('collapses dotted and dotless i to the same letter', () => {
        expect(foldTr('İstanbul')).toBe('istanbul');
        expect(foldTr('istanbul')).toBe('istanbul');
        expect(foldTr('ISTANBUL')).toBe('istanbul');
        expect(foldTr('KALDIR')).toBe('kaldir');
        expect(foldTr('kaldır')).toBe('kaldir');
    });

    it('leaves no combining marks behind', () => {
        // Asıl hata buydu: 'İ'.toLowerCase() İKİ kod noktası üretir ve
        // görünürde aynı olan iki metin eşit karşılaştırılmaz
        expect([...foldTr('İzmir')]).toHaveLength(5);
        expect(foldTr('İzmir')).toBe('izmir');
        expect(foldTr('İstanbul') === 'İstanbul'.toLowerCase()).toBe(false);
    });

    it('folds the rest of the Turkish alphabet', () => {
        expect(foldTr('ÇĞÖŞÜ')).toBe('cgosu');
        expect(foldTr('çğöşü')).toBe('cgosu');
        expect(foldTr('Yazılım Mühendisliği')).toBe('yazilim muhendisligi');
    });

    it('handles empty and non-string input', () => {
        expect(foldTr('')).toBe('');
        expect(foldTr(null)).toBe('');
        expect(foldTr(undefined)).toBe('');
        expect(foldTr(42)).toBe('42');
    });
});

describe('foldedIncludes', () => {
    it('matches across the casing trap in both directions', () => {
        expect(foldedIncludes('İstanbul / Kadıköy', 'istanbul')).toBe(true);
        expect(foldedIncludes('istanbul', 'İSTANBUL')).toBe(true);
        expect(foldedIncludes('Ankara', 'İstanbul')).toBe(false);
    });

    it('treats a blank needle as no match rather than matching everything', () => {
        // '' her metinde bulunur; filtre olarak bu sessizce "hepsi" demek olurdu
        expect(foldedIncludes('İstanbul', '')).toBe(false);
        expect(foldedIncludes('İstanbul', '   ')).toBe(false);
    });

    it('tolerates a missing haystack', () => {
        expect(foldedIncludes(null, 'istanbul')).toBe(false);
        expect(foldedIncludes(undefined, 'x')).toBe(false);
    });
});
