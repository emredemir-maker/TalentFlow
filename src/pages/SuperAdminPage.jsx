// src/pages/SuperAdminPage.jsx
import { useState, useEffect, useMemo } from 'react';
import {
    Users, UserPlus, Mail, Shield, CheckCircle, XCircle,
    Loader2, ShieldCheck, Copy, Trash2, UserX, UserCheck,
    Edit2, Settings, Key, Eye, EyeOff, X, Globe, Plus, AlertCircle
} from 'lucide-react';
import {
    collection, query, onSnapshot, addDoc, serverTimestamp,
    where, deleteDoc, getDocs, doc, updateDoc, setDoc, getDoc
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

const USERS_PATH = 'artifacts/talent-flow/public/data/users';
const INVITATIONS_PATH = 'artifacts/talent-flow/public/data/invitations';

export default function SuperAdminPage() {
    const { user, isSuperAdmin } = useAuth();
    const [invitations, setInvitations] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState(null);

    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('recruiter');
    const [inviteDepartments, setInviteDepartments] = useState([]);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [departments, setDepartments] = useState([]);

    const [geminiKey, setGeminiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);
    const [savedKeyLast4, setSavedKeyLast4] = useState(null);
    const [activeTab, setActiveTab] = useState('users');

    const [showEditModal, setShowEditModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);

    // Domain whitelist
    const [allowedDomains, setAllowedDomains] = useState([]);
    const [newDomain, setNewDomain] = useState('');
    const [savingDomains, setSavingDomains] = useState(false);
    const [domainSaved, setDomainSaved] = useState(false);

    // Branding (for invite emails)
    const [branding, setBrandingLocal] = useState({ companyName: 'Talent-Inn', primaryColor: '#13294E' });
    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'artifacts/talent-flow/public/data/departments'), (snap) => {
            setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return unsub;
    }, []);

    const departmentOptions = useMemo(() => {
        return departments.map(d => d.name).sort();
    }, [departments]);

    useEffect(() => {
        if (!isSuperAdmin) return;
        const unsubUsers = onSnapshot(collection(db, USERS_PATH), (snap) => {
            setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        const unsubInvites = onSnapshot(collection(db, INVITATIONS_PATH), (snap) => {
            setInvitations(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });
        // settings koleksiyonu artık listelenemez (api_keys/integrations sır
        // taşıdığından kurallar list'i kapatır) — dokümanlar tekil okunur.
        // Gemini anahtarının kendisi client'a hiç inmez; yalnızca durum bilgisi
        // super_admin korumalı /api/admin/api-keys ucundan alınır.
        const fetchSettings = async () => {
            try {
                const [systemDoc, brandingDoc] = await Promise.all([
                    getDoc(doc(db, 'artifacts/talent-flow/public/data/settings', 'system')),
                    getDoc(doc(db, 'artifacts/talent-flow/public/data/settings', 'branding')),
                ]);
                if (systemDoc.exists() && systemDoc.data().allowedDomains) setAllowedDomains(systemDoc.data().allowedDomains);
                if (brandingDoc.exists()) setBrandingLocal(b => ({ ...b, ...brandingDoc.data() }));
            } catch (err) { console.warn("Could not fetch settings:", err); }
            try {
                const token = await user.getIdToken();
                const res = await fetch('/api/admin/api-keys', { headers: { Authorization: `Bearer ${token}` } });
                if (res.ok) {
                    const data = await res.json();
                    if (data?.gemini?.set) setSavedKeyLast4(data.gemini.last4 || '????');
                }
            } catch (err) { console.warn("Could not fetch API key status:", err); }
        };
        fetchSettings();
        return () => { unsubUsers(); unsubInvites(); };
    }, [isSuperAdmin]);

    const handleCopyInviteLink = (email, id) => {
        navigator.clipboard.writeText(`${window.location.origin}?invite=${encodeURIComponent(email)}`);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleDeleteInvite = async (id) => {
        if (!window.confirm("Bu davetiyeyi silmek istediğinize emin misiniz?")) return;
        await deleteDoc(doc(db, INVITATIONS_PATH, id));
    };

    const handleDeleteUser = async (userToDelete) => {
        if (userToDelete.id === user.uid) return alert("Kendi hesabınızı silemezsiniz.");
        if (!window.confirm(`${userToDelete.displayName} kullanıcısını silmek istediğinize emin misiniz?`)) return;
        try {
            // 1. Firestore profilini sil
            await deleteDoc(doc(db, USERS_PATH, userToDelete.id));
            // 2. Bekleyen davetiyelerini sil
            const q = query(collection(db, INVITATIONS_PATH), where("email", "==", userToDelete.email.toLowerCase()));
            const inviteSnap = await getDocs(q);
            for (const d of inviteSnap.docs) await deleteDoc(doc(db, INVITATIONS_PATH, d.id));
            // 3. Firebase Auth hesabını sil (sunucu tarafı, prod'da çalışır)
            try {
                const token = await user.getIdToken();
                await fetch(`/api/admin/auth-user/${userToDelete.id}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` }
                });
            } catch (authDelErr) {
                console.warn('[handleDeleteUser] Auth hesabı silinemedi (geliştirme ortamında normal):', authDelErr.message);
            }
        } catch (err) { alert("Kullanıcı silinirken bir hata oluştu."); }
    };

    const handleToggleUserStatus = async (userId, currentStatus) => {
        if (userId === user.uid) return alert("Kendi durumunuzu değiştiremezsiniz.");
        const newStatus = currentStatus === 'disabled' ? 'active' : 'disabled';
        if (!window.confirm(`Kullanıcıyı ${newStatus === 'disabled' ? 'dondurmak' : 'aktifleştirmek'} istediğinize emin misiniz?`)) return;
        await updateDoc(doc(db, USERS_PATH, userId), { status: newStatus });
    };

    const handleAddDomain = () => {
        const d = newDomain.trim().toLowerCase().replace(/^@/, '').replace(/^https?:\/\//, '');
        if (!d || !d.includes('.')) return;
        if (allowedDomains.includes(d)) return;
        setAllowedDomains(prev => [...prev, d]);
        setNewDomain('');
    };

    const handleRemoveDomain = (d) => setAllowedDomains(prev => prev.filter(x => x !== d));

    const handleSaveDomains = async () => {
        setSavingDomains(true);
        try {
            await setDoc(doc(db, 'artifacts/talent-flow/public/data/settings', 'system'), { allowedDomains }, { merge: true });
            setDomainSaved(true);
            setTimeout(() => setDomainSaved(false), 3000);
        } catch (err) { alert('Kayıt hatası: ' + err.message); }
        finally { setSavingDomains(false); }
    };

    const handleSendInvite = async (e) => {
        e.preventDefault();
        if (!inviteEmail.trim()) return;
        setSending(true);
        setError(null);
        try {
            if (users.find(u => u.email === inviteEmail)) throw new Error("Bu e-posta adresi zaten kayıtlı.");
            if (invitations.find(i => i.email === inviteEmail && i.status === 'pending')) throw new Error("Bu e-posta bekleyen bir davete sahip.");
            await addDoc(collection(db, INVITATIONS_PATH), {
                email: inviteEmail.trim().toLowerCase(),
                role: inviteRole,
                departments: inviteRole === 'department_user' ? inviteDepartments : [],
                status: 'pending',
                invitedBy: user.uid,
                createdAt: serverTimestamp()
            });
            const inviteLink = `${window.location.origin}?invite=${encodeURIComponent(inviteEmail.trim().toLowerCase())}`;
            let emailSent = false;
            let emailError = '';
            try {
                const res = await fetch('/api/send-invite', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
                    body: JSON.stringify({
                        email: inviteEmail.trim().toLowerCase(),
                        role: inviteRole,
                        inviteLink,
                        branding,
                        invitedByName: user?.displayName || ''
                    })
                });
                if (res.ok) {
                    emailSent = true;
                } else {
                    const body = await res.json().catch(() => ({}));
                    emailError = body.error || `Sunucu hatası (${res.status})`;
                }
            } catch (fetchErr) {
                emailError = fetchErr.message;
            }
            try { await navigator.clipboard.writeText(inviteLink); } catch { prompt('Davet linki:', inviteLink); }
            if (emailSent) {
                alert(`✅ Davet oluşturuldu!\n📧 E-posta ${inviteEmail} adresine gönderildi.\n🔗 Davet linki panoya kopyalandı.`);
            } else {
                alert(`✅ Davet oluşturuldu ve link panoya kopyalandı.\n⚠️ E-posta gönderilemedi: ${emailError}\nLinki manuel olarak iletebilirsiniz.`);
            }
            setInviteEmail('');
            setShowInviteModal(false);
        } catch (err) { setError(err.message); }
        finally { setSending(false); }
    };

    const handleOpenEdit = (userToEdit) => {
        setEditingUser({
            id: userToEdit.id,
            displayName: userToEdit.displayName,
            email: userToEdit.email,
            role: userToEdit.role || 'recruiter',
            departments: userToEdit.departments || (userToEdit.department ? [userToEdit.department] : [])
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
            await updateDoc(doc(db, USERS_PATH, editingUser.id), {
                role: editingUser.role,
                departments: editingUser.role === 'department_user' ? editingUser.departments : [],
                updatedAt: serverTimestamp()
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
                <p className="text-xs text-n400 mt-1">Bu sayfa yalnızca Süper Admin yetkisiyle görüntülenebilir.</p>
            </div>
        );
    }

    const pendingInvites = invitations.filter(i => i.status === 'pending');
    const superAdmins = users.filter(u => u.role === 'super_admin').length;

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
                <button
                    onClick={() => setShowInviteModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-brand hover:bg-brand-600 text-white text-xs font-semibold transition-colors shadow-sm shadow-none"
                >
                    <UserPlus className="w-3.5 h-3.5" /> Kullanıcı Davet Et
                </button>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-2">
                {[
                    { label: 'Aktif Kullanıcı', value: users.length, color: 'text-ok', bg: 'bg-ok-bg', border: 'border-transparent', icon: ShieldCheck },
                    { label: 'Bekleyen Davet', value: pendingInvites.length, color: 'text-warn', bg: 'bg-warn-bg', border: 'border-transparent', icon: Mail },
                    { label: 'Süper Admin', value: superAdmins, color: 'text-brand', bg: 'bg-brand-50', border: 'border-brand-100', icon: Shield },
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
                    { id: 'domains', label: 'Domain Yönetimi' },
                    { id: 'settings', label: 'Sistem Ayarları' }
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

            {activeTab === 'domains' && (
                <div className="max-w-lg space-y-4">
                    <div className="bg-n0 rounded-[14px] border border-n200 p-3.5 space-y-4">
                        <div className="flex items-center gap-2 pb-4 border-b border-n200">
                            <div className="w-8 h-8 rounded-md bg-brand-50 border border-brand-100 flex items-center justify-center">
                                <Globe className="w-4 h-4 text-brand-600" />
                            </div>
                            <div>
                                <h2 className="text-[12px] font-semibold text-n900">Domain Beyaz Listesi</h2>
                                <p className="text-[10px] text-n400">Davet zorunluluğu olmadan giriş yapabilecek e-posta domainleri</p>
                            </div>
                        </div>

                        <div className="bg-warn-bg border border-warn rounded-md p-3 flex gap-2">
                            <AlertCircle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
                            <p className="text-[11px] text-warn leading-relaxed">
                                Bu listedeki domaine sahip e-posta adresleri <strong>davetiye olmadan</strong> platforma kayıt olabilir.
                                Örn: <span className="font-mono bg-warn-bg px-1 rounded">btcturk.com</span> eklendiğinde
                                tüm @btcturk.com adresleri doğrudan kayıt olabilir.
                            </p>
                        </div>

                        {/* Domain ekleme */}
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newDomain}
                                onChange={e => setNewDomain(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddDomain())}
                                placeholder="btcturk.com"
                                className="flex-1 bg-n50 border border-n200 rounded-md px-3 py-2 text-sm text-n700 font-mono outline-none focus:border-brand focus:ring-2 focus:ring-brand-100 transition-all"
                            />
                            <button
                                onClick={handleAddDomain}
                                disabled={!newDomain.trim()}
                                className="px-3 py-2 bg-brand hover:bg-brand-600 text-white rounded-md text-sm font-semibold transition-colors disabled:opacity-40 flex items-center gap-1"
                            >
                                <Plus className="w-4 h-4" /> Ekle
                            </button>
                        </div>

                        {/* Domain listesi */}
                        {allowedDomains.length === 0 ? (
                            <p className="text-center text-[11px] text-n400 italic py-3">Henüz beyaz listeye alınmış domain yok.</p>
                        ) : (
                            <div className="space-y-2">
                                {allowedDomains.map(d => (
                                    <div key={d} className="flex items-center justify-between px-3 py-2 bg-n50 rounded-md border border-n200">
                                        <div className="flex items-center gap-2">
                                            <Globe className="w-3.5 h-3.5 text-brand" />
                                            <span className="text-sm font-mono font-semibold text-n700">@{d}</span>
                                        </div>
                                        <button
                                            onClick={() => handleRemoveDomain(d)}
                                            className="p-1 rounded-md text-n400 hover:text-bad-text hover:bg-bad-bg transition-colors"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <button
                            onClick={handleSaveDomains}
                            disabled={savingDomains}
                            className="w-full py-2.5 bg-brand hover:bg-brand/90 text-white font-semibold text-sm rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                            {savingDomains ? <Loader2 className="w-4 h-4 animate-spin" /> : domainSaved ? <CheckCircle className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                            {savingDomains ? 'Kaydediliyor...' : domainSaved ? 'Kaydedildi!' : 'Değişiklikleri Kaydet'}
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'users' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
                                        {u.status === 'disabled' && (
                                            <span className="text-[11px] font-semibold text-bad-text bg-bad-bg border border-transparent px-1.5 py-0.5 rounded">Donduruldu</span>
                                        )}
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

                    {/* Invitations Table */}
                    <div className="bg-n0 rounded-[14px] border border-n200 overflow-hidden">
                        <div className="px-4 py-3 border-b border-n200 flex items-center gap-2">
                            <Mail className="w-4 h-4 text-warn" />
                            <h2 className="text-[11px] font-semibold text-n900">Bekleyen Davetler</h2>
                            <span className="ml-auto text-[11px] font-semibold bg-warn-bg text-warn-text border border-transparent px-2 py-0.5 rounded-full">{pendingInvites.length}</span>
                        </div>
                        <div className="divide-y divide-n100">
                            {pendingInvites.length === 0 ? (
                                <p className="py-8 text-center text-xs text-n400 italic">Bekleyen davet bulunmuyor.</p>
                            ) : pendingInvites.map(i => (
                                <div key={i.id} className="px-4 py-3 flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-md bg-warn-bg border border-transparent flex items-center justify-center shrink-0">
                                        <Mail className="w-3.5 h-3.5 text-warn" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[11px] font-medium text-n700 truncate">{i.email}</p>
                                        <RolePill role={i.role} small />
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={() => handleCopyInviteLink(i.email, i.id)}
                                            className={`p-1.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${
                                                copiedId === i.id
                                                    ? 'bg-ok-bg text-ok-text border border-transparent'
                                                    : 'bg-n100 text-n500 hover:bg-n100'
                                            }`}
                                        >
                                            {copiedId === i.id ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                        <button
                                            onClick={() => handleDeleteInvite(i.id)}
                                            className="p-1.5 rounded-md bg-n100 hover:bg-bad-bg hover:text-bad-text text-n400 transition-colors"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
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

            {/* Invite Modal */}
            {showInviteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-3 animate-in fade-in duration-200">
                    <div className="bg-n0 rounded-[14px] shadow-2xl border border-n200 w-full max-w-sm animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-n200">
                            <div className="flex items-center gap-2">
                                <UserPlus className="w-4 h-4 text-brand" />
                                <h3 className="text-[12px] font-semibold text-n900">Yeni Kullanıcı Davet Et</h3>
                            </div>
                            <button onClick={() => setShowInviteModal(false)} className="p-1 text-n400 hover:text-n600 rounded-md hover:bg-n50">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <form onSubmit={handleSendInvite} className="px-5 py-3 space-y-3">
                            <div>
                                <label className="text-[10px] font-semibold text-n400 uppercase tracking-[0.08em] block mb-1.5">E-posta Adresi</label>
                                <input
                                    type="email" required value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    placeholder="ornek@sirket.com"
                                    className="w-full bg-n50 border border-n200 rounded-md px-3 py-2 text-sm text-n700 outline-none focus:border-brand focus:ring-2 focus:ring-brand-100 transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-n400 uppercase tracking-[0.08em] block mb-1.5">Kullanıcı Rolü</label>
                                <select
                                    value={inviteRole}
                                    onChange={(e) => setInviteRole(e.target.value)}
                                    className="w-full bg-n50 border border-n200 rounded-md px-3 py-2 text-sm text-n700 outline-none focus:border-brand focus:ring-2 focus:ring-brand-100 transition-all"
                                >
                                    <option value="recruiter">Recruiter (İK Uzmanı)</option>
                                    <option value="department_user">Departman Kullanıcısı</option>
                                    <option value="super_admin">Süper Admin (Yönetici)</option>
                                </select>
                            </div>
                            {inviteRole === 'department_user' && (
                                <div>
                                    <label className="text-[10px] font-semibold text-n400 uppercase tracking-[0.08em] block mb-1.5">Departmanlar</label>
                                    <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto">
                                        {departmentOptions.map(dept => (
                                            <button
                                                key={dept} type="button"
                                                onClick={() => setInviteDepartments(prev =>
                                                    prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
                                                )}
                                                className={`px-2.5 py-2 rounded-md text-[11px] font-semibold text-left transition-all border ${
                                                    inviteDepartments.includes(dept)
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
                                <button type="button" onClick={() => setShowInviteModal(false)} className="flex-1 h-9 rounded-md text-[11px] font-semibold text-n500 border border-n200 hover:bg-n50 transition-all">İptal</button>
                                <button
                                    type="submit" disabled={sending || !inviteEmail}
                                    className="flex-[2] h-9 rounded-md text-[11px] font-semibold bg-brand hover:bg-brand-600 text-white flex items-center justify-center gap-1.5 transition-all disabled:opacity-60 shadow-sm"
                                >
                                    {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                                    Davet Gönder
                                </button>
                            </div>
                        </form>
                    </div>
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
                                    <option value="super_admin">Süper Admin</option>
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
                                    type="button"
                                    onClick={() => handleToggleUserStatus(editingUser.id, users.find(u => u.id === editingUser.id)?.status)}
                                    className={`flex-1 h-9 rounded-md text-[10px] font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                                        users.find(u => u.id === editingUser.id)?.status === 'disabled'
                                            ? 'bg-ok-bg border-transparent text-ok-text hover:bg-ok-bg'
                                            : 'bg-warn-bg border-warn text-warn-text hover:bg-warn-bg'
                                    }`}
                                >
                                    {users.find(u => u.id === editingUser.id)?.status === 'disabled' ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                                    {users.find(u => u.id === editingUser.id)?.status === 'disabled' ? 'Hesabı Aç' : 'Dondur'}
                                </button>
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

function RolePill({ role, small }) {
    const cfg = {
        super_admin: { label: 'Süper Admin', cls: 'bg-brand-50 text-brand border-brand-100' },
        department_user: { label: 'Departman', cls: 'bg-warn-bg text-warn border-transparent' },
        recruiter: { label: 'Recruiter', cls: 'bg-brand-50 text-brand-600 border-brand-100' },
    }[role] || { label: role, cls: 'bg-n100 text-n500 border-n200' };
    return (
        <span className={`inline-flex text-[11px] font-semibold px-1.5 py-0.5 rounded border ${cfg.cls}`}>
            {cfg.label}
        </span>
    );
}
