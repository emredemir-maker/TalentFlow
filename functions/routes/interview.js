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
//   POST /api/create-manual-interview     — recruiter-only. Creates an
//                                            interview record from manually
//                                            entered Q&A + notes (no WebRTC,
//                                            no live transcript) and runs
//                                            Gemini evaluation in the same
//                                            request. Returns the AI scores
//                                            so the modal can render them.
//
// All session endpoints are throttled by sessionLimiter (60 req/min/IP) —
// tight enough to block sessionId enumeration, loose enough for normal
// heartbeat polling.
import { Router } from 'express';

import { sessionLimiter, aiLimiter } from '../middleware/rateLimit.js';
import { db, admin } from '../config/firebaseAdmin.js';
import { requireAuth } from '../middleware/auth.js';
import { generateText } from '../services/gemini.js';
import { childLogger } from '../services/logger.js';
const log = childLogger('interview');

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
                log.info(`[GET /api/session] Found session ${sessionId} — ${visibleQuestions.length} visible question(s), status: ${session.candidateStatus}`);
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
        log.error('GET /api/session error:', err.message);
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
            log.info(`[init-interview-session] Created /interviews/${sessionId}`);
        } else {
            if (initialData && Object.keys(initialData).length > 0) {
                await sessionRef.set(initialData, { merge: true });
            }
            log.info(`[init-interview-session] /interviews/${sessionId} already exists.`);
        }
        res.json({ success: true });
    } catch (err) {
        log.error('[init-interview-session] Error:', err.message);
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
            log.warn(`[update-candidate-status] Blocked field "${key}" from session ${sessionId}`);
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
        log.error("Failed to update candidate session via proxy:", error);
        res.status(500).json({ error: error.message });
    }
});

// ─── Manual interview entry ──────────────────────────────────────────────
// Recruiter-driven flow for interviews that didn't go through LiveInterview
// or Face-to-face — phone calls, in-person without recording, etc. The
// recruiter fills a structured form (Q&A + transcript + notes) and we run
// the same Gemini evaluation pipeline so the resulting record looks the
// same as automated interviews in lists, reports, and search.

const VALID_INTERVIEW_TYPES = new Set(['phone', 'in-person', 'teams', 'zoom', 'meet', 'other']);
const VALID_OUTCOMES = new Set(['positive', 'negative', 'pending']);

/**
 * Build a Gemini prompt that scores Q&A pairs + optional transcript/notes
 * and returns a structured evaluation. Mirrors /api/score-screening-answers
 * shape, plus a recommendedOutcome field the UI uses to suggest a label.
 */
export function buildManualInterviewPrompt({
    positionTitle,
    candidateName,
    interviewType,
    date,
    time,
    questions,
    transcript,
    notes,
}) {
    const qaPairs = (questions || [])
        .map((q, i) => `Soru ${i + 1}: ${q.question}\nCevap: ${q.answer || '(cevap girilmedi)'}`)
        .join('\n\n');

    const optionalSections = [];
    if (transcript && transcript.trim()) {
        optionalSections.push(`Tam Transkript:\n${transcript.trim().slice(0, 12000)}`);
    }
    if (notes && notes.trim()) {
        optionalSections.push(`Görüşmeci Notları:\n${notes.trim().slice(0, 4000)}`);
    }

    return `Sen kıdemli bir İK uzmanısın. Aşağıdaki MANUEL OLARAK YAPILMIŞ görüşmenin kayıtlarını değerlendir.

Pozisyon: ${positionTitle || 'Genel Pozisyon'}
Aday: ${candidateName || '(belirtilmedi)'}
Görüşme Tipi: ${interviewType}
Tarih: ${date || ''} ${time || ''}

Sorular ve Cevaplar:
${qaPairs || '(soru-cevap girilmedi)'}

${optionalSections.join('\n\n')}

Görevin:
1. Her soru için 0-100 arası puan ver ve kısa Türkçe gerekçe yaz.
2. Genel agregat skor üret (0-100).
3. Görüşme hakkında 2-3 cümlelik Türkçe genel değerlendirme yaz.
4. Outcome önerisi: "positive" (olumlu — pozisyona uygun), "negative" (olumsuz — uygun değil), veya "pending" (belirsiz — daha fazla görüşme gerek).

YALNIZCA aşağıdaki JSON formatında yanıt ver, başka hiçbir şey yazma:
{
  "questions": [{"question": "...", "score": 85, "rationale": "..."}],
  "aggregateScore": 85,
  "summary": "Kısa genel değerlendirme",
  "recommendedOutcome": "positive"
}`;
}

