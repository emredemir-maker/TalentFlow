// Aday Raporu — filterable, sortable table view over the candidate pool
// with Excel (.xlsx) export of the filtered result set.
//
// Complements CandidateProcessPage (card/kanban oriented) with a dense,
// report-style grid. Filtering/sorting/export-row logic lives in
// utils/candidateTable.js so it stays unit-testable; this component only
// owns filter state and rendering. The xlsx library is imported lazily on
// the first export click so it never enters the initial bundle.
import { useMemo, useState } from 'react';
import {
    Search, Download, Users, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
    FilterX, Table2, Wrench, CheckSquare, Square, Layers, X, Loader2, AlertCircle, CheckCircle2,
} from 'lucide-react';
import MaintenancePanel from '../components/MaintenancePanel';
import { useAuth } from '../context/AuthContext';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import { calculateMatchScore } from '../services/matchService';
import { STAGES, getStage } from '../utils/pipelineStages';
import {
    DEFAULT_FILTERS, applyTableFilters, withCoherentScores, sortRows, buildExportRows,
    resolveStageKey, getAppliedDate,
} from '../utils/candidateTable';

const PAGE_SIZE = 50;

function StageChip({ status }) {
    const stage = getStage(resolveStageKey(status));
    return (
        <span
            style={{ color: stage.color, background: stage.bg, border: `1px solid ${stage.border}` }}
            className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
        >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: stage.color }} />
            {stage.label}
        </span>
    );
}

function ScoreCell({ value }) {
    if (value === null || value === undefined || value === '') {
        return <span className="text-slate-300">—</span>;
    }
    const color = value >= 75 ? '#059669' : value >= 50 ? '#D97706' : '#DC2626';
    return <span style={{ color }} className="font-black">%{value}</span>;
}

function SortableHeader({ label, sortKey, activeKey, dir, onSort, align = 'left' }) {
    const isActive = activeKey === sortKey;
    return (
        <th
            className={`px-3 py-2.5 text-${align} select-none cursor-pointer whitespace-nowrap hover:bg-slate-100 transition-colors`}
            onClick={() => onSort(sortKey)}
        >
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
                {label}
                {isActive && (dir === 'asc'
                    ? <ChevronUp className="w-3 h-3 text-slate-700" />
                    : <ChevronDown className="w-3 h-3 text-slate-700" />)}
            </span>
        </th>
    );
}

const SELECT_CLS = 'text-[12px] border border-slate-200 rounded-lg bg-white px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-100 text-slate-700';

