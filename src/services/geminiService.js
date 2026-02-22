// src/services/geminiService.js
// Gemini 2.0 Flash - CV Data Extraction Engine (Hybrid Architecture)
// AI extracts evidence, Node.js calculates scores for 100% determinism.

import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const MODEL_ID = 'gemini-2.0-flash';

let genAI = null;

function getModel(modelId = MODEL_ID) {
    if (!API_KEY) throw new Error('Gemini API anahtarı bulunamadı.');
    if (!genAI) genAI = new GoogleGenerativeAI(API_KEY);

    // DETERMINISTIC SETTINGS: Temperature 0 and TopP 0
    return genAI.getGenerativeModel({
        model: modelId,
        generationConfig: {
            temperature: 0,
            topP: 0,
            topK: 1,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
        },
    });
}

// ==================== THE EXTRACTOR BRAIN ====================

const EXTRACTOR_PROMPT = `
Sen kıdemli ve son derece analitik bir IT İşe Alım Yöneticisisin. Görevin, adayı derinlemesine analiz etmek.

ÇOK ÖNEMLİ KURALLAR:
1. STAR Analizi: Her kategori (S, T, A, R) için 1-10 arası puan ver. 
   - "reason" alanında mutlaka şunları belirt: "Pozitif (+): [Adayın öne çıkan güçlü yanı], Negatif (-): [Eksik veya geliştirilmesi gereken nokta]". 
   - Neden 7 veya 8 verdiğini bu artı/eksi dengesiyle açıkla.
2. Öne Çıkan Tecrübeler: Adayın geçmişindeki spesifik projeleri, kullandığı teknolojileri veya başarılarını (Örn: "X firmasında Y projesinde Z mimarisini kurmuş olması") analizde mutlaka kullan.
3. Özet (Summary): Sadece genel cümleler kurma. "Adayın [Proje Adı/Tecrübe] konusundaki deneyimi, bu pozisyonun [Gereksinim] ihtiyacıyla örtüşüyor" gibi somut kanıtlar sun.

ÇIKTI FORMATI (JSON):
{
  "extractedData": {
    "totalYearsOfExperience": <integer>,
    "matchedTechKeywords": ["tech1"],
    "missingTechKeywords": ["tech2"],
    "starAnalysis": {
        "Situation": { "score": <integer>, "reason": "Pozitif (+): ... Negatif (-): ..." },
        "Task": { "score": <integer>, "reason": "Pozitif (+): ... Negatif (-): ..." },
        "Action": { "score": <integer>, "reason": "Pozitif (+): ... Negatif (-): ..." },
        "Result": { "score": <integer>, "reason": "Pozitif (+): ... Negatif (-): ..." }
    }
  },
  "evidence": {
    "reasoning": ["Kanıt 1 (Spesifik tecrübe odaklı)", "Kanıt 2"],
    "summary": "<Adayın geçmiş başarılarını ve projelerini vurgulayan detaylı profesyonel görüş>"
  }
}
`;

