// src/pages/SettingsPage.jsx
import { useState, useRef, useEffect } from 'react';
import { useUserSettings } from '../context/UserSettingsContext';
import { useAuth } from '../context/AuthContext';
import {
    Settings, Palette, Bell, Mail,
    CheckCircle, Loader2, Mic, MicOff, Zap, Activity,
    Share2, Building2, BookOpen, Shield, Key, Eye, EyeOff,
    ShieldCheck, ChevronRight
} from 'lucide-react';
import { connectGoogleWorkspace, disconnectGoogleWorkspace } from '../services/integrationService';
import { connectMicrosoftWorkspace, disconnectMicrosoftWorkspace } from '../services/microsoftIntegrationService';
import { GoogleGenerativeAI } from '@google/generative-ai';

import SourceManagementPage from './SourceManagementPage';
import DepartmentManagementPage from './DepartmentManagementPage';
import GuidePage from './GuidePage';
import SuperAdminPage from './SuperAdminPage';
import BrandingSettingsPage from './BrandingSettingsPage';
import EmailTemplateEditorPage from './EmailTemplateEditorPage';

const NAV_GROUPS = [
    {
        group: 'Hesabım',
        items: [
            { id: 'account',   label: 'Hesabım',          icon: Settings,  adminOnly: false },
            { id: 'api_keys',  label: 'API & Ses Motoru', icon: Key,       adminOnly: true  },
        ],
    },
    {
        group: 'Kurumsal',
        items: [
            { id: 'branding',        label: 'Kurumsal Kimlik',    icon: Palette,   adminOnly: true  },
            { id: 'email_templates', label: 'E-posta Şablonları', icon: Mail,      adminOnly: true  },
            { id: 'sources',         label: 'Kaynak Yönetimi',    icon: Share2,    adminOnly: false },
            { id: 'departments',     label: 'Departmanlar',       icon: Building2, adminOnly: false },
        ],
    },
    {
        group: 'Araçlar',
        items: [
            { id: 'guide',  label: 'Platform Kılavuzu', icon: BookOpen, adminOnly: false },
            { id: 'system', label: 'Sistem Yönetimi',   icon: Shield,   adminOnly: true  },
        ],
    },
];

