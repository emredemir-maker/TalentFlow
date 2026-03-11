// src/pages/Dashboard.jsx
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
import BulkUpdateModal from '../components/BulkUpdateModal';
import CandidateComparisonModal from '../components/CandidateComparisonModal';
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
    ArrowUpRight,
    Tag,
    Layers,
    RotateCcw,
    Share2,
    ArrowRight
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { seedCandidates } from '../services/firestoreService';

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
        sourceFilter,
        setSourceFilter,
        sourcesOptions,
        subSourceFilter,
        setSubSourceFilter,
        subSourcesOptions,
        compareIds,
        clearCompareSelection,
    } = useCandidates();

    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
    const { positions } = usePositions();

    const [statFilter, setStatFilter] = useState(null);
    const [viewMode, setViewMode] = useState('card');

    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analyzeProgress, setAnalyzeProgress] = useState(0);
    const [analyzeTotal, setAnalyzeTotal] = useState(0);
    const [analyzeCurrentCandidate, setAnalyzeCurrentCandidate] = useState(null);
    const [analyzeCurrentStage, setAnalyzeCurrentStage] = useState(null);
    const [analyzePosCurrent, setAnalyzePosCurrent] = useState(0);
    const [analyzePosTotal, setAnalyzePosTotal] = useState(0);

    const [bulkUpdateType, setBulkUpdateType] = useState(null);
    const [isBulkUpdateOpen, setIsBulkUpdateOpen] = useState(false);
    const [isBulkUpdating, setIsBulkUpdating] = useState(false);
    const [isSeeding, setIsSeeding] = useState(false);
    const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);

    const sortedCandidates = useMemo(() => {
        let list = [...filteredCandidates];
        list = list.map(c => c.status === 'deep_review' ? { ...c, status: 'interview' } : c);
        if (statFilter && statFilter !== 'all') {
            if (statFilter === '__total__') {
            } else if (statFilter === '__new__') {
                list = list.filter(c => c.status === 'ai_analysis' || c.status === 'review' || !c.status);
            } else {
                list = list.filter(c => c.status === statFilter);
            }
        }
        return list.sort((a, b) => (b.combinedScore || 0) - (a.combinedScore || 0));
    }, [filteredCandidates, statFilter]);

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
        } finally {
            setIsDeleting(false);
        }
    };

    const handleBulkAnalyze = async () => {
        const openPositions = positions.filter(p => p.status === 'open');
        if (openPositions.length === 0) return alert("Açık pozisyon bulunamadı.");

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
                setAnalyzeCurrentStage('scout');
                await new Promise(r => setTimeout(r, 600));

                const updatedAnalyses = { ...(candidate.positionAnalyses || {}) };
                let highestScore = -1;
                let bestResult = null;
                let bestTitle = candidate.matchedPositionTitle;

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

                if (bestResult) {
                    setAnalyzeCurrentStage('recruiter');
                    await updateCandidate(candidate.id, {
                        aiAnalysis: bestResult,
                        summary: bestResult.summary,
                        matchScore: bestResult.score,
                        aiScore: bestResult.score,
                        matchedPositionTitle: bestTitle,
                        positionAnalyses: updatedAnalyses,
                        isDeepMatch: true,
                        lastScannedAt: new Date().toISOString()
                    });
                    await new Promise(r => setTimeout(r, 800));
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
            setIsAnalyzing(false);
        }
    };

    const handleBulkUpdate = async (updates) => {
        setIsBulkUpdating(true);
        try {
            await Promise.all(Array.from(selectedIds).map(id => updateCandidate(id, updates)));
            setSelectedIds(new Set());
        } catch (err) {
            console.error('Bulk update failed:', err);
        } finally {
            setIsBulkUpdating(false);
        }
    };

    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                    <XCircle className="w-8 h-8 text-red-400" />
                </div>
                <h2 className="text-lg font-bold text-text-primary uppercase tracking-tight">Bağlantı Hatası</h2>
                <p className="text-sm text-text-muted max-w-sm">Firebase oturumu kurulamadı.</p>
                <p className="text-[10px] text-text-muted font-mono opacity-50">{error}</p>
            </div>
        );
    }

    return (
        <div className="relative isolate min-h-screen pb-20 overflow-x-hidden bg-bg-primary transition-colors duration-500">
            {/* Ambient Background Glows */}
            <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none -z-10 animate-pulse" />
            <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-600/10 rounded-full blur-[120px] pointer-events-none -z-10 animate-stitch-float" />
            <div className="fixed top-[20%] right-[10%] w-[30%] h-[30%] bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none -z-10" />

            <Header
                title="Zeka Paneli"
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                viewMode={viewMode}
                setViewMode={setViewMode}
            />

            <div className="px-4 lg:px-6 pt-4">
                <OpportunityHub />
            </div>

            <div className="px-4 lg:px-6 py-4">
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 stagger">
                    <StatCard icon={Users} iconColor="text-cyan-600 dark:text-cyan-400" bgColor="bg-cyan-500/10" value={stats.total} label="Yetenek Havuzu"
                        isActive={statFilter === '__total__'}
                        onClick={() => setStatFilter(statFilter === '__total__' ? null : '__total__')} />
                    <StatCard icon={UserPlus} iconColor="text-violet-600 dark:text-violet-400" bgColor="bg-violet-500/10" value={(stats.byStatus?.ai_analysis || 0) + (stats.byStatus?.review || 0)} label="Yeni Gelenler"
                        isActive={statFilter === '__new__'}
                        onClick={() => setStatFilter(statFilter === '__new__' ? null : '__new__')} />
                    <StatCard icon={MessageSquare} iconColor="text-blue-600 dark:text-blue-400" bgColor="bg-blue-500/10" value={stats.byStatus?.interview || 0} label="Mülakatlar"
                        isActive={statFilter === 'interview'}
                        onClick={() => setStatFilter(statFilter === 'interview' ? null : 'interview')} />
                    <StatCard icon={CheckCircle} iconColor="text-emerald-600 dark:text-emerald-400" bgColor="bg-emerald-500/10" value={stats.byStatus?.hired || 0} label="İşe Alınanlar"
                        isActive={statFilter === 'hired'}
                        onClick={() => setStatFilter(statFilter === 'hired' ? null : 'hired')} />
                    <StatCard icon={Send} iconColor="text-cyan-600 dark:text-cyan-400" bgColor="bg-cyan-500/10" value={stats.byStatus?.offer || 0} label="Teklifler"
                        isActive={statFilter === 'offer'}
                        onClick={() => setStatFilter(statFilter === 'offer' ? null : 'offer')} />
                    <StatCard icon={XCircle} iconColor="text-red-600 dark:text-red-400" bgColor="bg-red-500/10" value={stats.byStatus?.rejected || 0} label="Reddedilenler"
                        isActive={statFilter === 'rejected'}
                        onClick={() => setStatFilter(statFilter === 'rejected' ? null : 'rejected')} />
                </div>
            </div>

            <div className="px-4 lg:px-6 pb-4 relative z-10">
                <div className="stitch-glass rounded-[24px] p-3 border border-border-subtle shadow-2xl flex flex-col xl:flex-row items-center justify-between gap-4 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-[80px] -z-10 pointer-events-none" />

                    <div className="flex items-center gap-3 flex-wrap justify-center xl:justify-start">
                        {/* Department Filter */}
                        <div className="flex items-center gap-2 bg-bg-secondary p-1.5 rounded-2xl border border-border-subtle group hover:border-cyan-400/50 transition-all shadow-sm">
                            <div className="p-2 bg-cyan-500/10 rounded-xl">
                                <Filter className="w-4 h-4 text-cyan-500" />
                            </div>
                            <select
                                value={departmentFilter}
                                onChange={(e) => setDepartmentFilter(e.target.value)}
                                className="bg-transparent border-none text-[12px] font-black text-text-primary outline-none cursor-pointer pr-4 uppercase tracking-tighter"
                            >
                                {departments.map((d) => (
                                    <option key={d} value={d} className="bg-bg-secondary text-text-primary">{d === 'all' ? 'Departmanlar' : d}</option>
                                ))}
                            </select>
                        </div>

                        {/* Position Filter */}
                        <div className="flex items-center gap-2 bg-bg-secondary p-1.5 rounded-2xl border border-border-subtle group hover:border-electric/20 transition-all shadow-sm">
                            <div className="p-2 bg-violet-500/10 rounded-xl">
                                <Briefcase className="w-4 h-4 text-violet-400" />
                            </div>
                            <select
                                value={positionFilter}
                                onChange={(e) => setPositionFilter(e.target.value)}
                                className="bg-transparent border-none text-[12px] font-black text-text-primary outline-none cursor-pointer pr-4 uppercase tracking-tighter"
                            >
                                {matchPositions.map((p) => (
                                    <option key={p} value={p} className="bg-bg-secondary text-text-primary">{p === 'all' ? 'Pozisyonlar' : p}</option>
                                ))}
                            </select>
                        </div>

                        {/* Status Filter */}
                        <div className="flex items-center gap-2 bg-bg-secondary p-1.5 rounded-2xl border border-border-subtle group hover:border-emerald-400/50 transition-all shadow-sm">
                            <div className="p-2 bg-emerald-500/10 rounded-xl">
                                <Tag className="w-4 h-4 text-emerald-400" />
                            </div>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="bg-transparent border-none text-[12px] font-black text-text-primary outline-none cursor-pointer pr-4 uppercase tracking-tighter"
                            >
                                {STATUS_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value} className="bg-bg-secondary text-text-primary">{o.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Experience Filter */}
                        <div className="flex items-center gap-2 bg-bg-secondary p-1.5 rounded-2xl border border-border-subtle group hover:border-amber-400/50 transition-all shadow-sm">
                            <div className="p-2 bg-amber-500/10 rounded-xl">
                                <Clock className="w-4 h-4 text-amber-400" />
                            </div>
                            <select
                                value={experienceFilter}
                                onChange={(e) => setExperienceFilter(e.target.value)}
                                className="bg-transparent border-none text-[12px] font-black text-text-primary outline-none cursor-pointer pr-4 uppercase tracking-tighter"
                            >
                                {EXPERIENCE_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value} className="bg-bg-secondary text-text-primary">{o.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Source Filter */}
                        <div className="flex items-center gap-2 bg-bg-secondary p-1.5 rounded-2xl border border-border-subtle group hover:border-cyan-400/50 transition-all shadow-sm">
                            <div className="p-2 bg-cyan-500/10 rounded-xl">
                                <Share2 className="w-4 h-4 text-cyan-400" />
                            </div>
                            <select
                                value={sourceFilter}
                                onChange={(e) => setSourceFilter(e.target.value)}
                                className="bg-transparent border-none text-[12px] font-black text-text-primary outline-none cursor-pointer pr-4 uppercase tracking-tighter"
                            >
                                {sourcesOptions.map((s) => (
                                    <option key={s} value={s} className="bg-bg-secondary text-text-primary">{s === 'all' ? 'Kaynaklar' : s}</option>
                                ))}
                            </select>
                        </div>

                        {/* Sub-Source Filter */}
                        {subSourcesOptions.length > 1 && (
                            <div className="flex items-center gap-2 bg-bg-secondary p-1.5 rounded-2xl border border-border-subtle group hover:border-rose-400/50 transition-all shadow-sm animate-in fade-in slide-in-from-left-2 duration-300">
                                <div className="p-2 bg-rose-500/10 rounded-xl">
                                    <Layers className="w-4 h-4 text-rose-400" />
                                </div>
                                <select
                                    value={subSourceFilter}
                                    onChange={(e) => setSubSourceFilter(e.target.value)}
                                    className="bg-transparent border-none text-[12px] font-black text-text-primary outline-none cursor-pointer pr-4 uppercase tracking-tighter"
                                >
                                    {subSourcesOptions.map((s) => (
                                        <option key={s} value={s} className="bg-bg-secondary text-text-primary">{s === 'all' ? 'Detaylar' : s}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-4 w-full xl:w-auto justify-center xl:justify-end">
                        {selectedIds.size > 0 ? (
                            <div className="flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-500">
                                <div className="px-5 py-2.5 bg-electric/10 rounded-2xl border border-electric/30 text-[13px] font-black text-text-primary shadow-sm">
                                    {selectedIds.size} SEÇİLİ
                                </div>
                                <button
                                    onClick={handleBulkAnalyze}
                                    className="stitch-button px-6 py-3 rounded-2xl bg-electric text-white text-[13px] font-black uppercase tracking-widest shadow-xl shadow-electric/20 hover:scale-105 transition-all"
                                >
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    ANALİZ ET
                                </button>
                                <button
                                    onClick={handleBulkDelete}
                                    className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                >
                                    <XCircle className="w-5 h-5" />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setIsAddModalOpen(true)}
                                className="stitch-button px-8 py-4 rounded-[20px] bg-electric text-white text-[14px] font-black uppercase tracking-[0.15em] shadow-lg shadow-electric/30 flex items-center gap-3 hover:-translate-y-1 transition-all"
                            >
                                <Plus className="w-5 h-5" />
                                <span>ADAY EKLE</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="px-4 lg:px-6 pb-8">
                {statFilter && (
                    <div className="flex items-center gap-4 mb-8 px-6 py-4 rounded-[24px] bg-electric/5 border border-border-subtle text-electric animate-in fade-in slide-in-from-left-4 duration-500 shadow-sm">
                        <div className="w-10 h-10 rounded-xl bg-electric/10 flex items-center justify-center shadow-inner">
                            <Filter className="w-5 h-5 text-electric" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-text-muted opacity-60">Durum Filtresi Aktif</p>
                            <p className="text-sm font-black text-text-primary uppercase tracking-tight">GÖSTERİLEN: {statFilter === '__total__' ? 'Tüm Havuz' : statFilter === '__new__' ? 'Yeni Gelenler' : statFilter.toUpperCase()}</p>
                        </div>
                        <button onClick={() => setStatFilter(null)} className="ml-auto w-10 h-10 rounded-xl hover:bg-navy-800/40 flex items-center justify-center transition-all border border-transparent hover:border-border-subtle">
                            <XCircle className="w-5 h-5" />
                        </button>
                    </div>
                )}

                {loading && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 stagger">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="stitch-card p-6 h-64 opacity-50">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="skeleton w-14 h-14 rounded-2xl" />
                                    <div className="flex-1 space-y-3">
                                        <div className="skeleton h-5 w-3/4 rounded-lg" />
                                        <div className="skeleton h-3 w-1/2 rounded-md" />
                                    </div>
                                </div>
                                <div className="skeleton h-4 w-full rounded-md mb-3" />
                                <div className="skeleton h-4 w-4/5 rounded-md" />
                            </div>
                        ))}
                    </div>
                )}

                {!loading && sortedCandidates.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-32 text-center stitch-glass rounded-[40px] border-dashed border-2 border-border-subtle group shadow-xl">
                        <div className="w-24 h-24 rounded-[32px] bg-navy-800/40 border border-border-subtle flex items-center justify-center mb-8 shadow-inner group-hover:scale-110 transition-transform duration-700">
                            <Users className="w-10 h-10 text-text-muted group-hover:text-electric transition-colors" />
                        </div>
                        <h3 className="text-2xl font-black text-text-primary italic uppercase tracking-tighter mb-2">Veri Bulunamadı</h3>
                        <p className="text-sm text-text-muted max-w-sm font-medium mb-8">Sinyal kaybı. Filtreleri değiştirerek adayları kurtarın.</p>
                        <button
                            onClick={() => {
                                setSearchQuery('');
                                setDepartmentFilter('all');
                                setPositionFilter('all');
                                setStatusFilter('all');
                                setExperienceFilter('all');
                                setSourceFilter('all');
                                setSubSourceFilter('all');
                                setStatFilter(null);
                            }}
                            className="px-6 py-2.5 rounded-xl border border-border-subtle text-xs font-black uppercase tracking-widest hover:bg-navy-800/20 transition-all font-bold"
                        >
                            Filtreleri Sıfırla
                        </button>
                    </div>
                )}

                {!loading && sortedCandidates.length > 0 && viewMode === 'card' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 stagger">
                        {sortedCandidates.map((candidate, index) => (
                            <CandidateCard
                                key={candidate.id}
                                candidate={candidate}
                                index={index}
                                isSelected={selectedIds.has(candidate.id)}
                                onSelect={() => handleSelect(candidate.id)}
                                onClick={setSelectedCandidate}
                                draggable={true}
                                onDragStart={(e) => {
                                    e.dataTransfer.setData('candidateId', candidate.id);
                                    e.dataTransfer.effectAllowed = 'move';
                                }}
                            />
                        ))}
                    </div>
                )}

                {!loading && sortedCandidates.length > 0 && viewMode === 'kanban' && (
                    <div className="flex gap-6 overflow-x-auto pb-8 custom-scrollbar min-h-[700px] snap-x max-w-full">
                        {STATUS_OPTIONS.filter(opt => opt.value !== 'all').map((status, idx) => {
                            const columnCandidates = sortedCandidates.filter(c => c.status === status.value);
                            return (
                                <div
                                    key={status.value}
                                    className="min-w-[320px] w-80 flex-shrink-0 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 snap-center"
                                    style={{ animationDelay: `${idx * 100}ms` }}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.currentTarget.classList.add('bg-electric/5');
                                    }}
                                    onDragLeave={(e) => {
                                        e.currentTarget.classList.remove('bg-electric/5');
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        e.currentTarget.classList.remove('bg-electric/5');
                                        const candidateId = e.dataTransfer.getData('candidateId');
                                        if (candidateId) {
                                            updateCandidate(candidateId, { status: status.value });
                                        }
                                    }}
                                >
                                    <div className="flex items-center justify-between px-4 py-3 bg-bg-secondary border border-border-subtle rounded-2xl shadow-sm">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
                                            <h3 className="text-[11px] font-black text-text-primary uppercase tracking-widest">{status.label}</h3>
                                        </div>
                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-bg-primary border border-border-subtle text-text-muted">
                                            {columnCandidates.length}
                                        </span>
                                    </div>
                                    <div className="flex-1 flex flex-col gap-4 p-2 rounded-[2rem] bg-bg-primary/20 border border-border-subtle/50 shadow-inner">
                                        {columnCandidates.map((candidate, cIdx) => (
                                            <div key={candidate.id} className="scale-95 hover:scale-[0.98] transition-transform origin-top">
                                                <CandidateCard
                                                    candidate={candidate}
                                                    index={cIdx}
                                                    isSelected={selectedIds.has(candidate.id)}
                                                    onSelect={() => handleSelect(candidate.id)}
                                                    onClick={setSelectedCandidate}
                                                    draggable={true}
                                                    onDragStart={(e) => {
                                                        e.dataTransfer.setData('candidateId', candidate.id);
                                                        e.dataTransfer.effectAllowed = 'move';
                                                    }}
                                                />
                                            </div>
                                        ))}
                                        {columnCandidates.length === 0 && (
                                            <div className="flex flex-col items-center justify-center py-20 opacity-20 sepia grayscale group-hover:opacity-40 transition-opacity">
                                                <Sparkles className="w-8 h-8 text-text-muted mb-2" />
                                                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Aday Yok</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {!loading && sortedCandidates.length > 0 && viewMode === 'list' && (
                    <div className="stitch-glass rounded-[2rem] border border-border-subtle overflow-hidden shadow-2xl animate-in fade-in duration-500">
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-bg-secondary/80 border-b border-border-subtle">
                                    <tr>
                                        <th className="px-6 py-4 w-12">
                                            <div
                                                onClick={handleSelectAll}
                                                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer ${selectedIds.size === sortedCandidates.length && sortedCandidates.length > 0
                                                    ? 'bg-cyan-500 border-cyan-500 text-white'
                                                    : 'bg-bg-primary border-border-subtle hover:border-cyan-500'
                                                    }`}
                                            >
                                                {selectedIds.size === sortedCandidates.length && sortedCandidates.length > 0 && <CheckCircle className="w-3.5 h-3.5 fill-current" />}
                                            </div>
                                        </th>
                                        <th className="px-6 py-4 text-[10px] font-black text-text-muted uppercase tracking-widest">Aday</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-text-muted uppercase tracking-widest">Pozisyon</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-text-muted uppercase tracking-widest text-center">Uyum</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-text-muted uppercase tracking-widest">Durum</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-text-muted uppercase tracking-widest text-right">Aksiyonlar</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-subtle/30 bg-bg-primary/10">
                                    {sortedCandidates.map((candidate, index) => (
                                        <tr
                                            key={candidate.id}
                                            className={`group hover:bg-bg-secondary/40 transition-colors ${selectedIds.has(candidate.id) ? 'bg-cyan-500/5' : ''}`}
                                        >
                                            <td className="px-6 py-4">
                                                <div
                                                    onClick={() => handleSelect(candidate.id)}
                                                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer ${selectedIds.has(candidate.id)
                                                        ? 'bg-cyan-500 border-cyan-500 text-white'
                                                        : 'bg-bg-primary border-border-subtle hover:border-cyan-500'
                                                        }`}
                                                >
                                                    {selectedIds.has(candidate.id) && <Plus className="w-3.5 h-3.5 fill-current rotate-45" />}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3 cursor-pointer" onClick={() => setSelectedCandidate(candidate)}>
                                                    <div className="w-10 h-10 rounded-xl bg-bg-secondary flex items-center justify-center text-xs font-black text-text-primary border border-border-subtle shadow-sm group-hover:scale-110 transition-transform">
                                                        {candidate.name?.[0]?.toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-text-primary group-hover:text-cyan-500 transition-colors uppercase tracking-tight">{candidate.name}</p>
                                                        <p className="text-[10px] font-bold text-text-muted opacity-60 uppercase">{candidate.location || 'Konum Belirtilmedi'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-black text-text-secondary uppercase tracking-tighter">{candidate.position}</span>
                                                    <span className="text-[9px] font-bold text-text-muted opacity-50 uppercase">{candidate.company || 'Şirket Yok'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex justify-center">
                                                    <div className={`px-2 py-1 rounded-lg text-[11px] font-black border ${candidate.combinedScore >= 80 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20'}`}>
                                                        %{Math.round(candidate.combinedScore || 0)}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border bg-bg-secondary border-border-subtle text-text-primary flex items-center gap-1.5 w-fit`}>
                                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                                                    {candidate.status?.replace('_', ' ').toUpperCase() || 'YENİ'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => setSelectedCandidate(candidate)}
                                                    className="p-2 rounded-xl bg-bg-secondary border border-border-subtle text-text-muted hover:text-cyan-500 hover:border-cyan-500/50 transition-all shadow-sm group-hover:scale-105"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {selectedCandidate && (
                <CandidateDrawer
                    candidate={selectedCandidate}
                    onClose={() => setSelectedCandidate(null)}
                />
            )}

            <AddCandidateModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
            />

            <BulkUpdateModal
                isOpen={isBulkUpdateOpen}
                onClose={() => setIsBulkUpdateOpen(false)}
                type={bulkUpdateType}
                selectedIds={selectedIds}
                onUpdate={handleBulkUpdate}
            />

            {isAnalyzing && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-navy-950 glass rounded-3xl w-full max-w-lg shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col relative mx-auto my-auto border border-border-subtle">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-electric/20 rounded-full blur-[80px] -z-10 pointer-events-none" />
                        <div className="p-8 flex flex-col items-center justify-center min-h-[360px] relative">
                            {analyzeProgress < 100 && analyzeCurrentCandidate ? (
                                <div className="flex flex-col items-center animate-in zoom-in-95 duration-500 w-full">
                                    <div className="w-24 h-24 rounded-[2.5rem] bg-navy-800/80 border border-border-subtle flex items-center justify-center mb-6 relative shadow-2xl backdrop-blur-sm shadow-black/20">
                                        <span className="text-3xl font-black text-text-primary uppercase">{analyzeCurrentCandidate.name?.[0]}</span>
                                        <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-navy-950 border border-border-subtle flex items-center justify-center shadow-xl">
                                            {analyzeCurrentStage === 'scout' && <Eye className="w-5 h-5 text-blue-500 animate-pulse" />}
                                            {analyzeCurrentStage === 'analyst' && <Brain className="w-5 h-5 text-purple-500 animate-pulse" />}
                                            {analyzeCurrentStage === 'recruiter' && <Database className="w-5 h-5 text-emerald-500 animate-pulse" />}
                                        </div>
                                    </div>
                                    <h3 className="text-2xl font-black text-text-primary mb-3 tracking-tight uppercase italic">{analyzeCurrentCandidate.name}</h3>
                                    <div className="flex flex-col items-center w-full">
                                        <div className={`flex items-center gap-3 px-6 py-3 rounded-xl border self-center shadow-lg transition-all duration-500
                                                ${analyzeCurrentStage === 'scout' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                                                analyzeCurrentStage === 'analyst' ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' :
                                                    'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}
                                            `}>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            <span className="text-sm font-bold uppercase tracking-wider">
                                                {analyzeCurrentStage === 'scout' && 'İstihbarat Taranıyor...'}
                                                {analyzeCurrentStage === 'analyst' && `Çapraz Analiz (${analyzePosCurrent}/${analyzePosTotal})`}
                                                {analyzeCurrentStage === 'recruiter' && 'Sonuçlar Kaydediliyor...'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center animate-in zoom-in-95 duration-700">
                                    <div className="w-24 h-24 rounded-[2.5rem] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-emerald-500/10">
                                        <CheckCircle className="w-12 h-12 text-emerald-500" />
                                    </div>
                                    <h3 className="text-3xl font-black text-text-primary mb-3 tracking-tight uppercase italic">GÖREV TAMAMLANDI</h3>
                                    <p className="text-text-muted mb-8 max-w-sm text-sm leading-relaxed font-medium">{analyzeTotal} aday için zeka analizi başarıyla tamamlandı.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Floating Comparison Bar */}
            {compareIds.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-10 duration-500">
                    <div className="bg-bg-secondary/90 backdrop-blur-xl border border-violet-500/30 rounded-[2rem] p-3 pl-6 flex items-center gap-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] ring-1 ring-white/5">
                        <div className="flex items-center gap-3 border-r border-border-subtle pr-6">
                            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
                                <Columns3 className="w-5 h-5 text-violet-400" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase text-text-muted opacity-60">Karşılaştırma</p>
                                <p className="text-sm font-black text-text-primary uppercase tracking-tight">{compareIds.length} Aday Seçildi</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={clearCompareSelection}
                                className="px-4 py-2 text-[10px] font-black text-text-muted hover:text-red-400 transition-colors uppercase tracking-widest"
                            >
                                Sıfırla
                            </button>
                            <button
                                onClick={() => setIsCompareModalOpen(true)}
                                disabled={compareIds.length < 2}
                                className={`px-8 py-3 rounded-2xl font-black text-[13px] uppercase tracking-[0.1em] transition-all shadow-lg flex items-center gap-2 ${compareIds.length < 2
                                    ? 'bg-bg-primary text-text-muted opacity-50 cursor-not-allowed'
                                    : 'bg-violet-600 text-white hover:bg-violet-500 shadow-violet-500/20 hover:scale-105'
                                    }`}
                            >
                                <span>Şimdi Karşılaştır</span>
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <CandidateComparisonModal
                isOpen={isCompareModalOpen}
                onClose={() => setIsCompareModalOpen(false)}
            />
        </div>
    );
}
