// Aday Raporu — filterable, sortable table view over the candidate pool
// with Excel (.xlsx) export of the filtered result set.
//
// Complements CandidateProcessPage (card/kanban oriented) with a dense,
// report-style grid. Filtering/sorting/export-row logic lives in
// utils/candidateTable.js so it stays unit-testable; this component only
// owns filter state and rendering. The xlsx library is imported lazily on
// the first export click so it never enters the initial bundle.
import { gateLabel } from '../utils/mustHaveGate';
import { buildCandidateBadges, verificationBucket } from '../utils/candidateBadges';
import CandidateBadges from '../components/CandidateBadges';
import { useEffect, useMemo, useState } from 'react';
import {
    Search, Download, Users, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
    FilterX, Table2, Wrench, CheckSquare, Square, Layers, X, Loader2, AlertCircle, CheckCircle2,
    Share2, Building2, Brain, Mail, Mic,
} from 'lucide-react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import MaintenancePanel from '../components/MaintenancePanel';
import EvaluationEmailModal from '../components/EvaluationEmailModal';
import { useAuth } from '../context/AuthContext';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import { calculateMatchScore } from '../services/matchService';
import { deepScanCandidate, rescanCandidateForPosition } from '../services/scanService';
import { STAGES, getStage } from '../utils/pipelineStages';
import {
    DEFAULT_FILTERS, applyTableFilters, withCoherentScores, sortRows, buildExportRows,
    resolveStageKey, getAppliedDate, isDeepScanned, cleanRoleText, isIstanbulLocation,
    VERIFICATION_RANK, describeActiveFilters, FILTER_RESET_FIELDS,
    SCORE_METHOD, SCORE_METHOD_LABEL,
} from '../utils/candidateTable';

const PAGE_SIZE = 50;

/**
 * Tek seferde en fazla kaç aday aynı cetvele getirilir.
 *
 * Her aday BİR AI çağrısı demek. Tavansız bırakmak 662 adaylık bir havuzda
 * tek tıkla yüzlerce çağrı gönderirdi. Tavana takılan sayı kullanıcıya
 * SÖYLENİR — sessizce kesmek, işin bittiği izlenimi verirdi.
 */
const MAX_ALIGN = 50;

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
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
        >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: stage.color }} />
            {stage.label}
        </span>
    );
}

/**
 * Skoru HANGİ CETVELİN ürettiği.
 *
 * Derin analiz normaldir, işaretlenmez. Diğerleri işaretlenir çünkü aynı
 * kolonda duran iki sayı aynı şeyi ölçmüyor olabilir: doğrudan eşleşen aday
 * derin analizle, elle atanan aday anahtar kelimeyle ölçülüyor. İşaret
 * olmadan kullanıcı bunları karşılaştırılabilir sanıyor — canlıda tam olarak
 * böyle bir "tutarsızlık" olarak bildirildi.
 */
function MethodMark({ method }) {
    if (!method || method === SCORE_METHOD.ANALYSIS || method === SCORE_METHOD.NONE) return null;
    const keyword = method === SCORE_METHOD.KEYWORD;
    return (
        <span
            title={`${SCORE_METHOD_LABEL[method]} ile ölçüldü — bu ilana göre derin analiz yapılmamış, diğer adaylarla doğrudan karşılaştırılamaz`}
            className={`mt-0.5 px-1 py-px rounded text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap border ${
                keyword
                    ? 'bg-warn-bg border-warn text-warn'
                    : 'bg-n100 border-n200 text-n500'
            }`}
        >
            {keyword ? 'anahtar kelime' : 'ai'}
        </span>
    );
}

function ScoreCell({ value, gate, interviewed, method }) {
    if (value === null || value === undefined || value === '') {
        return <span className="text-n300">—</span>;
    }
    const color = value >= 75 ? '#059669' : value >= 50 ? '#D97706' : '#DC2626';
    // Zorunlu bir madde karşılanmıyorsa çıplak yüzde yanıltıcı: aday yüksek
    // puanlı görünüyor ama ilanın olmazsa olmazını sağlamıyor. Skoru
    // düşürmüyoruz — kararı insan verecek — ama saklamıyoruz da.
    const label = gate ? gateLabel(gate) : null;
    return (
        <span className="inline-flex flex-col items-center leading-tight">
            <span className="inline-flex items-center gap-1">
                <span style={{ color }} className="font-semibold">%{value}</span>
                {/* Skor mülakattan etkilendiyse hücre bunu söylemeli: dün 65
                    gördüğü adayı bugün 78'de bulan kullanıcı nedenini
                    bilmeli. Sessizce değişen sayı, açıklanamayan sayıdır. */}
                {interviewed && (
                    <Mic
                        className="w-2.5 h-2.5 text-n400"
                        aria-label="Mülakat sonucu skora dahil"
                    />
                )}
            </span>
            {label && label.tone === 'red' && (
                <span
                    title={gate.missing.map((m) => m.text).join(' · ')}
                    className="mt-0.5 px-1 py-px rounded bg-bad-bg border border-transparent text-[11px] font-semibold text-bad uppercase tracking-wide whitespace-nowrap"
                >
                    {label.text}
                </span>
            )}
            <MethodMark method={method} />
            {label && label.tone === 'amber' && (
                <span
                    title={gate.partial.map((m) => m.text).join(' · ')}
                    className="mt-0.5 px-1 py-px rounded bg-warn-bg border border-warn text-[11px] font-semibold text-warn uppercase tracking-wide whitespace-nowrap"
                >
                    {label.text}
                </span>
            )}
        </span>
    );
}

