// Doğal dil sorgusunun ÇALIŞTIRILDIĞI yer.
//
// İK asistanının çekirdek kuralı: modelin ürettiği tek şey SORGU, cevap değil.
// Sayıyı, listeyi, oranı burası hesaplar. Modele "kaç aday var" diye sormak
// bu projede iki kez denendi ve iki kez uydurma cevap üretti; gereksinim
// gözden geçirme panelinde de aynı ayrımı yaptık (ölçüm kodda, ifade AI'da).
//
// Bu yüzden burada AI yok. Girdi bir sorgu nesnesi, çıktı sayılabilir sonuç.
//
// DÜRÜSTLÜK KURALI: bu pozisyon için taranmamış bir adaya "gereksinimi
// karşılıyor" da "karşılamıyor" da diyemeyiz. Böyle adaylar sonuçtan düşer ama
// SESSİZCE değil — `skipped` olarak sayılır ve arayüzde söylenir.

import { analysisScoreFor } from './positionScore';
import { requirementsOf, requirementsFingerprint } from './positionRequirements';
import { mustHaveGate } from './mustHaveGate';
import { starPercent } from './starDimensions';
import { skillAffinity } from './skillGraph';
import { cvTextOf } from './candidateCv';
import { resolveStageKey } from './candidateTable';
import { getStage } from './pipelineStages';
import { foldTr, foldedIncludes } from './turkishText';

/** Sonuç listesinde varsayılan üst sınır — sohbet penceresi sonsuz liste kaldırmaz. */
export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 200;

/** Bir beceriyi "var" saymak için gereken en düşük graf yakınlığı (kardeş araç seviyesi). */
export const SKILL_THRESHOLD = 0.6;

/**
 * Sorgunun tanıdığı alanlar. Model bunların DIŞINA çıkarsa filtre sessizce
 * uygulanmaz; `ignored` listesine düşer ve kullanıcıya "şunu anlamadım" denir.
 * Sessiz düşürme, yanlış sayıyı doğru gibi göstermekten beterdir.
 */
export const QUERY_FIELDS = {
    score: { ops: ['gte', 'lte', 'eq'], needsScan: true },
    requirement: { ops: ['is'], needsScan: true },
    gate: { ops: ['is'], needsScan: true },
    star: { ops: ['gte', 'lte'], needsScan: true },
    scan: { ops: ['is'], needsScan: false },
    location: { ops: ['includes', 'excludes'], needsScan: false },
    skill: { ops: ['has'], needsScan: false },
    stage: { ops: ['is'], needsScan: false },
    text: { ops: ['includes'], needsScan: false },
};

/**
 * Pozisyon olmadan ANLAMI OLMAYAN alanlar.
 *
 * Bu alanların hepsi adayın `positionAnalyses[pozisyonBaşlığı]` kaydını okur.
 * Pozisyon yoksa o kayıt bulunamaz, aday "taranmamış" sayılır ve `skipped`
 * kefesine düşer — HER aday. Sonuç 0 çıkar ve ekran "bu pozisyon için derin
 * taraması yok" der.
 *
 * O cümle canlıda yanlış çıktı: 659 adayın hepsi elendi, oysa ortada pozisyon
 * YOKTU. Kullanıcı tarama yapmaya yönlendirildi — tarama yapsa da değişmezdi.
 * Eksik olan tarama değil, pozisyondu.
 *
 * Sebebi yanlış söylemek, söylememekten kötüdür: kullanıcıyı çözülmeyecek bir
 * işe gönderir.
 */
export const POSITION_FIELDS = new Set(['score', 'requirement', 'gate', 'star']);

/** Sorgu bir pozisyon olmadan çalışabilir mi? */
export function queryNeedsPosition(spec) {
    const filters = Array.isArray(spec?.filters) ? spec.filters : [];
    if (filters.some((f) => POSITION_FIELDS.has(f?.field))) return true;
    return POSITION_FIELDS.has(spec?.sort?.field);
}

const REQUIREMENT_STATUSES = ['met', 'partial', 'missing'];
const GATE_STATUSES = ['ok', 'partial', 'missing', 'unknown'];
const SCAN_STATES = ['scanned', 'unscanned', 'fresh', 'stale'];

/** Adayın bu pozisyon için kayıtlı analizi. */
function analysisOf(candidate, positionTitle) {
    if (!positionTitle) return null;
    return candidate?.positionAnalyses?.[positionTitle] || null;
}

/** Madde bazlı değerlendirmeler — iki farklı yerde saklanabiliyor. */
function assessmentsOf(analysis) {
    const direct = analysis?.requirementCoverage?.assessments;
    if (Array.isArray(direct)) return direct;
    const nested = analysis?.scoreData?.requirementCoverage?.assessments;
    return Array.isArray(nested) ? nested : null;
}

/** Adayın aranabilir metni: beceriler + CV + başlık. */
function searchableText(candidate) {
    return [
        candidate?.name,
        candidate?.title || candidate?.role,
        candidate?.location,
        Array.isArray(candidate?.skills) ? candidate.skills.join(' ') : '',
        cvTextOf(candidate),
    ].filter(Boolean).join(' ');
}

