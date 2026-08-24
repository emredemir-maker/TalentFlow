// ADAY KAYDININ ALAN TİPLERİ BURADA SABİTLENİR.
//
// ── NEDEN VAR ───────────────────────────────────────────────────────────────
// Aday kayıtları üç ayrı akıştan geliyor (manuel yükleme, başvuru formu,
// toplu içe aktarma) ve hiçbir aşamada şema doğrulaması yok. Bu yüzden aynı
// alan bir kayıtta dizi, başka bir kayıtta metin, bir başkasında nesne
// olabiliyor. Ekran kodu ise alanların tipini VARSAYIYOR:
//
//     rawExperiences.filter(...)        → metin gelirse "filter is not a function"
//     (candidate.position || '').toLowerCase()  → sayı gelirse çöker
//     {candidate.email}                 → nesne gelirse React ağacı düşer
//
// `|| []` ve `|| ''` yalnızca alanın YOK olmasına karşı koruyor, YANLIŞ
// TİPTE olmasına değil. Render sırasında fırlayan böyle bir hata React'in
// tüm ağacı sökmesine ve ekranın BEYAZ kalmasına yol açıyordu.
//
// Bu dosya, aday detayı ekranını her alan × yedi farklı bozuk tip ile
// render eden bir tarama sonucunda yazıldı. Tarama altı alanda toplam 24
// çökme buldu; hepsi burada kapatılıyor. Tarama kalıcı bir gerileme testi
// olarak duruyor: tests/candidateDetailCrash.test.jsx
//
// ── HESAP DEĞİŞMİYOR ────────────────────────────────────────────────────────
// Alan zaten doğru tipteyse DOKUNULMUYOR — aynı referans geri veriliyor.
// Yani bugün düzgün çalışan hiçbir adayın verisi, skoru ya da ekranı
// değişmiyor. Yalnızca daha önce UYGULAMAYI ÇÖKERTEN değerler okunabilir
// bir karşılığa çevriliyor; çöken kodun "önceki doğru davranışı" yok.

import { normalizeSkills } from './normalizeSkills';

/** Metin beklenen alanlar. Ekranda basılıyor ya da `.toLowerCase()` çağrılıyor. */
const TEXT_FIELDS = [
    'name',
    'email',
    'phone',
    'position',
    'matchedPositionTitle',
    'bestTitle',
    'suggestedRole',
    'source',
    'sourceDetail',
    'department',
    'education',
    'educationDetail',
    'location',
    'summary',
    // CV metni: `parseCareerFromCvData` içinde `.matchAll` çağrılıyor.
    // Metin dışı bir değer geldiğinde "CV & Uyum" sekmesi çöküyordu.
    'cvText',
    'cvData',
];

/** Nesne/dizi beklenen alanlar — üzerlerinde dizi metotları çağrılıyor. */
const LIST_FIELDS = ['experiences', 'careerHistory', 'hrComments', 'interviewSessions'];

/**
 * Bir nesneyi okunabilir metne çevirir.
 *
 * Boş metin döndürmek bilgiyi silerdi: `{school: 'ODTÜ', degree: 'Lisans'}`
 * gibi bir eğitim kaydı ekranda kaybolurdu. Nesnenin metin/sayı değerlerini
 * birleştirmek hem çökmeyi önler hem de içeriği korur.
 */
function objectToText(value) {
    const parts = [];
    const collect = (v, depth) => {
        if (depth > 2 || v == null) return;
        if (typeof v === 'string') { const t = v.trim(); if (t) parts.push(t); return; }
        if (typeof v === 'number' || typeof v === 'boolean') { parts.push(String(v)); return; }
        if (Array.isArray(v)) { v.forEach((item) => collect(item, depth + 1)); return; }
        if (typeof v === 'object') { Object.values(v).forEach((item) => collect(item, depth + 1)); }
    };
    collect(value, 0);
    return parts.join(' · ');
}

/**
 * Metin alanını güvenli hâle getirir.
 *
 * `null`/`undefined` OLDUĞU GİBİ bırakılır: kodun bazı yerlerinde bu
 * değerlerin ayrı anlamı var (ör. `matchedPositionTitle === null` "eşleşme
 * yok" demek) ve boş metne çevirmek o mantığı bozardı.
 */
function toText(value) {
    if (value == null || typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return objectToText(value);
}

/** Liste alanını güvenli hâle getirir: yalnızca nesne öğeleri kalır. */
function toList(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Aday kaydını ekranın varsaydığı tiplere getirir.
 *
 * @param {object|null|undefined} candidate — Firestore'dan gelen ham kayıt
 * @returns {object|null|undefined} düzeltilmiş kayıt; düzeltilecek bir şey
 *   yoksa AYNI referans (gereksiz yeniden render olmasın diye)
 */
export function normalizeCandidate(candidate) {
    if (!candidate || typeof candidate !== 'object') return candidate;

    let patch = null;
    const set = (key, value) => {
        if (!patch) patch = {};
        patch[key] = value;
    };

    for (const field of TEXT_FIELDS) {
        const raw = candidate[field];
        const fixed = toText(raw);
        if (fixed !== raw) set(field, fixed);
    }

    for (const field of LIST_FIELDS) {
        const raw = candidate[field];
        if (raw === undefined) continue;
        const fixed = toList(raw);
        if (!Array.isArray(raw) || fixed.length !== raw.length) set(field, fixed);
    }

    const skills = normalizeSkills(candidate.skills);
    const skillsUnchanged =
        Array.isArray(candidate.skills) &&
        candidate.skills.length === skills.length &&
        candidate.skills.every((s, i) => s === skills[i]);
    if (!skillsUnchanged) set('skills', skills);

    return patch ? { ...candidate, ...patch } : candidate;
}
