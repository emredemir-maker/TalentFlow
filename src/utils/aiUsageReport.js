// AI KULLANIM RAPORUNUN HESABI — ekrandan ayrı, çünkü test edilmesi gereken şey bu.
//
// Sunucu gün gün özet döndürüyor (functions/routes/admin.js → /api/admin/usage).
// Ekranda cevaplanması gereken soru ise başka: "hangi ÖZELLİK pahalı?" Tek
// günün dağılımı gürültülü — bir gün toplu yükleme yapılmışsa CV ayrıştırma
// her şeyi bastırır. Anlamlı olan, seçilen aralığın etiket bazında toplamı.

/** Ölçüm etiketlerinin Türkçesi — 'coverage' kimseye bir şey anlatmıyor. */
export const LABEL_TR = {
    'cv-parse': 'CV ayrıştırma',
    coverage: 'Madde damgaları (skor)',
    narrative: 'Anlatım / gerekçe',
    prescreen: 'Başvuru ön elemesi',
    'interview-grade': 'Mülakat damgaları',
    'interview-eval': 'Mülakat gözlemi',
    'interview-plan': 'Mülakat soruları',
    'interview-review': 'Mülakat raporu',
    requirement: 'İlan danışmanı',
    assistant: 'İK asistanı',
    grounded: 'Aramalı araştırma',
    'position-draft': 'İlan taslağı',
    'salary-extract': 'Maaş okuma',
    other: 'Diğer',
};

/** Bilinmeyen etiket GİZLENMİYOR — yeni bir özellik eklendiğinde görünmeli. */
export function labelText(label) {
    return LABEL_TR[label] || String(label || 'Bilinmiyor');
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Günleri etiket bazında toplar, pahalıdan ucuza sıralar.
 *
 * @param {Array} days — /api/admin/usage `days` alanı
 * @returns {Array<{label, calls, inTokens, outTokens, cost, perCall}>}
 */
export function aggregateByLabel(days) {
    const list = Array.isArray(days) ? days : [];
    const acc = new Map();

    for (const g of list) {
        for (const r of (Array.isArray(g?.rows) ? g.rows : [])) {
            const label = String(r?.label || 'other');
            const p = acc.get(label) || { label, calls: 0, inTokens: 0, outTokens: 0, cost: 0 };
            p.calls += num(r.calls);
            p.inTokens += num(r.inTokens);
            p.outTokens += num(r.outTokens);
            p.cost += num(r.cost);
            acc.set(label, p);
        }
    }

    return [...acc.values()]
        // ÇAĞRI BAŞI MALİYET sıralamadan daha çok şey anlatıyor: 1000 ucuz
        // çağrı ile 10 pahalı çağrı aynı toplamı verebilir ama farklı şeyler
        // yapılması gerektiğini söyler.
        .map((p) => ({ ...p, perCall: p.calls > 0 ? p.cost / p.calls : 0 }))
        .sort((a, b) => b.cost - a.cost);
}

/** Aralığın toplamı. */
export function usageTotals(days) {
    const list = Array.isArray(days) ? days : [];
    return {
        cost: list.reduce((s, g) => s + num(g?.totalCost), 0),
        calls: list.reduce((s, g) => s + num(g?.calls), 0),
        dayCount: list.length,
    };
}

/**
 * Bir sınırın doluluk durumu.
 *
 * UYARI EŞİĞİ %80. Sınıra değdiğinde uyarmak geç: o an servis zaten durmuş
 * oluyor. Uyarının işe yaraması için dolmadan ÖNCE görünmesi gerekiyor.
 *
 * @returns {{open: boolean, ratio: number, tone: 'none'|'ok'|'warn'|'over'}}
 *   open=false → sınır tanımlı değil, fren kapalı.
 */
export function limitState(used, limit) {
    const u = Math.max(0, num(used));
    const l = num(limit);
    if (l <= 0) return { open: false, ratio: 0, tone: 'none' };
    const ratio = u / l;
    if (ratio >= 1) return { open: true, ratio: 1, tone: 'over' };
    if (ratio >= 0.8) return { open: true, ratio, tone: 'warn' };
    return { open: true, ratio, tone: 'ok' };
}
