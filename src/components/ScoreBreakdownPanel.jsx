import { useState } from 'react';
import { ChevronDown, ChevronRight, Check, Minus, X, Wrench, Brain, Calculator, Quote, GitCompareArrows, RotateCcw } from 'lucide-react';
import { explainHybridScore } from '../services/geminiService';
import { requirementsOf } from '../utils/positionRequirements';
import { coverageDetailState } from '../utils/coverageDetail';

/**
 * "Bu skor neden 54?" — skorun tam kırılımı.
 *
 * Sayılar explainHybridScore'dan gelir, yani skorun KENDİ hesabından.
 * Burada yeniden hesaplanmaz; ayrı bir hesap yazılsaydı ekran zamanla
 * gerçek skordan sapar ve şeffaflık iddiası yalana dönerdi. Testler
 * madde puanlarının toplamının skora eşit kaldığını sabitliyor.
 */
export default function ScoreBreakdownPanel({ analysis, position }) {
    const [open, setOpen] = useState(false);

    if (!analysis) return null;
    const exp = explainHybridScore(analysis, requirementsOf(position));
    if (!exp.coverage && !exp.star) return null;

    const detail = coverageDetailState(analysis);

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
                    <span className="text-[11px] font-black text-cyan-600">{exp.score}</span>
                </div>
                {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            </button>

            {open && (
                <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-3">
                    {/* Üst düzey bileşim */}
                    <div className="flex flex-wrap gap-2">
                        {exp.coverage && (
                            <Chip
                                label="Gereksinim Uyumu"
                                value={`${exp.coverage.score}`}
                                weight={pct(exp.coverage.weight)}
                                points={exp.coverage.points}
                                tone="cyan"
                            />
                        )}
                        {exp.star && (
                            <Chip
                                label="Anlatım Kalitesi (STAR)"
                                value={`${exp.star.score}`}
                                weight={pct(exp.star.weight)}
                                points={exp.star.points}
                                tone="violet"
                            />
                        )}
                    </div>

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

                    {exp.coverage?.tiers?.length > 0 && (
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
                                {exp.star.dimensions.map((d) => (
                                    <div key={d.key} className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                                        <p className="text-[9px] font-black text-slate-400 uppercase">{d.key}</p>
                                        <p className="text-[13px] font-black text-slate-700">{d.score}/10</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <p className="text-[9px] text-slate-400 leading-relaxed border-t border-slate-100 pt-2">
                        Bu skor bir öneridir, karar değildir. Madde puanları toplandığında yukarıdaki
                        skoru verir; ekran gerçek hesabı gösterir, yaklaşık bir açıklama değil.
                    </p>
                </div>
            )}
        </div>
    );
}

function Chip({ label, value, weight, points, tone }) {
    const tones = {
        cyan: 'border-cyan-100 bg-cyan-50 text-cyan-700',
        violet: 'border-violet-100 bg-violet-50 text-violet-700',
    };
    return (
        <div className={`rounded-lg border px-3 py-2 ${tones[tone]}`}>
            <p className="text-[9px] font-black uppercase tracking-wider opacity-70">{label}</p>
            <p className="text-[13px] font-black">
                {value} <span className="text-[10px] font-bold opacity-70">× %{weight}</span>
                <span className="text-[10px] font-bold opacity-70"> = {Math.round(points)} puan</span>
            </p>
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
