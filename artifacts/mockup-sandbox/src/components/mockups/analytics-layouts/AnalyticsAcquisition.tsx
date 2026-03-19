import React, { useState } from 'react';
import { Activity, Globe, MessageSquare, Zap, Target, BrainCircuit } from 'lucide-react';
import './_group.css';

export default function AnalyticsAcquisition() {
  const [sourceTab, setSourceTab] = useState('source');
  const ACTIVE_TAB = 'acquisition';

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
              <span key={id} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${id === ACTIVE_TAB ? 'bg-white text-cyan-600 shadow-sm border border-slate-200' : 'text-slate-500'}`}>{label}</span>
            ))}
          </div>
          {/* Time range */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            {['7G','30G'].map(r => (
              <span key={r} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${r === '7G' ? 'bg-white text-cyan-600 shadow-sm border border-slate-200' : 'text-slate-500'}`}>{r}</span>
            ))}
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <div className="flex-1 p-5 overflow-y-auto">
        <div className="grid grid-cols-12 gap-4 h-full">
          
          {/* LEFT — Source Analysis */}
          <div className="col-span-5 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Globe size={16} className="text-cyan-500" />
                <span className="text-[14px] font-bold text-slate-900">Kaynak Analizi</span>
              </div>
              <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                {['Kanal', 'Detay'].map(tab => (
                  <button 
                    key={tab}
                    onClick={() => setSourceTab(tab === 'Kanal' ? 'source' : 'detail')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${sourceTab === (tab === 'Kanal' ? 'source' : 'detail') ? 'bg-white text-cyan-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-5 py-4 space-y-3 flex-1">
              {[
                { name: 'LinkedIn / Scraper', count: 68, uyum: 81, basari: 22 },
                { name: 'CV Yükleme', count: 43, uyum: 74, basari: 18 },
                { name: 'Eklenti', count: 21, uyum: 69, basari: 14 },
                { name: 'Diğer', count: 10, uyum: 55, basari: 10 }
              ].map(row => (
                <div key={row.name} className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex justify-between items-center hover:border-cyan-200 transition-colors cursor-pointer group">
                  <div>
                    <div className="text-[13px] font-bold text-slate-800 group-hover:text-cyan-700 transition-colors">{row.name}</div>
                    <div className="inline-flex bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full mt-1">{row.count} aday</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-[9px] text-slate-400 uppercase tracking-wide">Uyum</div>
                      <div className="text-[14px] font-black text-cyan-500">{row.uyum}%</div>
                    </div>
                    <div className="w-[1px] h-8 bg-slate-200" />
                    <div className="text-right">
                      <div className="text-[9px] text-slate-400 uppercase tracking-wide">Başarı</div>
                      <div className="text-[14px] font-black text-emerald-500">{row.basari}%</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* MIDDLE — Skill Matrix */}
          <div className="col-span-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2 shrink-0">
              <Zap size={16} className="text-cyan-500" />
              <span className="text-[14px] font-bold text-slate-900">Yetenek Matrisi</span>
            </div>
            <div className="px-5 py-4 flex-1 flex flex-col">
              <div className="flex flex-wrap gap-2 content-start">
                {[
                  ["React", 38], ["TypeScript", 29], ["Python", 26], ["Node.js", 22],
                  ["PostgreSQL", 18], ["Next.js", 14], ["GraphQL", 12], ["Docker", 9]
                ].map(([skill, count]) => (
                  <div key={skill as string} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 hover:border-cyan-200 hover:bg-cyan-50 transition-all cursor-pointer group">
                    <span className="text-sm font-bold text-slate-700 group-hover:text-cyan-700">{skill as string}</span>
                    <span className="text-[11px] font-black text-cyan-600 bg-cyan-100 px-2 py-0.5 rounded-lg group-hover:bg-cyan-200 group-hover:text-cyan-800 transition-colors">{count}</span>
                  </div>
                ))}
              </div>
              
              <div className="mt-auto pt-4 border-t border-slate-100">
                <div className="text-[11px] font-bold text-slate-500 mb-3 uppercase tracking-wide">En Çok Aranan</div>
                <div className="space-y-2">
                  {[
                    { name: 'React', count: 38, max: 38, color: 'bg-cyan-400' },
                    { name: 'TypeScript', count: 29, max: 38, color: 'bg-violet-400' },
                    { name: 'Python', count: 26, max: 38, color: 'bg-blue-400' }
                  ].map(bar => (
                    <div key={bar.name} className="flex items-center gap-3">
                      <span className="text-[11px] font-medium text-slate-600 w-16 truncate">{bar.name}</span>
                      <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${bar.color} rounded-full transition-all duration-1000 ease-out`} style={{ width: `${(bar.count / bar.max) * 100}%` }} />
                      </div>
                      <span className="text-[11px] font-bold text-slate-700 w-6 text-right">{bar.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT — Match Score Gauge */}
          <div className="col-span-3 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-50 rounded-full blur-3xl -mr-10 -mt-10 opacity-60"></div>
            
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-6 relative z-10">ORT. UYUM SKORU</div>
            
            <div className="relative z-10 w-full flex justify-center">
              <svg viewBox="0 0 200 110" className="w-full max-w-[180px] drop-shadow-sm">
                {/* Background arc */}
                <path d="M 20 100 A 80 80 0 0 1 180 100" stroke="#f1f5f9" strokeWidth="16" fill="none" strokeLinecap="round" />
                {/* Value arc - 73% of the semicircle = 73% of 180deg */}
                <path d="M 20 100 A 80 80 0 0 1 180 100" stroke="#06b6d4" strokeWidth="16" fill="none" strokeLinecap="round"
                  strokeDasharray="251.2" strokeDashoffset={`${251.2 * (1 - 0.73)}`} className="transition-all duration-1000 ease-out" />
                {/* Value text */}
                <text x="100" y="85" textAnchor="middle" fontSize="32" fontWeight="900" fill="#0f172a" letterSpacing="-1">73%</text>
              </svg>
            </div>

            <div className="w-full grid grid-cols-3 gap-2 mt-6 relative z-10">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-center transition-all hover:bg-slate-100 cursor-default">
                <div className="text-[15px] font-black text-slate-700">142</div>
                <div className="text-[9px] text-slate-400 font-medium uppercase mt-0.5">Toplam</div>
              </div>
              <div className="bg-slate-50 border border-emerald-50 rounded-xl p-2.5 text-center transition-all hover:bg-emerald-50 cursor-default">
                <div className="text-[15px] font-black text-emerald-500">12</div>
                <div className="text-[9px] text-slate-400 font-medium uppercase mt-0.5">İşe Alım</div>
              </div>
              <div className="bg-slate-50 border border-cyan-50 rounded-xl p-2.5 text-center transition-all hover:bg-cyan-50 cursor-default">
                <div className="text-[15px] font-black text-cyan-500">18%</div>
                <div className="text-[9px] text-slate-400 font-medium uppercase mt-0.5">Verim</div>
              </div>
            </div>

            <div className="flex flex-col items-center mt-8 gap-2 relative z-10">
              <div className="w-8 h-8 rounded-full bg-cyan-50 flex items-center justify-center text-cyan-500 mb-1 ring-4 ring-white">
                <BrainCircuit size={16} />
              </div>
              <div className="text-[11px] text-slate-500 font-bold tracking-wide">AI EŞLEŞTİRME AKTİF</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}