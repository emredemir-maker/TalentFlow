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
import { createRequire } from 'module';

import { aiLimiter } from '../middleware/rateLimit.js';
import { getApiKeyDetailed, generateText } from '../services/gemini.js';
import { childLogger } from '../services/logger.js';
const log = childLogger('ai');

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

    try {
        // generateText() handles retry/backoff (4 attempts on 429/503) and
        // an in-memory LRU cache (1h TTL) keyed on SHA256(prompt + modelId +
        // generationConfig). Identical re-runs return instantly.
        const text = await generateText(prompt, {
            modelId,
            generationConfig: {
                temperature: responseMimeType === 'text/plain' ? 0.7 : 0,
                topP: responseMimeType === 'text/plain' ? 0.95 : 0,
                topK: responseMimeType === 'text/plain' ? 40 : 1,
                maxOutputTokens: tokenCap,
                responseMimeType,
            },
        });
        res.json({ text });
    } catch (err) {
        log.error(`[ai/generate] failed (key source=${keyInfo.source}):`, err?.message);
        res.status(500).json({ error: err?.message || 'AI request failed' });
    }
});

router.post('/api/ai/stt', aiLimiter, async (req, res) => {
    const { audio, mimeType = 'audio/webm' } = req.body || {};
    if (!audio || typeof audio !== 'string') {
        return res.status(400).json({ error: 'audio (base64) is required' });
    }

    try {
        // useCache: false — every audio chunk is unique, caching would just
        // grow the cache without ever hitting.
        const text = await generateText([
            { inlineData: { data: audio, mimeType } },
            `Bu ses dosyasını analiz et. YALNIZCA aşağıdaki JSON formatında yanıt döndür, başka hiçbir şey yazma:\n{"text":"türkçe transkript metni","stress":30,"excitement":70,"confidence":60,"hesitation":20}\nKurallar:\n- text: konuşulan Türkçe sözcükler. Konuşma yoksa boş string.\n- stress/excitement/confidence/hesitation: 0-100 tam sayı.\n- 'Sessizlik', 'Ses yok', 'Boş' gibi ifadeler text alanına YAZMA.`
        ], { useCache: false });
        res.json({ text });
    } catch (err) {
        log.error('STT Error:', err.message);
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
            log.info(`🎙️ STT (multipart) ${mimeType} ${(req.file.buffer.length / 1024).toFixed(1)}KB`);
        } else if (req.body?.audio) {
            // Path 2: base64 JSON (SettingsPage)
            audioBase64 = req.body.audio;
            mimeType = (req.body.mimeType || 'audio/webm').split(';')[0];
            const sizeKB = (audioBase64.length * 0.75 / 1024).toFixed(1);
            log.info(`🎙️ STT (base64) ${mimeType} ~${sizeKB}KB`);
        } else {
            return res.status(400).json({ error: 'Ses dosyası bulunamadı' });
        }

        // useCache: false — audio inputs are always unique
        const raw = (await generateText([
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
        ], { useCache: false })).trim();
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

        log.info(`✅ STT: "${text.substring(0, 60)}" | emotion: ${JSON.stringify(emotion)}`);
        res.json({ success: true, text, emotion });
    } catch (err) {
        log.error('💥 Gemini STT Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
