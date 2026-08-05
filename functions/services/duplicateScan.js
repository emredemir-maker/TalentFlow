// Pure duplicate-candidate grouping for the maintenance endpoints.
//
// Kept UI/Firestore-free so the grouping rules are unit-testable. The
// /api/maintenance routes read the candidates collection, map docs to the
// plain shape below and call groupDuplicateCandidates().
//
// Identity rule mirrors /api/check-duplicate and bulkWorker's
// findDuplicateCandidate: normalized email first, normalized phone as
// fallback when there is no email.
//
// Korunacak kayıt: her grubun EN DOLU (en zengin) kaydı — kariyer geçmişi,
// yetenekler, özet ve eğitim doluluk puanıyla ölçülür; eşitlikte en eski
// kazanır. Eski "en eskiyi tut" kuralı, sonradan tam ayrıştırılmış bir
// kaydı silip eksik olan ilk kaydı koruyabiliyordu.

// E-posta: yalnızca trim + küçük harf — noktalar anlamlıdır (ali.veli@x.com
// ≠ aliveli@x.com). Telefon: ayraçlar (boşluk, tire, parantez, nokta, artı)
// atılır ki "+90 555 111 22 33" ile "05551112233" gibi yazımlar eşleşsin.
export const normEmail = (s) => (s || '').trim().toLowerCase();
export const normPhone = (s) => (s || '').trim().toLowerCase().replace(/[\s\-().+]/g, '');

/** Kayıt doluluk puanı — hangi kopyanın korunacağını belirler. */
export function richnessOf(c) {
    const exp = Array.isArray(c?.experiences) ? c.experiences.length : 0;
    const skills = Array.isArray(c?.skills) ? c.skills.length : 0;
    return exp * 3 + Math.min(skills, 10) + (c?.summary ? 2 : 0) + (c?.education ? 1 : 0);
}

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
    // richness alanı çağıran tarafından önceden hesaplanmış olabilir
    // (maintenance projeksiyonu ağır alanları UI'a taşımamak için sayıyı
    // kendisi türetir); yoksa buradaki richnessOf devreye girer.
    const rich = (c) => (typeof c.richness === 'number' ? c.richness : richnessOf(c));
    for (const [key, list] of groups) {
        if (list.length < 2) continue;
        const sorted = [...list].sort(
            (a, b) => (rich(b) - rich(a)) || ((a.createdAtMs || 0) - (b.createdAtMs || 0))
        );
        result.push({ key, keep: sorted[0], extras: sorted.slice(1) });
    }
    result.sort((a, b) => b.extras.length - a.extras.length);
    return result;
}
