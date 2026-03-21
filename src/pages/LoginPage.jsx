// src/pages/LoginPage.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogIn, AlertCircle, CheckCircle, Loader2, User, Mail, Lock, Sparkles, ArrowRight, Zap, Brain, BarChart3, Clock } from 'lucide-react';
import TalentInnLogo from '../components/TalentInnLogo';

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
                setSuccess('Kayıt başarılı! Sisteme erişim sağlanıyor...');
            }
        } catch {}
    };

    const inputStyle = {
        backgroundColor: '#FFFFFF',
        border: '1.5px solid #E2E8F0',
        color: '#1E293B',
        borderRadius: '10px',
        width: '100%',
        height: '48px',
        paddingLeft: '44px',
        paddingRight: '16px',
        fontSize: '14px',
        outline: 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s',
    };

    const handleFocus = (e) => {
        e.target.style.borderColor = '#06B6D4';
        e.target.style.boxShadow = '0 0 0 3px rgba(6,182,212,0.12)';
    };
    const handleBlur = (e) => {
        e.target.style.borderColor = '#E2E8F0';
        e.target.style.boxShadow = 'none';
    };

    const stats = [
        { value: '3s', label: 'CV Analizi', icon: BarChart3 },
        { value: '%90', label: 'Tahmin Skoru', icon: Brain },
        { value: '24/7', label: 'Akıllı Asistan', icon: Clock },
    ];

    const features = [
        'Nöral CV Ayrıştırma ve Eşleştirme',
        'Gerçek Zamanlı STAR Mülakat Analizi',
        'Bias Korumalı AI Değerlendirme',
        'Agentic İşe Alım İş Akışları',
    ];

    return (
        <div
            style={{
                minHeight: '100vh',
                width: '100%',
                display: 'flex',
                fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
                overflow: 'hidden',
            }}
        >
            {/* ── LEFT PANEL ── */}
            <div
                style={{
                    width: '45%',
                    minHeight: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '56px 48px',
                    background: 'linear-gradient(155deg, #0F172A 0%, #1E1B4B 55%, #0F172A 100%)',
                    position: 'relative',
                    overflow: 'hidden',
                    flexShrink: 0,
                }}
            >
                {/* Decorative glows */}
                <div style={{
                    position: 'absolute', top: '-10%', right: '-10%',
                    width: '55%', height: '55%', borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(6,182,212,0.18) 0%, transparent 70%)',
                    pointerEvents: 'none'
                }} />
                <div style={{
                    position: 'absolute', bottom: '-10%', left: '-10%',
                    width: '55%', height: '55%', borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
                    pointerEvents: 'none'
                }} />

                {/* Logo */}
                <div style={{ position: 'relative', zIndex: 1 }}>
                    <TalentInnLogo iconSize={46} showText={true} showSub={true} textSize="20px" />
                </div>

                {/* Hero Text */}
                <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: '48px', paddingBottom: '48px' }}>
                    {/* Badge */}
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '8px',
                        padding: '6px 14px', borderRadius: '999px',
                        backgroundColor: 'rgba(6,182,212,0.08)',
                        border: '1px solid rgba(6,182,212,0.15)',
                        color: '#67E8F9',
                        fontSize: '10px', fontWeight: 800,
                        letterSpacing: '3px', textTransform: 'uppercase',
                        marginBottom: '28px',
                        width: 'fit-content',
                    }}>
                        <Sparkles size={12} />
                        Gelişmiş Yetenek Kontrol Merkezi
                    </div>

                    {/* Main heading */}
                    <h1 style={{
                        fontSize: 'clamp(36px, 3.5vw, 52px)',
                        fontWeight: 900,
                        lineHeight: 1.05,
                        letterSpacing: '-1.5px',
                        color: '#F8FAFC',
                        marginBottom: '20px',
                    }}>
                        İşe Alımın <br />
                        <span style={{
                            background: 'linear-gradient(90deg, #06B6D4, #67E8F9, #34D399)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                        }}>
                            Yapay Zeka Mimarı
                        </span>
                    </h1>

                    {/* Description */}
                    <p style={{
                        color: '#94A3B8',
                        fontSize: '15px',
                        lineHeight: '1.7',
                        maxWidth: '400px',
                        marginBottom: '36px',
                        fontWeight: 500,
                    }}>
                        Talent-Inn, sıradan bir aday takip sisteminden çok daha fazlasıdır. Veriyi stratejiye, adayları ise yetkinlik kanıtlarına dönüştüren uçtan uca bir{' '}
                        <span style={{ color: '#F8FAFC', fontWeight: 700 }}>Yapay Zeka Ekosistemidir.</span>
                    </p>

                    {/* Feature list */}
                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 40px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {features.map((f) => (
                            <li key={f} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#CBD5E1', fontSize: '13px', fontWeight: 500 }}>
                                <div style={{
                                    width: '20px', height: '20px', borderRadius: '50%',
                                    background: 'rgba(6,182,212,0.12)',
                                    border: '1px solid rgba(6,182,212,0.25)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                }}>
                                    <Zap size={10} color="#06B6D4" />
                                </div>
                                {f}
                            </li>
                        ))}
                    </ul>

                    {/* Stats */}
                    <div style={{ display: 'flex', gap: '0', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '28px' }}>
                        {stats.map((s, i) => (
                            <div key={s.label} style={{
                                flex: 1,
                                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                                paddingRight: i < stats.length - 1 ? '24px' : '0',
                                borderRight: i < stats.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                                paddingLeft: i > 0 ? '24px' : '0',
                            }}>
                                <s.icon size={16} color="#06B6D4" style={{ marginBottom: '8px', opacity: 0.8 }} />
                                <div style={{ fontSize: '22px', fontWeight: 900, color: '#F8FAFC', lineHeight: 1 }}>{s.value}</div>
                                <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', marginTop: '4px' }}>{s.label}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer note */}
                <div style={{ position: 'relative', zIndex: 1, color: '#475569', fontSize: '11px', letterSpacing: '1px' }}>
                    © 2025 Talent-Inn · AI-Powered Talent Intelligence
                </div>
            </div>

            {/* ── RIGHT PANEL ── */}
            <div style={{
                flex: 1,
                backgroundColor: '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '48px 40px',
                overflowY: 'auto',
            }}>
                <div style={{ width: '100%', maxWidth: '420px' }}>
                    {/* Header */}
                    <div style={{ marginBottom: '36px' }}>
                        <h2 style={{ fontSize: '26px', fontWeight: 800, color: '#0F172A', marginBottom: '8px', letterSpacing: '-0.5px' }}>
                            {mode === 'login' ? 'Hoş Geldiniz' : 'Hesap Oluşturun'}
                        </h2>
                        <p style={{ color: '#64748B', fontSize: '14px', lineHeight: '1.5' }}>
                            {mode === 'login'
                                ? 'Platforma erişmek için bilgilerinizi girin.'
                                : 'Davetiyenizle yeni hesabınızı oluşturun.'}
                        </p>
                    </div>

                    {/* Error Alert */}
                    {error && (
                        <div style={{
                            display: 'flex', alignItems: 'flex-start', gap: '10px',
                            padding: '12px 14px', borderRadius: '10px', marginBottom: '20px',
                            backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                            color: '#EF4444', fontSize: '13px'
                        }}>
                            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Success Alert */}
                    {success && (
                        <div style={{
                            display: 'flex', alignItems: 'flex-start', gap: '10px',
                            padding: '12px 14px', borderRadius: '10px', marginBottom: '20px',
                            backgroundColor: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
                            color: '#10B981', fontSize: '13px'
                        }}>
                            <CheckCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
                            <span>{success}</span>
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* Name — register only */}
                        {mode === 'register' && (
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1E293B', marginBottom: '6px' }}>
                                    Görünen Ad
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <User size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                    <input
                                        type="text"
                                        required
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Ad Soyad"
                                        style={inputStyle}
                                        onFocus={handleFocus}
                                        onBlur={handleBlur}
                                        autoComplete="name"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Email */}
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1E293B', marginBottom: '6px' }}>
                                E-posta Adresi
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Mail size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="ornek@sirket.com"
                                    style={inputStyle}
                                    onFocus={handleFocus}
                                    onBlur={handleBlur}
                                    autoComplete="email"
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1E293B', marginBottom: '6px' }}>
                                Şifre
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                <input
                                    type="password"
                                    required
                                    minLength={6}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    style={inputStyle}
                                    onFocus={handleFocus}
                                    onBlur={handleBlur}
                                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                />
                            </div>
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                width: '100%', height: '50px', borderRadius: '10px',
                                background: loading ? '#94A3B8' : 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)',
                                color: '#fff', fontWeight: 700, fontSize: '14px',
                                letterSpacing: '0.3px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                marginTop: '4px',
                                boxShadow: loading ? 'none' : '0 8px 24px rgba(6,182,212,0.25)',
                                transition: 'opacity 0.2s',
                            }}
                            onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '0.9'; }}
                            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                        >
                            {loading ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <>
                                    <LogIn size={16} />
                                    {mode === 'login' ? 'Sisteme Giriş Yap' : 'Hesap Oluştur'}
                                </>
                            )}
                        </button>
                    </form>

                    {/* Divider */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '24px 0' }}>
                        <div style={{ flex: 1, height: '1px', backgroundColor: '#E2E8F0' }} />
                        <span style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                            Güvenli Kimlik Doğrulama
                        </span>
                        <div style={{ flex: 1, height: '1px', backgroundColor: '#E2E8F0' }} />
                    </div>

                    {/* Google SSO */}
                    <button
                        type="button"
                        onClick={loginWithGoogle}
                        style={{
                            width: '100%', height: '48px', borderRadius: '10px',
                            backgroundColor: '#FFFFFF', border: '1.5px solid #E2E8F0',
                            color: '#1E293B', fontWeight: 600, fontSize: '14px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                            cursor: 'pointer', transition: 'background-color 0.15s, border-color 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#F1F5F9'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#FFFFFF'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
                    >
                        <svg viewBox="0 0 24 24" style={{ width: '18px', height: '18px' }} xmlns="http://www.w3.org/2000/svg">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        Google ile Devam Et
                    </button>

                    {/* Toggle mode */}
                    <div style={{ marginTop: '28px', textAlign: 'center' }}>
                        <button
                            type="button"
                            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setSuccess(null); }}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: '13px', color: '#64748B', display: 'inline-flex', alignItems: 'center', gap: '4px',
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = '#06B6D4'}
                            onMouseLeave={e => e.currentTarget.style.color = '#64748B'}
                        >
                            {mode === 'login' ? 'Hesabınız yok mu? Kayıt olun' : 'Zaten üye misiniz? Giriş yapın'}
                            <ArrowRight size={13} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
