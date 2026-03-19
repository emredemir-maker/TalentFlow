// src/pages/PositionsPage.jsx
// Command Table layout — light theme sidebar + table rows

import { useState, useMemo, useEffect } from 'react';
import Header from '../components/Header';
import { usePositions } from '../context/PositionsContext';
import { useAuth } from '../context/AuthContext';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
    Briefcase,
    Plus,
    Trash2,
    CheckCircle2,
    XCircle,
    Users,
    Clock,
    Search,
    Sparkles,
    Loader2,
    Zap,
    Cpu,
    ArrowUpRight,
    Building2,
    AlertCircle,
    Unlock,
    Edit2,
    ChevronDown,
    FileText,
    Send,
} from 'lucide-react';

import PotentialCandidatesTab from '../components/PotentialCandidatesTab';
import CandidateDrawer from '../components/CandidateDrawer';
import { useCandidates } from '../context/CandidatesContext';
import { extractPositionFromJD, analyzeCandidateMatch } from '../services/geminiService';
import { calculateMatchScore } from '../services/matchService';

const STATUS_CONFIG = {
    open:             { label: 'Aktif',          pill: 'bg-emerald-50 text-emerald-600 border-emerald-200',  dot: 'bg-emerald-500' },
    closed:           { label: 'Pasif',           pill: 'bg-slate-100 text-slate-400 border-slate-200',       dot: 'bg-slate-300' },
    pending_approval: { label: 'Onay Bekliyor',   pill: 'bg-amber-50 text-amber-600 border-amber-200',        dot: 'bg-amber-400' },
    rejected:         { label: 'Reddedildi',      pill: 'bg-red-50 text-red-500 border-red-200',              dot: 'bg-red-400' },
};

