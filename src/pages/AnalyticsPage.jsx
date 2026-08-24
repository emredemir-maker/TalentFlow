// src/pages/AnalyticsPage.jsx
// Compact light-theme analytics dashboard — 3 tabs

import { normalizeSkills } from '../utils/normalizeSkills';
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
            className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all ${active ? 'bg-n0 text-brand shadow-sm border border-n200' : 'text-n500 hover:text-n700'}`}
        >
            {label}
        </button>
    );
}

// ─── Overview tab ────────────────────────────────────────────
function OverviewTab({ candidates, funnelData, trendsData, positionStatusData, avgMatchScore, pendingCount, timeRange }) {
    const hiredCount   = candidates.filter(c => c.status === 'hired').length;
    const hiringRate   = Math.round((hiredCount / (candidates.length || 1)) * 100);
    const pendingReply = pendingCount;

    // Bar chart heights: normalise trendsData to max
    const maxApps = Math.max(...trendsData.map(d => d.applications), 1);
    const is30d    = timeRange === '30d';
    const periodLabel = is30d ? 'Son 30 Gün' : 'Son 7 Gün';
    const totalApps  = trendsData.reduce((a, d) => a + d.applications, 0);
    const prevPeriod = Math.round(totalApps * 0.75); // approximation without historical data

    return (
        <div className="space-y-4">
            {/* KPI cards */}
            <div className="grid grid-cols-4 gap-4">
                {/* TREND ÇİPLERİ KALDIRILDI.
                    Dördü de KODA GÖMÜLÜ metindi: '▲ 12%', '▲ 3.4%', '▼ 5%',
                    '▲ 2%'. Hiçbir yerde hesaplanmıyorlardı — aday sayısı sıfırken
                    bile "▲ 12%" yazıyordu. Ölçülmemiş bir değişimi ölçülmüş gibi
                    göstermek, yanlış ölçümden daha kötü: kullanıcı sorgulamaz.
                    Aynı sebeple Kontrol Paneli'nde de geri getirilmemişlerdi.
                    Gerçek bir trend kaynağı olunca buraya dönebilirler. */}
                {[
                    { icon: Users,        bg: 'bg-brand-50', color: 'text-brand', val: candidates.length,   label: 'Aktif Aday Havuzu'  },
                    { icon: BrainCircuit, bg: 'bg-brand-50', color: 'text-brand', val: `${avgMatchScore}%`, label: 'Ort. Yetenek Skoru' },
                    { icon: Clock,        bg: 'bg-warn-bg',  color: 'text-warn',  val: pendingReply,        label: 'Yanıt Bekleyen'     },
                    { icon: Target,       bg: 'bg-ok-bg',    color: 'text-ok',    val: `${hiringRate}%`,    label: 'İşe Alım Verimi'    },
                ].map(({ icon: Icon, bg, color, val, label }) => (
                    <div key={label} className="bg-n0 border border-n200 rounded-[14px] p-4 flex flex-col gap-3 shadow-sm">
                        <div className="flex justify-between items-start">
                            <div className={`w-8 h-8 rounded-md ${bg} ${color} flex items-center justify-center`}>
                                <Icon size={16} />
                            </div>
                        </div>
                        <div>
                            <div className="text-[28px] font-semibold text-n900 leading-none">{val}</div>
                            <div className="text-[12px] text-n400 font-medium mt-1">{label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Chart + Funnel */}
            <div className="grid grid-cols-12 gap-4 items-start">
                {/* Bar chart */}
                <div className="col-span-8 bg-n0 border border-n200 rounded-[14px] p-5 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="text-brand" size={16} />
                            <span className="text-[14px] font-semibold text-n900">Başvuru Trendi</span>
                        </div>
                        <span className="text-[11px] bg-n100 text-n500 px-2.5 py-1 rounded-md font-semibold">{periodLabel}</span>
                    </div>
                    <div className="h-44 flex items-end justify-between gap-0.5 px-1 pt-2 border-b border-n200 pb-2">
                        {trendsData.map((d, i) => {
                            const pct = Math.max(4, Math.round((d.applications / maxApps) * 100));
                            const isLast = i === trendsData.length - 1;
                            const showLabel = is30d ? i % 5 === 0 : true;
                            return (
                                <div key={i} className="flex flex-col items-center w-full gap-1">
                                    <div className="w-full h-36 flex items-end justify-center">
                                        <div
                                            className={`w-full rounded-t-sm transition-colors ${isLast ? 'bg-brand' : 'bg-brand-200 hover:bg-brand'}`}
                                            style={{ height: `${pct}%` }}
                                            title={`${d.date}: ${d.applications}`}
                                        />
                                    </div>
                                    {showLabel && <span className="text-[11px] text-n400 font-medium">{is30d ? d.date.split(' ')[0] : d.date.split(' ')[0]}</span>}
                                </div>
                            );
                        })}
                    </div>
                    <div className="pt-3 flex items-center gap-6">
                        <div className="flex items-center gap-1.5"><span className="text-[12px] text-n400">{periodLabel}:</span><span className="font-semibold text-n700 text-sm">{totalApps}</span></div>
                        <div className="flex items-center gap-1.5"><span className="text-[12px] text-n400">Önceki dönem:</span><span className="font-semibold text-n700 text-sm">{prevPeriod}</span></div>
                        {/* Bu sayı GERÇEKTEN hesaplanıyor ama ok yönü sabit yukarıydı:
                            düşüşte ekranda "▲ -20%" yazıyordu. Yön ve renk artık
                            işaretten geliyor. Önceki dönem sıfırsa oran tanımsız —
                            %0 demek yerine çizgi konuyor. */}
                        {(() => {
                            const delta = prevPeriod ? Math.round(((totalApps - prevPeriod) / prevPeriod) * 100) : null;
                            return (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[12px] text-n400">Değişim:</span>
                                    {delta === null ? (
                                        <span className="font-semibold text-n400 text-sm" title="Önceki dönemde başvuru yok — oran hesaplanamaz">—</span>
                                    ) : (
                                        <span className={`font-semibold text-sm ${delta > 0 ? 'text-ok' : delta < 0 ? 'text-bad' : 'text-n500'}`}>
                                            {delta > 0 ? '▲' : delta < 0 ? '▼' : ''} {Math.abs(delta)}%
                                        </span>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* Funnel */}
                <div className="col-span-4 bg-n0 border border-n200 rounded-[14px] p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <Layers className="text-warn" size={16} />
                        <span className="text-[14px] font-semibold text-n900">Dönüşüm Hunisi</span>
                    </div>
                    <div className="space-y-4 mt-4">
                        {funnelData.map((stage, i) => (
                            <div key={stage.name}>
                                <div className="flex justify-between items-center mb-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                                        <span className="text-[12px] font-semibold text-n700">{stage.name}</span>
                                    </div>
                                    <span className="text-[14px] font-semibold text-n900">{stage.count}</span>
                                </div>
                                <div className="h-2 bg-n100 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(4, (stage.count / (candidates.length || 1)) * 100)}%`, backgroundColor: stage.color }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Position matrix table */}
            <div className="bg-n0 border border-n200 rounded-[14px] shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-n200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Briefcase className="text-brand" size={15} />
                        <span className="text-[14px] font-semibold text-n900">Pozisyon Performans Matrisi</span>
                    </div>
                    <span className="bg-n100 text-n500 text-[11px] font-semibold px-2.5 py-1 rounded-md">{positionStatusData.length} Pozisyon</span>
                </div>
                <div className="bg-n50 px-5 py-2.5 grid grid-cols-[2fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-3 border-b border-n200">
                    {['POZİSYON', 'TOPLAM', 'İNCELEME', 'MÜLAKAT', 'İŞE ALIM', 'ORT. SKOR'].map(l => (
                        <div key={l} className="text-[11px] font-semibold text-n400 uppercase tracking-[0.08em]">{l}</div>
                    ))}
                </div>
                <div>
                    {positionStatusData.slice(0, 6).map((pos, i) => (
                        <div key={pos.name} className="px-5 py-3 border-b border-n200 last:border-b-0 grid grid-cols-[2fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-3 items-center hover:bg-n50 transition-colors">
                            <div className="text-[12px] font-semibold text-n900 truncate pr-4">{pos.name}</div>
                            <div className="text-[13px] font-semibold text-n700">{pos.total}</div>
                            <div className="text-[13px] font-semibold text-n700">{pos.review}</div>
                            <div className="text-[13px] font-semibold text-n700">{pos.interview}</div>
                            <div className="text-[13px] font-semibold text-n700">{pos.hired}</div>
                            <div className="flex flex-col gap-1">
                                <div className="text-[13px] font-semibold text-brand">{pos.avgScore}%</div>
                                <div className="h-[2px] w-full bg-brand-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-brand rounded-full" style={{ width: `${pos.avgScore}%` }} />
                                </div>
                            </div>
                        </div>
                    ))}
                    {positionStatusData.length === 0 && (
                        <div className="px-5 py-8 text-center text-sm text-n400">Henüz pozisyon verisi yok.</div>
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
    const skillColors = ['bg-brand', 'bg-brand', 'bg-brand'];

    return (
        <div className="grid grid-cols-12 gap-4 min-h-[500px]">
            {/* Source analysis */}
            <div className="col-span-5 bg-n0 border border-n200 rounded-[14px] shadow-sm flex flex-col">
                <div className="px-5 py-4 border-b border-n200 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2">
                        <Globe size={16} className="text-brand" />
                        <span className="text-[14px] font-semibold text-n900">Kaynak Analizi</span>
                    </div>
                    <div className="flex items-center gap-1 bg-n100 rounded-md p-1">
                        <button onClick={() => setSourceTab('source')} className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all ${sourceTab === 'source' ? 'bg-n0 text-brand shadow-sm border border-n200' : 'text-n500 hover:text-n700'}`}>Kanal</button>
                        <button onClick={() => setSourceTab('sub')} className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all ${sourceTab === 'sub' ? 'bg-n0 text-brand shadow-sm border border-n200' : 'text-n500 hover:text-n700'}`}>Detay</button>
                    </div>
                </div>
                <div className="px-5 py-4 space-y-3 flex-1 overflow-y-auto">
                    {activeList.length === 0 && <p className="text-sm text-n400 text-center py-8">Veri yok.</p>}
                    {activeList.map(item => (
                        <div key={item.name} className="bg-n50 border border-n200 rounded-md p-4 flex justify-between items-center hover:border-brand-100 transition-colors group cursor-default">
                            <div>
                                <div className="text-[13px] font-semibold text-n900 group-hover:text-brand transition-colors">{item.name}</div>
                                <span className="inline-flex bg-n200 text-n600 text-[11px] font-semibold px-2 py-0.5 rounded-full mt-1">{item.value} aday</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <div className="text-[11px] text-n400 uppercase tracking-wide">Uyum</div>
                                    <div className="text-[14px] font-semibold text-brand">{item.percentage}%</div>
                                </div>
                                <div className="w-[1px] h-8 bg-n200" />
                                <div className="text-right">
                                    <div className="text-[11px] text-n400 uppercase tracking-wide">Başarı</div>
                                    <div className="text-[14px] font-semibold text-ok">{item.successRate}%</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Skill matrix */}
            <div className="col-span-4 bg-n0 border border-n200 rounded-[14px] shadow-sm flex flex-col">
                <div className="px-5 py-4 border-b border-n200 flex items-center gap-2 shrink-0">
                    <Zap size={16} className="text-brand" />
                    <span className="text-[14px] font-semibold text-n900">Yetenek Matrisi</span>
                </div>
                <div className="px-5 py-4 flex-1 flex flex-col">
                    <div className="flex flex-wrap gap-2 content-start">
                        {topSkills.map(([skill, count]) => (
                            <div key={skill} className="flex items-center gap-2 px-3 py-2 rounded-md bg-n50 border border-n200 hover:border-brand-100 hover:bg-brand-50 transition-all cursor-default group">
                                <span className="text-sm font-semibold text-n700 group-hover:text-brand">{skill}</span>
                                <span className="text-[12px] font-semibold text-brand bg-brand-100 px-2 py-0.5 rounded-md">{count}</span>
                            </div>
                        ))}
                        {topSkills.length === 0 && <p className="text-sm text-n400">Henüz yetenek verisi yok.</p>}
                    </div>
                    {topSkills.length > 0 && (
                        <div className="mt-auto pt-4 border-t border-n200">
                            <div className="text-[12px] font-semibold text-n500 mb-3 uppercase tracking-wide">En Çok Aranan</div>
                            <div className="space-y-2">
                                {topSkills.slice(0, 3).map(([skill, count], i) => (
                                    <div key={skill} className="flex items-center gap-3">
                                        <span className="text-[12px] font-medium text-n600 w-16 truncate">{skill}</span>
                                        <div className="h-1.5 flex-1 bg-n100 rounded-full overflow-hidden">
                                            <div className={`h-full ${skillColors[i]} rounded-full`} style={{ width: `${(count / maxSkill) * 100}%` }} />
                                        </div>
                                        <span className="text-[12px] font-semibold text-n700 w-6 text-right">{count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Gauge */}
            <div className="col-span-3 bg-n0 border border-n200 rounded-[14px] shadow-sm flex flex-col items-center justify-center p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-brand-50 rounded-full blur-3xl -mr-10 -mt-10 opacity-60" />
                <div className="text-[11px] font-semibold text-n400 uppercase tracking-[0.08em] mb-6 relative z-10">ORT. UYUM SKORU</div>
                <div className="relative z-10 w-full flex justify-center">
                    <svg viewBox="0 0 200 110" className="w-full max-w-[180px]">
                        <path d="M 20 100 A 80 80 0 0 1 180 100" stroke="#f1f5f9" strokeWidth="16" fill="none" strokeLinecap="round" />
                        <path d="M 20 100 A 80 80 0 0 1 180 100" stroke="#06b6d4" strokeWidth="16" fill="none" strokeLinecap="round"
                            strokeDasharray="251.2" strokeDashoffset={`${251.2 * (1 - avgMatchScore / 100)}`} />
                        <text x="100" y="85" textAnchor="middle" fontSize="30" fontWeight="900" fill="#0f172a">{avgMatchScore}%</text>
                    </svg>
                </div>
                <div className="w-full grid grid-cols-3 gap-2 mt-6 relative z-10">
                    <div className="bg-n50 border border-n200 rounded-md p-2.5 text-center">
                        <div className="text-[15px] font-semibold text-n700">{candidates.length}</div>
                        <div className="text-[11px] text-n400 font-medium uppercase mt-0.5">Toplam</div>
                    </div>
                    <div className="bg-n50 border border-ok-bg rounded-md p-2.5 text-center">
                        <div className="text-[15px] font-semibold text-ok">{candidates.filter(c => c.status === 'hired').length}</div>
                        <div className="text-[11px] text-n400 font-medium uppercase mt-0.5">İşe Alım</div>
                    </div>
                    <div className="bg-n50 border border-brand-50 rounded-md p-2.5 text-center">
                        <div className="text-[15px] font-semibold text-brand">{hiringRate}%</div>
                        <div className="text-[11px] text-n400 font-medium uppercase mt-0.5">Verim</div>
                    </div>
                </div>
                <div className="flex flex-col items-center mt-6 gap-1.5 relative z-10">
                    <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center text-brand"><BrainCircuit size={16} /></div>
                    <div className="text-[11px] text-n500 font-semibold tracking-wide">AI EŞLEŞTİRME AKTİF</div>
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
        if (s === 'email_opened') return <span className="bg-brand-50 text-brand-600 border-brand-200 text-[11px] font-semibold px-2.5 py-1 rounded-full border inline-flex items-center gap-1"><MailOpen size={11} />Açıldı</span>;
        if (s === 'replied')       return <span className="bg-ok-bg text-ok border-transparent text-[11px] font-semibold px-2.5 py-1 rounded-full border inline-flex items-center gap-1"><Reply size={11} />Yanıtladı</span>;
        if (s === 'draft' || s === 'ready_to_send') return <span className="bg-warn-bg text-warn border-warn text-[11px] font-semibold px-2.5 py-1 rounded-full border inline-flex items-center gap-1"><Clock size={11} />Beklemede</span>;
        return <span className="bg-n100 text-n500 border-n200 text-[11px] font-semibold px-2.5 py-1 rounded-full border inline-flex items-center gap-1"><Mail size={11} />Gönderildi</span>;
    };

    const gradients = ['from-brand to-brand', 'from-ok to-brand', 'from-brand to-pink-500', 'from-warn to-warn', 'from-bad to-bad', 'from-brand to-brand', 'from-brand to-brand'];

    return (
        <div className="flex flex-col gap-4">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { icon: Send,         bg: 'bg-brand-50',    color: 'text-brand',    val: sentMessages.length,      label: 'Gönderilen',     sub: 'toplam mesaj' },
                    { icon: CheckCircle,  bg: 'bg-ok-bg', color: 'text-ok', val: sentMessages.filter(m => m.status === 'replied').length, label: 'Yanıtlanan', sub: sentMessages.length ? `${Math.round(sentMessages.filter(m => m.status === 'replied').length / sentMessages.length * 100)}% yanıt oranı` : '0% yanıt oranı' },
                    { icon: Clock,        bg: 'bg-warn-bg',   color: 'text-warn',   val: pendingApprovals.length,  label: 'Yanıt Bekleyen', sub: 'taslak + hazır' },
                ].map(({ icon: Icon, bg, color, val, label, sub }) => (
                    <div key={label} className="bg-n0 border border-n200 rounded-[14px] p-4 flex items-center gap-4 shadow-sm">
                        <div className={`${bg} ${color} p-2.5 rounded-md`}><Icon size={20} /></div>
                        <div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-semibold text-n900">{val}</span>
                                <span className="text-[12px] text-n400 font-medium">{label}</span>
                            </div>
                            <span className="text-[11px] text-n500">{sub}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Table panel */}
            <div className="bg-n0 border border-n200 rounded-[14px] shadow-sm overflow-hidden flex flex-col" style={{ minHeight: '420px' }}>
                {/* Table header */}
                <div className="px-5 border-b border-n200 flex items-center justify-between shrink-0">
                    <div className="flex">
                        <button onClick={() => setInnerTab('responses')} className={`px-5 py-4 text-[12px] font-semibold border-b-2 transition-all ${innerTab === 'responses' ? 'border-brand text-brand' : 'border-transparent text-n500 hover:text-n700'}`}>
                            Yanıt Takibi ({sentMessages.length})
                        </button>
                        <button onClick={() => setInnerTab('drafts')} className={`px-5 py-4 text-[12px] font-semibold border-b-2 transition-all ${innerTab === 'drafts' ? 'border-warn text-warn' : 'border-transparent text-n500 hover:text-n700'}`}>
                            Taslaklar ({pendingApprovals.length})
                        </button>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-n400" size={14} />
                            <input type="text" placeholder="Ara..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                className="bg-n50 border border-n200 rounded-md pl-8 pr-3 py-2 text-sm w-44 outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand transition-all" />
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-auto flex-1">
                    <div className="min-w-[760px]">
                        <div className="bg-n50 sticky top-0 z-10">
                            <div className="grid grid-cols-[1.5fr_1.2fr_0.8fr_0.8fr_auto] gap-3 px-5 py-2.5 border-b border-n200">
                                {['ADAY', 'POZİSYON', 'TARİH', 'DURUM', 'AKSİYON'].map(h => (
                                    <div key={h} className="text-[11px] font-semibold text-n400 uppercase tracking-[0.08em]">{h}</div>
                                ))}
                            </div>
                        </div>
                        <div className="divide-y divide-n100">
                            {activeRows.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-16 gap-3">
                                    <FileText className="w-8 h-8 text-n200" />
                                    <p className="text-sm text-n400">Kayıt bulunamadı</p>
                                </div>
                            )}
                            {activeRows.map((msg, idx) => {
                                const initials = msg.candidateName?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';
                                const grad = gradients[idx % gradients.length];
                                const isPending = innerTab === 'drafts';
                                return (
                                    <div key={idx} className="grid grid-cols-[1.5fr_1.2fr_0.8fr_0.8fr_auto] gap-3 px-5 py-3.5 items-center hover:bg-n50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full ${grad} flex items-center justify-center text-white text-[12px] font-semibold shrink-0 shadow-sm`}>{initials}</div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[13px] font-semibold text-n900 truncate">{msg.candidateName}</span>
                                                <span className="text-[11px] text-n400 truncate">#{msg.candidateId?.substring(0, 8) || 'system'}</span>
                                            </div>
                                        </div>
                                        <div className="text-[12px] font-medium text-n600 truncate pr-4">{msg.candidatePosition || msg.candidateEmail || '—'}</div>
                                        <div className="text-[12px] text-n400">{msg.createdAt?.toDate?.()?.toLocaleDateString('tr-TR') || '—'}</div>
                                        <div>{getStatusBadge(msg)}</div>
                                        <div className="flex items-center justify-end gap-2">
                                            {!isPending ? (
                                                <>
                                                    <button onClick={() => onCheckMail(msg)} className="p-2 rounded-md bg-n50 border border-n200 text-n400 hover:text-brand hover:border-brand-100 transition-colors" title="Gmail Tara">
                                                        <Search size={14} />
                                                    </button>
                                                    <button onClick={() => onProcess(msg)} className="px-3 py-2 rounded-md bg-n900 text-white text-[11px] font-semibold hover:bg-brand transition-colors shadow-sm">İşle</button>
                                                </>
                                            ) : (
                                                <button className="px-3 py-2 rounded-md bg-brand text-white text-[11px] font-semibold hover:bg-brand-600 transition-colors shadow-sm shadow-none">Onayla</button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-n200 bg-n50 flex items-center justify-between shrink-0">
                    <span className="text-[12px] text-n400 font-medium">{activeRows.length} kayıt gösteriliyor</span>
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

    // ── Date-filtered candidates ──
    const timeCutoff = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() - (timeRange === '30d' ? 30 : 7));
        return d;
    }, [timeRange]);

    const timeFilteredCandidates = useMemo(() => {
        return candidates.filter(c => {
            if (!c.appliedDate) return true; // keep candidates with no date
            return new Date(c.appliedDate) >= timeCutoff;
        });
    }, [candidates, timeCutoff]);

    // ── Data ──
    const trendsData = useMemo(() => {
        const days = timeRange === '30d' ? 30 : 7;
        const dateList = [...Array(days)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().split('T')[0]; }).reverse();
        const counts = {};
        candidates.forEach(c => { if (c.appliedDate) counts[c.appliedDate.split('T')[0]] = (counts[c.appliedDate.split('T')[0]] || 0) + 1; });
        return dateList.map(date => ({ date: new Date(date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }), applications: counts[date] || 0 }));
    }, [candidates, timeRange]);

    const positionStatusData = useMemo(() => {
        const matrix = {};
        positions.forEach(p => { if (p.status === 'open') matrix[p.title] = { name: p.title, total: 0, review: 0, interview: 0, hired: 0, rejected: 0, avgScore: 0, scoredCandidates: 0 }; });
        timeFilteredCandidates.forEach(c => {
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
    }, [timeFilteredCandidates, positions]);

    const funnelData = useMemo(() => ([
        { name: 'Başvuru',  color: '#6366f1', count: timeFilteredCandidates.length },
        { name: 'İnceleme', color: '#f59e0b', count: timeFilteredCandidates.filter(c => ['review', 'interview', 'offer', 'hired'].includes(c.status)).length },
        { name: 'Mülakat',  color: '#3b82f6', count: timeFilteredCandidates.filter(c => ['interview', 'offer', 'hired'].includes(c.status)).length },
        { name: 'İşe Alım', color: '#10b981', count: timeFilteredCandidates.filter(c => c.status === 'hired').length },
    ]), [timeFilteredCandidates]);

    const { sourceList, subSourceList } = useMemo(() => {
        const sources = {}, subSources = {};
        timeFilteredCandidates.forEach(c => {
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
    }, [timeFilteredCandidates]);

    const topSkills = useMemo(() => {
        const skills = {};
        timeFilteredCandidates.forEach(c => normalizeSkills(c.skills).forEach(s => { skills[s] = (skills[s] || 0) + 1; }));
        return Object.entries(skills).sort((a, b) => b[1] - a[1]).slice(0, 8);
    }, [timeFilteredCandidates]);

    const avgMatchScore = useMemo(() => {
        if (!timeFilteredCandidates.length) return 0;
        return Math.round(timeFilteredCandidates.reduce((a, c) => a + (c.matchScore || 0), 0) / timeFilteredCandidates.length);
    }, [timeFilteredCandidates]);

    const pendingApprovals = useMemo(() => messages.filter(m => m.status === 'draft' || m.status === 'ready_to_send'), [messages]);
    const sentMessages     = useMemo(() => messages.filter(m => m.status === 'sent' || m.status === 'email_opened' || m.status === 'replied'), [messages]);
    // Defensive: if context is still loading or `replied` is missing,
    // pendingCount must be a finite non-negative number — never NaN.
    const sentSafe    = Number.isFinite(messageStats?.sent)    ? messageStats.sent    : 0;
    const repliedSafe = Number.isFinite(messageStats?.replied) ? messageStats.replied : 0;
    const pendingCount = Math.max(0, sentSafe - repliedSafe);

    const loading = candidatesLoading || messagesLoading;

    if (loading) {
        return (
            <div className="infoset flex flex-col items-center justify-center min-h-screen gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-brand" />
                <p className="text-xs font-semibold text-n400 uppercase tracking-[0.08em]">Yükleniyor...</p>
            </div>
        );
    }

    const TABS = [
        { id: 'overview',    label: 'Genel Bakış'     },
        { id: 'acquisition', label: 'Edinme & Kaynak'  },
        { id: 'responses',   label: 'Yanıt Takibi'    },
    ];

    return (
        <div className="infoset min-h-screen flex flex-col">
            <Header title="Stratejik Analitik" />

            {/* Sub-header — "Stratejik Analitik" lives in the top-bar (Header
                title). Don't repeat it here; just the live-status indicator
                + record count remain. */}
            <div className="bg-n0 border-b border-n200 px-6 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <Activity size={16} className="text-brand" />
                    <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />
                    <span className="text-[12px] text-n400">{candidates.length} aktif kayıt</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-n100 rounded-md p-1">
                        {TABS.map(t => <TabPill key={t.id} id={t.id} label={t.label} active={activeTab === t.id} onClick={setActiveTab} />)}
                    </div>
                    <div className="flex items-center gap-1 bg-n100 rounded-md p-1">
                        {[['7d', '7G'], ['30d', '30G']].map(([val, label]) => (
                            <button key={val} onClick={() => setTimeRange(val)}
                                className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all ${timeRange === val ? 'bg-n0 text-brand shadow-sm border border-n200' : 'text-n500 hover:text-n700'}`}>
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
                            candidates={timeFilteredCandidates} funnelData={funnelData} trendsData={trendsData}
                            positionStatusData={positionStatusData} avgMatchScore={avgMatchScore} pendingCount={pendingCount}
                            timeRange={timeRange}
                        />
                    )}
                    {activeTab === 'acquisition' && (
                        <AcquisitionTab
                            sourceList={sourceList} subSourceList={subSourceList}
                            topSkills={topSkills} avgMatchScore={avgMatchScore} candidates={timeFilteredCandidates}
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
                    <div className="absolute inset-0 bg-n900/30 backdrop-blur-sm" onClick={() => setProcessingResponse(null)} />
                    <div className="relative w-full max-w-lg bg-n0 border border-n200 rounded-[14px] p-8 space-y-6 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-md bg-brand-50 flex items-center justify-center"><Sparkles className="w-4 h-4 text-brand" /></div>
                                <h3 className="text-base font-semibold text-n900">Yanıt Analizi</h3>
                            </div>
                            <button onClick={() => setProcessingResponse(null)} className="p-2 hover:bg-n100 rounded-md text-n400 transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        {!processingResponse.result ? (
                            <div className="space-y-4">
                                {processingResponse.checkingMail ? (
                                    <div className="h-48 flex flex-col items-center justify-center gap-3 bg-n50 border border-n200 rounded-[14px]">
                                        <RefreshCw className="w-8 h-8 text-brand animate-spin" />
                                        <p className="text-xs text-n400 font-semibold uppercase tracking-[0.08em]">Gmail Taranıyor...</p>
                                    </div>
                                ) : (
                                    <textarea
                                        className="w-full h-48 bg-n50 border border-n200 rounded-[14px] p-4 text-sm text-n900 outline-none focus:border-brand focus:ring-2 focus:ring-brand-100 resize-none transition-all"
                                        placeholder="Yanıtı buraya yapıştırın veya 'Mail Ara' butonuna tıklayın..."
                                        value={processingResponse.emailText}
                                        onChange={e => setProcessingResponse(prev => ({ ...prev, emailText: e.target.value }))}
                                    />
                                )}
                                <button onClick={handleProcessResponse} disabled={processingResponse.checkingMail || !processingResponse.emailText.trim()}
                                    className="w-full py-3 rounded-[14px] bg-brand hover:bg-brand-600 text-white font-semibold text-xs uppercase tracking-[0.08em] disabled:opacity-40 shadow-sm shadow-none transition-colors">
                                    {processingResponse.loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Analiz ediliyor...</span> : 'Analiz Et'}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="p-5 rounded-[14px] bg-n50 border border-n200">
                                    <p className="text-sm italic text-n600 leading-relaxed">"{processingResponse.result.summary}"</p>
                                </div>
                                <button onClick={() => setProcessingResponse(null)} className="w-full py-3 rounded-[14px] bg-n100 hover:bg-n100 text-n600 font-semibold text-xs uppercase tracking-[0.08em] transition-colors">Kapat</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
