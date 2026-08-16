// İNCELEME YORUMUNU DAMGALA VE SAKLA — kayıtlar arası tutarlılık.
//
// Sunucu JSON yanıtlarda `temperature: 0` kullanıyor ve aynı prompt'u bir saat
// önbellekte tutuyor; bu oturum İÇİ tutarlılığı veriyor. Ama bir saat sonra
// ya da başka bir gün aynı soru sorulduğunda model aynı metni üretmek zorunda
// değil. Asistan salı "iletişimi güçlü" deyip perşembe "kanıt zayıf" derse,
// kullanıcı hangisine güveneceğini bilemez ve asistanın TAMAMINA olan güven
// gider. Bu projede aynı sınıf tutarsızlık bir kez yaşandı: aynı aday iki
// taramada 80 ile 65 aldı.
//
// Çözüm projenin kendi düzeni: DAMGALA VE SAKLA. Damga, hesaplanmış çerçevenin
// parmak izi — girdi değişmedikçe yorum yeniden üretilmez, değiştiğinde damga
// tutmaz ve yeni yorum çıkar.

import { doc, getDoc, setDoc } from 'firebase/firestore';

import { db } from '../config/firebase';

/**
 * Çerçevenin parmak izi (djb2).
 *
 * requirementsFingerprint ile aynı aile: ucuz, çakışması pratikte önemsiz ve
 * en önemlisi AYNI GİRDİYE AYNI DAMGA veriyor.
 */
export function reviewFingerprint(summary) {
    const text = JSON.stringify(summary);
    let hash = 5381;
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
    }
    return `r${(hash >>> 0).toString(36)}`;
}

function cacheRef(uid, fingerprint) {
    if (!db) throw new Error('Firestore yapılandırılmamış.');
    if (!uid) throw new Error('Oturum bilgisi çözümlenemedi.');
    return doc(db, `artifacts/talent-flow/public/data/users/${uid}/assistantReviews/${fingerprint}`);
}

/** Saklanmış yorum; yoksa null. */
export async function loadReview(uid, fingerprint) {
    const snap = await getDoc(cacheRef(uid, fingerprint));
    if (!snap.exists()) return null;
    const data = snap.data();
    return data?.narration || null;
}

/** Yorumu damgasıyla sakla. */
export async function saveReview(uid, fingerprint, narration) {
    await setDoc(cacheRef(uid, fingerprint), {
        narration,
        at: new Date().toISOString(),
    });
}
