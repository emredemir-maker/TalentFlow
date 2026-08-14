// KAYNAK DOSYALARI KAYITLARA AÇ — eskiden HTTP isteğinin içindeydi, artık
// worker'da.
//
// Yer değiştirmesinin sebebi bulkSources.js'te yazılı: Hosting rewrite isteği
// 60 saniyede kesiyordu ve ZIP açma + her PDF'in metnini çıkarma işi o saatin
// içinde koşuyordu. Burada saat işlemiyor — worker'a CPU'yu istemcinin
// keepalive long-poll zinciri sağlıyor (routes/bulk.js `?wait=1`).
//
// SIRALAMA GÜVENLİK GEREĞİDİR: açma TAMAMEN bitmeden hiçbir kayıt işlenmez.
// Böylece açma yarıda kalıp iş yeniden kuyruğa girdiğinde baştan açmak
// güvenlidir — üzerine yazdığımız kayıtların hiçbiri henüz işlenmemiştir.
// Kayıt kimlikleri sırayla (`String(index)`) verildiği için tekrar açma kopya
// üretmez, aynı belgeyi tazeler.

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');

/** Firestore batch sınırı 500; başlık payı bırakıp 400'de tutuyoruz. */
export const ITEM_CHUNK = 400;

/** Tek işin üretebileceği kayıt tavanı — bozuk bir arşiv koleksiyonu şişirmesin. */
export const MAX_ITEMS = 2000;

const CV_EXT = new Set(['pdf', 'docx']);

/**
 * ZIP içindeki gerçek CV girdileri.
 *
 * macOS'ta sıkıştırılan arşivler her dosyanın yanına `__MACOSX/._ad.pdf`
 * şeklinde bir kaynak-çatal ikizi koyar. Bu girdiler `.pdf` ile bittiği ve
 * klasör olmadığı için eski süzgeçten GEÇİYORDU: birkaç yüz baytlık ikiz,
 * CV sanılıp Gemini'ye gönderiliyor, her gerçek adayın yanında bir de içi boş
 * hayalet aday üretiyordu. Nokta ile başlayan girdiler de aynı sebeple elenir.
 *
 * @param {Buffer} buffer
 * @returns {Array<{name: string, ext: string, read: () => Buffer}>}
 */
export function zipCvEntries(buffer) {
    const zip = new AdmZip(buffer);
    const out = [];
    for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue;
        const parts = entry.entryName.split('/');
        const base = parts[parts.length - 1];
        if (!base || base.startsWith('.')) continue;
        if (parts.includes('__MACOSX')) continue;
        const ext = (base.toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
        if (!CV_EXT.has(ext)) continue;
        out.push({ name: base, ext, read: () => entry.getData() });
    }
    return out;
}

/** Diziyi en fazla `size` uzunluğunda parçalara böler. */
export function chunk(list, size = ITEM_CHUNK) {
    const out = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
}

/**
 * Kaynakları kayıtlara açar.
 *
 * Bağımlılıklar dışarıdan verilir: Storage ve Firestore olmadan test
 * edilebilsin diye. Toplam sayı ancak arşivler açıldıkça bilinir, bu yüzden
 * `onProgress` büyüyen bir toplam bildirir — bulunmamış bir sayıyı baştan
 * biliyormuş gibi göstermek, ölçülmemiş bir şeyi ölçülmüş göstermek olurdu.
 *
 * Metni okunamayan dosya SESSİZCE DÜŞMEZ: 'error' durumunda bir kayıt olarak
 * yazılır ve iş raporunda görünür. Aksi halde 40 CV yükleyip 37 aday gören
 * kullanıcı, eksik üçünün neden yok olduğunu hiçbir yerden öğrenemezdi.
 *
 * @param {object} deps
 * @param {Array<{storagePath:string, originalName:string, ext:string}>} deps.sources
 * @param {(storagePath: string) => Promise<Buffer>} deps.downloadSource
 * @param {(buffer: Buffer, ext: string) => Promise<string>} deps.extractText
 * @param {(items: Array<object>) => Promise<void>} deps.writeItems
 * @param {(progress: {totalCount:number, unpackedCount:number}) => Promise<void>} [deps.onProgress]
 * @param {(storagePath: string) => Promise<void>} [deps.cleanupSource]
 * @returns {Promise<{totalCount:number, failedCount:number, truncated:boolean}>}
 */
export async function expandJobSources({
    sources,
    downloadSource,
    extractText,
    writeItems,
    onProgress,
    cleanupSource,
    maxItems = MAX_ITEMS,
    chunkSize = ITEM_CHUNK,
}) {
    let index = 0;
    let failedCount = 0;
    let truncated = false;
    let pending = [];

    const flush = async () => {
        if (pending.length === 0) return;
        for (const part of chunk(pending, chunkSize)) await writeItems(part);
        pending = [];
        if (onProgress) await onProgress({ totalCount: index, unpackedCount: index });
    };

    for (const source of sources) {
        if (truncated) break;
        let entries;
        try {
            const buffer = await downloadSource(source.storagePath);
            entries = source.ext === 'zip'
                ? zipCvEntries(buffer)
                : [{ name: source.originalName, ext: source.ext, read: () => buffer }];
        } catch (err) {
            // Kaynağın kendisi okunamadı: tek bir 'error' kaydı bırak ki iş
            // "0 aday" ile sessizce bitmesin.
            pending.push({
                index: index++,
                originalName: source.originalName,
                status: 'error',
                error: `Dosya okunamadı: ${err.message}`,
            });
            failedCount++;
            continue;
        }

        for (const entry of entries) {
            if (index >= maxItems) { truncated = true; break; }
            try {
                const text = (await extractText(entry.read(), entry.ext)).slice(0, 15000);
                // 200 karakterlik alt sınır: taranmış (görüntü) PDF'ler ve
                // yarım okunan dosyalar birkaç kırıntı döndürüyor; bunları CV
                // sanıp Gemini'ye göndermek hem para hem de uydurma aday demek.
                if (text.trim().length < 200) {
                    throw new Error(`CV metni çok kısa (${text.trim().length} karakter, min 200) — taranmış görüntü PDF olabilir`);
                }
                pending.push({ index: index++, originalName: entry.name, cvText: text, status: 'pending' });
            } catch (err) {
                pending.push({
                    index: index++,
                    originalName: entry.name,
                    status: 'error',
                    error: `Metin çıkarılamadı: ${err.message}`,
                });
                failedCount++;
            }
            if (pending.length >= chunkSize) await flush();
        }

        // Kaynak açıldı, metinler Firestore'da: Storage kopyası artık gereksiz.
        // Yalnızca BAŞARILI açmadan sonra silinir — okunamayan dosya yerinde
        // kalsın ki yeniden denenebilsin.
        if (cleanupSource) {
            try { await cleanupSource(source.storagePath); } catch { /* temizlik hatası işi durdurmaz */ }
        }
    }

    await flush();
    return { totalCount: index, failedCount, truncated };
}
