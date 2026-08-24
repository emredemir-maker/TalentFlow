// src/pages/PositionsPage.jsx
// Command Table layout — with redesigned Create / Detail / Edit screens

import { analysisScoreFor } from '../utils/positionScore';
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Header from '../components/Header';
import { usePositions } from '../context/PositionsContext';
import { normalizeBand, formatBand, CURRENCIES, CURRENCY_LABEL, PERIODS, PERIOD_LABEL, BASES, BASIS_LABEL } from '../utils/salaryBand';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { collection, onSnapshot, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
    Briefcase, Plus, Trash2, CheckCircle2, XCircle, Users, Clock,
    Search, Sparkles, Loader2, Cpu, ArrowUpRight, Building2,
    AlertCircle, Unlock, Edit2, X, Send, Link2, Copy, Check,
    ExternalLink, FileText, ChevronRight, TrendingUp, RefreshCw,
    MoreHorizontal, Target,
} from 'lucide-react';
import {
    subscribeToApplications, getSourceColor, APP_STATUS_CONFIG, updateApplicationStatus, deleteApplication
} from '../services/applicationService';

import PotentialCandidatesTab from '../components/PotentialCandidatesTab';
import { useCandidates } from '../context/CandidatesContext';
import { extractPositionFromJD } from '../services/geminiService';
import {
    requirementsOf,
} from '../utils/positionRequirements';
import { planRequirementChanges } from '../utils/requirementEdit';
import { buildGlossaryRecord } from '../utils/requirementGlossary';
import { buildRequirementGlossary } from '../services/ai/requirementGlossary';
import { rescanCandidateForPosition, hasAnalysisForPosition } from '../services/scanService';
import RescanPositionModal from '../components/RescanPositionModal';
import RequirementReviewPanel from '../components/RequirementReviewPanel';
import RequirementListEditor from '../components/RequirementListEditor';
import { getAuthHeaders } from '../services/ai/config';
import { calculateMatchScore, filterCandidatesByDomain } from '../services/matchService';

const STATUS_CONFIG = {
    open:             { label: 'Aktif',        pill: 'bg-ok-bg text-ok border-transparent', dot: 'bg-ok' },
    closed:           { label: 'Pasif',         pill: 'bg-n100 text-n400 border-n200',     dot: 'bg-n300' },
    pending_approval: { label: 'Onay Bekliyor', pill: 'bg-warn-bg text-warn border-warn',      dot: 'bg-warn' },
    rejected:         { label: 'Reddedildi',   pill: 'bg-bad-bg text-bad border-transparent',            dot: 'bg-bad' },
};

// ─────────────────────────────────────────────────────────────
// DETAIL DRAWER
// ─────────────────────────────────────────────────────────────
const APPLY_SOURCES = ['LinkedIn', 'Kariyer.net', 'Instagram', 'Twitter/X', 'Facebook', 'E-posta', 'Web'];

