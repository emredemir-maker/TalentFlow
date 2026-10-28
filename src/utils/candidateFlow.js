// Aday akışı — "aday ilandan teklife nasıl akıyor" sorusunun ortak cevabı.
//
// Kontrol Paneli, Aday süreci, Adaylar tablosu, Aday detayı ve Açık İlanlar
// aynı üç soruyu soruyor: aday akışın neresinde, ne kadar süredir orada
// bekliyor ve sıradaki adım ne. Her ekran bunu kendisi hesaplasaydı aynı aday
// iki ekranda farklı "bekleme" süresiyle görünürdü; hesap burada TEK yerde.
//
// Yalnızca OKUR: hiçbir alan yazmaz, Firestore şekli değişmez.

import { ADVANCEABLE_STAGES, stageOrder } from './pipelineStages';

/**
 * Akış rengi: aşama ilerledikçe koyulaşan tek bir teal rampası, ret gri.
 *
 * pipelineStages'teki aşama renkleri (mor, çivit, amber…) yan yana gelince
 * sırayı değil yalnız farkı anlatıyor. Akış görsellerinde sıranın kendisi
 * bilgi olduğu için tek renk tonlaması kullanılıyor.
 */
export const FLOW_TONE = {
    ai_analysis: '#99F6E4',
    review: '#5EEAD4',
    interview_scheduled: '#2DD4BF',
    interview_done: '#14B8A6',
    offer: '#0D9488',
    hired: '#0F766E',
    rejected: '#CDD3D0',
};

/** Akışın ilerleyen aşamaları (ret hariç) — görsellerde sütun sırası. */
export const FLOW_STAGES = ADVANCEABLE_STAGES;

/** Bu kadar gün aynı yerde duran aday "bekletiliyor" sayılır. */
export const STALE_DAYS = 7;

/** Firestore Timestamp | Date | ISO | ms → ms; çözülemezse 0. */
export function toMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') {
        const ms = value.toMillis();
        return Number.isFinite(ms) ? ms : 0;
    }
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'object' && typeof value.seconds === 'number') return value.seconds * 1000;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

/** Adaya en son ne zaman dokunulduğu — updatedAt yoksa createdAt; ikisi de yoksa 0. */
export function lastTouchMs(candidate) {
    return toMillis(candidate?.updatedAt) || toMillis(candidate?.createdAt);
}

/**
 * Aday kaç gündür aynı yerde — son dokunuştan bu yana TAM gün.
 *
 * Zaman damgası yoksa `null`: eski kayıtların bir kısmında ne updatedAt ne
 * createdAt var. Uydurma bir "0 gün" bu adayı en taze aday gibi gösterirdi.
 */
export function waitingDays(candidate, now = Date.now()) {
    const ms = lastTouchMs(candidate);
    if (!ms) return null;
    return Math.max(0, Math.floor((now - ms) / 86400000));
}

/** "Bugün" / "1 gün" / "12 gün"; bilinmiyorsa "—". */
export function waitingLabel(days) {
    if (days == null) return '—';
    if (days === 0) return 'Bugün';
    return `${days} gün`;
}

/**
 * Sıradaki adım ve topun kimde olduğu.
 *
 * `owner` iki değer alır: 'team' (İK/ekip bir şey yapmalı) ve 'candidate'
 * (aday yanıt verecek). Bitmiş süreçte (işe alındı / reddedildi) adım yok.
 */
const NEXT_STEP = {
    ai_analysis: { label: "CV'yi incele", owner: 'team' },
    review: { label: 'Mülakat planla', owner: 'team' },
    interview_scheduled: { label: 'Mülakatı yap', owner: 'team' },
    interview_done: { label: 'Karar ver', owner: 'team' },
    offer: { label: 'Teklif yanıtı', owner: 'candidate' },
};

export function nextStepFor(stageKey) {
    return NEXT_STEP[stageKey] || null;
}

/**
 * Akış izi için konum: ilerleyen aşamalar 0..5, ret -1.
 * (stageOrder ile aynı sıra — huni ve analitik aynı cetveli kullanıyor.)
 */
export function flowIndex(stageKey) {
    return stageOrder(stageKey);
}

/**
 * Bir ilanın sağlığı — ilan akışının tıkandığı yer.
 *
 *  - 'empty'   : hiç aday yok → aday bulmak gerekiyor
 *  - 'thin'    : aktif (süreçte) aday 2'den az
 *  - 'stalled' : aktif adaylar var ama hiçbirine STALE_DAYS içinde dokunulmadı
 *  - 'ok'
 *
 * Bitmiş (işe alındı / reddedildi) adaylar "aktif" sayılmaz: üç reddedilmiş
 * adayı olan ilan, aday bekleyen bir ilandır.
 */
export function positionHealth(entries, now = Date.now()) {
    const list = Array.isArray(entries) ? entries : [];
    if (list.length === 0) return 'empty';
    const active = list.filter((e) => e && e.stage !== 'hired' && e.stage !== 'rejected');
    if (active.length === 0) return 'thin';
    const fresh = active.some((e) => {
        const d = waitingDays(e.candidate, now);
        return d != null && d < STALE_DAYS;
    });
    if (!fresh) return 'stalled';
    // Tek aktif aday varsa ilan zayıf: o aday düşerse ilan boşa kalır.
    if (active.length < 2) return 'thin';
    return 'ok';
}

export const HEALTH_LABEL = {
    empty: 'Aday yok',
    thin: 'Aday az',
    stalled: 'Akış durdu',
    ok: 'Akıyor',
};
