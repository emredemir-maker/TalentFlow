import { useMemo, useState, useEffect } from 'react';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
    Users, Calendar, Clock, Star, Search,
    List, LayoutGrid, ArrowUpRight, ChevronRight, MousePointerClick, Upload, X,
} from 'lucide-react';
import { STAGES as STAGE_DEFS, nextStageKey } from '../utils/pipelineStages';
import { resolveCandidateStage } from '../utils/candidateTable';
import { withCoherentScores } from '../utils/candidateTable';
import { calculateMatchScore } from '../services/matchService';

function initials(name = '') {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

/** Skor tonu: ≥85 Talent teal, ≥70 nötr, altı amber (metin tonu). Kontrol Paneli ile aynı eşikler. */
function scoreTone(score) {
    if (score >= 85) return { fg: '#0F766E', bg: '#E6F6F4' };
    if (score >= 70) return { fg: '#343A37', bg: '#F4F6F5' };
    return { fg: '#96590A', bg: '#FDF4E4' };
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
            className="text-[12px] font-semibold px-1.5 rounded-full shrink-0 tabular-nums"
        >
            %{score}
        </span>
    );
}

// ── Kanban ────────────────────────────────────────────────────────────────────
function CandidateCard({ candidate, selected, onSelect }) {
    const score = cardScore(candidate);
    return (
        <button
            onClick={onSelect}
            aria-pressed={selected}
            className={`w-full text-left bg-n0 rounded-xl border p-3 transition-colors ${selected ? 'border-n900 ring-1 ring-n900' : 'border-n200 hover:border-n300'}`}
        >
            <div className="flex items-start gap-2.5">
                <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 bg-brand-50 text-brand-700"
                >
                    {initials(candidate.name)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-n900 truncate">{candidate.name || 'İsimsiz'}</span>
                        <span className="ml-auto"><ScoreBadge score={score} /></span>
                    </div>
                    <div className="text-[12px] text-n600 mt-0.5 truncate">
                        {candidate.position || candidate.matchedPositionTitle || '—'}
                    </div>
                    {candidate.source && <div className="text-[12px] text-n500 mt-0.5 truncate">{candidate.source}</div>}
                </div>
            </div>
        </button>
    );
}

function KanbanColumn({ stage, candidates, selectedId, onSelectCandidate }) {
    return (
        <section aria-label={stage.label} className="flex flex-col gap-2 w-[244px] flex-none bg-n50 rounded-2xl p-2">
            <div className="flex items-center justify-between px-2 pt-1 pb-0.5">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-none" style={{ background: stage.color }} />
                    <h2 className="m-0 text-[13px] font-semibold text-n900 truncate">{stage.label}</h2>
                </div>
                <span className="text-[12px] text-n500 tabular-nums">{candidates.length}</span>
            </div>
            <div className="flex flex-col gap-2">
                {candidates.length === 0
                    ? <div className="h-14 rounded-xl border border-dashed border-n300 flex items-center justify-center text-[12px] text-n500">Aday yok</div>
                    : candidates.map(c => (
                        <CandidateCard
                            key={c.id}
                            candidate={c}
                            selected={selectedId === c.id}
                            onSelect={() => onSelectCandidate(c.id)}
                        />
                    ))
                }
            </div>
        </section>
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
                const stage = STAGE_DEFS.find((x) => x.key === resolveCandidateStage(c)) || STAGE_DEFS[0];
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
        for (const c of filtered) groups[resolveCandidateStage(c)].push(c);
        return groups;
    }, [filtered]);

    /** Liste görünümü — kanbanla aynı süzgeç, aşamaya göre sıralı. */
    const listRows = useMemo(() => {
        const sira = Object.fromEntries(STAGE_DEFS.map((s, i) => [s.key, i]));
        return [...filtered].sort((a, b) => {
            const fa = sira[resolveCandidateStage(a)] ?? 99;
            const fb = sira[resolveCandidateStage(b)] ?? 99;
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
    const selectedStage = selected ? STAGE_DEFS.find(s => s.key === resolveCandidateStage(selected)) : null;
    const nextKey = selectedStage ? nextStageKey(selectedStage.key) : null;
    const nextStage = nextKey ? STAGE_DEFS.find(s => s.key === nextKey) : null;

    const openCandidateDetail = (id) => {
        setViewCandidateId(id);
        window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }));
    };

    return (
        <div className="infoset flex flex-col min-h-screen bg-n0">
            {/* ── Sayfa başlığı ────────────────────────────────────────────── */}
            <header className="tf-page-head bg-n0 border-b border-n200 sticky top-0 z-20 !pb-4">
                <div className="min-w-0">
                    <h1 className="tf-page-title">Aday süreci</h1>
                    <span className="tf-page-sub block tabular-nums">
                        {totalCandidates} aday, {allInterviews.length} mülakat
                    </span>
                </div>
                <div className="ml-auto flex items-center gap-2 flex-wrap">
                    {tab === 'kanban' && (
                        <div className="relative hidden md:block">
                            <Search className="w-3.5 h-3.5 text-n400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Aday ara..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                aria-label="Aday ara"
                                className="h-8 pl-8 pr-3 text-[12px] border border-n200 rounded-full bg-n50 focus:bg-n0 focus:outline-none focus:border-brand w-48"
                            />
                        </div>
                    )}
                    {/* İKİ KONUMLU ANAHTAR — Kanban | Liste.
                        Yalnızca kanban sekmesinde anlamlı; "Mülakatlar"
                        açıkken gizleniyor ki hangi görünümü değiştirdiği
                        belirsiz kalmasın. */}
                    {tab === 'kanban' && (
                        <div className="flex items-center bg-n100 rounded-full p-0.5">
                            {[
                                { id: 'kanban', label: 'Kanban', Icon: LayoutGrid },
                                { id: 'list', label: 'Liste', Icon: List },
                            ].map(({ id, label, Icon }) => (
                                <button
                                    key={id}
                                    onClick={() => setGorunum(id)}
                                    aria-pressed={viewMode === id}
                                    className={`flex items-center gap-1.5 h-7 text-[12px] font-medium rounded-full px-3 transition-colors ${
                                        viewMode === id
                                            ? 'bg-n0 text-n900 shadow-[0_1px_2px_rgba(17,19,18,0.08)]'
                                            : 'text-n500 hover:text-n800'
                                    }`}
                                >
                                    <Icon className="w-[13px] h-[13px]" /> {label}
                                </button>
                            ))}
                        </div>
                    )}
                    <button
                        onClick={() => setTab(tab === 'interviews' ? 'kanban' : 'interviews')}
                        aria-pressed={tab === 'interviews'}
                        className={`tf-btn tf-btn-secondary ${tab === 'interviews' ? '!bg-pill !border-pill' : ''}`}
                    >
                        <List /> Mülakatlar
                        {allInterviews.length > 0 && (
                            <span className="text-[12px] text-n500 tabular-nums">{allInterviews.length}</span>
                        )}
                    </button>
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }))}
                        className="tf-btn tf-btn-secondary"
                    >
                        <Users /> Aday listesi
                    </button>
                    <button
                        onClick={() => {
                            window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }));
                            setTimeout(() => window.dispatchEvent(new CustomEvent('openAddCandidate')), 80);
                        }}
                        className="tf-btn tf-btn-primary"
                    >
                        <Upload /> Aday ekle
                    </button>
                </div>
            </header>

            {/* ── Kanban + seçim rayı ──────────────────────────────────────── */}
            {tab === 'kanban' && (
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] items-start flex-1">
                    <div className="px-6 py-4 xl:border-r border-n200 overflow-x-auto min-w-0 xl:min-h-[calc(100vh-160px)]">
                        {viewMode === 'kanban' ? (
                            <div className="flex gap-3 items-start w-max">
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

                    <div className="p-5 xl:sticky xl:top-[88px]">
                        {!selected ? (
                            <div className="tf-empty">
                                <MousePointerClick className="w-5 h-5 text-n400 mx-auto mb-2" aria-hidden="true" />
                                <div className="tf-empty-title">Bir aday seçin</div>
                                <p className="text-[13px] leading-[1.5] text-n500 m-0">
                                    Karttan seçtiğiniz adayın aşamasını buradan taşıyabilir, mülakat planlayabilir
                                    veya süreçten çıkarabilirsiniz.
                                </p>
                            </div>
                        ) : (
                            <div className="tf-panel p-4">
                                <div className="flex items-center gap-2.5 mb-3">
                                    <div className="w-9 h-9 flex-none rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-[12px] font-semibold">
                                        {initials(selected.name)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[14px] font-semibold text-n900 tracking-[-0.01em] truncate">{selected.name || 'İsimsiz'}</div>
                                        <div className="text-[12px] text-n500 truncate">
                                            {selected.position || selected.matchedPositionTitle || '—'}
                                        </div>
                                    </div>
                                    <button onClick={() => setSelectedId(null)} title="Seçimi kaldır" aria-label="Seçimi kaldır" className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-n100">
                                        <X className="w-[15px] h-[15px] text-n400" />
                                    </button>
                                </div>

                                <div className="flex items-center gap-2 px-3 py-2.5 bg-n50 rounded-xl mb-3">
                                    <span className="text-[13px] text-n500">Aşama</span>
                                    <span className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-n900">
                                        <span className="w-2 h-2 rounded-full" style={{ background: selectedStage?.color }} />
                                        {selectedStage?.label}
                                    </span>
                                </div>

                                <div className="flex flex-col gap-[7px]">
                                    <button
                                        onClick={() => nextKey && updateCandidate(selected.id, { status: nextKey, rejectionReason: null })}
                                        disabled={!nextKey}
                                        className="tf-btn tf-btn-primary w-full h-9"
                                    >
                                        {nextStage ? `${nextStage.label} aşamasına taşı` : 'Son aşamada'}
                                    </button>
                                    <button
                                        onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }))}
                                        className="tf-btn tf-btn-secondary w-full h-9"
                                    >
                                        Mülakat planla
                                    </button>
                                    <button
                                        onClick={() => openCandidateDetail(selected.id)}
                                        className="tf-btn tf-btn-secondary w-full h-9"
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
                                        className="text-center text-[13px] font-medium text-bad-text py-1.5 hover:underline"
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
