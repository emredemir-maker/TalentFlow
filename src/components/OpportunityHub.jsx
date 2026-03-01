// src/components/OpportunityHub.jsx
// "Smart Match" Notifications & Opportunity Hub
// Groups candidates and shows all qualifying positions per candidate

import { useState, useMemo } from 'react';
import {
    Sparkles,
    Lightbulb,
    CheckCircle2,
    Calendar,
    TrendingUp,
    Layout,
    ChevronDown,
    ChevronUp,
    Eye
} from 'lucide-react';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';

const THRESHOLD = 80; // minimum score to appear in opportunity hub

export default function OpportunityHub() {
    const { enrichedCandidates, candidates, setViewCandidateId } = useCandidates();
    const { positions } = usePositions();
    const [expandedId, setExpandedId] = useState(null);

    // Group by CANDIDATE, list all qualifying positions under each
    const groupedOpportunities = useMemo(() => {
        const pool = enrichedCandidates || candidates;
        if (!pool?.length || !positions?.length) return [];

        const openPositions = positions.filter(p => p.status === 'open');
        const candidateMap = new Map(); // candidateId -> { candidate, positions: [] }

        openPositions.forEach(pos => {
            pool.forEach(c => {
                // Check position-specific AI score
                const posAiScore = c.positionAnalyses?.[pos.title]?.score || 0;

                // Also check if the candidate's best match IS this position
                const isBestMatch = c.matchedPositionTitle === pos.title && (c.matchScore || 0) >= THRESHOLD;

                if (posAiScore >= THRESHOLD || isBestMatch) {
                    const effectiveScore = posAiScore || c.matchScore || 0;

                    if (!candidateMap.has(c.id)) {
                        candidateMap.set(c.id, {
                            candidate: c,
                            positions: [],
                            highestScore: 0
                        });
                    }

                    const entry = candidateMap.get(c.id);

                    // Avoid duplicate positions
                    if (!entry.positions.find(p => p.title === pos.title)) {
                        const interviewScore = c.hasInterview ? c.interviewScore : null;
                        const combinedScore = interviewScore !== null
                            ? Math.round((effectiveScore + interviewScore) / 2)
                            : effectiveScore;

                        entry.positions.push({
                            posId: pos.id,
                            title: pos.title,
                            aiScore: effectiveScore,
                            combinedScore,
                            summary: c.positionAnalyses?.[pos.title]?.summary || c.aiAnalysis?.summary || null
                        });

                        if (combinedScore > entry.highestScore) {
                            entry.highestScore = combinedScore;
                        }
                    }
                }
            });
        });

        return Array.from(candidateMap.values())
            .sort((a, b) => b.highestScore - a.highestScore);
    }, [enrichedCandidates, candidates, positions]);

    const handleNavigateToCandidate = (candidateId) => {
        setViewCandidateId(candidateId);
        window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }));
    };

    function scoreToColor(score) {
        if (score >= 85) return 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
        if (score >= 70) return 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
        return 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20';
    }

    if (groupedOpportunities.length === 0) {
        return (
            <div className="bg-bg-primary rounded-2xl p-6 border border-border-subtle text-center shadow-inner">
                <div className="w-12 h-12 rounded-xl bg-bg-secondary flex items-center justify-center mx-auto mb-3 text-text-muted opacity-40">
                    <Layout className="w-6 h-6" />
                </div>
                <h3 className="text-text-primary font-black uppercase tracking-widest text-[11px] mb-1">Fırsat Havuzu Boş</h3>
                <p className="text-[10px] text-text-muted font-bold opacity-60">Adaylar analiz edildikçe %{THRESHOLD} barajını aşan eşleşmeler burada görünecek.</p>
            </div>
        );
    }

    return (
        <div className="bg-bg-secondary/40 backdrop-blur-xl rounded-[1.5rem] p-4 border border-border-subtle relative overflow-hidden shadow-2xl">
            {/* Background Effects */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl -z-10" />

            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-sm">
                        <Lightbulb className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-base font-black text-text-primary tracking-tight uppercase">Fırsat Havuzu</h3>
                        <p className="text-[9px] text-text-muted font-bold opacity-60 tracking-tight"> uyumluluk barajını aşan adaylar</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-primary border border-border-subtle text-[10px] font-black text-text-secondary shadow-inner">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span className="uppercase tracking-widest">{groupedOpportunities.length} ADAY</span>
                </div>
            </div>

            {/* Candidates Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {groupedOpportunities.map((entry) => {
                    const c = entry.candidate;
                    const isExpanded = expandedId === c.id;

                    return (
                        <div
                            key={c.id}
                            className="group relative rounded-2xl bg-bg-primary border border-border-subtle hover:bg-bg-secondary/40 transition-all overflow-hidden shadow-lg p-0.5"
                        >
                            {/* Candidate Header */}
                            <div className="p-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                                <div
                                    className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                                    onClick={() => handleNavigateToCandidate(c.id)}
                                >
                                    <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-bg-secondary to-bg-primary border border-border-subtle flex items-center justify-center text-xs font-black text-text-primary shrink-0 shadow-lg group-hover:scale-105 transition-transform">
                                        {c.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
                                        {c.hasInterview && (
                                            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-[2px] border-bg-primary flex items-center justify-center shadow-lg" title="Mülakat Tamamlandı">
                                                <CheckCircle2 className="w-3 text-white" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-black text-text-primary text-[12px] truncate group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors uppercase tracking-tight">{c.name}</h4>
                                        <p className="text-[9px] text-text-muted font-bold truncate opacity-70 uppercase tracking-tighter">{c.position}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                                    <button
                                        onClick={() => handleNavigateToCandidate(c.id)}
                                        className="flex-1 sm:flex-none px-2.5 py-1.5 rounded-lg bg-bg-secondary border border-border-subtle text-[9px] font-black text-text-muted hover:text-text-primary transition-all uppercase tracking-widest shadow-sm"
                                    >
                                        <Eye className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={() => setExpandedId(isExpanded ? null : c.id)}
                                        className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 flex items-center justify-center gap-1.5 transition-all font-black text-[9px] uppercase tracking-widest shadow-sm"
                                    >
                                        {entry.positions.length} Pozisyon
                                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                    </button>
                                </div>
                            </div>

                            {/* Qualifying Positions Labels */}
                            <div className="px-4 pb-4">
                                <div className="flex flex-wrap gap-2">
                                    {entry.positions.map(p => (
                                        <span key={p.title} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black border uppercase tracking-tighter shadow-sm ${scoreToColor(p.combinedScore)}`}>
                                            <Sparkles className="w-3 h-3 opacity-60" />
                                            {p.title} • %{p.combinedScore}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Expanded Details */}
                            {isExpanded && (
                                <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200 space-y-3">
                                    {entry.positions.map(p => (
                                        <div key={p.title} className="p-4 rounded-2xl bg-bg-secondary/50 border border-border-subtle shadow-inner">
                                            <div className="flex items-center justify-between mb-3 border-b border-border-subtle pb-2">
                                                <span className="text-[12px] font-black text-text-primary uppercase tracking-tight">{p.title}</span>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] text-text-muted font-bold opacity-60">AI: %{p.aiScore}</span>
                                                    {c.hasInterview && (
                                                        <span className="text-[10px] text-cyan-500 font-bold">Mülakat: %{c.interviewScore}</span>
                                                    )}
                                                    <span className={`text-[11px] font-black px-2 py-0.5 rounded-xl border shadow-sm ${scoreToColor(p.combinedScore)}`}>
                                                        %{p.combinedScore}
                                                    </span>
                                                </div>
                                            </div>
                                            {p.summary && (
                                                <div className="flex items-start gap-3">
                                                    <div className="p-1 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
                                                        <TrendingUp className="w-3.5 h-3.5" />
                                                    </div>
                                                    <p className="text-[11px] text-text-secondary leading-relaxed font-bold italic">"{p.summary}"</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
