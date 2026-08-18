// ADAY ROZETLERİ — listede tek bakışta görünmesi gereken uyarılar.
//
// Doğrulama sekmesi tek tek açılmadan görülmesi gereken şeyler var: bu aday
// bizim sektörümüzde hiç çalışmamış mı, CV'sinde ölçülmüş bir çelişki var mı,
// meslek alanı ilanla uyuşuyor mu.
//
// ── İKİ AYRI KAYNAK, İKİ AYRI MALİYET ───────────────────────────────────────
// KATMAN 1 CANLI HESAPLANIR. Tutarlılık denetimi ağ çağrısı yapmıyor, saf
// aritmetik; listede her satır için yeniden hesaplamak bedava ve her zaman
// güncel. Adayın CV'si değişirse rozet kendiliğinden düzelir.
//
// SEKTÖR VE ŞİRKET SONUCU KAYITTAN OKUNUR. Bunlar grounded arama gerektiriyor
// ve senkron bir listede yapılamaz; doğrulama çalıştırıldığında aday belgesine
// yazılan özetten geliyor. Doğrulama hiç çalıştırılmamışsa o rozetler ÇIKMAZ
// — yokluk, olumsuzluk değildir.
//
// ── "ALAN" İLE "SEKTÖR" AYRI ROZETLER ───────────────────────────────────────
// Uygulamada iki farklı kavram var ve karıştırılırsa yanlış aday elenir:
//   alan   — meslek alanı (yazılım / satış / İK / finans), matchService
//   sektör — kurumun dikeyi (CX / fintech / inşaat), sectorTaxonomy
// İnşaat sektöründen gelen bir Growth Manager ALAN olarak uyumludur ama
// SEKTÖR olarak değil. Tek rozete indirmek hangisinin uymadığını gizlerdi.

import { buildConsistencyReport, requiredYearsOf } from './cvConsistency.js';
import { currentYearMonth } from './cvDates.js';
import { VERDICT } from './sectorFit.js';
import { areDomainsCompatible, detectCandidateDomain, detectPositionDomain } from '../services/matchService.js';

/** Ton adları — arayüz bunları kendi sınıflarına çevirir. */
export const TONE = {
    RED: 'red',
    AMBER: 'amber',
    SKY: 'sky',
    VIOLET: 'violet',
    SLATE: 'slate',
};

/**
 * "Şirket teyitsiz" rozetinin eşiği.
 *
 * Skor cezasıyla AYNI mantık ama rozet daha erken çıkar: rozet bir bilgidir,
 * ceza değil. Yine de tek doğrulanamayan şirket için rozet basmıyoruz —
 * küçük şirket geçmişi olan her adayı işaretlemek gürültüden başka bir şey
 * üretmez.
 */
const UNVERIFIED_MIN = 2;
const UNVERIFIED_RATIO = 0.5;

const badge = (id, label, tone, title) => ({ id, label, tone, title });

/**
 * Adayın doğrulama sayaçları — ROZET VE FİLTRE AYNI YERDEN OKUR.
 *
 * Ayrı ayrı hesaplansalardı zamanla ayrışırlardı: "çelişkili adaylar"
 * filtresi bir kümeyi getirirken listede o adayların bir kısmında çelişki
 * rozeti olmazdı. Bu projede tekrar tekrar düzeltilen sapmanın aynısı.
 *
 * Sayılar İKİ KAYNAĞIN BÜYÜĞÜ:
 *   canlı   — Katman 1, CV'den anında hesaplanır (tarama gerektirmez)
 *   kayıtlı — şirket katmanı dahil tarama anındaki toplam
 * Toplamıyoruz: kayıtlı sayaç tarama anındaki Katman 1'i zaten içeriyor.
 *
 * @returns {{contradictions: number, attention: number, flagIds: Set<string>, verified: boolean}}
 */
export function verificationCounts(candidate, { position = null, today = currentYearMonth(), requiredYears = null } = {}) {
    if (!candidate) return { contradictions: 0, attention: 0, flagIds: new Set(), verified: false };

    const v = candidate.verification;
    const years = requiredYears ?? requiredYearsOf(position);
    const consistency = buildConsistencyReport(candidate, { today, requiredYears: years });

    return {
        contradictions: Math.max(consistency.counts.celiski, Number(v?.counts?.celiski) || 0),
        attention: Math.max(consistency.counts.dikkat, Number(v?.counts?.dikkat) || 0),
        flagIds: new Set([
            ...consistency.flags.map((f) => f.id),
            ...(Array.isArray(v?.flagIds) ? v.flagIds : []),
        ]),
        verified: Boolean(v?.at),
        // Canlı sayı ayrıca taşınıyor: rozet ipucu çelişkinin şirket
        // katmanından gelip gelmediğini söyleyebilsin.
        liveContradictions: consistency.counts.celiski,
    };
}

