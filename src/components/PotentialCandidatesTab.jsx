// src/components/PotentialCandidatesTab.jsx
// STAR-based "First Look" Filter for Positions

import { useState } from 'react';
import {
    Users,
    Target,
    ArrowUpRight,
    Sparkles,
    Star
} from 'lucide-react';

export default function PotentialCandidatesTab({ position, candidates }) {
    // Filter and sort candidates based on STAR 'Result' score and position requirements
    // In a real app, this would use more complex logic or a backend query
    const potentialCandidates = candidates
        // Mock filtering logic - in reality, check for skills/experience match
        .filter(c => c.department === position.department)
        .map(c => {
            // Mock STAR scores if not present
            const starScores = c.aiAnalysis?.star_scores || { Result: Math.floor(Math.random() * 4) + 6 };
            return {
                ...c,
                starResultScore: starScores.Result,
                // Mock AI Insight
                aiInsight: `Aday, ${c.experience} yıllık deneyiminde benzer ölçekte projeleri başarıyla tamamlamış. Özellikle son projesindeki %${Math.floor(Math.random() * 20) + 10} verimlilik artışı (STAR - Result) bu pozisyon için güçlü bir gösterge.`
            };
        })
        .sort((a, b) => b.starResultScore - a.starResultScore) // Sort by Result score descending
        .slice(0, 5); // Take top 5

    if (potentialCandidates.length === 0) {
        return (
            <div className="p-6 text-center text-navy-400 text-sm">
                Bu pozisyon için henüz uygun eşleşme bulunamadı.
            </div>
        );
    }

    return (
        <div className="animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2 mb-4 px-1">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h4 className="text-sm font-bold text-white">Potansiyel Adaylar (STAR Odaklı)</h4>
            </div>

            <div className="space-y-3">
                {potentialCandidates.map((candidate, idx) => (
                    <div key={candidate.id} className="group relative p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-all">
                        <div className="flex items-start justify-between gap-4">

                            {/* Candidate Info */}
                            <div className="flex items-center gap-3">
                                <span className={`flex-shrink-0 w-8 h-8 rounded-full bg-navy-800 flex items-center justify-center text-xs font-bold ${idx === 0 ? 'text-amber-400 border border-amber-500/30' : 'text-navy-400'}`}>
                                    {idx + 1}
                                </span>
                                <div>
                                    <h5 className="text-sm font-bold text-white group-hover:text-electric-light transition-colors">
                                        {candidate.name}
                                    </h5>
                                    <div className="flex items-center gap-2 text-[11px] text-navy-400">
                                        <span className="flex items-center gap-1">
                                            <Target className="w-3 h-3 text-emerald-400" />
                                            Result Skoru: <span className="text-emerald-400 font-bold">{candidate.starResultScore}/10</span>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Action */}
                            <button className="p-1.5 rounded-lg text-navy-400 hover:text-white hover:bg-white/[0.1] transition-all">
                                <ArrowUpRight className="w-4 h-4" />
                            </button>
                        </div>

                        {/* AI Insight Note */}
                        <div className="mt-3 pl-11">
                            <div className="relative p-2.5 rounded-lg bg-electric/5 border border-electric/10">
                                <div className="absolute top-3 left-0 w-0.5 h-4 bg-electric rounded-r-full" />
                                <p className="text-[11px] text-navy-200 leading-relaxed italic">
                                    <span className="not-italic text-electric font-bold mr-1">AI Insight:</span>
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
