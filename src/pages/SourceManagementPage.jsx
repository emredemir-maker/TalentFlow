// src/pages/SourceManagementPage.jsx
// Management of recruitment sources and their sub-details — light theme

import { useState, useEffect, useMemo } from 'react';
import {
    Globe, Plus, Trash2, Edit3, X, Loader2, Save,
    ChevronDown, Shield, Layers, Link2, Share2, Users,
    Search, Zap, Sparkles, PlusCircle, Info, LayoutGrid, Check
} from 'lucide-react';
import {
    collection, addDoc, updateDoc, deleteDoc, doc,
    onSnapshot, serverTimestamp, query, orderBy
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

const SOURCES_PATH = 'artifacts/talent-flow/public/data/sources';

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

export default function SourceManagementPage() {
    const { isSuperAdmin, user } = useAuth();
    const [sources, setSources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedSource, setExpandedSource] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    const [modalType, setModalType] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        icon: 'Globe',
        color: '#06b6d4',
        isNewMain: false,
        parentSourceId: '',
        mainName: '',
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isSuperAdmin) {
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
            setFormData({ name: '', icon: 'Globe', color: '#06b6d4', isNewMain: true, parentSourceId: '', mainName: '' });
        } else if (type === 'detail') {
            setFormData({ name: '', parentSourceId: data?.id || '', isNewMain: !data?.id, mainName: '', icon: 'Globe', color: '#06b6d4' });
        } else if (type === 'edit_main') {
            setFormData({ name: data.name, icon: data.icon || 'Globe', color: data.color || '#06b6d4', id: data.id, isNewMain: true, parentSourceId: '', mainName: '' });
        }
        setShowModal(true);
    };

    const handleSaveSource = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (modalType === 'main' || modalType === 'edit_main') {
                if (modalType === 'edit_main') {
                    await updateDoc(doc(db, SOURCES_PATH, formData.id), {
                        name: formData.name.trim(), icon: formData.icon,
                        color: formData.color, updatedAt: serverTimestamp()
                    });
                } else {
                    await addDoc(collection(db, SOURCES_PATH), {
                        name: formData.name.trim(), icon: formData.icon,
                        color: formData.color, subSources: [],
                        createdBy: user?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
                    });
                }
            } else if (modalType === 'detail') {
                if (formData.isNewMain) {
                    if (!formData.mainName?.trim()) throw new Error("Yeni ana kaynak adı gerekli.");
                    const newDoc = await addDoc(collection(db, SOURCES_PATH), {
                        name: formData.mainName.trim(), icon: formData.icon,
                        color: formData.color, subSources: [formData.name.trim()],
                        createdBy: user?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
                    });
                } else {
                    const parentId = formData.parentSourceId;
                    if (!parentId) throw new Error("Lütfen bir ana kaynak seçin.");
                    const parentSource = sources.find(s => s.id === parentId);
                    if (!parentSource) throw new Error("Ana kaynak bulunamadı.");
                    const updatedSubs = [...(parentSource.subSources || []), formData.name.trim()];
                    await updateDoc(doc(db, SOURCES_PATH, parentId), { subSources: updatedSubs, updatedAt: serverTimestamp() });
                }
            }
            setShowModal(false);
            setFormData({ name: '', icon: 'Globe', color: '#06b6d4', isNewMain: false, parentSourceId: '', mainName: '' });
        } catch (err) {
            console.error('Kaynak kaydetme hatası:', err);
            alert('Hata: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteSource = async (source) => {
        if (!window.confirm(`"${source.name}" kaynağını ve tüm alt detaylarını silmek istediğinize emin misiniz?`)) return;
        try { await deleteDoc(doc(db, SOURCES_PATH, source.id)); }
        catch (err) { alert('Silme hatası: ' + err.message); }
    };

    const handleRemoveSubSource = async (source, subName) => {
        if (!window.confirm(`"${subName}" alt detayını silmek istediğinize emin misiniz?`)) return;
        try {
            const updatedSubs = source.subSources.filter(s => s !== subName);
            await updateDoc(doc(db, SOURCES_PATH, source.id), { subSources: updatedSubs, updatedAt: serverTimestamp() });
        } catch (err) { alert('Hata: ' + err.message); }
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
                    ...s, createdBy: user?.uid,
                    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
                });
            }
        } catch (err) { alert('Yükleme hatası: ' + err.message); }
        finally { setSaving(false); }
    };

    if (!isSuperAdmin) {
        return (
            <div className="flex items-center justify-center py-24 text-center">
                <div className="space-y-3">
                    <Shield className="w-10 h-10 text-n300 mx-auto" />
                    <p className="text-n500 font-medium text-sm">Bu bölüme erişim yetkiniz bulunmuyor.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-0 pb-10">
            {/* Sub-header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-brand-50 border border-brand-100 flex items-center justify-center">
                        <Share2 className="w-4.5 h-4.5 text-brand" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-n900">Kaynak Havuzu</h2>
                        <p className="text-xs text-n400">Stratejik kanal yönetimi</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-n400" />
                        <input
                            type="text" value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Kaynak ara..."
                            className="pl-9 pr-3 py-2 text-sm border border-n200 rounded-md bg-n0 outline-none focus:border-brand focus:ring-2 focus:ring-brand-50 transition-all w-48"
                        />
                    </div>
                    <button
                        onClick={() => openModal('main')}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-n600 bg-n0 border border-n200 rounded-md hover:border-n300 transition-all"
                    >
                        <PlusCircle className="w-4 h-4" /> Ana Kaynak
                    </button>
                    <button
                        onClick={() => openModal('detail')}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-brand rounded-md hover:bg-brand-600 transition-all"
                    >
                        <Plus className="w-4 h-4" /> Alt Detay
                    </button>
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-7 h-7 text-brand animate-spin" />
                </div>
            ) : sources.length === 0 ? (
                <div className="text-center py-20 bg-n0 rounded-[14px] border border-n200 border-dashed space-y-4">
                    <div className="w-16 h-16 rounded-[14px] bg-n50 border border-n200 mx-auto flex items-center justify-center">
                        <Layers className="w-8 h-8 text-n300" />
                    </div>
                    <div>
                        <h3 className="text-base font-semibold text-n700">Kaynak Havuzu Boş</h3>
                        <p className="text-sm text-n400 mt-1">İşe alım kanallarınızı tanımlayarak başlayın.</p>
                    </div>
                    <div className="flex items-center justify-center gap-3">
                        <button onClick={() => openModal('main')} className="px-4 py-2 text-sm font-semibold text-white bg-brand rounded-md hover:bg-brand-600 transition-all">
                            Kaynak Ekle
                        </button>
                        <button
                            onClick={handleSeedDefaults} disabled={saving}
                            className="px-4 py-2 text-sm font-medium text-n600 bg-n0 border border-n200 rounded-md hover:border-n300 transition-all flex items-center gap-2"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-warn" />}
                            Hazır Önerileri Yükle
                        </button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredSources.map(source => {
                        const isExpanded = expandedSource === source.id;
                        const SourceIcon = ICONS[source.icon] || Globe;
                        const sourceColor = source.color || '#06b6d4';

                        return (
                            <div key={source.id} className={`bg-n0 rounded-[14px] border transition-all duration-300 overflow-hidden ${isExpanded ? 'border-brand-100 shadow-sm shadow-none' : 'border-n200 hover:border-n300'}`}>
                                <div
                                    className="p-5 cursor-pointer"
                                    onClick={() => setExpandedSource(isExpanded ? null : source.id)}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-md flex items-center justify-center border" style={{ background: `${sourceColor}15`, borderColor: `${sourceColor}30` }}>
                                                <SourceIcon className="w-6 h-6" style={{ color: sourceColor }} />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-n900 text-sm">{source.name}</h3>
                                                <span className="text-xs text-n400">{source.subSources?.length || 0} alt detay</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); openModal('edit_main', source); }}
                                                className="w-8 h-8 rounded-md bg-n50 border border-n200 flex items-center justify-center text-n400 hover:text-n600 hover:border-n300 transition-all"
                                            >
                                                <Edit3 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDeleteSource(source); }}
                                                className="w-8 h-8 rounded-md bg-n50 border border-n200 flex items-center justify-center text-n400 hover:text-bad hover:border-transparent transition-all"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                            <div className={`w-8 h-8 rounded-md flex items-center justify-center transition-all ${isExpanded ? 'text-brand' : 'text-n300'}`}>
                                                <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                            </div>
                                        </div>
                                    </div>

                                    {!isExpanded && source.subSources?.length > 0 && (
                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                            {source.subSources.slice(0, 4).map(sub => (
                                                <span key={sub} className="px-2 py-1 rounded-md bg-n50 border border-n200 text-[12px] font-medium text-n500">
                                                    {sub}
                                                </span>
                                            ))}
                                            {source.subSources.length > 4 && (
                                                <span className="px-2 py-1 rounded-md bg-brand-50 border border-brand-100 text-[12px] font-semibold text-brand">
                                                    +{source.subSources.length - 4}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {isExpanded && (
                                    <div className="border-t border-n200 bg-n50/50 p-5 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <LayoutGrid className="w-3.5 h-3.5 text-n400" />
                                                <span className="text-xs font-semibold text-n600 uppercase tracking-wide">Alt Detaylar</span>
                                            </div>
                                            <button
                                                onClick={() => openModal('detail', source)}
                                                className="text-xs font-semibold text-brand hover:text-brand flex items-center gap-1"
                                            >
                                                <Plus className="w-3.5 h-3.5" /> Detay Ekle
                                            </button>
                                        </div>

                                        <div className="space-y-2">
                                            {source.subSources?.length === 0 ? (
                                                <div className="py-6 text-center border border-dashed border-n200 rounded-md">
                                                    <Info className="w-5 h-5 text-n300 mx-auto mb-1.5" />
                                                    <p className="text-xs text-n400">Henüz alt detay eklenmedi.</p>
                                                </div>
                                            ) : (
                                                source.subSources.map(sub => (
                                                    <div key={sub} className="group flex items-center justify-between px-3 py-2.5 rounded-md bg-n0 border border-n200 hover:border-n200 transition-all">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sourceColor }} />
                                                            <span className="text-sm text-n700 font-medium">{sub}</span>
                                                        </div>
                                                        <button
                                                            onClick={() => handleRemoveSubSource(source, sub)}
                                                            className="p-1 rounded-md text-n300 hover:text-bad hover:bg-bad-bg transition-all opacity-0 group-hover:opacity-100"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* MODAL */}
            {showModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
                    <div className="relative w-full max-w-md bg-n0 rounded-[14px] border border-n200 shadow-2xl">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-n200">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-md bg-brand-50 border border-brand-100 flex items-center justify-center">
                                    {(modalType === 'main' || modalType === 'edit_main') ? <Globe className="w-4.5 h-4.5 text-brand" /> : <PlusCircle className="w-4.5 h-4.5 text-brand" />}
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-n900">
                                        {modalType === 'main' ? 'Yeni Ana Kaynak' : modalType === 'edit_main' ? 'Kaynağı Düzenle' : 'Yeni Alt Detay'}
                                    </h3>
                                    <p className="text-xs text-n400">Kaynak Yönetimi</p>
                                </div>
                            </div>
                            <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-md hover:bg-n100 flex items-center justify-center text-n400 transition-all">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveSource} className="p-6 space-y-5">
                            {/* DETAIL TYPE */}
                            {modalType === 'detail' && (
                                <>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-n600 uppercase tracking-wide">Alt Detay Adı</label>
                                        <input
                                            type="text" required value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="Örn: Kariyer.net, LinkedIn İlan..."
                                            className="w-full px-4 py-3 text-sm border border-n200 rounded-md bg-n0 outline-none focus:border-brand focus:ring-2 focus:ring-brand-50 transition-all"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-semibold text-n600 uppercase tracking-wide">Ana Kaynak</label>
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, isNewMain: !formData.isNewMain })}
                                                className="text-xs font-semibold text-brand hover:text-brand"
                                            >
                                                {formData.isNewMain ? '← Mevcut Seç' : '+ Yeni Ana Kaynak'}
                                            </button>
                                        </div>
                                        {formData.isNewMain ? (
                                            <div className="p-4 rounded-md border border-brand-100 bg-brand-50/50 space-y-3">
                                                <input
                                                    type="text" required={formData.isNewMain} value={formData.mainName}
                                                    onChange={(e) => setFormData({ ...formData, mainName: e.target.value })}
                                                    placeholder="Yeni ana kaynak adı..."
                                                    className="w-full px-4 py-2.5 text-sm border border-n200 rounded-md bg-n0 outline-none focus:border-brand transition-all"
                                                />
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <p className="text-[11px] font-semibold text-n500 uppercase mb-2">İkon</p>
                                                        <div className="flex flex-wrap gap-1">
                                                            {['Globe', 'Layers', 'Link2', 'Share2', 'Users', 'Zap', 'Search'].map(icon => {
                                                                const IconComp = ICONS[icon];
                                                                return (
                                                                    <button key={icon} type="button"
                                                                        onClick={() => setFormData({ ...formData, icon })}
                                                                        className={`p-1.5 rounded-md transition-all ${formData.icon === icon ? 'bg-brand text-white' : 'bg-n0 border border-n200 text-n400 hover:border-brand-200'}`}
                                                                    >
                                                                        <IconComp className="w-3.5 h-3.5" />
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <p className="text-[11px] font-semibold text-n500 uppercase mb-2">Renk</p>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {COLORS.slice(0, 6).map(c => (
                                                                <button key={c} type="button"
                                                                    onClick={() => setFormData({ ...formData, color: c })}
                                                                    className={`w-5 h-5 rounded-full border-2 transition-all ${formData.color === c ? 'border-n700 scale-110' : 'border-transparent opacity-60'}`}
                                                                    style={{ backgroundColor: c }}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <select
                                                value={formData.parentSourceId}
                                                onChange={(e) => setFormData({ ...formData, parentSourceId: e.target.value })}
                                                className="w-full px-4 py-3 text-sm border border-n200 rounded-md bg-n0 outline-none focus:border-brand focus:ring-2 focus:ring-brand-50 transition-all"
                                                required={!formData.isNewMain}
                                            >
                                                <option value="" disabled>Ana kaynak seçin...</option>
                                                {sources.map(s => (
                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                </>
                            )}

                            {/* MAIN SOURCE TYPE */}
                            {(modalType === 'main' || modalType === 'edit_main') && (
                                <>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-n600 uppercase tracking-wide">Kaynak Adı</label>
                                        <input
                                            type="text" required value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="Örn: Sosyal Medya, Kariyer Portalı..."
                                            className="w-full px-4 py-3 text-sm border border-n200 rounded-md bg-n0 outline-none focus:border-brand focus:ring-2 focus:ring-brand-50 transition-all"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-n600 uppercase tracking-wide">İkon</label>
                                            <div className="flex flex-wrap gap-1.5 p-3 bg-n50 border border-n200 rounded-md">
                                                {Object.keys(ICONS).map(icon => {
                                                    const IconComp = ICONS[icon];
                                                    return (
                                                        <button key={icon} type="button"
                                                            onClick={() => setFormData({ ...formData, icon })}
                                                            className={`p-2 rounded-md transition-all ${formData.icon === icon ? 'bg-brand text-white shadow-sm' : 'bg-n0 border border-n200 text-n400 hover:border-brand-200'}`}
                                                        >
                                                            <IconComp className="w-3.5 h-3.5" />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-n600 uppercase tracking-wide">Renk</label>
                                            <div className="flex flex-wrap gap-2 p-3 bg-n50 border border-n200 rounded-md">
                                                {COLORS.map(c => (
                                                    <button key={c} type="button"
                                                        onClick={() => setFormData({ ...formData, color: c })}
                                                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${formData.color === c ? 'border-n700 scale-110' : 'border-white shadow-sm opacity-70 hover:opacity-100'}`}
                                                        style={{ backgroundColor: c }}
                                                    >
                                                        {formData.color === c && <Check className="w-3 h-3 text-white" />}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    {/* Preview */}
                                    <div className="flex items-center gap-3 p-3 bg-n50 border border-n200 rounded-md">
                                        <div className="w-10 h-10 rounded-md flex items-center justify-center" style={{ background: `${formData.color}20`, border: `1px solid ${formData.color}30` }}>
                                            {(() => { const IC = ICONS[formData.icon] || Globe; return <IC className="w-5 h-5" style={{ color: formData.color }} />; })()}
                                        </div>
                                        <span className="text-sm font-semibold text-n700">{formData.name || 'Önizleme...'}</span>
                                    </div>
                                </>
                            )}

                            <div className="flex gap-3 pt-1">
                                <button type="button" onClick={() => setShowModal(false)}
                                    className="flex-1 py-2.5 text-sm font-semibold text-n600 bg-n100 rounded-md hover:bg-n100 transition-all"
                                >
                                    İptal
                                </button>
                                <button type="submit" disabled={saving}
                                    className="flex-1 py-2.5 text-sm font-semibold text-white bg-brand rounded-md hover:bg-brand-600 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {saving ? 'Kaydediliyor...' : 'Kaydet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
