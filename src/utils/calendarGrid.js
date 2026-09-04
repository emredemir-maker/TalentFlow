// AY IZGARASI VE GÜNLERE DAĞITIM.
//
// Takvim ekranının tüm tarih matematiği burada ve React'ten bağımsız:
// "ayın ilk günü hangi sütuna düşer", "şubat kaç satır tutar", "yaz saati
// geçişinde gün kayar mı" gibi sorular ekranda değil testte cevaplanır.
//
// ── NEDEN GÜN ANAHTARI METİN ────────────────────────────────────────────────
// Gruplama `Date` nesnesiyle değil `YYYY-MM-DD` metniyle yapılıyor. İki
// tarihi nesne olarak karşılaştırmak saat/dakika farkı yüzünden aynı günü
// iki ayrı kova yapıyor; saat dilimi kaymalarında ise gün sınırı bir saat
// öne kayıp kayıt bir önceki güne düşüyor.

/** Hafta Pazartesi başlar — Türkiye'deki takvim alışkanlığı. */
export const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const pad = (n) => String(n).padStart(2, '0');

/** Yerel güne göre `YYYY-MM-DD`. `toISOString` UTC'ye çevirip günü kaydırır. */
export function dayKey(value) {
    if (!value) return '';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `YYYY-MM-DD` ya da ISO metninden yerel gün anahtarı — saat dilimi çevirmeden. */
export function dayKeyOfDateString(value) {
    const s = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return dayKey(s);
}

/**
 * Bir ayın ızgarası — Pazartesi başlangıçlı, tam haftalar.
 *
 * Izgara her zaman TAM HAFTALARDAN oluşur: ayın başındaki ve sonundaki boş
 * kutular önceki/sonraki ayın günleriyle doluyor. Boş kutu bırakmak, ayın
 * ilk günü Pazar'a denk geldiğinde altı boş hücreyle başlayan bir takvim
 * üretiyordu.
 *
 * @param {number} year
 * @param {number} month — 0-11
 * @returns {Array<{date: Date, key: string, inMonth: boolean}>}
 */
export function monthGrid(year, month) {
    const ilk = new Date(year, month, 1);
    // getDay(): 0=Pazar. Pazartesi başlangıcı için kaydırıyoruz.
    const kaydir = (ilk.getDay() + 6) % 7;
    const bas = new Date(year, month, 1 - kaydir);

    const gunSayisi = new Date(year, month + 1, 0).getDate();
    const toplam = Math.ceil((kaydir + gunSayisi) / 7) * 7;

    const out = [];
    for (let i = 0; i < toplam; i += 1) {
        const d = new Date(bas.getFullYear(), bas.getMonth(), bas.getDate() + i);
        out.push({ date: d, key: dayKey(d), inMonth: d.getMonth() === month });
    }
    return out;
}

/** Ay başlığı — "Eylül 2026". */
export function monthLabel(year, month) {
    return new Date(year, month, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
}

/**
 * Mülakat oturumlarını ve takvim etkinliklerini günlere dağıtır.
 *
 * İki kaynak TEK LİSTEDE birleşiyor ama `kind` ile ayrı kalıyor: biri
 * uygulamanın kendi kaydı, diğeri kullanıcının takvimi. İkisini aynı şeymiş
 * gibi göstermek, sistemde kaydı olmayan bir toplantıyı mülakat sanmaya
 * yol açardı.
 *
 * @param {Array} sessions — aday belgelerindeki mülakat oturumları
 * @param {Array} events — normalizeCalendarEvent çıktıları
 * @returns {Map<string, Array>} gün anahtarı → o günün öğeleri, saate göre sıralı
 */
export function bucketByDay(sessions = [], events = []) {
    const map = new Map();
    const ekle = (key, item) => {
        if (!key) return;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item);
    };

    for (const s of Array.isArray(sessions) ? sessions : []) {
        const key = dayKeyOfDateString(s?.date);
        if (!key) continue;
        ekle(key, { kind: 'session', time: String(s?.time || ''), session: s });
    }

    for (const e of Array.isArray(events) ? events : []) {
        const key = dayKey(e?.start);
        if (!key) continue;
        ekle(key, {
            kind: 'event',
            // Tüm gün süren etkinlik saatsizdir; ona saat uydurmak listeyi
            // yanlış sıralar ve ekranda olmayan bir saat gösterir.
            time: e?.allDay ? '' : `${pad(e.start.getHours())}:${pad(e.start.getMinutes())}`,
            event: e,
        });
    }

    for (const [, list] of map) {
        list.sort((a, b) => {
            // Saatsizler (tüm gün) günün başında.
            if (!a.time && b.time) return -1;
            if (a.time && !b.time) return 1;
            return a.time.localeCompare(b.time);
        });
    }
    return map;
}
