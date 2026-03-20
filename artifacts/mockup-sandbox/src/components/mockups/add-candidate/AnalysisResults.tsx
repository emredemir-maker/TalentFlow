import { Check, X, Sparkles, ChevronRight, Users, Loader2 } from "lucide-react";

const results = [
  {
    success: true,
    name: "Mert Özdemir",
    position: "Senior Frontend Developer",
    file: "mert_ozdemir_cv.pdf",
    score: 94,
    matchTitle: "Senior Frontend Developer",
    insight: "5 yıl React deneyimi, TypeScript ve sistem tasarımı konusunda güçlü profil.",
    skills: ["React", "TypeScript", "Node.js"],
  },
  {
    success: true,
    name: "Selin Arslan",
    position: "UX Designer",
    file: "selin_arslan_resume.pdf",
    score: 88,
    matchTitle: "UX Designer",
    insight: "Figma ve kullanıcı araştırması konularında 4 yıllık deneyim.",
    skills: ["Figma", "User Research", "Prototyping"],
  },
  {
    success: true,
    name: "Burak Yıldız",
    position: "Data Scientist",
    file: "burak_yildiz_cv.docx",
    score: 76,
    matchTitle: "Data Scientist",
    insight: "Python ve makine öğrenmesi portföyü mevcut, doktora öğrencisi.",
    skills: ["Python", "ML", "SQL"],
  },
  {
    success: false,
    name: null,
    position: null,
    file: "eski_cv_taranmis.pdf",
    score: 0,
    matchTitle: null,
    insight: null,
    skills: [],
    error: "Dosya içeriği okunamadı veya çok kısaydı.",
  },
];

function ScoreRing({ score }: { score: number }) {
  const color = score >= 85 ? "#10B981" : score >= 70 ? "#3B82F6" : "#F59E0B";
  return (
    <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="20" fill="none" stroke="#F1F5F9" strokeWidth="4" />
        <circle
          cx="24" cy="24" r="20" fill="none"
          stroke={color} strokeWidth="4"
          strokeDasharray={`${(score / 100) * 125.6} 125.6`}
          strokeLinecap="round"
        />
      </svg>
      <span className="text-[11px] font-black" style={{ color }}>%{score}</span>
    </div>
  );
}

export function AnalysisResults() {
  return (
    <div className="min-h-screen bg-[#F0F4F8] flex items-center justify-center p-6 font-['Inter']">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden">

        {/* HEADER */}
        <div className="px-7 py-5 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[16px] font-black text-[#0F172A]">Analiz Tamamlandı</h2>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                <span className="text-emerald-600 font-bold">{results.filter(r => r.success).length} başarılı</span> · {results.filter(r => !r.success).length} hatalı · {results.length} toplam
              </p>
            </div>
            <div className="w-10 h-10 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center">
              <Check className="w-5 h-5 text-emerald-600" strokeWidth={3} />
            </div>
          </div>

          {/* SUMMARY BAR */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              { label: "Ort. Uyum Skoru", value: `%${Math.round(results.filter(r => r.success).reduce((a, r) => a + r.score, 0) / results.filter(r => r.success).length)}`, color: "blue" },
              { label: "AI Tarama", value: "Tamamlandı", color: "emerald" },
              { label: "Kaydedilecek", value: `${results.filter(r => r.success).length} Aday`, color: "violet" },
            ].map((s, i) => (
              <div key={i} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-center">
                <div className={`text-[12px] font-black ${s.color === 'blue' ? 'text-blue-700' : s.color === 'emerald' ? 'text-emerald-600' : 'text-violet-700'}`}>{s.value}</div>
                <div className="text-[8px] text-slate-400 font-medium mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-7 space-y-3 max-h-[55vh] overflow-y-auto">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">Sonuçlar</p>

          {results.map((res, i) => (
            <div key={i} className={`rounded-2xl border p-4 ${res.success ? 'bg-white border-slate-100 hover:border-slate-200' : 'bg-red-50/50 border-red-100'} transition-all`}>
              {res.success ? (
                <div className="flex items-start gap-4">
                  <ScoreRing score={res.score} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-bold text-[#0F172A]">{res.name}</p>
                        <p className="text-[10px] text-slate-500 font-medium">{res.position}</p>
                      </div>
                      <div className="shrink-0">
                        <span className="inline-flex items-center gap-1 text-[8px] font-black px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full">
                          <Sparkles className="w-2.5 h-2.5" />Otonom Tarama ✓
                        </span>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">{res.insight}</p>

                    <div className="flex items-center gap-1.5 mt-2.5">
                      {res.skills.map((sk, si) => (
                        <span key={si} className="text-[8px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">{sk}</span>
                      ))}
                      <div className="ml-auto text-[9px] font-bold text-emerald-600 flex items-center gap-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                        {res.matchTitle}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-red-100 border border-red-200 rounded-xl flex items-center justify-center shrink-0">
                    <X className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-red-700 truncate">{res.file}</p>
                    <p className="text-[9px] text-red-400 font-medium mt-0.5">{res.error}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* FOOTER ACTIONS */}
        <div className="px-7 py-4 border-t border-slate-100 flex items-center gap-3">
          <button className="flex-1 py-3 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[12px] font-bold text-slate-600 transition-all">
            Geri Dön
          </button>
          <button className="flex-[2] py-3 rounded-2xl bg-[#1E3A8A] hover:bg-blue-800 text-white text-[12px] font-bold transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2">
            <Users className="w-4 h-4" />
            {results.filter(r => r.success).length} Adayı Havuza Ekle
          </button>
        </div>
      </div>
    </div>
  );
}
