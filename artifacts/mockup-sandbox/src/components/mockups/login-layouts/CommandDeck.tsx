import React, { useState } from 'react';
import './_group.css';
import { User, Mail, Lock, Loader2, Zap, Mic, Terminal, Activity, ArrowRight } from 'lucide-react';

export default function CommandDeck() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSTTActive, setIsSTTActive] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 2000);
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden font-mono"
      style={{ 
        backgroundColor: '#0A0F1E',
        backgroundImage: 'linear-gradient(rgba(6, 182, 212, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(6, 182, 212, 0.03) 1px, transparent 1px)',
        backgroundSize: '24px 24px'
      }}
    >
      {/* Scanline overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-10" style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, #000 2px, #000 4px)' }}></div>
      
      {/* Central Panel */}
      <div 
        className="w-full max-w-[480px] rounded-sm relative z-10 shadow-2xl flex flex-col"
        style={{ 
          backgroundColor: '#111827', 
          borderLeft: '4px solid #06B6D4',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 20px rgba(6, 182, 212, 0.1)'
        }}
      >
        {/* Header / Logo Area */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-800/60">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
               style={{ background: 'linear-gradient(135deg, #06B6D4, #3B82F6)', color: '#0A0F1E' }}>
            TF
          </div>
          <div className="flex flex-col leading-none tracking-widest text-[#06B6D4]">
            <span className="text-xs font-bold uppercase">TALENT</span>
            <span className="text-xs font-bold uppercase opacity-80">FLOW</span>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
            <Activity size={14} className="text-[#06B6D4] opacity-50" />
            <span>SECURE.LINK</span>
          </div>
        </div>

        {/* Form Area */}
        <div className="px-6 py-5 flex flex-col gap-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {/* Name Field */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold flex items-center justify-between">
                <span>Görünen Ad</span>
                <span className="text-gray-600">REQ</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-500">
                  <User size={14} />
                </div>
                <input 
                  type="text" 
                  placeholder="Kullanıcı Adı"
                  className="w-full pl-9 pr-3 h-10 text-sm text-gray-200 bg-[#1F2937] border border-gray-700 rounded-sm focus:outline-none focus:border-[#06B6D4] focus:ring-1 focus:ring-[#06B6D4] transition-all placeholder-gray-600"
                />
              </div>
            </div>

            {/* Email Field */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold flex items-center justify-between">
                <span>Erişim Sinyali (E-posta)</span>
                <span className="text-gray-600">REQ</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-500">
                  <Mail size={14} />
                </div>
                <input 
                  type="email" 
                  placeholder="isim@sistem.com"
                  className="w-full pl-9 pr-3 h-10 text-sm text-gray-200 bg-[#1F2937] border border-gray-700 rounded-sm focus:outline-none focus:border-[#06B6D4] focus:ring-1 focus:ring-[#06B6D4] transition-all placeholder-gray-600"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold flex items-center justify-between">
                <span>Güvenlik Anahtarı (Şifre)</span>
                <span className="text-gray-600">REQ</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-500">
                  <Lock size={14} />
                </div>
                <input 
                  type="password" 
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 h-10 text-sm text-gray-200 bg-[#1F2937] border border-gray-700 rounded-sm focus:outline-none focus:border-[#06B6D4] focus:ring-1 focus:ring-[#06B6D4] transition-all placeholder-gray-600"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button 
              type="submit"
              disabled={isLoading}
              className="w-full h-10 mt-2 flex items-center justify-center gap-2 rounded-sm text-sm font-bold uppercase tracking-wider text-[#0A0F1E] hover:bg-[#22D3EE] transition-colors relative overflow-hidden group"
              style={{ backgroundColor: '#06B6D4' }}
            >
              {isLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  <span>SİSTEME GİRİŞ YAP ✦</span>
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-1 opacity-50">
            <div className="h-px flex-1 bg-gray-700"></div>
            <span className="text-[10px] uppercase text-gray-400 whitespace-nowrap">Güvenli Kimlik Doğrulama</span>
            <div className="h-px flex-1 bg-gray-700"></div>
          </div>

          {/* SSO Section */}
          <button 
            type="button"
            className="w-full h-10 flex items-center justify-center gap-2 rounded-sm text-sm text-gray-300 bg-[#1F2937] border border-gray-700 hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4 opacity-80" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span className="text-xs tracking-wide uppercase">Google Nexus ile Doğrula</span>
          </button>

          {/* Register Link */}
          <div className="flex justify-end mt-1">
            <button className="text-[10px] text-gray-500 hover:text-[#06B6D4] transition-colors uppercase tracking-wider flex items-center gap-1">
              Kayıtlı Değil Misiniz? Hesap Oluşturun <ArrowRight size={10} />
            </button>
          </div>
        </div>

        {/* STT Diagnostics Panel */}
        <div className="bg-[#0A0F1E]/80 border-t border-gray-800/60 p-4 mt-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-[#06B6D4]">
              <Terminal size={12} />
              <span className="text-[10px] uppercase font-bold tracking-wider">Sistem Tanılama</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              <span className="text-[9px] text-green-500 uppercase tracking-widest">ÇALIŞIYOR</span>
            </div>
          </div>
          
          <div className="bg-[#050810] border border-gray-800 rounded-sm p-3 flex items-start gap-3">
            <button 
              type="button"
              onClick={() => setIsSTTActive(!isSTTActive)}
              className={`w-8 h-8 rounded flex items-center justify-center shrink-0 transition-all ${isSTTActive ? 'bg-[#06B6D4] text-[#0A0F1E]' : 'bg-[#1F2937] text-gray-400 hover:text-[#06B6D4]'}`}
            >
              <Mic size={14} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-gray-500 mb-1 flex items-center gap-1">
                <Zap size={10} className={isSTTActive ? 'text-[#06B6D4]' : ''} />
                <span className="uppercase">STT MODÜLÜ AKTİF</span>
              </div>
              <div className="text-xs text-gray-300 h-4 truncate">
                {isSTTActive ? (
                  <span className="flex items-center gap-1">
                    Dinleniyor<span className="flex gap-0.5"><span className="animate-bounce">.</span><span className="animate-bounce" style={{animationDelay: '0.1s'}}>.</span><span className="animate-bounce" style={{animationDelay: '0.2s'}}>.</span></span>
                  </span>
                ) : (
                  <span className="opacity-50 font-mono text-[10px]">Beklemede_</span>
                )}
              </div>
            </div>
          </div>
          
          <div className="mt-3 flex items-center justify-between text-[8px] text-gray-600 uppercase tracking-widest">
            <span>Nöral Motor Dağıtımı: Kararlı v2.4.0</span>
            <span>OK</span>
          </div>
        </div>
      </div>
    </div>
  );
}