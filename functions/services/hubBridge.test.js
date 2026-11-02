// Hub köprüsünün saf kuralları: rol eşlemesi (K2), deneme süreleri (K5), Hub yanıtının doğrulanması,
// CLYRO-M2M-V1 imzası ve olay gövdeleri. Firestore'a yazan kısımlar: tests/server/hubBridge.test.js.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/firebaseAdmin.js', () => ({ db: {}, admin: {} }));

const {
    FAR_FUTURE,
    READ_ONLY_GRACE_MS,
    decideHubLogin,
    exchangeHubCode,
    hubApiBase,
    hubEventsSecret,
    hubExchangeSecret,
    hubTenantIdOf,
    hubVerifyMaxAgeMs,
    m2mSign,
    parseMembershipRemoved,
    parseServerExchange,
    parseSupportAccess,
    sha256Hex,
    talentRoleFromHub,
    tenantTimingFromHub,
    verifyHubSignature,
} = await import('./hubBridge.js');

const T = '0b6b3a8e-5d2f-4c1a-9e7b-2f4d6a8c0e12';
const S1 = 'a'.repeat(32);
const S2 = 'b'.repeat(40);

describe('ortam', () => {
    it('gizli değer en az 32 karakter; olay değeri değişim değeriyle aynıysa kapalı', () => {
        expect(hubExchangeSecret({ HUB_EXCHANGE_SECRET: 'kisa' })).toBeNull();
        expect(hubExchangeSecret({ HUB_EXCHANGE_SECRET: ` ${S1} ` })).toBe(S1);
        expect(hubEventsSecret({ HUB_EVENTS_SECRET: S2, HUB_EXCHANGE_SECRET: S1 })).toBe(S2);
        expect(hubEventsSecret({ HUB_EVENTS_SECRET: S1, HUB_EXCHANGE_SECRET: S1 })).toBeNull();
        expect(hubEventsSecret({})).toBeNull();
    });
    it('Hub adresi: https (yerelde http), kimlik/sorgu yok', () => {
        expect(hubApiBase({ HUB_API_URL: 'https://hub.clyrolabs.com/api/' })).toBe('https://hub.clyrolabs.com/api');
        expect(hubApiBase({ HUB_API_URL: 'http://127.0.0.1:3000/api' })).toBe('http://127.0.0.1:3000/api');
        expect(hubApiBase({ HUB_API_URL: 'http://hub.clyrolabs.com/api' })).toBeNull();
        expect(hubApiBase({ HUB_API_URL: 'https://u:p@hub.test/api' })).toBeNull();
        expect(hubApiBase({ HUB_API_URL: 'https://hub.test/api?x=1' })).toBeNull();
        expect(hubApiBase({})).toBeNull();
    });
    it('Hub doğrulama süresi 1–168 saat, varsayılan 24', () => {
        expect(hubVerifyMaxAgeMs({})).toBe(24 * 3_600_000);
        expect(hubVerifyMaxAgeMs({ HUB_VERIFY_MAX_AGE_HOURS: '8' })).toBe(8 * 3_600_000);
        expect(hubVerifyMaxAgeMs({ HUB_VERIFY_MAX_AGE_HOURS: '0' })).toBe(24 * 3_600_000);
        expect(hubVerifyMaxAgeMs({ HUB_VERIFY_MAX_AGE_HOURS: '1000' })).toBe(24 * 3_600_000);
        // Üst sınır 24 saat: çıkarma olayı gelmezse erişim en çok bu kadar sürer.
        expect(hubVerifyMaxAgeMs({ HUB_VERIFY_MAX_AGE_HOURS: '168' })).toBe(24 * 3_600_000);
    });
});

describe('K2 rol eşlemesi', () => {
    it('tenant_admin → admin, manager → recruiter, member → department_user, bilinmeyen → en dar', () => {
        expect(talentRoleFromHub('tenant_admin')).toBe('admin');
        expect(talentRoleFromHub('manager')).toBe('recruiter');
        expect(talentRoleFromHub('member')).toBe('department_user');
        expect(talentRoleFromHub('platform_admin')).toBe('department_user');
        expect(talentRoleFromHub(undefined)).toBe('department_user');
    });
    it('var olan üyenin rolü Hub girişinde ezilmez; yöneticinin kaldırdığı üyelik açılmaz', () => {
        expect(decideHubLogin(null)).toBe('create');
        expect(decideHubLogin({ role: 'recruiter', status: 'active' })).toBe('refresh');
        // Hub'dan çıkarılıp yeniden eklenen kişinin eski rolü (ör. yönetici) geri gelmez.
        expect(decideHubLogin({ role: 'admin', status: 'removed', removedVia: 'hub' })).toBe('rejoin');
        expect(decideHubLogin({ role: 'recruiter', status: 'removed', removedVia: 'admin' })).toBe('blocked');
        // PR 2'de yolu yazılmamış eski kaldırma da kapalı kalır.
        expect(decideHubLogin({ role: 'recruiter', status: 'removed', removedBy: 'u1' })).toBe('blocked');
        expect(decideHubLogin({ role: 'support', status: 'active' })).toBe('convert');
        // Yöneticinin kaldırdığı destek kaydı da Hub girişiyle açılmaz.
        expect(decideHubLogin({ role: 'support', status: 'removed', removedVia: 'admin' })).toBe('blocked');
    });
});

