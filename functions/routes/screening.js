// Application-screening AI helpers — three thin Gemini-backed endpoints used
// by the position editor and the candidate apply flow.
//
//   POST /api/score-screening-answers     — rate a candidate's answers 0-100
//   POST /api/suggest-screening-questions — propose up to 5 position-specific Qs
//   POST /api/improve-screening-question  — rewrite a draft Q for clarity
//
// All three keep the API key server-side and are gated by aiLimiter.
import { Router } from 'express';

import { aiLimiter } from '../middleware/rateLimit.js';
import { verifyFirebaseToken, requireAuth } from '../middleware/auth.js';
import { generateText } from '../services/gemini.js';
import { buildStructuredPrompt, sanitizeForPrompt } from '../services/promptGuard.js';
import { childLogger } from '../services/logger.js';
const log = childLogger('screening');

const router = Router();

// Başvuru formu (anon oturum) çağırır → verifyFirebaseToken yeterli.
router.post('/api/score-screening-answers', aiLimiter, verifyFirebaseToken, async (req, res) => {
    const { positionTitle, answers } = req.body || {};
    if (!Array.isArray(answers) || answers.length === 0) {
        return res.status(400).json({ error: 'answers[] is required.' });
    }

    // Cevaplar aday tarafından yazılır (halka açık başvuru formu) — puanı
    // dayatmaya çalışan enjeksiyon denemelerine karşı veri bloğuna alınır.
    const qaPairs = answers
        .map((a, i) => `Soru ${i + 1}: ${sanitizeForPrompt(a.question, 2000)}\nCevap: ${sanitizeForPrompt(a.answer, 4000) || '(boş)'}`)
        .join('\n\n');
    const prompt = buildStructuredPrompt(
        'Sen bir İK uzmanısın. SORU_CEVAPLAR bloğundaki pozisyon ön eleme sorularını ve adayın cevaplarını değerlendir. Her soru için 0-100 arası bir puan ver ve kısa Türkçe bir gerekçe yaz. Yanıtını YALNIZCA şu JSON formatında ver (başka hiçbir şey yazma):\n{"scores":[{"question":"...","score":85,"rationale":"..."}],"aggregateScore":85,"summary":"Kısa genel değerlendirme"}',
        { POZISYON: positionTitle || 'Genel Pozisyon', SORU_CEVAPLAR: qaPairs }
    );
    try {
        const rawText = (await generateText(prompt)).replace(/```json|```/gi, '').trim();
        const match = rawText.match(/\{[\s\S]*\}/);
        if (!match) return res.status(500).json({ error: 'AI response could not be parsed.' });
        const parsed = JSON.parse(match[0]);
        const clamp = (v) => Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
        const scores = (parsed.scores || []).map(s => ({
            question: String(s.question || ''),
            score: clamp(s.score),
            rationale: String(s.rationale || ''),
        }));
        const aggregateScore = parsed.aggregateScore != null
            ? clamp(parsed.aggregateScore)
            : (scores.length > 0 ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length) : null);
        res.json({ scores, aggregateScore, summary: parsed.summary || '' });
    } catch (err) {
        log.error('[score-screening-answers] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Pozisyon editörü (recruiter) çağırır → rol kapısı.
router.post('/api/suggest-screening-questions', aiLimiter, requireAuth(), async (req, res) => {
    const { positionTitle, requirements } = req.body || {};
    if (!positionTitle && !requirements) {
        return res.status(400).json({ error: 'positionTitle or requirements is required.' });
    }

    const prompt = buildStructuredPrompt(
        'Sen bir kıdemli İK uzmanısın. POZISYON ve GEREKSINIMLER bloklarındaki pozisyon için başvuru formunda adaylara sorulacak en fazla 5 adet ön eleme sorusu öner. Sorular kısa, net ve pozisyona özel olmalı.\n\nYalnızca şu JSON formatında yanıt ver (başka hiçbir şey yazma):\n{"questions": ["Soru 1", "Soru 2", "Soru 3"]}',
        { POZISYON: positionTitle || 'Genel Pozisyon', GEREKSINIMLER: requirements || '' }
    );
    try {
        const rawText = (await generateText(prompt)).replace(/```json|```/gi, '').trim();
        const match = rawText.match(/\{[\s\S]*\}/);
        if (!match) return res.status(500).json({ error: 'AI response could not be parsed.' });
        const parsed = JSON.parse(match[0]);
        const questions = (parsed.questions || []).slice(0, 5).filter(q => q && q.trim());
        res.json({ questions });
    } catch (err) {
        log.error('[suggest-screening-questions] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/improve-screening-question', aiLimiter, requireAuth(), async (req, res) => {
    const { question, positionTitle, requirements } = req.body || {};
    if (!question?.trim()) return res.status(400).json({ error: 'question is required.' });
    const prompt = buildStructuredPrompt(
        'Sen bir kıdemli İK uzmanısın. MEVCUT_SORU bloğundaki ön eleme sorusunu daha net, profesyonel ve ölçülebilir hale getir. Soruyu kısalt, anlaşılırlığını artır ve pozisyonla ilişkisini güçlendir.\n\nYalnızca şu JSON formatında yanıt ver (başka hiçbir şey yazma):\n{"improved": "Düzenlenmiş soru metni"}',
        {
            POZISYON: positionTitle || 'Genel Pozisyon',
            GEREKSINIMLER: requirements || '',
            MEVCUT_SORU: question,
        }
    );
    try {
        const rawText = (await generateText(prompt)).replace(/```json|```/gi, '').trim();
        const match = rawText.match(/\{[\s\S]*\}/);
        if (!match) return res.status(500).json({ error: 'AI response could not be parsed.' });
        const parsed = JSON.parse(match[0]);
        res.json({ improved: parsed.improved || question });
    } catch (err) {
        log.error('[improve-screening-question] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
