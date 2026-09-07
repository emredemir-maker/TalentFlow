import { useState } from 'react';

/**
 * Bir girdi değiştiğinde state'i ona uydurur — EFEKTTE DEĞİL, RENDER'DA.
 *
 * ── NEDEN EFEKT DEĞİL ───────────────────────────────────────────────────────
 * "Prop değişti, formu sıfırla" bir yan etki değil; state'i yeni girdiye
 * uydurmak. Efekte konduğunda sıra şu oluyor: bileşen ESKİ state ile bir kez
 * çiziliyor, ekrana basılıyor, sonra efekt çalışıp state'i değiştiriyor ve
 * ikinci kez çiziliyor. Kullanıcı arada bir kare boyunca önceki kaydın
 * verisini görüyor — modal açılışlarında "bir an eski aday göründü" tipi
 * hataların kaynağı bu.
 *
 * Render sırasında yapıldığında React aradaki çizimi hiç ekrana basmıyor;
 * doğrudan güncel state ile devam ediyor. React'in bu durum için önerdiği
 * yol da bu ("You Might Not Need an Effect" → Adjusting state when a prop
 * changes).
 *
 * ── KARŞILAŞTIRMA Object.is İLE ─────────────────────────────────────────────
 * `!==` yerine `Object.is`: NaN kendine eşit değildir ama "değişmedi"
 * sayılmalı, yoksa her render'da sonsuz döngü kurulur.
 *
 * ── NE İÇİN KULLANILMAZ ─────────────────────────────────────────────────────
 * Ağ çağrısı, zamanlayıcı, abonelik gibi GERÇEK yan etkiler için değil —
 * onlar efektte kalmalı. Burası yalnızca "girdi değişti, state'i eşitle".
 *
 * @param {*} girdi   İzlenen değer (prop, id, açık/kapalı bayrağı…)
 * @param {(yeni:*, eski:*) => void} uygula  Değişince çalışacak setState'ler
 */
export function useDegisince(girdi, uygula) {
    const [onceki, setOnceki] = useState(girdi);
    if (!Object.is(onceki, girdi)) {
        setOnceki(girdi);
        uygula(girdi, onceki);
    }
}
