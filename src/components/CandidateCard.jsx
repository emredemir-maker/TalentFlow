import MatchScoreRing from './MatchScoreRing';
import { MapPin, Briefcase, Clock, ArrowUpRight, ShieldAlert, Sparkles, Brain, Zap, GraduationCap } from 'lucide-react';
import { useCandidates } from '../context/CandidatesContext';

const STATUS_CONFIG = {
    ai_analysis: { label: 'SİNYAL: AI ANALİZİ', classes: 'bg-violet-500/20 text-violet-700 dark:text-violet-400 border-violet-500/30' },
    review: { label: 'SİNYAL: MANUEL İNCELEME', classes: 'bg-amber-500/20 text-amber-800 dark:text-amber-400 border-amber-500/30' },
    interview: { label: 'SİNYAL: İLETİŞİM AKTİF', classes: 'bg-blue-500/20 text-blue-800 dark:text-blue-400 border-blue-500/30' },
    offer: { label: 'SİNYAL: TEKLİF AŞAMASI', classes: 'bg-cyan-500/20 text-cyan-800 dark:text-cyan-400 border-cyan-500/30' },
    hired: { label: 'SİNYAL: İŞE ALINDI', classes: 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-400 border-emerald-500/30' },
    rejected: { label: 'SİNYAL: BAĞLANTI KESİLDİ', classes: 'bg-red-500/20 text-red-800 dark:text-red-400 border-red-500/30' },
};

const REJECTION_REASONS = [
    { id: 'not_suitable', label: 'Uygun Değil' },
    { id: 'declined', label: 'Reddedildi' },
    { id: 'wrong_entry', label: 'Hatalı Kayıt' }
];

const AVATAR_GRADIENTS = [
    'from-electric via-blue-500 to-indigo-600',
    'from-violet-500 via-purple-500 to-fuchsia-600',
    'from-cyan-500 via-teal-500 to-emerald-600',
    'from-amber-500 via-orange-500 to-rose-600',
];

function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

export default function CandidateCard({ candidate, index = 0, onClick, isSelected, onSelect, draggable, onDragStart }) {
    const { sourceColors } = useCandidates();
    const status = STATUS_CONFIG[candidate.status] || STATUS_CONFIG.ai_analysis;
    const gradient = AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length];

    // Get source color
    const sourceName = (candidate.source || '').toLowerCase();
    const scColor = sourceColors[sourceName] || '#3b82f6'; // Default to blue if not found

    return (
        <div
            draggable={draggable}
            onDragStart={onDragStart}
            onClick={(e) => {
                if (!e.target.closest('.selection-checkbox')) {
                    onClick?.(candidate);
                }
            }}
            className={`stitch-card group p-4 cursor-pointer transition-all duration-500 relative flex flex-col h-full
            ${isSelected ? 'border-electric shadow-[0_0_20px_rgba(59,130,246,0.3)] scale-[1.01]' : 'hover:-translate-y-1'}`}
            style={{
                borderLeft: !isSelected ? `3px solid ${scColor}` : undefined,
                boxShadow: !isSelected ? `0 4px 20px -5px ${scColor}20` : undefined
            }}
        >
            {/* Ambient Source Gradient */}
            <div
                className="absolute top-0 left-0 w-32 h-32 blur-[60px] opacity-10 pointer-events-none -z-10"
                style={{ backgroundColor: scColor }}
            />
            {/* Selection Checkbox */}
            <div className={`absolute top-4 right-4 z-10 selection-checkbox ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-all`}>
                <div
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect?.();
                    }}
                    className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${isSelected
                        ? 'bg-electric border-electric text-white'
                        : 'bg-bg-secondary/40 border-border-subtle hover:border-electric'
                        }`}
                >
                    {isSelected && <Zap className="w-3.5 h-3.5 fill-current" />}
                </div>
            </div>

            {/* Top Section */}
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} p-[2px] shadow-lg group-hover:rotate-3 transition-transform duration-500 shrink-0`}>
                        <div className="w-full h-full rounded-[10px] bg-bg-secondary border border-border-subtle/10 flex items-center justify-center text-sm font-black text-white dark:text-white">
                            {getInitials(candidate.name)}
                        </div>
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-[13px] font-black text-text-primary uppercase tracking-tight group-hover:text-cyan-400 transition-colors leading-tight break-words line-clamp-2">
                            {candidate.name}
                        </h3>
                        <p className="text-[9px] font-black text-text-muted opacity-60 uppercase tracking-widest mt-0.5 truncate">{candidate.position}</p>
                    </div>
                </div>
                <div className="relative shrink-0 ml-2">
                    <MatchScoreRing score={Math.round(candidate.combinedScore || 0)} size={44} strokeWidth={3} />
                    {candidate.combinedScore >= 80 && (
                        <div className="absolute -top-1 -right-1">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                        </div>
                    )}
                </div>
            </div>

            {/* Status Badge */}
            <div className="mb-4">
                <span className={`inline-flex items-center px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] border ${status.classes}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current mr-2 animate-pulse" />
                    {status.label}
                </span>
            </div>

            {/* Meta Data */}
            <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="flex items-center gap-2 text-[10px] font-black text-text-primary bg-bg-primary/40 p-2 rounded-xl border border-border-subtle group-hover:border-electric/30 transition-all">
                    <Briefcase className="w-3 h-3 text-text-muted group-hover:text-electric transition-colors shrink-0" />
                    <span className="truncate">{candidate.company || candidate.department || 'Şirket Verisi Yok'}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-black text-text-primary bg-bg-primary/40 p-2 rounded-xl border border-border-subtle group-hover:border-electric/30 transition-all">
                    <Clock className="w-3 h-3 text-text-muted group-hover:text-violet-400 transition-colors shrink-0" />
                    <span>{candidate.experience || 0} Yıl</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-black text-text-primary bg-bg-primary/40 p-2 rounded-xl border border-border-subtle group-hover:border-electric/30 transition-all">
                    <GraduationCap className="w-3 h-3 text-text-muted group-hover:text-cyan-400 transition-colors shrink-0" />
                    <span className="truncate">{candidate.education || 'Eğitim Yok'}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-black text-text-primary bg-bg-primary/40 p-2 rounded-xl border border-border-subtle group-hover:border-electric/30 transition-all">
                    <MapPin className="w-3 h-3 text-text-muted group-hover:text-emerald-400 transition-colors shrink-0" />
                    <span className="truncate">{candidate.location || 'Konum Yok'}</span>
                </div>

                {candidate.source && (
                    <div
                        className="col-span-2 flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all shadow-sm"
                        style={{
                            backgroundColor: `${scColor}10`,
                            borderColor: `${scColor}20`,
                            color: scColor
                        }}
                    >
                        <Zap className="w-3 h-3" />
                        <span className="text-[9px] font-black uppercase tracking-widest truncate">
                            {candidate.source}
                        </span>
                    </div>
                )}
            </div>

            {/* AI Insight Highlight */}
            {(candidate.aiAnalysis?.summary || candidate.summary) && (
                <div className="mb-6 p-4 rounded-2xl bg-electric/5 border border-border-subtle relative overflow-hidden group/insight hover:bg-electric/10 transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                        <Brain className="w-4 h-4 text-electric" />
                        <span className="text-[10px] font-black text-electric-light uppercase tracking-widest">Nöral Görü</span>
                    </div>
                    <p className="text-[12px] text-text-primary leading-relaxed line-clamp-2 italic font-medium">
                        "{candidate.aiAnalysis?.summary || candidate.summary}"
                    </p>
                    <div className="absolute bottom-0 right-0 p-1 opacity-20">
                        <Zap className="w-8 h-8 text-electric" />
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end pt-4 border-t border-border-subtle mt-auto -mx-4 px-4 -mb-4 pb-4 rounded-b-[24px] bg-bg-secondary/20">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-primary border border-border-subtle text-[9px] font-black text-text-primary uppercase tracking-widest group-hover:bg-electric group-hover:text-white transition-all shadow-lg shadow-black/5">
                    <span>İncele</span>
                    <ArrowUpRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
            </div>
        </div>
    );
}
