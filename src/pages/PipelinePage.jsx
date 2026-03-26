import { useMemo, useState, useEffect } from 'react';
import { useCandidates } from '../context/CandidatesContext';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
    Users, Calendar, Clock, Star, Search,
    Filter, ArrowUpRight, LayoutGrid, List, ChevronRight
} from 'lucide-react';

// ── Pipeline stage definitions — must match Dashboard.jsx
const STAGE_DEFS = [
    { key: 'ai_analysis', label: 'AI Tarama',  color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', legacy: ['new', 'pending', 'applied', 'unknown'] },
    { key: 'review',      label: 'İnceleme',   color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC', legacy: ['Review', 'değerlendirme'] },
    { key: 'interview',   label: 'Mülakat',    color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', legacy: ['Interview', 'mülakat', 'Mülakat'] },
    { key: 'offer',       label: 'Teklif',     color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', legacy: [] },
    { key: 'hired',       label: 'İşe Alındı', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', legacy: ['Hired'] },
    { key: 'rejected',    label: 'Reddedildi', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', legacy: ['Rejected'] },
];

function resolveStage(status) {
    if (!status) return 'ai_analysis';
    for (const s of STAGE_DEFS) {
        if (s.key === status || s.legacy.includes(status)) return s.key;
    }
    return 'ai_analysis';
}

function initials(name = '') {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function ScoreBadge({ score }) {
    if (!score) return null;
    const color = score >= 75 ? '#059669' : score >= 50 ? '#D97706' : '#DC2626';
    return (
        <span style={{ color, background: color + '18', border: `1px solid ${color}40` }}
            className="text-[10px] font-black px-1.5 py-0.5 rounded-full shrink-0">
            %{score}
        </span>
    );
}

// ── Kanban ────────────────────────────────────────────────────────────────────
function CandidateCard({ candidate, stageColor, onSelect }) {
    const score = candidate.combinedScore || candidate.matchScore || candidate.initialAiScore || 0;
    return (
        <button
            onClick={onSelect}
            className="w-full text-left bg-white rounded-lg border border-slate-100 p-3 shadow-sm hover:shadow-md hover:border-slate-200 transition-all"
        >
            <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white shrink-0"
                    style={{ background: stageColor }}>
                    {initials(candidate.name)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                        <p className="text-[12px] font-bold text-slate-800 truncate">{candidate.name || 'İsimsiz'}</p>
                        <ScoreBadge score={score} />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate">{candidate.position || candidate.matchedPositionTitle || '—'}</p>
                    {candidate.source && <p className="text-[9px] text-slate-300 mt-1 truncate">{candidate.source}</p>}
                </div>
            </div>
        </button>
    );
}

function KanbanColumn({ stage, candidates, onSelectCandidate }) {
    return (
        <div className="flex flex-col gap-2 min-w-[195px] flex-1">
            <div className="flex items-center justify-between px-3 py-2 rounded-lg sticky top-0 z-10"
                style={{ background: stage.bg, border: `1px solid ${stage.border}` }}>
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
                    <span className="text-[11px] font-black" style={{ color: stage.color }}>{stage.label}</span>
                </div>
                <span className="text-[11px] font-bold text-slate-500">{candidates.length}</span>
            </div>
            <div className="flex flex-col gap-2">
                {candidates.length === 0
                    ? <div className="h-14 rounded-lg border-2 border-dashed border-slate-100 flex items-center justify-center text-[10px] text-slate-300">Aday yok</div>
                    : candidates.map(c => (
                        <CandidateCard
                            key={c.id}
                            candidate={c}
                            stageColor={stage.color}
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
    live:      { label: 'Canlı',      bg: '#ECFDF5', color: '#059669', pulse: true  },
    pending:   { label: 'Bekliyor',   bg: '#EFF6FF', color: '#2563EB', pulse: false },
    completed: { label: 'Tamamlandı', bg: '#F5F3FF', color: '#7C3AED', pulse: false },
    cancelled: { label: 'İptal',      bg: '#FEF2F2', color: '#DC2626', pulse: false },
};

function StatusBadge({ status }) {
    const cfg = SESSION_STATUS_MAP[status] || { label: status || '?', bg: '#F1F5F9', color: '#64748B', pulse: false };
    return (
        <span style={{ background: cfg.bg, color: cfg.color }}
            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
            {cfg.pulse && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
            {cfg.label}
        </span>
    );
}

const TYPE_MAP = { technical: 'Teknik', hr: 'İK', product: 'Ürün', cultural: 'Kültür', behavioral: 'Davranışsal' };

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PipelinePage() {
    const { candidates, setViewCandidateId } = useCandidates();
    const [tab, setTab] = useState('kanban'); // 'kanban' | 'interviews'
    const [search, setSearch] = useState('');
    const [ivFilter, setIvFilter] = useState('all');

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

    // ── Kanban: group candidates by stage ─────────────────────────────────────
    const kanbanData = useMemo(() => {
        const q = search.toLowerCase();
        const filtered = q
            ? candidates.filter(c =>
                c.name?.toLowerCase().includes(q) ||
                c.position?.toLowerCase().includes(q) ||
                c.email?.toLowerCase().includes(q))
            : candidates;

        const groups = Object.fromEntries(STAGE_DEFS.map(s => [s.key, []]));
        for (const c of filtered) groups[resolveStage(c.status)].push(c);
        return groups;
    }, [candidates, search]);

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

    return (
        <div className="flex flex-col min-h-screen bg-[#F8FAFC]">
            {/* ── Header ───────────────────────────────────────────────────── */}
            <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between gap-4 sticky top-0 z-20">
                <div>
                    <h1 className="text-xl font-black text-slate-900">Aday Pipeline</h1>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                        {totalCandidates} aday · {allInterviews.length} mülakat
                    </p>
                </div>

                {/* Tab switcher */}
                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                    <button
                        onClick={() => setTab('kanban')}
                        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                            tab === 'kanban' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <LayoutGrid className="w-3.5 h-3.5" /> Kanban
                    </button>
                    <button
                        onClick={() => setTab('interviews')}
                        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                            tab === 'interviews' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <List className="w-3.5 h-3.5" />
                        Mülakatlar
                        {allInterviews.length > 0 && (
                            <span className="bg-violet-100 text-violet-600 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                                {allInterviews.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* Right actions */}
                <div className="flex items-center gap-2">
                    {tab === 'kanban' && (
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Aday ara..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-8 pr-3 py-1.5 text-[12px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 w-44"
                            />
                        </div>
                    )}
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }))}
                        className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                    >
                        <Users className="w-3.5 h-3.5" /> Aday Listesi
                    </button>
                </div>
            </div>

            {/* ── Kanban tab ───────────────────────────────────────────────── */}
            {tab === 'kanban' && (
                <div className="flex-1 p-6 overflow-x-auto">
                    {/* Stage summary bar */}
                    <div className="flex gap-3 mb-5 flex-wrap">
                        {STAGE_DEFS.map(s => {
                            const cnt = kanbanData[s.key]?.length || 0;
                            return (
                                <div key={s.key} className="flex items-center gap-1.5 bg-white rounded-lg border border-slate-100 px-3 py-1.5 shadow-sm">
                                    <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                                    <span className="text-[11px] font-semibold text-slate-600">{s.label}</span>
                                    <span className="text-[11px] font-black" style={{ color: s.color }}>{cnt}</span>
                                </div>
                            );
                        })}
                    </div>
                    {/* Kanban columns */}
                    <div className="flex gap-3 min-w-max pb-4">
                        {STAGE_DEFS.map(stage => (
                            <KanbanColumn
                                key={stage.key}
                                stage={stage}
                                candidates={kanbanData[stage.key] || []}
                                onSelectCandidate={(id) => {
                                    setViewCandidateId(id);
                                    window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }));
                                }}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* ── Interviews tab ───────────────────────────────────────────── */}
            {tab === 'interviews' && (
                <div className="flex-1 p-6">
                    {/* Filters */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-1 bg-white border border-slate-100 rounded-xl p-1 shadow-sm">
                            {[
                                { key: 'all',       label: 'Tümü',       count: allInterviews.length },
                                { key: 'upcoming',  label: 'Yaklaşan',   count: allInterviews.filter(s => s.status === 'live' || s.status === 'pending').length },
                                { key: 'completed', label: 'Tamamlanan', count: allInterviews.filter(s => s.status === 'completed' || s.status === 'cancelled').length },
                            ].map(t => (
                                <button
                                    key={t.key}
                                    onClick={() => setIvFilter(t.key)}
                                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                                        ivFilter === t.key ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    {t.label}
                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                                        ivFilter === t.key ? 'bg-white text-slate-600' : 'bg-slate-100 text-slate-400'
                                    }`}>{t.count}</span>
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }))}
                            className="flex items-center gap-1.5 text-[11px] font-bold text-violet-600 hover:text-violet-700"
                        >
                            Mülakat Yönetimi <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        {visibleInterviews.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                                <Calendar className="w-12 h-12 mb-3 opacity-20" />
                                <p className="text-[14px] font-semibold">Mülakat bulunamadı</p>
                                <p className="text-[12px] mt-1">
                                    {allInterviews.length === 0
                                        ? 'Henüz hiç mülakat planlanmamış. Mülakat yönetiminden yeni mülakat ekleyebilirsiniz.'
                                        : 'Bu filtreye uygun mülakat yok.'}
                                </p>
                                {allInterviews.length === 0 && (
                                    <button
                                        onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }))}
                                        className="mt-4 flex items-center gap-1.5 text-[12px] font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 px-4 py-2 rounded-lg transition-colors"
                                    >
                                        Mülakat Planla <ChevronRight className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        ) : (
                            <>
                                {/* Table header */}
                                <div className="grid grid-cols-[2fr_1.5fr_1.2fr_0.8fr_0.8fr_70px] gap-3 px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/60">
                                    <span>Aday</span>
                                    <span>Pozisyon</span>
                                    <span>Tarih &amp; Saat</span>
                                    <span>Tür</span>
                                    <span>Durum</span>
                                    <span className="text-right">Skor</span>
                                </div>
                                {/* Rows */}
                                {visibleInterviews.map((iv, idx) => (
                                    <div
                                        key={iv.id || idx}
                                        className={`grid grid-cols-[2fr_1.5fr_1.2fr_0.8fr_0.8fr_70px] gap-3 px-5 py-3 items-center border-b border-slate-50 last:border-0 transition-colors ${
                                            iv.status === 'live' ? 'bg-emerald-50/50' : 'hover:bg-slate-50'
                                        }`}
                                    >
                                        {/* Candidate */}
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-[10px] font-black text-violet-700 shrink-0">
                                                {initials(iv.candidateName)}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[12px] font-bold text-slate-800 truncate leading-tight">{iv.candidateName}</p>
                                                {iv.interviewerName && (
                                                    <p className="text-[10px] text-slate-400 truncate">{iv.interviewerName}</p>
                                                )}
                                            </div>
                                        </div>
                                        {/* Position */}
                                        <p className="text-[11px] text-slate-600 truncate">{iv.position}</p>
                                        {/* Date & Time */}
                                        <div className="flex items-center gap-1 text-[11px] text-slate-500">
                                            <Clock className="w-3 h-3 shrink-0 text-slate-300" />
                                            <span>{(iv.date || '').split('T')[0] || '—'} {iv.time || ''}</span>
                                        </div>
                                        {/* Type */}
                                        <span className="text-[11px] text-slate-500">{TYPE_MAP[iv.type] || iv.type || 'Genel'}</span>
                                        {/* Status */}
                                        <StatusBadge status={iv.status} />
                                        {/* Score */}
                                        <div className="flex justify-end">
                                            {(iv.finalScore || iv.aiOverallScore) ? (
                                                <span className="flex items-center gap-0.5 text-[11px] font-bold text-amber-600">
                                                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                                    {iv.finalScore || iv.aiOverallScore}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-slate-300">—</span>
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