function PositionDetailDrawer({ pos, candidates, onClose, onEdit, onRelease, onToggleStatus, onDelete, isRecruiterOrAdmin, releaseLoading, releasingPosId, onCandidateClick, onRescan, onApplySuggestions, onRescanAfterEdit, onBuildGlossary }) {
    const sc = STATUS_CONFIG[pos.status] || STATUS_CONFIG.closed;
    const candidateCount = pos.matchedCandidates?.length || 0;
    const openDays = pos.createdAt ? Math.floor((Date.now() - pos.createdAt.toDate?.()?.getTime?.()) / 86400000) : null;

    const [activeTab, setActiveTab] = useState('detail');
    const [applications, setApplications] = useState([]);
    const [appsLoading, setAppsLoading] = useState(false);
    const [linkSource, setLinkSource] = useState('LinkedIn');
    const [copied, setCopied] = useState(false);
    const [syncingAppId, setSyncingAppId] = useState(null);
    const [syncedAppIds, setSyncedAppIds] = useState(new Set());
    const [deletingAppId, setDeletingAppId] = useState(null);
    const [screeningFilter, setScreeningFilter] = useState('all');
    const [selectedAppIds, setSelectedAppIds] = useState(new Set());
    const [shortlisting, setShortlisting] = useState(false);
    const [departments, setDepartments] = useState([]);
    const [shortlistDept, setShortlistDept] = useState('');
    const [showShortlistBar, setShowShortlistBar] = useState(false);

    // Compute live matches from current candidates — never stale
    const liveMatchedCandidates = useMemo(() => {
        if (!candidates || candidates.length === 0) return [];
        const domainFiltered = filterCandidatesByDomain(pos, candidates);
        return domainFiltered
            .map(c => {
                const savedScore = analysisScoreFor(c, pos);
                const staticScore = calculateMatchScore(c, pos).score;
                const score = Math.max(savedScore, staticScore);
                return { id: c.id, name: c.name || '—', score, reason: c.positionAnalyses?.[pos.title]?.summary || (score >= 70 ? 'Yüksek Uyumluluk' : 'Potansiyel Eşleşme') };
            })
            .filter(m => m.score >= 50)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
    }, [pos, candidates]);

    // Build the apply URL
    const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}/apply/${pos.id}` : `/apply/${pos.id}`;
    const applyUrl = `${baseUrl}?ref=${encodeURIComponent(linkSource.toLowerCase().replace(/[^a-z0-9]/g, '-'))}`;

    // Load applications when tab opens
    useEffect(() => {
        if (activeTab !== 'applications') return;
        setAppsLoading(true);
        const unsub = subscribeToApplications(pos.id, (apps) => {
            setApplications(apps);
            setAppsLoading(false);
        });
        return () => unsub();
    }, [activeTab, pos.id]);

    // Load departments once for shortlist modal
    useEffect(() => {
        const unsub = onSnapshot(
            collection(db, 'artifacts/talent-flow/public/data/departments'),
            (snap) => setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
            () => {}
        );
        return () => unsub();
    }, []);

    function copyLink() {
        navigator.clipboard.writeText(applyUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    async function syncApplicationToCandidate(app, deptId) {
        if (syncingAppId) return;
        setSyncingAppId(app.id);
        try {
            const CANDIDATES_COLLECTION = 'artifacts/talent-flow/public/data/candidates';
            const emailNorm = app.email?.trim().toLowerCase() || '';
            const q = query(collection(db, CANDIDATES_COLLECTION), where('email', '==', emailNorm));
            const existing = await getDocs(q);
            if (!existing.empty) {
                setSyncedAppIds(prev => new Set([...prev, app.id]));
                await updateApplicationStatus(app.id, 'shortlisted');
                return;
            }
            const deptName = deptId ? (departments.find(d => d.id === deptId)?.name || '') : '';
            const candidateData = {
                name: app.name || '',
                email: emailNorm,
                phone: app.phone || '',
                linkedinUrl: app.linkedin || '',
                position: pos.title || '',
                company: app.parsedCandidate?.company || '',
                location: app.parsedCandidate?.location || '',
                skills: app.parsedCandidate?.skills || [],
                experience: app.parsedCandidate?.experience || 0,
                // Kariyer geçmişi başvuru dokümanında zaten var — terfide
                // kopyalanmazsa aday "Kariyer bilgisi bulunamadı" görünüyordu.
                experiences: app.parsedCandidate?.experiences || [],
                education: app.parsedCandidate?.education || '',
                summary: app.parsedCandidate?.summary || app.aiSummary || '',
                cvData: app.parsedCandidate?.cvData || '',
                cvText: app.cvText || '',
                cvFileName: app.cvFileName || '',
                source: app.source || '',
                sourceCategory: app.sourceCategory || '',
                status: 'new',
                matchScore: app.aiScore || 0,
                combinedScore: app.aiScore || 0,
                aiAnalysis: app.aiScoreBreakdown || (app.aiScore > 0 ? { score: app.aiScore, summary: app.aiSummary || '' } : null),
                applicationId: app.id,
                positionId: pos.id,
                appliedDate: app.createdAt?.toDate?.()?.toISOString?.()?.split('T')?.[0] || new Date().toISOString().split('T')[0],
                interviewSessions: [],
                ...(app.screeningAnswers ? { screeningAnswers: app.screeningAnswers } : {}),
                ...(app.screeningLevel ? { screeningLevel: app.screeningLevel } : {}),
                ...(deptId ? { department: deptName } : {}),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            };
            await addDoc(collection(db, CANDIDATES_COLLECTION), candidateData);
            await updateApplicationStatus(app.id, 'shortlisted');
            setSyncedAppIds(prev => new Set([...prev, app.id]));
        } catch (err) {
            console.error('Sync error:', err);
        } finally {
            setSyncingAppId(null);
        }
    }

    async function handleBulkShortlist() {
        if (!selectedAppIds.size || shortlisting) return;
        setShortlisting(true);
        const deptId = shortlistDept || '';
        const appsToProcess = applications.filter(a => selectedAppIds.has(a.id));
        for (const app of appsToProcess) {
            try {
                await syncApplicationToCandidate(app, deptId);
            } catch {/* non-fatal */}
        }
        setSelectedAppIds(new Set());
        setShortlistDept('');
        setShowShortlistBar(false);
        setShortlisting(false);
    }

    async function handleDeleteApp(appId) {
        if (!window.confirm('Bu başvuruyu silmek istediğinizden emin misiniz?')) return;
        setDeletingAppId(appId);
        try {
            await deleteApplication(appId);
        } catch (err) {
            console.error('Delete application failed:', err);
            alert('Başvuru silinemedi. Lütfen tekrar deneyin.');
        } finally {
            setDeletingAppId(null);
        }
    }

    const TABS = [
        { id: 'detail', label: 'Detay' },
        { id: 'applications', label: 'Başvurular', badge: applications.length || null },
        { id: 'link', label: 'Başvuru Linki' },
    ];

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-n900/20 backdrop-blur-[2px] z-40" onClick={onClose} />

            {/* Drawer */}
            {/* GENİŞLİK EKRANA GÖRE — ama hiçbir ekranda bugünkünden dar değil.
                Sabit 520px, 1440px ekranda çekmeceyi %36'ya sıkıştırıyordu ve
                içerik 3.4 ekran boyunca kaydırılıyordu. Yüksekliğin %81'i iki
                bloktan geliyor: gereksinim gözden geçirme (840px) ve eşleşen
                adaylar (955px) — ikisi de satır satır sarmalanan listeler,
                genişlik doğrudan yüksekliğe dönüşüyor.
                `max(520px, ...)`: dar ekranda formül 520'nin altına düşse bile
                bugünkü genişlik korunuyor. `92vw` küçük ekranda taşmayı önler. */}
            <div className="fixed right-0 top-0 h-full w-[min(92vw,max(520px,52vw))] bg-n0 shadow-2xl shadow-none/10 border-l border-n200 flex flex-col z-50">

                {/* Header */}
                <div className="px-6 py-5 border-b border-n200 shrink-0">
                    <div className="flex justify-between items-center mb-2">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${sc.pill}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} ${pos.status === 'open' ? 'animate-pulse' : ''}`} />
                            {sc.label}
                        </span>
                        <div className="flex items-center gap-1.5">
                            {isRecruiterOrAdmin && (
                                <button
                                    onClick={onRescan}
                                    className="p-2 rounded-md bg-brand-50 border border-brand-100 text-brand hover:bg-brand-100 transition-colors"
                                    title="Bu ilan için adayları yeniden tara (skor eşiği seçebilirsiniz)"
                                >
                                    <Target size={16} />
                                </button>
                            )}
                            {isRecruiterOrAdmin && (
                                <button onClick={onEdit} className="p-2 rounded-md bg-n50 border border-n200 hover:bg-n100 transition-colors" title="Düzenle">
                                    <Edit2 size={16} className="text-n400" />
                                </button>
                            )}
                            {isRecruiterOrAdmin && pos.status === 'open' && (
                                <button
                                    onClick={onRelease}
                                    disabled={releaseLoading && releasingPosId === pos.id}
                                    className={`p-2 rounded-md border transition-colors ${pos.releasedToDepartment ? 'bg-ok-bg border-transparent text-ok-text' : 'bg-brand-50 border-brand-100 text-brand hover:bg-brand-100'}`}
                                    title="Departmana Aç"
                                >
                                    {releaseLoading && releasingPosId === pos.id ? <Loader2 size={16} className="animate-spin" /> : <Unlock size={16} />}
                                </button>
                            )}
                            <button onClick={onClose} className="p-2 rounded-md bg-n50 border border-n200 hover:bg-n100 transition-colors">
                                <X size={16} className="text-n400" />
                            </button>
                        </div>
                    </div>
                    <h2 className="text-[17px] font-semibold text-n900 mt-2">{pos.title}</h2>
                    <div className="inline-flex items-center gap-1.5 mt-1">
                        <Building2 size={12} className="text-n400" />
                        <span className="text-[11px] text-n500">{pos.department}</span>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1 mt-4 bg-n100 rounded-md p-1">
                        {TABS.map(t => (
                            <button
                                key={t.id}
                                onClick={() => setActiveTab(t.id)}
                                className={`flex-1 py-2 rounded-md text-[11px] font-semibold transition-all flex items-center justify-center gap-1.5 ${activeTab === t.id ? 'bg-n0 text-n900 shadow-sm' : 'text-n400 hover:text-n600'}`}
                            >
                                {t.label}
                                {t.badge ? (
                                    <span className="bg-brand text-white text-[11px] font-semibold rounded-full px-1.5 py-0.5 leading-none">{t.badge}</span>
                                ) : null}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── TAB: DETAIL ── */}
                {activeTab === 'detail' && (
                    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-2">
                            <div className="bg-n50 rounded-[14px] border border-n200 p-3 text-center">
                                <div className="text-[24px] font-semibold text-n900 leading-none">{candidateCount}</div>
                                <div className="text-[10px] text-n400 uppercase tracking-[0.08em] mt-1">Aday</div>
                            </div>
                            <div className="bg-n50 rounded-[14px] border border-n200 p-3 text-center">
                                <div className="text-[24px] font-semibold text-n900 leading-none">{pos.minExperience || 0} yıl+</div>
                                <div className="text-[10px] text-n400 uppercase tracking-[0.08em] mt-1">Min. Tecrübe</div>
                            </div>
                            <div className="bg-n50 rounded-[14px] border border-n200 p-3 text-center">
                                <div className="text-[24px] font-semibold text-brand leading-none">{openDays !== null ? `${openDays}g` : '—'}</div>
                                <div className="text-[10px] text-n400 uppercase tracking-[0.08em] mt-1">Açık Süre</div>
                            </div>
                        </div>

                        {/* Requirements */}
                        {pos.requirements?.length > 0 && (
                            <div>
                                <h3 className="text-[10px] font-semibold text-n400 tracking-[0.08em] uppercase mb-2">GEREKSİNİMLER</h3>
                                <div className="flex flex-wrap gap-2">
                                    {pos.requirements.map(req => (
                                        <span key={req} className="px-3 py-1.5 rounded-md bg-n100 text-n600 text-xs font-semibold border border-n200">{req}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Gereksinim gozden gecirme — sayilar taranmis adaylardan
                            olculur, AI yalnizca isaretli maddeler icin alternatif
                            ifade onerir. Gereksinimler skorun en buyuk kaldiraci
                            oldugu icin denetlenmeleri gerekiyor. */}
                        {isRecruiterOrAdmin && pos.status === 'open' && (
                            <RequirementReviewPanel
                                position={pos}
                                candidates={candidates}
                                onCandidateClick={onCandidateClick}
                                onApplySuggestions={onApplySuggestions}
                                onRescan={onRescanAfterEdit}
                                onBuildGlossary={onBuildGlossary}
                            />
                        )}

                        {/* Description */}
                        {pos.description && (
                            <div>
                                <h3 className="text-[10px] font-semibold text-n400 tracking-[0.08em] uppercase mb-2">AÇIKLAMA</h3>
                                <p className="text-sm text-n600 leading-relaxed">{pos.description}</p>
                            </div>
                        )}

                        {/* Matched Candidates — computed live from current candidate pool */}
                        {pos.status === 'open' && (
                            <div>
                                <h3 className="text-[10px] font-semibold text-n400 tracking-[0.08em] uppercase mb-2">EŞLEŞEN ADAYLAR</h3>
                                {liveMatchedCandidates.length > 0 ? (
                                    <div className="space-y-2">
                                        {liveMatchedCandidates.slice(0, 5).map((mc, idx) => {
                                            const fullCandidate = candidates.find(c => c.id === mc.id);
                                            const initials = mc.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';
                                            return (
                                                <div
                                                    key={idx}
                                                    onClick={() => fullCandidate && onCandidateClick(fullCandidate)}
                                                    className="bg-n0 border border-n200 rounded-[14px] p-3.5 flex items-center gap-2 hover:border-brand-100 transition-colors cursor-pointer group"
                                                >
                                                    <div className="w-9 h-9 rounded-full from-brand to-brand flex items-center justify-center text-white text-xs font-semibold shrink-0 shadow-sm">
                                                        {initials}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-[12px] font-semibold text-n900 truncate">{mc.name}</div>
                                                        <div className="text-[11px] text-n400">{mc.reason || 'Eşleşme'}</div>
                                                    </div>
                                                    <div className="flex flex-col items-end shrink-0">
                                                        <div className="text-[14px] font-semibold text-brand">{mc.score}%</div>
                                                        <div className="h-0.5 w-12 bg-n100 rounded-full mt-1 overflow-hidden">
                                                            <div className="h-full bg-brand rounded-full" style={{ width: `${mc.score}%` }} />
                                                        </div>
                                                    </div>
                                                    <ArrowUpRight size={14} className="text-n300 group-hover:text-brand transition-colors ml-1 shrink-0" />
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-sm text-n400 italic">Henüz eşleşen aday yok.</p>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ── TAB: APPLICATIONS ── */}
                {activeTab === 'applications' && (
                    <div className="flex-1 overflow-y-auto px-6 py-5">
                        {appsLoading ? (
                            <div className="flex items-center justify-center h-40">
                                <Loader2 className="w-6 h-6 text-brand animate-spin" />
                            </div>
                        ) : applications.length === 0 ? (
                            <div className="text-center py-16">
                                <FileText className="w-10 h-10 text-n200 mx-auto mb-3" />
                                <p className="text-n400 text-sm font-semibold">Henüz başvuru yok</p>
                                <p className="text-n300 text-xs mt-1">Başvuru linkinizi paylaşın</p>
                                <button
                                    onClick={() => setActiveTab('link')}
                                    className="mt-4 px-4 py-2 rounded-md bg-brand-50 border border-brand-100 text-brand text-xs font-semibold hover:bg-brand-100 transition-colors inline-flex items-center gap-1.5"
                                >
                                    <Link2 size={12} /> Başvuru Linki Oluştur
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {/* Summary row */}
                                <div className="grid grid-cols-3 gap-2 mb-4">
                                    {['new','shortlisted','rejected'].map(st => {
                                        const count = applications.filter(a => a.status === st).length;
                                        const cfg = APP_STATUS_CONFIG[st];
                                        return (
                                            <div key={st} className={`rounded-[14px] border p-3 text-center ${cfg.pill}`}>
                                                <div className="text-[22px] font-semibold leading-none">{count}</div>
                                                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] mt-1 opacity-70">{cfg.label}</div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Screening Score Filter + Bulk Select */}
                                {(() => {
                                    const getScreeningLevel = (app) => {
                                        if (app.screeningLevel) {
                                            const map = {
                                                'Çok İyi':    { key: 'best',   label: 'Çok İyi',    cls: 'bg-ok-bg text-ok border-transparent' },
                                                'İyi':        { key: 'good',   label: 'İyi',        cls: 'bg-brand-50 text-brand-600 border-brand-200' },
                                                'Fena Değil': { key: 'medium', label: 'Fena Değil', cls: 'bg-warn-bg text-warn border-warn' },
                                                'Yetersiz':   { key: 'weak',   label: 'Yetersiz',   cls: 'bg-bad-bg text-bad border-transparent' },
                                            };
                                            return map[app.screeningLevel] || { key: 'none', label: 'Taranmadı', cls: 'bg-n100 text-n400 border-n200' };
                                        }
                                        const score = app.screeningScore;
                                        if (score == null) return { key: 'none', label: 'Taranmadı', cls: 'bg-n100 text-n400 border-n200' };
                                        if (score >= 75) return { key: 'best',   label: 'Çok İyi',    cls: 'bg-ok-bg text-ok border-transparent' };
                                        if (score >= 50) return { key: 'good',   label: 'İyi',        cls: 'bg-brand-50 text-brand-600 border-brand-200' };
                                        if (score >= 25) return { key: 'medium', label: 'Fena Değil', cls: 'bg-warn-bg text-warn border-warn' };
                                        return { key: 'weak', label: 'Yetersiz', cls: 'bg-bad-bg text-bad border-transparent' };
                                    };
                                    const FILTER_OPTS = [
                                        { key: 'all',    label: 'Tümü' },
                                        { key: 'best',   label: 'Çok İyi' },
                                        { key: 'good',   label: 'İyi' },
                                        { key: 'medium', label: 'Fena Değil' },
                                        { key: 'weak',   label: 'Yetersiz' },
                                        { key: 'none',   label: 'Taranmadı' },
                                    ];
                                    const filteredApps = screeningFilter === 'all'
                                        ? applications
                                        : applications.filter(a => getScreeningLevel(a).key === screeningFilter);
                                    const allSelected = filteredApps.length > 0 && filteredApps.every(a => selectedAppIds.has(a.id));
                                    const toggleAll = () => {
                                        if (allSelected) setSelectedAppIds(new Set());
                                        else setSelectedAppIds(new Set(filteredApps.map(a => a.id)));
                                    };
                                    return (<>
                                        <div className="flex gap-1.5 flex-wrap mb-3 pt-1">
                                            {FILTER_OPTS.map(o => (
                                                <button
                                                    key={o.key}
                                                    onClick={() => setScreeningFilter(o.key)}
                                                    className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold uppercase tracking-wide transition-all ${screeningFilter === o.key ? 'bg-brand text-white border-brand' : 'bg-n0 text-n400 border-n200 hover:border-n300'}`}
                                                >
                                                    {o.label}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Bulk action bar */}
                                        {selectedAppIds.size > 0 && (
                                            <div className="flex items-center gap-2 mb-3 px-3 py-2.5 bg-brand-50 border border-brand-100 rounded-md">
                                                <span className="text-[11px] font-semibold text-brand-700 flex-1">{selectedAppIds.size} başvuru seçildi</span>
                                                <select
                                                    value={shortlistDept}
                                                    onChange={e => setShortlistDept(e.target.value)}
                                                    className="text-[11px] font-semibold border border-brand-100 rounded-md px-2 py-1 bg-n0 text-n600"
                                                >
                                                    <option value="">Departman seç (opsiyonel)</option>
                                                    {departments.map(d => (
                                                        <option key={d.id} value={d.id}>{d.name}</option>
                                                    ))}
                                                </select>
                                                <button
                                                    onClick={handleBulkShortlist}
                                                    disabled={shortlisting}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-brand text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
                                                >
                                                    {shortlisting ? <Loader2 size={11} className="animate-spin" /> : <Users size={11} />}
                                                    Kısa Listeye Ekle
                                                </button>
                                                <button
                                                    onClick={() => setSelectedAppIds(new Set())}
                                                    className="p-1 rounded text-n400 hover:text-n600"
                                                >
                                                    <X size={13} />
                                                </button>
                                            </div>
                                        )}

                                        {/* Select all checkbox row */}
                                        {filteredApps.length > 0 && (
                                            <label className="flex items-center gap-2 mb-2 cursor-pointer text-[10px] text-n400 font-semibold">
                                                <input
                                                    type="checkbox"
                                                    checked={allSelected}
                                                    onChange={toggleAll}
                                                    className="accent-brand w-3.5 h-3.5"
                                                />
                                                Tümünü Seç
                                            </label>
                                        )}

                                        {filteredApps.map(app => {
                                            const sc = getSourceColor(app.source);
                                            const stCfg = APP_STATUS_CONFIG[app.status] || APP_STATUS_CONFIG.new;
                                            const scoreColor = app.aiScore >= 75 ? 'text-ok' : app.aiScore >= 50 ? 'text-warn' : 'text-bad';
                                            const slv = getScreeningLevel(app);
                                            const isSelected = selectedAppIds.has(app.id);
                                            const toggleSelect = () => setSelectedAppIds(prev => {
                                                const next = new Set(prev);
                                                if (next.has(app.id)) next.delete(app.id);
                                                else next.add(app.id);
                                                return next;
                                            });
                                            return (
                                        <div key={app.id} className={`bg-n0 border rounded-[14px] p-3 hover:border-brand-100 transition-colors ${isSelected ? 'border-brand bg-brand-50/30' : 'border-n200'}`}>
                                            <div className="flex items-start gap-2">
                                                <div className="flex flex-col items-center gap-2 shrink-0">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={toggleSelect}
                                                        className="accent-brand w-3.5 h-3.5 mt-0.5 cursor-pointer"
                                                    />
                                                    <div className="w-9 h-9 rounded-full from-brand to-brand-600 flex items-center justify-center text-white text-xs font-semibold">
                                                        {app.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??'}
                                                    </div>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-[12px] font-semibold text-n900 truncate">{app.name}</span>
                                                        <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-semibold ${sc.bg} ${sc.text} ${sc.border}`}>{app.source}</span>
                                                    </div>
                                                    <div className="text-[11px] text-n400 truncate">{app.email}</div>
                                                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                        <span className={`inline-flex px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${stCfg.pill}`}>{stCfg.label}</span>
                                                        {(app.screeningLevel || app.screeningScore != null) && (
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${slv.cls}`}>
                                                                {slv.label}
                                                            </span>
                                                        )}
                                                        {syncedAppIds.has(app.id) && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-ok-bg text-ok-text border-transparent">
                                                                <Check size={9} /> Kısa listede
                                                            </span>
                                                        )}
                                                        {app.cvFileName && (
                                                            <span className="inline-flex items-center gap-1 text-[10px] text-n400">
                                                                <FileText size={10} />{app.cvFileName}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="shrink-0 text-right flex flex-col items-end gap-2">
                                                    <div className={`text-[18px] font-semibold leading-none ${scoreColor}`}>{app.aiScore || 0}%</div>
                                                    <div className="text-[10px] text-n300 uppercase tracking-[0.08em]">AI Uyum</div>
                                                    <div className="h-1 w-12 bg-n100 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full ${app.aiScore >= 75 ? 'bg-ok' : app.aiScore >= 50 ? 'bg-warn' : 'bg-bad'}`} style={{ width: `${app.aiScore || 0}%` }} />
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeleteApp(app.id)}
                                                        disabled={deletingAppId === app.id}
                                                        className="mt-1 p-1.5 rounded-md text-n300 hover:text-bad-text hover:bg-bad-bg border border-transparent hover:border-transparent transition-all disabled:opacity-40"
                                                        title="Başvuruyu sil"
                                                    >
                                                        {deletingAppId === app.id
                                                            ? <Loader2 size={12} className="animate-spin" />
                                                            : <Trash2 size={12} />
                                                        }
                                                    </button>
                                                </div>
                                            </div>
                                            {/* Status changer */}
                                            <div className="flex gap-1.5 mt-3 pt-3 border-t border-n200">
                                                {Object.entries(APP_STATUS_CONFIG).map(([st, cfg]) => (
                                                    <button
                                                        key={st}
                                                        onClick={() => updateApplicationStatus(app.id, st)}
                                                        className={`flex-1 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wide border transition-all ${app.status === st ? cfg.pill : 'bg-n50 text-n300 border-n200 hover:border-n200'}`}
                                                    >
                                                        {cfg.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                            );
                                        })}
                                    </>);
                                })()}
                            </div>
                        )}
                    </div>
                )}

                {/* ── TAB: APPLY LINK ── */}
                {activeTab === 'link' && (
                    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                        <div>
                            <h3 className="text-[10px] font-semibold text-n400 tracking-[0.08em] uppercase mb-1">BAŞVURU LİNKİ</h3>
                            <p className="text-[11px] text-n400 leading-relaxed">
                                Aşağıdaki linki LinkedIn, e-posta veya istediğiniz platformda paylaşın. Kaynağı seçin — sistem hangi kanaldan geldiğini otomatik kaydeder.
                            </p>
                        </div>

                        {/* Source selector */}
                        <div>
                            <div className="text-[10px] font-semibold text-n400 tracking-[0.08em] uppercase mb-2">PAYLAŞIM KANALI</div>
                            <div className="flex flex-wrap gap-2">
                                {APPLY_SOURCES.map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setLinkSource(s)}
                                        className={`px-3 py-1.5 rounded-md border text-[12px] font-semibold transition-all ${linkSource === s ? 'bg-brand text-white border-brand' : 'bg-n50 text-n500 border-n200 hover:border-brand-200'}`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Link box */}
                        <div className="bg-n50 border border-n200 rounded-[14px] p-3">
                            <div className="text-[10px] font-semibold text-n400 uppercase tracking-[0.08em] mb-2">OLUŞTURULAN LİNK</div>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 bg-n0 border border-n200 rounded-md px-3 py-2.5 text-[12px] font-mono text-n600 break-all leading-relaxed">
                                    {applyUrl}
                                </div>
                                <button
                                    onClick={copyLink}
                                    className={`shrink-0 p-2.5 rounded-md border transition-all ${copied ? 'bg-ok-bg border-transparent text-ok-text' : 'bg-n0 border-n200 text-n400 hover:border-brand-200 hover:text-brand'}`}
                                >
                                    {copied ? <Check size={16} /> : <Copy size={16} />}
                                </button>
                            </div>
                        </div>

                        {/* Preview button */}
                        <a
                            href={applyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-3 rounded-md border border-brand-100 text-brand font-semibold text-xs hover:bg-brand-50 transition-colors"
                        >
                            <ExternalLink size={13} /> Başvuru Formunu Önizle
                        </a>

                        {/* Tip */}
                        <div className="bg-brand-50 border border-brand-100 rounded-[14px] p-3">
                            <div className="text-[10px] font-semibold text-brand uppercase tracking-[0.08em] mb-2">NASIL KULLANILIR?</div>
                            <ul className="space-y-1.5 text-[11px] text-n500 leading-relaxed">
                                <li className="flex items-start gap-2"><ChevronRight size={10} className="text-brand mt-0.5 shrink-0" />LinkedIn iş ilanına "Başvur" butonu olarak ekleyin</li>
                                <li className="flex items-start gap-2"><ChevronRight size={10} className="text-brand mt-0.5 shrink-0" />E-posta imzanıza veya kampanyaya hyperlink ekleyin</li>
                                <li className="flex items-start gap-2"><ChevronRight size={10} className="text-brand mt-0.5 shrink-0" />Her platform için ayrı kaynak seçin — istatistikler ayrı tutulur</li>
                                <li className="flex items-start gap-2"><ChevronRight size={10} className="text-brand mt-0.5 shrink-0" />Gelen başvurular "Başvurular" sekmesinde AI skoru ile görünür</li>
                            </ul>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="px-6 py-3 border-t border-n200 shrink-0 bg-n50">
                    {pos.status === 'open' && isRecruiterOrAdmin ? (
                        <div className="flex gap-2">
                            <button
                                onClick={onRelease}
                                className={`flex-1 py-3 rounded-md font-semibold text-xs flex items-center justify-center gap-2 transition-colors ${pos.releasedToDepartment ? 'bg-ok text-white' : 'bg-brand hover:bg-brand-600 text-white shadow-sm shadow-none'}`}
                            >
                                <Unlock size={14} />{pos.releasedToDepartment ? 'Yeniden Paylaş' : 'Departmana Aç'}
                            </button>
                            <button
                                onClick={() => { onToggleStatus(); onClose(); }}
                                className="flex-1 py-3 rounded-md bg-n0 border border-transparent hover:bg-bad-bg hover:border-bad transition-colors text-bad-text font-semibold text-xs flex items-center justify-center gap-2"
                            >
                                <XCircle size={14} />Pozisyonu Kapat
                            </button>
                        </div>
                    ) : pos.status === 'closed' && isRecruiterOrAdmin ? (
                        <div className="flex gap-2">
                            <button
                                onClick={() => { onToggleStatus(); onClose(); }}
                                className="flex-1 py-3 rounded-md bg-ok hover:opacity-90 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm shadow-none"
                            >
                                <RefreshCw size={14} />Pozisyonu Yeniden Aç
                            </button>
                            <button onClick={onClose} className="py-3 px-4 rounded-md bg-n100 hover:bg-n100 text-n600 font-semibold text-xs transition-colors">
                                Vazgeç
                            </button>
                        </div>
                    ) : (
                        <button onClick={onClose} className="w-full py-3 rounded-md bg-n100 hover:bg-n100 text-n600 font-semibold text-xs transition-colors">
                            Kapat
                        </button>
                    )}
                </div>
            </div>
        </>
    );
}

// CREATE MODAL — Full Screen
// ─────────────────────────────────────────────────────────────
function PositionCreateModal({ onClose, onSubmit, departments, isDepartmentUser, userDepartments, isExtracting, onExtract, jdText, setJdText, initialData }) {
    const [formData, setFormData] = useState({
        title: '', department: isDepartmentUser ? (userDepartments?.[0] || '') : '', minExperience: '', reqItems: [], description: '',
        salaryMax: '', salaryCurrency: 'TRY', salaryPeriod: 'monthly', salaryBasis: 'gross',
        screeningEnabled: false, screeningQuestions: [''],
        // İK asistanının taslağı forma DOLU gelir; buradan sonrası normal
        // form akışı — düzenleme ve kaydetme kullanıcıda.
        ...(initialData || {}),
        // Departman kullanıcısı kendi departmanı dışına ilan açamaz; taslak
        // başka bir departman önerse bile bu kural bozulmaz.
        ...(isDepartmentUser ? { department: userDepartments?.[0] || '' } : {}),
    });
    const [suggestingQuestions, setSuggestingQuestions] = useState(false);
    const [improvingIdx, setImprovingIdx] = useState(null);

    const handleSuggestQuestions = async () => {
        if (suggestingQuestions) return;
        setSuggestingQuestions(true);
        try {
            const res = await fetch('/api/suggest-screening-questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
                body: JSON.stringify({
                    positionTitle: formData.title.trim() || 'Genel Pozisyon',
                    requirements: formData.requirements.trim() || '',
                }),
            });
            const data = await res.json();
            const qs = (data.questions || []).filter(q => q && q.trim());
            if (qs.length > 0) setFormData(p => ({ ...p, screeningEnabled: true, screeningQuestions: qs }));
        } catch (err) {
            console.error('Screening question suggestion error:', err);
        } finally {
            setSuggestingQuestions(false);
        }
    };

    const handleImproveQuestion = async (idx) => {
        const q = formData.screeningQuestions[idx]?.trim();
        if (!q || improvingIdx !== null) return;
        setImprovingIdx(idx);
        try {
            const res = await fetch('/api/improve-screening-question', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
                body: JSON.stringify({
                    question: q,
                    positionTitle: formData.title.trim() || 'Genel Pozisyon',
                    requirements: formData.requirements.trim() || '',
                }),
            });
            const data = await res.json();
            if (data.improved) {
                const next = [...formData.screeningQuestions];
                next[idx] = data.improved;
                setFormData(p => ({ ...p, screeningQuestions: next }));
            }
        } catch (err) {
            console.error('Improve question error:', err);
        } finally {
            setImprovingIdx(null);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(formData);
    };

    const descLen = formData.description.length;

    return (
        <div className="fixed inset-0 z-50 bg-n0 flex flex-col overflow-hidden">
            {/* HEADER */}
            <div className="px-8 py-3 border-b border-n200 flex items-center justify-between shrink-0 bg-n0 shadow-sm">
                <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-md bg-brand-50 border border-brand-100 flex items-center justify-center">
                        <Briefcase size={18} className="text-brand-600" />
                    </div>
                    <div>
                        <h2 className="text-[15px] font-semibold text-n900 leading-tight">Yeni Pozisyon Oluştur</h2>
                        <p className="text-[11px] text-n400 font-medium">Stratejik işe alım planlaması</p>
                    </div>
                </div>
                <button onClick={onClose} className="p-2.5 rounded-md hover:bg-n100 transition-colors text-n400 hover:text-n600">
                    <XCircle size={22} />
                </button>
            </div>

            {/* BODY: 3-column */}
            <div className="flex flex-1 overflow-hidden divide-x divide-n100">

                {/* COLUMN 1: AI Auto-fill */}
                <div className="w-80 shrink-0 flex flex-col from-brand-50/60 to-white overflow-y-auto p-6">
                    <div className="flex items-center gap-2 mb-3">
                        <Sparkles size={14} className="text-brand" />
                        <h3 className="text-[11px] font-semibold text-brand uppercase tracking-[0.08em]">AI ile Otomatik Doldur</h3>
                    </div>
                    <p className="text-[11px] text-n500 mb-3 leading-relaxed">İş ilanı metnini yapıştırın, AI tüm alanları otomatik dolduracak.</p>
                    <textarea
                        className="flex-1 min-h-[180px] bg-n0 border border-brand-100 rounded-[14px] p-3 text-sm text-n600 placeholder:text-n300 focus:outline-none focus:ring-2 focus:ring-brand-100 resize-none transition-all"
                        placeholder="İş ilanı metnini buraya yapıştırın... (en az 50 karakter)"
                        value={jdText}
                        onChange={(e) => setJdText(e.target.value)}
                    />
                    <div className="flex items-center justify-between mt-1 mb-3">
                        <p className="text-[10px] text-n400">{jdText.length} karakter</p>
                        {jdText.length >= 50 && <p className="text-[10px] text-ok font-semibold">Hazır ✓</p>}
                    </div>
                    <button
                        type="button"
                        onClick={() => onExtract(formData, setFormData)}
                        disabled={isExtracting || jdText.length < 50}
                        className="w-full bg-brand hover:bg-brand-600 text-white font-semibold text-xs py-3 rounded-md flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-none"
                    >
                        {isExtracting ? <><Loader2 size={14} className="animate-spin" />Analiz ediliyor...</> : <><Sparkles size={14} />Otomatik Doldur</>}
                    </button>
                    <div className="mt-5 space-y-2">
                        {['Pozisyon başlığı otomatik belirlenir', 'Gereksinimler listeye dönüştürülür', 'Departman tahmini yapılır', 'Kısa pozisyon özeti oluşturulur'].map(t => (
                            <div key={t} className="flex items-center gap-2">
                                <CheckCircle2 size={12} className="text-ok shrink-0" />
                                <span className="text-[11px] text-n500">{t}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* COLUMN 2: Position Details */}
                <form id="create-pos-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8">
                    <h3 className="text-[11px] font-semibold text-n400 uppercase tracking-[0.08em] mb-5">Pozisyon Bilgileri</h3>
                    <div className="space-y-5">
                        <Field label="Pozisyon Adı *">
                            <input
                                type="text" required
                                placeholder="ör. Senior React Developer, Ürün Müdürü..."
                                value={formData.title}
                                onChange={e => setFormData(p => ({ ...p, title: e.target.value }))}
                                className={INPUT_CLS}
                            />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Departman *">
                                {isDepartmentUser ? (
                                    <input type="text" disabled value={userDepartments?.[0] || ''} className={INPUT_CLS + ' opacity-60 cursor-not-allowed'} />
                                ) : (
                                    <select required value={formData.department} onChange={e => setFormData(p => ({ ...p, department: e.target.value }))} className={INPUT_CLS + ' appearance-none cursor-pointer'}>
                                        <option value="" disabled>Departman seç...</option>
                                        {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                                    </select>
                                )}
                            </Field>
                            <Field label="Min. Tecrübe (yıl)">
                                <input
                                    type="number" min="0" placeholder="0"
                                    value={formData.minExperience}
                                    onChange={e => setFormData(p => ({ ...p, minExperience: e.target.value }))}
                                    className={INPUT_CLS}
                                />
                            </Field>
                        </div>
                        <SalaryBandFields formData={formData} setFormData={setFormData} inputCls={INPUT_CLS} />
                        <Field label="Gereksinimler">
                            <RequirementListEditor
                                items={formData.reqItems}
                                onChange={(reqItems) => setFormData(p => ({ ...p, reqItems }))}
                                title={formData.title}
                            />
                        </Field>
                        <Field label="Pozisyon Açıklaması">
                            <textarea
                                placeholder="Bu pozisyon neden açıldı? Ekibe nasıl katkı sağlayacak? (2-3 cümle)"
                                value={formData.description}
                                maxLength={320}
                                onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                                className={INPUT_CLS + ' h-28 resize-none'}
                            />
                            <div className="flex items-center justify-between mt-1">
                                <p className="text-[10px] text-n400">Kısa genel özet — tam iş ilanı değil</p>
                                <p className={`text-[10px] font-semibold ${descLen > 280 ? 'text-warn' : 'text-n400'}`}>{descLen}/320</p>
                            </div>
                        </Field>
                    </div>
                </form>

                {/* COLUMN 3: Screening Questions */}
                <div className="w-[400px] shrink-0 flex flex-col overflow-y-auto p-6 bg-n50/40">
                    <div className="flex items-center justify-between mb-1">
                        <div>
                            <h3 className="text-[11px] font-semibold text-n700 uppercase tracking-[0.08em]">Ön Eleme Soruları</h3>
                            <p className="text-[10px] text-n400 mt-0.5">Adaylar yanıtlar — AI otomatik skorlar</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setFormData(p => ({ ...p, screeningEnabled: !p.screeningEnabled }))}
                            className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${formData.screeningEnabled ? 'bg-brand' : 'bg-n200'}`}
                        >
                            <span className={`absolute top-0.5 w-4 h-4 bg-n0 rounded-full shadow transition-all ${formData.screeningEnabled ? 'left-5' : 'left-0.5'}`} />
                        </button>
                    </div>

                    {!formData.screeningEnabled ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center py-10">
                            <div className="w-14 h-14 rounded-[14px] bg-n100 flex items-center justify-center">
                                <CheckCircle2 size={24} className="text-n300" />
                            </div>
                            <p className="text-[12px] text-n400 font-medium">Ön eleme kapalı</p>
                            <p className="text-[11px] text-n300 max-w-[180px]">Açmak için yukarıdaki anahtarı kullanın</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2 mt-4">
                            <button
                                type="button"
                                onClick={handleSuggestQuestions}
                                disabled={suggestingQuestions}
                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md bg-brand-50 border border-brand-100 text-[11px] font-semibold text-brand hover:bg-brand-100 transition-colors disabled:opacity-50"
                            >
                                {suggestingQuestions ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                                {suggestingQuestions ? 'AI sorular oluşturuyor...' : 'AI ile 5 Soru Öner'}
                            </button>
                            <div className="space-y-3">
                                {formData.screeningQuestions.map((q, i) => (
                                    <div key={i} className="bg-n0 rounded-md border border-n200 p-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-semibold text-n400 uppercase tracking-[0.08em]">Soru {i + 1}</span>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => handleImproveQuestion(i)}
                                                    disabled={!q.trim() || improvingIdx !== null}
                                                    title="AI ile soruyu düzelt ve geliştir"
                                                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-ok-bg text-[11px] font-semibold text-ok-text hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    {improvingIdx === i ? <Loader2 size={9} className="animate-spin" /> : <Sparkles size={9} />}
                                                    AI Düzenle
                                                </button>
                                                {formData.screeningQuestions.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setFormData(p => ({ ...p, screeningQuestions: p.screeningQuestions.filter((_, j) => j !== i) }))}
                                                        className="p-0.5 text-bad hover:text-bad transition-colors"
                                                    >
                                                        <XCircle size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Sorunuzu buraya yazın veya AI önerisi ekleyin..."
                                            value={q}
                                            onChange={e => {
                                                const next = [...formData.screeningQuestions];
                                                next[i] = e.target.value;
                                                setFormData(p => ({ ...p, screeningQuestions: next }));
                                            }}
                                            className="w-full bg-n50 border border-n200 rounded-md px-3 py-2 text-[13px] text-n700 outline-none focus:border-brand focus:ring-1 focus:ring-brand-100 transition-all"
                                        />
                                    </div>
                                ))}
                            </div>
                            {formData.screeningQuestions.length < 8 && (
                                <button
                                    type="button"
                                    onClick={() => setFormData(p => ({ ...p, screeningQuestions: [...p.screeningQuestions, ''] }))}
                                    className="w-full py-2.5 rounded-md border-2 border-dashed border-n200 text-[11px] font-semibold text-n400 hover:border-brand-200 hover:text-brand transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <Plus size={12} /> Soru Ekle
                                </button>
                            )}
                            <div className="mt-2 bg-warn-bg border border-transparent rounded-md p-3">
                                <p className="text-[10px] text-warn font-semibold mb-1">AI Skorlama Aktif</p>
                                <p className="text-[10px] text-warn leading-relaxed">Adayların yanıtları Çok İyi / İyi / Fena Değil / Yetersiz olarak otomatik skorlanır.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* FOOTER */}
            <div className="px-8 py-3 border-t border-n200 bg-n0 flex items-center justify-between shrink-0">
                <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-md bg-n100 hover:bg-n100 text-n600 font-semibold text-sm transition-colors">
                    İptal
                </button>
                <button
                    type="submit"
                    form="create-pos-form"
                    className="px-8 py-2.5 bg-brand hover:bg-brand-600 text-white font-semibold text-sm uppercase tracking-[0.08em] rounded-md flex items-center gap-2 shadow-sm shadow-none transition-colors"
                >
                    <Send size={15} />{isDepartmentUser ? 'Talep Gönder' : 'Pozisyon Oluştur'}
                </button>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// EDIT MODAL
// ─────────────────────────────────────────────────────────────
function PositionEditModal({ pos, candidates, departments, isDepartmentUser, userDepartments, onClose, onSubmit, isExtracting, onExtract, jdText, setJdText }) {
    const [formData, setFormData] = useState({
        title: pos.title || '',
        department: pos.department || '',
        minExperience: pos.minExperience?.toString() || '0',
        salaryMax: pos.salaryBand?.max?.toString() || '',
        salaryCurrency: pos.salaryBand?.currency || 'TRY',
        salaryPeriod: pos.salaryBand?.period || 'monthly',
        salaryBasis: pos.salaryBand?.basis || 'gross',
        // İşaretlenmemiş eski ilanlarda maddeler zorunlu sayılır — formun
        // önceki davranışı da buydu (hepsi "olmazsa olmaz" kutusuna gelirdi).
        reqItems: requirementsOf(pos).map((r) => ({ text: r.text, must: r.must !== false })),
        description: pos.description || '',
    });
    const candidateCount = pos.matchedCandidates?.length || 0;
    const sc = STATUS_CONFIG[pos.status] || STATUS_CONFIG.closed;

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-n900/25 backdrop-blur-sm" onClick={onClose} />
            {/* GENİŞLİK EKRANA GÖRE.
                `max-w-3xl` (768px) bir OKUMA genişliği sınırı — uzun metni
                65-75 karakterde tutmak için doğru. Ama burada okunan bir metin
                değil, 16 alanlık bir FORM var. Kural forma uygulanınca 1600px
                ekranda modal %48 yer kaplıyor, geri kalanı örtü oluyor ve form
                dikey olarak 1.5 ekran uzuyordu.
                Ölçüm sonrası: gereksinim satırı 160px, bütçe kutuları 76px.
                Okuma genişliği kuralı yine çiğnenmiyor — genişlik kolonlara
                dağıtılıyor, tek bir satır uzamıyor. */}
            <div className="relative bg-n0 rounded-[14px] shadow-2xl border border-n200 w-full max-w-[min(1180px,92vw)] overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="px-8 py-5 border-b border-n200 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="bg-warn-bg border border-warn text-warn-text p-2 rounded-md">
                            <Edit2 size={18} />
                        </div>
                        <div>
                            <h2 className="text-[16px] font-semibold text-n900 leading-tight">Pozisyon Düzenle</h2>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-sm font-medium text-n500 truncate max-w-[200px]">{pos.title}</span>
                                <span className="text-[11px] font-semibold text-warn-text bg-warn-bg px-2 py-0.5 rounded-md shrink-0">Düzenleniyor</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-n400 hover:text-n600 hover:bg-n100 rounded-md transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Warning banner */}
                {candidateCount > 0 && (
                    <div className="mx-8 mt-5 px-4 py-3 rounded-[14px] bg-warn-bg border border-warn flex items-center gap-2 shrink-0">
                        <AlertCircle size={14} className="text-warn shrink-0" />
                        <span className="text-[11px] text-warn font-medium">
                            Bu pozisyona bağlı {candidateCount} aday etkilenebilir. Değişiklikleri kaydetmeden önce gözden geçirin.
                        </span>
                    </div>
                )}

                {/* Body */}
                {/* KOLONLAR EŞİT DEĞİL.
                    Sol kolon salt-okunur bir özet ("mevcut bilgiler") — üzerine
                    yazılacak değerleri hatırlatıyor, üzerinde işlem yapılmıyor.
                    Sağ kolon ise formun kendisi. Eşit bölünce, asıl iş yapılan
                    yarı modalın yarısıyla yetiniyordu.
                    Dar ekranda alt alta geçiyor; iki dar kolon hiç kimseye
                    yaramaz. */}
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.65fr)] lg:divide-x divide-n100 overflow-y-auto mt-2">

                    {/* Left: current info */}
                    <div className="p-6">
                        <p className="text-[10px] font-semibold text-n400 tracking-[0.08em] uppercase mb-4">MEVCUT BİLGİLER</p>
                        <div className="bg-n50 rounded-[14px] border border-n200 p-3.5 space-y-3">
                            {[
                                { label: 'Pozisyon', value: pos.title },
                                { label: 'Departman', value: pos.department },
                                { label: 'Tecrübe', value: `${pos.minExperience || 0} yıl+` },
                                { label: 'Adaylar', value: `${candidateCount} eşleşme` },
                            ].map(({ label, value }) => (
                                <div key={label} className="flex flex-col">
                                    <span className="text-[10px] text-n400 uppercase tracking-[0.08em] font-semibold mb-0.5">{label}</span>
                                    <span className="text-[12px] font-semibold text-n900">{value}</span>
                                </div>
                            ))}
                            <div className="flex flex-col">
                                <span className="text-[10px] text-n400 uppercase tracking-[0.08em] font-semibold mb-1">Durum</span>
                                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border w-fit ${sc.pill}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{sc.label}
                                </span>
                            </div>
                        </div>
                        {pos.requirements?.length > 0 && (
                            <div className="mt-5">
                                <p className="text-[10px] font-semibold text-n400 tracking-[0.08em] uppercase mb-2">MEVCUT GEREKSİNİMLER</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {pos.requirements.map(tag => (
                                        <span key={tag} className="px-2.5 py-1 rounded-md bg-n100 text-n600 text-[12px] font-semibold border border-n200">{tag}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right: edit form */}
                    <form onSubmit={handleSubmit} className="p-6 flex flex-col">
                        <p className="text-[10px] font-semibold text-n400 tracking-[0.08em] uppercase mb-4">DEĞİŞTİRİLECEK ALANLAR</p>

                        {/* Mevcut bir ilanı yeni bir metne göre güncellemek, alanları
                            elle yeniden yazmayı gerektiriyordu — AI doldurma yalnızca
                            pozisyon OLUŞTURMA ekranında vardı. */}
                        <details className="mb-4 rounded-[14px] border border-brand-100 bg-brand-50/50 overflow-hidden">
                            <summary className="cursor-pointer select-none px-4 py-2.5 flex items-center gap-2 text-[11px] font-semibold text-brand uppercase tracking-[0.08em]">
                                <Sparkles size={13} /> İlan metninden güncelle
                            </summary>
                            <div className="p-3 pt-0">
                                <textarea
                                    className="w-full min-h-[120px] bg-n0 border border-brand-100 rounded-md p-3 text-[11px] text-n600 placeholder:text-n300 focus:outline-none focus:ring-2 focus:ring-brand-100 resize-y"
                                    placeholder="Güncel ilan / aranan profil metnini buraya yapıştırın... (en az 50 karakter)"
                                    value={jdText}
                                    onChange={(e) => setJdText(e.target.value)}
                                />
                                <div className="flex items-center justify-between mt-1 mb-2">
                                    <p className="text-[10px] text-n400">{jdText.length} karakter</p>
                                    {jdText.length >= 50 && <p className="text-[10px] text-ok font-semibold">Hazır ✓</p>}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onExtract(formData, setFormData)}
                                    disabled={isExtracting || jdText.length < 50}
                                    className="w-full bg-brand hover:bg-brand-600 text-white font-semibold text-[11px] py-2.5 rounded-md flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {isExtracting ? <><Loader2 size={13} className="animate-spin" />Analiz ediliyor...</> : <><Sparkles size={13} />Alanları Doldur</>}
                                </button>
                                <p className="text-[10px] text-n400 mt-2">
                                    Alanlar dolduruluyor, kayıt otomatik değil — gözden geçirip
                                    &quot;Değişiklikleri Kaydet&quot; demeniz gerekir.
                                </p>
                            </div>
                        </details>
                        <div className="space-y-4 flex-1">
                            {/* KISA ALANLAR YAN YANA.
                                Hepsi tek sütunda alt alta duruyordu; kolon
                                genişleyince her biri 720px'e uzadı ve form
                                gereksiz yere uzun kaldı. Pozisyon adı, departman
                                ve tecrübe kısa değerler — yan yana durunca hem
                                daha az kaydırma hem daha okunur bir satır ölçüsü.
                                Bütçe bandı iki kolonu birden kaplıyor: kendi
                                içinde dört alt alanı var. */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field label="Pozisyon Adı">
                                    <input type="text" value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} className={INPUT_CLS} />
                                </Field>
                                <Field label="Departman">
                                    {isDepartmentUser ? (
                                        <input type="text" disabled value={userDepartments?.[0] || ''} className={INPUT_CLS + ' opacity-60 cursor-not-allowed'} />
                                    ) : (
                                        <select value={formData.department} onChange={e => setFormData(p => ({ ...p, department: e.target.value }))} className={INPUT_CLS + ' appearance-none cursor-pointer'}>
                                            {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                                        </select>
                                    )}
                                </Field>
                                <Field label="Min. Tecrübe (yıl)">
                                    <input type="number" min="0" value={formData.minExperience} onChange={e => setFormData(p => ({ ...p, minExperience: e.target.value }))} className={INPUT_CLS} />
                                </Field>
                                <div className="sm:col-span-2">
                                    <SalaryBandFields formData={formData} setFormData={setFormData} inputCls={INPUT_CLS} />
                                </div>
                            </div>
                            <Field label="Gereksinimler">
                                <RequirementListEditor
                                    items={formData.reqItems}
                                    onChange={(reqItems) => setFormData(p => ({ ...p, reqItems }))}
                                    title={formData.title}
                                />
                            </Field>
                            <Field label="Açıklama">
                                <textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} className={INPUT_CLS + ' h-20 resize-none'} />
                            </Field>
                        </div>
                        <div className="mt-6 flex gap-2 pt-4 border-t border-n200">
                            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-md bg-n100 hover:bg-n100 text-n600 font-semibold text-xs transition-colors">İptal</button>
                            <button type="submit" className="flex-1 py-3 rounded-md bg-brand hover:bg-brand-600 text-white font-semibold text-xs uppercase tracking-[0.08em] flex items-center justify-center gap-2 shadow-sm shadow-none transition-colors">
                                <CheckCircle2 size={14} />Değişiklikleri Kaydet
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

// Shared helpers
const INPUT_CLS = 'bg-n50 border border-n200 rounded-md px-4 py-2.5 text-sm text-n900 outline-none focus:border-brand focus:ring-2 focus:ring-brand-100 w-full transition-all';
function Field({ label, children }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-n600 uppercase tracking-wide">{label}</label>
            {children}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
export default function PositionsPage() {
    const { positions, loading, addPosition, addPositionRequest, approvePosition, rejectPosition, deletePosition, togglePositionStatus, updatePosition, positionDraft, setPositionDraft } = usePositions();
    const { enrichedCandidates, updateCandidate, setViewCandidateId } = useCandidates();
    const candidates = enrichedCandidates || [];
    const { isDepartmentUser, userDepartments, userProfile, user, role } = useAuth();
    const { addNotification } = useNotifications();

    const [searchTerm, setSearchTerm]           = useState('');
    const [statusFilter, setStatusFilter]       = useState('all');
    const [deptFilter, setDeptFilter]           = useState('all');
    const [detailPos, setDetailPos]             = useState(null);

    // İK asistanına sayfa bağlamını bildir: ilan detayı açıkken kullanıcı
    // "bu pozisyonda kaç aday…" diyebilsin, başlığı tekrar yazmak zorunda
    // kalmasın. Uygulamanın başka yerlerinde de kullanılan olay yöntemi.
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('assistant-context', {
            detail: detailPos ? { positionTitle: detailPos.title } : null,
        }));
    }, [detailPos]);
    const [createOpen, setCreateOpen]           = useState(false);
    const [editPos, setEditPos]                 = useState(null);
    const [releasingPosId, setReleasingPosId]   = useState(null);
    const [releaseLoading, setReleaseLoading]   = useState(false);
    const [departments, setDepartments]         = useState([]);
    const [jdText, setJdText]                   = useState('');
    const [isExtracting, setIsExtracting]       = useState(false);
    // Pozisyon içeriği değişince etkilenen adayların yeniden taranma ilerlemesi
    const [rescanProgress, setRescanProgress]   = useState(null); // {done,total}
    // Yeniden tarama diyaloğu: {position, previousTitle?, reason?}
    const [rescanTarget, setRescanTarget]       = useState(null);
    // ID of the row whose "more actions" overflow menu is currently open.
    // Only one row can have an open menu at a time. Click-outside closes it.
    const [openActionMenuId, setOpenActionMenuId] = useState(null);

    useEffect(() => {
        const close = () => setOpenActionMenuId(null);
        window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    }, []);

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'artifacts/talent-flow/public/data/departments'), (snap) => {
            setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return unsub;
    }, []);

    // Open a specific position detail when navigated from another page
    useEffect(() => {
        const handleOpenPosition = (e) => {
            const posId = e.detail?.positionId;
            if (!posId) return;
            const found = positions.find(p => p.id === posId);
            if (found) setDetailPos(found);
        };
        window.addEventListener('openPosition', handleOpenPosition);
        return () => window.removeEventListener('openPosition', handleOpenPosition);
    }, [positions]);

    // İK asistanından gelen ilan taslağı: form DOLU açılır ama kaydedilmez.
    // Kaydetme kararı kullanıcıda — asistan `positions` koleksiyonuna hiçbir
    // koşulda kendi başına yazmaz (2026-08-14 kullanıcı kararı).
    //
    // Taslak burada TÜKETİLİR: temizlenmezse kullanıcı formu kapatıp "Yeni
    // Pozisyon"a bastığında eski taslak yeniden karşısına çıkar.
    const draftSeed = useRef(null);
    useEffect(() => {
        if (!positionDraft) return;
        draftSeed.current = positionDraft;
        setCreateOpen(true);
        setPositionDraft(null);
    }, [positionDraft, setPositionDraft]);

    const handleToggleStatus = async (id, currentStatus) => {
        const positionTitle = positions.find(p => p.id === id)?.title || 'Pozisyon';
        await togglePositionStatus(id, currentStatus);
        const newStatus = currentStatus === 'open' ? 'closed' : 'open';
        addNotification({
            title: newStatus === 'closed' ? 'Pozisyon Kapatıldı' : 'Pozisyon Yeniden Açıldı',
            message: `"${positionTitle}" pozisyonu ${newStatus === 'closed' ? 'kapatıldı' : 'aktif duruma alındı'}.`,
            type: newStatus === 'closed' ? 'warning' : 'success'
        });
    };

    const handleExtract = async (formData, setFormData) => {
        if (!jdText || jdText.length < 50) return;
        setIsExtracting(true);
        try {
            const result = await extractPositionFromJD(jdText);
            setFormData(p => ({
                ...p,
                title: result.title || p.title,
                department: isDepartmentUser ? (userDepartments?.[0] || '') : (result.department || p.department),
                minExperience: result.minExperience?.toString() || p.minExperience,
                reqItems: (result.requirements || []).length > 0
                    ? result.requirements.map((t) => ({ text: t, must: true }))
                    : p.reqItems,
                description: result.description ? result.description.slice(0, 320) : p.description,
            }));
        } catch (err) {
            console.error('Extraction error:', err);
            alert('Ayrıştırma sırasında bir hata oluştu: ' + err.message);
        } finally {
            setIsExtracting(false);
        }
    };

    const handleCreate = async (formData) => {
        if (!formData.title || !formData.department) return;
        // requirementsMeta kaynak; düz `requirements` ondan türetilir ve
        // yazılmaya devam eder (Excel, eski okuyucular, AI ilan metni).
        // Liste zaten kaynak biçimde: [{text, must}]. İki kutuyu birleştiren
        // ara adım kalktı.
        const meta = (formData.reqItems || [])
            .map((r) => ({ text: String(r?.text || '').trim(), must: Boolean(r?.must) }))
            .filter((r) => r.text)
            .slice(0, 30);
        const reqs = meta.map((r) => r.text);
        const positionObj = { ...formData, requirements: reqs, requirementsMeta: meta };
        // Domain-filter first: only score candidates in the same job domain
        const domainCandidates = filterCandidatesByDomain(positionObj, candidates);
        const matchedCandidates = domainCandidates
            .map(c => ({ ...c, match: calculateMatchScore(c, positionObj) }))
            .filter(c => c.match.score >= 50)
            .sort((a, b) => b.match.score - a.match.score)
            .slice(0, 10)
            .map(c => ({ id: c.id, name: c.name, score: c.match.score, reason: c.match.score >= 70 ? 'Yüksek Uyumluluk' : 'Potansiyel Eşleşme' }));

        const cleanedQuestions = (formData.screeningQuestions || []).map(q => q.trim()).filter(Boolean);
        const newPos = {
            title: formData.title, department: formData.department,
            description: formData.description || '',
            minExperience: parseInt(formData.minExperience) || 0,
            // Bütçe bandı: adayın beklentisiyle karşılaştırmanın BİR ucu.
            // normalizeBand null dönerse alan hiç yazılmaz — boş bir band
            // yazmak, tanımlanmamış bütçeyi tanımlanmış gibi gösterirdi.
            salaryBand: normalizeBand({ max: formData.salaryMax, currency: formData.salaryCurrency, period: formData.salaryPeriod, basis: formData.salaryBasis }),
            requirements: reqs, requirementsMeta: meta, matchedCandidates,
            screeningEnabled: formData.screeningEnabled && cleanedQuestions.length > 0,
            screeningQuestions: cleanedQuestions,
        };
        if (isDepartmentUser) {
            await addPositionRequest(newPos, { uid: user?.uid, email: userProfile?.email, displayName: userProfile?.displayName, department: userDepartments?.[0] || '' });
            alert('✅ Pozisyon talebiniz gönderildi.');
        } else {
            await addPosition(newPos);
        }
        setCreateOpen(false);
        setJdText('');
        draftSeed.current = null;
    };

    const handleUpdate = async (formData) => {
        if (!editPos) return;
        // Liste zaten kaynak biçimde: [{text, must}]. İki kutuyu birleştiren
        // ara adım kalktı.
        const meta = (formData.reqItems || [])
            .map((r) => ({ text: String(r?.text || '').trim(), must: Boolean(r?.must) }))
            .filter((r) => r.text)
            .slice(0, 30);
        const reqs = meta.map((r) => r.text);
        const previousTitle = editPos.title;
        const nextPosition = {
            title: formData.title,
            department: formData.department,
            minExperience: parseInt(formData.minExperience) || 0,
            // Bütçe bandı: adayın beklentisiyle karşılaştırmanın BİR ucu.
            // normalizeBand null dönerse alan hiç yazılmaz — boş bir band
            // yazmak, tanımlanmamış bütçeyi tanımlanmış gibi gösterirdi.
            salaryBand: normalizeBand({ max: formData.salaryMax, currency: formData.salaryCurrency, period: formData.salaryPeriod, basis: formData.salaryBasis }),
            requirements: reqs,
            requirementsMeta: meta,
            description: formData.description || '',
        };

        // İçerik gerçekten değişti mi? Yalnızca departman/isim düzeltmesi
        // yapıldığında adayları yeniden taramaya gerek yok. Zorunlu/tercihen
        // işaretlemesinin değişmesi de skoru etkiler — o da içerik sayılır.
        const contentChanged =
            previousTitle !== nextPosition.title
            || (editPos.description || '') !== nextPosition.description
            || JSON.stringify(editPos.requirements || []) !== JSON.stringify(reqs)
            || JSON.stringify(editPos.requirementsMeta || []) !== JSON.stringify(meta);

        await updatePosition(editPos.id, nextPosition);
        setEditPos(null);
        setDetailPos(null);

        if (!contentChanged) {
            alert('✅ Pozisyon güncellendi.');
            return;
        }

        // Kayıtlı analizler ARTIK ESKİ metne ait — skorları olduğu gibi
        // göstermek yanıltıcı. Kullanıcı eşik verip hangi adayların
        // yeniden taranacağına karar verir.
        setRescanTarget({
            position: { ...editPos, ...nextPosition },
            previousTitle,
            reason: 'Gereksinimler değişti — bu pozisyon için kayıtlı aday analizleri artık eski metne ait.',
        });
    };

    // Bu pozisyonla ilgili adaylar: analizi olanlar, pozisyona atananlar VE
    // alanı pozisyonla uyumlu olanlar.
    //
    // Yalnızca "analizi olanlar" ile sınırlıyken, bu pozisyon için hiç
    // taranmamış adaylar — yani tam da değerlendirilmek istenenler —
    // listeye hiç girmiyordu. Eşik zaten kaç adayın taranacağını kontrol
    // ediyor, havuzu dar tutmanın faydası yok.
    const candidatesForPosition = (position, previousTitle) => {
        const related = new Set(
            filterCandidatesByDomain(position, enrichedCandidates).map((c) => c.id)
        );
        return enrichedCandidates.filter(
            (c) => related.has(c.id)
                || hasAnalysisForPosition(c, position.title)
                || (previousTitle && hasAnalysisForPosition(c, previousTitle))
                || c.positionId === position.id
        );
    };

    /**
     * Öneriyi ilana uygula.
     *
     * Danışman iki şey döndürüyor: yeni metin ve bir KARAR (yeniden-yaz /
     * tercihene-al / kaldır). İlk sürüm yalnızca metni değiştiriyordu, karar
     * uygulanmıyordu — "tercihene al" önerisinden sonra madde zorunlu kalıyor,
     * "kaldır" önerisinden sonra madde ilanda duruyordu. Kullanıcı haklı olarak
     * "öneriyi uygulamıyor" dedi. Kararı da uyguluyoruz.
     *
     * Uyguladıktan SONRA yeniden tarama akışı açılır. Bu şart: kayıtlı aday
     * analizleri eski metne ait ve tazelenmezse panel aynı bulguyu — dolayısıyla
     * aynı öneriyi — tekrar üretir.
     */
    /**
     * Gereksinim sözlüğünü üret ve ilana yaz.
     *
     * Bir kez üretilip saklanıyor: her açılışta yeniden üretmek hem pahalı
     * hem de tutarsız olurdu. Parmak izi damgalandığı için gereksinim metni
     * değişince eskidiği görünür.
     */
    const handleBuildGlossary = async (position) => {
        if (!position?.id) return;
        const entries = await buildRequirementGlossary(position);
        if (entries.length === 0) throw new Error('Sözlük üretilemedi, tekrar deneyin.');
        const record = buildGlossaryRecord(position, entries, new Date().toISOString());
        await updatePosition(position.id, { requirementGlossary: record });
        setDetailPos((prev) => (prev?.id === position.id ? { ...prev, requirementGlossary: record } : prev));
    };

    const handleApplySuggestions = async (position, reviews) => {
        const plan = planRequirementChanges(position, reviews);
        if (!plan) return null;
        if (!window.confirm(plan.confirmText)) return null;

        await updatePosition(position.id, plan.updates);
        // Panel AÇIK kalır ve güncel gereksinimlerle yeniden çizilir; tarama
        // ayrı bir adım. Eskiden uygulama anında drawer kapanıp tarama ekranı
        // açılıyordu, üç öneri gelen ilanda kullanıcı öneriyi üç kez baştan
        // istemek zorunda kalıyordu.
        setDetailPos(plan.nextPosition);
        return plan;
    };

    const runRescan = async (selectedCandidates) => {
        const { position, previousTitle } = rescanTarget || {};
        if (!position || !selectedCandidates?.length) return;
        setRescanProgress({ done: 0, total: selectedCandidates.length });
        let scanned = 0, skipped = 0, failed = 0;
        // İlk teknik hatanın metni: "atlandı" ile "AI patladı" ayrımı
        // yapılmadığında kullanıcı kota aşımını CV eksikliği sanıyordu.
        let firstFailure = '';
        let nextIdx = 0;
        await Promise.all(Array.from({ length: Math.min(3, selectedCandidates.length) }, async () => {
            while (nextIdx < selectedCandidates.length) {
                const candidate = selectedCandidates[nextIdx];
                nextIdx += 1;
                try {
                    const result = await rescanCandidateForPosition(candidate, position, { previousTitle });
                    if (result.status === 'scanned') { await updateCandidate(candidate.id, result.updates); scanned += 1; }
                    else if (result.status === 'analysis_failed') {
                        failed += 1;
                        if (!firstFailure) firstFailure = result.failures?.[0]?.message || '';
                    } else skipped += 1;
                } catch (err) {
                    failed += 1;
                    if (!firstFailure) firstFailure = err?.message || '';
                }
                setRescanProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
            }
        }));
        setRescanProgress(null);
        setRescanTarget(null);
        addNotification({
            title: 'Yeniden Tarama Tamamlandı',
            message: `${scanned} aday yeni gereksinimlere göre yeniden puanlandı`
                + (skipped > 0 ? ` · ${skipped} aday atlandı (CV metni yok/sonuç alınamadı)` : '')
                + (failed > 0 ? ` · ${failed} adayda AI hatası: ${firstFailure.slice(0, 120)}` : ''),
            type: failed > 0 ? 'warning' : 'success',
        });
    };

    const handleRelease = async (pos) => {
        if (!pos.department) return alert('Bu pozisyonun departman bilgisi yok.');
        setReleasingPosId(pos.id);
        setReleaseLoading(true);
        try {
            const matches = candidates
                .map(c => { const ps = analysisScoreFor(c, pos); const ms = calculateMatchScore(c, pos).score; return { ...c, effectiveScore: Math.max(ps, ms) }; })
                .filter(c => c.effectiveScore >= 60)
                .sort((a, b) => b.effectiveScore - a.effectiveScore);
            if (!matches.length) { alert('Uygun aday bulunamadı. Önce adayları analiz edin.'); return; }
            let released = 0;
            for (const c of matches) {
                const cur = c.visibleToDepartments || [];
                if (!cur.includes(pos.department)) { await updateCandidate(c.id, { visibleToDepartments: [...cur, pos.department] }); released++; }
            }
            // Build matchedCandidates list so the detail drawer can display them for dept users
            const matchedCandidates = matches.map(c => ({
                id: c.id,
                name: c.name || '—',
                score: c.effectiveScore,
                reason: c.positionAnalyses?.[pos.title]?.summary || `%${c.effectiveScore} eşleşme`,
            }));
            await updatePosition(pos.id, { releasedToDepartment: true, matchedCandidates });
            alert(`✅ ${released} aday "${pos.department}" departmanına açıldı.`);
        } catch (err) { alert('Bir hata oluştu: ' + err.message); }
        finally { setReleasingPosId(null); setReleaseLoading(false); }
    };

    const isRecruiterOrAdmin = role === 'recruiter' || role === 'super_admin';
    const pendingCount = positions.filter(p => p.status === 'pending_approval').length;
    const allDepts = useMemo(() => Array.from(new Set(positions.map(p => p.department).filter(Boolean))), [positions]);

    const visiblePositions = useMemo(() => {
        let f = positions;
        if (isDepartmentUser && userDepartments?.length) f = f.filter(p => userDepartments.includes(p.department));
        if (searchTerm) f = f.filter(p => p.title?.toLowerCase().includes(searchTerm.toLowerCase()) || p.department?.toLowerCase().includes(searchTerm.toLowerCase()));
        if (statusFilter !== 'all') f = f.filter(p => p.status === statusFilter);
        if (deptFilter !== 'all') f = f.filter(p => p.department === deptFilter);
        return f;
    }, [positions, isDepartmentUser, userDepartments, searchTerm, statusFilter, deptFilter]);

    const statusCounts = useMemo(() => ({
        all: positions.length, open: positions.filter(p => p.status === 'open').length,
        pending_approval: positions.filter(p => p.status === 'pending_approval').length,
        closed: positions.filter(p => p.status === 'closed').length,
    }), [positions]);

    return (
        <div className="infoset min-h-screen flex flex-col">
            <Header title="Pozisyon Bankası" />

            {/* Gereksinimler değişince etkilenen adaylar yeniden taranırken —
                işlem sayfadan ayrılınca durur, bu yüzden görünür tutulur. */}
            {rescanProgress && (
                <div className="mx-6 mt-4 px-5 py-3 rounded-[14px] border border-brand-200 bg-brand-50 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-brand animate-spin shrink-0" />
                    <p className="text-sm font-semibold text-brand-700">
                        Adaylar yeni gereksinimlere göre yeniden taranıyor — {rescanProgress.done} / {rescanProgress.total}
                    </p>
                    <span className="text-[11px] text-brand">Bu sayfadan ayrılmayın</span>
                </div>
            )}

            {/* Pending banner */}
            {isRecruiterOrAdmin && pendingCount > 0 && (
                <div className="mx-6 mt-4 px-5 py-3 rounded-[14px] border border-warn bg-warn-bg flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-warn" />
                        <p className="text-sm font-semibold text-warn">{pendingCount} pozisyon talebi onayınızı bekliyor.</p>
                    </div>
                    <button onClick={() => setStatusFilter('pending_approval')} className="px-3 py-1.5 rounded-md bg-warn-bg text-warn-text text-xs font-semibold hover:opacity-80">
                        Talepleri Gör
                    </button>
                </div>
            )}

            {/* Body */}
            <div className="flex flex-1 min-h-0 mt-4 mx-6 mb-8 gap-5">

                {/* Sidebar */}
                <aside className="w-[220px] shrink-0 bg-n0 rounded-[14px] border border-n200 shadow-sm flex flex-col py-5 px-4">
                    <p className="text-[10px] font-semibold text-n400 tracking-[0.08em] uppercase mb-2 px-1">DURUM</p>
                    <div className="flex flex-col gap-0.5 mb-4">
                        {[
                            { key: 'all', label: 'Tümü', count: statusCounts.all },
                            { key: 'open', label: 'Aktif', count: statusCounts.open, badge: 'text-ok bg-ok-bg' },
                            { key: 'pending_approval', label: 'Bekleyen', count: statusCounts.pending_approval, badge: 'text-warn bg-warn-bg' },
                            { key: 'closed', label: 'Kapalı', count: statusCounts.closed, badge: 'text-n400 bg-n100' },
                        ].map(({ key, label, count, badge }) => (
                            <button key={key} onClick={() => setStatusFilter(key)} className={`flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-all border ${statusFilter === key ? 'bg-brand-50 border-brand-100 text-brand' : 'border-transparent text-n500 hover:bg-n50'}`}>
                                <span className="flex items-center gap-2">{statusFilter === key && <span className="w-1.5 h-1.5 rounded-full bg-brand" />}{label}</span>
                                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${badge || (statusFilter === key ? 'bg-brand-100 text-brand' : 'bg-n100 text-n400')}`}>{count}</span>
                            </button>
                        ))}
                    </div>
                    <div className="border-t border-n200 my-2" />
                    <p className="text-[10px] font-semibold text-n400 tracking-[0.08em] uppercase mb-2 px-1 mt-2">DEPARTMAN</p>
                    <div className="flex flex-col gap-0.5 overflow-y-auto flex-1 pb-2">
                        {[{ key: 'all', label: 'Tüm Departmanlar' }, ...allDepts.map(d => ({ key: d, label: d, count: positions.filter(p => p.department === d).length }))].map(({ key, label, count }) => (
                            <button key={key} onClick={() => setDeptFilter(key)} className={`flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-all border ${deptFilter === key ? 'bg-brand-50 border-brand-100 text-brand' : 'border-transparent text-n500 hover:bg-n50'}`}>
                                <span className="flex items-center gap-2">{deptFilter === key && <span className="w-1.5 h-1.5 rounded-full bg-brand" />}<span className="truncate">{label}</span></span>
                                {count !== undefined && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md bg-n100 text-n400">{count}</span>}
                            </button>
                        ))}
                    </div>
                    {/* Sidebar footer "AI eşleştirme aktif" pill removed.
                        The same status indicator is rendered in the table
                        footer (Cpu icon + "Eşleştirme aktif") just below;
                        keeping it twice on a single page was decoration. */}
                </aside>

                {/* Main */}
                <div className="flex-1 min-w-0 flex flex-col bg-n0 rounded-[14px] border border-n200 shadow-sm overflow-hidden">

                    {/* Top bar */}
                    <div className="px-7 py-3 border-b border-n200 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-semibold text-n900 tracking-tight">{isDepartmentUser ? `${userDepartments?.join(', ')} Pozisyonları` : 'Pozisyon Portföyü'}</h1>
                            <span className="rounded-full bg-n100 text-n400 text-[12px] px-2 py-0.5 font-semibold">{visiblePositions.length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-n400" />
                                <input type="text" placeholder="Pozisyon veya departman ara..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-56 bg-n50 border border-n200 rounded-md pl-9 pr-3 py-2 text-sm text-n700 placeholder-n400 outline-none focus:border-brand focus:ring-2 focus:ring-brand-100 transition-all" />
                            </div>
                            <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-brand hover:bg-brand-600 text-white font-semibold text-xs shadow-sm shadow-none transition-colors">
                                <Plus className="w-3.5 h-3.5" />{isDepartmentUser ? 'Pozisyon Talebi' : 'Yeni Pozisyon'}
                            </button>
                        </div>
                    </div>

                    {/* Table header */}
                    <div className="px-7 pt-4 pb-2 shrink-0">
                        <div className="grid grid-cols-[2fr_0.8fr_0.8fr_0.9fr_1.2fr_auto] gap-3 text-[10px] font-semibold text-n400 uppercase tracking-[0.08em] border-b border-n200 pb-2 px-4">
                            <div>POZİSYON / DEPARTMAN</div><div>ADAYLAR</div><div>TECRÜBE</div><div>DURUM</div><div>UYUM SKORU</div><div>İŞLEMLER</div>
                        </div>
                    </div>

                    {/* Rows */}
                    <div className="px-7 pb-6 space-y-2 overflow-y-auto flex-1">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-24 gap-2">
                                <Loader2 className="w-8 h-8 animate-spin text-brand" />
                                <p className="text-xs font-semibold text-n400 uppercase tracking-[0.08em]">Yükleniyor...</p>
                            </div>
                        ) : visiblePositions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-24 gap-3">
                                <div className="w-14 h-14 rounded-[14px] bg-n100 flex items-center justify-center"><Briefcase className="w-6 h-6 text-n300" /></div>
                                <p className="text-sm font-semibold text-n400">{statusFilter === 'pending_approval' ? 'Bekleyen talep yok' : 'Pozisyon bulunamadı'}</p>
                                <button onClick={() => setCreateOpen(true)} className="px-5 py-2.5 rounded-md bg-n100 hover:bg-n100 text-n600 text-xs font-semibold transition-all">
                                    {isDepartmentUser ? 'İlk Talebi Oluştur' : 'İlk Pozisyonu Oluştur'}
                                </button>
                            </div>
                        ) : visiblePositions.map((pos) => {
                            const sc = STATUS_CONFIG[pos.status] || STATUS_CONFIG.closed;
                            const isPending = pos.status === 'pending_approval';
                            const isRejected = pos.status === 'rejected';
                            const candidateCount = candidates.filter(c => c.position === pos.title || c.matchedPositionTitle === pos.title || c.bestTitle === pos.title).length;
                            const avgScore = pos.matchedCandidates?.length > 0 ? Math.round(pos.matchedCandidates.reduce((a, c) => a + c.score, 0) / pos.matchedCandidates.length) : null;

                            return (
                                <div key={pos.id} className="rounded-[14px] border border-n200 hover:border-brand-100 hover:shadow-sm transition-all bg-n0">
                                    {isPending && (
                                        <div className="mx-4 mt-4 px-4 py-2 rounded-md bg-warn-bg border border-warn flex items-center gap-2 text-xs text-warn-text font-semibold">
                                            <Clock className="w-3.5 h-3.5" />{pos.requestedBy?.displayName || 'Departman kullanıcısı'} tarafından talep edildi
                                        </div>
                                    )}
                                    {isRejected && pos.rejectionReason && (
                                        <div className="mx-4 mt-4 px-4 py-2 rounded-md bg-bad-bg border border-transparent flex items-center gap-2 text-xs text-bad-text font-semibold">
                                            <XCircle className="w-3.5 h-3.5" />Red: {pos.rejectionReason}
                                        </div>
                                    )}

                                    <div
                                        className="px-4 py-3 grid grid-cols-[2fr_0.8fr_0.8fr_0.9fr_1.2fr_auto] gap-3 items-center cursor-pointer"
                                        onClick={() => setDetailPos(pos)}
                                    >
                                        {/* Col 1 */}
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-n900 truncate mb-1 hover:text-brand transition-colors">{pos.title}</div>
                                            <span className="rounded-full bg-n100 text-n500 text-[11px] px-2 py-0.5 font-medium">{pos.department}</span>
                                        </div>
                                        {/* Col 2 */}
                                        <div>
                                            <div className="text-lg font-semibold text-n900 leading-none">{candidateCount}</div>
                                            <div className="text-[10px] text-n400 mt-0.5">aday</div>
                                        </div>
                                        {/* Col 3 */}
                                        <div>
                                            <div className="font-semibold text-n900 leading-none">{pos.minExperience || 0} yıl+</div>
                                            <div className="text-[10px] text-n400 mt-0.5">min.</div>
                                        </div>
                                        {/* Col 4 */}
                                        <div>
                                            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${sc.pill}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{sc.label}
                                            </span>
                                        </div>
                                        {/* Col 5 */}
                                        <div className="pr-2">
                                            {pos.status === 'open' && avgScore ? (
                                                <>
                                                    <div className="font-semibold text-brand text-[16px] leading-none mb-1.5">{avgScore}%</div>
                                                    <div className="h-1 w-full bg-n100 rounded-full overflow-hidden">
                                                        <div className="h-full from-brand to-brand rounded-full" style={{ width: `${avgScore}%` }} />
                                                    </div>
                                                </>
                                            ) : <span className="text-n300 text-sm">—</span>}
                                        </div>
                                        {/* Col 6 — stop propagation so clicks don't open drawer */}
                                        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                            {pos.status === 'open' && <>
                                                {/* Visible primary actions:
                                                    - Departmana Aç (recruiter/admin yalnız)
                                                    - Düzenle
                                                    Destructive actions (Kapat, Sil) live in the
                                                    "..." overflow menu so the row doesn't surface
                                                    four icon buttons at once. */}
                                                {isRecruiterOrAdmin && (
                                                    <button onClick={() => handleRelease(pos)} disabled={releaseLoading && releasingPosId === pos.id} className={`p-1.5 rounded-md border transition-colors ${pos.releasedToDepartment ? 'bg-ok-bg border-transparent text-ok-text' : 'bg-brand-50 border-brand-100 text-brand hover:bg-brand-100'}`} title="Departmana Aç">
                                                        {releaseLoading && releasingPosId === pos.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                                                    </button>
                                                )}
                                                <button onClick={() => setEditPos(pos)} className="p-1.5 rounded-md bg-n50 border border-n200 text-n400 hover:bg-warn-bg hover:border-warn hover:text-warn-text transition-colors" title="Düzenle"><Edit2 className="w-4 h-4" /></button>

                                                {/* Overflow menu: Kapat + Sil */}
                                                <div className="relative">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setOpenActionMenuId(openActionMenuId === pos.id ? null : pos.id); }}
                                                        className="p-1.5 rounded-md bg-n50 border border-n200 text-n400 hover:bg-n100 hover:text-n600 transition-colors"
                                                        title="Daha fazla"
                                                        aria-haspopup="menu"
                                                        aria-expanded={openActionMenuId === pos.id}
                                                    >
                                                        <MoreHorizontal className="w-4 h-4" />
                                                    </button>
                                                    {openActionMenuId === pos.id && (
                                                        <div role="menu" className="absolute right-0 top-full mt-1 w-44 bg-n0 rounded-md shadow-2xl border border-n200 z-50 overflow-hidden py-1">
                                                            <button
                                                                role="menuitem"
                                                                onClick={() => { setOpenActionMenuId(null); handleToggleStatus(pos.id, pos.status); }}
                                                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-n50 transition-colors text-left text-[11px] text-n700"
                                                            >
                                                                <XCircle className="w-3.5 h-3.5 text-n400 shrink-0" />
                                                                <span>Pozisyonu Kapat</span>
                                                            </button>
                                                            <button
                                                                role="menuitem"
                                                                onClick={() => { setOpenActionMenuId(null); deletePosition(pos.id); }}
                                                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-bad-bg transition-colors text-left text-[11px] text-bad-text"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                                                <span>Sil</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </>}
                                            {isPending && isRecruiterOrAdmin && <>
                                                <button onClick={() => { if (window.confirm('Onaylamak istiyor musunuz?')) approvePosition(pos.id); }} className="p-1.5 rounded-md bg-ok-bg text-ok-text hover:opacity-80" title="Onayla"><CheckCircle2 className="w-4 h-4" /></button>
                                                <button onClick={() => { const r = prompt('Red nedeni:'); if (r !== null) rejectPosition(pos.id, r); }} className="p-1.5 rounded-md bg-bad-bg border border-transparent text-bad-text hover:opacity-90 transition-colors" title="Reddet"><XCircle className="w-4 h-4" /></button>
                                            </>}
                                            {isRejected && isRecruiterOrAdmin && (
                                                <button onClick={() => deletePosition(pos.id)} className="p-1.5 rounded-md bg-bad-bg border border-transparent text-bad-text hover:opacity-90 transition-colors" title="Sil"><Trash2 className="w-4 h-4" /></button>
                                            )}
                                            {pos.status === 'closed' && isRecruiterOrAdmin && (
                                                <>
                                                    <button onClick={() => handleToggleStatus(pos.id, pos.status)} className="p-1.5 rounded-md bg-ok-bg text-ok-text hover:opacity-80" title="Yeniden Aç"><RefreshCw className="w-4 h-4" /></button>
                                                    <button onClick={() => deletePosition(pos.id)} className="p-1.5 rounded-md bg-n50 border border-n200 text-n400 hover:bg-bad-bg hover:border-transparent hover:text-bad-text transition-colors" title="Sil"><Trash2 className="w-4 h-4" /></button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div className="px-7 py-3 border-t border-n200 bg-n50 flex items-center justify-between shrink-0">
                        <p className="text-xs text-n400 font-medium">{visiblePositions.length} pozisyon gösteriliyor</p>
                        <div className="flex items-center gap-1"><Cpu className="w-3 h-3 text-brand" /><span className="text-[10px] text-n400">Eşleştirme aktif</span></div>
                    </div>
                </div>
            </div>

            {/* ── MODALS & DRAWERS ── */}
            {createOpen && (
                <PositionCreateModal
                    initialData={draftSeed.current}
                    onClose={() => { setCreateOpen(false); setJdText(''); draftSeed.current = null; }}
                    onSubmit={handleCreate}
                    departments={departments}
                    isDepartmentUser={isDepartmentUser}
                    userDepartments={userDepartments}
                    isExtracting={isExtracting}
                    onExtract={handleExtract}
                    jdText={jdText}
                    setJdText={setJdText}
                />
            )}

            {editPos && (
                <PositionEditModal
                    pos={editPos}
                    candidates={candidates}
                    departments={departments}
                    isDepartmentUser={isDepartmentUser}
                    userDepartments={userDepartments}
                    onClose={() => { setEditPos(null); setJdText(''); }}
                    onSubmit={handleUpdate}
                    isExtracting={isExtracting}
                    onExtract={handleExtract}
                    jdText={jdText}
                    setJdText={setJdText}
                />
            )}

            {detailPos && !editPos && (
                <PositionDetailDrawer
                    pos={detailPos}
                    candidates={candidates}
                    onClose={() => setDetailPos(null)}
                    onEdit={() => { setEditPos(detailPos); setDetailPos(null); }}
                    onRelease={() => handleRelease(detailPos)}
                    onToggleStatus={() => handleToggleStatus(detailPos.id, detailPos.status)}
                    onDelete={() => { deletePosition(detailPos.id); setDetailPos(null); }}
                    isRecruiterOrAdmin={isRecruiterOrAdmin}
                    releaseLoading={releaseLoading}
                    releasingPosId={releasingPosId}
                    onCandidateClick={(c) => {
                        setViewCandidateId(c.id);
                        window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }));
                    }}
                    onRescan={() => setRescanTarget({ position: detailPos })}
                    onApplySuggestions={(reviews) => handleApplySuggestions(detailPos, reviews)}
                    onBuildGlossary={() => handleBuildGlossary(detailPos)}
                    onRescanAfterEdit={() => {
                        setDetailPos(null);
                        setRescanTarget({
                            position: detailPos,
                            reason: 'Gereksinimler değişti — kayıtlı aday analizleri artık eski metne ait.',
                        });
                    }}
                />
            )}

            {/* Yeniden tarama: hem ilan kaydedildikten sonra hem de ilan
                detayından açılır; eşiği kullanıcı belirler. */}
            <RescanPositionModal
                // Diyalog kapanınca unmount OLMUYOR (isOpen ile gizleniyor),
                // bu yüzden seçim ve arama bir sonraki ilana taşınırdı. Anahtar
                // değişince bileşen sıfırdan kurulur — senkronizasyon effect'i
                // yazmaktan daha güvenli.
                key={rescanTarget?.position?.id || 'none'}
                position={rescanTarget?.position}
                candidates={rescanTarget ? candidatesForPosition(rescanTarget.position, rescanTarget.previousTitle) : []}
                // Arama kutusu TÜM havuzu görsün: "bence bu aday bu ilana uyar"
                // diyen kullanıcı, sistemin alan filtresini ezebilmeli.
                allCandidates={enrichedCandidates}
                isOpen={Boolean(rescanTarget)}
                running={Boolean(rescanProgress)}
                progress={rescanProgress}
                reason={rescanTarget?.reason}
                onClose={() => { if (!rescanProgress) setRescanTarget(null); }}
                onStart={runRescan}
            />
        </div>
    );
}

/**
 * Bütçe bandı alanları.
 *
 * Para birimi ve dönem ZORUNLU olarak seçili gelir: "120000" tek başına yarım
 * bir ölçüm ve iki yarım ölçümü karşılaştırmak bütçe kararını yanlış verdirir.
 * Boş bırakılırsa band hiç yazılmaz — tanımlanmamış bütçeyi tanımlanmış gibi
 * göstermektense yokluğunu bilmek yeğ.
 */
function SalaryBandFields({ formData, setFormData, inputCls }) {
    const set = (patch) => setFormData((p) => ({ ...p, ...patch }));
    const preview = formatBand({
        max: formData.salaryMax,
        currency: formData.salaryCurrency, period: formData.salaryPeriod,
        basis: formData.salaryBasis,
    });
    return (
        <div>
            <label className="text-[10px] font-semibold text-n400 uppercase tracking-[0.08em] block mb-1.5">
                Bütçe Bandı <span className="text-n300">(isteğe bağlı)</span>
            </label>
            {/* TEK TUTAR: bütçenin anlamlı ucu TAVAN. Alt sınır bir bütçe
                kısıtı değil, olsa olsa bir tercih — ve girilmesi zorunlu
                olmayan bir alan, girilmediğinde bandı yarım bırakıyordu.
                Giriş serbest metin: number girişinin ok tuşları maaş gibi
                büyük tutarlarda işe yaramıyor. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <input type="text" inputMode="numeric" placeholder="Bütçe üst sınırı"
                    value={formData.salaryMax}
                    onChange={(e) => set({ salaryMax: e.target.value })} className={inputCls} />
                <select value={formData.salaryCurrency} onChange={(e) => set({ salaryCurrency: e.target.value })}
                    className={inputCls + ' appearance-none cursor-pointer'}>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c} {CURRENCY_LABEL[c]}</option>)}
                </select>
                <select value={formData.salaryPeriod} onChange={(e) => set({ salaryPeriod: e.target.value })}
                    className={inputCls + ' appearance-none cursor-pointer'}>
                    {PERIODS.map((x) => <option key={x} value={x}>{PERIOD_LABEL[x]}</option>)}
                </select>
                {/* BRÜT/NET DE BİR BİRİM. Aday net konuşur, bütçe brüt tutulur;
                    ikisini kıyaslamak farkı %30-40 küçük gösterir ve bu hata
                    MAKUL göründüğü için fark edilmez. */}
                <select value={formData.salaryBasis} onChange={(e) => set({ salaryBasis: e.target.value })}
                    className={inputCls + ' appearance-none cursor-pointer'}>
                    {BASES.map((x) => <option key={x} value={x}>{BASIS_LABEL[x]}</option>)}
                </select>
            </div>
            <p className="mt-1 text-[10px] text-n400">
                {preview
                    ? <>Kayıtlı band: <strong className="text-n500">{preview}</strong> — adayın beklentisi bununla karşılaştırılacak.</>
                    : 'Band girilmezse aday beklentileri bir şeyle kıyaslanamaz.'}
            </p>
        </div>
    );
}
