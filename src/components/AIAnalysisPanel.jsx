// src/components/AIAnalysisPanel.jsx
// AI-powered candidate analysis panel with Gemini integration
// Shows score breakdown, top skills, gap analysis, and personalized DM

import { useState } from 'react';
import {
    Sparkles,
    Target,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    CheckCircle,
    Copy,
    Check,
    RefreshCw,
    MessageSquare,
    Brain,
    Zap,
    Shield,
    ChevronRight,
    Loader2,
} from 'lucide-react';

const SEVERITY_CONFIG = {
    critical: {
        label: 'Kritik',
        color: 'text-red-400',
        bg: 'bg-red-500/10',
        ring: 'ring-red-500/20',
        icon: AlertTriangle,
    },
    moderate: {
        label: 'Orta',
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        ring: 'ring-amber-500/20',
        icon: AlertTriangle,
    },
    minor: {
        label: 'Düşük',
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        ring: 'ring-blue-500/20',
        icon: CheckCircle,
    },
};

const RECOMMENDATION_CONFIG = {
    hire: { label: 'İşe Al', color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: '🟢' },
    strong_consider: { label: 'Güçlü Aday', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: '🔵' },
    consider: { label: 'Değerlendir', color: 'text-amber-400', bg: 'bg-amber-500/10', icon: '🟡' },
    pass: { label: 'Uygun Değil', color: 'text-red-400', bg: 'bg-red-500/10', icon: '🔴' },
};

function ScoreCircle({ value, label, size = 'sm' }) {
    const getColor = (v) => {
        if (v >= 80) return { stroke: '#22c55e', text: 'text-green-400' };
        if (v >= 60) return { stroke: '#3b82f6', text: 'text-blue-400' };
        if (v >= 40) return { stroke: '#f59e0b', text: 'text-amber-400' };
        return { stroke: '#ef4444', text: 'text-red-400' };
    };

    const dim = size === 'lg' ? 80 : 48;
    const strokeW = size === 'lg' ? 5 : 3.5;
    const radius = (dim - strokeW * 2) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value / 100) * circumference;
    const colors = getColor(value);

    return (
        <div className="flex flex-col items-center gap-1.5">
            <div className="relative" style={{ width: dim, height: dim }}>
                <svg
                    style={{ width: dim, height: dim, transform: 'rotate(-90deg)' }}
                >
                    <circle
                        cx={dim / 2} cy={dim / 2} r={radius}
                        fill="none" stroke="#1e293b" strokeWidth={strokeW}
                    />
                    <circle
                        cx={dim / 2} cy={dim / 2} r={radius}
                        fill="none" stroke={colors.stroke} strokeWidth={strokeW}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        style={{ transition: 'stroke-dashoffset 1.2s ease-out' }}
                    />
                </svg>
                <span className={`absolute inset-0 flex items-center justify-center font-bold ${colors.text} ${size === 'lg' ? 'text-xl' : 'text-[11px]'}`}>
                    {value}
                </span>
            </div>
            {label && (
                <span className="text-[10px] text-text-muted font-medium text-center leading-tight">{label}</span>
            )}
        </div>
    );
}

