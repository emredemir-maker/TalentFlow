// CV ingestion endpoints — three flows that share the same Gemini-backed
// parseProfile() helper to convert raw CV text into a structured candidate
// object.
//
//   POST /api/process-cv     — multipart upload of up to 20 PDF/DOCX files,
//                               parsed, persisted to Firebase Storage
//                               (tenants/{t}/cvs/), returned with the storage
//                               PATH (`cvPath`) — jetonlu kalıcı indirme adresi
//                               YOK (local /uploads fallback in dev).
//   GET  /api/candidates/:id/cv — adayın CV dosyası; yetki her istekte
//                               (üyelik + department_user görünürlüğü), dosya
//                               sunucudan akıtılır, önbelleğe alınmaz.
//   POST /api/direct-add     — JSON { text, url } from the browser-extension
//                               quick-add helper. No file saved.
//   POST /api/check-duplicate — JSON { email, phone } — looks up the
//                               candidates collection to flag dupes before
//                               an apply form proceeds.
//
// All three are gated by aiLimiter where they hit Gemini.
import { Router } from 'express';
import fs from 'fs';
import { readFile, unlink } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

import { aiLimiter } from '../middleware/rateLimit.js';
import { requireTenant, ALL_ROLES, WRITER_ROLES } from '../middleware/auth.js';
import { isValidDocId, storagePaths } from '../services/tenantPaths.js';
import { wrapMulter } from '../middleware/multipart.js';
import { pdf } from '../services/pdf.js';
import { parseProfile } from '../services/gemini.js';
import { db, getStorageBucket } from '../config/firebaseAdmin.js';
import { childLogger } from '../services/logger.js';
const log = childLogger('cv');

