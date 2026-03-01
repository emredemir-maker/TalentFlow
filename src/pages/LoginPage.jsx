// src/pages/LoginPage.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogIn, Sparkles, AlertCircle, Loader2, Mail, Lock, User, CheckCircle, Zap } from 'lucide-react';
import Logo from '../components/Logo';

export default function LoginPage() {
    const { loginWithGoogle, loginWithEmail, registerWithEmail, loading, error } = useAuth();

    const [mode, setMode] = useState('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [success, setSuccess] = useState(null);

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

                <div className="pt-8 border-t border-border-subtle opacity-50 text-center">
                    <p className="text-[10px] text-text-muted uppercase tracking-[0.2em] font-black opacity-40">Nöral Motor Dağıtımı: Kararlı v2.4.0</p>
                </div>
            </div>
        </div>
    );
}
