// src/pages/LoginPage.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogIn, Sparkles, AlertCircle, Loader2, Mail, Lock, User, ArrowLeft, CheckCircle } from 'lucide-react';

export default function LoginPage() {
    const { loginWithGoogle, loginWithEmail, registerWithEmail, loading, error } = useAuth();

    // UI State
    const [mode, setMode] = useState('login'); // 'login' or 'register'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [success, setSuccess] = useState(null);

    // URL parameter check for invitation
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
                setSuccess("Kaydınız başarıyla tamamlandı! Giriş yapılıyor...");
            }
        } catch (err) {
            // Error handling is managed by AuthContext
        }
    };

    return (
        <div className="min-h-screen bg-navy-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-electric/10 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
            </div>

            <div className="w-full max-w-md relative z-10 glass rounded-[40px] p-8 border border-white/10 shadow-2xl space-y-6 stagger">
                <div className="text-center space-y-2">
                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-electric to-violet-600 flex items-center justify-center mx-auto shadow-[0_8px_32px_rgba(59,130,246,0.3)] mb-6">
                        <Sparkles className="w-10 h-10 text-white" />
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight">TalentFlow</h1>
                    <p className="text-navy-400 font-medium">
                        {mode === 'login' ? 'Yapay Zeka Destekli İK Paneli' : 'Davetiyeyi Yanıtla'}
                    </p>
                </div>

                {error && (
                    <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium animate-in fade-in slide-in-from-top-2">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p>{error}</p>
                    </div>
                )}

                {success && (
                    <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium animate-in fade-in slide-in-from-top-2">
                        <CheckCircle className="w-5 h-5 shrink-0" />
                        <p>{success}</p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {mode === 'register' && (
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-navy-500 uppercase font-black tracking-widest ml-1">Ad Soyad</label>
                            <div className="relative">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-500" />
                                <input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Adınız ve soyadınız"
                                    className="w-full pl-11 pr-5 py-4 bg-navy-900 border border-white/10 rounded-2xl text-white outline-none focus:border-electric transition-all text-sm"
                                />
                            </div>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-[10px] text-navy-500 uppercase font-black tracking-widest ml-1">E-posta</label>
                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-500" />
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="is@sirket.com"
                                className="w-full pl-11 pr-5 py-4 bg-navy-900 border border-white/10 rounded-2xl text-white outline-none focus:border-electric transition-all text-sm"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] text-navy-500 uppercase font-black tracking-widest ml-1">Şifre</label>
                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-500" />
                            <input
                                type="password"
                                required
                                minLength={6}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full pl-11 pr-5 py-4 bg-navy-900 border border-white/10 rounded-2xl text-white outline-none focus:border-electric transition-all text-sm"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 rounded-2xl bg-electric text-white font-bold flex items-center justify-center gap-3 hover:bg-electric-light transition-all active:scale-[0.98] shadow-xl shadow-electric/20 disabled:opacity-50"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            mode === 'login' ? 'Giriş Yap' : 'Kaydı Tamamla'
                        )}
                    </button>
                </form>

                <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5"></div></div>
                    <div className="relative flex justify-center text-xs uppercase"><span className="bg-navy-900 px-2 text-navy-500 font-black tracking-widest">VEYA</span></div>
                </div>

                <div className="space-y-3">
                    <button
                        onClick={loginWithGoogle}
                        className="w-full py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white font-bold flex items-center justify-center gap-3 hover:bg-white/10 transition-all text-sm"
                    >
                        <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
                        Google ile Davam Et
                    </button>

                    <button
                        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                        className="w-full text-center text-xs font-bold text-navy-400 hover:text-white transition-colors"
                    >
                        {mode === 'login' ? 'Davetiyeniz mi var? Kaydolun' : 'Zaten hesabınız var mı? Giriş Yapın'}
                    </button>
                </div>

                <div className="text-center pt-4 border-t border-white/5">
                    <p className="text-[9px] text-navy-600 uppercase tracking-widest font-black">Powered by Gemini AI</p>
                </div>
            </div>
        </div>
    );
}
