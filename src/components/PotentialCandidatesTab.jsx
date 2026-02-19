// src/components/PotentialCandidatesTab.jsx
// Skill-based "First Look" Filter for Positions

import {
    Target,
    ArrowUpRight,
    Sparkles
} from 'lucide-react';
import { calculateMatchScore } from '../services/matchService';

export default function PotentialCandidatesTab({ position, candidates, onCandidateClick }) {
    // 1. Deduplicate candidates by ID to prevent multiple entries for same person
    const uniqueCandidates = Array.from(new Map((candidates || []).map(c => [c.id, c])).values());

    // 2. Use unified matching logic with AI priority
    const potentialCandidates = uniqueCandidates
        .map(c => {
            // Check if there is an existing autonomous AI analysis for THIS specific position
            const hasExistingAI = c.aiAnalysis && (
                c.matchedPositionTitle === position.title ||
                c.aiAnalysis.positionTitle === position.title
            );

            const matchInfo = calculateMatchScore(c, position);

            // If AI has already evaluated this pair, AI score is the absolute "Truth"
            const finalScore = hasExistingAI ? (c.matchScore || c.aiAnalysis.score) : matchInfo.score;
            const finalReasons = hasExistingAI ? (c.aiAnalysis.reasons || matchInfo.reasons) : matchInfo.reasons;

            return {
                ...c,
                totalMatchScore: finalScore,
                matchReasons: finalReasons,
                isAIProven: hasExistingAI,
                aiInsight: c.aiAnalysis?.summary || `Adayın ${matchInfo.reasons.length > 0 ? matchInfo.reasons.join(', ') : 'temel nitelikleri'} bu pozisyon için güçlü bir temel oluşturuyor.`
            };
        })

        .filter(c => c.totalMatchScore > 5) // Minimal threshold
        .sort((a, b) => b.totalMatchScore - a.totalMatchScore)
        .slice(0, 5);

    if (!candidates || candidates.length === 0) {
        return (
            <div className="p-6 text-center text-navy-400 text-sm">
                Sistemde henüz aday bulunmuyor.
            </div>
        );
    }

    if (potentialCandidates.length === 0) {
        return (
            <div className="p-6 text-center text-navy-400 text-sm">
                Bu pozisyon için uygun eşleşme bulunamadı.
            </div>
        );
    }

    return (
        <div className="animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2 mb-4 px-1">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <h4 className="text-sm font-bold text-white">Akıllı Pozisyon Uyumluluk Analizi</h4>
            </div>

            <div className="space-y-3">
                {potentialCandidates.map((candidate, idx) => (
                    <div
                        key={candidate.id}
                        onClick={() => onCandidateClick?.(candidate)}
                        className="group relative p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-electric/30 transition-all cursor-pointer"
                    >
                        <div className="flex items-start justify-between gap-4">

                            {/* Candidate Info */}
                            <div className="flex items-center gap-3">
                                <span className={`flex-shrink-0 w-8 h-8 rounded-full bg-navy-800 flex items-center justify-center text-xs font-bold ${idx === 0 ? 'text-emerald-400 border border-emerald-500/30' : 'text-navy-400'}`}>
                                    {idx + 1}
                                </span>
                                <div>
                                    <h5 className="text-sm font-bold text-white group-hover:text-electric-light transition-colors">
                                        {candidate.name}
                                    </h5>
                                    <div className="flex items-center gap-2 mt-1">
                                        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border ${candidate.isAIProven ? 'bg-electric/10 border-electric/30' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                                            <Target className={`w-3 h-3 ${candidate.isAIProven ? 'text-electric-light' : 'text-emerald-400'}`} />
                                            <span className={`text-[10px] font-bold ${candidate.isAIProven ? 'text-electric-light' : 'text-emerald-400'}`}>
                                                %{candidate.totalMatchScore} {candidate.isAIProven ? 'AI Onaylı' : 'Uyumluluk'}
                                            </span>
                                            {candidate.isAIProven && <Sparkles className="w-2.5 h-2.5 text-electric-light" />}
                                        </div>
                                    </div>

                                </div>
                            </div>

                            <button className="p-1.5 rounded-lg text-navy-400 hover:text-white hover:bg-white/[0.1] transition-all">
                                <ArrowUpRight className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Analysis Note */}
                        <div className="mt-3 pl-11">
                            <div className="relative p-2.5 rounded-lg bg-electric/5 border border-electric/10">
                                <div className="absolute top-3 left-0 w-0.5 h-4 bg-electric rounded-r-full" />
                                <p className="text-[11px] text-navy-200 leading-relaxed italic">
                                    <span className="not-italic text-electric font-bold mr-1">AI Analiz:</span>
                                    {candidate.aiInsight}
                                </p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
