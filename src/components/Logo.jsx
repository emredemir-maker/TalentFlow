// src/components/Logo.jsx
import React from 'react';

/**
 * TalentFlow - Neural Brain Identity
 * Based on the High-Tech Neural Network & Circuit Design.
 * Features a glowing neural brain with 'TF' center and circuit nodes.
 */
export default function Logo({ size = 40, showText = true, className = "" }) {
    return (
        <div className={`flex flex-col items-center justify-center gap-2 ${className}`}>
            <div
                className="relative shrink-0"
                style={{ width: size, height: size }}
            >
                {/* SVG Mark: Neural TF Brain */}
                <svg
                    viewBox="0 0 100 100"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-full h-full drop-shadow-[0_0_20px_rgba(34,211,238,0.4)]"
                >
                    <defs>
                        <linearGradient id="neural-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#22d3ee" /> {/* Cyan */}
                            <stop offset="60%" stopColor="#3b82f6" /> {/* Blue */}
                            <stop offset="100%" stopColor="#8b5cf6" /> {/* Purple */}
                        </linearGradient>

                        <filter id="brain-glow" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="2" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>
                    </defs>

                    {/* Brain Outline */}
                    <path
                        d="M50,85 C35,85 20,75 15,60 C10,45 20,30 35,25 C30,15 45,5 60,10 C75,5 90,15 85,30 C95,35 95,55 85,65 C90,80 75,90 60,85"
                        stroke="url(#neural-gradient)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        className="opacity-40"
                    />

                    {/* Circuit Lines */}
                    <path d="M25,50 Q30,40 40,35" stroke="url(#neural-gradient)" strokeWidth="1" strokeDasharray="2 2" />
                    <path d="M75,50 Q70,40 60,35" stroke="url(#neural-gradient)" strokeWidth="1" strokeDasharray="2 2" />

                    {/* The "TF" Mark */}
                    <g filter="url(#brain-glow)">
                        <path
                            d="M35,38 L52,38 M43.5,38 L43.5,65"
                            stroke="url(#neural-gradient)"
                            strokeWidth="8"
                            strokeLinecap="round"
                        />
                        <path
                            d="M58,38 L75,38 M58,51 L70,51 M58,38 L58,65"
                            stroke="url(#neural-gradient)"
                            strokeWidth="8"
                            strokeLinecap="round"
                        />
                    </g>

                    {/* Inner brain detail nodes */}
                    <circle cx="50" cy="45" r="1.5" fill="white" className="animate-pulse" />
                </svg>
            </div>

            {showText && (
                <div className="flex flex-col items-center select-none space-y-1">
                    <span className="text-[10px] font-black tracking-[0.2em] text-text-primary uppercase leading-none drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]">
                        TALENT
                    </span>
                    <span className="text-[12px] font-black tracking-[0.25em] bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-violet-500 uppercase leading-none italic">
                        FLOW
                    </span>
                    <div className="h-[1px] w-8 bg-gradient-to-r from-cyan-400/50 via-blue-500/50 to-violet-500/50 rounded-full mt-1" />
                </div>
            )}
        </div>
    );
}
