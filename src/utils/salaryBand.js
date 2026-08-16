// MAAŞ BANDI — ilanın bütçesi ve adayın beklentisi.
//
// Bugüne kadar ikisi de sistemde YOKTU. "Adaylar iyi ama bütçemin çok
// üzerindeler" gözlemi hiçbir yere yazılamıyor, dolayısıyla hiçbir rapora
// girmiyordu.
//
// ── NEDEN PARA BİRİMİ VE DÖNEM ZORUNLU ──────────────────────────────────────
// "120000" tek başına bir sayı değil, yarım bir ölçüm: aylık mı yıllık mı,
// TL mi dolar mı? Eksik birimli iki sayıyı karşılaştırmak, bu projede tekrar
// tekrar düzelttiğimiz hatanın en pahalı hâli olurdu — bütçe kararı verdirir.
//
// Bu yüzden BİRİMLER UYUŞMUYORSA KARŞILAŞTIRMA YAPILMAZ. Kur çevirmiyoruz:
// uydurma bir kur, uydurma bir karşılaştırma üretir. Sistem "çeviremiyorum"
// der ve kullanıcı ne yapacağına kendi karar verir.

export const CURRENCIES = ['TRY', 'USD', 'EUR'];

/**
 * BRÜT/NET DE BİR BİRİMDİR.
 *
 * Türkiye'de aday neredeyse her zaman NET konuşur ("net 95 bin isterim"),
 * şirket bütçesi ise çoğunlukla BRÜT tutulur. İkisini karşılaştırmak farkı
 * yaklaşık %30-40 OLDUĞUNDAN KÜÇÜK gösterir — rapor "bandın biraz üstünde"
 * derken aslında çok üstünde olur.
 *
 * Çevrim YAPMIYORUZ: brüt↔net vergi dilimine, kümülatif matraha, asgari ücret
 * istisnasına ve yıla bağlı, kişiden kişiye değişir. Koda gömmek uydurma bir
 * kur koymakla aynı şey olurdu.
 */
export const BASES = ['gross', 'net'];
export const PERIODS = ['monthly', 'yearly'];

export const CURRENCY_LABEL = { TRY: '₺', USD: '$', EUR: '€' };
export const PERIOD_LABEL = { monthly: 'aylık', yearly: 'yıllık' };
export const BASIS_LABEL = { gross: 'brüt', net: 'net' };

const num = (v) => {
    const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/**
 * Ham girdiyi banda çevirir; geçersizse null.
 *
 * Tek uçlu band (yalnız min ya da yalnız max) kabul edilir — "en fazla 80 bin"
 * gerçek bir bütçe ifadesidir ve yarısını uydurmak yerine olduğu gibi tutmak
 * doğru.
 */
export function normalizeBand(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const min = num(raw.min);
    const max = num(raw.max);
    if (min === null && max === null) return null;
    const currency = CURRENCIES.includes(raw.currency) ? raw.currency : 'TRY';
    const period = PERIODS.includes(raw.period) ? raw.period : 'monthly';
    // BAZIN VARSAYILANI YOK. Para birimi ve dönemde yanlış varsayımın sonucu
    // ya belirgin (12 kat) ya da nadir; brüt/net'te ise sonuç 1.4 kat —
    // yani YANLIŞ AMA MAKUL görünür ve fark edilmez. Belirtilmemişse null
    // kalır ve karşılaştırmaya girmez.
    const basis = BASES.includes(raw.basis) ? raw.basis : null;
    // Ters girilmiş aralığı reddetmek yerine düzeltmek, kullanıcıyı bir yazım
    // hatası yüzünden durdurmamak demek.
    if (min !== null && max !== null && min > max) return { min: max, max: min, currency, period, basis };
    return { min, max, currency, period, basis };
}

/** '80.000 – 120.000 ₺ (aylık)' */
export function formatBand(band) {
    const b = normalizeBand(band);
    if (!b) return '';
    const fmt = (n) => n.toLocaleString('tr-TR');
    const range = b.min !== null && b.max !== null
        ? `${fmt(b.min)} – ${fmt(b.max)}`
        : (b.min !== null ? `${fmt(b.min)}+` : `en fazla ${fmt(b.max)}`);
    const basis = b.basis ? `, ${BASIS_LABEL[b.basis]}` : '';
    return `${range} ${CURRENCY_LABEL[b.currency]} (${PERIOD_LABEL[b.period]}${basis})`;
}

/**
 * Adayın beklentisini banda göre konumlar.
 *
 * @returns {{status:'below'|'within'|'above'|'unknown', reason?:string, overshoot?:number}}
 *   overshoot: bandın ÜST ucunu aşma oranı (0.25 = %25 üstünde)
 */
export function compareToBand(expectation, band) {
    const e = normalizeBand(expectation && typeof expectation === 'object'
        ? expectation
        : { min: expectation, max: expectation, currency: band?.currency, period: band?.period, basis: band?.basis });
    const b = normalizeBand(band);
    if (!e) return { status: 'unknown', reason: 'Adayın beklentisi kayıtlı değil.' };
    if (!b) return { status: 'unknown', reason: 'İlanda bütçe bandı tanımlı değil.' };

    // BİRİM UYUŞMAZLIĞINDA KARŞILAŞTIRMA YOK. Aylık ile yıllığı ya da TL ile
    // doları sessizce kıyaslamak, yanlış bir sayıyı doğru gibi göstermektir.
    if (e.currency !== b.currency) {
        return { status: 'unknown', reason: `Para birimleri farklı (${e.currency} ↔ ${b.currency}) — kur çevirmiyoruz.` };
    }
    if (e.period !== b.period) {
        return { status: 'unknown', reason: `Dönemler farklı (${PERIOD_LABEL[e.period]} ↔ ${PERIOD_LABEL[b.period]}).` };
    }
    // BAZ BELİRTİLMEMİŞSE KARŞILAŞTIRMA YOK. Varsaymak, %30-40'lık bir hatayı
    // makul görünen bir sayının içine gömmek olurdu.
    if (!e.basis || !b.basis) {
        return {
            status: 'unknown',
            reason: !b.basis
                ? 'İlan bandında brüt/net belirtilmemiş.'
                : 'Adayın beklentisinde brüt/net belirtilmemiş.',
        };
    }
    if (e.basis !== b.basis) {
        return {
            status: 'unknown',
            reason: `Brüt/net farklı (${BASIS_LABEL[e.basis]} ↔ ${BASIS_LABEL[b.basis]}) — çevrim yapmıyoruz.`,
        };
    }

    // Adayın beklentisi bir aralıksa alt ucunu esas al: pazarlığın
    // başlayabileceği en düşük nokta odur.
    const want = e.min ?? e.max;
    if (b.max !== null && want > b.max) {
        return { status: 'above', overshoot: (want - b.max) / b.max };
    }
    if (b.min !== null && want < b.min) return { status: 'below' };
    return { status: 'within' };
}
