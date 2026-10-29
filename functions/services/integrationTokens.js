// Kullanıcı başına OAuth jeton deposu — Gmail/Calendar (google) ve
// Microsoft Graph (microsoft).
//
// ── NEREDE DURUYOR ──────────────────────────────────────────────────────────
//   tenants/{t}/integrationSecrets/{uid}.<provider> — accessToken, refreshToken
//                                          (ŞİFRELİ), tokenExpiresAt, authMode
//   tenants/{t}/members/{uid}.integrations.<provider> — connected, email,
//                                          connectedAt, authMode (SIR YOK)
// Bağlantı ŞİRKET BAŞINA: iki şirkette üye olan kişi her birinde ayrı bağlar
// (plan §1.1); bir şirketin işlemi ötekinin jetonunu kullanamaz.
// integrationSecrets firestore.rules'ta istemciye tamamen kapalı; yalnızca
// Admin SDK (bu modül) okur/yazar. Jeton çözümü SADECE sunucuda yapılır ve
// refresh token sunucudan hiç çıkmaz.
//
// ── TEMBEL GÖÇ ──────────────────────────────────────────────────────────────
// Eski kayıtlarda jetonlar users/{uid}.integrations.<provider> altında DÜZ
// METİN. getAccessToken ilk kullanımda onları şifreleyip integrationSecrets'a
// taşıyor ve kullanıcı dokümanından siliyor — tek seferlik göç betiğine gerek
// yok, üretim kesintisiz çalışmaya devam ediyor.
//
// Saf fabrika: db, deleteField ve refreshProvider dışarıdan veriliyor ki
// testler Firestore'a dokunmadan bütün akışı koşabilsin. Gerçek bağlantı
// services/integrationTokenStore.js'te.
import { decryptToken, encryptToken, isEncryptedToken } from './tokenCrypto.js';
import { tenantPaths } from './tenantPaths.js';

export const PROVIDERS = ['google', 'microsoft'];

const LEGACY_TOKEN_FIELDS = ['accessToken', 'refreshToken', 'tokenExpiresAt'];

/** Rotaların HTTP yanıtına çevirdiği, kodlu hata. */
export class IntegrationError extends Error {
    constructor(code, message, authMode) {
        super(message || code);
        this.code = code;
        // REAUTH_REQUIRED'da istemciye nasıl yeniden bağlanacağını söyler:
        // 'firebase' → SPA popup'ı kendisi açabilir.
        this.authMode = authMode;
    }
}

const assertProvider = (provider) => {
    if (!PROVIDERS.includes(provider)) throw new IntegrationError('BAD_PROVIDER', `Bilinmeyen sağlayıcı: ${provider}`);
};

/**
 * @param {object} deps
 *   db              — Firestore benzeri: db.doc(path).get/set/update
 *   deleteField     — () => FieldValue.delete() karşılığı
 *   refreshProvider — async (provider, refreshToken) =>
 *                     { accessToken, refreshToken?, tokenExpiresAt }
 *   now             — () => ms (test için)
 *   getKey          — () => Buffer (test için; varsayılan ortamdan okur)
 *   log             — pino benzeri (isteğe bağlı)
 */
