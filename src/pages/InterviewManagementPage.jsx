// src/pages/InterviewManagementPage.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { collection, onSnapshot, doc, getDoc, setDoc, deleteDoc, serverTimestamp, query, where, addDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getCalendarEvents, connectGoogleWorkspace, sendDirectEmail, createDirectCalendarEvent, ensureValidGoogleToken } from '../services/integrationService';
import { getInviteEmail, getParticipantEmail, getRescheduleEmail } from '../utils/templateService';
import { buildICS } from '../utils/emailTemplates';
import AddManualInterviewModal from '../components/AddManualInterviewModal';
import { downloadInterviewIcs } from '../utils/interviewIcs';
import { isSessionPast } from '../utils/interviewSession';
import InterviewCalendarView from '../components/InterviewCalendarView';
import { eventMinutes } from '../utils/calendarMatch';
import SalaryBackfillModal from '../components/SalaryBackfillModal';
import SalaryBandModal from '../components/SalaryBandModal';
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
    CheckCircle,
    X,
    UserPlus,
    AtSign,
    Briefcase,
    Wallet,
    ClipboardCheck,
    CalendarPlus,
    List,
} from 'lucide-react';

const PARTICIPANT_INVITES_PATH = 'artifacts/talent-flow/public/data/participantInvites';

/** Tabloda gösterilen görüşme türü etiketleri. */
const IV_TYPE_LABEL = {
    technical: 'Teknik',
    hr: 'İK',
    product: 'Ürün',
    culture: 'Kültür',
    behavioral: 'Davranışsal',
    phone: 'Telefon',
    face_to_face: 'Yüz yüze',
};

/**
 * Durum rozetinin metni ve renkleri — renkler prototipin `ivStatus`
 * tablosundan birebir.
 *
 * `isDone`, kaydın durumu 'completed' yazmasa bile skoru/özeti olduğunda
 * tamamlanmış sayılmasını sağlıyor; bu türetme dosyanın üstündeki aktif/geçmiş
 * ayrımıyla aynı kural.
 */
function ivStatusChip(status, isDone) {
    if (status === 'live') return { label: 'Canlı', bg: '#ECFDF5', fg: '#059669' };
    if (status === 'cancelled') return { label: 'İptal', bg: '#FEF2F2', fg: '#DC2626' };
    if (status === 'postponed') return { label: 'Ertelendi', bg: 'var(--color-warn-bg)', fg: 'var(--color-warn)' };
    if (isDone || status === 'completed') return { label: 'Tamamlandı', bg: '#F5F3FF', fg: '#7C3AED' };
    return { label: 'Bekliyor', bg: '#EFF6FF', fg: '#2563EB' };
}

function ivInitials(name = '') {
    const parts = String(name).trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toLocaleUpperCase('tr') || '?';
}

/** '17.08.2026' — tarih yoksa tire, uydurma bir gün değil. */
function ivDateLabel(raw) {
    const part = (raw || '').split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(part)) return '—';
    const [y, m, d] = part.split('-');
    return `${d}.${m}.${y}`;
}

