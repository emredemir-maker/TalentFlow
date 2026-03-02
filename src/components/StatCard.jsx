// src/components/StatCard.jsx
// Premium Stitch UI stat card with advanced glass effects and organic hover
import React from 'react';

export default function StatCard({ icon: Icon, iconColor = 'text-cyan-500', bgColor = 'bg-cyan-500/10', value, label, trend, onClick, isActive = false }) {
    return (
        <div
            onClick={onClick}
            className={`stitch-card group relative p-3 h-full flex flex-col justify-between transition-all duration-300
                ${onClick ? 'cursor-pointer hover:bg-bg-secondary/40' : ''}
                ${isActive ? 'border-cyan-500/40 scale-[1.02] shadow-[0_20px_40px_rgba(6,182,212,0.15)] bg-cyan-500/10 dark:bg-cyan-500/20' : 'bg-bg-primary shadow-inner'}
            `}
        >
            {/* Ambient Background Glow */}
            <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full blur-[60px] opacity-20 transition-all duration-700 group-hover:opacity-40 -z-10 
                ${isActive ? 'bg-cyan-500 scale-150' : 'bg-bg-secondary'}`}
            />

            <div className="flex items-start justify-between">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-500
                    ${isActive
                        ? 'bg-cyan-500 text-white rotate-6 scale-110 shadow-[0_0_20px_rgba(6,182,212,0.5)]'
                        : `${bgColor} ${iconColor} group-hover:scale-110 group-hover:-rotate-3`
                    }
                `}>
                    <Icon className="w-4 h-4" />
                </div>

                {trend && (
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black
                        ${trend > 0
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }
                    `}>
                        <span className="flex h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                        {trend > 0 ? '+' : ''}{trend}%
                    </div>
                )}
            </div>

            <div className="mt-3">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted mb-0.5 group-hover:text-text-secondary transition-colors opacity-70">
                    {label}
                </div>
                <div className="text-fluid-xl font-black text-text-primary tracking-tight flex items-baseline gap-1 truncate">
                    {value}
                    <span className="text-[8px] font-black text-text-muted opacity-40 group-hover:text-cyan-500 transition-colors uppercase tracking-widest hidden sm:inline">/ HAVUZ</span>
                </div>
            </div>

            {/* Bottom Accent Line */}
            <div className={`absolute bottom-0 left-0 h-1 transition-all duration-500 rounded-full
                ${isActive ? 'w-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]' : 'w-0 bg-bg-secondary group-hover:w-1/3'}`}
            />
        </div>
    );
}

