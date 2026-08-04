// Pure duplicate-candidate grouping for the maintenance endpoints.
//
// Kept UI/Firestore-free so the grouping rules are unit-testable. The
// /api/maintenance routes read the candidates collection, map docs to the
// plain shape below and call groupDuplicateCandidates().
//
// Identity rule mirrors /api/check-duplicate and bulkWorker's
// findDuplicateCandidate: normalized email first, normalized phone as
// fallback when there is no email. The OLDEST record in each group is the
// one to keep; everything after it is a deletable "extra".

// E-posta: yalnızca trim + küçük harf — noktalar anlamlıdır (ali.veli@x.com
// ≠ aliveli@x.com). Telefon: ayraçlar (boşluk, tire, parantez, nokta, artı)
// atılır ki "+90 555 111 22 33" ile "05551112233" gibi yazımlar eşleşsin.
export const normEmail = (s) => (s || '').trim().toLowerCase();
export const normPhone = (s) => (s || '').trim().toLowerCase().replace(/[\s\-().+]/g, '');

/**
 * @param {Array<{id: string, name?: string, email?: string, phone?: string, createdAtMs?: number}>} candidates
 * @returns {Array<{key: string, keep: object, extras: object[]}>} groups with 2+ members, largest first
 */
export function groupDuplicateCandidates(candidates) {
    const groups = new Map();
    for (const c of candidates) {
        const email = normEmail(c.email);
        const phone = normPhone(c.phone);
        const key = email ? `e:${email}` : phone ? `p:${phone}` : null;
        if (!key) continue; // kimliklendirilemeyen kayıt gruplanamaz
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(c);
    }
    const result = [];
    for (const [key, list] of groups) {
        if (list.length < 2) continue;
        const sorted = [...list].sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
        result.push({ key, keep: sorted[0], extras: sorted.slice(1) });
    }
    result.sort((a, b) => b.extras.length - a.extras.length);
    return result;
}
