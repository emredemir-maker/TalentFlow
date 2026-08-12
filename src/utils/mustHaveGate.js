// Zorunlu gereksinim kapısı (knockout).
//
// Yapısal işe alım rubriklerinde üç katman vardır: knockout (ön koşul),
// core (yüksek ağırlık), supporting (düşük ağırlık). Bizde "zorunlu" maddeler
// yalnızca puan düşürüyordu — bir zorunluyu hiç karşılamayan aday, iyi yazılmış
// bir CV ve tercih edilen maddelerle 54 alıp listede ortalarda kalabiliyordu.
//
// Bu modül kararı VERMEZ; yalnızca durumu adlandırır. Eleme kararı insana ait
// (EU AI Act yüksek riskli kategori: sistem öneri sunar, insan karar verir).
// Arayüz bunu rozet olarak gösterir ve varsayılan sıralamada aşağı alır.

import { requirementsOf, requirementsFingerprint } from './positionRequirements';

/** Analiz kaydından madde değerlendirmelerini çıkarır (iki olası yerleşim). */
function assessmentsOf(analysis) {
    const direct = analysis?.requirementCoverage?.assessments;
    if (Array.isArray(direct)) return direct;
    const nested = analysis?.scoreData?.requirementCoverage?.assessments;
    return Array.isArray(nested) ? nested : null;
}

/**
 * Adayın bu pozisyonun ZORUNLU maddelerine karşı durumu.
 *
 * @returns {{
 *   status: 'ok'|'partial'|'missing'|'unknown',
 *   missing: Array<{index: number, text: string, note: string}>,
 *   partial: Array<{index: number, text: string, note: string}>,
 *   totalMust: number
 * }}
 *   - ok:      tüm zorunlular karşılanıyor
 *   - partial: hiçbiri eksik değil ama en az biri kısmen
 *   - missing: en az bir zorunlu karşılanmıyor  ← knockout
 *   - unknown: ilan zorunlu işaretlememiş ya da madde bazlı analiz yok.
 *              Bilgi yokluğunu "eksik" saymak, işaretlenmemiş eski ilanlardaki
 *              herkesi haksızca aşağı iterdi.
 */
export function mustHaveGate(analysis, position) {
    const empty = { status: 'unknown', missing: [], partial: [], totalMust: 0 };

    const requirements = requirementsOf(position);
    if (!Array.isArray(requirements) || requirements.length === 0) return empty;

    const must = requirements
        .map((r, i) => ({ ...r, index: i + 1 }))
        .filter((r) => r.must === true);
    if (must.length === 0) return empty;

    // BAYAT ANALİZDE KAPI HESAPLANMAZ.
    //
    // Değerlendirmeler madde NUMARASINA bağlı. Gereksinim listesi değişince o
    // numara başka bir maddeye denk gelir ve kapı, eski yargıyı yeni maddenin
    // adıyla raporlar. Canlıda tam olarak bu görüldü:
    //   "CX ürünü geliştirmiş olmak — Fiyatlandırma sahipliğine dair kanıt yok"
    // Başlık bir maddeden, gerekçe başka bir maddeden.
    //
    // Skor kırılımını bayatken gizlemiştik ama bu şerit gözden kaçmıştı.
    // Hüküm veremeyeceğimiz yerde "unknown" demek, yanlış hüküm vermekten iyi.
    if (analysis?.requirementsFingerprint !== requirementsFingerprint(position)) {
        return { ...empty, totalMust: must.length };
    }

    const assessments = assessmentsOf(analysis);
    if (!assessments) return { ...empty, totalMust: must.length };

    const byIndex = new Map();
    for (const a of assessments) {
        const idx = Number(a?.index);
        if (!Number.isFinite(idx)) continue;
        byIndex.set(idx, {
            status: String(a?.status || '').toLowerCase(),
            note: typeof a?.note === 'string' ? a.note : '',
        });
    }

    const missing = [];
    const partial = [];
    let assessed = 0;
    for (const r of must) {
        const a = byIndex.get(r.index);
        if (!a) continue;
        assessed += 1;
        if (a.status === 'missing') missing.push({ index: r.index, text: r.text, note: a.note });
        else if (a.status === 'partial') partial.push({ index: r.index, text: r.text, note: a.note });
    }

    // Hiçbir zorunlu madde değerlendirilmemişse hüküm veremeyiz
    if (assessed === 0) return { ...empty, totalMust: must.length };

    const status = missing.length > 0 ? 'missing' : (partial.length > 0 ? 'partial' : 'ok');
    return { status, missing, partial, totalMust: must.length };
}

/**
 * Sıralama önceliği — büyük olan üstte.
 * Zorunlusu eksik adaylar, skoru ne olursa olsun karşılayanların ALTINDA
 * kalır. Skor içinde ceza olarak eritmek yerine ayrı bir kademe kullanmak,
 * "85 puanlık aday neden altta?" sorusunu ortadan kaldırıyor: kademe
 * görünür ve gerekçesi rozette yazıyor.
 */
export function gateRank(status) {
    switch (status) {
        case 'ok': return 3;
        case 'unknown': return 2; // bilgi yok — cezalandırma, ama karşılayanın üstüne de koyma
        case 'partial': return 1;
        case 'missing': return 0;
        default: return 2;
    }
}

/** Rozet metni ve tonu. */
export function gateLabel(gate) {
    switch (gate?.status) {
        case 'missing':
            return {
                text: gate.missing.length === 1
                    ? '1 zorunlu eksik'
                    : `${gate.missing.length} zorunlu eksik`,
                tone: 'red',
            };
        case 'partial':
            return {
                text: gate.partial.length === 1
                    ? '1 zorunlu kısmen'
                    : `${gate.partial.length} zorunlu kısmen`,
                tone: 'amber',
            };
        case 'ok':
            return { text: 'Zorunlular tam', tone: 'emerald' };
        default:
            return null;
    }
}
