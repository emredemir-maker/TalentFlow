// src/pages/CandidateProcessPage.jsx
import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import { useAuth } from '../context/AuthContext';
import { analyzeCandidateMatch, parseExperiencesFromText, parseCandidateFromText } from '../services/geminiService';
import { extractTextFromFile } from '../services/cvParser';
import { calculateMatchScore, filterPositionsByDomain, domainLabel, detectCandidateDomain, detectPositionDomain } from '../services/matchService';
import { applyPiiMask, stripPiiForAI } from '../utils/pii';
import { getFeedbackEmail } from '../utils/templateService';
import { db } from '../config/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import SystemScanner from '../components/SystemScanner';
import AddCandidateModal from '../components/AddCandidateModal';
import SendMessageModal from '../components/SendMessageModal';
import {
    Plus, Search, Zap, Brain, X,
    Target, ShieldCheck, ArrowRight, FileText, Clock,
    AlertCircle, Trophy, Calendar, Edit3,
    CheckCircle2, Link2, ExternalLink, Video, Play, Award, User, Mail,
    ChevronRight, ChevronDown, BarChart2, MessageSquare, XCircle, Send, Loader2,
    Sparkles, Trash2, RefreshCw, Layers, TrendingUp, Upload, FileQuestion
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
const PIPELINE_STAGES = [
    { value: 'ai_analysis', label: 'AI Analiz',   color: 'text-blue-600',   bg: 'bg-blue-50' },
    { value: 'review',      label: 'İnceleme',     color: 'text-indigo-600', bg: 'bg-indigo-50' },
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
    const { user, isSuperAdmin, role } = useAuth();
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
    const [bulkJobId, setBulkJobId]             = useState(null);
    const [bulkToast, setBulkToast]             = useState(null);
    const [bulkTab, setBulkTab]                 = useState('files');
    const [bulkJsonText, setBulkJsonText]       = useState('');

    // Feedback email modal
    const [infoRequestModal, setInfoRequestModal] = useState(false);
    const [feedbackModal, setFeedbackModal]     = useState(false);
    const [feedbackOutcome, setFeedbackOutcome] = useState('positive');
    const [feedbackText, setFeedbackText]       = useState('');
    const [feedbackLoading, setFeedbackLoading] = useState(false);
    const [feedbackAiLoading, setFeedbackAiLoading] = useState(false);
    const [feedbackSuccess, setFeedbackSuccess] = useState(false);

    // Branding — loaded once from Firestore for email template generation
    const [branding, setBranding] = useState({ companyName: 'Talent-Inn', primaryColor: '#1E3A8A' });
    useEffect(() => {
        getDoc(doc(db, 'artifacts/talent-flow/public/data/settings', 'branding'))
            .then(snap => { if (snap.exists()) setBranding(snap.data()); })
            .catch(() => {});
    }, []);

    // Real-time Firestore subscription for active bulk import job
    useEffect(() => {
        if (!bulkJobId || !db) return;
        const jobDocRef = doc(db, `artifacts/talent-flow/public/data/bulkImportJobs/${bulkJobId}`);
        const unsub = onSnapshot(jobDocRef, (snap) => {
            if (!snap.exists()) return;
            const data = snap.data();
            const total = data.totalCount || 0;
            const completed = data.processedCount || 0;
            const failed = data.failedCount || 0;
            const status = data.status || 'queued';
            const avgScore = data.avgScore ?? null;
            const avgScoreByPosition = data.avgScoreByPosition || null;
            setBulkProgress(prev => ({
                ...prev,
                total,
                completed,
                failed,
                avgScore,
                avgScoreByPosition,
                status,
            }));
            if (status === 'completed' || status === 'error') {
                setBulkImporting(false);
                setBulkToast({
                    total,
                    completed,
                    failed,
                    avgScore,
                    avgScoreByPosition,
                    positionTitle: data.positionTitle || '',
                });
                setTimeout(() => setBulkToast(null), 12000);
            }
        });
        return () => unsub();
    }, [bulkJobId]);

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
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await res.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (text) setFeedbackText(text.trim());
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

            // Build branded HTML via the template service (supports Firestore-saved overrides)
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

    const handleBulkImport = async () => {
        if (bulkImporting) return;
        setBulkImporting(true);
        setBulkJobId(null);
        const selectedPos = positions.find(p => p.id === bulkPositionId);

        try {
            let resp, data;

            const fbAuthTok = await user?.getIdToken?.() || '';
            const authHeaders = { 'Authorization': `Bearer ${fbAuthTok}` };

            if (bulkTab === 'json') {
                // JSON records path
                let records;
                try { records = JSON.parse(bulkJsonText.trim()); } catch {
                    throw new Error('Geçersiz JSON formatı.');
                }
                if (!Array.isArray(records) || records.length === 0) throw new Error('Kayıt dizisi boş veya geçersiz.');
                const initialItems = records.map(r => ({ name: r.name || 'Aday', status: 'pending' }));
                setBulkProgress({ total: records.length, completed: 0, failed: 0, items: initialItems, avgScore: null, status: 'queued' });
                resp = await fetch('/api/bulk-import', {
                    method: 'POST',
                    headers: { ...authHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ positionId: selectedPos?.id || '', positionTitle: selectedPos?.title || '', records }),
                });
                data = await resp.json();
            } else {
                // File upload path
                if (!bulkFiles.length) { setBulkImporting(false); return; }
                const initialItems = bulkFiles.map(f => ({ name: f.name, status: 'pending' }));
                setBulkProgress({ total: bulkFiles.length, completed: 0, failed: 0, items: initialItems, avgScore: null, status: 'queued' });
                const formData = new FormData();
                bulkFiles.forEach(f => formData.append('cvs', f));
                if (selectedPos) {
                    formData.append('positionId', selectedPos.id);
                    formData.append('positionTitle', selectedPos.title);
                }
                resp = await fetch('/api/bulk-import', { method: 'POST', headers: authHeaders, body: formData });
                data = await resp.json();
            }

            if (!resp.ok || !data.jobId) {
                throw new Error(data.error || 'Toplu yükleme başlatılamadı.');
            }

            setBulkJobId(data.jobId);
            setBulkProgress(prev => ({ ...prev, total: data.totalCount || prev.total, status: 'queued' }));
        } catch (err) {
            console.error('Bulk import start error:', err);
            setBulkImporting(false);
            setBulkProgress(prev => ({ ...prev, status: 'error' }));
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

        // Skip if already has a complete STAR analysis (use forceRescan via SystemScanner for re-analysis)
        if (c.aiAnalysis?.starAnalysis) return;

        setAnalyzingIds(prev => new Set(prev).add(c.id));
        setAnalysisError(null);
        try {
            // ── Stage 1: Scout — find best position match ──────────────────────
            const openPositions = positions?.filter(p => p.status === 'open') || [];
            const matchedPosition = openPositions.find(p => p.id === c.positionId)
                || openPositions[0];

            if (!matchedPosition) throw new Error('Açık pozisyon bulunamadı.');

            // ── Stage 2: Analyst — deep AI STAR analysis (otonom agent) ────────
            const jobText = `${matchedPosition.title}\n${(matchedPosition.requirements || []).join(', ')}\n${matchedPosition.description || ''}`;
            const result = await analyzeCandidateMatch(jobText, c);

            // ── Stage 3: Recruiter — persist to Firestore ───────────────────────
            const updatedAnalysis = {
                ...(c.aiAnalysis || {}),
                score: result.score,
                summary: result.summary,
                starAnalysis: result.starAnalysis,
                reasons: result.reasons,
                scoreData: result.scoreData,
                lastAnalyzedAt: new Date().toISOString(),
                analyzedForPosition: matchedPosition.title,
            };

            await updateCandidate(c.id, {
                aiAnalysis: updatedAnalysis,
                matchScore: result.score,
                matchedPositionTitle: matchedPosition.title,
                lastScannedAt: new Date().toISOString(),
            });

            showSuccess('comment');
        } catch (err) {
            console.error('STAR Analysis error:', err);
            setAnalysisError('Analiz sırasında bir hata oluştu. Tekrar deneyin.');
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

    const filterOptions = useMemo(() => {
        const sources = [...new Set(candidates.map(c => c.source).filter(Boolean))];
        const positions = [...new Set(candidates.map(c => c.position || c.bestTitle).filter(Boolean))];
        const statuses = [...new Set(candidates.map(c => normalizePipelineStatus(c.status)).filter(Boolean))];
        return { sources, positions, statuses };
    }, [candidates]);

    const activeFilterCount = [filterSource, filterStatus, filterPosition, filterMinScore > 0].filter(Boolean).length;

    const filtered = useMemo(() => {
        const q = searchQuery.toLowerCase();
        const results = candidates.filter(c => {
            if (q && !c.name?.toLowerCase().includes(q) && !(c.position || c.bestTitle)?.toLowerCase().includes(q)) return false;
            if (filterSource && c.source !== filterSource) return false;
            if (filterStatus && normalizePipelineStatus(c.status) !== filterStatus) return false;
            if (filterPosition && (c.position || c.bestTitle) !== filterPosition) return false;
            if (filterMinScore > 0 && (c.bestScore || 0) < filterMinScore) return false;
            return true;
        });
        const hasScreening = results.some(c => c.screeningScore != null);
        if (hasScreening) {
            results.sort((a, b) => {
                const sa = a.screeningScore ?? -1;
                const sb = b.screeningScore ?? -1;
                return sb - sa;
            });
        }
        return results;
    }, [candidates, searchQuery, filterSource, filterStatus, filterPosition, filterMinScore]);

    const parseFeedback = (text) => {
        if (!text) return { pos: '', neg: '' };
        const parts = text.split('Negatif (-):');
        return {
            pos: parts[0].replace('Pozitif (+):', '').trim(),
            neg: parts[1]?.trim() || ''
        };
    };

    const starAnalysis = candidate?.aiAnalysis?.starAnalysis || {
        Situation: { reason: 'Mülakat verisi bekleniyor.', score: 0 },
        Task:      { reason: 'Mülakat verisi bekleniyor.', score: 0 },
        Action:    { reason: 'Mülakat verisi bekleniyor.', score: 0 },
        Result:    { reason: 'Mülakat verisi bekleniyor.', score: 0 },
    };

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

    const score = Math.round(candidate?.bestScore || 0);

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
            const isCompat = cDomain === 'general' || pDomain === 'general' || pDomain === 'management' || cDomain === 'management' || cDomain === pDomain;
            const savedAnalysis = candidate.positionAnalyses?.[pos.title];
            const staticMatch = calculateMatchScore(candidate, pos);
            const matchData = savedAnalysis
                ? { score: savedAnalysis.score, summary: savedAnalysis.summary, isAi: true, reasons: savedAnalysis.reasons || [] }
                : { score: staticMatch.score, summary: null, isAi: false, reasons: staticMatch.reasons || [] };
            const entry = { position: pos, match: matchData, positionDomain: pDomain };
            if (isCompat) compatible.push(entry);
            else incompatible.push(entry);
        });
        compatible.sort((a, b) => b.match.score - a.match.score);
        incompatible.sort((a, b) => b.match.score - a.match.score);
        return { candidateDomain: cDomain, compatible, incompatible };
    }, [candidate, positions]);

    // ── TABS ──────────────────────────────────────────────────────────────────
    const TABS = [
        { id: 'ai_analysis',      label: 'STAR Analizi',        icon: <Brain className="w-3.5 h-3.5" /> },
        { id: 'cv_match',         label: 'CV & Uyum',           icon: <FileText className="w-3.5 h-3.5" /> },
        { id: 'pos_matches',      label: 'Pozisyon Eşleşmeleri', icon: <Layers className="w-3.5 h-3.5" /> },
        { id: 'sessions',         label: 'Mülakatlar',          icon: <Video className="w-3.5 h-3.5" /> },
        { id: 'history',          label: 'Süreç Geçmişi',       icon: <BarChart2 className="w-3.5 h-3.5" /> },
    ];

    return (
        <div className="h-screen bg-slate-50 flex flex-col font-sans overflow-hidden">
            {/* PAGE HEADER */}
            <div className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <h1 className="text-[20px] font-black text-slate-900 tracking-tight">Aday Yönetimi</h1>
                    <div className="rounded-full bg-slate-100 text-slate-400 text-[11px] px-2.5 py-0.5 font-medium">
                        {candidates.length}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <SystemScanner />
                    <button
                        onClick={() => { setBulkFiles([]); setBulkProgress({ total: 0, completed: 0, failed: 0, items: [] }); setBulkImportModal(true); }}
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
                            const sc = Math.round(c.bestScore || 0);
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
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-black/5 flex items-center justify-center">
                                        {c.photo || c.photoUrl || c.profileImage
                                            ? <img src={c.photo || c.photoUrl || c.profileImage} className="w-full h-full object-cover" alt="" onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
                                            : null}
                                        <span className={`text-[11px] font-black text-slate-500 ${c.photo || c.photoUrl || c.profileImage ? 'hidden' : 'flex'}`}>{mc.name?.charAt(0)?.toUpperCase() || '?'}</span>
                                    </div>
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
                                    <div className="w-10 h-10 rounded-xl border-2 border-white shadow-md overflow-hidden shrink-0 ring-2 ring-cyan-100 bg-cyan-50 flex items-center justify-center">
                                        {candidate.photo || candidate.photoUrl || candidate.profileImage
                                            ? <img src={candidate.photo || candidate.photoUrl || candidate.profileImage} className="w-full h-full object-cover" alt="" onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
                                            : null}
                                        <span className={`text-sm font-black text-cyan-700 ${candidate.photo || candidate.photoUrl || candidate.profileImage ? 'hidden' : 'flex'}`}>{candidate.name?.charAt(0)?.toUpperCase() || '?'}</span>
                                    </div>
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
                                            <p className="text-[11px] text-slate-500 font-medium">{candidate.position || candidate.bestTitle || '—'}</p>
                                            {candidate.email && (
                                                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                                    <Mail className="w-3 h-3" /> {candidate.email}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Stat pills */}
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase">STAR</span>
                                        <span className="text-[13px] font-black text-slate-800">{candidate.bestScore ? `${Math.round(candidate.bestScore * 0.98)}%` : '—'}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 bg-cyan-500 rounded-lg px-3 py-1.5 shadow-sm shadow-cyan-200">
                                        <span className="text-[9px] font-bold text-cyan-100 uppercase">Uyum</span>
                                        <span className="text-[13px] font-black text-white">
                                            {score > 80 ? 'GÜÇLÜ' : score > 60 ? 'ORTA' : 'ZAYIF'}
                                        </span>
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
                                                <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-widest">STAR Değerlendirmesi</h3>
                                                {candidate.aiAnalysis?.lastAnalyzedAt && (
                                                    <span className="text-[9px] text-slate-400">
                                                        · {new Date(candidate.aiAnalysis.lastAnalyzedAt).toLocaleDateString('tr-TR')}
                                                    </span>
                                                )}
                                            </div>
                                            {/* Already analyzed: point to SystemScanner for re-analysis */}
                                            {candidate.aiAnalysis?.starAnalysis && (
                                                <span className="text-[9px] text-slate-400 italic">
                                                    Toplu yenileme için Sistem Taraması kullanın
                                                </span>
                                            )}
                                        </div>

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
                                        {!analyzingIds.has(candidate.id) && !candidate.aiAnalysis?.starAnalysis && (
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

                                        {/* STAR cards — shown only when analysis data exists and not currently re-analyzing */}
                                        {!analyzingIds.has(candidate.id) && candidate.aiAnalysis?.starAnalysis && (
                                            <div className="space-y-2">
                                                {[
                                                    { k: 'S', l: 'DURUM', sub: 'Situation', bg: 'bg-blue-50',   border: 'border-blue-100',   tc: 'text-blue-700',   r: starAnalysis.Situation.reason },
                                                    { k: 'T', l: 'GÖREV', sub: 'Task',      bg: 'bg-teal-50',   border: 'border-teal-100',   tc: 'text-teal-700',   r: starAnalysis.Task.reason },
                                                    { k: 'A', l: 'EYLEM', sub: 'Action',    bg: 'bg-violet-50', border: 'border-violet-100', tc: 'text-violet-700', r: starAnalysis.Action.reason },
                                                    { k: 'R', l: 'SONUÇ', sub: 'Result',    bg: 'bg-emerald-50',border: 'border-emerald-100',tc: 'text-emerald-700',r: starAnalysis.Result.reason },
                                                ].map((step, idx) => {
                                                    const { pos, neg } = parseFeedback(step.r);
                                                    return (
                                                        <div key={idx} className={`rounded-xl border ${step.border} ${step.bg} p-3`}>
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <div className={`w-6 h-6 rounded-md bg-white border ${step.border} flex items-center justify-center text-[11px] font-black ${step.tc} shadow-sm shrink-0`}>{step.k}</div>
                                                                <h4 className={`text-[11px] font-black uppercase tracking-wider ${step.tc}`}>{step.l}</h4>
                                                                <span className={`text-[10px] font-medium opacity-60 ${step.tc}`}>({step.sub})</span>
                                                            </div>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                {pos && (
                                                                    <div className="bg-white border border-emerald-100 px-3 py-2 rounded-lg">
                                                                        <div className="flex items-center gap-1 text-[9px] font-black text-emerald-600 uppercase mb-1">
                                                                            <ShieldCheck className="w-3 h-3" /> Pozitif
                                                                        </div>
                                                                        <p className="text-[12px] text-slate-600 leading-relaxed">{pos}</p>
                                                                    </div>
                                                                )}
                                                                {neg && (
                                                                    <div className="bg-white border border-red-100 px-3 py-2 rounded-lg">
                                                                        <div className="flex items-center gap-1 text-[9px] font-black text-red-500 uppercase mb-1">
                                                                            <AlertCircle className="w-3 h-3" /> Negatif
                                                                        </div>
                                                                        <p className="text-[12px] text-slate-600 leading-relaxed">{neg}</p>
                                                                    </div>
                                                                )}
                                                                {!pos && !neg && (
                                                                    <p className="text-[12px] text-slate-400 italic col-span-2">{step.r || '—'}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

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
                                            <p className="text-[12px] text-slate-600 leading-relaxed italic font-medium pr-16">
                                                "{candidate.aiAnalysis?.summary || `${candidate.name} teknik profili, ${candidate.position || 'Hedef Pozisyon'} pozisyonu ile %${score} uyum göstermektedir.`}"
                                            </p>
                                            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-cyan-600 shadow-sm">
                                                <Zap className="w-3 h-3 text-amber-400 fill-amber-400" /> %{score} Uyum Skoru Doğrulandı
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
                                                <div className="w-9 h-9 rounded-xl bg-[#1E3A8A]/10 flex items-center justify-center shrink-0">
                                                    <Layers className="w-4.5 h-4.5 text-[#1E3A8A]" />
                                                </div>
                                                <div>
                                                    <p className="text-[11px] font-black text-slate-800">
                                                        Aday Meslek Alanı:
                                                        <span className="ml-1.5 px-2 py-0.5 bg-[#1E3A8A]/10 text-[#1E3A8A] rounded-md">{domainLabel(candidateDomain)}</span>
                                                    </p>
                                                    <p className="text-[10px] text-slate-400 mt-0.5">Yalnızca uyumlu meslek alanındaki açık pozisyonlar eşleştirilir.</p>
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
                                                    {compatible.map(({ position: pos, match, positionDomain }) => (
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
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Incompatible — collapsed notice */}
                                            {incompatible.length > 0 && (
                                                <div className="border border-dashed border-slate-200 rounded-2xl p-4">
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] mb-1">
                                                        Farklı Meslek Alanı ({incompatible.length} pozisyon)
                                                    </p>
                                                    <p className="text-[11px] text-slate-400">
                                                        Bu pozisyonlar aday profiliyle uyumlu meslek alanında değil; eşleştirme dışı tutuldu.
                                                    </p>
                                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                                        {incompatible.slice(0, 6).map(({ position: pos }) => (
                                                            <span key={pos.id} className="text-[8px] font-medium px-2 py-0.5 bg-slate-50 border border-slate-100 rounded-full text-slate-400">{pos.title}</span>
                                                        ))}
                                                        {incompatible.length > 6 && (
                                                            <span className="text-[8px] font-medium px-2 py-0.5 bg-slate-50 border border-slate-100 rounded-full text-slate-400">+{incompatible.length - 6} daha</span>
                                                        )}
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
                                            onClick={() => setInfoRequestModal(true)}
                                            className="h-8 px-3 bg-cyan-50 text-cyan-600 rounded-lg text-[9px] font-black uppercase border border-cyan-200 hover:bg-cyan-100 transition-all flex items-center gap-1.5"
                                            title="Adaydan Bilgi / Belge İste"
                                        >
                                            <FileQuestion className="w-3 h-3" /> Bilgi İste
                                        </button>
                                    )}
                                    {candidate?.email && (
                                        <button
                                            onClick={() => { setFeedbackText(''); setFeedbackOutcome('positive'); setFeedbackModal(true); }}
                                            className="h-8 px-3 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-black uppercase border border-emerald-200 hover:bg-emerald-100 transition-all flex items-center gap-1.5"
                                            title="Aday Geri Bildirim E-postası Gönder"
                                        >
                                            <Mail className="w-3 h-3" /> Geri Bildirim
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
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 text-emerald-500" />
                                <h3 className="text-[13px] font-black text-slate-800">Aday Geri Bildirim Maili</h3>
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
                                {/* Recipient */}
                                <div>
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Alıcı</label>
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[12px] text-slate-600 font-medium">{candidate?.email}</div>
                                </div>

                                {/* Outcome */}
                                <div>
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Sonuç</label>
                                    <div className="flex gap-2">
                                        {[
                                            { v: 'positive', label: 'Olumlu', active: 'bg-emerald-500 text-white border-emerald-500', inactive: 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100' },
                                            { v: 'hold', label: 'Beklemede', active: 'bg-amber-500 text-white border-amber-500', inactive: 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100' },
                                            { v: 'negative', label: 'Olumsuz', active: 'bg-red-500 text-white border-red-500', inactive: 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' },
                                        ].map(({ v, label, active, inactive }) => (
                                            <button
                                                key={v}
                                                onClick={() => setFeedbackOutcome(v)}
                                                className={`flex-1 h-8 rounded-lg text-[9px] font-black uppercase tracking-wide border transition-all ${feedbackOutcome === v ? active : inactive}`}
                                            >{label}</button>
                                        ))}
                                    </div>
                                </div>

                                {/* Feedback text */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Geri Bildirim Metni</label>
                                        <button
                                            onClick={handleGenerateFeedbackText}
                                            disabled={feedbackAiLoading}
                                            className="flex items-center gap-1 px-2.5 py-1 bg-violet-50 text-violet-600 border border-violet-200 rounded-lg text-[9px] font-black hover:bg-violet-100 transition-all disabled:opacity-60"
                                        >
                                            {feedbackAiLoading
                                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                                : <Brain className="w-3 h-3" />
                                            }
                                            AI ile Oluştur
                                        </button>
                                    </div>
                                    <textarea
                                        value={feedbackText}
                                        onChange={e => setFeedbackText(e.target.value)}
                                        placeholder="Adaya iletmek istediğiniz geri bildirimi yazın..."
                                        rows={5}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-[12px] text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 resize-none transition-all"
                                    />
                                </div>

                                <div className="flex gap-2 justify-end pt-1">
                                    <button onClick={() => setFeedbackModal(false)} className="h-9 px-4 rounded-xl text-[10px] font-black text-slate-500 border border-slate-200 hover:bg-slate-50 transition-all">İptal</button>
                                    <button
                                        onClick={handleSendFeedback}
                                        disabled={!feedbackText.trim() || feedbackLoading}
                                        className="h-9 px-5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm transition-all disabled:opacity-60"
                                    >
                                        {feedbackLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                        Gönder
                                    </button>
                                </div>
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
                                onClick={() => { if (!bulkImporting) { setBulkImportModal(false); } }}
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
                                                    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.pdf') || f.name.endsWith('.docx') || f.name.endsWith('.zip'));
                                                    setBulkFiles(prev => [...prev, ...files].slice(0, 20));
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
                                                        setBulkFiles(prev => [...prev, ...files].slice(0, 20));
                                                    }}
                                                />
                                                <Upload className="w-8 h-8 text-violet-300 mx-auto mb-2" />
                                                <p className="text-[13px] font-bold text-slate-500">Sürükleyin veya tıklayın</p>
                                                <p className="text-[10px] text-slate-400 mt-1">PDF, DOCX veya ZIP (içinde PDF/DOCX) • Maks. 20 dosya</p>
                                            </div>

                                            {bulkFiles.length > 0 && (
                                                <div className="space-y-1 max-h-32 overflow-y-auto">
                                                    {bulkFiles.map((f, i) => (
                                                        <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
                                                            <span className="text-[11px] text-slate-600 font-medium truncate">{f.name}</span>
                                                            <button
                                                                onClick={() => setBulkFiles(prev => prev.filter((_, j) => j !== i))}
                                                                className="text-slate-300 hover:text-red-400 shrink-0 ml-2"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
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
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Pozisyon (İsteğe Bağlı)</label>
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
                                    {/* Progress bar */}
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
                                            bulkProgress.status === 'processing' ? 'bg-violet-50 text-violet-700 border border-violet-200' :
                                            'bg-slate-50 text-slate-500 border border-slate-200'
                                        }`}>
                                            {bulkProgress.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
                                            {bulkProgress.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                                            {bulkProgress.status === 'error' && <XCircle className="w-3 h-3" />}
                                            {bulkProgress.status === 'queued' && <Clock className="w-3 h-3" />}
                                            <span>
                                                {bulkProgress.status === 'completed' ? `Tamamlandı — ${bulkProgress.completed} başarılı${bulkProgress.failed > 0 ? `, ${bulkProgress.failed} hatalı` : ''}${bulkProgress.avgScore != null ? ` · Ort. Eşleşme: %${bulkProgress.avgScore}` : ''}` :
                                                 bulkProgress.status === 'error' ? 'İşlem hatası oluştu' :
                                                 bulkProgress.status === 'processing' ? `İşleniyor… ${bulkProgress.completed + bulkProgress.failed}/${bulkProgress.total}` :
                                                 'Sıraya alındı'}
                                            </span>
                                        </div>
                                    )}

                                    {!bulkImporting && (
                                        <button
                                            onClick={() => { setBulkImportModal(false); setBulkProgress({ total: 0, completed: 0, failed: 0, items: [], avgScore: null, status: null }); setBulkJobId(null); setBulkFiles([]); setBulkTab('files'); setBulkJsonText(''); }}
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
                            {bulkToast.completed} aday eklendi{bulkToast.failed > 0 && <span className="text-red-500">, {bulkToast.failed} hata</span>}
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

            {infoRequestModal && candidate && (
                <SendMessageModal
                    candidate={candidate}
                    initialPurpose="info-request"
                    onClose={() => setInfoRequestModal(false)}
                    onSent={() => setInfoRequestModal(false)}
                />
            )}
        </div>
    );
}
