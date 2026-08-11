// Metindeki AÇIKLANMAYA DEĞER terimleri bulur.
//
// İhtiyaç: STAR değerlendirmesinde "PLG akışında CAC'ı %20 düşürdü" yazıyor
// ve okuyan kişi PLG'nin ne olduğunu, CAC'ın neden önemli olduğunu bilmiyor.
// Detaya boğmadan, merak edince tıklanabilen bir açıklama gerekiyor.
//
// Hangi kelimelerin terim olduğunu KOD belirler, AI değil. Modele "bu metinde
// hangi terimler var" diye sormak her cümlede farklı sonuç verirdi ve aynı
// metin her açılışta başka kelimeleri işaretlerdi.
//
// İki kaynak:
//   1. Beceri grafının sözlüğü — zaten bildiğimiz alan terimleri
//   2. Kısaltma biçimi — büyük harfli kısa öbekler (GA4, NPS, ARR, CAC)
// İkincisi olmadan sözlükte olmayan yeni kısaltmalar kaçardı; birincisi
// olmadan "funnel sahipliği" gibi çok kelimeli terimler kaçardı.

import { SKILL_VOCABULARY } from './skillGraph';
import { foldTr } from './turkishText';

/**
 * Kısaltma kalıbı: 2-6 karakter, en az iki büyük harf ya da harf+rakam.
 * GA4, NPS, ARR, CAC, PLG, CX, B2B, A/B gibi.
 */
const ABBREV = /\b(?=[A-ZÇĞİÖŞÜ0-9/]{2,6}\b)(?=.*[A-ZÇĞİÖŞÜ]{2})[A-ZÇĞİÖŞÜ0-9/]{2,6}\b/g;

/**
 * Kısaltma gibi görünen ama terim OLMAYAN kelimeler.
 * Türkçe büyük harfle yazılan bağlaçlar ve kurum ekleri buraya girer.
 */
const NOT_A_TERM = new Set([
    've', 'ile', 'için', 'bir', 'the', 'and', 'for', 'ltd', 'aş', 'a.ş',
    'cv', 'star', 'ai', 'it', 'hr', 'ik',
].map(foldTr));

/** Terim en az bu kadar uzun olmalı — tek harf gürültüdür. */
const MIN_LEN = 2;

/** Sözlükteki çok kelimeli terimler önce denensin ki kısa parçalar onları bölmesin. */
const VOCAB_SORTED = [...SKILL_VOCABULARY]
    .filter((t) => typeof t === 'string' && t.length >= 3)
    .sort((a, b) => b.length - a.length);

/** Bulunan terimin metindeki gerçek yazımı korunur; gösterim odur. */
function pushMatch(found, taken, start, end, raw) {
    for (const [s, e] of taken) if (start < e && end > s) return;
    taken.push([start, end]);
    found.push({ term: raw, start, end });
}

/**
 * Metindeki açıklanabilir terimler, konumlarıyla.
 *
 * @param {string} text
 * @param {{limit?: number}} options
 * @returns {Array<{term: string, start: number, end: number}>} konuma göre sıralı
 */
export function spotTerms(text, { limit = 8 } = {}) {
    const source = String(text || '');
    if (!source.trim()) return [];

    const folded = foldTr(source);
    const found = [];
    const taken = [];

    // 1) Sözlük terimleri — uzundan kısaya, çakışan kısa parçalar elenir
    for (const term of VOCAB_SORTED) {
        const needle = foldTr(term);
        let from = 0;
        for (;;) {
            const at = folded.indexOf(needle, from);
            if (at === -1) break;
            from = at + needle.length;
            // Kelime sınırı: ortasından yakalamayalım ("crm" ⊄ "scrmble")
            const before = folded[at - 1];
            const after = folded[at + needle.length];
            const isBoundary = (c) => c === undefined || /[^\p{L}\p{N}]/u.test(c);
            // Türkçe ek almış hâli kabul: "CRM'de", "funnel'ı"
            if (!isBoundary(before)) continue;
            if (!isBoundary(after) && !/[\p{L}]/u.test(after || '')) continue;
            pushMatch(found, taken, at, at + needle.length, source.slice(at, at + needle.length));
        }
    }

    // 2) Kısaltmalar — sözlükte olmayan yenileri de yakalar
    for (const m of source.matchAll(ABBREV)) {
        const raw = m[0];
        if (raw.length < MIN_LEN || NOT_A_TERM.has(foldTr(raw))) continue;
        pushMatch(found, taken, m.index, m.index + raw.length, raw);
    }

    return found
        .sort((a, b) => a.start - b.start)
        .slice(0, limit);
}

/**
 * Metni terim ve düz parçalara böler — arayüz bunu doğrudan basar.
 *
 * @returns {Array<{text: string, term: string|null}>}
 */
export function splitByTerms(text, options) {
    const source = String(text || '');
    const spots = spotTerms(source, options);
    if (spots.length === 0) return source ? [{ text: source, term: null }] : [];

    const parts = [];
    let at = 0;
    for (const s of spots) {
        if (s.start > at) parts.push({ text: source.slice(at, s.start), term: null });
        parts.push({ text: source.slice(s.start, s.end), term: s.term });
        at = s.end;
    }
    if (at < source.length) parts.push({ text: source.slice(at), term: null });
    return parts;
}
