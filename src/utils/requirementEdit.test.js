// Öneriyi uygulama.
//
// Bildirilen hata: "öneriyi uygula dediğimizde o öneriyi uygulamıyor".
// Sebep, düğmenin danışmanın KARARINI ("action") görmezden gelip yalnızca
// metni değiştirmesiydi — "tercihene al" önerisinden sonra madde zorunlu
// kalıyor, "kaldır" önerisinden sonra madde ilanda duruyordu.
import { describe, expect, it } from 'vitest';

import {
    planRequirementChanges, normalizeAction, REWRITE, DEMOTE, REMOVE,
} from './requirementEdit';

/** Tek öneri — çoğul planlayıcının tek maddelik hâli. */
function one(position, index, review = {}) {
    const plan = planRequirementChanges(position, [{ ...review, index }]);
    if (!plan) return null;
    return { ...plan, ...plan.changes[0] };
}

const prioritized = () => ({
    id: 'p1',
    title: 'Growth PM',
    requirements: ['GA4 hakimiyeti', 'Funnel sahipliği', 'B2B SaaS'],
    requirementsMeta: [
        { text: 'GA4 hakimiyeti', must: true },
        { text: 'Funnel sahipliği', must: true },
        { text: 'B2B SaaS', must: false },
    ],
});

const legacy = () => ({ id: 'p2', title: 'Eski ilan', requirements: ['A', 'B'] });

describe('normalizeAction', () => {
    it('reads the three documented actions', () => {
        expect(normalizeAction('yeniden-yaz')).toBe(REWRITE);
        expect(normalizeAction('tercihene-al')).toBe(DEMOTE);
        expect(normalizeAction('kaldır')).toBe(REMOVE);
    });

    it('survives the Turkish lowercase trap', () => {
        // 'KALDIR'.toLowerCase() JS'te 'kaldir' üretir; noktasız ı kaybolur
        expect(normalizeAction('KALDIR')).toBe(REMOVE);
        expect(normalizeAction('Kaldir')).toBe(REMOVE);
        expect(normalizeAction('kaldir')).toBe(REMOVE);
    });

    it('tolerates spacing and phrasing the model actually produces', () => {
        expect(normalizeAction('Tercihene Al')).toBe(DEMOTE);
        expect(normalizeAction('tercihen listesine al')).toBe(DEMOTE);
        expect(normalizeAction('  yeniden yaz ')).toBe(REWRITE);
    });

    it('falls back to the harmless action when unrecognised', () => {
        // Tanınmayan kararla madde SİLMEK ya da önceliğini düşürmek olmaz
        expect(normalizeAction('')).toBe(REWRITE);
        expect(normalizeAction(null)).toBe(REWRITE);
        expect(normalizeAction('bilinmeyen bir şey')).toBe(REWRITE);
    });
});

describe('tek öneri — yeniden-yaz', () => {
    it('replaces only that requirement and keeps its must flag', () => {
        const r = one(prioritized(), 1, {
            action: 'yeniden-yaz', suggestion: 'Ürün analitiği ile funnel analizi yapmış olmak',
        });
        expect(r.action).toBe(REWRITE);
        expect(r.updates.requirements).toEqual([
            'Ürün analitiği ile funnel analizi yapmış olmak', 'Funnel sahipliği', 'B2B SaaS',
        ]);
        expect(r.updates.requirementsMeta).toEqual([
            { text: 'Ürün analitiği ile funnel analizi yapmış olmak', must: true },
            { text: 'Funnel sahipliği', must: true },
            { text: 'B2B SaaS', must: false },
        ]);
    });
});

describe('tek öneri — tercihene-al', () => {
    it('BOTH rewrites the text and drops the must flag', () => {
        // Asıl hata buydu: metin değişiyor ama madde zorunlu kalıyordu
        const r = one(prioritized(), 1, {
            action: 'tercihene-al', suggestion: 'Ürün analitiği deneyimi',
        });
        expect(r.action).toBe(DEMOTE);
        expect(r.updates.requirementsMeta[0]).toEqual({ text: 'Ürün analitiği deneyimi', must: false });
        expect(r.updates.requirementsMeta[1].must).toBe(true);
        expect(r.confirmText).toContain('TERCİHEN');
    });

    it('downgrades to a rewrite on a position with no must/nice split', () => {
        // Meta yazmak legacy ilanda TÜM maddeleri sessizce tercihen yapardı:
        // requirementsOf, must:null'ı Boolean(null) ile false'a çevirir
        const r = one(legacy(), 1, { action: 'tercihene-al', suggestion: 'Yeni A' });
        expect(r.action).toBe(REWRITE);
        expect(r.requested).toBe(DEMOTE);
        expect(r.downgradeNote).toBeTruthy();
        expect(r.updates.requirementsMeta).toBeUndefined();
        expect(r.updates.requirements).toEqual(['Yeni A', 'B']);
    });

    it('downgrades when the requirement is already nice-to-have', () => {
        const r = one(prioritized(), 3, { action: 'tercihene-al', suggestion: 'SaaS deneyimi' });
        expect(r.action).toBe(REWRITE);
        expect(r.updates.requirementsMeta[2]).toEqual({ text: 'SaaS deneyimi', must: false });
    });
});

