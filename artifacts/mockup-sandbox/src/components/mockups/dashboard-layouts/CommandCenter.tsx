import { Users, Zap, Target, TrendingUp, Clock, Star, Activity, ChevronRight, Cpu, Shield, RefreshCw } from "lucide-react";

const mockCandidates = 247;
const mockPositions = 8;
const mockInterviews = 12;
const mockAvgMatch = 91;
const mockTimeSaved = 120;
const mockRoi = "42,500";

const funnelData = [
  { label: "BAŞVURULAR", count: 247, pct: 100, color: "#3B82F6" },
  { label: "AI TARAMA", count: 210, pct: 85, color: "#6366F1" },
  { label: "İNCELEME", count: 173, pct: 70, color: "#8B5CF6" },
  { label: "MÜLAKATLAR", count: 136, pct: 55, color: "#A855F7" },
  { label: "TEKLİFLER", count: 99, pct: 40, color: "#10B981" },
];

const sessions = [
  { name: "Mert Özdemir", role: "Senior Frontend Dev", time: "09:30", date: "BUGÜN", score: 94, status: "live" },
  { name: "Selin Arslan", role: "UX Designer", time: "11:00", date: "BUGÜN", score: 88, status: "scheduled" },
  { name: "Burak Yıldız", role: "Data Scientist", time: "14:30", date: "21 Mar", score: 76, status: "scheduled" },
  { name: "Ceren Kaya", role: "Product Manager", time: "10:00", date: "22 Mar", score: 91, status: "scheduled" },
];

const engines = [
  { label: "Scoring Engine", val: 98, color: "#3B82F6" },
  { label: "Bias Guard", val: 100, color: "#10B981" },
  { label: "Data Sync", val: 82, color: "#F59E0B" },
];

const activeJobs = [
  { title: "Senior Frontend Developer", count: 34, match: 92 },
  { title: "Data Scientist", count: 28, match: 87 },
  { title: "UX Designer", count: 19, match: 95 },
  { title: "DevOps Engineer", count: 23, match: 83 },
];

