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
import { starPercent } from '../utils/starDimensions';

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
// Skor iki bileşenin bileşimidir:
//   - coverage: ilanın gereksinimlerinin CV'de kanıtlanma oranı
//   - STAR: adayın GERÇEKTEN yaptığı işin kanıt kalitesi (durum-görev-
//     eylem-sonuç); "bu kişi bu işi yapmış mı" sorusunun karşılığı
//
// Tarihçe: skor bir dönem yalnızca STAR'dı (ilana hiç bakmıyordu), sonra
// coverage %60 / STAR %40 oldu. İkincisi bu kez ters yöne kaçtı: gereksinim
// listesindeki araç adları (GA4, Amplitude…) CV'de birebir geçmeyince
// yıllarca o işi yapmış adaylar da düşük aldı.
//
// %50/%50 da fazla kaçtı. STAR bir MÜLAKAT aracıdır; CV'ye uygulandığında
// ölçtüğü şey adayın niteliği değil, ne kadar açık edebildiğidir. Gizlilik
// yükümlülüğü olan (ciro, dönüşüm, churn paylaşamayan), CV'yi kısa tutan ya
// da çıktısı kolay sayısallaşmayan rollerdeki adaylar sistematik olarak
// düşük alıyordu. Bu, kimsenin niyeti olmadan dolaylı ayrımcılık üretir.
//
// Uygunluğu asıl gereksinim karşılama belirlemeli; kanıt zenginliği ikincil
// bir sinyal olmalı. Ağırlığı değiştirmek isterseniz tek yer burasıdır;
// sayı değiştikçe geminiService.test.js'teki beklenen skorlar da güncellenir.
const COVERAGE_WEIGHT = 0.7;
const STAR_WEIGHT = 0.3;

/** 0-100 aralığına kırpar; sayı değilse null döner. */
function clampScore(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.min(100, Math.max(0, Math.round(n)));
}

// STAR = KANIT yoğunluğu, 0-100. Hesap starDimensions.starPercent'te — TEK
// yerde. Burada ayrı bir kopya tutmak 2026-08-08'de gerçek bir hataya yol
// açtı: ekrandaki rozet kendi kopyasıyla eski 0-10 ölçeğini varsayıp %25
// gösterirken doğru değer %83'tü. Üçüncü kopyayı bırakmıyoruz.
const starScoreOf = starPercent;

// Öncelik ağırlıkları: zorunlu maddeler skorun gövdesini taşır, tercih
// edilenler sınırlı avantaj sağlar.
const MUST_WEIGHT = 85;
const NICE_WEIGHT = 15;

// Madde TÜRÜ ağırlıkları — "adayın yaptığı iş, araç bilgisinden önemlidir".
// Bir gereksinim kümesi hem yetkinlik ("funnel sahipliği") hem araç ("GA4
// hakimiyeti") maddeleri içerir. Bunları eşit saymak, işi yıllarca yapmış
// ama CV'sinde araç adı geçmeyen adayı gereksiz yere düşürüyordu.
// Kümelerden biri boşsa diğeri tüm ağırlığı alır.
const CAPABILITY_SHARE = 0.75;
const TOOL_SHARE = 0.25;

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
function coverageBreakdown(coverage, requirements) {
    const assessments = coverage?.assessments;
    if (!Array.isArray(assessments) || !Array.isArray(requirements) || requirements.length === 0) return null;

    const indexed = requirements.map((r, i) => ({ ...r, index: i + 1 }));
    const must = indexed.filter((r) => r.must === true);
    const nice = indexed.filter((r) => r.must === false);
    if (must.length === 0 && nice.length === 0) return null; // işaretlenmemiş ilan

    const byIndex = new Map();
    for (const a of assessments) {
        const idx = Number(a?.index);
        if (!Number.isFinite(idx)) continue;
        byIndex.set(idx, {
            status: String(a?.status || '').toLowerCase(),
            // Tür belirtilmemişse "yetkinlik" sayılır: bilinmeyeni araç kabul
            // edip sessizce ağırlığını düşürmek, eski kayıtların skorunu
            // gerçek dışı biçimde yükseltirdi.
            isTool: String(a?.kind || '').toLowerCase().startsWith('ara'),
            note: typeof a?.note === 'string' ? a.note : '',
        });
    }
    const weightOf = (status) => (status === 'met' ? 1 : status === 'partial' ? 0.5 : 0);
    const ratioOf = (subset) => (subset.length === 0
        ? null
        : subset.reduce((sum, r) => sum + weightOf(byIndex.get(r.index)?.status), 0) / subset.length);

    // Her kümenin PAYI ayrıca döndürülür: şeffaflık ekranı madde başına
    // katkıyı buradan türetiyor. Ayrı bir yerde yeniden hesaplansaydı ekran
    // ile gerçek skor zamanla birbirinden ayrılırdı.
    const tierDetail = (tier) => {
        if (tier.length === 0) return null;
        const tools = tier.filter((r) => byIndex.get(r.index)?.isTool);
        const capabilities = tier.filter((r) => !byIndex.get(r.index)?.isTool);
        const capRatio = ratioOf(capabilities);
        const toolRatio = ratioOf(tools);

        // Kümelerden biri boşsa diğeri tüm payı alır
        const capShare = capRatio === null ? 0 : (toolRatio === null ? 1 : CAPABILITY_SHARE);
        const toolShare = toolRatio === null ? 0 : (capRatio === null ? 1 : TOOL_SHARE);
        const ratio = (capRatio ?? 0) * capShare + (toolRatio ?? 0) * toolShare;

        return {
            ratio,
            groups: [
                { kind: 'deneyim', label: 'Yetkinlik', share: capShare, ratio: capRatio, items: capabilities },
                { kind: 'arac', label: 'Araç', share: toolShare, ratio: toolRatio, items: tools },
            ].filter((g) => g.items.length > 0),
        };
    };

    const mustDetail = tierDetail(must);
    const niceDetail = tierDetail(nice);

    // Kefelerden biri boşsa diğeri tüm ağırlığı alır (eski davranış korunur)
    const mustWeight = mustDetail === null ? 0 : (niceDetail === null ? 100 : MUST_WEIGHT);
    const niceWeight = niceDetail === null ? 0 : (mustDetail === null ? 100 : NICE_WEIGHT);
    const raw = (mustDetail?.ratio ?? 0) * mustWeight + (niceDetail?.ratio ?? 0) * niceWeight;
    const score = clampScore(raw);

    const tiers = [
        { key: 'must', label: 'Zorunlu', weight: mustWeight, detail: mustDetail },
        { key: 'nice', label: 'Tercihen', weight: niceWeight, detail: niceDetail },
    ].filter((t) => t.detail !== null);

    return { score, raw, tiers, byIndex, weightOf };
}

