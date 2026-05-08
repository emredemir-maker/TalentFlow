// Background worker for bulk-import jobs.
//
// Jobs live in Firestore under BULK_JOBS_COLL with a sub-collection of
// per-row 'items'. The worker loop:
//   1. Polls for status='queued' jobs.
//   2. Atomically claims one with a transaction (status -> 'processing').
//   3. For each item: extracts CV text (already-extracted, from cvUrl, or
//      from a temp file), runs Gemini parse + simple keyword match score,
//      and writes a candidate doc.
//   4. On Gemini quota errors retries with exponential backoff up to 3 times.
//   5. Updates per-position avgScore aggregates when the job finishes.
//
// Started by server.js on boot via setImmediate -> recoverStaleJobs +
// runBulkWorkerLoop. The worker runs in BOTH local dev and Firebase
// Functions runtime so the queue keeps draining even between explicit
// API requests.
//
// The /api/bulk-import endpoint enqueues new jobs but does NOT call
// runBulkWorkerLoop directly — it relies on the polling worker to pick
// the new job up on its next 5-second tick.
import fs from 'fs';
import { readFile } from 'fs/promises';
import { createRequire } from 'module';

import { db, admin } from '../config/firebaseAdmin.js';
import { pdf } from './pdf.js';
import { generateText } from './gemini.js';

const require = createRequire(import.meta.url);
const mammoth = require('mammoth');

export const BULK_JOBS_COLL = 'artifacts/talent-flow/public/data/bulkImportJobs';
export const CANDIDATES_COLL = 'artifacts/talent-flow/public/data/candidates';

// Global single-worker flag — only one job runs at a time across all requests.
let bulkWorkerActive = false;

async function parseTextWithGemini(text, positionTitle) {
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
    // generateText() handles retry/backoff and caches identical CV text
    // (same prompt -> same SHA256 key) so re-runs on transient errors
    // don't pay another quota tick.
    const raw = (await generateText(prompt)).replace(/```json|```/gi, '').trim();
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

export async function extractCvText(buffer, ext) {
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

// Atomically claim a single queued job via Firestore transaction.
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

// Recover stale 'processing' jobs left from a previous crash/restart.
export async function recoverStaleJobs() {
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

// Queue worker loop: runs continuously, picks up one job at a time.
export async function runBulkWorkerLoop() {
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

// Execute a single job (already claimed, status = processing)
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
                        const fileBuffer = await readFile(filePath);
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
