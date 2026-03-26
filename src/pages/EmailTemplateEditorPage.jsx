// src/pages/EmailTemplateEditorPage.jsx
// Block-based email template editor with drag-and-drop, HTML code mode, variable panel, preview, Firestore save

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../config/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import {
    Mail, Code, Eye, Save, Plus, Trash2, GripVertical,
    Type, AlignLeft, Table2, MousePointerClick, Info,
    UserCheck, ChevronDown, ChevronUp, Copy, RotateCcw,
    CheckCircle, Loader2, LayoutTemplate, Variable
} from 'lucide-react';
import { invalidateTemplateCache } from '../utils/templateService';

const SETTINGS_PATH = 'artifacts/talent-flow/public/data/settings';

// ─── Template types ───────────────────────────────────────────────────────────
const TEMPLATE_TYPES = [
    { id: 'invite',      label: 'Mülakat Daveti',    icon: Mail },
    { id: 'reschedule',  label: 'Erteleme / İptal',  icon: RotateCcw },
    { id: 'participant', label: 'Katılımcı Daveti',  icon: UserCheck },
];

// ─── Available variables per template ────────────────────────────────────────
const TEMPLATE_VARIABLES = {
    invite: [
        { key: '{{candidateName}}',  label: 'Aday Adı' },
        { key: '{{recruiterName}}',  label: 'Görüşmeci Adı' },
        { key: '{{position}}',       label: 'Pozisyon' },
        { key: '{{date}}',           label: 'Tarih' },
        { key: '{{time}}',           label: 'Saat' },
        { key: '{{interviewType}}',  label: 'Mülakat Türü' },
        { key: '{{joinLink}}',       label: 'Katılım Linki' },
        { key: '{{companyName}}',    label: 'Şirket Adı' },
    ],
    reschedule: [
        { key: '{{candidateName}}',  label: 'Aday Adı' },
        { key: '{{recruiterName}}',  label: 'Görüşmeci Adı' },
        { key: '{{position}}',       label: 'Pozisyon' },
        { key: '{{oldDate}}',        label: 'Eski Tarih' },
        { key: '{{oldTime}}',        label: 'Eski Saat' },
        { key: '{{newDate}}',        label: 'Yeni Tarih' },
        { key: '{{newTime}}',        label: 'Yeni Saat' },
        { key: '{{companyName}}',    label: 'Şirket Adı' },
    ],
    participant: [
        { key: '{{participantName}}', label: 'Katılımcı Adı' },
        { key: '{{candidateName}}',   label: 'Aday Adı' },
        { key: '{{position}}',        label: 'Pozisyon' },
        { key: '{{date}}',            label: 'Tarih' },
        { key: '{{time}}',            label: 'Saat' },
        { key: '{{interviewType}}',   label: 'Mülakat Türü' },
        { key: '{{meetLink}}',        label: 'Meet Linki' },
        { key: '{{recruiterName}}',   label: 'Organizatör' },
    ],
};

// ─── Block types ──────────────────────────────────────────────────────────────
const BLOCK_TYPES = [
    { type: 'heading',    label: 'Başlık',          icon: Type },
    { type: 'text',       label: 'Metin Paragrafı', icon: AlignLeft },
    { type: 'info_table', label: 'Bilgi Tablosu',   icon: Table2 },
    { type: 'button',     label: 'Buton',           icon: MousePointerClick },
    { type: 'alert',      label: 'Bilgi Kutusu',    icon: Info },
    { type: 'signature',  label: 'İmza',            icon: UserCheck },
];

