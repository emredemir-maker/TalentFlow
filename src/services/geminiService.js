// src/services/geminiService.js
/**
 * REFACTORED AI SERVICE
 * This file acts as a facade for domain-specific AI sub-services.
 */

import { getModel } from './ai/config.js';
import { parseAIJson, buildStructuredPrompt, sanitizeForPrompt } from './ai/utils.js';
import { stripPiiForAI, extractPiiFromText, redactPiiFromText } from '../utils/pii.js';
import {
    extractCandidateEvidence,
    extractPositionFromJD,
    quickCandidateScreening
} from './ai/extraction.js';
import {
    generateInterviewQuestions,
    generateInterviewPaths,
    scoreInterviewSession,
    generateFollowUpQuestion,
    analyzeSTARRealTime,
    generateInterviewFinalReport,
    stripPII
} from './ai/interview.js';
import {
    generatePersonalizedDM,
    analyzeResponseEmail
} from './ai/communication.js';

export {
    getModel,
    extractCandidateEvidence,
    extractPositionFromJD,
    quickCandidateScreening,
    generateInterviewQuestions,
    generateInterviewPaths,
    scoreInterviewSession,
    generateFollowUpQuestion,
    analyzeSTARRealTime,
    generateInterviewFinalReport,
    stripPII,
    generatePersonalizedDM,
    analyzeResponseEmail
};

export async function parseCandidateFromText(text, modelId = 'gemini-2.5-flash') {
    // Extract contact fields (incl. name) with regex BEFORE redacting — they will be
    // merged back into the result so the candidate record retains them without leaking to AI.
    const contactInfo = extractPiiFromText(text);
    const safeText = redactPiiFromText(text, contactInfo.name);

    const instruction = `Sen bir uzman İK Profil Ayrıştırıcısısın (CV Parser). Aşağıdaki profil metninden aday bilgilerini çıkart.

ÇOK ÖNEMLİ KURALLAR (KVKK / GDPR UYGUNLUĞU İÇİN):
Metindeki [E-POSTA], [TELEFON], [LINKEDIN] gibi anonimleştirilmiş alanlar için ilgili JSON alanlarını null veya boş bırak.
'cvData' alanunda ise adayın TÜM PROFESYONEL GEÇMİŞİNİ (iş tecrübeleri, görev tanımları, başarıları, eğitimleri, sertifikaları, yetenekleri) İSİM VE İLETİŞİM BİLGİSİNDEN ARINDIRILMIŞ ŞEKİLDE kelimesi kelimesine detaylıca yaz.

'experiences' KURALLARI — SIKI UYU:
- SADECE GERÇEK İŞ DENEYİMLERİNİ ekle (şirkette çalışılan pozisyonlar).
- Profil özeti, yetenek listesi, eğitim bilgisi KESINLIKLE 'experiences' içine girmez.
- Her girdinin MUTLAKA tam şirket adı ("company") VE tarih aralığı ("duration") olmalı.
- Tarih veya şirket adı yoksa o girdiyi LISTEYE EKLEME.
- "role" maksimum 50 karakter olmalı (kısa ünvan). Uzun açıklama yazma.
- "desc" tek cümle, maksimum 120 karakter.
- "milestones" maksimum 2 madde, sayısal başarılar tercih edilir.

Sadece şu JSON formatında dön:
{
  "name": "Ad Soyad",
  "email": null,
  "phone": null,
  "linkedinUrl": null,
  "position": "Mevcut veya Hedeflenen Pozisyon",
  "company": "Mevcut Şirket",
  "location": "Şehir, Ülke",
  "skills": ["Yetenek1", "Yetenek2"],
  "experience": <integer>,
  "education": "Son Okul / Bölüm",
  "summary": "Kısa önizleme özeti (Turkish)",
  "cvData": "Detaylı döküm.",
  "experiences": [
    {
      "role": "Kısa Pozisyon Ünvanı",
      "company": "Tam Şirket Adı",
      "duration": "Ay Yıl – Ay Yıl (veya Günümüz)",
      "desc": "Tek cümle görev özeti.",
      "milestones": ["Sayısal Başarı 1", "Sayısal Başarı 2"]
    }
  ]
}`;

    const prompt = buildStructuredPrompt(instruction, { "PROFIL_METNI": sanitizeForPrompt(safeText, 20000) });
    const model = await getModel(modelId);
    // Long CVs produce long structured JSON (cvData + multi-entry experiences).
    // Default 8k cap was truncating the output mid-string and breaking JSON.parse.
    const result = await model.generateContent(prompt, { maxOutputTokens: 32768 });
    const parsed = parseAIJson(result.response.text());
    // Merge regex-extracted contact info so the record is complete
    // without having leaked PII to the AI model.
    // Null-safe merge: only overwrite parsed fields with extracted values that are non-null.
    const safeContactInfo = Object.fromEntries(
        Object.entries(contactInfo).filter(([, v]) => v !== null && v !== undefined)
    );
    return parsed ? { ...parsed, ...safeContactInfo } : parsed;
}