/**
 * Sektör uyumu kovası — filtrenin sınıflandırması.
 *
 * ÖLÇÜLEMEYEN AYRI BİR KOVA. "Sektör dışı" ile "ölçemedik" aynı kefeye
 * konsaydı, taranmamış 600 aday "sektör dışı" filtresine düşerdi ve filtre
 * hiçbir işe yaramazdı.
 *
 * @returns {'match'|'near'|'outside'|'unmeasured'}
 */
export function sectorBucket(candidate) {
    const verdict = candidate?.verification?.sector?.verdict;
    if (verdict === VERDICT.STRONG || verdict === VERDICT.PARTIAL) return 'match';
    if (verdict === VERDICT.NEAR) return 'near';
    if (verdict === VERDICT.NONE) return 'outside';
    return 'unmeasured';
}

/**
 * Doğrulama durumu kovası — filtrenin sınıflandırması.
 *
 * @returns {'contradiction'|'attention'|'clean'|'unverified'}
 *   'clean' YALNIZCA taraması yapılmış ve bulgusu çıkmamış adaylar için.
 *   Taranmamış adayı "temiz" saymak, bakmadığımız şeyi onaylamak olurdu.
 */
export function verificationBucket(candidate, options = {}) {
    const counts = verificationCounts(candidate, options);
    if (counts.contradictions > 0) return 'contradiction';
    if (counts.attention > 0) return 'attention';
    return counts.verified ? 'clean' : 'unverified';
}

/**
 * Adayın rozetleri.
 *
 * @param {object} candidate
 * @param {object} options
 *   position   — seçili ilan; alan uyumu ve yıl eşiği bundan çıkar
 *   today      — testler zamanı sabitlesin diye
 *   max        — en fazla kaç rozet döner (öncelik sırasına göre kesilir)
 *   requiredYears — ilan yıl eşiği; verilmezse hesaplanmaz
 * @returns {Array<{id, label, tone, title}>} önem sırasına göre
 */
