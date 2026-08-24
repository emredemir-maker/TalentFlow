import { useState } from 'react';
import { X, Check, AlertTriangle, Wand2, ArrowRight } from 'lucide-react';
import { verifyNormalization } from '../utils/requirementNormalize';

/**
 * Düzenleyicinin ÖNİZLEMESİ.
 *
 * Bu akış ilanın metnini değiştiriyor, yani skorları ve kimin elendiğini
 * değiştiriyor. Onaysız uygulamak kabul edilemez: kullanıcı önce/sonra
 * görmeli ve istemediği maddeyi çıkarabilmeli.
 *
 * Denetim de burada gösteriliyor. Model bir gereksinim uydurduysa ya da bir
 * konuyu düşürdüyse kod bunu yakalar ve KIRMIZI olarak yazar — sessizce
 * uygulamak, ilan metnini fark edilmeden bozmak olurdu.
 */
export default function RequirementNormalizeModal({
    isOpen, loading, error, original, proposal, onCancel, onApply,
}) {
    const [dropped, setDropped] = useState(() => new Set());
    // Maddeler burada DÜZENLENEBİLİR tutuluyor: model bazen yanlış kefeye
    // koyuyor ve kullanıcı bunu listeye yazmadan önce düzeltebilmeli.
    //
    // Öneri geldiğinde bileşen çağıran tarafından YENİDEN MOUNT ediliyor
    // (key), o yüzden effect ile eşitlemeye gerek yok — effect içinde state
    // kurmak gereksiz bir render turu ve kaçırılması kolay bir bağımlılık
    // listesi demekti.
    const [items, setItems] = useState(() => (proposal?.items || []).map((r) => ({ ...r })));

    if (!isOpen) return null;

    const kept = items.filter((_, i) => !dropped.has(i));
    const check = verifyNormalization(original || '', kept);
    const mustCount = kept.filter((r) => r.must).length;

    const toggle = (i) => setDropped((prev) => {
        const next = new Set(prev);
        if (next.has(i)) next.delete(i); else next.add(i);
        return next;
    });

    const setMust = (i, must) => setItems((prev) => prev.map((r, j) => (j === i ? { ...r, must } : r)));

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-3">
            <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
                <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 shrink-0">
                    <h2 className="flex items-center gap-1.5 text-[10px] font-black text-slate-700 uppercase tracking-widest">
                        <Wand2 className="w-3.5 h-3.5 text-cyan-500" /> Maddelere Ayır — Önizleme
                    </h2>
                    <button type="button" onClick={onCancel} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                        <X className="w-4 h-4" />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                    {loading && (
                        <p className="text-[10px] text-slate-500">Maddeler ayrıştırılıyor…</p>
                    )}
                    {error && <p className="text-[10px] text-red-600">{error}</p>}

                    {!loading && !error && items.length === 0 && (
                        <p className="text-[10px] text-slate-500 italic">
                            Ayrılacak bir şey bulunamadı — maddeler zaten tekil görünüyor.
                        </p>
                    )}

                    {items.length > 0 && (
                        <>
                            <p className="text-[10px] text-slate-500 leading-relaxed">
                                <strong>{kept.length}</strong> madde ·{' '}
                                <strong>{mustCount}</strong> zorunlu, <strong>{kept.length - mustCount}</strong> tercihen.
                                Kefeyi değiştirebilir, istemediğinizin işaretini kaldırabilirsiniz;
                                onaylamadan hiçbir şey değişmez.
                            </p>

                            {/* Denetim: model uydurduysa ya da düşürdüyse burada yazar */}
                            {check.invented.length > 0 && (
                                <Alert tone="red" title="Girdide olmayan madde">
                                    {check.invented.map((v) => (
                                        <p key={v.text} className="text-[10px] leading-relaxed">
                                            “{v.text}” — bu metinde geçmeyen ifadeler içeriyor
                                            ({v.unknownWords.slice(0, 5).join(', ')}). Uydurulmuş bir şart
                                            gerçek adayları eler; onaylamadan önce kontrol edin.
                                        </p>
                                    ))}
                                </Alert>
                            )}
                            {check.dropped.length > 0 && (
                                <Alert tone="amber" title="Kaybolan içerik">
                                    <p className="text-[10px] leading-relaxed">
                                        Girdideki şu ifadeler hiçbir maddeye girmedi:{' '}
                                        <strong>{check.dropped.slice(0, 8).join(', ')}</strong>.
                                        Eksik bir gereksinim, kritik bir eksiği görünmez kılar.
                                    </p>
                                </Alert>
                            )}

                            <div className="space-y-1.5">
                                {items.map((it, i) => (
                                    <div
                                        key={`${it.text}-${i}`}
                                        className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                                            dropped.has(i) ? 'border-slate-100 bg-slate-50 opacity-50' : 'border-slate-200'
                                        }`}
                                    >
                                        <label className="flex items-start gap-2 min-w-0 flex-1 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={!dropped.has(i)}
                                                onChange={() => toggle(i)}
                                                className="mt-0.5 accent-cyan-500 shrink-0"
                                            />
                                            <span className="text-[10px] text-slate-700 leading-relaxed">{it.text}</span>
                                        </label>
                                        {/* Öncelik burada DEĞİŞTİRİLEBİLİR: model kefeyi yanlış
                                            seçebiliyor ve bunu kutulara yazmadan önce düzeltmek,
                                            sonradan ilanı tekrar açıp düzenlemekten kolay. */}
                                        <span className="flex rounded-lg border border-slate-200 overflow-hidden shrink-0">
                                            {[[true, 'Zorunlu'], [false, 'Tercihen']].map(([value, label]) => (
                                                <button
                                                    key={label}
                                                    type="button"
                                                    onClick={() => setMust(i, value)}
                                                    disabled={dropped.has(i)}
                                                    className={`px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider transition-colors ${
                                                        it.must === value
                                                            ? 'bg-cyan-500 text-white'
                                                            : 'bg-white text-slate-400 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    {label}
                                                </button>
                                            ))}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {proposal?.notes?.length > 0 && (
                                <ul className="space-y-0.5 pt-1">
                                    {proposal.notes.map((n) => (
                                        <li key={n} className="flex items-start gap-1 text-[10px] text-slate-500">
                                            <ArrowRight className="w-2.5 h-2.5 shrink-0 mt-0.5 text-slate-300" />
                                            {n}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    )}
                </div>

                <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-100 shrink-0">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wider hover:bg-slate-50"
                    >
                        Vazgeç
                    </button>
                    <button
                        type="button"
                        onClick={() => onApply(kept)}
                        disabled={loading || kept.length === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-40"
                    >
                        <Check className="w-3 h-3" /> Kutulara yaz ({kept.length})
                    </button>
                </footer>
            </div>
        </div>
    );
}

function Alert({ tone, title, children }) {
    const cls = tone === 'red'
        ? 'border-red-100 bg-red-50 text-red-700'
        : 'border-amber-100 bg-amber-50 text-amber-800';
    return (
        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${cls}`}>
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wider">{title}</p>
                {children}
            </div>
        </div>
    );
}
