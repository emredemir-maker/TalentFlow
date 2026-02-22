// src/components/InterviewGenerator.jsx
// Otonom Mülakat Koçu (Agentic v2.0)
import { useState, useEffect } from 'react';
import { MessageSquare, RefreshCw, Copy, Sparkles, Loader2, GitBranch, Zap } from 'lucide-react';
import { generateInterviewQuestions, generateProbingQuestion } from '../services/geminiService';

export default function InterviewGenerator({ candidate, starAnalysis }) {
    const [questions, setQuestions] = useState([]);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [probingForIdx, setProbingForIdx] = useState(null);
    const [candidateAnswer, setCandidateAnswer] = useState("");
    const [probingResult, setProbingResult] = useState(null);

    useEffect(() => {
        if (!candidate) return;
        setQuestions([]);
        handleRegenerate();
    }, [candidate]);

    const handleRegenerate = async () => {
        if (!candidate) return;
        setIsRegenerating(true);
        try {
            const aiQuestions = await generateInterviewQuestions(candidate, starAnalysis);
            setQuestions(aiQuestions);
        } catch (error) {
            console.error(error);
        } finally {
            setIsRegenerating(false);
        }
    };

    const handleProb = async (idx) => {
        if (!candidateAnswer.trim()) return;
        setProbingForIdx(idx);
        setIsRegenerating(true);
        try {
            const followUp = await generateProbingQuestion(candidate, questions[idx], candidateAnswer);
            setProbingResult({ idx, text: followUp });
            setCandidateAnswer("");
        } catch (error) {
            console.error(error);
        } finally {
            setIsRegenerating(false);
            setProbingForIdx(null);
        }
    };

    return (
        <div className="glass rounded-3xl p-6 border border-white/[0.06] mt-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2 opacity-20 pointer-events-none">
                <GitBranch className="w-12 h-12 text-electric" />
            </div>

            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Otonom Mülakat Koçu (Agentic)
                </h3>
                <button onClick={handleRegenerate} disabled={isRegenerating} className="p-2 rounded-xl text-navy-400 hover:text-white transition-all">
                    <RefreshCw className={`w-4 h-4 ${isRegenerating ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="space-y-4">
                {questions.map((q, idx) => (
                    <div key={idx} className="space-y-3">
                        <div className="p-4 rounded-2xl bg-navy-900/50 border border-white/[0.04] group hover:border-electric/30 transition-all">
                            <div className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-lg bg-electric text-white flex items-center justify-center text-[10px] font-bold shadow-lg shadow-electric/20 uppercase">Q{idx + 1}</span>
                                <p className="text-sm text-navy-100 font-medium italic">{q}</p>
                            </div>

                            {/* Probing Trigger Area */}
                            <div className="mt-4 pl-9 space-y-3">
                                {probingResult?.idx === idx ? (
                                    <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 animate-in slide-in-from-left-2 transition-all">
                                        <div className="flex items-center gap-2 mb-2 text-[10px] font-bold text-violet-400 uppercase tracking-widest">
                                            <Zap className="w-3 h-3" /> Semantik Derinleşme (AI Probing)
                                        </div>
                                        <p className="text-xs text-navy-200 font-semibold italic">{probingResult.text}</p>
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <input
                                            placeholder="Adayın cevabını özetle & derinleş..."
                                            value={probingForIdx === idx ? candidateAnswer : (probingForIdx === null ? candidateAnswer : "")}
                                            onChange={(e) => {
                                                if (probingForIdx === null || probingForIdx === idx) setCandidateAnswer(e.target.value);
                                            }}
                                            className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-electric/50"
                                        />
                                        <button
                                            onClick={() => handleProb(idx)}
                                            disabled={isRegenerating || !candidateAnswer}
                                            className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[10px] font-bold text-white transition-all disabled:opacity-30"
                                        >
                                            Derinleş
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
