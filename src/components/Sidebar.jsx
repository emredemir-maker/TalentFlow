// src/components/Sidebar.jsx
import React from 'react';
import {
    LayoutDashboard,
    Users,
    Briefcase,
    Calendar,
    BarChart3,
    MessageSquare,
    Settings,
    LogOut,
    ChevronLeft,
    ChevronRight,
    Code2,
    Plug,
    X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import TalentInnLogo, { TIIconMark } from './TalentInnLogo';

export default function Sidebar({
    activeView,
    onNavigate,
    collapsed,
    onToggleCollapse,
    mobileOpen = false,
    onCloseMobile,
}) {
    const { logout, userProfile } = useAuth();

    const menuItems = [
        { id: 'dashboard', label: 'Kontrol Paneli', icon: LayoutDashboard },
        { id: 'interviews', label: 'Mülakatlar', icon: Calendar },
        { id: 'candidate-process', label: 'Adaylar', icon: Users },
        { id: 'positions', label: 'Açık İlanlar', icon: Briefcase },
        { id: 'analytics', label: 'Analitik Raporlar', icon: BarChart3 },
        { id: 'messages', label: 'Mesajlaşma', icon: MessageSquare },
    ];

    const adminItems = [
        { id: 'settings', label: 'Genel Ayarlar', icon: Settings },
    ];

    const docsItems = [
        { id: 'tech-docs', label: 'Teknik Dokümantasyon', icon: Code2 },
        { id: 'integrations', label: 'Entegrasyonlar', icon: Plug },
    ];

    const isSettingsGroup = ['settings', 'sources', 'departments', 'guide', 'super-admin'].includes(activeView);

    // `collapsed` is a DESKTOP-only concept (sidebar daraltma toggle).
    // On mobile (<lg) the sidebar is a drawer that's either fully shown
    // or hidden via mobileOpen — no collapsed state. The `lg:hidden` /
    // `lg:inline` classes below ensure mobile always renders the full
    // expanded version regardless of the `collapsed` prop value.
    const labelClass = collapsed ? 'inline lg:hidden' : 'inline';
    const sectionHeaderClass = collapsed ? 'block lg:hidden' : 'block';

    const MenuItem = ({ item }) => {
        const isActive = item.id === 'settings' ? isSettingsGroup : activeView === item.id;
        return (
            <button
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-4 px-6 py-3.5 transition-all duration-200 group relative
                    ${isActive
                        ? 'bg-[#1E293B] text-white'
                        : 'text-[#94A3B8] hover:text-white hover:bg-[#1E293B]/50'
                    }`}
            >
                <item.icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? 'text-white' : 'text-[#64748B] group-hover:text-white'}`} />
                <span className={`text-[13px] font-medium tracking-tight truncate ${labelClass}`}>{item.label}</span>

                {isActive && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#2563EB]" />
                )}
            </button>
        );
    };

    // Mobile drawer (<lg): translate off-screen when not open. Desktop (≥lg)
    // ignores the transform and uses width-based collapse instead.
    const mobileTransform = mobileOpen ? 'translate-x-0' : '-translate-x-full';
    const desktopWidth = collapsed ? 'lg:w-[80px]' : 'lg:w-[240px]';

    return (
        <>
            {/* Mobile overlay backdrop */}
            {mobileOpen && (
                <button
                    aria-label="Menüyü kapat"
                    onClick={onCloseMobile}
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
                />
            )}

            <aside
                className={`fixed left-0 top-0 h-screen transition-transform duration-300 lg:transition-all z-50 bg-[#0A1629]
                w-[240px] ${desktopWidth} ${mobileTransform} lg:translate-x-0
                flex flex-col shadow-2xl`}
            >
                {/* Mobile close button (top-right inside drawer) */}
                {onCloseMobile && (
                    <button
                        onClick={onCloseMobile}
                        className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors lg:hidden"
                        aria-label="Menüyü kapat"
                    >
                        <X className="w-5 h-5" />
                    </button>
                )}

                {/* Logo Section */}
                <div className={`h-20 flex items-center px-6 ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}>
                    {/* Collapsed desktop → icon only. Mobile + expanded desktop → full logo */}
                    {collapsed ? (
                        <>
                            <span className="hidden lg:inline">
                                <TIIconMark size={38} />
                            </span>
                            <span className="lg:hidden">
                                <TalentInnLogo iconSize={38} showText={true} showSub={true} subtitle="AI Recruitment" textSize="16px" />
                            </span>
                        </>
                    ) : (
                        <TalentInnLogo iconSize={38} showText={true} showSub={true} subtitle="AI Recruitment" textSize="16px" />
                    )}
                </div>

                {/* Navigation Items */}
                <nav className="flex-1 mt-2 space-y-0.5 overflow-y-auto custom-scrollbar">
                    <div className="mb-4">
                        <h5 className={`text-[10px] text-[#475569] font-bold px-8 mb-2 uppercase tracking-widest ${sectionHeaderClass}`}>
                            Ana Menü
                        </h5>
                        {menuItems.map(item => <MenuItem key={item.id} item={item} />)}
                    </div>

                    <div className="pt-4">
                        <h5 className={`text-[10px] text-[#475569] font-bold px-8 mb-2 uppercase tracking-widest ${sectionHeaderClass}`}>
                            Yönetim
                        </h5>
                        {adminItems.map(item => <MenuItem key={item.id} item={item} />)}
                    </div>

                    {userProfile?.role === 'super_admin' && (
                        <div className="pt-4">
                            <h5 className={`text-[10px] text-[#475569] font-bold px-8 mb-2 uppercase tracking-widest ${sectionHeaderClass}`}>
                                Geliştirici
                            </h5>
                            {docsItems.map(item => <MenuItem key={item.id} item={item} />)}
                        </div>
                    )}
                </nav>

                {/* Bottom Profile Section */}
                <div className="p-4 border-t border-[#1E293B] bg-[#0A1629]">
                    <div className={`flex items-center gap-3 px-2 py-2 ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}>
                        <div className="w-9 h-9 rounded-full bg-slate-700/50 border border-slate-600 overflow-hidden shrink-0">
                             {userProfile?.imgUrl ? (
                                <img src={userProfile.imgUrl} alt="User" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-white text-xs font-bold bg-gradient-to-tr from-slate-600 to-slate-500">
                                    {userProfile?.displayName?.[0] || 'A'}
                                </div>
                            )}
                        </div>
                        <div className={`flex flex-col flex-1 min-w-0 ${collapsed ? 'flex lg:hidden' : 'flex'}`}>
                            <span className="text-white text-[13px] font-semibold truncate">{userProfile?.displayName || 'Alex Rivera'}</span>
                            <span className="text-[#64748B] text-[11px] truncate">Lead Talent Partner</span>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className={`w-full items-center gap-3 px-2 py-2 text-[#64748B] hover:text-white transition-colors mt-1 ${collapsed ? 'flex lg:hidden' : 'flex'}`}
                    >
                        <LogOut className="w-4 h-4" />
                        <span className="text-xs font-medium">Çıkış Yap</span>
                    </button>
                </div>

                {/* Desktop Collapse Toggle (mobile uses overlay click + X button) */}
                <button
                    onClick={onToggleCollapse}
                    className="absolute -right-3 top-10 w-6 h-6 bg-[#1E293B] border border-slate-700 rounded-full hidden lg:flex items-center justify-center text-white/50 hover:text-white transition-all shadow-xl z-[60]"
                    aria-label={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
                >
                    {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
                </button>
            </aside>
        </>
    );
}
