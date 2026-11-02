// AI uçlarının kapısı — çağrının hangi şirketin bütçesinden düşeceğini çözer.
//
//   requireAiCaller()                       — yalnız şirket üyesi (requireTenant).
//   requireAiCaller({ allowAnonymous: true }) — aday tarafı da (anonim oturum).
//
// İÇ KULLANICI: requireTenant ile aynı; yetki üyelik belgesinden, bütçe
// `tenantId:uid` kovasından. AI çağrısı veri yazmaz → `write: false` (salt
// okunur banttaki şirket de mevcut verisini AI ile okuyabilir; destek üyesi de).
//
// ADAY (anonim oturum): yalnız amaca özel uçlar açar (STT, ön eleme puanı, CV
// ile form doldurma). Serbest istem (`/api/ai/generate`, `/api/ai/ask`) adaya
// KAPALI (plan §5.2). Şirket `X-Tenant-Id` başlığından ya da gövdedeki
// `tenantId`'den (PR 5'e kadar bağlantıdan gelir) ve ancak yazmaya açık bir
// şirketse kabul edilir: deneme süresi bitmiş, askıdaki ya da kapalı şirketin
// adına AI harcanmaz. Bütçe şirketin tek 'anon' kovasından (anonSharePct):
// bağlantıyı bilen biri şirketin iç kullanıcılarının kotasını tüketemez.
import { verifyFirebaseToken, requireTenant, loadPublicTenant, ALL_ROLES, TENANT_HEADER } from './auth.js';
import { buildAiContext, runWithAiContext } from '../services/aiContext.js';

/**
 * @param {{ allowAnonymous?: boolean, roles?: string[] }} [opts]
 */
export function requireAiCaller({ allowAnonymous = false, roles = ALL_ROLES } = {}) {
    const memberGate = requireTenant(roles, { write: false });
    return (req, res, next) =>
        verifyFirebaseToken(req, res, async () => {
            if (req.authUser.provider !== 'anonymous') return memberGate(req, res, next);
            if (!allowAnonymous) {
                return res.status(403).json({ error: 'Bu işlem için hesapla giriş yapılmalıdır.' });
            }
            try {
                const tenantId = String(req.headers[TENANT_HEADER] || req.body?.tenantId || '');
                const tenant = await loadPublicTenant(tenantId, { write: true });
                if (!tenant) return res.status(404).json({ error: 'Bağlantı geçersiz.', code: 'TENANT_REQUIRED' });
                req.publicTenant = tenant;
                req.aiContext = buildAiContext({ tenantId: tenant.id, tenant: tenant.data, anonymous: true });
                return runWithAiContext(req.aiContext, next);
            } catch {
                return res.status(500).json({ error: 'Yetki denetlenemedi.' });
            }
        });
}
