// src/services/geminiService.js
// Gemini 2.5 Flash - CV Analysis & Scoring Engine
// Implements exponential backoff for API resilience

import { GoogleGenerativeAI } from '@google/generative-ai';

// ==================== CONFIGURATION ====================

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

const MODEL_ID = 'gemini-1.5-flash'; // Fallback default

// ==================== MODEL MANAGEMENT ====================

/**
 * Fetches available Gemini models from the API that support content generation.
 */
export async function getAvailableModels() {
    if (!API_KEY) return [];

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
        const data = await response.json();

        if (data.error) throw new Error(data.error.message);

        return (data.models || [])
            .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
            .map(m => ({
                id: m.name.replace('models/', ''),
                displayName: m.displayName || m.name.replace('models/', '')
            }))
            .sort((a, b) => {
                // Sort priority: pro > flash > others, latest versions first
                const score = (id) => {
                    let s = 0;
                    if (id.includes('1.5')) s += 10;
                    if (id.includes('2.0')) s += 20;
                    if (id.includes('pro')) s += 5;
                    if (id.includes('flash')) s += 4;
                    return s;
                };
                return score(b.id) - score(a.id);
            });
    } catch (error) {
        console.warn('[Gemini] Model fetch error, using defaults:', error);
        return [
            { id: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' },
            { id: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' },
            { id: 'gemini-pro', displayName: 'Gemini Pro (1.0)' },
        ];
    }
}

// ==================== EXPONENTIAL BACKOFF ====================
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000; // 1s, 2s, 4s, 8s, 16s

// ==================== EXPONENTIAL BACKOFF ====================

/**
 * Retries an async function with exponential backoff.
 * Delays: 1s → 2s → 4s → 8s → 16s (with jitter)
 */
async function withExponentialBackoff(fn, maxRetries = MAX_RETRIES) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Don't retry on non-retryable errors
            if (isNonRetryableError(error)) {
                console.error(`[Gemini] Non-retryable error:`, error.message);
                throw error;
            }

            if (attempt === maxRetries) {
                console.error(`[Gemini] Max retries (${maxRetries}) exceeded.`);
                throw error;
            }

            // Exponential backoff with jitter
            const delay = BASE_DELAY_MS * Math.pow(2, attempt);
            const jitter = delay * 0.2 * Math.random(); // ±20% jitter
            const totalDelay = delay + jitter;

            console.warn(
                `[Gemini] Attempt ${attempt + 1}/${maxRetries + 1} failed. ` +
                `Retrying in ${Math.round(totalDelay)}ms...`,
                error.message
            );

            await sleep(totalDelay);
        }
    }

    throw lastError;
}

