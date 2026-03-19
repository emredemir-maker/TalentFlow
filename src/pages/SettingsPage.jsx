// src/pages/SettingsPage.jsx
// Tabbed settings page: Genel Ayarlar | Kaynak Yönetimi | Departmanlar | Platform Kılavuzu | Sistem Yönetimi

import { useState, useRef } from 'react';
import { useUserSettings } from '../context/UserSettingsContext';
import { useAuth } from '../context/AuthContext';
import {
    Settings, Palette, Globe, Bell, LayoutGrid, Hash, Mail,
    CheckCircle, Loader2, Mic, MicOff, Zap, Activity,
    Share2, Building2, BookOpen, Shield
} from 'lucide-react';
import { connectGoogleWorkspace, disconnectGoogleWorkspace } from '../services/integrationService';
import { GoogleGenerativeAI } from '@google/generative-ai';

import SourceManagementPage from './SourceManagementPage';
import DepartmentManagementPage from './DepartmentManagementPage';
import GuidePage from './GuidePage';
import SuperAdminPage from './SuperAdminPage';

const TABS = [
    { id: 'general',      label: 'Genel Ayarlar',    icon: Settings  },
    { id: 'sources',      label: 'Kaynak Yönetimi',  icon: Share2    },
    { id: 'departments',  label: 'Departmanlar',      icon: Building2 },
    { id: 'guide',        label: 'Platform Kılavuzu', icon: BookOpen  },
    { id: 'system',       label: 'Sistem Yönetimi',   icon: Shield    },
];

