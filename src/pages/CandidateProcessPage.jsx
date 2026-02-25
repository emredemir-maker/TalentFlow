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
    Activity,
    Briefcase,
    CheckCircle,
    Calendar,
    MessageSquare,
    Link,
    Clock,
    User,
    Mail,
    Phone,
    FileText,
    Edit2,
    ExternalLink,
    Github,
    Linkedin,
    Globe
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

    if (!candidate) return null;

    return (
        <div className="min-h-screen pb-20">
            <Header title="Aday Süreç Portalı" />

            <div className="flex items-center justify-end px-6 lg:px-8 py-3 mb-2">
                <div className="flex items-center gap-3">
                    <span className="text-[11px] font-bold text-navy-400 uppercase tracking-wider">Aday Değiştir:</span>
                    <select
                        value={candidate.id}
                        onChange={(e) => setViewCandidateId(e.target.value)}
                        className="px-4 py-2 rounded-xl bg-navy-800 border border-white/[0.06] text-sm text-white font-medium outline-none focus:border-electric cursor-pointer hover:bg-white/[0.04] transition-all"
                    >
                        {candidates.map(c => (
                            <option key={c.id} value={c.id}>{c.name || 'İsimsiz'} ({STATUS_LABELS[c.status] || c.status})</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 lg:px-8 space-y-8">
                {/* Status Header */}
                <div className="glass rounded-3xl p-8 border border-white/[0.06] flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-electric/5 rounded-full blur-[100px] -z-10" />
                    <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-electric to-blue-600 flex items-center justify-center text-2xl font-bold text-white shadow-xl shadow-electric/20 uppercase shrink-0">
                            {candidate.name?.substring(0, 2) || 'AD'}
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-1">{candidate.name || 'İsimsiz Aday'}</h2>
                            <div className="flex flex-wrap items-center gap-2 text-navy-300 text-sm">
                                <Briefcase className="w-4 h-4 text-electric shrink-0" />
                                <div className="relative group flex items-center">
                                    <select
                                        value={candidate.matchedPositionTitle || candidate.position || ''}
                                        onChange={handleTargetPositionChange}
                                        className="appearance-none bg-transparent hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06] rounded-lg px-2 py-1 pr-6 cursor-pointer text-sm text-electric-light focus:outline-none focus:border-electric transition-all"
                                    >
                                        <option value="" disabled>Pozisyon Seçin</option>
                                        <option value={candidate.position || 'Mevcut Pozisyon'}>{candidate.position || 'Mevcut Pozisyon'} (Orjinal)</option>
                                        {positions?.map(pos => <option key={pos.id} value={pos.title}>{pos.title}</option>)}
                                    </select>
                                    <Edit2 className="w-3 h-3 absolute right-2 text-navy-400 pointer-events-none group-hover:text-electric transition-colors" />
                                </div>
                                <span className="text-navy-600">•</span>
                                <div className="relative group flex items-center">
                                    <select
                                        value={candidate.status}
                                        onChange={(e) => updateCandidate(candidate.id, { status: e.target.value })}
                                        className="appearance-none bg-electric/10 text-electric px-2 py-0.5 pr-6 rounded-md text-[11px] font-bold uppercase tracking-wider cursor-pointer border border-transparent hover:bg-electric/20 focus:outline-none transition-all"
                                    >
                                        {Object.entries(STATUS_LABELS).map(([key, label]) => (
                                            <option key={key} value={key} className="bg-navy-800 text-white capitalize">{label}</option>
                                        ))}
                                    </select>
                                    <Edit2 className="w-2.5 h-2.5 absolute right-2 text-electric/70 pointer-events-none" />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3 w-full md:w-auto">
                        <button
                            onClick={() => setSendModalPurpose('general')}
                            className="flex-1 md:flex-none px-6 py-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/[0.06] font-bold text-xs transition-all flex items-center justify-center gap-2 group"
                        >
                            <Mail className="w-4 h-4 text-navy-400 group-hover:text-white transition-colors" /> Mesaj Gönder
                        </button>
                        <button
                            onClick={() => { setSendModalPurpose('interview'); }}
                            className="flex-1 md:flex-none px-6 py-3 rounded-2xl bg-gradient-to-r from-electric to-blue-600 hover:from-electric-light hover:to-blue-500 text-white font-black text-xs shadow-xl shadow-electric/20 hover:shadow-electric/40 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 group"
                        >
                            <Calendar className="w-4 h-4 text-white group-hover:scale-110 transition-transform" /> Mülakat Planla
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* LEFT PANEL (1/4) */}
                    <div className="lg:col-span-1 space-y-6">
                        {/* Status Timeline */}
                        <div className="glass rounded-3xl p-6 border border-white/[0.06]">
                            <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-2 uppercase tracking-widest text-navy-400">
                                <Activity className="w-4 h-4 text-emerald-400" /> Süreç Takibi
                            </h3>
                            <div className="relative pl-4 border-l-2 border-navy-800 space-y-6">
                                {timeline.map((step, index) => (
                                    <div key={index} className="relative group">
                                        <span className={`absolute -left-[21px] top-1.5 w-3 h-3 rounded-full border-2 transition-all ${step.status === 'completed' ? 'bg-emerald-500 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]' : step.status === 'upcoming' ? 'bg-navy-900 border-electric animate-pulse' : step.status === 'rejected' ? 'bg-red-500 border-red-500' : 'bg-navy-900 border-navy-700'}`} />
                                        <div>
                                            <h4 className={`text-xs font-bold ${step.status === 'completed' ? 'text-white' : step.status === 'upcoming' ? 'text-electric' : step.status === 'rejected' ? 'text-red-400' : 'text-navy-500'}`}>{step.title}</h4>
                                            <p className="text-[10px] text-navy-500 mt-0.5">{step.date}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Contact & Social Links */}
                        <div className="glass rounded-3xl p-6 border border-white/[0.06]">
                            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2 uppercase tracking-widest text-navy-400">
                                <User className="w-4 h-4 text-blue-400" /> İletişim & Sosyal
                            </h3>
                            <div className="space-y-3">
                                <a href={`mailto:${candidate.email}`} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.06] transition-all group">
                                    <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center group-hover:bg-red-500/20 transition-colors">
                                        <Mail className="w-4 h-4 text-red-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] text-navy-500 font-bold uppercase">E-Posta</p>
                                        <p className="text-xs text-navy-200 truncate">{candidate.email || 'Email Yok'}</p>
                                    </div>
                                </a>
                                <a href={`tel:${candidate.phone}`} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.06] transition-all group">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                                        <Phone className="w-4 h-4 text-emerald-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] text-navy-500 font-bold uppercase">Telefon</p>
                                        <p className="text-xs text-navy-200">{candidate.phone || 'Telefon Yok'}</p>
                                    </div>
                                </a>
                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    {(candidate.linkedinUrl || candidate.linkedin) && (
                                        <a href={(candidate.linkedinUrl || candidate.linkedin).startsWith('http') ? (candidate.linkedinUrl || candidate.linkedin) : `https://${(candidate.linkedinUrl || candidate.linkedin)}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 p-3 rounded-xl bg-[#0077b5]/10 border border-[#0077b5]/20 hover:bg-[#0077b5]/20 text-[#0077b5] transition-all">
                                            <Linkedin className="w-4 h-4" /> <span className="text-[10px] font-bold">LinkedIn</span>
                                        </a>
                                    )}
                                    {candidate.github && (
                                        <a href={candidate.github.startsWith('http') ? candidate.github : `https://github.com/${candidate.github}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all">
                                            <Github className="w-4 h-4" /> <span className="text-[10px] font-bold">GitHub</span>
                                        </a>
                                    )}
                                    {!candidate.github && (
                                        <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-navy-600 opacity-50">
                                            <Globe className="w-4 h-4" /> <span className="text-[10px] font-bold">Portfolyo</span>
                                        </div>
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
                            <div className="relative glass rounded-3xl p-6 border border-white/[0.08] flex flex-col h-full overflow-hidden">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-electric/10 rounded-full blur-[80px] -z-10 pointer-events-none" />

                                <div className="flex flex-col mb-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xl font-black text-white flex items-center gap-3 tracking-tight">
                                            <div className="w-8 h-8 rounded-lg bg-electric/10 flex items-center justify-center">
                                                <MessageSquare className="w-4 h-4 text-electric" />
                                            </div>
                                            Mülakat Oturumu
                                        </h3>
                                        <span className="text-[10px] font-bold text-electric bg-electric/10 px-2.5 py-1 rounded-full uppercase tracking-wider border border-electric/20">
                                            {candidate.interviewSessions?.length || 0} Oturum
                                        </span>
                                    </div>
                                    <p className="text-xs text-navy-400 mt-2 ml-11">Adayın mülakat geçmişi</p>
                                </div>

                                <div className="flex-1 flex flex-col min-h-0">
                                    {candidate.interviewSessions?.length > 0 ? (
                                        <div className="flex-1 overflow-y-auto pr-2 mb-6 custom-scrollbar">
                                            <InterviewHistory sessions={candidate.interviewSessions} />
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden text-center p-8 rounded-2xl mb-6 bg-gradient-to-b from-white/[0.02] to-transparent border border-white/[0.05] group">
                                            <div className="absolute inset-0 bg-electric/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"></div>
                                            <div className="w-16 h-16 rounded-full bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mb-4 relative z-10 group-hover:scale-110 transition-transform duration-500 shadow-xl shadow-black/20">
                                                <MessageSquare className="w-8 h-8 text-electric/60 group-hover:text-electric transition-colors duration-500" />
                                            </div>
                                            <p className="text-sm font-semibold text-white mb-2 relative z-10">Kayıt Bulunamadı</p>
                                            <p className="text-xs text-navy-400 relative z-10 max-w-[200px] leading-relaxed">Yeni bir değerlendirme süreci başlatmak için ilk mülakat oturumunu oluşturun.</p>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-auto">
                                    <button
                                        onClick={() => setShowInterviewModal(true)}
                                        className="w-full py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2 group"
                                    >
                                        <Activity className="w-5 h-5 text-emerald-400 group-hover:animate-pulse" /> Canlı Mülakat Notu Gir
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* CV View */}
                        <div className="glass rounded-3xl p-6 border border-white/[0.06] flex flex-col">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-purple-400" /> Orijinal Özgeçmiş (CV)
                                </h3>
                                {candidate.cvUrl && (
                                    <a href={candidate.cvUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-xl bg-electric/10 text-electric-light text-xs font-bold border border-electric/20 hover:bg-electric/20 transition-all flex items-center gap-2">
                                        <ExternalLink className="w-3.5 h-3.5" /> Tam Ekran Gör
                                    </a>
                                )}
                            </div>

                            <div className="rounded-2xl overflow-hidden border border-white/10 bg-white/[0.01] h-[700px] w-full relative">
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
                                            <h4 className="text-lg font-bold text-white">Orijinal Belge Mevcut Değil</h4>
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
