// src/pages/SettingsPage.jsx
// Settings page with Tailwind styling

import { useUserSettings } from '../context/UserSettingsContext';
import { Settings, Palette, Globe, Bell, LayoutGrid, Hash } from 'lucide-react';

export default function SettingsPage() {
    const { settings, loading, updateSettings } = useUserSettings();

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-[3px] border-navy-800 border-t-electric rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <>
            {/* Header */}
            <header className="sticky top-0 z-40 px-6 lg:px-8 h-16 flex items-center border-b border-white/[0.06] bg-navy-900/80 backdrop-blur-xl">
                <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white to-navy-300 bg-clip-text text-transparent">
                    Ayarlar
                </h1>
            </header>

            <div className="px-6 lg:px-8 py-8 max-w-2xl">
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
            </div>
        </>
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
            className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[12px] text-navy-300 outline-none focus:border-electric/40 transition-all cursor-pointer"
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