export async function extractCandidateEvidence(jobDescription, candidateProfile) {
    const sanitizedCandidate = {
        name: candidateProfile.name,
        position: candidateProfile.position,
        experience: candidateProfile.experience,
        skills: candidateProfile.skills,
        description: candidateProfile.description || candidateProfile.about || '',
        experiences: candidateProfile.experiences || []
    };

    const prompt = `${EXTRACTOR_PROMPT}
## İŞ TANIMI
${jobDescription}

## ADAY VERİSİ
${JSON.stringify(sanitizedCandidate, null, 2)}

Sadece JSON yanıtı ver.`;

    const model = getModel();
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    try {
        const cleanJson = text.replace(/```json|```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        console.error("Extraction Parse Error:", text);
        throw new Error("AI veriyi yapılandıramadı.");
    }
}

export async function extractPositionFromJD(jdText) {
    const prompt = `Lütfen aşağıdaki iş tanımı metnini analiz et ve bilgileri ayıkla.
    Sadece JSON olarak dön:
    { "title": "Pozisyon Adı", "requirements": ["şart1", "şart2"], "description": "Kısa özet" }
    
    Metin:
    ${jdText}`;

    const model = getModel();
    const result = await model.generateContent(prompt);
    try {
        const clean = result.response.text().replace(/```json|```/gi, '').trim();
        return JSON.parse(clean);
    } catch (e) {
        return { title: "Bilinmeyen Pozisyon", requirements: [], description: "" };
    }
}

export async function getAvailableModels() {
    return [
        { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash (Fast & Deterministic)' }
    ];
}

// ==================== QUICK SCREENING ====================
export async function quickCandidateScreening(candidateProfile, openPositions) {
    const sanitizedCandidate = {
        name: candidateProfile.name,
        position: candidateProfile.position,
        experience: candidateProfile.experience,
        skills: candidateProfile.skills,
        description: candidateProfile.description || candidateProfile.about || '',
    };

    const positionsText = openPositions.map(p => `- ${p.title}: ${p.requirements?.join(', ')}`).join('\n');

    const prompt = `
Sen bir Yetenek Yönetimi Uzmanısın. Amacın, adayın profilini sistemdeki AÇIK POZİSYONLARLA genel bir bakış açısıyla kıyaslamaktır. Hiçbir şekilde sayısal skor üretme. Sadece mantıksal bir eşleştirme yap.

AÇIK POZİSYONLAR:
${positionsText || "Sistemde açık pozisyon bulunmuyor."}

ADAY VERİSİ:
${JSON.stringify(sanitizedCandidate, null, 2)}

Sadece JSON formatında çıktı ver:
{
  "suitability": "Uygun" | "Potansiyel" | "Uygun Değil",
  "suggestedOpenPosition": "Açık pozisyon adı veya null",
  "potentialPosition": "Açık pozisyon yoksa veya uymadıysa önerilen rol, yoksa null",
  "reasoning": "Açıklama"
}`;

    const model = getModel();
    const result = await model.generateContent(prompt);

    try {
        const text = result.response.text();
        const cleanJson = text.replace(/```json|```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        console.error("Quick Screening Error:", e);
        return { suitability: "Potansiyel", reasoning: "Analiz tamamlanamadı." };
    }
}

// ==================== INTERNAL SCORE CALCULATOR (MATHEMATICAL) ====================
function calculateHybridScore(data) {
    if (data.starAnalysis) {
        const getScore = (val) => {
            if (typeof val === 'number') return val;
            if (typeof val === 'object' && val !== null && val.score !== undefined) return Number(val.score);
            if (typeof val === 'string') {
                const num = parseInt(val.replace(/[^0-9]/g, ''));
                return isNaN(num) ? 0 : num;
            }
            return 0;
        };

        const s = getScore(data.starAnalysis.Situation);
        const t = getScore(data.starAnalysis.Task);
        const a = getScore(data.starAnalysis.Action);
        const r = getScore(data.starAnalysis.Result);

        // Normalize scores if AI returns them in 0-1 range by mistake
        const normalize = (n) => (n > 0 && n <= 1) ? n * 10 : n;

        const sum = normalize(s) + normalize(t) + normalize(a) + normalize(r);
        return Math.min(100, Math.max(0, Math.round((sum / 4) * 10)));
    }

    let score = 0;
    const exp = Number(data.totalYearsOfExperience || 0);
    score += Math.min(exp * 5, 30);
    const matched = Array.isArray(data.matchedTechKeywords) ? data.matchedTechKeywords.length : 0;
    const missing = Array.isArray(data.missingTechKeywords) ? data.missingTechKeywords.length : 0;
    const totalKeywords = (matched + missing) || 1;
    score += Math.round((matched / totalKeywords) * 40);
    if (data.isSeniorityMatch) score += 20;
    return Math.min(score, 100);
}

export async function analyzeCandidateMatch(jobDescription, candidateProfile) {
    const evidence = await extractCandidateEvidence(jobDescription, candidateProfile);
    const score = calculateHybridScore(evidence.extractedData);

    return {
        ...evidence.evidence,
        scoreData: evidence.extractedData,
        score: score,
        starAnalysis: evidence.extractedData.starAnalysis,
        reasons: evidence.evidence.reasoning || [],
        summary: evidence.evidence.summary,
        agentReasoning: evidence.evidence.reasoning,
        nextAction: evidence.extractedData.totalYearsOfExperience > 2 ? "schedule_technical_interview" : "send_rejection",
        topSkills: (evidence.extractedData.matchedTechKeywords || []).map(s => ({ skill: s, relevance: "High" })),
        gapAnalysis: (evidence.extractedData.missingTechKeywords || []).map(s => ({ gap: s, severity: "High", suggestion: `${s} eğitimi önerilir` })),
        personalizedMessage: `Merhabalar ${candidateProfile.name}. Profilinizi inceledim. ${evidence.evidence.summary}`
    };
}

// ==================== INTERVIEW & DM GENERATION ====================

export async function generateInterviewQuestions(candidate, starAnalysis) {
    const prompt = `Sen kıdemli bir IT ve İnsan Kaynakları mülakatçısısın (Agentic HR System v2025). 
    Görevin, adayın özgeçmişini ve "${candidate?.matchedPositionTitle || 'Hedef Pozisyon'}" rolünün bağlamını semantik bir derinlikle analiz ederek, otonom mülakat akışını yapılandırmaktır.

    STAR Analiz Girdileri (Sadece arka planda bağlam için):
    - Situation: ${starAnalysis?.Situation}/10, Task: ${starAnalysis?.Task}/10, Action: ${starAnalysis?.Action}/10, Result: ${starAnalysis?.Result}/10

    TALİMATLAR:
    1. İletişim Dili: Sorular asla "Puanınız düşük" veya "STAR kategorisi şudur" gibi soğuk/mekanik ifadeler içermemeli.
    2. Yumuşatma: Soruları motive edici, adayın deneyimini paylaşmasını teşvik eden profesyonel bir üslupla (Siz dili) sor.
    3. Stratejik Fokus: Adayın skorunun nispeten zayıf olduğu alanları (Durum, Görev, Eylem veya Sonuç) doğrudan ismini zikretmeden, o alandaki detayları merak eden bir meraklı mülakatçı gibi sorgula.
    4. Örnek Üslup: "Sonuç puanınız düşük olduğu için..." yerine "Projelerinizdeki başarıları somut verilerle duymayı çok isteriz, örneğin..." şeklinde yaklaş.

    Format: JSON array ["soru1", "soru2", "soru3"]`;

    const model = getModel();
    const result = await model.generateContent(prompt);

    try {
        const text = result.response.text();
        const cleanJson = text.replace(/```json|```/gi, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        return ["Teknik kararlarınızdaki kısıtları açıklayın.", "Bir başarı hikayenizi detaylandırın.", "Kriz anındaki aksiyonunuzu anlatın."];
    }
}

export async function generateProbingQuestion(candidate, lastQuestion, candidateAnswer) {
    const prompt = `Sen bir 'Active Listener' otonom mülakatçısısın.
    Soru: "${lastQuestion}"
    Yanıt: "${candidateAnswer}"

    Görev: Yanıttaki teknik boşlukları saptayıp somut veri isteyen 1 adet derinleştirici takip sorusu türet.
    SADECE SORU METNİNİ DÖN.`;

    const model = getModel();
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
}

export async function generatePersonalizedDM(name, skills, position, company, purpose = 'interview', type = 'initial') {
    const interviewTypeLabels = {
        initial: 'İlk Tanışma & Kültür Uyumu',
        technical: 'Teknik Yetkinlik Mülakatı',
        fit: 'Genel Uyumluluk Değerlendirmesi',
        final: 'Final Görüşmesi'
    };

    const prompt = `Sen profesyonel bir İşe Alım Uzmanısın.
    Aday: ${name}
    Değerlendirildiği Pozisyon: ${position}
    İletişim Amacı: ${purpose === 'interview' ? `Mülakat Daveti (${interviewTypeLabels[type]})` : purpose === 'reject' ? 'Olumsuz Bilgilendirme' : 'Genel İletişim'}

    KURALLAR:
    - Mesaj içeriğinde ve konu başlığında MUTLAKA "${position}" pozisyonu ismini kullan.
    - TON: Profesyonel, ciddi ama nazik bir İK dili kullan.
    - ÖNEMLİ: İlk görüşmelerde (Initial/Technical) adaya kesin iş teklifi yapılacakmış gibi umut verici/vaat edici ifadelerden kaçın. "Deneyimleriniz ilgimizi çekti, tanımak isteriz" tadında grounded kalsın.
    - Sadece JSON dön.

    Format: JSON { "subject": "Konu Başlığı", "body": "Mesaj Metni" }`;

    const model = getModel();
    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const cleanJson = jsonMatch ? jsonMatch[0] : text.replace(/```json|```/gi, '').trim();

        const parsed = JSON.parse(cleanJson);
        if (!parsed.body || parsed.body.length < 5) throw new Error("Empty body");
        return parsed;
    } catch (e) {
        console.error("DM Generation Parse Error:", e);
        return {
            subject: `${name} - ${position} - ${interviewTypeLabels[type] || 'Görüşme Talebi'}`,
            body: `Sayın ${name},\n\nŞirketimizdeki ${position} pozisyonu için yaptığınız başvuruyu inceledik. Profilinizdeki detayları daha yakından değerlendirmek amacıyla bir ${interviewTypeLabels[type] || 'görüşme'} planlamak isteriz.\n\nSizden uygun olduğunuz zaman dilimlerini bekliyor olacağız.\n\nİyi çalışmalar.`
        };
    }
}

export async function parseCandidateFromText(text) {
    const prompt = `CV verilerini ayıkla: ${text}
    Format: JSON { "name": "", "position": "", "skills": [] }`;
    const model = getModel();
    const result = await model.generateContent(prompt);
    try {
        const clean = result.response.text().replace(/```json|```/gi, '').trim();
        return JSON.parse(clean);
    } catch (e) {
        return null;
    }
}
// ==================== RESPONSE ANALYSIS ====================
export async function analyzeResponseEmail(emailText) {
    const prompt = `Sen kıdemli bir İK Asistanısın. Adaydan gelen şu e-posta yanıtını analiz et ve stratejik bir karar ver.
    
    E-POSTA İÇERİĞİ:
    "${emailText}"
    
    Lütfen SADECE şu formatta JSON dön:
    {
      "sentiment": "Olumlu" | "Olumsuz" | "Belirsiz",
      "decision": "interested" | "declined" | "reschedule_requested" | "more_info_needed",
      "summary": "Cevabın 1 cümlelik özeti (Türkçe)",
      "suggestedStatus": "interview" | "rejected" | "review" | "hired",
      "actionLog": "İK Paneline eklenecek kısa aksiyon notu"
    }
    `;

    const model = getModel();
    const result = await model.generateContent(prompt);

    try {
        const text = result.response.text();
        const cleanJson = text.replace(/```json|```/gi, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        console.error("Response Analysis Error:", e);
        return {
            sentiment: "Belirsiz",
            decision: "more_info_needed",
            summary: "Cevap anlaşılamadı, manuel kontrol önerilir.",
            suggestedStatus: "review",
            actionLog: "Manuel inceleme gerekiyor."
        };
    }
}