export async function parseExperiencesFromText(text, modelId = 'gemini-2.5-flash') {
    if (!text || text.length < 30) return [];
    const instruction = `CV metninden SADECE iş deneyimlerini çıkart. Profil özeti, yetenek listesi veya eğitim bilgisi ekleme.

Kural:
- Her girdi için mutlaka şirket adı (company) VE tarih aralığı (duration) olmalı.
- role: maksimum 50 karakter (kısa ünvan).
- desc: tek cümle, maksimum 120 karakter.
- milestones: maksimum 2 sayısal başarı maddesi (yoksa boş dizi).

Sadece şu JSON formatında dön (başka hiçbir şey yazma):
[
  {
    "role": "Pozisyon Ünvanı",
    "company": "Tam Şirket Adı",
    "duration": "Ay Yıl – Ay Yıl (veya Günümüz)",
    "desc": "Tek cümle görev özeti.",
    "milestones": ["Başarı 1"]
  }
]`;
    // For structural parsing (job titles, companies, dates) we only strip
    // contact details — NOT the generic name pattern, because that regex
    // incorrectly replaces Turkish title-cased words like "Müdür" → "[İSİM]ü".
    const structuralSafeText = text
        .replace(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, '[E-POSTA]')
        .replace(/(?:\+?\d[\d\s\-().]{6,}\d)/g, '[TELEFON]')
        .replace(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w\-]+/gi, '[LINKEDIN]')
        .replace(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w\-]+/gi, '[GITHUB]');
    const prompt = buildStructuredPrompt(instruction, { "CV_METNI": sanitizeForPrompt(structuralSafeText, 15000) });
    const model = await getModel(modelId);
    // Same rationale as parseCandidateFromText: long CVs blow past the
    // 8k default and the structured array gets truncated mid-entry.
    const result = await model.generateContent(prompt, { maxOutputTokens: 32768 });
    const raw = result.response.text().replace(/```json|```/gi, '').trim();
    try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter(e => e.company && e.duration) : [];
    } catch {
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) {
            try { const arr = JSON.parse(match[0]); return Array.isArray(arr) ? arr.filter(e => e.company && e.duration) : []; } catch { return []; }
        }
        return [];
    }
}

