// src/pages/CandidateProcessPage.jsx
import { useMemo, useState } from 'react';
import Header from '../components/Header';
import StarScoreCard from '../components/StarScoreCard';
import InterviewSessionModal from '../components/InterviewSessionModal';
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
} from 'lucide-react';
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
    const [sendModalPurpose, setSendModalPurpose] = useState(null);
    const [showInterviewModal, setShowInterviewModal] = useState(false);
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
        <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-navy-950">
            <Header title="Aday Süreç Portalı" />
            <div className="bg-white/5 p-12 rounded-[2.5rem] border border-white/10 max-w-sm">
                <Activity className="w-12 h-12 text-navy-600 mx-auto mb-6" />
                <h2 className="text-xl font-bold text-text-primary mb-2">Aktif Aday Seçilmedi</h2>
                <p className="text-sm text-navy-400 mb-8">Havuzda aktif aday bulunmamaktadır.</p>
                <button onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'dashboard' }))} className="w-full py-3 bg-electric rounded-xl font-bold text-xs uppercase tracking-widest transition-all hover:bg-electric-light">Havuzu Görüntüle</button>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-navy-999 flex flex-col">
            <Header title="Aday Süreç Komuta Merkezi" />

            <div className="flex-1 flex flex-col lg:flex-row gap-5 p-5 lg:p-6 max-w-[1600px] mx-auto w-full">

                {/* LEFT SIDEBAR: PROFILE & STATUS (FIXED WIDTH) */}
                <aside className="w-full lg:w-96 flex flex-col gap-5 shrink-0">

                    {/* Compact Profile Card */}
                    <div className="glass rounded-[2rem] p-6 border border-white/[0.08] relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-electric/10 rounded-full blur-3xl -z-10 -translate-y-1/2 translate-x-1/2" />

                        <div className="flex items-center gap-4 mb-5">
                            <div className="relative shrink-0">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-electric to-violet-600 flex items-center justify-center text-xl font-black text-white shadow-xl">
                                    {candidate.name?.substring(0, 2) || 'AD'}
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h2 className="text-xl font-black text-text-primary truncate">{candidate.name || 'İsimsiz'}</h2>
                                <p className="text-[11px] font-bold text-electric mt-1 flex items-center gap-1.5 uppercase tracking-wider">
                                    <Terminal className="w-3.5 h-3.5" /> {candidate.id.substring(0, 8)}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4 pt-4 border-t border-white/5">
                            <div className="grid grid-cols-1 gap-3">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] uppercase tracking-widest text-navy-500 font-black">Hedef Pozisyon</label>
                                    <select
                                        value={candidate.matchedPositionTitle || candidate.position || ''}
                                        onChange={handleTargetPositionChange}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-navy-200 outline-none hover:bg-white/10 transition-all"
                                    >
                                        <option value="" disabled>Seçin</option>
                                        <option value={candidate.position || 'Mevcut'}>Mevcut Pozisyon</option>
                                        {positions?.map(pos => <option key={pos.id} value={pos.title}>{pos.title}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] uppercase tracking-widest text-navy-500 font-black">Süreç Durumu</label>
                                    <select
                                        value={candidate.status}
                                        onChange={(e) => updateCandidate(candidate.id, { status: e.target.value })}
                                        className="w-full bg-navy-950/50 border border-electric/30 rounded-xl px-3 py-2 text-xs font-black text-electric uppercase outline-none hover:border-electric transition-all"
                                    >
                                        {Object.entries(STATUS_LABELS).map(([key, label]) => (
                                            <option key={key} value={key} className="bg-navy-900 text-text-primary">{label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <button onClick={() => setSendModalPurpose('general')} className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.08] transition-all group">
                                    <Mail className="w-4 h-4 text-navy-400 group-hover:text-electric" />
                                    <span className="text-[11px] font-black text-navy-500 group-hover:text-text-primary uppercase">Mesaj</span>
                                </button>
                                <button onClick={() => setSendModalPurpose('interview')} className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.08] transition-all group">
                                    <Calendar className="w-4 h-4 text-navy-400 group-hover:text-emerald-400" />
                                    <span className="text-[11px] font-black text-navy-500 group-hover:text-text-primary uppercase">Planla</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Timeline & Quick Contact */}
                    <div className="glass rounded-[2rem] p-6 border border-white/[0.08]">
                        <div className="mb-6">
                            <h3 className="text-[10px] font-black text-navy-500 mb-5 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Clock className="w-4 h-4 text-emerald-400" /> Süreç Akışı
                            </h3>
                            <div className="space-y-5 relative pl-4 border-l border-white/5">
                                {timeline.map((step, idx) => (
                                    <div key={idx} className="relative">
                                        <div className={`absolute -left-[20.5px] top-1 w-2 h-2 rounded-full border ${step.status === 'completed' ? 'bg-emerald-500 border-emerald-500/30' : step.status === 'upcoming' ? 'bg-electric border-electric/30 animate-pulse' : 'bg-navy-800 border-navy-800'}`} />
                                        <div className="flex flex-col gap-0.5">
                                            <span className={`text-[11px] font-black uppercase tracking-wider ${step.status === 'completed' ? 'text-text-primary' : step.status === 'upcoming' ? 'text-electric' : 'text-navy-600'}`}>{step.title}</span>
                                            <span className="text-[10px] text-navy-600 font-bold">{step.date}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="pt-6 border-t border-white/5 space-y-3">
                            <div className="flex flex-col gap-2.5">
                                <a href={`mailto:${candidate.email}`} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-all">
                                    <Mail className="w-4 h-4 text-navy-400" />
                                    <span className="text-[12px] text-navy-300 font-medium truncate">{candidate.email || '-'}</span>
                                </a>
                                <div className="flex gap-2.5">
                                    {candidate.linkedinUrl && (
                                        <a href={candidate.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl bg-[#0077b5]/10 border border-[#0077b5]/20 hover:bg-[#0077b5]/20 transition-all">
                                            <Linkedin className="w-4 h-4 text-[#0077b5]" />
                                            <span className="text-[11px] font-black text-[#0077b5] uppercase">LinkedIn</span>
                                        </a>
                                    )}
                                    <button onClick={() => setViewCandidateId(null)} className="p-3 rounded-xl bg-red-500/5 border border-red-500/10 text-red-500 hover:bg-red-500/10 transition-all">
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
                    <nav className="flex items-center gap-1.5 p-1.5 bg-navy-900/50 rounded-2xl border border-white/5 self-start shrink-0">
                        {[
                            { id: 'overview', label: 'AI Analizi', icon: Cpu },
                            { id: 'interviews', label: 'Mülakatlar', icon: MessageSquare },
                            { id: 'cv', label: 'Belge & Veri', icon: FileText }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-3 px-6 py-2.5 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-electric text-white shadow-xl shadow-electric/20' : 'text-navy-400 hover:text-navy-200 hover:bg-white/5'}`}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </nav>

                    {/* Tab Content Panels */}
                    <div className="flex-1 min-h-0">

                        {/* 1. OVERVIEW & STAR TAB */}
                        {activeTab === 'overview' && (
                            <div className="flex flex-col gap-4 h-full overflow-y-auto custom-scrollbar animate-fade-in pr-2">
                                <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 shrink-0">
                                    <div className="xl:col-span-3">
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
                                                    Situation: Math.round(baseScore), Goal: Math.round(baseScore), Action: Math.round(baseScore), Result: Math.round(baseScore)
                                                };
                                            })()}
                                        />
                                    </div>

                                    <div className="xl:col-span-2 glass rounded-[2rem] p-5 border border-white/[0.08] flex flex-col shrink-0">
                                        <h3 className="text-[10px] font-black text-text-primary uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <div className="w-1 h-3 bg-electric rounded-full" /> AI ÖZET & TESPİTLER
                                        </h3>
                                        <div className="flex-1 flex flex-col justify-center bg-white/[0.02] p-4 rounded-xl border border-white/[0.04]">
                                            <p className="text-[13px] text-navy-200 leading-relaxed italic font-medium">
                                                "{candidate.summary || 'Analiz özeti bekleniyor.'}"
                                            </p>
                                        </div>
                                        <div className="mt-4 grid grid-cols-2 gap-3">
                                            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                                                <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest block mb-1">Güçlü</span>
                                                <div className="flex flex-wrap gap-1">
                                                    {candidate.aiAnalysis?.topSkills?.slice(0, 2).map((s, i) => (
                                                        <span key={i} className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-[9px] font-bold text-emerald-400 border border-emerald-500/20">{s.skill || s}</span>
                                                    )) || <span className="text-[9px] text-navy-500 italic">-</span>}
                                                </div>
                                            </div>
                                            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
                                                <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest block mb-1">Gelişim</span>
                                                <div className="flex flex-wrap gap-1">
                                                    {candidate.aiAnalysis?.gapAnalysis?.slice(0, 2).map((g, i) => (
                                                        <span key={i} className="px-1.5 py-0.5 rounded bg-amber-500/10 text-[9px] font-bold text-amber-400 border border-amber-500/20">{g.gap || g}</span>
                                                    )) || <span className="text-[9px] text-navy-500 italic">-</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 2. INTERVIEWS TAB */}
                        {activeTab === 'interviews' && (
                            <div className="glass rounded-[1.5rem] p-5 border border-white/[0.08] h-full flex flex-col animate-fade-in overflow-hidden">
                                <div className="flex items-center justify-between mb-4 shrink-0">
                                    <div className="flex items-center gap-3">
                                        <MessageSquare className="w-5 h-5 text-electric" />
                                        <h3 className="text-sm font-black text-text-primary tracking-tight uppercase">Seans Geçmişi</h3>
                                    </div>
                                    <button
                                        onClick={() => setShowInterviewModal(true)}
                                        className="px-4 py-2 rounded-lg bg-electric text-white font-black text-[9px] uppercase tracking-widest shadow-lg shadow-electric/20 hover:scale-105 active:scale-95 transition-all"
                                    >
                                        Yeni Seans
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                                    {candidate.interviewSessions?.length > 0 ? (
                                        <InterviewHistory sessions={candidate.interviewSessions} />
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                                            <MessageSquare className="w-8 h-8 text-navy-600 mb-4" />
                                            <h4 className="text-xs font-bold text-text-primary">Henüz Kayıt Yok</h4>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* 3. CV & DATA TAB */}
                        {activeTab === 'cv' && (
                            <div className="h-full flex flex-col gap-6 animate-fade-in">
                                <div className="glass rounded-[2rem] p-8 border border-white/[0.08] flex-1 flex flex-col items-center justify-center text-center relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-electric/5 rounded-full blur-[100px] -z-10" />

                                    <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-2xl">
                                        <FileText className="w-10 h-10 text-electric/60" />
                                    </div>

                                    <h4 className="text-xl font-black text-text-primary mb-2">Orijinal Aday Özgeçmişi</h4>
                                    <p className="text-xs text-navy-400 max-w-sm mb-8 leading-relaxed">
                                        Adayın yüklemiş olduğu orijinal PDF/Docx belgesi güvenli ortamda saklanmaktadır. Görüntülemek için aşağıdaki butonu kullanın.
                                    </p>

                                    {candidate.cvUrl ? (
                                        <div className="flex flex-col gap-4 w-full max-w-xs">
                                            <a
                                                href={candidate.cvUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="w-full py-4 rounded-2xl bg-electric text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-electric/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                                            >
                                                <ExternalLink className="w-4 h-4" /> CV'Yİ ŞİMDİ GÖRÜNTÜLE
                                            </a>
                                            <p className="text-[10px] text-navy-500 font-bold italic">Belge yeni sekmede güvenli bir şekilde açılacaktır.</p>
                                        </div>
                                    ) : (
                                        <div className="p-6 rounded-2xl bg-navy-950/50 border border-white/5 text-left font-mono text-xs text-navy-400 leading-relaxed whitespace-pre-wrap w-full max-w-2xl max-h-[400px] overflow-y-auto custom-scrollbar">
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
            {showInterviewModal && (
                <InterviewSessionModal
                    candidate={candidate}
                    onClose={() => setShowInterviewModal(false)}
                    onSessionSaved={() => setShowInterviewModal(false)}
                />
            )}
        </div>
    );
}