/** Geriye dönük ince sarmalayıcı — skor yolu yalnızca sayıyı kullanır. */
function weightedCoverageOf(coverage, requirements) {
    return coverageBreakdown(coverage, requirements)?.score ?? null;
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
/**
 * Skorun TAM kırılımı — şeffaflık ekranı için.
 *
 * "Neden 54?" sorusunun kara kutu kalmaması gerekiyor. Burada üretilen
 * `earned`/`max` puanları toplandığında calculateHybridScore'un döndürdüğü
 * sayıyı verir; ekran yaklaşık bir açıklama değil, GERÇEK hesabı gösterir.
 * Bu yüzden aynı `coverageBreakdown` üzerinden türetilir — ayrı bir hesap
 * yazılsaydı ikisi zamanla birbirinden ayrılırdı.
 *
 * @returns {{score: number, coverage: object|null, star: object|null, weights: object}}
 */
export function explainHybridScore(data, requirements) {
    const score = calculateHybridScore(data, requirements);
    if (!data) return { score: 0, coverage: null, star: null, weights: null };

    const star = starScoreOf(data.starAnalysis);
    const breakdown = coverageBreakdown(data.requirementCoverage, requirements);
    const coverageScore = breakdown?.score ?? coverageScoreOf(data.requirementCoverage);

    // Kapsama ve STAR birlikte varsa 50/50; yalnızca biri varsa o tek başına
    // skoru belirler (calculateHybridScore ile aynı kural).
    const both = coverageScore !== null && star !== null;
    const coverageWeight = coverageScore === null ? 0 : (both ? COVERAGE_WEIGHT : 1);
    const starWeight = star === null ? 0 : (both ? STAR_WEIGHT : 1);

    let coverage = null;
    if (breakdown) {
        const { byIndex, weightOf, tiers } = breakdown;
        // Skor yolu kapsamayı ÖNCE yuvarlayıp sonra ağırlıklandırıyor. Madde
        // puanları ham orandan türetilirse toplam, gösterilen skordan 1 puan
        // sapabiliyor. Aynı yuvarlamayı maddelere de yansıtıyoruz ki ekrandaki
        // sayılar birebir toplansın.
        const roundScale = breakdown.raw === 0 ? 1 : breakdown.score / breakdown.raw;
        coverage = {
            score: breakdown.score,
            weight: coverageWeight,
            points: breakdown.score * coverageWeight,
            tiers: tiers.map((tier) => ({
                key: tier.key,
                label: tier.label,
                weight: tier.weight,
                ratio: tier.detail.ratio,
                groups: tier.detail.groups.map((group) => {
                    // Bir maddenin alabileceği en yüksek puan: kapsama payı ×
                    // kefe ağırlığı × küme payı, küme içinde eşit bölüşülür.
                    const maxPerItem = group.items.length === 0
                        ? 0
                        : (tier.weight * group.share * coverageWeight * roundScale) / group.items.length;
                    return {
                        kind: group.kind,
                        label: group.label,
                        share: group.share,
                        ratio: group.ratio,
                        items: group.items.map((req) => {
                            const a = byIndex.get(req.index);
                            const status = a?.status || 'unknown';
                            return {
                                index: req.index,
                                text: req.text,
                                must: req.must,
                                kind: group.kind,
                                status,
                                note: a?.note || '',
                                max: maxPerItem,
                                earned: maxPerItem * weightOf(status),
                            };
                        }),
                    };
                }),
            })),
        };
    } else if (coverageScore !== null) {
        // Eski kayıt: madde bazlı değerlendirme yok, yalnızca tek sayı
        coverage = { score: coverageScore, weight: coverageWeight, points: coverageScore * coverageWeight, tiers: [] };
    }

    const starDetail = star === null ? null : {
        score: star,
        weight: starWeight,
        points: star * starWeight,
        dimensions: ['Situation', 'Task', 'Action', 'Result'].map((key) => {
            const raw = data.starAnalysis?.[key];
            return {
                key,
                score: typeof raw === 'number' ? raw : Number(raw?.score ?? 0),
                reason: typeof raw === 'object' && raw !== null ? String(raw.reason || '') : '',
            };
        }),
    };

    return {
        score,
        coverage,
        star: starDetail,
        weights: { coverage: coverageWeight, star: starWeight },
    };
}

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
