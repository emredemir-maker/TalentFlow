// CV ingestion endpoints — three flows that share the same Gemini-backed
// parseProfile() helper to convert raw CV text into a structured candidate
// object.
//
//   POST /api/process-cv     — multipart upload of up to 20 PDF/DOCX files,
//                               parsed, persisted to Firebase Storage (cvs/),
//                               returned with a permanent download URL per
//                               file (local /uploads fallback in dev).
//   POST /api/direct-add     — JSON { text, url } from the browser-extension
//                               quick-add helper. No file saved.
//   POST /api/check-duplicate — JSON { email, phone } — looks up the
//                               candidates collection to flag dupes before
//                               an apply form proceeds.
//
// All three are gated by aiLimiter where they hit Gemini.
import { Router } from 'express';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { readFile, unlink } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

import { aiLimiter } from '../middleware/rateLimit.js';
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

// Same token-style download URL the client SDK's getDownloadURL() returns.
// Built by hand because admin getSignedUrl() needs the signBlob IAM role,
// which the default Functions service account doesn't have.
export function buildCvDownloadUrl(bucketName, storagePath, token) {
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
}

// Fallback: the express static /uploads mount (server.js). Only durable in
// local dev — on Cloud Functions the file lives in /tmp and dies with the
// instance, hence Storage is always tried first.
export function buildLocalCvUrl(filename) {
    const baseUrl = process.env.SERVER_URL || 'http://localhost:3001';
    return `${baseUrl}/uploads/cvs/${filename}`;
}

// Persist an uploaded CV to Firebase Storage under cvs/ — the same prefix
// AddCandidateModal.jsx uses for client-side uploads, covered by the
// existing /cvs/{filename} block in storage.rules.
// Exported for tests (see cv.test.js — Storage is mocked there).
export async function storeCvFile(file) {
    try {
        const bucket = getStorageBucket();
        const destination = `cvs/${file.filename}`;
        const token = randomUUID();
        await bucket.upload(file.path, {
            destination,
            metadata: {
                contentType: file.mimetype,
                metadata: { firebaseStorageDownloadTokens: token },
            },
        });
        // Storage is the source of truth now — drop the multer temp copy
        // so repeated requests don't fill the instance's /tmp.
        await unlink(file.path).catch(() => {});
        return buildCvDownloadUrl(bucket.name, destination, token);
    } catch (err) {
        if (isServerlessRuntime()) {
            // An instance-local URL would be dead on arrival: /uploads
            // serves /tmp (recycled with the instance) and hosting never
            // rewrites /uploads/** to the function. Better no link than a
            // broken one — the UI hides the CV button when cvUrl is empty.
            log.error(`Storage upload failed for ${file.filename}: ${err.message}`);
            await unlink(file.path).catch(() => {});
            return '';
        }
        log.warn(`Storage upload failed for ${file.filename}, serving from local /uploads: ${err.message}`);
        return buildLocalCvUrl(file.filename);
    }
}

router.post('/api/direct-add', aiLimiter, async (req, res) => {
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

router.post('/api/process-cv', aiLimiter, wrapMulter(upload.array('cvs', 20)), async (req, res) => {
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

                candidate.cvUrl = await storeCvFile(file);

                return { fileName: file.originalname, candidate, success: true };
            } catch (err) {
                log.error(`Error processing ${file.originalname}:`, err);
                return { fileName: file.originalname, error: err.message };
            }
        }));

        res.json({ results });
    } catch (err) {
        log.error('Bulk CV Processing Error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/check-duplicate', async (req, res) => {
    try {
        const norm = (s) => (s || '').trim().toLowerCase().replace(/[\s\-().+]/g, '');
        const email = norm(req.body?.email);
        const phone = norm(req.body?.phone);

        if (!email && !phone) return res.json({ isDuplicate: false });

        const candidatesRef = db.collection('artifacts/talent-flow/public/data/candidates');
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
        log.error('Duplicate check error:', err.message);
        res.json({ isDuplicate: false });
    }
});

export default router;
