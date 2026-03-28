// src/pages/SettingsPage.jsx
import { useState, useRef, useEffect } from 'react';
import { useUserSettings } from '../context/UserSettingsContext';
import { useAuth } from '../context/AuthContext';
import {
    Settings, Palette, Bell, Mail,
    CheckCircle, Loader2, Mic, MicOff, Zap, Activity,
    Share2, Building2, BookOpen, Shield, Key, Eye, EyeOff,
    ShieldCheck, Link2, ChevronRight
} from 'lucide-react';
import { connectGoogleWorkspace, disconnectGoogleWorkspace } from '../services/integrationService';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGlobalGeminiKey } from '../services/ai/config.js';
import { db } from '../config/firebase';
import { doc, setDoc } from 'firebase/firestore';

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
            { id: 'preferences',   label: 'Tercihler',          icon: Settings,  adminOnly: false },
            { id: 'integrations',  label: 'Entegrasyonlar',      icon: Link2,     adminOnly: false },
            { id: 'api_keys',      label: 'API & Ses Motoru',    icon: Key,       adminOnly: false },
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
        group: 'Yardım',
        items: [
            { id: 'guide', label: 'Platform Kılavuzu', icon: BookOpen, adminOnly: false },
        ],
    },
    {
        group: 'Yönetim',
        adminOnly: true,
        items: [
            { id: 'system', label: 'Sistem Yönetimi', icon: Shield, adminOnly: true },
        ],
    },
];