export function createIntegrationTokenStore({ db, deleteField, refreshProvider, now = Date.now, getKey, log }) {
    const key = () => (getKey ? getKey() : undefined);
    const secretsRef = (t, uid) => db.doc(tenantPaths(t).integrationSecret(uid));
    const userRef = (t, uid) => db.doc(tenantPaths(t).member(uid));

    async function saveTokens(t, uid, provider, { accessToken, refreshToken, tokenExpiresAt, authMode }) {
        assertProvider(provider);
        const entry = {
            accessToken: encryptToken(accessToken, key()),
            tokenExpiresAt: tokenExpiresAt ?? null,
            updatedAt: new Date(now()).toISOString(),
        };
        // Google yenileme yanıtı refresh token DÖNDÜRMÜYOR: alan hiç yazılmazsa
        // merge eskisini koruyor; undefined yazmak onu silmek olurdu.
        if (refreshToken !== undefined) entry.refreshToken = refreshToken ? encryptToken(refreshToken, key()) : null;
        if (authMode !== undefined) entry.authMode = authMode;
        await secretsRef(t, uid).set({ [provider]: entry }, { merge: true });
    }

    async function readEntry(t, uid, provider) {
        const snap = await secretsRef(t, uid).get();
        const raw = snap.exists ? snap.data()?.[provider] : null;
        if (!raw?.accessToken && !raw?.refreshToken) return null;
        let entry;
        try {
            entry = {
                ...raw,
                accessToken: decryptToken(raw.accessToken, key()),
                refreshToken: decryptToken(raw.refreshToken, key()),
            };
        } catch {
            // Başka anahtarla şifrelenmiş (anahtar döndürüldü) ya da bozuk:
            // kurtarılamaz, kullanıcı yeniden bağlanmalı.
            throw new IntegrationError('REAUTH_REQUIRED', 'Kayıtlı bağlantı çözülemedi; yeniden bağlanın.');
        }
        const plainLeft = (raw.accessToken && !isEncryptedToken(raw.accessToken))
            || (raw.refreshToken && !isEncryptedToken(raw.refreshToken));
        if (plainLeft) await saveTokens(t, uid, provider, entry);
        return entry;
    }

    /** Eski düz metin jetonları kullanıcı dokümanından alıp şifreli depoya taşır. */
    async function migrateLegacy(t, uid, provider) {
        const snap = await userRef(t, uid).get();
        const legacy = snap.exists ? snap.data()?.integrations?.[provider] : null;
        if (!legacy?.accessToken && !legacy?.refreshToken) return null;

        const entry = {
            accessToken: legacy.accessToken || null,
            refreshToken: legacy.refreshToken || null,
            tokenExpiresAt: legacy.tokenExpiresAt ?? null,
            authMode: legacy.authMode || 'server',
        };
        await saveTokens(t, uid, provider, entry);
        try {
            await userRef(t, uid).update(Object.fromEntries(
                LEGACY_TOKEN_FIELDS.map((f) => [`integrations.${provider}.${f}`, deleteField()])
            ));
        } catch (err) {
            // Şifreli kopya yazıldı; düz metin bir sonraki bağlanmada ezilir.
            log?.error?.({ err: err.message, uid, provider }, '[integrationTokens] legacy scrub failed');
        }
        log?.info?.({ uid, provider }, '[integrationTokens] legacy plaintext tokens migrated');
        return entry;
    }

    /**
     * Geçerli bir erişim jetonu döndürür; süresi dolmuşsa refresh token ile
     * yeniler ve yenisini şifreli kaydeder.
     * @throws {IntegrationError} NOT_CONNECTED | REAUTH_REQUIRED
     */
    async function getAccessToken(t, uid, provider) {
        assertProvider(provider);
        const entry = (await readEntry(t, uid, provider)) || (await migrateLegacy(t, uid, provider));
        if (!entry?.accessToken && !entry?.refreshToken) {
            throw new IntegrationError('NOT_CONNECTED', 'Hesap bağlı değil.');
        }

        const expiresAt = entry.tokenExpiresAt ?? 0;
        if (entry.accessToken && expiresAt && now() < expiresAt) return entry.accessToken;

        // Firebase popup ile bağlanan hesabın refresh token'ı yok: yenileme
        // ancak kullanıcının yeniden onay vermesiyle olur.
        if (!entry.refreshToken || entry.authMode === 'firebase') {
            throw new IntegrationError('REAUTH_REQUIRED', 'Oturum süresi doldu; yeniden bağlanın.', entry.authMode);
        }

        let fresh;
        try {
            fresh = await refreshProvider(provider, entry.refreshToken);
        } catch (err) {
            log?.warn?.({ err: err.message, uid, provider }, '[integrationTokens] refresh failed');
            throw new IntegrationError('REAUTH_REQUIRED', 'Oturum yenilenemedi; yeniden bağlanın.');
        }
        await saveTokens(t, uid, provider, {
            accessToken: fresh.accessToken,
            refreshToken: fresh.refreshToken || undefined,
            tokenExpiresAt: fresh.tokenExpiresAt,
        });
        return fresh.accessToken;
    }

    /** Bağlantıyı kaydeder: jetonlar şifreli depoya, görünür alanlar profile. */
    async function connect(t, uid, provider, { email, accessToken, refreshToken, tokenExpiresAt, authMode }) {
        // Google yeniden onayda refresh token'ı her zaman tekrar vermiyor:
        // gelmediyse kayıtlı olan korunur.
        await saveTokens(t, uid, provider, { accessToken, refreshToken: refreshToken || undefined, tokenExpiresAt, authMode });
        // Haritanın TAMAMI yazılıyor: eski düz metin alanlar da böylece siliniyor.
        await userRef(t, uid).update({
            [`integrations.${provider}`]: {
                connected: true,
                email: email || '',
                authMode,
                connectedAt: new Date(now()).toISOString(),
            },
        });
    }

    async function disconnect(t, uid, provider) {
        assertProvider(provider);
        await secretsRef(t, uid).set({ [provider]: deleteField() }, { merge: true });
        await userRef(t, uid).update({
            [`integrations.${provider}`]: { connected: false, disconnectedAt: new Date(now()).toISOString() },
        });
    }

    return { getAccessToken, connect, disconnect, saveTokens };
}
