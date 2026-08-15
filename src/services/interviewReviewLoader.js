// İncelenecek görüşmeleri toplar.
//
// Aday belgesindeki `interviewSessions[]` yalnızca bir ÖZET taşıyor; damgalar,
// sorular ve transcript tam kayıtta (`interviews/{sessionId}`). İnceleme
// çerçevesi damgalara dayandığı için tam kaydı okumak zorunlu.
//
// Okuma SINIRLI: bir soruda onlarca belge çekmek hem yavaş hem gereksiz.
// Sınıra takılan görüşme sayısı geri döndürülür ve ekranda söylenir —
// "hepsine baktım" izlenimi vermek, bakmadığını gizlemek olur.

import { doc, getDoc } from 'firebase/firestore';

import { db } from '../config/firebase';

/** Tek soruda okunacak en fazla görüşme kaydı. */
export const MAX_SESSIONS = 25;

const norm = (s) => String(s || '').trim().toLocaleLowerCase('tr');

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
            if (s?.id) pending.push({ candidateId: c.id, candidateName: c.name || '', sessionId: String(s.id) });
        }
    }

    const truncated = Math.max(0, pending.length - MAX_SESSIONS);
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

    return { entries, matchedCandidates: matched.length, withoutInterview, truncated };
}
