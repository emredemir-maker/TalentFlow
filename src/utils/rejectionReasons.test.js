import { describe, it, expect } from 'vitest';
import {
    REJECTION_REASONS,
    REJECTION_CATEGORIES,
    resolveRejection,
    rejectionBreakdown,
} from './rejectionReasons';

describe('red nedenleri', () => {
    it('her nedenin tanımlı bir kategorisi var', () => {
        const gecerli = new Set(REJECTION_CATEGORIES.map((c) => c.id));
        for (const r of REJECTION_REASONS) expect(gecerli.has(r.category)).toBe(true);
    });

    it('kimlikler benzersiz', () => {
        const ids = REJECTION_REASONS.map((r) => r.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('ESKİ KİMLİKLER KAYBOLMUYOR — çekmecedeki üç seçenek', () => {
        expect(resolveRejection('not_suitable').id).toBe('criteria_not_met');
        expect(resolveRejection('declined').id).toBe('candidate_declined');
        expect(resolveRejection('wrong_entry').id).toBe('duplicate_or_error');
    });

    it('ESKİ SERBEST METİN KAYBOLMUYOR — detay sayfasındaki kutu', () => {
        // Firestore'da "Teknik Yetersizlik" gibi düz metinler var.
        const r = resolveRejection('Teknik Yetersizlik');
        expect(r.id).toBe('other');
        expect(r.note).toBe('Teknik Yetersizlik');
    });

    it('neden girilmemişse null', () => {
        expect(resolveRejection(null)).toBeNull();
        expect(resolveRejection('')).toBeNull();
        expect(resolveRejection('   ')).toBeNull();
    });

    it('bozuk tip çökertmiyor', () => {
        expect(() => resolveRejection(42)).not.toThrow();
        expect(() => resolveRejection({})).not.toThrow();
    });

    it('kırılım nedene ve kategoriye göre sayıyor', () => {
        const sonuc = rejectionBreakdown([
            { rejectionReason: 'criteria_not_met' },
            { rejectionReason: 'criteria_not_met' },
            { rejectionReason: 'candidate_declined' },
            { rejectionReason: 'not_suitable' },      // eski kimlik → criteria_not_met
            { rejectionReason: null },                // neden girilmemiş
        ]);
        expect(sonuc.total).toBe(5);
        expect(sonuc.missing).toBe(1);
        expect(sonuc.byReason[0]).toMatchObject({ id: 'criteria_not_met', count: 3 });
        const sirket = sonuc.byCategory.find((c) => c.id === 'company');
        const aday = sonuc.byCategory.find((c) => c.id === 'candidate');
        expect(sirket.count).toBe(3);
        expect(aday.count).toBe(1);
    });

    it('boş liste sıfır döndürüyor, çökmüyor', () => {
        expect(rejectionBreakdown([])).toEqual({ byReason: [], byCategory: [], total: 0, missing: 0 });
        expect(rejectionBreakdown(null).total).toBe(0);
    });
});
