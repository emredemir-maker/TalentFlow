// src/components/CandidateDrawer.jsx
// Context-aware Candidate Management + Assessment + Reporting

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
    X, Mail, Phone, MapPin, Briefcase, GraduationCap, Calendar, Globe,
    TrendingUp, TrendingDown, Brain, Target, MessageCircle, Users, Star,
    Sparkles, ChevronRight, Zap, Send, Layers, Loader2, ShieldAlert,
    ClipboardCheck, Printer, FileText, PlusCircle, Trash2, RefreshCw, ExternalLink
} from 'lucide-react';
import MatchScoreRing from './MatchScoreRing';
import AIAnalysisPanel from './AIAnalysisPanel';
import { analyzeCandidateMatch } from '../services/geminiService';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import { calculateMatchScore } from '../services/matchService';

const STATUS_CONFIG = {
    ai_analysis: { label: 'AI Analiz', dot: 'bg-violet-400', color: 'text-violet-400', next: 'review' },
    review: { label: 'İlk İnceleme', dot: 'bg-amber-400', color: 'text-amber-400', next: 'interview' },
    interview: { label: 'Mülakat Değerlendirme', dot: 'bg-blue-400', color: 'text-blue-400', next: 'deep_review' },
    deep_review: { label: 'Detaylı İnceleme', dot: 'bg-indigo-400', color: 'text-indigo-400', next: 'offer' },
    offer: { label: 'Teklif', dot: 'bg-cyan-400', color: 'text-cyan-400', next: 'hired' },
    hired: { label: 'Onaylandı', dot: 'bg-emerald-400', color: 'text-emerald-400', next: null },
    rejected: { label: 'Reddedildi', dot: 'bg-red-400', color: 'text-red-400', next: null },
};

const REJECTION_REASONS = [
    { id: 'not_suitable', label: 'Uygun Değil' },
    { id: 'declined', label: 'Kabul Etmedi' },
    { id: 'wrong_entry', label: 'Hatalı Kayıt' }
];


