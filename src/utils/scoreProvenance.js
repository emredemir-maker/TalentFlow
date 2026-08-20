// SKORUN DAYANAĞI — bu puan hangi işten geliyor?
//
// Sistem bir adayı %95 diye gösteriyor ve bu sayı gereksinim maddelerinin
// karşılanmasından doğuyor. Ama HANGİ İŞTEKİ deneyimin o maddeleri
// karşıladığı hiçbir yerde görünmüyordu.
//
// Fark şu: "%95, adayın 200 kişilik bir şirkette doğrulanmış üç yılından
// geliyor" ile "%95'in beşte dördü, adayın kendi kurduğu 1-10 kişilik
// doğrulanamayan bir şirketteki dönemden geliyor" bambaşka iki bilgi. İkisi
// de aynı sayıyı üretiyor ve karar verici arasındaki farkı göremiyordu.
//
// Bu bilgilerin HEPSİ zaten sistemde vardı — üç ayrı sekmede. Bu modül onları
// birleştirip tek soruya cevap veriyor: bu skor neye dayanıyor?
//
// ── ATFEDER, YARGILAMAZ ─────────────────────────────────────────────────────
// Modül hiçbir yorum üretmez. "Bu iş uydurma", "küçük şirket şüpheli" gibi
// bir çıkarım YOK ve olmamalı: kurucu geçmişi meşru bir kariyer yolu ve
// Türkiye'de istihdamın büyük kısmı küçük şirketlerde. "Küçük = şüpheli"
// diye kodlamak, ön yargıyı kaldırdığını sanırken kurumsallaştırmak olurdu.
//
// Üretilen şey yalnızca ATIF: hangi madde hangi işten geldi. Şirket hakkında
// bilinenler zaten doğrulama katmanında ölçülmüş olgular. Yorumu insan yapar.
//
// ── ATFEDİLEMEYEN MADDE GİZLENMEZ ───────────────────────────────────────────
// Dayanak metni hiçbir şirkete bağlanamıyorsa o madde "atfedilemedi" olarak
// SAYILIR ve ekranda yazılır. Yalnızca bağlanabilenleri göstermek, tabloyu
// olduğundan kesin gösterir — dörtte üçü atfedilememiş bir dağılıma bakıp
// "skorun tamamı şu şirketten" sonucu çıkarmak en kötü hata olurdu.

import { foldTr } from './turkishText.js';
import { assessmentsOf } from './coverageDetail.js';
import { normalizeExperiences } from './candidateCv.js';

/** Şirket adının eşleştirmede kullanılacak hâli. */
const NOISE = new Set([
    'as', 'a s', 'ltd', 'sti', 'inc', 'llc', 'gmbh', 'bv', 'co', 'corp',
    'company', 'holding', 'grup', 'group', 've', 'and',
]);

/**
 * Eşleşmede kullanılacak en kısa ad parçası.
 *
 * Kısa parçalar yasak: üç harfli bir şirket adı dayanak metninin içinde
 * tesadüfen geçer ve maddeyi YANLIŞ şirkete atfeder. Yanlış atıf, hiç atıf
 * yapmamaktan kötüdür — karar vericiye var olmayan bir örüntü gösterir.
 */
const MIN_TOKEN = 4;

