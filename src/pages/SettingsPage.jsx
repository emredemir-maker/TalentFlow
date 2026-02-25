import { useState } from 'react';
import { useUserSettings } from '../context/UserSettingsContext';
import { useAuth } from '../context/AuthContext';
import { Settings, Palette, Globe, Bell, LayoutGrid, Hash, Mail, Calendar, CheckCircle, Loader2, BookOpen, Info, Target, Users, Zap, Search, ShieldCheck, HelpCircle, Sparkles } from 'lucide-react';
import { connectGoogleWorkspace } from '../services/integrationService';

export default function SettingsPage() {
    const { settings, loading, updateSettings } = useUserSettings();
    const { userProfile, userId } = useAuth();
    const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
    const [activeTab, setActiveTab] = useState('general'); // 'general', 'guide'

    if (loading || !userProfile) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-[3px] border-navy-800 border-t-electric rounded-full animate-spin" />
            </div>
        );
    }

    const handleGoogleConnect = async () => {
        setIsConnectingGoogle(true);
        try {
            const res = await connectGoogleWorkspace(userId);
            if (res.success) {
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

    const isGoogleConnected = userProfile?.integrations?.google?.connected;

    return (
        <div className="flex flex-col h-full bg-navy-950/20">
            {/* Header */}
            <header className="sticky top-0 z-40 px-6 lg:px-8 h-16 flex items-center justify-between border-b border-white/[0.06] bg-navy-900/80 backdrop-blur-xl">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white to-navy-300 bg-clip-text text-transparent">
                        Ayarlar & Destek
                    </h1>
                </div>

                <div className="flex p-1 bg-white/5 rounded-xl border border-white/5 shadow-inner">
                    <button
                        onClick={() => setActiveTab('general')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'general' ? 'bg-white/10 text-white shadow-lg' : 'text-navy-400 hover:text-white'}`}
                    >
                        <Settings className="w-3.5 h-3.5" /> Genel Ayarlar
                    </button>
                    <button
                        onClick={() => setActiveTab('guide')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'guide' ? 'bg-white/10 text-white shadow-lg' : 'text-navy-400 hover:text-white'}`}
                    >
                        <BookOpen className="w-3.5 h-3.5" /> Kullanım Kılavuzu
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="px-6 lg:px-8 py-8 max-w-4xl mx-auto">

                    {activeTab === 'general' ? (
                        <div className="space-y-6 max-w-2xl">
                            <div className="glass rounded-2xl p-6 animate-fade-in-up space-y-0">
                                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/[0.06]">
                                    <div className="w-10 h-10 rounded-xl bg-electric/10 flex items-center justify-center">
                                        <Settings className="w-5 h-5 text-electric-light" />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-bold text-white">Tercihler</h2>
                                        <p className="text-[12px] text-navy-500">Uygulama ayarlarınızı özelleştirin</p>
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

                            {/* Integrations Section */}
                            <div className="glass rounded-2xl p-6 animate-fade-in-up space-y-0 relative overflow-hidden group">
                                <div className="absolute inset-0 bg-gradient-to-br from-electric/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/[0.06] relative z-10">
                                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                                        <Mail className="w-5 h-5 text-purple-400" />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-bold text-white">Entegrasyonlar</h2>
                                        <p className="text-[12px] text-navy-500">Takvim ve e-posta hesaplarınızı bağlayın</p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between py-4 relative z-10">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-lg shrink-0 overflow-hidden p-2.5">
                                            <svg viewBox="0 0 24 24" className="w-full h-full"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /><path d="M1 1h22v22H1z" fill="none" /></svg>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-[14px] font-bold text-white flex items-center gap-2">
                                                Google Workspace
                                                {isGoogleConnected && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
                                            </div>
                                            <div className="text-[11px] text-navy-400 mt-0.5">
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
                                                onClick={() => alert('Bağlantıyı kesmek için sistem yöneticisine başvurun.')}
                                                className="px-4 py-2 rounded-xl text-xs font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-all border border-red-500/20"
                                            >
                                                Bağlantıyı Kes
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleGoogleConnect}
                                                disabled={isConnectingGoogle}
                                                className="relative px-5 py-2.5 rounded-xl text-xs font-black text-white bg-gradient-to-r from-electric to-blue-500 hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] transition-all flex items-center gap-2 overflow-hidden group"
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
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 animate-fade-in-up">
                            {/* Guide Sidebar Navigation (Optional for Desktop) */}
                            <div className="md:col-span-4 space-y-4 hidden md:block">
                                <GuideNavCard
                                    icon={Info}
                                    title="Temel Kavramlar"
                                    desc="TalentFlow dünyasına giriş"
                                    color="text-electric"
                                    bgColor="bg-electric/10"
                                />
                                <GuideNavCard
                                    icon={Users}
                                    title="Aday Yönetimi"
                                    desc="CV Yükleme ve LinkedIn Scraper"
                                    color="text-emerald-400"
                                    bgColor="bg-emerald-400/10"
                                />
                                <GuideNavCard
                                    icon={Zap}
                                    title="AI Mülakat Asistanı"
                                    desc="Agentic mülakat oturumları"
                                    color="text-violet-400"
                                    bgColor="bg-violet-400/10"
                                />
                                <GuideNavCard
                                    icon={ShieldCheck}
                                    title="KVKK & Güvenlik"
                                    desc="Veri silme ve koruma kuralları"
                                    color="text-amber-400"
                                    bgColor="bg-amber-400/10"
                                />
                            </div>

                            {/* Main Guide Content */}
                            <div className="md:col-span-8 space-y-10 pb-20">
                                <section>
                                    <div className="flex items-center gap-2 text-electric font-black uppercase tracking-widest text-[10px] mb-4">
                                        <div className="w-1.5 h-1.5 rounded-full bg-electric animate-pulse" />
                                        1. BAŞLANGIÇ VE KURULUM
                                    </div>
                                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-3xl p-6 space-y-4">
                                        <h3 className="text-lg font-bold text-white">İlk Adımlar</h3>
                                        <p className="text-sm text-navy-400 leading-relaxed">
                                            Uygulamayı verimli kullanmak için ilk yapmanız gereken işlem <span className="text-white font-bold">Google Workspace Entegrasyonu</span>'dur. Ayarlar sayfasındaki "Bağlan" butonu ile Gmail ve Takvim yetkilerini verin.
                                        </p>
                                        <ul className="space-y-3">
                                            <li className="flex items-start gap-3 bg-white/5 p-3 rounded-2xl">
                                                <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                                </div>
                                                <span className="text-xs text-navy-300">Adaylara doğrudan kurumsal e-postanızla ulaşın.</span>
                                            </li>
                                            <li className="flex items-start gap-3 bg-white/5 p-3 rounded-2xl">
                                                <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                                </div>
                                                <span className="text-xs text-navy-300">Google Meet linklerinizi otomatik oluşturun.</span>
                                            </li>
                                        </ul>
                                    </div>
                                </section>

                                <section>
                                    <div className="flex items-center gap-2 text-emerald-400 font-black uppercase tracking-widest text-[10px] mb-4">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                        2. ADAY YÜKLEME VE TAKİP
                                    </div>
                                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-3xl p-6 space-y-6">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-navy-900/50 p-4 rounded-2xl border border-white/5 flex flex-col gap-2">
                                                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center"><LayoutGrid className="w-4 h-4 text-white" /></div>
                                                <h4 className="text-xs font-bold text-white">Manuel CV Yükleme</h4>
                                                <p className="text-[11px] text-navy-500 leading-relaxed">PDF veya Docx dosyalarını sürükleyip bırakın. AI içeriği otomatik okur.</p>
                                            </div>
                                            <div className="bg-navy-900/50 p-4 rounded-2xl border border-white/5 flex flex-col gap-2">
                                                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center"><Search className="w-4 h-4 text-blue-400" /></div>
                                                <h4 className="text-xs font-bold text-white">LinkedIn Scraper</h4>
                                                <p className="text-[11px] text-navy-500 leading-relaxed">Link vererek veya anahtar kelime aratarak adayları anında içe aktarın.</p>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <section>
                                    <div className="flex items-center gap-2 text-violet-400 font-black uppercase tracking-widest text-[10px] mb-4">
                                        <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                                        3. AI MÜLAKAT OTURUMLARI
                                    </div>
                                    <div className="bg-navy-900/40 p-6 rounded-3xl border border-violet-500/20 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 p-8 opacity-10"><Zap className="w-24 h-24 text-violet-500" /></div>
                                        <h3 className="text-lg font-bold text-white mb-4">Ajan (Agentic) Mülakat Sistemi</h3>
                                        <p className="text-sm text-navy-300 leading-relaxed mb-6">
                                            Mülakat sırasında AI, sadece soru sormakla kalmaz; adayın cevaplarını analiz eder ve size <span className="text-violet-400 font-bold">"Derinleşme Soruları"</span> önerir.
                                        </p>
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-4 group">
                                                <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform"><Target className="w-5 h-5 text-violet-400" /></div>
                                                <div className="text-[12px] text-navy-200">Adayın CV'sine göre özelleşmiş 3 farklı başlangıç rotası seçin.</div>
                                            </div>
                                            <div className="flex items-center gap-4 group">
                                                <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform"><Sparkles className="w-5 h-5 text-violet-400" /></div>
                                                <div className="text-[12px] text-navy-200">Mülakatın ortasında "Stres Yönetimi" gibi yetkinlik setlerini seçerek AI'dan anlık soru isteyin.</div>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <div className="p-8 rounded-3xl bg-emerald-500/5 border border-emerald-500/10 flex flex-col items-center text-center">
                                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-6 ring-8 ring-emerald-500/5">
                                        <ShieldCheck className="w-8 h-8 text-emerald-400" />
                                    </div>
                                    <h3 className="text-xl font-black text-emerald-400 mb-4 uppercase tracking-tighter">İşiniz Ve Verileriniz Güvende</h3>
                                    <p className="text-sm text-navy-400 max-w-md leading-relaxed">
                                        TalentFlow, veri minimizasyonu ilkesiyle çalışır. Adayın ham CV dosyası 15 gün sonra otomatik silinir, ancak dilediğiniz zaman skorlama yapabilmeniz için profesyonel özet veriler AI tarafından saklanır.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function GuideNavCard({ icon: Icon, title, desc, color, bgColor }) {
    return (
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/10 transition-all cursor-default group flex items-start gap-3">
            <div className={`w-8 h-8 rounded-lg ${bgColor} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className="min-w-0">
                <div className="text-xs font-bold text-white">{title}</div>
                <div className="text-[10px] text-navy-500 truncate">{desc}</div>
            </div>
        </div>
    );
}

function SettingRow({ icon: Icon, label, description, children, noBorder }) {
    return (
        <div className={`flex items-center justify-between py-4 gap-4 ${noBorder ? '' : 'border-b border-white/[0.04]'}`}>
            <div className="flex items-center gap-3 min-w-0">
                <Icon className="w-4 h-4 text-navy-500 shrink-0" />
                <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-navy-200">{label}</div>
                    <div className="text-[11px] text-navy-500">{description}</div>
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
            className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/[0.06] text-[12px] text-navy-300 outline-none focus:border-electric/40 transition-all cursor-pointer"
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
