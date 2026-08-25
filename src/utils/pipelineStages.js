// Single source of truth for the canonical recruitment pipeline stages.
//
// Before this module, Dashboard, PipelinePage, CandidateCard, BulkUpdateModal
// and CandidateProcessPage each defined their own stage→colour map, and they
// CONTRADICTED each other (e.g. "İnceleme" was blue in the funnel but amber on
// the candidate card). Everything now derives from STAGES so a stage looks the
// same everywhere.
//
// ── MÜLAKAT İKİYE AYRILDI ───────────────────────────────────────────────────
// Tek bir "Mülakat" aşaması iki farklı gerçeği aynı kutuya koyuyordu:
// görüşmesi PLANLANMIŞ aday ile görüşmesi BİTMİŞ aday. İkisi arasındaki fark
// İK'nın günlük işinde en çok sorulan soru ("kimi arayacağım, kimin kararını
// vereceğim") olduğu için aşama ikiye ayrıldı.
//
// GEÇMİŞ VERİ BOZULMUYOR: eski `interview` değeri `legacy` üzerinden
// "Planlı Mülakat"a düşüyor. Firestore'da hiçbir kayıt güncellenmiyor;
// `resolveStageKey` okuma anında eşliyor. Mülakatı fiilen bitmiş adaylar ise
// `resolveCandidateStage` ile otomatik "Mülakat Tamamlandı" görünüyor
// (bkz. utils/candidateTable.js).
//
// Palette: brand-anchored progression (navy/cyan brand identity).
//   Ön İnceleme cyan · İnceleme teal · Planlı Mülakat violet
//   Mülakat Tamamlandı indigo · Teklif amber · İşe Alındı emerald · Red kırmızı
//
// `color`  — primary hex (text / bar / dot)
// `bg`     — light tint background (chips, badges)
// `border` — light border (chips, badges)
// `desc`   — aşamanın tanımı; seçicilerde ve ipuçlarında gösterilir
// `goodnessOnIncrease` — is a rising count a GOOD outcome? (false for Reddedildi)
// `terminal` — süreç burada biter; "ilerlet" akışının dışında kalır
// `legacy` — historical status keys that map onto this canonical stage

export const STAGES = [
    {
        key: 'ai_analysis',
        label: 'Ön İnceleme',
        desc: 'AI skorlaması yapıldı, henüz kimseyle görüşülmedi.',
        color: '#29A9E0', bg: '#ECFAFF', border: '#BAE6FD',
        goodnessOnIncrease: true, terminal: false,
        legacy: ['new', 'pending', 'applied', 'unknown'],
    },
    {
        key: 'review',
        label: 'İnceleme',
        desc: 'İK incelemesi ve ilk değerlendirme aşaması.',
        color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC',
        goodnessOnIncrease: true, terminal: false,
        legacy: ['Review', 'değerlendirme', 'Evaluation', 'deep_review'],
    },
    {
        key: 'interview_scheduled',
        label: 'Planlı Mülakat',
        desc: 'Mülakat planlandı, henüz gerçekleşmedi.',
        color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE',
        goodnessOnIncrease: true, terminal: false,
        // `interview` ESKİ KANONİK ANAHTAR: canlıdaki kayıtların çoğu bu değeri
        // taşıyor ve buraya düşmeleri gerekiyor. `final` "final turuna taşındı"
        // demekti — yani yapılacak bir görüşme; o da planlı sayılıyor.
        legacy: ['interview', 'Interview', 'mülakat', 'Mülakat', 'final', 'Final'],
    },
    {
        key: 'interview_done',
        label: 'Mülakat Tamamlandı',
        desc: 'Görüşme yapıldı, karar bekleniyor.',
        color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE',
        goodnessOnIncrease: true, terminal: false,
        legacy: ['interview_completed', 'interviewed'],
    },
    {
        key: 'offer',
        label: 'Teklif',
        desc: 'Adaya teklif sunuldu.',
        color: '#D97706', bg: '#FFFBEB', border: '#FDE68A',
        goodnessOnIncrease: true, terminal: false,
        legacy: ['Offer'],
    },
    {
        key: 'hired',
        label: 'İşe Alındı',
        desc: 'Süreç işe alımla tamamlandı.',
        color: '#059669', bg: '#ECFDF5', border: '#A7F3D0',
        goodnessOnIncrease: true, terminal: true,
        legacy: ['Hired'],
    },
    {
        key: 'rejected',
        label: 'Reddedildi',
        desc: 'Süreç olumsuz sonuçlandı; nedeni kayıt altında.',
        color: '#DC2626', bg: '#FEF2F2', border: '#FECACA',
        goodnessOnIncrease: false, terminal: true,
        legacy: ['Rejected'],
    },
];

/** Map of stage key → stage object, for O(1) lookup. */
export const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]));

/** Look up a stage by key, falling back to a neutral grey stage. */
export function getStage(key) {
    return STAGE_BY_KEY[key] || { key, label: key || '?', desc: '', color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0', goodnessOnIncrease: true, terminal: false, legacy: [] };
}

/**
 * İlerletilebilir aşamalar — "Sonraki aşamaya taşı" akışının kullandığı sıra.
 *
 * Yalnızca "Reddedildi" dışarıda: ilerlet düğmesine basan kullanıcıyı adayı
 * reddetmeye götürmek bir kaza kaynağıydı. "İşe Alındı" listede KALIYOR çünkü
 * Teklif'ten sonraki normal varış noktası o; bitiş olması onu ilerlemenin
 * dışına atmaz, yalnızca sonrasında gidecek yer olmadığını söyler.
 */
export const ADVANCEABLE_STAGES = STAGES.filter((s) => s.key !== 'rejected');

/** Bir aşamadan sonra gelen aşama; sıranın sonundaysa `null`. */
export function nextStageKey(stageKey) {
    const i = ADVANCEABLE_STAGES.findIndex((s) => s.key === stageKey);
    if (i < 0 || i >= ADVANCEABLE_STAGES.length - 1) return null;
    return ADVANCEABLE_STAGES[i + 1].key;
}

/**
 * Huni sıralaması — aday bu aşamaya KADAR GELDİ Mİ sorusu için.
 *
 * "Reddedildi" ilerlemenin bir parçası değil, dışına çıkıştır; sıralamada
 * yeri yok ve `-1` döner. Analitikteki huni bunu kullanıyor: reddedilen aday
 * "mülakata kadar geldi" sayılmıyor.
 */
export function stageOrder(key) {
    return ADVANCEABLE_STAGES.findIndex((s) => s.key === key);
}

/** Aday, verilen aşamaya (ya da ötesine) ulaşmış mı? */
export function reachedStage(stageKey, hedefKey) {
    const i = stageOrder(stageKey);
    const h = stageOrder(hedefKey);
    return i >= 0 && h >= 0 && i >= h;
}