describe('K5 deneme süreleri', () => {
    it('ücretli plan süresiz; deneme bitişte yazma kapanır, 14 gün sonra okuma', () => {
        expect(tenantTimingFromHub({ plan: 'active' })).toMatchObject({ status: 'active', writeUntil: FAR_FUTURE, readUntil: FAR_FUTURE });
        const end = '2026-11-20T10:00:00.000Z';
        const t = tenantTimingFromHub({ plan: 'trial', trialEndsAt: end });
        expect(t.status).toBe('trial');
        expect(t.writeUntil.toISOString()).toBe(end);
        expect(t.readUntil.getTime() - t.writeUntil.getTime()).toBe(READ_ONLY_GRACE_MS);
    });
    it('plan bilinmiyor ya da deneme bitişi yok → geçersiz', () => {
        expect(tenantTimingFromHub({ plan: 'trial' })).toBeNull();
        expect(tenantTimingFromHub({ plan: 'trial', trialEndsAt: 'yarın' })).toBeNull();
        expect(tenantTimingFromHub({ plan: 'gold' })).toBeNull();
        expect(tenantTimingFromHub({})).toBeNull();
    });
});

describe('Hub yanıtı', () => {
    const ok = {
        token: 'tok',
        uid: 'u1',
        email: 'Ali@Firma.test',
        displayName: 'Ali',
        tenant: { id: T.toUpperCase(), name: 'Firma', slug: 'firma', role: 'manager', plan: 'trial', trialEndsAt: '2026-12-01T00:00:00Z' },
    };
    it('geçerli yanıt: alan kimliği ve e-posta küçük harf', () => {
        const r = parseServerExchange(200, ok);
        expect(r.kind).toBe('ok');
        expect(r.tenant.id).toBe(T);
        expect(r.email).toBe('ali@firma.test');
    });
    it('eksik/bozuk alan → failed (jeton, uid, uuid, plan)', () => {
        for (const body of [
            { ...ok, token: '' },
            { ...ok, uid: 'a/b' },
            { ...ok, email: 'yok' },
            { ...ok, tenant: { ...ok.tenant, id: 'tenant-1' } },
            { ...ok, tenant: { ...ok.tenant, plan: undefined } },
            { ...ok, tenant: { ...ok.tenant, trialEndsAt: null } },
            null,
        ]) {
            expect(parseServerExchange(200, body).kind).toBe('failed');
        }
        expect(parseServerExchange(500, ok).kind).toBe('failed');
    });
    it('401 → invalid; 403 workspace_access_denied → denied (gerekçeli ya da gerekçesiz)', () => {
        expect(parseServerExchange(401, { error: 'x' }).kind).toBe('invalid');
        expect(parseServerExchange(403, { code: 'workspace_access_denied', uid: 'u1', tenantId: T, reason: 'trial_expired' })).toEqual({
            kind: 'denied',
            uid: 'u1',
            tenantId: T,
            reason: 'trial_expired',
        });
        expect(parseServerExchange(403, { code: 'workspace_access_denied', uid: 'u1', tenantId: T }).reason).toBe('unknown');
        expect(parseServerExchange(403, { code: 'workspace_access_denied', uid: 'u1', tenantId: 'x' }).kind).toBe('failed');
    });
    it('istek: Origin yok, Bearer gizli değer, yönlendirme izlenmez, uygulama talent', async () => {
        const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ok }));
        const r = await exchangeHubCode('c'.repeat(43), { apiBase: 'https://hub.test/api', secret: S1, fetch: fetchImpl });
        expect(r.kind).toBe('ok');
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe('https://hub.test/api/apps/server-exchange');
        expect(init.redirect).toBe('error');
        expect(init.headers.authorization).toBe(`Bearer ${S1}`);
        expect(Object.keys(init.headers).map((h) => h.toLowerCase())).not.toContain('origin');
        expect(JSON.parse(init.body)).toEqual({ app: 'talent', code: 'c'.repeat(43) });
    });
    it('ağ hatası → failed', async () => {
        const r = await exchangeHubCode('c'.repeat(43), { apiBase: 'https://hub.test/api', secret: S1, fetch: async () => { throw new Error('x'); } });
        expect(r.kind).toBe('failed');
    });
});