export default function AIAnalysisPanel({ result, loading, error, onRetry, title, targetScore }) {
    const [dmCopied, setDmCopied] = useState(false);

    const handleCopyDM = () => {
        if (result?.personalizedMessage) {
            navigator.clipboard.writeText(result.personalizedMessage);
            setDmCopied(true);
            setTimeout(() => setDmCopied(false), 2500);
        }
    };

    // ===== LOADING STATE =====
    if (loading) {
        return (
            <div className="space-y-4 animate-fade-in">
                <div className="flex items-center gap-3 p-4 rounded-xl bg-electric/5 border border-electric/10">
                    <div className="relative">
                        <Loader2 className="w-5 h-5 text-electric-light animate-spin" />
                        <div className="absolute inset-0 w-5 h-5 text-electric-light animate-ping opacity-20">
                            <Sparkles className="w-5 h-5" />
                        </div>
                    </div>
                    <div>
                        <div className="text-[13px] font-semibold text-electric-light">Gemini AI Analiz Ediyor...</div>
                        <div className="text-[11px] text-text-muted mt-0.5">CV ve iş tanımı karşılaştırılıyor</div>
                    </div>
                </div>

                <div className="grid grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="p-3 rounded-xl bg-navy-800/10">
                            <div className="skeleton w-10 h-10 rounded-full mx-auto mb-2" />
                            <div className="skeleton w-full h-2 rounded" />
                        </div>
                    ))}
                </div>
                <div className="skeleton w-full h-20 rounded-xl" />
                <div className="skeleton w-full h-16 rounded-xl" />
            </div>
        );
    }

    // ===== ERROR STATE =====
    if (error) {
        return (
            <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10 space-y-3 animate-fade-in">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span className="text-[13px] font-semibold text-red-400">Analiz Hatası</span>
                </div>
                <p className="text-[12px] text-text-muted leading-relaxed">{error}</p>
                {onRetry && (
                    <button
                        onClick={onRetry}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-navy-800/20 border border-border-subtle text-[12px] text-text-muted hover:bg-navy-800/40 transition-all cursor-pointer"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Tekrar Dene
                    </button>
                )}
            </div>
        );
    }

    // ===== NO RESULT =====
    // ===== EMPTY STATE =====
    if (!result) {
        return (
            <div className="flex flex-col items-center justify-center py-12 px-4 rounded-xl bg-navy-800/10 border border-border-subtle text-center space-y-4 animate-fade-in">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-electric/20 to-violet-500/20 flex items-center justify-center mb-2">
                    <Brain className="w-8 h-8 text-electric-light" />
                </div>
                <div>
                    <h3 className="text-text-primary font-bold text-lg mb-1">Henüz Analiz Yapılmadı</h3>
                    <p className="text-text-muted text-xs max-w-[250px] mx-auto leading-relaxed">
                        Adayın bu pozisyon ile uyumluluğunu detaylıca analiz etmek için yapay zekayı başlatın.
                    </p>
                </div>
                {onRetry && (
                    <button
                        onClick={() => onRetry()}
                        className="px-6 py-2.5 rounded-xl bg-electric hover:bg-electric-hover text-text-primary font-bold text-sm shadow-lg shadow-electric/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                    >
                        <Sparkles className="w-4 h-4" />
                        Analizi Başlat
                    </button>
                )}

            </div>
        );
    }


    const rec = RECOMMENDATION_CONFIG[result.recommendation] || RECOMMENDATION_CONFIG.consider;

    return (
        <div className="space-y-5 animate-fade-in-up">
            {/* ===== HEADER: Score + Recommendation ===== */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-electric/5 to-violet-500/5 border border-electric/10">
                <ScoreCircle value={targetScore || result.score} size="lg" />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="w-4 h-4 text-electric-light" />
                        <span className="text-[12px] uppercase tracking-wider text-text-muted font-semibold">
                            {title ? `${title} Uyumluluğu` : 'AI Uyumluluk Skoru'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${rec.color} ${rec.bg} ring-1 ring-inset ring-white/5`}>
                            {rec.icon} {rec.label}
                        </span>
                        {onRetry && (
                            <button
                                onClick={() => onRetry()}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-800/20 border border-border-subtle text-[10px] font-bold text-text-muted hover:text-text-primary hover:bg-navy-800/40 transition-all"
                                title="Yapay Zeka Analizini Yenile"
                            >
                                <RefreshCw className="w-3 h-3" />
                                Yenile
                            </button>
                        )}
                    </div>
                </div>

            </div>

            {/* ===== SCORE BREAKDOWN ===== */}
            {result.scoreBreakdown && (
                <div>
                    <SectionHeader icon={Target} title="Puan Dağılımı" />
                    <div className="grid grid-cols-4 gap-2.5">
                        <ScoreCircle value={result.scoreBreakdown.technicalSkills} label="Teknik" />
                        <ScoreCircle value={result.scoreBreakdown.experience} label="Deneyim" />
                        <ScoreCircle value={result.scoreBreakdown.industryFit} label="Sektör" />
                        <ScoreCircle value={result.scoreBreakdown.softSkills} label="Soft Skill" />
                    </div>
                </div>
            )}

            {/* ===== SUMMARY ===== */}
            {result.summary && (
                <div>
                    <SectionHeader icon={Brain} title="Genel Değerlendirme" />
                    <p className="text-[13px] text-text-secondary leading-relaxed p-3 rounded-xl bg-navy-800/10 border border-border-subtle">
                        {result.summary}
                    </p>
                </div>
            )}

            {/* ===== TOP SKILLS ===== */}
            {result.topSkills && result.topSkills.length > 0 && (
                <div>
                    <SectionHeader icon={TrendingUp} title="Eşleşen Yetenekler" />
                    <div className="space-y-2">
                        {result.topSkills.map((item, i) => (
                            <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                                <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[13px] font-semibold text-emerald-500">{item.skill}</div>
                                    <div className="text-[11px] text-emerald-500/70 mt-0.5">{item.relevance}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ===== GAP ANALYSIS ===== */}
            {result.gapAnalysis && result.gapAnalysis.length > 0 && (
                <div>
                    <SectionHeader icon={TrendingDown} title="Eksiklik Analizi" />
                    <div className="space-y-2">
                        {result.gapAnalysis.map((item, i) => {
                            const sev = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.moderate;
                            const SevIcon = sev.icon;
                            return (
                                <div key={i} className={`p-3 rounded-xl ${sev.bg} border border-border-subtle`}>
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <SevIcon className={`w-3.5 h-3.5 ${sev.color}`} />
                                        <span className={`text-[13px] font-semibold ${sev.color}`}>{item.gap}</span>
                                        <span className={`ml-auto text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${sev.color} ${sev.bg} ring-1 ring-inset ${sev.ring}`}>
                                            {sev.label}
                                        </span>
                                    </div>
                                    <div className="flex items-start gap-2 mt-1">
                                        <ChevronRight className="w-3 h-3 text-text-muted shrink-0 mt-0.5" />
                                        <span className="text-[11px] text-text-muted">{item.suggestion}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ===== PERSONALIZED DM ===== */}
            {result.personalizedMessage && (
                <div>
                    <SectionHeader icon={MessageSquare} title="LinkedIn DM Taslağı" />
                    <div className="relative p-4 rounded-xl bg-navy-800/10 border border-border-subtle">
                        <p className="text-[13px] text-text-secondary leading-relaxed whitespace-pre-wrap pr-8">
                            {result.personalizedMessage}
                        </p>
                        <button
                            onClick={handleCopyDM}
                            className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-navy-800/20 border border-border-subtle flex items-center justify-center text-text-muted hover:text-electric-light hover:bg-navy-800/40 transition-all cursor-pointer"
                            title="Mesajı kopyala"
                        >
                            {dmCopied
                                ? <Check className="w-3.5 h-3.5 text-emerald-400" />
                                : <Copy className="w-3.5 h-3.5" />
                            }
                        </button>
                        {dmCopied && (
                            <div className="absolute bottom-2 right-3 text-[10px] text-emerald-400 font-medium animate-fade-in">
                                Kopyalandı!
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function SectionHeader({ icon: Icon, title }) {
    return (
        <div className="flex items-center gap-2 mb-3">
            <Icon className="w-4 h-4 text-electric-light" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{title}</h4>
        </div>
    );
}
