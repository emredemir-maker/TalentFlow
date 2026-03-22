// src/pages/InterviewManagementPage.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useCandidates } from '../context/CandidatesContext';
import { useAuth } from '../context/AuthContext';
import { collection, onSnapshot, doc, getDoc, setDoc, serverTimestamp, query, where } from 'firebase/firestore';
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

const PARTICIPANT_INVITES_PATH = 'artifacts/talent-flow/public/data/participantInvites';

export default function InterviewManagementPage() {
    const navigate = useNavigate();
    const { user: currentUser, userProfile, userId, isDepartmentUser, role } = useAuth();
    const { enrichedCandidates, updateCandidate, preselectedInterviewData, setPreselectedInterviewData } = useCandidates();
    
    // UI States
    const [isPlanningMode, setIsPlanningMode] = useState(false);
    const [wizardStep, setWizardStep] = useState(1); // 1 = aday seç, 2 = zaman belirle, 3 = onayla

    // Calendar-first layout state
    const todayStr = new Date().toISOString().split('T')[0];
    const todayDate = new Date();
    const [selectedCalDate, setSelectedCalDate] = useState(todayStr);
    const [calYear, setCalYear] = useState(todayDate.getFullYear());
    const [calMonth, setCalMonth] = useState(todayDate.getMonth()); // 0-indexed
    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [interviewType, setInterviewType] = useState('technical'); // technical, hr, product
    const [isAnalyzingSlots, setIsAnalyzingSlots] = useState(false);
    const [suggestedSlots, setSuggestedSlots] = useState([]);
    const [saveStatus, setSaveStatus] = useState('idle');
    const [systemUsers, setSystemUsers] = useState([]);
    const [selectedInterviewer, setSelectedInterviewer] = useState(null);
    const [openMenuId, setOpenMenuId] = useState(null);

    // Participant selection states (wizard step 2)
    const [selectedParticipants, setSelectedParticipants] = useState([]);
    const [participantAvailability, setParticipantAvailability] = useState({});
    const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
    const [participantSearch, setParticipantSearch] = useState('');

    // "My Interviews" filter for department users in calendar view
    const [showMyInterviews, setShowMyInterviews] = useState(false);
    
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

    // ─── PARTICIPANT INVITES — Cross-department visibility for department_users ──
    // When a department_user is invited to an interview with a candidate from
    // another department, they cannot see it via enrichedCandidates (which is
    // dept-filtered).  We maintain a flat `participantInvites/{sessionId}` collection
    // and query it by participantIds array-contains so any user can find ALL their
    // interviews regardless of candidate department.
    const [myParticipantSessions, setMyParticipantSessions] = useState([]);

    useEffect(() => {
        if (!currentUser?.uid) return;
        const q = query(
            collection(db, PARTICIPANT_INVITES_PATH),
            where('participantIds', 'array-contains', currentUser.uid)
        );
        const unsub = onSnapshot(q,
            (snap) => {
                setMyParticipantSessions(snap.docs.map(d => ({ ...d.data(), _fromInvite: true })));
            },
            (err) => console.warn('[ParticipantInvites] listener error:', err)
        );
        return () => unsub();
    }, [currentUser?.uid]);

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
        setSelectedParticipants([]);
        setParticipantAvailability({});
        setParticipantSearch('');
    }, [selectedCandidate]);

    // Fetch system users via authenticated API (recruiter + department_user + super_admin only)
    useEffect(() => {
        if (!currentUser) return;
        let cancelled = false;
        const load = async () => {
            try {
                const token = await currentUser.getIdToken();
                const res = await fetch('/api/users', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (!cancelled) {
                    const users = data.users || [];
                    setSystemUsers(users);
                    const found = users.find(u => u.id === currentUser.uid);
                    if (found && !selectedInterviewer) setSelectedInterviewer(found);
                }
            } catch (err) {
                console.warn('[SystemUsers] API load failed:', err.message);
            }
        };
        load();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.uid]);

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
                    setWizardStep(2); // skip to time step since candidate is preselected
                } else {
                    setWizardStep(2); // candidate already known, skip to time step
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

    // Toggle a participant in/out of the selectedParticipants list
    const toggleParticipant = (user) => {
        setSelectedParticipants(prev =>
            prev.some(p => p.id === user.id)
                ? prev.filter(p => p.id !== user.id)
                : [...prev, {
                    id: user.id,
                    userId: user.id,
                    name: user.displayName || user.name || user.email || 'Kullanıcı',
                    email: user.email || '',
                    role: user.role || 'department_user',
                }]
        );
    };

    // Fetch availability for ALL system users on step 2 or 3 when date/time are set
    // This lets users see who is free BEFORE selecting them, not just after.
    useEffect(() => {
        if ((wizardStep !== 2 && wizardStep !== 3) || !manualDate || !manualTime || systemUsers.length === 0 || !currentUser) return;
        let cancelled = false;
        const fetchAvailability = async () => {
            setIsLoadingAvailability(true);
            try {
                // Fetch availability for ALL eligible users in the list — not just already-selected
                // ones — so the user can see who is free BEFORE deciding whom to invite.
                const userIds = systemUsers.map(u => u.id).filter(Boolean);
                if (userIds.length === 0) return;
                const token = await currentUser.getIdToken();
                const res = await fetch('/api/users/availability', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ userIds, date: manualDate, time: manualTime })
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (!cancelled) setParticipantAvailability(data.availability || {});
            } catch (err) {
                console.warn('[Availability] Fetch error:', err.message);
            } finally {
                if (!cancelled) setIsLoadingAvailability(false);
            }
        };
        fetchAvailability();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wizardStep, manualDate, manualTime, systemUsers.length]);

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
            
            // Cryptographically random session ID — prevents enumeration attacks
            const sessionId = `iv-${crypto.randomUUID()}`;
            let meetLink = `${window.location.origin}/join/${sessionId}`;
            let calendarEventLink = null;

            const newSession = {
                id: sessionId,
                title: interviewType === 'technical' ? 'Teknik Mülakat' : (interviewType === 'hr' ? 'İK Filtre' : 'Product Mülakatı'),
                date: slot ? slot.date : new Date().toISOString().split('T')[0],
                time: slot ? slot.time : new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                type: interviewType,
                interviewer: interviewerName,
                interviewerId: userId,
                status: startNow ? 'live' : 'scheduled',
                meetLink,
                participants: selectedParticipants.map(p => ({
                    userId: p.id || p.userId,
                    name: p.name || p.email || 'Kullanıcı',
                    email: p.email || null,
                    role: p.role || 'unknown'
                }))
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
                    const participantEmails = selectedParticipants.map(p => p.email).filter(Boolean);
                    const calResult = await createDirectCalendarEvent(userId, freshCalToken, {
                        summary: `${selectedCandidate.name} — ${newSession.title}`,
                        description: `Talent-Inn üzerinden planlanan mülakat.\nAday: ${selectedCandidate.name}\nPozisyon: ${selectedCandidate.position || '—'}\nDeğerlendirici: ${interviewerName}\n${participantEmails.length > 0 ? `Katılımcılar: ${participantEmails.join(', ')}\n` : ''}Mülakat linki: ${meetLink}`,
                        startDateTime: toLocalISOString(startDT),
                        endDateTime: toLocalISOString(endDT),
                        guestEmail: selectedCandidate.email,
                        guestEmails: participantEmails,
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

                        // Send notification emails to internal participants (not the candidate)
                        for (const participant of selectedParticipants) {
                            if (!participant.email) continue;
                            try {
                                await sendDirectEmail(userId, freshCalToken, {
                                    to: participant.email,
                                    subject: `Mülakat Daveti: ${newSession.title} — ${selectedCandidate.name}`,
                                    body: `Merhaba ${participant.name || participant.email},\n\nTalent-Inn üzerinden bir mülakata katılımcı olarak eklendiniz.\n\nAday: ${selectedCandidate.name}\nPozisyon: ${selectedCandidate.position || '—'}\nTarih: ${slot.date}\nSaat: ${slot.time}\nMülakat Tipi: ${newSession.title}\n\nMülakat Linki: ${meetLink}\n\nTalent-Inn Ekibi`
                                });
                            } catch (emailErr) {
                                console.warn('[Participants] Email send failed for:', participant.email, emailErr.message);
                            }
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

            // Write participantInvites so department_users can find cross-department interviews
            const participantIds = newSession.participants.map(p => p.userId).filter(Boolean);
            if (participantIds.length > 0) {
                try {
                    await setDoc(doc(db, PARTICIPANT_INVITES_PATH, sessionId), {
                        sessionId,
                        candidateId: selectedCandidate.id,
                        candidateName: selectedCandidate.name,
                        date: newSession.date,
                        time: newSession.time,
                        type: newSession.type,
                        title: newSession.title,
                        role: selectedCandidate.position || selectedCandidate.bestTitle || 'Pozisyon',
                        interviewerId: newSession.interviewerId,
                        participantIds,
                        participants: newSession.participants,
                        meetLink: newSession.meetLink,
                        status: newSession.status,
                        createdAt: serverTimestamp(),
                    });
                } catch (piErr) {
                    console.warn('[ParticipantInvites] Write failed (non-blocking):', piErr.message);
                }
            }

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

    // ── Calendar computed vars ────────────────────────────────────────────────
    const allCalSessions = useMemo(() => {
        const all = [];
        enrichedCandidates.forEach(c => {
            (c.interviewSessions || []).forEach(s => {
                all.push({ ...s, candidateName: c.name, position: c.position, matchScore: c.matchScore });
            });
        });
        return all;
    }, [enrichedCandidates]);

    const calDaysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const calFirstDow = (() => {
        // JS getDay(): 0=Sun, 1=Mon ... 6=Sat → map to Mon-start 0-indexed
        const d = new Date(calYear, calMonth, 1).getDay();
        return d === 0 ? 6 : d - 1;
    })();

    const dayCalSessions = useMemo(() => {
        if (!selectedCalDate) return [];
        return allCalSessions.filter(s => (s.date || '').split('T')[0] === selectedCalDate)
            .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    }, [allCalSessions, selectedCalDate]);

    const navigateCal = (dir) => {
        let y = calYear, m = calMonth + dir;
        if (m < 0) { m = 11; y--; }
        if (m > 11) { m = 0; y++; }
        setCalYear(y); setCalMonth(m);
    };

    const openWizardWithDate = () => {
        setWizardStep(1);
        setSelectedCandidate(null);
        setManualDate(selectedCalDate || '');
        setManualTime('09:00');
        setIsPlanningMode(true);
    };

    const getCalStatusConfig = (status) => {
        switch (status) {
            case 'live':     return { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: <Play className="w-3 h-3" />, label: 'CANLI' };
            case 'scheduled': return { bg: 'bg-blue-50', text: 'text-blue-600', icon: <Clock className="w-3 h-3" />, label: 'PLANLANDI' };
            case 'completed': return { bg: 'bg-slate-100', text: 'text-slate-600', icon: <CheckCircle2 className="w-3 h-3" />, label: 'TAMAMLANDI' };
            case 'postponed': return { bg: 'bg-amber-50', text: 'text-amber-600', icon: <AlertCircle className="w-3 h-3" />, label: 'ERTELENDİ' };
            case 'cancelled': return { bg: 'bg-red-50', text: 'text-red-600', icon: <AlertTriangle className="w-3 h-3" />, label: 'İPTAL' };
            default:         return { bg: 'bg-slate-100', text: 'text-slate-600', icon: null, label: status || '—' };
        }
    };


    return (
        <div className="flex flex-col h-screen bg-[#FAFAF8] font-inter">
            <Header title="Mülakat Yönetimi" />

            {/* ═══ PLANNING WIZARD MODE ═══════════════════════════════════════ */}
            {isPlanningMode && (
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <div className="flex items-center gap-4 mb-4 px-2 pt-2">
                        <button
                            onClick={() => { setIsPlanningMode(false); setWizardStep(1); }}
                            className="w-9 h-9 rounded-xl bg-white border border-[#E2E8F0] flex items-center justify-center text-[#1E3A8A] hover:bg-blue-50 transition-all shadow-sm"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div>
                            <h1 className="text-xl font-semibold text-[#0F172A]">Yeni Mülakat Planla</h1>
                            <p className="text-xs text-[#64748B] mt-0.5 font-medium">4 adımda tamamlayın</p>
                        </div>
                        {(wizardStep >= 2) && selectedCandidate && manualDate && (
                            <div className="ml-auto text-xs text-[#64748B] bg-white border border-[#E2E8F0] rounded-full px-3 py-1 flex items-center gap-1.5 shadow-sm">
                                <span className="font-semibold text-[#0F172A]">{selectedCandidate.name}</span>
                                <span>·</span>
                                <span>{new Date(manualDate + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
                            </div>
                        )}
                    </div>
                                        <div className="bg-white rounded-[24px] border border-[#E2E8F0] shadow-sm overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-300">

                        {/* WIZARD STEP PROGRESS BAR */}
                        <div className="px-8 pt-6 pb-5 border-b border-[#F1F5F9] bg-slate-50/40">
                            <div className="relative flex justify-between items-start">
                                <div className="absolute left-5 right-5 top-5 h-0.5 bg-[#E2E8F0] z-0" />
                                <div
                                    className="absolute left-5 top-5 h-0.5 bg-[#1E3A8A] z-0 transition-all duration-500"
                                    style={{ right: wizardStep === 1 ? 'calc(75%)' : wizardStep === 2 ? 'calc(50%)' : wizardStep === 3 ? 'calc(25%)' : '20px', left: '20px' }}
                                />
                                {[
                                    { num: 1, label: 'Aday Seçimi' },
                                    { num: 2, label: 'Katılımcılar' },
                                    { num: 3, label: 'Zaman Belirle' },
                                    { num: 4, label: 'Onayla & Gönder' }
                                ].map(step => (
                                    <div
                                        key={step.num}
                                        className="relative z-10 flex flex-col items-center gap-2 cursor-pointer select-none"
                                        onClick={() => step.num < wizardStep && setWizardStep(step.num)}
                                    >
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm border-2 transition-all ${
                                            step.num < wizardStep
                                                ? 'bg-[#10B981] border-[#10B981] text-white shadow-md shadow-emerald-500/20'
                                                : step.num === wizardStep
                                                ? 'bg-[#1E3A8A] border-[#1E3A8A] text-white shadow-lg shadow-blue-900/15'
                                                : 'bg-white border-[#E2E8F0] text-[#94A3B8]'
                                        }`}>
                                            {step.num < wizardStep ? <Check className="w-5 h-5" /> : step.num}
                                        </div>
                                        <span className={`text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${
                                            step.num === wizardStep ? 'text-[#1E3A8A]' : step.num < wizardStep ? 'text-[#10B981]' : 'text-[#94A3B8]'
                                        }`}>{step.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* STEP 1: ADAY SEÇİMİ */}
                        {wizardStep === 1 && (
                            <div className="p-6 overflow-y-auto custom-scrollbar" style={{ maxHeight: 440 }}>
                                <p className="text-[10px] font-black text-[#64748B] uppercase tracking-widest mb-4">Görüşeceğiniz adayı seçin</p>
                                {enrichedCandidates.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 text-[#94A3B8]">
                                        <User className="w-8 h-8 mb-2 opacity-30" />
                                        <p className="text-[12px] font-medium">Sistemde henüz aday bulunmuyor.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                        {enrichedCandidates.map(c => (
                                            <button
                                                key={c.id}
                                                onClick={() => setSelectedCandidate(c)}
                                                className={`flex items-center gap-3.5 p-4 rounded-2xl border-2 transition-all text-left w-full ${
                                                    selectedCandidate?.id === c.id
                                                        ? 'border-[#1E3A8A] bg-blue-50/50 shadow-md shadow-blue-900/5'
                                                        : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1] hover:bg-slate-50'
                                                }`}
                                            >
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0 ${
                                                    selectedCandidate?.id === c.id ? 'bg-[#1E3A8A] text-white' : 'bg-[#F1F5F9] text-[#475569]'
                                                }`}>
                                                    {c.name ? c.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : 'A'}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-[13px] font-black truncate ${selectedCandidate?.id === c.id ? 'text-[#1E3A8A]' : 'text-[#0F172A]'}`}>{c.name}</p>
                                                    <p className="text-[11px] text-[#64748B] font-medium mt-0.5 truncate">{c.position || c.bestTitle || '—'}</p>
                                                </div>
                                                <div className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black flex-shrink-0 ${selectedCandidate?.id === c.id ? 'bg-[#1E3A8A] text-white' : 'bg-[#F1F5F9] text-[#475569]'}`}>
                                                    %{Math.round(c.bestScore || 0)}
                                                </div>
                                                {selectedCandidate?.id === c.id && (
                                                    <div className="w-5 h-5 rounded-full bg-[#10B981] flex items-center justify-center flex-shrink-0">
                                                        <Check className="w-3 h-3 text-white" />
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* STEP 2: KATILIMCILAR */}
                        {wizardStep === 2 && (
                            <div className="p-6 overflow-y-auto custom-scrollbar" style={{ maxHeight: 440 }}>
                                <p className="text-[10px] font-black text-[#64748B] uppercase tracking-widest mb-1">Mülakate katılacak ekip üyelerini seçin</p>
                                <p className="text-[11px] text-[#94A3B8] mb-3">
                                    {manualDate && manualTime
                                        ? `${new Date(manualDate + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} · ${manualTime} için müsaitlik kontrol ediliyor`
                                        : 'Takvim uygunluğu bir sonraki adımda zaman seçiminin ardından gösterilecek'}
                                </p>
                                {/* Search input */}
                                <div className="relative mb-4">
                                    <input
                                        type="text"
                                        placeholder="İsim veya e-posta ile ara..."
                                        value={participantSearch}
                                        onChange={e => setParticipantSearch(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2.5 text-[12px] bg-white border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#1E3A8A] focus:ring-1 focus:ring-[#1E3A8A]/20 text-[#0F172A] placeholder:text-[#94A3B8]"
                                    />
                                    <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                                </div>
                                {isLoadingAvailability ? (
                                    <div className="flex items-center justify-center py-12 gap-2 text-[#94A3B8]">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span className="text-[11px] font-medium">Takvimler kontrol ediliyor...</span>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                        {systemUsers.filter(u => {
                                            if (u.role === 'candidate') return false;
                                            if (!participantSearch.trim()) return true;
                                            const q = participantSearch.toLowerCase();
                                            return (u.name || u.displayName || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
                                        }).map(u => {
                                            const isSelected = selectedParticipants.some(p => p.id === u.id);
                                            const availability = participantAvailability[u.id];
                                            const initials = (u.name || u.displayName || u.email || '?').substring(0, 2).toUpperCase();
                                            return (
                                                <button
                                                    key={u.id}
                                                    onClick={() => toggleParticipant(u)}
                                                    className={`flex items-center gap-3.5 p-4 rounded-2xl border-2 transition-all text-left w-full ${
                                                        isSelected
                                                            ? 'border-[#1E3A8A] bg-blue-50/50 shadow-md shadow-blue-900/5'
                                                            : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1] hover:bg-slate-50'
                                                    }`}
                                                >
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0 ${
                                                        isSelected ? 'bg-[#1E3A8A] text-white' : 'bg-[#F1F5F9] text-[#475569]'
                                                    }`}>
                                                        {initials}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-[13px] font-black truncate ${isSelected ? 'text-[#1E3A8A]' : 'text-[#0F172A]'}`}>
                                                            {u.name || u.displayName || u.email || 'Kullanıcı'}
                                                        </p>
                                                        <p className="text-[11px] text-[#64748B] font-medium truncate capitalize">
                                                            {(u.role || '').replace('_', ' ')}
                                                        </p>
                                                    </div>
                                                    {manualDate && manualTime && (
                                                        <div className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest flex-shrink-0 ${
                                                            availability === 'available' ? 'bg-emerald-100 text-emerald-700' :
                                                            availability === 'busy' ? 'bg-red-100 text-red-600' :
                                                            'bg-slate-100 text-slate-500'
                                                        }`}>
                                                            {availability === 'available' ? 'MÜSAİT' : availability === 'busy' ? 'MEŞGUL' : 'BİLGİSİZ'}
                                                        </div>
                                                    )}
                                                    {isSelected && (
                                                        <div className="w-5 h-5 rounded-full bg-[#10B981] flex items-center justify-center flex-shrink-0">
                                                            <Check className="w-3 h-3 text-white" />
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                        {systemUsers.filter(u => u.role !== 'candidate').length === 0 && (
                                            <div className="col-span-2 flex flex-col items-center justify-center py-16 text-[#94A3B8]">
                                                <User className="w-8 h-8 mb-2 opacity-30" />
                                                <p className="text-[12px] font-medium">Sistemde kullanıcı bulunamadı.</p>
                                            </div>
                                        )}
                                        {systemUsers.filter(u => u.role !== 'candidate').length > 0 &&
                                         participantSearch.trim() &&
                                         systemUsers.filter(u => u.role !== 'candidate' && (
                                             (u.name || u.displayName || '').toLowerCase().includes(participantSearch.toLowerCase()) ||
                                             (u.email || '').toLowerCase().includes(participantSearch.toLowerCase())
                                         )).length === 0 && (
                                            <div className="col-span-2 flex flex-col items-center justify-center py-12 text-[#94A3B8]">
                                                <p className="text-[12px] font-medium">"{participantSearch}" için sonuç bulunamadı</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {selectedParticipants.length > 0 && (
                                    <div className="mt-4 p-3.5 bg-blue-50 border border-blue-100 rounded-2xl">
                                        <p className="text-[10px] font-black text-[#1E3A8A] uppercase tracking-widest mb-2">
                                            Seçili Katılımcılar ({selectedParticipants.length})
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedParticipants.map(p => (
                                                <span key={p.id} className="flex items-center gap-1.5 bg-white border border-blue-200 px-3 py-1.5 rounded-full text-[11px] font-semibold text-[#1E3A8A]">
                                                    {p.name || p.email}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); toggleParticipant(p); }}
                                                        className="text-[#94A3B8] hover:text-red-500 transition-colors leading-none"
                                                    >×</button>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* STEP 3: ZAMAN BELİRLE */}
                        {wizardStep === 3 && (() => {
                            const today = new Date();
                            const calYear = today.getFullYear();
                            const calMonth = today.getMonth();
                            const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
                            const firstDow = (new Date(calYear, calMonth, 1).getDay() + 6) % 7;
                            const todayStr = today.toISOString().split('T')[0];
                            const monthLabel = today.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
                            const compactSlots = ['09:00','09:30','10:00','10:30','11:00','11:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30'];
                            const isSlotBusy = (slotTime) => {
                                if (!manualDate) return false;
                                if (checkLocalConflict(manualDate, slotTime)) return true;
                                const slotStart = new Date(`${manualDate}T${slotTime}:00`);
                                const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
                                return dayCalendarBusy.some(ev => slotStart < ev.end && slotEnd > ev.start);
                            };
                            return (
                                <div className="flex overflow-hidden" style={{ minHeight: 420 }}>
                                    {/* Calendar panel */}
                                    <div className="w-1/2 p-6 border-r border-[#F1F5F9] overflow-y-auto custom-scrollbar">
                                        <div className="flex items-center gap-2 mb-4">
                                            <CalendarDays className="w-3.5 h-3.5 text-[#1E3A8A]" />
                                            <p className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">{monthLabel}</p>
                                            {isCheckingDay && <Loader2 className="w-3 h-3 animate-spin text-slate-400 ml-auto" />}
                                        </div>
                                        <div className="grid grid-cols-7 gap-y-1 gap-x-0.5 text-center">
                                            {['Pt','Sl','Çr','Pr','Cm','Ct','Pz'].map(d => (
                                                <div key={d} className="text-[8px] font-black text-[#94A3B8] uppercase tracking-wider py-1">{d}</div>
                                            ))}
                                            {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
                                            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                                                const dateStr = `${calYear}-${String(calMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                                                const isPast = dateStr < todayStr;
                                                const isSelected = manualDate === dateStr;
                                                return (
                                                    <div key={day} className="flex justify-center">
                                                        <button
                                                            disabled={isPast}
                                                            onClick={() => !isPast && setManualDate(dateStr)}
                                                            className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
                                                                isPast ? 'text-[#CBD5E1] cursor-not-allowed' :
                                                                isSelected ? 'bg-[#1E3A8A] text-white shadow-md font-black' :
                                                                'text-[#334155] hover:bg-[#F1F5F9]'
                                                            }`}
                                                        >
                                                            {day}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Interview type selector */}
                                        <div className="mt-6">
                                            <p className="text-[10px] font-black text-[#64748B] uppercase tracking-widest mb-2.5">Mülakat Tipi</p>
                                            <div className="grid grid-cols-3 gap-1.5">
                                                {[
                                                    { id: 'technical', label: 'TEKNİK', Icon: Settings },
                                                    { id: 'hr', label: 'İK FİLTRE', Icon: User },
                                                    { id: 'product', label: 'PRODUCT', Icon: Package }
                                                ].map(({ id, label, Icon }) => (
                                                    <button
                                                        key={id}
                                                        onClick={() => setInterviewType(id)}
                                                        className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1 transition-all border ${
                                                            interviewType === id
                                                                ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] shadow-md'
                                                                : 'bg-white text-[#64748B] border-[#E2E8F0] hover:bg-slate-50'
                                                        }`}
                                                    >
                                                        <Icon className="w-3 h-3" /> {label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Time slots panel */}
                                    <div className="w-1/2 p-6 bg-[#F8FAFC]/50 overflow-y-auto custom-scrollbar">
                                        <p className="text-[11px] font-black text-[#0F172A]">
                                            {manualDate
                                                ? new Date(manualDate + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
                                                : 'Önce tarih seçin'}
                                        </p>
                                        <p className="text-[9px] text-[#94A3B8] font-medium mb-4 mt-0.5">GMT+3 — İstanbul</p>

                                        {conflictWarning && (
                                            <div className="mb-3 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                                                <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                                                <p className="text-[10px] text-red-600 font-semibold leading-relaxed">{conflictWarning.message}</p>
                                            </div>
                                        )}

                                        {!manualDate ? (
                                            <div className="flex flex-col items-center justify-center h-40 text-[#CBD5E1]">
                                                <Clock className="w-7 h-7 mb-2 opacity-40" />
                                                <p className="text-[11px] font-medium">Soldan tarih seçin</p>
                                            </div>
                                        ) : isCheckingDay ? (
                                            <div className="flex items-center justify-center h-40 gap-2 text-[#94A3B8]">
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                <span className="text-[11px] font-medium">Takvim kontrol ediliyor...</span>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-2">
                                                {compactSlots.map((slotTime, i) => {
                                                    const isSelected = manualTime === slotTime;
                                                    const isBusy = isSlotBusy(slotTime);
                                                    return (
                                                        <button
                                                            key={i}
                                                            disabled={isBusy}
                                                            onClick={() => !isBusy && setManualTime(slotTime)}
                                                            className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${
                                                                isSelected
                                                                    ? 'border-[#1E3A8A] bg-blue-50 ring-1 ring-[#1E3A8A]/20 shadow-md shadow-blue-900/5'
                                                                    : isBusy
                                                                    ? 'border-[#F1F5F9] bg-white cursor-not-allowed'
                                                                    : 'border-[#E2E8F0] bg-white hover:border-[#1E3A8A]/30 hover:bg-blue-50/30'
                                                            }`}
                                                        >
                                                            <span className={`text-[13px] font-black tracking-tight ${isBusy ? 'text-[#CBD5E1]' : isSelected ? 'text-[#1E3A8A]' : 'text-[#0F172A]'}`}>{slotTime}</span>
                                                            {isSelected ? (
                                                                <span className="text-[8px] font-black px-1.5 py-0.5 bg-[#1E3A8A] text-white rounded-md flex items-center gap-0.5">
                                                                    <CheckCircle2 className="w-2.5 h-2.5" /> SEÇİLİ
                                                                </span>
                                                            ) : isBusy ? (
                                                                <span className="text-[8px] font-black px-1.5 py-0.5 bg-rose-50 text-rose-400 rounded-md flex items-center gap-0.5">
                                                                    <AlertCircle className="w-2.5 h-2.5" /> DOLU
                                                                </span>
                                                            ) : (
                                                                <span className="text-[8px] font-medium px-1.5 py-0.5 bg-[#F1F5F9] text-[#94A3B8] rounded-md">UYGUN</span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {isGoogleConnected && (
                                            <button
                                                onClick={handleAutoPlan}
                                                disabled={isAnalyzingSlots}
                                                className="mt-4 w-full py-2 rounded-xl border border-emerald-100 bg-emerald-50/60 text-[10px] font-black uppercase tracking-widest text-emerald-700 flex items-center justify-center gap-1.5 hover:bg-emerald-100 transition-all"
                                            >
                                                {isAnalyzingSlots ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                                AI Slot Öner
                                            </button>
                                        )}
                                        {suggestedSlots.length > 0 && (
                                            <div className="mt-3 space-y-1.5">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">AI Önerileri:</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {suggestedSlots.map((slot, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={() => { setManualDate(slot.date); setManualTime(slot.time); }}
                                                            className="px-3 py-1.5 bg-white border border-emerald-200 rounded-lg text-[10px] font-black text-emerald-700 hover:bg-emerald-50 transition-all"
                                                        >
                                                            {new Date(slot.date + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} {slot.time}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Participant availability for chosen time */}
                                        {selectedParticipants.length > 0 && manualDate && manualTime && (
                                            <div className="mt-4 border-t border-[#F1F5F9] pt-4">
                                                <p className="text-[9px] font-black text-[#64748B] uppercase tracking-widest mb-2.5">Katılımcı Uygunluğu</p>
                                                {isLoadingAvailability ? (
                                                    <div className="flex items-center gap-2 text-[#94A3B8]">
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        <span className="text-[10px]">Kontrol ediliyor...</span>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-1.5">
                                                        {selectedParticipants.map(p => {
                                                            const avail = participantAvailability[p.id];
                                                            return (
                                                                <div key={p.id} className="flex items-center justify-between bg-white border border-[#F1F5F9] rounded-xl px-3 py-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-6 h-6 rounded-full bg-[#1E3A8A]/10 text-[#1E3A8A] flex items-center justify-center text-[9px] font-black">
                                                                            {(p.name || p.displayName || p.email || '?').charAt(0).toUpperCase()}
                                                                        </div>
                                                                        <span className="text-[11px] font-semibold text-[#0F172A]">{p.name || p.displayName || p.email}</span>
                                                                    </div>
                                                                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${
                                                                        avail === 'available' ? 'bg-emerald-100 text-emerald-700' :
                                                                        avail === 'busy' ? 'bg-red-100 text-red-600' :
                                                                        'bg-slate-100 text-slate-500'
                                                                    }`}>
                                                                        {avail === 'available' ? 'MÜSAİT' : avail === 'busy' ? 'MEŞGUL' : 'BİLGİSİZ'}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {selectedParticipants.length > 0 && (!manualDate || !manualTime) && (
                                            <div className="mt-4 border-t border-[#F1F5F9] pt-4">
                                                <p className="text-[9px] font-black text-[#94A3B8] uppercase tracking-widest">{selectedParticipants.length} katılımcı seçildi — tarih/saat seçince uygunluk görünür</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* STEP 4: ONAYLA & GÖNDER */}
                        {wizardStep === 4 && (
                            <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar" style={{ minHeight: 360 }}>
                                <p className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">Mülakat detaylarını kontrol edin</p>
                                <div className="grid grid-cols-2 gap-3">
                                    {/* Candidate card */}
                                    <div className="bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] p-4 space-y-2.5">
                                        <p className="text-[9px] font-black text-[#64748B] uppercase tracking-widest">Aday</p>
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-[#1E3A8A] text-white flex items-center justify-center text-[10px] font-black flex-shrink-0">
                                                {selectedCandidate?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[13px] font-black text-[#0F172A] truncate">{selectedCandidate?.name}</p>
                                                <p className="text-[11px] text-[#64748B] truncate">{selectedCandidate?.position || selectedCandidate?.bestTitle}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center">
                                                <Check className="w-2.5 h-2.5 text-emerald-600" />
                                            </div>
                                            <span className="text-[10px] font-bold text-[#64748B] truncate">{selectedCandidate?.email || '—'}</span>
                                        </div>
                                    </div>
                                    {/* Interview detail card */}
                                    <div className="bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] p-4 space-y-2.5">
                                        <p className="text-[9px] font-black text-[#64748B] uppercase tracking-widest">Mülakat Detayı</p>
                                        <div className="flex items-center gap-2">
                                            <CalendarDays className="w-3.5 h-3.5 text-[#1E3A8A]" />
                                            <span className="text-[13px] font-black text-[#0F172A]">
                                                {manualDate
                                                    ? new Date(manualDate + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
                                                    : 'Tarih belirlenmedi'} · {manualTime}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <User className="w-3.5 h-3.5 text-[#64748B]" />
                                            <span className="text-[11px] text-[#64748B] font-medium">
                                                {selectedInterviewer?.displayName || currentUser?.displayName || 'Değerlendirici'}
                                            </span>
                                        </div>
                                        <div className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                                            interviewType === 'technical' ? 'bg-blue-50 text-blue-600' :
                                            interviewType === 'hr' ? 'bg-amber-50 text-amber-600' :
                                            'bg-purple-50 text-purple-600'
                                        }`}>
                                            {interviewType === 'technical' ? 'TEKNİK MÜLAKAT' : interviewType === 'hr' ? 'İK FİLTRE' : 'PRODUCT MÜLAKATI'}
                                        </div>
                                    </div>
                                </div>

                                {/* Participants section in confirmation */}
                                {selectedParticipants.length > 0 && (
                                    <div className="bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] p-4 space-y-2.5">
                                        <p className="text-[9px] font-black text-[#64748B] uppercase tracking-widest">Katılımcılar ({selectedParticipants.length})</p>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedParticipants.map(p => (
                                                <div key={p.id} className="flex items-center gap-2 bg-white border border-[#E2E8F0] px-3 py-1.5 rounded-full">
                                                    <div className="w-5 h-5 rounded-full bg-[#1E3A8A]/10 text-[#1E3A8A] flex items-center justify-center text-[9px] font-black">
                                                        {(p.name || p.displayName || p.email || '?').charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="text-[11px] font-semibold text-[#0F172A]">{p.name || p.displayName || p.email}</span>
                                                    <span className="text-[9px] text-[#94A3B8] capitalize">{(p.role || '').replace('_', ' ')}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-[9px] text-[#94A3B8]">Google Takvim daveti ve bildirim e-postası gönderilecek.</p>
                                    </div>
                                )}

                                {/* AI Score section */}
                                {selectedCandidate && (
                                    <div className="bg-[#EBF4FF] rounded-2xl border border-[#D1E9FF] p-4 flex items-center gap-5">
                                        <div className="relative w-16 h-16 flex-shrink-0">
                                            <svg className="w-full h-full -rotate-90">
                                                <circle cx="32" cy="32" r="28" stroke="white" strokeWidth="6" fill="transparent" opacity="0.5" />
                                                <circle cx="32" cy="32" r="28" stroke="#10B981" strokeWidth="6" fill="transparent"
                                                    strokeDasharray="176"
                                                    strokeDashoffset={176 - (176 * (selectedCandidate.bestScore || 0) / 100)}
                                                    strokeLinecap="round" className="transition-all duration-1000" />
                                            </svg>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="text-sm font-black text-[#0F172A] tabular-nums">%{Math.round(selectedCandidate.bestScore || 0)}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-[#1E3A8A] uppercase tracking-widest mb-0.5">AI Aday Analizi</p>
                                            <p className="text-[11px] text-[#475569] font-medium leading-relaxed italic">
                                                "{selectedCandidate.bestTitle || 'İlgili alan'} deneyimiyle %{Math.round(selectedCandidate.bestScore || 0)} uyum puanı güçlü bir potansiyel sergiliyor."
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Join link preview */}
                                <div className="bg-[#F0FFF4] border border-[#C6F6D5] rounded-2xl px-4 py-3 flex items-center justify-between">
                                    <div>
                                        <p className="text-[9px] font-black text-[#22543D] uppercase tracking-[0.2em] mb-0.5">Aday Katılım Linki</p>
                                        <span className="text-[11px] font-mono text-[#2F855A] font-black">{window.location.origin}/join/iv-{selectedCandidate?.id?.substring(0,6)}…</span>
                                    </div>
                                    <button
                                        onClick={() => selectedCandidate && navigator.clipboard.writeText(`${window.location.origin}/join/iv-${selectedCandidate.id}-preview`)}
                                        className="p-2 text-[#2F855A] hover:bg-white rounded-xl transition-all border border-transparent hover:border-[#C6F6D5]"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* WIZARD FOOTER NAVIGATION */}
                        <div className="px-6 py-4 border-t border-[#F1F5F9] bg-slate-50/40 flex items-center justify-between">
                            <button
                                onClick={() => wizardStep > 1 && setWizardStep(s => s - 1)}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                                    wizardStep > 1
                                        ? 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] border border-[#E2E8F0]'
                                        : 'text-[#CBD5E1] cursor-not-allowed border border-transparent'
                                }`}
                            >
                                <ChevronLeft className="w-3.5 h-3.5" />
                                {wizardStep === 2 ? 'Aday Seçimi' : wizardStep === 3 ? 'Katılımcılar' : wizardStep === 4 ? 'Zaman Belirle' : 'Geri'}
                            </button>

                            {/* Center summary chip */}
                            <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] px-3.5 py-1.5 rounded-full shadow-sm text-[11px]">
                                <div className="w-5 h-5 rounded-full bg-[#1E3A8A]/10 text-[#1E3A8A] flex items-center justify-center">
                                    <User className="w-3 h-3" />
                                </div>
                                <span className="font-black text-[#0F172A]">{selectedCandidate?.name || '—'}</span>
                                {wizardStep >= 2 && manualDate && (
                                    <>
                                        <span className="text-[#CBD5E1]">•</span>
                                        <span className="font-bold text-[#1E3A8A]">
                                            {new Date(manualDate + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} · {manualTime}
                                        </span>
                                    </>
                                )}
                            </div>

                            {/* Right action */}
                            {wizardStep < 4 ? (
                                <button
                                    onClick={() => { if (wizardStep === 1 && !selectedCandidate) return; setWizardStep(s => s + 1); }}
                                    disabled={wizardStep === 1 && !selectedCandidate}
                                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-[#1E3A8A] hover:bg-blue-800 text-white shadow-lg shadow-blue-900/15 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {wizardStep === 1 ? 'Katılımcılar' : wizardStep === 2 ? 'Zaman Belirle' : 'Onayla & Gönder'}
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={openEmailPreview}
                                        disabled={!selectedCandidate}
                                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-white border-2 border-blue-100 text-[#1E3A8A] hover:bg-blue-50 transition-all disabled:opacity-40"
                                    >
                                        <Mail className="w-3.5 h-3.5" /> E-Posta
                                    </button>
                                    {manualDate && manualTime ? (
                                        <button
                                            onClick={() => {
                                                if (conflictWarning) {
                                                    if (window.confirm(`⚠️ Çakışma: ${conflictWarning.message}\n\nYine de planlamak istiyor musunuz?`)) {
                                                        createInterviewRecord({ date: manualDate, time: manualTime }, false);
                                                    }
                                                } else {
                                                    createInterviewRecord({ date: manualDate, time: manualTime }, false);
                                                }
                                            }}
                                            disabled={!selectedCandidate}
                                            className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest text-white shadow-lg transition-all active:scale-95 disabled:opacity-40 ${
                                                conflictWarning
                                                    ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/15'
                                                    : 'bg-[#10B981] hover:bg-emerald-600 shadow-emerald-500/15'
                                            }`}
                                        >
                                            {conflictWarning ? <AlertTriangle className="w-3.5 h-3.5" /> : <Calendar className="w-3.5 h-3.5" />}
                                            {conflictWarning ? 'Yine de Planla' : 'Mülakatı Planla'}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => createInterviewRecord(null, true)}
                                            disabled={!selectedCandidate}
                                            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-[#1E3A8A] hover:bg-blue-800 text-white shadow-lg shadow-blue-900/15 transition-all active:scale-95 disabled:opacity-40"
                                        >
                                            <Play className="w-3.5 h-3.5 fill-current" /> Şimdi Başlat
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ CALENDAR-FIRST DASHBOARD ════════════════════════════════════ */}
            {!isPlanningMode && (
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Top bar */}
                    <div className="px-8 py-5 flex items-center justify-between border-b border-[#E2E8F0]/60 bg-white/70 backdrop-blur-sm flex-shrink-0">
                        <div>
                            <h1 className="text-xl font-semibold text-[#0F172A] tracking-tight">Mülakat Yönetimi</h1>
                            <p className="text-xs text-[#64748B] mt-0.5 font-medium">Aktif operasyonları ve geçmiş seansları yönetin</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="Aday veya pozisyon ara..."
                                    className="pl-9 pr-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] focus:border-transparent w-64 shadow-sm transition-all"
                                />
                            </div>
                            <button
                                onClick={() => { setWizardStep(1); setSelectedCandidate(null); setManualDate(''); setManualTime('09:00'); setIsPlanningMode(true); }}
                                className="flex items-center gap-2 bg-[#1E3A8A] text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 transition-all shadow-md shadow-blue-900/10"
                            >
                                <Plus className="w-4 h-4" /> Yeni Seans Planla
                            </button>
                        </div>
                    </div>

                    {/* Two-column layout */}
                    <div className="flex-1 flex overflow-hidden">

                        {/* LEFT: Stats + Calendar ─────────────────────────────── */}
                        <div className="w-[55%] border-r border-[#E2E8F0]/60 flex flex-col bg-white">

                            {/* Stats row */}
                            <div className="px-8 py-6 grid grid-cols-4 gap-4 border-b border-[#E2E8F0]/40 flex-shrink-0">
                                {[
                                    { label: 'CANLI YAYIN', value: stats.live, color: 'text-rose-600' },
                                    { label: 'BUGÜN', value: stats.today, color: 'text-[#0F172A]' },
                                    { label: 'BEKLEYEN', value: stats.pending, color: 'text-amber-500' },
                                    { label: 'TOPLAM', value: stats.total, color: 'text-[#64748B]' },
                                ].map((stat, i) => (
                                    <div key={i} className="flex flex-col gap-1">
                                        <span className="text-[10px] font-black text-[#94A3B8] uppercase tracking-widest">{stat.label}</span>
                                        <span className={`text-2xl font-semibold tracking-tight ${stat.color}`}>{stat.value}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Calendar */}
                            <div className="flex-1 overflow-y-auto p-8">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-lg font-semibold tracking-tight text-[#0F172A]">
                                        {new Date(calYear, calMonth).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
                                    </h2>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => navigateCal(-1)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-[#64748B] transition-colors">
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => navigateCal(1)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-[#64748B] transition-colors">
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-7 gap-y-4 gap-x-1 text-center">
                                    {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(d => (
                                        <div key={d} className="text-[10px] font-black text-[#94A3B8] uppercase tracking-wider pb-2">{d}</div>
                                    ))}
                                    {Array.from({ length: calFirstDow }).map((_, i) => <div key={`e${i}`} />)}
                                    {Array.from({ length: calDaysInMonth }).map((_, i) => {
                                        const day = i + 1;
                                        const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                        const isSelected = selectedCalDate === dateStr;
                                        const isToday = dateStr === todayStr;
                                        const isPastDay = dateStr < todayStr;
                                        const hasEvents = allCalSessions.some(s => (s.date || '').split('T')[0] === dateStr);
                                        return (
                                            <div key={day} className="flex justify-center">
                                                <button
                                                    onClick={() => setSelectedCalDate(dateStr)}
                                                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all relative ${
                                                        isSelected
                                                            ? 'bg-[#1E3A8A] text-white shadow-md'
                                                            : isToday
                                                                ? 'text-[#1E3A8A] font-semibold bg-blue-50/50 hover:bg-blue-100/50'
                                                                : isPastDay
                                                                    ? 'text-[#CBD5E1] hover:bg-slate-50'
                                                                    : 'text-[#334155] hover:bg-slate-100'
                                                    }`}
                                                >
                                                    {day}
                                                    {hasEvents && !isSelected && (
                                                        <span className="absolute bottom-1 w-1 h-1 rounded-full bg-[#1E3A8A]" />
                                                    )}
                                                    {isToday && !isSelected && (
                                                        <span className="absolute bottom-0 w-4 h-[2px] rounded-full bg-[#1E3A8A]" />
                                                    )}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* RIGHT: Day Sessions + Quick Plan ───────────────────── */}
                        <div className="w-[45%] flex flex-col bg-[#FAFAF8]">
                            <div className="px-8 py-6 flex-1 overflow-y-auto custom-scrollbar">
                                <div className="mb-4">
                                    <p className="text-[10px] font-black text-[#94A3B8] uppercase tracking-widest mb-1">Seçili Gün</p>
                                    <div className="text-xl font-semibold text-[#0F172A] flex items-center gap-3">
                                        {selectedCalDate
                                            ? new Date(selectedCalDate + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
                                            : 'Yaklaşan Mülakatlar'}
                                        {selectedCalDate === todayStr && (
                                            <span className="text-[10px] font-black bg-blue-100 text-[#1E3A8A] px-2 py-0.5 rounded-full uppercase tracking-wider">Bugün</span>
                                        )}
                                    </div>
                                </div>

                                {/* Tab filter: Tüm / Benim Mülakatlarım */}
                                <div className="flex gap-1 mb-5 bg-[#F1F5F9] rounded-xl p-1">
                                    {!isDepartmentUser && (
                                        <button
                                            onClick={() => setShowMyInterviews(false)}
                                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                                !showMyInterviews ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[#94A3B8]'
                                            }`}
                                        >
                                            Tüm Mülakatlar
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setShowMyInterviews(true)}
                                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                            showMyInterviews || isDepartmentUser ? 'bg-white text-[#1E3A8A] shadow-sm' : 'text-[#94A3B8]'
                                        }`}
                                    >
                                        Benim Mülakatlarım
                                    </button>
                                </div>

                                {(() => {
                                    const myUid = currentUser?.uid;
                                    // Cross-department participant invites for the selected date
                                    const crossDeptSessions = myParticipantSessions.filter(s =>
                                        (s.date || '').split('T')[0] === selectedCalDate
                                    );
                                    const filteredSessions = (showMyInterviews || isDepartmentUser)
                                        ? (() => {
                                            // Sessions from own-department candidates where user is interviewer or participant
                                            const ownDeptFiltered = dayCalSessions.filter(s =>
                                                s.interviewerId === myUid ||
                                                (Array.isArray(s.participants) && s.participants.some(p => p.userId === myUid))
                                            );
                                            // Merge cross-department invites, avoid duplicates by sessionId
                                            const seenIds = new Set(ownDeptFiltered.map(s => s.id || s.sessionId));
                                            const extras = crossDeptSessions.filter(s => !seenIds.has(s.sessionId));
                                            return [...ownDeptFiltered, ...extras];
                                        })()
                                        : dayCalSessions;
                                    return filteredSessions.length > 0 ? (
                                    <div className="space-y-4">
                                        {filteredSessions.map(s => {
                                            const statusInfo = getCalStatusConfig(s.status);
                                            const initials = (s.candidateName || '?').split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase();
                                            const participants = Array.isArray(s.participants) ? s.participants : [];
                                            return (
                                                <div key={s.id} className="flex group">
                                                    <div className="w-16 pt-3 flex-shrink-0">
                                                        <span className="text-sm font-semibold text-[#64748B] group-hover:text-[#1E3A8A] transition-colors">{s.time || '—'}</span>
                                                    </div>
                                                    <div className="flex-1 bg-white rounded-xl border border-[#E2E8F0] p-4 shadow-sm hover:shadow-md hover:border-[#CBD5E1] transition-all relative overflow-hidden">
                                                        {s.status === 'live' && <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />}
                                                        <div className="flex justify-between items-start mb-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${s.status === 'live' ? 'bg-emerald-100 text-emerald-700' : 'bg-[#F1F5F9] text-[#475569]'}`}>
                                                                    {initials}
                                                                </div>
                                                                <div>
                                                                    <h4 className="text-sm font-semibold text-[#0F172A]">{s.candidateName}</h4>
                                                                    <p className="text-xs text-[#64748B]">{s.position || s.title || '—'}</p>
                                                                </div>
                                                            </div>
                                                            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide ${statusInfo.bg} ${statusInfo.text}`}>
                                                                {statusInfo.icon} {statusInfo.label}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#F1F5F9]">
                                                            <div className="flex items-center gap-4 text-xs text-[#64748B]">
                                                                <div className="flex items-center gap-1.5">
                                                                    <User className="w-3.5 h-3.5" />
                                                                    <span>{s.interviewerName || s.interviewer || '—'}</span>
                                                                </div>
                                                                {participants.length > 0 && (
                                                                    <div className="flex items-center gap-1">
                                                                        {participants.slice(0, 3).map((p, idx) => (
                                                                            <div key={idx} title={p.name || p.displayName || p.email} className="w-5 h-5 rounded-full bg-[#1E3A8A]/10 text-[#1E3A8A] flex items-center justify-center text-[8px] font-black border border-white">
                                                                                {(p.name || p.displayName || p.email || '?').charAt(0).toUpperCase()}
                                                                            </div>
                                                                        ))}
                                                                        {participants.length > 3 && (
                                                                            <span className="text-[9px] text-[#94A3B8] font-bold">+{participants.length - 3}</span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                                {s.matchScore && (
                                                                    <div className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-semibold text-slate-600">%{s.matchScore} UYUM</div>
                                                                )}
                                                            </div>
                                                            {s.status === 'live' ? (
                                                                <button
                                                                    onClick={() => navigate(`/interviews/${s.id}`)}
                                                                    className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors"
                                                                >
                                                                    <Video className="w-3.5 h-3.5" /> Katıl
                                                                </button>
                                                            ) : (
                                                                <button className="w-6 h-6 flex items-center justify-center text-[#94A3B8] hover:bg-slate-100 hover:text-[#0F172A] rounded-md transition-colors">
                                                                    <MoreVertical className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="bg-white rounded-xl border border-dashed border-[#E2E8F0] p-10 flex flex-col items-center justify-center text-center">
                                        <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                            <Calendar className="w-5 h-5 text-[#94A3B8]" />
                                        </div>
                                        <h4 className="text-sm font-semibold text-[#0F172A] mb-1">Bu gün için planlanmış mülakat yok</h4>
                                        <p className="text-xs text-[#64748B] max-w-[200px] mb-6">Yeni bir mülakat planlayarak süreci başlatabilirsiniz.</p>
                                        <button
                                            onClick={openWizardWithDate}
                                            className="text-sm font-semibold text-[#1E3A8A] hover:underline flex items-center gap-1.5"
                                        >
                                            <Plus className="w-4 h-4" /> Yeni Planla
                                        </button>
                                    </div>
                                );
                                })()}
                            </div>

                            {/* Hızlı Planlama */}
                            <div className="bg-white border-t border-[#E2E8F0] p-5 mx-4 mb-4 rounded-2xl shadow-sm flex-shrink-0">
                                <h4 className="text-xs font-black text-[#0F172A] uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <Plus className="w-3.5 h-3.5 text-[#1E3A8A]" /> Hızlı Planlama
                                </h4>
                                <button
                                    onClick={openWizardWithDate}
                                    className="w-full bg-[#1E3A8A] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    {selectedCalDate
                                        ? new Date(selectedCalDate + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) + ' için Planla'
                                        : 'Yeni Seans Planla'}
                                </button>
                                <p className="text-xs text-[#94A3B8] text-center mt-2">Tam sihirbaz 4 adımda planlamanıza yardımcı olur</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
