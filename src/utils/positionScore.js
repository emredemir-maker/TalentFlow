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
import { requirementsOf } from './positionRequirements';

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
 * Adayın bu pozisyondaki skoru.
 *
 * @param {object} candidate
 * @param {object} position
 * @returns {number} 0-100; analiz yoksa 0
 */
export function analysisScoreFor(candidate, position) {
    const analysis = analysisFor(candidate, position?.title);
    if (!analysis) return 0;
    if (!canRecompute(analysis)) return Number(analysis.score) || 0;
    return calculateHybridScore(analysis, requirementsOf(position));
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
