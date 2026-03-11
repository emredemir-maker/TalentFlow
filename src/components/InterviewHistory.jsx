// src/components/InterviewHistory.jsx
// Shows historical interview sessions for a candidate
import { useState, useRef } from 'react';
import {
    Clock, Zap, Users, Box, ChevronDown, TrendingUp, TrendingDown,
    Printer, MessageSquare, FileText, CalendarDays, User, ShieldCheck, Brain, Video
} from 'lucide-react';

const TYPE_ICONS = { technical: Zap, culture: Users, product: Box, live_corporate: Video };
const TYPE_COLORS = { technical: 'cyan-500', culture: 'emerald-500', product: 'violet-500', live_corporate: 'violet-500' };

export default function InterviewHistory({ sessions = [], onStartSession }) {
    const [expandedId, setExpandedId] = useState(null);

    if (!sessions || sessions.length === 0) {
        return (
            <div className="p-8 rounded-[2rem] flex flex-col items-center justify-center text-center relative overflow-hidden bg-bg-primary border border-border-subtle group shadow-inner">
                <div className="absolute inset-0 bg-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl font-black"></div>
                <div className="w-16 h-16 rounded-3xl bg-bg-secondary border border-border-subtle flex items-center justify-center mb-5 relative z-10 group-hover:scale-110 transition-transform duration-500 shadow-xl">
                    <MessageSquare className="w-8 h-8 text-cyan-500/60 group-hover:text-cyan-500 transition-colors duration-500" />
                </div>
                <p className="text-sm font-black text-text-primary mb-2 relative z-10 uppercase tracking-widest">Kayıt Bulunamadı</p>
                <p className="text-[11px] text-text-muted relative z-10 max-w-[240px] leading-relaxed font-bold opacity-60 uppercase tracking-tighter">Yeni bir değerlendirme süreci başlatmak için ilk mülakat oturumunu oluşturun.</p>
            </div>
        );
    }

    const sorted = [...sessions].sort((a, b) => new Date(b.date) - new Date(a.date));

    const handlePrintSession = (session) => {
        const win = window.open('', '_blank');
        const qaHtml = session.questions?.map((q, i) => `
            <div style="margin:12px 0;padding:12px;background:#f9f9f9;border-left:3px solid #4361ee;">
                <div style="font-weight:bold;font-size:13px;margin-bottom:6px;">Q${i + 1}: ${q.question} (Puan: ${q.aiScore ?? '-'})</div>
                <div style="font-size:12px;color:#444;white-space:pre-wrap;">${q.answer || '(Cevap verilmedi)'}</div>
                ${q.aiFeedback ? `<div style="font-size:11px;color:#666;margin-top:4px;font-style:italic;">AI: ${q.aiFeedback}</div>` : ''}
            </div>
        `).join('') || '';

        win.document.write(`<html><head><title>Mülakat - ${session.typeLabel}</title>
        <style>
            body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #1a1a2e; }
            h1 { font-size: 22px; border-bottom: 2px solid #000; padding-bottom: 8px; }
            h2 { font-size: 16px; margin-top: 24px; color: #333; }
            .meta { display: flex; gap: 32px; margin: 16px 0; font-size: 13px; }
            .meta span { font-weight: bold; }
            .score-box { display: inline-block; padding: 4px 12px; background: #4361ee; color: #fff; font-weight: bold; border-radius: 6px; }
        </style></head><body>
            <h1>MÜLAKAT RAPORU</h1>
            <div class="meta">
                <div>Tür: <span>${session.typeLabel}</span></div>
                <div>Tarih: <span>${new Date(session.date).toLocaleDateString('tr-TR')}</span></div>
                <div>Pozisyon: <span>${session.positionTitle || '-'}</span></div>
            </div>
            <h2>Sonuç</h2>
            <p>AI Puanı: <span class="score-box">${session.aiOverallScore}/100</span> | Son Puan: <span class="score-box">${session.finalScore}/100</span></p>
            <p>${session.aiVerdict || ''}</p>
            <p style="color:#444;font-size:13px;">${session.aiSummary || ''}</p>
            <h2>Soru & Cevaplar</h2>
            ${qaHtml}
            ${session.interviewerNotes ? `<div style="margin-top:20px;padding:12px;background:#fffbeb;border:1px solid #fbbf24;border-radius:6px;font-size:12px;"><strong>Mülakatçı Notları:</strong><br/>${session.interviewerNotes}</div>` : ''}
            <div style="margin-top:60px;text-align:center;"><div style="width:200px;border-top:1px solid #000;margin:0 auto;"></div><p style="font-size:11px;margin-top:4px;">İMZA / ONAY</p></div>
        </body></html>`);
        win.document.close();
        setTimeout(() => win.print(), 500);
    };

    return (
        <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-2 flex items-center gap-2 opacity-70">
                <Clock className="w-3.5 h-3.5" /> Mülakat Geçmişi ({sorted.length})
            </h3>
            {sorted.map(session => {
                const isExpanded = expandedId === session.id;
                const isPlanned = session.status === 'planned';
                const TypeIcon = TYPE_ICONS[session.type] || MessageSquare;

                return (
                    <div key={session.id} className={`group rounded-[2rem] bg-bg-primary/50 border ${isPlanned ? 'border-cyan-500/30' : 'border-border-subtle'} hover:border-cyan-500/20 overflow-hidden transition-all duration-300 shadow-lg`}>
                        {/* Summary Row */}
                        <button
                            onClick={() => setExpandedId(isExpanded ? null : session.id)}
                            className="w-full p-5 flex items-center gap-5 hover:bg-bg-secondary/40 transition-colors text-left relative overflow-hidden"
                        >
                            <div className={`w-12 h-12 rounded-2xl bg-${TYPE_COLORS[session.type] === 'cyan-500' ? 'cyan-500' : TYPE_COLORS[session.type] || 'cyan-500'}${TYPE_COLORS[session.type] === 'cyan-500' ? '/10' : '/10'} flex items-center justify-center shrink-0 border border-current opacity- transition-transform duration-300 shadow-inner`}>
                                <TypeIcon className={`w-5 h-5 text-${TYPE_COLORS[session.type] === 'cyan-500' ? 'cyan-600 dark:text-cyan-400' : TYPE_COLORS[session.type]}`} />
                            </div>
                            <div className="flex-1 min-w-0 z-10">
                                <div className="flex items-center gap-3 mb-1">
                                    <span className="text-[13px] font-black text-text-primary tracking-tight uppercase">{session.typeLabel || 'Mülakat Oturumu'}</span>
                                    {isPlanned ? (
                                        <span className="text-[9px] font-black px-2.5 py-1 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 uppercase tracking-widest animate-pulse shadow-sm">
                                            PLANLANDI / BEKLENİYOR
                                        </span>
                                    ) : (
                                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-xl uppercase tracking-wider shadow-sm ${session.finalScore >= 70 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : session.finalScore >= 40 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'}`}>
                                            Skor: {session.finalScore}
                                        </span>
                                    )}
                                    {session.isLiveMode && (
                                        <span className="text-[9px] font-black px-2.5 py-1 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 uppercase tracking-widest animate-pulse flex items-center gap-1.5">
                                            <ShieldCheck className="w-3 h-3" /> LIVE
                                        </span>
                                    )}
                                </div>
                                <p className="text-[10px] text-text-muted flex items-center gap-2 opacity-80 mt-1 font-black uppercase tracking-widest">
                                    <CalendarDays className="w-3.5 h-3.5" />
                                    {session.date ? new Date(session.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Tarih Belirtilmedi'}
                                    {session.time && <span className="text-cyan-500 font-black ml-1">@{session.time}</span>}
                                </p>
                            </div>
                            <div className={`w-9 h-9 rounded-2xl bg-bg-primary border border-border-subtle flex items-center justify-center transition-all duration-300 shadow-inner ${isExpanded ? 'rotate-180 bg-bg-secondary ring-1 ring-cyan-500/20' : ''}`}>
                                <ChevronDown className={`w-4 h-4 ${isExpanded ? 'text-cyan-500' : 'text-text-muted'}`} />
                            </div>
                        </button>

                        {isExpanded && (
                            <div className="px-5 pb-6 space-y-6 border-t border-border-subtle pt-6 animate-in fade-in slide-in-from-top-1 duration-200 bg-bg-secondary/20">
                                {isPlanned ? (
                                    <div className="p-8 rounded-[2rem] bg-bg-primary border border-border-subtle flex flex-col items-center text-center space-y-4 shadow-inner">
                                        <CalendarDays className="w-10 h-10 text-cyan-500/40" />
                                        <p className="text-[11px] text-text-muted font-black italic leading-relaxed opacity-60 uppercase tracking-tight">Bu mülakat henüz gerçekleştirilmedi. Tamamlandığında AI analizi burada görünecektir.</p>
                                        <div className="flex gap-3">
                                            <span className="px-4 py-2 rounded-xl bg-bg-secondary text-[10px] font-black text-text-muted border border-border-subtle uppercase tracking-widest">Süre: {session.duration || '-'} dk</span>
                                            {session.meetLink && (
                                                <a href={session.meetLink} target="_blank" rel="noopener noreferrer" className="px-5 py-2 rounded-xl bg-cyan-500 text-[10px] font-black text-white shadow-lg shadow-cyan-500/20 uppercase tracking-widest hover:bg-cyan-600 transition-all flex items-center justify-center">Toplantıya Katıl</a>
                                            )}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onStartSession?.(session); }}
                                                className="px-5 py-2 rounded-xl bg-emerald-500 text-[10px] font-black text-white shadow-lg shadow-emerald-500/20 uppercase tracking-widest hover:bg-emerald-600 transition-all border border-emerald-500">
                                                Mülakatı Başlat
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {/* Scores */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 rounded-2xl bg-bg-primary border border-border-subtle text-center shadow-inner group/score">
                                                <p className="text-[10px] text-text-muted uppercase font-black tracking-widest mb-1 opacity-60">AI Puanı</p>
                                                <p className="text-2xl font-black text-cyan-600 dark:text-cyan-400 group-hover/score:scale-110 transition-transform">{session.aiOverallScore}</p>
                                            </div>
                                            <div className="p-4 rounded-2xl bg-bg-primary border border-border-subtle text-center shadow-inner group/score">
                                                <p className="text-[10px] text-text-muted uppercase font-black tracking-widest mb-1 opacity-60">Son Puan</p>
                                                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 group-hover/score:scale-110 transition-transform">{session.finalScore}</p>
                                            </div>
                                        </div>

                                        {/* Shadow Observer Details */}
                                        {session.isLiveMode && session.starScores && (
                                            <div className="p-5 rounded-2xl bg-bg-primary border border-border-subtle space-y-4 shadow-inner">
                                                <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                                                    <p className="text-[11px] text-text-muted font-black uppercase tracking-widest flex items-center gap-2">
                                                        <ShieldCheck className="w-4 h-4 text-emerald-500" /> STAR Analizi (Bot Kaydı)
                                                    </p>
                                                    <span className="text-[11px] font-black text-emerald-500 uppercase tracking-tighter">INTEGRITY: {session.logicIntegrity}%</span>
                                                </div>
                                                <div className="grid grid-cols-4 gap-4">
                                                    {Object.entries(session.starScores).map(([key, score]) => (
                                                        <div key={key} className="text-center group/star">
                                                            <div className="text-[10px] text-text-muted font-black uppercase tracking-tighter mb-1 opacity-60">{key}</div>
                                                            <div className="text-lg font-black text-text-primary group-hover/star:text-cyan-500 transition-colors">{score}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* AI Summary */}
                                        {session.aiSummary && (
                                            <div className="p-5 rounded-2xl bg-bg-primary border border-border-subtle shadow-inner">
                                                <p className="text-[11px] text-text-muted font-black uppercase tracking-widest mb-2 opacity-60 flex items-center gap-2">
                                                    <FileText className="w-3.5 h-3.5" /> AI Değerlendirmesi
                                                </p>
                                                <p className="text-[13px] text-text-secondary leading-relaxed font-bold italic">"{session.aiSummary}"</p>
                                            </div>
                                        )}

                                        {/* Strengths & Weaknesses */}
                                        <div className="grid grid-cols-2 gap-4">
                                            {session.aiStrengths?.length > 0 && (
                                                <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
                                                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-black uppercase tracking-widest mb-2 flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5" /> Güçlü</p>
                                                    {session.aiStrengths.map((s, i) => <p key={i} className="text-[11px] text-text-secondary font-bold flex items-start gap-2 mb-1"><span className="text-emerald-500 mt-1.5 w-1 h-1 rounded-full shrink-0" /> {s}</p>)}
                                                </div>
                                            )}
                                            {session.aiWeaknesses?.length > 0 && (
                                                <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/10">
                                                    <p className="text-[11px] text-red-600 dark:text-red-400 font-black uppercase tracking-widest mb-2 flex items-center gap-2"><TrendingDown className="w-3.5 h-3.5" /> Gelişim</p>
                                                    {session.aiWeaknesses.map((w, i) => <p key={i} className="text-[11px] text-text-secondary font-bold flex items-start gap-2 mb-1"><span className="text-red-500 mt-1.5 w-1 h-1 rounded-full shrink-0" /> {w}</p>)}
                                                </div>
                                            )}
                                        </div>

                                        {/* Q&A */}
                                        <div className="space-y-3">
                                            <p className="text-[11px] text-text-muted font-black uppercase tracking-widest mb-1 opacity-60">Sorular & Cevaplar</p>
                                            {session.questions?.map((q, i) => (
                                                <div key={i} className="p-4 rounded-2xl bg-bg-primary border border-border-subtle group/qa hover:bg-bg-secondary transition-all shadow-inner">
                                                    <div className="flex items-start gap-4">
                                                        <span className="text-[11px] font-black text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-xl shrink-0 shadow-sm">Q{i + 1}</span>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[13px] text-text-primary font-black uppercase tracking-tight leading-relaxed mb-2">{q.question}</p>
                                                            <div className="p-3 rounded-xl bg-bg-secondary/50 border border-border-subtle text-[12px] text-text-secondary font-bold leading-relaxed shadow-inner">
                                                                {q.answer || '(Cevap verilmedi)'}
                                                            </div>
                                                            {q.aiFeedback && (
                                                                <p className="text-[10px] text-text-muted mt-2 italic font-black opacity-60 flex items-center gap-2">
                                                                    <Brain className="w-3 h-3 text-cyan-500" /> AI: {q.aiFeedback}
                                                                </p>
                                                            )}
                                                        </div>
                                                        {q.aiScore != null && (
                                                            <div className={`text-[12px] font-black w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${q.aiScore >= 70 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20 shadow-emerald-500/10' : q.aiScore >= 40 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20 shadow-amber-500/10' : 'bg-red-500/10 text-red-600 dark:text-red-400 ring-1 ring-red-500/20 shadow-red-500/10'}`}>
                                                                {q.aiScore}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Interviewer Notes */}
                                        {session.interviewerNotes && (
                                            <div className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/10 shadow-inner">
                                                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                                                    <User className="w-3.5 h-3.5" /> Mülakatçı Notları
                                                </p>
                                                <p className="text-[12px] text-text-secondary font-bold leading-relaxed whitespace-pre-wrap italic">"{session.interviewerNotes}"</p>
                                            </div>
                                        )}

                                        {/* Print */}
                                        <button
                                            onClick={() => handlePrintSession(session)}
                                            className="w-full py-4 rounded-[20px] bg-bg-primary border border-border-subtle text-text-muted hover:text-text-primary hover:bg-bg-secondary text-[11px] font-black uppercase tracking-widest transition-all shadow-inner flex items-center justify-center gap-3 relative overflow-hidden group/print"
                                        >
                                            <div className="absolute inset-0 bg-cyan-500/5 opacity-0 group-hover/print:opacity-100 transition-opacity" />
                                            <Printer className="w-4 h-4 text-cyan-500" /> PDF RAPOR ÜRET
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
