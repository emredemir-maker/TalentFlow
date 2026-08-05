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
import { childLogger } from './logger.js';
const log = childLogger('bulk-worker');

const require = createRequire(import.meta.url);
const mammoth = require('mammoth');

export const BULK_JOBS_COLL = 'artifacts/talent-flow/public/data/bulkImportJobs';
export const CANDIDATES_COLL = 'artifacts/talent-flow/public/data/candidates';
export const POSITIONS_COLL = 'artifacts/talent-flow/public/data/positions';

const normTitle = (s) => (s || '').trim().toLowerCase();

/**
 * AI'nın döndürdüğü başlığı açık pozisyon listesindeki kanonik karşılığıyla
 * eşle (büyük/küçük harf ve boşluk duyarsız). Listede yoksa null — AI'nın
 * uydurduğu başlıklar asla olduğu gibi kabul edilmez.
 */
export function matchOpenTitle(title, openPositionTitles = []) {
    const n = normTitle(title);
    if (!n) return null;
    return openPositionTitles.find((t) => normTitle(t) === n) || null;
}

const clampScore = (n) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Ön skoru çözümle. Pozisyon başlığı önceliği:
 *   1. Yüklemede işe alım uzmanının seçtiği pozisyon BAĞLAYICIDIR — AI onu
 *      asla ezemez.
 *   2. Pozisyon seçilmediyse AI'nın önerisi ancak açık pozisyon listesinde
 *      birebir karşılığı varsa kabul edilir.
 *   3. Aksi halde açık pozisyonlar içinden en iyi anahtar-kelime eşleşmesi.
 *   4. Hiçbir açık pozisyona eşleşme yoksa matchedTitle null döner
 *      ("uygun açık pozisyon yok") — sistemde olmayan bir başlık yazılmaz.
 */
export function resolvePreScore(parsed, positionTitle, openPositionTitles = []) {
    const aiScore = Number(parsed?.matchScore);
    const hasAiScore = !isNaN(aiScore) && aiScore > 0;

    if (positionTitle) {
        const score = hasAiScore ? clampScore(aiScore) : calculateSimpleMatchScore(parsed, positionTitle);
        return { score, matchedTitle: positionTitle };
    }

    const validated = matchOpenTitle(parsed?.matchedPosition, openPositionTitles);
    if (validated && hasAiScore) {
        return { score: clampScore(aiScore), matchedTitle: validated };
    }

    let best = { score: 0, matchedTitle: null };
    for (const title of openPositionTitles) {
        const s = calculateSimpleMatchScore(parsed, title);
        if (s > best.score) best = { score: s, matchedTitle: title };
    }
    if (best.matchedTitle) return best;

    // Açık pozisyon listesi hiç yokken skor profil kalitesini ölçer (prompt
    // öyle ister); liste varken hiçbirine eşleşmemek gerçek bir "uygun
    // pozisyon yok" durumudur ve skor 0'dır.
    if (openPositionTitles.length === 0) {
        return { score: hasAiScore ? clampScore(aiScore) : 0, matchedTitle: null };
    }
    return { score: 0, matchedTitle: null };
}

// Global single-worker flag — only one job runs at a time across all requests.
let bulkWorkerActive = false;

