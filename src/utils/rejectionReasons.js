// RED NEDENLERİ — TEK TANIMLI LİSTE.
//
// ── NEDEN VAR ───────────────────────────────────────────────────────────────
// Red nedeni iki ayrı yerde, iki ayrı şekilde tutuluyordu:
//   • CandidateDrawer — üç seçenekli sabit liste ('not_suitable', 'declined',
//     'wrong_entry')
//   • CandidateProcessPage — SERBEST METİN kutusu
// Aynı alana (`rejectionReason`) iki farklı biçim yazıldığı için analitik
// tarafında "neden kaybediyoruz" sorusu cevaplanamıyordu: metinler sayılamaz,
// üç seçenek de ayrım için fazla kaba.
//
// ── KATEGORİ NEDEN ÖNEMLİ ───────────────────────────────────────────────────
// "Biz eledik" ile "aday çekildi" birbirinden tamamen farklı iki sonuç.
// Birincisi ilan/kriter kalitesini, ikincisi teklif ve süreç hızını sorgular.
// Nedenler bu yüzden kategoriyle geliyor; analitik hem tek tek nedeni hem de
// kategori kırılımını gösterebiliyor.
//
// ── ESKİ KAYITLAR ───────────────────────────────────────────────────────────
// Firestore'da hiçbir kayıt güncellenmiyor. Eski üç kimlik `LEGACY_IDS` ile
// yeni karşılıklarına eşleniyor; serbest metinler ise `resolveRejection`
// tarafından "Diğer" olarak, metni korunarak gösteriliyor.

/** Nedenin kime ait olduğu — analitik kırılımının ekseni. */
export const REJECTION_CATEGORIES = [
    { id: 'company',   label: 'Şirket kararı', desc: 'Süreci biz sonlandırdık.', color: '#DC2626', bg: '#FEF2F2' },
    { id: 'candidate', label: 'Aday kararı',   desc: 'Aday süreçten ayrıldı.',   color: '#D97706', bg: '#FFFBEB' },
    { id: 'process',   label: 'Süreç',         desc: 'Adayla ilgisi olmayan sebep.', color: '#64748B', bg: '#F1F5F9' },
];

export const REJECTION_CATEGORY_BY_ID = Object.fromEntries(
    REJECTION_CATEGORIES.map((c) => [c.id, c])
);

export const REJECTION_REASONS = [
    // Şirket kararı
    { id: 'criteria_not_met',        category: 'company',   label: 'Kriterleri karşılamadı' },
    { id: 'experience_insufficient', category: 'company',   label: 'Deneyim yetersiz' },
    { id: 'interview_negative',      category: 'company',   label: 'Mülakat değerlendirmesi olumsuz' },
    { id: 'salary_mismatch',         category: 'company',   label: 'Ücret beklentisi uyuşmadı' },
    { id: 'other_candidate',         category: 'company',   label: 'Başka aday tercih edildi' },
    // Aday kararı
    { id: 'candidate_declined',      category: 'candidate', label: 'Aday teklifi reddetti' },
    { id: 'candidate_withdrew',      category: 'candidate', label: 'Aday süreçten çekildi' },
    { id: 'candidate_unreachable',   category: 'candidate', label: 'Adaya ulaşılamadı' },
    // Süreç
    { id: 'position_cancelled',      category: 'process',   label: 'Pozisyon iptal edildi / donduruldu' },
    { id: 'duplicate_or_error',      category: 'process',   label: 'Hatalı veya mükerrer kayıt' },
];

export const REJECTION_REASON_BY_ID = Object.fromEntries(
    REJECTION_REASONS.map((r) => [r.id, r])
);

/**
 * Eski kimlikler → yeni karşılıkları.
 *
 * `not_suitable` ("Uygun Değil") en yakın karşılığı olan "Kriterleri
 * karşılamadı"ya düşüyor: ikisi de şirket kararı ve aynı soruyu cevaplıyor.
 */
export const LEGACY_IDS = {
    not_suitable: 'criteria_not_met',
    declined: 'candidate_declined',
    wrong_entry: 'duplicate_or_error',
};

/** Serbest metin ya da tanınmayan değerler için sanal neden. */
const OTHER = { id: 'other', category: 'process', label: 'Diğer' };

/**
 * Kayıttaki ham `rejectionReason` değerini gösterilebilir bir nedene çevirir.
 *
 * @param {unknown} raw — kimlik, eski kimlik, serbest metin, null
 * @returns {{id: string, category: string, label: string, note: string|null}|null}
 *   `null` yalnızca değer boşsa döner — "neden girilmemiş" demek.
 */
export function resolveRejection(raw) {
    if (raw == null) return null;
    const key = typeof raw === 'string' ? raw.trim() : String(raw);
    if (!key) return null;

    const found = REJECTION_REASON_BY_ID[key] || REJECTION_REASON_BY_ID[LEGACY_IDS[key]];
    if (found) return { ...found, note: null };

    // Tanınmayan değer: eski serbest metin girişleri. Metin KORUNUYOR —
    // İK'nın yazdığı gerekçeyi silmek bilgi kaybı olurdu.
    return { ...OTHER, note: key };
}

/**
 * Adayları red nedenine göre sayar.
 *
 * @param {Array<object>} candidates
 * @returns {{byReason: Array, byCategory: Array, total: number, missing: number}}
 *   `missing` — reddedilmiş ama nedeni girilmemiş aday sayısı; analitikte
 *   veri kalitesi göstergesi olarak gösteriliyor.
 */
export function rejectionBreakdown(candidates) {
    const list = Array.isArray(candidates) ? candidates : [];
    const reasonCounts = new Map();
    const categoryCounts = new Map();
    let total = 0;
    let missing = 0;

    for (const c of list) {
        const reason = resolveRejection(c?.rejectionReason);
        total += 1;
        if (!reason) { missing += 1; continue; }
        reasonCounts.set(reason.id, (reasonCounts.get(reason.id) || 0) + 1);
        categoryCounts.set(reason.category, (categoryCounts.get(reason.category) || 0) + 1);
    }

    const byReason = [...REJECTION_REASONS, OTHER]
        .filter((r) => reasonCounts.has(r.id))
        .map((r) => ({ ...r, count: reasonCounts.get(r.id) }))
        .sort((a, b) => b.count - a.count);

    const byCategory = REJECTION_CATEGORIES
        .filter((c) => categoryCounts.has(c.id))
        .map((c) => ({ ...c, count: categoryCounts.get(c.id) }))
        .sort((a, b) => b.count - a.count);

    return { byReason, byCategory, total, missing };
}
