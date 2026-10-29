// src/components/Sidebar.jsx
import React from 'react';
import {
    LayoutDashboard,
    Users,
    Table2,
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
import { roleLabel } from '../utils/roles';
import TenantSwitcher from './TenantSwitcher';
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
        // Birleşik Adaylar sayfası: liste + filtre + toplu işlem tabloda;
        // detay/yükleme görünümü (candidate-process) satır tıklamasıyla açılır,
        // menüde ayrıca listelenmez.
        { id: 'candidates-table', label: 'Adaylar', icon: Users },
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
                aria-current={isActive ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
                className={`w-full h-9 flex items-center gap-2.5 px-3 rounded-full transition-colors duration-150 group
                    ${collapsed ? 'lg:justify-center lg:px-0' : ''}
                    ${isActive
                        ? 'bg-pill text-n900'
                        : 'text-n600 hover:text-n900 hover:bg-pill/60'
                    }`}
            >
                <item.icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-n900' : 'text-n500 group-hover:text-n800'}`} />
                <span className={`text-[13px] ${isActive ? 'font-semibold' : 'font-medium'} truncate ${labelClass}`}>{item.label}</span>
            </button>
        );
    };

    // Mobile drawer (<lg): translate off-screen when not open. Desktop (≥lg)
    // ignores the transform and uses width-based collapse instead.
    const mobileTransform = mobileOpen ? 'translate-x-0' : '-translate-x-full';
    const desktopWidth = collapsed ? 'lg:w-[72px]' : 'lg:w-[220px]';

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
                className={`infoset fixed left-0 top-0 h-dvh transition-transform duration-300 lg:transition-[width] z-50
                w-[240px] ${desktopWidth} ${mobileTransform} lg:translate-x-0
                flex flex-col bg-frame`}
            >
                {/* Mobile close button (top-right inside drawer) */}
                {onCloseMobile && (
                    <button
                        onClick={onCloseMobile}
                        className="absolute top-3 right-3 w-8 h-8 rounded-md flex items-center justify-center text-n400 hover:text-n900 hover:bg-n100 transition-colors lg:hidden"
                        aria-label="Menüyü kapat"
                    >
                        <X className="w-5 h-5" />
                    </button>
                )}

                {/* Logo Section */}
                <div className={`h-[64px] shrink-0 flex items-center px-4 ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}>
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
                <nav aria-label="Ana menü" className={`flex-1 px-3 space-y-0.5 overflow-y-auto custom-scrollbar ${collapsed ? 'lg:px-2' : ''}`}>
                    <div className="space-y-0.5">
                        {menuItems.map(item => <MenuItem key={item.id} item={item} />)}
                    </div>

                    <div className="pt-5 space-y-0.5">
                        <h5 className={`text-[12px] text-n500 font-medium px-3 pb-1 ${sectionHeaderClass}`}>
                            Yönetim
                        </h5>
                        {adminItems.map(item => <MenuItem key={item.id} item={item} />)}
                    </div>

                    {userProfile?.role === 'admin' && (
                        <div className="pt-5 space-y-0.5">
                            <h5 className={`text-[12px] text-n500 font-medium px-3 pb-1 ${sectionHeaderClass}`}>
                                Geliştirici
                            </h5>
                            {docsItems.map(item => <MenuItem key={item.id} item={item} />)}
                        </div>
                    )}
                </nav>

                {/* Bottom Profile Section */}
                <div className={`p-3 ${collapsed ? 'lg:px-2' : ''}`}>
                    {/* Birden çok şirkette üyeyse şirket seçici. */}
                    <TenantSwitcher className={`mb-2 ${collapsed ? 'lg:hidden' : ''}`} />
                    <div className={`flex items-center gap-2 px-2 py-2 ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}>
                        <div className="w-8 h-8 rounded-full bg-brand-50 overflow-hidden shrink-0">
                             {userProfile?.imgUrl ? (
                                <img src={userProfile.imgUrl} alt="User" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-brand text-xs font-semibold">
                                    {(userProfile?.displayName || userProfile?.email || '?')[0]?.toUpperCase()}
                                </div>
                            )}
                        </div>
                        <div className={`flex flex-col flex-1 min-w-0 ${collapsed ? 'flex lg:hidden' : 'flex'}`}>
                            <span className="text-n900 text-[13px] font-semibold truncate">{userProfile?.displayName || userProfile?.email || 'Kullanıcı'}</span>
                            <span className="text-n500 text-[12px] truncate">{roleLabel(userProfile?.role)}</span>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className={`w-full h-9 items-center gap-2.5 px-3 rounded-full text-n600 hover:text-n900 hover:bg-pill/60 transition-colors mt-1 ${collapsed ? 'flex lg:hidden' : 'flex'}`}
                    >
                        <LogOut className="w-4 h-4" />
                        <span className="text-[13px] font-medium">Çıkış yap</span>
                    </button>
                    {/* public/consent.js bu özniteliği dinler ve ziyaret istatistiği şeridini yeniden açar. */}
                    <button
                        type="button"
                        data-clyro-consent=""
                        className={`w-full h-8 items-center px-3 text-[12px] text-n500 hover:text-n900 ${collapsed ? 'flex lg:hidden' : 'flex'}`}
                    >
                        Gizlilik tercihleri
                    </button>
                </div>

                {/* Desktop Collapse Toggle (mobile uses overlay click + X button) */}
                <button
                    onClick={onToggleCollapse}
                    className="absolute -right-1 top-[22px] w-6 h-6 bg-n0 border border-n200 rounded-full hidden lg:flex items-center justify-center text-n500 hover:text-n900 transition-colors z-[60]"
                    aria-label={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
                >
                    {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
                </button>
            </aside>
        </>
    );
}