export async function getAvailableModels() {
    return [
        { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash (Fast & Deterministic)' }
    ];
}

/**
 * Internal score calculator (mathematical logic) to ensure 100% determinism.
 */
// Derin tarama skorunun ağırlıkları.
//
// Eskiden skor YALNIZCA STAR ortalamasıydı. STAR, CV'nin ne kadar iyi
// anlatıldığını ölçer (durum-görev-eylem-sonuç kanıtı) — ilana uygunluğunu
// DEĞİL. Sonuç: iyi yazılmış ama alakasız bir CV yüksek, ilana birebir uyan
// ama sade yazılmış bir CV düşük alıyordu; ilanın gereksinimlerini
// değiştirmek skoru neredeyse hiç oynatmıyordu.
const COVERAGE_WEIGHT = 0.6;
const STAR_WEIGHT = 0.4;

/** 0-100 aralığına kırpar; sayı değilse null döner. */
function clampScore(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.min(100, Math.max(0, Math.round(n)));
}

/** STAR ortalaması → 0-100. Analiz yoksa null. */
function starScoreOf(starAnalysis) {
    if (!starAnalysis) return null;
    const getScore = (val) => {
        if (typeof val === 'number') return val;
        if (typeof val === 'object' && val !== null && val.score !== undefined) return Number(val.score);
        return 0;
    };
    const sum = getScore(starAnalysis.Situation) + getScore(starAnalysis.Task)
        + getScore(starAnalysis.Action) + getScore(starAnalysis.Result);
    return clampScore((sum / 4) * 10);
}

const MUST_WEIGHT = 85;
const NICE_WEIGHT = 15;

/**
 * Madde numaralarına göre AĞIRLIKLI kapsama: olmazsa olmazların karşılanmaması
 * skoru sert düşürür, "olursa iyi olur" maddeleri yalnızca sınırlı bir avantaj
 * sağlar. Modelin tek bir coverageScore sayısına güvenmek yerine, madde
 * durumları koda göre toplanır.
 *
 * @param {object} coverage — extractedData.requirementCoverage
 * @param {Array<{text: string, must: boolean|null}>} requirements
 * @returns {number|null} işaretlenmiş gereksinim yoksa null (nötr davranış)
 */
function weightedCoverageOf(coverage, requirements) {
    const assessments = coverage?.assessments;
    if (!Array.isArray(assessments) || !Array.isArray(requirements) || requirements.length === 0) return null;

    const indexed = requirements.map((r, i) => ({ ...r, index: i + 1 }));
    const must = indexed.filter((r) => r.must === true);
    const nice = indexed.filter((r) => r.must === false);
    if (must.length === 0 && nice.length === 0) return null; // işaretlenmemiş ilan

    const statusByIndex = new Map();
    for (const a of assessments) {
        const idx = Number(a?.index);
        if (Number.isFinite(idx)) statusByIndex.set(idx, String(a?.status || '').toLowerCase());
    }
    const weightOf = (status) => (status === 'met' ? 1 : status === 'partial' ? 0.5 : 0);
    const ratioOf = (subset) => (subset.length === 0
        ? null
        : subset.reduce((sum, r) => sum + weightOf(statusByIndex.get(r.index)), 0) / subset.length);

    const mustRatio = ratioOf(must);
    const niceRatio = ratioOf(nice);
    if (mustRatio === null) return clampScore(niceRatio * 100);
    if (niceRatio === null) return clampScore(mustRatio * 100);
    return clampScore(mustRatio * MUST_WEIGHT + niceRatio * NICE_WEIGHT);
}

/**
 * Gereksinim karşılama oranı → 0-100. Model coverageScore verdiyse onu,
 * vermediyse met/partial/missing sayımından türetir. İkisi de yoksa null.
 */
function coverageScoreOf(coverage) {
    if (!coverage) return null;
    const explicit = clampScore(coverage.coverageScore);
    if (explicit !== null) return explicit;
    const met = Array.isArray(coverage.met) ? coverage.met.length : 0;
    const partial = Array.isArray(coverage.partial) ? coverage.partial.length : 0;
    const missing = Array.isArray(coverage.missing) ? coverage.missing.length : 0;
    const total = met + partial + missing;
    if (total === 0) return null;
    return clampScore(((met + partial * 0.5) / total) * 100);
}

/**
 * Derin tarama skoru = gereksinim karşılama (%60) + STAR kanıt kalitesi (%40).
 *
 * Geriye dönük uyumluluk: model requirementCoverage döndürmezse eski davranışa
 * (yalnızca STAR) düşülür, o da yoksa deneyim + anahtar kelime yedeği çalışır.
 * Böylece eski kayıtlar ve beklenmedik AI çıktıları skoru sıfırlamaz.
 */
export function calculateHybridScore(data, requirements) {
    if (!data) return 0;
    const star = starScoreOf(data.starAnalysis);
    // Zorunlu/tercihen işaretlemesi varsa ağırlıklı kapsama kullanılır;
    // yoksa modelin verdiği tek sayıya düşülür (eski davranış).
    const coverage = weightedCoverageOf(data.requirementCoverage, requirements)
        ?? coverageScoreOf(data.requirementCoverage);

    if (coverage !== null && star !== null) {
        return clampScore(coverage * COVERAGE_WEIGHT + star * STAR_WEIGHT);
    }
    if (coverage !== null) return coverage;
    if (star !== null) return star;

    let score = 0;
    const exp = Number(data.totalYearsOfExperience || 0);
    score += Math.min(exp * 5, 30);
    const matched = Array.isArray(data.matchedKeywords) ? data.matchedKeywords.length : 0;
    const missing = Array.isArray(data.missingKeywords) ? data.missingKeywords.length : 0;
    const totalKeywords = (matched + missing) || 1;
    score += Math.round((matched / totalKeywords) * 40);
    return Math.min(score, 100);
}

export async function analyzeCandidateMatch(jobDescription, candidateProfile, modelId = 'gemini-2.5-flash', options = {}) {
    const safeCandidateProfile = stripPiiForAI(candidateProfile);
    const evidence = await extractCandidateEvidence(jobDescription, safeCandidateProfile, modelId);
    // options.requirements verilirse (zorunlu/tercihen işaretli liste) kapsama
    // skoru madde ağırlıklarıyla hesaplanır.
    const score = calculateHybridScore(evidence.extractedData, options.requirements);

    // Coerce undefined → null so Firestore writes don't reject. The AI
    // sometimes omits starAnalysis or summary fields entirely; downstream
    // updateDoc() refuses any object that contains an `undefined` leaf.
    return {
        ...evidence.evidence,
        scoreData: evidence.extractedData,
        score: score,
        starAnalysis: evidence.extractedData.starAnalysis ?? null,
        requirementCoverage: evidence.extractedData.requirementCoverage ?? null,
        reasons: evidence.evidence.reasoning || [],
        summary: evidence.evidence.summary ?? null,
        agentReasoning: evidence.evidence.reasoning ?? null,
        nextAction: evidence.extractedData.totalYearsOfExperience >= 2 ? "schedule_interview" : "potential_review",
        topSkills: (evidence.extractedData.matchedKeywords || []).map(s => ({ skill: s, relevance: "High" })),
        gapAnalysis: (evidence.extractedData.missingKeywords || []).map(s => ({ gap: s, severity: "Medium", suggestion: "Eğitim veya oryantasyon önerilir" })),
        personalizedMessage: `Merhabalar ${candidateProfile.name || 'Aday'}. Profilinizi inceledim. ${evidence.evidence.summary ?? ''}`
    };
}

export async function analyzeComparativeCandidates(candidates, modelId = 'gemini-2.5-flash') {
    const instruction = `Sen kıdemli bir İK Stratejistisin. Aşağıda sana verilen ${candidates.length} adayı birbirleriyle kıyasla.
    Adayların güçlü yönlerini, birbirlerine göre üstünlüklerini ve zayıf kaldıkları noktaları analiz et.
    
    ÇIKTI FORMATI (Sadece JSON):
    {
      "winner": "Eğer varsa en öne çıkan aday ismi yoksa 'Kararsız'",
      "comparisonSummary": "Genel kıyas dökümü (Turkish)",
      "candidatesInsights": [
        {
          "name": "Aday İsmi",
          "strength": "En büyük fark yaratan özelliği",
          "weakness": "Diğer adaylara göre zayıf kaldığı nokta",
          "fitScore": 0-100 arası sayı
        }
      ],
      "recruitingAdvice": "İK ekibine bu adaylar özelinde stratejik tavsiye (Turkish)"
    }`;

    const candidateData = candidates.map(c => {
        const safe = stripPiiForAI(c);
        return {
            experience: safe.experience,
            skills: safe.skills,
            summary: safe.aiAnalysis?.summary || safe.summary,
            score: safe.combinedScore || safe.matchScore,
        };
    });

    const prompt = buildStructuredPrompt(instruction, { "ADAY_LISTESI": JSON.stringify(candidateData) });
    const model = await getModel(modelId);
    const result = await model.generateContent(prompt);
    return parseAIJson(result.response.text());
}