export default function InterviewManagementPage() {
    const navigate = useNavigate();
    const { user: currentUser, userProfile, userId, isDepartmentUser, role } = useAuth();
    const { enrichedCandidates, updateCandidate, setViewCandidateId, preselectedInterviewData, setPreselectedInterviewData } = useCandidates();
    const { positions } = usePositions();
    const openPositions = useMemo(() => (positions || []).filter(p => p.status === 'open'), [positions]);
    const { addNotification } = useNotifications();
    
    // UI States
    const [isPlanningMode, setIsPlanningMode] = useState(false);
    const [wizardStep, setWizardStep] = useState(1); // 1 = aday seç, 2 = zaman belirle, 3 = onayla

    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [interviewType, setInterviewType] = useState('technical'); // technical, hr, product
    const [isAnalyzingSlots, setIsAnalyzingSlots] = useState(false);
    const [suggestedSlots, setSuggestedSlots] = useState([]);
    const [saveStatus, setSaveStatus] = useState('idle');
    const [systemUsers, setSystemUsers] = useState([]);
    const [selectedInterviewer, setSelectedInterviewer] = useState(null);
    const [openMenuId, setOpenMenuId] = useState(null);
    const [postponeModal, setPostponeModal] = useState(null); // { candidateId, sessionId, date, time }
    const [branding, setBranding] = useState({ companyName: 'Talent-Inn', primaryColor: '#13294E' });
    // Quick-start state (dashboard-level "Hızlı Mülakat Başlat")
    const [quickModal, setQuickModal]           = useState(false);
    const [quickSearch, setQuickSearch]         = useState('');
    const [quickCandidate, setQuickCandidate]   = useState(null);
    const [quickType, setQuickType]             = useState('technical');
    const [quickLoading, setQuickLoading]       = useState(false);
    const [faceToFaceLoading, setFaceToFaceLoading] = useState(false);
    const [quickPosition, setQuickPosition]     = useState(null);
    // Wizard position state
    const [wizardPosition, setWizardPosition]   = useState(null);
    const [externalEmail, setExternalEmail] = useState('');
    const [externalEmailError, setExternalEmailError] = useState('');

    // Participant selection states (wizard step 2)
    const [selectedParticipants, setSelectedParticipants] = useState([]);
    const [participantAvailability, setParticipantAvailability] = useState({});
    const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
    const [participantSearch, setParticipantSearch] = useState('');

    // "My Interviews" filter for department users in calendar view
    const [showMyInterviews, setShowMyInterviews] = useState(false);

    // Planlı bir görüşmenin sonucu giriliyorsa hangi oturum olduğu burada.
    // Görüşme sistem dışında yapıldığında (Zoom, Teams, yüz yüze) planlanan
    // kayıt sonsuza kadar "Bekliyor" kalıyordu; sonucu girmenin tek yolu
    // sıfırdan yeni bir kayıt açmaktı ve tek görüşme listede iki satır oluyordu.
    const [manualPrefill, setManualPrefill] = useState(null);

    // Manual interview entry modal — see components/AddManualInterviewModal.jsx
    const [manualInterviewOpen, setManualInterviewOpen] = useState(false);

    // Geçmiş görüşmelerde eksik kalan maaş beklentisi taraması.
    // `candidateSalary` alanı eski kayıtlar yazılırken yoktu; rakam
    // transkriptte duruyor ama hiçbir rapora girmiyor.
    // — see components/SalaryBackfillModal.jsx
    const [salaryBackfillOpen, setSalaryBackfillOpen] = useState(false);

    // Pozisyonun butce tavani. Beklenti taramasindan farkli bir is: bu ilanin
    // butcesini yazar, digeri adayin soyledigini bulur.
    const [salaryBandOpen, setSalaryBandOpen] = useState(false);

    // Single dropdown that consolidates the 4 separate action buttons
    // (Yeni Seans Planla / Hızlı Mülakat Başlat / Yüz Yüze / Manuel Görüşme Ekle).
    // Reduces visual competition in the page header — see design-critique.
    const [newInterviewMenuOpen, setNewInterviewMenuOpen] = useState(false);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => {
            setOpenMenuId(null);
            setNewInterviewMenuOpen(false);
        };
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
    const [emailJoinLink, setEmailJoinLink] = useState('');

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

    // Load branding settings for email templates
    useEffect(() => {
        getDoc(doc(db, 'artifacts/talent-flow/public/data/settings', 'branding'))
            .then(snap => { if (snap.exists()) setBranding(b => ({ ...b, ...snap.data() })); })
            .catch(() => {});
    }, []);

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

    const { activeInterviews, pastInterviews, cancelledInterviews, stats } = useMemo(() => {
        const active = [];
        const past = [];
        // İPTALLER ARTIK TOPLANIYOR. Eskiden bu döngüde atılıyorlardı ve
        // ekranda hiçbir yerde görünmüyorlardı; listedeki "İptal" sekmesi
        // onları geri getiriyor. Aktif/geçmiş kovaları değişmedi.
        const cancelled = [];

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
                        // Satır menüsündeki ertele/iptal/sil çağrıları adayın
                        // kimliğini istiyor; takvim listesindeki `_candidateId`
                        // ile aynı ad, iki kaynağın aynı satır bileşenini
                        // besleyebilmesi için.
                        _candidateId: c.id,
                        candidateName: c.name,
                        role: c.position || c.bestTitle || 'Pozisyon',
                        matchScore: c.bestScore || 0,
                        _effectiveCompleted: isCompleted,
                        _effectiveStatus: effectiveStatus, // authoritative status for badge
                    };

                    // Cancelled sessions are completely hidden — not in active, not in history.
                    if (isCancelled) { cancelled.push(sessionData); return; }

                    // Filtering logic: Live or Pending/Future goes to Active. Completed/Past goes to History.
                    if (isLive || (isFutureOrToday && !isCompleted)) {
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
            cancelledInterviews: cancelled.sort((a, b) => (b.date || '').localeCompare(a.date || '')),
            stats: {
                live: active.filter(i => i._effectiveStatus === 'live').length,
                today: active.filter(i => (i.date?.split('T')[0] === todayStr)).length,
                pending: active.filter(i => i._effectiveStatus !== 'live').length,
                total: active.length + past.length
            }
        };
    }, [enrichedCandidates, sessionStatuses]);

    // ── Liste görünümü (Ekran 4) ──────────────────────────────────────────────
    // Sekmeler prototipteki dört kova: Tümü / Yaklaşan / Tamamlanan / İptal.
    const [ivTab, setIvTab] = useState('all');
    // Liste mi takvim mi — süzgeçten ayrı bir karar.
    const [ivView, setIvView] = useState('list');
    const [ivSearch, setIvSearch] = useState('');
    const [ivPage, setIvPage] = useState(0);
    const IV_PAGE_SIZE = 12;

    /**
     * Tabloyu besleyen tek liste.
     *
     * Kaynak, aday belgesindeki `interviewSessions[]` — havuz ve Aday
     * Detayı'nın okuduğu liste. Buna departman dışı katılımcı davetleri
     * (`participantInvites`) ekleniyor: kullanıcı başka bir departmanın
     * adayına katılımcı olarak çağrıldığında mülakat kendi aday listesinde
     * görünmüyor, yalnızca davet kaydında duruyor.
     */
    const ivRowsAll = useMemo(() => {
        const myUid = currentUser?.uid;
        const base = ivTab === 'upcoming' ? activeInterviews
            : ivTab === 'done' ? pastInterviews
            : ivTab === 'cancelled' ? cancelledInterviews
            : [...activeInterviews, ...pastInterviews];

        // Departman dışı davetler yalnızca "Tümü" ve "Yaklaşan"da anlamlı:
        // davet kaydı tamamlanma/iptal bilgisini taşımıyor.
        const seen = new Set(base.map(s => s.id || s.sessionId));
        const extras = (ivTab === 'all' || ivTab === 'upcoming')
            ? myParticipantSessions.filter(s => !seen.has(s.sessionId))
            : [];

        let rows = [...base, ...extras];

        if (showMyInterviews || isDepartmentUser) {
            rows = rows.filter(s =>
                s._fromInvite ||
                s.interviewerId === myUid ||
                (Array.isArray(s.participants) && s.participants.some(p => p.userId === myUid))
            );
        }

        const q = ivSearch.trim().toLocaleLowerCase('tr');
        if (q) {
            rows = rows.filter(s =>
                (s.candidateName || '').toLocaleLowerCase('tr').includes(q) ||
                (s.role || s.positionTitle || s.position || '').toLocaleLowerCase('tr').includes(q)
            );
        }
        return rows;
    }, [ivTab, ivSearch, showMyInterviews, isDepartmentUser, currentUser?.uid,
        activeInterviews, pastInterviews, cancelledInterviews, myParticipantSessions]);

    // Sekme/arama değişince sayfa başa döner — yoksa boş bir sayfada kalınır.
    useEffect(() => { setIvPage(0); }, [ivTab, ivSearch, showMyInterviews]);

    const ivPageCount = Math.max(1, Math.ceil(ivRowsAll.length / IV_PAGE_SIZE));
    const ivRows = ivRowsAll.slice(ivPage * IV_PAGE_SIZE, ivPage * IV_PAGE_SIZE + IV_PAGE_SIZE);

    /**
     * Sağ raydaki "Bugün" listesi — aktif mülakatların bugüne düşenleri.
     *
     * Tarih YEREL saatle hesaplanıyor. Dosyanın üstündeki `todayStr`
     * `toISOString()` kullanıyor, yani UTC: Türkiye'de gece yarısı ile 03:00
     * arasında "bugün" dünü gösterirdi. Oradaki kullanımlara dokunmuyorum,
     * yeni liste doğru olanı kullanıyor.
     */
    const todaySessions = useMemo(() => {
        const d = new Date();
        const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return activeInterviews
            .filter(s => (s.date || '').split('T')[0] === local)
            .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    }, [activeInterviews]);

    /**
     * Değerlendirici yükü — SAYILAN ŞEY AÇIK: henüz tamamlanmamış mülakatlar.
     * Uydurma bir "kapasite" yüzdesi yok; sayı neyi sayıyorsa o.
     */
    const reviewerLoad = useMemo(() => {
        const counts = new Map();
        activeInterviews.forEach(s => {
            const name = s.interviewerName || s.interviewer || 'Atanmadı';
            counts.set(name, (counts.get(name) || 0) + 1);
        });
        return [...counts.entries()]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6);
    }, [activeInterviews]);

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

    // ── TAKVİMDEN GELEN AKIŞ ────────────────────────────────────────────────
    //
    // Takvim bugüne kadar yalnızca boş slot bulmak için okunuyordu. İşin
    // gerçek başlangıcı ise takvim: kullanıcı gününe bakıyor, hazırlanıyor,
    // görüşme bitince sonucu giriyor. Görüşmenin nerede yapıldığı (Meet,
    // Teams, yüz yüze) bu akışı ilgilendirmiyor.

    /** Google bağlantısı — takvim salt okunur, yazma yetkisi istenmiyor. */
    const takvimGoogleBagla = async () => {
        try {
            const res = await connectGoogleWorkspace(userId);
            if (res && res.success === false && res.error) window.alert(res.error);
        } catch (err) {
            window.alert(err?.message || 'Google bağlantısı kurulamadı.');
        }
    };

    /** Hazırlık: adayın mülakat planına ve üretilmiş sorularına git. */
    const takvimHazirlik = (candidateId) => {
        // Plan mantığı aday sayfasında yaşıyor; burada ikinci bir kopyası
        // olsaydı ikisi zamanla ayrışırdı.
        setViewCandidateId(candidateId);
        window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }));
    };

    /** Takvimden bir mülakat kaydını açar — listedeki davranışın aynısı. */
    const takvimOturumAc = (session) => {
        const key = session.id || session.sessionId;
        const done = session._effectiveCompleted || session.status === 'completed';
        if (done) { navigate(`/interview-report/${key}`); return; }
        if (session.mode === 'face_to_face') { navigate(`/face-interview/${key}`); return; }
        navigate(`/live-interview/${key}`);
    };

    /** Takvimden planlı bir mülakatın sonucunu girer — listedeki akışın aynısı. */
    const takvimOturumSonucu = (session) => {
        setManualPrefill({
            sessionId: session.id || session.sessionId,
            candidateId: session._candidateId || session.candidateId,
            positionId: session.positionId || null,
            date: session.date || '',
            time: session.time || '',
            interviewerName: session.interviewerName || session.interviewer || '',
            title: session.title || '',
        });
        setManualInterviewOpen(true);
    };

    /** Takvim kaydından sonuç girişi — form kayıttan dolu açılıyor. */
    const takvimSonucGir = (event, candidate) => {
        setManualPrefill({
            // Oturum kimliği YOK: bu takvim kaydına bağlı bir görüşme kaydı
            // henüz yok, dolayısıyla değiştirilecek bir şey de yok.
            sessionId: null,
            calendarEventId: event.id,
            candidateId: candidate.id,
            positionId: candidate.positionId || null,
            date: event.start.toISOString().slice(0, 10),
            time: event.allDay ? '' : event.start.toTimeString().slice(0, 5),
            durationMinutes: eventMinutes(event),
            interviewerName: userProfile?.displayName || currentUser?.displayName || '',
            title: event.title,
        });
        setManualInterviewOpen(true);
    };

    /**
     * Takvim kaydını bir adaya bağlar.
     *
     * Bağlantı ADAY BELGESİNDE duruyor: aday listesi zaten canlı dinleniyor,
     * yani ayrı bir koleksiyon, ayrı kural ve her satır için ek okuma
     * gerekmiyor. Elle kurulan bağ her tahminin üstünde tutuluyor
     * (bkz. utils/calendarMatch).
     */
    const takvimAdayaBagla = async (candidate, eventId) => {
        const mevcut = Array.isArray(candidate.calendarEventIds) ? candidate.calendarEventIds : [];
        if (mevcut.includes(eventId)) return;
        await updateCandidate(candidate.id, { calendarEventIds: [...mevcut, eventId] });
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
        const joinLink = `${window.location.origin}/join/iv-${selectedCandidate.id.substring(0, 4)}-${Date.now()}`;
        
        setEmailJoinLink(joinLink);
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

            const { html: htmlBody } = await getInviteEmail(branding, {
                candidateName: selectedCandidate.name,
                recruiterName: userProfile?.displayName || '',
                position:      selectedCandidate.position,
                interviewType: emailSubject,
                date:          manualDate || null,
                time:          manualTime || null,
                joinLink:      emailJoinLink || null,
                companyEmail:  userProfile?.email || null,
            });

            const candidateICS = buildICS({
                date:        manualDate || null,
                time:        manualTime || null,
                title:       emailSubject,
                description: `Aday: ${selectedCandidate.name}\nPozisyon: ${selectedCandidate.position || ''}\nMülakat linki: ${emailJoinLink || ''}`,
                location:    emailJoinLink || '',
                uid:         `${emailJoinLink || Date.now()}@talentflow`,
                organizer:   { name: userProfile?.displayName || '', email: userProfile?.email || '' },
                attendee:    { name: selectedCandidate.name, email: selectedCandidate.email },
            });

            const result = await sendDirectEmail(userId, freshToken, {
                to:      selectedCandidate.email,
                subject: emailSubject,
                body:    emailBody,
                html:    htmlBody,
                ics:     candidateICS,
                replyTo: userProfile?.email || null,
            });

            // Store threadId for reply tracking
            if (result.success && result.threadId) {
                addDoc(collection(db, 'artifacts/talent-flow/public/data/emailThreads'), {
                    threadId: result.threadId,
                    messageId: result.messageId,
                    candidateId: selectedCandidate.id,
                    candidateName: selectedCandidate.name,
                    candidateEmail: selectedCandidate.email,
                    subject: emailSubject,
                    recruiterId: userId,
                    recruiterName: userProfile?.displayName || '',
                    sentAt: serverTimestamp(),
                    hasReply: false
                }).catch(() => {});
            }

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

    // Add an external (outside-the-system) participant by email
    const addExternalParticipant = () => {
        const email = externalEmail.trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email) { setExternalEmailError('E-posta adresi girin.'); return; }
        if (!emailRegex.test(email)) { setExternalEmailError('Geçerli bir e-posta adresi girin.'); return; }
        const extId = `external_${email}`;
        if (selectedParticipants.some(p => p.id === extId)) {
            setExternalEmailError('Bu e-posta zaten eklendi.'); return;
        }
        setSelectedParticipants(prev => [...prev, {
            id: extId,
            name: email,
            email,
            role: 'external',
            isExternal: true
        }]);
        setExternalEmail('');
        setExternalEmailError('');
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
                    body: JSON.stringify({
                        userIds,
                        date: manualDate,
                        time: manualTime,
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                    })
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
            const platformJoinLink = `${window.location.origin}/join/${sessionId}`;
            let meetLink = platformJoinLink;
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
                positionId:    wizardPosition?.id    || selectedCandidate.positionId    || null,
                positionTitle: wizardPosition?.title || selectedCandidate.position || selectedCandidate.bestTitle || selectedCandidate.positionTitle || null,
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
                    console.warn('[Calendar] Could not obtain valid token — skipping calendar event; will use nodemailer for candidate invite.');
                    alert('⚠️ Google token alınamadı. Mülakat sisteme kaydedilecek ama takvime eklenemeyecek.');
                    // Nodemailer fallback when Google token is unavailable
                    if (selectedCandidate?.email) {
                        try {
                            const { html: fbHtml } = await getInviteEmail(branding, {
                                candidateName: selectedCandidate.name,
                                recruiterName: userProfile?.displayName || '',
                                position:      selectedCandidate.position,
                                interviewType: newSession.title,
                                date:          slot.date,
                                time:          slot.time,
                                joinLink:      platformJoinLink,
                                companyEmail:  userProfile?.email || null,
                            });
                            const fbICS = buildICS({
                                date:        slot.date,
                                time:        slot.time,
                                title:       newSession.title,
                                description: `Aday: ${selectedCandidate.name}\nPozisyon: ${selectedCandidate.position || ''}\nMülakat linki: ${platformJoinLink}`,
                                location:    platformJoinLink,
                                uid:         `${newSession.id}-candidate@talentflow`,
                                organizer:   { name: userProfile?.displayName || '', email: userProfile?.email || '' },
                                attendee:    { name: selectedCandidate.name, email: selectedCandidate.email },
                            });
                            const authTok = await currentUser?.getIdToken?.() || '';
                            const fbRes = await fetch('/api/send-interview-invite', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authTok}` },
                                body: JSON.stringify({
                                    to: selectedCandidate.email,
                                    subject: `Mülakat Davetiniz: ${newSession.title}`,
                                    html: fbHtml,
                                    ics: fbICS,
                                    candidateName: selectedCandidate.name,
                                    branding,
                                }),
                            });
                            if (!fbRes.ok) throw new Error(await fbRes.text());
                            console.log('[createInterviewRecord] Token-fail nodemailer invite sent to:', selectedCandidate.email);
                        } catch (fbErr) {
                            console.warn('[createInterviewRecord] Token-fail nodemailer invite failed (non-blocking):', fbErr.message);
                        }
                    }
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
                    } else {
                        // Warn but don't block — interview record is still saved
                        console.warn('[Calendar] Event creation failed:', calResult.error);
                        alert(`⚠️ Takvim etkinliği oluşturulamadı: ${calResult.error}\n\nMülakat yine de sisteme kaydedilecek.`);
                    }

                    // Send notification emails to internal participants (not the candidate)
                    // regardless of calendar creation result — notifications must always go out.
                    for (const participant of selectedParticipants) {
                        if (!participant.email) continue;
                        try {
                            const { html: participantHtml } = await getParticipantEmail(branding, {
                                participantName: participant.name,
                                candidateName:   selectedCandidate.name,
                                position:        selectedCandidate.position,
                                date:            slot.date,
                                time:            slot.time,
                                interviewType:   newSession.title,
                                meetLink:        platformJoinLink,
                                googleMeetLink:  calResult?.success && calResult.meetLink ? calResult.meetLink : null,
                                recruiterName:   userProfile?.displayName || ''
                            });
                            const participantICS = buildICS({
                                date:        slot.date,
                                time:        slot.time,
                                title:       `${newSession.title} — ${selectedCandidate.name}`,
                                description: `Aday: ${selectedCandidate.name}\nPozisyon: ${selectedCandidate.position || '—'}\nOrganizatör: ${userProfile?.displayName || ''}\nMülakat linki: ${platformJoinLink}`,
                                location:    platformJoinLink,
                                uid:         `${newSession.id}-${participant.email}@talentflow`,
                                organizer:   { name: userProfile?.displayName || '', email: userProfile?.email || '' },
                                attendee:    { name: participant.name, email: participant.email },
                            });
                            await sendDirectEmail(userId, freshCalToken, {
                                to:      participant.email,
                                subject: `Mülakat Daveti: ${newSession.title} — ${selectedCandidate.name}`,
                                body:    `Merhaba ${participant.name || participant.email},\n\nTalent-Inn üzerinden bir mülakata katılımcı olarak eklendiniz.\n\nAday: ${selectedCandidate.name}\nPozisyon: ${selectedCandidate.position || '—'}\nTarih: ${slot.date}\nSaat: ${slot.time}\nMülakat Tipi: ${newSession.title}\n\nMülakat Linki: ${platformJoinLink}\n\nTalent-Inn Ekibi`,
                                html:    participantHtml,
                                ics:     participantICS,
                                replyTo: userProfile?.email || null,
                            });
                        } catch (emailErr) {
                            console.warn('[Participants] Email send failed for:', participant.email, emailErr.message);
                        }
                    }

                    // Auto-send candidate invite email immediately on scheduling
                    if (selectedCandidate?.email) {
                        try {
                            const { html: candidateHtml } = await getInviteEmail(branding, {
                                candidateName: selectedCandidate.name,
                                recruiterName: userProfile?.displayName || '',
                                position:      selectedCandidate.position,
                                interviewType: newSession.title,
                                date:          slot.date,
                                time:          slot.time,
                                joinLink:      platformJoinLink,
                                companyEmail:  userProfile?.email || null,
                            });
                            const candidateICS = buildICS({
                                date:        slot.date,
                                time:        slot.time,
                                title:       newSession.title,
                                description: `Aday: ${selectedCandidate.name}\nPozisyon: ${selectedCandidate.position || ''}\nMülakat linki: ${platformJoinLink}`,
                                location:    platformJoinLink,
                                uid:         `${newSession.id}-candidate@talentflow`,
                                organizer:   { name: userProfile?.displayName || '', email: userProfile?.email || '' },
                                attendee:    { name: selectedCandidate.name, email: selectedCandidate.email },
                            });
                            await sendDirectEmail(userId, freshCalToken, {
                                to:      selectedCandidate.email,
                                subject: `Mülakat Davetiniz: ${newSession.title}`,
                                html:    candidateHtml,
                                ics:     candidateICS,
                                replyTo: userProfile?.email || null,
                            });
                            console.log('[createInterviewRecord] Candidate invite email sent to:', selectedCandidate.email);
                        } catch (candidateEmailErr) {
                            console.warn('[createInterviewRecord] Candidate invite email failed (non-blocking):', candidateEmailErr.message);
                        }
                    }
                }
            }

            // Nodemailer fallback: send candidate invite when Google is NOT connected
            if (slot && !startNow && !isGoogleConnected && selectedCandidate?.email) {
                try {
                    const { html: candidateHtml } = await getInviteEmail(branding, {
                        candidateName: selectedCandidate.name,
                        recruiterName: userProfile?.displayName || '',
                        position:      selectedCandidate.position,
                        interviewType: newSession.title,
                        date:          slot.date,
                        time:          slot.time,
                        joinLink:      platformJoinLink,
                        companyEmail:  userProfile?.email || null,
                    });
                    const candidateICS = buildICS({
                        date:        slot.date,
                        time:        slot.time,
                        title:       newSession.title,
                        description: `Aday: ${selectedCandidate.name}\nPozisyon: ${selectedCandidate.position || ''}\nMülakat linki: ${platformJoinLink}`,
                        location:    platformJoinLink,
                        uid:         `${newSession.id}-candidate@talentflow`,
                        organizer:   { name: userProfile?.displayName || '', email: userProfile?.email || '' },
                        attendee:    { name: selectedCandidate.name, email: selectedCandidate.email },
                    });
                    const authTok2 = await currentUser?.getIdToken?.() || '';
                    const inviteResp = await fetch('/api/send-interview-invite', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authTok2}` },
                        body: JSON.stringify({
                            to: selectedCandidate.email,
                            subject: `Mülakat Davetiniz: ${newSession.title}`,
                            html: candidateHtml,
                            ics: candidateICS,
                            candidateName: selectedCandidate.name,
                            branding,
                        }),
                    });
                    if (!inviteResp.ok) throw new Error(await inviteResp.text());
                    console.log('[createInterviewRecord] Nodemailer candidate invite sent to:', selectedCandidate.email);
                } catch (inviteErr) {
                    console.warn('[createInterviewRecord] Nodemailer candidate invite failed (non-blocking):', inviteErr.message);
                }
            }

            await updateCandidate(selectedCandidate.id, {
                interviewSessions: [...(selectedCandidate.interviewSessions || []), newSession],
                hasInterview: true,
                status: startNow ? 'Interview' : 'Review'
            });

            // Pre-create the /interviews/{sessionId} Firestore doc so candidates can open
            // the join link immediately — without this, the doc doesn't exist until the
            // recruiter opens the live interview page, leaving the candidate on a loading screen.
            try {
                await fetch('/api/init-interview-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId,
                        initialData: {
                            status: newSession.status,
                            candidateId:   selectedCandidate.id,
                            candidateName: selectedCandidate.name,
                            positionId:    newSession.positionId,
                            positionTitle: newSession.positionTitle,
                            createdAt: new Date().toISOString(),
                        },
                    }),
                });
                console.log('[createInterviewRecord] Pre-created /interviews/' + sessionId);
            } catch (docErr) {
                console.warn('[createInterviewRecord] Could not pre-create session doc (non-blocking):', docErr.message);
            }

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
            addNotification({
                title: 'Mülakat Planlandı',
                message: `${selectedCandidate.name} için ${newSession.title} mülakatı ${newSession.date} tarihinde planlandı.`,
                type: 'success'
            });
            setTimeout(() => {
                setSaveStatus('idle');
                if (startNow) {
                    navigate(`/live-interview/${newSession.id}`);
                } else {
                    setSelectedCandidate(null);
                    setWizardPosition(null);
                    setIsPlanningMode(false);
                }
            }, 1000);
        } catch (err) {
            console.error("Save interview error:", err);
            setSaveStatus('idle');
            alert("Kaydedilemedi: " + err.message);
        }
    };
    
    const handleQuickStart = async () => {
        if (!quickCandidate || quickLoading) return;
        setQuickLoading(true);
        try {
            const interviewerName = currentUser?.displayName || 'Değerlendirici';
            const sessionId = `iv-${crypto.randomUUID()}`;
            const platformJoinLink = `${window.location.origin}/join/${sessionId}`;
            const typeLabel = quickType === 'technical' ? 'Teknik Mülakat' : quickType === 'hr' ? 'İK Filtre' : 'Product Mülakatı';
            const now = new Date();
            const newSession = {
                id: sessionId,
                title: typeLabel,
                date: now.toISOString().split('T')[0],
                time: now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                type: quickType,
                interviewer: interviewerName,
                interviewerId: userId,
                status: 'live',
                meetLink: platformJoinLink,
                positionId:    quickPosition?.id    || quickCandidate.positionId    || null,
                positionTitle: quickPosition?.title || quickCandidate.position || quickCandidate.bestTitle || null,
                participants: [],
            };

            await updateCandidate(quickCandidate.id, {
                interviewSessions: [...(quickCandidate.interviewSessions || []), newSession],
                hasInterview: true,
                status: 'Interview',
            });

            // Pre-create Firestore session doc
            try {
                await fetch('/api/init-interview-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId,
                        initialData: {
                            status: 'live',
                            candidateId:   quickCandidate.id,
                            candidateName: quickCandidate.name,
                            positionId:    newSession.positionId,
                            positionTitle: newSession.positionTitle,
                            createdAt: new Date().toISOString(),
                        },
                    }),
                });
            } catch (docErr) {
                console.warn('[handleQuickStart] Pre-create failed (non-blocking):', docErr.message);
            }

            setQuickModal(false);
            setQuickCandidate(null);
            setQuickSearch('');
            navigate(`/live-interview/${sessionId}`);
        } catch (err) {
            console.error('[handleQuickStart] Error:', err);
            alert('Mülakat başlatılamadı: ' + err.message);
        } finally {
            setQuickLoading(false);
        }
    };

    const handleFaceToFaceStart = async () => {
        if (!quickCandidate || faceToFaceLoading) return;
        setFaceToFaceLoading(true);
        try {
            const interviewerName = currentUser?.displayName || 'Değerlendirici';
            const sessionId = `iv-${crypto.randomUUID()}`;
            const typeLabel = quickType === 'technical' ? 'Teknik Mülakat' : quickType === 'hr' ? 'İK Filtre' : 'Product Mülakatı';
            const now = new Date();
            const newSession = {
                id: sessionId,
                title: typeLabel + ' (Yüz Yüze)',
                date: now.toISOString().split('T')[0],
                time: now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                type: quickType,
                mode: 'face_to_face',
                interviewer: interviewerName,
                interviewerId: userId,
                status: 'live',
                meetLink: `${window.location.origin}/face-interview/${sessionId}`,
                positionId:    quickPosition?.id    || quickCandidate.positionId    || null,
                positionTitle: quickPosition?.title || quickCandidate.position || quickCandidate.bestTitle || null,
                participants: [],
            };

            await updateCandidate(quickCandidate.id, {
                interviewSessions: [...(quickCandidate.interviewSessions || []), newSession],
                hasInterview: true,
                status: 'Interview',
            });

            try {
                await fetch('/api/init-interview-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId,
                        initialData: {
                            status: 'live',
                            mode: 'face_to_face',
                            candidateId:   quickCandidate.id,
                            candidateName: quickCandidate.name,
                            positionId:    newSession.positionId,
                            positionTitle: newSession.positionTitle,
                            createdAt: new Date().toISOString(),
                        },
                    }),
                });
            } catch (docErr) {
                console.warn('[handleFaceToFaceStart] Pre-create failed (non-blocking):', docErr.message);
            }

            setQuickModal(false);
            setQuickCandidate(null);
            setQuickSearch('');
            navigate(`/face-interview/${sessionId}`);
        } catch (err) {
            console.error('[handleFaceToFaceStart] Error:', err);
            alert('Yüz yüze mülakat başlatılamadı: ' + err.message);
        } finally {
            setFaceToFaceLoading(false);
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
            // Clean up participantInvites so cross-dept calendar entries don't go stale
            try {
                await deleteDoc(doc(db, PARTICIPANT_INVITES_PATH, sessionId));
            } catch (piErr) {
                console.warn('[ParticipantInvites] Delete failed (non-blocking):', piErr.message);
            }
            setSaveStatus('success');
            setTimeout(() => setSaveStatus('idle'), 1000);
        } catch (err) {
            console.error("Delete session error:", err);
            alert("Silinemedi: " + err.message);
        }
    };

    // Update session status (postponed / cancelled) across candidate record + participantInvites
    const handleUpdateSessionStatus = async (candidateId, sessionId, newStatus, newDate, newTime) => {
        const candidate = enrichedCandidates.find(c => c.id === candidateId);
        if (!candidate) return;
        const originalSession = (candidate.interviewSessions || []).find(s => s.id === sessionId);
        const updatedSessions = (candidate.interviewSessions || []).map(s => {
            if (s.id !== sessionId) return s;
            return {
                ...s,
                status: newStatus,
                ...(newDate ? { date: newDate } : {}),
                ...(newTime ? { time: newTime } : {}),
            };
        });
        try {
            await updateCandidate(candidateId, { interviewSessions: updatedSessions });
            // Mirror status (and optional reschedule) into participantInvites for cross-dept view
            try {
                await setDoc(doc(db, PARTICIPANT_INVITES_PATH, sessionId), {
                    status: newStatus,
                    ...(newDate ? { date: newDate } : {}),
                    ...(newTime ? { time: newTime } : {}),
                }, { merge: true });
            } catch (piErr) {
                console.warn('[ParticipantInvites] Status sync failed (non-blocking):', piErr.message);
            }

            // Send reschedule / cancellation email to the candidate (non-blocking)
            if (candidate.email && (newStatus === 'postponed' || newStatus === 'cancelled') && originalSession) {
                try {
                    const freshToken = await ensureValidGoogleToken(userId, userProfile);
                    // Build email content up front so both the Gmail-API path and the
                    // SMTP fallback below can reuse the same subject/body/html. (Pre-fix
                    // these consts were declared inside the `if (freshToken)` branch and
                    // the fallback referenced them out of scope → ReferenceError.)
                    const isCancelled = newStatus === 'cancelled';
                    const { html: rescheduleHtml } = await getRescheduleEmail(branding, {
                        candidateName: candidate.name,
                        recruiterName: userProfile?.displayName || '',
                        position:      candidate.position,
                        oldDate:       originalSession.date || '',
                        oldTime:       originalSession.time || '',
                        newDate:       newDate || null,
                        newTime:       newTime || null,
                        joinLink:      (newDate || newTime) ? (originalSession.meetLink || null) : null,
                        isCancelled,
                        companyEmail:  userProfile?.email || null,
                    });
                    const rescheduleSubject = isCancelled
                        ? `Mülakat İptali: ${originalSession.title || 'Mülakat'} - ${candidate.name}`
                        : `Mülakat Tarihi Güncellendi: ${originalSession.title || 'Mülakat'} - ${candidate.name}`;
                    const rescheduleBody = isCancelled
                        ? `Sayın ${candidate.name},\n\n${branding.companyName || 'Şirketimiz'} ile planlanmış olan ${originalSession.title || 'mülakat'} (${originalSession.date || ''} ${originalSession.time || ''}) maalesef iptal edilmiştir.\n\nHerhangi bir sorunuz için bizimle iletişime geçebilirsiniz.\n\nSaygılarımızla,\n${userProfile?.displayName || 'İK Ekibi'}`
                        : `Sayın ${candidate.name},\n\n${branding.companyName || 'Şirketimiz'} ile planlanmış olan mülakatınızın (${originalSession.date || ''} ${originalSession.time || ''}) tarihi güncellenmiştir.\n\nYeni tarih: ${newDate || originalSession.date || ''} ${newTime || originalSession.time || ''}\n\nHerhangi bir sorunuz için bizimle iletişime geçebilirsiniz.\n\nSaygılarımızla,\n${userProfile?.displayName || 'İK Ekibi'}`;
                    if (freshToken) {
                        await sendDirectEmail(userId, freshToken, {
                            to:      candidate.email,
                            subject: rescheduleSubject,
                            body:    rescheduleBody,
                            html:    rescheduleHtml,
                            replyTo: userProfile?.email || null,
                        });
                    } else {
                        // SMTP fallback when Google token is not available
                        try {
                            const { getAuth } = await import('firebase/auth');
                            const idToken = await getAuth().currentUser?.getIdToken();
                            const API_BASE = import.meta.env.VITE_SERVER_URL || '';
                            await fetch(`${API_BASE}/api/send-feedback`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
                                },
                                body: JSON.stringify({
                                    to: candidate.email,
                                    subject: rescheduleSubject,
                                    body: rescheduleBody,
                                    html: rescheduleHtml,
                                }),
                            });
                            console.log('[RescheduleEmail] Sent via SMTP fallback');
                        } catch (smtpErr) {
                            console.warn('[RescheduleEmail] SMTP fallback failed:', smtpErr.message);
                        }
                    }
                } catch (emailErr) {
                    console.warn('[RescheduleEmail] Failed to send notification:', emailErr.message);
                }
            }
        } catch (err) {
            console.error('Update session status error:', err);
            alert('Güncellenemedi: ' + err.message);
        }
    };



    return (
        <div className="infoset flex flex-col h-screen">
            <Header title="Mülakat Yönetimi" />

            {/* ═══ PLANNING WIZARD MODE ═══════════════════════════════════════ */}
            {isPlanningMode && (
                <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
                    <div className="flex items-center gap-3 mb-4 px-2 pt-2">
                        <button
                            onClick={() => { setIsPlanningMode(false); setWizardStep(1); setWizardPosition(null); }}
                            className="w-9 h-9 rounded-md bg-n0 border border-n200 flex items-center justify-center text-brand hover:bg-brand-50 transition-all shadow-sm"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div>
                            <h1 className="text-xl font-semibold text-n900">Yeni Mülakat Planla</h1>
                            <p className="text-xs text-n500 mt-0.5 font-medium">4 adımda tamamlayın</p>
                        </div>
                        {(wizardStep >= 2) && selectedCandidate && manualDate && (
                            <div className="ml-auto text-xs text-n500 bg-n0 border border-n200 rounded-full px-3 py-1 flex items-center gap-1.5 shadow-sm">
                                <span className="font-semibold text-n900">{selectedCandidate.name}</span>
                                <span>·</span>
                                <span>{new Date(manualDate + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
                            </div>
                        )}
                    </div>
                                        <div className="bg-n0 rounded-[24px] border border-n200 shadow-sm overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-300">

                        {/* WIZARD STEP PROGRESS BAR */}
                        <div className="px-8 pt-6 pb-5 border-b border-n100 bg-n50/40">
                            <div className="relative flex justify-between items-start">
                                <div className="absolute left-5 right-5 top-5 h-0.5 bg-n200 z-0" />
                                <div
                                    className="absolute left-5 top-5 h-0.5 bg-brand z-0 transition-all duration-500"
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
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm border-2 transition-all ${
                                            step.num < wizardStep
                                                ? 'bg-ok border-ok text-white shadow-md shadow-none/20'
                                                : step.num === wizardStep
                                                ? 'bg-brand border-brand text-white shadow-lg shadow-none/15'
                                                : 'bg-n0 border-n200 text-n400'
                                        }`}>
                                            {step.num < wizardStep ? <Check className="w-5 h-5" /> : step.num}
                                        </div>
                                        <span className={`text-[10px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap ${
                                            step.num === wizardStep ? 'text-brand' : step.num < wizardStep ? 'text-ok' : 'text-n400'
                                        }`}>{step.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* STEP 1: ADAY SEÇİMİ */}
                        {wizardStep === 1 && (
                            <div className="p-6 overflow-y-auto custom-scrollbar" style={{ maxHeight: 440 }}>
                                {/* Position selector — always at the top */}
                                <div className="mb-5 pb-4 border-b border-n100">
                                    <p className="text-[10px] font-semibold text-n500 uppercase tracking-[0.08em] mb-2">Mülakat Pozisyonu</p>
                                    {openPositions.length > 0 ? (
                                        <select
                                            value={wizardPosition?.id || ''}
                                            onChange={e => setWizardPosition(openPositions.find(p => p.id === e.target.value) || null)}
                                            className="w-full border border-n200 rounded-md px-3 py-2.5 text-[12px] text-n900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 bg-n0"
                                        >
                                            <option value="">Pozisyon seçin...</option>
                                            {openPositions.map(p => (
                                                <option key={p.id} value={p.id}>{p.title}{p.department ? ` — ${p.department}` : ''}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            type="text"
                                            placeholder="Pozisyon adı girin..."
                                            value={wizardPosition?.title || ''}
                                            onChange={e => setWizardPosition(e.target.value ? { title: e.target.value } : null)}
                                            className="w-full border border-n200 rounded-md px-3 py-2.5 text-[12px] text-n900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 bg-n0 placeholder:text-n400"
                                        />
                                    )}
                                </div>
                                {/* Candidate list */}
                                <p className="text-[10px] font-semibold text-n500 uppercase tracking-[0.08em] mb-3">Görüşeceğiniz adayı seçin</p>
                                {enrichedCandidates.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 text-n400">
                                        <User className="w-8 h-8 mb-2 opacity-30" />
                                        <p className="text-[11px] font-medium">Sistemde henüz aday bulunmuyor.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                        {enrichedCandidates.map(c => (
                                            <button
                                                key={c.id}
                                                onClick={() => { setSelectedCandidate(c); }}
                                                className={`flex items-center gap-3.5 p-3 rounded-[14px] border-2 transition-all text-left w-full ${
                                                    selectedCandidate?.id === c.id
                                                        ? 'border-brand bg-brand-50/50 shadow-md shadow-none/5'
                                                        : 'border-n200 bg-n0 hover:border-n300 hover:bg-n50'
                                                }`}
                                            >
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 ${
                                                    selectedCandidate?.id === c.id ? 'bg-brand text-white' : 'bg-n100 text-n600'
                                                }`}>
                                                    {c.name ? c.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : 'A'}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-[12px] font-semibold truncate ${selectedCandidate?.id === c.id ? 'text-brand' : 'text-n900'}`}>{c.name}</p>
                                                    <p className="text-[11px] text-n500 font-medium mt-0.5 truncate">{c.position || c.bestTitle || '—'}</p>
                                                </div>
                                                <div className={`px-2.5 py-1.5 rounded-md text-[12px] font-semibold flex-shrink-0 ${selectedCandidate?.id === c.id ? 'bg-brand text-white' : 'bg-n100 text-n600'}`}>
                                                    %{Math.round(c.bestScore || 0)}
                                                </div>
                                                {selectedCandidate?.id === c.id && (
                                                    <div className="w-5 h-5 rounded-full bg-ok flex items-center justify-center flex-shrink-0">
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
                                <p className="text-[10px] font-semibold text-n500 uppercase tracking-[0.08em] mb-1">Mülakate katılacak ekip üyelerini seçin</p>
                                <p className="text-[11px] text-n400 mb-3">
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
                                        className="w-full pl-9 pr-4 py-2.5 text-[11px] bg-n0 border border-n200 rounded-md focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/20 text-n900 placeholder:text-n400"
                                    />
                                    <Search className="w-3.5 h-3.5 text-n400 absolute left-3 top-1/2 -translate-y-1/2" />
                                </div>
                                {isLoadingAvailability ? (
                                    <div className="flex items-center justify-center py-12 gap-2 text-n400">
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
                                                    className={`flex items-center gap-3.5 p-3 rounded-[14px] border-2 transition-all text-left w-full ${
                                                        isSelected
                                                            ? 'border-brand bg-brand-50/50 shadow-md shadow-none/5'
                                                            : 'border-n200 bg-n0 hover:border-n300 hover:bg-n50'
                                                    }`}
                                                >
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 ${
                                                        isSelected ? 'bg-brand text-white' : 'bg-n100 text-n600'
                                                    }`}>
                                                        {initials}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-[12px] font-semibold truncate ${isSelected ? 'text-brand' : 'text-n900'}`}>
                                                            {u.name || u.displayName || u.email || 'Kullanıcı'}
                                                        </p>
                                                        <p className="text-[11px] text-n500 font-medium truncate capitalize">
                                                            {(u.role || '').replace('_', ' ')}
                                                        </p>
                                                    </div>
                                                    {manualDate && manualTime && (
                                                        <div className={`px-2 py-1 rounded-md text-[11px] font-semibold uppercase tracking-[0.08em] flex-shrink-0 ${
                                                            availability === 'available' ? 'bg-ok-bg text-ok-text' :
                                                            availability === 'busy' ? 'bg-bad-bg text-bad-text' :
                                                            'bg-n100 text-n500'
                                                        }`}>
                                                            {availability === 'available' ? 'MÜSAİT' : availability === 'busy' ? 'MEŞGUL' : 'BİLGİSİZ'}
                                                        </div>
                                                    )}
                                                    {isSelected && (
                                                        <div className="w-5 h-5 rounded-full bg-ok flex items-center justify-center flex-shrink-0">
                                                            <Check className="w-3 h-3 text-white" />
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                        {systemUsers.filter(u => u.role !== 'candidate').length === 0 && (
                                            <div className="col-span-2 flex flex-col items-center justify-center py-16 text-n400">
                                                <User className="w-8 h-8 mb-2 opacity-30" />
                                                <p className="text-[11px] font-medium">Sistemde kullanıcı bulunamadı.</p>
                                            </div>
                                        )}
                                        {systemUsers.filter(u => u.role !== 'candidate').length > 0 &&
                                         participantSearch.trim() &&
                                         systemUsers.filter(u => u.role !== 'candidate' && (
                                             (u.name || u.displayName || '').toLowerCase().includes(participantSearch.toLowerCase()) ||
                                             (u.email || '').toLowerCase().includes(participantSearch.toLowerCase())
                                         )).length === 0 && (
                                            <div className="col-span-2 flex flex-col items-center justify-center py-12 text-n400">
                                                <p className="text-[11px] font-medium">"{participantSearch}" için sonuç bulunamadı</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* External email invite */}
                                <div className="mt-4 p-3 bg-n50 border border-dashed border-n300 rounded-[14px]">
                                    <p className="text-[10px] font-semibold text-n500 uppercase tracking-[0.08em] mb-3 flex items-center gap-1.5">
                                        <UserPlus className="w-3.5 h-3.5" />
                                        Harici Katılımcı Ekle
                                    </p>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <AtSign className="w-3.5 h-3.5 text-n400 absolute left-3 top-1/2 -translate-y-1/2" />
                                            <input
                                                type="email"
                                                placeholder="ornek@sirket.com"
                                                value={externalEmail}
                                                onChange={e => { setExternalEmail(e.target.value); setExternalEmailError(''); }}
                                                onKeyDown={e => e.key === 'Enter' && addExternalParticipant()}
                                                className="w-full pl-9 pr-3 py-2.5 text-[11px] bg-n0 border border-n200 rounded-md focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/20 text-n900 placeholder:text-n400"
                                            />
                                        </div>
                                        <button
                                            onClick={addExternalParticipant}
                                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-md bg-brand text-white text-[12px] font-semibold hover:bg-brand-600 transition-colors shrink-0"
                                        >
                                            <UserPlus className="w-3.5 h-3.5" />
                                            Ekle
                                        </button>
                                    </div>
                                    {externalEmailError && (
                                        <p className="text-[11px] text-bad mt-1.5 font-medium">{externalEmailError}</p>
                                    )}
                                    <p className="text-[10px] text-n400 mt-2">Sistemde kayıtlı olmayan kişilere de mülakat daveti gönderebilirsiniz.</p>
                                </div>

                                {selectedParticipants.length > 0 && (
                                    <div className="mt-4 p-3.5 bg-brand-50 border border-brand-100 rounded-[14px]">
                                        <p className="text-[10px] font-semibold text-brand uppercase tracking-[0.08em] mb-2">
                                            Seçili Katılımcılar ({selectedParticipants.length})
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedParticipants.map(p => (
                                                <span key={p.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border ${
                                                    p.isExternal
                                                        ? 'bg-warn-bg border-warn text-warn-text'
                                                        : 'bg-n0 border-brand-200 text-brand'
                                                }`}>
                                                    {p.isExternal && <AtSign className="w-2.5 h-2.5" />}
                                                    {p.name || p.email}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); toggleParticipant(p); }}
                                                        className="text-n400 hover:text-bad transition-colors leading-none"
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
                                    <div className="w-1/2 p-6 border-r border-n100 overflow-y-auto custom-scrollbar">
                                        <div className="flex items-center gap-2 mb-4">
                                            <CalendarDays className="w-3.5 h-3.5 text-brand" />
                                            <p className="text-[10px] font-semibold text-n500 uppercase tracking-[0.08em]">{monthLabel}</p>
                                            {isCheckingDay && <Loader2 className="w-3 h-3 animate-spin text-n400 ml-auto" />}
                                        </div>
                                        <div className="grid grid-cols-7 gap-y-1 gap-x-0.5 text-center">
                                            {['Pt','Sl','Çr','Pr','Cm','Ct','Pz'].map(d => (
                                                <div key={d} className="text-[10px] font-semibold text-n400 uppercase tracking-[0.08em] py-1">{d}</div>
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
                                                            className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold transition-all ${
                                                                isPast ? 'text-n300 cursor-not-allowed' :
                                                                isSelected ? 'bg-brand text-white shadow-md font-semibold' :
                                                                'text-n700 hover:bg-n100'
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
                                            <p className="text-[10px] font-semibold text-n500 uppercase tracking-[0.08em] mb-2.5">Mülakat Tipi</p>
                                            <div className="grid grid-cols-3 gap-1.5">
                                                {[
                                                    { id: 'technical', label: 'TEKNİK', Icon: Settings },
                                                    { id: 'hr', label: 'İK FİLTRE', Icon: User },
                                                    { id: 'product', label: 'PRODUCT', Icon: Package }
                                                ].map(({ id, label, Icon }) => (
                                                    <button
                                                        key={id}
                                                        onClick={() => setInterviewType(id)}
                                                        className={`py-2 rounded-md text-[10px] font-semibold uppercase tracking-[0.08em] flex items-center justify-center gap-1 transition-all border ${
                                                            interviewType === id
                                                                ? 'bg-brand text-white border-brand shadow-md'
                                                                : 'bg-n0 text-n500 border-n200 hover:bg-n50'
                                                        }`}
                                                    >
                                                        <Icon className="w-3 h-3" /> {label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Time slots panel */}
                                    <div className="w-1/2 p-6 bg-n25/50 overflow-y-auto custom-scrollbar">
                                        <p className="text-[11px] font-semibold text-n900">
                                            {manualDate
                                                ? new Date(manualDate + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
                                                : 'Önce tarih seçin'}
                                        </p>
                                        <p className="text-[10px] text-n400 font-medium mb-4 mt-0.5">GMT+3 — İstanbul</p>

                                        {conflictWarning && (
                                            <div className="mb-3 bg-bad-bg border border-transparent rounded-md p-3 flex items-start gap-2">
                                                <AlertTriangle className="w-3.5 h-3.5 text-bad flex-shrink-0 mt-0.5" />
                                                <p className="text-[10px] text-bad font-semibold leading-relaxed">{conflictWarning.message}</p>
                                            </div>
                                        )}

                                        {!manualDate ? (
                                            <div className="flex flex-col items-center justify-center h-40 text-n300">
                                                <Clock className="w-7 h-7 mb-2 opacity-40" />
                                                <p className="text-[11px] font-medium">Soldan tarih seçin</p>
                                            </div>
                                        ) : isCheckingDay ? (
                                            <div className="flex items-center justify-center h-40 gap-2 text-n400">
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
                                                            className={`flex items-center justify-between px-3 py-2.5 rounded-md border transition-all ${
                                                                isSelected
                                                                    ? 'border-brand bg-brand-50 ring-1 ring-brand/20 shadow-md shadow-none/5'
                                                                    : isBusy
                                                                    ? 'border-n100 bg-n0 cursor-not-allowed'
                                                                    : 'border-n200 bg-n0 hover:border-brand/30 hover:bg-brand-50/30'
                                                            }`}
                                                        >
                                                            <span className={`text-[12px] font-semibold tracking-tight ${isBusy ? 'text-n300' : isSelected ? 'text-brand' : 'text-n900'}`}>{slotTime}</span>
                                                            {isSelected ? (
                                                                <span className="text-[11px] font-semibold px-1.5 py-0.5 bg-brand text-white rounded-md flex items-center gap-0.5">
                                                                    <CheckCircle2 className="w-2.5 h-2.5" /> SEÇİLİ
                                                                </span>
                                                            ) : isBusy ? (
                                                                <span className="text-[11px] font-semibold px-1.5 py-0.5 bg-bad-bg text-bad-text rounded-md flex items-center gap-0.5">
                                                                    <AlertCircle className="w-2.5 h-2.5" /> DOLU
                                                                </span>
                                                            ) : (
                                                                <span className="text-[11px] font-medium px-1.5 py-0.5 bg-n100 text-n400 rounded-md">UYGUN</span>
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
                                                className="mt-4 w-full py-2 rounded-md border border-transparent bg-ok-bg/60 text-[10px] font-semibold uppercase tracking-[0.08em] text-ok-text flex items-center justify-center gap-1.5 hover:bg-ok-bg transition-all"
                                            >
                                                {isAnalyzingSlots ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                                AI Slot Öner
                                            </button>
                                        )}
                                        {suggestedSlots.length > 0 && (
                                            <div className="mt-3 space-y-1.5">
                                                <p className="text-[10px] font-semibold text-n400 uppercase tracking-[0.08em]">AI Önerileri:</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {suggestedSlots.map((slot, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={() => { setManualDate(slot.date); setManualTime(slot.time); }}
                                                            className="px-3 py-1.5 bg-n0 border border-transparent rounded-md text-[11px] font-semibold text-ok-text hover:bg-ok-bg transition-all"
                                                        >
                                                            {new Date(slot.date + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} {slot.time}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Participant availability for chosen time */}
                                        {selectedParticipants.length > 0 && manualDate && manualTime && (
                                            <div className="mt-4 border-t border-n100 pt-4">
                                                <p className="text-[10px] font-semibold text-n500 uppercase tracking-[0.08em] mb-2.5">Katılımcı Uygunluğu</p>
                                                {isLoadingAvailability ? (
                                                    <div className="flex items-center gap-2 text-n400">
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        <span className="text-[10px]">Kontrol ediliyor...</span>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-1.5">
                                                        {selectedParticipants.map(p => {
                                                            const avail = participantAvailability[p.id];
                                                            return (
                                                                <div key={p.id} className={`flex items-center justify-between border rounded-md px-3 py-2 ${p.isExternal ? 'bg-warn-bg border-transparent' : 'bg-n0 border-n100'}`}>
                                                                    <div className="flex items-center gap-2">
                                                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${p.isExternal ? 'bg-warn-bg text-warn-text' : 'bg-brand/10 text-brand'}`}>
                                                                            {p.isExternal ? '@' : (p.name || p.displayName || p.email || '?').charAt(0).toUpperCase()}
                                                                        </div>
                                                                        <span className="text-[11px] font-semibold text-n900">{p.name || p.displayName || p.email}</span>
                                                                    </div>
                                                                    {p.isExternal ? (
                                                                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-[0.08em] bg-warn-bg text-warn-text">HARİCİ</span>
                                                                    ) : (
                                                                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-[0.08em] ${
                                                                            avail === 'available' ? 'bg-ok-bg text-ok-text' :
                                                                            avail === 'busy' ? 'bg-bad-bg text-bad-text' :
                                                                            'bg-n100 text-n500'
                                                                        }`}>
                                                                            {avail === 'available' ? 'MÜSAİT' : avail === 'busy' ? 'MEŞGUL' : 'BİLGİSİZ'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {selectedParticipants.length > 0 && (!manualDate || !manualTime) && (
                                            <div className="mt-4 border-t border-n100 pt-4">
                                                <p className="text-[10px] font-semibold text-n400 uppercase tracking-[0.08em]">{selectedParticipants.length} katılımcı seçildi — tarih/saat seçince uygunluk görünür</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* STEP 4: ONAYLA & GÖNDER */}
                        {wizardStep === 4 && (
                            <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar" style={{ minHeight: 360 }}>
                                <p className="text-[10px] font-semibold text-n500 uppercase tracking-[0.08em]">Mülakat detaylarını kontrol edin</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {/* Candidate card */}
                                    <div className="bg-n25 rounded-[14px] border border-n200 p-3 space-y-2.5">
                                        <p className="text-[10px] font-semibold text-n500 uppercase tracking-[0.08em]">Aday</p>
                                        <div className="flex items-center gap-2">
                                            <div className="w-9 h-9 rounded-full bg-brand text-white flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
                                                {selectedCandidate?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[12px] font-semibold text-n900 truncate">{selectedCandidate?.name}</p>
                                                <p className="text-[11px] text-n500 truncate">{selectedCandidate?.position || selectedCandidate?.bestTitle}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-4 rounded-full bg-ok-bg flex items-center justify-center">
                                                <Check className="w-2.5 h-2.5 text-ok" />
                                            </div>
                                            <span className="text-[10px] font-semibold text-n500 truncate">{selectedCandidate?.email || '—'}</span>
                                        </div>
                                    </div>
                                    {/* Interview detail card */}
                                    <div className="bg-n25 rounded-[14px] border border-n200 p-3 space-y-2.5">
                                        <p className="text-[10px] font-semibold text-n500 uppercase tracking-[0.08em]">Mülakat Detayı</p>
                                        <div className="flex items-center gap-2">
                                            <CalendarDays className="w-3.5 h-3.5 text-brand" />
                                            <span className="text-[12px] font-semibold text-n900">
                                                {manualDate
                                                    ? new Date(manualDate + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
                                                    : 'Tarih belirlenmedi'} · {manualTime}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <User className="w-3.5 h-3.5 text-n500" />
                                            <span className="text-[11px] text-n500 font-medium">
                                                {selectedInterviewer?.displayName || currentUser?.displayName || 'Değerlendirici'}
                                            </span>
                                        </div>
                                        {(selectedCandidate?.position || selectedCandidate?.bestTitle) && (
                                            <div className="flex items-center gap-2">
                                                <Briefcase className="w-3.5 h-3.5 text-brand" />
                                                <span className="text-[11px] text-n900 font-semibold truncate">
                                                    {selectedCandidate?.position || selectedCandidate?.bestTitle}
                                                </span>
                                            </div>
                                        )}
                                        <div className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-[0.08em] ${
                                            interviewType === 'technical' ? 'bg-brand-50 text-brand-600' :
                                            interviewType === 'hr' ? 'bg-warn-bg text-warn-text' :
                                            'bg-brand-50 text-brand-600'
                                        }`}>
                                            {interviewType === 'technical' ? 'TEKNİK MÜLAKAT' : interviewType === 'hr' ? 'İK FİLTRE' : 'PRODUCT MÜLAKATI'}
                                        </div>
                                    </div>
                                </div>

                                {/* Participants section in confirmation */}
                                {selectedParticipants.length > 0 && (
                                    <div className="bg-n25 rounded-[14px] border border-n200 p-3 space-y-2.5">
                                        <p className="text-[10px] font-semibold text-n500 uppercase tracking-[0.08em]">Katılımcılar ({selectedParticipants.length})</p>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedParticipants.map(p => (
                                                <div key={p.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
                                                    p.isExternal
                                                        ? 'bg-warn-bg border-warn'
                                                        : 'bg-n0 border-n200'
                                                }`}>
                                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${
                                                        p.isExternal ? 'bg-warn-bg text-warn-text' : 'bg-brand/10 text-brand'
                                                    }`}>
                                                        {p.isExternal ? '@' : (p.name || p.displayName || p.email || '?').charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="text-[11px] font-semibold text-n900">{p.name || p.displayName || p.email}</span>
                                                    <span className={`text-[10px] capitalize ${p.isExternal ? 'text-warn font-semibold' : 'text-n400'}`}>
                                                        {p.isExternal ? 'Harici' : (p.role || '').replace('_', ' ')}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-[10px] text-n400">
                                            {selectedParticipants.some(p => p.isExternal)
                                                ? 'Sistem kullanıcılarına Google Takvim daveti, harici katılımcılara e-posta bildirimi gönderilecek.'
                                                : 'Google Takvim daveti ve bildirim e-postası gönderilecek.'}
                                        </p>
                                    </div>
                                )}

                                {/* AI Score section */}
                                {selectedCandidate && (
                                    <div className="bg-brand-50 rounded-[14px] border border-brand-100 p-3 flex items-center gap-5">
                                        <div className="relative w-16 h-16 flex-shrink-0">
                                            <svg className="w-full h-full -rotate-90">
                                                <circle cx="32" cy="32" r="28" stroke="white" strokeWidth="6" fill="transparent" opacity="0.5" />
                                                <circle cx="32" cy="32" r="28" stroke="#10B981" strokeWidth="6" fill="transparent"
                                                    strokeDasharray="176"
                                                    strokeDashoffset={176 - (176 * (selectedCandidate.bestScore || 0) / 100)}
                                                    strokeLinecap="round" className="transition-all duration-1000" />
                                            </svg>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="text-sm font-semibold text-n900 tabular-nums">%{Math.round(selectedCandidate.bestScore || 0)}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-semibold text-brand uppercase tracking-[0.08em] mb-0.5">AI Aday Analizi</p>
                                            <p className="text-[11px] text-n600 font-medium leading-relaxed italic">
                                                "{selectedCandidate.bestTitle || 'İlgili alan'} deneyimiyle %{Math.round(selectedCandidate.bestScore || 0)} uyum puanı güçlü bir potansiyel sergiliyor."
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Join link preview */}
                                <div className="bg-ok-bg rounded-[14px] px-4 py-3 flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-semibold text-ok uppercase tracking-[0.2em] mb-0.5">Aday Katılım Linki</p>
                                        <span className="text-[11px] font-mono text-ok font-semibold">{window.location.origin}/join/iv-{selectedCandidate?.id?.substring(0,6)}…</span>
                                    </div>
                                    <button
                                        onClick={() => selectedCandidate && navigator.clipboard.writeText(`${window.location.origin}/join/iv-${selectedCandidate.id}-preview`)}
                                        className="p-2 text-ok hover:bg-n0 rounded-md border border-transparent"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* WIZARD FOOTER NAVIGATION */}
                        <div className="px-6 py-3 border-t border-n100 bg-n50/40 flex items-center justify-between">
                            <button
                                onClick={() => {
                                    if (wizardStep === 1) {
                                        setIsPlanningMode(false);
                                        setWizardStep(1);
                                        setSelectedCandidate(null);
                                        setWizardPosition(null);
                                    } else {
                                        setWizardStep(s => s - 1);
                                    }
                                }}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-md text-[12px] font-semibold uppercase tracking-[0.08em] transition-all text-n500 hover:text-n900 hover:bg-n100 border border-n200"
                            >
                                <ChevronLeft className="w-3.5 h-3.5" />
                                {wizardStep === 1 ? 'Vazgeç' : wizardStep === 2 ? 'Aday Seçimi' : wizardStep === 3 ? 'Katılımcılar' : 'Zaman Belirle'}
                            </button>

                            {/* Center summary chip */}
                            <div className="flex items-center gap-2 bg-n0 border border-n200 px-3.5 py-1.5 rounded-full shadow-sm text-[12px]">
                                <div className="w-5 h-5 rounded-full bg-brand/10 text-brand flex items-center justify-center">
                                    <User className="w-3 h-3" />
                                </div>
                                <span className="font-semibold text-n900">{selectedCandidate?.name || '—'}</span>
                                {wizardStep >= 2 && manualDate && (
                                    <>
                                        <span className="text-n300">•</span>
                                        <span className="font-semibold text-brand">
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
                                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-md text-[12px] font-semibold uppercase tracking-[0.08em] bg-brand hover:bg-brand-700 text-white shadow-lg shadow-none/15 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {wizardStep === 1 ? 'Katılımcılar' : wizardStep === 2 ? 'Zaman Belirle' : 'Onayla & Gönder'}
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={openEmailPreview}
                                        disabled={!selectedCandidate}
                                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-md text-[12px] font-semibold uppercase tracking-[0.08em] bg-n0 border-2 border-brand-100 text-brand hover:bg-brand-50 transition-all disabled:opacity-40"
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
                                            className={`flex items-center gap-1.5 px-5 py-2.5 rounded-md text-[12px] font-semibold uppercase tracking-[0.08em] text-white shadow-lg transition-all active:scale-95 disabled:opacity-40 ${
                                                conflictWarning
                                                    ? 'bg-warn hover:bg-warn shadow-none/15'
                                                    : 'bg-ok hover:opacity-90 shadow-none/15'
                                            }`}
                                        >
                                            {conflictWarning ? <AlertTriangle className="w-3.5 h-3.5" /> : <Calendar className="w-3.5 h-3.5" />}
                                            {conflictWarning ? 'Yine de Planla' : 'Mülakatı Planla'}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => createInterviewRecord(null, true)}
                                            disabled={!selectedCandidate}
                                            className="flex items-center gap-1.5 px-5 py-2.5 rounded-md text-[12px] font-semibold uppercase tracking-[0.08em] bg-brand hover:bg-brand-700 text-white shadow-lg shadow-none/15 transition-all active:scale-95 disabled:opacity-40"
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

            {/* ═══ MÜLAKAT LİSTESİ (Infoset) ═══════════════════════════════════
                Takvim görünümü düz listeye çevrildi (onaylanmış karar). Ay
                takvimi tek seferde tek günü gösteriyordu; tablo bütün
                mülakatları sekmelerle gösteriyor. Tarih seçimi kaybolmadı:
                planlama sihirbazının 3. adımında kendi takvimi var. */}
            {!isPlanningMode && (
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* ── Başlık ─────────────────────────────────────────────── */}
                    <div className="h-14 flex-shrink-0 bg-n0 border-b border-n200 px-[18px] flex items-center gap-3.5">
                        <div>
                            <h1 className="text-[15px] font-semibold tracking-[-0.02em] text-n900 m-0">Mülakat Yönetimi</h1>
                            <span className="text-[11px] text-n400">
                                {stats.total} mülakat · {stats.today} bugün
                                {stats.live > 0 ? ` · ${stats.live} canlı` : ''}
                            </span>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            {/* Arama kutusu eskiden dekoratifti (value/onChange yoktu).
                                Artık tabloyu gerçekten süzüyor. */}
                            <div className="relative hidden md:block">
                                <Search className="w-3.5 h-3.5 text-n400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input
                                    type="text"
                                    value={ivSearch}
                                    onChange={(e) => setIvSearch(e.target.value)}
                                    placeholder="Aday veya pozisyon ara…"
                                    className="pl-8 pr-3 py-1.5 text-[11px] border border-n200 rounded-md bg-n50 focus:outline-none focus:border-brand w-44"
                                />
                            </div>
                            {/* Single primary action with grouped sub-actions.
                                Replaces 4 competing buttons (Yüz Yüze / Hızlı Mülakat /
                                Manuel / Yeni Seans). Default click opens the menu;
                                each item runs its own handler. */}
                            <div className="relative" onClick={(e) => e.stopPropagation()}>
                                <button
                                    onClick={() => setNewInterviewMenuOpen(o => !o)}
                                    className="flex items-center gap-1.5 text-[13px] font-semibold text-white bg-brand hover:bg-brand-600 rounded-md px-[13px] py-[7px]"
                                    aria-haspopup="menu"
                                    aria-expanded={newInterviewMenuOpen}
                                >
                                    <Plus className="w-3.5 h-3.5" /> Yeni Mülakat
                                    <ChevronDown className={`w-[13px] h-[13px] transition-transform ${newInterviewMenuOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {newInterviewMenuOpen && (
                                    <div
                                        role="menu"
                                        className="absolute right-0 top-full mt-1.5 w-[308px] bg-n0 rounded-[10px] shadow-lg border border-n200 z-50 p-1.5"
                                    >
                                        <button
                                            role="menuitem"
                                            onClick={() => {
                                                setNewInterviewMenuOpen(false);
                                                setWizardStep(1);
                                                setSelectedCandidate(null);
                                                setManualDate('');
                                                setManualTime('09:00');
                                                setIsPlanningMode(true);
                                            }}
                                            className="w-full flex items-start gap-2.5 px-2.5 py-[9px] rounded-md hover:bg-n50 text-left"
                                        >
                                            <div className="w-7 h-7 rounded-md bg-brand-50 text-brand flex items-center justify-center shrink-0">
                                                <Calendar className="w-3.5 h-3.5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[12px] font-semibold text-n900">Seans Planla</div>
                                                <div className="text-[11px] leading-[1.45] text-n400">Adımlı sihirbaz ile yeni mülakat oluştur</div>
                                            </div>
                                        </button>

                                        <button
                                            role="menuitem"
                                            onClick={() => {
                                                setNewInterviewMenuOpen(false);
                                                setQuickCandidate(null);
                                                setQuickSearch('');
                                                setQuickType('technical');
                                                setQuickModal(true);
                                            }}
                                            className="w-full flex items-start gap-2.5 px-2.5 py-[9px] rounded-md hover:bg-n50 text-left"
                                        >
                                            <div className="w-7 h-7 rounded-md bg-ok-bg text-ok-text flex items-center justify-center shrink-0">
                                                <Play className="w-3.5 h-3.5 fill-current" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[12px] font-semibold text-n900">Hızlı Mülakat Başlat</div>
                                                <div className="text-[11px] leading-[1.45] text-n400">Anında canlı oturum aç</div>
                                            </div>
                                        </button>

                                        <button
                                            role="menuitem"
                                            onClick={() => {
                                                setNewInterviewMenuOpen(false);
                                                setQuickCandidate(null);
                                                setQuickSearch('');
                                                setQuickType('technical');
                                                setQuickModal(true);
                                            }}
                                            className="w-full flex items-start gap-2.5 px-2.5 py-[9px] rounded-md hover:bg-n50 text-left"
                                        >
                                            <div className="w-7 h-7 rounded-md bg-brand-50 text-brand flex items-center justify-center shrink-0">
                                                <User className="w-3.5 h-3.5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[12px] font-semibold text-n900">Yüz Yüze Mülakat</div>
                                                <div className="text-[11px] leading-[1.45] text-n400">Ofiste yapılacak görüşme</div>
                                            </div>
                                        </button>

                                        <div className="border-t border-n100 mt-1 pt-1">
                                            <button
                                                role="menuitem"
                                                onClick={() => {
                                                    setNewInterviewMenuOpen(false);
                                                    setManualInterviewOpen(true);
                                                }}
                                                className="w-full flex items-start gap-2.5 px-2.5 py-[9px] rounded-md hover:bg-n50 text-left"
                                                title="Sistem dışında yapılmış görüşmeyi manuel olarak ekle (telefon, yüzyüze, vb.)"
                                            >
                                                <div className="w-7 h-7 rounded-md bg-n100 text-n600 flex items-center justify-center shrink-0">
                                                    <Plus className="w-3.5 h-3.5" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[12px] font-semibold text-n900">Manuel Görüşme Ekle</div>
                                                    <div className="text-[11px] leading-[1.45] text-n400">
                                                        Sistem dışında yapılmış görüşmeyi kaydet — canlı transkript oluşmaz
                                                    </div>
                                                </div>
                                            </button>

                                            {/* Geçmişe dönük maaş taraması.
                                                Görüşme kaydına DOKUNMAZ, yalnızca eksik
                                                kalan beklenti alanını doldurur — ve
                                                yalnızca kullanıcının onayladığı satırlarda.
                                                Yazma hakkı recruiter'da olduğu için
                                                departman kullanıcısına gösterilmiyor. */}
                                            {!isDepartmentUser && (
                                                <button
                                                    role="menuitem"
                                                    onClick={() => {
                                                        setNewInterviewMenuOpen(false);
                                                        setSalaryBackfillOpen(true);
                                                    }}
                                                    className="w-full flex items-start gap-2.5 px-2.5 py-[9px] rounded-md hover:bg-n50 text-left"
                                                    title="Geçmiş görüşmelerin transkriptinde geçen maaş beklentisini bul ve onayınla kaydet"
                                                >
                                                    <div className="w-7 h-7 rounded-md bg-warn-bg text-warn-text flex items-center justify-center shrink-0">
                                                        <Wallet className="w-3.5 h-3.5" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-[12px] font-semibold text-n900">Maaş Beklentilerini Tara</div>
                                                        <div className="text-[11px] leading-[1.45] text-n400">Geçmiş görüşmelerde eksik kalan beklentiyi tamamla</div>
                                                    </div>
                                                </button>
                                            )}

                                            {/* Bandı TANIMLAMAK, beklentiyi taramaktan
                                                farklı bir iş: biri ilanın bütçesini
                                                yazar, diğeri adayın söylediğini bulur.
                                                Pozisyon yazma hakkı yalnızca
                                                recruiter'da (firestore.rules). */}
                                            {!isDepartmentUser && (
                                                <button
                                                    role="menuitem"
                                                    onClick={() => {
                                                        setNewInterviewMenuOpen(false);
                                                        setSalaryBandOpen(true);
                                                    }}
                                                    className="w-full flex items-start gap-2.5 px-2.5 py-[9px] rounded-md hover:bg-n50 text-left"
                                                    title="Bir pozisyonun bütçe tavanını tanımla — aday beklentisi bununla kıyaslanır"
                                                >
                                                    <div className="w-7 h-7 rounded-md bg-brand-50 text-brand flex items-center justify-center shrink-0">
                                                        <Wallet className="w-3.5 h-3.5" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-[12px] font-semibold text-n900">Maaş Aralığı Tanımla</div>
                                                        <div className="text-[11px] leading-[1.45] text-n400">Pozisyonun bütçe tavanını gir</div>
                                                    </div>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── Tablo + sağ ray ────────────────────────────────────── */}
                    <div className="flex-1 grid grid-cols-1 xl:grid-cols-[1fr_280px] overflow-hidden">

                        {/* SOL: sekmeler + 7 kolonlu tablo ───────────────────── */}
                        <div className="flex flex-col overflow-hidden xl:border-r border-n200 bg-n0">

                            {/* Sekme pill'leri */}
                            <div className="flex items-center gap-2.5 px-[18px] py-[11px] border-b border-n200 flex-shrink-0">
                                <div className="flex items-center gap-0.5 bg-n50 border border-n200 rounded-md p-0.5">
                                    {[
                                        { key: 'all', label: 'Tümü', count: activeInterviews.length + pastInterviews.length },
                                        { key: 'upcoming', label: 'Yaklaşan', count: activeInterviews.length },
                                        { key: 'done', label: 'Tamamlanan', count: pastInterviews.length },
                                        { key: 'cancelled', label: 'İptal', count: cancelledInterviews.length },
                                    ].map(t => {
                                        const on = ivTab === t.key;
                                        return (
                                            <button
                                                key={t.key}
                                                onClick={() => setIvTab(t.key)}
                                                className={`flex items-center gap-1.5 text-[12px] font-semibold px-[11px] py-[5px] rounded ${
                                                    on ? 'bg-n0 text-n900 shadow-sm' : 'text-n500 hover:text-n700'
                                                }`}
                                            >
                                                {t.label}
                                                {t.count !== null && (
                                                    <span className={`text-[12px] font-semibold px-1.5 rounded-full ${
                                                        on ? 'bg-brand-50 text-brand' : 'bg-n100 text-n400'
                                                    }`}>
                                                        {t.count}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* GÖRÜNÜM ANAHTARI — liste mi, takvim mi.
                                    Takvim önce bir sekmeydi ve "Tümü / Yaklaşan"
                                    yanında bir SÜZGEÇ gibi okunuyordu; kullanıcı
                                    takvim ekranını bulamadı. Görünüm seçimi
                                    süzgeçten ayrı bir karar ve Süreç ekranındaki
                                    Kanban/Liste anahtarıyla aynı desende. */}
                                <div className="flex items-center gap-0.5 bg-n50 border border-n200 rounded-md p-0.5">
                                    {[
                                        { key: 'list', label: 'Liste', icon: List },
                                        { key: 'calendar', label: 'Takvim', icon: CalendarDays },
                                    ].map(v => {
                                        const on = ivView === v.key;
                                        return (
                                            <button
                                                key={v.key}
                                                onClick={() => setIvView(v.key)}
                                                className={`flex items-center gap-1.5 text-[12px] font-semibold px-[11px] py-[5px] rounded ${
                                                    on ? 'bg-n0 text-n900 shadow-sm' : 'text-n500 hover:text-n700'
                                                }`}
                                            >
                                                <v.icon className="w-[13px] h-[13px]" /> {v.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Kapsam süzgeci — mevcut özellik, korundu.
                                    Departman kullanıcısı zaten yalnızca kendi
                                    mülakatlarını görebiliyor, seçenek gösterilmiyor. */}
                                {ivView === 'list' && !isDepartmentUser && (
                                    <button
                                        onClick={() => setShowMyInterviews(v => !v)}
                                        className={`ml-auto flex items-center gap-1.5 text-[12px] font-medium border rounded-md px-[11px] py-[5px] ${
                                            showMyInterviews
                                                ? 'bg-brand-50 text-brand border-brand-100'
                                                : 'bg-n50 text-n600 border-n200 hover:bg-n100'
                                        }`}
                                    >
                                        <User className="w-[13px] h-[13px]" /> Benim mülakatlarım
                                    </button>
                                )}
                            </div>

                            {/* TAKVİM SEKMESİ liste yerine geçiyor: aynı kolonlar
                                anlamlı değil — takvim kaydının değerlendiricisi,
                                durumu ya da skoru yok. */}
                            {ivView === 'calendar' && (
                                <InterviewCalendarView
                                    sessions={ivRowsAll}
                                    candidates={enrichedCandidates}
                                    isGoogleConnected={isGoogleConnected}
                                    userId={userId}
                                    userProfile={userProfile}
                                    onOpenSession={takvimOturumAc}
                                    onSessionResult={takvimOturumSonucu}
                                    onPrepare={takvimHazirlik}
                                    onEventResult={takvimSonucGir}
                                    onLink={takvimAdayaBagla}
                                    onConnect={takvimGoogleBagla}
                                />
                            )}

                            {/* Kolon başlıkları */}
                            {ivView !== 'calendar' && (
                            <div className="hidden lg:grid grid-cols-[1.5fr_1.25fr_92px_116px_1fr_104px_128px] items-center px-[18px] py-2 border-b border-n200 bg-n50 text-[11px] font-semibold text-n500 flex-shrink-0">
                                <span>Aday</span>
                                <span>Pozisyon</span>
                                <span>Tür</span>
                                <span>Tarih &amp; saat</span>
                                <span>Değerlendirici</span>
                                <span>Durum</span>
                                <span className="text-right">Aksiyon</span>
                            </div>
                            )}

                            {/* Satırlar */}
                            {ivView !== 'calendar' && (
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {ivRows.length === 0 ? (
                                    <div className="px-[18px] py-14 flex flex-col items-center text-center">
                                        <div className="w-11 h-11 rounded-full bg-n50 flex items-center justify-center mb-2.5">
                                            <Calendar className="w-5 h-5 text-n400" />
                                        </div>
                                        <div className="text-[12px] font-semibold mb-1">
                                            {ivSearch ? 'Aramaya uyan mülakat yok' : 'Bu sekmede mülakat yok'}
                                        </div>
                                        <p className="text-[11px] text-n500 max-w-[260px] m-0">
                                            {ivSearch
                                                ? 'Aday adını veya pozisyonu farklı yazmayı deneyin.'
                                                : 'Yeni Mülakat menüsünden bir seans planlayarak başlayabilirsiniz.'}
                                        </p>
                                    </div>
                                ) : ivRows.map(s => {
                                    const sessionKey = s.id || s.sessionId;
                                    const resolvedCandidateId = s._candidateId || s.candidateId;
                                    const status = s._effectiveStatus || sessionStatuses[sessionKey] || s.status;
                                    const isLive = status === 'live';
                                    const isDone = s._effectiveCompleted || status === 'completed';
                                    const isCancelled = status === 'cancelled';
                                    const chip = ivStatusChip(status, isDone);
                                    const isMenuOpen = openMenuId === sessionKey;
                                    const canModify = !isLive && !isDone;
                                    const isManual = s.mode === 'manual';
                                    // Görüşme skoru — Pipeline ekranıyla AYNI kaynak.
                                    // Manuel görüşmenin `aggregateScore`'u başka bir
                                    // cetvel (kanıt oranı); ikisini aynı yıldıza
                                    // basmak iki ölçüyü karıştırmak olurdu.
                                    const ivScore = Math.round(Number(s.finalScore || s.aiOverallScore) || 0);
                                    const participants = Array.isArray(s.participants) ? s.participants : [];
                                    const openSession = () => {
                                        if (isDone) { navigate(`/interview-report/${sessionKey}`); return; }
                                        if (s.mode === 'face_to_face') { navigate(`/face-interview/${sessionKey}`); return; }
                                        navigate(`/live-interview/${sessionKey}`);
                                    };
                                    // Sonuc girisi YALNIZCA planli kayitlarda: tamamlanmisin
                                    // zaten raporu var, iptal edilenin sonucu yok.
                                    const sonucGirilebilir = !isDone && !isCancelled && !isLive && Boolean(resolvedCandidateId);
                                    const gecti = isSessionPast(s);
                                    const sonucGir = () => {
                                        setOpenMenuId(null);
                                        setManualPrefill({
                                            sessionId: sessionKey,
                                            candidateId: resolvedCandidateId,
                                            positionId: s.positionId || null,
                                            date: s.date || '',
                                            time: s.time || '',
                                            interviewerName: s.interviewerName || s.interviewer || '',
                                            title: s.title || '',
                                        });
                                        setManualInterviewOpen(true);
                                    };
                                    const takvimeEkle = () => {
                                        setOpenMenuId(null);
                                        const ok = downloadInterviewIcs(s, {
                                            candidateName: s.candidateName,
                                            positionTitle: s.positionTitle,
                                            organizer: { name: userProfile?.displayName || '', email: userProfile?.email || '' },
                                        });
                                        if (!ok) window.alert('Bu gorusmede tarih ya da saat yok; takvim dosyasi uretilemedi.');
                                    };
                                    return (
                                        <div
                                            key={sessionKey}
                                            className="grid grid-cols-1 lg:grid-cols-[1.5fr_1.25fr_92px_116px_1fr_104px_128px] items-center gap-y-1 px-[18px] py-2.5 border-b border-n100 text-[12px] hover:bg-n25"
                                            style={isLive ? { background: 'rgba(22,162,108,.05)' } : undefined}
                                        >
                                            {/* Aday */}
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="w-7 h-7 flex-none rounded-full bg-brand-50 text-brand flex items-center justify-center text-[11px] font-semibold">
                                                    {ivInitials(s.candidateName)}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-medium truncate">{s.candidateName || 'Aday'}</div>
                                                    <div className="text-[11px] text-n400">
                                                        {participants.length > 0 ? `+${participants.length} katılımcı` : 'katılımcı yok'}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Pozisyon */}
                                            <div className="min-w-0 text-n600 truncate">
                                                {s.role || s.positionTitle || s.position || '—'}
                                            </div>

                                            {/* Tür — manuel görüşmede transkript uyarısı burada */}
                                            <div className="text-[11px] text-n500">
                                                <div>{IV_TYPE_LABEL[s.interviewType] || IV_TYPE_LABEL[s.type] || 'Görüşme'}</div>
                                                {isManual ? (
                                                    <span
                                                        title="Manuel girildi — canlı transkript yok. Raporda 'manuel girildi' olarak işaretlenir."
                                                        className="inline-flex items-center gap-1 text-[11px] text-warn mt-0.5"
                                                    >
                                                        <AlertCircle className="w-[11px] h-[11px]" /> Transkript yok
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-[11px] text-n400 mt-0.5">
                                                        <Video className="w-[11px] h-[11px]" />
                                                        {s.mode === 'face_to_face' ? 'Yüz yüze' : 'Görüntülü'}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Tarih & saat */}
                                            <div className="text-[11px] text-n600">
                                                <div>{ivDateLabel(s.date)}</div>
                                                <div className="text-[11px] text-n400">{s.time || '—'}</div>
                                            </div>

                                            {/* Değerlendirici */}
                                            <div className="text-[11px] text-n600 truncate">
                                                {s.interviewerName || s.interviewer || '—'}
                                            </div>

                                            {/* Durum */}
                                            <div className="flex items-center gap-1.5">
                                                {isLive && (
                                                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: chip.fg }} />
                                                )}
                                                <span
                                                    className="text-[12px] font-semibold px-2 py-0.5 rounded-full"
                                                    style={{ background: chip.bg, color: chip.fg }}
                                                >
                                                    {chip.label}
                                                </span>
                                            </div>

                                            {/* Aksiyon */}
                                            <div className="flex items-center justify-end gap-2">
                                                {isDone && ivScore > 0 && (
                                                    <span className="text-[11px] font-semibold text-warn">★ {ivScore}</span>
                                                )}
                                                {isCancelled ? (
                                                    <button
                                                        onClick={() => handleUpdateSessionStatus(resolvedCandidateId, sessionKey, 'scheduled')}
                                                        className="text-[12px] font-semibold px-2.5 py-[5px] rounded-md bg-n0 text-n600 border border-n200 hover:bg-n50"
                                                    >
                                                        Yeniden Planla
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={sonucGirilebilir && gecti ? sonucGir : openSession}
                                                        title={sonucGirilebilir && gecti
                                                            ? 'Görüşme yapıldıysa sonucunu buradan girin — başka bir uygulamada yapılmış olabilir'
                                                            : undefined}
                                                        className={`text-[12px] font-semibold px-2.5 py-[5px] rounded-md border ${
                                                            isLive
                                                                ? 'bg-ok text-white border-transparent hover:opacity-90'
                                                                : isDone
                                                                    ? 'bg-n0 text-n600 border-n200 hover:bg-n50'
                                                                    : 'bg-brand text-white border-transparent hover:bg-brand-600'
                                                        }`}
                                                    >
                                                        {/* SAATI GECMIS GORUSMEDE YAPILACAK IS "KATILMAK" DEGIL.
                                                            Gorusme baska bir uygulamada yapilmis olabilir; bu
                                                            ekrandan yapilabilecek tek anlamli sey sonucu girmek. */}
                                                        {isLive ? 'Katıl' : isDone ? 'Rapor' : gecti && sonucGirilebilir ? 'Sonucu gir' : 'Görüntüle'}
                                                    </button>
                                                )}

                                                {/* Ertele / iptal / sil — mevcut satır menüsü.
                                                    Prototipte tek bir CTA var ama bu üç işlem
                                                    başka hiçbir ekrandan yapılamıyor. */}
                                                {!s._fromInvite && (
                                                    <div className="relative">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setOpenMenuId(isMenuOpen ? null : sessionKey); }}
                                                            className={`w-6 h-6 flex items-center justify-center rounded ${
                                                                isMenuOpen ? 'bg-n100 text-n900' : 'text-n400 hover:bg-n50 hover:text-n900'
                                                            }`}
                                                            aria-label="Diğer işlemler"
                                                        >
                                                            <MoreVertical className="w-3.5 h-3.5" />
                                                        </button>
                                                        {isMenuOpen && (
                                                            <div
                                                                className="absolute right-0 top-7 w-44 bg-n0 rounded-[10px] shadow-lg border border-n200 py-1 z-40"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                {sonucGirilebilir && (
                                                                    <button
                                                                        onClick={sonucGir}
                                                                        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-semibold text-n700 hover:bg-n50 text-left"
                                                                    >
                                                                        <ClipboardCheck className="w-3.5 h-3.5" /> Sonucu gir
                                                                    </button>
                                                                )}
                                                                {/* TAKVIM BLOKE ETME - entegrasyon gerektirmeyen yol.
                                                                    Takvim etkinligi yalnizca Google Workspace bagliysa
                                                                    olusuyor; bagli degilse kullanicinin kendi takviminde
                                                                    hicbir iz kalmiyordu. .ics dosyasini Outlook, Apple
                                                                    Takvim ve Google Takvim aciyor. */}
                                                                {!isCancelled && s.date && s.time && (
                                                                    <button
                                                                        onClick={takvimeEkle}
                                                                        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-semibold text-n700 hover:bg-n50 text-left"
                                                                    >
                                                                        <CalendarPlus className="w-3.5 h-3.5" /> Takvimime ekle
                                                                    </button>
                                                                )}
                                                                {canModify && !isCancelled && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setOpenMenuId(null);
                                                                            setPostponeModal({ candidateId: resolvedCandidateId, sessionId: sessionKey, date: s.date || '', time: s.time || '09:00' });
                                                                        }}
                                                                        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-semibold text-warn-text hover:bg-warn-bg text-left"
                                                                    >
                                                                        <AlertCircle className="w-3.5 h-3.5" /> Ertele
                                                                    </button>
                                                                )}
                                                                {canModify && !isCancelled && (
                                                                    <button
                                                                        onClick={async () => {
                                                                            setOpenMenuId(null);
                                                                            if (window.confirm('Bu mülakatı iptal etmek istediğinize emin misiniz?')) {
                                                                                await handleUpdateSessionStatus(resolvedCandidateId, sessionKey, 'cancelled');
                                                                            }
                                                                        }}
                                                                        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-semibold text-bad-text hover:bg-bad-bg text-left"
                                                                    >
                                                                        <AlertTriangle className="w-3.5 h-3.5" /> İptal Et
                                                                    </button>
                                                                )}
                                                                {isCancelled && (
                                                                    <button
                                                                        onClick={async () => {
                                                                            setOpenMenuId(null);
                                                                            await handleUpdateSessionStatus(resolvedCandidateId, sessionKey, 'scheduled');
                                                                        }}
                                                                        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-semibold text-brand hover:bg-brand-50 text-left"
                                                                    >
                                                                        <RefreshCw className="w-3.5 h-3.5" /> Yeniden Planla
                                                                    </button>
                                                                )}
                                                                <div className="my-1 border-t border-n100" />
                                                                <button
                                                                    onClick={() => {
                                                                        setOpenMenuId(null);
                                                                        handleDeleteSession(resolvedCandidateId, sessionKey);
                                                                    }}
                                                                    className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-semibold text-n500 hover:bg-n50 text-left"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" /> Sil
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            )}

                            {/* Sayfalama — gerçek sayfalar, dekoratif değil. */}
                            {ivView !== 'calendar' && (
                            <div className="px-[18px] py-2.5 border-t border-n200 flex items-center text-[11px] text-n500 flex-shrink-0">
                                <span>
                                    {ivRowsAll.length === 0
                                        ? 'Kayıt yok'
                                        : `${ivPage * IV_PAGE_SIZE + 1}–${Math.min(ivRowsAll.length, (ivPage + 1) * IV_PAGE_SIZE)} / ${ivRowsAll.length} mülakat`}
                                </span>
                                <div className="ml-auto flex items-center gap-2">
                                    <button
                                        onClick={() => setIvPage(p => Math.max(0, p - 1))}
                                        disabled={ivPage === 0}
                                        className="text-brand font-medium disabled:text-n300 disabled:cursor-not-allowed"
                                    >
                                        ← Önceki
                                    </button>
                                    <button
                                        onClick={() => setIvPage(p => Math.min(ivPageCount - 1, p + 1))}
                                        disabled={ivPage >= ivPageCount - 1}
                                        className="text-brand font-medium disabled:text-n300 disabled:cursor-not-allowed"
                                    >
                                        Sonraki →
                                    </button>
                                </div>
                            </div>
                            )}
                        </div>

                        {/* SAĞ RAY: bugün + değerlendirici yükü ───────────────── */}
                        <aside className="p-3.5 flex flex-col gap-2 bg-n25 overflow-y-auto custom-scrollbar">
                            <div>
                                <div className="flex items-center justify-between mb-2.5">
                                    <span className="text-[11px] font-semibold text-n500 tracking-[0.08em] uppercase">Bugün</span>
                                    <span className="text-[11px] text-n400">
                                        {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
                                    </span>
                                </div>
                                {todaySessions.length === 0 ? (
                                    <div className="text-[11px] text-n400 py-3">Bugüne planlı mülakat yok.</div>
                                ) : todaySessions.map(s => {
                                    const status = s._effectiveStatus || s.status;
                                    const chip = ivStatusChip(status, s._effectiveCompleted);
                                    return (
                                        <button
                                            key={`today-${s.id}`}
                                            onClick={() => {
                                                if (s._effectiveCompleted) { navigate(`/interview-report/${s.id}`); return; }
                                                navigate(s.mode === 'face_to_face' ? `/face-interview/${s.id}` : `/live-interview/${s.id}`);
                                            }}
                                            className="w-full flex items-center gap-2.5 py-2 border-t border-n100 text-left hover:bg-n50"
                                        >
                                            <span className="w-10 flex-none text-[11px] font-semibold">{s.time || '—'}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[11px] font-medium truncate">{s.candidateName}</div>
                                                <div className="text-[11px] text-n400 truncate">{s.role || '—'}</div>
                                            </div>
                                            <span
                                                className="flex-none text-[12px] font-semibold px-[7px] py-0.5 rounded-full"
                                                style={{ background: chip.bg, color: chip.fg }}
                                            >
                                                {chip.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="h-px bg-n200" />

                            <div>
                                <div className="text-[11px] font-semibold text-n500 tracking-[0.08em] uppercase mb-2.5">
                                    Değerlendirici yükü
                                </div>
                                {reviewerLoad.length === 0 ? (
                                    <div className="text-[11px] text-n400 py-1">Planlı mülakat yok.</div>
                                ) : reviewerLoad.map(r => (
                                    <div key={r.name} className="flex items-center gap-2 py-[5px]">
                                        <span className="flex-1 text-[11px] text-n600 truncate">{r.name}</span>
                                        <span className="text-[11px] font-semibold">{r.count}</span>
                                    </div>
                                ))}
                                <p className="text-[11px] text-n400 mt-2 m-0">
                                    Tamamlanmamış mülakat sayısı.
                                </p>
                            </div>
                        </aside>
                    </div>
                </div>
            )}

                        {/* OVERLAYS */}
            {/* EMAIL PREVIEW MODAL */}
            {isEmailModalOpen && (
                <div className="fixed inset-0 z-[110] bg-n900/80 backdrop-blur-md flex items-center justify-center p-3 animate-in fade-in duration-300">
                    <div className="bg-n0 w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in duration-300">
                        <div className="p-6 border-b border-n100 flex items-center justify-between bg-n50/50">
                            <div className="flex items-center gap-2">
                                <div className="w-10 h-10 rounded-[14px] bg-brand-100/50 text-brand flex items-center justify-center">
                                    <Mail className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-[13px] font-semibold text-n900 uppercase tracking-tight">Davet E-Postası Taslağı</h3>
                                    <p className="text-[11px] text-n500 font-semibold uppercase tracking-[0.08em]">{selectedCandidate?.email}</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setIsEmailModalOpen(false)}
                                className="w-8 h-8 rounded-md hover:bg-n100 flex items-center justify-center text-n400"
                            >
                                <ChevronDown className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-semibold text-n500 uppercase tracking-[0.08em] px-1">Konu Satırı</label>
                                <input 
                                    type="text"
                                    value={emailSubject}
                                    onChange={(e) => setEmailSubject(e.target.value)}
                                    className="w-full bg-n25 border border-n200 rounded-md px-4 py-3 text-[13px] font-semibold text-n900 outline-none focus:border-brand transition-all"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-semibold text-n500 uppercase tracking-[0.08em] px-1">Mesaj İçeriği</label>
                                <textarea 
                                    value={emailBody}
                                    onChange={(e) => setEmailBody(e.target.value)}
                                    rows={10}
                                    className="w-full bg-n25 border border-n200 rounded-md px-4 py-3 text-[12px] font-medium text-n600 leading-relaxed outline-none focus:border-brand transition-all resize-none"
                                />
                            </div>
                        </div>

                        <div className="p-6 bg-n50 border-t border-n100 flex items-center justify-end gap-2">
                            <button 
                                onClick={() => setIsEmailModalOpen(false)}
                                className="px-6 py-2.5 rounded-md text-[12px] font-semibold text-n500 hover:bg-n100 transition-all uppercase tracking-[0.08em]"
                            >
                                İptal
                            </button>
                            <button 
                                onClick={handleSendEmail}
                                disabled={isSendingEmail}
                                className="px-8 py-2.5 bg-brand text-white rounded-md text-[12px] font-semibold uppercase tracking-[0.08em] hover:bg-brand-700 transition-all shadow-lg shadow-none/10 flex items-center gap-2"
                            >
                                {isSendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} ŞİMDİ GÖNDER
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {saveStatus !== 'idle' && (
                <div className="fixed inset-0 z-[100] bg-n900/80 backdrop-blur-md flex items-center justify-center animate-in fade-in duration-300">
                    <div className="bg-n0 p-10 rounded-[42px] shadow-2xl flex flex-col items-center text-center gap-6 max-w-sm animate-in zoom-in duration-300">
                        <div className={`w-16 h-16 rounded-[14px] flex items-center justify-center transition-all duration-500 ${saveStatus === 'success' ? 'bg-ok scale-110 shadow-xl shadow-none/20' : 'bg-brand-50'}`}>
                            {saveStatus === 'saving' ? <Loader2 className="w-8 h-8 text-brand-600 animate-spin" /> : <Check className="w-8 h-8 text-white" />}
                        </div>
                        <div>
                             <h3 className="text-xl font-semibold text-n900 tracking-tight">{saveStatus === 'success' ? 'Başarılı!' : 'İşlem Yapılıyor'}</h3>
                             <p className="text-[12px] text-n500 mt-1">{saveStatus === 'success' ? 'Kayıt güncellendi ve davetler gönderildi.' : 'Birimler senkronize ediliyor...'}</p>
                        </div>
                    </div>
                </div>
            )}
    
            {/* Postpone Modal */}
            {postponeModal && (
                <div className="fixed inset-0 z-[120] bg-n900/70 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in duration-200">
                    <div className="bg-n0 w-full max-w-md rounded-[14px] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                        <div className="flex items-center justify-between p-3.5 border-b border-n100 bg-warn-bg/60">
                            <div className="flex items-center gap-2">
                                <div className="w-9 h-9 rounded-md bg-warn-bg flex items-center justify-center">
                                    <AlertCircle className="w-4.5 h-4.5 text-warn" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-n900 uppercase tracking-tight">Mülakatı Ertele</h3>
                                    <p className="text-[11px] text-n500">Yeni tarih ve saat belirleyin</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setPostponeModal(null)}
                                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-n100 text-n400"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-n900 mb-1.5 uppercase tracking-wide">Yeni Tarih</label>
                                <input
                                    type="date"
                                    value={postponeModal.date}
                                    min={new Date().toISOString().split('T')[0]}
                                    onChange={(e) => setPostponeModal(m => ({ ...m, date: e.target.value }))}
                                    className="w-full border border-n200 rounded-md px-3 py-2.5 text-sm text-n900 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-n900 mb-1.5 uppercase tracking-wide">Yeni Saat</label>
                                <input
                                    type="time"
                                    value={postponeModal.time}
                                    onChange={(e) => setPostponeModal(m => ({ ...m, time: e.target.value }))}
                                    className="w-full border border-n200 rounded-md px-3 py-2.5 text-sm text-n900 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-2 px-6 pb-6">
                            <button
                                onClick={() => setPostponeModal(null)}
                                className="flex-1 py-2.5 border border-n200 text-n500 text-sm font-semibold rounded-md hover:bg-n50 transition-colors"
                            >
                                Vazgeç
                            </button>
                            <button
                                disabled={!postponeModal.date || !postponeModal.time}
                                onClick={async () => {
                                    await handleUpdateSessionStatus(
                                        postponeModal.candidateId,
                                        postponeModal.sessionId,
                                        'postponed',
                                        postponeModal.date,
                                        postponeModal.time,
                                    );
                                    setPostponeModal(null);
                                }}
                                className="flex-1 py-2.5 bg-warn hover:opacity-90 text-white text-sm font-semibold rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Ertele
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── HIZLI MÜLAKAT BAŞLAT MODALI ──────────────────────────────── */}
            {quickModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-3">
                    <div className="bg-n0 rounded-[14px] shadow-2xl border border-n200 w-full max-w-md">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-3 border-b border-n200">
                            <div className="flex items-center gap-2">
                                <Play className="w-4 h-4 text-ok fill-ok" />
                                <h3 className="text-[12px] font-semibold text-n900 uppercase tracking-[0.08em]">Hızlı Mülakat Başlat</h3>
                            </div>
                            <button onClick={() => setQuickModal(false)} className="p-1 text-n400 hover:text-n600 rounded-md hover:bg-n50">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="px-6 py-5 space-y-4">
                            {/* Candidate search */}
                            <div>
                                <label className="text-[10px] font-semibold text-n400 uppercase tracking-[0.08em] block mb-1.5">Aday Seç</label>
                                <div className="relative">
                                    <Search className="w-3.5 h-3.5 text-n400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="İsim veya pozisyon ara..."
                                        value={quickSearch}
                                        onChange={e => { setQuickSearch(e.target.value); setQuickCandidate(null); }}
                                        className="w-full pl-9 pr-4 py-2.5 border border-n200 rounded-md text-[11px] text-n700 outline-none focus:border-ok focus:ring-2 focus:ring-ok-bg transition-all"
                                    />
                                </div>

                                {/* Candidate dropdown */}
                                {quickSearch.length >= 1 && !quickCandidate && (() => {
                                    const q = quickSearch.toLowerCase();
                                    const hits = (enrichedCandidates || []).filter(c =>
                                        c.name?.toLowerCase().includes(q) || c.position?.toLowerCase().includes(q)
                                    ).slice(0, 6);
                                    return hits.length > 0 ? (
                                        <div className="mt-1 border border-n200 rounded-md overflow-hidden shadow-lg">
                                            {hits.map(c => (
                                                <button
                                                    key={c.id}
                                                    onClick={() => { setQuickCandidate(c); setQuickSearch(c.name); }}
                                                    className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-ok-bg transition-colors text-left border-b border-n200 last:border-0"
                                                >
                                                    <div className="w-7 h-7 rounded-full bg-ok-bg flex items-center justify-center text-[10px] font-semibold text-ok-text shrink-0">
                                                        {c.name?.[0]?.toUpperCase() || '?'}
                                                    </div>
                                                    <div>
                                                        <p className="text-[11px] font-semibold text-n700">{c.name}</p>
                                                        <p className="text-[10px] text-n400">{c.position || '—'}</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-[11px] text-n400 px-2 py-2">Aday bulunamadı.</p>
                                    );
                                })()}

                                {/* Selected candidate badge */}
                                {quickCandidate && (
                                    <div className="mt-2 flex items-center gap-2 bg-ok-bg border border-transparent rounded-md px-3 py-2">
                                        <div className="w-7 h-7 rounded-full bg-ok flex items-center justify-center text-[10px] font-semibold text-white shrink-0">
                                            {quickCandidate.name?.[0]?.toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-semibold text-n700 truncate">{quickCandidate.name}</p>
                                            <p className="text-[10px] text-n400">{quickCandidate.position || '—'}</p>
                                        </div>
                                        <button onClick={() => { setQuickCandidate(null); setQuickSearch(''); }} className="text-n300 hover:text-bad">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Interview type */}
                            <div>
                                <label className="text-[10px] font-semibold text-n400 uppercase tracking-[0.08em] block mb-1.5">Mülakat Tipi</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { value: 'technical', label: 'Teknik' },
                                        { value: 'hr', label: 'İK Filtre' },
                                        { value: 'product', label: 'Product' },
                                    ].map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => setQuickType(opt.value)}
                                            className={`py-2 rounded-md text-[11px] font-semibold border transition-all ${
                                                quickType === opt.value
                                                    ? 'bg-ok border-ok text-white shadow-sm'
                                                    : 'bg-n0 border-n200 text-n600 hover:border-ok hover:bg-ok-bg'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Position selection */}
                            <div>
                                <label className="text-[10px] font-semibold text-n400 uppercase tracking-[0.08em] block mb-1.5">Pozisyon (İsteğe Bağlı)</label>
                                {openPositions.length > 0 ? (
                                    <select
                                        value={quickPosition?.id || ''}
                                        onChange={e => setQuickPosition(openPositions.find(p => p.id === e.target.value) || null)}
                                        className="w-full border border-n200 rounded-md px-3 py-2.5 text-[12px] text-n700 outline-none focus:border-ok focus:ring-2 focus:ring-ok-bg bg-n0"
                                    >
                                        <option value="">Pozisyon seçin...</option>
                                        {openPositions.map(p => (
                                            <option key={p.id} value={p.id}>{p.title}{p.department ? ` — ${p.department}` : ''}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        type="text"
                                        placeholder="Pozisyon adı girin..."
                                        value={quickPosition?.title || ''}
                                        onChange={e => setQuickPosition(e.target.value ? { title: e.target.value } : null)}
                                        className="w-full border border-n200 rounded-md px-3 py-2.5 text-[12px] text-n700 outline-none focus:border-ok focus:ring-2 focus:ring-ok-bg bg-n0 placeholder:text-n400"
                                    />
                                )}
                            </div>

                            {/* Action buttons */}
                            <div className="flex gap-2 pt-1">
                                <button
                                    onClick={() => { setQuickModal(false); setQuickPosition(null); }}
                                    className="h-10 px-3 rounded-md text-[12px] font-semibold text-n500 border border-n200 hover:bg-n50 transition-all"
                                >
                                    İptal
                                </button>
                                <button
                                    onClick={handleFaceToFaceStart}
                                    disabled={!quickCandidate || faceToFaceLoading || quickLoading}
                                    className="flex-1 h-10 rounded-md text-[11px] font-semibold text-white bg-brand hover:bg-brand-600 flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {faceToFaceLoading ? (
                                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Başlatılıyor...</>
                                    ) : (
                                        <><User className="w-3.5 h-3.5" /> Yüz Yüze</>
                                    )}
                                </button>
                                <button
                                    onClick={handleQuickStart}
                                    disabled={!quickCandidate || quickLoading || faceToFaceLoading}
                                    className="flex-1 h-10 rounded-md text-[11px] font-semibold text-white bg-ok hover:opacity-90 flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {quickLoading ? (
                                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Başlatılıyor...</>
                                    ) : (
                                        <><Play className="w-3.5 h-3.5 fill-current" /> Video Mülakat</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        <AddManualInterviewModal
            open={manualInterviewOpen}
            onClose={() => { setManualInterviewOpen(false); setManualPrefill(null); }}
            candidates={enrichedCandidates}
            positions={positions}
            currentUser={userProfile || currentUser}
            prefill={manualPrefill}
            onCreated={() => {
                // Listener on /interviews picks up the new doc automatically
                // — no manual refresh needed. Just close the modal.
            }}
        />

        <SalaryBackfillModal
            open={salaryBackfillOpen}
            onClose={() => setSalaryBackfillOpen(false)}
            candidates={enrichedCandidates}
            uid={userId}
        />

        <SalaryBandModal
            open={salaryBandOpen}
            onClose={() => setSalaryBandOpen(false)}
        />
    </div>
    );
}
