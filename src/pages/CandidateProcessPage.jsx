// src/pages/CandidateProcessPage.jsx
// Transparent Dashboard for Candidates

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
    MoreVertical,
    Download,
    Activity,
    Briefcase,
    Calendar,
    MessageSquare,
    Clock,
    Mail,
    Phone,
    FileText,
    ExternalLink
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

    const candidate = useMemo(() => {
        if (!viewCandidateId && candidates.length > 0) return candidates[0];
        return candidates.find(c => c.id === viewCandidateId) || null;
    }, [candidates, viewCandidateId]);

    const handleMessageSent = async (data) => {
        try {
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

            if (data.purpose === 'interview' && candidate.status === 'review') {
                await updateCandidate(candidate.id, { status: 'interview' });
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
            alert("Pozisyon güncellenirken bir hata oluştu.");
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
            { title: 'Otonom AI Analizi', date: candidate.aiAnalysis ? 'Tamamlandı' : 'Bekleniyor', status: candidate.aiAnalysis ? 'completed' : 'upcoming' },
            { title: 'Mülakat & Değerlendirme', date: current === 'interview' ? 'Aktif' : '-', status: (current === 'offer' || isHired || isRejected) ? 'completed' : (current === 'interview' ? 'upcoming' : 'pending') },
            { title: 'Sonuç', date: isHired || isRejected ? 'Neticelendi' : '-', status: isRejected ? 'rejected' : (isHired ? 'completed' : 'pending') }
        ];
    }, [candidate]);

    if (!candidate) return (
        <div className="min-h-screen flex flex-col relative isolate">


            <Header title="Aday Süreç Portalı" />
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-navy-950">
                <div className="w-24 h-24 rounded-[2.5rem] bg-white/[0.03] border border-white/[0.08] flex items-center justify-center mb-8 relative group">
                    <div className="absolute inset-0 bg-electric/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    <Activity className="w-10 h-10 text-navy-700" />
                </div>
                <h2 className="text-2xl font-black text-text-primary mb-3 uppercase tracking-tight">Aktif Aday Bulunamadı</h2>
                <p className="text-sm text-navy-500 max-w-sm font-medium leading-relaxed">
                    Süreç takibi yapılacak aday bulunmuyor. Lütfen dashboard üzerinden bir aday seçin veya yeni bir aday ekleyin.
                </p>
                <button
                    onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'dashboard' }))}
                    className="mt-8 px-8 py-3.5 rounded-2xl bg-electric hover:bg-electric-light text-text-primary font-black text-[10px] uppercase tracking-widest transition-all shadow-xl shadow-electric/20"
                >
                    Aday Havuzuna Git
                </button>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen pb-20 relative isolate">


            <Header title="Aday Süreç Portalı" />

            <div className="flex items-center justify-end px-6 lg:px-8 py-3 mb-2">
                <div className="flex items-center gap-3">
                    <span className="text-[11px] font-bold text-navy-400 uppercase tracking-wider">Aday Değiştir:</span>
                    <select
                        value={candidate.id}
                        onChange={(e) => setViewCandidateId(e.target.value)}
                        className="px-4 py-2 rounded-xl bg-navy-800 border border-white/[0.06] text-sm text-text-primary font-medium outline-none focus:border-electric cursor-pointer hover:bg-white/[0.04] transition-all"
                    >
                        {candidates.map(c => (
                            <option key={c.id} value={c.id}>{c.name || 'İsimsiz'} ({STATUS_LABELS[c.status] || c.status})</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 lg:px-8 space-y-8">
                {/* Hero Profile Section */}
                <div className="relative group/hero">
                    <div className="absolute -inset-1 bg-gradient-to-r from-electric/20 via-violet-500/20 to-cyan-500/20 rounded-[3rem] blur-2xl opacity-0 group-hover/hero:opacity-100 transition-opacity duration-700 -z-10" />
                    <div className="glass rounded-[3rem] p-8 md:p-10 border border-white/[0.08] relative overflow-hidden">
                        {/* Background Decoration */}
                        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-electric/[0.03] rounded-full blur-[120px] -z-10 -translate-y-1/2 translate-x-1/2" />
                        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-violet-600/[0.02] rounded-full blur-[100px] -z-10 translate-y-1/2 -translate-x-1/2" />

                        <div className="flex flex-col lg:flex-row gap-10 items-start">
                            {/* Profile Core */}
                            <div className="flex flex-col md:flex-row items-center md:items-start gap-8 flex-1 w-full">
                                <div className="relative shrink-0">
                                    <div className="w-28 h-28 rounded-[2.5rem] bg-gradient-to-br from-electric via-blue-600 to-violet-600 flex items-center justify-center text-3xl font-black text-text-primary shadow-2xl shadow-electric/30 uppercase ring-4 ring-white/10 ring-offset-4 ring-offset-navy-950">
                                        {candidate.name?.substring(0, 2) || 'AD'}
                                    </div>
                                    <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-navy-900 border-2 border-white/10 flex items-center justify-center shadow-lg">
                                        <BadgeCheck className="w-6 h-6 text-electric" />
                                    </div>
                                </div>

                                <div className="flex-1 text-center md:text-left space-y-4">
                                    <div>
                                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-2">
                                            <h2 className="text-3xl md:text-4xl font-black text-text-primary tracking-tight">{candidate.name || 'İsimsiz Aday'}</h2>
                                            <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-black text-navy-400 uppercase tracking-widest flex items-center gap-1.5">
                                                <Terminal className="w-3 h-3" /> {candidate.id.substring(0, 8)}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-navy-400 text-sm font-medium">
                                            <div className="flex items-center gap-2 group/pos">
                                                <Briefcase className="w-4 h-4 text-electric" />
                                                <select
                                                    value={candidate.matchedPositionTitle || candidate.position || ''}
                                                    onChange={handleTargetPositionChange}
                                                    className="bg-navy-900/50 hover:bg-navy-800 border border-white/5 rounded-xl px-3 py-1.5 cursor-pointer text-xs font-bold text-electric-light focus:outline-none focus:border-electric transition-all pr-8 appearance-none relative"
                                                >
                                                    <option value="" disabled>Pozisyon Seçin</option>
                                                    <option value={candidate.position || 'Mevcut Pozisyon'}>{candidate.position || 'Mevcut Pozisyon'} (Orjinal)</option>
                                                    {positions?.map(pos => <option key={pos.id} value={pos.title}>{pos.title}</option>)}
                                                </select>
                                            </div>
                                            <span className="w-1.5 h-1.5 rounded-full bg-navy-800" />
                                            <div className="flex items-center gap-2">
                                                <MapPin className="w-4 h-4 text-cyan-400" />
                                                <span>İstanbul, TR</span>
                                            </div>
                                            <span className="w-1.5 h-1.5 rounded-full bg-navy-800" />
                                            <div className="flex items-center gap-2 text-emerald-400 font-bold">
                                                <Shield className="w-4 h-4" />
                                                <span>KVKK Onaylı</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap justify-center md:justify-start gap-2 pt-2">
                                        <div className="px-4 py-2 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-xs font-bold text-text-primary flex items-center gap-2">
                                            <select
                                                value={candidate.status}
                                                onChange={(e) => updateCandidate(candidate.id, { status: e.target.value })}
                                                className="bg-transparent text-electric font-black uppercase tracking-widest cursor-pointer focus:outline-none"
                                            >
                                                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                                                    <option key={key} value={key} className="bg-navy-800 text-text-primary capitalize">{label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="px-4 py-2 rounded-2xl bg-electric/10 border border-electric/20 text-xs font-black text-electric uppercase tracking-widest flex items-center gap-2">
                                            <Cpu className="w-3.5 h-3.5" /> AI Skoru: %{candidate.matchScore || 0}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Main CTAs */}
                            <div className="flex flex-col sm:flex-row lg:flex-col gap-4 w-full lg:w-auto shrink-0">
                                <button
                                    onClick={() => setSendModalPurpose('general')}
                                    className="px-8 py-4 rounded-[1.5rem] bg-white text-navy-950 font-black text-xs uppercase tracking-widest hover:bg-electric hover:text-text-primary transition-all shadow-xl shadow-white/5 flex items-center justify-center gap-3 group"
                                >
                                    <Mail className="w-5 h-5" /> Mesaj Gönder
                                </button>
                                <button
                                    onClick={() => { setSendModalPurpose('interview'); }}
                                    className="px-8 py-4 rounded-[1.5rem] bg-electric text-text-primary font-black text-xs uppercase tracking-widest hover:bg-electric-light transition-all shadow-xl shadow-electric/20 flex items-center justify-center gap-3"
                                >
                                    <Calendar className="w-5 h-5" /> Mülakat Planla
                                </button>
                                <button
                                    onClick={() => window.open(candidate.cvUrl, '_blank')}
                                    className="px-8 py-4 rounded-[1.5rem] bg-navy-900 border border-white/10 text-text-primary font-black text-xs uppercase tracking-widest hover:bg-white/5 transition-all flex items-center justify-center gap-3"
                                >
                                    <Download className="w-5 h-5 text-navy-400" /> CV İndir
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* LEFT PANEL (1/4) */}
                    <div className="lg:col-span-1 space-y-6">
                        {/* Status Timeline */}
                        <div className="glass rounded-[2rem] p-6 border border-white/[0.06] relative overflow-hidden group/process">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl -z-10" />
                            <h3 className="text-[10px] font-black text-navy-500 mb-6 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Activity className="w-3.5 h-3.5 text-emerald-400" /> Süreç Yol Haritası
                            </h3>
                            <div className="relative pl-6 border-l-2 border-white/[0.04] space-y-8">
                                {timeline.map((step, index) => (
                                    <div key={index} className="relative group/step">
                                        <div className={`absolute -left-[33px] top-0 w-6 h-6 rounded-xl border-2 transition-all flex items-center justify-center z-10 ${step.status === 'completed' ? 'bg-navy-950 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : step.status === 'upcoming' ? 'bg-navy-950 border-electric animate-[pulse_2s_infinite]' : step.status === 'rejected' ? 'bg-navy-950 border-red-500' : 'bg-navy-950 border-navy-800'}`}>
                                            {step.status === 'completed' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <div className={`w-1.5 h-1.5 rounded-full ${step.status === 'upcoming' ? 'bg-electric' : 'bg-navy-800'}`} />}
                                        </div>
                                        <div>
                                            <h4 className={`text-xs font-black uppercase tracking-wider ${step.status === 'completed' ? 'text-text-primary' : step.status === 'upcoming' ? 'text-electric' : step.status === 'rejected' ? 'text-red-400' : 'text-navy-500'}`}>{step.title}</h4>
                                            <p className="text-[10px] text-navy-500 font-bold mt-1.5 flex items-center gap-1.5">
                                                <Clock className="w-3 h-3" /> {step.date}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Contact & Social Links */}
                        <div className="glass rounded-[2rem] p-6 border border-white/[0.06]">
                            <h3 className="text-[10px] font-black text-navy-500 mb-4 uppercase tracking-[0.2em] flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" /> Kanallar
                            </h3>
                            <div className="space-y-3">
                                <a href={`mailto:${candidate.email}`} className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:border-white/10 transition-all group/mail">
                                    <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center group-hover/mail:bg-red-500/20 transition-colors">
                                        <Mail className="w-5 h-5 text-red-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[9px] text-navy-500 font-bold uppercase tracking-widest mb-0.5">E-Posta Adresi</p>
                                        <p className="text-xs text-text-primary font-semibold truncate">{candidate.email || '-'}</p>
                                    </div>
                                </a>
                                <a href={`tel:${candidate.phone}`} className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:border-white/10 transition-all group/phone">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center group-hover/phone:bg-emerald-500/20 transition-colors">
                                        <Phone className="w-5 h-5 text-emerald-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[9px] text-navy-500 font-bold uppercase tracking-widest mb-0.5">Telefon Hattı</p>
                                        <p className="text-xs text-text-primary font-semibold">{candidate.phone || '-'}</p>
                                    </div>
                                </a>
                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    {(candidate.linkedinUrl || candidate.linkedin) && (
                                        <a href={(candidate.linkedinUrl || candidate.linkedin).startsWith('http') ? (candidate.linkedinUrl || candidate.linkedin) : `https://${(candidate.linkedinUrl || candidate.linkedin)}`} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-white/[0.02] border border-black/20 hover:bg-[#0077b5]/10 hover:border-[#0077b5]/30 transition-all group/li">
                                            <Linkedin className="w-5 h-5 text-navy-400 group-hover/li:text-[#0077b5]" />
                                            <span className="text-[10px] font-black text-navy-500 uppercase group-hover/li:text-text-primary">LinkedIn</span>
                                        </a>
                                    )}
                                    {candidate.github && (
                                        <a href={candidate.github.startsWith('http') ? candidate.github : `https://github.com/${candidate.github}`} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-white/[0.02] border border-black/20 hover:bg-white/5 hover:border-white/20 transition-all group/gh">
                                            <Github className="w-5 h-5 text-navy-400 group-hover/gh:text-text-primary" />
                                            <span className="text-[10px] font-black text-navy-500 uppercase group-hover/gh:text-text-primary">GitHub</span>
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* MAIN COLUMN (3/4) */}
                    <div className="lg:col-span-3 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* STAR Scorecard */}
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
                                        return { Summary: candidate.aiAnalysis.summary, Situation: getSafeScore(star.Situation), Task: getSafeScore(star.Task), Action: getSafeScore(star.Action), Result: getSafeScore(star.Result), Details: star };
                                    }
                                    const baseScore = candidate.matchScore ? candidate.matchScore / 10 : 0;
                                    return { Summary: candidate.summary || "Analiz bekleniyor...", Situation: Math.round(baseScore), Task: Math.round(baseScore), Action: Math.round(baseScore), Result: Math.round(baseScore) };
                                })()}
                            />

                            {/* Interview Section (Taşınan Alan) */}
                            {/* Interview Section (Taşınan Alan) */}
                            <div className="relative glass rounded-[2.5rem] p-8 border border-white/[0.08] flex flex-col h-full overflow-hidden group/interview">
                                <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-electric/5 rounded-full blur-[100px] -z-10 -translate-y-1/2 translate-x-1/2 group-hover/interview:bg-electric/10 transition-colors duration-700" />

                                <div className="flex flex-col mb-8">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xl font-black text-text-primary flex items-center gap-4 tracking-tight">
                                            <div className="w-12 h-12 rounded-[1.25rem] bg-electric/10 flex items-center justify-center border border-electric/20">
                                                <MessageSquare className="w-6 h-6 text-electric" />
                                            </div>
                                            Mülakat Paneli
                                        </h3>
                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            <span className="text-[10px] font-black text-text-primary uppercase tracking-widest leading-none">
                                                {candidate.interviewSessions?.length || 0} SEANS
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 flex flex-col min-h-0">
                                    {candidate.interviewSessions?.length > 0 ? (
                                        <div className="flex-1 overflow-y-auto pr-4 mb-8 custom-scrollbar">
                                            <InterviewHistory sessions={candidate.interviewSessions} />
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex flex-col items-center justify-center text-center p-10 rounded-[2rem] mb-8 bg-white/[0.01] border border-white/[0.05] relative overflow-hidden group/empty">
                                            <div className="absolute inset-0 bg-gradient-to-br from-electric/5 via-transparent to-transparent opacity-0 group-hover/empty:opacity-100 transition-opacity duration-700" />
                                            <div className="w-20 h-20 rounded-[2rem] bg-navy-900 border border-white/5 flex items-center justify-center mb-6 relative z-10 shadow-2xl group-hover/empty:scale-110 transition-transform duration-500">
                                                <MessageSquare className="w-10 h-10 text-navy-700 group-hover/empty:text-electric transition-colors" />
                                            </div>
                                            <p className="text-sm font-black text-text-primary mb-2 relative z-10 uppercase tracking-widest">Oturum Başlatılmadı</p>
                                            <p className="text-[11px] text-navy-500 relative z-10 max-w-[220px] leading-relaxed font-medium">Adayın mülakat performansını takip etmek için ilk oturumu şimdi açın.</p>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-auto">
                                    <button
                                        onClick={() => setShowInterviewModal(true)}
                                        className="w-full py-4.5 rounded-[1.5rem] bg-white/[0.03] hover:bg-white/[0.07] text-text-primary border border-white/10 font-black text-xs uppercase tracking-[0.2em] transition-all duration-300 flex items-center justify-center gap-3 group/btn"
                                    >
                                        <Activity className="w-5 h-5 text-emerald-400 group-hover/btn:scale-125 transition-transform" /> Canlı Mülakat Notu Gir
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* CV View */}
                        <div className="glass rounded-[2.5rem] p-4 md:p-8 border border-white/[0.08] relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-[1.25rem] bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                                        <FileText className="w-6 h-6 text-purple-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-text-primary tracking-tight">Orijinal Özgeçmiş</h3>
                                        <p className="text-[10px] text-navy-500 font-bold uppercase tracking-widest mt-1">Belge Kayıt & Önizleme</p>
                                    </div>
                                </div>
                                {candidate.cvUrl && (
                                    <a href={candidate.cvUrl} target="_blank" rel="noopener noreferrer" className="px-6 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-text-primary text-[10px] font-black uppercase tracking-widest border border-white/10 hover:border-purple-500/30 transition-all flex items-center gap-2">
                                        <ExternalLink className="w-4 h-4" /> Tam Ekran
                                    </a>
                                )}
                            </div>

                            <div className="rounded-[2rem] overflow-hidden border border-white/10 bg-black/40 h-[750px] w-full relative group/cv">
                                <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-navy-950/40 to-transparent z-10 pointer-events-none opacity-0 group-hover/cv:opacity-100 transition-opacity" />
                                {candidate.cvUrl ? (
                                    <iframe
                                        src={`${candidate.cvUrl}#toolbar=0`}
                                        className="w-full h-full border-none"
                                        title="CV Preview"
                                        onError={(e) => {
                                            console.warn("CV dosyası yüklenemedi, KVKK kapsamında silinmiş olabilir.");
                                        }}
                                    />
                                ) : (
                                    <div className="w-full h-full p-12 flex flex-col items-center justify-center text-center space-y-4">
                                        <div className="w-20 h-20 rounded-full bg-navy-800 flex items-center justify-center">
                                            <FileText className="w-10 h-10 text-navy-600" />
                                        </div>
                                        <div>
                                            <h4 className="text-lg font-bold text-text-primary">Orijinal Belge Mevcut Değil</h4>
                                            <p className="text-sm text-navy-400 max-w-sm mx-auto mt-2">
                                                KVKK ve veri minimizasyonu politikası gereği ham belgeler 15 gün sonra güvenli bir şekilde silinmektedir.
                                                <br /><br />
                                                Adayın <b>{candidate.email}</b> e-posta adresi ve AI tarafından ayrıştırılmış profil verileri korunmaktadır.
                                            </p>
                                        </div>
                                        <div className="pt-6 w-full max-w-2xl text-left bg-white/[0.02] p-6 rounded-2xl border border-white/[0.04]">
                                            <div className="flex items-center justify-between mb-4">
                                                <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest flex items-center gap-2">
                                                    <CheckCircle2 className="w-4 h-4" />
                                                    KVKK Uyumlu Ayrıştırılmış CV Verisi
                                                </p>
                                            </div>
                                            <div className="h-[250px] overflow-y-auto pr-4 custom-scrollbar">
                                                {candidate.cvData ? (
                                                    <div className="text-sm text-navy-200 leading-relaxed whitespace-pre-wrap font-mono">
                                                        {candidate.cvData}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-navy-200 italic leading-relaxed">
                                                        "{candidate.summary || candidate.originalText?.substring(0, 300) + '...'}"
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

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
        </div>
    );
}
