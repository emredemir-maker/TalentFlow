// src/components/StatCard.jsx
// Animated stat card with icon, subtle glow, and click-to-filter

export default function StatCard({ icon: Icon, iconColor = 'text-electric', bgColor = 'bg-electric/10', value, label, trend, onClick, isActive = false }) {
    return (
        <div
            onClick={onClick}
            className={`relative rounded-2xl p-3 overflow-hidden transition-all duration-500 group
                ${onClick ? 'cursor-pointer hover:-translate-y-1' : ''}
                ${isActive
                    ? 'bg-gradient-to-br from-electric/20 to-electric/5 border border-electric/40 shadow-[0_0_20px_rgba(59,130,246,0.15)] scale-[1.01]'
                    : 'bg-navy-800/10 hover:bg-navy-800/20 border border-border-subtle hover:border-navy-400/20 shadow-md'
                }
            `}
        >
            <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-[40px] transition-opacity duration-500 -z-10 ${isActive ? 'bg-electric/20 opacity-100' : 'bg-navy-700/5 opacity-0 group-hover:opacity-100'}`} />
            <div className="flex items-center justify-between mb-2">
                <div className={`w-8 h-8 rounded-lg ${isActive ? 'bg-electric/20 text-electric-light' : bgColor} flex items-center justify-center transition-all`}>
                    <Icon className={`w-4 h-4 ${isActive ? 'text-electric-light' : iconColor}`} />
                </div>
                {trend && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${trend > 0
                        ? 'text-emerald-500 bg-emerald-500/10'
                        : 'text-red-500 bg-red-500/10'
                        }`}>
                        {trend > 0 ? '+' : ''}{trend}%
                    </span>
                )}
            </div>
            <div className="text-xl font-black tracking-tight mb-0 transition-colors text-text-primary">
                {value}
            </div>
            <div className={`text-[9px] font-bold uppercase tracking-widest transition-colors ${isActive ? 'text-electric-light' : 'text-text-muted'}`}>
                {label}
            </div>
        </div>
    );
}
