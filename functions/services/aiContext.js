// AI ÇAĞRISININ KİMİN ADINA YAPILDIĞI — istek boyunca taşınan bağlam.
//
// Gemini'ye giden her çağrı services/gemini.js'teki tek huniden geçiyor ama o
// huniyi çağıran yer onlarca: CV ayrıştırma, toplu içe aktarma işçisi,
// mülakat değerlendirme, ön eleme, şirket bilgisi… Şirket kimliğini her birine
// elle parametre olarak geçirmek, birini unutmak demekti — ve unutulan çağrı
// hiçbir şirketin bütçesinden düşmeyen, sınırsız bir çağrı olurdu.
//
// Bu yüzden bağlam AsyncLocalStorage ile taşınıyor: requireTenant (iç
// kullanıcı), aday uçlarının şirket çözücüsü ve toplu iş işçisi bağlamı kurar;
// gemini.js okur. Bağlam YOKSA çağrı REDDEDİLİR (gemini.js → AI_TENANT_REQUIRED):
// sayılmayan bir AI çağrısı olmamalı.
import { AsyncLocalStorage } from 'node:async_hooks';
import { resolveAiLimits, resolvePlanLimits } from './plans.js';

const als = new AsyncLocalStorage();

/**
 * @typedef {object} AiContext
 * @property {string} tenantId
 * @property {string} userKey   — uid ya da aday tarafı için 'anon'
 * @property {boolean} anonymous
 * @property {object} limits    — plans.resolveAiLimits çıktısı
 * @property {object} planLimits — plans.resolvePlanLimits çıktısı
 */

/** `fn`'i bağlamla çalıştırır; fn içindeki tüm await zinciri bağlamı görür. */
export function runWithAiContext(ctx, fn) {
    return als.run(Object.freeze({ ...ctx }), fn);
}

/** @returns {AiContext|null} */
export function currentAiContext() {
    return als.getStore() || null;
}

/**
 * Şirket belgesinden bağlam kurar.
 * @param {{ tenantId: string, tenant: object, uid?: string, anonymous?: boolean }} p
 * @returns {AiContext}
 */
export function buildAiContext({ tenantId, tenant, uid, anonymous = false }) {
    return {
        tenantId,
        userKey: anonymous ? 'anon' : String(uid || ''),
        anonymous: !!anonymous,
        limits: resolveAiLimits(tenant),
        planLimits: resolvePlanLimits(tenant),
    };
}
