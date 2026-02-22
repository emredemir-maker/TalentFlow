// src/pages/CandidateProcessPage.jsx
// Transparent Dashboard for Candidates

import { useMemo, useState } from 'react';
import Header from '../components/Header';
import StarScoreCard from '../components/StarScoreCard';
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
    ExternalLink
} from 'lucide-react';
import { analyzeCandidateMatch } from '../services/geminiService';
import { createMessage, MESSAGE_STATUS } from '../services/messageQueueService';

const STATUS_LABELS = {
    ai_analysis: 'Aİ Analizi',
    review: 'İlk İnceleme',
    interview: 'Mülakat',
    deep_review: 'Detaylı İnceleme',
    offer: 'Teklif',
    hired: 'İşe Alındı',
    rejected: 'Reddedildi'
};

export default function CandidateProcessPage() {
    const { candidates, viewCandidateId, setViewCandidateId, updateCandidate } = useCandidates();
    const { positions } = usePositions();
    const [sendModalPurpose, setSendModalPurpose] = useState(null); // null means closed, 'interview', 'general', etc.

    const handleMessageSent = async (data) => {
        try {
            await createMessage({
                candidateId: data.candidateId,
                candidateName: data.candidateName,
                candidateEmail: candidate.email,
                candidatePosition: candidate.matchedPositionTitle || candidate.position,
                messageContent: data.subject + '\n\n' + (data.content || ''), // Simplified log
                subject: data.subject,
                trackingId: data.trackingId,
                status: MESSAGE_STATUS.SENT, // Mark as sent immediately
                purpose: data.purpose,
                aiGenerated: true
            });

            // Also update candidate status if it was an interview invite
            if (data.purpose === 'interview' && candidate.status === 'review') {
                await updateCandidate(candidate.id, { status: 'interview' });
            }
        } catch (err) {
            console.error("Failed to log sent message:", err);
        }
    };

    // Seçili adayı bul (Eğer viewCandidateId yoksa, liste başındaki adayı demo olarak al)
    const candidate = useMemo(() => {
        if (!viewCandidateId && candidates.length > 0) return candidates[0];
        return candidates.find(c => c.id === viewCandidateId) || null;
    }, [candidates, viewCandidateId]);

    const handleTargetPositionChange = async (e) => {
        const newValue = e.target.value;
        if (!candidate || !newValue) return;

        // Find position object if it's from our context
        const posObj = positions?.find(p => p.title === newValue);

        try {
            // Check if we already have this analysis cached
            const cachedAnalysis = candidate.positionAnalyses?.[newValue];

            if (cachedAnalysis) {
                await updateCandidate(candidate.id, {
                    matchedPositionTitle: newValue,
                    matchScore: cachedAnalysis.score,
                    status: 'review',
                    aiAnalysis: cachedAnalysis // Point current to cached
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

                        // Save both to current state and persistent cache
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
        if (!currentPos) {
            alert("Analiz edilecek bir pozisyon seçili değil.");
            return;
        }

        const posObj = positions?.find(p => p.title === currentPos);
        if (!posObj) {
            alert("Pozisyon bilgisi sistemde bulunamadı.");
            return;
        }

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
            alert("Analiz yenilenirken bir hata oluştu.");
        }
    };

    // Dinamik timeline oluşturma
    const timeline = useMemo(() => {
        if (!candidate) return [];
        const current = candidate.status;
        const isRejected = current === 'rejected';
        const isHired = current === 'hired';

        return [
            {
                title: 'Başvuru Alındı',
                date: candidate.appliedDate || 'Bilinmiyor',
                status: 'completed'
            },
            {
                title: 'Otonom AI Analizi',
                date: candidate.aiAnalysis ? 'Tamamlandı' : 'Bekleniyor',
                status: candidate.aiAnalysis ? 'completed' : 'upcoming'
            },
            {
                title: 'Mülakat & Değerlendirme',
                date: current === 'interview' || current === 'deep_review' ? 'Aktif' : '-',
                status: (current === 'offer' || isHired || isRejected) ? 'completed' : (current === 'interview' || current === 'deep_review' ? 'upcoming' : 'pending')
            },
            {
                title: 'Sonuç',
                date: isHired || isRejected ? 'Neticelendi' : '-',
                status: isRejected ? 'rejected' : (isHired ? 'completed' : 'pending')
            }
        ];
    }, [candidate]);

    if (!candidate) {
        return (
            <div className="min-h-screen pb-20 flex flex-col items-center justify-center">
                <h2 className="text-xl text-white">Görüntülenecek aday bulunamadı.</h2>
                <p className="text-navy-400 mt-2">Lütfen aday tablosundan bir profil seçin.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen pb-20">
            <Header title="Aday Süreç Portalı" />

            {/* Candidate Selector Below Header */}
            <div className="flex items-center justify-end px-6 lg:px-8 py-3 mb-2">
                <div className="flex items-center gap-3">
                    <span className="text-[11px] font-bold text-navy-400 uppercase tracking-wider">Aday Değiştir:</span>
                    <select
                        value={candidate.id}
                        onChange={(e) => setViewCandidateId(e.target.value)}
                        className="px-4 py-2 rounded-xl bg-navy-800 border border-white/[0.06] text-sm text-white font-medium outline-none focus:border-electric cursor-pointer hover:bg-white/[0.04] transition-all"
                    >
                        {candidates.map(c => (
                            <option key={c.id} value={c.id}>
                                {c.name || 'İsimsiz'} ({STATUS_LABELS[c.status] || c.status})
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-6 lg:px-8 space-y-8">

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

                                {/* Target Position Selector */}
                                <div className="relative group flex items-center">
                                    <select
                                        value={candidate.matchedPositionTitle || candidate.position || ''}
                                        onChange={handleTargetPositionChange}
                                        className="appearance-none bg-transparent hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06] rounded-lg px-2 py-1 pr-6 cursor-pointer text-sm text-electric-light focus:outline-none focus:border-electric transition-all"
                                    >
                                        <option value="" disabled>Pozisyon Seçin</option>
                                        <option value={candidate.position || 'Mevcut Pozisyon'}>
                                            {candidate.position || 'Mevcut Pozisyon'} (Orjinal)
                                        </option>
                                        {positions?.map(pos => (
                                            <option key={pos.id} value={pos.title}>{pos.title}</option>
                                        ))}
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

                    <div className="flex gap-3 w-full md:w-auto">
                        <button
                            onClick={() => setSendModalPurpose('general')}
                            className="flex-1 md:flex-none px-5 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/[0.06] font-semibold text-sm transition-all flex items-center justify-center gap-2">
                            <Mail className="w-4 h-4" />
                            Mesaj Gönder
                        </button>
                        <button
                            onClick={() => {
                                updateCandidate(candidate.id, { status: 'interview' });
                                setSendModalPurpose('interview');
                            }}
                            className="flex-1 md:flex-none px-5 py-2.5 rounded-xl bg-electric hover:bg-electric-light text-white font-bold text-sm shadow-lg shadow-electric/20 transition-all flex items-center justify-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Takvim & Mülakat Planla
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Timeline & Info */}
                    <div className="space-y-6">
                        {/* Timeline */}
                        <div className="glass rounded-3xl p-6 border border-white/[0.06]">
                            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                                <Activity className="w-5 h-5 text-emerald-400" />
                                Süreç Takibi
                            </h3>
                            <div className="relative pl-4 border-l-2 border-navy-800 space-y-8">
                                {timeline.map((step, index) => (
                                    <div key={index} className="relative group">
                                        <span className={`absolute -left-[21px] top-1.5 w-3 h-3 rounded-full border-2 transition-all ${step.status === 'completed'
                                            ? 'bg-emerald-500 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                                            : step.status === 'upcoming'
                                                ? 'bg-navy-900 border-electric animate-pulse'
                                                : step.status === 'rejected'
                                                    ? 'bg-red-500 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]'
                                                    : 'bg-navy-900 border-navy-700'
                                            }`} />

                                        <div>
                                            <h4 className={`text-sm font-bold ${step.status === 'completed' ? 'text-white' : step.status === 'upcoming' ? 'text-electric' : step.status === 'rejected' ? 'text-red-400' : 'text-navy-500'}`}>
                                                {step.title}
                                            </h4>
                                            <p className="text-xs text-navy-400 mt-1">{step.date}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Contact Info */}
                        <div className="glass rounded-3xl p-6 border border-white/[0.06]">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <User className="w-5 h-5 text-blue-400" />
                                İletişim Bilgileri
                            </h3>
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02]">
                                    <Mail className="w-4 h-4 text-navy-400 flex-shrink-0" />
                                    <span className="text-sm text-navy-200 truncate">{candidate.email || 'Email Yok'}</span>
                                </div>
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02]">
                                    <Phone className="w-4 h-4 text-navy-400 flex-shrink-0" />
                                    <span className="text-sm text-navy-200">{candidate.phone || 'Telefon Yok'}</span>
                                </div>
                                {candidate.linkedin && (
                                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02]">
                                        <Link className="w-4 h-4 text-navy-400 flex-shrink-0" />
                                        <a href={candidate.linkedin.startsWith('http') ? candidate.linkedin : `https://${candidate.linkedin}`} target="_blank" rel="noopener noreferrer" className="text-sm text-electric hover:underline truncate">
                                            {candidate.linkedin}
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: AI Feedback & Scorecard */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* STAR Scorecard - Sadece varsa veya dummy verilerle besle */}
                        <StarScoreCard
                            candidate={candidate}
                            onRefresh={handleRefreshAnalysis}
                            analysis={(() => {
                                // If we have real STAR analysis from AI, use it exactly
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
                                const s = baseScore > 0 ? Math.min(10, Math.max(1, Math.round(baseScore * 1.05))) : 0;
                                const t = baseScore > 0 ? Math.min(10, Math.max(1, Math.round(baseScore))) : 0;
                                const a = baseScore > 0 ? Math.min(10, Math.max(1, Math.round(baseScore * 0.95))) : 0;
                                const r = baseScore > 0 ? Math.min(10, Math.max(1, Math.round(baseScore))) : 0;

                                const isPending = candidate.status === 'ai_analysis' || candidate.status === 'new';
                                const summaryContent = isPending
                                    ? "Profil özellikleri ve ilgili pozisyon gereksinimleri otonom yapay zeka tarafından analiz ediliyor. Lütfen biraz bekleyin..."
                                    : (candidate.aiAnalysis?.summary || candidate.summary || "Bu aday için detaylı yapay zeka çıkarımı bulunamadı.");

                                return {
                                    Summary: summaryContent,
                                    Situation: s,
                                    Task: t,
                                    Action: a,
                                    Result: r
                                };
                            })()}
                        />

                        {/* CV View */}
                        <div className="glass rounded-3xl p-6 border border-white/[0.06] flex flex-col max-h-[800px]">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-purple-400" />
                                    Orijinal Özgeçmiş (CV)
                                </h3>
                                {candidate.cvUrl && (
                                    <div className="flex gap-2">
                                        <a
                                            href={candidate.cvUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-3 py-1.5 rounded-xl bg-electric/10 text-electric-light text-xs font-bold border border-electric/20 hover:bg-electric/20 transition-all flex items-center gap-2"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            Tam Ekran Gör
                                        </a>
                                    </div>
                                )}
                            </div>

                            {candidate.cvUrl ? (
                                <div className="flex-1 min-h-[500px] rounded-xl overflow-hidden border border-white/10 bg-white/[0.02]">
                                    <iframe
                                        src={`${candidate.cvUrl}#toolbar=0`}
                                        className="w-full h-full border-none"
                                        title="CV Preview"
                                    />
                                </div>
                            ) : (
                                <div className="flex-1 overflow-y-auto pr-2 rounded-xl bg-white/[0.02] border border-white/[0.04] p-4 text-sm text-navy-300 whitespace-pre-wrap leading-relaxed min-h-[200px]">
                                    {candidate.originalText || candidate.resumeText || candidate.cvText || `Aday sisteme PDF yerine manuel eklenmiş veya CV makine okumasına henüz dönüştürülmemiş. Anahtar kelimeler ve skorlar sistemde mevcuttur ancak saf ham CV metni kaydı bulunmamaktadır.`}
                                </div>
                            )}
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
            </div>
        </div>
    );
}
