// src/pages/DepartmentManagementPage.jsx
// Department CRUD + User-Department assignment management — light theme

import { useState, useEffect, useMemo } from 'react';
import {
    Building2, Plus, Trash2, Edit3, Users, X, Loader2,
    Search, UserPlus, UserMinus, Save, AlertCircle,
    Briefcase, ChevronDown, Shield, Check
} from 'lucide-react';
import {
    collection, addDoc, updateDoc, deleteDoc, doc,
    onSnapshot, serverTimestamp, query, getDocs, where, writeBatch
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { usePositions } from '../context/PositionsContext';

const DEPARTMENTS_PATH = 'artifacts/talent-flow/public/data/departments';
const USERS_PATH = 'artifacts/talent-flow/public/data/users';
const POSITIONS_PATH = 'artifacts/talent-flow/public/data/positions';

const COLORS = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
    '#10b981', '#06b6d4', '#ef4444', '#6366f1',
    '#14b8a6', '#f97316', '#84cc16', '#a855f7'
];

export default function DepartmentManagementPage() {
    const { isSuperAdmin, user } = useAuth();
    const { positions } = usePositions();
    const [departments, setDepartments] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedDept, setExpandedDept] = useState(null);

    const [showForm, setShowForm] = useState(false);
    const [editingDept, setEditingDept] = useState(null);
    const [formData, setFormData] = useState({ name: '', description: '', color: '#06b6d4' });
    const [saving, setSaving] = useState(false);

    const [assignModal, setAssignModal] = useState(null);
    const [searchUser, setSearchUser] = useState('');

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

    const deptStats = useMemo(() => {
        const stats = {};
        departments.forEach(d => {
            // Handle both legacy `department` (string) and current `departments` (array) fields
            const deptUsers = allUsers.filter(u =>
                u.department === d.name ||
                (Array.isArray(u.departments) && u.departments.includes(d.name))
            );
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

    const unassignedUsers = useMemo(() => {
        const deptNames = new Set(departments.map(d => d.name));
        return allUsers.filter(u => {
            if (u.role !== 'department_user') return false;
            // Check legacy string field
            const hasSingleDept = u.department && deptNames.has(u.department);
            // Check current array field
            const hasArrayDept = Array.isArray(u.departments) &&
                u.departments.some(d => deptNames.has(d));
            return !hasSingleDept && !hasArrayDept;
        });
    }, [allUsers, departments]);

    const handleSaveDepartment = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) return;
        setSaving(true);
        try {
            if (editingDept) {
                await updateDoc(doc(db, DEPARTMENTS_PATH, editingDept.id), {
                    name: formData.name.trim(), description: formData.description.trim(),
                    color: formData.color, updatedAt: serverTimestamp()
                });
                if (editingDept.name !== formData.name.trim()) {
                    const newName = formData.name.trim();
                    const oldName = editingDept.name;

                    // Cascade rename → users (both `department` string and `departments` array)
                    const usersToUpdate = allUsers.filter(u =>
                        u.department === oldName ||
                        (Array.isArray(u.departments) && u.departments.includes(oldName))
                    );
                    for (const u of usersToUpdate) {
                        const updates = {};
                        if (u.department === oldName) updates.department = newName;
                        if (Array.isArray(u.departments) && u.departments.includes(oldName)) {
                            updates.departments = u.departments.map(d => d === oldName ? newName : d);
                        }
                        await updateDoc(doc(db, USERS_PATH, u.id), updates);
                    }

                    // Cascade rename → positions
                    const posSnap = await getDocs(
                        query(collection(db, POSITIONS_PATH), where('department', '==', oldName))
                    );
                    if (!posSnap.empty) {
                        const batch = writeBatch(db);
                        posSnap.docs.forEach(posDoc => {
                            batch.update(posDoc.ref, { department: newName });
                        });
                        await batch.commit();
                    }
                }
            } else {
                await addDoc(collection(db, DEPARTMENTS_PATH), {
                    name: formData.name.trim(), description: formData.description.trim(),
                    color: formData.color, createdBy: user?.uid,
                    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
                });
            }
            resetForm();
        } catch (err) {
            console.error('Dept save error:', err);
            alert('Hata: ' + err.message);
        } finally { setSaving(false); }
    };

    const handleDeleteDept = async (dept) => {
        const stats = deptStats[dept.id];
        const posCount = stats?.positionCount ?? 0;
        const userCount = stats?.userCount ?? 0;

        const parts = [];
        if (userCount > 0) parts.push(`${userCount} kullanıcı`);
        if (posCount > 0) parts.push(`${posCount} pozisyon`);
        const detail = parts.length > 0 ? ` (${parts.join(', ')} etkilenecek)` : '';

        if (!window.confirm(`"${dept.name}" departmanını silmek istediğinize emin misiniz?${detail}`)) return;

        try {
            // Clear department from users (both field formats)
            if (userCount > 0) {
                for (const u of stats.users) {
                    const updates = {};
                    if (u.department === dept.name) updates.department = null;
                    if (Array.isArray(u.departments) && u.departments.includes(dept.name)) {
                        updates.departments = u.departments.filter(d => d !== dept.name);
                    }
                    await updateDoc(doc(db, USERS_PATH, u.id), updates);
                }
            }

            // Clear department from positions using a batch
            const posSnap = await getDocs(
                query(collection(db, POSITIONS_PATH), where('department', '==', dept.name))
            );
            if (!posSnap.empty) {
                const batch = writeBatch(db);
                posSnap.docs.forEach(posDoc => {
                    batch.update(posDoc.ref, { department: null });
                });
                await batch.commit();
            }

            await deleteDoc(doc(db, DEPARTMENTS_PATH, dept.id));
        } catch (err) {
            console.error('Dept delete error:', err);
            alert('Departman silinirken hata oluştu: ' + err.message);
        }
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
        setFormData({ name: '', description: '', color: '#06b6d4' });
    };

    const startEdit = (dept) => {
        setEditingDept(dept);
        setFormData({ name: dept.name, description: dept.description || '', color: dept.color || '#06b6d4' });
        setShowForm(true);
    };

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
        <div className="pb-10 space-y-6">

            {/* Sub-header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-cyan-50 border border-cyan-100 flex items-center justify-center">
                        <Building2 className="w-4.5 h-4.5 text-cyan-600" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-slate-800">Departmanlar</h2>
                        <p className="text-xs text-slate-400">Departman yönetimi ve kullanıcı atamaları</p>
                    </div>
                </div>
                <button
                    onClick={() => { resetForm(); setShowForm(true); }}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-cyan-500 rounded-lg hover:bg-cyan-600 transition-all"
                >
                    <Plus className="w-4 h-4" /> Yeni Departman
                </button>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: 'Toplam Departman', value: departments.length, color: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-100' },
                    { label: 'Toplam Kullanıcı', value: allUsers.length, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
                    { label: 'Dept. Kullanıcıları', value: allUsers.filter(u => u.role === 'department_user').length, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
                    {
                        label: 'Atanmamış', value: unassignedUsers.length,
                        color: unassignedUsers.length > 0 ? 'text-red-600' : 'text-emerald-600',
                        bg: unassignedUsers.length > 0 ? 'bg-red-50' : 'bg-emerald-50',
                        border: unassignedUsers.length > 0 ? 'border-red-100' : 'border-emerald-100'
                    },
                ].map((s, i) => (
                    <div key={i} className={`${s.bg} border ${s.border} rounded-xl p-4`}>
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{s.label}</p>
                        <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Unassigned Warning */}
            {unassignedUsers.length > 0 && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-100">
                    <AlertCircle className="w-4.5 h-4.5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold text-red-700">{unassignedUsers.length} departman kullanıcısı henüz atanmamış</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            {unassignedUsers.map(u => (
                                <span key={u.id} className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-lg font-medium">
                                    {u.displayName || u.email}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Departments List */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-7 h-7 text-cyan-500 animate-spin" />
                </div>
            ) : departments.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200 space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 mx-auto flex items-center justify-center">
                        <Building2 className="w-7 h-7 text-slate-300" />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-slate-700">Henüz Departman Yok</h3>
                        <p className="text-sm text-slate-400 mt-1">İlk departmanı oluşturarak başlayın.</p>
                    </div>
                    <button
                        onClick={() => setShowForm(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-cyan-500 rounded-lg hover:bg-cyan-600 transition-all"
                    >
                        <Plus className="w-4 h-4" /> Departman Oluştur
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {departments.map(dept => {
                        const stats = deptStats[dept.id] || { users: [], userCount: 0, positionCount: 0, openPositions: 0 };
                        const isExpanded = expandedDept === dept.id;
                        const deptColor = dept.color || '#06b6d4';

                        return (
                            <div key={dept.id} className={`bg-white rounded-2xl border overflow-hidden transition-all duration-300 ${isExpanded ? 'border-cyan-200 shadow-sm shadow-cyan-50' : 'border-slate-200 hover:border-slate-300'}`}>
                                {/* Dept Header Row */}
                                <div
                                    className="px-5 py-4 flex items-center gap-4 cursor-pointer"
                                    onClick={() => setExpandedDept(isExpanded ? null : dept.id)}
                                >
                                    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${deptColor}18`, border: `1px solid ${deptColor}30` }}>
                                        <Building2 className="w-5 h-5" style={{ color: deptColor }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-slate-800 text-sm truncate">{dept.name}</h3>
                                        {dept.description && <p className="text-xs text-slate-400 truncate mt-0.5">{dept.description}</p>}
                                    </div>

                                    {/* Stat Pills */}
                                    <div className="hidden sm:flex items-center gap-3">
                                        <div className="text-center px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100">
                                            <p className="text-sm font-bold text-slate-700">{stats.userCount}</p>
                                            <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Kullanıcı</p>
                                        </div>
                                        <div className="text-center px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100">
                                            <p className="text-sm font-bold text-slate-700">{stats.positionCount}</p>
                                            <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Pozisyon</p>
                                        </div>
                                        <div className="text-center px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100">
                                            <p className="text-sm font-bold text-emerald-600">{stats.openPositions}</p>
                                            <p className="text-[9px] font-semibold text-emerald-400 uppercase tracking-wide">Açık</p>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); startEdit(dept); }}
                                            className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-all"
                                        >
                                            <Edit3 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteDept(dept); }}
                                            className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-200 transition-all"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                        <div className={`w-8 h-8 flex items-center justify-center transition-all ${isExpanded ? 'text-cyan-500' : 'text-slate-300'}`}>
                                            <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Content */}
                                {isExpanded && (
                                    <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4 space-y-4">
                                        {/* Users Section */}
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Users className="w-3.5 h-3.5 text-slate-400" />
                                                <span className="text-xs font-semibold text-slate-600">Departman Kullanıcıları ({stats.userCount})</span>
                                            </div>
                                            <button
                                                onClick={() => { setAssignModal(dept.id); setSearchUser(''); }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-cyan-600 bg-cyan-50 border border-cyan-100 hover:bg-cyan-100 transition-all"
                                            >
                                                <UserPlus className="w-3.5 h-3.5" /> Kullanıcı Ekle
                                            </button>
                                        </div>

                                        {stats.users.length === 0 ? (
                                            <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl">
                                                <p className="text-xs text-slate-400 italic">Bu departmana henüz kullanıcı atanmamış.</p>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {stats.users.map(u => (
                                                    <div key={u.id} className="group flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 hover:border-slate-200 transition-all">
                                                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ background: `linear-gradient(135deg, ${deptColor}, ${deptColor}aa)` }}>
                                                            {u.displayName?.substring(0, 2).toUpperCase() || 'U'}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-semibold text-slate-700 truncate">{u.displayName}</p>
                                                            <p className="text-[10px] text-slate-400 truncate">{u.email}</p>
                                                        </div>
                                                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                                            {u.role === 'super_admin' ? 'Admin' : u.role === 'department_user' ? 'Dept' : 'Recruiter'}
                                                        </span>
                                                        <button
                                                            onClick={() => handleRemoveUser(u.id)}
                                                            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                                                        >
                                                            <UserMinus className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Positions */}
                                        {stats.positionCount > 0 && (
                                            <div className="pt-3 border-t border-slate-100">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                                                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Departman Pozisyonları</span>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {positions.filter(p => p.department === dept.name).map(p => (
                                                        <span key={p.id} className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${p.status === 'open' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                                                            {p.title} · {p.status === 'open' ? 'Aktif' : 'Kapalı'}
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

            {/* Add/Edit Department Modal */}
            {showForm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={resetForm} />
                    <div className="relative w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-cyan-50 border border-cyan-100 flex items-center justify-center">
                                    <Building2 className="w-4.5 h-4.5 text-cyan-600" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-800">
                                        {editingDept ? 'Departman Düzenle' : 'Yeni Departman'}
                                    </h3>
                                    <p className="text-xs text-slate-400">Departman Yönetimi</p>
                                </div>
                            </div>
                            <button onClick={resetForm} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-all">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveDepartment} className="p-6 space-y-5">
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Departman Adı</label>
                                <input
                                    type="text" required value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Örn: Yazılım Geliştirme"
                                    className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl bg-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-50 transition-all"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Açıklama <span className="text-slate-400 font-normal normal-case">(opsiyonel)</span></label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Departman hakkında kısa bilgi..."
                                    className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl bg-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-50 transition-all resize-none h-20"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Renk</label>
                                <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                                    {COLORS.map(c => (
                                        <button
                                            key={c} type="button"
                                            onClick={() => setFormData({ ...formData, color: c })}
                                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${formData.color === c ? 'border-slate-600 scale-110 shadow-sm' : 'border-white shadow-sm opacity-70 hover:opacity-100 hover:scale-105'}`}
                                            style={{ backgroundColor: c }}
                                        >
                                            {formData.color === c && <Check className="w-3.5 h-3.5 text-white" />}
                                        </button>
                                    ))}
                                </div>
                                {/* Preview */}
                                <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${formData.color}18`, border: `1px solid ${formData.color}30` }}>
                                        <Building2 className="w-4.5 h-4.5" style={{ color: formData.color }} />
                                    </div>
                                    <span className="text-sm font-semibold text-slate-700">{formData.name || 'Önizleme...'}</span>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-1">
                                <button type="button" onClick={resetForm}
                                    className="flex-1 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all"
                                >
                                    İptal
                                </button>
                                <button type="submit" disabled={saving || !formData.name.trim()}
                                    className="flex-1 py-2.5 text-sm font-semibold text-white bg-cyan-500 rounded-xl hover:bg-cyan-600 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {saving ? 'Kaydediliyor...' : editingDept ? 'Güncelle' : 'Oluştur'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Assign User Modal */}
            {assignModal && (() => {
                const dept = departments.find(d => d.id === assignModal);
                if (!dept) return null;
                const deptName = dept.name;
                const assignable = getAssignableUsers(deptName);

                return (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setAssignModal(null)} />
                        <div className="relative w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl">
                            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-cyan-50 border border-cyan-100 flex items-center justify-center">
                                        <UserPlus className="w-4.5 h-4.5 text-cyan-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-800">Kullanıcı Ata</h3>
                                        <p className="text-xs text-slate-400">{deptName}</p>
                                    </div>
                                </div>
                                <button onClick={() => setAssignModal(null)} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-all">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                    <input
                                        type="text" value={searchUser}
                                        onChange={(e) => setSearchUser(e.target.value)}
                                        placeholder="İsim veya e-posta ara..."
                                        className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-50 transition-all"
                                    />
                                </div>

                                <div className="space-y-2 max-h-72 overflow-y-auto">
                                    {assignable.length === 0 ? (
                                        <div className="text-center py-10 text-slate-400 text-sm italic">
                                            {searchUser ? 'Eşleşen kullanıcı bulunamadı.' : 'Atanabilecek kullanıcı yok.'}
                                        </div>
                                    ) : (
                                        assignable.map(u => (
                                            <div key={u.id} className="group flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-cyan-200 hover:bg-cyan-50/30 transition-all cursor-pointer"
                                                onClick={() => { handleAssignUser(u.id, deptName); setAssignModal(null); }}
                                            >
                                                <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
                                                    {u.displayName?.substring(0, 2).toUpperCase() || 'U'}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-slate-700 truncate">{u.displayName}</p>
                                                    <p className="text-[10px] text-slate-400 truncate">{u.email} · {u.role === 'super_admin' ? 'Admin' : u.role === 'department_user' ? 'Dept Kullanıcısı' : 'Recruiter'}</p>
                                                </div>
                                                <span className="text-xs font-semibold text-cyan-600 opacity-0 group-hover:opacity-100 transition-all">Ata →</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
