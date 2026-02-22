// src/components/SendMessageModal.jsx
// Human-in-the-loop DM approval modal
// Shows AI-generated draft, allows editing, then saves to Firestore queue

import { useState, useEffect, useRef } from 'react';
import {
    X,
    Send,
    Edit3,
    Sparkles,
    Copy,
    Check,
    AlertCircle,
    Mail,
    Linkedin,
    MessageSquare,
    Loader2,
    User,
    Briefcase,
    Target,
    CheckCircle,
    Calendar,
    Clock,
    Video
} from 'lucide-react';
import { generatePersonalizedDM } from '../services/geminiService';
import { useAuth } from '../context/AuthContext';

export default function SendMessageModal({ candidate, aiAnalysisResult, onClose, onSent, initialPurpose = 'interview' }) {
    const { userId } = useAuth();
    const textareaRef = useRef(null);

    // State
    const [messageSubject, setMessageSubject] = useState('');
    const [messageContent, setMessageContent] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);
    const [purpose, setPurpose] = useState('interview'); // 'interview', 'reject', 'general'

    // Calendar & Meeting States
    const [interviewDate, setInterviewDate] = useState('');
    const [interviewTime, setInterviewTime] = useState('');
    const [meetLink, setMeetLink] = useState('');
    const [interviewType, setInterviewType] = useState('initial'); // 'initial', 'technical', 'fit', 'final'

    // Initialize message from AI analysis or generate new
    useEffect(() => {
        generateDM(initialPurpose, interviewType);
    }, [initialPurpose]);

    async function generateDM(selectedPurpose, type = interviewType) {
        setGenerating(true);
        setError(null);
        setPurpose(selectedPurpose);
        if (selectedPurpose === 'interview') setInterviewType(type);

        try {
            const targetPos = candidate.matchedPositionTitle || candidate.position || 'Aday';
            const result = await generatePersonalizedDM(
                candidate.name,
                candidate.skills || [],
                targetPos,
                'Şirketimiz',
                selectedPurpose,
                type
            );
            setMessageSubject(result.subject || 'Görüşme Talebi');
            setMessageContent(result.body || '');
            setIsEditing(false);
        } catch (err) {
            console.error('[SendMessageModal] DM generation error:', err);
            // Fallback template
            setMessageSubject('Pozisyon Başvurusu');
            setMessageContent(
                `Merhabalar ${candidate.name},\n\n` +
                `${candidate.position || 'bir'} pozisyonu için profilinizi inceledik.\n\n` +
                `Kısa bir görüşme için müsait olur musunuz?\n\n` +
                `[Takvim Linkiniz]\n\n` +
                `İyi günler dilerim.`
            );
        } finally {
            setGenerating(false);
        }
    }

    const [trackingId] = useState(() => 'TF-' + Math.random().toString(36).substring(2, 7).toUpperCase());

    function handleApplySchedule() {
        if (!interviewDate || !interviewTime) {
            setError('Lütfen önce tarih ve saat seçin.');
            return;
        }

        setError(null);
        const dateStr = new Date(interviewDate).toLocaleDateString('tr-TR');
        const defaultLink = meetLink || 'https://meet.google.com/new'; // Fallback if no link generated
        const scheduleText = `Mülakat Tarihi: ${dateStr}\nSaat: ${interviewTime}\nToplantı Bağlantısı: ${defaultLink}`;

        let currentCode = messageContent;
        if (currentCode.includes('[Takvim Linkiniz]')) {
            currentCode = currentCode.replace('[Takvim Linkiniz]', scheduleText);
        } else {
            currentCode = currentCode + `\n\n---\nPlanlanan Görüşme Bilgileri:\n${scheduleText}`;
        }
        setMessageContent(currentCode);
    }

    function handleOpenMailApp(client = 'default') {
        if (!messageContent.trim()) {
            setError('Mesaj içeriği boş olamaz.');
            return;
        }

        const toEmail = candidate.email || '';
        // Append tracking ID to subject
        const fullSubject = `${messageSubject} [#${trackingId}]`;
        const subjectEscaped = encodeURIComponent(fullSubject);
        const bodyEscaped = encodeURIComponent(messageContent);

        let link = '';

        if (client === 'gmail') {
            // Open Gmail Web Compose
            link = `https://mail.google.com/mail/?view=cm&fs=1&to=${toEmail}&su=${subjectEscaped}&body=${bodyEscaped}`;
        } else {
            // Use mailto link to open the user's default desktop email client
            link = `mailto:${toEmail}?subject=${subjectEscaped}&body=${bodyEscaped}`;
        }

        const a = document.createElement('a');
        a.href = link;
        a.target = client === 'gmail' ? '_blank' : '_self';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Notify parent if needed
        onSent?.({
            candidateId: candidate.id,
            candidateName: candidate.name,
            status: 'sent',
            trackingId: trackingId,
            purpose: purpose,
            subject: fullSubject,
            timestamp: new Date().toISOString()
        });

        setTimeout(() => onClose?.(), 1000);
    }

    function handleCopy() {
        navigator.clipboard.writeText(messageContent);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    }

    function handleEdit() {
        setIsEditing(true);
        setTimeout(() => textareaRef.current?.focus(), 100);
    }

    if (!candidate) return null;

    return (
        <>
            {/* Overlay */}
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80] animate-fade-in"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 pointer-events-none">
                <div
                    className="bg-navy-900 border border-white/[0.08] rounded-2xl shadow-[0_32px_64px_rgba(0,0,0,0.5)] w-full max-w-lg max-h-[85vh] flex flex-col pointer-events-auto animate-fade-in-up overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >

                    {/* ===== HEADER ===== */}
                    <div className="shrink-0 p-5 border-b border-white/[0.06]">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0077B5] to-[#00A0DC] flex items-center justify-center shadow-[0_0_16px_rgba(0,119,181,0.3)]">
                                    <Mail className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-white">Aday İletişimi</h2>
                                    <p className="text-[11px] text-navy-400">Takvim & E-posta Planlama</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-navy-400 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Candidate info strip */}
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-electric to-violet-accent flex items-center justify-center text-sm font-bold text-white shrink-0">
                                {(candidate.name || 'Aday').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <User className="w-3.5 h-3.5 text-navy-500" />
                                    <span className="text-[13px] font-semibold text-navy-200 truncate">{candidate.name || 'İsimsiz Aday'}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <Briefcase className="w-3.5 h-3.5 text-navy-500" />
                                    <span className="text-[11px] text-navy-400 truncate">
                                        Değerlendirilen: <span className="text-electric-light font-bold">{(candidate.matchedPositionTitle || candidate.position || 'Pozisyon Belirtilmemiş').toUpperCase()}</span>
                                    </span>
                                </div>
                            </div>
                            {candidate.matchScore !== undefined && (
                                <div className="flex flex-col items-end shrink-0">
                                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-electric/10">
                                        <Target className="w-3.5 h-3.5 text-electric-light" />
                                        <span className="text-[12px] font-bold text-electric-light">%{candidate.matchScore}</span>
                                    </div>
                                    <span className="text-[8px] text-navy-500 uppercase font-bold tracking-tighter mt-1">Yapay Zeka Uyumluluğu</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ===== CONTENT ===== */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        {/* Purpose Selection */}
                        <div className="flex flex-col gap-3">
                            <div className="flex gap-2">
                                {[
                                    { id: 'interview', label: 'Mülakat Planla' },
                                    { id: 'general', label: 'Genel Mesaj' },
                                    { id: 'reject', label: 'Kibarca Reddet' },
                                ].map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => generateDM(p.id)}
                                        disabled={generating}
                                        className={`flex-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${purpose === p.id ? 'bg-electric text-white shadow-lg' : 'bg-white/5 text-navy-400 hover:text-white hover:bg-white/10'}`}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>

                            {/* Interview Sub-types */}
                            {purpose === 'interview' && (
                                <div className="flex flex-wrap gap-2 p-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                    {[
                                        { id: 'initial', label: 'İlk Tanışma' },
                                        { id: 'technical', label: 'Teknik Mülakat' },
                                        { id: 'fit', label: 'Kültür Uyumu' },
                                        { id: 'final', label: 'Final Görüşmesi' },
                                    ].map(t => (
                                        <button
                                            key={t.id}
                                            onClick={() => generateDM('interview', t.id)}
                                            disabled={generating}
                                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${interviewType === t.id ? 'bg-violet-500/10 border-violet-500/30 text-violet-400' : 'bg-transparent border-transparent text-navy-500 hover:text-navy-300'}`}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Scheduling UI (Only for Interview) */}
                        {purpose === 'interview' && (
                            <div className="p-4 rounded-xl border border-dashed border-electric/30 bg-electric/5 space-y-3">
                                <div className="text-[12px] font-bold text-electric-light flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4" /> Mülakat Takvimini Ayarla
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-navy-400 font-semibold uppercase tracking-wider">Tarih</label>
                                        <input
                                            type="date"
                                            value={interviewDate}
                                            onChange={(e) => setInterviewDate(e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg bg-navy-900 border border-white/10 text-[12px] text-white outline-none focus:border-electric"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-navy-400 font-semibold uppercase tracking-wider">Saat</label>
                                        <select
                                            value={interviewTime}
                                            onChange={(e) => setInterviewTime(e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg bg-navy-900 border border-white/10 text-[12px] text-white outline-none focus:border-electric"
                                        >
                                            <option value="" disabled>Saat Seçin</option>
                                            {Array.from({ length: 25 }, (_, i) => {
                                                const hour = Math.floor(i / 2) + 8;
                                                const min = i % 2 === 0 ? '00' : '30';
                                                const timeStr = `${hour.toString().padStart(2, '0')}:${min}`;
                                                return <option key={timeStr} value={timeStr}>{timeStr}</option>;
                                            })}
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-navy-400 font-semibold uppercase tracking-wider flex items-center gap-1"><Video className="w-3 h-3" /> Toplantı Linki (İsteğe Bağlı)</label>
                                    <input
                                        type="text"
                                        placeholder="Tümleşik link bırakılmazsa Google Meet otomatik eklenebilir."
                                        value={meetLink}
                                        onChange={(e) => setMeetLink(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg bg-navy-900 border border-white/10 text-[12px] text-white outline-none focus:border-electric placeholder-navy-500"
                                    />
                                </div>
                                <button
                                    onClick={handleApplySchedule}
                                    className="w-full py-2 bg-white/[0.05] hover:bg-electric/20 border border-white/[0.05] hover:border-electric text-[12px] font-bold text-white rounded-lg transition-all"
                                >
                                    Metindeki [Takvim Linkiniz] Alanını Değiştir
                                </button>
                            </div>
                        )}

                        {/* Status bar */}
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5">
                                {generating ? (
                                    <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />
                                ) : (
                                    <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                                )}
                                <span className="text-[11px] font-semibold text-navy-400">
                                    {generating ? 'AI mesaj oluşturuyor...' : 'AI tarafından oluşturuldu'}
                                </span>
                            </div>
                            <div className="flex-1" />
                            <button
                                onClick={handleEdit}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-navy-400 hover:text-navy-200 hover:bg-white/[0.04] transition-all cursor-pointer"
                            >
                                <Edit3 className="w-3 h-3" />
                                {isEditing ? 'Önizleme' : 'Düzenle'}
                            </button>
                        </div>

                        {/* Message content */}
                        {generating ? (
                            <div className="space-y-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                <div className="skeleton h-4 w-4/5 rounded" />
                                <div className="skeleton h-4 w-full rounded" />
                                <div className="skeleton h-4 w-3/5 rounded" />
                                <div className="skeleton h-4 w-full rounded" />
                                <div className="skeleton h-4 w-2/5 rounded" />
                            </div>
                        ) : isEditing ? (
                            <div className="space-y-3">
                                <input
                                    type="text"
                                    value={messageSubject}
                                    onChange={(e) => setMessageSubject(e.target.value)}
                                    className="w-full px-4 py-2 rounded-xl bg-white/[0.04] border border-electric/20 text-[13px] text-white placeholder:text-navy-500 outline-none focus:border-electric/40 focus:ring-2 focus:ring-electric/10 transition-all font-bold"
                                    placeholder="Konu başlığı..."
                                />
                                <textarea
                                    ref={textareaRef}
                                    value={messageContent}
                                    onChange={(e) => setMessageContent(e.target.value)}
                                    rows={10}
                                    className="w-full px-4 py-3.5 rounded-xl bg-white/[0.04] border border-electric/20 text-[13px] text-navy-200 placeholder:text-navy-500 outline-none focus:border-electric/40 focus:ring-2 focus:ring-electric/10 transition-all resize-none leading-relaxed font-[inherit]"
                                    placeholder="Mesajınızı yazın..."
                                />
                            </div>
                        ) : (
                            <div
                                className="px-4 py-2 mt-2 rounded-xl bg-white/[0.03] border border-white/[0.06] cursor-text hover:border-white/[0.1] transition-all relative group/msg"
                                onClick={handleEdit}
                            >
                                <div className="absolute top-2 right-4 flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/5 border border-white/10 opacity-60 group-hover/msg:opacity-100 transition-opacity">
                                    <Target className="w-3 h-3 text-navy-500" />
                                    <span className="text-[9px] font-bold text-navy-400 font-mono tracking-wider">#{trackingId}</span>
                                </div>
                                <div className="text-[12px] text-navy-400 font-bold border-b border-white/[0.04] pb-2 mb-2 pr-20">Konu: <span className="text-white font-medium">{messageSubject}</span></div>
                                <p className="text-[13px] text-navy-200 leading-relaxed whitespace-pre-wrap py-2">
                                    {messageContent}
                                </p>
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/5 border border-red-500/10 animate-fade-in">
                                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                <span className="text-[12px] text-red-400">{error}</span>
                            </div>
                        )}

                        {/* Info note */}
                        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                            <MessageSquare className="w-4 h-4 text-electric shrink-0 mt-0.5" />
                            <div className="text-[11px] text-navy-500 leading-relaxed">
                                <strong className="text-navy-400">Nasıl çalışır:</strong> Yapay zeka, adayın özelliklerine ve seçeceğiniz amaca uygun şekilde profesyonel bir taslak oluşturur.
                                "E-posta Gönder" dediğinizde bilgisayarınızdaki (örn: Outlook, Mac Mail, Gmail) sistemin <strong className="text-electric-light">varsayılan mail uygulaması</strong> açılarak metin ve konu kısmı tek tıkla otomatik doldurulur.
                                Takviminiz veya mail kutunuz için extra bir entegrasyona gerek yoktur.
                            </div>
                        </div>
                    </div>
                    {/* ===== FOOTER ===== */}
                    <div className="shrink-0 p-4 border-t border-white/[0.06] flex flex-col gap-3">
                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] font-semibold text-navy-300 hover:bg-white/[0.08] transition-all cursor-pointer"
                            >
                                İptal
                            </button>
                            <button
                                onClick={handleCopy}
                                disabled={generating || !messageContent.trim()}
                                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] font-semibold text-navy-300 hover:bg-white/[0.08] hover:text-white transition-all cursor-pointer disabled:opacity-50"
                            >
                                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Linkedin className="w-4 h-4" />}
                                {copied ? 'Kopyalandı' : 'Kopyala'}
                            </button>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => handleOpenMailApp('default')}
                                disabled={generating || !messageContent.trim()}
                                className="flex-1 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] font-semibold text-white hover:bg-white/[0.08] transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                <Mail className="w-4 h-4" />
                                Masaüstü Mail İle (Outlook/Mac)
                            </button>
                            <button
                                onClick={() => handleOpenMailApp('gmail')}
                                disabled={generating || !messageContent.trim()}
                                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 text-[13px] font-semibold text-white shadow-[0_4px_16px_rgba(239,68,68,0.3)] hover:shadow-[0_6px_24px_rgba(239,68,68,0.4)] hover:-translate-y-0.5 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                <Mail className="w-4 h-4" />
                                Web Gmail İle Gönder
                            </button>
                        </div>
                    </div>
                </div>
            </div >
        </>
    );
}
