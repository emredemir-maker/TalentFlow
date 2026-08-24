// "Bu ilan için adayları yeniden tara" diyaloğu.
//
// Neden var: bir ilanın gereksinimleri değiştiğinde adayların KAYITLI
// analizleri artık eski metne aittir, ama arayüz eski skorları güncelmiş gibi
// gösterir. Kullanıcı hem bunu fark edebilmeli hem de "şu skorun üstündekileri
// yeniden tara" diyebilmeli — tüm havuzu taramak hem yavaş hem pahalı.
//
// KAPSAM eşikten önce gelir. Eşik "yüksek skorluları tazele" demek için iyi
// ama asıl ihtiyaç farklı: gereksinimler değişince BAYAT olan analizleri
// düzeltmek. O küme parmak iziyle kesin biliniyor ve genelde çok daha küçük.
//
// Bu ayrım para: havuz domain eşleşen herkesi içeriyor (400+), oysa düzeltmesi
// gereken analiz sayısı onlarca. Varsayılan olarak tüm havuzu taratmak
// gereksiz bir maliyet.
//
// Eşik, adayın O POZİSYON için mevcut skoruna uygulanır (kayıtlı analiz ile
// ücretsiz anahtar-kelime skorunun büyüğü — scoreForPosition).
import { useMemo, useState } from 'react';
import { Target, Loader2, X, AlertCircle, Search } from 'lucide-react';

import { scoreForPosition } from '../utils/candidateTable';
import { calculateMatchScore } from '../services/matchService';
import { analysisFor, isStaleFor } from '../utils/positionScore';
import { usesCurrentRubric } from '../utils/coverageDetail';
import { resolveTargets, searchableTargets } from '../utils/rescanTargets';

/** Tarama kapsamı. */
const SCOPES = {
    stale: { label: 'Analizi eskimiş olanlar', hint: 'Gereksinimler ya da damgalama kuralı değiştiği için skoru güncel ölçüyle uyumsuz olanlar. Düzeltilmesi gereken küme bu.' },
    scanned: { label: 'Bu pozisyon için taranmış herkes', hint: 'Analizi güncel olanlar da yeniden üretilir.' },
    all: { label: 'İlgili tüm adaylar', hint: 'Hiç taranmamışlar da dahil — en pahalısı.' },
};

