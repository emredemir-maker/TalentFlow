// KİŞİSEL VERİYE ERİŞİM KAYDI.
//
// ── NEDEN VAR ───────────────────────────────────────────────────────────────
// Bir veri ihlali incelemesinde sorulan ilk şey "kim, hangi kişisel veriye,
// ne zaman erişti" oluyor. Kayıt yoksa "kimse erişmedi" cümlesi de
// kurulamıyor — savunma, olmayan bir defterin üzerine kurulamaz.
//
// ── NE KAYDEDİLİYOR ─────────────────────────────────────────────────────────
// Yalnızca KİŞİSEL VERİYE dokunan eylemler:
//   candidate-view  — aday detayının açılması
//   cv-view         — CV dosyasının görüntülenmesi/indirilmesi
//   export          — listenin Excel'e aktarılması (toplu çıkarma)
//
// Liste gezinme ve arama kaydedilmiyor: her tuşa basışı yazmak defteri
// okunamaz hale getirir ve asıl olayı gürültüde kaybeder.
//
// ── DÜRÜSTLÜK: BU KAYIT "EN İYİ ÇABA"DIR ────────────────────────────────────
// Uygulama Firestore'u tarayıcıdan doğrudan okuyor. Yani kaydı yazan da
// okuyan da aynı istemci; SDK'yı doğrudan kullanan bir iç kullanıcı kayıt
// bırakmadan veri okuyabilir. Bunu gerçekten zorunlu kılmanın tek yolu tüm
// okumaları sunucudan geçirmek olurdu — ayrı ve büyük bir iş.
//
// Bu kaydın verdiği şey: NORMAL kullanımda kim neye baktığının izi, ve toplu
// çıkarma gibi olayların görünür olması. Verdiği şey bu, daha fazlası değil.
//
// ── DEFTER DEĞİŞTİRİLEMEZ ───────────────────────────────────────────────────
// firestore.rules yalnızca `create` veriyor: güncelleme ve silme kapalı,
// okuma super_admin'e özel. Sonradan düzenlenebilen bir denetim kaydının
// kanıt değeri olmaz.

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { db } from '../config/firebase';
import { IS_DEMO } from '../utils/demoMode';

const PATH = 'artifacts/talent-flow/public/data/accessLogs';

export const ACCESS_ACTIONS = {
    CANDIDATE_VIEW: 'candidate-view',
    CV_VIEW: 'cv-view',
    EXPORT: 'export',
};

/**
 * Erişimi deftere yazar.
 *
 * KAYIT İŞİ DURDURMAZ: hata yutuluyor ve beklenmiyor. Defter yazılamadı diye
 * kullanıcının aday detayı açılmamalı — aynı kural functions/services/usage.js
 * içinde de geçerli.
 *
 * @param {string} action ACCESS_ACTIONS değerlerinden biri
 * @param {{uid?: string, email?: string, candidateId?: string, count?: number, note?: string}} detay
 */
export function logAccess(action, detay = {}) {
    // Demo havuzunda gerçek kişisel veri yok ve havuz her gece siliniyor;
    // ziyaretçi gezintisini deftere yazmak defteri gürültüyle doldururdu.
    if (IS_DEMO) return;
    if (!action || !detay?.uid) return;

    const kayit = {
        action,
        uid: detay.uid,
        // E-posta da yazılıyor: uid'ler silinmiş kullanıcılar için anlamsız
        // hale geliyor ve defterin yıllar sonra okunabilmesi gerekiyor.
        email: detay.email || '',
        at: serverTimestamp(),
        ...(detay.candidateId ? { candidateId: detay.candidateId } : {}),
        ...(Number.isFinite(detay.count) ? { count: detay.count } : {}),
        ...(detay.note ? { note: String(detay.note).slice(0, 200) } : {}),
    };

    void addDoc(collection(db, PATH), kayit).catch((err) => {
        console.warn('[accessLog] kaydedilemedi:', err?.message);
    });
}
