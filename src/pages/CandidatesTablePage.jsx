// Aday Raporu — filterable, sortable table view over the candidate pool
// with Excel (.xlsx) export of the filtered result set.
//
// Complements CandidateProcessPage (card/kanban oriented) with a dense,
// report-style grid. Filtering/sorting/export-row logic lives in
// utils/candidateTable.js so it stays unit-testable; this component only
// owns filter state and rendering. The xlsx library is imported lazily on
// the first export click so it never enters the initial bundle.
import { useEffect, useMemo, useState } from 'react';
import {
    Search, Download, Users, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
    FilterX, Table2, Wrench, CheckSquare, Square, Layers, X, Loader2, AlertCircle, CheckCircle2,
    Share2, Building2, Brain, Mail,
} from 'lucide-react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import MaintenancePanel from '../components/MaintenancePanel';
import EvaluationEmailModal from '../components/EvaluationEmailModal';
import { useAuth } from '../context/AuthContext';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import { calculateMatchScore } from '../services/matchService';
import { deepScanCandidate } from '../services/scanService';
import { STAGES, getStage } from '../utils/pipelineStages';
import {
    DEFAULT_FILTERS, applyTableFilters, withCoherentScores, sortRows, buildExportRows,
    resolveStageKey, getAppliedDate, isDeepScanned, cleanRoleText,
} from '../utils/candidateTable';

const PAGE_SIZE = 50;

// Görünüm değişince (aday detayına gidip dönünce) bileşen unmount olur ve
// yerel state sıfırlanırdı — filtre/sıralama/sayfa sessionStorage'da yaşar
// ki liste bırakıldığı gibi bulunsun. (Sekme kapanınca temizlenir.)
const TABLE_STATE_KEY = 'candidatesTableState.v1';
const loadTableState = () => {
    try { return JSON.parse(sessionStorage.getItem(TABLE_STATE_KEY)) || {}; } catch { return {}; }
};

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

// Toplu işlem modali — üç tür: aşama (pipelineStages'ten), kaynak (sources
// koleksiyonundan, opsiyonel alt mecra) ve departmana açma (departments
// koleksiyonundan; adayın visibleToDepartments listesine eklenir — pozisyon
// tarafındaki "Departmana Aç" ile aynı görünürlük mekanizması).
const BULK_TYPES = {
    stage:      { title: 'Toplu Aşama Değişikliği',   icon: Layers,    warn: (n) => `Seçili ${n} adayın aşaması topluca değiştirilecek.` },
    source:     { title: 'Toplu Kaynak Değişikliği',  icon: Share2,    warn: (n) => `Seçili ${n} adayın kaynak bilgisi topluca değiştirilecek.` },
    department: { title: 'Departmana Aç',             icon: Building2, warn: (n) => `Seçili ${n} aday, seçeceğiniz departmanın kullanıcılarına görünür olacak.` },
};

