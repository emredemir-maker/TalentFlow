// Öneriyi ilana UYGULAMA.
//
// Danışman her işaretli madde için iki şey döndürüyor: yeni bir metin
// ("suggestion") ve bir KARAR ("action"). İlk sürümde düğme yalnızca metni
// değiştiriyordu; karar ne ekranda görünüyordu ne de uygulanıyordu. Sonuç:
// "tercihene al" önerisini uygulayan kullanıcının maddesi zorunlu kalıyor,
// "kaldır" önerisini uygulayınca madde duruyordu — yani öneri uygulanmış
// olmuyordu. Kullanıcının bildirdiği sorun buydu.
//
// Burası saf: pozisyonu değiştirmez, yazılacak alanları döndürür.

import { requirementsOf, hasPrioritizedRequirements } from './positionRequirements';

/** Danışmanın verebileceği kararlar. */
export const REWRITE = 'yeniden-yaz';
export const DEMOTE = 'tercihene-al';
export const REMOVE = 'kaldır';

/** Ekranda görünen karar etiketleri. */
export const ACTION_LABELS = {
    [REWRITE]: 'Yeniden yaz',
    [DEMOTE]: 'Tercihene al',
    [REMOVE]: 'Maddeyi kaldır',
};

/**
 * Türkçe katlama.
 *
 * `'KALDIR'.toLowerCase()` JS'te 'kaldir' üretir (noktasız ı kaybolur), model
 * ise bazen 'kaldır' bazen 'Kaldir' yazıyor. Karşılaştırmadan önce ı/İ/ş/ç…
 * hepsini ASCII'ye indiriyoruz ki eşleşme bu tuzağa takılmasın.
 */
function fold(raw) {
    return String(raw ?? '')
        .replace(/[İıIi]/g, 'i')
        .replace(/[ŞşSs]/g, 's')
        .replace(/[ĞğGg]/g, 'g')
        .replace(/[ÜüUu]/g, 'u')
        .replace(/[ÖöOo]/g, 'o')
        .replace(/[ÇçCc]/g, 'c')
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .trim();
}

/**
 * Modelin yazdığı kararı bilinen üç karardan birine indirger.
 * Tanınmayan/boş karar "yeniden-yaz" sayılır: metni değiştirmek en zararsız
 * olanıdır, maddeyi silmek ya da önceliğini düşürmek değil.
 */
export function normalizeAction(raw) {
    const f = fold(raw);
    if (!f) return REWRITE;
    if (f.includes('kaldir') || f.includes('sil') || f.includes('remove')) return REMOVE;
    if (f.includes('tercihen') || f.includes('nice')) return DEMOTE;
    return REWRITE;
}

/**
 * Öneriyi uygulanmış hâle çevirir.
 *
 * @param {object} position
 * @param {number} index — 1 tabanlı madde numarası (panelin gösterdiği numara)
 * @param {{action?: string, suggestion?: string}} review — danışman çıktısı
 * @returns {null | {
 *   action: string,            // gerçekten uygulanan karar
 *   requested: string,         // danışmanın istediği karar
 *   downgradeNote: string|null,// istenen uygulanamadıysa nedeni
 *   updates: object,           // updatePosition'a verilecek alanlar
 *   nextPosition: object,      // güncel hâliyle pozisyon (yeniden tarama için)
 *   confirmText: string,
 * }}
 *   null: madde yok ya da uygulanacak bir değişiklik yok.
 */
export function applyRequirementAction(position, index, review = {}) {
    const current = requirementsOf(position);
    const target = current[index - 1];
    if (!target) return null;

    const requested = normalizeAction(review.action);
    const suggestion = String(review.suggestion || '').trim();
    const prioritized = hasPrioritizedRequirements(position);

    let action = requested;
    let downgradeNote = null;

    // "Tercihene al" ancak zorunlu/tercihen ayrımı YAPILMIŞ bir ilanda anlamlı.
    // Ayrım yoksa meta yazmak tüm maddeleri sessizce "tercihen" yapardı:
    // requirementsOf, meta'daki must:null'ı Boolean(null) ile false'a çevirir.
    // Bu, ilanın tamamını bozan sessiz bir veri kaybı olurdu.
    if (action === DEMOTE && !prioritized) {
        action = REWRITE;
        downgradeNote = 'Bu ilanda zorunlu/tercihen ayrımı yapılmamış; yalnızca metin güncellendi. '
            + 'Önceliği değiştirmek için ilanı düzenleyip maddeleri iki kutuya ayırın.';
    }
    // Tercihen olan bir maddeyi tercihene almak bir şey değiştirmez.
    if (action === DEMOTE && target.must === false) {
        action = REWRITE;
        downgradeNote = 'Madde zaten tercihen; yalnızca metin güncellendi.';
    }
    // Yeni metin yoksa yazacak bir şey yok. Kaldırma metne muhtaç değil.
    if (action !== REMOVE && !suggestion) return null;
    // Hiçbir şey değişmiyorsa onay kutusu çıkarmanın anlamı yok.
    const textUnchanged = suggestion === target.text;
    const priorityUnchanged = action !== DEMOTE;
    if (action !== REMOVE && textUnchanged && priorityUnchanged) return null;

    const next = current
        .map((r, i) => {
            if (i !== index - 1) return { text: r.text, must: r.must };
            if (action === REMOVE) return null;
            return { text: suggestion || r.text, must: action === DEMOTE ? false : r.must };
        })
        .filter(Boolean);

    const requirements = next.map((r) => r.text);
    // Meta yalnızca ilan zaten önceliklendirilmişse yazılır; aksi hâlde
    // must:null'lar false'a dönüşüp ilanı bozardı (yukarıdaki nota bak).
    const updates = prioritized
        ? { requirements, requirementsMeta: next.map((r) => ({ text: r.text, must: Boolean(r.must) })) }
        : { requirements };

    const confirmText = action === REMOVE
        ? `${index}. madde ilandan KALDIRILACAK:\n\n${target.text}\n\n`
            + 'Sonrasında yeniden tarama önerilecek.'
        : `${index}. madde şu metinle değiştirilecek:\n\n${suggestion}\n\n`
            + (action === DEMOTE
                ? 'Madde ayrıca ZORUNLU\'dan TERCİHEN\'e alınacak. '
                : 'Zorunlu/tercihen işareti korunur. ')
            + (downgradeNote ? `\n\nNot: ${downgradeNote}\n\n` : '')
            + 'Sonrasında yeniden tarama önerilecek.';

    return {
        action,
        requested,
        downgradeNote,
        updates,
        nextPosition: { ...position, ...updates },
        confirmText,
    };
}
