// Toplu CV yüklemesinin saf yardımcıları (CandidateProcessPage modalı).
//
// BURADA ESKİDEN 28MB'LIK BİR PARÇALAMA VARDI ve artık yok. Sebebi:
// Cloud Functions isteğin gövdesini 32MB'da kesiyor, o yüzden dosyalar
// istek istek gönderiliyordu. Ama asıl duvar bu değildi — Firebase Hosting
// rewrite isteği 60 SANİYEDE kesiyor ve sunucu o istek içinde ZIP'i açıp
// her PDF'in metnini çıkarıyordu. Yükleme süresi de o saatin içindeydi:
// 28MB'ı göndermek ev bağlantısında zaten 20-45 saniye yiyordu.
//
// Parçalama yalnızca birinci duvara çareydi, ikincisine değildi; üstelik
// küçük ZIP'leri 28MB'a kadar aynı isteğe topladığı için süre açısından tek
// büyük ZIP ile birebir aynı sonucu veriyordu — "böldüm, artık güvenli"
// hissi veren ama hiçbir şeyi bölmeyen bir önlemdi.
//
// Yeni akış dosyayı DOĞRUDAN Firebase Storage'a yüklüyor. O yol Hosting
// rewrite'ından geçmediği için iki sınır da uygulanmaz; API'ye yalnızca yol
// gönderilir. Gerekçenin sunucu tarafı: functions/services/bulkSources.js.

/** Storage kuralı ve sunucu doğrulamasıyla aynı üst sınır. */
export const MAX_SOURCE_BYTES = 200 * 1024 * 1024;

/** Tek seferde bildirilebilecek kaynak dosya sayısı (sunucu ile aynı). */
export const MAX_SOURCES = 50;

/**
 * Dosya adını Storage yolunda güvenli hâle getirir.
 *
 * Türkçe adlar bu üründe kural, istisna değil ('Özgür Şahin CV.pdf'). Yol
 * ayıracı atılır; alfanümerik olmayan her şey (boşluk, Türkçe harf, kontrol
 * karakteri) '_' olur. Uzantı korunur çünkü sunucu dosya türünü ondan okuyor.
 */
export function sanitizeStorageName(name) {
    const raw = String(name || '').split(/[/\\]/).pop() || 'dosya';
    const match = raw.toLowerCase().match(/\.([a-z0-9]+)$/);
    const ext = match ? match[1] : '';
    const stem = (ext ? raw.slice(0, -(ext.length + 1)) : raw)
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^[._-]+/, '')
        .slice(0, 60);
    return ext ? `${stem || 'dosya'}.${ext}` : (stem || 'dosya');
}

/**
 * Kaynağın Storage yolu.
 *
 * uid yolun İÇİNDE: Storage kuralı yazma iznini, sunucu da sahipliği aynı tek
 * gerçekten okur. Sıra numarası önde çünkü aynı adı taşıyan iki dosya
 * ('cv.pdf') aksi hâlde birbirini ezerdi.
 */
export function bulkStoragePath(uid, token, index, originalName) {
    return `bulk-imports/${uid}/${token}/${index}-${sanitizeStorageName(originalName)}`;
}

/** Tek başına boyut sınırını aşan dosyalar — yüklemeye hiç başlanmamalı. */
export function oversizedFiles(files, maxBytes = MAX_SOURCE_BYTES) {
    return (files || []).filter((f) => (Number(f?.size) || 0) > maxBytes);
}

/** '3.2 MB' style human-readable size. */
export function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    if (n >= 1024) return `${Math.round(n / 1024)} KB`;
    return `${n} B`;
}

/** Total size of a file list in bytes. */
export function totalBytes(files) {
    return files.reduce((sum, f) => sum + (Number(f?.size) || 0), 0);
}
