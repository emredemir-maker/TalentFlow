// src/components/Header.jsx
import { normalizeSkills } from '../utils/normalizeSkills';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    Search, Bell, Settings, Home, X, Users, Briefcase,
    Calendar, MessageSquare, BarChart3, LayoutDashboard, FileText,
    ChevronRight, AlertTriangle, CheckCircle, Info, Loader2,
    Sparkles, LogOut, Building2, Globe, Shield, ArrowRight, Menu
} from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import { useAuth } from '../context/AuthContext';
import { useUserSettings } from '../context/UserSettingsContext';
import { roleLabel } from '../utils/roles';


const PAGES = [
    { view: 'dashboard',         label: 'Kontrol Paneli',  icon: LayoutDashboard, desc: 'Ana ekran ve genel bakış' },
    { view: 'candidates-table',  label: 'Adaylar',         icon: Users,           desc: 'Aday listesi, filtre ve toplu işlemler' },
    { view: 'positions',         label: 'Açık İlanlar',    icon: Briefcase,       desc: 'Pozisyon yönetimi' },
    { view: 'interviews',        label: 'Mülakatlar',      icon: Calendar,        desc: 'Mülakat planlama' },
    { view: 'messages',          label: 'Mesajlar',        icon: MessageSquare,   desc: 'E-posta ve mesaj kuyruğu' },
    { view: 'analytics',         label: 'Analitik',        icon: BarChart3,       desc: 'Raporlar ve istatistikler' },
    { view: 'settings',          label: 'Ayarlar',         icon: Settings,        desc: 'Tercihler ve entegrasyonlar' },
    { view: 'guide',             label: 'Platform Kılavuzu', icon: FileText,      desc: 'Kullanım rehberi' },
];

const SETTINGS_ITEMS = [
    { label: 'Genel Ayarlar',    icon: Settings,   view: 'settings' },
    { label: 'Kurumsal Kimlik',  icon: Building2,  view: 'settings' },
    { label: 'Sistem Yönetimi', icon: Shield,     view: 'super-admin' },
    { label: 'Domain Yönetimi', icon: Globe,      view: 'super-admin' },
];

const NOTIF_CONFIG = {
    success: { icon: CheckCircle, color: 'text-ok', bg: 'bg-ok-bg' },
    warning: { icon: AlertTriangle, color: 'text-warn', bg: 'bg-warn-bg' },
    error:   { icon: AlertTriangle, color: 'text-bad',   bg: 'bg-bad-bg' },
    info:    { icon: Info,          color: 'text-brand',  bg: 'bg-brand-50' },
};

function dispatchView(view) {
    window.dispatchEvent(new CustomEvent('changeView', { detail: view }));
}

function kwScoreCandidate(c, words) {
    let s = 0;
    for (const w of words) {
        if (c.name?.toLowerCase().includes(w)) s += 5;
        if (c.position?.toLowerCase().includes(w)) s += 3;
        if (normalizeSkills(c.skills).some(sk => sk.toLowerCase().includes(w))) s += 4;
        if ((c.summary || '').toLowerCase().includes(w)) s += 2;
        if (c.email?.toLowerCase().includes(w)) s += 2;
        if (c.department?.toLowerCase().includes(w)) s += 1;
        if ((c.experience || '').toLowerCase().includes(w)) s += 1;
    }
    return s;
}

function kwScorePosition(p, words) {
    let s = 0;
    for (const w of words) {
        if (p.title?.toLowerCase().includes(w)) s += 5;
        if (p.department?.toLowerCase().includes(w)) s += 3;
        if ((p.description || '').toLowerCase().includes(w)) s += 1;
    }
    return s;
}

function kwScorePage(pg, words) {
    let s = 0;
    for (const w of words) {
        if (pg.label.toLowerCase().includes(w)) s += 5;
        if (pg.desc.toLowerCase().includes(w)) s += 2;
    }
    return s;
}

function formatTime(ts) {
    if (!ts) return '';
    const d = ts instanceof Date ? ts : new Date(ts);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'Az önce';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}d önce`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}s önce`;
    return `${Math.floor(diff / 86400000)}g önce`;
}

