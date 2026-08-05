// Pure logic for the candidates table report screen (CandidatesTablePage).
//
// Kept UI-free so filtering, sorting and export-row mapping are unit-testable
// without rendering. The page component owns filter STATE; this module owns
// filter BEHAVIOR.
import { STAGES, getStage } from './pipelineStages';

/** Map any raw/legacy candidate status onto a canonical stage key. */
export function resolveStageKey(status) {
    if (!status) return 'ai_analysis';
    for (const s of STAGES) {
        if (s.key === status || s.legacy.includes(status)) return s.key;
    }
    return 'ai_analysis';
}

/** Applied date as 'YYYY-MM-DD' — prefers the explicit field, falls back to createdAt. */
export function getAppliedDate(candidate) {
    if (candidate?.appliedDate) return String(candidate.appliedDate).slice(0, 10);
    const ts = candidate?.createdAt;
    if (ts && typeof ts.toMillis === 'function') {
        return new Date(ts.toMillis()).toISOString().slice(0, 10);
    }
    return '';
}

export const DEFAULT_FILTERS = {
    search: '',
    stage: 'all',
    position: 'all',
    department: 'all',
    source: 'all',
    minScore: '',
    dateFrom: '',
    dateTo: '',
};

/**
 * Adayın SEÇİLİ pozisyona uyum skoru: kaydedilmiş AI analizi (positionAnalyses,
 * pozisyon başlığıyla anahtarlı) ile ücretsiz anahtar-kelime skorunun büyüğü.
 * keywordScoreFn dışarıdan verilir (matchService.calculateMatchScore) — bu
 * modül UI/servis bağımlılığı almadan test edilebilir kalır.
 */
export function scoreForPosition(candidate, position, keywordScoreFn) {
    if (!position?.title) return 0;
    const saved = Number(candidate?.positionAnalyses?.[position.title]?.score ?? 0);
    const keyword = keywordScoreFn ? Number(keywordScoreFn(candidate, position) || 0) : 0;
    return Math.max(saved, keyword);
}

/**
 * Filter enriched candidates for the table view.
 * All filters combine with AND; 'all' / empty string means "not active".
 *
 * opts.position (açık pozisyon objesi) verildiğinde pozisyon filtresi
 * "uygunluk modu"na geçer: adaylar etiketlerine göre ELENMEZ; her adaya o
 * pozisyon için positionScore hesaplanır, min skor eşiği ve sıralama bu skora
 * uygulanır. Obje verilmezse eski etiket eşleştirmesi korunur.
 */
export function applyTableFilters(rows, filters, opts = {}) {
    const f = { ...DEFAULT_FILTERS, ...filters };
    const positionMode = f.position !== 'all' && Boolean(opts.position);
    let result = rows;

    if (f.search.trim()) {
        const q = f.search.toLowerCase().trim();
        result = result.filter(
            (c) =>
                c.name?.toLowerCase().includes(q) ||
                c.email?.toLowerCase().includes(q) ||
                c.phone?.toLowerCase?.().includes(q) ||
                c.position?.toLowerCase().includes(q) ||
                c.bestTitle?.toLowerCase().includes(q) ||
                c.location?.toLowerCase().includes(q) ||
                (Array.isArray(c.skills) && c.skills.some((s) => String(s).toLowerCase().includes(q)))
        );
    }
    if (f.stage !== 'all') {
        result = result.filter((c) => resolveStageKey(c.status) === f.stage);
    }
    if (f.position !== 'all') {
        if (positionMode) {
            result = result.map((c) => ({
                ...c,
                positionScore: scoreForPosition(c, opts.position, opts.keywordScoreFn),
            }));
        } else {
            result = result.filter((c) => (c.bestTitle || c.position) === f.position);
        }
    }
    if (f.department !== 'all') {
        result = result.filter((c) => c.department === f.department);
    }
    if (f.source !== 'all') {
        result = result.filter((c) => c.source === f.source);
    }
    if (f.minScore !== '' && !isNaN(Number(f.minScore))) {
        const min = Number(f.minScore);
        // Pozisyon modunda eşik, adayın SEÇİLİ pozisyondaki skoruna uygulanır —
        // genel/en-iyi skora değil (eski davranış yanlış adayları geçiriyordu).
        result = result.filter((c) => {
            const basis = positionMode ? Number(c.positionScore || 0) : Number(c.combinedScore || 0);
            return basis >= min;
        });
    }
    if (f.dateFrom) {
        result = result.filter((c) => {
            const d = getAppliedDate(c);
            return d && d >= f.dateFrom;
        });
    }
    if (f.dateTo) {
        result = result.filter((c) => {
            const d = getAppliedDate(c);
            return d && d <= f.dateTo;
        });
    }
    return result;
}

// Column → value extractor. Numeric columns sort as numbers (nulls last),
// string columns sort locale-aware (Turkish).
const SORT_ACCESSORS = {
    name: (c) => c.name || '',
    email: (c) => c.email || '',
    position: (c) => c.bestTitle || c.position || '',
    department: (c) => c.department || '',
    source: (c) => c.source || '',
    stage: (c) => getStage(resolveStageKey(c.status)).label,
    bestScore: (c) => (c.bestScore ?? null),
    positionScore: (c) => (c.positionScore ?? null),
    interviewScore: (c) => (c.interviewScore ?? null),
    combinedScore: (c) => (c.combinedScore ?? null),
    experience: (c) => (c.experience ?? null),
    appliedDate: (c) => getAppliedDate(c) || null,
};

/** Return a NEW sorted array; never mutates the input. */
export function sortRows(rows, sortKey, sortDir = 'desc') {
    const accessor = SORT_ACCESSORS[sortKey];
    if (!accessor) return [...rows];
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
        const va = accessor(a);
        const vb = accessor(b);
        // Nulls always last regardless of direction
        if (va === null || va === '') return vb === null || vb === '' ? 0 : 1;
        if (vb === null || vb === '') return -1;
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb), 'tr') * dir;
    });
}

/** Flat, Turkish-labelled rows for the Excel export — column order matters. */
export function buildExportRows(rows) {
    return rows.map((c) => ({
        'Ad Soyad': c.name || '',
        'E-posta': c.email || '',
        'Telefon': c.phone || '',
        'Pozisyon': c.bestTitle || c.position || '',
        'Departman': c.department || '',
        'Aşama': getStage(resolveStageKey(c.status)).label,
        'Kaynak': c.source || '',
        'Kaynak Detayı': c.sourceDetail || '',
        'AI Skoru': c.bestScore ?? '',
        ...(c.positionScore !== undefined ? { 'Seçili Pozisyon Uyumu': c.positionScore } : {}),
        'Mülakat Skoru': c.interviewScore ?? '',
        'Genel Skor': c.combinedScore ?? '',
        'Deneyim (Yıl)': c.experience ?? '',
        'Lokasyon': c.location || '',
        'Eğitim': c.education || '',
        'Yetenekler': Array.isArray(c.skills) ? c.skills.join(', ') : '',
        'Başvuru Tarihi': getAppliedDate(c),
    }));
}
