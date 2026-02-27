// src/pages/SuperAdminPage.jsx
import { useState, useEffect, useMemo } from 'react';
import {
    Users,
    UserPlus,
    Mail,
    Shield,
    Clock,
    CheckCircle,
    XCircle,
    Loader2,
    Search,
    RefreshCw,
    X,
    ShieldCheck,
    Copy,
    Trash2,
    UserX,
    UserCheck,
    Edit2
} from 'lucide-react';
import {
    collection,
    query,
    onSnapshot,
    addDoc,
    serverTimestamp,
    where,
    deleteDoc,
    getDocs,
    doc,
    updateDoc
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { usePositions } from '../context/PositionsContext';


const USERS_PATH = 'artifacts/talent-flow/public/data/users';
const INVITATIONS_PATH = 'artifacts/talent-flow/public/data/invitations';

export default function SuperAdminPage() {
    const { user, isSuperAdmin } = useAuth();
    const [invitations, setInvitations] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState(null);

    // Invite Form State
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('recruiter');
    const [inviteDepartments, setInviteDepartments] = useState([]);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [departments, setDepartments] = useState([]);

    // Edit User State
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null); // { id, role, departments[] }
    const { positions } = usePositions();

    // Fetch departments from dedicated collection
    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'artifacts/talent-flow/public/data/departments'), (snap) => {
            setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return unsub;
    }, []);

    // Extract unique department names
    const departmentOptions = useMemo(() => {
        const fromDepts = departments.map(d => d.name);
        const fromPositions = positions.filter(p => p.department).map(p => p.department);
        return [...new Set([...fromDepts, ...fromPositions])].sort();
    }, [departments, positions]);

    useEffect(() => {
        if (!isSuperAdmin) return;

        // Listen to Users
        const unsubUsers = onSnapshot(collection(db, USERS_PATH), (snap) => {
            setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        // Listen to Invitations
        const unsubInvites = onSnapshot(collection(db, INVITATIONS_PATH), (snap) => {
            setInvitations(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });

        return () => {
            unsubUsers();
            unsubInvites();
        };
    }, [isSuperAdmin]);

    const handleCopyInviteLink = (email, id) => {
        const baseUrl = window.location.origin;
        const link = `${baseUrl}?invite=${encodeURIComponent(email)}`;
        navigator.clipboard.writeText(link);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleDeleteInvite = async (id) => {
        if (!window.confirm("Bu davetiyeyi silmek istediğinize emin misiniz?")) return;
        try {
            await deleteDoc(doc(db, INVITATIONS_PATH, id));
        } catch (err) {
            console.error(err);
        }
    };

    const handleDeleteUser = async (userToDelete) => {
        if (userToDelete.id === user.uid) return alert("Kendi hesabınızı silemezsiniz.");
        if (!window.confirm(`${userToDelete.displayName} kullanıcısını tamamen silmek istediğinize emin misiniz? \n\nNot: Kullanıcı Firebase Auth üzerinde kalmaya devam edecektir, ancak tekrar davet edilirse erişim sağlayabilir.`)) return;

        try {
            // 1. Delete user profile
            await deleteDoc(doc(db, USERS_PATH, userToDelete.id));

            // 2. Clear invitations for this email so they can be re-invited
            const q = query(collection(db, INVITATIONS_PATH), where("email", "==", userToDelete.email.toLowerCase()));
            const inviteSnap = await getDocs(q);
            for (const d of inviteSnap.docs) {
                await deleteDoc(doc(db, INVITATIONS_PATH, d.id));
            }

            alert("Kullanıcı ve davet geçmişi temizlendi.");
        } catch (err) {
            console.error("User delete error:", err);
            alert("Kullanıcı silinirken bir hata oluştu.");
        }
    };

    const handleToggleUserStatus = async (userId, currentStatus) => {
        if (userId === user.uid) return alert("Kendi durumunuzu değiştiremezsiniz.");
        const newStatus = currentStatus === 'disabled' ? 'active' : 'disabled';
        const actionText = newStatus === 'disabled' ? 'dondurmak' : 'aktifleştimek';

        if (!window.confirm(`Bu kullanıcıyı ${actionText} istediğinize emin misiniz?`)) return;

        try {
            await updateDoc(doc(db, USERS_PATH, userId), {
                status: newStatus
            });
        } catch (err) {
            console.error("User status toggle error:", err);
            alert("Kullanıcı durumu güncellenirken bir hata oluştu.");
        }
    };

    const handleSendInvite = async (e) => {
        e.preventDefault();
        if (!inviteEmail.trim()) return;

        setSending(true);
        setError(null);
        try {
            const existingUser = users.find(u => u.email === inviteEmail);
            const existingInvite = invitations.find(i => i.email === inviteEmail && i.status === 'pending');

            if (existingUser) throw new Error("Bu e-posta adresi zaten kayıtlı.");
            if (existingInvite) throw new Error("Bu e-posta bekleyen bir davete sahip.");

            await addDoc(collection(db, INVITATIONS_PATH), {
                email: inviteEmail.trim().toLowerCase(),
                role: inviteRole,
                departments: inviteRole === 'department_user' ? inviteDepartments : [],
                status: 'pending',
                invitedBy: user.uid,
                createdAt: serverTimestamp()
            });

            const baseUrl = window.location.origin;
            const inviteLink = `${baseUrl}?invite=${encodeURIComponent(inviteEmail.trim().toLowerCase())}`;

            try {
                await navigator.clipboard.writeText(inviteLink);
                alert(`✅ Davet oluşturuldu!\n\nDavet linki panoya kopyalandı.`);
            } catch (clipErr) {
                prompt('Davet linki:', inviteLink);
            }

            setInviteEmail('');
            setShowInviteModal(false);
        } catch (err) {
            setError(err.message);
        } finally {
            setSending(false);
        }
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

    const handleUpdateUser = async (e) => {
        e.preventDefault();
        if (!editingUser) return;

        setSending(true);
        setError(null);
        try {
            const userRef = doc(db, USERS_PATH, editingUser.id);
            await updateDoc(userRef, {
                role: editingUser.role,
                departments: editingUser.role === 'department_user' ? editingUser.departments : [],
                updatedAt: serverTimestamp()
            });

            setShowEditModal(false);
            setEditingUser(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setSending(false);
        }
    };

    if (!isSuperAdmin) {
        return (
            <div className="p-8 flex flex-col items-center justify-center h-full text-center space-y-4 relative isolate min-h-screen">

                <Shield className="w-12 h-12 text-red-500 opacity-50" />
                <h1 className="text-xl font-bold text-text-primary">Erişim Reddedildi</h1>
                <p className="text-navy-400 max-w-sm">Bu sayfa sadece Süper Admin yetkisine sahip kullanıcılar tarafından görüntülenebilir.</p>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-8 animate-in fade-in duration-500 relative isolate min-h-screen">


            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-text-primary flex items-center gap-3">
                        <Users className="w-8 h-8 text-electric" /> Kullanıcı & Yetki Yönetimi
                    </h1>
                    <p className="text-navy-400 mt-1">Ekibinizi yönetin ve yeni kullanıcılar davet edin.</p>
                </div>
                <button
                    onClick={() => setShowInviteModal(true)}
                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-electric text-text-primary font-bold hover:bg-electric-light transition-all shadow-lg shadow-electric/20 active:scale-95"
                >
                    <UserPlus className="w-5 h-5" /> Yeni Kullanıcı Davet Et
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { label: 'Aktif Kullanıcılar', value: users.length, icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                    { label: 'Bekleyen Davetler', value: invitations.filter(i => i.status === 'pending').length, icon: Mail, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                    { label: 'Süper Adminler', value: users.filter(u => u.role === 'super_admin').length, icon: Shield, color: 'text-violet-400', bg: 'bg-violet-500/10' },
                ].map((stat, i) => (
                    <div key={i} className="glass p-6 rounded-3xl border border-white/5 flex items-center justify-between">
                        <div>
                            <p className="text-navy-400 text-xs font-bold uppercase tracking-widest mb-1">{stat.label}</p>
                            <h3 className="text-3xl font-black text-text-primary">{stat.value}</h3>
                        </div>
                        <div className={`w-12 h-12 rounded-2xl ${stat.bg} ${stat.color} flex items-center justify-center`}>
                            <stat.icon className="w-6 h-6" />
                        </div>
                    </div>
                ))}
            </div>

            {/* Tables Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Users Table */}
                <div className="glass rounded-[32px] border border-white/5 overflow-hidden">
                    <div className="p-6 border-b border-white/5 flex items-center justify-between">
                        <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-emerald-400" /> Aktif Kullanıcılar
                        </h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-white/[0.02] text-[10px] text-navy-500 uppercase font-black tracking-widest">
                                <tr>
                                    <th className="px-6 py-4">Kullanıcı</th>
                                    <th className="px-6 py-4">Rol</th>
                                    <th className="px-6 py-4">Durum</th>
                                    <th className="px-6 py-4">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04]">
                                {users.map(u => (
                                    <tr key={u.id} className="group hover:bg-white/[0.02] transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-text-primary">
                                                    {u.displayName?.substring(0, 2).toUpperCase() || 'U'}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-navy-100">{u.displayName}</p>
                                                    <p className="text-[11px] text-navy-500 font-mono">{u.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-[11px] font-bold text-navy-300">
                                            {u.role === 'super_admin' ? (
                                                <span className="px-2 py-1 rounded bg-violet-500/10 text-violet-400">Süper Admin</span>
                                            ) : u.role === 'department_user' ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {(u.departments || (u.department ? [u.department] : [])).map((dept, idx) => (
                                                        <span key={idx} className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400">
                                                            {dept}
                                                        </span>
                                                    ))}
                                                    {!(u.departments?.length > 0 || u.department) && (
                                                        <span className="px-2 py-0.5 rounded bg-navy-800 text-navy-500">Atanmamış</span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-400">Recruiter</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className={`flex items-center gap-1.5 text-[11px] font-bold ${u.status === 'disabled' ? 'text-red-400' : 'text-emerald-400'}`}>
                                                {u.status === 'disabled' ? (
                                                    <><XCircle className="w-3.5 h-3.5" /> Devre Dışı</>
                                                ) : (
                                                    <><CheckCircle className="w-3.5 h-3.5" /> Aktif</>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {u.id !== user.uid && (
                                                    <>
                                                        <button
                                                            onClick={() => handleOpenEdit(u)}
                                                            className="p-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all"
                                                            title="Düzenle"
                                                        >
                                                            <Edit2 className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteUser(u)}
                                                            className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                                                            title="Kullanıcıyı Sil"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Invitations Table */}
                <div className="glass rounded-[32px] border border-white/5 overflow-hidden">
                    <div className="p-6 border-b border-white/5 flex items-center justify-between">
                        <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                            <Mail className="w-5 h-5 text-amber-400" /> Bekleyen Davetler
                        </h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-white/[0.02] text-[10px] text-navy-500 uppercase font-black tracking-widest">
                                <tr>
                                    <th className="px-6 py-4">E-posta</th>
                                    <th className="px-6 py-4">Rol</th>
                                    <th className="px-6 py-4">Tarih</th>
                                    <th className="px-6 py-4">Durum</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04]">
                                {invitations.filter(i => i.status === 'pending').map(i => (
                                    <tr key={i.id} className="group hover:bg-white/[0.02] transition-colors">
                                        <td className="px-6 py-4 text-sm font-medium text-navy-100">{i.email}</td>
                                        <td className="px-6 py-4 text-[11px] font-bold text-navy-300 capitalize">{i.role}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleCopyInviteLink(i.email, i.id)}
                                                    className={`p-2 rounded-lg transition-all flex items-center gap-1.5 ${copiedId === i.id ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-navy-400 hover:text-text-primary hover:bg-white/10'}`}
                                                    title="Davet Linkini Kopyala"
                                                >
                                                    {copiedId === i.id ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                                    <span className="text-[10px] font-bold">{copiedId === i.id ? 'Kopyalandı' : 'Linki Kopyala'}</span>
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteInvite(i.id)}
                                                    className="p-2 rounded-lg bg-red-500/5 text-navy-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                                    title="İptal Et"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-400 text-[10px] font-black uppercase">Bekliyor</span>
                                        </td>
                                    </tr>
                                ))}
                                {invitations.filter(i => i.status === 'pending').length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="px-6 py-12 text-center text-navy-500 italic text-sm">
                                            Bekleyen davet bulunmuyor.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Invite Modal */}
            {showInviteModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-md" onClick={() => setShowInviteModal(false)} />
                    <div className="relative w-full max-w-md glass rounded-[40px] border border-white/10 p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-bold text-text-primary flex items-center gap-3">
                                <UserPlus className="w-6 h-6 text-electric" /> Ekibe Kat
                            </h3>
                            <button onClick={() => setShowInviteModal(false)} className="p-2 hover:bg-white/5 rounded-2xl text-navy-500">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSendInvite} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] text-navy-500 uppercase font-black tracking-widest ml-1">E-posta Adresi</label>
                                <input
                                    type="email"
                                    required
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    placeholder="ornek@sirket.com"
                                    className="w-full px-5 py-4 bg-navy-900 border border-white/10 rounded-2xl text-text-primary outline-none focus:border-electric transition-all"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] text-navy-500 uppercase font-black tracking-widest ml-1">Kullanıcı Rolü</label>
                                <select
                                    value={inviteRole}
                                    onChange={(e) => setInviteRole(e.target.value)}
                                    className="w-full px-5 py-4 bg-navy-900 border border-white/10 rounded-2xl text-text-primary outline-none focus:border-electric transition-all appearance-none"
                                >
                                    <option value="recruiter">Recruiter (İK Uzmanı)</option>
                                    <option value="department_user">Departman Kullanıcısı</option>
                                    <option value="super_admin">Süper Admin (Yönetici)</option>
                                </select>
                            </div>

                            {inviteRole === 'department_user' && (
                                <div className="space-y-3 pt-2">
                                    <label className="text-[10px] text-navy-500 uppercase font-black tracking-widest ml-1">Departmanlar (Birden Fazla Seçilebilir)</label>
                                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                        {departmentOptions.map(dept => (
                                            <button
                                                key={dept}
                                                type="button"
                                                onClick={() => {
                                                    if (inviteDepartments.includes(dept)) {
                                                        setInviteDepartments(inviteDepartments.filter(d => d !== dept));
                                                    } else {
                                                        setInviteDepartments([...inviteDepartments, dept]);
                                                    }
                                                }}
                                                className={`px-3 py-3 rounded-xl text-[10px] font-bold text-left transition-all border ${inviteDepartments.includes(dept)
                                                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 font-black ring-1 ring-amber-500/50'
                                                    : 'bg-navy-900 border-white/5 text-navy-400 hover:border-white/10'
                                                    }`}
                                            >
                                                {dept}
                                            </button>
                                        ))}
                                    </div>
                                    {inviteDepartments.length === 0 && (
                                        <p className="text-[9px] text-amber-500/60 italic">* En az bir departman seçmelisiniz.</p>
                                    )}
                                </div>
                            )}

                            {error && (
                                <div className="text-red-400 text-xs font-bold text-center p-3 rounded-xl bg-red-500/5 border border-red-500/10">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={sending || !inviteEmail}
                                className="w-full py-4 bg-electric text-text-primary font-bold rounded-2xl hover:bg-electric-light transition-all flex items-center justify-center gap-2 shadow-lg shadow-electric/20 active:scale-95 disabled:opacity-50"
                            >
                                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />} Davet Gönder
                            </button>
                        </form>
                    </div>
                </div>
            )}
            {/* Edit Modal */}
            {showEditModal && editingUser && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-md" onClick={() => setShowEditModal(false)} />
                    <div className="relative w-full max-w-md glass rounded-[40px] border border-white/10 p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-bold text-text-primary flex items-center gap-3">
                                <Edit2 className="w-6 h-6 text-electric" /> Kullanıcıyı Düzenle
                            </h3>
                            <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-white/5 rounded-2xl text-navy-500">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                            <p className="text-sm font-bold text-text-primary">{editingUser.displayName}</p>
                            <p className="text-xs text-navy-500">{editingUser.email}</p>
                        </div>

                        <form onSubmit={handleUpdateUser} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] text-navy-500 uppercase font-black tracking-widest ml-1">Kullanıcı Rolü</label>
                                <select
                                    value={editingUser.role}
                                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                                    className="w-full px-5 py-4 bg-navy-900 border border-white/10 rounded-2xl text-text-primary outline-none focus:border-electric transition-all appearance-none"
                                >
                                    <option value="recruiter">Recruiter (İK Uzmanı)</option>
                                    <option value="department_user">Departman Kullanıcısı</option>
                                    <option value="super_admin">Süper Admin (Yönetici)</option>
                                </select>
                            </div>

                            {editingUser.role === 'department_user' && (
                                <div className="space-y-3 pt-2">
                                    <label className="text-[10px] text-navy-500 uppercase font-black tracking-widest ml-1">Departmanlar</label>
                                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                        {departmentOptions.map(dept => (
                                            <button
                                                key={dept}
                                                type="button"
                                                onClick={() => {
                                                    const current = editingUser.departments || [];
                                                    if (current.includes(dept)) {
                                                        setEditingUser({ ...editingUser, departments: current.filter(d => d !== dept) });
                                                    } else {
                                                        setEditingUser({ ...editingUser, departments: [...current, dept] });
                                                    }
                                                }}
                                                className={`px-3 py-3 rounded-xl text-[10px] font-bold text-left transition-all border ${editingUser.departments?.includes(dept)
                                                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 font-black ring-1 ring-amber-500/50'
                                                    : 'bg-navy-900 border-white/5 text-navy-400 hover:border-white/10'
                                                    }`}
                                            >
                                                {dept}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {error && (
                                <div className="text-red-400 text-xs font-bold text-center p-3 rounded-xl bg-red-500/5 border border-red-500/10">
                                    {error}
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => handleToggleUserStatus(editingUser.id, users.find(u => u.id === editingUser.id)?.status)}
                                    className={`flex-1 py-4 rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-2 border ${users.find(u => u.id === editingUser.id)?.status === 'disabled'
                                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                                        : 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
                                        }`}
                                >
                                    {users.find(u => u.id === editingUser.id)?.status === 'disabled' ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                                    {users.find(u => u.id === editingUser.id)?.status === 'disabled' ? 'Hesabı Aç' : 'Hesabı Dondur'}
                                </button>
                                <button
                                    type="submit"
                                    disabled={sending}
                                    className="flex-[2] py-4 bg-electric text-text-primary font-bold rounded-2xl hover:bg-electric-light transition-all flex items-center justify-center gap-2 shadow-lg shadow-electric/20 active:scale-95 disabled:opacity-50"
                                >
                                    {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />} Güncelle
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

// ... (existing helper functions if any, but the file ends at 476)
