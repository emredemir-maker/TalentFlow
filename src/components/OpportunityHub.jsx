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

export default function OpportunityHub({ isCompact, onSelectCandidate }) {
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
                        const interviewScore = c.hasInterview ? (c.interviewScore || 0) : null;
                        const combinedScore = (interviewScore !== null)
                            ? Math.round(((effectiveScore || 0) + interviewScore) / 2)
                            : (effectiveScore || 0);

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
        if (onSelectCandidate) {
            const candidate = (enrichedCandidates || candidates).find(c => c.id === candidateId);
            onSelectCandidate(candidate);
        } else {
            setViewCandidateId(candidateId);
            window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }));
        }
    };

    function scoreToColor(score) {
        if (score >= 85) return 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20';
        if (score >= 70) return 'text-cyan-600 bg-cyan-500/10 border-cyan-500/20';
        return 'text-amber-600 bg-amber-500/10 border-amber-500/20';
    }

    if (groupedOpportunities.length === 0) {
        return (
            <div className={`${isCompact ? 'p-4' : 'p-6'} text-center opacity-40`}>
                <Layout className="w-8 h-8 mx-auto mb-2" />
                <p className="text-[10px] font-bold uppercase tracking-widest">Kriterlere uygun fırsat yok</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {groupedOpportunities.map((entry) => {
                const c = entry.candidate;
                const isExpanded = expandedId === c.id;

                return (
                    <div
                        key={c.id}
                        className={`group relative rounded-xl bg-white border border-outline-variant/10 hover:border-primary/20 transition-all overflow-hidden ${isCompact ? 'p-3' : 'p-4'}`}
                    >
                        <div className="flex items-center justify-between gap-3">
                            <div
                                className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                                onClick={() => handleNavigateToCandidate(c.id)}
                            >
                                <div className="w-8 h-8 rounded-lg bg-surface-container-low border border-outline-variant/10 flex items-center justify-center text-[10px] font-black text-on-surface shrink-0">
                                    {c.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
                                </div>
                                <div className="min-w-0">
                                    <h4 className="font-bold text-on-surface text-[11px] truncate uppercase tracking-tight">{c.name}</h4>
                                    <p className="text-[8px] text-text-muted font-bold truncate opacity-60 uppercase">{c.position}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={() => handleNavigateToCandidate(c.id)}
                                    className="p-1.5 rounded-lg bg-surface-container-low text-text-muted hover:text-primary transition-all"
                                >
                                    <Eye className="w-3 h-3" />
                                </button>
                                <button
                                    onClick={() => setExpandedId(isExpanded ? null : c.id)}
                                    className={`px-2 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all ${isExpanded ? 'bg-primary text-white border-primary' : 'bg-blue-50 text-blue-600 border-blue-100'}`}
                                >
                                    {entry.positions.length} P.
                                </button>
                            </div>
                        </div>

                        {/* Quick Match Indicator */}
                        {!isExpanded && (
                            <div className="mt-2 flex flex-wrap gap-1">
                                {entry.positions.slice(0, 2).map(p => (
                                    <span key={p.title} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[7px] font-black border uppercase ${scoreToColor(p.combinedScore)}`}>
                                        {p.title} • %{p.combinedScore}
                                    </span>
                                ))}
                                {entry.positions.length > 2 && (
                                    <span className="text-[7px] font-bold text-text-muted self-center">+{entry.positions.length - 2} daha</span>
                                )}
                            </div>
                        )}

                        {isExpanded && (
                            <div className="mt-3 space-y-2 border-t border-outline-variant/5 pt-3 animate-in slide-in-from-top-1 duration-200">
                                {entry.positions.map(p => (
                                    <div key={p.title} className="p-2 rounded-lg bg-surface-container-low/50 border border-outline-variant/5">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[9px] font-black text-on-surface uppercase truncate pr-2">{p.title}</span>
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${scoreToColor(p.combinedScore)}`}>
                                                %{p.combinedScore}
                                            </span>
                                        </div>
                                        {p.summary && (
                                            <p className="text-[8px] text-text-muted leading-relaxed font-medium italic opacity-80">"{p.summary.slice(0, 60)}..."</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
