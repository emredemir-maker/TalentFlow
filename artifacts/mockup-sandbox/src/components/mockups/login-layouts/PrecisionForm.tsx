import React, { useState } from 'react';
import { Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';
import './_group.css';

export default function PrecisionForm() {
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
    <div className="min-h-screen w-full flex flex-col md:flex-row overflow-hidden font-sans">
      
      {/* LEFT PANEL */}
      <div className="relative hidden md:flex flex-col w-[38%] p-10 lg:p-14 text-white overflow-hidden" 
           style={{ backgroundColor: '#060B17' }}>
        
        {/* Background Dot Grid */}
        <div 
          className="absolute inset-0 z-0 pointer-events-none" 
          style={{ 
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px)', 
            backgroundSize: '24px 24px' 
          }}
        />

        {/* Ambient Orb */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full z-0 pointer-events-none blur-[200px]"
             style={{ backgroundColor: '#06B6D4', opacity: 0.1 }} />

        {/* Thin Vertical Separator on left side (just a decorative line) */}
        <div className="absolute left-8 top-[20%] bottom-[20%] w-px z-0" 
             style={{ backgroundColor: 'rgba(255,255,255,0.05)' }} />

        <div className="relative z-10 flex flex-col h-full pl-6">
          {/* Logo Section */}
          <div className="mb-16">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg flex items-center justify-center shadow-lg"
                   style={{ background: 'linear-gradient(135deg, #0D9488 0%, #06B6D4 100%)' }}>
                <span className="text-xl font-bold text-white">TI</span>
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-wide text-white">Talent-Inn</h1>
                <p className="text-xs text-slate-400 mt-0.5">AI-Powered HR Platform</p>
              </div>
            </div>
          </div>

          {/* Hero Headline */}
          <div className="mb-14">
            <h2 className="text-[24px] text-white/70 font-normal leading-tight mb-1">
              İşe Alımın
            </h2>
            <h2 className="text-[48px] font-black leading-none mb-2" style={{ color: '#06B6D4' }}>
              Yapay Zeka
            </h2>
            <h2 className="text-[28px] text-white italic tracking-tight leading-tight">
              Mimarı.
            </h2>
          </div>

          {/* Features */}
          <div className="flex flex-col gap-4 mb-auto">
            {[
              "Nöral CV Ayrıştırma",
              "STAR Mülakat Analizi",
              "Bias Korumalı Değerlendirme",
              "Agentic İş Akışları"
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-1 h-1 rounded-full bg-cyan-500" />
                <span className="text-sm text-white/70">{feature}</span>
              </div>
            ))}
          </div>

          {/* Bottom Section */}
          <div className="mt-12">
            <div className="mb-4">
              <div className="text-[36px] font-black text-cyan-500 leading-none mb-1">
                %90
              </div>
              <div className="text-xs text-slate-400">
                Tahmin Doğruluğu
              </div>
            </div>
            
            {/* Progress Bar */}
            <div className="w-full bg-white/5 h-0.5 rounded-full mb-6 overflow-hidden">
              <div className="h-full bg-teal-500 w-[90%]" />
            </div>

            {/* Badges */}
            <div className="flex items-center gap-2">
              <div className="px-2 py-0.5 rounded-full bg-white/5 border border-white/20 text-[9px] text-white/80 uppercase tracking-wider">
                SOC 2 Uyumlu
              </div>
              <div className="px-2 py-0.5 rounded-full bg-white/5 border border-white/20 text-[9px] text-white/80 uppercase tracking-wider">
                AES-256 Şifreli
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="w-full md:w-[62%] bg-white flex flex-col relative overflow-y-auto">
        <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 min-h-full">
          
          {/* Logo outside card */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-8 h-8 rounded-md flex items-center justify-center mb-3"
                 style={{ background: 'linear-gradient(135deg, #0D9488 0%, #06B6D4 100%)' }}>
              <span className="text-sm font-bold text-white">TI</span>
            </div>
            <span className="text-[13px] font-semibold text-slate-900">Talent-Inn</span>
          </div>

          {/* Floating Form Card */}
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-[0_20px_40px_-15px_rgba(203,213,225,0.8)] border border-slate-100 p-8 md:p-10">
            <div className="mb-6 text-center">
              <h2 className="text-[22px] font-bold text-slate-900 mb-1.5">
                Hoş Geldiniz
              </h2>
              <p className="text-[13px] text-slate-500">
                Platforma erişmek için bilgilerinizi girin.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  E-posta Adresi
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Mail size={16} className="text-slate-400" />
                  </div>
                  <input 
                    type="email" 
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 outline-none transition-all focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 text-sm text-slate-900 placeholder:text-slate-400"
                    placeholder="ornek@sirket.com"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-700">
                    Şifre
                  </label>
                  <a href="#" className="text-[11px] font-medium text-cyan-500 hover:text-cyan-600 transition-colors">
                    Şifremi Unuttum &rarr;
                  </a>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Lock size={16} className="text-slate-400" />
                  </div>
                  <input 
                    type="password" 
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 outline-none transition-all focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 text-sm text-slate-900 placeholder:text-slate-400"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 bg-slate-900 text-white font-semibold text-sm py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    Sisteme Giriş Yap
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 mb-6 flex items-center justify-center relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100"></div>
              </div>
              <div className="relative bg-white px-3 text-xs text-slate-400">
                veya
              </div>
            </div>

            <button 
              type="button"
              className="w-full bg-white border border-slate-200 rounded-xl py-2.5 flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors text-sm text-slate-600 font-medium"
            >
              <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Google ile Devam Et
            </button>
          </div>

          <div className="mt-8 text-center">
            <span className="text-sm text-slate-500">Hesabınız yok mu? </span>
            <a href="#" className="text-sm text-cyan-500 font-medium hover:text-cyan-600 transition-colors">
              Kayıt olun &rarr;
            </a>
          </div>

        </div>
      </div>
    </div>
  );
}
