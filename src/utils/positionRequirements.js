import { detectSkillTags } from './skillGraph';
// Pozisyon formundaki serbest metin gereksinim girdisini listeye çevirir.
//
// Eski davranış yalnızca virgülle bölüyordu ve gereksinim alanı tek satırlık
// bir input'tu. Gerçek ilan maddeleri madde İÇİNDE virgül taşır:
//
//   "3-5 yıl ürün yönetimi deneyimi, en az 1-2 yılı growth/funnel odaklı"
//
// Bu madde virgülden bölününce iki anlamsız gereksinime dönüşüyor ve hem
// skorlama hem de AI'a giden ilan metni bozuluyordu.
//
// Kural: metinde satır sonu varsa SATIR bazlı ayrıştırılır (madde içi
// virgüller korunur); tek satırlıksa eski virgül davranışına düşülür ki
// "React, TypeScript, SQL" gibi mevcut girdiler aynı şekilde çalışsın.

/** Madde başındaki "-", "•", "*", "1." gibi işaretleri temizler. */
function stripBullet(line) {
    return line.replace(/^\s*(?:[-–—•*]|\d+[.)])\s*/, '').trim();
}

/**
 * @param {string} raw — textarea içeriği
 * @returns {string[]} temizlenmiş gereksinim listesi (en fazla 30)
 */
export function parseRequirementsInput(raw) {
    const text = String(raw ?? '').trim();
    if (!text) return [];
    const hasLines = /\r?\n/.test(text);
    const parts = hasLines ? text.split(/\r?\n/) : text.split(',');
    return parts
        .map(stripBullet)
        .filter(Boolean)
        .slice(0, 30);
}

/** Kayıtlı listeyi textarea'da düzenlenebilir metne çevirir (satır başına bir madde). */
export function formatRequirementsInput(requirements) {
    if (!Array.isArray(requirements)) return String(requirements ?? '');
    return requirements.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Zorunlu / tercihen ayrımı
//
// Kaynak alan `requirementsMeta`: [{ text, must }]. Düz `requirements` listesi
// ondan TÜRETİLİR ve yazılmaya devam eder — skorlama dışındaki tüm okuyucular
// (AI ilan metni, Excel, eski kayıtlar) hiç değişmeden çalışsın diye.
//
// GERİYE DÖNÜK NÖTRLÜK: meta yoksa hiçbir madde zorunlu/tercihen sayılmaz ve
// skorlama bugünkü davranışını birebir korur. Mevcut ilanların puanları,
// kullanıcı açıkça işaretleme yapana kadar değişmez.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * İki metin kutusunu tek bir meta listesine çevirir.
 * @param {{mustText?: string, niceText?: string}} input
 * @returns {Array<{text: string, must: boolean}>}
 */
export function parseRequirementGroups({ mustText = '', niceText = '' } = {}) {
    // Etiketler serbest metnin YANINA yazılır, yerine değil. Aynı gereksinim
    // ilandan ilana farklı yazıldığında ("GA4 hakimiyeti" / "Google Analytics
    // bilgisi") etiket ikisini de `ga4`'e indirger; ama "3-5 yıl B2B SaaS ürün
    // yönetimi" gibi bileşik bir madde tek etikete sığmadığı için metin
    // kaynak olmayı sürdürür.
    const withTags = (text, must) => ({ text, must, tags: detectSkillTags(text) });
    const must = parseRequirementsInput(mustText).map((t) => withTags(t, true));
    const nice = parseRequirementsInput(niceText).map((t) => withTags(t, false));
    return [...must, ...nice].slice(0, 30);
}

/**
 * İlanın tüm etiketleri — öncelik kırılımıyla.
 * Aynı etiket hem zorunlu hem tercihen listede geçerse ZORUNLU sayılır.
 */
export function positionTags(position) {
    const out = new Map();
    for (const r of requirementsOf(position)) {
        for (const tag of r.tags || []) {
            if (!out.has(tag) || r.must === true) out.set(tag, r.must === true);
        }
    }
    return [...out.entries()]
        .map(([tag, must]) => ({ tag, must }))
        .sort((a, b) => (a.must === b.must ? a.tag.localeCompare(b.tag, 'tr') : (a.must ? -1 : 1)));
}

/** Meta listesini iki düzenlenebilir metne böler. */
export function formatRequirementGroups(meta) {
    const list = Array.isArray(meta) ? meta : [];
    return {
        mustText: list.filter((r) => r?.must).map((r) => r.text).join('\n'),
        niceText: list.filter((r) => r && !r.must).map((r) => r.text).join('\n'),
    };
}

/**
 * Pozisyonun gereksinimlerini normalize eder.
 *
 * `requirementsMeta` varsa öncelikler onunla gelir. Yoksa (eski kayıtlar)
 * düz `requirements` listesi `must: null` ile döner — "işaretlenmemiş"
 * demektir ve skorlama bunu bugünkü nötr davranışla ele alır.
 *
 * @returns {Array<{text: string, must: boolean|null}>}
 */
export function requirementsOf(position) {
    const meta = position?.requirementsMeta;
    if (Array.isArray(meta) && meta.length > 0) {
        return meta
            .filter((r) => r && typeof r.text === 'string' && r.text.trim())
            .map((r) => ({
                text: r.text.trim(),
                must: Boolean(r.must),
                // Etiketi olmayan ESKI kayitlar icin aninda turetilir; boylece
                // kullanici ilani yeniden kaydetmeden de etiketleri gorur.
                tags: Array.isArray(r.tags) ? r.tags : detectSkillTags(r.text),
            }));
    }
    return (position?.requirements || [])
        .filter((t) => typeof t === 'string' && t.trim())
        .map((t) => ({ text: t.trim(), must: null, tags: detectSkillTags(t) }));
}

/** Meta işaretlenmiş mi? Skorlama nötr kalacak mı buna bakar. */
export function hasPrioritizedRequirements(position) {
    return requirementsOf(position).some((r) => r.must !== null);
}

/**
 * AI'a gidecek ilan metni. Gereksinimler NUMARALI ve etiketli verilir; model
 * karşılama durumunu madde numarasıyla döndürür ve kapsama skoru kodda
 * deterministik hesaplanır (modelin serbest metin eşleştirmesine güvenilmez).
 */
export function buildJobDescription(position) {
    const reqs = requirementsOf(position);
    const lines = reqs.map((r, i) => {
        const label = r.must === true ? '[ZORUNLU] ' : r.must === false ? '[TERCİHEN] ' : '';
        return `${i + 1}. ${label}${r.text}`;
    });
    return [
        position?.title || '',
        lines.length > 0 ? `GEREKSİNİMLER:\n${lines.join('\n')}` : '',
        position?.description || '',
    ].filter(Boolean).join('\n');
}
