// DOĞRULAMANIN SKORA ETKİSİ — iki ayrı çarpan.
//
// Doğrulama raporu başlangıçta hiçbir skoru değiştirmiyordu; yalnızca soru
// üretiyordu. Kullanıcı kararıyla artık skora da yansıyor.
//
// ── NEDEN ÇARPAN, NEDEN ÇIKARMA ─────────────────────────────────────────────
// Projedeki yerleşik desen bu (bkz. "STAR skora eklenmesin, skoru çarpsın"):
// çıkarma, düşük skorlu adayı orantısız cezalandırır — 20 puanlık bir adayda
// 10 puanlık ceza yarısını siler, 90 puanlıkta onda birini. Çarpan herkese
// aynı ORANDA uygulanır ve sıralama semantiğini bozmaz.
//
// ── NEDEN İKİ AYRI ÇARPAN ───────────────────────────────────────────────────
// "Bu adayın CV'sinde çelişki var" ile "bu aday bizim sektörümüzde
// çalışmamış" bambaşka iki bilgi. Tek sayıya ezmek hangisinin skoru
// düşürdüğünü görünmez kılardı — ve ikisi farklı aksiyon gerektiriyor: biri
// mülakatta sorulur, diğeri işe alım tercihidir.
//
// ── KATSAYILAR TAHMİN, TEK YERDE ────────────────────────────────────────────
// Aşağıdaki sayılar gerçek veri görülmeden seçildi. Hepsi tek blokta duruyor
// ki ilk kalibrasyonda tek dosyada değiştirilebilsin. Değiştirirken testler
// beklenen ARALIKLARI kontrol ediyor, birebir sayıları değil.

import { VERDICT } from './sectorFit.js';

/** Çelişki cezaları. İlk çelişki en pahalı; sonrakiler azalan katkı. */
export const CONTRADICTION_FIRST = 0.10;
export const CONTRADICTION_EACH = 0.05;
export const CONTRADICTION_FLOOR = 0.75;

/**
 * "Doğrulanamadı" cezası — BİLEREK YÜKSEK EŞİKLİ VE TEK KADEMELİ.
 *
 * Kaynak bulunamaması adayın kusuru değil: küçük ölçekli, yerel, yurtdışı ya
 * da dijital izi olmayan işletmeler de bu sonucu verir. Ceza yalnızca ORANTI
 * belirgin biçimde yüksekken ve yeterli sayıda şirket varken devreye girer;
 * tek doğrulanamayan şirket hiçbir şey yapmaz.
 */
export const UNVERIFIED_MIN_COMPANIES = 3;
export const UNVERIFIED_RATIO = 0.6;
export const UNVERIFIED_PENALTY = 0.05;

/** Sektör uyumu çarpanları. Ölçülemeyen ve hedefsiz durumlar NÖTR. */
export const SECTOR_FACTOR = {
    [VERDICT.STRONG]: 1.00,
    [VERDICT.PARTIAL]: 0.97,
    [VERDICT.NEAR]: 0.94,
    [VERDICT.NONE]: 0.90,
    [VERDICT.UNMEASURED]: 1.00,
    [VERDICT.NO_TARGET]: 1.00,
};

/** Sektör deneyimi var ama tamamı eski — küçük ek kesinti. */
export const SECTOR_STALE_PENALTY = 0.02;

const NEUTRAL = () => ({ multiplier: 1, reasons: [] });

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Doğrulama çarpanı — ÇELİŞKİ ve (koşullu) doğrulanamama oranından.
 *
 * @param {object} verification aday belgesindeki doğrulama özeti
 * @returns {{multiplier: number, reasons: Array<{code, label, factor}>}}
 *   Doğrulama hiç çalıştırılmamışsa 1 döner — tarama yapılmamış adayı
 *   cezalandırmak, işi yapmamamızı adayın kusuru saymak olurdu.
 */
