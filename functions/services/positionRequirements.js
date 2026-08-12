// Pozisyon gereksinimleri — İSTEMCİ İKİZİ.
//
// src/utils/positionRequirements.js'in sunucu karşılığı. İki tarafın aynı
// listeyi ve aynı parmak izini üretmesi ZORUNLU: damga istemcide hesaplanıp
// sunucuda karşılaştırılıyor (ya da tersi) ve iki taraf ayrışırsa her kayıt
// sonsuza kadar "bayat" görünür.
//
// `positionRequirements` daha önce bulkWorker.js içinde yaşıyordu. Parmak izi
// eklenirken oraya konsaydı, bir mülakat ucu yalnızca 40 satırlık bir hesap
// için toplu içe aktarma makinesinin tamamını içe aktarmak zorunda kalırdı.
// İkisi burada, yan yana duruyor — birlikte değişmeleri gereken şeyler.

/**
 * Pozisyonun gereksinimlerini {text, must} biçiminde döndürür.
 *
 * `requirementsMeta` yoksa (eski ilanlar) must: null — işaretlenmemiş demektir
 * ve skorlama nötr davranır.
 *
 * @param {object|string|null} position
 * @returns {Array<{text: string, must: boolean|null}>}
 */
export function positionRequirements(position) {
    if (typeof position === 'string' || !position) return [];
    const meta = position.requirementsMeta;
    if (Array.isArray(meta) && meta.length > 0) {
        return meta
            .filter((r) => r && typeof r.text === 'string' && r.text.trim())
            .map((r) => ({ text: r.text.trim(), must: Boolean(r.must) }));
    }
    return (position.requirements || [])
        .filter((t) => typeof t === 'string' && t.trim())
        .map((t) => ({ text: t.trim(), must: null }));
}

/**
 * Gereksinim listesinin parmak izi — istemcideki requirementsFingerprint ile
 * BİREBİR aynı sonucu vermek zorunda.
 *
 * Değerlendirmeler madde NUMARASINA bağlı. İlan değişince o numara başka bir
 * maddeye denk gelir ve eski yargı yanlış maddeye yapışır. Damga, bir kaydın
 * hangi listeye ait olduğunu söyler.
 *
 * Kripto değil; tek sorusu "değişti mi?".
 *
 * @param {object} position
 * @returns {string}
 */
export function requirementsFingerprint(position) {
    const payload = JSON.stringify(
        positionRequirements(position).map((r) => [r.text, r.must])
    );
    let h = 5381;
    for (let i = 0; i < payload.length; i++) {
        h = ((h << 5) + h + payload.charCodeAt(i)) | 0;
    }
    return `r${(h >>> 0).toString(36)}`;
}
