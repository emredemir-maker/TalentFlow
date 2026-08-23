// MANUEL GÖRÜŞMENİN RAPORU.
//
// Bu üç bölüm de kayıtta ZATEN duran veriyi okuyor. Rapor sayfası bunları hiç
// okumuyordu: canlı mülakat akışının alanlarını (starScores, aiSummary,
// finalScore) arıyor, bulamayınca boş kutular ve yerine geçen hazır cümleler
// basıyordu. Değerlendirme aynı belgenin içindeydi.
//
// Infoset diline çevrildi (Ekran 6). Metinlerin hiçbiri değişmedi — hangi
// koşulda hangi cümlenin çıktığı bu dosyanın asıl işi ve o mantık aynı.

import React from 'react';
import {
    AlertCircle, Brain, Check, HelpCircle, Loader2, Minus,
    RefreshCw, ShieldCheck, Target, X,
} from 'lucide-react';
import { NO_SCORE_TEXT, OUTCOME_LABEL, VERDICT_LABEL } from '../utils/interviewReport';

/** Damga renkleri — prototipin madde kartındaki dört durum. */
const VERDICT_STYLE = {
    met: { icon: Check, bg: 'var(--color-ok-bg)', fg: 'var(--color-ok)' },
    partial: { icon: Minus, bg: 'var(--color-warn-bg)', fg: 'var(--color-warn)' },
    missing: { icon: X, bg: 'var(--color-bad-bg)', fg: 'var(--color-bad)' },
    inconclusive: { icon: HelpCircle, bg: 'var(--color-n100)', fg: 'var(--color-n500)' },
};

