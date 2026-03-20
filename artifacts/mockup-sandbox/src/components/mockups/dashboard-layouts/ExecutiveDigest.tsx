import { Users, Target, Clock, Star, Zap, ChevronRight, ArrowUpRight, ArrowDownRight, BarChart2, Calendar, CheckCircle2, Circle } from "lucide-react";

const kpis = [
  { label: "Toplam Aday", value: "247", change: "+12", up: true, desc: "bu hafta yeni başvuru" },
  { label: "Aktif Pozisyon", value: "8", change: "+2", up: true, desc: "açık ilan" },
  { label: "AI Match Skoru", value: "91%", change: "+5%", up: true, desc: "ortalama uyum" },
  { label: "İşe Alım Hızı", value: "12.4g", change: "-22%", up: true, desc: "ortalama süre" },
];

const pipeline = [
  { stage: "Başvurular", count: 247, prev: 231, color: "#1E3A8A" },
  { stage: "AI Tarama", count: 210, prev: 195, color: "#2563EB" },
  { stage: "İnceleme", count: 173, prev: 160, color: "#3B82F6" },
  { stage: "Mülakatlar", count: 136, prev: 128, color: "#60A5FA" },
  { stage: "Teklifler", count: 99, prev: 85, color: "#10B981" },
];

const schedule = [
  { name: "Mert Özdemir", position: "Senior Frontend Dev", time: "09:30", day: "Bugün", score: 94, live: true },
  { name: "Selin Arslan", position: "UX Designer", time: "11:00", day: "Bugün", score: 88, live: false },
  { name: "Burak Yıldız", position: "Data Scientist", time: "14:30", day: "21 Mar", score: 76, live: false },
  { name: "Ceren Kaya", position: "Product Manager", time: "10:00", day: "22 Mar", score: 91, live: false },
];

const jobs = [
  { title: "Senior Frontend Developer", dept: "Mühendislik", count: 34, fill: 72, urgent: true },
  { title: "Data Scientist", dept: "Analitik", count: 28, fill: 58, urgent: false },
  { title: "UX Designer", dept: "Tasarım", count: 19, fill: 85, urgent: false },
  { title: "DevOps Engineer", dept: "Altyapı", count: 23, fill: 44, urgent: true },
];

