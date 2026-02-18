// src/components/StatCard.jsx
// Animated stat card with icon and subtle glow

export default function StatCard({ icon: Icon, iconColor = 'text-electric', bgColor = 'bg-electric/10', value, label, trend }) {
    return (
        <div className="glass rounded-2xl p-5 hover:bg-white/[0.04] transition-all duration-300 group">
            <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl ${bgColor} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${iconColor}`} />
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
            <div className="text-2xl font-extrabold text-white tracking-tight mb-0.5">
                {value}
            </div>
            <div className="text-[12px] text-navy-400 font-medium">
                {label}
            </div>
        </div>
    );
}
