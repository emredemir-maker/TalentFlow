// src/components/charts/CustomPieChart.jsx
// High-fidelity Donut chart with interactive legends
import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';

const COLORS = [
    '#3b82f6', // Electric
    '#06b6d4', // Cyan
    '#8b5cf6', // Violet
    '#10b981', // Emerald
    '#f59e0b', // Amber
];

const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
        return (
            <div className="glass px-4 py-3 rounded-2xl border border-white/10 shadow-2xl">
                <p className="text-[10px] font-black text-navy-400 uppercase tracking-widest mb-1">{payload[0].name}</p>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: payload[0].payload.fill }} />
                    <span className="text-sm font-black text-text-primary">{payload[0].value} Aday</span>
                </div>
            </div>
        );
    }
    return null;
};

export default function CustomPieChart({ data }) {
    return (
        <div className="w-full h-full min-h-[220px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart>
                    <defs>
                        {COLORS.map((color, i) => (
                            <filter key={`glow-${i}`} id={`shadow-${i}`}>
                                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                                <feMerge>
                                    <feMergeNode in="coloredBlur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                        ))}
                    </defs>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="45%"
                        innerRadius="65%"
                        outerRadius="85%"
                        paddingAngle={8}
                        dataKey="value"
                        animationDuration={1500}
                        stroke="none"
                    >
                        {data.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={COLORS[index % COLORS.length]}
                                className="focus:outline-none transition-all duration-300 hover:opacity-80"
                                style={{ filter: `url(#shadow-${index % COLORS.length})` }}
                            />
                        ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} cursor={false} />
                    <Legend
                        verticalAlign="bottom"
                        iconType="circle"
                        iconSize={8}
                        formatter={(value) => <span className="text-[10px] font-black text-navy-400 uppercase tracking-tighter hover:text-text-primary transition-colors ml-1">{value}</span>}
                        wrapperStyle={{ bottom: 0 }}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
}
