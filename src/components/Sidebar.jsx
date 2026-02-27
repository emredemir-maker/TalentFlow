// src/components/Sidebar.jsx  
// Narrow sidebar with Lucide-React icons + mobile bottom navigation

import {
    LayoutDashboard,
    Globe,
    Sparkles,
    MessageSquare,
    BarChart3,
    Settings,
    ChevronLeft,
    Zap,
    Briefcase,
    Shield,
    LogOut,
    Search,
    Building2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'positions', label: 'Pozisyonlar', icon: Briefcase },
    { id: 'analytics', label: 'Analitik', icon: BarChart3 },
    { id: 'candidate-process', label: 'Aday Görünümü', icon: Globe },
    { id: 'guide', label: 'Kullanım Kılavuzu', icon: MessageSquare },
];

const BOTTOM_ITEMS = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'analytics', label: 'Analitik', icon: BarChart3 },
];

export default function Sidebar({ activeView, onNavigate, collapsed, onToggleCollapse }) {
    const { userProfile, isSuperAdmin, logout } = useAuth();

    return (
        <>
            {/* ===== DESKTOP SIDEBAR ===== */}
            <aside
                className={`hidden md:flex fixed top-0 left-0 h-screen flex-col z-50
          border-r border-border-subtle bg-navy-900/95 backdrop-blur-xl
          transition-all duration-300 ease-out
          ${collapsed ? 'w-[72px]' : 'w-[220px]'}`}
            >
                {/* Logo Section */}
                <div className={`flex flex-col justify-center py-6 border-b border-border-subtle shrink-0 ${collapsed ? 'px-2 items-center' : 'px-6 items-start'}`}>
                    <div className={`transition-all duration-300 ${collapsed ? 'w-10 h-10' : 'w-full h-14 flex items-center justify-start'} shrink-0 overflow-hidden`}>
                        <img
                            src={collapsed ? "/favicon.png" : "/logo.png"}
                            alt="TalentFlow Logo"
                            className={`transition-all duration-300 ${collapsed ? 'w-full h-full object-contain' : 'max-w-full max-h-full object-contain object-left'}`}
                        />
                    </div>
                </div>

                {/* Nav items */}
                <nav className="flex-1 flex flex-col gap-1 px-3 py-4">
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeView === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => onNavigate(item.id)}
                                title={collapsed ? item.label : undefined}
                                className={`group relative flex items-center gap-3 rounded-xl transition-all duration-200 cursor-pointer
                  ${collapsed ? 'justify-center px-0 py-3' : 'px-3 py-2.5'}
                  ${isActive
                                        ? 'bg-electric/10 text-electric-light'
                                        : 'text-navy-400 hover:text-navy-200 hover:bg-white/[0.04]'
                                    }`}
                            >
                                {isActive && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-electric" />
                                )}
                                <Icon className={`w-5 h-5 shrink-0 transition-colors ${isActive ? 'text-electric-light' : 'text-navy-500 group-hover:text-navy-300'}`} />
                                {!collapsed && (
                                    <span className="text-[13px] font-medium">{item.label}</span>
                                )}
                            </button>
                        );
                    })}

                    {/* Admin Only Item */}
                    {isSuperAdmin && (
                        <button
                            onClick={() => onNavigate('super-admin')}
                            title={collapsed ? 'Süper Admin' : undefined}
                            className={`group relative flex items-center gap-3 rounded-xl transition-all duration-200 cursor-pointer mt-4
                            ${collapsed ? 'justify-center px-0 py-3' : 'px-3 py-2.5'}
                            ${activeView === 'super-admin'
                                    ? 'bg-violet-500/10 text-violet-400'
                                    : 'text-navy-400 hover:text-violet-300 hover:bg-violet-500/5'}`}
                        >
                            {activeView === 'super-admin' && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-violet-500" />
                            )}
                            <Shield className={`w-5 h-5 shrink-0 transition-colors ${activeView === 'super-admin' ? 'text-violet-400' : 'text-navy-500 group-hover:text-violet-400'}`} />
                            {!collapsed && (
                                <span className="text-[13px] font-bold">Süper Admin</span>
                            )}
                        </button>
                    )}

                    {/* Department Management (Admin Only) */}
                    {isSuperAdmin && (
                        <button
                            onClick={() => onNavigate('departments')}
                            title={collapsed ? 'Departmanlar' : undefined}
                            className={`group relative flex items-center gap-3 rounded-xl transition-all duration-200 cursor-pointer
                            ${collapsed ? 'justify-center px-0 py-3' : 'px-3 py-2.5'}
                            ${activeView === 'departments'
                                    ? 'bg-amber-500/10 text-amber-400'
                                    : 'text-navy-400 hover:text-amber-300 hover:bg-amber-500/5'}`}
                        >
                            {activeView === 'departments' && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-amber-500" />
                            )}
                            <Building2 className={`w-5 h-5 shrink-0 transition-colors ${activeView === 'departments' ? 'text-amber-400' : 'text-navy-500 group-hover:text-amber-400'}`} />
                            {!collapsed && (
                                <span className="text-[13px] font-bold">Departmanlar</span>
                            )}
                        </button>
                    )}

                    {/* Source Management (Admin Only) */}
                    {isSuperAdmin && (
                        <button
                            onClick={() => onNavigate('sources')}
                            title={collapsed ? 'Kaynak Yönetimi' : undefined}
                            className={`group relative flex items-center gap-3 rounded-xl transition-all duration-200 cursor-pointer
                            ${collapsed ? 'justify-center px-0 py-3' : 'px-3 py-2.5'}
                            ${activeView === 'sources'
                                    ? 'bg-indigo-500/10 text-indigo-400'
                                    : 'text-navy-400 hover:text-indigo-300 hover:bg-indigo-500/5'}`}
                        >
                            {activeView === 'sources' && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-indigo-500" />
                            )}
                            <Globe className={`w-5 h-5 shrink-0 transition-colors ${activeView === 'sources' ? 'text-indigo-400' : 'text-navy-500 group-hover:text-indigo-400'}`} />
                            {!collapsed && (
                                <span className="text-[13px] font-bold">Kaynak Yönetimi</span>
                            )}
                        </button>
                    )}
                </nav>

                {/* Settings + Collapse */}
                <div className="px-3 pb-3 space-y-1 border-t border-border-subtle pt-3">
                    <button
                        onClick={() => onNavigate('settings')}
                        title={collapsed ? 'Ayarlar' : undefined}
                        className={`flex items-center gap-3 rounded-xl transition-all duration-200 w-full cursor-pointer
              ${collapsed ? 'justify-center px-0 py-3' : 'px-3 py-2.5'}
              ${activeView === 'settings'
                                ? 'bg-electric/10 text-electric-light'
                                : 'text-navy-400 hover:text-navy-200 hover:bg-white/[0.04]'}`}
                    >
                        <Settings className="w-5 h-5 shrink-0" />
                        {!collapsed && <span className="text-[13px] font-medium">Ayarlar</span>}
                    </button>

                    <button
                        onClick={logout}
                        title={collapsed ? 'Çıkış Yap' : undefined}
                        className={`flex items-center gap-3 rounded-xl transition-all duration-200 w-full cursor-pointer
                            ${collapsed ? 'justify-center px-0 py-3' : 'px-3 py-2.5'}
                            text-navy-400 hover:text-red-400 hover:bg-red-500/5`}
                    >
                        <LogOut className="w-5 h-5 shrink-0" />
                        {!collapsed && <span className="text-[13px] font-medium">Çıkış Yap</span>}
                    </button>

                    <button
                        onClick={onToggleCollapse}
                        className="flex items-center justify-center w-full py-2 rounded-xl text-navy-500 hover:text-navy-300 hover:bg-white/[0.04] transition-all cursor-pointer"
                        title={collapsed ? 'Genişlet' : 'Daralt'}
                    >
                        <ChevronLeft className={`w-4 h-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
                    </button>

                    {/* User pill */}
                    {!collapsed && userProfile && (
                        <div className="mt-2 flex items-center gap-2.5 p-2.5 rounded-xl bg-navy-800/10 border border-border-subtle">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[11px] font-bold text-text-primary shrink-0">
                                {userProfile.displayName?.substring(0, 2).toUpperCase() || 'U'}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-[12px] font-semibold text-text-primary truncate">
                                    {userProfile.displayName || 'Kullanıcı'}
                                </div>
                                <div className="text-[9px] text-navy-500 truncate font-mono uppercase tracking-widest">
                                    {userProfile.role === 'super_admin' ? 'Süper Yönetici' : userProfile.role === 'department_user' ? `Dept: ${userProfile.department || ''}` : 'Recruiter'}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </aside>

            {/* ===== MOBILE BOTTOM NAV ===== */}
            <nav className="mobile-bottom-nav md:hidden">
                {BOTTOM_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeView === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => onNavigate(item.id)}
                            className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all cursor-pointer
                ${isActive ? 'text-electric-light' : 'text-navy-500'}`}
                        >
                            <Icon className={`w-5 h-5 ${isActive ? 'drop-shadow-[0_0_6px_rgba(59,130,246,0.5)]' : ''}`} />
                            <span className="text-[10px] font-medium">{item.label}</span>
                        </button>
                    );
                })}
            </nav>
        </>
    );
}
