import { useState, useRef } from 'react';
import { useUserSettings } from '../context/UserSettingsContext';
import { useAuth } from '../context/AuthContext';
import { Settings, Palette, Globe, Bell, LayoutGrid, Hash, Mail, CheckCircle, Loader2, Mic, MicOff, Zap, Activity } from 'lucide-react';
import { connectGoogleWorkspace, disconnectGoogleWorkspace } from '../services/integrationService';


export default function SettingsPage() {
    const { settings, loading, updateSettings } = useUserSettings();
    const { userProfile, userId } = useAuth();
    const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);

    // STT Test States
    const [sttStatus, setSttStatus] = useState('idle'); // idle | listening | success | error
    const [sttResult, setSttResult] = useState('');
    const streamRef = useRef(null);
    const sttActiveRef = useRef(false);

    const stopSttTest = () => {
        sttActiveRef.current = false;
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        setSttStatus('idle');
        setSttResult('');
    };

    // Recursive recording cycle: each cycle records ~4s, sends to API, then starts the next cycle.
    // This avoids the stop()->start() race condition by only calling start() inside onstop.
    const runCycle = (stream) => {
        if (!sttActiveRef.current) return;

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm';

        const recorder = new MediaRecorder(stream, { mimeType });
        const chunks = [];

        recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = async () => {
            if (!sttActiveRef.current) return;

            const blob = new Blob(chunks, { type: mimeType });
            if (blob.size >= 2000) {
                try {
                    const formData = new FormData();
                    formData.append('audio', blob, 'stt-test.webm');
                    const res = await fetch('/api/gemini-stt', { method: 'POST', body: formData });
                    const data = await res.json();
                    const text = data.text?.trim();
                    if (text && sttActiveRef.current) {
                        setSttResult(text);
                        setSttStatus('success');
                        sttActiveRef.current = false;
                        stream.getTracks().forEach(t => t.stop());
                        streamRef.current = null;
                        return;
                    }
                } catch (e) {
                    console.error('[STT Test]', e);
                }
            }

            // Start the next 4-second cycle
            setTimeout(() => runCycle(stream), 100);
        };

        recorder.start();
        // Stop after 4 seconds to trigger onstop → API call → next cycle
        setTimeout(() => {
            if (recorder.state === 'recording') recorder.stop();
        }, 4000);
    };

    const toggleSttTest = async () => {
        if (sttStatus === 'listening') {
            stopSttTest();
            return;
        }
        setSttResult('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            sttActiveRef.current = true;
            setSttStatus('listening');
            runCycle(stream);
        } catch {
            setSttStatus('error');
        }
    };

    if (loading || !userProfile) {
        return (
            <div className="flex items-center justify-center h-64 relative isolate min-h-screen">

                <div className="w-8 h-8 border-[3px] border-navy-800 border-t-electric rounded-full animate-spin" />
            </div>
        );
    }

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
        } catch (err) {
            console.error(err);
        } finally {
            setIsConnectingGoogle(false);
        }
    };

    const handleGoogleDisconnect = async () => {
        if (!window.confirm("Google bağlantısını kesmek istediğinizden emin misiniz?")) return;
        setIsConnectingGoogle(true);
        try {
            const res = await disconnectGoogleWorkspace(userId);
            if (res.success) {
                window.location.reload();
            } else {
                alert(`Bağlantı kesme hatası: ${res.error}`);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsConnectingGoogle(false);
        }
    };

    const isGoogleConnected = userProfile?.integrations?.google?.connected;

    return (
        <div className="flex flex-col h-full bg-navy-950/20 relative isolate min-h-screen">


            {/* Header */}
            <header className="sticky top-0 z-40 px-6 lg:px-8 h-16 flex items-center justify-between border-b border-border-subtle bg-header-bg backdrop-blur-xl">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-text-primary to-text-muted bg-clip-text text-transparent">
                        Ayarlar & Destek
                    </h1>
                </div>

                <div className="flex p-1 bg-navy-800/20 rounded-xl border border-border-subtle shadow-inner">
                    <div className="px-4 py-1.5 rounded-lg text-xs font-bold bg-navy-800/40 text-text-primary shadow-lg flex items-center gap-2">
                        <Settings className="w-3.5 h-3.5" /> Genel Ayarlar
                    </div>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="px-6 lg:px-8 py-8 max-w-4xl mx-auto">

                    <div className="space-y-6 max-w-2xl">
                        <div className="glass rounded-2xl p-6 animate-fade-in-up space-y-0 border border-border-subtle">
                            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border-subtle">
                                <div className="w-10 h-10 rounded-xl bg-electric/10 flex items-center justify-center">
                                    <Settings className="w-5 h-5 text-electric-light" />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-text-primary">Tercihler</h2>
                                    <p className="text-[12px] text-text-muted">Uygulama ayarlarınızı özelleştirin</p>
                                </div>
                            </div>

                            <SettingRow icon={Palette} label="Tema" description="Arayüz temasını seçin">
                                <Select
                                    value={settings.theme}
                                    onChange={(v) => updateSettings({ theme: v })}
                                    options={[
                                        { value: 'dark', label: '🌙 Koyu' },
                                        { value: 'light', label: '☀️ Açık' },
                                    ]}
                                />
                            </SettingRow>

                            <SettingRow icon={Globe} label="Dil" description="Arayüz dilini değiştirin">
                                <Select
                                    value={settings.language}
                                    onChange={(v) => updateSettings({ language: v })}
                                    options={[
                                        { value: 'tr', label: '🇹🇷 Türkçe' },
                                        { value: 'en', label: '🇬🇧 English' },
                                    ]}
                                />
                            </SettingRow>

                            <SettingRow icon={Bell} label="Bildirimler" description="E-posta bildirimlerini yönetin">
                                <Toggle
                                    checked={settings.notifications}
                                    onChange={(v) => updateSettings({ notifications: v })}
                                />
                            </SettingRow>

                            <SettingRow icon={LayoutGrid} label="Dashboard Düzeni" description="Kart yerleşimi">
                                <Select
                                    value={settings.dashboardLayout}
                                    onChange={(v) => updateSettings({ dashboardLayout: v })}
                                    options={[
                                        { value: 'grid', label: 'Grid' },
                                        { value: 'list', label: 'Liste' },
                                    ]}
                                />
                            </SettingRow>

                            <SettingRow icon={Hash} label="Sayfa Başına Aday" description="Görüntüleme limiti" noBorder>
                                <Select
                                    value={settings.candidatesPerPage}
                                    onChange={(v) => updateSettings({ candidatesPerPage: parseInt(v) })}
                                    options={[
                                        { value: 6, label: '6' },
                                        { value: 12, label: '12' },
                                        { value: 24, label: '24' },
                                        { value: 48, label: '48' },
                                    ]}
                                />
                            </SettingRow>
                        </div>

                        {/* STT Diagnostics Section */}
                        <div className="glass rounded-2xl p-6 animate-fade-in-up space-y-0 relative overflow-hidden group border border-border-subtle">
                            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border-subtle relative z-10">
                                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                                    <Activity className="w-5 h-5 text-cyan-400" />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-text-primary">Ses Tanıma Motoru Testi</h2>
                                    <p className="text-[12px] text-text-muted">STT (Speech-to-Text) motorunun çalışırlığını test edin</p>
                                </div>
                            </div>

                            <div className="relative z-10 rounded-xl border border-border-subtle p-4 bg-navy-950/30">
                                <div className="flex items-center gap-4">
                                    {/* Mic Button */}
                                    <button
                                        onClick={toggleSttTest}
                                        className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                                            sttStatus === 'listening'
                                                ? 'bg-red-500/20 border-2 border-red-400/40 text-red-400 scale-110'
                                                : sttStatus === 'success'
                                                ? 'bg-emerald-500/20 border-2 border-emerald-400/40 text-emerald-400'
                                                : 'bg-navy-800/40 border border-border-subtle text-text-muted hover:border-cyan-500/40 hover:text-cyan-400'
                                        }`}
                                    >
                                        {sttStatus === 'listening' ? (
                                            <MicOff size={18} className="animate-pulse" />
                                        ) : (
                                            <Mic size={18} />
                                        )}
                                    </button>

                                    {/* Status Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Zap size={12} className={sttStatus === 'listening' ? 'text-cyan-400' : 'text-text-muted'} />
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">STT Nöral Motor</span>
                                            <span className={`ml-auto text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                                                sttStatus === 'listening' ? 'bg-red-500/15 text-red-400' :
                                                sttStatus === 'success' ? 'bg-emerald-500/15 text-emerald-400' :
                                                sttStatus === 'error' ? 'bg-red-500/15 text-red-400' :
                                                'bg-navy-800/40 text-text-muted'
                                            }`}>
                                                {sttStatus === 'idle' && 'Hazır'}
                                                {sttStatus === 'listening' && 'Dinleniyor'}
                                                {sttStatus === 'success' && 'Başarılı'}
                                                {sttStatus === 'error' && 'Hata'}
                                            </span>
                                        </div>
                                        <div className="text-[12px] text-text-muted min-h-[18px]">
                                            {sttStatus === 'idle' && 'Mikrofon butonuna basarak testi başlatın.'}
                                            {sttStatus === 'listening' && (
                                                <span className="flex items-center gap-1 text-cyan-400">
                                                    Konuşun, dinliyorum
                                                    <span className="animate-bounce inline-block" style={{ animationDelay: '0ms' }}>.</span>
                                                    <span className="animate-bounce inline-block" style={{ animationDelay: '150ms' }}>.</span>
                                                    <span className="animate-bounce inline-block" style={{ animationDelay: '300ms' }}>.</span>
                                                </span>
                                            )}
                                            {sttStatus === 'success' && sttResult && (
                                                <span className="text-emerald-400 italic">"{sttResult}"</span>
                                            )}
                                            {sttStatus === 'error' && (
                                                <span className="text-red-400">Mikrofon erişimi sağlanamadı. İzin ayarlarını kontrol edin.</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Button */}
                                    <button
                                        onClick={toggleSttTest}
                                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all shrink-0 ${
                                            sttStatus === 'listening'
                                                ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/20'
                                                : 'bg-electric/10 text-electric-light hover:bg-electric/20 border border-electric/20'
                                        }`}
                                    >
                                        {sttStatus === 'listening' ? 'Durdur' : sttStatus === 'success' ? 'Tekrar Test Et' : 'Testi Başlat'}
                                    </button>
                                </div>

                                {/* Audio visualizer bars */}
                                <div className="flex items-end gap-0.5 mt-4 h-8 px-1">
                                    {[...Array(24)].map((_, i) => (
                                        <div
                                            key={i}
                                            className="flex-1 rounded-full transition-all duration-150"
                                            style={{
                                                backgroundColor: sttStatus === 'listening' ? '#06B6D4' : sttStatus === 'success' ? '#10B981' : 'rgba(255,255,255,0.06)',
                                                height: sttStatus === 'listening'
                                                    ? `${20 + Math.abs(Math.sin(i * 0.7 + Date.now() * 0.001)) * 80}%`
                                                    : sttStatus === 'success' ? '60%' : '15%',
                                                opacity: sttStatus === 'listening' ? 0.5 + (i % 3) * 0.2 : 0.4,
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>

                            <p className="text-[11px] text-text-muted mt-3 relative z-10">
                                Bu test, mülakatlarda kullanılan Gemini tabanlı ses tanıma motorunun cihazınızda düzgün çalışıp çalışmadığını doğrular.
                            </p>
                        </div>

                        {/* Integrations Section */}
                        <div className="glass rounded-2xl p-6 animate-fade-in-up space-y-0 relative overflow-hidden group border border-border-subtle">
                            <div className="absolute inset-0 bg-gradient-to-br from-electric/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border-subtle relative z-10">
                                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                                    <Mail className="w-5 h-5 text-purple-400" />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-text-primary">Entegrasyonlar</h2>
                                    <p className="text-[12px] text-text-muted">Takvim ve e-posta hesaplarınızı bağlayın</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between py-4 relative z-10">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-lg shrink-0 overflow-hidden p-2.5">
                                        <svg viewBox="0 0 24 24" className="w-full h-full"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /><path d="M1 1h22v22H1z" fill="none" /></svg>
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-[14px] font-bold text-text-primary flex items-center gap-2">
                                            Google Workspace
                                            {isGoogleConnected && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
                                        </div>
                                        <div className="text-[11px] text-text-muted mt-0.5">
                                            {isGoogleConnected
                                                ? <span>Bağlı Hesap: <span className="text-emerald-400 font-medium">{userProfile.integrations.google.email}</span></span>
                                                : 'Gmail ile e-posta gönderin ve Google Calendar ile mülakat planlayın.'
                                            }
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    {isGoogleConnected ? (
                                        <button
                                            onClick={handleGoogleDisconnect}
                                            disabled={isConnectingGoogle}
                                            className="px-4 py-2 rounded-xl text-xs font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-all border border-red-500/20 disabled:opacity-50"
                                        >
                                            {isConnectingGoogle ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Bağlantıyı Kes'}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleGoogleConnect}
                                            disabled={isConnectingGoogle}
                                            className="relative px-5 py-2.5 rounded-xl text-xs font-black text-text-primary bg-gradient-to-r from-electric to-blue-500 hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] transition-all flex items-center gap-2 overflow-hidden group"
                                        >
                                            {isConnectingGoogle ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <>
                                                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                                                    <span className="relative z-10 uppercase tracking-widest">Bağlan</span>
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


function SettingRow({ icon: Icon, label, description, children, noBorder }) {
    return (
        <div className={`flex items-center justify-between py-4 gap-4 ${noBorder ? '' : 'border-b border-border-subtle'}`}>
            <div className="flex items-center gap-3 min-w-0">
                <Icon className="w-4 h-4 text-text-muted shrink-0" />
                <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-text-secondary">{label}</div>
                    <div className="text-[11px] text-text-muted">{description}</div>
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
            className="px-3 py-1.5 rounded-lg bg-navy-950/20 border border-border-subtle text-[12px] text-text-secondary outline-none focus:border-electric/40 transition-all cursor-pointer"
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
            className={`relative w-11 h-6 rounded-full transition-all cursor-pointer ${checked ? 'bg-electric' : 'bg-navy-700'
                }`}
        >
            <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'
                }`} />
        </button>
    );
}
