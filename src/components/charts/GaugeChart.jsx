// src/components/charts/GaugeChart.jsx
// Premium Gauge chart with glow effects and flexible sizing
import { useEffect, useState } from 'react';

export default function GaugeChart({ value, label, size = 200 }) {
    const [percent, setPercent] = useState(0);

    useEffect(() => {
        const timer = setTimeout(() => setPercent(value), 300);
        return () => clearTimeout(timer);
    }, [value]);

    const strokeWidth = size / 10;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * Math.PI; // Half circle
    const offset = circumference - (percent / 100) * circumference;

    let color = '#3b82f6'; // Blue
    if (value >= 85) color = '#10b981'; // Green
    if (value < 50) color = '#ef4444'; // Red
    if (value >= 50 && value < 70) color = '#f59e0b'; // Amber

    return (
        <div className="relative flex flex-col items-center justify-center">
            <svg width={size} height={size / 1.6} viewBox={`0 0 ${size} ${size / 2 + strokeWidth}`}>
                <defs>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                    <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor={color} stopOpacity="0.8" />
                        <stop offset="100%" stopColor={color} />
                    </linearGradient>
                </defs>
                {/* Background Arc */}
                <path
                    d={`M${strokeWidth / 2},${size / 2} a${radius},${radius} 0 0,1 ${size - strokeWidth},0`}
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity={0.1}
                    className="text-border-subtle"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                />
                {/* Foreground Arc */}
                <path
                    d={`M${strokeWidth / 2},${size / 2} a${radius},${radius} 0 0,1 ${size - strokeWidth},0`}
                    fill="none"
                    stroke="url(#gaugeGradient)"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={percent === 0 ? circumference : offset}
                    filter="url(#glow)"
                    style={{
                        transition: 'stroke-dashoffset 2s cubic-bezier(0.34, 1.56, 0.64, 1), stroke 0.5s ease',
                        transformOrigin: 'center'
                    }}
                />
            </svg>

            {/* Value Overlay */}
            <div className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                <div className="flex items-baseline">
                    <span className="text-4xl font-black text-text-primary tracking-tighter" style={{ textShadow: `0 0 20px ${color}40` }}>
                        {percent}
                    </span>
                    <span className="text-sm font-bold text-text-muted ml-0.5">%</span>
                </div>
                {label && (
                    <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] mt-1 opacity-60">
                        {label}
                    </span>
                )}
            </div>

            {/* Indicators */}
            <div className="w-full flex justify-between px-2 text-[10px] font-black text-text-muted opacity-40 mt-[-10px]">
                <span className="flex flex-col items-center">0 <div className="w-px h-1 bg-border-subtle mt-1" /></span>
                <span className="flex flex-col items-center">100 <div className="w-px h-1 bg-border-subtle mt-1" /></span>
            </div>
        </div>
    );
}