export default function SettingsPage({ initialTab }) {
    const { settings, loading, updateSettings } = useUserSettings();
    const { userProfile, userId } = useAuth();
    const [activeSection, setActiveSection] = useState(initialTab || 'preferences');
    const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

    // STT Test States
    const [sttStatus, setSttStatus] = useState('idle');
    const [sttResult, setSttResult] = useState('');
    const [sttEmotion, setSttEmotion] = useState(null);
    const mediaRecorderRef = useRef(null);
    const sttIntervalRef = useRef(null);
    const audioChunksRef = useRef([]);
    const sttActiveRef = useRef(false);

    // Gemini API Key
    const [geminiKey, setGeminiKey] = useState('');
    const [showGeminiKey, setShowGeminiKey] = useState(false);
    const [savingGeminiKey, setSavingGeminiKey] = useState(false);
    const [geminiKeySaved, setGeminiKeySaved] = useState(false);

    useEffect(() => {
        getGlobalGeminiKey().then(k => { if (k) setGeminiKey(k); });
    }, []);

    const handleSaveGeminiKey = async () => {
        if (!geminiKey.trim()) return;
        setSavingGeminiKey(true);
        try {
            await setDoc(doc(db, 'artifacts/talent-flow/public/data/settings', 'api_keys'), { gemini: geminiKey.trim() }, { merge: true });
            setGeminiKeySaved(true);
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

    const isGoogleConnected = userProfile?.integrations?.google?.connected;
    const isSuperAdmin = userProfile?.role === 'super_admin';

    if (loading || !userProfile) {
        return (
            <div className="flex items-center justify-center h-64 bg-slate-50 min-h-screen">
                <div className="w-7 h-7 border-2 border-slate-200 border-t-cyan-500 rounded-full animate-spin" />
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
        <div className="flex flex-col min-h-screen bg-slate-50">
            {/* Top header */}
            <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-6 lg:px-8 h-14 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-50 border border-cyan-100 flex items-center justify-center">
                    <Settings className="w-4 h-4 text-cyan-600" />
                </div>
                <h1 className="text-base font-bold text-slate-800">Ayarlar</h1>
                {currentItem && (
                    <>
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                        <span className="text-sm text-slate-500 font-medium">{currentItem.label}</span>
                    </>
                )}
            </header>

            <div className="flex flex-1 min-h-0">
                {/* Sidebar */}
                <aside className="w-56 shrink-0 bg-white border-r border-slate-200 overflow-y-auto hidden md:block">
                    <nav className="py-4 px-3 space-y-6">
                        {NAV_GROUPS.map(group => {
                            const visibleItems = group.items.filter(i => !i.adminOnly || isSuperAdmin);
                            if (group.adminOnly && !isSuperAdmin) return null;
                            if (visibleItems.length === 0) return null;
                            return (
                                <div key={group.group}>
                                    <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
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
                                                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${
                                                            isActive
                                                                ? 'bg-cyan-50 text-cyan-700 border border-cyan-100'
                                                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800 border border-transparent'
                                                        }`}
                                                    >
                                                        <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-cyan-600' : 'text-slate-400'}`} />
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

                    {/* ── Tercihler ───────────────────────────────── */}
                    {activeSection === 'preferences' && (
                        <div className="px-6 lg:px-8 py-8 max-w-2xl mx-auto space-y-6">
                            <SectionHeader icon={Settings} title="Tercihler" desc="Uygulama görünümü ve bildirim ayarları" />
                            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-0">
                                <SettingRow icon={Palette} label="Tema" description="Arayüz temasını seçin">
                                    <Select value={settings.theme} onChange={(v) => updateSettings({ theme: v })}
                                        options={[{ value: 'dark', label: '🌙 Koyu' }, { value: 'light', label: '☀️ Açık' }]} />
                                </SettingRow>
                                <SettingRow icon={Bell} label="Uygulama Bildirimleri" description="Bildirim rozeti ve paneli göster / gizle" noBorder>
                                    <Toggle checked={settings.notifications !== false} onChange={(v) => updateSettings({ notifications: v })} />
                                </SettingRow>
                            </div>
                        </div>
                    )}

                    {/* ── Entegrasyonlar ──────────────────────────── */}
                    {activeSection === 'integrations' && (
                        <div className="px-6 lg:px-8 py-8 max-w-2xl mx-auto space-y-6">
                            <SectionHeader icon={Link2} title="Entegrasyonlar" desc="Takvim ve e-posta hesaplarınızı bağlayın" />
                            <div className="bg-white rounded-2xl border border-slate-200 p-6">
                                <div className="flex items-center justify-between py-3">
                                    <div className="flex items-center gap-4">
                                        <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center shadow-sm shrink-0 overflow-hidden p-2 border border-slate-100">
                                            <svg viewBox="0 0 24 24" className="w-full h-full">
                                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                                <path d="M1 1h22v22H1z" fill="none" />
                                            </svg>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                                                Google Workspace
                                                {isGoogleConnected && <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                                            </div>
                                            <div className="text-xs text-slate-400 mt-0.5">
                                                {isGoogleConnected
                                                    ? <span>Bağlı: <span className="text-emerald-600 font-medium">{userProfile.integrations.google.email}</span></span>
                                                    : 'Gmail ve Google Calendar ile entegre edin.'}
                                            </div>
                                        </div>
                                    </div>
                                    {isGoogleConnected ? (
                                        <button onClick={handleGoogleDisconnect} disabled={isConnectingGoogle}
                                            className="px-4 py-2 rounded-xl text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 transition-all border border-red-100 disabled:opacity-50">
                                            {isConnectingGoogle ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Bağlantıyı Kes'}
                                        </button>
                                    ) : (
                                        <button onClick={handleGoogleConnect} disabled={isConnectingGoogle}
                                            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-cyan-500 hover:bg-cyan-600 transition-all flex items-center gap-2 disabled:opacity-50">
                                            {isConnectingGoogle ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Bağlan'}
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
                            <div className="bg-white rounded-2xl border border-slate-200 p-6">
                                <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-100">
                                    <div className="w-9 h-9 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center">
                                        <Key className="w-4 h-4 text-violet-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-sm font-bold text-slate-800">Gemini API Anahtarı</h2>
                                        <p className="text-xs text-slate-400">CV analizi, mülakat soruları ve ses tanıma için gereklidir</p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="relative">
                                        <input
                                            type={showGeminiKey ? 'text' : 'password'}
                                            value={geminiKey}
                                            onChange={e => setGeminiKey(e.target.value)}
                                            placeholder="AIzaSy..."
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 text-sm text-slate-700 font-mono outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 transition-all"
                                        />
                                        <button onClick={() => setShowGeminiKey(v => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                            {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <p className="text-xs text-slate-400">
                                        Google AI Studio'dan ücretsiz alabilirsiniz.{' '}
                                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-cyan-600 hover:underline">Ücretsiz al →</a>
                                    </p>
                                    <button onClick={handleSaveGeminiKey} disabled={savingGeminiKey || !geminiKey.trim()}
                                        className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${
                                            geminiKeySaved ? 'bg-emerald-500 text-white' : 'bg-cyan-500 hover:bg-cyan-600 text-white'
                                        }`}>
                                        {savingGeminiKey ? <><Loader2 className="w-4 h-4 animate-spin" /> Kaydediliyor...</>
                                            : geminiKeySaved ? <><CheckCircle className="w-4 h-4" /> Kaydedildi!</>
                                            : <><ShieldCheck className="w-4 h-4" /> Anahtarı Kaydet</>}
                                    </button>
                                </div>
                            </div>

                            {/* STT Test */}
                            <div className="bg-white rounded-2xl border border-slate-200 p-6">
                                <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-100">
                                    <div className="w-9 h-9 rounded-xl bg-cyan-50 border border-cyan-100 flex items-center justify-center">
                                        <Activity className="w-4.5 h-4.5 text-cyan-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-sm font-bold text-slate-800">Ses Tanıma Motoru Testi</h2>
                                        <p className="text-xs text-slate-400">STT motorunun çalışırlığını doğrulayın</p>
                                    </div>
                                </div>
                                <div className="rounded-xl border border-slate-100 p-4 bg-slate-50">
                                    <div className="flex items-center gap-4">
                                        <button onClick={toggleSttTest}
                                            className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                                                sttStatus === 'listening' ? 'bg-red-50 border-2 border-red-300 text-red-500 scale-110'
                                                : sttStatus === 'success' ? 'bg-emerald-50 border-2 border-emerald-300 text-emerald-500'
                                                : 'bg-white border border-slate-200 text-slate-400 hover:border-cyan-400 hover:text-cyan-500'
                                            }`}>
                                            {sttStatus === 'listening' ? <MicOff size={17} className="animate-pulse" /> : <Mic size={17} />}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Zap size={11} className={sttStatus === 'listening' ? 'text-cyan-500' : 'text-slate-400'} />
                                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">STT Nöral Motor</span>
                                                <span className={`ml-auto text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                                                    sttStatus === 'listening' ? 'bg-red-50 text-red-500 border border-red-200'
                                                    : sttStatus === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                                    : sttStatus === 'error' ? 'bg-red-50 text-red-500 border border-red-200'
                                                    : 'bg-slate-100 text-slate-400'
                                                }`}>
                                                    {sttStatus === 'idle' && 'Hazır'}
                                                    {sttStatus === 'listening' && 'Dinleniyor'}
                                                    {sttStatus === 'success' && 'Başarılı'}
                                                    {sttStatus === 'error' && 'Hata'}
                                                </span>
                                            </div>
                                            <div className="text-[12px] text-slate-500 min-h-[18px]">
                                                {sttStatus === 'idle' && 'Mikrofon butonuna basarak testi başlatın.'}
                                                {sttStatus === 'listening' && (
                                                    <span className="flex items-center gap-1 text-cyan-600">
                                                        Konuşun, dinliyorum
                                                        <span className="animate-bounce inline-block" style={{ animationDelay: '0ms' }}>.</span>
                                                        <span className="animate-bounce inline-block" style={{ animationDelay: '150ms' }}>.</span>
                                                        <span className="animate-bounce inline-block" style={{ animationDelay: '300ms' }}>.</span>
                                                    </span>
                                                )}
                                                {sttStatus === 'success' && sttResult && <span className="text-emerald-600 italic">"{sttResult}"</span>}
                                                {sttStatus === 'error' && <span className="text-red-500">Mikrofon erişimi sağlanamadı.</span>}
                                            </div>
                                        </div>
                                        <button onClick={toggleSttTest}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 border ${
                                                sttStatus === 'listening'
                                                    ? 'bg-red-50 text-red-500 border-red-200 hover:bg-red-100'
                                                    : 'bg-cyan-50 text-cyan-600 border-cyan-200 hover:bg-cyan-100'
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
                                        <div className="mt-4 border-t border-slate-100 pt-4">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                                                <Activity size={10} className="text-cyan-500" /> Ses Duygu Analizi
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
                                                            <span className="text-[10px] text-slate-500">{label}</span>
                                                            <span className="text-[10px] font-bold" style={{ color }}>{value}%</span>
                                                        </div>
                                                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, backgroundColor: color }} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <p className="text-[11px] text-slate-400 mt-3">
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
            <div className="w-9 h-9 rounded-xl bg-cyan-50 border border-cyan-100 flex items-center justify-center shrink-0">
                <Icon className="w-4.5 h-4.5 text-cyan-600" />
            </div>
            <div>
                <h2 className="text-base font-bold text-slate-800">{title}</h2>
                <p className="text-xs text-slate-400">{desc}</p>
            </div>
        </div>
    );
}

function SettingRow({ icon: Icon, label, description, children, noBorder }) {
    return (
        <div className={`flex items-center justify-between py-4 ${!noBorder ? 'border-b border-slate-100' : ''}`}>
            <div className="flex items-center gap-3">
                <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                    <p className="text-sm font-medium text-slate-700">{label}</p>
                    {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
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
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-cyan-400 cursor-pointer"
        >
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    );
}

function Toggle({ checked, onChange }) {
    return (
        <button
            onClick={() => onChange(!checked)}
            className={`w-11 h-6 rounded-full transition-colors duration-200 relative ${checked ? 'bg-cyan-500' : 'bg-slate-200'}`}
        >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
    );
}
