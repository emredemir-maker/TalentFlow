// src/pages/PositionsPage.jsx
// Command Table layout — with redesigned Create / Detail / Edit screens

import { useState, useMemo, useEffect, useCallback } from 'react';
import Header from '../components/Header';
import { usePositions } from '../context/PositionsContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { collection, onSnapshot, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
    Briefcase, Plus, Trash2, CheckCircle2, XCircle, Users, Clock,
    Search, Sparkles, Loader2, Cpu, ArrowUpRight, Building2,
    AlertCircle, Unlock, Edit2, X, Send, Link2, Copy, Check,
    ExternalLink, FileText, ChevronRight, TrendingUp, RefreshCw,
} from 'lucide-react';
import {
    subscribeToApplications, getSourceColor, APP_STATUS_CONFIG, updateApplicationStatus
} from '../services/applicationService';

import PotentialCandidatesTab from '../components/PotentialCandidatesTab';
import CandidateDrawer from '../components/CandidateDrawer';
import { useCandidates } from '../context/CandidatesContext';
import { extractPositionFromJD } from '../services/geminiService';
import { calculateMatchScore, filterCandidatesByDomain } from '../services/matchService';

const STATUS_CONFIG = {
    open:             { label: 'Aktif',        pill: 'bg-emerald-50 text-emerald-600 border-emerald-200', dot: 'bg-emerald-500' },
    closed:           { label: 'Pasif',         pill: 'bg-slate-100 text-slate-400 border-slate-200',     dot: 'bg-slate-300' },
    pending_approval: { label: 'Onay Bekliyor', pill: 'bg-amber-50 text-amber-600 border-amber-200',      dot: 'bg-amber-400' },
    rejected:         { label: 'Reddedildi',   pill: 'bg-red-50 text-red-500 border-red-200',            dot: 'bg-red-400' },
};

// ─────────────────────────────────────────────────────────────
// DETAIL DRAWER
// ─────────────────────────────────────────────────────────────
const APPLY_SOURCES = ['LinkedIn', 'Kariyer.net', 'Instagram', 'Twitter/X', 'Facebook', 'E-posta', 'Web'];

