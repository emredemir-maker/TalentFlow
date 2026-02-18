// src/components/InterviewGenerator.jsx
// Generates autonomous interview questions based on STAR analysis gaps

import { useState } from 'react';
import { MessageSquare, RefreshCw, Copy, Sparkles } from 'lucide-react';

export default function InterviewGenerator({ candidateName, starAnalysis }) {
    // In a real app, this would be an API call to Gemini
    // Simulating generated questions based on weak STAR areas
    const generateQuestions = () => {
        const scores = starAnalysis || { Situation: 8, Task: 9, Action: 7, Result: 6 };
        const questions = [];

        if (scores.Situation < 7) {
            questions.push(`"${candidateName}, bahsettiğin projede karşılaştığın ana zorluğun bağlamını biraz daha açabilir misin? Kriz anındaki dış faktörler nelerdi?"`);
        }
        if (scores.Task < 7) {
            questions.push(`"Bu projede tam olarak senin üstlendiğin kişisel sorumluluk neydi? Takımın hedefi ile kendi hedefin arasındaki farkı nasıl tanımlarsın?"`);
        }
        if (scores.Action < 7) {
            questions.push(`"Bu sorunu çözerken hangi spesifik teknik kararları aldın? Neden alternatif B yerine A yöntemini seçtin?"`);
        }
        if (scores.Result < 7) {
            questions.push(`"Bu çalışmanın sonucunu ölçülebilir bir veriyle (KPI, % artış) destekleyebilir misin? Şirkete maddi veya zamansal etkisi ne oldu?"`);
        }

        // Add generic probing question if all scores are high or few questions generated
        if (questions.length < 3) {
            questions.push(`"Geriye dönüp baktığında, bu süreçte neleri farklı yapardın?"`);
            if (questions.length < 3) {
                questions.push(`"Bu deneyim sana profesyonel anlamda ne öğretti?"`);
            }
        }

        return questions.slice(0, 3);
    };

    const [questions, setQuestions] = useState(generateQuestions());
    const [isRegenerating, setIsRegenerating] = useState(false);

    const handleRegenerate = () => {
        setIsRegenerating(true);
        // Simulate API delay
        setTimeout(() => {
            setQuestions(generateQuestions().sort(() => 0.5 - Math.random()));
            setIsRegenerating(false);
        }, 1000);
    };

    const handleCopy = (text) => {
        navigator.clipboard.writeText(text);
        // Add toast notification logic here
    };

    return (
        <div className="glass rounded-3xl p-6 border border-white/[0.06] mt-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Otonom Mülakat Koçu
                </h3>
                <button
                    onClick={handleRegenerate}
                    disabled={isRegenerating}
                    className="p-2 rounded-xl hover:bg-white/[0.06] text-navy-400 hover:text-white transition-all disabled:opacity-50"
                    title="Soruları Yenile"
                >
                    <RefreshCw className={`w-4 h-4 ${isRegenerating ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <p className="text-xs text-navy-400 mb-4">
                Yapay zeka, adayın STAR analizindeki zayıf yönlerini (özellikle <span className="text-white font-medium">Result</span> ve <span className="text-white font-medium">Action</span>) tespit etti ve derinlemesine sorgulama için şu takip sorularını üretti:
            </p>

            <div className="space-y-3">
                {questions.map((q, idx) => (
                    <div key={idx} className="group relative p-3 rounded-xl bg-navy-900/50 border border-white/[0.04] hover:border-electric/30 transition-all">
                        <div className="flex gap-3">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-electric/10 text-electric flex items-center justify-center text-[10px] font-bold">
                                {idx + 1}
                            </span>
                            <p className="text-sm text-navy-200 italic leading-relaxed pr-6">
                                {q}
                            </p>
                        </div>
                        <button
                            onClick={() => handleCopy(q)}
                            className="absolute top-2 right-2 p-1.5 rounded-lg text-navy-500 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all"
                            title="Kopyala"
                        >
                            <Copy className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
