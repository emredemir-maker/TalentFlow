// server.js - Backend API for Web Scraper (ESM Version)
import express from 'express';
import puppeteer from 'puppeteer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import nodemailer from 'nodemailer';
import Imap from 'imap';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createRequire } from 'module';

// Load .env if present (dev). In production (Cloud Functions runtime) secrets
// are injected from functions/.env.production at deploy time — no file needed.
dotenv.config({ quiet: true });

// Firebase Admin SDK + Firestore handle live in config/firebaseAdmin.js so
// all modules share the same initialized instance. `admin` is also re-exported
// from there for callers that need admin.auth(), admin.firestore.FieldValue, etc.
import { db, admin } from './config/firebaseAdmin.js';

// Loads OAuth client configs (Google, Microsoft 365) from Firestore at startup
// and exposes them as a live, mutable object. Importing the module also kicks
// off the deferred initial fetch.
import { integrationConfigs } from './config/integrations.js';

// Middleware modules — moved out of this file for separation of concerns.
import { generalLimiter, aiLimiter, sessionLimiter } from './middleware/rateLimit.js';
import { corsMiddleware } from './middleware/cors.js';
import { helmetMiddleware, hppMiddleware } from './middleware/security.js';
import { verifyFirebaseToken, requireAuth } from './middleware/auth.js';

// Service modules — pure-logic helpers used across multiple route handlers.
import { pdf } from './services/pdf.js';
import { toFsValue, fsGet, fsPatch, fsSet } from './services/firestoreRest.js';
import { getApiKey, getApiKeyDetailed, parseProfile } from './services/gemini.js';
import { isSafeLinkedInUrl } from './services/scrape.js';

// Route modules — one Express Router per functional area. Each router
// declares its own absolute /api/... paths and is mounted with `app.use(router)`
// so no path prefix is added.
import healthRoutes from './routes/health.js';
import aiRoutes from './routes/ai.js';
import screeningRoutes from './routes/screening.js';
import scrapeRoutes from './routes/scrape.js';
import cvRoutes from './routes/cv.js';
import interviewRoutes from './routes/interview.js';
import authRoutes from './routes/auth.js';
import googleRoutes from './routes/google.js';
import adminRoutes from './routes/admin.js';
import emailRoutes, { cleanupOldFiles } from './routes/email.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// `createRequire` lets us pull in pdf-parse, mammoth, multer, adm-zip etc.
// without forcing them through ESM transforms — these CJS-only libs are still
// used elsewhere in this file (notably the bulk-import worker for adm-zip).
const require = createRequire(import.meta.url);
const mammoth = require('mammoth');
const multer = require('multer');

// Upload base dir for static /uploads serving and the bulk-import worker.
// Cloud Functions / serverless can only write to /tmp; locally we use the
// functions/ dir so files survive hot reloads.
const isServerless = !!process.env.K_SERVICE || !!process.env.FUNCTION_NAME || !!process.env.FUNCTIONS_EMULATOR;
const uploadBaseDir = isServerless ? '/tmp' : __dirname;

const app = express();

// --- Security & infra middleware chain ---
// (helmet+CSP, hpp, trust-proxy, cors, json body parser, global rate limit)
// All concrete configuration lives in middleware/{security,cors,rateLimit}.js.
app.use(helmetMiddleware);
app.use(hppMiddleware);

// Trust the first reverse-proxy hop (Cloud Functions / Replit ingress sets
// X-Forwarded-For). Without this, express-rate-limit keys on the proxy IP
// instead of the real client IP, which both breaks throttling and blocks
// legitimate users en masse during an attack.
app.set('trust proxy', 1);

app.use(corsMiddleware);
app.use(express.json({ limit: '5mb' }));
app.use(generalLimiter);

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(uploadBaseDir, 'uploads')));

// Mount the routers we've extracted so far. The rest of the routes still
// live in this file and are appended via `app.get/post/...` below; they'll
// migrate into route modules in subsequent commits.
app.use(healthRoutes);
app.use(aiRoutes);
app.use(screeningRoutes);
app.use(scrapeRoutes);
app.use(cvRoutes);
app.use(interviewRoutes);
app.use(authRoutes);
app.use(googleRoutes);
app.use(adminRoutes);
app.use(emailRoutes);