export default function RescanPositionModal({
    position,
    candidates,
    // TÜM havuz — yalnızca tek tek seçim için.
    //
    // `candidates` ilanın ALANINA uyan adaylardan oluşuyor. Kullanıcı "bence
    // bu aday bu ilana uyar" dediğinde sisteme bunu söyleyemiyordu: domain
    // filtresi adayı listeye bile sokmuyordu. Kararın makinede değil insanda
    // olması gerekiyor.
    //
    // Kapsam sayıları ve eşik ESKİ havuzla çalışmaya devam ediyor; yalnızca
    // arama kutusu tüm havuzu görüyor.
    allCandidates,
    isOpen,
    running,
    progress,
    onClose,
    onStart,
    reason,
}) {
    const [minScore, setMinScore] = useState('0');
    const [scope, setScope] = useState('stale');
    // Tek tek seçim. Boşsa kapsam+eşik davranışı birebir eskisi gibi çalışır —
    // toplu akış bu eklemeden etkilenmemeli.
    const [picked, setPicked] = useState(() => new Set());
    const [search, setSearch] = useState('');

    // Adayın bu pozisyondaki güncel skoru + analizinin bayat olup olmadığı.
    // calculateMatchScore {score,...} objesi döndürür; ham geçilirse skor
    // sessizce 0 olur (tabloda da aynı sarmalayıcı kullanılıyor).
    const scoreAll = useMemo(() => (list) => {
        if (!position) return [];
        const keywordScoreFn = (c, p) => calculateMatchScore(c, p).score;
        return (list || []).map((c) => {
            const analysis = analysisFor(c, position.title);
            return {
                candidate: c,
                score: Math.round(scoreForPosition(c, position, keywordScoreFn)),
                scanned: Boolean(analysis),
                // İki ayrı sebep, aynı sonuç: bu analiz yeniden üretilmeli.
                // (a) gereksinim listesi değişti → damgalar yanlış maddeye ait
                // (b) damgalama kuralı değişti → damga bugünkü ölçüyle uyumsuz
                stale: Boolean(analysis) && (isStaleFor(analysis, position) || !usesCurrentRubric(analysis)),
            };
        });
    }, [position]);

    // Kapsam ve eşik: ilanın alanına uyan havuz (eski davranış).
    const scored = useMemo(() => scoreAll(candidates), [scoreAll, candidates]);

    // Arama ve tek tek seçim: TÜM havuz. Alan dışı bir adayı taratmak
    // isteyen kullanıcı onu bulabilmeli.
    const scoredAll = useMemo(
        () => scoreAll(allCandidates?.length ? allCandidates : candidates),
        [scoreAll, allCandidates, candidates]
    );

    /** Bu aday ilanın alanına uymuyor — seçildiyse kullanıcı bilerek eziyor. */
    const relatedIds = useMemo(
        () => new Set((candidates || []).map((c) => c.id)),
        [candidates]
    );

    const counts = useMemo(() => ({
        stale: scored.filter((s) => s.stale).length,
        scanned: scored.filter((s) => s.scanned).length,
        all: scored.length,
    }), [scored]);

    const inScope = useMemo(() => scored.filter((s) => (
        scope === 'stale' ? s.stale : scope === 'scanned' ? s.scanned : true
    )), [scored, scope]);

    const threshold = Number(minScore) || 0;
    const selected = resolveTargets({ scored: scoredAll, inScope, threshold, picked });

    // Tek tek seçim yapıldıysa kapsam ve eşik devre dışı — kullanıcı zaten
    // kimi istediğini söyledi.
    const manual = picked.size > 0;

    // Kullanıcının bilerek ezdiği sistem yargısı — sayısı görünsün.
    const offDomainPicked = useMemo(
        () => [...picked].filter((id) => !relatedIds.has(id)).length,
        [picked, relatedIds]
    );

    const searchable = useMemo(
        () => searchableTargets(scoredAll, search, picked),
        [scoredAll, search, picked]
    );

    const toggle = (id) => setPicked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    if (!isOpen || !position) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-3">
            <div className="absolute inset-0 bg-n900/40 backdrop-blur-sm" onClick={running ? undefined : onClose} />
            <div className="relative w-full max-w-md bg-n0 rounded-[14px] border border-n100 shadow-sm p-3.5">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-md bg-brand flex items-center justify-center shrink-0">
                            <Target className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h3 className="text-[13px] font-semibold text-n900">Adayları Yeniden Tara</h3>
                            <p className="text-[10px] text-n500 font-semibold truncate max-w-[220px]">{position.title}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={running}
                        className="p-1.5 hover:bg-n100 rounded-lg text-n400 transition-colors disabled:opacity-40"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {reason && (
                    <div className="flex gap-2 px-3 py-2.5 rounded-md bg-warn-bg border border-transparent mb-4">
                        <AlertCircle className="w-3.5 h-3.5 text-warn shrink-0 mt-0.5" />
                        <p className="text-[10px] text-n700 leading-relaxed">{reason}</p>
                    </div>
                )}

                <div className="space-y-3">
                    {/* KAPSAM önce. Havuz domain eşleşen herkesi içeriyor;
                        varsayılan olarak hepsini taratmak yüzlerce gereksiz
                        AI çağrısı demek. Düzeltilmesi gereken küme bayat
                        olanlar ve parmak izi onu kesin biliyor. */}
                    <div className={manual ? 'opacity-40 pointer-events-none' : ''}>
                        <label className="block text-[10px] font-bold text-n600 mb-1.5">
                            Kimler taransın?
                        </label>
                        <div className="space-y-1">
                            {Object.entries(SCOPES).map(([key, cfg]) => (
                                <label
                                    key={key}
                                    className={`flex items-start gap-2 px-2.5 py-2 rounded-md border cursor-pointer transition-colors ${
                                        scope === key ? 'border-brand-200 bg-brand-50/50' : 'border-n200 hover:bg-n50'
                                    } ${counts[key] === 0 ? 'opacity-40' : ''}`}
                                >
                                    <input
                                        type="radio"
                                        name="rescan-scope"
                                        checked={scope === key}
                                        onChange={() => setScope(key)}
                                        disabled={running || counts[key] === 0}
                                        className="mt-0.5 accent-brand shrink-0"
                                    />
                                    <span className="min-w-0">
                                        <span className="text-[10px] font-bold text-n700">
                                            {cfg.label} <span className="tabular-nums text-n500">({counts[key]})</span>
                                        </span>
                                        <span className="block text-[10px] text-n400 leading-snug">{cfg.hint}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                        {counts.stale === 0 && (
                            <p className="text-[10px] text-n700 mt-1.5">
                                Bayat analiz yok — bu pozisyonun skorları güncel gereksinimlere göre hesaplanıyor.
                            </p>
                        )}
                    </div>

                    {/* TEK TEK SEÇİM.
                        Eskiden yoktu ve tek bir adayı bir ilana karşı
                        taratmanın yolu da yoktu: en dar kapsam 87 aday, en
                        genişi 440. Tek aday için 87 AI çağrısı yapmak
                        gerekiyordu. Arama TÜM havuzda çalışır — aranan aday
                        çoğu zaman seçili kapsamın dışında kalıyor. */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[10px] font-bold text-n600">
                                Ya da tek tek seçin
                            </label>
                            {manual && (
                                <button
                                    type="button"
                                    onClick={() => setPicked(new Set())}
                                    disabled={running}
                                    className="text-[10px] font-bold text-brand-600 hover:text-brand-600 disabled:opacity-40"
                                >
                                    Seçimi temizle ({picked.size})
                                </button>
                            )}
                        </div>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-n300" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                disabled={running}
                                placeholder="Aday ara — isim ya da e-posta"
                                className="w-full bg-n50 border border-n200 rounded-md pl-8 pr-3 py-2 text-[11px] text-n800 outline-none focus:border-brand focus:ring-2 focus:ring-brand-100 disabled:opacity-50"
                            />
                        </div>
                        {(search.trim() || manual) && (
                            <div className="mt-1.5 max-h-44 overflow-y-auto rounded-md border border-n200 divide-y divide-n100">
                                {searchable.length === 0 && (
                                    <p className="px-3 py-3 text-[10px] text-n400">
                                        Bu aramayla eşleşen aday yok.
                                    </p>
                                )}
                                {searchable.map((s) => (
                                    <label
                                        key={s.candidate.id}
                                        className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-n50"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={picked.has(s.candidate.id)}
                                            onChange={() => toggle(s.candidate.id)}
                                            disabled={running}
                                            className="accent-brand shrink-0"
                                        />
                                        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-n700">
                                            {s.candidate.name || '—'}
                                        </span>
                                        {s.stale && (
                                            <span className="shrink-0 px-1.5 py-px rounded bg-warn-bg border border-transparent text-[9px] font-semibold text-n700">
                                                bayat
                                            </span>
                                        )}
                                        {!s.scanned && (
                                            <span className="shrink-0 px-1.5 py-px rounded bg-n50 border border-n200 text-[9px] font-semibold text-n500">
                                                taranmamış
                                            </span>
                                        )}
                                        {/* Sistem bu adayı ilanın alanına uygun
                                            görmüyor. Seçilebilir — karar sizin —
                                            ama bilerek seçtiğinizi görün. */}
                                        {!relatedIds.has(s.candidate.id) && (
                                            <span
                                                title="Sistem bu adayı ilanın alanına uygun görmüyor; yine de taratabilirsiniz"
                                                className="shrink-0 px-1.5 py-px rounded bg-brand-50 border border-brand-100 text-[9px] font-semibold text-brand"
                                            >
                                                alan dışı
                                            </span>
                                        )}
                                        <span className="shrink-0 tabular-nums text-[10px] font-semibold text-n400">
                                            %{s.score}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        )}
                        {manual && (
                            <p className="text-[10px] text-brand-600 mt-1.5 leading-snug">
                                Seçim yaptığınız için <strong>kapsam ve eşik yok sayılıyor</strong> —
                                yalnızca işaretlediğiniz {picked.size} aday taranacak.
                                {offDomainPicked > 0 && (
                                    <>
                                        {' '}Bunların <strong>{offDomainPicked} tanesi</strong> sistemin
                                        alan dışı saydığı aday; sizin kararınızla taranacak.
                                    </>
                                )}
                            </p>
                        )}
                    </div>

                    <div className={manual ? 'opacity-40 pointer-events-none' : ''}>
                        <label className="block text-[10px] font-bold text-n600 mb-1.5">
                            Minimum uyum skoru
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                min="0"
                                max="100"
                                value={minScore}
                                onChange={(e) => setMinScore(e.target.value)}
                                disabled={running}
                                className="w-24 bg-n50 border border-n200 rounded-md px-3 py-2 text-sm text-n800 outline-none focus:border-brand focus:ring-2 focus:ring-brand-100 disabled:opacity-50"
                            />
                            <p className="text-[10px] text-n500 leading-snug">
                                Seçilen kapsamda skoru <strong>%{threshold}</strong> ve üzerinde olan
                                <strong> {selected.length}</strong> aday taranacak.
                            </p>
                        </div>
                        <p className="text-[10px] text-n400 mt-1.5">
                            0 bırakırsanız kapsamdaki tüm adaylar ({inScope.length}) taranır.
                        </p>
                    </div>

                    <div className="px-3 py-2.5 rounded-md bg-n50 border border-n100">
                        <p className="text-[10px] text-n500 leading-relaxed">
                            Her aday için <strong>1 AI çağrısı</strong> yapılır — bu tarama{' '}
                            <strong>{selected.length} çağrı</strong> demek. Bu pozisyona ait analiz yeni
                            gereksinimlere göre yeniden üretilir; diğer pozisyonların analizlerine
                            dokunulmaz.
                        </p>
                    </div>

                    {running && progress && (
                        <div className="px-3 py-2.5 rounded-md bg-brand-50 border border-brand-100 flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 text-brand animate-spin shrink-0" />
                            <p className="text-[10px] font-semibold text-brand-600">
                                Taranıyor — {progress.done} / {progress.total}
                            </p>
                        </div>
                    )}
                </div>

                <div className="mt-5 flex gap-2">
                    <button
                        onClick={onClose}
                        disabled={running}
                        className="flex-1 py-2.5 rounded-md bg-n100 hover:bg-n200 text-n600 font-bold text-xs transition-colors disabled:opacity-50"
                    >
                        {running ? 'Kapat' : 'Şimdi Değil'}
                    </button>
                    <button
                        onClick={() => onStart(selected.map((s) => s.candidate))}
                        disabled={running || selected.length === 0}
                        className="flex-[2] py-2.5 rounded-md bg-brand hover:bg-brand-600 text-white font-semibold text-xs uppercase tracking-[0.08em] transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {running
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Taranıyor…</>
                            : <>{selected.length} Adayı Tara</>}
                    </button>
                </div>
            </div>
        </div>
    );
}
