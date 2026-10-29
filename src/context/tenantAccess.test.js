// AuthContext'in saf kararları — firestore.rules ile aynı olmalı.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/firebase', () => ({ auth: null, db: {}, isFirebaseConfigured: false }));

const { pickTenant, resolveActiveTenant, tenantAccessOf, memberIsActive } = await import('./AuthContext.jsx');

const NOW = Date.parse('2026-10-29T12:00:00Z');
const day = 864e5;

describe('pickTenant', () => {
    it("Hub'ın verdiği > son seçilen > tek şirket; listede olmayan seçilmez", () => {
        expect(pickTenant(['A', 'B'], { hub: 'B', last: 'A' })).toBe('B');
        expect(pickTenant(['A', 'B'], { hub: 'Z', last: 'A' })).toBe('A');
        expect(pickTenant(['A'], {})).toBe('A');
        expect(pickTenant(['A', 'B'], {})).toBeNull();
        expect(pickTenant(['A', 'B'], { last: 'C' })).toBeNull();
        expect(pickTenant([], { hub: 'A' })).toBeNull();
    });
});

describe('tenantAccessOf (K5)', () => {
    it('etkin, salt okunur bant, kapalı, askı', () => {
        expect(tenantAccessOf({ status: 'active', writeUntil: NOW + day, readUntil: NOW + day }, NOW)).toEqual({ readable: true, writable: true, suspended: false });
        expect(tenantAccessOf({ status: 'trial', writeUntil: NOW - day, readUntil: NOW + day }, NOW).writable).toBe(false);
        expect(tenantAccessOf({ status: 'trial', writeUntil: NOW - day, readUntil: NOW - 1 }, NOW).readable).toBe(false);
        expect(tenantAccessOf({ status: 'suspended', writeUntil: NOW + day, readUntil: NOW + day }, NOW)).toMatchObject({ readable: false, suspended: true });
        expect(tenantAccessOf(null, NOW).readable).toBe(false);
    });
});

describe('memberIsActive', () => {
    it('durum, süre ve rol', () => {
        expect(memberIsActive({ status: 'active', role: 'recruiter' }, NOW)).toBe(true);
        expect(memberIsActive({ status: 'removed', role: 'recruiter' }, NOW)).toBe(false);
        expect(memberIsActive({ status: 'active', role: 'support', expiresAt: NOW - 1 }, NOW)).toBe(false);
        expect(memberIsActive({ status: 'active', role: 'super_admin' }, NOW)).toBe(false);
        expect(memberIsActive(null, NOW)).toBe(false);
    });
});

describe('resolveActiveTenant (aday bağlantısı)', () => {
    it('herkese açık sayfada bağlantıdaki şirket kaydedilmiş seçimi ve listeyi ezer', () => {
        // İki şirketli recruiter, son seçimi B, A'nın mülakat bağlantısını açıyor.
        expect(resolveActiveTenant({ ids: ['A', 'B'], last: 'B', publicPath: true, urlTenant: 'A' })).toEqual({
            active: 'A',
            member: 'A',
        });
        // Anonim aday: üyelik listesi boş — bağlantı şirketi silinmez.
        expect(resolveActiveTenant({ ids: [], publicPath: true, urlTenant: 'A' })).toEqual({ active: 'A', member: null });
    });
    it('iç sayfada bağlantı parametresi yok sayılır', () => {
        expect(resolveActiveTenant({ ids: ['A', 'B'], last: 'B', publicPath: false, urlTenant: 'A' })).toEqual({
            active: 'B',
            member: 'B',
        });
        expect(resolveActiveTenant({ ids: [], publicPath: true, urlTenant: null })).toEqual({ active: null, member: null });
    });
});
