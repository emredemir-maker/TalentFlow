// ŞİRKET BAŞINA AI BÜTÇESİ (PR 7, K8).
//
// İki yanlış davranış da pahalı:
//   • durdurmamak → bir şirket (ya da başvuru bağlantısını bulan biri) tüm
//     platformun Gemini faturasını yazar;
//   • yanlış durdurmak → başka şirketin tüketimi yüzünden bu şirketin işi durur,
//     ya da ertesi gün kota açılmaz.
// Firestore burada bellek içi bir sahte: işlemler (transaction) sırayla
// yürütülür, `increment` atomik. Gerçek Firestore'daki eşzamanlılık
// tests/server/isolation.test.js'te emülatörle de sınanıyor.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ docs: new Map(), failTx: null }));

vi.mock('../config/firebaseAdmin.js', () => {
    const isInc = (v) => v && typeof v === 'object' && '__inc' in v;
    const merge = (base, patch) => {
        const out = { ...(base || {}) };
        for (const [k, v] of Object.entries(patch)) {
            if (isInc(v)) out[k] = (Number(out[k]) || 0) + v.__inc;
            else if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) out[k] = merge(out[k], v);
            else out[k] = v;
        }
        return out;
    };
    const snap = (path) => {
        const d = store.docs.get(path);
        return { id: path.split('/').pop(), exists: d !== undefined, data: () => (d ? structuredClone(d) : undefined) };
    };
    const ref = (path) => ({
        path,
        get: async () => snap(path),
        set: async (data, opts) => {
            store.docs.set(path, opts?.merge ? merge(store.docs.get(path), data) : merge({}, data));
        },
    });
    let chain = Promise.resolve();
    const db = {
        doc: (p) => ref(p),
        getAll: async (...refs) => refs.map((r) => snap(r.path)),
        batch: () => {
            const ops = [];
            return {
                set: (r, data, opts) => ops.push(() => r.set(data, opts)),
                commit: async () => {
                    for (const op of ops) await op();
                },
            };
        },
        // Sırayla: Firestore'un işlem garantisinin (aynı belgeye çakışan
        // işlemler birbirinin yazdığını görür) en basit modeli.
        runTransaction: (fn) => {
            const run = chain.then(async () => {
                if (store.failTx) throw store.failTx;
                const writes = [];
                const tx = {
                    get: async (r) => snap(r.path),
                    getAll: async (...rs) => rs.map((r) => snap(r.path)),
                    set: (r, data, opts) => writes.push(() => r.set(data, opts)),
                    update: (r, data) => writes.push(() => r.set(data, { merge: true })),
                };
                const result = await fn(tx);
                for (const w of writes) await w();
                return result;
            });
            chain = run.catch(() => {});
            return run;
        },
    };
    return { db, admin: { firestore: { FieldValue: { increment: (n) => ({ __inc: n }) } } } };
});

const {
    decideReservation,
    reserveAi,
    settleAi,
    releaseAi,
    consumePlanUnit,
    refundPlanUnit,
    withPlanUnit,
    checkBulkBudget,
    estimateTokens,
    safeUserKey,
    resetDegradedSlots,
    minuteKey,
    monthKey,
    nextResetAt,
    QuotaError,
    BUDGET_CODE,
    RATE_CODE,
    PLAN_CODE,
} = await import('./aiQuota.js');
const { buildAiContext } = await import('./aiContext.js');
const { resolveAiLimits, resolvePlanLimits, validateLimitsPatch, DEFAULT_AI_LIMITS } = await import('./plans.js');

const GUN1 = new Date('2026-11-02T10:00:00.000Z');
const GUN1_GECE = new Date('2026-11-02T23:59:30.000Z');
const GUN2 = new Date('2026-11-03T00:00:30.000Z');