// Toplu statü değişikliği modali — statü listesi tek kaynaktan (pipelineStages)
// gelir; CandidateProcessPage'deki tekil değişiklikle aynı damgaları basar.
function BulkStageModal({ isOpen, count, applying, onApply, onClose }) {
    const [stageKey, setStageKey] = useState('');
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={applying ? undefined : onClose} />
            <div className="relative w-full max-w-md bg-white rounded-2xl border border-slate-100 shadow-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#13294E] flex items-center justify-center">
                            <Layers className="w-4.5 h-4.5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-[14px] font-black text-slate-900">Toplu Statü Değişikliği</h3>
                            <p className="text-[10px] text-slate-400 font-bold">{count} aday seçildi</p>
                        </div>
                    </div>
                    <button onClick={onClose} disabled={applying} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {STAGES.map((s) => (
                        <button
                            key={s.key}
                            type="button"
                            onClick={() => setStageKey(s.key)}
                            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${stageKey === s.key
                                ? 'border-slate-400 bg-slate-50 shadow-sm'
                                : 'border-slate-100 hover:border-slate-200'}`}
                        >
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                            <span className={`text-[12px] font-bold ${stageKey === s.key ? 'text-slate-900' : 'text-slate-600'}`}>{s.label}</span>
                        </button>
                    ))}
                </div>
                <div className="mt-4 flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    Seçili {count} adayın statüsü topluca değiştirilecek.
                </div>
                <div className="mt-4 flex gap-2">
                    <button
                        onClick={onClose}
                        disabled={applying}
                        className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[12px] font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                        İptal
                    </button>
                    <button
                        onClick={() => stageKey && onApply(stageKey)}
                        disabled={!stageKey || applying}
                        className="flex-[2] py-2.5 rounded-xl bg-[#13294E] hover:bg-[#1E3A6E] text-white text-[12px] font-black disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                    >
                        {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {applying ? 'Uygulanıyor…' : 'Uygula'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function CandidatesTablePage() {
    const { role, user } = useAuth();
    const {
        enrichedCandidates, loading, setViewCandidateId, updateCandidate,
        departments, sourcesOptions,
    } = useCandidates();
    const { positions } = usePositions();
    // Pozisyon filtresi aday-türevli etiketlerden değil SİSTEMDEKİ açık
    // pozisyonlardan beslenir — filtre "bu açık pozisyona uygunluk" sorusunu
    // yanıtlar, adayın en iyi eşleştiği etiketi değil.
    const openPositions = useMemo(
        () => positions.filter((p) => p.status === 'open' && p.title),
        [positions]
    );
    // Bakım uçları backend'de super_admin/recruiter ile korunuyor; butonu
    // yetkisiz role gösterip 403 yedirmek yerine hiç göstermiyoruz.
    const canMaintain = role === 'super_admin' || role === 'recruiter';

    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [sortKey, setSortKey] = useState('appliedDate');
    const [sortDir, setSortDir] = useState('desc');
    const [page, setPage] = useState(0);
    const [exporting, setExporting] = useState(false);
    const [showMaintenance, setShowMaintenance] = useState(false);
    // Toplu seçim: filtre değişince temizlenir — görünmeyen adaylarda
    // "gizli" toplu güncelleme yapılmasın.
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [bulkModalOpen, setBulkModalOpen] = useState(false);
    const [bulkApplying, setBulkApplying] = useState(false);
    const [bulkResult, setBulkResult] = useState(null);

    const setFilter = (key, value) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setPage(0);
        setSelectedIds(new Set());
        // Pozisyon seçilince varsayılan sıralama o pozisyonun uyum skoru olur
        // ("işe alım için en uygun aday" akışı); seçim kalkınca eski varsayılana dön.
        if (key === 'position') {
            if (value !== 'all') {
                setSortKey('positionScore');
                setSortDir('desc');
            } else if (sortKey === 'positionScore') {
                setSortKey('appliedDate');
                setSortDir('desc');
            }
        }
    };
    const clearFilters = () => { setFilters(DEFAULT_FILTERS); setPage(0); setSelectedIds(new Set()); };
    const hasActiveFilters = useMemo(
        () => Object.keys(DEFAULT_FILTERS).some((k) => filters[k] !== DEFAULT_FILTERS[k]),
        [filters]
    );

    const handleSort = (key) => {
        if (key === sortKey) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir(key === 'name' || key === 'position' ? 'asc' : 'desc');
        }
        setPage(0);
    };

    const selectedPosition = useMemo(
        () => (filters.position !== 'all'
            ? openPositions.find((p) => p.title === filters.position) || null
            : null),
        [filters.position, openPositions]
    );
    // Tutarlılık: satırda gösterilen AI/Genel skorlar, satırda gösterilen
    // pozisyonun skorudur — başka bir pozisyon için hesaplanmış eski skor
    // başlığın yanında gösterilmez.
    const coherentRows = useMemo(
        () => withCoherentScores(enrichedCandidates, openPositions, (c, p) => calculateMatchScore(c, p).score),
        [enrichedCandidates, openPositions]
    );
    const filteredRows = useMemo(
        () => applyTableFilters(coherentRows, filters, {
            position: selectedPosition,
            keywordScoreFn: (c, p) => calculateMatchScore(c, p).score,
        }),
        [coherentRows, filters, selectedPosition]
    );
    const sortedRows = useMemo(
        () => sortRows(filteredRows, sortKey, sortDir),
        [filteredRows, sortKey, sortDir]
    );

    const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount - 1);
    const pageRows = sortedRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

    const openCandidate = (id) => {
        setViewCandidateId(id);
        window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }));
    };

    // ── Toplu seçim & statü değişikliği ───────────────────────────────────
    const allFilteredSelected = sortedRows.length > 0 && sortedRows.every((c) => selectedIds.has(c.id));
    const toggleRow = (id) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const toggleAllFiltered = () => {
        setSelectedIds(allFilteredSelected ? new Set() : new Set(sortedRows.map((c) => c.id)));
    };

    const handleBulkStage = async (stageKey) => {
        if (bulkApplying || selectedIds.size === 0) return;
        setBulkApplying(true);
        setBulkResult(null);
        try {
            // Tekil değişiklikle (CandidateProcessPage.handleStatusChange) aynı damgalar
            const now = new Date().toISOString();
            const by = user?.displayName || user?.email || 'HR';
            const update = { status: stageKey, statusChangedAt: now, statusChangedBy: by };
            if (stageKey === 'rejected') { update.rejectedAt = now; update.rejectedBy = by; }
            if (stageKey === 'hired') { update.hiredAt = now; update.hiredBy = by; }

            const ids = Array.from(selectedIds);
            const results = await Promise.allSettled(ids.map((id) => updateCandidate(id, update)));
            const failed = results.filter((r) => r.status === 'rejected').length;
            setBulkResult({
                ok: ids.length - failed,
                failed,
                stageLabel: getStage(stageKey).label,
            });
            setSelectedIds(new Set());
            setBulkModalOpen(false);
        } finally {
            setBulkApplying(false);
        }
    };

    const handleExport = async () => {
        if (exporting || sortedRows.length === 0) return;
        setExporting(true);
        try {
            const XLSX = await import('xlsx');
            const exportRows = buildExportRows(sortedRows);
            const ws = XLSX.utils.json_to_sheet(exportRows);
            // Column widths (chars) matching buildExportRows column order
            ws['!cols'] = [22, 28, 16, 22, 16, 12, 14, 14, 9, 13, 11, 12, 14, 20, 30, 12]
                .map((wch) => ({ wch }));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Adaylar');
            XLSX.writeFile(wb, `aday-raporu-${new Date().toISOString().slice(0, 10)}.xlsx`);
        } catch (err) {
            console.error('[CandidatesTablePage] Excel export error:', err);
            alert('Excel dışa aktarma başarısız oldu: ' + err.message);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#F8FAFC]">
            {/* ── Header ───────────────────────────────────────────────────── */}
            <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between gap-4 sticky top-0 z-20">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#13294E] flex items-center justify-center">
                        <Table2 className="w-4.5 h-4.5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900">Adaylar</h1>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                            {sortedRows.length === enrichedCandidates.length
                                ? `${enrichedCandidates.length} aday`
                                : `${sortedRows.length} / ${enrichedCandidates.length} aday (filtreli)`}
                            {selectedIds.size > 0 ? ` · ${selectedIds.size} seçili` : ''}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {canMaintain && (
                        <button
                            onClick={() => setShowMaintenance(v => !v)}
                            className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors ${showMaintenance ? 'text-white bg-[#13294E]' : 'text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200'}`}
                        >
                            <Wrench className="w-3.5 h-3.5" /> Bakım
                        </button>
                    )}
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }))}
                        className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                        title="Detay görünümü — CV yükleme, sistem taraması ve aday profilleri"
                    >
                        <Users className="w-3.5 h-3.5" /> Detay & Yükleme
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={exporting || sortedRows.length === 0}
                        className="flex items-center gap-1.5 text-[11px] font-black text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed px-3.5 py-1.5 rounded-lg transition-colors"
                    >
                        <Download className="w-3.5 h-3.5" />
                        {exporting ? 'Hazırlanıyor…' : "Excel'e Aktar"}
                    </button>
                </div>
            </div>

            {/* ── Maintenance panel (toggle) ───────────────────────────────── */}
            {canMaintain && showMaintenance && (
                <div className="px-6 pt-4">
                    <MaintenancePanel />
                </div>
            )}

            {/* ── Filter bar ───────────────────────────────────────────────── */}
            <div className="px-6 pt-4">
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="İsim, e-posta, yetenek ara..."
                            value={filters.search}
                            onChange={(e) => setFilter('search', e.target.value)}
                            className="pl-8 pr-3 py-1.5 text-[12px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 w-52"
                        />
                    </div>
                    <select value={filters.stage} onChange={(e) => setFilter('stage', e.target.value)} className={SELECT_CLS}>
                        <option value="all">Tüm Aşamalar</option>
                        {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                    <select value={filters.position} onChange={(e) => setFilter('position', e.target.value)} className={SELECT_CLS} title="Açık pozisyona uygunluk filtresi">
                        <option value="all">Tüm Pozisyonlar</option>
                        {openPositions.map((p) => <option key={p.id} value={p.title}>{p.title}</option>)}
                    </select>
                    <select value={filters.department} onChange={(e) => setFilter('department', e.target.value)} className={SELECT_CLS}>
                        <option value="all">Tüm Departmanlar</option>
                        {departments.filter((d) => d !== 'all').map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select value={filters.source} onChange={(e) => setFilter('source', e.target.value)} className={SELECT_CLS}>
                        <option value="all">Tüm Kaynaklar</option>
                        {sourcesOptions.filter((s) => s !== 'all').map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input
                        type="number" min="0" max="100"
                        placeholder="Min skor"
                        value={filters.minScore}
                        onChange={(e) => setFilter('minScore', e.target.value)}
                        className={`${SELECT_CLS} w-24`}
                    />
                    <div className="flex items-center gap-1">
                        <input type="date" value={filters.dateFrom} onChange={(e) => setFilter('dateFrom', e.target.value)} className={SELECT_CLS} title="Başvuru tarihi (başlangıç)" />
                        <span className="text-slate-300 text-[11px]">–</span>
                        <input type="date" value={filters.dateTo} onChange={(e) => setFilter('dateTo', e.target.value)} className={SELECT_CLS} title="Başvuru tarihi (bitiş)" />
                    </div>
                    {hasActiveFilters && (
                        <button
                            onClick={clearFilters}
                            className="flex items-center gap-1 text-[11px] font-bold text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg transition-colors"
                        >
                            <FilterX className="w-3.5 h-3.5" /> Temizle
                        </button>
                    )}
                </div>
            </div>

            {/* ── Toplu işlem çubuğu / sonuç bildirimi ─────────────────────── */}
            {(selectedIds.size > 0 || bulkResult) && (
                <div className="px-6 pt-3">
                    {selectedIds.size > 0 ? (
                        <div className="flex items-center justify-between gap-3 bg-[#13294E] text-white rounded-xl px-4 py-2.5 shadow-sm">
                            <span className="text-[12px] font-bold">{selectedIds.size} aday seçildi</span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setBulkModalOpen(true)}
                                    className="flex items-center gap-1.5 text-[11px] font-black bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                    <Layers className="w-3.5 h-3.5" /> Statü Değiştir
                                </button>
                                <button
                                    onClick={() => setSelectedIds(new Set())}
                                    className="flex items-center gap-1.5 text-[11px] font-bold text-white/70 hover:text-white px-2 py-1.5 transition-colors"
                                >
                                    <X className="w-3.5 h-3.5" /> Seçimi Temizle
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className={`flex items-center gap-2 text-[11px] font-semibold rounded-xl px-4 py-2.5 border ${bulkResult.failed > 0 ? 'text-amber-700 bg-amber-50 border-amber-100' : 'text-emerald-700 bg-emerald-50 border-emerald-100'}`}>
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            {bulkResult.ok} aday "{bulkResult.stageLabel}" statüsüne taşındı{bulkResult.failed > 0 ? `, ${bulkResult.failed} güncelleme başarısız` : ''}.
                            <button onClick={() => setBulkResult(null)} className="ml-auto text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
                        </div>
                    )}
                </div>
            )}

            {/* ── Table ────────────────────────────────────────────────────── */}
            <div className="flex-1 px-6 py-4">
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12px]">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="px-3 py-2.5 w-9">
                                        <button
                                            onClick={toggleAllFiltered}
                                            title={allFilteredSelected ? 'Seçimi kaldır' : 'Filtrelenen tüm adayları seç'}
                                            className="text-slate-400 hover:text-slate-700 transition-colors flex items-center"
                                        >
                                            {allFilteredSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                        </button>
                                    </th>
                                    <SortableHeader label="Aday" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    <SortableHeader label="Pozisyon" sortKey="position" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    <SortableHeader label="Departman" sortKey="department" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    <SortableHeader label="Aşama" sortKey="stage" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    <SortableHeader label="Kaynak" sortKey="source" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    <SortableHeader label="AI" sortKey="bestScore" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="center" />
                                    {selectedPosition && (
                                        <SortableHeader label="Poz. Uyum" sortKey="positionScore" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="center" />
                                    )}
                                    <SortableHeader label="Mülakat" sortKey="interviewScore" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="center" />
                                    <SortableHeader label="Genel" sortKey="combinedScore" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="center" />
                                    <SortableHeader label="Deneyim" sortKey="experience" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="center" />
                                    <SortableHeader label="Başvuru" sortKey="appliedDate" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                </tr>
                            </thead>
                            <tbody>
                                {loading && (
                                    <tr>
                                        <td colSpan={selectedPosition ? 12 : 11} className="px-4 py-12 text-center text-slate-400 text-[12px]">
                                            Adaylar yükleniyor…
                                        </td>
                                    </tr>
                                )}
                                {!loading && pageRows.length === 0 && (
                                    <tr>
                                        <td colSpan={selectedPosition ? 12 : 11} className="px-4 py-12 text-center">
                                            <p className="text-slate-400 text-[12px] font-semibold">
                                                {hasActiveFilters ? 'Filtrelere uyan aday bulunamadı.' : 'Henüz aday yok.'}
                                            </p>
                                            {hasActiveFilters && (
                                                <button onClick={clearFilters} className="mt-2 text-[11px] font-bold text-blue-600 hover:underline">
                                                    Filtreleri temizle
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                )}
                                {!loading && pageRows.map((c) => (
                                    <tr
                                        key={c.id}
                                        onClick={() => openCandidate(c.id)}
                                        className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/70 cursor-pointer transition-colors ${selectedIds.has(c.id) ? 'bg-blue-50/50' : ''}`}
                                    >
                                        <td className="px-3 py-2.5" onClick={(e) => { e.stopPropagation(); toggleRow(c.id); }}>
                                            <button className="text-slate-400 hover:text-slate-700 transition-colors flex items-center" aria-label="Adayı seç">
                                                {selectedIds.has(c.id) ? <CheckSquare className="w-4 h-4 text-[#13294E]" /> : <Square className="w-4 h-4" />}
                                            </button>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <p className="font-bold text-slate-800 whitespace-nowrap">{c.name || 'İsimsiz'}</p>
                                            <p className="text-[10px] text-slate-400 whitespace-nowrap">{c.email || '—'}</p>
                                        </td>
                                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                                            {c.matchedPositionTitle === null
                                                ? <span className="italic text-amber-600 font-semibold">Uygun açık pozisyon yok</span>
                                                : (c.bestTitle || c.position || '—')}
                                            {/* CV'ye göre ideal rol — açık pozisyon eşleşmesinden ayrı bilgi */}
                                            {(() => {
                                                const cvRole = c.suggestedRole || c.position;
                                                const shown = c.matchedPositionTitle === null ? null : (c.bestTitle || c.position);
                                                return cvRole && cvRole !== shown
                                                    ? <p className="text-[9px] text-slate-400 mt-0.5">CV'ye göre: {cvRole}</p>
                                                    : null;
                                            })()}
                                        </td>
                                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{c.department || '—'}</td>
                                        <td className="px-3 py-2.5"><StageChip status={c.status} /></td>
                                        <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{c.source || '—'}</td>
                                        <td className="px-3 py-2.5 text-center"><ScoreCell value={c.bestScore} /></td>
                                        {selectedPosition && (
                                            <td className="px-3 py-2.5 text-center"><ScoreCell value={c.positionScore} /></td>
                                        )}
                                        <td className="px-3 py-2.5 text-center"><ScoreCell value={c.interviewScore} /></td>
                                        <td className="px-3 py-2.5 text-center"><ScoreCell value={c.combinedScore} /></td>
                                        <td className="px-3 py-2.5 text-center text-slate-600">
                                            {c.experience != null && c.experience !== '' ? `${c.experience} yıl` : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{getAppliedDate(c) || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* ── Pagination ───────────────────────────────────────── */}
                    {sortedRows.length > PAGE_SIZE && (
                        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50/50">
                            <span className="text-[11px] text-slate-400 font-semibold">
                                {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, sortedRows.length)} / {sortedRows.length}
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                                    disabled={safePage === 0}
                                    className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    aria-label="Önceki sayfa"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-[11px] font-bold text-slate-600 px-2">
                                    {safePage + 1} / {pageCount}
                                </span>
                                <button
                                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                                    disabled={safePage >= pageCount - 1}
                                    className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    aria-label="Sonraki sayfa"
                                >
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <BulkStageModal
                isOpen={bulkModalOpen}
                count={selectedIds.size}
                applying={bulkApplying}
                onApply={handleBulkStage}
                onClose={() => setBulkModalOpen(false)}
            />
        </div>
    );
}
