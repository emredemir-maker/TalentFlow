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
    FilterX, Table2, Wrench,
} from 'lucide-react';
import MaintenancePanel from '../components/MaintenancePanel';
import { useCandidates } from '../context/CandidatesContext';
import { STAGES, getStage } from '../utils/pipelineStages';
import {
    DEFAULT_FILTERS, applyTableFilters, sortRows, buildExportRows,
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

export default function CandidatesTablePage() {
    const {
        enrichedCandidates, loading, setViewCandidateId,
        departments, matchPositions, sourcesOptions,
    } = useCandidates();

    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [sortKey, setSortKey] = useState('appliedDate');
    const [sortDir, setSortDir] = useState('desc');
    const [page, setPage] = useState(0);
    const [exporting, setExporting] = useState(false);
    const [showMaintenance, setShowMaintenance] = useState(false);

    const setFilter = (key, value) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setPage(0);
    };
    const clearFilters = () => { setFilters(DEFAULT_FILTERS); setPage(0); };
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

    const filteredRows = useMemo(
        () => applyTableFilters(enrichedCandidates, filters),
        [enrichedCandidates, filters]
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
                        <h1 className="text-xl font-black text-slate-900">Aday Raporu</h1>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                            {sortedRows.length === enrichedCandidates.length
                                ? `${enrichedCandidates.length} aday`
                                : `${sortedRows.length} / ${enrichedCandidates.length} aday (filtreli)`}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowMaintenance(v => !v)}
                        className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors ${showMaintenance ? 'text-white bg-[#13294E]' : 'text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200'}`}
                    >
                        <Wrench className="w-3.5 h-3.5" /> Bakım
                    </button>
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }))}
                        className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                    >
                        <Users className="w-3.5 h-3.5" /> Aday Listesi
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
            {showMaintenance && (
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
                    <select value={filters.position} onChange={(e) => setFilter('position', e.target.value)} className={SELECT_CLS}>
                        <option value="all">Tüm Pozisyonlar</option>
                        {matchPositions.filter((p) => p !== 'all').map((p) => <option key={p} value={p}>{p}</option>)}
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

            {/* ── Table ────────────────────────────────────────────────────── */}
            <div className="flex-1 px-6 py-4">
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12px]">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <SortableHeader label="Aday" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    <SortableHeader label="Pozisyon" sortKey="position" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    <SortableHeader label="Departman" sortKey="department" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    <SortableHeader label="Aşama" sortKey="stage" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    <SortableHeader label="Kaynak" sortKey="source" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    <SortableHeader label="AI" sortKey="bestScore" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="center" />
                                    <SortableHeader label="Mülakat" sortKey="interviewScore" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="center" />
                                    <SortableHeader label="Genel" sortKey="combinedScore" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="center" />
                                    <SortableHeader label="Deneyim" sortKey="experience" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="center" />
                                    <SortableHeader label="Başvuru" sortKey="appliedDate" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                </tr>
                            </thead>
                            <tbody>
                                {loading && (
                                    <tr>
                                        <td colSpan={10} className="px-4 py-12 text-center text-slate-400 text-[12px]">
                                            Adaylar yükleniyor…
                                        </td>
                                    </tr>
                                )}
                                {!loading && pageRows.length === 0 && (
                                    <tr>
                                        <td colSpan={10} className="px-4 py-12 text-center">
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
                                        className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 cursor-pointer transition-colors"
                                    >
                                        <td className="px-3 py-2.5">
                                            <p className="font-bold text-slate-800 whitespace-nowrap">{c.name || 'İsimsiz'}</p>
                                            <p className="text-[10px] text-slate-400 whitespace-nowrap">{c.email || '—'}</p>
                                        </td>
                                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{c.bestTitle || c.position || '—'}</td>
                                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{c.department || '—'}</td>
                                        <td className="px-3 py-2.5"><StageChip status={c.status} /></td>
                                        <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{c.source || '—'}</td>
                                        <td className="px-3 py-2.5 text-center"><ScoreCell value={c.bestScore} /></td>
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
        </div>
    );
}