function defaultBlock(type, color) {
    const id = `blk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    switch (type) {
        case 'heading':    return { id, type, level: 'h2', text: 'Yeni Başlık' };
        case 'text':       return { id, type, text: 'Buraya metin yazın...' };
        case 'info_table': return { id, type, rows: [{ label: 'Alan', value: 'Değer' }] };
        case 'button':     return { id, type, label: 'Tıklayın', href: '{{joinLink}}', color: color || '#0E7490' };
        case 'alert':      return { id, type, variant: 'info', text: 'Bilgi mesajı buraya gelecek.' };
        case 'signature':  return { id, type, name: '{{recruiterName}}', title: '{{companyName}} İnsan Kaynakları' };
        default:           return { id, type, text: '' };
    }
}

// ─── Default block sets per template ─────────────────────────────────────────
function defaultBlocks(templateId, color) {
    const c = color || '#0E7490';
    switch (templateId) {
        case 'invite':
            return [
                { ...defaultBlock('heading', c), text: 'Mülakat Davetiniz', level: 'h1' },
                { ...defaultBlock('text', c), text: 'Sayın {{candidateName}},\n\n{{companyName}} İnsan Kaynakları ekibi olarak sizi değerlendirme sürecimize davet etmekten memnuniyet duyuyoruz.' },
                { ...defaultBlock('info_table', c), rows: [
                    { label: 'Pozisyon',      value: '{{position}}' },
                    { label: 'Mülakat Türü',  value: '{{interviewType}}' },
                    { label: 'Tarih',         value: '{{date}}' },
                    { label: 'Saat',          value: '{{time}}' },
                    { label: 'Görüşmeci',     value: '{{recruiterName}}' },
                ]},
                { ...defaultBlock('button', c), label: 'Mülakata Katıl →', href: '{{joinLink}}' },
                { ...defaultBlock('alert', c), variant: 'success', text: 'Katılım onayı için bu e-postaya yanıt verebilirsiniz.' },
                { ...defaultBlock('signature', c) },
            ];
        case 'reschedule':
            return [
                { ...defaultBlock('heading', c), text: 'Mülakat Tarihi Güncellendi', level: 'h1' },
                { ...defaultBlock('text', c), text: 'Sayın {{candidateName}},\n\n{{companyName}} ile planlanmış olan mülakatınızın tarihi güncellenmiştir.' },
                { ...defaultBlock('info_table', c), rows: [
                    { label: 'Eski Tarih', value: '{{oldDate}}' },
                    { label: 'Eski Saat',  value: '{{oldTime}}' },
                ]},
                { ...defaultBlock('info_table', c), rows: [
                    { label: 'Yeni Tarih', value: '{{newDate}}' },
                    { label: 'Yeni Saat',  value: '{{newTime}}' },
                    { label: 'Pozisyon',   value: '{{position}}' },
                ]},
                { ...defaultBlock('alert', c), variant: 'info', text: 'Yeni tarih size uygun değilse lütfen bizimle iletişime geçin.' },
                { ...defaultBlock('signature', c) },
            ];
        case 'participant':
            return [
                { ...defaultBlock('heading', c), text: 'Mülakat Değerlendirici Daveti', level: 'h1' },
                { ...defaultBlock('text', c), text: 'Sayın {{participantName}},\n\nAşağıdaki mülakata değerlendirici olarak yer almanız için davet edildiniz.' },
                { ...defaultBlock('info_table', c), rows: [
                    { label: 'Aday',          value: '{{candidateName}}' },
                    { label: 'Pozisyon',      value: '{{position}}' },
                    { label: 'Mülakat Türü',  value: '{{interviewType}}' },
                    { label: 'Tarih',         value: '{{date}}' },
                    { label: 'Saat',          value: '{{time}}' },
                    { label: 'Organizatör',   value: '{{recruiterName}}' },
                ]},
                { ...defaultBlock('button', c), label: 'Mülakata Katıl →', href: '{{meetLink}}' },
                { ...defaultBlock('signature', c) },
            ];
        default:
            return [defaultBlock('text', c)];
    }
}

// ─── Block → HTML renderer ────────────────────────────────────────────────────
function blocksToHtml(blocks, branding) {
    const color = branding?.primaryColor || '#0E7490';
    const parts = blocks.map(block => {
        switch (block.type) {
            case 'heading':
                return block.level === 'h1'
                    ? `<h2 style="color:#0F172A;font-size:24px;font-weight:800;margin:0 0 12px 0;letter-spacing:-0.5px;">${block.text}</h2>`
                    : `<h3 style="color:#1E293B;font-size:18px;font-weight:700;margin:0 0 10px 0;">${block.text}</h3>`;
            case 'text':
                return block.text.split('\n\n').map(p =>
                    `<p style="color:#475569;font-size:15px;line-height:1.75;margin:0 0 16px 0;">${p.replace(/\n/g, '<br/>')}</p>`
                ).join('');
            case 'info_table': {
                const rgb = branding?.primaryColor ? hexToRgb(branding.primaryColor) : '14, 116, 144';
                const rows = (block.rows || []).map(r =>
                    `<tr>
                      <td style="color:#64748B;font-size:13px;padding:8px 0;width:140px;vertical-align:top;font-weight:500;">${r.label}</td>
                      <td style="color:#0F172A;font-size:13px;padding:8px 0;font-weight:700;vertical-align:top;">${r.value}</td>
                    </tr>`
                ).join('');
                return `<div style="background:rgba(${rgb},0.05);border:1px solid rgba(${rgb},0.15);border-radius:14px;padding:20px 24px;margin:20px 0;">
                  <table cellpadding="0" cellspacing="0" width="100%">${rows}</table>
                </div>`;
            }
            case 'button':
                return `<div style="text-align:center;margin:28px 0;">
                  <a href="${block.href || '#'}" style="display:inline-block;background:${block.color || color};color:#fff;text-decoration:none;padding:16px 44px;border-radius:12px;font-weight:700;font-size:15px;box-shadow:0 4px 14px rgba(0,0,0,0.15);">${block.label || 'Tıklayın'}</a>
                </div>`;
            case 'alert': {
                const variants = {
                    info:    { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF' },
                    success: { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D' },
                    warning: { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
                    danger:  { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B' },
                };
                const v = variants[block.variant] || variants.info;
                return `<div style="background:${v.bg};border:1px solid ${v.border};border-radius:10px;padding:16px 20px;margin:16px 0;">
                  <p style="color:${v.text};font-size:13px;margin:0;line-height:1.6;">${block.text}</p>
                </div>`;
            }
            case 'signature':
                return `<p style="color:#475569;font-size:14px;margin:24px 0 0 0;line-height:1.6;">
                  Saygılarımızla,<br/><br/>
                  <strong>${block.name || '{{recruiterName}}'}</strong><br/>
                  <span style="color:#94A3B8;font-size:13px;">${block.title || '{{companyName}} İnsan Kaynakları'}</span>
                </p>`;
            default:
                return '';
        }
    });
    return parts.join('\n');
}

function hexToRgb(hex) {
    const clean = (hex || '#0E7490').replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `${r}, ${g}, ${b}`;
}

// ─── Build preview HTML from blocks ──────────────────────────────────────────
function buildPreviewHtml(blocks, branding) {
    const color = branding?.primaryColor || '#0E7490';
    const rgb = hexToRgb(color);
    const company = branding?.companyName || 'Şirket Adı';
    const tagline = branding?.tagline || '';
    const logoUrl = branding?.logoUrl || '';
    // Dynamic initials: first letters of each word (max 2)
    const initials = company.split(/\s+/).map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || 'IK';

    const logoBlock = logoUrl
        ? `<img src="${logoUrl}" alt="${company}" style="height:44px;max-width:200px;object-fit:contain;display:block;"/>`
        : `<div style="display:inline-flex;align-items:center;gap:10px;">
             <div style="width:36px;height:36px;border-radius:9px;background:${color};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">
               <span style="color:#fff;font-size:13px;font-weight:800;letter-spacing:-0.5px;">${initials}</span>
             </div>
             <div>
               <div style="color:#0F172A;font-size:16px;font-weight:800;line-height:1.2;">${company}</div>
               ${tagline ? `<div style="color:#94A3B8;font-size:11px;margin-top:2px;">${tagline}</div>` : ''}
             </div>
           </div>`;

    const content = blocksToHtml(blocks, branding);

    return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#EFF6FF;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#EFF6FF;padding:32px 0;">
  <tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
      <tr><td style="height:5px;background:linear-gradient(90deg,${color} 0%,rgba(${rgb},0.4) 100%);"></td></tr>
      <tr><td style="padding:32px 48px 24px;border-bottom:1px solid #E2E8F0;">
        ${logoBlock}
      </td></tr>
      <tr><td style="padding:36px 48px 32px;">${content}</td></tr>
      <tr><td style="background:#F8FAFC;padding:22px 48px;border-top:1px solid #E2E8F0;text-align:center;">
        <p style="color:#94A3B8;font-size:12px;margin:0;">Bu e-posta <strong style="color:${color};">${company}</strong> İK Platformu aracılığıyla gönderilmiştir.</p>
        <p style="color:#CBD5E1;font-size:11px;margin:4px 0 0 0;">Bu iletiyi hatalı aldıysanız lütfen görmezden geliniz.</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

// ─── Replace variables with sample data for preview ──────────────────────────
function applySampleVars(html, branding) {
    const today = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
    const companyName = branding?.companyName || 'Şirket Adı';
    return html
        .replace(/\{\{candidateName\}\}/g, 'Ayşe Kaya')
        .replace(/\{\{recruiterName\}\}/g, 'Emre Demir')
        .replace(/\{\{participantName\}\}/g, 'Can Yıldız')
        .replace(/\{\{position\}\}/g, 'Frontend Developer')
        .replace(/\{\{date\}\}/g, today)
        .replace(/\{\{time\}\}/g, '14:30')
        .replace(/\{\{oldDate\}\}/g, today)
        .replace(/\{\{oldTime\}\}/g, '11:00')
        .replace(/\{\{newDate\}\}/g, '28 Mart 2026')
        .replace(/\{\{newTime\}\}/g, '14:30')
        .replace(/\{\{interviewType\}\}/g, 'Teknik Değerlendirmesi')
        .replace(/\{\{joinLink\}\}/g, 'https://example.com/join/abc123')
        .replace(/\{\{meetLink\}\}/g, 'https://meet.google.com/xyz')
        .replace(/\{\{companyName\}\}/g, companyName)
        .replace(/\{\{companyEmail\}\}/g, `ik@${companyName.toLowerCase().replace(/\s+/g, '')}.com`);
}

// ─── Individual Block Editor ──────────────────────────────────────────────────
function BlockEditor({ block, onUpdate, onDelete, color, insertVariable, dragHandleProps, isDragging }) {
    const [expanded, setExpanded] = useState(true);

    const handleTextInsert = (fieldKey, varKey) => {
        onUpdate({ ...block, [fieldKey]: (block[fieldKey] || '') + varKey });
    };

    return (
        <div
            className={`border rounded-xl bg-white transition-all ${isDragging ? 'shadow-xl scale-[1.01] opacity-80 border-blue-300' : 'border-slate-200 shadow-sm'}`}
        >
            {/* Block header */}
            <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 rounded-t-xl border-b border-slate-100">
                <span
                    {...dragHandleProps}
                    className="text-slate-300 cursor-grab active:cursor-grabbing hover:text-slate-500 transition-colors"
                    title="Sürükle"
                >
                    <GripVertical size={16} />
                </span>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex-1">
                    {BLOCK_TYPES.find(b => b.type === block.type)?.label || block.type}
                </span>
                <button
                    onClick={() => setExpanded(e => !e)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
                >
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <button
                    onClick={onDelete}
                    className="text-slate-300 hover:text-red-500 p-0.5 rounded transition-colors"
                >
                    <Trash2 size={14} />
                </button>
            </div>

            {expanded && (
                <div className="p-3 space-y-2">
                    {/* Heading */}
                    {block.type === 'heading' && (
                        <div className="space-y-2">
                            <select
                                value={block.level || 'h2'}
                                onChange={e => onUpdate({ ...block, level: e.target.value })}
                                className="text-xs border border-slate-200 rounded px-2 py-1 bg-white text-slate-600"
                            >
                                <option value="h1">Büyük Başlık (H1)</option>
                                <option value="h2">Orta Başlık (H2)</option>
                            </select>
                            <input
                                value={block.text}
                                onChange={e => onUpdate({ ...block, text: e.target.value })}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                                placeholder="Başlık metni..."
                            />
                        </div>
                    )}

                    {/* Text */}
                    {block.type === 'text' && (
                        <textarea
                            value={block.text}
                            onChange={e => onUpdate({ ...block, text: e.target.value })}
                            rows={4}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-blue-400"
                            placeholder="Paragraf metni... (yeni paragraf için boş satır bırakın)"
                        />
                    )}

                    {/* Info Table */}
                    {block.type === 'info_table' && (
                        <div className="space-y-1.5">
                            {(block.rows || []).map((row, i) => (
                                <div key={i} className="flex gap-2 items-center">
                                    <input
                                        value={row.label}
                                        onChange={e => {
                                            const rows = [...block.rows];
                                            rows[i] = { ...rows[i], label: e.target.value };
                                            onUpdate({ ...block, rows });
                                        }}
                                        placeholder="Etiket"
                                        className="w-28 border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                                    />
                                    <input
                                        value={row.value}
                                        onChange={e => {
                                            const rows = [...block.rows];
                                            rows[i] = { ...rows[i], value: e.target.value };
                                            onUpdate({ ...block, rows });
                                        }}
                                        placeholder="Değer veya {{değişken}}"
                                        className="flex-1 border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                                    />
                                    <button
                                        onClick={() => {
                                            const rows = block.rows.filter((_, idx) => idx !== i);
                                            onUpdate({ ...block, rows });
                                        }}
                                        className="text-slate-300 hover:text-red-400"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            ))}
                            <button
                                onClick={() => onUpdate({ ...block, rows: [...(block.rows || []), { label: 'Alan', value: '' }] })}
                                className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 mt-1"
                            >
                                <Plus size={12} /> Satır Ekle
                            </button>
                        </div>
                    )}

                    {/* Button */}
                    {block.type === 'button' && (
                        <div className="space-y-2">
                            <input
                                value={block.label}
                                onChange={e => onUpdate({ ...block, label: e.target.value })}
                                placeholder="Buton metni"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                            <input
                                value={block.href}
                                onChange={e => onUpdate({ ...block, href: e.target.value })}
                                placeholder="URL veya {{joinLink}}"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-slate-500">Renk:</label>
                                <input
                                    type="color"
                                    value={block.color || color}
                                    onChange={e => onUpdate({ ...block, color: e.target.value })}
                                    className="w-8 h-7 rounded cursor-pointer border border-slate-200"
                                />
                                <span className="text-xs text-slate-400">{block.color || color}</span>
                            </div>
                        </div>
                    )}

                    {/* Alert */}
                    {block.type === 'alert' && (
                        <div className="space-y-2">
                            <select
                                value={block.variant || 'info'}
                                onChange={e => onUpdate({ ...block, variant: e.target.value })}
                                className="text-xs border border-slate-200 rounded px-2 py-1 bg-white text-slate-600"
                            >
                                <option value="info">Mavi — Bilgi</option>
                                <option value="success">Yeşil — Başarı</option>
                                <option value="warning">Sarı — Uyarı</option>
                                <option value="danger">Kırmızı — Hata/İptal</option>
                            </select>
                            <textarea
                                value={block.text}
                                onChange={e => onUpdate({ ...block, text: e.target.value })}
                                rows={2}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                        </div>
                    )}

                    {/* Signature */}
                    {block.type === 'signature' && (
                        <div className="space-y-2">
                            <input
                                value={block.name}
                                onChange={e => onUpdate({ ...block, name: e.target.value })}
                                placeholder="İsim veya {{recruiterName}}"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                            <input
                                value={block.title}
                                onChange={e => onUpdate({ ...block, title: e.target.value })}
                                placeholder="Unvan"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function EmailTemplateEditorPage() {
    const { userProfile } = useAuth();

    const [activeTemplate, setActiveTemplate] = useState('invite');
    const [mode, setMode] = useState('blocks'); // 'blocks' | 'html' | 'preview'
    const [blocks, setBlocks] = useState({});
    const [htmlCode, setHtmlCode] = useState({});
    const [subjectLines, setSubjectLines] = useState({});
    const [branding, setBranding] = useState({ companyName: 'Talent-Inn', primaryColor: '#0E7490', tagline: 'Akıllı İnsan Kaynakları Platformu' });
    const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | success
    const [loadingTemplates, setLoadingTemplates] = useState(true);

    // Drag-and-drop state
    const dragIndexRef = useRef(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);

    // Load branding + saved templates
    useEffect(() => {
        const load = async () => {
            try {
                const [brandingSnap, templatesSnap] = await Promise.all([
                    getDoc(doc(db, SETTINGS_PATH, 'branding')),
                    getDoc(doc(db, SETTINGS_PATH, 'emailTemplates')),
                ]);
                if (brandingSnap.exists()) setBranding(brandingSnap.data());

                const savedBlocks = {};
                const savedHtml = {};
                const savedSubjects = {};
                const defaultSubjects = {
                    invite:      'Mülakat Daveti: {{interviewType}} - {{candidateName}}',
                    reschedule:  'Mülakat Tarihi Güncellendi - {{candidateName}}',
                    participant: 'Mülakat Daveti: {{interviewType}} — {{candidateName}}',
                };

                TEMPLATE_TYPES.forEach(t => {
                    const bkg = brandingSnap.exists() ? brandingSnap.data() : branding;
                    const color = bkg.primaryColor || '#0E7490';
                    if (templatesSnap.exists() && templatesSnap.data()[t.id]) {
                        const saved = templatesSnap.data()[t.id];
                        savedBlocks[t.id] = saved.blocks || defaultBlocks(t.id, color);
                        savedHtml[t.id] = saved.html || '';
                        savedSubjects[t.id] = saved.subject || defaultSubjects[t.id];
                    } else {
                        savedBlocks[t.id] = defaultBlocks(t.id, color);
                        savedHtml[t.id] = '';
                        savedSubjects[t.id] = defaultSubjects[t.id];
                    }
                });

                setBlocks(savedBlocks);
                setHtmlCode(savedHtml);
                setSubjectLines(savedSubjects);
            } catch (e) {
                console.warn('[EmailTemplateEditor] Load error:', e.message);
            } finally {
                setLoadingTemplates(false);
            }
        };
        load();
    }, []);

    const currentBlocks = blocks[activeTemplate] || [];
    const currentHtml = htmlCode[activeTemplate] || '';
    const currentSubject = subjectLines[activeTemplate] || '';

    // Sync blocks → html when switching to html mode
    useEffect(() => {
        if (mode === 'html' && currentBlocks.length > 0 && !htmlCode[activeTemplate]) {
            setHtmlCode(prev => ({ ...prev, [activeTemplate]: buildPreviewHtml(currentBlocks, branding) }));
        }
    }, [mode, activeTemplate]);

    const updateBlock = useCallback((idx, updatedBlock) => {
        setBlocks(prev => {
            const arr = [...(prev[activeTemplate] || [])];
            arr[idx] = updatedBlock;
            return { ...prev, [activeTemplate]: arr };
        });
    }, [activeTemplate]);

    const deleteBlock = useCallback((idx) => {
        setBlocks(prev => {
            const arr = [...(prev[activeTemplate] || [])];
            arr.splice(idx, 1);
            return { ...prev, [activeTemplate]: arr };
        });
    }, [activeTemplate]);

    const addBlock = useCallback((type) => {
        const color = branding.primaryColor || '#0E7490';
        setBlocks(prev => {
            const arr = [...(prev[activeTemplate] || [])];
            arr.push(defaultBlock(type, color));
            return { ...prev, [activeTemplate]: arr };
        });
    }, [activeTemplate, branding]);

    const resetToDefault = useCallback(() => {
        const color = branding.primaryColor || '#0E7490';
        setBlocks(prev => ({ ...prev, [activeTemplate]: defaultBlocks(activeTemplate, color) }));
        setHtmlCode(prev => ({ ...prev, [activeTemplate]: '' }));
    }, [activeTemplate, branding]);

    // ── Drag and drop handlers ──
    const handleDragStart = (idx) => { dragIndexRef.current = idx; };
    const handleDragOver = (e, idx) => {
        e.preventDefault();
        setDragOverIndex(idx);
    };
    const handleDrop = (e, idx) => {
        e.preventDefault();
        const from = dragIndexRef.current;
        if (from === null || from === idx) { setDragOverIndex(null); return; }
        setBlocks(prev => {
            const arr = [...(prev[activeTemplate] || [])];
            const [moved] = arr.splice(from, 1);
            arr.splice(idx, 0, moved);
            return { ...prev, [activeTemplate]: arr };
        });
        dragIndexRef.current = null;
        setDragOverIndex(null);
    };
    const handleDragEnd = () => {
        dragIndexRef.current = null;
        setDragOverIndex(null);
    };

    // ── Save ──
    const handleSave = async () => {
        setSaveStatus('saving');
        try {
            const toSave = {};
            TEMPLATE_TYPES.forEach(t => {
                const blks = blocks[t.id] || [];
                toSave[t.id] = {
                    blocks: blks,
                    html: htmlCode[t.id] || buildPreviewHtml(blks, branding),
                    subject: subjectLines[t.id] || '',
                    updatedAt: new Date().toISOString(),
                };
            });
            await setDoc(doc(db, SETTINGS_PATH, 'emailTemplates'), toSave, { merge: true });
            invalidateTemplateCache();
            setSaveStatus('success');
            setTimeout(() => setSaveStatus('idle'), 2500);
        } catch (e) {
            console.error('[EmailTemplateEditor] Save error:', e.message);
            setSaveStatus('idle');
            alert('Kayıt hatası: ' + e.message);
        }
    };

    // ── Variable insertion ──
    const insertVariable = (varKey) => {
        if (mode === 'html') {
            setHtmlCode(prev => ({ ...prev, [activeTemplate]: (prev[activeTemplate] || '') + varKey }));
        }
    };

    // ── Preview html ──
    const previewHtml = mode === 'preview'
        ? applySampleVars(
            currentHtml || buildPreviewHtml(currentBlocks, branding),
            branding
        )
        : '';

    if (loadingTemplates) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                <span className="ml-2 text-slate-500 text-sm">Şablonlar yükleniyor...</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* ── Top Bar ── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                        <LayoutTemplate className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-base font-700 text-slate-800 font-semibold">E-posta Şablon Editörü</h2>
                        <p className="text-xs text-slate-400">Aday e-postalarınızı özelleştirin</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={resetToDefault}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                        <RotateCcw size={13} /> Varsayılanı Yükle
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saveStatus === 'saving'}
                        className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors"
                        style={{
                            background: saveStatus === 'success' ? '#16A34A' : (branding.primaryColor || '#0E7490'),
                            color: '#fff',
                        }}
                    >
                        {saveStatus === 'saving' ? <Loader2 size={14} className="animate-spin" /> :
                         saveStatus === 'success' ? <CheckCircle size={14} /> : <Save size={14} />}
                        {saveStatus === 'saving' ? 'Kaydediliyor...' :
                         saveStatus === 'success' ? 'Kaydedildi!' : 'Kaydet'}
                    </button>
                </div>
            </div>

            {/* ── Template Type Tabs ── */}
            <div className="flex items-center gap-1 px-6 pt-4 pb-0 bg-white border-b border-slate-100">
                {TEMPLATE_TYPES.map(t => {
                    const Icon = t.icon;
                    return (
                        <button
                            key={t.id}
                            onClick={() => { setActiveTemplate(t.id); if (mode === 'preview') setMode('blocks'); }}
                            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                                activeTemplate === t.id
                                    ? 'border-b-2 text-blue-600 bg-blue-50 border-blue-500'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                            <Icon size={14} /> {t.label}
                        </button>
                    );
                })}
            </div>

            {/* ── Subject Line ── */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-100">
                <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">KONU SATIRI:</label>
                    <input
                        value={currentSubject}
                        onChange={e => setSubjectLines(prev => ({ ...prev, [activeTemplate]: e.target.value }))}
                        className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                        placeholder="E-posta konu satırı..."
                    />
                </div>
            </div>

            {/* ── Mode Toggle ── */}
            <div className="flex items-center gap-1 px-6 py-3 bg-white border-b border-slate-100">
                {[
                    { id: 'blocks',  label: 'Blok Editörü', icon: LayoutTemplate },
                    { id: 'html',    label: 'HTML Kodu',    icon: Code },
                    { id: 'preview', label: 'Önizleme',     icon: Eye },
                ].map(m => {
                    const Icon = m.icon;
                    return (
                        <button
                            key={m.id}
                            onClick={() => {
                                if (m.id === 'html' && !htmlCode[activeTemplate]) {
                                    setHtmlCode(prev => ({ ...prev, [activeTemplate]: buildPreviewHtml(currentBlocks, branding) }));
                                }
                                setMode(m.id);
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                mode === m.id
                                    ? 'bg-slate-800 text-white'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                            }`}
                        >
                            <Icon size={13} /> {m.label}
                        </button>
                    );
                })}
                <span className="ml-auto text-xs text-slate-400">
                    {currentBlocks.length} blok
                </span>
            </div>

            {/* ── Main Editor Area ── */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* ── Blocks mode ── */}
                {mode === 'blocks' && (
                    <>
                        {/* Left: Block list */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
                            {currentBlocks.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                                    <LayoutTemplate size={32} className="mb-3 opacity-30" />
                                    <p className="text-sm">Henüz blok eklenmedi.</p>
                                    <p className="text-xs mt-1">Sağ panelden blok ekleyebilirsiniz.</p>
                                </div>
                            )}
                            {currentBlocks.map((block, idx) => (
                                <div
                                    key={block.id}
                                    draggable
                                    onDragStart={() => handleDragStart(idx)}
                                    onDragOver={e => handleDragOver(e, idx)}
                                    onDrop={e => handleDrop(e, idx)}
                                    onDragEnd={handleDragEnd}
                                    className={`transition-all ${dragOverIndex === idx && dragIndexRef.current !== idx ? 'border-t-2 border-blue-400' : ''}`}
                                >
                                    <BlockEditor
                                        block={block}
                                        onUpdate={updated => updateBlock(idx, updated)}
                                        onDelete={() => deleteBlock(idx)}
                                        color={branding.primaryColor || '#0E7490'}
                                        insertVariable={insertVariable}
                                        isDragging={dragIndexRef.current === idx}
                                        dragHandleProps={{}}
                                    />
                                </div>
                            ))}
                        </div>

                        {/* Right: Sidebar */}
                        <div className="w-56 border-l border-slate-100 bg-slate-50 overflow-y-auto p-3 space-y-4 flex-shrink-0">
                            {/* Add block */}
                            <div>
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Blok Ekle</p>
                                <div className="space-y-1">
                                    {BLOCK_TYPES.map(bt => {
                                        const Icon = bt.icon;
                                        return (
                                            <button
                                                key={bt.type}
                                                onClick={() => addBlock(bt.type)}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:bg-white hover:shadow-sm rounded-lg transition-all border border-transparent hover:border-slate-200"
                                            >
                                                <Icon size={13} className="text-slate-400" /> {bt.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Variables */}
                            <div>
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                                    <Variable size={11} /> Değişkenler
                                </p>
                                <p className="text-[10px] text-slate-400 mb-2 leading-4">Alan kutularına yapıştırın veya kopyalayın</p>
                                <div className="space-y-1">
                                    {(TEMPLATE_VARIABLES[activeTemplate] || []).map(v => (
                                        <button
                                            key={v.key}
                                            onClick={() => {
                                                navigator.clipboard?.writeText(v.key).catch(() => {});
                                            }}
                                            title={`Kopyala: ${v.key}`}
                                            className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] bg-white border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                                        >
                                            <span className="text-slate-500">{v.label}</span>
                                            <span className="text-blue-500 font-mono text-[10px] truncate ml-1">{v.key}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* ── HTML mode ── */}
                {mode === 'html' && (
                    <div className="flex-1 flex min-h-0 overflow-hidden">
                        <textarea
                            value={currentHtml}
                            onChange={e => setHtmlCode(prev => ({ ...prev, [activeTemplate]: e.target.value }))}
                            className="flex-1 p-4 font-mono text-xs text-slate-700 bg-slate-950 text-green-300 resize-none outline-none leading-relaxed"
                            placeholder="HTML kodunuzu buraya yazın..."
                            spellCheck={false}
                        />
                        {/* Variables sidebar in HTML mode */}
                        <div className="w-48 border-l border-slate-200 bg-slate-50 overflow-y-auto p-3 flex-shrink-0">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                                <Variable size={11} /> Değişkenler
                            </p>
                            <p className="text-[10px] text-slate-400 mb-2 leading-4">Kopyala & yapıştır</p>
                            <div className="space-y-1">
                                {(TEMPLATE_VARIABLES[activeTemplate] || []).map(v => (
                                    <button
                                        key={v.key}
                                        onClick={() => {
                                            navigator.clipboard?.writeText(v.key).catch(() => {});
                                            setHtmlCode(prev => ({
                                                ...prev,
                                                [activeTemplate]: (prev[activeTemplate] || '') + v.key
                                            }));
                                        }}
                                        className="w-full text-left px-2 py-1.5 text-[10px] bg-white border border-slate-200 rounded hover:border-blue-300 hover:bg-blue-50 transition-colors"
                                    >
                                        <div className="text-slate-500">{v.label}</div>
                                        <div className="text-blue-500 font-mono truncate">{v.key}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Preview mode ── */}
                {mode === 'preview' && (
                    <div className="flex-1 overflow-y-auto bg-slate-100 p-6 min-h-0">
                        <div className="mb-3 flex items-center justify-between">
                            <p className="text-xs text-slate-500 flex items-center gap-1">
                                <Eye size={12} /> Önizleme — gerçek e-posta bu şekilde görünür
                            </p>
                            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                Örnek verilerle gösteriliyor
                            </span>
                        </div>
                        <iframe
                            srcDoc={previewHtml}
                            title="Email Preview"
                            className="w-full bg-white rounded-xl shadow-md border border-slate-200"
                            style={{ height: '700px', minHeight: '500px' }}
                            sandbox="allow-same-origin"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
