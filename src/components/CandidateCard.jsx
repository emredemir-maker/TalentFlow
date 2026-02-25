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
            className={`group rounded-3xl p-6 cursor-pointer transition-all duration-300 relative overflow-hidden backdrop-blur-xl border flex flex-col
            ${isSelected ? 'bg-gradient-to-br from-electric/10 to-transparent border-electric/40 shadow-[0_0_25px_rgba(59,130,246,0.15)] ring-1 ring-electric/30 scale-[1.01]' : 'bg-navy-900/10 hover:bg-navy-900/20 border-border-subtle hover:border-navy-400/20 hover:shadow-2xl hover:-translate-y-1'}
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric/30 h-full`}
        >
            <div className={`absolute top-0 right-0 w-40 h-40 bg-electric/10 rounded-full blur-[60px] -z-10 transition-opacity duration-300 pointer-events-none ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
            {/* Selection Checkbox */}
            <div className={`absolute top-4 right-4 z-10 selection-checkbox ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'} transition-opacity`}>
                <div
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect?.();
                    }}
                    className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${isSelected
                        ? 'bg-electric border-electric text-text-primary'
                        : 'bg-navy-800/20 border-border-subtle hover:border-electric/50'
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
                        <h3 className="text-[15px] font-semibold text-text-primary truncate">
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
                        const displayScore = Math.round(candidate.combinedScore || 0);
                        const hasAi = !!(candidate.aiAnalysis || candidate.positionAnalyses);
                        const hasInterview = !!(candidate.interviewSessions?.length > 0);

                        return (
                            <>
                                <MatchScoreRing score={displayScore} size={48} />
                                <div className="flex flex-col items-end mt-1">
                                    {hasInterview && (
                                        <div className="flex items-center gap-0.5 text-blue-400">
                                            <ShieldAlert className="w-2.5 h-2.5" />
                                            <span className="text-[8px] font-black uppercase tracking-tighter">Verified</span>
                                        </div>
                                    )}
                                    {hasAi && !hasInterview && (
                                        <div className="flex items-center gap-0.5 text-electric-light">
                                            <Sparkles className="w-2.5 h-2.5" />
                                            <span className="text-[8px] font-black uppercase tracking-tighter">AI Only</span>
                                        </div>
                                    )}
                                    {hasAi && hasInterview && (
                                        <div className="flex items-center gap-0.5 text-emerald-400">
                                            <Sparkles className="w-2.5 h-2.5" />
                                            <span className="text-[8px] font-black uppercase tracking-tighter">Full Match</span>
                                        </div>
                                    )}
                                </div>
                            </>
                        );
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
                            className="px-2 py-0.5 rounded-md text-[11px] font-medium text-text-secondary bg-navy-800/20 border border-border-subtle"
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
                    <p className="text-[11px] text-text-secondary leading-relaxed line-clamp-2 italic group-hover/insight:line-clamp-none transition-all duration-300">
                        "{candidate.aiAnalysis?.summary || candidate.summary}"
                    </p>
                </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-border-subtle mt-auto">
                <span className="text-[12px] font-bold text-text-muted">{candidate.salary}</span>
                <div className="flex items-center gap-1 text-[12px] text-electric opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1">
                    <span className="font-extrabold uppercase tracking-wide">Detayları Gör</span>
                    <ArrowUpRight className="w-4 h-4" />
                </div>
            </div>
        </div>
    );
}
