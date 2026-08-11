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
import { requirementsOf, requirementsFingerprint } from './positionRequirements';

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
 * Değerlendirmeler GÜNCEL gereksinim listesine mi ait?
 *
 * Kayıtlı değerlendirmeler madde NUMARASINA bağlı: {index: 6, status:
 * 'partial'}. Gereksinim listesi değişince o numara başka bir maddeye denk
 * gelir ve eski yargı yanlış maddeye yapışır.
 *
 * Canlıda ölçüldü: aynı aday, aynı formül — bayat değerlendirmeyle 77, taze
 * taramayla 65. On iki puanlık hata, hem de sessiz.
 *
 * Damgası olmayan eski kayıtlar da bayat sayılır: hangi listeye ait
 * olduklarını bilmiyoruz, varsaymak da aynı hatayı üretir.
 */
export function isStaleFor(analysis, position) {
    const assessments = analysis?.requirementCoverage?.assessments
        || analysis?.scoreData?.requirementCoverage?.assessments;
    // Madde bazlı değerlendirme yoksa eşleştirilecek numara da yok — bayatlık
    // kavramı burada anlamsız.
    if (!Array.isArray(assessments)) return false;
    if (!position?.title) return true;
    return analysis?.requirementsFingerprint !== requirementsFingerprint(position);
}

/**
 * Adayın bu pozisyondaki skoru — bayatlık bilgisiyle.
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
 * @returns {{score: number, stale: boolean, scanned: boolean}}
 */
export function analysisScoreDetail(candidate, position) {
    const analysis = analysisFor(candidate, position?.title);
    if (!analysis) return { score: 0, stale: false, scanned: false };
    if (!canRecompute(analysis)) {
        return { score: Number(analysis.score) || 0, stale: false, scanned: true };
    }

    if (isStaleFor(analysis, position)) {
        return { score: Number(analysis.score) || 0, stale: true, scanned: true };
    }
    return { score: calculateHybridScore(analysis, requirementsOf(position)), stale: false, scanned: true };
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
