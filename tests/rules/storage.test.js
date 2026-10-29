// Storage kuralları — BUGÜNKÜ davranışın sabitlenmesi (çok şirketli geçiş, PR 0).
// Ayrıntılı gerekçe: tests/rules/firestore.test.js başlığı.
import { describe, it, beforeAll, afterAll } from 'vitest';
import {
    createEnv,
    strictCtx,
    anonCtx,
    unauthCtx,
    seed,
    seedFiles,
    allow,
    deny,
    BUCKET,
} from './helpers.js';

let env;

const D = 'artifacts/talent-flow/public/data';
const MB = 1024 * 1024;

beforeAll(async () => {
    env = await createEnv();
    await env.clearStorage();
    await env.clearFirestore();
    await seed(env, {
        [`${D}/users/u-super`]: { uid: 'u-super', role: 'super_admin' },
    });
    await seedFiles(env, {
        'cvs/c-1.pdf': 'application/pdf',
        'cvs/c-2/cv.pdf': 'application/pdf',
        'branding/logo.png': 'image/png',
        'avatars/u-1/a.png': 'image/png',
        'bulk-imports/u-1/a.zip': 'application/zip',
        'elsewhere/x.txt': 'text/plain',
    });
});

afterAll(async () => {
    await env?.cleanup();
});

const st = (ctx) => ctx.storage(`gs://${BUCKET}`);
const as = (uid, claims) => st(strictCtx(env, uid, claims));
const anon = () => st(anonCtx(env));
const unauth = () => st(unauthCtx(env));
const bytes = (n = 3) => new Uint8Array(n);
const put = (s, path, contentType, n) => s.ref(path).put(bytes(n), { contentType });

describe('cvs', () => {
    it('iç oturum okur (herhangi bir kullanıcı, BUGÜN); anonim ve kimliksiz okuyamaz', async () => {
        await allow(as('u-1').ref('cvs/c-1.pdf').getMetadata());
        await allow(as('u-1').ref('cvs/c-2/cv.pdf').getMetadata());
        await deny(anon().ref('cvs/c-1.pdf').getMetadata());
        await deny(unauth().ref('cvs/c-1.pdf').getMetadata());
    });
    it('listeleme kapalı', async () => {
        await deny(as('u-1').ref('cvs').listAll());
    });
    it('iç oturum 20MB altını yazar; anonim yazamaz; 20MB üstü reddedilir', async () => {
        await allow(put(as('u-1'), 'cvs/new.pdf', 'application/pdf'));
        await allow(put(as('u-1'), 'cvs/c-3/cv.pdf', 'application/pdf'));
        await deny(put(anon(), 'cvs/anon.pdf', 'application/pdf'));
        await deny(put(as('u-1'), 'cvs/big.pdf', 'application/pdf', 20 * MB + 1));
    });
});

describe('bulk-imports', () => {
    it('kişi yalnız kendi klasörüne yazar; anonim yazamaz; okuma kapalı', async () => {
        await allow(put(as('u-1'), 'bulk-imports/u-1/b.zip', 'application/zip'));
        await deny(put(as('u-2'), 'bulk-imports/u-1/c.zip', 'application/zip'));
        await deny(put(anon('u-1'), 'bulk-imports/u-1/d.zip', 'application/zip'));
        await deny(as('u-1').ref('bulk-imports/u-1/a.zip').getMetadata());
    });
});

describe('branding', () => {
    it('her oturum (anonim dahil) okur; kimliksiz okuyamaz; liste kapalı', async () => {
        await allow(anon().ref('branding/logo.png').getMetadata());
        await deny(unauth().ref('branding/logo.png').getMetadata());
        await deny(as('u-1').ref('branding').listAll());
    });
    it('yazma yalnız jetondaki role=super_admin talebiyle (BUGÜN — PR 1 üyeliğe bağlar)', async () => {
        await allow(put(as('u-claim', { role: 'super_admin' }), 'branding/new.png', 'image/png'));
        // Profilde super_admin olmak Storage'da yetmiyor: kural yalnız talebe bakıyor.
        await deny(put(as('u-super'), 'branding/new2.png', 'image/png'));
        await deny(put(as('u-claim', { role: 'super_admin' }), 'branding/x.svg', 'image/svg+xml'));
    });
});

describe('avatars', () => {
    it('sahibi resim yazar; başkası yazamaz; iç oturum okur, anonim okuyamaz', async () => {
        await allow(put(as('u-1'), 'avatars/u-1/b.png', 'image/png'));
        await deny(put(as('u-2'), 'avatars/u-1/c.png', 'image/png'));
        await deny(put(as('u-1'), 'avatars/u-1/d.svg', 'image/svg+xml'));
        await allow(as('u-2').ref('avatars/u-1/a.png').getMetadata());
        await deny(anon().ref('avatars/u-1/a.png').getMetadata());
    });
});

describe('varsayılan red', () => {
    it('kuralı olmayan yol kapalı', async () => {
        await deny(as('u-1').ref('elsewhere/x.txt').getMetadata());
        await deny(put(as('u-1'), 'elsewhere/y.txt', 'text/plain'));
    });
});
