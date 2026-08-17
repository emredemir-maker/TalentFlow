// src/pages/CandidateProcessPage.jsx
import { analysisScoreFor } from '../utils/positionScore';
import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import { useAuth } from '../context/AuthContext';
import { parseExperiencesFromText, parseCandidateFromText } from '../services/geminiService';
import { deepScanCandidate, rescanCandidateForPosition } from '../services/scanService';
import { isStaleFor } from '../utils/positionRequirements';
import { usesCurrentRubric } from '../utils/coverageDetail';
import { extractTextFromFile } from '../services/cvParser';
import { calculateMatchScore, domainLabel, detectCandidateDomain, detectPositionDomain } from '../services/matchService';
import { applyPiiMask, stripPiiForAI } from '../utils/pii';
import { cleanRoleText, analysisForPosition, fullAnalysisForPosition } from '../utils/candidateTable';
import { mustHaveGate, gateLabel, gateRank } from '../utils/mustHaveGate';
import { formatBytes, totalBytes, oversizedFiles, MAX_SOURCE_BYTES, MAX_SOURCES } from '../utils/bulkUpload';
import { uploadBulkSources } from '../services/bulkStorageUpload';
import { getFeedbackEmail } from '../utils/templateService';
import { db } from '../config/firebase';
import { doc, getDoc, getDocs, onSnapshot, setDoc, serverTimestamp, collection, query, where } from 'firebase/firestore';
import Header from '../components/Header';
import SystemScanner from '../components/SystemScanner';
import AddCandidateModal from '../components/AddCandidateModal';
import CandidateAvatar from '../components/CandidateAvatar';
import CandidateCvPanel from '../components/CandidateCvPanel';
import ScoreBreakdownPanel from '../components/ScoreBreakdownPanel';
import InterviewPlanPanel from '../components/InterviewPlanPanel';
import InterviewOutcomePanel from '../components/InterviewOutcomePanel';
import { aiErrorHint } from '../utils/aiErrorHint';
import MustHaveBadge from '../components/MustHaveBadge';
import StarEvidenceCards from '../components/StarEvidenceCards';
import { starPercent } from '../utils/starDimensions';
import {
    Plus, Search, Zap, Brain, X,
    Target, ShieldCheck, ArrowRight, FileText, Clock,
    AlertCircle, Trophy, Calendar, Edit3,
    CheckCircle2, Link2, ExternalLink, Video, Play, Award, User, Mail,
    ChevronRight, ChevronDown, BarChart2, MessageSquare, XCircle, Send, Loader2,
    Sparkles, Trash2, RefreshCw, Layers, TrendingUp, Upload, FileQuestion, AlertTriangle
} from 'lucide-react';

