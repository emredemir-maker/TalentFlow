// MÜLAKAT RAPORUNUN İÇERİĞİ — kayıtta ne varsa o.
//
// Rapor sayfası CANLI mülakat akışı için yazılmıştı ve o akışın yazdığı
// alanları okuyordu: starScores (S/T/A/R), finalScore, aiSummary, strengths,
// criticalMoments. Manuel görüşme bunların HİÇBİRİNİ yazmıyor. Yazdıkları
// başka:
//
//   aiAnalysis          → { questions:[{question, observation}], summary,
//                           strengths[], concerns[] }
//   requirementVerdicts → [{ requirementIndex, verdict, quote }]
//   evidence            → { score, asked, met, partial, missing,
//                           inconclusive, mustMissing }
//   recommendedOutcome  → 'positive' | 'negative' | 'pending'
//
// Sonuç: manuel görüşmede rapor BOŞ görünüyordu. STAR kutuları "analiz
// edilmedi", yetkinlik radarı çizilmiyordu (undefined köşeler), "yetkinlik
// ortalaması 0.0/10" yazıyordu. Oysa değerlendirme aynı belgenin içinde
// duruyordu — yalnızca kimse okumuyordu.
//
// BURASI OKUYOR. Kayıtta ne varsa onu döndürür, olmayanı uydurmaz.

import { requirementsOf, requirementsFingerprint } from './positionRequirements';

/** Damganın Türkçesi. */
export const VERDICT_LABEL = {
    met: 'Karşılıyor',
    partial: 'Kısmen',
    missing: 'Karşılamıyor',
    inconclusive: 'Karar verilemedi',
};

/** Sonuç önerisinin Türkçesi. Karar İNSANA ait; bunlar yalnızca öneri. */
export const OUTCOME_LABEL = {
    positive: 'Olumlu',
    negative: 'Olumsuz',
    pending: 'Kararsız',
};

/**
 * Sayısal sonucun neden üretilemediği.
 *
 * Bir sistemin ölçemediği şeyi 0 diye yazması, olmayan bir ölçümü varmış gibi
 * göstermektir. Sebebi söylemek ve boş bırakmak doğrusu.
 */
export const NO_SCORE_TEXT = {
    'no-link': 'Sorular ilanın maddelerine bağlı değildi — ölçülecek bir şey yok. '
        + 'Aday sayfasındaki Mülakat Planı\'ndan soru üretirseniz sonraki görüşme ölçülür.',
    'no-verdict': 'Cevaplardan hiçbir maddeye hüküm çıkmadı; hepsi "karar verilemedi" kaldı.',
    stale: 'İlan bu görüşmeden sonra değişti. Damgalar eski madde listesine ait, '
        + 'yeni numaralara dizilirse cevaplar yanlış maddelere yazılır.',
};

