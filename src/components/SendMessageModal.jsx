// src/components/SendMessageModal.jsx
// Simplified and modernized for high-premium UX with Google Workspace support
// Supports flexible scheduling: only calendar, only email, or both.

import { useState, useEffect, useRef } from 'react';
import {
    X, Send, Edit3, Sparkles, Copy, Check, AlertCircle, Mail,
    Linkedin, MessageSquare, Loader2, User, Briefcase, Target,
    Calendar, Clock, Video, Globe, Zap, CheckCircle2, RefreshCcw, Bell,
    Layers, FileQuestion, Plus, Trash2
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

    // Info Request state
    const [infoMessage, setInfoMessage] = useState('');
    const [infoItems, setInfoItems] = useState([]);
    const [newInfoItem, setNewInfoItem] = useState('');
    const [infoSending, setInfoSending] = useState(false);

    // Initialize
    useEffect(() => {
        if (initialPurpose !== 'info-request') {
            generateDM(initialPurpose, interviewType);
        }
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
                    description: `Talent-Inn üzerinden planlanan görüşme.\nTakip ID: ${trackingId}`,
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

    async function handleInfoRequestSend() {
        if (!infoMessage.trim() && infoItems.length === 0) {
            setError('Lütfen bir mesaj yazın veya talep edilecek bilgileri ekleyin.');
            return;
        }
        if (!candidate.email) {
            setError('Adayın email adresi bulunamadı.');
            return;
        }
        setInfoSending(true);
        setError(null);
        try {
            const API_BASE = import.meta.env.VITE_SERVER_URL || '';
            const { getAuth } = await import('firebase/auth');
            const token = await getAuth().currentUser?.getIdToken();
            const res = await fetch(`${API_BASE}/api/send-info-request`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    to: candidate.email,
                    candidateName: candidate.name,
                    recruiterName: userProfile?.displayName || userProfile?.name || '',
                    position: candidate.matchedPositionTitle || candidate.position || '',
                    requestMessage: infoMessage,
                    requestedItems: infoItems,
                    candidateId: candidate.id || null,
                    sessionId: candidate.sessionId || null,
                }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Bilgi talebi gönderilemedi.');
            }
            onSent?.({ candidateId: candidate.id, candidateName: candidate.name, status: 'info-request-sent', timestamp: new Date().toISOString() });
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setInfoSending(false);
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
            <div className="fixed inset-0 bg-bg-primary/80 backdrop-blur-md z-[80] animate-fade-in" onClick={onClose} />
            <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 pointer-events-none">
                <div className="bg-bg-secondary border border-border-subtle rounded-[32px] shadow-[0_32px_128px_rgba(0,0,0,0.4)] w-full max-w-2xl max-h-[90vh] flex flex-col pointer-events-auto animate-fade-in-up overflow-hidden relative">

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
                                    <p className="text-[10px] text-text-muted font-black uppercase tracking-widest opacity-60">AI Communication Suite</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="w-10 h-10 rounded-xl bg-bg-primary border border-border-subtle flex items-center justify-center text-text-muted hover:text-text-primary transition-all shadow-inner">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* CANDIDATE STRIP */}
                        <div className="flex items-center gap-4 p-4 rounded-3xl bg-bg-primary border border-border-subtle backdrop-blur-xl shadow-inner">
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
                                <span className="text-[9px] text-text-muted font-black uppercase tracking-tighter mt-1 opacity-60">AI MATCH</span>
                            </div>
                        </div>
                    </div>

                    {/* TABS */}
                    <div className="px-8 mb-4">
                        <div className="flex p-1 gap-1 rounded-[18px] bg-bg-primary border border-border-subtle shadow-inner">
                            {[
                                { id: 'interview', label: 'Mülakat', icon: Calendar },
                                { id: 'general', label: 'Genel Mesaj', icon: MessageSquare },
                                { id: 'reject', label: 'Reddet', icon: X },
                                { id: 'info-request', label: 'Bilgi İste', icon: FileQuestion },
                            ].map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => t.id === 'info-request' ? setPurpose('info-request') : generateDM(t.id)}
                                    disabled={generating}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-tight transition-all duration-300 ${purpose === t.id ? 'bg-bg-secondary text-text-primary shadow-lg border border-border-subtle' : 'text-text-muted hover:text-text-primary hover:bg-bg-secondary/40'}`}
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
                                                className={`py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-all shadow-sm ${interviewType === type ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-600 dark:text-cyan-400' : 'bg-transparent border-border-subtle text-text-muted opacity-60'}`}
                                            >
                                                {type === 'initial' ? 'Tanışma' : type === 'technical' ? 'Teknik' : type === 'fit' ? 'Kültür' : 'Final'}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="p-6 rounded-3xl bg-bg-primary border border-border-subtle space-y-5 shadow-inner">
                                        <div className="flex items-center justify-between border-b border-border-subtle pb-4 opacity-90">
                                            <div className="flex flex-col gap-1">
                                                <h5 className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.2em]">Flow Config</h5>
                                                <p className="text-[9px] text-text-muted font-black italic opacity-60">Automation Preferences</p>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="flex flex-col items-end gap-1.5">
                                                    <span className="text-[9px] text-text-primary font-black uppercase tracking-tighter">Sync Calendar</span>
                                                    <button onClick={() => setSyncToCalendar(!syncToCalendar)} className={`w-8 h-4 rounded-full transition-colors relative shadow-inner ${syncToCalendar ? 'bg-emerald-500' : 'bg-bg-secondary border border-border-subtle'}`}>
                                                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all shadow-sm ${syncToCalendar ? 'left-4.5' : 'left-0.5'}`} />
                                                    </button>
                                                </div>
                                                <div className="flex flex-col items-end gap-1.5">
                                                    <span className="text-[9px] text-text-primary font-black uppercase tracking-tighter">Send Email</span>
                                                    <button onClick={() => setSendCandidateEmail(!sendCandidateEmail)} className={`w-8 h-4 rounded-full transition-colors relative shadow-inner ${sendCandidateEmail ? 'bg-cyan-500' : 'bg-bg-secondary border border-border-subtle'}`}>
                                                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all shadow-sm ${sendCandidateEmail ? 'left-4.5' : 'left-0.5'}`} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="space-y-2 group/date">
                                                <label className="text-[9px] text-text-muted font-black uppercase tracking-[0.1em] ml-1 flex items-center gap-1.5 opacity-70">
                                                    <Calendar className="w-3 h-3" /> Date
                                                </label>
                                                <div className="relative cursor-pointer transition-all duration-300">
                                                    <div className="absolute inset-0 bg-cyan-500/10 blur-xl opacity-0 group-hover/date:opacity-100 transition-opacity -z-10" />
                                                    <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-500/60 group-hover/date:text-cyan-500 transition-colors" />
                                                    <input
                                                        type="date"
                                                        value={interviewDate}
                                                        onChange={(e) => setInterviewDate(e.target.value)}
                                                        className="w-full bg-bg-secondary border border-border-subtle group-hover/date:border-cyan-500/30 rounded-2xl py-3 pl-10 pr-4 text-xs text-text-primary outline-none focus:border-cyan-500 transition-all cursor-pointer font-black [color-scheme:dark] shadow-inner"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2 group/time">
                                                <label className="text-[9px] text-text-muted font-black uppercase tracking-[0.1em] ml-1 flex items-center gap-1.5 opacity-70">
                                                    <Clock className="w-3 h-3" /> Time
                                                </label>
                                                <div className="relative cursor-pointer transition-all duration-300">
                                                    <div className="absolute inset-0 bg-cyan-500/10 blur-xl opacity-0 group-hover/time:opacity-100 transition-opacity -z-10" />
                                                    <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-500/60 group-hover/time:text-cyan-500 transition-colors" />
                                                    <select
                                                        value={interviewTime}
                                                        onChange={(e) => setInterviewTime(e.target.value)}
                                                        className="w-full bg-bg-secondary border border-border-subtle group-hover/time:border-cyan-500/30 rounded-2xl py-3 pl-10 pr-8 text-xs text-text-primary outline-none focus:border-cyan-500 transition-all cursor-pointer font-black appearance-none shadow-inner"
                                                    >
                                                        <option value="" className="bg-bg-primary">Select</option>
                                                        {Array.from({ length: 24 }, (_, i) => {
                                                            const hour = 8 + Math.floor(i / 2);
                                                            const min = i % 2 === 0 ? '00' : '30';
                                                            const time = `${hour.toString().padStart(2, '0')}:${min}`;
                                                            return <option key={time} value={time} className="bg-bg-primary">{time}</option>;
                                                        })}
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="space-y-2 group/duration">
                                                <label className="text-[9px] text-text-muted font-black uppercase tracking-[0.1em] ml-1 flex items-center gap-1.5 opacity-70">
                                                    <Clock className="w-3 h-3" /> Duration
                                                </label>
                                                <div className="relative cursor-pointer transition-all duration-300">
                                                    <div className="absolute inset-0 bg-violet-500/10 blur-xl opacity-0 group-hover/duration:opacity-100 transition-opacity -z-10" />
                                                    <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-violet-400 group-hover/duration:text-violet-500 transition-colors" />
                                                    <select
                                                        value={duration}
                                                        onChange={(e) => setDuration(Number(e.target.value))}
                                                        className="w-full bg-bg-secondary border border-border-subtle group-hover/duration:border-violet-500/30 rounded-2xl py-3 pl-10 pr-8 text-xs text-text-primary outline-none focus:border-violet-500 transition-all cursor-pointer font-black appearance-none shadow-inner"
                                                    >
                                                        {[15, 30, 45, 60, 90, 120].map(mins => (
                                                            <option key={mins} value={mins} className="bg-bg-primary">
                                                                {mins >= 60 ? `${mins / 60} Hour` : `${mins} Mins`}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* INFO REQUEST FORM */}
                            {purpose === 'info-request' && (
                                <div className="space-y-4 animate-fade-in">

                                    {/* Header row — same style as Message Script header */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <FileQuestion className="w-3.5 h-3.5 text-cyan-500" />
                                            <span className="text-[10px] font-black text-text-primary uppercase tracking-widest">Adaya Mesaj Gönder</span>
                                        </div>
                                        <span className="text-[9px] font-black text-text-muted opacity-50 uppercase tracking-wider">SMTP · Google gerekmez</span>
                                    </div>

                                    {/* Message body — same card style as AI message area */}
                                    <div className="p-6 rounded-[32px] bg-bg-primary border border-border-subtle shadow-inner space-y-4">
                                        <div>
                                            <label className="block text-[9px] font-black text-text-muted uppercase tracking-[0.15em] mb-2 opacity-70">Mesajınız</label>
                                            <textarea
                                                value={infoMessage}
                                                onChange={e => setInfoMessage(e.target.value)}
                                                rows={4}
                                                placeholder="Adaya iletmek istediğiniz mesaj veya açıklama..."
                                                className="w-full bg-bg-secondary border border-border-subtle rounded-2xl py-3 px-4 text-[13px] text-text-secondary outline-none focus:border-cyan-500/40 resize-none custom-scrollbar font-bold leading-relaxed"
                                            />
                                        </div>

                                        <div className="border-t border-border-subtle pt-4">
                                            <label className="block text-[9px] font-black text-text-muted uppercase tracking-[0.15em] mb-2 opacity-70">Talep Edilen Belgeler / Bilgiler</label>
                                            <div className="flex gap-2 mb-2">
                                                <input
                                                    value={newInfoItem}
                                                    onChange={e => setNewInfoItem(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter' && newInfoItem.trim()) {
                                                            setInfoItems(p => [...p, newInfoItem.trim()]);
                                                            setNewInfoItem('');
                                                        }
                                                    }}
                                                    placeholder="Örn: CV, Diploma fotokopisi, Referans mektubu..."
                                                    className="flex-1 bg-bg-secondary border border-border-subtle rounded-2xl py-2.5 px-4 text-[13px] text-text-secondary outline-none focus:border-cyan-500/40 font-bold"
                                                />
                                                <button
                                                    onClick={() => { if (newInfoItem.trim()) { setInfoItems(p => [...p, newInfoItem.trim()]); setNewInfoItem(''); } }}
                                                    className="w-10 h-10 rounded-2xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/20 text-cyan-500 transition-colors flex items-center justify-center shrink-0"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                </button>
                                            </div>
                                            {infoItems.length > 0 && (
                                                <ul className="space-y-1.5 mt-2">
                                                    {infoItems.map((item, i) => (
                                                        <li key={i} className="flex items-center gap-2 bg-bg-secondary border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-secondary font-bold">
                                                            <FileQuestion className="w-3 h-3 text-cyan-500 shrink-0" />
                                                            <span className="flex-1">{item}</span>
                                                            <button onClick={() => setInfoItems(p => p.filter((_, j) => j !== i))} className="text-text-muted hover:text-red-400 transition-colors">
                                                                <Trash2 className="w-3 h-3" />
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* MESSAGE AREA */}
                            {purpose !== 'info-request' && <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {generating ? <RefreshCcw className="w-3.5 h-3.5 text-cyan-500 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-cyan-500" />}
                                        <span className="text-[10px] font-black text-text-primary uppercase tracking-widest">{generating ? 'AI Generating...' : 'Message Script'}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {purpose === 'interview' && (
                                            <button
                                                onClick={() => {
                                                    const updated = applyScheduleToText(messageContent, interviewDate, interviewTime, meetLink);
                                                    setMessageContent(updated);
                                                }}
                                                className="text-[9px] font-black text-emerald-500 hover:text-emerald-600 transition-colors flex items-center gap-1.5 border-b border-emerald-500/20 uppercase tracking-tighter"
                                            >
                                                <Layers className="w-3 h-3" /> Apply Schedule
                                            </button>
                                        )}
                                        <button onClick={() => setIsEditing(!isEditing)} className="text-[9px] font-black text-text-muted hover:text-text-primary transition-colors flex items-center gap-1.5 border-b border-border-subtle uppercase tracking-widest opacity-80">
                                            <Edit3 className="w-3 h-3" /> {isEditing ? 'Preview' : 'Edit Script'}
                                        </button>
                                    </div>
                                </div>

                                <div className={`group relative transition-all duration-300 ${generating ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
                                    {isEditing ? (
                                        <div className="space-y-3">
                                            <input
                                                value={messageSubject}
                                                onChange={(e) => setMessageSubject(e.target.value)}
                                                className="w-full bg-bg-primary border border-border-subtle rounded-2xl py-3 px-5 text-sm font-black text-text-primary outline-none focus:border-cyan-500/40 shadow-inner"
                                                placeholder="Subject line..."
                                            />
                                            <textarea
                                                ref={textareaRef}
                                                value={messageContent}
                                                onChange={(e) => setMessageContent(e.target.value)}
                                                rows={8}
                                                className="w-full bg-bg-primary border border-border-subtle rounded-3xl py-4 px-5 text-sm text-text-secondary outline-none focus:border-cyan-500/40 leading-relaxed custom-scrollbar shadow-inner font-bold"
                                                placeholder="Message content..."
                                            />
                                        </div>
                                    ) : (
                                        <div className="p-6 rounded-[32px] bg-bg-primary border border-border-subtle hover:border-cyan-500/20 transition-all cursor-text shadow-inner group" onClick={() => setIsEditing(true)}>
                                            <div className="text-[10px] text-text-muted font-black uppercase mb-3 opacity-60">Subject: <span className="text-text-primary opacity-100">{messageSubject}</span></div>
                                            <p className="text-[13px] text-text-secondary leading-relaxed whitespace-pre-wrap font-bold">{messageContent}</p>
                                        </div>
                                    )}
                                </div>
                            </div>}

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
                    <div className="p-8 space-y-4 bg-bg-primary/50 backdrop-blur-xl border-t border-border-subtle">
                        {purpose === 'info-request' ? (
                            <button
                                onClick={handleInfoRequestSend}
                                disabled={infoSending}
                                className="w-full py-4 rounded-[20px] bg-gradient-to-r from-cyan-600 to-cyan-500 shadow-cyan-500/20 font-black text-sm text-white shadow-2xl hover:translate-y-[-2px] active:translate-y-0 transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-50 disabled:translate-y-0 group relative overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                {infoSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileQuestion className="w-5 h-5" />}
                                BİLGİ TALEBİ GÖNDER
                            </button>
                        ) : googleConnected ? (
                            <button
                                onClick={handleDirectSend}
                                disabled={sending || generating || (!sendCandidateEmail && purpose !== 'interview') || (purpose === 'interview' && !syncToCalendar && !sendCandidateEmail) || (purpose === 'interview' && (syncToCalendar || sendCandidateEmail) && (!interviewDate || !interviewTime))}
                                className={`w-full py-4 rounded-[20px] bg-gradient-to-r ${sendCandidateEmail ? 'from-cyan-500 to-blue-600 shadow-cyan-500/20' : 'from-emerald-500 to-teal-600 shadow-emerald-500/20'} font-black text-sm text-text-primary shadow-2xl hover:translate-y-[-2px] active:translate-y-0 transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-50 disabled:translate-y-0 group relative overflow-hidden`}
                            >
                                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : sendCandidateEmail ? <Send className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
                                {purpose === 'interview'
                                    ? (syncToCalendar && sendCandidateEmail ? 'PLANLA VE GÖNDER' : syncToCalendar ? 'TAKİME EKLE' : 'E-POSTA GÖNDER')
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

                        {purpose === 'info-request' ? (
                            <button onClick={onClose} className="flex items-center justify-center gap-2 p-3 rounded-2xl bg-bg-primary border border-border-subtle hover:bg-bg-secondary transition-all group shadow-inner w-full">
                                <X className="w-4 h-4 text-text-muted group-hover:text-text-primary" />
                                <span className="text-[9px] font-black text-text-muted group-hover:text-text-primary uppercase tracking-tight">Vazgeç</span>
                            </button>
                        ) : (
                            <div className="grid grid-cols-3 gap-3">
                                <button onClick={handleCopy} className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-bg-primary border border-border-subtle hover:bg-bg-secondary transition-all group shadow-inner">
                                    {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-text-muted group-hover:text-text-primary" />}
                                    <span className="text-[9px] font-black text-text-muted group-hover:text-text-primary uppercase tracking-tight">Kopyala</span>
                                </button>
                                <button onClick={() => handleOpenFallback('gmail')} className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-bg-primary border border-border-subtle hover:bg-bg-secondary transition-all group shadow-inner">
                                    <Mail className="w-4 h-4 text-rose-500 group-hover:text-rose-400" />
                                    <span className="text-[9px] font-black text-text-muted group-hover:text-text-primary uppercase tracking-tight">Gmail Web</span>
                                </button>
                                <button onClick={onClose} className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-bg-primary border border-border-subtle hover:bg-bg-secondary transition-all group shadow-inner">
                                    <X className="w-4 h-4 text-text-muted group-hover:text-text-primary" />
                                    <span className="text-[9px] font-black text-text-muted group-hover:text-text-primary uppercase tracking-tight">Vazgeç</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
