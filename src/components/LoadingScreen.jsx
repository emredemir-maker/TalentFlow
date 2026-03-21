// src/components/LoadingScreen.jsx
import { TIIconMark } from './TalentInnLogo';

export default function LoadingScreen({ message = 'Talent-Inn Başlatılıyor...', subtext = '' }) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-8 bg-[#061228] relative overflow-hidden">
            {/* Background ambient glows */}
            <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[160px] animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-blue-700/10 rounded-full blur-[160px] animate-pulse delay-700" />

            {/* Icon mark — hero scale */}
            <div className="relative animate-stitch-float drop-shadow-[0_0_48px_rgba(6,182,212,0.35)]">
                <TIIconMark size={120} />
            </div>

            {/* Wordmark + status */}
            <div className="text-center relative z-10 space-y-4">
                {/* "Talent-Inn" metallic wordmark */}
                <div className="flex items-baseline justify-center gap-0 leading-none">
                    <span style={{
                        fontFamily: "'Inter', system-ui, sans-serif",
                        fontWeight: 900,
                        fontSize: '30px',
                        letterSpacing: '-0.04em',
                        background: 'linear-gradient(180deg, #C8E8F8 0%, #5BB8E0 40%, #2B7BAA 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                    }}>Talent-</span>
                    <span style={{
                        fontFamily: "'Inter', system-ui, sans-serif",
                        fontWeight: 900,
                        fontSize: '30px',
                        letterSpacing: '-0.04em',
                        background: 'linear-gradient(180deg, #F9E0A0 0%, #D4982A 40%, #8A5E10 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                    }}>Inn</span>
                </div>

                {/* Status lines */}
                <div className="flex flex-col items-center gap-2">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-[0.4em] opacity-60 animate-pulse">
                        SİSTEM BAŞLATILIYOR
                    </p>
                    <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest italic opacity-80">
                        {message}
                    </p>
                </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4 w-64 h-1.5 bg-slate-800 rounded-full overflow-hidden relative border border-slate-700/50 shadow-inner">
                <div className="absolute top-0 left-0 h-full w-full bg-gradient-to-r from-cyan-400 via-blue-500 to-cyan-300 animate-[loading-shimmer_2s_infinite] shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
            </div>

            {/* Footer */}
            <div className="absolute bottom-12 text-[9px] font-black text-slate-600 uppercase tracking-[0.3em]">
                AI ENGINE v2.4.0 • SECURE ACCESS
            </div>
        </div>
    );
}
