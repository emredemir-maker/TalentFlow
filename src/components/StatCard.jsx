// src/components/StatCard.jsx
// Animated stat card with icon, subtle glow, and click-to-filter

export default function StatCard({ icon: Icon, iconColor = 'text-electric', bgColor = 'bg-electric/10', value, label, trend, onClick, isActive = false }) {
    return (
        <div
            onClick={onClick}
            className={`glass rounded-2xl p-5 transition-all duration-300 group
                ${onClick ? 'cursor-pointer' : ''}
                ${isActive
                    ? 'bg-electric/10 border-2 border-electric/40 shadow-[0_0_20px_rgba(59,130,246,0.15)] scale-[1.02]'
                    : 'hover:bg-white/[0.04] border-2 border-transparent'
                }
            `}
        >
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
            <div className={`text-2xl font-extrabold tracking-tight mb-0.5 transition-colors ${isActive ? 'text-electric-light' : 'text-white'}`}>
                {value}
            </div>
            <div className={`text-[12px] font-medium transition-colors ${isActive ? 'text-electric-light/80' : 'text-navy-400'}`}>
                {label}
            </div>
        </div>
    );
}
