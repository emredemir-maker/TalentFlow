// TEK GÖRÜŞME SATIRI — öneri, alıntı ve alanlar YAN YANA.
//
// Neden modal değil: 60 görüşme için 60 modal açtırmak herkesi "kabul, kabul,
// kabul" demeye iter ve onayı ritüele çevirir. Onayın bir anlamı olacaksa
// dayanağı — yani alıntı — kararın verildiği yerde görünmek zorunda.
//
// Transkript satırın içinde açılıyor: model bulamadığında kullanıcı rakamı
// elle yazacak ve bunu ancak metni okuyarak yapabilir. Başka bir ekrana
// göndermek, işi yarıda bıraktırır.

import { useState } from 'react';
import { CheckCircle2, ChevronDown, Loader2, Quote } from 'lucide-react';

import { draftToBand, sourceOf } from '../utils/salaryBackfill';
import { formatBand, CURRENCIES, CURRENCY_LABEL, PERIODS, PERIOD_LABEL, BASES, BASIS_LABEL } from '../utils/salaryBand';

const FIELD_CLS = 'bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-violet-300 disabled:bg-slate-50 disabled:text-slate-400';

/** Satırın durumu — rozet metni ve rengi. */
const BADGES = {
    idle: { text: 'taranmadı', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
    busy: { text: 'taranıyor', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
    found: { text: 'öneri var', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
    none: { text: 'rakam geçmiyor', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
    rejected: { text: 'öneri reddedildi', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
    error: { text: 'taranamadı', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    skipped: { text: 'transkript yok', cls: 'bg-slate-50 text-slate-400 border-slate-200' },
};

export default function SalaryBackfillRow({ row, draft, hint, status = 'idle', error = '', saved = false, onDraft, onAccept, onReject }) {
    const [openTranscript, setOpenTranscript] = useState(false);

    const band = draftToBand(draft);
    // Öneri kabul edildi mi: rakamlar hâlâ modelin bulduğu rakamlar mı?
    // Kullanıcı üstüne yazdıysa satır artık "elle girilmiş" sayılır.
    const accepted = Boolean(hint) && Boolean(band) && sourceOf(draft, hint).source === 'transcript';
    const badge = BADGES[status] || BADGES.idle;

    const set = (patch) => onDraft?.(patch);

    return (
        <div className={`rounded-xl border px-3 py-2.5 space-y-2 ${saved ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'}`}>
            {/* Kimlik */}
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-[11px] font-black text-slate-800 truncate">{row.candidateName}</p>
                    <p className="text-[10px] text-slate-400 truncate">
                        {row.positionTitle || 'pozisyon bağlı değil'}
                        {row.date ? ` · ${row.date}` : ''}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {band && (
                        <span className="text-[10px] font-bold text-slate-600 tabular-nums">{formatBand(band)}</span>
                    )}
                    {saved ? (
                        <span className="px-1.5 py-px rounded border text-[9px] font-black bg-emerald-50 text-emerald-700 border-emerald-200">
                            kaydedildi
                        </span>
                    ) : (
                        <span className={`px-1.5 py-px rounded border text-[9px] font-black ${badge.cls}`}>
                            {status === 'busy' && <Loader2 className="inline w-2.5 h-2.5 mr-1 animate-spin" />}
                            {badge.text}
                        </span>
                    )}
                </div>
            </div>

            {/* ÖNERİ ALINTISIYLA GELİR. Dayanağı görünmeyen bir sayıyı
                onaylatmak, onayı anlamsızlaştırır. */}
            {hint && !saved && (
                <div className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-2 space-y-1.5">
                    <div className="flex items-start gap-2">
                        <Quote className="w-3 h-3 text-violet-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-violet-900">
                                Transkriptte: <strong>{formatBand(hint)}</strong>
                            </p>
                            <p className="text-[10px] text-violet-700 italic">&ldquo;{hint.quote}&rdquo;</p>
                            {hint.uncertain && (
                                <p className="text-[10px] text-amber-700 mt-0.5">Emin değil: {hint.uncertain}</p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {accepted ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-violet-700">
                                <CheckCircle2 className="w-3 h-3" /> Kabul edildi
                            </span>
                        ) : (
                            <button type="button" onClick={onAccept}
                                className="px-2 py-0.5 rounded-md bg-violet-500 hover:bg-violet-600 text-white text-[10px] font-black uppercase tracking-wider">
                                Kabul et
                            </button>
                        )}
                        <button type="button" onClick={onReject}
                            className="px-2 py-0.5 rounded-md border border-violet-200 text-violet-700 text-[10px] font-black uppercase tracking-wider hover:bg-violet-100">
                            Reddet
                        </button>
                    </div>
                </div>
            )}

            {status === 'error' && !saved && (
                <p className="text-[10px] text-amber-700">{error || 'Tarama yapılamadı; alanı elle doldurabilirsiniz.'}</p>
            )}

            {/* Alanlar — model bulamadıysa da burada, elle yazılabilir. */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                <input type="text" inputMode="numeric" placeholder="Alt" value={draft.min} disabled={saved}
                    onChange={(e) => set({ min: e.target.value })} className={FIELD_CLS} />
                <input type="text" inputMode="numeric" placeholder="Üst" value={draft.max} disabled={saved}
                    onChange={(e) => set({ max: e.target.value })} className={FIELD_CLS} />
                <select value={draft.currency} disabled={saved} onChange={(e) => set({ currency: e.target.value })} className={FIELD_CLS}>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c} {CURRENCY_LABEL[c]}</option>)}
                </select>
                <select value={draft.period} disabled={saved} onChange={(e) => set({ period: e.target.value })} className={FIELD_CLS}>
                    {PERIODS.map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
                </select>
                <select value={draft.basis} disabled={saved} onChange={(e) => set({ basis: e.target.value })} className={FIELD_CLS}>
                    <option value="">brüt/net?</option>
                    {BASES.map((b) => <option key={b} value={b}>{BASIS_LABEL[b]}</option>)}
                </select>
            </div>

            {/* BAZ YOKSA BU RAKAM KARŞILAŞTIRMAYA GİRMEZ. Kaydedilir ama fark
                raporunda "bilinmiyor" kefesinde kalır — kullanıcı kaydettiği
                şeyin nereye gideceğini kaydetmeden önce bilmeli. */}
            {band && !band.basis && !saved && (
                <p className="text-[10px] text-amber-700">
                    Brüt/net seçilmedi — bu rakam kaydedilir ama bütçe karşılaştırmasına girmez.
                </p>
            )}

            {/* Transkript — rakamı elle yazacak kişi metni burada okur. */}
            {row.transcript ? (
                <div>
                    <button type="button" onClick={() => setOpenTranscript((o) => !o)}
                        className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-slate-600">
                        <ChevronDown className={`w-3 h-3 transition-transform ${openTranscript ? 'rotate-180' : ''}`} />
                        Transkript
                    </button>
                    {openTranscript && (
                        <pre className="mt-1 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 border border-slate-100 p-2 text-[10px] leading-relaxed text-slate-600">
                            {row.transcript}
                        </pre>
                    )}
                </div>
            ) : (
                <p className="text-[10px] text-slate-400">Bu görüşmenin transkripti yok — rakamı elle yazabilirsiniz.</p>
            )}
        </div>
    );
}
