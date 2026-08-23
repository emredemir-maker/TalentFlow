import { useCallback, useEffect, useRef, useState } from 'react';
import {
    X, Send, Loader2, AlertTriangle, Info, ChevronRight, Sparkles, RotateCcw,
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
import { reviewFingerprint, loadReview, saveReview } from '../services/interviewReviewCache';
import { saveFeedback } from '../services/assistantFeedback';
import { researchMarket } from '../services/ai/marketResearch';
import { formatBand } from '../utils/salaryBand';
import { draftPosition } from '../services/ai/positionDrafter';
import { normalizeDraft, draftForPrompt, draftToFormData } from '../utils/positionDraft';
import PositionDraftCard from './PositionDraftCard';

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

/**
 * Sohbetteki EN SON taslak.
 *
 * Düzeltme isteği ("zorunluları üçe indir") var olanın üstüne çalışır; taslak
 * bulunamazsa istek yeni bir ilan sanılır ve kullanıcının onayladığı maddeler
 * çöpe gider.
 */
function lastDraft(turns = []) {
    for (let i = turns.length - 1; i >= 0; i -= 1) {
        if (turns[i]?.draft) return turns[i].draft;
    }
    return null;
}

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
    const { positions, setPositionDraft } = usePositions();
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
                const summary = reviewSummaryForPrompt(review, loaded);
                const fingerprint = reviewFingerprint(summary);
                let narration = null;
                let narrationError = '';
                let fromCache = false;
                try {
                    // DAMGALA VE SAKLA: aynı çerçeve aynı yorumu verir. Girdi
                    // değişmedikçe model yeniden konuşmaz — asistanın salı ve
                    // perşembe farklı şey söylemesi böyle biter.
                    if (uid) narration = await loadReview(uid, fingerprint);
                    fromCache = Boolean(narration);
                    if (!narration) {
                        narration = await narrateInterviewReview(q, summary);
                        if (uid) await saveReview(uid, fingerprint, narration).catch(() => {});
                    }
                } catch (err) {
                    narrationError = err?.message || 'Yorum üretilemedi.';
                }
                finish({ role: 'assistant', spec, review, loaded, narration, narrationError, fromCache, question: q });
                return;
            }

            if (spec.tool === 'piyasa_arastirmasi') {
                // Rol adı olmadan piyasaya bakmak anlamsız: band bir ROLE aittir.
                // Bağlamdaki pozisyonu kullanırız ama o da yoksa UYDURMAYIZ —
                // sorarız. Asistanın en temel davranışı bu.
                const title = forcePosition || spec.position || contextPosition || '';
                if (!title) {
                    finish({
                        role: 'assistant',
                        spec,
                        notice: 'Hangi rol için piyasaya bakayım? Rol adını yazın — seviye ve şehir de '
                            + 'eklerseniz bant daha isabetli olur (ör. "İstanbul’da senior Growth PM").',
                        question: q,
                    });
                    return;
                }
                const market = await researchMarket({
                    title,
                    level: spec.level || '',
                    location: spec.location || '',
                    subject: spec.subject === 'yan_haklar' ? 'yan_haklar' : 'maas',
                });
                finish({ role: 'assistant', spec, market, question: q });
                return;
            }

            if (spec.tool === 'pozisyon_taslagi') {
                // DÜZELTME İSTEĞİ VAR OLANIN ÜSTÜNE ÇALIŞIR. Son taslağı
                // vermezsek "zorunluları üçe indir" isteği sıfırdan yeni bir
                // ilan üretir ve kullanıcının onayladığı maddeler çöpe gider.
                const previous = lastDraft(base);
                const raw = await draftPosition(spec.brief || q, {
                    previousDraft: draftForPrompt(previous),
                    departments: [...new Set((positions || []).map((p) => p?.department).filter(Boolean))],
                });
                const draft = normalizeDraft(raw);
                if (!draft) {
                    finish({
                        role: 'assistant',
                        spec,
                        notice: 'Taslak üretemedim — isteği biraz daha somut yazmayı deneyin '
                            + '(rol adı, seviye, aradığınız iki üç şey).',
                        question: q,
                    });
                    return;
                }
                finish({ role: 'assistant', spec, draft, question: q });
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

    /** Karttaki band eklemesi turda kalıcı olsun — sayfa yenilenince kaybolmasın. */
    const updateDraft = useCallback((index, nextDraft) => {
        setTurns((prev) => {
            const next = prev.map((t, i) => (i === index ? { ...t, draft: nextDraft } : t));
            persist(next);
            return next;
        });
    }, [persist]);

    /**
     * Taslağı ilan formuna taşır — ASISTAN KAYDETMEZ.
     *
     * Taslak context üzerinden geçiyor, olay (event) ile değil: kullanıcı
     * pozisyonlar ekranında değilse o ekran henüz takılı değildir ve olayı
     * dinleyecek kimse olmaz. Aynı düzen randevu ekranında da var
     * (CandidatesContext.preselectedInterviewData).
     */
    const openDraftInForm = useCallback((draft) => {
        setPositionDraft?.(draftToFormData(draft));
        window.dispatchEvent(new CustomEvent('changeView', { detail: 'positions' }));
        setOpen(false);
    }, [setPositionDraft]);

    const openCandidate = (c) => {
        setViewCandidateId(c.id);
        window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }));
        setOpen(false);
    };

    if (!open) {
        return (
            <div className="infoset fixed bottom-5 right-5 z-40" style={{ background: 'transparent' }}>
                <button
                    onClick={() => setOpen(true)}
                    title="İK Asistanı"
                    className="flex items-center gap-2 px-4 py-[11px] rounded-full bg-brand hover:bg-brand-600 text-white shadow-lg"
                >
                    <Sparkles className="w-[15px] h-[15px]" />
                    <span className="text-[13px] font-semibold">İK Asistanı</span>
                </button>
            </div>
        );
    }

    return (
        <div className="infoset fixed bottom-0 right-0 sm:bottom-5 sm:right-5 z-40 w-full sm:w-[400px] h-[85vh] sm:h-[620px] flex flex-col rounded-t-[14px] sm:rounded-[14px] border border-n200 shadow-xl overflow-hidden" style={{ background: 'var(--color-n0)' }}>
            <header className="flex items-center gap-2.5 px-3.5 py-3 border-b border-n200 shrink-0">
                <span className="w-[26px] h-[26px] shrink-0 rounded-full bg-brand-50 text-brand flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                    <h2 className="text-[13px] font-semibold m-0">İK Asistanı</h2>
                    <p className="text-[11px] text-n400 truncate m-0">
                        {contextPosition
                            ? `Bağlam: ${contextPosition}`
                            : `${enrichedCandidates?.length || 0} aday · havuzdaki veriye bakar, karar vermez`}
                    </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {/* Bağlamı bilerek temizlemek: konu değiştirirken asistanın
                        eski filtreleri devralmasını istemeyen kullanıcı için. */}
                    {turns.length > 0 && (
                        <button
                            onClick={newTopic}
                            title="Yeni konu — önceki sorular bağlamdan çıkar"
                            className="flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-n100 text-n400 hover:text-n600 transition-colors"
                        >
                            <RotateCcw className="w-3 h-3" />
                            <span className="text-[11px] font-medium">Yeni konu</span>
                        </button>
                    )}
                    <button onClick={() => setOpen(false)} className="p-1.5 rounded-md hover:bg-n100 text-n400">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </header>

            {persistError && (
                <p className="flex items-start gap-1.5 px-3.5 py-1.5 bg-warn-bg border-b border-n200 text-[11px] text-n700 shrink-0">
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                    {persistError} — sohbet ekranda duruyor ama sayfayı yenilerseniz kaybolur.
                </p>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {turns.length === 0 && (
                    <div className="space-y-2">
                        <p className="text-[12px] text-n500 leading-relaxed">
                            Aday havuzuna Türkçe soru sorun. Sayıları kod hesaplar, uydurma cevap
                            gelmez — her cevabın altında hangi filtrelerin uygulandığı yazar.
                        </p>
                        <p className="text-[11px] text-n400 leading-relaxed">
                            Takip sorusu sorabilirsiniz: &quot;peki onlardan İstanbul&apos;da
                            olanlar&quot; deyince önceki filtreler korunur. Konu değiştirirken
                            <strong> Yeni konu</strong> deyin.
                        </p>
                        {ORNEKLER.map((o) => (
                            <button
                                key={o}
                                onClick={() => ask(o)}
                                className="w-full text-left px-3 py-[7px] rounded-full border border-n200 hover:border-brand-200 hover:bg-brand-50 text-[12px] font-medium text-n700"
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
                        positions={positions || []}
                        onUpdateDraft={(next) => updateDraft(i, next)}
                        onOpenDraftForm={openDraftInForm}
                    />
                ))}

                {busy && (
                    <p className="flex items-center gap-1.5 text-[12px] text-n400">
                        <Loader2 className="w-3 h-3 animate-spin" /> Bakıyorum…
                    </p>
                )}
                <div ref={endRef} />
            </div>

            <form
                onSubmit={(e) => { e.preventDefault(); ask(question); }}
                className="flex items-center gap-2 px-3 py-2.5 border-t border-n200 shrink-0"
            >
                <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Örn: zorunlulukları geçen en iyi 5 aday"
                    className="flex-1 bg-n50 border border-n200 rounded-md px-3 py-2 text-[12px] text-n700 outline-none focus:border-brand transition-colors"
                />
                <button
                    type="submit"
                    disabled={busy || !question.trim()}
                    className="w-9 h-9 rounded-md bg-brand hover:bg-brand-600 text-white flex items-center justify-center shrink-0 disabled:opacity-40 transition-colors"
                >
                    <Send className="w-4 h-4" />
                </button>
            </form>
        </div>
    );
}

function Turn({
    turn, onCandidateClick, onFeedback, openPositions = [], onPickPosition,
    positions = [], onUpdateDraft, onOpenDraftForm,
}) {
    if (turn.role === 'user') {
        return (
            <p className="ml-8 px-3 py-1.5 rounded-md bg-brand text-white text-[12px] leading-relaxed">
                {turn.text}
            </p>
        );
    }
    if (turn.error) {
        return <p className="text-[12px] text-bad">{turn.error}</p>;
    }
    if (turn.unsupported) {
        // Modelin "bunu veriyle yanıtlayamam" demesi, uydurmasından iyidir —
        // ama yalnızca yapamadığını söylemek kullanıcıyı denemeyi bırakmaya
        // iter. Metin artık yapabildiklerimizi de sayıyor (capabilityMessage).
        return (
            <div className="space-y-1.5">
                <div className="flex items-start gap-2 rounded-md border bg-warn-bg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-warn shrink-0 mt-0.5" />
                    <p className="text-[12px] text-n700 leading-relaxed whitespace-pre-line">
                        {turn.unsupported}
                    </p>
                </div>
                <FeedbackBar value={turn.feedback} onSend={onFeedback} />
            </div>
        );
    }

    if (turn.notice) {
        return (
            <div className="space-y-1.5">
                <p className="text-[12px] text-n700 leading-relaxed">{turn.notice}</p>
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

    if (turn.market) {
        return (
            <div className="space-y-2">
                <MarketTurn market={turn.market} />
                <FeedbackBar value={turn.feedback} onSend={onFeedback} />
            </div>
        );
    }

    if (turn.draft) {
        return (
            <div className="space-y-2">
                <PositionDraftCard
                    draft={turn.draft}
                    positions={positions}
                    onUpdateDraft={onUpdateDraft}
                    onOpenForm={() => onOpenDraftForm?.(turn.draft)}
                />
                <FeedbackBar value={turn.feedback} onSend={onFeedback} />
            </div>
        );
    }

    const r = turn.result;
    // KAYITTAN GELEN TUR EKSİK OLABİLİR. Aday sorgusu dışındaki araçların
    // çıktısı bir süre hiç saklanmıyordu ve sayfa yenilenince bu tur aday
    // sorgusu sanılıp `result.groups` okunuyor, TÜM panel çöküyordu. Eksik
    // turu söylemek, sohbeti düşürmekten iyidir.
    if (!r) {
        return (
            <p className="text-[12px] text-n400 italic">
                Bu cevabın ayrıntısı saklanmadı — soruyu tekrar sorabilirsiniz.
            </p>
        );
    }
    return (
        <div className="space-y-2">
            {turn.comment && (
                <p className="text-[12px] text-n700 leading-relaxed">{turn.comment}</p>
            )}

            {r.groups ? (
                <div className="rounded-md border border-n200 divide-y divide-n100">
                    {r.groups.map((g) => (
                        <div key={g.key} className="flex items-center justify-between px-2.5 py-1.5">
                            <span className="text-[12px] text-n600 truncate">{g.key}</span>
                            <span className="text-[12px] font-semibold text-n700 tabular-nums">{g.count}</span>
                        </div>
                    ))}
                </div>
            ) : r.rows.length > 0 ? (
                <div className="rounded-md border border-n200 divide-y divide-n100 max-h-64 overflow-y-auto">
                    {r.rows.map((v) => (
                        <button
                            key={v.candidate.id}
                            onClick={() => onCandidateClick(v.candidate)}
                            className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 hover:bg-n50 text-left transition-colors"
                        >
                            <span className="text-[12px] font-bold text-n700 truncate">
                                {v.candidate.name || 'İsimsiz aday'}
                            </span>
                            <span className="flex items-center gap-1.5 shrink-0">
                                {v.candidate.location && (
                                    <span className="text-[11px] text-n400">{v.candidate.location}</span>
                                )}
                                <span className="text-[11px] font-semibold text-n600 tabular-nums">
                                    {Number.isFinite(v.score) ? Math.round(v.score) : '—'}
                                </span>
                                <ChevronRight className="w-3 h-3 text-n300" />
                            </span>
                        </button>
                    ))}
                </div>
            ) : (
                <p className="text-[12px] text-n500 italic">Bu sorguyla eşleşen aday yok.</p>
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
            <p className={`text-[11px] font-semibold uppercase tracking-[0.08em] mb-1 ${tone}`}>{title}</p>
            <ul className="space-y-0.5">
                {items.map((x, i) => (
                    <li key={i} className="text-[12px] text-n600 leading-relaxed">• {x}</li>
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
            <p className="text-[12px] text-n600 leading-relaxed">
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
                <p className="text-[12px] text-n700 leading-relaxed">{narration.ozet}</p>
            )}
            {narrationError && (
                <p className="text-[11px] text-warn leading-relaxed">
                    Yorum üretilemedi ({narrationError}) — aşağıdaki sayılar yine de geçerli,
                    onları kod hesapladı.
                </p>
            )}
            <ReviewBlock title="Öne çıkanlar" items={narration?.one_cikanlar} tone="text-ok" />
            <ReviewBlock title="Mülakatta sorulacaklar" items={narration?.mulakatta_sorulacaklar} tone="text-warn" />
            <ReviewBlock title="Uyarılar" items={narration?.uyarilar} tone="text-bad" />

            <div className="rounded-md bg-n50 border border-n200 px-2.5 py-2 space-y-1">
                <p className="flex items-center gap-1 text-[11px] font-semibold text-n400 uppercase tracking-[0.08em]">
                    <Info className="w-2.5 h-2.5" /> Nasıl hesaplandı
                </p>
                <p className="text-[11px] text-n500 leading-relaxed">
                    {review.position ? <><strong>{review.position}</strong> · </> : null}
                    {review.interviewCount} görüşme okundu, <strong>{review.scored}</strong> tanesinde
                    sayısal sonuç var. Damgalar: {review.tally.met} karşılıyor, {review.tally.partial} kısmen,
                    {' '}{review.tally.missing} karşılamıyor, {review.tally.inconclusive} karar verilemedi.
                </p>
                {/* Ölçülemeyen görüşmeyi saymamak, olmayan bir ölçümü varmış
                    gibi göstermenin en sinsi hâli olurdu. */}
                {review.unscored.length > 0 && (
                    <p className="text-[11px] text-warn leading-relaxed">
                        <strong>{review.unscored.length}</strong> görüşmede sayısal sonuç yok; ortalamaya
                        ve damga sayılarına girmediler.
                    </p>
                )}
                {review.staleCount > 0 && (
                    <p className="text-[11px] text-warn leading-relaxed">
                        <strong>{review.staleCount}</strong> görüşmenin damgaları ilanın ESKİ madde
                        listesine ait — bugünkü maddelerle karşılaştırılamaz.
                    </p>
                )}
                {/* ÖRNEKLEM AÇIKÇA YAZILIR. Alt kümenin dağılımını bütünün
                    dağılımı gibi göstermek, kullanıcının fark edemeyeceği bir
                    yanıltma olur — seçim kuralı da yazsın ki keyfi olmadığı
                    görülsün. */}
                {loaded.truncated > 0 && (
                    <p className="text-[11px] text-warn leading-relaxed">
                        Toplam <strong>{loaded.totalSessions}</strong> görüşme var; <strong>en yeni
                        {' '}{review.interviewCount}</strong> tanesi incelendi. Yukarıdaki dağılım
                        bütünün değil, bu alt kümenin dağılımıdır.
                    </p>
                )}
                {loaded.withoutInterview > 0 && (
                    <p className="text-[11px] text-n500 leading-relaxed">
                        {loaded.withoutInterview} aday bu tanıma uyuyor ama hiç görüşme yapılmamış.
                    </p>
                )}
            </div>
        </div>
    );
}

/**
 * Piyasa araştırması — bant, yan haklar ve KAYNAKLAR.
 *
 * Kabul kuralı burada görünür hâle geliyor: kaynak listesi boşken ekranda maaş
 * rakamı YOKTUR. Rakam gizlendiyse bunu söyleriz — "bulunamadı" ile
 * "bulundu ama gösteremiyoruz" iki farklı şeydir ve ikincisi kullanıcının
 * bilmesi gereken bir karardır.
 */
function MarketTurn({ market }) {
    const { band, withheld, grounded, date, scope, benefits = [], caution, sources = [], query } = market;

    return (
        <div className="space-y-2">
            {band ? (
                <div className="rounded-md border border-brand-100 bg-brand-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">Piyasa bandı</p>
                    <p className="text-[13px] font-semibold text-n900 tabular-nums">{formatBand(band)}</p>
                    {/* Baz yoksa bu bant kendi bütçenizle KARŞILAŞTIRILAMAZ —
                        brüt/net farkı %30-40 ve makul göründüğü için fark
                        edilmez (gerekçe: utils/salaryBand.js). */}
                    {!band.basis && (
                        <p className="text-[11px] text-warn mt-0.5">
                            Kaynaklar brüt mü net mi söylemiyor — kendi bandınızla doğrudan
                            karşılaştırmayın.
                        </p>
                    )}
                    {date && <p className="text-[11px] text-n500 mt-0.5">Verinin dönemi: {date}</p>}
                </div>
            ) : withheld ? (
                <div className="flex items-start gap-2 rounded-md border bg-warn-bg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-warn shrink-0 mt-0.5" />
                    <p className="text-[12px] text-n700 leading-relaxed">
                        {/* İKİ AYRI DURUM, İKİ AYRI CÜMLE. Arama hiç yapılamamış olmakla,
                            arama yapılıp hiçbir sayfanın kaynak gösterilmemesi farklı
                            şeyler; ikisine aynı cümleyi yazmak ekranda Google'ın arama
                            bloğunu gören kullanıcıya çelişki gibi görünüyordu. */}
                        {market.withheldReason === 'searched-uncited' ? (
                            <>
                                <strong>Arama yapıldı ama model hiçbir sayfayı kaynak göstermedi</strong>,
                                o yüzden ürettiği rakamı göstermiyorum. İzi sürülemeyen bir maaş rakamı
                                teklif dayanağı olamaz.
                            </>
                        ) : (
                            <>
                                Bir bant üretildi ama <strong>hiçbir kaynağa dayanmıyor</strong>, o yüzden
                                rakamı göstermiyorum. Kaynaksız bir maaş rakamı teklif dayanağı olamaz.
                            </>
                        )}
                    </p>
                </div>
            ) : (
                <p className="text-[12px] text-n600 leading-relaxed">
                    Bu rol için kaynaklı bir ücret bandı bulunamadı.
                </p>
            )}

            {/* Arama aracı çalışmadıysa cevap modelin kendi hatırladığıdır.
                Sessizce kaynaklıymış gibi sunmak en kötüsü olurdu. */}
            {!grounded && (
                <p className="text-[11px] text-warn leading-relaxed">
                    Arama yapılamadı — aşağıdaki bilgi modelin hatırladığıdır, doğrulanmamıştır.
                </p>
            )}

            {benefits.length > 0 && (
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-n400 mb-1">Yaygın yan haklar</p>
                    <ul className="space-y-0.5">
                        {benefits.map((b, i) => (
                            <li key={i} className="text-[12px] text-n600 leading-relaxed">• {b}</li>
                        ))}
                    </ul>
                </div>
            )}

            {caution && <p className="text-[11px] text-n500 italic leading-relaxed">{caution}</p>}

            <div className="rounded-md bg-n50 border border-n200 px-2.5 py-2 space-y-1">
                <p className="flex items-center gap-1 text-[11px] font-semibold text-n400 uppercase tracking-[0.08em]">
                    <Info className="w-2.5 h-2.5" /> Ne arandı
                </p>
                <p className="text-[11px] text-n500 leading-relaxed">
                    <strong>{query?.title || '—'}</strong>
                    {query?.level ? ` · ${query.level}` : ' · seviye belirtilmedi'}
                    {query?.location ? ` · ${query.location}` : ' · konum belirtilmedi'}
                </p>
                {scope && <p className="text-[11px] text-n500 leading-relaxed">{scope}</p>}
                {/* Modelin GERÇEKTEN arattığı sorgular. Kaynak gelmediğinde bile
                    kullanıcı aramanın çalıştığını görür ve aynı sorguyu kendisi
                    çalıştırabilir. */}
                {market.searchQueries?.length > 0 && (
                    <p className="text-[11px] text-n400 leading-relaxed">
                        Arananlar: {market.searchQueries.join(' · ')}
                    </p>
                )}
            </div>

            {/* KAYNAKLAR — iddianın izi. Bunlar yoksa yukarıda rakam da yok. */}
            {sources.length > 0 && (
                <div className="space-y-0.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-n400">Kaynaklar</p>
                    {sources.slice(0, 6).map((s) => (
                        <a
                            key={s.uri}
                            href={s.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-[11px] text-brand hover:underline truncate"
                        >
                            {s.title || s.uri}
                        </a>
                    ))}
                </div>
            )}

            {/* Google'ın gösterim şartı: arama önerisi bloğu grounding
                kullanıldığında OLDUĞU GİBİ gösterilmek zorunda. */}
            {market.searchSuggestionHtml && (
                <div className="pt-1 overflow-x-auto" dangerouslySetInnerHTML={{ __html: market.searchSuggestionHtml }} />
            )}
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
            <p className="text-[12px] text-n500 italic">
                Açık pozisyon yok — bu soruyu cevaplayabilmek için önce bir ilan gerekiyor.
            </p>
        );
    }
    return (
        <div className="space-y-1.5">
            <p className="text-[12px] text-n600 leading-relaxed">Hangi pozisyon için bakayım?</p>
            <div className="flex flex-wrap gap-1.5">
                {positions.map((p) => (
                    <button
                        key={p.id || p.title}
                        onClick={() => onPick?.(p.title)}
                        className="px-2.5 py-1 rounded-md border border-brand-100 bg-brand-50 text-[12px] font-bold text-brand hover:bg-brand-100 transition-colors"
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
            <p className="text-[11px] text-n400">
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
                    className="flex-1 bg-n50 border border-n200 rounded-md px-2 py-1 text-[11px] text-n700 outline-none focus:border-brand"
                />
                <button type="submit" className="text-[11px] font-semibold text-brand px-1.5">
                    Gönder
                </button>
            </form>
        );
    }

    return (
        <div className="flex items-center gap-1">
            <span className="text-[11px] text-n400">Bu cevap işine yaradı mı?</span>
            <button onClick={() => onSend('up')} title="Yararlı" className="p-1 rounded hover:bg-n100 text-n300 hover:text-ok">
                <ThumbsUp className="w-3 h-3" />
            </button>
            <button onClick={() => setNoteOpen(true)} title="Yararsız" className="p-1 rounded hover:bg-n100 text-n300 hover:text-bad">
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
        <div className="rounded-md bg-n50 border border-n200 px-2.5 py-2 space-y-1">
            <p className="flex items-center gap-1 text-[11px] font-semibold text-n400 uppercase tracking-[0.08em]">
                <Info className="w-2.5 h-2.5" /> Nasıl hesaplandı
            </p>
            <p className="text-[11px] text-n500 leading-relaxed">
                {result.positionTitle ? <><strong>{result.positionTitle}</strong> · </> : null}
                {result.pool} adaydan <strong>{result.total}</strong> tanesi eşleşti
                {result.truncated ? ` (ilk ${result.limit} gösteriliyor)` : ''}.
            </p>
            {result.applied.length > 0 && (
                <ul className="space-y-0.5">
                    {result.applied.map((a) => (
                        <li key={a} className="text-[11px] text-n500">• {a}</li>
                    ))}
                </ul>
            )}
            {/* Pozisyon eksikken bu cümle YANLIŞ olur: "bu pozisyon için derin
                taraması yok" der ama ortada pozisyon yoktur. Canlıda 659 adayın
                tamamı böyle elendi ve kullanıcı tarama yapmaya yönlendirildi —
                tarama yapsa da değişmeyecekti. Sebep ayrı, mesaj da ayrı. */}
            {result.skipped > 0 && !result.missingPosition && (
                <p className="text-[11px] text-warn leading-relaxed">
                    <strong>{result.skipped}</strong> aday sayıma girmedi: bu pozisyon için derin
                    taraması yok, karşılıyor da karşılamıyor da diyemeyiz.
                </p>
            )}
            {result.missingPosition && (
                <p className="text-[11px] text-warn leading-relaxed">
                    Bu soru bir pozisyona bağlı — puan, gereksinim maddesi, zorunlu kapısı ve STAR
                    hep bir ilana göre ölçülür. Pozisyon seçilmediği için hiçbir aday
                    değerlendirilemedi.
                </p>
            )}
            {result.ignored.length > 0 && (
                <p className="text-[11px] text-bad leading-relaxed">
                    Uygulayamadığım filtre: {result.ignored.join(', ')} — bu alan sistemde tutulmuyor,
                    sonuç bu kısıt olmadan hesaplandı.
                </p>
            )}
        </div>
    );
}