/** Küçük sınırlı şirket bağlamı: 10.000 token, kişi payı %60, dakikada 1000. */
function ctx(tenantId, uid = 'u1', over = {}) {
    return buildAiContext({
        tenantId,
        uid,
        tenant: { aiLimits: { dailyTokens: 10_000, userSharePct: 60, anonSharePct: 30, perMinuteCalls: 1000, ...over } },
    });
}
const usage = (t, day = '2026-11-02') => store.docs.get(`tenants/${t}/usage/${day}`) || {};

/** Ayır + gerçek tüketimle kapat. */
async function spend(c, tokens, now) {
    const lease = await reserveAi(c, { estimate: tokens, now });
    await settleAi(lease, { label: 'coverage', usage: { totalTokens: tokens, inTokens: tokens, outTokens: 0 }, now });
    return lease;
}

beforeEach(() => {
    store.docs.clear();
    store.failTx = null;
    resetDegradedSlots();
});

describe('plans — sınırların çözümü', () => {
    it('varsayılan K8: günde 2M token, 200 aramalı çağrı, kişi payı %40', () => {
        expect(resolveAiLimits({})).toEqual(DEFAULT_AI_LIMITS);
        expect(DEFAULT_AI_LIMITS.dailyTokens).toBe(2_000_000);
        expect(DEFAULT_AI_LIMITS.dailyGroundedCalls).toBe(200);
        expect(DEFAULT_AI_LIMITS.userSharePct).toBe(40);
    });

    it('GEÇERSİZ İSTİSNA FRENİ KALDIRMAZ: 0, negatif, metin ve aralık dışı yok sayılır', () => {
        for (const bad of [0, -1, '5000000', NaN, Infinity, 5e9]) {
            expect(resolveAiLimits({ aiLimits: { dailyTokens: bad } }).dailyTokens).toBe(2_000_000);
        }
        expect(resolveAiLimits({ aiLimits: { dailyTokens: 5_000_000 } }).dailyTokens).toBe(5_000_000);
        expect(resolveAiLimits({ aiLimits: { userSharePct: 101 } }).userSharePct).toBe(40);
    });

    it('paket: bilinmeyen paket denemeye düşer; istisnada null açıkça "sınır yok"', () => {
        expect(resolvePlanLimits({ talentPlan: 'yok-boyle' }).plan).toBe('trial');
        expect(resolvePlanLimits({ talentPlan: 'baslangic' }).monthlyPrescreens).toBe(200);
        expect(resolvePlanLimits({ talentPlan: 'profesyonel' }).monthlyPrescreens).toBe(600);
        expect(resolvePlanLimits({ talentPlan: 'baslangic', planLimits: { monthlyPrescreens: null } }).monthlyPrescreens).toBeNull();
        expect(resolvePlanLimits({ talentPlan: 'baslangic', planLimits: { monthlyPrescreens: 250 } }).monthlyPrescreens).toBe(250);
        // Deneme paketinde sınır yok (cömert başlangıç).
        expect(resolvePlanLimits({}).monthlyPrescreens).toBeNull();
    });

    it('platform güncellemesi doğrulanır: bilinmeyen alan/paket ve aralık dışı reddedilir', () => {
        // İstek gövdesinde `plan`, şirket belgesinde `talentPlan` (Hub'ın `plan` alanıyla çakışmasın).
        expect(validateLimitsPatch({ plan: 'profesyonel' })).toEqual({ ok: true, patch: { talentPlan: 'profesyonel' } });
        // Hub'ın yazdığı plan durumu paket sanılmaz.
        expect(resolvePlanLimits({ plan: 'active' }).plan).toBe('trial');
        expect(resolvePlanLimits({ plan: 'active', talentPlan: 'profesyonel' }).monthlyPrescreens).toBe(600);
        expect(validateLimitsPatch({ plan: 'altin' }).ok).toBe(false);
        expect(validateLimitsPatch({ aiLimits: { dailyTokens: 0 } }).ok).toBe(false);
        expect(validateLimitsPatch({ aiLimits: { superUser: 1 } }).ok).toBe(false);
        expect(validateLimitsPatch({ planLimits: { monthlyPrescreens: -3 } }).ok).toBe(false);
        expect(validateLimitsPatch({ planLimits: { monthlyPrescreens: null } }).ok).toBe(true);
        expect(validateLimitsPatch({}).ok).toBe(false);
    });
});

