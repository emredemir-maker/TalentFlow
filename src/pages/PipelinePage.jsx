import { useMemo, useState, useEffect } from 'react';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
    Users, Calendar, Clock, Star, Search,
    List, LayoutGrid, ArrowUpRight, ChevronRight, MousePointerClick, Upload, X,
} from 'lucide-react';
import { STAGES as STAGE_DEFS } from '../utils/pipelineStages';
import { withCoherentScores } from '../utils/candidateTable';
import { calculateMatchScore } from '../services/matchService';

function resolveStage(status) {
    if (!status) return 'ai_analysis';
    for (const s of STAGE_DEFS) {
        if (s.key === status || s.legacy.includes(status)) return s.key;
    }
    return 'ai_analysis';
}

/**
 * Bir sonraki aşama — CandidateDrawer'daki STATUS_CONFIG.next zincirinin
 * aynısı (ai_analysis → review → interview → offer → hired).
 *
 * STAGES sırasından türetiliyor ama SON İKİ girdi hariç tutuluyor: listedeki
 * son eleman "Reddedildi" ve onu "sonraki aşama" saymak, ilerlet düğmesine
 * basan kullanıcıyı adayı reddetmeye götürürdü.
 */
function nextStageKey(stageKey) {
    const advanceable = STAGE_DEFS.filter(s => s.key !== 'rejected');
    const i = advanceable.findIndex(s => s.key === stageKey);
    if (i < 0 || i >= advanceable.length - 1) return null;
    return advanceable[i + 1].key;
}

