// Herkese açık bağlantılar — aday sayfalarının (başvuru, mülakata katılım,
// bilgi talebine yanıt) tek giriş kapısı (docs/coklu-sirket-plani.md §2.5).
//
// Bağlantı adresinde YALNIZ rastgele bir kimlik taşınır (`/apply/{linkId}`).
// Kimlik 128 bit; `publicLinks/{linkId}` belgesi hangi şirkete ve hangi kayda
// gittiğini söyler: { tenantId, kind, targetId, candidateId?, createdBy,
// createdAt }. Belgeyi YALNIZ sunucu yazar ve okur (firestore.rules:
// publicLinks → read, write: false).
//
// Neden: aday tarafındaki uçlar eskiden şirket kimliğini sorgu/gövdeden
// alıyordu. Şirket kimliği tahmin edilebilir değil ama gizli de değil; kayıt
// kimliğiyle birleşince bir kişinin başka şirketin kaydına istek atmasını
// yalnız iki kimliği bilip bilmemesi ayırıyordu. Artık sunucu şirketi ve
// hedefi bağlantıdan çözer; istemci şirket ya da hedef SEÇEMEZ.
//
// Türler:
//   position     → tenants/{t}/positions/{targetId}      (başvuru formu)
//   interview    → tenants/{t}/interviews/{targetId}     (mülakata katılım,
//                  davet onayı; candidateId bağlantıda — /api/session tarama yapmaz)
//   infoRequest  → tenants/{t}/infoRequests/{targetId}   (bilgi talebi yanıtı)
import { randomBytes } from 'node:crypto';

import { db, admin } from '../config/firebaseAdmin.js';
import { loadPublicTenant } from '../middleware/auth.js';
import { PLATFORM_PATHS, isValidDocId, isValidTenantId } from './tenantPaths.js';

export const LINK_KINDS = ['position', 'interview', 'infoRequest'];

/** 16 bayt → 22 karakter base64url. */
const LINK_ID_RE = /^[A-Za-z0-9_-]{22}$/;

/** Mülakat oturum kimliği biçimi (istemci `iv-` + UUID üretir). */
const SESSION_ID_RE = /^iv-[A-Za-z0-9-]{8,80}$/;

export function isValidLinkId(id) {
    return typeof id === 'string' && LINK_ID_RE.test(id);
}

export function isValidSessionId(id) {
    return typeof id === 'string' && SESSION_ID_RE.test(id) && isValidDocId(id);
}

export function newLinkId() {
    return randomBytes(16).toString('base64url');
}

/** Bağlantının aday sayfasındaki yolu (köken istemcide eklenir). */
export function linkPathFor(kind, linkId) {
    if (kind === 'position') return `/apply/${linkId}`;
    if (kind === 'interview') return `/join/${linkId}`;
    if (kind === 'infoRequest') return `/respond/${linkId}`;
    throw new Error(`Bilinmeyen bağlantı türü: ${kind}`);
}

/**
 * Şirketin bir kaydı için bağlantı oluşturur; aynı (şirket, tür, hedef) için
 * zaten varsa onu döner (paylaşılan ilan bağlantısı her açılışta değişmesin).
 * Hedefin şirkette var olduğunu ÇAĞIRAN doğrular.
 *
 * @returns {Promise<{ linkId: string, path: string, created: boolean }>}
 */
export async function ensurePublicLink({ tenantId, kind, targetId, candidateId = null, createdBy = null }) {
    if (!isValidTenantId(tenantId)) throw new Error('Geçersiz şirket kimliği.');
    if (!LINK_KINDS.includes(kind)) throw new Error('Geçersiz bağlantı türü.');
    if (!isValidDocId(targetId)) throw new Error('Geçersiz hedef kimliği.');

    // Yalnız eşitlik filtreleri: tek alan indeksleriyle çalışır, bileşik
    // indeks gerekmez.
    const existing = await db
        .collection(PLATFORM_PATHS.publicLinks)
        .where('tenantId', '==', tenantId)
        .where('kind', '==', kind)
        .where('targetId', '==', targetId)
        .limit(1)
        .get();
    if (!existing.empty) {
        const d = existing.docs[0];
        return { linkId: d.id, path: linkPathFor(kind, d.id), created: false };
    }

    const linkId = newLinkId();
    const doc = {
        tenantId,
        kind,
        targetId,
        createdBy: createdBy || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (kind === 'interview' && candidateId) doc.candidateId = candidateId;
    // create(): aynı kimlik (2^-128 olasılıkla) varsa ezmek yerine hata.
    await db.doc(PLATFORM_PATHS.publicLink(linkId)).create(doc);
    return { linkId, path: linkPathFor(kind, linkId), created: true };
}

/**
 * Bağlantıyı çözer. Bilinmeyen/yanlış biçimli kimlik, beklenmeyen tür,
 * iptal edilmiş bağlantı ya da kapanmış/askıdaki şirket → null (çağıran 404
 * döner; hangisi olduğu sızdırılmaz).
 *
 * @param {string} linkId
 * @param {{ kinds?: string[], write?: boolean }} opts
 *   kinds: kabul edilen türler; write: şirket yazmaya açık olmalı (K5).
 * @returns {Promise<null | { linkId, tenantId, kind, targetId, candidateId, tenant }>}
 */
export async function resolvePublicLink(linkId, { kinds = LINK_KINDS, write = false } = {}) {
    if (!isValidLinkId(linkId)) return null;
    const snap = await db.doc(PLATFORM_PATHS.publicLink(linkId)).get();
    if (!snap.exists) return null;
    const link = snap.data() || {};
    if (link.revokedAt) return null;
    if (!kinds.includes(link.kind)) return null;
    if (!isValidTenantId(link.tenantId) || !isValidDocId(link.targetId)) return null;
    const tenant = await loadPublicTenant(link.tenantId, { write });
    if (!tenant) return null;
    return {
        linkId,
        tenantId: link.tenantId,
        kind: link.kind,
        targetId: link.targetId,
        candidateId: isValidDocId(link.candidateId) ? link.candidateId : null,
        tenant,
    };
}
