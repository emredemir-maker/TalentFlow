// SEKTÖR UYUMU — adayın kariyerinin ne kadarı hedef sektörde geçmiş?
//
// İşe alımda yetkinlik tek başına belirleyici değil: B2B SaaS'ta müşteri
// iletişimi ürünü satmış bir aday, aynı yetkinlikle B2C pazaryerinden gelen
// adaydan farklı bir yere oturur. Bu bir tercih faktörü ve BİLİNMESİ gerekir.
//
// ── NEDEN UYDURMA BİR "SEKTÖR PUANI" ÜRETMİYORUZ ────────────────────────────
// Arayüzde zaten `scoreBreakdown.industryFit` diye bir halka vardı ve o alanı
// kodda üreten hiçbir yer yoktu — boş veri gösteriyordu. Yerine 0-100 arası
// yeni bir sayı uydurmak aynı hatanın süslüsü olurdu.
//
// Bunun yerine ÖLÇÜM veriyoruz: kaç ay, kariyerin yüzde kaçı, ne kadarı son
// beş yılda. Bunlar sayılabilir olgular; "sektör uyumu 72" bir görüş.
//
// ── AY AY DAĞITIM, ÇÜNKÜ GÖREVLER ÇAKIŞIYOR ─────────────────────────────────
// Görev sürelerini toplamak paralel işlerde kariyeri iki katına çıkarır
// (bkz. cvDates.unionMonths). Sektör dağılımında sorun daha ince: aynı ay
// hem hedef sektörde hem alakasız bir sektörde çalışılmış olabilir. Her ay
// TEK KEZ sayılır ve o aya düşen EN YÜKSEK yakınlık geçerli olur — aday o ay
// hedef sektöre dokunmuştur.

import { sectorAffinity, sectorLabel, NEAR_WEIGHT } from './sectorTaxonomy.js';
import { formatMonths, currentYearMonth } from './cvDates.js';

/** "Güncel deneyim" penceresi. Beş yıl önceki sektör bilgisi hâlâ değerli
 *  ama aynı şey değil: araçlar, regülasyon ve rakipler değişiyor. */
export const RECENT_MONTHS = 60;

/** Anlamlı sayılacak en kısa süre. Üç aylık bir dokunuş "sektör deneyimi"
 *  değildir; bu eşik olmadan tek bir kısa proje "kısmi uyum" ürettiriyor. */
const MEANINGFUL_MONTHS = 12;

/** Güçlü uyum için gereken toplam süre. */
const STRONG_MONTHS = 24;

export const VERDICT = {
    STRONG: 'guclu',
    PARTIAL: 'kismi',
    NEAR: 'yakin',
    NONE: 'yok',
    UNMEASURED: 'olculemedi',
    NO_TARGET: 'hedef-yok',
};

/**
 * Hedef profili normalize eder — eksik eksenler null kalır, UYDURULMAZ.
 *
 * Kurum hedefi kısmen tanımlı olabilir: sektörü belli ama iş modeli
 * girilmemiş. Eksik ekseni varsayılanla doldurmak (ör. "herkes B2B'dir")
 * ölçülmemiş bir eşleşmeyi ölçülmüş gibi gösterirdi.
 */
export function normalizeTarget(raw) {
    const sector = raw?.sector || null;
    const model = raw?.model || null;
    const type = raw?.type || null;
    if (!sector && !model && !type) return null;
    return { sector, model, type };
}

/**
 * CV deneyimlerini, çözümlenmiş şirket bilgisiyle birleştirir.
 *
 * @param {Array} rows measureExperiences() çıktısındaki satırlar
 *   ({company, role, window, ...})
 * @param {Map<string, object>|object} intel şirket adı → {sector, model, type}
 * @returns {Array} sektör ölçümüne hazır girdiler
 */
export function buildSectorEntries(rows, intel) {
    const lookup = intel instanceof Map ? intel : new Map(Object.entries(intel || {}));
    // Şirket adı anahtarı: boşluk ve büyük/küçük harf farkı cache'i ıskalatır.
    const get = (company) => lookup.get(company) || lookup.get(String(company || '').trim().toLowerCase()) || null;

    return (rows || []).map((r) => {
        const info = get(r.company);
        return {
            company: r.company,
            role: r.role,
            duration: r.duration,
            window: r.window,
            sector: info?.sector || null,
            model: info?.model || null,
            type: info?.type || null,
        };
    });
}

