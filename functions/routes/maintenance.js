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
import { db } from '../config/firebaseAdmin.js';
import { groupDuplicateCandidates } from '../services/duplicateScan.js';
import { childLogger } from '../services/logger.js';

const log = childLogger('maintenance');
const router = Router();

const CANDIDATES_COLL = 'artifacts/talent-flow/public/data/candidates';
const BULK_JOBS_COLL = 'artifacts/talent-flow/public/data/bulkImportJobs';
const ROLES = ['super_admin', 'recruiter'];

async function readCandidatesFlat() {
    const snap = await db.collection(CANDIDATES_COLL).get();
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
        };
    });
}

router.get('/api/maintenance/bulk-jobs', requireAuth(ROLES), async (req, res) => {
    try {
        const snap = await db.collection(BULK_JOBS_COLL).get();
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
        if (req.user.role !== 'super_admin') {
            jobs = jobs.filter((j) => j.createdBy === req.user.uid);
        }
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

export default router;