// /api/gemini-stt moved to routes/ai.js

// ─────────────────────────────────────────────────────────────
// PUBLIC JOB APPLICATION SYSTEM
// Uses Firestore REST API so no Admin SDK credentials needed
// ─────────────────────────────────────────────────────────────
const FS_PROJECT = process.env.VITE_FIREBASE_PROJECT_ID;
const FS_API_KEY = process.env.VITE_FIREBASE_API_KEY;

function fsVal(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return { integerValue: String(Math.round(v)) };
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(fsVal) } };
    if (typeof v === 'object') {
        const fields = {};
        for (const [k, val] of Object.entries(v)) fields[k] = fsVal(val);
        return { mapValue: { fields } };
    }
    return { stringValue: String(v) };
}

function fsToJs(fields) {
    if (!fields) return {};
    const out = {};
    for (const [k, v] of Object.entries(fields)) {
        if ('stringValue' in v) out[k] = v.stringValue;
        else if ('integerValue' in v) out[k] = Number(v.integerValue);
        else if ('doubleValue' in v) out[k] = v.doubleValue;
        else if ('booleanValue' in v) out[k] = v.booleanValue;
        else if ('nullValue' in v) out[k] = null;
        else if ('arrayValue' in v) out[k] = (v.arrayValue.values || []).map(i => fsToJs(i.mapValue?.fields || { _: i }));
        else if ('mapValue' in v) out[k] = fsToJs(v.mapValue.fields);
        else out[k] = null;
    }
    return out;
}

app.get('/api/positions/:positionId', async (req, res) => {
    try {
        const url = `${FS_BASE()}/artifacts%2Ftalent-flow%2Fpublic%2Fdata%2Fpositions/${req.params.positionId}?key=${FS_API_KEY}`;
        const r = await fetch(url);
        if (r.status === 404) return res.status(404).json({ error: 'Pozisyon bulunamadı.' });
        if (!r.ok) {
            const errBody = await r.text();
            console.error('Firestore GET position error:', r.status, errBody);
            return res.status(500).json({ error: 'Pozisyon yüklenirken hata oluştu.' });
        }
        const docSnap = await r.json();
        const data = fsToJs(docSnap.fields || {});
        if (data.status !== 'open') return res.status(403).json({ error: 'Bu pozisyon şu an başvuruya kapalı.' });
        res.json({ id: req.params.positionId, ...data });
    } catch (err) {
        console.error('GET /api/positions/:id error:', err);
        res.status(500).json({ error: 'Pozisyon yüklenirken hata oluştu.' });
    }
});

app.post('/api/applications', async (req, res) => {
    try {
        const {
            positionId, positionTitle,
            name, email, phone, linkedin,
            cvText, cvFileName,
            source,
            parsedCandidate, aiScore, aiScoreBreakdown, aiSummary,
        } = req.body;
        if (!positionId || !name || !email || !phone) {
            return res.status(400).json({ error: 'Zorunlu alanlar eksik.' });
        }
        const fields = {
            positionId: fsVal(positionId),
            positionTitle: fsVal(positionTitle || ''),
            name: fsVal(String(name).trim()),
            email: fsVal(String(email).trim().toLowerCase()),
            phone: fsVal(String(phone).trim()),
            linkedin: fsVal(String(linkedin || '').trim()),
            cvFileName: fsVal(cvFileName || ''),
            cvText: fsVal(cvText ? String(cvText).slice(0, 6000) : ''),
            source: fsVal(source || 'Direkt'),
            aiScore: fsVal(aiScore || 0),
            aiSummary: fsVal(aiSummary || ''),
            status: fsVal('new'),
            kvkkConsent: fsVal(true),
        };
        if (parsedCandidate) fields.parsedCandidate = fsVal(parsedCandidate);
        if (aiScoreBreakdown) fields.aiScoreBreakdown = fsVal(aiScoreBreakdown);

        const url = `${FS_BASE()}/artifacts%2Ftalent-flow%2Fpublic%2Fdata%2Fapplications?key=${FS_API_KEY}`;
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields }),
        });
        if (!r.ok) {
            const errBody = await r.text();
            console.error('Firestore POST application error:', r.status, errBody);
            return res.status(500).json({ error: 'Başvuru kaydedilemedi.' });
        }
        const docData = await r.json();
        const id = docData.name?.split('/').pop();
        res.json({ id });
    } catch (err) {
        console.error('POST /api/applications error:', err);
        res.status(500).json({ error: 'Başvuru kaydedilemedi.' });
    }
});

