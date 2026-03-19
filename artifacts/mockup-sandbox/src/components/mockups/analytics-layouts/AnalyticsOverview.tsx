import React from 'react';
import { Activity, Globe, MessageSquare, Users, BrainCircuit, Clock, Target, TrendingUp, Briefcase, Zap, Layers } from 'lucide-react';
import './_group.css';

export default function AnalyticsOverview() {
  const ACTIVE_TAB = 'overview';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      {/* Header */}
      <div className="h-12 bg-slate-900 flex items-center px-6 gap-3 shrink-0">
        <div className="w-6 h-6 rounded-md bg-cyan-500 flex items-center justify-center text-white text-[10px] font-black">TI</div>
        <span className="text-white font-bold text-sm">Talent-Inn</span>
      </div>
      {/* Sub-header with tabs */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Activity size={16} className="text-cyan-500" />
          <span className="font-black text-slate-900 text-sm tracking-tight">Stratejik Analitik</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] text-slate-400">Sistem Aktif</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Tabs pill */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            {[['overview','Genel Bakış','Activity'],['acquisition','Edinme & Kaynak','Globe'],['responses','Yanıt Takibi','MessageSquare']].map(([id, label]) => (
              <span key={id} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${id === ACTIVE_TAB ? 'bg-white text-cyan-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>{label}</span>
            ))}
          </div>
          {/* Time range */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            {['7G','30G'].map(r => (
              <span key={r} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${r === '7G' ? 'bg-white text-cyan-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>{r}</span>
            ))}
          </div>
        </div>
      </div>
      {/* Main content */}
      <div className="flex-1 p-5 overflow-y-auto">
        <div className="space-y-4">
          
          {/* ROW 1: 4 KPI STAT CARDS */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
              <div className="flex justify-between items-start">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center">
                  <Users size={16} />
                </div>
                <span className="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded-full">▲ 12%</span>
              </div>
              <div>
                <div className="text-[28px] font-black text-slate-900 leading-none">142</div>
                <div className="text-[11px] text-slate-400 font-medium mt-1">Aktif Aday Havuzu</div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
              <div className="flex justify-between items-start">
                <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-500 flex items-center justify-center">
                  <BrainCircuit size={16} />
                </div>
                <span className="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded-full">▲ 3.4%</span>
              </div>
              <div>
                <div className="text-[28px] font-black text-slate-900 leading-none">73%</div>
                <div className="text-[11px] text-slate-400 font-medium mt-1">Ort. Yetenek Skoru</div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
              <div className="flex justify-between items-start">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center">
                  <Clock size={16} />
                </div>
                <span className="bg-red-50 text-red-500 text-[10px] font-bold px-2 py-0.5 rounded-full">▼ 5%</span>
              </div>
              <div>
                <div className="text-[28px] font-black text-slate-900 leading-none">28</div>
                <div className="text-[11px] text-slate-400 font-medium mt-1">Yanıt Bekleyen</div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
              <div className="flex justify-between items-start">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
                  <Target size={16} />
                </div>
                <span className="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded-full">▲ 2%</span>
              </div>
              <div>
                <div className="text-[28px] font-black text-slate-900 leading-none">18%</div>
                <div className="text-[11px] text-slate-400 font-medium mt-1">İşe Alım Verimi</div>
              </div>
            </div>
          </div>

          {/* ROW 2: CHART + FUNNEL */}
          <div className="grid grid-cols-12 gap-4 items-start">
            {/* LEFT - Performance Trend */}
            <div className="col-span-8 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="text-cyan-500" size={16} />
                  <span className="text-[14px] font-bold text-slate-900">Başvuru Trendi</span>
                </div>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-2.5 py-1 rounded-xl font-semibold">Son 7 Gün</span>
              </div>
              
              <div className="h-44 flex items-end justify-between gap-1 px-2 pt-2 border-b border-slate-100 pb-2">
                {[
                  { d: 'P', h: '40%' },
                  { d: 'S', h: '55%' },
                  { d: 'Ç', h: '30%' },
                  { d: 'P', h: '70%' },
                  { d: 'C', h: '85%' },
                  { d: 'C', h: '60%' },
                  { d: 'P', h: '90%', active: true },
                ].map((bar, i) => (
                  <div key={i} className="flex flex-col items-center w-full gap-2">
                    <div className="w-full h-36 flex items-end justify-center">
                      <div 
                        className={`w-full rounded-t-md transition-colors ${bar.active ? 'bg-cyan-500' : 'bg-cyan-400 hover:bg-cyan-500'}`} 
                        style={{ height: bar.h }}
                      />
                    </div>
                    <span className="text-[9px] text-slate-400 font-medium">{bar.d}</span>
                  </div>
                ))}
              </div>
              
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="flex gap-6">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400">Bu hafta:</span>
                    <span className="font-bold text-slate-700 text-sm">24</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400">Geçen hafta:</span>
                    <span className="font-bold text-slate-700 text-sm">18</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400">Değişim:</span>
                    <span className="font-bold text-emerald-600 text-sm">▲ 33%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT - Conversion Funnel */}
            <div className="col-span-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Layers className="text-amber-500" size={16} />
                <span className="text-[14px] font-bold text-slate-900">Dönüşüm Hunisi</span>
              </div>
              
              <div className="space-y-4 mt-4">
                {[
                  { name: 'Başvuru', count: 142, color: '#6366f1', width: '100%' },
                  { name: 'İnceleme', count: 87, color: '#f59e0b', width: '61%' },
                  { name: 'Mülakat', count: 34, color: '#3b82f6', width: '24%' },
                  { name: 'İşe Alım', count: 12, color: '#10b981', width: '8%' },
                ].map((stage, i) => (
                  <div key={i}>
                    <div className="flex justify-between items-center mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                        <span className="text-[12px] font-semibold text-slate-700">{stage.name}</span>
                      </div>
                      <span className="text-[14px] font-black text-slate-900">{stage.count}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: stage.width, backgroundColor: stage.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ROW 3: POSITION PERFORMANCE TABLE */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="text-violet-400" size={15} />
                <span className="text-[14px] font-bold text-slate-900">Pozisyon Performans Matrisi</span>
              </div>
              <span className="bg-slate-100 text-slate-500 text-[10px] font-semibold px-2.5 py-1 rounded-xl">4 Pozisyon</span>
            </div>
            
            <div className="w-full">
              <div className="bg-slate-50 px-5 py-2.5 grid grid-cols-[2fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-3">
                {['POZİSYON', 'TOPLAM', 'İNCELEME', 'MÜLAKAT', 'İŞE ALIM', 'ORT. SKOR'].map(label => (
                  <div key={label} className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</div>
                ))}
              </div>
              
              <div className="flex flex-col">
                {[
                  { pos: 'Senior Frontend Eng.', total: 38, review: 22, interview: 10, hired: 4, score: '84%' },
                  { pos: 'Ürün Yöneticisi', total: 27, review: 15, interview: 7, hired: 3, score: '79%' },
                  { pos: 'Backend Developer', total: 21, review: 12, interview: 5, hired: 2, score: '71%' },
                  { pos: 'UX Designer', total: 18, review: 9, interview: 4, hired: 1, score: '68%' },
                ].map((row, i) => (
                  <div key={i} className="px-5 py-3 border-t border-slate-100 grid grid-cols-[2fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-3 items-center hover:bg-slate-50 transition-colors">
                    <div className="text-[12px] font-bold text-slate-800 truncate pr-4">{row.pos}</div>
                    <div className="text-[13px] font-black text-slate-700">{row.total}</div>
                    <div className="text-[13px] font-black text-slate-700">{row.review}</div>
                    <div className="text-[13px] font-black text-slate-700">{row.interview}</div>
                    <div className="text-[13px] font-black text-slate-700">{row.hired}</div>
                    <div className="flex flex-col gap-1">
                      <div className="text-[13px] font-black text-cyan-500">{row.score}</div>
                      <div className="h-[2px] w-full bg-cyan-100 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-400" style={{ width: row.score }} />
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