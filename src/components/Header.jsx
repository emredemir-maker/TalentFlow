// src/components/Header.jsx
import { useState, useRef, useEffect } from 'react';
import { Search, Bell, X, Check, Trash2, Clock, Sparkles, AlertTriangle, Info, LayoutGrid, Columns3, List, User, Sun, Moon } from 'lucide-react';
import SystemScanner from './SystemScanner';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { useUserSettings } from '../context/UserSettingsContext';
import Logo from './Logo';

export default function Header({ title, searchQuery, onSearchChange, viewMode, setViewMode }) {
    const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications();
    const { userProfile } = useAuth();
    const { settings, updateSettings } = useUserSettings();
    const [showNotifications, setShowNotifications] = useState(false);
    const dropdownRef = useRef(null);

    // Click outside dropdown handler
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowNotifications(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getTypeIcon = (type) => {
        switch (type) {
            case 'success': return <Check className="w-3.5 h-3.5 text-emerald-400" />;
            case 'warning': return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
            case 'error': return <X className="w-3.5 h-3.5 text-red-400" />;
            case 'ai': return <Sparkles className="w-3.5 h-3.5 text-violet-400" />;
            default: return <Info className="w-3.5 h-3.5 text-blue-400" />;
        }
    };

    const formatTime = (date) => {
        if (!date) return '';
        const d = date instanceof Date ? date : new Date(date);
        return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(d);
    };

    return (
        <header className="sticky top-2 z-40 mx-4 lg:mx-6 h-16 flex items-center justify-between gap-4 px-5 stitch-glass rounded-[20px] border border-border-subtle shadow-2xl mt-2">
            {/* Logo + Title */}
            <div className="flex items-center gap-6">
                <Logo size={42} showText={false} className="hover:scale-110 transition-transform duration-500" />
                <div className="w-[1px] h-10 bg-border-subtle opacity-50" />
                <div className="flex flex-col">
                    <h1 className="text-xl font-black tracking-tight stitch-text-gradient uppercase">
                        {title}
                    </h1>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] italic">SİSTEM AKTİF</span>
                    </div>
                </div>
            </div>

            {/* Search + Actions */}
            <div className="flex items-center gap-4">
                {/* Search */}
                {onSearchChange && (
                    <div className="relative hidden xl:block group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-500 group-focus-within:text-electric transition-colors pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Aday, pozisyon, yetenek ara..."
                            value={searchQuery || ''}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="w-96 pl-12 pr-4 py-3 rounded-2xl bg-navy-800/20 border border-border-subtle text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-electric/30 focus:ring-4 focus:ring-electric/5 transition-all group-hover:border-electric/20 shadow-inner"
                            id="search-input"
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-lg border border-border-subtle text-[10px] text-text-muted font-black tracking-tighter shadow-inner uppercase opacity-40">
                            CMD K
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-2 bg-white/5 p-1.5 rounded-2xl border border-white/5">
                    <SystemScanner />

                    <div className="w-[1px] h-6 bg-border-subtle mx-1" />

                    {/* View Mode Toggle */}
                    {setViewMode && (
                        <div className="flex items-center gap-1">
                            {[
                                { id: 'card', icon: LayoutGrid },
                                { id: 'kanban', icon: Columns3 },
                                { id: 'list', icon: List },
                            ].map(v => (
                                <button key={v.id} onClick={() => setViewMode(v.id)}
                                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${viewMode === v.id ? 'bg-electric text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'text-text-muted hover:text-text-primary hover:bg-navy-800/20'}`}>
                                    <v.icon className="w-4 h-4" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Notifications & Settings Group */}
                <div className="flex items-center gap-2">
                    {/* Notification Bell */}
                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={() => setShowNotifications(!showNotifications)}
                            className={`w-11 h-11 rounded-2xl border flex items-center justify-center transition-all relative group shadow-sm
                                ${showNotifications ? 'bg-electric border-electric text-white' : 'bg-navy-800 border-border-subtle text-text-muted hover:text-text-primary hover:border-electric/50'}`}
                        >
                            <Bell className={`w-5 h-5 transition-transform duration-500 ${showNotifications ? '' : 'group-hover:rotate-12'}`} />
                            {unreadCount > 0 && (
                                <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center border-2 
                                    ${showNotifications ? 'bg-white text-electric border-electric' : 'bg-electric text-white border-navy-900'} animate-in zoom-in`}>
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                            )}
                        </button>

                        {/* Dropdown */}
                        {showNotifications && (
                            <div className="absolute right-0 mt-4 w-[400px] bg-navy-900 glass border border-border-subtle rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-6 duration-500 z-[100]">
                                <div className="p-6 border-b border-border-subtle bg-navy-800/10 flex items-center justify-between font-black uppercase tracking-[0.15em] text-[10px]">
                                    <h3 className="text-text-primary flex items-center gap-2">
                                        Bilgi Merkezi
                                        {unreadCount > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-electric text-white">{unreadCount} Yeni</span>}
                                    </h3>
                                    <div className="flex items-center gap-2">
                                        <button onClick={markAllAsRead} className="p-2 rounded-xl hover:bg-navy-800/40 text-text-muted hover:text-text-primary transition-all border border-transparent hover:border-border-subtle shadow-sm">
                                            <Check className="w-5 h-5" />
                                        </button>
                                        <button onClick={clearAll} className="p-2 rounded-xl hover:bg-red-500/10 text-text-muted hover:text-red-500 transition-all border border-transparent hover:border-red-500/20 shadow-sm">
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>

                                <div className="max-h-[450px] overflow-y-auto custom-scrollbar">
                                    {notifications.length > 0 ? (
                                        notifications.map((n) => (
                                            <div
                                                key={n.id}
                                                onClick={() => markAsRead(n.id)}
                                                className={`p-5 border-b border-border-subtle hover:bg-navy-800/20 transition-all cursor-pointer relative group ${!n.read ? 'bg-electric/[0.03]' : ''}`}
                                            >
                                                <div className="flex gap-4">
                                                    <div className="w-10 h-10 rounded-xl bg-navy-800/40 border border-border-subtle flex items-center justify-center shrink-0 shadow-lg">
                                                        {getTypeIcon(n.type)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between gap-2 mb-1">
                                                            <span className="text-[13px] font-extrabold text-text-primary truncate group-hover:text-electric transition-colors uppercase tracking-tight">{n.title}</span>
                                                            <span className="text-[10px] text-text-muted font-black flex items-center gap-1 shrink-0 uppercase tracking-tighter">
                                                                <Clock className="w-3.5 h-3.5" />
                                                                {formatTime(n.timestamp)}
                                                            </span>
                                                        </div>
                                                        <p className="text-[12px] text-text-secondary leading-relaxed line-clamp-2 italic font-medium">
                                                            {n.message}
                                                        </p>
                                                    </div>
                                                </div>
                                                {!n.read && (
                                                    <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-electric animate-pulse shadow-[0_0_8px_#3b82f6]" />
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="py-16 text-center">
                                            <div className="w-16 h-16 rounded-[1.5rem] bg-navy-800/10 border border-border-subtle flex items-center justify-center mx-auto mb-4 animate-stitch-float shadow-inner">
                                                <Bell className="w-6 h-6 text-text-muted/40" />
                                            </div>
                                            <p className="text-[11px] font-black uppercase tracking-widest text-text-muted opacity-40 italic">Yeni bildirim yok</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Theme Toggle */}
                    <button
                        onClick={() => updateSettings({ theme: settings?.theme === 'light' ? 'dark' : 'light' })}
                        className="w-11 h-11 rounded-2xl bg-navy-800 border border-border-subtle flex items-center justify-center text-text-muted hover:text-text-primary hover:border-electric/50 transition-all shadow-sm"
                    >
                        {settings?.theme === 'light' ? <Moon className="w-5 h-5 " /> : <Sun className="w-5 h-5" />}
                    </button>
                </div>

                {/* Profile Badge */}
                <div className="flex items-center gap-3 pl-4 border-l border-border-subtle ml-2">
                    <div className="hidden sm:block text-right">
                        <div className="text-[13px] font-black text-text-primary tracking-tight leading-none mb-1.5 uppercase italic">
                            {userProfile?.displayName || 'Kullanıcı'}
                        </div>
                        <div className="text-[9px] font-black text-electric uppercase tracking-[0.2em] leading-none opacity-80">
                            {userProfile?.role === 'super_admin' ? 'Stratejik Mimar' : 'Operatör'}
                        </div>
                    </div>
                    <div className="relative group cursor-pointer">
                        <div className="w-11 h-11 rounded-[16px] bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 p-[1px] shadow-[0_10px_20px_-5px_rgba(99,102,241,0.4)] group-hover:scale-105 transition-all duration-300 rotate-3 group-hover:rotate-0">
                            <div className="w-full h-full rounded-[15px] bg-navy-950/40 backdrop-blur-sm flex items-center justify-center overflow-hidden">
                                {userProfile?.displayName ? (
                                    <span className="text-[15px] font-black text-white">{userProfile.displayName.substring(0, 2).toUpperCase()}</span>
                                ) : (
                                    <User className="w-5 h-5 text-white shadow-sm" />
                                )}
                            </div>
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-emerald-500 border-2 border-white dark:border-navy-950 rounded-full shadow-lg" />
                    </div>
                </div>
            </div>
        </header>
    );
}

