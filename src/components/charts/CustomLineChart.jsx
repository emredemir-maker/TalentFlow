// src/components/charts/CustomLineChart.jsx
// Premium line chart with gradient area and floating tooltips
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    AreaChart
} from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-bg-secondary/90 backdrop-blur-xl px-5 py-4 rounded-[1.5rem] border border-border-subtle shadow-2xl animate-scale-in">
                <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] mb-2">{label}</p>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 outline outline-4 outline-cyan-500/5">
                        <span className="text-lg font-black text-cyan-500">{payload[0].value}</span>
                    </div>
                    <div>
                        <p className="text-[11px] font-black text-text-primary uppercase tracking-wider">Aday Başvurusu</p>
                        <p className="text-[9px] text-emerald-500 font-bold tracking-tight">↑ %12 artış</p>
                    </div>
                </div>
            </div>
        );
    }
    return null;
};

export default function CustomLineChart({ data }) {
    return (
        <div className="w-full h-full min-h-[300px] mt-4">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <AreaChart
                    data={data}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                    <defs>
                        <linearGradient id="colorApplications" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="60%" stopColor="#3b82f6" stopOpacity={0.05} />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <filter id="lineShadow" height="200%">
                            <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="blur" />
                            <feOffset in="blur" dx="0" dy="10" result="offsetBlur" />
                            <feFlood floodColor="#3b82f6" floodOpacity="0.4" result="offsetColor" />
                            <feComposite in="offsetColor" in2="offsetBlur" operator="in" result="offsetBlur" />
                            <feMerge>
                                <feMergeNode />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>
                    <CartesianGrid strokeDasharray="6 6" stroke="currentColor" strokeOpacity={0.1} vertical={false} className="text-text-muted/30" />
                    <XAxis
                        dataKey="date"
                        stroke="currentColor"
                        strokeOpacity={0.3}
                        className="text-text-muted font-black"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={15}
                        dy={5}
                    />
                    <YAxis
                        stroke="currentColor"
                        strokeOpacity={0.3}
                        className="text-text-muted font-black"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={15}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(59, 130, 246, 0.2)', strokeWidth: 2, strokeDasharray: '5 5' }} />
                    <Area
                        type="monotone"
                        dataKey="applications"
                        stroke="#3b82f6"
                        strokeWidth={4}
                        fillOpacity={1}
                        fill="url(#colorApplications)"
                        animationDuration={2000}
                        filter="url(#lineShadow)"
                        activeDot={{ r: 8, fill: '#fff', stroke: '#3b82f6', strokeWidth: 4, shadow: '0 0 20px rgba(59,130,246,0.8)' }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
