// CV ingestion endpoints — three flows that share the same Gemini-backed
// parseProfile() helper to convert raw CV text into a structured candidate
// object.
//
//   POST /api/process-cv     — multipart upload of up to 20 PDF/DOCX files,
//                               saved to the uploads dir, parsed, returned
//                               with a public download URL per file.
//   POST /api/direct-add     — JSON { text, url } from the browser-extension
//                               quick-add helper. No file saved.
//   POST /api/check-duplicate — JSON { email, phone } — looks up the
//                               candidates collection to flag dupes before
//                               an apply form proceeds.
//
// All three are gated by aiLimiter where they hit Gemini.
import { Router } from 'express';
import fs from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

import { aiLimiter } from '../middleware/rateLimit.js';
import { pdf } from '../services/pdf.js';
import { parseProfile } from '../services/gemini.js';
import { db } from '../config/firebaseAdmin.js';

const require = createRequire(import.meta.url);
const mammoth = require('mammoth');
const multer = require('multer');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// On Cloud Functions / serverless we can only write to /tmp. Locally we use
// the functions/ directory so uploaded CVs persist across hot reloads.
const isServerless = !!process.env.K_SERVICE || !!process.env.FUNCTION_NAME || !!process.env.FUNCTIONS_EMULATOR;
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

router.post('/api/direct-add', aiLimiter, async (req, res) => {
    try {
        const { text, url } = req.body;
        console.log(`📥 Direct Add request for: ${url}`);

        const candidate = await parseProfile(text, 'gemini-2.5-flash');
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

router.post('/api/process-cv', aiLimiter, upload.array('cvs', 20), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Dosya seçilmedi' });

        console.log(`📂 Processing ${req.files.length} uploaded CVs...`);

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

                const candidate = await parseProfile(text, 'gemini-2.5-flash');
                if (!candidate) return { fileName: file.originalname, error: 'AI ayrıştırma hatası' };

                // Add the URL to the stored file
                const baseUrl = process.env.SERVER_URL || 'http://localhost:3001';
                candidate.cvUrl = `${baseUrl}/uploads/cvs/${file.filename}`;

                return { fileName: file.originalname, candidate, success: true };
            } catch (err) {
                console.error(`Error processing ${file.originalname}:`, err);
                return { fileName: file.originalname, error: err.message };
            }
        }));

        res.json({ results });
    } catch (err) {
        console.error('Bulk CV Processing Error:', err);
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
        console.error('Duplicate check error:', err.message);
        res.json({ isDuplicate: false });
    }
});

export default router;
