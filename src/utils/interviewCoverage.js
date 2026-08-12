// CV TARAMASI + MÜLAKAT — iki kanıt, tek görünüm.
//
// Mülakat sonucu CV analizinin ÜZERİNE YAZILMAZ. İkisi ayrı kanıt türü ve
// ikisini de görebilmek gerekiyor: "CV'de yoktu, odada kapandı" cümlesi ancak
// ikisi yan yana durursa kurulabilir. Üzerine yazsaydık, bir hafta sonra
// kimse skorun neden değiştiğini açıklayamazdı.
//
// Birleşim OKUMA ANINDA hesaplanıyor — positionScore.js'in kurduğu düzenin
// aynısı. Kaydedilmiş bir birleşim, kural değişince sessizce eskirdi.
//
// BİRLEŞTİRME KURALI, tek cümle: mülakat hüküm verdiyse mülakat geçerlidir.
//
// İki yönlü, bilerek. Mülakat yalnızca yükseltseydi sistem gerçeği değil
// iyimserliği ölçerdi; CV'de "karşılıyor" yazan bir maddede aday odada hiçbir
// şey anlatamıyorsa bu da bilgidir. Ama düşüş GÖRÜNÜR olmak zorunda: her
// değişiklik `changes` içinde gerekçesi ve alıntısıyla duruyor.
//
// `inconclusive` hiçbir şeyi değiştirmez. Mülakatta soru atlanır, süre biter —
// bunların hiçbiri adayın kusuru değil.

import { calculateHybridScore } from '../services/geminiService';
import { requirementsOf, requirementsFingerprint, isStaleFor } from './positionRequirements';

/** Mülakatın karar verdiği damgalar — bunlar CV yargısını geçersiz kılar. */
const CONCLUSIVE = new Set(['met', 'partial', 'missing']);

/** Analiz kaydından madde değerlendirmeleri (iki olası yerleşim). */
function assessmentsOf(analysis) {
    const direct = analysis?.requirementCoverage?.assessments;
    if (Array.isArray(direct)) return direct;
    const nested = analysis?.scoreData?.requirementCoverage?.assessments;
    return Array.isArray(nested) ? nested : null;
}

/**
 * Adayın bu pozisyon için kayıtlı mülakat damgaları — hâlâ geçerliyse.
 *
 * İlan mülakattan sonra değiştiyse damgalar artık başka maddelere denk gelir.
 * Bugün bu hatanın beş görünümünü düzelttik; altıncısı burada olurdu ve en
 * kötüsü olurdu: adayın odada verdiği cevap yanlış maddeye yazılırdı.
 */
export function interviewCoverageFor(candidate, position) {
    const title = position?.title;
    if (!title) return null;
    const cov = candidate?.interviewCoverage?.[title];
    if (!cov || !Array.isArray(cov.verdicts) || cov.verdicts.length === 0) return null;
    if (cov.requirementsFingerprint !== requirementsFingerprint(position)) return null;
    return cov;
}

/**
 * CV taraması ile mülakat damgalarını birleştirir.
 *
 * @param {object} analysis — candidate.positionAnalyses[position.title]
 * @param {object} candidate
 * @param {object} position
 * @returns {{
 *   hasInterview: boolean,
 *   cvStale: boolean,
 *   assessments: Array|null,
 *   changes: Array<{requirementIndex:number, text:string, must:boolean, from:string, to:string, quote:string}>,
 *   unchanged: number,
 *   inconclusive: Array<{requirementIndex:number, text:string, must:boolean}>,
 *   sessionId: string|null,
 *   date: string|null,
 * }}
 */
