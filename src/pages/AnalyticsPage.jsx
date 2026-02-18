// src/pages/AnalyticsPage.jsx
// Executive dashboard with charts and data tables

import { useState, useMemo } from 'react';
import { useCandidates } from '../context/CandidatesContext';
import { useMessageQueue } from '../context/MessageQueueContext';
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
    AlertCircle
} from 'lucide-react';

export default function AnalyticsPage() {
    const { filteredCandidates, loading: candidatesLoading } = useCandidates();
    const { messages, loading: messagesLoading, stats: messageStats } = useMessageQueue();
    const [activeTab, setActiveTab] = useState('responses'); // 'responses' | 'pending'

    // ===== DATA PREPARATION =====

    // 1. Daily Applications Trend (Last 7 Days Mock Data)
    // In a real app, you would aggregate 'appliedDate' or 'createdAt' from Firestore
    const trendsData = useMemo(() => [
        { date: '10 Şub', applications: 4 },
        { date: '11 Şub', applications: 7 },
        { date: '12 Şub', applications: 5 },
        { date: '13 Şub', applications: 12 },
        { date: '14 Şub', applications: 8 },
        { date: '15 Şub', applications: 15 },
        { date: '16 Şub', applications: filteredCandidates.length > 5 ? filteredCandidates.length : 10 },
    ], [filteredCandidates.length]);

    // 2. Source Distribution
    const sourceData = useMemo(() => {
        const counts = {};
        filteredCandidates.forEach(c => {
            const src = c.source || 'Diğer';
            counts[src] = (counts[src] || 0) + 1;
        });

        // Fallback if no data
        if (Object.keys(counts).length === 0) {
            return [
                { name: 'LinkedIn', value: 65 },
                { name: 'Kariyer.net', value: 25 },
                { name: 'Referans', value: 10 },
            ];
        }

        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [filteredCandidates]);

    // 3. Average Match Score
    const avgMatchScore = useMemo(() => {
        if (filteredCandidates.length === 0) return 0;
        const total = filteredCandidates.reduce((acc, c) => acc + (c.matchScore || 0), 0);
        return Math.round(total / filteredCandidates.length);
    }, [filteredCandidates]);

    // 4. Tables Data
    const pendingApprovals = useMemo(() =>
        messages.filter(m => m.status === 'draft' || m.status === 'ready_to_send'),
        [messages]);

    const sentMessages = useMemo(() =>
        messages.filter(m => m.status === 'sent' || m.status === 'getting_replies'), // 'getting_replies' is hypothetical
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
                        value={filteredCandidates.length}
                        icon={Users}
                        change="+12%"
                        isPositive
                    />
                    <KPICard
                        title="Ortalama Skor"
                        value={`%${avgMatchScore}`}
                        icon={TrendingUp}
                        change="+5%"
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
                                Aday Havuzu Büyümesi
                            </h3>
                            <select className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1 text-xs text-navy-300 outline-none">
                                <option>Son 7 Gün</option>
                                <option>Son 30 Gün</option>
                            </select>
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
                                Aday havuzunuzun aranan pozisyonlara genel uygunluk oranı.
                            </p>
                        </div>

                        {/* Pie Chart */}
                        <div className="glass rounded-2xl p-6 border border-white/[0.06] flex-1">
                            <h3 className="text-sm font-bold text-navy-200 mb-4">Kaynak Dağılımı</h3>
                            <div className="h-[200px]">
                                <CustomPieChart data={sourceData} />
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
                            Gelen Yanıtlar / Gönderilenler
                            <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-xs ml-1">{sentMessages.length}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('pending')}
                            className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition-all cursor-pointer ${activeTab === 'pending'
                                    ? 'border-amber-400 text-amber-400'
                                    : 'border-transparent text-navy-400 hover:text-navy-200'
                                }`}
                        >
                            <Clock className="w-4 h-4" />
                            İK Onayı Bekleyenler
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
                                            <TableRow key={msg.id} msg={msg} type="sent" />
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

function TableRow({ msg, type }) {
    const isPending = type === 'pending';

    return (
        <tr className="hover:bg-white/[0.02] transition-colors group">
            <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-xs font-bold text-white">
                        {msg.candidateName?.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-navy-200">{msg.candidateName}</span>
                </div>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-navy-400">
                {msg.candidatePosition}
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-navy-500 font-mono">
                {msg.createdAt?.toDate?.()?.toLocaleDateString('tr-TR') || '-'}
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isPending
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'bg-emerald-500/10 text-emerald-400'
                    }`}>
                    {isPending
                        ? (msg.status === 'draft' ? 'Taslak' : 'Onay Bekliyor')
                        : (msg.status === 'sent' ? 'Gönderildi' : 'Yanıtlandı')}
                </span>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-right">
                <button className="text-xs font-semibold text-electric-light hover:text-white transition-colors opacity-0 group-hover:opacity-100">
                    Detay Gör
                </button>
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
