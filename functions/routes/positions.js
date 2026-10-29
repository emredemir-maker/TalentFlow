// Herkese açık ilan uçları — /apply/:positionId sayfasındaki aday (kimliksiz)
// çağırır.
//
//   GET  /api/positions/:positionId?tenantId=…  — açık ilanı okur. Yoksa, kapalıysa
//                                       ya da şirket kapalıysa 404/403.
//   POST /api/applications           — başvuru formunu kaydeder.
//
// ŞİRKET: bağlantıdaki `tenantId` (geçici — PR 5'te publicLinks çözücüsü gelir
// ve bağlantı yalnız rastgele bir kimlik taşır). İlan kimliği hâlâ arama
// anahtarı; şirket kimliği aramayı yalnız o şirketin ağacına daraltır, başka
// şirketin ilanına ya da başvuru koleksiyonuna ulaştırmaz.
//
// Başvuru oluşturma istemciye kurallarda KAPALI (firestore.rules applications
// `create: false`): hedef şirketi ve ilanı istemci değil sunucu doğrular. Bu
// yüzden eskiden kullanılan Firestore REST + web anahtarı yolu yerine Admin SDK.
import { Router } from 'express';

import { db, admin } from '../config/firebaseAdmin.js';
import { loadPublicTenant } from '../middleware/auth.js';
import { isValidDocId } from '../services/tenantPaths.js';
import { childLogger } from '../services/logger.js';
const log = childLogger('positions');

const router = Router();

/** Açık ilanı şirketin ağacından okur; yoksa/kapalıysa null ya da 'closed'. */
async function readOpenPosition(tenant, positionId) {
    if (!isValidDocId(positionId)) return null;
    const snap = await db.doc(tenant.paths.position(positionId)).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    if (data.status !== 'open') return 'closed';
    return data;
}

router.get('/api/positions/:positionId', async (req, res) => {
    try {
        const tenant = await loadPublicTenant(String(req.query.tenantId || ''));
        if (!tenant) return res.status(404).json({ error: 'Pozisyon bulunamadı.' });
        const data = await readOpenPosition(tenant, req.params.positionId);
        if (!data) return res.status(404).json({ error: 'Pozisyon bulunamadı.' });
        if (data === 'closed') return res.status(403).json({ error: 'Bu pozisyon şu an başvuruya kapalı.' });
        // Açık ilanın tamamı — kurallar da anonim adaya aynı belgeyi açıyor.
        res.json({ id: req.params.positionId, ...data });
    } catch (err) {
        log.error({ err: err.message }, 'GET /api/positions/:id error');
        res.status(500).json({ error: 'Pozisyon yüklenirken hata oluştu.' });
    }
});

const str = (v, max) => String(v ?? '').trim().slice(0, max);

router.post('/api/applications', async (req, res) => {
    try {
        const {
            tenantId,
            positionId,
            name, email, phone, linkedin,
            cvText, cvFileName,
            source,
            parsedCandidate, aiScore, aiScoreBreakdown, aiSummary,
        } = req.body || {};
        if (!positionId || !name || !email || !phone) {
            return res.status(400).json({ error: 'Zorunlu alanlar eksik.' });
        }
        // Yazma: şirket deneme/aktif ve yazma süresi içinde olmalı (K5).
        const tenant = await loadPublicTenant(String(tenantId || ''), { write: true });
        if (!tenant) return res.status(404).json({ error: 'Pozisyon bulunamadı.' });
        const position = await readOpenPosition(tenant, positionId);
        if (!position) return res.status(404).json({ error: 'Pozisyon bulunamadı.' });
        if (position === 'closed') return res.status(403).json({ error: 'Bu pozisyon şu an başvuruya kapalı.' });

        const doc = {
            positionId,
            // Başlık istemciden değil ilandan: başka bir ilanın adıyla başvuru açılamaz.
            positionTitle: str(position.title, 300),
            name: str(name, 200),
            email: str(email, 320).toLowerCase(),
            phone: str(phone, 50),
            linkedin: str(linkedin, 500),
            cvFileName: str(cvFileName, 300),
            cvText: str(cvText, 6000),
            source: str(source || 'Direkt', 100),
            aiScore: Number.isFinite(Number(aiScore)) ? Math.round(Number(aiScore)) : 0,
            aiSummary: str(aiSummary, 4000),
            status: 'new',
            kvkkConsent: true,
            // Timestamp (istemci createdAt.seconds / toDate() bekliyor).
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (parsedCandidate && typeof parsedCandidate === 'object') doc.parsedCandidate = parsedCandidate;
        if (aiScoreBreakdown && typeof aiScoreBreakdown === 'object') doc.aiScoreBreakdown = aiScoreBreakdown;
        const { sourceCategory, screeningAnswers, screeningResult, screeningScore, screeningLevel } = req.body || {};
        if (sourceCategory) doc.sourceCategory = str(sourceCategory, 100);
        if (Array.isArray(screeningAnswers)) doc.screeningAnswers = screeningAnswers.slice(0, 50);
        if (screeningResult && typeof screeningResult === 'object') doc.screeningResult = screeningResult;
        if (Number.isFinite(Number(screeningScore))) doc.screeningScore = Math.round(Number(screeningScore));
        if (screeningLevel) doc.screeningLevel = str(screeningLevel, 50);

        // Mükerrer başvuru (aynı ilan + aynı e-posta) — istemci başvuruları
        // okuyamadığı için denetim burada.
        const dup = await db
            .collection(tenant.paths.applications())
            .where('positionId', '==', positionId)
            .where('email', '==', doc.email)
            .limit(1)
            .get();
        if (!dup.empty) return res.status(409).json({ error: 'Bu ilana zaten başvurdunuz.', duplicate: true });

        const ref = await db.collection(tenant.paths.applications()).add(doc);
        res.json({ id: ref.id });
    } catch (err) {
        log.error({ err: err.message }, 'POST /api/applications error');
        res.status(500).json({ error: 'Başvuru kaydedilemedi.' });
    }
});

export default router;