function Trend({ up, val }: { up: boolean; val: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-black ${up ? "text-emerald-600" : "text-red-500"}`}>
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {val}
    </span>
  );
}

export function ExecutiveDigest() {
  return (
    <div className="min-h-screen bg-[#F0F4F8] font-['Inter'] overflow-auto">

      {/* HEADER */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-[#1E3A8A] rounded-md flex items-center justify-center">
            <span className="text-[9px] font-black text-white">TI</span>
          </div>
          <div>
            <div className="text-[14px] font-black text-[#0F172A] tracking-tight">Stratejik Genel Bakış</div>
            <div className="text-[9px] text-slate-400 font-medium">Cuma, 20 Mart 2026 — Haftalık özet</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
            Sistem Aktif
          </div>
          <button className="text-[10px] font-bold text-white bg-[#1E3A8A] hover:bg-blue-800 px-3 py-1.5 rounded-lg transition-colors">
            Rapor Al
          </button>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-8 py-6 space-y-6">

        {/* KPI ROW */}
        <div className="grid grid-cols-4 gap-4">
          {kpis.map((k, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <span className="text-[11px] font-semibold text-slate-500">{k.label}</span>
                <Trend up={k.up} val={k.change} />
              </div>
              <div className="text-[32px] font-black text-[#0F172A] leading-none mb-1">{k.value}</div>
              <div className="text-[10px] text-slate-400 font-medium">{k.desc}</div>
            </div>
          ))}
        </div>

        {/* MAIN CONTENT */}
        <div className="grid grid-cols-12 gap-5">

          {/* PIPELINE + SCHEDULE — 8 cols */}
          <div className="col-span-8 space-y-5">

            {/* PIPELINE */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-[#1E3A8A]" />
                  <span className="text-[13px] font-black text-[#0F172A]">Aday Pipeline</span>
                </div>
                <button className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:underline">
                  Detaylı Görünüm <ChevronRight className="w-3 h-3" />
                </button>
              </div>

              <div className="space-y-3">
                {pipeline.map((p, i) => {
                  const pct = Math.round((p.count / pipeline[0].count) * 100);
                  const diff = p.count - p.prev;
                  return (
                    <div key={i} className="flex items-center gap-4">
                      <div className="w-24 text-[11px] font-semibold text-slate-600 text-right shrink-0">{p.stage}</div>
                      <div className="flex-1 h-10 bg-slate-50 rounded-xl overflow-hidden border border-slate-100 relative">
                        <div
                          className="h-full rounded-xl flex items-center justify-between px-4 transition-all duration-700"
                          style={{ width: `${pct}%`, backgroundColor: p.color + "18", borderRight: `3px solid ${p.color}` }}
                        >
                          <span className="text-[9px] font-black" style={{ color: p.color }}>{p.stage.toUpperCase()}</span>
                        </div>
                      </div>
                      <div className="w-12 text-right text-[15px] font-black text-[#0F172A] tabular-nums shrink-0">{p.count}</div>
                      <div className="w-14 text-right shrink-0">
                        <span className={`text-[9px] font-bold ${diff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {diff >= 0 ? '+' : ''}{diff}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Conversion summary */}
              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-6">
                <div className="text-[10px] text-slate-500 font-medium">Başvurudan teklife dönüşüm:</div>
                <div className="font-black text-[13px] text-[#1E3A8A]">%{Math.round(99/247*100)} · 40.1%</div>
                <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-600">
                  <ArrowUpRight className="w-3 h-3" />4.2% geçen aya göre
                </div>
              </div>
            </div>

            {/* SCHEDULE */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#1E3A8A]" />
                  <span className="text-[13px] font-black text-[#0F172A]">Haftanın Planı</span>
                </div>
                <button className="text-[10px] font-bold text-blue-600 hover:underline">Tümünü Gör</button>
              </div>
              <div className="divide-y divide-slate-50">
                {schedule.map((s, i) => (
                  <div key={i} className="py-3 flex items-center gap-4 group">
                    <div className="w-16 shrink-0 text-center">
                      <div className="text-[13px] font-black text-[#0F172A]">{s.time}</div>
                      <div className={`text-[8px] font-bold uppercase ${s.day === 'Bugün' ? 'text-emerald-500' : 'text-slate-400'}`}>{s.day}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-bold text-[#0F172A] group-hover:text-blue-700 transition-colors truncate">{s.name}</span>
                        {s.live ? (
                          <span className="text-[7px] font-black px-1.5 py-0.5 bg-rose-50 text-rose-600 border border-rose-100 rounded animate-pulse">● CANLI</span>
                        ) : (
                          <span className="text-[7px] font-black px-1.5 py-0.5 bg-slate-50 text-slate-400 border border-slate-100 rounded">PLANLI</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium mt-0.5">{s.position}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[14px] font-black text-[#0F172A]">%{s.score}</div>
                      <div className="text-[8px] text-slate-400">Uyum skoru</div>
                    </div>
                    <button className="shrink-0 text-[9px] font-bold px-3 py-1.5 bg-[#1E3A8A] text-white rounded-lg hover:bg-blue-800 transition-colors">
                      {s.live ? 'Katıl' : 'Görüntüle'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT PANEL — 4 cols */}
          <div className="col-span-4 space-y-5">

            {/* AI INSIGHT CARD */}
            <div className="bg-[#1E3A8A] text-white rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute -right-6 -top-6 w-24 h-24 bg-blue-500/20 rounded-full blur-xl" />
              <div className="relative z-10">
                <div className="flex items-center gap-1.5 mb-3">
                  <Zap className="w-3.5 h-3.5 text-blue-300 fill-blue-300" />
                  <span className="text-[8px] font-black text-blue-300 uppercase tracking-[0.2em]">AI Performans Özeti</span>
                </div>
                <p className="text-[12px] text-blue-100/80 leading-relaxed mb-5 font-medium">
                  AI sistemimiz bu periyotta <span className="text-white font-black">120 saatlik</span> manuel yükü asiste etti.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/8 border border-white/10 rounded-xl p-3">
                    <div className="text-[7px] text-blue-200/50 uppercase tracking-widest mb-1">ROI</div>
                    <div className="text-[18px] font-black">$42,500</div>
                  </div>
                  <div className="bg-white/8 border border-white/10 rounded-xl p-3">
                    <div className="text-[7px] text-blue-200/50 uppercase tracking-widest mb-1">KAZANILAN</div>
                    <div className="text-[18px] font-black">120h</div>
                  </div>
                </div>
              </div>
            </div>

            {/* OPEN POSITIONS */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[12px] font-black text-[#0F172A]">Açık Pozisyonlar</span>
                <span className="text-[8px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100">8 Aktif</span>
              </div>
              <div className="space-y-3">
                {jobs.map((j, i) => (
                  <div key={i} className="group cursor-pointer">
                    <div className="flex items-start justify-between mb-1.5">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <div className="text-[11px] font-bold text-[#0F172A] group-hover:text-blue-700 transition-colors leading-tight">{j.title}</div>
                          {j.urgent && <div className="w-1.5 h-1.5 bg-amber-400 rounded-full" />}
                        </div>
                        <div className="text-[9px] text-slate-400 font-medium mt-0.5">{j.dept} · {j.count} aday</div>
                      </div>
                      <div className="text-[11px] font-black text-emerald-600">{j.fill}%</div>
                    </div>
                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full transition-all duration-700"
                        style={{ width: `${j.fill}%`, backgroundColor: j.fill > 75 ? '#10B981' : j.fill > 50 ? '#3B82F6' : '#F59E0B' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button className="mt-4 w-full text-center text-[9px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-widest transition-colors">
                Tüm Pozisyonları Gör →
              </button>
            </div>

            {/* ENGINE STATUS */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <span className="text-[12px] font-black text-[#0F172A] block mb-4">Sistem Durumu</span>
              <div className="space-y-3">
                {[
                  { label: "Scoring Engine", val: 98, ok: true },
                  { label: "Bias Guard", val: 100, ok: true },
                  { label: "Data Sync", val: 82, ok: false },
                ].map((e, i) => (
                  <div key={i} className="flex items-center gap-3">
                    {e.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <Circle className="w-4 h-4 text-amber-400 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="font-semibold text-slate-700">{e.label}</span>
                        <span className={`font-black ${e.val > 90 ? 'text-emerald-600' : 'text-amber-500'}`}>{e.val}%</span>
                      </div>
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${e.val > 90 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${e.val}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
