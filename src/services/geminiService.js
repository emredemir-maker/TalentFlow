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
    return `Sen uzman bir İK analizcisisin. Aşağıdaki iş tanımı ile aday profilini karşılaştırarak detaylı bir uyumluluk analizi yapman gerekiyor.

## İŞ TANIMI
${jobDescription}

## ADAY PROFİLİ
${typeof candidateProfile === 'string' ? candidateProfile : JSON.stringify(candidateProfile, null, 2)}

## TALİMATLAR

1. İş tanımının gerektirdiği yetkinlikler ile adayın profili arasında detaylı bir analiz yap.
2. 0-100 arası bir uyumluluk skoru (matchScore) hesapla. Puanlama kriterleri:
   - Teknik beceri eşleşmesi: %35
   - Deneyim yılı ve seviyesi: %25
   - Sektör/alan uyumu: %20
   - Yumuşak beceriler ve kültürel uyum: %20
3. En iyi eşleşen 3 yeteneği belirle.
4. Adayın eksik olduğu noktaları (gap) analiz et.
5. LinkedIn Sales Navigator için kişiselleştirilmiş bir DM taslağı oluştur.

## ÇIKTI FORMATI

Yanıtını aşağıdaki JSON formatında ver:

{
  "score": <0-100 arası sayısal değer>,
  "scoreBreakdown": {
    "technicalSkills": <0-100>,
    "experience": <0-100>,
    "industryFit": <0-100>,
    "softSkills": <0-100>
  },
  "topSkills": [
    {
      "skill": "<yetenek adı>",
      "relevance": "<neden önemli - kısa açıklama>"
    },
    {
      "skill": "<yetenek adı>",
      "relevance": "<neden önemli - kısa açıklama>"
    },
    {
      "skill": "<yetenek adı>",
      "relevance": "<neden önemli - kısa açıklama>"
    }
  ],
  "gapAnalysis": [
    {
      "gap": "<eksik yetkinlik>",
      "severity": "<critical | moderate | minor>",
      "suggestion": "<bu açığı kapatmak için öneri>"
    }
  ],
  "personalizedMessage": "<Sales Navigator DM taslağı. Format: 'Merhabalar [Adayın Adı], [Şirket/Pozisyon] pozisyonu için tecrübelerinizin, özellikle [X yeteneği] konusundaki başarınızın çok uygun olduğunu gördüm...' şeklinde başlamalı. Samimi, profesyonel ve ikna edici olmalı. En az 3 cümle.>",
  "summary": "<2-3 cümlelik genel değerlendirme>",
  "recommendation": "<hire | strong_consider | consider | pass>"
}

ÖNEMLİ: Yanıtın SADECE geçerli JSON olmalı, başka metin olmamalı.`;
}

// ==================== MAIN ANALYSIS FUNCTION ====================

/**
 * Analyzes a candidate profile against a job description.
 * 
 * @param {string} jobDescription - The job posting/description text
 * @param {string|object} candidateProfile - The candidate's CV/profile data
 * @param {string} [modelId] - Specific model ID to use
 */
export async function analyzeCandidateMatch(jobDescription, candidateProfile, modelId) {
    if (!jobDescription?.trim()) throw new Error('İş tanımı boş olamaz.');
    if (!candidateProfile) throw new Error('Aday profili boş olamaz.');

    const prompt = buildAnalysisPrompt(jobDescription, candidateProfile);

    return withExponentialBackoff(async () => {
        const geminiModel = getModel(modelId);
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Parse JSON response
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (parseErr) {
            // Updated regex to better handle markdown code blocks
            const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                text.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
            } else {
                throw new Error('Gemini yanıtı geçerli JSON formatında değil: ' + text.substring(0, 50) + '...');
            }
        }

        validateAnalysisResult(parsed);
        return parsed;
    });
}

/**
 * Validates the analysis result has all required fields.
 */
function validateAnalysisResult(result) {
    if (typeof result.score !== 'number' || result.score < 0 || result.score > 100) {
        throw new Error('Geçersiz skor değeri. 0-100 arası bir sayı bekleniyor.');
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
