// Herkese açık bağlantı uçları (docs/coklu-sirket-plani.md §2.5).
//
//   POST /api/public-links             — şirketin admin/recruiter'ı bir ilan
//                                        ya da mülakat için aday bağlantısı
//                                        ister. Aynı kayıt için var olan
//                                        bağlantı döner. { kind, targetId,
//                                        candidateId? } → { linkId, path }
//   GET  /api/public/resolve/:linkId   — aday sayfası (kimliksiz) bağlantıyı
//                                        çözer → { kind, targetId, tenantId }.
//                                        Bilinmeyen/kapalı → 404.
//
// Bilgi talebi bağlantısını istemci istemez: /api/send-info-request talebi
// yazarken sunucuda üretir.
import { Router } from 'express';

import { db } from '../config/firebaseAdmin.js';
import { sessionLimiter } from '../middleware/rateLimit.js';
import { requireTenant, WRITER_ROLES } from '../middleware/auth.js';
import { isValidDocId } from '../services/tenantPaths.js';
import { ensurePublicLink, isValidSessionId, resolvePublicLink } from '../services/publicLinks.js';
import { childLogger } from '../services/logger.js';
const log = childLogger('public-links');

const router = Router();

router.post(
    '/api/public-links',
    requireTenant(WRITER_ROLES, { write: true }),
    async (req, res) => {
        const { kind, targetId, candidateId } = req.body || {};
        try {
            if (kind === 'position') {
                if (!isValidDocId(targetId)) return res.status(400).json({ error: 'Geçersiz ilan.' });
                // İlan bu şirkette olmalı (başka şirketin ilanına bağlantı açılamaz).
                const pos = await db.doc(req.paths.position(targetId)).get();
                if (!pos.exists) return res.status(404).json({ error: 'İlan bulunamadı.' });
            } else if (kind === 'interview') {
                if (!isValidSessionId(targetId)) return res.status(400).json({ error: 'Geçersiz oturum.' });
                if (!isValidDocId(candidateId)) return res.status(400).json({ error: 'Aday gereklidir.' });
                // Oturum belgesi bağlantıdan sonra açılabiliyor (davet önce
                // gider); aday ise bu şirkette olmalı.
                const cand = await db.doc(req.paths.candidate(candidateId)).get();
                if (!cand.exists) return res.status(404).json({ error: 'Aday bulunamadı.' });
                // Oturum zaten açılmışsa başka bir adaya bağlanamaz.
                const iv = await db.doc(req.paths.interview(targetId)).get();
                if (iv.exists && iv.data()?.candidateId && iv.data().candidateId !== candidateId) {
                    return res.status(409).json({ error: 'Oturum başka bir adaya ait.' });
                }
            } else {
                return res.status(400).json({ error: 'Geçersiz bağlantı türü.' });
            }
            const link = await ensurePublicLink({
                tenantId: req.tenant.id,
                kind,
                targetId,
                candidateId: kind === 'interview' ? candidateId : null,
                createdBy: req.user.uid,
            });
            res.json({ linkId: link.linkId, path: link.path });
        } catch (err) {
            log.error({ err: err.message }, 'POST /api/public-links');
            res.status(500).json({ error: 'Bağlantı oluşturulamadı.' });
        }
    }
);

router.get('/api/public/resolve/:linkId', sessionLimiter, async (req, res) => {
    try {
        const link = await resolvePublicLink(req.params.linkId);
        if (!link) return res.status(404).json({ error: 'Bağlantı geçersiz ya da süresi dolmuş.' });
        // Şirket kimliği aday sayfasının Firestore okuması (tekil get) için
        // gerekli; kurallar okumayı kayıt kimliği + şirket durumuyla sınırlıyor.
        res.json({ kind: link.kind, targetId: link.targetId, tenantId: link.tenantId });
    } catch (err) {
        log.error({ err: err.message }, 'GET /api/public/resolve');
        res.status(500).json({ error: 'Bağlantı çözülemedi.' });
    }
});

export default router;
