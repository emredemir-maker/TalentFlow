// src/pages/DepartmentManagementPage.jsx
// Department CRUD + User-Department assignment management

import { useState, useEffect, useMemo } from 'react';
import {
    Building2, Plus, Trash2, Edit3, Users, CheckCircle2,
    X, Loader2, Search, UserPlus, UserMinus, Save,
    AlertCircle, Briefcase, ChevronDown, ChevronUp, Shield
} from 'lucide-react';
import {
    collection, addDoc, updateDoc, deleteDoc, doc,
    onSnapshot, serverTimestamp, query
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { usePositions } from '../context/PositionsContext';

const DEPARTMENTS_PATH = 'artifacts/talent-flow/public/data/departments';
const USERS_PATH = 'artifacts/talent-flow/public/data/users';

export default function DepartmentManagementPage() {
    const { isSuperAdmin, user } = useAuth();
    const { positions } = usePositions();
    const [departments, setDepartments] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedDept, setExpandedDept] = useState(null);

    // Add/Edit form
    const [showForm, setShowForm] = useState(false);
    const [editingDept, setEditingDept] = useState(null);
    const [formData, setFormData] = useState({ name: '', description: '', color: '#3b82f6' });
    const [saving, setSaving] = useState(false);

    // Assign user modal
    const [assignModal, setAssignModal] = useState(null); // deptId
    const [searchUser, setSearchUser] = useState('');

    // Colors palette
    const COLORS = [
        '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
        '#10b981', '#06b6d4', '#ef4444', '#6366f1',
        '#14b8a6', '#f97316', '#84cc16', '#a855f7'
    ];

    // Listen to departments
    useEffect(() => {
        const unsub1 = onSnapshot(query(collection(db, DEPARTMENTS_PATH)), (snap) => {
            setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
        const unsub2 = onSnapshot(query(collection(db, USERS_PATH)), (snap) => {
            setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => { unsub1(); unsub2(); };
    }, []);

    // Derived data
    const deptStats = useMemo(() => {
        const stats = {};
        departments.forEach(d => {
            const deptUsers = allUsers.filter(u => u.department === d.name);
            const deptPositions = positions.filter(p => p.department === d.name);
            stats[d.id] = {
                users: deptUsers,
                userCount: deptUsers.length,
                positionCount: deptPositions.length,
                openPositions: deptPositions.filter(p => p.status === 'open').length
            };
        });
        return stats;
    }, [departments, allUsers, positions]);

    // Unassigned users (no department OR department_user without dept)
    const unassignedUsers = useMemo(() => {
        const deptNames = departments.map(d => d.name);
        return allUsers.filter(u =>
            u.role === 'department_user' && (!u.department || !deptNames.includes(u.department))
        );
    }, [allUsers, departments]);

    const handleSaveDepartment = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) return;
        setSaving(true);
        try {
            if (editingDept) {
                await updateDoc(doc(db, DEPARTMENTS_PATH, editingDept.id), {
                    name: formData.name.trim(),
                    description: formData.description.trim(),
                    color: formData.color,
                    updatedAt: serverTimestamp()
                });
                // Update users that had old department name
                if (editingDept.name !== formData.name.trim()) {
                    const usersToUpdate = allUsers.filter(u => u.department === editingDept.name);
                    for (const u of usersToUpdate) {
                        await updateDoc(doc(db, USERS_PATH, u.id), { department: formData.name.trim() });
                    }
                }
            } else {
                await addDoc(collection(db, DEPARTMENTS_PATH), {
                    name: formData.name.trim(),
                    description: formData.description.trim(),
                    color: formData.color,
                    createdBy: user?.uid,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            }
            resetForm();
        } catch (err) {
            console.error('Dept save error:', err);
            alert('Hata: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteDept = async (dept) => {
        const stats = deptStats[dept.id];
        if (stats?.userCount > 0) {
            if (!window.confirm(`"${dept.name}" departmanında ${stats.userCount} kullanıcı var. Silmek istediğinize emin misiniz? Kullanıcıların departman bilgisi kaldırılacaktır.`)) return;
            // Remove department from users
            for (const u of stats.users) {
                await updateDoc(doc(db, USERS_PATH, u.id), { department: null });
            }
        } else {
            if (!window.confirm(`"${dept.name}" departmanını silmek istediğinize emin misiniz?`)) return;
        }
        await deleteDoc(doc(db, DEPARTMENTS_PATH, dept.id));
    };

    const handleAssignUser = async (userId, deptName) => {
        await updateDoc(doc(db, USERS_PATH, userId), { department: deptName });
    };

    const handleRemoveUser = async (userId) => {
        if (!window.confirm('Bu kullanıcıyı departmandan çıkarmak istediğinize emin misiniz?')) return;
        await updateDoc(doc(db, USERS_PATH, userId), { department: null });
    };

    const resetForm = () => {
        setShowForm(false);
        setEditingDept(null);
        setFormData({ name: '', description: '', color: '#3b82f6' });
    };

    const startEdit = (dept) => {
        setEditingDept(dept);
        setFormData({ name: dept.name, description: dept.description || '', color: dept.color || '#3b82f6' });
        setShowForm(true);
    };

    // Users available for assignment in a dept
    const getAssignableUsers = (deptName) => {
        return allUsers.filter(u =>
            u.department !== deptName &&
            (u.displayName?.toLowerCase().includes(searchUser.toLowerCase()) ||
                u.email?.toLowerCase().includes(searchUser.toLowerCase()))
        );
    };

    if (!isSuperAdmin) {
        return (
            <div className="flex items-center justify-center py-24 text-center">
                <div className="space-y-3">
                    <Shield className="w-10 h-10 text-slate-300 mx-auto" />
                    <p className="text-slate-500 font-medium text-sm">Bu bölüme erişim yetkiniz bulunmuyor.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="pb-10">
            <div className="space-y-8">

                {/* Hero */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div>
                        <h2 className="text-3xl font-black text-text-primary tracking-tight flex items-center gap-3">
                            <Building2 className="w-8 h-8 text-amber-400" /> Departmanlar
                        </h2>
                        <p className="text-navy-400 text-sm font-medium mt-1">
                            Departman oluşturun, düzenleyin ve kullanıcıları departmanlara atayın.
                        </p>
                    </div>
                    <button
                        onClick={() => { resetForm(); setShowForm(true); }}
                        className="px-6 py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-text-primary font-black text-xs uppercase tracking-widest shadow-xl shadow-amber-500/20 hover:-translate-y-0.5 transition-all flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> Yeni Departman
                    </button>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: 'Toplam Departman', value: departments.length, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                        { label: 'Toplam Kullanıcı', value: allUsers.length, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                        { label: 'Dept. Kullanıcıları', value: allUsers.filter(u => u.role === 'department_user').length, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                        { label: 'Atanmamış', value: unassignedUsers.length, color: unassignedUsers.length > 0 ? 'text-red-400' : 'text-emerald-400', bg: unassignedUsers.length > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10' },
                    ].map((s, i) => (
                        <div key={i} className="glass p-5 rounded-2xl border border-white/5">
                            <p className="text-[10px] font-black text-navy-500 uppercase tracking-widest mb-1">{s.label}</p>
                            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                        </div>
                    ))}
                </div>

                {/* Unassigned Users Warning */}
                {unassignedUsers.length > 0 && (
                    <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/20 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-bold text-red-400">{unassignedUsers.length} departman kullanıcısı henüz atanmamış</p>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {unassignedUsers.map(u => (
                                    <span key={u.id} className="text-[11px] bg-red-500/10 text-red-400 px-2 py-1 rounded-lg font-medium">
                                        {u.displayName || u.email}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Departments List */}
                {loading ? (
                    <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-electric animate-spin" /></div>
                ) : departments.length === 0 ? (
                    <div className="text-center py-24 glass rounded-[3rem] border border-white/[0.06]">
                        <Building2 className="w-16 h-16 text-navy-700 mx-auto mb-4" />
                        <h3 className="text-xl font-black text-text-primary mb-2">Henüz Departman Yok</h3>
                        <p className="text-sm text-navy-500 mb-6">İlk departmanı oluşturarak başlayın.</p>
                        <button onClick={() => setShowForm(true)} className="px-6 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-xs uppercase tracking-widest hover:bg-amber-500/20 transition-all">
                            <Plus className="w-4 h-4 inline mr-2" />Departman Oluştur
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {departments.map(dept => {
                            const stats = deptStats[dept.id] || { users: [], userCount: 0, positionCount: 0, openPositions: 0 };
                            const isExpanded = expandedDept === dept.id;
                            const deptColor = dept.color || '#3b82f6';

                            return (
                                <div key={dept.id} className="glass rounded-[2rem] border border-white/[0.06] overflow-hidden transition-all hover:border-white/10">
                                    {/* Department Header */}
                                    <div
                                        className="p-6 flex items-center gap-4 cursor-pointer hover:bg-white/[0.02] transition-all"
                                        onClick={() => setExpandedDept(isExpanded ? null : dept.id)}
                                    >
                                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border border-white/10" style={{ backgroundColor: deptColor + '20' }}>
                                            <Building2 className="w-6 h-6" style={{ color: deptColor }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-lg font-black text-text-primary truncate">{dept.name}</h3>
                                            {dept.description && <p className="text-xs text-navy-500 truncate">{dept.description}</p>}
                                        </div>

                                        <div className="hidden md:flex items-center gap-6 text-center">
                                            <div>
                                                <p className="text-lg font-black text-text-primary">{stats.userCount}</p>
                                                <p className="text-[9px] font-black text-navy-600 uppercase tracking-widest">Kullanıcı</p>
                                            </div>
                                            <div>
                                                <p className="text-lg font-black text-text-primary">{stats.positionCount}</p>
                                                <p className="text-[9px] font-black text-navy-600 uppercase tracking-widest">Pozisyon</p>
                                            </div>
                                            <div>
                                                <p className="text-lg font-black text-emerald-400">{stats.openPositions}</p>
                                                <p className="text-[9px] font-black text-navy-600 uppercase tracking-widest">Açık</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button onClick={(e) => { e.stopPropagation(); startEdit(dept); }} className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-navy-400 hover:text-text-primary transition-all" title="Düzenle">
                                                <Edit3 className="w-4 h-4" />
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteDept(dept); }} className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-navy-400 hover:text-red-400 transition-all" title="Sil">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                            {isExpanded ? <ChevronUp className="w-5 h-5 text-navy-500" /> : <ChevronDown className="w-5 h-5 text-navy-500" />}
                                        </div>
                                    </div>

                                    {/* Expanded: Users List */}
                                    {isExpanded && (
                                        <div className="border-t border-white/[0.06] p-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-sm font-black text-text-primary flex items-center gap-2">
                                                    <Users className="w-4 h-4 text-navy-400" /> Departman Kullanıcıları ({stats.userCount})
                                                </h4>
                                                <button
                                                    onClick={() => { setAssignModal(dept.id); setSearchUser(''); }}
                                                    className="px-3 py-2 rounded-xl bg-electric/10 border border-electric/20 text-electric-light text-[10px] font-bold uppercase tracking-widest hover:bg-electric/20 transition-all flex items-center gap-1.5"
                                                >
                                                    <UserPlus className="w-3.5 h-3.5" /> Kullanıcı Ekle
                                                </button>
                                            </div>

                                            {stats.users.length === 0 ? (
                                                <div className="text-center py-8 text-navy-600 text-sm italic">Bu departmana henüz kullanıcı atanmamış.</div>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    {stats.users.map(u => (
                                                        <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] group hover:border-white/10 transition-all">
                                                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-text-primary shrink-0" style={{ background: `linear-gradient(135deg, ${deptColor}, ${deptColor}88)` }}>
                                                                {u.displayName?.substring(0, 2).toUpperCase() || 'U'}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-semibold text-text-primary truncate">{u.displayName}</p>
                                                                <p className="text-[10px] text-navy-500 truncate font-mono">{u.email}</p>
                                                            </div>
                                                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-navy-400">
                                                                {u.role === 'super_admin' ? 'Admin' : u.role === 'department_user' ? 'Dept' : 'Recruiter'}
                                                            </span>
                                                            <button
                                                                onClick={() => handleRemoveUser(u.id)}
                                                                className="p-1.5 rounded-lg bg-red-500/0 text-navy-600 hover:bg-red-500/10 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                                                                title="Departmandan Çıkar"
                                                            >
                                                                <UserMinus className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Positions in this dept */}
                                            {stats.positionCount > 0 && (
                                                <div className="pt-4 border-t border-white/[0.04]">
                                                    <h4 className="text-xs font-black text-navy-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                        <Briefcase className="w-3.5 h-3.5" /> Departman Pozisyonları
                                                    </h4>
                                                    <div className="flex flex-wrap gap-2">
                                                        {positions.filter(p => p.department === dept.name).map(p => (
                                                            <span key={p.id} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${p.status === 'open' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/5 text-navy-400 border-white/10'}`}>
                                                                {p.title} • {p.status === 'open' ? 'Aktif' : 'Kapalı'}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Add/Edit Department Modal */}
            {showForm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-md" onClick={resetForm} />
                    <div className="relative w-full max-w-md glass rounded-[2.5rem] border border-white/10 p-8 space-y-6 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-black text-text-primary flex items-center gap-3">
                                <Building2 className="w-6 h-6 text-amber-400" />
                                {editingDept ? 'Departman Düzenle' : 'Yeni Departman'}
                            </h3>
                            <button onClick={resetForm} className="p-2 hover:bg-white/5 rounded-xl text-navy-500"><X className="w-5 h-5" /></button>
                        </div>

                        <form onSubmit={handleSaveDepartment} className="space-y-5">
                            <div className="space-y-1.5">
                                <label className="text-[10px] text-navy-500 uppercase font-black tracking-widest ml-1">Departman Adı</label>
                                <input
                                    type="text" required value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Örn: Yazılım Geliştirme"
                                    className="w-full px-5 py-4 bg-navy-900 border border-white/10 rounded-2xl text-text-primary outline-none focus:border-amber-500 transition-all"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] text-navy-500 uppercase font-black tracking-widest ml-1">Açıklama (Opsiyonel)</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Departman hakkında kısa bilgi..."
                                    className="w-full px-5 py-4 bg-navy-900 border border-white/10 rounded-2xl text-text-primary outline-none focus:border-amber-500 transition-all resize-none h-20"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] text-navy-500 uppercase font-black tracking-widest ml-1">Renk</label>
                                <div className="flex flex-wrap gap-2">
                                    {COLORS.map(c => (
                                        <button key={c} type="button" onClick={() => setFormData({ ...formData, color: c })}
                                            className={`w-8 h-8 rounded-xl border-2 transition-all hover:scale-110 ${formData.color === c ? 'border-white scale-110 shadow-lg' : 'border-transparent'}`}
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                </div>
                            </div>
                            <button type="submit" disabled={saving || !formData.name.trim()}
                                className="w-full py-4 bg-amber-500 text-text-primary font-bold rounded-2xl hover:bg-amber-400 transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50">
                                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                {editingDept ? 'Güncelle' : 'Oluştur'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Assign User Modal */}
            {assignModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-md" onClick={() => setAssignModal(null)} />
                    <div className="relative w-full max-w-md glass rounded-[2.5rem] border border-white/10 p-8 space-y-5 shadow-2xl max-h-[80vh] flex flex-col">
                        <div className="flex items-center justify-between shrink-0">
                            <h3 className="text-lg font-black text-text-primary flex items-center gap-2">
                                <UserPlus className="w-5 h-5 text-electric" /> Kullanıcı Ata
                            </h3>
                            <button onClick={() => setAssignModal(null)} className="p-2 hover:bg-white/5 rounded-xl text-navy-500"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="relative shrink-0">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-500" />
                            <input
                                type="text" value={searchUser} onChange={(e) => setSearchUser(e.target.value)}
                                placeholder="İsim veya e-posta ara..."
                                className="w-full pl-11 pr-4 py-3 bg-navy-900 border border-white/10 rounded-2xl text-sm text-text-primary outline-none focus:border-electric transition-all"
                            />
                        </div>

                        <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                            {(() => {
                                const deptName = departments.find(d => d.id === assignModal)?.name;
                                const available = getAssignableUsers(deptName);
                                if (available.length === 0) return <p className="text-center text-navy-500 text-sm py-6">Atanabilecek kullanıcı bulunamadı.</p>;
                                return available.map(u => (
                                    <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-electric/20 transition-all group">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-text-primary shrink-0">
                                            {u.displayName?.substring(0, 2).toUpperCase() || 'U'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-text-primary truncate">{u.displayName}</p>
                                            <p className="text-[10px] text-navy-500 truncate">{u.email} • {u.role === 'department_user' ? 'Dept Kullanıcısı' : u.role === 'super_admin' ? 'Admin' : 'Recruiter'}</p>
                                        </div>
                                        <button
                                            onClick={() => { handleAssignUser(u.id, deptName); setAssignModal(null); }}
                                            className="px-3 py-1.5 rounded-lg bg-electric/10 text-electric-light text-[10px] font-bold hover:bg-electric/20 transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            Ata
                                        </button>
                                    </div>
                                ));
                            })()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