function SortableHeader({ label, sortKey, activeKey, dir, onSort, align = 'left' }) {
    const isActive = activeKey === sortKey;
    return (
        <th
            className={`px-3 py-2.5 text-${align} select-none cursor-pointer whitespace-nowrap hover:bg-n100 transition-colors`}
            onClick={() => onSort(sortKey)}
        >
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-n500">
                {label}
                {isActive && (dir === 'asc'
                    ? <ChevronUp className="w-3 h-3 text-n700" />
                    : <ChevronDown className="w-3 h-3 text-n700" />)}
            </span>
        </th>
    );
}

const SELECT_CLS = 'text-[12px] border border-n200 rounded-md bg-n0 px-2.5 py-1.5 focus:outline-none focus:border-brand text-n700';

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
    const OPTION_CLS = (active) => `flex items-center gap-2.5 px-3 py-2.5 rounded-md border text-left transition-all ${active ? 'border-brand bg-brand-50' : 'border-n200 hover:border-n200'}`;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3">
            <div className="absolute inset-0 bg-n900/40 backdrop-blur-sm" onClick={applying ? undefined : onClose} />
            <div className="relative w-full max-w-md bg-n0 rounded-[14px] border border-n200 shadow-2xl p-3.5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-md bg-brand flex items-center justify-center">
                            <Icon className="w-4.5 h-4.5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-[13px] font-semibold text-n900">{cfg.title}</h3>
                            <p className="text-[10px] text-n400 font-semibold">{count} aday seçildi</p>
                        </div>
                    </div>
                    <button onClick={onClose} disabled={applying} className="p-1.5 hover:bg-n100 rounded-md text-n400 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {type === 'stage' && (
                    <div className="grid grid-cols-2 gap-2">
                        {STAGES.map((s) => (
                            <button key={s.key} type="button" onClick={() => setStageKey(s.key)} className={OPTION_CLS(stageKey === s.key)}>
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                                <span className={`text-[11px] font-semibold ${stageKey === s.key ? 'text-n900' : 'text-n600'}`}>{s.label}</span>
                            </button>
                        ))}
                    </div>
                )}

                {type === 'source' && (
                    sources === null ? (
                        <div className="flex items-center gap-2 text-n400 text-[11px] py-3"><Loader2 className="w-4 h-4 animate-spin" /> Kaynaklar yükleniyor…</div>
                    ) : sources.length === 0 ? (
                        <p className="text-[11px] text-n400 py-3">Tanımlı kaynak yok — Kaynak Yönetimi sayfasından ekleyebilirsiniz.</p>
                    ) : (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                                {sources.map((s) => (
                                    <button key={s.id} type="button" onClick={() => { setSourceName(s.name); setSubSource(''); }} className={OPTION_CLS(sourceName === s.name)}>
                                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color || '#94A3B8' }} />
                                        <span className={`text-[11px] font-semibold truncate ${sourceName === s.name ? 'text-n900' : 'text-n600'}`}>{s.name}</span>
                                    </button>
                                ))}
                            </div>
                            {selectedSource?.subSources?.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-semibold text-n400 uppercase tracking-[0.08em] mb-1.5">Alt Detay / Mecra (opsiyonel)</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {selectedSource.subSources.map((sub) => (
                                            <button key={sub} type="button" onClick={() => setSubSource(subSource === sub ? '' : sub)}
                                                className={`px-2.5 py-1 rounded-md text-[12px] font-semibold border transition-all ${subSource === sub ? 'bg-brand text-white border-brand' : 'border-n200 text-n500 hover:border-n300'}`}>
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
                        <div className="flex items-center gap-2 text-n400 text-[11px] py-3"><Loader2 className="w-4 h-4 animate-spin" /> Departmanlar yükleniyor…</div>
                    ) : departments.length === 0 ? (
                        <p className="text-[11px] text-n400 py-3">Tanımlı departman yok — Departman Yönetimi sayfasından ekleyebilirsiniz.</p>
                    ) : (
                        <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                            {departments.map((d) => (
                                <button key={d.id} type="button" onClick={() => setDepartmentName(d.name)} className={OPTION_CLS(departmentName === d.name)}>
                                    <Building2 className="w-3.5 h-3.5 text-n400 shrink-0" />
                                    <span className={`text-[11px] font-semibold truncate ${departmentName === d.name ? 'text-n900' : 'text-n600'}`}>{d.name}</span>
                                </button>
                            ))}
                        </div>
                    )
                )}

                <div className="mt-4 flex items-start gap-2 text-[12px] text-warn bg-warn-bg border border-transparent rounded-md px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {cfg.warn(count)}
                </div>
                <div className="mt-4 flex gap-2">
                    <button onClick={onClose} disabled={applying} className="flex-1 py-2.5 rounded-md border border-n200 text-[11px] font-semibold text-n600 hover:bg-n50 transition-colors">
                        İptal
                    </button>
                    <button onClick={apply} disabled={!canApply || applying}
                        className="flex-[2] py-2.5 rounded-md bg-brand hover:bg-brand-600 text-white text-[11px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
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

    // Tek bir çipi kapatmak. Tarih aralığı gibi İKİ ALANI olan filtrelerde
    // ikisini birden sıfırlar; yalnızca birini temizlemek çipin gösterdiği
    // şeyle çelişen bir ara durum bırakırdı.
    const clearFilter = (key) => {
        const fields = FILTER_RESET_FIELDS[key] || [key];
        setFilters((prev) => {
            const next = { ...prev };
            for (const f of fields) next[f] = DEFAULT_FILTERS[f];
            return next;
        });
        setPage(0);
    };
    const hasActiveFilters = useMemo(
        () => Object.keys(DEFAULT_FILTERS).some((k) => filters[k] !== DEFAULT_FILTERS[k]),
        [filters]
    );
    const activeFilterChips = useMemo(() => describeActiveFilters(filters), [filters]);

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
    // Rozet ve doğrulama rütbesi SIRALAMADAN ÖNCE, satır başına bir kez.
    // Sıralayıcı her karşılaştırmada erişimci çağırdığı için rütbeyi orada
    // hesaplamak 662 satırda binlerce CV ayrıştırması demekti.
    const decoratedRows = useMemo(
        () => filteredRows.map((c) => ({
            ...c,
            badges: buildCandidateBadges(c, { position: selectedPosition, max: 4 }),
            verificationRank: VERIFICATION_RANK[verificationBucket(c, { position: selectedPosition })],
        })),
        [filteredRows, selectedPosition]
    );
    const sortedRows = useMemo(
        () => sortRows(decoratedRows, sortKey, sortDir),
        [decoratedRows, sortKey, sortDir]
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

    // Seçili adayları derinlemesine analiz eder (SystemScanner ile aynı
    // kurallar — scanService). CV metni olmayanlar atlanıp raporlanır.
    //
    // Zaten taranmış adaylar ESKİDEN sessizce dışarıda bırakılıyordu; bu,
    // ilan gereksinimleri veya skorlama değiştiğinde havuzu yeniden
    // değerlendirmeyi imkânsız kılıyordu. Artık seçim taranmış aday
    // içeriyorsa onay metni bunu açıkça söyler ve hepsi yeniden taranır.
    // ── AYNI CETVELE GETİRME ────────────────────────────────────────────────
    //
    // Aynı ilan için iki aday farklı cetvellerle ölçülebiliyor: doğrudan
    // eşleşen adayın derin analizi varken, elle atanan aday anahtar kelimeye
    // düşüyor. İşaretleme bunu GÖRÜNÜR yapıyor ama çözmüyor — çözümü, eksik
    // olanları o ilana göre gerçekten ölçmek.
    const unalignedRows = useMemo(
        () => (selectedPosition
            ? sortedRows.filter((c) => c.positionScoreMethod && c.positionScoreMethod !== SCORE_METHOD.ANALYSIS)
            : []),
        [sortedRows, selectedPosition]
    );

    // SEÇİM VARSA SEÇİME SAYGI DUYULUR.
    //
    // Hizalama görünen listeye göre çalışıyordu. "Bu ilana atananlar"
    // kapsamında bu doğru sonuç veriyor (birkaç aday), ama "tüm havuz"
    // kapsamında tek tıkla onlarca gereksiz AI çağrısı demek — kullanıcının
    // ilgilendiği üç aday varken 50 adayı taramak.
    //
    // Tabloda zaten seçim kutuları var ve toplu tarama onları kullanıyor;
    // hizalamanın kullanmaması tutarsızlıktı. Seçim yoksa eski davranış
    // sürüyor: görünen listedeki hizalanmamışlar.
    const alignTargets = useMemo(() => {
        if (selectedIds.size === 0) return unalignedRows;
        return unalignedRows.filter((c) => selectedIds.has(c.id));
    }, [unalignedRows, selectedIds]);

    const handleAlignToPosition = async () => {
        if (!selectedPosition || scanProgress || bulkApplying || alignTargets.length === 0) return;
        const targets = alignTargets.slice(0, MAX_ALIGN);
        const skipped = alignTargets.length - targets.length;
        const scopeText = selectedIds.size > 0 ? 'Seçili' : 'Listedeki';
        const ok = window.confirm(
            `${scopeText} ${targets.length} aday "${selectedPosition.title}" ilanına göre değerlendirilecek.

`
            + 'Her aday bir AI çağrısı demek; işlem birkaç dakika sürebilir.'
            + (skipped > 0 ? `

Tavan nedeniyle ${skipped} aday bu turda DIŞARIDA kalacak; işlemi tekrarlayabilirsiniz.` : '')
        );
        if (!ok) return;

        setScanProgress({ done: 0, total: targets.length });
        let scanned = 0;
        let failed = 0;
        for (let i = 0; i < targets.length; i += 1) {
            const c = targets[i];
            try {
                const r = await rescanCandidateForPosition(c, selectedPosition);
                if (r?.status === 'scanned' && r.updates) {
                    await updateCandidate(c.id, r.updates);
                    scanned += 1;
                } else {
                    failed += 1;
                }
            } catch {
                failed += 1;
            }
            setScanProgress({ done: i + 1, total: targets.length });
        }
        setScanProgress(null);
        setBulkResult({
            message: `${scanned} aday "${selectedPosition.title}" ilanına göre ölçüldü`
                + (skipped > 0 ? ` — tavan nedeniyle ${skipped} aday taranmadı` : ''),
            failed,
        });
    };

    const handleBulkScan = async () => {
        if (bulkApplying || scanProgress || selectedIds.size === 0) return;
        if (openPositions.length === 0) { setBulkResult({ message: 'Otonom tarama için açık pozisyon gerekli', failed: 1 }); return; }
        const rowById = new Map(coherentRows.map((c) => [c.id, c]));
        const rows = Array.from(selectedIds).map((id) => rowById.get(id)).filter(Boolean);
        const alreadyScanned = rows.filter((c) => c.aiAnalysis?.starAnalysis).length;
        const ok = window.confirm(
            `${rows.length} aday için otonom tarama başlatılsın mı?` +
            (alreadyScanned > 0
                ? `\n\n${alreadyScanned} aday daha önce taranmış — mevcut analizleri YENİDEN üretilip güncellenecek.`
                : '') +
            `\n\nAday başına 1-5 AI çağrısı yapılır.`
        );
        if (!ok) return;

        setBulkResult(null);
        setScanProgress({ done: 0, total: rows.length });
        let scanned = 0, skippedNoCv = 0, noResult = 0, failed = 0;
        // 3'lü paralel havuz — SystemScanner ile aynı eşzamanlılık
        let nextIdx = 0;
        await Promise.all(Array.from({ length: Math.min(3, rows.length) }, async () => {
            while (nextIdx < rows.length) {
                const candidate = rows[nextIdx];
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
        <div className="infoset flex flex-col min-h-screen">
            {/* ── Header ───────────────────────────────────────────────────── */}
            <header className="h-14 bg-n0 border-b border-n200 px-[18px] flex items-center gap-3.5 sticky top-0 z-20">
                <div>
                    <h1 className="text-[15px] font-semibold tracking-[-0.02em] m-0">Aday havuzu</h1>
                    <span className="text-[10px] text-n400">
                        {sortedRows.length === enrichedCandidates.length
                            ? `${enrichedCandidates.length} aday`
                            : `${sortedRows.length} / ${enrichedCandidates.length} aday (filtreli)`}
                        {selectedIds.size > 0 ? ` · ${selectedIds.size} seçili` : ''}
                    </span>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    {canMaintain && (
                        <button
                            onClick={() => setShowMaintenance(v => !v)}
                            className={`flex items-center gap-1.5 text-[12px] font-medium border rounded-md px-[11px] py-1.5 ${
                                showMaintenance
                                    ? 'bg-brand-50 text-brand border-brand-100'
                                    : 'bg-n50 text-n600 border-n200 hover:bg-n100'
                            }`}
                        >
                            <Wrench className="w-[13px] h-[13px]" /> Bakım
                        </button>
                    )}
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }))}
                        className="flex items-center gap-1.5 text-[12px] font-medium text-n600 bg-n50 border border-n200 hover:bg-n100 rounded-md px-[11px] py-1.5"
                        title="Detay görünümü — CV yükleme, sistem taraması ve aday profilleri"
                    >
                        <Users className="w-[13px] h-[13px]" /> Detay &amp; yükleme
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={exporting || sortedRows.length === 0}
                        className="flex items-center gap-1.5 text-[13px] font-semibold text-white bg-brand hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-md px-[13px] py-[7px]"
                    >
                        <Download className="w-3.5 h-3.5" />
                        {exporting ? 'Hazırlanıyor…' : "Excel'e aktar"}
                    </button>
                </div>
            </header>

            {/* ── Maintenance panel (toggle) ───────────────────────────────── */}
            {canMaintain && showMaintenance && (
                <div className="px-6 pt-4">
                    <MaintenancePanel />
                </div>
            )}

            {/* ── Filter bar ───────────────────────────────────────────────── */}
            <div className="px-6 pt-4">
                <div className="bg-n0 rounded-md border border-n200 shadow-sm p-3 flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="w-3.5 h-3.5 text-n400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="İsim, e-posta, yetenek ara..."
                            value={filters.search}
                            onChange={(e) => setFilter('search', e.target.value)}
                            className="pl-8 pr-3 py-1.5 text-[11px] border border-n200 rounded-md bg-n0 focus:outline-none focus:border-brand w-52"
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
                    {/* KAPSAM yalnızca bir ilan seçiliyken görünür — tek başına
                        anlamı yok. "Pozisyon" adında bir filtrenin filtrelemesi
                        beklenir; havuzu sıralamak AYRI bir iş ve açıkça
                        seçilmeli. */}
                    {filters.position !== 'all' && (
                        <select
                            value={filters.positionScope}
                            onChange={(e) => setFilter('positionScope', e.target.value)}
                            className={SELECT_CLS}
                            title="Bu ilana atanmış adaylar mı, yoksa tüm havuz bu ilana göre sıralansın mı"
                        >
                            <option value="assigned">Bu ilana atananlar</option>
                            <option value="pool">Tüm havuzu bu ilana göre sırala</option>
                        </select>
                    )}
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
                    {/* Sektör uyumu. "Ölçülemedi" AYRI bir seçenek: taraması
                        yapılmamış adayı "sektör dışı" saymak, bakmadığımız
                        şeyi olumsuz sonuç gibi göstermek olurdu. */}
                    <select value={filters.sector} onChange={(e) => setFilter('sector', e.target.value)} className={SELECT_CLS} title="Kurumun hedef sektörüne göre aday deneyimi">
                        <option value="all">Sektör: Tümü</option>
                        <option value="match">Aynı sektör</option>
                        <option value="near_or_match">Aynı ya da komşu sektör</option>
                        <option value="near">Yalnızca komşu sektör</option>
                        <option value="outside">Sektör dışı</option>
                        <option value="unmeasured">Sektör ölçülemedi</option>
                    </select>
                    <select value={filters.verification} onChange={(e) => setFilter('verification', e.target.value)} className={SELECT_CLS} title="CV doğrulama bulguları">
                        <option value="all">Doğrulama: Tümü</option>
                        <option value="contradiction">Çelişkili</option>
                        <option value="attention">Dikkat gerektiren</option>
                        <option value="clean">Temiz (taranmış)</option>
                        <option value="unverified">Doğrulanmamış</option>
                    </select>
                    <select value={filters.location} onChange={(e) => setFilter('location', e.target.value)} className={SELECT_CLS} title="CV'den okunan konum bilgisi">
                        <option value="all">Konum: Tümü</option>
                        <option value="istanbul">İstanbul içi</option>
                        <option value="outside">İstanbul dışı</option>
                        <option value="unknown">Konum bilinmiyor</option>
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
                        <span className="text-n300 text-[11px]">–</span>
                        <input type="date" value={filters.dateTo} onChange={(e) => setFilter('dateTo', e.target.value)} className={SELECT_CLS} title="Başvuru tarihi (bitiş)" />
                    </div>
                    {hasActiveFilters && (
                        <button
                            onClick={clearFilters}
                            className="flex items-center gap-1 text-[12px] font-semibold text-bad hover:text-bad bg-bad-bg hover:opacity-90 px-2.5 py-1.5 rounded-md transition-colors"
                        >
                            <FilterX className="w-3.5 h-3.5" /> Temizle
                        </button>
                    )}
                </div>

                {/* AÇIK FİLTRE ÇİPLERİ.
                    Çubukta on bir kontrol var ve satır kaydırıyor; kullanıcı
                    "liste neden bu kadar kısa" sorusunun cevabını görmek için her
                    açılır listeyi tek tek kontrol etmek zorunda kalıyordu. Canlıda
                    yaşandı: yeni eklenen sektör filtresi kullanıcının gözünden
                    kaçtı. Çipler açık olanı görünür yapar ve tek tıkla kapattırır. */}
                {activeFilterChips.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2 px-1">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-n400 mr-0.5">
                            Aktif filtreler
                        </span>
                        {activeFilterChips.map((chip) => (
                            <button
                                key={chip.key}
                                onClick={() => clearFilter(chip.key)}
                                title={`${chip.label} filtresini kaldır`}
                                className="group inline-flex items-center gap-1.5 text-[11px] bg-brand-50 hover:bg-brand-100 text-brand border border-brand-100 rounded-md pl-2 pr-1.5 py-1 transition-colors"
                            >
                                <span className="font-semibold opacity-60">{chip.label}:</span>
                                <span className="font-semibold">{chip.value}</span>
                                <X className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* AYNI CETVEL UYARISI.
                Kullanıcı iki sayıyı karşılaştırırken ikisinin aynı şeyi
                ölçtüğünü varsayıyor. Ölçmüyorlarsa bunu SÖYLEMEK ve
                düzeltmeyi tek tık uzağa koymak gerekiyor. */}
            {selectedPosition && unalignedRows.length > 0 && !scanProgress && (
                <div className="px-6 pt-3">
                    <div className="flex items-center gap-2 flex-wrap text-[12px] bg-warn-bg border border-warn rounded-md px-4 py-2.5">
                        <AlertCircle className="w-3.5 h-3.5 text-warn shrink-0" />
                        <span className="text-n700">
                            <strong>{unalignedRows.length} aday</strong> bu ilana göre derin analiz edilmemiş; skorları
                            anahtar kelime ya da başka bir pozisyonun analizinden geliyor ve
                            diğerleriyle doğrudan karşılaştırılamaz.
                            {selectedIds.size > 0 && (
                                <> Seçiminizde bunlardan <strong>{alignTargets.length}</strong> tanesi var.</>
                            )}
                            {selectedIds.size === 0 && unalignedRows.length > MAX_ALIGN && (
                                <> Tek turda en fazla <strong>{MAX_ALIGN}</strong> tanesi taranır —
                                aday seçerek daraltabilirsiniz.</>
                            )}
                        </span>
                        <button
                            onClick={handleAlignToPosition}
                            disabled={bulkApplying || alignTargets.length === 0}
                            className="ml-auto flex items-center gap-1.5 text-[12px] font-semibold text-white bg-warn hover:opacity-90 px-3 py-1.5 rounded-md disabled:opacity-50 transition-colors"
                        >
                            <Brain className="w-3.5 h-3.5" />
                            {selectedIds.size > 0
                                ? `Seçili ${alignTargets.length} adayı hizala`
                                : 'Aynı cetvele getir'}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Toplu işlem çubuğu / sonuç bildirimi ─────────────────────── */}
            {(selectedIds.size > 0 || bulkResult) && (
                <div className="px-6 pt-3">
                    {selectedIds.size > 0 ? (
                        <div className="flex items-center justify-between gap-2 flex-wrap bg-brand text-white rounded-md px-4 py-2.5 shadow-sm">
                            <span className="text-[11px] font-semibold">
                                {scanProgress
                                    ? `Otonom tarama: ${scanProgress.done} / ${scanProgress.total} aday…`
                                    : `${selectedIds.size} aday seçildi`}
                            </span>
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={handleBulkScan}
                                    disabled={Boolean(scanProgress)}
                                    title="Seçililerden henüz taranmamış olanlar için derin AI analizi çalıştırır"
                                    className="flex items-center gap-1.5 text-[12px] font-semibold bg-brand/80 hover:bg-brand disabled:opacity-60 px-3 py-1.5 rounded-md transition-colors"
                                >
                                    {scanProgress ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                                    Otonom Tarama
                                </button>
                                <button
                                    onClick={() => setEvalModalOpen(true)}
                                    disabled={Boolean(scanProgress)}
                                    title="Seçili adayları uyum analizi ve detay linkleriyle iş arkadaşlarınıza e-postalayın (kendi hesabınızdan)"
                                    className="flex items-center gap-1.5 text-[12px] font-semibold bg-ok/80 hover:bg-ok disabled:opacity-60 px-3 py-1.5 rounded-md transition-colors"
                                >
                                    <Mail className="w-3.5 h-3.5" /> Değerlendirmeye Gönder
                                </button>
                                <button
                                    onClick={() => openBulkModal('stage')}
                                    disabled={Boolean(scanProgress)}
                                    className="flex items-center gap-1.5 text-[12px] font-semibold bg-n0/10 hover:bg-n0/20 disabled:opacity-50 px-3 py-1.5 rounded-md transition-colors"
                                >
                                    <Layers className="w-3.5 h-3.5" /> Aşama Değiştir
                                </button>
                                <button
                                    onClick={() => openBulkModal('source')}
                                    disabled={Boolean(scanProgress)}
                                    className="flex items-center gap-1.5 text-[12px] font-semibold bg-n0/10 hover:bg-n0/20 disabled:opacity-50 px-3 py-1.5 rounded-md transition-colors"
                                >
                                    <Share2 className="w-3.5 h-3.5" /> Kaynak Değiştir
                                </button>
                                <button
                                    onClick={() => openBulkModal('department')}
                                    disabled={Boolean(scanProgress)}
                                    className="flex items-center gap-1.5 text-[12px] font-semibold bg-n0/10 hover:bg-n0/20 disabled:opacity-50 px-3 py-1.5 rounded-md transition-colors"
                                >
                                    <Building2 className="w-3.5 h-3.5" /> Departmana Aç
                                </button>
                                <button
                                    onClick={() => setSelectedIds(new Set())}
                                    disabled={Boolean(scanProgress)}
                                    className="flex items-center gap-1.5 text-[11px] font-semibold text-white/70 hover:text-white disabled:opacity-50 px-2 py-1.5 transition-colors"
                                >
                                    <X className="w-3.5 h-3.5" /> Seçimi Temizle
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className={`flex items-center gap-2 text-[12px] font-semibold rounded-md px-4 py-2.5 border ${bulkResult.failed > 0 ? 'text-warn bg-warn-bg border-transparent' : 'text-ok bg-ok-bg border-transparent'}`}>
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            {bulkResult.message}{bulkResult.failed > 0 ? `, ${bulkResult.failed} güncelleme başarısız` : ''}.
                            <button onClick={() => setBulkResult(null)} className="ml-auto text-n400 hover:text-n600"><X className="w-3.5 h-3.5" /></button>
                        </div>
                    )}
                </div>
            )}

            {/* ── Table ────────────────────────────────────────────────────── */}
            <div className="flex-1 px-6 py-3">
                <div className="bg-n0 rounded-md border border-n200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11px]" aria-busy={loading}>
                            <thead className="bg-n50 border-b border-n200">
                                <tr>
                                    <th className="px-3 py-2.5 w-9">
                                        <button
                                            onClick={toggleAllFiltered}
                                            title={allFilteredSelected ? 'Seçimi kaldır' : 'Filtrelenen tüm adayları seç'}
                                            className="text-n400 hover:text-n700 transition-colors flex items-center"
                                        >
                                            {allFilteredSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                        </button>
                                    </th>
                                    <SortableHeader label="Aday" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    <SortableHeader label="Pozisyon" sortKey="position" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    <SortableHeader label="CV'ye Göre" sortKey="cvRole" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    <SortableHeader label="Departman" sortKey="department" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    <SortableHeader label="Konum" sortKey="location" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    <SortableHeader label="Aşama" sortKey="stage" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    <SortableHeader label="Kaynak" sortKey="source" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    <SortableHeader label="Tarama" sortKey="scanStatus" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="center" />
                                    <SortableHeader label="Doğrulama" sortKey="verification" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
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
                                {/* YÜKLEME: TEK SATIRLIK YAZI DEĞİL, İSKELET SATIRLAR.
                                    Önceki hâl ortalanmış bir "Adaylar yükleniyor…"
                                    yazısıydı: tablo tek satıra iniyor, veri gelince
                                    birden 50 satıra çıkıyordu — sayfa zıplıyordu.
                                    İskelet satırlar gerçek satırla aynı yüksekliği
                                    kapladığı için yer önceden ayrılıyor.

                                    Ekran okuyucu için ayrıca `aria-busy` ve gizli
                                    bir durum metni var: iskelet görsel bir ipucu,
                                    okuyucuya hiçbir şey söylemez. */}
                                {loading && (
                                    <>
                                        <tr className="sr-only">
                                            <td colSpan={selectedPosition ? 16 : 15} role="status">
                                                Adaylar yükleniyor…
                                            </td>
                                        </tr>
                                        {Array.from({ length: 8 }).map((_, satir) => (
                                            <tr key={`iskelet-${satir}`} className="border-b border-n100" aria-hidden="true">
                                                {Array.from({ length: selectedPosition ? 16 : 15 }).map((_, sutun) => (
                                                    <td key={sutun} className="px-3 py-2.5">
                                                        <div
                                                            className="skeleton h-3 rounded"
                                                            style={{ width: sutun === 1 ? '75%' : sutun === 2 ? '60%' : '42%' }}
                                                        />
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </>
                                )}
                                {!loading && pageRows.length === 0 && (
                                    <tr>
                                        <td colSpan={selectedPosition ? 16 : 15} className="px-4 py-12 text-center">
                                            <p className="text-n400 text-[11px] font-semibold">
                                                {hasActiveFilters ? 'Filtrelere uyan aday bulunamadı.' : 'Henüz aday yok.'}
                                            </p>
                                            {hasActiveFilters && (
                                                <button onClick={clearFilters} className="mt-2 text-[11px] font-semibold text-brand hover:underline">
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
                                        className={`border-b border-n100 last:border-0 hover:bg-n25 cursor-pointer ${selectedIds.has(c.id) ? 'bg-brand-50' : ''}`}
                                    >
                                        <td className="px-3 py-2.5" onClick={(e) => { e.stopPropagation(); toggleRow(c.id); }}>
                                            <button className="text-n400 hover:text-n700 transition-colors flex items-center" aria-label="Adayı seç">
                                                {selectedIds.has(c.id) ? <CheckSquare className="w-4 h-4 text-brand" /> : <Square className="w-4 h-4" />}
                                            </button>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <p className="font-semibold text-n900 whitespace-nowrap">{c.name || 'İsimsiz'}</p>
                                            <p className="text-[10px] text-n400 whitespace-nowrap">{c.email || '—'}</p>
                                        </td>
                                        {/* Serbest metin kolonları genişlik sınırlı: AI'nın ürettiği
                                            uzun rol adları tabloyu yatayda taşırıyordu — kesilen
                                            metnin tamamı tooltip'te. */}
                                        <td className="px-3 py-2.5 text-n600">
                                            {c.matchedPositionTitle === null
                                                ? <p className="italic text-warn font-semibold truncate max-w-[180px]">Uygun açık pozisyon yok</p>
                                                : <p className="truncate max-w-[180px]" title={c.bestTitle || c.position || ''}>{c.bestTitle || c.position || '—'}</p>}
                                        </td>
                                        {/* CV'ye göre ideal rol — açık pozisyon eşleşmesinden AYRI kolon */}
                                        <td className="px-3 py-2.5 text-n500">
                                            <p className="truncate max-w-[160px]" title={cleanRoleText(c.suggestedRole, c.position || '')}>{cleanRoleText(c.suggestedRole, c.position || '') || '—'}</p>
                                        </td>
                                        <td className="px-3 py-2.5 text-n600">
                                            <p className="truncate max-w-[120px]" title={c.department || ''}>{c.department || '—'}</p>
                                        </td>
                                        {/* Konum: CV'den okunur. İstanbul içi/dışı ayrımı üstteki
                                            filtreyle yapılır; burada ham metin gösterilir. */}
                                        <td className="px-3 py-2.5 text-n600">
                                            {c.location
                                                ? <p className={`truncate max-w-[130px] ${isIstanbulLocation(c.location) ? '' : 'text-warn'}`} title={c.location}>{c.location}</p>
                                                : <span className="text-n300">—</span>}
                                        </td>
                                        <td className="px-3 py-2.5"><StageChip status={c.status} /></td>
                                        <td className="px-3 py-2.5 text-n500 whitespace-nowrap">{c.source || '—'}</td>
                                        <td className="px-3 py-2.5 text-center">
                                            {isDeepScanned(c) ? (
                                                <span
                                                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full text-ok bg-ok-bg border border-transparent whitespace-nowrap"
                                                    title={c.lastScannedAt ? `Son tarama: ${new Date(c.lastScannedAt).toLocaleString('tr-TR')}` : 'Otonom tarama yapıldı'}
                                                >
                                                    <Brain className="w-3 h-3" /> Tarandı
                                                </span>
                                            ) : (
                                                <span
                                                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full text-warn bg-warn-bg border border-transparent whitespace-nowrap"
                                                    title="Henüz otonom tarama yapılmadı — seçip 'Otonom Tarama' ile başlatabilirsiniz"
                                                >
                                                    Taranmadı
                                                </span>
                                            )}
                                        </td>
                                        {/* Doğrulama kolonu. Boş bir kolon "bozuk" görünür; bu
                                            yüzden bulgu yoksa da bir şey söylüyoruz — ama
                                            "temiz" YALNIZCA taraması yapılmış adaylar için.
                                            Taranmamış adayı temiz saymak, bakmadığımız şeyi
                                            onaylamak olurdu. */}
                                        <td className="px-3 py-2.5">
                                            {c.badges?.length > 0 ? (
                                                <CandidateBadges badges={c.badges} />
                                            ) : c.verification?.at ? (
                                                <span className="text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-ok-bg text-ok border-transparent whitespace-nowrap" title="Doğrulama çalıştırıldı, bulgu çıkmadı">
                                                    Temiz
                                                </span>
                                            ) : (
                                                <span className="text-n300" title="Bu aday için doğrulama henüz çalıştırılmadı">—</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5 text-center"><ScoreCell value={c.bestScore} method={c.scoreMethod} /></td>
                                        {selectedPosition && (
                                            <td className="px-3 py-2.5 text-center"><ScoreCell value={c.positionScore} gate={c.positionGate} interviewed={c.positionInterviewed} method={c.positionScoreMethod} /></td>
                                        )}
                                        <td className="px-3 py-2.5 text-center"><ScoreCell value={c.interviewScore} /></td>
                                        <td className="px-3 py-2.5 text-center"><ScoreCell value={c.combinedScore} /></td>
                                        <td className="px-3 py-2.5 text-center text-n600">
                                            {c.experience != null && c.experience !== '' ? `${c.experience} yıl` : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-n500 whitespace-nowrap">{getAppliedDate(c) || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* ── Pagination ───────────────────────────────────────── */}
                    {sortedRows.length > PAGE_SIZE && (
                        <div className="flex items-center justify-between px-4 py-2.5 border-t border-n200 bg-n50/50">
                            <span className="text-[11px] text-n400 font-semibold">
                                {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, sortedRows.length)} / {sortedRows.length}
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                                    disabled={safePage === 0}
                                    className="w-7 h-7 rounded-md border border-n200 bg-n0 flex items-center justify-center text-n500 hover:text-n900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    aria-label="Önceki sayfa"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-[11px] font-semibold text-n600 px-2">
                                    {safePage + 1} / {pageCount}
                                </span>
                                <button
                                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                                    disabled={safePage >= pageCount - 1}
                                    className="w-7 h-7 rounded-md border border-n200 bg-n0 flex items-center justify-center text-n500 hover:text-n900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
