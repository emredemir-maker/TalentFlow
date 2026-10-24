// TAKVİM PENCERESİNİ OKUMA — tek yerden.
//
// Takvim iki ekranda gösteriliyor (Mülakatlar → liste ve ay görünümü) ve
// okuma kodunun iki kopyası olsaydı biri düzeltilip diğeri unutulurdu:
// jeton tazeleme, iptal edilen etkinliklerin ayıklanması ve sıralama üç ayrı
// karar ve üçü de her iki ekranda aynı olmak zorunda.
//
// React'ten bağımsız: durum yönetimi çağıranda, ağ ve ayıklama burada.

import { getCalendarEvents, isGoogleConnected } from './integrationService';
import { normalizeCalendarEvent } from '../utils/calendarMatch';

/**
 * Verilen aralıktaki takvim etkinliklerini getirir.
 *
 * @param {object} input
 *   userProfile — Google bağlantısı var mı (jetonu sunucu tazeler)
 *   from, to — Date
 * @returns {Promise<{events: Array, error: string}>}
 *   Hata FIRLATILMIYOR: takvim okunamadığında ekranın geri kalanı çalışmaya
 *   devam etmeli. Sebep metin olarak dönüyor ve kullanıcıya gösteriliyor.
 */
export async function fetchCalendarWindow({ userProfile, from, to }) {
    try {
        if (!isGoogleConnected(userProfile)) {
            return { events: [], error: 'Google bağlantısı doğrulanamadı. Ayarlar → Entegrasyonlar bölümünden yeniden bağlanın.' };
        }
        const result = await getCalendarEvents(from.toISOString(), to.toISOString());
        if (!result?.success) {
            return { events: [], error: result?.error || 'Takvim okunamadı.' };
        }
        const events = (result.events || [])
            .map(normalizeCalendarEvent)
            .filter(Boolean)
            // İPTAL EDİLEN ETKİNLİK GÖSTERİLMEZ: Google silinen kaydı bir süre
            // `status: 'cancelled'` ile döndürmeye devam ediyor ve takvimde
            // görünmeyen bir toplantı burada görünüyordu.
            .filter((e) => e.status !== 'cancelled')
            .sort((a, b) => a.start - b.start);
        return { events, error: '' };
    } catch (err) {
        return { events: [], error: err?.message || 'Takvim okunamadı.' };
    }
}
