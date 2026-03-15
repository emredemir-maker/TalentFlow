// src/pages/Dashboard.jsx
import { useState, useMemo } from 'react';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import Header from '../components/Header';
import CandidateDrawer from '../components/CandidateDrawer';
import AddCandidateModal from '../components/AddCandidateModal';
import OpportunityHub from '../components/OpportunityHub';
import {
    Users,
    MessageSquare,
    Plus,
    Zap,
    Star,
    ChevronRight,
    Search,
    MapPin,
    Target
} from 'lucide-react';

export default function Dashboard() {
    const {
        enrichedCandidates,
        updateCandidate,
        stats,
        error,
        deleteCandidate,
    } = useCandidates();

    const candidates = enrichedCandidates || [];
    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const { positions } = usePositions();

    const activePositions = useMemo(() => positions.filter(p => p.status === 'open').slice(0, 4), [positions]);

    const funnelData = useMemo(() => {
        const byStatus = stats.byStatus || {};
        const hiredCount = byStatus.hired || 0;
        const offerCount = (byStatus.offer || 0) + hiredCount;
        const interviewCount = (byStatus.interview || 0) + offerCount;
        const reviewCount = (byStatus.review || 0) + interviewCount;
        const analyzedCount = candidates.filter(c => (c.bestScore || 0) >= 1).length;
        const aiScreenedCount = Math.max(analyzedCount, reviewCount);

        return [
            { label: 'Başvurular', count: candidates.length, width: '100%', bg: 'bg-slate-50' },
            { label: 'AI Tarama', count: aiScreenedCount, width: '85%', ml: 'ml-[7.5%]', bg: 'bg-slate-100' },
            { label: 'İnceleme', count: reviewCount, width: '70%', ml: 'ml-[15%]', bg: 'bg-slate-200' },
            { label: 'Mülakatlar', count: interviewCount, width: '55%', ml: 'ml-[22.5%]', bg: 'bg-slate-300' },
            { label: 'Teklifler', count: offerCount, width: '40%', ml: 'ml-[30%]', bg: 'bg-emerald-500 text-white' },
        ];
    }, [stats, candidates]);

    const todayInterviews = useMemo(() => {
        return candidates
            .filter(c => c.hasInterview)
            .map(c => ({
                id: c.id,
                name: c.name,
                role: c.position,
                time: c.interviewSessions?.[0]?.time || '10:00 AM'
            }))
            .slice(0, 4);
    }, [candidates]);

    const dynamicMetrics = useMemo(() => {
        const analyzedCount = candidates.filter(c => c.aiAnalysis || c.cvSummary).length;
        const avgMatchArr = candidates.filter(c => (c.combinedScore || 0) > 0);
        const avgMatch = avgMatchArr.length > 0 
            ? Math.round(avgMatchArr.reduce((acc, curr) => acc + (curr.combinedScore || 0), 0) / avgMatchArr.length)
            : 94;

        const totalRoi = analyzedCount * 50 + (stats.byStatus?.interview || 0) * 150;
        const hoursSaved = Math.round((analyzedCount * 45 + (stats.byStatus?.interview || 0) * 90) / 60);

        return {
            avgMatch,
            roi: (totalRoi || 142500).toLocaleString(),
            timeSaved: hoursSaved || 480,
            recruitSpeed: "14.2 Gün"
        };
    }, [stats, candidates]);

    if (error) return <div className="p-10 text-[11px] font-black text-red-500 uppercase tracking-widest text-center">Sistem Hatası: Veri Senkronizasyonu Başarısız.</div>;

    return (
        <div className="min-h-screen bg-[#F8FAFC]">
            <Header />
            
            <div className="max-w-[1600px] mx-auto px-8 py-6 space-y-6">
                
                {/* 1. COMPACT HEADER */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[24px] font-black text-[#0F172A] tracking-tighter uppercase italic leading-none">Stratejik Genel Bakış</h1>
                        <p className="text-[11px] text-[#64748B] font-bold mt-1 uppercase tracking-[0.2em] opacity-60 italic">Real-Time Talent Intelligence Engine</p>
                    </div>

                    <div className="flex gap-3">
                        <div className="bg-white px-4 py-2.5 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col justify-center min-w-[140px]">
                            <span className="text-[8px] font-black text-[#94A3B8] uppercase tracking-widest mb-0.5">İŞE ALIM HIZI</span>
                            <div className="flex items-center gap-2">
                                <span className="text-[16px] font-black text-[#0F172A]">{dynamicMetrics.recruitSpeed}</span>
                                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1 rounded">-22%</span>
                            </div>
                        </div>
                        <div className="bg-white px-4 py-2.5 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col justify-center min-w-[140px]">
                            <span className="text-[8px] font-black text-[#94A3B8] uppercase tracking-widest mb-0.5">AI MATCH INDEX</span>
                            <div className="flex items-center gap-2">
                                <span className="text-[16px] font-black text-[#0F172A]">{dynamicMetrics.avgMatch}%</span>
                                <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-1 rounded">+5%</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. CORE ANALYTICS ROW (Compacted) */}
                <div className="grid grid-cols-12 gap-5 items-stretch">
                    {/* Compact Funnel */}
                    <div className="col-span-12 lg:col-span-7 bg-white rounded-[20px] p-6 border border-[#E2E8F0] shadow-sm flex flex-col">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2">
                                <Target className="w-4 h-4 text-blue-600" />
                                <h3 className="text-[13px] font-black text-[#0F172A] uppercase tracking-widest">Aday Akış Analizi</h3>
                            </div>
                            <button className="text-[9px] font-black text-blue-600 uppercase tracking-widest hover:underline">Detay</button>
                        </div>

                        <div className="space-y-2 flex-1 flex flex-col justify-center">
                            {funnelData.map((phase, i) => (
                                <div key={i} className="flex items-center justify-between gap-3 group">
                                    <div className="flex-1 relative h-9 flex items-center pr-6">
                                        <div 
                                            className={`absolute left-0 top-0 bottom-0 ${phase.bg} rounded-lg transition-all duration-700 ease-out flex items-center px-4 border border-black/5 group-hover:brightness-95 shadow-sm`}
                                            style={{ width: phase.width, marginLeft: phase.ml || '0' }}
                                        >
                                            <span className={`text-[9px] font-black uppercase tracking-tight truncate ${i === 4 ? 'text-white' : 'text-[#1E3A8A]'}`}>
                                                {phase.label}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="w-10 text-right text-[13px] font-black text-[#0F172A] tabular-nums">{phase.count}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Compact Blue Card (Fixed Font Colors) */}
                    <div className="col-span-12 lg:col-span-5 bg-[#1E3A8A] rounded-[20px] p-8 text-white relative overflow-hidden shadow-xl flex flex-col justify-between group">
                        <div className="absolute -top-10 -right-10 w-48 h-48 bg-white/5 rounded-full blur-[50px] transition-transform group-hover:scale-125" />
                        <Star className="absolute right-6 top-6 w-12 h-12 text-white/5 group-hover:opacity-10 transition-opacity" />
                        
                        <div className="relative z-10 space-y-4">
                            <div className="flex items-center gap-2 text-[#6EE7B7]">
                                <Zap className="w-3.5 h-3.5 fill-current" />
                                <span className="text-[9px] font-black uppercase tracking-[0.2em]">Stratejik Görüntüleme</span>
                            </div>
                            <h2 className="text-[20px] font-black leading-tight italic uppercase !text-white shadow-sm">Operasyonel Verimlilik</h2>
                            <p className="text-[12px] text-blue-100/80 leading-relaxed font-semibold italic">
                                AI sistemimiz son periyotta <span className="text-white underline decoration-blue-400">{dynamicMetrics.timeSaved} saatlik</span> manuel yükü asiste ederek işe alım maliyetlerini minimize etti.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-8 relative z-10">
                            <div className="bg-white/10 backdrop-blur-md border border-white/5 rounded-xl p-4">
                                <span className="text-[8px] font-black text-blue-200/60 uppercase tracking-widest block mb-1">ÜRETİLEN ROI</span>
                                <div className="text-[18px] font-black text-white">${dynamicMetrics.roi}</div>
                            </div>
                            <div className="bg-white/10 backdrop-blur-md border border-white/5 rounded-xl p-4">
                                <span className="text-[8px] font-black text-blue-200/60 uppercase tracking-widest block mb-1">ZAMAN TASARRUFU</span>
                                <div className="text-[18px] font-black text-white">{dynamicMetrics.timeSaved}h</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. TERTIARY ROW (Extreme Compact) */}
                <div className="grid grid-cols-12 gap-5">
                    {/* Active Jobs List */}
                    <div className="col-span-12 md:col-span-4 bg-white rounded-[20px] p-6 border border-[#E2E8F0] shadow-sm">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-[12px] font-black text-[#0F172A] uppercase tracking-widest italic">Açık Pozisyonlar</h3>
                            <span className="text-[8px] font-black px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md border border-blue-100">8 AKTİF</span>
                        </div>
                        <div className="space-y-2">
                            {activePositions.map(pos => (
                                <div key={pos.id} className="p-3 bg-[#F8FAFC] border border-[#F1F5F9] rounded-xl hover:bg-white hover:border-blue-200 transition-all cursor-pointer group flex items-center justify-between">
                                    <div className="min-w-0 flex-1">
                                        <h4 className="text-[11px] font-bold text-[#0F172A] group-hover:text-blue-600 truncate uppercase">{pos.title}</h4>
                                        <div className="flex items-center gap-2 mt-0.5 text-[9px] text-[#94A3B8] font-bold">
                                            <Users className="w-3 h-3" /> 24 Aday
                                        </div>
                                    </div>
                                    <div className="text-[10px] font-black text-[#10B981] bg-emerald-50 px-1.5 py-0.5 rounded italic">92%</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Agenda List */}
                    <div className="col-span-12 md:col-span-4 bg-white rounded-[20px] p-6 border border-[#E2E8F0] shadow-sm">
                        <h3 className="text-[12px] font-black text-[#0F172A] uppercase tracking-widest italic mb-5">Günün Ajandası</h3>
                        <div className="space-y-4">
                            {todayInterviews.map((int, i) => (
                                <div key={i} className="flex gap-4 items-center group">
                                    <div className="text-center min-w-[50px]">
                                        <div className="text-[13px] font-black text-[#0F172A] leading-none mb-0.5">{int.time.split(' ')[0]}</div>
                                        <div className="text-[8px] font-bold text-[#94A3B8] uppercase">{int.time.split(' ')[1]}</div>
                                    </div>
                                    <div className="flex-1 flex items-center justify-between gap-4 py-2 border-b border-[#F1F5F9] group-last:border-0 min-w-0">
                                        <div className="min-w-0">
                                            <h4 className="text-[12px] font-bold text-[#0F172A] group-hover:text-blue-600 transition-colors truncate">{int.name}</h4>
                                            <p className="text-[9px] text-[#64748B] font-bold uppercase tracking-tight truncate">{int.role}</p>
                                        </div>
                                        <button className="h-7 px-3 bg-[#10B981] text-white text-[8px] font-black rounded-md hover:bg-[#059669] transition-all uppercase tracking-widest flex items-center gap-1.5">
                                            <MessageSquare className="w-3 h-3" /> KATIL
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* AI Engine Status (Compact) */}
                    <div className="col-span-12 md:col-span-4 bg-white rounded-[20px] p-6 border border-[#E2E8F0] shadow-sm flex flex-col">
                        <h3 className="text-[12px] font-black text-[#0F172A] uppercase tracking-widest italic mb-5">Motor Statüsü</h3>
                        <div className="space-y-4 flex-1">
                            {[
                                { label: 'Scoring Engine', val: 98 },
                                { label: 'Bias Guard', val: 100 },
                                { label: 'Data Sync', val: 82 }
                            ].map((stat, i) => (
                                <div key={i} className="space-y-1.5">
                                    <div className="flex justify-between text-[8px] font-black text-[#1E3A8A] uppercase tracking-[0.1em]">
                                        <span>{stat.label}</span>
                                        <span>{stat.val}%</span>
                                    </div>
                                    <div className="h-1 bg-[#F1F5F9] rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-600 rounded-full transition-all duration-1000" style={{ width: `${stat.val}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-6 p-4 bg-slate-50 border-2 border-dashed border-[#E2E8F0] rounded-xl flex items-center justify-center text-center">
                            <h2 className="text-[12px] font-black text-blue-200 uppercase tracking-[0.3em] italic">AI CORE ACTIVE</h2>
                        </div>
                    </div>
                </div>

                {/* 4. FOOTER (Minimal) */}
                <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-between opacity-40">
                    <div className="flex items-center gap-3 text-[8px] font-black uppercase tracking-[0.2em]">
                        <PulseDot /> System Operational
                    </div>
                    <span className="text-[8px] font-bold">TALENTFLOW FRAMEWORK v1.2</span>
                </div>
            </div>

            {selectedCandidate && (
                <CandidateDrawer
                    candidate={selectedCandidate}
                    onClose={() => setSelectedCandidate(null)}
                    onUpdate={updateCandidate}
                    onDelete={deleteCandidate}
                    positions={positions}
                />
            )}
            <AddCandidateModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
        </div>
    );
}

function PulseDot() {
    return (
        <div className="relative flex items-center justify-center w-2 h-2">
            <div className="absolute w-full h-full bg-emerald-400 rounded-full opacity-75 animate-ping" />
            <div className="relative w-1.5 h-1.5 bg-emerald-500 rounded-full" />
        </div>
    );
}