export default function PositionsPage() {
    const { positions, loading, addPosition, addPositionRequest, approvePosition, rejectPosition, deletePosition, togglePositionStatus, updatePosition } = usePositions();
    const { enrichedCandidates, updateCandidate } = useCandidates();
    const candidates = enrichedCandidates || [];
    const { isDepartmentUser, userDepartments, userProfile, user, role } = useAuth();

    const [searchTerm, setSearchTerm]           = useState('');
    const [statusFilter, setStatusFilter]       = useState('all');
    const [deptFilter, setDeptFilter]           = useState('all');
    const [expandedPosition, setExpandedPosition] = useState(null);
    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [activePosition, setActivePosition]   = useState(null);
    const [isModalOpen, setIsModalOpen]         = useState(false);
    const [editMode, setEditMode]               = useState(false);
    const [editingPosition, setEditingPosition] = useState(null);
    const [releasingPosId, setReleasingPosId]   = useState(null);
    const [releaseLoading, setReleaseLoading]   = useState(false);
    const [departments, setDepartments]         = useState([]);
    const [jdText, setJdText]                   = useState('');
    const [isExtracting, setIsExtracting]       = useState(false);

    const [formData, setFormData] = useState({
        title: '',
        department: isDepartmentUser ? (userDepartments?.[0] || '') : '',
        minExperience: '',
        requirements: '',
        description: '',
    });

    // Fetch departments
    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'artifacts/talent-flow/public/data/departments'), (snap) => {
            setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return unsub;
    }, []);

    const openEditModal = (pos) => {
        setEditingPosition(pos);
        setEditMode(true);
        setFormData({
            title: pos.title || '',
            department: pos.department || '',
            minExperience: pos.minExperience?.toString() || '0',
            requirements: pos.requirements?.join(', ') || '',
            description: pos.description || '',
        });
        setJdText(pos.description || '');
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditMode(false);
        setEditingPosition(null);
        setFormData({ title: '', department: isDepartmentUser ? (userDepartments?.[0] || '') : '', minExperience: '', requirements: '', description: '' });
        setJdText('');
    };

    const handleExtractFromJD = async () => {
        if (!jdText || jdText.length < 50) return;
        setIsExtracting(true);
        try {
            const result = await extractPositionFromJD(jdText);
            setFormData({
                title: result.title || formData.title,
                department: isDepartmentUser ? (userDepartments?.[0] || '') : (result.department || formData.department),
                minExperience: result.minExperience?.toString() || formData.minExperience,
                requirements: result.requirements?.join(', ') || formData.requirements,
                description: jdText,
            });
        } catch (error) {
            console.error('Extraction error:', error);
            alert('Ayrıştırma sırasında bir hata oluştu: ' + error.message);
        } finally {
            setIsExtracting(false);
        }
    };

    const handleAddPosition = async (e) => {
        e.preventDefault();
        if (!formData.title || !formData.department) return;

        const positionRequirements = formData.requirements.split(',').map(r => r.trim()).filter(r => r);

        if (editMode && editingPosition) {
            await updatePosition(editingPosition.id, {
                title: formData.title,
                department: formData.department,
                minExperience: parseInt(formData.minExperience) || 0,
                requirements: positionRequirements,
                description: formData.description || jdText || '',
            });
            alert('✅ Pozisyon başarıyla güncellendi.');
        } else {
            const matchedCandidates = candidates
                .map(c => ({ ...c, match: calculateMatchScore(c, { ...formData, requirements: positionRequirements }) }))
                .filter(c => c.match.score >= 50)
                .sort((a, b) => b.match.score - a.match.score)
                .slice(0, 10)
                .map(c => ({ id: c.id, name: c.name, score: c.match.score, reason: c.match.score >= 70 ? 'Yüksek Uyumluluk' : 'Potansiyel Eşleşme' }));

            const newPosition = {
                title: formData.title,
                department: formData.department,
                description: formData.description || jdText || '',
                minExperience: parseInt(formData.minExperience) || 0,
                requirements: positionRequirements,
                matchedCandidates,
            };

            if (isDepartmentUser) {
                await addPositionRequest(newPosition, { uid: user?.uid, email: userProfile?.email, displayName: userProfile?.displayName, department: userDepartments?.[0] || '' });
                alert('✅ Pozisyon talebiniz başarıyla gönderildi. Recruiter onayından sonra aktifleşecektir.');
            } else {
                await addPosition(newPosition);
            }
        }
        closeModal();
    };

    const handleApprovePosition = async (posId) => {
        if (!window.confirm('Bu pozisyon talebini onaylamak istediğinize emin misiniz?')) return;
        await approvePosition(posId);
    };

    const handleRejectPosition = async (posId) => {
        const reason = prompt('Red nedeni (opsiyonel):');
        if (reason === null) return;
        await rejectPosition(posId, reason);
    };

    const handleReleaseToDepartment = async (pos) => {
        if (!pos.department) return alert('Bu pozisyonun departman bilgisi yok.');
        setReleasingPosId(pos.id);
        setReleaseLoading(true);
        try {
            const matchingCandidates = candidates
                .map(c => {
                    const posScore = c.positionAnalyses?.[pos.title]?.score || 0;
                    const matchScore = calculateMatchScore(c, pos).score;
                    return { ...c, effectiveScore: Math.max(posScore, matchScore) };
                })
                .filter(c => c.effectiveScore >= 60)
                .sort((a, b) => b.effectiveScore - a.effectiveScore);

            if (matchingCandidates.length === 0) {
                alert('Bu pozisyona uygun aday bulunamadı. Önce adayları analiz edin.');
                return;
            }
            let released = 0;
            for (const c of matchingCandidates) {
                const currentDepts = c.visibleToDepartments || [];
                if (!currentDepts.includes(pos.department)) {
                    await updateCandidate(c.id, { visibleToDepartments: [...currentDepts, pos.department] });
                    released++;
                }
            }
            await updatePosition(pos.id, { releasedToDepartment: true });
            alert(`✅ ${released} aday "${pos.department}" departmanına açıldı.`);
        } catch (err) {
            console.error('Release error:', err);
            alert('Bir hata oluştu: ' + err.message);
        } finally {
            setReleasingPosId(null);
            setReleaseLoading(false);
        }
    };

    const isRecruiterOrAdmin = role === 'recruiter' || role === 'super_admin';
    const pendingCount = positions.filter(p => p.status === 'pending_approval').length;

    // All unique departments from positions
    const allDepts = useMemo(() => Array.from(new Set(positions.map(p => p.department).filter(Boolean))), [positions]);

    const visiblePositions = useMemo(() => {
        let filtered = positions;
        if (isDepartmentUser && userDepartments?.length > 0) {
            filtered = positions.filter(p => userDepartments.includes(p.department));
        }
        if (searchTerm) {
            filtered = filtered.filter(p =>
                p.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.department?.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        if (statusFilter !== 'all') filtered = filtered.filter(p => p.status === statusFilter);
        if (deptFilter !== 'all') filtered = filtered.filter(p => p.department === deptFilter);
        return filtered;
    }, [positions, isDepartmentUser, userDepartments, searchTerm, statusFilter, deptFilter]);

    const statusCounts = useMemo(() => ({
        all: positions.length,
        open: positions.filter(p => p.status === 'open').length,
        pending_approval: positions.filter(p => p.status === 'pending_approval').length,
        closed: positions.filter(p => p.status === 'closed').length,
    }), [positions]);

    return (
        <div className="min-h-screen flex flex-col bg-slate-50">
            <Header title="Pozisyon Bankası" />

            {/* Pending banner */}
            {isRecruiterOrAdmin && pendingCount > 0 && (
                <div className="mx-6 mt-4 px-5 py-3 rounded-2xl border border-amber-200 bg-amber-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        <p className="text-sm font-semibold text-amber-700">{pendingCount} pozisyon talebi onayınızı bekliyor.</p>
                    </div>
                    <button
                        onClick={() => setStatusFilter('pending_approval')}
                        className="px-3 py-1.5 rounded-xl bg-amber-100 border border-amber-200 text-amber-600 text-xs font-bold hover:bg-amber-200 transition-all"
                    >
                        Talepleri Gör
                    </button>
                </div>
            )}

            {/* Body: sidebar + main */}
            <div className="flex flex-1 min-h-0 mt-4 mx-6 mb-8 gap-5">

                {/* LEFT FILTER PANEL */}
                <aside className="w-[220px] shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col py-5 px-4">

                    {/* Status Filters */}
                    <p className="text-[9px] font-black text-slate-400 tracking-widest uppercase mb-2 px-1">DURUM</p>
                    <div className="flex flex-col gap-0.5 mb-4">
                        {[
                            { key: 'all', label: 'Tümü', count: statusCounts.all },
                            { key: 'open', label: 'Aktif', count: statusCounts.open, badge: 'text-emerald-600 bg-emerald-50' },
                            { key: 'pending_approval', label: 'Bekleyen', count: statusCounts.pending_approval, badge: 'text-amber-600 bg-amber-50' },
                            { key: 'closed', label: 'Kapalı', count: statusCounts.closed, badge: 'text-slate-400 bg-slate-100' },
                        ].map(({ key, label, count, badge }) => (
                            <button
                                key={key}
                                onClick={() => setStatusFilter(key)}
                                className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all border ${
                                    statusFilter === key
                                        ? 'bg-cyan-50 border-cyan-200 text-cyan-700'
                                        : 'border-transparent text-slate-500 hover:bg-slate-50'
                                }`}
                            >
                                <span className="flex items-center gap-2">
                                    {statusFilter === key && <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />}
                                    {label}
                                </span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${badge || (statusFilter === key ? 'bg-cyan-100 text-cyan-600' : 'bg-slate-100 text-slate-400')}`}>
                                    {count}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="border-t border-slate-100 my-2" />

                    {/* Department Filters */}
                    <p className="text-[9px] font-black text-slate-400 tracking-widest uppercase mb-2 px-1 mt-2">DEPARTMAN</p>
                    <div className="flex flex-col gap-0.5 overflow-y-auto flex-1 pb-2">
                        <button
                            onClick={() => setDeptFilter('all')}
                            className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all border ${
                                deptFilter === 'all' ? 'bg-cyan-50 border-cyan-200 text-cyan-700' : 'border-transparent text-slate-500 hover:bg-slate-50'
                            }`}
                        >
                            <span className="flex items-center gap-2">
                                {deptFilter === 'all' && <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />}
                                Tüm Departmanlar
                            </span>
                        </button>
                        {allDepts.map(dept => (
                            <button
                                key={dept}
                                onClick={() => setDeptFilter(dept)}
                                className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all border ${
                                    deptFilter === dept ? 'bg-cyan-50 border-cyan-200 text-cyan-700' : 'border-transparent text-slate-500 hover:bg-slate-50'
                                }`}
                            >
                                <span className="flex items-center gap-2">
                                    {deptFilter === dept && <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />}
                                    <span className="truncate">{dept}</span>
                                </span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-400">
                                    {positions.filter(p => p.department === dept).length}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* AI card */}
                    <div className="mt-auto pt-4 border-t border-slate-100">
                        <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-3 flex items-start gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-cyan-500 shrink-0 mt-0.5" />
                            <span className="text-[11px] text-slate-500 leading-snug">AI eşleştirme aktif</span>
                        </div>
                    </div>
                </aside>

                {/* MAIN CONTENT */}
                <div className="flex-1 min-w-0 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

                    {/* Top bar */}
                    <div className="px-7 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-3">
                            <h1 className="text-lg font-black text-slate-900 tracking-tight">
                                {isDepartmentUser ? `${userDepartments?.join(', ')} Pozisyonları` : 'Pozisyon Portföyü'}
                            </h1>
                            <span className="rounded-full bg-slate-100 text-slate-400 text-[11px] px-2 py-0.5 font-semibold">
                                {visiblePositions.length}
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Pozisyon veya departman ara..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-56 bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 transition-all"
                                />
                            </div>
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-xs shadow-sm shadow-cyan-200 transition-colors"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                {isDepartmentUser ? 'Pozisyon Talebi' : 'Yeni Pozisyon'}
                            </button>
                        </div>
                    </div>

                    {/* Table header */}
                    <div className="px-7 pt-4 pb-2 shrink-0">
                        <div className="grid grid-cols-[2fr_0.8fr_0.8fr_0.9fr_1.2fr_auto] gap-4 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 px-4">
                            <div>POZİSYON / DEPARTMAN</div>
                            <div>ADAYLAR</div>
                            <div>TECRÜBE</div>
                            <div>DURUM</div>
                            <div>AI UYUM SKORU</div>
                            <div>İŞLEMLER</div>
                        </div>
                    </div>

                    {/* Table rows */}
                    <div className="px-7 pb-6 space-y-2 overflow-y-auto flex-1">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-24 gap-3">
                                <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Yükleniyor...</p>
                            </div>
                        ) : visiblePositions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-24 gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                                    <Briefcase className="w-6 h-6 text-slate-300" />
                                </div>
                                <p className="text-sm font-semibold text-slate-400">
                                    {statusFilter === 'pending_approval' ? 'Bekleyen talep yok' : 'Pozisyon bulunamadı'}
                                </p>
                                <button
                                    onClick={() => setIsModalOpen(true)}
                                    className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-all"
                                >
                                    {isDepartmentUser ? 'İlk Talebi Oluştur' : 'İlk Pozisyonu Oluştur'}
                                </button>
                            </div>
                        ) : (
                            visiblePositions.map((pos) => {
                                const sc = STATUS_CONFIG[pos.status] || STATUS_CONFIG.closed;
                                const isPending = pos.status === 'pending_approval';
                                const isRejected = pos.status === 'rejected';
                                const candidateCount = candidates.filter(c =>
                                    c.position === pos.title ||
                                    c.matchedPositionTitle === pos.title ||
                                    c.bestTitle === pos.title
                                ).length;
                                const isExpanded = expandedPosition === pos.id;

                                return (
                                    <div key={pos.id} className="rounded-2xl border border-slate-200 hover:border-cyan-200 hover:shadow-sm transition-all bg-white">
                                        {/* Pending/Rejected notice */}
                                        {isPending && (
                                            <div className="mx-4 mt-4 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2 text-xs text-amber-600 font-semibold">
                                                <Clock className="w-3.5 h-3.5" />
                                                {pos.requestedBy?.displayName || 'Departman kullanıcısı'} tarafından talep edildi
                                            </div>
                                        )}
                                        {isRejected && pos.rejectionReason && (
                                            <div className="mx-4 mt-4 px-4 py-2 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2 text-xs text-red-500 font-semibold">
                                                <XCircle className="w-3.5 h-3.5" />
                                                Red: {pos.rejectionReason}
                                            </div>
                                        )}

                                        {/* Main row */}
                                        <div className="px-4 py-4 grid grid-cols-[2fr_0.8fr_0.8fr_0.9fr_1.2fr_auto] gap-4 items-center group">

                                            {/* Col 1: Position */}
                                            <div className="min-w-0">
                                                <div className="text-sm font-bold text-slate-800 truncate mb-1">{pos.title}</div>
                                                <div className="flex items-center gap-2">
                                                    <span className="rounded-full bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 font-medium whitespace-nowrap">
                                                        {pos.department}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Col 2: Candidates */}
                                            <div>
                                                <div className="text-lg font-black text-slate-900 leading-none">{candidateCount}</div>
                                                <div className="text-[10px] text-slate-400 mt-0.5">aday</div>
                                            </div>

                                            {/* Col 3: Experience */}
                                            <div>
                                                <div className="font-black text-slate-900 leading-none">{pos.minExperience || 0} yıl+</div>
                                                <div className="text-[10px] text-slate-400 mt-0.5">min.</div>
                                            </div>

                                            {/* Col 4: Status */}
                                            <div>
                                                <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${sc.pill}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                                                    {sc.label}
                                                </span>
                                            </div>

                                            {/* Col 5: AI Score */}
                                            <div className="pr-2">
                                                {pos.status === 'open' ? (
                                                    <>
                                                        <div className="font-black text-cyan-500 text-[16px] leading-none mb-1.5">
                                                            {pos.matchedCandidates?.length > 0
                                                                ? `${Math.round(pos.matchedCandidates.reduce((a, c) => a + c.score, 0) / pos.matchedCandidates.length)}%`
                                                                : '—'
                                                            }
                                                        </div>
                                                        <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                                            {pos.matchedCandidates?.length > 0 && (
                                                                <div
                                                                    className="h-full bg-gradient-to-r from-cyan-400 to-cyan-500 rounded-full"
                                                                    style={{ width: `${Math.round(pos.matchedCandidates.reduce((a, c) => a + c.score, 0) / pos.matchedCandidates.length)}%` }}
                                                                />
                                                            )}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <span className="text-slate-300 text-sm">—</span>
                                                )}
                                            </div>

                                            {/* Col 6: Actions */}
                                            <div className="flex items-center gap-1.5">
                                                {pos.status === 'open' && (
                                                    <>
                                                        <button
                                                            onClick={() => setExpandedPosition(isExpanded ? null : pos.id)}
                                                            className={`p-1.5 rounded-lg border transition-colors ${isExpanded ? 'bg-cyan-50 border-cyan-200 text-cyan-500' : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-cyan-50 hover:border-cyan-200 hover:text-cyan-500'}`}
                                                            title="Potansiyel Adaylar"
                                                        >
                                                            <ArrowUpRight className="w-4 h-4" />
                                                        </button>
                                                        {isRecruiterOrAdmin && (
                                                            <button
                                                                onClick={() => handleReleaseToDepartment(pos)}
                                                                disabled={releaseLoading && releasingPosId === pos.id}
                                                                className={`p-1.5 rounded-lg border transition-colors ${pos.releasedToDepartment ? 'bg-emerald-50 border-emerald-200 text-emerald-500' : 'bg-violet-50 border-violet-200 text-violet-500 hover:bg-violet-100'}`}
                                                                title={pos.releasedToDepartment ? 'Departmana açıldı' : 'Departmana Aç'}
                                                            >
                                                                {releaseLoading && releasingPosId === pos.id
                                                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                                                    : <Unlock className="w-4 h-4" />}
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => openEditModal(pos)}
                                                            className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-400 hover:bg-slate-100 transition-colors"
                                                            title="Düzenle"
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => togglePositionStatus(pos.id, pos.status)}
                                                            className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-400 hover:bg-red-50 hover:border-red-200 hover:text-red-400 transition-colors"
                                                            title="Pozisyonu Kapat"
                                                        >
                                                            <XCircle className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => deletePosition(pos.id)}
                                                            className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-400 hover:bg-red-50 hover:border-red-200 hover:text-red-400 transition-colors"
                                                            title="Sil"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}
                                                {isPending && isRecruiterOrAdmin && (
                                                    <>
                                                        <button onClick={() => handleApprovePosition(pos.id)} className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-500 hover:bg-emerald-100 transition-colors" title="Onayla">
                                                            <CheckCircle2 className="w-4 h-4" />
                                                        </button>
                                                        <button onClick={() => handleRejectPosition(pos.id)} className="p-1.5 rounded-lg bg-red-50 border border-red-200 text-red-400 hover:bg-red-100 transition-colors" title="Reddet">
                                                            <XCircle className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}
                                                {isRejected && isRecruiterOrAdmin && (
                                                    <button onClick={() => deletePosition(pos.id)} className="p-1.5 rounded-lg bg-red-50 border border-red-200 text-red-400 hover:bg-red-100 transition-colors" title="Talebi Sil">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Expanded: Potential candidates */}
                                        {isExpanded && pos.status === 'open' && (
                                            <div className="mx-4 mb-4 pt-4 border-t border-slate-100">
                                                <PotentialCandidatesTab
                                                    position={pos}
                                                    candidates={candidates}
                                                    onCandidateClick={(c) => {
                                                        setSelectedCandidate(c);
                                                        setActivePosition(pos);
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Bottom bar */}
                    <div className="px-7 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
                        <p className="text-xs text-slate-400 font-medium">{visiblePositions.length} pozisyon gösteriliyor</p>
                        <div className="flex items-center gap-1">
                            <Cpu className="w-3 h-3 text-cyan-400" />
                            <span className="text-[10px] text-slate-400">AI eşleştirme aktif</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Candidate Drawer */}
            {selectedCandidate && (
                <CandidateDrawer
                    candidate={selectedCandidate}
                    positionContext={activePosition}
                    onClose={() => { setSelectedCandidate(null); setActivePosition(null); }}
                />
            )}

            {/* Add / Edit Position Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={closeModal} />
                    <div className="relative w-full max-w-2xl bg-white rounded-3xl p-8 md:p-10 border border-slate-200 shadow-2xl">

                        <div className="flex justify-between items-start mb-8">
                            <div>
                                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                                    {editMode ? 'POZİSYONU DÜZENLE' : (isDepartmentUser ? 'POZİSYON TALEBİ' : 'POZİSYON OLUŞTUR')}
                                </h2>
                                <p className="text-xs text-slate-400 font-medium mt-1 uppercase tracking-widest">
                                    {editMode ? 'Stratejik Veri Güncelleme' : (isDepartmentUser ? 'Departman İhtiyaç Bildirimi' : 'Stratejik İşe Alım Planlaması')}
                                </p>
                            </div>
                            <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors">
                                <XCircle className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* JD Extraction */}
                            <div className="space-y-4">
                                <div className="p-5 rounded-2xl bg-cyan-50 border border-cyan-200">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Sparkles className="w-4 h-4 text-cyan-500" />
                                        <span className="text-xs font-black text-cyan-700 uppercase tracking-widest">AI ile Otomatik Doldur</span>
                                    </div>
                                    <textarea
                                        value={jdText}
                                        onChange={(e) => setJdText(e.target.value)}
                                        placeholder="İş ilanı metnini buraya yapıştırın..."
                                        className="w-full h-32 bg-white border border-cyan-200 rounded-xl p-3 text-sm text-slate-700 placeholder-slate-400 resize-none outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleExtractFromJD}
                                        disabled={isExtracting || jdText.length < 50}
                                        className="mt-3 w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                                    >
                                        {isExtracting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analiz ediliyor...</> : <><Sparkles className="w-3.5 h-3.5" /> Otomatik Doldur</>}
                                    </button>
                                </div>
                            </div>

                            {/* Manual Form */}
                            <form onSubmit={handleAddPosition} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Pozisyon Adı *</label>
                                    <input
                                        type="text"
                                        value={formData.title}
                                        onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))}
                                        required
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 transition-all"
                                        placeholder="ör. Senior React Developer"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Departman *</label>
                                    {isDepartmentUser ? (
                                        <input type="text" value={userDepartments?.[0] || ''} disabled className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-500 cursor-not-allowed" />
                                    ) : (
                                        <select
                                            value={formData.department}
                                            onChange={(e) => setFormData(p => ({ ...p, department: e.target.value }))}
                                            required
                                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 outline-none focus:border-cyan-400 transition-all"
                                        >
                                            <option value="">Departman seç...</option>
                                            {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                                        </select>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Min. Tecrübe (yıl)</label>
                                    <input
                                        type="number"
                                        value={formData.minExperience}
                                        onChange={(e) => setFormData(p => ({ ...p, minExperience: e.target.value }))}
                                        min="0"
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 transition-all"
                                        placeholder="0"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Gereksinimler (virgülle ayırın)</label>
                                    <input
                                        type="text"
                                        value={formData.requirements}
                                        onChange={(e) => setFormData(p => ({ ...p, requirements: e.target.value }))}
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 transition-all"
                                        placeholder="React, TypeScript, Node.js"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm shadow-cyan-200 transition-colors"
                                >
                                    <Send className="w-3.5 h-3.5" />
                                    {editMode ? 'Güncelle' : (isDepartmentUser ? 'Talep Gönder' : 'Pozisyon Oluştur')}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
