// src/components/CandidateCard.jsx
// Premium candidate card with match score ring

import MatchScoreRing from './MatchScoreRing';
import { MapPin, Briefcase, Clock, ArrowUpRight, ShieldAlert, Sparkles } from 'lucide-react';


const STATUS_CONFIG = {
    ai_analysis: { label: 'AI Analiz', classes: 'bg-violet-500/10 text-violet-400 ring-violet-500/20' },
    review: { label: 'İnceleme', classes: 'bg-amber-500/10 text-amber-400 ring-amber-500/20' },
    interview: { label: 'Mülakat', classes: 'bg-blue-500/10 text-blue-400 ring-blue-500/20' },
    offer: { label: 'Teklif', classes: 'bg-cyan-500/10 text-cyan-400 ring-cyan-500/20' },
    hired: { label: 'İşe Alındı', classes: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20' },
    rejected: { label: 'Red', classes: 'bg-red-500/10 text-red-400 ring-red-500/20' },
};


const REJECTION_REASONS = [
    { id: 'not_suitable', label: 'Uygun Değil' },
    { id: 'declined', label: 'Kabul Etmedi' },
    { id: 'wrong_entry', label: 'Hatalı Kayıt' }
];

const AVATAR_GRADIENTS = [
    'from-indigo-500 to-purple-600',
    'from-blue-500 to-cyan-500',
    'from-emerald-500 to-teal-500',
    'from-amber-500 to-orange-500',
    'from-pink-500 to-rose-500',
    'from-violet-500 to-indigo-500',
];

function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

export default function CandidateCard({ candidate, index = 0, onClick, isSelected, onSelect }) {
    const status = STATUS_CONFIG[candidate.status] || STATUS_CONFIG.ai_analysis;

    const gradient = AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length];

    return (
        <div
            onClick={(e) => {
                if (!e.target.closest('.selection-checkbox')) {
                    onClick?.(candidate);
                }
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onClick?.(candidate)}
            className={`group glass gradient-border rounded-2xl p-5 cursor-pointer transition-all duration-300 relative
            ${isSelected ? 'bg-electric/5 border-electric/30 ring-1 ring-electric/30' : 'hover:bg-white/[0.04] hover:shadow-[0_8px_32px_rgba(59,130,246,0.08)]'}
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric/30`}
        >
            {/* Selection Checkbox */}
            <div className={`absolute top-4 right-4 z-10 selection-checkbox ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'} transition-opacity`}>
                <div
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect?.();
                    }}
                    className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${isSelected
                        ? 'bg-electric border-electric text-white'
                        : 'bg-white/10 border-white/20 hover:border-electric/50'
                        }`}
                >
                    {isSelected && <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                </div>
            </div>

            {/* Top: Avatar + Name + Score */}
            <div className="flex items-start justify-between mb-4 pr-8">
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-lg`}>
                        {getInitials(candidate.name)}
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-[15px] font-semibold text-navy-100 truncate group-hover:text-white transition-colors">
                            {candidate.name}
                        </h3>
                        <p className="text-[12px] text-navy-400 truncate">{candidate.position}</p>


                        {(() => {
                            // 1. Start with the explicitly assigned match information
                            let displayScore = candidate.matchScore || 0;
                            let displayTitle = candidate.matchedPositionTitle;

                            // 2. If we have a specific assigned position, ensure we use THAT analysis score if it exists
                            if (displayTitle && candidate.positionAnalyses?.[displayTitle]) {
                                displayScore = candidate.positionAnalyses[displayTitle].score;
                            }
                            // 3. Otherwise, find the absolute best match found across all positions analyzed
                            else if (candidate.positionAnalyses) {
                                Object.entries(candidate.positionAnalyses).forEach(([title, analysis]) => {
                                    if (analysis && analysis.score > displayScore) {
                                        displayScore = analysis.score;
                                        displayTitle = title;
                                    }
                                });
                            }

                            if (displayTitle) {
                                return (
                                    <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                                        <span className="text-electric-light font-semibold uppercase tracking-wide">
                                            {candidate.matchedPositionTitle === displayTitle ? 'EŞLEŞEN:' : 'EN UYGUN:'}
                                        </span>
                                        <span className="text-white font-bold truncate max-w-[120px]" title={displayTitle}>
                                            {displayTitle}
                                        </span>
                                        {displayScore > 0 && (
                                            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${displayScore >= 70 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-navy-500/20 text-navy-300'}`}>
                                                %{Math.round(displayScore)}
                                            </span>
                                        )}
                                    </div>
                                );
                            } else if (candidate.preAssessment) {
                                return (
                                    <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                                        <span className="text-emerald-400 font-semibold uppercase tracking-wide">
                                            Önerilen:
                                        </span>
                                        <span className="text-white font-bold truncate max-w-[120px]" title={candidate.preAssessment.suggestedOpenPosition || candidate.preAssessment.potentialPosition}>
                                            {candidate.preAssessment.suggestedOpenPosition || candidate.preAssessment.potentialPosition}
                                        </span>
                                    </div>
                                )
                            }
                            return null;
                        })()}


                    </div>
                </div>
                <div className="flex flex-col items-end">
                    {(() => {
                        let displayScore = candidate.matchScore || 0;
                        let displayTitle = candidate.matchedPositionTitle;

                        if (displayTitle && candidate.positionAnalyses?.[displayTitle]) {
                            displayScore = candidate.positionAnalyses[displayTitle].score;
                        } else if (candidate.positionAnalyses) {
                            Object.entries(candidate.positionAnalyses).forEach(([title, analysis]) => {
                                if (analysis && analysis.score > displayScore) {
                                    displayScore = analysis.score;
                                    displayTitle = title;
                                }
                            });
                        }

                        displayScore = Math.round(Math.min(displayScore, 100));

                        // Color mapping for pre-assessment
                        const suitabilityColors = {
                            "Uygun": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
                            "Potansiyel": "bg-amber-500/20 text-amber-400 border-amber-500/30",
                            "Uygun Değil": "bg-red-500/20 text-red-400 border-red-500/30",
                        };

                        if (candidate.positionAnalyses || candidate.aiAnalysis || displayScore > 0) {
                            return (
                                <>
                                    <MatchScoreRing score={displayScore} size={48} />
                                    {(candidate.aiAnalysis || candidate.positionAnalyses) && (
                                        <div className="flex flex-col items-end mt-1">
                                            <div className="flex items-center gap-0.5 text-electric-light animate-pulse">
                                                <Sparkles className="w-2.5 h-2.5" />
                                                <span className="text-[8px] font-bold uppercase tracking-tighter">AI Skoru</span>
                                            </div>
                                        </div>
                                    )}
                                </>
                            );
                        } else if (candidate.preAssessment) {
                            const suit = candidate.preAssessment.suitability;
                            const classes = suitabilityColors[suit] || "bg-navy-500/20 text-navy-300 border-navy-500/30";
                            return (
                                <div className="flex flex-col items-end">
                                    <div className={`px-2 py-1.5 rounded-lg border text-[11px] font-bold text-center leading-tight shadow-lg backdrop-blur-sm ${classes}`}>
                                        {suit}
                                    </div>
                                    <div className="flex flex-col items-end mt-1">
                                        <div className="flex items-center gap-0.5 text-emerald-400">
                                            <Sparkles className="w-2.5 h-2.5" />
                                            <span className="text-[8px] font-bold uppercase tracking-tighter">Ön Analiz</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        } else {
                            return (
                                <div className="flex items-center justify-center w-12 h-12 rounded-full border-2 border-dashed border-white/10 text-white/30 text-[10px] font-bold">
                                    %?
                                </div>
                            );
                        }
                    })()}
                </div>
            </div>

            {/* Status badge */}
            <div className="mb-3">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${status.classes}`}>
                    {status.label}
                    {candidate.status === 'rejected' && candidate.rejectionReason && (
                        <span className="ml-1 opacity-75 font-medium border-l border-current pl-1 ml-1.5">
                            {REJECTION_REASONS.find(r => r.id === candidate.rejectionReason)?.label}
                        </span>
                    )}
                </span>
            </div>

            {/* Meta */}
            <div className="space-y-1.5 mb-4">
                {/* Human-in-the-Loop Warning */}
                {candidate.matchScore > 0 && candidate.matchScore < 75 && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-[11px] font-bold animate-in slide-in-from-left-2">
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                        <span>Manuel İnceleme Gerekli</span>
                    </div>
                )}

                <div className="flex items-center gap-2 text-[12px] text-navy-400">
                    <Briefcase className="w-3.5 h-3.5 text-navy-500" />
                    <span>{candidate.department}</span>
                    <span className="text-navy-600">•</span>
                    <Clock className="w-3.5 h-3.5 text-navy-500" />
                    <span>{candidate.experience} yıl</span>
                </div>
                <div className="flex items-center gap-2 text-[12px] text-navy-400">
                    <MapPin className="w-3.5 h-3.5 text-navy-500" />
                    <span>{candidate.location}</span>
                </div>
            </div>

            {/* Skills */}
            {candidate.skills && candidate.skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                    {candidate.skills.slice(0, 3).map((skill) => (
                        <span
                            key={skill}
                            className="px-2 py-0.5 rounded-md text-[11px] font-medium text-navy-300 bg-white/[0.04] border border-white/[0.06]"
                        >
                            {skill}
                        </span>
                    ))}
                    {candidate.skills.length > 3 && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-medium text-navy-500 bg-white/[0.02]">
                            +{candidate.skills.length - 3}
                        </span>
                    )}
                </div>
            )}

            {/* AI Insight Highlight */}
            {(candidate.aiAnalysis?.summary || candidate.summary) && (
                <div className="mb-4 p-2.5 rounded-xl bg-electric/5 border border-electric/10 group/insight">
                    <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-electric-light uppercase tracking-widest">
                        <Sparkles className="w-3 h-3" /> AI Görüşü
                    </div>
                    <p className="text-[11px] text-navy-200 leading-relaxed line-clamp-2 italic group-hover/insight:line-clamp-none transition-all duration-300">
                        "{candidate.aiAnalysis?.summary || candidate.summary}"
                    </p>
                </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                <span className="text-[12px] text-navy-500 font-medium">{candidate.salary}</span>
                <div className="flex items-center gap-1 text-[12px] text-electric-light opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="font-medium">Detaylar</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                </div>
            </div>
        </div>
    );
}
