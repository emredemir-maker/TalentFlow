// src/pages/LoginPage.jsx
//
// GİRİŞ YALNIZ CLYRO HUB'DAN (K3, docs/coklu-sirket-plani.md §2.4).
// Talent'ın kendi e-posta/şifre ve Google girişi, kayıt formu, davet bağlantısı
// ve izinli alan adıyla kayıt (K4) kaldırıldı. Hub'da Talent açılınca
// /hub-giris tek kullanımlık kodla oturum açar.
//
// İstisna — yalnız iki derleme kipinde e-posta/şifre formu görünür:
//   • emülatör E2E derlemesi (VITE_USE_FIREBASE_EMULATOR=true): gerçek kimlik
//     akışının testi Hub olmadan yapılabilsin;
//   • demo kurulumu (IS_DEMO): paylaşılan demo hesabı.
// Üretim derlemesinde ikisi de kapalı; dal derlemede elenir.
import { useState } from 'react';
import { LogIn, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { IS_DEMO, DEMO_LOGIN, HAS_DEMO_LOGIN } from '../utils/demoMode';
import TalentInnLogo from '../components/TalentInnLogo';

const PASSWORD_FORM = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true' || IS_DEMO;

function PasswordForm() {
    const { loginWithEmulatorPassword } = useAuth();
    const [email, setEmail] = useState(HAS_DEMO_LOGIN ? DEMO_LOGIN.email : '');
    const [password, setPassword] = useState(HAS_DEMO_LOGIN ? DEMO_LOGIN.password : '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            await loginWithEmulatorPassword(email.trim(), password);
        } catch {
            setError('E-posta veya şifre hatalı.');
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-3 text-left">
            <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-posta"
                autoComplete="username"
                className="w-full border border-n200 rounded-md px-3 py-2 text-sm"
            />
            <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Şifre"
                autoComplete="current-password"
                className="w-full border border-n200 rounded-md px-3 py-2 text-sm"
            />
            {error && (
                <p className="text-[12px] text-bad-text flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {error}
                </p>
            )}
            <button type="submit" disabled={busy} className="w-full tf-btn tf-btn-secondary justify-center">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Sisteme Giriş Yap
            </button>
        </form>
    );
}

export default function LoginPage() {
    const { loginWithHub, error } = useAuth();
    return (
        <div className="min-h-dvh flex items-center justify-center p-6 bg-frame">
            <div className="max-w-sm w-full bg-n0 rounded-2xl border border-n200 p-8 space-y-5 text-center">
                <div className="flex justify-center">
                    <TalentInnLogo />
                </div>
                <div className="space-y-1">
                    <h1 className="text-xl font-semibold text-n900">Hoş Geldiniz</h1>
                    <p className="text-sm text-n500">
                        Clyro Talent'a şirketinizin Clyro Hub hesabıyla girilir.
                    </p>
                </div>
                {error && <p className="text-[12px] text-bad-text">{error}</p>}
                <button type="button" onClick={loginWithHub} className="w-full tf-btn tf-btn-primary justify-center">
                    <LogIn className="w-4 h-4" /> Clyro Hub ile giriş yap
                </button>
                {PASSWORD_FORM && <PasswordForm />}
            </div>
        </div>
    );
}
