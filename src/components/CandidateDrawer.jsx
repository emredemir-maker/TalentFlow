// src/components/CandidateDrawer.jsx
// Right-side drawer with AI-analyzed CV details + Gemini integration

import { useState, useCallback, useEffect } from 'react';
import SendMessageModal from './SendMessageModal';
import {
    X,
    Mail,
    Phone,
    MapPin,
    Briefcase,
    GraduationCap,
    Calendar,
    Globe,
    TrendingUp,
    TrendingDown,
    Brain,
    Target,
    MessageCircle,
    Users,
    Star,
    Sparkles,
    ChevronRight,
    Zap,
    Send,
    Linkedin,
    Layers,
    Loader2,
} from 'lucide-react';
import MatchScoreRing from './MatchScoreRing';
import AIAnalysisPanel from './AIAnalysisPanel';
import { analyzeCandidateMatch, getAvailableModels } from '../services/geminiService';
import { useCandidates } from '../context/CandidatesContext';

const STATUS_CONFIG = {
    new: { label: 'Yeni', dot: 'bg-violet-400', next: 'review' },
    review: { label: 'İnceleme', dot: 'bg-amber-400', next: 'interview' },
    interview: { label: 'Mülakat', dot: 'bg-blue-400', next: 'offer' },
    offer: { label: 'Teklif', dot: 'bg-cyan-400', next: 'hired' },
    hired: { label: 'İşe Alındı', dot: 'bg-emerald-400', next: null },
    rejected: { label: 'Reddedildi', dot: 'bg-red-400', next: 'review' },
};

// Default job description for analysis
const DEFAULT_JOB_DESC = `Aranan Pozisyon: Yazılım Geliştirici

Gereksinimler:
- Minimum 3 yıl yazılım geliştirme deneyimi
- Modern web teknolojileri (React, Node.js, TypeScript) bilgisi
- Veritabanı tasarımı ve yönetimi deneyimi
- RESTful API tasarımı ve geliştirmesi
- Git versiyon kontrol sistemi kullanımı
- Takım çalışmasına yatkınlık
- Türkçe ve İngilizce iletişim becerisi

Tercih Edilen:
- Cloud platformları (AWS, GCP) deneyimi
- CI/CD pipeline kurulumu
- Agile/Scrum metodolojileri
- Açık kaynak projelere katkı`;

function ScoreBar({ label, icon: Icon, value, color = 'bg-electric' }) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[12px] text-navy-400">
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                </div>
                <span className="text-[12px] font-bold text-navy-200">{value}%</span>
            </div>
            <div className="h-1.5 bg-navy-800 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full ${color} transition-all duration-1000 ease-out`}
                    style={{ width: `${value}%` }}
                />
            </div>
        </div>
    );
}