export default function CandidateDrawer({ candidate: initialCandidate, onClose, positionContext = null }) {
    const { updateCandidate, candidates: allCandidates, setViewCandidateId } = useCandidates();
    const candidate = allCandidates.find(c => c.id === initialCandidate?.id) || initialCandidate;

    const { positions } = usePositions();

    const [updatingStatus, setUpdatingStatus] = useState(false);
    const reportRef = useRef(null);

    // UI State
    const [activeTab, setActiveTab] = useState(positionContext ? 'ai-analysis' : 'profile');
    const [expandedPositionId, setExpandedPositionId] = useState(positionContext ? positionContext.id : null);
    const [showJobInput, setShowJobInput] = useState(false);

    // AI Analysis State
    const [aiResult, setAiResult] = useState(candidate?.aiAnalysis || null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState(null);
    const [jobDescription, setJobDescription] = useState('');

    // Assessment State (Point 3)
    const [assessments, setAssessments] = useState(candidate?.assessments || {
        technical: 0,
        communication: 0,
        culture: 0,
        notes: ''
    });

    const liveScore = Math.round((assessments.technical + assessments.communication + assessments.culture) / 3);

    // Score Calculation (Find best AI match in positionAnalyses)
    const activeMatch = useMemo(() => {
        let highestScore = 0;
        let bestAnalysis = null;
        let bestTitle = candidate?.matchedPositionTitle || null;

        // Try getting specific context or highest available
        if (positionContext && candidate?.positionAnalyses?.[positionContext.title]) {
            bestAnalysis = candidate.positionAnalyses[positionContext.title];
            bestTitle = positionContext.title;
        } else if (candidate?.positionAnalyses) {
            Object.entries(candidate.positionAnalyses).forEach(([title, analysis]) => {
                if (analysis && analysis.score > highestScore) {
                    highestScore = analysis.score;
                    bestAnalysis = analysis;
                    bestTitle = title;
                }
            });
        }

        if (bestAnalysis) {
            let rs = [];
            if (Array.isArray(bestAnalysis.reasons) && bestAnalysis.reasons.length > 0) {
                rs = bestAnalysis.reasons;
            } else if (bestAnalysis.summary) {
                rs = [bestAnalysis.summary];
            } else {
                rs = ['AI Analizi Mevcut'];
            }

            return {
                score: bestAnalysis.score,
                isHighMatch: bestAnalysis.score >= 75,
                reasons: rs,
                initialScore: candidate?.initialAiScore || bestAnalysis.score,
                title: bestTitle
            };
        }

        // Fallback to static algorithm if no AI exists
        const targetPos = positionContext || positions.find(p => p.title === candidate?.matchedPositionTitle) || positions[0];
        const baseMatch = calculateMatchScore(candidate, targetPos);
        return {
            ...baseMatch,
            initialScore: candidate?.initialAiScore || baseMatch.score,
            title: targetPos?.title
        };
    }, [candidate, positionContext, positions]);



    // Calculate smart matches for open positions (Point 1 & 2)
    const smartMatches = useMemo(() => {
        if (!positions || !candidate) return [];
        return positions
            .filter(p => p.status === 'open')
            .map(p => {
                // Check if we have a stored AI analysis for this specific position
                const savedAnalysis = candidate.positionAnalyses?.[p.title];

                if (savedAnalysis) {
                    return {
                        position: p,
                        match: {
                            score: savedAnalysis.score,
                            reasons: savedAnalysis.reasons || (savedAnalysis.summary ? [savedAnalysis.summary] : ['AI Analizi Mevcut']),
                            isAi: true // Flag to show AI indicator
                        }
                    };
                }

                return {
                    position: p,
                    match: calculateMatchScore(candidate, p)
                };
            })
            .sort((a, b) => b.match.score - a.match.score);
    }, [positions, candidate]);


    const handleUpdateAssessment = async () => {
        setUpdatingStatus(true);
        try {
            // Calculate a human assessment score (average of the three metrics)
            const humanScore = Math.round((assessments.technical + assessments.communication + assessments.culture) / 3);

            // Determine stage based on current status
            let newStage = 'review';
            if (['interview', 'deep_review'].includes(candidate.status)) {
                newStage = 'interview';
            } else if (['offer', 'hired'].includes(candidate.status)) {
                newStage = 'offer';
            }


            const updates = {
                assessments,
                matchScore: humanScore, // Human score becomes the definitive matchScore
                scoringStage: newStage,
                manualScore: humanScore,
                lastAssessedBy: 'Human'
            };

            await updateCandidate(candidate.id, updates);
            alert('Değerlendirme başarıyla kaydedildi. Skor güncellendi ve AI ezilmesine karşı korumaya alındı.');
        } catch (err) {
            console.error(err);
        } finally {
            setUpdatingStatus(false);
        }
    };

    const handlePrintReport = () => {
        window.print();
    };


    const handleRunAnalysis = useCallback(async () => {
        setAiLoading(true);
        setAiError(null);
        setActiveTab('ai-analysis');

        try {
            const openPositions = positions.filter(p => p.status === 'open');
            if (openPositions.length === 0) {
                alert("Açık pozisyon bulunamadı.");
                setAiLoading(false);
                return;
            }

            const updatedAnalyses = { ...(candidate.positionAnalyses || {}) };
            let highestScore = -1;
            let bestResult = null;
            let bestTitle = null;

            // Analyze all open positions in parallel
            await Promise.all(openPositions.map(async (pos) => {
                const descToUse = `${pos.title}\n${(pos.requirements || []).join(', ')}\n${pos.description || ''}`;
                try {
                    const result = await analyzeCandidateMatch(descToUse, candidate, 'gemini-2.0-flash');
                    updatedAnalyses[pos.title] = result;

                    if (result.score > highestScore) {
                        highestScore = result.score;
                        bestResult = result;
                        bestTitle = pos.title;
                    }
                } catch (e) {
                    console.error("AI Error for pos", pos.title, e);
                }
            }));

            if (!bestResult) throw new Error("Aday hiçbir pozisyon için analiz edilemedi.");

            setAiResult(bestResult);

            const updates = {
                aiAnalysis: bestResult, // keep backward compat
                aiScore: bestResult.score,
                matchedPositionTitle: bestTitle,
                summary: bestResult.summary,
                positionAnalyses: updatedAnalyses,
                lastScannedAt: new Date().toISOString()
            };

            // Rule: AI can only overwrite common matchScore in 'initial' stage
            const currentStage = candidate.scoringStage || 'initial';
            if (currentStage === 'initial') {
                updates.matchScore = bestResult.score;
                updates.initialAiScore = bestResult.score;
            }

            await updateCandidate(candidate.id, updates);
        } catch (err) {
            setAiError(err.message);
        } finally {
            setAiLoading(false);
        }
    }, [candidate, positions, updateCandidate]);

    if (!candidate) return null;

    const status = STATUS_CONFIG[candidate.status] || STATUS_CONFIG.ai_analysis;


    return (
        <>
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] print:hidden" onClick={onClose} />
            <div className="fixed top-0 right-0 h-full w-full max-w-[560px] z-[70] flex flex-col bg-navy-900 border-l border-white/[0.06] shadow-2xl animate-slide-in-right overflow-hidden print:static print:w-full print:max-w-none print:shadow-none print:bg-white print:text-black">

                {/* ===== HEADER ===== */}
                <div className="shrink-0 p-6 border-b border-white/[0.06] print:border-black">
                    <div className="flex items-start justify-between mb-5">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-electric to-violet-accent flex items-center justify-center text-xl font-bold text-white print:bg-none print:text-black print:border print:border-black">
                                {candidate.name?.[0]}
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white print:text-black">{candidate.name || 'İsimsiz'}</h2>
                                <p className="text-sm text-navy-400 print:text-gray-600">{candidate.position || 'Aday'}</p>

                                <div className="flex flex-wrap items-center gap-2 mt-2 print:hidden">
                                    {/* STATUS BADGE & SWITCHER */}
                                    <div className="relative group/status">
                                        <div className={`flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] cursor-pointer hover:bg-white/[0.06] transition-all`}>
                                            <span className={`w-2 h-2 rounded-full ${status.dot}`} />
                                            <span className="text-[11px] text-navy-300 font-bold uppercase tracking-wider">{status.label}</span>
                                            {candidate.rejectionReason && (
                                                <span className="text-[10px] text-red-400/80 font-medium lowercase italic">({REJECTION_REASONS.find(r => r.id === candidate.rejectionReason)?.label})</span>
                                            )}
                                        </div>

                                        {/* Status Dropdown */}
                                        <div className="absolute top-full left-0 mt-2 w-56 bg-navy-800 border border-white/[0.08] rounded-xl shadow-2xl opacity-0 invisible group-hover/status:opacity-100 group-hover/status:visible transition-all z-[80] p-1.5 backdrop-blur-xl">
                                            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                                                <button
                                                    key={key}
                                                    onClick={() => updateCandidate(candidate.id, { status: key, rejectionReason: null })}
                                                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-[11px] font-bold transition-all ${candidate.status === key ? 'bg-white/[0.06] text-white' : 'text-navy-400 hover:bg-white/[0.04] hover:text-navy-100'}`}
                                                >
                                                    <span className={`w-2 h-2 rounded-full ${config.dot}`} />
                                                    {config.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Next Step Shortcut */}
                                    {status.next && (
                                        <button
                                            onClick={() => updateCandidate(candidate.id, { status: status.next, rejectionReason: null })}
                                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-electric/10 border border-electric/20 text-electric-light text-[10px] font-bold hover:bg-electric/20 transition-all"
                                        >
                                            Sonraki Aşama
                                            <ChevronRight className="w-3 h-3" />
                                        </button>
                                    )}

                                    {/* Reject Button & Sub-reasons */}
                                    {candidate.status !== 'rejected' && candidate.status !== 'hired' && (
                                        <div className="relative group/reject">
                                            <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/5 border border-red-500/10 text-red-400/60 text-[10px] font-bold hover:bg-red-500/10 hover:text-red-400 transition-all">
                                                Reddet
                                            </button>
                                            <div className="absolute top-full left-0 mt-2 w-40 bg-navy-800 border border-white/[0.08] rounded-xl shadow-2xl opacity-0 invisible group-hover/reject:opacity-100 group-hover/reject:visible transition-all z-[80] p-1.5 backdrop-blur-xl">
                                                <div className="px-3 py-1.5 text-[9px] font-bold text-navy-500 uppercase tracking-widest border-b border-white/[0.04] mb-1">Neden?</div>
                                                {REJECTION_REASONS.map(reason => (
                                                    <button
                                                        key={reason.id}
                                                        onClick={() => updateCandidate(candidate.id, { status: 'rejected', rejectionReason: reason.id })}
                                                        className="w-full text-left px-3 py-2 rounded-lg text-[11px] font-bold text-navy-400 hover:bg-red-500/10 hover:text-red-400 transition-all"
                                                    >
                                                        {reason.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 print:hidden">
                            <button
                                onClick={() => {
                                    setViewCandidateId(candidate.id);
                                    window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }));
                                    onClose();
                                }}
                                className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all font-bold text-[11px] flex gap-2 items-center shadow-sm"
                                title="Adayın Detaylı Arayüzüne Git"
                            >
                                <ExternalLink className="w-4 h-4" />
                                Portal Görünümü
                            </button>
                            <button onClick={() => setShowSendModal(true)} className="p-2 rounded-lg bg-electric/10 border border-electric/20 text-electric-light hover:bg-electric/20 transition-all shadow-sm" title="Aday İletişimi (Mülakat/Red)">
                                <Mail className="w-4 h-4" />
                            </button>
                            <button onClick={handlePrintReport} className="p-2 rounded-lg bg-white/[0.04] text-navy-400 hover:text-white" title="Rapor Al">
                                <Printer className="w-4 h-4" />
                            </button>
                            <button onClick={onClose} className="p-2 rounded-lg bg-white/[0.04] text-navy-400 hover:text-white">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>


                <div className="flex items-center gap-6 p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-4 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-electric/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-electric/10 transition-colors" />

                    <div className="relative">
                        <MatchScoreRing
                            score={activeTab === 'assessments' ? liveScore : activeMatch.score}
                            size={80}
                        />
                        {activeTab === 'assessments' && liveScore !== activeMatch.score && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 border border-navy-900 flex items-center justify-center animate-pulse">
                                <Zap className="w-2.5 h-2.5 text-white" />
                            </div>
                        )}
                    </div>

                    <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="text-[10px] uppercase tracking-widest text-navy-500 font-bold">
                                {activeMatch.title
                                    ? `${activeMatch.title} Uygunluğu`
                                    : 'Aday Uyumluluk Tahmini'}
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter ${candidate.scoringStage === 'initial' || !candidate.scoringStage ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                                {candidate.scoringStage === 'interview' ? 'Mülakat Skoru' : candidate.scoringStage === 'review' ? 'İnceleme Skoru' : 'İlk AI Skoru'}
                            </span>
                        </div>

                        <div className="flex items-end gap-3">
                            <div className="text-4xl font-black text-white tracking-tight">
                                %{activeTab === 'assessments' ? liveScore : activeMatch.score}
                            </div>

                            {/* SCORE EVOLUTION */}
                            <div className="flex flex-col mb-1 border-l border-white/[0.08] pl-3">
                                <div className="flex items-center gap-1.5 grayscale opacity-50">
                                    <span className="text-[9px] font-bold text-navy-400">İlk: %{activeMatch.initialScore}</span>
                                    <ChevronRight className="w-2 h-2 text-navy-600" />
                                    <span className="text-[9px] font-bold text-emerald-400">Şu an: %{activeMatch.score}</span>
                                </div>
                                <div className="text-[9px] text-navy-500 mt-1">
                                    Kaynak: <span className="font-bold text-navy-300">{candidate.lastAssessedBy || 'Otonom AI'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        {activeMatch.isHighMatch ? (
                            <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[11px] font-bold border border-emerald-500/20 flex items-center gap-2 shadow-lg shadow-emerald-500/5">
                                <Star className="w-3.5 h-3.5" /> Güçlü Aday
                            </div>
                        ) : (
                            <div className="flex flex-col items-end gap-1">
                                <div className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-[11px] font-bold border border-red-500/20 flex items-center gap-2 shadow-lg shadow-red-500/5">
                                    <ShieldAlert className="w-3.5 h-3.5" /> Manuel İnceleme
                                </div>
                                {activeMatch.reasons[0] && (
                                    <span className="text-[9px] text-navy-400 max-w-[150px] text-right leading-tight">
                                        {activeMatch.reasons[0]}
                                    </span>
                                )}
                            </div>
                        )}

                        {activeTab === 'assessments' && liveScore !== activeMatch.score && (
                            <div className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-500 text-[10px] font-bold border border-amber-500/20 animate-pulse text-center">
                                Kaydedilmemiş Değişiklik
                            </div>
                        )}
                    </div>
                </div>




                {/* TABS */}
                <div className="flex gap-1 print:hidden mb-4">
                    {[
                        { id: 'profile', label: 'Profil', icon: FileText },
                        { id: 'ai-analysis', label: 'Pozisyonlar & AI Analiz', icon: Target },
                        { id: 'assessments', label: 'Değerlendirme', icon: ClipboardCheck }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 flex flex-col items-center py-2.5 rounded-xl transition-all ${activeTab === tab.id ? 'bg-electric/10 text-electric-light shadow-inner shadow-electric/5 ring-1 ring-electric/20' : 'text-navy-500 hover:bg-white/[0.04]'}`}
                        >
                            <tab.icon className={`w-4 h-4 mb-1.5 ${activeTab === tab.id ? 'text-electric-light' : 'text-navy-500'}`} />
                            <span className="text-[10px] font-bold uppercase tracking-tight">{tab.label}</span>
                        </button>
                    ))}
                </div>



                {/* ===== CONTENT ===== */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide print:overflow-visible print:p-0">

                    {/* TAB: PROFILE */}
                    {activeTab === 'profile' && (
                        <div className="space-y-6">
                            <Section title="AI Görüşü & Öne Çıkanlar">
                                <div className="space-y-4">
                                    <p className="text-sm text-navy-200 leading-relaxed italic border-l-2 border-electric/30 pl-4 py-1">
                                        {candidate.aiAnalysis?.summary || activeMatch.reasons[0] || candidate.summary || candidate.about || 'Aday hakkında özet bilgi bulunmuyor.'}
                                    </p>

                                    {candidate.aiAnalysis?.reasons?.length > 0 && (
                                        <div className="grid grid-cols-1 gap-2 mt-2">
                                            {candidate.aiAnalysis.reasons.map((r, i) => (
                                                <div key={i} className="flex gap-2 p-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-[11px] text-navy-300">
                                                    <Sparkles className="w-3 h-3 text-electric-light shrink-0 mt-0.5" />
                                                    <span>{r}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </Section>

                            <Section title="Eğitim & Deneyim">

                                <div className="grid grid-cols-2 gap-3">
                                    <MiniCard label="Deneyim" value={`${candidate.experience || 0} Yıl`} icon={Briefcase} />
                                    <MiniCard label="Eğitim" value={candidate.education || 'Belirtilmemiş'} icon={GraduationCap} />
                                    <MiniCard label="Departman" value={candidate.department} icon={Layers} />
                                    <MiniCard label="Maaş Beklentisi" value={candidate.salary} icon={Star} />
                                </div>
                            </Section>

                            <Section title="Teknik Yetkinlikler">
                                <div className="flex flex-wrap gap-2">
                                    {candidate.skills?.map(skill => (
                                        <span key={skill} className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-navy-200">
                                            {skill}
                                        </span>
                                    ))}
                                </div>
                            </Section>
                        </div>
                    )}

                    {/* TAB: COMBINED POSITIONS & AI ANALYSIS */}
                    {activeTab === 'ai-analysis' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-lg mb-4 shadow-sm">
                                <span className="text-xs font-semibold leading-relaxed max-w-[70%]">
                                    * Aday mevcut özgeçmişiyle sistemdeki tüm açık pozisyonlarla karşılaştırılır. Detaylı analiz için pozisyona tıklayın.
                                </span>
                                <button
                                    onClick={handleRunAnalysis}
                                    disabled={aiLoading}
                                    className="flex items-center gap-1.5 px-3 py-2 bg-electric-light/10 text-electric-light rounded-lg hover:bg-electric-light/20 text-xs font-bold transition-all disabled:opacity-50 shrink-0"
                                >
                                    {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                    Yeniden Analiz Et
                                </button>
                            </div>

                            {aiError && <div className="p-3 text-red-400 text-xs bg-red-500/10 rounded-lg font-medium">{aiError}</div>}

                            <div className="space-y-3">
                                {smartMatches.map(({ position: pos, match }) => {
                                    const isExpanded = expandedPositionId === pos.id;
                                    const posAnalysis = candidate.positionAnalyses?.[pos.title];
                                    const hasAI = !!posAnalysis;

                                    return (
                                        <div key={pos.id} className={`rounded-xl border transition-all duration-300 overflow-hidden ${isExpanded ? 'bg-navy-900 border-electric/30 shadow-[0_4px_24px_rgba(59,130,246,0.1)]' : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]'}`}>
                                            <div
                                                className="p-4 cursor-pointer flex justify-between items-center group select-none"
                                                onClick={() => setExpandedPositionId(isExpanded ? null : pos.id)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <h4 className={`font-bold text-[14px] transition-colors ${isExpanded ? 'text-white' : 'text-navy-100 group-hover:text-white'}`}>{pos.title}</h4>
                                                    {hasAI && (
                                                        <span className="text-[9px] font-bold uppercase tracking-widest bg-violet-500/10 text-violet-400 border border-violet-500/20 px-2 py-0.5 rounded flex items-center gap-1 shadow-sm">
                                                            <Sparkles className="w-2.5 h-2.5" /> AI Analizli
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className={`text-[11px] font-bold px-2 py-1 rounded-md flex items-center gap-1 shadow-sm ${match.score >= 70 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-navy-800 text-navy-400 border border-white/[0.06]'}`}>
                                                        {match.score >= 70 ? '🟢' : '🟡'} %{match.score}
                                                    </span>
                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${isExpanded ? 'bg-electric/20' : 'bg-white/[0.04] group-hover:bg-white/[0.08]'}`}>
                                                        <ChevronRight className={`w-4 h-4 text-navy-300 transition-transform duration-300 ${isExpanded ? 'rotate-90 text-electric-light' : ''}`} />
                                                    </div>
                                                </div>
                                            </div>

                                            {isExpanded && (
                                                <div className="px-5 pb-5 border-t border-white/[0.04] pt-5 bg-navy-950/30 animate-in slide-in-from-top-2 duration-200">
                                                    {posAnalysis ? (
                                                        <AIAnalysisPanel
                                                            result={posAnalysis}
                                                            loading={aiLoading}
                                                            error={null}
                                                            onRetry={null} // Global retry is used instead
                                                            title={pos.title}
                                                            targetScore={match.score}
                                                        />
                                                    ) : (
                                                        <div className="text-center py-8">
                                                            {aiLoading ? (
                                                                <div className="flex flex-col items-center gap-3">
                                                                    <Loader2 className="w-6 h-6 text-electric animate-spin" />
                                                                    <p className="text-sm font-medium text-electric-light">AI Analizi Sürüyor...</p>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <div className="w-12 h-12 rounded-full bg-navy-800 flex items-center justify-center mx-auto mb-3">
                                                                        <Brain className="w-6 h-6 text-navy-400" />
                                                                    </div>
                                                                    <p className="text-[13px] text-navy-300 mb-4 max-w-[250px] mx-auto">Bu pozisyon için henüz detaylı yapay zeka analizi yapılmamış.</p>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleRunAnalysis(); }}
                                                                        className="text-xs font-bold text-white px-5 py-2.5 bg-electric rounded-xl shadow-[0_4px_12px_rgba(59,130,246,0.3)] hover:scale-105 transition-all"
                                                                    >
                                                                        Tüm Pozisyonları Analiz Et
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* PRINT-ONLY EVALUATION REPORT (Point 4) */}
                    <div className="hidden print:block space-y-8 mt-10">
                        <div className="border-b-2 border-black pb-4">
                            <h1 className="text-2xl font-black">ADAY DEĞERLENDİRME RAPORU</h1>
                            <p className="text-sm font-bold">Oluşturulma Tarihi: {new Date().toLocaleDateString()}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-10">
                            <div>
                                <h3 className="font-black border-b border-gray-300 mb-2">SİSTEM SKORU</h3>
                                <p className="text-4xl font-black">%{activeMatch.systemScore || 0}</p>
                                <div className="mt-2 text-xs space-y-1">
                                    {activeMatch.reasons.map((r, i) => <p key={i}>• {r}</p>)}
                                </div>
                            </div>
                            <div>
                                <h3 className="font-black border-b border-gray-300 mb-2">MÜLAKAT SKORU</h3>
                                <p className="text-4xl font-black">%{Math.round((assessments.technical + assessments.communication + assessments.culture) / 3) || 0}</p>
                            </div>
                        </div>
                        <div className="p-4 bg-gray-50 border border-gray-200">
                            <h3 className="font-black mb-2">KARAR VERİCİ NOTLARI</h3>
                            <p className="text-sm italic">{assessments.notes || 'Not girilmemiştir.'}</p>
                        </div>
                        <div className="pt-20 text-center">
                            <div className="w-48 border-t border-black mx-auto"></div>
                            <p className="text-xs font-bold mt-2">İMZA / ONAY</p>
                        </div>
                    </div>

                </div>

                {/* ===== FOOTER ===== */}
                <div className="shrink-0 p-4 border-t border-white/[0.06] flex gap-3 print:hidden">
                    {candidate.cvUrl && (
                        <a
                            href={candidate.cvUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="py-2.5 px-4 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[13px] font-bold text-purple-400 hover:bg-purple-500/20 transition-all flex items-center gap-2"
                        >
                            <FileText className="w-4 h-4" /> CV Gör
                        </a>
                    )}

                    <button onClick={handlePrintReport} className="py-2.5 px-4 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] font-semibold text-navy-300 hover:text-white transition-all flex items-center gap-2">
                        <Printer className="w-4 h-4" />
                    </button>

                    {activeTab === 'assessments' && (
                        <button
                            onClick={handleUpdateAssessment}
                            disabled={updatingStatus}
                            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-[0_4px_16px_rgba(16,185,129,0.2)] flex items-center justify-center gap-2 transition-all active:scale-95"
                        >
                            {updatingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ClipboardCheck className="w-4 h-4" /> Değerlendirmeyi Kaydet</>}
                        </button>
                    )}
                </div>
            </div>
        </>
    );
}




function Section({ title, children }) {
    return (
        <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-navy-500 mb-3">{title}</h3>
            {children}
        </div>
    );
}

function MiniCard({ label, value, icon: Icon }) {
    return (
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-1.5 mb-1.5">
                <Icon className="w-3.5 h-3.5 text-navy-500" />
                <span className="text-[9px] uppercase tracking-widest text-navy-500 font-black">{label}</span>
            </div>
            <div className="text-[13px] font-bold text-white truncate">{value || '---'}</div>
        </div>
    );
}

function RangeInput({ label, value, onChange }) {
    return (
        <div className="space-y-2">
            <div className="flex justify-between items-center text-[11px] font-bold">
                <span className="text-navy-300 uppercase tracking-tighter">{label}</span>
                <span className="text-white px-2 py-0.5 rounded bg-white/10">%{value}</span>
            </div>
            <input
                type="range" min="0" max="100" value={value}
                onChange={e => onChange(parseInt(e.target.value))}
                className="w-full h-1.5 bg-navy-800 rounded-lg appearance-none cursor-pointer accent-electric"
            />
        </div>
    );
}
