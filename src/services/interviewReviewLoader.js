// İncelenecek görüşmeleri toplar.
//
// Aday belgesindeki `interviewSessions[]` yalnızca bir ÖZET taşıyor; damgalar,
// sorular ve transcript tam kayıtta (`interviews/{sessionId}`). İnceleme
// çerçevesi damgalara dayandığı için tam kaydı okumak zorunlu.
//
// ── ÖRNEKLEM ────────────────────────────────────────────────────────────────
// Okuma SINIRLI. İlk sürümde seçim adayların DİZİ SIRASINA göreydi: 200
// görüşmeden "ilk 25"i alınıyor ve dağılımı genel tabloymuş gibi sunuluyordu.
// Keyfi bir alt kümeden çıkan yüzdeyi bütünün yüzdesi diye göstermek, bu
// projede tekrar tekrar düzelttiğimiz hatanın ta kendisi — bu kez benim
// bıraktığım hâliyle.
//
// İki şey değişti:
//   1. Seçim DETERMİNİSTİK: en yeni görüşmeler önce. Kural keyfi değil ve
//      ekranda yazıyor.
//   2. Kesme olduğunda bu bilgi anlatıcıya da gidiyor; "genel olarak" diye
//      başlayan bir cümle kurması engelleniyor (services/ai/interviewReviewer.js).

import { doc, getDoc } from 'firebase/firestore';

import { db } from '../config/firebase';

/** Tek soruda okunacak en fazla görüşme kaydı. */
export const MAX_SESSIONS = 60;

const norm = (s) => String(s || '').trim().toLocaleLowerCase('tr');

/** Görüşmenin zamanı — sıralama için. Tarihsizler en sona. */
function sessionTime(summary) {
    const raw = summary?.date || summary?.createdAt || summary?.startedAt;
    const ms = raw ? Date.parse(typeof raw === 'string' ? raw : String(raw)) : NaN;
    return Number.isFinite(ms) ? ms : -Infinity;
}

/**
 * Adayları pozisyon ve/veya isme göre süzer, görüşme kayıtlarını çeker.
 *
 * @param {{candidates: Array, position?: string, candidateName?: string}} input
 * @returns {Promise<{entries: Array<{candidateId: string, candidateName: string, session: object}>,
 *   matchedCandidates: number, withoutInterview: number, truncated: number}>}
 */
export async function loadInterviewEntries({ candidates = [], position = '', candidateName = '' } = {}) {
    const wantedPosition = norm(position);
    const wantedName = norm(candidateName);

    const matched = (candidates || []).filter((c) => {
        if (wantedName && !norm(c?.name).includes(wantedName)) return false;
        if (!wantedPosition) return true;
        // Aday bu pozisyona bağlıysa ya da o başlıkta eşleşmesi varsa say.
        return norm(c?.matchedPositionTitle) === wantedPosition
            || norm(c?.position) === wantedPosition
            || Boolean(c?.interviewCoverage?.[position]);
    });

    const pending = [];
    let withoutInterview = 0;
    for (const c of matched) {
        const sessions = Array.isArray(c?.interviewSessions) ? c.interviewSessions : [];
        if (sessions.length === 0) { withoutInterview += 1; continue; }
        for (const s of sessions) {
            if (s?.id) {
                pending.push({
                    candidateId: c.id,
                    candidateName: c.name || '',
                    sessionId: String(s.id),
                    at: sessionTime(s),
                });
            }
        }
    }

    // EN YENİ ÖNCE. Keyfi bir alt küme yerine savunulabilir ve söylenebilir
    // bir kural: "en yeni N görüşmeye baktım".
    pending.sort((a, b) => b.at - a.at);

    const totalSessions = pending.length;
    const truncated = Math.max(0, totalSessions - MAX_SESSIONS);
    const slice = pending.slice(0, MAX_SESSIONS);

    const entries = [];
    for (const p of slice) {
        try {
            const snap = await getDoc(doc(db, 'interviews', p.sessionId));
            if (!snap.exists()) continue;
            entries.push({ candidateId: p.candidateId, candidateName: p.candidateName, session: snap.data() });
        } catch {
            // Tek bir kaydın okunamaması incelemeyi durdurmaz; sayı zaten
            // `entries.length` üzerinden raporlanıyor.
        }
    }

    return {
        entries,
        matchedCandidates: matched.length,
        withoutInterview,
        truncated,
        totalSessions,
        // Örneklem kuralı ekranda ve prompt'ta yazsın: kesme varken çıkan
        // dağılım BÜTÜNÜN değil, bu alt kümenin dağılımıdır.
        selection: truncated > 0 ? 'en-yeni' : 'tamami',
    };
}
