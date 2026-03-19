// src/components/InterviewHistory.jsx
import { useState } from 'react';
import {
    Clock, Zap, Users, Box, ChevronDown, TrendingUp, TrendingDown,
    Printer, FileText, CalendarDays, ShieldCheck, Brain, Video, Trash2, MessageSquare,
    Calendar, ExternalLink, AlertCircle, Target, Sparkles
} from 'lucide-react';

const TYPE_ICONS = { 
    technical: Zap, 
    culture: Users, 
    product: Box, 
    live_corporate: Video,
    initial: MessageSquare,
    final: Target
};

const STATUS_CONFIG = {
    planned: {
        label: 'BEKLENİYOR',
        color: 'text-blue-600',
        bg: 'bg-blue-50',
        border: 'border-blue-100'
    },
    completed: {
        label: 'TAMAMLANDI',
        color: 'text-emerald-600',
        bg: 'bg-emerald-50',
        border: 'border-emerald-100'
    },
    cancelled: {
        label: 'İPTAL EDİLDİ',
        color: 'text-slate-400',
        bg: 'bg-slate-50',
        border: 'border-slate-100'
    }
};

export default function InterviewHistory({ sessions = [], onStartSession, onDeleteSession }) {
    const [expandedId, setExpandedId] = useState(null);

    if (!sessions || sessions.length === 0) {
        return (
            <div className="p-16 rounded-[3rem] flex flex-col items-center justify-center text-center relative overflow-hidden bg-white border border-slate-100 group shadow-xl shadow-slate-200/50">
                <div className="w-24 h-24 rounded-[2rem] bg-slate-50 border border-slate-100 flex items-center justify-center mb-8 relative z-10 shadow-inner group-hover:scale-105 transition-transform duration-500">
                    <Video className="w-10 h-10 text-slate-200" />
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2 relative z-10 uppercase tracking-tighter italic">Henüz Oturum Yok</h3>
                <p className="text-[11px] text-slate-400 relative z-10 max-w-[280px] leading-relaxed font-black uppercase tracking-widest opacity-60">
                    Değerlendirme sürecini başlatmak için yeni bir mülakat planlayın.
                </p>
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50/50 rounded-full blur-[80px] -z-10" />
            </div>
        );
    }

    const sorted = [...sessions].sort((a, b) => new Date(b.date) - new Date(a.date));

    const handlePrintSession = (session) => {
        const win = window.open('', '_blank');
        const qaHtml = session.questions?.map((q, i) => `
            <div style="margin:20px 0;padding:24px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
                <div style="font-weight:bold;font-size:14px;margin-bottom:12px;color:#0f172a;display:flex;justify-content:space-between;">
                    <span>Soru ${i + 1}: ${q.question}</span>
                    <span style="color:#2563eb;">${q.aiScore ?? '-'} Puan</span>
                </div>
                <div style="font-size:13px;color:#334155;white-space:pre-wrap;line-height:1.6;margin-bottom:12px;">${q.answer || '(Cevap verilmedi)'}</div>
                ${q.aiFeedback ? `<div style="font-size:12px;color:#64748b;padding-top:12px;border-top:1px dashed #cbd5e1;font-style:italic;">AI Analizi: ${q.aiFeedback}</div>` : ''}
            </div>
        `).join('') || '';

        win.document.write(`<html><head><title>Mülakat Raporu - ${session.typeLabel}</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            body { font-family: 'Inter', sans-serif; padding: 60px; color: #010409; max-width: 800px; margin: 0 auto; background: #fff; line-height: 1.5; }
            h1 { font-size: 32px; font-weight: 900; letter-spacing: -0.04em; margin-bottom: 4px; font-style: italic; text-transform: uppercase; }
            .subtitle { font-size: 10px; color: #64748b; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3em; margin-bottom: 40px; }
            .meta-grid { display: grid; grid-cols: repeat(4, 1fr); gap: 15px; margin-bottom: 40px; }
            .meta-item { padding: 20px; background: #f8fbff; border-radius: 20px; border: 1px solid #e2e8f0; }
            .meta-label { font-size: 8px; font-weight: 900; color: #64748b; text-transform: uppercase; letter-spacing: 0.2em; margin-bottom: 6px; }
            .meta-value { font-size: 14px; font-weight: 700; color: #1e3a8a; }
            .score-card { background: #1e3a8a; color: #fff; padding: 30px; border-radius: 24px; margin-bottom: 40px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 20px 40px rgba(30,58,138,0.1); }
            .score-item { text-align: center; border-right: 1px solid rgba(255,255,255,0.1); flex: 1; }
            .score-item:last-child { border: none; }
            .score-label { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; opacity: 0.6; margin-bottom: 6px; }
            .score-value { font-size: 36px; font-weight: 900; font-style: italic; }
            .section-title { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; margin: 50px 0 20px 0; color: #64748b; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; }
            p { font-size: 14px; line-height: 1.8; color: #334155; margin-bottom: 20px; }
            .footer { margin-top: 80px; padding-top: 40px; border-top: 2px solid #f1f5f9; text-align: center; }
            .footer-text { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3em; color: #1e3a8a; }
        </style></head><body>
            <h1>MÜLAKAT ANALİZ RAPORU</h1>
            <div class="subtitle">Talent-Inn Core Architecture v2.4</div>
            
            <div class="meta-grid">
                <div class="meta-item"><div class="meta-label">OTURUM TÜRÜ</div><div class="meta-value">${session.typeLabel}</div></div>
                <div class="meta-item"><div class="meta-label">TARİH</div><div class="meta-value">${new Date(session.date).toLocaleDateString('tr-TR')}</div></div>
                <div class="meta-item"><div class="meta-label">DURUM</div><div class="meta-value">TAMAMLANDI</div></div>
            </div>

            <div class="score-card">
                <div class="score-item"><div class="score-label">AI GÜVEN SKORU</div><div class="score-value">%${session.aiOverallScore || '-'}</div></div>
                <div class="score-item"><div class="score-label">MÜLAKATÇI SKORU</div><div class="score-value">%${session.finalScore || '-'}</div></div>
            </div>

            <div class="section-title">STRATEJİK ÖZET</div>
            <p><strong>Değerlendirme Notu:</strong> ${session.aiVerdict || 'Analiz verisi mevcut değil.'}</p>
            <p style="font-style: italic; color: #1e3a8a; font-weight: 600;">"${session.aiSummary || ''}"</p>

            <div class="section-title">SORU VE CEVAP ANALİZİ</div>
            ${qaHtml}

            <div class="footer">
                <div class="footer-text">Talent-Inn AI Verification Platform</div>
            </div>
        </body></html>`);
        win.document.close();
        setTimeout(() => win.print(), 500);
    };

    return (
        <div className="space-y-6 italic">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#1e3a8a] mb-6 flex items-center gap-3 opacity-60">
                <Clock className="w-4 h-4" /> MÜLAKAT OTURUMLARI ({sorted.length})
            </h3>
            
            <div className="space-y-4">
                {sorted.map(session => {
                    const isExpanded = expandedId === session.id;
                    const isPlanned = session.status === 'planned';
                    const TypeIcon = TYPE_ICONS[session.type] || MessageSquare;

                    return (
                        <div key={session.id} className={`group rounded-[2rem] bg-white border border-slate-100 overflow-hidden transition-all duration-500 ${isExpanded ? 'shadow-2xl shadow-blue-900/10 border-blue-200' : 'hover:border-slate-200 shadow-lg shadow-slate-100/50'}`}>
                            <button
                                onClick={() => setExpandedId(isExpanded ? null : session.id)}
                                className="w-full p-6 flex items-center gap-6 hover:bg-slate-50 transition-all text-left relative"
                            >
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border transition-all ${isPlanned ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 border-blue-400' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                    <TypeIcon className="w-6 h-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-1.5">
                                        <h4 className="text-[15px] font-black text-slate-900 tracking-tight uppercase italic">{session.typeLabel || 'Tanımlanmamış Mülakat'}</h4>
                                        {session.status === 'live' ? (
                                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-50 text-rose-600 border border-rose-100 animate-pulse text-[9px] font-black">
                                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                                CANLI YAYIN
                                            </div>
                                        ) : session.status === 'completed' ? (
                                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 text-[9px] font-black">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                TAMAMLANDI
                                            </div>
                                        ) : session.status === 'cancelled' ? (
                                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 text-slate-500 border border-slate-200 text-[9px] font-black">
                                                <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                                İPTAL
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 text-[9px] font-black">
                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                                PLANLANDI
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-400 opacity-80">
                                        <div className="flex items-center gap-1.5">
                                            <Calendar className="w-3.5 h-3.5 text-blue-600" />
                                            {session.date ? new Date(session.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) : 'Belirtilmedi'}
                                        </div>
                                        {session.time && (
                                            <div className="flex items-center gap-1.5">
                                                <Clock className="w-3.5 h-3.5 text-blue-600" />
                                                Saat: {session.time}
                                            </div>
                                        )}
                                        {session.finalScore > 0 && (
                                             <div className="flex items-center gap-1.5 px-2 bg-blue-50 text-blue-600 rounded">
                                                 SKOR: %{session.finalScore}
                                             </div>
                                        )}
                                    </div>
                                </div>
                                <div className={`w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center transition-all duration-500 ${isExpanded ? 'rotate-180 bg-blue-50 border-blue-200 text-blue-600' : 'text-slate-300'}`}>
                                    <ChevronDown className="w-5 h-5" />
                                </div>
                            </button>

                            {isExpanded && (
                                <div className="px-8 pb-8 space-y-8 border-t border-slate-50 pt-8 animate-in fade-in slide-in-from-top-2 duration-300 bg-slate-50/30">
                                    {isPlanned ? (
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                                            <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm space-y-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100">
                                                        <Video className="w-5 h-5 text-blue-600" />
                                                    </div>
                                                    <div>
                                                        <h5 className="text-[12px] font-black text-slate-900 uppercase tracking-tight">Oturum Detayı</h5>
                                                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Mülakat Planlaması</p>
                                                    </div>
                                                </div>
                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Süre</span>
                                                        <span className="text-sm font-black text-slate-800">{session.duration || '30'} Dakika</span>
                                                    </div>
                                                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Platform</span>
                                                        <span className="text-sm font-black text-slate-800">Talent-Inn Live</span>
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={() => onStartSession?.(session)}
                                                    className="w-full h-14 rounded-2xl bg-blue-600 text-white font-black text-[12px] uppercase tracking-[0.2em] shadow-xl shadow-blue-500/20 hover:bg-blue-500 transition-all flex items-center justify-center gap-3 italic"
                                                >
                                                    OTURUMU BAŞLAT <ExternalLink className="w-4 h-4" />
                                                </button>
                                            </div>

                                            <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm flex flex-col justify-between">
                                                <div className="space-y-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center border border-amber-100">
                                                            <AlertCircle className="w-5 h-5 text-amber-600" />
                                                        </div>
                                                        <h5 className="text-[12px] font-black text-slate-900 uppercase tracking-tight">Eylem Merkezi</h5>
                                                    </div>
                                                    <p className="text-[11px] text-slate-500 font-bold leading-relaxed">Gerekirse oturumu erteleyebilir veya iptal edebilirsiniz. Adaya bildirim gönderilecektir.</p>
                                                </div>
                                                <div className="flex gap-4 mt-6">
                                                   <button
                                                        onClick={(e) => { e.stopPropagation(); onDeleteSession?.(session); }}
                                                        className="flex-1 h-12 rounded-xl border border-red-100 text-red-500 hover:bg-red-50 transition-all text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
                                                   >
                                                        <Trash2 className="w-4 h-4" /> İptal
                                                   </button>
                                                   <button 
                                                        className="flex-1 h-12 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
                                                   >
                                                        <Clock className="w-4 h-4" /> Ertele
                                                   </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-8">
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm text-center group/stat">
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">AI Analiz Skoru</p>
                                                    <div className="text-4xl font-black text-blue-600 italic tracking-tighter">%{session.aiOverallScore}</div>
                                                </div>
                                                <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm text-center">
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Komisyon Puanı</p>
                                                    <div className="text-4xl font-black text-slate-900 italic tracking-tighter">%{session.finalScore}</div>
                                                </div>
                                                <div className="bg-slate-900 p-6 rounded-[2.5rem] shadow-xl flex flex-col items-center justify-center">
                                                     <button 
                                                        onClick={() => handlePrintSession(session)}
                                                        className="flex flex-col items-center gap-2 text-white hover:text-blue-400 transition-colors"
                                                     >
                                                        <Printer className="w-6 h-6" />
                                                        <span className="text-[9px] font-black uppercase tracking-widest">PDF Rapor</span>
                                                     </button>
                                                </div>
                                            </div>

                                            {session.aiSummary && (
                                                <div className="bg-blue-600 rounded-[2.5rem] p-8 relative overflow-hidden group">
                                                    <Brain className="absolute -right-10 -bottom-10 w-44 h-44 text-white/5 group-hover:scale-110 transition-transform duration-1000" />
                                                    <div className="flex items-center gap-3 mb-4 relative z-10">
                                                        <ShieldCheck className="w-5 h-5 text-white/50" />
                                                        <h5 className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">AI Stratejik Değerlendirme</h5>
                                                    </div>
                                                    <p className="text-lg font-bold text-white leading-relaxed italic relative z-10">"{session.aiSummary}"</p>
                                                </div>
                                            )}

                                            <div className="space-y-6">
                                                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-4">Soru & Cevap Analizi</h5>
                                                <div className="grid grid-cols-1 gap-4">
                                                    {session.questions?.map((q, i) => (
                                                        <div key={i} className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm space-y-6 group/qa">
                                                            <div className="flex items-start justify-between">
                                                                <div className="flex-1">
                                                                    <div className="text-[9px] font-black text-blue-600 uppercase tracking-widest mb-4 flex items-center gap-3">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                                                                        Soru {i + 1}
                                                                    </div>
                                                                    <p className="text-xl font-black text-slate-900 tracking-tight mb-6 italic">"{q.question}"</p>
                                                                    <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 text-sm font-bold text-slate-600 leading-relaxed italic opacity-80">
                                                                        {q.answer || 'Cevap alınamadı.'}
                                                                    </div>
                                                                </div>
                                                                {q.aiScore && (
                                                                    <div className="w-20 h-20 rounded-3xl bg-slate-900 flex flex-col items-center justify-center shadow-2xl shrink-0 ml-8">
                                                                        <span className="text-[8px] font-black text-white/40 uppercase mb-1">SKOR</span>
                                                                        <span className="text-2xl font-black text-white italic">%{q.aiScore}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {q.aiFeedback && (
                                                                <div className="pt-4 border-t border-slate-50 flex items-start gap-4">
                                                                     <Sparkles className="w-4 h-4 text-blue-400 mt-0.5" />
                                                                     <p className="text-[11px] font-bold text-slate-400 uppercase leading-relaxed">{q.aiFeedback}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            
                                            <div className="flex justify-between items-center">
                                                 <button onClick={(e) => { e.stopPropagation(); onDeleteSession?.(session); }} className="text-[10px] font-black text-red-400 hover:text-red-600 transition-colors uppercase tracking-[0.2em] flex items-center gap-2">
                                                     <Trash2 className="w-4 h-4" /> Oturumu Kayıtlarını Sil
                                                 </button>
                                                 <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Talent-Inn Analytics Verified</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