export default function SettingsPage({ initialTab }) {
    const { settings, loading, updateSettings } = useUserSettings();
    const { user, userProfile, userId } = useAuth();
    const [activeSection, setActiveSection] = useState(initialTab || 'account');
    const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
    const [isConnectingMicrosoft, setIsConnectingMicrosoft] = useState(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

    // STT Test States
    const [sttStatus, setSttStatus] = useState('idle');
    const [sttResult, setSttResult] = useState('');
    const [sttEmotion, setSttEmotion] = useState(null);
    const mediaRecorderRef = useRef(null);
    const sttIntervalRef = useRef(null);
    const audioChunksRef = useRef([]);
    const sttActiveRef = useRef(false);

    // Gemini API Key — anahtar tarayıcıya asla inmez: sunucudan yalnızca
    // "ayarlı mı + son 4 hane" okunur, kayıt super_admin korumalı
    // /api/admin/api-keys ucundan yapılır.
    const [geminiKey, setGeminiKey] = useState('');
    const [showGeminiKey, setShowGeminiKey] = useState(false);
    const [savingGeminiKey, setSavingGeminiKey] = useState(false);
    const [geminiKeySaved, setGeminiKeySaved] = useState(false);
    const [hasSavedGeminiKey, setHasSavedGeminiKey] = useState(false);
    const [savedKeyLast4, setSavedKeyLast4] = useState(null);

    const isSuperAdmin = userProfile?.role === 'super_admin';

    useEffect(() => {
        if (!isSuperAdmin || !user) return;
        let cancelled = false;
        (async () => {
            try {
                const token = await user.getIdToken();
                const res = await fetch('/api/admin/api-keys', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled) return;
                if (data?.gemini?.set) {
                    setHasSavedGeminiKey(true);
                    setSavedKeyLast4(data.gemini.last4 || null);
                }
            } catch { /* durum rozeti gösterilmez, sayfa çalışmaya devam eder */ }
        })();
        return () => { cancelled = true; };
    }, [isSuperAdmin, user]);

    const handleSaveGeminiKey = async () => {
        if (!geminiKey.trim()) return;
        setSavingGeminiKey(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/admin/api-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ gemini: geminiKey.trim() }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Sunucu hatası (${res.status})`);
            setGeminiKeySaved(true);
            setHasSavedGeminiKey(true);
            setSavedKeyLast4(data.last4 || null);
            setGeminiKey('');
            setTimeout(() => setGeminiKeySaved(false), 3000);
        } catch (err) { alert('Kayıt hatası: ' + err.message); }
        finally { setSavingGeminiKey(false); }
    };

    const stopSttTest = () => {
        sttActiveRef.current = false;
        if (sttIntervalRef.current) clearInterval(sttIntervalRef.current);
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.onstop = null;
            if (mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
            mediaRecorderRef.current = null;
        }
        audioChunksRef.current = [];
        setSttStatus('idle');
        setSttResult('');
        setSttEmotion(null);
    };

    const toggleSttTest = async () => {
        if (sttStatus === 'listening') { stopSttTest(); return; }
        setSttResult('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            let mimeType = 'audio/webm';
            for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']) {
                if (MediaRecorder.isTypeSupported(t)) { mimeType = t; break; }
            }
            const recorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];
            sttActiveRef.current = true;

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            recorder.onstop = async () => {
                if (!sttActiveRef.current) return;
                if (audioChunksRef.current.length === 0) return;
                const blob = new Blob(audioChunksRef.current, { type: mimeType });
                audioChunksRef.current = [];
                const reader = new FileReader();
                reader.onloadend = async () => {
                    const base64 = reader.result.split(',')[1];
                    try {
                        const res = await fetch('/api/stt', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ audio: base64, mimeType }),
                        });
                        const data = await res.json();
                        const text = data.text?.trim() || '';
                        let parsedEmotion = null;
                        if (data.emotion) {
                            try { parsedEmotion = typeof data.emotion === 'string' ? JSON.parse(data.emotion) : data.emotion; } catch { }
                        }
                        const isJunk = text.length <= 2
                            || text.toLowerCase().includes('sessizlik')
                            || text.toLowerCase().includes('boş_ses');
                        if (!isJunk && sttActiveRef.current) {
                            setSttResult(text);
                            setSttEmotion(parsedEmotion);
                            setSttStatus('success');
                            sttActiveRef.current = false;
                            clearInterval(sttIntervalRef.current);
                            stream.getTracks().forEach(t => t.stop());
                            return;
                        }
                    } catch (err) { console.error('[STT Test]', err); }
                }
                if (sttActiveRef.current && recorder.state === 'inactive') {
                    try { recorder.start(); } catch { }
                }
            };

            recorder.start();
            setSttStatus('listening');
            sttIntervalRef.current = setInterval(() => {
                if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
            }, 5000);
        } catch { setSttStatus('error'); }
    };

    const handleGoogleConnect = async () => {
        setIsConnectingGoogle(true);
        try {
            const res = await connectGoogleWorkspace(userId);
            if (res.success) {
                alert(`Google hesabı (${res.email}) başarıyla bağlandı!`);
                window.location.reload();
            } else {
                alert(`Bağlantı hatası: ${res.error}`);
            }
        } catch (err) { console.error(err); }
        finally { setIsConnectingGoogle(false); }
    };

    const handleGoogleDisconnect = async () => {
        if (!window.confirm("Google bağlantısını kesmek istediğinizden emin misiniz?")) return;
        setIsConnectingGoogle(true);
        try {
            const res = await disconnectGoogleWorkspace(userId);
            if (res.success) { window.location.reload(); }
            else { alert(`Bağlantı kesme hatası: ${res.error}`); }
        } catch (err) { console.error(err); }
        finally { setIsConnectingGoogle(false); }
    };

    const handleMicrosoftConnect = async () => {
        setIsConnectingMicrosoft(true);
        try {
            const res = await connectMicrosoftWorkspace(userId);
            if (res.success) {
                alert(`Microsoft hesabı (${res.email}) başarıyla bağlandı!`);
                window.location.reload();
            } else {
                alert(`Bağlantı hatası: ${res.error}`);
            }
        } catch (err) { console.error(err); }
        finally { setIsConnectingMicrosoft(false); }
    };

    const handleMicrosoftDisconnect = async () => {
        if (!window.confirm("Microsoft bağlantısını kesmek istediğinizden emin misiniz?")) return;
        setIsConnectingMicrosoft(true);
        try {
            const res = await disconnectMicrosoftWorkspace(userId);
            if (res.success) { window.location.reload(); }
            else { alert(`Bağlantı kesme hatası: ${res.error}`); }
        } catch (err) { console.error(err); }
        finally { setIsConnectingMicrosoft(false); }
    };

    const isGoogleConnected = userProfile?.integrations?.google?.connected;
    const isMicrosoftConnected = userProfile?.integrations?.microsoft?.connected;

    if (loading || !userProfile) {
        return (
            <div className="infoset flex items-center justify-center h-64 min-h-screen">
                <div className="w-7 h-7 border-2 border-n200 border-t-brand rounded-full animate-spin" />
            </div>
        );
    }

    // Find current section label
    const allItems = NAV_GROUPS.flatMap(g => g.items);
    const currentItem = allItems.find(i => i.id === activeSection);

    const handleNav = (id) => {
        setActiveSection(id);
        setMobileSidebarOpen(false);
    };

    return (
        <div className="infoset flex flex-col min-h-screen">
            {/* Top header */}
            <header className="sticky top-0 z-40 bg-n0 border-b border-n200 px-6 lg:px-8 h-14 flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-brand-50 border border-brand-100 flex items-center justify-center">
                    <Settings className="w-4 h-4 text-brand" />
                </div>
                <h1 className="text-base font-semibold text-n900">Ayarlar</h1>
                {currentItem && (
                    <>
                        <ChevronRight className="w-4 h-4 text-n300" />
                        <span className="text-sm text-n500 font-medium">{currentItem.label}</span>
                    </>
                )}
            </header>

            <div className="flex flex-1 min-h-0">
                {/* Sidebar */}
                <aside className="w-56 shrink-0 bg-n0 border-r border-n200 overflow-y-auto hidden md:block">
                    <nav className="py-4 px-3 space-y-6">
                        {NAV_GROUPS.map(group => {
                            const visibleItems = group.items.filter(i => !i.adminOnly || isSuperAdmin);
                            if (group.adminOnly && !isSuperAdmin) return null;
                            if (visibleItems.length === 0) return null;
                            return (
                                <div key={group.group}>
                                    <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-n400">
                                        {group.group}
                                    </p>
                                    <ul className="space-y-0.5">
                                        {visibleItems.map(item => {
                                            const Icon = item.icon;
                                            const isActive = activeSection === item.id;
                                            return (
                                                <li key={item.id}>
                                                    <button
                                                        onClick={() => handleNav(item.id)}
                                                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-all text-left ${
                                                            isActive
                                                                ? 'bg-brand-50 text-brand border border-brand-100'
                                                                : 'text-n600 hover:bg-n50 hover:text-n900 border border-transparent'
                                                        }`}
                                                    >
                                                        <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-brand' : 'text-n400'}`} />
                                                        {item.label}
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            );
                        })}
                    </nav>
                </aside>

                {/* Main content */}
                <main className="flex-1 overflow-y-auto min-w-0">

                    {/* ── Hesabım (Tercihler + Entegrasyonlar) ────── */}
                    {activeSection === 'account' && (
                        <div className="px-6 lg:px-8 py-8 max-w-2xl mx-auto space-y-6">
                            <SectionHeader icon={Settings} title="Hesabım" desc="Görünüm, bildirimler ve bağlı hesaplar" />

                            {/* Tercihler */}
                            <div className="bg-n0 rounded-[14px] border border-n200 p-6 space-y-0">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-n400 mb-1">Tercihler</p>
                                <SettingRow icon={Bell} label="Uygulama Bildirimleri" description="Bildirim rozeti ve paneli göster / gizle" noBorder>
                                    <Toggle checked={settings.notifications !== false} onChange={(v) => updateSettings({ notifications: v })} />
                                </SettingRow>
                            </div>

                            {/* Entegrasyonlar */}
                            <div className="bg-n0 rounded-[14px] border border-n200 p-6">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-n400 mb-4">Entegrasyonlar</p>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-11 h-11 rounded-full bg-n0 flex items-center justify-center shadow-sm shrink-0 overflow-hidden p-2 border border-n200">
                                            <svg viewBox="0 0 24 24" className="w-full h-full">
                                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                                <path d="M1 1h22v22H1z" fill="none" />
                                            </svg>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-n900 flex items-center gap-2">
                                                Google Workspace
                                                {isGoogleConnected && <CheckCircle className="w-3.5 h-3.5 text-ok" />}
                                            </div>
                                            <div className="text-xs text-n400 mt-0.5">
                                                {isGoogleConnected
                                                    ? <span>Bağlı: <span className="text-ok font-medium">{userProfile.integrations.google.email}</span></span>
                                                    : 'Gmail ve Google Calendar ile entegre edin.'}
                                            </div>
                                        </div>
                                    </div>
                                    {isGoogleConnected ? (
                                        <button onClick={handleGoogleDisconnect} disabled={isConnectingGoogle}
                                            className="px-4 py-2 rounded-md text-xs font-semibold text-bad bg-bad-bg hover:opacity-90 transition-all border border-transparent disabled:opacity-50">
                                            {isConnectingGoogle ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Bağlantıyı Kes'}
                                        </button>
                                    ) : (
                                        <button onClick={handleGoogleConnect} disabled={isConnectingGoogle}
                                            className="px-4 py-2 rounded-md text-xs font-semibold text-white bg-brand hover:bg-brand-600 transition-all flex items-center gap-2 disabled:opacity-50">
                                            {isConnectingGoogle ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Bağlan'}
                                        </button>
                                    )}
                                </div>

                                {/* Microsoft 365 */}
                                <div className="flex items-center justify-between mt-4 pt-4 border-t border-n200">
                                    <div className="flex items-center gap-4">
                                        <div className="w-11 h-11 rounded-full bg-n0 flex items-center justify-center shadow-sm shrink-0 overflow-hidden p-2 border border-n200">
                                            <svg viewBox="0 0 23 23" className="w-full h-full">
                                                <path fill="#f25022" d="M0 0h11v11H0z" />
                                                <path fill="#00a4ef" d="M12 0h11v11H12z" />
                                                <path fill="#7fba00" d="M0 12h11v11H0z" />
                                                <path fill="#ffb900" d="M12 12h11v11H12z" />
                                            </svg>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-n900 flex items-center gap-2">
                                                Microsoft 365
                                                {isMicrosoftConnected && <CheckCircle className="w-3.5 h-3.5 text-ok" />}
                                            </div>
                                            <div className="text-xs text-n400 mt-0.5">
                                                {isMicrosoftConnected
                                                    ? <span>Bağlı: <span className="text-ok font-medium">{userProfile.integrations.microsoft.email}</span></span>
                                                    : 'Outlook ve Microsoft Teams ile entegre edin.'}
                                            </div>
                                        </div>
                                    </div>
                                    {isMicrosoftConnected ? (
                                        <button onClick={handleMicrosoftDisconnect} disabled={isConnectingMicrosoft}
                                            className="px-4 py-2 rounded-md text-xs font-semibold text-bad bg-bad-bg hover:opacity-90 transition-all border border-transparent disabled:opacity-50">
                                            {isConnectingMicrosoft ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Bağlantıyı Kes'}
                                        </button>
                                    ) : (
                                        <button onClick={handleMicrosoftConnect} disabled={isConnectingMicrosoft}
                                            className="px-4 py-2 rounded-md text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-all flex items-center gap-2 disabled:opacity-50">
                                            {isConnectingMicrosoft ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Bağlan'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── API & Ses Motoru ────────────────────────── */}
                    {activeSection === 'api_keys' && (
                        <div className="px-6 lg:px-8 py-8 max-w-2xl mx-auto space-y-6">
                            <SectionHeader icon={Key} title="API & Ses Motoru" desc="Gemini API anahtarı ve ses tanıma motoru testi" />

                            {/* Gemini API Key */}
                            <div className="bg-n0 rounded-[14px] border border-n200 p-6">
                                <div className="flex items-center gap-3 mb-5 pb-4 border-b border-n200">
                                    <div className="w-9 h-9 rounded-md bg-brand-50 border border-brand-100 flex items-center justify-center">
                                        <Key className="w-4 h-4 text-brand" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-sm font-semibold text-n900">Gemini API Anahtarı</h2>
                                            {hasSavedGeminiKey && (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full bg-ok-bg text-ok border border-transparent">
                                                    <CheckCircle className="w-3 h-3" /> Aktif{savedKeyLast4 ? ` ••••${savedKeyLast4}` : ''}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-n400">CV analizi, mülakat soruları ve ses tanıma için gereklidir. Buraya kaydedilen anahtar tüm ekip için anında geçerli olur.</p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="relative">
                                        <input
                                            type={showGeminiKey ? 'text' : 'password'}
                                            value={geminiKey}
                                            onChange={e => setGeminiKey(e.target.value)}
                                            placeholder={hasSavedGeminiKey ? 'Yeni anahtar girin (mevcut anahtar güvenlik gereği görüntülenemez)' : 'AIzaSy...'}
                                            className="w-full bg-n50 border border-n200 rounded-md px-4 py-2.5 pr-10 text-sm text-n700 font-mono outline-none focus:border-brand focus:ring-2 focus:ring-brand-100 transition-all"
                                        />
                                        <button onClick={() => setShowGeminiKey(v => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-n400 hover:text-n600">
                                            {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <p className="text-xs text-n400">
                                        Google AI Studio'dan ücretsiz alabilirsiniz.{' '}
                                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-brand hover:underline">Ücretsiz al →</a>
                                    </p>
                                    <button onClick={handleSaveGeminiKey} disabled={savingGeminiKey || !geminiKey.trim()}
                                        className={`w-full py-2.5 rounded-md font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${
                                            geminiKeySaved ? 'bg-ok text-white' : 'bg-brand hover:bg-brand-600 text-white'
                                        }`}>
                                        {savingGeminiKey ? <><Loader2 className="w-4 h-4 animate-spin" /> Kaydediliyor...</>
                                            : geminiKeySaved ? <><CheckCircle className="w-4 h-4" /> Kaydedildi!</>
                                            : <><ShieldCheck className="w-4 h-4" /> Anahtarı Kaydet</>}
                                    </button>
                                </div>
                            </div>

                            {/* STT Test */}
                            <div className="bg-n0 rounded-[14px] border border-n200 p-6">
                                <div className="flex items-center gap-3 mb-5 pb-4 border-b border-n200">
                                    <div className="w-9 h-9 rounded-md bg-brand-50 border border-brand-100 flex items-center justify-center">
                                        <Activity className="w-4.5 h-4.5 text-brand" />
                                    </div>
                                    <div>
                                        <h2 className="text-sm font-semibold text-n900">Ses Tanıma Motoru Testi</h2>
                                        <p className="text-xs text-n400">STT motorunun çalışırlığını doğrulayın</p>
                                    </div>
                                </div>
                                <div className="rounded-md border border-n200 p-4 bg-n50">
                                    <div className="flex items-center gap-4">
                                        <button onClick={toggleSttTest}
                                            className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                                                sttStatus === 'listening' ? 'bg-bad-bg border-2 border-bad text-bad scale-110'
                                                : sttStatus === 'success' ? 'bg-ok-bg border-2 border-ok text-ok'
                                                : 'bg-n0 border border-n200 text-n400 hover:border-brand hover:text-brand'
                                            }`}>
                                            {sttStatus === 'listening' ? <MicOff size={17} className="animate-pulse" /> : <Mic size={17} />}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Zap size={11} className={sttStatus === 'listening' ? 'text-brand' : 'text-n400'} />
                                                <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-n500">STT Nöral Motor</span>
                                                <span className={`ml-auto text-[11px] font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full ${
                                                    sttStatus === 'listening' ? 'bg-bad-bg text-bad border border-transparent'
                                                    : sttStatus === 'success' ? 'bg-ok-bg text-ok border border-transparent'
                                                    : sttStatus === 'error' ? 'bg-bad-bg text-bad border border-transparent'
                                                    : 'bg-n100 text-n400'
                                                }`}>
                                                    {sttStatus === 'idle' && 'Hazır'}
                                                    {sttStatus === 'listening' && 'Dinleniyor'}
                                                    {sttStatus === 'success' && 'Başarılı'}
                                                    {sttStatus === 'error' && 'Hata'}
                                                </span>
                                            </div>
                                            <div className="text-[12px] text-n500 min-h-[18px]">
                                                {sttStatus === 'idle' && 'Mikrofon butonuna basarak testi başlatın.'}
                                                {sttStatus === 'listening' && (
                                                    <span className="flex items-center gap-1 text-brand">
                                                        Konuşun, dinliyorum
                                                        <span className="animate-bounce inline-block" style={{ animationDelay: '0ms' }}>.</span>
                                                        <span className="animate-bounce inline-block" style={{ animationDelay: '150ms' }}>.</span>
                                                        <span className="animate-bounce inline-block" style={{ animationDelay: '300ms' }}>.</span>
                                                    </span>
                                                )}
                                                {sttStatus === 'success' && sttResult && <span className="text-ok italic">"{sttResult}"</span>}
                                                {sttStatus === 'error' && <span className="text-bad">Mikrofon erişimi sağlanamadı.</span>}
                                            </div>
                                        </div>
                                        <button onClick={toggleSttTest}
                                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all shrink-0 border ${
                                                sttStatus === 'listening'
                                                    ? 'bg-bad-bg text-bad border-transparent hover:opacity-90'
                                                    : 'bg-brand-50 text-brand border-brand-100 hover:bg-brand-100'
                                            }`}>
                                            {sttStatus === 'listening' ? 'Durdur' : sttStatus === 'success' ? 'Tekrar Test Et' : 'Testi Başlat'}
                                        </button>
                                    </div>
                                    <div className="flex items-end gap-0.5 mt-4 h-7 px-1">
                                        {[...Array(24)].map((_, i) => (
                                            <div key={i} className="flex-1 rounded-full transition-all duration-150"
                                                style={{
                                                    backgroundColor: sttStatus === 'listening' ? '#06B6D4' : sttStatus === 'success' ? '#10B981' : '#E2E8F0',
                                                    height: sttStatus === 'listening' ? `${20 + Math.abs(Math.sin(i * 0.7 + Date.now() * 0.001)) * 80}%` : sttStatus === 'success' ? '60%' : '20%',
                                                    opacity: sttStatus === 'listening' ? 0.5 + (i % 3) * 0.2 : 0.7,
                                                }}
                                            />
                                        ))}
                                    </div>
                                    {sttStatus === 'success' && sttEmotion && (
                                        <div className="mt-4 border-t border-n200 pt-4">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-n400 mb-3 flex items-center gap-1.5">
                                                <Activity size={10} className="text-brand" /> Ses Duygu Analizi
                                            </p>
                                            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                                                {[
                                                    { label: 'Stres', value: sttEmotion.stress, color: '#EF4444' },
                                                    { label: 'Heyecan', value: sttEmotion.excitement, color: '#F59E0B' },
                                                    { label: 'Özgüven', value: sttEmotion.confidence, color: '#10B981' },
                                                    { label: 'Tereddüt', value: sttEmotion.hesitation, color: '#8B5CF6' },
                                                ].map(({ label, value, color }) => (
                                                    <div key={label}>
                                                        <div className="flex justify-between mb-1">
                                                            <span className="text-[11px] text-n500">{label}</span>
                                                            <span className="text-[11px] font-semibold" style={{ color }}>{value}%</span>
                                                        </div>
                                                        <div className="h-1.5 bg-n100 rounded-full overflow-hidden">
                                                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, backgroundColor: color }} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <p className="text-[12px] text-n400 mt-3">
                                    Bu test, mülakatlarda kullanılan Gemini tabanlı ses tanıma motorunun cihazınızda düzgün çalışıp çalışmadığını doğrular.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ── Kurumsal Kimlik ─────────────────────────── */}
                    {activeSection === 'branding' && (
                        <div className="px-6 lg:px-8 py-8 max-w-3xl mx-auto">
                            <BrandingSettingsPage />
                        </div>
                    )}

                    {/* ── E-posta Şablonları ──────────────────────── */}
                    {activeSection === 'email_templates' && (
                        <div className="flex flex-col h-full min-h-0">
                            <EmailTemplateEditorPage />
                        </div>
                    )}

                    {/* ── Kaynak Yönetimi ─────────────────────────── */}
                    {activeSection === 'sources' && (
                        <div className="px-6 lg:px-8 py-8 max-w-5xl mx-auto">
                            <SourceManagementPage />
                        </div>
                    )}

                    {/* ── Departmanlar ────────────────────────────── */}
                    {activeSection === 'departments' && (
                        <div className="px-6 lg:px-8 py-8 max-w-5xl mx-auto">
                            <DepartmentManagementPage />
                        </div>
                    )}

                    {/* ── Platform Kılavuzu ───────────────────────── */}
                    {activeSection === 'guide' && (
                        <div>
                            <GuidePage />
                        </div>
                    )}

                    {/* ── Sistem Yönetimi ─────────────────────────── */}
                    {activeSection === 'system' && (
                        <div>
                            <SuperAdminPage />
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

function SectionHeader({ icon: Icon, title, desc }) {
    return (
        <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-md bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                <Icon className="w-4.5 h-4.5 text-brand" />
            </div>
            <div>
                <h2 className="text-base font-semibold text-n900">{title}</h2>
                <p className="text-xs text-n400">{desc}</p>
            </div>
        </div>
    );
}

function SettingRow({ icon: Icon, label, description, children, noBorder }) {
    return (
        <div className={`flex items-center justify-between py-4 ${!noBorder ? 'border-b border-n200' : ''}`}>
            <div className="flex items-center gap-3">
                <Icon className="w-4 h-4 text-n400 shrink-0" />
                <div>
                    <p className="text-sm font-medium text-n700">{label}</p>
                    {description && <p className="text-xs text-n400 mt-0.5">{description}</p>}
                </div>
            </div>
            <div className="ml-4 shrink-0">{children}</div>
        </div>
    );
}

function Select({ value, onChange, options }) {
    return (
        <select
            value={value}
            onChange={e => onChange(e.target.value)}
            className="bg-n50 border border-n200 rounded-md px-3 py-1.5 text-sm text-n700 outline-none focus:border-brand cursor-pointer"
        >
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    );
}

function Toggle({ checked, onChange }) {
    return (
        <button
            onClick={() => onChange(!checked)}
            className={`w-11 h-6 rounded-full transition-colors duration-200 relative ${checked ? 'bg-brand' : 'bg-n200'}`}
        >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-n0 shadow-sm transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
    );
}