// GET /api/users — List participant-eligible users for interview wizard
// Only recruiter / department_user / super_admin accounts are returned.
// Minimal fields to reduce unnecessary data exposure.
const PARTICIPANT_ROLES = ['super_admin', 'recruiter', 'department_user'];
app.get('/api/users', requireAuth(), async (req, res) => {
    try {
        const snap = await db.collection('artifacts/talent-flow/public/data/users').get();
        const users = [];
        snap.forEach(d => {
            const data = d.data();
            const role = data.role || '';
            if (!PARTICIPANT_ROLES.includes(role)) return; // skip candidates and unknown roles
            users.push({
                id: d.id,
                name: data.name || data.displayName || data.email || 'Kullanıcı',
                email: data.email || null,
                role,
                googleConnected: Boolean(data.integrations?.google?.connected),
            });
        });
        res.json({ users });
    } catch (err) {
        console.error('[API /api/users] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Helper: convert a local date+time string to a UTC Date using the client's IANA timezone.
const localToUTC = (dateStr, timeStr, timezone) => {
    const naiveUTC = new Date(`${dateStr}T${timeStr}:00Z`);
    if (!timezone) return naiveUTC;
    try {
        const fmt = new Intl.DateTimeFormat('sv', {
            timeZone: timezone,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        const localStr = fmt.format(naiveUTC).replace(' ', 'T');
        const localAsUTC = new Date(localStr + 'Z');
        const offsetMs = localAsUTC.getTime() - naiveUTC.getTime();
        return new Date(naiveUTC.getTime() - offsetMs);
    } catch (e) {
        return naiveUTC;
    }
};

// POST /api/users/availability — Check Google Calendar free/busy for multiple platform users
app.post('/api/users/availability', requireAuth(), async (req, res) => {
    const { userIds, date, time, timezone } = req.body;
    if (!Array.isArray(userIds) || !date || !time) {
        return res.status(400).json({ error: 'userIds[], date, and time are required.' });
    }
    const slotStartDate = localToUTC(date, time, timezone);
    if (isNaN(slotStartDate.getTime())) return res.status(400).json({ error: 'Invalid date/time format.' });
    const slotStart = slotStartDate.toISOString();
    const slotEnd = new Date(slotStartDate.getTime() + 60 * 60 * 1000).toISOString();

    const results = {};
    await Promise.all(userIds.map(async (uid) => {
        try {
            const userDoc = await db.doc(`artifacts/talent-flow/public/data/users/${uid}`).get();
            if (!userDoc.exists) { results[uid] = 'unknown'; return; }
            const googleIntegration = userDoc.data()?.integrations?.google;
            if (!googleIntegration?.connected || !googleIntegration?.accessToken) { results[uid] = 'unknown'; return; }
            const resp = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${googleIntegration.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ timeMin: slotStart, timeMax: slotEnd, items: [{ id: 'primary' }] })
            });
            if (!resp.ok) { results[uid] = 'unknown'; return; }
            const fbData = await resp.json();
            const busy = fbData.calendars?.primary?.busy || [];
            results[uid] = busy.length > 0 ? 'busy' : 'available';
        } catch (err) {
            console.warn(`[Availability] uid=${uid}:`, err.message);
            results[uid] = 'unknown';
        }
    }));
    res.json({ availability: results });
});


// ─── AI Generate Proxy ──────────────────────────────────────────────────────
// /api/ai/generate and /api/ai/stt moved to routes/ai.js

// ─── Bulk Import Background Processor ────────────────────────────────────────
// Accepts: PDF, DOCX files directly OR a ZIP containing PDF/DOCX files
// OR a JSON body with records [{name, email, cvText, positionId}]
// Processing: sequential, exponential backoff on Gemini quota errors
const BULK_JOBS_COLL = 'artifacts/talent-flow/public/data/bulkImportJobs';
const CANDIDATES_COLL = 'artifacts/talent-flow/public/data/candidates';
const AdmZip = require('adm-zip');

// ── Global single-worker flag: only one job runs at a time across all requests
let bulkWorkerActive = false;

async function parseTextWithGemini(text, positionTitle) {
    const apiKey = await getApiKey();
    if (!apiKey) return null;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `Sen bir uzman CV ayrıştırıcısısın. Aşağıdaki CV metninden aday bilgilerini JSON olarak çıkart.
Sadece şu JSON formatında yanıt ver (başka hiçbir şey yazma):
{
  "name": "Ad Soyad",
  "email": null,
  "phone": null,
  "position": "Mevcut veya hedeflenen pozisyon",
  "company": "Mevcut şirket",
  "location": "Şehir, Ülke",
  "skills": ["yetenek1", "yetenek2"],
  "experience": 5,
  "education": "Son okul / Bölüm",
  "summary": "Kısa özet (Türkçe, max 300 karakter)"
}

CV:
${text.substring(0, 8000)}`;
    // Do NOT swallow quota errors — let callers handle retry/backoff
    const result = await model.generateContent(prompt);
    const raw = result.response.text().replace(/```json|```/gi, '').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
}

function calculateSimpleMatchScore(candidate, positionTitle) {
    if (!positionTitle || !candidate) return 0;
    const pLower = positionTitle.toLowerCase();
    const cPos = (candidate.position || '').toLowerCase();
    const skills = (candidate.skills || []).map(s => s.toLowerCase()).join(' ');
    const combined = `${cPos} ${skills}`;
    const pWords = pLower.split(/\s+/).filter(w => w.length > 2);
    const hits = pWords.filter(w => combined.includes(w)).length;
    return Math.min(100, Math.round((hits / Math.max(pWords.length, 1)) * 100));
}

async function extractCvText(buffer, ext) {
    if (ext === 'pdf') {
        const data = await pdf(buffer);
        return (data.text || '').trim();
    } else if (ext === 'docx') {
        const result = await mammoth.extractRawText({ buffer });
        return (result.value || '').trim();
    }
    throw new Error('Desteklenmeyen format: ' + ext);
}

// SSRF validation: only allow public HTTPS URLs
function assertSafeCvUrl(cvUrl) {
    let parsed;
    try { parsed = new URL(cvUrl); } catch { throw new Error('cvUrl geçersiz URL formatı'); }
    if (parsed.protocol !== 'https:') throw new Error('cvUrl yalnızca HTTPS desteklenir');
    const hostname = parsed.hostname.toLowerCase();
    const privatePatterns = [/^localhost$/, /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^::1$/, /^0\.0\.0\.0$/, /\.local$/];
    if (privatePatterns.some(p => p.test(hostname))) throw new Error('cvUrl özel/dahili IP adresine işaret ediyor');
}

async function extractCvTextFromUrl(cvUrl) {
    assertSafeCvUrl(cvUrl);
    const res = await fetch(cvUrl, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`cvUrl GET failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    let ext = '';
    if (ct.includes('pdf') || cvUrl.toLowerCase().endsWith('.pdf')) ext = 'pdf';
    else if (ct.includes('docx') || ct.includes('officedocument') || cvUrl.toLowerCase().endsWith('.docx')) ext = 'docx';
    else throw new Error('cvUrl yanıtı PDF veya DOCX değil: ' + ct);
    return extractCvText(buf, ext);
}

// ── Claim a single queued job atomically via Firestore transaction.
async function claimNextQueuedJob() {
    // Simple single-field query to avoid needing composite index
    const snap = await db.collection(BULK_JOBS_COLL)
        .where('status', '==', 'queued')
        .limit(5)
        .get();
    if (snap.empty) return null;
    // Pick earliest by createdAt if available, else first result
    const sorted = snap.docs.sort((a, b) => {
        const ta = a.data().createdAt?.toMillis?.() || 0;
        const tb = b.data().createdAt?.toMillis?.() || 0;
        return ta - tb;
    });
    const jobDoc = sorted[0];
    let claimed = false;
    await db.runTransaction(async (tx) => {
        const fresh = await tx.get(jobDoc.ref);
        if (!fresh.exists || fresh.data().status !== 'queued') return;
        tx.update(jobDoc.ref, { status: 'processing', startedAt: admin.firestore.FieldValue.serverTimestamp() });
        claimed = true;
    });
    return claimed ? jobDoc.id : null;
}

// ── Recover stale 'processing' jobs left from a previous crash/restart.
async function recoverStaleJobs() {
    try {
        const snap = await db.collection(BULK_JOBS_COLL).where('status', '==', 'processing').get();
        for (const doc of snap.docs) {
            console.log(`[bulk-import] Recovering stale job ${doc.id}`);
            await doc.ref.update({ status: 'queued' });
        }
        if (!snap.empty) console.log(`[bulk-import] Recovered ${snap.size} stale job(s)`);
    } catch (err) {
        console.warn('[bulk-import] Recovery scan failed:', err.message);
    }
}

// ── Queue worker loop: runs continuously, picks up one job at a time.
async function runBulkWorkerLoop() {
    if (bulkWorkerActive) return;
    bulkWorkerActive = true;
    console.log('[bulk-import] Worker loop started');
    try {
        while (true) {
            let jobId = null;
            try {
                jobId = await claimNextQueuedJob();
            } catch (pollErr) {
                // Firestore poll failed — retry after backoff
                console.warn('[bulk-import] Poll error:', pollErr.message);
                await new Promise(r => setTimeout(r, 10000));
                continue;
            }
            if (!jobId) {
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }
            console.log(`[bulk-import] Worker claimed job ${jobId}`);
            try {
                await executeJob(jobId);
            } catch (err) {
                console.error(`[bulk-import] Job ${jobId} fatal error:`, err.message);
                try {
                    await db.doc(`${BULK_JOBS_COLL}/${jobId}`).update({
                        status: 'error',
                        errorMessage: err.message,
                        completedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                } catch {}
            }
            await new Promise(r => setTimeout(r, 1000));
        }
    } finally {
        bulkWorkerActive = false;
        console.warn('[bulk-import] Worker loop exited — restarting in 5s');
        setTimeout(runBulkWorkerLoop, 5000);
    }
}

// ── Execute a single job (already claimed, status = processing)
async function executeJob(jobId) {
    const jobRef = db.doc(`${BULK_JOBS_COLL}/${jobId}`);
    const itemsRef = db.collection(`${BULK_JOBS_COLL}/${jobId}/items`);
    try {
        // status already set to 'processing' by claimNextQueuedJob
        const itemsSnap = await itemsRef.orderBy('index').get();
        const total = itemsSnap.size;
        let processedCount = 0;
        let failedCount = 0;
        const jobData = (await jobRef.get()).data() || {};
        const positionId = jobData.positionId || '';
        const positionTitle = jobData.positionTitle || '';

        for (const itemDoc of itemsSnap.docs) {
            const item = itemDoc.data();
            if (item.status === 'done' || item.status === 'error') { processedCount++; continue; }
            await itemDoc.ref.update({ status: 'processing' });
            let retries = 0;
            const MAX_RETRIES = 3;
            while (retries <= MAX_RETRIES) {
                try {
                    let cvText = '';
                    if (item.cvText && item.cvText.trim().length > 5) {
                        // Pre-extracted text (json_record or pre-processed file upload)
                        cvText = item.cvText.trim();
                    } else if (item.cvUrl) {
                        cvText = await extractCvTextFromUrl(item.cvUrl);
                        if (!cvText || cvText.length < 20) throw new Error('cvUrl içeriği okunamadı');
                    } else if (item.tempPath) {
                        // Fallback: file path still available (same-process, no restart)
                        const filePath = item.tempPath;
                        if (!fs.existsSync(filePath)) throw new Error('Dosya bulunamadı ve cvText mevcut değil');
                        const fileBuffer = fs.readFileSync(filePath);
                        const ext = (item.originalName || '').toLowerCase().split('.').pop();
                        cvText = await extractCvText(fileBuffer, ext);
                        if (!cvText || cvText.length < 30) throw new Error('CV içeriği okunamadı');
                    } else {
                        throw new Error('cvText, cvUrl veya dosya yolu gereklidir');
                    }
                    const parsed = await parseTextWithGemini(cvText, positionTitle);
                    const matchScore = calculateSimpleMatchScore(parsed, positionTitle);
                    await db.collection(CANDIDATES_COLL).add({
                        name: parsed?.name || item.name || item.originalName?.replace(/\.[^.]+$/, '') || '',
                        email: parsed?.email || item.email || '',
                        phone: parsed?.phone || '',
                        position: positionTitle || parsed?.position || '',
                        positionId: positionId || item.positionId || '',
                        company: parsed?.company || '',
                        location: parsed?.location || '',
                        skills: parsed?.skills || [],
                        experience: parsed?.experience || 0,
                        education: parsed?.education || '',
                        summary: parsed?.summary || '',
                        cvText: cvText.slice(0, 6000),
                        cvFileName: item.originalName || '',
                        matchScore,
                        combinedScore: matchScore,
                        source: 'bulk_import',
                        status: 'ai_analysis',
                        appliedDate: new Date().toISOString().split('T')[0],
                        interviewSessions: [],
                        bulkJobId: jobId,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    // Temp file already cleaned up at upload time (pre-extraction)
                    processedCount++;
                    await itemDoc.ref.update({ status: 'done', matchScore, candidateName: parsed?.name || '' });
                    await jobRef.update({ processedCount, failedCount, lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp() });
                    break;
                } catch (err) {
                    const isQuota = err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('RESOURCE_EXHAUSTED');
                    retries++;
                    if (retries > MAX_RETRIES || !isQuota) {
                        failedCount++;
                        await itemDoc.ref.update({ status: 'error', error: err.message });
                        await jobRef.update({ processedCount, failedCount, lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp() });
                        break;
                    }
                    const backoffMs = Math.pow(2, retries) * 5000;
                    console.warn(`[bulk-import] quota error on ${item.originalName}, backoff ${backoffMs}ms`);
                    await new Promise(r => setTimeout(r, backoffMs));
                }
            }
            await new Promise(r => setTimeout(r, 1500));
        }

        const doneSnap = await itemsRef.where('status', '==', 'done').get();
        const avgScore = doneSnap.size > 0
            ? Math.round(doneSnap.docs.reduce((sum, d) => sum + (d.data().matchScore || 0), 0) / doneSnap.size)
            : 0;

        // Build per-position avgScore map — aggregate across all unique positionIds in the batch
        const positionScoreMap = {};
        for (const d of doneSnap.docs) {
            const dat = d.data();
            const pId = dat.positionId || positionId || '__none__';
            const pTitle = dat.positionTitle || positionTitle || '';
            if (!positionScoreMap[pId]) positionScoreMap[pId] = { positionTitle: pTitle, scores: [] };
            positionScoreMap[pId].scores.push(dat.matchScore || 0);
        }
        const avgScoreByPosition = {};
        for (const [pId, entry] of Object.entries(positionScoreMap)) {
            const scores = entry.scores;
            avgScoreByPosition[pId] = {
                positionTitle: entry.positionTitle,
                avgScore: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
                count: scores.length,
            };
        }

        await jobRef.update({
            status: 'completed',
            processedCount,
            failedCount,
            totalCount: total,
            avgScore,
            avgScoreByPosition,
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`[bulk-import] Job ${jobId} complete: ${processedCount} done, ${failedCount} failed`);
    } catch (err) {
        console.error(`[bulk-import] executeJob ${jobId} error:`, err.message);
        throw err;
    }
}

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

app.post('/api/bulk-import', requireAuth(), bulkUpload.array('cvs', 20), async (req, res) => {
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
                            fs.writeFileSync(destPath, entry.getData());
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
                    const buf = fs.readFileSync(item.tempPath);
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

app.get('/api/bulk-import/:jobId', requireAuth(), async (req, res) => {
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

// /api/score-screening-answers, /api/suggest-screening-questions,
// /api/improve-screening-question moved to routes/screening.js

const PORT = process.env.PORT || 3001;

// ── Start bulk worker in ALL runtime modes (server main OR Firebase Functions import)
// Use setImmediate so the module finishes loading before the first poll attempt
setImmediate(() => {
    setTimeout(async () => {
        await recoverStaleJobs();
        runBulkWorkerLoop().catch(err => console.error('[bulk-import] Worker loop fatal:', err));
    }, 3000);
});

// Only listen if this is the main module
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Backend Server running on http://localhost:${PORT}`);
        console.log(`📡 Health: http://localhost:${PORT}/api/health`);
        cleanupOldFiles(uploadBaseDir);
    });
}

export default app;
