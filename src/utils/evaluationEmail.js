// "Değerlendirmeye Gönder" e-postasının saf kurucusu — UI'sız, birim test
// edilebilir. Seçili adaylar için iş arkadaşlarına gönderilecek HTML/metin
// gövdesini üretir: uyum skoru + POZİSYON UYUM ANALİZİ (kayıtlı AI analiz
// metni ve pozisyon-bazlı uyum tablosu) + kariyer özeti + isteğe bağlı
// detay kart derin-linki (?aday=<id>).
import { scoreForPosition, isDeepScanned, cleanRoleText } from './candidateTable';

export function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Seçili adayları e-posta satırlarına hazırlar (saf veri — HTML değil).
 * candidates: coherent skorlu satırlar (bestScore = gösterilen pozisyonun skoru).
 */
export function prepareEvaluationRows(candidates, openPositions, keywordScoreFn) {
    return (candidates || []).map((c) => {
        const matchedTitle = c.matchedPositionTitle || null;
        // Pozisyon uyum analizi metni: eşleşen pozisyon için kayıtlı AI özeti
        const analysisText = (matchedTitle && (
            c.positionAnalyses?.[matchedTitle]?.summary ||
            (c.aiAnalysis?.analyzedForPosition === matchedTitle ? c.aiAnalysis?.summary : '')
        )) || '';
        const fits = (openPositions || [])
            .map((p) => ({
                title: p.title,
                score: Math.round(scoreForPosition(c, p, keywordScoreFn)),
                isAi: Boolean(c.positionAnalyses?.[p.title]),
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
        const lastRoles = (Array.isArray(c.experiences) ? c.experiences : [])
            .slice(0, 2)
            .map((e) => ({ role: e.role || '', company: e.company || '', duration: e.duration || '' }));
        return {
            id: c.id,
            name: c.name || 'İsimsiz',
            matchedTitle,
            matchedScore: c.bestScore ?? null,
            scanned: isDeepScanned(c),
            cvRole: cleanRoleText(c.suggestedRole, c.position || ''),
            experienceYears: c.experience ?? null,
            education: c.education || '',
            analysisText,
            fits,
            lastRoles,
        };
    });
}

const S = {
    card: 'border:1px solid #E2E8F0;border-radius:12px;padding:16px;margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;',
    name: 'font-size:15px;font-weight:bold;color:#0F172A;margin:0;',
    meta: 'font-size:12px;color:#475569;margin:2px 0 0 0;',
    badge: 'display:inline-block;font-size:11px;font-weight:bold;padding:2px 8px;border-radius:999px;margin-left:6px;',
    quote: 'font-size:12px;color:#334155;font-style:italic;background:#F8FAFC;border-left:3px solid #94A3B8;padding:8px 10px;margin:10px 0;',
    th: 'text-align:left;font-size:10px;color:#64748B;text-transform:uppercase;padding:4px 8px;border-bottom:1px solid #E2E8F0;',
    td: 'font-size:12px;color:#334155;padding:4px 8px;border-bottom:1px solid #F1F5F9;',
    link: 'display:inline-block;font-size:12px;font-weight:bold;color:#FFFFFF;background:#13294E;padding:6px 14px;border-radius:8px;text-decoration:none;margin-top:10px;',
};

const scoreColor = (s) => (s >= 75 ? '#059669' : s >= 50 ? '#D97706' : '#DC2626');

function candidateCardHtml(r, { appUrl, includeTable, includeLinks }) {
    const scoreTxt = r.matchedScore != null
        ? `<span style="color:${scoreColor(r.matchedScore)};font-weight:bold;">%${escapeHtml(r.matchedScore)}</span>`
        : '—';
    const title = r.matchedTitle
        ? `${escapeHtml(r.matchedTitle)} · ${scoreTxt} uyum`
        : '<span style="color:#B45309;font-style:italic;">Uygun açık pozisyon yok</span>';
    const scanBadge = r.scanned
        ? `<span style="${S.badge}background:#ECFDF5;color:#047857;">Otonom tarama ✓</span>`
        : `<span style="${S.badge}background:#FFFBEB;color:#B45309;">Taranmadı</span>`;

    let html = `<div style="${S.card}">`;
    html += `<p style="${S.name}">${escapeHtml(r.name)}${scanBadge}</p>`;
    html += `<p style="${S.meta}">${title}</p>`;
    if (r.cvRole && r.cvRole !== r.matchedTitle) {
        html += `<p style="${S.meta}">CV'ye göre ideal rol: <b>${escapeHtml(r.cvRole)}</b></p>`;
    }

    if (includeTable) {
        // POZİSYON UYUM ANALİZİ — skorun yanında analiz metni de olmalı
        if (r.analysisText) {
            html += `<p style="${S.quote}">"${escapeHtml(r.analysisText)}"</p>`;
        }
        if (r.fits.length > 0) {
            html += `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0;">`
                + `<tr><th style="${S.th}">Pozisyon Uyumları</th><th style="${S.th}">Skor</th><th style="${S.th}">Kaynak</th></tr>`;
            for (const f of r.fits) {
                html += `<tr><td style="${S.td}">${escapeHtml(f.title)}</td>`
                    + `<td style="${S.td}"><b style="color:${scoreColor(f.score)};">%${f.score}</b></td>`
                    + `<td style="${S.td}">${f.isAi ? 'AI analizi' : 'anahtar kelime'}</td></tr>`;
            }
            html += `</table>`;
        }
        const career = [];
        if (r.experienceYears != null && r.experienceYears !== '') career.push(`${escapeHtml(r.experienceYears)} yıl deneyim`);
        for (const e of r.lastRoles) {
            career.push(escapeHtml([e.role, e.company].filter(Boolean).join(' — ') + (e.duration ? ` (${e.duration})` : '')));
        }
        if (r.education) career.push(escapeHtml(r.education));
        if (career.length > 0) {
            html += `<p style="${S.meta}">Kariyer: ${career.join(' · ')}</p>`;
        }
    }
    if (includeLinks) {
        html += `<a style="${S.link}" href="${appUrl}/?aday=${encodeURIComponent(r.id)}">Detayı Aç</a>`;
    }
    html += `</div>`;
    return html;
}

/**
 * E-postanın konu + HTML + düz metin hâlini üretir.
 */
export function buildEvaluationEmail({ rows, note, appUrl, includeTable = true, includeLinks = true, senderName = '' }) {
    const subject = `Aday değerlendirme talebi — ${rows.length} aday`;

    let html = `<div style="max-width:640px;font-family:Arial,Helvetica,sans-serif;">`;
    if (note) html += `<p style="font-size:13px;color:#0F172A;">${escapeHtml(note)}</p>`;
    for (const r of rows) html += candidateCardHtml(r, { appUrl, includeTable, includeLinks });
    html += `<p style="font-size:10px;color:#94A3B8;">Bu e-posta Talent-Inn üzerinden${senderName ? ` ${escapeHtml(senderName)} tarafından` : ''} gönderildi ve aday kişisel verisi içerir — lütfen kurum dışına iletmeyin.</p>`;
    html += `</div>`;

    const textLines = [];
    if (note) textLines.push(note, '');
    for (const r of rows) {
        textLines.push(`• ${r.name} — ${r.matchedTitle ? `${r.matchedTitle} (%${r.matchedScore ?? '—'} uyum)` : 'Uygun açık pozisyon yok'}${r.scanned ? ' [Otonom tarama ✓]' : ' [Taranmadı]'}`);
        if (includeTable && r.analysisText) textLines.push(`  Analiz: ${r.analysisText}`);
        if (includeTable) for (const f of r.fits) textLines.push(`  - ${f.title}: %${f.score} (${f.isAi ? 'AI' : 'anahtar kelime'})`);
        if (includeLinks) textLines.push(`  Detay: ${appUrl}/?aday=${r.id}`);
        textLines.push('');
    }
    return { subject, html, text: textLines.join('\n') };
}
