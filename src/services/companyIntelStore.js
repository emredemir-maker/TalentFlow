// ŞİRKET İSTİHBARATI ÖNBELLEĞİ.
//
// Şirket çözümlemesi grounded arama demek: yavaş ve ücretli. Ama havuzdaki
// şirketler ÇOK TEKRAR EDİYOR — "Trendyol", "Getir", "Turkcell" onlarca CV'de
// geçiyor. Aynı şirketi her aday için yeniden aratmak, aynı soruyu yüz kez
// sorup yüz kez ödemek olurdu.
//
// Önbellek adayın değil ŞİRKETİN altında duruyor: bir kez çözümlenen şirket
// tüm adaylara hizmet eder. İlk taramada pahalı, sonra bedava.
//
// ── NEGATİF SONUÇ DA ÖNBELLEKLENİR, AMA KISA SÜRELİ ─────────────────────────
// "Bulunamadı" da bir sonuçtur ve tekrar aratmak aynı parayı yakar. Ama
// negatif sonucu altı ay dondurmak yanlış: şirket bu arada web sitesi açmış,
// bir haberde geçmiş olabilir. Bulunan kayıt 180 gün, bulunamayan 30 gün
// tazedir.

import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

import { db } from '../config/firebase';
import { resolveCompany, companyKey } from './ai/companyIntel';
import { isManualRecord } from '../utils/manualCompanyIntel';
import { getLogger } from './logger';

const log = getLogger('companyIntel');

const INTEL_PATH = 'artifacts/talent-flow/public/data/companyIntel';

/** Bulunan kaydın tazelik süresi. Şirket bilgisi hızlı değişmez. */
export const FRESH_DAYS = 180;

/** Bulunamayan kaydın tazelik süresi — web bu arada değişmiş olabilir. */
export const FRESH_DAYS_WITHHELD = 30;

/**
 * Tek çalıştırmada yapılacak en fazla CANLI arama.
 *
 * Önbellekten gelen kayıt bu tavana SAYILMAZ; tavan yalnızca yeni aramaları
 * sınırlar. 20 görevli bir CV'de tavan olmasa tek tıkla 20 grounded çağrı
 * gider. Tavana takılan şirketler rapora "taranmadı" olarak yazılır —
 * sessizce atlanmaz.
 */
export const MAX_LOOKUPS = 8;

/**
 * Firestore doküman kimliği.
 *
 * companyKey boşluk içerebiliyor ve doküman kimliğinde '/' yasak. Kimlik
 * kararlı olmalı: değişirse tüm önbellek ıskalanır ve yeniden ücret ödenir.
 */
