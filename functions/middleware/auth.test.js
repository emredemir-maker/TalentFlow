// requireTenant'ın karar çekirdeği (decideTenantAccess) ve platform yöneticisi
// listesi — saf fonksiyonlar. firestore.rules'taki isMember/canRead/canWrite ile
// aynı kararı vermeli (uçtan uca hâli: tests/server/isolation.test.js).
import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/firebaseAdmin.js', () => ({ db: {}, admin: {} }));

const { decideTenantAccess, platformAdminEmails, toMillis, ALL_ROLES, WRITER_ROLES } = await import('./auth.js');

const NOW = Date.parse('2026-10-29T12:00:00Z');
const day = 24 * 60 * 60 * 1000;
const active = { status: 'active', writeUntil: new Date(NOW + 30 * day), readUntil: new Date(NOW + 30 * day) };
const member = (over = {}) => ({ role: 'recruiter', status: 'active', ...over });
const d = (o) => decideTenantAccess({ now: NOW, roles: ALL_ROLES, write: false, tenant: active, member: member(), ...o });

describe('decideTenantAccess', () => {
    it('etkin üye okur ve yazar', () => {
        expect(d({}).ok).toBe(true);
        expect(d({ write: true, roles: WRITER_ROLES }).ok).toBe(true);
    });
    it('üyelik yok / şirket yok / kaldırılmış / süresi dolmuş / bilinmeyen rol → 403 NOT_A_MEMBER', () => {
        for (const o of [
            { member: null },
            { tenant: null },
            { member: member({ status: 'removed' }) },
            { member: member({ role: 'support', expiresAt: new Date(NOW - 1) }) },
            { member: member({ role: 'super_admin' }) },
        ]) {
            expect(d(o)).toEqual({ ok: false, status: 403, code: 'NOT_A_MEMBER' });
        }
    });
    it('rol listede değil → 403 FORBIDDEN', () => {
        expect(d({ member: member({ role: 'department_user' }), roles: WRITER_ROLES })).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    });
    it('destek (K11) süre içinde okur, hiç yazamaz', () => {
        const sup = member({ role: 'support', expiresAt: new Date(NOW + day) });
        expect(d({ member: sup }).ok).toBe(true);
        expect(d({ member: sup, write: true })).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    });
    it('K5: salt okunur bant okur, yazma 402; kapalı 402; askı 403', () => {
        const ro = { status: 'trial', writeUntil: new Date(NOW - day), readUntil: new Date(NOW + 13 * day) };
        expect(d({ tenant: ro }).ok).toBe(true);
        expect(d({ tenant: ro, write: true })).toMatchObject({ status: 402, code: 'TENANT_READ_ONLY' });
        expect(d({ tenant: { ...active, status: 'readonly' }, write: true })).toMatchObject({ status: 402, code: 'TENANT_READ_ONLY' });
        const closed = { status: 'trial', writeUntil: new Date(NOW - 15 * day), readUntil: new Date(NOW - day) };
        expect(d({ tenant: closed })).toMatchObject({ status: 402, code: 'TENANT_CLOSED' });
        expect(d({ tenant: { ...active, status: 'closed' } })).toMatchObject({ status: 402, code: 'TENANT_CLOSED' });
        expect(d({ tenant: { ...active, status: 'suspended' } })).toMatchObject({ status: 403, code: 'TENANT_SUSPENDED' });
        // Süre alanı yoksa güvenli hata (kurallarla aynı).
        expect(d({ tenant: { status: 'active' } })).toMatchObject({ status: 402 });
    });
    it('üye olmayan şirketin durumunu öğrenemez (askı da NOT_A_MEMBER döner)', () => {
        expect(d({ member: null, tenant: { ...active, status: 'suspended' } })).toMatchObject({ code: 'NOT_A_MEMBER' });
    });
});

describe('toMillis', () => {
    it('Timestamp, Date, ISO, sayı, admin JSON biçimi', () => {
        expect(toMillis({ toMillis: () => 5 })).toBe(5);
        expect(toMillis(new Date(7))).toBe(7);
        expect(toMillis('1970-01-01T00:00:00.009Z')).toBe(9);
        expect(toMillis(11)).toBe(11);
        expect(toMillis({ _seconds: 2 })).toBe(2000);
        expect(Number.isNaN(toMillis(undefined))).toBe(true);
    });
});

describe('platformAdminEmails', () => {
    it('virgüllü listeyi küçük harfe çevirir, boşları atar', () => {
        expect(platformAdminEmails({ PLATFORM_ADMIN_EMAILS: ' A@x.com, ,b@Y.com ' })).toEqual(['a@x.com', 'b@y.com']);
        expect(platformAdminEmails({})).toEqual([]);
    });
});
