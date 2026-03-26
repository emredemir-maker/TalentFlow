import { useMemo, useState } from 'react';
import { useCandidates } from '../context/CandidatesContext';
import { Users, Calendar, Clock, Star, ChevronRight, Search, Filter, ArrowUpRight } from 'lucide-react';

// Pipeline stage definitions — must match Dashboard.jsx
const STAGE_DEFS = [
    { key: 'ai_analysis', label: 'AI Tarama',  color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', legacy: ['new', 'pending', 'applied', 'unknown'] },
    { key: 'review',      label: 'İnceleme',   color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC', legacy: ['Review', 'değerlendirme'] },
    { key: 'interview',   label: 'Mülakat',    color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', legacy: ['Interview', 'mülakat', 'Mülakat'] },
    { key: 'offer',       label: 'Teklif',     color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', legacy: [] },
    { key: 'hired',       label: 'İşe Alındı', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', legacy: ['Hired'] },
    { key: 'rejected',    label: 'Reddedildi', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', legacy: ['Rejected'] },
];

// Map any status string to a canonical stage key
function resolveStage(status) {
    if (!status) return 'ai_analysis';
    for (const s of STAGE_DEFS) {
        if (s.key === status || s.legacy.includes(status)) return s.key;
    }
    return 'ai_analysis'; // catch-all
}

function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
}

function ScoreBadge({ score }) {
    if (score == null || score === 0) return null;
    const color = score >= 75 ? '#059669' : score >= 50 ? '#D97706' : '#DC2626';
    return (
        <span style={{ color, backgroundColor: color + '18', border: `1px solid ${color}40` }}
            className="text-[10px] font-black px-1.5 py-0.5 rounded-full">
            %{score}
        </span>
    );
}

function CandidateCard({ candidate, stageColor, stageBg }) {
    const score = candidate.combinedScore || candidate.matchScore || candidate.initialAiScore || 0;
    return (
        <button
            onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }))}
            className="w-full text-left bg-white rounded-lg border border-slate-100 p-3 shadow-sm hover:shadow-md hover:border-slate-200 transition-all group"
        >
            <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black text-white shrink-0"
                    style={{ backgroundColor: stageColor }}>
                    {initials(candidate.name).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                        <p className="text-[12px] font-bold text-slate-800 truncate leading-tight">{candidate.name || 'İsimsiz'}</p>
                        <ScoreBadge score={score} />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate">{candidate.position || candidate.matchedPositionTitle || '—'}</p>
                    {candidate.source && (
                        <p className="text-[9px] text-slate-300 mt-1 truncate">{candidate.source}</p>
                    )}
                </div>
            </div>
        </button>
    );
}

function KanbanColumn({ stage, candidates }) {
    return (
        <div className="flex flex-col gap-2 min-w-[200px] flex-1">
            {/* Column header */}
            <div className="flex items-center justify-between px-3 py-2 rounded-lg"
                style={{ backgroundColor: stage.bg, border: `1px solid ${stage.border}` }}>
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                    <span className="text-[11px] font-black" style={{ color: stage.color }}>{stage.label}</span>
                </div>
                <span className="text-[11px] font-bold text-slate-500">{candidates.length}</span>
            </div>
            {/* Cards */}
            <div className="flex flex-col gap-2 flex-1">
                {candidates.length === 0 ? (
                    <div className="flex items-center justify-center h-16 rounded-lg border-2 border-dashed border-slate-100 text-[10px] text-slate-300">
                        Aday yok
                    </div>
                ) : (
                    candidates.map(c => (
                        <CandidateCard key={c.id} candidate={c} stageColor={stage.color} stageBg={stage.bg} />
                    ))
                )}
            </div>
        </div>
    );
}

// ── Interview session status badge
function SessionStatusBadge({ status }) {
    const map = {
        live:      { label: 'Canlı',     bg: '#ECFDF5', color: '#059669', dot: true },
        pending:   { label: 'Bekliyor',  bg: '#EFF6FF', color: '#2563EB', dot: false },
        completed: { label: 'Tamamlandı',bg: '#F5F3FF', color: '#7C3AED', dot: false },
        cancelled: { label: 'İptal',     bg: '#FEF2F2', color: '#DC2626', dot: false },
    };
    const cfg = map[status] || { label: status || '?', bg: '#F1F5F9', color: '#64748B', dot: false };
    return (
        <span style={{ backgroundColor: cfg.bg, color: cfg.color }}
            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full">
            {cfg.dot && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
            {cfg.label}
        </span>
    );
}

function InterviewTypeLabel({ type }) {
    const map = {
        technical: 'Teknik',
        hr:        'İK',
        product:   'Ürün',
        cultural:  'Kültür',
        behavioral:'Davranışsal',
    };
    return <span className="text-[10px] text-slate-400">{map[type] || type || 'Genel'}</span>;
}

export default function PipelinePage() {
    const { candidates } = useCandidates();
    const [search, setSearch] = useState('');
    const [interviewFilter, setInterviewFilter] = useState('all'); // all | upcoming | completed

    // ── Group candidates by stage
    const kanbanData = useMemo(() => {
        const q = search.toLowerCase();
        const filtered = q
            ? candidates.filter(c =>
                c.name?.toLowerCase().includes(q) ||
                c.position?.toLowerCase().includes(q) ||
                c.email?.toLowerCase().includes(q))
            : candidates;

        const groups = {};
        for (const s of STAGE_DEFS) groups[s.key] = [];

        for (const c of filtered) {
            const stage = resolveStage(c.status);
            groups[stage].push(c);
        }
        return groups;
    }, [candidates, search]);

    // ── Flatten all interview sessions across all candidates
    const allInterviews = useMemo(() => {
        const rows = [];
        for (const c of candidates) {
            if (!Array.isArray(c.interviewSessions)) continue;
            for (const s of c.interviewSessions) {
                rows.push({
                    ...s,
                    candidateName: c.name || 'İsimsiz',
                    candidateId: c.id,
                    position: c.position || c.matchedPositionTitle || '—',
                });
            }
        }
        // Sort: live first, then by date desc
        rows.sort((a, b) => {
            if (a.status === 'live' && b.status !== 'live') return -1;
            if (b.status === 'live' && a.status !== 'live') return 1;
            const da = a.date ? new Date(a.date) : new Date(0);
            const db2 = b.date ? new Date(b.date) : new Date(0);
            return db2 - da;
        });
        return rows;
    }, [candidates]);

    const filteredInterviews = useMemo(() => {
        if (interviewFilter === 'upcoming') return allInterviews.filter(s => s.status === 'live' || s.status === 'pending');
        if (interviewFilter === 'completed') return allInterviews.filter(s => s.status === 'completed' || s.status === 'cancelled');
        return allInterviews;
    }, [allInterviews, interviewFilter]);

    const totalCandidates = candidates.length;

    return (
        <div className="min-h-screen bg-[#F8FAFC] p-6 space-y-8">
            {/* ── Page header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-900">Aday Pipeline</h1>
                    <p className="text-[12px] text-slate-400 mt-0.5">{totalCandidates} toplam aday • {STAGE_DEFS.length} aşama</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Aday ara..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-8 pr-3 py-1.5 text-[12px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 w-48"
                        />
                    </div>
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }))}
                        className="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                    >
                        <Users className="w-3.5 h-3.5" />
                        Aday Listesi
                    </button>
                </div>
            </div>

            {/* ── Kanban board */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-5">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <h2 className="text-[13px] font-black text-slate-700">Kanban Görünümü</h2>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2">
                    {STAGE_DEFS.map(stage => (
                        <KanbanColumn
                            key={stage.key}
                            stage={stage}
                            candidates={kanbanData[stage.key] || []}
                        />
                    ))}
                </div>
            </div>

            {/* ── Interviews list */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <h2 className="text-[13px] font-black text-slate-700">Tüm Mülakatlar</h2>
                        <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                            {filteredInterviews.length}
                        </span>
                    </div>
                    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                        {[
                            { key: 'all',       label: 'Tümü' },
                            { key: 'upcoming',  label: 'Yaklaşan' },
                            { key: 'completed', label: 'Tamamlanan' },
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setInterviewFilter(tab.key)}
                                className={`text-[11px] font-bold px-3 py-1 rounded-md transition-all ${
                                    interviewFilter === tab.key
                                        ? 'bg-white text-slate-800 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {filteredInterviews.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                        <Calendar className="w-10 h-10 mb-3 opacity-30" />
                        <p className="text-[13px] font-semibold">Mülakat bulunamadı</p>
                        <p className="text-[11px] mt-1">Bu filtreye uygun mülakat kaydı yok</p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {/* Table header */}
                        <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_80px] gap-3 px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wide border-b border-slate-100">
                            <span>Aday</span>
                            <span>Pozisyon</span>
                            <span>Tarih &amp; Saat</span>
                            <span>Tür</span>
                            <span>Durum</span>
                            <span className="text-right">Skor</span>
                        </div>
                        {filteredInterviews.map((iv, idx) => (
                            <div
                                key={iv.id || idx}
                                className={`grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_80px] gap-3 px-3 py-2.5 rounded-lg items-center transition-colors ${
                                    iv.status === 'live' ? 'bg-emerald-50/60' : 'hover:bg-slate-50'
                                }`}
                            >
                                {/* Candidate */}
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-[10px] font-black text-violet-600 shrink-0">
                                        {initials(iv.candidateName).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[12px] font-bold text-slate-800 truncate">{iv.candidateName}</p>
                                        {iv.interviewerName && (
                                            <p className="text-[10px] text-slate-400 truncate">{iv.interviewerName}</p>
                                        )}
                                    </div>
                                </div>
                                {/* Position */}
                                <p className="text-[11px] text-slate-600 truncate">{iv.position}</p>
                                {/* Date & Time */}
                                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                                    <Clock className="w-3 h-3 shrink-0" />
                                    <span>{iv.date ? iv.date.split('T')[0] : '—'} {iv.time || ''}</span>
                                </div>
                                {/* Type */}
                                <InterviewTypeLabel type={iv.type} />
                                {/* Status */}
                                <SessionStatusBadge status={iv.status} />
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
                    </div>
                )}

                {allInterviews.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }))}
                            className="flex items-center gap-1.5 text-[11px] font-bold text-violet-600 hover:text-violet-700"
                        >
                            Mülakat yönetimine git <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
