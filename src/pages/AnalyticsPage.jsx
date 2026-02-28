// src/pages/AnalyticsPage.jsx
import { useState, useMemo } from 'react';
import { useCandidates } from '../context/CandidatesContext';
import { useMessageQueue } from '../context/MessageQueueContext';
import { usePositions } from '../context/PositionsContext';
import Header from '../components/Header';
import CustomLineChart from '../components/charts/CustomLineChart';
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
    const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'acquisition' | 'positions' | 'responses'
    const [tableTab, setTableTab] = useState('responses'); // 'responses' | 'pending' (inner tab)
    const [timeRange, setTimeRange] = useState('7d');
    const [activeSourceTab, setActiveSourceTab] = useState('source'); // 'source' or 'subSource'

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
            if (err.message?.includes('Oturum süresi dolmuş') || err.message?.includes('401') || err.message?.includes('403')) {
                alert("Google bağlantı hatası: " + err.message + "\nLütfen Ayarlar sayfasından bağlantıyı tazeleyin ve tüm izinleri onaylayın.");
            } else {
                alert("E-postalar kontrol edilirken bir hata oluştu: " + err.message);
            }
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

    // 4. Source & Sub-Source Distribution
    const { sourceList, subSourceList } = useMemo(() => {
        const sources = {};
        const subSources = {};

        candidates.forEach(c => {
            const s = c.source?.includes('Visual') ? 'LinkedIn / Scraper' :
                c.source?.includes('Browser') ? 'Eklenti' :
                    c.source?.includes('CV') ? 'CV Yükleme' : (c.source || 'Diğer');

            if (!sources[s]) sources[s] = { count: 0, totalScore: 0, successCount: 0 };
            sources[s].count += 1;
            sources[s].totalScore += (c.matchScore || 0);

            const sub = c.sourceDetail || c.subSource || 'Belirtilmedi';
            if (!subSources[sub]) subSources[sub] = { count: 0, totalScore: 0, successCount: 0 };
            subSources[sub].count += 1;
            subSources[sub].totalScore += (c.matchScore || 0);

            // Determine if the candidate is considered "successful" (hired or offer stage)
            const isSuccessful = ['hired', 'offer'].includes(c.status);
            if (isSuccessful) {
                sources[s].successCount += 1;
                subSources[sub].successCount += 1;
            }
        });

        const formatData = (dataObj) => Object.entries(dataObj)
            .map(([name, data]) => {
                const avgScore = data.count > 0 ? Math.round(data.totalScore / data.count) : 0;
                const successRate = data.count > 0 ? Math.round((data.successCount / data.count) * 100) : 0;
                return {
                    name,
                    value: data.count,
                    percentage: avgScore,
                    successRate: successRate
                };
            })
            .sort((a, b) => b.value - a.value);

        return {
            sourceList: formatData(sources),
            subSourceList: formatData(subSources)
        };
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
        <div className="h-screen bg-[#020617] text-text-primary flex flex-col overflow-hidden">
            <Header title="Stratejik Analitik" />

            {/* DASHBOARD TOP BAR */}
            <div className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.05] bg-navy-950/50 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-4">
                    <div className="p-2 rounded-xl bg-electric/10 border border-electric/20 shrink-0">
                        <Zap className="w-5 h-5 text-electric animate-pulse" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black tracking-tighter text-text-primary uppercase hud-text">STRATEJİK KOMUTA MERKEZİ</h2>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <p className="text-[10px] text-navy-500 font-black uppercase tracking-widest">SİSTEM ÇALIŞIYOR: {candidates.length} AKTİF KAYIT</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <nav className="flex items-center gap-1 p-1 bg-white/[0.03] rounded-xl border border-white/10">
                        {[
                            { id: 'overview', label: 'GENEL BAKIŞ', icon: Activity },
                            { id: 'acquisition', label: 'EDİNME & KAYNAK', icon: Globe },
                            { id: 'responses', label: 'YANIT TAKİBİ', icon: MessageSquare }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black tracking-[0.1em] transition-all uppercase ${activeTab === tab.id ? 'bg-electric text-white shadow-xl shadow-electric/30 scale-[1.02]' : 'text-navy-500 hover:text-navy-300'}`}
                            >
                                <tab.icon className="w-3.5 h-3.5" />
                                {tab.label}
                            </button>
                        ))}
                    </nav>

                    <div className="h-8 w-px bg-white/10 hidden md:block mx-1"></div>

                    <div className="flex items-center gap-1 bg-navy-900/50 p-1 rounded-xl border border-white/5">
                        {['7d', '30d'].map(r => (
                            <button
                                key={r}
                                onClick={() => setTimeRange(r)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${timeRange === r ? 'bg-white/10 text-white' : 'text-navy-500 hover:text-navy-300'}`}
                            >
                                {r === '7d' ? '7G' : '30G'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <main className="flex-1 overflow-y-auto custom-scrollbar p-6">
                <div className="max-w-[1600px] mx-auto h-full space-y-6">

                    {activeTab === 'overview' && (
                        <div className="space-y-6 animate-fade-in">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                <KPICard title="Aktif Havuz" value={candidates.length} icon={Users} trend="+12%" isPositive color="from-blue-500/20 to-blue-600/5" iconColor="text-blue-400" />
                                <KPICard title="Yetenek Skoru" value={`${avgMatchScore}%`} icon={BrainCircuit} trend="+3.4%" isPositive color="from-violet-500/20 to-violet-600/5" iconColor="text-violet-400" />
                                <KPICard title="Yanıt Bekleyen" value={messageStats.sent - messageStats.replied} icon={Clock} trend="-5%" isPositive={false} color="from-amber-500/20 to-amber-600/5" iconColor="text-amber-400" />
                                <KPICard title="İşe Alım Verimi" value={`${Math.round((candidates.filter(c => c.status === 'hired').length / (candidates.length || 1)) * 100)}%`} icon={Target} trend="+2%" isPositive color="from-emerald-500/20 to-emerald-600/5" iconColor="text-emerald-400" />
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                                <div className="xl:col-span-8 glass rounded-[2.5rem] p-8 border border-white/[0.08] relative overflow-hidden h-[360px]">
                                    <h3 className="text-lg font-black text-text-primary flex items-center gap-2 uppercase tracking-tighter mb-6"><Activity className="w-5 h-5 text-electric-light" /> PERFORMANS TRENDİ</h3>
                                    <div className="h-[240px]"><CustomLineChart data={trendsData} /></div>
                                </div>
                                <div className="xl:col-span-4 glass rounded-[2.5rem] p-8 border border-white/[0.08] flex flex-col h-[360px]">
                                    <h3 className="text-lg font-black text-text-primary mb-6 flex items-center gap-2 uppercase tracking-tighter"><Layers className="w-5 h-5 text-amber-400" /> DÖNÜŞÜM HUNİSİ</h3>
                                    <div className="flex-1 flex flex-col justify-between py-2 overflow-hidden">
                                        {funnelData.map((stage, idx) => (
                                            <div key={stage.name} className="relative group/funnel animate-fade-in-up" style={{ animationDelay: `${idx * 100}ms` }}>
                                                <div className="flex justify-between items-end mb-1.5">
                                                    <span className="text-[10px] font-black text-navy-400 uppercase tracking-widest">{stage.name}</span>
                                                    <span className="text-sm font-black text-text-primary">{stage.count}</span>
                                                </div>
                                                <div className="h-2 bg-navy-950 rounded-full overflow-hidden border border-white/5">
                                                    <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.max(5, (stage.count / (candidates.length || 1)) * 100)}%`, backgroundColor: stage.color }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Integrated Positions Matrix */}
                            <div className="glass rounded-[2.5rem] p-8 border border-white/[0.08] relative overflow-hidden group">
                                <h3 className="text-lg font-black text-text-primary flex items-center gap-3 uppercase tracking-tighter mb-8"><Briefcase className="w-5 h-5 text-violet-400" /> POZİSYON PERFORMANS MATRİSİ</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    {positionStatusData.slice(0, 4).map((pos, idx) => (
                                        <div key={pos.name} className="p-5 rounded-[1.5rem] bg-white/[0.02] border border-white/[0.05] hover:border-violet-500/30 transition-all">
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="min-w-0 flex-1">
                                                    <h4 className="text-[11px] font-black text-text-primary truncate uppercase tracking-tight">{pos.name}</h4>
                                                    <p className="text-[9px] text-navy-500 font-black uppercase mt-1">{pos.total} ADAY</p>
                                                </div>
                                                <div className="text-lg font-black text-violet-400">%{pos.avgScore}</div>
                                            </div>
                                            <div className="space-y-3">
                                                {[['İŞE ALIM', pos.hired, 'emerald-500'], ['MÜLAKAT', pos.interview, 'blue-500']].map(([label, val, color]) => (
                                                    <div key={label} className="space-y-1">
                                                        <div className="flex justify-between text-[8px] font-black uppercase"><span className={`text-${color.replace('-500', '-400')}`}>{label}</span><span className="text-text-primary">{val}</span></div>
                                                        <div className="h-1 bg-navy-950 rounded-full overflow-hidden"><div className={`h-full bg-${color}`} style={{ width: `${(val / (pos.total || 1)) * 100}%` }} /></div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'acquisition' && (
                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 animate-fade-in h-[600px]">
                            <div className="xl:col-span-5 glass rounded-[2.5rem] p-8 border border-white/[0.08] flex flex-col min-h-0">
                                <div className="flex items-center justify-between mb-8">
                                    <h3 className="text-lg font-black text-text-primary flex items-center gap-2 uppercase tracking-tighter"><Globe className="w-5 h-5 text-cyan-400" /> KAYNAK ANALİZİ</h3>
                                    <div className="flex bg-navy-900/50 rounded-xl p-1 border border-white/10 shrink-0">
                                        <button onClick={() => setActiveSourceTab('source')} className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${activeSourceTab === 'source' ? 'bg-cyan-500 text-white' : 'text-navy-500'}`}>Kanal</button>
                                        <button onClick={() => setActiveSourceTab('subSource')} className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${activeSourceTab === 'subSource' ? 'bg-cyan-500 text-white' : 'text-navy-500'}`}>Detay</button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                                    {(activeSourceTab === 'source' ? sourceList : subSourceList).map((item) => (
                                        <div key={item.name} className="flex justify-between items-center bg-white/[0.02] border border-white/[0.05] p-5 rounded-2xl hover:border-cyan-500/30 transition-all">
                                            <div className="min-w-0 pr-4">
                                                <span className="text-sm font-black text-text-primary uppercase tracking-tight block truncate mb-1">{item.name}</span>
                                                <span className="text-[10px] font-bold text-navy-500 uppercase tracking-widest">{item.value} ADAY</span>
                                            </div>
                                            <div className="flex items-center gap-5 shrink-0">
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[10px] text-navy-500 font-black uppercase tracking-widest mb-1">UYUM</span>
                                                    <span className="text-sm font-black text-cyan-400">%{item.percentage}</span>
                                                </div>
                                                <div className="w-px h-8 bg-white/5"></div>
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[10px] text-navy-500 font-black uppercase tracking-widest mb-1">BAŞARI</span>
                                                    <span className="text-sm font-black text-emerald-400">%{item.successRate}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="xl:col-span-4 glass rounded-[2.5rem] p-8 border border-white/[0.08] flex flex-col min-h-0">
                                <h3 className="text-lg font-black text-text-primary mb-8 flex items-center gap-2 uppercase tracking-tighter"><Zap className="w-5 h-5 text-electric-light" /> YETENEK MATRİSİ</h3>
                                <div className="flex flex-wrap gap-3 overflow-y-auto custom-scrollbar flex-1 pr-2 content-start">
                                    {topSkills.map(([skill, count]) => (
                                        <div key={skill} className="px-5 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-electric/30 hover:bg-electric/5 transition-all group flex items-center gap-4">
                                            <span className="text-sm font-bold text-navy-200 uppercase tracking-tight">{skill}</span>
                                            <span className="text-xs font-black text-electric bg-electric/10 px-2 py-1 rounded-lg">{count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="xl:col-span-3 glass rounded-[2.5rem] p-8 border border-white/[0.08] flex flex-col items-center justify-center relative min-h-0">
                                <GaugeChart value={avgMatchScore} size={200} />
                                <span className="text-4xl font-black text-text-primary tracking-tighter mt-4">%{avgMatchScore}</span>
                                <span className="text-[10px] font-black text-electric uppercase tracking-[0.2em] mt-2">OPTIMAL UYUMLULUK</span>
                            </div>
                        </div>
                    )}


                    {activeTab === 'responses' && (
                        <div className="glass rounded-[2.5rem] border border-white/[0.08] overflow-hidden animate-fade-in h-[600px] flex flex-col">
                            <div className="flex items-center justify-between border-b border-white/[0.08] px-8 bg-white/[0.01]">
                                <div className="flex">
                                    <button onClick={() => setTableTab('responses')} className={`px-8 py-6 text-xs font-black border-b-2 transition-all uppercase tracking-widest ${tableTab === 'responses' ? 'border-electric text-text-primary' : 'border-transparent text-navy-500'}`}>YANIT TAKİBİ ({sentMessages.length})</button>
                                    <button onClick={() => setTableTab('pending')} className={`px-8 py-6 text-xs font-black border-b-2 transition-all uppercase tracking-widest ${tableTab === 'pending' ? 'border-amber-400 text-amber-400' : 'border-transparent text-navy-500'}`}>TASLAKLAR ({pendingApprovals.length})</button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-auto custom-scrollbar">
                                <table className="w-full text-left border-collapse min-w-[1000px]">
                                    <thead className="sticky top-0 bg-navy-950"><tr className="border-b border-white/[0.08]"><th className="px-8 py-6 text-[10px] font-black text-navy-500 uppercase tracking-widest">Aday</th><th className="px-8 py-6 text-[10px] font-black text-navy-500 uppercase tracking-widest">Pozisyon</th><th className="px-8 py-6 text-[10px] font-black text-navy-500 uppercase tracking-widest">Tarih</th><th className="px-8 py-6 text-[10px] font-black text-navy-500 uppercase tracking-widest">Durum</th><th className="px-8 py-6 text-[10px] font-black text-navy-500 uppercase tracking-widest text-right">Aksiyon</th></tr></thead>
                                    <tbody className="divide-y divide-white/[0.02]">
                                        {(tableTab === 'responses' ? sentMessages : pendingApprovals).map((msg, idx) => (
                                            <TableRow key={idx} msg={msg} type={tableTab === 'responses' ? 'sent' : 'pending'} index={idx} onProcess={() => openResponseModal(msg)} onCheckMail={() => handleCheckEmail(msg)} />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* AI MODAL */}
            {processingResponse && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-xl" onClick={() => setProcessingResponse(null)} />
                    <div className="relative w-full max-w-xl glass rounded-[3rem] p-8 border border-white/10 space-y-6 animate-scale-in">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-black text-text-primary flex items-center gap-3 uppercase hud-text"><Sparkles className="w-6 h-6 text-electric" /> Yanıt Analizi</h3>
                            <button onClick={() => setProcessingResponse(null)} className="p-3 hover:bg-white/5 rounded-2xl text-navy-400"><X className="w-5 h-5" /></button>
                        </div>
                        {!processingResponse.result ? (
                            <div className="space-y-6">
                                {processingResponse.checkingMail ? (
                                    <div className="h-56 flex flex-col items-center justify-center gap-4 bg-navy-950 border border-white/10 rounded-[1.5rem] animate-pulse">
                                        <RefreshCw className="w-10 h-10 text-electric animate-spin" />
                                        <p className="text-[10px] text-navy-400 font-bold uppercase tracking-widest">Gmail Taranıyor...</p>
                                    </div>
                                ) : (
                                    <textarea className="w-full h-56 bg-navy-950 border border-white/10 rounded-[1.5rem] p-6 text-sm text-text-primary outline-none focus:border-electric/50 transition-all resize-none" placeholder="Yanıtı buraya yapıştırın veya 'Mail Ara' butonuna tıklayın..." value={processingResponse.emailText} onChange={(e) => setProcessingResponse(prev => ({ ...prev, emailText: e.target.value }))} />
                                )}
                                <button onClick={handleProcessResponse} disabled={processingResponse.checkingMail || !processingResponse.emailText.trim()} className="w-full py-4 rounded-[1.5rem] bg-electric text-text-primary font-black uppercase tracking-widest text-xs disabled:opacity-30 shadow-xl shadow-electric/20 active:scale-95 transition-all">Analiz Et</button>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="p-6 rounded-3xl bg-white/5 border border-white/10"><p className="text-sm italic text-navy-200">"{processingResponse.result.summary}"</p></div>
                                <button onClick={() => setProcessingResponse(null)} className="w-full py-4 rounded-[1.5rem] bg-white text-navy-950 font-black tracking-widest text-xs uppercase active:scale-95 transition-all">Kapat</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function KPICard({ title, value, icon: IconComponent, trend, isPositive, color, iconColor }) {
    return (
        <div className={`glass rounded-[2rem] p-6 border border-white/[0.08] relative overflow-hidden group hover:border-white/20 transition-all duration-500`}>
            <div className={`absolute -inset-1 bg-gradient-to-br ${color} opacity-40 group-hover:opacity-100 transition-opacity blur-[40px] -z-10`} />
            <div className="flex justify-between items-start mb-4">
                <div className={`p-4 rounded-2xl bg-navy-950/50 border border-white/5 ${iconColor}`}>
                    {IconComponent && <IconComponent className="w-6 h-6" />}
                </div>
                {trend && (
                    <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black ${isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {trend}
                    </div>
                )}
            </div>
            <div>
                <p className="text-xs font-black text-navy-400 uppercase tracking-widest mb-1">{title}</p>
                <h3 className="text-3xl font-black text-text-primary tracking-tighter">{value}</h3>
            </div>
        </div>
    );
}

function TableRow({ msg, type, onProcess, onCheckMail, index }) {
    const isPending = type === 'pending';
    return (
        <tr className="hover:bg-white/[0.03] transition-all group animate-fade-in-up" style={{ animationDelay: `${index * 30}ms` }}>
            <td className="px-8 py-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-navy-800 flex items-center justify-center text-xs font-black text-white border border-white/5 shadow-xl">
                        {msg.candidateName?.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <p className="text-sm font-black text-text-primary uppercase tracking-tight">{msg.candidateName}</p>
                        <p className="text-[10px] font-bold text-navy-600 uppercase tracking-widest mt-0.5">#{msg.candidateId?.substring(0, 8) || 'SYSTEM'}</p>
                    </div>
                </div>
            </td>
            <td className="px-8 py-6 text-xs font-black text-navy-300 uppercase tracking-tighter">{msg.candidatePosition}</td>
            <td className="px-8 py-6 text-[11px] font-bold text-navy-500 uppercase tracking-widest">{msg.createdAt?.toDate?.()?.toLocaleDateString('tr-TR') || '-'}</td>
            <td className="px-8 py-6">
                <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-[0.1em] border ${isPending ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'}`}>
                    {isPending ? 'BEKLEMEDE' : 'TAMAMLANDI'}
                </span>
            </td>
            <td className="px-8 py-6 text-right">
                {!isPending && (
                    <div className="flex items-center justify-end gap-3">
                        <button
                            onClick={onCheckMail}
                            title="Gmail'den otomatik tara"
                            className="p-3 rounded-xl bg-white/[0.03] border border-white/10 text-navy-400 hover:text-text-primary hover:bg-white/10 transition-all group/btn"
                        >
                            <Search className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                        </button>
                        <button onClick={onProcess} className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-text-primary text-[10px] font-black uppercase tracking-widest hover:bg-electric hover:border-electric transition-all shadow-lg active:scale-95">İşle</button>
                    </div>
                )}
                {isPending && (
                    <button className="px-6 py-2.5 rounded-xl bg-electric text-white text-[10px] font-black uppercase tracking-widest hover:bg-electric-light transition-all shadow-xl shadow-electric/20 active:scale-95">Onayla</button>
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
