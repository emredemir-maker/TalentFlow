// src/components/StarScoreCard.jsx
// STAR Technique Analysis Card for Candidates
// S: Situation, T: Task, A: Action, R: Result

import { CheckCircle, Circle, Zap, Target } from 'lucide-react';

const STAR_CRITERIA = {
    Situation: { label: 'Durum (Context Clarity)', color: 'text-violet-400', bg: 'bg-violet-500/10', ring: 'ring-violet-500/20' },
    Task: { label: 'Görev (Goal Definition)', color: 'text-blue-400', bg: 'bg-blue-500/10', ring: 'ring-blue-500/20' },
    Action: { label: 'Eylem (Skill Usage)', color: 'text-amber-400', bg: 'bg-amber-500/10', ring: 'ring-amber-500/20' },
    Result: { label: 'Sonuç (Metrics & Impact)', color: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20' },
};

export default function StarScoreCard({ analysis }) {
    // Default mock data if no analysis provided
    const scores = analysis || {
        Situation: 8,
        Task: 9,
        Action: 7,
        Result: 6,
        Summary: "Aday problemi net tanımladı ancak sonuç kısmında somut veriler eksik kaldı."
    };

    const totalScore = Math.round(
        (scores.Situation + scores.Task + scores.Action + scores.Result) / 4 * 10
    );

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
                <div className="flex flex-col items-end">
                    <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-navy-400">
                        {totalScore}
                    </span>
                    <span className="text-[10px] font-bold text-navy-500 uppercase tracking-widest">Genel Puan</span>
                </div>
            </div>

            {/* STAR Breakdown */}
            <div className="space-y-4">
                {Object.entries(STAR_CRITERIA).map(([key, config]) => (
                    <div key={key} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold text-navy-300">
                            <span className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${config.color.replace('text', 'bg')}`} />
                                {config.label}
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
                ))}
            </div>

            {/* AI Summary */}
            <div className="mt-6 pt-6 border-t border-white/[0.06]">
                <div className="flex gap-3">
                    <div className="p-2 rounded-xl bg-electric/10 text-electric border border-electric/20 h-fit">
                        <Zap className="w-4 h-4" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-white mb-1">AI Görüşü</h4>
                        <p className="text-xs text-navy-300 leading-relaxed">
                            {scores.Summary}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
