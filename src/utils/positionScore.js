// Adayın bir pozisyondaki skoru — TEK KAYNAK.
//
// Skor derin tarama sırasında hesaplanıp aday belgesine yazılıyor. Sorun:
// formül değişince saklanan sayı eskiyor ama listeler onu okumaya devam
// ediyor. Skor kırılımı paneli ise anlık hesaplıyor. Sonuç, aynı aday için
// iki ekranda iki farklı sayı — bütün gün kaçındığımız sapmanın tam kendisi.
//
// Oysa skor saklanan veriden TÜRETİLEBİLİR: requirementCoverage ve
// starAnalysis zaten kayıtlı, hesap saf aritmetik. Okuma anında hesaplarsak:
//   - ağırlık değişiklikleri yeniden tarama gerektirmez
//   - liste ile kırılım ayrışamaz
//   - eski kayıtlar da bugünkü kurala göre değerlendirilir
//
// Yeniden tarama yalnızca AI'ın ÜRETMESİ gereken bir şey değişince gerekir:
// gereksinim metni değişti, yeni alan eklendi, CV güncellendi.

import { calculateHybridScore } from '../services/geminiService';
import { isStaleFor } from './positionRequirements';
import { interviewAdjustedScore } from './interviewCoverage';

// isStaleFor artık positionRequirements.js'te yaşıyor: sorduğu soru bir SÜRÜM
// sorusu ve mülakat birleşiminin de ona ihtiyacı var. Burada kalsaydı
// interviewCoverage → positionScore → interviewCoverage döngüsü çıkardı.
// Mevcut çağıranlar için buradan yeniden dışa aktarılıyor.
export { isStaleFor };

/** Adayın bu pozisyon için kayıtlı analizi. */
export function analysisFor(candidate, positionTitle) {
    if (!positionTitle) return null;
    return candidate?.positionAnalyses?.[positionTitle] || null;
}

/**
 * Skoru yeniden hesaplayacak ham veri var mı?
 *
 * Yoksa hesaplamaya kalkışmak yanlış olur: calculateHybridScore son çare
 * olarak deneyim yılı + anahtar kelimeye düşüyor ve o alanlar analizin
 * kökünde değil `scoreData` içinde duruyor. Böyle bir kayıtta saklanan sayı
 * en doğru bilgidir.
 */
function canRecompute(analysis) {
    return Boolean(analysis?.requirementCoverage || analysis?.starAnalysis);
}

/**
 * Adayın bu pozisyondaki skoru — bayatlık ve mülakat bilgisiyle.
 *
 * Bayat bir analizde madde bazlı ağırlıklandırma UYGULANMAZ. Eski yargıları
 * yeni listenin numaralarına dizmek, olmayan bir bilgiyi varmış gibi
 * göstermek olur.
 *
 * Bayat kayıtta SAKLANAN skor gösterilir: o sayı, üretildiği gün geçerli olan
 * gereksinimlere göre tutarlıydı. Alternatifi STAR'a düşmekti — yani yeni
 * kaldırdığımız alana kör sayıya geri dönmek. "Eski ilana göre ölçülmüş bir
 * sayı" en azından bir şeyin ölçümü; arayüz bunu bayat olarak işaretler.
 *
 * MÜLAKAT VARSA SKORA GİRER. Buraya konmasının sebebi, listelerin zaten bu
 * fonksiyonu okuması: aday odada bir zorunlu maddeyi kapattıysa listede de
 * yukarı çıkmalı. Ayrı bir "mülakat skoru" alanı eklenseydi tablo eski
 * sayıyı göstermeye devam eder ve iki ekran birbirine ters düşerdi — bütün
 * gün kaçındığımız sapmanın aynısı.
 *
 * `cvScore` her zaman dönüyor ki arayüz farkı gösterebilsin; sessizce değişen
 * bir skor, açıklanamayan bir skordur.
 *
 * @returns {{score: number, stale: boolean, scanned: boolean, interviewed: boolean, cvScore: number}}
 */
export function analysisScoreDetail(candidate, position) {
    const analysis = analysisFor(candidate, position?.title);
    if (!analysis) return { score: 0, stale: false, scanned: false, interviewed: false, cvScore: 0 };
    if (!canRecompute(analysis)) {
        const stored = Number(analysis.score) || 0;
        return { score: stored, stale: false, scanned: true, interviewed: false, cvScore: stored };
    }

    if (isStaleFor(analysis, position)) {
        const stored = Number(analysis.score) || 0;
        return { score: stored, stale: true, scanned: true, interviewed: false, cvScore: stored };
    }

    // Hesap TEK yerde: interviewAdjustedScore. Burada bir kopyası olsaydı iki
    // uygulama zamanla ayrışır ve liste ile mülakat paneli farklı sayı
    // gösterirdi — bu modülün en başta çözmek için yazıldığı sorun.
    const { score, cvScore, hasInterview } = interviewAdjustedScore(analysis, candidate, position);
    return { score, stale: false, scanned: true, interviewed: hasInterview, cvScore };
}

/**
 * Adayın bu pozisyondaki skoru.
 *
 * @param {object} candidate
 * @param {object} position
 * @returns {number} 0-100; analiz yoksa 0
 */
export function analysisScoreFor(candidate, position) {
    return analysisScoreDetail(candidate, position).score;
}

/**
 * Pozisyon başlığından skor — elde pozisyon nesnesi yokken.
 *
 * Gereksinim listesi olmadan zorunlu/tercihen ağırlıkları uygulanamaz;
 * model kendi verdiği tek sayıya düşülür. Mümkünse scoreForPosition kullan.
 */
export function analysisScoreForTitle(candidate, positionTitle) {
    const analysis = analysisFor(candidate, positionTitle);
    if (!analysis) return 0;
    if (!canRecompute(analysis)) return Number(analysis.score) || 0;
    return calculateHybridScore(analysis, null);
}
