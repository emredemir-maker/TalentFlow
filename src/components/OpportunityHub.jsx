// src/components/OpportunityHub.jsx
// "Smart Match" Notifications & Opportunity Hub
// Displays real-time AI recommendations based on actual database data

import { useState, useMemo } from 'react';
import {
    Sparkles,
    Lightbulb,
    ArrowRight,
    CheckCircle2,
    Calendar,
    HelpCircle,
    TrendingUp,
    Layout
} from 'lucide-react';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';

export default function OpportunityHub() {
    const { enrichedCandidates, candidates } = useCandidates();
    const { positions } = usePositions();
    const [expandedId, setExpandedId] = useState(null);

    // Dynamic Opportunity Calculation
    // Retrieves top-scoring candidates (AI + Interview) across open positions
    const opportunities = useMemo(() => {
        const pool = enrichedCandidates || candidates;
        if (!pool?.length || !positions?.length) return [];

        const openPositions = positions.filter(p => p.status === 'open');

        let opps = [];

        openPositions.forEach(pos => {
            pool.forEach(c => {
                // Use position-specific AI score if it exists, otherwise use bestScore
                const posAiScore = c.positionAnalyses?.[pos.title]?.score || 0;

                // Only consider as opportunity if AI score for THIS position is high
                if (posAiScore >= 75) {
                    // Recalculate combined score for THIS specific position 
                    // (Context combined score uses global best, we want position specific here)
                    const interviewScore = c.hasInterview ? c.interviewScore : null;
                    const combinedPosScore = interviewScore !== null
                        ? Math.round((posAiScore + interviewScore) / 2)
                        : posAiScore;

                    opps.push({
                        id: `${pos.id}-${c.id}`,
                        posId: pos.id,
                        posTitle: pos.title,
                        candidate: {
                            ...c,
                            posSpecificScore: posAiScore,
                            combinedPosScore,
                        },
                        // Proactive suggestion logic
                        suggestion: !c.hasInterview
                            ? 'Mülakat Planla'
                            : combinedPosScore >= 85
                                ? 'Teklif Hazırla'
                                : 'Değerlendirmeyi İncele'
                    });
                }
            });
        });

        // Unique opportunities per candidate-position, sorted by combined score
        return opps
            .sort((a, b) => b.combinedPosScore - a.combinedPosScore)
            .slice(0, 4); // Show top 4
    }, [enrichedCandidates, candidates, positions]);

    function scoreToColor(score) {
        if (score >= 85) return 'bg-emerald-500';
        if (score >= 70) return 'bg-blue-500';
        return 'bg-amber-500';
    }

    if (opportunities.length === 0) {
        return (
            <div className="glass rounded-3xl p-8 border border-border-subtle text-center">
                <div className="w-16 h-16 rounded-2xl bg-navy-800/10 flex items-center justify-center mx-auto mb-4 text-navy-500">
                    <Layout className="w-8 h-8 opacity-20" />
                </div>
                <h3 className="text-text-primary font-bold mb-1">Fırsat Havuzu Boş</h3>
                <p className="text-xs text-text-muted">Yeni adaylar eklendikçe burada proaktif öneriler göreceksiniz.</p>
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
                        <p className="text-xs text-text-muted">Veritabanına dayalı anlık eşleşmeler</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-800/20 border border-border-subtle text-xs font-medium text-text-secondary">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>{opportunities.length} Aktif Fırsat</span>
                </div>
            </div>

            {/* Opportunities List */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {opportunities.map((opt) => (
                    <div
                        key={opt.id}
                        className="group relative rounded-2xl bg-navy-800/10 border border-border-subtle hover:bg-navy-800/20 hover:border-navy-400/20 transition-all overflow-hidden flex flex-col"
                    >
                        {/* Main Row */}
                        <div className="p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between flex-1">

                            {/* Position Info */}
                            <div className="flex items-center gap-4">
                                <div className={`relative w-12 h-12 rounded-2xl bg-gradient-to-br from-navy-800 to-navy-900 border border-white/[0.05] flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-lg`}>
                                    {opt.candidate.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
                                    {opt.candidate.hasInterview && (
                                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-navy-900 flex items-center justify-center shadow-lg" title="Mülakat Tamamlandı">
                                            <CheckCircle2 className="w-3 h-3 text-white" />
                                        </div>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-bold text-text-primary text-[13px] truncate">{opt.candidate.name}</h4>
                                        <div className={`flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded ${scoreToColor(opt.combinedPosScore)} bg-opacity-20 text-text-primary border border-white/5`}>
                                            %{opt.combinedPosScore}
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-text-muted truncate">
                                        <span className="text-amber-500 font-bold">{opt.posTitle}</span> için {opt.candidate.hasInterview ? 'onaylı' : 'potansiyel'} eşleşme
                                    </p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                                <button
                                    onClick={() => setExpandedId(expandedId === opt.id ? null : opt.id)}
                                    className="flex-1 sm:flex-none px-3 py-2 rounded-lg bg-navy-800/20 hover:bg-navy-800/40 text-[10px] font-bold text-text-muted border border-border-subtle flex items-center justify-center gap-1.5 transition-all uppercase tracking-widest"
                                >
                                    Detay
                                </button>
                                <button className="flex-1 sm:sm:flex-none px-4 py-2 rounded-xl bg-electric hover:bg-electric-dark text-[11px] font-black text-white shadow-xl shadow-electric/20 flex items-center justify-center gap-2 transition-all active:scale-95">
                                    {opt.suggestion === 'Mülakat Planla' ? <Calendar className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                                    {opt.suggestion}
                                </button>
                            </div>
                        </div>

                        {/* Analysis Detail */}
                        {expandedId === opt.id && (
                            <div className="px-4 pb-4 pt-0 animate-in slide-in-from-top-2">
                                <div className="p-3 rounded-xl bg-navy-950/20 border border-border-subtle space-y-2">
                                    <div className="flex items-start gap-3">
                                        <TrendingUp className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                                        <p className="text-[11px] text-text-secondary leading-relaxed">
                                            {opt.candidate.positionAnalyses?.[opt.posTitle]?.summary || opt.candidate.aiAnalysis?.summary || 'AI analizi bu aday için yüksek potansiyel gösteriyor.'}
                                        </p>
                                    </div>
                                    {opt.candidate.hasInterview && (
                                        <div className="flex items-start gap-3 pt-2 border-t border-white/5">
                                            <Calendar className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                                            <p className="text-[11px] text-blue-400 font-medium">
                                                Mülakat Puanı: %{opt.candidate.interviewScore} • AI Puanı: %{opt.candidate.posSpecificScore}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
