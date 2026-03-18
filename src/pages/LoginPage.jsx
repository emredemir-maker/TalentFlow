// src/pages/LoginPage.jsx
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogIn, AlertCircle, CheckCircle, Loader2, User, Mail, Lock, Zap, Mic, Terminal, Activity, ArrowRight } from 'lucide-react';
import Logo from '../components/Logo';

export default function LoginPage() {
    const { loginWithGoogle, loginWithEmail, registerWithEmail, loading, error } = useAuth();

    const [mode, setMode] = useState('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [success, setSuccess] = useState(null);

    // STT Diagnostic States
    const [isMicActive, setIsMicActive] = useState(false);
    const [sttResult, setSttResult] = useState('');
    const mediaRecorderRef = useRef(null);
    const sttIntervalRef = useRef(null);

    const toggleSttTest = async () => {
        if (isMicActive) {
            if (sttIntervalRef.current) clearInterval(sttIntervalRef.current);
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
            setIsMicActive(false);
            setSttResult('');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.onstop = async () => {
                const chunks = mediaRecorder.audioChunks || [];
                if (chunks.length === 0) return;
                const blob = new Blob(chunks, { type: 'audio/webm' });
                mediaRecorder.audioChunks = [];
                if (blob.size < 2000) return;
                const formData = new FormData();
                formData.append('audio', blob, 'test.webm');
                try {
                    const serverUrl = import.meta.env.VITE_SERVER_URL || '';
                    const res = await fetch(`${serverUrl}/api/gemini-stt`, { method: 'POST', body: formData });
                    const data = await res.json();
                    if (data.text) setSttResult(data.text);
                } catch (e) {
                    console.error("STT Test failed", e);
                }
            };

            mediaRecorder.ondataavailable = (e) => {
                if (!mediaRecorder.audioChunks) mediaRecorder.audioChunks = [];
                mediaRecorder.audioChunks.push(e.data);
            };

            mediaRecorder.start();
            setIsMicActive(true);

            sttIntervalRef.current = setInterval(() => {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                    mediaRecorderRef.current.stop();
                    mediaRecorderRef.current.start();
                }
            }, 4000);
        } catch (err) {
            alert("Mikrofon erişimi engellendi veya cihaz bulunamadı.");
        }
    };

    useEffect(() => {
        return () => {
            if (sttIntervalRef.current) clearInterval(sttIntervalRef.current);
        };
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const inviteEmail = params.get('invite');
        if (inviteEmail) {
            setEmail(inviteEmail);
            setMode('register');
        }
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (mode === 'login') {
                await loginWithEmail(email, password);
            } else {
                await registerWithEmail(email, password, name);
                setSuccess("Kayıt başarılı! Sisteme erişim sağlanıyor...");
            }
        } catch {}
    };

    return (
        <div
            className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
            style={{
                backgroundColor: '#0A0F1E',
                backgroundImage: 'linear-gradient(rgba(6, 182, 212, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(6, 182, 212, 0.03) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
                fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
            }}
        >
            {/* Scanline overlay */}
            <div
                className="absolute inset-0 pointer-events-none opacity-[0.06]"
                style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, #000 2px, #000 4px)' }}
            />

            {/* Ambient glow */}
            <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.06) 0%, transparent 70%)'}} />
            <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)' }} />

            {/* Central Panel */}
            <div
                className="w-full max-w-[480px] rounded-sm relative z-10 flex flex-col"
                style={{
                    backgroundColor: '#111827',
                    borderLeft: '4px solid #06B6D4',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 20px rgba(6, 182, 212, 0.1)'
                }}
            >
                {/* Header / Logo */}
                <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-800/60">
                    <Logo size={32} showText={false} />
                    <div className="flex flex-col leading-none tracking-widest" style={{ color: '#06B6D4' }}>
                        <span className="text-xs font-black uppercase">TALENT</span>
                        <span className="text-xs font-black uppercase opacity-80">FLOW</span>
                    </div>
                    <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
                        <Activity size={14} className="text-cyan-500 opacity-50" />
                        <span className="uppercase tracking-wider text-[10px]">SECURE.LINK</span>
                    </div>
                </div>

                {/* Alerts */}
                {error && (
                    <div className="mx-6 mt-4 flex items-start gap-2 p-3 rounded-sm text-xs" style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171' }}>
                        <AlertCircle size={14} className="shrink-0 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}
                {success && (
                    <div className="mx-6 mt-4 flex items-start gap-2 p-3 rounded-sm text-xs" style={{ backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#34D399' }}>
                        <CheckCircle size={14} className="shrink-0 mt-0.5" />
                        <span>{success}</span>
                    </div>
                )}

                {/* Form Area */}
                <div className="px-6 py-5 flex flex-col gap-4">
                    <form onSubmit={handleSubmit} className="flex flex-col gap-3">

                        {/* Name field — only for register */}
                        {mode === 'register' && (
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] uppercase tracking-wider font-semibold flex items-center justify-between" style={{ color: '#9CA3AF' }}>
                                    <span>Görünen Ad</span>
                                    <span className="text-gray-600">REQ</span>
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-500">
                                        <User size={14} />
                                    </div>
                                    <input
                                        type="text"
                                        required
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Ad Soyad"
                                        className="w-full pl-9 pr-3 h-10 text-sm rounded-sm focus:outline-none transition-all placeholder-gray-600"
                                        style={{ backgroundColor: '#1F2937', border: '1px solid #374151', color: '#E5E7EB' }}
                                        onFocus={e => { e.target.style.borderColor = '#06B6D4'; e.target.style.boxShadow = '0 0 0 1px #06B6D4'; }}
                                        onBlur={e => { e.target.style.borderColor = '#374151'; e.target.style.boxShadow = 'none'; }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Email Field */}
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] uppercase tracking-wider font-semibold flex items-center justify-between" style={{ color: '#9CA3AF' }}>
                                <span>Erişim Sinyali (E-posta)</span>
                                <span className="text-gray-600">REQ</span>
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-500">
                                    <Mail size={14} />
                                </div>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="isim@sistem.com"
                                    className="w-full pl-9 pr-3 h-10 text-sm rounded-sm focus:outline-none transition-all placeholder-gray-600"
                                    style={{ backgroundColor: '#1F2937', border: '1px solid #374151', color: '#E5E7EB' }}
                                    onFocus={e => { e.target.style.borderColor = '#06B6D4'; e.target.style.boxShadow = '0 0 0 1px #06B6D4'; }}
                                    onBlur={e => { e.target.style.borderColor = '#374151'; e.target.style.boxShadow = 'none'; }}
                                />
                            </div>
                        </div>

                        {/* Password Field */}
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] uppercase tracking-wider font-semibold flex items-center justify-between" style={{ color: '#9CA3AF' }}>
                                <span>Güvenlik Anahtarı (Şifre)</span>
                                <span className="text-gray-600">REQ</span>
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-500">
                                    <Lock size={14} />
                                </div>
                                <input
                                    type="password"
                                    required
                                    minLength={6}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full pl-9 pr-3 h-10 text-sm rounded-sm focus:outline-none transition-all placeholder-gray-600"
                                    style={{ backgroundColor: '#1F2937', border: '1px solid #374151', color: '#E5E7EB' }}
                                    onFocus={e => { e.target.style.borderColor = '#06B6D4'; e.target.style.boxShadow = '0 0 0 1px #06B6D4'; }}
                                    onBlur={e => { e.target.style.borderColor = '#374151'; e.target.style.boxShadow = 'none'; }}
                                />
                            </div>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full h-10 mt-2 flex items-center justify-center gap-2 rounded-sm text-sm font-black uppercase tracking-wider transition-colors relative overflow-hidden group"
                            style={{ backgroundColor: '#06B6D4', color: '#0A0F1E' }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#22D3EE'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#06B6D4'}
                        >
                            {loading ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <>
                                    <span>{mode === 'login' ? 'SİSTEME GİRİŞ YAP ✦' : 'HESAP OLUŞTUR ✦'}</span>
                                    <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                                </>
                            )}
                        </button>
                    </form>

                    {/* Divider */}
                    <div className="flex items-center gap-3 my-1 opacity-50">
                        <div className="h-px flex-1 bg-gray-700" />
                        <span className="text-[10px] uppercase tracking-wider whitespace-nowrap" style={{ color: '#9CA3AF' }}>Güvenli Kimlik Doğrulama</span>
                        <div className="h-px flex-1 bg-gray-700" />
                    </div>

                    {/* Google SSO */}
                    <button
                        type="button"
                        onClick={loginWithGoogle}
                        className="w-full h-10 flex items-center justify-center gap-2 rounded-sm text-xs tracking-wide uppercase transition-colors"
                        style={{ backgroundColor: '#1F2937', border: '1px solid #374151', color: '#D1D5DB' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#374151'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#1F2937'}
                    >
                        <img src="https://www.google.com/favicon.ico" alt="Google" className="w-3.5 h-3.5 opacity-80" />
                        Google Nexus ile Doğrula
                    </button>

                    {/* Mode toggle */}
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setSuccess(null); }}
                            className="text-[10px] uppercase tracking-wider flex items-center gap-1 transition-colors"
                            style={{ color: '#6B7280' }}
                            onMouseEnter={e => e.currentTarget.style.color = '#06B6D4'}
                            onMouseLeave={e => e.currentTarget.style.color = '#6B7280'}
                        >
                            {mode === 'login' ? 'Kayıtlı Değil Misiniz? Hesap Oluşturun' : 'Zaten Kayıtlı Mısınız? Giriş Yapın'}
                            <ArrowRight size={10} />
                        </button>
                    </div>
                </div>

                {/* STT Diagnostics Panel */}
                <div className="border-t border-gray-800/60 p-4 mt-auto" style={{ backgroundColor: 'rgba(10,15,30,0.8)' }}>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2" style={{ color: '#06B6D4' }}>
                            <Terminal size={12} />
                            <span className="text-[10px] uppercase font-black tracking-wider">Sistem Tanılama</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[9px] text-green-500 uppercase tracking-widest">ÇALIŞIYOR</span>
                        </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-sm" style={{ backgroundColor: '#050810', border: '1px solid #1F2937' }}>
                        <button
                            type="button"
                            onClick={toggleSttTest}
                            className="w-8 h-8 rounded flex items-center justify-center shrink-0 transition-all"
                            style={{
                                backgroundColor: isMicActive ? '#06B6D4' : '#1F2937',
                                color: isMicActive ? '#0A0F1E' : '#9CA3AF'
                            }}
                        >
                            <Mic size={14} />
                        </button>
                        <div className="flex-1 min-w-0">
                            <div className="text-[10px] mb-1 flex items-center gap-1" style={{ color: '#6B7280' }}>
                                <Zap size={10} style={{ color: isMicActive ? '#06B6D4' : undefined }} />
                                <span className="uppercase tracking-wide">STT Nöral Motor Testi</span>
                                <span className="ml-auto px-2 py-0.5 rounded-sm text-[8px] uppercase tracking-widest" style={{ backgroundColor: '#1F2937', color: isMicActive ? '#EF4444' : '#06B6D4' }}>
                                    {isMicActive ? 'MOTORU DURDUR' : 'MOTORU BAŞLAT'}
                                </span>
                            </div>
                            <div className="h-4 text-xs overflow-hidden" style={{ color: '#E5E7EB' }}>
                                {sttResult ? (
                                    <span className="text-cyan-400 italic text-[10px]">"{sttResult}"</span>
                                ) : isMicActive ? (
                                    <span className="flex items-center gap-0.5 text-gray-500 text-[10px]">
                                        Dinleniyor
                                        <span className="animate-bounce inline-block" style={{ animationDelay: '0ms' }}>.</span>
                                        <span className="animate-bounce inline-block" style={{ animationDelay: '100ms' }}>.</span>
                                        <span className="animate-bounce inline-block" style={{ animationDelay: '200ms' }}>.</span>
                                    </span>
                                ) : (
                                    <span className="text-gray-600 text-[10px] font-mono">Beklemede_</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[8px] uppercase tracking-widest" style={{ color: '#374151' }}>
                        <span>Nöral Motor Dağıtımı: Kararlı v2.4.0</span>
                        <span>OK</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