export function docIdFor(key) {
    const id = String(key || '').trim().replace(/[/\\.#$[\]]+/g, ' ').replace(/\s+/g, '-').slice(0, 200);
    return id || null;
}

/** Kayıt hâlâ taze mi? */
export function isFresh(record, now = Date.now()) {
    // ELLE GİRİLEN KAYIT BAYATLAMAZ. Tazelik süresi "bu bilgiyi yeniden
    // aratmanın maliyeti, eskimiş olma riskine değer mi" sorusunun cevabı.
    // Elle girilen kayıtta yeniden arama bir şey kazandırmaz: zaten arama
    // bulamadığı için insan girmişti. Süre dolunca sessizce aramaya düşmek,
    // İK'nın yazdığı bilgiyi bir gün fark ettirmeden silmek olurdu.
    if (isManualRecord(record)) return true;
    if (!record?.resolvedAt) return false;
    const at = Date.parse(record.resolvedAt);
    if (!Number.isFinite(at)) return false;
    const days = record.withheld ? FRESH_DAYS_WITHHELD : FRESH_DAYS;
    return now - at < days * 24 * 60 * 60 * 1000;
}

/** Önbellekten okur; yoksa ya da okunamazsa null. */
export async function readCompanyIntel(key) {
    const id = docIdFor(key);
    if (!id) return null;
    try {
        const snap = await getDoc(doc(db, INTEL_PATH, id));
        return snap.exists() ? snap.data() : null;
    } catch (err) {
        // Önbellek okunamıyorsa iş DURMAZ — canlı aramaya düşeriz.
        log.warn(`önbellek okunamadı (${id}): ${err?.message}`);
        return null;
    }
}

/** Önbelleğe yazar. Yazma başarısız olursa sonuç yine kullanılır. */
export async function writeCompanyIntel(key, record) {
    const id = docIdFor(key);
    if (!id) return;
    try {
        await setDoc(doc(db, INTEL_PATH, id), { ...record, key }, { merge: true });
    } catch (err) {
        log.warn(`önbelleğe yazılamadı (${id}): ${err?.message}`);
    }
}

/**
 * Şirket listesini çözümler — önce önbellek, sonra canlı arama.
 *
 * @param {Array<{key: string, name: string}>} companies uniqueCompanies() çıktısı
 * @param {object} options
 *   hint      — belirsizliği azaltan ek bağlam (şehir, rol)
 *   force     — önbelleği yok say, hepsini yeniden ara
 *   maxLookups— canlı arama tavanı
 *   resolve   — testler için enjekte edilebilir çözümleyici
 *   onProgress— (done, total) ilerleme geri çağrısı
 * @returns {Promise<{intel: Map, fromCache: number, looked: number, skipped: Array, failed: Array}>}
 *   intel: hem companyKey hem ORİJİNAL AD ile erişilebilir — sectorFit
 *   birleştirmesi CV'deki ham adı kullanıyor.
 *   skipped: tavana takıldığı için taranmayanlar; rapor bunu YAZMAK zorunda.
 */
export async function resolveCompanies(companies, {
    hint = '',
    force = false,
    maxLookups = MAX_LOOKUPS,
    resolve = resolveCompany,
    onProgress = null,
} = {}) {
    const list = Array.isArray(companies) ? companies : [];
    const intel = new Map();
    const skipped = [];
    const failed = [];
    let fromCache = 0;
    let looked = 0;

    for (let i = 0; i < list.length; i += 1) {
        const { key, name } = list[i];
        onProgress?.(i, list.length);

        // ELLE GİRİLEN KAYIT `force` İLE DE EZİLMEZ. "Yeniden tara" düğmesi
        // önbelleği tazelemek için var; bir insanın araştırıp yazdığı bilgiyi
        // sessizce silmek için değil. Otomatik aramaya dönmek isteyen
        // kullanıcı elle doğrulamayı açıkça kaldırır (clearManualCompanyIntel).
        const cached = await readCompanyIntel(key);
        if (isManualRecord(cached) || (!force && isFresh(cached))) {
            intel.set(key, cached);
            intel.set(name, cached);
            fromCache += 1;
            continue;
        }

        if (looked >= maxLookups) {
            skipped.push(name);
            continue;
        }

        looked += 1;
        try {
            const record = await resolve(name, { hint });
            intel.set(key, record);
            intel.set(name, record);
            await writeCompanyIntel(key, record);
        } catch (err) {
            // Tek şirketin çözümlenememesi raporu düşürmez; o şirket
            // "doğrulanamadı" olur ve sebebi rapora yazılır.
            failed.push({ name, error: err?.message || 'Çözümlenemedi' });
        }
    }

    onProgress?.(list.length, list.length);
    return { intel, fromCache, looked, skipped, failed };
}

/**
 * Elle doğrulama kaydını yazar.
 *
 * `merge` KULLANILMIYOR: birleştirme, eski otomatik kaydın alanlarını elle
 * girilen kaydın altında bırakırdı ve ortaya "kaynağı insan" diyen ama
 * verisi makineden gelen melez bir kayıt çıkardı. Elle doğrulama, o şirket
 * için kaydın TAMAMINI değiştirir.
 *
 * @throws yazma başarısız olursa — okuma aksine burada hata YUTULMAZ:
 *   kullanıcı bir form doldurdu, kaydedilmediyse bunu bilmek zorunda.
 */
export async function saveManualCompanyIntel(key, record) {
    const id = docIdFor(key);
    if (!id) throw new Error('Şirket adı kayıt için uygun değil.');
    await setDoc(doc(db, INTEL_PATH, id), { ...record, key });
}

/**
 * Elle doğrulamayı kaldırır — kayıt tamamen silinir.
 *
 * Yalnızca elle girilen alanları temizlemek, altta kalan eski otomatik
 * kaydı "taze" gibi gösterirdi. Dokümanı silmek bir sonraki taramanın
 * şirketi sıfırdan çözümlemesini garanti ediyor; maliyeti tek bir arama.
 */
export async function clearManualCompanyIntel(key) {
    const id = docIdFor(key);
    if (!id) throw new Error('Şirket adı kayıt için uygun değil.');
    await deleteDoc(doc(db, INTEL_PATH, id));
}

export { companyKey };