describe('decideReservation — saf karar', () => {
    const limits = resolveAiLimits({ aiLimits: { dailyTokens: 1000, userSharePct: 50, perMinuteCalls: 5, dailyGroundedCalls: 2 } });
    const base = { limits, userKey: 'u1', anonymous: false, grounded: false };

    it('ayrılmış (uçuştaki) tutar da sayılır: eşzamanlı çağrılar birbirini görür', () => {
        expect(decideReservation({ ...base, usage: { totals: { totalTokens: 300 }, quota: { reserved: 600 } }, estimate: 200 }).ok).toBe(false);
        expect(decideReservation({ ...base, usage: { totals: { totalTokens: 300 }, quota: { reserved: 500 } }, estimate: 200 }).ok).toBe(true);
    });

    it('kişi payı: şirkette yer olsa da kişinin %50 payı aşılamaz', () => {
        const r = decideReservation({ ...base, usage: { byUser: { u1: { totalTokens: 450 } } }, estimate: 100 });
        expect(r).toMatchObject({ ok: false, code: BUDGET_CODE, reason: 'user-share' });
        expect(decideReservation({ ...base, userKey: 'u2', usage: { byUser: { u1: { totalTokens: 450 } } }, estimate: 100 }).ok).toBe(true);
    });

    it('aramalı çağrı adedi ayrı sayılır; aramasız çağrıyı durdurmaz', () => {
        const u = { quota: { groundedCalls: 2 } };
        expect(decideReservation({ ...base, usage: u, estimate: 1, grounded: true })).toMatchObject({ ok: false, reason: 'tenant-grounded' });
        expect(decideReservation({ ...base, usage: u, estimate: 1 }).ok).toBe(true);
    });

    it('dakikalık şirket sınırı RATE kodu verir (geçici)', () => {
        expect(decideReservation({ ...base, rate: { count: 5 }, estimate: 1 })).toMatchObject({ ok: false, code: RATE_CODE });
    });
});

