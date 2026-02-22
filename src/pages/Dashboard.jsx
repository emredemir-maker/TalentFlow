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
    Database
} from 'lucide-react';
import { createPortal } from 'react-dom';

const STATUS_OPTIONS = [
    { value: 'all', label: 'Tüm Durumlar' },
    { value: 'ai_analysis', label: 'AI Analiz' },
    { value: 'review', label: 'İlk İnceleme' },
    { value: 'interview', label: 'Mülakat Değerlendirme' },
    { value: 'deep_review', label: 'Detaylı İnceleme' },
    { value: 'offer', label: 'Teklif' },
    { value: 'hired', label: 'Onaylandı' },
    { value: 'rejected', label: 'Reddedildi' },
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

    // Bulk analysis state
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analyzeProgress, setAnalyzeProgress] = useState(0);
    const [analyzeTotal, setAnalyzeTotal] = useState(0);
    const [analyzeCurrentCandidate, setAnalyzeCurrentCandidate] = useState(null);
    const [analyzeCurrentStage, setAnalyzeCurrentStage] = useState(null);
    const [analyzePosCurrent, setAnalyzePosCurrent] = useState(0);
    const [analyzePosTotal, setAnalyzePosTotal] = useState(0);

    // Sort by match score descending (client-side, Rule 2)
    const sortedCandidates = useMemo(() => {
        return [...filteredCandidates].sort((a, b) => (b.bestScore || 0) - (a.bestScore || 0));
    }, [filteredCandidates]);

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
                <h2 className="text-lg font-bold text-navy-200">Bağlantı Hatası</h2>
                <p className="text-sm text-navy-400 max-w-sm">
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
                    <StatCard icon={Users} iconColor="text-electric-light" bgColor="bg-electric/10" value={stats.total} label="Toplam Aday" />
                    <StatCard icon={UserPlus} iconColor="text-violet-400" bgColor="bg-violet-500/10" value={stats.byStatus?.new || 0} label="Yeni Başvuru" trend={12} />
                    <StatCard icon={MessageSquare} iconColor="text-blue-400" bgColor="bg-blue-500/10" value={stats.byStatus?.interview || 0} label="Mülakat" />
                    <StatCard icon={CheckCircle} iconColor="text-emerald-400" bgColor="bg-emerald-500/10" value={stats.byStatus?.hired || 0} label="İşe Alınan" />
                    <StatCard icon={Send} iconColor="text-cyan-400" bgColor="bg-cyan-500/10" value={stats.byStatus?.offer || 0} label="Teklif" />
                    <StatCard icon={XCircle} iconColor="text-red-400" bgColor="bg-red-500/10" value={stats.byStatus?.rejected || 0} label="Reddedilen" />
                </div>
            </div>

            {/* ===== TOOLBAR ===== */}
            <div className="px-6 lg:px-8 pb-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    {/* Left: Selection + Filters */}
                    <div className="flex items-center gap-4 flex-wrap">
                        {/* Select All Checkbox */}
                        <div
                            onClick={handleSelectAll}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition-all cursor-pointer group"
                        >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${selectedIds.size === sortedCandidates.length && sortedCandidates.length > 0
                                ? 'bg-electric border-electric text-white'
                                : 'bg-white/10 border-white/20'}`}>
                                {selectedIds.size === sortedCandidates.length && sortedCandidates.length > 0 && (
                                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                )}
                            </div>
                            <span className="text-[12px] font-bold text-navy-300 group-hover:text-white transition-colors">Tümünü Seç</span>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 text-navy-500 mr-1">
                                <Filter className="w-4 h-4" />
                                <span className="text-[12px] font-semibold uppercase tracking-wider hidden sm:inline">Filtreler</span>
                            </div>

                            <select
                                value={departmentFilter}
                                onChange={(e) => setDepartmentFilter(e.target.value)}
                                className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[12px] text-navy-300 outline-none focus:border-electric/40 transition-all cursor-pointer appearance-none pr-7 bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_6px_center]"
                                id="department-filter"
                            >
                                {departments.map((d) => (
                                    <option key={d} value={d}>{d === 'all' ? 'Tüm Departmanlar' : d}</option>
                                ))}
                            </select>

                            <select
                                value={positionFilter}
                                onChange={(e) => setPositionFilter(e.target.value)}
                                className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[12px] text-navy-300 outline-none focus:border-electric/40 transition-all cursor-pointer appearance-none pr-7 bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_6px_center]"
                                id="position-filter"
                            >
                                {matchPositions.map((p) => (
                                    <option key={p} value={p}>{p === 'all' ? 'Tüm Pozisyonlar' : p}</option>
                                ))}
                            </select>

                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[12px] text-navy-300 outline-none focus:border-electric/40 transition-all cursor-pointer appearance-none pr-7 bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_6px_center]"
                                id="status-filter"
                            >
                                {STATUS_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>

                            <select
                                value={experienceFilter}
                                onChange={(e) => setExperienceFilter(e.target.value)}
                                className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[12px] text-navy-300 outline-none focus:border-electric/40 transition-all cursor-pointer appearance-none pr-7 bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_6px_center]"
                                id="experience-filter"
                            >
                                {EXPERIENCE_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Right: Actions/Count */}
                    <div className="flex items-center gap-4">
                        {selectedIds.size > 0 ? (
                            <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-300">
                                <span className="text-sm font-medium text-navy-200">
                                    {selectedIds.size} seçildi
                                </span>
                                <button
                                    onClick={handleBulkAnalyze}
                                    disabled={isAnalyzing || isDeleting}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-electric/10 hover:bg-electric/20 text-electric-light text-[13px] font-bold border border-electric/20 transition-all"
                                >
                                    {isAnalyzing ? 'Analiz Ediliyor...' : 'Detaylı Determinik Skorla'}
                                </button>
                                <button
                                    onClick={handleBulkDelete}
                                    disabled={isDeleting || isAnalyzing}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[13px] font-bold border border-red-500/20 transition-all"
                                >
                                    {isDeleting ? 'Siliniyor...' : 'Seçilenleri Sil'}
                                </button>
                                <button
                                    onClick={() => setSelectedIds(new Set())}
                                    className="p-2 rounded-lg hover:bg-white/5 text-navy-400 hover:text-white transition-colors"
                                    title="Seçimi Temizle"
                                >
                                    <XCircle className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <>
                                <button
                                    onClick={() => setIsAddModalOpen(true)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-electric/10 hover:bg-electric/20 text-electric-light text-[13px] font-bold border border-electric/20 transition-all cursor-pointer whitespace-nowrap"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span>Aday Ekle</span>
                                </button>

                                <div className="hidden lg:flex items-center gap-1.5 text-[12px] text-navy-500">
                                    <ArrowDownWideNarrow className="w-3.5 h-3.5" />
                                    <span>Match Score sırası</span>
                                </div>
                                <span className="text-[12px] text-navy-500 font-medium whitespace-nowrap">
                                    {sortedCandidates.length} / {stats.total} aday
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* Mobile search */}
                <div className="sm:hidden mt-3 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-500 pointer-events-none" />
                    <input
                        type="text"
                        placeholder="Ara..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-navy-200 placeholder:text-navy-500 outline-none focus:border-electric/40 transition-all"
                    />
                </div>
            </div>

            {/* ===== CANDIDATES GRID ===== */}
            <div className="px-6 lg:px-8 pb-8 md:pb-8 pb-24">
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
                    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                        <div className="w-20 h-20 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                            <Users className="w-8 h-8 text-navy-500" style={{ animation: 'float-subtle 3s ease-in-out infinite' }} />
                        </div>
                        <h3 className="text-lg font-bold text-navy-300">
                            {searchQuery || departmentFilter !== 'all' || statusFilter !== 'all'
                                ? 'Sonuç Bulunamadı'
                                : 'Henüz Aday Yok'}
                        </h3>
                        <p className="text-sm text-navy-500 max-w-sm">
                            {searchQuery || departmentFilter !== 'all' || statusFilter !== 'all'
                                ? 'Filtreleri değiştirerek tekrar deneyin.'
                                : 'Aday havuzunuz boş. Yeni bir aday ekleyerek başlayabilirsiniz.'}
                        </p>
                    </div>
                )}

                {/* Grid */}
                {!loading && sortedCandidates.length > 0 && (
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
                    <div className="bg-navy-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col relative mx-auto my-auto">
                        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-navy-800/50">
                            <div>
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
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
                                            <CheckCircle className="w-5 h-5 text-emerald-400" />
                                            Analiz Tamamlandı
                                        </>
                                    )}
                                </h2>
                                <p className="text-xs text-navy-400 mt-1">
                                    {analyzeProgress < 100 ? 'Yapay zeka tüm pozisyonlar için 0 sapma ile kesin skoru hesaplıyor.' : 'Aday skorları başarıyla güncellendi.'}
                                </p>
                            </div>
                        </div>

                        <div className="h-1 bg-navy-950 w-full">
                            <div
                                className="h-full bg-gradient-to-r from-electric to-emerald-400 transition-all duration-300 ease-out"
                                style={{ width: `${analyzeProgress}%` }}
                            />
                        </div>

                        <div className="p-8 flex flex-col items-center justify-center min-h-[250px] relative">
                            {analyzeProgress < 100 && analyzeCurrentCandidate ? (
                                <div className="flex flex-col items-center animate-in zoom-in-95 duration-300">
                                    <div className="w-20 h-20 rounded-full bg-navy-800 border-4 border-navy-700 flex items-center justify-center mb-4 relative">
                                        <span className="text-2xl font-bold text-white">{analyzeCurrentCandidate.name?.[0]}</span>
                                        <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-navy-900 border border-white/10 flex items-center justify-center shadow-lg">
                                            {analyzeCurrentStage === 'scout' && <Eye className="w-4 h-4 text-blue-400 animate-pulse" />}
                                            {analyzeCurrentStage === 'analyst' && <Brain className="w-4 h-4 text-purple-400 animate-pulse" />}
                                            {analyzeCurrentStage === 'recruiter' && <Database className="w-4 h-4 text-emerald-400 animate-pulse" />}
                                        </div>
                                    </div>

                                    <h3 className="text-xl font-bold text-white mb-1">{analyzeCurrentCandidate.name}</h3>
                                    <p className="text-sm text-navy-400 mb-6 text-center">
                                        Mevcut Pozisyon: {analyzeCurrentCandidate.position || '-'}
                                    </p>

                                    <div className="flex flex-col items-center gap-3 w-full">
                                        <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10 self-center">
                                            <Loader2 className="w-4 h-4 animate-spin text-electric" />
                                            <span className="text-sm font-medium text-electric-light uppercase tracking-wide">
                                                {analyzeCurrentStage === 'scout' && 'Aday Özgeçmişi Taranıyor...'}
                                                {analyzeCurrentStage === 'analyst' && `Pozisyon Analizi (${analyzePosCurrent}/${analyzePosTotal})`}
                                                {analyzeCurrentStage === 'recruiter' && 'Sonuçlar Kaydediliyor...'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center animate-in fade-in slide-in-from-bottom-4">
                                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                                        <CheckCircle className="w-8 h-8 text-emerald-400" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-white mb-2">İşlem Tamamlandı</h3>
                                    <p className="text-navy-400 mb-8 max-w-sm">
                                        {analyzeTotal} adayın detaylı skorlama analizi başarıyla tamamlandı.
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