export function verificationMultiplier(verification) {
    if (!verification) return NEUTRAL();

    const reasons = [];
    let multiplier = 1;

    const contradictions = Math.max(0, Number(verification?.counts?.celiski) || 0);
    if (contradictions > 0) {
        const raw = 1 - (CONTRADICTION_FIRST + (contradictions - 1) * CONTRADICTION_EACH);
        const factor = Math.max(CONTRADICTION_FLOOR, raw);
        multiplier *= factor;
        reasons.push({
            code: 'celiski',
            label: contradictions === 1
                ? 'CV içinde 1 çelişki bulundu'
                : `CV içinde ${contradictions} çelişki bulundu`,
            factor: round2(factor),
        });
    }

    // ── Doğrulanamama oranı ─────────────────────────────────────────────────
    // TARANMAYAN ŞİRKET BU HESABA GİRMEZ. Arama tavanına takılan ya da hata
    // alan şirket BİZİM eksiğimiz; adayın skorundan düşmek, kendi
    // kısıtımızın faturasını ona kesmek olurdu.
    const c = verification.companies;
    const complete = verification.lookupComplete === true;
    if (complete && c && Number(c.total) >= UNVERIFIED_MIN_COMPANIES) {
        const unverified = Number(c.dogrulanamadi) || 0;
        const ratio = unverified / Number(c.total);
        if (ratio >= UNVERIFIED_RATIO) {
            const factor = 1 - UNVERIFIED_PENALTY;
            multiplier *= factor;
            reasons.push({
                code: 'dogrulanamadi',
                label: `${c.total} şirketin ${unverified} tanesi bağımsız kaynakla doğrulanamadı`,
                factor: round2(factor),
            });
        }
    }

    return { multiplier: Math.max(CONTRADICTION_FLOOR * (1 - UNVERIFIED_PENALTY), multiplier), reasons };
}

/**
 * Sektör çarpanı.
 *
 * ÖLÇÜLEMEYEN NÖTRDÜR. Hedef sektör tanımlanmamışsa ya da şirketlerin
 * sektörü çözümlenemediyse çarpan 1'dir — ölçemediğimiz şeyi ceza olarak
 * yazmak, aracın kendi eksiğini adaya fatura etmesi olurdu.
 */
export function sectorMultiplier(verification) {
    const sector = verification?.sector;
    if (!sector?.verdict) return NEUTRAL();

    const base = SECTOR_FACTOR[sector.verdict];
    if (base === undefined) return NEUTRAL();

    const reasons = [];
    let multiplier = base;

    if (base < 1) {
        reasons.push({
            code: `sektor-${sector.verdict}`,
            label: sector.verdict === VERDICT.NONE
                ? 'Hedef sektörde ve komşu sektörlerde deneyim bulunamadı'
                : sector.verdict === VERDICT.NEAR
                    ? 'Yalnızca komşu sektörlerde deneyim'
                    : 'Hedef sektörde kısmi deneyim',
            factor: round2(base),
        });
    }

    // "Var ama eski" — "hiç yok"la aynı değil, ama tam kredi de değil.
    if (sector.stale === true && base >= SECTOR_FACTOR[VERDICT.PARTIAL]) {
        const factor = 1 - SECTOR_STALE_PENALTY;
        multiplier *= factor;
        reasons.push({
            code: 'sektor-bayat',
            label: 'Sektör deneyiminin tamamı son 5 yıldan eski',
            factor: round2(factor),
        });
    }

    return { multiplier, reasons };
}

/**
 * İki çarpanı birleştirir.
 *
 * @returns {{
 *   multiplier: number,
 *   verification: {multiplier, reasons},
 *   sector: {multiplier, reasons},
 *   applied: boolean,
 * }}
 *   applied=false: hiçbir kesinti yok. Arayüz "doğrulama skoru etkilemedi"
 *   ile "doğrulama hiç çalışmadı" arasındaki farkı `verification` alanının
 *   varlığından okur.
 */
export function verificationEffect(verification) {
    const v = verificationMultiplier(verification);
    const s = sectorMultiplier(verification);
    const multiplier = v.multiplier * s.multiplier;
    return {
        multiplier,
        verification: v,
        sector: s,
        applied: multiplier < 1,
    };
}

/**
 * Skoru çarpanla düzeltir.
 *
 * Yuvarlama SONDA yapılır: iki çarpanı ayrı ayrı yuvarlamak, listede
 * gösterilen sayı ile kırılım panelindeki sayının ayrışmasına yol açardı —
 * bu projede tekrar tekrar düzeltilen sapmanın aynısı.
 */
export function applyVerificationToScore(score, verification) {
    const base = Number(score) || 0;
    const effect = verificationEffect(verification);
    return {
        score: Math.round(base * effect.multiplier),
        baseScore: Math.round(base),
        ...effect,
    };
}
