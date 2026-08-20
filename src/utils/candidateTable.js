// Pure logic for the candidates table report screen (CandidatesTablePage).
//
// Kept UI-free so filtering, sorting and export-row mapping are unit-testable
// without rendering. The page component owns filter STATE; this module owns
// filter BEHAVIOR.
import { analysisFor, analysisScoreDetail } from './positionScore';
import { sectorBucket, verificationBucket } from './candidateBadges';
import { mustHaveGate } from './mustHaveGate';
import { STAGES, getStage } from './pipelineStages';
import { normalizeStarAnalysis, starPercent } from './starDimensions';

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
    // Doğrulama filtreleri. Sınıflandırma utils/candidateBadges.js'te —
    // rozet ile filtre aynı sayaçtan okur, ayrışamazlar.
    sector: 'all', // 'all' | 'match' | 'near_or_match' | 'outside' | 'unmeasured'
    verification: 'all', // 'all' | 'contradiction' | 'attention' | 'clean' | 'unverified'
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
    return scoreForPositionDetail(candidate, position, keywordScoreFn).score;
}

/**
 * SKORU HANGİ CETVEL ÜRETTİ.
 *
 * analiz  — o pozisyon için derin analiz: gereksinim kapsaması × STAR güveni
 * ai      — o pozisyon için üretilmiş aiAnalysis skoru (tek sayı, kırılımsız)
 * anahtar — metin eşleşmesi; en zayıfı
 * yok     — hiçbiri
 */
export const SCORE_METHOD = { ANALYSIS: 'analiz', AI: 'ai', KEYWORD: 'anahtar', NONE: 'yok' };

export const SCORE_METHOD_LABEL = {
    [SCORE_METHOD.ANALYSIS]: 'Derin analiz',
    [SCORE_METHOD.AI]: 'AI skoru (kırılımsız)',
    [SCORE_METHOD.KEYWORD]: 'Anahtar kelime',
    [SCORE_METHOD.NONE]: 'Ölçülmedi',
};

/**
 * Bir adayın bir pozisyondaki skoru — TEK CETVELDEN.
 *
 * ── NEDEN ARTIK Math.max DEĞİL ──────────────────────────────────────────────
 * Burada `Math.max(analiz, anahtar kelime)` vardı ve bir üstünde
 * withCoherentScores buna bir üçüncüsünü daha ekliyordu. Yani aynı pozisyon
 * için skor üç farklı cetvelden gelebiliyor ve EN CÖMERT olan kazanıyordu.
 *
 * Canlıda görüldü: aynı ilana doğrudan eşleşen aday derin analizle (gereksinim
 * × STAR) ölçülürken, elle atanan aday derin analizi olmadığı için anahtar
 * kelimeye düşüyordu. İki sayı aynı kolonda yan yana duruyor ama aynı şeyi
 * ölçmüyorlar — sıralama sessizce anlamını kaybediyor.
 *
 * Bu tuzağı bu proje BİR KEZ fark etmiş: ön skor için ayrı bir "Ön Skor
 * Yöntemi" kolonu var ve yorumu aynen şunu diyor — "İki cetvel aynı kolonda
 * toplandığında sıralama sessizce anlamsızlaşıyor". Aynı hata pozisyon
 * skorunda düzeltilmemişti, üstelik Math.max ile daha kötü hâldeydi.
 *
 * Artık ÖNCELİK var, maksimum yok: en güçlü cetvel ne diyorsa o. Daha zayıf
 * bir cetvel yalnızca güçlüsü hiç çalışmamışsa devreye giriyor ve hangisi
 * olduğu `method` ile dışarı taşınıyor — arayüz bunu SÖYLEMEK zorunda,
 * yoksa kullanıcı karşılaştırılamaz iki sayıyı karşılaştırır.
 *
 * @returns {{score: number, method: string}}
 */