export default function CandidateDrawer({ candidate, onClose }) {
    const { updateCandidate } = useCandidates();
    const [updatingStatus, setUpdatingStatus] = useState(false);

    // UI State
    const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'ai-analysis'
    const [showJobInput, setShowJobInput] = useState(false);
    const [showSendModal, setShowSendModal] = useState(false);

    // AI Analysis State
    const [aiResult, setAiResult] = useState(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState(null);
    const [jobDescription, setJobDescription] = useState(DEFAULT_JOB_DESC);

    // Model Selection State
    const [availableModels, setAvailableModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState('');
    const [loadingModels, setLoadingModels] = useState(false);

    // Fetch available models on mount
    useEffect(() => {
        async function fetchModels() {
            setLoadingModels(true);
            try {
                const models = await getAvailableModels();
                setAvailableModels(models);
                if (models.length > 0) {
                    const defaultModel = models.find(m => m.id === 'gemini-1.5-flash') || models[0];
                    setSelectedModel(defaultModel.id);
                } else {
                    setSelectedModel('gemini-1.5-flash');
                }
            } catch (error) {
                console.error('Failed to load models:', error);
                setSelectedModel('gemini-1.5-flash');
            } finally {
                setLoadingModels(false);
            }
        }
        fetchModels();
    }, []);

    if (!candidate) return null;

    const currentStatusKey = candidate.status || 'new';
    const status = STATUS_CONFIG[currentStatusKey] || STATUS_CONFIG.new;
    const analysis = candidate.aiAnalysis || {};

    const handleUpdateStatus = async (newStatus) => {
        if (!candidate.id || updatingStatus) return;
        setUpdatingStatus(true);
        try {
            await updateCandidate(candidate.id, { status: newStatus });
            // Close drawer after successful update to provide feedback
            setTimeout(() => {
                onClose();
            }, 300);
        } catch (err) {
            console.error('Status update error:', err);
        } finally {
            setUpdatingStatus(false);
        }
    };

    const handleRunAnalysis = useCallback(async () => {
        setAiLoading(true);
        setAiError(null);
        setAiResult(null);
        setActiveTab('ai-analysis');

        // Build candidate profile string
        const profileText = `
İsim: ${candidate.name}
Pozisyon: ${candidate.position}
Departman: ${candidate.department}
Deneyim: ${candidate.experience} yıl
Konum: ${candidate.location}
Eğitim: ${candidate.education || 'Belirtilmemiş'}
Yetenekler: ${(candidate.skills || []).join(', ')}
Maaş Beklentisi: ${candidate.salary}
Notlar: ${candidate.notes || ''}
    `.trim();

        try {
            const result = await analyzeCandidateMatch(jobDescription, profileText, selectedModel);
            setAiResult(result);
        } catch (err) {
            console.error('[TalentFlow] AI Analysis error:', err);
            setAiError(err.message);
        } finally {
            setAiLoading(false);
        }
    }, [candidate, jobDescription, selectedModel]);

    return (
        <>
            {/* Overlay */}
            <div
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] animate-fade-in"
                onClick={onClose}
            />

            {/* Drawer */}
            <div className="fixed top-0 right-0 h-full w-full max-w-[520px] z-[70] flex flex-col bg-navy-900 border-l border-white/[0.06] shadow-2xl animate-slide-in-right">

                {/* ===== HEADER ===== */}
                <div className="shrink-0 p-6 border-b border-white/[0.06]">
                    <div className="flex items-start justify-between mb-5">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-electric to-violet-accent flex items-center justify-center text-xl font-bold text-white shadow-[0_0_24px_rgba(59,130,246,0.25)]">
                                {(candidate.name || 'Aday').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">{candidate.name || 'İsimsiz Aday'}</h2>
                                <p className="text-sm text-navy-400">{candidate.position || 'Pozisyon Belirtilmemiş'}</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`w-2 h-2 rounded-full ${status.dot || 'bg-navy-500'}`} />
                                    <span className="text-[11px] text-navy-400 font-medium">{status.label || 'Durum Belirtilmemiş'}</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-navy-400 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Score overview */}
                    <div className="flex items-center gap-5 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-4">
                        <MatchScoreRing score={candidate.matchScore || 0} size={64} />
                        <div className="flex-1 min-w-0">
                            <div className="text-[11px] uppercase tracking-wider text-navy-500 font-semibold mb-1">
                                Uyumluluk Skoru
                            </div>
                            <div className="text-2xl font-extrabold text-white">
                                %{candidate.matchScore || 0}
                            </div>
                        </div>

                        {/* AI Analyze button */}
                        <button
                            onClick={() => showJobInput ? handleRunAnalysis() : setShowJobInput(true)}
                            disabled={aiLoading}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-electric text-white text-[12px] font-semibold shadow-[0_4px_16px_rgba(139,92,246,0.3)] hover:shadow-[0_6px_24px_rgba(139,92,246,0.4)] hover:-translate-y-0.5 transition-all disabled:opacity-50 cursor-pointer shrink-0"
                        >
                            <Sparkles className="w-4 h-4" />
                            {aiLoading ? 'Analiz...' : 'AI Analiz'}
                        </button>
                    </div>

                    {/* Job Description Input (expandable) */}
                    {showJobInput && !aiResult && !aiLoading && (
                        <div className="space-y-3 animate-fade-in-up">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Brain className="w-4 h-4 text-violet-400" />
                                    <span className="text-[12px] font-semibold text-navy-300">İş Tanımı</span>
                                </div>
                                <button
                                    onClick={() => setShowJobInput(false)}
                                    className="text-[11px] text-navy-500 hover:text-navy-300 cursor-pointer"
                                >
                                    İptal
                                </button>
                            </div>
                            <textarea
                                value={jobDescription}
                                onChange={(e) => setJobDescription(e.target.value)}
                                rows={5}
                                className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[12px] text-navy-200 placeholder:text-navy-500 outline-none focus:border-electric/40 focus:ring-2 focus:ring-electric/10 transition-all resize-none leading-relaxed"
                                placeholder="Pozisyon gereksinimlerini buraya yapıştırın..."
                            />

                            {/* Model Selection Dropdown */}
                            <div className="flex items-center gap-2 px-1">
                                <Layers className="w-3.5 h-3.5 text-navy-400" />
                                <select
                                    value={selectedModel}
                                    onChange={(e) => setSelectedModel(e.target.value)}
                                    disabled={loadingModels}
                                    className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg px-2 py-1.5 text-[11px] text-navy-300 outline-none focus:border-electric/40"
                                >
                                    {loadingModels ? (
                                        <option>Modeller yükleniyor...</option>
                                    ) : availableModels.length > 0 ? (
                                        availableModels.map(model => (
                                            <option key={model.id} value={model.id}>
                                                {model.displayName}
                                            </option>
                                        ))
                                    ) : (
                                        <option value="gemini-pro">Gemini Pro (Default)</option>
                                    )}
                                </select>
                            </div>

                            <button
                                onClick={handleRunAnalysis}
                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-electric text-white text-[13px] font-semibold shadow-[0_4px_16px_rgba(139,92,246,0.3)] hover:shadow-[0_6px_24px_rgba(139,92,246,0.4)] transition-all cursor-pointer"
                            >
                                <Zap className="w-4 h-4" />
                                {selectedModel ? `${selectedModel.replace('models/', '').split('-')[1]} ile Analiz Et` : 'Analiz Et'}
                            </button>
                        </div>
                    )}

                    {/* Tabs */}
                    <div className="flex gap-1 mt-3">
                        <button
                            onClick={() => setActiveTab('profile')}
                            className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all cursor-pointer ${activeTab === 'profile'
                                ? 'bg-electric/10 text-electric-light'
                                : 'text-navy-500 hover:text-navy-300 hover:bg-white/[0.04]'
                                }`}
                        >
                            Profil
                        </button>
                        <button
                            onClick={() => setActiveTab('ai-analysis')}
                            className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${activeTab === 'ai-analysis'
                                ? 'bg-violet-500/10 text-violet-400'
                                : 'text-navy-500 hover:text-navy-300 hover:bg-white/[0.04]'
                                }`}
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            AI Analiz
                            {aiResult && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            )}
                        </button>
                    </div>
                </div>

                {/* ===== SCROLLABLE CONTENT ===== */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* === TAB: Profile === */}
                    {activeTab === 'profile' && (
                        <>
                            {/* Contact Info */}
                            <Section title="İletişim">
                                <div className="grid grid-cols-1 gap-2.5">
                                    <InfoRow icon={Mail} label="E-posta" value={candidate.email} />
                                    <InfoRow icon={Phone} label="Telefon" value={candidate.phone} />
                                    <InfoRow icon={MapPin} label="Konum" value={candidate.location} />
                                    <InfoRow icon={Calendar} label="Başvuru" value={candidate.appliedDate} />
                                    <InfoRow icon={Globe} label="Kaynak" value={candidate.source} />
                                </div>
                            </Section>

                            {/* Details */}
                            <Section title="Detaylar">
                                <div className="grid grid-cols-2 gap-3">
                                    <MiniCard label="Departman" value={candidate.department || 'Belirtilmemiş'} icon={Briefcase} />
                                    <MiniCard label="Deneyim" value={`${candidate.experience || 0} Yıl`} icon={TrendingUp} />
                                    <MiniCard label="Eğitim" value={(candidate.education || '').split(' - ')[0] || 'Belirtilmemiş'} icon={GraduationCap} />
                                    <MiniCard label="Maaş" value={candidate.salary || 'Belirtilmemiş'} icon={Star} />
                                </div>
                            </Section>

                            {/* Skills */}
                            <Section title="Yetenekler">
                                <div className="flex flex-wrap gap-2">
                                    {(Array.isArray(candidate.skills) ? candidate.skills : []).map((skill) => (
                                        <span
                                            key={skill}
                                            className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-navy-200 bg-electric/8 border border-electric/15 hover:bg-electric/15 transition-all"
                                        >
                                            {skill}
                                        </span>
                                    ))}
                                    {(!candidate.skills || candidate.skills.length === 0) && (
                                        <span className="text-[12px] text-navy-500 italic">Yetenek belirtilmemiş</span>
                                    )}
                                </div>
                            </Section>

                            {/* Existing AI Analysis (from seed data) */}
                            {analysis && analysis.summary && (
                                <>
                                    <Section title="Ön Değerlendirme" icon={Brain}>
                                        <p className="text-[13px] text-navy-300 leading-relaxed">{analysis.summary}</p>
                                    </Section>

                                    <Section title="Yetkinlik Puanları">
                                        <div className="space-y-4">
                                            <ScoreBar
                                                label="Teknik Yetkinlik"
                                                icon={Target}
                                                value={analysis.scoreBreakdown?.technicalSkills || analysis.technicalScore || 0}
                                                color="bg-electric"
                                            />
                                            <ScoreBar
                                                label="Deneyim / Sektör"
                                                icon={Briefcase}
                                                value={analysis.scoreBreakdown?.experience || analysis.scoreBreakdown?.industryFit || analysis.communicationScore || 0}
                                                color="bg-cyan-400"
                                            />
                                            <ScoreBar
                                                label="Soft Skill / Kültür"
                                                icon={Users}
                                                value={analysis.scoreBreakdown?.softSkills || analysis.cultureFit || 0}
                                                color="bg-violet-400"
                                            />
                                        </div>
                                    </Section>

                                    {analysis.strengths?.length > 0 && (
                                        <Section title="Güçlü Yönler" icon={TrendingUp}>
                                            <div className="space-y-2">
                                                {analysis.strengths.map((s, i) => (
                                                    <div key={i} className="flex items-start gap-2.5 text-[13px] text-navy-300">
                                                        <div className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                                                            <ChevronRight className="w-3 h-3 text-emerald-400" />
                                                        </div>
                                                        <span>{s}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </Section>
                                    )}

                                    {analysis.weaknesses?.length > 0 && (
                                        <Section title="Gelişim Alanları" icon={TrendingDown}>
                                            <div className="space-y-2">
                                                {analysis.weaknesses.map((w, i) => (
                                                    <div key={i} className="flex items-start gap-2.5 text-[13px] text-navy-300">
                                                        <div className="w-5 h-5 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                                                            <ChevronRight className="w-3 h-3 text-amber-400" />
                                                        </div>
                                                        <span>{w}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </Section>
                                    )}

                                    {analysis.recommendation && (
                                        <Section title="Öneri" icon={Sparkles}>
                                            <div className="p-4 rounded-xl bg-electric/5 border border-electric/10 text-[13px] text-navy-200 leading-relaxed">
                                                {analysis.recommendation}
                                            </div>
                                        </Section>
                                    )}
                                </>
                            )}

                            {/* Notes */}
                            {candidate.notes && (
                                <Section title="Notlar">
                                    <div className="p-3.5 rounded-xl bg-white/[0.03] border-l-[3px] border-electric text-[13px] text-navy-300 leading-relaxed">
                                        {candidate.notes}
                                    </div>
                                </Section>
                            )}
                        </>
                    )}

                    {/* === TAB: AI Analysis === */}
                    {activeTab === 'ai-analysis' && (
                        <>
                            {!aiResult && !aiLoading && !aiError && (
                                <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                                    <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/10 flex items-center justify-center"
                                        style={{ animation: 'float-subtle 3s ease-in-out infinite' }}
                                    >
                                        <Sparkles className="w-7 h-7 text-violet-400" />
                                    </div>
                                    <h3 className="text-base font-bold text-navy-200">Gemini AI Analizi</h3>
                                    <p className="text-[13px] text-navy-400 max-w-sm">
                                        İş tanımı ile adayın CV'sini karşılaştırarak detaylı uyumluluk skoru, eşleşen yetenekler, eksiklik analizi ve kişiselleştirilmiş LinkedIn DM taslağı oluşturun.
                                    </p>
                                    <button
                                        onClick={() => setShowJobInput(true)}
                                        className="mt-2 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-electric text-white text-[13px] font-semibold shadow-[0_4px_16px_rgba(139,92,246,0.3)] hover:shadow-[0_6px_24px_rgba(139,92,246,0.4)] transition-all cursor-pointer"
                                    >
                                        <Zap className="w-4 h-4" />
                                        Analizi Başlat
                                    </button>
                                </div>
                            )}

                            <AIAnalysisPanel
                                result={aiResult}
                                loading={aiLoading}
                                error={aiError}
                                onRetry={handleRunAnalysis}
                            />
                        </>
                    )}
                </div>

                {/* ===== FOOTER ===== */}
                <div className="shrink-0 p-4 border-t border-white/[0.06] flex gap-3">
                    <button
                        onClick={() => handleUpdateStatus('rejected')}
                        disabled={updatingStatus || currentStatusKey === 'rejected'}
                        className="py-2.5 px-4 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] font-semibold text-navy-300 hover:bg-white/[0.08] hover:text-red-400 transition-all cursor-pointer disabled:opacity-50"
                    >
                        Reddet
                    </button>
                    <button
                        onClick={() => setShowSendModal(true)}
                        className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#0077B5] to-[#00A0DC] text-[13px] font-semibold text-white shadow-[0_4px_16px_rgba(0,119,181,0.3)] hover:shadow-[0_6px_24px_rgba(0,119,181,0.4)] hover:-translate-y-0.5 transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                        <Send className="w-4 h-4" />
                        Gönder
                    </button>
                    <button
                        onClick={() => status.next && handleUpdateStatus(status.next)}
                        disabled={updatingStatus || !status.next}
                        className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-electric to-blue-500 text-[13px] font-semibold text-white shadow-[0_4px_16px_rgba(59,130,246,0.3)] hover:shadow-[0_6px_24px_rgba(59,130,246,0.4)] hover:-translate-y-0.5 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {updatingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : 'İlerlet →'}
                    </button>
                </div>

                {/* SendMessage Modal */}
                {showSendModal && (
                    <SendMessageModal
                        candidate={candidate}
                        aiAnalysisResult={aiResult}
                        onClose={() => setShowSendModal(false)}
                        onSent={(info) => {
                            console.log('[TalentFlow] Message queued:', info);
                        }}
                    />
                )}
            </div>
        </>
    );
}

/* ===== Helpers ===== */

function Section({ title, icon: Icon, children }) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-3">
                {Icon && <Icon className="w-4 h-4 text-electric-light" />}
                <h3 className="text-[12px] font-semibold uppercase tracking-wider text-navy-400">{title}</h3>
            </div>
            {children}
        </div>
    );
}

function InfoRow({ icon: Icon, label, value }) {
    if (!value) return null;
    return (
        <div className="flex items-center gap-3 text-[13px]">
            <Icon className="w-4 h-4 text-navy-500 shrink-0" />
            <span className="text-navy-500 w-16 shrink-0">{label}</span>
            <span className="text-navy-200 truncate">{value}</span>
        </div>
    );
}

function MiniCard({ label, value, icon: Icon }) {
    return (
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center gap-1.5 mb-1">
                <Icon className="w-3.5 h-3.5 text-navy-500" />
                <span className="text-[10px] uppercase tracking-wider text-navy-500 font-medium">{label}</span>
            </div>
            <div className="text-[13px] font-semibold text-navy-200 truncate">{value}</div>
        </div>
    );
}
