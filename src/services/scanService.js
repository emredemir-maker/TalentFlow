// Tek aday için detaylı analiz çekirdeği — UI'sız, yeniden kullanılabilir.
// Adaylar tablosundaki "Detaylı analiz" toplu aksiyonu ve aday ekranındaki
// "Detaylı analizi başlat" bunu kullanır. Pozisyon seçimi planDetailedAnalysis
// ile yapılır; SystemScanner de aynı planı kullanır — biri değişirse diğeri de
// değişmiş olur.
import { analyzeCandidateMatch } from './geminiService';
import { calculateMatchScore, filterPositionsByDomain, findBestPositionMatch } from './matchService';
import { buildJobDescription, requirementsOf, requirementsFingerprint } from '../utils/positionRequirements';
import { COVERAGE_SCHEMA } from '../utils/coverageDetail';

// ── DETAYLI ANALİZ KOTASI ────────────────────────────────────────────────────
//
// Kota birimi: BİR aday–pozisyon karşılaştırması = 1 detaylı analiz. Bir
// adayı 3 pozisyonla karşılaştırmak kotadan 3 düşer. Her karşılaştırma iki AI
// çağrısıdır (kapsama + anlatım) ve sunucudaki kullanım ölçümünde (functions/
// services/usage.js) `coverage` etiketi karşılaştırma başına TAM BİR kez
// sayılır — gelecekteki kota o sayıyı okuyabilir.
//
// Varsayılan: aday YALNIZCA atandığı pozisyonla karşılaştırılır. "Diğer uygun
// pozisyonlarla da karşılaştır" ayrı ve açık bir seçimdir. Eskiden her tarama
// en uygun 5 pozisyonu + atanan pozisyonu (6'ya kadar karşılaştırma, 12 AI
// çağrısı) kendiliğinden analiz ediyordu ve kullanıcı bunu göremiyordu.

/** Akıllı sınır: "diğer pozisyonlar" seçiliyken AI'a giden en fazla pozisyon. */
export const OTHER_POSITIONS_LIMIT = 5;

/** Derin analiz için yeterli kanıt var mı? Boş girdi tek haneli skor üretir. */
export function hasCvEvidence(candidate) {
    const cvBody = `${candidate?.cvData || ''}${candidate?.cvText || ''}`.trim();
    return cvBody.length >= 40 || (candidate?.experiences?.length > 0);
}

/** findBestPositionMatch kopya döndürür; kayda orijinal pozisyon gitsin. */
function originalOf(match, positions) {
    if (!match) return null;
    return positions.find((p) => p === match || (p?.id != null && p.id === match.id)) || match;
}

/**
 * Adayın ASIL pozisyonu: işe alım uzmanının atadığı (bağlayıcı); atama
 * yoksa ön analizin eşleştirdiği (`matchedPositionTitle`), o da yoksa alanına
 * uyan en iyi anahtar-kelime eşleşmesi. `allowUnrelatedFallback` ile alanına
 * uyan pozisyon yokken en yakın açık pozisyona düşülür.
 */
export function primaryPositionFor(candidate, openPositions, options = {}) {
    const { allowUnrelatedFallback = true, compatible } = options;
    const open = (openPositions || []).filter(Boolean);
    const assigned = candidate?.positionId ? open.find((p) => p.id === candidate.positionId) : null;
    if (assigned) return assigned;
    const compat = compatible || filterPositionsByDomain(candidate, open);
    const matched = candidate?.matchedPositionTitle
        ? compat.find((p) => p.title === candidate.matchedPositionTitle)
        : null;
    if (matched) return matched;
    const best = originalOf(findBestPositionMatch(candidate, compat), compat) || compat[0] || null;
    if (best) return best;
    if (!allowUnrelatedFallback) return null;
    return originalOf(findBestPositionMatch(candidate, open), open) || open[0] || null;
}

/**
 * Bu aday HANGİ pozisyonlarla karşılaştırılacak? Dönen dizinin uzunluğu,
 * işlemin kotadan düşeceği detaylı analiz sayısıdır.
 *
 * @param {object} candidate
 * @param {Array} openPositions
 * @param {{includeOtherPositions?: boolean, allowUnrelatedFallback?: boolean,
 *   smartLimit?: boolean, targetPosition?: object|null}} [options]
 *   - includeOtherPositions: atanan pozisyona ek olarak alanına uyan diğer
 *     pozisyonlar (akıllı sınırla en iyi 5) — açık seçim, varsayılan kapalı
 *   - targetPosition: yalnızca bu pozisyon (hedefli tarama)
 * @returns {Array} pozisyonlar
 */
