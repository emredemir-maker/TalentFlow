// src/services/ai/extraction.js
import { getModel } from './config.js';

const EXTRACTOR_PROMPT = `
Sen kıdemli ve son derece analitik bir İşe Alım Yöneticisisin. Görevin, adayı derinlemesine analiz etmek.

ÇOK ÖNEMLİ KURALLAR:
1. STAR Analizi: Her kategori (S, T, A, R) için 1-10 arası puan ver. 
   - "reason" alanında mutlaka şunları belirt: "Pozitif (+): [Adayın öne çıkan güçlü yanı], Negatif (-): [Eksik veya geliştirilmesi gereken nokta]". 
2. Öne Çıkan Tecrübeler: Adayın geçmişindeki spesifik projeleri, kullandığı teknolojileri veya başarılarını analizde mutlaka kullan.
3. Özet (Summary): Sadece genel cümleler kurma. Somut kanıtlar sun.

ÇIKTI FORMATI (JSON):
{
  "extractedData": {
    "totalYearsOfExperience": <integer>,
    "matchedKeywords": ["keyword1"],
    "missingKeywords": ["keyword2"],
    "starAnalysis": {
        "Situation": { "score": <integer>, "reason": "..." },
        "Task": { "score": <integer>, "reason": "..." },
        "Action": { "score": <integer>, "reason": "..." },
        "Result": { "score": <integer>, "reason": "..." }
    }
  },
  "evidence": {
    "reasoning": ["Kanıt 1", "Kanıt 2"],
    "summary": "..."
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
        cvData: candidateProfile.cvData || '', // Fallback to cvData to prevent AI performance loss if the raw CV is deleted
        experiences: candidateProfile.experiences || []
    };

    const prompt = `${EXTRACTOR_PROMPT}\n## İŞ TANIMI\n${jobDescription}\n\n## ADAY VERİSİ\n${JSON.stringify(sanitizedCandidate, null, 2)}\n\nSadece JSON yanıtı ver.`;

    const model = await getModel();
    const result = await model.generateContent(prompt);
    try {
        const text = result.response.text();
        const cleanJson = text.replace(/```json|```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        throw new Error("AI extraction failed to parse JSON.");
    }
}

export async function extractPositionFromJD(jdText) {
    const prompt = `Lütfen aşağıdaki iş tanımı metnini analiz et ve bilgileri ayıkla.
    Sadece JSON olarak dön:
    { "title": "Pozisyon Adı", "requirements": ["şart1", "şart2"], "description": "Kısa özet" }
    
    Metin: ${jdText}`;

    const model = await getModel();
    const result = await model.generateContent(prompt);
    try {
        const clean = result.response.text().replace(/```json|```/gi, '').trim();
        return JSON.parse(clean);
    } catch (e) {
        return { title: "Bilinmeyen Pozisyon", requirements: [], description: "" };
    }
}

export async function quickCandidateScreening(candidateProfile, openPositions) {
    const sanitizedCandidate = {
        name: candidateProfile.name,
        position: candidateProfile.position,
        experience: candidateProfile.experience,
        skills: candidateProfile.skills,
        description: candidateProfile.description || candidateProfile.about || '',
        cvData: candidateProfile.cvData || '', // Essential for AI scoring after GDPR raw CV deletion
    };

    const positionsText = openPositions.map(p => `- ${p.title}: ${p.requirements?.join(', ')}`).join('\n');

    const prompt = `Sen bir Yetenek Yönetimi Uzmanısın. Amacın, adayı sistemdeki AÇIK POZİSYONLARLA genel bir bakış açısıyla kıyaslamaktır.
    
    AÇIK POZİSYONLAR:
    ${positionsText || "Sistemde açık pozisyon bulunmuyor."}
    
    ADAY VERİSİ:
    ${JSON.stringify(sanitizedCandidate, null, 2)}
    
    Sadece JSON formatında çıktı ver:
    {
      "suitability": "Uygun" | "Potansiyel" | "Uygun Değil",
      "suggestedOpenPosition": "Açık pozisyon adı veya null",
      "potentialPosition": "Önerilen rol",
      "reasoning": "Açıklama"
    }`;

    const model = await getModel();
    const result = await model.generateContent(prompt);
    try {
        const text = result.response.text();
        const cleanJson = text.replace(/```json|```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        return { suitability: "Potansiyel", reasoning: "Analiz tamamlanamadı." };
    }
}