function PositionDetailDrawer({ pos, candidates, onClose, onEdit, onRelease, onToggleStatus, onDelete, isRecruiterOrAdmin, releaseLoading, releasingPosId, onCandidateClick }) {
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

    function copyLink() {
        navigator.clipboard.writeText(applyUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    async function syncApplicationToCandidate(app) {
        if (syncingAppId) return;
        setSyncingAppId(app.id);
        try {
            const CANDIDATES_COLLECTION = 'artifacts/talent-flow/public/data/candidates';
            const emailNorm = app.email?.trim().toLowerCase() || '';
            const q = query(collection(db, CANDIDATES_COLLECTION), where('email', '==', emailNorm));
            const existing = await getDocs(q);
            if (!existing.empty) {
                setSyncedAppIds(prev => new Set([...prev, app.id]));
                return;
            }
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
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            };
            await addDoc(collection(db, CANDIDATES_COLLECTION), candidateData);
            setSyncedAppIds(prev => new Set([...prev, app.id]));
        } catch (err) {
            console.error('Sync error:', err);
        } finally {
            setSyncingAppId(null);
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
            <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] z-40" onClick={onClose} />

            {/* Drawer */}
            <div className="fixed right-0 top-0 h-full w-[520px] bg-white shadow-2xl shadow-slate-900/10 border-l border-slate-200 flex flex-col z-50">

                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-100 shrink-0">
                    <div className="flex justify-between items-center mb-2">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold ${sc.pill}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} ${pos.status === 'open' ? 'animate-pulse' : ''}`} />
                            {sc.label}
                        </span>
                        <div className="flex items-center gap-1.5">
                            {isRecruiterOrAdmin && (
                                <button onClick={onEdit} className="p-2 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors" title="Düzenle">
                                    <Edit2 size={16} className="text-slate-400" />
                                </button>
                            )}
                            {isRecruiterOrAdmin && pos.status === 'open' && (
                                <button
                                    onClick={onRelease}
                                    disabled={releaseLoading && releasingPosId === pos.id}
                                    className={`p-2 rounded-lg border transition-colors ${pos.releasedToDepartment ? 'bg-emerald-50 border-emerald-200 text-emerald-400' : 'bg-violet-50 border-violet-200 text-violet-400 hover:bg-violet-100'}`}
                                    title="Departmana Aç"
                                >
                                    {releaseLoading && releasingPosId === pos.id ? <Loader2 size={16} className="animate-spin" /> : <Unlock size={16} />}
                                </button>
                            )}
                            <button onClick={onClose} className="p-2 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors">
                                <X size={16} className="text-slate-400" />
                            </button>
                        </div>
                    </div>
                    <h2 className="text-[20px] font-black text-slate-900 mt-2">{pos.title}</h2>
                    <div className="inline-flex items-center gap-1.5 mt-1">
                        <Building2 size={12} className="text-slate-400" />
                        <span className="text-[12px] text-slate-500">{pos.department}</span>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1 mt-4 bg-slate-100 rounded-xl p-1">
                        {TABS.map(t => (
                            <button
                                key={t.id}
                                onClick={() => setActiveTab(t.id)}
                                className={`flex-1 py-2 rounded-lg text-[11px] font-black transition-all flex items-center justify-center gap-1.5 ${activeTab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                {t.label}
                                {t.badge ? (
                                    <span className="bg-violet-500 text-white text-[9px] font-black rounded-full px-1.5 py-0.5 leading-none">{t.badge}</span>
                                ) : null}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── TAB: DETAIL ── */}
                {activeTab === 'detail' && (
                    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 text-center">
                                <div className="text-[24px] font-black text-slate-900 leading-none">{candidateCount}</div>
                                <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Aday</div>
                            </div>
                            <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 text-center">
                                <div className="text-[24px] font-black text-slate-900 leading-none">{pos.minExperience || 0} yıl+</div>
                                <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Min. Tecrübe</div>
                            </div>
                            <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 text-center">
                                <div className="text-[24px] font-black text-cyan-500 leading-none">{openDays !== null ? `${openDays}g` : '—'}</div>
                                <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Açık Süre</div>
                            </div>
                        </div>

                        {/* Requirements */}
                        {pos.requirements?.length > 0 && (
                            <div>
                                <h3 className="text-[9px] font-black text-slate-400 tracking-widest uppercase mb-2">GEREKSİNİMLER</h3>
                                <div className="flex flex-wrap gap-2">
                                    {pos.requirements.map(req => (
                                        <span key={req} className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold border border-slate-200">{req}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Description */}
                        {pos.description && (
                            <div>
                                <h3 className="text-[9px] font-black text-slate-400 tracking-widest uppercase mb-2">AÇIKLAMA</h3>
                                <p className="text-sm text-slate-600 leading-relaxed">{pos.description}</p>
                            </div>
                        )}

                        {/* Matched Candidates */}
                        {pos.status === 'open' && (
                            <div>
                                <h3 className="text-[9px] font-black text-slate-400 tracking-widest uppercase mb-2">EŞLEŞEN ADAYLAR</h3>
                                {pos.matchedCandidates?.length > 0 ? (
                                    <div className="space-y-2">
                                        {pos.matchedCandidates.slice(0, 5).map((mc, idx) => {
                                            const fullCandidate = candidates.find(c => c.id === mc.id);
                                            const initials = mc.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';
                                            return (
                                                <div
                                                    key={idx}
                                                    onClick={() => fullCandidate && onCandidateClick(fullCandidate)}
                                                    className="bg-white border border-slate-200 rounded-2xl p-3.5 flex items-center gap-3 hover:border-cyan-200 transition-colors cursor-pointer group"
                                                >
                                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-xs font-black shrink-0 shadow-sm">
                                                        {initials}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-[13px] font-bold text-slate-800 truncate">{mc.name}</div>
                                                        <div className="text-[11px] text-slate-400">{mc.reason || 'Eşleşme'}</div>
                                                    </div>
                                                    <div className="flex flex-col items-end shrink-0">
                                                        <div className="text-[14px] font-black text-cyan-500">{mc.score}%</div>
                                                        <div className="h-0.5 w-12 bg-slate-100 rounded-full mt-1 overflow-hidden">
                                                            <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${mc.score}%` }} />
                                                        </div>
                                                    </div>
                                                    <ArrowUpRight size={14} className="text-slate-300 group-hover:text-cyan-500 transition-colors ml-1 shrink-0" />
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-400 italic">Henüz eşleşen aday yok.</p>
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
                                <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
                            </div>
                        ) : applications.length === 0 ? (
                            <div className="text-center py-16">
                                <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                                <p className="text-slate-400 text-sm font-semibold">Henüz başvuru yok</p>
                                <p className="text-slate-300 text-xs mt-1">Başvuru linkinizi paylaşın</p>
                                <button
                                    onClick={() => setActiveTab('link')}
                                    className="mt-4 px-4 py-2 rounded-xl bg-violet-50 border border-violet-200 text-violet-600 text-xs font-bold hover:bg-violet-100 transition-colors inline-flex items-center gap-1.5"
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
                                            <div key={st} className={`rounded-2xl border p-3 text-center ${cfg.pill}`}>
                                                <div className="text-[22px] font-black leading-none">{count}</div>
                                                <div className="text-[9px] font-black uppercase tracking-widest mt-1 opacity-70">{cfg.label}</div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {applications.map(app => {
                                    const sc = getSourceColor(app.source);
                                    const stCfg = APP_STATUS_CONFIG[app.status] || APP_STATUS_CONFIG.new;
                                    const scoreColor = app.aiScore >= 75 ? 'text-emerald-500' : app.aiScore >= 50 ? 'text-amber-500' : 'text-red-400';
                                    return (
                                        <div key={app.id} className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-violet-200 transition-colors">
                                            <div className="flex items-start gap-3">
                                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center text-white text-xs font-black shrink-0">
                                                    {app.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??'}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-[13px] font-black text-slate-800 truncate">{app.name}</span>
                                                        <span className={`inline-flex px-2 py-0.5 rounded-full border text-[9px] font-black ${sc.bg} ${sc.text} ${sc.border}`}>{app.source}</span>
                                                    </div>
                                                    <div className="text-[11px] text-slate-400 truncate">{app.email}</div>
                                                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                        <span className={`inline-flex px-2.5 py-0.5 rounded-full border text-[9px] font-black ${stCfg.pill}`}>{stCfg.label}</span>
                                                        {app.cvFileName && (
                                                            <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                                                                <FileText size={10} />{app.cvFileName}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <div className={`text-[18px] font-black leading-none ${scoreColor}`}>{app.aiScore || 0}%</div>
                                                    <div className="text-[8px] text-slate-300 uppercase tracking-widest mt-0.5">AI Uyum</div>
                                                    <div className="h-1 w-12 bg-slate-100 rounded-full mt-1 overflow-hidden">
                                                        <div className={`h-full rounded-full ${app.aiScore >= 75 ? 'bg-emerald-400' : app.aiScore >= 50 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${app.aiScore || 0}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                            {/* Status changer */}
                                            <div className="flex gap-1.5 mt-3 pt-3 border-t border-slate-100">
                                                {Object.entries(APP_STATUS_CONFIG).map(([st, cfg]) => (
                                                    <button
                                                        key={st}
                                                        onClick={() => updateApplicationStatus(app.id, st)}
                                                        className={`flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wide border transition-all ${app.status === st ? cfg.pill : 'bg-slate-50 text-slate-300 border-slate-100 hover:border-slate-200'}`}
                                                    >
                                                        {cfg.label}
                                                    </button>
                                                ))}
                                            </div>
                                            {/* Sync to candidates */}
                                            <div className="mt-2">
                                                {syncedAppIds.has(app.id) ? (
                                                    <div className="flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200">
                                                        <Check size={11} /> Adaylar listesine eklendi
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => syncApplicationToCandidate(app)}
                                                        disabled={syncingAppId === app.id}
                                                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[10px] font-black text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-colors disabled:opacity-50"
                                                    >
                                                        {syncingAppId === app.id ? (
                                                            <><Loader2 size={11} className="animate-spin" /> Ekleniyor...</>
                                                        ) : (
                                                            <><Users size={11} /> Adaylar Listesine Ekle</>
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ── TAB: APPLY LINK ── */}
                {activeTab === 'link' && (
                    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                        <div>
                            <h3 className="text-[9px] font-black text-slate-400 tracking-widest uppercase mb-1">BAŞVURU LİNKİ</h3>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                                Aşağıdaki linki LinkedIn, e-posta veya istediğiniz platformda paylaşın. Kaynağı seçin — sistem hangi kanaldan geldiğini otomatik kaydeder.
                            </p>
                        </div>

                        {/* Source selector */}
                        <div>
                            <div className="text-[9px] font-black text-slate-400 tracking-widest uppercase mb-2">PAYLAŞIM KANALI</div>
                            <div className="flex flex-wrap gap-2">
                                {APPLY_SOURCES.map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setLinkSource(s)}
                                        className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${linkSource === s ? 'bg-violet-500 text-white border-violet-500' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-violet-300'}`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Link box */}
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">OLUŞTURULAN LİNK</div>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-[11px] font-mono text-slate-600 break-all leading-relaxed">
                                    {applyUrl}
                                </div>
                                <button
                                    onClick={copyLink}
                                    className={`shrink-0 p-2.5 rounded-xl border transition-all ${copied ? 'bg-emerald-50 border-emerald-200 text-emerald-500' : 'bg-white border-slate-200 text-slate-400 hover:border-violet-300 hover:text-violet-500'}`}
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
                            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-violet-200 text-violet-600 font-bold text-xs hover:bg-violet-50 transition-colors"
                        >
                            <ExternalLink size={13} /> Başvuru Formunu Önizle
                        </a>

                        {/* Tip */}
                        <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4">
                            <div className="text-[9px] font-black text-violet-500 uppercase tracking-widest mb-2">NASIL KULLANILIR?</div>
                            <ul className="space-y-1.5 text-[11px] text-slate-500 leading-relaxed">
                                <li className="flex items-start gap-2"><ChevronRight size={10} className="text-violet-400 mt-0.5 shrink-0" />LinkedIn iş ilanına "Başvur" butonu olarak ekleyin</li>
                                <li className="flex items-start gap-2"><ChevronRight size={10} className="text-violet-400 mt-0.5 shrink-0" />E-posta imzanıza veya kampanyaya hyperlink ekleyin</li>
                                <li className="flex items-start gap-2"><ChevronRight size={10} className="text-violet-400 mt-0.5 shrink-0" />Her platform için ayrı kaynak seçin — istatistikler ayrı tutulur</li>
                                <li className="flex items-start gap-2"><ChevronRight size={10} className="text-violet-400 mt-0.5 shrink-0" />Gelen başvurular "Başvurular" sekmesinde AI skoru ile görünür</li>
                            </ul>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 shrink-0 bg-slate-50">
                    {pos.status === 'open' && isRecruiterOrAdmin ? (
                        <div className="flex gap-3">
                            <button
                                onClick={onRelease}
                                className={`flex-1 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors ${pos.releasedToDepartment ? 'bg-emerald-500 text-white' : 'bg-violet-500 hover:bg-violet-600 text-white shadow-sm shadow-violet-200'}`}
                            >
                                <Unlock size={14} />{pos.releasedToDepartment ? 'Yeniden Paylaş' : 'Departmana Aç'}
                            </button>
                            <button
                                onClick={() => { onToggleStatus(); onClose(); }}
                                className="flex-1 py-3 rounded-xl bg-white border border-red-200 hover:bg-red-50 hover:border-red-300 transition-colors text-red-400 font-bold text-xs flex items-center justify-center gap-2"
                            >
                                <XCircle size={14} />Pozisyonu Kapat
                            </button>
                        </div>
                    ) : pos.status === 'closed' && isRecruiterOrAdmin ? (
                        <div className="flex gap-3">
                            <button
                                onClick={() => { onToggleStatus(); onClose(); }}
                                className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm shadow-emerald-200"
                            >
                                <RefreshCw size={14} />Pozisyonu Yeniden Aç
                            </button>
                            <button onClick={onClose} className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs transition-colors">
                                Vazgeç
                            </button>
                        </div>
                    ) : (
                        <button onClick={onClose} className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs transition-colors">
                            Kapat
                        </button>
                    )}
                </div>
            </div>
        </>
    );
}

// ─────────────────────────────────────────────────────────────
// CREATE MODAL
// ─────────────────────────────────────────────────────────────
function PositionCreateModal({ onClose, onSubmit, departments, isDepartmentUser, userDepartments, isExtracting, onExtract, jdText, setJdText }) {
    const [formData, setFormData] = useState({
        title: '', department: isDepartmentUser ? (userDepartments?.[0] || '') : '', minExperience: '', requirements: '', description: '',
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-slate-900/25 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center">
                            <Briefcase size={16} className="text-teal-600" />
                        </div>
                        <div>
                            <h2 className="text-[16px] font-black text-slate-900 leading-tight">Yeni Pozisyon Oluştur</h2>
                            <p className="text-[11px] text-slate-400 font-medium">Stratejik işe alım planlaması</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
                        <XCircle size={20} className="text-slate-400" />
                    </button>
                </div>

                {/* Body */}
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100 overflow-y-auto">

                    {/* Left: AI */}
                    <div className="p-6 bg-gradient-to-b from-cyan-50/50 to-white flex flex-col">
                        <div className="flex items-center gap-2 mb-4">
                            <Sparkles size={14} className="text-cyan-500" />
                            <h3 className="text-[11px] font-black text-cyan-700 uppercase tracking-widest">AI ile Otomatik Doldur</h3>
                        </div>
                        <textarea
                            className="h-40 bg-white border border-cyan-200 rounded-2xl p-4 text-sm text-slate-600 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-100 resize-none transition-all"
                            placeholder="İş ilanı metnini buraya yapıştırın..."
                            value={jdText}
                            onChange={(e) => setJdText(e.target.value)}
                        />
                        <p className="text-[10px] text-slate-400 mt-2 px-1">Min. 50 karakter</p>
                        <button
                            type="button"
                            onClick={() => onExtract(formData, setFormData)}
                            disabled={isExtracting || jdText.length < 50}
                            className="w-full mt-3 bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isExtracting ? <><Loader2 size={14} className="animate-spin" />Analiz ediliyor...</> : <><Sparkles size={14} />Otomatik Doldur</>}
                        </button>
                        <div className="flex items-center mt-6 mb-4">
                            <div className="flex-1 h-px bg-slate-100" />
                            <span className="px-3 text-xs text-slate-400 font-medium">veya manuel doldurun</span>
                            <div className="flex-1 h-px bg-slate-100" />
                        </div>
                        <div className="flex flex-col gap-2">
                            {['Pozisyon başlığı otomatik belirlenir', 'Gereksinimler listeye dönüştürülür', 'Departman tahmini yapılır'].map(t => (
                                <div key={t} className="flex items-center gap-2">
                                    <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                                    <span className="text-xs text-slate-500">{t}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: Form */}
                    <form onSubmit={handleSubmit} className="p-6 flex flex-col space-y-4">
                        <Field label="Pozisyon Adı *">
                            <input type="text" required placeholder="ör. Senior React Developer" value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} className={INPUT_CLS} />
                        </Field>
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
                            <input type="number" min="0" placeholder="0" value={formData.minExperience} onChange={e => setFormData(p => ({ ...p, minExperience: e.target.value }))} className={INPUT_CLS} />
                        </Field>
                        <Field label="Gereksinimler">
                            <input type="text" placeholder="React, TypeScript, Node.js (virgülle ayırın)" value={formData.requirements} onChange={e => setFormData(p => ({ ...p, requirements: e.target.value }))} className={INPUT_CLS} />
                        </Field>
                        <Field label="Açıklama">
                            <textarea placeholder="Pozisyon hakkında kısa açıklama..." value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} className={INPUT_CLS + ' h-20 resize-none'} />
                        </Field>
                        <div className="mt-auto pt-2">
                            <button type="submit" className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-black text-xs uppercase tracking-widest py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-sm shadow-cyan-200 transition-colors">
                                <Send size={14} />{isDepartmentUser ? 'Talep Gönder' : 'Pozisyon Oluştur'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// EDIT MODAL
// ─────────────────────────────────────────────────────────────
function PositionEditModal({ pos, candidates, departments, isDepartmentUser, userDepartments, onClose, onSubmit }) {
    const [formData, setFormData] = useState({
        title: pos.title || '',
        department: pos.department || '',
        minExperience: pos.minExperience?.toString() || '0',
        requirements: pos.requirements?.join(', ') || '',
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
            <div className="absolute inset-0 bg-slate-900/25 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="bg-amber-50 border border-amber-200 text-amber-500 p-2 rounded-xl">
                            <Edit2 size={18} />
                        </div>
                        <div>
                            <h2 className="text-[16px] font-black text-slate-900 leading-tight">Pozisyon Düzenle</h2>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-sm font-medium text-slate-500 truncate max-w-[200px]">{pos.title}</span>
                                <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-md shrink-0">Düzenleniyor</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Warning banner */}
                {candidateCount > 0 && (
                    <div className="mx-8 mt-5 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-center gap-3 shrink-0">
                        <AlertCircle size={14} className="text-amber-500 shrink-0" />
                        <span className="text-[12px] text-amber-700 font-medium">
                            Bu pozisyona bağlı {candidateCount} aday etkilenebilir. Değişiklikleri kaydetmeden önce gözden geçirin.
                        </span>
                    </div>
                )}

                {/* Body */}
                <div className="grid grid-cols-2 divide-x divide-slate-100 overflow-y-auto mt-2">

                    {/* Left: current info */}
                    <div className="p-6">
                        <p className="text-[9px] font-black text-slate-400 tracking-widest uppercase mb-4">MEVCUT BİLGİLER</p>
                        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-3">
                            {[
                                { label: 'Pozisyon', value: pos.title },
                                { label: 'Departman', value: pos.department },
                                { label: 'Tecrübe', value: `${pos.minExperience || 0} yıl+` },
                                { label: 'Adaylar', value: `${candidateCount} eşleşme` },
                            ].map(({ label, value }) => (
                                <div key={label} className="flex flex-col">
                                    <span className="text-[9px] text-slate-400 uppercase tracking-widest font-semibold mb-0.5">{label}</span>
                                    <span className="text-[13px] font-bold text-slate-800">{value}</span>
                                </div>
                            ))}
                            <div className="flex flex-col">
                                <span className="text-[9px] text-slate-400 uppercase tracking-widest font-semibold mb-1">Durum</span>
                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border w-fit ${sc.pill}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{sc.label}
                                </span>
                            </div>
                        </div>
                        {pos.requirements?.length > 0 && (
                            <div className="mt-5">
                                <p className="text-[9px] font-black text-slate-400 tracking-widest uppercase mb-2">MEVCUT GEREKSİNİMLER</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {pos.requirements.map(tag => (
                                        <span key={tag} className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-semibold border border-slate-200">{tag}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right: edit form */}
                    <form onSubmit={handleSubmit} className="p-6 flex flex-col">
                        <p className="text-[9px] font-black text-slate-400 tracking-widest uppercase mb-4">DEĞİŞTİRİLECEK ALANLAR</p>
                        <div className="space-y-4 flex-1">
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
                            <Field label="Gereksinimler">
                                <input type="text" value={formData.requirements} onChange={e => setFormData(p => ({ ...p, requirements: e.target.value }))} className={INPUT_CLS} />
                            </Field>
                            <Field label="Açıklama">
                                <textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} className={INPUT_CLS + ' h-20 resize-none'} />
                            </Field>
                        </div>
                        <div className="mt-6 flex gap-3 pt-4 border-t border-slate-100">
                            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs transition-colors">İptal</button>
                            <button type="submit" className="flex-1 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm shadow-cyan-200 transition-colors">
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
const INPUT_CLS = 'bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 w-full transition-all';
function Field({ label, children }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">{label}</label>
            {children}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
export default function PositionsPage() {
    const { positions, loading, addPosition, addPositionRequest, approvePosition, rejectPosition, deletePosition, togglePositionStatus, updatePosition } = usePositions();
    const { enrichedCandidates, updateCandidate } = useCandidates();
    const candidates = enrichedCandidates || [];
    const { isDepartmentUser, userDepartments, userProfile, user, role } = useAuth();
    const { addNotification } = useNotifications();

    const [searchTerm, setSearchTerm]           = useState('');
    const [statusFilter, setStatusFilter]       = useState('all');
    const [deptFilter, setDeptFilter]           = useState('all');
    const [detailPos, setDetailPos]             = useState(null);
    const [createOpen, setCreateOpen]           = useState(false);
    const [editPos, setEditPos]                 = useState(null);
    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [activePosition, setActivePosition]   = useState(null);
    const [releasingPosId, setReleasingPosId]   = useState(null);
    const [releaseLoading, setReleaseLoading]   = useState(false);
    const [departments, setDepartments]         = useState([]);
    const [jdText, setJdText]                   = useState('');
    const [isExtracting, setIsExtracting]       = useState(false);

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
                requirements: result.requirements?.join(', ') || p.requirements,
                description: jdText,
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
        const reqs = formData.requirements.split(',').map(r => r.trim()).filter(Boolean);
        const positionObj = { ...formData, requirements: reqs };
        // Domain-filter first: only score candidates in the same job domain
        const domainCandidates = filterCandidatesByDomain(positionObj, candidates);
        const matchedCandidates = domainCandidates
            .map(c => ({ ...c, match: calculateMatchScore(c, positionObj) }))
            .filter(c => c.match.score >= 50)
            .sort((a, b) => b.match.score - a.match.score)
            .slice(0, 10)
            .map(c => ({ id: c.id, name: c.name, score: c.match.score, reason: c.match.score >= 70 ? 'Yüksek Uyumluluk' : 'Potansiyel Eşleşme' }));

        const newPos = { title: formData.title, department: formData.department, description: formData.description || jdText || '', minExperience: parseInt(formData.minExperience) || 0, requirements: reqs, matchedCandidates };
        if (isDepartmentUser) {
            await addPositionRequest(newPos, { uid: user?.uid, email: userProfile?.email, displayName: userProfile?.displayName, department: userDepartments?.[0] || '' });
            alert('✅ Pozisyon talebiniz gönderildi.');
        } else {
            await addPosition(newPos);
        }
        setCreateOpen(false);
        setJdText('');
    };

    const handleUpdate = async (formData) => {
        if (!editPos) return;
        const reqs = formData.requirements.split(',').map(r => r.trim()).filter(Boolean);
        await updatePosition(editPos.id, { title: formData.title, department: formData.department, minExperience: parseInt(formData.minExperience) || 0, requirements: reqs, description: formData.description || '' });
        alert('✅ Pozisyon güncellendi.');
        setEditPos(null);
        setDetailPos(null);
    };

    const handleRelease = async (pos) => {
        if (!pos.department) return alert('Bu pozisyonun departman bilgisi yok.');
        setReleasingPosId(pos.id);
        setReleaseLoading(true);
        try {
            const matches = candidates
                .map(c => { const ps = c.positionAnalyses?.[pos.title]?.score || 0; const ms = calculateMatchScore(c, pos).score; return { ...c, effectiveScore: Math.max(ps, ms) }; })
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
        <div className="min-h-screen flex flex-col bg-slate-50">
            <Header title="Pozisyon Bankası" />

            {/* Pending banner */}
            {isRecruiterOrAdmin && pendingCount > 0 && (
                <div className="mx-6 mt-4 px-5 py-3 rounded-2xl border border-amber-200 bg-amber-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        <p className="text-sm font-semibold text-amber-700">{pendingCount} pozisyon talebi onayınızı bekliyor.</p>
                    </div>
                    <button onClick={() => setStatusFilter('pending_approval')} className="px-3 py-1.5 rounded-xl bg-amber-100 border border-amber-200 text-amber-600 text-xs font-bold hover:bg-amber-200 transition-all">
                        Talepleri Gör
                    </button>
                </div>
            )}

            {/* Body */}
            <div className="flex flex-1 min-h-0 mt-4 mx-6 mb-8 gap-5">

                {/* Sidebar */}
                <aside className="w-[220px] shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col py-5 px-4">
                    <p className="text-[9px] font-black text-slate-400 tracking-widest uppercase mb-2 px-1">DURUM</p>
                    <div className="flex flex-col gap-0.5 mb-4">
                        {[
                            { key: 'all', label: 'Tümü', count: statusCounts.all },
                            { key: 'open', label: 'Aktif', count: statusCounts.open, badge: 'text-emerald-600 bg-emerald-50' },
                            { key: 'pending_approval', label: 'Bekleyen', count: statusCounts.pending_approval, badge: 'text-amber-600 bg-amber-50' },
                            { key: 'closed', label: 'Kapalı', count: statusCounts.closed, badge: 'text-slate-400 bg-slate-100' },
                        ].map(({ key, label, count, badge }) => (
                            <button key={key} onClick={() => setStatusFilter(key)} className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all border ${statusFilter === key ? 'bg-cyan-50 border-cyan-200 text-cyan-700' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}>
                                <span className="flex items-center gap-2">{statusFilter === key && <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />}{label}</span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${badge || (statusFilter === key ? 'bg-cyan-100 text-cyan-600' : 'bg-slate-100 text-slate-400')}`}>{count}</span>
                            </button>
                        ))}
                    </div>
                    <div className="border-t border-slate-100 my-2" />
                    <p className="text-[9px] font-black text-slate-400 tracking-widest uppercase mb-2 px-1 mt-2">DEPARTMAN</p>
                    <div className="flex flex-col gap-0.5 overflow-y-auto flex-1 pb-2">
                        {[{ key: 'all', label: 'Tüm Departmanlar' }, ...allDepts.map(d => ({ key: d, label: d, count: positions.filter(p => p.department === d).length }))].map(({ key, label, count }) => (
                            <button key={key} onClick={() => setDeptFilter(key)} className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all border ${deptFilter === key ? 'bg-cyan-50 border-cyan-200 text-cyan-700' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}>
                                <span className="flex items-center gap-2">{deptFilter === key && <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />}<span className="truncate">{label}</span></span>
                                {count !== undefined && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-400">{count}</span>}
                            </button>
                        ))}
                    </div>
                    <div className="mt-auto pt-4 border-t border-slate-100">
                        <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-3 flex items-start gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-cyan-500 shrink-0 mt-0.5" />
                            <span className="text-[11px] text-slate-500 leading-snug">AI eşleştirme aktif</span>
                        </div>
                    </div>
                </aside>

                {/* Main */}
                <div className="flex-1 min-w-0 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

                    {/* Top bar */}
                    <div className="px-7 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-3">
                            <h1 className="text-lg font-black text-slate-900 tracking-tight">{isDepartmentUser ? `${userDepartments?.join(', ')} Pozisyonları` : 'Pozisyon Portföyü'}</h1>
                            <span className="rounded-full bg-slate-100 text-slate-400 text-[11px] px-2 py-0.5 font-semibold">{visiblePositions.length}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input type="text" placeholder="Pozisyon veya departman ara..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-56 bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 transition-all" />
                            </div>
                            <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-xs shadow-sm shadow-cyan-200 transition-colors">
                                <Plus className="w-3.5 h-3.5" />{isDepartmentUser ? 'Pozisyon Talebi' : 'Yeni Pozisyon'}
                            </button>
                        </div>
                    </div>

                    {/* Table header */}
                    <div className="px-7 pt-4 pb-2 shrink-0">
                        <div className="grid grid-cols-[2fr_0.8fr_0.8fr_0.9fr_1.2fr_auto] gap-4 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 px-4">
                            <div>POZİSYON / DEPARTMAN</div><div>ADAYLAR</div><div>TECRÜBE</div><div>DURUM</div><div>AI UYUM SKORU</div><div>İŞLEMLER</div>
                        </div>
                    </div>

                    {/* Rows */}
                    <div className="px-7 pb-6 space-y-2 overflow-y-auto flex-1">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-24 gap-3">
                                <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Yükleniyor...</p>
                            </div>
                        ) : visiblePositions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-24 gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center"><Briefcase className="w-6 h-6 text-slate-300" /></div>
                                <p className="text-sm font-semibold text-slate-400">{statusFilter === 'pending_approval' ? 'Bekleyen talep yok' : 'Pozisyon bulunamadı'}</p>
                                <button onClick={() => setCreateOpen(true)} className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-all">
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
                                <div key={pos.id} className="rounded-2xl border border-slate-200 hover:border-cyan-200 hover:shadow-sm transition-all bg-white">
                                    {isPending && (
                                        <div className="mx-4 mt-4 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2 text-xs text-amber-600 font-semibold">
                                            <Clock className="w-3.5 h-3.5" />{pos.requestedBy?.displayName || 'Departman kullanıcısı'} tarafından talep edildi
                                        </div>
                                    )}
                                    {isRejected && pos.rejectionReason && (
                                        <div className="mx-4 mt-4 px-4 py-2 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2 text-xs text-red-500 font-semibold">
                                            <XCircle className="w-3.5 h-3.5" />Red: {pos.rejectionReason}
                                        </div>
                                    )}

                                    <div
                                        className="px-4 py-4 grid grid-cols-[2fr_0.8fr_0.8fr_0.9fr_1.2fr_auto] gap-4 items-center cursor-pointer"
                                        onClick={() => setDetailPos(pos)}
                                    >
                                        {/* Col 1 */}
                                        <div className="min-w-0">
                                            <div className="text-sm font-bold text-slate-800 truncate mb-1 hover:text-cyan-600 transition-colors">{pos.title}</div>
                                            <span className="rounded-full bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 font-medium">{pos.department}</span>
                                        </div>
                                        {/* Col 2 */}
                                        <div>
                                            <div className="text-lg font-black text-slate-900 leading-none">{candidateCount}</div>
                                            <div className="text-[10px] text-slate-400 mt-0.5">aday</div>
                                        </div>
                                        {/* Col 3 */}
                                        <div>
                                            <div className="font-black text-slate-900 leading-none">{pos.minExperience || 0} yıl+</div>
                                            <div className="text-[10px] text-slate-400 mt-0.5">min.</div>
                                        </div>
                                        {/* Col 4 */}
                                        <div>
                                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${sc.pill}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{sc.label}
                                            </span>
                                        </div>
                                        {/* Col 5 */}
                                        <div className="pr-2">
                                            {pos.status === 'open' && avgScore ? (
                                                <>
                                                    <div className="font-black text-cyan-500 text-[16px] leading-none mb-1.5">{avgScore}%</div>
                                                    <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-gradient-to-r from-cyan-400 to-cyan-500 rounded-full" style={{ width: `${avgScore}%` }} />
                                                    </div>
                                                </>
                                            ) : <span className="text-slate-300 text-sm">—</span>}
                                        </div>
                                        {/* Col 6 — stop propagation so clicks don't open drawer */}
                                        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                            {pos.status === 'open' && <>
                                                {isRecruiterOrAdmin && (
                                                    <button onClick={() => handleRelease(pos)} disabled={releaseLoading && releasingPosId === pos.id} className={`p-1.5 rounded-lg border transition-colors ${pos.releasedToDepartment ? 'bg-emerald-50 border-emerald-200 text-emerald-500' : 'bg-violet-50 border-violet-200 text-violet-500 hover:bg-violet-100'}`} title="Departmana Aç">
                                                        {releaseLoading && releasingPosId === pos.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                                                    </button>
                                                )}
                                                <button onClick={() => setEditPos(pos)} className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-400 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-500 transition-colors" title="Düzenle"><Edit2 className="w-4 h-4" /></button>
                                                <button onClick={() => handleToggleStatus(pos.id, pos.status)} className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-400 hover:bg-red-50 hover:border-red-200 hover:text-red-400 transition-colors" title="Kapat"><XCircle className="w-4 h-4" /></button>
                                                <button onClick={() => deletePosition(pos.id)} className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-400 hover:bg-red-50 hover:border-red-200 hover:text-red-400 transition-colors" title="Sil"><Trash2 className="w-4 h-4" /></button>
                                            </>}
                                            {isPending && isRecruiterOrAdmin && <>
                                                <button onClick={() => { if (window.confirm('Onaylamak istiyor musunuz?')) approvePosition(pos.id); }} className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-500 hover:bg-emerald-100 transition-colors" title="Onayla"><CheckCircle2 className="w-4 h-4" /></button>
                                                <button onClick={() => { const r = prompt('Red nedeni:'); if (r !== null) rejectPosition(pos.id, r); }} className="p-1.5 rounded-lg bg-red-50 border border-red-200 text-red-400 hover:bg-red-100 transition-colors" title="Reddet"><XCircle className="w-4 h-4" /></button>
                                            </>}
                                            {isRejected && isRecruiterOrAdmin && (
                                                <button onClick={() => deletePosition(pos.id)} className="p-1.5 rounded-lg bg-red-50 border border-red-200 text-red-400 hover:bg-red-100 transition-colors" title="Sil"><Trash2 className="w-4 h-4" /></button>
                                            )}
                                            {pos.status === 'closed' && isRecruiterOrAdmin && (
                                                <>
                                                    <button onClick={() => handleToggleStatus(pos.id, pos.status)} className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-500 hover:bg-emerald-100 transition-colors" title="Yeniden Aç"><RefreshCw className="w-4 h-4" /></button>
                                                    <button onClick={() => deletePosition(pos.id)} className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-400 hover:bg-red-50 hover:border-red-200 hover:text-red-400 transition-colors" title="Sil"><Trash2 className="w-4 h-4" /></button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div className="px-7 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
                        <p className="text-xs text-slate-400 font-medium">{visiblePositions.length} pozisyon gösteriliyor</p>
                        <div className="flex items-center gap-1"><Cpu className="w-3 h-3 text-cyan-400" /><span className="text-[10px] text-slate-400">AI eşleştirme aktif</span></div>
                    </div>
                </div>
            </div>

            {/* ── MODALS & DRAWERS ── */}
            {createOpen && (
                <PositionCreateModal
                    onClose={() => { setCreateOpen(false); setJdText(''); }}
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
                    onClose={() => setEditPos(null)}
                    onSubmit={handleUpdate}
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
                    onCandidateClick={(c) => { setSelectedCandidate(c); setActivePosition(detailPos); }}
                />
            )}

            {selectedCandidate && (
                <CandidateDrawer
                    candidate={selectedCandidate}
                    positionContext={activePosition}
                    onClose={() => { setSelectedCandidate(null); setActivePosition(null); }}
                />
            )}
        </div>
    );
}