router.post(
    '/api/create-manual-interview',
    aiLimiter,
    requireAuth(['recruiter', 'admin', 'super_admin']),
    async (req, res) => {
        const {
            candidateId,
            candidateName,
            positionId,
            positionTitle,
            interviewerName,
            date,
            time,
            durationMinutes,
            interviewType,
            questions,
            transcript,
            notes,
            recruiterOutcome,
        } = req.body || {};

        // ── Validation
        if (!candidateId || !candidateName) {
            return res.status(400).json({ error: 'candidateId ve candidateName zorunludur.' });
        }
        if (!date || typeof date !== 'string') {
            return res.status(400).json({ error: 'Geçerli bir görüşme tarihi gerekli.' });
        }
        if (!VALID_INTERVIEW_TYPES.has(interviewType)) {
            return res.status(400).json({
                error: `interviewType şunlardan biri olmalı: ${[...VALID_INTERVIEW_TYPES].join(', ')}`,
            });
        }
        if (recruiterOutcome && !VALID_OUTCOMES.has(recruiterOutcome)) {
            return res.status(400).json({
                error: `recruiterOutcome şunlardan biri olmalı: ${[...VALID_OUTCOMES].join(', ')}`,
            });
        }
        const safeQuestions = Array.isArray(questions)
            ? questions
                  .filter((q) => q && typeof q.question === 'string' && q.question.trim())
                  .map((q) => ({
                      question: String(q.question).slice(0, 1000).trim(),
                      answer: String(q.answer || '').slice(0, 5000).trim(),
                  }))
            : [];
        const hasContent =
            safeQuestions.length > 0 ||
            (transcript && transcript.trim()) ||
            (notes && notes.trim());
        if (!hasContent) {
            return res.status(400).json({
                error: 'En az bir soru-cevap, transcript veya not girilmelidir.',
            });
        }

        // ── AI evaluation (Gemini)
        let aiAnalysis = null;
        try {
            const prompt = buildManualInterviewPrompt({
                positionTitle,
                candidateName,
                interviewType,
                date,
                time,
                questions: safeQuestions,
                transcript,
                notes,
            });
            const raw = (
                await generateText(prompt, {
                    generationConfig: {
                        temperature: 0,
                        topP: 0,
                        topK: 1,
                        maxOutputTokens: 4096,
                        responseMimeType: 'application/json',
                    },
                })
            )
                .replace(/```json|```/gi, '')
                .trim();
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                const clamp = (v) => Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
                const scoredQuestions = (parsed.questions || []).map((s) => ({
                    question: String(s.question || ''),
                    score: clamp(s.score),
                    rationale: String(s.rationale || ''),
                }));
                aiAnalysis = {
                    questions: scoredQuestions,
                    aggregateScore:
                        parsed.aggregateScore != null
                            ? clamp(parsed.aggregateScore)
                            : scoredQuestions.length > 0
                              ? Math.round(
                                    scoredQuestions.reduce((sum, q) => sum + q.score, 0) /
                                        scoredQuestions.length
                                )
                              : null,
                    summary: String(parsed.summary || ''),
                    recommendedOutcome: VALID_OUTCOMES.has(parsed.recommendedOutcome)
                        ? parsed.recommendedOutcome
                        : 'pending',
                };
            }
        } catch (err) {
            // AI eval failures don't block the record — recruiter still gets
            // their manually entered data saved. The UI shows "AI değerlendirme
            // başarısız" and the record can be re-evaluated later.
            log.warn({ err: err.message }, '[create-manual-interview] AI evaluation failed');
        }

        // ── Persist to /interviews/{sessionId}
        const sessionId = `mi-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        try {
            const sessionRef = db.doc(`interviews/${sessionId}`);
            const payload = {
                sessionId,
                mode: 'manual',
                candidateId,
                candidateName,
                positionId: positionId || null,
                positionTitle: positionTitle || null,
                interviewerId: req.user?.uid || null,
                interviewerName: interviewerName || req.user?.email || null,
                date,
                time: time || null,
                durationMinutes:
                    typeof durationMinutes === 'number' && durationMinutes > 0
                        ? Math.min(durationMinutes, 600)
                        : null,
                interviewType,
                questions: safeQuestions,
                transcript: typeof transcript === 'string' ? transcript.slice(0, 50000) : '',
                notes: typeof notes === 'string' ? notes.slice(0, 10000) : '',
                recruiterOutcome: recruiterOutcome || 'pending',
                aiAnalysis,
                status: 'completed',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                createdBy: req.user?.uid || null,
            };
            await sessionRef.set(payload);

            // Mirror onto candidate.interviewSessions[] so existing dashboard
            // & timeline UIs (which read off the candidate doc) pick it up
            // without changes.
            try {
                const candidateRef = db.doc(
                    `artifacts/talent-flow/public/data/candidates/${candidateId}`
                );
                await candidateRef.set(
                    {
                        interviewSessions: admin.firestore.FieldValue.arrayUnion({
                            id: sessionId,
                            mode: 'manual',
                            date,
                            time: time || null,
                            interviewType,
                            status: 'completed',
                            recruiterOutcome: recruiterOutcome || 'pending',
                            aggregateScore: aiAnalysis?.aggregateScore ?? null,
                            createdAt: new Date().toISOString(),
                        }),
                    },
                    { merge: true }
                );
            } catch (mirrorErr) {
                // Mirror is best-effort — the canonical record is /interviews/.
                log.warn(
                    { err: mirrorErr.message },
                    '[create-manual-interview] candidate mirror failed'
                );
            }

            log.info(
                {
                    sessionId,
                    candidateId,
                    aiOk: !!aiAnalysis,
                },
                '[create-manual-interview] created'
            );
            res.json({ sessionId, aiAnalysis });
        } catch (err) {
            log.error({ err: err.message }, '[create-manual-interview] Firestore write failed');
            res.status(500).json({ error: err.message });
        }
    }
);

export default router;
