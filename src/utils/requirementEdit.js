// Öneriyi ilana UYGULAMA.
//
// Danışman her işaretli madde için iki şey döndürüyor: yeni bir metin
// ("suggestion") ve bir KARAR ("action"). İlk sürümde düğme yalnızca metni
// değiştiriyordu; karar ne ekranda görünüyordu ne de uygulanıyordu. Sonuç:
// "tercihene al" önerisini uygulayan kullanıcının maddesi zorunlu kalıyor,
// "kaldır" önerisini uygulayınca madde duruyordu — yani öneri uygulanmış
// olmuyordu.
//
// İkinci sorun: her uygulama ayrı bir yazma + ayrı bir yeniden tarama
// demekti. Üç öneri gelen bir ilanda kullanıcı üç kez öneri istemek zorunda
// kalıyordu, çünkü uygulama anında panel kapanıyordu. Bu yüzden çekirdek
// fonksiyon ÇOĞUL: bir seferde birden çok maddeyi planlar, tarama en sonda
// bir kez çalışır.
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
 * Tek bir öneriyi uygulanabilir bir değişikliğe çevirir.
 * @returns {null | {index, action, requested, downgradeNote, from, to}}
 */
function resolveChange(current, index, review, prioritized) {
    const target = current[index - 1];
    if (!target) return null;

    const requested = normalizeAction(review?.action);
    const suggestion = String(review?.suggestion || '').trim();

    let action = requested;
    let downgradeNote = null;

    // "Tercihene al" ancak zorunlu/tercihen ayrımı YAPILMIŞ bir ilanda anlamlı.
    // Ayrım yoksa meta yazmak tüm maddeleri sessizce "tercihen" yapardı:
    // requirementsOf, meta'daki must:null'ı Boolean(null) ile false'a çevirir.
    // Bu, ilanın tamamını bozan sessiz bir veri kaybı olurdu.
    if (action === DEMOTE && !prioritized) {
        action = REWRITE;
        downgradeNote = `${index}. madde: bu ilanda zorunlu/tercihen ayrımı yapılmamış, yalnızca metin güncellendi. `
            + 'Önceliği değiştirmek için ilanı düzenleyip maddeleri iki kutuya ayırın.';
    }
    // Tercihen olan bir maddeyi tercihene almak bir şey değiştirmez.
    if (action === DEMOTE && target.must === false) {
        action = REWRITE;
        downgradeNote = `${index}. madde zaten tercihen; yalnızca metin güncellendi.`;
    }

    // Yeni metin yoksa yazacak bir şey yok. Kaldırma metne muhtaç değil.
    if (action !== REMOVE && !suggestion) return null;
    // Hiçbir şey değişmiyorsa onay kutusu çıkarmanın anlamı yok.
    if (action === REWRITE && suggestion === target.text) return null;

    return {
        index,
        action,
        requested,
        downgradeNote,
        from: target.text,
        to: action === REMOVE ? null : suggestion,
    };
}

/** Onay kutusunda görünecek tek satır. */
function changeLine(c) {
    if (c.action === REMOVE) return `${c.index}. madde KALDIRILACAK: ${c.from}`;
    const demoted = c.action === DEMOTE ? "\n   (ZORUNLU'dan TERCİHEN'e alınacak)" : '';
    return `${c.index}. madde → ${c.to}${demoted}`;
}

/**
 * Birden çok öneriyi TEK yazmada uygulanacak hâle getirir.
 *
 * Tek geçişte kurulduğu için madde kaldırmak numaraları kaydırmaz; kaydırma
 * sonrası eşleştirme hatası (öneri 3'ün 2 numaralı maddeye yapışması) mümkün
 * değil.
 *
 * @param {object} position
 * @param {Array<{index:number, action?:string, suggestion?:string}>} reviews
 * @returns {null | {
 *   changes: Array,            // uygulanacak değişiklikler
 *   notes: string[],           // istenen karar uygulanamadıysa nedenleri
 *   updates: object,           // updatePosition'a verilecek alanlar
 *   nextPosition: object,      // güncel hâliyle pozisyon
 *   indexMap: Map<number, number|null>, // eski numara → yeni numara (null: kaldırıldı)
 *   confirmText: string,
 * }}
 */
export function planRequirementChanges(position, reviews) {
    const current = requirementsOf(position);
    if (current.length === 0) return null;
    const prioritized = hasPrioritizedRequirements(position);

    const byIndex = new Map();
    for (const r of reviews || []) {
        const idx = Number(r?.index);
        if (!Number.isInteger(idx) || byIndex.has(idx)) continue;
        const change = resolveChange(current, idx, r, prioritized);
        if (change) byIndex.set(idx, change);
    }
    if (byIndex.size === 0) return null;

    const indexMap = new Map();
    const next = [];
    current.forEach((r, i) => {
        const oldIndex = i + 1;
        const c = byIndex.get(oldIndex);
        if (c?.action === REMOVE) { indexMap.set(oldIndex, null); return; }
        next.push({
            text: c?.to || r.text,
            must: c?.action === DEMOTE ? false : r.must,
        });
        indexMap.set(oldIndex, next.length);
    });

    const requirements = next.map((r) => r.text);
    // Meta yalnızca ilan zaten önceliklendirilmişse yazılır; aksi hâlde
    // must:null'lar false'a dönüşüp ilanı bozardı (yukarıdaki nota bak).
    const updates = prioritized
        ? { requirements, requirementsMeta: next.map((r) => ({ text: r.text, must: Boolean(r.must) })) }
        : { requirements };

    const changes = [...byIndex.values()].sort((a, b) => a.index - b.index);
    const notes = changes.map((c) => c.downgradeNote).filter(Boolean);

    const confirmText = [
        `${changes.length} gereksinim güncellenecek:`,
        '',
        changes.map(changeLine).join('\n'),
        '',
        notes.length > 0 ? `Not:\n${notes.join('\n')}\n` : null,
        'Sonrasında yeniden tarama gerekecek — kayıtlı aday analizleri eski metne ait.',
    ].filter((line) => line !== null).join('\n');

    return { changes, notes, updates, nextPosition: { ...position, ...updates }, indexMap, confirmText };
}
