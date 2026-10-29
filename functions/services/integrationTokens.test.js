// Jeton deposu — şifreli saklama, eski düz metinden tembel göç, yenileme.
//
// Firestore yerine bellek içi sahte bir db kullanılıyor (set/merge, update
// nokta yolları ve silme işareti). Asıl sabitlenen davranış: DÜZ METİN hiçbir
// yerde kalmıyor ve refresh token yalnızca şifreli depoda duruyor.
import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createIntegrationTokenStore, IntegrationError } from './integrationTokens.js';
import { tenantPaths } from './tenantPaths.js';
import { encryptToken, isEncryptedToken } from './tokenCrypto.js';

const DELETE = Symbol('delete');
const KEY = crypto.randomBytes(32);
const UID = 'u1';
const TENANT = 'tenant-a';
const userPath = tenantPaths(TENANT).member(UID);
const secretPath = tenantPaths(TENANT).integrationSecret(UID);

function deepMerge(target, src) {
    const out = { ...target };
    for (const [k, v] of Object.entries(src)) {
        if (v === DELETE) delete out[k];
        else if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') out[k] = deepMerge(out[k], v);
        else out[k] = v;
    }
    return out;
}

function fakeDb(initial = {}) {
    const docs = new Map(Object.entries(structuredClone(initial)));
    return {
        docs,
        doc: (path) => ({
            get: async () => ({ exists: docs.has(path), data: () => structuredClone(docs.get(path)) }),
            set: async (data, opts) => {
                docs.set(path, opts?.merge ? deepMerge(docs.get(path) || {}, data) : data);
            },
            update: async (fields) => {
                if (!docs.has(path)) throw new Error('NOT_FOUND');
                const cur = structuredClone(docs.get(path));
                for (const [dotted, v] of Object.entries(fields)) {
                    const keys = dotted.split('.');
                    let node = cur;
                    for (const k of keys.slice(0, -1)) node = node[k] ??= {};
                    if (v === DELETE) delete node[keys.at(-1)];
                    else node[keys.at(-1)] = v;
                }
                docs.set(path, cur);
            },
        }),
    };
}

const NOW = 1_700_000_000_000;

function makeStore(db, overrides = {}) {
    return createIntegrationTokenStore({
        db,
        deleteField: () => DELETE,
        refreshProvider: vi.fn(async () => ({ accessToken: 'yeni-erisim', tokenExpiresAt: NOW + 3_600_000 })),
        now: () => NOW,
        getKey: () => KEY,
        ...overrides,
    });
}

/** Sahte db'deki her değeri dolaşıp düz metin jeton arar. */
const containsPlain = (db, ...secrets) => {
    const dump = JSON.stringify([...db.docs.values()]);
    return secrets.some((s) => dump.includes(s));
};

