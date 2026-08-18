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

    // ── Katman 1: canlı, bedava ─────────────────────────────────────────────
    // Yıl eşiği verilmediyse ilandan türetilir; çağıranın her satırda aynı
    // hesabı tekrarlaması gerekmesin.
    const years = requiredYears ?? requiredYearsOf(position);
    const consistency = buildConsistencyReport(candidate, { today, requiredYears: years });

    // ── ÇELİŞKİ SAYISI İKİ KAYNAĞIN BÜYÜĞÜ ──────────────────────────────────
    //
    // Canlı hesap yalnızca KATMAN 1'i görüyor: CV'nin kendi içindeki
    // tutarsızlıklar. Şirket katmanının bulduğu çelişkiler (ör. şirket
    // kuruluşundan önceki bir başlangıç tarihi) ağ çağrısı gerektirdiği için
    // burada yeniden hesaplanamaz; yalnızca kayıtlı özette duruyorlar.
    //
    // Bu ayrımı gözden kaçırmak CANLIDA GÖRÜLDÜ: skor şirket çelişkisi
    // yüzünden düşüyordu ama listede hiçbir rozet çıkmıyordu — yani sistem
    // adayı bir sebeple aşağı çekiyor ve o sebebi göstermiyordu. Bir skoru
    // sessizce düşüren kural, açıklanamayan bir skordur.
    //
    // TOPLAMA DEĞİL, BÜYÜĞÜNÜ AL: kayıtlı sayaç tarama anındaki Katman 1
    // çelişkilerini ZATEN içeriyor; toplasaydık aynı çelişki iki kez sayılırdı.
    // Büyüğünü almak ayrıca CV taramadan sonra değiştiyse yeni Katman 1
    // çelişkilerinin de görünmesini sağlıyor.
    //
    // Sayı, skoru düşüren sayıyla AYNI kaynaktan geliyor (verification.counts)
    // — rozetin gösterdiği ile skorun cezalandırdığı ayrışamaz.
    const storedContradictions = Number(v?.counts?.celiski) || 0;
    const liveContradictions = consistency.counts.celiski;
    const contradictions = Math.max(liveContradictions, storedContradictions);

    if (contradictions > 0) {
        out.push(badge(
            'celiski',
            contradictions === 1 ? 'Çelişki' : `${contradictions} çelişki`,
            TONE.RED,
            storedContradictions > liveContradictions
                ? 'Ölçülmüş tutarsızlık var — en az biri şirket doğrulamasından geliyor. Doğrulama sekmesine bakın'
                : 'CV içinde ölçülmüş tutarsızlık var — Doğrulama sekmesine bakın'
        ));
    }

    // Bayrak kimlikleri de iki kaynaktan birleşiyor: listede ilan seçili
    // değilse yıl eşiği hesaplanmaz ve canlı taraf 'ilan-yil-esigi'
    // üretemez, ama tarama sırasında ilan bağlamı vardıysa kayıtta durur.
    const flagIds = new Set([
        ...consistency.flags.map((f) => f.id),
        ...(Array.isArray(v?.flagIds) ? v.flagIds : []),
    ]);

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
