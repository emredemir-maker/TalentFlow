// src/pages/PositionsPage.jsx
// CRUD Interface for Job Positions with Department Request Workflow

import { useState, useMemo, useEffect } from 'react';
import Header from '../components/Header';
import { usePositions } from '../context/PositionsContext';
import { useAuth } from '../context/AuthContext';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
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
    Target,
    Zap,
    Cpu,
    Filter,
    ArrowUpRight,
    Calendar,
    ChevronDown,
    Building2,
    FileText,
    AlertCircle,
    Send,
    Eye,
    Unlock,
    Edit2
} from 'lucide-react';

import PotentialCandidatesTab from '../components/PotentialCandidatesTab';
import CandidateDrawer from '../components/CandidateDrawer';
import { useCandidates } from '../context/CandidatesContext';
import { extractPositionFromJD, analyzeCandidateMatch } from '../services/geminiService';
import { calculateMatchScore } from '../services/matchService';

const STATUS_LABELS = {
    open: { label: 'Aktif', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    closed: { label: 'Pasif', color: 'bg-navy-900 text-navy-500 border-white/5' },
    pending_approval: { label: 'Onay Bekliyor', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    rejected: { label: 'Reddedildi', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

export default function PositionsPage() {
    const { positions, loading, addPosition, addPositionRequest, approvePosition, rejectPosition, deletePosition, togglePositionStatus, updatePosition } = usePositions();
    const { enrichedCandidates, updateCandidate } = useCandidates();
    const candidates = enrichedCandidates || [];
    const { isDepartmentUser, userDepartments, userProfile, user, role } = useAuth();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedPosition, setExpandedPosition] = useState(null);
    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [activePosition, setActivePosition] = useState(null);
    const [statusFilter, setStatusFilter] = useState('all');
    const [editMode, setEditMode] = useState(false);
    const [editingPosition, setEditingPosition] = useState(null);

    // Release to department state
    const [releasingPosId, setReleasingPosId] = useState(null);
    const [releaseLoading, setReleaseLoading] = useState(false);
    const [departments, setDepartments] = useState([]);

    // Fetch departments
    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'artifacts/talent-flow/public/data/departments'), (snap) => {
            setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return unsub;
    }, []);

    const [formData, setFormData] = useState({
        title: '',
        department: isDepartmentUser ? (userDepartments?.[0] || '') : '',
        minExperience: '',
        requirements: '',
        description: '',
    });

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
    const [jdText, setJdText] = useState('');
    const [isExtracting, setIsExtracting] = useState(false);

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
            // Automatic matching against existing candidates
            const matchedCandidates = candidates
                .map(c => ({ ...c, match: calculateMatchScore(c, { ...formData, requirements: positionRequirements }) }))
                .filter(c => c.match.score >= 50)
                .sort((a, b) => b.match.score - a.match.score)
                .slice(0, 10)
                .map(c => ({
                    id: c.id,
                    name: c.name,
                    score: c.match.score,
                    reason: c.match.score >= 70 ? 'Yüksek Uyumluluk' : 'Potansiyel Eşleşme'
                }));

            const newPosition = {
                title: formData.title,
                department: formData.department,
                description: formData.description || jdText || '',
                minExperience: parseInt(formData.minExperience) || 0,
                requirements: positionRequirements,
                matchedCandidates: matchedCandidates
            };

            if (isDepartmentUser) {
                await addPositionRequest(newPosition, {
                    uid: user?.uid,
                    email: userProfile?.email,
                    displayName: userProfile?.displayName,
                    department: userDepartments?.[0] || ''
                });
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
        if (reason === null) return; // cancelled
        await rejectPosition(posId, reason);
    };

    // "Departmana Aç" - Release matching candidates to the department
    const handleReleaseToDepartment = async (pos) => {
        if (!pos.department) return alert('Bu pozisyonun departman bilgisi yok.');

        setReleasingPosId(pos.id);
        setReleaseLoading(true);

        try {
            // Find candidates that match this position well (score >= 60)
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

            // Add department to each matching candidate's visibleToDepartments
            let released = 0;
            for (const c of matchingCandidates) {
                const currentDepts = c.visibleToDepartments || [];
                if (!currentDepts.includes(pos.department)) {
                    await updateCandidate(c.id, {
                        visibleToDepartments: [...currentDepts, pos.department]
                    });
                    released++;
                }
            }

            // Mark the position as released
            await updatePosition(pos.id, { releasedToDepartment: true });

            alert(`✅ ${released} aday "${pos.department}" departmanına açıldı. Departman kullanıcıları artık bu adayları görebilir.`);
        } catch (err) {
            console.error('Release error:', err);
            alert('Bir hata oluştu: ' + err.message);
        } finally {
            setReleasingPosId(null);
            setReleaseLoading(false);
        }
    };

    // Filter positions based on role
    const visiblePositions = useMemo(() => {
        let filtered = positions;

        // Department users only see their own department's positions
        if (isDepartmentUser && userDepartments?.length > 0) {
            filtered = positions.filter(p => userDepartments.includes(p.department));
        }

        // Apply search
        if (searchTerm) {
            filtered = filtered.filter(p =>
                p.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.department?.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        // Apply status filter
        if (statusFilter !== 'all') {
            filtered = filtered.filter(p => p.status === statusFilter);
        }

        return filtered;
    }, [positions, isDepartmentUser, userDepartments, searchTerm, statusFilter]);

    // Count pending requests for badge
    const pendingCount = positions.filter(p => p.status === 'pending_approval').length;

    const isRecruiterOrAdmin = role === 'recruiter' || role === 'super_admin';

    return (
        <div className="min-h-screen pb-20">
            <Header title="Pozisyon Bankası" />

            <div className="max-w-7xl mx-auto px-6 lg:px-8 py-10 space-y-10">

                {/* Pending Requests Banner (for recruiters) */}
                {isRecruiterOrAdmin && pendingCount > 0 && (
                    <div className="glass rounded-[2rem] p-5 border border-amber-500/20 bg-amber-500/5 flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-300">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                <AlertCircle className="w-5 h-5 text-amber-400" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-amber-400">{pendingCount} Pozisyon Talebi Bekliyor</p>
                                <p className="text-[11px] text-navy-400">Departman kullanıcılarından gelen talepler onayınızı bekliyor.</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setStatusFilter('pending_approval')}
                            className="px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold hover:bg-amber-500/20 transition-all"
                        >
                            Talepleri Gör
                        </button>
                    </div>
                )}

                {/* Dashboard Stats / Hero Section */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div>
                        <h2 className="text-3xl font-black text-text-primary tracking-tight flex items-center gap-3">
                            <Target className="w-8 h-8 text-electric" />
                            {isDepartmentUser ? `${userDepartments?.join(', ')} Pozisyonları` : 'Pozisyon Portföyü'}
                        </h2>
                        <p className="text-navy-400 text-sm font-medium mt-1">
                            {isDepartmentUser
                                ? 'Departmanınız için pozisyon talebinde bulunun ve durumunu takip edin.'
                                : 'Aktif iş ilanlarınızı yönetin ve aday eşleşmelerini takip edin.'}
                        </p>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="px-5 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-electric/10 flex items-center justify-center">
                                <Zap className="w-5 h-5 text-electric" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-navy-500 uppercase tracking-widest">Aktif Kanal</p>
                                <p className="text-sm font-black text-text-primary">{positions.filter(p => p.status === 'open').length} Pozisyon</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="flex-1 md:flex-none px-6 py-4 rounded-2xl bg-electric hover:bg-electric-light text-text-primary font-black text-xs uppercase tracking-widest shadow-xl shadow-electric/20 hover:shadow-electric/40 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            {isDepartmentUser ? 'Pozisyon Talebi' : 'Yeni Pozisyon'}
                        </button>
                    </div>
                </div>

                {/* Search & Filters */}
                <div className="glass rounded-[2rem] p-4 border border-white/[0.08] flex flex-col md:flex-row gap-4 items-center">
                    <div className="relative flex-1 group w-full">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-500 group-focus-within:text-electric transition-colors" />
                        <input
                            type="text"
                            placeholder="Pozisyon adı, departman veya anahtar kelime ara..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3.5 rounded-[1.25rem] bg-navy-950/50 border border-white/5 text-sm text-text-primary placeholder:text-navy-500 focus:outline-none focus:border-electric/30 focus:bg-navy-950 transition-all"
                        />
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        {['all', 'open', 'pending_approval', 'closed'].map(s => (
                            <button
                                key={s}
                                onClick={() => setStatusFilter(s)}
                                className={`flex-1 md:flex-none px-4 py-3 rounded-[1.25rem] text-xs font-bold transition-all whitespace-nowrap border ${statusFilter === s
                                    ? 'bg-electric/10 border-electric/30 text-electric-light'
                                    : 'bg-white/[0.03] border-white/[0.06] text-navy-400 hover:text-text-primary'
                                    }`}
                            >
                                {s === 'all' ? 'Tümü' : s === 'open' ? 'Aktif' : s === 'pending_approval' ? `Bekleyen ${pendingCount > 0 ? `(${pendingCount})` : ''}` : 'Kapalı'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Positions Grid */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-32 space-y-4">
                        <div className="w-12 h-12 border-4 border-navy-800 border-t-electric rounded-full animate-spin" />
                        <p className="text-xs font-black text-navy-500 uppercase tracking-widest">Veritabanı taranıyor...</p>
                    </div>
                ) : visiblePositions.length === 0 ? (
                    <div className="text-center py-32 glass rounded-[3rem] border border-white/[0.06] bg-white/[0.01]">
                        <div className="w-20 h-20 rounded-[2rem] bg-white/[0.03] flex items-center justify-center mx-auto mb-6 border border-white/5">
                            <Briefcase className="w-8 h-8 text-navy-600" />
                        </div>
                        <h3 className="text-xl font-black text-text-primary mb-2 uppercase tracking-tight">
                            {statusFilter === 'pending_approval' ? 'Bekleyen Talep Yok' : 'Portföyünüz Boş'}
                        </h3>
                        <p className="text-sm text-navy-500 max-w-sm mx-auto font-medium">
                            {isDepartmentUser
                                ? 'Departmanınız için yeni bir pozisyon talebinde bulunabilirsiniz.'
                                : 'Yeni bir pozisyon ekleyerek yapay zeka tabanlı aday eşleştirme sistemini aktive edebilirsiniz.'}
                        </p>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="mt-8 px-8 py-3.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] text-text-primary border border-white/10 font-black text-[10px] uppercase tracking-widest transition-all"
                        >
                            {isDepartmentUser ? 'İlk Talebi Oluştur' : 'İlk Pozisyonu Oluştur'}
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                        {visiblePositions.map((pos) => {
                            const statusConf = STATUS_LABELS[pos.status] || STATUS_LABELS.closed;
                            const isPending = pos.status === 'pending_approval';
                            const isRejected = pos.status === 'rejected';

                            return (
                                <div key={pos.id} className={`group glass rounded-[2.5rem] p-8 border transition-all duration-500 relative flex flex-col h-full animate-fade-in-up ${isPending ? 'border-amber-500/20 hover:border-amber-500/40' :
                                    isRejected ? 'border-red-500/20 opacity-60' :
                                        'border-white/[0.06] hover:border-electric/30 hover:bg-white/[0.02]'
                                    }`}>
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-electric/5 rounded-full blur-3xl -z-10 opacity-0 group-hover:opacity-100 transition-opacity" />

                                    {/* Pending badge */}
                                    {isPending && (
                                        <div className="mb-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-center gap-2 text-[11px] text-amber-400 font-bold">
                                            <Clock className="w-3.5 h-3.5" />
                                            {pos.requestedBy?.displayName || 'Departman kullanıcısı'} tarafından talep edildi
                                        </div>
                                    )}

                                    {isRejected && pos.rejectionReason && (
                                        <div className="mb-4 p-3 rounded-xl bg-red-500/5 border border-red-500/20 flex items-center gap-2 text-[11px] text-red-400 font-bold">
                                            <XCircle className="w-3.5 h-3.5" />
                                            Red: {pos.rejectionReason}
                                        </div>
                                    )}

                                    <div className="flex justify-between items-start mb-6">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-8 h-8 rounded-lg bg-electric/10 flex items-center justify-center">
                                                    <Building2 className="w-4 h-4 text-electric" />
                                                </div>
                                                <span className="text-[10px] font-black text-navy-500 uppercase tracking-widest leading-none">{pos.department}</span>
                                            </div>
                                            <h3 className="text-xl font-black text-text-primary truncate group-hover:text-electric transition-colors tracking-tight uppercase">{pos.title}</h3>
                                        </div>
                                        <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border transition-colors ${statusConf.color}`}>
                                            {statusConf.label}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 mb-8">
                                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Users className="w-3.5 h-3.5 text-navy-500" />
                                                <span className="text-[9px] font-black text-navy-500 uppercase tracking-widest">Adaylar</span>
                                            </div>
                                            <p className="text-lg font-black text-text-primary">
                                                {candidates.filter(c => 
                                                    c.position === pos.title || 
                                                    c.matchedPositionTitle === pos.title || 
                                                    c.bestTitle === pos.title
                                                ).length}
                                            </p>
                                        </div>
                                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Clock className="w-3.5 h-3.5 text-navy-500" />
                                                <span className="text-[9px] font-black text-navy-500 uppercase tracking-widest">Tecrübe</span>
                                            </div>
                                            <p className="text-lg font-black text-text-primary">{pos.minExperience || 0}Yl</p>
                                        </div>
                                    </div>

                                    <div className="mt-auto space-y-4">
                                        {/* Pending Approval Actions (only for recruiter/admin) */}
                                        {isPending && isRecruiterOrAdmin && (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleApprovePosition(pos.id)}
                                                    className="flex-1 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all flex items-center justify-center gap-2"
                                                >
                                                    <CheckCircle2 className="w-4 h-4" /> Onayla
                                                </button>
                                                <button
                                                    onClick={() => handleRejectPosition(pos.id)}
                                                    className="flex-1 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all flex items-center justify-center gap-2"
                                                >
                                                    <XCircle className="w-4 h-4" /> Reddet
                                                </button>
                                            </div>
                                        )}

                                        {/* Normal Actions (for open positions) */}
                                        {pos.status === 'open' && (
                                            <>
                                                <div className="flex items-center justify-between text-[10px] font-bold">
                                                    <span className="text-navy-500 uppercase tracking-widest flex items-center gap-2">
                                                        <Cpu className="w-3.5 h-3.5 text-cyan-400" /> AI Değerlendirmesi
                                                    </span>
                                                    <span className="text-cyan-400">AKTİF</span>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setExpandedPosition(expandedPosition === pos.id ? null : pos.id)}
                                                        className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-2 ${expandedPosition === pos.id
                                                            ? 'bg-electric text-text-primary border-electric'
                                                            : 'bg-white/[0.03] border-white/10 text-text-primary hover:bg-white/[0.06]'
                                                            }`}
                                                    >
                                                        {expandedPosition === pos.id ? (
                                                            <>Kapat <ChevronDown className="w-3.5 h-3.5 rotate-180 transition-transform" /></>
                                                        ) : (
                                                            <>Potansiyel Adaylar <ArrowUpRight className="w-3.5 h-3.5" /></>
                                                        )}
                                                    </button>

                                                    {/* Release to Department Button (only for recruiter/admin) */}
                                                    {isRecruiterOrAdmin && (
                                                        <button
                                                            onClick={() => handleReleaseToDepartment(pos)}
                                                            disabled={releaseLoading && releasingPosId === pos.id}
                                                            className={`p-3.5 rounded-2xl border transition-all group/btn ${pos.releasedToDepartment
                                                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                                                : 'bg-violet-500/10 border-violet-500/20 text-violet-400 hover:bg-violet-500/20'
                                                                }`}
                                                            title={pos.releasedToDepartment ? 'Departmana açıldı (yeniden paylaş)' : 'Eşleşen adayları departmana aç'}
                                                        >
                                                            {(releaseLoading && releasingPosId === pos.id)
                                                                ? <Loader2 className="w-5 h-5 animate-spin" />
                                                                : <Unlock className="w-5 h-5" />}
                                                        </button>
                                                    )}

                                                    <button
                                                        onClick={() => openEditModal(pos)}
                                                        className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 text-navy-400 hover:text-text-primary transition-all group/btn"
                                                        title="Pozisyonu Düzenle"
                                                    >
                                                        <Edit2 className="w-5 h-5 group-hover/btn:text-electric transition-colors" />
                                                    </button>
                                                    <button
                                                        onClick={() => togglePositionStatus(pos.id, pos.status)}
                                                        className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 text-navy-400 hover:text-text-primary transition-all group/btn"
                                                        title={pos.status === 'open' ? 'Pozisyonu Kapat' : 'Pozisyonu Aç'}
                                                    >
                                                        {pos.status === 'open' ? <XCircle className="w-5 h-5 group-hover/btn:text-red-400 transition-colors" /> : <CheckCircle2 className="w-5 h-5 group-hover/btn:text-emerald-400 transition-colors" />}
                                                    </button>
                                                    <button
                                                        onClick={() => deletePosition(pos.id)}
                                                        className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 text-navy-400 hover:text-red-500 transition-all"
                                                        title="Sil"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </>
                                        )}

                                        {/* Delete for rejected positions */}
                                        {isRejected && isRecruiterOrAdmin && (
                                            <button
                                                onClick={() => deletePosition(pos.id)}
                                                className="w-full py-3 rounded-2xl bg-red-500/5 border border-red-500/10 text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10 transition-all flex items-center justify-center gap-2"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" /> Talebi Sil
                                            </button>
                                        )}
                                    </div>

                                    {/* Expanded Potential Candidates Tab */}
                                    {expandedPosition === pos.id && pos.status === 'open' && (
                                        <div className="mt-8 pt-8 border-t border-white/[0.08] animate-fade-in">
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
                        })}
                    </div>
                )}
            </div>

            {/* ===== DRAWER ===== */}
            {selectedCandidate && (
                <CandidateDrawer
                    candidate={selectedCandidate}
                    positionContext={activePosition}
                    onClose={() => {
                        setSelectedCandidate(null);
                        setActivePosition(null);
                    }}
                />
            )}

            {/* Add Position Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-xl animate-fade-in" onClick={() => setIsModalOpen(false)} />
                    <div className="relative w-full max-w-2xl glass rounded-[3rem] p-8 md:p-12 border border-white/10 shadow-3xl animate-scale-in">

                        <div className="flex justify-between items-start mb-10">
                            <div>
                                <h2 className="text-2xl font-black text-text-primary tracking-tight">
                                    {editMode ? 'POZİSYONU DÜZENLE' : (isDepartmentUser ? 'POZİSYON TALEBİ' : 'POZİSYON OLUŞTUR')}
                                </h2>
                                <p className="text-xs text-navy-500 font-bold uppercase tracking-widest mt-1">
                                    {editMode ? 'Stratejik Veri Güncelleme' : (isDepartmentUser ? 'Departman İhtiyaç Bildirimi' : 'Stratejik İşe Alım Planlaması')}
                                </p>
                            </div>
                            <button onClick={closeModal} className="p-3 hover:bg-white/5 rounded-2xl text-navy-400 transition-colors">
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                            {/* Smart Extraction Section */}
                            <div className="space-y-6">
                                <div className="p-6 rounded-[2rem] bg-electric/5 border border-electric/20 relative group/ai overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-electric/10 rounded-full blur-2xl -z-10" />
                                    <label className="block text-[10px] font-black text-electric-light mb-4 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <Sparkles className="w-4 h-4" /> AI Sihirbazı
                                    </label>
                                    <p className="text-xs text-navy-300 mb-4 leading-relaxed font-medium">İş tanımını buraya yapıştırın, AI başlığı, gereksinimleri ve departmanı otomatik doldursun.</p>
                                    <textarea
                                        value={jdText}
                                        onChange={e => setJdText(e.target.value)}
                                        className="w-full h-48 px-4 py-4 rounded-2xl bg-navy-950 border border-white/5 text-sm text-text-primary placeholder:text-navy-700 focus:border-electric/50 outline-none resize-none mb-4 transition-all"
                                        placeholder="Sorumluluklar, teknik beceriler ve deneyim kriterleri..."
                                    />
                                    <button
                                        type="button"
                                        onClick={handleExtractFromJD}
                                        disabled={isExtracting || jdText.length < 50}
                                        className="w-full py-4 rounded-xl bg-electric text-text-primary font-black text-[10px] uppercase tracking-widest hover:bg-electric-light transition-all disabled:opacity-30 flex items-center justify-center gap-2 shadow-xl shadow-electric/20"
                                    >
                                        {isExtracting ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <><Zap className="w-4 h-4" /> Metni Analiz Et</>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Manual Form Section */}
                            <form onSubmit={handleAddPosition} className="space-y-4">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-navy-500 uppercase tracking-widest mb-2 ml-1">Pozisyon Başlığı</label>
                                        <div className="relative">
                                            <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-600" />
                                            <input
                                                type="text"
                                                value={formData.title}
                                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                                className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-white/[0.03] border border-white/5 text-sm text-text-primary focus:border-electric/40 outline-none transition-all"
                                                placeholder="Örn: Senior Product Manager"
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-navy-500 uppercase tracking-widest mb-2 ml-1">Departman</label>
                                        <div className="relative">
                                            <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-600" />
                                            {departments.length > 0 ? (
                                                <div className="relative">
                                                    <select
                                                        value={formData.department}
                                                        onChange={e => setFormData({ ...formData, department: e.target.value })}
                                                        className="w-full pl-12 pr-10 py-3.5 rounded-2xl bg-navy-900 border border-white/5 text-sm text-text-primary focus:border-electric/40 outline-none transition-all appearance-none cursor-pointer disabled:opacity-50"
                                                        disabled={isDepartmentUser}
                                                        required
                                                    >
                                                        <option value="" disabled>Seçiniz...</option>
                                                        {departments.map(d => (
                                                            <option key={d.id} value={d.name}>{d.name}</option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-600 pointer-events-none" />
                                                </div>
                                            ) : (
                                                <div className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-white/[0.03] border border-red-500/20 text-sm text-red-400 flex items-center justify-between">
                                                    <span>Henüz Departman Tanımlanmamış</span>
                                                    {!isDepartmentUser && (
                                                        <button
                                                            type="button"
                                                            onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'departments' }))}
                                                            className="text-[10px] underline hover:text-red-300"
                                                        >
                                                            Oluştur →
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black text-navy-500 uppercase tracking-widest mb-2 ml-1">Tecrübe (Yıl)</label>
                                            <input
                                                type="number"
                                                value={formData.minExperience}
                                                onChange={e => setFormData({ ...formData, minExperience: e.target.value })}
                                                className="w-full px-4 py-3.5 rounded-2xl bg-white/[0.03] border border-white/5 text-sm text-text-primary focus:border-electric/40 outline-none transition-all"
                                                placeholder="5"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-navy-500 uppercase tracking-widest mb-2 ml-1">Mod</label>
                                            <div className={`w-full px-4 py-3.5 rounded-2xl text-[10px] font-black flex items-center justify-center gap-2 ${isDepartmentUser
                                                ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
                                                : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                                                }`}>
                                                {isDepartmentUser ? <><Send className="w-3.5 h-3.5" /> TALEP</> : <><Target className="w-3.5 h-3.5" /> OTOMATİK</>}
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-navy-500 uppercase tracking-widest mb-2 ml-1">Teknik Kriterler</label>
                                        <div className="relative">
                                            <FileText className="absolute left-4 top-4 w-4 h-4 text-navy-600" />
                                            <textarea
                                                value={formData.requirements}
                                                onChange={e => setFormData({ ...formData, requirements: e.target.value })}
                                                className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white/[0.03] border border-white/5 text-sm text-text-primary focus:border-electric/40 outline-none resize-none h-24 transition-all"
                                                placeholder="Gereksinimleri virgülle ayırarak yazın..."
                                            />
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    className={`w-full py-4.5 rounded-2xl text-text-primary font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl transition-all mt-4 ${editMode ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/30' : (isDepartmentUser
                                        ? 'bg-amber-500 hover:bg-amber-400 shadow-amber-500/30'
                                        : 'bg-electric hover:bg-electric-light shadow-electric/30')
                                        }`}
                                >
                                    {editMode ? 'Değişiklikleri Kaydet' : (isDepartmentUser ? 'Talep Gönder' : 'Pozisyonu Yayına Al')}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
