// src/components/SendMessageModal.jsx
// Simplified and modernized for high-premium UX with Google Workspace support
// Supports flexible scheduling: only calendar, only email, or both.

import { useState, useEffect, useRef } from 'react';
import {
    X, Send, Edit3, Sparkles, Copy, Check, AlertCircle, Mail,
    Linkedin, MessageSquare, Loader2, User, Briefcase, Target,
    Calendar, Clock, Video, Globe, Zap, CheckCircle2, RefreshCcw, Bell,
    Layers
} from 'lucide-react';
import { generatePersonalizedDM } from '../services/geminiService';
import { useAuth } from '../context/AuthContext';
import { sendDirectEmail, createDirectCalendarEvent, connectGoogleWorkspace } from '../services/integrationService';

export default function SendMessageModal({ candidate, onClose, onSent, initialPurpose = 'interview' }) {
    const { userId, userProfile } = useAuth();
    const textareaRef = useRef(null);

    // Google Integration Check
    const googleConnected = userProfile?.integrations?.google?.connected;
    const googleToken = userProfile?.integrations?.google?.accessToken;

    // State
    const [messageSubject, setMessageSubject] = useState('');
    const [messageContent, setMessageContent] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);
    const [purpose, setPurpose] = useState(initialPurpose); // 'interview', 'reject', 'general'

    // Workflow Preferences
    const [sendCandidateEmail, setSendCandidateEmail] = useState(true);
    const [syncToCalendar, setSyncToCalendar] = useState(true);

    // Calendar & Meeting States
    const [interviewDate, setInterviewDate] = useState('');
    const [interviewTime, setInterviewTime] = useState('');
    const [duration, setDuration] = useState(30); // Default 30 minutes
    const [meetLink, setMeetLink] = useState('');
    const [autoMeet, setAutoMeet] = useState(true);
    const [interviewType, setInterviewType] = useState('initial'); // 'initial', 'technical', 'fit', 'final'

    const [trackingId] = useState(() => 'TF-' + Math.random().toString(36).substring(2, 7).toUpperCase());

    // Initialize
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

    // Helper to manually apply schedule to text
    function applyScheduleToText(text, date, time, link) {
        if (!date || !time) return text;
        const dateStr = new Date(date).toLocaleDateString('tr-TR');
        const scheduleText = `Mülakat Tarihi: ${dateStr}\nSaat: ${time} (${duration} Dakika)\nToplantı Bağlantısı: ${link || 'Google Meet'}`;

        if (text.includes('[Takvim Linkiniz]')) {
            return text.replace('[Takvim Linkiniz]', scheduleText);
        }
        return text + `\n\n---\nPlanlanan Görüşme Bilgileri:\n${scheduleText}`;
    }

    async function handleDirectSend() {
        if (!googleConnected || !googleToken) {
            setError('Lütfen önce ayarlar sayfasından Google hesabınızı bağlayın.');
            return;
        }

        setSending(true);
        setError(null);

        try {
            let finalContent = messageContent;
            let currentMeetLink = meetLink;

            // 1. Handle Calendar event if requested
            if (purpose === 'interview' && syncToCalendar && interviewDate && interviewTime) {
                const startDateTime = new Date(`${interviewDate}T${interviewTime}:00`).toISOString();
                const endDateTime = new Date(new Date(`${interviewDate}T${interviewTime}:00`).getTime() + duration * 60000).toISOString();

                const eventResult = await createDirectCalendarEvent(userId, googleToken, {
                    summary: `Mülakat: ${candidate.name} - ${candidate.matchedPositionTitle || 'Pozisyon'}`,
                    description: `TalentFlow üzerinden planlanan görüşme.\nTakip ID: ${trackingId}`,
                    startDateTime,
                    endDateTime,
                    guestEmail: sendCandidateEmail ? candidate.email : null // Only add guest if we notify them
                });

                if (eventResult.success) {
                    currentMeetLink = eventResult.meetLink || eventResult.htmlLink;
                    finalContent = applyScheduleToText(finalContent, interviewDate, interviewTime, currentMeetLink);
                } else {
                    if (eventResult.error?.includes('403') || eventResult.error?.toLowerCase().includes('permission')) {
                        throw new Error("Takvime erişim yetkisi alınamadı. Lütfen bağlantıyı yenileyip Takvim kutucuğunu onayladığınızdan emin olun.");
                    }
                    throw new Error("Takvim etkinliği oluşturulamadı: " + eventResult.error);
                }
            }

            // 2. Handle Email if requested
            if (sendCandidateEmail) {
                const emailResult = await sendDirectEmail(userId, googleToken, {
                    to: candidate.email,
                    subject: `${messageSubject} [#${trackingId}]`,
                    body: finalContent
                });

                if (!emailResult.success) {
                    if (emailResult.error?.includes('403') || emailResult.error?.toLowerCase().includes('permission')) {
                        throw new Error("E-posta gönderim yetkisi alınamadı. Lütfen Google bağlantısını yenileyerek tüm izin kutucuklarını onayladığınızdan emin olun.");
                    }
                    throw new Error("E-posta gönderilemedi: " + emailResult.error);
                }
            }

            // Success!
            onSent?.({
                candidateId: candidate.id,
                candidateName: candidate.name,
                status: 'sent',
                trackingId: trackingId,
                purpose: purpose,
                timestamp: new Date().toISOString(),
                // Include interview details for history tracking
                interviewDetails: purpose === 'interview' ? {
                    date: interviewDate,
                    time: interviewTime,
                    duration: duration,
                    type: interviewType,
                    typeLabel: interviewType === 'initial' ? 'Tanışma Mülakatı' :
                        interviewType === 'technical' ? 'Teknik Mülakat' :
                            interviewType === 'fit' ? 'Kültür Uyumu' : 'Final Mülakatı',
                    meetLink: currentMeetLink
                } : null
            });
            onClose();

        } catch (err) {
            setError(err.message);
        } finally {
            setSending(false);
        }
    }

    async function handleReconnect() {
        setSending(true);
        setError(null);
        try {
            const res = await connectGoogleWorkspace(userId);
            if (res.success) {
                setError(null);
                // The sync will happen via AuthContext
            } else {
                setError("Yeniden bağlanılamadı: " + res.error);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setSending(false);
        }
    }

    function handleOpenFallback(client = 'default') {
        const toEmail = candidate.email || '';
        const fullSubject = `${messageSubject} [#${trackingId}]`;
        const bodyWithSchedule = applyScheduleToText(messageContent, interviewDate, interviewTime, meetLink);
        const subjectEscaped = encodeURIComponent(fullSubject);
        const bodyEscaped = encodeURIComponent(bodyWithSchedule);

        let link = client === 'gmail'
            ? `https://mail.google.com/mail/?view=cm&fs=1&to=${toEmail}&su=${subjectEscaped}&body=${bodyEscaped}`
            : `mailto:${toEmail}?subject=${subjectEscaped}&body=${bodyEscaped}`;

        window.open(link, client === 'gmail' ? '_blank' : '_self');
        onClose();
    }

    const handleCopy = () => {
        const bodyWithSchedule = applyScheduleToText(messageContent, interviewDate, interviewTime, meetLink);
        navigator.clipboard.writeText(bodyWithSchedule);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!candidate) return null;

    return (
        <>
            <div className="fixed inset-0 bg-navy-950/80 backdrop-blur-md z-[80] animate-fade-in" onClick={onClose} />
            <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 pointer-events-none">
                <div className="bg-navy-900/90 border border-white/[0.08] rounded-[32px] shadow-[0_32px_128px_rgba(0,0,0,0.8)] w-full max-w-2xl max-h-[90vh] flex flex-col pointer-events-auto animate-fade-in-up overflow-hidden relative">

                    {/* Decorative Blobs */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-electric/10 rounded-full blur-[100px] -z-10 pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-[80px] -z-10 pointer-events-none" />

                    {/* HEADER */}
                    <div className="p-8 pb-4">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-electric/10 border border-electric/20 flex items-center justify-center">
                                    <Mail className="w-6 h-6 text-electric" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-text-primary tracking-tight">Aday İletişimi</h2>
                                    <p className="text-xs text-navy-400 font-medium">Yapay Zeka Destekli Mesajlaşma</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-navy-400 hover:text-text-primary transition-all">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* CANDIDATE STRIP */}
                        <div className="flex items-center gap-4 p-4 rounded-3xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-electric to-blue-600 flex items-center justify-center text-lg font-bold text-text-primary shadow-xl shadow-electric/10 shrink-0">
                                {candidate.name?.[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-bold text-text-primary truncate">{candidate.name || 'İsimsiz Aday'}</h4>
                                <div className="flex items-center gap-2 mt-0.5 opacity-60">
                                    <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full font-bold text-text-primary uppercase tracking-wider truncate max-w-full">
                                        {candidate.matchedPositionTitle || candidate.position || 'Genel Başvuru'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-col items-end shrink-0">
                                <div className="flex items-center gap-1 text-emerald-400 text-xs font-black">
                                    <Zap className="w-3.5 h-3.5 fill-current" /> %{candidate.matchScore || '0'}
                                </div>
                                <span className="text-[8px] text-navy-500 font-bold uppercase tracking-tighter mt-1">AI Uyumu</span>
                            </div>
                        </div>
                    </div>

                    {/* TABS */}
                    <div className="px-8 mb-4">
                        <div className="flex p-1 gap-1 rounded-[18px] bg-white/5 border border-white/5">
                            {[
                                { id: 'interview', label: 'Mülakat', icon: Calendar },
                                { id: 'general', label: 'Genel Mesaj', icon: MessageSquare },
                                { id: 'reject', label: 'Reddet', icon: X },
                            ].map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => generateDM(t.id)}
                                    disabled={generating}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-2xl text-[11px] font-bold transition-all duration-300 ${purpose === t.id ? 'bg-white/10 text-text-primary shadow-lg' : 'text-navy-400 hover:text-text-primary hover:bg-white/5'}`}
                                >
                                    <t.icon className="w-3.5 h-3.5" /> {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* CONTENT AREA */}
                    <div className="flex-1 overflow-y-auto px-8 custom-scrollbar">
                        <div className="space-y-6 pb-4">

                            {/* INTERVIEW SPECIFIC CONTENT */}
                            {purpose === 'interview' && (
                                <div className="space-y-4 animate-fade-in">
                                    <div className="grid grid-cols-4 gap-2">
                                        {['initial', 'technical', 'fit', 'final'].map(type => (
                                            <button
                                                key={type}
                                                onClick={() => generateDM('interview', type)}
                                                className={`py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-all ${interviewType === type ? 'bg-electric/10 border-electric/40 text-electric' : 'bg-transparent border-white/5 text-navy-500'}`}
                                            >
                                                {type === 'initial' ? 'Tanışma' : type === 'technical' ? 'Teknik' : type === 'fit' ? 'Kültür' : 'Final'}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="p-6 rounded-3xl bg-electric/[0.03] border border-electric/[0.08] space-y-5">
                                        <div className="flex items-center justify-between border-b border-white/5 pb-4">
                                            <div className="flex flex-col gap-1">
                                                <h5 className="text-[10px] font-black text-electric uppercase tracking-[0.2em]">İş Akışı Seçenekleri</h5>
                                                <p className="text-[9px] text-navy-500 font-medium italic">Otomasyon tercihlerini belirleyin</p>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className="text-[9px] text-text-primary font-bold uppercase">Takvime Ekle</span>
                                                    <button onClick={() => setSyncToCalendar(!syncToCalendar)} className={`w-8 h-4 rounded-full transition-colors relative ${syncToCalendar ? 'bg-emerald-500' : 'bg-navy-800'}`}>
                                                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${syncToCalendar ? 'left-4.5' : 'left-0.5'}`} />
                                                    </button>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className="text-[9px] text-text-primary font-bold uppercase">E-posta Gönder</span>
                                                    <button onClick={() => setSendCandidateEmail(!sendCandidateEmail)} className={`w-8 h-4 rounded-full transition-colors relative ${sendCandidateEmail ? 'bg-electric' : 'bg-navy-800'}`}>
                                                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${sendCandidateEmail ? 'left-4.5' : 'left-0.5'}`} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="space-y-2 group/date">
                                                <label className="text-[9px] text-navy-500 font-black uppercase tracking-[0.1em] ml-1 flex items-center gap-1.5">
                                                    <Calendar className="w-3 h-3" /> Tarih
                                                </label>
                                                <div className="relative cursor-pointer transition-all duration-300">
                                                    <div className="absolute inset-0 bg-electric/10 blur-xl opacity-0 group-hover/date:opacity-100 transition-opacity -z-10" />
                                                    <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-electric/60 group-hover/date:text-electric transition-colors" />
                                                    <input
                                                        type="date"
                                                        value={interviewDate}
                                                        onChange={(e) => setInterviewDate(e.target.value)}
                                                        className="w-full bg-navy-950/80 border border-white/5 group-hover/date:border-electric/30 rounded-2xl py-3 pl-10 pr-4 text-xs text-text-primary outline-none focus:border-electric transition-all cursor-pointer font-bold [color-scheme:dark]"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2 group/time">
                                                <label className="text-[9px] text-navy-500 font-black uppercase tracking-[0.1em] ml-1 flex items-center gap-1.5">
                                                    <Clock className="w-3 h-3" /> Saat
                                                </label>
                                                <div className="relative cursor-pointer transition-all duration-300">
                                                    <div className="absolute inset-0 bg-blue-500/10 blur-xl opacity-0 group-hover/time:opacity-100 transition-opacity -z-10" />
                                                    <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-electric/60 group-hover/time:text-electric transition-colors" />
                                                    <select
                                                        value={interviewTime}
                                                        onChange={(e) => setInterviewTime(e.target.value)}
                                                        className="w-full bg-navy-950/80 border border-white/5 group-hover/time:border-electric/30 rounded-2xl py-3 pl-10 pr-8 text-xs text-text-primary outline-none focus:border-electric transition-all cursor-pointer font-bold appearance-none"
                                                    >
                                                        <option value="">Seçin</option>
                                                        {Array.from({ length: 24 }, (_, i) => {
                                                            const hour = 8 + Math.floor(i / 2);
                                                            const min = i % 2 === 0 ? '00' : '30';
                                                            const time = `${hour.toString().padStart(2, '0')}:${min}`;
                                                            return <option key={time} value={time} className="bg-navy-900">{time}</option>;
                                                        })}
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="space-y-2 group/duration">
                                                <label className="text-[9px] text-navy-500 font-black uppercase tracking-[0.1em] ml-1 flex items-center gap-1.5">
                                                    <Clock className="w-3 h-3" /> Süre
                                                </label>
                                                <div className="relative cursor-pointer transition-all duration-300">
                                                    <div className="absolute inset-0 bg-purple-500/10 blur-xl opacity-0 group-hover/duration:opacity-100 transition-opacity -z-10" />
                                                    <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400 group-hover/duration:text-purple-300 transition-colors" />
                                                    <select
                                                        value={duration}
                                                        onChange={(e) => setDuration(Number(e.target.value))}
                                                        className="w-full bg-navy-950/80 border border-white/5 group-hover/duration:border-purple-500/30 rounded-2xl py-3 pl-10 pr-8 text-xs text-text-primary outline-none focus:border-purple-500 transition-all cursor-pointer font-bold appearance-none"
                                                    >
                                                        {[15, 30, 45, 60, 90, 120].map(mins => (
                                                            <option key={mins} value={mins} className="bg-navy-900">
                                                                {mins >= 60 ? `${mins / 60} Saat` : `${mins} Dakika`}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* MESSAGE AREA */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {generating ? <RefreshCcw className="w-3.5 h-3.5 text-electric animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-electric" />}
                                        <span className="text-[10px] font-black text-text-primary uppercase tracking-widest">{generating ? 'AI Oluşturuyor...' : 'E-posta İçeriği'}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {purpose === 'interview' && (
                                            <button
                                                onClick={() => {
                                                    const updated = applyScheduleToText(messageContent, interviewDate, interviewTime, meetLink);
                                                    setMessageContent(updated);
                                                }}
                                                className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1.5 border-b border-emerald-400/20"
                                            >
                                                <Layers className="w-3 h-3" /> Tarihi Metne Uygula
                                            </button>
                                        )}
                                        <button onClick={() => setIsEditing(!isEditing)} className="text-[10px] font-bold text-navy-400 hover:text-text-primary transition-colors flex items-center gap-1.5 border-b border-navy-400/20">
                                            <Edit3 className="w-3 h-3" /> {isEditing ? 'Önizleme' : 'Metni Düzenle'}
                                        </button>
                                    </div>
                                </div>

                                <div className={`group relative transition-all duration-300 ${generating ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
                                    {isEditing ? (
                                        <div className="space-y-3">
                                            <input
                                                value={messageSubject}
                                                onChange={(e) => setMessageSubject(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-5 text-sm font-bold text-text-primary outline-none focus:border-electric/40"
                                                placeholder="Konu başlığı..."
                                            />
                                            <textarea
                                                ref={textareaRef}
                                                value={messageContent}
                                                onChange={(e) => setMessageContent(e.target.value)}
                                                rows={8}
                                                className="w-full bg-white/5 border border-white/10 rounded-3xl py-4 px-5 text-sm text-navy-200 outline-none focus:border-electric/40 leading-relaxed custom-scrollbar"
                                                placeholder="Mesaj içeriği..."
                                            />
                                        </div>
                                    ) : (
                                        <div className="p-6 rounded-[32px] bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.15] transition-all cursor-text" onClick={() => setIsEditing(true)}>
                                            <div className="text-[10px] text-navy-500 font-bold uppercase mb-2">Konu: <span className="text-text-primary">{messageSubject}</span></div>
                                            <p className="text-sm text-navy-200 leading-relaxed whitespace-pre-wrap">{messageContent}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {error && (
                                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex flex-col gap-3 animate-shake">
                                    <div className="flex items-start gap-3">
                                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                        <p className="text-xs text-red-400 font-medium">{error}</p>
                                    </div>
                                    {error.includes('Oturum süresi dolmuş') && (
                                        <button
                                            onClick={handleReconnect}
                                            disabled={sending}
                                            className="ml-7 flex items-center gap-2 text-[10px] font-black text-text-primary bg-red-500/20 px-4 py-2 rounded-xl border border-red-500/30 hover:bg-red-500/40 transition-all uppercase tracking-widest w-fit"
                                        >
                                            {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
                                            Google Bağlantısını Tazele
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* FOOTER ACTIONS */}
                    <div className="p-8 space-y-4 bg-navy-900/50 backdrop-blur-xl border-t border-white/5">
                        {googleConnected ? (
                            <button
                                onClick={handleDirectSend}
                                disabled={sending || generating || (!sendCandidateEmail && purpose !== 'interview') || (purpose === 'interview' && !syncToCalendar && !sendCandidateEmail) || (purpose === 'interview' && (syncToCalendar || sendCandidateEmail) && (!interviewDate || !interviewTime))}
                                className={`w-full py-4 rounded-[20px] bg-gradient-to-r ${sendCandidateEmail ? 'from-electric to-blue-600 shadow-electric/20' : 'from-emerald-500 to-teal-600 shadow-emerald-500/20'} font-black text-sm text-text-primary shadow-2xl hover:translate-y-[-2px] active:translate-y-0 transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-50 disabled:translate-y-0 group relative overflow-hidden`}
                            >
                                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : sendCandidateEmail ? <Send className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
                                {purpose === 'interview'
                                    ? (syncToCalendar && sendCandidateEmail ? 'PLANLA VE ADAYA GÖNDER' : syncToCalendar ? 'SADECE TAKVİME EKLE' : 'SADECE E-POSTA GÖNDER')
                                    : 'HEMEN GÖNDER'
                                }
                            </button>
                        ) : (
                            <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Globe className="w-5 h-5 text-amber-500/60" />
                                    <div className="text-[11px] text-amber-500/80 font-bold uppercase">Google Hesabı Bağlı Değil</div>
                                </div>
                                <span className="text-[10px] text-navy-500 italic">Dışarıdan gönderim seçeneklerini kullanın</span>
                            </div>
                        )}

                        <div className="grid grid-cols-3 gap-3">
                            <button onClick={handleCopy} className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all group">
                                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-navy-400 group-hover:text-text-primary" />}
                                <span className="text-[9px] font-black text-navy-400 group-hover:text-text-primary uppercase">Kopyala</span>
                            </button>
                            <button onClick={() => handleOpenFallback('gmail')} className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all group">
                                <Mail className="w-4 h-4 text-rose-400 group-hover:text-rose-300" />
                                <span className="text-[9px] font-black text-navy-400 group-hover:text-text-primary uppercase">Gmail Web</span>
                            </button>
                            <button onClick={onClose} className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all group">
                                <X className="w-4 h-4 text-navy-400 group-hover:text-text-primary" />
                                <span className="text-[9px] font-black text-navy-400 group-hover:text-text-primary uppercase">Vazgeç</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
