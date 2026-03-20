import { useState } from "react";
import { X, Upload, FileText, Trash2, Files, Sparkles, Users, Building2, Briefcase, Globe, ChevronRight, ChevronLeft } from "lucide-react";

const mockFiles = [
  { name: "mert_ozdemir_cv.pdf", size: "1.2 MB" },
  { name: "selin_arslan_resume.pdf", size: "0.8 MB" },
  { name: "burak_yildiz_cv.docx", size: "0.6 MB" },
];

const sources = [
  { id: "ik", label: "Doğrudan Başvuru", sub: "İç havuz / ik@sirket.com", icon: Users, color: "#3B82F6" },
  { id: "referans", label: "Çalışan Referansı", sub: "İç referans programı", icon: Users, color: "#8B5CF6" },
  { id: "agency", label: "İşe Alım Firması", sub: "Michael Page, Hays, vb.", icon: Building2, color: "#F59E0B" },
  { id: "kariyer", label: "Kariyer Portalı", sub: "Kariyer.net, Yenibiriş vb.", icon: Briefcase, color: "#10B981" },
  { id: "sosyal", label: "Sosyal Medya", sub: "LinkedIn, Twitter, vb.", icon: Globe, color: "#EC4899" },
];

const steps = ["Dosya Yükleme", "Kaynak Seçimi", "Onayla"];

export function StepWizard() {
  const [step, setStep] = useState(1);
  const [activeSource, setActiveSource] = useState("kariyer");

  return (
    <div className="min-h-screen bg-[#F0F4F8] flex items-center justify-center p-6 font-['Inter']">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden">

        {/* HEADER with step indicator */}
        <div className="px-7 pt-6 pb-0">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-[16px] font-black text-[#0F172A] tracking-tight">Aday Ekle</h2>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Adım {step} / {steps.length}</p>
            </div>
            <button className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* STEP PILLS */}
          <div className="flex items-center gap-2 pb-5 border-b border-slate-100">
            {steps.map((s, i) => {
              const idx = i + 1;
              const done = idx < step;
              const active = idx === step;
              return (
                <div key={i} className="flex items-center gap-2 flex-1">
                  <div className={`flex items-center gap-2 flex-1 ${i < steps.length - 1 ? '' : ''}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all shrink-0 ${done ? 'bg-emerald-500 text-white' : active ? 'bg-[#1E3A8A] text-white' : 'bg-slate-100 text-slate-400'}`}>
                      {done ? '✓' : idx}
                    </div>
                    <span className={`text-[10px] font-bold whitespace-nowrap ${active ? 'text-[#0F172A]' : done ? 'text-emerald-600' : 'text-slate-400'}`}>{s}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`flex-1 h-0.5 rounded-full mx-1 ${done ? 'bg-emerald-200' : 'bg-slate-100'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-7 max-h-[65vh] overflow-y-auto">

          {/* STEP 1: FILE UPLOAD */}
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in duration-300">
              <div className="border-2 border-dashed border-blue-200 rounded-2xl p-10 bg-blue-50/30 hover:border-blue-400 hover:bg-blue-50/60 transition-all cursor-pointer text-center group">
                <div className="w-14 h-14 mx-auto bg-white border border-slate-200 rounded-2xl flex items-center justify-center mb-4 group-hover:border-blue-300 transition-all shadow-sm">
                  <Upload className="w-7 h-7 text-slate-300 group-hover:text-blue-500 transition-colors" />
                </div>
                <p className="text-[14px] font-bold text-[#0F172A]">Dosyaları Sürükleyin veya Seçin</p>
                <p className="text-[11px] text-slate-400 mt-1">PDF ve DOCX · Maks. 30MB/dosya</p>
                <button className="mt-5 px-5 py-2 bg-[#1E3A8A] text-white text-[11px] font-bold rounded-full hover:bg-blue-800 transition-colors">
                  Dosya Seç
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">Seçili Dosyalar ({mockFiles.length})</p>
                {mockFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl group hover:border-blue-100 transition-all">
                    <div className="w-7 h-7 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-center shrink-0">
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-[#0F172A] truncate">{f.name}</p>
                      <p className="text-[9px] text-slate-400">{f.size}</p>
                    </div>
                    <button className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-all flex items-center justify-center">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2: SOURCE */}
          {step === 2 && (
            <div className="space-y-3 animate-in fade-in duration-300">
              <p className="text-[12px] font-semibold text-slate-500 mb-4">Bu adayları nereden buldunuz?</p>
              {sources.map((s) => {
                const isActive = activeSource === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSource(s.id)}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${isActive ? 'border-[#1E3A8A] bg-blue-50/50' : 'border-slate-100 bg-slate-50/50 hover:border-slate-200'}`}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: isActive ? s.color : '#F1F5F9' }}>
                      <s.icon className="w-4.5 h-4.5" style={{ color: isActive ? '#fff' : '#94A3B8' }} />
                    </div>
                    <div className="flex-1">
                      <p className={`text-[12px] font-bold ${isActive ? 'text-[#1E3A8A]' : 'text-[#0F172A]'}`}>{s.label}</p>
                      <p className="text-[9px] text-slate-400 font-medium mt-0.5">{s.sub}</p>
                    </div>
                    {isActive && (
                      <div className="w-5 h-5 rounded-full bg-[#1E3A8A] flex items-center justify-center shrink-0">
                        <span className="text-white text-[8px] font-black">✓</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* STEP 3: REVIEW */}
          {step === 3 && (
            <div className="space-y-5 animate-in fade-in duration-300">
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Dosyalar</span>
                  <span className="text-[11px] font-bold text-blue-600">{mockFiles.length} dosya</span>
                </div>
                <div className="space-y-1.5">
                  {mockFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="text-[11px] text-slate-700 font-medium truncate">{f.name}</span>
                      <span className="text-[9px] text-slate-400 ml-auto shrink-0">{f.size}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Kaynak</span>
                  <span className="text-[11px] font-bold text-[#0F172A]">{sources.find(s => s.id === activeSource)?.label}</span>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] font-bold text-blue-800">AI Analizi Başlayacak</p>
                  <p className="text-[10px] text-blue-600/80 mt-0.5">Her CV ayrıştırılacak, pozisyon eşleşmesi yapılacak ve otonom tarama gerçekleştirilecek.</p>
                </div>
              </div>

              <button className="w-full py-3.5 rounded-2xl bg-[#1E3A8A] hover:bg-blue-800 text-white font-bold text-[13px] transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4" />
                {mockFiles.length} Adayı Analiz Et
              </button>
            </div>
          )}
        </div>

        {/* FOOTER NAV */}
        <div className="px-7 py-4 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={() => setStep(s => Math.max(1, s - 1))}
            className={`flex items-center gap-1.5 text-[11px] font-bold transition-all ${step === 1 ? 'text-slate-200 cursor-not-allowed' : 'text-slate-500 hover:text-[#0F172A]'}`}
            disabled={step === 1}
          >
            <ChevronLeft className="w-4 h-4" />
            Geri
          </button>
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all ${i + 1 === step ? 'w-5 bg-[#1E3A8A]' : i + 1 < step ? 'w-3 bg-emerald-400' : 'w-3 bg-slate-200'}`} />
            ))}
          </div>
          {step < 3 ? (
            <button
              onClick={() => setStep(s => Math.min(3, s + 1))}
              className="flex items-center gap-1.5 text-[11px] font-bold text-[#1E3A8A] hover:text-blue-700 transition-all"
            >
              İleri
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-12" />
          )}
        </div>
      </div>
    </div>
  );
}
