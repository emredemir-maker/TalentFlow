// src/pages/SuperAdminPage.jsx
import { useState, useEffect, useMemo } from 'react';
import {
    UserPlus, Shield, Loader2, ShieldCheck, Trash2, Edit2, Key, Eye, EyeOff, X
} from 'lucide-react';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth, HUB_INN_URL } from '../context/AuthContext';
import AiUsagePanel from '../components/AiUsagePanel';
import RetentionPanel from '../components/RetentionPanel';
import { tc } from '../config/tenantPaths';

const USERS_PATH = () => tc('members');

export default function SuperAdminPage() {
    const { user, isSuperAdmin } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [departments, setDepartments] = useState([]);
    // Gemini Key (platform ayarı — sunucu yalnız platform yöneticisine açar)
    const [geminiKey, setGeminiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);
    const [savedKeyLast4, setSavedKeyLast4] = useState(null);
    const [activeTab, setActiveTab] = useState('users');
    // Edit User
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);

    useEffect(() => {
        const unsub = onSnapshot(collection(db, tc('departments')), (snap) => {
            setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return unsub;
    }, []);

    const departmentOptions = useMemo(() => {
        return departments.map(d => d.name).sort();
    }, [departments]);

    // Şirketin üyeleri (tenants/{t}/members). Üye ekleme Hub'dan (K3);
    // rol/departman ve üyelik kaldırma sunucu ucundan — istemci üyelik yazamaz.
    useEffect(() => {
        if (!isSuperAdmin) return undefined;
        const unsubUsers = onSnapshot(
            query(collection(db, USERS_PATH()), where('status', '==', 'active')),
            (snap) => {
                setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                setLoading(false);
            },
            () => setLoading(false)
        );
        const fetchKeyStatus = async () => {
            try {
                const token = await user.getIdToken();
                const res = await fetch('/api/admin/api-keys', { headers: { Authorization: `Bearer ${token}` } });
                if (res.ok) {
                    const data = await res.json();
                    if (data?.gemini?.set) setSavedKeyLast4(data.gemini.last4 || '????');
                }
            } catch (err) { console.warn("Could not fetch API key status:", err); }
        };
        fetchKeyStatus();
        return () => { unsubUsers(); };
    }, [isSuperAdmin, user]);

    /** Yönetim ucu çağrısı (sunucu: requireTenant(['admin'])). */
    const callMemberApi = async (method, uid, body) => {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/members/${encodeURIComponent(uid)}`, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Sunucu hatası (${res.status})`);
        return data;
    };

    const handleDeleteUser = async (userToDelete) => {
        if (userToDelete.id === user.uid) return alert("Kendi üyeliğinizi buradan kaldıramazsınız.");
        if (!window.confirm(`${userToDelete.displayName || userToDelete.email} bu şirketten çıkarılsın mı? Clyro hesabı silinmez.`)) return;
        try {
            await callMemberApi('DELETE', userToDelete.id);
        } catch (err) { alert(`Üyelik kaldırılamadı: ${err.message}`); }
    };

    const handleOpenEdit = (userToEdit) => {
        setEditingUser({
            id: userToEdit.id,
            displayName: userToEdit.displayName,
            email: userToEdit.email,
            role: userToEdit.role || 'recruiter',
            departments: userToEdit.departments || []
        });
        setShowEditModal(true);
    };

    const handleSaveGeminiKey = async () => {
        if (!geminiKey.trim()) return alert("Lütfen bir anahtar girin.");
        setSavingSettings(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/admin/api-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ gemini: geminiKey.trim() }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Sunucu hatası (${res.status})`);
            setSavedKeyLast4(data.last4 || '????');
            setGeminiKey('');
            alert("✅ Gemini API Key başarıyla kaydedildi.");
        } catch (err) { alert("❌ Hata: " + err.message); }
        finally { setSavingSettings(false); }
    };

    const handleUpdateUser = async (e) => {
        e.preventDefault();
        if (!editingUser) return;
        setSending(true);
        setError(null);
        try {
            await callMemberApi('PATCH', editingUser.id, {
                role: editingUser.role,
                departments: editingUser.role === 'department_user' ? editingUser.departments : [],
            });
            setShowEditModal(false);
            setEditingUser(null);
        } catch (err) { setError(err.message); }
        finally { setSending(false); }
    };

    if (!isSuperAdmin) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-center">
                <Shield className="w-10 h-10 text-bad mb-3" />
                <h2 className="text-sm font-semibold text-n700">Erişim Reddedildi</h2>
                <p className="text-xs text-n400 mt-1">Bu sayfa yalnızca şirket yöneticisine açıktır.</p>
            </div>
        );
    }

    const superAdmins = users.filter(u => u.role === 'admin').length;

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-5">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-md bg-brand-50 border border-brand-100 flex items-center justify-center">
                        <Shield className="w-4 h-4 text-brand" />
                    </div>
                    <div>
                        <h1 className="text-[15px] font-semibold text-n900 tracking-tight">Sistem Yönetimi</h1>
                        <p className="text-[10px] text-n400 font-medium">Kullanıcı ve yetki yönetimi</p>
                    </div>
                </div>
                {/* Kişi ekleme Hub'dan (K3): Talent'ın kendi daveti yok. */}
                <a
                    href={HUB_INN_URL}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-brand hover:bg-brand-600 text-white text-xs font-semibold transition-colors shadow-sm shadow-none"
                >
                    <UserPlus className="w-3.5 h-3.5" /> Hub'dan Kişi Davet Et
                </a>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 gap-2">
                {[
                    { label: 'Aktif Üye', value: users.length, color: 'text-ok', bg: 'bg-ok-bg', border: 'border-transparent', icon: ShieldCheck },
                    { label: 'Yönetici', value: superAdmins, color: 'text-brand', bg: 'bg-brand-50', border: 'border-brand-100', icon: Shield },
                ].map((s, i) => (
                    <div key={i} className={`bg-n0 rounded-md border border-n200 px-4 py-3 flex items-center justify-between`}>
                        <div>
                            <p className="text-[10px] font-semibold text-n400 uppercase tracking-[0.08em]">{s.label}</p>
                            <p className={`text-[22px] font-semibold ${s.color} leading-tight`}>{s.value}</p>
                        </div>
                        <div className={`w-9 h-9 rounded-md ${s.bg} border ${s.border} flex items-center justify-center`}>
                            <s.icon className={`w-4 h-4 ${s.color}`} />
                        </div>
                    </div>
                ))}
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-1 border-b border-n200">
                {[
                    { id: 'users', label: 'Kullanıcılar' },
                    { id: 'settings', label: 'Sistem Ayarları' },
                    { id: 'usage', label: 'AI Kullanımı' },
                    { id: 'retention', label: 'Saklama ve İmha' }
                ].map(t => (
                    <button
                        key={t.id}
                        onClick={() => setActiveTab(t.id)}
                        className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all whitespace-nowrap -mb-px ${
                            activeTab === t.id ? 'border-brand text-brand' : 'border-transparent text-n500 hover:text-n700'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {activeTab === 'usage' && <AiUsagePanel />}

            {activeTab === 'retention' && <RetentionPanel />}

            {activeTab === 'users' && (
                <div className="grid grid-cols-1 gap-3">
                    {/* Users Table */}
                    <div className="bg-n0 rounded-[14px] border border-n200 overflow-hidden">
                        <div className="px-4 py-3 border-b border-n200 flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-ok" />
                            <h2 className="text-[11px] font-semibold text-n900">Aktif Kullanıcılar</h2>
                            <span className="ml-auto text-[11px] font-semibold bg-n100 text-n500 px-2 py-0.5 rounded-full">{users.length}</span>
                        </div>
                        <div className="divide-y divide-n100">
                            {loading ? (
                                <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-n300" /></div>
                            ) : users.length === 0 ? (
                                <p className="py-8 text-center text-xs text-n400 italic">Henüz kullanıcı yok.</p>
                            ) : users.map(u => (
                                <div key={u.id} className="px-4 py-3 flex items-center gap-2 group hover:bg-n50 transition-colors">
                                    <div className="w-8 h-8 rounded-md from-brand to-brand flex items-center justify-center text-[10px] font-semibold text-white shrink-0">
                                        {u.displayName?.substring(0, 2).toUpperCase() || 'U'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[11px] font-semibold text-n900 truncate">{u.displayName}</p>
                                        <p className="text-[10px] text-n400 font-mono truncate">{u.email}</p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <RolePill role={u.role} />
                                    </div>
                                    {u.id !== user.uid && (
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                            <button
                                                onClick={() => handleOpenEdit(u)}
                                                className="p-1.5 rounded-md bg-n100 hover:bg-brand-50 hover:text-brand text-n400 transition-colors"
                                                title="Düzenle"
                                            >
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(u)}
                                                className="p-1.5 rounded-md bg-n100 hover:bg-bad-bg hover:text-bad-text text-n400 transition-colors"
                                                title="Sil"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            )}

            {activeTab === 'settings' && (
                <div className="max-w-lg bg-n0 rounded-[14px] border border-n200 p-3.5 space-y-4">
                    <div className="flex items-center gap-2 pb-4 border-b border-n200">
                        <div className="w-8 h-8 rounded-md bg-brand-50 border border-brand-100 flex items-center justify-center">
                            <Key className="w-4 h-4 text-brand" />
                        </div>
                        <div>
                            <h2 className="text-[12px] font-semibold text-n900">API Anahtarları</h2>
                            <p className="text-[10px] text-n400">Uygulama genelinde kullanılan servis anahtarları</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-semibold text-n400 uppercase tracking-[0.08em] flex items-center gap-1">
                            <Key className="w-2.5 h-2.5" /> Gemini API Key
                            {savedKeyLast4 && (
                                <span className="normal-case tracking-normal font-semibold text-ok ml-1">
                                    (kayıtlı: ••••{savedKeyLast4})
                                </span>
                            )}
                        </label>
                        <div className="relative">
                            <input
                                type={showKey ? 'text' : 'password'}
                                value={geminiKey}
                                onChange={(e) => setGeminiKey(e.target.value)}
                                placeholder={savedKeyLast4 ? 'Yeni anahtar girin (mevcut anahtar görüntülenemez)' : 'AI özellikleri için Gemini API anahtarı...'}
                                className="w-full bg-n50 border border-n200 rounded-md px-4 py-2.5 pr-10 text-[12px] text-n700 font-mono outline-none focus:border-brand focus:ring-2 focus:ring-brand-100 transition-all"
                            />
                            <button
                                onClick={() => setShowKey(!showKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-n400 hover:text-n600"
                            >
                                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        <p className="text-[10px] text-n400">
                            CV ayrıştırma ve otomatik soru oluşturma için kullanılır.
                            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-brand hover:underline ml-1">Ücretsiz al →</a>
                        </p>
                    </div>

                    <button
                        onClick={handleSaveGeminiKey}
                        disabled={savingSettings}
                        className="w-full py-2.5 bg-brand hover:bg-brand-600 text-white font-semibold text-sm rounded-md transition-colors shadow-sm shadow-none flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                        {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                        Kaydet
                    </button>
                </div>
            )}

            {/* Edit User Modal */}
            {showEditModal && editingUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-3 animate-in fade-in duration-200">
                    <div className="bg-n0 rounded-[14px] shadow-2xl border border-n200 w-full max-w-sm animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-n200">
                            <div className="flex items-center gap-2">
                                <Edit2 className="w-4 h-4 text-brand" />
                                <h3 className="text-[12px] font-semibold text-n900">Kullanıcıyı Düzenle</h3>
                            </div>
                            <button onClick={() => setShowEditModal(false)} className="p-1 text-n400 hover:text-n600 rounded-md hover:bg-n50">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <form onSubmit={handleUpdateUser} className="px-5 py-3 space-y-3">
                            <div className="bg-n50 border border-n200 rounded-md px-3 py-2.5">
                                <p className="text-[11px] font-semibold text-n700">{editingUser.displayName}</p>
                                <p className="text-[10px] text-n400 font-mono">{editingUser.email}</p>
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-n400 uppercase tracking-[0.08em] block mb-1.5">Rol</label>
                                <select
                                    value={editingUser.role}
                                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                                    className="w-full bg-n50 border border-n200 rounded-md px-3 py-2 text-sm text-n700 outline-none focus:border-brand focus:ring-2 focus:ring-brand-100 transition-all"
                                >
                                    <option value="recruiter">Recruiter (İK Uzmanı)</option>
                                    <option value="department_user">Departman Kullanıcısı</option>
                                    <option value="admin">Yönetici</option>
                                </select>
                            </div>
                            {editingUser.role === 'department_user' && (
                                <div>
                                    <label className="text-[10px] font-semibold text-n400 uppercase tracking-[0.08em] block mb-1.5">Departmanlar</label>
                                    <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto">
                                        {departmentOptions.map(dept => (
                                            <button
                                                key={dept} type="button"
                                                onClick={() => {
                                                    const current = editingUser.departments || [];
                                                    setEditingUser({ ...editingUser, departments: current.includes(dept) ? current.filter(d => d !== dept) : [...current, dept] });
                                                }}
                                                className={`px-2.5 py-2 rounded-md text-[11px] font-semibold text-left transition-all border ${
                                                    editingUser.departments?.includes(dept)
                                                        ? 'bg-brand-50 border-brand-100 text-brand'
                                                        : 'bg-n50 border-n200 text-n500 hover:border-n300'
                                                }`}
                                            >
                                                {dept}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {error && <p className="text-[12px] text-bad-text bg-bad-bg border border-transparent rounded-md px-3 py-2">{error}</p>}
                            <div className="flex gap-2 pt-1">
                                <button
                                    type="submit" disabled={sending}
                                    className="flex-[2] h-9 rounded-md text-[11px] font-semibold bg-brand hover:bg-brand-600 text-white flex items-center justify-center gap-1.5 transition-all disabled:opacity-60 shadow-sm"
                                >
                                    {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                                    Güncelle
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

function RolePill({ role }) {
    const cfg = {
        admin: { label: 'Yönetici', cls: 'bg-brand-50 text-brand border-brand-100' },
        support: { label: 'Destek', cls: 'bg-n100 text-n500 border-n200' },
        department_user: { label: 'Departman', cls: 'bg-warn-bg text-warn border-transparent' },
        recruiter: { label: 'Recruiter', cls: 'bg-brand-50 text-brand-600 border-brand-100' },
    }[role] || { label: role, cls: 'bg-n100 text-n500 border-n200' };
    return (
        <span className={`inline-flex text-[11px] font-semibold px-1.5 py-0.5 rounded border ${cfg.cls}`}>
            {cfg.label}
        </span>
    );
}
