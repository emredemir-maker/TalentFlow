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
    ChevronDown, Loader2, Sparkles, Target,
} from 'lucide-react';

import {
    buildInterviewPlan, planToText, priorityLabel, planSummary, CRITICAL, VERIFY,
} from '../utils/interviewPlan';
import { generateProbeQuestions } from '../services/ai/interviewPlanner';
import { aiErrorHint } from '../utils/aiErrorHint';

const DURATIONS = [30, 45, 60, 90];

const TONE = {
    red: 'bg-bad-bg text-bad border-transparent',
    amber: 'bg-warn-bg text-warn border-warn',
    sky: 'bg-sky-50 text-sky-700 border-sky-200',
    slate: 'bg-n50 text-n600 border-n200',
    emerald: 'bg-ok-bg text-ok border-transparent',
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
    // Soru üretimi neden başarısız oldu — uyarı kutusunda gösteriliyor.
    const [writeError, setWriteError] = useState('');

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
        setWriteError('');
        try {
            const { probes: result, error: sebep } = await generateProbeQuestions(plan, candidate, position);
            setWritten(result);
            setWriteError(sebep || '');
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
            <Shell ozet="önce derin tarama gerekli">
                <p className="text-[11px] text-n500 leading-relaxed">
                    Bu aday <strong>{position?.title || 'bu pozisyon'}</strong> için derin taramadan
                    geçmemiş. Plan, taramanın açık bıraktığı maddelerden çıkarılıyor —
                    önce <strong>tarama</strong> yapılmalı.
                </p>
            </Shell>
        );
    }

    if (plan.stale) {
        return (
            <Shell ozet="ilan taramadan sonra değişti">
                <div className="flex items-start gap-2 rounded-md border bg-warn-bg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-warn shrink-0 mt-0.5" />
                    <p className="text-[10px] text-n700 leading-relaxed">
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
        <Shell ozet={`${minutes} dk · ${planSummary(plan)}`}>
            {/* Süre seçimi — plan buna göre yeniden dağılır */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold text-n400 uppercase tracking-[0.08em]">Süre</span>
                {DURATIONS.map((d) => (
                    <button
                        key={d}
                        type="button"
                        onClick={() => setMinutes(d)}
                        className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-colors ${
                            minutes === d
                                ? 'bg-brand border-transparent text-white'
                                : 'bg-n0 border-n200 text-n500 hover:border-brand-200'
                        }`}
                    >
                        {d} dk
                    </button>
                ))}
                <span className="text-[10px] text-n400 ml-auto">{planSummary(plan)}</span>
            </div>

            {plan.probes.length === 0 ? (
                <div className="flex items-start gap-2 rounded-md border border-transparent bg-ok-bg px-3 py-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-ok shrink-0 mt-0.5" />
                    <p className="text-[10px] text-ok leading-relaxed">
                        Taramada açık kalan madde yok — her gereksinimin CV'de karşılığı bulunmuş ve
                        fark notu düşülmemiş. Mülakat burada <strong>doğrulama</strong> için yapılır,
                        boşluk kapatmak için değil.
                    </p>
                </div>
            ) : (
                <>
                    {/* Bütçe aşımı: plan boş bırakılmadı ama görüşme dar */}
                    {plan.minutes.overBudget && (
                        <div className="flex items-start gap-2 rounded-md border bg-warn-bg px-3 py-2">
                            <CalendarClock className="w-3.5 h-3.5 text-warn shrink-0 mt-0.5" />
                            <p className="text-[10px] text-n700 leading-relaxed">
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
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand hover:bg-brand-600 text-white text-[11px] font-semibold transition-colors disabled:opacity-50"
                        >
                            {writing
                                ? <><Loader2 className="w-3 h-3 animate-spin" /> Sorular yazılıyor…</>
                                : <><Sparkles className="w-3 h-3" /> {written ? 'Soruları yeniden yaz' : 'Soruları yaz'}</>}
                        </button>
                        <button
                            type="button"
                            onClick={handleCopy}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-n0 border border-n200 text-n600 text-[11px] font-semibold hover:border-brand-200 hover:text-brand transition-colors"
                        >
                            <ClipboardCopy className="w-3 h-3" /> {copied ? 'Kopyalandı' : 'Planı kopyala'}
                        </button>
                        {criticalCount > 0 && (
                            <span className="text-[10px] text-bad font-semibold ml-auto">
                                {criticalCount} kritik madde
                            </span>
                        )}
                    </div>

                    {error && (
                        <p className="text-[10px] text-bad">{error}</p>
                    )}

                    {/* AI HİÇBİR SORUYU YAZAMADI.
                        generateProbeQuestions hata durumunda sessizce yedek
                        sorulara düşüyor — plan çalışır kalsın diye doğru bir
                        karar, ama kullanıcı bunu bilmezse jenerik soruları
                        "AI'ın adaya özel yazdığı sorular" sanır. Canlıda
                        harcama tavanı dolunca tam olarak bu oldu. */}
                    {written && written.length > 0 && written.every((p) => !p.generated) && (
                        <div className="flex items-start gap-2 rounded-md border bg-warn-bg px-3 py-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-warn shrink-0 mt-0.5" />
                            <p className="text-[10px] text-n700 leading-relaxed">
                                <strong>Sorular AI ile yazılamadı</strong> — aşağıdakiler hazır yedek
                                sorular. Plan yine geçerli: hangi maddeyi neden soracağınız doğru.
                                Yalnızca cümleler adaya özel değil, kendi sözlerinizle sorabilirsiniz.
                                {/* SEBEP YAZILI. Eskiden yalnızca konsola düşüyordu; kullanıcı
                                    kotanın mı dolduğunu yoksa cevabın mı kesildiğini
                                    ayırt edemiyordu ve aynı düğmeye tekrar tekrar basıyordu. */}
                                {writeError && (
                                    <>
                                        {' '}<span className="text-n600">Sebep: {writeError}</span>
                                        {aiErrorHint(writeError).hint && (
                                            <> {aiErrorHint(writeError).hint}</>
                                        )}
                                    </>
                                )}
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
                        <div className="rounded-md border border-brand-100 bg-brand-50 px-3 py-2.5">
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <Ear className="w-3 h-3 text-brand" />
                                <span className="text-[10px] font-semibold text-brand-700 uppercase tracking-[0.08em]">
                                    Dinlerken bastır
                                </span>
                            </div>
                            <p className="text-[10px] text-brand-700/80 mb-1.5 leading-relaxed">
                                Bunlar ayrı soru değil. CV bu boyutlarda suskun — hangi soruyu sorarsanız
                                sorun, cevap buralara gelmiyorsa üstüne gidin.
                            </p>
                            <ul className="space-y-1">
                                {plan.starGaps.map((g) => (
                                    <li key={g.key} className="text-[10px] text-n700 leading-relaxed">
                                        <strong>{g.label}:</strong> {g.why}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Süreye sığmayanlar — sessizce kaybolmasınlar */}
                    {plan.dropped.length > 0 && (
                        <div className="rounded-md border border-n200 bg-n50 px-3 py-2.5">
                            <p className="text-[10px] font-semibold text-n500 uppercase tracking-[0.08em] mb-1.5">
                                Süreye sığmadı — ikinci görüşmeye
                            </p>
                            <ul className="space-y-0.5">
                                {plan.dropped.map((d) => (
                                    <li key={d.requirementIndex} className="text-[10px] text-n600">
                                        · {d.text}
                                        {d.must && <span className="text-bad font-semibold ml-1">zorunlu</span>}
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

/**
 * PANEL VARSAYILAN OLARAK KAPALI.
 *
 * Ölçüm (1440×900, gerçekçi veriyle): STAR sekmesinin toplam yüksekliği
 * 1952 px, görünür alan 632 px — üç ekrandan fazla kaydırma. Sekmenin
 * ikinci satırı tek başına 998 px ve bunun tamamını BU panel belirliyordu:
 * yanındaki iki madde kolonu 212 px'ti, yani satırın 786 px'i BOŞTU.
 * Kullanıcı boşluğu kaydırıyordu.
 *
 * Panel silinmedi, katlandı: STAR sekmesi "bu skor neden bu?" sorusunu
 * cevaplıyor; plan ise ayrı bir iş — "odada ne soracağım". Kapalıyken
 * başlık satırı planın ÖZETİNİ taşıyor (süre, sonda sayısı, kritik madde),
 * yani bilgi kaybolmuyor; yalnızca ayrıntı isteğe bağlı hâle geliyor.
 *
 * Tercih localStorage'da: her açılışta yeniden katlamak, paneli sürekli
 * kullanan birine her seferinde aynı tıklamayı yaptırırdı.
 */
const ACIK_ANAHTAR = 'tf-mulakat-plani-acik';
const acikOku = () => {
    try {
        return localStorage.getItem(ACIK_ANAHTAR) === '1';
    } catch {
        return false;
    }
};
const acikYaz = (v) => {
    try {
        localStorage.setItem(ACIK_ANAHTAR, v ? '1' : '0');
    } catch {
        /* depolama yok — tercih yalnızca bu oturumda */
    }
};

function Shell({ children, ozet }) {
    const [acik, setAcik] = useState(acikOku);
    const degistir = () => { setAcik((v) => { acikYaz(!v); return !v; }); };

    return (
        <div className="rounded-md border border-n200 bg-n0 p-3">
            <button
                type="button"
                onClick={degistir}
                aria-expanded={acik}
                title={ozet || 'Mülakat Planı'}
                className="w-full flex items-center gap-2 text-left py-1 -my-1"
            >
                <Target className="w-3.5 h-3.5 text-brand shrink-0" />
                <span className="text-[10px] font-semibold text-n700 uppercase tracking-[0.08em]">
                    Mülakat Planı
                </span>
                {ozet && (
                    <span className="text-[10px] text-n400 truncate">{ozet}</span>
                )}
                <ChevronDown
                    className={`w-3.5 h-3.5 text-n400 shrink-0 ml-auto transition-transform duration-200 ${acik ? '' : '-rotate-90'}`}
                />
            </button>
            {acik && <div className="space-y-3 mt-3">{children}</div>}
        </div>
    );
}

function Block({ minutes, title, children }) {
    return (
        <div className="flex items-start gap-2 rounded-md bg-n50 border border-n200 px-3 py-2">
            <span className="text-[10px] font-semibold text-n400 shrink-0 w-10">{minutes} dk</span>
            <div>
                <p className="text-[10px] font-semibold text-n600 uppercase tracking-[0.08em]">{title}</p>
                <p className="text-[10px] text-n500 leading-relaxed">{children}</p>
            </div>
        </div>
    );
}

function ProbeCard({ probe, order }) {
    const tier = priorityLabel(probe.priority);
    return (
        <li className="rounded-md border border-n200 bg-n0 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <span className="text-[10px] font-semibold text-n400">{order}.</span>
                <span className={`px-1.5 py-0.5 rounded border text-[11px] font-semibold ${TONE[tier.tone]}`}>
                    {tier.text}
                </span>
                <span className="text-[10px] font-semibold text-n500">{probe.minutes} dk</span>
                {probe.must && (
                    <span className="px-1.5 py-0.5 rounded border border-transparent bg-bad-bg text-bad-text text-[11px] font-semibold">
                        zorunlu
                    </span>
                )}
                <span className="text-[10px] text-n400">
                    {STATUS_TEXT[probe.status] || probe.status}
                </span>
                {probe.priority === VERIFY && (
                    <span className="text-[10px] text-ok italic">{VERIFY_HINT}</span>
                )}
            </div>

            <p className="text-[11px] font-semibold text-n700 leading-snug">{probe.text}</p>
            <p className="text-[10px] text-n400 leading-relaxed mt-0.5">{probe.why}</p>

            {/* Soru henüz yazılmadıysa kart yine de anlamlı: mülakatçı neyi
                soracağını biliyor, yalnızca cümle kurulmamış. */}
            {probe.question ? (
                <div className="mt-2 space-y-1 border-l-2 border-brand-100 pl-2.5">
                    <p className="text-[11px] text-n900 leading-relaxed">{probe.question}</p>
                    {probe.followUp && (
                        <p className="text-[10px] text-n500 leading-relaxed">
                            <span className="font-semibold">Yüzeysel kalırsa:</span> {probe.followUp}
                        </p>
                    )}
                    {probe.listenFor && (
                        <p className="text-[10px] text-ok leading-relaxed">
                            <span className="font-semibold">İyi cevapta:</span> {probe.listenFor}
                        </p>
                    )}
                </div>
            ) : (
                <p className="mt-1.5 text-[10px] text-n400 italic">
                    Soru henüz yazılmadı — “Soruları yaz”a basın.
                </p>
            )}
        </li>
    );
}
