// src/components/CandidateComparisonModal.jsx
import { useState } from 'react';
import { useCandidates } from '../context/CandidatesContext';
import { X, Zap, Brain, CheckCircle, TrendingUp, AlertCircle, Sparkles, MapPin, Briefcase, GraduationCap, Trophy, Loader2 } from 'lucide-react';
import MatchScoreRing from './MatchScoreRing';
import { analyzeComparativeCandidates } from '../services/geminiService';

export default function CandidateComparisonModal({ isOpen, onClose }) {
    const { candidates, compareIds, clearCompareSelection } = useCandidates();
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState(null);

    const handleAIAnalysis = async () => {
        setIsAnalyzing(true);
        try {
            const selectedCandidates = candidates.filter(c => compareIds.includes(c.id));
            const result = await analyzeComparativeCandidates(selectedCandidates);
            setAnalysisResult(result);
        } catch (error) {
            console.error('Comparison error:', error);
        } finally {
            setIsAnalyzing(false);
        }
    };

    if (!isOpen) return null;

    const selectedCandidates = candidates.filter(c => compareIds.includes(c.id));

    if (selectedCandidates.length === 0) return null;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-md" onClick={onClose} />

            <div className="relative w-full max-w-7xl h-full max-h-[90vh] bg-bg-primary stitch-glass border border-border-subtle rounded-[2.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-500">
                {/* Background Glows */}
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-violet-600/10 rounded-full blur-[120px] pointer-events-none" />
                <div className="absolute -bottom-[20%] -right-[10%] w-[50%] h-[50%] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />

                {/* Header */}
                <div className="relative z-10 p-6 border-b border-border-subtle flex items-center justify-between bg-bg-secondary/40 backdrop-blur-sm">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-violet-500/20 flex items-center justify-center border border-violet-500/30">
                            <Sparkles className="w-6 h-6 text-violet-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-text-primary uppercase tracking-tight italic">AI Karşılaştırma Analizi</h2>
                            <p className="text-[10px] font-black text-text-muted uppercase tracking-widest opacity-60">Seçilen {selectedCandidates.length} aday için yan yana değerlendirme</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={clearCompareSelection}
                            className="px-4 py-2 text-[11px] font-black text-text-muted hover:text-red-400 transition-colors uppercase tracking-widest"
                        >
                            Seçimi Temizle
                        </button>
                        <button
                            onClick={onClose}
                            className="w-12 h-12 rounded-2xl bg-bg-secondary border border-border-subtle flex items-center justify-center hover:bg-navy-800 transition-all text-text-primary shadow-sm"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-6">
                    <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${selectedCandidates.length}, minmax(320px, 1fr))` }}>
                        {selectedCandidates.map((candidate, idx) => (
                            <div key={candidate.id} className={`flex flex-col gap-8 px-6 pb-12 ${idx !== selectedCandidates.length - 1 ? 'border-r border-border-subtle/30' : ''}`}>

                                {/* 1. Profil Info */}
                                <div className="flex flex-col items-center text-center gap-4">
                                    <div className="relative">
                                        <div className="w-24 h-24 rounded-[2.5rem] bg-gradient-to-br from-violet-600 to-indigo-600 p-0.5 shadow-2xl">
                                            <div className="w-full h-full rounded-[2.4rem] bg-bg-primary flex items-center justify-center">
                                                <span className="text-3xl font-black text-text-primary uppercase italic">{candidate.name?.[0]}</span>
                                            </div>
                                        </div>
                                        <div className="absolute -bottom-2 -right-2">
                                            <MatchScoreRing score={candidate.combinedScore || 0} size={48} strokeWidth={4} invert={true} />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black text-text-primary uppercase tracking-tight leading-tight mb-1">{candidate.name}</h3>
                                        <div className="flex items-center justify-center gap-2 text-[10px] font-black text-text-muted uppercase tracking-widest bg-bg-secondary border border-border-subtle rounded-full px-3 py-1">
                                            <MapPin className="w-3 h-3" />
                                            {candidate.location || 'Konum Yok'}
                                        </div>
                                    </div>
                                </div>

                                {/* 2. AI Executive Summary */}
                                <div className="group">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="p-1.5 bg-violet-500/10 rounded-lg">
                                            <Brain className="w-3.5 h-3.5 text-violet-400" />
                                        </div>
                                        <h4 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Yönetici Özeti</h4>
                                    </div>
                                    <div className="p-5 rounded-3xl bg-violet-500/[0.03] border border-violet-500/10 group-hover:border-violet-500/30 transition-all min-h-[140px]">
                                        <p className="text-sm text-text-secondary leading-relaxed font-medium italic">
                                            {candidate.aiAnalysis?.summary || candidate.summary || "AI analizi henüz gerçekleştirilmemiş."}
                                        </p>
                                    </div>
                                </div>

                                {/* 3. Key Competencies */}
                                <div>
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="p-1.5 bg-cyan-500/10 rounded-lg">
                                            <Zap className="w-3.5 h-3.5 text-cyan-400" />
                                        </div>
                                        <h4 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Temel Yetkinlikler</h4>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {(candidate.skills || []).slice(0, 5).map((skill, sIdx) => (
                                            <span key={sIdx} className="px-3 py-1.5 rounded-xl bg-bg-secondary border border-border-subtle text-[11px] font-black text-text-primary uppercase tracking-tighter">
                                                {skill}
                                            </span>
                                        ))}
                                        {candidate.skills?.length > 5 && (
                                            <span className="px-3 py-1.5 rounded-xl bg-cyan-500/10 text-cyan-500 text-[11px] font-black">
                                                +{candidate.skills.length - 5} Diğer
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* 4. Experience & Education Stats */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 flex flex-col gap-1">
                                        <div className="flex items-center gap-1.5 text-text-muted opacity-60">
                                            <Briefcase className="w-3.5 h-3.5" />
                                            <span className="text-[9px] font-black uppercase tracking-widest">Tecrübe</span>
                                        </div>
                                        <p className="text-sm font-black text-text-primary uppercase">{candidate.experience || '0'} YIL</p>
                                    </div>
                                    <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 flex flex-col gap-1">
                                        <div className="flex items-center gap-1.5 text-text-muted opacity-60">
                                            <GraduationCap className="w-3.5 h-3.5" />
                                            <span className="text-[9px] font-black uppercase tracking-widest">Eğitim</span>
                                        </div>
                                        <p className="text-sm font-black text-text-primary uppercase truncate">{candidate.educationLevel || 'LİSANS'}</p>
                                    </div>
                                </div>

                                {/* 5. Match Details */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-amber-500/10 rounded-lg">
                                            <Trophy className="w-3.5 h-3.5 text-amber-500" />
                                        </div>
                                        <h4 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Pozisyon Uyumu</h4>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between text-xs font-black uppercase">
                                            <span className="text-text-muted">Genel Puan</span>
                                            <span className="text-text-primary">%{candidate.combinedScore || 0}</span>
                                        </div>
                                        <div className="w-full h-2 bg-bg-secondary rounded-full overflow-hidden border border-border-subtle">
                                            <div
                                                className="h-full bg-gradient-to-r from-violet-600 to-cyan-500 transition-all duration-1000"
                                                style={{ width: `${candidate.combinedScore || 0}%` }}
                                            />
                                        </div>
                                        <p className="text-[9px] font-bold text-text-muted italic uppercase text-center">
                                            {candidate.matchedPositionTitle || "GENEL HAVUZ"} - {candidate.isDeepMatch ? 'DERİN ANALİZ' : 'HIZLI TARAMA'}
                                        </p>
                                    </div>
                                </div>

                            </div>
                        ))}
                    </div>

                    {/* AI Analysis Result Display */}
                    {isAnalyzing && (
                        <div className="mt-12 p-12 stitch-glass border border-violet-500/30 rounded-[3rem] flex flex-col items-center justify-center gap-6 animate-pulse">
                            <div className="w-16 h-16 rounded-3xl bg-violet-500/20 flex items-center justify-center">
                                <Brain className="w-8 h-8 text-violet-400 animate-bounce" />
                            </div>
                            <div className="text-center">
                                <h5 className="text-xl font-black text-text-primary uppercase italic mb-2 tracking-tight">AI Analiz Motoru Çalışıyor</h5>
                                <p className="text-sm text-text-muted font-medium uppercase tracking-widest opacity-60">Aday sinyalleri çapraz sorgulanıyor...</p>
                            </div>
                            <div className="flex gap-2">
                                <div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce [animation-delay:-0.3s]" />
                                <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce [animation-delay:-0.15s]" />
                                <div className="w-2 h-2 rounded-full bg-violet-300 animate-bounce" />
                            </div>
                        </div>
                    )}

                    {analysisResult && !isAnalyzing && (
                        <div className="mt-12 animate-in slide-in-from-bottom-10 duration-700">
                            <div className="p-8 stitch-glass border border-emerald-500/30 rounded-[3rem] bg-emerald-500/[0.02]">
                                <div className="flex flex-col md:flex-row gap-12">
                                    {/* Left: Global Summary */}
                                    <div className="md:w-1/3 space-y-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                                                <Sparkles className="w-6 h-6 text-emerald-400" />
                                            </div>
                                            <div>
                                                <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">Stratejik Kazanan</h4>
                                                <p className="text-2xl font-black text-text-primary uppercase italic tracking-tighter">{analysisResult.winner}</p>
                                            </div>
                                        </div>
                                        <div className="p-6 rounded-[2rem] bg-bg-secondary border border-border-subtle shadow-inner">
                                            <h5 className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-3 opacity-60">Yönetici Özeti</h5>
                                            <p className="text-sm text-text-secondary leading-relaxed font-medium">
                                                {analysisResult.comparisonSummary}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Right: Insights Grid */}
                                    <div className="md:w-2/3 space-y-6">
                                        <h4 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] px-2">Aday Bazlı İçgörüler</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {analysisResult.candidatesInsights.map((insight, iIdx) => (
                                                <div key={iIdx} className="p-5 rounded-[2rem] bg-bg-primary border border-border-subtle hover:border-violet-500/30 transition-all shadow-sm group">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <span className="text-sm font-black text-text-primary uppercase tracking-tight">{insight.name}</span>
                                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20">%{insight.fitScore} Uyum</span>
                                                    </div>
                                                    <div className="space-y-4">
                                                        <div className="flex gap-3">
                                                            <div className="pt-1"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /></div>
                                                            <p className="text-[11px] font-bold text-text-secondary leading-snug">{insight.strength}</p>
                                                        </div>
                                                        <div className="flex gap-3">
                                                            <div className="pt-1"><AlertCircle className="w-3.5 h-3.5 text-amber-500" /></div>
                                                            <p className="text-[11px] font-bold text-text-muted leading-snug">{insight.weakness}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="p-6 rounded-[2rem] bg-violet-600/10 border border-violet-500/20">
                                            <div className="flex items-center gap-3 mb-2">
                                                <TrendingUp className="w-4 h-4 text-violet-400" />
                                                <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest">Stratejik Tavsiye</p>
                                            </div>
                                            <p className="text-[13px] font-bold text-text-primary leading-relaxed opacity-90">{analysisResult.recruitingAdvice}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="relative z-10 p-6 border-t border-border-subtle bg-bg-secondary/40 backdrop-blur-sm flex items-center justify-center gap-6">
                    <button
                        className="px-8 py-4 rounded-2xl bg-bg-primary border border-border-subtle text-text-muted text-[13px] font-black uppercase tracking-widest hover:border-violet-500 hover:text-violet-500 transition-all shadow-sm"
                        onClick={clearCompareSelection}
                    >
                        Tümünü Temizle
                    </button>
                    <button
                        disabled={isAnalyzing}
                        onClick={handleAIAnalysis}
                        className={`px-12 py-4 rounded-2xl bg-violet-600 text-white text-[13px] font-black uppercase tracking-[0.2em] shadow-xl shadow-violet-500/20 hover:scale-105 transition-all flex items-center gap-3 ${isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Brain className="w-5 h-5" />}
                        {analysisResult ? 'ANALİZİ YENİLE' : 'AI DERİN ANALİZ RAPORU OLUŞTUR'}
                    </button>
                </div>
            </div>
        </div>
    );
}
