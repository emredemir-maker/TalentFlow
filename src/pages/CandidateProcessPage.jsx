// src/pages/CandidateProcessPage.jsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import {
    Plus, Search, ChevronRight, Zap, Star, Brain, X,
    Mail, Phone, Target, MessageSquare, Briefcase, TrendingUp, Users, ShieldCheck, Heart, ArrowRight, FileText, Clock, Sparkles, Filter, AlertCircle, Trophy, Globe, Code, Layers, Calendar, Edit3, Trash2, ChevronDown, CheckCircle2, Link2, ExternalLink, Video, Play, Award
} from 'lucide-react';

export default function CandidateProcessPage() {
    const navigate = useNavigate();
    const { enrichedCandidates, viewCandidateId, setViewCandidateId, sourceColors, setPreselectedInterviewData } = useCandidates();
    const candidates = enrichedCandidates || [];
    const [searchQuery, setSearchQuery] = useState('');
    const [activeDetailTab, setActiveDetailTab] = useState('ai_analysis');
    const [expandedInterviewId, setExpandedInterviewId] = useState(null);

    const candidate = useMemo(() => {
        if (!viewCandidateId && candidates.length > 0) return candidates[0];
        return candidates.find(c => c.id === viewCandidateId) || (candidates.length > 0 ? candidates[0] : null);
    }, [candidates, viewCandidateId]);

    const filteredCandidates = useMemo(() => {
        return candidates.filter(c => 
            c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.position?.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [candidates, searchQuery]);

    const parseFeedback = (text) => {
        if (!text) return { pos: "", neg: "" };
        const posSplit = text.split("Negatif (-):");
        const pos = posSplit[0].replace("Pozitif (+):", "").trim();
        const neg = posSplit[1] ? posSplit[1].trim() : "";
        return { pos, neg };
    };

    const starAnalysis = candidate?.aiAnalysis?.starAnalysis || {
        Situation: { reason: "Mülakat verisi bekleniyor.", score: 0 },
        Task: { reason: "Mülakat verisi bekleniyor.", score: 0 },
        Action: { reason: "Mülakat verisi bekleniyor.", score: 0 },
        Result: { reason: "Mülakat verisi bekleniyor.", score: 0 }
    };

    const careerHistory = candidate?.experiences || candidate?.careerHistory || [];

    // Mock data removed - using candidate.interviewSessions from context

    const getSourceLabel = (c) => {
        if (!c?.source) return 'Manuel / PDF';
        if (c.sourceDetail) return `${c.source} (${c.sourceDetail})`;
        return c.source;
    };

    const getSourceColor = (src) => {
        if (!src) return '#64748B'; // Default slate
        const key = src.toLowerCase();
        return sourceColors?.[key] || '#64748B';
    };

    return (
        <div className="h-screen bg-[#F1F5F9] flex flex-col font-sans overflow-hidden">
            <Header />

            <div className="flex-1 flex overflow-hidden">
                {/* LEFT: CANDIDATE LIST */}
                <aside className="w-[30%] flex flex-col bg-white border-r border-[#E2E8F0]">
                    <div className="p-4 pb-2 space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-[16px] font-black text-[#0F172A] tracking-tighter">Aktif Süreç</h1>
                                <p className="text-[9px] text-[#64748B] font-bold uppercase tracking-tight opacity-50">{candidates.length} ADAY • GENEL LİSTE</p>
                            </div>
                            <div className="flex gap-1.5">
                                <button className="h-7 px-2.5 bg-[#F8FAFC] text-[#64748B] rounded-lg border border-[#E2E8F0] flex items-center gap-1 text-[8.5px] font-black hover:bg-white transition-all uppercase">Filtrele</button>
                                <button className="h-7 px-2.5 bg-[#1E3A8A] text-white rounded-lg flex items-center gap-1 text-[8.5px] font-black hover:bg-[#162A62] transition-all uppercase">Yeni Aday</button>
                            </div>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#94A3B8]" />
                            <input type="text" placeholder="Aday veya rol ara..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-[#F1F5F9] border-transparent focus:bg-white rounded-lg py-1.5 pl-8 pr-3 text-[11px] outline-none font-medium" />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 pt-1 space-y-1.5 custom-scrollbar bg-slate-50/10">
                        {filteredCandidates.map(c => {
                            const sourceLabel = getSourceLabel(c);
                            const sourceColor = getSourceColor(c.source);
                            const score = Math.round(c.bestScore || 0);
                            
                            return (
                                <button key={c.id} onClick={() => setViewCandidateId(c.id)} className={`w-full group rounded-lg border transition-all flex items-center p-2.5 gap-3 relative ${c.id === candidate?.id ? 'bg-white border-[#1E3A8A] shadow-md border-[1.5px]' : 'bg-white border-[#E2E8F0] hover:border-blue-100'}`}>
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-black/5">
                                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${c.name}`} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="flex-1 min-w-0 flex items-center justify-between">
                                        <div className="space-y-0 text-left">
                                            <h4 className="text-[12px] font-black text-[#0F172A] truncate leading-tight">{c.name}</h4>
                                            <div className="flex items-center gap-1 mt-0.5">
                                                <span 
                                                    className="text-[7px] font-black px-1.5 py-0 rounded uppercase flex items-center gap-0.5 whitespace-nowrap"
                                                    style={{ color: sourceColor, backgroundColor: `${sourceColor}15` }}
                                                >
                                                    <Link2 className="w-2.5 h-2.5" /> {sourceLabel}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <div className="text-center">
                                                <span className="text-[7px] font-black text-[#94A3B8] uppercase block leading-none">Eşleşme</span>
                                                <span className="text-[11px] font-black text-[#1E3A8A]">%{score} <Zap className="w-2 h-2 inline fill-amber-400 text-amber-400" /></span>
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </aside>

                {/* RIGHT: ANALYTICAL PANEL */}
                <main className="flex-1 bg-[#F8FAFC] overflow-y-auto custom-scrollbar p-5">
                    {candidate ? (
                        <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-lg flex flex-col h-full overflow-hidden">
                            <div className="bg-white sticky top-0 z-20 border-b border-[#F1F5F9]">
                                <div className="px-6 py-4 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-xl border-[2.5px] border-white shadow-xl overflow-hidden shrink-0">
                                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${candidate.name}`} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <h2 className="text-[20px] font-black text-[#1E3A8A] tracking-tighter uppercase italic leading-none">{candidate.name}</h2>
                                            <div className="flex items-center gap-1.5 text-[9px] font-black text-[#10B981] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100/50 w-fit">
                                                <Target className="w-2.5 h-2.5" /> İlk %2 Aday
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[8.5px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5"><Brain className="w-3 h-3 fill-blue-600" /> YZ Analiz Modu</span>
                                            <button className="p-1 hover:bg-slate-50 rounded-lg text-slate-300"><X className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex px-6 gap-6">
                                    {[
                                        { id: 'ai_analysis', label: 'STAR Analizi', icon: <Brain className="w-3 h-3" /> },
                                        { id: 'cv_match', label: 'CV & Uyum Çıkarımı', icon: <FileText className="w-3 h-3" /> },
                                        { id: 'sessions', label: 'Mülakatlar', icon: <Video className="w-3 h-3 text-red-500" /> },
                                        { id: 'interviews', label: 'Süreç Geçmişi', icon: <Clock className="w-3 h-3" /> }
                                    ].map(tab => (
                                        <button key={tab.id} onClick={() => setActiveDetailTab(tab.id)} className={`flex items-center gap-1.5 py-2.5 text-[9px] font-black uppercase tracking-widest relative ${activeDetailTab === tab.id ? 'text-blue-600' : 'text-[#94A3B8] hover:text-[#475569]'}`}>
                                            {tab.icon} {tab.label}
                                            {activeDetailTab === tab.id && <div className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-blue-600 shadow-[0_0_8px_blue]" />}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                                {activeDetailTab === 'ai_analysis' && (
                                    <div className="space-y-6 animate-in fade-in duration-300">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-[#EFF6FF] rounded-xl p-4 border border-blue-100 flex flex-col justify-between h-24">
                                                <span className="text-[9px] font-black text-[#3B82F6] uppercase tracking-widest">STAR GÜVENİ</span>
                                                <div className="text-[24px] font-black text-[#1E3A8A] italic uppercase">{candidate.bestScore ? `${Math.round(candidate.bestScore * 0.98)}%` : '-%'}</div>
                                            </div>
                                            <div className="bg-[#1E3A8A] rounded-xl p-4 shadow-lg flex flex-col justify-between h-24 text-white">
                                                <span className="text-[9px] font-black text-blue-200/50 uppercase tracking-widest">UYUM DURUMU</span>
                                                <div className="text-[24px] font-black italic uppercase">
                                                    {candidate.bestScore > 80 ? 'GÜÇLÜ' : candidate.bestScore > 60 ? 'ORTA' : 'ZAYIF'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-5">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                                                <h3 className="text-[11px] font-black text-[#0F172A] uppercase tracking-[0.2em]">Detaylı STAR Değerlendirmesi</h3>
                                            </div>
                                            <div className="space-y-5">
                                                {[
                                                    { k: 'S', l: 'DURUM (SITUATION)', c: '#EFF6FF', tc: '#2563EB', r: starAnalysis.Situation.reason },
                                                    { k: 'T', l: 'GÖREV (TASK)', c: '#F0FDFA', tc: '#0D9488', r: starAnalysis.Task.reason },
                                                    { k: 'A', l: 'EYLEM (ACTION)', c: '#F5F3FF', tc: '#7C3AED', r: starAnalysis.Action.reason },
                                                    { k: 'R', l: 'SONUÇ (RESULT)', c: '#F0FDF4', tc: '#16A34A', r: starAnalysis.Result.reason }
                                                ].map((step, idx) => {
                                                    const { pos, neg } = parseFeedback(step.r);
                                                    return (
                                                        <div key={idx} className="flex gap-4 group">
                                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[14px] font-black shadow-sm shrink-0" style={{ backgroundColor: step.c, color: step.tc }}>{step.k}</div>
                                                            <div className="flex-1 space-y-2 pb-2">
                                                                <h4 className="text-[10px] font-black text-[#0F172A] uppercase tracking-wider">{step.l}</h4>
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                    {pos && <div className="bg-emerald-50/40 border border-emerald-100/50 p-2.5 rounded-lg">
                                                                        <div className="flex items-center gap-1 text-[8.5px] font-black text-emerald-600 uppercase mb-1"><ShieldCheck className="w-2.5 h-2.5" /> Pozitif</div>
                                                                        <p className="text-[11px] text-[#475569] leading-relaxed">{pos}</p>
                                                                    </div>}
                                                                    {neg && <div className="bg-red-50/40 border border-red-100/50 p-2.5 rounded-lg">
                                                                        <div className="flex items-center gap-1 text-[8.5px] font-black text-red-600 uppercase mb-1"><AlertCircle className="w-2.5 h-2.5" /> Negatif</div>
                                                                        <p className="text-[11px] text-[#475569] leading-relaxed">{neg}</p>
                                                                    </div>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeDetailTab === 'cv_match' && (
                                    <div className="space-y-6 animate-in fade-in duration-300">
                                        {/* ENHANCED CV SUMMARY BOX */}
                                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 relative overflow-visible group">
                                            <div className="absolute right-6 top-6 flex items-center gap-2">
                                                <span 
                                                    className="text-[9px] font-black px-3 py-1 rounded-lg border flex items-center gap-1.5 shadow-sm"
                                                    style={{ color: getSourceColor(candidate.source), backgroundColor: 'white', borderColor: `${getSourceColor(candidate.source)}40` }}
                                                >
                                                    <Link2 className="w-2.5 h-2.5" /> {getSourceLabel(candidate)} Kaynağı
                                                </span>
                                            </div>
                                            <Brain className="absolute -right-8 -top-8 w-32 h-32 text-[#1E3A8A]/5 group-hover:scale-110 transition-transform" />
                                            <div className="flex items-center gap-2 mb-3">
                                                <Target className="w-4 h-4 text-emerald-500" />
                                                <h3 className="text-[12px] font-black text-[#1E3A8A] uppercase tracking-[0.2em]">Kapsamlı Pozisyon Uyum Analizi</h3>
                                            </div>
                                            <div className="pr-40">
                                                <p className="text-[13px] text-[#475569] leading-relaxed font-medium italic">
                                                    "{candidate.aiAnalysis?.summary || `${candidate.name} teknik profili, ${candidate.position || 'Hedef Pozisyon'} pozisyonu ile %${Math.round(candidate.bestScore || 0)} uyum göstermektedir. Adayın tecrübesi ve yetkinlikleri analiz edilerek puanlanmıştır.`}"
                                                </p>
                                            </div>
                                            <div className="mt-4 flex gap-3">
                                                <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-blue-600 flex items-center gap-1.5 shadow-sm italic">
                                                    <Zap className="w-3 h-3 text-amber-500 fill-amber-500" /> %{Math.round(candidate.bestScore || 0)} Uyum Skoru Doğrulandı
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                                            <div className="md:col-span-8 space-y-5">
                                                <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-2">
                                                    <h3 className="text-[11px] font-black text-[#0F172A] uppercase tracking-[0.2em] flex items-center gap-2"><Clock className="w-4 h-4 text-blue-500" /> Kariyer Kronolojisi & Milestonelar</h3>
                                                </div>
                                                <div className="space-y-6 pl-2">
                                                    {careerHistory.map((exp, i) => (
                                                        <div key={i} className="relative pl-6 border-l-2 border-blue-50 pb-4 group">
                                                            <div className="absolute -left-[5.5px] top-0 w-2.5 h-2.5 rounded-full bg-white border-2 border-blue-600 shadow-sm" />
                                                            <div className="space-y-2">
                                                                <div className="flex justify-between items-start">
                                                                    <div>
                                                                        <h4 className="text-[14px] font-black text-[#1E3A8A] uppercase tracking-tight">{exp.role}</h4>
                                                                        <p className="text-[10px] font-bold text-[#64748B] uppercase">{exp.company}</p>
                                                                    </div>
                                                                    <span className="text-[10px] font-black text-[#94A3B8] bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">{exp.duration}</span>
                                                                </div>
                                                                <p className="text-[12px] text-[#475569] leading-relaxed font-medium bg-slate-50/50 p-2 rounded-lg border border-slate-100/50">{exp.desc}</p>
                                                                <div className="flex flex-wrap gap-2 mt-2">
                                                                    {exp.milestones?.map((m, idx) => (
                                                                        <span key={idx} className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[9px] font-black rounded-lg border border-emerald-100 shadow-sm"><Trophy className="w-2.5 h-2.5" /> {m}</span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="md:col-span-4 space-y-6">
                                                <div className="space-y-4">
                                                    <div className="flex items-center justify-between border-b pb-2">
                                                        <h3 className="text-[10px] font-black text-[#94A3B8] uppercase tracking-[0.3em]">Teknik Ekosistem</h3>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {(candidate.skills || ['Kubernetes', 'GoLang', 'React', 'Node.js', 'Redis', 'AWS']).map((s, i) => (
                                                            <span key={i} className="px-2.5 py-1 bg-white border border-[#E2E8F0] rounded-lg text-[9px] font-black text-[#475569] shadow-sm uppercase">{s}</span>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="space-y-4 pt-4 border-t border-slate-100">
                                                    <div className="flex items-center justify-between border-b pb-2">
                                                        <h3 className="text-[10px] font-black text-[#94A3B8] uppercase tracking-[0.3em]">Eğitim & Sertifika</h3>
                                                    </div>
                                                    <p className="text-[11px] font-bold text-[#475569] italic leading-relaxed">
                                                        {candidate.education || candidate.educationDetail || 'Yalova University – Computer Engineering'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeDetailTab === 'sessions' && (
                                    <div className="space-y-5 animate-in fade-in duration-300">
                                        <div className="flex items-center justify-between border-b pb-2">
                                            <h3 className="text-[11px] font-black uppercase text-[#0F172A] tracking-widest">Planlanmış ve Gerçekleşen Görüşmeler</h3>
                                            <button 
                                                onClick={() => {
                                                    setPreselectedInterviewData({ candidateId: candidate.id });
                                                    window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }));
                                                }}
                                                className="text-[9px] font-black text-blue-600 uppercase flex items-center gap-1 hover:underline hover:scale-105 transition-all"
                                            >
                                                <Plus className="w-3 h-3" /> MÜLAKAT PLANLA
                                            </button>
                                        </div>
                                        
                                        <div className="grid grid-cols-1 gap-3">
                                            {(candidate.interviewSessions || []).length > 0 ? (
                                                candidate.interviewSessions.map((session, sidx) => (
                                                    <div key={sidx} className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-sm hover:border-blue-300 transition-all flex items-center justify-between group">
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${session.status === 'live' ? 'bg-rose-50 border-rose-100 text-rose-600 animate-pulse' : 'bg-blue-50 border-blue-100 text-[#1E3A8A]'}`}>
                                                                <Video className="w-6 h-6" />
                                                            </div>
                                                            <div className="space-y-0.5">
                                                                <h4 className="text-[14px] font-black text-[#0F172A] uppercase tracking-tight">{session.title}</h4>
                                                                <div className="flex items-center gap-3">
                                                                    <span className="text-[10px] font-bold text-[#64748B] flex items-center gap-1"><Calendar className="w-3 h-3" /> {session.date}</span>
                                                                    <span className="text-[10px] font-bold text-[#64748B] flex items-center gap-1"><Clock className="w-3 h-3" /> {session.time}</span>
                                                                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100/50">{session.interviewer}</span>
                                                                    {/* Status Badge */}
                                                                    {session.status === 'live' ? (
                                                                        <span className="text-[8px] font-black bg-rose-50 text-rose-600 px-2 py-0.5 rounded-lg border border-rose-100 animate-pulse">CANLI</span>
                                                                    ) : session.status === 'completed' ? (
                                                                        <span className="text-[8px] font-black bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-lg border border-emerald-100">TAMAMLANDI</span>
                                                                    ) : session.status === 'cancelled' ? (
                                                                        <span className="text-[8px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg border border-slate-200">İPTAL</span>
                                                                    ) : (
                                                                        <span className="text-[8px] font-black bg-amber-50 text-amber-600 px-2 py-0.5 rounded-lg border border-amber-100">PLANLANDI</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            {session.status === 'live' ? (
                                                                <button 
                                                                    onClick={() => navigate(`/live-interview/${session.id}`)}
                                                                    className="bg-rose-600 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 shadow-lg shadow-rose-600/20"
                                                                >
                                                                    SEANSA KATIL
                                                                </button>
                                                            ) : session.status === 'completed' ? (
                                                                <button 
                                                                    onClick={() => navigate(`/interview-report/${session.id}`)}
                                                                    className="bg-[#1E3A8A] text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black shadow-lg shadow-blue-900/10 flex items-center gap-2"
                                                                >
                                                                    <Award className="w-3.5 h-3.5" /> RAPORU AÇ
                                                                </button>
                                                            ) : (
                                                                <div className="flex flex-col items-end">
                                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">DURUM</span>
                                                                    <span className="text-[11px] font-black text-amber-500 uppercase italic">PLANLANDI</span>
                                                                </div>
                                                            )}
                                                            <button 
                                                                onClick={() => {
                                                                    if (session.status === 'live') {
                                                                        navigate(`/live-interview/${session.id}`);
                                                                    } else {
                                                                        setPreselectedInterviewData({ candidateId: candidate.id, sessionId: session.id });
                                                                        window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }));
                                                                    }
                                                                }}
                                                                className="p-2 text-slate-200 hover:text-blue-500 transition-colors"
                                                                title="Mülakat Sayfasına Git"
                                                            >
                                                                <ExternalLink className="w-4 h-4" />
                                                            </button>
                                                            <button 
                                                                onClick={() => {
                                                                    setPreselectedInterviewData({ candidateId: candidate.id, session });
                                                                    window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }));
                                                                }}
                                                                className="p-2 text-slate-200 hover:text-blue-600 transition-colors"
                                                            >
                                                                <Edit3 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="py-16 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-[32px] bg-slate-50/20">
                                                    <div className="w-16 h-16 rounded-3xl bg-blue-50 flex items-center justify-center mb-4">
                                                        <Video className="w-8 h-8 text-blue-200" />
                                                    </div>
                                                    <p className="text-[13px] text-slate-400 font-bold italic uppercase tracking-wider">Aktif bir mülakat bulunamadı</p>
                                                    <button 
                                                        onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }))}
                                                        className="mt-4 px-6 py-2 bg-[#1E3A8A] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-blue-900/10"
                                                    >
                                                        Sıradaki Mülakatı Planla
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {activeDetailTab === 'interviews' && (
                                    <div className="space-y-5 animate-in fade-in duration-300">
                                        <div className="flex items-center justify-between border-b pb-2">
                                            <h3 className="text-[11px] font-black uppercase text-[#0F172A] tracking-widest">Süreç Yol Haritası</h3>
                                            <button 
                                                onClick={() => {
                                                    setPreselectedInterviewData({ candidateId: candidate.id });
                                                    window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }));
                                                }}
                                                className="text-[9px] font-black text-blue-600 uppercase flex items-center gap-1 hover:underline"
                                            >
                                                <Plus className="w-3 h-3" /> MÜLAKAT PLANLA
                                            </button>
                                        </div>
                                        <div className="space-y-3">
                                            {/* Static Initial Analysis Milestone */}
                                            <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
                                                <div className="p-4 flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100"><Brain className="w-5 h-5 text-blue-600" /></div>
                                                        <div>
                                                            <h4 className="text-[12px] font-black text-[#1E3A8A] uppercase tracking-tight">AI Detaylı CV Analizi</h4>
                                                            <span className="text-[9px] font-bold text-[#64748B] flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" /> Tamamlandı</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-[8px] font-black text-[#94A3B8] block uppercase">ANALİZ SKORU</span>
                                                        <span className="text-[14px] font-black text-emerald-600">%{Math.round(candidate.bestScore || 0)}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Dynamic Sessions Milestone */}
                                            {(candidate.interviewSessions || []).map((session, sidx) => (
                                                <div key={sidx} className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm hover:border-blue-200 transition-all group">
                                                    <div className="p-4 flex items-center justify-between">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center border border-emerald-100"><Play className="w-4 h-4 text-emerald-600" /></div>
                                                            <div>
                                                                <h4 className="text-[12px] font-black text-[#1E3A8A] uppercase tracking-tight">{session.title}</h4>
                                                                <span className="text-[9px] font-bold text-[#64748B] flex items-center gap-1">
                                                                    <Calendar className="w-2.5 h-2.5" /> {session.date} • {session.status === 'live' ? 'Canlı Yayında' : 'Planlandı'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                            <div className="flex items-center gap-3">
                                                                <button 
                                                                    onClick={() => {
                                                                        setPreselectedInterviewData({ candidateId: candidate.id, sessionId: session.id });
                                                                        window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }))
                                                                    }}
                                                                    className="opacity-0 group-hover:opacity-100 px-3 py-1 bg-black text-white rounded-lg text-[8px] font-black uppercase tracking-widest transition-all hover:bg-blue-600"
                                                                >
                                                                    YÖNET
                                                                </button>
                                                                <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase ${session.status === 'live' ? 'bg-rose-500 text-white animate-pulse shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
                                                                    {session.status === 'live' ? 'CANLI' : 'HAZIRDA'}
                                                                </span>
                                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                                    <button 
                                                                        onClick={() => {
                                                                            setPreselectedInterviewData({ candidateId: candidate.id, session });
                                                                            window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }));
                                                                        }}
                                                                        className="p-1.5 text-slate-400 hover:text-blue-600"
                                                                    >
                                                                        <Edit3 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    <button className="p-1.5 text-slate-400 hover:text-red-600">
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                    </div>
                                                </div>
                                            ))}

                                            {/* Static Future Milestone Example */}
                                            <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm opacity-50 grayscale">
                                                <div className="p-4 flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100"><Trophy className="w-4 h-4 text-slate-400" /></div>
                                                        <div>
                                                            <h4 className="text-[12px] font-black text-slate-400 uppercase tracking-tight">Final Kararı ve Teklif</h4>
                                                            <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1">Hedeflenen Aşama</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* COMPACT FOOTER */}
                            <div className="bg-white border-t border-[#F1F5F9] px-6 py-4 flex items-center justify-between sticky bottom-0">
                                <div className="flex gap-2">
                                    <button className="h-8 px-4 bg-[#F8FAFC] text-[#64748B] rounded-lg text-[9px] font-black uppercase border border-[#E2E8F0]">Yorum</button>
                                    <button className="h-8 px-4 text-[#EF4444] rounded-lg text-[9px] font-black uppercase border border-[#FEE2E2]">Ret</button>
                                </div>
                                <button className="h-9 px-6 bg-[#1E3A8A] text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-md flex items-center gap-2">Final Turuna Taşı <ArrowRight className="w-3.5 h-3.5" /></button>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center opacity-20"><Brain className="w-16 h-16 text-blue-900 mb-3 animate-pulse" /><h2 className="text-[11px] font-black uppercase tracking-[0.4em] text-blue-900">Yükleniyor</h2></div>
                    )}
                </main>
            </div>
        </div>
    );
}
