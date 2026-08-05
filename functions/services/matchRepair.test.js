import { describe, expect, it, vi } from 'vitest';

vi.mock('./pdf.js', () => ({ pdf: vi.fn() }));
vi.mock('../config/firebaseAdmin.js', () => ({
    db: {},
    admin: { firestore: { FieldValue: { serverTimestamp: () => ({}) } } },
}));

const { planMatchRepair, planMatchRepairs, collectJobIdsNeedingLookup } = await import('./matchRepair.js');

const OPEN = [
    { id: 'p1', title: 'Frontend Developer' },
    { id: 'p2', title: 'Growth Product Manager' },
];

describe('planMatchRepair', () => {
    it('binds to the recruiter-assigned position over any stored title', () => {
        const plan = planMatchRepair(
            { id: 'c1', positionId: 'p2', matchedPositionTitle: 'Uydurma Rol' }, OPEN);
        expect(plan).toEqual({ update: { matchedPositionTitle: 'Growth Product Manager' }, rule: 'assignment' });
    });

    it('returns null when the assignment already matches', () => {
        expect(planMatchRepair({ id: 'c1', positionId: 'p2', matchedPositionTitle: 'Growth Product Manager' }, OPEN)).toBeNull();
    });

    it('canonicalizes case/whitespace variants and links the positionId', () => {
        const plan = planMatchRepair({ id: 'c1', matchedPositionTitle: '  frontend developer ' }, OPEN);
        expect(plan).toEqual({
            update: { matchedPositionTitle: 'Frontend Developer', positionId: 'p1' },
            rule: 'canonical',
        });
    });

    it('links positionId even when the title spelling is already exact', () => {
        const plan = planMatchRepair({ id: 'c1', matchedPositionTitle: 'Frontend Developer', positionId: '' }, OPEN);
        expect(plan).toEqual({
            update: { matchedPositionTitle: 'Frontend Developer', positionId: 'p1' },
            rule: 'canonical',
        });
    });

    it('recovers the bulk-upload target position from the job document', () => {
        const jobs = new Map([['j1', { positionId: 'p2', positionTitle: 'Growth Product Manager' }]]);
        const plan = planMatchRepair(
            { id: 'c1', matchedPositionTitle: 'Halüsinasyon Uzmanı', bulkJobId: 'j1' }, OPEN, jobs);
        expect(plan).toEqual({
            update: { matchedPositionTitle: 'Growth Product Manager', positionId: 'p2' },
            rule: 'job',
        });
    });

    it('falls back to the best keyword-scoring open position', () => {
        const plan = planMatchRepair(
            { id: 'c1', matchedPositionTitle: 'Uydurma Rol', position: 'frontend developer', skills: ['react'] }, OPEN);
        expect(plan.rule).toBe('keyword');
        expect(plan.update.matchedPositionTitle).toBe('Frontend Developer');
        expect(plan.update.positionId).toBe('p1');
    });

    it('writes the null sentinel when an invented title matches nothing', () => {
        const plan = planMatchRepair(
            { id: 'c1', matchedPositionTitle: 'Uydurma Rol', position: 'muhasebeci', skills: [] }, OPEN);
        expect(plan).toEqual({
            update: { matchedPositionTitle: null, matchReason: 'Uygun açık pozisyon bulunamadı.' },
            rule: 'none',
        });
    });

    it('leaves never-scanned candidates (empty title, no recovery path) untouched', () => {
        expect(planMatchRepair({ id: 'c1', matchedPositionTitle: '', position: 'muhasebeci' }, OPEN)).toBeNull();
        expect(planMatchRepair({ id: 'c1', matchedPositionTitle: null }, OPEN)).toBeNull();
    });
});

describe('planMatchRepairs', () => {
    it('returns only candidates that need a change', () => {
        const plans = planMatchRepairs([
            { id: 'ok', positionId: 'p1', matchedPositionTitle: 'Frontend Developer' },
            { id: 'fix', matchedPositionTitle: 'growth product manager' },
        ], OPEN);
        expect(plans).toHaveLength(1);
        expect(plans[0].id).toBe('fix');
    });
});

describe('collectJobIdsNeedingLookup', () => {
    it('collects only jobs of candidates that rules 1-2 cannot fix', () => {
        const ids = collectJobIdsNeedingLookup([
            { id: 'a', bulkJobId: 'j1', matchedPositionTitle: 'Uydurma' },
            { id: 'b', bulkJobId: 'j2', matchedPositionTitle: 'Frontend Developer' }, // kural 2 çözer
            { id: 'c', bulkJobId: 'j3', positionId: 'p1' },                            // kural 1 çözer
            { id: 'd', matchedPositionTitle: 'Uydurma' },                              // işi yok
            { id: 'e', bulkJobId: 'j1', matchedPositionTitle: '' },                    // aynı iş tekrar sayılmaz
        ], OPEN);
        expect(ids).toEqual(['j1']);
    });
});
