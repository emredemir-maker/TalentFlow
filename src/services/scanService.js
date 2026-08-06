// Tek aday için derin (otonom) tarama çekirdeği — UI'sız, yeniden
// kullanılabilir. Adaylar tablosundaki "Otonom Tarama" toplu aksiyonu bunu
// kullanır. Kurallar SystemScanner.processOne ile AYNIDIR (kanıt kontrolü,
// atanan pozisyonun bağlayıcılığı, akıllı top-5 sınırı, 0 puanın "en iyi"
// sayılmaması, scoringStage kapısı) — birinde davranış değişirse diğerine de
// uygulanmalı; uzun vadede SystemScanner'ın bu servise taşınması planlı.
import { analyzeCandidateMatch } from './geminiService';
import { calculateMatchScore, filterPositionsByDomain, findBestPositionMatch } from './matchService';

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
 * @returns {Promise<{status: 'scanned'|'skipped_no_cv'|'no_result'|'no_compatible_position', updates?: object, aiCalls: number}>}
 *   - skipped_no_cv: CV gövdesi yok — skor çökertmek yerine atlandı (yeniden ayrıştırma gerekli)
 *   - no_result: hiçbir pozisyon analizi >0 skor üretmedi (skor alanlarına dokunulmaz)
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

    for (const pos of positionsToAnalyze) {
        if (!pos) continue;
        const jobDesc = `${pos.title}\n${(pos.requirements || []).join(', ')}\n${pos.description || ''}`;
        try {
            const result = await analyzeCandidateMatch(jobDesc, candidate, 'gemini-2.5-flash');
            updatedAnalyses[pos.title] = sanitizeForFirestore(result);
            aiCalls += 1;
            // 0 puanlı sonuç "en iyi" kabul edilmez
            if (result.score > highestScore && result.score > 0) {
                highestScore = result.score;
                bestResult = result;
                bestTitle = pos.title;
            }
        } catch {
            // Tek pozisyonun analiz hatası taramayı durdurmaz
        }
    }

    if (!bestResult) return { status: 'no_result', aiCalls };

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
