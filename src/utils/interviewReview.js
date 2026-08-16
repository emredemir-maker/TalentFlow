// MÜLAKAT İNCELEMESİNİN ÇERÇEVESİ — sayılar burada, yorum modelde.
//
// Asistanın ikinci aracı. Tek aracı varken (aday sorgusu) "bu pozisyonda
// görüşülenler nasıldı" sorusu ifade bile edilemiyordu.
//
// Projenin değişmeyen kuralı burada da geçerli: ÖLÇÜM KODDA, model yalnızca
// ifade eder. Damga dağılımı, kanıt oranı, hiç sorulmamış maddeler — hepsi
// buradan çıkar. Modele "kaç aday zorunlulukları kapattı" diye sormak, bu
// projede iki kez uydurma cevap üretti.
//
// Tek tek raporları `buildInterviewReport` zaten üretiyor; bu dosya onları
// TOPLAR ve karşılaştırılabilir hâle getirir.

import { buildInterviewReport, VERDICT_LABEL } from './interviewReport';
import { requirementsOf } from './positionRequirements';

const VERDICTS = ['met', 'partial', 'missing', 'inconclusive'];

/** Boş damga sayacı. */
const emptyTally = () => ({ met: 0, partial: 0, missing: 0, inconclusive: 0 });

/**
 * Birden çok görüşmeyi tek çerçevede toplar.
 *
 * @param {Array<{candidateId?: string, candidateName?: string, session: object}>} entries
 * @param {object|null} position — damgaların ait olduğu ilan
 * @returns {{
 *   position: string|null,
 *   interviewCount: number,
 *   scored: number,
 *   perCandidate: Array,
 *   tally: object,
 *   requirementCoverage: Array,
 *   neverAsked: Array,
 *   unscored: Array,
 *   staleCount: number,
 * }}
 */
export function buildInterviewReview(entries = [], position = null) {
    const list = Array.isArray(entries) ? entries : [];
    const requirements = position ? requirementsOf(position) : [];

    const tally = emptyTally();
    // Madde başına hangi adayda ne çıktı — "hangi madde havuzu eliyor"
    // sorusunun cevabı burada.
    const perRequirement = new Map(
        requirements.map((r, i) => [i + 1, { index: i + 1, text: r.text, must: r.must === true, ...emptyTally(), asked: 0 }])
    );

    const perCandidate = [];
    const unscored = [];
    let staleCount = 0;
    let scored = 0;

    for (const entry of list) {
        const name = String(entry?.candidateName || 'İsimsiz aday');
        const report = buildInterviewReport(entry?.session, position);
        if (report.requirementsStale) staleCount += 1;

        // SAYISAL SONUCU OLMAYAN GÖRÜŞME SESSİZCE DÜŞMEZ. "3 görüşmenin
        // ortalaması" derken 2'sinin hiç ölçülmediğini söylememek, olmayan bir
        // ölçümü varmış gibi göstermek olurdu.
        if (!report.evidence || report.evidence.score === null) {
            unscored.push({ name, reason: report.noScoreReason || 'bilinmiyor' });
            continue;
        }
        scored += 1;

        for (const item of report.items) {
            if (!VERDICTS.includes(item.verdict)) continue;
            tally[item.verdict] += 1;
            const row = perRequirement.get(item.requirementIndex);
            if (row) { row[item.verdict] += 1; row.asked += 1; }
        }

        perCandidate.push({
            name,
            outcome: report.outcome || null,
            recruiterOutcome: report.recruiterOutcome || null,
            evidenceScore: report.evidence.score,
            mustMissing: report.evidence.mustMissing || 0,
            met: report.evidence.met || 0,
            partial: report.evidence.partial || 0,
            missing: report.evidence.missing || 0,
            inconclusive: report.evidence.inconclusive || 0,
            // Alıntılar KODUN seçtiği alanlardan gelir (damga çağrısı cevaptan
            // çıkardı); anlatım anında model tarafından üretilmez.
            quotes: report.items
                .filter((it) => it.quote && it.verdict !== 'inconclusive')
                .slice(0, 6)
                .map((it) => ({
                    requirement: it.text || `${it.requirementIndex}. madde`,
                    verdict: VERDICT_LABEL[it.verdict] || it.verdict,
                    quote: it.quote,
                })),
        });
    }

    const requirementCoverage = [...perRequirement.values()];
    // HİÇ SORULMAMIŞ MADDE bir bulgu: o madde hakkında bilgimiz yok demek,
    // "aday karşılamıyor" demek DEĞİL. Karıştırmak adayı olmayan bir eksikle
    // cezalandırır.
    const neverAsked = requirementCoverage.filter((r) => r.asked === 0);

    return {
        position: position?.title || null,
        interviewCount: list.length,
        scored,
        perCandidate,
        tally,
        requirementCoverage,
        neverAsked,
        unscored,
        staleCount,
    };
}

/**
 * Modele gidecek özet — ham transcript GİRMEZ.
 *
 * Transcript adayın kendi sözleri, yani CV'den bile açık bir enjeksiyon
 * kanalı. Anlatıcıya yalnızca kodun hesapladığı sayılar ve damga çağrısının
 * CEVAPTAN çıkardığı kısa alıntılar gider. Alıntı bir veri alanıdır; prompt
 * onu talimat saymamakla yükümlü.
 */
export function reviewSummaryForPrompt(review, sampling = {}) {
    const okunan = review.interviewCount;
    const toplam = Number(sampling.totalSessions) || okunan;
    return {
        // ÖRNEKLEM PROMPT'A GİRER. Girmezse model, keyfi bir alt kümenin
        // dağılımını bütünün dağılımı gibi anlatır ve kullanıcı bunu fark
        // edemez — "genel olarak adaylar şöyle" cümlesi tam da böyle kurulur.
        orneklem: {
            okunan_gorusme: okunan,
            toplam_gorusme: toplam,
            tamami_mi: toplam <= okunan,
            kural: toplam > okunan ? 'en yeni görüşmeler önce' : null,
        },
        pozisyon: review.position,
        gorusme_sayisi: review.interviewCount,
        sayisal_sonucu_olan: review.scored,
        damga_dagilimi: review.tally,
        madde_kapsami: review.requirementCoverage.map((r) => ({
            madde: r.text,
            zorunlu: r.must,
            soruldu: r.asked,
            karsiliyor: r.met,
            kismen: r.partial,
            karsilamiyor: r.missing,
        })),
        hic_sorulmamis_maddeler: review.neverAsked.map((r) => r.text),
        olculemeyen_gorusmeler: review.unscored,
        eski_madde_listesine_ait: review.staleCount,
        adaylar: review.perCandidate,
    };
}
