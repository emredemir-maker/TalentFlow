// Aday tarafının (anonim oturum) amaca özel AI uçları.
//
//   POST /api/public/apply/parse-cv  { positionId, cvText }  (+ X-Tenant-Id)
//     — başvuru formunda CV'den ad/e-posta/telefon doldurma ve kayda giden
//       yapılandırılmış özet.
//
// NEDEN AYRI UÇ: başvuru formu eskiden bu istemi tarayıcıda kurup serbest
// istemli /api/ai/generate'e gönderiyordu. O uç adaya kapandı (plan §5.2):
// istem burada, sunucuda kurulur; istemciden yalnız CV metni gelir ve
// sınırlandırılmış veri bloğuna konur (promptGuard). Açık bir ilan şart —
// bağlantıyı bilmeyen biri şirket adına AI harcatamaz. Bütçe şirketin 'anon'
// kovasından (kendi günlük payı ve dakikalık sınırıyla). Paket birimi
// (ön analiz) DÜŞÜLMEZ: anonim bir uçtan düşülseydi bağlantıyı bilen biri
// şirketin aylık hakkını tüketip işe alımcının CV yüklemesini durdurabilirdi.
import { Router } from 'express';

import { aiLimiter } from '../middleware/rateLimit.js';
import { requireAiCaller } from '../middleware/aiCaller.js';
import { generateText } from '../services/gemini.js';
import { buildStructuredPrompt, sanitizeForPrompt } from '../services/promptGuard.js';
import { extractPiiFromText, redactPiiFromText } from '../services/pii.js';
import { sendQuotaError } from '../services/aiQuota.js';
import { isValidDocId } from '../services/tenantPaths.js';
import { db } from '../config/firebaseAdmin.js';
import { childLogger } from '../services/logger.js';
const log = childLogger('publicAi');

const router = Router();

/** Aday CV'si için ayrıştırma istemi (istemcideki parseCandidateFromText ile aynı şema). */
export function buildApplicantCvPrompt(safeText) {
    const instruction = `Sen bir uzman İK Profil Ayrıştırıcısısın (CV Parser). PROFIL_METNI bloğundaki metinden aday bilgilerini çıkart.

ÇOK ÖNEMLİ KURALLAR (KVKK / GDPR UYGUNLUĞU İÇİN):
Metindeki [İSİM], [E-POSTA], [TELEFON], [LINKEDIN] gibi anonimleştirilmiş alanlar için ilgili JSON alanlarını null bırak; tahmin etme.
'cvData' alanında adayın profesyonel geçmişini (iş tecrübeleri, görevleri, başarıları, eğitimleri, sertifikaları, yetenekleri) isim ve iletişim bilgisinden arındırılmış şekilde yaz.

'experiences' KURALLARI:
- Yalnız gerçek iş deneyimleri; her girdide şirket adı ("company") ve tarih aralığı ("duration") olmalı, yoksa ekleme.
- "role" en çok 50 karakter, "desc" tek cümle en çok 120 karakter, "milestones" en çok 2 madde.

Yalnız şu JSON formatında dön:
{"name":null,"email":null,"phone":null,"linkedinUrl":null,"position":"","company":"","location":"","skills":[],"experience":0,"education":"","summary":"","cvData":"","experiences":[{"role":"","company":"","duration":"","desc":"","milestones":[]}]}`;
    return buildStructuredPrompt(instruction, { PROFIL_METNI: sanitizeForPrompt(safeText, 20000) });
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Model çıktısını yalnız beklenen alanlara indirger (fazlası kayda/forma gitmez). */
export function shapeApplicantProfile(parsed, contact) {
    const p = parsed && typeof parsed === 'object' ? parsed : {};
    const placeholder = (v) => typeof v === 'string' && /\[(İSİM|E-POSTA|TELEFON|LINKEDIN|GITHUB)\]/.test(v);
    const clean = (v, max) => (placeholder(v) ? '' : str(v, max));
    const exps = Array.isArray(p.experiences) ? p.experiences.slice(0, 15) : [];
    return {
        name: contact?.name || clean(p.name, 200) || null,
        email: contact?.email || null,
        phone: contact?.phone || null,
        linkedinUrl: contact?.linkedinUrl || null,
        position: clean(p.position, 200),
        company: clean(p.company, 200),
        location: clean(p.location, 200),
        skills: (Array.isArray(p.skills) ? p.skills : []).filter((s) => typeof s === 'string').slice(0, 50).map((s) => s.slice(0, 80)),
        experience: Number.isFinite(Number(p.experience)) ? Math.max(0, Math.min(60, Math.round(Number(p.experience)))) : 0,
        education: clean(p.education, 300),
        summary: clean(p.summary, 1000),
        cvData: clean(p.cvData, 12000),
        experiences: exps
            .filter((e) => e && typeof e === 'object')
            .map((e) => ({
                role: clean(e.role, 50),
                company: clean(e.company, 200),
                duration: clean(e.duration, 100),
                desc: clean(e.desc, 200),
                milestones: (Array.isArray(e.milestones) ? e.milestones : []).filter((m) => typeof m === 'string').slice(0, 2).map((m) => m.slice(0, 200)),
            })),
    };
}

router.post('/api/public/apply/parse-cv', requireAiCaller({ allowAnonymous: true }), aiLimiter, async (req, res) => {
    const { positionId, cvText } = req.body || {};
    if (typeof positionId !== 'string' || !isValidDocId(positionId)) {
        return res.status(400).json({ error: 'positionId gereklidir.' });
    }
    if (typeof cvText !== 'string' || cvText.trim().length < 40) {
        return res.status(400).json({ error: 'CV metni okunamadı.' });
    }
    if (cvText.length > 60000) return res.status(413).json({ error: 'CV metni çok uzun.' });

    const paths = req.publicTenant?.paths || req.paths;
    try {
        const snap = await db.doc(paths.position(positionId)).get();
        if (!snap.exists || snap.data()?.status !== 'open') {
            return res.status(404).json({ error: 'Pozisyon bulunamadı.' });
        }
    } catch (err) {
        log.error({ err: err.message }, '[parse-cv] ilan okunamadı');
        return res.status(500).json({ error: 'İlan okunamadı.' });
    }

    try {
        // Kimlik bilgisi modele gitmez: regex ile ayıklanır, metinde maskelenir,
        // sonuca geri eklenir (services/pii.js).
        const contact = extractPiiFromText(cvText);
        const safeText = redactPiiFromText(cvText, contact.name);
        const raw = await generateText(buildApplicantCvPrompt(safeText), {
            label: 'cv-parse',
            generationConfig: { temperature: 0, maxOutputTokens: 16384, responseMimeType: 'application/json' },
        });
        const m = String(raw || '').replace(/```json|```/gi, '').match(/\{[\s\S]*\}/);
        let parsed = null;
        try {
            parsed = m ? JSON.parse(m[0]) : null;
        } catch {
            parsed = null;
        }
        res.json({ candidate: shapeApplicantProfile(parsed, contact) });
    } catch (err) {
        if (sendQuotaError(res, err)) return;
        log.error({ err: err?.message }, '[parse-cv] başarısız');
        res.status(500).json({ error: 'CV ayrıştırılamadı.' });
    }
});

export default router;
