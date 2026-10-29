// Storage kuralları — çok şirketli model (docs/coklu-sirket-plani.md §3.2, §3.3).
// Yetki Firestore'daki üyelik belgesinden çapraz okumayla gelir; kimlikler ve
// üyelikler tests/rules/matrix.js ile aynı.
import { describe, it, beforeAll, afterAll } from 'vitest';
import { createEnv, ctxFor, seed, seedFiles, allow, deny, BUCKET } from './helpers.js';
import { IDENTITIES, TENANTS } from './matrix.js';

let env;
const MB = 1024 * 1024;

beforeAll(async () => {
    env = await createEnv();
    await env.clearStorage();
    await env.clearFirestore();
    const docs = {};
    // Şirket belgeleri: Storage kuralları da şirket durumuna bakıyor (K5).
    for (const [t, data] of Object.entries(TENANTS)) docs[`tenants/${t}`] = data;
    for (const [key, id] of Object.entries(IDENTITIES)) {
        for (const [t, m] of Object.entries(id.memberships || {})) {
            docs[`tenants/${t}/members/${key}`] = {
                role: m.role,
                departments: m.departments || [],
                status: m.status || 'active',
                ...(m.expiresAt ? { expiresAt: m.expiresAt } : {}),
            };
        }
    }
    // Eski düzende super_admin profili — Storage'da artık hiçbir anlamı yok.
    docs['artifacts/talent-flow/public/data/users/claimAdmin'] = { role: 'super_admin' };
    await seed(env, docs);
    await seedFiles(env, {
        'tenants/A/cvs/c-1.pdf': 'application/pdf',
        'tenants/A/cvs/c-2/cv.pdf': 'application/pdf',
        'tenants/B/cvs/b-1.pdf': 'application/pdf',
        'tenants/A/branding/logo.png': 'image/png',
        'tenants/A/bulk-imports/aRecruiter/a.zip': 'application/zip',
        'tenants/C/cvs/c-1.pdf': 'application/pdf',
        'tenants/C/branding/logo.png': 'image/png',
        'tenants/D/cvs/d-1.pdf': 'application/pdf',
        'tenants/D/branding/logo.png': 'image/png',
        'tenants/E/cvs/e-1.pdf': 'application/pdf',
        'tenants/F/cvs/f-1.pdf': 'application/pdf',
        'tenants/Z/cvs/z-1.pdf': 'application/pdf',
        'avatars/aDept/a.png': 'image/png',
        'cvs/old.pdf': 'application/pdf',
        'branding/old.png': 'image/png',
        'bulk-imports/aRecruiter/old.zip': 'application/zip',
        'elsewhere/x.txt': 'text/plain',
    });
});

afterAll(async () => {
    await env?.cleanup();
});

const st = (key) => ctxFor(env, key, IDENTITIES[key]).storage(`gs://${BUCKET}`);
const meta = (key, path) => st(key).ref(path).getMetadata();
const put = (key, path, contentType, n = 3) =>
    st(key).ref(path).put(new Uint8Array(n), { contentType });

describe('tenants/{t}/cvs', () => {
    it('A şirketinin etkin üyeleri okur', async () => {
        for (const key of ['aAdmin', 'aRecruiter', 'aDept', 'aDeptNone', 'aSupport', 'multi']) {
            await allow(meta(key, 'tenants/A/cvs/c-1.pdf'));
        }
        await allow(meta('aRecruiter', 'tenants/A/cvs/c-2/cv.pdf'));
    });
    it('B üyesi, kaldırılmış/süresi dolmuş üye, üye olmayan, talepli, anonim okuyamaz', async () => {
        for (const key of [
            'bAdmin',
            'bRecruiter',
            'aRemoved',
            'aSupportExpired',
            'nonMember',
            'claimAdmin',
            'anonWithMembership',
            'anon',
            'unauth',
        ]) {
            await deny(meta(key, 'tenants/A/cvs/c-1.pdf'));
        }
        // ve tersi: A üyesi B'nin dosyasını okuyamaz.
        await deny(meta('aAdmin', 'tenants/B/cvs/b-1.pdf'));
    });
    it('listeleme kapalı', async () => {
        await deny(st('aAdmin').ref('tenants/A/cvs').listAll());
    });
    it('yazma yalnız admin/recruiter ve 20MB altı', async () => {
        await allow(put('aAdmin', 'tenants/A/cvs/n-1.pdf', 'application/pdf'));
        await allow(put('aRecruiter', 'tenants/A/cvs/n-2/cv.pdf', 'application/pdf'));
        await deny(put('aRecruiter', 'tenants/A/cvs/big.pdf', 'application/pdf', 20 * MB + 1));
        for (const key of [
            'aDept',
            'aSupport',
            'bAdmin',
            'claimAdmin',
            'anon',
            'nonMember',
            'aRemoved',
        ]) {
            await deny(put(key, `tenants/A/cvs/${key}.pdf`, 'application/pdf'));
        }
    });
    it('silme istemciden kapalı (sunucu siler)', async () => {
        await deny(st('aAdmin').ref('tenants/A/cvs/c-1.pdf').delete());
    });
});

