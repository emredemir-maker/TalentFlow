// Aday tarafındaki (herkese açık) uçların ortak başlığı.
//
// Aday sayfası anonim oturumla açılır; iç kullanıcı (recruiter) aynı uçları
// kendi oturumuyla çağırır — yeni mülakat belgesini sunucu yalnız şirketin
// admin/recruiter'ına açtırır, bu yüzden oturum varsa jeton eklenir. Şirket
// kimliği gövdede `tenantId` (PR 5'e kadar; sonra publicLinks).
import { auth } from '../config/firebase';

export async function publicApiHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    try {
        const token = await auth?.currentUser?.getIdToken();
        if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
        /* jetonsuz devam */
    }
    return headers;
}
