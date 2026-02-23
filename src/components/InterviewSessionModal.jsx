// src/components/InterviewSessionModal.jsx
// Agentic Interview Session: Type → Path Selection → Conversation → Score → Save
import { useState, useRef, useEffect } from 'react';
import {
    X, Zap, Users, Box, Loader2, Sparkles, ChevronRight,
    Save, Award, AlertTriangle, TrendingUp, TrendingDown,
    Printer, MessageSquare, GitBranch, Code, Target,
    ArrowDown, PlusCircle, Flag
} from 'lucide-react';
import {
    generateInterviewPaths,
    scoreInterviewSession,
    generateFollowUpQuestion
} from '../services/geminiService';
import { useCandidates } from '../context/CandidatesContext';

const INTERVIEW_TYPES = [
    { id: 'technical', label: 'Teknik Mülakat', icon: Zap, color: 'electric', desc: 'Teknik altyapı, mimari, problem çözme yetkinlikleri' },
    { id: 'culture', label: 'Kültür Uyumu', icon: Users, color: 'emerald-500', desc: 'Davranış, iletişim, ekip uyumu, motivasyon' },
    { id: 'product', label: 'Product Mindset', icon: Box, color: 'violet-500', desc: 'Ürün bakışı, strateji, metrikler, kullanıcı odaklılık' },
];

const PATH_ICON_MAP = { code: Code, users: Users, target: Target, zap: Zap, box: Box };

