// TOPLU İÇE AKTARMANIN GİRİŞ KAPISI — dosya artık istek gövdesinde gelmiyor.
//
// Eski akış, tek bir HTTP isteğinin içinde ZIP'i açıyor VE içindeki her PDF'in
// metnini çıkarıyordu; cevap ancak hepsi bitince dönüyordu. Bu yolun üstünde
// kodun hiç göremediği iki sert duvar vardı:
//
//   1. Cloud Functions gövde sınırı 32MB. Aşan istek Google'ın önyüzünde düz
//      metin "Internal Error" ile ölüyor — log yok, yakalanacak hata yok.
//   2. Firebase Hosting rewrite 60 saniyede kesiyor. Kod 300 saniye varsayıyor
//      (functions/index.js timeoutSeconds) ama Hosting'den geçen istek o
//      süreyi hiç görmüyor. Yükleme süresi de bu saatin İÇİNDE: 28MB'ı
//      göndermek ev bağlantısında 20-45 saniye yiyor, çıkarmaya çok az kalıyor.
//
// İstemcideki 28MB'lık parçalama yalnızca BİRİNCİ duvara çareydi. İkincisine
// değildi — üstelik küçük ZIP'leri 28MB'a kadar aynı isteğe topladığı için
// süre açısından tek büyük ZIP ile birebir aynı sonucu veriyordu.
//
// Zaman aşımının en kötü yanı sessiz olması değil, YANILTICI olmasıydı: istek
// kesildiğinde istemci "Toplu yükleme başlatılamadı" gösteriyor, oysa sunucu
// çalışmaya devam edip işi oluşturabiliyordu. Kullanıcı olmayan bir hatayı
// çözmeye, var olan bir işi de görmemeye başlıyordu.
//
// YENİ AKIŞ: dosya tarayıcıdan DOĞRUDAN Firebase Storage'a gider — bu yol
// Hosting rewrite'ından geçmez, dolayısıyla iki sınır da uygulanmaz. API'ye
// yalnızca YOL gönderilir ve istek milisaniyeler içinde cevap döner. Açma ve
// metin çıkarma işini worker yapar; orada HTTP saati işlemiyor.

/** Storage'da toplu yüklemelerin kökü. */
export const BULK_PREFIX = 'bulk-imports';

/** Tek istekte bildirilebilecek kaynak dosya sayısı. */
export const MAX_SOURCES = 50;

/** Tek kaynak dosya için üst sınır (Storage kuralıyla aynı olmalı). */
export const MAX_SOURCE_BYTES = 200 * 1024 * 1024;

const ALLOWED_EXT = new Set(['pdf', 'docx', 'zip']);

/** Dosya adının küçük harfe indirgenmiş uzantısı ('' if none). */
export function extensionOf(name) {
    const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
}

/**
 * Bu kullanıcının yazabileceği Storage kökü.
 *
 * Yolun İÇİNDE uid taşınması tesadüf değil: hem Storage kuralı hem sunucu
 * doğrulaması aynı tek gerçeği okur, ikisinin ayrışma ihtimali kalmaz.
 */
export function bulkPrefixFor(uid) {
    return `${BULK_PREFIX}/${uid}/`;
}

/**
 * İstemcinin bildirdiği kaynakları doğrula.
 *
 * SAHİPLİK BURADA KANITLANIR. İstemci yalnızca bir YOL gönderiyor; o yolun
 * kime ait olduğunu sormadan indirmek, "başkasının dosyasını bana oku" demenin
 * kestirme yolu olurdu. Bu projede aynı sınıf hatayı (kullanıcı kimliğini
 * istekten okumak) OAuth ucunda bir kez düzelttik; burada baştan kapatıyoruz.
 * Kimlik DOĞRULANMIŞ tokendan gelir, gövdeden değil.
 *
 * @param {unknown} raw — istek gövdesindeki sources alanı
 * @param {string} uid — requireAuth'un çözdüğü kullanıcı
 * @returns {{sources: Array<{storagePath:string, originalName:string, size:number, ext:string}>, error: string|null}}
 */
export function parseSources(raw, uid) {
    const fail = (error) => ({ sources: [], error });

    if (!uid) return fail('Kimlik çözümlenemedi.');
    if (!Array.isArray(raw)) return fail('sources bir dizi olmalıdır.');
    if (raw.length === 0) return fail('İşlenecek dosya bulunamadı.');
    if (raw.length > MAX_SOURCES) {
        return fail(`Tek seferde en fazla ${MAX_SOURCES} dosya bildirilebilir (${raw.length} geldi).`);
    }

    const prefix = bulkPrefixFor(uid);
    const seen = new Set();
    const sources = [];

    for (const entry of raw) {
        const storagePath = String(entry?.storagePath || '').trim();
        const originalName = String(entry?.originalName || '').trim();
        const size = Number(entry?.size) || 0;

        if (!storagePath) return fail('Kaynaklardan birinde storagePath yok.');
        // '..' ve mutlak yol, prefix kontrolünü atlatmanın klasik iki yolu.
        if (storagePath.includes('..') || storagePath.startsWith('/')) {
            return fail('storagePath geçersiz karakter içeriyor.');
        }
        if (!storagePath.startsWith(prefix)) {
            return fail('storagePath bu kullanıcıya ait değil.');
        }
        if (seen.has(storagePath)) return fail('Aynı dosya iki kez bildirilmiş.');
        seen.add(storagePath);

        const ext = extensionOf(originalName) || extensionOf(storagePath);
        if (!ALLOWED_EXT.has(ext)) {
            return fail(`Desteklenmeyen dosya türü: ${originalName || storagePath}. PDF, DOCX veya ZIP olmalı.`);
        }
        if (size > MAX_SOURCE_BYTES) {
            return fail(`${originalName || storagePath} boyut sınırını aşıyor.`);
        }

        sources.push({ storagePath, originalName: originalName || storagePath.split('/').pop(), size, ext });
    }

    return { sources, error: null };
}
