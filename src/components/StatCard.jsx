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
                    : 'bg-navy-800/10 hover:bg-navy-800/20 border border-border-subtle hover:border-navy-400/20 shadow-lg'
                }
            `}
        >
            <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-[50px] transition-opacity duration-500 -z-10 ${isActive ? 'bg-electric/20 opacity-100' : 'bg-navy-700/5 opacity-0 group-hover:opacity-100'}`} />
            <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl ${isActive ? 'bg-electric/20 text-electric-light' : bgColor} flex items-center justify-center transition-all`}>
                    <Icon className={`w-5 h-5 ${isActive ? 'text-electric-light' : iconColor}`} />
                </div>
                {trend && (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${trend > 0
                        ? 'text-emerald-500 bg-emerald-500/10'
                        : 'text-red-500 bg-red-500/10'
                        }`}>
                        {trend > 0 ? '+' : ''}{trend}%
                    </span>
                )}
            </div>
            <div className={`text-3xl font-black tracking-tight mb-1 transition-colors ${isActive ? 'text-text-primary' : 'text-text-primary'}`}>
                {value}
            </div>
            <div className={`text-xs font-bold uppercase tracking-wider transition-colors ${isActive ? 'text-electric-light' : 'text-text-muted'}`}>
                {label}
            </div>
        </div>
    );
}
