// src/components/charts/GaugeChart.jsx
// Gauge chart using SVG for Average Match Score visualization

import { useEffect, useState } from 'react';

export default function GaugeChart({ value, label }) {
    const [percent, setPercent] = useState(0);

    // Animation
    useEffect(() => {
        const timer = setTimeout(() => setPercent(value), 300);
        return () => clearTimeout(timer);
    }, [value]);

    const size = 200;
    const strokeWidth = 20;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * Math.PI; // Half circle
    const offset = circumference - (percent / 100) * circumference;

    let color = '#3b82f6'; // Blue
    if (value >= 85) color = '#10b981'; // Green
    if (value < 50) color = '#ef4444'; // Red
    if (value >= 50 && value < 70) color = '#f59e0b'; // Amber

    return (
        <div className="relative flex flex-col items-center justify-center p-4">
            <svg width={size} height={size / 1.5} viewBox={`0 0 ${size} ${size / 2 + strokeWidth}`}>
                {/* Background Arc */}
                <path
                    d={`M${strokeWidth / 2},${size / 2} a${radius},${radius} 0 0,1 ${size - strokeWidth},0`}
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                />
                {/* Foreground Arc */}
                <path
                    d={`M${strokeWidth / 2},${size / 2} a${radius},${radius} 0 0,1 ${size - strokeWidth},0`}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    style={{
                        transition: 'stroke-dashoffset 1.5s ease-out, stroke 0.5s ease',
                        transformOrigin: 'center'
                    }}
                />
            </svg>

            {/* Value Text */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center mt-6">
                <span className="text-4xl font-extrabold text-white block" style={{ textShadow: `0 0 20px ${color}60` }}>
                    {percent}
                </span>
                <span className="text-xs text-navy-400 uppercase tracking-wider font-semibold">
                    {label}
                </span>
            </div>

            {/* Range Labels */}
            <div className="w-full flex justify-between px-6 text-[10px] text-navy-500 font-mono mt-[-20px]">
                <span>0</span>
                <span>100</span>
            </div>
        </div>
    );
}