export default function InterviewSessionModal({ candidate, onClose, onSessionSaved }) {
    const { updateCandidate } = useCandidates();

    // Flow: type-select → paths → interview → scoring → review
    const [phase, setPhase] = useState('type-select');
    const [interviewType, setInterviewType] = useState(null);

    // Path selection
    const [paths, setPaths] = useState([]);
    const [selectedPath, setSelectedPath] = useState(null);

    // Conversation
    const [conversation, setConversation] = useState([]);
    const [currentAnswer, setCurrentAnswer] = useState('');
    const [activeIdx, setActiveIdx] = useState(0);

    // AI
    const [isLoading, setIsLoading] = useState(false);
    const [loadingAction, setLoadingAction] = useState('');

    // Result
    const [aiResult, setAiResult] = useState(null);
    const [finalScore, setFinalScore] = useState(0);
    const [interviewerNotes, setInterviewerNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const chatEndRef = useRef(null);
    const printRef = useRef(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [conversation, activeIdx]);

    // ===== 1. Select type → generate paths =====
    const handleSelectType = async (type) => {
        setInterviewType(type);
        setPhase('paths');
        setIsLoading(true);
        setLoadingAction('paths');
        try {
            const result = await generateInterviewPaths(candidate, type);
            setPaths(Array.isArray(result) ? result : [result]);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
            setLoadingAction('');
        }
    };

    // ===== 2. Select path → start interview =====
    const handleSelectPath = (path) => {
        setSelectedPath(path);
        const initial = path.questions.map((q, i) => ({
            id: i + 1,
            question: q.question,
            answer: '',
            category: q.category,
            evaluationHint: q.evaluationHint,
            isFollowUp: false,
            depth: 0
        }));
        setConversation(initial);
        setActiveIdx(0);
        setPhase('interview');
    };

    // ===== 3. Deepen current topic =====
    const handleDeepen = async () => {
        saveCurrentAnswer();
        setIsLoading(true);
        setLoadingAction('deepen');
        try {
            const history = getAnsweredHistory();
            const followUp = await generateFollowUpQuestion(candidate, interviewType, history, 'deepen');
            const newEntry = {
                id: conversation.length + 1,
                question: followUp.question,
                answer: '',
                category: followUp.category || 'Derinleşme',
                evaluationHint: followUp.evaluationHint,
                isFollowUp: true,
                depth: (conversation[activeIdx]?.depth || 0) + 1
            };
            setConversation(prev => [...prev, newEntry]);
            setActiveIdx(conversation.length);
            setCurrentAnswer('');
        } catch (err) { console.error(err); }
        finally { setIsLoading(false); setLoadingAction(''); }
    };

    // ===== 4. New CV-based question =====
    const handleNewQuestion = async () => {
        saveCurrentAnswer();
        setIsLoading(true);
        setLoadingAction('new');
        try {
            const history = getAnsweredHistory();
            const newQ = await generateFollowUpQuestion(candidate, interviewType, history, 'new');
            const newEntry = {
                id: conversation.length + 1,
                question: newQ.question,
                answer: '',
                category: newQ.category || 'Yeni Konu',
                evaluationHint: newQ.evaluationHint,
                isFollowUp: false,
                depth: 0
            };
            setConversation(prev => [...prev, newEntry]);
            setActiveIdx(conversation.length);
            setCurrentAnswer('');
        } catch (err) { console.error(err); }
        finally { setIsLoading(false); setLoadingAction(''); }
    };

    // ===== 5. Finish → score =====
    const handleFinishInterview = async () => {
        saveCurrentAnswer();
        setPhase('scoring');
        setIsLoading(true);
        setLoadingAction('score');
        try {
            const answered = conversation
                .map(c => ({ question: c.question, answer: c.answer, evaluationHint: c.evaluationHint, category: c.category }))
                .filter(c => c.answer?.trim());
            const result = await scoreInterviewSession(candidate, interviewType, answered);
            setAiResult(result);
            setFinalScore(result.overallScore || 50);
            setPhase('review');
        } catch (err) {
            console.error(err);
            setAiResult({ overallScore: 50, overallVerdict: 'Nötr', summary: 'AI değerlendirmesi yapılamadı.', questionScores: [], strengths: [], weaknesses: [] });
            setFinalScore(50);
            setPhase('review');
        } finally { setIsLoading(false); setLoadingAction(''); }
    };

    // ===== 6. Save =====
    const handleSaveSession = async () => {
        setSaving(true);
        try {
            const session = {
                id: `interview_${Date.now()}`,
                type: interviewType,
                typeLabel: INTERVIEW_TYPES.find(t => t.id === interviewType)?.label || interviewType,
                pathTitle: selectedPath?.title || '',
                date: new Date().toISOString(),
                questions: conversation.map(c => ({
                    ...c,
                    aiScore: aiResult?.questionScores?.find(qs => qs.questionId === c.id)?.score ?? null,
                    aiFeedback: aiResult?.questionScores?.find(qs => qs.questionId === c.id)?.feedback ?? ''
                })),
                aiOverallScore: aiResult?.overallScore || 0,
                aiVerdict: aiResult?.overallVerdict || '',
                aiSummary: aiResult?.summary || '',
                aiStrengths: aiResult?.strengths || [],
                aiWeaknesses: aiResult?.weaknesses || [],
                finalScore,
                interviewerNotes,
                positionTitle: candidate?.matchedPositionTitle || candidate?.position || ''
            };
            const existing = candidate.interviewSessions || [];
            await updateCandidate(candidate.id, { interviewSessions: [...existing, session] });
            onSessionSaved?.(session);
            onClose();
        } catch (err) {
            console.error(err);
            alert('Kaydetme sırasında hata oluştu.');
        } finally { setSaving(false); }
    };

    // Helpers
    const saveCurrentAnswer = () => {
        if (!currentAnswer.trim()) return;
        setConversation(prev => {
            const u = [...prev];
            u[activeIdx] = { ...u[activeIdx], answer: currentAnswer.trim() };
            return u;
        });
    };

    const getAnsweredHistory = () => conversation.map((c, i) => ({
        question: c.question,
        answer: i === activeIdx ? (currentAnswer.trim() || c.answer) : c.answer
    })).filter(c => c.answer);

    const handlePrint = () => {
        const el = printRef.current;
        if (!el) return;
        const win = window.open('', '_blank');
        win.document.write(`<html><head><title>Mülakat - ${candidate?.name}</title>
        <style>body{font-family:'Segoe UI',sans-serif;padding:40px;color:#1a1a2e;}h1{font-size:22px;border-bottom:2px solid #000;padding-bottom:8px;}h2{font-size:16px;margin-top:24px;color:#333;}.meta{display:flex;gap:32px;margin:16px 0;font-size:13px;}.meta span{font-weight:bold;}.qa{margin:12px 0;padding:12px;background:#f9f9f9;border-left:3px solid #4361ee;}.qa .q{font-weight:bold;font-size:13px;margin-bottom:6px;}.qa .a{font-size:12px;color:#444;white-space:pre-wrap;}.qa .feedback{font-size:11px;color:#666;margin-top:4px;font-style:italic;}.score-box{display:inline-block;padding:4px 12px;background:#4361ee;color:#fff;font-weight:bold;border-radius:6px;}.pill{display:inline-block;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;margin:2px 4px;}.pill-green{background:#d1fae5;color:#065f46;}.pill-red{background:#fee2e2;color:#991b1b;}.notes{padding:12px;background:#fffbeb;border:1px solid #fbbf24;border-radius:6px;font-size:12px;margin-top:16px;}.signature{margin-top:60px;text-align:center;}.signature div{width:200px;border-top:1px solid #000;margin:0 auto;}.signature p{font-size:11px;margin-top:4px;}</style></head><body>${el.innerHTML}</body></html>`);
        win.document.close();
        setTimeout(() => win.print(), 500);
    };

    const typeInfo = INTERVIEW_TYPES.find(t => t.id === interviewType);
    const answeredCount = conversation.filter(c => c.answer?.trim()).length;
    const currentQ = conversation[activeIdx];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-3xl max-h-[92vh] bg-navy-900 rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col">

                {/* Header */}
                <div className="shrink-0 p-4 border-b border-white/[0.06] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl ${typeInfo ? `bg-${typeInfo.color}/20` : 'bg-electric/20'} flex items-center justify-center`}>
                            {typeInfo?.icon ? <typeInfo.icon className={`w-4 h-4 text-${typeInfo.color}`} /> : <MessageSquare className="w-4 h-4 text-electric" />}
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-white">
                                {phase === 'type-select' ? 'Yeni Mülakat Oturumu' : phase === 'paths' ? 'Başlangıç Rotası Seçin' : phase === 'scoring' ? 'AI Puanlama...' : phase === 'review' ? 'Sonuçlar' : `${typeInfo?.label}`}
                            </h2>
                            <p className="text-[10px] text-navy-400">
                                {candidate?.name} • {candidate?.matchedPositionTitle || candidate?.position}
                                {selectedPath && <> • <span className="text-electric">{selectedPath.title}</span></>}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {phase === 'interview' && (
                            <span className="text-[10px] font-bold text-navy-500 bg-white/5 px-2 py-1 rounded">
                                {answeredCount} cevap • {conversation.length} soru
                            </span>
                        )}
                        <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-all">
                            <X className="w-4 h-4 text-navy-400" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">

                    {/* ====== PHASE: TYPE SELECT ====== */}
                    {phase === 'type-select' && (
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-navy-300 mb-4">Mülakatın türünü seçin. AI, adayın CV'sine göre farklı başlangıç rotaları hazırlayacak.</p>
                            {INTERVIEW_TYPES.map(type => (
                                <button key={type.id} onClick={() => handleSelectType(type.id)}
                                    className="w-full p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-electric/40 hover:bg-white/[0.06] transition-all text-left group flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-xl bg-${type.color}/10 flex items-center justify-center group-hover:scale-110 transition-transform`}>
                                        <type.icon className={`w-6 h-6 text-${type.color}`} />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-sm font-bold text-white mb-0.5">{type.label}</h3>
                                        <p className="text-[11px] text-navy-400">{type.desc}</p>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-navy-500 group-hover:text-electric transition-colors" />
                                </button>
                            ))}
                        </div>
                    )}

                    {/* ====== PHASE: PATH SELECT ====== */}
                    {phase === 'paths' && (
                        <div className="p-6">
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-4">
                                    <Loader2 className="w-8 h-8 text-electric animate-spin" />
                                    <p className="text-sm text-navy-300">AI, adayın CV'sine özel mülakat rotaları hazırlıyor...</p>
                                    <p className="text-[10px] text-navy-500">Her rota farklı bir değerlendirme açısı sunar</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="mb-5">
                                        <p className="text-sm text-navy-300 mb-1">Mülakatın başlangıç rotasını seçin.</p>
                                        <p className="text-[10px] text-navy-500">Her rota farklı bir perspektiften başlar. Seçtiğiniz rotaya göre başlangıç soruları belirlenir.</p>
                                    </div>
                                    {paths.map((path, pi) => {
                                        const PathIcon = PATH_ICON_MAP[path.icon] || Target;
                                        const colors = ['electric', 'emerald-500', 'violet-500'];
                                        const c = colors[pi % colors.length];
                                        return (
                                            <button key={path.id || pi} onClick={() => handleSelectPath(path)}
                                                className="w-full p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-electric/40 hover:bg-white/[0.05] transition-all text-left group">
                                                <div className="flex items-start gap-4">
                                                    <div className={`w-10 h-10 rounded-xl bg-${c}/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                                                        <PathIcon className={`w-5 h-5 text-${c}`} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <h3 className="text-sm font-bold text-white">{path.title}</h3>
                                                            <ChevronRight className="w-4 h-4 text-navy-500 group-hover:text-electric transition-colors" />
                                                        </div>
                                                        <p className="text-[11px] text-navy-400 mb-3">{path.description}</p>
                                                        <div className="space-y-1.5">
                                                            {path.questions?.map((q, qi) => (
                                                                <div key={qi} className="flex items-start gap-2 p-2 rounded-lg bg-white/[0.02]">
                                                                    <span className={`shrink-0 w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center bg-${c}/10 text-${c}`}>
                                                                        {qi + 1}
                                                                    </span>
                                                                    <p className="text-[11px] text-navy-300 leading-relaxed">{q.question}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ====== PHASE: INTERVIEW ====== */}
                    {phase === 'interview' && (
                        <div className="flex h-full">
                            {/* Q Navigator */}
                            <div className="w-14 shrink-0 border-r border-white/[0.04] py-4 flex flex-col items-center gap-1 overflow-y-auto">
                                {conversation.map((c, i) => (
                                    <button key={i}
                                        onClick={() => { saveCurrentAnswer(); setActiveIdx(i); setCurrentAnswer(conversation[i]?.answer || ''); }}
                                        className={`w-8 h-8 rounded-lg text-[10px] font-bold transition-all relative ${activeIdx === i ? 'bg-electric text-white shadow-lg shadow-electric/30 scale-110'
                                                : c.answer?.trim() ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                    : 'bg-white/5 text-navy-500 hover:bg-white/10'
                                            }`}
                                        title={c.question.substring(0, 60)}
                                    >
                                        {i + 1}
                                        {c.isFollowUp && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-violet-500 border border-navy-900 flex items-center justify-center"><GitBranch className="w-1.5 h-1.5 text-white" /></span>}
                                    </button>
                                ))}
                                {isLoading && (loadingAction === 'deepen' || loadingAction === 'new') && (
                                    <div className="w-8 h-8 rounded-lg bg-electric/10 flex items-center justify-center">
                                        <Loader2 className="w-3 h-3 text-electric animate-spin" />
                                    </div>
                                )}
                            </div>

                            {/* Main */}
                            <div className="flex-1 flex flex-col p-5 overflow-y-auto">
                                {currentQ && (
                                    <div className="space-y-4 flex-1">
                                        {/* Question */}
                                        <div className={`p-5 rounded-2xl border ${currentQ.isFollowUp ? 'bg-violet-500/5 border-violet-500/20' : 'bg-white/[0.03] border-electric/20'}`}>
                                            <div className="flex items-start gap-3 mb-3">
                                                <span className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shadow-lg ${currentQ.isFollowUp ? 'bg-violet-500 text-white shadow-violet-500/20' : 'bg-electric text-white shadow-electric/20'}`}>
                                                    Q{activeIdx + 1}
                                                </span>
                                                <div className="flex-1">
                                                    <p className="text-sm text-white font-semibold leading-relaxed">{currentQ.question}</p>
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <span className="text-[9px] text-navy-500 bg-white/5 px-2 py-0.5 rounded">{currentQ.category}</span>
                                                        {currentQ.isFollowUp && (
                                                            <span className="text-[9px] text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                                                                <GitBranch className="w-2 h-2" /> Derinleşme
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <textarea
                                                value={currentAnswer}
                                                onChange={(e) => {
                                                    setCurrentAnswer(e.target.value);
                                                    setConversation(prev => {
                                                        const u = [...prev];
                                                        u[activeIdx] = { ...u[activeIdx], answer: e.target.value };
                                                        return u;
                                                    });
                                                }}
                                                placeholder="Adayın cevabını buraya not alın..."
                                                className="w-full h-28 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-white placeholder-navy-600 outline-none focus:border-electric/50 transition-all resize-none"
                                            />
                                            {currentQ.evaluationHint && (
                                                <p className="text-[9px] text-navy-500 mt-2 italic flex items-center gap-1">
                                                    <Sparkles className="w-2.5 h-2.5" /> {currentQ.evaluationHint}
                                                </p>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div className="grid grid-cols-3 gap-3">
                                            <button onClick={handleDeepen} disabled={isLoading || !currentQ.answer?.trim()}
                                                className="py-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 text-[11px] font-bold transition-all disabled:opacity-30 flex flex-col items-center gap-1.5">
                                                {isLoading && loadingAction === 'deepen' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDown className="w-4 h-4" />}
                                                Derinleş
                                            </button>
                                            <button onClick={handleNewQuestion} disabled={isLoading}
                                                className="py-3 rounded-xl bg-electric/10 border border-electric/20 text-electric-light hover:bg-electric/20 text-[11px] font-bold transition-all disabled:opacity-30 flex flex-col items-center gap-1.5">
                                                {isLoading && loadingAction === 'new' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                                                Yeni Soru (CV)
                                            </button>
                                            <button onClick={handleFinishInterview} disabled={isLoading || answeredCount === 0}
                                                className="py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 text-[11px] font-bold transition-all disabled:opacity-30 flex flex-col items-center gap-1.5">
                                                <Flag className="w-4 h-4" />
                                                Mülakatı Bitir
                                            </button>
                                        </div>
                                        <p className="text-[9px] text-navy-600 text-center">Sol panelden önceki sorulara dönebilirsiniz</p>
                                    </div>
                                )}
                                <div ref={chatEndRef} />
                            </div>
                        </div>
                    )}

                    {/* ====== PHASE: SCORING ====== */}
                    {phase === 'scoring' && (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="relative">
                                <Loader2 className="w-10 h-10 text-electric animate-spin" />
                                <Sparkles className="w-4 h-4 text-amber-400 absolute -top-1 -right-1 animate-pulse" />
                            </div>
                            <p className="text-sm text-navy-300 font-medium">AI, {answeredCount} cevabı analiz edip puanlıyor...</p>
                        </div>
                    )}

                    {/* ====== PHASE: REVIEW ====== */}
                    {phase === 'review' && aiResult && (
                        <div className="p-6 space-y-6">
                            {/* Score */}
                            <div className="p-6 rounded-2xl bg-gradient-to-br from-electric/10 to-transparent border border-electric/20 text-center">
                                <p className="text-[10px] text-navy-400 font-bold uppercase tracking-widest mb-2">AI Genel Mülakat Puanı</p>
                                <div className="text-5xl font-black text-white mb-1">{aiResult.overallScore}<span className="text-lg text-navy-400">/100</span></div>
                                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold mt-2 ${aiResult.overallScore >= 70 ? 'bg-emerald-500/20 text-emerald-400' : aiResult.overallScore >= 40 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>{aiResult.overallVerdict}</span>
                                <p className="text-sm text-navy-300 mt-3 leading-relaxed">{aiResult.summary}</p>
                            </div>

                            {/* Strengths / Weaknesses */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                                    <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Güçlü Yönler</h4>
                                    {aiResult.strengths?.map((s, i) => <p key={i} className="text-xs text-navy-300 mb-1">• {s}</p>)}
                                </div>
                                <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10">
                                    <h4 className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Gelişim Alanları</h4>
                                    {aiResult.weaknesses?.map((w, i) => <p key={i} className="text-xs text-navy-300 mb-1">• {w}</p>)}
                                </div>
                            </div>

                            {/* Q scores */}
                            <div className="space-y-2">
                                <h4 className="text-[10px] font-bold text-navy-400 uppercase tracking-wider">Soru Bazlı Özet</h4>
                                {conversation.filter(c => c.answer?.trim()).map((c, i) => {
                                    const qs = aiResult.questionScores?.find(s => s.questionId === c.id);
                                    return (
                                        <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold ${c.isFollowUp ? 'bg-violet-500/20 text-violet-400' : 'bg-electric/20 text-electric'}`}>{i + 1}</span>
                                            <p className="flex-1 text-xs text-navy-300 truncate">{c.question}</p>
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${(qs?.score || 0) >= 70 ? 'bg-emerald-500/20 text-emerald-400' : (qs?.score || 0) >= 40 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>{qs?.score ?? '-'}</span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Manual override */}
                            <div className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/10 space-y-4">
                                <h4 className="text-xs font-bold text-amber-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Mülakatçı Son Kararı</h4>
                                <div className="flex items-center gap-4">
                                    <input type="range" min="0" max="100" value={finalScore} onChange={(e) => setFinalScore(parseInt(e.target.value))}
                                        className="flex-1 h-2 bg-navy-800 rounded-lg appearance-none cursor-pointer accent-amber-500" />
                                    <span className="text-2xl font-black text-white w-16 text-right">{finalScore}</span>
                                </div>
                                <textarea value={interviewerNotes} onChange={(e) => setInterviewerNotes(e.target.value)}
                                    placeholder="Mülakatçı notları (isteğe bağlı)..."
                                    className="w-full h-20 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-white placeholder-navy-600 outline-none focus:border-amber-500/50 resize-none" />
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3">
                                <button onClick={handlePrint} className="px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-navy-300 hover:text-white transition-all text-sm flex items-center gap-2">
                                    <Printer className="w-4 h-4" /> PDF
                                </button>
                                <button onClick={handleSaveSession} disabled={saving}
                                    className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2">
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Mülakat Kaydını Kaydet</>}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Hidden Print */}
                <div ref={printRef} className="hidden">
                    <h1>MÜLAKAT DEĞERLENDİRME RAPORU</h1>
                    <div className="meta">
                        <div>Aday: <span>{candidate?.name}</span></div>
                        <div>Pozisyon: <span>{candidate?.matchedPositionTitle || candidate?.position}</span></div>
                        <div>Tür: <span>{typeInfo?.label}</span></div>
                        <div>Rota: <span>{selectedPath?.title}</span></div>
                        <div>Tarih: <span>{new Date().toLocaleDateString('tr-TR')}</span></div>
                    </div>
                    <h2>Genel Değerlendirme</h2>
                    <p><span className="score-box">{finalScore}/100</span></p>
                    <p style={{ fontSize: '18px', fontWeight: 'bold', margin: '8px 0' }}>{aiResult?.overallVerdict}</p>
                    <p style={{ fontSize: '13px', color: '#444', lineHeight: '1.6' }}>{aiResult?.summary}</p>
                    {aiResult?.strengths?.length > 0 && <><h2>Güçlü Yönler</h2><div>{aiResult.strengths.map((s, i) => <span key={i} className="pill pill-green">{s}</span>)}</div></>}
                    {aiResult?.weaknesses?.length > 0 && <><h2>Gelişim Alanları</h2><div>{aiResult.weaknesses.map((w, i) => <span key={i} className="pill pill-red">{w}</span>)}</div></>}
                    <h2>Sorular & Cevaplar ({conversation.filter(c => c.answer?.trim()).length})</h2>
                    {conversation.filter(c => c.answer?.trim()).map((c, i) => {
                        const qs = aiResult?.questionScores?.find(s => s.questionId === c.id);
                        return (<div key={i} className="qa"><div className="q">{c.isFollowUp ? '↳ ' : ''}Q{i + 1}: {c.question} (Puan: {qs?.score ?? '-'})</div><div className="a">{c.answer}</div>{qs?.feedback && <div className="feedback">AI: {qs.feedback}</div>}</div>);
                    })}
                    {interviewerNotes && <div className="notes"><strong>Mülakatçı Notları:</strong><br />{interviewerNotes}</div>}
                    <div className="signature"><div></div><p>İMZA / ONAY</p></div>
                </div>
            </div>
        </div>
    );
}
