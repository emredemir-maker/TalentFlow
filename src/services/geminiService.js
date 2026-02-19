// src/services/geminiService.js
// Gemini 2.5 Flash - CV Analysis & Scoring Engine
// Implements exponential backoff for API resilience

import { GoogleGenerativeAI } from '@google/generative-ai';

// ==================== CONFIGURATION ====================

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

const MODEL_ID = 'gemini-2.0-flash'; // Updated from gemini-1.5-flash based on available models list

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
            { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash' },
            { id: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' },
            { id: 'gemini-2.0-pro-exp', displayName: 'Gemini 2.0 Pro Exp' },
            { id: 'gemini-pro', displayName: 'Gemini Pro' },
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

// ==================== THE UNIFIED BRAIN (Core Prompt) ====================

const RECRUITER_BRAIN_CORE = `
Sen otonom bir İşe Alım Ajanısın (Autonomous Talent Agent). Görevin, adayın potansiyelini "Çok Boyutlu Semantik Analiz" (Multi-Dimensional Semantic Analysis) yöntemiyle değerlendirmektir.

TEMEL GÖREVLERİN:
1. **Bağlamsal Filtreleme (Contextual Filtering):** Sadece "React" kelimesinin geçmesine bakma. Adayın bu beceriyi hangi bağlamda, ne kadar süreyle ve hangi seviyede kullandığını analiz et. "Hobi projesi" ile "Production-grade enterprise proje" arasındaki farkı gözet.
2. **Kariyer İvmesi (Career Velocity):** Adayın terfi sıklığını, sorumluluk artışını ve etki alanını değerlendir. Hızlı yükselen profillere (High Potential) ek puan ver.
3. **Rol Tutarlılığı (Role Consistency):** Eğer "Senior Backend" ilanı için bir "Frontend Developer" CV'si gelmişse ve adayın belirgin bir Full-Stack geçmişi veya güçlü bir Backend geçiş hikayesi yoksa, SKORU ACIMASIZCA DÜŞÜR (%40 altı). Unvan uyumsuzluklarını affetme.
4. **Aktarılabilir Yetenekler (Transferable Skills Matrix):** Doğrudan eşleşme yoksa (örn: AWS isteniyor, Azure var) bunu pozitif "Side-Step" olarak değerlendir, ANCAK alan dışı (Frontend -> Backend) geçişleri "Transferable" olarak görme.
5. **Kayıp Veri Tamamlama (Implicit Fact Extraction):** Aday "Next.js" yazmışsa, onun "React" ve "Node.js" bildiğini varsay. "Kubernetes" yönetmişse "Docker" bildiğini varsay.

PUANLAMA MATRİSİ:
- **%90-100 (Unicorn):** Hem teknik, hem kültürel, hem de potansiyel olarak kusursuz. Liderlik veya inisiyatif alma örnekleri var.
- **%75-89 (Strong Hire):** Temel gereksinimlerin tamamını karşılıyor, öğrenebilir eksikleri var.
- **%60-74 (Maybe):** Önemli eksikler var veya alan değişikliği yapıyor. Riskli ama yetenekli.
- **%0-59 (No Hire):** Temel yetkinlik veya rol uyumsuzluğu. "Senior" ilana "Junior" başvurusu veya tamamen alakasız alan.

DİL KURALI: Girdi ne olursa olsun, ÇIKTI KESİNLİKLE NİTELİKLİ VE PROFESYONEL TÜRKÇE OLMALIDIR.
`;

function buildAnalysisPrompt(jobDescription, candidateProfile) {
    return `${RECRUITER_BRAIN_CORE}

## ANALİZ GÖREVİ
Aşağıdaki aday profilini, mevcut İŞ TANIMI ile karşılaştır.

## İŞ TANIMI
${jobDescription}

## ADAY PROFİLİ
${typeof candidateProfile === 'string' ? candidateProfile : JSON.stringify(candidateProfile, null, 2)}

## ÇIKTI FORMATI (JSON)
{
  "score": <0-100>,
  "agentReasoning": "<Ajanın düşünce süreci ve Transferable Skill analizi (TÜRKÇE)>",
  "autonomousStatus": "pending | action_taken | manual_review_required",
  "nextAction": "schedule_technical_interview | send_rejection | ...",
  "scoreBreakdown": { "technicalSkills": 0-100, "experience": 0-100, "industryFit": 0-100, "softSkills": 0-100 },
  "topSkills": [{ "skill": "...", "relevance": "..." }],
  "gapAnalysis": [{ "gap": "...", "severity": "...", "suggestion": "..." }],
  "summary": "<Adayın geçmiş şirketlerine, çalıştığı spesifik sektörlere (örn: FinTech, E-ticaret) ve kilit projelerine atıfta bulunan, kullanıcıya özel TÜRKÇE özet>",
  "personalizedMessage": "<TÜRKÇE LinkedIn DM taslağı>",

  "recommendation": "hire | strong_consider | consider | pass"
}

ÖNEMLİ: Yanıtın SADECE geçerli JSON olmalı ve tüm metin alanları TÜRKÇE olmalıdır.`;
}

// ==================== MAIN ANALYSIS FUNCTION ====================

export async function analyzeCandidateMatch(jobDescription, candidateProfile, modelId) {
    if (!API_KEY) {
        throw new Error('Gemini API anahtarı bulunamadı.');
    }

    const prompt = buildAnalysisPrompt(jobDescription, candidateProfile);

    // Call Gemini API with exponential backoff
    const result = await withExponentialBackoff(async () => {
        const geminiModel = getModel(modelId);
        const result = await geminiModel.generateContent(prompt);
        const responseText = result.response.text();

        const cleanJson = responseText.replace(/```json|```/g, '').trim();

        try {
            return JSON.parse(cleanJson);
        } catch (e) {
            console.error('JSON Parse Error:', e);
            throw new Error('AI yanıtı geçerli bir JSON formatında değildi.');
        }
    });

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

    if (!Array.isArray(result.topSkills)) {
        throw new Error('topSkills alanı eksik.');
    }

    if (!Array.isArray(result.gapAnalysis)) {
        throw new Error('gapAnalysis alanı eksik.');
    }

    if (!result.personalizedMessage || typeof result.personalizedMessage !== 'string') {
        throw new Error('personalizedMessage alanı eksik.');
    }
}


// ==================== QUICK SCORE (Unified Brain, Faster Output) ====================

export async function quickScore(jobDescription, candidateProfile) {
    if (!API_KEY) {
        throw new Error('Gemini API anahtarı bulunamadı.');
    }

    const prompt = `${RECRUITER_BRAIN_CORE}

## ANALİZ GÖREVİ
Aşağıdaki adayı iş tanımı ile karşılaştır. "Tek Beyin" kuralına göre derin analiz yap ama sadece skor ve özet dön.

İş Tanımı: ${jobDescription}
Aday: ${typeof candidateProfile === 'string' ? candidateProfile : JSON.stringify(candidateProfile)}

JSON formatında yanıt ver: {"score": <sayı>, "summary": "<Adayın geçmiş deneyimlerini (örn: X şirketindeki Y rolünü) ve sektörel yetkinliğini vurgulayan 1 cümlelik spesifik TÜRKÇE özet>"}

Sadece JSON ver. ÖNEMLİ: Tüm metinler TÜRKÇE olmalı.`;


    const result = await withExponentialBackoff(async () => {
        const geminiModel = getModel();
        const response = await geminiModel.generateContent(prompt);
        const text = response.response.text();
        const cleanJson = text.replace(/```json|```/g, '').trim();
        return JSON.parse(cleanJson);
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
    Aday hangi dilde olursa olsun tüm analiz ve özetler TÜRKÇE olmalıdır.
    
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
      "summary": "Geçmiş tecrübe açıklamalarını ve başarılarını özetleyen profesyonel bir TÜRKÇE özet (max 400 karakter)",
      "source": "LinkedIn Scraper (TR)"
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

// ==================== POSITION EXTRACTION ====================

/**
 * Extracts structured position requirements from a job description text.
 */
export async function extractPositionFromJD(text, modelId) {
    if (!text || text.length < 50) {
        throw new Error('İş tanımı metni çok kısa. Lütfen daha detaylı bir metin girin.');
    }

    const prompt = `Aşağıdaki iş tanımı (Job Description) metnini analiz et ve bu pozisyon için gerekli olan özellikleri yapılandırılmış JSON formatında çıkart. 
    
    METİN:
    ${text}

    İSTENEN JSON FORMATI:
    {
      "title": "Pozisyon Başlığı",
      "department": "İlgili Departman (örn: Engineering, Marketing, Sales, HR)",
      "minExperience": 5 (yıl olarak sayı, belirtilmemişse 0),
      "requirements": ["Gereksinim 1", "Gereksinim 2", "Gereksinim 3", ...],
      "responsibilities": ["Sorumluluk 1", "Sorumluluk 2", ...]
    }
    
    KURALLAR:
    1. "requirements" listesi hem teknik yetkinlikleri hem de tecrübe gereksinimlerini içermeli.
    2. Liste maddeleri kısa ve öz olmalı.
    3. Sadece geçerli JSON yanıtı ver.`;

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
            throw new Error('İş tanımı ayrıştırılamadı: ' + e.message);
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