function isNonRetryableError(error) {
    const message = error?.message?.toLowerCase() || '';
    // Don't retry auth errors, invalid requests, or missing API key
    return (
        message.includes('api_key_invalid') ||
        message.includes('permission_denied') ||
        message.includes('invalid argument') ||
        message.includes('api key not valid')
    );
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==================== GEMINI CLIENT ====================

let genAI = null;

function getModel(modelId = MODEL_ID) {
    if (!API_KEY) {
        throw new Error('Gemini API anahtarı bulunamadı.');
    }

    if (!genAI) {
        genAI = new GoogleGenerativeAI(API_KEY);
    }

    // Always create a new model instance to support changing modelId
    return genAI.getGenerativeModel({
        model: modelId,
        generationConfig: {
            temperature: 0.4,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
        },
    });
}

// ==================== ANALYSIS PROMPT ====================

function buildAnalysisPrompt(jobDescription, candidateProfile) {
    return `Sen otonom bir İşe Alım Ajanısın. Görevin sadece puanlama yapmak değil, adayın potansiyelini semantik olarak analize edip bir sonraki aksiyona karar vermektir.

## İŞ TANIMI (Job Description)
${jobDescription}

## ADAY PROFİLİ
${typeof candidateProfile === 'string' ? candidateProfile : JSON.stringify(candidateProfile, null, 2)}

## GÖREVLERİN & KURALLARIN

1. **Semantik Eşleştirme:** Adayın yeteneklerini (skills) sadece kelime bazlı eşleştirme. Eğer adayda doğrudan istenen yetenek yoksa ama benzer teknolojilerde (Transferable Skills) deneyimi varsa bunu pozitif değerlendir. (Örn: React yok ama Vue.js +5 yıl deneyim varsa, Frontend mantığını bildiği için puan ver).
2. **Otonom Karar Verme:** Analiz sonucuna göre bu aday için atılması gereken en mantıklı adımı (nextAction) belirle.
3. **Ajan Mantığı (Agent Logic):** Neden bu puanı verdiğini ve neden bu aksiyonu seçtiğini insani bir dille açıkla.

## ÇIKTI FORMATI (JSON)

Yanıtını aşağıdaki JSON yapısında ver:

{
  "score": <0-100 arası sayısal değer>,
  "agentReasoning": "<Ajanın düşünce süreci. Örn: 'Adayın doğrudan React deneyimi yok ancak Vue.js geçmişi çok güçlü (Transferable Skill). Temel CS bilgisi sağlam olduğu için teknik mülakata davet edilmeli.'>",
  "autonomousStatus": "<pending | action_taken | manual_review_required>",
  "nextAction": "<schedule_technical_interview | send_rejection | request_portfolio | send_offer | keep_in_pool>",
  
  "scoreBreakdown": {
    "technicalSkills": <0-100>,
    "experience": <0-100>,
    "industryFit": <0-100>,
    "softSkills": <0-100>
  },
  "topSkills": [
    { "skill": "...", "relevance": "..." }
  ],
  "gapAnalysis": [
    { "gap": "...", "severity": "...", "suggestion": "..." }
  ],
  "personalizedMessage": "<LinkedIn DM taslağı>",
  "summary": "<Kısa özet>",
  "recommendation": "<hire | strong_consider | consider | pass>"
}

ÖNEMLİ: Yanıtın SADECE geçerli JSON olmalı.`;
}

// ... (getModel function remains unchanged)

// ==================== MAIN ANALYSIS FUNCTION ====================

export async function analyzeCandidateMatch(jobDescription, candidateProfile, modelId) {
    if (!API_KEY) {
        throw new Error('Gemini API anahtarı bulunamadı.');
    }

    const prompt = buildAnalysisPrompt(jobDescription, candidateProfile);

    // Call Gemini API with exponential backoff
    const result = await withExponentialBackoff(async () => {
        const geminiModel = getModel(modelId); // Use passed modelId or default
        const result = await geminiModel.generateContent(prompt);
        const responseText = result.response.text();

        // Remove markdown formatting if present (```json ... ```)
        const cleanJson = responseText.replace(/```json|```/g, '').trim();

        try {
            return JSON.parse(cleanJson);
        } catch (e) {
            console.error('JSON Parse Error:', e);
            console.error('Raw Response:', responseText);
            throw new Error('AI yanıtı geçerli bir JSON formatında değildi.');
        }
    });

    // Validate the result structure
    validateAnalysisResult(result);

    return result;
}

function validateAnalysisResult(result) {
    if (typeof result.score !== 'number' || result.score < 0 || result.score > 100) {
        throw new Error('Geçersiz skor değeri. 0-100 arası bir sayı bekleniyor.');
    }

    if (!result.agentReasoning) {
        throw new Error('agentReasoning (Ajan Mantığı) alanı eksik.');
    }

    if (!result.nextAction) {
        throw new Error('nextAction (Sonraki Adım) alanı eksik.');
    }

    if (!Array.isArray(result.topSkills) || result.topSkills.length === 0) {
        throw new Error('topSkills alanı eksik veya boş.');
    }

    if (!Array.isArray(result.gapAnalysis)) {
        throw new Error('gapAnalysis alanı eksik.');
    }

    if (!result.personalizedMessage || typeof result.personalizedMessage !== 'string') {
        throw new Error('personalizedMessage alanı eksik.');
    }
}

// ==================== QUICK SCORE (Lightweight) ====================

/**
 * Quick scoring without full analysis - useful for batch operations.
 * Uses a simpler prompt for faster response.
 */
export async function quickScore(jobDescription, candidateProfile) {
    if (!API_KEY) {
        throw new Error('Gemini API anahtarı bulunamadı.');
    }

    const prompt = `Aşağıdaki iş tanımı ve aday profilini karşılaştır. SADECE 0-100 arası bir uyumluluk skoru ve 1 cümlelik özet ver.

İş Tanımı: ${jobDescription}

Aday: ${typeof candidateProfile === 'string' ? candidateProfile : JSON.stringify(candidateProfile)}

JSON formatında yanıt ver: {"score": <sayı>, "summary": "<1 cümle>"}`;

    const result = await withExponentialBackoff(async () => {
        const geminiModel = getModel();
        const response = await geminiModel.generateContent(prompt);
        const text = response.response.text();
        return JSON.parse(text);
    });

    return result;
}

// ==================== GENERATE DM ONLY ====================

/**
 * Generates only the personalized DM message for a candidate.
 */
export async function generatePersonalizedDM(candidateName, candidateSkills, jobTitle, companyName) {
    if (!API_KEY) {
        throw new Error('Gemini API anahtarı bulunamadı.');
    }

    const prompt = `LinkedIn Sales Navigator için profesyonel bir DM mesajı yaz.

Aday: ${candidateName}
Öne Çıkan Yetenekler: ${Array.isArray(candidateSkills) ? candidateSkills.join(', ') : candidateSkills}
Pozisyon: ${jobTitle}
Şirket: ${companyName || 'Şirketimiz'}

Mesaj "Merhabalar ${candidateName}," ile başlamalı.
${companyName || 'Şirketimiz'} şirketindeki ${jobTitle} pozisyonu için tecrübelerinin, özellikle belirli bir yeteneği konusundaki başarısının çok uygun olduğunu belirt.
Samimi, profesyonel ve ikna edici ol. 4-5 cümle yaz.

JSON formatında yanıt ver: {"message": "<mesaj metni>"}`;

    const result = await withExponentialBackoff(async () => {
        const geminiModel = getModel();
        const response = await geminiModel.generateContent(prompt);
        const text = response.response.text();
        return JSON.parse(text);
    });

    return result.message;
}

// ==================== PROFILE PARSING (SCRAPER) ====================

/**
 * Parses unstructured text (e.g., copied from LinkedIn) into a structured candidate object.
 */
export async function parseCandidateFromText(text, modelId) {
    if (!text || text.length < 50) {
        throw new Error('Metin çok kısa. Lütfen geçerli bir profil metni girin.');
    }

    const prompt = `Aşağıdaki metin bir LinkedIn profilinden veya CV'den kopyalanmıştır. Bu metni analiz et ve yapılandırılmış JSON formatına dönüştür. Eksik bilgileri "Belirtilmemiş" olarak işaretle veya boş bırak.
    
    METİN:
    ${text.substring(0, 10000)}

    İSTENEN JSON FORMATI:
    {
      "name": "Ad Soyad",
      "position": "Mevcut Pozisyon",
      "department": "Tahmini Departman (örn: Yazılım, Satış, İK)",
      "company": "Mevcut Şirket",
      "location": "Konum (Şehir, Ülke)",
      "email": "Varsa e-posta, yoksa boş string",
      "phone": "Varsa telefon, yoksa boş string",
      "skills": ["Yetenek 1", "Yetenek 2", ...],
      "experience": 5 (yıl olarak sayı, yoksa tahmin et),
      "education": "Son Eğitim Durumu (Okul ve Bölüm)",
      "about": "Kısa özet/hakkında yazısı (max 200 karakter)",
      "source": "LinkedIn Scraper"
    }
    
    Sadece geçerli JSON yanıtı ver.`;

    const result = await withExponentialBackoff(async () => {
        const geminiModel = getModel(modelId);
        const response = await geminiModel.generateContent(prompt);
        const responseText = response.response.text();

        try {
            // Clean markdown
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                responseText.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                return JSON.parse(jsonMatch[1] || jsonMatch[0]);
            }
            return JSON.parse(responseText);
        } catch (e) {
            throw new Error('Profil ayrıştırılamadı: ' + e.message);
        }
    });

    return result;
}

// ==================== HEALTH CHECK ====================

/**
 * Tests the Gemini API connection.
 */
export async function testGeminiConnection() {
    try {
        const geminiModel = getModel();
        const response = await geminiModel.generateContent('Merhaba, JSON ile {"status": "ok"} yanıtla.');
        const text = response.response.text();
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}') + 1;
        const parsed = JSON.parse(text.substring(start, end));
        return { connected: true, status: parsed.status || 'ok' };
    } catch (error) {
        return { connected: false, error: error.message };
    }
}
