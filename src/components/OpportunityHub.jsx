// src/components/OpportunityHub.jsx
// "Smart Match" Notifications & Opportunity Hub
// Displays real-time AI recommendations based on actual database data

import { useState, useMemo } from 'react';
import {
    Sparkles,
    Lightbulb,
    ArrowRight,
    CheckCircle2,
    Calendar,
    HelpCircle,
    TrendingUp,
    Layout
} from 'lucide-react';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';

export default function OpportunityHub() {
    const { candidates } = useCandidates();
    const { positions } = usePositions();
    const [expandedId, setExpandedId] = useState(null);

    // Dynamic Opportunity Calculation
    // Finds the best match for each open position from the actual candidate pool
    const opportunities = useMemo(() => {
        if (!candidates?.length || !positions?.length) return [];

        const openPositions = positions.filter(p => p.status === 'open');

        return openPositions.map(pos => {
            // Simple matching logic for proactive suggestions
            const matches = candidates.map(c => {
                let score = 0;

                // Skills match (Weight: 60%)
                const cSkills = (c.skills || []).map(s => s.toLowerCase());
                const pReqs = (pos.requirements || []).map(r => r.toLowerCase());
                if (pReqs.length > 0) {
                    const matched = cSkills.filter(s => pReqs.some(r => r.includes(s) || s.includes(r)));
                    score += Math.round((matched.length / Math.max(pReqs.length, 1)) * 60);
                }

                // Title match (Weight: 40%)
                const cPos = (c.position || '').toLowerCase();
                const pTitle = (pos.title || '').toLowerCase();
                if (cPos && pTitle && (cPos.includes(pTitle) || pTitle.includes(cPos))) {
                    score += 40;
                }

                return { ...c, score };
            })
                .filter(c => c.score > 50) // Only show high-quality matches
                .sort((a, b) => b.score - a.score);

            if (matches.length === 0) return null;

            const best = matches[0];
            return {
                id: pos.id,
                title: pos.title,
                matchCount: matches.length,
                topCandidate: {
                    id: best.id,
                    name: best.name,
                    score: best.score,
                    reason: `${best.skills?.slice(0, 3).join(', ')} gibi kritik yetenekleri bu pozisyon için mükemmel bir uyum sağlıyor.`,
                    avatar: best.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?',
                    color: scoreToColor(best.score)
                }
            };
        }).filter(Boolean).slice(0, 3); // Top 3 opportunities
    }, [candidates, positions]);

    function scoreToColor(score) {
        if (score >= 85) return 'bg-emerald-500';
        if (score >= 70) return 'bg-blue-500';
        return 'bg-amber-500';
    }

    if (opportunities.length === 0) {
        return (
            <div className="glass rounded-3xl p-8 border border-white/[0.06] text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.03] flex items-center justify-center mx-auto mb-4 text-navy-500">
                    <Layout className="w-8 h-8 opacity-20" />
                </div>
                <h3 className="text-white font-bold mb-1">Fırsat Havuzu Boş</h3>
                <p className="text-xs text-navy-400">Yeni adaylar eklendikçe burada proaktif öneriler göreceksiniz.</p>
            </div>
        );
    }

    return (
        <div className="glass rounded-3xl p-6 border border-white/[0.06] relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-electric/5 rounded-full blur-3xl -z-10" />

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        <Lightbulb className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">Fırsat Havuzu</h3>
                        <p className="text-xs text-navy-400">Veritabanına dayalı anlık eşleşmeler</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs font-medium text-navy-300">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>{opportunities.length} Aktif Fırsat</span>
                </div>
            </div>

            {/* Opportunities List */}
            <div className="space-y-4">
                {opportunities.map((opt) => (
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
                                            %{opt.topCandidate.score} Uyumluluk
                                        </span>
                                    </div>
                                    <p className="text-xs text-navy-400">
                                        <span className="text-amber-400 font-medium">{opt.title}</span> pozisyonu için ideal eşleşme
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
                                    Analiz
                                </button>
                                <button className="flex-1 md:flex-none px-3 py-2 rounded-lg bg-electric hover:bg-electric-light text-xs font-bold text-white shadow-lg shadow-electric/20 flex items-center justify-center gap-1.5 transition-all">
                                    <Calendar className="w-3.5 h-3.5" />
                                    Mülakat Planla
                                </button>
                            </div>
                        </div>

                        {/* Analysis Detail */}
                        {expandedId === opt.id && (
                            <div className="px-4 pb-4 pt-0 animate-in slide-in-from-top-2">
                                <div className="p-3 rounded-xl bg-navy-900/50 border border-white/[0.06] flex items-start gap-3">
                                    <TrendingUp className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                                    <div>
                                        <span className="text-xs font-bold text-white block mb-1">Eşleşme Analizi:</span>
                                        <p className="text-xs text-navy-300 leading-relaxed">
                                            {opt.topCandidate.reason}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Footer Notification */}
                        <div className="px-4 py-2 bg-white/[0.02] border-t border-white/[0.04] flex items-center justify-between text-[10px] text-navy-500">
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                Bu pozisyon kriterlerine uygun {opt.matchCount} aday tespit edildi.
                            </span>
                            <button className="hover:text-white transition-colors flex items-center gap-1">
                                Portföyü Aç <ArrowRight className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
