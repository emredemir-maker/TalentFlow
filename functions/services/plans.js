// PAKETLER VE ŞİRKET LİMİTLERİ — tek kaynak.
//
// Clyro sitesindeki Talent fiyatları (Hub-Inn apps/site/fiyatlar.html):
//   Başlangıç    4.900 TL/ay —  200 ön analiz
//   Profesyonel 12.900 TL/ay —  600 ön analiz
//   Kurumsal    24.900 TL/ay —  (sitedeki sayılar buraya işlenecek)
// Mülakat değerlendirmesi ve mülakat saati sayıları sitedeki tabloyla
// eşitlenene kadar `null` (= sınır yok). Yanlış bir sayıyla müşteriyi
// durdurmaktansa sınırı geç koymak tercih edildi (plan §6, PR 7: "varsayılanlar
// cömert başlar").
//
// ── NEREDE TUTULUR ──────────────────────────────────────────────────────────
// `tenants/{t}` belgesinde (istemciye yazma kapalı; yalnız sunucu / platform):
//   plan:        'trial' | 'baslangic' | 'profesyonel' | 'kurumsal'
//   planLimits:  { monthlyPrescreens, monthlyInterviewEvals, monthlyInterviewHours }
//                — pakete göre istisna (platform yöneticisi / Hub konsolu)
//   aiLimits:    { dailyTokens, dailyGroundedCalls, userSharePct, anonSharePct,
//                  perMinuteCalls } — AI freni (K8), pakete göre istisna
// Atama bugün `PUT /api/platform/tenants/:tenantId/limits` (platform yöneticisi);
// ileride Hub konsolu aynı alanları Hub köprüsü üzerinden yazar.
//
// ── NEDEN AYRI İKİ ÇEŞİT SINIR ──────────────────────────────────────────────
// Paket birimi (ön analiz, mülakat değerlendirmesi) müşterinin satın aldığı
// şey: AYLIK ve iş sayısıyla. AI token freni platformun maliyet güvencesi:
// GÜNLÜK ve token ile (K8: şirket başına günde 2M token, aşınca dur, ertesi
// gün devam). Biri diğerinin yerine geçmez: 200 ön analizlik pakette tek bir
// şirket bir günde 2M token yakabilir, 2M tokenlık bir gün tek bir ön analizi
// bile kapsamayabilir.

/** Bilinen paketler. Sayı `null` = sınır yok. */
export const PLAN_CATALOG = Object.freeze({
    trial: {
        label: 'Deneme',
        priceTry: 0,
        monthlyPrescreens: null,
        monthlyInterviewEvals: null,
        monthlyInterviewHours: null,
    },
    baslangic: {
        label: 'Başlangıç',
        priceTry: 4900,
        monthlyPrescreens: 200,
        monthlyInterviewEvals: null,
        monthlyInterviewHours: null,
    },
    profesyonel: {
        label: 'Profesyonel',
        priceTry: 12900,
        monthlyPrescreens: 600,
        monthlyInterviewEvals: null,
        monthlyInterviewHours: null,
    },
    kurumsal: {
        label: 'Kurumsal',
        priceTry: 24900,
        monthlyPrescreens: null,
        monthlyInterviewEvals: null,
        monthlyInterviewHours: null,
    },
});

/** Paket birimleri → aylık sınır alanı. */
export const PLAN_UNITS = Object.freeze({
    prescreen: 'monthlyPrescreens',
    interviewEval: 'monthlyInterviewEvals',
    interviewHour: 'monthlyInterviewHours',
});

/**
 * AI freninin başlangıç değerleri (K8, plan §5.2).
 *   dailyTokens        — şirket başına günlük token (2M)
 *   dailyGroundedCalls — aramalı çağrı ADEDİ (token'dan ayrı faturalanır)
 *   userSharePct       — tek kullanıcının şirket bütçesinden alabileceği pay
 *   anonSharePct       — aday tarafının (anonim, tek kova) payı
 *   perMinuteCalls     — şirket genelinde dakikalık AI çağrısı (tüm örnekler)
 */
export const DEFAULT_AI_LIMITS = Object.freeze({
    dailyTokens: 2_000_000,
    dailyGroundedCalls: 200,
    userSharePct: 40,
    anonSharePct: 40,
    perMinuteCalls: 120,
});

const AI_LIMIT_BOUNDS = {
    dailyTokens: [1_000, 1_000_000_000],
    dailyGroundedCalls: [1, 1_000_000],
    userSharePct: [1, 100],
    anonSharePct: [1, 100],
    perMinuteCalls: [1, 100_000],
};

const PLAN_LIMIT_BOUNDS = [0, 10_000_000];

/** Pozitif sonlu tam sayı ve aralıkta mı? Değilse undefined. */
function boundedInt(v, [min, max]) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
    const n = Math.floor(v);
    if (n < min || n > max) return undefined;
    return n;
}

