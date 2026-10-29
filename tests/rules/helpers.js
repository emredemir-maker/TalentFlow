// Güvenlik kuralı testleri için ortak yardımcılar.
//
// Testler GERÇEK kural dosyalarını (firestore.rules, storage.rules) emülatöre
// yükler; kuralın kopyası yoktur. Emülatörü `npm run test:rules` başlatır
// (`firebase emulators:exec --only firestore,storage`) ve adreslerini ortam
// değişkenleriyle verir (FIRESTORE_EMULATOR_HOST, FIREBASE_STORAGE_EMULATOR_HOST).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
    initializeTestEnvironment,
    assertFails,
    assertSucceeds,
} from '@firebase/rules-unit-testing';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');

// `demo-` önekli kimlik: emülatör gerçek projeye hiçbir koşulda bağlanmaz.
export const PROJECT_ID = 'demo-talentflow-rules';
// Storage kuralları bucket adına bakmıyor; üretimdeki adla aynı tutmak
// firebase.json'daki tek girdiyle karışıklığı önlüyor.
export const BUCKET = 'agentinn-nyqpx.firebasestorage.app';

function hostPort(envName, fallback) {
    const raw = process.env[envName] || fallback;
    const i = raw.lastIndexOf(':');
    return { host: raw.slice(0, i), port: Number(raw.slice(i + 1)) };
}

export async function createEnv() {
    return initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
            ...hostPort('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080'),
            rules: readFileSync(join(ROOT, 'firestore.rules'), 'utf8'),
        },
        storage: {
            ...hostPort('FIREBASE_STORAGE_EMULATOR_HOST', '127.0.0.1:9199'),
            rules: readFileSync(join(ROOT, 'storage.rules'), 'utf8'),
        },
    });
}

// ── Kimlikler ─────────────────────────────────────────────────────────────
// sign_in_provider kurallarda anonim/iç kullanıcı ayrımının tek dayanağı;
// her bağlamda açıkça yazılır ki test hangi oturum türünü sınadığını söylesin.
export function strictCtx(env, uid, extraClaims = {}) {
    return env.authenticatedContext(uid, {
        email: `${uid}@example.test`,
        firebase: { sign_in_provider: 'password' },
        ...extraClaims,
    });
}

export function anonCtx(env, uid = 'anon-visitor') {
    return env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } });
}

export function unauthCtx(env) {
    return env.unauthenticatedContext();
}

// Matristeki bir kimliğin (tests/rules/matrix.js → IDENTITIES) bağlamı.
export function ctxFor(env, key, identity) {
    switch (identity.kind) {
        case 'anon':
            return anonCtx(env, key);
        case 'unauth':
            return unauthCtx(env);
        default:
            return strictCtx(env, key, identity.claims || {});
    }
}

// Kuralları devre dışı bırakıp tohum verisi yazar.
export async function seed(env, docs) {
    await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        const entries = Object.entries(docs);
        // Toplu yazım: matris yüzlerce belge tohumluyor (sınır 500/parti).
        for (let i = 0; i < entries.length; i += 400) {
            const batch = db.batch();
            for (const [path, data] of entries.slice(i, i + 400)) batch.set(db.doc(path), data);
            await batch.commit();
        }
    });
}

export async function seedFiles(env, files) {
    await env.withSecurityRulesDisabled(async (ctx) => {
        const st = ctx.storage(`gs://${BUCKET}`);
        for (const [path, contentType] of Object.entries(files)) {
            await st.ref(path).put(new Uint8Array([1, 2, 3]), { contentType });
        }
    });
}

export const allow = (p) => assertSucceeds(p);
export const deny = (p) => assertFails(p);
