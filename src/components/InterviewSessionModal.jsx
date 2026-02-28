// src/components/InterviewSessionModal.jsx
// Agentic Interview Session: Type → Path Selection → Conversation → Score → Save
import { useState, useRef, useEffect } from 'react';
import {
    X, Zap, Users, Box, Loader2, Sparkles, ChevronRight,
    Save, Award, AlertTriangle, TrendingUp, TrendingDown,
    Printer, MessageSquare, GitBranch, Code, Target,
    ArrowDown, PlusCircle, Flag, ShieldCheck
} from 'lucide-react';
import {
    generateInterviewPaths,
    scoreInterviewSession,
    generateFollowUpQuestion
} from '../services/ai/interview';
import LiveObserverPanel from './LiveObserverPanel';
import { useCandidates } from '../context/CandidatesContext';

const INTERVIEW_TYPES = [
    { id: 'technical', label: 'Teknik Mülakat', icon: Zap, color: 'electric', desc: 'Teknik altyapı, mimari, problem çözme yetkinlikleri' },
    { id: 'culture', label: 'Kültür Uyumu', icon: Users, color: 'emerald-500', desc: 'Davranış, iletişim, ekip uyumu, motivasyon' },
    { id: 'product', label: 'Product Mindset', icon: Box, color: 'violet-500', desc: 'Ürün bakışı, strateji, metrikler, kullanıcı odaklılık' },
];

