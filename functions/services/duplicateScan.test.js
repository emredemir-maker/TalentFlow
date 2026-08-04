import { describe, expect, it } from 'vitest';
import { groupDuplicateCandidates, normEmail, normPhone } from './duplicateScan.js';

const mk = (id, email, phone, createdAtMs, name = '') => ({ id, email, phone, createdAtMs, name });

describe('normalizers', () => {
    it('email: lowercases and trims but KEEPS dots', () => {
        expect(normEmail('  Ali.Veli@Firma.COM ')).toBe('ali.veli@firma.com');
        expect(normEmail(null)).toBe('');
    });
    it('phone: strips separators', () => {
        expect(normPhone('+90 (555) 111-22.33')).toBe('905551112233');
        expect(normPhone(null)).toBe('');
    });
});

describe('groupDuplicateCandidates', () => {
    it('groups by normalized email and keeps the oldest', () => {
        const groups = groupDuplicateCandidates([
            mk('new1', 'Ali@Firma.com', '', 2000),
            mk('old1', 'ali@firma.com', '', 1000),
            mk('other', 'baska@firma.com', '', 1500),
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0].keep.id).toBe('old1');
        expect(groups[0].extras.map((e) => e.id)).toEqual(['new1']);
    });

    it('falls back to phone only when email is missing', () => {
        const groups = groupDuplicateCandidates([
            mk('p1', '', '+90 555 111 22 33', 1000),
            mk('p2', '', '05551112233', 2000), // farklı normalize: 05551112233 ≠ 905551112233
            mk('p3', '', '+90 (555) 111-2233', 3000),
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0].keep.id).toBe('p1');
        expect(groups[0].extras.map((e) => e.id)).toEqual(['p3']);
    });

    it('skips candidates with neither email nor phone', () => {
        expect(groupDuplicateCandidates([mk('x', '', '', 1), mk('y', '', '', 2)])).toHaveLength(0);
    });

    it('sorts groups by extra count, largest first', () => {
        const groups = groupDuplicateCandidates([
            mk('a1', 'a@a.com', '', 1), mk('a2', 'a@a.com', '', 2),
            mk('b1', 'b@b.com', '', 1), mk('b2', 'b@b.com', '', 2), mk('b3', 'b@b.com', '', 3),
        ]);
        expect(groups.map((g) => g.keep.id)).toEqual(['b1', 'a1']);
        expect(groups[0].extras).toHaveLength(2);
    });

    it('returns empty for unique candidates', () => {
        expect(groupDuplicateCandidates([mk('u1', 'x@y.com', '', 1), mk('u2', 'z@y.com', '', 2)])).toHaveLength(0);
    });
});
