// src/pages/InterviewManagementPage.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useCandidates } from '../context/CandidatesContext';
import { useAuth } from '../context/AuthContext';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getCalendarEvents, connectGoogleWorkspace, sendDirectEmail, createDirectCalendarEvent, ensureValidGoogleToken } from '../services/integrationService';
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
    AlertTriangle,
    Check,
    Loader2,
    Link as LinkIcon,
    Package,
    ArrowLeft,
    Activity,
    Trash2,
    RefreshCw,
    CheckCircle
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
    const [openMenuId, setOpenMenuId] = useState(null);
    
    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setOpenMenuId(null);
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    
    // New Manual Selection States
    const [manualDate, setManualDate] = useState('');
    const [manualTime, setManualTime] = useState('09:00');

    // Conflict & day-slot States
    const [conflictWarning, setConflictWarning] = useState(null); // null | { type, message, existing }
    const [dayFreeSlots, setDayFreeSlots] = useState([]);          // free slots for selected day
    const [isCheckingDay, setIsCheckingDay] = useState(false);     // loading indicator for day check
    const [dayCalendarBusy, setDayCalendarBusy] = useState([]);    // fetched calendar events for selected day

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

    // ─── PUBLIC INTERVIEW STATUS MAP ──────────────────────────────────────────
    // `interviews/{sessionId}` is the authoritative source for completion status.
    // The candidate-array copy can be ghost-written by a race condition in the
    // heartbeat, so we always overlay the public doc status on top.
    const [sessionStatuses, setSessionStatuses] = useState({});

    useEffect(() => {
        const unsubscribe = onSnapshot(
            collection(db, 'interviews'),
            (snap) => {
                const map = {};
                snap.forEach(docSnap => {
                    map[docSnap.id] = docSnap.data().status;
                });
                setSessionStatuses(map);
            },
            (err) => console.warn('[InterviewMgmt] session status listener error:', err)
        );
        return () => unsubscribe();
    }, []);

    const isGoogleConnected = userProfile?.integrations?.google?.connected;
    const googleToken = userProfile?.integrations?.google?.accessToken;

    // ─── CONFLICT DETECTION HELPERS ───────────────────────────────────────────

    // Check existing interview sessions across ALL candidates for time overlap.
    // Returns the first conflicting session info or null.
    const checkLocalConflict = (date, time) => {
        if (!date || !time) return null;
        const slotStart = new Date(`${date}T${time}:00`);
        const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
        if (isNaN(slotStart.getTime())) return null;

        for (const candidate of enrichedCandidates) {
            for (const session of (candidate.interviewSessions || [])) {
                if (!session.date || !session.time) continue;
                if (session.status === 'completed' || session.status === 'cancelled') continue;

                // Normalize date: session.date may be "2026-03-19" or "2026-03-19T10:00:00.000Z"
                const sessionDateStr = (session.date || '').split('T')[0];
                if (sessionDateStr !== date) continue; // only check sessions on the same date

                // Normalize time: trim whitespace, accept "HH:MM" or "H:MM"
                const sessionTime = (session.time || '').trim();
                const sesStart = new Date(`${date}T${sessionTime}:00`);
                if (isNaN(sesStart.getTime())) continue; // skip sessions with unparseable times
                const sesEnd = new Date(sesStart.getTime() + 60 * 60 * 1000);

                if (slotStart < sesEnd && slotEnd > sesStart) {
                    return { candidateName: candidate.name, session };
                }
            }
        }
        return null;
    };

    // Given a date and list of busy calendar event objects ({ start, end }),
    // return up to 5 free 1-hour slots within business hours (08:00–18:00)
    // excluding times that are already busy or in the past.
    const computeDayFreeSlots = (date, busyEvents = []) => {
        const candidateHours = [
            '08:00','09:00','10:00','11:00','13:00',
            '14:00','15:00','16:00','17:00','18:00'
        ];
        const now = new Date();
        const free = [];

        for (const time of candidateHours) {
            const slotStart = new Date(`${date}T${time}:00`);
            const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

            if (slotStart <= now) continue; // skip past slots

            const localConflict = checkLocalConflict(date, time);
            if (localConflict) continue;

            const calConflict = busyEvents.some(ev => slotStart < ev.end && slotEnd > ev.start);
            if (calConflict) continue;

            free.push({ date, time });
            if (free.length >= 5) break;
        }
        return free;
    };

    // Evaluate the currently selected date+time and update conflictWarning.
    const evaluateConflict = (date, time, busyCalEvents) => {
        if (!date || !time) { setConflictWarning(null); return; }

        // 1. Check system interviews
        const localHit = checkLocalConflict(date, time);
        if (localHit) {
            setConflictWarning({
                type: 'system',
                message: `Bu saat zaten ${localHit.candidateName} adayı ile planlanmış (${localHit.session.title}).`,
                existing: localHit
            });
            return;
        }

        // 2. Check Google Calendar
        if (busyCalEvents.length > 0) {
            const slotStart = new Date(`${date}T${time}:00`);
            const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
            const calHit = busyCalEvents.find(ev => slotStart < ev.end && slotEnd > ev.start);
            if (calHit) {
                setConflictWarning({
                    type: 'calendar',
                    message: `Takvimde bu saate çakışan bir etkinlik mevcut: "${calHit.summary || 'Meşgul'}"`,
                    existing: calHit
                });
                return;
            }
        }

        setConflictWarning(null);
    };

    // ─── EFFECTS ──────────────────────────────────────────────────────────────

    // When the selected date changes: fetch Google Calendar events for that day,
    // compute free slots, and re-evaluate the current time conflict.
    useEffect(() => {
        if (!manualDate) {
            setDayCalendarBusy([]);
            setDayFreeSlots([]);
            setConflictWarning(null);
            return;
        }

        let cancelled = false;
        const run = async () => {
            setIsCheckingDay(true);
            let busyEvents = [];

            if (isGoogleConnected) {
                try {
                    const token = await ensureValidGoogleToken(userId, userProfile);
                    if (token) {
                        const dayStart = new Date(`${manualDate}T00:00:00`).toISOString();
                        const dayEnd = new Date(`${manualDate}T23:59:59`).toISOString();
                        const result = await getCalendarEvents(token, dayStart, dayEnd);
                        if (result.success) {
                            busyEvents = result.events
                                .filter(e => e.start.dateTime) // skip all-day events (no specific times)
                                .map(e => ({
                                    start: new Date(e.start.dateTime),
                                    end: new Date(e.end.dateTime),
                                    summary: e.summary
                                }));
                        }
                    }
                } catch (err) {
                    console.warn('[ConflictCheck] Calendar fetch failed:', err.message);
                }
            }

            if (cancelled) return;
            setDayCalendarBusy(busyEvents);
            setDayFreeSlots(computeDayFreeSlots(manualDate, busyEvents));
            evaluateConflict(manualDate, manualTime, busyEvents);
            setIsCheckingDay(false);
        };

        run();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [manualDate, isGoogleConnected]);

    // Re-evaluate conflict when only the time changes (date and busy list stay the same).
    useEffect(() => {
        evaluateConflict(manualDate, manualTime, dayCalendarBusy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [manualTime]);

    // Reset conflict / day-slot state when the candidate changes (or form closes → null candidate).
    useEffect(() => {
        setConflictWarning(null);
        setDayFreeSlots([]);
        setDayCalendarBusy([]);
        setManualDate('');
        setManualTime('09:00');
    }, [selectedCandidate]);

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

    const { activeInterviews, pastInterviews, stats } = useMemo(() => {
        const active = [];
        const past = [];
        
        const now = new Date();
        const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

        (enrichedCandidates || []).forEach(c => {
            if (c.interviewSessions && Array.isArray(c.interviewSessions)) {
                c.interviewSessions.forEach(session => {
                    const sessionDatePart = session.date ? session.date.split('T')[0] : '';
                    const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(sessionDatePart);

                    // Overlay the authoritative public Firestore doc status (if available)
                    // to fix ghost-write race conditions in the candidate array.
                    const publicStatus = sessionStatuses[session.id];
                    const effectiveStatus = publicStatus || session.status;

                    const isLive = effectiveStatus === 'live';
                    const isCompleted = effectiveStatus === 'completed' ||
                        (!isLive && (
                            (session.aiOverallScore > 0) ||
                            Boolean(session.aiSummary) ||
                            (session.finalScore > 0)
                        ));
                    const isCancelled = effectiveStatus === 'cancelled';
                    const isFutureOrToday = isIsoDate && sessionDatePart >= todayStr;

                    const sessionData = {
                        ...session,
                        id: session.id || `${c.id}-${Date.now()}-${Math.random()}`,
                        candidate: c,
                        candidateName: c.name,
                        role: c.position || c.bestTitle || 'Pozisyon',
                        matchScore: c.bestScore || 0,
                        _effectiveCompleted: isCompleted,
                        _effectiveStatus: effectiveStatus, // authoritative status for badge
                    };

                    // Filtering logic: Live or Pending/Future goes to Active. Completed/Cancelled/Past goes to History.
                    if (isLive || (isFutureOrToday && !isCompleted && !isCancelled)) {
                        active.push(sessionData);
                    } else {
                        past.push(sessionData);
                    }
                });
            }
        });

        const sortFn = (a, b) => {
            if (a.status === 'live' && b.status !== 'live') return -1;
            if (b.status === 'live' && a.status !== 'live') return 1;
            const dateA = a.date || '9999-99-99';
            const dateB = b.date || '9999-99-99';
            if (dateA !== dateB) return dateA.localeCompare(dateB);
            return (a.time || '00:00').localeCompare(b.time || '00:00');
        };

        const sortedActive = active.sort(sortFn);
        const sortedPast = past.sort((a,b) => {
            const dateA = a.date || '0000-00-00';
            const dateB = b.date || '0000-00-00';
            if (dateA !== dateB) return dateB.localeCompare(dateA); // Newest first
            return (b.time || '00:00').localeCompare(a.time || '00:00');
        });

        return {
            activeInterviews: sortedActive,
            pastInterviews: sortedPast,
            stats: {
                live: active.filter(i => i._effectiveStatus === 'live').length,
                today: active.filter(i => (i.date?.split('T')[0] === todayStr)).length,
                pending: active.filter(i => i._effectiveStatus !== 'live').length,
                total: active.length + past.length
            }
        };
    }, [enrichedCandidates, sessionStatuses]);

    const [viewTab, setViewTab] = useState('active'); // active, past

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

            // Always get a valid (auto-refreshed if needed) token before calling the API
            const freshToken = await ensureValidGoogleToken(userId, userProfile);
            if (!freshToken) {
                alert("Google bağlantısı kurulamadı. Lütfen Ayarlar → Sistem bölümünden yeniden bağlanın.");
                return;
            }
            
            const result = await getCalendarEvents(freshToken, timeMin, timeMax.toISOString());
            
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
        const joinLink = `${window.location.origin}/join/iv-${selectedCandidate.id.substring(0, 4)}-${Date.now()}`; // Mocking ID for preview
        
        setEmailSubject(`Mülakat Daveti: ${typeLabel} Değerlendirmesi - ${selectedCandidate.name}`);
        setEmailBody(`Merhaba ${selectedCandidate.name},\n\nTalent-Inn ekibi olarak sizinle ${typeLabel} mülakatı gerçekleştirmek istiyoruz.\n\nMülakat Detayları:\n- Tarih: ${manualDate || 'Henüz Belirlenmedi'}\n- Saat: ${manualTime}\n- Platform: Talent-Inn Workspace\n\nMülakat linkiniz: ${joinLink}\n\nHerhangi bir sorunuz olursa bu mail üzerinden bizimle iletişime geçebilirsiniz.\n\nİyi çalışmalar dileriz.`);
        setIsEmailModalOpen(true);
    };

    const handleSendEmail = async () => {
        setIsSendingEmail(true);
        try {
            const freshToken = await ensureValidGoogleToken(userId, userProfile);
            if (!freshToken) {
                throw new Error("Google bağlantısı kurulamadı. Lütfen Ayarlar → Sistem bölümünden yeniden bağlanın.");
            }

            const result = await sendDirectEmail(userId, freshToken, {
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

    // Helper: build a local-time ISO string (no trailing Z) from date + "HH:MM"
    const toLocalISOString = (date) => {
        const pad = n => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
    };

    const createInterviewRecord = async (slot = null, startNow = false) => {
        if (!selectedCandidate) return;
        setSaveStatus('saving');
        
        try {
            const interviewerName = selectedInterviewer?.displayName || currentUser?.displayName || 'Değerlendirici';
            
            // Using full ID for better lookup reliability in public pages
            const sessionId = `iv-${selectedCandidate.id}-${Date.now()}`;
            let meetLink = `${window.location.origin}/join/${sessionId}`;
            let calendarEventLink = null;

            const newSession = {
                id: sessionId,
                title: interviewType === 'technical' ? 'Teknik Mülakat' : (interviewType === 'hr' ? 'İK Filtre' : 'Product Mülakatı'),
                date: slot ? slot.date : new Date().toISOString().split('T')[0],
                time: slot ? slot.time : new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                type: interviewType,
                interviewer: interviewerName,
                status: startNow ? 'live' : 'scheduled',
                meetLink
            };

            // Create Google Calendar event when a date/time is specified and Google is connected
            if (slot && !startNow && isGoogleConnected) {
                // Build LOCAL time strings — no UTC conversion — Google Calendar needs local + timezone
                const startDT = new Date(`${slot.date}T${slot.time}:00`);
                const endDT = new Date(startDT.getTime() + 60 * 60 * 1000);
                const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

                // ensureValidGoogleToken silently refreshes if the stored token is expired.
                // This avoids any manual reconnection prompts for the user.
                const freshCalToken = await ensureValidGoogleToken(userId, userProfile);

                if (!freshCalToken) {
                    console.warn('[Calendar] Could not obtain valid token — skipping calendar event.');
                    alert('⚠️ Google token alınamadı. Mülakat sisteme kaydedilecek ama takvime eklenemeyecek.');
                } else {
                    const calResult = await createDirectCalendarEvent(userId, freshCalToken, {
                        summary: `${selectedCandidate.name} — ${newSession.title}`,
                        description: `Talent-Inn üzerinden planlanan mülakat.\nAday: ${selectedCandidate.name}\nPozisyon: ${selectedCandidate.position || '—'}\nDeğerlendirici: ${interviewerName}\nMülakat linki: ${meetLink}`,
                        startDateTime: toLocalISOString(startDT),
                        endDateTime: toLocalISOString(endDT),
                        guestEmail: selectedCandidate.email,
                        timeZone: userTimeZone
                    });

                    if (calResult.success) {
                        if (calResult.meetLink) {
                            meetLink = calResult.meetLink;
                            newSession.meetLink = calResult.meetLink;
                        }
                        if (calResult.htmlLink) {
                            calendarEventLink = calResult.htmlLink;
                            newSession.calendarEventLink = calResult.htmlLink;
                        }
                    } else {
                        // Warn but don't block — interview record is still saved
                        console.warn('[Calendar] Event creation failed:', calResult.error);
                        alert(`⚠️ Takvim etkinliği oluşturulamadı: ${calResult.error}\n\nMülakat yine de sisteme kaydedilecek.`);
                    }
                }
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
    
    const handleDeleteSession = async (candidateId, sessionId) => {
        if (!window.confirm("Bu mülakat seansını silmek istediğinize emin misiniz?")) return;
        
        const candidate = enrichedCandidates.find(c => c.id === candidateId);
        if (!candidate) return;

        const updatedSessions = (candidate.interviewSessions || []).filter(s => s.id !== sessionId);
        
        try {
            await updateCandidate(candidateId, {
                interviewSessions: updatedSessions,
                hasInterview: updatedSessions.length > 0
            });
            setSaveStatus('success');
            setTimeout(() => setSaveStatus('idle'), 1000);
        } catch (err) {
            console.error("Delete session error:", err);
            alert("Silinemedi: " + err.message);
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
                                        <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                                            Manuel Tarih
                                            {isCheckingDay && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                                        </label>
                                        <input 
                                            type="date" 
                                            value={manualDate}
                                            min={new Date().toISOString().split('T')[0]}
                                            onChange={(e) => setManualDate(e.target.value)}
                                            className="w-full bg-emerald-50/30 border border-emerald-100 rounded-xl px-4 py-2 text-[11px] font-bold text-[#0F172A] outline-none focus:border-emerald-500" 
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-[#10B981] uppercase tracking-widest flex items-center gap-1.5">
                                            Saat Seçimi
                                            {conflictWarning && <span className="text-red-500 text-[9px] font-black">⚠ ÇAKIŞMA</span>}
                                            {!conflictWarning && manualDate && manualTime && !isCheckingDay && <span className="text-emerald-500 text-[9px] font-black">✓ UYGUN</span>}
                                        </label>
                                        <select 
                                            value={manualTime}
                                            onChange={(e) => setManualTime(e.target.value)}
                                            className={`w-full rounded-xl px-4 py-2 text-[11px] font-bold text-[#0F172A] outline-none appearance-none pointer-events-auto transition-all ${
                                                conflictWarning 
                                                    ? 'bg-red-50 border border-red-300 focus:border-red-500' 
                                                    : 'bg-emerald-50/30 border border-emerald-100 focus:border-emerald-500'
                                            }`}
                                        >
                                            {timeSlots.map(t => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* CONFLICT WARNING + DAY FREE SLOTS */}
                                    {manualDate && (
                                        <div className="col-span-2 space-y-2 animate-in fade-in duration-200">
                                            {conflictWarning ? (
                                                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2.5">
                                                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[11px] font-black text-red-700">
                                                            {conflictWarning.type === 'system' ? 'Sistem Çakışması' : 'Takvim Çakışması'}
                                                        </p>
                                                        <p className="text-[10px] text-red-600 mt-0.5 leading-relaxed">{conflictWarning.message}</p>
                                                        {dayFreeSlots.length > 0 && (
                                                            <div className="mt-2.5">
                                                                <p className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-1.5">Bu gün uygun saatler:</p>
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {dayFreeSlots.map((slot, i) => (
                                                                        <button
                                                                            key={i}
                                                                            type="button"
                                                                            onClick={() => setManualTime(slot.time)}
                                                                            className="px-3 py-1 bg-white border border-emerald-300 rounded-lg text-[10px] font-black text-emerald-700 hover:bg-emerald-50 transition-all"
                                                                        >
                                                                            {slot.time}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {dayFreeSlots.length === 0 && !isCheckingDay && (
                                                            <p className="text-[9px] text-red-500 mt-1.5 font-bold">Bu gün için uygun saat bulunamadı.</p>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : dayFreeSlots.length > 0 ? (
                                                <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 flex items-start gap-2.5">
                                                    <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[10px] font-black text-emerald-700">Bu gün müsait saatler</p>
                                                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                            {dayFreeSlots.map((slot, i) => (
                                                                <button
                                                                    key={i}
                                                                    type="button"
                                                                    onClick={() => setManualTime(slot.time)}
                                                                    className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all border ${
                                                                        manualTime === slot.time
                                                                            ? 'bg-emerald-500 text-white border-emerald-500'
                                                                            : 'bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                                                                    }`}
                                                                >
                                                                    {slot.time}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : isCheckingDay ? (
                                                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center gap-2">
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                                                    <span className="text-[10px] text-slate-500 font-bold">Takvim kontrol ediliyor...</span>
                                                </div>
                                            ) : null}
                                        </div>
                                    )}

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
                                        <label className="text-[8px] font-black text-[#22543D] uppercase tracking-[0.2em] mb-0.5">Aday Katılım Linki</label>
                                        <span className="text-[11px] font-mono text-[#2F855A] font-black italic">{window.location.origin}/join/{selectedCandidate?.id.substring(0,4)}...</span>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            if (selectedCandidate) {
                                                const link = `${window.location.origin}/join/iv-${selectedCandidate.id}-NEW`;
                                                navigator.clipboard.writeText(link);
                                                alert("Link kopyalandı!");
                                            }
                                        }}
                                        className="p-2 text-[#2F855A] hover:bg-white rounded-lg transition-all"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                    </button>
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
                                                onClick={() => {
                                                    if (conflictWarning) {
                                                        const confirmed = window.confirm(
                                                            `⚠️ Çakışma Uyarısı\n\n${conflictWarning.message}\n\nYine de bu saatte planlamak istiyor musunuz?`
                                                        );
                                                        if (!confirmed) return;
                                                    }
                                                    createInterviewRecord({ date: manualDate, time: manualTime }, false);
                                                }}
                                                disabled={!selectedCandidate || isCheckingDay}
                                                className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-xl ${
                                                    conflictWarning
                                                        ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/10'
                                                        : 'bg-[#10B981] hover:bg-emerald-600 text-white shadow-emerald-500/10'
                                                }`}
                                            >
                                                {conflictWarning 
                                                    ? <><AlertTriangle className="w-3.5 h-3.5" /> YINE DE PLANLA</>
                                                    : <><Calendar className="w-3.5 h-3.5" /> MÜLAKATI PLANLA</>
                                                }
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
                            { label: 'CANLI YAYIN', value: stats.live, icon: Activity, color: 'text-rose-600', bg: 'bg-rose-50' },
                            { label: 'BUGÜN', value: stats.today, icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50' },
                            { label: 'BEKLEYEN', value: stats.pending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
                            { label: 'TOPLAM OPERASYON', value: stats.total, icon: Zap, color: 'text-emerald-600', bg: 'bg-emerald-50' }
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
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-1">
                                    <button 
                                        onClick={() => setViewTab('active')}
                                        className={`px-4 py-1.5 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${viewTab === 'active' ? 'bg-[#1E3A8A] text-white shadow-md' : 'text-slate-400 hover:text-[#1E3A8A]'}`}
                                    >
                                        Aktif Seanslar ({activeInterviews.length})
                                    </button>
                                    <button 
                                        onClick={() => setViewTab('past')}
                                        className={`px-4 py-1.5 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${viewTab === 'past' ? 'bg-[#1E3A8A] text-white shadow-md' : 'text-slate-400 hover:text-[#1E3A8A]'}`}
                                    >
                                        Geçmiş ({pastInterviews.length})
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="bg-white px-3 py-1 rounded-lg border border-[#E2E8F0] text-[10px] font-bold text-slate-500 flex items-center gap-2">
                                    <CalendarDays className="w-3.5 h-3.5" /> {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
                                </div>
                            </div>
                        </div>

                        <div className="overflow-x-auto flex-1 min-h-[400px] custom-scrollbar overflow-y-visible">
                            <table className="w-full text-left border-separate border-spacing-0">
                                <thead className="bg-[#F8FAFC] sticky top-0 z-[60] border-b border-[#F1F5F9]">
                                    <tr>
                                        <th className="px-6 py-4 text-[10px] font-black text-[#64748B] uppercase tracking-widest">ADAY VE POZİSYON</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-[#64748B] uppercase tracking-widest text-center">ZAMANLAMA</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-[#64748B] uppercase tracking-widest">DURUM</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-[#64748B] uppercase tracking-widest">MÜLAKATÇI</th>
                                        <th className="px-6 py-4"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#F1F5F9]">
                                    {(viewTab === 'active' ? activeInterviews : pastInterviews).map((int, idx) => {
                                        const isToday = int.date === new Date().toISOString().split('T')[0];
                                        const isCompleted = int._effectiveCompleted || int.status === 'completed';
                                        return (
                                            <tr key={idx} className={`hover:bg-blue-50/20 transition-all ${isToday && !isCompleted ? 'bg-blue-50/10' : ''}`}>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 bg-white border border-[#E2E8F0] text-[#1E3A8A] rounded-xl flex items-center justify-center text-[11px] font-black shadow-sm">
                                                            {int.candidateName ? int.candidateName[0] : 'A'}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[13px] font-bold text-[#0F172A] leading-none">{int.candidateName}</span>
                                                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black tracking-widest uppercase ${
                                                                    int.type === 'technical' ? 'bg-blue-50 text-blue-600' : (int.type === 'hr' ? 'bg-amber-50 text-amber-600' : 'bg-purple-50 text-purple-600')
                                                                }`}>{int.type === 'technical' ? 'TEKNİK' : (int.type === 'hr' ? 'İK' : 'PROD')}</span>
                                                            </div>
                                                            <span className="text-[11px] text-[#64748B] font-medium mt-1 uppercase tracking-tighter">{int.role}</span>
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
                                                        {int._effectiveStatus === 'live' ? (
                                                            <>
                                                                <div className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                                                                <span className="text-[10px] font-black tracking-tight text-rose-600 uppercase">CANLI YAYIN</span>
                                                            </>
                                                        ) : isCompleted ? (
                                                            <>
                                                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                                                <span className="text-[10px] font-black tracking-tight text-emerald-600 uppercase">TAMAMLANDI</span>
                                                            </>
                                                        ) : int._effectiveStatus === 'cancelled' ? (
                                                            <>
                                                                <div className="w-2 h-2 rounded-full bg-slate-400" />
                                                                <span className="text-[10px] font-black tracking-tight text-slate-400 uppercase">İPTAL EDİLDİ</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <div className="w-2 h-2 rounded-full bg-amber-400" />
                                                                <span className="text-[10px] font-black tracking-tight text-[#0F172A] uppercase">
                                                                    {int._effectiveStatus === 'postponed' ? 'ERTELENDİ / BEKLEMEDE' : 'PLANLANDI'}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-lg bg-slate-100 border border-white shadow-sm flex items-center justify-center text-[9px] font-bold text-[#1E3A8A]">
                                                            {int.interviewer ? int.interviewer[0] : '?'}
                                                        </div>
                                                        <span className="text-[11px] font-bold text-[#475569] uppercase tracking-tighter">{int.interviewer || 'Atanmadı'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button 
                                                            onClick={() => {
                                                                const link = `${window.location.origin}/join/${int.id}`;
                                                                navigator.clipboard.writeText(link);
                                                                alert("Aday katılım linki kopyalandı!");
                                                            }}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 hover:text-blue-600 hover:border-blue-200 transition-all text-[9px] font-black uppercase tracking-widest cursor-pointer shadow-sm active:scale-95 group/copy"
                                                            title="Aday Katılım Bağlantısını Kopyala"
                                                        >
                                                            <Copy className="w-3 h-3 group-hover/copy:scale-110 transition-transform" /> BAĞLANTIYI KOPYALA
                                                        </button>
                                                        {/* Status dependent primary actions */}
                                                        {int._effectiveStatus === 'live' ? (
                                                            <button 
                                                                onClick={() => navigate(`/live-interview/${int.id}`)}
                                                                className="bg-rose-600 text-white px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-600/20 active:scale-95"
                                                            >
                                                                KATIL
                                                            </button>
                                                        ) : isCompleted ? (
                                                            <button 
                                                                onClick={() => navigate(`/interview-report/${int.id}`)}
                                                                className="bg-[#1E3A8A] text-white px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-sm active:scale-95"
                                                            >
                                                                RAPOR
                                                            </button>
                                                        ) : (
                                                            <button 
                                                                onClick={async () => {
                                                                    try {
                                                                        const snap = await getDoc(doc(db, 'interviews', int.id));
                                                                        if (snap.exists() && snap.data()?.status === 'completed') {
                                                                            navigate(`/interview-report/${int.id}`);
                                                                        } else {
                                                                            navigate(`/live-interview/${int.id}`);
                                                                        }
                                                                    } catch {
                                                                        navigate(`/live-interview/${int.id}`);
                                                                    }
                                                                }}
                                                                className="bg-[#1E3A8A] text-white px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-800 transition-all shadow-sm active:scale-95"
                                                            >
                                                                BAŞLAT
                                                            </button>
                                                        )}

                                                        {/* Actions Dropdown */}
                                                        <div className="relative">
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setOpenMenuId(openMenuId === int.id ? null : int.id);
                                                                }}
                                                                className={`p-2 rounded-lg transition-all border border-transparent ${openMenuId === int.id ? 'text-[#0F172A] bg-slate-100 border-slate-200' : 'text-slate-400 hover:text-[#0F172A] hover:bg-slate-100 hover:border-slate-200'}`}
                                                            >
                                                                <MoreHorizontal className="w-4 h-4" />
                                                            </button>
                                                            
                                                            {openMenuId === int.id && (
                                                                <div className="absolute top-full right-0 mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden z-[100] animate-in fade-in zoom-in-95 duration-100">
                                                                    {(int.status === 'scheduled' || int.status === 'live' || int.status === 'postponed') && (
                                                                        <div className="py-1">
                                                                            <button 
                                                                                onClick={async (e) => {
                                                                                    e.stopPropagation();
                                                                                    if (window.confirm("Bu mülakatı ertelemek ve statüsünü değiştirmek istediğinize emin misiniz?")) {
                                                                                        const updatedSessions = int.candidate.interviewSessions.map(s => 
                                                                                            s.id === int.id ? { ...s, status: 'postponed' } : s
                                                                                        );
                                                                                        await updateCandidate(int.candidate.id, { interviewSessions: updatedSessions });
                                                                                        setOpenMenuId(null);
                                                                                    }
                                                                                }}
                                                                                className="w-full px-4 py-2.5 text-left text-[11px] font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-colors border-b border-slate-50"
                                                                            >
                                                                                <Clock className="w-4 h-4" /> Ertele / Beklemeye Al
                                                                            </button>
                                                                            <button 
                                                                                onClick={async (e) => {
                                                                                    e.stopPropagation();
                                                                                    if (window.confirm("Bu mülakatı iptal etmek istediğinize emin misiniz?")) {
                                                                                        const updatedSessions = int.candidate.interviewSessions.map(s => 
                                                                                            s.id === int.id ? { ...s, status: 'cancelled' } : s
                                                                                        );
                                                                                        await updateCandidate(int.candidate.id, { interviewSessions: updatedSessions });
                                                                                        setOpenMenuId(null);
                                                                                    }
                                                                                }}
                                                                                className="w-full px-4 py-2.5 text-left text-[11px] font-bold text-amber-600 hover:bg-amber-50 flex items-center gap-2 transition-colors border-b border-slate-50"
                                                                            >
                                                                                <AlertCircle className="w-4 h-4" /> Mülakatı İptal Et
                                                                            </button>
                                                                            <button 
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setPreselectedInterviewData({ candidateId: int.candidate.id, session: int });
                                                                                    setIsPlanningMode(true);
                                                                                    setOpenMenuId(null);
                                                                                }}
                                                                                className="w-full px-4 py-2.5 text-left text-[11px] font-bold text-blue-600 hover:bg-blue-50 flex items-center gap-2 transition-colors border-b border-slate-50"
                                                                            >
                                                                                <RefreshCw className="w-4 h-4" /> Yeniden Planla
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                    <div className="py-1 bg-slate-50/50">
                                                                        <button 
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleDeleteSession(int.candidate.id, int.id);
                                                                                setOpenMenuId(null);
                                                                            }}
                                                                            className="w-full px-4 py-2.5 text-left text-[11px] font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors"
                                                                        >
                                                                            <Trash2 className="w-4 h-4" /> Seansı Tamamen Sil
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {(viewTab === 'active' ? activeInterviews : pastInterviews).length === 0 && (
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
