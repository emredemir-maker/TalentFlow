import { useState } from "react";
import { X, Upload, FileText, Trash2, Files, Check, AlertCircle, Loader2, Sparkles, Users, Briefcase, Globe, Linkedin, Building2 } from "lucide-react";

const mockFiles = [
  { name: "mert_ozdemir_cv.pdf", size: "1.2 MB" },
  { name: "selin_arslan_resume.pdf", size: "0.8 MB" },
];

const sources = [
  { id: "ik", label: "Doğrudan Başvuru", icon: Users, color: "blue" },
  { id: "referans", label: "Referans", icon: Users, color: "violet" },
  { id: "agency", label: "İşe Alım Firması", icon: Building2, color: "amber" },
  { id: "kariyer", label: "Kariyer Portalı", icon: Briefcase, color: "emerald" },
  { id: "sosyal", label: "Sosyal Medya", icon: Globe, color: "rose" },
];

const colorMap: Record<string, string> = {
  blue: "bg-blue-50 border-blue-200 text-blue-700",
  violet: "bg-violet-50 border-violet-200 text-violet-700",
  amber: "bg-amber-50 border-amber-200 text-amber-700",
  emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
  rose: "bg-rose-50 border-rose-200 text-rose-700",
};
const colorActiveMap: Record<string, string> = {
  blue: "bg-blue-600 border-blue-600 text-white",
  violet: "bg-violet-600 border-violet-600 text-white",
  amber: "bg-amber-500 border-amber-500 text-white",
  emerald: "bg-emerald-600 border-emerald-600 text-white",
  rose: "bg-rose-600 border-rose-600 text-white",
};

export function ExecutiveClean() {
  const [activeSource, setActiveSource] = useState("ik");
  const [hasFiles] = useState(true);

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 font-['Inter']">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl shadow-slate-200/80 border border-slate-100 overflow-hidden">

        {/* HEADER */}
        <div className="px-7 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-[17px] font-black text-[#0F172A] tracking-tight">Toplu Aday Ekle</h2>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">PDF veya DOCX CV dosyalarını yükleyin</p>
          </div>
          <button className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-7 space-y-6 max-h-[70vh] overflow-y-auto">

          {/* DROPZONE */}
          <div className="relative border-2 border-dashed border-blue-200 rounded-2xl p-8 bg-blue-50/40 hover:border-blue-400 hover:bg-blue-50/70 transition-all cursor-pointer group text-center">
            <div className={`w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-3 transition-all ${hasFiles ? 'bg-blue-600' : 'bg-white border border-slate-200 group-hover:border-blue-300'}`}>
              {hasFiles ? <Files className="w-6 h-6 text-white" /> : <Upload className="w-6 h-6 text-slate-400 group-hover:text-blue-500" />}
            </div>
            <p className="text-[13px] font-bold text-[#0F172A]">{hasFiles ? `${mockFiles.length} Dosya Seçildi` : 'Dosyaları Seçin veya Sürükleyin'}</p>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5">PDF, DOCX · Maksimum 30MB/dosya</p>
            {!hasFiles && (
              <button className="mt-4 text-[11px] font-bold text-blue-600 border border-blue-200 bg-white px-4 py-1.5 rounded-full hover:bg-blue-50 transition-colors">
                Dosya Seç
              </button>
            )}
          </div>

          {/* FILE LIST */}
          {hasFiles && (
            <div className="space-y-2">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">Yüklenecek Dosyalar</p>
              {mockFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl group hover:border-slate-200 transition-all">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-8 h-8 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-[#0F172A] truncate">{f.name}</p>
                      <p className="text-[9px] text-slate-400 font-medium">{f.size}</p>
                    </div>
                  </div>
                  <button className="w-7 h-7 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button className="w-full text-center text-[10px] font-bold text-blue-600 hover:underline py-1">+ Daha fazla dosya ekle</button>
            </div>
          )}

          {/* SOURCE SELECTION */}
          <div className="space-y-3">
            <p className="text-[11px] font-bold text-[#0F172A]">Aday Kaynağı <span className="text-red-400">*</span></p>
            <div className="grid grid-cols-3 gap-2">
              {sources.map((s) => {
                const isActive = activeSource === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSource(s.id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${isActive ? colorActiveMap[s.color] : colorMap[s.color] + ' hover:opacity-80'}`}
                  >
                    <s.icon className="w-4 h-4" />
                    <span className="text-[9px] font-bold leading-tight">{s.label}</span>
                  </button>
                );
              })}
            </div>
            {activeSource === "agency" && (
              <div className="animate-in slide-in-from-top-2 fade-in duration-200">
                <input
                  type="text"
                  placeholder="Firma adı (örn: Michael Page)"
                  className="w-full px-4 py-2.5 text-[12px] bg-slate-50 border border-slate-200 rounded-xl text-[#0F172A] placeholder-slate-300 focus:outline-none focus:border-blue-400 transition-colors"
                />
              </div>
            )}
            {activeSource === "sosyal" && (
              <div className="animate-in slide-in-from-top-2 fade-in duration-200">
                <input
                  type="text"
                  placeholder="Platform adı (örn: LinkedIn)"
                  className="w-full px-4 py-2.5 text-[12px] bg-slate-50 border border-slate-200 rounded-xl text-[#0F172A] placeholder-slate-300 focus:outline-none focus:border-blue-400 transition-colors"
                />
              </div>
            )}
          </div>

          {/* ANALYZE BUTTON */}
          <button className="w-full py-3.5 rounded-2xl bg-[#1E3A8A] hover:bg-blue-800 text-white font-bold text-[13px] transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/30 flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4" />
            AI ile Analiz Et ({mockFiles.length} Dosya)
          </button>

        </div>
      </div>
    </div>
  );
}
