import React, { useState } from 'react';
import { Briefcase, XCircle, Sparkles, CheckCircle2, Send } from 'lucide-react';
import './_group.css';

export default function PositionCreate() {
  const [positionName, setPositionName] = useState('');
  const [department, setDepartment] = useState('');
  const [experience, setExperience] = useState('');
  const [requirements, setRequirements] = useState('');
  const [description, setDescription] = useState('');
  const [aiText, setAiText] = useState('');

  const DEPARTMENTS = [
    "Mühendislik",
    "Ürün",
    "Tasarım",
    "Veri",
    "Altyapı"
  ];

  return (
    <div className="min-h-screen w-full font-sans text-slate-800 relative">
      {/* Blurred Background */}
      <div className="fixed inset-0 bg-slate-50 overflow-hidden" style={{ filter: 'blur(3px)', opacity: 0.5 }}>
        <div className="p-8 pt-24">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 bg-white rounded-2xl border border-slate-200 mb-2" />
          ))}
        </div>
      </div>
      <div className="fixed inset-0 bg-slate-900/25 backdrop-blur-sm" />

      {/* Modal Outer */}
      <div className="fixed inset-0 flex items-center justify-center p-6 z-10">
        
        {/* Modal Container */}
        <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200 border border-slate-100 overflow-hidden w-full max-w-3xl flex flex-col max-h-[90vh]">
          
          {/* Modal Header */}
          <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center mr-3">
                <Briefcase size={18} className="text-teal-600" />
              </div>
              <h2 className="text-[16px] font-black text-slate-900">Yeni Pozisyon Oluştur</h2>
              <span className="text-[11px] text-slate-400 ml-3 font-medium">Stratejik işe alım planlaması</span>
            </div>
            <button className="rounded-xl p-2 hover:bg-slate-100 transition-colors group">
              <XCircle size={20} className="text-slate-400 group-hover:text-slate-600" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100 overflow-y-auto">
            
            {/* Left Column - AI */}
            <div className="p-6 bg-gradient-to-b from-cyan-50/50 to-white flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles size={14} className="text-cyan-500" />
                <h3 className="text-[11px] font-black text-cyan-700 uppercase tracking-widest">AI ile Otomatik Doldur</h3>
              </div>
              
              <textarea 
                className="h-40 bg-white border border-cyan-200 rounded-2xl p-4 text-sm text-slate-600 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-100 resize-none transition-all"
                placeholder="İş ilanı metnini buraya yapıştırın..."
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
              />
              <div className="text-[10px] text-slate-400 mt-2 px-1">Min. 50 karakter</div>
              
              <button className="w-full mt-3 bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
                <Sparkles size={14} />
                Otomatik Doldur
              </button>

              <div className="flex items-center mt-6 mb-4">
                <div className="flex-1 h-px bg-slate-100"></div>
                <div className="px-3 text-xs text-slate-400 font-medium">veya manuel doldurun</div>
                <div className="flex-1 h-px bg-slate-100"></div>
              </div>

              <div className="flex flex-col gap-2 mt-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                  <span className="text-xs text-slate-500">Pozisyon başlığı otomatik belirlenir</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                  <span className="text-xs text-slate-500">Gereksinimler listeye dönüştürülür</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                  <span className="text-xs text-slate-500">Departman tahmini yapılır</span>
                </div>
              </div>
            </div>

            {/* Right Column - Manual Form */}
            <div className="p-6 flex flex-col space-y-4">
              
              {/* Field 1 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Pozisyon Adı *</label>
                <input 
                  type="text"
                  placeholder="ör. Senior React Developer"
                  value={positionName}
                  onChange={(e) => setPositionName(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 w-full transition-all"
                />
              </div>

              {/* Field 2 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Departman *</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 w-full transition-all appearance-none cursor-pointer"
                >
                  <option value="" disabled>Departman seç...</option>
                  {DEPARTMENTS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Field 3 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Min. Tecrübe (yıl)</label>
                <input 
                  type="number"
                  min="0"
                  placeholder="0"
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 w-full transition-all"
                />
              </div>

              {/* Field 4 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Gereksinimler</label>
                <input 
                  type="text"
                  placeholder="React, TypeScript, Node.js (virgülle ayırın)"
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 w-full transition-all"
                />
              </div>

              {/* Field 5 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Açıklama</label>
                <textarea 
                  placeholder="Pozisyon hakkında kısa açıklama..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="h-20 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 w-full resize-none transition-all"
                />
              </div>

              <div className="mt-auto pt-2">
                <button className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-black text-xs uppercase tracking-widest py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-sm shadow-cyan-200 transition-colors mt-2">
                  <Send size={14} />
                  Pozisyon Oluştur
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