function BulkActionModal({ isOpen, type, count, applying, onApply, onClose }) {
    const [stageKey, setStageKey] = useState('');
    const [sources, setSources] = useState(null);
    const [sourceName, setSourceName] = useState('');
    const [subSource, setSubSource] = useState('');
    const [departments, setDepartments] = useState(null);
    const [departmentName, setDepartmentName] = useState('');

    // Tür değişince seçimler sıfırlanır; kaynak/departman listeleri modal
    // açıldığında Firestore'dan çekilir.
    useEffect(() => {
        if (!isOpen) return;
        setStageKey(''); setSourceName(''); setSubSource(''); setDepartmentName('');
        const load = async (path, setter) => {
            try {
                const snap = await getDocs(query(collection(db, path), orderBy('name', 'asc')));
                setter(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch {
                setter([]);
            }
        };
        if (type === 'source') { setSources(null); load('artifacts/talent-flow/public/data/sources', setSources); }
        if (type === 'department') { setDepartments(null); load('artifacts/talent-flow/public/data/departments', setDepartments); }
    }, [isOpen, type]);

    if (!isOpen) return null;
    const cfg = BULK_TYPES[type];
    const Icon = cfg.icon;
    const selectedSource = (sources || []).find(s => s.name === sourceName);
    const canApply = type === 'stage' ? Boolean(stageKey)
        : type === 'source' ? Boolean(sourceName)
        : Boolean(departmentName);
    const apply = () => {
        if (!canApply) return;
        if (type === 'stage') onApply({ type, stageKey });
        else if (type === 'source') onApply({ type, source: sourceName, sourceDetail: subSource });
        else onApply({ type, department: departmentName });
    };
    const OPTION_CLS = (active) => `flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${active ? 'border-slate-400 bg-slate-50 shadow-sm' : 'border-slate-100 hover:border-slate-200'}`;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={applying ? undefined : onClose} />
            <div className="relative w-full max-w-md bg-white rounded-2xl border border-slate-100 shadow-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#13294E] flex items-center justify-center">
                            <Icon className="w-4.5 h-4.5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-[14px] font-black text-slate-900">{cfg.title}</h3>
                            <p className="text-[10px] text-slate-400 font-bold">{count} aday seçildi</p>
                        </div>
                    </div>
                    <button onClick={onClose} disabled={applying} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {type === 'stage' && (
                    <div className="grid grid-cols-2 gap-2">
                        {STAGES.map((s) => (
                            <button key={s.key} type="button" onClick={() => setStageKey(s.key)} className={OPTION_CLS(stageKey === s.key)}>
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                                <span className={`text-[12px] font-bold ${stageKey === s.key ? 'text-slate-900' : 'text-slate-600'}`}>{s.label}</span>
                            </button>
                        ))}
                    </div>
                )}

                {type === 'source' && (
                    sources === null ? (
                        <div className="flex items-center gap-2 text-slate-400 text-[11px] py-4"><Loader2 className="w-4 h-4 animate-spin" /> Kaynaklar yükleniyor…</div>
                    ) : sources.length === 0 ? (
                        <p className="text-[11px] text-slate-400 py-4">Tanımlı kaynak yok — Kaynak Yönetimi sayfasından ekleyebilirsiniz.</p>
                    ) : (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                                {sources.map((s) => (
                                    <button key={s.id} type="button" onClick={() => { setSourceName(s.name); setSubSource(''); }} className={OPTION_CLS(sourceName === s.name)}>
                                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color || '#94A3B8' }} />
                                        <span className={`text-[12px] font-bold truncate ${sourceName === s.name ? 'text-slate-900' : 'text-slate-600'}`}>{s.name}</span>
                                    </button>
                                ))}
                            </div>
                            {selectedSource?.subSources?.length > 0 && (
                                <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Alt Detay / Mecra (opsiyonel)</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {selectedSource.subSources.map((sub) => (
                                            <button key={sub} type="button" onClick={() => setSubSource(subSource === sub ? '' : sub)}
                                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${subSource === sub ? 'bg-[#13294E] text-white border-[#13294E]' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                                                {sub}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                )}

                {type === 'department' && (
                    departments === null ? (
                        <div className="flex items-center gap-2 text-slate-400 text-[11px] py-4"><Loader2 className="w-4 h-4 animate-spin" /> Departmanlar yükleniyor…</div>
                    ) : departments.length === 0 ? (
                        <p className="text-[11px] text-slate-400 py-4">Tanımlı departman yok — Departman Yönetimi sayfasından ekleyebilirsiniz.</p>
                    ) : (
                        <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                            {departments.map((d) => (
                                <button key={d.id} type="button" onClick={() => setDepartmentName(d.name)} className={OPTION_CLS(departmentName === d.name)}>
                                    <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span className={`text-[12px] font-bold truncate ${departmentName === d.name ? 'text-slate-900' : 'text-slate-600'}`}>{d.name}</span>
                                </button>
                            ))}
                        </div>
                    )
                )}

                <div className="mt-4 flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {cfg.warn(count)}
                </div>
                <div className="mt-4 flex gap-2">
                    <button onClick={onClose} disabled={applying} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[12px] font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                        İptal
                    </button>
                    <button onClick={apply} disabled={!canApply || applying}
                        className="flex-[2] py-2.5 rounded-xl bg-[#13294E] hover:bg-[#1E3A6E] text-white text-[12px] font-black disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
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

    const [filters, setFilters] = useState(() => ({ ...DEFAULT_FILTERS, ...(loadTableState().filters || {}) }));
    const [sortKey, setSortKey] = useState(() => loadTableState().sortKey || 'appliedDate');
    const [sortDir, setSortDir] = useState(() => loadTableState().sortDir || 'desc');
    const [page, setPage] = useState(() => loadTableState().page || 0);
    // Her değişiklikte kalıcılaştır — detaydan dönüşte liste aynı kalır
    useEffect(() => {
        try { sessionStorage.setItem(TABLE_STATE_KEY, JSON.stringify({ filters, sortKey, sortDir, page })); } catch { /* dolu/kapalı storage önemsiz */ }
    }, [filters, sortKey, sortDir, page]);
    const [exporting, setExporting] = useState(false);
    const [showMaintenance, setShowMaintenance] = useState(false);
    // Toplu seçim: filtre değişince temizlenir — görünmeyen adaylarda
    // "gizli" toplu güncelleme yapılmasın.
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [bulkModalOpen, setBulkModalOpen] = useState(false);
    const [bulkType, setBulkType] = useState('stage');
    const [bulkApplying, setBulkApplying] = useState(false);
    const [bulkResult, setBulkResult] = useState(null);
    const [scanProgress, setScanProgress] = useState(null); // {done,total}
    const [evalModalOpen, setEvalModalOpen] = useState(false);
    const openBulkModal = (type) => { setBulkType(type); setBulkModalOpen(true); };

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
            setSortDir(key === 'name' || key === 'position' || key === 'cvRole' ? 'asc' : 'desc');
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

    const handleBulkApply = async (payload) => {
        if (bulkApplying || selectedIds.size === 0) return;
        setBulkApplying(true);
        setBulkResult(null);
        try {
            const ids = Array.from(selectedIds);
            let message = '';
            let failed = 0;

            if (payload.type === 'stage') {
                // Tekil değişiklikle (CandidateProcessPage.handleStatusChange) aynı damgalar
                const now = new Date().toISOString();
                const by = user?.displayName || user?.email || 'HR';
                const update = { status: payload.stageKey, statusChangedAt: now, statusChangedBy: by };
                if (payload.stageKey === 'rejected') { update.rejectedAt = now; update.rejectedBy = by; }
                if (payload.stageKey === 'hired') { update.hiredAt = now; update.hiredBy = by; }
                const results = await Promise.allSettled(ids.map((id) => updateCandidate(id, update)));
                failed = results.filter((r) => r.status === 'rejected').length;
                message = `${ids.length - failed} aday "${getStage(payload.stageKey).label}" aşamasına taşındı`;
            } else if (payload.type === 'source') {
                const update = { source: payload.source, ...(payload.sourceDetail ? { sourceDetail: payload.sourceDetail } : {}) };
                const results = await Promise.allSettled(ids.map((id) => updateCandidate(id, update)));
                failed = results.filter((r) => r.status === 'rejected').length;
                message = `${ids.length - failed} adayın kaynağı "${payload.source}${payload.sourceDetail ? ` / ${payload.sourceDetail}` : ''}" olarak güncellendi`;
            } else if (payload.type === 'department') {
                // Pozisyon tarafındaki "Departmana Aç" ile aynı mekanizma: aday,
                // departmanın visibleToDepartments listesine eklenir (varsa atlanır).
                const rowById = new Map(coherentRows.map((c) => [c.id, c]));
                let already = 0;
                const results = await Promise.allSettled(ids.map((id) => {
                    const cur = rowById.get(id)?.visibleToDepartments || [];
                    if (cur.includes(payload.department)) { already += 1; return Promise.resolve(); }
                    return updateCandidate(id, { visibleToDepartments: [...cur, payload.department] });
                }));
                failed = results.filter((r) => r.status === 'rejected').length;
                message = `${ids.length - failed - already} aday "${payload.department}" departmanına açıldı${already > 0 ? ` (${already} zaten açıktı)` : ''}`;
            }

            setBulkResult({ message, failed });
            setSelectedIds(new Set());
            setBulkModalOpen(false);
        } finally {
            setBulkApplying(false);
        }
    };

    // Seçili adaylardan HENÜZ otonom taramadan geçmemiş olanları derinlemesine
    // analiz eder (SystemScanner ile aynı kurallar — scanService). Zaten
    // taranmışlara dokunmaz; CV metni olmayanlar atlanıp raporlanır.
    const handleBulkScan = async () => {
        if (bulkApplying || scanProgress || selectedIds.size === 0) return;
        if (openPositions.length === 0) { setBulkResult({ message: 'Otonom tarama için açık pozisyon gerekli', failed: 1 }); return; }
        const rowById = new Map(coherentRows.map((c) => [c.id, c]));
        const rows = Array.from(selectedIds).map((id) => rowById.get(id)).filter(Boolean);
        const unscanned = rows.filter((c) => !c.aiAnalysis?.starAnalysis);
        if (unscanned.length === 0) {
            setBulkResult({ message: `Seçili ${rows.length} adayın tümü zaten otonom taramadan geçmiş — yeniden tarama gerekmiyor`, failed: 0 });
            setSelectedIds(new Set());
            return;
        }
        const ok = window.confirm(
            `${rows.length} seçili adaydan ${unscanned.length} tanesi henüz taranmamış.\n` +
            `${unscanned.length} aday için otonom tarama başlatılsın mı? (aday başına 1-5 AI çağrısı yapılır)`
        );
        if (!ok) return;

        setBulkResult(null);
        setScanProgress({ done: 0, total: unscanned.length });
        let scanned = 0, skippedNoCv = 0, noResult = 0, failed = 0;
        // 3'lü paralel havuz — SystemScanner ile aynı eşzamanlılık
        let nextIdx = 0;
        await Promise.all(Array.from({ length: Math.min(3, unscanned.length) }, async () => {
            while (nextIdx < unscanned.length) {
                const candidate = unscanned[nextIdx];
                nextIdx += 1;
                try {
                    const result = await deepScanCandidate(candidate, openPositions);
                    if (result.status === 'scanned') { await updateCandidate(candidate.id, result.updates); scanned += 1; }
                    else if (result.status === 'skipped_no_cv') skippedNoCv += 1;
                    else noResult += 1;
                } catch {
                    failed += 1;
                }
                setScanProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
            }
        }));
        setScanProgress(null);
        setSelectedIds(new Set());
        setBulkResult({
            message: `${scanned} aday otonom taramadan geçirildi`
                + (skippedNoCv > 0 ? ` · ${skippedNoCv} aday CV metni olmadığı için atlandı` : '')
                + (noResult > 0 ? ` · ${noResult} aday için sonuç alınamadı` : ''),
            failed,
        });
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
                    <select value={filters.scan} onChange={(e) => setFilter('scan', e.target.value)} className={SELECT_CLS} title="Otonom (derin) tarama durumu">
                        <option value="all">Tarama: Tümü</option>
                        <option value="scanned">Taranmış</option>
                        <option value="unscanned">Taranmamış</option>
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
                        <div className="flex items-center justify-between gap-3 flex-wrap bg-[#13294E] text-white rounded-xl px-4 py-2.5 shadow-sm">
                            <span className="text-[12px] font-bold">
                                {scanProgress
                                    ? `Otonom tarama: ${scanProgress.done} / ${scanProgress.total} aday…`
                                    : `${selectedIds.size} aday seçildi`}
                            </span>
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={handleBulkScan}
                                    disabled={Boolean(scanProgress)}
                                    title="Seçililerden henüz taranmamış olanlar için derin AI analizi çalıştırır"
                                    className="flex items-center gap-1.5 text-[11px] font-black bg-violet-500/80 hover:bg-violet-500 disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                    {scanProgress ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                                    Otonom Tarama
                                </button>
                                <button
                                    onClick={() => setEvalModalOpen(true)}
                                    disabled={Boolean(scanProgress)}
                                    title="Seçili adayları uyum analizi ve detay linkleriyle iş arkadaşlarınıza e-postalayın (kendi hesabınızdan)"
                                    className="flex items-center gap-1.5 text-[11px] font-black bg-emerald-500/80 hover:bg-emerald-500 disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                    <Mail className="w-3.5 h-3.5" /> Değerlendirmeye Gönder
                                </button>
                                <button
                                    onClick={() => openBulkModal('stage')}
                                    disabled={Boolean(scanProgress)}
                                    className="flex items-center gap-1.5 text-[11px] font-black bg-white/10 hover:bg-white/20 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                    <Layers className="w-3.5 h-3.5" /> Aşama Değiştir
                                </button>
                                <button
                                    onClick={() => openBulkModal('source')}
                                    disabled={Boolean(scanProgress)}
                                    className="flex items-center gap-1.5 text-[11px] font-black bg-white/10 hover:bg-white/20 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                    <Share2 className="w-3.5 h-3.5" /> Kaynak Değiştir
                                </button>
                                <button
                                    onClick={() => openBulkModal('department')}
                                    disabled={Boolean(scanProgress)}
                                    className="flex items-center gap-1.5 text-[11px] font-black bg-white/10 hover:bg-white/20 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                    <Building2 className="w-3.5 h-3.5" /> Departmana Aç
                                </button>
                                <button
                                    onClick={() => setSelectedIds(new Set())}
                                    disabled={Boolean(scanProgress)}
                                    className="flex items-center gap-1.5 text-[11px] font-bold text-white/70 hover:text-white disabled:opacity-50 px-2 py-1.5 transition-colors"
                                >
                                    <X className="w-3.5 h-3.5" /> Seçimi Temizle
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className={`flex items-center gap-2 text-[11px] font-semibold rounded-xl px-4 py-2.5 border ${bulkResult.failed > 0 ? 'text-amber-700 bg-amber-50 border-amber-100' : 'text-emerald-700 bg-emerald-50 border-emerald-100'}`}>
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            {bulkResult.message}{bulkResult.failed > 0 ? `, ${bulkResult.failed} güncelleme başarısız` : ''}.
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
                                    <SortableHeader label="CV'ye Göre" sortKey="cvRole" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    <SortableHeader label="Departman" sortKey="department" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    <SortableHeader label="Aşama" sortKey="stage" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    <SortableHeader label="Kaynak" sortKey="source" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    <SortableHeader label="Tarama" sortKey="scanStatus" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="center" />
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
                                        <td colSpan={selectedPosition ? 14 : 13} className="px-4 py-12 text-center text-slate-400 text-[12px]">
                                            Adaylar yükleniyor…
                                        </td>
                                    </tr>
                                )}
                                {!loading && pageRows.length === 0 && (
                                    <tr>
                                        <td colSpan={selectedPosition ? 14 : 13} className="px-4 py-12 text-center">
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
                                        {/* Serbest metin kolonları genişlik sınırlı: AI'nın ürettiği
                                            uzun rol adları tabloyu yatayda taşırıyordu — kesilen
                                            metnin tamamı tooltip'te. */}
                                        <td className="px-3 py-2.5 text-slate-600">
                                            {c.matchedPositionTitle === null
                                                ? <p className="italic text-amber-600 font-semibold truncate max-w-[180px]">Uygun açık pozisyon yok</p>
                                                : <p className="truncate max-w-[180px]" title={c.bestTitle || c.position || ''}>{c.bestTitle || c.position || '—'}</p>}
                                        </td>
                                        {/* CV'ye göre ideal rol — açık pozisyon eşleşmesinden AYRI kolon */}
                                        <td className="px-3 py-2.5 text-slate-500">
                                            <p className="truncate max-w-[160px]" title={cleanRoleText(c.suggestedRole, c.position || '')}>{cleanRoleText(c.suggestedRole, c.position || '') || '—'}</p>
                                        </td>
                                        <td className="px-3 py-2.5 text-slate-600">
                                            <p className="truncate max-w-[120px]" title={c.department || ''}>{c.department || '—'}</p>
                                        </td>
                                        <td className="px-3 py-2.5"><StageChip status={c.status} /></td>
                                        <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{c.source || '—'}</td>
                                        <td className="px-3 py-2.5 text-center">
                                            {isDeepScanned(c) ? (
                                                <span
                                                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full text-emerald-700 bg-emerald-50 border border-emerald-100 whitespace-nowrap"
                                                    title={c.lastScannedAt ? `Son tarama: ${new Date(c.lastScannedAt).toLocaleString('tr-TR')}` : 'Otonom tarama yapıldı'}
                                                >
                                                    <Brain className="w-3 h-3" /> Tarandı
                                                </span>
                                            ) : (
                                                <span
                                                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full text-amber-700 bg-amber-50 border border-amber-100 whitespace-nowrap"
                                                    title="Henüz otonom tarama yapılmadı — seçip 'Otonom Tarama' ile başlatabilirsiniz"
                                                >
                                                    Taranmadı
                                                </span>
                                            )}
                                        </td>
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

            <EvaluationEmailModal
                isOpen={evalModalOpen}
                candidates={Array.from(selectedIds).map((id) => coherentRows.find((c) => c.id === id)).filter(Boolean)}
                openPositions={openPositions}
                onClose={() => setEvalModalOpen(false)}
                onSent={(message) => { setBulkResult({ message, failed: 0 }); setSelectedIds(new Set()); }}
            />
            <BulkActionModal
                isOpen={bulkModalOpen}
                type={bulkType}
                count={selectedIds.size}
                applying={bulkApplying}
                onApply={handleBulkApply}
                onClose={() => setBulkModalOpen(false)}
            />
        </div>
    );
}
