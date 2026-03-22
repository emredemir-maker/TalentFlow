// src/utils/emailTemplates.js
// HTML email template builder — used for all outgoing emails
// Branding object: { companyName, logoUrl, primaryColor, tagline, website }

const DEFAULT_BRANDING = {
    companyName: 'Talent-Inn',
    logoUrl: '',
    primaryColor: '#1E3A8A',
    tagline: 'Akıllı İK Platformu',
    website: ''
};

function hex2rgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
}

function baseLayout(branding, content) {
    const b = { ...DEFAULT_BRANDING, ...branding };
    const color = b.primaryColor || '#1E3A8A';
    const lightColor = `rgba(${hex2rgb(color)}, 0.08)`;

    return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${b.companyName}</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- HEADER -->
        <tr>
          <td style="background:${color};padding:32px 40px;text-align:center;">
            ${b.logoUrl
                ? `<img src="${b.logoUrl}" alt="${b.companyName}" style="max-height:56px;max-width:200px;object-fit:contain;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;"/>`
                : `<div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:12px;padding:10px 20px;margin-bottom:12px;">
                     <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">${b.companyName}</span>
                   </div>`
            }
            ${b.tagline ? `<p style="color:rgba(255,255,255,0.75);font-size:13px;margin:0;">${b.tagline}</p>` : ''}
          </td>
        </tr>

        <!-- CONTENT -->
        <tr>
          <td style="padding:40px 40px 32px 40px;">
            ${content}
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#F8FAFC;padding:24px 40px;border-top:1px solid #E2E8F0;text-align:center;">
            <p style="color:#94A3B8;font-size:12px;margin:0 0 6px 0;">
              Bu e-posta <strong style="color:${color};">${b.companyName}</strong> tarafından ${b.website ? `<a href="${b.website}" style="color:${color};text-decoration:none;">${b.website}</a>` : 'Talent-Inn platformu'} üzerinden gönderilmiştir.
            </p>
            <p style="color:#CBD5E1;font-size:11px;margin:0;">
              Bu iletiyi yanlışlıkla aldıysanız lütfen görmezden geliniz.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── 1. KULLANICI DAVET MAİLİ (system → new user) ─────────────────────────────
export function buildInviteEmail(branding, { inviteLink, role, invitedByName }) {
    const b = { ...DEFAULT_BRANDING, ...branding };
    const color = b.primaryColor || '#1E3A8A';
    const roleLabel =
        role === 'super_admin' ? 'Süper Admin' :
        role === 'department_user' ? 'Departman Kullanıcısı' : 'Recruiter';

    const content = `
      <h2 style="color:#0F172A;font-size:22px;font-weight:700;margin:0 0 8px 0;">
        Hoş Geldiniz! 🎉
      </h2>
      <p style="color:#475569;font-size:15px;margin:0 0 24px 0;">
        ${invitedByName ? `<strong>${invitedByName}</strong> tarafından` : ''} <strong>${b.companyName}</strong>'a
        <span style="color:${color};font-weight:600;">${roleLabel}</span> olarak davet edildiniz.
      </p>

      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
        <p style="color:#64748B;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 12px 0;">Erişim Bilgileriniz</p>
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="color:#64748B;font-size:14px;padding:4px 0;width:120px;">Platform</td>
            <td style="color:#0F172A;font-size:14px;font-weight:600;padding:4px 0;">${b.companyName}</td>
          </tr>
          <tr>
            <td style="color:#64748B;font-size:14px;padding:4px 0;">Rol</td>
            <td style="color:#0F172A;font-size:14px;font-weight:600;padding:4px 0;">${roleLabel}</td>
          </tr>
        </table>
      </div>

      <p style="color:#475569;font-size:14px;margin:0 0 28px 0;">
        Aşağıdaki butona tıklayarak hesabınızı oluşturabilir ve platforma hemen erişim sağlayabilirsiniz.
      </p>

      <div style="text-align:center;margin-bottom:28px;">
        <a href="${inviteLink}"
           style="background:${color};color:#ffffff;padding:15px 36px;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;display:inline-block;letter-spacing:0.02em;">
          Daveti Kabul Et →
        </a>
      </div>

      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px 18px;">
        <p style="color:#92400E;font-size:12px;margin:0;">
          <strong>Not:</strong> Bu davet linki kişiseldir ve yalnızca bir kez kullanılabilir. Başkalarıyla paylaşmayınız.
        </p>
      </div>

      <p style="color:#94A3B8;font-size:12px;margin:24px 0 0 0;">
        Butona tıklayamıyorsanız bu bağlantıyı kopyalayın:<br/>
        <a href="${inviteLink}" style="color:${color};word-break:break-all;">${inviteLink}</a>
      </p>
    `;
    return baseLayout(b, content);
}

// ─── 2. MÜLAKAT DAVET MAİLİ (recruiter → candidate) ───────────────────────────
export function buildInterviewInviteEmail(branding, {
    candidateName, recruiterName, position,
    date, time, interviewType, joinLink
}) {
    const b = { ...DEFAULT_BRANDING, ...branding };
    const color = b.primaryColor || '#1E3A8A';
    const lightColor = `rgba(${hex2rgb(color)}, 0.08)`;

    const content = `
      <h2 style="color:#0F172A;font-size:22px;font-weight:700;margin:0 0 8px 0;">
        Mülakat Davetiniz
      </h2>
      <p style="color:#475569;font-size:15px;margin:0 0 28px 0;">
        Merhaba <strong>${candidateName || 'Değerli Aday'}</strong>,<br/><br/>
        ${b.companyName} İK ekibi olarak sizinle tanışmak isteriz. Aşağıda mülakat detaylarınızı bulabilirsiniz.
      </p>

      <div style="background:${lightColor};border-left:4px solid ${color};border-radius:0 12px 12px 0;padding:24px;margin-bottom:28px;">
        <p style="color:#64748B;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 16px 0;">Mülakat Detayları</p>
        <table cellpadding="0" cellspacing="0" width="100%">
          ${position ? `<tr>
            <td style="color:#64748B;font-size:14px;padding:6px 0;width:130px;">📋 Pozisyon</td>
            <td style="color:#0F172A;font-size:14px;font-weight:600;padding:6px 0;">${position}</td>
          </tr>` : ''}
          ${interviewType ? `<tr>
            <td style="color:#64748B;font-size:14px;padding:6px 0;">🎯 Mülakat Türü</td>
            <td style="color:#0F172A;font-size:14px;font-weight:600;padding:6px 0;">${interviewType}</td>
          </tr>` : ''}
          ${date ? `<tr>
            <td style="color:#64748B;font-size:14px;padding:6px 0;">📅 Tarih</td>
            <td style="color:#0F172A;font-size:14px;font-weight:600;padding:6px 0;">${date}</td>
          </tr>` : ''}
          ${time ? `<tr>
            <td style="color:#64748B;font-size:14px;padding:6px 0;">🕐 Saat</td>
            <td style="color:#0F172A;font-size:14px;font-weight:600;padding:6px 0;">${time}</td>
          </tr>` : ''}
          ${recruiterName ? `<tr>
            <td style="color:#64748B;font-size:14px;padding:6px 0;">👤 Görüşmeci</td>
            <td style="color:#0F172A;font-size:14px;font-weight:600;padding:6px 0;">${recruiterName}</td>
          </tr>` : ''}
        </table>
      </div>

      ${joinLink ? `
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${joinLink}"
           style="background:${color};color:#ffffff;padding:15px 36px;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;display:inline-block;">
          Mülakata Katıl →
        </a>
      </div>
      ` : ''}

      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
        <p style="color:#166534;font-size:13px;margin:0;">
          ✅ Mülakata katılabilmeniz için bu e-postaya yanıt vermeniz yeterlidir.
          Herhangi bir sorunuz olursa doğrudan bu maile cevap verebilirsiniz.
        </p>
      </div>

      <p style="color:#475569;font-size:14px;margin:0;">
        Görüşmemizde başarılar dileriz.<br/>
        <strong>${recruiterName || b.companyName + ' İK Ekibi'}</strong>
      </p>
    `;
    return baseLayout(b, content);
}

// ─── 3. KATILIMCı BİLDİRİM MAİLİ (recruiter → internal participant) ──────────
export function buildParticipantNotificationEmail(branding, {
    participantName, candidateName, position,
    date, time, interviewType, meetLink, recruiterName
}) {
    const b = { ...DEFAULT_BRANDING, ...branding };
    const color = b.primaryColor || '#1E3A8A';
    const lightColor = `rgba(${hex2rgb(color)}, 0.08)`;

    const content = `
      <h2 style="color:#0F172A;font-size:22px;font-weight:700;margin:0 0 8px 0;">
        Mülakat Katılım Daveti
      </h2>
      <p style="color:#475569;font-size:15px;margin:0 0 24px 0;">
        Merhaba <strong>${participantName || 'Meslektaş'}</strong>,<br/><br/>
        Aşağıdaki mülakata değerlendirici olarak davet edildiniz.
      </p>

      <div style="background:${lightColor};border-left:4px solid ${color};border-radius:0 12px 12px 0;padding:24px;margin-bottom:28px;">
        <p style="color:#64748B;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 16px 0;">Mülakat Bilgileri</p>
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="color:#64748B;font-size:14px;padding:6px 0;width:130px;">👤 Aday</td>
            <td style="color:#0F172A;font-size:14px;font-weight:600;padding:6px 0;">${candidateName || '—'}</td>
          </tr>
          ${position ? `<tr>
            <td style="color:#64748B;font-size:14px;padding:6px 0;">📋 Pozisyon</td>
            <td style="color:#0F172A;font-size:14px;font-weight:600;padding:6px 0;">${position}</td>
          </tr>` : ''}
          ${interviewType ? `<tr>
            <td style="color:#64748B;font-size:14px;padding:6px 0;">🎯 Tür</td>
            <td style="color:#0F172A;font-size:14px;font-weight:600;padding:6px 0;">${interviewType}</td>
          </tr>` : ''}
          ${date ? `<tr>
            <td style="color:#64748B;font-size:14px;padding:6px 0;">📅 Tarih</td>
            <td style="color:#0F172A;font-size:14px;font-weight:600;padding:6px 0;">${date}</td>
          </tr>` : ''}
          ${time ? `<tr>
            <td style="color:#64748B;font-size:14px;padding:6px 0;">🕐 Saat</td>
            <td style="color:#0F172A;font-size:14px;font-weight:600;padding:6px 0;">${time}</td>
          </tr>` : ''}
          ${recruiterName ? `<tr>
            <td style="color:#64748B;font-size:14px;padding:6px 0;">🧑‍💼 Organizatör</td>
            <td style="color:#0F172A;font-size:14px;font-weight:600;padding:6px 0;">${recruiterName}</td>
          </tr>` : ''}
        </table>
      </div>

      ${meetLink ? `
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${meetLink}"
           style="background:${color};color:#ffffff;padding:15px 36px;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;display:inline-block;">
          Mülakata Katıl →
        </a>
      </div>` : ''}

      <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:14px 18px;">
        <p style="color:#1E40AF;font-size:13px;margin:0;">
          ℹ️ Bu davet Talent-Inn platformu üzerinden oluşturulmuştur. Katılamazsanız bu e-postaya yanıt vererek bildirin.
        </p>
      </div>
    `;
    return baseLayout(b, content);
}
