// TAKVİM KAYDI HANGİ ADAYA AİT?
//
// ── NEDEN GEREKLİ ───────────────────────────────────────────────────────────
// Takvim bugüne kadar yalnızca boş slot bulmak ve çakışma denetlemek için
// okunuyordu; hiçbir yerde gösterilmiyordu. Oysa işin akışı takvimden
// başlıyor: kullanıcı gününe bakıyor, "bu görüşme için ne soracağım" diye
// hazırlanıyor, görüşme bitince sonucu giriyor.
//
// Bunun için bir takvim kaydını bir ADAYA bağlamak gerekiyor. Görüşmenin
// nerede yapıldığı önemli değil — Meet, Teams, Zoom ya da yüz yüze olabilir;
// bağlantı kaydın kendisiyle kuruluyor.
//
// ── EŞLEŞME SIRASI: GÜÇLÜDEN ZAYIFA ─────────────────────────────────────────
//   1. elle bağlanmış  — insan söylemiş; her şeyin üstünde
//   2. katılımcı e-postası — adayın e-postası davetli listesinde
//   3. açıklama satırı — TalentFlow'un kendi yazdığı "Aday: X"
//   4. başlıkta ad — en zayıfı; yalnızca AD VE SOYAD birlikte geçerse
//
// Yalnızca ada bakmak Türkiye'de yaygın adlarda sürekli yanlış eşleşme
// üretirdi ve yanlış eşleşmenin bedeli, bir adayın görüşme kaydının başka
// birinin altına yazılması. Bu yüzden dördüncü kural iki parça istiyor.
//
// ── EŞLEŞMEYEN KAYIT GİZLENMİYOR ────────────────────────────────────────────
// Kullanıcı görüşmeyi Teams'ten kendisi açmış ve adayın e-postasını davete
// eklememiş olabilir. O kaydı listeden düşürmek, kullanıcının elle
// bağlayabileceği tek fırsatı da yok ederdi.

/** Eşleşmenin nereden geldiği — arayüz bunu kullanıcıya söylüyor. */
export const MATCH_SOURCE = {
    MANUAL: 'elle',
    EMAIL: 'eposta',
    DESCRIPTION: 'aciklama',
    TITLE: 'baslik',
};

export const MATCH_LABEL = {
    [MATCH_SOURCE.MANUAL]: 'elle bağlandı',
    [MATCH_SOURCE.EMAIL]: 'e-postadan eşleşti',
    [MATCH_SOURCE.DESCRIPTION]: 'davet açıklamasından eşleşti',
    [MATCH_SOURCE.TITLE]: 'başlıktaki addan eşleşti',
};

const trim = (v) => String(v ?? '').trim();

/** Türkçe duyarsız sadeleştirme. */
function fold(s) {
    return trim(s)
        .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
        .replace(/Ş/g, 's').replace(/ş/g, 's')
        .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
        .replace(/Ü/g, 'u').replace(/ü/g, 'u')
        .replace(/Ö/g, 'o').replace(/ö/g, 'o')
        .replace(/Ç/g, 'c').replace(/ç/g, 'c')
        .toLowerCase()
        .replace(/[^a-z0-9@.]+/g, ' ')
        .trim();
}

/**
 * Google Takvim etkinliğini ekranın kullandığı biçime indirger.
 *
 * Tüm gün süren etkinliklerde `start.dateTime` yok, `start.date` var — ikisini
 * karıştırmak "Invalid Date" üretiyor ve satır boş görünüyordu.
 */
export function normalizeCalendarEvent(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const startRaw = raw.start?.dateTime || raw.start?.date || null;
    if (!startRaw) return null;
    const start = new Date(startRaw);
    if (Number.isNaN(start.getTime())) return null;
    const endRaw = raw.end?.dateTime || raw.end?.date || null;
    const end = endRaw ? new Date(endRaw) : null;

    return {
        id: trim(raw.id),
        title: trim(raw.summary) || 'Başlıksız etkinlik',
        description: trim(raw.description),
        location: trim(raw.location),
        htmlLink: trim(raw.htmlLink),
        start,
        end: end && !Number.isNaN(end.getTime()) ? end : null,
        allDay: !raw.start?.dateTime,
        attendees: (Array.isArray(raw.attendees) ? raw.attendees : [])
            .map((a) => trim(a?.email).toLowerCase())
            .filter(Boolean),
        organizerEmail: trim(raw.organizer?.email).toLowerCase(),
        status: trim(raw.status),
    };
}

/** Etkinliğin süresi — manuel görüşme formu bunu dakika olarak istiyor. */
export function eventMinutes(event) {
    if (!event?.start || !event?.end) return null;
    const dk = Math.round((event.end.getTime() - event.start.getTime()) / 60000);
    return dk > 0 && dk <= 600 ? dk : null;
}

/** Ad VE soyad birlikte geçiyor mu? Tek parça eşleşmesi kabul edilmiyor. */
function fullNameInText(name, text) {
    const parcalar = fold(name).split(' ').filter((p) => p.length > 2);
    if (parcalar.length < 2) return false;
    const hedef = fold(text);
    const ilk = parcalar[0];
    const son = parcalar[parcalar.length - 1];
    return hedef.includes(ilk) && hedef.includes(son);
}

/**
 * Etkinliği bir adayla eşleştirir.
 *
 * @param {object} event — normalizeCalendarEvent çıktısı
 * @param {Array} candidates — aday listesi
 * @returns {{candidate: object|null, source: string|null}}
 */
export function matchCandidate(event, candidates) {
    const list = Array.isArray(candidates) ? candidates : [];
    if (!event || list.length === 0) return { candidate: null, source: null };

    // 1. ELLE BAĞLANMIŞ — insan söylemiş, hiçbir tahmin bunun üstüne çıkmaz.
    const elle = list.find((c) => Array.isArray(c?.calendarEventIds)
        && c.calendarEventIds.some((id) => trim(id) === event.id));
    if (elle) return { candidate: elle, source: MATCH_SOURCE.MANUAL };

    // 2. Katılımcı e-postası — en güvenilir otomatik sinyal.
    const epostalar = new Set(event.attendees);
    if (epostalar.size > 0) {
        const eposta = list.find((c) => {
            const mail = trim(c?.email).toLowerCase();
            return mail && epostalar.has(mail);
        });
        if (eposta) return { candidate: eposta, source: MATCH_SOURCE.EMAIL };
    }

    // 3. TalentFlow'un davete yazdığı "Aday: X" satırı.
    if (event.description) {
        const aciklama = list.find((c) => trim(c?.name) && fullNameInText(c.name, event.description));
        if (aciklama) return { candidate: aciklama, source: MATCH_SOURCE.DESCRIPTION };
    }

    // 4. Başlıkta ad ve soyad — en zayıf sinyal, en son bakılıyor.
    if (event.title) {
        const baslik = list.find((c) => trim(c?.name) && fullNameInText(c.name, event.title));
        if (baslik) return { candidate: baslik, source: MATCH_SOURCE.TITLE };
    }

    return { candidate: null, source: null };
}

/**
 * Etkinliğe zaten bir görüşme kaydı bağlanmış mı?
 *
 * Sonucu girilmiş bir görüşmeyi ikinci kez girmek, aynı görüşmeyi iki kez
 * saymak olurdu. Bağlantı oturuma yazılıyor (`calendarEventId`).
 */
export function sessionForEvent(event, candidate) {
    const oturumlar = Array.isArray(candidate?.interviewSessions) ? candidate.interviewSessions : [];
    return oturumlar.find((s) => trim(s?.calendarEventId) === trim(event?.id)) || null;
}
