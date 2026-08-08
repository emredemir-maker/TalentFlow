// Öneriyi uygulama.
//
// Bildirilen hata: "öneriyi uygula dediğimizde o öneriyi uygulamıyor".
// Sebep, düğmenin danışmanın KARARINI ("action") görmezden gelip yalnızca
// metni değiştirmesiydi — "tercihene al" önerisinden sonra madde zorunlu
// kalıyor, "kaldır" önerisinden sonra madde ilanda duruyordu.
import { describe, expect, it } from 'vitest';

import {
    applyRequirementAction, normalizeAction, REWRITE, DEMOTE, REMOVE,
} from './requirementEdit';

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

describe('applyRequirementAction — yeniden-yaz', () => {
    it('replaces only that requirement and keeps its must flag', () => {
        const r = applyRequirementAction(prioritized(), 1, {
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

describe('applyRequirementAction — tercihene-al', () => {
    it('BOTH rewrites the text and drops the must flag', () => {
        // Asıl hata buydu: metin değişiyor ama madde zorunlu kalıyordu
        const r = applyRequirementAction(prioritized(), 1, {
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
        const r = applyRequirementAction(legacy(), 1, { action: 'tercihene-al', suggestion: 'Yeni A' });
        expect(r.action).toBe(REWRITE);
        expect(r.requested).toBe(DEMOTE);
        expect(r.downgradeNote).toBeTruthy();
        expect(r.updates.requirementsMeta).toBeUndefined();
        expect(r.updates.requirements).toEqual(['Yeni A', 'B']);
    });

    it('downgrades when the requirement is already nice-to-have', () => {
        const r = applyRequirementAction(prioritized(), 3, { action: 'tercihene-al', suggestion: 'SaaS deneyimi' });
        expect(r.action).toBe(REWRITE);
        expect(r.updates.requirementsMeta[2]).toEqual({ text: 'SaaS deneyimi', must: false });
    });
});

describe('applyRequirementAction — kaldır', () => {
    it('actually removes the requirement from both fields', () => {
        const r = applyRequirementAction(prioritized(), 2, { action: 'kaldır', suggestion: 'yok sayılmalı' });
        expect(r.action).toBe(REMOVE);
        expect(r.updates.requirements).toEqual(['GA4 hakimiyeti', 'B2B SaaS']);
        expect(r.updates.requirementsMeta.map((m) => m.text)).toEqual(['GA4 hakimiyeti', 'B2B SaaS']);
        expect(r.confirmText).toContain('KALDIRILACAK');
    });

    it('does not need a suggestion text', () => {
        const r = applyRequirementAction(prioritized(), 2, { action: 'kaldır' });
        expect(r.updates.requirements).toEqual(['GA4 hakimiyeti', 'B2B SaaS']);
    });

    it('can empty the list', () => {
        const one = { id: 'p', title: 'X', requirements: ['A'], requirementsMeta: [{ text: 'A', must: true }] };
        const r = applyRequirementAction(one, 1, { action: 'kaldır' });
        expect(r.updates.requirements).toEqual([]);
    });
});

describe('applyRequirementAction — guards', () => {
    it('returns null for a missing requirement', () => {
        expect(applyRequirementAction(prioritized(), 9, { action: 'kaldır' })).toBeNull();
        expect(applyRequirementAction(prioritized(), 0, { suggestion: 'X' })).toBeNull();
        expect(applyRequirementAction(null, 1, { suggestion: 'X' })).toBeNull();
    });

    it('returns null when a rewrite has no new text', () => {
        expect(applyRequirementAction(prioritized(), 1, { action: 'yeniden-yaz' })).toBeNull();
        expect(applyRequirementAction(prioritized(), 1, { action: 'yeniden-yaz', suggestion: '   ' })).toBeNull();
    });

    it('returns null when the suggestion is identical to the current text', () => {
        expect(applyRequirementAction(prioritized(), 1, {
            action: 'yeniden-yaz', suggestion: 'GA4 hakimiyeti',
        })).toBeNull();
    });

    it('still applies when only the priority changes', () => {
        const r = applyRequirementAction(prioritized(), 1, {
            action: 'tercihene-al', suggestion: 'GA4 hakimiyeti',
        });
        expect(r.action).toBe(DEMOTE);
        expect(r.updates.requirementsMeta[0].must).toBe(false);
    });

    it('never mutates the position it was given', () => {
        const pos = prioritized();
        const snapshot = JSON.stringify(pos);
        applyRequirementAction(pos, 1, { action: 'kaldır' });
        expect(JSON.stringify(pos)).toBe(snapshot);
    });

    it('returns a position ready for the rescan flow', () => {
        const r = applyRequirementAction(prioritized(), 1, { action: 'kaldır' });
        expect(r.nextPosition.id).toBe('p1');
        expect(r.nextPosition.requirements).toEqual(['Funnel sahipliği', 'B2B SaaS']);
    });
});
