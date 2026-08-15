// Asistan geri bildirimi — ŞİMDİ TOPLANIR, SONRA KULLANILIR.
//
// Planın Faz 7'si (kurum hafızası + öğrenme) bu veriye dayanıyor ama o katman
// henüz yazılmadı. Toplamayı ertelemenin bedeli şu: toplanmamış geri bildirim
// sonradan ÜRETİLEMEZ. Kullanıcının bugün "bu cevap yanlıştı" dediği an geçip
// giderse, altı hafta sonra o bilgiyi hiçbir yerden geri getiremeyiz.
//
// Bu yüzden düğme bugün var, kullanan taraf sonra gelecek.
//
// Kayıt kullanıcının kendi alt koleksiyonunda:
//   artifacts/talent-flow/public/data/users/{uid}/assistantFeedback/{autoId}
// Bu yol firestore.rules'ta zaten kapalı (`users/{userId}/{allChildren=**}`).

import { addDoc, collection } from 'firebase/firestore';

import { db } from '../config/firebase';

/**
 * Bir cevaba dair geri bildirimi yazar.
 *
 * SORU ve ARAÇ da kaydedilir: "yanlış" damgası tek başına işe yaramaz —
 * hangi soruda hangi aracın yanıldığını bilmeden düzeltilecek bir şey yok.
 * Aday adı ya da CV metni KAYDEDİLMEZ; burada ölçtüğümüz şey asistanın
 * davranışı, adayın verisi değil.
 *
 * @param {string} uid
 * @param {{question: string, tool: string|null, verdict: 'up'|'down', note?: string}} entry
 */
export async function saveFeedback(uid, entry) {
    if (!db) throw new Error('Firestore yapılandırılmamış.');
    if (!uid) throw new Error('Oturum bilgisi çözümlenemedi.');
    await addDoc(
        collection(db, `artifacts/talent-flow/public/data/users/${uid}/assistantFeedback`),
        {
            question: String(entry?.question || '').slice(0, 500),
            tool: entry?.tool || null,
            verdict: entry?.verdict === 'up' ? 'up' : 'down',
            note: String(entry?.note || '').slice(0, 1000),
            at: new Date().toISOString(),
        }
    );
}
