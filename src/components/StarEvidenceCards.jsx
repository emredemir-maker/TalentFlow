import { ShieldCheck, HelpCircle, AlertTriangle, Info, Lock } from 'lucide-react';
import { normalizeStarAnalysis, anchorLabel } from '../utils/starDimensions';
import TermText from './TermText';

const STEPS = {
    Situation: { k: 'S', l: 'DURUM', bg: 'bg-blue-50',    border: 'border-blue-100',    tc: 'text-blue-700' },
    Task:      { k: 'T', l: 'GÖREV', bg: 'bg-teal-50',    border: 'border-teal-100',    tc: 'text-teal-700' },
    Action:    { k: 'A', l: 'EYLEM', bg: 'bg-violet-50',  border: 'border-violet-100',  tc: 'text-violet-700' },
    Result:    { k: 'R', l: 'SONUÇ', bg: 'bg-emerald-50', border: 'border-emerald-100', tc: 'text-emerald-700' },
};

/**
 * STAR kartları — kanıt ölçeği.
 *
 * Eski tasarım her boyut için bir "Pozitif" ve bir "Negatif" gösteriyordu.
 * Ölçtüğümüz şey tek kutuplu ("CV'de ne kadar kanıt var") olduğu için negatif
 * tarafta yazacak gerçek bir şey çoğu zaman yoktu ve model kaçamak
 * üretiyordu — aynı boyutta çelişen iki cümle çıkıyordu.
 *
 * Şimdi üç ayrı kova:
 *   Kanıt            — CV'de gerçekten yazan
 *   Mülakatta Sorul. — CV'de olmayan. KUSUR DEĞİL: aday gizlilik yükümlülüğü
 *                      ya da yer kısıtı yüzünden yazmamış olabilir.
 *   Tutarsızlık      — yalnızca gerçek çelişki. Nadir olmalı.
 */
export default function StarEvidenceCards({ starAnalysis, position, narrativeError }) {
    const dims = normalizeStarAnalysis(starAnalysis);
    if (!dims) return null;

    const isLegacy = dims.some((d) => d.legacy);

    // PUAN VAR AMA TEK SATIR GEREKÇE YOK — bunun söylenmesi gerekiyor.
    //
    // Kartlar bu durumda yalnızca başlık ve "3/3 Ölçülmüş" rozetini basıyordu;
    // gövdeleri bomboştu. Kullanıcı defalarca yeniden analiz etti ve neden
    // dolmadığını hiçbir yerden öğrenemedi — çünkü ekran eksikliği hiç
    // bildirmiyordu, sadece boş duruyordu.
    //
    // İki sebebi var ve ikisi de farklı iş gerektiriyor:
    //   - Kayıt, metinleri yanlış yerden okuyan sürümle üretilmiş → yeniden tara
    //   - Anlatım çağrısı o taramada düştü → sebebi `narrativeError` taşıyor
    const noText = dims.every((d) => !d.evidence && !d.missing && !d.conflict);

    return (
        <div className="space-y-2">
            {noText && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                        <strong>Bu analizde gerekçe metinleri yok.</strong> Puanlar geçerli — onlar
                        ayrı bir çağrıdan geliyor — ama &quot;CV&apos;de ne yazıyor&quot; kısmı
                        kaydedilmemiş.{' '}
                        {narrativeError
                            ? <>Sebep: <span className="font-mono">{narrativeError}</span></>
                            : <>Kayıt, metinleri yanlış yerden okuyan bir sürümle üretilmiş olabilir.</>}
                        {' '}Doldurmak için <strong>Yeniden Analiz Et</strong> deyin.
                    </p>
                </div>
            )}
            {isLegacy && (
                <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                        Bu analiz eski değerlendirme biçiminde üretilmiş. Eski &quot;negatif&quot; notları
                        çoğunlukla bir kusur değil, CV&apos;de bulunmayan bilgiydi; burada
                        <strong> Mülakatta Sorulacaklar </strong> olarak gösteriliyor.
                        Güncel ölçekle görmek için analizi yeniden çalıştırın.
                    </p>
                </div>
            )}

            {dims.map((d) => {
                const step = STEPS[d.key];
                const label = anchorLabel(d.score, d.max);
                return (
                    <div key={d.key} className={`rounded-xl border ${step.border} ${step.bg} p-3`}>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <div className={`w-6 h-6 rounded-md bg-white border ${step.border} flex items-center justify-center text-[11px] font-black ${step.tc} shadow-sm shrink-0`}>
                                {step.k}
                            </div>
                            <h4 className={`text-[11px] font-black uppercase tracking-wider ${step.tc}`}>{step.l}</h4>
                            <span className={`text-[10px] font-medium opacity-60 ${step.tc}`}>({d.key})</span>
                            <span className="ml-auto flex items-center gap-1.5">
                                {d.confidentiality && (
                                    <span
                                        title="Aday gizlilik yükümlülüğü nedeniyle ayrıntı vermediğini belirtmiş. Bu bir eksiklik değildir ve puanı etkilemez."
                                        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[9px] font-black text-slate-500 uppercase"
                                    >
                                        <Lock className="w-2.5 h-2.5" /> Gizlilik
                                    </span>
                                )}
                                {label && (
                                    <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[9px] font-black text-slate-500 uppercase">
                                        {label}
                                    </span>
                                )}
                                <span className={`text-[11px] font-black ${step.tc}`}>{d.score}/{d.max}</span>
                            </span>
                        </div>

                        <div className="space-y-2">
                            {d.evidence && (
                                <Bucket
                                    icon={<ShieldCheck className="w-3 h-3" />}
                                    title="Kanıt"
                                    tone="border-emerald-100 text-emerald-600"
                                    text={d.evidence}
                                    position={position}
                                />
                            )}
                            {d.missing && (
                                <Bucket
                                    icon={<HelpCircle className="w-3 h-3" />}
                                    title="Mülakatta Sorulacak"
                                    tone="border-amber-100 text-amber-600"
                                    text={d.missing}
                                    position={position}
                                />
                            )}
                            {d.conflict && (
                                <Bucket
                                    icon={<AlertTriangle className="w-3 h-3" />}
                                    title="Tutarsızlık"
                                    tone="border-red-100 text-red-500"
                                    text={d.conflict}
                                />
                            )}
                            {!d.evidence && !d.missing && !d.conflict && (
                                <p className="text-[12px] text-slate-400 italic">
                                    CV&apos;de bu boyuta dair bilgi bulunamadı.
                                </p>
                            )}
                        </div>
                    </div>
                );
            })}

            <p className="text-[9px] text-slate-400 leading-relaxed pt-1">
                Bu bölüm adayın niteliğini değil, CV&apos;de ne kadar kanıt bulunduğunu ölçer.
                Bilginin CV&apos;de olmaması bir kusur değildir — gizlilik yükümlülüğü, yer kısıtı
                ya da yazım alışkanlığı olabilir. Kesin rakam şart değildir: aralık, oran ve
                ölçek bilgisi (ekip boyutu, kullanıcı mertebesi) de kanıt sayılır.
            </p>
        </div>
    );
}

function Bucket({ icon, title, tone, text, position }) {
    return (
        <div className={`bg-white border px-3 py-2 rounded-lg ${tone.split(' ')[0]}`}>
            <div className={`flex items-center gap-1 text-[9px] font-black uppercase mb-1 ${tone.split(' ')[1]}`}>
                {icon} {title}
            </div>
            {/* Metindeki terimler tıklanabilir: okuyan kişi "PLG neymiş"
                diye merak edince ayrılmadan öğrenebilsin. */}
            <TermText text={text} position={position} />
        </div>
    );
}
