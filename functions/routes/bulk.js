// Bulk-import endpoints. Accept either multipart/form-data PDF/DOCX/ZIP
// uploads or a JSON body with a records[] array; both flows produce the
// same { jobId, totalCount } response and a Firestore doc that the bulk
// worker (services/bulkWorker.js) will pick up via polling.
//
//   POST /api/bulk-import         — enqueue a new job (recruiter+).
//   GET  /api/bulk-import/:jobId  — read job status (only the creator or
//                                    an admin role can fetch).
//
// Why uploadBaseDir is passed in: the bulk multer instance lives in this
// module but the on-disk uploads root is decided in server.js based on
// runtime mode (local vs serverless /tmp). createBulkRouter(uploadBaseDir)
// builds a router with the supplied base.
import { Router } from 'express';
import fs from 'fs';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';

import { requireAuth } from '../middleware/auth.js';
import { db, admin } from '../config/firebaseAdmin.js';
import {
    BULK_JOBS_COLL,
    extractCvText,
} from '../services/bulkWorker.js';

const require = createRequire(import.meta.url);
const multer = require('multer');
const AdmZip = require('adm-zip');

export function createBulkRouter(uploadBaseDir) {
    const router = Router();

    const bulkUpload = multer({
        storage: multer.diskStorage({
            destination: (req, file, cb) => {
                const dir = path.join(uploadBaseDir, 'uploads', 'bulk-tmp');
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                cb(null, dir);
            },
            filename: (req, file, cb) => {
                const ext = path.extname(file.originalname);
                cb(null, `bulk-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
            },
        }),
        limits: { fileSize: 50 * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            const name = file.originalname.toLowerCase();
            const mime = file.mimetype;
            const ok = mime === 'application/pdf' || name.endsWith('.pdf')
                || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx')
                || mime === 'application/zip' || mime === 'application/x-zip-compressed' || name.endsWith('.zip');
            ok ? cb(null, true) : cb(new Error('PDF, DOCX veya ZIP olmalı'));
        },
    });

    router.post('/api/bulk-import', requireAuth(), bulkUpload.array('cvs', 20), async (req, res) => {
        try {
            const positionId = req.body?.positionId || '';
            const positionTitle = req.body?.positionTitle || '';
            let items = [];
            if (req.files && req.files.length > 0) {
                const bulkDir = path.join(uploadBaseDir, 'uploads', 'bulk-tmp');
                for (const file of req.files) {
                    const name = file.originalname.toLowerCase();
                    if (name.endsWith('.zip')) {
                        try {
                            const zip = new AdmZip(file.path);
                            const entries = zip.getEntries().filter(e => {
                                const en = e.entryName.toLowerCase();
                                return !e.isDirectory && (en.endsWith('.pdf') || en.endsWith('.docx'));
                            });
                            for (const entry of entries) {
                                const entryExt = path.extname(entry.entryName);
                                const destName = `bulk-${Date.now()}-${Math.round(Math.random() * 1e6)}${entryExt}`;
                                const destPath = path.join(bulkDir, destName);
                                // Async write so a large ZIP with many entries doesn't
                                // park the event loop while extracting.
                                await writeFile(destPath, entry.getData());
                                items.push({ index: items.length, originalName: path.basename(entry.entryName), tempPath: destPath, status: 'pending' });
                            }
                            try { fs.unlinkSync(file.path); } catch {}
                        } catch (zipErr) {
                            console.error('[bulk-import] ZIP extraction error:', zipErr.message);
                            try { fs.unlinkSync(file.path); } catch {}
                        }
                    } else {
                        items.push({ index: items.length, originalName: file.originalname, tempPath: file.path, status: 'pending' });
                    }
                }
            } else if (req.body?.records || Array.isArray(req.body)) {
                // JSON records path — accepts both:
                //   { positionId, positionTitle, records: [...] }  (wrapper object)
                //   [{ name, email, cvText?, cvUrl?, positionId? }, ...]  (bare array)
                let rawRecords;
                if (Array.isArray(req.body)) {
                    rawRecords = req.body;
                } else {
                    rawRecords = typeof req.body.records === 'string' ? JSON.parse(req.body.records) : req.body.records;
                }
                if (!Array.isArray(rawRecords)) return res.status(400).json({ error: 'records bir dizi olmalıdır.' });
                items = rawRecords.map((r, i) => ({
                    index: i,
                    originalName: r.name || `aday-${i + 1}`,
                    name: r.name || '',
                    email: r.email || '',
                    cvText: r.cvText || '',
                    cvUrl: r.cvUrl || '',
                    positionId: r.positionId || positionId,
                    source: 'json_record',
                    status: 'pending',
                }));
            } else {
                return res.status(400).json({ error: 'cvs (multipart) veya records (JSON) gereklidir.' });
            }
            if (items.length === 0) return res.status(400).json({ error: 'İşlenecek dosya veya kayıt bulunamadı.' });
            // Pre-extract CV text from uploaded files so Firestore items are durable
            // (worker does not depend on temp files surviving a restart)
            for (const item of items) {
                if (item.tempPath && !item.cvText) {
                    try {
                        const ext = path.extname(item.tempPath).replace(/^\./, '').toLowerCase();
                        const buf = await readFile(item.tempPath);
                        item.cvText = (await extractCvText(buf, ext)).slice(0, 6000);
                    } catch (extractErr) {
                        console.warn(`[bulk-import] Pre-extract failed for ${item.originalName}:`, extractErr.message);
                    }
                    // Clean up temp file — text is now stored in Firestore
                    try { fs.unlinkSync(item.tempPath); } catch {}
                    delete item.tempPath;
                }
            }
            const jobRef = db.collection(BULK_JOBS_COLL).doc();
            await jobRef.set({ status: 'queued', totalCount: items.length, processedCount: 0, failedCount: 0, positionId, positionTitle, createdBy: req.user.uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            const batch = db.batch();
            for (const item of items) {
                batch.set(jobRef.collection('items').doc(String(item.index)), item);
            }
            await batch.commit();
            res.json({ jobId: jobRef.id, totalCount: items.length });
            // Worker loop will pick this job up automatically via polling
        } catch (err) {
            console.error('[bulk-import] Error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/api/bulk-import/:jobId', requireAuth(), async (req, res) => {
        try {
            const snap = await db.doc(`${BULK_JOBS_COLL}/${req.params.jobId}`).get();
            if (!snap.exists) return res.status(404).json({ error: 'Job bulunamadı.' });
            const data = snap.data();
            // Ownership check: only allow access by the job creator or admins
            if (data.createdBy && data.createdBy !== req.user.uid && req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Bu işe erişim izniniz yok.' });
            }
            res.json({ jobId: snap.id, ...data });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}