describe('tenants/{t}/bulk-imports/{uid}', () => {
    it('kişi yalnız kendi klasörüne, kendi şirketinde yazar', async () => {
        await allow(
            put('aRecruiter', 'tenants/A/bulk-imports/aRecruiter/b.zip', 'application/zip')
        );
        await allow(put('aDept', 'tenants/A/bulk-imports/aDept/b.zip', 'application/zip'));
        await deny(put('aAdmin', 'tenants/A/bulk-imports/aRecruiter/c.zip', 'application/zip'));
        await deny(put('bRecruiter', 'tenants/A/bulk-imports/bRecruiter/c.zip', 'application/zip'));
        await deny(put('aSupport', 'tenants/A/bulk-imports/aSupport/c.zip', 'application/zip'));
        await deny(put('anon', 'tenants/A/bulk-imports/anon/c.zip', 'application/zip'));
        await deny(put('nonMember', 'tenants/A/bulk-imports/nonMember/c.zip', 'application/zip'));
    });
    it('okuma kapalı (dosyayı yalnız sunucu açar)', async () => {
        await deny(meta('aRecruiter', 'tenants/A/bulk-imports/aRecruiter/a.zip'));
    });
});

describe('tenants/{t}/branding', () => {
    it('her oturum (anonim dahil) okur; kimliksiz okuyamaz; liste kapalı', async () => {
        await allow(meta('anon', 'tenants/A/branding/logo.png'));
        await allow(meta('bAdmin', 'tenants/A/branding/logo.png'));
        await deny(meta('unauth', 'tenants/A/branding/logo.png'));
        await deny(st('aAdmin').ref('tenants/A/branding').listAll());
    });
    it('yazma yalnız A admini, yalnız raster resim', async () => {
        await allow(put('aAdmin', 'tenants/A/branding/new.png', 'image/png'));
        await deny(put('aAdmin', 'tenants/A/branding/x.svg', 'image/svg+xml'));
        for (const key of ['aRecruiter', 'aSupport', 'bAdmin', 'claimAdmin', 'multi']) {
            await deny(put(key, `tenants/A/branding/${key}.png`, 'image/png'));
        }
        // multi B'de admin: B'nin logosunu yazar.
        await allow(put('multi', 'tenants/B/branding/logo.png', 'image/png'));
    });
});

describe('şirket durumu (K5)', () => {
    // Firestore kurallarıyla aynı bant: C (yazma süresi geçmiş) ve F (readonly)
    // okur, yazamaz; D (okuma süresi geçmiş) ve E (askıda) hiçbir şey yapamaz.
    it('salt okunur şirket (C, F): CV okunur, CV/toplu/logo yazılamaz', async () => {
        await allow(meta('cAdmin', 'tenants/C/cvs/c-1.pdf'));
        await allow(meta('cRecruiter', 'tenants/C/cvs/c-1.pdf'));
        await allow(meta('fAdmin', 'tenants/F/cvs/f-1.pdf'));
        await allow(meta('anon', 'tenants/C/branding/logo.png'));
        await deny(put('cAdmin', 'tenants/C/cvs/n.pdf', 'application/pdf'));
        await deny(put('cRecruiter', 'tenants/C/cvs/n.pdf', 'application/pdf'));
        await deny(put('fAdmin', 'tenants/F/cvs/n.pdf', 'application/pdf'));
        await deny(put('cRecruiter', 'tenants/C/bulk-imports/cRecruiter/a.zip', 'application/zip'));
        await deny(put('cAdmin', 'tenants/C/branding/new.png', 'image/png'));
    });
    it('kapalı (D) ve askıdaki (E) şirket: okuma da yazma da yok', async () => {
        await deny(meta('dAdmin', 'tenants/D/cvs/d-1.pdf'));
        await deny(meta('eAdmin', 'tenants/E/cvs/e-1.pdf'));
        await deny(meta('anon', 'tenants/D/branding/logo.png'));
        await deny(put('dAdmin', 'tenants/D/cvs/n.pdf', 'application/pdf'));
        await deny(put('eAdmin', 'tenants/E/cvs/n.pdf', 'application/pdf'));
        await deny(put('dAdmin', 'tenants/D/bulk-imports/dAdmin/a.zip', 'application/zip'));
    });
    it('şirket belgesi olmayan yol: üyelik olsa da red', async () => {
        // aAdmin'in Z'de üyeliği yok; burada önemli olan şirket belgesinin
        // yokluğunun da reddettiği — üyelik belgesi elle yazılır.
        await seed(env, {
            'tenants/Z/members/aAdmin': { role: 'admin', departments: [], status: 'active' },
        });
        await deny(meta('aAdmin', 'tenants/Z/cvs/z-1.pdf'));
        await deny(put('aAdmin', 'tenants/Z/cvs/n.pdf', 'application/pdf'));
    });
});

describe('avatars (kişiye ait, değişmedi)', () => {
    it('sahibi resim yazar; başkası yazamaz; iç oturum okur, anonim okuyamaz', async () => {
        await allow(put('aDept', 'avatars/aDept/b.png', 'image/png'));
        await deny(put('aAdmin', 'avatars/aDept/c.png', 'image/png'));
        await deny(put('aDept', 'avatars/aDept/d.svg', 'image/svg+xml'));
        await allow(meta('bAdmin', 'avatars/aDept/a.png'));
        await deny(meta('anon', 'avatars/aDept/a.png'));
    });
});

describe('eski ortak yollar (K10)', () => {
    it('cvs/**, branding/**, bulk-imports/** herkes için kapalı', async () => {
        for (const key of ['aAdmin', 'claimAdmin', 'nonMember', 'anon']) {
            await deny(meta(key, 'cvs/old.pdf'));
            await deny(meta(key, 'branding/old.png'));
            await deny(put(key, 'cvs/new.pdf', 'application/pdf'));
            await deny(put(key, 'branding/new.png', 'image/png'));
            await deny(put(key, `bulk-imports/${key}/new.zip`, 'application/zip'));
        }
    });
    it('kuralı olmayan yol kapalı', async () => {
        await deny(meta('aAdmin', 'elsewhere/x.txt'));
        await deny(put('aAdmin', 'tenants/A/other/x.txt', 'text/plain'));
    });
});
