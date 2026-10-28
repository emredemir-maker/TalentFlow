import { describe, it, expect } from 'vitest';
import {
    toMillis, waitingDays, waitingLabel, nextStepFor, flowIndex, positionHealth, STALE_DAYS,
} from './candidateFlow';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86400000);

describe('candidateFlow', () => {
    it('toMillis farklı zaman biçimlerini okur, bozuk değerde 0 döner', () => {
        expect(toMillis(null)).toBe(0);
        expect(toMillis('bozuk')).toBe(0);
        expect(toMillis(NOW)).toBe(NOW);
        expect(toMillis(new Date(NOW))).toBe(NOW);
        expect(toMillis({ toMillis: () => NOW })).toBe(NOW);
        expect(toMillis({ seconds: NOW / 1000 })).toBe(NOW);
        expect(toMillis('2026-10-28T12:00:00Z')).toBe(NOW);
    });

    it('bekleme süresi updatedAt, yoksa createdAt üzerinden; ikisi de yoksa null', () => {
        expect(waitingDays({ updatedAt: daysAgo(3), createdAt: daysAgo(10) }, NOW)).toBe(3);
        expect(waitingDays({ createdAt: daysAgo(10) }, NOW)).toBe(10);
        expect(waitingDays({}, NOW)).toBeNull();
        expect(waitingDays(null, NOW)).toBeNull();
        // Gelecekteki damga negatif gün üretmez.
        expect(waitingDays({ updatedAt: new Date(NOW + 86400000) }, NOW)).toBe(0);
    });

    it('bekleme etiketi', () => {
        expect(waitingLabel(null)).toBe('—');
        expect(waitingLabel(0)).toBe('Bugün');
        expect(waitingLabel(5)).toBe('5 gün');
    });

    it('sıradaki adım bitmiş süreçte yok, teklifte top adayda', () => {
        expect(nextStepFor('review')).toEqual({ label: 'Mülakat planla', owner: 'team' });
        expect(nextStepFor('offer').owner).toBe('candidate');
        expect(nextStepFor('hired')).toBeNull();
        expect(nextStepFor('rejected')).toBeNull();
        expect(nextStepFor(undefined)).toBeNull();
    });

    it('akış konumu: ret akışın dışında', () => {
        expect(flowIndex('ai_analysis')).toBe(0);
        expect(flowIndex('hired')).toBe(5);
        expect(flowIndex('rejected')).toBe(-1);
    });

    it('ilan sağlığı', () => {
        const fresh = { updatedAt: daysAgo(1) };
        const old = { updatedAt: daysAgo(STALE_DAYS + 2) };
        expect(positionHealth([], NOW)).toBe('empty');
        expect(positionHealth(undefined, NOW)).toBe('empty');
        expect(positionHealth([{ stage: 'rejected', candidate: fresh }], NOW)).toBe('thin');
        expect(positionHealth([{ stage: 'review', candidate: old }, { stage: 'offer', candidate: old }], NOW)).toBe('stalled');
        expect(positionHealth([{ stage: 'review', candidate: fresh }], NOW)).toBe('thin');
        expect(positionHealth([{ stage: 'review', candidate: fresh }, { stage: 'offer', candidate: old }], NOW)).toBe('ok');
    });
});
