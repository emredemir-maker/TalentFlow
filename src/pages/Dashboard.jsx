// src/pages/Dashboard.jsx
// Premium dashboard with stats, filters, match-score-sorted grid, and drawer

import { useState, useCallback, useMemo } from 'react';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import { analyzeCandidateMatch } from '../services/geminiService';
import Header from '../components/Header';
import StatCard from '../components/StatCard';
import CandidateCard from '../components/CandidateCard';
import CandidateDrawer from '../components/CandidateDrawer';
import AddCandidateModal from '../components/AddCandidateModal';
import OpportunityHub from '../components/OpportunityHub';
import {
    Users,
    UserPlus,
    MessageSquare,
    CheckCircle,
    Send,
    XCircle,
    Filter,
    ArrowDownWideNarrow,
    Search,
    Plus,
    Brain,
    Loader2,
    Eye,
    GitBranch,
    Database,
    LayoutGrid,
    Columns3,
    List,
    Briefcase,
    Clock,
    MapPin,
    Sparkles,
    ArrowUpRight
} from 'lucide-react';
import { createPortal } from 'react-dom';

const STATUS_OPTIONS = [
    { value: 'all', label: 'Tüm Durumlar' },
    { value: 'ai_analysis', label: 'AI Analiz' },
    { value: 'review', label: 'İnceleme' },
    { value: 'interview', label: 'Mülakat' },
    { value: 'offer', label: 'Teklif' },
    { value: 'hired', label: 'İşe Alındı' },
    { value: 'rejected', label: 'Red' },
];


const EXPERIENCE_OPTIONS = [
    { value: 'all', label: 'Tüm Deneyim' },
    { value: '0-3', label: '0-3 Yıl' },
    { value: '4-6', label: '4-6 Yıl' },
    { value: '7-10', label: '7-10 Yıl' },
    { value: '11-99', label: '10+ Yıl' },
];