describe('reserveAi — iki şirket, aşım, ertesi gün', () => {
    it('A şirketinin tüketimi B şirketini durdurmaz', async () => {
        await spend(ctx('A', 'a1'), 5000, GUN1);
        await spend(ctx('A', 'a2'), 5000, GUN1);
        await expect(reserveAi(ctx('A', 'a3'), { estimate: 10, now: GUN1 })).rejects.toThrow(QuotaError);
        await expect(reserveAi(ctx('B', 'b1'), { estimate: 5000, now: GUN1 })).resolves.toMatchObject({ tenantId: 'B' });
        expect(usage('A').totals.totalTokens).toBe(10_000);
        expect(usage('B').quota.reserved).toBe(5000);
    });

    it('BÜTÇE AŞIMI: 429 kodu, Türkçe sebep, yenilenme zamanı (UTC gece yarısı = TSİ 03:00)', async () => {
        await spend(ctx('A', 'a1'), 6000, GUN1);
        await spend(ctx('A', 'a2'), 4000, GUN1);
        const err = await reserveAi(ctx('A', 'a3'), { estimate: 1, now: GUN1 }).catch((e) => e);
        expect(err).toBeInstanceOf(QuotaError);
        expect(err.code).toBe(BUDGET_CODE);
        expect(err.status).toBe(429);
        expect(err.userMessage).toMatch(/şirketinizin bugünkü AI kotası doldu/i);
        expect(err.userMessage).toMatch(/03:00/);
        expect(err.detail.resetAt).toBe('2026-11-03T00:00:00.000Z');
        // Ret sayısı panel için yazılır.
        await new Promise((r) => setTimeout(r, 0));
        // Ayrı belgede (ayırma belgesinde çakışma yaratmasın).
        expect(store.docs.get('tenants/A/usage/rejected-2026-11-02').count).toBe(1);
        expect(usage('A').quota?.rejected).toBeUndefined();
    });

    it('ERTESİ GÜN SIFIRLANIR: yeni gün yeni belge, ayrı sıfırlama işi yok', async () => {
        await spend(ctx('A', 'a1'), 6000, GUN1);
        await spend(ctx('A', 'a2'), 4000, GUN1_GECE);
        await expect(reserveAi(ctx('A', 'a1'), { estimate: 1, now: GUN1_GECE })).rejects.toThrow(QuotaError);
        // 03:00 TSİ = 00:00 UTC sonrası.
        const lease = await reserveAi(ctx('A', 'a1'), { estimate: 5000, now: GUN2 });
        expect(lease.day).toBe('2026-11-03');
        expect(usage('A', '2026-11-03').quota.reserved).toBe(5000);
        expect(nextResetAt(GUN1)).toBe('2026-11-03T00:00:00.000Z');
    });

    it('KİŞİ PAYI: tek kullanıcı şirket bütçesinin tamamını tüketemez (%60)', async () => {
        await spend(ctx('A', 'a1'), 6000, GUN1);
        const err = await reserveAi(ctx('A', 'a1'), { estimate: 1, now: GUN1 }).catch((e) => e);
        expect(err.detail.reason).toBe('user-share');
        await expect(reserveAi(ctx('A', 'a2'), { estimate: 4000, now: GUN1 })).resolves.toBeTruthy();
    });

    it('ADAY TARAFI tek kova (anon) ve kendi payıyla sınırlı (%30): iç kullanıcıları boğamaz', async () => {
        const anon = buildAiContext({ tenantId: 'A', anonymous: true, tenant: { aiLimits: { dailyTokens: 10_000, anonSharePct: 30 } } });
        expect(anon.userKey).toBe('anon');
        await spend(anon, 3000, GUN1);
        const err = await reserveAi(anon, { estimate: 1, now: GUN1 }).catch((e) => e);
        expect(err.detail.reason).toBe('anon-share');
        await expect(reserveAi(ctx('A', 'a1'), { estimate: 5000, now: GUN1 })).resolves.toBeTruthy();
    });

    it('EŞZAMANLI AYIRMA: aynı anda 20 istek, bütçe 10 çağrılık → tam 10 geçer (önce say sonra yaz yok)', async () => {
        const c = ctx('A', 'a1', { userSharePct: 100 });
        const results = await Promise.allSettled(
            Array.from({ length: 20 }, () => reserveAi(c, { estimate: 1000, now: GUN1 }))
        );
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
        expect(results.filter((r) => r.status === 'rejected').every((r) => r.reason instanceof QuotaError)).toBe(true);
        expect(usage('A').quota.reserved).toBe(10_000);
    });

    it('kapatma: tahmin geri alınır, gerçek tüketim yazılır; başarısız çağrı yalnız tahmini bırakır', async () => {
        const c = ctx('A', 'a1');
        const lease = await reserveAi(c, { estimate: 3000, now: GUN1 });
        await settleAi(lease, { label: 'cv-parse', usage: { totalTokens: 1200, inTokens: 1000, outTokens: 200 }, now: GUN1 });
        expect(usage('A').quota.reserved).toBe(0);
        expect(usage('A').totals.totalTokens).toBe(1200);
        expect(usage('A').byUser.a1).toMatchObject({ totalTokens: 1200, reserved: 0, calls: 1 });
        expect(usage('A').byLabel['cv-parse'].totalTokens).toBe(1200);
        // Aylık toplam ayrı belgede, `day` alanı yok (günlük listeye karışmaz).
        const month = store.docs.get(`tenants/A/usage/${monthKey(GUN1)}`);
        expect(month.totals.totalTokens).toBe(1200);
        expect(month.day).toBeUndefined();
        // İkinci kapatma etkisiz (çift sayım yok).
        await settleAi(lease, { usage: { totalTokens: 999 }, now: GUN1 });
        expect(usage('A').totals.totalTokens).toBe(1200);

        const failed = await reserveAi(c, { estimate: 2000, grounded: true, now: GUN1 });
        expect(usage('A').quota.groundedCalls).toBe(1);
        await releaseAi(failed);
        expect(usage('A').quota.reserved).toBe(0);
        expect(usage('A').quota.groundedCalls).toBe(0);
        expect(usage('A').totals.totalTokens).toBe(1200);
    });

    it('dakikalık şirket sayacı tüm kullanıcılar için ortak, TTL alanı yazılır', async () => {
        const lim = { perMinuteCalls: 2, userSharePct: 100 };
        await reserveAi(ctx('A', 'a1', lim), { estimate: 1, now: GUN1 });
        await reserveAi(ctx('A', 'a2', lim), { estimate: 1, now: GUN1 });
        const err = await reserveAi(ctx('A', 'a3', lim), { estimate: 1, now: GUN1 }).catch((e) => e);
        expect(err.code).toBe(RATE_CODE);
        const rate = store.docs.get(`tenants/A/rate/${minuteKey(GUN1)}`);
        expect(rate.count).toBe(2);
        expect(rate.expiresAt.getTime()).toBe(GUN1.getTime() + 120_000);
        // Bir dakika sonra yeni sayaç.
        await expect(reserveAi(ctx('A', 'a3', lim), { estimate: 1, now: new Date(GUN1.getTime() + 60_000) })).resolves.toBeTruthy();
    });

    it('ALTYAPI HATASI işi durdurmaz (degraded kira), bütçe aşımı ise asla bu yola düşmez', async () => {
        store.failTx = new Error('UNAVAILABLE');
        const lease = await reserveAi(ctx('A'), { estimate: 100, now: GUN1 });
        expect(lease.degraded).toBe(true);
        store.failTx = null;
        await settleAi(lease, { usage: { totalTokens: 100 }, now: GUN1 });
        expect(usage('A').totals.totalTokens).toBe(100);
        // degraded kira ayırmadığı için geri almaz (negatif sayaç yok).
        expect(usage('A').quota.reserved).toBe(0);
    });

    it('İŞLEM ÇAKIŞMASI ölçümsüz geçiş DEĞİL: geçici RATE reddi (yoğunlukla kota atlatılamaz)', async () => {
        store.failTx = Object.assign(new Error('10 ABORTED: Too much contention on these documents.'), { code: 10 });
        const err = await reserveAi(ctx('A'), { estimate: 100, now: GUN1 }).catch((e) => e);
        expect(err).toBeInstanceOf(QuotaError);
        expect(err.code).toBe(RATE_CODE);
    });

    it('ADAY DAKİKALIK SINIRI: aday akını iç kullanıcının dakikalık hakkını dolduramaz', async () => {
        const anon = buildAiContext({ tenantId: 'A', anonymous: true, tenant: { aiLimits: { dailyTokens: 1e6, anonPerMinuteCalls: 2, perMinuteCalls: 3 } } });
        await reserveAi(anon, { estimate: 1, now: GUN1 });
        await reserveAi(anon, { estimate: 1, now: GUN1 });
        const err = await reserveAi(anon, { estimate: 1, now: GUN1 }).catch((e) => e);
        expect(err.detail.reason).toBe('anon-minute');
        const member = buildAiContext({ tenantId: 'A', uid: 'a1', tenant: { aiLimits: { dailyTokens: 1e6, anonPerMinuteCalls: 2, perMinuteCalls: 3 } } });
        await expect(reserveAi(member, { estimate: 1, now: GUN1 })).resolves.toBeTruthy();
    });

    it('altyapı arızasında ADAY çağrısı ölçümsüz geçmez; iç kullanıcıya dakikalık sınırlı istisna', async () => {
        store.failTx = Object.assign(new Error('UNAVAILABLE'), { code: 14 });
        const anon = buildAiContext({ tenantId: 'A', anonymous: true, tenant: {} });
        expect((await reserveAi(anon, { estimate: 1, now: GUN1 }).catch((e) => e)).code).toBe(RATE_CODE);
        const member = ctx('A');
        for (let i = 0; i < 30; i++) expect((await reserveAi(member, { estimate: 1, now: GUN1 })).degraded).toBe(true);
        expect((await reserveAi(member, { estimate: 1, now: GUN1 }).catch((e) => e)).code).toBe(RATE_CODE);
    });

    it('biçime uymayan uid aday kovasına düşmez', () => {
        expect(safeUserKey('abc_1')).toBe('abc_1');
        expect(safeUserKey('anon')).toBe('anon');
        expect(safeUserKey('a.b@c')).toMatch(/^h_[0-9a-f]{32}$/);
        expect(safeUserKey('')).toBe('system');
    });

    it('şirket kimliği doğrulanmadan çağrı yok', async () => {
        await expect(reserveAi(null, { estimate: 1 })).rejects.toThrow(/AI_TENANT_REQUIRED/);
        await expect(reserveAi({ tenantId: '../B', limits: DEFAULT_AI_LIMITS }, { estimate: 1 })).rejects.toThrow(/AI_TENANT_REQUIRED/);
    });
});

