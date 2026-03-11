// src/pages/CandidateProcessPage.jsx
import { useMemo, useState } from 'react';
import Header from '../components/Header';
import StarScoreCard from '../components/StarScoreCard';
import InterviewHistory from '../components/InterviewHistory';
import SendMessageModal from '../components/SendMessageModal';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import {
    Github,
    Linkedin,
    Globe,
    CheckCircle2,
    Shield,
    Terminal,
    MapPin,
    Cpu,
    BadgeCheck,
    Download,
    Activity,
    Briefcase,
    Calendar,
    MessageSquare,
    Clock,
    Mail,
    Phone,
    FileText,
    ExternalLink,
    User,
    X,
    Video,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { analyzeCandidateMatch } from '../services/geminiService';
import { createMessage, MESSAGE_STATUS } from '../services/messageQueueService';

const STATUS_LABELS = {
    ai_analysis: 'AI Analiz',
    review: 'İnceleme',
    interview: 'Mülakat',
    offer: 'Teklif',
    hired: 'İşe Alındı',
    rejected: 'Red'
};

export default function CandidateProcessPage() {
    const { candidates, viewCandidateId, setViewCandidateId, updateCandidate } = useCandidates();
    const { positions } = usePositions();
    const navigate = useNavigate();
    const [sendModalPurpose, setSendModalPurpose] = useState(null);
    const [plannedSessionToStart, setPlannedSessionToStart] = useState(null);
    const [activeTab, setActiveTab] = useState('overview'); // ['overview', 'interviews', 'cv']

    const candidate = useMemo(() => {
        if (!viewCandidateId && candidates.length > 0) return candidates[0];
        return candidates.find(c => c.id === viewCandidateId) || null;
    }, [candidates, viewCandidateId]);

    const handleMessageSent = async (data) => {
        try {
            // 1. Log message to queue
            await createMessage({
                candidateId: data.candidateId,
                candidateName: data.candidateName,
                candidateEmail: candidate.email,
                candidatePosition: candidate.matchedPositionTitle || candidate.position,
                messageContent: data.subject + '\n\n' + (data.content || ''),
                subject: data.subject,
                trackingId: data.trackingId,
                status: MESSAGE_STATUS.SENT,
                purpose: data.purpose,
                aiGenerated: true
            });

            // 2. If it's an interview, create a planned session
            const updates = {};
            if (data.purpose === 'interview') {
                if (candidate.status === 'review' || candidate.status === 'ai_analysis') {
                    updates.status = 'interview';
                }

                // Append to interviewSessions
                const newSession = {
                    id: 'planned-' + Date.now(),
                    status: 'planned',
                    date: data.interviewDetails?.date,
                    time: data.interviewDetails?.time,
                    duration: data.interviewDetails?.duration,
                    type: data.interviewDetails?.type,
                    typeLabel: data.interviewDetails?.typeLabel,
                    meetLink: data.interviewDetails?.meetLink,
                    timestamp: new Date().toISOString()
                };

                const existingSessions = candidate.interviewSessions || [];
                updates.interviewSessions = [...existingSessions, newSession];
            }

            if (Object.keys(updates).length > 0) {
                await updateCandidate(candidate.id, updates);
            }
        } catch (err) {
            console.error("Failed to log sent message:", err);
        }
    };

    const handleTargetPositionChange = async (e) => {
        const newValue = e.target.value;
        if (!candidate || !newValue) return;
        const posObj = positions?.find(p => p.title === newValue);
        try {
            const cachedAnalysis = candidate.positionAnalyses?.[newValue];
            if (cachedAnalysis) {
                await updateCandidate(candidate.id, {
                    matchedPositionTitle: newValue,
                    matchScore: cachedAnalysis.score,
                    status: 'review',
                    aiAnalysis: cachedAnalysis
                });
                return;
            }
            await updateCandidate(candidate.id, {
                matchedPositionTitle: newValue,
                matchScore: 0,
                status: 'ai_analysis',
                aiAnalysis: null
            });
            if (posObj) {
                (async () => {
                    try {
                        const jobDesc = `${posObj.title}\n${(posObj.requirements || []).join(', ')}\n${posObj.description || ''}`;
                        const result = await analyzeCandidateMatch(jobDesc, candidate);
                        const updatedAnalyses = {
                            ...(candidate.positionAnalyses || {}),
                            [newValue]: result
                        };
                        await updateCandidate(candidate.id, {
                            matchScore: result.score,
                            status: 'review',
                            aiAnalysis: result,
                            summary: result.summary,
                            matchedPositionTitle: newValue,
                            positionAnalyses: updatedAnalyses
                        });
                    } catch (error) {
                        console.error("Inline AI rescan error:", error);
                    }
                })();
            }
        } catch (err) {
            console.error("Failed to change candidate position:", err);
        }
    };

    const handleRefreshAnalysis = async () => {
        if (!candidate) return;
        const currentPos = candidate.matchedPositionTitle;
        if (!currentPos) return;
        const posObj = positions?.find(p => p.title === currentPos);
        if (!posObj) return;
        try {
            const jobDesc = `${posObj.title}\n${(posObj.requirements || []).join(', ')}\n${posObj.description || ''}`;
            const result = await analyzeCandidateMatch(jobDesc, candidate);
            const updatedAnalyses = {
                ...(candidate.positionAnalyses || {}),
                [currentPos]: result
            };
            await updateCandidate(candidate.id, {
                matchScore: result.score,
                aiAnalysis: result,
                summary: result.summary,
                positionAnalyses: updatedAnalyses
            });
        } catch (error) {
            console.error("Manual refresh error:", error);
        }
    };

    const timeline = useMemo(() => {
        if (!candidate) return [];
        const current = candidate.status;
        const isRejected = current === 'rejected';
        const isHired = current === 'hired';
        return [
            { title: 'Başvuru Alındı', date: candidate.appliedDate || 'Bilinmiyor', status: 'completed' },
            { title: 'AI Analizi', date: candidate.aiAnalysis ? 'Tamamlandı' : 'Bekleniyor', status: candidate.aiAnalysis ? 'completed' : 'upcoming' },
            { title: 'Mülakat', date: current === 'interview' ? 'Aktif' : '-', status: (current === 'offer' || isHired || isRejected) ? 'completed' : (current === 'interview' ? 'upcoming' : 'pending') },
            { title: 'Sonuç', date: isHired || isRejected ? 'Neticelendi' : '-', status: isRejected ? 'rejected' : (isHired ? 'completed' : 'pending') }
        ];
    }, [candidate]);

    if (!candidate) return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-bg-primary">
            <Header title="Aday Süreç Portalı" />
            <div className="bg-bg-secondary p-12 rounded-[2.5rem] border border-border-subtle max-w-sm shadow-2xl">
                <Activity className="w-12 h-12 text-text-muted mx-auto mb-6" />
                <h2 className="text-xl font-bold text-text-primary mb-2">Aktif Aday Seçilmedi</h2>
                <p className="text-sm text-text-muted mb-8">Havuzda aktif aday bulunmamaktadır.</p>
                <button onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'dashboard' }))} className="w-full py-3 bg-cyan-500 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all hover:bg-cyan-600 text-white shadow-lg shadow-cyan-500/20">Havuzu Görüntüle</button>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-bg-primary flex flex-col transition-colors duration-500">
            <Header title="Aday Süreç Komuta Merkezi" />

            <div className="flex-1 flex flex-col lg:flex-row gap-5 p-5 lg:p-6 max-w-[1600px] mx-auto w-full">

                {/* LEFT SIDEBAR: PROFILE & STATUS (FIXED WIDTH) */}
                <aside className="w-full lg:w-96 flex flex-col gap-5 shrink-0">

                    {/* Compact Profile Card */}
                    <div className="bg-bg-secondary/40 backdrop-blur-xl rounded-[2.5rem] p-6 border border-border-subtle relative overflow-hidden group shadow-xl">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl -z-10 -translate-y-1/2 translate-x-1/2" />

                        <div className="flex items-center gap-4 mb-5">
                            <div className="relative shrink-0">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-xl font-black text-white shadow-xl shadow-cyan-500/20">
                                    {candidate.name?.substring(0, 2) || 'AD'}
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h2 className="text-xl font-black text-text-primary truncate">{candidate.name || 'İsimsiz'}</h2>
                                <p className="text-[11px] font-black text-cyan-600 dark:text-cyan-400 mt-1.5 flex items-center gap-1.5 uppercase tracking-widest opacity-80">
                                    <Terminal className="w-3.5 h-3.5" /> {candidate.id.substring(0, 8)}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4 pt-4 border-t border-border-subtle">
                            <div className="grid grid-cols-1 gap-3">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] uppercase tracking-widest text-text-muted font-black">Hedef Pozisyon</label>
                                    <select
                                        value={candidate.matchedPositionTitle || candidate.position || ''}
                                        onChange={handleTargetPositionChange}
                                        className="w-full bg-bg-primary border border-border-subtle rounded-xl px-3 py-2 text-xs font-bold text-text-secondary outline-none hover:bg-bg-secondary transition-all cursor-pointer"
                                    >
                                        <option value="" disabled>Seçin</option>
                                        <option value={candidate.position || 'Mevcut'}>Mevcut Pozisyon</option>
                                        {positions?.map(pos => <option key={pos.id} value={pos.title}>{pos.title}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] uppercase tracking-widest text-text-muted font-black">Süreç Durumu</label>
                                    <select
                                        value={candidate.status}
                                        onChange={(e) => updateCandidate(candidate.id, { status: e.target.value })}
                                        className="w-full bg-bg-primary border border-cyan-500/30 rounded-xl px-3 py-2 text-xs font-black text-cyan-600 dark:text-cyan-400 uppercase outline-none hover:border-cyan-500 transition-all cursor-pointer appearance-none"
                                    >
                                        {Object.entries(STATUS_LABELS).map(([key, label]) => (
                                            <option key={key} value={key} className="bg-bg-primary text-text-primary">{label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <button onClick={() => setSendModalPurpose('general')} className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-bg-primary border border-border-subtle hover:bg-bg-secondary transition-all group shadow-sm">
                                    <Mail className="w-4 h-4 text-text-muted group-hover:text-cyan-500" />
                                    <span className="text-[11px] font-black text-text-muted group-hover:text-text-primary uppercase tracking-tight">Mesaj</span>
                                </button>
                                <button onClick={() => setSendModalPurpose('interview')} className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-bg-primary border border-border-subtle hover:bg-bg-secondary transition-all group shadow-sm">
                                    <Calendar className="w-4 h-4 text-text-muted group-hover:text-emerald-500" />
                                    <span className="text-[11px] font-black text-text-muted group-hover:text-text-primary uppercase tracking-tight">Planla</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Timeline & Quick Contact */}
                    <div className="bg-bg-secondary/40 backdrop-blur-xl rounded-[2rem] p-6 border border-border-subtle shadow-xl">
                        <div className="mb-6">
                            <h3 className="text-[10px] font-black text-text-muted mb-5 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Clock className="w-4 h-4 text-emerald-500" /> Süreç Akışı
                            </h3>
                            <div className="space-y-6 relative pl-5 border-l border-border-subtle/50 ml-1">
                                {timeline.map((step, idx) => (
                                    <div key={idx} className="relative">
                                        <div className={`absolute -left-[24.5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 ${step.status === 'completed' ? 'bg-emerald-500 border-emerald-500/30' : step.status === 'upcoming' ? 'bg-cyan-500 border-white dark:border-navy-900 animate-pulse shadow-[0_0_12px_rgba(6,182,212,0.5)]' : 'bg-bg-primary border-border-subtle'}`} />
                                        <div className="flex flex-col gap-0.5">
                                            <span className={`text-[11px] font-black uppercase tracking-widest ${step.status === 'completed' ? 'text-text-primary' : step.status === 'upcoming' ? 'text-cyan-600 dark:text-cyan-400 font-black' : 'text-text-muted opacity-40 italic'}`}>{step.title}</span>
                                            <span className="text-[10px] text-text-muted font-bold opacity-60 tracking-tight">{step.date}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="pt-6 border-t border-border-subtle space-y-3">
                            <div className="flex flex-col gap-2.5">
                                <a href={`mailto:${candidate.email}`} className="flex items-center gap-3 p-3 rounded-xl bg-bg-primary border border-border-subtle hover:bg-bg-secondary transition-all shadow-inner">
                                    <Mail className="w-4 h-4 text-text-muted" />
                                    <span className="text-[12px] text-text-secondary font-bold truncate">{candidate.email || '-'}</span>
                                </a>
                                <div className="flex gap-2.5">
                                    {candidate.linkedinUrl && (
                                        <a href={candidate.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl bg-[#0077b5]/10 border border-[#0077b5]/20 hover:bg-[#0077b5]/20 transition-all shadow-sm">
                                            <Linkedin className="w-4 h-4 text-[#0077b5]" />
                                            <span className="text-[11px] font-black text-[#0077b5] uppercase tracking-tight">LinkedIn</span>
                                        </a>
                                    )}
                                    <button onClick={() => setViewCandidateId(null)} className="p-3 rounded-xl bg-red-500/5 border border-red-500/10 text-red-500 hover:bg-red-500/20 transition-all shadow-sm">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* MAIN CONTENT: TABBED INTERFACE */}
                <main className="flex-1 flex flex-col gap-6">

                    {/* Tab Navigation */}
                    <nav className="flex items-center gap-1.5 p-1.5 bg-bg-secondary/80 backdrop-blur-md rounded-2xl border border-border-subtle self-start shrink-0 shadow-lg relative z-20">
                        {[
                            { id: 'overview', label: 'AI Analizi', icon: Cpu },
                            { id: 'interviews', label: 'Mülakatlar', icon: MessageSquare },
                            { id: 'cv', label: 'Belge & Veri', icon: FileText }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-3 px-6 py-2.5 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20' : 'text-text-muted hover:text-text-primary hover:bg-bg-primary'}`}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </nav>

                    {/* Tab Content Panels */}
                    <div className="flex-1 min-h-0 bg-bg-secondary/40 backdrop-blur-2xl rounded-[2.5rem] border border-border-subtle p-6 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-[100px] -z-10 pointer-events-none" />

                        {/* 1. OVERVIEW & STAR TAB */}
                        {activeTab === 'overview' && (
                            <div className="flex flex-col gap-4 h-full overflow-y-auto custom-scrollbar animate-fade-in pr-2">
                                <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 shrink-0 h-full">
                                    <div className="xl:col-span-3 h-full">
                                        <StarScoreCard
                                            candidate={candidate}
                                            onRefresh={handleRefreshAnalysis}
                                            analysis={(() => {
                                                if (candidate.aiAnalysis?.starAnalysis) {
                                                    const star = candidate.aiAnalysis.starAnalysis;
                                                    const getSafeScore = (val) => {
                                                        if (typeof val === 'number') return val;
                                                        if (typeof val === 'object' && val !== null && val.score !== undefined) return Number(val.score);
                                                        return 0;
                                                    };
                                                    return {
                                                        Summary: candidate.aiAnalysis.summary,
                                                        Situation: getSafeScore(star.Situation),
                                                        Task: getSafeScore(star.Task),
                                                        Action: getSafeScore(star.Action),
                                                        Result: getSafeScore(star.Result),
                                                        Details: star
                                                    };
                                                }
                                                const baseScore = candidate.matchScore ? candidate.matchScore / 10 : 0;
                                                return {
                                                    Summary: candidate.summary || "Analiz bekleniyor...",
                                                    Situation: Math.round(baseScore), Task: Math.round(baseScore), Action: Math.round(baseScore), Result: Math.round(baseScore)
                                                };
                                            })()}
                                        />
                                    </div>

                                    <div className="xl:col-span-2 bg-bg-primary/50 backdrop-blur-xl rounded-[2.5rem] p-8 border border-border-subtle flex flex-col shrink-0 shadow-inner overflow-hidden relative group h-full">
                                        <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <h3 className="text-[10px] font-black text-text-primary uppercase tracking-widest mb-6 flex items-center gap-2 relative z-10">
                                            <div className="w-1.5 h-4 bg-cyan-500 rounded-full" /> AI ÖZET & STRATEJİK TESPİTLER
                                        </h3>
                                        <div className="flex-1 flex flex-col bg-bg-secondary/40 p-6 rounded-2xl border border-border-subtle relative z-10 shadow-inner">
                                            <p className="text-[13px] text-text-secondary leading-relaxed italic font-black opacity-90">
                                                "{candidate.summary || 'Analiz özeti bekleniyor.'}"
                                            </p>
                                        </div>
                                        <div className="mt-8 grid grid-cols-2 gap-4 relative z-10">
                                            <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 shadow-sm">
                                                <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.2em] block mb-3">POZİTİF GÖSTERGELER</span>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {candidate.aiAnalysis?.topSkills?.slice(0, 3).map((s, i) => (
                                                        <span key={i} className="px-2 py-1 rounded bg-emerald-500/10 text-[9px] font-black text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 uppercase tracking-tighter shadow-sm">{s.skill || s}</span>
                                                    )) || <span className="text-[9px] text-text-muted italic opacity-40">Veri yok</span>}
                                                </div>
                                            </div>
                                            <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 shadow-sm">
                                                <span className="text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-[0.2em] block mb-3">GELİŞİM ALANLARI</span>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {candidate.aiAnalysis?.gapAnalysis?.slice(0, 3).map((g, i) => (
                                                        <span key={i} className="px-2 py-1 rounded bg-amber-500/10 text-[9px] font-black text-amber-600 dark:text-amber-400 border border-amber-500/20 uppercase tracking-tighter shadow-sm">{g.gap || g}</span>
                                                    )) || <span className="text-[9px] text-text-muted italic opacity-40">Veri yok</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 2. INTERVIEWS TAB */}
                        {activeTab === 'interviews' && (
                            <div className="bg-bg-secondary/40 backdrop-blur-xl rounded-[2rem] p-5 border border-border-subtle h-full flex flex-col animate-fade-in overflow-hidden shadow-xl">
                                <div className="flex items-center justify-between mb-4 shrink-0 px-2">
                                    <div className="flex items-center gap-3">
                                        <MessageSquare className="w-5 h-5 text-cyan-500" />
                                        <h3 className="text-[12px] font-black text-text-primary tracking-widest uppercase">Seans Geçmişi</h3>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={async () => {
                                                const sessId = `iv-${candidate.id.substring(0, 4)}-${Date.now().toString().slice(-4)}`;
                                                const newSession = {
                                                    id: sessId,
                                                    status: 'planned',
                                                    date: new Date().toISOString(),
                                                    type: 'live_corporate',
                                                    typeLabel: 'Canlı Kurumsal Mülakat',
                                                    isLiveMode: true,
                                                    timestamp: new Date().toISOString()
                                                };

                                                try {
                                                    await updateCandidate(candidate.id, {
                                                        interviewSessions: [...(candidate.interviewSessions || []), newSession],
                                                        status: 'interview'
                                                    });
                                                    navigate(`/interview/${sessId}`);
                                                } catch (err) {
                                                    console.error("Failed to create live session:", err);
                                                    navigate(`/interview/${sessId}`);
                                                }
                                            }}
                                            className="px-5 py-2.5 rounded-xl bg-violet-600 text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-violet-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                                        >
                                            <Video className="w-4 h-4" />
                                            Yeni Canlı Mülakat
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                                    {candidate.interviewSessions?.length > 0 ? (
                                        <InterviewHistory
                                            sessions={candidate.interviewSessions}
                                            onStartSession={(session) => {
                                                navigate(`/interview/${session.id}`);
                                            }}
                                        />
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-center py-20 opacity-40">
                                            <MessageSquare className="w-12 h-12 text-text-muted mb-4" />
                                            <h4 className="text-xs font-black uppercase tracking-widest text-text-primary">Henüz Kayıt Yok</h4>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* 3. CV & DATA TAB */}
                        {activeTab === 'cv' && (
                            <div className="h-full flex flex-col gap-6 animate-fade-in">
                                <div className="bg-bg-secondary/40 backdrop-blur-xl rounded-[2.5rem] p-8 border border-border-subtle flex-1 flex flex-col items-center justify-center text-center relative overflow-hidden shadow-2xl">
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-[100px] -z-10" />

                                    <div className="w-20 h-20 rounded-3xl bg-bg-primary border border-border-subtle flex items-center justify-center mb-6 shadow-xl">
                                        <FileText className="w-10 h-10 text-cyan-500/60" />
                                    </div>

                                    <h4 className="text-xl font-black text-text-primary mb-2">Orijinal Aday Özgeçmişi</h4>
                                    <p className="text-[12px] text-text-muted max-w-sm mb-8 leading-relaxed font-bold opacity-70">
                                        Adayın yüklemiş olduğu orijinal PDF/Docx belgesi güvenli ortamda saklanmaktadır. Görüntülemek için aşağıdaki butonu kullanın.
                                    </p>

                                    {candidate.cvUrl ? (
                                        <div className="flex flex-col gap-4 w-full max-w-xs">
                                            <a
                                                href={candidate.cvUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="w-full py-4 rounded-2xl bg-cyan-500 text-white font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-cyan-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                                            >
                                                <ExternalLink className="w-4 h-4" /> CV'Yİ ŞİMDİ GÖRÜNTÜLE
                                            </a>
                                            <p className="text-[10px] text-text-muted font-black uppercase tracking-widest mt-2 opacity-50 italic">Belge yeni sekmede güvenli bir şekilde açılacaktır.</p>
                                        </div>
                                    ) : (
                                        <div className="p-6 rounded-2xl bg-bg-primary/50 border border-border-subtle text-left font-mono text-xs text-text-secondary leading-relaxed whitespace-pre-wrap w-full max-w-2xl max-h-[400px] overflow-y-auto custom-scrollbar shadow-inner">
                                            <div className="flex items-center gap-2 mb-4 text-amber-500/80 font-black uppercase tracking-tighter">
                                                <Clock className="w-4 h-4" /> Orijinal Dosya Bulunamadı (Süre Aşımı)
                                            </div>
                                            {candidate.cvData || candidate.summary || "Detaylı döküm bulunamadı."}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* Modals */}
            {sendModalPurpose && (
                <SendMessageModal
                    candidate={candidate}
                    initialPurpose={sendModalPurpose}
                    onSent={handleMessageSent}
                    onClose={() => setSendModalPurpose(null)}
                />
            )}
        </div>
    );
}
