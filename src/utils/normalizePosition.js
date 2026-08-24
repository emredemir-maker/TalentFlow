// POZİSYON KAYDININ ALAN TİPLERİ BURADA SABİTLENİR.
//
// ── NEDEN VAR ───────────────────────────────────────────────────────────────
// Aday kaydı için `normalizeCandidate` yazılmıştı; pozisyon kaydının aynı
// koruması yoktu. Boşluk teorik değil — STAR sekmesini doğrularken fikstürde
// `requirements` alanını yanlış şekilde kurdum ve uygulama çöktü:
//
//     TypeError: K.toLowerCase is not a function
//
// Kaynağı `services/matchService.js`:
//     (position.requirements || []).map(r => r.toLowerCase())
//
// `|| []` alanın YOKLUĞUNA karşı koruyor, içindeki öğelerin tipine değil.
// Bir gereksinim metin değilse skor hesabı çöküyor ve React tüm ağacı
// söktüğü için ekran BEYAZ kalıyor.
//
// Pozisyon detay ekranını her alan × yedi bozuk tip ile render eden bir
// tarama ayrıca üç alanda daha çökme buldu: `title`, `department` ve
// `minExperience` nesne geldiğinde React ağacı düşüyor; `matchedCandidates`
// metin geldiğinde `.reduce` yok.
//
// ── NEDEN SERVİS DEĞİL BURASI ───────────────────────────────────────────────
// Çökme `matchService` içinde oluyor ama düzeltme orada DEĞİL: servis
// pozisyonu birçok ekrandan alıyor ve her çağrı noktasını ayrı ayrı korumak,
// bir sonraki çağrı eklendiğinde aynı hatayı geri getirir. Veri uygulamaya
// girerken bir kez düzeltiliyor — `PositionsContext`.
//
// ── HESAP DEĞİŞMİYOR ────────────────────────────────────────────────────────
// Alan zaten doğru tipteyse DOKUNULMUYOR, aynı referans geri veriliyor.
// Bugün çalışan hiçbir ilanın verisi ya da skoru değişmiyor. Yalnızca daha
// önce ÇÖKERTEN değerler okunabilir bir karşılığa çevriliyor.

/** Ekranda basılan ya da `.toLowerCase()` çağrılan alanlar. */
const TEXT_FIELDS = [
    'title',
    'department',
    'description',
    'jobDescription',
    'location',
    'company',
    'rejectionReason',
    'employmentType',
];

/** Nesne dizisi beklenen alanlar. */
const OBJECT_LIST_FIELDS = ['requirementsMeta', 'matchedCandidates', 'screeningQuestions'];

/** Bir nesneyi okunabilir metne indirger — bilgi silmek yerine düzleştirir. */
function objectToText(value, depth = 0) {
    if (value == null || depth > 2) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
        return value.map((v) => objectToText(v, depth + 1)).filter(Boolean).join(' · ');
    }
    if (typeof value === 'object') {
        return Object.values(value).map((v) => objectToText(v, depth + 1)).filter(Boolean).join(' · ');
    }
    return '';
}

/**
 * Metin alanı.
 *
 * `null`/`undefined` OLDUĞU GİBİ kalır: kodun bazı yerlerinde bunların ayrı
 * anlamı var ve boş metne çevirmek o mantığı bozardı.
 */
function toText(value) {
    if (value == null || typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return objectToText(value);
}

/**
 * GEREKSİNİMLER: METİN DİZİSİ.
 *
 * Gerçek şema `requirements: string[]`; zorunlu/tercihen işareti ayrı
 * `requirementsMeta` alanında duruyor (bkz. utils/positionRequirements).
 * Nesne dizisi geldiğinde `matchService` içindeki `.toLowerCase()` çöküyor —
 * bu yüzden nesneler metne indirgeniyor, öğe atılmıyor.
 */
function toTextList(value) {
    if (!Array.isArray(value)) {
        const tek = toText(value);
        return tek ? [tek] : [];
    }
    return value.map((item) => (typeof item === 'string' ? item.trim() : objectToText(item))).filter(Boolean);
}

/** Nesne listesi: yalnızca nesne öğeler kalır. */
function toObjectList(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Pozisyon kaydını ekranın ve skorlamanın varsaydığı tiplere getirir.
 *
 * @param {object|null|undefined} position — Firestore'dan gelen ham kayıt
 * @returns {object|null|undefined} düzeltilmiş kayıt; düzeltilecek bir şey
 *   yoksa AYNI referans
 */
export function normalizePosition(position) {
    if (!position || typeof position !== 'object') return position;

    let patch = null;
    const set = (key, value) => {
        if (!patch) patch = {};
        patch[key] = value;
    };

    for (const field of TEXT_FIELDS) {
        const raw = position[field];
        const fixed = toText(raw);
        if (fixed !== raw) set(field, fixed);
    }

    // Ekranda doğrudan basılıyor ("{minExperience} yıl+"); nesne gelirse
    // React ağacı düşüyor.
    const deneyim = position.minExperience;
    if (deneyim != null && typeof deneyim !== 'number' && typeof deneyim !== 'string') {
        set('minExperience', toText(deneyim));
    }

    if (position.requirements !== undefined) {
        const raw = position.requirements;
        const fixed = toTextList(raw);
        const ayni =
            Array.isArray(raw) &&
            raw.length === fixed.length &&
            raw.every((r, i) => r === fixed[i]);
        if (!ayni) set('requirements', fixed);
    }

    for (const field of OBJECT_LIST_FIELDS) {
        const raw = position[field];
        if (raw === undefined) continue;
        const fixed = toObjectList(raw);
        if (!Array.isArray(raw) || fixed.length !== raw.length) set(field, fixed);
    }

    return patch ? { ...position, ...patch } : position;
}
