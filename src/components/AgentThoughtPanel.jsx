// src/components/AgentThoughtPanel.jsx
// Visualizes the AI Agent's autonomous reasoning process
// Uses Glassmorphism & Pulsing animations for transparency

import { useState, useEffect } from 'react';
import {
    BrainCircuit,
    Search,
    Scale,
    ShieldAlert,
    CheckCircle2,
    ArrowRight,
    Cpu
} from 'lucide-react';

const STEPS = [
    { id: 'extraction', label: 'Veri Ayıklama', icon: Search, desc: 'CV ve LinkedIn verileri yapılandırılıyor...' },
    { id: 'semantic', label: 'Semantik Eşleşme', icon: Scale, desc: 'Yetenekler ve deneyim analizi yapılıyor...' },
    { id: 'risk', label: 'Risk Analizi', icon: ShieldAlert, desc: 'Eksik alanlar (Gap) kontrol ediliyor...' },
    { id: 'decision', label: 'Otonom Karar', icon: CheckCircle2, desc: 'Aksiyon planı oluşturuldu.' },
];

export default function AgentThoughtPanel({ isProcessing, reasoning, decision }) {
    const [currentStep, setCurrentStep] = useState(0);

    // Simulate step progression when processing
    useEffect(() => {
        if (isProcessing) {
            setCurrentStep(0);
            const interval = setInterval(() => {
                setCurrentStep(prev => (prev < STEPS.length - 1 ? prev + 1 : prev));
            }, 1500); // 1.5s per step
            return () => clearInterval(interval);
        } else if (reasoning) {
            setCurrentStep(STEPS.length - 1); // Jump to end if done
        }
    }, [isProcessing, reasoning]);

    if (!isProcessing && !reasoning) return null;

    return (
        <div className="glass rounded-3xl p-6 border border-white/[0.06] relative overflow-hidden animate-in fade-in zoom-in duration-500">
            {/* Background Neural Network Effect */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none" />
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-electric to-transparent opacity-50" />

            {/* Header */}
            <div className="flex items-center gap-3 mb-6 relative z-10">
                <div className={`p-2 rounded-xl bg-electric/10 border border-electric/20 text-electric ${isProcessing ? 'animate-pulse' : ''}`}>
                    <BrainCircuit className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-text-primary">Ajan Düşünce Süreci</h3>
                    <p className="text-xs text-navy-400 font-mono">
                        {isProcessing ? 'Analiz motoru çalışıyor...' : 'Analiz tamamlandı.'}
                    </p>
                </div>
            </div>

            {/* Steps Visualization */}
            <div className="space-y-6 relative z-10">
                {STEPS.map((step, index) => {
                    const status = index < currentStep ? 'completed' : index === currentStep ? 'active' : 'pending';
                    const Icon = step.icon;

                    return (
                        <div key={step.id} className={`flex items-start gap-4 transition-all duration-500 ${status === 'pending' ? 'opacity-30 blur-[1px]' : 'opacity-100'}`}>
                            {/* Connector Line */}
                            {index !== STEPS.length - 1 && (
                                <div className={`absolute left-[19px] top-8 w-[2px] h-10 -z-10 transition-colors duration-500 ${status === 'completed' ? 'bg-electric' : 'bg-navy-800'}`} />
                            )}

                            {/* Icon Bubble */}
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border transition-all duration-500 ${status === 'completed' ? 'bg-electric text-text-primary border-electric shadow-[0_0_15px_rgba(59,130,246,0.5)]' :
                                    status === 'active' ? 'bg-navy-900 text-electric border-electric animate-pulse shadow-[0_0_20px_rgba(59,130,246,0.3)]' :
                                        'bg-navy-950 text-navy-600 border-navy-800'
                                }`}>
                                <Icon className="w-5 h-5" />
                            </div>

                            {/* Text Content */}
                            <div className="pt-1">
                                <h4 className={`text-sm font-bold transition-colors ${status === 'active' ? 'text-electric-light' : 'text-text-primary'}`}>
                                    {step.label}
                                </h4>
                                <p className="text-xs text-navy-400 mt-1 leading-relaxed">
                                    {/* Show final reasoning only at the last step */}
                                    {step.id === 'decision' && !isProcessing && reasoning
                                        ? reasoning
                                        : step.desc}
                                </p>

                                {/* Autonomous Action Badge */}
                                {step.id === 'decision' && !isProcessing && decision && (
                                    <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold animate-in slide-in-from-left-2">
                                        <Cpu className="w-3.5 h-3.5" />
                                        <span>Otonom Karar: {decision}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