describe('tembel göç — eski düz metin jetonlar', () => {
    let db;
    beforeEach(() => {
        db = fakeDb({
            [userPath]: {
                role: 'recruiter',
                integrations: {
                    google: {
                        connected: true, email: 'ik@ornek.com',
                        accessToken: 'ya29.ESKI-ERISIM', refreshToken: '1//ESKI-YENILEME',
                        tokenExpiresAt: NOW + 600_000,
                    },
                },
            },
        });
    });

    it('ilk kullanımda jeton dönüyor ve şifreli depoya taşınıyor', async () => {
        const store = makeStore(db);
        await expect(store.getAccessToken(TENANT, UID, 'google')).resolves.toBe('ya29.ESKI-ERISIM');

        const secret = db.docs.get(secretPath).google;
        expect(isEncryptedToken(secret.accessToken)).toBe(true);
        expect(isEncryptedToken(secret.refreshToken)).toBe(true);
        expect(secret.tokenExpiresAt).toBe(NOW + 600_000);
    });

    it('KULLANICI DOKÜMANINDA DÜZ METİN KALMIYOR', async () => {
        await makeStore(db).getAccessToken(TENANT, UID, 'google');
        const google = db.docs.get(userPath).integrations.google;
        expect(google).toEqual({ connected: true, email: 'ik@ornek.com' });
        expect(containsPlain(db, 'ya29.ESKI-ERISIM', '1//ESKI-YENILEME')).toBe(false);
    });

    it('ikinci kullanım şifreli depodan okuyor', async () => {
        const store = makeStore(db);
        await store.getAccessToken(TENANT, UID, 'google');
        db.docs.set(userPath, { role: 'recruiter' }); // eski kopya artık yok
        await expect(store.getAccessToken(TENANT, UID, 'google')).resolves.toBe('ya29.ESKI-ERISIM');
    });

    it('süresi dolmuş eski jeton göçten sonra yenileniyor', async () => {
        db.docs.get(userPath).integrations.google.tokenExpiresAt = NOW - 1;
        const store = makeStore(db);
        await expect(store.getAccessToken(TENANT, UID, 'google')).resolves.toBe('yeni-erisim');
        expect(containsPlain(db, 'yeni-erisim', '1//ESKI-YENILEME')).toBe(false);
    });

    it('profil temizliği başarısız olsa da jeton dönüyor (hata loglanıyor)', async () => {
        const log = { error: vi.fn(), info: vi.fn() };
        const failingDb = { ...db, doc: (p) => (p === userPath ? { ...db.doc(p), update: async () => { throw new Error('boom'); } } : db.doc(p)) };
        await expect(makeStore(failingDb, { log }).getAccessToken(TENANT, UID, 'google')).resolves.toBe('ya29.ESKI-ERISIM');
        expect(log.error).toHaveBeenCalled();
    });

    it('şifreli depoda kalmış düz metin de yeniden şifreleniyor', async () => {
        db.docs.set(secretPath, { microsoft: { accessToken: 'duz-ms', refreshToken: 'duz-ms-yenileme', tokenExpiresAt: NOW + 1000 } });
        await expect(makeStore(db).getAccessToken(TENANT, UID, 'microsoft')).resolves.toBe('duz-ms');
        expect(isEncryptedToken(db.docs.get(secretPath).microsoft.accessToken)).toBe(true);
        expect(containsPlain(db, 'duz-ms')).toBe(false);
    });
});

describe('getAccessToken', () => {
    it('bağlantı yoksa NOT_CONNECTED', async () => {
        const db = fakeDb({ [userPath]: { integrations: { google: { connected: false } } } });
        await expect(makeStore(db).getAccessToken(TENANT, UID, 'google')).rejects.toMatchObject({ code: 'NOT_CONNECTED' });
    });

    it('geçerli jeton yenilemeden dönüyor', async () => {
        const db = fakeDb();
        const store = makeStore(db);
        await store.saveTokens(TENANT, UID, 'google', { accessToken: 'gecerli', refreshToken: 'r', tokenExpiresAt: NOW + 1000 });
        const refresh = vi.fn();
        await expect(makeStore(db, { refreshProvider: refresh }).getAccessToken(TENANT, UID, 'google')).resolves.toBe('gecerli');
        expect(refresh).not.toHaveBeenCalled();
    });

    it('süresi dolanı yeniliyor; yeni refresh token gelmezse eskisi korunuyor', async () => {
        const db = fakeDb();
        const refresh = vi.fn(async () => ({ accessToken: 'taze', tokenExpiresAt: NOW + 5000 }));
        const store = makeStore(db, { refreshProvider: refresh });
        await store.saveTokens(TENANT, UID, 'google', { accessToken: 'eski', refreshToken: 'kalici-r', tokenExpiresAt: NOW - 1 });

        await expect(store.getAccessToken(TENANT, UID, 'google')).resolves.toBe('taze');
        expect(refresh).toHaveBeenCalledWith('google', 'kalici-r');
        // Yenilenen jeton bir sonraki çağrıda yenilemeden geliyor, refresh token duruyor.
        await expect(store.getAccessToken(TENANT, UID, 'google')).resolves.toBe('taze');
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(db.docs.get(secretPath).google.refreshToken).toBeTruthy();
    });

    it('Firebase popup bağlantısının süresi dolunca REAUTH_REQUIRED (authMode ile)', async () => {
        const db = fakeDb();
        const store = makeStore(db);
        await store.saveTokens(TENANT, UID, 'google', { accessToken: 'kisa', tokenExpiresAt: NOW - 1, authMode: 'firebase' });
        await expect(store.getAccessToken(TENANT, UID, 'google')).rejects.toMatchObject({ code: 'REAUTH_REQUIRED', authMode: 'firebase' });
    });

    it('sağlayıcı yenilemeyi reddederse REAUTH_REQUIRED', async () => {
        const db = fakeDb();
        const store = makeStore(db, { refreshProvider: async () => { throw new Error('invalid_grant'); } });
        await store.saveTokens(TENANT, UID, 'microsoft', { accessToken: 'a', refreshToken: 'iptal', tokenExpiresAt: NOW - 1 });
        await expect(store.getAccessToken(TENANT, UID, 'microsoft')).rejects.toMatchObject({ code: 'REAUTH_REQUIRED' });
    });

    it('başka anahtarla yazılmış kayıt REAUTH_REQUIRED veriyor (500 değil)', async () => {
        const db = fakeDb({ [secretPath]: { google: { accessToken: encryptToken('x', crypto.randomBytes(32)), tokenExpiresAt: NOW + 1000 } } });
        await expect(makeStore(db).getAccessToken(TENANT, UID, 'google')).rejects.toBeInstanceOf(IntegrationError);
    });

    it('bilinmeyen sağlayıcı reddediliyor', async () => {
        await expect(makeStore(fakeDb()).getAccessToken(TENANT, UID, 'yahoo')).rejects.toMatchObject({ code: 'BAD_PROVIDER' });
    });
});