export function buildCandidateBadges(candidate, {
    position = null,
    today = currentYearMonth(),
    max = 0,
    requiredYears = null,
} = {}) {
    if (!candidate) return [];
    const out = [];
    const v = candidate.verification;

    // Sayaçlar filtrelerle ORTAK kaynaktan; ayrışamazlar.
    const counts = verificationCounts(candidate, { position, today, requiredYears });

    // ── ÇELİŞKİ ────────────────────────────────────────────────────────────
    //
    // Canlı hesap yalnızca KATMAN 1'i görüyor: CV'nin kendi içindeki
    // tutarsızlıklar. Şirket katmanının bulduğu çelişkiler (ör. şirket
    // kuruluşundan önceki bir başlangıç tarihi) ağ çağrısı gerektirdiği için
    // burada yeniden hesaplanamaz; yalnızca kayıtlı özette duruyorlar.
    //
    // Bu ayrımı gözden kaçırmak CANLIDA GÖRÜLDÜ: skor şirket çelişkisi
    // yüzünden düşüyordu ama listede hiçbir rozet çıkmıyordu — yani sistem
    // adayı bir sebeple aşağı çekiyor ve o sebebi göstermiyordu.
    const contradictions = counts.contradictions;

    if (contradictions > 0) {
        out.push(badge(
            'celiski',
            contradictions === 1 ? 'Çelişki' : `${contradictions} çelişki`,
            TONE.RED,
            contradictions > counts.liveContradictions
                ? 'Ölçülmüş tutarsızlık var — en az biri şirket doğrulamasından geliyor. Doğrulama sekmesine bakın'
                : 'CV içinde ölçülmüş tutarsızlık var — Doğrulama sekmesine bakın'
        ));
    }

    // Bayrak kimlikleri de iki kaynaktan birleşiyor: listede ilan seçili
    // değilse yıl eşiği hesaplanmaz ve canlı taraf 'ilan-yil-esigi'
    // üretemez, ama tarama sırasında ilan bağlamı vardıysa kayıtta durur.
    const flagIds = counts.flagIds;

    if (flagIds.has('beyan-fazla') || flagIds.has('ilan-yil-esigi')) {
        out.push(badge(
            'tecrube-eksik',
            'Tecrübe eksik',
            TONE.AMBER,
            flagIds.has('beyan-fazla')
                ? 'Beyan edilen deneyim, listelenen görevlerden fazla'
                : 'İlanın istediği asgari deneyim yılının altında'
        ));
    }

    // ── ADAYIN KENDİ ŞİRKETİ ────────────────────────────────────────────────
    // Kendi şirketinde çalışmak meşru ve yaygın; bu bir kusur rozeti değil.
    // Ama "Growth Manager" unvanının ne anlama geldiği kendi şirketinde ile
    // 200 kişilik bir şirkette aynı şey değil, ve bunu listede görmek
    // işe alımcının sıralamayı doğru okuması için gerekli.
    if (flagIds.has('aday-kurucu')) {
        out.push(badge(
            'kendi-sirketi',
            'Kendi şirketi',
            TONE.AMBER,
            'Aday, çalıştığı şirketlerden birinin kurucuları arasında görünüyor — kusur değil, bağlam'
        ));
    }

    // ── DİKKAT SAYACI ───────────────────────────────────────────────────────
    //
    // CANLIDA GÖRÜLEN EKSİK: Hasan Asgar'ın raporunda 4 dikkat maddesi vardı
    // (çakışan dönem, hızlı unvan yükselişi, iki kez unvan/ölçek uyumsuzluğu)
    // ama listede tek bir rozet bile çıkmıyordu. Yalnızca çelişki rozetleniyor,
    // dikkat seviyesindeki hiçbir bulgu görünmüyordu.
    //
    // Bu, aracın en çok iş yaptığı seviyeyi görünmez kılıyordu: gerçek
    // hayatta çelişki nadir, dikkat maddesi sık. Ve bunların tamamı mülakatta
    // sorulacak soru üretiyor.
    //
    // Genel bir sayaç, çünkü dört ayrı rozet basmak satırı doldurur ve
    // hiçbiri tek başına eleme sebebi değil. Sayı, panelde gösterilenle aynı
    // kaynaktan geliyor — ekranlar ayrışamaz.
    const attention = counts.attention;
    if (attention > 0) {
        out.push(badge(
            'dikkat',
            `${attention} dikkat`,
            TONE.AMBER,
            `Doğrulama sekmesinde ${attention} dikkat maddesi var — çakışan dönem, unvan/ölçek uyumsuzluğu gibi. Eleme sebebi değil, sorulacak soru.`
        ));
    }

    // ── Meslek alanı: mevcut kavram, ilan seçiliyse ─────────────────────────
    if (position) {
        const candidateDomain = detectCandidateDomain(candidate);
        const positionDomain = detectPositionDomain(position);
        if (!areDomainsCompatible(candidateDomain, positionDomain)) {
            out.push(badge(
                'alan-disi',
                'Alan dışı',
                TONE.VIOLET,
                'Adayın meslek alanı ilanın alanıyla uyuşmuyor'
            ));
        }
    }

    // ── Kayıtlı doğrulama özeti: sektör ve şirket teyidi ────────────────────
    if (v) {
        const sector = v.sector;
        if (sector?.verdict === VERDICT.NONE) {
            out.push(badge(
                'sektor-disi',
                'Sektör dışı',
                TONE.AMBER,
                'Hedef sektörde ve komşu sektörlerde deneyim bulunamadı'
            ));
        } else if (sector?.verdict === VERDICT.NEAR) {
            out.push(badge(
                'sektor-komsu',
                'Komşu sektör',
                TONE.SKY,
                'Hedef sektörde doğrudan deneyim yok, komşu sektörlerde var'
            ));
        } else if (sector?.stale === true) {
            out.push(badge(
                'sektor-bayat',
                'Sektör deneyimi eski',
                TONE.SKY,
                'Sektör deneyiminin tamamı son 5 yıldan eski'
            ));
        }

        // TARAMASI EKSİK KALAN ADAY İŞARETLENMEZ: atlanan şirket bizim
        // kısıtımız, adayın kusuru değil.
        const c = v.companies;
        if (v.lookupComplete === true && c && Number(c.total) >= UNVERIFIED_MIN) {
            const unverified = Number(c.dogrulanamadi) || 0;
            if (unverified / Number(c.total) >= UNVERIFIED_RATIO) {
                out.push(badge(
                    'sirket-teyitsiz',
                    'Şirket teyitsiz',
                    TONE.SLATE,
                    `${c.total} şirketin ${unverified} tanesi bağımsız kaynakla doğrulanamadı — şirketin var olmadığı anlamına gelmez`
                ));
            }
        }
    }

    return max > 0 ? out.slice(0, max) : out;
}

/** Doğrulama hiç çalıştırılmış mı? Arayüz "taranmadı" ipucunu buradan verir. */
export function isVerified(candidate) {
    return Boolean(candidate?.verification?.at);
}
