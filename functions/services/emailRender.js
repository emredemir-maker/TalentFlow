// ADAY E-POSTA ŞABLONLARI — sunucuda, şirketin ayarından (PR 7b).
//
// Şablonlar şirket yöneticisinin düzenlediği `tenants/{t}/settings/emailTemplates`
// belgesinden (EmailTemplateEditorPage), marka `settings/branding`'den okunur.
// Kayıtlı şablon yoksa aşağıdaki yerleşik şablon kullanılır.
//
// NEDEN SUNUCUDA: e-posta artık ortak Clyro alan adından gidiyor. İstemcinin
// hazır HTML göndermesine izin vermek, herhangi bir oturumun bu alan adından
// istediği içeriği (ör. oltalama bağlantısı) yollayabilmesi demekti. Şimdi:
//   • HTML'i istemci değil, şirketin kayıtlı şablonu belirler;
//   • istemciden yalnız DEĞİŞKENLER gelir ve HTML'e kaçışlanarak girer;
//   • bağlantı değişkenleri (katılım, yanıt) yalnız uygulamanın kendi adresine
//     ya da bilinen toplantı hizmetlerine izin verir.
import { childLogger } from './logger.js';

const log = childLogger('emailRender');

/** HTML kaçışı — değişken değerleri ŞABLONA ham girmez. */
export function escapeHtml(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const MEETING_HOSTS = ['meet.google.com', 'teams.microsoft.com', 'teams.live.com', 'zoom.us'];

/**
 * Bağlantı değişkeni güvenli mi? https (yerelde http://localhost), ve
 * uygulamanın kendi kökü (APP_URL) ya da bilinen toplantı hizmeti.
 * Değilse boş döner (e-postada bağlantı çıkmaz).
 */
export function safeLink(url, appUrl = '') {
    let u;
    try {
        u = new URL(String(url || ''));
    } catch {
        return '';
    }
    const local = u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
    if (u.protocol !== 'https:' && !local) return '';
    if (u.username || u.password) return '';
    let app = null;
    try {
        app = appUrl ? new URL(appUrl) : null;
    } catch {
        app = null;
    }
    const host = u.hostname.toLowerCase();
    const sameApp = app && u.origin === app.origin;
    const meeting = MEETING_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
    if (!sameApp && !meeting && !local) return '';
    return u.toString();
}

/** Marka renginin yalnız #RGB/#RRGGBB biçimi kabul edilir (style özniteliğine girer). */
function safeColor(c, fallback = '#0E7490') {
    return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(String(c || '')) ? c : fallback;
}

/** Logo yalnız https. */
function safeImage(url) {
    try {
        const u = new URL(String(url || ''));
        return u.protocol === 'https:' ? u.toString() : '';
    } catch {
        return '';
    }
}

/** Markadan güvenli alanlar. Şirket adı yoksa şirket belgesindeki ad. */
export function brandingOf(branding, tenantName = '') {
    const b = branding && typeof branding === 'object' ? branding : {};
    return {
        companyName: String(b.companyName || tenantName || '').slice(0, 100),
        tagline: String(b.tagline || '').slice(0, 200),
        logoUrl: safeImage(b.logoUrl),
        primaryColor: safeColor(b.primaryColor),
    };
}

/** {{BRANDING_HEADER}} — logo ya da baş harfler (değerler kaçışlı). */
export function brandingHeader(brand) {
    if (brand.logoUrl) {
        return `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.companyName)}" style="height:44px;max-width:200px;object-fit:contain;display:block;"/>`;
    }
    const initials = brand.companyName.split(/\s+/).map((w) => w[0] || '').join('').toUpperCase().slice(0, 2) || 'IK';
    return `<div style="display:inline-flex;align-items:center;gap:10px;"><div style="width:36px;height:36px;border-radius:9px;background:${brand.primaryColor};display:inline-flex;align-items:center;justify-content:center;"><span style="color:#fff;font-size:13px;font-weight:800;">${escapeHtml(initials)}</span></div><div><div style="color:#0F172A;font-size:16px;font-weight:800;">${escapeHtml(brand.companyName)}</div>${brand.tagline ? `<div style="color:#94A3B8;font-size:11px;">${escapeHtml(brand.tagline)}</div>` : ''}</div></div>`;
}

/** Şablon başına izinli değişkenler; bağlantı olanlar ayrıca. */
export const TEMPLATE_VARS = {
    invite: ['candidateName', 'recruiterName', 'position', 'date', 'time', 'interviewType', 'joinLink', 'companyEmail'],
    reschedule: ['candidateName', 'recruiterName', 'position', 'oldDate', 'oldTime', 'newDate', 'newTime', 'joinLink', 'isCancelled', 'companyEmail'],
    participant: ['participantName', 'candidateName', 'position', 'date', 'time', 'interviewType', 'meetLink', 'googleMeetLink', 'companyEmail'],
    feedback: ['candidateName', 'recruiterName', 'position', 'outcome', 'feedbackText', 'companyEmail'],
    infoRequest: ['candidateName', 'recruiterName', 'position', 'requestMessage', 'requestedItems', 'respondUrl', 'companyEmail'],
    confirmation: ['candidateName', 'recruiterName', 'position', 'date', 'time', 'interviewType', 'respondUrl', 'companyEmail'],
};
const LINK_VARS = new Set(['joinLink', 'meetLink', 'googleMeetLink', 'respondUrl']);
const MULTILINE_VARS = new Set(['feedbackText', 'requestMessage']);

const OUTCOME_LABEL = { positive: 'Olumlu', negative: 'Olumsuz', pending: 'Beklemede' };

/**
 * İstemciden gelen değişkenleri temizler: yalnız izinli anahtarlar, metin
 * 5000 karaktere kadar, bağlantılar safeLink'ten geçer. Değerler HENÜZ
 * kaçışlanmamış düz metindir.
 */
export function cleanVars(key, raw, { appUrl = '' } = {}) {
    const allowed = TEMPLATE_VARS[key] || [];
    const out = {};
    const src = raw && typeof raw === 'object' ? raw : {};
    for (const k of allowed) {
        const v = src[k];
        if (v == null) continue;
        if (k === 'requestedItems') {
            out[k] = (Array.isArray(v) ? v : []).filter((x) => typeof x === 'string').slice(0, 30).map((x) => x.slice(0, 300));
        } else if (k === 'isCancelled') {
            out[k] = v === true;
        } else if (LINK_VARS.has(k)) {
            const l = safeLink(v, appUrl);
            if (l) out[k] = l;
        } else {
            out[k] = String(v).slice(0, MULTILINE_VARS.has(k) ? 10_000 : 300);
        }
    }
    return out;
}

/** Değişkenin HTML'e girecek (kaçışlı) biçimi. */
function htmlValue(k, v) {
    if (k === 'requestedItems') {
        return (v || []).map((i) => `<li style="margin:6px 0;">${escapeHtml(i)}</li>`).join('');
    }
    if (k === 'outcome') return escapeHtml(OUTCOME_LABEL[v] || v);
    if (k === 'isCancelled') return v ? 'iptal' : '';
    if (MULTILINE_VARS.has(k)) return escapeHtml(v).replace(/\r?\n/g, '<br/>');
    return escapeHtml(v);
}

/** {{değişken}} yerleştirme — kayıtlı şablonlar için. */
export function applyVars(template, vars, brand) {
    const merged = {
        companyName: escapeHtml(brand.companyName),
        tagline: escapeHtml(brand.tagline),
        logoUrl: escapeHtml(brand.logoUrl),
        primaryColor: brand.primaryColor,
        BRANDING_HEADER: brandingHeader(brand),
    };
    for (const [k, v] of Object.entries(vars)) merged[k] = htmlValue(k, v);
    return String(template || '').replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_, name) =>
        Object.prototype.hasOwnProperty.call(merged, name) ? merged[name] : ''
    );
}

