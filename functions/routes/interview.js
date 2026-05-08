// Live-interview session lifecycle.
//
//   GET  /api/session/:sessionId          — public polling endpoint for the
//                                            candidate side. Returns visible
//                                            questions, recruiter presence,
//                                            and the current question index
//                                            for the matching session.
//   POST /api/init-interview-session      — creates /interviews/{sessionId}
//                                            via Admin SDK on first recruiter
//                                            join. Idempotent — re-running with
//                                            the same id merges initialData.
//   POST /api/update-candidate-status     — candidate-side writes for the
//                                            heartbeat / consent fields. Only
//                                            CANDIDATE_ALLOWED_FIELDS pass; any
//                                            other field is logged and dropped.
//
// All three are throttled by sessionLimiter (60 req/min/IP) — tight enough
// to block sessionId enumeration, loose enough for normal heartbeat polling.
import { Router } from 'express';

import { sessionLimiter } from '../middleware/rateLimit.js';
import { db } from '../config/firebaseAdmin.js';

const router = Router();

router.get('/api/session/:sessionId', sessionLimiter, async (req, res) => {
    const { sessionId } = req.params;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    try {
        const snapshot = await db.collection('artifacts/talent-flow/public/data/candidates').get();
        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const session = (data.interviewSessions || []).find(s => s.id === sessionId);
            if (session) {
                const visibleQuestions = (session.questions || []).filter(q => q.visibleToCandidate);
                console.log(`[GET /api/session] Found session ${sessionId} — ${visibleQuestions.length} visible question(s), status: ${session.candidateStatus}`);
                return res.json({
                    found: true,
                    candidateId: docSnap.id,
                    candidateName: data.name,
                    status: session.status,
                    candidateStatus: session.candidateStatus,
                    recruiterPresence: session.recruiterPresence,
                    lastActive: session.lastActive,
                    questions: visibleQuestions,
                    currentQuestionIndex: session.currentQuestionIndex,
                });
            }
        }
        return res.status(404).json({ found: false, error: 'Seans bulunamadı.' });
    } catch (err) {
        console.error('GET /api/session error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Fields the CANDIDATE side is permitted to write — anything else is dropped
// to keep recruiter-only state (e.g., questions, currentQuestionIndex) immune
// to tampering from the public candidate view.
const CANDIDATE_ALLOWED_FIELDS = new Set([
    'candidateStatus',
    'candidateConnected',
    'candidatePresence',
    'lastActive',
    'hasConsent',
]);

router.post('/api/init-interview-session', sessionLimiter, async (req, res) => {
    const { sessionId, initialData } = req.body;
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.startsWith('iv-')) {
        return res.status(400).json({ error: 'Invalid sessionId.' });
    }
    if (initialData && typeof initialData !== 'object') {
        return res.status(400).json({ error: 'initialData must be an object.' });
    }
    try {
        const sessionRef = db.doc(`interviews/${sessionId}`);
        const snap = await sessionRef.get();
        if (!snap.exists) {
            await sessionRef.set({ sessionId, createdAt: new Date().toISOString(), ...(initialData || {}) });
            console.log(`[init-interview-session] Created /interviews/${sessionId}`);
        } else {
            if (initialData && Object.keys(initialData).length > 0) {
                await sessionRef.set(initialData, { merge: true });
            }
            console.log(`[init-interview-session] /interviews/${sessionId} already exists.`);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('[init-interview-session] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/update-candidate-status', sessionLimiter, async (req, res) => {
    const { sessionId, candidateId, updates } = req.body;
    if (!sessionId || !candidateId || !updates || typeof updates !== 'object') {
        return res.status(400).json({ error: "Missing required fields." });
    }

    const safeUpdates = {};
    for (const key of Object.keys(updates)) {
        if (CANDIDATE_ALLOWED_FIELDS.has(key)) {
            safeUpdates[key] = updates[key];
        } else {
            console.warn(`[update-candidate-status] Blocked field "${key}" from session ${sessionId}`);
        }
    }
    if (Object.keys(safeUpdates).length === 0) {
        return res.status(400).json({ error: "No permitted fields to update." });
    }

    try {
        const candidateRef = db.doc(`artifacts/talent-flow/public/data/candidates/${candidateId}`);
        await db.runTransaction(async (t) => {
            const doc = await t.get(candidateRef);
            if (!doc.exists) throw new Error("Candidate not found.");

            const data = doc.data();
            const sessions = data.interviewSessions || [];
            const sessionExists = sessions.some(s => s.id === sessionId);
            if (!sessionExists) throw new Error("Session not found for this candidate.");

            const newSessions = sessions.map(session =>
                session.id === sessionId ? { ...session, ...safeUpdates } : session
            );
            t.update(candidateRef, { interviewSessions: newSessions });
        });

        res.json({ success: true });
    } catch (error) {
        console.error("Failed to update candidate session via proxy:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