export function planDetailedAnalysis(candidate, openPositions, options = {}) {
    const {
        includeOtherPositions = false,
        allowUnrelatedFallback = true,
        smartLimit = true,
        targetPosition = null,
    } = options;
    if (!hasCvEvidence(candidate)) return [];
    if (targetPosition) return [targetPosition];

    const open = (openPositions || []).filter(Boolean);
    const compatible = filterPositionsByDomain(candidate, open);
    const primary = primaryPositionFor(candidate, open, { allowUnrelatedFallback, compatible });
    if (!includeOtherPositions) return primary ? [primary] : [];

    // Ücretsiz anahtar-kelime skoruyla ön sıralama — yalnızca en iyi 5 AI'a.
    // calculateMatchScore OBJE döndürür; .score alınmazsa sıralama NaN olur.
    const ranked = smartLimit && compatible.length > OTHER_POSITIONS_LIMIT
        ? [...compatible]
            .map((p) => ({ p, s: calculateMatchScore(candidate, p)?.score || 0 }))
            .sort((a, b) => b.s - a.s)
            .slice(0, OTHER_POSITIONS_LIMIT)
            .map((x) => x.p)
        : compatible;
    if (!primary) return ranked;
    return ranked.some((p) => p === primary || (p?.id != null && p.id === primary.id))
        ? ranked
        : [primary, ...ranked];
}

/**
 * Bir işlemin kaç detaylı analiz (kota birimi) kullanacağı. Arayüz bunu
 * işlem başlamadan gösterir; ileride kota kontrolü de bu sayıyı kullanır.
 */
export function countDetailedComparisons(candidates, openPositions, options = {}) {
    return (candidates || []).reduce(
        (sum, c) => sum + planDetailedAnalysis(c, openPositions, options).length,
        0
    );
}

/** Arayüzdeki tek tip kota cümlesi. */
export function detailedAnalysisUsageText(count) {
    const n = Number(count) || 0;
    return n === 0
        ? 'Bu işlem detaylı analiz kullanmaz.'
        : `Bu işlem ${n} detaylı analiz kullanır.`;
}

/**
 * Adayın analizinin BELİRLİ bir pozisyon için tazelenmesi gerekiyor mu?
 * Pozisyonun içeriği (gereksinimler/başlık) değiştiğinde kayıtlı analiz
 * artık eski metne aittir; skoru olduğu gibi göstermek yanıltıcıdır.
 */
export function hasAnalysisForPosition(candidate, positionTitle) {
    return Boolean(candidate?.positionAnalyses?.[positionTitle]);
}

/** Firestore `undefined` kabul etmez — AI'nın eksik alanları null'a çevrilir. */
function sanitizeForFirestore(value) {
    if (value === undefined || value === null) return null;
    if (Array.isArray(value)) return value.map(sanitizeForFirestore);
    if (typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = sanitizeForFirestore(v);
        return out;
    }
    return value;
}

/**
 * Adayın detaylı analizini çalıştırır. Varsayılan: YALNIZCA atandığı
 * (yoksa ön analizin eşleştirdiği) pozisyon — 1 detaylı analiz.
 * @param {object} candidate
 * @param {Array} openPositions
 * @param {{allowUnrelatedFallback?: boolean, includeOtherPositions?: boolean}} [options]
 *   - allowUnrelatedFallback: uyumlu pozisyon yokken en yakın pozisyona
 *     düşülsün mü (toplu tarama: evet, tekil yeniden analiz: hayır)
 *   - includeOtherPositions: "Diğer uygun pozisyonlarla da karşılaştır"
 * @returns {Promise<{status: 'scanned'|'skipped_no_cv'|'no_result'|'no_compatible_position'|'analysis_failed', updates?: object, failures?: Array<{position: string, message: string}>, aiCalls: number}>}
 *   - skipped_no_cv: CV gövdesi yok — skor çökertmek yerine atlandı (yeniden ayrıştırma gerekli)
 *   - analysis_failed: denenen TÜM pozisyonlarda AI çağrısı hata verdi
 *     (kota, bozuk yanıt, ağ). Teknik hatadır; adayın uygunluğuyla ilgisi yok.
 *   - no_result: çağrılar döndü ama hiçbiri >0 skor üretmedi (skor alanlarına dokunulmaz)
 *   - no_compatible_position: adayın domain'ine uygun açık pozisyon yok
 */
