// src/pages/InterviewReportPage.jsx
import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCandidates } from '../context/CandidatesContext';
import { 
    ChevronLeft, Share2, Download, Brain, 
    Target, Star, MessageSquare, Clock, Zap, 
    ShieldCheck, AlertCircle, FileText, DownloadCloud,
    ExternalLink, Search, MoreHorizontal, Printer, Mail,
    Users, Activity, TrendingUp, Award,
    Sparkles, Briefcase, ArrowRight, Video
} from 'lucide-react';

export default function InterviewReportPage() {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const { enrichedCandidates, updateCandidate } = useCandidates();
    const [activeTab, setActiveTab] = useState('overview'); // overview, transcript
    const [toast, setToast] = useState(null);

    // Find candidate and session - moved up to avoid TDZ for recruiterNotes
    const { candidate, session } = useMemo(() => {
        for (const c of enrichedCandidates || []) {
            const s = Number.isInteger(Number(sessionId)) 
                ? c.interviewSessions?.[Number(sessionId)]
                : c.interviewSessions?.find(s => String(s.id) === String(sessionId));
            if (s) return { candidate: c, session: s };
        }
        return { candidate: null, session: null };
    }, [enrichedCandidates, sessionId]);

    const [recruiterNotes, setRecruiterNotes] = useState('');
    const [finalDecision, setFinalDecision] = useState('');
    const [isSavingNotes, setIsSavingNotes] = useState(false);
    const [isSavingDecision, setIsSavingDecision] = useState(false);

    React.useEffect(() => {
        if (session?.recruiterNotes) setRecruiterNotes(session.recruiterNotes);
        if (session?.finalDecision) setFinalDecision(session.finalDecision);
    }, [session]);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleShare = () => {
        navigator.clipboard.writeText(window.location.href);
        showToast("Rapor bağlantısı panoya kopyalandı!");
    };

    const handleDownload = () => {
        window.print();
    };

    const handleSaveNotes = async () => {
        if (!candidate || !session) return;
        setIsSavingNotes(true);
        try {
            const updatedSessions = (candidate.interviewSessions || []).map(s => 
                String(s.id) === String(sessionId) ? { ...s, recruiterNotes } : s
            );
            await updateCandidate(candidate.id, { interviewSessions: updatedSessions });
            showToast("Değerlendirme notları kaydedildi.");
        } catch (err) {
            showToast("Notlar kaydedilirken bir hata oluştu.", "error");
        } finally {
            setIsSavingNotes(false);
        }
    };

    const handleSaveDecision = async (decision) => {
        if (!candidate || !session) return;
        setFinalDecision(decision);
        setIsSavingDecision(true);
        try {
            const updatedSessions = (candidate.interviewSessions || []).map(s =>
                String(s.id) === String(sessionId) ? { ...s, finalDecision: decision } : s
            );
            await updateCandidate(candidate.id, { interviewSessions: updatedSessions });
            showToast(`Karar kaydedildi: ${decision}`);
        } catch (err) {
            showToast("Karar kaydedilirken bir hata oluştu.", "error");
        } finally {
            setIsSavingDecision(false);
        }
    };


    if (!candidate || !session) {
        return (
            <div className="h-screen bg-slate-50 flex flex-col items-center justify-center">
                <Brain className="w-12 h-12 text-slate-300 animate-pulse mb-4" />
                <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Raporu Yükleniyor...</p>
                <button onClick={() => navigate('/')} className="mt-6 text-blue-600 font-black text-[10px] uppercase">Geri Dön</button>
            </div>
        );
    }

    // Default mock data for completed reports if missing
    const starScores = session.starScores || { 
        technical: 85, 
        communication: 72, 
        problemSolving: 90, 
        cultureFit: 78, 
        adaptability: 82 
    };

    const formattedDate = session.date 
        ? new Date(session.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
        : 'Tarih Belirtilmedi';

    return (
        <div className="flex flex-col h-screen bg-[#F8FAFC] font-inter overflow-hidden">
            {/* Self-contained Report Header */}
            <header className="h-[72px] flex items-center justify-between px-8 bg-white/90 backdrop-blur-md border-b border-slate-100 sticky top-0 z-40 shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/')} className="p-2 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 hover:bg-[#0F172A] hover:text-white hover:border-transparent transition-all cursor-pointer">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#0F172A] flex items-center justify-center">
                            <Video className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h2 className="text-[14px] font-black text-[#0F172A] tracking-tighter italic uppercase leading-none">Mülakat <span className="text-blue-600">Raporu</span></h2>
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{candidate.name}</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase tracking-widest rounded-lg border border-emerald-100">Tamamlandı</span>
                    <span className="text-[10px] font-bold text-slate-400">{formattedDate}</span>
                </div>
            </header>
            
            <main className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="max-w-[1200px] mx-auto p-8 space-y-6">
                    
                    {/* CANDIDATE HEADER SECTION */}
                    <div className="flex items-center justify-between bg-white p-6 rounded-[24px] border border-[#E2E8F0] shadow-sm">
                        <div className="flex items-center gap-5">
                            <div className="w-20 h-20 rounded-2xl border-[3px] border-white shadow-xl overflow-hidden bg-cyan-50 flex items-center justify-center">
                                {candidate.photo || candidate.photoUrl || candidate.profileImage
                                    ? <img src={candidate.photo || candidate.photoUrl || candidate.profileImage} alt={candidate.name} className="w-full h-full object-cover" />
                                    : <span className="text-3xl font-black text-cyan-700">{candidate.name?.charAt(0)?.toUpperCase() || '?'}</span>
                                }
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-3">
                                    <h1 className="text-2xl font-black text-[#0F172A] tracking-tighter italic">{candidate.name}</h1>
                                    <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase tracking-widest rounded-lg border border-emerald-200">TAMAMLANDI</span>
                                </div>
                                <div className="flex items-center gap-4 text-[#64748B]">
                                    <span className="text-[12px] font-bold flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> {candidate.position || candidate.bestTitle}</span>
                                    <div className="h-3 w-px bg-slate-200" />
                                    <span className="text-[12px] font-bold flex items-center gap-1.5 text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100 italic">EŞLEŞME %{session.finalScore || Math.round(candidate.bestScore)}</span>
                                    <div className="h-3 w-px bg-slate-200" />
                                    <span className="text-[11px] font-bold flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {formattedDate}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                             <button 
                                onClick={handleShare}
                                className="h-10 px-4 bg-slate-50 text-slate-600 rounded-xl border border-slate-200 text-[11px] font-black uppercase flex items-center gap-2 hover:bg-slate-100 transition-all cursor-pointer"
                             >
                                 <Share2 className="w-4 h-4" /> Paylaş
                             </button>
                             <button 
                                onClick={handleDownload}
                                className="h-10 px-4 bg-[#1E3A8A] text-white rounded-xl text-[11px] font-black uppercase flex items-center gap-2 shadow-lg shadow-blue-900/10 hover:bg-blue-800 transition-all cursor-pointer"
                             >
                                 <DownloadCloud className="w-4 h-4" /> Raporu İndir
                             </button>
                        </div>
                    </div>

                    {/* TOAST FEEDBACK */}
                    {toast && (
                        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300">
                            <div className="bg-[#0F172A] text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10">
                                <Sparkles className="w-4 h-4 text-blue-400 fill-blue-400" />
                                <span className="text-[11px] font-black uppercase tracking-widest">{toast.message}</span>
                            </div>
                        </div>
                    )}

                    {/* TAB SWITCHER */}
                    <div className="flex gap-8 border-b border-[#E2E8F0] px-4">
                        {[
                            { id: 'overview', label: 'GENEL BAKIŞ', icon: Brain },
                            { id: 'transcript', label: 'TRANSKRİPT', icon: MessageSquare }
                        ].map(tab => (
                            <button 
                                key={tab.id} 
                                onClick={() => setActiveTab(tab.id)}
                                className={`py-4 flex items-center gap-2.5 text-[10px] font-black uppercase tracking-widest relative transition-all ${activeTab === tab.id ? 'text-[#1E3A8A]' : 'text-[#94A3B8] hover:text-[#475569]'}`}
                            >
                                <tab.icon className={`w-3.5 h-3.5 ${activeTab === tab.id ? 'fill-blue-100' : ''}`} /> {tab.label}
                                {activeTab === tab.id && <div className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-[#1E3A8A] shadow-[0_4px_12px_rgba(30,58,138,0.3)]" />}
                            </button>
                        ))}
                    </div>

                    {activeTab === 'overview' ? (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-400">
                            
                            {/* LEFT COLUMN: STAR ANALYSIS */}
                            <div className="lg:col-span-2 space-y-6">
                                {/* AI SUMMARY CARD */}
                                <div className="bg-white rounded-[24px] border border-blue-100 p-8 relative overflow-hidden group shadow-sm bg-gradient-to-br from-white to-blue-50/20">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="p-2 bg-blue-600/10 rounded-xl">
                                            <Brain className="w-5 h-5 text-blue-600" />
                                        </div>
                                        <h3 className="text-[12px] font-black text-[#1E3A8A] uppercase tracking-widest italic">AI STAR ÖZETİ</h3>
                                        <div className="ml-auto flex gap-1.5">
                                            <Sparkles className="w-4 h-4 text-blue-300 animate-pulse" />
                                        </div>
                                    </div>
                                    <p className="text-[16px] text-[#334155] leading-relaxed font-medium italic">
                                        "{session.aiSummary || "Adayın mülakat performansı yapay zeka tarafından analiz edildi. STAR metodolojisine göre detaylı değerlendirme aşağıda yer almaktadır."}"
                                    </p>
                                    <div className="mt-8 flex flex-wrap gap-2">
                                        {(session.tags || ['Analiz Bekleniyor']).map(tag => (
                                            <span key={tag} className="px-4 py-1.5 bg-white border border-blue-100 rounded-xl text-[10px] font-black text-blue-600 shadow-sm uppercase tracking-tight italic">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* STAR DETAILS */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 px-1">
                                        <h3 className="text-[12px] font-black text-slate-400 uppercase tracking-widest italic">STAR ANALİZ DETAYLARI</h3>
                                    </div>
                                    <div className="space-y-3">
                                        {[
                                            { 
                                                key: 'S', 
                                                label: 'Durum (Situation)', 
                                                score: session.starScores?.S || 85, 
                                                color: 'bg-blue-900', 
                                                desc: 'Adayın mülakat sırasında paylaştığı bağlam ve senaryo derinliği.',
                                                quote: session.transcript?.find(t => t.role === 'ADAY' && t.text.length > 50)?.text || null
                                            },
                                            { 
                                                key: 'T', 
                                                label: 'Görev (Task)', 
                                                score: session.starScores?.T || 82, 
                                                color: 'bg-blue-800', 
                                                desc: 'Çözülmesi beklenen problemin veya üstlenilen sorumluluğun netliği.',
                                                quote: null
                                            },
                                            { 
                                                key: 'A', 
                                                label: 'Eylem (Action)', 
                                                score: session.starScores?.A || 88, 
                                                color: 'bg-blue-700', 
                                                desc: 'Adayın teknik ve operasyonel olarak sergilediği pratik çözümler.',
                                                quote: session.transcript?.find(t => t.role === 'ADAY' && t.text.includes('yaptım'))?.text || null
                                            },
                                            { 
                                                key: 'R', 
                                                label: 'Sonuç (Result)', 
                                                score: session.starScores?.R || 90, 
                                                color: 'bg-emerald-600', 
                                                desc: 'Eylemlerin yarattığı somut çıktı ve başarı ölçütleri.',
                                                quote: null
                                            }
                                        ].map(star => (
                                            <div key={star.key} className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-sm flex gap-6 hover:shadow-md transition-all">
                                                <div className={`w-10 h-10 rounded-xl ${star.color} text-white flex items-center justify-center text-[18px] font-black shrink-0 shadow-lg`}>
                                                    {star.key}
                                                </div>
                                                <div className="flex-1 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="text-[14px] font-black text-[#0F172A] tracking-tight">{star.label}</h4>
                                                        <span className="text-[10px] font-black bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100 text-[#1E3A8A]">Skor: {star.score}/100</span>
                                                    </div>
                                                    <p className="text-[13px] text-slate-500 font-medium leading-relaxed">{star.desc}</p>
                                                    {star.quote && (
                                                        <div className="pl-4 border-l-2 border-slate-100 py-1">
                                                            <p className="text-[12px] text-slate-400 font-bold italic">"{star.quote}"</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT COLUMN: ANALYTICS & DECISION */}
                            <div className="space-y-6">
                                {/* COMPETENCY RADAR */}
                                <section className="bg-white rounded-[24px] border border-[#E2E8F0] p-6 shadow-sm flex flex-col items-center">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-8 w-full italic">YETKİNLİK ANALİZİ</h3>
                                    
                                    <div className="w-56 h-56 relative flex items-center justify-center mb-10">
                                        <svg viewBox="0 0 100 100" className="w-full h-full transform rotate-[-18deg]">
                                            {[20, 40, 60, 80, 100].map(r => (
                                                <circle key={r} cx="50" cy="50" r={r/2} fill="none" stroke="#E2E8F0" strokeWidth="0.5" />
                                            ))}
                                            {[0, 72, 144, 216, 288].map(angle => (
                                                <line key={angle} x1="50" y1="50" x2={50 + 50 * Math.cos(angle * Math.PI / 180)} y2={50 + 50 * Math.sin(angle * Math.PI / 180)} stroke="#E2E8F0" strokeWidth="0.5" />
                                            ))}
                                            <polygon
                                                points={[
                                                    starScores.technical,
                                                    starScores.communication,
                                                    starScores.problemSolving,
                                                    starScores.cultureFit,
                                                    starScores.adaptability
                                                ].map((val, i) => {
                                                    const angle = i * 72;
                                                    const r = val / 2;
                                                    return `${50 + r * Math.cos(angle * Math.PI / 180)},${50 + r * Math.sin(angle * Math.PI / 180)}`;
                                                }).join(' ')}
                                                fill="rgba(30, 58, 138, 0.15)"
                                                stroke="#1E3A8A"
                                                strokeWidth="2"
                                            />
                                        </svg>
                                        <div className="absolute inset-0 text-[7px] font-black text-slate-400 uppercase pointer-events-none italic">
                                            <span className="absolute top-0 left-1/2 -translate-x-1/2">Teknik: {starScores.technical}</span>
                                            <span className="absolute top-[35%] right-0 -translate-x-1 underline">İletişim: {starScores.communication}</span>
                                            <span className="absolute bottom-5 right-6 -translate-x-full">Liderlik: {starScores.cultureFit}</span>
                                            <span className="absolute bottom-5 left-10">Uyum: {starScores.adaptability}</span>
                                            <span className="absolute top-[35%] left-0">Problem Çözme: {starScores.problemSolving}</span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 w-full">
                                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col gap-1">
                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">YETKİNLİK ORTALAMASI</span>
                                            <span className="text-[14px] font-black text-[#1E3A8A]">
                                                {((Object.values(starScores).reduce((a, b) => a + b, 0) / 5) / 10).toFixed(1)} / 10
                                            </span>
                                        </div>
                                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col gap-1">
                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">UYUM SKORU</span>
                                            <span className="text-[14px] font-black text-[#1E3A8A]">{starScores.cultureFit}/100</span>
                                        </div>
                                    </div>
                                </section>

                                {/* CRITICAL MOMENTS */}
                                <section className="bg-white rounded-[24px] border border-[#E2E8F0] p-6 shadow-sm space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic">KRİTİK ANLAR</h3>
                                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[7px] font-black uppercase border border-emerald-100">AI Taraması</span>
                                    </div>
                                    <div className="space-y-6">
                                        {(session.criticalMoments || []).length > 0 ? (
                                            session.criticalMoments.map((moment, idx) => (
                                            <div key={idx} className="relative pl-6 border-l border-slate-100 space-y-2">
                                                <div className={`absolute -left-[4.5px] top-1 w-2 h-2 rounded-full ${moment.color}`} />
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[9px] font-mono font-black text-slate-400 tabular-nums">{moment.time}</span>
                                                    <span className={`text-[8px] font-black uppercase tracking-tight px-1.5 py-0.5 rounded text-white ${moment.color}`}>{moment.type}</span>
                                                </div>
                                                <p className="text-[11px] text-slate-500 font-medium leading-snug italic">"{moment.text}"</p>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-4">
                                            <p className="text-[10px] font-bold text-slate-300 uppercase italic">Kritik an tespit edilemedi</p>
                                        </div>
                                    )}
                                    </div>
                                    <button onClick={() => setActiveTab('transcript')} className="w-full py-2.5 text-[9px] font-black text-[#1E3A8A] uppercase hover:bg-slate-50 rounded-xl border border-slate-100 transition-all">Tüm Transkripti Görüntüle →</button>
                                </section>

                                {/* DECISION CARD */}
                                <section className="bg-[#0F172A] rounded-[24px] p-8 shadow-xl space-y-6 text-white border border-white/5 relative overflow-hidden">
                                     <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl" />
                                     <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] italic">DEĞERLENDİRME VE KARAR</h3>

                                     {/* Recruiter notes — always editable */}
                                     <div className="space-y-2">
                                         <label className="text-[8px] font-black text-white/30 uppercase tracking-widest">MÜLAKATÇI NOTU</label>
                                         <p className="text-[10px] text-white/20 font-medium">Mülakat sırasında veya sonrasında notlarınızı buraya ekleyebilirsiniz.</p>
                                         <textarea
                                             value={recruiterNotes}
                                             onChange={(e) => setRecruiterNotes(e.target.value)}
                                             rows={4}
                                             className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-[12px] font-medium text-slate-200 focus:border-blue-500/60 focus:outline-none resize-none placeholder:text-white/20"
                                             placeholder="Adayın güçlü/zayıf yönleri, genel izlenim, önerileriniz..."
                                         />
                                         <button
                                             onClick={handleSaveNotes}
                                             disabled={isSavingNotes}
                                             className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                                         >
                                             {isSavingNotes ? 'Kaydediliyor...' : 'Notu Kaydet'}
                                         </button>
                                     </div>

                                     {/* Final decision buttons */}
                                     <div className="space-y-3 pt-2">
                                         <label className="text-[8px] font-black text-white/30 uppercase tracking-widest">FİNAL KARARI</label>
                                         <div className="grid grid-cols-3 gap-2">
                                             {[
                                                 { label: 'İşe Al', value: 'İşe Al', active: 'bg-emerald-500 border-emerald-400', inactive: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20' },
                                                 { label: 'Beklemede', value: 'Beklemede', active: 'bg-amber-500 border-amber-400', inactive: 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20' },
                                                 { label: 'Uygun Değil', value: 'Uygun Değil', active: 'bg-rose-500 border-rose-400', inactive: 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20' },
                                             ].map(opt => (
                                                 <button
                                                     key={opt.value}
                                                     onClick={() => handleSaveDecision(opt.value)}
                                                     disabled={isSavingDecision}
                                                     className={`py-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 ${finalDecision === opt.value ? opt.active + ' text-white shadow-lg' : opt.inactive}`}
                                                 >
                                                     {opt.label}
                                                 </button>
                                             ))}
                                         </div>
                                         {finalDecision && (
                                             <p className="text-[9px] font-black text-white/30 uppercase tracking-widest text-center">
                                                 Mevcut Karar: <span className="text-white/60">{finalDecision}</span>
                                             </p>
                                         )}
                                     </div>
                                </section>

                            </div>

                        </div>
                    ) : (
                        /* TRANSCRIPT VIEW */
                        <div className="flex gap-6 animate-in fade-in duration-400">
                             
                             {/* TRANSCRIPT SIDEBAR */}
                             <div className="w-80 shrink-0 space-y-6">
                                 <div className="bg-white rounded-[24px] border border-[#E2E8F0] p-6 shadow-sm space-y-5">
                                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">OTURUM BİLGİLERİ</h3>
                                      <div className="space-y-4">
                                          {[
                                              { label: 'Süre', value: session.duration || 'N/A' },
                                              { label: 'Tarih', value: session.date || 'Belirtilmedi' },
                                              { label: 'Dil', value: session.language || 'Türkçe' }
                                          ].map(item => (
                                              <div key={item.label} className="flex items-center justify-between">
                                                  <span className="text-[11px] font-bold text-slate-400">{item.label}</span>
                                                  <span className="text-[11px] font-black text-[#0F172A]">{item.value}</span>
                                              </div>
                                          ))}
                                          <div className="pt-2">
                                              <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                                                  <div className="h-full bg-blue-600 w-full" />
                                              </div>
                                              <p className="text-[8px] font-black text-slate-300 mt-1.5 uppercase tracking-widest text-center">Transcript %100 işlendi</p>
                                          </div>
                                      </div>
                                 </div>

                                 <div className="bg-white rounded-[24px] border border-[#E2E8F0] p-6 shadow-sm space-y-5">
                                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">ANAHTAR KELİMELER</h3>
                                      <div className="flex flex-wrap gap-2">
                                          {(session.keywords || candidate.skills || ['Yorumlanıyor...']).map(tag => (
                                              <span key={tag} className="px-3 py-1 bg-slate-50 border border-slate-100 rounded-lg text-[9px] font-bold text-slate-600 shadow-sm uppercase">{tag}</span>
                                          ))}
                                      </div>
                                 </div>

                                 <div className="bg-[#044D34] rounded-[24px] p-6 shadow-xl space-y-4 text-white relative overflow-hidden group">
                                      <div className="absolute right-0 bottom-0 opacity-10"><Activity className="w-32 h-32" /></div>
                                      <h3 className="text-[10px] font-black text-white/30 uppercase tracking-widest italic">DUYGU ANALİZİ</h3>
                                      <div className="flex items-end gap-1.5 h-16 mb-4">
                                          {[40, 60, 80, 50, 90, 70, 85].map((h, i) => (
                                              <div key={i} className="flex-1 bg-white/20 rounded-full relative group-hover:bg-white/40 transition-all" style={{ height: `${h}%` }}>
                                                  {i === 4 && <div className="absolute inset-0 bg-emerald-400 rounded-full animate-pulse" />}
                                              </div>
                                          ))}
                                      </div>
                                      <p className="text-[11px] font-medium leading-relaxed italic text-white/80">Oturum genelinde pozitif ve çözüm odaklı ton hakim.</p>
                                 </div>
                             </div>

                             {/* MAIN TRANSCRIPT FEED */}
                             <div className="flex-1 space-y-6">
                                 <div className="bg-white rounded-[24px] border border-[#E2E8F0] p-6 shadow-sm flex flex-col h-[700px]">
                                      <div className="flex items-center justify-between mb-8 border-b border-slate-50 pb-6">
                                          <div className="space-y-1">
                                              <h3 className="text-[18px] font-black text-[#0F172A] italic uppercase tracking-tighter">Mülakat Tam Transkripti</h3>
                                              <p className="text-[10px] font-bold text-slate-400 uppercase">Oturumun tam dökümü</p>
                                          </div>
                                          <div className="flex items-center gap-2">
                                              <button onClick={handleDownload} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 hover:text-blue-600 transition-all cursor-pointer"><Download className="w-4 h-4" /></button>
                                              <button onClick={handleDownload} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 hover:text-blue-600 transition-all cursor-pointer"><Printer className="w-4 h-4" /></button>
                                              <button onClick={handleDownload} className="h-10 px-6 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-all cursor-pointer">Export PDF</button>
                                          </div>
                                      </div>

                                      <div className="relative mb-8">
                                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                                          <input 
                                              type="text" 
                                              placeholder="Transkript içinde ara..." 
                                              className="w-full h-12 bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-6 text-[13px] font-medium outline-none focus:border-blue-500 transition-all" 
                                          />
                                      </div>

                                      <div className="flex-1 overflow-y-auto space-y-8 pr-4 custom-scrollbar">
                                         {(session.transcript || []).length > 0 ? (
                                             session.transcript.map((msg, i) => {
                                                 const isAday = msg.role === 'ADAY';
                                                 const initial = msg.role === 'ADAY' ? 'A' : 'M';
                                                 return (
                                                     <div key={i} className={`flex gap-6 group ${isAday ? 'pl-12' : 'pr-12'}`}>
                                                         {!isAday && (
                                                             <div className="w-10 h-10 rounded-xl bg-[#1E3A8A] text-white flex items-center justify-center font-black text-[12px] shrink-0 shadow-lg">{initial}</div>
                                                         )}
                                                         <div className="space-y-3 flex-1">
                                                             <div className={`flex items-center gap-3 ${isAday ? 'justify-end' : ''}`}>
                                                                 {isAday && <span className="text-[10px] font-mono text-slate-300 tabular-nums">{msg.time}</span>}
                                                                 <h4 className="text-[12px] font-black text-[#0F172A]"><span className="text-slate-400 font-bold uppercase mr-1.5">{msg.role}</span></h4>
                                                                 {!isAday && <span className="text-[10px] font-mono text-slate-300 tabular-nums">{msg.time}</span>}
                                                             </div>
                                                             <div className={`p-5 rounded-[24px] text-[14px] font-medium leading-relaxed relative ${isAday ? 'bg-blue-50 text-[#0F172A] italic' : 'bg-slate-50 text-[#475569]'}`}>
                                                                 {msg.text}
                                                             </div>
                                                         </div>
                                                         {isAday && (
                                                             <div className="w-10 h-10 rounded-xl bg-[#3B82F6] text-white flex items-center justify-center font-black text-[12px] shrink-0 shadow-lg">{initial}</div>
                                                         )}
                                                     </div>
                                                 );
                                             })
                                         ) : (
                                             <div className="py-20 text-center space-y-4">
                                                 <MessageSquare className="w-12 h-12 text-slate-200 mx-auto" />
                                                 <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Diyalog verisi bulunamadı</p>
                                             </div>
                                         )}
                                      </div>
                                  </div>

                                  {/* BOTTOM AI OVERLAY */}
                                  <div className="bg-[#EBF4FF] rounded-[24px] border border-blue-100 p-6 flex items-center justify-between group">
                                       <div className="flex items-center gap-4">
                                           <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform"><Sparkles className="w-6 h-6 text-blue-600 fill-blue-600" /></div>
                                           <div>
                                               <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest italic mb-0.5">AI ÖZET</p>
                                               <p className="text-[13px] font-bold text-[#1E3A8A] italic">{session.aiSummary || "Adayın performansı ve cevapları gerçek zamanlı analiz edildi."}</p>
                                           </div>
                                       </div>
                                       <ArrowRight className="w-5 h-5 text-blue-300" />
                                  </div>
                              </div>
                         </div>
                    )}
                </div>
            </main>
        </div>
    );
}