function initials(name = '') {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

/** Prototip skor eşikleri: ≥85 yeşil, ≥70 marka mavisi, altı amber. */
function scoreTone(score) {
    if (score >= 85) return { fg: '#16A26C', bg: '#E6F7EF' };
    if (score >= 70) return { fg: '#5068FF', bg: '#EEF1FF' };
    return { fg: '#E8A13B', bg: '#FDF4E4' };
}

/** Kartta ve rayda gösterilen skor — havuzla aynı kaynak (CV uyumu). */
function cardScore(candidate) {
    return Math.round(Number(candidate.bestScore || candidate.matchScore || candidate.initialAiScore) || 0);
}

function ScoreBadge({ score }) {
    if (!score) return null;
    const tone = scoreTone(score);
    return (
        <span
            style={{ color: tone.fg, background: tone.bg }}
            className="text-[11px] font-semibold px-1.5 rounded-full shrink-0"
        >
            %{score}
        </span>
    );
}

// ── Kanban ────────────────────────────────────────────────────────────────────
function CandidateCard({ candidate, stageColor, selected, onSelect }) {
    const score = cardScore(candidate);
    return (
        <button
            onClick={onSelect}
            className="w-full text-left bg-n0 rounded-[10px] border p-2.5 shadow-sm hover:border-n300 transition-colors"
            style={{ borderColor: selected ? '#5068FF' : '#E2E5EE' }}
        >
            <div className="flex items-start gap-2.5">
                <div
                    className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                    style={{ background: stageColor }}
                >
                    {initials(candidate.name)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold truncate">{candidate.name || 'İsimsiz'}</span>
                        <span className="ml-auto"><ScoreBadge score={score} /></span>
                    </div>
                    <div className="text-[10px] text-n500 mt-0.5 truncate">
                        {candidate.position || candidate.matchedPositionTitle || '—'}
                    </div>
                    {candidate.source && <div className="text-[10px] text-n400 mt-[3px] truncate">{candidate.source}</div>}
                </div>
            </div>
        </button>
    );
}

function KanbanColumn({ stage, candidates, selectedId, onSelectCandidate }) {
    return (
        <div className="flex flex-col gap-2 min-w-[180px]">
            <div
                className="flex items-center justify-between px-[11px] py-[7px] rounded-md"
                style={{ background: stage.bg, border: `1px solid ${stage.border}` }}
            >
                <div className="flex items-center gap-1.5">
                    <span className="w-[7px] h-[7px] rounded-full" style={{ background: stage.color }} />
                    <span className="text-[11px] font-semibold" style={{ color: stage.color }}>{stage.label}</span>
                </div>
                <span className="text-[11px] font-semibold text-n500">{candidates.length}</span>
            </div>
            <div className="flex flex-col gap-2">
                {candidates.length === 0
                    ? <div className="h-14 rounded-[10px] border border-dashed border-n200 flex items-center justify-center text-[10px] text-n400">Aday yok</div>
                    : candidates.map(c => (
                        <CandidateCard
                            key={c.id}
                            candidate={c}
                            stageColor={stage.color}
                            selected={selectedId === c.id}
                            onSelect={() => onSelectCandidate(c.id)}
                        />
                    ))
                }
            </div>
        </div>
    );
}

// ── Interviews ────────────────────────────────────────────────────────────────
const SESSION_STATUS_MAP = {
    live:      { label: 'Canlı',      bg: '#FCEAEB', color: '#E5484D', pulse: true  },
    pending:   { label: 'Bekliyor',   bg: '#E8F1FD', color: '#3E8AEA', pulse: false },
    completed: { label: 'Tamamlandı', bg: '#E6F7EF', color: '#16A26C', pulse: false },
    cancelled: { label: 'İptal',      bg: '#F6F7FB', color: '#6B7384', pulse: false },
};

function StatusBadge({ status }) {
    const cfg = SESSION_STATUS_MAP[status] || { label: status || '?', bg: '#F6F7FB', color: '#6B7384', pulse: false };
    return (
        <span style={{ background: cfg.bg, color: cfg.color }}
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
            {cfg.pulse && <span className="w-1.5 h-1.5 rounded-full bg-bad animate-pulse" />}
            {cfg.label}
        </span>
    );
}

const TYPE_MAP = { technical: 'Teknik', hr: 'İK', product: 'Ürün', cultural: 'Kültür', behavioral: 'Davranışsal' };


// ── Liste görünümü ────────────────────────────────────────────────────────────
/**
 * Kanban'ın düz tablo karşılığı.
 *
 * Pano, adayın hangi aşamada olduğunu bir bakışta gösteriyor ama çok adayda
 * karşılaştırma zorlaşıyor: skorlar altı ayrı sütuna dağılıyor ve kaynak hiç
 * görünmüyor. Liste aynı veriyi tek eksende sıralıyor.
 *
 * SATIR TIKLAMASI panodakiyle AYNI davranıyor: adayı seçer, sağ ray dolar.
 * Aday detayına gitmek ayrı bir eylem ("Aç") — yoksa sağ raydaki aşama
 * ilerletme, mülakat planlama gibi işlere hiç ulaşılamazdı.
 */
function CandidateListView({ rows, selectedId, onSelect, onOpen }) {
    if (rows.length === 0) {
        return (
            <div className="border border-dashed border-n300 rounded-[10px] px-[18px] py-7 text-center">
                <div className="text-[12px] font-semibold mb-1">Aday bulunamadı</div>
                <p className="text-[11px] text-n500 m-0">Arama kutusunu temizleyerek tüm adayları görebilirsiniz.</p>
            </div>
        );
    }
    const KOLON = 'grid grid-cols-[1.5fr_110px_60px] md:grid-cols-[1.6fr_1.3fr_128px_136px_120px_64px] items-center gap-2';
    return (
        <div className="bg-n0 border border-n200 rounded-[10px] overflow-hidden">
            <div className={`${KOLON} px-3 py-2 bg-n25 border-b border-n200 text-[10px] font-semibold text-n400 uppercase tracking-[0.08em]`}>
                <span>Aday</span>
                <span className="hidden md:block">Pozisyon</span>
                <span className="hidden md:block">CV uyumu</span>
                <span>Aşama</span>
                <span className="hidden md:block">Kaynak</span>
                <span className="text-right">İşlem</span>
            </div>
            {rows.map((c) => {
                const stage = STAGE_DEFS.find((x) => x.key === resolveStage(c.status)) || STAGE_DEFS[0];
                const score = cardScore(c);
                const tone = scoreTone(score);
                const secili = selectedId === c.id;
                return (
                    <div
                        key={c.id}
                        onClick={() => onSelect(c.id)}
                        className={`${KOLON} px-3 py-[7px] border-b border-n100 last:border-b-0 cursor-pointer text-[11px] ${
                            secili ? 'bg-brand-50' : 'hover:bg-n50'
                        }`}
                    >
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="w-[22px] h-[22px] flex-none rounded-full bg-n50 border border-n200 flex items-center justify-center text-[9px] font-semibold text-n600">
                                {initials(c.name)}
                            </div>
                            <span className={`truncate font-medium ${secili ? 'text-brand' : 'text-n900'}`}>
                                {c.name || 'İsimsiz'}
                            </span>
                        </div>

                        <span className="hidden md:block truncate text-n600">
                            {c.matchedPositionTitle || c.position || '—'}
                        </span>

                        <div className="hidden md:flex items-center gap-2">
                            <div className="flex-1 h-[4px] bg-n100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(score, 100)}%`, background: tone.fg }} />
                            </div>
                            <span className="font-semibold shrink-0" style={{ color: tone.fg }}>
                                {score ? `%${score}` : '—'}
                            </span>
                        </div>

                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: stage.color }} />
                            <span
                                style={{ background: stage.bg, color: stage.color }}
                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full truncate"
                            >
                                {stage.label}
                            </span>
                        </div>

                        <span className="hidden md:block truncate text-n500">
                            {c.source ? (c.sourceDetail ? `${c.source} (${c.sourceDetail})` : c.source) : 'Manuel'}
                        </span>

                        <div className="flex justify-end">
                            <button
                                onClick={(e) => { e.stopPropagation(); onOpen(c.id); }}
                                title="Aday detayını aç"
                                className="flex items-center gap-0.5 text-[11px] font-semibold text-brand hover:text-brand-600"
                            >
                                Aç <ChevronRight className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/**
 * Görünüm tercihi SUNUCUYA YAZILMAZ.
 *
 * Kanban mı liste mi — bu bir kullanıcı tercihi değil, o andaki bakış açısı.
 * Firestore'a yazmak her geçişte bir yazma işlemi demek olurdu ve tercih
 * cihazlar arasında taşınsın diye bir gerekçe yok. localStorage yeterli;
 * erişilemediği ortamlarda (gizli sekme, kısıtlı depolama) sessizce
 * varsayılana düşer.
 */
const GORUNUM_ANAHTARI = 'tf-pipeline-gorunum';
const gorunumOku = () => {
    try {
        return localStorage.getItem(GORUNUM_ANAHTARI) === 'list' ? 'list' : 'kanban';
    } catch {
        return 'kanban';
    }
};
const gorunumYaz = (v) => {
    try {
        localStorage.setItem(GORUNUM_ANAHTARI, v);
    } catch {
        /* depolama yok — tercih yalnızca bu oturumda geçerli */
    }
};

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PipelinePage() {
    const { enrichedCandidates, updateCandidate, setViewCandidateId } = useCandidates();
    const { positions } = usePositions();
    const openPositions = useMemo(() => positions.filter(p => p.status === 'open'), [positions]);

    /**
     * Kart skorları Kontrol Paneli havuzu ve Aday Detayı ile AYNI cetvelden
     * gelmek zorunda.
     *
     * Ham `candidates` listesinde bestScore alanı hiç yok; enrichedCandidates
     * onu ekliyor ama TÜM pozisyon analizlerinin maksimumu olarak. Aday Detayı
     * ise adayın atandığı pozisyonun skorunu gösteriyor. `withCoherentScores`
     * bu farkı kapatıyor — Adaylar tablosu ve Kontrol Paneli ile birebir aynı
     * çağrı.
     */
    const candidates = useMemo(
        () => withCoherentScores(enrichedCandidates || [], openPositions, (c, p) => calculateMatchScore(c, p).score),
        [enrichedCandidates, openPositions]
    );
    const [tab, setTab] = useState('kanban'); // 'kanban' | 'interviews'
    // Kanban sekmesi içindeki görünüm: pano mu düz liste mi.
    // `tab`'dan AYRI bir eksen — "Mülakatlar" sekmesi bu tercihi etkilemez ve
    // mülakatlardan dönünce kullanıcı bıraktığı görünümde bulur kendini.
    const [viewMode, setViewMode] = useState(gorunumOku);
    const setGorunum = (v) => { setViewMode(v); gorunumYaz(v); };
    const [search, setSearch] = useState('');
    const [ivFilter, setIvFilter] = useState('all');
    // Seçili aday sağ rayı besliyor. Kart tıklaması artık sayfadan ayrılmıyor;
    // eski davranış (aday detayına git) rayda "Aday detayını aç" olarak duruyor.
    const [selectedId, setSelectedId] = useState(null);

    // Live session statuses from root `interviews` collection
    const [sessionStatuses, setSessionStatuses] = useState({});
    useEffect(() => {
        const unsub = onSnapshot(
            collection(db, 'interviews'),
            snap => {
                const map = {};
                snap.forEach(d => { map[d.id] = d.data().status; });
                setSessionStatuses(map);
            },
            err => console.warn('[PipelinePage] interviews listener:', err)
        );
        return () => unsub();
    }, []);

    /**
     * ARAMA SÜZGECİ İKİ GÖRÜNÜM İÇİN ORTAK.
     *
     * Süzgeç eskiden kanban gruplamasının içinde duruyordu. Liste görünümü
     * kendi süzgecini kursaydı, aynı arama iki görünümde farklı sonuç
     * verebilirdi — ve görünüm değiştiren kullanıcı aramasını kaybederdi.
     */
    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        if (!q) return candidates;
        return candidates.filter(c =>
            c.name?.toLowerCase().includes(q) ||
            c.position?.toLowerCase().includes(q) ||
            c.email?.toLowerCase().includes(q));
    }, [candidates, search]);

    // ── Kanban: group candidates by stage ─────────────────────────────────────
    const kanbanData = useMemo(() => {
        const groups = Object.fromEntries(STAGE_DEFS.map(s => [s.key, []]));
        for (const c of filtered) groups[resolveStage(c.status)].push(c);
        return groups;
    }, [filtered]);

    /** Liste görünümü — kanbanla aynı süzgeç, aşamaya göre sıralı. */
    const listRows = useMemo(() => {
        const sira = Object.fromEntries(STAGE_DEFS.map((s, i) => [s.key, i]));
        return [...filtered].sort((a, b) => {
            const fa = sira[resolveStage(a.status)] ?? 99;
            const fb = sira[resolveStage(b.status)] ?? 99;
            if (fa !== fb) return fa - fb;
            return cardScore(b) - cardScore(a);
        });
    }, [filtered]);

    // ── Interviews: flatten all sessions from candidates ──────────────────────
    const allInterviews = useMemo(() => {
        const rows = [];
        for (const c of candidates) {
            for (const s of (c.interviewSessions || [])) {
                // Overlay live status from root `interviews` doc
                const liveStatus = sessionStatuses[s.id];
                rows.push({
                    ...s,
                    status: liveStatus || s.status || 'pending',
                    candidateName: c.name || 'İsimsiz',
                    candidateId: c.id,
                    position: c.position || c.matchedPositionTitle || '—',
                });
            }
        }
        rows.sort((a, b) => {
            if (a.status === 'live' && b.status !== 'live') return -1;
            if (b.status === 'live' && a.status !== 'live') return 1;
            return (b.date || '').localeCompare(a.date || '');
        });
        return rows;
    }, [candidates, sessionStatuses]);

    const visibleInterviews = useMemo(() => {
        if (ivFilter === 'upcoming') return allInterviews.filter(s => s.status === 'live' || s.status === 'pending');
        if (ivFilter === 'completed') return allInterviews.filter(s => s.status === 'completed' || s.status === 'cancelled');
        return allInterviews;
    }, [allInterviews, ivFilter]);

    const totalCandidates = candidates.length;
    const selected = useMemo(
        () => candidates.find(c => c.id === selectedId) || null,
        [candidates, selectedId]
    );
    const selectedStage = selected ? STAGE_DEFS.find(s => s.key === resolveStage(selected.status)) : null;
    const nextKey = selectedStage ? nextStageKey(selectedStage.key) : null;
    const nextStage = nextKey ? STAGE_DEFS.find(s => s.key === nextKey) : null;

    const openCandidateDetail = (id) => {
        setViewCandidateId(id);
        window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }));
    };

    return (
        <div className="infoset flex flex-col min-h-screen bg-n25">
            {/* ── Başlık (56px) ────────────────────────────────────────────── */}
            <header className="h-14 bg-n0 border-b border-n200 px-[18px] flex items-center gap-3.5 sticky top-0 z-20">
                <div>
                    <h1 className="text-[15px] font-semibold tracking-[-0.02em] m-0">Aday Pipeline</h1>
                    <span className="text-[10px] text-n400">
                        {totalCandidates} aday · {allInterviews.length} mülakat
                    </span>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    {tab === 'kanban' && (
                        <div className="relative hidden md:block">
                            <Search className="w-3.5 h-3.5 text-n400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Aday ara..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-8 pr-3 py-1.5 text-[11px] border border-n200 rounded-md bg-n0 focus:outline-none focus:border-brand w-44"
                            />
                        </div>
                    )}
                    {/* İKİ KONUMLU ANAHTAR — Kanban | Liste.
                        Yalnızca kanban sekmesinde anlamlı; "Mülakatlar"
                        açıkken gizleniyor ki hangi görünümü değiştirdiği
                        belirsiz kalmasın. */}
                    {tab === 'kanban' && (
                        <div className="flex items-center bg-n50 border border-n200 rounded-md p-0.5">
                            {[
                                { id: 'kanban', label: 'Kanban', Icon: LayoutGrid },
                                { id: 'list', label: 'Liste', Icon: List },
                            ].map(({ id, label, Icon }) => (
                                <button
                                    key={id}
                                    onClick={() => setGorunum(id)}
                                    aria-pressed={viewMode === id}
                                    className={`flex items-center gap-1.5 text-[12px] font-medium rounded-[5px] px-2.5 py-1 transition-colors ${
                                        viewMode === id
                                            ? 'bg-n0 text-brand shadow-sm'
                                            : 'text-n500 hover:text-n700'
                                    }`}
                                >
                                    <Icon className="w-[13px] h-[13px]" /> {label}
                                </button>
                            ))}
                        </div>
                    )}
                    <button
                        onClick={() => setTab(tab === 'interviews' ? 'kanban' : 'interviews')}
                        className={`flex items-center gap-1.5 text-[12px] font-medium border rounded-md px-[11px] py-1.5 ${
                            tab === 'interviews'
                                ? 'bg-brand-50 text-brand border-brand-100'
                                : 'bg-n50 text-n600 border-n200 hover:bg-n100'
                        }`}
                    >
                        <List className="w-[13px] h-[13px]" /> Mülakatlar
                        {allInterviews.length > 0 && (
                            <span className="text-[10px] font-semibold text-n400">{allInterviews.length}</span>
                        )}
                    </button>
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }))}
                        className="flex items-center gap-1.5 text-[12px] font-medium text-n600 bg-n50 border border-n200 hover:bg-n100 rounded-md px-[11px] py-1.5"
                    >
                        <Users className="w-[13px] h-[13px]" /> Aday listesi
                    </button>
                    <button
                        onClick={() => {
                            window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }));
                            setTimeout(() => window.dispatchEvent(new CustomEvent('openAddCandidate')), 80);
                        }}
                        className="flex items-center gap-1.5 text-[13px] font-semibold text-white bg-brand hover:bg-brand-600 rounded-md px-[13px] py-[7px]"
                    >
                        <Upload className="w-3.5 h-3.5" /> Aday ekle
                    </button>
                </div>
            </header>

            {/* ── Kanban + seçim rayı ──────────────────────────────────────── */}
            {tab === 'kanban' && (
                <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] items-start">
                    <div className="px-[18px] py-2.5 xl:border-r border-n200 overflow-x-auto">
                        {viewMode === 'kanban' ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 items-start">
                                {STAGE_DEFS.map(stage => (
                                    <KanbanColumn
                                        key={stage.key}
                                        stage={stage}
                                        candidates={kanbanData[stage.key] || []}
                                        selectedId={selectedId}
                                        onSelectCandidate={setSelectedId}
                                    />
                                ))}
                            </div>
                        ) : (
                            <CandidateListView
                                rows={listRows}
                                selectedId={selectedId}
                                onSelect={setSelectedId}
                                onOpen={openCandidateDetail}
                            />
                        )}
                    </div>

                    <div className="p-3.5">
                        {!selected ? (
                            <div className="border border-dashed border-n300 rounded-[14px] px-[18px] py-7 text-center">
                                <div className="w-11 h-11 mx-auto mb-2.5 rounded-full bg-n50 flex items-center justify-center">
                                    <MousePointerClick className="w-5 h-5 text-n400" />
                                </div>
                                <div className="text-[12px] font-semibold mb-1">Bir aday seçin</div>
                                <p className="text-[11px] leading-[1.5] text-n500 m-0">
                                    Karttan seçtiğiniz adayın aşamasını buradan taşıyabilir, mülakat planlayabilir
                                    veya süreçten çıkarabilirsiniz.
                                </p>
                            </div>
                        ) : (
                            <div className="bg-n0 border border-n200 rounded-[14px] shadow-sm p-3">
                                <div className="flex items-center gap-2.5 mb-3">
                                    <div className="w-9 h-9 flex-none rounded-full bg-brand-50 text-brand flex items-center justify-center text-[12px] font-semibold">
                                        {initials(selected.name)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[13px] font-semibold tracking-[-0.01em] truncate">{selected.name || 'İsimsiz'}</div>
                                        <div className="text-[11px] text-n500 truncate">
                                            {selected.position || selected.matchedPositionTitle || '—'}
                                        </div>
                                    </div>
                                    <button onClick={() => setSelectedId(null)} title="Seçimi kaldır">
                                        <X className="w-[15px] h-[15px] text-n400" />
                                    </button>
                                </div>

                                <div className="flex items-center gap-2 px-[11px] py-2.5 bg-n50 rounded-md mb-3">
                                    <span className="text-[11px] text-n500">Aşama</span>
                                    <span className="ml-auto text-[11px] font-semibold" style={{ color: selectedStage?.color }}>
                                        {selectedStage?.label}
                                    </span>
                                </div>

                                <div className="flex flex-col gap-[7px]">
                                    <button
                                        onClick={() => nextKey && updateCandidate(selected.id, { status: nextKey, rejectionReason: null })}
                                        disabled={!nextKey}
                                        className="text-center text-[12px] font-semibold text-white bg-brand hover:bg-brand-600 py-2.5 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {nextStage ? `${nextStage.label} aşamasına taşı` : 'Son aşamada'}
                                    </button>
                                    <button
                                        onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }))}
                                        className="text-center text-[12px] font-medium text-n600 border border-n200 py-2.5 rounded-md hover:bg-n50"
                                    >
                                        Mülakat planla
                                    </button>
                                    <button
                                        onClick={() => openCandidateDetail(selected.id)}
                                        className="text-center text-[12px] font-medium text-n600 border border-n200 py-2.5 rounded-md hover:bg-n50"
                                    >
                                        Aday detayını aç
                                    </button>
                                    {/* Red akışı ve red SEBEBİ Aday Süreci
                                        sayfasında yaşıyor; buraya sebepsiz
                                        ikinci bir red yolu koymak veriyi
                                        eksiltirdi. Prototipin ayrı "Red
                                        Modalı"sı modal çalışmasıyla gelecek. */}
                                    <button
                                        onClick={() => openCandidateDetail(selected.id)}
                                        className="text-center text-[11px] font-semibold text-bad py-1.5 hover:underline"
                                    >
                                        Süreçten çıkar
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Mülakatlar sekmesi ───────────────────────────────────────── */}
            {tab === 'interviews' && (
                <div className="flex-1 px-[18px] py-2.5">
                    <div className="flex items-center justify-between mb-3.5 gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                            {[
                                { key: 'all',       label: 'Tümü',       count: allInterviews.length },
                                { key: 'upcoming',  label: 'Yaklaşan',   count: allInterviews.filter(s => s.status === 'live' || s.status === 'pending').length },
                                { key: 'completed', label: 'Tamamlanan', count: allInterviews.filter(s => s.status === 'completed' || s.status === 'cancelled').length },
                            ].map(t => (
                                <button
                                    key={t.key}
                                    onClick={() => setIvFilter(t.key)}
                                    className={`flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full border ${
                                        ivFilter === t.key ? 'bg-brand-50 text-brand border-brand-100' : 'bg-n0 text-n600 border-n200'
                                    }`}
                                >
                                    {t.label} <span className="text-n400 font-medium">{t.count}</span>
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }))}
                            className="flex items-center gap-1.5 text-[11px] font-medium text-brand hover:text-brand-600"
                        >
                            Mülakat Yönetimi <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <div className="bg-n0 rounded-[14px] border border-n200 shadow-sm overflow-hidden">
                        {visibleInterviews.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-n400">
                                <Calendar className="w-12 h-12 mb-3 opacity-20" />
                                <p className="text-[13px] font-semibold text-n600">Mülakat bulunamadı</p>
                                <p className="text-[11px] mt-1">
                                    {allInterviews.length === 0
                                        ? 'Henüz hiç mülakat planlanmamış. Mülakat yönetiminden yeni mülakat ekleyebilirsiniz.'
                                        : 'Bu filtreye uygun mülakat yok.'}
                                </p>
                                {allInterviews.length === 0 && (
                                    <button
                                        onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }))}
                                        className="mt-4 flex items-center gap-1.5 text-[12px] font-semibold text-white bg-brand hover:bg-brand-600 px-4 py-2 rounded-md"
                                    >
                                        Mülakat Planla <ChevronRight className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-[2fr_1.5fr_1.2fr_0.8fr_0.8fr_70px] gap-2 px-5 py-2 text-[10px] font-semibold text-n500 border-b border-n200 bg-n50">
                                    <span>Aday</span>
                                    <span>Pozisyon</span>
                                    <span>Tarih &amp; Saat</span>
                                    <span>Tür</span>
                                    <span>Durum</span>
                                    <span className="text-right">Skor</span>
                                </div>
                                {visibleInterviews.map((iv, idx) => (
                                    <div
                                        key={iv.id || idx}
                                        className={`grid grid-cols-[2fr_1.5fr_1.2fr_0.8fr_0.8fr_70px] gap-2 px-5 py-2.5 items-center border-b border-n100 last:border-0 ${
                                            iv.status === 'live' ? 'bg-bad-bg/40' : 'hover:bg-n50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center text-[10px] font-semibold text-brand shrink-0">
                                                {initials(iv.candidateName)}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[11px] font-semibold truncate leading-tight">{iv.candidateName}</p>
                                                {iv.interviewerName && (
                                                    <p className="text-[10px] text-n400 truncate">{iv.interviewerName}</p>
                                                )}
                                            </div>
                                        </div>
                                        <p className="text-[11px] text-n600 truncate">{iv.position}</p>
                                        <div className="flex items-center gap-1 text-[11px] text-n500">
                                            <Clock className="w-3 h-3 shrink-0 text-n300" />
                                            <span>{(iv.date || '').split('T')[0] || '—'} {iv.time || ''}</span>
                                        </div>
                                        <span className="text-[11px] text-n500">{TYPE_MAP[iv.type] || iv.type || 'Genel'}</span>
                                        <StatusBadge status={iv.status} />
                                        <div className="flex justify-end">
                                            {(iv.finalScore || iv.aiOverallScore) ? (
                                                <span className="flex items-center gap-0.5 text-[11px] font-semibold text-warn">
                                                    <Star className="w-3 h-3 fill-warn text-warn" />
                                                    {iv.finalScore || iv.aiOverallScore}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-n300">—</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
}
