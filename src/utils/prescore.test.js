// Ön analiz: ayrıştırma + ön skor TEK çağrıda. Skor alanlarının doğrulanması.
import { describe, expect, it } from 'vitest';

import { prescoreInstruction, normalizePrescore, stripPrescoreFields } from './prescore';

const OPEN = ['Growth Product Manager', 'Backend Developer'];

describe('prescoreInstruction', () => {
    it('targets the applied position on the application form', () => {
        const text = prescoreInstruction({ positionTitle: 'Backend Developer' });
        expect(text).toContain('Hedef pozisyon: "Backend Developer"');
        expect(text).toContain('"matchScore"');
    });

    it('lists open positions for manual add', () => {
        const text = prescoreInstruction({ openPositionTitles: OPEN });
        expect(text).toContain('"Growth Product Manager", "Backend Developer"');
        expect(text).toContain('null yaz');
    });

    it('works without any open position', () => {
        expect(prescoreInstruction({})).toContain('Açık pozisyon listesi yok');
    });
});

describe('normalizePrescore', () => {
    it('accepts a listed title regardless of case and spacing', () => {
        const out = normalizePrescore(
            { matchScore: 81, matchedPosition: ' growth  product manager ', matchReason: 'Funnel deneyimi güçlü.' },
            { openPositionTitles: OPEN }
        );
        expect(out).toEqual({ score: 81, matchedTitle: 'Growth Product Manager', reason: 'Funnel deneyimi güçlü.' });
    });

    it('drops a title that is not an open position (score goes to 0)', () => {
        const out = normalizePrescore({ matchScore: 70, matchedPosition: 'CEO' }, { openPositionTitles: OPEN });
        expect(out.matchedTitle).toBeNull();
        expect(out.score).toBe(0);
    });

    it('binds the score to the applied position on the application form', () => {
        const out = normalizePrescore({ matchScore: 140, matchedPosition: 'Başka' }, { positionTitle: 'Backend Developer' });
        expect(out).toMatchObject({ score: 100, matchedTitle: 'Backend Developer' });
    });

    it('returns null when the model gave no score — caller falls back to keywords', () => {
        expect(normalizePrescore({ name: 'X' }, { openPositionTitles: OPEN })).toBeNull();
        expect(normalizePrescore(null, {})).toBeNull();
    });
});

describe('stripPrescoreFields', () => {
    it('keeps score fields out of the candidate record', () => {
        expect(stripPrescoreFields({ name: 'X', matchScore: 5, matchedPosition: 'Y', matchReason: 'Z' })).toEqual({ name: 'X' });
    });
});
