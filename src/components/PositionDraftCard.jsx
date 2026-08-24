// İLAN TASLAĞI KARTI — öneri burada durur, kayıt burada OLMAZ.
//
// Asistan taslağı üretir; bu kart onu görünür ve düzeltilebilir kılar. Tek
// eylem düğmesi "İlan formunda aç": taslak mevcut Yeni Pozisyon formuna
// taşınır ve kaydetme kararı orada, kullanıcıda kalır. Asistan `positions`
// koleksiyonuna hiçbir koşulda yazmaz.
//
// ── ÖNERİLEN MADDE AYRI GÖRÜNÜR ─────────────────────────────────────────────
// Kullanıcının söylediği madde ile modelin eklediği madde aynı görünürse,
// kullanıcı ikincisini kendi yazdığı sanır ve o madde gerçek adayları eler.
// "öneri" rozeti bunun için var.

import { useState } from 'react';
import { AlertTriangle, ArrowRight, Info, Loader2, Search, Sparkles } from 'lucide-react';

import { lintDraft, withBand } from '../utils/positionDraft';
import { internalBand } from '../utils/internalBand';
import { formatBand } from '../utils/salaryBand';
import { researchMarket } from '../services/ai/marketResearch';

export default function PositionDraftCard({ draft, positions = [], onUpdateDraft, onOpenForm }) {
    const [marketState, setMarketState] = useState('idle'); // idle | busy | done | error
    const [market, setMarket] = useState(null);
    const [marketError, setMarketError] = useState('');

    const findings = lintDraft(draft);
    // Kendi ilanlarınız: hiçbir AI çağrısı yakmaz, her render'da hesaplanır.
    const own = internalBand(positions, { department: draft.department, excludeTitle: draft.title });

    const lookUpMarket = async () => {
        setMarketState('busy');
        setMarketError('');
        try {
            const res = await researchMarket({
                title: draft.title,
                level: draft.level || '',
                location: draft.location || '',
            });
            setMarket(res);
            setMarketState('done');
        } catch (err) {
            setMarketError(err?.message || 'Piyasa araştırması yapılamadı.');
            setMarketState('error');
        }
    };

    const attach = (band, source) => onUpdateDraft?.(withBand(draft, band, source));

    return (
        <div className="rounded-md border border-brand-100 bg-brand-50 px-3 py-2.5 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand">
                        <Sparkles className="w-2.5 h-2.5" /> İlan taslağı
                    </p>
                    <p className="text-[12px] font-semibold text-n900 truncate">{draft.title || 'Başlıksız'}</p>
                    <p className="text-[10px] text-n500">
                        {[draft.level, draft.location, draft.department].filter(Boolean).join(' · ') || 'seviye/konum belirtilmedi'}
                    </p>
                </div>
            </div>

            {draft.summary && (
                <p className="text-[11px] text-n600 leading-relaxed">{draft.summary}</p>
            )}

            {/* MADDELER — öncelik işarette, kaynak rozette. */}
            <div className="rounded-md border border-n200 bg-n0 divide-y divide-n100">
                {draft.items.length === 0 && (
                    <p className="px-2.5 py-2 text-[11px] text-n400 italic">Madde üretilemedi.</p>
                )}
                {draft.items.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 px-2.5 py-1.5">
                        <span className={`shrink-0 mt-0.5 px-1.5 rounded text-[11px] font-semibold ${
                            item.must ? 'bg-bad-bg text-bad-text' : 'bg-n100 text-n500'
                        }`}>
                            {item.must ? 'zorunlu' : 'tercihen'}
                        </span>
                        <span className="flex-1 min-w-0 text-[11px] text-n700 leading-relaxed">{item.text}</span>
                        {/* Modelin eklediği madde: kullanıcı neyi onayladığını görmeli. */}
                        {item.source === 'model' && (
                            <span
                                title="Bunu siz söylemediniz — benim önerim"
                                className="shrink-0 mt-0.5 px-1.5 py-px rounded bg-brand-50 text-brand text-[11px] font-semibold"
                            >
                                öneri
                            </span>
                        )}
                    </div>
                ))}
            </div>

            {/* KOD TARAFININ ÖLÇTÜĞÜ KUSURLAR — hiçbiri kaydetmeyi engellemez. */}
            {findings.length > 0 && (
                <ul className="space-y-1">
                    {findings.map((f, i) => (
                        <li
                            key={i}
                            className={`flex items-start gap-1.5 text-[10px] leading-relaxed ${
                                f.level === 'warn' ? 'text-warn' : 'text-n500'
                            }`}
                        >
                            {f.level === 'warn'
                                ? <AlertTriangle className="w-2.5 h-2.5 shrink-0 mt-0.5" />
                                : <Info className="w-2.5 h-2.5 shrink-0 mt-0.5" />}
                            {f.text}
                        </li>
                    ))}
                </ul>
            )}

            {draft.assumptions?.length > 0 && (
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-n400 mb-0.5">Varsaydıklarım</p>
                    <ul className="space-y-0.5">
                        {draft.assumptions.map((a, i) => (
                            <li key={i} className="text-[10px] text-n500 leading-relaxed">• {a}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Eksikler SORU biçiminde: cevaplayınca taslak düzelir. */}
            {draft.gaps?.length > 0 && (
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-n400 mb-0.5">Söylemediğiniz şeyler</p>
                    <ul className="space-y-0.5">
                        {draft.gaps.map((g, i) => (
                            <li key={i} className="text-[10px] text-n600 leading-relaxed">• {g}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* ── BÜTÇE ─────────────────────────────────────────────────────── */}
            <div className="rounded-md border border-n200 bg-n0 px-2.5 py-2 space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-n400">Bütçe bandı</p>

                {draft.band ? (
                    <p className="text-[11px] text-n700">
                        Taslağa eklendi: <strong>{formatBand(draft.band)}</strong>{' '}
                        <span className="text-n400">
                            ({draft.bandSource === 'market' ? 'piyasa' : 'kendi ilanlarınız'})
                        </span>
                    </p>
                ) : (
                    <p className="text-[10px] text-n400">Henüz band eklenmedi — formda elle de girebilirsiniz.</p>
                )}

                {/* KENDİ İLANLARINIZ — ücretsiz, ölçülmüş kendi verimiz. */}
                {own.band ? (
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-n600">
                            Kendi ilanlarınız ({own.count}): <strong>{formatBand(own.band)}</strong>
                        </span>
                        <button
                            type="button"
                            onClick={() => attach(own.band, 'internal')}
                            className="text-[10px] font-semibold text-brand hover:text-brand-700"
                        >
                            Taslağa ekle
                        </button>
                    </div>
                ) : (
                    // Sayının YOKLUĞUNUN sebebi yazılır: "band yok" ile "yeterli
                    // veri yok" farklı şeyler ve kullanıcı ayırt edebilmeli.
                    <p className="text-[10px] text-n400 leading-relaxed">{own.reason}</p>
                )}

                {/* PİYASA — bir AI çağrısı yakar, o yüzden İSTEĞE BAĞLI. */}
                {marketState !== 'done' && (
                    <button
                        type="button"
                        onClick={lookUpMarket}
                        disabled={marketState === 'busy' || !draft.title}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand hover:text-brand-700 disabled:opacity-40"
                    >
                        {marketState === 'busy'
                            ? <><Loader2 className="w-2.5 h-2.5 animate-spin" /> Piyasaya bakılıyor…</>
                            : <><Search className="w-2.5 h-2.5" /> Piyasa bandına bak</>}
                    </button>
                )}
                {marketState === 'error' && <p className="text-[10px] text-warn">{marketError}</p>}

                {market && (
                    <div className="space-y-1 pt-1 border-t border-n200">
                        {market.band ? (
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] text-n600">
                                    Piyasa: <strong>{formatBand(market.band)}</strong>
                                    {market.date ? ` · ${market.date}` : ''}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => attach(market.band, 'market')}
                                    className="text-[10px] font-semibold text-brand hover:text-brand-700"
                                >
                                    Taslağa ekle
                                </button>
                            </div>
                        ) : (
                            <p className="text-[10px] text-warn leading-relaxed">
                                {!market.withheld
                                    ? 'Bu rol için kaynaklı bir bant bulunamadı.'
                                    : market.withheldReason === 'searched-uncited'
                                        ? 'Arama yapıldı ama model hiçbir sayfayı kaynak göstermedi — rakamı göstermiyorum.'
                                        : 'Bir bant üretildi ama hiçbir kaynağa dayanmıyor — rakamı göstermiyorum.'}
                            </p>
                        )}
                        {market.sources?.length > 0 && (
                            <div className="space-y-0.5">
                                {market.sources.slice(0, 3).map((s) => (
                                    <a
                                        key={s.uri}
                                        href={s.uri}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block text-[10px] text-brand hover:underline truncate"
                                    >
                                        {s.title || s.uri}
                                    </a>
                                ))}
                            </div>
                        )}
                        {/* Google'ın gösterim şartı: arama önerisi bloğu olduğu gibi. */}
                        {market.searchSuggestionHtml && (
                            <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: market.searchSuggestionHtml }} />
                        )}
                    </div>
                )}

                {/* Bazı bilinmeyen bandı forma TAŞIMIYORUZ: formun brüt/net
                    seçicisinin boş seçeneği yok ve varsayılanı "brüt" —
                    bilinmeyen bir şeyi brüt diye iddia etmek olurdu. */}
                {draft.band && !draft.band.basis && (
                    <p className="text-[10px] text-warn leading-relaxed">
                        Bu bandın brüt/net bilgisi yok; forma taşımıyorum. Rakamı formda kendiniz
                        girip birimini seçin.
                    </p>
                )}
            </div>

            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={onOpenForm}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand hover:bg-brand-600 text-white text-[12px] font-semibold"
                >
                    İlan formunda aç <ArrowRight className="w-3 h-3" />
                </button>
                <span className="text-[10px] text-n400 leading-snug">
                    Kaydetme formda, sizde. Düzeltmek için yazın: &quot;zorunluları üçe indir&quot;.
                </span>
            </div>
        </div>
    );
}