export function mergeInterviewCoverage(analysis, candidate, position) {
    const empty = {
        hasInterview: false,
        cvStale: false,
        assessments: assessmentsOf(analysis),
        changes: [],
        unchanged: 0,
        inconclusive: [],
        sessionId: null,
        date: null,
    };

    const cvAssessments = assessmentsOf(analysis);
    if (!cvAssessments) return empty;

    // ÖNCE MÜLAKAT VAR MI? Sıra önemli ve ilk yazdığımda tersti.
    //
    // Bayatlık kontrolü önde olunca, hiç görüşülmemiş bir adayda `cvStale`
    // true dönüyordu ve panel "Mülakat kaydı var ama CV taraması eski" diyordu.
    // Kullanıcı ekranı gösterip "hayır, daha görüşmedim" dedi — panel olmayan
    // bir kaydı VAR diye rapor ediyordu.
    //
    // Mülakat yoksa CV'nin bayat olması bu panelin konusu değil; onu skor
    // kırılımı zaten söylüyor.
    const cov = interviewCoverageFor(candidate, position);
    if (!cov) return empty;

    // Mülakat var ama CV analizi bayat: birleştirilecek geçerli bir taban yok.
    // Eski yargıları yeni numaralara dizip üstüne mülakat eklemek, hatayı
    // katlamak olurdu.
    if (isStaleFor(analysis, position)) return { ...empty, cvStale: true };

    const requirements = requirementsOf(position);
    const byIndex = new Map(cvAssessments.map((a) => [Number(a?.index), a]).filter(([i]) => Number.isFinite(i)));

    const changes = [];
    const inconclusive = [];
    let unchanged = 0;

    for (const v of cov.verdicts) {
        const idx = Number(v?.requirementIndex);
        const req = requirements[idx - 1];
        if (!req) continue;
        const base = byIndex.get(idx);
        const from = String(base?.status || 'unknown').toLowerCase();

        if (!CONCLUSIVE.has(v.verdict)) {
            inconclusive.push({ requirementIndex: idx, text: req.text, must: req.must === true });
            continue;
        }
        if (v.verdict === from) {
            unchanged += 1;
            continue;
        }

        changes.push({
            requirementIndex: idx,
            text: req.text,
            must: req.must === true,
            from,
            to: v.verdict,
            quote: String(v.quote || ''),
        });
        byIndex.set(idx, {
            ...(base || { index: idx }),
            index: idx,
            status: v.verdict,
            // Kaynağı işaretliyoruz: bu damga CV'den değil odadan geldi ve
            // dayanağı adayın kendi cümlesi.
            source: 'interview',
            interviewQuote: String(v.quote || ''),
        });
    }

    return {
        hasInterview: true,
        cvStale: false,
        assessments: [...byIndex.values()].sort((a, b) => a.index - b.index),
        changes,
        unchanged,
        inconclusive,
        sessionId: cov.sessionId || null,
        date: cov.date || null,
    };
}

/**
 * Mülakat sonrası skor — CV skoruyla AYNI ölçekte.
 *
 * Aynı `calculateHybridScore` kullanılıyor; farklı bir formül yazılsaydı iki
 * sayı kıyaslanamaz olurdu ve "mülakattan sonra 65'ten 78'e çıktı" cümlesi
 * anlamsızlaşırdı.
 *
 * STAR CV'den geliyor ve olduğu gibi kalıyor. STAR, CV'nin ne kadar kanıt
 * taşıdığını ölçer; mülakat onu yeniden ölçmedi. Yani mülakatla yükselen bir
 * kapsama, CV'nin kanıt güveniyle çarpılıyor — TEMKİNLİ yön. Adayı olduğundan
 * iyi göstermektense az göstermeyi tercih ediyoruz.
 *
 * @returns {{score: number, cvScore: number, delta: number, hasInterview: boolean, cvStale: boolean}}
 */
export function interviewAdjustedScore(analysis, candidate, position) {
    const cvScore = analysis ? calculateHybridScore(analysis, requirementsOf(position)) : 0;
    const merged = mergeInterviewCoverage(analysis, candidate, position);

    if (!merged.hasInterview || merged.changes.length === 0) {
        return {
            score: cvScore,
            cvScore,
            delta: 0,
            hasInterview: merged.hasInterview,
            cvStale: merged.cvStale,
        };
    }

    const score = calculateHybridScore(
        { ...analysis, requirementCoverage: { ...analysis.requirementCoverage, assessments: merged.assessments } },
        requirementsOf(position)
    );
    return { score, cvScore, delta: score - cvScore, hasInterview: true, cvStale: false };
}

/** Durum adının Türkçesi — değişiklik satırlarında kullanılır. */
export function statusLabel(status) {
    switch (String(status || '').toLowerCase()) {
        case 'met': return 'karşılıyor';
        case 'partial': return 'kısmen';
        case 'missing': return 'yok';
        case 'inconclusive': return 'karar verilemedi';
        default: return 'bilinmiyor';
    }
}

/** Bir değişiklik adayın lehine mi? Arayüz rengini buradan alır. */
export function isUpgrade(from, to) {
    const rank = { missing: 0, unknown: 0, partial: 1, met: 2 };
    return (rank[to] ?? 0) > (rank[from] ?? 0);
}
