// CV TARİHLERİ — serbest metin görev sürelerini ölçülebilir aralığa çevirir.
//
// `experiences[].duration` alanı serbest metin: CV'den AI çıkarıyor ve adayın
// kendi yazdığı biçimi koruyor. "Oca 2020 - Mar 2023", "2020-2023",
// "01/2020 – Halen", "Ocak 2020 - Günümüz" — hepsi aynı havuzda.
//
// ── NEDEN AYRI BİR DOSYA ────────────────────────────────────────────────────
// Tutarlılık denetiminin TAMAMI bu ayrıştırmanın doğruluğuna bağlı. Yanlış
// okunan tek bir tarih, "adayın beyanı ile hesaplanan süre çelişiyor" diyen
// bir bayrak üretir — yani bir insanı yalancılıkla suçlar. Bu kadar ağır bir
// çıktının girdisi ayrı ayrı test edilebilir olmalı.
//
// ── AYRIŞTIRILAMAYAN TARİH SESSİZCE ATLANMAZ ────────────────────────────────
// Okunamayan bir aralığı "0 ay" saymak, toplam deneyimi olduğundan küçük
// gösterir ve TAM DA sahtecilik bayrağını tetikler. Bu yüzden ayrıştırma
// başarısızlığı bir SONUÇ olarak yukarı taşınır (null döner) ve rapor
// "ölçüm eksik" der. Bkz. cvConsistency.js — kapsama (coverage) kavramı.

/** Türkçe ay adları — hem tam hem kısaltma. */
const TR_MONTHS = {
    ocak: 1, oca: 1,
    subat: 2, sub: 2,
    mart: 3, mar: 3,
    nisan: 4, nis: 4,
    mayis: 5, may: 5,
    haziran: 6, haz: 6,
    temmuz: 7, tem: 7,
    agustos: 8, agu: 8,
    eylul: 9, eyl: 9,
    ekim: 10, eki: 10,
    kasim: 11, kas: 11,
    aralik: 12, ara: 12,
};

/** İngilizce ay adları — CV'lerin azımsanmayacak kısmı İngilizce. */
const EN_MONTHS = {
    january: 1, jan: 1, february: 2, feb: 2, march: 3,
    april: 4, apr: 4, june: 6, jun: 6, july: 7, jul: 7,
    august: 8, aug: 8, september: 9, sep: 9, sept: 9,
    october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};

// TR sonra gelir: 'may' ve 'mar' iki dilde de aynı sayıya denk düşüyor,
// çakışma zararsız. 'ara' (Aralık) İngilizce bir ay değil; ters sırada
// yazılsaydı TR kısaltmaları İngilizce tam adların altında kalırdı.
const MONTHS = { ...EN_MONTHS, ...TR_MONTHS };

/**
 * "Hâlâ çalışıyor" ifadeleri.
 *
 * Bu listeyi eksik bırakmak pahalı: tanınmayan "Halen", bitiş tarihi YOK
 * sayılır, görev süresi ölçülemez olur ve adayın toplam deneyimi olduğundan
 * KÜÇÜK görünür — yani beyanıyla çelişiyormuş gibi.
 */
const CURRENT_WORDS = [
    'halen', 'devam', 'gunumuz', 'bugun', 'su an', 'suan', 'hala',
    'present', 'current', 'currently', 'now', 'to date', 'ongoing',
];

/**
 * Türkçe harf katlaması — 'İ', 'ı', 'ğ', 'ş' vb. ASCII'ye indirgenir.
 *
 * utils/turkishText.js'teki foldTr ile aynı işi yapar; burada kendi kopyası
 * var çünkü o dosya arama/eşleştirme kurallarını da taşıyor ve bu modülün tek
 * ihtiyacı harf eşleme: ay adı hem "Ağustos" hem "Agustos" olarak geliyor.
 */
const fold = (s) => String(s ?? '')
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
    .replace(/Ş/g, 's').replace(/ş/g, 's')
    .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u').replace(/ü/g, 'u')
    .replace(/Ö/g, 'o').replace(/ö/g, 'o')
    .replace(/Ç/g, 'c').replace(/ç/g, 'c')
    .toLowerCase();

