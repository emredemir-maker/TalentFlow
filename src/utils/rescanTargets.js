// Yeniden taramada KİMLER taranacak?
//
// Canlıda çıktı: bir adayı tek bir ilana karşı taratmanın yolu yoktu.
// Diyalogda yalnızca kapsam ve eşik vardı; en dar kapsam 87 aday, en genişi
// 440. Tek bir aday için 87 AI çağrısı yapmak gerekiyordu — kullanıcı haklı
// olarak "aday seçimi yok" dedi.
//
// TEK TEK SEÇİM HER ŞEYİ EZER. Kullanıcı adları işaretlediyse kapsam ve eşik
// hakkında bir şey söylemiş olmuyor; kimi istediğini zaten söyledi. Seçim
// kapsamın İÇİNDEN değil TÜM havuzdan yapılır: aranan aday çoğu zaman seçili
// kapsamın dışında kalıyor ve asıl ihtiyaç tam da onu taratmak oluyor.
//
// Seçim boşsa davranış BİREBİR eskisi gibi — toplu akış bu eklemeden
// etkilenmemeli.

/**
 * @param {{
 *   scored: Array<{candidate: {id: string}, score: number}>,
 *   inScope: Array<{candidate: {id: string}, score: number}>,
 *   threshold: number,
 *   picked: Set<string>,
 * }} input
 * @returns {Array}
 */
export function resolveTargets({ scored, inScope, threshold, picked } = {}) {
    if (picked?.size > 0) {
        return (scored || []).filter((s) => picked.has(s?.candidate?.id));
    }
    return (inScope || []).filter((s) => Number(s?.score) >= Number(threshold || 0));
}

/**
 * Arama listesi.
 *
 * SEÇİLENLER HER ZAMAN GÖRÜNÜR. Arama daraltınca işaretli aday listeden
 * düşerse kullanıcı kaç kişi seçtiğini kaybeder ve yanlışlıkla fazladan
 * tarama başlatır.
 *
 * @param {Array} scored
 * @param {string} search
 * @param {Set<string>} picked
 * @param {number} limit
 */
export function searchableTargets(scored, search, picked, limit = 60) {
    const all = Array.isArray(scored) ? scored : [];
    const q = String(search || '').toLowerCase().trim();
    const matches = q
        ? all.filter((s) => `${s?.candidate?.name || ''} ${s?.candidate?.email || ''}`.toLowerCase().includes(q))
        : all;

    const shown = new Set(matches.map((s) => s?.candidate?.id));
    const pinned = all.filter((s) => picked?.has(s?.candidate?.id) && !shown.has(s?.candidate?.id));
    return [...pinned, ...matches].slice(0, limit);
}
