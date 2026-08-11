// Tek aday için derin (otonom) tarama çekirdeği — UI'sız, yeniden
// kullanılabilir. Adaylar tablosundaki "Otonom Tarama" toplu aksiyonu bunu
// kullanır. Kurallar SystemScanner.processOne ile AYNIDIR (kanıt kontrolü,
// atanan pozisyonun bağlayıcılığı, akıllı top-5 sınırı, 0 puanın "en iyi"
// sayılmaması, scoringStage kapısı) — birinde davranış değişirse diğerine de
// uygulanmalı; uzun vadede SystemScanner'ın bu servise taşınması planlı.
import { analyzeCandidateMatch } from './geminiService';
import { calculateMatchScore, filterPositionsByDomain, findBestPositionMatch } from './matchService';
import { buildJobDescription, requirementsOf, requirementsFingerprint } from '../utils/positionRequirements';
import { COVERAGE_SCHEMA } from '../utils/coverageDetail';

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
 * Adayı açık pozisyonlara karşı derinlemesine analiz eder.
 * @param {object} candidate
 * @param {Array} openPositions
 * @param {{allowUnrelatedFallback?: boolean}} [options] — uyumlu pozisyon
 *   yokken en yakın pozisyona düşülsün mü (toplu tarama: evet, tekil
 *   yeniden analiz: hayır)
 * @returns {Promise<{status: 'scanned'|'skipped_no_cv'|'no_result'|'no_compatible_position'|'analysis_failed', updates?: object, failures?: Array<{position: string, message: string}>, aiCalls: number}>}
 *   - skipped_no_cv: CV gövdesi yok — skor çökertmek yerine atlandı (yeniden ayrıştırma gerekli)
 *   - analysis_failed: denenen TÜM pozisyonlarda AI çağrısı hata verdi
 *     (kota, bozuk yanıt, ağ). Teknik hatadır; adayın uygunluğuyla ilgisi yok.
 *   - no_result: çağrılar döndü ama hiçbiri >0 skor üretmedi (skor alanlarına dokunulmaz)
 *   - no_compatible_position: adayın domain'ine uygun açık pozisyon yok
 */
export async function deepScanCandidate(candidate, openPositions, options = {}) {
    const { allowUnrelatedFallback = true } = options;
    // Kanıt kontrolü: boş girdiyle derin analiz tek haneli skor üretir
    const cvBody = `${candidate.cvData || ''}${candidate.cvText || ''}`.trim();
    const hasEvidence = cvBody.length >= 40 || (candidate.experiences?.length > 0);
    if (!hasEvidence) return { status: 'skipped_no_cv', aiCalls: 0 };

    const compatible = filterPositionsByDomain(candidate, openPositions);
    const assignedPos = candidate.positionId
        ? openPositions.find((p) => p.id === candidate.positionId) || null
        : null;

    // Akıllı sınır: >5 uyumlu pozisyonda ücretsiz anahtar-kelime skoruyla
    // ön-sıralanıp yalnızca en iyi 5'i AI'a gönderilir
    const ranked = compatible.length > 5
        ? [...compatible]
            .map((p) => ({ p, s: calculateMatchScore(candidate, p)?.score || 0 }))
            .sort((a, b) => b.s - a.s)
            .slice(0, 5)
            .map((x) => x.p)
        : compatible;
    let positionsToAnalyze = ranked;
    if (assignedPos && !positionsToAnalyze.some((p) => p?.id === assignedPos.id)) {
        positionsToAnalyze = [assignedPos, ...positionsToAnalyze];
    }
    if (positionsToAnalyze.length === 0) {
        // Toplu taramada bir aday hiç sonuçsuz kalmasın diye en yakın
        // pozisyona düşülür. Tekil "yeniden analiz" akışında bu istenmez:
        // domain'ine uygun pozisyon yokken rastgele bir ilana karşı analiz,
        // adayın profiline yanıltıcı bir skor yazar (İK adayının "Project
        // Manager"a %55 alması vakası).
        if (!allowUnrelatedFallback) return { status: 'no_compatible_position', aiCalls: 0 };
        positionsToAnalyze = [findBestPositionMatch(candidate, openPositions) || openPositions[0]].filter(Boolean);
    }

    const updatedAnalyses = { ...(candidate.positionAnalyses || {}) };
    let highestScore = -1;
    let bestResult = null;
    let bestTitle = candidate.matchedPositionTitle;
    let aiCalls = 0;
    let attempted = 0;
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
            // 0 puanlı sonuç "en iyi" kabul edilmez
            if (result.score > highestScore && result.score > 0) {
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
        // Hepsi patladıysa bu bir CV/uygunluk sorunu DEĞİL, teknik hatadır.
        if (attempted > 0 && failures.length === attempted) {
            return { status: 'analysis_failed', failures, aiCalls };
        }
        // Çağrılar döndü ama hiçbiri 0'dan büyük skor üretmedi.
        return { status: 'no_result', failures, aiCalls };
    }

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
        matchedPositionTitle: assignedPos ? assignedPos.title : bestTitle,
        lastScannedAt: new Date().toISOString(),
    };
    // Ortak matchScore yalnızca 'initial' aşamada AI tarafından ezilebilir
    if ((candidate.scoringStage || 'initial') === 'initial') {
        updates.matchScore = bestResult.score;
    }
    return { status: 'scanned', updates, aiCalls };
}

/**
 * Adayı TEK bir pozisyona karşı yeniden analiz eder.
 *
 * Pozisyonun gereksinimleri değiştiğinde tüm havuzu `deepScanCandidate` ile
 * taramak gereksiz pahalıdır (aday başına 5'e kadar AI çağrısı); değişen
 * yalnızca o pozisyondur. Bu primitif aday başına TEK çağrı yapar ve
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
    const cvBody = `${candidate.cvData || ''}${candidate.cvText || ''}`.trim();
    const hasEvidence = cvBody.length >= 40 || (candidate.experiences?.length > 0);
    if (!hasEvidence) return { status: 'skipped_no_cv', aiCalls: 0 };
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
