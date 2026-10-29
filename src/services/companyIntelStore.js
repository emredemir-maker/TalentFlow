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

import { companyKey, recordFromAnswer } from './ai/companyIntel';
import { getAuthHeaders } from './ai/config';
import { isManualRecord } from '../utils/manualCompanyIntel';
import { getLogger } from './logger';

const log = getLogger('companyIntel');

// ── PLATFORM ÖNBELLEĞİ (K6) ────────────────────────────────────────────────
// Önbellek artık platformda ortak ve SUNUCUDA (platform/companyIntel; istemciye
// kapalı). İstemci okumaz/yazmaz: /api/company-intel/* uçlarını çağırır. Arama
// sorgusu sunucuda yalnız şirket adıyla kurulur — aday bağlamı (`hint`) ortak
// önbelleğe girmez. Elle doğrulama kaydı şirkete özel kalır.

async function intelApi(method, path, body) {
    const res = await fetch(`/api/company-intel/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Şirket bilgisi alınamadı (${res.status})`);
    return data;
}

/** Sunucu yanıtı → kanıt kaydı (elle kayıt olduğu gibi). */
function recordFrom(name, data) {
    if (data?.source === 'manual') return data.record || null;
    if (data?.source === 'cache' || data?.source === 'live') return recordFromAnswer(name, data.answer, data.resolvedAt);
    return null;
}

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

/**
 * Önbellekten okur (şirketin elle kaydı ya da taze ortak kayıt); yoksa ya da
 * okunamazsa null. Canlı arama YAPMAZ.
 */
export async function readCompanyIntel(name) {
    if (!docIdFor(companyKey(name))) return null;
    try {
        return recordFrom(name, await intelApi('POST', 'resolve', { name, cacheOnly: true }));
    } catch (err) {
        // Önbellek okunamıyorsa iş DURMAZ — canlı aramaya düşeriz.
        log.warn(`önbellek okunamadı (${name}): ${err?.message}`);
        return null;
    }
}

/** Canlı (kaynaklı) arama — sunucu sorar ve ortak önbelleğe yazar. */
export async function lookupCompanyLive(name, { force = false } = {}) {
    return recordFrom(name, await intelApi('POST', 'resolve', { name, force }));
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
    // `hint` artık sorguya girmiyor (ortak önbellek, K6); imza uyumu için duruyor.
    // eslint-disable-next-line no-unused-vars
    hint = '',
    force = false,
    maxLookups = MAX_LOOKUPS,
    resolve = (name) => lookupCompanyLive(name, { force }),
    read = readCompanyIntel,
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
        const cached = await read(name);
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
            // Sunucu sorgular ve ortak önbelleğe kendisi yazar.
            const record = await resolve(name, { force });
            intel.set(key, record);
            intel.set(name, record);
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
export async function saveManualCompanyIntel(name, record) {
    if (!docIdFor(companyKey(name))) throw new Error('Şirket adı kayıt için uygun değil.');
    // Şirkete özel kayıt (tenants/{t}/companyIntelManual); ortak önbellek değişmez.
    await intelApi('PUT', 'manual', { name, record });
}

/**
 * Elle doğrulamayı kaldırır — kayıt tamamen silinir.
 *
 * Yalnızca elle girilen alanları temizlemek, altta kalan eski otomatik
 * kaydı "taze" gibi gösterirdi. Dokümanı silmek bir sonraki taramanın
 * şirketi sıfırdan çözümlemesini garanti ediyor; maliyeti tek bir arama.
 */
export async function clearManualCompanyIntel(name) {
    if (!docIdFor(companyKey(name))) throw new Error('Şirket adı kayıt için uygun değil.');
    await intelApi('DELETE', 'manual', { name });
}

export { companyKey };
