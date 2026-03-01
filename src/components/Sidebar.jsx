// src/components/Sidebar.jsx
import React from 'react';
import {
    LayoutDashboard,
    Users,
    Briefcase,
    MessageSquare,
    BarChart3,
    Settings,
    Shield,
    ChevronLeft,
    ChevronRight,
    BookOpen,
    Building2,
    Database,
    Zap,
    LogOut
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';

export default function Sidebar({ activeView, onNavigate, collapsed, onToggleCollapse }) {
    const { logout, userProfile } = useAuth();

    const menuItems = [
        { id: 'dashboard', label: 'Zeka Paneli', icon: LayoutDashboard },
        { id: 'candidate-process', label: 'Aday Süreçleri', icon: Users },
        { id: 'positions', label: 'Pozisyonlar', icon: Briefcase },
        { id: 'messages', label: 'Mesaj Merkezi', icon: MessageSquare },
        { id: 'analytics', label: 'Analitik', icon: BarChart3 },
    ];

    const managementItems = [
        { id: 'departments', label: 'Departmanlar', icon: Building2 },
        { id: 'sources', label: 'Kaynak Yönetimi', icon: Database },
    ];

    const footerItems = [
        { id: 'guide', label: 'Kullanım Kılavuzu', icon: BookOpen },
        { id: 'settings', label: 'Ayarlar', icon: Settings },
    ];

    if (userProfile?.role === 'super_admin') {
        footerItems.unshift({ id: 'super-admin', label: 'Sistem Yönetimi', icon: Shield });
    }

    const MenuItem = ({ item }) => (
        <button
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all duration-300 group relative
                ${activeView === item.id
                    ? 'bg-electric text-white shadow-[0_8px_16px_-4px_rgba(59,130,246,0.4)] rotate-1'
                    : 'text-text-muted hover:text-text-primary hover:bg-navy-800/20'
                }`}
        >
            <item.icon className={`w-5 h-5 shrink-0 transition-transform duration-500 ${activeView === item.id ? 'scale-110' : 'group-hover:scale-110 group-hover:rotate-6'}`} />
            {!collapsed && <span className="text-[13px] font-bold tracking-tight uppercase">{item.label}</span>}

            {activeView === item.id && (
                <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_white]" />
            )}
        </button>
    );

    return (
        <aside className={`fixed left-0 top-0 h-screen transition-all duration-500 z-50 p-2
            ${collapsed ? 'w-[72px]' : 'w-[240px]'}`}>

            <div className="h-full stitch-glass border border-border-subtle rounded-[32px] flex flex-col shadow-2xl overflow-hidden relative">

                {/* Logo Section */}
                <div className={`pt-8 pb-4 flex flex-col items-center justify-center transition-all duration-500 ${collapsed ? 'px-2' : 'px-6'}`}>
                    <Logo
                        size={collapsed ? 32 : 54}
                        showText={!collapsed}
                        className="transition-all duration-500"
                    />
                </div>

                {/* Navigation Items */}
                <div className="flex-1 px-3 space-y-8 overflow-y-auto custom-scrollbar">
                    <div className="space-y-1">
                        {!collapsed && <div className="px-4 mb-2 text-[10px] font-black text-text-muted uppercase tracking-[0.2em] opacity-40 italic">Ana Konsol</div>}
                        {menuItems.map(item => <MenuItem key={item.id} item={item} />)}
                    </div>

                    <div className="space-y-1">
                        {!collapsed && <div className="px-4 mb-2 text-[10px] font-black text-text-muted uppercase tracking-[0.2em] opacity-40 italic">Veri Yönetimi</div>}
                        {managementItems.map(item => <MenuItem key={item.id} item={item} />)}
                    </div>

                    <div className="space-y-1">
                        {!collapsed && <div className="px-4 mb-2 text-[10px] font-black text-text-muted uppercase tracking-[0.2em] opacity-40 italic">Sistem Erişimi</div>}
                        {footerItems.map(item => <MenuItem key={item.id} item={item} />)}
                    </div>
                </div>

                {/* Sidebar Footer */}
                <div className="p-3 bg-navy-800/10 border-t border-border-subtle mt-auto">
                    <button
                        onClick={logout}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-red-500 hover:text-white hover:bg-red-500/20 transition-all group
                            ${collapsed ? 'justify-center' : ''}`}
                    >
                        <LogOut className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
                        {!collapsed && <span className="text-[13px] font-black uppercase tracking-widest">Çıkış Yap</span>}
                    </button>
                </div>

                {/* Collapse Toggle */}
                <button
                    onClick={onToggleCollapse}
                    className="absolute -right-0 top-1/2 -translate-y-1/2 w-8 h-12 bg-navy-800/20 hover:bg-navy-800/40 border-l border-y border-border-subtle rounded-l-xl flex items-center justify-center text-text-muted hover:text-text-primary transition-all backdrop-blur-md shadow-inner"
                >
                    {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
                </button>
            </div>
        </aside>
    );
}