describe('CLYRO-M2M-V1', () => {
    const NOW = Date.parse('2026-11-02T12:00:00Z');
    const body = Buffer.from(JSON.stringify({ type: 'membership.removed', tenantId: T, uid: 'u1' }));
    const signed = (over = {}) => {
        const p = { method: 'POST', path: '/api/hub/membership-revoked', timestamp: String(NOW / 1000), nonce: 'n'.repeat(24), actor: 'hub', bodySha256: sha256Hex(body), ...over };
        return {
            'x-clyro-m2m-timestamp': p.timestamp,
            'x-clyro-m2m-nonce': p.nonce,
            'x-clyro-m2m-actor': p.actor,
            'x-clyro-m2m-signature': m2mSign(over.secret || S2, p),
        };
    };
    const verify = (headers, b = body, path = '/api/hub/membership-revoked') => verifyHubSignature(S2, { method: 'POST', path, headers, body: b }, NOW);

    it('geçerli imza', () => {
        expect(verify(signed())).toEqual({ ok: true, nonce: 'n'.repeat(24) });
    });
    it('sabit örnek: Hub-Inn ve lead-radar ile aynı imza metni', () => {
        const sig = m2mSign('k'.repeat(32), { method: 'post', path: '/api/hub/x', timestamp: '1700000000', nonce: 'abc', actor: 'hub', bodySha256: sha256Hex('') });
        // Satırlar: CLYRO-M2M-V1 / POST / yol / ts / nonce / gönderen / sha256('')
        expect(sig).toBe('v1=c651d616811df238fe11b82f26ffe9851fd50ed47b8f6d0c2597cee494363b1f');
        expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
    it('gövde, yol, gönderen, gizli değer ya da zaman değişirse red', () => {
        expect(verify(signed(), Buffer.from('{}'))).toMatchObject({ ok: false, reason: 'bad_signature' });
        expect(verify(signed(), body, '/api/hub/support-access')).toMatchObject({ ok: false, reason: 'bad_signature' });
        expect(verify(signed({ secret: S1 }))).toMatchObject({ ok: false, reason: 'bad_signature' });
        expect(verify(signed({ actor: 'signals' }))).toMatchObject({ ok: false, reason: 'actor' });
        expect(verify(signed({ timestamp: String(NOW / 1000 - 121) }))).toMatchObject({ ok: false, reason: 'expired' });
        expect(verify({})).toMatchObject({ ok: false, reason: 'missing' });
        expect(verify({ ...signed(), 'x-clyro-m2m-nonce': 'kısa' })).toMatchObject({ ok: false, reason: 'malformed' });
    });
});

describe('olay gövdeleri', () => {
    const NOW = Date.parse('2026-11-02T12:00:00Z');
    it('membership.removed: uuid, uid, isteğe bağlı e-posta ve occurredAt', () => {
        const ev = parseMembershipRemoved({ type: 'membership.removed', tenantId: T, uid: 'u1', email: 'A@B.co', occurredAt: '2026-11-02T11:59:00Z' }, NOW);
        expect(ev).toMatchObject({ tenantId: T, uid: 'u1', email: 'a@b.co' });
        expect(ev.occurredAt.toISOString()).toBe('2026-11-02T11:59:00.000Z');
        expect(parseMembershipRemoved({ type: 'membership.removed', tenantId: T, uid: 'u1' }, NOW).occurredAt).toBeNull();
        for (const bad of [
            { type: 'x', tenantId: T, uid: 'u1' },
            { type: 'membership.removed', tenantId: 'abc', uid: 'u1' },
            { type: 'membership.removed', tenantId: T, uid: '../x' },
            { type: 'membership.removed', tenantId: T, uid: 'u1', email: 'yok' },
            { type: 'membership.removed', tenantId: T, uid: 'u1', occurredAt: '2026-11-03T12:00:00Z' },
            { type: 'membership.removed', tenantId: T, uid: 'u1', occurredAt: 1700000000 },
        ]) {
            expect(parseMembershipRemoved(bad, NOW)).toBeNull();
        }
    });
    it('support.grant: gerekçe 10–500, süre en çok 24 saat; support.revoke', () => {
        const base = { type: 'support.grant', tenantId: T, uid: 'p1', email: 'destek@clyrolabs.com', reason: 'Müşteri talebi #123 inceleme', requestedBy: 'emre@clyrolabs.com' };
        expect(parseSupportAccess(base)).toMatchObject({ type: 'support.grant', ttlMs: 24 * 3_600_000 });
        expect(parseSupportAccess({ ...base, ttlHours: 2 }).ttlMs).toBe(2 * 3_600_000);
        expect(parseSupportAccess({ ...base, ttlHours: 25 })).toBeNull();
        expect(parseSupportAccess({ ...base, reason: 'kısa' })).toBeNull();
        expect(parseSupportAccess({ ...base, requestedBy: undefined })).toBeNull();
        expect(parseSupportAccess({ type: 'support.revoke', tenantId: T, uid: 'p1', requestedBy: 'emre@clyrolabs.com' })).toMatchObject({ type: 'support.revoke' });
        expect(parseSupportAccess({ ...base, type: 'support.forever' })).toBeNull();
    });
    it('alan kimliği yalnız uuid', () => {
        expect(hubTenantIdOf(` ${T.toUpperCase()} `)).toBe(T);
        expect(hubTenantIdOf('tenants/x')).toBeNull();
    });
});
