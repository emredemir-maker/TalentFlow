// MÜLAKAT PLANI paneli — taramanın bıraktığı soruyu odaya taşır.
//
// Tarama zaten hangi maddenin açık kaldığını biliyor. Bu panel o bilgiyi
// mülakatçının eline verir: hangi maddeyi, neden, kaç dakika ve iyi cevabın
// neye benzediği.
//
// Planın İSKELETİ kodda üretiliyor (utils/interviewPlan.js) — hangi madde,
// hangi kademe, kaç dakika. AI yalnızca soru METNİNİ yazıyor. Bu yüzden plan
// AI çağrısı olmadan da görülebilir; "Soruları yaz" ayrı bir adım ve ayrı bir
// maliyet.

import { useMemo, useState } from 'react';
import {
    AlertTriangle, CalendarClock, CheckCircle2, ClipboardCopy, Ear,
    Loader2, Sparkles, Target,
} from 'lucide-react';

import {
    buildInterviewPlan, planToText, priorityLabel, planSummary, CRITICAL, VERIFY,
} from '../utils/interviewPlan';
import { generateProbeQuestions } from '../services/ai/interviewPlanner';

const DURATIONS = [30, 45, 60, 90];

const TONE = {
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    sky: 'bg-sky-50 text-sky-700 border-sky-200',
    slate: 'bg-slate-50 text-slate-600 border-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const STATUS_TEXT = {
    missing: 'CV\'de karşılığı yok',
    partial: 'Kısmen karşılanıyor',
    met: 'Karşılanıyor',
};

// Doğrulama soruları açık bir boşluğu kapatmıyor; kullanıcı ikisini
// karıştırmasın diye kartta ayrıca yazıyor.
const VERIFY_HINT = 'Boşluk değil — CV\'deki iddiayı teyit için';

