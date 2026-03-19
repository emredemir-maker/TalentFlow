import React from 'react';
import { Edit2, Unlock, X, Building2, ArrowUpRight, XCircle } from 'lucide-react';
import './_group.css';

const mockPosition = {
  title: "Senior Frontend Engineer",
  dept: "Mühendislik",
  status: "open",
  candidates: 12,
  experience: 5,
  openDays: 14,
  requirements: ["React", "TypeScript", "GraphQL", "Next.js"],
  description: "Mühendislik ekibimize katılacak deneyimli bir Frontend mühendisi arıyoruz. Adayın modern React ekosistemiyle çalışmış olması, TypeScript konusunda derinlemesine bilgi sahibi olması beklenmektedir.",
  matchedCandidates: [
    { name: "Ayşe Kaya", score: 91, initials: "AK" },
    { name: "Mehmet Demir", score: 87, initials: "MD" },
    { name: "Zeynep Arslan", score: 72, initials: "ZA" }
  ]
};

export default function PositionDetail() {
  return (
    <div className="min-h-screen w-full font-sans overflow-hidden bg-slate-50 relative text-slate-800">
      {/* BACKGROUND MOCK */}
      <div className="fixed inset-0 bg-slate-50" style={{ filter: 'blur(2px)', opacity: 0.6 }}>
        <div className="p-8 pt-24">
          <div className="h-12 bg-white rounded-xl border border-slate-200 mb-4 max-w-4xl" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-white rounded-2xl border border-slate-200 mb-2 max-w-4xl" />
          ))}
        </div>
      </div>
      <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-[2px]" />

      {/* DRAWER */}
      <div className="fixed right-0 top-0 h-full w-[520px] bg-white shadow-2xl shadow-slate-900/10 border-l border-slate-200 flex flex-col z-10">
        
        {/* DRAWER HEADER */}
        <div className="px-6 py-5 border-b border-slate-100 shrink-0">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 text-[10px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              AKTİF
            </div>
            <div className="flex items-center gap-1.5">
              <button className="p-2 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors">
                <Edit2 size={16} className="text-slate-400" />
              </button>
              <button className="p-2 rounded-lg bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-colors">
                <Unlock size={16} className="text-violet-400" />
              </button>
              <button className="p-2 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors">
                <X size={16} className="text-slate-400" />
              </button>
            </div>
          </div>
          <div>
            <h2 className="text-[20px] font-black text-slate-900 mt-2">{mockPosition.title}</h2>
            <div className="inline-flex items-center gap-1.5 mt-1">
              <Building2 size={12} className="text-slate-400" />
              <span className="text-[12px] text-slate-500">{mockPosition.dept}</span>
            </div>
          </div>
        </div>

        {/* DRAWER BODY */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          
          {/* SECTION 1 — Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 text-center">
              <div className="text-[24px] font-black text-slate-900 leading-none">{mockPosition.candidates}</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Aday</div>
            </div>
            <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 text-center">
              <div className="text-[24px] font-black text-slate-900 leading-none">{mockPosition.experience} yıl+</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Min. Tecrübe</div>
            </div>
            <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 text-center">
              <div className="text-[24px] font-black text-cyan-500 leading-none">{mockPosition.openDays} gün</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Açık Süre</div>
            </div>
          </div>

          {/* SECTION 2 — Gereksinimler */}
          <div>
            <h3 className="text-[9px] font-black text-slate-400 tracking-widest uppercase mb-2">GEREKSİNİMLER</h3>
            <div className="flex flex-wrap gap-2">
              {mockPosition.requirements.map(req => (
                <span key={req} className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold border border-slate-200">
                  {req}
                </span>
              ))}
            </div>
          </div>

          {/* SECTION 3 — Açıklama */}
          <div>
            <h3 className="text-[9px] font-black text-slate-400 tracking-widest uppercase mb-2">AÇIKLAMA</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              {mockPosition.description}
            </p>
          </div>

          {/* SECTION 4 — AI Uyum Skoru & Eşleşen Adaylar */}
          <div>
            <h3 className="text-[9px] font-black text-slate-400 tracking-widest uppercase mb-2">EŞLEŞEN ADAYLAR</h3>
            <div className="space-y-2">
              {mockPosition.matchedCandidates.map((candidate, idx) => (
                <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-3.5 flex items-center gap-3 hover:border-cyan-200 transition-colors cursor-pointer group">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-xs font-black shrink-0 shadow-sm">
                    {candidate.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-slate-800 truncate">{candidate.name}</div>
                    <div className="text-[11px] text-slate-400 truncate">Aday</div>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <div className="text-[14px] font-black text-cyan-500">{candidate.score}%</div>
                    <div className="h-0.5 w-12 bg-slate-100 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${candidate.score}%` }} />
                    </div>
                  </div>
                  <ArrowUpRight size={14} className="text-slate-300 group-hover:text-cyan-500 transition-colors ml-1 shrink-0" />
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* DRAWER FOOTER */}
        <div className="px-6 py-4 border-t border-slate-100 shrink-0 bg-slate-50">
          <div className="flex gap-3">
            <button className="flex-1 py-3 rounded-xl bg-violet-500 hover:bg-violet-600 transition-colors text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm shadow-violet-200">
              <Unlock size={14} />
              Departmana Aç
            </button>
            <button className="flex-1 py-3 rounded-xl bg-white border border-red-200 hover:bg-red-50 hover:border-red-300 transition-colors text-red-400 font-bold text-xs flex items-center justify-center gap-2">
              <XCircle size={14} />
              Pozisyonu Kapat
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
