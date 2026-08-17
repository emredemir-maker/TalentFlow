// GERİYE DÖNÜK TARAMANIN OKUMA/YAZMA UCU.
//
// Okuma: aday belgesindeki `interviewSessions[]` yalnızca bir ÖZET taşıyor;
// transkript ve `candidateSalary` tam kayıtta (`interviews/{sessionId}`).
// Beklentinin kayıtlı olup olmadığını özet üzerinden tahmin etmek yanlış
// satırları listeye sokardı — tam kaydı okumak zorunlu.
//
// Yazma: kaynak `interviews/{sessionId}`. Fark raporu (utils/interviewReview.js)
// beklentiyi ORADAN okuyor. Aday belgesindeki kopyaya dokunulmuyor: o alanı
// bugün hiçbir ekran okumuyor ve diziyi istemciden yeniden yazmak, bu projede
// bir kez yaşanmış olan "hayalet yazım" yarışını geri getirir
// (bkz. InterviewManagementPage — PUBLIC INTERVIEW STATUS MAP).

import { doc, getDoc, writeBatch } from 'firebase/firestore';

import { db } from '../config/firebase';
import { buildBackfillRows, sessionTime, MAX_ROWS } from '../utils/salaryBackfill';
import { normalizeBand } from '../utils/salaryBand';

/**
 * En fazla kaç kayıt OKUNUR.
 *
 * MAX_ROWS listelenecek satırın tavanı; bu ise okumanın tavanı. İkisi ayrı
 * çünkü okunan kayıtların çoğunda beklenti zaten dolu olabilir ve o satırlar
 * listeye girmez. Tavan olmasa 400 adaylık bir havuzda tek tıkla yüzlerce
 * okuma yapılırdı.
 */
export const MAX_READS = 200;

/**
 * Beklentisi eksik görüşmeleri toplar — EN YENİ ÖNCE.
 *
 * Sıra keyfi değil ve ekranda yazıyor: en yeni görüşmelerin transkripti hem
 * daha taze hem de bugünün bütçe kararına daha yakın.
 *
 * @param {{candidates: Array}} input
 * @returns {Promise<{rows: Array, read: number, skipped: number, remaining: number, failed: number}>}
 *   remaining: tavana takıldığı için bu turda BAKILMAYAN görüşme sayısı
 */
export async function loadBackfillRows({ candidates = [] } = {}) {
    const pending = [];
    for (const candidate of candidates || []) {
        const sessions = Array.isArray(candidate?.interviewSessions) ? candidate.interviewSessions : [];
        for (const summary of sessions) {
            if (!summary?.id) continue;
            pending.push({
                candidateId: candidate.id,
                candidateName: candidate.name || '',
                sessionId: String(summary.id),
                at: sessionTime(summary),
            });
        }
    }
    pending.sort((a, b) => b.at - a.at);

    const entries = [];
    let read = 0;
    let failed = 0;
    let index = 0;
    for (; index < pending.length; index += 1) {
        if (entries.length >= MAX_ROWS || read >= MAX_READS) break;
        const item = pending[index];
        read += 1;
        try {
            const snap = await getDoc(doc(db, 'interviews', item.sessionId));
            if (!snap.exists()) continue;
            const session = snap.data();
            // Beklentisi dolu olanı entries'e hiç almıyoruz; buildBackfillRows
            // de aynı süzgeci uyguluyor — iki yerde olması bilinçli: burada
            // TAVAN doğru sayılsın diye, orada saf mantık test edilebilsin diye.
            if (normalizeBand(session?.candidateSalary)) continue;
            entries.push({
                sessionId: item.sessionId,
                candidateId: item.candidateId,
                candidateName: item.candidateName,
                session,
            });
        } catch {
            // Tek bir kaydın okunamaması listeyi durdurmaz; sayısı raporlanır.
            failed += 1;
        }
    }

    return {
        rows: buildBackfillRows(entries),
        read,
        failed,
        // Bakılmamış görüşmeler. Kaydedilen satırlar listeden düşeceği için
        // ekran yeniden açıldığında sıradakiler gelir.
        remaining: Math.max(0, pending.length - index),
    };
}

/**
 * Onaylanan beklentileri kaydeder.
 *
 * TEK PARTİ: 47 satırın 30'unun yazılıp 17'sinin yazılmaması, kullanıcının
 * neyin kaydedildiğini bilmediği bir ara duruma sokar. Ya hepsi ya hiçbiri.
 *
 * `candidateSalaryMeta` rakamın NEREDEN geldiğini kayda geçirir — alıntı mı,
 * elle mi. Altı ay sonra "bu sayıyı kim koydu" sorusunun cevabı olmadan, bir
 * bütçe raporunun dayanağı da olmaz.
 *
 * @param {Array<{row: {sessionId: string}, band: object, source: string, quote: string|null}>} items
 * @param {{uid?: string}} context
 * @returns {Promise<number>} kaydedilen satır sayısı
 */
export async function saveBackfill(items = [], { uid = null } = {}) {
    const list = (Array.isArray(items) ? items : []).filter((it) => it?.row?.sessionId && normalizeBand(it.band));
    if (list.length === 0) return 0;

    const at = new Date().toISOString();
    // Firestore bir partide 500 işlem alıyor; MAX_ROWS bunun çok altında ama
    // sınır burada dursun ki tavan ileride yükselirse yazma sessizce patlamasın.
    const CHUNK = 400;
    for (let i = 0; i < list.length; i += CHUNK) {
        const batch = writeBatch(db);
        for (const item of list.slice(i, i + CHUNK)) {
            batch.update(doc(db, 'interviews', item.row.sessionId), {
                candidateSalary: normalizeBand(item.band),
                candidateSalaryMeta: {
                    source: item.source === 'transcript' ? 'transcript' : 'manual',
                    quote: item.quote || null,
                    at,
                    by: uid || null,
                    method: 'backfill',
                },
            });
        }
        await batch.commit();
    }
    return list.length;
}
