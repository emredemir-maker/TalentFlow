// src/pages/SourceManagementPage.jsx
// Management of recruitment sources and their sub-details
// Premium UI with dynamic linking and inline creation logic

import { useState, useEffect, useMemo } from 'react';
import {
    Globe, Plus, Trash2, Edit3, X, Loader2, Save,
    AlertCircle, ChevronDown, ChevronUp, Shield,
    Layers, Link2, Share2, Users, Search, Zap,
    Filter, LayoutGrid, List, Sparkles, MoveRight,
    PlusCircle, Info
} from 'lucide-react';
import {
    collection, addDoc, updateDoc, deleteDoc, doc,
    onSnapshot, serverTimestamp, query, orderBy
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';

const SOURCES_PATH = 'artifacts/talent-flow/public/data/sources';

export default function SourceManagementPage() {
    const { isSuperAdmin, user } = useAuth();
    const [sources, setSources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedSource, setExpandedSource] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Modal State
    const [modalType, setModalType] = useState(null); // 'main', 'detail', 'edit_main', 'edit_detail'
    const [showModal, setShowModal] = useState(false);

    // Form Data
    const [formData, setFormData] = useState({
        name: '',
        icon: 'Globe',
        color: '#3b82f6',
        isNewMain: false,
        parentSourceId: '',
        subSourceOriginal: ''
    });

    const [saving, setSaving] = useState(false);

    const ICONS = {
        Globe: Globe,
        Layers: Layers,
        Link2: Link2,
        Share2: Share2,
        Users: Users,
        Zap: Zap,
        Search: Search
    };

    const COLORS = [
        '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
        '#10b981', '#06b6d4', '#ef4444', '#6366f1',
        '#f43f5e', '#a855f7'
    ];

    useEffect(() => {
        if (!isSuperAdmin) {
            // If auth is loaded but not super admin, we should stop loading anyway
            // because the return in render handles the restricted access UI
            if (user !== undefined) setLoading(false);
            return;
        }

        const q = query(collection(db, SOURCES_PATH), orderBy('createdAt', 'asc'));
        const unsub = onSnapshot(q, (snap) => {
            setSources(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (err) => {
            console.error('Sources error:', err);
            setLoading(false);
        });
        return unsub;
    }, [isSuperAdmin, user]);


    // Derived: Search filtered sources
    const filteredSources = useMemo(() => {
        if (!searchQuery.trim()) return sources;
        const lower = searchQuery.toLowerCase();
        return sources.filter(s =>
            s.name.toLowerCase().includes(lower) ||
            s.subSources?.some(sub => sub.toLowerCase().includes(lower))
        );
    }, [sources, searchQuery]);

    const openModal = (type, data = null) => {
        setModalType(type);
        if (type === 'main') {
            setFormData({ name: '', icon: 'Globe', color: '#3b82f6', isNewMain: true, parentSourceId: '' });
        } else if (type === 'detail') {
            setFormData({ name: '', parentSourceId: data?.id || '', isNewMain: !data?.id });
        } else if (type === 'edit_main') {
            setFormData({
                name: data.name,
                icon: data.icon || 'Globe',
                color: data.color || '#3b82f6',
                id: data.id,
                isNewMain: true
            });
        }
        setShowModal(true);
    };

    const handleSaveSource = async (e) => {
        e.preventDefault();
        setSaving(true);

        try {
            if (modalType === 'main' || modalType === 'edit_main') {
                // Top-level Source Logic
                if (modalType === 'edit_main') {
                    await updateDoc(doc(db, SOURCES_PATH, formData.id), {
                        name: formData.name.trim(),
                        icon: formData.icon,
                        color: formData.color,
                        updatedAt: serverTimestamp()
                    });
                } else {
                    await addDoc(collection(db, SOURCES_PATH), {
                        name: formData.name.trim(),
                        icon: formData.icon,
                        color: formData.color,
                        subSources: [],
                        createdBy: user?.uid,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    });
                }
            } else if (modalType === 'detail') {
                // Sub-source Logic
                if (!parentId) throw new Error("Lütfen bir ana kaynak seçin.");

                const parentSource = sources.find(s => s.id === parentId);
                if (!parentSource) throw new Error("Ana kaynak bulunamadı.");

                const updatedSubs = [...(parentSource.subSources || []), formData.name.trim()];
                await updateDoc(doc(db, SOURCES_PATH, parentId), {
                    subSources: updatedSubs,
                    updatedAt: serverTimestamp()
                });
            }

            setShowModal(false);
            setFormData({ name: '', icon: 'Globe', color: '#3b82f6', isNewMain: false, parentSourceId: '' });
        } catch (err) {
            console.error('Kaynak kaydetme hatası:', err);
            alert('Hata: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteSource = async (source) => {
        if (!window.confirm(`"${source.name}" kaynağını ve tüm alt detaylarını silmek istediğinize emin misiniz?`)) return;
        try {
            await deleteDoc(doc(db, SOURCES_PATH, source.id));
        } catch (err) {
            alert('Silme hatası: ' + err.message);
        }
    };

    const handleRemoveSubSource = async (source, subName) => {
        if (!window.confirm(`"${subName}" alt detayını silmek istediğinize emin misiniz?`)) return;
        try {
            const updatedSubs = source.subSources.filter(s => s !== subName);
            await updateDoc(doc(db, SOURCES_PATH, source.id), {
                subSources: updatedSubs,
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            alert('Hata: ' + err.message);
        }
    };

    const handleSeedDefaults = async () => {
        setSaving(true);
        try {
            const defaults = [
                { name: 'İşe Alım Firması', icon: 'Users', color: '#f59e0b', subSources: ['Adecco', 'Randstad', 'Manpower'] },
                { name: 'Sosyal Medya', icon: 'Share2', color: '#3b82f6', subSources: ['LinkedIn', 'Instagram', 'Facebook'] },
                { name: 'Kariyer Portalları', icon: 'Globe', color: '#ec4899', subSources: ['Kariyer.net', 'Indeed', 'Glassdoor'] },
                { name: 'Referral / Öneri', icon: 'Zap', color: '#10b981', subSources: ['İç Referans', 'Network', 'Eski Çalışan'] },
                { name: 'Direkt Başvuru', icon: 'Link2', color: '#8b5cf6', subSources: ['Şirket Web Sitesi', 'E-posta'] }
            ];

            for (const s of defaults) {
                await addDoc(collection(db, SOURCES_PATH), {
                    ...s,
                    createdBy: user?.uid,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            }
            alert('Sistem kaynakları başarıyla yüklendi!');
        } catch (err) {
            alert('Yükleme hatası: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    if (!isSuperAdmin) {
        return (
            <div className="min-h-screen flex items-center justify-center p-8 text-center">
                <div className="glass p-12 rounded-[3rem] border border-text-primary/5 space-y-4">
                    <Shield className="w-16 h-16 text-red-500/50 mx-auto" />
                    <h2 className="text-2xl font-black text-text-primary">Erişim Reddedildi</h2>
                    <p className="text-navy-400 max-w-xs">Bu yönetim paneli sadece Süper Admin yetkisine sahip kullanıcılar içindir.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen pb-24 overflow-x-hidden">
            <Header title="İşe Alım Kaynakları" />

            <div className="max-w-6xl mx-auto px-6 py-12 space-y-12">

                {/* ADVANCED HEADER */}
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 animate-fade-in">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                                <Globe className="w-6 h-6 text-indigo-400" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-text-primary tracking-tighter">Kaynak Havuzu</h2>
                                <p className="text-navy-500 text-xs font-bold uppercase tracking-[0.2em] mt-0.5">Stratejik Kanal Yönetimi</p>
                            </div>
                        </div>
                        <div className="relative group max-w-md">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-600 group-focus-within:text-electric transition-colors" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Kaynak veya alt detay ara..."
                                className="w-full bg-text-primary/[0.03] border border-text-primary/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm text-text-primary outline-none focus:border-electric/50 transition-all backdrop-blur-xl"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => openModal('main')}
                            className="px-6 py-4 rounded-2xl bg-text-primary/[0.03] border border-text-primary/10 hover:border-white/20 text-text-primary font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 active:scale-95"
                        >
                            <PlusCircle className="w-4 h-4 text-indigo-400" /> Ana Kaynak Ekle
                        </button>
                        <button
                            onClick={() => openModal('detail')}
                            className="px-8 py-4 rounded-2xl bg-indigo-600 text-text-primary font-black text-[10px] uppercase tracking-widest shadow-2xl shadow-indigo-600/30 hover:bg-indigo-500 transition-all flex items-center gap-2 active:scale-95"
                        >
                            <Sparkles className="w-4 h-4" /> Yeni Alt Detay
                        </button>
                    </div>
                </div>

                {/* LISTING */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-32 space-y-4">
                        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                        <span className="text-navy-500 text-[10px] font-black uppercase tracking-widest">Veriler Yükleniyor...</span>
                    </div>
                ) : sources.length === 0 ? (
                    <div className="text-center py-32 glass rounded-[4rem] border border-text-primary/[0.04] space-y-6">
                        <div className="w-24 h-24 rounded-full bg-text-primary/5 mx-auto flex items-center justify-center">
                            <Layers className="w-10 h-10 text-navy-700" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-xl font-black text-text-primary">Havuz Henüz Boş</h3>
                            <p className="text-navy-500 text-sm max-w-sm mx-auto">İşe alım kanallarınızı tanımlayarak aday kaynaklarını organize etmeye başlayın.</p>
                        </div>
                        <div className="flex flex-col md:flex-row items-center justify-center gap-4">
                            <button onClick={() => openModal('main')} className="px-8 py-4 rounded-2xl bg-indigo-500 text-text-primary font-bold text-xs uppercase tracking-widest hover:bg-indigo-400 transition-all">
                                Kendi Kaynağımı Ekle
                            </button>
                            <button
                                onClick={handleSeedDefaults}
                                disabled={saving}
                                className="px-8 py-4 rounded-2xl bg-text-primary/5 border border-text-primary/10 text-navy-300 font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-500" />}
                                Hazır Sistem Önerilerini Yükle
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 stagger">
                        {filteredSources.map(source => {
                            const isExpanded = expandedSource === source.id;
                            const SourceIcon = ICONS[source.icon] || Globe;
                            const sourceColor = source.color || '#3b82f6';

                            return (
                                <div key={source.id} className="group relative">
                                    {/* Card Glow */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-[2.5rem] opacity-0 group-hover:opacity-100 transition-opacity blur-2xl -z-10" />

                                    <div className={`glass rounded-[2.5rem] border transition-all duration-500 overflow-hidden ${isExpanded ? 'border-indigo-500/30 shadow-indigo-500/10' : 'border-text-primary/[0.06] hover:border-white/15'}`}>
                                        <div
                                            className="p-8 cursor-pointer relative"
                                            onClick={() => setExpandedSource(isExpanded ? null : source.id)}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-5">
                                                    <div className="w-16 h-16 rounded-[1.5rem] flex items-center justify-center border border-text-primary/5 shadow-inner" style={{ background: `linear-gradient(135deg, ${sourceColor}20, ${sourceColor}05)` }}>
                                                        <SourceIcon className="w-8 h-8" style={{ color: sourceColor }} />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <h3 className="text-xl font-black text-text-primary leading-none tracking-tight">{source.name}</h3>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-black text-navy-500 uppercase tracking-widest">
                                                                {source.subSources?.length || 0} SEÇENEK
                                                            </span>
                                                            <div className="w-1 h-1 rounded-full bg-navy-800" />
                                                            <span className="text-[10px] font-bold text-navy-600 uppercase">AKTİF</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); openModal('edit_main', source); }}
                                                        className="w-10 h-10 rounded-xl bg-text-primary/5 border border-text-primary/10 flex items-center justify-center text-navy-400 hover:text-text-primary transition-all"
                                                    >
                                                        <Edit3 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteSource(source); }}
                                                        className="w-10 h-10 rounded-xl bg-text-primary/5 border border-text-primary/10 flex items-center justify-center text-navy-400 hover:text-red-400 transition-all"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Sub-source Preview Chips */}
                                            {!isExpanded && source.subSources?.length > 0 && (
                                                <div className="mt-8 flex flex-wrap gap-2">
                                                    {source.subSources.slice(0, 3).map(sub => (
                                                        <span key={sub} className="px-3 py-1.5 rounded-xl bg-text-primary/[0.03] border border-text-primary/[0.06] text-[10px] font-bold text-navy-400">
                                                            {sub}
                                                        </span>
                                                    ))}
                                                    {source.subSources.length > 3 && (
                                                        <span className="px-3 py-1.5 rounded-xl bg-indigo-500/10 text-indigo-400 text-[10px] font-black">
                                                            +{source.subSources.length - 3}
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            <div className={`absolute bottom-6 right-6 transition-all duration-300 ${isExpanded ? 'rotate-180 text-indigo-400' : 'text-navy-500'}`}>
                                                <ChevronDown className="w-6 h-6" />
                                            </div>
                                        </div>

                                        {/* EXPANDED CONTENT */}
                                        {isExpanded && (
                                            <div className="border-t border-text-primary/[0.06] bg-black/10 p-8 space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <LayoutGrid className="w-4 h-4 text-indigo-400" />
                                                        <h4 className="text-[11px] font-black text-text-primary uppercase tracking-[0.2em]">Alt Detaylar</h4>
                                                    </div>
                                                    <button
                                                        onClick={() => openModal('detail', source)}
                                                        className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest border-b border-indigo-400/20"
                                                    >
                                                        Detay Ekle
                                                    </button>
                                                </div>

                                                <div className="grid grid-cols-1 gap-2">
                                                    {source.subSources?.length === 0 ? (
                                                        <div className="py-8 text-center border-2 border-dashed border-text-primary/5 rounded-3xl">
                                                            <Info className="w-6 h-6 text-navy-700 mx-auto mb-2" />
                                                            <p className="text-xs text-navy-600 font-medium italic">Henüz bu kategoriye özel bir detay eklenmedi.</p>
                                                        </div>
                                                    ) : (
                                                        source.subSources.map(sub => (
                                                            <div key={sub} className="group/sub flex items-center justify-between p-4 rounded-2xl bg-text-primary/[0.02] border border-text-primary/[0.04] hover:bg-white/[0.05] hover:border-text-primary/10 transition-all">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                                                    <span className="text-sm font-bold text-navy-200">{sub}</span>
                                                                </div>
                                                                <button
                                                                    onClick={() => handleRemoveSubSource(source, sub)}
                                                                    className="p-2 rounded-xl text-navy-500 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover/sub:opacity-100"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* UNIFIED MODAL: HIGH PREMIUM DESIGN */}
            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-navy-950/90 backdrop-blur-2xl animate-fade-in" onClick={() => setShowModal(false)} />

                    <div className="relative w-full max-w-lg glass rounded-[3rem] border border-text-primary/10 p-10 shadow-[0_32px_128px_rgba(0,0,0,0.8)] animate-scale-in">

                        {/* Decorative Background Glows */}
                        <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-600/20 rounded-full blur-[100px] -z-10" />
                        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-purple-600/20 rounded-full blur-[100px] -z-10" />

                        <div className="flex items-center justify-between mb-10">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shadow-inner">
                                    {(modalType === 'main' || modalType === 'edit_main') ? <Globe className="w-7 h-7 text-indigo-400" /> : <PlusCircle className="w-7 h-7 text-indigo-400" />}
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-text-primary tracking-tighter">
                                        {modalType === 'main' ? 'Yeni Ana Kaynak' :
                                            modalType === 'edit_main' ? 'Kaynağı Güncelle' :
                                                'Yeni Alt Detay'}
                                    </h3>
                                    <p className="text-[10px] text-navy-500 font-bold uppercase tracking-[0.2em] mt-0.5">Yönetim Paneli Girişi</p>
                                </div>
                            </div>
                            <button onClick={() => setShowModal(false)} className="w-12 h-12 rounded-2xl hover:bg-text-primary/5 border border-transparent hover:border-text-primary/10 text-navy-500 hover:text-text-primary transition-all flex items-center justify-center">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveSource} className="space-y-8">

                            {/* SUB-SOURCE SPECIFIC: MATCHING LOGIC */}
                            {modalType === 'detail' && (
                                <>
                                    <div className="space-y-3">
                                        <label className="text-[10px] text-navy-500 uppercase font-black tracking-widest ml-1">Alt Detay İsmi</label>
                                        <input
                                            type="text" required value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="Örn: Kariyer.net, Linkedin İlan, Firma X"
                                            className="w-full px-6 py-5 bg-text-primary/[0.03] border border-text-primary/10 rounded-[1.5rem] text-text-primary outline-none focus:border-indigo-500/50 transition-all text-sm font-bold shadow-inner"
                                        />
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] text-navy-500 uppercase font-black tracking-widest ml-1">Ana Kaynak Eşleşmesi</label>
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, isNewMain: !formData.isNewMain })}
                                                className="text-[9px] font-black text-indigo-400 whitespace-nowrap hover:text-indigo-300"
                                            >
                                                {formData.isNewMain ? '← Mevcut Olanlardan Seç' : '+ Yeni Ana Kaynak Ekle'}
                                            </button>
                                        </div>

                                        {formData.isNewMain ? (
                                            <div className="p-6 rounded-[2rem] bg-indigo-500/[0.03] border border-indigo-500/10 space-y-4 animate-in fade-in slide-in-from-top-2">
                                                <input
                                                    type="text" required value={formData.mainName || ''}
                                                    onChange={(e) => setFormData({ ...formData, mainName: e.target.value })}
                                                    placeholder="Yeni ana kaynak adı (Örn: Sosyal Medya)"
                                                    className="w-full px-5 py-4 bg-navy-950 border border-text-primary/5 rounded-2xl text-sm text-text-primary outline-none focus:border-indigo-500"
                                                />
                                                <div className="flex items-center justify-between gap-4">
                                                    <div className="flex-1 space-y-2">
                                                        <span className="text-[9px] text-navy-600 font-bold uppercase ml-1">İkon</span>
                                                        <div className="flex flex-wrap gap-1.5 p-2 bg-black/20 rounded-xl">
                                                            {['Globe', 'Layers', 'Link2', 'Share2', 'Users'].map(icon => {
                                                                const IconComp = ICONS[icon];
                                                                return (
                                                                    <button
                                                                        key={icon} type="button"
                                                                        onClick={() => setFormData({ ...formData, icon: icon })}
                                                                        className={`p-2 rounded-lg transition-all ${formData.icon === icon ? 'bg-indigo-500 text-text-primary' : 'text-navy-700 hover:text-navy-400'}`}
                                                                    >
                                                                        <IconComp className="w-4 h-4" />
                                                                    </button>
                                                                )
                                                            })}
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 space-y-2">
                                                        <span className="text-[9px] text-navy-600 font-bold uppercase ml-1">Renk</span>
                                                        <div className="flex flex-wrap gap-1 p-2 bg-black/20 rounded-xl">
                                                            {COLORS.slice(0, 5).map(c => (
                                                                <button
                                                                    key={c} type="button"
                                                                    onClick={() => setFormData({ ...formData, color: c })}
                                                                    className={`w-4 h-4 rounded-full border border-black/20 ${formData.color === c ? 'ring-2 ring-white scale-110' : 'opacity-40'}`}
                                                                    style={{ backgroundColor: c }}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="relative">
                                                <select
                                                    value={formData.parentSourceId}
                                                    onChange={(e) => setFormData({ ...formData, parentSourceId: e.target.value })}
                                                    className="w-full px-6 py-5 bg-text-primary/[0.03] border border-text-primary/10 rounded-[1.5rem] text-text-primary outline-none focus:border-indigo-500/50 transition-all text-sm font-bold appearance-none shadow-inner"
                                                    required
                                                >
                                                    <option value="" disabled className="bg-navy-900">Bir ana kaynak seçin...</option>
                                                    {sources.map(s => (
                                                        <option key={s.id} value={s.id} className="bg-navy-900">{s.name}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-navy-600 pointer-events-none" />
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}

                            {/* MAIN SOURCE SPECIFIC */}
                            {(modalType === 'main' || modalType === 'edit_main') && (
                                <>
                                    <div className="space-y-3">
                                        <label className="text-[10px] text-navy-500 uppercase font-black tracking-widest ml-1">Ana Kaynak Adı</label>
                                        <input
                                            type="text" required value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="Örn: Sosyal Medya, İşe Alım Firması"
                                            className="w-full px-6 py-5 bg-text-primary/[0.03] border border-text-primary/10 rounded-[1.5rem] text-text-primary outline-none focus:border-indigo-500/50 transition-all text-sm font-bold shadow-inner"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-4">
                                            <label className="text-[10px] text-navy-500 uppercase font-black tracking-widest ml-1">İkon Tasarımı</label>
                                            <div className="grid grid-cols-4 gap-2 p-4 bg-text-primary/[0.02] border border-text-primary/5 rounded-[1.5rem]">
                                                {Object.keys(ICONS).map(iconName => {
                                                    const IconComp = ICONS[iconName];
                                                    return (
                                                        <button
                                                            key={iconName} type="button"
                                                            onClick={() => setFormData({ ...formData, icon: iconName })}
                                                            className={`p-3 rounded-2xl border-2 transition-all flex items-center justify-center ${formData.icon === iconName ? 'bg-indigo-600 border-indigo-500 text-text-primary shadow-lg shadow-indigo-600/30' : 'bg-transparent border-transparent text-navy-700 hover:text-navy-400'}`}
                                                        >
                                                            <IconComp className="w-5 h-5" />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <label className="text-[10px] text-navy-500 uppercase font-black tracking-widest ml-1">Marka Rengi</label>
                                            <div className="grid grid-cols-5 gap-2.5 p-4 bg-text-primary/[0.02] border border-text-primary/5 rounded-[1.5rem]">
                                                {COLORS.map(c => (
                                                    <button
                                                        key={c} type="button"
                                                        onClick={() => setFormData({ ...formData, color: c })}
                                                        className={`w-7 h-7 rounded-full transition-all relative ${formData.color === c ? 'ring-4 ring-white shadow-xl scale-110' : 'opacity-40 hover:opacity-100 hover:scale-110'}`}
                                                        style={{ backgroundColor: c }}
                                                    >
                                                        {formData.color === c && <div className="absolute inset-0 rounded-full border-2 border-black/20" />}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            <button type="submit" disabled={saving || (!formData.name && !formData.mainName)}
                                className="w-full py-6 mt-6 bg-gradient-to-r from-indigo-600 to-indigo-500 text-text-primary font-black text-xs uppercase tracking-[0.3em] rounded-[1.5rem] hover:translate-y-[-4px] active:translate-y-0 transition-all duration-300 shadow-2xl shadow-indigo-600/40 disabled:opacity-50 flex items-center justify-center gap-3 group relative overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                {modalType === 'edit_main' ? 'GÜNCELLEMEYİ KAYDET' :
                                    modalType === 'main' ? 'KAYNAĞI OLUŞTUR' : 'DETAYI KAYDET'}
                                <MoveRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