export async function deepScanCandidate(candidate, openPositions, options = {}) {
    const { allowUnrelatedFallback = true, includeOtherPositions = false } = options;
    // Kanıt kontrolü: boş girdiyle derin analiz tek haneli skor üretir
    if (!hasCvEvidence(candidate)) return { status: 'skipped_no_cv', aiCalls: 0 };

    const assignedPos = candidate.positionId
        ? openPositions.find((p) => p.id === candidate.positionId) || null
        : null;

    // Uyumlu pozisyon yokken en yakın pozisyona düşmek toplu taramada bir
    // aday sonuçsuz kalmasın diye var. Tekil akışta bu istenmez: domain'ine
    // uygun pozisyon yokken rastgele bir ilana karşı analiz, adayın profiline
    // yanıltıcı bir skor yazar (İK adayının "Project Manager"a %55 alması).
    const positionsToAnalyze = planDetailedAnalysis(candidate, openPositions, {
        includeOtherPositions,
        allowUnrelatedFallback,
    });
    if (positionsToAnalyze.length === 0) return { status: 'no_compatible_position', aiCalls: 0 };

    const updatedAnalyses = { ...(candidate.positionAnalyses || {}) };
    let highestScore = -1;
    let bestResult = null;
    let bestTitle = candidate.matchedPositionTitle;
    let aiCalls = 0;
    let attempted = 0;
    // Kaç pozisyon GERÇEKTEN sonuç üretti. "Hepsi patladı" ile "hepsi 0 aldı"
    // farklı şeyler ve farklı mesaj gerektiriyor.
    let produced = 0;
    const failures = [];

    for (const pos of positionsToAnalyze) {
        if (!pos) continue;
        attempted += 1;
        const jobDesc = buildJobDescription(pos);
        try {
            const result = await analyzeCandidateMatch(jobDesc, candidate, 'gemini-2.5-flash', {
                requirements: requirementsOf(pos),
            });
            // Damga: bu analiz HANGİ gereksinim metnine ait. Metin sonradan
            // değişirse gözden geçirme paneli bunu fark edebilsin.
            updatedAnalyses[pos.title] = sanitizeForFirestore({
                ...result,
                requirementsFingerprint: requirementsFingerprint(pos),
                coverageSchema: COVERAGE_SCHEMA,
            });
            aiCalls += 1;
            produced += 1;
            // En iyi sonuç 0 puanlı da olabilir.
            //
            // Eskiden `result.score > 0` şartı vardı ve tüm pozisyonlarda 0
            // alan aday için bestResult null kalıyordu — ARDINDAN bütün
            // analizler çöpe gidiyordu: AI çağrıları yapılmış, para ödenmiş,
            // madde damgaları üretilmiş ama hiçbiri kaydedilmiyordu.
            //
            // Canlıda görüldü: "Analiz tamamlandı ancak hiçbir açık pozisyon
            // için 0'dan büyük skor çıkmadı." Kullanıcı bunu bir yapılandırma
            // hatası sanıp ilan aradı; oysa ölçüm YAPILMIŞTI ve sonucu 0'dı.
            //
            // "Bu aday bu ilanda 0 alıyor" GEÇERLİ bir ölçümdür. Saklanmazsa
            // aday sonsuza kadar bayat analizle kalır ve kullanıcı tekrar
            // tekrar tarayıp aynı parayı yeniden öder.
            if (result.score > highestScore) {
                highestScore = result.score;
                bestResult = result;
                bestTitle = pos.title;
            }
        } catch (err) {
            // Tek pozisyonun analiz hatası taramayı durdurmaz — ama SEBEBİ
            // kaybolmamalı. Eskiden buradaki boş catch, kota aşımını ve
            // bozuk AI yanıtını "CV metnini kontrol edin" mesajına
            // çeviriyordu; CV kusursuzken kullanıcı CV'de hata arıyordu.
            failures.push({ position: pos.title, message: err?.message || String(err) });
        }
    }

    if (!bestResult) {
        // Buraya artık yalnızca HİÇBİR sonuç üretilmediğinde geliniyor —
        // 0 puanlı sonuç da bir sonuçtur ve yukarıda bestResult'a yazılır.
        if (attempted > 0 && failures.length === attempted) {
            return { status: 'analysis_failed', failures, aiCalls };
        }
        return { status: 'no_result', failures, aiCalls };
    }

    // Hiçbir pozisyon 0'ı geçemedi. Analizler yine de KAYDEDİLİR — ölçüm
    // yapıldı, parası ödendi, madde damgaları elimizde. Ama adayın gösterilen
    // pozisyonu değiştirilmez: 0 alan bir ilanı "en iyi eşleşme" diye yazmak,
    // olmayan bir uyumu varmış gibi göstermek olur.
    const noneScored = highestScore <= 0;

    const updates = {
        aiAnalysis: sanitizeForFirestore({
            ...bestResult,
            lastAnalyzedAt: new Date().toISOString(),
            analyzedForPosition: bestTitle,
        }),
        summary: bestResult.summary ?? null,
        aiScore: bestResult.score,
        positionAnalyses: updatedAnalyses,
        // İşe alım uzmanı ataması bağlayıcı — "en iyi eşleşme" onu ezemez
        matchedPositionTitle: assignedPos
            ? assignedPos.title
            : (noneScored ? candidate.matchedPositionTitle ?? bestTitle : bestTitle),
        lastScannedAt: new Date().toISOString(),
    };
    // Ortak matchScore yalnızca 'initial' aşamada AI tarafından ezilebilir
    if ((candidate.scoringStage || 'initial') === 'initial') {
        updates.matchScore = bestResult.score;
    }
    // `noneScored` çağırana bildiriliyor ki arayüz DOĞRU cümleyi kurabilsin:
    // bu bir yapılandırma sorunu değil, bir ölçüm sonucu.
    return { status: 'scanned', updates, aiCalls, noneScored, produced };
}

