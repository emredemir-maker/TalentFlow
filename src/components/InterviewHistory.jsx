// src/components/InterviewHistory.jsx
// Shows historical interview sessions for a candidate
import { useState, useRef } from 'react';
import {
    Clock, Zap, Users, Box, ChevronDown, TrendingUp, TrendingDown,
    Printer, MessageSquare, FileText, CalendarDays, User, ShieldCheck
} from 'lucide-react';

const TYPE_ICONS = { technical: Zap, culture: Users, product: Box };
const TYPE_COLORS = { technical: 'electric', culture: 'emerald-500', product: 'violet-500' };

export default function InterviewHistory({ sessions = [] }) {
    const [expandedId, setExpandedId] = useState(null);

    if (!sessions || sessions.length === 0) {
        return (
            <div className="p-8 rounded-[2rem] flex flex-col items-center justify-center text-center relative overflow-hidden bg-gradient-to-b from-white/[0.02] to-transparent border border-white/[0.05] group">
                <div className="absolute inset-0 bg-electric/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"></div>
                <div className="w-16 h-16 rounded-full bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mb-5 relative z-10 group-hover:scale-110 transition-transform duration-500 shadow-xl shadow-black/20">
                    <MessageSquare className="w-8 h-8 text-electric/60 group-hover:text-electric transition-colors duration-500" />
                </div>
                <p className="text-sm font-semibold text-text-primary mb-2 relative z-10">Kayıt Bulunamadı</p>
                <p className="text-xs text-navy-400 relative z-10 max-w-[240px] leading-relaxed">Yeni bir değerlendirme süreci başlatmak için ilk mülakat oturumunu oluşturun.</p>
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
        <div className="space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-navy-500 mb-2 flex items-center gap-2">
                <Clock className="w-3 h-3" /> Mülakat Geçmişi ({sorted.length})
            </h3>
            {sorted.map(session => {
                const isExpanded = expandedId === session.id;
                const isPlanned = session.status === 'planned';
                const TypeIcon = TYPE_ICONS[session.type] || MessageSquare;

                return (
                    <div key={session.id} className={`group rounded-2xl bg-gradient-to-br from-white/[0.03] to-white/[0.01] border ${isPlanned ? 'border-electric/30' : 'border-white/[0.08]'} hover:border-white/[0.15] overflow-hidden transition-all duration-300`}>
                        {/* Summary Row */}
                        <button
                            onClick={() => setExpandedId(isExpanded ? null : session.id)}
                            className="w-full p-5 flex items-center gap-5 hover:bg-white/[0.04] transition-colors text-left relative overflow-hidden"
                        >
                            <div className={`w-12 h-12 rounded-2xl bg-${TYPE_COLORS[session.type] || 'electric'}/10 flex items-center justify-center shrink-0 border border-${TYPE_COLORS[session.type] || 'electric'}/20 group-hover:scale-110 transition-transform duration-300`}>
                                <TypeIcon className={`w-5 h-5 text-${TYPE_COLORS[session.type] || 'electric'}`} />
                            </div>
                            <div className="flex-1 min-w-0 z-10">
                                <div className="flex items-center gap-3 mb-1">
                                    <span className="text-sm font-bold text-text-primary tracking-tight">{session.typeLabel || 'Mülakat Oturumu'}</span>
                                    {isPlanned ? (
                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-electric/10 text-electric border border-electric/20 uppercase tracking-widest animate-pulse">
                                            PLANLANDI / BEKLENİYOR
                                        </span>
                                    ) : (
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm ${session.finalScore >= 70 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : session.finalScore >= 40 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                            Skor: {session.finalScore}
                                        </span>
                                    )}
                                    {session.isLiveMode && (
                                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 uppercase tracking-widest animate-pulse flex items-center gap-1">
                                            <ShieldCheck className="w-2.5 h-2.5" /> LIVE
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11px] text-navy-400 flex items-center gap-2 opacity-80 mt-1">
                                    <CalendarDays className="w-3.5 h-3.5" />
                                    {session.date ? new Date(session.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Tarih Belirtilmedi'}
                                    {session.time && <span className="text-electric font-black ml-1">@{session.time}</span>}
                                </p>
                            </div>
                            <div className={`w-8 h-8 rounded-full bg-white/[0.02] border border-white/[0.05] flex items-center justify-center transition-transform duration-300 ${isExpanded ? 'rotate-180 bg-white/[0.06]' : ''}`}>
                                <ChevronDown className="w-4 h-4 text-navy-400" />
                            </div>
                        </button>

                        {isExpanded && (
                            <div className="px-5 pb-5 space-y-5 border-t border-white/[0.04] pt-5 animate-in fade-in slide-in-from-top-1 duration-200">
                                {isPlanned ? (
                                    <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex flex-col items-center text-center space-y-4">
                                        <CalendarDays className="w-8 h-8 text-electric/40" />
                                        <p className="text-xs text-navy-300 italic leading-relaxed">Bu mülakat henüz gerçekleştirilmedi. Tamamlandığında AI analizi burada görünecektir.</p>
                                        <div className="flex gap-3">
                                            <span className="px-3 py-1 rounded-xl bg-navy-800 text-[10px] font-black text-navy-400 border border-white/5 uppercase tracking-widest">Süre: {session.duration || '-'} dk</span>
                                            {session.meetLink && (
                                                <a href={session.meetLink} target="_blank" rel="noopener noreferrer" className="px-4 py-1.5 rounded-xl bg-electric/10 text-[10px] font-black text-electric border border-electric/20 uppercase tracking-widest hover:bg-electric hover:text-white transition-all">Toplantıya Katıl</a>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {/* Scores */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="p-3 rounded-xl bg-electric/5 border border-electric/10 text-center">
                                                <p className="text-[9px] text-navy-500 uppercase font-bold">AI Puanı</p>
                                                <p className="text-lg font-black text-text-primary">{session.aiOverallScore}</p>
                                            </div>
                                            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 text-center">
                                                <p className="text-[9px] text-navy-500 uppercase font-bold">Son Puan</p>
                                                <p className="text-lg font-black text-text-primary">{session.finalScore}</p>
                                            </div>
                                        </div>

                                        {/* Shadow Observer Details */}
                                        {session.isLiveMode && session.starScores && (
                                            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-[10px] text-navy-500 font-bold uppercase tracking-widest flex items-center gap-1.5">
                                                        <ShieldCheck className="w-3 h-3 text-emerald-400" /> STAR Analizi (Bot Kaydı)
                                                    </p>
                                                    <span className="text-[10px] font-black text-emerald-400">INTEGRITY: {session.logicIntegrity}%</span>
                                                </div>
                                                <div className="grid grid-cols-4 gap-2">
                                                    {Object.entries(session.starScores).map(([key, score]) => (
                                                        <div key={key} className="text-center">
                                                            <div className="text-[9px] text-navy-600 font-bold">{key}</div>
                                                            <div className="text-sm font-black text-text-primary">{score}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* AI Summary */}
                                        {session.aiSummary && (
                                            <div className="p-3 rounded-xl bg-white/[0.02]">
                                                <p className="text-[10px] text-navy-500 font-bold mb-1">AI Değerlendirmesi</p>
                                                <p className="text-xs text-navy-300 leading-relaxed">{session.aiSummary}</p>
                                            </div>
                                        )}

                                        {/* Strengths & Weaknesses */}
                                        <div className="grid grid-cols-2 gap-3">
                                            {session.aiStrengths?.length > 0 && (
                                                <div>
                                                    <p className="text-[9px] text-emerald-400 font-bold mb-1 flex items-center gap-1"><TrendingUp className="w-2.5 h-2.5" /> Güçlü</p>
                                                    {session.aiStrengths.map((s, i) => <p key={i} className="text-[10px] text-navy-400">• {s}</p>)}
                                                </div>
                                            )}
                                            {session.aiWeaknesses?.length > 0 && (
                                                <div>
                                                    <p className="text-[9px] text-red-400 font-bold mb-1 flex items-center gap-1"><TrendingDown className="w-2.5 h-2.5" /> Gelişim</p>
                                                    {session.aiWeaknesses.map((w, i) => <p key={i} className="text-[10px] text-navy-400">• {w}</p>)}
                                                </div>
                                            )}
                                        </div>

                                        {/* Q&A */}
                                        <div className="space-y-2">
                                            <p className="text-[9px] text-navy-500 font-bold uppercase">Sorular & Cevaplar</p>
                                            {session.questions?.map((q, i) => (
                                                <div key={i} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.03]">
                                                    <div className="flex items-start gap-2">
                                                        <span className="text-[9px] font-bold text-electric bg-electric/10 px-1.5 py-0.5 rounded shrink-0">Q{i + 1}</span>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[11px] text-text-primary font-medium">{q.question}</p>
                                                            <p className="text-[10px] text-navy-400 mt-1 whitespace-pre-wrap">{q.answer || '(Cevap verilmedi)'}</p>
                                                            {q.aiFeedback && (
                                                                <p className="text-[9px] text-navy-500 mt-1 italic">AI: {q.aiFeedback}</p>
                                                            )}
                                                        </div>
                                                        {q.aiScore != null && (
                                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${q.aiScore >= 70 ? 'bg-emerald-500/20 text-emerald-400' : q.aiScore >= 40 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
                                                                {q.aiScore}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Interviewer Notes */}
                                        {session.interviewerNotes && (
                                            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
                                                <p className="text-[9px] text-amber-400 font-bold mb-1">Mülakatçı Notları</p>
                                                <p className="text-[10px] text-navy-300 whitespace-pre-wrap">{session.interviewerNotes}</p>
                                            </div>
                                        )}

                                        {/* Print */}
                                        <button
                                            onClick={() => handlePrintSession(session)}
                                            className="w-full py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-navy-300 hover:text-text-primary text-xs font-bold transition-all flex items-center justify-center gap-2"
                                        >
                                            <Printer className="w-3.5 h-3.5" /> PDF Çıktı Al
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