describe('tek öneri — kaldır', () => {
    it('actually removes the requirement from both fields', () => {
        const r = one(prioritized(), 2, { action: 'kaldır', suggestion: 'yok sayılmalı' });
        expect(r.action).toBe(REMOVE);
        expect(r.updates.requirements).toEqual(['GA4 hakimiyeti', 'B2B SaaS']);
        expect(r.updates.requirementsMeta.map((m) => m.text)).toEqual(['GA4 hakimiyeti', 'B2B SaaS']);
        expect(r.confirmText).toContain('KALDIRILACAK');
    });

    it('does not need a suggestion text', () => {
        const r = one(prioritized(), 2, { action: 'kaldır' });
        expect(r.updates.requirements).toEqual(['GA4 hakimiyeti', 'B2B SaaS']);
    });

    it('can empty the list', () => {
        const single = { id: 'p', title: 'X', requirements: ['A'], requirementsMeta: [{ text: 'A', must: true }] };
        const r = one(single, 1, { action: 'kaldır' });
        expect(r.updates.requirements).toEqual([]);
    });
});

describe('tek öneri — guards', () => {
    it('returns null for a missing requirement', () => {
        expect(one(prioritized(), 9, { action: 'kaldır' })).toBeNull();
        expect(one(prioritized(), 0, { suggestion: 'X' })).toBeNull();
        expect(one(null, 1, { suggestion: 'X' })).toBeNull();
    });

    it('returns null when a rewrite has no new text', () => {
        expect(one(prioritized(), 1, { action: 'yeniden-yaz' })).toBeNull();
        expect(one(prioritized(), 1, { action: 'yeniden-yaz', suggestion: '   ' })).toBeNull();
    });

    it('returns null when the suggestion is identical to the current text', () => {
        expect(one(prioritized(), 1, {
            action: 'yeniden-yaz', suggestion: 'GA4 hakimiyeti',
        })).toBeNull();
    });

    it('still applies when only the priority changes', () => {
        const r = one(prioritized(), 1, {
            action: 'tercihene-al', suggestion: 'GA4 hakimiyeti',
        });
        expect(r.action).toBe(DEMOTE);
        expect(r.updates.requirementsMeta[0].must).toBe(false);
    });

    it('never mutates the position it was given', () => {
        const pos = prioritized();
        const snapshot = JSON.stringify(pos);
        one(pos, 1, { action: 'kaldır' });
        expect(JSON.stringify(pos)).toBe(snapshot);
    });

    it('returns a position ready for the rescan flow', () => {
        const r = one(prioritized(), 1, { action: 'kaldır' });
        expect(r.nextPosition.id).toBe('p1');
        expect(r.nextPosition.requirements).toEqual(['Funnel sahipliği', 'B2B SaaS']);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TOPLU uygulama.
//
// Bildirilen ikinci sorun: danışman 3 öneri veriyor, her uygulamada panel
// kapanıp yeniden tarama ekranı açılıyor ve kullanıcı öneriyi baştan istemek
// zorunda kalıyordu. Üçünü tek yazmada uygulayıp taramayı SONA bırakıyoruz.
// ─────────────────────────────────────────────────────────────────────────────
describe('planRequirementChanges — toplu', () => {
    it('applies three suggestions in a single write', () => {
        const plan = planRequirementChanges(prioritized(), [
            { index: 1, action: 'yeniden-yaz', suggestion: 'Ürün analitiği deneyimi' },
            { index: 2, action: 'yeniden-yaz', suggestion: 'Uçtan uca funnel sahipliği' },
            { index: 3, action: 'yeniden-yaz', suggestion: 'B2B SaaS ürün deneyimi' },
        ]);
        expect(plan.changes).toHaveLength(3);
        expect(plan.updates.requirements).toEqual([
            'Ürün analitiği deneyimi', 'Uçtan uca funnel sahipliği', 'B2B SaaS ürün deneyimi',
        ]);
        expect(plan.updates.requirementsMeta.map((m) => m.must)).toEqual([true, true, false]);
    });

    it('mixes actions in one pass', () => {
        const plan = planRequirementChanges(prioritized(), [
            { index: 1, action: 'tercihene-al', suggestion: 'Ürün analitiği deneyimi' },
            { index: 2, action: 'kaldır' },
            { index: 3, action: 'yeniden-yaz', suggestion: 'SaaS deneyimi' },
        ]);
        expect(plan.updates.requirementsMeta).toEqual([
            { text: 'Ürün analitiği deneyimi', must: false },
            { text: 'SaaS deneyimi', must: false },
        ]);
    });

    it('removal does NOT shift the other suggestions onto the wrong items', () => {
        // Tek geçişte kurulduğu için 3 numaralı öneri, 2 kaldırılsa bile
        // 3 numaralı maddeye uygulanır — kaydırma hatası mümkün değil
        const plan = planRequirementChanges(prioritized(), [
            { index: 2, action: 'kaldır' },
            { index: 3, action: 'yeniden-yaz', suggestion: 'YENİ ÜÇÜNCÜ' },
        ]);
        expect(plan.updates.requirements).toEqual(['GA4 hakimiyeti', 'YENİ ÜÇÜNCÜ']);
    });

    it('reports how old numbers map to new ones', () => {
        // Panel elindeki önerileri bu haritayla yeniden numaralandırır;
        // aksi hâlde kaldırmadan sonra öneriler yanlış maddeye yapışır
        const plan = planRequirementChanges(prioritized(), [{ index: 1, action: 'kaldır' }]);
        expect(plan.indexMap.get(1)).toBeNull();
        expect(plan.indexMap.get(2)).toBe(1);
        expect(plan.indexMap.get(3)).toBe(2);
    });

    it('skips the ones that cannot change and keeps the rest', () => {
        const plan = planRequirementChanges(prioritized(), [
            { index: 1, action: 'yeniden-yaz', suggestion: 'GA4 hakimiyeti' }, // aynı metin
            { index: 2, action: 'yeniden-yaz' },                               // metin yok
            { index: 3, action: 'yeniden-yaz', suggestion: 'SaaS deneyimi' },
            { index: 9, action: 'kaldır' },                                    // yok
        ]);
        expect(plan.changes.map((c) => c.index)).toEqual([3]);
        expect(plan.updates.requirements).toEqual(['GA4 hakimiyeti', 'Funnel sahipliği', 'SaaS deneyimi']);
    });

    it('returns null when nothing at all can be applied', () => {
        expect(planRequirementChanges(prioritized(), [])).toBeNull();
        expect(planRequirementChanges(prioritized(), [{ index: 1, suggestion: 'GA4 hakimiyeti' }])).toBeNull();
        expect(planRequirementChanges({ title: 'boş' }, [{ index: 1, suggestion: 'X' }])).toBeNull();
    });

    it('ignores a duplicated index instead of applying it twice', () => {
        const plan = planRequirementChanges(prioritized(), [
            { index: 1, action: 'yeniden-yaz', suggestion: 'İlk' },
            { index: 1, action: 'kaldır' },
        ]);
        expect(plan.changes).toHaveLength(1);
        expect(plan.updates.requirements[0]).toBe('İlk');
    });

    it('lists every change in the confirm text', () => {
        const plan = planRequirementChanges(prioritized(), [
            { index: 1, action: 'tercihene-al', suggestion: 'Ürün analitiği' },
            { index: 2, action: 'kaldır' },
        ]);
        expect(plan.confirmText).toContain('2 gereksinim güncellenecek');
        expect(plan.confirmText).toContain('TERCİHEN');
        expect(plan.confirmText).toContain('KALDIRILACAK');
    });

    it('collects downgrade notes for the whole batch', () => {
        const plan = planRequirementChanges(legacy(), [
            { index: 1, action: 'tercihene-al', suggestion: 'Yeni A' },
            { index: 2, action: 'tercihene-al', suggestion: 'Yeni B' },
        ]);
        expect(plan.notes).toHaveLength(2);
        expect(plan.updates.requirementsMeta).toBeUndefined();
        expect(plan.updates.requirements).toEqual(['Yeni A', 'Yeni B']);
    });
});
