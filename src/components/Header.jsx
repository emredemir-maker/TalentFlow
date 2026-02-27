// src/components/Header.jsx
import { useState, useRef, useEffect } from 'react';
import { Search, Bell, X, Check, Trash2, Clock, Sparkles, AlertTriangle, Info, LayoutGrid, Columns3, List, User, Sun, Moon } from 'lucide-react';
import SystemScanner from './SystemScanner';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { useUserSettings } from '../context/UserSettingsContext';

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
        <header className="sticky top-0 z-40 px-6 lg:px-8 h-16 flex items-center justify-between gap-4 border-b border-border-subtle bg-header-bg backdrop-blur-xl">
            {/* Title */}
            <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-text-primary to-navy-400 bg-clip-text text-transparent shrink-0">
                {title}
            </h1>

            {/* Search + Actions */}
            <div className="flex items-center gap-3">
                {/* Search */}
                {onSearchChange && (
                    <div className="relative hidden sm:block">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-500 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Aday, pozisyon, yetenek ara..."
                            value={searchQuery || ''}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="w-64 lg:w-80 pl-10 pr-4 py-2 rounded-xl bg-navy-800/20 border border-border-subtle text-sm text-text-secondary placeholder:text-navy-500 outline-none focus:border-electric/40 focus:ring-2 focus:ring-electric/10 transition-all"
                            id="search-input"
                        />
                    </div>
                )}

                <SystemScanner />

                {/* View Mode Toggle (In Header now) */}
                {setViewMode && (
                    <div className="hidden lg:flex items-center gap-1 bg-navy-800/10 rounded-xl p-1 border border-border-subtle shadow-inner mx-2">
                        {[
                            { id: 'card', icon: LayoutGrid, label: 'Kılavuz' },
                            { id: 'kanban', icon: Columns3, label: 'Kanban' },
                            { id: 'list', icon: List, label: 'Liste' },
                        ].map(v => (
                            <button key={v.id} onClick={() => setViewMode(v.id)} title={v.label}
                                className={`p-1.5 rounded-lg transition-all duration-200 ${viewMode === v.id ? 'bg-electric text-text-primary shadow-lg' : 'text-navy-500 hover:text-text-primary hover:bg-navy-800/40'}`}>
                                <v.icon className="w-4 h-4" />
                            </button>
                        ))}
                    </div>
                )}

                {/* Notification Bell */}
                <div className="relative" ref={dropdownRef}>
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer relative
                            ${showNotifications ? 'bg-navy-800/40 border-electric text-text-primary' : 'bg-navy-800/20 border-border-subtle text-navy-400 hover:text-text-primary hover:bg-navy-800/40'}`}
                    >
                        <Bell className="w-4 h-4" />
                        {unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-electric text-[10px] font-black text-text-primary flex items-center justify-center border-2 border-header-bg animate-in zoom-in">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>

                    {/* Dropdown */}
                    {showNotifications && (
                        <div className="absolute right-0 mt-3 w-80 bg-navy-900 border border-border-subtle rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="p-4 border-b border-border-subtle flex items-center justify-between">
                                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                                    Bildirimler
                                    {unreadCount > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-electric/10 text-electric-light">{unreadCount} Yeni</span>}
                                </h3>
                                <div className="flex items-center gap-2">
                                    <button onClick={markAllAsRead} className="p-1.5 rounded-lg hover:bg-navy-800/40 text-text-muted hover:text-text-primary transition-all" title="Tümünü oku">
                                        <Check className="w-4 h-4" />
                                    </button>
                                    <button onClick={clearAll} className="p-1.5 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-all" title="Tümünü temizle">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                                {notifications.length > 0 ? (
                                    notifications.map((n) => (
                                        <div
                                            key={n.id}
                                            onClick={() => markAsRead(n.id)}
                                            className={`p-4 border-b border-border-subtle hover:bg-navy-800/20 transition-all cursor-pointer relative group ${!n.read ? 'bg-electric/[0.02]' : ''}`}
                                        >
                                            <div className="flex gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-navy-800/40 flex items-center justify-center shrink-0 mt-0.5">
                                                    {getTypeIcon(n.type)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2 mb-1">
                                                        <span className="text-[13px] font-bold text-text-primary truncate">{n.title}</span>
                                                        <span className="text-[10px] text-text-muted flex items-center gap-1 shrink-0">
                                                            <Clock className="w-3 h-3" />
                                                            {formatTime(n.timestamp)}
                                                        </span>
                                                    </div>
                                                    <p className="text-[11px] text-text-muted leading-relaxed line-clamp-2">
                                                        {n.message}
                                                    </p>
                                                </div>
                                            </div>
                                            {!n.read && (
                                                <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-electric" />
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-10 text-center">
                                        <div className="w-12 h-12 rounded-full bg-navy-800/40 flex items-center justify-center mx-auto mb-4 border border-border-subtle">
                                            <Bell className="w-5 h-5 text-navy-500" />
                                        </div>
                                        <p className="text-xs text-text-muted">Henüz bildirim bulunmuyor.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Theme Toggle */}
                <button
                    onClick={() => updateSettings({ theme: settings?.theme === 'light' ? 'dark' : 'light' })}
                    title="Temayı Değiştir"
                    className="w-10 h-10 rounded-2xl flex items-center justify-center bg-navy-800/20 hover:bg-navy-800/40 border border-border-subtle transition-all"
                >
                    {settings?.theme === 'light' ? <Moon className="w-5 h-5 text-navy-500" /> : <Sun className="w-5 h-5 text-navy-400" />}
                </button>

                {/* Profile Badge */}
                <div className="flex items-center gap-2.5 pl-3 border-l border-border-subtle">
                    <div className="hidden md:block text-right">
                        <div className="text-[12px] font-black text-text-primary tracking-tight leading-none mb-1">
                            {userProfile?.displayName || 'Kullanıcı'}
                        </div>
                        <div className="text-[9px] font-bold text-navy-500 uppercase tracking-widest leading-none">
                            {userProfile?.role === 'super_admin' ? 'Stratejik Yönetici' : 'Operatör'}
                        </div>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 border border-white/10 flex items-center justify-center shadow-lg shadow-indigo-500/20 group cursor-pointer hover:scale-105 transition-all">
                        {userProfile?.displayName ? (
                            <span className="text-[14px] font-black text-text-primary">{userProfile.displayName.substring(0, 2).toUpperCase()}</span>
                        ) : (
                            <User className="w-5 h-5 text-text-primary" />
                        )}
                        <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-emerald-500 border-2 border-header-bg rounded-full" />
                    </div>
                </div>
            </div>
        </header>
    );
}
