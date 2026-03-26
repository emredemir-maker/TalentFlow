// src/pages/Dashboard.jsx
import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import Header from '../components/Header';
import CandidateDrawer from '../components/CandidateDrawer';
import AddCandidateModal from '../components/AddCandidateModal';
import { doc, getDoc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
    Users,
    Target,
    Clock,
    Star,
    Zap,
    BarChart2,
    Calendar,
    ChevronRight,
    ArrowUpRight,
    ArrowDownRight,
    CheckCircle2,
    Circle,
    TrendingUp,
} from 'lucide-react';

function Trend({ up, val }) {
    return (
        <span className={`inline-flex items-center gap-0.5 text-[10px] font-black ${up ? 'text-emerald-600' : 'text-red-500'}`}>
            {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {val}
        </span>
    );
}

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

    const [sessionStatuses, setSessionStatuses] = useState({});
    useEffect(() => {
        const unsubscribe = onSnapshot(
            collection(db, 'interviews'),
            (snap) => {
                const map = {};
                snap.forEach(docSnap => { map[docSnap.id] = docSnap.data().status; });
                setSessionStatuses(map);
            },
            (err) => console.warn('[Dashboard] session status listener error:', err)
        );
        return () => unsubscribe();
    }, []);

    const { positions } = usePositions();
    const navigate = useNavigate();

    const activePositions = useMemo(() => positions.filter(p => p.status === 'open').slice(0, 4), [positions]);
    const allOpenCount = useMemo(() => positions.filter(p => p.status === 'open').length, [positions]);

    const funnelData = useMemo(() => {
        const byStatus = stats.byStatus || {};
        const total = candidates.length || 1;

        // Direct per-stage counts (non-cumulative) for the 6 canonical pipeline stages
        const stageDefs = [
            { key: 'ai_analysis', label: 'AI Tarama',   color: '#2563EB', legacy: ['new', 'pending', 'applied', 'unknown'] },
            { key: 'review',      label: 'İnceleme',    color: '#3B82F6', legacy: ['Review', 'değerlendirme'] },
            { key: 'interview',   label: 'Mülakat',     color: '#7C3AED', legacy: ['Interview', 'mülakat', 'Mülakat'] },
            { key: 'offer',       label: 'Teklif',      color: '#F59E0B', legacy: [] },
            { key: 'hired',       label: 'İşe Alındı',  color: '#059669', legacy: ['Hired'] },
            { key: 'rejected',    label: 'Reddedildi',  color: '#DC2626', legacy: ['Rejected', 'rejected'] },
        ];

        // Collect all known status keys so we can catch-all the rest into AI Tarama
        const allKnownKeys = new Set(stageDefs.flatMap(s => [s.key, ...s.legacy]));
        const uncategorizedCount = Object.entries(byStatus)
            .filter(([k]) => !allKnownKeys.has(k))
            .reduce((sum, [, v]) => sum + v, 0);

        return stageDefs.map((s, idx) => {
            let count = (byStatus[s.key] || 0) +
                s.legacy.reduce((sum, k) => sum + (byStatus[k] || 0), 0);
            // First stage absorbs any candidates with unrecognized statuses
            if (idx === 0) count += uncategorizedCount;
            return {
                label: s.label,
                count,
                pct: Math.max(Math.round((count / total) * 100), count > 0 ? 4 : 0),
                color: s.color,
            };
        });
    }, [stats, candidates]);

    const weeklyPlan = useMemo(() => {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfWeek = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
        const sessionsMap = new Map();

        candidates.forEach(c => {
            if (c.interviewSessions && Array.isArray(c.interviewSessions)) {
                c.interviewSessions.forEach(s => {
                    const effectiveStatus = sessionStatuses[s.id] || s.status;
                    const effectivelyCompleted = effectiveStatus === 'completed' ||
                        (effectiveStatus !== 'live' && (s.aiOverallScore > 0 || Boolean(s.aiSummary) || s.finalScore > 0));
                    if (effectiveStatus === 'cancelled' || effectivelyCompleted) return;

                    const sessionDatePart = s.date ? s.date.split('T')[0] : '';
                    const sessionDate = new Date(sessionDatePart);
                    const isLive = effectiveStatus === 'live';

                    if (isLive || (sessionDate >= startOfToday && sessionDate <= endOfWeek)) {
                        const key = `${c.id}-${sessionDatePart}-${s.time}`;
                        const sessionData = {
                            id: s.id,
                            candidateId: c.id,
                            name: c.name,
                            role: c.position || c.bestTitle || 'Aday',
                            time: s.time || '10:00',
                            date: sessionDatePart,
                            status: effectiveStatus,
                            aiOverallScore: s.aiOverallScore || 0,
                            aiSummary: s.aiSummary,
                            finalScore: s.finalScore || 0,
                            score: c.combinedScore || c.bestScore || 0,
                        };
                        if (!sessionsMap.has(key) || effectiveStatus === 'live' || effectiveStatus === 'completed') {
                            sessionsMap.set(key, sessionData);
                        }
                    }
                });
            }
        });

        return Array.from(sessionsMap.values()).sort((a, b) => {
            if (a.status === 'live' && b.status !== 'live') return -1;
            if (b.status === 'live' && a.status !== 'live') return 1;
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.time.localeCompare(b.time);
        }).slice(0, 4);
    }, [candidates, sessionStatuses]);

    const dynamicMetrics = useMemo(() => {
        const analyzedCount = candidates.filter(c => c.aiAnalysis || c.cvSummary || (Number(c.bestScore) || 0) > 0).length;
        const avgMatchArr = candidates.filter(c => (Number(c.bestScore) || 0) > 0);
        const avgMatch = avgMatchArr.length > 0
            ? Math.round(avgMatchArr.reduce((acc, curr) => acc + (Number(curr.bestScore) || 0), 0) / avgMatchArr.length)
            : 88;

        const ivCount = (stats.byStatus?.interview || 0) + (stats.byStatus?.Interview || 0) +
            (stats.byStatus?.mülakat || 0) + (stats.byStatus?.Mülakat || 0);
        const totalRoi = analyzedCount * 50 + ivCount * 150;
        const hoursSaved = Math.round((analyzedCount * 25 + ivCount * 60) / 60);

        return {
            avgMatch,
            roi: (totalRoi || 42500).toLocaleString('tr-TR'),
            timeSaved: hoursSaved || 120,
            recruitSpeed: "12.4 Gün",
        };
    }, [stats, candidates]);

    const kpis = useMemo(() => [
        { label: "Toplam Aday", value: String(candidates.length), change: "+12", up: true, desc: "bu hafta yeni başvuru", icon: Users },
        { label: "Aktif Pozisyon", value: String(allOpenCount), change: "+2", up: true, desc: "açık ilan", icon: Target },
        { label: "AI Match Skoru", value: `${dynamicMetrics.avgMatch}%`, change: "+5%", up: true, desc: "ortalama uyum", icon: Star },
        { label: "İşe Alım Hızı", value: dynamicMetrics.recruitSpeed, change: "-22%", up: true, desc: "ortalama süre", icon: Clock },
    ], [candidates.length, allOpenCount, dynamicMetrics]);

    if (error) return <div className="p-10 text-[11px] font-black text-red-500 uppercase tracking-widest text-center">Sistem Hatası: Veri Senkronizasyonu Başarısız.</div>;

    return (
        <div className="min-h-screen bg-[#F0F4F8]">
            <Header />

            <div className="max-w-[1500px] mx-auto px-8 py-6 space-y-6">

                {/* PAGE TITLE */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[20px] font-black text-[#0F172A] tracking-tight">Stratejik Genel Bakış</h1>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                            {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} — Haftalık özet
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                            Sistem Aktif
                        </div>
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="text-[10px] font-bold text-white bg-[#1E3A8A] hover:bg-blue-800 px-4 py-2 rounded-xl transition-colors"
                        >
                            + Aday Ekle
                        </button>
                    </div>
                </div>

                {/* KPI ROW */}
                <div className="grid grid-cols-4 gap-4">
                    {kpis.map((k, i) => (
                        <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                                <span className="text-[11px] font-semibold text-slate-500">{k.label}</span>
                                <Trend up={k.up} val={k.change} />
                            </div>
                            <div className="text-[32px] font-black text-[#0F172A] leading-none mb-1">{k.value}</div>
                            <div className="text-[10px] text-slate-400 font-medium">{k.desc}</div>
                        </div>
                    ))}
                </div>

                {/* MAIN CONTENT */}
                <div className="grid grid-cols-12 gap-5">

                    {/* LEFT — Pipeline + Schedule */}
                    <div className="col-span-8 space-y-5">

                        {/* PIPELINE */}
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-2">
                                    <BarChart2 className="w-4 h-4 text-[#1E3A8A]" />
                                    <span className="text-[13px] font-black text-[#0F172A]">Aday Pipeline</span>
                                </div>
                                <button
                                    onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }))}
                                    className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:underline"
                                >
                                    Detaylı Görünüm <ChevronRight className="w-3 h-3" />
                                </button>
                            </div>
                            <div className="space-y-3">
                                {funnelData.map((p, i) => {
                                    const prev = i === 0 ? candidates.length * 0.93 : funnelData[i - 1].count * 0.93;
                                    const diff = p.count - Math.round(prev);
                                    return (
                                        <div key={i} className="flex items-center gap-4">
                                            <div className="w-24 text-[11px] font-semibold text-slate-600 text-right shrink-0">{p.label}</div>
                                            <div className="flex-1 h-10 bg-slate-50 rounded-xl overflow-hidden border border-slate-100 relative">
                                                <div
                                                    className="h-full rounded-xl flex items-center px-4 transition-all duration-700"
                                                    style={{
                                                        width: `${Math.max(p.pct, 8)}%`,
                                                        backgroundColor: p.color + '18',
                                                        borderRight: `3px solid ${p.color}`,
                                                    }}
                                                >
                                                    <span className="text-[9px] font-black" style={{ color: p.color }}>{p.label.toUpperCase()}</span>
                                                </div>
                                            </div>
                                            <div className="w-12 text-right text-[15px] font-black text-[#0F172A] tabular-nums shrink-0">{p.count}</div>
                                            <div className="w-14 text-right shrink-0">
                                                <span className={`text-[9px] font-bold ${diff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                    {diff >= 0 ? '+' : ''}{diff}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-6 flex-wrap">
                                <div className="text-[10px] text-slate-500 font-medium">Teklife dönüşüm:</div>
                                <div className="font-black text-[13px] text-[#1E3A8A]">
                                    %{candidates.length > 0 ? Math.round((funnelData[3].count / candidates.length) * 100) : 0}
                                </div>
                                <div className="text-[10px] text-slate-500 font-medium mt-1">İşe alım oranı:</div>
                                <div className="font-black text-[13px] text-emerald-700">
                                    %{candidates.length > 0 ? Math.round((funnelData[4].count / candidates.length) * 100) : 0}
                                </div>
                                <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-600">
                                    <TrendingUp className="w-3 h-3" />
                                    İşe alım hızı -{dynamicMetrics.recruitSpeed} ortalama
                                </div>
                            </div>
                        </div>

                        {/* SCHEDULE */}
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-[#1E3A8A]" />
                                    <span className="text-[13px] font-black text-[#0F172A]">Haftanın Planı</span>
                                </div>
                                <button
                                    onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }))}
                                    className="text-[10px] font-bold text-blue-600 hover:underline"
                                >
                                    Tümünü Gör
                                </button>
                            </div>
                            <div className="divide-y divide-slate-50">
                                {weeklyPlan.length === 0 ? (
                                    <div className="py-10 text-center">
                                        <p className="text-[11px] font-semibold text-slate-300">Planlı mülakat bulunmuyor.</p>
                                    </div>
                                ) : weeklyPlan.map((s, i) => {
                                    const todayStr = new Date().toISOString().split('T')[0];
                                    const isToday = s.date === todayStr;
                                    const effComp = s.status === 'completed' || (s.status !== 'live' && (s.aiOverallScore > 0 || Boolean(s.aiSummary) || s.finalScore > 0));

                                    return (
                                        <div key={i} className="py-3 flex items-center gap-4 group">
                                            <div className="w-16 shrink-0 text-center">
                                                <div className="text-[13px] font-black text-[#0F172A]">{s.time}</div>
                                                <div className={`text-[8px] font-bold uppercase ${isToday ? 'text-emerald-500' : 'text-slate-400'}`}>
                                                    {isToday ? 'BUGÜN' : new Date(s.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[12px] font-bold text-[#0F172A] group-hover:text-blue-700 transition-colors truncate">{s.name}</span>
                                                    {s.status === 'live' ? (
                                                        <span className="text-[7px] font-black px-1.5 py-0.5 bg-rose-50 text-rose-600 border border-rose-100 rounded animate-pulse">● CANLI</span>
                                                    ) : effComp ? (
                                                        <span className="text-[7px] font-black px-1.5 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded">TAMAMLANDI</span>
                                                    ) : (
                                                        <span className="text-[7px] font-black px-1.5 py-0.5 bg-slate-50 text-slate-400 border border-slate-100 rounded">PLANLI</span>
                                                    )}
                                                </div>
                                                <div className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">{s.role}</div>
                                            </div>
                                            <div className="shrink-0 text-right mr-2">
                                                {s.score > 0 && (
                                                    <>
                                                        <div className="text-[14px] font-black text-[#0F172A]">%{s.score}</div>
                                                        <div className="text-[8px] text-slate-400">Uyum</div>
                                                    </>
                                                )}
                                            </div>
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    if (effComp) { navigate(`/interview-report/${s.id}`); return; }
                                                    try {
                                                        const snap = await getDoc(doc(db, 'interviews', s.id));
                                                        if (snap.exists() && snap.data()?.status === 'completed') {
                                                            navigate(`/interview-report/${s.id}`);
                                                        } else {
                                                            navigate(`/live-interview/${s.id}`);
                                                        }
                                                    } catch {
                                                        navigate(`/live-interview/${s.id}`);
                                                    }
                                                }}
                                                className={`shrink-0 text-[9px] font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${effComp ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-[#1E3A8A] hover:bg-blue-800 text-white'}`}
                                            >
                                                {effComp ? 'Rapor' : s.status === 'live' ? 'Katıl' : 'Görüntüle'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT PANEL */}
                    <div className="col-span-4 space-y-5">

                        {/* AI INSIGHT */}
                        <div className="bg-[#1E3A8A] text-white rounded-2xl p-5 relative overflow-hidden">
                            <div className="absolute -right-6 -top-6 w-28 h-28 bg-blue-500/20 rounded-full blur-xl" />
                            <div className="relative z-10">
                                <div className="flex items-center gap-1.5 mb-3">
                                    <Zap className="w-3.5 h-3.5 text-blue-300 fill-blue-300" />
                                    <span className="text-[8px] font-black text-blue-300 uppercase tracking-[0.2em]">AI Performans Özeti</span>
                                </div>
                                <p className="text-[12px] text-blue-100/80 leading-relaxed mb-5 font-medium">
                                    AI sistemimiz bu periyotta{' '}
                                    <span className="text-white font-black">{dynamicMetrics.timeSaved} saatlik</span>{' '}
                                    manuel yükü asiste ederek işe alım maliyetlerini minimize etti.
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-white/8 border border-white/10 rounded-xl p-3">
                                        <div className="text-[7px] font-black text-blue-200/50 uppercase tracking-widest mb-1">ÜRETİLEN ROI</div>
                                        <div className="text-[18px] font-black">${dynamicMetrics.roi}</div>
                                    </div>
                                    <div className="bg-white/8 border border-white/10 rounded-xl p-3">
                                        <div className="text-[7px] font-black text-blue-200/50 uppercase tracking-widest mb-1">KAZANILAN</div>
                                        <div className="text-[18px] font-black">{dynamicMetrics.timeSaved}h</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* OPEN POSITIONS */}
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-[12px] font-black text-[#0F172A]">Açık Pozisyonlar</span>
                                <span className="text-[8px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
                                    {allOpenCount} Aktif
                                </span>
                            </div>
                            <div className="space-y-3">
                                {activePositions.map((pos, i) => {
                                    const posCount = candidates.filter(c => c.position === pos.title || c.bestTitle === pos.title).length;
                                    const fillPct = Math.min(Math.round((posCount / Math.max(posCount + 5, 20)) * 100), 95);
                                    const barColor = fillPct > 75 ? '#10B981' : fillPct > 50 ? '#3B82F6' : '#F59E0B';
                                    return (
                                        <div
                                            key={pos.id}
                                            className="group cursor-pointer"
                                            onClick={() => {
                                                window.dispatchEvent(new CustomEvent('changeView', { detail: 'positions' }));
                                                setTimeout(() => {
                                                    window.dispatchEvent(new CustomEvent('openPosition', { detail: { positionId: pos.id } }));
                                                }, 80);
                                            }}
                                        >
                                            <div className="flex items-start justify-between mb-1.5">
                                                <div>
                                                    <div className="text-[11px] font-bold text-[#0F172A] group-hover:text-blue-700 transition-colors leading-tight">{pos.title}</div>
                                                    <div className="text-[9px] text-slate-400 font-medium mt-0.5">{posCount} aday</div>
                                                </div>
                                                <div className="text-[11px] font-black" style={{ color: barColor }}>{fillPct}%</div>
                                            </div>
                                            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                                                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${fillPct}%`, backgroundColor: barColor }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <button
                                onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'positions' }))}
                                className="mt-4 w-full text-center text-[9px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-widest transition-colors"
                            >
                                Tüm Pozisyonları Gör →
                            </button>
                        </div>

                        {/* ENGINE STATUS */}
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                            <span className="text-[12px] font-black text-[#0F172A] block mb-4">Sistem Durumu</span>
                            <div className="space-y-3">
                                {[
                                    { label: 'Scoring Engine', val: 98, ok: true },
                                    { label: 'Bias Guard', val: 100, ok: true },
                                    { label: 'Data Sync', val: 82, ok: false },
                                ].map((e, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        {e.ok
                                            ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                            : <Circle className="w-4 h-4 text-amber-400 shrink-0" />
                                        }
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between text-[10px] mb-1">
                                                <span className="font-semibold text-slate-700">{e.label}</span>
                                                <span className={`font-black ${e.val > 90 ? 'text-emerald-600' : 'text-amber-500'}`}>{e.val}%</span>
                                            </div>
                                            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-1000"
                                                    style={{ width: `${e.val}%`, backgroundColor: e.val > 90 ? '#10B981' : '#F59E0B' }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 p-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center">
                                <span className="text-[9px] font-black text-blue-200 uppercase tracking-[0.3em]">AI CORE ACTIVE</span>
                            </div>
                        </div>

                    </div>
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
