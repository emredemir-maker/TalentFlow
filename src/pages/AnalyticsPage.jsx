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
    BarChart3,
    TrendingUp,
    Users,
    MessageSquare,
    Clock,
    CheckCircle,
    FileText,
    AlertCircle,
    Loader2,
    Sparkles,
    Send,
    X,
    ChevronRight
} from 'lucide-react';
import { analyzeResponseEmail } from '../services/geminiService';

export default function AnalyticsPage() {
    const { filteredCandidates: candidates, loading: candidatesLoading, updateCandidate } = useCandidates();
    const { messages, loading: messagesLoading, stats: messageStats } = useMessageQueue();
    const { positions } = usePositions();
    const [activeTab, setActiveTab] = useState('responses'); // 'responses' | 'pending'

    // Response processing state
    const [processingResponse, setProcessingResponse] = useState(null); // { message, emailText, loading, result }

    const openResponseModal = (msg) => {
        setProcessingResponse({ message: msg, emailText: '', loading: false, result: null });
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
    // ... (rest of the data preparation logic remains the same)

    // 1. Daily Applications Trend (Last 7 Days - REAL DATA)
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

    // 2. Position Distribution (REAL DATA)
    const positionDistribution = useMemo(() => {
        const counts = {};
        candidates.forEach(c => {
            const pos = c.matchedPositionTitle || 'Atanmamış';
            counts[pos] = (counts[pos] || 0) + 1;
        });

        // Use positions list to ensure we show titles even with 0 candidates if needed, 
        // but here we'll just show what's in the candidates array for distribution.
        if (Object.keys(counts).length === 0) {
            return [{ name: 'Veri Yok', value: 1 }];
        }

        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [candidates]);

    // 3. Average Match Score
    const avgMatchScore = useMemo(() => {
        if (candidates.length === 0) return 0;
        const total = candidates.reduce((acc, c) => acc + (c.matchScore || 0), 0);
        return Math.round(total / candidates.length);
    }, [candidates]);

    // 4. Tables Data
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
        <div className="min-h-screen pb-20">
            <Header title="İK Yöneticisi Paneli" />

            {/* ===== KPI CARDS ===== */}
            <div className="px-6 lg:px-8 py-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <KPICard
                        title="Toplam Aday"
                        value={candidates.length}
                        icon={Users}
                        change="+0%"
                        isPositive
                    />
                    <KPICard
                        title="Ortalama Skor"
                        value={`%${avgMatchScore}`}
                        icon={TrendingUp}
                        change="+0%"
                        isPositive
                    />
                    <KPICard
                        title="Onay Bekleyen Mesaj"
                        value={messageStats.draft + messageStats.readyToSend}
                        icon={Clock}
                        color="text-amber-400"
                        bg="bg-amber-500/10"
                    />
                    <KPICard
                        title="Gönderilen Mesaj"
                        value={messageStats.sent}
                        icon={CheckCircle}
                        color="text-emerald-400"
                        bg="bg-emerald-500/10"
                    />
                </div>
            </div>

            {/* ===== CHARTS ROW ===== */}
            <div className="px-6 lg:px-8 pb-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Line Chart */}
                    <div className="lg:col-span-2 glass rounded-2xl p-6 border border-white/[0.06]">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                <BarChart3 className="w-5 h-5 text-electric-light" />
                                Günlük Başvuru Trendi
                            </h3>
                            <div className="text-[10px] text-navy-500 font-bold uppercase tracking-widest bg-white/5 px-2 py-1 rounded">
                                Son 7 Gün (Canlı)
                            </div>
                        </div>
                        <CustomLineChart data={trendsData} />
                    </div>

                    {/* Gauge & Pie Column */}
                    <div className="flex flex-col gap-6">
                        {/* Gauge */}
                        <div className="glass rounded-2xl p-6 border border-white/[0.06] flex flex-col items-center">
                            <h3 className="text-sm font-bold text-navy-200 w-full mb-2">Ortalama Uyumluluk</h3>
                            <GaugeChart value={avgMatchScore} label="Match Score" />
                            <p className="text-xs text-navy-400 text-center mt-2 max-w-[200px]">
                                Aday havuzunun seçili pozisyonlara genel uygunluk oranı.
                            </p>
                        </div>

                        {/* Pie Chart */}
                        <div className="glass rounded-2xl p-6 border border-white/[0.06] flex-1">
                            <h3 className="text-sm font-bold text-navy-200 mb-4">Pozisyon Dağılımı</h3>
                            <div className="h-[200px]">
                                <CustomPieChart data={positionDistribution} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== DATA TABLE TABS ===== */}
            <div className="px-6 lg:px-8">
                <div className="glass rounded-2xl border border-white/[0.06] overflow-hidden">

                    {/* Tabs Header */}
                    <div className="flex items-center border-b border-white/[0.06] px-2 bg-white/[0.01]">
                        <button
                            onClick={() => setActiveTab('responses')}
                            className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition-all cursor-pointer ${activeTab === 'responses'
                                ? 'border-electric text-white'
                                : 'border-transparent text-navy-400 hover:text-navy-200'
                                }`}
                        >
                            <MessageSquare className="w-4 h-4" />
                            Giden Mesajlar & Yanıt Takibi
                            <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-xs ml-1">{sentMessages.length}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('pending')}
                            className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition-all cursor-pointer ${activeTab === 'pending'
                                ? 'border-amber-400 text-amber-400'
                                : 'border-transparent text-navy-400 hover:text-navy-200'
                                }`}
                            title="AI tarafından hazırlanan ancak henüz adaya e-posta olarak gönderilmemiş onay bekleyen taslaklar."
                        >
                            <Clock className="w-4 h-4" />
                            İK Onayında Bekleyen Taslaklar
                            <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-xs ml-1">{pendingApprovals.length}</span>
                        </button>
                    </div>

                    {/* Table Content */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                                    <th className="px-6 py-3 text-xs font-semibold text-navy-400 uppercase tracking-wider">Aday</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-navy-400 uppercase tracking-wider">Pozisyon</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-navy-400 uppercase tracking-wider">Tarih</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-navy-400 uppercase tracking-wider">Durum</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-navy-400 uppercase tracking-wider text-right">İşlem</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04]">
                                {activeTab === 'responses' ? (
                                    sentMessages.length > 0 ? (
                                        sentMessages.map((msg) => (
                                            <TableRow
                                                key={msg.id}
                                                msg={msg}
                                                type="sent"
                                                onProcess={() => openResponseModal(msg)}
                                            />
                                        ))
                                    ) : (
                                        <EmptyRow message="Henüz gönderilmiş veya yanıtlanmış mesaj yok." />
                                    )
                                ) : (
                                    pendingApprovals.length > 0 ? (
                                        pendingApprovals.map((msg) => (
                                            <TableRow key={msg.id} msg={msg} type="pending" />
                                        ))
                                    ) : (
                                        <EmptyRow message="Onay bekleyen mesaj yok. Harika!" />
                                    )
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* AI RESPONSE PROCESSOR MODAL */}
            {processingResponse && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-md" onClick={() => setProcessingResponse(null)} />
                    <div className="relative w-full max-w-lg glass rounded-3xl overflow-hidden border border-white/10 p-6 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-electric-light" /> Gelen Yanıtı Analiz Et
                            </h3>
                            <button onClick={() => setProcessingResponse(null)} className="p-2 hover:bg-white/5 rounded-lg text-navy-400"><X className="w-4 h-4" /></button>
                        </div>

                        <div className="p-3 rounded-xl bg-white/5 text-[11px] text-navy-400">
                            Gmail veya Outlook üzerinden aldığınız yanıtı buraya yapıştırın. AI içeriği analiz ederek adayın durumunu güncelleyecektir.
                        </div>

                        {!processingResponse.result ? (
                            <div className="space-y-4">
                                <textarea
                                    className="w-full h-40 bg-navy-900 border border-white/10 rounded-xl p-4 text-sm text-white outline-none focus:border-electric transition-all resize-none font-sans"
                                    placeholder="E-posta içeriğini buraya yapıştırın..."
                                    value={processingResponse.emailText}
                                    onChange={(e) => setProcessingResponse(prev => ({ ...prev, emailText: e.target.value }))}
                                />
                                <button
                                    onClick={handleProcessResponse}
                                    disabled={processingResponse.loading || !processingResponse.emailText.trim()}
                                    className="w-full py-3 rounded-xl bg-electric text-white font-bold flex items-center justify-center gap-2 hover:bg-electric-light transition-all disabled:opacity-50"
                                >
                                    {processingResponse.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Analiz Et & Kaydet
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4 animate-in zoom-in-95 duration-300">
                                <div className={`p-4 rounded-2xl border ${processingResponse.result.sentiment === 'Olumlu' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${processingResponse.result.sentiment === 'Olumlu' ? 'bg-emerald-500 text-navy-900' : 'bg-red-500 text-white'}`}>
                                            {processingResponse.result.sentiment === 'Olumlu' ? <CheckCircle className="w-5 h-5" /> : <X className="w-5 h-5" />}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-navy-300 uppercase">Analiz Sonucu</p>
                                            <p className="text-sm font-bold text-white">{processingResponse.result.sentiment} Yaklaşım</p>
                                        </div>
                                    </div>
                                    <p className="text-[12px] text-navy-200 italic">"{processingResponse.result.summary}"</p>
                                </div>
                                <div className="p-4 rounded-xl bg-electric/5 border border-electric/10 space-y-2">
                                    <p className="text-[11px] font-bold text-electric-light uppercase tracking-widest">Önerilen Aksiyon:</p>
                                    <p className="text-xs text-white">{processingResponse.result.actionLog}</p>
                                    <p className="text-[10px] text-navy-500 italic">Aday durumu '{processingResponse.result.suggestedStatus}' olarak güncellendi.</p>
                                </div>
                                <button onClick={() => setProcessingResponse(null)} className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-all">Kapat</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ===== SUB-COMPONENTS =====

function KPICard({ title, value, icon: Icon, change, isPositive, color = 'text-electric-light', bg = 'bg-electric/10' }) {
    return (
        <div className="glass rounded-2xl p-5 border border-white/[0.06] flex items-start justify-between">
            <div>
                <p className="text-xs font-medium text-navy-400 uppercase tracking-wider mb-1">{title}</p>
                <h3 className="text-2xl font-extrabold text-white">{value}</h3>
                {change && (
                    <div className={`flex items-center gap-1 mt-1 text-xs font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                        <span>{change}</span>
                        <span className="text-navy-500 font-medium">bu hafta</span>
                    </div>
                )}
            </div>
            <div className={`p-3 rounded-xl ${bg}`}>
                <Icon className={`w-5 h-5 ${color}`} />
            </div>
        </div>
    );
}

function TableRow({ msg, type, onProcess }) {
    const isPending = type === 'pending';

    return (
        <tr className="hover:bg-white/[0.02] transition-colors group">
            <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-electric/20 to-navy-800 flex items-center justify-center text-[10px] font-bold text-white border border-white/5">
                        {msg.candidateName?.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-medium text-navy-200">{msg.candidateName}</span>
                        {msg.trackingId && (
                            <span className="text-[9px] font-mono text-electric-light opacity-70">#{msg.trackingId}</span>
                        )}
                    </div>
                </div>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-navy-400">
                {msg.candidatePosition}
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-navy-500 font-mono">
                {msg.createdAt?.toDate?.()?.toLocaleDateString('tr-TR') || '-'}
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-tighter ${isPending
                    ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                    : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                    }`}>
                    {isPending
                        ? (msg.status === 'draft' ? 'Taslak' : 'Onay Bekliyor')
                        : (msg.status === 'sent' ? 'Gönderildi' : msg.status === 'email_opened' ? 'E-posta Açıldı' : 'Yanıtlandı')}
                </span>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-right">
                {!isPending && (
                    <button
                        onClick={onProcess}
                        className="px-3 py-1.5 rounded-lg bg-electric/10 text-electric-light text-[11px] font-bold hover:bg-electric shadow-lg shadow-electric/0 hover:shadow-electric/20 hover:text-white transition-all"
                    >
                        Cevabı İşle (AI)
                    </button>
                )}
                {isPending && (
                    <button className="text-xs font-bold text-navy-500 flex items-center gap-1 ml-auto hover:text-white transition-colors">
                        Onayla <ChevronRight className="w-3 h-3" />
                    </button>
                )}
            </td>
        </tr>
    );
}

function EmptyRow({ message }) {
    return (
        <tr>
            <td colSpan={5} className="px-6 py-12 text-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-white/[0.03] flex items-center justify-center">
                        <FileText className="w-5 h-5 text-navy-500" />
                    </div>
                    <p className="text-sm text-navy-400">{message}</p>
                </div>
            </td>
        </tr>
    );
}