describe('paket birimleri (ön analiz, mülakat değerlendirmesi)', () => {
    const planCtx = (limit) =>
        buildAiContext({ tenantId: 'A', uid: 'a1', tenant: { talentPlan: 'baslangic', planLimits: { monthlyPrescreens: limit } } });

    it('sınır yoksa yalnız sayar; sınır varsa aşımı atomik olarak reddeder', async () => {
        const free = buildAiContext({ tenantId: 'A', uid: 'a1', tenant: {} });
        await consumePlanUnit(free, 'prescreen', 5, GUN1);
        expect(store.docs.get(`tenants/A/usage/${monthKey(GUN1)}`).units.prescreen).toBe(5);

        const c = planCtx(7);
        await consumePlanUnit(c, 'prescreen', 2, GUN1);
        const err = await consumePlanUnit(c, 'prescreen', 1, GUN1).catch((e) => e);
        expect(err).toBeInstanceOf(QuotaError);
        expect(err.code).toBe(PLAN_CODE);
        expect(err.userMessage).toMatch(/ön analiz hakkı doldu \(7 \/ 7\)/);
    });

    it('ay dönünce yenilenir', async () => {
        const c = planCtx(1);
        await consumePlanUnit(c, 'prescreen', 1, GUN1);
        await expect(consumePlanUnit(c, 'prescreen', 1, GUN1)).rejects.toThrow(QuotaError);
        await expect(consumePlanUnit(c, 'prescreen', 1, new Date('2026-12-01T00:00:01Z'))).resolves.toBe(true);
    });

    it('eşzamanlı tüketim sınırı aşmaz', async () => {
        const c = planCtx(3);
        const r = await Promise.allSettled(Array.from({ length: 6 }, () => consumePlanUnit(c, 'interviewEval', 1, GUN1)));
        // interviewEval sınırı baslangic'te null → hepsi geçer; prescreen 3 ile dener.
        expect(r.every((x) => x.status === 'fulfilled')).toBe(true);
        const r2 = await Promise.allSettled(Array.from({ length: 6 }, () => consumePlanUnit(c, 'prescreen', 1, GUN1)));
        expect(r2.filter((x) => x.status === 'fulfilled')).toHaveLength(3);
    });
});

