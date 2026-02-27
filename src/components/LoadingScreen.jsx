// src/components/LoadingScreen.jsx
// Premium loading screen with branded animation

import { Zap } from 'lucide-react';

export default function LoadingScreen({ message = 'Yükleniyor...', subtext = '' }) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-navy-900">
            {/* Animated logo */}
            <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-electric to-cyan-accent flex items-center justify-center shadow-[0_0_40px_rgba(59,130,246,0.3)] animate-pulse">
                    <Zap className="w-8 h-8 text-text-primary" />
                </div>
                <div className="absolute inset-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-electric to-cyan-accent opacity-30 blur-xl" />
            </div>

            {/* Spinner */}
            <div className="w-10 h-10 border-[3px] border-navy-800 border-t-electric rounded-full animate-spin" />

            {/* Text */}
            <div className="text-center">
                <div className="text-sm font-medium text-navy-300">{message}</div>
                {subtext && <div className="text-xs text-navy-500 mt-1">{subtext}</div>}
            </div>
        </div>
    );
}
