import React, { useState, useEffect } from 'react';
import { User, Mail, Lock, Sparkles, Loader2, AlertCircle, CheckCircle, Zap, Mic } from 'lucide-react';
import './_group.css';

export default function SplitScreen() {
  const [isLoading, setIsLoading] = useState(false);
  const [sttStatus, setSttStatus] = useState<'idle' | 'listening' | 'success'>('idle');
  const [formData, setFormData] = useState({
    name: '',
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

  const handleSttTest = () => {
    if (sttStatus === 'listening') return;
    setSttStatus('listening');
    setTimeout(() => {
      setSttStatus('success');
      setTimeout(() => setSttStatus('idle'), 3000);
    }, 2000);
  };

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row overflow-hidden font-sans">
      
      {/* LEFT PANEL */}
      <div className="relative w-full md:w-[45%] flex flex-col justify-between p-8 md:p-12 lg:p-16 text-white" 
           style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1e1b4b 100%)' }}>
        
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
          <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-500 blur-[120px]"></div>
          <div className="absolute top-[60%] -right-[10%] w-[60%] h-[60%] rounded-full bg-indigo-500 blur-[120px]"></div>
        </div>

        <div className="relative z-10 flex flex-col items-center md:items-start pt-10">
          {/* Logo */}
          <div className="flex flex-col items-center md:items-start mb-8">
            <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-2xl shadow-cyan-500/20"
                 style={{ background: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)' }}>
              <span className="text-4xl font-black tracking-tighter text-white">TF</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-none mb-2" 
                style={{ color: '#FFFFFF' }}>
              TALENT
              <br/>
              <span style={{ color: '#06B6D4' }}>FLOW</span>
            </h1>
            <p className="text-lg md:text-xl font-medium mt-4" style={{ color: '#94A3B8' }}>
              Yapay Zeka Destekli İK Platformu
            </p>
          </div>
        </div>

        {/* STT Diagnostics Panel at bottom left */}
        <div className="relative z-10 w-full max-w-md mt-12 rounded-xl border p-5 backdrop-blur-md"
             style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', borderColor: 'rgba(226, 232, 240, 0.1)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap size={18} style={{ color: '#06B6D4' }} />
              <h3 className="font-semibold text-sm tracking-wide" style={{ color: '#F8FAFC' }}>Sistem Tanılama</h3>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium"
                 style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10B981', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              ÇALIŞIYOR
            </div>
          </div>

          <div className="rounded-lg p-4 mb-3 border"
               style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderColor: 'rgba(226, 232, 240, 0.05)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${sttStatus === 'listening' ? 'scale-110' : ''}`}
                     style={{ 
                       backgroundColor: sttStatus === 'listening' ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                       color: sttStatus === 'listening' ? '#06B6D4' : '#94A3B8'
                     }}>
                  <Mic size={18} className={sttStatus === 'listening' ? 'animate-pulse' : ''} />
                </div>
                <div>
                  <div className="text-sm font-medium" style={{ color: '#E2E8F0' }}>STT Ses Motoru Testi</div>
                  <div className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                    {sttStatus === 'idle' && 'Mikrofon testini başlatın'}
                    {sttStatus === 'listening' && 'Ses dinleniyor...'}
                    {sttStatus === 'success' && 'Ses başarıyla algılandı'}
                  </div>
                </div>
              </div>
              <button 
                onClick={handleSttTest}
                disabled={sttStatus === 'listening'}
                className="text-xs px-3 py-1.5 rounded-md font-medium transition-colors"
                style={{ 
                  backgroundColor: sttStatus === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.1)',
                  color: sttStatus === 'success' ? '#10B981' : '#F8FAFC'
                }}
              >
                {sttStatus === 'idle' && 'Test Et'}
                {sttStatus === 'listening' && <Loader2 size={14} className="animate-spin" />}
                {sttStatus === 'success' && <CheckCircle size={14} />}
              </button>
            </div>
            
            {/* Visualizer bars */}
            <div className="flex items-center gap-1 mt-4 h-6 px-1">
              {[...Array(12)].map((_, i) => (
                <div 
                  key={i} 
                  className="w-full rounded-full transition-all duration-150"
                  style={{ 
                    backgroundColor: sttStatus === 'listening' ? '#06B6D4' : 'rgba(255, 255, 255, 0.1)',
                    height: sttStatus === 'listening' ? `${Math.max(20, Math.random() * 100)}%` : '20%',
                    opacity: sttStatus === 'listening' ? 0.7 + (Math.random() * 0.3) : 0.5
                  }}
                />
              ))}
            </div>
          </div>

          <div className="text-xs text-center" style={{ color: '#64748B' }}>
            Nöral Motor Dağıtımı: Kararlı v2.4.0
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="w-full md:w-[55%] flex items-center justify-center p-8 md:p-12 lg:p-20 relative" 
           style={{ backgroundColor: '#F8FAFC' }}>
        
        <div className="w-full max-w-md">
          <div className="mb-10 text-center md:text-left">
            <h2 className="text-2xl md:text-3xl font-bold mb-2" style={{ color: '#1E293B' }}>
              Hoş Geldiniz
            </h2>
            <p className="text-sm md:text-base" style={{ color: '#475569' }}>
              Platforma erişmek için bilgilerinizi girin
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: '#1E293B' }}>Görünen Ad</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <User size={18} style={{ color: '#94A3B8' }} />
                </div>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full pl-10 pr-4 py-3 rounded-lg border outline-none transition-all duration-200 focus:ring-2"
                  style={{ 
                    backgroundColor: '#FFFFFF', 
                    borderColor: '#E2E8F0',
                    color: '#1E293B'
                  }}
                  placeholder="Adınız Soyadınız"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: '#1E293B' }}>Erişim Sinyali (E-posta)</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail size={18} style={{ color: '#94A3B8' }} />
                </div>
                <input 
                  type="email" 
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full pl-10 pr-4 py-3 rounded-lg border outline-none transition-all duration-200 focus:ring-2"
                  style={{ 
                    backgroundColor: '#FFFFFF', 
                    borderColor: '#E2E8F0',
                    color: '#1E293B'
                  }}
                  placeholder="ornek@sirket.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium flex justify-between" style={{ color: '#1E293B' }}>
                <span>Güvenlik Anahtarı (Şifre)</span>
                <a href="#" className="text-xs font-semibold hover:underline" style={{ color: '#06B6D4' }}>Şifremi Unuttum</a>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock size={18} style={{ color: '#94A3B8' }} />
                </div>
                <input 
                  type="password" 
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="w-full pl-10 pr-4 py-3 rounded-lg border outline-none transition-all duration-200 focus:ring-2"
                  style={{ 
                    backgroundColor: '#FFFFFF', 
                    borderColor: '#E2E8F0',
                    color: '#1E293B'
                  }}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 mt-4 rounded-lg font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-all hover:shadow-lg hover:shadow-cyan-500/20 active:scale-[0.98]"
              style={{ 
                background: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)',
                color: '#FFFFFF'
              }}
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  SİSTEME GİRİŞ YAP ✦
                </>
              )}
            </button>
          </form>

          <div className="mt-8 mb-8 relative flex items-center justify-center">
            <div className="absolute w-full h-px" style={{ backgroundColor: '#E2E8F0' }}></div>
            <span className="relative px-4 text-xs font-medium uppercase tracking-wider" 
                  style={{ backgroundColor: '#F8FAFC', color: '#94A3B8' }}>
              Güvenli Kimlik Doğrulama
            </span>
          </div>

          <button 
            type="button"
            className="w-full py-3 rounded-lg font-medium text-sm flex items-center justify-center gap-3 transition-colors border hover:bg-slate-50 active:scale-[0.98]"
            style={{ 
              backgroundColor: '#FFFFFF',
              borderColor: '#E2E8F0',
              color: '#1E293B'
            }}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Google Nexus ile Doğrula
          </button>

          <div className="mt-8 text-center">
            <a href="#" className="text-sm font-medium hover:underline" style={{ color: '#475569' }}>
              Kayıtlı Değil Misiniz? <span style={{ color: '#06B6D4' }}>Hesap Oluşturun</span>
            </a>
          </div>
        </div>
        
      </div>
      
    </div>
  );
}
