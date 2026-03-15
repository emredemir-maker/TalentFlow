import { Info, X, RefreshCw, Star } from 'lucide-react';
import { useState } from 'react';

const STAR_CRITERIA = {
    Situation: { label: 'Durum (Situation)', color: 'text-primary', progress: 'bg-primary', bg: 'bg-primary/5' },
    Task: { label: 'Görev (Task)', color: 'text-primary/80', progress: 'bg-primary/80', bg: 'bg-primary/5' },
    Action: { label: 'Eylem (Action)', color: 'text-primary/70', progress: 'bg-primary/70', bg: 'bg-primary/5' },
    Result: { label: 'Sonuç (Result)', color: 'text-emerald-600', progress: 'bg-emerald-500', bg: 'bg-emerald-500/5' },
};

export default function StarScoreCard({ analysis, candidate, onRefresh }) {
    const [selectedDetail, setSelectedDetail] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    const getScoreValue = (val) => {
        if (typeof val === 'object' && val !== null) return val.score || 0;
        return val || 0;
    };

    const scores = analysis || {
        Situation: 0,
        Task: 0,
        Action: 0,
        Result: 0,
        Summary: "Analiz bekleniyor..."
    };

    const totalScore = Math.round(
        (getScoreValue(scores.Situation) + getScoreValue(scores.Task) + getScoreValue(scores.Action) + getScoreValue(scores.Result)) / 4 * 10
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
        <div className="bg-white rounded-2xl p-6 relative overflow-hidden h-full flex flex-col border border-outline-variant/5 shadow-sm">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/2 rounded-full blur-[100px] -z-10" />

            <div className="flex items-center justify-between mb-12">
                <div className="flex items-center gap-5">
                    <div className="w-10 h-10 rounded-xl bg-surface-container-low border border-outline-variant/10 flex items-center justify-center">
                        <Star className="w-5 h-5 text-primary fill-primary/10" />
                    </div>
                    <div>
                        <h3 className="text-[13px] font-bold text-on-surface tracking-tight">STAR Yetkinlik Analizi</h3>
                        <p className="text-[8px] text-text-muted font-black uppercase mt-0.5 tracking-[0.2em] opacity-60">Davranışsal Değerlendirme Protokolü</p>
                    </div>
                </div>
                <div className="flex items-center gap-5">
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="p-2.5 rounded-lg bg-surface-container-low border border-outline-variant/10 text-text-muted hover:text-primary transition-all active:scale-95"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                    </button>
                    <div className="text-right">
                        <div className="text-3xl font-black text-primary tracking-tighter leading-none">{totalScore}</div>
                        <div className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em] mt-1.5">GENEL SKOR</div>
                    </div>
                </div>
            </div>

            <div className="space-y-6 flex-1">
                {Object.entries(STAR_CRITERIA).map(([key, config]) => (
                    <div key={key} className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="flex items-center gap-2.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${config.progress} shadow-sm`} />
                                <span className="text-[9px] font-black text-on-surface uppercase tracking-widest">{config.label}</span>
                                <button
                                    onClick={() => setSelectedDetail({ 
                                        key, 
                                        ...config, 
                                        score: getScoreValue(scores[key]), 
                                        reason: typeof scores[key] === 'object' ? scores[key].reason : (scores.Details?.[key]?.reason || "Detaylı analiz verisi bulunamadı.") 
                                    })}
                                    className="p-1 rounded text-text-muted hover:text-primary transition-colors opacity-40 hover:opacity-100"
                                >
                                    <Info className="w-3 h-3" />
                                </button>
                            </span>
                            <span className={`text-[12px] font-black ${config.color}`}>{getScoreValue(scores[key])}<span className="text-text-muted/30 ml-0.5 font-medium">/10</span></span>
                        </div>
                        <div className="h-1.5 bg-surface-container-lowest rounded-full overflow-hidden border border-outline-variant/5 shadow-inner">
                            <div
                                className={`h-full transition-all duration-1000 ease-out ${config.progress} shadow-[0_0_12px_rgba(var(--primary-rgb),0.2)]`}
                                style={{ width: `${getScoreValue(scores[key]) * 10}%` }}
                            />
                        </div>
                    </div>
                ))}
            </div>

            {selectedDetail && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-8 bg-white/60 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="w-full max-w-sm bg-white border border-outline-variant/10 rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-300">
                        <button onClick={() => setSelectedDetail(null)} className="absolute top-5 right-5 text-text-muted hover:text-on-surface transition-colors"><X className="w-4 h-4" /></button>

                        <div className="flex items-center gap-4 mb-6">
                            <div className={`w-12 h-12 rounded-xl ${selectedDetail.bg} ${selectedDetail.color} flex items-center justify-center font-black text-xl border border-current/10`}>{selectedDetail.key[0]}</div>
                            <div>
                                <h4 className="text-base font-bold text-on-surface tracking-tight">{selectedDetail.label.split(' ')[0]}</h4>
                                <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Puan Yetkinliği: {selectedDetail.score}/10</span>
                            </div>
                        </div>

                        <div className="p-6 rounded-2xl bg-surface-container-low border border-outline-variant/10 shadow-inner">
                            <p className="text-sm text-on-surface leading-relaxed font-medium italic opacity-80">"{selectedDetail.reason}"</p>
                        </div>

                        <button
                            onClick={() => setSelectedDetail(null)}
                            className="w-full mt-10 py-5 rounded-2xl bg-primary text-white text-[11px] font-black uppercase tracking-[0.2em] shadow-lg shadow-primary/20 hover:opacity-90 transition-all transition-all leading-none"
                        >
                            İNCELENDİ
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