/**
 * TARİHİN İÇİNDEKİ TİRE, AYRAÇ DEĞİLDİR.
 *
 * CV çıkarımının ürettiği en yaygın biçimlerden biri ISO: "2025-06 - 2026-07".
 * Aralık ayracı da tire olduğu için metin dört parçaya bölünüyordu
 * ("2025", "06", "2026", "07"); ilk parça yıl gibi okunuyor, son parça ("07")
 * yıl olmadığı için ayrıştırma başarısız oluyordu.
 *
 * Sonucu canlıda görüldü: beş görevin hiçbirinin tarihi okunamadı, kapsama
 * "ölçüm yapılamadı" oldu ve doğrulama tarafı bu boşluğu SIFIR yıl gibi
 * kullanıp "şirket kuruluşundan önce başlamış" çelişkisi üretti. Yani bir
 * ayrıştırma boşluğu, ekranda beş kırmızı suçlama olarak göründü.
 *
 * Çözüm biçimi tanımak değil, AYRACI TEKİLLEŞTİRMEK: tarihin kendi içindeki
 * tire noktaya çevriliyor. Nokta ayraç listesinde yok ve `parseDatePart`
 * "2025.06" biçimini zaten okuyor — yani yeni bir tarih dili eklenmiyor,
 * yalnızca bölme adımının tarihi parçalaması engelleniyor.
 *
 * Ay 01-12 aralığıyla sınırlı ve ardından rakam gelmemeli; bu olmadan
 * "2020-2023" yıl aralığı "2020.20" + "23" diye bölünürdü.
 */
function separateDates(text) {
    return text
        // Gün de varsa gün düşürülür: ölçüm ay hassasiyetinde yapılıyor.
        .replace(/\b(\d{4})-(0?[1-9]|1[0-2])-\d{1,2}(?!\d)/g, '$1.$2')
        .replace(/\b(\d{4})-(0?[1-9]|1[0-2])(?!\d)/g, '$1.$2')
        // "06-2019" — aynı tuzağın ters yazımı. Kelime sınırı yıl aralığını
        // koruyor: "1998-2005" içinde ay adayı bulunamaz.
        .replace(/\b(0?[1-9]|1[0-2])-(\d{4})(?!\d)/g, '$1.$2');
}

/** Makul yıl aralığı. Dışındaki sayı yıl değildir — muhtemelen bir metriktir. */
const MIN_YEAR = 1950;
const MAX_YEAR = 2100;

const isYear = (n) => Number.isInteger(n) && n >= MIN_YEAR && n <= MAX_YEAR;

/**
 * Tek bir tarih ucunu okur: "Oca 2020", "2020", "01/2020", "2020-01".
 *
 * @returns {{year: number, month: number|null}|null}
 *   month=null: CV yalnızca yıl vermiş. UYDURMUYORUZ — belirsizlik olarak
 *   taşınır (bkz. toWindow).
 */
export function parseDatePart(raw) {
    const s = fold(raw).trim();
    if (!s) return null;

    // "01/2020", "01.2020", "2020/01", "2020-01"
    const numeric = s.match(/^(\d{1,4})\s*[./-]\s*(\d{1,4})$/);
    if (numeric) {
        const a = Number(numeric[1]);
        const b = Number(numeric[2]);
        if (isYear(a) && b >= 1 && b <= 12) return { year: a, month: b };
        if (isYear(b) && a >= 1 && a <= 12) return { year: b, month: a };
        return null;
    }

    // "Oca 2020", "Ocak 2020", "2020 Ocak", "January 2020"
    const words = s.replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean);
    let year = null;
    let month = null;
    for (const w of words) {
        const n = Number(w);
        if (isYear(n)) { year = n; continue; }
        if (MONTHS[w] !== undefined && month === null) month = MONTHS[w];
    }
    if (year === null) return null;
    return { year, month };
}

const isCurrentWord = (s) => CURRENT_WORDS.some((w) => s === w || s.startsWith(`${w} `));

/**
 * Görev süresi metnini aralığa çevirir.
 *
 * @returns {{
 *   start: {year: number, month: number|null},
 *   end: {year: number, month: number|null}|null,
 *   current: boolean,
 *   precision: 'month'|'year',
 * }|null}
 *   null: OKUNAMADI. Çağıran bunu "0 ay" saymamalı — ölçüm eksik demektir.
 *   current=true: görev sürüyor; süre bugüne kadar hesaplanır.
 *   precision='year': en az bir uçta ay yok; hesap yıl hassasiyetinde.
 */
