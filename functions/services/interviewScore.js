// MÜLAKAT SAYISI KODDA HESAPLANIR.
//
// Canlıda ölçüldü: kullanıcı iyi geçmediğini söylediği bir görüşmeye 90,
// daha uygun bulduğu adayın görüşmesine 80 verildi. Sıralama ters döndü.
//
// Sebep prompt'taydı: modelden "her soru için 0-100 puan ver ve genel agregat
// skor üret" isteniyordu, başka hiçbir şey söylenmiyordu. Ne 70 ile 90'ın
// farkı tanımlıydı, ne neyin ölçüldüğü, ne de ilanın maddeleriyle bağı vardı.
// Çıpasız bir 0-100 istendiğinde model akıcılığı yetkinlik sanar ve her
// tutarlı metne 80-90 verir. Uzun konuşan aday kazanır.
//
// CV skorunda aynı sorunu şöyle çözmüştük: modele ETİKET sordur, SAYIYI kodda
// hesapla. Burada da öyle. Model artık damga veriyor (met/partial/missing/
// inconclusive — tanımları ve kaçış kuralı yazılı), sayı buradan çıkıyor.
//
// PAYDA HER ZAMAN GÖRÜNÜR. "Kanıt oranı %75" tek başına yanıltıcı: dört
// maddeden üçü mü, on maddeden yedisi mi? Bu modül her zaman kaç madde
// sorulduğunu da döndürür ve arayüz ikisini birlikte gösterir.

// Ağırlıklar CV kapsamasıyla AYNI olmak zorunda — iki sayı kıyaslanabilsin.
const MUST_WEIGHT = 85;
const NICE_WEIGHT = 15;

/** Damga → kanıt payı. `inconclusive` hesaba HİÇ girmez. */
const CREDIT = { met: 1, partial: 0.5, missing: 0 };

/**
 * Mülakatta ÇIKAN KANIT oranı.
 *
 * Bu bir "aday ne kadar iyi" skoru DEĞİL. Yalnızca şunu söyler: odada
 * sorduğumuz maddelerin ne kadarında kanıt çıktı. Tek başına bir işe alım
 * kararı vermez ve vermemeli — adayın pozisyona uyumu CV taramasıyla
 * birleşince ortaya çıkıyor (src/utils/interviewCoverage.js).
 *
 * `inconclusive` PAYDAYA DA GİRMEZ. Soru atlanmışsa o madde ölçülmemiştir;
 * ölçülmemiş bir şeyi paydaya koymak, cevaplanmamış soruyu yanlış cevap
 * saymak olurdu.
 *
 * @param {Array<{requirementIndex: number, verdict: string}>} verdicts
 * @param {Array<{text: string, must: boolean|null}>} requirements
 * @returns {{
 *   score: number|null,   // null = ölçülecek bir şey yok
 *   asked: number,        // hüküm verilebilen madde sayısı
 *   met: number, partial: number, missing: number, inconclusive: number,
 *   mustMissing: number,  // odada düşen zorunlu madde sayısı
 * }}
 */
export function interviewEvidence(verdicts, requirements) {
    const empty = { score: null, asked: 0, met: 0, partial: 0, missing: 0, inconclusive: 0, mustMissing: 0 };
    if (!Array.isArray(verdicts) || verdicts.length === 0) return empty;
    const reqs = Array.isArray(requirements) ? requirements : [];

    const counts = { met: 0, partial: 0, missing: 0, inconclusive: 0 };
    let mustMissing = 0;
    let earned = 0;
    let possible = 0;

    for (const v of verdicts) {
        const verdict = String(v?.verdict || '').toLowerCase();
        if (!(verdict in counts)) continue;
        counts[verdict] += 1;
        if (verdict === 'inconclusive') continue;

        const req = reqs[Number(v?.requirementIndex) - 1];
        // İşaretlenmemiş eski ilanlarda tüm maddeler eşit ağırlıklı — skorlama
        // tarafındaki geriye dönük nötrlüğün aynısı.
        const weight = req?.must === true ? MUST_WEIGHT : req?.must === false ? NICE_WEIGHT : MUST_WEIGHT;
        possible += weight;
        earned += weight * CREDIT[verdict];
        if (verdict === 'missing' && req?.must === true) mustMissing += 1;
    }

    const asked = counts.met + counts.partial + counts.missing;
    return {
        score: possible > 0 ? Math.round((earned / possible) * 100) : null,
        asked,
        ...counts,
        mustMissing,
    };
}

/**
 * Sonuç önerisi — damgalardan TÜRETİLİR, modelden sorulmaz.
 *
 * Eskiden model "positive/negative/pending" seçiyordu ve puanla aynı sorunu
 * taşıyordu: neye göre karar verdiği yazılı değildi. Kural artık burada ve
 * okunabilir.
 *
 * Karar İNSANA ait; bu yalnızca bir öneri. Zorunlu bir madde odada düştüyse
 * "olumlu" diyemeyiz — ama "olumsuz" da demiyoruz, çünkü eleme kararı
 * yöneticinin (EU AI Act yüksek riskli kategori).
 *
 * @returns {'positive'|'negative'|'pending'}
 */
export function suggestOutcome(evidence) {
    if (!evidence || evidence.asked === 0) return 'pending';
    // Odada düşen zorunlu madde: kapı burada kapanır, öneri olumlu olamaz.
    if (evidence.mustMissing > 0) return 'negative';
    if (evidence.score === null) return 'pending';
    if (evidence.score >= 75) return 'positive';
    if (evidence.score < 40) return 'negative';
    return 'pending';
}

/**
 * Değerlendirme şeması.
 *
 * 1 → modelin ürettiği çıpasız 0-100 (şişik; canlıda 90 vs 80 tersliği)
 * 2 → damgalardan kodda hesaplanan kanıt oranı
 *
 * Eski kayıtların skoru YANLIŞ değil ama bugünkü ölçüyle üretilmemiş; aynı
 * listede yan yana durmaları sıralamayı bozar. Arayüz bu damgaya bakıp eski
 * kayıtları ayırt edebilir.
 */
export const EVAL_SCHEMA = 2;
