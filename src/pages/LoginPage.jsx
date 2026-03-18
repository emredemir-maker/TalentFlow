// src/pages/LoginPage.jsx
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogIn, Sparkles, AlertCircle, Loader2, Mail, Lock, User, CheckCircle, Zap, Mic } from 'lucide-react';
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
                    const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
                    const res = await fetch(`${serverUrl}/api/gemini-stt`, {
                        method: 'POST',
                        body: formData
                    });
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
                setSuccess("Registration successful! Accessing systems...");
            }
        } catch {
        }
    };

    return (
        <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center p-6 relative overflow-hidden transition-colors duration-500">
            {/* Ambient Background Glows */}
            <div className="fixed top-[-15%] left-[-15%] w-[60%] h-[60%] bg-cyan-500/10 rounded-full blur-[160px] pointer-events-none animate-pulse" />
            <div className="fixed bottom-[-15%] right-[-15%] w-[60%] h-[60%] bg-violet-600/10 rounded-full blur-[160px] pointer-events-none animate-stitch-float" />

            <div className="w-full max-w-md relative z-10 bg-bg-secondary/40 backdrop-blur-3xl rounded-[3rem] p-10 border border-border-subtle shadow-2xl space-y-10 animate-fade-in">

                {/* Logo Area */}
                <div className="text-center space-y-6">
                    <div className="flex flex-col items-center gap-6">
                        <Logo size={100} showText={true} className="flex-col items-center !gap-6" />
                    </div>
                </div>

                {error && (
                    <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold animate-in zoom-in-95">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p>{error}</p>
                    </div>
                )}

                {success && (
                    <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold animate-in zoom-in-95">
                        <CheckCircle className="w-5 h-5 shrink-0" />
                        <p>{success}</p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] text-text-muted uppercase font-black tracking-[0.2em] ml-2 opacity-60">Görünen Ad</label>
                        <div className="relative group">
                            <User className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted group-focus-within:text-cyan-500 transition-colors" />
                            <input
                                type="text"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ad Soyad"
                                className="w-full pl-12 pr-6 py-4 bg-bg-primary border border-border-subtle rounded-2xl text-text-primary outline-none focus:border-cyan-500/50 focus:bg-bg-primary/80 transition-all text-sm font-bold placeholder:text-text-muted/40 shadow-inner"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] text-text-muted uppercase font-black tracking-[0.2em] ml-2 opacity-60">Erişim Sinyali (E-posta)</label>
                        <div className="relative group">
                            <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted group-focus-within:text-cyan-500 transition-colors" />
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="ad@sirket.com"
                                className="w-full pl-12 pr-6 py-4 bg-bg-primary border border-border-subtle rounded-2xl text-text-primary outline-none focus:border-cyan-500/50 focus:bg-bg-primary/80 transition-all text-sm font-bold placeholder:text-text-muted/40 shadow-inner"
                            />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="text-[11px] text-text-muted uppercase font-black tracking-[0.2em] ml-2 opacity-60">Güvenlik Anahtarı (Şifre)</label>
                        <div className="relative group">
                            <Lock className="absolute left-6 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-text-muted transition-colors group-focus-within:text-cyan-500" />
                            <input
                                type="password"
                                required
                                minLength={6}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full pl-14 pr-6 py-5 bg-bg-primary border border-border-subtle rounded-2xl text-text-primary outline-none focus:border-cyan-500/50 focus:bg-bg-primary/80 transition-all text-sm font-bold placeholder:text-text-muted/40 shadow-inner"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-5 rounded-2xl bg-cyan-500 text-white font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-lg shadow-cyan-500/20 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 transition-all group"
                    >
                        {loading ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            <>
                                <span className="text-sm">SİSTEME GİRİŞ YAP</span>
                                <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                            </>
                        )}
                    </button>
                </form>

                <div className="relative py-4">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border-subtle opacity-50"></div></div>
                    <div className="relative flex justify-center text-[10px] uppercase font-black tracking-[0.3em]"><span className="bg-bg-secondary/40 backdrop-blur-3xl px-4 text-text-muted opacity-40 italic">Güvenli Kimlik Doğrulama</span></div>
                </div>

                <div className="space-y-4">
                    <button
                        onClick={loginWithGoogle}
                        className="w-full py-4 rounded-2xl bg-bg-primary border border-border-subtle text-text-primary font-bold flex items-center justify-center gap-3 hover:bg-bg-primary/80 transition-all text-sm shadow-xl"
                    >
                        <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
                        Google Nexus ile Doğrula
                    </button>

                    <button
                        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                        className="w-full text-center text-[10px] font-black text-text-muted hover:text-cyan-500 transition-colors uppercase tracking-[0.2em] opacity-60 hover:opacity-100"
                    >
                        {mode === 'login' ? 'Kayıtlı Değil Misiniz? Hesap Oluşturun' : 'Zaten Kayıtlı Mısınız? Sisteme Giriş Yapın'}
                    </button>
                </div>

                <div className="pt-8 space-y-4 border-t border-border-subtle overflow-hidden">
                    <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-2">
                            <Zap className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                            <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] opacity-60 italic">Sistem Tanılama</span>
                        </div>
                        <div className="h-1 flex-1 mx-4 bg-border-subtle/30 rounded-full" />
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">ÇALIŞIYOR</span>
                    </div>

                    <div className="p-4 bg-bg-primary/50 border border-border-subtle rounded-2xl flex flex-col gap-4 group/stt">
                         <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`w-2.5 h-2.5 rounded-full ${isMicActive ? 'bg-cyan-500 shadow-cyan-500/50 animate-pulse' : 'bg-white/10'}`} />
                                <span className={`text-[11px] font-black uppercase tracking-widest ${isMicActive ? 'text-white' : 'text-text-muted'}`}>STT Nöral Motor TESTİ</span>
                            </div>
                            <button 
                                onClick={toggleSttTest}
                                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${isMicActive ? 'bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white' : 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500 hover:text-white'}`}
                            >
                                {isMicActive ? 'MOTORU DURDUR' : 'MOTORU BAŞLAT'}
                            </button>
                         </div>

                         <div className="relative h-12 flex items-center justify-center bg-black/20 rounded-xl border border-dashed border-border-subtle px-4 overflow-hidden">
                             {sttResult ? (
                                 <p className="text-[10px] font-bold text-cyan-400 italic animate-in fade-in slide-in-from-left-2 duration-500 truncate">
                                     "{sttResult}"
                                 </p>
                             ) : (
                                 <div className="flex items-center gap-2 opacity-30">
                                     <Mic className="w-3.5 h-3.5 text-text-muted" />
                                     <span className="text-[10px] font-black text-text-muted uppercase tracking-widest italic">{isMicActive ? 'Konuşmanız dinleniyor...' : 'Sesi metne dökmek için başlatın'}</span>
                                 </div>
                             )}
                         </div>
                    </div>

                    <p className="text-[10px] text-center text-text-muted uppercase tracking-[0.2em] font-black opacity-40">Nöral Motor Dağıtımı: Kararlı v2.4.0</p>
                </div>
            </div>
        </div>
    );
}
