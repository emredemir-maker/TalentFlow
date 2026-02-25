// src/pages/AnalyticsPage.jsx
import { useState, useMemo } from 'react';
import { useCandidates } from '../context/CandidatesContext';
import { useMessageQueue } from '../context/MessageQueueContext';
import { usePositions } from '../context/PositionsContext';
import Header from '../components/Header';
import CustomLineChart from '../components/charts/CustomLineChart';
import CustomPieChart from '../components/charts/CustomPieChart';
import GaugeChart from '../components/charts/GaugeChart';
import {
    Users,
    MessageSquare,
    Clock,
    FileText,
    Loader2,
    Sparkles,
    Send,
    X,
    TrendingUp,
    Zap,
    Briefcase,
    BrainCircuit,
    Layers,
    Globe,
    Activity,
    Target,
    CheckCircle,
    Search,
    RefreshCw
} from 'lucide-react';
import { analyzeResponseEmail } from '../services/geminiService';
import { useAuth } from '../context/AuthContext';
import { checkGmailMessages } from '../services/integrationService';

export default function AnalyticsPage() {
    const { filteredCandidates: candidates, loading: candidatesLoading, updateCandidate } = useCandidates();
    const { messages, loading: messagesLoading, stats: messageStats } = useMessageQueue();
    const { positions } = usePositions();
    const { userProfile } = useAuth();
    const [activeTab, setActiveTab] = useState('responses'); // 'responses' | 'pending'
    const [timeRange, setTimeRange] = useState('7d');

    // Response processing state
    const [processingResponse, setProcessingResponse] = useState(null); // { message, emailText, loading, result, checkingMail }

    const openResponseModal = (msg) => {
        setProcessingResponse({ message: msg, emailText: '', loading: false, result: null, checkingMail: false });
    };

    const handleCheckEmail = async (msg) => {
        const token = userProfile?.integrations?.google?.accessToken;
        if (!token) {
            alert("Lütfen önce Google hesabınızı bağlayın (Ayarlar -> Entegrasyonlar).");
            return;
        }

        const candidateEmail = msg.candidateEmail;
        if (!candidateEmail) {
            alert("Aday e-posta adresi bulunamadı.");
            return;
        }

        // Search query: from that email
        const query = `from:${candidateEmail}`;

        // Temporarily show modal with loading state for "checking"
        setProcessingResponse({ message: msg, emailText: '', loading: false, result: null, checkingMail: true });

        try {
            const result = await checkGmailMessages(token, query);
            if (result.success && result.found) {
                // Pre-fill modal with found body
                setProcessingResponse({
                    message: msg,
                    emailText: result.message.body || result.message.snippet || '',
                    loading: false,
                    result: null,
                    checkingMail: false
                });
            } else {
                setProcessingResponse(null);
                alert("İlgili adaydan yeni bir mail bulunamadı.");
            }
        } catch (err) {
            console.error(err);
            setProcessingResponse(null);
            alert("E-postalar kontrol edilirken bir hata oluşti.");
        }
    };

    const handleProcessResponse = async () => {
        if (!processingResponse?.emailText.trim()) return;

        setProcessingResponse(prev => ({ ...prev, loading: true }));
        try {
            const aiResult = await analyzeResponseEmail(processingResponse.emailText);
            setProcessingResponse(prev => ({ ...prev, result: aiResult, loading: false }));

            // Auto-update candidate if result is clear
            if (processingResponse.message.candidateId && aiResult.suggestedStatus) {
                await updateCandidate(processingResponse.message.candidateId, {
                    status: aiResult.suggestedStatus,
                    lastAiLog: aiResult.actionLog,
                    lastResponseDate: new Date().toISOString()
                });
            }
        } catch (err) {
            console.error(err);
            setProcessingResponse(prev => ({ ...prev, loading: false }));
        }
    };

    // ===== DATA PREPARATION =====

    // 1. Daily Applications Trend (Last 7 Days)
    const trendsData = useMemo(() => {
        const last7Days = [...Array(7)].map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            return d.toISOString().split('T')[0];
        }).reverse();

        const counts = {};
        candidates.forEach(c => {
            if (c.appliedDate) {
                const date = c.appliedDate.split('T')[0];
                counts[date] = (counts[date] || 0) + 1;
            }
        });

        return last7Days.map(date => ({
            date: new Date(date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
            applications: counts[date] || 0
        }));
    }, [candidates]);

    // 2. Position Distribution
    const positionDistribution = useMemo(() => {
        const counts = {};
        candidates.forEach(c => {
            const pos = c.matchedPositionTitle || 'Atanmamış';
            counts[pos] = (counts[pos] || 0) + 1;
        });

        if (Object.keys(counts).length === 0) {
            return [{ name: 'Veri Yok', value: 1 }];
        }

        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5); // Top 5
    }, [candidates]);

    // 2.5. Position-based Status Analysis
    const positionStatusData = useMemo(() => {
        const matrix = {};

        // 1. Initialize with all open positions from system
        positions.forEach(p => {
            if (p.status === 'open') {
                matrix[p.title] = {
                    name: p.title,
                    total: 0,
                    review: 0,
                    interview: 0,
                    hired: 0,
                    rejected: 0,
                    avgScore: 0,
                    scoredCandidates: 0
                };
            }
        });

        // 2. Aggregate candidate data
        candidates.forEach(c => {
            const pos = c.matchedPositionTitle || c.position || 'Genel Başvuru';

            if (!matrix[pos]) {
                matrix[pos] = {
                    name: pos,
                    total: 0,
                    review: 0,
                    interview: 0,
                    hired: 0,
                    rejected: 0,
                    avgScore: 0,
                    scoredCandidates: 0
                };
            }
            matrix[pos].total += 1;

            if (c.matchScore) {
                matrix[pos].avgScore += c.matchScore;
                matrix[pos].scoredCandidates += 1;
            }

            if (['review', 'ai_analysis'].includes(c.status)) matrix[pos].review += 1;
            if (['interview', 'deep_review'].includes(c.status)) matrix[pos].interview += 1;
            if (['hired', 'offer'].includes(c.status)) matrix[pos].hired += 1;
            if (c.status === 'rejected') matrix[pos].rejected += 1;
        });

        return Object.values(matrix)
            .map(p => ({
                ...p,
                avgScore: p.scoredCandidates > 0 ? Math.round(p.avgScore / p.scoredCandidates) : 0
            }))
            .sort((a, b) => b.total - a.total);
    }, [candidates, positions]);

    // 3. Conversion Funnel (Status Funnel)
    const funnelData = useMemo(() => {
        const stages = [
            { key: 'all', label: 'Başvuru', color: '#6366f1' },
            { key: 'review', label: 'İnceleme', color: '#f59e0b' },
            { key: 'interview', label: 'Mülakat', color: '#3b82f6' },
            { key: 'hired', label: 'İşe Alım', color: '#10b981' }
        ];

        return stages.map(stage => {
            let count = 0;
            if (stage.key === 'all') {
                count = candidates.length;
            } else {
                if (stage.key === 'review') count = candidates.filter(c => ['review', 'interview', 'offer', 'hired'].includes(c.status)).length;
                if (stage.key === 'interview') count = candidates.filter(c => ['interview', 'offer', 'hired'].includes(c.status)).length;
                if (stage.key === 'hired') count = candidates.filter(c => c.status === 'hired').length;
            }
            return { name: stage.label, count, color: stage.color };
        });
    }, [candidates]);

    // 4. Source Distribution
    const sourceData = useMemo(() => {
        const sources = {};
        candidates.forEach(c => {
            const s = c.source?.includes('Visual') ? 'LinkedIn / Scraper' :
                c.source?.includes('Browser') ? 'Eklenti' :
                    c.source?.includes('CV') ? 'CV Yükleme' : 'Diğer';
            sources[s] = (sources[s] || 0) + 1;
        });
        return Object.entries(sources).map(([name, value]) => ({ name, value }));
    }, [candidates]);

    // 5. Top Skills
    const topSkills = useMemo(() => {
        const skills = {};
        candidates.forEach(c => {
            (c.skills || []).forEach(s => {
                skills[s] = (skills[s] || 0) + 1;
            });
        });
        return Object.entries(skills)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);
    }, [candidates]);

    // 6. Average Match Score
    const avgMatchScore = useMemo(() => {
        if (candidates.length === 0) return 0;
        const total = candidates.reduce((acc, c) => acc + (c.matchScore || 0), 0);
        return Math.round(total / candidates.length);
    }, [candidates]);

    const pendingApprovals = useMemo(() =>
        messages.filter(m => m.status === 'draft' || m.status === 'ready_to_send'),
        [messages]);

    const sentMessages = useMemo(() =>
        messages.filter(m => m.status === 'sent' || m.status === 'email_opened' || m.status === 'replied'),
        [messages]);

    const loading = candidatesLoading || messagesLoading;

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="w-10 h-10 border-[3px] border-navy-800 border-t-electric rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen pb-20 bg-[#020617] text-white">
            <Header title="Stratejik Analitik" />

            {/* ===== DASHBOARD TOP BAR ===== */}
            <div className="px-6 lg:px-8 pt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
                        <Zap className="w-6 h-6 text-electric" /> Veri Odaklı Karar Destek
                    </h2>
                    <p className="text-navy-400 text-sm font-medium mt-1">Yapay zeka asistanınız tarafından hazırlanan gerçek zamanlı metrikler.</p>
                </div>
                <div className="flex items-center gap-2 bg-navy-900/50 p-1 rounded-xl border border-white/5 self-start">
                    {['7d', '30d', '90d'].map(r => (
                        <button
                            key={r}
                            onClick={() => setTimeRange(r)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${timeRange === r ? 'bg-electric text-white shadow-lg' : 'text-navy-400 hover:text-white'}`}
                        >
                            {r === '7d' ? '7 Gün' : r === '30d' ? '30 Gün' : '90 Gün'}
                        </button>
                    ))}
                </div>
            </div>

            {/* ===== KPI CARDS SECTION ===== */}
            <div className="px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 stagger">
                    <KPICard
                        title="Aktif Aday Havuzu"
                        value={candidates.length}
                        icon={Users}
                        trend="+12%"
                        isPositive
                        color="from-blue-500/20 to-blue-600/5"
                        iconColor="text-blue-400"
                    />
                    <KPICard
                        title="Yetenek Uyumluluğu"
                        value={`${avgMatchScore}%`}
                        icon={BrainCircuit}
                        trend="+3.4%"
                        isPositive
                        color="from-violet-500/20 to-violet-600/5"
                        iconColor="text-violet-400"
                    />
                    <KPICard
                        title="Yanıt Bekleyenler"
                        value={messageStats.sent - messageStats.replied}
                        icon={Clock}
                        trend="-5%"
                        isPositive={false}
                        color="from-amber-500/20 to-amber-600/5"
                        iconColor="text-amber-400"
                    />
                    <KPICard
                        title="İşe Alım Verimliliği"
                        value={`${Math.round((candidates.filter(c => c.status === 'hired').length / (candidates.length || 1)) * 100)}%`}
                        icon={Target}
                        trend="+2%"
                        isPositive
                        color="from-emerald-500/20 to-emerald-600/5"
                        iconColor="text-emerald-400"
                    />
                </div>
            </div>

            {/* ===== ANALYTICS GRID ===== */}
            <div className="px-6 lg:px-8 grid grid-cols-1 xl:grid-cols-12 gap-6 pb-8">

                {/* 1. Main Acquisition Chart (Wide) */}
                <div className="xl:col-span-8 glass rounded-[2.5rem] p-8 border border-white/[0.08] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-electric/5 rounded-full blur-[80px] -z-10" />
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Activity className="w-5 h-5 text-electric-light" /> Aday Edinme Trendi
                            </h3>
                            <p className="text-xs text-navy-400 mt-1">Son 7 gün boyunca günlük başvuru hacmi.</p>
                        </div>
                    </div>
                    <div className="h-[320px]">
                        <CustomLineChart data={trendsData} />
                    </div>
                </div>

                {/* 2. Funnel Analysis (Narrow) */}
                <div className="xl:col-span-4 glass rounded-[2.5rem] p-8 border border-white/[0.08] flex flex-col group">
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                        <Layers className="w-5 h-5 text-amber-400" /> Dönüşüm Hunisi
                    </h3>
                    <div className="flex-1 flex flex-col justify-between py-2 overflow-hidden">
                        {funnelData.map((stage, idx) => (
                            <div key={stage.name} className="relative group/funnel animate-fade-in-up" style={{ animationDelay: `${idx * 100}ms` }}>
                                <div className="flex justify-between items-end mb-2">
                                    <span className="text-xs font-bold text-navy-300 uppercase tracking-widest">{stage.name}</span>
                                    <span className="text-lg font-black text-white">{stage.count}</span>
                                </div>
                                <div className="h-4 bg-navy-950 rounded-full overflow-hidden border border-white/5">
                                    <div
                                        className="h-full rounded-full transition-all duration-1000 ease-out"
                                        style={{
                                            width: `${Math.max(5, (stage.count / (candidates.length || 1)) * 100)}%`,
                                            backgroundColor: stage.color,
                                            boxShadow: `0 0 15px ${stage.color}33`
                                        }}
                                    />
                                </div>
                                {idx < funnelData.length - 1 && (
                                    <div className="flex justify-center my-1">
                                        <div className="w-px h-6 bg-gradient-to-b from-white/10 to-transparent"></div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                        <p className="text-[11px] text-navy-400 leading-relaxed italic text-center">
                            Adayların havuza girişinden nihai işe alıma kadar olan dönüşüm oranı saptanıyor.
                        </p>
                    </div>
                </div>

                {/* 3. Skill Cloud & Source Split (Bottom Row) */}
                <div className="xl:col-span-4 glass rounded-[2.5rem] p-8 border border-white/[0.08]">
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                        <Zap className="w-5 h-5 text-electric-light" /> Öne Çıkan Yetenekler
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {topSkills.map(([skill, count], idx) => (
                            <div key={skill} className="px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-electric/30 hover:bg-electric/5 transition-all group flex items-center gap-3">
                                <span className="text-xs font-semibold text-navy-200 group-hover:text-white">{skill}</span>
                                <span className="text-[10px] font-black text-electric bg-electric/10 px-1.5 py-0.5 rounded-md">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="xl:col-span-4 glass rounded-[2.5rem] p-8 border border-white/[0.08]">
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                        <Globe className="w-5 h-5 text-cyan-400" /> Kaynak Dağılımı
                    </h3>
                    <div className="h-[200px]">
                        <CustomPieChart data={sourceData} />
                    </div>
                </div>

                <div className="xl:col-span-4 glass rounded-[2.5rem] p-8 border border-white/[0.08] flex flex-col items-center justify-center">
                    <h3 className="text-sm font-bold text-navy-400 mb-4 uppercase tracking-tighter">Genel Uyumluluk Skoru</h3>
                    <GaugeChart value={avgMatchScore} size={200} />
                    <div className="mt-4 text-center">
                        <p className="text-2xl font-black text-white">%{avgMatchScore}</p>
                        <p className="text-[11px] text-navy-500 font-medium">Havuz Potansiyeli</p>
                    </div>
                </div>
            </div>

            {/* ===== POSITION PERFORMANCE MATRIX ===== */}
            <div className="px-6 lg:px-8 mb-8">
                <div className="glass rounded-[2.5rem] p-8 border border-white/[0.08] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-violet-600/5 rounded-full blur-[100px] -z-10" />

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div>
                            <h3 className="text-xl font-black text-white flex items-center gap-3">
                                <Briefcase className="w-6 h-6 text-violet-400" /> Pozisyon Performans Matrisi
                            </h3>
                            <p className="text-xs text-navy-400 mt-1">Açık pozisyonların başvuru hacmi ve aday kalitesi bazlı analizi.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {positionStatusData.map((pos, idx) => (
                            <div key={pos.name} className="p-6 rounded-[2rem] bg-white/[0.02] border border-white/[0.05] hover:border-violet-500/30 transition-all group animate-fade-in-up" style={{ animationDelay: `${idx * 100}ms` }}>
                                <div className="flex justify-between items-start mb-4">
                                    <div className="min-w-0 flex-1">
                                        <h4 className="text-sm font-black text-white truncate group-hover:text-violet-400 transition-colors uppercase tracking-tight">{pos.name}</h4>
                                        <p className="text-[10px] text-navy-500 font-bold uppercase tracking-wider mt-1">{pos.total} Toplam Aday</p>
                                    </div>
                                    <div className="flex flex-col items-end shrink-0 ml-4">
                                        <div className="text-lg font-black text-violet-400">%{pos.avgScore}</div>
                                        <div className="text-[8px] text-navy-500 font-black uppercase tracking-tighter">AI Skoru</div>
                                    </div>
                                </div>

                                <div className="space-y-4 mt-6">
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest leading-none mb-1">
                                            <span className="text-emerald-400">İşe Alım</span>
                                            <span className="text-white">{pos.hired}</span>
                                        </div>
                                        <div className="h-1.5 bg-navy-950 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.4)] transition-all duration-1000"
                                                style={{ width: `${(pos.hired / (pos.total || 1)) * 100}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest leading-none mb-1">
                                            <span className="text-blue-400">Mülakat</span>
                                            <span className="text-white">{pos.interview}</span>
                                        </div>
                                        <div className="h-1.5 bg-navy-950 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.4)] transition-all duration-1000"
                                                style={{ width: `${(pos.interview / (pos.total || 1)) * 100}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest leading-none mb-1">
                                            <span className="text-amber-500">İnceleme</span>
                                            <span className="text-white">{pos.review}</span>
                                        </div>
                                        <div className="h-1.5 bg-navy-950 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.4)] transition-all duration-1000"
                                                style={{ width: `${(pos.review / (pos.total || 1)) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-8 pt-4 border-t border-white/5 flex items-center justify-between">
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md ${pos.avgScore > 70 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                        {pos.avgScore > 70 ? 'Yüksek Kalite' : 'Geliştirilmeli'}
                                    </span>
                                    <div className="flex -space-x-2">
                                        {[...Array(Math.min(3, pos.total))].map((_, i) => (
                                            <div key={i} className="w-6 h-6 rounded-full bg-navy-800 border-2 border-navy-900 flex items-center justify-center text-[8px] font-black text-white shadow-lg overflow-hidden ring-1 ring-white/5">
                                                {String.fromCharCode(65 + i)}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ===== DATA TABLE SECTION ===== */}
            <div className="px-6 lg:px-8">
                <div className="glass rounded-[2.5rem] border border-white/[0.06] overflow-hidden shadow-2xl">

                    {/* Tabs Header */}
                    <div className="flex items-center justify-between border-b border-white/[0.06] px-6 bg-white/[0.01]">
                        <div className="flex">
                            <button
                                onClick={() => setActiveTab('responses')}
                                className={`flex items-center gap-2 px-6 py-6 text-sm font-black border-b-2 transition-all cursor-pointer ${activeTab === 'responses'
                                    ? 'border-electric text-white'
                                    : 'border-transparent text-navy-500 hover:text-navy-300'
                                    }`}
                            >
                                <MessageSquare className="w-4 h-4" />
                                <span className="uppercase tracking-widest whitespace-nowrap">Yanıt Takibi</span>
                                <span className="px-2 py-0.5 rounded-full bg-electric/20 text-electric-light text-[10px] ml-1">{sentMessages.length}</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('pending')}
                                className={`flex items-center gap-2 px-6 py-6 text-sm font-black border-b-2 transition-all cursor-pointer ${activeTab === 'pending'
                                    ? 'border-amber-400 text-amber-400'
                                    : 'border-transparent text-navy-500 hover:text-navy-300'
                                    }`}
                            >
                                <Clock className="w-4 h-4" />
                                <span className="uppercase tracking-widest whitespace-nowrap">Taslaklar</span>
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] ml-1">{pendingApprovals.length}</span>
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/[0.04] bg-white/[0.02]">
                                    <th className="px-8 py-5 text-[10px] font-black text-navy-500 uppercase tracking-[0.2em]">Aday</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-navy-500 uppercase tracking-[0.2em]">Pozisyon</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-navy-500 uppercase tracking-[0.2em]">Tarih</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-navy-500 uppercase tracking-[0.2em]">Durum</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-navy-500 uppercase tracking-[0.2em] text-right">İşlem</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.02]">
                                {activeTab === 'responses' ? (
                                    sentMessages.length > 0 ? (
                                        sentMessages.map((msg, idx) => (
                                            <TableRow
                                                key={idx}
                                                msg={msg}
                                                type="sent"
                                                index={idx}
                                                onProcess={() => openResponseModal(msg)}
                                                onCheckMail={() => handleCheckEmail(msg)}
                                            />
                                        ))
                                    ) : (
                                        <EmptyRow message="Gönderilmiş mesaj bulunamadı." />
                                    )
                                ) : (
                                    pendingApprovals.length > 0 ? (
                                        pendingApprovals.map((msg, idx) => (
                                            <TableRow key={idx} msg={msg} type="pending" index={idx} />
                                        ))
                                    ) : (
                                        <EmptyRow message="Onay bekleyen taslak yok." />
                                    )
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* AI MODAL */}
            {
                processingResponse && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-xl" onClick={() => setProcessingResponse(null)} />
                        <div className="relative w-full max-w-xl glass rounded-[3rem] p-8 border border-white/10 space-y-6 animate-scale-in">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xl font-black text-white flex items-center gap-3">
                                    <Sparkles className="w-6 h-6 text-electric" /> Yanıt Analizi
                                </h3>
                                <button onClick={() => setProcessingResponse(null)} className="p-3 hover:bg-white/5 rounded-2xl text-navy-400"><X className="w-5 h-5" /></button>
                            </div>
                            {/* Modal content abbreviated for space but fully functional */}
                            {!processingResponse.result ? (
                                <div className="space-y-6">
                                    {processingResponse.checkingMail ? (
                                        <div className="h-56 flex flex-col items-center justify-center gap-4 bg-navy-950 border border-white/10 rounded-[1.5rem] animate-pulse">
                                            <RefreshCw className="w-10 h-10 text-electric animate-spin" />
                                            <p className="text-xs text-navy-400 font-bold uppercase tracking-widest">Gmail Kutusu Taranıyor...</p>
                                        </div>
                                    ) : (
                                        <textarea
                                            className="w-full h-56 bg-navy-950 border border-white/10 rounded-[1.5rem] p-6 text-sm text-white outline-none focus:border-electric/50 transition-all resize-none"
                                            placeholder="Yanıtı buraya yapıştırın veya 'Mail Ara' butonuna tıklayın..."
                                            value={processingResponse.emailText}
                                            onChange={(e) => setProcessingResponse(prev => ({ ...prev, emailText: e.target.value }))}
                                        />
                                    )}
                                    <button
                                        onClick={handleProcessResponse}
                                        disabled={processingResponse.checkingMail || !processingResponse.emailText.trim()}
                                        className="w-full py-4 rounded-[1.5rem] bg-electric text-white font-black uppercase tracking-widest text-xs disabled:opacity-30"
                                    >
                                        Analiz Et
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
                                        <p className="text-sm italic text-navy-200">"{processingResponse.result.summary}"</p>
                                    </div>
                                    <button onClick={() => setProcessingResponse(null)} className="w-full py-4 rounded-[1.5rem] bg-white text-navy-950 font-black tracking-widest text-xs">Kapat</button>
                                </div>
                            )}
                        </div>
                    </div>
                )
            }
        </div>
    );
}

function KPICard({ title, value, icon: Icon, trend, isPositive, color, iconColor }) {
    return (
        <div className={`glass rounded-[2rem] p-6 border border-white/[0.08] relative overflow-hidden group hover:border-white/20 transition-all duration-500`}>
            <div className={`absolute -inset-1 bg-gradient-to-br ${color} opacity-40 group-hover:opacity-100 transition-opacity blur-[40px] -z-10`} />
            <div className="flex justify-between items-start mb-4">
                <div className={`p-4 rounded-2xl bg-navy-950/50 border border-white/5 ${iconColor}`}>
                    <Icon className="w-6 h-6" />
                </div>
                {trend && (
                    <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black ${isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {trend}
                    </div>
                )}
            </div>
            <div>
                <p className="text-xs font-black text-navy-400 uppercase tracking-widest mb-1">{title}</p>
                <h3 className="text-3xl font-black text-white tracking-tighter">{value}</h3>
            </div>
        </div>
    );
}

function TableRow({ msg, type, onProcess, onCheckMail, index }) {
    const isPending = type === 'pending';
    return (
        <tr className="hover:bg-white/[0.03] transition-all group animate-fade-in-up" style={{ animationDelay: `${index * 50}ms` }}>
            <td className="px-8 py-5">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-navy-800 flex items-center justify-center text-xs font-black text-white border border-white/5">
                        {msg.candidateName?.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <p className="text-sm font-bold text-white">{msg.candidateName}</p>
                        <p className="text-[10px] font-mono text-navy-500">#{msg.trackingId || 'TRC'}</p>
                    </div>
                </div>
            </td>
            <td className="px-8 py-5 text-sm font-bold text-navy-200">{msg.candidatePosition}</td>
            <td className="px-8 py-5 text-xs text-navy-500">{msg.createdAt?.toDate?.()?.toLocaleDateString('tr-TR') || '-'}</td>
            <td className="px-8 py-5">
                <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${isPending ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'}`}>
                    {isPending ? 'Beklemede' : 'Tamamlandı'}
                </span>
            </td>
            <td className="px-8 py-5 text-right">
                {!isPending && (
                    <div className="flex items-center justify-end gap-2">
                        <button
                            onClick={onCheckMail}
                            title="Gmail'den otomatik tara"
                            className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-navy-400 hover:text-white hover:bg-white/10 transition-all"
                        >
                            <Search className="w-4 h-4" />
                        </button>
                        <button onClick={onProcess} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-[10px] font-black hover:bg-electric transition-all">İşle</button>
                    </div>
                )}
                {isPending && (
                    <button className="px-4 py-2 rounded-xl bg-electric text-white text-[10px] font-black hover:bg-electric-light transition-all">Onayla</button>
                )}
            </td>
        </tr>
    );
}

function EmptyRow({ message }) {
    return (
        <tr>
            <td colSpan={5} className="px-8 py-20 text-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-[1.5rem] bg-white/5 flex items-center justify-center">
                        <FileText className="w-6 h-6 text-navy-600" />
                    </div>
                    <p className="text-xs text-navy-500">{message}</p>
                </div>
            </td>
        </tr>
    );
}
