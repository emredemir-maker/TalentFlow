import { CheckCircle, Circle, Zap, Target, Info, X, RefreshCw, MessageSquare } from 'lucide-react';
import { useState } from 'react';

const STAR_CRITERIA = {
    Situation: { label: 'Durum (Context Clarity)', color: 'text-violet-400', bg: 'bg-violet-500/10', ring: 'ring-violet-500/20' },
    Task: { label: 'Görev (Goal Definition)', color: 'text-blue-400', bg: 'bg-blue-500/10', ring: 'ring-blue-500/20' },
    Action: { label: 'Eylem (Skill Usage)', color: 'text-amber-400', bg: 'bg-amber-500/10', ring: 'ring-amber-500/20' },
    Result: { label: 'Sonuç (Metrics & Impact)', color: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20' },
};

export default function StarScoreCard({ analysis, candidate, onRefresh }) {
    const [selectedDetail, setSelectedDetail] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    const scores = analysis || {
        Situation: 0,
        Task: 0,
        Action: 0,
        Result: 0,
        Summary: "Analiz bekleniyor..."
    };

    const totalScore = Math.round(
        ((Number(scores.Situation) || 0) + (Number(scores.Task) || 0) + (Number(scores.Action) || 0) + (Number(scores.Result) || 0)) / 4 * 10
    );

    const handleRefresh = async () => {
        if (!onRefresh) return;
        setRefreshing(true);
        try {
            await onRefresh();
        } finally {
            setRefreshing(false);
        }
    };

    return (
        <div className="cyber-glass rounded-[2rem] p-6 border border-white/10 relative overflow-hidden group tech-grid h-full flex flex-col">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-electric/5 rounded-full blur-[80px] -z-10 pointer-events-none" />

            {/* Header */}
            <div className="flex items-center justify-between mb-5 shrink-0">
                <div>
                    <h3 className="text-xs font-black text-text-primary flex items-center gap-2 hud-text tracking-widest neon-glow-blue">
                        <Target className="w-4 h-4 text-electric" />
                        STAR ANALİZ SKORU
                    </h3>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="p-2 rounded-xl bg-white/5 border border-white/10 text-navy-400 hover:text-text-primary transition-all"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-electric' : ''}`} />
                    </button>
                    <div className="flex flex-col items-end">
                        <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-electric to-white hud-text">
                            {totalScore}
                        </span>
                        <span className="text-[10px] font-black text-navy-600 uppercase tracking-widest">SKOR</span>
                    </div>
                </div>
            </div>

            {/* STAR Breakdown */}
            <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-1">
                {Object.entries(STAR_CRITERIA).map(([key, config]) => {
                    const reason = scores.Details?.[key]?.reason;
                    return (
                        <div key={key} className="space-y-2 group/item relative">
                            <div className="flex justify-between text-xs font-bold text-navy-400">
                                <span className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${config.color.replace('text', 'bg')}`} />
                                    {config.label}
                                    <button
                                        onClick={() => setSelectedDetail({
                                            key,
                                            ...config,
                                            score: scores[key],
                                            reason: reason || "Yenileme gerekli."
                                        })}
                                        className="text-navy-600 hover:text-text-primary transition-colors"
                                    >
                                        <Info className="w-3 h-3" />
                                    </button>
                                </span>
                                <span className={`${config.color} font-black`}>{scores[key]}/10</span>
                            </div>
                            <div className="h-2 bg-navy-900/50 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-1000 ease-out ${config.bg.replace('/10', '')}`}
                                    style={{ width: `${scores[key] * 10}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Detail Modal Overlay */}
            {selectedDetail && (
                <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-sm bg-navy-900 border border-white/10 rounded-2xl p-5 shadow-2xl relative animate-in zoom-in-95 duration-200">
                        <button
                            onClick={() => setSelectedDetail(null)}
                            className="absolute top-4 right-4 text-navy-500 hover:text-text-primary p-1 rounded-lg hover:bg-white/5"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-3 mb-4">
                            <span className={`w-8 h-8 rounded-lg ${selectedDetail.bg} ${selectedDetail.color} flex items-center justify-center font-bold text-lg`}>
                                {selectedDetail.key[0]}
                            </span>
                            <div>
                                <h4 className="text-sm font-bold text-text-primary uppercase tracking-tighter">{selectedDetail.label}</h4>
                                <p className="text-xs text-navy-400">Yapay Zeka Skor Gerekçesi</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {(() => {
                                const reason = selectedDetail.reason || "";
                                const parts = reason.split(/Negatif \(-|Negatif\(-/);
                                const posPart = parts[0].replace(/Pozitif \(\+|Pozitif\(\+/g, '').trim();
                                const negPart = parts[1] ? parts[1].trim() : null;

                                return (
                                    <>
                                        {posPart && (
                                            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                                                <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                                                    <CheckCircle className="w-3 h-3" /> Artılar (+)
                                                </div>
                                                <p className="text-xs text-navy-100 leading-relaxed italic">
                                                    "{posPart}"
                                                </p>
                                            </div>
                                        )}
                                        {negPart && (
                                            <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/10">
                                                <div className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                                                    <X className="w-3 h-3" /> Eksiler (-)
                                                </div>
                                                <p className="text-xs text-navy-200 leading-relaxed italic">
                                                    "{negPart}"
                                                </p>
                                            </div>
                                        )}
                                        {!posPart && !negPart && (
                                            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                                                <p className="text-sm text-navy-200 italic leading-relaxed">
                                                    "{reason}"
                                                </p>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>

                        <div className="mt-4 flex justify-between items-center border-t border-white/5 pt-4">
                            <span className="text-[10px] text-navy-500 font-bold uppercase">Skor: {selectedDetail.score}/10</span>
                            <button
                                onClick={() => setSelectedDetail(null)}
                                className="text-xs font-bold text-electric hover:underline"
                            >
                                Kapat
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