export default function SettingsPage({ initialTab }) {
    const { settings, loading, updateSettings } = useUserSettings();
    const { userProfile, userId } = useAuth();
    const [activeTab, setActiveTab] = useState(initialTab || 'general');
    const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);

    // STT Test States
    const [sttStatus, setSttStatus] = useState('idle');
    const [sttResult, setSttResult] = useState('');
    const [sttEmotion, setSttEmotion] = useState(null);
    const mediaRecorderRef = useRef(null);
    const sttIntervalRef = useRef(null);
    const audioChunksRef = useRef([]);
    const sttActiveRef = useRef(false);

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
                if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            recorder.onstop = async () => {
                const chunks = audioChunksRef.current;
                audioChunksRef.current = [];
                if (chunks.length > 0) {
                    const blob = new Blob(chunks, { type: mimeType });
                    if (blob.size >= 1000) {
                        try {
                            const arrayBuffer = await blob.arrayBuffer();
                            const bytes = new Uint8Array(arrayBuffer);
                            let binary = '';
                            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                            const base64Audio = btoa(binary);
                            const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
                            const genAI = new GoogleGenerativeAI(apiKey);
                            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
                            const result = await model.generateContent([
                                { inlineData: { data: base64Audio, mimeType: mimeType.split(';')[0] } },
                                `Bu ses dosyasını analiz et. YALNIZCA aşağıdaki JSON formatında yanıt döndür, başka hiçbir şey yazma:\n{"text":"türkçe transkript metni","stress":30,"excitement":70,"confidence":60,"hesitation":20}\nKurallar:\n- text: konuşulan Türkçe sözcükler. Konuşma yoksa boş string.\n- stress: stres/gerginlik seviyesi 0-100\n- excitement: heyecan/coşku seviyesi 0-100\n- confidence: özgüven/kararlılık seviyesi 0-100\n- hesitation: tereddüt/dolgu sesi seviyesi 0-100\n- Skorlar 0-100 arası tam sayı olmalı.\n- 'Sessizlik', 'Ses yok', 'Boş' gibi ifadeler text alanına YAZMA.`
                            ]);
                            const raw = result.response.text().trim();
                            let text = raw;
                            let parsedEmotion = null;
                            try {
                                const m = raw.match(/\{[\s\S]*\}/);
                                if (m) {
                                    const parsed = JSON.parse(m[0]);
                                    text = typeof parsed.text === 'string' ? parsed.text : '';
                                    parsedEmotion = {
                                        stress: Math.min(100, Math.max(0, parseInt(parsed.stress) || 0)),
                                        excitement: Math.min(100, Math.max(0, parseInt(parsed.excitement) || 0)),
                                        confidence: Math.min(100, Math.max(0, parseInt(parsed.confidence) || 0)),
                                        hesitation: Math.min(100, Math.max(0, parseInt(parsed.hesitation) || 0)),
                                    };
                                }
                            } catch { }
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
                alert(`✅ Google hesabı (${res.email}) başarıyla bağlandı!`);
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

    if (loading || !userProfile) {
        return (
            <div className="flex items-center justify-center h-64 bg-slate-50 min-h-screen">
                <div className="w-7 h-7 border-2 border-slate-200 border-t-cyan-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-slate-50">
            {/* Sticky Header with Tabs */}
            <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-6 lg:px-8">
                <div className="h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-cyan-50 border border-cyan-100 flex items-center justify-center">
                            <Settings className="w-4 h-4 text-cyan-600" />
                        </div>
                        <h1 className="text-base font-bold text-slate-800">Ayarlar</h1>
                    </div>
                </div>
                {/* Tab Bar */}
                <div className="flex gap-1 pb-0 -mb-px overflow-x-auto no-scrollbar">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                                    activeTab === tab.id
                                        ? 'border-cyan-500 text-cyan-600'
                                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                                }`}
                            >
                                <Icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </header>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto">
                {activeTab === 'general' && (
                    <div className="px-6 lg:px-8 py-8 max-w-2xl mx-auto space-y-6">

                        {/* Preferences Card */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-0">
                            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-100">
                                <div className="w-9 h-9 rounded-xl bg-cyan-50 border border-cyan-100 flex items-center justify-center">
                                    <Settings className="w-4.5 h-4.5 text-cyan-600" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-slate-800">Tercihler</h2>
                                    <p className="text-xs text-slate-400">Uygulama ayarlarınızı özelleştirin</p>
                                </div>
                            </div>

                            <SettingRow icon={Palette} label="Tema" description="Arayüz temasını seçin">
                                <Select value={settings.theme} onChange={(v) => updateSettings({ theme: v })}
                                    options={[{ value: 'dark', label: '🌙 Koyu' }, { value: 'light', label: '☀️ Açık' }]} />
                            </SettingRow>
                            <SettingRow icon={Globe} label="Dil" description="Arayüz dilini değiştirin">
                                <Select value={settings.language} onChange={(v) => updateSettings({ language: v })}
                                    options={[{ value: 'tr', label: '🇹🇷 Türkçe' }, { value: 'en', label: '🇬🇧 English' }]} />
                            </SettingRow>
                            <SettingRow icon={Bell} label="Bildirimler" description="E-posta bildirimlerini yönetin">
                                <Toggle checked={settings.notifications} onChange={(v) => updateSettings({ notifications: v })} />
                            </SettingRow>
                            <SettingRow icon={LayoutGrid} label="Dashboard Düzeni" description="Kart yerleşimi">
                                <Select value={settings.dashboardLayout} onChange={(v) => updateSettings({ dashboardLayout: v })}
                                    options={[{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'Liste' }]} />
                            </SettingRow>
                            <SettingRow icon={Hash} label="Sayfa Başına Aday" description="Görüntüleme limiti" noBorder>
                                <Select value={settings.candidatesPerPage} onChange={(v) => updateSettings({ candidatesPerPage: parseInt(v) })}
                                    options={[{ value: 6, label: '6' }, { value: 12, label: '12' }, { value: 24, label: '24' }, { value: 48, label: '48' }]} />
                            </SettingRow>
                        </div>

                        {/* STT Test Card */}
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
                                    <button
                                        onClick={toggleSttTest}
                                        className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                                            sttStatus === 'listening' ? 'bg-red-50 border-2 border-red-300 text-red-500 scale-110'
                                            : sttStatus === 'success' ? 'bg-emerald-50 border-2 border-emerald-300 text-emerald-500'
                                            : 'bg-white border border-slate-200 text-slate-400 hover:border-cyan-400 hover:text-cyan-500'
                                        }`}
                                    >
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
                                    <button
                                        onClick={toggleSttTest}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 border ${
                                            sttStatus === 'listening'
                                                ? 'bg-red-50 text-red-500 border-red-200 hover:bg-red-100'
                                                : 'bg-cyan-50 text-cyan-600 border-cyan-200 hover:bg-cyan-100'
                                        }`}
                                    >
                                        {sttStatus === 'listening' ? 'Durdur' : sttStatus === 'success' ? 'Tekrar Test Et' : 'Testi Başlat'}
                                    </button>
                                </div>

                                {/* Audio visualizer */}
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

                                {/* Emotion Analysis */}
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

                        {/* Integrations Card */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-6">
                            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-100">
                                <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center">
                                    <Mail className="w-4.5 h-4.5 text-purple-500" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-slate-800">Entegrasyonlar</h2>
                                    <p className="text-xs text-slate-400">Takvim ve e-posta hesaplarınızı bağlayın</p>
                                </div>
                            </div>

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

                {activeTab === 'sources' && (
                    <div className="px-6 lg:px-8 py-8 max-w-5xl mx-auto">
                        <SourceManagementPage />
                    </div>
                )}

                {activeTab === 'departments' && (
                    <div className="px-6 lg:px-8 py-8 max-w-5xl mx-auto">
                        <DepartmentManagementPage />
                    </div>
                )}

                {activeTab === 'guide' && (
                    <div>
                        <GuidePage />
                    </div>
                )}

                {activeTab === 'system' && (
                    <div>
                        <SuperAdminPage />
                    </div>
                )}
            </div>
        </div>
    );
}


function SettingRow({ icon: Icon, label, description, children, noBorder }) {
    return (
        <div className={`flex items-center justify-between py-4 gap-4 ${noBorder ? '' : 'border-b border-slate-100'}`}>
            <div className="flex items-center gap-3 min-w-0">
                <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-700">{label}</div>
                    <div className="text-xs text-slate-400">{description}</div>
                </div>
            </div>
            {children}
        </div>
    );
}

function Select({ value, onChange, options }) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-50 transition-all cursor-pointer"
        >
            {options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
            ))}
        </select>
    );
}

function Toggle({ checked, onChange }) {
    return (
        <button
            onClick={() => onChange(!checked)}
            className={`relative w-10 h-5.5 rounded-full transition-all cursor-pointer ${checked ? 'bg-cyan-500' : 'bg-slate-200'}`}
        >
            <div className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0'}`} />
        </button>
    );
}