/**
 * Adayı TEK bir pozisyona karşı yeniden analiz eder.
 *
 * Pozisyonun gereksinimleri değiştiğinde tüm havuzu `deepScanCandidate` ile
 * taramak gereksiz pahalıdır; değişen yalnızca o pozisyondur. Bu primitif
 * aday başına TEK karşılaştırma (1 detaylı analiz) yapar ve
 * `positionAnalyses[title]` kaydını tazeler.
 *
 * @param {object} candidate
 * @param {object} position — güncel (kaydedilmiş) pozisyon objesi
 * @param {{previousTitle?: string}} [options] — başlık değiştiyse eski
 *   anahtar altındaki bayat analiz silinir; aksi halde tabloda iki farklı
 *   skor yan yana yaşamaya devam eder.
 * @returns {Promise<{status: 'scanned'|'skipped_no_cv'|'no_result'|'analysis_failed', updates?: object, failures?: Array<{position: string, message: string}>, aiCalls: number}>}
 */
export async function rescanCandidateForPosition(candidate, position, options = {}) {
    const { previousTitle } = options;
    if (!hasCvEvidence(candidate)) return { status: 'skipped_no_cv', aiCalls: 0 };
    if (!position?.title) return { status: 'no_result', aiCalls: 0 };

    const jobDesc = buildJobDescription(position);
    let result;
    try {
        result = await analyzeCandidateMatch(jobDesc, candidate, 'gemini-2.5-flash', {
            requirements: requirementsOf(position),
        });
    } catch (err) {
        // deepScanCandidate ile aynı ayrım: teknik hata ≠ düşük uygunluk
        return {
            status: 'analysis_failed',
            failures: [{ position: position.title, message: err?.message || String(err) }],
            aiCalls: 1,
        };
    }
    if (!result || !(result.score > 0)) return { status: 'no_result', failures: [], aiCalls: 1 };

    const updatedAnalyses = { ...(candidate.positionAnalyses || {}) };
    if (previousTitle && previousTitle !== position.title) delete updatedAnalyses[previousTitle];
    updatedAnalyses[position.title] = sanitizeForFirestore({
        ...result,
        requirementsFingerprint: requirementsFingerprint(position),
        coverageSchema: COVERAGE_SCHEMA,
        // POZİSYON BAŞINA TARİH. `lastScannedAt` adayın TAMAMI için tek bir
        // tarih tutuyor; aday üç ilana karşı üç ayrı günde değerlendirildiyse
        // o alan hangisinin ne zaman yapıldığını söyleyemiyor. Ekran "bu skor
        // ne zamanki" sorusuna cevap verebilmeli.
        analyzedAt: new Date().toISOString(),
    });

    const updates = {
        positionAnalyses: updatedAnalyses,
        lastScannedAt: new Date().toISOString(),
    };

    // Adayın GÖSTERİLEN pozisyonu bu ise başlıktaki skor da tazelenir;
    // başka bir pozisyona bakıyorsa onun analizine dokunulmaz.
    const showsThisPosition = candidate.matchedPositionTitle === position.title
        || candidate.matchedPositionTitle === previousTitle
        || candidate.positionId === position.id;
    if (showsThisPosition) {
        updates.aiAnalysis = sanitizeForFirestore({
            ...result,
            lastAnalyzedAt: new Date().toISOString(),
            analyzedForPosition: position.title,
        });
        updates.summary = result.summary ?? null;
        updates.aiScore = result.score;
        updates.matchedPositionTitle = position.title;
        if ((candidate.scoringStage || 'initial') === 'initial') {
            updates.matchScore = result.score;
        }
    }
    return { status: 'scanned', updates, aiCalls: 1 };
}
