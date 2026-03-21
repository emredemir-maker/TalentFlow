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
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import TalentInnLogo, { TIIconMark } from './TalentInnLogo';

export default function Sidebar({ activeView, onNavigate, collapsed, onToggleCollapse }) {
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

    const isSettingsGroup = ['settings', 'sources', 'departments', 'guide', 'super-admin'].includes(activeView);

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
                {!collapsed && <span className="text-[13px] font-medium tracking-tight truncate">{item.label}</span>}

                {isActive && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#2563EB]" />
                )}
            </button>
        );
    };

    return (
        <aside className={`fixed left-0 top-0 h-screen transition-all duration-300 z-50 bg-[#0A1629]
            ${collapsed ? 'w-[80px]' : 'w-[240px]'} flex flex-col shadow-2xl`}>

            {/* Logo Section */}
            <div className={`h-20 flex items-center ${collapsed ? 'justify-center' : 'px-6'}`}>
                {collapsed
                    ? <TIIconMark size={38} />
                    : <TalentInnLogo iconSize={38} showText={true} showSub={true} subtitle="AI Recruitment" textSize="16px" />
                }
            </div>

            {/* Navigation Items */}
            <nav className="flex-1 mt-2 space-y-0.5 overflow-y-auto custom-scrollbar">
                <div className="mb-4">
                    {!collapsed && (
                        <h5 className="text-[10px] text-[#475569] font-bold px-8 mb-2 uppercase tracking-widest">
                            Ana Menü
                        </h5>
                    )}
                    {menuItems.map(item => <MenuItem key={item.id} item={item} />)}
                </div>

                <div className="pt-4">
                    {!collapsed && (
                        <h5 className="text-[10px] text-[#475569] font-bold px-8 mb-2 uppercase tracking-widest">
                            Yönetim
                        </h5>
                    )}
                    {adminItems.map(item => <MenuItem key={item.id} item={item} />)}
                </div>
            </nav>

            {/* Bottom Profile Section */}
            <div className="p-4 border-t border-[#1E293B] bg-[#0A1629]">
                <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : 'px-2'} py-2`}>
                    <div className="w-9 h-9 rounded-full bg-slate-700/50 border border-slate-600 overflow-hidden shrink-0">
                         {userProfile?.imgUrl ? (
                            <img src={userProfile.imgUrl} alt="User" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-white text-xs font-bold bg-gradient-to-tr from-slate-600 to-slate-500">
                                {userProfile?.displayName?.[0] || 'A'}
                            </div>
                        )}
                    </div>
                    {!collapsed && (
                        <div className="flex flex-col flex-1 min-w-0">
                            <span className="text-white text-[13px] font-semibold truncate">{userProfile?.displayName || 'Alex Rivera'}</span>
                            <span className="text-[#64748B] text-[11px] truncate">Lead Talent Partner</span>
                        </div>
                    )}
                </div>
                {!collapsed && (
                    <button
                        onClick={logout}
                        className="w-full flex items-center gap-3 px-2 py-2 text-[#64748B] hover:text-white transition-colors mt-1"
                    >
                        <LogOut className="w-4 h-4" />
                        <span className="text-xs font-medium">Çıkış Yap</span>
                    </button>
                )}
            </div>

            {/* Collapse Toggle */}
            <button
                onClick={onToggleCollapse}
                className="absolute -right-3 top-10 w-6 h-6 bg-[#1E293B] border border-slate-700 rounded-full flex items-center justify-center text-white/50 hover:text-white transition-all shadow-xl z-[60]"
            >
                {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
            </button>
        </aside>
    );
}