/**
 * Sektör uyumunu ölçer.
 *
 * @param {Array} entries buildSectorEntries() çıktısı
 * @param {object} target {sector, model, type}
 * @param {{today?: object, recentMonths?: number}} options
 * @returns {object} ölçüm sonucu — ayrıntı için VERDICT ve alan adlarına bakın
 */
export function measureSectorFit(entries, target, { today = currentYearMonth(), recentMonths = RECENT_MONTHS } = {}) {
    const goal = normalizeTarget(target);
    const list = (entries || []).filter((e) => e?.window);

    const empty = {
        verdict: goal ? VERDICT.UNMEASURED : VERDICT.NO_TARGET,
        target: goal,
        coverage: 'none',
        careerMonths: 0, knownMonths: 0, unknownMonths: 0,
        exactMonths: 0, nearMonths: 0, unrelatedMonths: 0,
        recentExactMonths: 0, recentNearMonths: 0,
        modelMonths: 0, typeMonths: 0,
        share: null, weightedShare: null,
        stale: false,
        breakdown: [],
    };
    if (!goal || list.length === 0) return empty;

    const nowAbs = today.year * 12 + (today.month - 1);
    const recentFrom = nowAbs - recentMonths + 1;

    // Ay → o ayın en iyi durumu. Aynı ayda iki görev varsa aday o ay hedef
    // sektöre DOKUNMUŞTUR; en yüksek yakınlık geçerli olur.
    const months = new Map();
    for (const e of list) {
        const affinity = e.sector ? sectorAffinity(e.sector, goal.sector) : 0;
        const known = Boolean(e.sector);
        const modelHit = Boolean(goal.model && e.model && e.model === goal.model);
        const typeHit = Boolean(goal.type && e.type && e.type === goal.type);
        for (let m = e.window.from; m < e.window.to; m += 1) {
            const prev = months.get(m);
            if (!prev) {
                months.set(m, { affinity, known, modelHit, typeHit });
                continue;
            }
            prev.affinity = Math.max(prev.affinity, affinity);
            prev.known = prev.known || known;
            prev.modelHit = prev.modelHit || modelHit;
            prev.typeHit = prev.typeHit || typeHit;
        }
    }

    let knownMonths = 0, unknownMonths = 0;
    let exactMonths = 0, nearMonths = 0, unrelatedMonths = 0;
    let recentExactMonths = 0, recentNearMonths = 0;
    let modelMonths = 0, typeMonths = 0;

    for (const [abs, s] of months) {
        const recent = abs >= recentFrom;
        if (!s.known) { unknownMonths += 1; continue; }
        knownMonths += 1;
        if (s.modelHit) modelMonths += 1;
        if (s.typeHit) typeMonths += 1;
        if (s.affinity === 1) {
            exactMonths += 1;
            if (recent) recentExactMonths += 1;
        } else if (s.affinity > 0) {
            nearMonths += 1;
            if (recent) recentNearMonths += 1;
        } else {
            unrelatedMonths += 1;
        }
    }

    const careerMonths = months.size;
    // BİLİNMEYEN AYLAR PAYDAYA GİRMEZ. Sektörü çözülemeyen bir şirketi
    // "ilgisiz" saymak, ölçemediğimiz şeyi olumsuz sonuç gibi gösterirdi.
    const share = knownMonths > 0 ? exactMonths / knownMonths : null;
    const weightedShare = knownMonths > 0 ? (exactMonths + nearMonths * NEAR_WEIGHT) / knownMonths : null;

    let coverage = 'full';
    if (knownMonths === 0) coverage = 'none';
    else if (unknownMonths > 0) coverage = 'partial';

    const breakdown = list.map((e) => {
        const monthsOfEntry = e.window.to - e.window.from;
        const affinity = e.sector ? sectorAffinity(e.sector, goal.sector) : null;
        return {
            company: e.company,
            role: e.role,
            duration: e.duration,
            months: monthsOfEntry,
            sector: e.sector,
            sectorLabel: e.sector ? sectorLabel(e.sector) : '',
            affinity,
            modelMatch: Boolean(goal.model && e.model && e.model === goal.model),
            typeMatch: Boolean(goal.type && e.type && e.type === goal.type),
            recent: e.window.to - 1 >= recentFrom,
        };
    }).sort((a, b) => (b.affinity ?? -1) - (a.affinity ?? -1) || b.months - a.months);

    return {
        verdict: decideVerdict({ knownMonths, exactMonths, nearMonths, recentExactMonths }),
        target: goal,
        coverage,
        careerMonths, knownMonths, unknownMonths,
        exactMonths, nearMonths, unrelatedMonths,
        recentExactMonths, recentNearMonths,
        modelMonths, typeMonths,
        share, weightedShare,
        // Sektör deneyimi VAR ama tamamı eski. "Hiç yok" ile aynı şey değil
        // ve işe alımcının bilmesi gereken tam da bu fark.
        stale: exactMonths >= MEANINGFUL_MONTHS && recentExactMonths === 0,
        breakdown,
    };
}

