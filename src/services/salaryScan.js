// TOPLU TARAMANIN HIZI — sunucunun limiti kadar.
//
// Sunucudaki aiLimiter dakikada 20 istek geçiriyor (functions/middleware/
// rateLimit.js). 60 satırlık bir taramayı olabildiğince hızlı sürmek, ilk 20
// çağrıdan sonra 429 duvarına toslamak demek: fetchWithRetry üç kez dener,
// üçü de aynı dakikaya düşer ve satır "tarama yapılamadı" ile kapanır.
// Kullanıcı bunu "modelin bulamadığı" sanır — oysa çağrı hiç yapılmamıştır.
//
// O yüzden tarama BİLEREK YAVAŞ: çağrılar arasında sabit bir aralık var ve
// ekranda kalan süre yazıyor. Bekleyen bir ilerleme çubuğu, sessizce yarısı
// düşmüş bir listeden iyidir.
//
// Sıralı çalışıyor (eşzamanlılık yok): tek bir çağrı zaten 2-5 saniye sürüyor,
// aralık 4 saniye. Paralellik burada hız kazandırmaz, yalnızca limiti aşar.

/** Dakikada kaç çağrı — sunucu 20 veriyor, pay bırakıyoruz. */
export const CALLS_PER_MINUTE = 15;

/** İki çağrının BAŞLANGIÇLARI arasındaki en az süre. */
export const MIN_INTERVAL_MS = Math.ceil(60000 / CALLS_PER_MINUTE);

const defaultSleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Kaba süre tahmini — ekranda "≈ 4 dk" yazabilmek için. */
export function estimateMs(rowCount, minIntervalMs = MIN_INTERVAL_MS) {
    const n = Math.max(0, Number(rowCount) || 0);
    return n === 0 ? 0 : (n - 1) * minIntervalMs + minIntervalMs;
}

/**
 * Satırları sırayla tarar.
 *
 * Bir satırın hatası taramayı DURDURMAZ: hata o satıra yazılır, sıra devam
 * eder. Tek bir 502 yüzünden 59 satırı taramadan bırakmak, kullanıcıyı en
 * baştan başlatır.
 *
 * @param {Array} rows
 * @param {{
 *   extract: (row: object) => Promise<object|null>,
 *   onStart?: (row: object) => void,
 *   onResult?: (row: object, result: object) => void,
 *   onProgress?: (progress: {done: number, total: number}) => void,
 *   shouldStop?: () => boolean,
 *   minIntervalMs?: number,
 *   sleep?: (ms: number) => Promise<void>,
 *   now?: () => number,
 * }} options
 * @returns {Promise<{done:number, found:number, none:number, failed:number, stopped:boolean}>}
 */
export async function scanRows(rows = [], {
    extract,
    onStart,
    onResult,
    onProgress,
    shouldStop,
    minIntervalMs = MIN_INTERVAL_MS,
    sleep = defaultSleep,
    now = () => Date.now(),
} = {}) {
    const list = Array.isArray(rows) ? rows : [];
    let done = 0;
    let found = 0;
    let none = 0;
    let failed = 0;

    for (let i = 0; i < list.length; i += 1) {
        // DURDURMA HER SATIRDAN ÖNCE SORULUR. Kullanıcı "dur" dediğinde
        // taranmış satırlar ekranda kalır; onay hâlâ kendisinde.
        if (shouldStop?.()) return { done, found, none, failed, stopped: true };

        const row = list[i];
        // Satır SIRASI GELİNCE "taranıyor" olur. Hepsini baştan işaretlemek,
        // sıralı çalışan bir taramayı paralelmiş gibi gösterirdi.
        onStart?.(row);
        const startedAt = now();
        let result;
        try {
            const hint = await extract(row);
            if (hint) { found += 1; result = { status: 'found', hint }; }
            else { none += 1; result = { status: 'none', hint: null }; }
        } catch (err) {
            failed += 1;
            result = { status: 'error', hint: null, error: err?.message || 'Tarama yapılamadı.' };
        }
        done += 1;
        onResult?.(row, result);
        onProgress?.({ done, total: list.length });

        // Durdurulduysa bekleme: kullanıcı "dur" dedikten sonra ekranı dört
        // saniye daha meşgul tutmanın bir karşılığı yok.
        if (i < list.length - 1 && !shouldStop?.()) {
            const wait = minIntervalMs - (now() - startedAt);
            if (wait > 0) await sleep(wait);
        }
    }

    return { done, found, none, failed, stopped: false };
}
