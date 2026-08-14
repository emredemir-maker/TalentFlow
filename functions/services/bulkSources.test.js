// KAYNAK DOĞRULAMASI — istemci artık dosya değil YOL gönderiyor.
//
// Yol göndermenin bedeli şudur: sunucu, gösterilen yolun gerçekten o
// kullanıcıya ait olduğunu kanıtlamak zorunda. Kanıtlamazsa "başkasının
// dosyasını bana oku" demenin kestirme yolu açılır. Bu projede aynı sınıf
// hatayı (kimliği istekten okumak) OAuth ucunda bir kez düzelttik; buradaki
// testlerin işi o kapının bir daha aralanmadığını göstermek.
import { describe, expect, it } from 'vitest';

import { parseSources, extensionOf, bulkPrefixFor, MAX_SOURCES } from './bulkSources.js';

const UID = 'user-1';
const ok = (name = 'cv.zip', uid = UID) => ({
    storagePath: `bulk-imports/${uid}/tok/0-${name}`,
    originalName: name,
    size: 1024,
});

describe('extensionOf', () => {
    it('reads the extension case-insensitively', () => {
        expect(extensionOf('Ozgur CV.PDF')).toBe('pdf');
        expect(extensionOf('arsiv.zip')).toBe('zip');
    });

    it('returns empty for a name without one', () => {
        expect(extensionOf('LICENSE')).toBe('');
        expect(extensionOf(null)).toBe('');
    });
});

describe('bulkPrefixFor', () => {
    it('scopes the prefix to the user', () => {
        expect(bulkPrefixFor('abc')).toBe('bulk-imports/abc/');
    });
});

describe('parseSources — sahiplik', () => {
    it('accepts a path under the caller own prefix', () => {
        const { sources, error } = parseSources([ok()], UID);
        expect(error).toBeNull();
        expect(sources).toHaveLength(1);
        expect(sources[0].ext).toBe('zip');
    });

    // ASIL MESELE BU: yol başkasınınsa indirmeyi reddetmeli.
    it('rejects a path belonging to another user', () => {
        const { sources, error } = parseSources([ok('cv.zip', 'user-2')], UID);
        expect(sources).toHaveLength(0);
        expect(error).toMatch(/bu kullanıcıya ait değil/i);
    });

    it('rejects traversal that would climb out of the prefix', () => {
        const entry = { ...ok(), storagePath: `bulk-imports/${UID}/../user-2/tok/cv.zip` };
        expect(parseSources([entry], UID).error).toMatch(/geçersiz karakter/i);
    });

    it('rejects an absolute path', () => {
        const entry = { ...ok(), storagePath: `/bulk-imports/${UID}/tok/cv.zip` };
        expect(parseSources([entry], UID).error).toMatch(/geçersiz karakter/i);
    });

    it('refuses to work without a resolved identity', () => {
        expect(parseSources([ok()], '').error).toMatch(/kimlik/i);
    });
});

describe('parseSources — biçim', () => {
    it('rejects a non-array body', () => {
        expect(parseSources({ storagePath: 'x' }, UID).error).toMatch(/dizi olmalı/i);
    });

    it('rejects an empty list', () => {
        expect(parseSources([], UID).error).toMatch(/bulunamadı/i);
    });

    it('rejects more sources than the cap', () => {
        const many = Array.from({ length: MAX_SOURCES + 1 }, (_, i) => ok(`cv${i}.pdf`));
        expect(parseSources(many, UID).error).toMatch(/en fazla/i);
    });

    it('rejects an unsupported file type', () => {
        expect(parseSources([ok('resim.png')], UID).error).toMatch(/desteklenmeyen/i);
    });

    it('rejects the same path declared twice', () => {
        expect(parseSources([ok(), ok()], UID).error).toMatch(/iki kez/i);
    });

    it('rejects a file over the size cap', () => {
        const big = { ...ok(), size: 500 * 1024 * 1024 };
        expect(parseSources([big], UID).error).toMatch(/boyut sınırını/i);
    });

    it('falls back to the storage path when originalName is missing', () => {
        const entry = { storagePath: `bulk-imports/${UID}/tok/0-cv.pdf`, size: 10 };
        const { sources, error } = parseSources([entry], UID);
        expect(error).toBeNull();
        expect(sources[0].originalName).toBe('0-cv.pdf');
        expect(sources[0].ext).toBe('pdf');
    });
});
