// src/components/LoadingScreen.jsx
// Premium loading screen with branded animation

import Logo from './Logo';

export default function LoadingScreen({ message = 'Yükleniyor...', subtext = '' }) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-8 bg-navy-950 relative overflow-hidden">
            {/* Background ambient glows - High Impact */}
            <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[160px] animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-violet-600/10 rounded-full blur-[160px] animate-pulse delay-700" />

            {/* Branded Neural Logo - Hero Scale */}
            <div className="relative animate-stitch-float">
                <Logo size={120} showText={false} className="drop-shadow-[0_0_50px_rgba(34,211,238,0.3)]" />
            </div>

            {/* Text & Phase Indicator */}
            <div className="text-center relative z-10 space-y-4">
                <div className="flex items-baseline justify-center gap-1">
                    <span className="text-3xl font-black text-white uppercase tracking-tighter">TALENT</span>
                    <span className="text-3xl font-black stitch-text-gradient uppercase tracking-tighter italic">FLOW</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                    <p className="text-xs font-black text-text-muted uppercase tracking-[0.4em] opacity-60 animate-pulse">
                        SİSTEM BAŞLATILIYOR
                    </p>
                    <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest italic opacity-80">
                        {message}
                    </p>
                </div>
            </div>

            {/* Neural Progress track */}
            <div className="mt-8 w-64 h-1.5 bg-navy-900 rounded-full overflow-hidden relative border border-border-subtle shadow-inner">
                <div className="absolute top-0 left-0 h-full w-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 animate-[loading-shimmer_2s_infinite] shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
            </div>

            <div className="absolute bottom-12 text-[9px] font-black text-text-muted uppercase tracking-[0.3em] opacity-30">
                NEURAL ENGINE v2.4.0 • SECURE ACCESS
            </div>
        </div>
    );
}
