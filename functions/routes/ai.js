// AI proxy routes — every Gemini call goes through here so the API key
// never reaches the browser bundle. Rate-limited by aiLimiter (20 req/min/IP).
//
//   POST /api/ai/generate   — generic prompt-in, text-out (with retry/backoff
//                              on 429/503, configurable maxOutputTokens up to 32k,
//                              optional text/plain mimeType for free-form answers)
//   POST /api/ai/stt        — base64 audio → transcript + emotion JSON
//   POST /api/gemini-stt    — same as above but accepts multipart/form-data uploads
//                              (LiveInterviewPage path) and base64 JSON
//                              (SettingsPage mic test path) interchangeably
import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createRequire } from 'module';

import { aiLimiter } from '../middleware/rateLimit.js';
import { getApiKey, getApiKeyDetailed } from '../services/gemini.js';

const require = createRequire(import.meta.url);
const multer = require('multer');

const router = Router();

router.post('/api/ai/generate', aiLimiter, async (req, res) => {
    const { prompt, modelId = 'gemini-2.5-flash', mimeType, maxOutputTokens } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'prompt is required' });
    }

    const keyInfo = await getApiKeyDetailed();
    if (!keyInfo.key) {
        return res.status(503).json({
            error: 'AI servisi kullanılamıyor — API anahtarı yok (Settings → API ekranından kaydedin).',
        });
    }

    const responseMimeType = mimeType === 'text/plain' ? 'text/plain' : 'application/json';

    // CV parsing and similar tasks return large structured JSON; default 8192
    // gives enough room while still capping run-away outputs. Caller may
    // override with an explicit `maxOutputTokens` field (clamped to 32k).
    const tokenCap = Math.min(Math.max(parseInt(maxOutputTokens, 10) || 8192, 512), 32768);

    const genAI = new GoogleGenerativeAI(keyInfo.key);
    const model = genAI.getGenerativeModel({
        model: modelId,
        generationConfig: {
            temperature: responseMimeType === 'text/plain' ? 0.7 : 0,
            topP: responseMimeType === 'text/plain' ? 0.95 : 0,
            topK: responseMimeType === 'text/plain' ? 40 : 1,
            maxOutputTokens: tokenCap,
            responseMimeType,
        },
    });

    // Retry on 429/503 with exponential backoff (paid tier still has RPM limits).
    const MAX_RETRIES = 4;
    let lastErr = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const result = await model.generateContent(prompt);
            return res.json({ text: result.response.text() });
        } catch (err) {
            lastErr = err;
            const msg = err.message || '';
            const isTransient = /429|RESOURCE_EXHAUSTED|quota|503|UNAVAILABLE|overloaded/i.test(msg);
            if (!isTransient || attempt === MAX_RETRIES) break;
            const backoffMs = Math.min(1000 * Math.pow(2, attempt), 16000) + Math.floor(Math.random() * 500);
            console.warn(`[ai/generate] transient (attempt ${attempt + 1}/${MAX_RETRIES + 1}), backoff ${backoffMs}ms: ${msg.slice(0, 120)}`);
            await new Promise(r => setTimeout(r, backoffMs));
        }
    }

    console.error(`[ai/generate] failed (key source=${keyInfo.source}):`, lastErr?.message);
    res.status(500).json({
        error: lastErr?.message || 'AI request failed',
    });
});

router.post('/api/ai/stt', aiLimiter, async (req, res) => {
    const { audio, mimeType = 'audio/webm' } = req.body || {};
    if (!audio || typeof audio !== 'string') {
        return res.status(400).json({ error: 'audio (base64) is required' });
    }

    const apiKey = await getApiKey();
    if (!apiKey) return res.status(503).json({ error: 'AI service unavailable' });

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent([
            { inlineData: { data: audio, mimeType } },
            `Bu ses dosyasını analiz et. YALNIZCA aşağıdaki JSON formatında yanıt döndür, başka hiçbir şey yazma:\n{"text":"türkçe transkript metni","stress":30,"excitement":70,"confidence":60,"hesitation":20}\nKurallar:\n- text: konuşulan Türkçe sözcükler. Konuşma yoksa boş string.\n- stress/excitement/confidence/hesitation: 0-100 tam sayı.\n- 'Sessizlik', 'Ses yok', 'Boş' gibi ifadeler text alanına YAZMA.`
        ]);
        res.json({ text: result.response.text() });
    } catch (err) {
        console.error('STT Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Accepts both multipart/form-data (LiveInterviewPage) and base64 JSON (SettingsPage)
const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.post('/api/gemini-stt', aiLimiter, (req, res, next) => {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('multipart/form-data')) {
        audioUpload.single('audio')(req, res, next);
    } else {
        next();
    }
}, async (req, res) => {
    try {
        let audioBase64, mimeType;

        if (req.file) {
            // Path 1: multipart upload (LiveInterviewPage)
            audioBase64 = req.file.buffer.toString('base64');
            mimeType = (req.file.mimetype || 'audio/webm').split(';')[0];
            console.log(`🎙️ STT (multipart) ${mimeType} ${(req.file.buffer.length / 1024).toFixed(1)}KB`);
        } else if (req.body?.audio) {
            // Path 2: base64 JSON (SettingsPage)
            audioBase64 = req.body.audio;
            mimeType = (req.body.mimeType || 'audio/webm').split(';')[0];
            const sizeKB = (audioBase64.length * 0.75 / 1024).toFixed(1);
            console.log(`🎙️ STT (base64) ${mimeType} ~${sizeKB}KB`);
        } else {
            return res.status(400).json({ error: 'Ses dosyası bulunamadı' });
        }

        const apiKey = await getApiKey();
        if (!apiKey) return res.status(500).json({ error: 'Gemini API Key eksik' });

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const result = await model.generateContent([
            { inlineData: { data: audioBase64, mimeType } },
            `Bu ses dosyasını analiz et. YALNIZCA aşağıdaki JSON formatında yanıt döndür, başka hiçbir şey yazma:
{"text":"türkçe transkript metni","stress":30,"excitement":70,"confidence":60,"hesitation":20}
Kurallar:
- text: konuşulan Türkçe sözcükler. Konuşma yoksa boş string.
- stress: stres/gerginlik seviyesi 0-100
- excitement: heyecan/coşku seviyesi 0-100
- confidence: özgüven/kararlılık seviyesi 0-100
- hesitation: tereddüt/dolgu sesi seviyesi 0-100
- Skorlar 0-100 arası tam sayı olmalı.
- 'Sessizlik', 'Ses yok', 'Boş' gibi ifadeler text alanına YAZMA.`
        ]);

        const raw = result.response.text().trim();
        let text = raw;
        let emotion = null;
        try {
            const m = raw.match(/\{[\s\S]*\}/);
            if (m) {
                const parsed = JSON.parse(m[0]);
                text = typeof parsed.text === 'string' ? parsed.text : '';
                emotion = {
                    stress: Math.min(100, Math.max(0, parseInt(parsed.stress) || 0)),
                    excitement: Math.min(100, Math.max(0, parseInt(parsed.excitement) || 0)),
                    confidence: Math.min(100, Math.max(0, parseInt(parsed.confidence) || 0)),
                    hesitation: Math.min(100, Math.max(0, parseInt(parsed.hesitation) || 0)),
                };
            }
        } catch { /* fallback: use raw as text */ }

        console.log(`✅ STT: "${text.substring(0, 60)}" | emotion: ${JSON.stringify(emotion)}`);
        res.json({ success: true, text, emotion });
    } catch (err) {
        console.error('💥 Gemini STT Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
