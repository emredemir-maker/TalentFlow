// src/pages/CandidateProcessPage.jsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCandidates } from '../context/CandidatesContext';
import {
    Plus, Search, Zap, Star, Brain, X,
    Target, Briefcase, TrendingUp, ShieldCheck, ArrowRight, FileText, Clock,
    Sparkles, AlertCircle, Trophy, Calendar, Edit3, Trash2,
    CheckCircle2, Link2, ExternalLink, Video, Play, Award, User, Mail,
    ChevronRight, BarChart2, MessageSquare
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
    const { enrichedCandidates, viewCandidateId, setViewCandidateId, sourceColors, setPreselectedInterviewData } = useCandidates();
    const candidates = enrichedCandidates || [];
    const [searchQuery, setSearchQuery]   = useState('');
    const [activeTab, setActiveTab]       = useState('ai_analysis');

    const candidate = useMemo(() => {
        if (!viewCandidateId && candidates.length > 0) return candidates[0];
        return candidates.find(c => c.id === viewCandidateId) || (candidates.length > 0 ? candidates[0] : null);
    }, [candidates, viewCandidateId]);

    const filtered = useMemo(() =>
        candidates.filter(c =>
            c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.position?.toLowerCase().includes(searchQuery.toLowerCase())
        ), [candidates, searchQuery]);

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
            <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-cyan-50 border border-cyan-100 flex items-center justify-center">
                        <User className="w-4 h-4 text-cyan-600" />
                    </div>
                    <div>
                        <h1 className="text-[13px] font-black text-slate-900 tracking-tight">Aday Yönetimi</h1>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{candidates.length} ADAY • AKTİF SÜREÇ</p>
                    </div>
                </div>
                <button className="h-8 px-4 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all shadow-sm shadow-cyan-200">
                    <Plus className="w-3.5 h-3.5" /> Yeni Aday
                </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* ── LEFT: CANDIDATE LIST ─────────────────────────────────── */}
                <aside className="w-[280px] shrink-0 flex flex-col bg-white border-r border-slate-200">
                    {/* Search */}
                    <div className="p-3 border-b border-slate-100">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Aday veya rol ara..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-8 pr-3 text-[11px] font-medium text-slate-700 placeholder-slate-400 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-50 transition-all"
                            />
                        </div>
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
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
                                    className={`w-full text-left rounded-xl border px-3 py-2.5 flex items-center gap-3 transition-all ${
                                        isActive
                                            ? 'bg-cyan-50 border-cyan-300 shadow-sm'
                                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                    }`}
                                >
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-black/5">
                                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${c.name}`} className="w-full h-full object-cover" alt="" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[12px] font-black text-slate-900 truncate leading-tight">{c.name}</p>
                                        <span
                                            className="text-[7px] font-black px-1.5 py-0.5 rounded mt-0.5 inline-flex items-center gap-0.5 uppercase"
                                            style={{ color: srcColor, backgroundColor: `${srcColor}18` }}
                                        >
                                            <Link2 className="w-2 h-2" /> {getSourceLabel(c)}
                                        </span>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <span className={`text-[11px] font-black ${isActive ? 'text-cyan-600' : 'text-slate-600'}`}>%{sc}</span>
                                        <Zap className="w-2.5 h-2.5 inline ml-0.5 fill-amber-400 text-amber-400" />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </aside>

                {/* ── RIGHT: DETAIL PANEL ───────────────────────────────────── */}
                <main className="flex-1 overflow-hidden flex flex-col bg-slate-50">
                    {candidate ? (
                        <div className="flex-1 overflow-hidden flex flex-col bg-white m-4 rounded-2xl border border-slate-200 shadow-sm">

                            {/* Candidate header */}
                            <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl border-2 border-white shadow-md overflow-hidden shrink-0 ring-2 ring-cyan-100">
                                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${candidate.name}`} className="w-full h-full object-cover" alt="" />
                                    </div>
                                    <div>
                                        <h2 className="text-[18px] font-black text-slate-900 tracking-tight leading-none">{candidate.name}</h2>
                                        <p className="text-[10px] text-slate-500 font-bold mt-0.5">{candidate.position || candidate.bestTitle || '—'}</p>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
                                                <Target className="w-2.5 h-2.5" /> İlk %2
                                            </span>
                                            <span className="text-[9px] font-black text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full border border-cyan-100 flex items-center gap-1">
                                                <Zap className="w-2.5 h-2.5 fill-cyan-500" /> %{score} Uyum
                                            </span>
                                            {candidate.email && (
                                                <span className="text-[9px] font-medium text-slate-500 flex items-center gap-1">
                                                    <Mail className="w-2.5 h-2.5" /> {candidate.email}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Stat pills */}
                                <div className="flex items-center gap-2">
                                    <div className="flex flex-col items-center bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 min-w-[72px]">
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">STAR Güveni</span>
                                        <span className="text-[18px] font-black text-slate-800 leading-tight">{candidate.bestScore ? `${Math.round(candidate.bestScore * 0.98)}%` : '—'}</span>
                                    </div>
                                    <div className="flex flex-col items-center bg-cyan-500 rounded-xl px-4 py-2.5 min-w-[72px] shadow-sm shadow-cyan-200">
                                        <span className="text-[8px] font-black text-cyan-100 uppercase tracking-widest">Uyum</span>
                                        <span className="text-[18px] font-black text-white leading-tight">
                                            {score > 80 ? 'GÜÇLÜ' : score > 60 ? 'ORTA' : 'ZAYIF'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="flex border-b border-slate-100 px-6 bg-white">
                                {TABS.map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`flex items-center gap-1.5 py-3 px-1 mr-6 text-[9px] font-black uppercase tracking-widest relative whitespace-nowrap transition-colors ${
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
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">

                                {/* ── STAR ANALİZİ ── */}
                                {activeTab === 'ai_analysis' && (
                                    <div className="space-y-5 animate-in fade-in duration-300">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className="w-1 h-4 rounded-full bg-cyan-500" />
                                            <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">Detaylı STAR Değerlendirmesi</h3>
                                        </div>

                                        <div className="space-y-4">
                                            {[
                                                { k: 'S', l: 'DURUM (SITUATION)', bg: 'bg-blue-50',   border: 'border-blue-100',   tc: 'text-blue-700',   r: starAnalysis.Situation.reason },
                                                { k: 'T', l: 'GÖREV (TASK)',      bg: 'bg-teal-50',   border: 'border-teal-100',   tc: 'text-teal-700',   r: starAnalysis.Task.reason },
                                                { k: 'A', l: 'EYLEM (ACTION)',    bg: 'bg-violet-50', border: 'border-violet-100', tc: 'text-violet-700', r: starAnalysis.Action.reason },
                                                { k: 'R', l: 'SONUÇ (RESULT)',   bg: 'bg-emerald-50',border: 'border-emerald-100',tc: 'text-emerald-700',r: starAnalysis.Result.reason },
                                            ].map((step, idx) => {
                                                const { pos, neg } = parseFeedback(step.r);
                                                return (
                                                    <div key={idx} className={`rounded-xl border ${step.border} ${step.bg} p-4`}>
                                                        <div className="flex items-center gap-2 mb-3">
                                                            <div className={`w-7 h-7 rounded-lg bg-white border ${step.border} flex items-center justify-center text-[13px] font-black ${step.tc} shadow-sm`}>{step.k}</div>
                                                            <h4 className={`text-[10px] font-black uppercase tracking-wider ${step.tc}`}>{step.l}</h4>
                                                        </div>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                            {pos && (
                                                                <div className="bg-white border border-emerald-100 p-3 rounded-lg">
                                                                    <div className="flex items-center gap-1 text-[8px] font-black text-emerald-600 uppercase mb-1.5">
                                                                        <ShieldCheck className="w-3 h-3" /> Pozitif
                                                                    </div>
                                                                    <p className="text-[11px] text-slate-600 leading-relaxed">{pos}</p>
                                                                </div>
                                                            )}
                                                            {neg && (
                                                                <div className="bg-white border border-red-100 p-3 rounded-lg">
                                                                    <div className="flex items-center gap-1 text-[8px] font-black text-red-500 uppercase mb-1.5">
                                                                        <AlertCircle className="w-3 h-3" /> Negatif
                                                                    </div>
                                                                    <p className="text-[11px] text-slate-600 leading-relaxed">{neg}</p>
                                                                </div>
                                                            )}
                                                            {!pos && !neg && (
                                                                <p className="text-[11px] text-slate-400 italic col-span-2">{step.r || 'Mülakat verisi bekleniyor.'}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
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
                                                    )) : (
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
                                                    return (
                                                        <div key={sidx} className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all flex items-center justify-between gap-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${cfg.bg} ${cfg.border} ${cfg.pulse ? 'animate-pulse' : ''}`}>
                                                                    <Video className={`w-5 h-5 ${cfg.text}`} />
                                                                </div>
                                                                <div>
                                                                    <h4 className="text-[12px] font-black text-slate-800">{session.title || 'Mülakat Seansı'}</h4>
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
                                                                        <span className={`text-[8px] font-black px-2 py-0.5 rounded-lg border ${cfg.bg} ${cfg.text} ${cfg.border} ${cfg.pulse ? 'animate-pulse' : ''}`}>
                                                                            {cfg.label}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-2 shrink-0">
                                                                {session.status === 'live' && (
                                                                    <button
                                                                        onClick={() => navigate(`/live-interview/${session.id}`)}
                                                                        className="bg-rose-500 text-white px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-rose-600 transition-all shadow-sm"
                                                                    >
                                                                        SEANSA KATIL
                                                                    </button>
                                                                )}
                                                                {session.status === 'completed' && (
                                                                    <button
                                                                        onClick={() => navigate(`/interview-report/${session.id}`)}
                                                                        className="bg-slate-800 text-white px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-slate-900 transition-all shadow-sm flex items-center gap-1.5"
                                                                    >
                                                                        <Award className="w-3 h-3" /> RAPORU AÇ
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => {
                                                                        setPreselectedInterviewData({ candidateId: candidate.id, session });
                                                                        window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }));
                                                                    }}
                                                                    className="p-1.5 text-slate-300 hover:text-cyan-500 transition-colors"
                                                                    title="Düzenle"
                                                                >
                                                                    <Edit3 className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        setPreselectedInterviewData({ candidateId: candidate.id, sessionId: session.id });
                                                                        window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }));
                                                                    }}
                                                                    className="p-1.5 text-slate-300 hover:text-slate-600 transition-colors"
                                                                    title="Mülakat sayfasına git"
                                                                >
                                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>
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
                            <div className="border-t border-slate-100 px-6 py-3 flex items-center justify-between bg-white shrink-0">
                                <div className="flex gap-2">
                                    <button className="h-8 px-4 bg-slate-50 text-slate-600 rounded-lg text-[9px] font-black uppercase border border-slate-200 hover:bg-slate-100 transition-all flex items-center gap-1.5">
                                        <MessageSquare className="w-3 h-3" /> Yorum
                                    </button>
                                    <button className="h-8 px-4 text-red-500 rounded-lg text-[9px] font-black uppercase border border-red-100 hover:bg-red-50 transition-all">
                                        Ret
                                    </button>
                                </div>
                                <button className="h-8 px-5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow-sm flex items-center gap-2 transition-all">
                                    Final Turuna Taşı <ArrowRight className="w-3 h-3" />
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
        </div>
    );
}
