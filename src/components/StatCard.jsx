// src/components/StatCard.jsx
// Animated stat card with icon, subtle glow, and click-to-filter

export default function StatCard({ icon: Icon, iconColor = 'text-electric', bgColor = 'bg-electric/10', value, label, trend, onClick, isActive = false }) {
    return (
        <div
            onClick={onClick}
            className={`relative rounded-3xl p-6 overflow-hidden transition-all duration-500 group
                ${onClick ? 'cursor-pointer hover:-translate-y-1' : ''}
                ${isActive
                    ? 'bg-gradient-to-br from-electric/20 to-electric/5 border border-electric/40 shadow-[0_0_30px_rgba(59,130,246,0.15)] scale-[1.02]'
                    : 'bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.12] shadow-lg shadow-black/10'
                }
            `}
        >
            <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-[50px] transition-opacity duration-500 -z-10 ${isActive ? 'bg-electric/20 opacity-100' : 'bg-white/5 opacity-0 group-hover:opacity-100'}`} />
            <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl ${isActive ? 'bg-electric/20' : bgColor} flex items-center justify-center transition-all`}>
                    <Icon className={`w-5 h-5 ${isActive ? 'text-electric-light' : iconColor}`} />
                </div>
                {trend && (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${trend > 0
                        ? 'text-emerald-400 bg-emerald-500/10'
                        : 'text-red-400 bg-red-500/10'
                        }`}>
                        {trend > 0 ? '+' : ''}{trend}%
                    </span>
                )}
            </div>
            <div className={`text-3xl font-black tracking-tight mb-1 transition-colors ${isActive ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]' : 'text-white'}`}>
                {value}
            </div>
            <div className={`text-xs font-bold uppercase tracking-wider transition-colors ${isActive ? 'text-electric-light' : 'text-navy-400'}`}>
                {label}
            </div>
        </div>
    );
}