export function parseDuration(raw) {
    const s = separateDates(fold(raw).trim());
    if (!s) return null;

    // Ayraç: '-', '–', '—', ' to ', '→', 'arası'. Eğik çizgi AYRAÇ DEĞİL —
    // "01/2020" tarihin kendi içinde geçiyor.
    const parts = s
        .split(/\s*(?:[-–—]|\bto\b|→|\barasi\b)\s*/)
        .map((p) => p.trim())
        .filter(Boolean);

    if (parts.length === 0) return null;

    // Tek parça: "2020" ya da "Oca 2020". Başlangıcı var, bitişi yok.
    // Süre ölçülemez ama BAŞLANGIÇ çakışma denetimi için değerli.
    if (parts.length === 1) {
        if (isCurrentWord(parts[0])) return null;
        const start = parseDatePart(parts[0]);
        if (!start) return null;
        return { start, end: null, current: false, precision: start.month === null ? 'year' : 'month' };
    }

    const start = parseDatePart(parts[0]);
    if (!start) return null;

    const endRaw = parts[parts.length - 1];
    if (isCurrentWord(endRaw)) {
        return { start, end: null, current: true, precision: start.month === null ? 'year' : 'month' };
    }

    const end = parseDatePart(endRaw);
    if (!end) return null;

    const precision = (start.month === null || end.month === null) ? 'year' : 'month';
    return { start, end, current: false, precision };
}

/** Tarihi mutlak ay sayısına indirger — karşılaştırma bunun üzerinden yapılır. */
const toAbs = (d, fallbackMonth) => d.year * 12 + ((d.month ?? fallbackMonth) - 1);

/**
 * Aralığı [from, to) mutlak ay penceresine çevirir.
 *
 * AY BİLİNMİYORSA YILIN ORTASI (7) alınır — iki uçta da. Neden ortadan:
 * başlangıcı Ocak, bitişi Aralık saymak her yıl-only kaydı 12 aya yuvarlar ve
 * toplam deneyimi SİSTEMATİK olarak şişirir. Şişmiş toplam, "beyanından fazla
 * deneyim" gibi anlamsız bir sonuç üretir. Ortadan almak hatayı iki yöne
 * dağıtır ve beklenen sapmayı sıfıra yaklaştırır.
 *
 * @param {object} range parseDuration çıktısı
 * @param {{year: number, month: number}} today "halen" için referans an
 * @returns {{from: number, to: number}|null} süre ölçülemiyorsa null
 */
export function toWindow(range, today) {
    if (!range?.start || !today) return null;
    const from = toAbs(range.start, 7);
    if (range.current) {
        const to = today.year * 12 + (today.month - 1) + 1;
        return to > from ? { from, to } : null;
    }
    if (!range.end) return null;
    // Bitiş ayı DAHİL: "Oca 2020 - Oca 2020" bir aylık görevdir, sıfır değil.
    const to = toAbs(range.end, 7) + 1;
    return to > from ? { from, to } : null;
}

/**
 * Pencerelerin BİRLEŞİMİNİN uzunluğu — çakışan dönemler iki kez sayılmaz.
 *
 * Toplama yerine birleşim şart: paralel iki görev (danışmanlık + tam zamanlı)
 * toplandığında 4 yıllık kariyer 8 yıl görünür. Aday beyanından fazla çıkar,
 * hiçbir bayrak tetiklenmez ve şişkinlik hiç fark edilmez.
 */
export function unionMonths(windows) {
    const list = windows.filter(Boolean).slice().sort((a, b) => a.from - b.from);
    let total = 0;
    let cur = null;
    for (const w of list) {
        if (!cur) { cur = { ...w }; continue; }
        if (w.from <= cur.to) cur.to = Math.max(cur.to, w.to);
        else { total += cur.to - cur.from; cur = { ...w }; }
    }
    if (cur) total += cur.to - cur.from;
    return total;
}

/** İki pencerenin kaç ay çakıştığı. Çakışmıyorsa 0. */
export function overlapMonths(a, b) {
    if (!a || !b) return 0;
    return Math.max(0, Math.min(a.to, b.to) - Math.max(a.from, b.from));
}

/** Ay sayısını "3 yıl 2 ay" biçiminde yazar — rapor metinleri için. */
export function formatMonths(months) {
    const m = Math.max(0, Math.round(months));
    const y = Math.floor(m / 12);
    const rem = m % 12;
    if (y === 0) return `${rem} ay`;
    if (rem === 0) return `${y} yıl`;
    return `${y} yıl ${rem} ay`;
}

/** Bugünün {year, month} karşılığı — çağıranlar test için sabit değer geçebilir. */
export function currentYearMonth(date = new Date()) {
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
}
