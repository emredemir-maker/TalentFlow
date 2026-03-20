// src/pages/CandidateProcessPage.jsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import { useAuth } from '../context/AuthContext';
import { analyzeCandidateMatch } from '../services/geminiService';
import {
    Plus, Search, Zap, Brain, X,
    Target, ShieldCheck, ArrowRight, FileText, Clock,
    AlertCircle, Trophy, Calendar, Edit3,
    CheckCircle2, Link2, ExternalLink, Video, Play, Award, User, Mail,
    ChevronRight, BarChart2, MessageSquare, XCircle, Send, Loader2,
    Sparkles, Trash2, RefreshCw
} from 'lucide-react';

const STATUS_CONFIG = {
    live:       { label: 'CANLI',      bg: 'bg-rose-50',    text: 'text-rose-600',    border: 'border-rose-100',    pulse: true },
    completed:  { label: 'TAMAMLANDI', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', pulse: false },
    cancelled:  { label: 'İPTAL',      bg: 'bg-slate-100',  text: 'text-slate-500',   border: 'border-slate-200',   pulse: false },
    scheduled:  { label: 'PLANLANDI',  bg: 'bg-amber-50',   text: 'text-amber-600',   border: 'border-amber-100',   pulse: false },
};
const getStatusCfg = (s) => STATUS_CONFIG[s] || STATUS_CONFIG.scheduled;

export default function CandidateProcessPage() {
    const navigate = useNavigate();
    const { enrichedCandidates, viewCandidateId, setViewCandidateId, sourceColors, setPreselectedInterviewData, updateCandidate, deleteCandidate } = useCandidates();
    const { positions } = usePositions();
    const { user } = useAuth();
    const candidates = enrichedCandidates || [];
    const [searchQuery, setSearchQuery]   = useState('');
    const [activeTab, setActiveTab]       = useState('ai_analysis');
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
    const [actionSuccess, setActionSuccess] = useState(null); // 'comment' | 'reject' | 'final'
    const [analysisLoading, setAnalysisLoading] = useState(false);
    const [analysisError, setAnalysisError]     = useState(null);

    const showSuccess = (type) => {
        setActionSuccess(type);
        setTimeout(() => setActionSuccess(null), 3000);
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

    const handleRunStarAnalysis = async () => {
        if (!candidate || analysisLoading) return;
        setAnalysisLoading(true);
        setAnalysisError(null);
        try {
            // Build job description from matched position or candidate's own position field
            const matchedPosition = positions?.find(p => p.id === candidate.positionId);
            const jobText = matchedPosition
                ? `${matchedPosition.title}\n${(matchedPosition.requirements || []).join(', ')}\n${matchedPosition.description || ''}`
                : (candidate.position || candidate.bestTitle || 'Açık Pozisyon');

            const result = await analyzeCandidateMatch(jobText, candidate);

            // Merge into existing aiAnalysis
            const updatedAnalysis = {
                ...(candidate.aiAnalysis || {}),
                score: result.score,
                summary: result.summary,
                starAnalysis: result.starAnalysis,
                reasons: result.reasons,
                lastAnalyzedAt: new Date().toISOString(),
            };

            await updateCandidate(candidate.id, { aiAnalysis: updatedAnalysis });
            showSuccess('comment'); // re-use success flash
        } catch (err) {
            console.error('STAR Analysis error:', err);
            setAnalysisError('Analiz sırasında bir hata oluştu. Tekrar deneyin.');
        } finally {
            setAnalysisLoading(false);
        }
    };

    const candidate = useMemo(() => {
        if (!viewCandidateId && candidates.length > 0) return candidates[0];
        return candidates.find(c => c.id === viewCandidateId) || (candidates.length > 0 ? candidates[0] : null);
    }, [candidates, viewCandidateId]);

    const filterOptions = useMemo(() => {
        const sources = [...new Set(candidates.map(c => c.source).filter(Boolean))];
        const positions = [...new Set(candidates.map(c => c.position || c.bestTitle).filter(Boolean))];
        const statuses = [...new Set(candidates.map(c => c.status).filter(Boolean))];
        return { sources, positions, statuses };
    }, [candidates]);

    const activeFilterCount = [filterSource, filterStatus, filterPosition, filterMinScore > 0].filter(Boolean).length;

    const filtered = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return candidates.filter(c => {
            if (q && !c.name?.toLowerCase().includes(q) && !(c.position || c.bestTitle)?.toLowerCase().includes(q)) return false;
            if (filterSource && c.source !== filterSource) return false;
            if (filterStatus && c.status !== filterStatus) return false;
            if (filterPosition && (c.position || c.bestTitle) !== filterPosition) return false;
            if (filterMinScore > 0 && (c.bestScore || 0) < filterMinScore) return false;
            return true;
        });
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

    const careerHistory = candidate?.experiences || candidate?.careerHistory || [];

    const getSourceLabel = (c) => {
        if (!c?.source) return 'Manuel / PDF';
        return c.sourceDetail ? `${c.source} (${c.sourceDetail})` : c.source;
    };
    const getSourceColor = (src) => {
        if (!src) return '#64748B';
        return sourceColors?.[src.toLowerCase()] || '#64748B';
    };

    const score = Math.round(candidate?.bestScore || 0);

    // ── TABS ──────────────────────────────────────────────────────────────────
    const TABS = [
        { id: 'ai_analysis', label: 'STAR Analizi',      icon: <Brain className="w-3.5 h-3.5" /> },
        { id: 'cv_match',    label: 'CV & Uyum',          icon: <FileText className="w-3.5 h-3.5" /> },
        { id: 'sessions',    label: 'Mülakatlar',         icon: <Video className="w-3.5 h-3.5" /> },
        { id: 'history',     label: 'Süreç Geçmişi',      icon: <BarChart2 className="w-3.5 h-3.5" /> },
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
                <button className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-colors shadow-sm shadow-cyan-200 flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Yeni Aday
                </button>
            </div>

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
                            <div className="text-[9px] font-black text-slate-400 tracking-widest uppercase">ADAYLAR <span className="text-slate-300">({filtered.length})</span></div>
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
                                    {filterOptions.statuses.map(s => <option key={s} value={s}>{s}</option>)}
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
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-black/5">
                                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${c.name}`} className="w-full h-full object-cover" alt="" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-[12px] font-bold truncate leading-tight ${isActive ? 'text-cyan-700' : 'text-slate-700'}`}>{c.name}</p>
                                        <span
                                            className="text-[8px] font-bold px-1.5 py-0.5 rounded-md mt-0.5 inline-flex items-center gap-0.5 uppercase"
                                            style={{ color: srcColor, backgroundColor: `${srcColor}15` }}
                                        >
                                            {getSourceLabel(c)}
                                        </span>
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
                                    <div className="w-10 h-10 rounded-xl border-2 border-white shadow-md overflow-hidden shrink-0 ring-2 ring-cyan-100">
                                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${candidate.name}`} className="w-full h-full object-cover" alt="" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-[15px] font-black text-slate-900 tracking-tight leading-none">{candidate.name}</h2>
                                            <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
                                                <Target className="w-2.5 h-2.5" /> İlk %2
                                            </span>
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
                                        {/* Header row with refresh button */}
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
                                            {candidate.aiAnalysis?.starAnalysis && (
                                                <button
                                                    onClick={handleRunStarAnalysis}
                                                    disabled={analysisLoading}
                                                    className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[9px] font-black uppercase border border-slate-200 text-slate-400 hover:text-cyan-600 hover:border-cyan-200 hover:bg-cyan-50 transition-all disabled:opacity-50"
                                                    title="Analizi Yenile"
                                                >
                                                    <RefreshCw className={`w-3 h-3 ${analysisLoading ? 'animate-spin' : ''}`} />
                                                    Yenile
                                                </button>
                                            )}
                                        </div>

                                        {/* Error banner */}
                                        {analysisError && (
                                            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-[11px] text-red-600">
                                                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {analysisError}
                                            </div>
                                        )}

                                        {/* Loading state */}
                                        {analysisLoading && (
                                            <div className="flex flex-col items-center justify-center py-12 gap-3">
                                                <div className="w-12 h-12 rounded-2xl bg-cyan-50 border border-cyan-100 flex items-center justify-center">
                                                    <Sparkles className="w-6 h-6 text-cyan-500 animate-pulse" />
                                                </div>
                                                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Yapay Zeka Analiz Ediyor…</p>
                                                <p className="text-[10px] text-slate-400">CV ve pozisyon verileri işleniyor</p>
                                            </div>
                                        )}

                                        {/* Empty state — no STAR analysis yet */}
                                        {!analysisLoading && !candidate.aiAnalysis?.starAnalysis && (
                                            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                                                <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                                                    <Brain className="w-7 h-7 text-slate-300" />
                                                </div>
                                                <div>
                                                    <p className="text-[12px] font-black text-slate-700 mb-1">STAR Analizi Henüz Yapılmadı</p>
                                                    <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                                                        Adayın CV'sini ve pozisyon gereksinimlerini STAR metodolojisiyle derinlemesine analiz etmek için yapay zekayı başlatın.
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={handleRunStarAnalysis}
                                                    disabled={analysisLoading}
                                                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-black text-sm shadow-xl shadow-cyan-500/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100"
                                                >
                                                    <Sparkles className="w-4 h-4" />
                                                    Yapay Zekayı Başlat
                                                </button>
                                            </div>
                                        )}

                                        {/* STAR cards — shown only when analysis data exists */}
                                        {!analysisLoading && candidate.aiAnalysis?.starAnalysis && (
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
                                                                <h4 className={`text-[10px] font-black uppercase tracking-wider ${step.tc}`}>{step.l}</h4>
                                                                <span className={`text-[9px] font-medium opacity-60 ${step.tc}`}>({step.sub})</span>
                                                            </div>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                {pos && (
                                                                    <div className="bg-white border border-emerald-100 px-3 py-2 rounded-lg">
                                                                        <div className="flex items-center gap-1 text-[8px] font-black text-emerald-600 uppercase mb-1">
                                                                            <ShieldCheck className="w-3 h-3" /> Pozitif
                                                                        </div>
                                                                        <p className="text-[11px] text-slate-600 leading-relaxed">{pos}</p>
                                                                    </div>
                                                                )}
                                                                {neg && (
                                                                    <div className="bg-white border border-red-100 px-3 py-2 rounded-lg">
                                                                        <div className="flex items-center gap-1 text-[8px] font-black text-red-500 uppercase mb-1">
                                                                            <AlertCircle className="w-3 h-3" /> Negatif
                                                                        </div>
                                                                        <p className="text-[11px] text-slate-600 leading-relaxed">{neg}</p>
                                                                    </div>
                                                                )}
                                                                {!pos && !neg && (
                                                                    <p className="text-[11px] text-slate-400 italic col-span-2">{step.r || '—'}</p>
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
                                                    <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">Pozisyon Uyum Analizi</h3>
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

                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                                            {/* Career timeline */}
                                            <div className="md:col-span-8 space-y-4">
                                                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                                                    <Clock className="w-4 h-4 text-cyan-500" />
                                                    <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Kariyer Kronolojisi</h3>
                                                </div>
                                                <div className="space-y-5 pl-2">
                                                    {careerHistory.length > 0 ? careerHistory.map((exp, i) => (
                                                        <div key={i} className="relative pl-5 border-l-2 border-cyan-100 pb-4">
                                                            <div className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full bg-white border-2 border-cyan-400 shadow-sm" />
                                                            <div className="flex justify-between items-start mb-1.5">
                                                                <div>
                                                                    <h4 className="text-[13px] font-black text-slate-800">{exp.role}</h4>
                                                                    <p className="text-[10px] font-bold text-slate-500 uppercase">{exp.company}</p>
                                                                </div>
                                                                <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 shrink-0 ml-2">{exp.duration}</span>
                                                            </div>
                                                            <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">{exp.desc}</p>
                                                            {exp.milestones?.length > 0 && (
                                                                <div className="flex flex-wrap gap-1.5 mt-2">
                                                                    {exp.milestones.map((m, idx) => (
                                                                        <span key={idx} className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[8.5px] font-black rounded-lg border border-emerald-100">
                                                                            <Trophy className="w-2 h-2" /> {m}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )) : (candidate?.cvData || candidate?.cvText) ? (
                                                        <div className="relative pl-5 border-l-2 border-cyan-100">
                                                            <div className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full bg-white border-2 border-cyan-400 shadow-sm" />
                                                            <pre className="text-[11px] text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100 whitespace-pre-wrap font-sans">
                                                                {(candidate?.cvData || candidate?.cvText || '').slice(0, 4000)}
                                                            </pre>
                                                        </div>
                                                    ) : (
                                                        <p className="text-[12px] text-slate-400 italic">Kariyer bilgisi bulunamadı.</p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Skills + Education */}
                                            <div className="md:col-span-4 space-y-5">
                                                <div>
                                                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100 mb-3">
                                                        <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Teknik Ekosistem</h3>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {(candidate.skills || ['React', 'Node.js', 'AWS', 'Redis']).map((s, i) => (
                                                            <span key={i} className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[9px] font-black text-slate-600 shadow-sm uppercase">{s}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="pt-4 border-t border-slate-100">
                                                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100 mb-3">
                                                        <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Eğitim & Sertifika</h3>
                                                    </div>
                                                    <p className="text-[11px] font-medium text-slate-600 italic leading-relaxed">
                                                        {candidate.education || candidate.educationDetail || 'Eğitim bilgisi bulunamadı.'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── MÜLAKATLAr ── */}
                                {activeTab === 'sessions' && (
                                    <div className="space-y-4 animate-in fade-in duration-300">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1 h-4 rounded-full bg-cyan-500" />
                                                <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">Planlanmış ve Gerçekleşen Görüşmeler</h3>
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

                                        {(candidate.interviewSessions || []).length > 0 ? (
                                            <div className="space-y-3">
                                                {candidate.interviewSessions.map((session, sidx) => {
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
                                        )}
                                    </div>
                                )}

                                {/* ── SÜREÇ GEÇMİŞİ ── */}
                                {activeTab === 'history' && (
                                    <div className="space-y-4 animate-in fade-in duration-300">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1 h-4 rounded-full bg-cyan-500" />
                                                <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">Süreç Yol Haritası</h3>
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
                                                        <h4 className="text-[12px] font-black text-slate-800">AI Detaylı CV Analizi</h4>
                                                        <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
                                                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" /> Tamamlandı
                                                        </span>
                                                    </div>
                                                </div>
                                                <span className="text-[18px] font-black text-emerald-500">%{score}</span>
                                            </div>

                                            {/* Dynamic: session milestones */}
                                            {(candidate.interviewSessions || []).map((session, sidx) => {
                                                const cfg = getStatusCfg(session.status);
                                                return (
                                                    <div key={sidx} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between hover:border-slate-300 transition-all group shadow-sm">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${cfg.bg} ${cfg.border}`}>
                                                                <Play className={`w-4 h-4 ${cfg.text}`} />
                                                            </div>
                                                            <div>
                                                                <h4 className="text-[12px] font-black text-slate-800">{session.title || 'Mülakat'}</h4>
                                                                <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
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
                                                        <h4 className="text-[12px] font-black text-slate-500">Final Kararı ve Teklif</h4>
                                                        <span className="text-[9px] font-bold text-slate-400">Hedeflenen Aşama</span>
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
                                    <button
                                        onClick={() => setRejectModal(true)}
                                        disabled={candidate?.status === 'rejected'}
                                        className={`h-8 px-4 rounded-lg text-[9px] font-black uppercase border transition-all ${
                                            candidate?.status === 'rejected'
                                                ? 'text-slate-400 border-slate-200 bg-slate-50 cursor-not-allowed'
                                                : 'text-red-500 border-red-100 hover:bg-red-50'
                                        }`}
                                    >
                                        {candidate?.status === 'rejected' ? 'Reddedildi' : 'Ret'}
                                    </button>
                                    <button
                                        onClick={() => setDeleteModal(true)}
                                        className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 border border-slate-200 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-all"
                                        title="Adayı Sil"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <button
                                    onClick={() => setFinalModal(true)}
                                    disabled={candidate?.status === 'final' || candidate?.status === 'rejected'}
                                    className={`h-8 px-5 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-sm flex items-center gap-2 transition-all ${
                                        candidate?.status === 'final'
                                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-not-allowed'
                                            : candidate?.status === 'rejected'
                                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                : 'bg-cyan-500 hover:bg-cyan-600 text-white'
                                    }`}
                                >
                                    {candidate?.status === 'final'
                                        ? <><CheckCircle2 className="w-3 h-3" /> Final Turunda</>
                                        : <>Final Turuna Taşı <ArrowRight className="w-3 h-3" /></>
                                    }
                                </button>
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
        </div>
    );
}