async function parseTextWithGemini(text, positionTitle, openPositionTitles = []) {
    // Skor bağlamı: yüklemede pozisyon seçildiyse ona göre, seçilmediyse
    // açık pozisyonların en uygununa göre puanlanır. Böylece ayrıştırma ve
    // ön skor TEK Gemini çağrısında çıkar — aday başına ek AI maliyeti yok.
    const scoreContext = positionTitle
        ? `Hedef pozisyon: "${positionTitle}". matchScore'u SADECE bu pozisyona uygunluğa göre ver ve matchedPosition alanına aynen "${positionTitle}" yaz.`
        : openPositionTitles.length > 0
            ? `Şirketteki açık pozisyonlar: ${openPositionTitles.map((t) => `"${t}"`).join(', ')}. matchedPosition alanına SADECE bu listeden bir başlığı AYNEN yaz — listede olmayan bir başlık ASLA yazma. Aday hiçbirine uygun değilse matchedPosition alanına null yaz ve matchScore'u 0 ver.`
            : `Açık pozisyon listesi yok. matchScore'u adayın profil kalitesine ve istihdam edilebilirliğine göre ver; matchedPosition alanına null yaz.`;
    const prompt = `Sen bir uzman CV ayrıştırıcısı ve işe alım ön değerlendirme uzmanısın. Aşağıdaki CV metninden aday bilgilerini JSON olarak çıkart ve bir ön uyum skoru ver.
${scoreContext}
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
  "summary": "Kısa özet (Türkçe, max 300 karakter)",
  "matchScore": 75,
  "matchedPosition": "Skorun verildiği pozisyon başlığı",
  "matchReason": "1-2 cümlelik skor gerekçesi (Türkçe)"
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

export function calculateSimpleMatchScore(candidate, positionTitle) {
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

// Contact normalizer — mirrors /api/check-duplicate (routes/cv.js) so the
// manual-add flow and the bulk worker agree on what counts as "the same
// person".
const normContact = (s) => (s || '').trim().toLowerCase().replace(/[\s\-().+]/g, '');

/**
 * Duplicate lookup for bulk import: email first (raw + lowercased forms,
 * since older docs may store mixed case), then phone (raw + normalized).
 * Returns { id, foundBy } of the existing candidate, or null.
 */
export async function findDuplicateCandidate(parsed, item = {}) {
    const emailRaw = (parsed?.email || item.email || '').trim();
    const emails = [...new Set([emailRaw.toLowerCase(), emailRaw].filter(Boolean))];
    for (const value of emails) {
        const snap = await db.collection(CANDIDATES_COLL).where('email', '==', value).limit(1).get();
        if (!snap.empty) return { id: snap.docs[0].id, foundBy: 'email' };
    }
    const phoneRaw = (parsed?.phone || '').trim();
    const phones = [...new Set([normContact(phoneRaw), phoneRaw].filter(Boolean))];
    for (const value of phones) {
        const snap = await db.collection(CANDIDATES_COLL).where('phone', '==', value).limit(1).get();
        if (!snap.empty) return { id: snap.docs[0].id, foundBy: 'phone' };
    }
    return null;
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
        // lastUpdatedAt doubles as the liveness heartbeat recoverStaleJobs
        // checks — stamp it at claim so a freshly-claimed job never looks stale.
        tx.update(jobDoc.ref, {
            status: 'processing',
            startedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        claimed = true;
    });
    return claimed ? jobDoc.id : null;
}

// Recover stale 'processing' jobs left from a previous crash/restart.
//
// CRITICAL: only requeue when the job's heartbeat (lastUpdatedAt — touched
// on claim and after every processed item) is genuinely old. The previous
// unconditional requeue ran on EVERY instance cold start (autoscaling makes
// those frequent), yanked jobs away from workers that were actively
// processing them, and put a second worker on the same job — which then
// re-processed the same items and created duplicate candidates.
const STALE_JOB_MS = 10 * 60 * 1000;
export async function recoverStaleJobs() {
    try {
        const snap = await db.collection(BULK_JOBS_COLL).where('status', '==', 'processing').get();
        let recovered = 0;
        for (const doc of snap.docs) {
            const d = doc.data();
            const heartbeat = d.lastUpdatedAt?.toMillis?.() || d.startedAt?.toMillis?.() || d.createdAt?.toMillis?.() || 0;
            if (Date.now() - heartbeat < STALE_JOB_MS) continue; // hâlâ canlı bir worker'da
            log.info(`[bulk-import] Recovering stale job ${doc.id}`);
            await doc.ref.update({ status: 'queued' });
            recovered++;
        }
        if (recovered > 0) log.info(`[bulk-import] Recovered ${recovered} stale job(s)`);
    } catch (err) {
        log.warn(`[bulk-import] Recovery scan failed: ${err.message}`);
    }
}

// Queue worker loop: runs continuously, picks up one job at a time.
export async function runBulkWorkerLoop() {
    if (bulkWorkerActive) return;
    bulkWorkerActive = true;
    log.info('[bulk-import] Worker loop started');
    try {
        let idlePolls = 0;
        while (true) {
            let jobId = null;
            try {
                jobId = await claimNextQueuedJob();
            } catch (pollErr) {
                // Firestore poll failed — retry after backoff
                log.warn(`[bulk-import] Poll error: ${pollErr.message}`);
                await new Promise(r => setTimeout(r, 10000));
                continue;
            }
            if (!jobId) {
                // Öksüz iş taraması: deploy/ölçekleme sırasında instance'ı
                // ölen bir job 'processing'de takılı kalır; kurtarma yalnızca
                // cold start'ta çalıştığından, trafik canlı kaldığı sürece
                // kimse onu kuyruğa geri koymazdı. Boşta dakikada bir tara.
                idlePolls += 1;
                if (idlePolls % 12 === 0) await recoverStaleJobs();
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }
            log.info(`[bulk-import] Worker claimed job ${jobId}`);
            try {
                await executeJob(jobId);
            } catch (err) {
                log.error(`[bulk-import] Job ${jobId} fatal error: ${err.message}`);
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
        log.warn('[bulk-import] Worker loop exited — restarting in 5s');
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
        let duplicateCount = 0;
        const jobData = (await jobRef.get()).data() || {};
        const positionId = jobData.positionId || '';
        const positionTitle = jobData.positionTitle || '';

        // Açık pozisyon başlıkları (işe bir kez okunur): yüklemede pozisyon
        // seçilmediyse Gemini ön skoru en uygun açık pozisyona göre verir.
        // Bu okuma başarısız olsa da içe aktarma devam eder — skor yalnızca
        // anahtar-kelime yedeğine düşer.
        let openPositions = [];
        try {
            const posSnap = await db.collection(POSITIONS_COLL).where('status', '==', 'open').get();
            openPositions = posSnap.docs
                .map((d) => ({ id: d.id, title: d.data().title }))
                .filter((p) => Boolean(p.title));
        } catch (posErr) {
            log.warn(`[bulk-import] open positions read failed: ${posErr.message}`);
        }
        const openPositionTitles = openPositions.map((p) => p.title);

        const STALE_ITEM_MS = 10 * 60 * 1000;
        // Ortak kota soğuma penceresi: bir işçi Gemini'den 429 yediğinde
        // damgalanır; tüm işçiler bir sonraki AI çağrısından önce bu
        // pencerenin geçmesini bekler (tek işçinin cezasını herkes paylaşır,
        // aynı anda tekrar vurup cezayı uzatmazlar).
        let quotaCooldownUntil = 0;
        const processItem = async (itemDoc) => {
            const item = itemDoc.data();
            if (item.status === 'done' || item.status === 'error' || item.status === 'duplicate') { processedCount++; return; }
            // Per-item transactional claim. itemsSnap is a point-in-time read;
            // if a second worker overlapped on this job (crash recovery,
            // autoscaling), item statuses may have moved since. Claiming
            // atomically guarantees an item is processed EXACTLY once — the
            // root cause of duplicate candidates was both workers passing the
            // stale-snapshot check and processing the same item.
            const claim = await db.runTransaction(async (tx) => {
                const fresh = await tx.get(itemDoc.ref);
                const cur = fresh.data() || {};
                if (cur.status === 'done' || cur.status === 'error' || cur.status === 'duplicate') return 'finished';
                const workingSince = cur.workingAt?.toMillis?.() || 0;
                if (cur.status === 'processing' && Date.now() - workingSince < STALE_ITEM_MS) return 'busy';
                tx.update(itemDoc.ref, { status: 'processing', workingAt: admin.firestore.FieldValue.serverTimestamp() });
                return 'claimed';
            });
            if (claim === 'finished') { processedCount++; return; }
            if (claim === 'busy') return; // başka bir worker üzerinde çalışıyor
            let retries = 0;
            const MAX_RETRIES = 5;
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
                    const cooldownWait = quotaCooldownUntil - Date.now();
                    if (cooldownWait > 0) await new Promise((r) => setTimeout(r, cooldownWait));
                    const parsed = await parseTextWithGemini(cvText, positionTitle, openPositionTitles);
                    // AI ayrıştıramadıysa aday YARATMA: eskiden null parsed ile
                    // "içi boş" aday (adı PDF dosya adı, tüm alanlar boş)
                    // kaydedilip item 'done' işaretleniyordu — hata görünmez
                    // kalıyordu. Artık item 'error' olur ve iş raporunda görünür.
                    if (!parsed) throw new Error('AI ayrıştırma başarısız — CV metni işlenemedi');
                    // Mükerrer koruması: aynı e-posta/telefon havuzda varsa yeni
                    // kayıt açma — item 'duplicate' işaretlenir, mevcut aday korunur.
                    let duplicate = null;
                    try {
                        duplicate = await findDuplicateCandidate(parsed, item);
                    } catch (dupErr) {
                        // Lookup failure must not block candidate creation
                        log.warn(`[bulk-import] duplicate lookup failed for ${item.originalName}: ${dupErr.message}`);
                    }
                    if (duplicate) {
                        duplicateCount++;
                        processedCount++;
                        await itemDoc.ref.update({
                            status: 'duplicate',
                            duplicateOf: duplicate.id,
                            foundBy: duplicate.foundBy,
                            candidateName: parsed?.name || item.name || '',
                        });
                        await jobRef.update({ processedCount, failedCount, duplicateCount, lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp() });
                        break;
                    }
                    const { score: matchScore, matchedTitle } = resolvePreScore(parsed, positionTitle, openPositionTitles);
                    // Eşleşen başlıktan pozisyon doc id'sini çöz — yüklemede
                    // pozisyon seçilmediyse bile aday gerçek bir pozisyona bağlanır.
                    const matchedPos = openPositions.find((p) => p.title === matchedTitle);
                    const noOpenMatch = matchedTitle === null && openPositionTitles.length > 0;
                    await db.collection(CANDIDATES_COLL).add({
                        name: parsed?.name || item.name || item.originalName?.replace(/\.[^.]+$/, '') || '',
                        email: parsed?.email || item.email || '',
                        phone: parsed?.phone || '',
                        position: positionTitle || parsed?.position || '',
                        matchedPositionTitle: matchedTitle,
                        initialAiScore: matchScore,
                        matchReason: noOpenMatch ? 'Uygun açık pozisyon bulunamadı.' : (parsed?.matchReason || ''),
                        positionId: positionId || item.positionId || matchedPos?.id || '',
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
                    const backoffMs = Math.min(60000, Math.pow(2, retries) * 5000);
                    quotaCooldownUntil = Math.max(quotaCooldownUntil, Date.now() + backoffMs);
                    log.warn(`[bulk-import] quota error on ${item.originalName}, backoff ${backoffMs}ms`);
                    await new Promise(r => setTimeout(r, backoffMs));
                }
            }
        };

        // Paralel işleme havuzu. Kayıtlar transaction ile atomik
        // sahiplenildiği için eşzamanlılık güvenli (bir kayıt en fazla bir
        // kez işlenir). Sıralı düzende CV başına ~10 sn (Gemini + Firestore
        // + sabit 1.5 sn bekleme) 455 CV'yi 75+ dakikaya taşıyordu; sabit
        // bekleme kalktı, N işçi süreyi ~N'e böler. Kota koruması yukarıdaki
        // ortak soğuma penceresiyle sağlanır.
        const CONCURRENCY = Math.max(1, parseInt(process.env.BULK_CONCURRENCY || '4', 10));
        let nextIdx = 0;
        await Promise.all(
            Array.from({ length: Math.min(CONCURRENCY, itemsSnap.docs.length) }, async (_, w) => {
                // Kademeli başlangıç — işçiler Gemini'ye aynı anda vurmasın
                await new Promise((r) => setTimeout(r, w * 500));
                while (nextIdx < itemsSnap.docs.length) {
                    const itemDoc = itemsSnap.docs[nextIdx];
                    nextIdx += 1;
                    await processItem(itemDoc);
                }
            })
        );

        const doneSnap = await itemsRef.where('status', '==', 'done').get();
        const avgScore = doneSnap.size > 0
            ? Math.round(doneSnap.docs.reduce((sum, d) => sum + (d.data().matchScore || 0), 0) / doneSnap.size)
            : 0;

        // Build per-position avgScore map — aggregate across all unique positionIds in the batch.
        // Anahtar 'genel' (pozisyonsuz yüklemeler): Firestore, çift alt
        // çizgiyle başlayıp biten alan adlarını rezerve tutar — eski
        // '__none__' anahtarı final update'i INVALID_ARGUMENT ile patlatıp
        // tüm item'ları işlenmiş işleri 'error' durumunda bırakıyordu.
        const positionScoreMap = {};
        for (const d of doneSnap.docs) {
            const dat = d.data();
            const pId = dat.positionId || positionId || 'genel';
            const pTitle = dat.positionTitle || positionTitle || 'Genel Değerlendirme';
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

        // Authoritative recount from a FRESH read — the loop's counters come
        // from a point-in-time snapshot and drift if another worker touched
        // this job. If items are still in flight elsewhere, give a short
        // grace period, then requeue instead of declaring completion.
        const recount = async () => {
            const fresh = await itemsRef.get();
            const counts = { done: 0, duplicate: 0, error: 0, unfinished: 0 };
            for (const d of fresh.docs) {
                const s = d.data().status;
                if (s === 'done') counts.done++;
                else if (s === 'duplicate') counts.duplicate++;
                else if (s === 'error') counts.error++;
                else counts.unfinished++;
            }
            return counts;
        };
        let counts = await recount();
        if (counts.unfinished > 0) {
            await new Promise((r) => setTimeout(r, 30000));
            counts = await recount();
        }
        processedCount = counts.done + counts.duplicate;
        duplicateCount = counts.duplicate;
        failedCount = counts.error;
        if (counts.unfinished > 0) {
            await jobRef.update({
                status: 'queued',
                processedCount,
                failedCount,
                duplicateCount,
                lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            log.info(`[bulk-import] Job ${jobId} requeued: ${counts.unfinished} item(s) still in flight on another worker`);
            return;
        }

        await jobRef.update({
            status: 'completed',
            processedCount,
            failedCount,
            duplicateCount,
            totalCount: total,
            avgScore,
            avgScoreByPosition,
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        log.info(`[bulk-import] Job ${jobId} complete: ${processedCount} done (${duplicateCount} duplicate), ${failedCount} failed`);
    } catch (err) {
        log.error(`[bulk-import] executeJob ${jobId} error: ${err.message}`);
        throw err;
    }
}
