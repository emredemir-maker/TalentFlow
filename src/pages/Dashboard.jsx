// src/pages/Dashboard.jsx
// Premium dashboard with stats, filters, match-score-sorted grid, and drawer

import { useState, useCallback, useMemo } from 'react';
import { useCandidates } from '../context/CandidatesContext';
import Header from '../components/Header';
import StatCard from '../components/StatCard';
import CandidateCard from '../components/CandidateCard';
import CandidateDrawer from '../components/CandidateDrawer';
import AddCandidateModal from '../components/AddCandidateModal';
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
} from 'lucide-react';

const STATUS_OPTIONS = [
    { value: 'all', label: 'Tüm Durumlar' },
    { value: 'new', label: 'Yeni' },
    { value: 'review', label: 'İnceleme' },
    { value: 'interview', label: 'Mülakat' },
    { value: 'offer', label: 'Teklif' },
    { value: 'hired', label: 'İşe Alındı' },
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
        deleteCandidate, // Added deleteCandidate
    } = useCandidates();

    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [isDeleting, setIsDeleting] = useState(false);

    // Sort by match score descending (client-side, Rule 2)
    const sortedCandidates = useMemo(() => {
        return [...filteredCandidates].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    }, [filteredCandidates]);

    const handleSelectAll = () => {
        if (selectedIds.size === sortedCandidates.length) {
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
                    {/* Filters */}
                    <div className="flex items-center gap-2 flex-wrap">
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

                    {/* Count + Sort indicator + Bulk Actions */}
                    <div className="flex items-center gap-4">
                        {selectedIds.size > 0 ? (
                            <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-300">
                                <span className="text-sm font-medium text-navy-200">
                                    {selectedIds.size} seçildi
                                </span>
                                <button
                                    onClick={handleBulkDelete}
                                    disabled={isDeleting}
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
                                <span className="text-[12px] text-navy-500 font-medium">
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
        </>
    );
}