/** Konu satırı: değişkenler düz metin (HTML kaçışı yok, satır sonu yok). */
function applySubjectVars(template, vars, brand) {
    const merged = { companyName: brand.companyName, ...vars };
    return String(template || '')
        .replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_, name) => {
            const v = merged[name];
            if (name === 'outcome') return OUTCOME_LABEL[v] || v || '';
            return typeof v === 'string' ? v : '';
        })
        .replace(/[\r\n]+/g, ' ');
}

// ── Yerleşik şablonlar (şirket kendi şablonunu kaydetmediyse) ───────────────

function layout(brand, inner) {
    return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:32px 0;background:#F1F5F9;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#334155;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#fff;border-radius:16px;overflow:hidden;">
<tr><td style="height:4px;background:${brand.primaryColor};"></td></tr>
<tr><td style="padding:28px 40px 0;">${brandingHeader(brand)}</td></tr>
<tr><td style="padding:20px 40px 32px;font-size:14px;line-height:1.7;">${inner}</td></tr>
</table></td></tr></table></body></html>`;
}

const button = (brand, href, label) =>
    href
        ? `<p style="text-align:center;margin:28px 0;"><a href="${escapeHtml(href)}" style="background:${brand.primaryColor};color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;">${escapeHtml(label)}</a></p>`
        : '';
const sign = (v) => `<p style="color:#94A3B8;margin-top:24px;">Saygılarımızla,<br/><strong style="color:#334155;">${escapeHtml(v.recruiterName || 'İK Ekibi')}</strong></p>`;
const hello = (name) => `<p>Sayın <strong>${escapeHtml(name || 'Aday')}</strong>,</p>`;
const posLine = (v) => (v.position ? `<p style="color:#64748B;margin:0 0 12px;">Pozisyon: <strong>${escapeHtml(v.position)}</strong></p>` : '');
const when = (d, t) => [d, t].filter(Boolean).map(escapeHtml).join(' ');

const BUILT_IN = {
    invite: {
        subject: (v, b) => `Mülakat Davetiniz — ${v.position || b.companyName || 'Başvurunuz'}`,
        body: (v, b) => `${hello(v.candidateName)}${posLine(v)}<p>${escapeHtml(b.companyName || 'Şirketimiz')} ile ${escapeHtml(v.interviewType || 'mülakat')} görüşmenize davetlisiniz.</p>
<p><strong>Tarih:</strong> ${when(v.date, v.time) || '—'}</p>${button(b, v.joinLink, 'Görüşmeye Katıl')}${sign(v)}`,
    },
    reschedule: {
        subject: (v, b) => (v.isCancelled ? `Mülakat İptali — ${v.position || b.companyName}` : `Mülakat Tarihi Güncellendi — ${v.position || b.companyName}`),
        body: (v, b) => `${hello(v.candidateName)}${posLine(v)}${v.isCancelled
            ? `<p>${when(v.oldDate, v.oldTime)} tarihli görüşmeniz maalesef iptal edilmiştir.</p>`
            : `<p>${when(v.oldDate, v.oldTime)} tarihli görüşmenizin zamanı güncellendi.</p><p><strong>Yeni tarih:</strong> ${when(v.newDate || v.oldDate, v.newTime || v.oldTime)}</p>${button(b, v.joinLink, 'Görüşmeye Katıl')}`}${sign(v)}`,
    },
    participant: {
        subject: (v) => `Mülakat Daveti — ${v.candidateName || 'Aday'} ile görüşme`,
        body: (v, b) => `<p>Merhaba${v.participantName ? ` <strong>${escapeHtml(v.participantName)}</strong>` : ''},</p>
<p><strong>${escapeHtml(v.candidateName || 'aday')}</strong> ile yapılacak görüşmeye katılımcı olarak eklendiniz.</p>${posLine(v)}
<p><strong>Tarih:</strong> ${when(v.date, v.time) || 'şimdi'}</p>${button(b, v.meetLink || v.googleMeetLink, 'Görüşmeye Katıl')}`,
    },
    feedback: {
        subject: (v) => `Başvurunuz Hakkında Geri Bildirim — ${OUTCOME_LABEL[v.outcome] || 'Bilgilendirme'}`,
        body: (v) => `${hello(v.candidateName)}${posLine(v)}<p>Başvurunuz değerlendirilmiştir. Sürecinize ilişkin geri bildirimimiz aşağıdadır.</p>
<div style="background:#F8FAFC;border-left:4px solid #94A3B8;padding:16px 20px;margin:16px 0;">${htmlValue('feedbackText', v.feedbackText || '')}</div>${sign(v)}`,
    },
    infoRequest: {
        subject: (v) => `Bilgi Talebi — ${v.position || 'Başvurunuz'}`,
        body: (v, b) => `${hello(v.candidateName)}${posLine(v)}<p>Başvurunuzu inceleme sürecimizde sizden bazı ek bilgi veya belgeler talep ediyoruz.</p>
${v.requestMessage ? `<div style="background:#F8FAFC;border-left:4px solid ${b.primaryColor};padding:16px;margin:16px 0;">${htmlValue('requestMessage', v.requestMessage)}</div>` : ''}
${v.requestedItems?.length ? `<p><strong>Talep edilenler:</strong></p><ul>${htmlValue('requestedItems', v.requestedItems)}</ul>` : ''}${button(b, v.respondUrl, 'Bilgi Gönder')}${sign(v)}`,
    },
    confirmation: {
        subject: (v, b) => `Mülakat Onayı — ${v.position || b.companyName}`,
        body: (v, b) => `${hello(v.candidateName)}${posLine(v)}<p>${when(v.date, v.time)} tarihli ${escapeHtml(v.interviewType || 'görüşme')} için katılımınızı onaylamanızı rica ederiz.</p>${button(b, v.respondUrl, 'Yanıtla')}${sign(v)}`,
    },
};

/**
 * Şablonu işler.
 * @param {string} key  invite | reschedule | participant | feedback | infoRequest | confirmation
 * @param {object} vars cleanVars çıktısı (düz metin)
 * @param {{ templates?: object, branding?: object, tenantName?: string }} settings
 * @returns {{ subject: string, html: string, source: 'tenant'|'built-in' }}
 */
export function renderEmail(key, vars, { templates = {}, branding = {}, tenantName = '' } = {}) {
    const def = BUILT_IN[key];
    if (!def) throw new Error(`Bilinmeyen şablon: ${key}`);
    const brand = brandingOf(branding, tenantName);
    const saved = templates?.[key];
    if (saved && typeof saved.html === 'string' && saved.html.trim()) {
        const subject = saved.subject ? applySubjectVars(saved.subject, vars, brand) : def.subject(vars, brand);
        return { subject, html: applyVars(saved.html, vars, brand), source: 'tenant' };
    }
    return { subject: def.subject(vars, brand), html: layout(brand, def.body(vars, brand)), source: 'built-in' };
}

/** Şirketin şablon + marka ayarı (okunamazsa yerleşiklerle devam). */
export async function loadEmailSettings(db, paths) {
    try {
        const [t, b] = await db.getAll(db.doc(paths.settings('emailTemplates')), db.doc(paths.settings('branding')));
        return { templates: t.exists ? t.data() : {}, branding: b.exists ? b.data() : {} };
    } catch (err) {
        log.warn({ err: err?.message }, 'şablon ayarı okunamadı — yerleşik şablon');
        return { templates: {}, branding: {} };
    }
}