function decideVerdict({ knownMonths, exactMonths, nearMonths, recentExactMonths }) {
    if (knownMonths === 0) return VERDICT.UNMEASURED;
    if (exactMonths >= STRONG_MONTHS && recentExactMonths >= MEANINGFUL_MONTHS) return VERDICT.STRONG;
    if (exactMonths >= MEANINGFUL_MONTHS) return VERDICT.PARTIAL;
    if (nearMonths >= MEANINGFUL_MONTHS) return VERDICT.NEAR;
    return VERDICT.NONE;
}

/**
 * Ölçümü tek cümleye indirir — arayüzün her yerinde aynı dili konuşmak için.
 *
 * Cümle SAYIYA dayanır. "Sektör uyumu yüksek" demiyoruz; "3 yıl 2 ay, son beş
 * yılın 1 yıl 6 ayı" diyoruz. Okuyan kendi kararını verir.
 */
export function describeSectorFit(fit) {
    // ÖLÇÜM YOK ile HEDEF YOK farklı şeyler. Kayıtlı eski raporlarda
    // `sectorFit` hiç bulunmuyor (alan sonradan eklendi) ve o raporlara
    // "hedef sektör tanımlı değil" demek yanlış: hedef tanımlı olabilir,
    // ölçüm o gün yapılmamıştı. Kullanıcıyı ayarlara göndermek yerine
    // yapması gerekeni söylüyoruz.
    if (!fit) {
        return 'Bu rapor sektör ölçümü içermiyor — yeniden tarayın.';
    }
    if (fit.verdict === VERDICT.NO_TARGET) {
        return 'Hedef sektör tanımlı değil — ayarlardan kurum sektörünü girin.';
    }
    if (fit.verdict === VERDICT.UNMEASURED) {
        return 'Şirketlerin sektörü çözümlenemedi — sektör uyumu ölçülemiyor.';
    }

    const targetName = sectorLabel(fit.target.sector) || 'hedef sektör';
    const pct = fit.share === null ? null : Math.round(fit.share * 100);
    const parts = [];

    if (fit.exactMonths > 0) {
        parts.push(`${targetName} alanında ${formatMonths(fit.exactMonths)}`
            + (pct === null ? '' : ` (ölçülebilen kariyerin %${pct}'i)`));
        parts.push(fit.recentExactMonths > 0
            ? `son ${RECENT_MONTHS / 12} yılda ${formatMonths(fit.recentExactMonths)}`
            : `ancak tamamı son ${RECENT_MONTHS / 12} yıldan eski`);
    } else if (fit.nearMonths > 0) {
        parts.push(`${targetName} alanında doğrudan deneyim yok`);
        parts.push(`komşu sektörlerde ${formatMonths(fit.nearMonths)}`);
    } else {
        parts.push(`${targetName} alanında ve komşu sektörlerde deneyim bulunamadı`);
    }

    if (fit.coverage === 'partial') {
        parts.push(`${formatMonths(fit.unknownMonths)} sektörü çözümlenemedi`);
    }
    return `${parts.join('; ')}.`;
}
