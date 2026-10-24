// Kullanıcı başına OAuth jetonlarının (Gmail/Calendar, Microsoft Graph)
// durağan halde şifrelenmesi — AES-256-GCM.
//
// ── NEDEN ───────────────────────────────────────────────────────────────────
// Jetonlar kullanıcı dokümanında DÜZ METİN duruyordu ve kullanıcı dokümanını
// her recruiter okuyabiliyor: bir recruiter, ekipteki herkesin Gmail'ine
// erişen refresh token'ı tek okuma ile alabiliyordu. Jetonlar artık
// istemcinin hiç okuyamadığı ayrı bir dokümanda ve orada da şifreli.
//
// ── BİÇİM ───────────────────────────────────────────────────────────────────
//   enc:v1:<iv b64url>:<tag b64url>:<şifreli metin b64url>
// `enc:v1:` öneki eski düz metin jetonları şifrelilerden ayırıyor; tembel
// göç (services/integrationTokens.js) buna bakarak hangi kaydın yeniden
// yazılması gerektiğine karar veriyor. Sürüm etiketi, ileride anahtar
// döndürme / biçim değişikliği için yer bırakıyor.
//
// ── ANAHTAR ─────────────────────────────────────────────────────────────────
// INTEGRATION_ENCRYPTION_KEY: base64 kodlu 32 bayt.
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// Üretimde tanımlı değilse sunucu AÇILMIYOR (assertEncryptionKeyConfigured):
// anahtarsız bir sunucu ya jetonu düz yazar ya da hiç yazamaz — ikisi de
// sessizce olmamalı.
import crypto from 'node:crypto';

const PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class EncryptionKeyError extends Error {}

/** Anahtarı ortamdan okur; yoksa ya da boyu yanlışsa fırlatır. */
export function loadEncryptionKey(env = process.env) {
    const raw = (env.INTEGRATION_ENCRYPTION_KEY || '').trim();
    if (!raw) throw new EncryptionKeyError('INTEGRATION_ENCRYPTION_KEY tanımlı değil.');
    const key = Buffer.from(raw, 'base64');
    if (key.length !== KEY_BYTES) {
        throw new EncryptionKeyError(`INTEGRATION_ENCRYPTION_KEY base64 kodlu ${KEY_BYTES} bayt olmalı (şu an ${key.length}).`);
    }
    return key;
}

/** Cloud Functions çalışma ortamı (emülatör hariç). */
export function isProductionRuntime(env = process.env) {
    return !!env.K_SERVICE && !env.FUNCTIONS_EMULATOR;
}

/** Üretimde anahtar yoksa açılışta durdurur; geliştirmede yalnızca uyarır. */
export function assertEncryptionKeyConfigured(env = process.env, log = null) {
    try {
        loadEncryptionKey(env);
    } catch (err) {
        if (isProductionRuntime(env)) throw err;
        log?.warn?.(`${err.message} Entegrasyon bağlama/kullanma bu ortamda çalışmayacak.`);
    }
}

export function isEncryptedToken(value) {
    return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptToken(plain, key = loadEncryptionKey()) {
    if (plain == null || plain === '') return plain ?? null;
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${ct.toString('base64url')}`;
}

/**
 * Şifreli jetonu çözer. Önek taşımayan değer ESKİ DÜZ METİN kabul edilip
 * olduğu gibi döner — tembel göç onu okuyup şifreli olarak yeniden yazar.
 * Bozuk ya da başka anahtarla şifrelenmiş değer fırlatır (GCM etiketi tutmaz).
 */
export function decryptToken(value, key = loadEncryptionKey()) {
    if (value == null || value === '') return value ?? null;
    if (!isEncryptedToken(value)) return value;
    const [ivB64, tagB64, ctB64] = value.slice(PREFIX.length).split(':');
    if (!ivB64 || !tagB64 || ctB64 === undefined) throw new Error('Şifreli jeton biçimi bozuk.');
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([
        decipher.update(Buffer.from(ctB64, 'base64url')),
        decipher.final(),
    ]).toString('utf8');
}
