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

/**
 * Görüşmenin saati geçti mi?
 *
 * Geçmiş bir görüşmede kullanıcının yapacağı iş "katılmak" değil "sonucu
 * girmek" — görüşme büyük ihtimalle başka bir uygulamada zaten yapıldı.
 * Mülakat listesindeki birincil düğme buna göre değişiyor.
 *
 * SAAT YOKSA GÜN SONUNA KADAR BEKLENİR: saatsiz bir kaydı öğlen "geçti"
 * saymak, henüz yapılmamış bir görüşmeyi yapılmış gibi göstermek olurdu.
 */
export function isSessionPast(session, now = new Date()) {
    if (!session?.date) return false;
    const gun = String(session.date).slice(0, 10);
    const ham = String(session.time || '').replace('.', ':');
    const saat = /^[0-9]{1,2}:[0-9]{2}$/.test(ham) ? ham.padStart(5, '0') : '23:59';
    const t = new Date(`${gun}T${saat}:00`);
    if (Number.isNaN(t.getTime())) return false;
    return t.getTime() < now.getTime();
}