/** Adayın beceri listesi — alan boşsa CV metnini kelimelere böleriz. */
function skillsOf(candidate) {
    const listed = Array.isArray(candidate?.skills) ? candidate.skills : [];
    if (listed.length > 0) return listed;
    return cvTextOf(candidate).split(/[\s,;/|()•\n]+/).filter((w) => w.length > 1);
}

/**
 * Pozisyonu başlığından bulur. Model kullanıcının yazdığını aynen geçirir
 * ("growth pm", "Growth PM pozisyonu"); tam eşleşme beklemek kırılgan olurdu.
 */
export function resolvePosition(name, positions) {
    if (!name) return null;
    const list = Array.isArray(positions) ? positions : [];
    const needle = foldTr(name).trim();
    if (!needle) return null;
    return list.find((p) => foldTr(p?.title) === needle)
        || list.find((p) => foldTr(p?.title).includes(needle))
        || list.find((p) => needle.includes(foldTr(p?.title)) && foldTr(p?.title).length > 2)
        || null;
}

/** Adayın sorgu için gereken türetilmiş değerleri. */
function viewOf(candidate, position, fingerprint) {
    const analysis = analysisOf(candidate, position?.title);
    const assessments = assessmentsOf(analysis);
    const scanned = Boolean(analysis && assessments);
    return {
        candidate,
        analysis,
        assessments,
        scanned,
        fresh: scanned && analysis.requirementsFingerprint === fingerprint,
        score: position
            ? (scanned ? analysisScoreFor(candidate, position) : NaN)
            : Number(candidate?.bestScore ?? 0),
        gate: scanned ? mustHaveGate(analysis, position, candidate).status : 'unknown',
        star: scanned ? starPercent(analysis?.starAnalysis) : null,
        stageKey: resolveStageKey(candidate?.status),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtreler. Her biri { ok(view), label } döndürür; label denetim kutusunda
// "hangi filtreleri uyguladım" diye gösterilir.
// ─────────────────────────────────────────────────────────────────────────────

const CMP = {
    gte: (a, b) => a >= b,
    lte: (a, b) => a <= b,
    eq: (a, b) => a === b,
};
const CMP_LABEL = { gte: 'en az', lte: 'en fazla', eq: 'tam' };

function numericFilter(f, read, unit, name) {
    const op = CMP[f.op] ? f.op : 'gte';
    const value = Number(f.value);
    if (!Number.isFinite(value)) return null;
    return {
        ok: (v) => { const n = read(v); return Number.isFinite(n) && CMP[op](n, value); },
        label: `${name} ${CMP_LABEL[op]} ${value}${unit}`,
    };
}

function buildFilter(f, position) {
    switch (f?.field) {
        case 'score':
            return numericFilter(f, (v) => v.score, '', 'Puan');
        case 'star':
            return numericFilter(f, (v) => v.star, '%', 'STAR');
        case 'requirement': {
            const index = Number(f.index);
            const status = String(f.value || f.status || '').toLowerCase();
            if (!Number.isInteger(index) || !REQUIREMENT_STATUSES.includes(status)) return null;
            const text = requirementsOf(position)[index - 1]?.text || `${index}. madde`;
            return {
                ok: (v) => statusAt(v, index) === status,
                label: `${index}. gereksinim "${text}" → ${status === 'met' ? 'karşılıyor' : status === 'partial' ? 'kısmen' : 'karşılamıyor'}`,
            };
        }
        case 'gate': {
            const status = String(f.value || '').toLowerCase();
            if (!GATE_STATUSES.includes(status)) return null;
            return { ok: (v) => v.gate === status, label: `Zorunlu kapısı: ${status}` };
        }
        case 'scan': {
            const state = String(f.value || '').toLowerCase();
            if (!SCAN_STATES.includes(state)) return null;
            const ok = {
                scanned: (v) => v.scanned,
                unscanned: (v) => !v.scanned,
                fresh: (v) => v.scanned && v.fresh,
                stale: (v) => v.scanned && !v.fresh,
            }[state];
            return { ok, label: `Tarama durumu: ${state}` };
        }
        case 'location': {
            const value = String(f.value || '').trim();
            if (!value) return null;
            const exclude = f.op === 'excludes';
            return {
                ok: (v) => foldedIncludes(v.candidate?.location, value) !== exclude,
                label: `Konum ${exclude ? 'değil' : ''} "${value}"`,
            };
        }
        case 'skill': {
            const value = String(f.value || '').trim();
            if (!value) return null;
            return {
                ok: (v) => skillAffinity(value, skillsOf(v.candidate)) >= SKILL_THRESHOLD
                    || foldedIncludes(searchableText(v.candidate), value),
                label: `Beceri "${value}"`,
            };
        }
        case 'stage': {
            const key = String(f.value || '').toLowerCase();
            if (!key) return null;
            return { ok: (v) => v.stageKey === key, label: `Aşama: ${getStage(key).label}` };
        }
        case 'text': {
            const value = String(f.value || '').trim();
            if (!value) return null;
            return {
                ok: (v) => foldedIncludes(searchableText(v.candidate), value),
                label: `Metinde "${value}" geçiyor`,
            };
        }
        default:
            return null;
    }
}

/** Adayın belirli bir maddedeki durumu. */
function statusAt(view, index) {
    for (const a of view.assessments || []) {
        if (Number(a?.index) === index) return String(a?.status || '').toLowerCase();
    }
    return null;
}

/** Sorguyu doğrular: tanınmayan alanlar uygulanmaz, listelenir. */
function normalizeFilters(raw, position) {
    const built = [];
    const ignored = [];
    let needsScan = false;
    for (const f of Array.isArray(raw) ? raw : []) {
        const spec = QUERY_FIELDS[f?.field];
        const filter = spec ? buildFilter(f, position) : null;
        if (!filter) { ignored.push(describeUnknown(f)); continue; }
        if (spec.needsScan) needsScan = true;
        built.push(filter);
    }
    return { built, ignored, needsScan };
}

function describeUnknown(f) {
    const field = String(f?.field ?? 'bilinmeyen');
    return f?.value !== undefined ? `${field}: ${String(f.value)}` : field;
}

const SORTERS = {
    score: (a, b) => (Number(b.score) || 0) - (Number(a.score) || 0),
    star: (a, b) => (Number(b.star) || 0) - (Number(a.star) || 0),
    name: (a, b) => String(a.candidate?.name || '').localeCompare(String(b.candidate?.name || ''), 'tr'),
};

/** Gruplama anahtarları — "şehre göre dağılım" gibi sorular için. */
const GROUPERS = {
    location: (v) => String(v.candidate?.location || '').trim() || 'Belirtilmemiş',
    stage: (v) => getStage(v.stageKey).label,
    gate: (v) => v.gate,
    scan: (v) => (v.scanned ? (v.fresh ? 'güncel' : 'bayat') : 'taranmamış'),
};

/**
 * Sorguyu çalıştırır.
 *
 * @param {object} spec — { position, filters, sort, limit, groupBy }
 * @param {{candidates: Array, positions: Array}} data
 * @returns {{
 *   position: object|null, positionTitle: string|null,
 *   pool: number, evaluated: number, skipped: number, total: number,
 *   rows: Array, groups: Array|null, applied: string[], ignored: string[],
 *   limit: number, truncated: boolean,
 * }}
 */
export function runCandidateQuery(spec, { candidates = [], positions = [] } = {}) {
    const position = resolvePosition(spec?.position, positions);
    const fingerprint = position ? requirementsFingerprint(position) : null;
    const { built, ignored, needsScan } = normalizeFilters(spec?.filters, position);

    const pool = Array.isArray(candidates) ? candidates : [];
    let skipped = 0;
    const matched = [];

    for (const c of pool) {
        const view = viewOf(c, position, fingerprint);
        // Taranmamış adaya "karşılıyor/karşılamıyor" diyemeyiz. Sayıma girmez
        // ama kaybolmaz: kaç tanesi olduğu söylenir.
        if (needsScan && !view.scanned && !hasScanStateFilter(spec)) { skipped += 1; continue; }
        if (built.every((f) => f.ok(view))) matched.push(view);
    }

    const sorter = SORTERS[spec?.sort?.field] || SORTERS.score;
    matched.sort(sorter);
    if (spec?.sort?.dir === 'asc') matched.reverse();

    const limit = clampLimit(spec?.limit);
    const grouper = GROUPERS[spec?.groupBy];

    return {
        position,
        positionTitle: position?.title || null,
        // "Pozisyon eksik" ile "tarama eksik" AYRI iki durum ve ayrı iki iş
        // gerektiriyor. İkisini aynı cümleyle anlatmak, kullanıcıyı yapması
        // gerekmeyen bir işe (yeniden tarama) gönderiyordu.
        missingPosition: queryNeedsPosition(spec) && !position,
        pool: pool.length,
        evaluated: pool.length - skipped,
        skipped,
        total: matched.length,
        rows: matched.slice(0, limit),
        groups: grouper ? groupRows(matched, grouper) : null,
        applied: built.map((f) => f.label),
        ignored,
        limit,
        truncated: matched.length > limit,
    };
}

/** "Taranmamışları getir" sorgusunda tarama şartı elemeyi bozmamalı. */
function hasScanStateFilter(spec) {
    return (spec?.filters || []).some(
        (f) => f?.field === 'scan' && ['unscanned', 'scanned', 'fresh', 'stale'].includes(String(f?.value).toLowerCase())
    );
}

function clampLimit(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
    return Math.min(Math.floor(n), MAX_LIMIT);
}

function groupRows(rows, grouper) {
    const counts = new Map();
    for (const v of rows) {
        const key = grouper(v);
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count);
}
