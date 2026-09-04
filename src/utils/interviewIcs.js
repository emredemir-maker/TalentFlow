// PLANLANAN GÖRÜŞMEYİ KENDİ TAKVİMİNE EKLEME.
//
// ── NEDEN GEREKLİ ───────────────────────────────────────────────────────────
// Mülakat planlandığında takvim etkinliği YALNIZCA Google Workspace bağlıysa
// oluşuyor (InterviewManagementPage → createDirectCalendarEvent). Bağlı
// değilse davet e-postası adaya gidiyor ama İK'nın kendi takviminde hiçbir iz
// kalmıyor: saat başkasına verilebiliyor, görüşme unutulabiliyor.
//
// Görüşmenin nerede yapıldığı ayrı bir mesele — Zoom, Teams ya da yüz yüze
// olabilir. Takvimin bloke edilmesi buna bağlı değil: hangi uygulamada
// yapılırsa yapılsın o saat doludur.
//
// ── NEDEN .ICS ──────────────────────────────────────────────────────────────
// Tek bir takvim sağlayıcısına bağlanmadan çalışan tek biçim. Outlook, Apple
// Takvim, Google Takvim ve Thunderbird dosyayı açıp etkinliği ekliyor. Yeni
// bir entegrasyon, yeni bir OAuth izni ya da sunucu tarafı iş gerekmiyor.
//
// Üretici `buildICS` zaten var ve adaya gönderilen davet e-postasında
// kullanılıyor; burada aynı üretici İK'nın kendisi için çağrılıyor.

import { buildICS } from './emailTemplates';

/** Oturumun ekranda görünen başlığı — kayıt alanları sürüme göre değişiyor. */
function oturumBasligi(session) {
    return String(session?.title || session?.interviewType || 'Mülakat').trim() || 'Mülakat';
}

/**
 * Planlanan görüşme için takvim dosyası metni üretir.
 *
 * @param {object} session — aday belgesindeki interviewSessions kaydı
 * @param {object} opts — {candidateName, positionTitle, organizer:{name,email}, attendee:{name,email}}
 * @returns {string|null} .ics içeriği; tarih ya da saat yoksa null
 */
export function buildInterviewIcs(session, opts = {}) {
    const date = session?.date;
    const time = session?.time;
    // TARİH YA DA SAAT YOKSA DOSYA ÜRETİLMEZ. Varsayılan bir saat uydurmak
    // takvime yanlış saatte bir blok koyardı — hiç koymamaktan kötü.
    if (!date || !time) return null;

    const baslik = oturumBasligi(session);
    const aday = String(opts.candidateName || session?.candidateName || '').trim();
    const pozisyon = String(opts.positionTitle || session?.positionTitle || '').trim();
    const link = String(session?.meetLink || '').trim();

    const aciklama = [
        aday ? `Aday: ${aday}` : '',
        pozisyon ? `Pozisyon: ${pozisyon}` : '',
        link ? `Görüşme linki: ${link}` : '',
        'TalentFlow üzerinden planlandı.',
    ].filter(Boolean).join('\n');

    return buildICS({
        date,
        time,
        title: aday ? `${baslik} — ${aday}` : baslik,
        description: aciklama,
        location: link,
        // Kimlik oturumla aynı kalıyor: aynı görüşme ikinci kez eklendiğinde
        // takvim uygulaması yeni bir etkinlik değil GÜNCELLEME olarak işler.
        uid: `${session?.id || 'iv'}-organizer@talentflow`,
        organizer: opts.organizer || null,
        attendee: opts.attendee || null,
    });
}

/** Dosya adı — Türkçe karakter ve boşluk indirme akışında sorun çıkarıyor. */
export function icsDosyaAdi(session, candidateName = '') {
    const sade = String(candidateName || '')
        .replace(/İ/g, 'I').replace(/ı/g, 'i').replace(/Ş/g, 'S').replace(/ş/g, 's')
        .replace(/Ğ/g, 'G').replace(/ğ/g, 'g').replace(/Ü/g, 'U').replace(/ü/g, 'u')
        .replace(/Ö/g, 'O').replace(/ö/g, 'o').replace(/Ç/g, 'C').replace(/ç/g, 'c')
        .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
    const gun = session?.date ? `-${String(session.date).slice(0, 10)}` : '';
    return ['mulakat', sade, gun.slice(1)].filter(Boolean).join('-') + '.ics';
}

/**
 * Takvim dosyasını indirir.
 *
 * @returns {boolean} dosya üretilebildiyse true
 */
export function downloadInterviewIcs(session, opts = {}) {
    const ics = buildInterviewIcs(session, opts);
    if (!ics) return false;

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = icsDosyaAdi(session, opts.candidateName || session?.candidateName);
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return true;
}
