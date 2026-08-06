// src/services/ai/extraction.js
import { getModel } from './config.js';
import { parseAIJson, buildStructuredPrompt, sanitizeForPrompt } from './utils.js';

const EXTRACTOR_PROMPT = `
Sen kıdemli ve son derece analitik bir İşe Alım Yöneticisisin. Görevin, adayı İLANIN GEREKSİNİMLERİ karşısında değerlendirmek.

ÇOK ÖNEMLİ KURALLAR:
1. Gereksinim Karşılama (requirementCoverage): JOB_DESCRIPTION içindeki her bir
   gereksinimi tek tek ele al ve YALNIZCA CV'deki kanıta dayanarak sınıflandır:
   - "met": CV'de açık kanıt var
   - "partial": Dolaylı/kısmi kanıt var
   - "missing": Kanıt yok
   Gereksinimi kısa ve tanınabilir biçimde yaz (ilanın cümlesini birebir kopyalama).
   "coverageScore": karşılanma oranını 0-100 arası tek sayı olarak ver
   (met tam, partial yarım sayılır). İyi yazılmış ama ilanla ilgisiz bir CV
   DÜŞÜK coverageScore almalıdır — CV kalitesi bu alanı YÜKSELTMEZ.
2. STAR Analizi: Her kategori (S, T, A, R) için 1-10 arası puan ver.
   - "reason" alanında mutlaka şunları belirt: "Pozitif (+): [Adayın öne çıkan güçlü yanı], Negatif (-): [Eksik veya geliştirilmesi gereken nokta]".
   - STAR, anlatım/kanıt KALİTESİNİ ölçer; ilana uygunluğu değil.
3. Öne Çıkan Tecrübeler: Adayın geçmişindeki spesifik projeleri, kullandığı teknolojileri veya başarılarını analizde mutlaka kullan.
4. Özet (Summary): Sadece genel cümleler kurma. Somut kanıtlar sun.

ÇIKTI FORMATI (JSON):
{
  "extractedData": {
    "totalYearsOfExperience": <integer>,
    "matchedKeywords": ["keyword1"],
    "missingKeywords": ["keyword2"],
    "requirementCoverage": {
        "met": ["karşılanan gereksinim"],
        "partial": ["kısmen karşılanan gereksinim"],
        "missing": ["karşılanmayan gereksinim"],
        "coverageScore": <integer 0-100>
    },
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

export async function extractCandidateEvidence(jobDescription, candidateProfile, modelId = 'gemini-2.5-flash') {
    const sanitizedCandidate = {
        position: candidateProfile.position,
        experience: candidateProfile.experience,
        skills: candidateProfile.skills,
        description: sanitizeForPrompt(candidateProfile.description || candidateProfile.about || ''),
        // cvData'yı yalnızca manuel yükleme akışı yazar; toplu içe aktarma ve
        // başvuru formu CV metnini cvText alanına koyar. cvText'e düşülmezse
        // bu adayların derin analizi BOŞ CV ile çalışır ve skorlar çöker.
        cvData: sanitizeForPrompt(candidateProfile.cvData || candidateProfile.cvText || ''),
        experiences: candidateProfile.experiences || []
    };

    const prompt = buildStructuredPrompt(EXTRACTOR_PROMPT, {
        "JOB_DESCRIPTION": jobDescription,
        "CANDIDATE_DATA": JSON.stringify(sanitizedCandidate, null, 2)
    });

    const model = await getModel(modelId);
    const result = await model.generateContent(prompt);
    const parsed = parseAIJson(result.response.text());
    if (!parsed) throw new Error("AI extraction failed to parse JSON.");
    return parsed;
}

export async function extractPositionFromJD(jdText) {
    const instruction = `Lütfen aşağıdaki iş tanımı metnini analiz et ve bilgileri ayıkla.
    Sadece JSON olarak dön:
    { "title": "Pozisyon Adı", "requirements": ["şart1", "şart2"], "description": "Pozisyonu 1-2 cümleyle özetleyen kısa açıklama (max 280 karakter, iş ilanı metni değil, özet)" }
    ÖNEMLİ: description alanı kesinlikle 280 karakteri geçmemeli ve iş ilanının ham metni olmamalı.`;

    const prompt = buildStructuredPrompt(instruction, { "JD_METNI": sanitizeForPrompt(jdText) });

    const model = await getModel();
    const result = await model.generateContent(prompt);
    return parseAIJson(result.response.text(), { title: "Bilinmeyen Pozisyon", requirements: [], description: "" });
}

export async function quickCandidateScreening(candidateProfile, openPositions) {
    const sanitizedCandidate = {
        position: candidateProfile.position,
        experience: candidateProfile.experience,
        skills: candidateProfile.skills,
        description: sanitizeForPrompt(candidateProfile.description || candidateProfile.about || ''),
        cvData: sanitizeForPrompt(candidateProfile.cvData || ''),
    };

    const positionsText = openPositions.map(p => `- ${p.title}: ${p.requirements?.join(', ')}`).join('\n');

    const instruction = `Sen bir Yetenek Yönetimi Uzmanısın. Amacın, adayı sistemdeki AÇIK POZİSYONLARLA genel bir bakış açısıyla kıyaslamaktır.
    
    Sadece JSON formatında çıktı ver:
    {
      "suitability": "Uygun" | "Potansiyel" | "Uygun Değil",
      "suggestedOpenPosition": "Açık pozisyon adı veya null",
      "potentialPosition": "Önerilen rol",
      "reasoning": "Açıklama"
    }`;

    const prompt = buildStructuredPrompt(instruction, {
        "OPEN_POSITIONS": positionsText || "Sistemde açık pozisyon bulunmuyor.",
        "CANDIDATE_DATA": JSON.stringify(sanitizedCandidate, null, 2)
    });

    const model = await getModel();
    const result = await model.generateContent(prompt);
    return parseAIJson(result.response.text(), { suitability: "Potansiyel", reasoning: "Analiz tamamlanamadı." });
}
