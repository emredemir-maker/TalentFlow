// src/components/OpportunityHub.jsx
// "Smart Match" Notifications & Opportunity Hub
// Displays proactive AI recommendations for candidates

import { useState } from 'react';
import {
    Sparkles,
    Lightbulb,
    ArrowRight,
    CheckCircle2,
    Calendar,
    HelpCircle,
    TrendingUp
} from 'lucide-react';

const MOCK_OPPORTUNITIES = [
    {
        id: 'opt1',
        title: 'Senior Frontend Developer',
        matchCount: 3,
        topCandidate: {
            name: 'Ali Yılmaz',
            score: 94,
            reason: 'React ve TypeScript deneyimi tam uyuşuyor. Benzer bir FinTech projesinde 2 yıl görev almış.',
            avatar: 'AY',
            color: 'bg-emerald-500'
        }
    },
    {
        id: 'opt2',
        title: 'Product Manager',
        matchCount: 1,
        topCandidate: {
            name: 'Ayşe Demir',
            score: 88,
            reason: 'Agile metodolojilerine hakim ve teknik kökenli. Ekip yönetimi deneyimi güçlü.',
            avatar: 'AD',
            color: 'bg-violet-500'
        }
    }
];

export default function OpportunityHub() {
    const [expandedId, setExpandedId] = useState(null);

    return (
        <div className="glass rounded-3xl p-6 border border-white/[0.06] relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -z-10" />

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        <Lightbulb className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">Fırsat Havuzu</h3>
                        <p className="text-xs text-navy-400">AI tabanlı proaktif öneriler</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs font-medium text-navy-300">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>{MOCK_OPPORTUNITIES.length} Yeni Fırsat</span>
                </div>
            </div>

            {/* Opportunities List */}
            <div className="space-y-4">
                {MOCK_OPPORTUNITIES.map((opt) => (
                    <div
                        key={opt.id}
                        className="group relative rounded-2xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-white/[0.08] transition-all overflow-hidden"
                    >
                        {/* Main Row */}
                        <div className="p-4 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">

                            {/* Position Info */}
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-full ${opt.topCandidate.color}/10 border border-white/[0.1] flex items-center justify-center text-sm font-bold text-white shrink-0`}>
                                    {opt.topCandidate.avatar}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-bold text-white text-sm">{opt.topCandidate.name}</h4>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${opt.topCandidate.color}/20 text-white border border-white/10`}>
                                            %{opt.topCandidate.score} Eşleşme
                                        </span>
                                    </div>
                                    <p className="text-xs text-navy-400">
                                        <span className="text-amber-400 font-medium">{opt.title}</span> pozisyonu için öneriliyor
                                    </p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0">
                                <button
                                    onClick={() => setExpandedId(expandedId === opt.id ? null : opt.id)}
                                    className="flex-1 md:flex-none px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-navy-300 border border-white/[0.06] flex items-center justify-center gap-1.5 transition-all"
                                >
                                    <HelpCircle className="w-3.5 h-3.5" />
                                    Neden Uygun?
                                </button>
                                <button className="flex-1 md:flex-none px-3 py-2 rounded-lg bg-electric hover:bg-electric-light text-xs font-bold text-white shadow-lg shadow-electric/20 flex items-center justify-center gap-1.5 transition-all">
                                    <Calendar className="w-3.5 h-3.5" />
                                    Mülakata Al
                                </button>
                            </div>
                        </div>

                        {/* Expandable Explanation (Explainable AI) */}
                        {expandedId === opt.id && (
                            <div className="px-4 pb-4 pt-0 animate-in slide-in-from-top-2">
                                <div className="p-3 rounded-xl bg-navy-900/50 border border-white/[0.06] flex items-start gap-3">
                                    <TrendingUp className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                                    <div>
                                        <span className="text-xs font-bold text-white block mb-1">Yapay Zeka Mantığı:</span>
                                        <p className="text-xs text-navy-300 leading-relaxed">
                                            {opt.topCandidate.reason}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Footer Notification inside card */}
                        <div className="px-4 py-2 bg-white/[0.02] border-t border-white/[0.04] flex items-center justify-between text-[10px] text-navy-500">
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                Bu pozisyon için toplam {opt.matchCount} yeni aday bulundu
                            </span>
                            <button className="hover:text-white transition-colors flex items-center gap-1">
                                Tümünü Gör <ArrowRight className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                ))}

                {MOCK_OPPORTUNITIES.length === 0 && (
                    <div className="text-center py-6 text-xs text-navy-500">
                        Şu an yeni bir fırsat bulunmuyor.
                    </div>
                )}
            </div>
        </div>
    );
}