export function CommandCenter() {
  return (
    <div className="min-h-screen bg-[#070B14] text-white font-['Inter'] overflow-auto">
      {/* Ambient glow background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-600/8 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-0 w-64 h-64 bg-emerald-600/5 rounded-full blur-[80px]" />
      </div>

      <div className="relative z-10 max-w-[1500px] mx-auto px-6 py-5 space-y-5">

        {/* TOP HEADER BAR */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-[10px] font-black text-white">TI</span>
            </div>
            <div>
              <h1 className="text-[18px] font-black tracking-tight text-white">COMMAND CENTER</h1>
              <p className="text-[9px] text-blue-400 font-bold uppercase tracking-[0.25em]">Real-Time Talent Intelligence Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-[10px] text-emerald-400 font-bold">
              <div className="relative w-2 h-2">
                <div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-75" />
                <div className="relative w-2 h-2 bg-emerald-500 rounded-full" />
              </div>
              SYSTEM OPERATIONAL
            </div>
            <div className="h-4 w-px bg-white/10" />
            <div className="text-[10px] text-white/40 font-bold">v1.2.0</div>
          </div>
        </div>

        {/* TOP KPI CARDS */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "TOPLAM ADAY", value: mockCandidates, sub: "+12 bu hafta", icon: Users, color: "blue", accent: "#3B82F6" },
            { label: "AKTİF POZİSYON", value: mockPositions, sub: "8 açık ilan", icon: Target, color: "indigo", accent: "#6366F1" },
            { label: "MÜLAKATLAR", value: mockInterviews, sub: "Bu hafta", icon: Clock, color: "violet", accent: "#8B5CF6" },
            { label: "AI MATCH INDEX", value: `${mockAvgMatch}%`, sub: "+5% bu ay", icon: Star, color: "emerald", accent: "#10B981" },
            { label: "ZAMAN TASARRUFU", value: `${mockTimeSaved}h`, sub: "Son periyot", icon: Zap, color: "amber", accent: "#F59E0B" },
          ].map((kpi, i) => (
            <div key={i} className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 relative overflow-hidden group hover:bg-white/[0.06] transition-all duration-300">
              <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full opacity-10 blur-xl" style={{ background: kpi.accent }} />
              <div className="flex items-start justify-between mb-3">
                <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.2em]">{kpi.label}</span>
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${kpi.accent}20` }}>
                  <kpi.icon className="w-3 h-3" style={{ color: kpi.accent }} />
                </div>
              </div>
              <div className="text-[26px] font-black text-white leading-none mb-1">{kpi.value}</div>
              <div className="text-[9px] font-bold" style={{ color: kpi.accent }}>{kpi.sub}</div>
            </div>
          ))}
        </div>

        {/* MAIN ANALYTICS ROW */}
        <div className="grid grid-cols-12 gap-4">

          {/* FUNNEL — left */}
          <div className="col-span-7 bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                <span className="text-[11px] font-black uppercase tracking-widest">Aday Akış Analizi</span>
              </div>
              <button className="text-[8px] font-black text-blue-400 uppercase tracking-widest hover:text-blue-300">DETAY →</button>
            </div>
            <div className="space-y-3">
              {funnelData.map((f, i) => (
                <div key={i} className="flex items-center gap-4 group">
                  <div className="w-[90px] text-right text-[8px] font-black text-white/40 uppercase tracking-wide">{f.label}</div>
                  <div className="flex-1 h-9 bg-white/[0.03] rounded-xl overflow-hidden relative">
                    <div
                      className="h-full rounded-xl flex items-center px-4 transition-all duration-1000"
                      style={{ width: `${f.pct}%`, background: `${f.color}22`, borderLeft: `2px solid ${f.color}` }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full mr-2" style={{ background: f.color }} />
                    </div>
                  </div>
                  <div className="w-10 text-right text-[14px] font-black text-white tabular-nums">{f.count}</div>
                </div>
              ))}
            </div>
          </div>

          {/* PERFORMANCE INTEL — right */}
          <div className="col-span-5 bg-gradient-to-br from-blue-600/20 to-indigo-900/40 border border-blue-500/20 rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute -top-8 -right-8 w-40 h-40 bg-blue-500/10 rounded-full blur-2xl" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-3.5 h-3.5 text-blue-300 fill-blue-300" />
                <span className="text-[8px] font-black text-blue-300 uppercase tracking-[0.25em]">Stratejik Görüntüleme</span>
              </div>
              <h2 className="text-[18px] font-black text-white leading-tight uppercase italic mb-3">Operasyonel<br />Verimlilik</h2>
              <p className="text-[11px] text-blue-100/70 leading-relaxed font-semibold mb-6">
                AI sistemimiz son periyotta <span className="text-white font-black">{mockTimeSaved} saatlik</span> manuel yükü asiste ederek işe alım maliyetlerini minimize etti.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-sm">
                  <div className="text-[8px] font-black text-blue-200/50 uppercase tracking-widest mb-1">ÜRETİLEN ROI</div>
                  <div className="text-[20px] font-black text-white">${mockRoi}</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-sm">
                  <div className="text-[8px] font-black text-blue-200/50 uppercase tracking-widest mb-1">ZAMAN TASARRUFU</div>
                  <div className="text-[20px] font-black text-white">{mockTimeSaved}h</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM ROW */}
        <div className="grid grid-cols-3 gap-4">

          {/* Active Jobs */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black uppercase tracking-widest">Açık Pozisyonlar</span>
              <span className="text-[7px] font-black px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">8 AKTİF</span>
            </div>
            <div className="space-y-2">
              {activeJobs.map((j, i) => (
                <div key={i} className="flex items-center justify-between gap-3 p-2.5 bg-white/[0.03] border border-white/[0.05] rounded-xl hover:bg-white/[0.06] transition-all cursor-pointer group">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold text-white/90 group-hover:text-blue-300 truncate transition-colors">{j.title}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Users className="w-2.5 h-2.5 text-white/30" />
                      <span className="text-[8px] text-white/30 font-bold">{j.count} Aday</span>
                    </div>
                  </div>
                  <div className="text-[10px] font-black text-emerald-400">{j.match}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Weekly Plan */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black uppercase tracking-widest">Haftanın Planı</span>
              <button className="text-[8px] font-black text-blue-400 uppercase tracking-widest hover:text-blue-300">TÜMÜNÜ GÖR</button>
            </div>
            <div className="space-y-3">
              {sessions.map((s, i) => (
                <div key={i} className="flex items-center gap-3 group">
                  <div className="text-center min-w-[50px] bg-white/[0.05] border border-white/[0.07] rounded-lg py-1.5 px-1">
                    <div className="text-[11px] font-black text-white">{s.time}</div>
                    <div className={`text-[7px] font-bold uppercase ${s.date === 'BUGÜN' ? 'text-emerald-400' : 'text-white/30'}`}>{s.date}</div>
                  </div>
                  <div className="flex-1 border-b border-white/[0.05] pb-3 group-last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-white/90 group-hover:text-blue-300 transition-colors">{s.name}</span>
                      <span className="text-[8px] font-black text-emerald-400">%{s.score}</span>
                      {s.status === 'live' && (
                        <span className="text-[6px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/30 px-1.5 py-0.5 rounded animate-pulse">CANLI</span>
                      )}
                    </div>
                    <div className="text-[8px] text-white/30 font-bold uppercase mt-0.5">{s.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Engine Status */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-5">
              <Cpu className="w-4 h-4 text-blue-400" />
              <span className="text-[10px] font-black uppercase tracking-widest">Motor Statüsü</span>
            </div>
            <div className="space-y-4 flex-1">
              {engines.map((e, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-between text-[8px] font-black uppercase tracking-wide">
                    <span className="text-white/60">{e.label}</span>
                    <span style={{ color: e.color }}>{e.val}%</span>
                  </div>
                  <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${e.val}%`, background: e.color }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 border border-dashed border-white/10 rounded-xl py-4 flex flex-col items-center justify-center gap-2">
              <div className="flex items-center gap-2">
                <Shield className="w-3 h-3 text-blue-400" />
                <span className="text-[9px] font-black text-blue-400/60 uppercase tracking-[0.3em]">AI CORE ACTIVE</span>
              </div>
              <div className="flex items-center gap-1.5 text-[7px] font-bold text-white/20 uppercase">
                <RefreshCw className="w-2.5 h-2.5" />
                Last sync: 2m ago
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
