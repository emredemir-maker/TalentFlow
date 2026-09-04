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
    'no-questions': 'Bu kayıtta soru-cevap yok; yalnızca transkript ya da not girilmiş. '
        + 'Ölçüm soru bazında yapılıyor.',
    'no-link': 'Sorular ilanın maddelerine bağlı değildi — ölçülecek bir şey yok. '
        + 'Aday sayfasındaki Mülakat Planı\'ndan soru üretirseniz sonraki görüşme ölçülür.',
    // BU SEBEP CANLIDA KAÇIRILDI ve kullanıcıya yanlış iş yaptırdı: sorular
    // plandan gelmişti, bağ VARDI, eksik olan cevaptı. Ekran yine de "sorular
    // maddeye bağlı değil" diyordu.
    'no-answer': 'Sorular maddelere bağlıydı ama cevap kutuları boştu — boş cevaba damga '
        + 'basılamaz. Transkripti yapıştırdıysanız "Transkriptten cevapları doldur" '
        + 'düğmesine basmanız gerekiyor; transkriptin kendisi soru bazında ölçülmüyor.',
    // ÇAĞRI DÜŞTÜ İLE HÜKÜM ÇIKMADI AYNI ŞEY DEĞİL. İkisi de boş damga listesi
    // üretiyor ve ekran ikisine de "hepsi karar verilemedi kaldı" yazıyordu.
    // Bu bir ÖLÇÜM İDDİASI: adayın cevaplarına bakılıp karar verilememiş gibi
    // okunuyor. Oysa çağrı düştüğünde cevaplar hiç okunmadı bile — kullanıcı
    // adayı ya da kendi girdisini suçlu sanıyor.
    'grading-failed': 'Değerlendirme çağrısı sonuç döndüremedi — cevaplarınızda bir sorun yok, '
        + 'sistem tarafındaki çağrı boş döndü. "Yeniden değerlendir" ile tekrar deneyin.',
    'no-verdict': 'Damgalar üretildi ama hiçbiri bir maddeyi kapatmadı; hepsi "karar verilemedi" '
        + 'kaldı. Cevaplar sorulan maddelere değinmemiş olabilir.',
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
/**
 * Soru/damga hangi maddeye ait? Bağ yoksa null.
 *
 * ── SIFIR BİR MADDE NUMARASI DEĞİLDİR ───────────────────────────────────────
 * Numaralar 1 tabanlı (`requirements[index - 1]`). Ama `Number(null)` SIFIRDIR
 * ve `Number.isInteger(0)` DOĞRUDUR: "bağ yok" anlamına gelen boş değer,
 * geçerli bir madde numarası gibi kabul ediliyordu. Sıfır numaralı bir soru
 * hiçbir maddeye karşılık gelmediği için hem madde listesine hem "diğer
 * sorular" listesine giremiyor, rapordan sessizce düşüyordu.
 *
 * Sunucu bu ölçütü zaten böyle uyguluyor (routes/interview.js: `idx > 0`,
 * services/scoreBlockReason: sıfır → 'no-link'). Bu satır istemciyi sunucuyla
 * aynı tanıma getiriyor.
 *
 * @returns {number|null} 1 ve üzeri tam sayı; değilse null
 */
function requirementIndexOf(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
}

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
            .map((q) => [requirementIndexOf(q?.requirementIndex), q])
            .filter(([index]) => index !== null)
    );

    const items = verdicts
        .map((v) => {
            const index = requirementIndexOf(v?.requirementIndex);
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
        .filter((it) => it.requirementIndex !== null)
        .sort((a, b) => a.requirementIndex - b.requirementIndex);

    // ── HİÇBİR SORU KAYBOLMASIN ─────────────────────────────────────────────
    //
    // Eskiden bu liste "numarası olmayan sorular" diye kuruluyordu ve bu,
    // "yukarıda gösterilmeyen sorular" ile AYNI ŞEY DEĞİL. Numarası olan ama
    // damgası çıkmayan bir soru iki listeye de girmiyordu:
    //
    //   • items damgalardan kuruluyor — damga yoksa satır yok
    //   • unlinked numarası olanı dışlıyordu
    //
    // Yani sorulmuş, cevaplanmış ve gözlem yazılmış bir soru RAPORDAN
    // TAMAMEN düşüyordu. Ulaşılabilir bir durum: damgalama boş cevaplı
    // soruları eliyor, model bir maddeyi atlayabiliyor, ilan değiştiğinde
    // numara artık bir maddeye karşılık gelmiyor.
    //
    // Artık ölçüt tek: yukarıdaki madde satırlarından birine GİRDİ Mİ?
    // Girmediyse buraya düşer. Böylece her soru raporda tam olarak bir kez
    // görünür.
    const shown = new Set(
        items.map((it) => questionByIndex.get(it.requirementIndex)).filter(Boolean)
    );
    const unlinked = asked
        .filter((q) => !shown.has(q))
        .map((q) => ({
            question: String(q?.question || '').trim(),
            answer: String(q?.answer || '').trim(),
            observation: observations.get(normalize(q?.question)) || '',
        }))
        .filter((q) => q.question);

    // SEBEBİ SUNUCU BİLİR — o an elinde soru, cevap ve damga hepsi vardı.
    // Buradan geriye dönük tahmin etmek "bağ yok" ile "cevap yok"u ayıramaz;
    // canlıda tam olarak bu ikisi karıştı ve kullanıcı zaten yapmış olduğu işi
    // (plandan soru üretmeyi) tekrar yapmaya gönderildi.
    //
    // Eski kayıtlarda alan yok; onlar için tahmin sürüyor.
    const stored = String(session?.noScoreReason || '');
    const gradingError = String(session?.gradingError || '');
    let noScoreReason = null;
    if (requirementsStale) noScoreReason = 'stale';
    else if (NO_SCORE_TEXT[stored]) noScoreReason = stored;
    else if (verdicts.length === 0) noScoreReason = asked.length === 0 ? 'no-questions' : 'no-link';
    else if (evidence && evidence.score === null) noScoreReason = 'no-verdict';

    const strengths = (Array.isArray(ai.strengths) ? ai.strengths : []).filter(Boolean);
    const concerns = (Array.isArray(ai.concerns) ? ai.concerns : []).filter(Boolean);
    const summary = String(ai.summary || '').trim();

    return {
        // Damga çağrısının hata metni — ekran sebebi tahmin etmesin.
        gradingError: gradingError || null,
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
