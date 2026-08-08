import { useMemo, useState } from 'react';
import { Sparkles, AlertTriangle, Info, Loader2, Wrench, Users, ChevronRight, Check, RotateCcw } from 'lucide-react';
import {
    reviewRequirements, flaggedRequirements, FLAG_LABELS, MIN_SAMPLE, candidatesByRequirements,
} from '../utils/requirementReview';
import { suggestRequirementRewrites } from '../services/ai/requirementAdvisor';
import { normalizeAction, ACTION_LABELS, DEMOTE, REMOVE } from '../utils/requirementEdit';

/** Danışmanın kararı — tanınmayan/boş değer "yeniden yaz" sayılır. */
const actionOf = (s) => normalizeAction(s?.action);

/**
 * "Bu gereksinimi neden istiyoruz?"
 *
 * Sayılar ÖLÇÜLÜR (requirementReview, AI'sız); AI yalnızca işaretli maddeler
 * için alternatif ifade önerir. Modele doğrudan "bu gereksinim gerekli mi?"
 * diye sormak her ilana uyan cümleler üretirdi.
 *
 * Hiçbir şeyi otomatik değiştirmez — öneri sunar, düzenlemeyi kullanıcı yapar.
 */
export default function RequirementReviewPanel({ position, candidates, onCandidateClick, onApplySuggestion }) {
    const [suggestions, setSuggestions] = useState(null);
    // Seçilen gereksinimler → canlı aday listesi. Asıl kullanım "bu maddeyi
    // kaldırsam kim geri gelir?" sorusunu görmek.
    const [picked, setPicked] = useState(() => new Set());
    const [mode, setMode] = useState('meets');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const review = useMemo(
        () => reviewRequirements(position, candidates),
        [position, candidates]
    );
    const flagged = useMemo(() => flaggedRequirements(review), [review]);
    const pickedList = useMemo(() => [...picked].sort((a, b) => a - b), [picked]);
    const filtered = useMemo(
        () => candidatesByRequirements(position, candidates, { indexes: pickedList, mode }),
        [position, candidates, pickedList, mode]
    );

    const togglePick = (index) => setPicked((prev) => {
        const next = new Set(prev);
        if (next.has(index)) next.delete(index); else next.add(index);
        return next;
    });

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

            {/* BİRLEŞİK GEÇİŞ — ilanın gerçek darlığı.
                Tek tek eleme oranları bunu göstermiyor: adaylar FARKLI
                maddelerde elendiği için hiçbir madde yüksek görünmese bile
                hepsini birden geçen aday sayısı çok düşük olabilir. */}
            {review.mustCount > 0 && review.mustPassRate !== null && (
                <div className={`rounded-lg border px-3 py-2 ${
                    review.mustPassRate < 0.1
                        ? 'bg-red-50 border-red-100 text-red-700'
                        : review.mustPassRate < 0.25
                            ? 'bg-amber-50 border-amber-100 text-amber-700'
                            : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                }`}>
                    <p className="text-[11px] leading-relaxed">
                        Değerlendirilen <strong>{review.mustEvaluated}</strong> adayın{' '}
                        <strong>{review.mustPass}</strong> tanesi{' '}
                        <strong>{review.mustCount} zorunlu maddenin tamamını</strong> karşılıyor
                        {' '}(%{Math.round(review.mustPassRate * 100)}).
                        {review.mustPassRate < 0.1 && ' Bu ilan pratikte neredeyse hiç aday geçirmiyor — zorunluların bir kısmını tercihene almayı düşünün.'}
                    </p>
                </div>
            )}

            {/* BAYAT ANALİZ UYARISI.
                Kullanıcı öneriyi uygulayıp aynı öneriyi tekrar aldığını
                bildirdi. Sebebi buydu: panel kayıtlı analizlerden okuyor ve o
                analizler ESKİ gereksinim metnine ait. Metni değiştirmek
                yargıyı değiştirmiyor — yeniden tarama gerekiyor. */}
            {review.stale > 0 && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    <RotateCcw className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                        <strong>{review.stale}</strong> adayın analizi gereksinimlerin ESKİ hâline ait
                        {review.fresh > 0 ? <> (yalnızca {review.fresh} tanesi güncel)</> : null}.
                        Aşağıdaki bulgular ve öneriler o eski metne göre hesaplandı —
                        gereksinimleri değiştirdiyseniz <strong>derin taramayı yeniden çalıştırın</strong>,
                        aksi hâlde aynı öneriyi tekrar alırsınız.
                    </p>
                </div>
            )}

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
                                <label className="flex items-start gap-2 flex-1 min-w-0 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={picked.has(it.index)}
                                        onChange={() => togglePick(it.index)}
                                        className="mt-0.5 accent-cyan-500 shrink-0"
                                    />
                                    <span className="text-[11px] font-bold text-slate-700 min-w-0">
                                        {it.index}. {it.text}
                                    </span>
                                </label>
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
                                    {/* Danışmanın KARARI. Önce görünmüyordu ve
                                        uygulanmıyordu: kullanıcı "tercihene al"
                                        önerisini uyguluyor, madde zorunlu kalıyordu. */}
                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                        actionOf(s) === REMOVE
                                            ? 'bg-red-50 text-red-600 border border-red-100'
                                            : actionOf(s) === DEMOTE
                                                ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                                    }`}>
                                        {ACTION_LABELS[actionOf(s)]}
                                    </span>
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
                                    {onApplySuggestion && (s.suggestion || actionOf(s) === REMOVE) && (
                                        <button
                                            onClick={() => onApplySuggestion(it.index, s)}
                                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-white text-[9px] font-black uppercase tracking-wider transition-colors ${
                                                actionOf(s) === REMOVE
                                                    ? 'bg-red-500 hover:bg-red-600'
                                                    : 'bg-cyan-500 hover:bg-cyan-600'
                                            }`}
                                        >
                                            <Check className="w-3 h-3" /> {ACTION_LABELS[actionOf(s)]}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Seçime göre canlı aday listesi.
                "31/86 eleniyor" sayısı tek başına karar verdirmiyor; hangi
                maddeyi kaldırınca kimin havuza geri geldiğini görmek gerek. */}
            {pickedList.length > 0 && (
                <div className="rounded-lg border border-cyan-100 bg-cyan-50/40 px-3 py-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-[11px] text-slate-700">
                            <strong>{pickedList.length}</strong> madde seçili ·{' '}
                            <strong>{filtered.matched.length}</strong> aday{' '}
                            {mode === 'meets' ? 'tamamını karşılıyor' : 'en az birinde eleniyor'}
                            <span className="text-slate-400"> / {filtered.evaluated} değerlendirilen</span>
                        </p>
                        <div className="flex items-center gap-1">
                            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                                {[['meets', 'Karşılayan'], ['misses', 'Elenen']].map(([m, label]) => (
                                    <button
                                        key={m}
                                        onClick={() => setMode(m)}
                                        className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider transition-colors ${
                                            mode === m ? 'bg-cyan-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => setPicked(new Set())}
                                className="px-2 py-0.5 rounded-lg border border-slate-200 bg-white text-[9px] font-black text-slate-500 uppercase hover:bg-slate-50"
                            >
                                Temizle
                            </button>
                        </div>
                    </div>

                    {filtered.skipped > 0 && (
                        <p className="text-[10px] text-slate-400">
                            {filtered.skipped} aday sayıma girmedi: seçilen maddelerden biri onlar için
                            hiç değerlendirilmemiş.
                        </p>
                    )}

                    {filtered.matched.length === 0 ? (
                        <p className="text-[11px] text-slate-500 italic">
                            Bu seçimle eşleşen aday yok.
                        </p>
                    ) : (
                        <div className="max-h-64 overflow-y-auto space-y-1">
                            {filtered.matched.slice(0, 100).map((c) => (
                                <button
                                    key={c.id}
                                    onClick={() => onCandidateClick?.(c)}
                                    disabled={!onCandidateClick}
                                    className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-slate-100 hover:border-cyan-300 transition-colors text-left disabled:cursor-default disabled:hover:border-slate-100"
                                >
                                    <span className="text-[11px] font-bold text-slate-700 truncate">
                                        {c.name || 'İsimsiz aday'}
                                    </span>
                                    <span className="flex items-center gap-1.5 shrink-0">
                                        {c.location && (
                                            <span className="text-[9px] text-slate-400">{c.location}</span>
                                        )}
                                        <span className="text-[10px] font-black text-slate-600 tabular-nums">
                                            {Math.round(
                                                Number(c.positionAnalyses?.[position.title]?.score)
                                                || Number(c.bestScore) || 0
                                            )}
                                        </span>
                                        {onCandidateClick && <ChevronRight className="w-3 h-3 text-slate-300" />}
                                    </span>
                                </button>
                            ))}
                            {filtered.matched.length > 100 && (
                                <p className="text-[10px] text-slate-400 pt-1">
                                    İlk 100 gösteriliyor · toplam {filtered.matched.length}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}

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