describe('paket birimi iadesi (kota reddinde AI çalışmadı)', () => {
    const planCtx = (limit) =>
        buildAiContext({ tenantId: 'R', uid: 'r1', tenant: { talentPlan: 'baslangic', planLimits: { monthlyPrescreens: limit } } });
    const used = () => store.docs.get(`tenants/R/usage/${monthKey(new Date())}`)?.units?.prescreen ?? 0;

    it('iş kota reddiyle düşerse birim geri verilir; başka hata ve başarı birimi tutar', async () => {
        const c = planCtx(10);
        const before = used();
        const quotaErr = new QuotaError(BUDGET_CODE, 'bütçe doldu');
        await expect(withPlanUnit(c, 'prescreen', async () => { throw quotaErr; })).rejects.toBe(quotaErr);
        expect(used()).toBe(before);
        await expect(withPlanUnit(c, 'prescreen', async () => { throw new Error('model'); })).rejects.toThrow('model');
        expect(used()).toBe(before + 1);
        await expect(withPlanUnit(c, 'prescreen', async () => 'ok')).resolves.toBe('ok');
        expect(used()).toBe(before + 2);
    });

    it('paket hakkı doluysa iş hiç başlamaz; iade sıfırın altına inmez', async () => {
        const c = planCtx(0);
        let ran = false;
        await expect(withPlanUnit(c, 'prescreen', async () => { ran = true; })).rejects.toThrow(QuotaError);
        expect(ran).toBe(false);
        const d = buildAiContext({ tenantId: 'Z', uid: 'z1', tenant: {} });
        await refundPlanUnit(d, 'prescreen');
        expect(store.docs.get(`tenants/Z/usage/${monthKey(new Date())}`)?.units?.prescreen ?? 0).toBe(0);
    });
});

