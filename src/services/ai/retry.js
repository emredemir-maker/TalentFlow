// AI proxy çağrılarında GEÇİCİ hataları yeniden dene.
//
// Canlıda görüldü: 70 adaylık bir yeniden taramada 3 aday "AI isteği
// başarısız: 502" ile düştü ve analizleri eski hâlinde kaldı.
//
// 502 Gemini'den gelmiyor — backend'in kendi yeniden deneme döngüsü var ve
// 429/503/quota'yı zaten kaldırıyor. 502'yi ÖNÜNDEKİ ağ geçidi üretiyor:
// Hosting → Cloud Functions yolunda istek zaman aşımına uğradığında ya da
// örnek yeniden başlatıldığında. Yani hata backend'e hiç ulaşmıyor, oradaki
// döngü de devreye giremiyor. Yeniden deneme İSTEMCİDE olmak zorunda.
//
// Neden sessiz kalması kötüydü: toplu tarama 3 adayı atlıyor, kullanıcı
// bildirimde görüyor ama liste "tarandı" görünmeye devam ediyor. Skor eski,
// etiket yeni.

import { isRetryable } from '../../utils/aiErrorHint.js';

/** Ağ geçidi kaynaklı, tekrar denemeye değer HTTP durumları. */
export const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/** Kaç kez denenecek (ilk deneme dahil). */
export const MAX_ATTEMPTS = 3;

/** Bekleme: 1sn, 2sn (+ çakışmayı önlemek için rastgele pay). */
function backoffMs(attempt) {
    return Math.min(1000 * 2 ** attempt, 8000) + Math.floor(Math.random() * 400);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch sarmalayıcı: geçici durumlarda yeniden dener.
 *
 * Yalnızca GEÇİCİ olanları: 4xx'in geri kalanı (401 yetki, 400 hatalı istek)
 * tekrar denemekle düzelmez ve denemek kullanıcıyı bekletir.
 *
 * Ağ hatası (bağlantı koptu, DNS) da geçici sayılır — fetch bu durumda
 * hata fırlatır, durum kodu yoktur.
 *
 * @param {string} url
 * @param {object} init
 * @param {{attempts?: number, onRetry?: (info: object) => void}} options
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, init, { attempts = MAX_ATTEMPTS, onRetry } = {}) {
    let lastError = null;

    for (let attempt = 0; attempt < attempts; attempt++) {
        if (attempt > 0) await sleep(backoffMs(attempt - 1));

        let res;
        try {
            res = await fetch(url, init);
        } catch (err) {
            // Ağ seviyesi hata — durum kodu yok, geçici kabul edilir
            lastError = err;
            onRetry?.({ attempt: attempt + 1, reason: err?.message || 'ağ hatası' });
            continue;
        }

        if (res.ok || !RETRYABLE_STATUS.has(res.status)) return res;

        // 429 ÜÇ FARKLI ŞEY OLABİLİR ve yalnızca biri geçici.
        //
        // Aylık harcama tavanı dolduğunda da 429 geliyor. Onu üç kez denemek
        // hiçbir şeyi değiştirmez, yalnızca kullanıcıyı ~3 saniye bekletir ve
        // ardından aynı hatayı verir. Ayırt eden şey durum kodu değil,
        // gövdedeki metin — o yüzden kopyasını okuyoruz (asıl gövde çağırana
        // bozulmadan gitmeli).
        //
        // Gövde okunamazsa (clone yok, akış tüketilmiş) ESKİ davranışa düşülür
        // ve yeniden denenir: burada bir gelişme uğruna çalışan bir yolu
        // kırmak yok.
        if (res.status === 429 && typeof res.clone === 'function') {
            const body = await res.clone().text().catch(() => '');
            if (body && !isRetryable(body)) return res;
        }

        lastError = new Error(`AI isteği başarısız: ${res.status}`);
        onRetry?.({ attempt: attempt + 1, reason: String(res.status) });

        // Son denemeyse yanıtı olduğu gibi döndür: çağıran taraf gövdedeki
        // gerçek hata mesajını okuyabilsin.
        if (attempt === attempts - 1) return res;
    }

    throw lastError || new Error('AI isteği başarısız');
}