const require = createRequire(import.meta.url);
const mammoth = require('mammoth');
const multer = require('multer');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// On Cloud Functions / serverless we can only write to /tmp. Locally we use
// the functions/ directory so uploaded CVs persist across hot reloads.
const isServerlessRuntime = () => !!process.env.K_SERVICE || !!process.env.FUNCTION_NAME || !!process.env.FUNCTIONS_EMULATOR;
const isServerless = isServerlessRuntime();
// Three .. hops aren't needed here — we want functions/uploads, which is one
// level up from routes/.
const uploadBaseDir = isServerless ? '/tmp' : path.resolve(__dirname, '..');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(uploadBaseDir, 'uploads', 'cvs');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `cv-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Desteklenmeyen dosya formatı. Sadece PDF ve DOCX yükleyebilirsiniz.'));
        }
    }
});

const router = Router();

// Fallback: the express static /uploads mount (server.js). Only durable in
// local dev — on Cloud Functions the file lives in /tmp and dies with the
// instance, hence Storage is always tried first.
export function buildLocalCvUrl(filename) {
    const baseUrl = process.env.SERVER_URL || 'http://localhost:3001';
    return `${baseUrl}/uploads/cvs/${filename}`;
}

// Yüklenen CV'yi şirketin klasörüne (tenants/{t}/cvs/) yazar ve Storage YOLUNU
// döner. İndirme jetonu (firebaseStorageDownloadTokens) KONMAZ: jetonlu adres
// kuralları ve üyeliği atlar, kim eline geçirirse süresiz açar. Dosyayı
// GET /api/candidates/:id/cv her istekte yetkiyi denetleyerek verir.
// Exported for tests (see cv.test.js — Storage is mocked there).
// @returns {Promise<{ cvPath?: string, cvUrl?: string }>}
export async function storeCvFile(file, tenantId) {
    try {
        const bucket = getStorageBucket();
        const destination = storagePaths.cv(tenantId, file.filename);
        await bucket.upload(file.path, {
            destination,
            metadata: { contentType: file.mimetype },
        });
        // Storage is the source of truth now — drop the multer temp copy
        // so repeated requests don't fill the instance's /tmp.
        await unlink(file.path).catch(() => {});
        return { cvPath: destination };
    } catch (err) {
        if (isServerlessRuntime()) {
            // An instance-local URL would be dead on arrival: /uploads
            // serves /tmp (recycled with the instance) and hosting never
            // rewrites /uploads/** to the function. Better no file than a
            // broken link — the UI hides the CV button when there is none.
            log.error(`Storage upload failed for ${file.filename}: ${err.message}`);
            await unlink(file.path).catch(() => {});
            return {};
        }
        log.warn(`Storage upload failed for ${file.filename}, serving from local /uploads: ${err.message}`);
        return { cvUrl: buildLocalCvUrl(file.filename) };
    }
}

/**
 * department_user bir adayı görebilir mi — firestore.rules deptCanSee ile aynı:
 * adayın departmanı ya da açıldığı departmanlar üyenin departmanlarıyla kesişmeli.
 */
export function departmentCanSee(candidate, departments) {
    const mine = Array.isArray(departments) ? departments : [];
    if (mine.length === 0) return false;
    if (mine.includes(candidate?.department)) return true;
    const shared = Array.isArray(candidate?.visibleToDepartments) ? candidate.visibleToDepartments : [];
    return shared.some((d) => mine.includes(d));
}

const CV_CONTENT_TYPES = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

router.get('/api/candidates/:candidateId/cv', requireTenant(ALL_ROLES, { write: false }), async (req, res) => {
    const { candidateId } = req.params;
    try {
        if (!isValidDocId(candidateId)) return res.status(404).json({ error: 'CV bulunamadı.' });
        const snap = await db.doc(req.paths.candidate(candidateId)).get();
        if (!snap.exists) return res.status(404).json({ error: 'CV bulunamadı.' });
        const candidate = snap.data() || {};
        // department_user yalnız görebildiği adayın CV'sini açar (kuralların aynası).
        if (req.user.role === 'department_user' && !departmentCanSee(candidate, req.user.departments)) {
            return res.status(404).json({ error: 'CV bulunamadı.' });
        }
        const cvPath = typeof candidate.cvPath === 'string' ? candidate.cvPath : '';
        // YALNIZ BU ŞİRKETİN CV KLASÖRÜ: aday kaydını şirketin kendi kullanıcıları
        // yazabiliyor; başka şirketin dosyasını gösteren bir yol sunucuya o dosyayı
        // okutmamalı. '..' ile klasör dışına çıkış da reddedilir.
        const prefix = `${storagePaths.tenantPrefix(req.tenant.id)}cvs/`;
        if (!cvPath.startsWith(prefix) || cvPath.includes('..') || cvPath.includes('//')) {
            if (cvPath) log.warn({ candidateId }, 'şirket dışı CV yolu reddedildi');
            return res.status(404).json({ error: 'CV bulunamadı.' });
        }
        const file = getStorageBucket().file(cvPath);
        const [exists] = await file.exists();
        if (!exists) return res.status(404).json({ error: 'CV bulunamadı.' });
        const [buffer] = await file.download();

        const ext = (cvPath.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
        const type = CV_CONTENT_TYPES[ext] || 'application/octet-stream';
        res.set({
            'Content-Type': type,
            // PDF tarayıcıda gömülü açılır; diğer türler indirilir.
            'Content-Disposition': `${ext === 'pdf' ? 'inline' : 'attachment'}; filename="cv-${candidateId}.${ext || 'bin'}"`,
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
        });

        // Kişisel veriye erişim deftere (KVKK). Defter yazılamazsa dosya yine verilir.
        db.collection(req.paths.accessLogs())
            .add({
                action: 'cv-download',
                uid: req.user.uid,
                email: req.user.email || '',
                candidateId,
                at: new Date().toISOString(),
            })
            .catch((err) => log.warn({ err: err.message }, 'CV erişim kaydı yazılamadı'));

        res.send(buffer);
    } catch (err) {
        log.error({ err: err.message }, 'GET /api/candidates/:id/cv');
        res.status(500).json({ error: 'CV okunamadı.' });
    }
});

router.post('/api/direct-add', aiLimiter, requireTenant(WRITER_ROLES), async (req, res) => {
    try {
        const { text, url } = req.body;
        log.info(`📥 Direct Add request for: ${url}`);

        // Use parseProfile's default model — controlled via CV_PARSING_MODEL
        // env var (defaults to gemini-2.5-flash; can be flipped to gemma-3-27b-it
        // or any other Google AI Studio model id without code changes).
        const candidate = await parseProfile(text);
        if (candidate && candidate.name) {
            candidate.linkedinUrl = url;
            candidate.source = 'Browser Extension';
            candidate.status = 'new';
            candidate.matchScore = 0;
            candidate.appliedDate = new Date().toISOString();
            res.json({ success: true, candidate });
        } else {
            res.status(400).json({ error: 'Could not parse candidate data.' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/process-cv', aiLimiter, requireTenant(WRITER_ROLES), wrapMulter(upload.array('cvs', 20)), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Dosya seçilmedi' });

        log.info(`📂 Processing ${req.files.length} uploaded CVs...`);

        const results = await Promise.all(req.files.map(async (file) => {
            try {
                let text = '';
                // Async read — Promise.all() above already runs files in
                // parallel; using readFileSync here would block the event
                // loop and serialize them de facto.
                const fileBuffer = await readFile(file.path);

                if (file.mimetype === 'application/pdf') {
                    const data = await pdf(fileBuffer);
                    text = data.text;
                } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                    const result = await mammoth.extractRawText({ buffer: fileBuffer });
                    text = result.value;
                } else {
                    return { fileName: file.originalname, error: 'Desteklenmeyen format' };
                }

                if (!text || text.length < 50) {
                    return { fileName: file.originalname, error: 'İçerik okunamadı' };
                }

                // Same CV_PARSING_MODEL env var as /api/direct-add — see
                // services/gemini.js getDefaultCvParsingModel() for the
                // resolution order.
                const candidate = await parseProfile(text);
                if (!candidate) return { fileName: file.originalname, error: 'AI ayrıştırma hatası' };

                Object.assign(candidate, await storeCvFile(file, req.tenant.id));

                return { fileName: file.originalname, candidate, success: true };
            } catch (err) {
                log.error({ err: err }, `Error processing ${file.originalname}`);
                return { fileName: file.originalname, error: err.message };
            }
        }));

        res.json({ results });
    } catch (err) {
        log.error({ err: err }, 'Bulk CV Processing Error');
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/check-duplicate', requireTenant(WRITER_ROLES, { write: false }), async (req, res) => {
    try {
        const norm = (s) => (s || '').trim().toLowerCase().replace(/[\s\-().+]/g, '');
        // E-postada nokta anlamlı: telefon normalleştirmesi (noktayı da siler)
        // e-postaya uygulanınca hiçbir adres eşleşmiyordu.
        const email = String(req.body?.email || '').trim().toLowerCase();
        const phone = norm(req.body?.phone);

        if (!email && !phone) return res.json({ isDuplicate: false });

        // Yalnız bu şirketin havuzu: başka şirketin adayı "mükerrer" diye ifşa
        // edilmez (plan §1.1).
        const candidatesRef = db.collection(req.paths.candidates());
        let existing = null;
        let foundBy = null;

        if (email) {
            const snap = await candidatesRef.where('email', '==', email).limit(1).get();
            if (!snap.empty) {
                existing = { id: snap.docs[0].id, ...snap.docs[0].data() };
                foundBy = 'email';
            }
        }

        if (!existing && phone) {
            const snap = await candidatesRef.where('phone', '==', phone).limit(1).get();
            if (!snap.empty) {
                existing = { id: snap.docs[0].id, ...snap.docs[0].data() };
                foundBy = 'phone';
            }
        }

        res.json({
            isDuplicate: !!existing,
            foundBy,
            existingName: existing?.name || null,
        });
    } catch (err) {
        log.error({ err: err.message }, 'Duplicate check error');
        res.json({ isDuplicate: false });
    }
});

export default router;