const norm = (s) => foldTr(String(s || '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Şirket adından ayırt edici parçaları çıkarır.
 *
 * "Vega Interactive Ltd. Şti." → ['vega', 'interactive']
 * Şirket türü ekleri atılır: her şirkette geçtikleri için ayırt etmezler.
 */
export function companyTokens(name) {
    return norm(name)
        .split(' ')
        .filter((t) => t.length >= MIN_TOKEN && !NOISE.has(t));
}

/**
 * Bir dayanak metni hangi görevleri anıyor?
 *
 * ── İLK SÜRÜMDEKİ HATA: TEK ŞİRKET SEÇMEK ──────────────────────────────────
 * Önce "en uzun eşleşme kazanır" kuralı vardı: bir dayanak birden fazla
 * şirket ansa bile yalnızca biri seçiliyordu. Canlıda görüldü ki dayanak
 * metinleri tam da böyle yazılıyor:
 *
 *   "8 yıllık ürün yönetimi deneyimi var (A, B, C, D). C'de platformu
 *    büyütmüş; A'da monetization yönetmiş."
 *
 * Böyle bir maddeyi tek şirkete yazmak o şirketin payını ŞİŞİRİYOR ve
 * diğerlerini tablodan tamamen siliyor — yani "bu skorun ne kadarı şu işe
 * dayanıyor" sorusunu tam da yanlış yönde cevaplıyor.
 *
 * Artık anılan TÜM görevler dönüyor. Bir madde birden fazla işi
 * gösteriyorsa her ikisinde de listeleniyor ve PAYLAŞIMLI işaretleniyor.
 *
 * @returns {number[]} anılan deneyimlerin dizinleri; en spesifik ad önce
 */
export function citedCompanies(evidence, experiences) {
    const text = ` ${norm(evidence)} `;
    if (text.trim().length === 0) return [];

    const hits = [];
    (experiences || []).forEach((e, index) => {
        const tokens = companyTokens(e?.company);
        if (tokens.length === 0) return;
        // TÜM ayırt edici parçalar geçmeli: "Vega" tek başına yeterli değil,
        // "Vega Interactive" aranıyorsa ikisi de bulunmalı.
        const hit = tokens.every((t) => text.includes(` ${t} `) || text.includes(` ${t}`));
        if (hit) hits.push({ index, score: tokens.join('').length });
    });
    return hits.sort((a, b) => b.score - a.score).map((h) => h.index);
}

/** Şirket hakkında doğrulama katmanının bildiği olgular — yorum değil, ölçüm. */
function companyFactsOf(companyName, storedReport) {
    const list = storedReport?.companies || [];
    const key = norm(companyName);
    const found = list.find((c) => norm(c?.company) === key);
    if (!found) return null;
    return {
        verdict: found.verdict || null,
        sizeBand: found.evidence?.sizeBand || null,
        sector: found.evidence?.sectorRaw || '',
        foundedYear: found.evidence?.registry?.foundedYear ?? found.evidence?.foundedYear ?? null,
        isFounder: Boolean(found.evidence?.registry?.founders?.length || found.evidence?.founders?.length),
    };
}

/**
 * Skorun dayanağını çıkarır.
 *
 * @param {object} input
 *   analysis      — pozisyon analizi (requirementCoverage.assessments)
 *   requirements  — ilanın gereksinim listesi (madde metinleri için)
 *   candidate     — deneyimler ve kayıtlı doğrulama raporu için
 * @returns {{
 *   total: number,          karşılanan (met/partial) madde sayısı
 *   attributed: number,     bir işe bağlanabilen madde sayısı
 *   unattributed: number,   bağlanamayan
 *   hasEvidence: boolean,   analiz dayanak alanı taşıyor mu
 *   groups: Array<{company, role, duration, count, items, facts}>,
 * }>}
 *   groups katkı sırasına göre: en çok madde getiren iş başta.
 */
export function buildScoreProvenance({ analysis, requirements = [], candidate } = {}) {
    // ÇÖZÜCÜ PAYLAŞILIYOR. Değerlendirmeler iki yolda durabiliyor
    // (kökte ya da `scoreData` altında) ve burada kendi kopyamı tutmuştum:
    // yalnızca kök yolu okuyordu, dolayısıyla kayıtları `scoreData` altında
    // olan adaylarda blok "hiç karşılanan madde yok" sanıp SESSİZCE
    // görünmez oluyordu — canlıda tam olarak böyle yaşandı.
    const assessments = assessmentsOf(analysis) || [];
    // Geçmiş TEK kaynaktan (bkz. utils/cvConsistency.js — aynı gerekçe).
    const experiences = normalizeExperiences(candidate);

    const empty = { total: 0, attributed: 0, unattributed: 0, hasEvidence: false, groups: [] };
    if (assessments.length === 0 || experiences.length === 0) return empty;

    // YALNIZCA KARŞILANAN MADDELER. Karşılanmayan bir madde skora katkı
    // vermiyor; onu bir işe atfetmek "şu iş bu maddeyi karşılamadı" gibi
    // anlamsız bir satır üretirdi.
    const scoring = assessments.filter((a) => {
        const s = String(a?.status || '').toLowerCase();
        return s === 'met' || s === 'partial';
    });
    if (scoring.length === 0) return empty;

    const textOf = (index) => {
        const r = requirements[Number(index) - 1];
        return typeof r === 'string' ? r : (r?.text || '');
    };

    const byIndex = new Map();
    let unattributed = 0;
    let withEvidence = 0;

    for (const a of scoring) {
        const evidence = String(a?.evidence || '').trim();
        if (evidence) withEvidence += 1;
        const cited = evidence ? citedCompanies(evidence, experiences) : [];
        if (cited.length === 0) { unattributed += 1; continue; }
        // PAYLAŞIMLI MADDE her anılan işte listelenir. Tek işe yazmak o işin
        // payını şişirir ve diğerlerini tablodan siler.
        for (const at of cited) {
            if (!byIndex.has(at)) byIndex.set(at, []);
            byIndex.get(at).push({
                index: Number(a.index),
                text: textOf(a.index),
                status: String(a.status).toLowerCase(),
                evidence,
                shared: cited.length > 1,
            });
        }
    }

    const groups = [...byIndex.entries()]
        .map(([index, items]) => {
            const e = experiences[index] || {};
            return {
                company: e.company || '',
                role: e.role || '',
                duration: e.duration || '',
                count: items.length,
                // Kaç madde başka bir işi de gösteriyor — arayüz bunu söylemek
                // zorunda, yoksa grupların toplamı atfedilenden fazla çıkıyor ve
                // okuyan haksız olarak "sayılar tutmuyor" diye düşünüyor.
                sharedCount: items.filter((i) => i.shared).length,
                items,
                facts: companyFactsOf(e.company, candidate?.verificationReport),
            };
        })
        .sort((a, b) => b.count - a.count);

    return {
        total: scoring.length,
        attributed: scoring.length - unattributed,
        unattributed,
        // Analiz dayanak alanı taşımıyorsa atıf hiç denenemez; arayüz
        // "atfedilemedi" ile "bu analiz eski, dayanak alanı yok" arasındaki
        // farkı söylemek zorunda (bkz. coverageDetail.js — aynı ayrım).
        hasEvidence: withEvidence > 0,
        groups,
    };
}

/**
 * En baskın işin payı — arayüzün tek cümlelik özeti için.
 *
 * @returns {{company: string, count: number, share: number}|null}
 *   share, ATFEDİLEBİLEN maddelere oranlanır; atfedilemeyenleri paydaya
 *   koymak payı olduğundan küçük gösterir ve baskınlığı gizlerdi.
 */
export function dominantSource(provenance) {
    const top = provenance?.groups?.[0];
    if (!top || !provenance.attributed) return null;
    return { company: top.company, count: top.count, share: top.count / provenance.attributed };
}
