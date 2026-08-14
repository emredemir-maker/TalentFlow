// Toplu içe aktarma dosyalarını Firebase Storage'a yükler.
//
// Bu yol Hosting rewrite'ından GEÇMEZ: ne 32MB gövde sınırı ne de 60 saniyelik
// kesme uygulanır. API'ye sonradan yalnızca dosya YOLU gönderilir ve o istek
// milisaniyeler içinde döner. Gerekçenin tamamı: functions/services/bulkSources.js.
//
// Yükleme sürüyor diye ekranın donmaması önemli: 500 CV'lik bir arşiv
// dakikalarca sürebilir ve "bir şey olmuyor" hissi kullanıcıyı sekmeyi
// kapatmaya iter. `onProgress` gerçek bayt oranını bildirir — tahmini bir
// yüzde değil, aktarılan/toplam.

import { ref, uploadBytesResumable } from 'firebase/storage';

import { storage } from '../config/firebase';
import { bulkStoragePath } from '../utils/bulkUpload';

/** Bu yükleme turunu diğerlerinden ayıran kimlik. */
function newToken() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `t${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

/**
 * Dosyaları Storage'a yükler ve sunucuya bildirilecek kaynak listesini döner.
 *
 * TEK BİR DOSYA BAŞARISIZ OLURSA TÜM YÜKLEME DÜŞER. Yarım bir liste ile iş
 * açmak, kullanıcının yüklediğini sandığı adayların sessizce yok olması
 * demekti; eksik dosyayı adıyla söyleyip durmak dürüst olan.
 *
 * @param {File[]} files
 * @param {string} uid — oturum açmış kullanıcı; yolun içine girer
 * @param {{onProgress?: (p: {transferred:number, total:number, done:number}) => void, concurrency?: number}} [options]
 * @returns {Promise<Array<{storagePath:string, originalName:string, size:number}>>}
 */
export async function uploadBulkSources(files, uid, options = {}) {
    const { onProgress, concurrency = 3 } = options;
    if (!storage) throw new Error('Firebase Storage yapılandırılmamış.');
    if (!uid) throw new Error('Oturum bilgisi çözümlenemedi.');

    const list = Array.from(files || []);
    if (list.length === 0) return [];

    const token = newToken();
    const total = list.reduce((sum, f) => sum + (Number(f?.size) || 0), 0);
    const transferred = new Array(list.length).fill(0);
    const sources = new Array(list.length);
    let done = 0;

    const report = () => {
        if (!onProgress) return;
        onProgress({ transferred: transferred.reduce((a, b) => a + b, 0), total, done });
    };

    const uploadOne = async (index) => {
        const file = list[index];
        const storagePath = bulkStoragePath(uid, token, index, file.name);
        const task = uploadBytesResumable(ref(storage, storagePath), file);
        await new Promise((resolve, reject) => {
            task.on(
                'state_changed',
                (snap) => { transferred[index] = snap.bytesTransferred; report(); },
                (err) => reject(new Error(`${file.name} yüklenemedi: ${err.code || err.message}`)),
                resolve
            );
        });
        transferred[index] = Number(file.size) || 0;
        done += 1;
        report();
        sources[index] = { storagePath, originalName: file.name, size: Number(file.size) || 0 };
    };

    let next = 0;
    await Promise.all(
        Array.from({ length: Math.min(concurrency, list.length) }, async () => {
            while (next < list.length) {
                const index = next;
                next += 1;
                await uploadOne(index);
            }
        })
    );

    return sources;
}