describe('toplu iş ön denetimi', () => {
    it('tahmini maliyet kalan bütçeyi aşıyorsa iş başlamadan reddedilir', async () => {
        process.env.BULK_TOKENS_PER_CV = '1000';
        try {
            const c = ctx('A', 'a1', { userSharePct: 100 });
            await spend(c, 4000, GUN1);
            expect(await checkBulkBudget(c, 6, GUN1)).toEqual({ ok: true });
            const r = await checkBulkBudget(c, 7, GUN1);
            expect(r).toMatchObject({ ok: false, code: BUDGET_CODE });
            expect(r.message).toMatch(/yaklaşık 6 CV/);
        } finally {
            delete process.env.BULK_TOKENS_PER_CV;
        }
    });

    it('paket hakkı yetmiyorsa da reddedilir', async () => {
        const c = buildAiContext({ tenantId: 'A', uid: 'a1', tenant: { talentPlan: 'baslangic' } });
        await consumePlanUnit(c, 'prescreen', 195, GUN1);
        expect((await checkBulkBudget(c, 6, GUN1)).code).toBe(PLAN_CODE);
        expect((await checkBulkBudget(c, 5, GUN1)).ok).toBe(true);
    });
});

describe('tahmin', () => {
    it('metin uzunluğu + sınırlı çıktı payı; ses girdisi kaba ama sınırlı', () => {
        expect(estimateTokens('x'.repeat(3000), 8192)).toBe(1000 + 8192);
        expect(estimateTokens('x'.repeat(300), 512)).toBe(100 + 512);
        // Çıktı payı istenen tavanın tamamı (en çok 32k).
        expect(estimateTokens('x', 100000)).toBe(1 + 32768);
        // SES BAYTTAN: 5 MB base64 ≈ 3,75 MB → ~61k token (eski hesap ~46k'yı da altta bırakıyordu).
        expect(estimateTokens([{ inlineData: { data: 'a'.repeat(5_000_000) } }], 1024)).toBeGreaterThan(58_000);
    });
});
