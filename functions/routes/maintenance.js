// Maintenance endpoints — bulk-job visibility and duplicate-candidate
// cleanup. Recruiter+ gated; recruiters only see their own jobs, and the
// clean endpoint re-verifies every id server-side so nothing that isn't a
// genuine duplicate "extra" can be deleted regardless of what the client
// sends.
//
//   GET  /api/maintenance/bulk-jobs       — last 20 bulk-import jobs with
//                                            status/counters/errorMessage.
//   GET  /api/maintenance/duplicate-scan  — group candidates by normalized
//                                            email (phone fallback); returns
//                                            keep/extras per group.
//   POST /api/maintenance/duplicate-clean — delete given candidate ids,
//                                            but only those the scan itself
//                                            classifies as extras.
import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import { db, admin } from '../config/firebaseAdmin.js';
import { groupDuplicateCandidates, richnessOf } from '../services/duplicateScan.js';
import { computePrescore } from '../services/prescore.js';
import { planMatchRepairs, collectJobIdsNeedingLookup } from '../services/matchRepair.js';
import { needsEnrichment, extractExperiences } from '../services/enrich.js';
import { POSITIONS_COLL } from '../services/bulkWorker.js';
import { childLogger } from '../services/logger.js';

const log = childLogger('maintenance');
const router = Router();

const CANDIDATES_COLL = 'artifacts/talent-flow/public/data/candidates';
const BULK_JOBS_COLL = 'artifacts/talent-flow/public/data/bulkImportJobs';
const ROLES = ['super_admin', 'recruiter'];

async function readCandidatesFlat() {
    // select(): yalnızca mükerrer tespitinde kullanılan küçük alanlar tel
    // üzerinden gelir. Projeksiyonsuz tam koleksiyon okuması (cvText +
    // positionAnalyses + aiAnalysis dahil) Hosting'in 60 sn sınırını aşıyor
    // ve eşzamanlı isteklerde 2GiB belleği taşırıp 502'ye yol açıyordu.
    const snap = await db.collection(CANDIDATES_COLL)
        .select('name', 'email', 'phone', 'source', 'bulkJobId', 'createdAt',
            'experiences', 'skills', 'summary', 'education')
        .get();
    return snap.docs.map((d) => {
        const c = d.data();
        return {
            id: d.id,
            name: c.name || '',
            email: c.email || '',
            phone: c.phone || '',
            source: c.source || '',
            bulkJobId: c.bulkJobId || null,
            createdAtMs: c.createdAt?.toMillis?.() || 0,
            // Doluluk puanı burada türetilir; ağır alanlar (experiences vb.)
            // yanıt gövdesine taşınmaz.
            richness: richnessOf(c),
        };
    });
}

