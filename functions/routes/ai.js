// AI proxy routes — every Gemini call goes through here so the API key
// never reaches the browser bundle. Rate-limited by aiLimiter (20 req/min/IP).
//
//   POST /api/ai/generate   — generic prompt-in, text-out (with retry/backoff
//                              on 429/503, configurable maxOutputTokens up to 32k,
//                              optional text/plain mimeType for free-form answers,
//                              optional whitelisted `thinking` preset; canlı mülakat
//                              etiketleri mülakat başına saatlik kotaya tabi)
//   POST /api/ai/stt        — base64 audio → transcript + emotion JSON
//   POST /api/gemini-stt    — same as above but accepts multipart/form-data uploads
//                              (LiveInterviewPage path) and base64 JSON
//                              (SettingsPage mic test path) interchangeably
//   GET  /api/ai/stt-config — istemciye Gemini ses yedeğinin açık olup olmadığını söyler
//
// Ses kabul eden iki uç da requireAudioFallback arkasında: anahtar kapalıyken
// (varsayılan) 403 döner ve Gemini'ye hiç gidilmez. Bkz. services/audioFallback.js.
import { Router } from 'express';
import { createRequire } from 'module';

import { aiLimiter } from '../middleware/rateLimit.js';
import { verifyFirebaseToken } from '../middleware/auth.js';
import { wrapMulter } from '../middleware/multipart.js';
import { getApiKeyDetailed, generateText, generateGrounded } from '../services/gemini.js';
import { childLogger } from '../services/logger.js';
import { isAudioFallbackEnabled, requireAudioFallback } from '../services/audioFallback.js';
import { consumeInterviewQuota, isValidInterviewId, LIVE_LABEL_KIND } from '../services/interviewAiQuota.js';
const log = childLogger('ai');

const require = createRequire(import.meta.url);
const multer = require('multer');

const router = Router();

// verifyFirebaseToken: anonim oturumlar da geçer (başvuru formu ve canlı
// mülakat adayı anon Firebase oturumuyla gelir) — ama tokensız dış çağrılar
// (açık Gemini proxy kötüye kullanımı) 401 alır.
// DÜŞÜNME AYARI YALNIZ BU LİSTEDEN. İstemci ham bir `thinkingConfig` nesnesi
// gönderebilseydi bütçeyi istediği kadar büyütebilirdi; düşünme token'ları
// çıktı fiyatından faturalanıyor. İstemci yalnızca bir ad seçer, değeri
// sunucu belirler. Bilinmeyen ad yok sayılır (modelin varsayılanı kalır).
export const THINKING_PRESETS = {
    low: { thinkingBudget: 512 },
};

/** Beyaz listedeki ön ayarı döndürür; geri kalan her şey için undefined. */
export function resolveThinkingConfig(raw) {
    if (typeof raw !== 'string') return undefined;
    return Object.prototype.hasOwnProperty.call(THINKING_PRESETS, raw) ? { ...THINKING_PRESETS[raw] } : undefined;
}

// Canlı mülakat çağrılarının çıktı tavanı. Kart güncellemesi kısa bir JSON;
// istemci zaten 1024 istiyor ama tavan sunucuda da sabit — değiştirilmiş bir
// istemci 32k isteyip saatte 20 pahalı çağrı yapamasın.
export const LIVE_MAX_OUTPUT_TOKENS = 1024;

router.post('/api/ai/generate', aiLimiter, verifyFirebaseToken, async (req, res) => {
    const { prompt, modelId = 'gemini-2.5-flash', mimeType, maxOutputTokens, label, thinking, interviewId } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'prompt is required' });
    }

    // CANLI MÜLAKAT ETİKETLERİ KOTALI. Bkz. services/interviewAiQuota.js.
    // Not: bu kota dürüst etiketli çağrıyı korur; etiketi değiştiren bir
    // istemci genel frenlere (aiLimiter + bütçe freni) düşer.
    const liveKind = typeof label === 'string' ? LIVE_LABEL_KIND[label] : undefined;
    if (liveKind) {
        // Canlı analiz mülakatçı ekranının işi; aday (anonim oturum) bu
        // çağrıları yapmaz.
        if (!req.authUser || req.authUser.provider === 'anonymous') {
            return res.status(403).json({ error: 'Canlı analiz yalnızca mülakatçı oturumuyla yapılabilir.' });
        }
        if (!isValidInterviewId(interviewId)) {
            return res.status(400).json({ error: 'interviewId gerekli' });
        }
        const quota = await consumeInterviewQuota({ interviewId, kind: liveKind });
        if (!quota.allowed) {
            if (quota.reason === 'not_found') {
                return res.status(404).json({ error: 'Mülakat bulunamadı' });
            }
            return res.status(429).json({
                code: 'INTERVIEW_AI_LIMIT',
                kind: liveKind,
                error: liveKind === 'analysis'
                    ? 'Bu mülakat için saatlik canlı analiz sınırına ulaşıldı.'
                    : 'Bu mülakat için saatlik takip sorusu sınırına ulaşıldı.',
            });
        }
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
    const requestedCap = Math.min(Math.max(parseInt(maxOutputTokens, 10) || 8192, 512), 32768);
    const tokenCap = liveKind ? Math.min(requestedCap, LIVE_MAX_OUTPUT_TOKENS) : requestedCap;
    // Canlı çağrıda düşünme her zaman düşük; diğerlerinde istenirse.
    const thinkingConfig = resolveThinkingConfig(liveKind ? 'low' : thinking);

    try {
        // generateText() handles retry/backoff (4 attempts on 429/503) and
        // an in-memory LRU cache (1h TTL) keyed on SHA256(prompt + modelId +
        // generationConfig). Identical re-runs return instantly.
        const text = await generateText(prompt, {
            modelId,
            // Hangi özellik? Etiketsiz ölçüm "toplam şu kadar" der ve hiçbir
            // karar vermeye yaramaz; asıl soru hangi ekranın ne yaktığı.
            label,
            generationConfig: {
                temperature: responseMimeType === 'text/plain' ? 0.7 : 0,
                topP: responseMimeType === 'text/plain' ? 0.95 : 0,
                topK: responseMimeType === 'text/plain' ? 40 : 1,
                maxOutputTokens: tokenCap,
                responseMimeType,
                ...(thinkingConfig ? { thinkingConfig } : {}),
            },
        });
        res.json({ text });
    } catch (err) {
        log.error({ err: err?.message, modelId, label, anahtarKaynagi: keyInfo.source }, '[ai/generate] başarısız');
        res.status(500).json({ error: err?.message || 'AI request failed' });
    }
});

