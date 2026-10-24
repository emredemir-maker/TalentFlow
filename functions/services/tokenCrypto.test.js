// OAuth jeton şifrelemesi — AES-256-GCM.
//
// Sabitlenen şeyler: gidiş-dönüş, her şifrelemede farklı IV, kurcalanan
// ya da başka anahtarla yazılan değerin REDDEDİLMESİ, eski düz metnin
// tembel göç için olduğu gibi geçmesi ve üretimde anahtarsız açılmama.
import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import {
    assertEncryptionKeyConfigured,
    decryptToken,
    encryptToken,
    isEncryptedToken,
    loadEncryptionKey,
} from './tokenCrypto.js';

const KEY = crypto.randomBytes(32);
const KEY_B64 = KEY.toString('base64');

describe('encryptToken / decryptToken', () => {
    it('gidiş-dönüş aynı değeri veriyor', () => {
        const enc = encryptToken('ya29.gizli-erisim-jetonu', KEY);
        expect(isEncryptedToken(enc)).toBe(true);
        expect(enc).not.toContain('ya29');
        expect(decryptToken(enc, KEY)).toBe('ya29.gizli-erisim-jetonu');
    });

    it('UTF-8 içerik bozulmuyor', () => {
        expect(decryptToken(encryptToken('şğüİ—🙂', KEY), KEY)).toBe('şğüİ—🙂');
    });

    it('aynı metin her seferinde farklı şifreleniyor (rastgele IV)', () => {
        expect(encryptToken('ayni', KEY)).not.toBe(encryptToken('ayni', KEY));
    });

    it('KURCALANAN şifreli metin reddediliyor', () => {
        const enc = encryptToken('jeton', KEY);
        const parts = enc.split(':');
        const ct = Buffer.from(parts[4], 'base64url');
        ct[0] ^= 0xff;
        parts[4] = ct.toString('base64url');
        expect(() => decryptToken(parts.join(':'), KEY)).toThrow();
    });

    it('BAŞKA ANAHTARLA yazılmış değer çözülemiyor', () => {
        const enc = encryptToken('jeton', KEY);
        expect(() => decryptToken(enc, crypto.randomBytes(32))).toThrow();
    });

    it('bozuk biçim fırlatıyor', () => {
        expect(() => decryptToken('enc:v1:sadece-iv', KEY)).toThrow(/biçimi bozuk/);
    });

    it('ESKİ DÜZ METİN olduğu gibi dönüyor (tembel göç onu yeniden yazar)', () => {
        expect(isEncryptedToken('ya29.eski-duz-metin')).toBe(false);
        expect(decryptToken('ya29.eski-duz-metin', KEY)).toBe('ya29.eski-duz-metin');
    });

    it('boş değerler boş kalıyor', () => {
        expect(encryptToken(null, KEY)).toBeNull();
        expect(encryptToken(undefined, KEY)).toBeNull();
        expect(decryptToken(null, KEY)).toBeNull();
        expect(decryptToken('', KEY)).toBe('');
    });
});

describe('loadEncryptionKey', () => {
    it('base64 32 baytı kabul ediyor', () => {
        expect(loadEncryptionKey({ INTEGRATION_ENCRYPTION_KEY: KEY_B64 }).equals(KEY)).toBe(true);
    });

    it('eksik anahtar fırlatıyor', () => {
        expect(() => loadEncryptionKey({})).toThrow(/tanımlı değil/);
    });

    it('yanlış boydaki anahtar fırlatıyor', () => {
        const kisa = crypto.randomBytes(16).toString('base64');
        expect(() => loadEncryptionKey({ INTEGRATION_ENCRYPTION_KEY: kisa })).toThrow(/32 bayt/);
    });

    it('varsayılan olarak process.env okunuyor', () => {
        vi.stubEnv('INTEGRATION_ENCRYPTION_KEY', KEY_B64);
        try {
            expect(decryptToken(encryptToken('env-jetonu'))).toBe('env-jetonu');
        } finally {
            vi.unstubAllEnvs();
        }
    });
});

describe('assertEncryptionKeyConfigured', () => {
    it('ÜRETİMDE anahtar yoksa sunucu açılmıyor', () => {
        expect(() => assertEncryptionKeyConfigured({ K_SERVICE: 'api' })).toThrow(/INTEGRATION_ENCRYPTION_KEY/);
    });

    it('üretimde geçerli anahtarla açılıyor', () => {
        expect(() => assertEncryptionKeyConfigured({ K_SERVICE: 'api', INTEGRATION_ENCRYPTION_KEY: KEY_B64 })).not.toThrow();
    });

    it('geliştirmede ve emülatörde yalnızca uyarıyor', () => {
        const log = { warn: vi.fn() };
        expect(() => assertEncryptionKeyConfigured({}, log)).not.toThrow();
        expect(() => assertEncryptionKeyConfigured({ K_SERVICE: 'api', FUNCTIONS_EMULATOR: 'true' }, log)).not.toThrow();
        expect(log.warn).toHaveBeenCalledTimes(2);
    });
});
