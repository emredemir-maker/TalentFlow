import { useCallback, useEffect, useRef, useState } from 'react';
import {
    MessageSquare, X, Send, Loader2, AlertTriangle, Info, ChevronRight, Sparkles, RotateCcw,
    ThumbsUp, ThumbsDown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import { runCandidateQuery, queryNeedsPosition } from '../utils/candidateQuery';
import { questionToQuery, narrateResult } from '../services/ai/hrAssistant';
import { buildContext } from '../utils/assistantContext';
import { loadChat, saveChat, clearChat } from '../services/assistantChatStore';
import { toolById, capabilityMessage, TOOLS } from '../services/ai/assistantTools';
import { buildInterviewReview, reviewSummaryForPrompt } from '../utils/interviewReview';
import { narrateInterviewReview } from '../services/ai/interviewReviewer';
import { loadInterviewEntries } from '../services/interviewReviewLoader';
import { saveFeedback } from '../services/assistantFeedback';

/**
 * İK Asistanı — doğal dilde veri sorgulama.
 *
 * Mimari kural: model SORGUYU üretir, CEVABI kod üretir. Her cevabın altında
 * "hangi filtreleri uyguladım, kaç adayı değerlendiremedim" kutusu var —
 * kullanıcı sayıya güvenmek zorunda kalmasın, doğrulayabilsin.
 *
 * Bu sürüm yalnızca OKUR. Hiçbir şeyi değiştirmez, tarama başlatmaz.
 */

// Örnekler ARAÇ KAYDINDAN gelir. Elle tutulan bir liste, araç eklendiğinde
// güncellenmeyi unutulur ve kullanıcıya asistanın yapabildiklerinden azını
// gösterir.
const ORNEKLER = TOOLS.flatMap((t) => t.examples).slice(0, 6);

export default function HrAssistantPanel() {
    const [open, setOpen] = useState(false);
    const [question, setQuestion] = useState('');
    const [busy, setBusy] = useState(false);
    const [turns, setTurns] = useState([]);
    const [contextPosition, setContextPosition] = useState(null);
    // Kalıcılık hatası sohbeti DURDURMAZ ama saklanmaz da: sessizce kaydedilmiş
    // gibi davranmak, kullanıcının yenilemede her şeyi kaybetmesi demek olurdu.
    const [persistError, setPersistError] = useState('');

    const { user } = useAuth();
    const { enrichedCandidates, setViewCandidateId } = useCandidates();
    const { positions } = usePositions();
    const endRef = useRef(null);
    const uid = user?.uid || '';

    // Kayıtlı sohbeti bir kez yükle — panel ilk açıldığında.
    const loadedRef = useRef(false);
    useEffect(() => {
        if (!open || !uid || loadedRef.current) return;
        loadedRef.current = true;
        loadChat(uid)
            .then((saved) => { if (saved.length > 0) setTurns(saved); })
            .catch((err) => setPersistError(`Kayıtlı sohbet okunamadı: ${err.message}`));
    }, [open, uid]);

    /** Turları kalıcı hâle yaz; hata olursa sessiz kalma, söyle. */
    const persist = useCallback((next) => {
        if (!uid) return;
        saveChat(uid, next)
            .then(() => setPersistError(''))
            .catch((err) => setPersistError(`Sohbet kaydedilemedi: ${err.message}`));
    }, [uid]);

    /**
     * Geri bildirim — Faz 7 (öğrenme) bunu kullanacak, bugün yalnızca toplanır.
     * Toplanmamış geri bildirim sonradan üretilemez; o yüzden düğme şimdi var.
     */
    const sendFeedback = useCallback((index, verdict, note = '') => {
        setTurns((prev) => prev.map((t, i) => (i === index ? { ...t, feedback: verdict } : t)));
        if (!uid) return;
        saveFeedback(uid, {
            question: turns[index - 1]?.text || '',
            tool: turns[index]?.spec?.tool || null,
            verdict,
            note,
        }).catch((err) => setPersistError(`Geri bildirim kaydedilemedi: ${err.message}`));
    }, [turns, uid]);

    const newTopic = useCallback(() => {
        setTurns([]);
        setPersistError('');
        if (uid) clearChat(uid).catch(() => { /* temizlik hatası akışı durdurmaz */ });
    }, [uid]);

    // Sayfa bağlamı: ilan detayı açıkken kullanıcı "bu pozisyonda…" diyebilsin.
    useEffect(() => {
        const onContext = (e) => setContextPosition(e.detail?.positionTitle || null);
        window.addEventListener('assistant-context', onContext);
        return () => window.removeEventListener('assistant-context', onContext);
    }, []);

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns, busy]);

    const ask = async (text, { forcePosition = '' } = {}) => {
        const q = String(text || '').trim();
        if (!q || busy) return;
        // Bağlam SORU ÖNCESİ hâlden kurulur; içinde aday adı ya da CV metni yok
        // (bkz. utils/assistantContext.js).
        const base = turns;
        const history = buildContext(base);
        const userTurn = { role: 'user', text: q };
        setQuestion('');
        setBusy(true);
        setTurns([...base, userTurn]);

        // Turu tamamla: ekrana yaz VE kalıcı hâle geçir. İkisi tek yerde olsun ki
        // bir cevap ekranda görünüp kayda girmemesi mümkün olmasın.
        const finish = (assistantTurn) => {
            const next = [...base, userTurn, assistantTurn];
            setTurns(next);
            persist(next);
        };

        try {
            const active = positions?.find((p) => p?.title === contextPosition) || null;
            const spec = await questionToQuery(q, {
                positions: positions || [],
                activePosition: active,
                history,
            });
            // ARACI KOD SEÇER, model yalnızca önerir. Tanınmayan kimlik ya da
            // "bunu veriyle yanıtlayamam" cevabı aynı yere çıkar: yapamadığımızı
            // söyleyip YAPABİLDİKLERİMİZİ sayarız. "Bunu yapamam" tek başına
            // kullanıcıyı denemeyi bırakmaya iter.
            if (spec.unsupported || !toolById(spec.tool)) {
                finish({
                    role: 'assistant',
                    spec,
                    unsupported: capabilityMessage(spec.unsupported),
                });
                return;
            }
            if (spec.tool === 'mulakat_incelemesi') {
                const title = forcePosition || spec.position || contextPosition || '';
                const loaded = await loadInterviewEntries({
                    candidates: enrichedCandidates || [],
                    position: title,
                    candidateName: spec.candidate || '',
                });
                const pos = (positions || []).find((p) => p?.title === title) || null;
                const review = buildInterviewReview(loaded.entries, pos);
                // Anlatım düşse bile çerçeve gösterilir — sayılar zaten hazır ve
                // asıl bilgi onlar. Hatayı yutmayız, kutuda yazarız.
                let narration = null;
                let narrationError = '';
                try {
                    narration = await narrateInterviewReview(q, reviewSummaryForPrompt(review));
                } catch (err) {
                    narrationError = err?.message || 'Yorum üretilemedi.';
                }
                finish({ role: 'assistant', spec, review, loaded, narration, narrationError, question: q });
                return;
            }

            // Pozisyon çözümü: kullanıcının seçtiği > modelin yazdığı > sayfa
            // bağlamı. Hiçbiri yoksa ve soru pozisyon gerektiriyorsa TEK açık
            // pozisyon varken sormanın anlamı yok — kullan ve hangisini
            // kullandığını söyle (denetim kutusu başlığı zaten yazıyor).
            let chosen = forcePosition || spec.position || contextPosition || '';
            if (!chosen && queryNeedsPosition(spec)) {
                const open = (positions || []).filter((p) => p?.status === 'open');
                if (open.length === 1) chosen = open[0].title;
            }
            const result = runCandidateQuery(
                { ...spec, position: chosen },
                { candidates: enrichedCandidates || [], positions: positions || [] }
            );
            // Yorum başarısız olsa da sonuç gösterilmeli — sayılar zaten hazır.
            let comment = '';
            try { comment = await narrateResult(q, result); } catch { comment = ''; }
            // spec KAYDEDİLİR: takip sorusu ("peki onlardan İstanbul'da olanlar")
            // bir sonraki turda bu sorguyu devralacak.
            // Soru turda saklanır: pozisyon seçilince aynı soru yeniden çalışacak.
            finish({ role: 'assistant', spec, result, comment, question: q });
        } catch (err) {
            finish({ role: 'assistant', error: err?.message || 'Sorgu çalıştırılamadı.' });
        } finally {
            setBusy(false);
        }
    };

    const openCandidate = (c) => {
        setViewCandidateId(c.id);
        window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }));
        setOpen(false);
    };

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                title="İK Asistanı"
                className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl bg-cyan-500 hover:bg-cyan-600 text-white shadow-lg shadow-cyan-500/25 transition-colors"
            >
                <MessageSquare className="w-4 h-4" />
                <span className="text-[11px] font-black uppercase tracking-wider">İK Asistanı</span>
            </button>
        );
    }

    return (
        <div className="fixed bottom-0 right-0 sm:bottom-5 sm:right-5 z-40 w-full sm:w-[440px] h-[85vh] sm:h-[640px] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
            <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 shrink-0">
                <div className="min-w-0">
                    <h2 className="flex items-center gap-1.5 text-[11px] font-black text-slate-700 uppercase tracking-widest">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-500" /> İK Asistanı
                    </h2>
                    <p className="text-[9px] text-slate-400 truncate">
                        {contextPosition ? `Bağlam: ${contextPosition}` : `${enrichedCandidates?.length || 0} aday · yalnızca okur`}
                    </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {/* Bağlamı bilerek temizlemek: konu değiştirirken asistanın
                        eski filtreleri devralmasını istemeyen kullanıcı için. */}
                    {turns.length > 0 && (
                        <button
                            onClick={newTopic}
                            title="Yeni konu — önceki sorular bağlamdan çıkar"
                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <RotateCcw className="w-3 h-3" />
                            <span className="text-[9px] font-black uppercase tracking-wider">Yeni konu</span>
                        </button>
                    )}
                    <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </header>

            {persistError && (
                <p className="flex items-start gap-1.5 px-4 py-1.5 bg-amber-50 border-b border-amber-100 text-[10px] text-amber-800 shrink-0">
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                    {persistError} — sohbet ekranda duruyor ama sayfayı yenilerseniz kaybolur.
                </p>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {turns.length === 0 && (
                    <div className="space-y-2">
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                            Aday havuzuna Türkçe soru sorun. Sayıları kod hesaplar, uydurma cevap
                            gelmez — her cevabın altında hangi filtrelerin uygulandığı yazar.
                        </p>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                            Takip sorusu sorabilirsiniz: &quot;peki onlardan İstanbul&apos;da
                            olanlar&quot; deyince önceki filtreler korunur. Konu değiştirirken
                            <strong> Yeni konu</strong> deyin.
                        </p>
                        {ORNEKLER.map((o) => (
                            <button
                                key={o}
                                onClick={() => ask(o)}
                                className="w-full text-left px-2.5 py-1.5 rounded-lg border border-slate-100 hover:border-cyan-300 text-[11px] text-slate-600 transition-colors"
                            >
                                {o}
                            </button>
                        ))}
                    </div>
                )}

                {turns.map((t, i) => (
                    <Turn
                        key={i}
                        turn={t}
                        onCandidateClick={openCandidate}
                        onFeedback={(verdict, note) => sendFeedback(i, verdict, note)}
                        openPositions={(positions || []).filter((p) => p?.status === 'open')}
                        onPickPosition={(title) => ask(t.question || turns[i - 1]?.text || '', { forcePosition: title })}
                    />
                ))}

                {busy && (
                    <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> Bakıyorum…
                    </p>
                )}
                <div ref={endRef} />
            </div>

            <form
                onSubmit={(e) => { e.preventDefault(); ask(question); }}
                className="flex items-center gap-2 px-3 py-2.5 border-t border-slate-100 shrink-0"
            >
                <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Örn: zorunlulukları geçen en iyi 5 aday"
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[12px] text-slate-700 outline-none focus:border-cyan-400 transition-colors"
                />
                <button
                    type="submit"
                    disabled={busy || !question.trim()}
                    className="w-9 h-9 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white flex items-center justify-center shrink-0 disabled:opacity-40 transition-colors"
                >
                    <Send className="w-4 h-4" />
                </button>
            </form>
        </div>
    );
}

function Turn({ turn, onCandidateClick, onFeedback, openPositions = [], onPickPosition }) {
    if (turn.role === 'user') {
        return (
            <p className="ml-8 px-3 py-1.5 rounded-xl bg-cyan-500 text-white text-[11px] leading-relaxed">
                {turn.text}
            </p>
        );
    }
    if (turn.error) {
        return <p className="text-[11px] text-red-600">{turn.error}</p>;
    }
    if (turn.unsupported) {
        // Modelin "bunu veriyle yanıtlayamam" demesi, uydurmasından iyidir —
        // ama yalnızca yapamadığını söylemek kullanıcıyı denemeyi bırakmaya
        // iter. Metin artık yapabildiklerimizi de sayıyor (capabilityMessage).
        return (
            <div className="space-y-1.5">
                <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-800 leading-relaxed whitespace-pre-line">
                        {turn.unsupported}
                    </p>
                </div>
                <FeedbackBar value={turn.feedback} onSend={onFeedback} />
            </div>
        );
    }

    if (turn.review) {
        return (
            <div className="space-y-2">
                <ReviewTurn turn={turn} />
                <FeedbackBar value={turn.feedback} onSend={onFeedback} />
            </div>
        );
    }

    const r = turn.result;
    return (
        <div className="space-y-2">
            {turn.comment && (
                <p className="text-[11px] text-slate-700 leading-relaxed">{turn.comment}</p>
            )}

            {r.groups ? (
                <div className="rounded-lg border border-slate-100 divide-y divide-slate-50">
                    {r.groups.map((g) => (
                        <div key={g.key} className="flex items-center justify-between px-2.5 py-1.5">
                            <span className="text-[11px] text-slate-600 truncate">{g.key}</span>
                            <span className="text-[11px] font-black text-slate-700 tabular-nums">{g.count}</span>
                        </div>
                    ))}
                </div>
            ) : r.rows.length > 0 ? (
                <div className="rounded-lg border border-slate-100 divide-y divide-slate-50 max-h-64 overflow-y-auto">
                    {r.rows.map((v) => (
                        <button
                            key={v.candidate.id}
                            onClick={() => onCandidateClick(v.candidate)}
                            className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 hover:bg-slate-50 text-left transition-colors"
                        >
                            <span className="text-[11px] font-bold text-slate-700 truncate">
                                {v.candidate.name || 'İsimsiz aday'}
                            </span>
                            <span className="flex items-center gap-1.5 shrink-0">
                                {v.candidate.location && (
                                    <span className="text-[9px] text-slate-400">{v.candidate.location}</span>
                                )}
                                <span className="text-[10px] font-black text-slate-600 tabular-nums">
                                    {Number.isFinite(v.score) ? Math.round(v.score) : '—'}
                                </span>
                                <ChevronRight className="w-3 h-3 text-slate-300" />
                            </span>
                        </button>
                    ))}
                </div>
            ) : (
                <p className="text-[11px] text-slate-500 italic">Bu sorguyla eşleşen aday yok.</p>
            )}

            {r.missingPosition && (
                <PositionPicker positions={openPositions} onPick={onPickPosition} />
            )}
            <AuditBox result={r} />
            <FeedbackBar value={turn.feedback} onSend={onFeedback} />
        </div>
    );
}

/** İnceleme bölümü — boşsa hiç render edilmez. */
function ReviewBlock({ title, items, tone }) {
    if (!items || items.length === 0) return null;
    return (
        <div>
            <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${tone}`}>{title}</p>
            <ul className="space-y-0.5">
                {items.map((x, i) => (
                    <li key={i} className="text-[11px] text-slate-600 leading-relaxed">• {x}</li>
                ))}
            </ul>
        </div>
    );
}

/** Mülakat incelemesi — çerçeve kodda hesaplandı, yorum modelden geldi. */
function ReviewTurn({ turn }) {
    const { review, loaded, narration, narrationError } = turn;

    if (review.interviewCount === 0) {
        return (
            <p className="text-[11px] text-slate-600 leading-relaxed">
                {loaded.matchedCandidates === 0
                    ? 'Bu tanıma uyan aday bulamadım.'
                    : `${loaded.matchedCandidates} aday buldum ama hiçbiriyle kayıtlı görüşme yok. `
                      + 'Bu araç yalnızca görüşme yapılmış adayları inceler.'}
            </p>
        );
    }

    return (
        <div className="space-y-2">
            {narration?.ozet && (
                <p className="text-[11px] text-slate-700 leading-relaxed">{narration.ozet}</p>
            )}
            {narrationError && (
                <p className="text-[10px] text-amber-700 leading-relaxed">
                    Yorum üretilemedi ({narrationError}) — aşağıdaki sayılar yine de geçerli,
                    onları kod hesapladı.
                </p>
            )}
            <ReviewBlock title="Öne çıkanlar" items={narration?.one_cikanlar} tone="text-emerald-600" />
            <ReviewBlock title="Mülakatta sorulacaklar" items={narration?.mulakatta_sorulacaklar} tone="text-amber-600" />
            <ReviewBlock title="Uyarılar" items={narration?.uyarilar} tone="text-red-500" />

            <div className="rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-2 space-y-1">
                <p className="flex items-center gap-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    <Info className="w-2.5 h-2.5" /> Nasıl hesaplandı
                </p>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                    {review.position ? <><strong>{review.position}</strong> · </> : null}
                    {review.interviewCount} görüşme okundu, <strong>{review.scored}</strong> tanesinde
                    sayısal sonuç var. Damgalar: {review.tally.met} karşılıyor, {review.tally.partial} kısmen,
                    {' '}{review.tally.missing} karşılamıyor, {review.tally.inconclusive} karar verilemedi.
                </p>
                {/* Ölçülemeyen görüşmeyi saymamak, olmayan bir ölçümü varmış
                    gibi göstermenin en sinsi hâli olurdu. */}
                {review.unscored.length > 0 && (
                    <p className="text-[10px] text-amber-700 leading-relaxed">
                        <strong>{review.unscored.length}</strong> görüşmede sayısal sonuç yok; ortalamaya
                        ve damga sayılarına girmediler.
                    </p>
                )}
                {review.staleCount > 0 && (
                    <p className="text-[10px] text-amber-700 leading-relaxed">
                        <strong>{review.staleCount}</strong> görüşmenin damgaları ilanın ESKİ madde
                        listesine ait — bugünkü maddelerle karşılaştırılamaz.
                    </p>
                )}
                {loaded.truncated > 0 && (
                    <p className="text-[10px] text-amber-700 leading-relaxed">
                        {loaded.truncated} görüşme okuma sınırına takıldı ve incelenmedi.
                    </p>
                )}
                {loaded.withoutInterview > 0 && (
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                        {loaded.withoutInterview} aday bu tanıma uyuyor ama hiç görüşme yapılmamış.
                    </p>
                )}
            </div>
        </div>
    );
}

/**
 * Pozisyon seçici — cevap veremediğimizde SORARIZ.
 *
 * Soru bir pozisyona bağlıysa ve pozisyon verilmediyse, doğru davranış boş
 * liste döndürüp sebebi yanlış söylemek değil, eksik olanı istemektir. Bir
 * asistanın en temel davranışı bu: anlamadığı yerde soru sorar.
 */
function PositionPicker({ positions, onPick }) {
    if (!positions.length) {
        return (
            <p className="text-[11px] text-slate-500 italic">
                Açık pozisyon yok — bu soruyu cevaplayabilmek için önce bir ilan gerekiyor.
            </p>
        );
    }
    return (
        <div className="space-y-1.5">
            <p className="text-[11px] text-slate-600 leading-relaxed">Hangi pozisyon için bakayım?</p>
            <div className="flex flex-wrap gap-1.5">
                {positions.map((p) => (
                    <button
                        key={p.id || p.title}
                        onClick={() => onPick?.(p.title)}
                        className="px-2.5 py-1 rounded-lg border border-cyan-200 bg-cyan-50 text-[11px] font-bold text-cyan-700 hover:bg-cyan-100 transition-colors"
                    >
                        {p.title}
                    </button>
                ))}
            </div>
        </div>
    );
}

/**
 * Geri bildirim çubuğu.
 *
 * Faz 7 (öğrenme) bu veriye dayanacak ama o katman henüz yok. Toplamayı
 * ertelemenin bedeli şu: toplanmamış geri bildirim sonradan ÜRETİLEMEZ.
 * Kullanıcının "bu cevap yanlıştı" dediği an geçerse, o bilgi bir daha geri
 * gelmez. Düğme bugün var, kullanan taraf sonra gelecek.
 *
 * Olumsuzda not istenir: "yanlış" damgası tek başına düzeltilecek bir şey
 * söylemez.
 */
function FeedbackBar({ value, onSend }) {
    const [noteOpen, setNoteOpen] = useState(false);
    const [note, setNote] = useState('');

    if (value) {
        return (
            <p className="text-[9px] text-slate-400">
                {value === 'up' ? 'Kaydedildi — teşekkürler.' : 'Not alındı, asistanı geliştirmekte kullanılacak.'}
            </p>
        );
    }

    if (noteOpen) {
        return (
            <form
                onSubmit={(e) => { e.preventDefault(); onSend('down', note); }}
                className="flex items-center gap-1.5"
            >
                <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Neyi yanlış yaptı? (isteğe bağlı)"
                    autoFocus
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[10px] text-slate-700 outline-none focus:border-cyan-400"
                />
                <button type="submit" className="text-[9px] font-black uppercase text-cyan-600 px-1.5">
                    Gönder
                </button>
            </form>
        );
    }

    return (
        <div className="flex items-center gap-1">
            <span className="text-[9px] text-slate-300 uppercase tracking-wider">Bu cevap işine yaradı mı?</span>
            <button onClick={() => onSend('up')} title="Yararlı" className="p-1 rounded hover:bg-slate-100 text-slate-300 hover:text-emerald-500">
                <ThumbsUp className="w-3 h-3" />
            </button>
            <button onClick={() => setNoteOpen(true)} title="Yararsız" className="p-1 rounded hover:bg-slate-100 text-slate-300 hover:text-red-500">
                <ThumbsDown className="w-3 h-3" />
            </button>
        </div>
    );
}

/**
 * Denetim kutusu — asistanın en önemli parçası.
 *
 * Sayının nereden geldiğini göstermezsek kullanıcı ya körü körüne güvenir ya
 * da hiç güvenmez. İkisi de kötü. Uygulanan filtreler, değerlendirilemeyen
 * adaylar ve UYGULANAMAYAN filtreler burada açıkça yazar.
 */
function AuditBox({ result }) {
    return (
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-2 space-y-1">
            <p className="flex items-center gap-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                <Info className="w-2.5 h-2.5" /> Nasıl hesaplandı
            </p>
            <p className="text-[10px] text-slate-500 leading-relaxed">
                {result.positionTitle ? <><strong>{result.positionTitle}</strong> · </> : null}
                {result.pool} adaydan <strong>{result.total}</strong> tanesi eşleşti
                {result.truncated ? ` (ilk ${result.limit} gösteriliyor)` : ''}.
            </p>
            {result.applied.length > 0 && (
                <ul className="space-y-0.5">
                    {result.applied.map((a) => (
                        <li key={a} className="text-[10px] text-slate-500">• {a}</li>
                    ))}
                </ul>
            )}
            {/* Pozisyon eksikken bu cümle YANLIŞ olur: "bu pozisyon için derin
                taraması yok" der ama ortada pozisyon yoktur. Canlıda 659 adayın
                tamamı böyle elendi ve kullanıcı tarama yapmaya yönlendirildi —
                tarama yapsa da değişmeyecekti. Sebep ayrı, mesaj da ayrı. */}
            {result.skipped > 0 && !result.missingPosition && (
                <p className="text-[10px] text-amber-700 leading-relaxed">
                    <strong>{result.skipped}</strong> aday sayıma girmedi: bu pozisyon için derin
                    taraması yok, karşılıyor da karşılamıyor da diyemeyiz.
                </p>
            )}
            {result.missingPosition && (
                <p className="text-[10px] text-amber-700 leading-relaxed">
                    Bu soru bir pozisyona bağlı — puan, gereksinim maddesi, zorunlu kapısı ve STAR
                    hep bir ilana göre ölçülür. Pozisyon seçilmediği için hiçbir aday
                    değerlendirilemedi.
                </p>
            )}
            {result.ignored.length > 0 && (
                <p className="text-[10px] text-red-600 leading-relaxed">
                    Uygulayamadığım filtre: {result.ignored.join(', ')} — bu alan sistemde tutulmuyor,
                    sonuç bu kısıt olmadan hesaplandı.
                </p>
            )}
        </div>
    );
}