/** Metni karşılaştırılabilir hâle getirir (eşleştirme için). */
function normalize(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Gözlem metinlerini SORU METNİNE göre eşler — sıraya göre DEĞİL.
 *
 * Model bir soruyu atlarsa sıra kayar ve gözlem yanlış soruya yazılır. Bu
 * projede aynı sınıf hatanın (numara/sıra kayması) altı ayrı görünümünü
 * düzelttik; yedincisini burada açmıyoruz. Eşleşme bulunamazsa gözlem
 * gösterilmez — yanlış soruya yazmaktansa hiç yazmamak.
 */
function observationsByQuestion(aiAnalysis) {
    const map = new Map();
    for (const item of Array.isArray(aiAnalysis?.questions) ? aiAnalysis.questions : []) {
        const key = normalize(item?.question);
        const text = String(item?.observation || '').trim();
        if (key && text && !map.has(key)) map.set(key, text);
    }
    return map;
}

/**
 * Rapor sayfasının okuyacağı görünüm — kayıttan türetilir.
 *
 * @param {object} session — /interviews/{id} kaydı (aday belgesindeki özetle birleşmiş)
 * @param {object} position — güncel ilan; yoksa madde metinleri gösterilmez
 * @returns {{
 *   mode: string,
 *   evidence: object|null,
 *   outcome: string|null,
 *   recruiterOutcome: string|null,
 *   items: Array,
 *   unlinked: Array,
 *   summary: string,
 *   strengths: string[],
 *   concerns: string[],
 *   requirementsStale: boolean,
 *   legacySchema: boolean,
 *   noScoreReason: string|null,
 *   hasAnything: boolean,
 * }}
 */
export function buildInterviewReport(session, position) {
    const verdicts = Array.isArray(session?.requirementVerdicts) ? session.requirementVerdicts : [];
    const asked = Array.isArray(session?.questions) ? session.questions : [];
    const ai = session?.aiAnalysis || {};
    const evidence = session?.evidence || null;

    // DAMGALAR HANGİ LİSTEYE AİT? İlan görüşmeden sonra değiştiyse madde
    // metinlerini bugünkü listeden okumak, adayın odada verdiği cevabı YANLIŞ
    // maddeye yazmak olur. Metinsiz gösterip sebebini söylüyoruz.
    const stamped = session?.requirementsFingerprint || null;
    const current = position ? requirementsFingerprint(position) : null;
    const requirementsStale = Boolean(stamped && current && stamped !== current);
    const requirements = position && !requirementsStale ? requirementsOf(position) : [];

    const observations = observationsByQuestion(ai);
    const questionByIndex = new Map(
        asked
            .filter((q) => Number.isInteger(Number(q?.requirementIndex)))
            .map((q) => [Number(q.requirementIndex), q])
    );

    const items = verdicts
        .map((v) => {
            const index = Number(v?.requirementIndex);
            const req = requirements[index - 1];
            const q = questionByIndex.get(index);
            return {
                requirementIndex: index,
                text: req?.text || null,
                must: req?.must === true,
                verdict: String(v?.verdict || '').toLowerCase(),
                quote: String(v?.quote || '').trim(),
                question: String(q?.question || '').trim(),
                answer: String(q?.answer || '').trim(),
                observation: observations.get(normalize(q?.question)) || '',
            };
        })
        .filter((it) => Number.isInteger(it.requirementIndex))
        .sort((a, b) => a.requirementIndex - b.requirementIndex);

    // Maddeye bağlı olmayan sorular kaybolmasın: skora girmiyorlar ama
    // konuşuldular ve mülakatçının gözlemi onlara da yazılmış olabilir.
    const unlinked = asked
        .filter((q) => !Number.isInteger(Number(q?.requirementIndex)))
        .map((q) => ({
            question: String(q?.question || '').trim(),
            answer: String(q?.answer || '').trim(),
            observation: observations.get(normalize(q?.question)) || '',
        }))
        .filter((q) => q.question);

    let noScoreReason = null;
    if (requirementsStale) noScoreReason = 'stale';
    else if (verdicts.length === 0) noScoreReason = 'no-link';
    else if (evidence && evidence.score === null) noScoreReason = 'no-verdict';

    const strengths = (Array.isArray(ai.strengths) ? ai.strengths : []).filter(Boolean);
    const concerns = (Array.isArray(ai.concerns) ? ai.concerns : []).filter(Boolean);
    const summary = String(ai.summary || '').trim();

    return {
        mode: session?.mode || 'live',
        evidence,
        outcome: session?.recommendedOutcome || null,
        recruiterOutcome: session?.recruiterOutcome || null,
        items,
        unlinked,
        summary,
        strengths,
        concerns,
        requirementsStale,
        // Şema 1: sayıyı model üretiyordu ve çıpasızdı (canlıda kötü görüşme
        // 90, iyi aday 80 aldı). Aynı listede yeni kayıtlarla kıyaslanmasın.
        legacySchema: Number(session?.evalSchema || 0) > 0 && Number(session.evalSchema) < 2,
        noScoreReason,
        hasAnything: items.length > 0 || unlinked.length > 0 || Boolean(summary),
    };
}

/**
 * Canlı mülakatın yazdığı STAR puanları var mı?
 *
 * Manuel görüşme bunları hiç üretmiyor. Kutuları boş basıp "analiz edilmedi"
 * yazmak, ölçülmeyen bir şeyi ölçülmüş gibi göstermenin yumuşak hâli: ekranda
 * dört kutu görünüyor, hepsi boş, kullanıcı eksik bir şey sanıyor.
 */
export function hasStarScores(session) {
    const s = session?.starScores;
    if (!s) return false;
    return ['S', 'T', 'A', 'R'].some((k) => Number.isFinite(Number(s[k])));
}

/** Canlı akışın yetkinlik radarı için verisi var mı? */
export function hasCompetencyScores(session) {
    const s = session?.starScores;
    if (!s) return false;
    return ['technical', 'communication', 'problemSolving', 'cultureFit', 'adaptability']
        .every((k) => Number.isFinite(Number(s[k])));
}