export default function Header({ title }) {
    const { unreadCount, notifications, markAsRead, markAllAsRead, clearAll } = useNotifications();
    const { enrichedCandidates } = useCandidates();
    const { positions } = usePositions();
    const { userProfile, logout } = useAuth();
    const { settings: userSettings } = useUserSettings();
    const notificationsEnabled = userSettings?.notifications !== false;

    const [query, setQuery]         = useState('');
    const [panelOpen, setPanelOpen] = useState(false);
    const [kwResults, setKwResults] = useState({ candidates: [], positions: [], pages: [] });
    const [aiLoading, setAiLoading] = useState(false);
    const [aiIds, setAiIds]         = useState(null);
    const [selIdx, setSelIdx]       = useState(0);
    const [notifOpen, setNotifOpen] = useState(false);
    const [settOpen, setSettOpen]   = useState(false);
    // Track viewport ≥md so the search placeholder can be richer on desktop
    // ("Aday, beceri veya sayfa ara… (Ctrl+K)") and stay short on mobile ("Ara…").
    const [isMdUp, setIsMdUp] = useState(
        typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true
    );
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia('(min-width: 768px)');
        const handler = (e) => setIsMdUp(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);
    // Detect Mac so we can show ⌘ instead of Ctrl in the placeholder hint.
    const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const shortcutHint = isMac ? '⌘K' : 'Ctrl+K';
    const searchPlaceholder = isMdUp
        ? `Aday, beceri veya sayfa ara… (${shortcutHint})`
        : 'Ara…';

    const searchRef   = useRef(null);
    const inputRef    = useRef(null);
    const notifRef    = useRef(null);
    const settRef     = useRef(null);

    const userName  = userProfile?.displayName || userProfile?.name || userProfile?.email?.split('@')[0] || 'Kullanıcı';
    const roleText  = roleLabel(userProfile?.role);

    useEffect(() => {
        const handler = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
                setPanelOpen(true);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    useEffect(() => {
        const handler = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) setPanelOpen(false);
            if (notifRef.current && !notifRef.current.contains(e.target))   setNotifOpen(false);
            if (settRef.current  && !settRef.current.contains(e.target))    setSettOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        if (!query.trim()) {
            setKwResults({ candidates: [], positions: [], pages: [] });
            setAiIds(null);
            return;
        }
        const words = query.toLowerCase().trim().split(/\s+/);

        const candidates = enrichedCandidates
            .map(c => ({ ...c, _score: kwScoreCandidate(c, words) }))
            .filter(c => c._score > 0)
            .sort((a, b) => b._score - a._score)
            .slice(0, 5);

        const pos = positions
            .map(p => ({ ...p, _score: kwScorePosition(p, words) }))
            .filter(p => p._score > 0)
            .sort((a, b) => b._score - a._score)
            .slice(0, 3);

        const pages = PAGES
            .map(pg => ({ ...pg, _score: kwScorePage(pg, words) }))
            .filter(pg => pg._score > 0)
            .sort((a, b) => b._score - a._score)
            .slice(0, 3);

        setKwResults({ candidates, positions: pos, pages });
        setSelIdx(0);
        setAiIds(null);
    }, [query, enrichedCandidates, positions]);

    useEffect(() => {
        if (!query.trim() || query.trim().length < 3) return;
        const timer = setTimeout(async () => {
            if (aiIds !== null) return;
            setAiLoading(true);
            try {
                const summaries = enrichedCandidates.slice(0, 40).map(c =>
                    `ID:${c.id}|${c.name}|${c.position || ''}|${normalizeSkills(c.skills).slice(0, 6).join(',')}|${(c.summary || '').slice(0, 120)}`
                ).join('\n');

                const prompt = `Sen bir HR asistanısın. Kullanıcı arama kutusuna "${query}" yazdı.
Aşağıdaki aday listesinden bu sorguya anlamsal olarak en uygun adayları seç.
Eş anlamlıları, ilgili terimleri ve kariyer bağlamını dikkate al.

ADAYLAR (format: ID|Ad|Pozisyon|Beceriler|Özet):
${summaries}

YALNIZCA geçerli JSON döndür, başka hiçbir şey yazma:
{"matchedIds":["id1","id2","id3"]}`;

                const res  = await fetch('/api/ai/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt }),
                });
                const data = await res.json();
                const text = (data.result || data.response || '').trim();
                const m    = text.match(/\{[\s\S]*\}/);
                if (m) {
                    const parsed = JSON.parse(m[0]);
                    setAiIds(parsed.matchedIds || []);
                }
            } catch (_) {
                setAiIds([]);
            } finally {
                setAiLoading(false);
            }
        }, 600);
        return () => clearTimeout(timer);
    }, [query, enrichedCandidates, aiIds]);

    const mergedCandidates = useMemo(() => {
        if (!aiIds) return kwResults.candidates;
        const kwIds = new Set(kwResults.candidates.map(c => c.id));
        const extras = enrichedCandidates
            .filter(c => aiIds.includes(c.id) && !kwIds.has(c.id))
            .map(c => ({ ...c, _isAi: true, _score: 0 }))
            .slice(0, 3);
        const enhanced = kwResults.candidates.map(c =>
            aiIds.includes(c.id) ? { ...c, _isAi: true } : c
        );
        return [...enhanced, ...extras].slice(0, 6);
    }, [kwResults.candidates, aiIds, enrichedCandidates]);

    const allResults = useMemo(() => [
        ...mergedCandidates.map(c  => ({ type: 'candidate', data: c })),
        ...kwResults.positions.map(p  => ({ type: 'position',  data: p })),
        ...kwResults.pages.map(pg => ({ type: 'page',      data: pg })),
    ], [mergedCandidates, kwResults.positions, kwResults.pages]);

    const total = allResults.length;

    const handleKeyDown = (e) => {
        if (e.key === 'Escape')    { setPanelOpen(false); inputRef.current?.blur(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx(i => Math.min(i + 1, total - 1)); }
        else if (e.key === 'ArrowUp')   { e.preventDefault(); setSelIdx(i => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter' && total > 0) handleSelect(allResults[selIdx]);
    };

    const handleSelect = useCallback((item) => {
        setPanelOpen(false);
        setQuery('');
        if (item.type === 'candidate') dispatchView('candidate-process');
        else if (item.type === 'position') dispatchView('positions');
        else if (item.type === 'page') dispatchView(item.data.view);
    }, []);

    const hasResults = total > 0;

    return (
        <header className="h-14 flex items-center justify-between px-4 md:px-8 bg-n0/80 backdrop-blur-md border-b border-n100 sticky top-0 z-40">

            {/* ── Mobile Hamburger + Page Title + Home ──
                Brand identity lives in the sidebar (Talent-Inn + AI Recruitment).
                Top-bar shows page-level context only — no second brand wordmark.
                On <lg the hamburger opens the sidebar drawer. */}
            <div className="flex items-center gap-2 md:gap-2 md:mr-6">
                <button
                    onClick={() => window.dispatchEvent(new CustomEvent('openMobileSidebar'))}
                    className="p-2 rounded-md hover:bg-n100 text-n600 transition-all lg:hidden"
                    aria-label="Menüyü aç"
                >
                    <Menu className="w-5 h-5" />
                </button>
                <button
                    onClick={() => dispatchView('dashboard')}
                    className="p-2 rounded-md hover:bg-n100 text-n500 hover:text-brand-600 transition-all hidden sm:inline-flex"
                    title="Anasayfa"
                >
                    <Home className="w-5 h-5" />
                </button>
                {title && (
                    <h2 className="hidden md:block text-[15px] font-semibold text-n900 tracking-tight">
                        {title}
                    </h2>
                )}
            </div>

            {/* ── Search ── */}
            <div className="flex-1 max-w-[500px] relative mx-2 md:mx-4" ref={searchRef}>
                <div className="relative group">
                    <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-n400 group-focus-within:text-brand transition-colors pointer-events-none" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => { setQuery(e.target.value); setPanelOpen(true); }}
                        onFocus={() => setPanelOpen(true)}
                        onKeyDown={handleKeyDown}
                        placeholder={searchPlaceholder}
                        className="w-full pl-10 md:pl-12 pr-8 md:pr-10 py-2 md:py-2.5 bg-n100 rounded-md focus:bg-n0 focus:ring-1 focus:ring-brand outline-none transition-all text-[12px] md:text-[13px] text-n900 placeholder:text-n400"
                    />
                    {query && (
                        <button
                            onClick={() => { setQuery(''); setPanelOpen(false); }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-n400 hover:text-n600 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Search Results Panel */}
                {panelOpen && query.trim() && (
                    <div className="absolute top-full mt-2 left-0 right-0 bg-n0 rounded-md shadow-2xl border border-n200 overflow-hidden z-50">

                        {/* AI loading bar */}
                        {aiLoading && (
                            <div className="flex items-center gap-2 px-4 py-2 border-b border-n200 bg-brand-50/60">
                                <Loader2 className="w-3 h-3 text-brand animate-spin shrink-0" />
                                <span className="text-[10px] text-brand font-semibold tracking-wide">Semantik analiz yapılıyor…</span>
                            </div>
                        )}

                        <div className="max-h-[440px] overflow-y-auto">
                            {!hasResults && !aiLoading && (
                                <div className="py-10 text-center text-sm text-n400">
                                    <Search className="w-8 h-8 mx-auto mb-2 text-n200" />
                                    <p>"{query}" için sonuç bulunamadı</p>
                                    <p className="text-xs mt-1 text-n300">AI analiz ediliyor olabilir…</p>
                                </div>
                            )}

                            {/* Candidates */}
                            {mergedCandidates.length > 0 && (
                                <section>
                                    <div className="px-4 py-1.5 text-[10px] font-semibold text-n400 uppercase tracking-[0.08em] bg-n50 border-b border-n200">
                                        Adaylar
                                    </div>
                                    {mergedCandidates.map((c, i) => (
                                        <button
                                            key={c.id}
                                            onClick={() => handleSelect({ type: 'candidate', data: c })}
                                            onMouseEnter={() => setSelIdx(i)}
                                            className={`w-full flex items-center gap-2 px-4 py-3 hover:bg-brand-50/60 transition-colors text-left border-b border-n50 ${selIdx === i ? 'bg-brand-50/60' : ''}`}
                                        >
                                            <div className="w-8 h-8 rounded-full from-brand to-brand-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                                                {c.name?.[0]?.toUpperCase() || '?'}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                    <span className="text-[12px] font-semibold text-n900 truncate">{c.name}</span>
                                                    {c._isAi && (
                                                        <span className="inline-flex items-center gap-0.5 text-[11px] bg-brand-100 text-brand px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                                                            <Sparkles className="w-2.5 h-2.5" /> AI
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[11px] text-n400 truncate">
                                                    {c.position || c.department || 'Pozisyon belirtilmemiş'}
                                                    {c.skills?.length > 0 && (
                                                        <span className="text-n300"> · {c.skills.slice(0, 3).join(', ')}</span>
                                                    )}
                                                </div>
                                            </div>
                                            {c.matchScore != null && (
                                                <span className="text-[11px] font-semibold text-brand shrink-0">{Math.round(c.matchScore)}%</span>
                                            )}
                                            <ChevronRight className="w-3.5 h-3.5 text-n200 shrink-0" />
                                        </button>
                                    ))}
                                </section>
                            )}

                            {/* Positions */}
                            {kwResults.positions.length > 0 && (
                                <section>
                                    <div className="px-4 py-1.5 text-[10px] font-semibold text-n400 uppercase tracking-[0.08em] bg-n50 border-b border-n200 border-t border-t-slate-100">
                                        Pozisyonlar
                                    </div>
                                    {kwResults.positions.map((p, i) => {
                                        const idx = mergedCandidates.length + i;
                                        return (
                                            <button
                                                key={p.id}
                                                onClick={() => handleSelect({ type: 'position', data: p })}
                                                onMouseEnter={() => setSelIdx(idx)}
                                                className={`w-full flex items-center gap-2 px-4 py-3 hover:bg-brand-50/60 transition-colors text-left border-b border-n50 ${selIdx === idx ? 'bg-brand-50/60' : ''}`}
                                            >
                                                <div className="w-8 h-8 rounded-md bg-brand-100 flex items-center justify-center shrink-0">
                                                    <Briefcase className="w-4 h-4 text-brand" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[12px] font-semibold text-n900 truncate">{p.title}</div>
                                                    <div className="text-[11px] text-n400">{p.department}</div>
                                                </div>
                                                <ChevronRight className="w-3.5 h-3.5 text-n200 shrink-0" />
                                            </button>
                                        );
                                    })}
                                </section>
                            )}

                            {/* Pages */}
                            {kwResults.pages.length > 0 && (
                                <section>
                                    <div className="px-4 py-1.5 text-[10px] font-semibold text-n400 uppercase tracking-[0.08em] bg-n50 border-b border-n200 border-t border-t-slate-100">
                                        Sayfalar
                                    </div>
                                    {kwResults.pages.map((pg, i) => {
                                        const idx = mergedCandidates.length + kwResults.positions.length + i;
                                        const Icon = pg.icon;
                                        return (
                                            <button
                                                key={pg.view}
                                                onClick={() => handleSelect({ type: 'page', data: pg })}
                                                onMouseEnter={() => setSelIdx(idx)}
                                                className={`w-full flex items-center gap-2 px-4 py-3 hover:bg-brand-50/60 transition-colors text-left border-b border-n50 ${selIdx === idx ? 'bg-brand-50/60' : ''}`}
                                            >
                                                <div className="w-8 h-8 rounded-md bg-n100 flex items-center justify-center shrink-0">
                                                    <Icon className="w-4 h-4 text-n500" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[12px] font-semibold text-n900">{pg.label}</div>
                                                    <div className="text-[11px] text-n400">{pg.desc}</div>
                                                </div>
                                                <ArrowRight className="w-3.5 h-3.5 text-n200 shrink-0" />
                                            </button>
                                        );
                                    })}
                                </section>
                            )}
                        </div>

                        {hasResults && (
                            <div className="px-4 py-2 bg-n50 border-t border-n200 flex items-center gap-3 text-[10px] text-n400">
                                <span className="flex items-center gap-1"><kbd className="bg-n0 border border-n200 rounded px-1 py-0.5 font-mono text-[11px]">↑↓</kbd> Gezin</span>
                                <span className="flex items-center gap-1"><kbd className="bg-n0 border border-n200 rounded px-1 py-0.5 font-mono text-[11px]">↵</kbd> Seç</span>
                                <span className="flex items-center gap-1"><kbd className="bg-n0 border border-n200 rounded px-1 py-0.5 font-mono text-[11px]">Esc</kbd> Kapat</span>
                                <span className="ml-auto">{total} sonuç</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Actions ── */}
            <div className="flex items-center gap-2 ml-6">

                {/* Notifications */}
                <div className="relative" ref={notifRef}>
                    <button
                        onClick={() => { if (notificationsEnabled) { setNotifOpen(o => !o); setSettOpen(false); } }}
                        className={`p-2.5 rounded-md transition-colors relative ${notifOpen ? 'bg-brand-50 text-brand-600' : notificationsEnabled ? 'text-n500 hover:bg-n100 hover:text-n900' : 'text-n300 cursor-not-allowed'}`}
                        title={notificationsEnabled ? 'Bildirimler' : 'Bildirimler kapalı'}
                    >
                        <Bell className="w-5 h-5" />
                        {notificationsEnabled && unreadCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-bad rounded-full border-2 border-white text-[11px] font-semibold text-white flex items-center justify-center px-0.5 leading-none">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>

                    {notificationsEnabled && notifOpen && (
                        <div className="absolute right-0 top-full mt-2 w-[360px] bg-n0 rounded-md shadow-2xl border border-n200 z-50 overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-n200">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-n900">Bildirimler</span>
                                    {unreadCount > 0 && (
                                        <span className="text-[11px] bg-bad-bg text-bad font-semibold px-1.5 py-0.5 rounded-full">{unreadCount} yeni</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {unreadCount > 0 && (
                                        <button onClick={markAllAsRead} className="text-[11px] text-brand hover:text-brand-700 font-semibold transition-colors">
                                            Tümünü oku
                                        </button>
                                    )}
                                    {notifications.length > 0 && (
                                        <button onClick={clearAll} className="text-[11px] text-n400 hover:text-bad font-medium transition-colors">
                                            Temizle
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="max-h-[380px] overflow-y-auto">
                                {notifications.length === 0 ? (
                                    <div className="py-14 text-center">
                                        <Bell className="w-10 h-10 text-n100 mx-auto mb-3" />
                                        <p className="text-sm font-medium text-n400">Henüz bildirim yok</p>
                                        <p className="text-xs text-n300 mt-1">Yeni aday ve mülakat bildirimleri burada görünür</p>
                                    </div>
                                ) : (
                                    notifications.map(n => {
                                        const cfg  = NOTIF_CONFIG[n.type] || NOTIF_CONFIG.info;
                                        const Icon = cfg.icon;
                                        return (
                                            <button
                                                key={n.id}
                                                onClick={() => markAsRead(n.id)}
                                                className={`w-full flex items-start gap-2 px-4 py-3 hover:bg-n50 transition-colors border-b border-n50 text-left ${!n.read ? 'bg-brand-50/30' : ''}`}
                                            >
                                                <div className={`w-8 h-8 rounded-md ${cfg.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                                                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    {n.title && (
                                                        <div className="text-[11px] font-semibold text-n900 leading-snug mb-0.5">{n.title}</div>
                                                    )}
                                                    <div className="text-[11px] text-n500 leading-relaxed">{n.message}</div>
                                                    <div className="text-[10px] text-n300 mt-1">{formatTime(n.timestamp)}</div>
                                                </div>
                                                {!n.read && (
                                                    <div className="w-2 h-2 rounded-full bg-brand shrink-0 mt-1.5" />
                                                )}
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Settings */}
                <div className="relative" ref={settRef}>
                    <button
                        onClick={() => { setSettOpen(o => !o); setNotifOpen(false); }}
                        className={`p-2.5 rounded-md transition-colors ${settOpen ? 'bg-brand-50 text-brand-600' : 'text-n500 hover:bg-n100 hover:text-n900'}`}
                        title="Ayarlar"
                    >
                        <Settings className="w-5 h-5" />
                    </button>

                    {settOpen && (
                        <div className="absolute right-0 top-full mt-2 w-[210px] bg-n0 rounded-md shadow-2xl border border-n200 z-50 overflow-hidden py-1.5">
                            {SETTINGS_ITEMS.map(item => {
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={item.label}
                                        onClick={() => { dispatchView(item.view); setSettOpen(false); }}
                                        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-n50 transition-colors text-left"
                                    >
                                        <Icon className="w-4 h-4 text-n400 shrink-0" />
                                        <span className="text-[12px] text-n700 font-medium">{item.label}</span>
                                    </button>
                                );
                            })}
                            <div className="border-t border-n200 mt-1 pt-1">
                                <button
                                    onClick={() => { logout(); setSettOpen(false); }}
                                    className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-bad-bg transition-colors text-left group"
                                >
                                    <LogOut className="w-4 h-4 text-n400 group-hover:text-bad shrink-0 transition-colors" />
                                    <span className="text-[12px] font-medium text-n700 group-hover:text-bad transition-colors">Çıkış Yap</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Profile — name/role hidden on small screens */}
                <div className="flex items-center gap-2 pl-2 sm:pl-4 ml-2 border-l border-n200">
                    <div className="w-8 h-8 rounded-full from-brand to-brand flex items-center justify-center text-white text-xs font-semibold shrink-0 select-none">
                        {userName[0]?.toUpperCase() || 'U'}
                    </div>
                    <div className="hidden sm:block">
                        <div className="text-[12px] font-semibold text-n900 leading-none truncate max-w-[110px]">{userName}</div>
                        <div className="text-[10px] text-n500 font-medium mt-0.5">{roleText}</div>
                    </div>
                </div>
            </div>
        </header>
    );
}
