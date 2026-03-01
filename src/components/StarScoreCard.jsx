import { CheckCircle, Circle, Zap, Target, Info, X, RefreshCw, Star } from 'lucide-react';
import { useState } from 'react';

const STAR_CRITERIA = {
    Situation: { label: 'Durum', color: 'text-violet-600 dark:text-violet-400', progress: 'bg-violet-500', bg: 'bg-violet-500/10' },
    Task: { label: 'Görev', color: 'text-blue-600 dark:text-blue-400', progress: 'bg-blue-500', bg: 'bg-blue-500/10' },
    Action: { label: 'Eylem', color: 'text-amber-600 dark:text-amber-400', progress: 'bg-amber-500', bg: 'bg-amber-500/10' },
    Result: { label: 'Sonuç', color: 'text-emerald-600 dark:text-emerald-400', progress: 'bg-emerald-500', bg: 'bg-emerald-500/10' },
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
        <div className="stitch-card p-8 relative overflow-hidden h-full flex flex-col shadow-2xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl -z-10" />

            <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20">
                        <Star className="w-6 h-6 text-cyan-500 fill-cyan-500/20" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-text-primary tracking-widest uppercase">STAR YETKİNLİK SKORU</h3>
                        <p className="text-[10px] text-text-muted font-black uppercase mt-1 tracking-widest opacity-60 italic">AI-Nöral Analiz Protokolü</p>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="p-3 rounded-xl bg-bg-primary border border-border-subtle text-text-muted hover:text-cyan-500 transition-all shadow-sm active:scale-95"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    </button>
                    <div className="text-right">
                        <div className="text-5xl font-black text-text-primary tracking-tighter leading-none">{totalScore}</div>
                        <div className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.2em] mt-2">GLOBAL SCORE</div>
                    </div>
                </div>
            </div>

            <div className="space-y-8 flex-1">
                {Object.entries(STAR_CRITERIA).map(([key, config]) => (
                    <div key={key} className="space-y-3">
                        <div className="flex justify-between items-center px-1">
                            <span className="flex items-center gap-2.5">
                                <span className={`w-2.5 h-2.5 rounded-full ${config.progress}`} />
                                <span className="text-[11px] font-black text-text-primary uppercase tracking-widest">{config.label}</span>
                                <button
                                    onClick={() => setSelectedDetail({ key, ...config, score: scores[key], reason: scores.Details?.[key]?.reason || "Veri yok." })}
                                    className="p-1 rounded-md text-text-muted hover:text-cyan-500 transition-colors bg-bg-primary border border-border-subtle"
                                >
                                    <Info className="w-3.5 h-3.5" />
                                </button>
                            </span>
                            <span className={`text-[13px] font-black ${config.color}`}>{scores[key]}<span className="text-text-muted opacity-40 ml-1">/10</span></span>
                        </div>
                        <div className="h-2.5 bg-bg-primary rounded-full overflow-hidden border border-border-subtle/30 shadow-inner">
                            <div
                                className={`h-full transition-all duration-1000 ease-out ${config.progress}`}
                                style={{ width: `${(scores[key] || 0) * 10}%` }}
                            />
                        </div>
                    </div>
                ))}
            </div>

            {selectedDetail && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-bg-primary/60 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="w-full max-w-sm bg-bg-secondary border border-border-subtle rounded-[2.5rem] p-8 shadow-2xl relative animate-in zoom-in-95 duration-300">
                        <button onClick={() => setSelectedDetail(null)} className="absolute top-6 right-6 text-text-muted hover:text-text-primary transition-colors"><X className="w-5 h-5" /></button>

                        <div className="flex items-center gap-4 mb-6">
                            <div className={`w-12 h-12 rounded-2xl ${selectedDetail.bg} ${selectedDetail.color} flex items-center justify-center font-black text-2xl`}>{selectedDetail.key[0]}</div>
                            <div>
                                <h4 className="text-base font-black text-text-primary uppercase tracking-tight">{selectedDetail.label} Analizi</h4>
                                <span className="text-[10px] font-black text-text-muted uppercase tracking-widest opacity-60">Puan: {selectedDetail.score}/10</span>
                            </div>
                        </div>

                        <div className="p-5 rounded-2xl bg-bg-primary/50 border border-border-subtle shadow-inner">
                            <p className="text-sm text-text-secondary leading-relaxed font-bold italic opacity-90">"{selectedDetail.reason}"</p>
                        </div>

                        <button
                            onClick={() => setSelectedDetail(null)}
                            className="w-full mt-8 py-4 rounded-xl bg-bg-primary border border-border-subtle text-[11px] font-black text-text-primary uppercase tracking-widest hover:bg-bg-secondary transition-all"
                        >
                            ANLAŞILDI
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