// Grounded question answering — Gemini + Google Search.
//
// /api/ai/generate answers from the model's memory. This one searches and
// returns the sources it used, so the UI can show where a claim came from.
// Kept separate because the response shape differs (text + sources) and
// because grounded calls are slower and cost more: the caller opts in.
router.post('/api/ai/ask', aiLimiter, verifyFirebaseToken, async (req, res) => {
    const { prompt, modelId = 'gemini-2.5-flash', maxOutputTokens } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'prompt is required' });
    }

    const keyInfo = await getApiKeyDetailed();
    if (!keyInfo.key) {
        return res.status(503).json({
            error: 'AI servisi kullanılamıyor — API anahtarı yok (Settings → API ekranından kaydedin).',
        });
    }

    // Bu uç kısa açıklamalar için; uzun metin istenirse maliyet ve gecikme
    // hızla artar. Ama TAVAN 2048 CANLIDA YETMEDİ ve arıza sessizdi:
    //
    // Gemini 2.5'te DÜŞÜNME TOKEN'LARI da çıktı bütçesinden yeniyor. Piyasa
    // araştırması gibi arama yapan bir çağrıda düşünme payı tek başına tavanı
    // doldurabiliyor; cevap yarıda kesiliyor. Kesilen cevapta yalnızca metin
    // eksik kalmıyor — GROUNDING METADATA DA BOŞ geliyor, yani kaynak listesi
    // boşalıyor. Kaynaksız cevabı gizleyen kural devreye giriyor ve kullanıcı
    // "kaynaklı bant bulunamadı" görüyor. Görünen belirti ile sebep arasında
    // hiçbir bağ yok.
    //
    // Tavan bir HEDEF değil sınır: kısa cevaplar yine kısa üretiliyor,
    // yalnızca kesilme ihtimali kalkıyor.
    const tokenCap = Math.min(Math.max(parseInt(maxOutputTokens, 10) || 2048, 256), 8192);

    try {
        const result = await generateGrounded(prompt, { modelId, maxOutputTokens: tokenCap });
        res.json(result);
    } catch (err) {
        log.error({ err: err?.message, modelId, anahtarKaynagi: keyInfo.source }, '[ai/ask] başarısız');
        res.status(500).json({ error: err?.message || 'AI request failed' });
    }
});

// İstemci, Web Speech olmayan tarayıcıda yedeği başlatmadan önce bunu sorar.
// Kapalıysa "Bu özellik için Chrome kullanın" gösterir. Asıl koruma yine
// sunucudadır: bu uç yalnızca gereksiz istekleri baştan önlemek için.
router.get('/api/ai/stt-config', verifyFirebaseToken, (req, res) => {
    res.json({ audioFallbackEnabled: isAudioFallbackEnabled() });
});

router.post('/api/ai/stt', aiLimiter, verifyFirebaseToken, requireAudioFallback, async (req, res) => {
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
        log.error({ err: err.message }, 'STT Error');
        res.status(500).json({ error: err.message });
    }
});

// Accepts both multipart/form-data (LiveInterviewPage) and base64 JSON (SettingsPage)
const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.post('/api/gemini-stt', aiLimiter, verifyFirebaseToken, requireAudioFallback, (req, res, next) => {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('multipart/form-data')) {
        wrapMulter(audioUpload.single('audio'))(req, res, next);
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
        log.error({ err: err.message }, '💥 Gemini STT Error');
        res.status(500).json({ error: err.message });
    }
});

export default router;
