// src/utils/emailTemplates.js
// HTML email template builder — used for all outgoing emails
// Branding object: { companyName, logoUrl, primaryColor, tagline, website }

const DEFAULT_BRANDING = {
    companyName: 'Talent-Inn',
    logoUrl: '',
    primaryColor: '#0E7490',
    tagline: 'Akıllı İnsan Kaynakları Platformu',
    website: ''
};

function hex2rgb(hex) {
    const clean = (hex || '#0E7490').replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `${r}, ${g}, ${b}`;
}

function initials(name) {
    return (name || 'IK').split(/\s+/).map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || 'IK';
}

function baseLayout(branding, content) {
    const b = { ...DEFAULT_BRANDING, ...branding };
    const color = b.primaryColor || '#0E7490';
    const rgb = hex2rgb(color);

    return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${b.companyName}</title>
</head>
<body style="margin:0;padding:0;background:#EFF6FF;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#EFF6FF;padding:40px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">

        <!-- TOP ACCENT LINE -->
        <tr>
          <td style="height:5px;background:linear-gradient(90deg,${color} 0%,rgba(${rgb},0.4) 100%);"></td>
        </tr>

        <!-- HEADER -->
        <tr>
          <td style="background:#ffffff;padding:36px 48px 28px 48px;border-bottom:1px solid #E2E8F0;">
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td>
                  ${b.logoUrl
                    ? `<img src="${b.logoUrl}" alt="${b.companyName}" style="height:40px;max-width:160px;object-fit:contain;"/>`
                    : `<div style="display:inline-flex;align-items:center;gap:10px;">
                         <div style="width:38px;height:38px;border-radius:10px;background:${color};display:inline-flex;align-items:center;justify-content:center;">
                           <span style="color:#fff;font-size:15px;font-weight:800;letter-spacing:-0.5px;">${initials(b.companyName)}</span>
                         </div>
                         <div>
                           <div style="color:#0F172A;font-size:17px;font-weight:800;letter-spacing:-0.3px;">${b.companyName}</div>
                           ${b.tagline ? `<div style="color:#94A3B8;font-size:11px;margin-top:1px;">${b.tagline}</div>` : ''}
                         </div>
                       </div>`
                  }
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CONTENT -->
        <tr>
          <td style="padding:40px 48px 36px 48px;">
            ${content}
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#F8FAFC;padding:24px 48px;border-top:1px solid #E2E8F0;">
            <p style="color:#94A3B8;font-size:12px;margin:0 0 4px 0;text-align:center;">
              Bu e-posta <strong style="color:${color};">${b.companyName}</strong> İK Platformu aracılığıyla gönderilmiştir.
            </p>
            <p style="color:#CBD5E1;font-size:11px;margin:0;text-align:center;">
              Bu iletiyi hatalı aldıysanız lütfen görmezden geliniz.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── YARDIMCI: info row ──────────────────────────────────────────────────────
function infoRow(label, value) {
    if (!value) return '';
    return `<tr>
      <td style="color:#64748B;font-size:13px;padding:8px 0;width:140px;vertical-align:top;font-weight:500;">${label}</td>
      <td style="color:#0F172A;font-size:13px;padding:8px 0;font-weight:700;vertical-align:top;">${value}</td>
    </tr>`;
}

// ─── YARDIMCI: Google Calendar "Takvime Ekle" linki ─────────────────────────
function makeGoogleCalLink(date, time, title, details, location) {
    if (!date || !time) return null;
    try {
        const cleanDate = date.replace(/-/g, '');
        const [h, m] = time.replace('.', ':').split(':').map(Number);
        const start = `${cleanDate}T${String(h).padStart(2,'0')}${String(m||0).padStart(2,'0')}00`;
        const endH = (h + 1) % 24;
        const end   = `${cleanDate}T${String(endH).padStart(2,'0')}${String(m||0).padStart(2,'0')}00`;
        const p = `action=TEMPLATE&text=${encodeURIComponent(title||'Mülakat')}&dates=${start}/${end}&details=${encodeURIComponent(details||'')}&location=${encodeURIComponent(location||'')}`;
        return `https://calendar.google.com/calendar/render?${p}`;
    } catch { return null; }
}

// ─── YARDIMCI: "Takvime Ekle" badge butonu ───────────────────────────────────
function calendarBadge(calLink, color) {
    if (!calLink) return '';
    return `
    <div style="text-align:center;margin:0 0 28px 0;">
      <a href="${calLink}" target="_blank"
         style="display:inline-flex;align-items:center;gap:7px;padding:9px 20px;
                border:1.5px solid ${color};border-radius:8px;color:${color};
                font-size:13px;font-weight:600;text-decoration:none;background:#ffffff;">
        <span style="font-size:16px;">📅</span> Google Takvime Ekle
      </a>
    </div>`;
}

// ─── YARDIMCI: primary button ────────────────────────────────────────────────
function primaryButton(href, label, color) {
    return `
    <div style="text-align:center;margin:32px 0 24px 0;">
      <a href="${href}"
         style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;
                padding:16px 44px;border-radius:12px;font-weight:700;font-size:15px;
                letter-spacing:0.02em;box-shadow:0 4px 14px rgba(0,0,0,0.15);">
        ${label}
      </a>
    </div>`;
}

// ─── YARDIMCI: info card ─────────────────────────────────────────────────────
function infoCard(rows, color) {
    const rgb = hex2rgb(color);
    return `
    <div style="background:rgba(${rgb},0.05);border:1px solid rgba(${rgb},0.15);
                border-radius:14px;padding:24px 28px;margin:24px 0;">
      <p style="color:${color};font-size:11px;font-weight:700;text-transform:uppercase;
                letter-spacing:0.1em;margin:0 0 14px 0;">MÜLAKAT DETAYLARI</p>
      <table cellpadding="0" cellspacing="0" width="100%">
        ${rows}
      </table>
    </div>`;
}


// ─── 1. KULLANICI DAVET MAİLİ (system → new user) ───────────────────────────
export function buildInviteEmail(branding, { inviteLink, role, invitedByName }) {
    const b = { ...DEFAULT_BRANDING, ...branding };
    const color = b.primaryColor || '#0E7490';
    const roleLabel =
        role === 'super_admin' ? 'Süper Admin' :
        role === 'department_user' ? 'Departman Kullanıcısı' : 'Recruiter';

    const content = `
      <h2 style="color:#0F172A;font-size:24px;font-weight:800;margin:0 0 10px 0;letter-spacing:-0.5px;">
        Platforma Hoş Geldiniz
      </h2>
      <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 28px 0;">
        ${invitedByName ? `<strong>${invitedByName}</strong> tarafından` : ''} <strong>${b.companyName}</strong>'a
        <span style="color:${color};font-weight:700;">${roleLabel}</span> olarak davet edildiniz.
        Aşağıdaki butona tıklayarak hesabınızı oluşturun ve hemen kullanmaya başlayın.
      </p>

      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
        <table cellpadding="0" cellspacing="0" width="100%">
          ${infoRow('Platform', b.companyName)}
          ${infoRow('Rol', roleLabel)}
        </table>
      </div>

      ${primaryButton(inviteLink, 'Daveti Kabul Et &rarr;', color)}

      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:14px 18px;">
        <p style="color:#92400E;font-size:12px;margin:0;line-height:1.6;">
          <strong>Güvenlik Notu:</strong> Bu davet bağlantısı kişiseldir ve yalnızca bir kez kullanılabilir. Başkalarıyla paylaşmayınız.
        </p>
      </div>

      <p style="color:#94A3B8;font-size:12px;margin:20px 0 0 0;line-height:1.6;">
        Butona tıklayamıyorsanız bu adresi kopyalayın:<br/>
        <a href="${inviteLink}" style="color:${color};word-break:break-all;font-size:11px;">${inviteLink}</a>
      </p>
    `;
    return baseLayout(b, content);
}


// ─── 2. MÜLAKAT DAVET MAİLİ (recruiter → candidate) ─────────────────────────
export function buildInterviewInviteEmail(branding, {
    candidateName, recruiterName, position,
    date, time, interviewType, joinLink, companyEmail
}) {
    const b = { ...DEFAULT_BRANDING, ...branding };
    const color = b.primaryColor || '#0E7490';

    const rows = [
        infoRow('Pozisyon', position),
        infoRow('Mülakat Türü', interviewType),
        infoRow('Tarih', date),
        infoRow('Saat', time),
        infoRow('Görüşmeci', recruiterName),
    ].join('');

    const replyNote = companyEmail
        ? `Herhangi bir sorunuz için <a href="mailto:${companyEmail}" style="color:${color};font-weight:600;">${companyEmail}</a> adresine yanıt verebilirsiniz.`
        : `Bu e-postaya yanıt vererek bizimle iletişime geçebilirsiniz.`;

    const content = `
      <h2 style="color:#0F172A;font-size:24px;font-weight:800;margin:0 0 8px 0;letter-spacing:-0.5px;">
        Mülakat Davetiniz
      </h2>
      <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 4px 0;">
        Sayın <strong>${candidateName || 'Değerli Aday'}</strong>,
      </p>
      <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 20px 0;">
        <strong>${b.companyName}</strong> İnsan Kaynakları ekibi olarak sizi değerlendirme sürecimize davet etmekten memnuniyet duyuyoruz.
        Mülakat detaylarınız aşağıda yer almaktadır.
      </p>

      ${infoCard(rows, color)}

      ${joinLink ? primaryButton(joinLink, 'Mülakata Katıl &rarr;', color) : ''}

      ${joinLink ? `
      <p style="color:#64748B;font-size:12px;text-align:center;margin:-12px 0 24px 0;">
        Butona tıklayamıyorsanız bu bağlantıyı kopyalayın:<br/>
        <a href="${joinLink}" style="color:${color};word-break:break-all;font-size:11px;">${joinLink}</a>
      </p>` : ''}

      ${calendarBadge(makeGoogleCalLink(date, time,
          `Mülakat: ${position || interviewType} — ${b.companyName}`,
          `Aday: ${candidateName}\nPozisyon: ${position}\nMülakat linki: ${joinLink || ''}`,
          joinLink || ''), color)}

      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
        <p style="color:#15803D;font-size:13px;margin:0;line-height:1.6;">
          <strong>Katılım Onayı:</strong> Mülakata katılabileceğinizi onaylamak veya tarih değişikliği talep etmek için ${replyNote}
        </p>
      </div>

      <p style="color:#475569;font-size:14px;margin:0;line-height:1.6;">
        Görüşmemizde başarılar dileriz.<br/><br/>
        <strong>${recruiterName || (b.companyName + ' İK Ekibi')}</strong><br/>
        <span style="color:#94A3B8;font-size:13px;">${b.companyName} İnsan Kaynakları</span>
      </p>
    `;
    return baseLayout(b, content);
}


// ─── 3. MÜLAKAT ERTELEME / İPTAL MAİLİ (recruiter → candidate) ──────────────
export function buildRescheduleEmail(branding, {
    candidateName, recruiterName, position,
    oldDate, oldTime,
    newDate, newTime,
    joinLink, reason, isCancelled, companyEmail
}) {
    const b = { ...DEFAULT_BRANDING, ...branding };
    const color = b.primaryColor || '#0E7490';

    const subject = isCancelled ? 'Mülakat İptali' : 'Mülakat Tarihi Güncellendi';
    const headerColor = isCancelled ? '#DC2626' : '#D97706';
    const badgeBg = isCancelled ? '#FEF2F2' : '#FFFBEB';
    const badgeBorder = isCancelled ? '#FECACA' : '#FDE68A';
    const badgeText = isCancelled ? '#991B1B' : '#92400E';
    const badgeLabel = isCancelled ? 'MÜLAKAT İPTAL EDİLDİ' : 'MÜLAKAT TARİHİ DEĞİŞTİ';

    const oldRows = [
        infoRow('Eski Tarih', oldDate),
        infoRow('Eski Saat', oldTime),
    ].join('');

    const newRows = newDate || newTime ? [
        infoRow('Yeni Tarih', newDate || oldDate),
        infoRow('Yeni Saat', newTime || oldTime),
        infoRow('Pozisyon', position),
        infoRow('Görüşmeci', recruiterName),
    ].join('') : '';

    const replyNote = companyEmail
        ? `<a href="mailto:${companyEmail}" style="color:${color};font-weight:600;">${companyEmail}</a>`
        : 'bu e-postaya yanıt vererek';

    const content = `
      <!-- Status Badge -->
      <div style="background:${badgeBg};border:1px solid ${badgeBorder};border-radius:10px;
                  padding:10px 16px;margin-bottom:28px;display:inline-block;">
        <p style="color:${badgeText};font-size:11px;font-weight:700;text-transform:uppercase;
                  letter-spacing:0.1em;margin:0;">${badgeLabel}</p>
      </div>

      <h2 style="color:#0F172A;font-size:24px;font-weight:800;margin:0 0 8px 0;letter-spacing:-0.5px;">
        ${subject}
      </h2>
      <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 20px 0;">
        Sayın <strong>${candidateName || 'Değerli Aday'}</strong>,
        ${isCancelled
            ? `<strong>${b.companyName}</strong> ile planlanmış olan mülakatınız maalesef iptal edilmiştir.`
            : `<strong>${b.companyName}</strong> ile planlanmış olan mülakatınızın tarihi güncellenmiştir. Lütfen yeni tarih bilgilerini inceleyin.`
        }
      </p>

      <!-- Old Date Info -->
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:20px 24px;margin-bottom:16px;">
        <p style="color:#94A3B8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 12px 0;">
          ${isCancelled ? 'İPTAL EDİLEN RANDEVU' : 'ESKİ RANDEVU'}
        </p>
        <table cellpadding="0" cellspacing="0" width="100%">
          ${oldRows}
          ${infoRow('Pozisyon', position)}
        </table>
      </div>

      ${!isCancelled && newRows ? `
      <!-- New Date Info -->
      <div style="background:rgba(${hex2rgb(color)},0.05);border:1px solid rgba(${hex2rgb(color)},0.2);
                  border-radius:12px;padding:20px 24px;margin-bottom:16px;">
        <p style="color:${color};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 12px 0;">
          YENİ RANDEVU
        </p>
        <table cellpadding="0" cellspacing="0" width="100%">
          ${newRows}
        </table>
      </div>
      ` : ''}

      ${reason ? `
      <div style="background:#F8FAFC;border-left:3px solid #CBD5E1;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:20px;">
        <p style="color:#64748B;font-size:13px;margin:0;line-height:1.6;">
          <strong>Açıklama:</strong> ${reason}
        </p>
      </div>` : ''}

      ${!isCancelled && joinLink ? primaryButton(joinLink, 'Güncel Mülakat Linkine Katıl &rarr;', color) : ''}

      <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
        <p style="color:#1E40AF;font-size:13px;margin:0;line-height:1.6;">
          ${isCancelled
            ? `Mülakatla ilgili sorularınız için lütfen ${replyNote} bizimle iletişime geçin. İleride yeniden değerlendirme fırsatı sunulabilir.`
            : `Yeni tarih size uygun değilse lütfen ${replyNote} bize bildirin. Müsaitlik durumunuza göre yeni bir tarih planlayabiliriz.`
          }
        </p>
      </div>

      <p style="color:#475569;font-size:14px;margin:0;line-height:1.6;">
        Anlayışınız için teşekkür ederiz.<br/><br/>
        <strong>${recruiterName || (b.companyName + ' İK Ekibi')}</strong><br/>
        <span style="color:#94A3B8;font-size:13px;">${b.companyName} İnsan Kaynakları</span>
      </p>
    `;
    return baseLayout(b, content);
}


// ─── 4. KATILIMCı BİLDİRİM MAİLİ (recruiter → internal participant) ─────────
export function buildParticipantNotificationEmail(branding, {
    participantName, candidateName, position,
    date, time, interviewType, meetLink, googleMeetLink, recruiterName
}) {
    const b = { ...DEFAULT_BRANDING, ...branding };
    const color = b.primaryColor || '#0E7490';

    const rows = [
        infoRow('Aday', candidateName),
        infoRow('Pozisyon', position),
        infoRow('Mülakat Türü', interviewType),
        infoRow('Tarih', date),
        infoRow('Saat', time),
        infoRow('Organizatör', recruiterName),
    ].join('');

    const content = `
      <h2 style="color:#0F172A;font-size:24px;font-weight:800;margin:0 0 8px 0;letter-spacing:-0.5px;">
        Mülakat Değerlendirici Daveti
      </h2>
      <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 20px 0;">
        Sayın <strong>${participantName || 'Meslektaş'}</strong>,<br/>
        Aşağıdaki mülakatta <strong>değerlendirici</strong> olarak yer almanız için davet edildiniz.
      </p>

      ${infoCard(rows, color)}

      ${meetLink ? primaryButton(meetLink, 'Mülakata Katıl (Platform) &rarr;', color) : ''}

      ${calendarBadge(makeGoogleCalLink(date, time,
          `Mülakat: ${candidateName} — ${interviewType}`,
          `Aday: ${candidateName}\nPozisyon: ${position}\nOrganizatör: ${recruiterName}\nMülakat linki: ${meetLink || ''}`,
          meetLink || ''), color)}

      ${googleMeetLink ? `
      <div style="text-align:center;margin:0 0 24px 0;">
        <a href="${googleMeetLink}"
           style="display:inline-block;padding:10px 24px;background:#ffffff;border:2px solid ${color};border-radius:8px;color:${color};font-size:14px;font-weight:600;text-decoration:none;">
          Google Meet ile Katıl
        </a>
        <p style="color:#94A3B8;font-size:11px;margin:8px 0 0 0;">Alternatif: <a href="${googleMeetLink}" style="color:#94A3B8;">${googleMeetLink}</a></p>
      </div>` : ''}

      <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:16px 20px;">
        <p style="color:#1E40AF;font-size:13px;margin:0;line-height:1.6;">
          Bu davet <strong>${b.companyName}</strong> platformu üzerinden oluşturulmuştur.
          Katılamazsanız bu e-postaya yanıt vererek organizatörü bilgilendirin.
        </p>
      </div>
    `;
    return baseLayout(b, content);
}


// ─── ICS (iCalendar) Builder ──────────────────────────────────────────────────
// Generates a .ics string accepted by Outlook, Apple Mail, Google Calendar etc.
// date: "YYYY-MM-DD", time: "HH:MM", organizer: { name, email }, attendee: { name, email }
export function buildICS({ date, time, title, description, location, uid, organizer, attendee }) {
    if (!date || !time) return null;
    try {
        const cleanDate = date.replace(/-/g, '');
        const [h, m] = time.replace('.', ':').split(':').map(Number);
        const fmt = (n) => String(n).padStart(2, '0');
        const dtStart = `${cleanDate}T${fmt(h)}${fmt(m || 0)}00`;
        const dtEnd   = `${cleanDate}T${fmt((h + 1) % 24)}${fmt(m || 0)}00`;
        const now     = new Date();
        const dtStamp = `${now.getUTCFullYear()}${fmt(now.getUTCMonth()+1)}${fmt(now.getUTCDate())}T${fmt(now.getUTCHours())}${fmt(now.getUTCMinutes())}${fmt(now.getUTCSeconds())}Z`;
        const safeUid = uid || `${Date.now()}-${Math.random().toString(36).slice(2)}@talentflow`;
        const icsLines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//TalentFlow//HR Platform//TR',
            'CALSCALE:GREGORIAN',
            'METHOD:REQUEST',
            'BEGIN:VEVENT',
            `DTSTART:${dtStart}`,
            `DTEND:${dtEnd}`,
            `DTSTAMP:${dtStamp}`,
            `UID:${safeUid}`,
            `SUMMARY:${(title || 'Mülakat').replace(/\n/g, '\\n')}`,
            `DESCRIPTION:${(description || '').replace(/\n/g, '\\n')}`,
            `LOCATION:${(location || '').replace(/\n/g, '\\n')}`,
            ...(organizer?.email ? [`ORGANIZER;CN=${organizer.name || organizer.email}:mailto:${organizer.email}`] : []),
            ...(attendee?.email  ? [`ATTENDEE;RSVP=TRUE;CN=${attendee.name || attendee.email}:mailto:${attendee.email}`] : []),
            'STATUS:CONFIRMED',
            'SEQUENCE:0',
            'END:VEVENT',
            'END:VCALENDAR'
        ];
        return icsLines.join('\r\n');
    } catch { return null; }
}
