import { useState } from 'react';
import MatchScoreRing from './MatchScoreRing';
import CandidateAvatar from './CandidateAvatar';
import { MapPin, Briefcase, Clock, ArrowUpRight, Sparkles, Brain, Zap, GraduationCap, Columns3, ChevronDown, CheckCircle2 } from 'lucide-react';
import { useCandidates } from '../context/CandidatesContext';
import { useAuth } from '../context/AuthContext';
import { applyPiiMask } from '../utils/pii';
import { STAGES, getStage } from '../utils/pipelineStages';
import { resolveCandidateStage } from '../utils/candidateTable';

// Aşama tanımları ARTIK KOPYALANMIYOR — tek kaynak utils/pipelineStages.
// İki kopya (rozet + seçici) burada duruyordu; ikisi de altı aşamayı elle
// sayıyordu ve etiketleri kanonik listeden farklıydı ("AI ANALİZİ",
// "BAĞLANTI KESİLDİ"). Yeni bir aşama eklendiğinde sessizce eksik kalırlardı.

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export default function CandidateCard({ candidate: rawCandidate, index = 0, onClick, isSelected, onSelect, draggable, onDragStart }) {
    const { sourceColors, compareIds, toggleCompareCandidate, updateCandidate } = useCandidates();
    const { role } = useAuth();
    const [statusOpen, setStatusOpen] = useState(false);
    const [statusLoading, setStatusLoading] = useState(false);

    const candidate = applyPiiMask(rawCandidate, role);

    const isComparing = compareIds.includes(rawCandidate.id);
    const currentStatus = resolveCandidateStage(rawCandidate);
    const status = getStage(currentStatus);

    const sourceName = (candidate.source || '').toLowerCase();
    const scColor = sourceColors[sourceName] || '#3b82f6';

    const handleCardStatusChange = async (e, newStatus) => {
        e.stopPropagation();
        if (statusLoading || newStatus === currentStatus) return;
        setStatusOpen(false);
        setStatusLoading(true);
        try {
            const now = new Date().toISOString();
            await updateCandidate(candidate.id, {
                status: newStatus,
                statusChangedAt: now,
                statusChangedBy: 'HR',
            });
        } finally {
            setStatusLoading(false);
        }
    };

    return (
        <div
            draggable={draggable}
            onDragStart={onDragStart}
            onClick={(e) => {
                if (!e.target.closest('.selection-checkbox') && !e.target.closest('.status-selector')) {
                    onClick?.(rawCandidate);
                }
            }}
            className={`stitch-card group p-3 cursor-pointer transition-all duration-500 relative flex flex-col h-full
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
                <div className="flex items-center gap-2 min-w-0">
                    <CandidateAvatar
                        name={candidate.name}
                        photo={candidate.photo}
                        photoUrl={candidate.photoUrl}
                        profileImage={candidate.profileImage}
                        size="lg"
                        rounded="rounded-xl"
                        className="shadow-md"
                    />
                    <div className="min-w-0 flex-1">
                        <h3 className="text-[12px] font-black text-text-primary uppercase tracking-tight group-hover:text-cyan-400 transition-colors leading-tight break-words line-clamp-2">
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

            {/* Status Badge — clickable stage selector */}
            <div className="mb-4 relative status-selector">
                <button
                    onClick={(e) => { e.stopPropagation(); setStatusOpen(v => !v); }}
                    disabled={statusLoading}
                    title="Aşama değiştir"
                    style={{ color: status.color, background: status.bg, borderColor: status.border }}
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] border transition-all ${statusLoading ? 'opacity-50' : 'hover:opacity-80'}`}
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    {status.label}
                    <ChevronDown className={`w-3 h-3 transition-transform ${statusOpen ? 'rotate-180' : ''}`} />
                </button>

                {statusOpen && (
                    <>
                        <div
                            className="fixed inset-0 z-40"
                            onClick={(e) => { e.stopPropagation(); setStatusOpen(false); }}
                        />
                        <div className="absolute top-8 left-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl py-1 min-w-[190px] animate-in fade-in zoom-in-95 duration-150">
                            {STAGES.map(stage => {
                                const isCurrent = stage.key === currentStatus;
                                return (
                                    <button
                                        key={stage.key}
                                        disabled={isCurrent}
                                        onClick={(e) => handleCardStatusChange(e, stage.key)}
                                        title={stage.desc}
                                        style={isCurrent ? { color: stage.color, background: stage.bg } : undefined}
                                        className={`w-full text-left px-3 py-1.5 text-[10px] font-bold flex items-center gap-2 whitespace-nowrap transition-colors ${
                                            isCurrent ? 'cursor-default' : 'text-slate-700 hover:bg-n50'
                                        }`}
                                    >
                                        {isCurrent
                                            ? <CheckCircle2 className="w-3 h-3 shrink-0" />
                                            : <span className="w-3 h-3 shrink-0" />
                                        }
                                        {stage.label}
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
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
                <div className="mb-6 p-3 rounded-2xl bg-electric/5 border border-border-subtle relative overflow-hidden group/insight hover:bg-electric/10 transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                        <Brain className="w-4 h-4 text-electric" />
                        <span className="text-[10px] font-black text-electric-light uppercase tracking-widest">Nöral Görü</span>
                    </div>
                    <p className="text-[11px] text-text-primary leading-relaxed line-clamp-2 italic font-medium">
                        "{candidate.aiAnalysis?.summary || candidate.summary}"
                    </p>
                    <div className="absolute bottom-0 right-0 p-1 opacity-20">
                        <Zap className="w-8 h-8 text-electric" />
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-border-subtle mt-auto -mx-4 px-4 -mb-4 pb-4 rounded-b-[24px] bg-bg-secondary/20">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleCompareCandidate(candidate.id);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all shadow-sm ${isComparing
                        ? 'bg-violet-500 border-violet-500 text-white'
                        : 'bg-bg-primary border-border-subtle text-text-muted hover:border-violet-500 hover:text-violet-500'
                        }`}
                >
                    <Columns3 className="w-3 h-3" />
                    <span>{isComparing ? 'Seçildi' : 'Karşılaştır'}</span>
                </button>

                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-primary border border-border-subtle text-[9px] font-black text-text-primary uppercase tracking-widest group-hover:bg-electric group-hover:text-white transition-all shadow-lg shadow-black/5">
                    <span>İncele</span>
                    <ArrowUpRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
            </div>
        </div>
    );
}
