import { useMemo, useState } from 'react';
import { Sparkles, AlertTriangle, Info, Loader2, Wrench, Users } from 'lucide-react';
import { reviewRequirements, flaggedRequirements, FLAG_LABELS, MIN_SAMPLE } from '../utils/requirementReview';
import { suggestRequirementRewrites } from '../services/ai/requirementAdvisor';

/**
 * "Bu gereksinimi neden istiyoruz?"
 *
 * Sayılar ÖLÇÜLÜR (requirementReview, AI'sız); AI yalnızca işaretli maddeler
 * için alternatif ifade önerir. Modele doğrudan "bu gereksinim gerekli mi?"
 * diye sormak her ilana uyan cümleler üretirdi.
 *
 * Hiçbir şeyi otomatik değiştirmez — öneri sunar, düzenlemeyi kullanıcı yapar.
 */
export default function RequirementReviewPanel({ position, candidates }) {
    const [suggestions, setSuggestions] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const review = useMemo(
        () => reviewRequirements(position, candidates),
        [position, candidates]
    );
    const flagged = useMemo(() => flaggedRequirements(review), [review]);

    if (review.items.length === 0) return null;

    const byIndex = new Map((suggestions || []).map((s) => [Number(s.index), s]));

    const runAdvisor = async () => {
        setLoading(true);
        setError(null);
        try {
            setSuggestions(await suggestRequirementRewrites(position, flagged));
        } catch (err) {
            setError(err?.message || 'Öneri alınamadı.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-3.5 rounded-full bg-cyan-500" />
                    <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                        Gereksinim Gözden Geçirme
                    </h3>
                </div>
                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Users className="w-3 h-3" />
                    {review.scanned} taranmış adaya göre
                </span>
            </div>

            {/* Örneklem uyarısı — oran üretmeden önce bunu söylemek şart.
                Az veriyle üretilmiş bir "havuzun %90'ını eliyor" cümlesi
                kullanıcıyı ilanını yanlış değiştirmeye iter. */}
            {!review.enoughData && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                        Bu pozisyon için derin taraması yapılmış <strong>{review.scanned}</strong> aday var;
                        oran üretmek için en az {MIN_SAMPLE} gerekiyor. Önce eşikli derin taramayı
                        çalıştırın — aksi hâlde buradaki sayılar yanıltıcı olur.
                    </p>
                </div>
            )}

            <div className="space-y-2">
                {review.items.map((it) => {
                    const s = byIndex.get(it.index);
                    const hasFlags = it.flags.length > 0;
                    return (
                        <div
                            key={it.index}
                            className={`rounded-lg border px-3 py-2 ${hasFlags ? 'border-amber-100 bg-amber-50/40' : 'border-slate-100'}`}
                        >
                            <div className="flex items-start gap-2 flex-wrap">
                                <span className="text-[11px] font-bold text-slate-700 flex-1 min-w-0">
                                    {it.index}. {it.text}
                                </span>
                                <span className="flex items-center gap-1 shrink-0">
                                    {it.must === true && (
                                        <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[9px] font-black text-slate-500 uppercase">
                                            Zorunlu
                                        </span>
                                    )}
                                    {it.kind === 'arac' && (
                                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[9px] font-black text-slate-500 uppercase">
                                            <Wrench className="w-2 h-2" /> Araç
                                        </span>
                                    )}
                                    {it.eliminationRate !== null && (
                                        <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[9px] font-black text-slate-600 tabular-nums">
                                            {it.eliminated}/{it.evaluated} eleniyor
                                        </span>
                                    )}
                                </span>
                            </div>

                            {hasFlags && (
                                <ul className="mt-1.5 space-y-1">
                                    {it.flags.map((f) => {
                                        const lbl = FLAG_LABELS[f];
                                        if (!lbl) return null;
                                        return (
                                            <li key={f} className="flex items-start gap-1.5">
                                                <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                                                <span className="text-[10px] text-slate-600 leading-relaxed">
                                                    <strong>{lbl.title}</strong>
                                                    {f === 'redundant' && it.redundantWith.length > 0
                                                        ? ` (madde ${it.redundantWith.join(', ')})`
                                                        : ''}
                                                    {' — '}{lbl.detail}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}

                            {s && (
                                <div className="mt-2 rounded-lg border border-cyan-100 bg-white px-2.5 py-2 space-y-1">
                                    {s.why && (
                                        <p className="text-[10px] text-slate-500">
                                            <span className="font-black uppercase text-[9px] text-slate-400">Aslında ölçtüğü: </span>
                                            {s.why}
                                        </p>
                                    )}
                                    {s.suggestion && (
                                        <p className="text-[11px] text-slate-700 leading-relaxed">
                                            <span className="font-black uppercase text-[9px] text-cyan-600">Öneri: </span>
                                            {s.suggestion}
                                        </p>
                                    )}
                                    {s.rationale && (
                                        <p className="text-[10px] text-slate-400 italic leading-relaxed">{s.rationale}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {error && (
                <p className="text-[11px] text-red-600">{error}</p>
            )}

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 flex-wrap">
                <p className="text-[9px] text-slate-400 leading-relaxed max-w-md">
                    Sayılar taranmış adaylardan hesaplanır, AI üretmez. Öneriler yalnızca
                    tavsiyedir; hiçbir gereksinim otomatik değiştirilmez.
                </p>
                <button
                    onClick={runAdvisor}
                    disabled={loading || flagged.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white text-[10px] font-black uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                    {loading
                        ? <><Loader2 className="w-3 h-3 animate-spin" /> Öneriler hazırlanıyor…</>
                        : <><Sparkles className="w-3 h-3" /> {flagged.length > 0 ? `${flagged.length} madde için öneri al` : 'Gözden geçirilecek madde yok'}</>}
                </button>
            </div>
        </div>
    );
}