const STATUS_CONFIG = {
    live:       { label: 'CANLI',      bg: 'bg-rose-50',    text: 'text-rose-600',    border: 'border-rose-100',    pulse: true },
    completed:  { label: 'TAMAMLANDI', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', pulse: false },
    cancelled:  { label: 'İPTAL',      bg: 'bg-slate-100',  text: 'text-slate-500',   border: 'border-slate-200',   pulse: false },
    scheduled:  { label: 'PLANLANDI',  bg: 'bg-amber-50',   text: 'text-amber-600',   border: 'border-amber-100',   pulse: false },
};
const getStatusCfg = (s) => STATUS_CONFIG[s] || STATUS_CONFIG.scheduled;

const PIPELINE_STATUS_LABELS = {
    new:         'AI Analiz',
    ai_analysis: 'AI Analiz',
    review:      'İnceleme',
    interview:   'Mülakat',
    offer:       'Teklif',
    hired:       'İşe Alındı',
    rejected:    'Red',
    final:       'Final',
};

// Ordered pipeline stages for the full status selector
// Canonical pipeline palette (see utils/pipelineStages):
// Ön Eleme=cyan · İnceleme=teal · Mülakat=violet · Teklif=amber · İşe Alındı=emerald · Reddedildi=red
const PIPELINE_STAGES = [
    { value: 'ai_analysis', label: 'AI Analiz',   color: 'text-cyan-600',   bg: 'bg-cyan-50' },
    { value: 'review',      label: 'İnceleme',     color: 'text-teal-600',   bg: 'bg-teal-50' },
    { value: 'interview',   label: 'Mülakat',      color: 'text-violet-600', bg: 'bg-violet-50' },
    { value: 'offer',       label: 'Teklif',       color: 'text-amber-600',  bg: 'bg-amber-50' },
    { value: 'hired',       label: 'İşe Alındı',   color: 'text-emerald-600',bg: 'bg-emerald-50' },
    { value: 'rejected',    label: 'Reddedildi',   color: 'text-red-600',    bg: 'bg-red-50' },
];

const normalizePipelineStatus = (s) => (s === 'new' ? 'ai_analysis' : s);

export default function CandidateProcessPage() {
    const navigate = useNavigate();
    const { enrichedCandidates, viewCandidateId, setViewCandidateId, sourceColors, setPreselectedInterviewData, updateCandidate, deleteCandidate, addCandidate } = useCandidates();
    const { positions } = usePositions();
    const { user, userProfile, isSuperAdmin, role } = useAuth();
    const candidates = enrichedCandidates || [];
    const [searchQuery, setSearchQuery]   = useState('');
    const [activeTab, setActiveTab]       = useState('ai_analysis');
    const [migrateStatus, setMigrateStatus] = useState(null); // null | 'running' | 'done'
    const [showFilters, setShowFilters]   = useState(false);
    const [filterSource, setFilterSource] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterPosition, setFilterPosition] = useState('');
    const [filterMinScore, setFilterMinScore] = useState(0);

    // ── Modal states ──────────────────────────────────────────────────────────
    const [commentModal, setCommentModal] = useState(false);
    const [commentText, setCommentText]   = useState('');
    const [rejectModal, setRejectModal]   = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [finalModal, setFinalModal]     = useState(false);
    const [deleteModal, setDeleteModal]   = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [actionSuccess, setActionSuccess] = useState(null); // 'comment' | 'reject' | 'final' | 'stage'
    const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
    const [analyzingIds, setAnalyzingIds]       = useState(new Set());
    const [analysisError, setAnalysisError]     = useState(null);
    const [isAddModalOpen, setIsAddModalOpen]   = useState(false);
    const [reparsingCareer, setReparsingCareer] = useState(false);

    // Bulk import modal
    const [bulkImportModal, setBulkImportModal] = useState(false);
    const [bulkFiles, setBulkFiles]             = useState([]);
    const [bulkPositionId, setBulkPositionId]   = useState('');
    const [bulkImporting, setBulkImporting]     = useState(false);
    const [bulkProgress, setBulkProgress]       = useState({ total: 0, completed: 0, failed: 0, items: [], avgScore: null, status: null });
    // Storage'a yükleme oranı — iş henüz oluşmadığı için Firestore'da karşılığı
    // yok. { transferred, total, done } ya da null (yükleme sürmüyor).
    const [bulkUploadProgress, setBulkUploadProgress] = useState(null);
    // Multiple job ids: uploads are split into <28MB batches (Cloud Functions
    // caps requests at 32MB) and each batch becomes its own backend job.
    const [bulkJobIds, setBulkJobIds]           = useState([]);
    const [bulkToast, setBulkToast]             = useState(null);
    const [bulkTab, setBulkTab]                 = useState('files');
    const [bulkJsonText, setBulkJsonText]       = useState('');

    // Unified "Adaya Mesaj Gönder" modal (Geri Bildirim + Bilgi İste)
    const [feedbackModal, setFeedbackModal]         = useState(false);
    const [msgTab, setMsgTab]                       = useState('feedback'); // 'feedback' | 'info'
    const [feedbackOutcome, setFeedbackOutcome]     = useState('positive');
    const [feedbackText, setFeedbackText]           = useState('');
    const [feedbackLoading, setFeedbackLoading]     = useState(false);
    const [feedbackAiLoading, setFeedbackAiLoading] = useState(false);
    const [feedbackSuccess, setFeedbackSuccess]     = useState(false);
    const [infoMessage, setInfoMessage]             = useState('');
    const [infoItems, setInfoItems]                 = useState([]);
    const [newInfoItem, setNewInfoItem]             = useState('');
    const [infoSending, setInfoSending]             = useState(false);
    const [candidateInfoReqs, setCandidateInfoReqs] = useState([]);
    const [infoReqsLoading, setInfoReqsLoading]     = useState(false);

    // Branding — loaded once from Firestore for email template generation
    const [branding, setBranding] = useState({ companyName: 'Talent-Inn', primaryColor: '#13294E' });
    useEffect(() => {
        getDoc(doc(db, 'artifacts/talent-flow/public/data/settings', 'branding'))
            .then(snap => { if (snap.exists()) setBranding(snap.data()); })
            .catch(() => {});
    }, []);

    // Real-time Firestore subscription for active bulk import job(s).
    // A single upload may enqueue several jobs (size-based batching), so the
    // effect listens to every job doc and aggregates their counters into one
    // progress view. Completion fires only when EVERY job has finished.
    useEffect(() => {
        if (!bulkJobIds.length || !db) return;
        const jobData = new Map();
        let toastShown = false;
        // recompute, jobData'daki mevcut durumdan toplam ilerlemeyi türetir.
        // Hem normal snapshot'lar hem hata/eksik-doküman yolları bunu çağırır;
        // böylece tek bir job okunamasa bile allDone çözülür ve modal asla
        // veri bekleyerek kilitli kalmaz.
        const recompute = () => {
                const jobs = Array.from(jobData.values());
                const total = jobs.reduce((s, d) => s + (d.totalCount || 0), 0);
                const completed = jobs.reduce((s, d) => s + (d.processedCount || 0), 0);
                const failed = jobs.reduce((s, d) => s + (d.failedCount || 0), 0);
                const duplicates = jobs.reduce((s, d) => s + (d.duplicateCount || 0), 0);
                const allDone = jobData.size === bulkJobIds.length &&
                    jobs.every(d => d.status === 'completed' || d.status === 'error');
                // 'unpacking' ayrı gösterilir: arşiv açılırken toplam sayı
                // henüz büyümektedir ve "0/0 kuyrukta" yazmak, sistemin o an
                // yaptığı işi gizlemek olurdu.
                const status = allDone ? 'completed'
                    : jobs.some(d => d.status === 'processing') ? 'processing'
                    : jobs.some(d => d.status === 'unpacking') ? 'unpacking' : 'queued';
                // Weighted average over jobs that reported a score
                const scored = jobs.filter(d => d.avgScore != null && (d.processedCount || 0) > 0);
                const scoredCount = scored.reduce((s, d) => s + (d.processedCount || 0), 0);
                const avgScore = scoredCount > 0
                    ? Math.round(scored.reduce((s, d) => s + d.avgScore * (d.processedCount || 0), 0) / scoredCount)
                    : null;
                const avgScoreByPosition = jobs.reduce((acc, d) => (
                    d.avgScoreByPosition ? { ...acc, ...d.avgScoreByPosition } : acc
                ), {});
                setBulkProgress(prev => ({
                    ...prev,
                    total,
                    completed,
                    failed,
                    duplicates,
                    avgScore,
                    avgScoreByPosition: Object.keys(avgScoreByPosition).length ? avgScoreByPosition : null,
                    status,
                }));
                if (allDone && !toastShown) {
                    toastShown = true;
                    try { localStorage.removeItem('bulkActiveJobs'); } catch { /* storage unavailable */ }
                    setBulkImporting(false);
                    setBulkToast({
                        total,
                        completed,
                        failed,
                        duplicates,
                        avgScore,
                        avgScoreByPosition: Object.keys(avgScoreByPosition).length ? avgScoreByPosition : null,
                        positionTitle: jobs[0]?.positionTitle || '',
                    });
                    setTimeout(() => setBulkToast(null), 12000);
                }
        };
        const unsubs = bulkJobIds.map((jobId) =>
            onSnapshot(
                doc(db, `artifacts/talent-flow/public/data/bulkImportJobs/${jobId}`),
                (snap) => {
                    // Silinmiş/bulunamayan job takibi kilitlemesin — sıfır
                    // katkılı "tamamlanmış" sayılır.
                    jobData.set(jobId, snap.exists() ? snap.data() : { status: 'completed', totalCount: 0, processedCount: 0, failedCount: 0 });
                    recompute();
                },
                (err) => {
                    // Okuma hatası (ör. izin değişikliği): job'ı hatalı-bitmiş
                    // say ki diğer job'lar ve kapanış mantığı ilerleyebilsin.
                    console.error('[Bulk] job listener error:', jobId, err);
                    jobData.set(jobId, { status: 'error', totalCount: 0, processedCount: 0, failedCount: 0 });
                    recompute();
                }
            )
        );
        return () => unsubs.forEach(u => u());
    }, [bulkJobIds]);

    // Keepalive long-poll while a bulk job is running. Cloud Functions gives
    // background work (the bulk worker loop) real CPU only while an HTTP
    // request is in flight and kills idle instances — without this, a large
    // job crawls or stalls (e.g. frozen at 34/455) as soon as the upload
    // requests finish. Chaining ?wait=1 long-polls (~20s server-side hold)
    // keeps the instance awake and un-throttled until every job completes.
    // Progress numbers still come from the Firestore listener above.
    useEffect(() => {
        if (!bulkImporting || bulkJobIds.length === 0) return;
        let stopped = false;
        (async () => {
            let jobIdx = 0;
            while (!stopped && jobIdx < bulkJobIds.length) {
                try {
                    const tok = await user?.getIdToken?.() || '';
                    const resp = await fetch(`/api/bulk-import/${bulkJobIds[jobIdx]}?wait=1`, {
                        headers: { 'Authorization': `Bearer ${tok}` },
                    });
                    const data = await resp.json().catch(() => ({}));
                    if (resp.ok && (data.status === 'completed' || data.status === 'error')) {
                        jobIdx++; // this job is done — keep the next one awake
                    } else if (!resp.ok) {
                        await new Promise(r => setTimeout(r, 10000)); // backoff on 4xx/5xx
                    }
                    // NO delay on the happy path: background tabs throttle
                    // setTimeout to ≥1/min, so a 2s gap here became a ~60s
                    // CPU-starved stall between long-polls (observed as one
                    // CV "taking 5+ minutes"). Back-to-back chaining is only
                    // ~3 req/min thanks to the ~20s server-side hold.
                } catch {
                    if (!stopped) await new Promise(r => setTimeout(r, 10000)); // network hiccup
                }
            }
        })();
        return () => { stopped = true; };
    }, [bulkImporting, bulkJobIds, user]);

    // Resume tracking after a page reload: any unfinished bulk job this user
    // created is picked up straight from Firestore when the page opens — no
    // client-side state survives a reload, and without re-attaching, the
    // keepalive chain drops and a half-done job goes back to crawling.
    // Firestore is the SINGLE authority here. (An earlier localStorage
    // fallback could resurrect ids of finished/deleted jobs and freeze the
    // modal at 0/0 waiting for data that would never arrive.)
    useEffect(() => {
        if (!user?.uid) return;
        (async () => {
            try {
                // Single-field query (auto-indexed); status filtered client-side
                // to avoid needing a composite Firestore index.
                const snap = await getDocs(query(
                    collection(db, 'artifacts/talent-flow/public/data/bulkImportJobs'),
                    where('createdBy', '==', user.uid)
                ));
                const active = snap.docs
                    .filter(d => ['queued', 'processing', 'unpacking'].includes(d.data().status))
                    .sort((a, b) => (a.data().createdAt?.toMillis?.() || 0) - (b.data().createdAt?.toMillis?.() || 0))
                    .map(d => d.id);
                if (active.length > 0) {
                    setBulkJobIds(prev => (prev.length ? prev : active));
                    setBulkImporting(true);
                } else {
                    try { localStorage.removeItem('bulkActiveJobs'); } catch { /* storage unavailable */ }
                }
            } catch (err) {
                console.error('[Bulk] resume query failed:', err);
            }
        })();
    }, [user?.uid]);

    const showSuccess = (type) => {
        setActionSuccess(type);
        setTimeout(() => setActionSuccess(null), 3000);
    };

    const legacyNewCandidates = candidates.filter(c => c.status === 'new');

    const handleMigrateNewStatus = async () => {
        if (migrateStatus === 'running' || legacyNewCandidates.length === 0) return;
        setMigrateStatus('running');
        try {
            await Promise.all(legacyNewCandidates.map(c => updateCandidate(c.id, { status: 'ai_analysis' })));
            setMigrateStatus('done');
        } catch (err) {
            console.error('Migration error:', err);
            setMigrateStatus(null);
        }
    };

    const handleReparseCareer = async () => {
        if (!candidate || reparsingCareer) return;
        const text = candidate.cvText || candidate.cvData;
        if (!text || text.length < 30) return;
        setReparsingCareer(true);
        try {
            const experiences = await parseExperiencesFromText(text);
            if (experiences.length > 0) {
                await updateCandidate(candidate.id, { experiences });
            }
        } catch (err) {
            console.error('Career reparse error:', err);
        } finally {
            setReparsingCareer(false);
        }
    };

    const handleComment = async () => {
        if (!commentText.trim() || !candidate) return;
        setActionLoading(true);
        try {
            const prev = Array.isArray(candidate.hrComments) ? candidate.hrComments : [];
            await updateCandidate(candidate.id, {
                hrComments: [...prev, {
                    text: commentText.trim(),
                    author: user?.displayName || user?.email || 'HR',
                    createdAt: new Date().toISOString(),
                }]
            });
            setCommentText('');
            setCommentModal(false);
            showSuccess('comment');
        } finally {
            setActionLoading(false);
        }
    };

    const handleReject = async () => {
        if (!candidate) return;
        setActionLoading(true);
        try {
            await updateCandidate(candidate.id, {
                status: 'rejected',
                rejectionReason: rejectReason.trim() || null,
                rejectedAt: new Date().toISOString(),
                rejectedBy: user?.displayName || user?.email || 'HR',
            });
            setRejectReason('');
            setRejectModal(false);
            showSuccess('reject');
        } finally {
            setActionLoading(false);
        }
    };

    const handleFinal = async () => {
        if (!candidate) return;
        setActionLoading(true);
        try {
            await updateCandidate(candidate.id, {
                status: 'final',
                finalizedAt: new Date().toISOString(),
                finalizedBy: user?.displayName || user?.email || 'HR',
            });
            setFinalModal(false);
            showSuccess('final');
        } finally {
            setActionLoading(false);
        }
    };

    const handleGenerateFeedbackText = async () => {
        if (!candidate) return;
        setFeedbackAiLoading(true);
        try {
            const safeCandidate = stripPiiForAI(candidate);
            const outcomeWord = feedbackOutcome === 'positive' ? 'olumlu' : feedbackOutcome === 'negative' ? 'olumsuz' : 'beklemede';
            const prompt = `Sen deneyimli bir İK uzmanısın. Bir adayın başvurusu ${outcomeWord} sonuçlanmıştır. Bu adayın profil bilgileri: pozisyon başvurusu: ${safeCandidate.appliedPosition || safeCandidate.position || 'belirtilmemiş'}, eşleşme skoru: ${safeCandidate.matchScore ?? '-'}/100. Adaya gönderilecek, profesyonel, empatik ve kısa (3-4 cümle) bir geri bildirim e-postası metni yaz. Selamlama veya imza ekleme, sadece geri bildirim paragrafını yaz. Türkçe yaz.`;
            // Sunucu üzerinden Gemini proxy'sini kullan — API anahtarı tarayıcıya sızmaz
            const res = await fetch('/api/ai/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, mimeType: 'text/plain' })
            });
            if (!res.ok) {
                throw new Error(`AI isteği başarısız: ${res.status}`);
            }
            const { text } = await res.json();
            if (text) setFeedbackText(String(text).trim());
        } catch (err) {
            console.error('Feedback AI error:', err);
        } finally {
            setFeedbackAiLoading(false);
        }
    };

    const handleSendFeedback = async () => {
        if (!candidate || !feedbackText.trim()) return;
        setFeedbackLoading(true);
        try {
            const recruiterName = user?.displayName || user?.email || 'İK Ekibi';
            const position = candidate.position || candidate.bestTitle || '';
            const trimmedText = feedbackText.trim();

            let emailHtml = null;
            try {
                const { html } = await getFeedbackEmail(branding, {
                    candidateName: candidate.name,
                    recruiterName,
                    position,
                    outcome: feedbackOutcome,
                    feedbackText: trimmedText,
                    companyEmail: user?.email || null,
                });
                emailHtml = html;
            } catch { /* fallback: let backend build its own HTML */ }

            const fbAuthTok = await user?.getIdToken?.() || '';
            const res = await fetch('/api/send-feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${fbAuthTok}` },
                body: JSON.stringify({
                    to: candidate.email,
                    candidateName: candidate.name,
                    recruiterName,
                    position,
                    outcome: feedbackOutcome,
                    feedbackText: trimmedText,
                    html: emailHtml,
                })
            });
            const data = await res.json();
            if (data.success) {
                setFeedbackSuccess(true);
                setTimeout(() => {
                    setFeedbackModal(false);
                    setFeedbackSuccess(false);
                    setFeedbackText('');
                    setFeedbackOutcome('positive');
                }, 2000);
            } else {
                alert(data.error || 'Mail gönderilemedi.');
            }
        } finally {
            setFeedbackLoading(false);
        }
    };

    const handleInfoRequestSend = async () => {
        if (!infoMessage.trim() && infoItems.length === 0) {
            alert('Lütfen bir mesaj yazın veya talep edilecek bilgileri ekleyin.');
            return;
        }
        if (!candidate?.email) { alert('Adayın email adresi bulunamadı.'); return; }
        setInfoSending(true);
        try {
            const APP_URL = 'https://talentflow-84bb6.web.app';
            const requestId = `ir-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const respondUrl = `${APP_URL}/respond/${requestId}?type=info`;

            // Write the record from the client (Firebase client SDK always has auth)
            await setDoc(doc(db, `artifacts/talent-flow/public/data/infoRequests/${requestId}`), {
                requestId,
                candidateId: candidate.id || null,
                sessionId: candidate.sessionId || null,
                candidateEmail: candidate.email,
                candidateName: candidate.name,
                recruiterName: userProfile?.displayName || userProfile?.name || user?.email || '',
                recruiterEmail: user?.email || '',
                position: candidate.matchedPositionTitle || candidate.position || '',
                requestMessage: infoMessage,
                requestedItems: infoItems,
                status: 'pending',
                createdAt: serverTimestamp(),
            });

            const API_BASE = import.meta.env.VITE_SERVER_URL || '';
            const token = await user?.getIdToken?.() || '';
            const res = await fetch(`${API_BASE}/api/send-info-request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({
                    to: candidate.email,
                    candidateName: candidate.name,
                    recruiterName: userProfile?.displayName || userProfile?.name || user?.email || '',
                    recruiterEmail: user?.email || '',
                    position: candidate.matchedPositionTitle || candidate.position || '',
                    requestMessage: infoMessage,
                    requestedItems: infoItems,
                    candidateId: candidate.id || null,
                    sessionId: candidate.sessionId || null,
                    requestId,
                    respondUrl,
                }),
            });
            if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Bilgi talebi gönderilemedi.'); }
            setFeedbackSuccess(true);
            setTimeout(() => {
                setFeedbackModal(false);
                setFeedbackSuccess(false);
                setInfoMessage('');
                setInfoItems([]);
                setNewInfoItem('');
                setMsgTab('feedback');
            }, 2000);
        } catch (err) {
            alert(err.message);
        } finally {
            setInfoSending(false);
        }
    };

    const handleBulkImport = async () => {
        if (bulkImporting) return;
        setBulkImporting(true);
        setBulkJobIds([]);
        const selectedPos = positions.find(p => p.id === bulkPositionId);

        try {
            const fbAuthTok = await user?.getIdToken?.() || '';
            const authHeaders = { 'Authorization': `Bearer ${fbAuthTok}` };

            // Reads the body defensively: infra-level failures (e.g. the 32MB
            // Cloud Functions request cap) return plain text, not JSON.
            const postBulkImport = async (init) => {
                const resp = await fetch('/api/bulk-import', init);
                let data = {};
                try { data = await resp.json(); } catch { /* non-JSON error body */ }
                if (!resp.ok || !data.jobId) {
                    throw new Error(data.error || `Toplu yükleme başlatılamadı (HTTP ${resp.status}).`);
                }
                return data;
            };

            if (bulkTab === 'json') {
                // JSON records path
                let records;
                try { records = JSON.parse(bulkJsonText.trim()); } catch {
                    throw new Error('Geçersiz JSON formatı.');
                }
                if (!Array.isArray(records) || records.length === 0) throw new Error('Kayıt dizisi boş veya geçersiz.');
                const initialItems = records.map(r => ({ name: r.name || 'Aday', status: 'pending' }));
                setBulkProgress({ total: records.length, completed: 0, failed: 0, items: initialItems, avgScore: null, status: 'queued' });
                const data = await postBulkImport({
                    method: 'POST',
                    headers: { ...authHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ positionId: selectedPos?.id || '', positionTitle: selectedPos?.title || '', records }),
                });
                setBulkJobIds([data.jobId]);
                try { localStorage.setItem('bulkActiveJobs', JSON.stringify([data.jobId])); } catch { /* storage unavailable */ }
                setBulkProgress(prev => ({ ...prev, total: data.totalCount || prev.total, status: 'queued' }));
            } else {
                // DOSYA YOLU — dosya doğrudan Storage'a gider, API'ye yalnızca
                // yol bildirilir. Eskiden dosya isteğin gövdesindeydi ve sunucu
                // ZIP'i açıp her PDF'in metnini o istek içinde çıkarıyordu;
                // Hosting rewrite'ı 60 saniyede kestiği için büyük arşivlerde
                // istek ölüyor, kullanıcı "başlatılamadı" görüyordu — oysa
                // sunucu çoğu zaman çalışmaya devam ediyordu.
                if (!bulkFiles.length) { setBulkImporting(false); return; }
                const oversized = oversizedFiles(bulkFiles);
                if (oversized.length > 0) {
                    throw new Error(
                        `Şu dosyalar ${formatBytes(MAX_SOURCE_BYTES)} sınırını aşıyor: ` +
                        `${oversized.map(f => f.name).join(', ')}.`
                    );
                }
                if (bulkFiles.length > MAX_SOURCES) {
                    throw new Error(`Tek seferde en fazla ${MAX_SOURCES} dosya seçilebilir (${bulkFiles.length} seçili). Bir ZIP içinde istediğiniz kadar CV olabilir.`);
                }
                // Toplam CV sayısı arşiv açılana kadar bilinmiyor; uydurulmuş
                // bir hedef yerine yükleme oranı gösterilir, sayıyı worker
                // açtıkça Firestore dinleyicisi dolduracak.
                setBulkProgress({ total: 0, completed: 0, failed: 0, items: [], avgScore: null, status: 'uploading' });
                const sources = await uploadBulkSources(bulkFiles, user?.uid, {
                    onProgress: (p) => setBulkUploadProgress(p),
                });
                setBulkUploadProgress(null);
                const data = await postBulkImport({
                    method: 'POST',
                    headers: { ...authHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        positionId: selectedPos?.id || '',
                        positionTitle: selectedPos?.title || '',
                        sources,
                    }),
                });
                setBulkJobIds([data.jobId]);
                try { localStorage.setItem('bulkActiveJobs', JSON.stringify([data.jobId])); } catch { /* storage unavailable */ }
                setBulkProgress(prev => ({ ...prev, status: 'queued' }));
            }
        } catch (err) {
            console.error('Bulk import start error:', err);
            setBulkImporting(false);
            setBulkUploadProgress(null);
            setBulkProgress(prev => ({ ...prev, status: 'error', errorMessage: err.message }));
        }
    };

    const handleStatusChange = async (newStatus) => {
        if (!candidate || newStatus === normalizePipelineStatus(candidate.status)) return;
        setStatusDropdownOpen(false);
        setActionLoading(true);
        try {
            const update = {
                status: newStatus,
                statusChangedAt: new Date().toISOString(),
                statusChangedBy: user?.displayName || user?.email || 'HR',
            };
            if (newStatus === 'rejected') {
                update.rejectedAt  = update.statusChangedAt;
                update.rejectedBy  = update.statusChangedBy;
            } else if (newStatus === 'hired') {
                update.hiredAt  = update.statusChangedAt;
                update.hiredBy  = update.statusChangedBy;
            }
            await updateCandidate(candidate.id, update);
            showSuccess('stage');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!candidate) return;
        setActionLoading(true);
        try {
            await deleteCandidate(candidate.id);
            setDeleteModal(false);
            // Navigate to first remaining candidate or back to list
            const remaining = candidates.filter(c => c.id !== candidate.id);
            if (remaining.length > 0) {
                setViewCandidateId(remaining[0].id);
            } else {
                navigate('/candidates');
            }
        } finally {
            setActionLoading(false);
        }
    };

    const handleRunStarAnalysis = async (targetCandidate) => {
        const c = targetCandidate || candidate;
        if (!c || analyzingIds.has(c.id)) return;

        // Eski davranış: mevcut STAR analizi varsa buton SESSİZCE hiçbir şey
        // yapmıyordu — kullanıcı "analiz çalışmıyor" sanıyordu. Artık yeniden
        // analiz onaylatılır (eski/yanlış pozisyona yapılmış analizler de
        // böylece tazelenebilir).
        if (c.aiAnalysis?.starAnalysis) {
            const ok = window.confirm(
                `${c.name || 'Bu aday'} için mevcut bir otonom analiz var` +
                (c.aiAnalysis?.analyzedForPosition ? ` ("${c.aiAnalysis.analyzedForPosition}" pozisyonu için)` : '') +
                `.\nYeniden analiz edilsin mi? Mevcut analiz güncellenecek.`
            );
            if (!ok) return;
        }

        // Kanıt kontrolü: CV gövdesi ve deneyim listesi boşsa analiz boş
        // girdiyle çalışıp yanıltıcı düşük skor üretir — açık hata göster.
        const cvBody = `${c.cvData || ''}${c.cvText || ''}`.trim();
        if (cvBody.length < 40 && !(c.experiences?.length > 0)) {
            setAnalysisError('CV metni bulunamadı — önce Bakım > "Eksik Profilleri Tamamla" çalıştırın ya da adayın CV\'sini yeniden yükleyin.');
            return;
        }

        setAnalyzingIds(prev => new Set(prev).add(c.id));
        setAnalysisError(null);
        try {
            const openPositions = positions?.filter(p => p.status === 'open') || [];
            if (openPositions.length === 0) {
                throw new Error('Açık pozisyon yok. Önce bir pozisyon açın.');
            }

            // Toplu tarama ile AYNI çekirdek (scanService.deepScanCandidate).
            // Bu ekran eskiden kendi zayıf kopyasını çalıştırıyordu: yalnızca
            // TEK pozisyonu analiz ediyor ve positionAnalyses'i hiç
            // yazmıyordu — bu yüzden adayın profilinden analiz tazelense bile
            // listedeki "Poz. Uyum" skoru ve pozisyon bazlı filtreler eski
            // değerde kalıyordu.
            const result = await deepScanCandidate(c, openPositions, { allowUnrelatedFallback: false });

            if (result.status === 'no_compatible_position') {
                throw new Error(
                    'Bu adayın domain\'ine uygun açık pozisyon yok. Açık pozisyon ekleyin veya mevcut pozisyonların durumunu kontrol edin.'
                );
            }
            if (result.status === 'skipped_no_cv') {
                throw new Error('CV metni bulunamadı — Bakım > "Eksik Profilleri Tamamla" çalıştırın.');
            }
            if (result.status === 'analysis_failed') {
                // Teknik hata: CV'yi suçlamak yanlış yönlendiriyordu.
                const first = result.failures?.[0]?.message || 'bilinmeyen hata';
                // Tavsiye hatanın TÜRÜNDEN çıkar, durum kodundan değil.
                // Eskiden 429 gören her hataya "1 dakika bekleyin" deniyordu;
                // harcama tavanı dolduğunda bu tavsiye kullanıcıyı çalışmayacak
                // bir şeyi tekrar tekrar denemeye yolluyordu.
                const { hint } = aiErrorHint(first);
                throw new Error(
                    `AI analizi başarısız oldu (CV sorunu değil): ${first}${hint ? ` — ${hint}` : ''}`
                );
            }
            if (result.status !== 'scanned') {
                throw new Error(
                    'Analiz hiçbir sonuç üretmedi. Adayın alanına uygun bir pozisyon açık mı, kontrol edin.'
                );
            }

            await updateCandidate(c.id, result.updates);

            // SIFIR BİR SONUÇTUR, HATA DEĞİL.
            //
            // Eskiden bu durumda analizler kaydedilmiyor ve ekranda "hiçbir
            // pozisyon için 0'dan büyük skor çıkmadı, uygun ilan açık mı
            // kontrol edin" yazıyordu. Kullanıcı bunu yapılandırma hatası
            // sanıp ilan aradı — oysa ölçüm yapılmıştı ve sonucu 0'dı.
            // Analizler artık saklanıyor; burada yalnızca sonucu bildiriyoruz.
            if (result.noneScored) {
                setAnalysisError(
                    'Analiz tamamlandı: aday açık ilanların hiçbirinde puan alamadı. ' +
                    'Madde bazlı değerlendirmeler kaydedildi — Pozisyon Eşleşmeleri sekmesinden ' +
                    'hangi maddelerde eksik kaldığını görebilirsiniz.'
                );
                return;
            }
            showSuccess('comment');
        } catch (err) {
            console.error('STAR Analysis error:', err);
            setAnalysisError(err.message || 'Analiz sırasında bir hata oluştu. Tekrar deneyin.');
        } finally {
            setAnalyzingIds(prev => {
                const next = new Set(prev);
                next.delete(c.id);
                return next;
            });
        }
    };

    const candidate = useMemo(() => {
        const raw = (!viewCandidateId && candidates.length > 0)
            ? candidates[0]
            : candidates.find(c => c.id === viewCandidateId) || (candidates.length > 0 ? candidates[0] : null);
        return applyPiiMask(raw, role);
    }, [candidates, viewCandidateId, role]);

    // Load info requests for the active candidate card
    useEffect(() => {
        if (!candidate?.id) { setCandidateInfoReqs([]); return; }
        setInfoReqsLoading(true);
        const q = query(
            collection(db, 'artifacts/talent-flow/public/data/infoRequests'),
            where('candidateId', '==', candidate.id)
        );
        const unsub = onSnapshot(q, snap => {
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            docs.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
            setCandidateInfoReqs(docs);
            setInfoReqsLoading(false);
        }, () => setInfoReqsLoading(false));
        return unsub;
    }, [candidate?.id]);

    // Position filter dropdown is built from CURRENTLY-OPEN positions (not
    // CV-extracted text titles). This way the recruiter filters by their
    // active openings — a candidate matched to a now-closed position falls
    // out of any open-position filter as expected.
    //
    // Fallback to candidate-derived list if no open positions are loaded
    // yet, so the page doesn't appear broken during initial render.
    const filterOptions = useMemo(() => {
        const sources = [...new Set(candidates.map(c => c.source).filter(Boolean))];
        const openPosTitles = (positions || [])
            .filter(p => p.status === 'open')
            .map(p => p.title)
            .filter(Boolean);
        const positionsList = openPosTitles.length > 0
            ? [...new Set(openPosTitles)]
            : [...new Set(candidates.map(c => c.matchedPositionTitle || c.position || c.bestTitle).filter(Boolean))];
        const statuses = [...new Set(candidates.map(c => normalizePipelineStatus(c.status)).filter(Boolean))];
        return { sources, positions: positionsList, statuses };
    }, [candidates, positions]);

    const activeFilterCount = [filterSource, filterStatus, filterPosition, filterMinScore > 0].filter(Boolean).length;

    const filtered = useMemo(() => {
        const q = searchQuery.toLowerCase();
        // Pozisyon filtresi "uygunluk modu": seçilen AÇIK pozisyon için her
        // adayın skoru (kayıtlı AI analizi ↔ anahtar-kelime, büyük olan)
        // hesaplanır; min skor eşiği ve sıralama BU skora uygulanır. Eski
        // davranış adayın en-iyi-eşleşme skoruna bakıyordu — yanlış adayları
        // geçirip doğru adayları eliyordu.
        const selectedPos = filterPosition
            ? (positions || []).find(p => p.status === 'open' && p.title === filterPosition) || null
            : null;
        const positionScores = selectedPos
            ? new Map(candidates.map(c => [c.id, Math.max(
                analysisScoreFor(c, selectedPos),
                Number(calculateMatchScore(c, selectedPos)?.score || 0),
            )]))
            : null;
        const results = candidates.filter(c => {
            // Position-related fields the candidate might be searched/filtered
            // by. matchedPositionTitle is the system's pick (highest-scoring
            // open position for this candidate); position/bestTitle come from
            // CV text. Search hits any of them; filter prefers the system pick.
            const candidatePosForSearch = [
                c.matchedPositionTitle,
                c.position,
                c.bestTitle,
            ].filter(Boolean).join(' ').toLowerCase();
            const candidatePosForFilter = c.matchedPositionTitle || c.position || c.bestTitle || '';

            if (q && !c.name?.toLowerCase().includes(q) && !candidatePosForSearch.includes(q)) return false;
            if (filterSource && c.source !== filterSource) return false;
            if (filterStatus && normalizePipelineStatus(c.status) !== filterStatus) return false;
            if (filterPosition) {
                if (positionScores) {
                    if (filterMinScore > 0 && (positionScores.get(c.id) || 0) < filterMinScore) return false;
                } else {
                    // Seçilen başlık artık açık pozisyon değil — eski etiket eşleşmesi
                    if (candidatePosForFilter !== filterPosition) return false;
                    if (filterMinScore > 0 && (c.bestScore || 0) < filterMinScore) return false;
                }
            } else if (filterMinScore > 0 && (c.bestScore || 0) < filterMinScore) return false;
            return true;
        });
        if (positionScores) {
            // Önce ZORUNLU gereksinim kapısı, sonra skor.
            //
            // Zorunlu bir maddeyi karşılamayan aday, puanı ne olursa olsun
            // karşılayanların altında kalır. Cezayı skorun içinde eritmek
            // yerine ayrı bir kademe kullanmak, "85 puanlık aday neden altta?"
            // sorusunu ortadan kaldırıyor: sebep aday kartındaki rozette yazıyor.
            const rankOf = new Map(results.map((c) => [
                c.id,
                gateRank(mustHaveGate(fullAnalysisForPosition(c, selectedPos.title), selectedPos, c).status),
            ]));
            results.sort((a, b) => {
                const ra = rankOf.get(a.id) ?? 2;
                const rb = rankOf.get(b.id) ?? 2;
                if (ra !== rb) return rb - ra;
                return (positionScores.get(b.id) || 0) - (positionScores.get(a.id) || 0);
            });
            return results;
        }
        const hasScreening = results.some(c => c.screeningScore != null);
        if (hasScreening) {
            results.sort((a, b) => {
                const sa = a.screeningScore ?? -1;
                const sb = b.screeningScore ?? -1;
                return sb - sa;
            });
        }
        return results;
    }, [candidates, searchQuery, filterSource, filterStatus, filterPosition, filterMinScore, positions]);

    // parseFeedback kaldırıldı: "Pozitif (+)/Negatif (-)" ayrıştırması artık
    // starDimensions.normalizeStarDimension içinde, eski ve yeni biçimi
    // birlikte ele alacak şekilde yapılıyor.
    const rawExperiences = candidate?.experiences || candidate?.careerHistory || [];
    const careerHistory = rawExperiences.filter(exp =>
        exp &&
        (exp.duration || exp.company) &&
        (!exp.role || exp.role.length <= 80) &&
        !(exp.role && !exp.company && !exp.duration)
    );

    function parseCareerFromCvData(text) {
        if (!text) return [];
        const MONTHS = 'Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
        const dateRx = new RegExp(
            `((?:${MONTHS})\\s+\\d{4})\\s*[–\\-]+\\s*((?:${MONTHS})\\s+\\d{4}|Günümüz|Present|Halen)`,
            'gi'
        );
        const matches = [...text.matchAll(dateRx)];
        if (matches.length === 0) return [];
        return matches.slice(0, 8).map(m => {
            const duration = m[0];
            const startIdx = m.index;
            const lineStart = text.lastIndexOf('\n', startIdx);
            const lineEnd = text.indexOf('\n', startIdx + duration.length);
            const headerLine = text.slice(lineStart + 1, lineEnd > 0 ? lineEnd : startIdx + 120).replace(duration, '').trim();
            const parts = headerLine.split(/[|\-–,]/).map(s => s.trim()).filter(Boolean);
            const role = parts[0] || '';
            const company = parts[1] || parts[0] || '';
            const afterDate = lineEnd > 0 ? text.slice(lineEnd, lineEnd + 250) : '';
            const descLine = afterDate.split('\n').map(s => s.trim()).find(s => s.length > 20 && !/^[•\-\*]/.test(s)) || '';
            const bulletLines = afterDate.split('\n').filter(l => /^[•\-\*]/.test(l.trim())).map(l => l.replace(/^[•\-\*]\s*/, '').trim()).slice(0, 2);
            return {
                role: role.slice(0, 60),
                company: company === role ? '' : company.slice(0, 60),
                duration,
                desc: descLine.slice(0, 140),
                milestones: bulletLines,
            };
        }).filter(e => e.duration);
    }

    const getSourceLabel = (c) => {
        if (!c?.source) return 'Manuel / PDF';
        return c.sourceDetail ? `${c.source} (${c.sourceDetail})` : c.source;
    };
    const getSourceColor = (src) => {
        if (!src) return '#64748B';
        return sourceColors?.[src.toLowerCase()] || '#64748B';
    };

    // Skor tutarlılığı: gösterilen skor, gösterilen pozisyonun (matchedPositionTitle)
    // skorudur — kayıtlı pozisyon analizi, o pozisyon için yapılmış derin analiz ve
    // anahtar-kelime skorunun en büyüğü. Başlık açık bir pozisyona işaret etmiyorsa
    // bestScore'a düşülür. (Eskiden başlık Growth PM iken başka pozisyonun eski
    // %75'i gösterilebiliyordu; gerçek uyum %34'tü.)
    const openByTitle = useMemo(
        () => new Map((positions || []).filter(p => p.status === 'open' && p.title).map(p => [p.title, p])),
        [positions]
    );
    const coherentScoreOf = (c) => {
        if (!c) return 0;
        const pos = c.matchedPositionTitle ? openByTitle.get(c.matchedPositionTitle) : null;
        if (!pos) return Math.round(c.bestScore || 0);
        const saved = analysisScoreFor(c, pos);
        const fromAnalysis = c.aiAnalysis?.analyzedForPosition === pos.title ? Number(c.aiAnalysis?.score || 0) : 0;
        const keyword = Number(calculateMatchScore(c, pos)?.score || 0);
        return Math.round(Math.max(saved, fromAnalysis, keyword));
    };
    const score = coherentScoreOf(candidate);

    // Gösterilen pozisyonun analiz METNİ — skorla aynı kural: ne gösteriliyorsa
    // onun analizi. Yoksa null döner ve arayüz "başka pozisyon için üretilmiş"
    // uyarısıyla eldeki metni gösterir.
    const displayedAnalysis = analysisForPosition(candidate, candidate?.matchedPositionTitle);
    // Kırılım, gösterilen analizin AİT OLDUĞU pozisyonun gereksinimleriyle
    // hesaplanmalı; başka bir ilanın maddeleriyle açıklamak yanlış olurdu.
    const displayedPosition = candidate?.matchedPositionTitle
        ? openByTitle.get(candidate.matchedPositionTitle) || null
        : null;
    // Kırılım ve zorunlu kapısı TAM analiz kaydına ihtiyaç duyar;
    // analysisForPosition yalnızca {summary, analyzedFor, score} döndürüyor ve
    // requirementCoverage taşımıyor.
    const displayedFullAnalysis = fullAnalysisForPosition(candidate, candidate?.matchedPositionTitle);
    const displayedGate = mustHaveGate(displayedFullAnalysis, displayedPosition, candidate);

    // STAR GÖSTERİLEN İLANI İZLESİN.
    //
    // Kartlar `candidate.aiAnalysis` okuyordu — adayın EN İYİ eşleşmesinin
    // analizi. Skor kırılımı ise `displayedFullAnalysis` okuyor, yani ekranda
    // seçili ilanın analizini. İki bileşen aynı ekranda FARKLI pozisyonun
    // verisini gösterebiliyordu: solda A ilanının skoru, altında B ilanının
    // STAR kanıtı. Seçili ilanın analizi varsa STAR da ondan gelir.
    const displayedStar = displayedFullAnalysis?.starAnalysis
        || candidate?.aiAnalysis?.starAnalysis
        || null;
    const displayedGateLabel = gateLabel(displayedGate);

    /**
     * Mülakat planını adayın üzerine POZİSYON BAŞINA yazar.
     *
     * Aday birden fazla ilana bakılıyor olabilir ve her ilanın açık maddeleri
     * farklı. Tek bir `interviewPlan` alanı, ikinci pozisyonun planı
     * yazıldığında birincisini sessizce ezerdi.
     *
     * Plan `fingerprint` taşır: ilan sonradan değişirse panel bunu görüp planı
     * bayat ilan eder. Saklanan bir planın "hâlâ geçerli" sanılması, planın
     * hiç olmamasından kötü — mülakatçıyı yanlış maddeyi sormaya gönderir.
     */
    const handleSaveInterviewPlan = async (plan) => {
        if (!candidate || !displayedPosition?.title) return;
        await updateCandidate(candidate.id, {
            interviewPlans: {
                ...(candidate.interviewPlans || {}),
                [displayedPosition.title]: plan,
            },
        });
    };

    // STAR rozeti. Hesap starDimensions.starPercent'te — TEK yerde.
    //
    // Burada kendi kopyası vardı ve `(toplam / 4) * 10` ile eski 0-10 ölçeğini
    // varsayıyordu. Yeni 0-3 ölçeğine geçilince rozet gerçeğin çok altını
    // gösterdi: S3+T2+A2+R3 için %25 yazarken doğru değer %83'tü.
    const starScore = starPercent(displayedStar);

    // ── TOP 2% BADGE ────────────────────────────────────────────────────────────
    const isTop2Percent = useMemo(() => {
        if (!candidate || candidates.length < 10) return false;
        const sorted = [...candidates].sort((a, b) => (b.bestScore || 0) - (a.bestScore || 0));
        const topCount = Math.max(1, Math.ceil(sorted.length * 0.02));
        const threshold = sorted[topCount - 1]?.bestScore || 0;
        return (candidate.bestScore || 0) >= threshold && threshold > 0;
    }, [candidate, candidates]);

    // ── POSITION MATCHES (domain-filtered, title-first domain detection) ───────
    const positionMatches = useMemo(() => {
        if (!candidate || !positions) return { candidateDomain: 'general', compatible: [], incompatible: [] };
        // Use title-first domain detection: job title/position is more reliable
        // than CV body which may contain incidental keywords from the employer's sector
        const cDomain = detectCandidateDomain(candidate);
        const openPositions = positions.filter(p => p.status === 'open');
        const compatible = [];
        const incompatible = [];
        openPositions.forEach(pos => {
            const pDomain = detectPositionDomain(pos);
            // ATAMA ALAN FİLTRESİNİ EZER. Meslek alanı tespiti bir SEZGİ:
            // canlıda "Veri/Analitik" sayılan bir aday için altı ilanın altısı
            // da "ayrı alan" kovasına düştü ve ekran "uygun açık pozisyon yok"
            // dedi — oysa kullanıcının istediği ilana uyum %76'ydı. Kullanıcı
            // "bu adayı bu ilana bakıyorum" dediyse, sezgi susar.
            const isAssigned = Boolean(candidate.positionId) && candidate.positionId === pos.id;
            const isCompat = isAssigned || cDomain === 'general' || pDomain === 'general' || pDomain === 'management' || cDomain === 'management' || cDomain === pDomain;
            const savedAnalysis = candidate.positionAnalyses?.[pos.title];
            const staticMatch = calculateMatchScore(candidate, pos);
            const matchData = savedAnalysis
                ? { score: savedAnalysis.score, summary: savedAnalysis.summary, isAi: true, reasons: savedAnalysis.reasons || [] }
                : { score: staticMatch.score, summary: null, isAi: false, reasons: staticMatch.reasons || [] };
            const entry = { position: pos, match: matchData, positionDomain: pDomain, isAssigned };
            if (isCompat) compatible.push(entry);
            else incompatible.push(entry);
        });
        // Atanan ilan en üstte: kullanıcının kararı listenin başında dursun.
        compatible.sort((a, b) => (b.isAssigned ? 1 : 0) - (a.isAssigned ? 1 : 0) || b.match.score - a.match.score);
        incompatible.sort((a, b) => b.match.score - a.match.score);
        return { candidateDomain: cDomain, compatible, incompatible };
    }, [candidate, positions]);

    /**
     * BU ADAYI BU İLANA GÖRE DEĞERLENDİR — tek pozisyon, tek AI çağrısı.
     *
     * "Pozisyon Eşleşmeleri" sekmesi bugüne kadar yalnızca OKUNUYORDU: skorlar
     * listeleniyor ama bir ilanı seçip "bunu değerlendir" demenin yolu yok.
     * Kullanıcı bunu bildirdi — "bir CV'nin spesifik bir pozisyon için
     * değerlendirmesini yapmak istiyorum, ekranda net değil".
     *
     * Tek yol Pozisyonlar ekranındaki "Adayları Yeniden Tara" idi: pozisyondan
     * başlamayı gerektiriyor ve adı bir bakım işi gibi duruyor. Motor
     * (rescanCandidateForPosition) zaten hazırdı, aday tarafından çağıran yoktu.
     */
    const [evaluatingTitle, setEvaluatingTitle] = useState(null);
    const [evaluateErrors, setEvaluateErrors] = useState({});
    const [assigningId, setAssigningId] = useState(null);

    /**
     * BU ADAYI BU İLANA ATA — meslek alanı sezgisini kullanıcı ezer.
     *
     * `candidate.positionId` üç yerde "işe alım uzmanının atadığı pozisyon"
     * olarak okunuyor ve BAĞLAYICI sayılıyor (SystemScanner, scanService,
     * CandidateDrawer). Ama onu YAZAN hiçbir ekran yoktu: tasarlanmış bir
     * kaçış kapısının kapısı yoktu.
     *
     * Sonucu canlıda görüldü: meslek alanı "Veri/Analitik" tespit edilen bir
     * adayda altı açık ilanın altısı da "ayrı alan" sayıldı. Bu durumda
     * otonom tarama hiçbir şey yapmıyor — analiz edilecek pozisyon listesi
     * `[assignedPos || bestMatch || compatiblePositions[0]]` ve üçü de boş.
     * Kullanıcı adayı ilerletemiyor, üstelik istediği ilana uyum %76.
     */
    const assignToPosition = async (position) => {
        if (!position?.id || assigningId) return;
        setAssigningId(position.id);
        try {
            await updateCandidate(candidate.id, {
                positionId: position.id,
                // Başlıktaki "Uygun açık pozisyon yok" sentineli de kalkar:
                // artık bir bağ VAR ve onu insan kurdu.
                matchedPositionTitle: position.title,
            });
        } finally {
            setAssigningId(null);
        }
    };

    const clearAssignment = async (position) => {
        if (assigningId) return;
        setAssigningId(position?.id || 'clear');
        try {
            const updates = { positionId: null };
            // Başlığı yalnızca BİZİM yazdığımız değerse geri alıyoruz; sistemin
            // kendi bulduğu bir eşleşmeyi atamayı kaldırmak silmemeli.
            if (candidate.matchedPositionTitle === position?.title) updates.matchedPositionTitle = null;
            await updateCandidate(candidate.id, updates);
        } finally {
            setAssigningId(null);
        }
    };

    const evaluateForPosition = async (position) => {
        if (!position?.title || evaluatingTitle) return;
        setEvaluatingTitle(position.title);
        setEvaluateErrors((prev) => ({ ...prev, [position.title]: '' }));
        try {
            const result = await rescanCandidateForPosition(candidate, position);
            if (result.status === 'scanned') {
                await updateCandidate(candidate.id, result.updates);
                return;
            }
            // BAŞARISIZLIĞIN SEBEBİ AYRIŞIR. "Kanıt yok" ile "AI patladı" aynı
            // şey değil: birincisinde CV'yi düzeltmek, ikincisinde tekrar
            // denemek gerekiyor. Tek bir "olmadı" mesajı canlıda kota aşımını
            // CV eksikliği sandırmıştı.
            setEvaluateErrors((prev) => ({
                ...prev,
                [position.title]: result.status === 'skipped_no_cv'
                    ? 'Bu adayda CV metni yok — önce CV yeniden ayrıştırılmalı.'
                    : result.status === 'analysis_failed'
                        ? (result.failures?.[0]?.message || 'AI çağrısı başarısız oldu.')
                        : 'Model bu ilan için sonuç üretemedi.',
            }));
        } catch (err) {
            setEvaluateErrors((prev) => ({ ...prev, [position.title]: err?.message || 'Değerlendirme yapılamadı.' }));
        } finally {
            setEvaluatingTitle(null);
        }
    };

    // ── TABS ──────────────────────────────────────────────────────────────────
    const TABS = [
        { id: 'ai_analysis',      label: 'STAR Analizi',        icon: <Brain className="w-3.5 h-3.5" /> },
        { id: 'cv_file',          label: 'CV',                  icon: <FileQuestion className="w-3.5 h-3.5" /> },
        { id: 'cv_match',         label: 'CV & Uyum',           icon: <FileText className="w-3.5 h-3.5" /> },
        { id: 'pos_matches',      label: 'Pozisyon Eşleşmeleri', icon: <Layers className="w-3.5 h-3.5" /> },
        { id: 'sessions',         label: 'Mülakatlar',          icon: <Video className="w-3.5 h-3.5" /> },
        { id: 'history',          label: 'Süreç Geçmişi',       icon: <BarChart2 className="w-3.5 h-3.5" /> },
        { id: 'messages',         label: 'Mesajlar',            icon: <MessageSquare className="w-3.5 h-3.5" /> },
    ];

    return (
        <div className="h-screen bg-slate-50 flex flex-col font-sans overflow-hidden">
            <Header title="Adaylar" />
            {/* SUB-HEADER — page-level controls, the brand/title now lives in Header */}
            <div className="bg-white border-b border-slate-200 px-8 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidates-table' }))}
                        className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                        title="Aday listesine (tablo görünümü) dön"
                    >
                        <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Listeye Dön
                    </button>
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Aday Yönetimi</span>
                    <div className="rounded-full bg-slate-100 text-slate-500 text-[11px] px-2.5 py-0.5 font-bold">
                        {candidates.length}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <SystemScanner />
                    <button
                        onClick={() => {
                            // Yalnızca boşta iken sıfırla — aktif bir iş takip
                            // edilirken sıfırlamak, bulkImporting açıkken takip
                            // verisini silip modalı 0/0'da kilitliyordu.
                            if (!bulkImporting) {
                                setBulkFiles([]);
                                setBulkJobIds([]);
                                setBulkProgress({ total: 0, completed: 0, failed: 0, items: [] });
                                // Önceki partinin pozisyon seçimi sessizce yeni
                                // partiye taşınmasın
                                setBulkPositionId('');
                            }
                            setBulkImportModal(true);
                        }}
                        className="bg-violet-500 hover:bg-violet-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-colors shadow-sm shadow-violet-200 flex items-center gap-1.5"
                    >
                        <Upload className="w-3.5 h-3.5" /> Toplu Yükleme
                    </button>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-colors shadow-sm shadow-cyan-200 flex items-center gap-1.5"
                    >
                        <Plus className="w-3.5 h-3.5" /> Yeni Aday
                    </button>
                </div>
            </div>

            {/* ONE-TIME MIGRATION BANNER — super_admin only */}
            {isSuperAdmin && legacyNewCandidates.length > 0 && migrateStatus !== 'done' && (
                <div className="bg-amber-50 border-b border-amber-200 px-8 py-2 flex items-center justify-between shrink-0">
                    <span className="text-amber-700 text-[11px] font-medium">
                        <strong>{legacyNewCandidates.length} aday</strong> eski <code className="bg-amber-100 px-1 rounded text-[10px]">new</code> statüsüyle kayıtlı — pipeline tutarlılığı için <strong>ai_analysis</strong> olarak güncellenebilir.
                    </span>
                    <button
                        onClick={handleMigrateNewStatus}
                        disabled={migrateStatus === 'running'}
                        className="text-[10px] font-bold bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 ml-4 shrink-0"
                    >
                        {migrateStatus === 'running' ? 'Güncelleniyor...' : 'Hepsini Düzelt'}
                    </button>
                </div>
            )}
            {isSuperAdmin && migrateStatus === 'done' && (
                <div className="bg-emerald-50 border-b border-emerald-200 px-8 py-2 flex items-center gap-2 shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-700 text-[11px] font-medium">Tüm kayıtlar başarıyla <strong>ai_analysis</strong> olarak güncellendi.</span>
                </div>
            )}

            <div className="flex-1 flex overflow-hidden">
                {/* ── LEFT: CANDIDATE LIST ─────────────────────────────────── */}
                <aside className="w-[260px] shrink-0 flex flex-col bg-white border-r border-slate-200">

                    {/* Logo + Branding */}
                    <div className="flex items-center gap-3 px-4 pt-5 pb-4 border-b border-slate-100">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br from-teal-400 to-cyan-600 shadow-md shadow-cyan-500/20 shrink-0">
                            <span className="font-black text-white text-sm tracking-tighter">TI</span>
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="text-sm font-bold text-slate-800 leading-tight">Talent-Inn</span>
                            <span className="text-[10px] text-slate-400 font-medium">HR Platform</span>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="px-4 pt-4 pb-2">
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-[9px] font-black text-slate-400 tracking-widest uppercase">
                                ADAYLAR <span className="text-slate-300">({filtered.length})</span>
                                {filtered.some(c => c.screeningScore != null) && (
                                    <span className="ml-1 text-indigo-400 normal-case font-medium">· Ön Eleme Puanına Göre Sıralı</span>
                                )}
                            </div>
                            <button
                                onClick={() => setShowFilters(f => !f)}
                                className={`flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-all ${showFilters || activeFilterCount > 0 ? 'bg-cyan-50 text-cyan-600 border border-cyan-200' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
                                FİLTRE{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                            </button>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Ad veya pozisyon ara..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-[12px] text-slate-700 placeholder-slate-400 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 transition-all"
                            />
                        </div>
                    </div>

                    {/* Filter Panel */}
                    {showFilters && (
                        <div className="px-4 pb-3 space-y-2 border-b border-slate-100">
                            {/* Source */}
                            <div>
                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Kaynak</label>
                                <select
                                    value={filterSource}
                                    onChange={e => setFilterSource(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-[10px] text-slate-700 outline-none focus:border-cyan-400 transition-all"
                                >
                                    <option value="">Tümü</option>
                                    {filterOptions.sources.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            {/* Stage */}
                            <div>
                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Aşama</label>
                                <select
                                    value={filterStatus}
                                    onChange={e => setFilterStatus(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-[10px] text-slate-700 outline-none focus:border-cyan-400 transition-all"
                                >
                                    <option value="">Tümü</option>
                                    {filterOptions.statuses.map(s => <option key={s} value={s}>{PIPELINE_STATUS_LABELS[s] || s}</option>)}
                                </select>
                            </div>
                            {/* Position */}
                            <div>
                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Pozisyon</label>
                                <select
                                    value={filterPosition}
                                    onChange={e => setFilterPosition(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-[10px] text-slate-700 outline-none focus:border-cyan-400 transition-all"
                                >
                                    <option value="">Tümü</option>
                                    {filterOptions.positions.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            {/* Min Score */}
                            <div>
                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Min. Uyum Skoru: <span className="text-cyan-600">%{filterMinScore}</span></label>
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    step={5}
                                    value={filterMinScore}
                                    onChange={e => setFilterMinScore(Number(e.target.value))}
                                    className="w-full accent-cyan-500"
                                />
                                <div className="flex justify-between text-[7px] text-slate-300 font-bold mt-0.5">
                                    <span>0%</span><span>50%</span><span>100%</span>
                                </div>
                            </div>
                            {/* Clear */}
                            {activeFilterCount > 0 && (
                                <button
                                    onClick={() => { setFilterSource(''); setFilterStatus(''); setFilterPosition(''); setFilterMinScore(0); }}
                                    className="w-full text-[8px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-700 py-1 transition-all"
                                >
                                    Filtreleri Temizle
                                </button>
                            )}
                        </div>
                    )}

                    {/* List */}
                    <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5 custom-scrollbar">
                        {filtered.length === 0 && (
                            <div className="py-10 flex flex-col items-center text-slate-400">
                                <Search className="w-8 h-8 mb-2 opacity-30" />
                                <p className="text-[10px] font-bold uppercase">Aday bulunamadı</p>
                            </div>
                        )}
                        {filtered.map(c => {
                            const mc = applyPiiMask(c, role);
                            const sc = coherentScoreOf(c);
                            const srcColor = getSourceColor(c.source);
                            const isActive = c.id === candidate?.id;
                            return (
                                <button
                                    key={c.id}
                                    onClick={() => setViewCandidateId(c.id)}
                                    className={`w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-2.5 transition-colors border ${
                                        isActive
                                            ? 'bg-cyan-50 border-cyan-200'
                                            : 'bg-transparent border-transparent hover:bg-slate-50'
                                    }`}
                                >
                                    {isActive && <div className="w-[6px] h-[6px] rounded-full bg-cyan-500 shrink-0" />}
                                    <CandidateAvatar
                                        name={mc.name}
                                        photo={c.photo}
                                        photoUrl={c.photoUrl}
                                        profileImage={c.profileImage}
                                        size="sm"
                                        rounded="rounded-lg"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-[12px] font-bold truncate leading-tight ${isActive ? 'text-cyan-700' : 'text-slate-700'}`}>{mc.name}</p>
                                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                            <span
                                                className="text-[8px] font-bold px-1.5 py-0.5 rounded-md inline-flex items-center gap-0.5 uppercase"
                                                style={{ color: srcColor, backgroundColor: `${srcColor}15` }}
                                            >
                                                {getSourceLabel(c)}
                                            </span>
                                            {c.screeningScore != null && (
                                                <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-100 uppercase">
                                                    🎯 %{Math.round(c.screeningScore)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="shrink-0">
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                                            isActive ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-500'
                                        }`}>%{sc}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Bottom AI card */}
                    <div className="px-4 py-4 border-t border-slate-100">
                        <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-3 flex items-start gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-cyan-500 shrink-0 mt-0.5" />
                            <span className="text-[11px] text-slate-500 leading-snug">
                                {candidates.length} aday AI analiz sürecinde
                            </span>
                        </div>
                    </div>
                </aside>

                {/* ── RIGHT: DETAIL PANEL ───────────────────────────────────── */}
                <main className="flex-1 overflow-hidden flex flex-col bg-slate-50">
                    {candidate ? (
                        <div className="flex-1 overflow-hidden flex flex-col bg-white m-3 rounded-2xl border border-slate-200 shadow-sm">

                            {/* Candidate header */}
                            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <CandidateAvatar
                                        name={candidate.name}
                                        photo={candidate.photo}
                                        photoUrl={candidate.photoUrl}
                                        profileImage={candidate.profileImage}
                                        size="md"
                                        rounded="rounded-xl"
                                        className="border-2 border-white shadow-md ring-2 ring-cyan-100"
                                    />
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-[15px] font-black text-slate-900 tracking-tight leading-none">{candidate.name}</h2>
                                            {isTop2Percent && (
                                                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
                                                    <Target className="w-2.5 h-2.5" /> İlk %2
                                                </span>
                                            )}
                                            <span className="text-[9px] font-black text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full border border-cyan-100 flex items-center gap-1">
                                                <Zap className="w-2.5 h-2.5 fill-cyan-500" /> %{score} Uyum
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 mt-0.5">
                                            {/*
                                              Show the system's match (matchedPositionTitle) over the
                                              CV-extracted title (candidate.position) so the header
                                              reflects "what we'd consider this candidate for" rather
                                              than "what the CV literally says". Falls back to
                                              position/bestTitle when no AI match has run yet.
                                            */}
                                            {candidate.matchedPositionTitle === null ? (
                                                // Açık sentinel: sistem bu adayı hiçbir AÇIK pozisyona
                                                // bağlayamadı — CV'deki serbest başlık eşleşme gibi gösterilmez.
                                                <p className="text-[11px] text-amber-600 font-semibold italic">
                                                    Uygun açık pozisyon yok
                                                </p>
                                            ) : (
                                                <p className="text-[11px] text-slate-500 font-medium">
                                                    {candidate.matchedPositionTitle || candidate.position || candidate.bestTitle || '—'}
                                                </p>
                                            )}
                                            {/* İki kavram ayrı ayrı görünür: açık pozisyon eşleşmesi
                                                (yukarıda) + CV'ye göre ideal rol (açık pozisyonlardan
                                                bağımsız) — farklıysa burada gösterilir. */}
                                            {(() => {
                                                const cvRole = cleanRoleText(candidate.suggestedRole, candidate.position || '');
                                                return cvRole && cvRole !== candidate.matchedPositionTitle ? (
                                                    <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                                                        CV'ye göre: <span className="font-bold text-slate-500">{cvRole}</span>
                                                    </span>
                                                ) : null;
                                            })()}
                                            {candidate.email && (
                                                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                                    <Mail className="w-3 h-3" /> {candidate.email}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Stat pills.
                                    Previously rendered three indicators that all read off the same
                                    score: a "%X Uyum" badge next to the name, a STAR-flavoured
                                    sub-score pill, AND a category chip ("GÜÇLÜ / ORTA / ZAYIF").
                                    The category chip duplicated what the badge already conveyed
                                    via colour + percentage; dropped it. STAR (methodology score)
                                    and Eleme (screening) stay because they're distinct metrics. */}
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5" title={starScore == null ? 'STAR analizi henüz çalıştırılmadı' : "CV'de ne kadar kanıt bulunduğunu ölçer — adayın ne kadar iyi olduğunu değil. Yüksek değer, iyi belgelenmiş bir CV demektir."}>
                                        <span className="text-[9px] font-bold text-slate-400 uppercase">STAR</span>
                                        <span className="text-[13px] font-black text-slate-800">{starScore != null ? `${starScore}%` : '—'}</span>
                                    </div>
                                    {candidate.screeningScore != null && (
                                        <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5">
                                            <span className="text-[9px] font-bold text-indigo-400 uppercase">Eleme</span>
                                            <span className="text-[13px] font-black text-indigo-600">%{Math.round(candidate.screeningScore)}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="flex border-b border-slate-100 px-5 bg-white">
                                {TABS.map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`flex items-center gap-1.5 py-2.5 px-1 mr-5 text-[9px] font-black uppercase tracking-widest relative whitespace-nowrap transition-colors ${
                                            activeTab === tab.id ? 'text-cyan-600' : 'text-slate-400 hover:text-slate-600'
                                        }`}
                                    >
                                        {tab.icon} {tab.label}
                                        {activeTab === tab.id && (
                                            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-500 rounded-full" />
                                        )}
                                    </button>
                                ))}
                            </div>

                            {/* Tab content */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">

                                {/* ── STAR ANALİZİ ── */}
                                {activeTab === 'ai_analysis' && (
                                    <div className="space-y-3 animate-in fade-in duration-300">
                                        {/* Header row */}
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1 h-3.5 rounded-full bg-cyan-500" />
                                                <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-widest">STAR Kanıt Değerlendirmesi</h3>
                                                {candidate.aiAnalysis?.lastAnalyzedAt && (
                                                    <span className="text-[9px] text-slate-400">
                                                        · {new Date(candidate.aiAnalysis.lastAnalyzedAt).toLocaleDateString('tr-TR')}
                                                    </span>
                                                )}
                                            </div>
                                            {/* Already analyzed: point to SystemScanner for re-analysis */}
                                            {displayedStar && (
                                                <div className="flex items-center gap-2">
                                                    {/* Analizi OLAN adayda yeniden çalıştırma yolu yoktu:
                                                        ekranda yalnızca "Sistem Taraması kullanın" yazıyordu,
                                                        hatta aşağıdaki bayat-analiz uyarısı "yeniden
                                                        çalıştırın" diyordu ama düğme mevcut değildi. Prompt
                                                        iyileştirmelerinin etkisini tek adayda görmek
                                                        imkânsızdı. */}
                                                    <button
                                                        onClick={() => handleRunStarAnalysis(candidate)}
                                                        disabled={analyzingIds.has(candidate.id)}
                                                        title="Bu aday için analizi güncel modelle yeniden çalıştır"
                                                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[9px] font-black text-slate-500 hover:border-cyan-300 hover:text-cyan-600 hover:bg-cyan-50 transition-colors disabled:opacity-50"
                                                    >
                                                        {analyzingIds.has(candidate.id)
                                                            ? <><Loader2 size={10} className="animate-spin" /> Analiz ediliyor…</>
                                                            : <><RefreshCw size={10} /> Yeniden Analiz Et</>}
                                                    </button>
                                                    <span className="text-[9px] text-slate-400 italic hidden sm:inline">
                                                        Toplu yenileme için Sistem Taraması
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Zorunlu gereksinim kapısı — skordan ÖNCE okunmalı:
                                            85 puanlık bir aday zorunlu bir maddeyi
                                            karşılamıyorsa bu, puandan daha belirleyici. */}
                                        {!analyzingIds.has(candidate.id) && displayedGateLabel && (
                                            <MustHaveBadge gate={displayedGate} label={displayedGateLabel} />
                                        )}

                                        {/* Skorun tam kırılımı — "neden bu puan?" */}
                                        {!analyzingIds.has(candidate.id) && displayedFullAnalysis && (
                                            <ScoreBreakdownPanel
                                                analysis={displayedFullAnalysis}
                                                position={displayedPosition}
                                            />
                                        )}

                                        {/* Mülakat planı — skorun bıraktığı soruyu odaya taşır.
                                            Kırılımın hemen altında duruyor çünkü aynı veriyi
                                            okuyor: hangi madde açık kaldıysa mülakatın işi o. */}
                                        {!analyzingIds.has(candidate.id) && displayedPosition && (
                                            <InterviewPlanPanel
                                                candidate={candidate}
                                                position={displayedPosition}
                                                analysis={displayedFullAnalysis}
                                                onSave={handleSaveInterviewPlan}
                                            />
                                        )}

                                        {/* Mülakat sonucu — planın ÜSTÜNDE değil altında
                                            duruyor ama okuma sırası tersine işliyor: mülakat
                                            yapılmışsa panel görünür ve "odada ne değişti"yi
                                            söyler; yapılmamışsa hiç çıkmaz. */}
                                        {!analyzingIds.has(candidate.id) && displayedPosition && (
                                            <InterviewOutcomePanel
                                                candidate={candidate}
                                                position={displayedPosition}
                                                analysis={displayedFullAnalysis}
                                            />
                                        )}

                                        {/* Error banner */}
                                        {analysisError && (
                                            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-[11px] text-red-600">
                                                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {analysisError}
                                            </div>
                                        )}

                                        {/* Per-candidate loading state */}
                                        {analyzingIds.has(candidate.id) && (
                                            <div className="flex flex-col items-center justify-center py-12 gap-3">
                                                <div className="w-12 h-12 rounded-2xl bg-cyan-50 border border-cyan-100 flex items-center justify-center">
                                                    <Sparkles className="w-6 h-6 text-cyan-500 animate-pulse" />
                                                </div>
                                                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Otonom Ajan Analiz Ediyor…</p>
                                                <div className="flex items-center gap-3 text-[10px] text-slate-400">
                                                    <span className="flex items-center gap-1"><Brain className="w-3 h-3 text-violet-400" /> Analyst</span>
                                                    <span className="text-slate-200">→</span>
                                                    <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-emerald-400" /> Recruiter</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Empty state — no STAR analysis yet */}
                                        {!analyzingIds.has(candidate.id) && !displayedStar && (
                                            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                                                <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                                                    <Brain className="w-7 h-7 text-slate-300" />
                                                </div>
                                                <div>
                                                    <p className="text-[12px] font-black text-slate-700 mb-1">STAR Analizi Henüz Yapılmadı</p>
                                                    <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                                                        Adayın CV'si ve pozisyon gereksinimleri STAR metodolojisiyle otonom ajan sistemi üzerinden analiz edilecektir.
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => handleRunStarAnalysis(candidate)}
                                                    disabled={analyzingIds.has(candidate.id)}
                                                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-black text-sm shadow-xl shadow-cyan-500/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100"
                                                >
                                                    <Sparkles className="w-4 h-4" />
                                                    Otonom Analizi Başlat
                                                </button>
                                            </div>
                                        )}

                                        {/* STAR kartlari — kanit olcegi (uc kova).
                                            Eski "Pozitif/Negatif" ikilisi kaldirildi: olctugumuz
                                            sey tek kutuplu oldugu icin negatif tarafta yazacak
                                            gercek bir sey cogu zaman yoktu ve model kacamak
                                            uretiyordu. Ayrinti icin StarEvidenceCards. */}
                                        {!analyzingIds.has(candidate.id) && displayedStar && (
                                            <StarEvidenceCards
                                                starAnalysis={displayedStar}
                                                position={displayedPosition}
                                                narrativeError={
                                                    displayedFullAnalysis?.narrativeError
                                                    || candidate?.aiAnalysis?.narrativeError
                                                    || null
                                                }
                                            />
                                        )}
                                    </div>
                                )}

                                {/* ── CV (orijinal dosya / form) ── */}
                                {activeTab === 'cv_file' && <CandidateCvPanel candidate={candidate} />}

                                {/* ── CV & UYUM ── */}
                                {activeTab === 'cv_match' && (
                                    <div className="space-y-6 animate-in fade-in duration-300">
                                        {/* Summary */}
                                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 relative overflow-hidden">
                                            <Brain className="absolute -right-6 -top-6 w-24 h-24 text-slate-200" />
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <Target className="w-4 h-4 text-cyan-500" />
                                                    <h3 className="text-[12px] font-black text-slate-800 uppercase tracking-widest">Pozisyon Uyum Analizi</h3>
                                                </div>
                                                <span
                                                    className="text-[8px] font-black px-2.5 py-1 rounded-lg border flex items-center gap-1 bg-white shadow-sm"
                                                    style={{ color: getSourceColor(candidate.source), borderColor: `${getSourceColor(candidate.source)}40` }}
                                                >
                                                    <Link2 className="w-2 h-2" /> {getSourceLabel(candidate)}
                                                </span>
                                            </div>
                                            {/* Metin, GÖSTERİLEN pozisyonun analizinden gelir. Eskiden her
                                                zaman tek bir aiAnalysis.summary basılıyordu; aday hangi
                                                pozisyon bağlamında açılırsa açılsın aynı yorum görünüyordu. */}
                                            <p className="text-[12px] text-slate-600 leading-relaxed italic font-medium pr-16">
                                                "{displayedAnalysis?.summary
                                                    || candidate.aiAnalysis?.summary
                                                    || `${candidate.name} teknik profili, ${candidate.matchedPositionTitle || candidate.position || 'Hedef Pozisyon'} pozisyonu ile %${score} uyum göstermektedir.`}"
                                            </p>
                                            {/* Gösterilen pozisyon için analiz YOKSA ve elde başka bir
                                                pozisyona ait metin varsa, bunu açıkça söyle. */}
                                            {!displayedAnalysis &&
                                                candidate.aiAnalysis?.summary &&
                                                candidate.aiAnalysis?.analyzedForPosition &&
                                                candidate.matchedPositionTitle &&
                                                candidate.aiAnalysis.analyzedForPosition !== candidate.matchedPositionTitle && (
                                                <p className="mt-1.5 text-[10px] text-amber-600 font-semibold flex items-center gap-1">
                                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                                    Bu değerlendirme metni "{candidate.aiAnalysis.analyzedForPosition}" pozisyonu için üretilmiş eski bir analizdir; güncel eşleşme ({candidate.matchedPositionTitle}) için AI Analiz'i yeniden çalıştırın.
                                                </p>
                                            )}
                                            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-cyan-600 shadow-sm">
                                                <Zap className="w-3 h-3 text-amber-400 fill-amber-400" /> %{score} Uyum{candidate.matchedPositionTitle ? ` — ${candidate.matchedPositionTitle}` : ''}
                                            </div>
                                        </div>

                                        {/* ── Screening Result Breakdown ── */}
                                        {candidate.screeningResult && (
                                            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                                                            <span className="text-[11px]">🎯</span>
                                                        </div>
                                                        <h3 className="text-[11px] font-black text-indigo-700 uppercase tracking-widest">Ön Eleme Değerlendirmesi</h3>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 bg-white border border-indigo-200 rounded-lg px-3 py-1">
                                                        <span className="text-[9px] font-bold text-indigo-400 uppercase">Genel Skor</span>
                                                        <span className="text-[15px] font-black text-indigo-600">%{Math.round(candidate.screeningResult.aggregateScore ?? candidate.screeningScore ?? 0)}</span>
                                                    </div>
                                                </div>
                                                {candidate.screeningResult.summary && (
                                                    <p className="text-[11px] text-indigo-700 leading-relaxed italic bg-white border border-indigo-100 rounded-xl px-4 py-2.5">
                                                        {candidate.screeningResult.summary}
                                                    </p>
                                                )}
                                                {(candidate.screeningResult.scores || []).length > 0 && (
                                                    <div className="space-y-2">
                                                        {(candidate.screeningResult.scores || []).map((item, idx) => {
                                                            const s = item.score ?? 0;
                                                            const barColor = s >= 75 ? 'bg-emerald-400' : s >= 50 ? 'bg-amber-400' : 'bg-red-400';
                                                            const textColor = s >= 75 ? 'text-emerald-600' : s >= 50 ? 'text-amber-600' : 'text-red-500';
                                                            const answer = candidate.screeningResult.answers?.[idx]?.answer || '';
                                                            return (
                                                                <div key={idx} className="bg-white border border-indigo-100 rounded-xl p-3 space-y-2">
                                                                    <div className="flex items-start gap-2">
                                                                        <span className="text-[9px] font-black text-indigo-400 mt-0.5 shrink-0">{idx + 1}.</span>
                                                                        <p className="text-[12px] font-semibold text-slate-700 leading-snug flex-1">{item.question}</p>
                                                                        <span className={`shrink-0 text-[12px] font-black ${textColor}`}>%{s}</span>
                                                                    </div>
                                                                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                                                                        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${s}%` }} />
                                                                    </div>
                                                                    {answer && (
                                                                        <p className="text-[10px] text-slate-500 leading-relaxed bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                                                                            <span className="font-black text-slate-400 uppercase text-[9px] mr-1">Cevap:</span>{answer}
                                                                        </p>
                                                                    )}
                                                                    {item.rationale && (
                                                                        <p className="text-[10px] text-indigo-500 italic leading-relaxed">{item.rationale}</p>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                                            {/* Career timeline */}
                                            <div className="md:col-span-8 space-y-4">
                                                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                                    <div className="flex items-center gap-2">
                                                        <Clock className="w-4 h-4 text-cyan-500" />
                                                        <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Kariyer Kronolojisi</h3>
                                                    </div>
                                                    {(candidate?.cvText || candidate?.cvData) && (
                                                        <button
                                                            onClick={handleReparseCareer}
                                                            disabled={reparsingCareer}
                                                            title="CV metninden kariyer verilerini yeniden çek"
                                                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[9px] font-black text-slate-500 hover:border-cyan-300 hover:text-cyan-600 hover:bg-cyan-50 transition-colors disabled:opacity-50"
                                                        >
                                                            {reparsingCareer
                                                                ? <><Loader2 size={10} className="animate-spin" /> Güncelleniyor...</>
                                                                : <><RefreshCw size={10} /> Yenile</>
                                                            }
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="space-y-5 pl-2">
                                                    {(() => {
                                                        const items = careerHistory.length > 0
                                                            ? careerHistory
                                                            : parseCareerFromCvData(candidate?.cvData || candidate?.cvText || '');
                                                        if (items.length === 0) {
                                                            return <p className="text-[12px] text-slate-400 italic">Kariyer bilgisi bulunamadı.</p>;
                                                        }
                                                        return items.map((exp, i) => (
                                                            <div key={i} className="relative pl-5 border-l-2 border-cyan-100 pb-4 last:pb-0">
                                                                <div className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full bg-white border-2 border-cyan-400 shadow-sm" />
                                                                {(exp.role || exp.company || exp.duration) && (
                                                                    <div className="flex justify-between items-start mb-1.5 flex-wrap gap-1">
                                                                        <div>
                                                                            {exp.role && <h4 className="text-[14px] font-black text-slate-800">{exp.role}</h4>}
                                                                            {exp.company && <p className="text-[11px] font-bold text-slate-500 uppercase">{exp.company}</p>}
                                                                        </div>
                                                                        {exp.duration && (
                                                                            <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 shrink-0">{exp.duration}</span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                                {exp.desc && (
                                                                    <p className="text-[12px] text-slate-500 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">{exp.desc}</p>
                                                                )}
                                                                {exp.milestones?.length > 0 && (
                                                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                                                        {exp.milestones.map((m, idx) => (
                                                                            <span key={idx} className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-black rounded-lg border border-emerald-100">
                                                                                <Trophy className="w-2 h-2" /> {m}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ));
                                                    })()}
                                                </div>
                                            </div>

                                            {/* Skills + Education */}
                                            <div className="md:col-span-4 space-y-5">
                                                <div>
                                                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100 mb-3">
                                                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Teknik Ekosistem</h3>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {(candidate.skills || ['React', 'Node.js', 'AWS', 'Redis']).map((s, i) => (
                                                            <span key={i} className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-slate-600 shadow-sm uppercase">{s}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="pt-4 border-t border-slate-100">
                                                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100 mb-3">
                                                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Eğitim & Sertifika</h3>
                                                    </div>
                                                    <p className="text-[12px] font-medium text-slate-600 italic leading-relaxed">
                                                        {candidate.education || candidate.educationDetail || 'Eğitim bilgisi bulunamadı.'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── POZİSYON EŞLEŞMELERİ ── */}
                                {activeTab === 'pos_matches' && (() => {
                                    const { candidateDomain, compatible, incompatible } = positionMatches;
                                    const scoreColor = (s) => s >= 70 ? '#10B981' : s >= 50 ? '#3B82F6' : s >= 30 ? '#F59E0B' : '#94A3B8';
                                    return (
                                        <div className="space-y-5 animate-in fade-in duration-300">
                                            {/* Domain header */}
                                            <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                                                <div className="w-9 h-9 rounded-xl bg-[#13294E]/10 flex items-center justify-center shrink-0">
                                                    <Layers className="w-4.5 h-4.5 text-[#13294E]" />
                                                </div>
                                                <div>
                                                    <p className="text-[11px] font-black text-slate-800">
                                                        Aday Meslek Alanı:
                                                        <span className="ml-1.5 px-2 py-0.5 bg-[#13294E]/10 text-[#13294E] rounded-md">{domainLabel(candidateDomain)}</span>
                                                    </p>
                                                    <p className="text-[10px] text-slate-400 mt-0.5">Her açık pozisyon ayrı skorlanır; otomatik eşleştirme uyumlu meslek alanına öncelik verir.</p>
                                                    {cleanRoleText(candidate.suggestedRole, candidate.position || '') && (
                                                        <p className="text-[10px] text-slate-500 mt-1">
                                                            CV'ye göre ideal rol:
                                                            <span className="ml-1 font-black text-slate-700">{cleanRoleText(candidate.suggestedRole, candidate.position || '')}</span>
                                                            <span className="ml-1 text-slate-300">(açık pozisyonlardan bağımsız)</span>
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="ml-auto flex items-center gap-3 text-center shrink-0">
                                                    <div>
                                                        <p className="text-[13px] font-black text-emerald-600">{compatible.length}</p>
                                                        <p className="text-[8px] text-slate-400 font-medium">Uyumlu</p>
                                                    </div>
                                                    <div className="w-px h-8 bg-slate-200" />
                                                    <div>
                                                        <p className="text-[13px] font-black text-slate-400">{incompatible.length}</p>
                                                        <p className="text-[8px] text-slate-400 font-medium">Ayrı Alan</p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Compatible positions */}
                                            {compatible.length === 0 ? (
                                                <div className="text-center py-10">
                                                    <Layers className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                                                    <p className="text-[12px] text-slate-400 font-medium">Uyumlu açık pozisyon bulunamadı.</p>
                                                    <p className="text-[10px] text-slate-300 mt-1">Yeni pozisyon eklendikten sonra burası güncellenecek.</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-2.5">
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">Eşleşen Pozisyonlar ({compatible.length})</p>
                                                    {compatible.map(({ position: pos, match, positionDomain, isAssigned }) => {
                                                    const saved = candidate.positionAnalyses?.[pos.title];
                                                    const busy = evaluatingTitle === pos.title;
                                                    const evalError = evaluateErrors[pos.title];
                                                    // BAYAT ANALİZ SESSİZ KALMAZ. İki ayrı sebep, aynı
                                                    // sonuç: bu skor bugünkü ilanla ölçülmedi.
                                                    const stale = saved && (isStaleFor(saved, pos) || !usesCurrentRubric(saved));
                                                    const analyzedAt = saved?.analyzedAt
                                                        ? new Date(saved.analyzedAt).toLocaleDateString('tr-TR')
                                                        : null;
                                                    return (
                                                        <div key={pos.id} className="bg-white border border-slate-100 hover:border-slate-200 rounded-2xl p-4 transition-all">
                                                            <div className="flex items-center gap-3">
                                                                {/* Score ring */}
                                                                <div className="relative w-11 h-11 flex items-center justify-center shrink-0">
                                                                    <svg className="absolute inset-0 -rotate-90" viewBox="0 0 44 44">
                                                                        <circle cx="22" cy="22" r="18" fill="none" stroke="#F1F5F9" strokeWidth="4" />
                                                                        <circle cx="22" cy="22" r="18" fill="none"
                                                                            stroke={scoreColor(match.score)} strokeWidth="4"
                                                                            strokeDasharray={`${(match.score / 100) * 113.1} 113.1`}
                                                                            strokeLinecap="round" />
                                                                    </svg>
                                                                    <span className="text-[10px] font-black" style={{ color: scoreColor(match.score) }}>%{match.score}</span>
                                                                </div>
                                                                {/* Info */}
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2 mb-0.5">
                                                                        <p className="text-[13px] font-black text-slate-800 truncate">{pos.title}</p>
                                                                        {match.isAi && (
                                                                            <span className="shrink-0 inline-flex items-center gap-1 text-[7px] font-black px-1.5 py-0.5 bg-violet-50 text-violet-600 border border-violet-100 rounded-full">
                                                                                <Sparkles className="w-2 h-2" /> AI
                                                                            </span>
                                                                        )}
                                                                        {match.score >= 70 && (
                                                                            <span className="shrink-0 inline-flex items-center gap-1 text-[7px] font-black px-1.5 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full">
                                                                                <TrendingUp className="w-2 h-2" /> Yüksek
                                                                            </span>
                                                                        )}
                                                                        {/* Skor bugünkü madde listesiyle ölçülmedi —
                                                                            söylemezsek kullanıcı güncel sanır. */}
                                                                        {stale && (
                                                                            <span
                                                                                title="Bu analiz ilanın ESKİ madde listesine ait; skor bugünkü ölçüyle uyumsuz"
                                                                                className="shrink-0 text-[7px] font-black px-1.5 py-0.5 bg-amber-50 text-amber-600 border border-amber-100 rounded-full"
                                                                            >
                                                                                BAYAT
                                                                            </span>
                                                                        )}
                                                                        {/* Kullanıcının kararı görünür durur: otonom
                                                                            tarama da bu ilanı bağlayıcı sayıyor. */}
                                                                        {isAssigned && (
                                                                            <span
                                                                                title="Bu adayı bu ilana siz atadınız; otonom tarama da bu ilanı esas alır"
                                                                                className="shrink-0 inline-flex items-center gap-1 text-[7px] font-black px-1.5 py-0.5 bg-cyan-50 text-cyan-700 border border-cyan-100 rounded-full"
                                                                            >
                                                                                <Target className="w-2 h-2" /> ATANDI
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                                                        <span>{pos.department || '—'}</span>
                                                                        <span>·</span>
                                                                        <span>{pos.minExperience ? `min ${pos.minExperience} yıl` : 'Deneyim belirtilmemiş'}</span>
                                                                        <span>·</span>
                                                                        <span className="text-blue-500 font-bold">{domainLabel(positionDomain)}</span>
                                                                    </div>
                                                                    {match.summary && (
                                                                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed line-clamp-2 italic">{match.summary}</p>
                                                                    )}
                                                                    {match.reasons.length > 0 && !match.summary && (
                                                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                                                            {match.reasons.slice(0, 3).map((r, ri) => (
                                                                                <span key={ri} className="text-[8px] font-medium px-1.5 py-0.5 bg-slate-50 border border-slate-100 rounded-md text-slate-500">{r}</span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* BU İLANA GÖRE DEĞERLENDİR — yalnızca bu ilan,
                                                                    tek AI çağrısı, diğer pozisyonların analizine
                                                                    dokunmaz. Skorun yanında AI rozeti varken bile
                                                                    "hangi tarihte, güncel mi" görünür olmalı. */}
                                                                <div className="shrink-0 self-start flex items-center gap-1.5">
                                                                    {/* ATAMA: adayın hangi ilan için düşünüldüğünü
                                                                        SİSTEM değil kullanıcı söyler. Otonom tarama
                                                                        atanan ilanı her zaman analiz kümesine alıyor
                                                                        (SystemScanner), bu yüzden meslek alanı
                                                                        filtresine takılan adaylar da ilerleyebiliyor. */}
                                                                    <button
                                                                        onClick={() => (isAssigned ? clearAssignment(pos) : assignToPosition(pos))}
                                                                        disabled={Boolean(assigningId)}
                                                                        title={isAssigned
                                                                            ? 'Atamayı kaldır'
                                                                            : 'Bu adayı bu ilana ata — otonom tarama da bu ilanı esas alır'}
                                                                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-colors disabled:opacity-40 ${
                                                                            isAssigned
                                                                                ? 'border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100'
                                                                                : 'border-slate-200 text-slate-600 hover:border-cyan-300 hover:text-cyan-700'
                                                                        }`}
                                                                    >
                                                                        <Target className="w-3 h-3" />
                                                                        {isAssigned ? 'Atamayı kaldır' : 'Bu ilana ata'}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => evaluateForPosition(pos)}
                                                                        disabled={Boolean(evaluatingTitle)}
                                                                        title={match.isAi
                                                                            ? 'Bu adayı bu ilana göre yeniden değerlendir (1 AI çağrısı)'
                                                                            : 'Bu adayı bu ilana göre değerlendir (1 AI çağrısı)'}
                                                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-600 hover:border-cyan-300 hover:text-cyan-700 transition-colors disabled:opacity-40"
                                                                    >
                                                                        {busy
                                                                            ? <><Loader2 className="w-3 h-3 animate-spin" /> Değerlendiriliyor</>
                                                                            : <><Sparkles className="w-3 h-3" /> {match.isAi ? 'Yeniden değerlendir' : 'Değerlendir'}</>}
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {(analyzedAt || evalError) && (
                                                                <div className="mt-2 pl-14 space-y-0.5">
                                                                    {analyzedAt && (
                                                                        <p className="text-[9px] text-slate-400">
                                                                            Değerlendirme tarihi: {analyzedAt}
                                                                            {stale && ' — ilanın o günkü madde listesine göre'}
                                                                        </p>
                                                                    )}
                                                                    {evalError && <p className="text-[10px] text-red-500 leading-relaxed">{evalError}</p>}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                    })}
                                                </div>
                                            )}

                                            {/* Incompatible — her biri yine de ayrı skorla listelenir */}
                                            {incompatible.length > 0 && (
                                                <div className="border border-dashed border-slate-200 rounded-2xl p-4">
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] mb-1">
                                                        Farklı Meslek Alanı ({incompatible.length} pozisyon)
                                                    </p>
                                                    <p className="text-[11px] text-slate-400">
                                                        Bu pozisyonlar aday profiliyle farklı meslek alanında; otomatik eşleştirme önceliği almaz ama her biri ayrıca skorlanır.
                                                    </p>
                                                    {/* MESLEK ALANI BİR SEZGİ, KİLİT DEĞİL. Tespit yanılabilir
                                                        ve yanıldığında aday hiçbir yere ilerleyemiyor: otonom
                                                        tarama uyumlu pozisyon bulamayınca analiz edecek bir şey
                                                        bulamıyor. "Ata" bu kararı insana geri veriyor. */}
                                                    <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                                                        Alan tespiti yanılmış olabilir. <strong>Ata</strong> derseniz bu ilan bağlayıcı
                                                        olur: otonom tarama da onu esas alır ve aday uyumlu listeye taşınır.
                                                    </p>
                                                    <div className="space-y-1 mt-2">
                                                        {incompatible.map(({ position: pos, match }) => (
                                                            <div key={pos.id} className="flex items-center gap-2 text-[10px]">
                                                                <span className="font-black w-9 text-right shrink-0" style={{ color: scoreColor(match.score) }}>%{match.score}</span>
                                                                <span className="text-slate-500 truncate">{pos.title}</span>
                                                                {match.isAi && (
                                                                    <span className="shrink-0 inline-flex items-center gap-0.5 text-[7px] font-black px-1 py-0.5 bg-violet-50 text-violet-600 border border-violet-100 rounded-full">
                                                                        <Sparkles className="w-2 h-2" /> AI
                                                                    </span>
                                                                )}
                                                                {/* ALAN DIŞI SAYILAN İLAN DA DEĞERLENDİRİLEBİLİR.
                                                                    "Bence bu aday bu ilana uyar" kararı sistemin
                                                                    değil kullanıcının; alan filtresi bir öneri,
                                                                    bir kilit değil. */}
                                                                <button
                                                                    onClick={() => assignToPosition(pos)}
                                                                    disabled={Boolean(assigningId)}
                                                                    title="Bu adayı bu ilana ata — alan tespitini ez, otonom tarama da bu ilanı esas alsın"
                                                                    className="shrink-0 ml-auto inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-cyan-600 hover:text-cyan-700 disabled:opacity-40"
                                                                >
                                                                    <Target className="w-2.5 h-2.5" /> ata
                                                                </button>
                                                                <button
                                                                    onClick={() => evaluateForPosition(pos)}
                                                                    disabled={Boolean(evaluatingTitle)}
                                                                    className="shrink-0 text-[9px] font-black uppercase tracking-wider text-slate-400 hover:text-cyan-600 disabled:opacity-40"
                                                                >
                                                                    {evaluatingTitle === pos.title ? 'değerlendiriliyor…' : 'değerlendir'}
                                                                </button>
                                                                <span className="text-slate-300 text-[9px] shrink-0">{pos.department || ''}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* ── MÜLAKATLAr ── */}
                                {activeTab === 'sessions' && (
                                    <div className="space-y-4 animate-in fade-in duration-300">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1 h-4 rounded-full bg-cyan-500" />
                                                <h3 className="text-[12px] font-black text-slate-800 uppercase tracking-widest">Planlanmış ve Gerçekleşen Görüşmeler</h3>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setPreselectedInterviewData({ candidateId: candidate.id });
                                                    window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }));
                                                }}
                                                className="text-[9px] font-black text-cyan-600 uppercase flex items-center gap-1 hover:underline transition-all"
                                            >
                                                <Plus className="w-3 h-3" /> MÜLAKAT PLANLA
                                            </button>
                                        </div>

                                        {(() => {
                                            const visibleSessions = (candidate.interviewSessions || []).filter(s =>
                                                s.status !== 'planned' || (s.title && s.participants?.length > 0)
                                            );
                                            return visibleSessions.length > 0 ? (
                                            <div className="space-y-3">
                                                {visibleSessions.map((session, sidx) => {
                                                    const cfg = getStatusCfg(session.status);
                                                    const isCompleted = session.status === 'completed';
                                                    const isLive = session.status === 'live';

                                                    const CardWrapper = isCompleted
                                                        ? ({ children, ...props }) => (
                                                            <button
                                                                {...props}
                                                                onClick={() => navigate(`/interview-report/${session.id}`)}
                                                                className="w-full text-left group cursor-pointer"
                                                            >
                                                                {children}
                                                            </button>
                                                        )
                                                        : ({ children, ...props }) => <div {...props}>{children}</div>;

                                                    return (
                                                        <CardWrapper key={sidx}>
                                                            <div className={`rounded-xl border p-4 transition-all flex items-center justify-between gap-4 ${
                                                                isCompleted
                                                                    ? 'bg-emerald-50 border-emerald-200 hover:border-emerald-400 hover:shadow-md hover:shadow-emerald-100'
                                                                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                                                            }`}>
                                                                <div className="flex items-center gap-3">
                                                                    {/* Icon */}
                                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${
                                                                        isCompleted
                                                                            ? 'bg-emerald-100 border-emerald-200'
                                                                            : `${cfg.bg} ${cfg.border} ${cfg.pulse ? 'animate-pulse' : ''}`
                                                                    }`}>
                                                                        {isCompleted
                                                                            ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                                                            : <Video className={`w-5 h-5 ${cfg.text}`} />
                                                                        }
                                                                    </div>

                                                                    {/* Info */}
                                                                    <div>
                                                                        <div className="flex items-center gap-2">
                                                                            <h4 className={`text-[12px] font-black ${isCompleted ? 'text-emerald-900' : 'text-slate-800'}`}>
                                                                                {session.title || 'Mülakat Seansı'}
                                                                            </h4>
                                                                            <span className={`text-[8px] font-black px-2 py-0.5 rounded-lg border ${cfg.bg} ${cfg.text} ${cfg.border} ${cfg.pulse ? 'animate-pulse' : ''}`}>
                                                                                {cfg.label}
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                                                            {session.date && (
                                                                                <span className="text-[9px] font-bold text-slate-500 flex items-center gap-0.5">
                                                                                    <Calendar className="w-2.5 h-2.5" />
                                                                                    {(session.date || '').split('T')[0]}
                                                                                </span>
                                                                            )}
                                                                            {session.time && (
                                                                                <span className="text-[9px] font-bold text-slate-500 flex items-center gap-0.5">
                                                                                    <Clock className="w-2.5 h-2.5" /> {session.time}
                                                                                </span>
                                                                            )}
                                                                            {session.interviewer && (
                                                                                <span className="text-[8.5px] font-black text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-lg border border-cyan-100">
                                                                                    {session.interviewer}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Right actions */}
                                                                <div className="flex items-center gap-2 shrink-0">
                                                                    {isLive && (
                                                                        <button
                                                                            onClick={e => { e.stopPropagation(); navigate(`/live-interview/${session.id}`); }}
                                                                            className="bg-rose-500 text-white px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-rose-600 transition-all shadow-sm animate-pulse"
                                                                        >
                                                                            SEANSA KATIL
                                                                        </button>
                                                                    )}

                                                                    {isCompleted && (
                                                                        <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-700 bg-white border border-emerald-200 px-3 py-1.5 rounded-lg shadow-sm group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600 transition-all">
                                                                            <Award className="w-3 h-3" /> Raporu Gör
                                                                            <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                                                                        </span>
                                                                    )}

                                                                    {!isCompleted && !isLive && (
                                                                        <>
                                                                            <button
                                                                                onClick={e => {
                                                                                    e.stopPropagation();
                                                                                    setPreselectedInterviewData({ candidateId: candidate.id, session });
                                                                                    window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }));
                                                                                }}
                                                                                className="p-1.5 text-slate-300 hover:text-cyan-500 transition-colors"
                                                                                title="Düzenle"
                                                                            >
                                                                                <Edit3 className="w-3.5 h-3.5" />
                                                                            </button>
                                                                            <button
                                                                                onClick={e => {
                                                                                    e.stopPropagation();
                                                                                    setPreselectedInterviewData({ candidateId: candidate.id, sessionId: session.id });
                                                                                    window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }));
                                                                                }}
                                                                                className="p-1.5 text-slate-300 hover:text-slate-600 transition-colors"
                                                                                title="Mülakat sayfasına git"
                                                                            >
                                                                                <ExternalLink className="w-3.5 h-3.5" />
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </CardWrapper>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="py-16 flex flex-col items-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                                                <div className="w-14 h-14 rounded-2xl bg-cyan-50 border border-cyan-100 flex items-center justify-center mb-3">
                                                    <Video className="w-7 h-7 text-cyan-300" />
                                                </div>
                                                <p className="text-[12px] text-slate-400 font-bold italic mb-4">Henüz mülakat planlanmamış</p>
                                                <button
                                                    onClick={() => {
                                                        setPreselectedInterviewData({ candidateId: candidate.id });
                                                        window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }));
                                                    }}
                                                    className="px-5 py-2 bg-cyan-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-cyan-600 transition-all shadow-sm"
                                                >
                                                    Mülakat Planla
                                                </button>
                                            </div>
                                        );
                                        })()}
                                    </div>
                                )}

                                {/* ── SÜREÇ GEÇMİŞİ ── */}
                                {activeTab === 'history' && (
                                    <div className="space-y-4 animate-in fade-in duration-300">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1 h-4 rounded-full bg-cyan-500" />
                                                <h3 className="text-[12px] font-black text-slate-800 uppercase tracking-widest">Süreç Yol Haritası</h3>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setPreselectedInterviewData({ candidateId: candidate.id });
                                                    window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }));
                                                }}
                                                className="text-[9px] font-black text-cyan-600 uppercase flex items-center gap-1 hover:underline"
                                            >
                                                <Plus className="w-3 h-3" /> MÜLAKAT EKLE
                                            </button>
                                        </div>

                                        <div className="space-y-2">
                                            {/* Static: AI Analysis milestone */}
                                            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                                                        <Brain className="w-4.5 h-4.5 text-blue-500" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-[13px] font-black text-slate-800">AI Detaylı CV Analizi</h4>
                                                        <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" /> Tamamlandı
                                                        </span>
                                                    </div>
                                                </div>
                                                <span className="text-[18px] font-black text-emerald-500">%{score}</span>
                                            </div>

                                            {/* Screening Result */}
                                            {candidate.screeningScore != null && (
                                                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center shrink-0">
                                                            <span className="text-[15px]">🎯</span>
                                                        </div>
                                                        <div>
                                                            <h4 className="text-[13px] font-black text-slate-800">Ön Eleme Sonucu</h4>
                                                            <span className="text-[10px] text-slate-400">{candidate.screeningResult?.summary || 'AI değerlendirmesi tamamlandı'}</span>
                                                        </div>
                                                    </div>
                                                    <span className="text-[18px] font-black text-indigo-600">%{Math.round(candidate.screeningScore)}</span>
                                                </div>
                                            )}

                                            {/* Dynamic: session milestones */}
                                            {(candidate.interviewSessions || []).filter(s =>
                                                s.status !== 'planned' || (s.title && s.participants?.length > 0)
                                            ).map((session, sidx) => {
                                                const cfg = getStatusCfg(session.status);
                                                return (
                                                    <div key={sidx} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between hover:border-slate-300 transition-all group shadow-sm">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${cfg.bg} ${cfg.border}`}>
                                                                <Play className={`w-4 h-4 ${cfg.text}`} />
                                                            </div>
                                                            <div>
                                                                <h4 className="text-[13px] font-black text-slate-800">{session.title || 'Mülakat'}</h4>
                                                                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                                                    <Calendar className="w-2.5 h-2.5" />
                                                                    {(session.date || '').split('T')[0] || '—'}
                                                                    {' • '}
                                                                    <span className={cfg.text}>{cfg.label}</span>
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                            <button
                                                                onClick={() => {
                                                                    setPreselectedInterviewData({ candidateId: candidate.id, sessionId: session.id });
                                                                    window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }));
                                                                }}
                                                                className="px-3 py-1 bg-slate-800 text-white rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-cyan-600 transition-all"
                                                            >
                                                                YÖNET
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setPreselectedInterviewData({ candidateId: candidate.id, session });
                                                                    window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }));
                                                                }}
                                                                className="p-1.5 text-slate-300 hover:text-cyan-500 transition-colors"
                                                            >
                                                                <Edit3 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {/* Static: future milestone */}
                                            <div className="bg-white border border-dashed border-slate-200 rounded-xl p-4 flex items-center justify-between opacity-40">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                                                        <Trophy className="w-4 h-4 text-slate-400" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-[13px] font-black text-slate-500">Final Kararı ve Teklif</h4>
                                                        <span className="text-[10px] font-bold text-slate-400">Hedeflenen Aşama</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── MESAJLAR TAB ────────────────────────────────── */}
                                {activeTab === 'messages' && (
                                    <div className="space-y-3 animate-in fade-in duration-300">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1 h-4 rounded-full bg-cyan-500" />
                                                <h3 className="text-[12px] font-black text-slate-800 uppercase tracking-widest">Bilgi Talepleri</h3>
                                            </div>
                                            {candidateInfoReqs.length > 0 && (
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{candidateInfoReqs.length} talep</span>
                                            )}
                                        </div>

                                        {infoReqsLoading && (
                                            <div className="space-y-2">
                                                {[1, 2].map(i => (
                                                    <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-4 animate-pulse">
                                                        <div className="h-3 bg-slate-200 rounded w-1/2 mb-2" />
                                                        <div className="h-2 bg-slate-200 rounded w-3/4" />
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {!infoReqsLoading && candidateInfoReqs.length === 0 && (
                                            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                                                <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                                                    <MessageSquare className="w-6 h-6 text-slate-300" />
                                                </div>
                                                <p className="text-[11px] text-slate-400">Bu aday için henüz bilgi talebi gönderilmedi.</p>
                                            </div>
                                        )}

                                        {!infoReqsLoading && candidateInfoReqs.map(req => {
                                            const isPending = req.status === 'pending';
                                            const createdAt = req.createdAt?.toDate?.()?.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) || '—';
                                            return (
                                                <div key={req.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-sm">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <FileText className="w-3.5 h-3.5 text-cyan-500" />
                                                            <span className="text-[11px] font-black text-slate-700">Bilgi Talebi</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black ${isPending ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'}`}>
                                                                {isPending ? <Clock className="w-2.5 h-2.5" /> : <CheckCircle2 className="w-2.5 h-2.5" />}
                                                                {isPending ? 'Bekliyor' : 'Yanıtlandı'}
                                                            </span>
                                                            <span className="text-[9px] text-slate-400">{createdAt}</span>
                                                        </div>
                                                    </div>
                                                    {req.requestMessage && (
                                                        <p className="text-[11px] text-slate-500 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">{req.requestMessage}</p>
                                                    )}
                                                    {req.requestedItems?.length > 0 && (
                                                        <ul className="space-y-1 pl-1">
                                                            {req.requestedItems.map((item, i) => (
                                                                <li key={i} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                                                    <span className="w-1 h-1 rounded-full bg-cyan-400 shrink-0" /> {item}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                    <p className="text-[9px] text-slate-400">Gönderen: {req.recruiterName || '—'}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Footer actions */}
                            <div className="border-t border-slate-100 px-5 py-2.5 flex items-center justify-between bg-white shrink-0">
                                {/* Success toast */}
                                {actionSuccess && (
                                    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-[10px] font-black rounded-xl shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                        {actionSuccess === 'comment' && 'Yorum kaydedildi'}
                                        {actionSuccess === 'reject' && 'Aday reddedildi'}
                                        {actionSuccess === 'final' && 'Final turuna taşındı'}
                                        {actionSuccess === 'stage' && 'Aşama güncellendi'}
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setCommentModal(true)}
                                        className="h-8 px-4 bg-slate-50 text-slate-600 rounded-lg text-[9px] font-black uppercase border border-slate-200 hover:bg-slate-100 transition-all flex items-center gap-1.5"
                                    >
                                        <MessageSquare className="w-3 h-3" /> Yorum
                                        {candidate?.hrComments?.length > 0 && (
                                            <span className="ml-0.5 bg-cyan-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                                                {candidate.hrComments.length}
                                            </span>
                                        )}
                                    </button>
                                    {candidate?.email && (
                                        <button
                                            onClick={() => { setFeedbackText(''); setFeedbackOutcome('positive'); setInfoMessage(''); setInfoItems([]); setMsgTab('feedback'); setFeedbackModal(true); }}
                                            className="h-8 px-3 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-black uppercase border border-emerald-200 hover:bg-emerald-100 transition-all flex items-center gap-1.5"
                                            title="Adaya Mesaj Gönder"
                                        >
                                            <Mail className="w-3 h-3" /> Mesaj Gönder
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setDeleteModal(true)}
                                        className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 border border-slate-200 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-all"
                                        title="Adayı Sil"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>

                                {/* Stage selector dropdown */}
                                <div className="relative">
                                    <button
                                        disabled={actionLoading}
                                        onClick={() => setStatusDropdownOpen(v => !v)}
                                        className="h-8 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1.5 transition-all bg-cyan-500 hover:bg-cyan-600 text-white disabled:opacity-50"
                                    >
                                        {actionLoading
                                            ? <Loader2 className="w-3 h-3 animate-spin" />
                                            : (() => {
                                                const cur = PIPELINE_STAGES.find(s => s.value === normalizePipelineStatus(candidate?.status));
                                                return cur ? cur.label : 'Aşama';
                                            })()
                                        }
                                        <ChevronDown className="w-3 h-3" />
                                    </button>
                                    {statusDropdownOpen && (
                                        <div className="absolute bottom-10 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl py-1 min-w-[140px] animate-in fade-in zoom-in-95 duration-150">
                                            {PIPELINE_STAGES.map(stage => {
                                                const isCurrent = stage.value === normalizePipelineStatus(candidate?.status);
                                                return (
                                                    <button
                                                        key={stage.value}
                                                        disabled={isCurrent}
                                                        onClick={() => handleStatusChange(stage.value)}
                                                        className={`w-full text-left px-3 py-1.5 text-[10px] font-bold flex items-center gap-2 transition-colors ${
                                                            isCurrent
                                                                ? `${stage.bg} ${stage.color} cursor-default`
                                                                : 'hover:bg-slate-50 text-slate-700'
                                                        }`}
                                                    >
                                                        {isCurrent && <CheckCircle2 className="w-3 h-3 shrink-0" />}
                                                        {!isCurrent && <span className="w-3 h-3 shrink-0" />}
                                                        {stage.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {statusDropdownOpen && (
                                        <div className="fixed inset-0 z-40" onClick={() => setStatusDropdownOpen(false)} />
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
                            <Brain className="w-14 h-14 mb-3 animate-pulse" />
                            <h2 className="text-[11px] font-black uppercase tracking-widest">Yükleniyor…</h2>
                        </div>
                    )}
                </main>
            </div>

            {/* ── YORUM MODALI ─────────────────────────────────────────────── */}
            {commentModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <MessageSquare className="w-4 h-4 text-cyan-500" />
                                <h3 className="text-[13px] font-black text-slate-800">HR Yorumu Ekle</h3>
                            </div>
                            <button onClick={() => setCommentModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Existing comments */}
                        {candidate?.hrComments?.length > 0 && (
                            <div className="px-6 pt-4 space-y-2 max-h-40 overflow-y-auto">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Önceki Yorumlar</p>
                                {candidate.hrComments.map((c, i) => (
                                    <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                                        <p className="text-[11px] text-slate-700 leading-relaxed">{c.text}</p>
                                        <p className="text-[9px] font-bold text-slate-400 mt-1">{c.author} • {c.createdAt?.split('T')[0]}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="px-6 py-4 space-y-3">
                            <textarea
                                value={commentText}
                                onChange={e => setCommentText(e.target.value)}
                                placeholder={`${candidate?.name} hakkında yorumunuzu yazın...`}
                                className="w-full h-28 bg-slate-50 border border-slate-200 rounded-xl p-3 text-[12px] text-slate-700 placeholder-slate-400 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-50 resize-none transition-all"
                            />
                            <div className="flex gap-2 justify-end">
                                <button onClick={() => setCommentModal(false)} className="h-9 px-4 rounded-xl text-[10px] font-black text-slate-500 border border-slate-200 hover:bg-slate-50 transition-all">İptal</button>
                                <button
                                    onClick={handleComment}
                                    disabled={!commentText.trim() || actionLoading}
                                    className={`h-9 px-5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${
                                        commentText.trim() && !actionLoading
                                            ? 'bg-cyan-500 hover:bg-cyan-600 text-white shadow-sm'
                                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    }`}
                                >
                                    {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                    Kaydet
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── RET MODALI ───────────────────────────────────────────────── */}
            {rejectModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <XCircle className="w-4 h-4 text-red-500" />
                                <h3 className="text-[13px] font-black text-slate-800">Adayı Reddet</h3>
                            </div>
                            <button onClick={() => setRejectModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="px-6 py-4 space-y-4">
                            <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                <p className="text-[11px] text-red-700 leading-relaxed">
                                    <span className="font-black">{candidate?.name}</span> adlı adayı süreçten çıkarmak üzeresiniz. Bu işlem Firestore'a kaydedilir.
                                </p>
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Red Nedeni (İsteğe Bağlı)</label>
                                <select
                                    value={rejectReason}
                                    onChange={e => setRejectReason(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[12px] text-slate-700 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-50 transition-all"
                                >
                                    <option value="">Neden seçin...</option>
                                    <option value="Teknik Yetersizlik">Teknik Yetersizlik</option>
                                    <option value="Deneyim Eksikliği">Deneyim Eksikliği</option>
                                    <option value="Kültürel Uyumsuzluk">Kültürel Uyumsuzluk</option>
                                    <option value="Maaş Beklentisi">Maaş Beklentisi Uyumsuz</option>
                                    <option value="Pozisyon Dolu">Pozisyon Dolu</option>
                                    <option value="Diğer">Diğer</option>
                                </select>
                            </div>
                            <div className="flex gap-2 justify-end pt-1">
                                <button onClick={() => setRejectModal(false)} className="h-9 px-4 rounded-xl text-[10px] font-black text-slate-500 border border-slate-200 hover:bg-slate-50 transition-all">İptal</button>
                                <button
                                    onClick={handleReject}
                                    disabled={actionLoading}
                                    className="h-9 px-5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white shadow-sm transition-all disabled:opacity-60"
                                >
                                    {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                                    Reddet
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── FİNAL TURU MODALI ────────────────────────────────────────── */}
            {finalModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <Trophy className="w-4 h-4 text-amber-500" />
                                <h3 className="text-[13px] font-black text-slate-800">Final Turuna Taşı</h3>
                            </div>
                            <button onClick={() => setFinalModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="px-6 py-4 space-y-4">
                            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
                                <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center mx-auto mb-3">
                                    <Trophy className="w-6 h-6 text-amber-500" />
                                </div>
                                <p className="text-[12px] font-black text-amber-800 mb-1">{candidate?.name}</p>
                                <p className="text-[11px] text-amber-700 leading-relaxed">
                                    Bu adayı final turuna taşımak istediğinizi onaylıyor musunuz? Durum Firestore'da güncellenecektir.
                                </p>
                            </div>
                            <div className="flex gap-2 justify-end">
                                <button onClick={() => setFinalModal(false)} className="h-9 px-4 rounded-xl text-[10px] font-black text-slate-500 border border-slate-200 hover:bg-slate-50 transition-all">İptal</button>
                                <button
                                    onClick={handleFinal}
                                    disabled={actionLoading}
                                    className="h-9 px-5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white shadow-sm transition-all disabled:opacity-60"
                                >
                                    {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                                    Onayla ve Taşı
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── SİL MODALI ───────────────────────────────────────────────── */}
            {deleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <Trash2 className="w-4 h-4 text-red-500" />
                                <h3 className="text-[13px] font-black text-slate-800">Adayı Sil</h3>
                            </div>
                            <button onClick={() => setDeleteModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
                                <div className="w-12 h-12 rounded-2xl bg-red-100 border border-red-200 flex items-center justify-center mx-auto mb-3">
                                    <Trash2 className="w-6 h-6 text-red-500" />
                                </div>
                                <p className="text-[12px] font-black text-red-800 mb-1">{candidate?.name}</p>
                                <p className="text-[11px] text-red-700 leading-relaxed">
                                    Bu adayı kalıcı olarak silmek istediğinizi onaylıyor musunuz? Bu işlem geri alınamaz.
                                </p>
                            </div>
                            <div className="flex gap-2 justify-end">
                                <button onClick={() => setDeleteModal(false)} className="h-9 px-4 rounded-xl text-[10px] font-black text-slate-500 border border-slate-200 hover:bg-slate-50 transition-all">İptal</button>
                                <button
                                    onClick={handleDelete}
                                    disabled={actionLoading}
                                    className="h-9 px-5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white shadow-sm transition-all disabled:opacity-60"
                                >
                                    {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                    Evet, Sil
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── GERİ BİLDİRİM MAİLİ MODALI ──────────────────────────────── */}
            {feedbackModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg animate-in zoom-in-95 duration-200">

                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 text-emerald-500" />
                                <h3 className="text-[13px] font-black text-slate-800">Adaya Mesaj Gönder</h3>
                            </div>
                            <button onClick={() => setFeedbackModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {feedbackSuccess ? (
                            <div className="px-6 py-10 flex flex-col items-center gap-3">
                                <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                                <p className="text-[13px] font-black text-emerald-700">Mail başarıyla gönderildi!</p>
                                <p className="text-[11px] text-slate-400">{candidate?.email}</p>
                            </div>
                        ) : (
                            <div className="px-6 py-4 space-y-4">

                                {/* Alıcı */}
                                <div>
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Alıcı</label>
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[12px] text-slate-600 font-medium">{candidate?.email}</div>
                                </div>

                                {/* Tab switcher */}
                                <div className="flex rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-0.5 gap-0.5">
                                    <button
                                        onClick={() => setMsgTab('feedback')}
                                        className={`flex-1 h-8 flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${msgTab === 'feedback' ? 'bg-white text-emerald-600 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        <Send className="w-3 h-3" /> Geri Bildirim
                                    </button>
                                    <button
                                        onClick={() => setMsgTab('info')}
                                        className={`flex-1 h-8 flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${msgTab === 'info' ? 'bg-white text-cyan-600 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        <FileQuestion className="w-3 h-3" /> Bilgi İste
                                    </button>
                                </div>

                                {/* ── Geri Bildirim tab ── */}
                                {msgTab === 'feedback' && (
                                    <div className="space-y-4 animate-in fade-in duration-200">
                                        {/* Sonuç */}
                                        <div>
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Sonuç</label>
                                            <div className="flex gap-2">
                                                {[
                                                    { v: 'positive', label: 'Olumlu',    active: 'bg-emerald-500 text-white border-emerald-500', inactive: 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100' },
                                                    { v: 'hold',     label: 'Beklemede', active: 'bg-amber-500 text-white border-amber-500',   inactive: 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100' },
                                                    { v: 'negative', label: 'Olumsuz',   active: 'bg-red-500 text-white border-red-500',       inactive: 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' },
                                                ].map(({ v, label, active, inactive }) => (
                                                    <button key={v} onClick={() => setFeedbackOutcome(v)}
                                                        className={`flex-1 h-8 rounded-lg text-[9px] font-black uppercase tracking-wide border transition-all ${feedbackOutcome === v ? active : inactive}`}
                                                    >{label}</button>
                                                ))}
                                            </div>
                                        </div>
                                        {/* Feedback text */}
                                        <div>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Geri Bildirim Metni</label>
                                                <button onClick={handleGenerateFeedbackText} disabled={feedbackAiLoading}
                                                    className="flex items-center gap-1 px-2.5 py-1 bg-violet-50 text-violet-600 border border-violet-200 rounded-lg text-[9px] font-black hover:bg-violet-100 transition-all disabled:opacity-60"
                                                >
                                                    {feedbackAiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
                                                    AI ile Oluştur
                                                </button>
                                            </div>
                                            <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)}
                                                placeholder="Adaya iletmek istediğiniz geri bildirimi yazın..."
                                                rows={5}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-[12px] text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 resize-none transition-all"
                                            />
                                        </div>
                                        <div className="flex gap-2 justify-end pt-1">
                                            <button onClick={() => setFeedbackModal(false)} className="h-9 px-4 rounded-xl text-[10px] font-black text-slate-500 border border-slate-200 hover:bg-slate-50 transition-all">İptal</button>
                                            <button onClick={handleSendFeedback} disabled={!feedbackText.trim() || feedbackLoading}
                                                className="h-9 px-5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm transition-all disabled:opacity-60"
                                            >
                                                {feedbackLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                                Gönder
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* ── Bilgi İste tab ── */}
                                {msgTab === 'info' && (
                                    <div className="space-y-4 animate-in fade-in duration-200">
                                        <div>
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Mesajınız</label>
                                            <textarea value={infoMessage} onChange={e => setInfoMessage(e.target.value)}
                                                placeholder="Adaya iletmek istediğiniz mesaj veya açıklama..."
                                                rows={4}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-[12px] text-slate-700 placeholder-slate-400 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-50 resize-none transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Talep Edilen Belgeler / Bilgiler</label>
                                            <div className="flex gap-2 mb-2">
                                                <input value={newInfoItem} onChange={e => setNewInfoItem(e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter' && newInfoItem.trim()) { setInfoItems(p => [...p, newInfoItem.trim()]); setNewInfoItem(''); } }}
                                                    placeholder="Örn: CV, Diploma fotokopisi, Referans mektubu..."
                                                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[12px] text-slate-700 outline-none focus:border-cyan-400 transition-all"
                                                />
                                                <button onClick={() => { if (newInfoItem.trim()) { setInfoItems(p => [...p, newInfoItem.trim()]); setNewInfoItem(''); } }}
                                                    className="w-9 h-9 rounded-xl bg-cyan-50 border border-cyan-200 text-cyan-600 hover:bg-cyan-100 transition-all flex items-center justify-center shrink-0"
                                                ><Plus className="w-4 h-4" /></button>
                                            </div>
                                            {infoItems.length > 0 && (
                                                <ul className="space-y-1.5">
                                                    {infoItems.map((item, i) => (
                                                        <li key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] text-slate-600 font-medium">
                                                            <FileQuestion className="w-3 h-3 text-cyan-500 shrink-0" />
                                                            <span className="flex-1">{item}</span>
                                                            <button onClick={() => setInfoItems(p => p.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-400 transition-colors"><Trash2 className="w-3 h-3" /></button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                        <div className="flex gap-2 justify-end pt-1">
                                            <button onClick={() => setFeedbackModal(false)} className="h-9 px-4 rounded-xl text-[10px] font-black text-slate-500 border border-slate-200 hover:bg-slate-50 transition-all">İptal</button>
                                            <button onClick={handleInfoRequestSend} disabled={infoSending || (!infoMessage.trim() && infoItems.length === 0)}
                                                className="h-9 px-5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white shadow-sm transition-all disabled:opacity-60"
                                            >
                                                {infoSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                                Gönder
                                            </button>
                                        </div>
                                    </div>
                                )}

                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── TOPLU YÜKLEME MODALI ──────────────────────────────────────── */}
            {bulkImportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <Upload className="w-4 h-4 text-violet-500" />
                                <h3 className="text-[13px] font-black text-slate-800">Toplu CV Yükleme</h3>
                            </div>
                            <button
                                onClick={() => setBulkImportModal(false)}
                                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="px-6 py-4 space-y-4">
                            {/* Drag-drop / JSON area */}
                            {!bulkImporting && bulkProgress.total === 0 && (
                                <>
                                    {/* Tab switcher */}
                                    <div className="flex rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-0.5">
                                        <button
                                            onClick={() => setBulkTab('files')}
                                            className={`flex-1 h-7 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${bulkTab === 'files' ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            Dosya Yükle
                                        </button>
                                        <button
                                            onClick={() => setBulkTab('json')}
                                            className={`flex-1 h-7 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${bulkTab === 'json' ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            JSON Kayıt
                                        </button>
                                    </div>

                                    {bulkTab === 'files' && (
                                        <>
                                            <div
                                                onDragOver={e => e.preventDefault()}
                                                onDrop={e => {
                                                    e.preventDefault();
                                                    const files = Array.from(e.dataTransfer.files).filter(f => /\.(pdf|docx|zip)$/i.test(f.name));
                                                    setBulkFiles(prev => [...prev, ...files].slice(0, MAX_SOURCES));
                                                }}
                                                onClick={() => document.getElementById('bulk-cv-input')?.click()}
                                                className="border-2 border-dashed border-violet-200 rounded-xl p-8 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50/30 transition-all"
                                            >
                                                <input
                                                    id="bulk-cv-input"
                                                    type="file"
                                                    accept=".pdf,.docx,.zip"
                                                    multiple
                                                    className="hidden"
                                                    onChange={e => {
                                                        const files = Array.from(e.target.files || []);
                                                        setBulkFiles(prev => [...prev, ...files].slice(0, MAX_SOURCES));
                                                    }}
                                                />
                                                <Upload className="w-8 h-8 text-violet-300 mx-auto mb-2" />
                                                <p className="text-[13px] font-bold text-slate-500">Sürükleyin veya tıklayın</p>
                                                <p className="text-[10px] text-slate-400 mt-1">PDF, DOCX veya ZIP (içinde PDF/DOCX) • Maks. {MAX_SOURCES} dosya, her biri {formatBytes(MAX_SOURCE_BYTES)}</p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">Bir ZIP&apos;in içinde kaç CV olduğu sınırlı değil — hepsini tek arşive koyabilirsiniz.</p>
                                            </div>

                                            {bulkFiles.length > 0 && (
                                                <>
                                                    <div className="space-y-1 max-h-32 overflow-y-auto">
                                                        {bulkFiles.map((f, i) => {
                                                            const tooBig = (f.size || 0) > MAX_SOURCE_BYTES;
                                                            return (
                                                                <div key={i} className={`flex items-center justify-between px-3 py-1.5 rounded-lg border ${tooBig ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                                                                    <span className={`text-[11px] font-medium truncate ${tooBig ? 'text-red-600' : 'text-slate-600'}`}>{f.name}</span>
                                                                    <div className="flex items-center gap-2 shrink-0 ml-2">
                                                                        <span className={`text-[10px] font-semibold ${tooBig ? 'text-red-400' : 'text-slate-400'}`}>{formatBytes(f.size)}</span>
                                                                        <button
                                                                            onClick={() => setBulkFiles(prev => prev.filter((_, j) => j !== i))}
                                                                            className="text-slate-300 hover:text-red-400"
                                                                        >
                                                                            <X className="w-3 h-3" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    <div className="flex items-center justify-between px-1">
                                                        <span className="text-[10px] text-slate-400 font-semibold">
                                                            Toplam: {formatBytes(totalBytes(bulkFiles))}
                                                        </span>
                                                        {(() => {
                                                            const oversized = oversizedFiles(bulkFiles);
                                                            if (oversized.length > 0) return (
                                                                <span className="text-[10px] text-red-500 font-bold">
                                                                    {oversized.length} dosya {formatBytes(MAX_SOURCE_BYTES)} sınırını aşıyor
                                                                </span>
                                                            );
                                                            return null;
                                                        })()}
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    )}

                                    {bulkTab === 'json' && (
                                        <div className="space-y-2">
                                            <p className="text-[10px] text-slate-400">Şu formatta bir JSON dizisi yapıştırın:</p>
                                            <pre className="text-[9px] text-slate-400 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200 overflow-x-auto">{`[{"name":"Ali Veli","email":"ali@sirket.com","cvText":"..."}]`}</pre>
                                            <textarea
                                                value={bulkJsonText}
                                                onChange={e => setBulkJsonText(e.target.value)}
                                                placeholder='[{"name":"...","email":"...","cvText":"..."}]'
                                                rows={5}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[11px] text-slate-700 outline-none focus:border-violet-300 transition-all resize-none font-mono"
                                            />
                                        </div>
                                    )}

                                    {/* Position selector */}
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Hedef Pozisyon</label>
                                        <select
                                            value={bulkPositionId}
                                            onChange={e => setBulkPositionId(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[12px] text-slate-700 outline-none focus:border-violet-300 transition-all"
                                        >
                                            <option value="">— Pozisyon seçin —</option>
                                            {positions.filter(p => p.status === 'open').map(p => (
                                                <option key={p.id} value={p.id}>{p.title}</option>
                                            ))}
                                        </select>
                                        {!bulkPositionId && (
                                            <p className="mt-1.5 text-[10px] text-amber-600 font-semibold flex items-start gap-1">
                                                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                                                Pozisyon seçilmezse adaylar genel havuza alınır ve sizin belirlediğiniz bir pozisyona göre puanlanmaz — sistem en uygun açık pozisyonu kendisi seçer.
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex gap-2 justify-end">
                                        <button onClick={() => setBulkImportModal(false)} className="h-9 px-4 rounded-xl text-[10px] font-black text-slate-500 border border-slate-200 hover:bg-slate-50 transition-all">İptal</button>
                                        <button
                                            onClick={handleBulkImport}
                                            disabled={bulkTab === 'files' ? !bulkFiles.length : !bulkJsonText.trim()}
                                            className="h-9 px-5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 bg-violet-500 hover:bg-violet-600 text-white shadow-sm transition-all disabled:opacity-60"
                                        >
                                            <Upload className="w-3.5 h-3.5" />
                                            {bulkTab === 'json' ? 'Kayıtları İçe Aktar' : `Yüklemeyi Başlat (${bulkFiles.length} dosya)`}
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* Progress */}
                            {(bulkImporting || bulkProgress.total > 0) && (
                                <div className="space-y-3">
                                    {/* Progress bar — yükleme sırasında BAYT, sonrasında KAYIT sayar.
                                        Dosya Storage'a giderken kaç CV olduğu henüz bilinmiyor; kayıt
                                        çubuğunu "0/0" göstermek, ölçülmemiş bir ilerlemeyi ölçülmüş
                                        gibi sunmak olurdu. */}
                                    {bulkUploadProgress ? (
                                        <div>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Yükleniyor</span>
                                                <span className="text-[10px] font-bold text-slate-400">
                                                    {formatBytes(bulkUploadProgress.transferred)} / {formatBytes(bulkUploadProgress.total)}
                                                </span>
                                            </div>
                                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-violet-500 transition-all duration-300"
                                                    style={{ width: `${bulkUploadProgress.total > 0 ? (bulkUploadProgress.transferred / bulkUploadProgress.total) * 100 : 0}%` }}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">İlerleme</span>
                                                <span className="text-[10px] font-bold text-slate-400">{bulkProgress.completed + bulkProgress.failed} / {bulkProgress.total}</span>
                                            </div>
                                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-500 ${bulkProgress.failed > 0 && bulkProgress.completed === 0 ? 'bg-red-400' : 'bg-violet-500'}`}
                                                    style={{ width: `${bulkProgress.total > 0 ? ((bulkProgress.completed + bulkProgress.failed) / bulkProgress.total) * 100 : 0}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* File list — static display, icons reflect aggregate job counters */}
                                    <div className="space-y-1 max-h-48 overflow-y-auto">
                                        {bulkProgress.items.map((item, i) => {
                                            const doneCount = bulkProgress.completed;
                                            const failedCount = bulkProgress.failed;
                                            const rank = i + 1;
                                            const itemStatus =
                                                rank <= doneCount ? 'done' :
                                                rank <= doneCount + failedCount ? 'error' :
                                                (bulkProgress.status === 'processing' && rank === doneCount + failedCount + 1) ? 'processing' :
                                                'pending';
                                            return (
                                                <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-[11px] ${
                                                    itemStatus === 'done' ? 'bg-emerald-50 border-emerald-200' :
                                                    itemStatus === 'error' ? 'bg-red-50 border-red-200' :
                                                    itemStatus === 'processing' ? 'bg-violet-50 border-violet-200' :
                                                    'bg-slate-50 border-slate-200'
                                                }`}>
                                                    <span className="font-medium text-slate-700 truncate">{item.name}</span>
                                                    <span className="shrink-0 ml-2">
                                                        {itemStatus === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                                                        {itemStatus === 'error' && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                                                        {itemStatus === 'processing' && <Loader2 className="w-3.5 h-3.5 text-violet-500 animate-spin" />}
                                                        {itemStatus === 'pending' && <Clock className="w-3.5 h-3.5 text-slate-300" />}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Status badge */}
                                    {bulkProgress.status && (
                                        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-bold ${
                                            bulkProgress.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                            bulkProgress.status === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
                                            ['processing', 'uploading', 'unpacking'].includes(bulkProgress.status) ? 'bg-violet-50 text-violet-700 border border-violet-200' :
                                            'bg-slate-50 text-slate-500 border border-slate-200'
                                        }`}>
                                            {['processing', 'uploading', 'unpacking'].includes(bulkProgress.status) && <Loader2 className="w-3 h-3 animate-spin" />}
                                            {bulkProgress.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                                            {bulkProgress.status === 'error' && <XCircle className="w-3 h-3" />}
                                            {bulkProgress.status === 'queued' && <Clock className="w-3 h-3" />}
                                            <span>
                                                {bulkProgress.status === 'completed' ? `Tamamlandı — ${bulkProgress.completed - (bulkProgress.duplicates || 0)} başarılı${bulkProgress.duplicates > 0 ? `, ${bulkProgress.duplicates} mükerrer atlandı` : ''}${bulkProgress.failed > 0 ? `, ${bulkProgress.failed} hatalı` : ''}${bulkProgress.avgScore != null ? ` · Ort. Eşleşme: %${bulkProgress.avgScore}` : ''}` :
                                                 bulkProgress.status === 'error' ? (bulkProgress.errorMessage || 'İşlem hatası oluştu') :
                                                 bulkProgress.status === 'uploading' ? 'Dosyalar yükleniyor — sekmeyi kapatmayın' :
                                                 // Toplam büyürken gösterilir: sayı henüz kesin değil.
                                                 bulkProgress.status === 'unpacking' ? `Arşiv açılıyor — ${bulkProgress.total} CV bulundu` :
                                                 bulkProgress.status === 'processing' ? `İşleniyor… ${bulkProgress.completed + bulkProgress.failed}/${bulkProgress.total}` :
                                                 'Sıraya alındı'}
                                            </span>
                                        </div>
                                    )}

                                    {!bulkImporting && (
                                        <button
                                            onClick={() => { setBulkImportModal(false); setBulkProgress({ total: 0, completed: 0, failed: 0, items: [], avgScore: null, status: null }); setBulkJobIds([]); setBulkFiles([]); setBulkTab('files'); setBulkJsonText(''); }}
                                            className="w-full h-9 rounded-xl text-[10px] font-black text-white bg-slate-800 hover:bg-slate-900 uppercase tracking-widest transition-all"
                                        >
                                            Kapat
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Import completion toast */}
            {bulkToast && (
                <div className="fixed bottom-6 right-6 z-[200] flex items-start gap-3 px-4 py-3 bg-white rounded-2xl shadow-2xl border border-emerald-200 max-w-xs animate-in slide-in-from-bottom-4 duration-300">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-black text-slate-800">Toplu Yükleme Tamamlandı</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                            {bulkToast.completed - (bulkToast.duplicates || 0)} aday eklendi{(bulkToast.duplicates || 0) > 0 && <span className="text-amber-600">, {bulkToast.duplicates} mükerrer atlandı</span>}{bulkToast.failed > 0 && <span className="text-red-500">, {bulkToast.failed} hata</span>}
                        </p>
                        {bulkToast.avgScoreByPosition && Object.keys(bulkToast.avgScoreByPosition).length > 0 ? (
                            <div className="mt-1 space-y-0.5">
                                {Object.entries(bulkToast.avgScoreByPosition).map(([pId, entry]) => (
                                    <p key={pId} className="text-[10px] text-violet-600 truncate">
                                        {entry.positionTitle || pId}: <span className="font-bold">%{entry.avgScore}</span> ort. eşleşme ({entry.count} aday)
                                    </p>
                                ))}
                            </div>
                        ) : bulkToast.avgScore != null && (
                            <p className="text-[11px] text-violet-600 mt-0.5">Ort. eşleşme: %{bulkToast.avgScore}</p>
                        )}
                    </div>
                    <button onClick={() => setBulkToast(null)} className="text-slate-300 hover:text-slate-500 ml-2 shrink-0">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            <AddCandidateModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />

        </div>
    );
}
