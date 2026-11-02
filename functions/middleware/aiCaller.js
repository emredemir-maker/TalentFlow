// AI uçlarının kapısı — çağrının hangi şirketin bütçesinden düşeceğini çözer.
//
//   requireAiCaller()                       — yalnız şirket üyesi (requireTenant).
//   requireAiCaller({ allowAnonymous: true, linkKinds }) — aday tarafı da (anonim oturum, bağlantıyla).
//
// İÇ KULLANICI: requireTenant ile aynı; yetki üyelik belgesinden, bütçe
// `tenantId:uid` kovasından. AI çağrısı veri yazmaz → `write: false` (salt
// okunur banttaki şirket de mevcut verisini AI ile okuyabilir; destek üyesi de).
//
// ADAY (anonim oturum): yalnız amaca özel uçlar açar (STT, ön eleme puanı, CV
// ile form doldurma). Serbest istem (`/api/ai/generate`, `/api/ai/ask`) adaya
// KAPALI (plan §5.2). Şirket ve hedef kayıt yalnız herkese açık bağlantıdan
// (`X-Public-Link` başlığı ya da gövdede `link`; publicLinks, §2.5) — istemcinin
// gönderdiği `X-Tenant-Id`/`tenantId` aday için YOK SAYILIR. Bağlantının türü
// uca uymalı (`linkKinds`) ve şirket yazmaya açık olmalı: deneme süresi bitmiş,
// askıdaki ya da kapalı şirketin adına AI harcanmaz. Bütçe şirketin tek 'anon' kovasından (anonSharePct):
// bağlantıyı bilen biri şirketin iç kullanıcılarının kotasını tüketemez.
import { verifyFirebaseToken, requireTenant, ALL_ROLES } from './auth.js';
import { buildAiContext, runWithAiContext } from '../services/aiContext.js';
import { resolvePublicLink } from '../services/publicLinks.js';

export const PUBLIC_LINK_HEADER = 'x-public-link';

/**
 * @param {{ allowAnonymous?: boolean, linkKinds?: string[], roles?: string[] }} [opts]
 *   linkKinds: anonim çağrıda kabul edilen bağlantı türleri (zorunlu).
 *   Başarılıysa (aday): req.publicLink = { tenantId, kind, targetId, … },
 *   req.publicTenant = { id, data, paths }.
 */
export function requireAiCaller({ allowAnonymous = false, linkKinds = [], roles = ALL_ROLES } = {}) {
    if (allowAnonymous && linkKinds.length === 0) throw new Error('allowAnonymous için linkKinds gerekli.');
    const memberGate = requireTenant(roles, { write: false });
    return (req, res, next) =>
        verifyFirebaseToken(req, res, async () => {
            if (req.authUser.provider !== 'anonymous') return memberGate(req, res, next);
            if (!allowAnonymous) {
                return res.status(403).json({ error: 'Bu işlem için hesapla giriş yapılmalıdır.' });
            }
            try {
                const linkId = String(req.headers[PUBLIC_LINK_HEADER] || req.body?.link || '');
                const link = await resolvePublicLink(linkId, { kinds: linkKinds, write: true });
                if (!link) return res.status(404).json({ error: 'Bağlantı geçersiz.', code: 'LINK_REQUIRED' });
                const tenant = link.tenant;
                req.publicLink = link;
                req.publicTenant = tenant;
                req.aiContext = buildAiContext({ tenantId: tenant.id, tenant: tenant.data, anonymous: true });
                return runWithAiContext(req.aiContext, next);
            } catch {
                return res.status(500).json({ error: 'Yetki denetlenemedi.' });
            }
        });
}
