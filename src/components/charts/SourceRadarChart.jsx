// src/components/charts/SourceRadarChart.jsx
import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    ResponsiveContainer,
    Tooltip
} from 'recharts';

const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
        return (
            <div className="glass px-4 py-3 rounded-2xl border border-border-subtle shadow-xl">
                <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">{payload[0].payload.subject}</p>
                <p className="text-xl font-black text-text-primary">{payload[0].value}%</p>
            </div>
        );
    }
    return null;
};

export default function SourceRadarChart({ data, sourceName }) {
    // Expected data format: [{ subject: 'Volume', A: 80 }, { subject: 'Quality', A: 60 }, ...]
    return (
        <div className="w-full h-full min-h-[300px] flex flex-col">
            {sourceName && (
                <div className="text-center mb-2">
                    <span className="text-[10px] font-black text-electric-light bg-electric/10 px-3 py-1 rounded-full uppercase tracking-wider">{sourceName} Stratejik Analizi</span>
                </div>
            )}
            <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
                        <PolarGrid stroke="var(--border-subtle)" />
                        <PolarAngleAxis
                            dataKey="subject"
                            stroke="var(--navy-500)"
                            fontSize={10}
                            fontWeight={800}
                            tick={{ fill: 'var(--text-muted)', dy: 3 }}
                        />
                        <PolarRadiusAxis
                            angle={30}
                            domain={[0, 100]}
                            stroke="none"
                            tick={false}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Radar
                            name="Performans"
                            dataKey="A"
                            stroke="var(--electric)"
                            strokeWidth={3}
                            fill="var(--electric)"
                            fillOpacity={0.3}
                            animationDuration={1500}
                        />
                    </RadarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
