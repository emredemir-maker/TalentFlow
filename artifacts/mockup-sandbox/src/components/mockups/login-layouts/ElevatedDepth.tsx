import React, { useState } from 'react';
import { Mail, Lock, ArrowRight, Sparkles, Loader2, CheckCircle } from 'lucide-react';
import './_group.css';

export default function ElevatedDepth() {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row overflow-hidden font-sans bg-slate-50">
      
      {/* LEFT PANEL */}
      <div className="relative w-full md:w-[45%] flex flex-col justify-between p-8 md:p-12 lg:p-16 text-white overflow-hidden" 
           style={{ background: 'linear-gradient(135deg, #0B1120 0%, #1e1b4b 100%)' }}>
        
        {/* Glowing top border */}
        <div className="absolute top-0 left-0 w-full h-[1px]" 
             style={{ background: 'linear-gradient(90deg, transparent 0%, #06B6D4 50%, transparent 100%)' }}></div>

        {/* Subtle dot grid overlay */}
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
             style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>

        {/* Ambient orbs (3 instead of 2, more saturation) */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none mix-blend-screen opacity-40">
          <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] rounded-full bg-cyan-500 blur-[100px]"></div>
          <div className="absolute top-[40%] -right-[20%] w-[50%] h-[50%] rounded-full bg-indigo-600 blur-[100px]"></div>
          <div className="absolute -bottom-[10%] -left-[10%] w-[60%] h-[60%] rounded-full bg-violet-600 blur-[120px]"></div>
        </div>

        <div className="relative z-10 flex flex-col">
          {/* Header Area */}
          <div className="flex items-center gap-4 mb-16">
            <div className="w-[56px] h-[56px] rounded-2xl flex items-center justify-center shadow-2xl shadow-cyan-500/30"
                 style={{ background: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)' }}>
              <span className="text-2xl font-black tracking-tighter text-white">TI</span>
            </div>
            <div>
              <div className="text-xl font-bold tracking-tight text-white">Talent-Inn</div>
              <div className="text-sm font-medium text-slate-400">AI-Powered HR Platform</div>
            </div>
          </div>

          {/* Badge */}
          <div className="mb-8 self-start">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
                 style={{ border: '1px solid rgba(20, 184, 166, 0.3)', backgroundColor: 'rgba(20, 184, 166, 0.1)', color: '#2DD4BF' }}>
              <Sparkles size={14} />
              GELİŞMİŞ YETENEK KONTROL MERKEZİ
            </div>
          </div>

          {/* Typography */}
          <div className="mb-6">
            <h1 className="text-[48px] font-black tracking-tighter leading-[1.1] mb-2 text-white">
              İşe Alımın
              <br/>
              <span className="italic" style={{ color: '#06B6D4' }}>Yapay Zeka Mimarı</span>
            </h1>
            <p className="text-xl font-medium mt-4 text-slate-300">
              Veriden stratejiye. Adaydan yetkinliğe.
            </p>
          </div>

          {/* Feature List */}
          <div className="space-y-3 mt-8">
            {[
              "Nöral CV Ayrıştırma ve Eşleştirme",
              "Gerçek Zamanlı STAR Mülakat Analizi",
              "Bias Korumalı AI Değerlendirme",
              "Agentic İşe Alım İş Akışları"
            ].map((feature, idx) => (
              <div key={idx} className="flex items-center px-3 py-2 rounded-lg backdrop-blur-sm transition-all"
                   style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderLeft: '2px solid #14B8A6' }}>
                <CheckCircle size={16} className="text-teal-400 mr-3 opacity-70" />
                <span className="text-sm font-medium text-slate-200">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats Bar */}
        <div className="relative z-10 w-full mt-16 rounded-2xl border backdrop-blur-md p-6"
             style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
          <div className="grid grid-cols-3 divide-x divide-white/10">
            <div className="flex flex-col items-center justify-center text-center px-2">
              <div className="text-3xl font-black italic text-cyan-400 mb-1">3s</div>
              <div className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">CV ANALİZİ</div>
            </div>
            <div className="flex flex-col items-center justify-center text-center px-2">
              <div className="text-3xl font-black italic text-cyan-400 mb-1">%90</div>
              <div className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">TAHMİN SKORU</div>
            </div>
            <div className="flex flex-col items-center justify-center text-center px-2">
              <div className="text-3xl font-black italic text-cyan-400 mb-1">24/7</div>
              <div className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">AKILLI ASİSTAN</div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="w-full md:w-[55%] flex items-center justify-center p-8 md:p-12 lg:p-20 relative overflow-hidden" 
           style={{ backgroundColor: '#F1F5F9' }}>
        
        {/* Subtle top-right ambient cyan glow */}
        <div className="absolute top-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-cyan-400 blur-[120px] opacity-[0.06] pointer-events-none"></div>

        <div className="w-full max-w-md relative z-10">
          <div className="mb-10 text-center md:text-left">
            <h2 className="text-[28px] font-bold mb-2 text-slate-900">
              Hoş Geldiniz
            </h2>
            <p className="text-base text-slate-500">
              Platforma erişmek için bilgilerinizi girin.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">E-posta Adresi</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail size={18} className="text-slate-400 group-focus-within:text-cyan-500 transition-colors" />
                </div>
                <input 
                  type="email" 
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl border-2 border-[#CBD5E1] bg-white text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200 focus:border-cyan-500 focus:border-l-[4px] focus:shadow-sm"
                  placeholder="ornek@sirket.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-semibold text-slate-700">Şifre</label>
                <a href="#" className="text-xs font-bold text-cyan-600 hover:text-cyan-700 hover:underline transition-colors">Şifremi Unuttum</a>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock size={18} className="text-slate-400 group-focus-within:text-cyan-500 transition-colors" />
                </div>
                <input 
                  type="password" 
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl border-2 border-[#CBD5E1] bg-white text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200 focus:border-cyan-500 focus:border-l-[4px] focus:shadow-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full py-4 mt-6 rounded-full font-bold text-base tracking-wide flex items-center justify-center gap-2 transition-all duration-300 hover:shadow-xl hover:shadow-cyan-500/30 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
              style={{ 
                background: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)',
                color: '#FFFFFF'
              }}
            >
              {isLoading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <>
                  <ArrowRight size={20} />
                  Sisteme Giriş Yap
                </>
              )}
            </button>
          </form>

          <div className="mt-8 mb-8 relative flex items-center justify-center">
            <div className="absolute w-full h-px bg-slate-200"></div>
            <span className="relative px-4 text-sm font-medium text-slate-400 bg-[#F1F5F9]">
              veya
            </span>
          </div>

          <button 
            type="button"
            className="w-full py-3.5 rounded-full font-semibold text-sm flex items-center justify-center gap-3 transition-all duration-200 border-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:shadow-md hover:border-slate-300 active:scale-[0.98]"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Google ile Devam Et
          </button>

          <div className="mt-10 text-center">
            <a href="#" className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors">
              Hesabınız yok mu? <span className="text-cyan-600 font-bold hover:underline">Kayıt olun →</span>
            </a>
          </div>
        </div>
        
      </div>
      
    </div>
  );
}
