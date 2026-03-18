import React, { useState } from 'react';
import { User, Mail, Lock, Sparkles, Loader2, AlertCircle, CheckCircle, Zap, Mic } from 'lucide-react';
import './_group.css';

export default function StackedBlocks() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSTTActive, setIsSTTActive] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 2000);
  };

  const handleGoogleLogin = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 1500);
  };

  const toggleSTT = () => {
    setIsSTTActive(!isSTTActive);
  };

  return (
    <div 
      className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6"
      style={{ background: 'linear-gradient(to bottom, #F0F4FF, #F8FAFC)' }}
    >
      <div className="w-full max-w-[440px] flex flex-col gap-8">
        
        {/* BLOCK 1: Brand Header */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between bg-white rounded-xl p-3 shadow-sm border" style={{ borderColor: '#E2E8F0' }}>
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-inner"
                style={{ background: 'linear-gradient(135deg, #06B6D4, #3B82F6)' }}
              >
                TF
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-black tracking-widest text-slate-800 leading-none">TALENT</span>
                <span className="text-xs font-bold tracking-widest text-slate-500 leading-none" style={{ color: '#06B6D4' }}>FLOW</span>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-[10px] font-semibold text-emerald-700 tracking-wider">SİSTEM AKTİF</span>
            </div>
          </div>
        </section>

        {/* BLOCK 2: Credentials Block */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[10px] font-bold tracking-[0.2em]" style={{ color: '#94A3B8' }}>OTURUM AÇMA</h2>
            <div className="h-px flex-1 ml-4" style={{ backgroundColor: '#E2E8F0' }}></div>
          </div>
          
          <div 
            className="bg-white rounded-2xl p-6 shadow-md border relative overflow-hidden" 
            style={{ borderColor: '#E2E8F0' }}
          >
            {/* Subtle top accent */}
            <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'linear-gradient(to right, #06B6D4, #3B82F6)' }}></div>
            
            <form onSubmit={handleLogin} className="flex flex-col gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold" style={{ color: '#1E293B' }}>Görünen Ad</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-4 w-4" style={{ color: '#94A3B8' }} />
                  </div>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-50"
                    style={{ borderColor: '#E2E8F0', color: '#1E293B' }}
                    placeholder="Adınız Soyadınız"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold" style={{ color: '#1E293B' }}>Erişim Sinyali (E-posta)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-4 w-4" style={{ color: '#94A3B8' }} />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-50"
                    style={{ borderColor: '#E2E8F0', color: '#1E293B' }}
                    placeholder="ornek@sirket.com"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold" style={{ color: '#1E293B' }}>Güvenlik Anahtarı (Şifre)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4" style={{ color: '#94A3B8' }} />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-50"
                    style={{ borderColor: '#E2E8F0', color: '#1E293B' }}
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 mt-2 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(to right, #0F172A, #1E293B)' }}
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    SİSTEME GİRİŞ YAP <Sparkles className="h-4 w-4" style={{ color: '#06B6D4' }} />
                  </>
                )}
              </button>
            </form>
          </div>
        </section>

        {/* BLOCK 3: SSO Strip */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[10px] font-bold tracking-[0.2em]" style={{ color: '#94A3B8' }}>KİMLİK DOĞRULAMA</h2>
            <div className="h-px flex-1 ml-4" style={{ backgroundColor: '#E2E8F0' }}></div>
          </div>
          
          <div className="flex flex-col gap-4">
            <div className="rounded-xl p-4 border" style={{ backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }}>
              <div className="text-center mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800">
                  Güvenli Kimlik Doğrulama
                </span>
              </div>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white border rounded-lg shadow-sm text-sm font-semibold transition-all hover:bg-slate-50 hover:shadow active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                style={{ borderColor: '#E2E8F0', color: '#1E293B' }}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Google Nexus ile Doğrula
              </button>
            </div>
            
            <div className="text-center">
              <a href="#" className="text-xs font-semibold hover:underline" style={{ color: '#06B6D4' }}>
                Kayıtlı Değil Misiniz? Hesap Oluşturun
              </a>
            </div>
          </div>
        </section>

        {/* BLOCK 4: Diagnostics Panel */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[10px] font-bold tracking-[0.2em]" style={{ color: '#94A3B8' }}>SİSTEM</h2>
            <div className="h-px flex-1 ml-4" style={{ backgroundColor: '#E2E8F0' }}></div>
          </div>

          <div 
            className="rounded-xl border shadow-lg overflow-hidden flex flex-col" 
            style={{ backgroundColor: '#0F172A', borderColor: '#1E293B' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4" style={{ color: '#06B6D4' }} />
                <span className="text-xs font-bold text-white uppercase tracking-wider">Sistem Tanılama</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] font-bold text-emerald-400">ÇALIŞIYOR</span>
              </div>
            </div>
            
            <div className="p-4" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium" style={{ color: '#94A3B8' }}>STT Ses Testi</span>
                  <button 
                    onClick={toggleSTT}
                    className={`p-2 rounded-full transition-all ${isSTTActive ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'}`}
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="h-12 w-full rounded border bg-slate-900 flex items-center justify-center overflow-hidden relative" style={{ borderColor: '#1E293B' }}>
                  {isSTTActive ? (
                    <div className="flex items-center gap-1 h-4">
                      <div className="w-1 bg-red-400 h-full animate-[pulse_1s_ease-in-out_infinite]"></div>
                      <div className="w-1 bg-red-400 h-2/3 animate-[pulse_1.2s_ease-in-out_infinite_0.2s]"></div>
                      <div className="w-1 bg-red-400 h-1/2 animate-[pulse_0.8s_ease-in-out_infinite_0.4s]"></div>
                      <div className="w-1 bg-red-400 h-4/5 animate-[pulse_1.5s_ease-in-out_infinite_0.1s]"></div>
                      <div className="w-1 bg-red-400 h-1/3 animate-[pulse_1.1s_ease-in-out_infinite_0.3s]"></div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-600">
                      <AlertCircle className="w-3 h-3" />
                      <span className="text-[10px] font-medium uppercase tracking-wider">SİNYAL BEKLENİYOR</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="px-4 py-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)', backgroundColor: '#0F172A' }}>
              <p className="text-[10px] font-mono text-center" style={{ color: '#475569' }}>
                Nöral Motor Dağıtımı: Kararlı v2.4.0
              </p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