router.get('/api/maintenance/bulk-jobs', requireAuth(ROLES), async (req, res) => {
    try {
        // Tüm iş geçmişini okumak yerine sorguyu sınırla: super_admin son 20
        // işi, recruiter yalnızca kendi işlerini çeker (tek alanlı otomatik
        // indeks yeterli; composite indeks gerekmesin diye recruiter tarafı
        // bellekte sıralanır).
        const query = req.user.role === 'super_admin'
            ? db.collection(BULK_JOBS_COLL).orderBy('createdAt', 'desc').limit(20)
            : db.collection(BULK_JOBS_COLL).where('createdBy', '==', req.user.uid);
        const snap = await query.get();
        let jobs = snap.docs.map((d) => {
            const j = d.data();
            return {
                jobId: d.id,
                status: j.status || 'unknown',
                totalCount: j.totalCount || 0,
                processedCount: j.processedCount || 0,
                failedCount: j.failedCount || 0,
                duplicateCount: j.duplicateCount || 0,
                errorMessage: j.errorMessage || null,
                positionTitle: j.positionTitle || '',
                createdBy: j.createdBy || '',
                createdAtMs: j.createdAt?.toMillis?.() || 0,
            };
        });
        jobs.sort((a, b) => b.createdAtMs - a.createdAtMs);
        res.json({ jobs: jobs.slice(0, 20) });
    } catch (err) {
        log.error(`[maintenance/bulk-jobs] ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

router.get('/api/maintenance/duplicate-scan', requireAuth(ROLES), async (req, res) => {
    try {
        const candidates = await readCandidatesFlat();
        const groups = groupDuplicateCandidates(candidates);
        res.json({
            totalCandidates: candidates.length,
            duplicateGroups: groups.length,
            extrasCount: groups.reduce((s, g) => s + g.extras.length, 0),
            groups: groups.slice(0, 200),
        });
    } catch (err) {
        log.error(`[maintenance/duplicate-scan] ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/maintenance/duplicate-clean', requireAuth(ROLES), async (req, res) => {
    try {
        const ids = req.body?.ids;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids dizisi gereklidir.' });
        }
        if (ids.length > 300) {
            return res.status(400).json({ error: 'Tek seferde en fazla 300 kayıt silinebilir.' });
        }
        // Sunucu tarafı yeniden doğrulama: istemci ne gönderirse göndersin,
        // yalnızca taramanın "fazlalık" saydığı kayıtlar silinebilir — her
        // grubun en eski (korunan) kaydı hiçbir koşulda silinemez.
        const candidates = await readCandidatesFlat();
        const groups = groupDuplicateCandidates(candidates);
        const deletable = new Set(groups.flatMap((g) => g.extras.map((e) => e.id)));
        const toDelete = [...new Set(ids)].filter((id) => deletable.has(id));

        let deleted = 0;
        while (deleted < toDelete.length) {
            const chunk = toDelete.slice(deleted, deleted + 400); // Firestore batch limiti 500
            const batch = db.batch();
            for (const id of chunk) batch.delete(db.collection(CANDIDATES_COLL).doc(id));
            await batch.commit();
            deleted += chunk.length;
        }
        log.info(`[maintenance] ${deleted} mükerrer aday silindi (istekte ${ids.length}, kullanıcı ${req.user.uid})`);
        res.json({ deleted, skipped: ids.length - deleted });
    } catch (err) {
        log.error(`[maintenance/duplicate-clean] ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// Geriye dönük ön skor basma. Her çağrı en fazla batchSize adayı puanlar
// ve kalan sayıyı döndürür — istemci (MaintenancePanel) kalan 0 olana dek
// zincirleme çağırır. Uzun tek istek yerine parça parça: 300 sn'lik
// fonksiyon zaman aşımına takılmaz ve her istek aktif olduğundan CPU
// kısıtlaması yaşanmaz. Yalnızca skoru hiç olmayan (<=0) adaylar seçilir;
// gerçek skoru olan hiçbir kayıtın üzerine yazılmaz.
router.post('/api/maintenance/prescore', requireAuth(ROLES), async (req, res) => {
    try {
        const batchSize = Math.min(60, Math.max(1, parseInt(req.body?.batchSize, 10) || 40));
        const scoreOf = (c) => Number(c.initialAiScore || 0) || Number(c.matchScore || 0) || Number(c.aiScore || 0);

        // İki aşamalı okuma: önce yalnızca skor alanlarıyla (küçük) tüm
        // koleksiyon taranır, sonra sadece bu partinin adayları gerekli
        // alanlarla çekilir. Eski tam-koleksiyon okuması cvText dahil her
        // şeyi belleğe alıp Gemini çağrıları boyunca tutuyordu (502/OOM).
        const scoreSnap = await db.collection(CANDIDATES_COLL)
            .select('initialAiScore', 'matchScore', 'aiScore')
            .get();
        const pendingRefs = scoreSnap.docs.filter((d) => scoreOf(d.data()) <= 0).map((d) => d.ref);
        const batchRefs = pendingRefs.slice(0, batchSize);
        const batchDocs = batchRefs.length > 0
            ? await db.getAll(...batchRefs, { fieldMask: ['cvText', 'position', 'skills'] })
            : [];

        // Gereksinimler de taşınır: anahtar-kelime ön skoru artık yalnızca
        // başlık kelimelerine değil, ilanın gereksinimlerine de bakar.
        let openPositions = [];
        try {
            const posSnap = await db.collection(POSITIONS_COLL).where('status', '==', 'open').get();
            openPositions = posSnap.docs
                .map((d) => ({ title: d.data().title, requirements: d.data().requirements || [] }))
                .filter((p) => Boolean(p.title));
        } catch (posErr) {
            log.warn(`[maintenance/prescore] open positions read failed: ${posErr.message}`);
        }

        // Süre bütçesi: Hosting rewrite 60 sn'de, istemci 55 sn'de keser.
        // Gemini yavaşlar/kota bekletirse (tek çağrı retry'larla 30+ sn
        // sürebilir) parti yarıda kalmasın: bütçe dolunca yeni aday alınmaz,
        // o ana kadarki sonuç ve gerçek 'remaining' döndürülür — istemci
        // zinciri kaldığı yerden sürdürür.
        const startedAt = Date.now();
        const DEADLINE_MS = 40000;
        let updated = 0;
        let failed = 0;
        let aiUsed = 0;
        let idx = 0;
        // 4 paralel işçi — bulk worker ile aynı eşzamanlılık düzeyi
        await Promise.all(
            Array.from({ length: Math.min(4, batchDocs.length) }, async () => {
                while (idx < batchDocs.length) {
                    if (Date.now() - startedAt > DEADLINE_MS) break;
                    const docSnap = batchDocs[idx];
                    idx += 1;
                    try {
                        const data = docSnap.data();
                        const result = await computePrescore(data, openPositions);
                        await docSnap.ref.update({
                            initialAiScore: result.score,
                            matchScore: result.score,
                            combinedScore: result.score,
                            // matchedTitle ya doğrulanmış bir açık pozisyon başlığıdır
                            // ya da null ("uygun açık pozisyon yok") — CV'deki serbest
                            // pozisyon adı asla eşleşme diye yazılmaz.
                            matchedPositionTitle: result.matchedTitle ?? null,
                            matchReason: result.matchReason || '',
                            // CV'ye göre ideal rol yalnızca AI ürettiyse yazılır;
                            // mevcut değer boş yanıtla ezilmez.
                            ...(result.suggestedRole ? { suggestedRole: result.suggestedRole } : {}),
                            prescoreMethod: result.method,
                            prescoredAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                        if (result.method === 'ai') aiUsed += 1;
                        updated += 1;
                    } catch (err) {
                        failed += 1;
                        log.warn(`[maintenance/prescore] candidate ${docSnap.id} failed: ${err.message}`);
                    }
                }
            })
        );

        // Süre bütçesi dolduysa partinin tamamı denenmemiş olabilir —
        // 'attempted' gerçek sayıdır ve remaining ona göre hesaplanır.
        const attempted = Math.min(idx, batchDocs.length);
        const deadlineHit = attempted < batchDocs.length;
        log.info(`[maintenance/prescore] batch done: ${updated} updated (${aiUsed} AI), ${failed} failed, ${pendingRefs.length - attempted} remaining${deadlineHit ? ' (süre bütçesi doldu)' : ''}`);
        res.json({
            processed: attempted,
            updated,
            failed,
            aiUsed,
            deadlineHit,
            remaining: pendingRefs.length - attempted,
        });
    } catch (err) {
        log.error(`[maintenance/prescore] ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// Bakım süreci durum tespiti — panelin adım adım yönlendirmesi için tüm
// sayaçları TEK aday projeksiyon okumasıyla üretir: takılı işler, mükerrer
// fazlalıklar, geçersiz pozisyon eşleşmeleri ve 0 skorlu adaylar.
router.get('/api/maintenance/health-check', requireAuth(ROLES), async (req, res) => {
    try {
        const posSnap = await db.collection(POSITIONS_COLL).where('status', '==', 'open').get();
        const openPositions = posSnap.docs
            .map((d) => ({ id: d.id, title: d.data().title }))
            .filter((p) => Boolean(p.title));

        const candSnap = await db.collection(CANDIDATES_COLL)
            .select('name', 'email', 'phone', 'source', 'bulkJobId', 'createdAt',
                'matchedPositionTitle', 'positionId', 'position', 'skills',
                'initialAiScore', 'matchScore', 'aiScore',
                'experiences', 'summary', 'education', 'cvText', 'enrichedAt', 'location')
            .get();
        const candidates = candSnap.docs.map((d) => {
            const c = d.data();
            return { id: d.id, ...c, createdAtMs: c.createdAt?.toMillis?.() || 0 };
        });

        const dupGroups = groupDuplicateCandidates(candidates);
        const duplicates = dupGroups.reduce((s, g) => s + g.extras.length, 0);

        const scoreOf = (c) => Number(c.initialAiScore || 0) || Number(c.matchScore || 0) || Number(c.aiScore || 0);
        const zeroScore = candidates.filter((c) => scoreOf(c) <= 0).length;

        let invalidMatches = 0;
        if (openPositions.length > 0) {
            const jobIds = collectJobIdsNeedingLookup(candidates, openPositions);
            const jobsById = new Map();
            if (jobIds.length > 0) {
                const jobDocs = await db.getAll(
                    ...jobIds.map((id) => db.doc(`${BULK_JOBS_COLL}/${id}`)),
                    { fieldMask: ['positionId', 'positionTitle'] }
                );
                for (const j of jobDocs) if (j.exists) jobsById.set(j.id, j.data());
            }
            invalidMatches = planMatchRepairs(candidates, openPositions, jobsById).length;
        }

        const errSnap = await db.collection(BULK_JOBS_COLL).where('status', '==', 'error').get();
        const stuckJobs = errSnap.docs.filter((d) => {
            const j = d.data();
            return (j.totalCount || 0) > 0 && (j.processedCount || 0) >= (j.totalCount || 0);
        }).length;

        const missingExperiences = candidates.filter(needsEnrichment).length;

        res.json({
            totalCandidates: candidates.length,
            openPositions: openPositions.length,
            stuckJobs,
            duplicates,
            invalidMatches,
            zeroScore,
            missingExperiences,
        });
    } catch (err) {
        log.error(`[maintenance/health-check] ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// Pozisyon eşleşme onarımı: geçmişte doğrulanmadan yazılmış (sistemde
// olmayan) matchedPositionTitle değerlerini deterministik kurallarla düzeltir
// — AI çağrısı yapmaz, skorlara dokunmaz. Kurallar: services/matchRepair.js.
router.post('/api/maintenance/validate-matches', requireAuth(ROLES), async (req, res) => {
    try {
        const posSnap = await db.collection(POSITIONS_COLL).where('status', '==', 'open').get();
        const openPositions = posSnap.docs
            .map((d) => ({ id: d.id, title: d.data().title }))
            .filter((p) => Boolean(p.title));
        if (openPositions.length === 0) {
            return res.status(400).json({ error: 'Onarım için en az bir açık pozisyon gerekli.' });
        }

        const candSnap = await db.collection(CANDIDATES_COLL)
            .select('matchedPositionTitle', 'positionId', 'bulkJobId', 'position', 'skills')
            .get();
        const candidates = candSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // Yalnızca kural 1-2'nin çözemediği adayların işleri okunur (tekil)
        const jobIds = collectJobIdsNeedingLookup(candidates, openPositions);
        const jobsById = new Map();
        if (jobIds.length > 0) {
            const jobRefs = jobIds.map((id) => db.doc(`${BULK_JOBS_COLL}/${id}`));
            const jobDocs = await db.getAll(...jobRefs, { fieldMask: ['positionId', 'positionTitle'] });
            for (const j of jobDocs) if (j.exists) jobsById.set(j.id, j.data());
        }

        const plans = planMatchRepairs(candidates, openPositions, jobsById);

        // Tek istekte en fazla 2000 yazım (400'lük batch'ler); kalanı bildirilir
        const MAX_WRITES = 2000;
        const toApply = plans.slice(0, MAX_WRITES);
        let applied = 0;
        while (applied < toApply.length) {
            const chunk = toApply.slice(applied, applied + 400);
            const batch = db.batch();
            for (const p of chunk) {
                batch.update(db.collection(CANDIDATES_COLL).doc(p.id), {
                    ...p.update,
                    matchRepairedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
            await batch.commit();
            applied += chunk.length;
        }

        const byRule = {};
        for (const p of toApply) byRule[p.rule] = (byRule[p.rule] || 0) + 1;
        log.info(`[maintenance/validate-matches] ${candSnap.size} tarandı, ${applied} onarıldı: ${JSON.stringify(byRule)}`);
        res.json({
            scanned: candSnap.size,
            repaired: applied,
            byRule,
            remaining: plans.length - toApply.length,
        });
    } catch (err) {
        log.error(`[maintenance/validate-matches] ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// Eksik profil tamamlama: kayıtlı cvText'i olan ama kariyer geçmişi boş
// adaylara odaklı bir Gemini çağrısıyla experiences doldurur. prescore ile
// aynı desende çalışır: küçük parti + 40 sn süre bütçesi + kalan sayısı,
// istemci kalan 0 olana dek zincirler.
router.post('/api/maintenance/enrich-profiles', requireAuth(ROLES), async (req, res) => {
    try {
        const batchSize = Math.min(20, Math.max(1, parseInt(req.body?.batchSize, 10) || 10));

        const scoreSnap = await db.collection(CANDIDATES_COLL)
            .select('experiences', 'cvText', 'enrichedAt', 'location')
            .get();
        const pendingRefs = scoreSnap.docs
            .filter((d) => needsEnrichment(d.data()))
            .map((d) => d.ref);
        const batchRefs = pendingRefs.slice(0, batchSize);
        const batchDocs = batchRefs.length > 0
            ? await db.getAll(...batchRefs, { fieldMask: ['cvText', 'location'] })
            : [];

        const startedAt = Date.now();
        const DEADLINE_MS = 40000;
        let updated = 0;
        let failed = 0;
        let idx = 0;
        await Promise.all(
            Array.from({ length: Math.min(4, batchDocs.length) }, async () => {
                while (idx < batchDocs.length) {
                    if (Date.now() - startedAt > DEADLINE_MS) break;
                    const docSnap = batchDocs[idx];
                    idx += 1;
                    try {
                        const enriched = await extractExperiences(docSnap.data()?.cvText || '');
                        if (enriched === null) { failed += 1; continue; }
                        const patch = {
                            experiences: enriched.experiences,
                            enrichedAt: admin.firestore.FieldValue.serverTimestamp(),
                        };
                        // Konum yalnızca boşsa yazılır — elle düzeltilmiş bir
                        // değeri AI çıktısı ezmesin.
                        if (enriched.location && !String(docSnap.data()?.location || '').trim()) {
                            patch.location = enriched.location;
                        }
                        await docSnap.ref.update(patch);
                        updated += 1;
                    } catch (err) {
                        failed += 1;
                        log.warn(`[maintenance/enrich] candidate ${docSnap.id} failed: ${err.message}`);
                    }
                }
            })
        );

        const attempted = Math.min(idx, batchDocs.length);
        log.info(`[maintenance/enrich] batch done: ${updated} updated, ${failed} failed, ${pendingRefs.length - attempted} remaining`);
        res.json({
            processed: attempted,
            updated,
            failed,
            remaining: pendingRefs.length - attempted,
        });
    } catch (err) {
        log.error(`[maintenance/enrich] ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// Tüm kayıtları işlenmiş ama son özet yazımı hatası yüzünden 'error'
// etiketinde takılı kalmış toplu işleri 'completed' olarak kapatır (ör. eski
// '__none__' rezerve alan adı hatası). Kayıt kaybı yoktur — yalnızca etiket
// düzeltilir; orijinal hata mesajı lastErrorMessage alanında saklanır.
router.post('/api/maintenance/close-stuck-jobs', requireAuth(ROLES), async (req, res) => {
    try {
        const snap = await db.collection(BULK_JOBS_COLL).where('status', '==', 'error').get();
        let closed = 0;
        const batch = db.batch();
        for (const d of snap.docs) {
            if (closed >= 400) break;
            const j = d.data();
            const total = j.totalCount || 0;
            if (total > 0 && (j.processedCount || 0) >= total) {
                batch.update(d.ref, {
                    status: 'completed',
                    errorMessage: null,
                    lastErrorMessage: j.errorMessage || null,
                    repairedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                closed++;
            }
        }
        if (closed > 0) await batch.commit();
        log.info(`[maintenance/close-stuck-jobs] ${snap.size} hatalı iş kontrol edildi, ${closed} kapatıldı`);
        res.json({ checked: snap.size, closed });
    } catch (err) {
        log.error(`[maintenance/close-stuck-jobs] ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

export default router;