const OUTCOME_STYLE = {
    positive: { bg: 'var(--color-ok-bg)', fg: 'var(--color-ok)' },
    negative: { bg: 'var(--color-bad-bg)', fg: 'var(--color-bad)' },
    pending: { bg: 'var(--color-warn-bg)', fg: 'var(--color-warn)' },
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
    const outcomeTone = OUTCOME_STYLE[report.outcome] || OUTCOME_STYLE.pending;

    return (
        <section className="bg-n0 border border-n200 rounded-[14px] shadow-sm p-[18px] flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5">
                <Target className="w-[15px] h-[15px] text-brand" />
                <h3 className="text-[11px] font-semibold text-n500 tracking-[0.1em] uppercase m-0">Görüşme sonucu</h3>
                {report.outcome && (
                    <span
                        className="ml-auto text-[11px] font-semibold px-2.5 py-[3px] rounded-full"
                        style={{ background: outcomeTone.bg, color: outcomeTone.fg }}
                    >
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
                        className={`${report.outcome ? '' : 'ml-auto '}flex items-center gap-1.5 text-[12px] font-medium text-n600 bg-n50 border border-n200 hover:bg-n100 rounded-md px-2.5 py-[5px] disabled:opacity-50`}
                    >
                        {regrading
                            ? <><Loader2 className="w-3 h-3 animate-spin" /> Değerlendiriliyor…</>
                            : <><RefreshCw className="w-3 h-3" /> Yeniden değerlendir</>}
                    </button>
                )}
            </div>

            {regradeNote && (
                <p className="text-[12px] text-n500 leading-relaxed m-0">{regradeNote}</p>
            )}

            {/* SAYI ÜRETİLEMEDİYSE SEBEBİ YAZILIR — 0 basılmaz. Ölçemediğini 0
                diye yazmak, olmayan bir ölçümü varmış gibi göstermektir. */}
            {report.noScoreReason ? (
                <div className="flex items-start gap-2 rounded-md bg-warn-bg px-3.5 py-3">
                    <AlertCircle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
                    <div>
                        <p className="text-[11px] font-semibold text-warn tracking-[0.08em] uppercase mb-1 m-0">
                            Sayısal sonuç üretilmedi
                        </p>
                        <p className="text-[12px] text-n700 leading-relaxed m-0">
                            {NO_SCORE_TEXT[report.noScoreReason]}
                        </p>
                        {/* Teknik sebep gizlenmiyor: aynı hata tekrarlıyorsa
                            kullanıcı bunu bize aktarabilmeli. */}
                        {report.gradingError && (
                            <p className="mt-1 text-[11px] text-n500 font-mono break-words m-0">
                                {report.gradingError}
                            </p>
                        )}
                    </div>
                </div>
            ) : e && (
                <div className="flex flex-wrap items-end gap-5">
                    <div>
                        <p className="text-[44px] font-semibold text-n900 leading-none tracking-[-0.03em] m-0">%{e.score}</p>
                        <p className="text-[11px] text-n500 mt-1 m-0">
                            Kanıt oranı · {e.asked} madde soruldu
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-[7px] pb-1.5">
                        {[
                            { n: e.met, label: 'karşılıyor', tone: VERDICT_STYLE.met },
                            { n: e.partial, label: 'kısmen', tone: VERDICT_STYLE.partial },
                            { n: e.missing, label: 'yok', tone: VERDICT_STYLE.missing },
                            { n: e.inconclusive, label: 'karar yok', tone: VERDICT_STYLE.inconclusive },
                        ].filter((c) => Number(c.n) > 0).map((c) => (
                            <span
                                key={c.label}
                                className="text-[12px] font-semibold px-2.5 py-1 rounded-md"
                                style={{ background: c.tone.bg, color: c.tone.fg }}
                            >
                                {c.n} {c.label}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* ZORUNLU MADDE ODADA DA DÜŞTÜYSE kapı burada kapanır. Eleme kararı
                yöneticinin; sistem yalnızca kapının kapandığını söylüyor. */}
            {gate && (
                <div className="flex items-start gap-2 rounded-md bg-bad-bg px-3.5 py-3">
                    <ShieldCheck className="w-4 h-4 text-bad shrink-0 mt-0.5" />
                    <p className="text-[12px] text-n700 leading-relaxed m-0">
                        <strong className="font-semibold">{e.mustMissing} zorunlu madde</strong> odada da kapanmadı.
                        Öneri bu yüzden olumlu olamaz — nihai karar sizin.
                    </p>
                </div>
            )}

            {/* Karar verilemeyen madde skoru düşürmez, paydaya da girmez. */}
            {!report.noScoreReason && Number(e?.inconclusive) > 0 && (
                <div className="bg-n50 rounded-md px-3.5 py-2.5">
                    <p className="text-[12px] text-n700 leading-relaxed m-0">
                        <strong className="font-semibold">{e.inconclusive} madde</strong> için karar verilemedi (soru
                        atlandı ya da cevap konuya girmedi). Bunlar orana <strong className="font-semibold">girmiyor</strong> —
                        cevaplanmamış soruyu yanlış cevap saymıyoruz.
                    </p>
                </div>
            )}

            {report.legacySchema && (
                <p className="text-[12px] text-n500 leading-relaxed border-t border-n100 pt-3 m-0">
                    Bu kayıt <strong className="font-semibold">eski ölçüyle</strong> üretildi: sayıyı model veriyordu
                    ve neye göre verdiği tanımlı değildi. Yeni kayıtlarla aynı listede kıyaslamayın.
                </p>
            )}
        </section>
    );
}

/** MADDE MADDE — damga, dayanağı olan alıntı ve verilen cevap yan yana. */
export function RequirementVerdicts({ report }) {
    if (report.items.length === 0) return null;

    return (
        <section className="flex flex-col gap-2.5">
            <h3 className="text-[11px] font-semibold text-n500 tracking-[0.1em] uppercase px-0.5 m-0">
                Madde bazlı değerlendirme
            </h3>

            {report.requirementsStale && (
                <div className="flex items-start gap-2 rounded-md bg-warn-bg px-3.5 py-3">
                    <AlertCircle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
                    <p className="text-[12px] text-n700 leading-relaxed m-0">
                        İlan bu görüşmeden sonra değişti; madde metinleri gösterilmiyor. Damgalar eski listeye ait
                        ve yeni numaralara dizilirse cevaplar <strong className="font-semibold">yanlış maddelere</strong> yazılır.
                    </p>
                </div>
            )}

            {report.items.map((item) => {
                const style = VERDICT_STYLE[item.verdict] || VERDICT_STYLE.inconclusive;
                const Icon = style.icon;
                return (
                    <div key={item.requirementIndex} className="bg-n0 border border-n200 rounded-[10px] shadow-sm p-3.5">
                        <div className="flex items-start gap-2.5">
                            <div
                                className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                                style={{ background: style.bg, color: style.fg }}
                            >
                                <Icon className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-[7px] flex-wrap">
                                    <span className="text-[11px] font-semibold text-n400">M{item.requirementIndex}</span>
                                    {item.must && (
                                        <span className="text-[11px] font-semibold px-1.5 rounded bg-bad-bg text-bad">
                                            zorunlu
                                        </span>
                                    )}
                                    <span
                                        className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                                        style={{ background: style.bg, color: style.fg }}
                                    >
                                        {VERDICT_LABEL[item.verdict] || item.verdict}
                                    </span>
                                </div>
                                <p className="text-[13px] font-semibold text-n900 mt-1 leading-snug m-0">
                                    {item.text || (
                                        <span className="text-n400 font-normal">
                                            madde metni gösterilemiyor — ilan değişmiş
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Damganın hesabını veren alıntı — adayın kendi sözü. */}
                        {item.quote && (
                            <div className="ml-[38px] mt-2.5 pl-2.5 border-l-2 border-brand-100">
                                <p className="text-[12px] text-n700 leading-relaxed m-0">{item.quote}</p>
                            </div>
                        )}
                        {item.question && (
                            <div className="ml-[38px] mt-2.5">
                                <p className="text-[11px] font-semibold text-n400 m-0">S: {item.question}</p>
                                {item.answer
                                    ? <p className="text-[12px] text-n700 leading-relaxed mt-0.5 m-0">{item.answer}</p>
                                    : <p className="text-[11px] text-n300 mt-0.5 m-0">cevap girilmedi</p>}
                            </div>
                        )}
                        {item.observation && (
                            <p className="ml-[38px] mt-2.5 pl-2.5 text-[12px] text-n600 leading-relaxed border-l-2 border-n200 m-0">
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
        <section className="flex flex-col gap-3.5">
            {(report.summary || report.strengths.length > 0 || report.concerns.length > 0) && (
                <div className="bg-n0 border border-n200 rounded-[14px] shadow-sm p-[18px]">
                    <div className="flex items-center gap-2.5 mb-2.5">
                        <Brain className="w-[15px] h-[15px] text-brand" />
                        <h3 className="text-[11px] font-semibold text-n500 tracking-[0.1em] uppercase m-0">Görüşme özeti</h3>
                    </div>
                    {report.summary && (
                        <p className="text-[14px] text-n700 leading-[1.65] m-0">{report.summary}</p>
                    )}

                    {(report.strengths.length > 0 || report.concerns.length > 0) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3.5">
                            {report.strengths.length > 0 && (
                                <div className="bg-ok-bg rounded-[10px] p-3.5">
                                    <div className="text-[11px] font-semibold text-ok tracking-[0.08em] uppercase mb-2">Öne çıkanlar</div>
                                    {report.strengths.map((s, i) => (
                                        <div key={i} className="flex gap-[7px] mb-1.5">
                                            <span className="text-ok">•</span>
                                            <span className="text-[12px] text-n700 leading-[1.5]">{s}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {report.concerns.length > 0 && (
                                <div className="bg-warn-bg rounded-[10px] p-3.5">
                                    <div className="text-[11px] font-semibold text-warn tracking-[0.08em] uppercase mb-2">Açık kalanlar</div>
                                    {report.concerns.map((c, i) => (
                                        <div key={i} className="flex gap-[7px] mb-1.5">
                                            <span className="text-warn">•</span>
                                            <span className="text-[12px] text-n700 leading-[1.5]">{c}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Maddeye bağlı olmayan sorular skora girmiyor ama konuşuldular;
                yok saymak mülakatçının emeğini silmek olurdu. */}
            {report.unlinked.length > 0 && (
                <div className="bg-n0 border border-n200 rounded-[14px] shadow-sm p-[18px] flex flex-col gap-3">
                    <h4 className="text-[11px] font-semibold text-n500 tracking-[0.08em] uppercase m-0">
                        Diğer sorular <span className="text-n400 normal-case tracking-normal font-normal">· ilanın maddelerine bağlı değil, skora girmiyor</span>
                    </h4>
                    {report.unlinked.map((q, i) => (
                        <div key={i} className="border-l-2 border-n200 pl-2.5">
                            <p className="text-[11px] font-semibold text-n400 m-0">S: {q.question}</p>
                            {q.answer && <p className="text-[12px] text-n700 leading-relaxed mt-0.5 m-0">{q.answer}</p>}
                            {q.observation && <p className="text-[12px] text-n600 leading-relaxed mt-0.5 m-0">{q.observation}</p>}
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
