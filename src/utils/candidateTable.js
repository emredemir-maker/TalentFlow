// Pure logic for the candidates table report screen (CandidatesTablePage).
//
// Kept UI-free so filtering, sorting and export-row mapping are unit-testable
// without rendering. The page component owns filter STATE; this module owns
// filter BEHAVIOR.
import { analysisScoreFor, analysisFor } from './positionScore';
import { mustHaveGate } from './mustHaveGate';
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

/**
 * "CV'ye göre ideal rol" metni yalnızca rol BAŞLIĞI olmalı — AI bazen yorum
 * cümlesi üretebiliyor ve eski kayıtlarda bunlar persist edilmiş olabilir.
 * Kurallar: ilk cümle/satır; virgül/eğik çizgi ayraçlı en fazla 3 başlık
 * ", " ile birleştirilir; tek "başlık" 6 kelimeden uzunsa ya da toplam 80
 * karakteri aşıyorsa yorum sayılır → fallback (CV'deki mevcut rol) döner.
 * NOT: functions/services/bulkWorker.js'teki sanitizeSuggestedRole bunun
 * kural ikizidir — davranış değişikliği ikisine birden uygulanmalı.
 */
export function cleanRoleText(raw, fallback = '') {
    let s = String(raw || '').trim().replace(/^["'`]+|["'`.!?]+$/g, '').trim();
    if (!s) return fallback;
    s = s.split(/[.!?\n]/)[0].trim();
    const parts = s.split(/\s*(?:,|\/|;|\|| - )\s*/).map((p) => p.trim()).filter(Boolean).slice(0, 3);
    if (parts.length === 0 || parts.some((p) => p.split(/\s+/).length > 6)) return fallback;
    const joined = parts.join(', ');
    return joined.length > 80 ? fallback : joined;
}

/**
 * Otonom (derin) tarama yapılmış mı? Toplu tarama aksiyonuyla aynı ölçüt:
 * STAR analizi kaydı varsa aday derin taramadan geçmiştir.
 */
export function isDeepScanned(candidate) {
    return Boolean(candidate?.aiAnalysis?.starAnalysis);
}

export const DEFAULT_FILTERS = {
    search: '',
    stage: 'all',
    position: 'all',
    department: 'all',
    source: 'all',
    scan: 'all', // 'all' | 'scanned' | 'unscanned'
    location: 'all', // 'all' | 'istanbul' | 'outside' | 'unknown'
    minScore: '',
    dateFrom: '',
    dateTo: '',
};

/**
 * Türkçe'ye duyarlı karşılaştırma anahtarı.
 * 'İstanbul'.toLowerCase() JavaScript'te "i̇stanbul" üretir (i + birleşen nokta),
 * bu yüzden düz includes('istanbul') İ ile yazılmış konumları KAÇIRIR.
 * İ→I ve ı→i eşlemesinden sonra aksanlar ayrıştırılıp atılır.
 */
function foldTurkish(value) {
    return String(value || '')
        .replace(/İ/g, 'I')
        .replace(/ı/g, 'i')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/** Konum metni İstanbul'u işaret ediyor mu? ("Kadıköy/İstanbul", "ISTANBUL, TR" …) */
export function isIstanbulLocation(location) {
    return foldTurkish(location).includes('istanbul');
}

/**
 * Adayı konum kovasına yerleştirir: İstanbul içi / dışı / bilinmiyor.
 * Konum alanı boşsa "outside" DEĞİL "unknown" döner — veri eksikliği,
 * şehir dışı olmakla aynı şey değildir ve eleme kararını bozmamalıdır.
 */
export function locationBucket(candidate) {
    const raw = String(candidate?.location || '').trim();
    if (!raw) return 'unknown';
    return isIstanbulLocation(raw) ? 'istanbul' : 'outside';
}

/**
 * Adayın SEÇİLİ pozisyona uyum skoru: kaydedilmiş AI analizi (positionAnalyses,
 * pozisyon başlığıyla anahtarlı) ile ücretsiz anahtar-kelime skorunun büyüğü.
 * keywordScoreFn dışarıdan verilir (matchService.calculateMatchScore) — bu
 * modül UI/servis bağımlılığı almadan test edilebilir kalır.
 *
 * keywordScoreFn HEM sayı HEM de {score} objesi döndürebilir: calculateMatchScore
 * obje döndürür ve çağıranların `.score` almayı unutması sessizce her adaya 0
 * yazıyordu (Number(obje) → NaN → 0). Bu, "min skor 56 üstünde 0 aday" gibi
 * gerçek bir hataya yol açtı; sınır artık burada toleranslı.
 */
function numericScore(value) {
    const n = typeof value === 'object' && value !== null ? Number(value.score) : Number(value);
    return Number.isFinite(n) ? n : 0;
}

export function scoreForPosition(candidate, position, keywordScoreFn) {
    if (!position?.title) return 0;
    // Saklanan sayı değil, YENİDEN HESAPLANAN analiz skoru: ağırlık
    // değişince liste ile skor kırılımı ayrışmasın.
    const saved = analysisScoreFor(candidate, position);
    const keyword = keywordScoreFn ? numericScore(keywordScoreFn(candidate, position)) : 0;
    return Math.max(Number.isFinite(saved) ? saved : 0, keyword);
}

/**
 * GÖSTERİLEN metin de GÖSTERİLEN pozisyonun metnidir.
 *
 * Arayüz analiz metnini tek bir `aiAnalysis.summary` alanından okuyordu; oysa
 * analizler pozisyon BAŞLIĞIYLA anahtarlı `positionAnalyses` haritasında ayrı
 * ayrı duruyor. Sonuç: aday hangi pozisyon bağlamında açılırsa açılsın aynı
 * yorum görünüyordu — kullanıcı "bu yorum hep sabit kalıyor" diye bildirdi.
 *
 * Öncelik: gösterilen pozisyonun kayıtlı analizi → aynı pozisyon için
 * üretilmiş `aiAnalysis` → (yoksa) null. Null dönerse çağıran, elindeki
 * `aiAnalysis`'i "başka pozisyon için üretilmiş" uyarısıyla gösterebilir.
 *
 * @returns {{summary: string, analyzedFor: string, score: number|null}|null}
 */
export function analysisForPosition(candidate, positionTitle) {
    if (!candidate || !positionTitle) return null;
    const saved = candidate.positionAnalyses?.[positionTitle];
    if (saved?.summary) {
        return {
            summary: saved.summary,
            analyzedFor: positionTitle,
            score: Number.isFinite(Number(saved.score)) ? Number(saved.score) : null,
        };
    }
    const ai = candidate.aiAnalysis;
    if (ai?.summary && ai.analyzedForPosition === positionTitle) {
        return {
            summary: ai.summary,
            analyzedFor: positionTitle,
            score: Number.isFinite(Number(ai.score)) ? Number(ai.score) : null,
        };
    }
    return null;
}

/**
 * Gösterilen pozisyonun TAM analiz kaydı.
 *
 * analysisForPosition yalnızca {summary, analyzedFor, score} döndürür — metin
 * göstermeye yeter ama `requirementCoverage` / `starAnalysis` taşımaz. Skor
 * kırılımı ve zorunlu-gereksinim kapısı bu alanlara ihtiyaç duyuyor;
 * daraltılmış nesne verilirse ikisi de sessizce boş kalır.
 *
 * Öncelik analysisForPosition ile AYNI: pozisyonun kayıtlı analizi → aynı
 * pozisyon için üretilmiş aiAnalysis → null.
 */
export function fullAnalysisForPosition(candidate, positionTitle) {
    if (!candidate || !positionTitle) return null;
    const saved = candidate.positionAnalyses?.[positionTitle];
    if (saved) return saved;
    const ai = candidate.aiAnalysis;
    if (ai && ai.analyzedForPosition === positionTitle) return ai;
    return null;
}

/**
 * Skor tutarlılığı kuralı: GÖSTERİLEN skor, GÖSTERİLEN pozisyonun skorudur.
 *
 * Adayın matchedPositionTitle'ı açık bir pozisyona işaret ediyorsa satırdaki
 * AI skoru o pozisyonun skoru olur (kayıtlı pozisyon analizi, o pozisyon için
 * yapılmış derin analiz ve anahtar-kelime skorunun en büyüğü). Aksi halde
 * (başlık yok/kapalı) mevcut bestScore korunur. combinedScore mülakat
 * skoruyla aynı formülle yeniden türetilir. Eski davranış "en iyi eşleşme"
 * skorunu başka bir pozisyonun başlığının yanında gösterip yanıltıyordu
 * (örn. başlık Growth PM, skor eski bir analizden %75, gerçek uyum %34).
 */
export function withCoherentScores(rows, openPositions, keywordScoreFn) {
    const byTitle = new Map((openPositions || []).map((p) => [p.title, p]));
    return rows.map((c) => {
        const pos = c.matchedPositionTitle ? byTitle.get(c.matchedPositionTitle) : null;
        if (!pos) return c;
        const fromAnalysis = c.aiAnalysis?.analyzedForPosition === pos.title
            ? Number(c.aiAnalysis?.score || 0)
            : 0;
        const score = Math.round(Math.max(scoreForPosition(c, pos, keywordScoreFn), fromAnalysis));
        const combined = c.interviewScore != null
            ? Math.round((score + Number(c.interviewScore)) / 2)
            : score;
        return { ...c, bestScore: score, combinedScore: combined };
    });
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
            // Zorunlu kapısı skorla BİRLİKTE taşınır. Kod bunu zaten
            // hesaplıyordu ama yalnızca aday sayfasında gösteriliyordu:
            // listede %80 gören kullanıcı, adayın bir zorunlu maddeyi hiç
            // karşılamadığını göremiyordu.
            result = result.map((c) => ({
                ...c,
                positionScore: scoreForPosition(c, opts.position, opts.keywordScoreFn),
                positionGate: mustHaveGate(analysisFor(c, opts.position?.title), opts.position),
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
    if (f.scan !== 'all') {
        result = result.filter((c) => (f.scan === 'scanned' ? isDeepScanned(c) : !isDeepScanned(c)));
    }
    if (f.location !== 'all') {
        result = result.filter((c) => locationBucket(c) === f.location);
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
    cvRole: (c) => cleanRoleText(c.suggestedRole, c.position || '') || '',
    department: (c) => c.department || '',
    location: (c) => c.location || '',
    source: (c) => c.source || '',
    stage: (c) => getStage(resolveStageKey(c.status)).label,
    scanStatus: (c) => (isDeepScanned(c) ? 1 : 0),
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
        "CV'ye Göre İdeal Rol": cleanRoleText(c.suggestedRole, c.position || '') || '',
        'Departman': c.department || '',
        'Aşama': getStage(resolveStageKey(c.status)).label,
        'Kaynak': c.source || '',
        'Kaynak Detayı': c.sourceDetail || '',
        'Otonom Tarama': isDeepScanned(c) ? 'Yapıldı' : 'Yapılmadı',
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
