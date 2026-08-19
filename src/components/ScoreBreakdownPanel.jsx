import { useState } from 'react';
import { ChevronDown, ChevronRight, Check, Minus, X, Wrench, Brain, Calculator, Quote, GitCompareArrows, RotateCcw, AlertTriangle } from 'lucide-react';
import { explainHybridScore } from '../services/geminiService';
import { requirementsOf } from '../utils/positionRequirements';
import { coverageDetailState, usesCurrentRubric } from '../utils/coverageDetail';
import { isStaleFor, analysisScoreDetail } from '../utils/positionScore';
import { ShieldAlert, TrendingUp } from 'lucide-react';
import { STAR_MAX, STAR_LABELS, anchorLabel } from '../utils/starDimensions';

/**
 * "Bu skor neden 54?" — skorun tam kırılımı.
 *
 * Sayılar explainHybridScore'dan gelir, yani skorun KENDİ hesabından.
 * Burada yeniden hesaplanmaz; ayrı bir hesap yazılsaydı ekran zamanla
 * gerçek skordan sapar ve şeffaflık iddiası yalana dönerdi. Testler
 * madde puanlarının toplamının skora eşit kaldığını sabitliyor.
 */
export default function ScoreBreakdownPanel({ analysis, position, candidate = null }) {
    const [open, setOpen] = useState(false);

    if (!analysis) return null;
    const exp = explainHybridScore(analysis, requirementsOf(position));
    if (!exp.coverage && !exp.star) return null;

    const detail = coverageDetailState(analysis);
    const staleRequirements = isStaleFor(analysis, position);
    // Gereksinimler aynı ama damgalama kuralı değişmişse skor yanlış değil —
    // yalnızca bugünkü ölçüyle üretilmemiş. Kırılım geçerli, uyarı yeterli.
    const oldRubric = !staleRequirements && !usesCurrentRubric(analysis);
    // Bayat kayıtta explainHybridScore hâlâ madde numaralarını eşleştirir;
    // listede gösterilen sayı ise saklanan skor. İkisi ayrışmasın diye
    // başlıktaki sayı da listedekiyle aynı kaynaktan gelir.
    // Skor TEK kaynaktan: analysisScoreDetail. Panel kendi hesabını yapsaydı
    // listeyle ayrışırdı — bu modülün en başta çözmek için yazıldığı sorun.
    // Doğrulama kesintisi de buradan geliyor, o yüzden gerçek aday belgesi
    // geçilmek zorunda; yoksa panel kesintisiz sayıyı gösterir ve liste ile
    // panel yine ayrışır.
    const scoreSource = candidate || { positionAnalyses: { [position?.title]: analysis } };
    const scoreDetail = analysisScoreDetail(scoreSource, position);
    const effect = scoreDetail.verificationEffect;
    const deductions = [...(effect?.verification?.reasons || []), ...(effect?.sector?.reasons || [])];
    // Kırılımdaki madde puanlarının toplamı DOĞRULAMA ÖNCESİ skora eşit
    // kalmalı; kesinti ayrı bir satır olarak gösteriliyor. Aksi hâlde
    // "maddelerin toplamı skoru vermiyor" diye açıklanamayan bir fark çıkardı.
    const preVerification = staleRequirements ? scoreDetail.preVerificationScore : exp.score;
    const headlineScore = effect?.applied
        ? Math.round(preVerification * effect.multiplier)
        : preVerification;

    const pct = (n) => Math.round(n * 100);

    return (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <button
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Calculator className="w-3.5 h-3.5 text-cyan-500" />
                    <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                        Skor Nasıl Hesaplandı
                    </span>
                    <span className="text-[11px] font-black text-cyan-600">{headlineScore}</span>
                </div>
                {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            </button>

            {open && (
                <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-3">
                    {/* DOĞRULAMA KESİNTİSİ.
                        Skoru sessizce düşüren bir kural, açıklanamayan bir
                        skordur. Her kesintinin sebebi ve çarpanı burada
                        yazılı; kullanıcı hangi bulgunun kaç puan götürdüğünü
                        görebilmeli, yoksa sayıya güvenemez. */}
                    {/* DOĞRULAMA ETKİSİ.
                        Skoru sessizce değiştiren bir kural, açıklanamayan bir
                        skordur. Her etkinin sebebi ve çarpanı burada yazılı.
                        İKİ YÖNLÜ: sektör uyumu skoru yükseltebiliyor ve
                        yükselen bir skoru "kesinti" diye göstermek yanlış olurdu. */}
                    {effect?.applied && (() => {
                        const bonus = effect.multiplier > 1;
                        const box = bonus ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50';
                        const txt = bonus ? 'text-emerald-700' : 'text-rose-700';
                        const Icon = bonus ? TrendingUp : ShieldAlert;
                        return (
                            <div className={`rounded-lg border px-3 py-2.5 ${box}`}>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <Icon className={`w-3.5 h-3.5 shrink-0 ${txt}`} />
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${txt}`}>
                                        {bonus ? 'Doğrulama katkısı' : 'Doğrulama kesintisi'}
                                    </span>
                                    <span className={`text-[10px] font-black ml-auto ${txt}`}>
                                        {preVerification} → {headlineScore}
                                    </span>
                                </div>
                                <ul className="space-y-1">
                                    {deductions.map((d) => (
                                        <li key={d.code} className="flex items-start justify-between gap-2 text-[10px] text-slate-700">
                                            <span className="leading-relaxed">{d.label}</span>
                                            <span className={`font-black shrink-0 ${d.factor > 1 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                ×{d.factor}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-[9px] text-slate-500 mt-1.5 leading-relaxed">
                                    Kaynak bulunamayan şirketler tek başına etki yaratmaz; ayrıntı için
                                    Doğrulama sekmesine bakın.
                                </p>
                            </div>
                        );
                    })()}

                    {/* GEREKSİNİM LİSTESİ DEĞİŞMİŞ.
                        Kayıtlı değerlendirmeler madde NUMARASINA bağlı; liste
                        değişince o numara başka bir maddeye denk gelir.
                        Canlıda ölçüldü: bayat değerlendirmeyle 77, taze
                        taramayla 65. Bu yüzden madde bazlı kırılım
                        gösterilmiyor ve skor "o günkü ilana göre" damgalı. */}
                    {staleRequirements && (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-amber-800 leading-relaxed">
                                <strong>Bu skor eski gereksinim listesine göre hesaplandı.</strong> İlan o
                                günden beri değişti; kayıtlı değerlendirmeler madde numaralarına bağlı
                                olduğu için yeni listeye uygulanamaz. Güncel skoru görmek istiyorsanız
                                adayı <strong>yeniden tarayın</strong>.
                            </p>
                        </div>
                    )}

                    {oldRubric && (
                        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <RotateCcw className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-slate-600 leading-relaxed">
                                Bu analiz, damgalama kuralı netleştirilmeden önce üretildi. Skor yanlış
                                değil ama <strong>bugünkü ölçüyle üretilmiş skorlarla kıyaslanamaz</strong> —
                                aynı listede iki farklı ölçü var demektir. Adayı yeniden tarayın.
                            </p>
                        </div>
                    )}

                    {/* Üst düzey bileşim.
                        STAR toplanan bir parça DEĞİL, çarpan: uyum skoruna
                        duyulan güveni ifade ediyor. Eskiden iki kutu yan yana
                        toplanıyordu ve alana kör bir ölçüm kötü uyumu telafi
                        edebiliyordu. */}
                    <div className="flex flex-wrap items-center gap-2">
                        {!staleRequirements && exp.coverage && (
                            <Chip label="Gereksinim Uyumu" value={`${exp.coverage.score}`} tone="cyan" />
                        )}
                        {!staleRequirements && exp.coverage && exp.star && (
                            <>
                                <span className="text-[13px] font-black text-slate-300">×</span>
                                <Chip
                                    label={`CV'deki Kanıt · STAR %${exp.star.score}`}
                                    value={exp.confidence.toFixed(2).replace('.', ',')}
                                    tone="violet"
                                />
                                <span className="text-[13px] font-black text-slate-300">=</span>
                                <Chip label="Skor" value={`${exp.score}`} tone="slate" />
                            </>
                        )}
                        {!exp.coverage && exp.star && (
                            <Chip label="CV'deki Kanıt (STAR)" value={`${exp.star.score}`} tone="violet" />
                        )}
                    </div>

                    {/* STAR HİÇ ÖLÇÜLMEMİŞSE bu skor çarpansız.
                        Sessiz kalırsak "tam güven" ile "ölçülmedi" ekranda
                        aynı görünür ve ölçülmemiş aday, STAR'ı düşük çıkan
                        adayın üstüne çıkar. Sayıyı düşürmüyoruz — ölçüm
                        yapılmamış olması adayın kusuru değil — ama farkın
                        görünmesi gerekiyor. */}
                    {!staleRequirements && exp.starMissing && (
                        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <RotateCcw className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-slate-600 leading-relaxed">
                                Bu kayıtta <strong>CV kanıt yoğunluğu (STAR) ölçülmemiş</strong>. Skor
                                kanıt güveniyle çarpılmadı, yani mümkün olan en iyi katsayıyı aldı.
                                STAR'ı ölçülmüş adaylarla doğrudan kıyaslamayın; adayı{' '}
                                <strong>yeniden tarayın</strong>.
                            </p>
                        </div>
                    )}

                    {!staleRequirements && exp.star && exp.star.penalty > 0.5 && (
                        <p className="text-[10px] text-slate-500 leading-relaxed">
                            CV'de kanıt eksik olduğu için uyum skorundan{' '}
                            <strong>{Math.round(exp.star.penalty)} puan</strong> düşüldü. Bu bir
                            nitelik yargısı değil: adayın ne yaptığını CV'den yeterince
                            göremediğimiz anlamına geliyor.
                        </p>
                    )}

                    {/* "Henüz sorulmadı" ile "soruldu, bulunamadı" farklı şeyler.
                        Dayanak alanları sonradan eklendi; gereksinim metni
                        değişmediği için parmak izi bu analizleri bayat
                        göstermez. Ayrı damga olmasa boş kutu "bu adayın
                        dayanağı yok" izlenimi verirdi. */}
                    {detail.outdated && (
                        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <RotateCcw className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-slate-600 leading-relaxed">
                                Bu analiz, madde bazlı dayanak alanları eklenmeden önce yapıldı.
                                Her maddenin CV'deki dayanağını ve ilanla farkını görmek için
                                adayı yeniden tarayın.
                            </p>
                        </div>
                    )}

                    {!staleRequirements && exp.coverage?.tiers?.length > 0 && (
                        <div className="space-y-3">
                            {exp.coverage.tiers.map((tier) => (
                                <div key={tier.key} className="space-y-1.5">
                                    <div className="flex items-baseline gap-2">
                                        <h5 className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                            {tier.label}
                                        </h5>
                                        <span className="text-[9px] text-slate-400">
                                            kapsamanın %{tier.weight}'i · karşılanma %{pct(tier.ratio)}
                                        </span>
                                    </div>
                                    {tier.groups.map((group) => (
                                        <div key={group.kind} className="space-y-1">
                                            {tier.groups.length > 1 && (
                                                <p className="text-[9px] text-slate-400 pl-0.5">
                                                    {group.label} · bu kefenin %{pct(group.share)}'i
                                                </p>
                                            )}
                                            {group.items.map((item) => (
                                                <RequirementRow key={item.index} item={item} />
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Madde bazlı değerlendirmesi olmayan eski kayıtlar */}
                    {exp.coverage && exp.coverage.tiers.length === 0 && (
                        <p className="text-[11px] text-slate-400 italic">
                            Bu analiz madde bazlı değerlendirme içermiyor (eski kayıt). Ayrıntılı
                            kırılım için adayı yeniden analiz edin.
                        </p>
                    )}

                    {exp.star && (
                        <div className="space-y-1.5">
                            <div className="flex items-baseline gap-2">
                                <Brain className="w-3 h-3 text-violet-400" />
                                <h5 className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                    STAR Kırılımı
                                </h5>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                {/* ETİKET TÜRKÇE, ÖLÇEK PAYLAŞILAN SABİTTEN.
                                    İkisi de canlıda yanlıştı:
                                    · `{d.key}` + CSS uppercase, sayfa lang="tr"
                                      olduğu için 'Situation' → SİTUATİON
                                    · `/10` sabiti 0-10 döneminden kalmış; tam
                                      not alan boyut "3/10" görünüyordu */}
                                {exp.star.dimensions.map((d) => (
                                    <div key={d.key} className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                                        <p className="text-[9px] font-black text-slate-400 uppercase">
                                            {STAR_LABELS[d.key] || d.key}
                                        </p>
                                        <p className="text-[13px] font-black text-slate-700">{d.score}/{STAR_MAX}</p>
                                        <p className="text-[8px] text-slate-400">{anchorLabel(d.score, STAR_MAX)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Bayatken "madde puanları toplandığında bu skoru verir"
                        demek yanlış olur: o puanlar zaten gösterilmiyor ve
                        başlıktaki sayı saklanan skor. */}
                    <p className="text-[9px] text-slate-400 leading-relaxed border-t border-slate-100 pt-2">
                        {staleRequirements
                            ? 'Bu skor bir öneridir, karar değildir. Yukarıdaki sayı, ilanın ESKİ hâline göre ölçülmüş kayıtlı skordur; güncel gereksinimlere göre kırılım ancak yeniden taramadan sonra gösterilebilir.'
                            : 'Bu skor bir öneridir, karar değildir. Madde puanları toplandığında yukarıdaki skoru verir; ekran gerçek hesabı gösterir, yaklaşık bir açıklama değil.'}
                    </p>
                </div>
            )}
        </div>
    );
}

function Chip({ label, value, tone }) {
    const tones = {
        cyan: 'border-cyan-100 bg-cyan-50 text-cyan-700',
        violet: 'border-violet-100 bg-violet-50 text-violet-700',
        slate: 'border-slate-200 bg-slate-50 text-slate-700',
    };
    return (
        <div className={`rounded-lg border px-3 py-2 ${tones[tone]}`}>
            <p className="text-[9px] font-black uppercase tracking-wider opacity-70">{label}</p>
            <p className="text-[13px] font-black">{value}</p>
        </div>
    );
}

const STATUS = {
    met:     { icon: Check, cls: 'text-emerald-600 bg-emerald-50 border-emerald-100', label: 'Karşılıyor' },
    partial: { icon: Minus, cls: 'text-amber-600 bg-amber-50 border-amber-100',       label: 'Kısmen' },
    missing: { icon: X,     cls: 'text-red-500 bg-red-50 border-red-100',             label: 'Karşılamıyor' },
};

function RequirementRow({ item }) {
    const cfg = STATUS[item.status] || { icon: Minus, cls: 'text-slate-400 bg-slate-50 border-slate-100', label: 'Değerlendirilmedi' };
    const Icon = cfg.icon;
    return (
        <div className="flex items-start gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5">
            <span className={`shrink-0 mt-0.5 w-4 h-4 rounded flex items-center justify-center border ${cfg.cls}`}>
                <Icon className="w-2.5 h-2.5" />
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold text-slate-700">{item.text}</span>
                    {item.kind === 'arac' && (
                        <span className="inline-flex items-center gap-0.5 text-[8px] font-black text-slate-400 uppercase">
                            <Wrench className="w-2 h-2" /> araç
                        </span>
                    )}
                </div>
                {item.note && <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">{item.note}</p>}

                {/* NASIL KARŞILIYOR.
                    Damga tek başına yetmiyordu: iki aday aynı "karşılıyor"
                    damgasını alıp bambaşka insanlar olabilir. Dayanak CV'den
                    gelir; fark, adayın ilanla NEREDE ayrıştığıdır. */}
                {item.evidence && (
                    <p className="flex items-start gap-1 text-[10px] text-slate-600 leading-relaxed mt-1">
                        <Quote className="w-2.5 h-2.5 text-slate-300 shrink-0 mt-0.5" />
                        <span>{item.evidence}</span>
                    </p>
                )}
                {item.gap && (
                    <p className="flex items-start gap-1 text-[10px] text-amber-700 leading-relaxed mt-0.5">
                        <GitCompareArrows className="w-2.5 h-2.5 text-amber-500 shrink-0 mt-0.5" />
                        <span>
                            <span className="font-black uppercase text-[9px] text-amber-600">Fark: </span>
                            {item.gap}
                        </span>
                    </p>
                )}
            </div>
            <span className="shrink-0 text-[10px] font-black text-slate-600 tabular-nums">
                {item.earned.toFixed(1)}
                <span className="text-slate-300"> / {item.max.toFixed(1)}</span>
            </span>
        </div>
    );
}