const COMPETENCY_MODES = [
    { id: 'technical', label: 'Teknik Derinlik', icon: Code, color: 'electric' },
    { id: 'stress', label: 'Stres Yönetimi', icon: AlertTriangle, color: 'red-400' },
    { id: 'team', label: 'Ekip Uyumu', icon: Users, color: 'emerald-400' },
    { id: 'growth', label: 'Gelişim Odaklılık', icon: TrendingUp, color: 'amber-400' },
    { id: 'problem', label: 'Problem Çözme', icon: Target, color: 'blue-400' },
    { id: 'leadership', label: 'Sahiplenme', icon: Award, color: 'purple-400' },
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
    const [isLoading, setIsLoading] = useState(false); // Kept isLoading as it's used elsewhere
    const [saving, setSaving] = useState(false);
    const [loadingAction, setLoadingAction] = useState('');
    const [expandedIdx, setExpandedIdx] = useState(null);
    const [isEvaluating, setIsEvaluating] = useState(false); // New state to control transcript updates during evaluation

    // Result
    const [aiResult, setAiResult] = useState(null);
    const [finalScore, setFinalScore] = useState(0);
    const [interviewerNotes, setInterviewerNotes] = useState('');

    // Live Mode
    const [isLiveMode, setIsLiveMode] = useState(false);
    const [liveSuggestions, setLiveSuggestions] = useState([]);
    const [starScores, setStarScores] = useState({ S: 0, T: 0, A: 0, R: 0 });
    const [logicIntegrity, setLogicIntegrity] = useState(0);
    const [liveTranscript, setLiveTranscript] = useState(''); // New state for live transcript

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

    // ===== 4. New CV-based question (can be generic or category-specific) =====
    const handleNewQuestion = async (category = null) => {
        saveCurrentAnswer();
        setIsLoading(true);
        setLoadingAction(category ? `cat-${category.id}` : 'new');
        try {
            const history = getAnsweredHistory();
            const mode = category ? 'category' : 'new';
            const newQ = await generateFollowUpQuestion(candidate, interviewType, history, mode, category?.label);

            const newEntry = {
                id: conversation.length + 1,
                question: newQ.question,
                answer: '',
                category: category?.label || newQ.category || 'Yeni Konu',
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
        setIsEvaluating(true); // Start evaluation, disable further transcript updates

        setPhase('scoring');
        setIsLoading(true);
        setLoadingAction('score');
        try {
            // Get the very latest state of the conversation, including the unsaved currentAnswer
            const finalConversation = conversation.map((c, i) => {
                if (i === activeIdx) return { ...c, answer: currentAnswer.trim() || c.answer };
                return c;
            });

            const answered = finalConversation
                .map(c => ({ id: c.id, question: c.question, answer: c.answer, evaluationHint: c.evaluationHint, category: c.category }))
                .filter(c => c.answer?.trim());

            const result = await scoreInterviewSession(candidate, interviewType, answered);

            // Sync local conversation state too
            setConversation(finalConversation);
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
                // Sadece cevaplanmış soruları kaydet
                questions: conversation
                    .filter(c => c.answer?.trim())
                    .map(c => ({
                        id: c.id,
                        question: c.question,
                        answer: c.answer,
                        category: c.category,
                        isFollowUp: c.isFollowUp,
                        aiScore: aiResult?.questionScores?.find(qs => qs.questionId === c.id)?.score ?? null,
                        aiFeedback: aiResult?.questionScores?.find(qs => qs.questionId === c.id)?.feedback ?? ''
                    })),
                aiOverallScore: aiResult?.overallScore || 0,
                aiVerdict: aiResult?.overallVerdict || '',
                aiSummary: aiResult?.summary || '',
                aiStrengths: aiResult?.strengths || [],
                aiWeaknesses: aiResult?.weaknesses || [],
                finalScore,
                interviewerNotes: interviewerNotes?.trim() || '',
                positionTitle: candidate?.matchedPositionTitle || candidate?.position || '',
                // Shadow Observer Data
                isLiveMode,
                logicIntegrity: isLiveMode ? logicIntegrity : null,
                starScores: isLiveMode ? starScores : null
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
            <div className={`relative w-full transition-all duration-500 ease-in-out h-[90vh] bg-navy-950 cyber-glass rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden flex flex-col tech-grid ${isLiveMode ? 'max-w-7xl' : 'max-w-5xl'}`}>
                <div className="absolute inset-0 bg-gradient-to-br from-electric/5 via-transparent to-violet-500/5 pointer-events-none" />

                {/* Header */}
                <div className="shrink-0 p-4 border-b border-white/[0.06] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl ${typeInfo ? `bg-${typeInfo.color}/20` : 'bg-electric/20'} flex items-center justify-center`}>
                            {typeInfo?.icon ? <typeInfo.icon className={`w-4 h-4 text-${typeInfo.color}`} /> : <MessageSquare className="w-4 h-4 text-electric" />}
                        </div>
                        <div>
                            <h2 className="text-xs font-black text-text-primary hud-text tracking-widest neon-glow-blue">
                                {phase === 'type-select' ? 'MÜLAKAT KURULUMU' : phase === 'paths' ? 'ROTA KONFİGÜRASYONU' : phase === 'scoring' ? 'ANALİZ EDİLİYOR...' : phase === 'review' ? 'DEĞERLENDİRME RAPORU' : `MÜLAKAT: ${typeInfo?.label}`}
                            </h2>
                            <p className="text-[9px] text-navy-500 font-bold hud-text">
                                {candidate?.name} • {candidate?.matchedPositionTitle || candidate?.position}
                                {selectedPath && <> • <span className="text-electric">{selectedPath.title}</span></>}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {phase === 'interview' && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsLiveMode(!isLiveMode)}
                                    className={`px-3 py-1.5 rounded-xl text-[9px] font-black hud-text tracking-widest transition-all border ${isLiveMode ? 'bg-red-500/20 border-red-500/40 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-pulse' : 'bg-white/5 border-white/10 text-navy-500 hover:text-text-primary hover:border-white/20'}`}
                                >
                                    {isLiveMode ? '● SHADOW OBSERVER: ON' : 'SHADOW OBSERVER: OFF'}
                                </button>
                                <span className="text-[9px] font-bold text-navy-400 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5 hud-text">
                                    {answeredCount} ANS / {conversation.length} Q
                                </span>
                            </div>
                        )}
                        <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-all">
                            <X className="w-4 h-4 text-navy-400" />
                        </button>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex overflow-hidden min-h-0">
                    {/* Left: Interview Area */}
                    <div className={`flex-1 overflow-y-auto transition-all duration-500 custom-scrollbar ${isLiveMode ? 'border-r border-white/5' : ''}`}>

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
                                            <h3 className="text-sm font-bold text-text-primary mb-0.5">{type.label}</h3>
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
                                                                <h3 className="text-sm font-bold text-text-primary">{path.title}</h3>
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
                            <div className="flex h-full w-full overflow-hidden">
                                {/* Q Navigator */}
                                <div className="w-14 shrink-0 border-r border-white/[0.04] py-4 flex flex-col items-center gap-1 overflow-y-auto">
                                    {conversation.map((c, i) => (
                                        <button key={i}
                                            onClick={() => { saveCurrentAnswer(); setActiveIdx(i); setCurrentAnswer(conversation[i]?.answer || ''); }}
                                            className={`w-8 h-8 rounded-lg text-[10px] font-bold transition-all relative ${activeIdx === i ? 'bg-electric text-text-primary shadow-lg shadow-electric/30 scale-110'
                                                : c.answer?.trim() ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                    : 'bg-white/5 text-navy-500 hover:bg-white/10'
                                                }`}
                                            title={c.question?.substring(0, 60) || ''}
                                        >
                                            {i + 1}
                                            {c.isFollowUp && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-violet-500 border border-navy-900 flex items-center justify-center"><GitBranch className="w-1.5 h-1.5 text-text-primary" /></span>}
                                        </button>
                                    ))}
                                    {isLoading && (loadingAction === 'deepen' || loadingAction === 'new') && (
                                        <div className="w-8 h-8 rounded-lg bg-electric/10 flex items-center justify-center">
                                            <Loader2 className="w-3 h-3 text-electric animate-spin" />
                                        </div>
                                    )}
                                </div>

                                {/* Main Content Area */}
                                <div className="flex-1 flex flex-col overflow-hidden relative">
                                    <div className="flex-1 p-5 overflow-y-auto">
                                        {currentQ && (
                                            <div className="space-y-4">
                                                {/* AI Suggestion Bubble (If present) */}
                                                {liveSuggestions.length > 0 && isLiveMode && (
                                                    <div className="p-3 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center gap-3 animate-pulse">
                                                        <Sparkles className="w-4 h-4 text-violet-400" />
                                                        <p className="text-[10px] text-violet-300 font-medium">Gözlemci Önerisi: {liveSuggestions[liveSuggestions.length - 1]}</p>
                                                    </div>
                                                )}

                                                {/* Question Card */}
                                                <div className={`p-5 rounded-2xl border ${currentQ.isFollowUp ? 'bg-violet-500/5 border-violet-500/20' : 'bg-white/[0.03] border-electric/20'}`}>
                                                    <div className="flex items-start gap-3 mb-3">
                                                        <span className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shadow-lg ${currentQ.isFollowUp ? 'bg-violet-500 text-text-primary shadow-violet-500/20' : 'bg-electric text-text-primary shadow-electric/20'}`}>
                                                            Q{activeIdx + 1}
                                                        </span>
                                                        <div className="flex-1">
                                                            <p className="text-sm text-text-primary font-semibold leading-relaxed">{currentQ.question}</p>
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
                                                    <div className="relative">
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
                                                            placeholder={isLiveMode ? "Shadow Observer dinliyor... Konuşmalar buraya dökülecek." : "Adayın cevabını buraya not alın..."}
                                                            className={`w-full h-32 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-text-primary placeholder-navy-600 outline-none focus:border-electric/50 transition-all resize-none ${isLiveMode ? 'border-red-500/20 ring-1 ring-red-500/10' : ''}`}
                                                        />
                                                        {isLiveMode && (
                                                            <div className="absolute top-2 right-2 px-2 py-1 rounded bg-red-500/20 border border-red-500/30 flex items-center gap-1 animate-pulse">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                                                <span className="text-[8px] font-black text-red-400 uppercase tracking-widest">Live Capture</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {currentQ.evaluationHint && (
                                                        <p className="text-[9px] text-navy-500 mt-2 italic flex items-center gap-1">
                                                            <Sparkles className="w-2.5 h-2.5" /> {currentQ.evaluationHint}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* COMPETENCY MODES SECTION */}
                                                <div className="space-y-3 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="text-[10px] font-black text-navy-400 uppercase tracking-widest">Yetkinlik Odaklı Soru Sor</h4>
                                                        <Sparkles className="w-3 h-3 text-electric animate-pulse" />
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        {COMPETENCY_MODES.map(mode => (
                                                            <button
                                                                key={mode.id}
                                                                disabled={isLoading}
                                                                onClick={() => handleNewQuestion(mode)}
                                                                className={`flex items-center gap-2 p-2 rounded-xl border border-white/5 hover:border-${mode.color}/30 bg-white/[0.02] hover:bg-${mode.color}/5 transition-all text-left disabled:opacity-30 group relative overflow-hidden`}
                                                            >
                                                                <div className={`w-7 h-7 rounded-lg bg-${mode.color}/10 flex items-center justify-center shrink-0`}>
                                                                    <mode.icon className={`w-3.5 h-3.5 text-${mode.color}`} />
                                                                </div>
                                                                <span className="text-[10px] font-bold text-navy-300 group-hover:text-text-primary truncate transition-colors">{mode.label}</span>
                                                                {isLoading && loadingAction === `cat-${mode.id}` && (
                                                                    <div className="absolute inset-0 bg-navy-900/80 flex items-center justify-center">
                                                                        <Loader2 className="w-3.5 h-3.5 text-text-primary animate-spin" />
                                                                    </div>
                                                                )}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Actions */}
                                                <div className="grid grid-cols-3 gap-3">
                                                    <button onClick={handleDeepen} disabled={isLoading || !currentQ.answer?.trim()}
                                                        className="py-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 text-[11px] font-bold transition-all disabled:opacity-30 flex flex-col items-center gap-1.5">
                                                        {isLoading && loadingAction === 'deepen' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDown className="w-4 h-4" />}
                                                        Derinleş
                                                    </button>
                                                    <button onClick={() => handleNewQuestion()} disabled={isLoading}
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

                                {/* Shadow Observer Panel (Conditional) */}
                                {isLiveMode && (
                                    <LiveObserverPanel
                                        candidate={candidate}
                                        isActive={!isEvaluating && phase === 'interview'}
                                        onTranscriptUpdate={(text) => {
                                            setCurrentAnswer(prev => prev ? prev + ' ' + text : text);
                                            setConversation(prev => {
                                                const u = [...prev];
                                                u[activeIdx] = { ...u[activeIdx], answer: (u[activeIdx].answer ? u[activeIdx].answer + ' ' + text : text) };
                                                return u;
                                            });
                                        }}
                                        onAiSuggest={(suggest) => setLiveSuggestions(prev => [...prev.slice(-2), suggest])}
                                        onLogicUpdate={(data) => {
                                            setStarScores(data.scores);
                                            setLogicIntegrity(data.integrity);
                                        }}
                                    />
                                )}
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
                                    <div className="text-5xl font-black text-text-primary mb-1">{aiResult.overallScore}<span className="text-lg text-navy-400">/100</span></div>
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

                                {/* STAR Logic Breakdown (From Shadow Observer) */}
                                {isLiveMode && (
                                    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05] space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-[10px] font-bold text-navy-400 uppercase tracking-widest flex items-center gap-2">
                                                <ShieldCheck className="w-4 h-4 text-emerald-400" /> STAR Mantık Denetimi (Gemini 2.0)
                                            </h4>
                                            <div className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-black">INTEGRITY: {logicIntegrity}%</div>
                                        </div>
                                        <div className="grid grid-cols-4 gap-3">
                                            {['S', 'T', 'A', 'R'].map(s => {
                                                const score = starScores[s] || 0;
                                                return (
                                                    <div key={s} className="bg-navy-900/50 p-3 rounded-xl border border-white/5 text-center">
                                                        <div className="text-[9px] text-navy-500 font-bold mb-1">{s === 'S' ? 'Situation' : s === 'T' ? 'Task' : s === 'A' ? 'Action' : 'Result'}</div>
                                                        <div className="text-lg font-black text-text-primary">{score}</div>
                                                        <div className="h-1 bg-navy-800 rounded-full mt-2 overflow-hidden">
                                                            <div className={`h-full ${score > 70 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${score}%` }} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Q scores */}
                                <div className="space-y-2">
                                    <h4 className="text-[10px] font-bold text-navy-400 uppercase tracking-wider">Soru Bazlı Özet</h4>
                                    {conversation.filter(c => c.answer?.trim()).map((c, i) => {
                                        const qs = aiResult.questionScores?.find(s => s.questionId === c.id);
                                        const isExpanded = expandedIdx === i;
                                        return (
                                            <div key={i} className={`rounded-xl border transition-all ${isExpanded ? 'bg-white/[0.05] border-white/10 p-4' : 'bg-white/[0.02] border-white/[0.04] p-3 hover:bg-white/[0.04] cursor-pointer'}`}
                                                onClick={() => setExpandedIdx(isExpanded ? null : i)}>
                                                <div className="flex items-center gap-3">
                                                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold ${c.isFollowUp ? 'bg-violet-500/20 text-violet-400' : 'bg-electric/20 text-electric'}`}>{i + 1}</span>
                                                    <p className={`flex-1 text-xs text-navy-300 ${isExpanded ? 'font-bold' : 'truncate'}`}>{c.question}</p>
                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${(qs?.score || 0) >= 70 ? 'bg-emerald-500/20 text-emerald-400' : (qs?.score || 0) >= 40 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>{qs?.score ?? '-'}</span>
                                                    <ChevronRight className={`w-4 h-4 text-navy-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                                </div>

                                                {isExpanded && (
                                                    <div className="mt-4 space-y-3 pt-3 border-t border-white/5 animate-in fade-in slide-in-from-top-2 duration-300">
                                                        <div>
                                                            <div className="text-[9px] font-black text-navy-500 uppercase tracking-widest mb-1.5">Adayın Yanıtı</div>
                                                            <p className="text-xs text-text-primary leading-relaxed bg-black/20 p-3 rounded-lg border border-white/5">{c.answer}</p>
                                                        </div>
                                                        {qs?.feedback && (
                                                            <div>
                                                                <div className="text-[9px] font-black text-electric/60 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                                                    <Sparkles className="w-2.5 h-2.5" /> AI Değerlendirmesi
                                                                </div>
                                                                <p className="text-[11px] text-navy-300 italic leading-relaxed pl-3 border-l-2 border-electric/30">{qs.feedback}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
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
                                        <span className="text-2xl font-black text-text-primary w-16 text-right">{finalScore}</span>
                                    </div>
                                    <textarea value={interviewerNotes} onChange={(e) => setInterviewerNotes(e.target.value)}
                                        placeholder="Mülakatçı notları (isteğe bağlı)..."
                                        className="w-full h-20 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-text-primary placeholder-navy-600 outline-none focus:border-amber-500/50 resize-none" />
                                </div>

                                {/* Actions */}
                                <div className="flex gap-3">
                                    <button onClick={handlePrint} className="px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-navy-300 hover:text-text-primary transition-all text-sm flex items-center gap-2">
                                        <Printer className="w-4 h-4" /> PDF
                                    </button>
                                    <button onClick={handleSaveSession} disabled={saving}
                                        className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-text-primary font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2">
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Mülakat Kaydını Kaydet</>}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

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
