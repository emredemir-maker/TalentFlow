// Application-screening AI helpers — three thin Gemini-backed endpoints used
// by the position editor and the candidate apply flow.
//
//   POST /api/score-screening-answers     — rate a candidate's answers 0-100
//   POST /api/suggest-screening-questions — propose up to 5 position-specific Qs
//   POST /api/improve-screening-question  — rewrite a draft Q for clarity
//
// All three keep the API key server-side and are gated by aiLimiter.
import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { aiLimiter } from '../middleware/rateLimit.js';
import { getApiKey } from '../services/gemini.js';

const router = Router();

router.post('/api/score-screening-answers', aiLimiter, async (req, res) => {
    const { positionTitle, answers } = req.body || {};
    if (!Array.isArray(answers) || answers.length === 0) {
        return res.status(400).json({ error: 'answers[] is required.' });
    }
    const apiKey = await getApiKey();
    if (!apiKey) return res.status(503).json({ error: 'AI service unavailable.' });

    const qaPairs = answers.map((a, i) => `Soru ${i + 1}: ${a.question}\nCevap: ${a.answer || '(boş)'}`).join('\n\n');
    const prompt = `Sen bir İK uzmanısın. Aşağıdaki pozisyon ön eleme sorularını ve adayın cevaplarını değerlendir.\n\nPozisyon: ${positionTitle || 'Genel Pozisyon'}\n\n${qaPairs}\n\nHer soru için 0-100 arası bir puan ver ve kısa Türkçe bir gerekçe yaz. Yanıtını YALNIZCA şu JSON formatında ver (başka hiçbir şey yazma):\n{"scores":[{"question":"...","score":85,"rationale":"..."}],"aggregateScore":85,"summary":"Kısa genel değerlendirme"}`;
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent(prompt);
        const rawText = result.response.text().replace(/```json|```/gi, '').trim();
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
        console.error('[score-screening-answers] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/suggest-screening-questions', aiLimiter, async (req, res) => {
    const { positionTitle, requirements } = req.body || {};
    if (!positionTitle && !requirements) {
        return res.status(400).json({ error: 'positionTitle or requirements is required.' });
    }
    const apiKey = await getApiKey();
    if (!apiKey) return res.status(503).json({ error: 'AI service unavailable.' });

    const prompt = `Sen bir kıdemli İK uzmanısın. Aşağıdaki pozisyon için başvuru formunda adaylara sorulacak en fazla 5 adet ön eleme sorusu öner. Sorular kısa, net ve pozisyona özel olmalı.\n\nPozisyon: ${positionTitle || 'Genel Pozisyon'}\nGereksinimler: ${requirements || ''}\n\nYalnızca şu JSON formatında yanıt ver (başka hiçbir şey yazma):\n{"questions": ["Soru 1", "Soru 2", "Soru 3"]}`;
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent(prompt);
        const rawText = result.response.text().replace(/```json|```/gi, '').trim();
        const match = rawText.match(/\{[\s\S]*\}/);
        if (!match) return res.status(500).json({ error: 'AI response could not be parsed.' });
        const parsed = JSON.parse(match[0]);
        const questions = (parsed.questions || []).slice(0, 5).filter(q => q && q.trim());
        res.json({ questions });
    } catch (err) {
        console.error('[suggest-screening-questions] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/improve-screening-question', aiLimiter, async (req, res) => {
    const { question, positionTitle, requirements } = req.body || {};
    if (!question?.trim()) return res.status(400).json({ error: 'question is required.' });
    const apiKey = await getApiKey();
    if (!apiKey) return res.status(503).json({ error: 'AI service unavailable.' });
    const prompt = `Sen bir kıdemli İK uzmanısın. Aşağıdaki ön eleme sorusunu daha net, profesyonel ve ölçülebilir hale getir. Soruyu kısalt, anlaşılırlığını artır ve pozisyonla ilişkisini güçlendir.\n\nPozisyon: ${positionTitle || 'Genel Pozisyon'}\nGereksinimler: ${requirements || ''}\nMevcut soru: ${question}\n\nYalnızca şu JSON formatında yanıt ver (başka hiçbir şey yazma):\n{"improved": "Düzenlenmiş soru metni"}`;
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent(prompt);
        const rawText = result.response.text().replace(/```json|```/gi, '').trim();
        const match = rawText.match(/\{[\s\S]*\}/);
        if (!match) return res.status(500).json({ error: 'AI response could not be parsed.' });
        const parsed = JSON.parse(match[0]);
        res.json({ improved: parsed.improved || question });
    } catch (err) {
        console.error('[improve-screening-question] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
