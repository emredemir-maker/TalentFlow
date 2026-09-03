// ŞİRKET ÖNBELLEĞİ — asıl iş maliyeti tutmak.
//
// Havuzdaki şirketler çok tekrar ediyor. Önbellek ıskalarsa arıza SESSİZ:
// hiçbir şey bozulmaz, sadece her tarama tekrar para yakar. Bu yüzden
// buradaki testlerin çoğu "kaç canlı arama yapıldı" sayıyor.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDoc = vi.fn();
const setDoc = vi.fn();
const deleteDoc = vi.fn();

vi.mock('firebase/firestore', () => ({
    doc: (_db, path, id) => ({ path, id }),
    getDoc: (...args) => getDoc(...args),
    setDoc: (...args) => setDoc(...args),
    deleteDoc: (...args) => deleteDoc(...args),
}));
vi.mock('../config/firebase', () => ({ db: {} }));

const {
    docIdFor, isFresh, resolveCompanies, readCompanyIntel,
    saveManualCompanyIntel, clearManualCompanyIntel,
    FRESH_DAYS, FRESH_DAYS_WITHHELD, MAX_LOOKUPS,
} = await import('./companyIntelStore');

const NOW = Date.parse('2026-08-18T00:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

const miss = () => ({ exists: () => false });
const hit = (data) => ({ exists: () => true, data: () => data });

beforeEach(() => {
    getDoc.mockReset();
    setDoc.mockReset();
    deleteDoc.mockReset();
    getDoc.mockResolvedValue(miss());
    setDoc.mockResolvedValue(undefined);
    deleteDoc.mockResolvedValue(undefined);
});

describe('docIdFor', () => {
    // Kimlik değişirse tüm önbellek ıskalanır ve yeniden ücret ödenir.
    it('produces a stable, Firestore-safe id', () => {
        expect(docIdFor('delta yazilim')).toBe('delta-yazilim');
        expect(docIdFor('a/b.c#d')).toBe('a-b-c-d');
    });

    it('returns null for an empty key', () => {
        expect(docIdFor('')).toBeNull();
        expect(docIdFor('   ')).toBeNull();
        expect(docIdFor(null)).toBeNull();
    });
});

describe('isFresh', () => {
    it('keeps a found record for the long window', () => {
        expect(isFresh({ resolvedAt: daysAgo(FRESH_DAYS - 1) }, NOW)).toBe(true);
        expect(isFresh({ resolvedAt: daysAgo(FRESH_DAYS + 1) }, NOW)).toBe(false);
    });

    // Negatif sonucu altı ay dondurmak yanlış: şirket bu arada web sitesi
    // açmış olabilir.
    it('expires a not-found record much sooner', () => {
        const at = daysAgo(FRESH_DAYS_WITHHELD + 1);
        expect(isFresh({ resolvedAt: at, withheld: true }, NOW)).toBe(false);
        expect(isFresh({ resolvedAt: at, withheld: false }, NOW)).toBe(true);
    });

    it('treats a missing or broken timestamp as stale', () => {
        expect(isFresh({}, NOW)).toBe(false);
        expect(isFresh({ resolvedAt: 'dün' }, NOW)).toBe(false);
        expect(isFresh(null, NOW)).toBe(false);
    });
});

describe('readCompanyIntel', () => {
    it('does not let a cache failure break the caller', async () => {
        getDoc.mockRejectedValue(new Error('permission denied'));
        await expect(readCompanyIntel('infoset')).resolves.toBeNull();
    });
});

describe('resolveCompanies', () => {
    const companies = [{ key: 'infoset', name: 'Infoset' }, { key: 'delta', name: 'Delta' }];
    const resolve = vi.fn(async (name) => ({ name, exists: 'evet', resolvedAt: new Date().toISOString() }));

    beforeEach(() => resolve.mockClear());

    it('serves a fresh cache hit without searching', async () => {
        getDoc.mockResolvedValue(hit({ name: 'Infoset', resolvedAt: daysAgo(1) }));
        const r = await resolveCompanies(companies, { resolve });
        expect(resolve).not.toHaveBeenCalled();
        expect(r.fromCache).toBe(2);
        expect(r.looked).toBe(0);
    });

    it('searches and writes back on a miss', async () => {
        const r = await resolveCompanies(companies, { resolve });
        expect(resolve).toHaveBeenCalledTimes(2);
        expect(setDoc).toHaveBeenCalledTimes(2);
        expect(r.looked).toBe(2);
    });

    it('re-searches a stale record', async () => {
        getDoc.mockResolvedValue(hit({ name: 'Infoset', resolvedAt: daysAgo(FRESH_DAYS + 10) }));
        await resolveCompanies(companies, { resolve });
        expect(resolve).toHaveBeenCalledTimes(2);
    });

    it('force önbellekteki OTOMATİK kaydı yok sayar', async () => {
        // SÖZLEŞME DEĞİŞTİ: force artık önbelleği OKUYOR ama otomatik kaydı
        // kullanmıyor. Okuma şart, çünkü kaydın elle girilmiş olup olmadığı
        // ancak okunarak anlaşılır ve elle girilen kayıt force ile de
        // ezilmemeli (bkz. "yeniden tara elle girileni ezmez" testi).
        // Bedeli şirket başına bir Firestore okuması; alternatifi bir insanın
        // araştırıp yazdığı bilgiyi sessizce silmekti.
        getDoc.mockResolvedValue(hit({ name: 'Infoset', resolvedAt: daysAgo(1) }));
        await resolveCompanies(companies, { resolve, force: true });
        expect(resolve).toHaveBeenCalledTimes(2);
    });

    // 20 görevli bir CV'de tavan olmasa tek tıkla 20 grounded çağrı gider.
    it('stops at the lookup cap and REPORTS what it skipped', async () => {
        const many = Array.from({ length: 5 }, (_, i) => ({ key: `k${i}`, name: `Şirket ${i}` }));
        const r = await resolveCompanies(many, { resolve, maxLookups: 2 });
        expect(r.looked).toBe(2);
        expect(r.skipped).toEqual(['Şirket 2', 'Şirket 3', 'Şirket 4']);
    });

    // Önbellekten gelen kayıt tavana sayılmaz — yoksa taze bir önbellek
    // sonraki şirketlerin taranmasını engellerdi.
    it('does not spend the cap on cache hits', async () => {
        getDoc
            .mockResolvedValueOnce(hit({ resolvedAt: daysAgo(1) }))
            .mockResolvedValue(miss());
        const r = await resolveCompanies(companies, { resolve, maxLookups: 1 });
        expect(r.fromCache).toBe(1);
        expect(r.looked).toBe(1);
        expect(r.skipped).toEqual([]);
    });

    it('records a failed lookup instead of aborting the run', async () => {
        resolve.mockRejectedValueOnce(new Error('kota doldu'));
        const r = await resolveCompanies(companies, { resolve });
        expect(r.failed).toEqual([{ name: 'Infoset', error: 'kota doldu' }]);
        expect(r.intel.has('Delta')).toBe(true);
    });

    it('exposes results under both the key and the original name', async () => {
        const r = await resolveCompanies([{ key: 'infoset', name: 'Infoset A.Ş.' }], { resolve });
        expect(r.intel.get('infoset')).toBeTruthy();
        expect(r.intel.get('Infoset A.Ş.')).toBeTruthy();
    });

    it('reports progress and survives an empty list', async () => {
        const onProgress = vi.fn();
        const r = await resolveCompanies([], { resolve, onProgress });
        expect(r.looked).toBe(0);
        expect(onProgress).toHaveBeenCalledWith(0, 0);
    });

    it('has a sane default cap', () => {
        expect(MAX_LOOKUPS).toBeGreaterThan(0);
        expect(MAX_LOOKUPS).toBeLessThanOrEqual(20);
    });
});


describe('elle doğrulanan şirket kaydı', () => {
    const manuel = (extra = {}) => ({
        name: 'Delta Yazılım',
        source: 'manual',
        website: 'https://delta.com.tr',
        manual: { by: 'İK', at: daysAgo(500), note: 'Sicilden baktım' },
        resolvedAt: daysAgo(500),
        ...extra,
    });

    it('BAYATLAMAZ — tazelik süresi dolsa bile geçerli', () => {
        // Yeniden aratmak bir şey kazandırmaz: arama zaten bulamadığı için
        // insan girmişti. Süre dolunca aramaya düşmek, girilen bilgiyi
        // sessizce silmek olurdu.
        expect(isFresh(manuel(), NOW)).toBe(true);
        expect(isFresh({ resolvedAt: daysAgo(FRESH_DAYS + 1) }, NOW)).toBe(false);
    });

    it('"YENİDEN TARA" ELLE GİRİLENİ EZMEZ', async () => {
        getDoc.mockResolvedValue(hit(manuel()));
        const resolve = vi.fn();
        const out = await resolveCompanies([{ key: 'delta yazilim', name: 'Delta Yazılım' }], {
            force: true,
            resolve,
        });
        expect(resolve).not.toHaveBeenCalled();
        expect(out.looked).toBe(0);
        expect(out.fromCache).toBe(1);
        expect(out.intel.get('Delta Yazılım').source).toBe('manual');
    });

    it('otomatik kayıt force ile hâlâ yeniden aranıyor', async () => {
        getDoc.mockResolvedValue(hit({ name: 'Delta', resolvedAt: daysAgo(1) }));
        const resolve = vi.fn(async (name) => ({ name, resolvedAt: new Date(NOW).toISOString() }));
        const out = await resolveCompanies([{ key: 'delta yazilim', name: 'Delta Yazılım' }], {
            force: true,
            resolve,
        });
        expect(resolve).toHaveBeenCalledTimes(1);
        expect(out.looked).toBe(1);
    });

    it('kaydederken MERGE KULLANILMIYOR — melez kayıt oluşmasın', async () => {
        await saveManualCompanyIntel('delta yazilim', manuel());
        expect(setDoc).toHaveBeenCalledTimes(1);
        // Üçüncü argüman (merge seçeneği) verilmemiş olmalı.
        expect(setDoc.mock.calls[0][2]).toBeUndefined();
        expect(setDoc.mock.calls[0][1].key).toBe('delta yazilim');
    });

    it('kaydetme hatası YUTULMUYOR — kullanıcı formu doldurdu, bilmeli', async () => {
        setDoc.mockRejectedValue(new Error('izin yok'));
        await expect(saveManualCompanyIntel('delta yazilim', manuel())).rejects.toThrow('izin yok');
    });

    it('kaldırma dokümanı tamamen siliyor', async () => {
        await clearManualCompanyIntel('delta yazilim');
        expect(deleteDoc).toHaveBeenCalledTimes(1);
        expect(deleteDoc.mock.calls[0][0].id).toBe('delta-yazilim');
    });

    it('geçersiz şirket adı sessizce başarılı sayılmıyor', async () => {
        await expect(saveManualCompanyIntel('   ', manuel())).rejects.toThrow();
        await expect(clearManualCompanyIntel('')).rejects.toThrow();
    });
});
