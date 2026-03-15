// src/pages/InterviewManagementPage.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useCandidates } from '../context/CandidatesContext';
import { useAuth } from '../context/AuthContext';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getCalendarEvents, connectGoogleWorkspace, sendDirectEmail, createDirectCalendarEvent } from '../services/integrationService';
import { 
    Plus, 
    Video, 
    Calendar, 
    Clock, 
    Search, 
    Zap, 
    Sparkles, 
    ChevronLeft, 
    ChevronRight, 
    Copy, 
    CheckCircle2, 
    ArrowRight,
    Download,
    User,
    ChevronDown,
    MoreHorizontal,
    MoreVertical,
    CalendarDays,
    Settings,
    MoreHorizontal as MoreIcon,
    Mail,
    MessageSquare,
    Play,
    AlertCircle,
    Check,
    Loader2,
    Link as LinkIcon,
    Package,
    ArrowLeft,
    Activity
} from 'lucide-react';

const USERS_PATH = 'artifacts/talent-flow/public/data/users';

export default function InterviewManagementPage() {
    const navigate = useNavigate();
    const { user: currentUser, userProfile, userId } = useAuth();
    const { enrichedCandidates, updateCandidate, preselectedInterviewData, setPreselectedInterviewData } = useCandidates();
    
    // UI States
    const [isPlanningMode, setIsPlanningMode] = useState(false);
    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [interviewType, setInterviewType] = useState('technical'); // technical, hr, product
    const [isAnalyzingSlots, setIsAnalyzingSlots] = useState(false);
    const [suggestedSlots, setSuggestedSlots] = useState([]);
    const [saveStatus, setSaveStatus] = useState('idle');
    const [systemUsers, setSystemUsers] = useState([]);
    const [selectedInterviewer, setSelectedInterviewer] = useState(null);
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    
    // New Manual Selection States
    const [manualDate, setManualDate] = useState('');
    const [manualTime, setManualTime] = useState('09:00');

    // Email Preview Modal States
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [emailSubject, setEmailSubject] = useState('');
    const [emailBody, setEmailBody] = useState('');

    // Time slots helper
    const timeSlots = useMemo(() => {
        const slots = [];
        for(let h=8; h<=20; h++) {
            ['00', '30'].forEach(m => {
                slots.push(`${h.toString().padStart(2, '0')}:${m}`);
            });
        }
        return slots;
    }, []);

    const isGoogleConnected = userProfile?.integrations?.google?.connected;
    const googleToken = userProfile?.integrations?.google?.accessToken;

    // Fetch system users
    useEffect(() => {
        const unsub = onSnapshot(collection(db, USERS_PATH), (snap) => {
            const users = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSystemUsers(users);
            if (currentUser && !selectedInterviewer) {
                const found = users.find(u => u.id === currentUser.uid);
                if (found) setSelectedInterviewer(found);
            }
        });
        return unsub;
    }, [currentUser]);

    // Handle Preselection from other pages (Candidate Page)
    useEffect(() => {
        if (preselectedInterviewData && enrichedCandidates.length > 0) {
            const { candidateId, session } = preselectedInterviewData;
            
            // Find and set candidate
            const targetCandidate = enrichedCandidates.find(c => c.id === candidateId);
            if (targetCandidate) {
                setSelectedCandidate(targetCandidate);
                setIsPlanningMode(true);
                
                // If editing a specific session
                if (session) {
                    setInterviewType(session.type || 'technical');
                    setManualDate(session.date || '');
                    setManualTime(session.time || '09:00');
                }
            }
            
            // Clear context so it doesn't re-trigger
            setPreselectedInterviewData(null);
        }
    }, [preselectedInterviewData, enrichedCandidates]);

    const activeInterviews = useMemo(() => {
        const sessionMap = new Map();
        // Get local date in YYYY-MM-DD format for stable comparison
        const now = new Date();
        const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

        (enrichedCandidates || []).forEach(c => {
            if (c.interviewSessions && Array.isArray(c.interviewSessions)) {
                c.interviewSessions.forEach(session => {
                    // Normalize session date for comparison
                    // If date is like "23 Şub", it might be a legacy format. 
                    // We only want to show sessions that are definitely today or in the future
                    let compareDate = session.date;
                    
                    // Simple heuristic: if date doesn't look like YYYY-MM-DD, try to ignore or fix it
                    // Most valid sessions should be YYYY-MM-DD from the new picker
                    const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(compareDate);
                    
                    const isLive = session.status === 'live';
                    let isFutureOrToday = isIsoDate && compareDate >= todayStr;

                    // If it's a legacy or malformed date (not YYYY-MM-DD), we filter it out unless it's LIVE
                    if (isFutureOrToday || isLive) {
                        // Normalize type to avoid duplicates like "prod" vs "PROD"
                        const normType = String(session.type || 'general').trim().toLowerCase();
                        const dedupKey = `${c.id}-${normType}`;
                        
                        // Rule: If we have multiple sessions for same candidate/type:
                        // 1. Prefer LIVE sessions
                        // 2. Otherwise keep the one we found first (or we could prefer the one closest to now)
                        const existing = sessionMap.get(dedupKey);
                        
                        if (!existing || (isLive && existing.status !== 'live')) {
                            sessionMap.set(dedupKey, {
                                ...session,
                                id: session.id || `${c.id}-${Date.now()}-${Math.random()}`,
                                candidate: c,
                                candidateName: c.name,
                                role: c.position || c.bestTitle || 'Pozisyon',
                                matchScore: c.bestScore || 0,
                                normalizedType: normType
                            });
                        }
                    }
                });
            }
        });

        return Array.from(sessionMap.values()).sort((a,b) => {
            if (a.status === 'live' && b.status !== 'live') return -1;
            if (b.status === 'live' && a.status !== 'live') return 1;
            
            // Sort by date and time
            const dateA = a.date || '9999-99-99';
            const dateB = b.date || '9999-99-99';
            if (dateA !== dateB) return dateA.localeCompare(dateB);
            
            const timeA = a.time || '00:00';
            const timeB = b.time || '00:00';
            return timeA.localeCompare(timeB);
        });
    }, [enrichedCandidates]);

    const handleAutoPlan = async () => {
        if (!selectedCandidate) return;
        if (!isGoogleConnected) {
            alert("Lütfen önce takviminizi senkronize edin.");
            return;
        }

        setIsAnalyzingSlots(true);
        setSuggestedSlots([]);
        
        try {
            const timeMin = new Date().toISOString();
            const timeMax = new Date();
            timeMax.setDate(timeMax.getDate() + 7);
            
            const result = await getCalendarEvents(googleToken, timeMin, timeMax.toISOString());
            
            if (result.success) {
                const busyEvents = result.events.map(e => ({
                    start: new Date(e.start.dateTime || e.start.date),
                    end: new Date(e.end.dateTime || e.end.date)
                }));

                const freeSlots = [];
                let checkDate = new Date();
                checkDate.setDate(checkDate.getDate() + 1);

                while (freeSlots.length < 3 && checkDate < timeMax) {
                    if (checkDate.getDay() !== 0 && checkDate.getDay() !== 6) {
                        const possibleTimes = ['10:00', '14:00', '16:00'];
                        for (const timeStr of possibleTimes) {
                            const [h, m] = timeStr.split(':');
                            const slotStart = new Date(checkDate);
                            slotStart.setHours(h, m, 0, 0);
                            const slotEnd = new Date(slotStart);
                            slotEnd.setHours(slotStart.getHours() + 1);

                            const isBusy = busyEvents.some(event => (slotStart < event.end && slotEnd > event.start));

                            if (!isBusy) {
                                freeSlots.push({
                                    date: slotStart.toISOString().split('T')[0],
                                    time: timeStr,
                                    score: 90 + Math.floor(Math.random() * 10)
                                });
                                if (freeSlots.length >= 3) break;
                            }
                        }
                    }
                    checkDate.setDate(checkDate.getDate() + 1);
                }
                setSuggestedSlots(freeSlots);
            }
        } finally { setIsAnalyzingSlots(false); }
    };

    const openEmailPreview = () => {
        if (!selectedCandidate) {
            alert("Lütfen önce bir aday seçin.");
            return;
        }
        if (!isGoogleConnected) {
            alert("Lütfen önce Google hesabınızı bağlayın.");
            return;
        }

        const typeLabel = interviewType === 'technical' ? 'Teknik' : (interviewType === 'hr' ? 'İK' : 'Product');
        setEmailSubject(`Mülakat Daveti: ${typeLabel} Değerlendirmesi - ${selectedCandidate.name}`);
        setEmailBody(`Merhaba ${selectedCandidate.name},\n\nTalentFlow ekibi olarak sizinle ${typeLabel} mülakatı gerçekleştirmek istiyoruz.\n\nMülakat Detayları:\n- Tarih: ${manualDate || 'Henüz Belirlenmedi'}\n- Saat: ${manualTime}\n- Platform: TalentFlow Workspace\n\nMülakat linkiniz: cognitive.slate/meet/${selectedCandidate.id.substring(0,8)}\n\nHerhangi bir sorunuz olursa bu mail üzerinden bizimle iletişime geçebilirsiniz.\n\nİyi çalışmalar dileriz.`);
        setIsEmailModalOpen(true);
    };

    const handleSendEmail = async () => {
        setIsSendingEmail(true);
        try {
            const result = await sendDirectEmail(userId, googleToken, {
                to: selectedCandidate.email,
                subject: emailSubject,
                body: emailBody
            });

            if (result.success) {
                setSaveStatus('success');
                setIsEmailModalOpen(false);
                setTimeout(() => setSaveStatus('idle'), 2000);
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            alert("❌ E-posta gönderilemedi: " + err.message);
        } finally {
            setIsSendingEmail(false);
        }
    };

    const createInterviewRecord = async (slot = null, startNow = false) => {
        if (!selectedCandidate) return;
        setSaveStatus('saving');
        
        try {
            const interviewerName = selectedInterviewer?.displayName || currentUser?.displayName || 'Değerlendirici';
            
            // Generate link
            const meetLink = `https://meet.google.com/cog-${selectedCandidate.id.substring(0,3)}-${Math.random().toString(36).substring(7)}`;

            const newSession = {
                id: `iv-${selectedCandidate.id.substring(0, 4)}-${Date.now()}`,
                title: interviewType === 'technical' ? 'Teknik Mülakat' : (interviewType === 'hr' ? 'İK Filtre' : 'Product Mülakatı'),
                date: slot ? slot.date : new Date().toISOString().split('T')[0],
                time: slot ? slot.time : new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                type: interviewType,
                interviewer: interviewerName,
                status: startNow ? 'live' : 'scheduled',
                meetLink: meetLink
            };

            // If we have a slot and it's scheduled, optionally create a real calendar event
            if (slot && !startNow && isGoogleConnected) {
                const startDT = new Date(`${slot.date}T${slot.time}:00`);
                const endDT = new Date(startDT.getTime() + 60 * 60 * 1000);
                
                await createDirectCalendarEvent(userId, googleToken, {
                    summary: `${selectedCandidate.name} - ${newSession.title}`,
                    description: `TalentFlow üzerinden planlanan mülakat seansı.\nAday Score: %${Math.round(selectedCandidate.bestScore || 0)}`,
                    startDateTime: startDT.toISOString(),
                    endDateTime: endDT.toISOString(),
                    guestEmail: selectedCandidate.email
                });
            }

            await updateCandidate(selectedCandidate.id, {
                interviewSessions: [...(selectedCandidate.interviewSessions || []), newSession],
                hasInterview: true,
                status: startNow ? 'Interview' : 'Review'
            });

            setSaveStatus('success');
            setTimeout(() => {
                setSaveStatus('idle');
                if (startNow) {
                    navigate(`/live-interview/${newSession.id}`);
                } else {
                    setSelectedCandidate(null);
                    setIsPlanningMode(false);
                }
            }, 1000);
        } catch (err) {
            console.error("Save interview error:", err);
            setSaveStatus('idle');
            alert("Kaydedilemedi: " + err.message);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-[#F8FAFC] font-inter">
            <Header title="Mülakat Yönetimi" />
            
            <main className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                
                {/* PAGE HEADER */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div className="flex items-center gap-4">
                        {isPlanningMode && (
                            <button 
                                onClick={() => setIsPlanningMode(false)}
                                className="w-9 h-9 rounded-xl bg-white border border-[#E2E8F0] flex items-center justify-center text-[#1E3A8A] hover:bg-blue-50 transition-all shadow-sm"
                            >
                                <ArrowLeft className="w-4 h-4" />
                            </button>
                        )}
                        <div>
                            <h1 className="text-xl font-black text-[#0F172A] tracking-tighter italic">Mülakat Yönetimi</h1>
                            <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-widest mt-0.5 opacity-60">Aktif Operasyonlar</p>
                        </div>
                    </div>
                    {!isPlanningMode && (
                        <button 
                            onClick={() => setIsPlanningMode(true)}
                            className="bg-[#1E3A8A] text-white px-4 py-2 rounded-xl font-bold text-[12px] flex items-center gap-2 shadow-lg shadow-blue-900/10 hover:bg-blue-800 transition-all active:scale-95"
                        >
                            <Plus className="w-4 h-4" /> Yeni Seans Başlat/Planla
                        </button>
                    )}
                </div>

                {isPlanningMode && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        {/* FORM AREA */}
                        <div className="lg:col-span-2 bg-white rounded-[24px] border border-[#E2E8F0] shadow-sm overflow-hidden flex flex-col">
                            <div className="p-4 border-b border-[#F1F5F9] flex items-center justify-between bg-slate-50/50">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-lg bg-blue-100/50 text-[#1E3A8A] flex items-center justify-center">
                                        <Plus className="w-4 h-4" />
                                    </div>
                                    <h2 className="text-[13px] font-black text-[#0F172A] uppercase tracking-tight">Yeni Seans Konfigürasyonu</h2>
                                </div>
                            </div>
                            
                            <div className="p-5 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">Aday Seçimi</label>
                                        <select 
                                            value={selectedCandidate?.id || ''}
                                            onChange={(e) => setSelectedCandidate(enrichedCandidates.find(c => c.id === e.target.value))}
                                            className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-2 text-[12px] font-bold text-[#0F172A] outline-none focus:border-blue-500 transition-all"
                                        >
                                            <option value="">Aday seçiniz...</option>
                                            {enrichedCandidates.map(c => (
                                                <option key={c.id} value={c.id}>{c.name} - %{Math.round(c.bestScore || 0)}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">Pozisyon</label>
                                        <div className="w-full bg-[#F1F5F9] border border-[#E2E8F0] rounded-xl px-4 py-2 text-[12px] font-bold text-[#64748B] italic">
                                            {selectedCandidate?.position || selectedCandidate?.bestTitle || 'Otomatik Belirlenir'}
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">Email</label>
                                        <input type="text" readOnly value={selectedCandidate?.email || '-'} className="w-full bg-[#F1F5F9] border border-[#E2E8F0] rounded-xl px-4 py-2 text-[11px] font-bold text-[#64748B]" />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest text-emerald-600">Manuel Tarih</label>
                                        <input 
                                            type="date" 
                                            value={manualDate}
                                            onChange={(e) => setManualDate(e.target.value)}
                                            className="w-full bg-emerald-50/30 border border-emerald-100 rounded-xl px-4 py-2 text-[11px] font-bold text-[#0F172A] outline-none focus:border-emerald-500" 
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest text-[#10B981]">Saat Seçimi</label>
                                        <select 
                                            value={manualTime}
                                            onChange={(e) => setManualTime(e.target.value)}
                                            className="w-full bg-emerald-50/30 border border-emerald-100 rounded-xl px-4 py-2 text-[11px] font-bold text-[#0F172A] outline-none focus:border-emerald-500 appearance-none pointer-events-auto"
                                        >
                                            {timeSlots.map(t => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="space-y-1 col-span-2">
                                        <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">Mülakat Tipi</label>
                                        <div className="grid grid-cols-3 gap-1.5">
                                            {[
                                                { id: 'technical', label: 'TEKNİK', icon: Settings },
                                                { id: 'hr', label: 'İK FİLTRE', icon: User },
                                                { id: 'product', label: 'PRODUCT', icon: Package }
                                            ].map(type => (
                                                <button 
                                                    key={type.id}
                                                    onClick={() => setInterviewType(type.id)}
                                                    className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all border ${interviewType === type.id ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] shadow-md' : 'bg-white text-[#64748B] border-[#E2E8F0] hover:bg-slate-50'}`}
                                                >
                                                    <type.icon className="w-3 h-3" /> {type.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-[#F0FFF4] border border-[#C6F6D5] rounded-xl px-4 py-3 flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <label className="text-[8px] font-black text-[#22543D] uppercase tracking-[0.2em] mb-0.5">Mülakat Linki</label>
                                        <span className="text-[11px] font-mono text-[#2F855A] font-black italic">cognitive.slate/meet/{selectedCandidate?.id.substring(0,8) || 'xxxx-xxxx'}</span>
                                    </div>
                                    <button className="p-2 text-[#2F855A] hover:bg-white rounded-lg transition-all"><Copy className="w-3.5 h-3.5" /></button>
                                </div>

                                <div className="pt-2 flex flex-wrap gap-2">
                                    <button 
                                        onClick={openEmailPreview}
                                        disabled={!selectedCandidate}
                                        className="flex-1 bg-white border-2 border-blue-50 text-[#1E3A8A] py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-blue-50 transition-all disabled:opacity-40"
                                    >
                                        <Mail className="w-3.5 h-3.5" /> E-POSTA GÖNDER
                                    </button>
                                    <button 
                                        disabled={true} 
                                        className="flex-1 bg-white border border-slate-100 text-[#94A3B8] py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 cursor-not-allowed opacity-50"
                                    >
                                        <MessageSquare className="w-3.5 h-3.5" /> SMS GÖNDER
                                    </button>
                                    <div className="flex-[2] flex gap-2">
                                        <button 
                                            onClick={handleAutoPlan}
                                            disabled={isAnalyzingSlots || !selectedCandidate}
                                            className="w-11 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center hover:bg-emerald-100 transition-all border border-emerald-100"
                                            title="Akıllı Planlayıcıyı Çalıştır"
                                        >
                                            {isAnalyzingSlots ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                        </button>
                                        {manualDate && manualTime ? (
                                            <button 
                                                onClick={() => createInterviewRecord({ date: manualDate, time: manualTime }, false)}
                                                disabled={!selectedCandidate}
                                                className="flex-1 bg-[#10B981] text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/10"
                                            >
                                                <Calendar className="w-3.5 h-3.5" /> MÜLAKATI PLANLA
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={() => createInterviewRecord(null, true)}
                                                disabled={!selectedCandidate}
                                                className="flex-1 bg-[#1E3A8A] text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-blue-800 transition-all shadow-xl shadow-blue-900/10 disabled:opacity-40"
                                            >
                                                <Play className="w-3.5 h-3.5 fill-current" /> ŞİMDİ BAŞLAT
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {suggestedSlots.length > 0 && (
                                    <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">UYGUN SLOTLAR (PLANLA):</span>
                                        <div className="grid grid-cols-3 gap-2">
                                            {suggestedSlots.map((slot, i) => (
                                                <button 
                                                    key={i}
                                                    onClick={() => createInterviewRecord(slot, false)}
                                                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-400 transition-all text-left flex flex-col gap-0.5 group"
                                                >
                                                    <span className="text-[10px] font-black text-[#1E3A8A] tabular-nums">{slot.time}</span>
                                                    <span className="text-[9px] font-bold text-slate-500 uppercase">{new Date(slot.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* AI ANALYSIS BAR */}
                        <div className="bg-[#EBF4FF] rounded-[24px] border border-[#D1E9FF] p-6 flex flex-col items-center">
                            <div className="w-full flex items-center gap-2 mb-6">
                                <Sparkles className="w-3.5 h-3.5 text-[#1E3A8A]" />
                                <h3 className="text-[10px] font-black text-[#1E3A8A] uppercase tracking-widest">AI ADAY ANALİZİ</h3>
                            </div>

                            <div className="relative w-32 h-32 mb-8">
                                <svg className="w-full h-full transform -rotate-90">
                                    <circle cx="64" cy="64" r="58" stroke="white" strokeWidth="10" fill="transparent" opacity="0.4" />
                                    <circle cx="64" cy="64" r="58" stroke="#10B981" strokeWidth="10" fill="transparent" strokeDasharray={364} strokeDashoffset={364 - (364 * (selectedCandidate?.bestScore || 0)) / 100} strokeLinecap="round" className="transition-all duration-1000" />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-3xl font-black text-[#0F172A] tabular-nums">%{Math.round(selectedCandidate?.bestScore || 0)}</span>
                                    <span className="text-[8px] font-black text-[#64748B] uppercase tracking-widest">UYUM</span>
                                </div>
                            </div>

                            <div className="w-full space-y-4 mb-4">
                               <div className="space-y-1.5">
                                   <div className="flex justify-between items-center text-[10px] font-black text-[#64748B] uppercase"><span>Teknik Yetkinlik</span><span>%{Math.round((selectedCandidate?.bestScore || 0) * 0.85)}</span></div>
                                   <div className="w-full h-1 bg-white/50 rounded-full"><div className="h-full bg-[#1E3A8A] rounded-full" style={{ width: `${(selectedCandidate?.bestScore || 0) * 0.85}%` }} /></div>
                               </div>
                               <div className="space-y-1.5">
                                   <div className="flex justify-between items-center text-[10px] font-black text-[#64748B] uppercase"><span>Kültürel Uyum</span><span>%{Math.round((selectedCandidate?.bestScore || 0) * 0.9)}</span></div>
                                   <div className="w-full h-1 bg-white/50 rounded-full"><div className="h-full bg-[#1E3A8A] rounded-full" style={{ width: `${(selectedCandidate?.bestScore || 0) * 0.9}%` }} /></div>
                               </div>
                            </div>
                            
                            {selectedCandidate && (
                                <div className="mt-4 bg-white/40 p-4 rounded-xl border border-white flex flex-col gap-2 shadow-sm">
                                    <p className="text-[11px] text-[#475569] font-medium leading-relaxed italic">"Adayın {selectedCandidate.bestTitle || 'ilgili alan'} tecrübesi %{Math.round(selectedCandidate.bestScore || 0)} uyum ile güçlü bir potansiyel sergiliyor."</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* SESSIONS DASHBOARD OVERHAUL */}
                <div className="space-y-4 flex-1 flex flex-col min-h-0">
                    {/* STATS STRIP */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {[
                            { label: 'CANLI YAYIN', value: activeInterviews.filter(i => i.status === 'live').length, icon: Activity, color: 'text-rose-600', bg: 'bg-rose-50' },
                            { label: 'BUGÜN', value: activeInterviews.filter(i => i.date === new Date().toISOString().split('T')[0]).length, icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50' },
                            { label: 'BEKLEYEN', value: activeInterviews.filter(i => i.status === 'scheduled').length, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
                            { label: 'TOPLAM OPERASYON', value: activeInterviews.length, icon: Zap, color: 'text-emerald-600', bg: 'bg-emerald-50' }
                        ].map((stat, i) => (
                            <div key={i} className={`p-4 rounded-[20px] bg-white border border-[#E2E8F0] shadow-sm flex items-center justify-between`}>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</span>
                                    <span className={`text-xl font-black ${stat.color}`}>{stat.value}</span>
                                </div>
                                <div className={`w-10 h-10 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center`}>
                                    <stat.icon className="w-5 h-5" />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="bg-white rounded-[24px] border border-[#E2E8F0] shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
                        <div className="p-4 border-b border-[#F1F5F9] flex items-center justify-between bg-slate-50/30">
                            <div className="flex items-center gap-2">
                                <h2 className="text-[13px] font-black text-[#0F172A] uppercase tracking-tighter">Planlanmış ve Aktif Seanslar</h2>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="bg-white px-3 py-1 rounded-lg border border-[#E2E8F0] text-[10px] font-bold text-slate-500 flex items-center gap-2">
                                    <CalendarDays className="w-3.5 h-3.5" /> {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
                                </div>
                            </div>
                        </div>

                        <div className="overflow-x-auto flex-1 min-h-0 custom-scrollbar">
                            <table className="w-full text-left">
                                <thead className="bg-[#F8FAFC] sticky top-0 z-10 border-b border-[#F1F5F9]">
                                    <tr>
                                        <th className="px-6 py-4 text-[10px] font-black text-[#64748B] uppercase tracking-widest">ADAY VE POZİSYON</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-[#64748B] uppercase tracking-widest text-center">ZAMANLAMA</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-[#64748B] uppercase tracking-widest">DURUM</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-[#64748B] uppercase tracking-widest">MÜLAKATÇI</th>
                                        <th className="px-6 py-4"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#F1F5F9]">
                                    {activeInterviews.map((int, idx) => {
                                        const isToday = int.date === new Date().toISOString().split('T')[0];
                                        return (
                                            <tr key={idx} className={`hover:bg-blue-50/20 transition-all ${isToday ? 'bg-blue-50/10' : ''}`}>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 bg-white border border-[#E2E8F0] text-[#1E3A8A] rounded-xl flex items-center justify-center text-[11px] font-black shadow-sm">
                                                            {int.candidateName[0]}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[13px] font-bold text-[#0F172A] leading-none">{int.candidateName}</span>
                                                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black tracking-widest uppercase ${
                                                                    int.type === 'technical' ? 'bg-blue-50 text-blue-600' : (int.type === 'hr' ? 'bg-amber-50 text-amber-600' : 'bg-purple-50 text-purple-600')
                                                                }`}>{int.type === 'technical' ? 'TEKNİK' : (int.type === 'hr' ? 'İK' : 'PROD')}</span>
                                                            </div>
                                                            <span className="text-[11px] text-[#64748B] font-medium mt-1">{int.role}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="inline-flex flex-col items-center min-w-[100px] p-2 bg-slate-50 border border-slate-100 rounded-xl">
                                                        <span className="text-[12px] font-black text-[#0F172A] tabular-nums">{int.time}</span>
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase">{new Date(int.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-2 h-2 rounded-full ${int.status === 'live' ? 'bg-rose-500 animate-ping' : 'bg-amber-400'}`} />
                                                        <span className={`text-[10px] font-black tracking-tight ${int.status === 'live' ? 'text-rose-600' : 'text-[#0F172A]'}`}>
                                                            {int.status === 'live' ? 'CANLI YAYIN' : 'HAZIRDA BEKLİYOR'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full bg-slate-100 border border-white shadow-sm flex items-center justify-center text-[9px] font-bold text-[#1E3A8A]">
                                                            {int.interviewer ? int.interviewer[0] : '?'}
                                                        </div>
                                                        <span className="text-[12px] font-bold text-[#475569]">{int.interviewer || 'Atanmadı'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        {int.status === 'live' ? (
                                                            <button 
                                                                onClick={() => navigate(`/live-interview/${int.id}`)}
                                                                className="bg-rose-600 text-white px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-600/20"
                                                            >
                                                                KATIL
                                                            </button>
                                                        ) : (
                                                            <button 
                                                                onClick={() => navigate(`/live-interview/${int.id}`)}
                                                                className="bg-[#1E3A8A] text-white px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-800 transition-all shadow-sm"
                                                            >
                                                                BAŞLAT
                                                            </button>
                                                        )}
                                                        <button className="p-2 text-slate-300 hover:text-slate-500 transition-colors"><MoreVertical className="w-4 h-4" /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {activeInterviews.length === 0 && (
                                        <tr>
                                            <td colSpan="5" className="px-6 py-20 text-center">
                                                <div className="flex flex-col items-center gap-3">
                                                    <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-300"><CalendarDays className="w-6 h-6" /></div>
                                                    <p className="text-[13px] text-slate-400 font-medium italic">Henüz planlanmış veya aktif bir mülakat seansı bulunmuyor.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>

            {/* OVERLAYS */}
            {/* EMAIL PREVIEW MODAL */}
            {isEmailModalOpen && (
                <div className="fixed inset-0 z-[110] bg-[#0F172A]/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in duration-300">
                        <div className="p-6 border-b border-[#F1F5F9] flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-blue-100/50 text-[#1E3A8A] flex items-center justify-center">
                                    <Mail className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-[14px] font-black text-[#0F172A] uppercase tracking-tight">Davet E-Postası Taslağı</h3>
                                    <p className="text-[11px] text-[#64748B] font-bold uppercase tracking-wider">{selectedCandidate?.email}</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setIsEmailModalOpen(false)}
                                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"
                            >
                                <ChevronDown className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest px-1">Konu Satırı</label>
                                <input 
                                    type="text"
                                    value={emailSubject}
                                    onChange={(e) => setEmailSubject(e.target.value)}
                                    className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-3 text-[13px] font-bold text-[#0F172A] outline-none focus:border-blue-500 transition-all"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest px-1">Mesaj İçeriği</label>
                                <textarea 
                                    value={emailBody}
                                    onChange={(e) => setEmailBody(e.target.value)}
                                    rows={10}
                                    className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-3 text-[12px] font-medium text-[#475569] leading-relaxed outline-none focus:border-blue-500 transition-all resize-none"
                                />
                            </div>
                        </div>

                        <div className="p-6 bg-slate-50 border-t border-[#F1F5F9] flex items-center justify-end gap-3">
                            <button 
                                onClick={() => setIsEmailModalOpen(false)}
                                className="px-6 py-2.5 rounded-xl text-[12px] font-black text-[#64748B] hover:bg-slate-200 transition-all uppercase tracking-widest"
                            >
                                İptal
                            </button>
                            <button 
                                onClick={handleSendEmail}
                                disabled={isSendingEmail}
                                className="px-8 py-2.5 bg-[#1E3A8A] text-white rounded-xl text-[12px] font-black uppercase tracking-widest hover:bg-blue-800 transition-all shadow-lg shadow-blue-900/10 flex items-center gap-2"
                            >
                                {isSendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} ŞİMDİ GÖNDER
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {saveStatus !== 'idle' && (
                <div className="fixed inset-0 z-[100] bg-[#0F172A]/80 backdrop-blur-md flex items-center justify-center animate-in fade-in duration-300">
                    <div className="bg-white p-10 rounded-[42px] shadow-2xl flex flex-col items-center text-center gap-6 max-w-sm animate-in zoom-in duration-300">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500 ${saveStatus === 'success' ? 'bg-emerald-500 scale-110 shadow-xl shadow-emerald-500/20' : 'bg-blue-50'}`}>
                            {saveStatus === 'saving' ? <Loader2 className="w-8 h-8 text-blue-600 animate-spin" /> : <Check className="w-8 h-8 text-white" />}
                        </div>
                        <div>
                             <h3 className="text-xl font-bold text-[#0F172A] tracking-tight">{saveStatus === 'success' ? 'Başarılı!' : 'İşlem Yapılıyor'}</h3>
                             <p className="text-[13px] text-[#64748B] mt-1">{saveStatus === 'success' ? 'Kayıt güncellendi ve davetler gönderildi.' : 'Birimler senkronize ediliyor...'}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
