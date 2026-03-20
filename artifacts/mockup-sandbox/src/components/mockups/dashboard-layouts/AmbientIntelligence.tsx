import { Users, Target, Clock, Zap, TrendingUp, Brain, Calendar, ChevronRight, Sparkles, Activity } from "lucide-react";

const kpis = [
  { label: "Adaylar", value: "247", sub: "+12 bu hafta", icon: Users, gradient: "from-violet-500 to-purple-600" },
  { label: "Pozisyonlar", value: "8", sub: "Açık ilanlar", icon: Target, gradient: "from-blue-500 to-cyan-500" },
  { label: "AI Uyum", value: "91%", sub: "+5% artış", icon: Brain, gradient: "from-emerald-500 to-teal-500" },
  { label: "Bu Hafta", value: "12", sub: "Mülakat planı", icon: Calendar, gradient: "from-amber-500 to-orange-500" },
];

const pipeline = [
  { label: "Başvurular", count: 247, pct: 100, color: "#8B5CF6" },
  { label: "AI Tarama", count: 210, pct: 85, color: "#6366F1" },
  { label: "İnceleme", count: 173, pct: 70, color: "#3B82F6" },
  { label: "Mülakatlar", count: 136, pct: 55, color: "#06B6D4" },
  { label: "Teklifler", count: 99, pct: 40, color: "#10B981" },
];

const activity = [
  { type: "new", text: "Mert Özdemir başvurdu", sub: "Senior Frontend · %94 uyum", time: "2 dk", color: "#8B5CF6" },
  { type: "interview", text: "Selin Arslan mülakatı başladı", sub: "UX Designer · Canlı", time: "15 dk", color: "#10B981", live: true },
  { type: "ai", text: "AI analizi tamamlandı", sub: "12 aday · Scoring Engine", time: "32 dk", color: "#3B82F6" },
  { type: "match", text: "3 yeni yüksek eşleşme", sub: "DevOps Engineer pozisyonu", time: "1 sa", color: "#F59E0B" },
  { type: "offer", text: "Teklif kabul edildi", sub: "Burak Yıldız · Data Scientist", time: "3 sa", color: "#10B981" },
  { type: "new", text: "Ceren Kaya başvurdu", sub: "Product Manager · %91 uyum", time: "5 sa", color: "#8B5CF6" },
];

const jobs = [
  { title: "Senior Frontend Dev", dept: "Mühendislik", count: 34, score: 92, color: "#8B5CF6" },
  { title: "Data Scientist", dept: "Analitik", count: 28, score: 87, color: "#3B82F6" },
  { title: "UX Designer", dept: "Tasarım", count: 19, score: 95, color: "#10B981" },
  { title: "DevOps Engineer", dept: "Altyapı", count: 23, score: 83, color: "#F59E0B" },
];

