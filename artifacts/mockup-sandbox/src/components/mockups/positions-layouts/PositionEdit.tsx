import React, { useState } from 'react';
import { Edit2, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import './_group.css';

export default function PositionEdit() {
  const [formData, setFormData] = useState({
    title: "Senior Frontend Engineer",
    department: "Mühendislik",
    experience: "5",
    requirements: "React, TypeScript, GraphQL, Next.js",
    description: "We are looking for an experienced frontend engineer to join our core product team. You will be responsible for building high-performance web applications using modern web technologies."
  });

  return (
    <div className="min-h-screen w-full font-sans text-slate-800 relative">
      {/* BACKGROUND (blurred) */}
      <div className="fixed inset-0 bg-slate-50 overflow-hidden" style={{ filter: 'blur(3px)', opacity: 0.5 }}>
        <div className="p-8 pt-24">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 bg-white rounded-2xl border border-slate-200 mb-2" />
          ))}
        </div>
      </div>
      <div className="fixed inset-0 bg-slate-900/25 backdrop-blur-sm" />

      {/* MODAL */}
      <div className="fixed inset-0 flex items-center justify-center p-6 z-10">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
          
          {/* MODAL HEADER */}
          <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
              <div className="bg-amber-50 border border-amber-200 text-amber-500 p-2 rounded-xl">
                <Edit2 size={20} />
              </div>
              <div>
                <h2 className="text-[16px] font-black text-slate-900 leading-tight">Pozisyon Düzenle</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm font-medium text-slate-500">Senior Frontend Engineer</span>
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-md">
                    Düzenleniyor
                  </span>
                </div>
              </div>
            </div>
            <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* CHANGE INDICATOR BANNER */}
          <div className="mx-8 mt-5 mb-0 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-center gap-3 shrink-0">
            <AlertCircle size={14} className="text-amber-500 shrink-0" />
            <span className="text-[12px] text-amber-700 font-medium">
              Bu pozisyona bağlı 12 aday etkilenebilir. Değişiklikleri kaydetmeden önce gözden geçirin.
            </span>
          </div>

          {/* MODAL BODY */}
          <div className="grid grid-cols-2 divide-x divide-slate-100 overflow-y-auto mt-2">
            
            {/* LEFT COLUMN */}
            <div className="p-6">
              <div className="text-[9px] font-black text-slate-400 tracking-widest uppercase mb-4">
                MEVCUT BİLGİLER
              </div>
              
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-3">
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-400 uppercase tracking-widest font-semibold mb-0.5">Pozisyon</span>
                  <span className="text-[13px] font-bold text-slate-800">Senior Frontend Engineer</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-400 uppercase tracking-widest font-semibold mb-0.5">Departman</span>
                  <span className="text-[13px] font-bold text-slate-800">Mühendislik</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-400 uppercase tracking-widest font-semibold mb-0.5">Tecrübe</span>
                  <span className="text-[13px] font-bold text-slate-800">5 yıl+</span>
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-[9px] text-slate-400 uppercase tracking-widest font-semibold mb-1">Durum</span>
                  <span className="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                    AKTİF
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-400 uppercase tracking-widest font-semibold mb-0.5">Adaylar</span>
                  <span className="text-[13px] font-bold text-slate-800">12 eşleşme</span>
                </div>
              </div>

              <div className="mt-6">
                <div className="text-[9px] font-black text-slate-400 tracking-widest uppercase mb-2">
                  MEVCUT GEREKSİNİMLER
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {["React", "TypeScript", "GraphQL", "Next.js"].map(tag => (
                    <span key={tag} className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-semibold border border-slate-200">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="p-6 flex flex-col">
              <div className="text-[9px] font-black text-slate-400 tracking-widest uppercase mb-4">
                DEĞİŞTİRİLECEK ALANLAR
              </div>
              
              <div className="space-y-4 flex-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Pozisyon Adı</label>
                  <input 
                    type="text" 
                    value={formData.title}
                    onChange={e => setFormData({...formData, title: e.target.value})}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 w-full outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>
                
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Departman</label>
                  <select 
                    value={formData.department}
                    onChange={e => setFormData({...formData, department: e.target.value})}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 w-full outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  >
                    <option value="Mühendislik">Mühendislik</option>
                    <option value="Tasarım">Tasarım</option>
                    <option value="Ürün">Ürün</option>
                    <option value="Pazarlama">Pazarlama</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Min. Tecrübe (Yıl)</label>
                  <input 
                    type="number" 
                    value={formData.experience}
                    onChange={e => setFormData({...formData, experience: e.target.value})}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 w-full outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Gereksinimler</label>
                  <input 
                    type="text" 
                    value={formData.requirements}
                    onChange={e => setFormData({...formData, requirements: e.target.value})}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 w-full outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Açıklama</label>
                  <textarea 
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 w-full h-20 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 resize-none"
                  />
                </div>
              </div>

              <div className="mt-6 flex gap-3 pt-4 border-t border-slate-100">
                <button className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs transition-colors">
                  İptal
                </button>
                <button className="flex-1 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors shadow-md shadow-cyan-200">
                  <CheckCircle2 size={16} />
                  Değişiklikleri Kaydet
                </button>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