export default function InterviewPlanPanel({ candidate, position, analysis, onSave }) {
    const [minutes, setMinutes] = useState(45);
    const [writing, setWriting] = useState(false);
    const [written, setWritten] = useState(null); // soru metni eklenmiş sondalar
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');

    // İskelet saf hesap — süre değişince anında yeniden çıkar, AI çağrısı yok.
    const plan = useMemo(
        () => buildInterviewPlan(analysis, position, { minutes }),
        [analysis, position, minutes]
    );

    // Süre değişirse yazılmış sorular artık bu plana ait değil: madde listesi
    // değişmiş olabilir. Eski soruları yeni sondalara dizmek, bütün gün
    // uğraştığımız numara kaymasının aynısı olurdu.
    const probes = useMemo(() => {
        if (!written) return plan.probes;
        const byIndex = new Map(written.map((w) => [w.requirementIndex, w]));
        return plan.probes.map((p) => byIndex.get(p.requirementIndex) || p);
    }, [plan.probes, written]);

    const handleWrite = async () => {
        setWriting(true);
        setError('');
        try {
            const result = await generateProbeQuestions(plan, candidate, position);
            setWritten(result);
            // Kalıcı: manuel görüşme girişi bu planı yükleyip soruları madde
            // numarasıyla birlikte önceden doldurabilsin.
            if (onSave && position?.title) {
                await onSave({
                    schema: plan.schema,
                    fingerprint: plan.fingerprint,
                    minutes: plan.minutes,
                    probes: result,
                    starGaps: plan.starGaps,
                    generatedAt: new Date().toISOString(),
                });
            }
        } catch (e) {
            setError(e?.message || 'Sorular yazılamadı.');
        } finally {
            setWriting(false);
        }
    };

    const handleCopy = async () => {
        const text = planToText(plan, probes, {
            candidateName: candidate?.name,
            positionTitle: position?.title,
        });
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setError('Panoya kopyalanamadı. Metni elle seçip kopyalayın.');
        }
    };

    // ── Plan çıkarılamayan durumlar: her biri FARKLI bir eylem gerektirir
    if (!plan.scanned) {
        return (
            <Shell>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                    Bu aday <strong>{position?.title || 'bu pozisyon'}</strong> için derin taramadan
                    geçmemiş. Plan, taramanın açık bıraktığı maddelerden çıkarılıyor —
                    önce <strong>tarama</strong> yapılmalı.
                </p>
            </Shell>
        );
    }

    if (plan.stale) {
        return (
            <Shell>
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-800 leading-relaxed">
                        <strong>İlan bu taramadan sonra değişti.</strong> Kayıtlı değerlendirmeler madde
                        numaralarına bağlı; yeni listeye uygulanırsa plan <strong>yanlış maddeyi
                        sormaya</strong> gönderir ve bu hata odada, adayın karşısında ortaya çıkar.
                        Adayı <strong>yeniden tarayın</strong>.
                    </p>
                </div>
            </Shell>
        );
    }

    const criticalCount = plan.probes.filter((p) => p.priority === CRITICAL).length;

    return (
        <Shell>
            {/* Süre seçimi — plan buna göre yeniden dağılır */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Süre</span>
                {DURATIONS.map((d) => (
                    <button
                        key={d}
                        type="button"
                        onClick={() => setMinutes(d)}
                        className={`px-2.5 py-1 rounded-lg border text-[10px] font-black transition-colors ${
                            minutes === d
                                ? 'bg-cyan-500 border-cyan-500 text-white'
                                : 'bg-white border-slate-200 text-slate-500 hover:border-cyan-300'
                        }`}
                    >
                        {d} dk
                    </button>
                ))}
                <span className="text-[10px] text-slate-400 ml-auto">{planSummary(plan)}</span>
            </div>

            {plan.probes.length === 0 ? (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-emerald-800 leading-relaxed">
                        Taramada açık kalan madde yok — her gereksinimin CV'de karşılığı bulunmuş ve
                        fark notu düşülmemiş. Mülakat burada <strong>doğrulama</strong> için yapılır,
                        boşluk kapatmak için değil.
                    </p>
                </div>
            ) : (
                <>
                    {/* Bütçe aşımı: plan boş bırakılmadı ama görüşme dar */}
                    {plan.minutes.overBudget && (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                            <CalendarClock className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-amber-800 leading-relaxed">
                                {minutes} dakika bu adayın açık maddeleri için dar. En öncelikli madde
                                korundu ama süreye <strong>tam sığmıyor</strong>; daha uzun bir görüşme
                                ya da ikinci tur gerekebilir.
                            </p>
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleWrite}
                            disabled={writing}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white text-[10px] font-black transition-colors disabled:opacity-50"
                        >
                            {writing
                                ? <><Loader2 className="w-3 h-3 animate-spin" /> Sorular yazılıyor…</>
                                : <><Sparkles className="w-3 h-3" /> {written ? 'Soruları yeniden yaz' : 'Soruları yaz'}</>}
                        </button>
                        <button
                            type="button"
                            onClick={handleCopy}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-[10px] font-black hover:border-cyan-300 hover:text-cyan-600 transition-colors"
                        >
                            <ClipboardCopy className="w-3 h-3" /> {copied ? 'Kopyalandı' : 'Planı kopyala'}
                        </button>
                        {criticalCount > 0 && (
                            <span className="text-[10px] text-red-600 font-black ml-auto">
                                {criticalCount} kritik madde
                            </span>
                        )}
                    </div>

                    {error && (
                        <p className="text-[10px] text-red-600">{error}</p>
                    )}

                    {/* AI HİÇBİR SORUYU YAZAMADI.
                        generateProbeQuestions hata durumunda sessizce yedek
                        sorulara düşüyor — plan çalışır kalsın diye doğru bir
                        karar, ama kullanıcı bunu bilmezse jenerik soruları
                        "AI'ın adaya özel yazdığı sorular" sanır. Canlıda
                        harcama tavanı dolunca tam olarak bu oldu. */}
                    {written && written.length > 0 && written.every((p) => !p.generated) && (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-amber-800 leading-relaxed">
                                <strong>Sorular AI ile yazılamadı</strong> — aşağıdakiler hazır yedek
                                sorular. Plan yine geçerli: hangi maddeyi neden soracağınız doğru.
                                Yalnızca cümleler adaya özel değil, kendi sözlerinizle sorabilirsiniz.
                            </p>
                        </div>
                    )}

                    {/* Açılış */}
                    <Block minutes={plan.minutes.opening} title="Açılış">
                        Tanışma, sürecin akışı, adayın son rolü. Değerlendirme burada başlamaz.
                    </Block>

                    {/* Sondalar */}
                    <ol className="space-y-2">
                        {probes.map((p, i) => (
                            <ProbeCard key={p.requirementIndex} probe={p} order={i + 1} />
                        ))}
                    </ol>

                    {/* STAR — soru değil, dinleme talimatı */}
                    {plan.starGaps.length > 0 && (
                        <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5">
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <Ear className="w-3 h-3 text-violet-500" />
                                <span className="text-[10px] font-black text-violet-700 uppercase tracking-widest">
                                    Dinlerken bastır
                                </span>
                            </div>
                            <p className="text-[10px] text-violet-700/80 mb-1.5 leading-relaxed">
                                Bunlar ayrı soru değil. CV bu boyutlarda suskun — hangi soruyu sorarsanız
                                sorun, cevap buralara gelmiyorsa üstüne gidin.
                            </p>
                            <ul className="space-y-1">
                                {plan.starGaps.map((g) => (
                                    <li key={g.key} className="text-[10px] text-violet-800 leading-relaxed">
                                        <strong>{g.label}:</strong> {g.why}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Süreye sığmayanlar — sessizce kaybolmasınlar */}
                    {plan.dropped.length > 0 && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                                Süreye sığmadı — ikinci görüşmeye
                            </p>
                            <ul className="space-y-0.5">
                                {plan.dropped.map((d) => (
                                    <li key={d.requirementIndex} className="text-[10px] text-slate-600">
                                        · {d.text}
                                        {d.must && <span className="text-red-500 font-black ml-1">zorunlu</span>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Kapanış */}
                    <Block minutes={plan.minutes.closing} title="Kapanış">
                        Adayın soruları, sonraki adım ve zamanlama.
                    </Block>
                </>
            )}
        </Shell>
    );
}

function Shell({ children }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-cyan-500" />
                <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                    Mülakat Planı
                </span>
            </div>
            {children}
        </div>
    );
}

function Block({ minutes, title, children }) {
    return (
        <div className="flex items-start gap-2 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
            <span className="text-[10px] font-black text-slate-400 shrink-0 w-10">{minutes} dk</span>
            <div>
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{title}</p>
                <p className="text-[10px] text-slate-500 leading-relaxed">{children}</p>
            </div>
        </div>
    );
}

function ProbeCard({ probe, order }) {
    const tier = priorityLabel(probe.priority);
    return (
        <li className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <span className="text-[10px] font-black text-slate-400">{order}.</span>
                <span className={`px-1.5 py-0.5 rounded border text-[9px] font-black ${TONE[tier.tone]}`}>
                    {tier.text}
                </span>
                <span className="text-[10px] font-black text-slate-500">{probe.minutes} dk</span>
                {probe.must && (
                    <span className="px-1.5 py-0.5 rounded border border-red-200 bg-red-50 text-red-600 text-[9px] font-black">
                        zorunlu
                    </span>
                )}
                <span className="text-[10px] text-slate-400">
                    {STATUS_TEXT[probe.status] || probe.status}
                </span>
                {probe.priority === VERIFY && (
                    <span className="text-[10px] text-emerald-600 italic">{VERIFY_HINT}</span>
                )}
            </div>

            <p className="text-[11px] font-bold text-slate-700 leading-snug">{probe.text}</p>
            <p className="text-[10px] text-slate-400 leading-relaxed mt-0.5">{probe.why}</p>

            {/* Soru henüz yazılmadıysa kart yine de anlamlı: mülakatçı neyi
                soracağını biliyor, yalnızca cümle kurulmamış. */}
            {probe.question ? (
                <div className="mt-2 space-y-1 border-l-2 border-cyan-200 pl-2.5">
                    <p className="text-[11px] text-slate-800 leading-relaxed">{probe.question}</p>
                    {probe.followUp && (
                        <p className="text-[10px] text-slate-500 leading-relaxed">
                            <span className="font-black">Yüzeysel kalırsa:</span> {probe.followUp}
                        </p>
                    )}
                    {probe.listenFor && (
                        <p className="text-[10px] text-emerald-700 leading-relaxed">
                            <span className="font-black">İyi cevapta:</span> {probe.listenFor}
                        </p>
                    )}
                </div>
            ) : (
                <p className="mt-1.5 text-[10px] text-slate-400 italic">
                    Soru henüz yazılmadı — “Soruları yaz”a basın.
                </p>
            )}
        </li>
    );
}
