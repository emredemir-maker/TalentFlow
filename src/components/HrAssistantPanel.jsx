import { useCallback, useEffect, useRef, useState } from 'react';
import {
    MessageSquare, X, Send, Loader2, AlertTriangle, Info, ChevronRight, Sparkles, RotateCcw,
    ThumbsUp, ThumbsDown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import { runCandidateQuery } from '../utils/candidateQuery';
import { questionToQuery, narrateResult } from '../services/ai/hrAssistant';
import { buildContext } from '../utils/assistantContext';
import { loadChat, saveChat, clearChat } from '../services/assistantChatStore';
import { toolById, capabilityMessage, TOOLS } from '../services/ai/assistantTools';
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

    const ask = async (text) => {
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
            const result = runCandidateQuery(
                { ...spec, position: spec.position || contextPosition },
                { candidates: enrichedCandidates || [], positions: positions || [] }
            );
            // Yorum başarısız olsa da sonuç gösterilmeli — sayılar zaten hazır.
            let comment = '';
            try { comment = await narrateResult(q, result); } catch { comment = ''; }
            // spec KAYDEDİLİR: takip sorusu ("peki onlardan İstanbul'da olanlar")
            // bir sonraki turda bu sorguyu devralacak.
            finish({ role: 'assistant', spec, result, comment });
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

function Turn({ turn, onCandidateClick, onFeedback }) {
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

            <AuditBox result={r} />
            <FeedbackBar value={turn.feedback} onSend={onFeedback} />
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
            {result.skipped > 0 && (
                <p className="text-[10px] text-amber-700 leading-relaxed">
                    <strong>{result.skipped}</strong> aday sayıma girmedi: bu pozisyon için derin
                    taraması yok, karşılıyor da karşılamıyor da diyemeyiz.
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
