// MANUEL GÖRÜŞMENİN RAPORU.
//
// Bu üç bölüm de kayıtta ZATEN duran veriyi okuyor. Rapor sayfası bunları hiç
// okumuyordu: canlı mülakat akışının alanlarını (starScores, aiSummary,
// finalScore) arıyor, bulamayınca boş kutular ve yerine geçen hazır cümleler
// basıyordu. Değerlendirme aynı belgenin içindeydi.

import React from 'react';
import {
    AlertCircle, Brain, Check, HelpCircle, Loader2, Minus,
    RefreshCw, ShieldCheck, Target, X,
} from 'lucide-react';
import { NO_SCORE_TEXT, OUTCOME_LABEL, VERDICT_LABEL } from '../utils/interviewReport';

const VERDICT_STYLE = {
    met: { icon: Check, cls: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    partial: { icon: Minus, cls: 'text-amber-600 bg-amber-50 border-amber-200' },
    missing: { icon: X, cls: 'text-rose-600 bg-rose-50 border-rose-200' },
    inconclusive: { icon: HelpCircle, cls: 'text-slate-400 bg-slate-50 border-slate-200' },
};

const OUTCOME_STYLE = {
    positive: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    negative: 'text-rose-700 bg-rose-50 border-rose-200',
    pending: 'text-amber-700 bg-amber-50 border-amber-200',
};

/**
 * SONUÇ — kanıt oranı ve PAYDA birlikte.
 *
 * "%75" tek başına yanıltıcı: dört maddenin üçü mü, on maddenin yedisi mi?
 * Payda her zaman görünür.
 */
export function InterviewResultCard({ report, onReevaluate, regrading, regradeNote }) {
    const e = report.evidence;
    const gate = Number(e?.mustMissing) > 0;

    return (
        <section className="bg-white rounded-[24px] border border-[#E2E8F0] p-8 shadow-sm space-y-5">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600/10 rounded-xl"><Target className="w-5 h-5 text-blue-600" /></div>
                <h3 className="text-[12px] font-black text-[#13294E] uppercase tracking-widest italic">GÖRÜŞME SONUCU</h3>
                {report.outcome && (
                    <span className={`ml-auto px-3 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${OUTCOME_STYLE[report.outcome] || OUTCOME_STYLE.pending}`}>
                        Öneri: {OUTCOME_LABEL[report.outcome] || report.outcome}
                    </span>
                )}
                {/* Cevabı sonradan tamamlayınca görüşmeyi baştan girmek
                    gerekiyordu: değerlendirme yalnızca kayıt anında
                    yapılıyordu. Bu düğme aynı kaydı yerinde yeniden ölçer. */}
                {onReevaluate && (
                    <button
                        type="button"
                        onClick={onReevaluate}
                        disabled={regrading}
                        className={`${report.outcome ? '' : 'ml-auto '}flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition-all disabled:opacity-50`}
                    >
                        {regrading
                            ? <><Loader2 className="w-3 h-3 animate-spin" /> Değerlendiriliyor…</>
                            : <><RefreshCw className="w-3 h-3" /> Yeniden değerlendir</>}
                    </button>
                )}
            </div>

            {regradeNote && (
                <p className="text-[11px] text-slate-500 leading-relaxed">{regradeNote}</p>
            )}

            {/* SAYI ÜRETİLEMEDİYSE SEBEBİ YAZILIR — 0 basılmaz. Ölçemediğini 0
                diye yazmak, olmayan bir ölçümü varmış gibi göstermektir. */}
            {report.noScoreReason ? (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-[11px] font-black text-amber-800 uppercase tracking-widest mb-1">
                            Sayısal sonuç üretilmedi
                        </p>
                        <p className="text-[12px] text-amber-800 leading-relaxed">
                            {NO_SCORE_TEXT[report.noScoreReason]}
                        </p>
                        {/* Teknik sebep gizlenmiyor: aynı hata tekrarlıyorsa
                            kullanıcı bunu bize aktarabilmeli. */}
                        {report.gradingError && (
                            <p className="mt-1 text-[10px] text-amber-700 font-mono break-words">
                                {report.gradingError}
                            </p>
                        )}
                    </div>
                </div>
            ) : e && (
                <div className="flex flex-wrap items-end gap-6">
                    <div>
                        <p className="text-[44px] font-black text-[#0F172A] leading-none tracking-tighter italic">%{e.score}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                            Kanıt oranı · {e.asked} madde soruldu
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2 pb-1">
                        {[
                            { n: e.met, label: 'karşılıyor', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                            { n: e.partial, label: 'kısmen', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
                            { n: e.missing, label: 'yok', cls: 'text-rose-700 bg-rose-50 border-rose-200' },
                            { n: e.inconclusive, label: 'karar yok', cls: 'text-slate-500 bg-slate-50 border-slate-200' },
                        ].filter((c) => Number(c.n) > 0).map((c) => (
                            <span key={c.label} className={`px-2.5 py-1 rounded-lg border text-[10px] font-black ${c.cls}`}>
                                {c.n} {c.label}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* ZORUNLU MADDE ODADA DA DÜŞTÜYSE kapı burada kapanır. Eleme kararı
                yöneticinin; sistem yalnızca kapının kapandığını söylüyor. */}
            {gate && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                    <ShieldCheck className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <p className="text-[12px] text-rose-800 leading-relaxed">
                        <strong>{e.mustMissing} zorunlu madde</strong> odada da kapanmadı. Öneri bu yüzden olumlu
                        olamaz — nihai karar sizin.
                    </p>
                </div>
            )}

            {/* Karar verilemeyen madde skoru düşürmez, paydaya da girmez. */}
            {!report.noScoreReason && Number(e?.inconclusive) > 0 && (
                <p className="text-[11px] text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
                    <strong>{e.inconclusive} madde</strong> için karar verilemedi (soru atlandı ya da cevap konuya
                    girmedi). Bunlar orana <strong>girmiyor</strong> — cevaplanmamış soruyu yanlış cevap saymıyoruz.
                </p>
            )}

            {report.legacySchema && (
                <p className="text-[11px] text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
                    Bu kayıt <strong>eski ölçüyle</strong> üretildi: sayıyı model veriyordu ve neye göre verdiği
                    tanımlı değildi. Yeni kayıtlarla aynı listede kıyaslamayın.
                </p>
            )}
        </section>
    );
}

/** MADDE MADDE — damga, dayanağı olan alıntı ve verilen cevap yan yana. */
export function RequirementVerdicts({ report }) {
    if (report.items.length === 0) return null;

    return (
        <section className="space-y-3">
            <h3 className="text-[12px] font-black text-slate-400 uppercase tracking-widest italic px-1">
                MADDE BAZLI DEĞERLENDİRME
            </h3>

            {report.requirementsStale && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[12px] text-amber-800 leading-relaxed">
                        İlan bu görüşmeden sonra değişti; madde metinleri gösterilmiyor. Damgalar eski listeye ait
                        ve yeni numaralara dizilirse cevaplar <strong>yanlış maddelere</strong> yazılır.
                    </p>
                </div>
            )}

            {report.items.map((item) => {
                const style = VERDICT_STYLE[item.verdict] || VERDICT_STYLE.inconclusive;
                const Icon = style.icon;
                return (
                    <div key={item.requirementIndex} className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-sm space-y-3">
                        <div className="flex items-start gap-3">
                            <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${style.cls}`}>
                                <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-black text-slate-400">M{item.requirementIndex}</span>
                                    {item.must && (
                                        <span className="px-1.5 py-0.5 rounded border border-red-200 bg-red-50 text-red-600 text-[8px] font-black uppercase">
                                            zorunlu
                                        </span>
                                    )}
                                    <span className={`px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-wide ${style.cls}`}>
                                        {VERDICT_LABEL[item.verdict] || item.verdict}
                                    </span>
                                </div>
                                <p className="text-[13px] font-bold text-[#0F172A] mt-1 leading-snug">
                                    {item.text || (
                                        <span className="text-slate-400 font-medium italic">
                                            madde metni gösterilemiyor — ilan değişmiş
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Damganın hesabını veren alıntı — adayın kendi sözü. */}
                        {item.quote && (
                            <div className="ml-11 pl-3 border-l-2 border-blue-200">
                                <p className="text-[12px] text-slate-600 italic leading-relaxed">{item.quote}</p>
                            </div>
                        )}
                        {item.question && (
                            <div className="ml-11 space-y-1">
                                <p className="text-[11px] text-slate-400 font-bold">S: {item.question}</p>
                                {item.answer
                                    ? <p className="text-[12px] text-slate-600 leading-relaxed">{item.answer}</p>
                                    : <p className="text-[11px] text-slate-300 italic">cevap girilmedi</p>}
                            </div>
                        )}
                        {item.observation && (
                            <p className="ml-11 text-[11px] text-violet-700 leading-relaxed border-l-2 border-violet-200 pl-3">
                                {item.observation}
                            </p>
                        )}
                    </div>
                );
            })}
        </section>
    );
}

/** ÖZET, ÖNE ÇIKANLAR, AÇIK KALANLAR ve maddeye bağlı olmayan sorular. */
export function InterviewNarrative({ report }) {
    const hasNarrative = report.summary || report.strengths.length > 0 || report.concerns.length > 0;
    if (!hasNarrative && report.unlinked.length === 0) return null;

    return (
        <section className="space-y-4">
            {report.summary && (
                <div className="bg-white rounded-[24px] border border-blue-100 p-8 shadow-sm bg-gradient-to-br from-white to-blue-50/20">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-600/10 rounded-xl"><Brain className="w-5 h-5 text-blue-600" /></div>
                        <h3 className="text-[12px] font-black text-[#13294E] uppercase tracking-widest italic">GÖRÜŞME ÖZETİ</h3>
                    </div>
                    <p className="text-[15px] text-[#334155] leading-relaxed font-medium">{report.summary}</p>
                </div>
            )}

            {(report.strengths.length > 0 || report.concerns.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {report.strengths.length > 0 && (
                        <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-5">
                            <h4 className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-3">Öne çıkanlar</h4>
                            <ul className="space-y-2">
                                {report.strengths.map((s, i) => (
                                    <li key={i} className="flex items-start gap-2 text-[12px] text-emerald-800 font-medium leading-relaxed">
                                        <span className="text-emerald-500 mt-0.5">•</span> {s}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {report.concerns.length > 0 && (
                        <div className="bg-amber-50 rounded-2xl border border-amber-100 p-5">
                            <h4 className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-3">Açık kalanlar</h4>
                            <ul className="space-y-2">
                                {report.concerns.map((c, i) => (
                                    <li key={i} className="flex items-start gap-2 text-[12px] text-amber-800 font-medium leading-relaxed">
                                        <span className="text-amber-500 mt-0.5">•</span> {c}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {/* Maddeye bağlı olmayan sorular skora girmiyor ama konuşuldular;
                yok saymak mülakatçının emeğini silmek olurdu. */}
            {report.unlinked.length > 0 && (
                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-sm space-y-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Diğer sorular <span className="text-slate-300">· ilanın maddelerine bağlı değil, skora girmiyor</span>
                    </h4>
                    {report.unlinked.map((q, i) => (
                        <div key={i} className="space-y-1 border-l-2 border-slate-100 pl-3">
                            <p className="text-[11px] text-slate-400 font-bold">S: {q.question}</p>
                            {q.answer && <p className="text-[12px] text-slate-600 leading-relaxed">{q.answer}</p>}
                            {q.observation && <p className="text-[11px] text-violet-700 leading-relaxed">{q.observation}</p>}
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
