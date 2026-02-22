import { CheckCircle, Circle, Zap, Target, Info, X, RefreshCw } from 'lucide-react';
import InterviewGenerator from './OtonomInterview';
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
        (scores.Situation + scores.Task + scores.Action + scores.Result) / 4 * 10
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
        <div className="glass rounded-3xl p-6 border border-white/[0.06] relative overflow-hidden group">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-electric/5 rounded-full blur-3xl -z-10 group-hover:bg-electric/10 transition-colors duration-500" />

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Target className="w-5 h-5 text-electric" />
                        STAR Analiz Skoru
                    </h3>
                    <p className="text-xs text-navy-400 mt-1">Yapay Zeka Destekli Mülakat Değerlendirmesi</p>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="p-2 rounded-xl bg-white/5 border border-white/10 text-navy-400 hover:text-white hover:bg-white/10 transition-all group/ref"
                        title="Analizi Yenile (Detaylı Gerekçeler İçin)"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-electric' : 'group-hover/ref:rotate-180 transition-transform duration-500'}`} />
                    </button>
                    <div className="flex flex-col items-end">
                        <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-navy-400">
                            {totalScore}
                        </span>
                        <span className="text-[10px] font-bold text-navy-500 uppercase tracking-widest">Genel Puan</span>
                    </div>
                </div>
            </div>

            {/* STAR Breakdown */}
            <div className="space-y-4">
                {Object.entries(STAR_CRITERIA).map(([key, config]) => {
                    const reason = scores.Details?.[key]?.reason;
                    return (
                        <div key={key} className="space-y-1.5 group/item relative">
                            <div className="flex justify-between text-xs font-semibold text-navy-300">
                                <span className="flex items-center gap-1.5">
                                    <span className={`w-1.5 h-1.5 rounded-full ${config.color.replace('text', 'bg')}`} />
                                    {config.label}
                                    <div className="relative flex items-center">
                                        <button
                                            onClick={() => setSelectedDetail({
                                                key,
                                                ...config,
                                                score: scores[key],
                                                reason: reason || "Bu aday eski bir AI modeli ile analiz edilmiş. Detaylı gerekçeler için lütfen sağ üstteki yenile butonuna basın."
                                            })}
                                            className="p-0.5 rounded-md text-navy-500 hover:text-white transition-colors"
                                            title="Detayları Gör"
                                        >
                                            <Info className="w-3 h-3" />
                                        </button>

                                        {/* Tooltip on Hover */}
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-navy-800 border border-white/10 rounded-lg text-[10px] text-white opacity-0 invisible group-hover/item:opacity-100 group-hover/item:visible transition-all z-50 shadow-2xl pointer-events-none">
                                            <div className="flex flex-col gap-1">
                                                <span className="font-bold text-electric uppercase tracking-tighter">AI Gerekçesi:</span>
                                                <span className="italic leading-relaxed">
                                                    "{reason || "Detaylı gerekçe için analizi yenileyin."}"
                                                </span>
                                            </div>
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-navy-800" />
                                        </div>
                                    </div>
                                </span>
                                <span className={config.color}>{scores[key]}/10</span>
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

            {/* AI Summary */}
            <div className="mt-6 pt-6 border-t border-white/[0.06]">
                <div className="flex gap-3">
                    <div className="p-2 rounded-xl bg-electric/10 text-electric border border-electric/20 h-fit">
                        <Zap className="w-4 h-4" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                            AI Görüşü
                            {candidate?.matchedPositionTitle && (
                                <span className="text-xs font-normal text-navy-400">({candidate.matchedPositionTitle})</span>
                            )}
                        </h4>
                        <p className="text-xs text-navy-300 leading-relaxed italic mb-3">
                            "{scores.Summary}"
                        </p>

                        {/* Highlights from Past Experiences */}
                        {candidate?.aiAnalysis?.reasons?.length > 0 && (
                            <div className="space-y-2 mt-3 pl-3 border-l border-white/5">
                                <h5 className="text-[10px] font-bold text-navy-500 uppercase tracking-widest">Öne Çıkan Geçmiş Deneyimler:</h5>
                                <div className="space-y-1.5 font-medium">
                                    {candidate.aiAnalysis.reasons.map((reason, idx) => (
                                        <div key={idx} className="flex gap-2 text-[11px] text-navy-200">
                                            <span className="text-electric-light shrink-0">•</span>
                                            <span>{reason}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Detail Modal Overlay */}
            {selectedDetail && (
                <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-sm bg-navy-900 border border-white/10 rounded-2xl p-5 shadow-2xl relative animate-in zoom-in-95 duration-200">
                        <button
                            onClick={() => setSelectedDetail(null)}
                            className="absolute top-4 right-4 text-navy-500 hover:text-white p-1 rounded-lg hover:bg-white/5"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-3 mb-4">
                            <span className={`w-8 h-8 rounded-lg ${selectedDetail.bg} ${selectedDetail.color} flex items-center justify-center font-bold text-lg`}>
                                {selectedDetail.key[0]}
                            </span>
                            <div>
                                <h4 className="text-sm font-bold text-white uppercase tracking-tighter">{selectedDetail.label}</h4>
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

            {/* Interview Generator */}
            <InterviewGenerator candidate={candidate} starAnalysis={scores} />
        </div>
    );
}
