// Pozisyon eşleşme onarımı — bakım aracının salt mantığı (Firestore'suz,
// birim test edilebilir).
//
// Geçmişte Gemini'nin serbest metin pozisyon başlıkları doğrulanmadan
// matchedPositionTitle alanına yazıldı; sistemde olmayan başlıklar oluştu.
// Bu modül mevcut kayıtları deterministik kurallarla onarır — YENİ AI
// çağrısı yapmaz ve skorlara dokunmaz:
//   1. positionId açık bir pozisyona işaret ediyorsa o BAĞLAYICIDIR.
//   2. Mevcut başlık açık pozisyonlardan birine (büyük/küçük harf ve boşluk
//      duyarsız) uyuyorsa kanonik yazımına çekilir.
//   3. Toplu yükleme işinin hedef pozisyonu (bulkJobId → iş dokümanı)
//      kurtarılır.
//   4. Anahtar-kelime skoru >0 olan en iyi açık pozisyon seçilir.
//   5. Hiçbiri tutmazsa null + 'Uygun açık pozisyon bulunamadı.' yazılır
//      (yalnızca kayıtta uydurma bir başlık VARSA — hiç taranmamış boş
//      kayıtlara dokunulmaz).
import { matchOpenTitle, calculateSimpleMatchScore } from './bulkWorker.js';

const NO_MATCH_REASON = 'Uygun açık pozisyon bulunamadı.';

/**
 * Tek aday için onarım planı üret.
 * @param {object} candidate — {id, matchedPositionTitle, positionId, bulkJobId, position, skills}
 * @param {Array<{id:string,title:string}>} openPositions
 * @param {Map<string,{positionId?:string,positionTitle?:string}>} jobsById — bulkJobId → iş dokümanı
 * @returns {null | {update: object, rule: 'assignment'|'canonical'|'job'|'keyword'|'none'}}
 */
export function planMatchRepair(candidate, openPositions, jobsById = new Map()) {
    const titles = openPositions.map((p) => p.title);
    const byId = new Map(openPositions.map((p) => [p.id, p]));
    const byTitle = new Map(openPositions.map((p) => [p.title, p]));
    const cur = candidate.matchedPositionTitle;

    // 1. İşe alım uzmanı ataması bağlayıcı
    const assigned = candidate.positionId ? byId.get(candidate.positionId) : null;
    if (assigned) {
        if (cur === assigned.title) return null;
        return { update: { matchedPositionTitle: assigned.title }, rule: 'assignment' };
    }

    // 2. Başlık zaten açık bir pozisyona uyuyorsa kanonikleştir + id bağla
    const canon = matchOpenTitle(cur, titles);
    if (canon) {
        const pos = byTitle.get(canon);
        if (canon === cur && candidate.positionId) return null;
        return {
            update: { matchedPositionTitle: canon, positionId: pos?.id || '' },
            rule: 'canonical',
        };
    }

    // 3. Toplu yükleme işinin hedef pozisyonunu kurtar
    const job = candidate.bulkJobId ? jobsById.get(candidate.bulkJobId) : null;
    if (job) {
        const jobPos = (job.positionId && byId.get(job.positionId)) ||
            (matchOpenTitle(job.positionTitle, titles) ? byTitle.get(matchOpenTitle(job.positionTitle, titles)) : null);
        if (jobPos) {
            return {
                update: { matchedPositionTitle: jobPos.title, positionId: jobPos.id },
                rule: 'job',
            };
        }
    }

    // Kayıtta hiç başlık yoksa (taranmamış/boş) dokunma — 'null sentinel'
    // yalnızca uydurma başlıkları temizlemek için yazılır.
    if (!cur) return null;

    // 4. Anahtar-kelime: >0 skorlu en iyi açık pozisyon
    let best = { score: 0, pos: null };
    for (const p of openPositions) {
        const s = calculateSimpleMatchScore(candidate, p.title);
        if (s > best.score) best = { score: s, pos: p };
    }
    if (best.pos) {
        return {
            update: { matchedPositionTitle: best.pos.title, positionId: best.pos.id },
            rule: 'keyword',
        };
    }

    // 5. Uydurma başlık, hiçbir açık pozisyona bağlanamadı
    return {
        update: { matchedPositionTitle: null, matchReason: NO_MATCH_REASON },
        rule: 'none',
    };
}

/**
 * Tüm adaylar için onarım planları. Dönen liste yalnızca değişiklik
 * gerektiren kayıtları içerir.
 */
export function planMatchRepairs(candidates, openPositions, jobsById = new Map()) {
    const plans = [];
    for (const c of candidates) {
        const plan = planMatchRepair(c, openPositions, jobsById);
        if (plan) plans.push({ id: c.id, ...plan });
    }
    return plans;
}

/** Onarım planı için iş dokümanı gereken bulkJobId'leri topla (tekil). */
export function collectJobIdsNeedingLookup(candidates, openPositions) {
    const titles = openPositions.map((p) => p.title);
    const byId = new Map(openPositions.map((p) => [p.id, p]));
    const ids = new Set();
    for (const c of candidates) {
        if (!c.bulkJobId) continue;
        if (c.positionId && byId.has(c.positionId)) continue;
        if (matchOpenTitle(c.matchedPositionTitle, titles)) continue;
        ids.add(c.bulkJobId);
    }
    return [...ids];
}