describe('connect / disconnect', () => {
    it('connect: jetonlar şifreli depoda, profilde yalnızca görünür alanlar', async () => {
        const db = fakeDb({
            [userPath]: { integrations: { google: { connected: true, accessToken: 'ESKI', refreshToken: 'ESKI-R' } } },
        });
        await makeStore(db).connect(TENANT, UID, 'google', {
            email: 'ik@ornek.com', accessToken: 'YENI', refreshToken: 'YENI-R', tokenExpiresAt: NOW + 1, authMode: 'server',
        });
        expect(db.docs.get(userPath).integrations.google).toEqual({
            connected: true, email: 'ik@ornek.com', authMode: 'server', connectedAt: new Date(NOW).toISOString(),
        });
        expect(containsPlain(db, 'YENI', 'ESKI')).toBe(false);
        await expect(makeStore(db).getAccessToken(TENANT, UID, 'google')).resolves.toBe('YENI');
    });

    it('disconnect: şifreli kayıt siliniyor, profil bağlı değil', async () => {
        const db = fakeDb({ [userPath]: { integrations: {} } });
        const store = makeStore(db);
        await store.connect(TENANT, UID, 'microsoft', { email: 'a@b.co', accessToken: 'A', refreshToken: 'R', tokenExpiresAt: NOW + 1, authMode: 'server' });
        await store.disconnect(TENANT, UID, 'microsoft');
        expect(db.docs.get(secretPath).microsoft).toBeUndefined();
        expect(db.docs.get(userPath).integrations.microsoft.connected).toBe(false);
        await expect(store.getAccessToken(TENANT, UID, 'microsoft')).rejects.toMatchObject({ code: 'NOT_CONNECTED' });
    });
});

describe('şirket yalıtımı', () => {
    it("A şirketindeki bağlantı B şirketinde görünmez; yollar şirket altında", async () => {
        const db = fakeDb({ [userPath]: { integrations: {} } });
        const store = makeStore(db);
        await store.connect(TENANT, UID, 'google', {
            email: 'a@b.co', accessToken: 'A-JETON', refreshToken: 'R', tokenExpiresAt: NOW + 1000, authMode: 'server',
        });
        expect(secretPath.startsWith(`tenants/${TENANT}/`)).toBe(true);
        await expect(store.getAccessToken('tenant-b', UID, 'google')).rejects.toMatchObject({ code: 'NOT_CONNECTED' });
        await expect(store.getAccessToken(TENANT, UID, 'google')).resolves.toBe('A-JETON');
    });
    it('geçersiz şirket kimliği yol kurmadan reddedilir', async () => {
        await expect(makeStore(fakeDb()).getAccessToken('a/b', UID, 'google')).rejects.toThrow();
        await expect(makeStore(fakeDb()).getAccessToken(TENANT, '../x', 'google')).rejects.toThrow();
    });
});