export function scoreForPositionDetail(candidate, position, keywordScoreFn) {
    if (!position?.title) return { score: 0, method: SCORE_METHOD.NONE };

    // 1. Derin analiz. Saklanan sayı değil, YENİDEN HESAPLANAN skor: ağırlık
    //    değişince liste ile kırılım paneli ayrışmasın.
    const detail = analysisScoreDetail(candidate, position);
    if (detail.scanned) return { score: Math.round(detail.score), method: SCORE_METHOD.ANALYSIS };

    // 2. O pozisyon için üretilmiş aiAnalysis. Kırılımı yok ama en azından
    //    ilanın kendisine bakılarak verilmiş bir sayı.
    if (candidate?.aiAnalysis?.analyzedForPosition === position.title) {
        const n = numericScore(candidate.aiAnalysis.score);
        if (n > 0) return { score: Math.round(n), method: SCORE_METHOD.AI };
    }

    // 3. Anahtar kelime — en zayıf cetvel, yalnızca son çare.
    const keyword = keywordScoreFn ? numericScore(keywordScoreFn(candidate, position)) : 0;
    if (keyword > 0) return { score: Math.round(keyword), method: SCORE_METHOD.KEYWORD };

    return { score: 0, method: SCORE_METHOD.NONE };
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
        // Math.max KALKTI: aiAnalysis artık ayrı bir yarışmacı değil,
        // scoreForPositionDetail içindeki öncelik sırasının ikinci basamağı.
        // Üç cetveli yarıştırıp en cömerdini seçmek, sıralamayı anlamsız
        // kılıyordu (gerekçe: scoreForPositionDetail).
        const { score, method } = scoreForPositionDetail(c, pos, keywordScoreFn);
        const combined = c.interviewScore != null
            ? Math.round((score + Number(c.interviewScore)) / 2)
            : score;
        return { ...c, bestScore: score, combinedScore: combined, scoreMethod: method };
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
            // Tek hesap, iki alan: detayı iki kez çağırmak aynı işi tekrarlardı.
            const positionScoreOf = (c) => scoreForPositionDetail(c, opts.position, opts.keywordScoreFn);
            result = result.map((c) => ({
                ...c,
                positionScore: positionScoreOf(c).score,
                // Hangi cetvel ölçtü — arayüz bunu göstermek zorunda.
                positionScoreMethod: positionScoreOf(c).method,
                positionGate: mustHaveGate(analysisFor(c, opts.position?.title), opts.position, c),
                // Skor mülakattan etkilendiyse hücre bunu söylemeli. Sessizce
                // değişen bir sayı, açıklanamayan bir sayıdır: kullanıcı dün
                // 65 gördüğü adayı bugün 78'de bulur ve nedenini bilemez.
                positionInterviewed: analysisScoreDetail(c, opts.position).interviewed,
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
    if (f.sector !== 'all') {
        // 'near_or_match' TEK BİR KOVA DEĞİL, iki kovanın birleşimi:
        // "aynı ya da komşu sektör" işe alımda sık kurulan bir soru ve
        // kullanıcıyı iki filtreyi elle birleştirmeye zorlamak anlamsız.
        result = result.filter((c) => {
            const bucket = sectorBucket(c);
            return f.sector === 'near_or_match'
                ? (bucket === 'match' || bucket === 'near')
                : bucket === f.sector;
        });
    }
    if (f.verification !== 'all') {
        result = result.filter((c) => verificationBucket(c, { position: opts.position }) === f.verification);
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
    // Doğrulama kolonu ÖNCEDEN HESAPLANMIŞ bir rütbe üzerinden sıralanır.
    // Sıralayıcı her karşılaştırmada erişimci çağırıyor; burada bucket'ı
    // yeniden hesaplasaydık 662 satırlık bir listede binlerce kez CV tarihi
    // ayrıştırılırdı. Rütbe, satır süslenirken bir kez yazılıyor.
    verification: (c) => (c.verificationRank ?? null),
};

/**
 * Doğrulama durumunun sıralama rütbesi — büyük olan daha acil.
 *
 * Azalan sıralamada çelişkililer başa gelir; işe alımcının bu kolonu
 * tıklarken beklediği şey bu.
 */
/**
 * AÇIK FİLTRELERİN İNSAN OKUNUR LİSTESİ.
 *
 * Filtre çubuğunda artık on bir kontrol var ve satır kaydırıyor. Kullanıcı
 * "liste neden bu kadar kısa" sorusunun cevabını görmek için her açılır
 * listeyi tek tek kontrol etmek zorunda kalıyordu — ve sektör filtresi
 * eklendiği hâlde kullanıcının gözetiminden kaçtığı canlıda yaşandı.
 *
 * Bu fonksiyon açık olan filtreleri çip olarak gösterilebilecek biçimde
 * döndürür. Arayüzde değil burada durmasının sebebi: hangi filtrenin
 * "açık" sayıldığı DEFAULT_FILTERS ile karşılaştırmaya bağlı ve bu kural
 * hasActiveFilters ile aynı kalmak zorunda — ikisi ayrışırsa "Temizle"
 * düğmesi görünürken hiç çip olmayan bir durum çıkar.
 *
 * @returns {Array<{key: string, label: string, value: string}>}
 */
export function describeActiveFilters(filters) {
    const f = { ...DEFAULT_FILTERS, ...filters };
    const out = [];
    const push = (key, label, value) => { if (value) out.push({ key, label, value }); };

    if (f.search.trim()) push('search', 'Arama', `"${f.search.trim()}"`);
    if (f.stage !== 'all') push('stage', 'Aşama', getStage(f.stage).label);
    if (f.position !== 'all') push('position', 'Pozisyon', f.position);
    if (f.department !== 'all') push('department', 'Departman', f.department);
    if (f.source !== 'all') push('source', 'Kaynak', f.source);
    if (f.scan !== 'all') push('scan', 'Tarama', f.scan === 'scanned' ? 'Taranmış' : 'Taranmamış');
    if (f.sector !== 'all') push('sector', 'Sektör', SECTOR_FILTER_LABEL[f.sector] || f.sector);
    if (f.verification !== 'all') push('verification', 'Doğrulama', VERIFICATION_FILTER_LABEL[f.verification] || f.verification);
    if (f.location !== 'all') push('location', 'Konum', LOCATION_FILTER_LABEL[f.location] || f.location);
    if (f.minScore !== '') push('minScore', 'Min skor', `%${f.minScore}`);
    // Tarih aralığı TEK ÇİP: iki ayrı çip kullanıcıya iki ayrı filtre
    // varmış gibi görünür, oysa okuduğu şey tek bir aralık.
    if (f.dateFrom || f.dateTo) {
        push('dateRange', 'Başvuru', `${f.dateFrom || '…'} – ${f.dateTo || '…'}`);
    }
    return out;
}

/** Çip kapatılınca hangi alanlar varsayılana döner. */
export const FILTER_RESET_FIELDS = {
    dateRange: ['dateFrom', 'dateTo'],
};

const SECTOR_FILTER_LABEL = {
    match: 'Aynı sektör',
    near_or_match: 'Aynı ya da komşu',
    near: 'Yalnızca komşu',
    outside: 'Sektör dışı',
    unmeasured: 'Ölçülemedi',
};

const VERIFICATION_FILTER_LABEL = {
    contradiction: 'Çelişkili',
    attention: 'Dikkat gerektiren',
    clean: 'Temiz',
    unverified: 'Doğrulanmamış',
};

const LOCATION_FILTER_LABEL = {
    istanbul: 'İstanbul içi',
    outside: 'İstanbul dışı',
    unknown: 'Bilinmiyor',
};

/** Dışa aktarımda okunabilir etiketler. */
const VERIFICATION_EXPORT_LABEL = {
    contradiction: 'Çelişkili',
    attention: 'Dikkat gerektiren',
    clean: 'Temiz',
    unverified: 'Doğrulanmadı',
};

const SECTOR_EXPORT_LABEL = {
    match: 'Aynı sektör',
    near: 'Komşu sektör',
    outside: 'Sektör dışı',
    unmeasured: 'Ölçülemedi',
};

export const VERIFICATION_RANK = {
    contradiction: 3,
    attention: 2,
    clean: 1,
    unverified: 0,
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

/**
 * Ön skoru hangi cetvelin ürettiği.
 *
 * Eski kayıtlarda alan yok — boş kalır ve "bilmiyoruz" demek olur; bir
 * varsayım yazmak, ölçülmemiş bir şeyi ölçülmüş göstermek olurdu.
 */
const PRESCORE_METHOD_LABEL = {
    ai: 'AI',
    keyword: 'Anahtar kelime',
    none: 'Üretilemedi',
};

/**
 * Adayın STAR boyutlarını "3/3/2/3" biçiminde tek hücreye sığdırır.
 *
 * Yüzde tek başına doygunluğu gizler: dört boyutun hepsi 3/3 ise ölçek
 * ayrıştırmıyor demektir ve bu ancak ham değerlere bakınca görülür.
 */
function starBreakdown(starAnalysis) {
    const dims = normalizeStarAnalysis(starAnalysis);
    if (!dims) return '';
    return dims.map((d) => `${d.score}/${d.max}`).join(' · ');
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
        // Tabloda bir "Doğrulama" kolonu var; dışa aktarımda olmaması
        // kullanıcının hemen çarpacağı bir tutarsızlık olurdu.
        // "Temiz" YALNIZCA taraması yapılmış adaylar için; taranmamışı
        // temiz saymak bakmadığımız şeyi onaylamak olurdu.
        'Doğrulama': VERIFICATION_EXPORT_LABEL[verificationBucket(c)] || '',
        'Sektör Uyumu': SECTOR_EXPORT_LABEL[sectorBucket(c)] || '',
        // ÖN SKOR ile AI SKORU AYNI KOLONDA DEĞİL, çünkü aynı şey değiller.
        // Ön skor aday havuza girerken verildi (tek hafif çağrı); AI skoru
        // derin taramanın sonucu. İkisi tek kolonda toplanınca "tarama skorları
        // yükseltti mi?" sorusu cevapsız kalıyordu — taranmışta ön skor
        // görünmüyordu bile.
        'Ön Skor (İlk)': Number.isFinite(Number(c.initialAiScore)) ? Number(c.initialAiScore) : '',
        // Ön skoru HANGİ CETVEL üretti. İki cetvel (Gemini / anahtar-kelime)
        // aynı kolonda toplandığında sıralama sessizce anlamsızlaşıyor;
        // hangisinin ölçtüğünü görmeden dağılıma bakmak yanıltıcı.
        'Ön Skor Yöntemi': PRESCORE_METHOD_LABEL[c.prescoreMethod] || '',
        'AI Skoru': c.bestScore ?? '',
        ...(c.positionScore !== undefined ? { 'Seçili Pozisyon Uyumu': c.positionScore } : {}),
        // STAR: yüzde ÖLÇEĞİ, kırılım DOYGUNLUĞU gösterir. Yüzde 100 ile
        // "dört boyutun dördü de 3/3" aynı satırda okunabilsin.
        'STAR %': starPercent(c.aiAnalysis?.starAnalysis) ?? '',
        'STAR Kırılım': starBreakdown(c.aiAnalysis?.starAnalysis),
        'Mülakat Skoru': c.interviewScore ?? '',
        'Genel Skor': c.combinedScore ?? '',
        'Deneyim (Yıl)': c.experience ?? '',
        'Lokasyon': c.location || '',
        'Eğitim': c.education || '',
        'Yetenekler': Array.isArray(c.skills) ? c.skills.join(', ') : '',
        'Başvuru Tarihi': getAppliedDate(c),
    }));
}