export function AmbientIntelligence() {
  return (
    <div
      className="min-h-screen font-['Inter'] overflow-auto"
      style={{ background: "linear-gradient(135deg, #EEF2FF 0%, #E0F2FE 40%, #F0FDF4 100%)" }}
    >

      {/* HEADER */}
      <div
        className="px-8 py-4 flex items-center justify-between sticky top-0 z-10"
        style={{ background: "rgba(255,255,255,0.7)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(139,92,246,0.1)" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #8B5CF6, #6366F1)" }}>
            <span className="text-[10px] font-black text-white">TI</span>
          </div>
          <div>
            <div className="text-[15px] font-black" style={{ background: "linear-gradient(90deg, #7C3AED, #2563EB)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Talent Intelligence
            </div>
            <div className="text-[9px] text-slate-400 font-medium">Genel bakış · 20 Mart 2026</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block animate-pulse" />
            Aktif
          </div>
          <button
            className="text-[10px] font-bold text-white px-4 py-1.5 rounded-full transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #7C3AED, #2563EB)" }}
          >
            + Aday Ekle
          </button>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-8 py-6 space-y-6">

        {/* KPI CARDS */}
        <div className="grid grid-cols-4 gap-4">
          {kpis.map((k, i) => (
            <div
              key={i}
              className="relative rounded-2xl p-5 overflow-hidden cursor-pointer group"
              style={{ background: "rgba(255,255,255,0.6)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.8)", boxShadow: "0 4px 24px rgba(0,0,0,0.04)" }}
            >
              <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full bg-gradient-to-br ${k.gradient} opacity-10 blur-xl group-hover:opacity-20 transition-opacity`} />
              <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${k.gradient} flex items-center justify-center mb-3 shadow-lg`}>
                <k.icon className="w-4 h-4 text-white" />
              </div>
              <div className="text-[11px] font-semibold text-slate-500 mb-1">{k.label}</div>
              <div className="text-[28px] font-black text-slate-900 leading-none mb-1">{k.value}</div>
              <div className="text-[9px] font-medium text-slate-400">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* MAIN GRID */}
        <div className="grid grid-cols-12 gap-5">

          {/* PIPELINE + JOBS — 8 cols */}
          <div className="col-span-8 space-y-5">

            {/* PIPELINE */}
            <div
              className="rounded-2xl p-6"
              style={{ background: "rgba(255,255,255,0.6)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.8)", boxShadow: "0 4px 24px rgba(0,0,0,0.04)" }}
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-violet-500" />
                  <span className="text-[13px] font-black text-slate-900">Aday Akış Analizi</span>
                </div>
                <button className="flex items-center gap-1 text-[10px] font-bold text-violet-600 hover:underline">
                  Detay <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-3">
                {pipeline.map((p, i) => (
                  <div key={i} className="flex items-center gap-4 group">
                    <div className="w-20 text-right text-[10px] font-semibold text-slate-500 shrink-0">{p.label}</div>
                    <div className="flex-1 h-10 rounded-xl overflow-hidden" style={{ background: "rgba(0,0,0,0.03)" }}>
                      <div
                        className="h-full rounded-xl flex items-center px-4 transition-all duration-700 relative overflow-hidden"
                        style={{
                          width: `${p.pct}%`,
                          background: `linear-gradient(90deg, ${p.color}15, ${p.color}25)`,
                          borderLeft: `3px solid ${p.color}`
                        }}
                      >
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `${p.color}10` }} />
                      </div>
                    </div>
                    <div className="w-10 text-right text-[14px] font-black text-slate-800 tabular-nums shrink-0">{p.count}</div>
                    <div className="w-8 text-right text-[9px] font-bold text-slate-400 shrink-0">{p.pct}%</div>
                  </div>
                ))}
              </div>

              {/* Funnel conversion */}
              <div className="mt-5 pt-4 border-t border-slate-100/80 flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-slate-500 font-medium">Genel dönüşüm:</span>
                  <span className="font-black text-violet-700">%40.1</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-slate-500 font-medium">Avg. Time-to-Hire:</span>
                  <span className="font-black text-slate-800">12.4 gün</span>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-600">
                  <TrendingUp className="w-3 h-3" />
                  Geçen aya göre %22 hızlanma
                </div>
              </div>
            </div>

            {/* OPEN JOBS */}
            <div
              className="rounded-2xl p-6"
              style={{ background: "rgba(255,255,255,0.6)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.8)", boxShadow: "0 4px 24px rgba(0,0,0,0.04)" }}
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-blue-500" />
                  <span className="text-[13px] font-black text-slate-900">Açık Pozisyonlar</span>
                </div>
                <span className="text-[8px] font-black px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100">8 Aktif</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {jobs.map((j, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-xl cursor-pointer group transition-all hover:scale-[1.01]"
                    style={{ background: `${j.color}08`, border: `1px solid ${j.color}20` }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold text-slate-800 group-hover:text-slate-900 leading-tight">{j.title}</div>
                        <div className="text-[9px] font-medium mt-0.5" style={{ color: j.color }}>{j.dept}</div>
                      </div>
                      <div className="text-[13px] font-black ml-2" style={{ color: j.color }}>{j.score}%</div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px] text-slate-400 font-medium">
                      <Users className="w-3 h-3" />
                      {j.count} aday
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* ACTIVITY FEED + AI CARD — 4 cols */}
          <div className="col-span-4 space-y-5">

            {/* AI INSIGHT */}
            <div
              className="rounded-2xl p-5 relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, rgba(124,58,237,0.9), rgba(37,99,235,0.9))",
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(255,255,255,0.15)"
              }}
            >
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
              <div className="relative z-10">
                <div className="flex items-center gap-1.5 mb-3">
                  <Sparkles className="w-3.5 h-3.5 text-violet-200" />
                  <span className="text-[8px] font-black text-violet-200 uppercase tracking-[0.2em]">AI Özeti</span>
                </div>
                <p className="text-[12px] text-white/80 leading-relaxed mb-4 font-medium">
                  AI bu periyotta <span className="text-white font-black">120 saatlik</span> manuel yükü üstlendi ve işe alım sürenizi <span className="text-white font-black">%22 kısalttı</span>.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/10 border border-white/10 rounded-xl p-3">
                    <div className="text-[7px] font-black text-white/50 uppercase tracking-widest mb-1">ROI</div>
                    <div className="text-[18px] font-black text-white">$42,500</div>
                  </div>
                  <div className="bg-white/10 border border-white/10 rounded-xl p-3">
                    <div className="text-[7px] font-black text-white/50 uppercase tracking-widest mb-1">SÜRE</div>
                    <div className="text-[18px] font-black text-white">120h</div>
                  </div>
                </div>
              </div>
            </div>

            {/* ACTIVITY FEED */}
            <div
              className="rounded-2xl p-5"
              style={{ background: "rgba(255,255,255,0.6)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.8)", boxShadow: "0 4px 24px rgba(0,0,0,0.04)" }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[12px] font-black text-slate-900">Canlı Akış</span>
              </div>
              <div className="space-y-3">
                {activity.map((a, i) => (
                  <div key={i} className="flex items-start gap-3 group">
                    <div className="w-2 h-2 rounded-full mt-1.5 shrink-0 relative" style={{ backgroundColor: a.color }}>
                      {a.live && <div className="absolute inset-0 rounded-full animate-ping opacity-75" style={{ backgroundColor: a.color }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-slate-800 leading-tight">{a.text}</div>
                      <div className="text-[9px] font-medium mt-0.5" style={{ color: a.color }}>{a.sub}</div>
                    </div>
                    <div className="text-[8px] font-medium text-slate-300 shrink-0 mt-0.5">{a.time}</div>
                  </div>
                ))}
              </div>
              <button className="mt-4 w-full text-center text-[9px] font-bold text-violet-600 hover:text-violet-800 transition-colors">
                Tüm aktiviteyi gör →
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
