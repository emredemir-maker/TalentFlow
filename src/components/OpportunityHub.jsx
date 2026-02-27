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
        if (score >= 85) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
        if (score >= 70) return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
        return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    }

    if (groupedOpportunities.length === 0) {
        return (
            <div className="glass rounded-3xl p-8 border border-border-subtle text-center">
                <div className="w-16 h-16 rounded-2xl bg-navy-800/10 flex items-center justify-center mx-auto mb-4 text-navy-500">
                    <Layout className="w-8 h-8 opacity-20" />
                </div>
                <h3 className="text-text-primary font-bold mb-1">Fırsat Havuzu Boş</h3>
                <p className="text-xs text-text-muted">Adaylar analiz edildikçe %{THRESHOLD} barajını aşan eşleşmeler burada görünecek.</p>
            </div>
        );
    }

    return (
        <div className="glass rounded-3xl p-6 border border-border-subtle relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-electric/5 rounded-full blur-3xl -z-10" />

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                        <Lightbulb className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-text-primary">Fırsat Havuzu</h3>
                        <p className="text-xs text-text-muted">%{THRESHOLD}+ uyumluluk barajını aşan adaylar</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-800/20 border border-border-subtle text-xs font-medium text-text-secondary">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>{groupedOpportunities.length} Aday</span>
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
                            className="group relative rounded-2xl bg-navy-800/10 border border-border-subtle hover:bg-navy-800/20 hover:border-navy-400/20 transition-all overflow-hidden"
                        >
                            {/* Candidate Header */}
                            <div className="p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                                <div
                                    className="flex items-center gap-4 cursor-pointer flex-1 min-w-0"
                                    onClick={() => handleNavigateToCandidate(c.id)}
                                >
                                    <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-navy-800 to-navy-900 border border-white/[0.05] flex items-center justify-center text-sm font-bold text-text-primary shrink-0 shadow-lg">
                                        {c.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
                                        {c.hasInterview && (
                                            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-navy-900 flex items-center justify-center shadow-lg" title="Mülakat Tamamlandı">
                                                <CheckCircle2 className="w-3 h-3 text-text-primary" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-bold text-text-primary text-[13px] truncate hover:text-electric transition-colors">{c.name}</h4>
                                        <p className="text-[11px] text-text-muted truncate">{c.position}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <button
                                        onClick={() => handleNavigateToCandidate(c.id)}
                                        className="flex-1 sm:flex-none px-3 py-2 rounded-lg bg-navy-800/20 hover:bg-navy-800/40 text-[10px] font-bold text-text-muted border border-border-subtle flex items-center justify-center gap-1.5 transition-all uppercase tracking-widest"
                                    >
                                        <Eye className="w-3 h-3" /> Detay
                                    </button>
                                    <button
                                        onClick={() => setExpandedId(isExpanded ? null : c.id)}
                                        className="flex-1 sm:flex-none px-3 py-2 rounded-lg bg-electric/10 hover:bg-electric/20 text-[10px] font-bold text-electric border border-electric/20 flex items-center justify-center gap-1.5 transition-all"
                                    >
                                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                        {entry.positions.length} Pozisyon
                                    </button>
                                </div>
                            </div>

                            {/* Qualifying Positions (always show inline summary) */}
                            <div className="px-4 pb-3">
                                <div className="flex flex-wrap gap-1.5">
                                    {entry.positions.map(p => (
                                        <span key={p.title} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${scoreToColor(p.combinedScore)}`}>
                                            {p.title} • %{p.combinedScore}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Expanded Details */}
                            {isExpanded && (
                                <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200 space-y-2">
                                    {entry.positions.map(p => (
                                        <div key={p.title} className="p-3 rounded-xl bg-navy-950/20 border border-border-subtle">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-bold text-text-primary">{p.title}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-text-muted">AI: %{p.aiScore}</span>
                                                    {c.hasInterview && (
                                                        <span className="text-[10px] text-blue-400">Mülakat: %{c.interviewScore}</span>
                                                    )}
                                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${scoreToColor(p.combinedScore)}`}>
                                                        %{p.combinedScore}
                                                    </span>
                                                </div>
                                            </div>
                                            {p.summary && (
                                                <div className="flex items-start gap-2">
                                                    <TrendingUp className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                                                    <p className="text-[10px] text-text-secondary leading-relaxed">{p.summary}</p>
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
