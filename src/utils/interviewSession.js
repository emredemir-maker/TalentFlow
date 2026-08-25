// MÜLAKAT OTURUMU FİİLEN BİTTİ Mİ?
//
// Kaydın `status` alanı her zaman 'completed' yazmıyor: canlı mülakat arka
// uçta bitip skoru yazıldığında, yüz yüze görüşme puanlandığında ya da rapor
// üretildiğinde durum alanı geride kalabiliyor. Bu yüzden "bitmiş" ölçütü
// dört ayrı ekranda (Dashboard, InterviewHistory, CandidateDrawer,
// InterviewManagementPage) BİREBİR AYNI şekilde tekrarlanmıştı. Beşincisi
// gerektiğinde — aday aşamasının otomatik "Mülakat Tamamlandı"ya geçmesi —
// kural kopyalanmak yerine buraya taşındı.

/**
 * Ekranların bugün kullandığı ölçüt — DEĞİŞTİRİLMEDİ.
 *
 * Kuralın bir tuhaflığı var: iptal edilmiş ama skoru olan bir oturum da
 * "bitmiş" sayılıyor ('cancelled' !== 'live' olduğu için). Bu davranış
 * bilerek korundu; dört ekranın görünümü aynı kalsın diye. Aday aşamasının
 * otomatik ilerlemesi bu tuhaflığı miras almasın diye ayrı bir fonksiyon var
 * (`hasCompletedInterview`).
 *
 * @param {object|null|undefined} session
 * @param {string} [effectiveStatus] — çağıran taraf ham durumu düzeltmişse
 *   (ör. Dashboard'daki public Firestore kaydı) o değer kullanılır.
 * @returns {boolean}
 */
export function isSessionDone(session, effectiveStatus) {
    if (!session || typeof session !== 'object') return false;
    const status = effectiveStatus || session.status;
    return status === 'completed'
        || (status !== 'live'
            && (session.aiOverallScore > 0 || Boolean(session.aiSummary) || session.finalScore > 0));
}

/**
 * Adayın fiilen yapılmış en az bir mülakatı var mı?
 *
 * İPTAL EDİLEN OTURUM SAYILMAZ: adayı "Mülakat Tamamlandı" aşamasına taşımak
 * "görüşüldü, karar bekleniyor" demek. İptal edilmiş bir görüşme bunu
 * karşılamıyor — aday hâlâ planlı mülakat aşamasında.
 */
export function hasCompletedInterview(candidate) {
    const sessions = candidate?.interviewSessions;
    if (!Array.isArray(sessions)) return false;
    return sessions.some((s) => s?.status !== 'cancelled' && isSessionDone(s));
}