export default function Dashboard() {
    const {
        candidates,
        updateCandidate,
        filteredCandidates,
        stats,
        departments,
        loading,
        error,
        searchQuery,
        setSearchQuery,
        departmentFilter,
        setDepartmentFilter,
        statusFilter,
        setStatusFilter,
        experienceFilter,
        setExperienceFilter,
        positionFilter,
        setPositionFilter,
        matchPositions,
        deleteCandidate,
    } = useCandidates();

    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
    const { positions } = usePositions();

    // Stat card filter
    const [statFilter, setStatFilter] = useState(null); // null | 'all' | status key
    // View mode
    const [viewMode, setViewMode] = useState('card'); // card | kanban | list

    // Bulk analysis state
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analyzeProgress, setAnalyzeProgress] = useState(0);
    const [analyzeTotal, setAnalyzeTotal] = useState(0);
    const [analyzeCurrentCandidate, setAnalyzeCurrentCandidate] = useState(null);
    const [analyzeCurrentStage, setAnalyzeCurrentStage] = useState(null);
    const [analyzePosCurrent, setAnalyzePosCurrent] = useState(0);
    const [analyzePosTotal, setAnalyzePosTotal] = useState(0);

    // Sort by match score descending + apply stat filter
    const sortedCandidates = useMemo(() => {
        let list = [...filteredCandidates];
        // Migrate deep_review to interview
        list = list.map(c => c.status === 'deep_review' ? { ...c, status: 'interview' } : c);
        if (statFilter && statFilter !== 'all') {
            if (statFilter === '__total__') {
                // show all
            } else if (statFilter === '__new__') {
                list = list.filter(c => c.status === 'ai_analysis' || c.status === 'review' || !c.status);
            } else {
                list = list.filter(c => c.status === statFilter);
            }
        }
        return list.sort((a, b) => (b.combinedScore || 0) - (a.combinedScore || 0));
    }, [filteredCandidates, statFilter]);

    // Kanban drag state
    const [draggedId, setDraggedId] = useState(null);

    const handleSelectAll = () => {
        if (selectedIds.size === sortedCandidates.length && sortedCandidates.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(sortedCandidates.map(c => c.id)));
        }
    };

    const handleSelect = useCallback((id) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    }, [selectedIds]);

    const handleBulkDelete = async () => {
        if (!window.confirm(`${selectedIds.size} adayı silmek istediğinize emin misiniz?`)) return;

        setIsDeleting(true);
        try {
            await Promise.all(Array.from(selectedIds).map(id => deleteCandidate(id)));
            setSelectedIds(new Set());
        } catch (err) {
            console.error('Bulk delete failed:', err);
            alert('Silme işlemi sırasında bir hata oluştu.');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleBulkAnalyze = async () => {
        const openPositions = positions.filter(p => p.status === 'open');
        if (openPositions.length === 0) {
            alert("Açık pozisyon bulunamadı.");
            return;
        }

        setIsAnalyzing(true);
        const candidatesToAnalyze = Array.from(selectedIds);
        setAnalyzeTotal(candidatesToAnalyze.length);
        setAnalyzeProgress(0);
        setAnalyzePosTotal(openPositions.length);

        try {
            for (let i = 0; i < candidatesToAnalyze.length; i++) {
                const id = candidatesToAnalyze[i];
                const candidate = candidates.find(c => c.id === id);
                if (!candidate) continue;

                setAnalyzeCurrentCandidate(candidate);
                setAnalyzeProgress(((i) / candidatesToAnalyze.length) * 100);

                // STAGE 1: Scout
                setAnalyzeCurrentStage('scout');
                await new Promise(r => setTimeout(r, 600));

                const updatedAnalyses = { ...(candidate.positionAnalyses || {}) };
                let highestScore = -1;
                let bestResult = null;
                let bestTitle = candidate.matchedPositionTitle;

                // STAGE 2: Researcher & Analyst
                setAnalyzeCurrentStage('analyst');

                for (let j = 0; j < openPositions.length; j++) {
                    const pos = openPositions[j];
                    setAnalyzePosCurrent(j + 1);

                    const jobDesc = `${pos.title}\n${(pos.requirements || []).join(', ')}\n${pos.description || ''}`;
                    try {
                        const result = await analyzeCandidateMatch(jobDesc, candidate, 'gemini-2.0-flash');
                        updatedAnalyses[pos.title] = result;
                        if (result.score > highestScore) {
                            highestScore = result.score;
                            bestResult = result;
                            bestTitle = pos.title;
                        }
                    } catch (e) {
                        console.error("AI Error for pos", pos.title, e);
                    }
                }

                // STAGE 3: Recruiter (Saving)
                if (bestResult) {
                    setAnalyzeCurrentStage('recruiter');
                    await updateCandidate(candidate.id, {
                        aiAnalysis: bestResult,
                        summary: bestResult.summary,
                        matchScore: bestResult.score,
                        aiScore: bestResult.score,
                        matchedPositionTitle: bestTitle,
                        positionAnalyses: updatedAnalyses,
                        lastScannedAt: new Date().toISOString()
                    });
                    await new Promise(r => setTimeout(r, 800)); // small delay for visual feedback
                }
            }

            setAnalyzeProgress(100);
            setTimeout(() => {
                setSelectedIds(new Set());
                setIsAnalyzing(false);
                setAnalyzeCurrentCandidate(null);
            }, 2000);
        } catch (err) {
            console.error('Bulk analyze error:', err);
            alert('Analiz sırasında bir hata oluştu.');
            setIsAnalyzing(false);
        }
    };

    // Error state
    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                    <XCircle className="w-8 h-8 text-red-400" />
                </div>
                <h2 className="text-lg font-bold text-text-primary">Bağlantı Hatası</h2>
                <p className="text-sm text-text-muted max-w-sm">
                    Firebase bağlantısı kurulamadı. Yapılandırmanızı kontrol edin.
                </p>
                <p className="text-xs text-navy-600 font-mono">{error}</p>
            </div>
        );
    }

    return (
        <>
            <Header
                title="Dashboard"
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
            />

            {/* ===== OPPORTUNITY HUB (Smart Match Notifications) ===== */}
            <div className="px-6 lg:px-8 pt-6 pb-2">
                <OpportunityHub />
            </div>

            {/* ===== STATS ===== */}
            <div className="px-6 lg:px-8 py-6">
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 stagger">
                    <StatCard icon={Users} iconColor="text-electric-light" bgColor="bg-electric/10" value={stats.total} label="Toplam Aday"
                        isActive={statFilter === '__total__'}
                        onClick={() => setStatFilter(statFilter === '__total__' ? null : '__total__')} />
                    <StatCard icon={UserPlus} iconColor="text-violet-400" bgColor="bg-violet-500/10" value={(stats.byStatus?.ai_analysis || 0) + (stats.byStatus?.review || 0)} label="Yeni Başvuru" trend={12}
                        isActive={statFilter === '__new__'}
                        onClick={() => setStatFilter(statFilter === '__new__' ? null : '__new__')} />
                    <StatCard icon={MessageSquare} iconColor="text-blue-400" bgColor="bg-blue-500/10" value={stats.byStatus?.interview || 0} label="Mülakat"
                        isActive={statFilter === 'interview'}
                        onClick={() => setStatFilter(statFilter === 'interview' ? null : 'interview')} />
                    <StatCard icon={CheckCircle} iconColor="text-emerald-400" bgColor="bg-emerald-500/10" value={stats.byStatus?.hired || 0} label="İşe Alınan"
                        isActive={statFilter === 'hired'}
                        onClick={() => setStatFilter(statFilter === 'hired' ? null : 'hired')} />
                    <StatCard icon={Send} iconColor="text-cyan-400" bgColor="bg-cyan-500/10" value={stats.byStatus?.offer || 0} label="Teklif"
                        isActive={statFilter === 'offer'}
                        onClick={() => setStatFilter(statFilter === 'offer' ? null : 'offer')} />
                    <StatCard icon={XCircle} iconColor="text-red-400" bgColor="bg-red-500/10" value={stats.byStatus?.rejected || 0} label="Reddedilen"
                        isActive={statFilter === 'rejected'}
                        onClick={() => setStatFilter(statFilter === 'rejected' ? null : 'rejected')} />
                </div>
            </div>

            {/* ===== TOOLBAR ===== */}
            <div className="px-6 lg:px-8 pb-4 relative z-10">
                <div className="glass rounded-2xl p-4 border border-border-subtle shadow-lg flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 relative overflow-hidden">
                    <div className="absolute top-0 right-1/4 w-96 h-96 bg-electric/5 rounded-full blur-[100px] -z-10 pointer-events-none" />

                    {/* Left: Selection + Filters */}
                    <div className="flex items-center gap-4 flex-wrap w-full lg:w-auto">
                        {/* Select All Checkbox */}
                        <div
                            onClick={handleSelectAll}
                            className={`flex items-center gap-3 px-4 py-2 rounded-xl border transition-all cursor-pointer group shadow-sm ${selectedIds.size === sortedCandidates.length && sortedCandidates.length > 0
                                ? 'bg-electric/20 border-electric/40 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                                : 'bg-navy-800/10 border-border-subtle hover:bg-navy-800/20 hover:border-navy-400/20'}`}
                        >
                            <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${selectedIds.size === sortedCandidates.length && sortedCandidates.length > 0
                                ? 'bg-electric border-electric text-white'
                                : 'bg-navy-900 border-border-subtle group-hover:border-navy-400/40'}`}>
                                {selectedIds.size === sortedCandidates.length && sortedCandidates.length > 0 && (
                                    <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                )}
                            </div>
                            <span className={`text-[13px] font-bold transition-colors ${selectedIds.size === sortedCandidates.length && sortedCandidates.length > 0 ? "text-text-primary" : "text-text-muted group-hover:text-text-primary"}`}>Tümünü Seç</span>
                        </div>

                        <div className="hidden sm:flex items-center gap-1 text-text-muted mr-2 ml-2">
                            <span className="w-px h-6 bg-border-subtle"></span>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                            <div className="relative group">
                                <select
                                    value={departmentFilter}
                                    onChange={(e) => setDepartmentFilter(e.target.value)}
                                    className="px-4 py-2 rounded-xl bg-navy-800/20 hover:bg-navy-800/40 border border-border-subtle hover:border-navy-400/20 text-[13px] font-medium text-text-primary outline-none focus:border-electric/50 focus:bg-electric/5 transition-all cursor-pointer appearance-none pr-9 bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_10px_center] shadow-sm"
                                    id="department-filter"
                                >
                                    {departments.map((d) => (
                                        <option key={d} value={d}>{d === 'all' ? 'Tüm Departmanlar' : d}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="relative group">
                                <select
                                    value={positionFilter}
                                    onChange={(e) => setPositionFilter(e.target.value)}
                                    className="px-4 py-2 rounded-xl bg-navy-800/20 hover:bg-navy-800/40 border border-border-subtle hover:border-navy-400/20 text-[13px] font-medium text-text-primary outline-none focus:border-electric/50 focus:bg-electric/5 transition-all cursor-pointer appearance-none pr-9 bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_10px_center] shadow-sm"
                                    id="position-filter"
                                >
                                    {matchPositions.map((p) => (
                                        <option key={p} value={p}>{p === 'all' ? 'Tüm Pozisyonlar' : p}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="relative group">
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="px-4 py-2 rounded-xl bg-navy-800/20 hover:bg-navy-800/40 border border-border-subtle hover:border-navy-400/20 text-[13px] font-medium text-text-primary outline-none focus:border-electric/50 focus:bg-electric/5 transition-all cursor-pointer appearance-none pr-9 bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_10px_center] shadow-sm"
                                    id="status-filter"
                                >
                                    {STATUS_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="relative group">
                                <select
                                    value={experienceFilter}
                                    onChange={(e) => setExperienceFilter(e.target.value)}
                                    className="px-4 py-2 rounded-xl bg-navy-800/20 hover:bg-navy-800/40 border border-border-subtle hover:border-navy-400/20 text-[13px] font-medium text-text-primary outline-none focus:border-electric/50 focus:bg-electric/5 transition-all cursor-pointer appearance-none pr-9 bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_10px_center] shadow-sm"
                                    id="experience-filter"
                                >
                                    {EXPERIENCE_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Right: Actions/Count */}
                    <div className="flex items-center justify-between lg:justify-end w-full lg:w-auto gap-4">
                        {selectedIds.size > 0 ? (
                            <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-300 w-full lg:w-auto">
                                <span className="text-sm font-bold text-text-primary bg-navy-800/40 px-3 py-1.5 rounded-lg border border-border-subtle">
                                    {selectedIds.size} Seçili
                                </span>
                                <button
                                    onClick={handleBulkAnalyze}
                                    disabled={isAnalyzing || isDeleting}
                                    className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-electric to-blue-600 hover:from-electric-light hover:to-electric text-white text-[13px] font-bold shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:shadow-[0_0_25px_rgba(59,130,246,0.5)] transform hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
                                >
                                    <Sparkles className="w-4 h-4" />
                                    {isAnalyzing ? 'Analiz Ediliyor...' : 'Detaylı Olarak Skorla'}
                                </button>
                                <button
                                    onClick={handleBulkDelete}
                                    disabled={isDeleting || isAnalyzing}
                                    className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/40 transition-all cursor-pointer"
                                    title="Seçilenleri Sil"
                                >
                                    <XCircle className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => setSelectedIds(new Set())}
                                    className="p-2.5 rounded-xl bg-navy-800/20 hover:bg-navy-800/40 text-text-muted hover:text-text-primary border border-border-subtle transition-all cursor-pointer"
                                    title="Seçimi Temizle"
                                >
                                    Kapat
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-4 w-full lg:w-auto justify-between lg:justify-end">
                                {/* Mobile search inside toolbar space on small screens */}
                                <div className="sm:hidden relative flex-1 mr-2">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-500 pointer-events-none" />
                                    <input
                                        type="text"
                                        placeholder="Ara..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-navy-800/20 border border-border-subtle text-sm text-text-secondary placeholder:text-navy-500 outline-none focus:border-electric/40 focus:bg-navy-800/40 transition-all"
                                    />
                                </div>
                                <div className="flex items-center gap-4">
                                    {/* View Mode Toggle */}
                                    <div className="hidden lg:flex items-center gap-1 bg-navy-900/50 rounded-xl p-1 border border-border-subtle shadow-inner">
                                        {[
                                            { id: 'card', icon: LayoutGrid, label: 'Kılavuz' },
                                            { id: 'kanban', icon: Columns3, label: 'Kanban' },
                                            { id: 'list', icon: List, label: 'Liste' },
                                        ].map(v => (
                                            <button key={v.id} onClick={() => setViewMode(v.id)} title={v.label}
                                                className={`p-2 rounded-lg transition-all duration-200 ${viewMode === v.id ? 'bg-electric text-white shadow-md' : 'text-text-muted hover:text-text-primary hover:bg-navy-800/40'}`}>
                                                <v.icon className="w-4 h-4" />
                                            </button>
                                        ))}
                                    </div>

                                    <button
                                        onClick={() => setIsAddModalOpen(true)}
                                        className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-electric text-white hover:bg-electric-dark text-[13px] font-black tracking-wide shadow-lg shadow-electric/20 transform hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer whitespace-nowrap"
                                    >
                                        <Plus className="w-4 h-4" />
                                        <span>Aday Ekle</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ===== CANDIDATES AREA ===== */}
            <div className="px-6 lg:px-8 pb-8 md:pb-8 pb-24">
                {/* Stat filter active indicator */}
                {statFilter && (
                    <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-electric/5 border border-electric/20 text-electric-light text-xs font-medium">
                        <Filter className="w-3 h-3" />
                        <span>Filtreleniyor: <strong>{statFilter === '__total__' ? 'Tüm Adaylar' : statFilter === '__new__' ? 'Yeni Başvurular' : statFilter === 'interview' ? 'Mülakat' : statFilter === 'hired' ? 'İşe Alınan' : statFilter === 'offer' ? 'Teklif' : statFilter === 'rejected' ? 'Reddedilen' : statFilter}</strong></span>
                        <button onClick={() => setStatFilter(null)} className="ml-auto p-1 rounded hover:bg-white/10"><XCircle className="w-3 h-3" /></button>
                    </div>
                )}

                {/* Loading skeleton */}
                {loading && (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="glass rounded-2xl p-5">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="skeleton w-11 h-11 rounded-full" />
                                    <div className="flex-1 space-y-2">
                                        <div className="skeleton h-4 w-3/5 rounded" />
                                        <div className="skeleton h-3 w-2/5 rounded" />
                                    </div>
                                    <div className="skeleton w-12 h-12 rounded-full" />
                                </div>
                                <div className="skeleton h-3 w-full rounded mb-2" />
                                <div className="skeleton h-3 w-4/5 rounded mb-4" />
                                <div className="flex gap-2">
                                    <div className="skeleton h-6 w-16 rounded-md" />
                                    <div className="skeleton h-6 w-16 rounded-md" />
                                    <div className="skeleton h-6 w-16 rounded-md" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Empty state */}
                {!loading && sortedCandidates.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center glass rounded-3xl border border-border-subtle relative overflow-hidden group">
                        <div className="absolute inset-0 bg-electric/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-2xl"></div>
                        <div className="w-20 h-20 rounded-full bg-navy-800/10 border border-border-subtle flex items-center justify-center relative z-10 group-hover:scale-110 transition-transform duration-500 shadow-xl shadow-black/20">
                            <Users className="w-8 h-8 text-text-muted group-hover:text-electric transition-colors duration-500" style={{ animation: 'float-subtle 3s ease-in-out infinite' }} />
                        </div>
                        <h3 className="text-xl font-bold text-text-primary relative z-10">
                            {searchQuery || departmentFilter !== 'all' || statusFilter !== 'all' || statFilter
                                ? 'Sonuç Bulunamadı'
                                : 'Henüz Aday Yok'}
                        </h3>
                        <p className="text-sm text-text-muted max-w-sm relative z-10">
                            {searchQuery || departmentFilter !== 'all' || statusFilter !== 'all' || statFilter
                                ? 'Filtreleri değiştirerek tekrar deneyin.'
                                : 'Aday havuzunuz boş. Yeni bir aday ekleyerek başlayabilirsiniz.'}
                        </p>
                    </div>
                )}

                {/* ===== VIEW: CARD (Default Grid) ===== */}
                {!loading && sortedCandidates.length > 0 && viewMode === 'card' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
                        {sortedCandidates.map((candidate, index) => (
                            <CandidateCard
                                key={candidate.id}
                                candidate={candidate}
                                index={index}
                                isSelected={selectedIds.has(candidate.id)}
                                onSelect={() => handleSelect(candidate.id)}
                                onClick={setSelectedCandidate}
                            />
                        ))}
                    </div>
                )}

                {/* ===== VIEW: KANBAN ===== */}
                {!loading && sortedCandidates.length > 0 && viewMode === 'kanban' && (
                    <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
                        {[
                            { key: 'ai_analysis', label: 'AI Analiz', dot: 'bg-violet-400', border: 'border-violet-500/30' },
                            { key: 'review', label: 'İnceleme', dot: 'bg-amber-400', border: 'border-amber-500/30' },
                            { key: 'interview', label: 'Mülakat', dot: 'bg-blue-400', border: 'border-blue-500/30' },
                            { key: 'offer', label: 'Teklif', dot: 'bg-cyan-400', border: 'border-cyan-500/30' },
                            { key: 'hired', label: 'İşe Alındı', dot: 'bg-emerald-400', border: 'border-emerald-500/30' },
                            { key: 'rejected', label: 'Red', dot: 'bg-red-400', border: 'border-red-500/30' },
                        ].map(col => {
                            const colCandidates = sortedCandidates.filter(c => (c.status || 'ai_analysis') === col.key);
                            return (
                                <div key={col.key}
                                    className={`min-w-[260px] flex-1 flex flex-col rounded-3xl p-2 transition-all duration-300 border border-transparent ${draggedId ? 'bg-navy-800/5' : ''
                                        }`}
                                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-electric/30', 'bg-electric/5', 'shadow-[0_0_20px_rgba(59,130,246,0.1)]'); }}
                                    onDragLeave={(e) => { e.currentTarget.classList.remove('border-electric/30', 'bg-electric/5', 'shadow-[0_0_20px_rgba(59,130,246,0.1)]'); }}
                                    onDrop={async (e) => {
                                        e.preventDefault();
                                        e.currentTarget.classList.remove('border-electric/30', 'bg-electric/5', 'shadow-[0_0_20px_rgba(59,130,246,0.1)]');
                                        const cid = e.dataTransfer.getData('candidateId');
                                        if (cid) {
                                            const cand = sortedCandidates.find(c => c.id === cid);
                                            if (cand && (cand.status || 'ai_analysis') !== col.key) {
                                                try {
                                                    await updateCandidate(cid, { status: col.key });
                                                } catch (err) { console.error(err); }
                                            }
                                        }
                                        setDraggedId(null);
                                    }}
                                >
                                    <div className="flex items-center gap-2 px-4 py-3 mb-3 rounded-2xl bg-navy-800/10 border border-border-subtle shadow-sm backdrop-blur-md">
                                        <span className={`w-3 h-3 rounded-full shadow-lg ${col.dot}`} />
                                        <span className="text-sm font-bold text-text-primary flex-1 tracking-wide">{col.label}</span>
                                        <span className="text-[11px] font-black text-text-muted bg-navy-900/50 border border-border-subtle px-2 py-1 rounded-lg">{colCandidates.length}</span>
                                    </div>
                                    <div className="flex-1 space-y-3 min-h-[120px] max-h-[65vh] overflow-y-auto pr-1 flex flex-col custom-scrollbar pb-2">
                                        {colCandidates.length === 0 && (
                                            <div className="text-center py-10 flex flex-col items-center justify-center text-text-muted text-xs border-2 border-dashed border-border-subtle rounded-2xl h-full mt-2 mx-1">
                                                Buraya sürükleyin
                                            </div>
                                        )}
                                        {colCandidates.map(c => (
                                            <div key={c.id}
                                                draggable
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData('candidateId', c.id);
                                                    setDraggedId(c.id);
                                                }}
                                                onDragEnd={() => setDraggedId(null)}
                                                onClick={() => setSelectedCandidate(c)}
                                                className={`p-4 rounded-2xl border transition-all duration-300 cursor-grab active:cursor-grabbing group shadow-sm bg-gradient-to-br from-navy-800/10 to-transparent ${draggedId === c.id
                                                    ? 'opacity-40 border-electric/30 bg-electric/10 scale-95 shadow-none'
                                                    : 'border-border-subtle hover:bg-navy-800/20 hover:border-electric/30 hover:shadow-[0_8px_20px_rgba(0,0,0,0.2)]'
                                                    }`}>
                                                <div className="flex items-center gap-3 mb-3">
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[11px] font-bold text-white shadow-md shrink-0">
                                                        {c.name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold text-text-primary truncate group-hover:text-electric-light transition-colors">{c.name}</p>
                                                        <p className="text-[11px] text-text-muted truncate">{c.position}</p>
                                                    </div>
                                                    {c.combinedScore > 0 && (
                                                        <span className={`text-[10px] font-black px-2 py-1 rounded-md border ${c.combinedScore >= 70 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-navy-800/20 text-text-muted border-border-subtle'}`}>
                                                            %{Math.round(c.combinedScore)}
                                                        </span>
                                                    )}
                                                </div>
                                                {c.skills?.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                                        {c.skills.slice(0, 2).map(s => (
                                                            <span key={s} className="text-[10px] font-medium text-text-secondary bg-navy-800/20 px-2 py-0.5 rounded-md border border-border-subtle">{s}</span>
                                                        ))}
                                                        {c.skills.length > 2 && <span className="text-[10px] font-medium text-text-muted bg-navy-800/10 px-1.5 py-0.5 rounded-md">+{c.skills.length - 2}</span>}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ===== VIEW: LIST ===== */}
                {!loading && sortedCandidates.length > 0 && viewMode === 'list' && (
                    <div className="bg-navy-900/10 rounded-3xl border border-border-subtle overflow-hidden shadow-2xl">
                        {/* Table Header */}
                        <div className="grid grid-cols-[1fr_200px_140px_100px_80px_60px] gap-6 px-6 py-4 border-b border-border-subtle bg-navy-800/10">
                            <span className="text-[11px] font-black text-text-muted uppercase tracking-widest">Aday</span>
                            <span className="text-[11px] font-black text-text-muted uppercase tracking-widest">Pozisyon</span>
                            <span className="text-[11px] font-black text-text-muted uppercase tracking-widest">Durum</span>
                            <span className="text-[11px] font-black text-text-muted uppercase tracking-widest">Deneyim</span>
                            <span className="text-[11px] font-black text-text-muted uppercase tracking-widest">Skor</span>
                            <span className="text-[11px] font-black text-text-muted uppercase tracking-widest"></span>
                        </div>
                        {/* Table Rows */}
                        <div className="divide-y divide-border-subtle">
                            {sortedCandidates.map((c, i) => {
                                const statusCfg = {
                                    ai_analysis: { l: 'AI Analiz', cls: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
                                    review: { l: 'İnceleme', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
                                    interview: { l: 'Mülakat', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
                                    offer: { l: 'Teklif', cls: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
                                    hired: { l: 'İşe Alındı', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
                                    rejected: { l: 'Red', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
                                };
                                const st = statusCfg[c.status] || statusCfg.ai_analysis;
                                return (
                                    <div key={c.id} onClick={() => setSelectedCandidate(c)}
                                        className="grid grid-cols-[1fr_200px_140px_100px_80px_60px] gap-6 px-6 py-4 items-center cursor-pointer transition-all hover:bg-navy-800/20 hover:px-7 duration-300 group">
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-md">
                                                {c.name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[15px] font-bold text-text-primary truncate transition-colors">{c.name}</p>
                                                <p className="text-[11px] text-text-muted truncate">{c.email}</p>
                                            </div>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[13px] font-bold text-text-secondary truncate">{c.matchedPositionTitle || c.position}</p>
                                            <p className="text-[11px] text-text-muted truncate">{c.department}</p>
                                        </div>
                                        <div>
                                            <span className={`inline-flex items-center justify-center px-3 py-1 rounded-md text-[11px] font-bold border ${st.cls}`}>{st.l}</span>
                                        </div>
                                        <span className="text-[13px] font-medium text-text-secondary">{c.experience || 0} yıl</span>
                                        <span className={`text-[15px] font-extrabold ${c.combinedScore >= 70 ? 'text-emerald-400' : c.combinedScore >= 40 ? 'text-amber-400' : 'text-navy-400'}`}>
                                            {c.combinedScore > 0 ? `%${Math.round(c.combinedScore)}` : '-'}
                                        </span>
                                        <div className="w-8 h-8 rounded-full bg-navy-800/20 flex items-center justify-center group-hover:bg-electric/10 group-hover:text-electric transition-all ml-auto">
                                            <ArrowUpRight className="w-4 h-4 text-text-muted group-hover:text-electric" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* ===== DRAWER ===== */}
            {selectedCandidate && (
                <CandidateDrawer
                    candidate={selectedCandidate}
                    onClose={() => setSelectedCandidate(null)}
                />
            )}

            {/* ===== MODALS ===== */}
            <AddCandidateModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
            />

            {/* ===== BULK ANALYSIS MODAL ===== */}
            {isAnalyzing && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-navy-900/90 border border-white/[0.08] backdrop-blur-2xl rounded-3xl w-full max-w-lg shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col relative mx-auto my-auto ring-1 ring-white/10">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-electric/20 rounded-full blur-[80px] -z-10 pointer-events-none" />

                        <div className="p-6 border-b border-white/[0.04] flex justify-between items-center bg-white/[0.01]">
                            <div>
                                <h2 className="text-xl font-black text-white flex items-center gap-3">
                                    {analyzeProgress < 100 ? (
                                        <>
                                            <span className="relative flex h-3 w-3">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-electric opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-electric"></span>
                                            </span>
                                            Detaylı Deterministik Analiz
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle className="w-6 h-6 text-emerald-400" />
                                            Analiz Tamamlandı
                                        </>
                                    )}
                                </h2>
                                <p className="text-[13px] text-navy-400 mt-2 font-medium">
                                    {analyzeProgress < 100 ? 'Yapay zeka tüm pozisyonlar için 0 sapma ile kesin skoru hesaplıyor.' : 'Aday skorları başarıyla güncellendi.'}
                                </p>
                            </div>
                        </div>

                        <div className="h-1.5 bg-navy-950 w-full relative">
                            <div
                                className="absolute inset-0 bg-electric/20 blur shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                style={{ width: `${analyzeProgress}%` }}
                            />
                            <div
                                className="h-full bg-gradient-to-r from-electric to-emerald-400 transition-all duration-300 ease-out relative z-10"
                                style={{ width: `${analyzeProgress}%` }}
                            />
                        </div>

                        <div className="p-8 flex flex-col items-center justify-center min-h-[300px] relative">
                            {analyzeProgress < 100 && analyzeCurrentCandidate ? (
                                <div className="flex flex-col items-center animate-in zoom-in-95 duration-500 w-full">
                                    <div className="w-24 h-24 rounded-full bg-navy-800/80 border-[4px] border-white/10 flex items-center justify-center mb-6 relative shadow-[0_0_30px_rgba(0,0,0,0.3)] backdrop-blur-sm">
                                        <span className="text-3xl font-black text-white">{analyzeCurrentCandidate.name?.[0]}</span>
                                        <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-navy-900 border-2 border-white/10 flex items-center justify-center shadow-xl">
                                            {analyzeCurrentStage === 'scout' && <Eye className="w-5 h-5 text-blue-400 animate-pulse drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]" />}
                                            {analyzeCurrentStage === 'analyst' && <Brain className="w-5 h-5 text-purple-400 animate-pulse drop-shadow-[0_0_8px_rgba(192,132,252,0.8)]" />}
                                            {analyzeCurrentStage === 'recruiter' && <Database className="w-5 h-5 text-emerald-400 animate-pulse drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />}
                                        </div>
                                    </div>

                                    <h3 className="text-2xl font-black text-white mb-2 tracking-tight">{analyzeCurrentCandidate.name}</h3>
                                    <p className="text-[13px] font-bold text-navy-400 mb-8 text-center px-4 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                                        Mevcut Pozisyon: <span className="text-white ml-2">{analyzeCurrentCandidate.position || '-'}</span>
                                    </p>

                                    <div className="flex flex-col items-center w-full">
                                        <div className={`flex items-center gap-3 px-6 py-3 rounded-xl border self-center shadow-lg transition-all duration-500
                                            ${analyzeCurrentStage === 'scout' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                                                analyzeCurrentStage === 'analyst' ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' :
                                                    'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}
                                        `}>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            <span className="text-sm font-bold uppercase tracking-wider">
                                                {analyzeCurrentStage === 'scout' && 'Aday Özgeçmişi Taranıyor...'}
                                                {analyzeCurrentStage === 'analyst' && `Pozisyon Analizi (${analyzePosCurrent}/${analyzePosTotal})`}
                                                {analyzeCurrentStage === 'recruiter' && 'Sonuçlar Kaydediliyor...'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center animate-in zoom-in-95 duration-500">
                                    <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(52,211,153,0.2)]">
                                        <CheckCircle className="w-10 h-10 text-emerald-400" />
                                    </div>
                                    <h3 className="text-3xl font-black text-white mb-3 tracking-tight">İşlem Tamamlandı</h3>
                                    <p className="text-navy-300 mb-8 max-w-sm text-sm leading-relaxed">
                                        Seçili <strong className="text-white">{analyzeTotal}</strong> adayın detaylı skorlama analizi yapay zeka tarafından başarıyla gerçekleştirildi.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
