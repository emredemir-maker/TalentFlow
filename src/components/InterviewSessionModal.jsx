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
            <div className="absolute inset-0 bg-bg-primary/60 backdrop-blur-md" onClick={onClose} />
            <div className={`relative w-full transition-all duration-500 ease-in-out h-[90vh] bg-bg-primary stitch-glass rounded-[2.5rem] border border-border-subtle shadow-2xl overflow-hidden flex flex-col tech-grid ${isLiveMode ? 'max-w-7xl' : 'max-w-5xl'}`}>
                <div className="absolute inset-0 bg-gradient-to-br from-electric/5 via-transparent to-violet-500/5 pointer-events-none" />

                {/* Header */}
                <div className="shrink-0 p-5 border-b border-border-subtle flex items-center justify-between bg-bg-secondary/40 backdrop-blur-sm">
                    <div className="flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-2xl ${typeInfo ? `bg-bg-secondary border border-border-subtle` : 'bg-bg-secondary border border-border-subtle'} flex items-center justify-center shadow-lg shadow-black/5`}>
                            {typeInfo?.icon ? <typeInfo.icon className={`w-5 h-5 text-cyan-500`} /> : <MessageSquare className="w-5 h-5 text-cyan-500" />}
                        </div>
                        <div>
                            <h2 className="text-xs font-black text-text-primary tracking-[0.2em] uppercase opacity-90 drop-shadow-sm">
                                {phase === 'type-select' ? 'MÜLAKAT KURULUMU' : phase === 'paths' ? 'ROTA KONFİGÜRASYONU' : phase === 'scoring' ? 'ANALİZ EDİLİYOR...' : phase === 'review' ? 'DEĞERLENDİRME RAPORU' : `MÜLAKAT: ${typeInfo?.label}`}
                            </h2>
                            <div className="flex items-center gap-2 mt-1">
                                <p className="text-[10px] text-text-muted font-bold uppercase tracking-tight">
                                    {candidate?.name} • {candidate?.matchedPositionTitle || candidate?.position}
                                </p>
                                {selectedPath && (
                                    <>
                                        <span className="w-1 h-1 rounded-full bg-text-muted opacity-30" />
                                        <span className="text-[10px] text-electric font-black uppercase tracking-widest">{selectedPath.title}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {phase === 'interview' && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsLiveMode(!isLiveMode)}
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all border shadow-sm ${isLiveMode ? 'bg-red-500/10 border-red-500/30 text-red-500 animate-pulse' : 'bg-bg-secondary border-border-subtle text-text-muted hover:text-text-primary hover:bg-bg-secondary/80'}`}
                                >
                                    {isLiveMode ? '● OBSERVER ACTIVE' : 'OBSERVER OFF'}
                                </button>
                                <span className="text-[10px] font-black text-text-muted bg-bg-secondary px-4 py-2 rounded-xl border border-border-subtle">
                                    {answeredCount} / {conversation.length} CEVAP
                                </span>
                            </div>
                        )}
                        <button onClick={onClose} className="p-2.5 rounded-xl hover:bg-bg-secondary transition-all text-text-muted hover:text-text-primary border border-transparent hover:border-border-subtle">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex overflow-hidden min-h-0">
                    {/* Left: Interview Area */}
                    <div className={`flex-1 overflow-y-auto transition-all duration-500 custom-scrollbar ${isLiveMode ? 'border-r border-border-subtle' : ''}`}>

                        {/* ====== PHASE: TYPE SELECT ====== */}
                        {phase === 'type-select' && (
                            <div className="p-8 space-y-6 max-w-2xl mx-auto">
                                <div className="space-y-2">
                                    <p className="text-base text-text-secondary font-medium">Mülakatın türünü seçin.</p>
                                    <p className="text-xs text-text-muted leading-relaxed">AI, adayın CV'sine ve seçilen pozisyona göre farklı başlangıç rotaları ve yetkinlik odaklı sorular hazırlayacaktır.</p>
                                </div>
                                <div className="space-y-3">
                                    {INTERVIEW_TYPES.map(type => (
                                        <button key={type.id} onClick={() => handleSelectType(type.id)}
                                            className="w-full p-6 rounded-[2rem] bg-bg-secondary border border-border-subtle hover:border-cyan-400/40 hover:bg-bg-secondary/80 transition-all text-left group flex items-center gap-5 shadow-sm">
                                            <div className={`w-14 h-14 rounded-2xl bg-${type.color}/10 border border-${type.color}/20 flex items-center justify-center group-hover:scale-110 transition-all duration-500 shadow-inner`}>
                                                <type.icon className={`w-7 h-7 text-${type.color}`} />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="text-sm font-black text-text-primary mb-1 uppercase tracking-tight">{type.label}</h3>
                                                <p className="text-xs text-text-muted leading-relaxed">{type.desc}</p>
                                            </div>
                                            <div className="w-10 h-10 rounded-xl bg-bg-primary flex items-center justify-center text-text-muted group-hover:text-cyan-400 group-hover:bg-cyan-500/10 transition-all">
                                                <ChevronRight className="w-5 h-5" />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ====== PHASE: PATH SELECT ====== */}
                        {phase === 'paths' && (
                            <div className="p-8 max-w-3xl mx-auto">
                                {isLoading ? (
                                    <div className="flex flex-col items-center justify-center py-20 gap-6">
                                        <div className="relative">
                                            <Loader2 className="w-12 h-12 text-electric animate-spin opacity-40" />
                                            <Sparkles className="w-6 h-6 text-electric absolute inset-0 m-auto animate-pulse" />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-base text-text-primary font-black uppercase tracking-widest">Rota Konfigürasyonu</p>
                                            <p className="text-xs text-text-muted mt-2">AI, adayın CV'sine özel mülakat rotaları hazırlıyor...</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <p className="text-base text-text-secondary font-medium">Mülakatın başlangıç rotasını seçin.</p>
                                            <p className="text-xs text-text-muted">Her rota farklı bir perspektiften başlar. Seçtiğiniz rotaya göre başlangıç soruları belirlenir.</p>
                                        </div>
                                        <div className="space-y-4">
                                            {paths.map((path, pi) => {
                                                const PathIcon = PATH_ICON_MAP[path.icon] || Target;
                                                const colors = ['cyan-500', 'emerald-500', 'violet-500'];
                                                const c = colors[pi % colors.length];
                                                return (
                                                    <button key={path.id || pi} onClick={() => handleSelectPath(path)}
                                                        className="w-full p-6 rounded-[2rem] bg-bg-secondary border border-border-subtle hover:border-cyan-400/40 hover:bg-bg-secondary/80 transition-all text-left group shadow-sm relative overflow-hidden">
                                                        <div className="flex items-start gap-5 relative z-10">
                                                            <div className={`w-12 h-12 rounded-2xl bg-${c}/10 border border-${c}/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-all duration-500`}>
                                                                <PathIcon className={`w-6 h-6 text-${c}`} />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <h3 className="text-sm font-black text-text-primary uppercase tracking-tight">{path.title}</h3>
                                                                    <ChevronRight className="w-5 h-5 text-text-muted group-hover:text-electric transition-colors" />
                                                                </div>
                                                                <p className="text-xs text-text-muted mb-5 leading-relaxed">{path.description}</p>
                                                                <div className="grid grid-cols-1 gap-2.5">
                                                                    {path.questions?.map((q, qi) => (
                                                                        <div key={qi} className="flex items-start gap-3 p-3.5 rounded-2xl bg-bg-primary/40 border border-border-subtle/30 shadow-inner group-hover:border-border-subtle transition-all">
                                                                            <span className={`shrink-0 w-6 h-6 rounded-lg text-[10px] font-black flex items-center justify-center bg-${c}/10 text-${c} border border-${c}/20`}>
                                                                                {qi + 1}
                                                                            </span>
                                                                            <p className="text-[11px] text-text-secondary leading-relaxed font-black">{q.question}</p>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ====== PHASE: INTERVIEW ====== */}
                        {phase === 'interview' && (
                            <div className="flex h-full w-full overflow-hidden">
                                {/* Q Navigator */}
                                <div className="w-16 shrink-0 border-r border-border-subtle py-6 flex flex-col items-center gap-2 overflow-y-auto bg-bg-secondary/40">
                                    {conversation.map((c, i) => (
                                        <button key={i}
                                            onClick={() => { saveCurrentAnswer(); setActiveIdx(i); setCurrentAnswer(conversation[i]?.answer || ''); }}
                                            className={`w-10 h-10 rounded-xl text-[11px] font-black transition-all relative flex items-center justify-center shadow-sm ${activeIdx === i ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20 scale-110 z-10'
                                                : c.answer?.trim() ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                                    : 'bg-bg-secondary text-text-muted hover:bg-bg-secondary/80 border border-transparent hover:border-border-subtle'
                                                }`}
                                            title={c.question?.substring(0, 60) || ''}
                                        >
                                            {i + 1}
                                            {c.isFollowUp && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-violet-600 border-2 border-bg-primary flex items-center justify-center shadow-sm"><GitBranch className="w-2 h-2 text-white" /></span>}
                                        </button>
                                    ))}
                                    {isLoading && (loadingAction === 'deepen' || loadingAction === 'new') && (
                                        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                                            <Loader2 className="w-3 h-3 text-cyan-500 animate-spin" />
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
                                                        <p className="text-[10px] text-violet-500 font-black">Gözlemci Önerisi: {liveSuggestions[liveSuggestions.length - 1]}</p>
                                                    </div>
                                                )}

                                                {/* Question Card */}
                                                <div className={`p-8 rounded-[2.5rem] border shadow-xl relative overflow-hidden ${currentQ.isFollowUp ? 'bg-violet-500/5 border-violet-500/20' : 'bg-bg-secondary border-border-subtle'}`}>
                                                    <div className="flex items-start gap-5 mb-5">
                                                        <div className={`shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black shadow-lg ${currentQ.isFollowUp ? 'bg-violet-600 text-white shadow-violet-500/20' : 'bg-cyan-500 text-white shadow-cyan-500/20'}`}>
                                                            Q{activeIdx + 1}
                                                        </div>
                                                        <div className="flex-1">
                                                            <p className="text-base text-text-primary font-black leading-relaxed">{currentQ.question}</p>
                                                            <div className="flex items-center gap-3 mt-3">
                                                                <span className="text-[10px] text-text-muted font-black border border-border-subtle bg-bg-primary/40 px-3 py-1 rounded-xl uppercase tracking-widest">{currentQ.category}</span>
                                                                {currentQ.isFollowUp && (
                                                                    <span className="text-[10px] text-violet-600 dark:text-violet-400 bg-violet-500/10 px-3 py-1 rounded-xl flex items-center gap-1.5 font-black uppercase tracking-widest border border-violet-500/20">
                                                                        <GitBranch className="w-3 h-3" /> DERİNLEŞME
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
                                                            className={`w-full h-40 p-5 rounded-3xl bg-bg-primary/60 border border-border-subtle text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-cyan-500/50 transition-all resize-none shadow-inner font-black leading-relaxed ${isLiveMode ? 'border-red-500/30 ring-1 ring-red-500/10 shadow-[0_0_20px_rgba(239,68,68,0.05)]' : ''}`}
                                                        />
                                                        {isLiveMode && (
                                                            <div className="absolute top-2 right-2 px-2 py-1 rounded bg-red-500/20 border border-red-500/30 flex items-center gap-1 animate-pulse">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                                                <span className="text-[8px] font-black text-red-400 uppercase tracking-widest">Live Capture</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {currentQ.evaluationHint && (
                                                        <div className="mt-4 p-4 rounded-2xl bg-cyan-500/5 border border-cyan-500/10 flex items-start gap-3">
                                                            <Sparkles className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" />
                                                            <p className="text-[11px] text-text-muted font-black italic leading-relaxed">
                                                                {currentQ.evaluationHint}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* COMPETENCY MODES SECTION */}
                                                <div className="space-y-4 p-6 rounded-[2rem] bg-bg-secondary border border-border-subtle shadow-lg">
                                                    <div className="flex items-center justify-between px-1">
                                                        <h4 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Yetkinlik Odaklı Soru Sor</h4>
                                                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                                                            <span className="w-1 h-1 rounded-full bg-cyan-500 animate-ping" />
                                                            <span className="text-[9px] font-black text-cyan-500 uppercase tracking-widest">AI Ready</span>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-3">
                                                        {COMPETENCY_MODES.map(mode => (
                                                            <button
                                                                key={mode.id}
                                                                disabled={isLoading}
                                                                onClick={() => handleNewQuestion(mode)}
                                                                className={`flex items-center gap-3 p-4 rounded-2xl border border-border-subtle hover:border-${mode.color}/40 bg-bg-primary/40 hover:bg-${mode.color}/5 transition-all text-left disabled:opacity-30 group relative overflow-hidden shadow-sm`}
                                                            >
                                                                <div className={`w-9 h-9 rounded-xl bg-${mode.color}/10 border border-${mode.color}/20 flex items-center justify-center shrink-0 shadow-inner group-hover:scale-110 transition-transform duration-500`}>
                                                                    <mode.icon className={`w-4 h-4 text-${mode.color}`} />
                                                                </div>
                                                                <span className="text-[10px] font-black text-text-secondary group-hover:text-text-primary truncate transition-colors uppercase tracking-tight">{mode.label}</span>
                                                                {isLoading && loadingAction === `cat-${mode.id}` && (
                                                                    <div className="absolute inset-0 bg-bg-primary/80 backdrop-blur-sm flex items-center justify-center">
                                                                        <Loader2 className="w-4 h-4 text-text-primary animate-spin" />
                                                                    </div>
                                                                )}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Actions */}
                                                <div className="grid grid-cols-3 gap-4">
                                                    <button onClick={handleDeepen} disabled={isLoading || !currentQ.answer?.trim()}
                                                        className="py-5 rounded-[2rem] bg-violet-600/10 border border-violet-500/30 text-violet-600 dark:text-violet-400 hover:bg-violet-600/20 text-[11px] font-black uppercase tracking-[0.15em] transition-all disabled:opacity-30 flex flex-col items-center gap-2.5 shadow-sm group">
                                                        <div className="p-2 rounded-xl bg-violet-500/10 group-hover:translate-y-0.5 transition-transform">
                                                            {isLoading && loadingAction === 'deepen' ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowDown className="w-5 h-5" />}
                                                        </div>
                                                        Derinleş
                                                    </button>
                                                    <button onClick={() => handleNewQuestion()} disabled={isLoading}
                                                        className="py-5 rounded-[2rem] bg-cyan-500/10 border border-cyan-500/30 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20 text-[11px] font-black uppercase tracking-[0.15em] transition-all disabled:opacity-30 flex flex-col items-center gap-2.5 shadow-sm group">
                                                        <div className="p-2 rounded-xl bg-cyan-500/10 group-hover:scale-110 transition-transform">
                                                            {isLoading && loadingAction === 'new' ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlusCircle className="w-5 h-5" />}
                                                        </div>
                                                        Yeni Soru (CV)
                                                    </button>
                                                    <button onClick={handleFinishInterview} disabled={isLoading || answeredCount === 0}
                                                        className="py-5 rounded-[2rem] bg-emerald-600/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600/20 text-[11px] font-black uppercase tracking-[0.15em] transition-all disabled:opacity-30 flex flex-col items-center gap-2.5 shadow-sm group">
                                                        <div className="p-2 rounded-xl bg-emerald-500/10 group-hover:rotate-12 transition-transform">
                                                            <Flag className="w-5 h-5" />
                                                        </div>
                                                        Mülakatı Bitir
                                                    </button>
                                                </div>
                                                <p className="text-[10px] text-text-muted font-bold tracking-widest text-center uppercase opacity-60">Sol panelden önceki sorulara dönüp cevapları revize edebilirsiniz</p>
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
                                    <Loader2 className="w-10 h-10 text-cyan-500 animate-spin" />
                                    <Sparkles className="w-4 h-4 text-amber-400 absolute -top-1 -right-1 animate-pulse" />
                                </div>
                                <p className="text-sm text-text-secondary font-black uppercase tracking-widest">AI, {answeredCount} cevabı analiz edip puanlıyor...</p>
                            </div>
                        )}

                        {/* ====== PHASE: REVIEW ====== */}
                        {phase === 'review' && aiResult && (
                            <div className="p-6 space-y-6">
                                {/* Score */}
                                <div className="p-6 rounded-2xl bg-bg-secondary border border-border-subtle text-center shadow-inner relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl" />
                                    <p className="text-[10px] text-text-muted font-black uppercase tracking-[0.2em] mb-2 relative z-10">AI Genel Mülakat Puanı</p>
                                    <div className="text-5xl font-black text-text-primary mb-1 relative z-10">{aiResult.overallScore}<span className="text-lg text-text-muted">/100</span></div>
                                    <span className={`inline-block px-4 py-1.5 rounded-full text-[10px] font-black mt-2 relative z-10 border ${aiResult.overallScore >= 70 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : aiResult.overallScore >= 40 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'}`}>{aiResult.overallVerdict}</span>
                                    <p className="text-sm text-text-secondary font-bold mt-4 leading-relaxed relative z-10 max-w-xl mx-auto italic">"{aiResult.summary}"</p>
                                </div>

                                {/* Strengths / Weaknesses */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                                        <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-wilder mb-2 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Güçlü Yönler</h4>
                                        {aiResult.strengths?.map((s, i) => <p key={i} className="text-xs text-text-secondary font-black mb-1">• {s}</p>)}
                                    </div>
                                    <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10">
                                        <h4 className="text-[10px] font-black text-red-500 uppercase tracking-wilder mb-2 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Gelişim Alanları</h4>
                                        {aiResult.weaknesses?.map((w, i) => <p key={i} className="text-xs text-text-secondary font-black mb-1">• {w}</p>)}
                                    </div>
                                </div>

                                {/* STAR Logic Breakdown (From Shadow Observer) */}
                                {isLiveMode && (
                                    <div className="p-5 rounded-2xl bg-bg-secondary border border-border-subtle space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-[10px] font-black text-text-muted uppercase tracking-widest flex items-center gap-2">
                                                <ShieldCheck className="w-4 h-4 text-emerald-500" /> STAR Mantık Denetimi (Gemini 2.0)
                                            </h4>
                                            <div className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black border border-emerald-500/20">INTEGRITY: {logicIntegrity}%</div>
                                        </div>
                                        <div className="grid grid-cols-4 gap-3">
                                            {['S', 'T', 'A', 'R'].map(s => {
                                                const score = starScores[s] || 0;
                                                return (
                                                    <div key={s} className="bg-bg-primary/40 p-3 rounded-xl border border-border-subtle text-center">
                                                        <div className="text-[9px] text-text-muted font-black mb-1">{s === 'S' ? 'Situation' : s === 'T' ? 'Task' : s === 'A' ? 'Action' : 'Result'}</div>
                                                        <div className="text-lg font-black text-text-primary">{score}</div>
                                                        <div className="h-1 bg-bg-primary rounded-full mt-2 overflow-hidden border border-border-subtle/10">
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
                                    <h4 className="text-[10px] font-black text-text-muted uppercase tracking-wider">Soru Bazlı Özet</h4>
                                    {conversation.filter(c => c.answer?.trim()).map((c, i) => {
                                        const qs = aiResult.questionScores?.find(s => s.questionId === c.id);
                                        const isExpanded = expandedIdx === i;
                                        return (
                                            <div key={i} className={`rounded-xl border transition-all ${isExpanded ? 'bg-bg-secondary border-border-subtle p-4' : 'bg-bg-secondary/40 border-border-subtle p-3 hover:bg-bg-secondary cursor-pointer'}`}
                                                onClick={() => setExpandedIdx(isExpanded ? null : i)}>
                                                <div className="flex items-center gap-3">
                                                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${c.isFollowUp ? 'bg-violet-500/20 text-violet-500' : 'bg-cyan-500/20 text-cyan-500'}`}>{i + 1}</span>
                                                    <p className={`flex-1 text-xs text-text-secondary font-black ${isExpanded ? '' : 'truncate'}`}>{c.question}</p>
                                                    <span className={`text-xs font-black px-2 py-0.5 rounded ${(qs?.score || 0) >= 70 ? 'bg-emerald-500/20 text-emerald-500' : (qs?.score || 0) >= 40 ? 'bg-amber-500/20 text-amber-500' : 'bg-red-500/20 text-red-500'}`}>{qs?.score ?? '-'}</span>
                                                    <ChevronRight className={`w-4 h-4 text-text-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                                </div>

                                                {isExpanded && (
                                                    <div className="mt-4 space-y-3 pt-3 border-t border-border-subtle animate-in fade-in slide-in-from-top-2 duration-300">
                                                        <div>
                                                            <div className="text-[9px] font-black text-text-muted uppercase tracking-widest mb-1.5">Adayın Yanıtı</div>
                                                            <p className="text-xs text-text-primary leading-relaxed bg-bg-primary p-3 rounded-lg border border-border-subtle">{c.answer}</p>
                                                        </div>
                                                        {qs?.feedback && (
                                                            <div>
                                                                <div className="text-[9px] font-black text-cyan-500/60 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                                                    <Sparkles className="w-2.5 h-2.5" /> AI Değerlendirmesi
                                                                </div>
                                                                <p className="text-[11px] text-text-secondary font-black italic leading-relaxed pl-3 border-l-2 border-cyan-500/30">{qs.feedback}</p>
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
                                    <h4 className="text-xs font-black text-text-muted flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Mülakatçı Son Kararı</h4>
                                    <div className="flex items-center gap-4">
                                        <input type="range" min="0" max="100" value={finalScore} onChange={(e) => setFinalScore(parseInt(e.target.value))}
                                            className="flex-1 h-2 bg-bg-primary rounded-lg appearance-none cursor-pointer accent-amber-500" />
                                        <span className="text-2xl font-black text-text-primary w-16 text-right">{finalScore}</span>
                                    </div>
                                    <textarea value={interviewerNotes} onChange={(e) => setInterviewerNotes(e.target.value)}
                                        placeholder="Mülakatçı notları (isteğe bağlı)..."
                                        className="w-full h-24 p-3 rounded-xl bg-bg-primary border border-border-subtle text-sm text-text-primary placeholder-text-muted focus:border-amber-500/50 resize-none font-black" />
                                </div>

                                {/* Actions */}
                                <div className="flex gap-3">
                                    <button onClick={handlePrint} className="px-4 py-3 rounded-xl bg-bg-secondary border border-border-subtle text-text-muted hover:text-text-primary transition-all text-sm flex items-center gap-2">
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
