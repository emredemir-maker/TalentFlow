import { useState } from 'react';
import { Loader2, Info, X, Globe } from 'lucide-react';
import { splitByTerms } from '../utils/termSpotting';
import { explainTerm } from '../services/ai/termExplainer';

/**
 * İçindeki terimleri tıklanabilir yapan metin.
 *
 * İhtiyaç: STAR değerlendirmesinde "PLG akışında CAC'ı düşürdü" yazıyor ve
 * okuyan kişi bunların ne olduğunu bilmiyor. Detaya boğmadan, merak edince
 * açılan bir açıklama.
 *
 * Terimler KODLA bulunuyor (termSpotting), AI yalnızca bulunan terimi
 * açıklıyor. Modele "bu metinde hangi terimler var" diye sormak aynı metinde
 * her açılışta farklı kelimeleri işaretlerdi.
 *
 * Açıklama ÖLÇÜM DEĞİL — modelin genel bilgisi. Rozeti bu yüzden var:
 * veriden gelen sayılarla aynı görünürse kullanıcı ikisine aynı güveni duyar.
 */
export default function TermText({ text, position }) {
    const [open, setOpen] = useState(null);
    const [cache, setCache] = useState(() => new Map());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const parts = splitByTerms(text);
    if (parts.length === 0) return null;

    const ask = async (term) => {
        if (open === term) { setOpen(null); return; }
        setOpen(term);
        setError(null);
        if (cache.has(term)) return;
        setLoading(true);
        try {
            const explained = await explainTerm(term, { position, context: text });
            setCache((prev) => new Map(prev).set(term, explained));
        } catch (err) {
            setError(err?.message || 'Açıklama alınamadı.');
        } finally {
            setLoading(false);
        }
    };

    const shown = open ? cache.get(open) : null;

    return (
        <>
            <p className="text-[12px] text-slate-600 leading-relaxed">
                {parts.map((p, i) => (p.term ? (
                    <button
                        key={i}
                        type="button"
                        onClick={() => ask(p.term)}
                        title={`"${p.term}" nedir?`}
                        className={`underline decoration-dotted decoration-slate-300 underline-offset-2 hover:decoration-cyan-500 hover:text-cyan-700 transition-colors ${
                            open === p.term ? 'text-cyan-700 decoration-cyan-500' : ''
                        }`}
                    >
                        {p.text}
                    </button>
                ) : (
                    <span key={i}>{p.text}</span>
                )))}
            </p>

            {open && (
                <div className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                        {/* Kaynaklıysa "aramayla bulundu", değilse "modelin
                            hafızası" — ikisi aynı rozeti taşıyamaz. */}
                        {shown?.grounded ? (
                            <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-emerald-600">
                                <Globe className="w-2.5 h-2.5" /> Google aramasıyla · kaynaklı
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-amber-600">
                                <Info className="w-2.5 h-2.5" /> Genel bilgi · doğrulanmadı
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={() => setOpen(null)}
                            className="text-slate-300 hover:text-slate-500 shrink-0"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </div>

                    {loading && !shown && (
                        <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                            <Loader2 className="w-3 h-3 animate-spin" /> Bakıyorum…
                        </p>
                    )}
                    {error && <p className="text-[11px] text-red-600">{error}</p>}

                    {shown && (
                        <>
                            {shown.meaning && (
                                <p className="text-[11px] text-slate-700 leading-relaxed">
                                    <strong>{open}</strong> — {shown.meaning}
                                </p>
                            )}
                            {shown.why && (
                                <p className="text-[11px] text-slate-600 leading-relaxed">
                                    <span className="font-black uppercase text-[9px] text-slate-400">Bu işte: </span>
                                    {shown.why}
                                </p>
                            )}
                            {/* Okuyanın terime fazla anlam yüklemesini engelleyen satır */}
                            {shown.caution && (
                                <p className="text-[10px] text-slate-500 italic leading-relaxed">
                                    {shown.caution}
                                </p>
                            )}
                            {!shown.meaning && !shown.why && (
                                <p className="text-[11px] text-slate-500 italic">
                                    Bu terim için güvenilir bir açıklama üretilemedi.
                                </p>
                            )}

                            {/* Kaynaklar — kullanıcı iddiayı izleyebilsin */}
                            {shown.sources?.length > 0 && (
                                <div className="pt-1 border-t border-slate-200 space-y-0.5">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Kaynaklar</p>
                                    {shown.sources.slice(0, 4).map((s) => (
                                        <a
                                            key={s.uri}
                                            href={s.uri}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block text-[10px] text-cyan-700 hover:underline truncate"
                                        >
                                            {s.title}
                                        </a>
                                    ))}
                                </div>
                            )}

                            {/* Google'ın gösterim şartı: arama önerisi bloğu
                                grounding kullanıldığında OLDUĞU GİBİ gösterilmek
                                zorunda. Süs değil, kullanım koşulu. */}
                            {shown.searchSuggestionHtml && (
                                <div
                                    className="pt-1 overflow-x-auto"
                                    dangerouslySetInnerHTML={{ __html: shown.searchSuggestionHtml }}
                                />
                            )}
                        </>
                    )}
                </div>
            )}
        </>
    );
}