/**
 * Yürürlükteki AI sınırları: varsayılan ← şirket istisnası.
 *
 * Geçersiz değer YOK SAYILIR, sıfır ya da negatif "sınırsız" anlamına GELMEZ:
 * bir yazım hatası şirketin frenini sessizce kaldırmasın. Sınırsız bir şirket
 * istenirse büyük bir sayı yazılır (üst sınır 1 milyar token).
 */
export function resolveAiLimits(tenant) {
    const out = { ...DEFAULT_AI_LIMITS };
    const own = tenant && typeof tenant.aiLimits === 'object' && tenant.aiLimits ? tenant.aiLimits : {};
    for (const [k, bounds] of Object.entries(AI_LIMIT_BOUNDS)) {
        const n = boundedInt(own[k], bounds);
        if (n !== undefined) out[k] = n;
    }
    return out;
}

/** Şirketin paketi; bilinmeyen değer 'trial'. */
export function planOf(tenant) {
    const p = typeof tenant?.plan === 'string' ? tenant.plan : '';
    return Object.prototype.hasOwnProperty.call(PLAN_CATALOG, p) ? p : 'trial';
}

/**
 * Yürürlükteki aylık paket sınırları: paket ← şirket istisnası.
 * İstisnada `null` açıkça "sınır yok" demektir; geçersiz değer yok sayılır.
 */
export function resolvePlanLimits(tenant) {
    const plan = planOf(tenant);
    const base = PLAN_CATALOG[plan];
    const out = {
        plan,
        label: base.label,
        monthlyPrescreens: base.monthlyPrescreens,
        monthlyInterviewEvals: base.monthlyInterviewEvals,
        monthlyInterviewHours: base.monthlyInterviewHours,
    };
    const own = tenant && typeof tenant.planLimits === 'object' && tenant.planLimits ? tenant.planLimits : {};
    for (const field of Object.values(PLAN_UNITS)) {
        if (!Object.prototype.hasOwnProperty.call(own, field)) continue;
        if (own[field] === null) {
            out[field] = null;
            continue;
        }
        const n = boundedInt(own[field], PLAN_LIMIT_BOUNDS);
        if (n !== undefined) out[field] = n;
    }
    return out;
}

/**
 * Platform yöneticisinin gönderdiği limit güncellemesini doğrular.
 * @returns {{ ok: true, patch: object } | { ok: false, error: string }}
 */
export function validateLimitsPatch(body) {
    const patch = {};
    if (body == null || typeof body !== 'object') return { ok: false, error: 'Gövde geçersiz.' };
    if (body.plan !== undefined) {
        if (typeof body.plan !== 'string' || !Object.prototype.hasOwnProperty.call(PLAN_CATALOG, body.plan)) {
            return { ok: false, error: `Bilinmeyen paket. Geçerli: ${Object.keys(PLAN_CATALOG).join(', ')}` };
        }
        patch.plan = body.plan;
    }
    if (body.aiLimits !== undefined) {
        if (body.aiLimits === null) {
            patch.aiLimits = {};
        } else if (typeof body.aiLimits !== 'object') {
            return { ok: false, error: 'aiLimits nesne olmalı.' };
        } else {
            const ai = {};
            for (const [k, v] of Object.entries(body.aiLimits)) {
                if (!AI_LIMIT_BOUNDS[k]) return { ok: false, error: `Bilinmeyen AI sınırı: ${k}` };
                const n = boundedInt(v, AI_LIMIT_BOUNDS[k]);
                if (n === undefined) {
                    const [min, max] = AI_LIMIT_BOUNDS[k];
                    return { ok: false, error: `${k} ${min}–${max} arasında tam sayı olmalı.` };
                }
                ai[k] = n;
            }
            patch.aiLimits = ai;
        }
    }
    if (body.planLimits !== undefined) {
        if (body.planLimits === null) {
            patch.planLimits = {};
        } else if (typeof body.planLimits !== 'object') {
            return { ok: false, error: 'planLimits nesne olmalı.' };
        } else {
            const pl = {};
            const fields = new Set(Object.values(PLAN_UNITS));
            for (const [k, v] of Object.entries(body.planLimits)) {
                if (!fields.has(k)) return { ok: false, error: `Bilinmeyen paket sınırı: ${k}` };
                if (v === null) {
                    pl[k] = null;
                    continue;
                }
                const n = boundedInt(v, PLAN_LIMIT_BOUNDS);
                if (n === undefined) return { ok: false, error: `${k} 0 ya da pozitif tam sayı (veya null) olmalı.` };
                pl[k] = n;
            }
            patch.planLimits = pl;
        }
    }
    if (Object.keys(patch).length === 0) return { ok: false, error: 'Değişiklik yok.' };
    return { ok: true, patch };
}
