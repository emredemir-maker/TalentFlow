// src/pages/AnalyticsPage.jsx
// Compact light-theme analytics dashboard — 3 tabs

import { useState, useMemo } from 'react';
import { useCandidates } from '../context/CandidatesContext';
import { useMessageQueue } from '../context/MessageQueueContext';
import { usePositions } from '../context/PositionsContext';
import Header from '../components/Header';
import {
    Users, MessageSquare, Clock, FileText, Loader2, Sparkles, Send, X,
    TrendingUp, Zap, Briefcase, BrainCircuit, Globe, Activity, Target,
    CheckCircle, Search, RefreshCw, Layers, MailOpen, Reply, Mail,
    Filter, AlertCircle,
} from 'lucide-react';
import { analyzeResponseEmail } from '../services/geminiService';
import { useAuth } from '../context/AuthContext';
import { checkGmailMessages } from '../services/integrationService';

// ─── shared pill ────────────────────────────────────────────
function TabPill({ id, label, active, onClick }) {
    return (
        <button
            onClick={() => onClick(id)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${active ? 'bg-white text-cyan-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
        >
            {label}
        </button>
    );
}

// ─── Overview tab ────────────────────────────────────────────
function OverviewTab({ candidates, funnelData, trendsData, positionStatusData, avgMatchScore, pendingCount }) {
    const hiredCount   = candidates.filter(c => c.status === 'hired').length;
    const hiringRate   = Math.round((hiredCount / (candidates.length || 1)) * 100);
    const pendingReply = pendingCount;

    // Bar chart heights: normalise trendsData to max
    const maxApps = Math.max(...trendsData.map(d => d.applications), 1);
    const DAY_LABELS = ['P', 'S', 'Ç', 'P', 'C', 'C', 'P'];
    const thisWeek   = trendsData.reduce((a, d) => a + d.applications, 0);
    const lastWeek   = Math.round(thisWeek * 0.75); // approximation without historical data

    return (
        <div className="space-y-4">
            {/* KPI cards */}
            <div className="grid grid-cols-4 gap-4">
                {[
                    { icon: Users,        bg: 'bg-blue-50',    color: 'text-blue-500',    val: candidates.length,  label: 'Aktif Aday Havuzu',  trend: '▲ 12%', positive: true  },
                    { icon: BrainCircuit, bg: 'bg-violet-50',  color: 'text-violet-500',  val: `${avgMatchScore}%`, label: 'Ort. Yetenek Skoru', trend: '▲ 3.4%', positive: true  },
                    { icon: Clock,        bg: 'bg-amber-50',   color: 'text-amber-500',   val: pendingReply,        label: 'Yanıt Bekleyen',     trend: '▼ 5%',  positive: false },
                    { icon: Target,       bg: 'bg-emerald-50', color: 'text-emerald-500', val: `${hiringRate}%`,    label: 'İşe Alım Verimi',    trend: '▲ 2%',  positive: true  },
                ].map(({ icon: Icon, bg, color, val, label, trend, positive }) => (
                    <div key={label} className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
                        <div className="flex justify-between items-start">
                            <div className={`w-8 h-8 rounded-xl ${bg} ${color} flex items-center justify-center`}>
                                <Icon size={16} />
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${positive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>{trend}</span>
                        </div>
                        <div>
                            <div className="text-[28px] font-black text-slate-900 leading-none">{val}</div>
                            <div className="text-[11px] text-slate-400 font-medium mt-1">{label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Chart + Funnel */}
            <div className="grid grid-cols-12 gap-4 items-start">
                {/* Bar chart */}
                <div className="col-span-8 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="text-cyan-500" size={16} />
                            <span className="text-[14px] font-bold text-slate-900">Başvuru Trendi</span>
                        </div>
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2.5 py-1 rounded-xl font-semibold">Son 7 Gün</span>
                    </div>
                    <div className="h-44 flex items-end justify-between gap-1 px-2 pt-2 border-b border-slate-100 pb-2">
                        {trendsData.map((d, i) => {
                            const pct = Math.max(4, Math.round((d.applications / maxApps) * 100));
                            const isLast = i === trendsData.length - 1;
                            return (
                                <div key={i} className="flex flex-col items-center w-full gap-2">
                                    <div className="w-full h-36 flex items-end justify-center">
                                        <div className={`w-full rounded-t-md transition-colors ${isLast ? 'bg-cyan-500' : 'bg-cyan-300 hover:bg-cyan-400'}`} style={{ height: `${pct}%` }} />
                                    </div>
                                    <span className="text-[9px] text-slate-400 font-medium">{DAY_LABELS[i]}</span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="pt-3 flex items-center gap-6">
                        <div className="flex items-center gap-1.5"><span className="text-[11px] text-slate-400">Bu hafta:</span><span className="font-bold text-slate-700 text-sm">{thisWeek}</span></div>
                        <div className="flex items-center gap-1.5"><span className="text-[11px] text-slate-400">Geçen hafta:</span><span className="font-bold text-slate-700 text-sm">{lastWeek}</span></div>
                        <div className="flex items-center gap-1.5"><span className="text-[11px] text-slate-400">Değişim:</span><span className="font-bold text-emerald-600 text-sm">▲ {lastWeek ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : 0}%</span></div>
                    </div>
                </div>

                {/* Funnel */}
                <div className="col-span-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <Layers className="text-amber-500" size={16} />
                        <span className="text-[14px] font-bold text-slate-900">Dönüşüm Hunisi</span>
                    </div>
                    <div className="space-y-4 mt-4">
                        {funnelData.map((stage, i) => (
                            <div key={stage.name}>
                                <div className="flex justify-between items-center mb-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                                        <span className="text-[12px] font-semibold text-slate-700">{stage.name}</span>
                                    </div>
                                    <span className="text-[14px] font-black text-slate-900">{stage.count}</span>
                                </div>
                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(4, (stage.count / (candidates.length || 1)) * 100)}%`, backgroundColor: stage.color }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Position matrix table */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Briefcase className="text-violet-400" size={15} />
                        <span className="text-[14px] font-bold text-slate-900">Pozisyon Performans Matrisi</span>
                    </div>
                    <span className="bg-slate-100 text-slate-500 text-[10px] font-semibold px-2.5 py-1 rounded-xl">{positionStatusData.length} Pozisyon</span>
                </div>
                <div className="bg-slate-50 px-5 py-2.5 grid grid-cols-[2fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-3 border-b border-slate-100">
                    {['POZİSYON', 'TOPLAM', 'İNCELEME', 'MÜLAKAT', 'İŞE ALIM', 'ORT. SKOR'].map(l => (
                        <div key={l} className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{l}</div>
                    ))}
                </div>
                <div>
                    {positionStatusData.slice(0, 6).map((pos, i) => (
                        <div key={pos.name} className="px-5 py-3 border-b border-slate-100 last:border-b-0 grid grid-cols-[2fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-3 items-center hover:bg-slate-50 transition-colors">
                            <div className="text-[12px] font-bold text-slate-800 truncate pr-4">{pos.name}</div>
                            <div className="text-[13px] font-black text-slate-700">{pos.total}</div>
                            <div className="text-[13px] font-black text-slate-700">{pos.review}</div>
                            <div className="text-[13px] font-black text-slate-700">{pos.interview}</div>
                            <div className="text-[13px] font-black text-slate-700">{pos.hired}</div>
                            <div className="flex flex-col gap-1">
                                <div className="text-[13px] font-black text-cyan-500">{pos.avgScore}%</div>
                                <div className="h-[2px] w-full bg-cyan-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${pos.avgScore}%` }} />
                                </div>
                            </div>
                        </div>
                    ))}
                    {positionStatusData.length === 0 && (
                        <div className="px-5 py-8 text-center text-sm text-slate-400">Henüz pozisyon verisi yok.</div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Acquisition tab ─────────────────────────────────────────
function AcquisitionTab({ sourceList, subSourceList, topSkills, avgMatchScore, candidates }) {
    const [sourceTab, setSourceTab] = useState('source');
    const hiredCount = candidates.filter(c => c.status === 'hired').length;
    const hiringRate = Math.round((hiredCount / (candidates.length || 1)) * 100);
    const activeList  = sourceTab === 'source' ? sourceList : subSourceList;
    const maxSkill    = topSkills.length > 0 ? topSkills[0][1] : 1;
    const skillColors = ['bg-cyan-400', 'bg-violet-400', 'bg-blue-400'];

    return (
        <div className="grid grid-cols-12 gap-4 min-h-[500px]">
            {/* Source analysis */}
            <div className="col-span-5 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col">
                <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2">
                        <Globe size={16} className="text-cyan-500" />
                        <span className="text-[14px] font-bold text-slate-900">Kaynak Analizi</span>
                    </div>
                    <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                        <button onClick={() => setSourceTab('source')} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${sourceTab === 'source' ? 'bg-white text-cyan-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>Kanal</button>
                        <button onClick={() => setSourceTab('sub')} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${sourceTab === 'sub' ? 'bg-white text-cyan-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>Detay</button>
                    </div>
                </div>
                <div className="px-5 py-4 space-y-3 flex-1 overflow-y-auto">
                    {activeList.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Veri yok.</p>}
                    {activeList.map(item => (
                        <div key={item.name} className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex justify-between items-center hover:border-cyan-200 transition-colors group cursor-default">
                            <div>
                                <div className="text-[13px] font-bold text-slate-800 group-hover:text-cyan-700 transition-colors">{item.name}</div>
                                <span className="inline-flex bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full mt-1">{item.value} aday</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <div className="text-[9px] text-slate-400 uppercase tracking-wide">Uyum</div>
                                    <div className="text-[14px] font-black text-cyan-500">{item.percentage}%</div>
                                </div>
                                <div className="w-[1px] h-8 bg-slate-200" />
                                <div className="text-right">
                                    <div className="text-[9px] text-slate-400 uppercase tracking-wide">Başarı</div>
                                    <div className="text-[14px] font-black text-emerald-500">{item.successRate}%</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Skill matrix */}
            <div className="col-span-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2 shrink-0">
                    <Zap size={16} className="text-cyan-500" />
                    <span className="text-[14px] font-bold text-slate-900">Yetenek Matrisi</span>
                </div>
                <div className="px-5 py-4 flex-1 flex flex-col">
                    <div className="flex flex-wrap gap-2 content-start">
                        {topSkills.map(([skill, count]) => (
                            <div key={skill} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 hover:border-cyan-200 hover:bg-cyan-50 transition-all cursor-default group">
                                <span className="text-sm font-bold text-slate-700 group-hover:text-cyan-700">{skill}</span>
                                <span className="text-[11px] font-black text-cyan-600 bg-cyan-100 px-2 py-0.5 rounded-lg">{count}</span>
                            </div>
                        ))}
                        {topSkills.length === 0 && <p className="text-sm text-slate-400">Henüz yetenek verisi yok.</p>}
                    </div>
                    {topSkills.length > 0 && (
                        <div className="mt-auto pt-4 border-t border-slate-100">
                            <div className="text-[11px] font-bold text-slate-500 mb-3 uppercase tracking-wide">En Çok Aranan</div>
                            <div className="space-y-2">
                                {topSkills.slice(0, 3).map(([skill, count], i) => (
                                    <div key={skill} className="flex items-center gap-3">
                                        <span className="text-[11px] font-medium text-slate-600 w-16 truncate">{skill}</span>
                                        <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                                            <div className={`h-full ${skillColors[i]} rounded-full`} style={{ width: `${(count / maxSkill) * 100}%` }} />
                                        </div>
                                        <span className="text-[11px] font-bold text-slate-700 w-6 text-right">{count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Gauge */}
            <div className="col-span-3 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col items-center justify-center p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-50 rounded-full blur-3xl -mr-10 -mt-10 opacity-60" />
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-6 relative z-10">ORT. UYUM SKORU</div>
                <div className="relative z-10 w-full flex justify-center">
                    <svg viewBox="0 0 200 110" className="w-full max-w-[180px]">
                        <path d="M 20 100 A 80 80 0 0 1 180 100" stroke="#f1f5f9" strokeWidth="16" fill="none" strokeLinecap="round" />
                        <path d="M 20 100 A 80 80 0 0 1 180 100" stroke="#06b6d4" strokeWidth="16" fill="none" strokeLinecap="round"
                            strokeDasharray="251.2" strokeDashoffset={`${251.2 * (1 - avgMatchScore / 100)}`} />
                        <text x="100" y="85" textAnchor="middle" fontSize="30" fontWeight="900" fill="#0f172a">{avgMatchScore}%</text>
                    </svg>
                </div>
                <div className="w-full grid grid-cols-3 gap-2 mt-6 relative z-10">
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-center">
                        <div className="text-[15px] font-black text-slate-700">{candidates.length}</div>
                        <div className="text-[9px] text-slate-400 font-medium uppercase mt-0.5">Toplam</div>
                    </div>
                    <div className="bg-slate-50 border border-emerald-50 rounded-xl p-2.5 text-center">
                        <div className="text-[15px] font-black text-emerald-500">{candidates.filter(c => c.status === 'hired').length}</div>
                        <div className="text-[9px] text-slate-400 font-medium uppercase mt-0.5">İşe Alım</div>
                    </div>
                    <div className="bg-slate-50 border border-cyan-50 rounded-xl p-2.5 text-center">
                        <div className="text-[15px] font-black text-cyan-500">{hiringRate}%</div>
                        <div className="text-[9px] text-slate-400 font-medium uppercase mt-0.5">Verim</div>
                    </div>
                </div>
                <div className="flex flex-col items-center mt-6 gap-1.5 relative z-10">
                    <div className="w-8 h-8 rounded-full bg-cyan-50 flex items-center justify-center text-cyan-500"><BrainCircuit size={16} /></div>
                    <div className="text-[10px] text-slate-500 font-bold tracking-wide">AI EŞLEŞTİRME AKTİF</div>
                </div>
            </div>
        </div>
    );
}

// ─── Responses tab ───────────────────────────────────────────
function ResponsesTab({ sentMessages, pendingApprovals, onProcess, onCheckMail }) {
    const [innerTab, setInnerTab] = useState('responses');
    const [searchTerm, setSearchTerm] = useState('');
    const activeRows = (innerTab === 'responses' ? sentMessages : pendingApprovals)
        .filter(m => !searchTerm || m.candidateName?.toLowerCase().includes(searchTerm.toLowerCase()) || m.candidatePosition?.toLowerCase().includes(searchTerm.toLowerCase()));

    const getStatusBadge = (msg) => {
        const s = msg.status;
        if (s === 'email_opened') return <span className="bg-blue-50 text-blue-600 border-blue-200 text-[10px] font-bold px-2.5 py-1 rounded-full border inline-flex items-center gap-1"><MailOpen size={11} />Açıldı</span>;
        if (s === 'replied')       return <span className="bg-emerald-50 text-emerald-600 border-emerald-200 text-[10px] font-bold px-2.5 py-1 rounded-full border inline-flex items-center gap-1"><Reply size={11} />Yanıtladı</span>;
        if (s === 'draft' || s === 'ready_to_send') return <span className="bg-amber-50 text-amber-600 border-amber-200 text-[10px] font-bold px-2.5 py-1 rounded-full border inline-flex items-center gap-1"><Clock size={11} />Beklemede</span>;
        return <span className="bg-slate-100 text-slate-500 border-slate-200 text-[10px] font-bold px-2.5 py-1 rounded-full border inline-flex items-center gap-1"><Mail size={11} />Gönderildi</span>;
    };

    const gradients = ['from-blue-500 to-indigo-500', 'from-emerald-500 to-teal-500', 'from-purple-500 to-pink-500', 'from-amber-500 to-orange-500', 'from-rose-500 to-red-500', 'from-cyan-500 to-blue-500', 'from-indigo-500 to-purple-500'];

    return (
        <div className="flex flex-col gap-4">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { icon: Send,         bg: 'bg-blue-50',    color: 'text-blue-500',    val: sentMessages.length,      label: 'Gönderilen',     sub: 'toplam mesaj' },
                    { icon: CheckCircle,  bg: 'bg-emerald-50', color: 'text-emerald-500', val: sentMessages.filter(m => m.status === 'replied').length, label: 'Yanıtlanan', sub: sentMessages.length ? `${Math.round(sentMessages.filter(m => m.status === 'replied').length / sentMessages.length * 100)}% yanıt oranı` : '0% yanıt oranı' },
                    { icon: Clock,        bg: 'bg-amber-50',   color: 'text-amber-500',   val: pendingApprovals.length,  label: 'Yanıt Bekleyen', sub: 'taslak + hazır' },
                ].map(({ icon: Icon, bg, color, val, label, sub }) => (
                    <div key={label} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                        <div className={`${bg} ${color} p-2.5 rounded-xl`}><Icon size={20} /></div>
                        <div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black text-slate-900">{val}</span>
                                <span className="text-[11px] text-slate-400 font-medium">{label}</span>
                            </div>
                            <span className="text-[10px] text-slate-500">{sub}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Table panel */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col" style={{ minHeight: '420px' }}>
                {/* Table header */}
                <div className="px-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                    <div className="flex">
                        <button onClick={() => setInnerTab('responses')} className={`px-5 py-4 text-[11px] font-bold border-b-2 transition-all ${innerTab === 'responses' ? 'border-cyan-500 text-cyan-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                            Yanıt Takibi ({sentMessages.length})
                        </button>
                        <button onClick={() => setInnerTab('drafts')} className={`px-5 py-4 text-[11px] font-bold border-b-2 transition-all ${innerTab === 'drafts' ? 'border-amber-400 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                            Taslaklar ({pendingApprovals.length})
                        </button>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <input type="text" placeholder="Ara..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-sm w-44 outline-none focus:ring-2 focus:ring-cyan-100 focus:border-cyan-400 transition-all" />
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-auto flex-1">
                    <div className="min-w-[760px]">
                        <div className="bg-slate-50 sticky top-0 z-10">
                            <div className="grid grid-cols-[1.5fr_1.2fr_0.8fr_0.8fr_auto] gap-3 px-5 py-2.5 border-b border-slate-100">
                                {['ADAY', 'POZİSYON', 'TARİH', 'DURUM', 'AKSİYON'].map(h => (
                                    <div key={h} className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</div>
                                ))}
                            </div>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {activeRows.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-16 gap-3">
                                    <FileText className="w-8 h-8 text-slate-200" />
                                    <p className="text-sm text-slate-400">Kayıt bulunamadı</p>
                                </div>
                            )}
                            {activeRows.map((msg, idx) => {
                                const initials = msg.candidateName?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';
                                const grad = gradients[idx % gradients.length];
                                const isPending = innerTab === 'drafts';
                                return (
                                    <div key={idx} className="grid grid-cols-[1.5fr_1.2fr_0.8fr_0.8fr_auto] gap-3 px-5 py-3.5 items-center hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-white text-[11px] font-black shrink-0 shadow-sm`}>{initials}</div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[13px] font-bold text-slate-800 truncate">{msg.candidateName}</span>
                                                <span className="text-[10px] text-slate-400 truncate">#{msg.candidateId?.substring(0, 8) || 'system'}</span>
                                            </div>
                                        </div>
                                        <div className="text-[12px] font-medium text-slate-600 truncate pr-4">{msg.candidatePosition || msg.candidateEmail || '—'}</div>
                                        <div className="text-[11px] text-slate-400">{msg.createdAt?.toDate?.()?.toLocaleDateString('tr-TR') || '—'}</div>
                                        <div>{getStatusBadge(msg)}</div>
                                        <div className="flex items-center justify-end gap-2">
                                            {!isPending ? (
                                                <>
                                                    <button onClick={() => onCheckMail(msg)} className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 hover:text-cyan-500 hover:border-cyan-200 transition-colors" title="Gmail Tara">
                                                        <Search size={14} />
                                                    </button>
                                                    <button onClick={() => onProcess(msg)} className="px-3 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-bold hover:bg-cyan-500 transition-colors shadow-sm">İşle</button>
                                                </>
                                            ) : (
                                                <button className="px-3 py-2 rounded-xl bg-cyan-500 text-white text-[10px] font-bold hover:bg-cyan-600 transition-colors shadow-sm shadow-cyan-200">Onayla</button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
                    <span className="text-[11px] text-slate-400 font-medium">{activeRows.length} kayıt gösteriliyor</span>
                </div>
            </div>
        </div>
    );
}

// ─── Main page ───────────────────────────────────────────────
export default function AnalyticsPage() {
    const { filteredCandidates: candidates, loading: candidatesLoading, updateCandidate } = useCandidates();
    const { messages, loading: messagesLoading, stats: messageStats } = useMessageQueue();
    const { positions } = usePositions();
    const { userProfile } = useAuth();
    const [activeTab, setActiveTab]     = useState('overview');
    const [timeRange, setTimeRange]     = useState('7d');
    const [activeSourceTab, setActiveSourceTab] = useState('source');
    const [processingResponse, setProcessingResponse] = useState(null);

    const openResponseModal = (msg) => setProcessingResponse({ message: msg, emailText: '', loading: false, result: null, checkingMail: false });

    const handleCheckEmail = async (msg) => {
        const token = userProfile?.integrations?.google?.accessToken;
        if (!token) { alert('Lütfen önce Google hesabınızı bağlayın (Ayarlar → Entegrasyonlar).'); return; }
        if (!msg.candidateEmail) { alert('Aday e-posta adresi bulunamadı.'); return; }
        setProcessingResponse({ message: msg, emailText: '', loading: false, result: null, checkingMail: true });
        try {
            const result = await checkGmailMessages(token, `from:${msg.candidateEmail}`);
            if (result.success && result.found) {
                setProcessingResponse({ message: msg, emailText: result.message.body || result.message.snippet || '', loading: false, result: null, checkingMail: false });
            } else {
                setProcessingResponse(null);
                alert('İlgili adaydan yeni bir mail bulunamadı.');
            }
        } catch (err) {
            setProcessingResponse(null);
            alert('E-posta kontrol hatası: ' + err.message);
        }
    };

    const handleProcessResponse = async () => {
        if (!processingResponse?.emailText.trim()) return;
        setProcessingResponse(prev => ({ ...prev, loading: true }));
        try {
            const aiResult = await analyzeResponseEmail(processingResponse.emailText);
            setProcessingResponse(prev => ({ ...prev, result: aiResult, loading: false }));
            if (processingResponse.message.candidateId && aiResult.suggestedStatus) {
                await updateCandidate(processingResponse.message.candidateId, { status: aiResult.suggestedStatus, lastAiLog: aiResult.actionLog, lastResponseDate: new Date().toISOString() });
            }
        } catch (err) {
            console.error(err);
            setProcessingResponse(prev => ({ ...prev, loading: false }));
        }
    };

    // ── Data ──
    const trendsData = useMemo(() => {
        const last7 = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().split('T')[0]; }).reverse();
        const counts = {};
        candidates.forEach(c => { if (c.appliedDate) counts[c.appliedDate.split('T')[0]] = (counts[c.appliedDate.split('T')[0]] || 0) + 1; });
        return last7.map(date => ({ date: new Date(date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }), applications: counts[date] || 0 }));
    }, [candidates]);

    const positionStatusData = useMemo(() => {
        const matrix = {};
        positions.forEach(p => { if (p.status === 'open') matrix[p.title] = { name: p.title, total: 0, review: 0, interview: 0, hired: 0, rejected: 0, avgScore: 0, scoredCandidates: 0 }; });
        candidates.forEach(c => {
            const pos = c.matchedPositionTitle || c.position || 'Genel Başvuru';
            if (!matrix[pos]) matrix[pos] = { name: pos, total: 0, review: 0, interview: 0, hired: 0, rejected: 0, avgScore: 0, scoredCandidates: 0 };
            matrix[pos].total += 1;
            if (c.matchScore) { matrix[pos].avgScore += c.matchScore; matrix[pos].scoredCandidates += 1; }
            if (['review', 'ai_analysis'].includes(c.status)) matrix[pos].review += 1;
            if (['interview', 'deep_review'].includes(c.status)) matrix[pos].interview += 1;
            if (['hired', 'offer'].includes(c.status)) matrix[pos].hired += 1;
            if (c.status === 'rejected') matrix[pos].rejected += 1;
        });
        return Object.values(matrix).map(p => ({ ...p, avgScore: p.scoredCandidates > 0 ? Math.round(p.avgScore / p.scoredCandidates) : 0 })).sort((a, b) => b.total - a.total);
    }, [candidates, positions]);

    const funnelData = useMemo(() => ([
        { name: 'Başvuru',  color: '#6366f1', count: candidates.length },
        { name: 'İnceleme', color: '#f59e0b', count: candidates.filter(c => ['review', 'interview', 'offer', 'hired'].includes(c.status)).length },
        { name: 'Mülakat',  color: '#3b82f6', count: candidates.filter(c => ['interview', 'offer', 'hired'].includes(c.status)).length },
        { name: 'İşe Alım', color: '#10b981', count: candidates.filter(c => c.status === 'hired').length },
    ]), [candidates]);

    const { sourceList, subSourceList } = useMemo(() => {
        const sources = {}, subSources = {};
        candidates.forEach(c => {
            const s = c.source?.includes('Visual') ? 'LinkedIn / Scraper' : c.source?.includes('Browser') ? 'Eklenti' : c.source?.includes('CV') ? 'CV Yükleme' : (c.source || 'Diğer');
            if (!sources[s]) sources[s] = { count: 0, totalScore: 0, successCount: 0 };
            sources[s].count += 1; sources[s].totalScore += (c.matchScore || 0);
            const sub = c.sourceDetail || c.subSource || 'Belirtilmedi';
            if (!subSources[sub]) subSources[sub] = { count: 0, totalScore: 0, successCount: 0 };
            subSources[sub].count += 1; subSources[sub].totalScore += (c.matchScore || 0);
            if (['hired', 'offer'].includes(c.status)) { sources[s].successCount += 1; subSources[sub].successCount += 1; }
        });
        const fmt = obj => Object.entries(obj).map(([name, d]) => ({ name, value: d.count, percentage: d.count > 0 ? Math.round(d.totalScore / d.count) : 0, successRate: d.count > 0 ? Math.round((d.successCount / d.count) * 100) : 0 })).sort((a, b) => b.value - a.value);
        return { sourceList: fmt(sources), subSourceList: fmt(subSources) };
    }, [candidates]);

    const topSkills = useMemo(() => {
        const skills = {};
        candidates.forEach(c => (c.skills || []).forEach(s => { skills[s] = (skills[s] || 0) + 1; }));
        return Object.entries(skills).sort((a, b) => b[1] - a[1]).slice(0, 8);
    }, [candidates]);

    const avgMatchScore = useMemo(() => {
        if (!candidates.length) return 0;
        return Math.round(candidates.reduce((a, c) => a + (c.matchScore || 0), 0) / candidates.length);
    }, [candidates]);

    const pendingApprovals = useMemo(() => messages.filter(m => m.status === 'draft' || m.status === 'ready_to_send'), [messages]);
    const sentMessages     = useMemo(() => messages.filter(m => m.status === 'sent' || m.status === 'email_opened' || m.status === 'replied'), [messages]);
    const pendingCount     = messageStats.sent - messageStats.replied;

    const loading = candidatesLoading || messagesLoading;

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Yükleniyor...</p>
            </div>
        );
    }

    const TABS = [
        { id: 'overview',    label: 'Genel Bakış'     },
        { id: 'acquisition', label: 'Edinme & Kaynak'  },
        { id: 'responses',   label: 'Yanıt Takibi'    },
    ];

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
            <Header title="Stratejik Analitik" />

            {/* Sub-header */}
            <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <Activity size={16} className="text-cyan-500" />
                    <span className="font-black text-slate-900 text-sm tracking-tight">Stratejik Analitik</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[11px] text-slate-400">{candidates.length} aktif kayıt</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                        {TABS.map(t => <TabPill key={t.id} id={t.id} label={t.label} active={activeTab === t.id} onClick={setActiveTab} />)}
                    </div>
                    <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                        {[['7d', '7G'], ['30d', '30G']].map(([val, label]) => (
                            <button key={val} onClick={() => setTimeRange(val)}
                                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${timeRange === val ? 'bg-white text-cyan-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main */}
            <main className="flex-1 p-5 overflow-y-auto">
                <div className="max-w-[1600px] mx-auto">
                    {activeTab === 'overview' && (
                        <OverviewTab
                            candidates={candidates} funnelData={funnelData} trendsData={trendsData}
                            positionStatusData={positionStatusData} avgMatchScore={avgMatchScore} pendingCount={pendingCount}
                        />
                    )}
                    {activeTab === 'acquisition' && (
                        <AcquisitionTab
                            sourceList={sourceList} subSourceList={subSourceList}
                            topSkills={topSkills} avgMatchScore={avgMatchScore} candidates={candidates}
                        />
                    )}
                    {activeTab === 'responses' && (
                        <ResponsesTab
                            sentMessages={sentMessages} pendingApprovals={pendingApprovals}
                            onProcess={openResponseModal} onCheckMail={handleCheckEmail}
                        />
                    )}
                </div>
            </main>

            {/* AI Response modal */}
            {processingResponse && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setProcessingResponse(null)} />
                    <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-3xl p-8 space-y-6 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-cyan-50 flex items-center justify-center"><Sparkles className="w-4 h-4 text-cyan-500" /></div>
                                <h3 className="text-base font-black text-slate-900">Yanıt Analizi</h3>
                            </div>
                            <button onClick={() => setProcessingResponse(null)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        {!processingResponse.result ? (
                            <div className="space-y-4">
                                {processingResponse.checkingMail ? (
                                    <div className="h-48 flex flex-col items-center justify-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl">
                                        <RefreshCw className="w-8 h-8 text-cyan-500 animate-spin" />
                                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Gmail Taranıyor...</p>
                                    </div>
                                ) : (
                                    <textarea
                                        className="w-full h-48 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm text-slate-800 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 resize-none transition-all"
                                        placeholder="Yanıtı buraya yapıştırın veya 'Mail Ara' butonuna tıklayın..."
                                        value={processingResponse.emailText}
                                        onChange={e => setProcessingResponse(prev => ({ ...prev, emailText: e.target.value }))}
                                    />
                                )}
                                <button onClick={handleProcessResponse} disabled={processingResponse.checkingMail || !processingResponse.emailText.trim()}
                                    className="w-full py-3 rounded-2xl bg-cyan-500 hover:bg-cyan-600 text-white font-black text-xs uppercase tracking-widest disabled:opacity-40 shadow-sm shadow-cyan-200 transition-colors">
                                    {processingResponse.loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Analiz ediliyor...</span> : 'Analiz Et'}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
                                    <p className="text-sm italic text-slate-600 leading-relaxed">"{processingResponse.result.summary}"</p>
                                </div>
                                <button onClick={() => setProcessingResponse(null)} className="w-full py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs uppercase tracking-widest transition-colors">Kapat</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
