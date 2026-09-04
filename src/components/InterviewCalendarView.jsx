// MÜLAKAT TAKVİMİ — ay görünümü.
//
// ── NEDEN LİSTE YETMEDİ ─────────────────────────────────────────────────────
// Mülakatlar ekranı bir listeydi ve takvim yalnızca boş slot bulmak için
// okunuyordu. "Bu hafta nem var" sorusunun cevabı hiçbir ekranda yoktu:
// kullanıcı ana sayfadaki "yaklaşan mülakatlar" kutusuyla yetiniyordu.
//
// ── İKİ KAYNAK, TEK EKRAN, AMA AYRI GÖRÜNÜM ─────────────────────────────────
// Izgarada hem uygulamanın kendi mülakat kayıtları hem Google Takvim'deki
// etkinlikler duruyor. Renk ve etiketle AYRI tutuluyorlar: takvimden okunan
// bir toplantıyı uygulamanın kaydıymış gibi göstermek, sistemde kaydı
// olmayan bir görüşmeyi mülakat sanmaya yol açardı.
//
// ── SENKRON DURUMU GÖRÜNÜR ──────────────────────────────────────────────────
// Google bağlı değilse ekran bunu söylüyor ve bağlama düğmesini burada
// gösteriyor. Bağlantı Ayarlar'da gömülüyken kullanıcı "takvimi senkronize
// et diye bir alan yok" diyordu — haklıydı: bağlantının yeri, sonucunun
// görüldüğü yer değildi.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ChevronLeft, ChevronRight, Loader2, RefreshCw, CalendarDays,
    ClipboardCheck, ExternalLink, AlertCircle, X, Search, UserPlus,
} from 'lucide-react';

import { fetchCalendarWindow } from '../services/calendarFeed';
import { matchCandidate, sessionForEvent, looksLikeInterview, MATCH_LABEL } from '../utils/calendarMatch';
import { monthGrid, monthLabel, bucketByDay, dayKey, WEEKDAYS } from '../utils/calendarGrid';
import { isSessionPast } from '../utils/interviewSession';

const bugununAnahtari = () => dayKey(new Date());

/** Oturumun ızgaradaki rengi — durumuna göre. */
function sessionTone(session) {
    const st = session?._effectiveStatus || session?.status;
    if (st === 'live') return { fg: '#16A26C', bg: '#E6F7EF' };
    if (st === 'cancelled') return { fg: '#C0272C', bg: '#FEF2F2' };
    if (session?._effectiveCompleted || st === 'completed') return { fg: '#4F46E5', bg: '#EEF2FF' };
    return { fg: '#5068FF', bg: '#EEF1FF' };
}

/**
 * Takvim etkinliğinin ızgaradaki rengi.
 *
 * Takvimde her şey var: sprint toplantısı, diş hekimi, İK görüşmesi. Hepsini
 * aynı gri kutuda göstermek, işe alım görüşmelerini gürültünün içinde
 * kaybediyordu — oysa kullanıcının bu ekranda aradığı tek şey onlar.
 *
 * Üç durum, üç renk:
 *   adaya bağlı        → marka rengi; sistemde karşılığı var
 *   mülakat olabilir   → amber; başlığında "mülakat/İK görüşmesi" geçiyor,
 *                        işaretlenmeyi bekliyor
 *   diğer              → gri; kullanıcının kendi toplantısı
 */
function eventTone(candidate, muhtemel) {
    if (candidate) return { fg: '#5068FF', bg: '#EEF1FF' };
    if (muhtemel) return { fg: '#96590A', bg: '#FFFBEB' };
    return { fg: '#6B7384', bg: '#F1F3F7' };
}

function AdaySecici({ candidates, onSelect, onCancel }) {
    const [q, setQ] = useState('');
    const sonuc = useMemo(() => {
        const arama = q.trim().toLocaleLowerCase('tr');
        const liste = arama
            ? candidates.filter((c) => `${c.name || ''} ${c.email || ''}`.toLocaleLowerCase('tr').includes(arama))
            : candidates;
        return liste.slice(0, 8);
    }, [candidates, q]);

    return (
        <div className="mt-2 border border-n200 rounded-md p-2.5 bg-n25">
            <div className="flex items-center gap-2 mb-2">
                <Search className="w-3.5 h-3.5 text-n400" />
                <input
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Aday ara…"
                    className="flex-1 bg-n0 border border-n200 rounded-md px-2.5 py-1.5 text-[12px] outline-none focus:border-brand"
                />
                <button onClick={onCancel} className="p-1 text-n400 hover:text-n700" aria-label="Vazgeç">
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
            {sonuc.length === 0 ? (
                <p className="text-[11px] text-n400 px-1">Eşleşen aday yok.</p>
            ) : sonuc.map((c) => (
                <button
                    key={c.id}
                    onClick={() => onSelect(c)}
                    className="block w-full text-left px-2 py-1.5 rounded hover:bg-n50 text-[12px] text-n700"
                >
                    {c.name || 'İsimsiz'}
                    {c.email && <span className="text-n400"> · {c.email}</span>}
                </button>
            ))}
        </div>
    );
}

/**
 * @param {object} props
 * @param {Array} props.sessions — uygulamanın mülakat kayıtları
 * @param {Array} props.candidates
 * @param {boolean} props.isGoogleConnected
 * @param {string} props.userId
 * @param {object} props.userProfile
 * @param {(session: object) => void} props.onOpenSession
 * @param {(session: object) => void} props.onSessionResult
 * @param {(candidateId: string) => void} props.onPrepare
 * @param {(event: object, candidate: object) => void} props.onEventResult
 * @param {(event: object, candidate: object) => Promise<void>} props.onMarkInterview
 * @param {() => void} props.onConnect
 */
export default function InterviewCalendarView({
    sessions = [],
    candidates = [],
    isGoogleConnected,
    userId,
    userProfile,
    onOpenSession,
    onSessionResult,
    onPrepare,
    onEventResult,
    onMarkInterview,
    onConnect,
}) {
    const bugun = useMemo(() => new Date(), []);
    const [year, setYear] = useState(bugun.getFullYear());
    const [month, setMonth] = useState(bugun.getMonth());
    const [selected, setSelected] = useState(bugununAnahtari());
    const [fetched, setFetched] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [linkingId, setLinkingId] = useState(null);

    // GÖRÜNEN AY NE İSE O OKUNUYOR. Sabit bir pencere (ör. ±30 gün) kullanmak,
    // kullanıcı üç ay ileri gittiğinde boş bir takvim gösterirdi.
    const load = useCallback(async () => {
        // Bağlı değilken ağa çıkılmıyor; liste zaten aşağıda boşa düşüyor.
        if (!isGoogleConnected) return;
        setLoading(true);
        const from = new Date(year, month, 1);
        const to = new Date(year, month + 1, 1);
        const { events: list, error: hata } = await fetchCalendarWindow({ userId, userProfile, from, to });
        setFetched(list);
        setError(hata);
        setLoading(false);
    }, [isGoogleConnected, userId, userProfile, year, month]);

    useEffect(() => { load(); }, [load]);

    const grid = useMemo(() => monthGrid(year, month), [year, month]);
    // Bağlantı kesilirse ekranda eski etkinlikler kalmasın: gösterim doğrudan
    // bağlantı durumundan türüyor, ayrı bir temizleme adımı yok.
    const gunler = useMemo(
        () => bucketByDay(sessions, isGoogleConnected ? fetched : []),
        [sessions, fetched, isGoogleConnected]
    );
    const seciliGun = gunler.get(selected) || [];

    const ayDegistir = (delta) => {
        const d = new Date(year, month + delta, 1);
        setYear(d.getFullYear());
        setMonth(d.getMonth());
    };
    const buguneDon = () => {
        setYear(bugun.getFullYear());
        setMonth(bugun.getMonth());
        setSelected(bugununAnahtari());
    };

    const eslesme = (event) => matchCandidate(event, candidates);

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* ── Başlık: ay gezinme + senkron durumu ── */}
            <div className="flex items-center gap-2 px-[18px] py-[11px] border-b border-n200 flex-shrink-0 flex-wrap">
                <button onClick={() => ayDegistir(-1)} aria-label="Önceki ay"
                    className="w-7 h-7 flex items-center justify-center rounded-md text-n500 border border-n200 hover:bg-n50">
                    <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[13px] font-semibold text-n900 min-w-[130px] text-center">
                    {monthLabel(year, month)}
                </span>
                <button onClick={() => ayDegistir(1)} aria-label="Sonraki ay"
                    className="w-7 h-7 flex items-center justify-center rounded-md text-n500 border border-n200 hover:bg-n50">
                    <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button onClick={buguneDon}
                    className="h-7 px-[11px] rounded-md text-[12px] font-medium text-n600 bg-n0 border border-n200 hover:bg-n50">
                    Bugün
                </button>

                {/* SENKRON DURUMU BURADA. Bağlantı Ayarlar'a gömülüyken
                    kullanıcı sonucu göremiyor ve "senkronize et diye bir alan
                    yok" diyordu. */}
                <div className="ml-auto flex items-center gap-2">
                    {isGoogleConnected ? (
                        <>
                            <span className="text-[11px] text-n500 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-ok" />
                                Google Takvim bağlı
                            </span>
                            <button
                                onClick={load}
                                disabled={loading}
                                className="h-7 px-[11px] rounded-md text-[12px] font-medium text-n600 bg-n0 border border-n200 hover:bg-n50 disabled:opacity-60 flex items-center gap-1.5"
                            >
                                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                Senkronize et
                            </button>
                        </>
                    ) : (
                        <>
                            <span className="text-[11px] text-n500">Google Takvim bağlı değil</span>
                            <button
                                onClick={onConnect}
                                className="h-7 px-[11px] rounded-md text-[12px] font-semibold bg-brand hover:bg-brand-600 text-white flex items-center gap-1.5"
                            >
                                <CalendarDays className="w-3 h-3" /> Takvimi bağla
                            </button>
                        </>
                    )}
                </div>
            </div>

            {error && (
                <div className="mx-[18px] mt-3 bg-warn-bg rounded-md px-3 py-2 flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-warn mt-0.5 shrink-0" />
                    <p className="text-[11px] text-n700 m-0">{error}</p>
                </div>
            )}

            <div className="flex-1 overflow-y-auto">
                {/* ── Izgara ── */}
                <div className="px-[18px] pt-3">
                    <div className="grid grid-cols-7 gap-px bg-n200 border border-n200 rounded-[10px] overflow-hidden">
                        {WEEKDAYS.map((g) => (
                            <div key={g} className="bg-n50 px-2 py-1.5 text-[10px] font-semibold text-n500 uppercase tracking-[0.08em] text-center">
                                {g}
                            </div>
                        ))}
                        {grid.map((cell) => {
                            const items = gunler.get(cell.key) || [];
                            const secili = cell.key === selected;
                            const bugunMu = cell.key === bugununAnahtari();
                            return (
                                <button
                                    key={cell.key}
                                    onClick={() => setSelected(cell.key)}
                                    className={`bg-n0 min-h-[86px] p-1.5 text-left align-top hover:bg-n25 ${
                                        secili ? 'ring-2 ring-inset ring-brand' : ''
                                    } ${cell.inMonth ? '' : 'opacity-45'}`}
                                >
                                    <div className={`text-[11px] font-semibold mb-1 ${
                                        bugunMu ? 'text-brand' : 'text-n700'
                                    }`}>
                                        {cell.date.getDate()}
                                        {bugunMu && <span className="ml-1 text-[10px] font-medium">bugün</span>}
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                        {items.slice(0, 3).map((it, i) => {
                                            if (it.kind === 'session') {
                                                const tone = sessionTone(it.session);
                                                return (
                                                    <span key={`s-${i}`}
                                                        style={{ background: tone.bg, color: tone.fg }}
                                                        className="text-[10px] font-medium px-1 py-0.5 rounded truncate">
                                                        {it.time && `${it.time} `}{it.session.candidateName || 'Aday'}
                                                    </span>
                                                );
                                            }
                                            const eslesen = eslesme(it.event).candidate;
                                            const tone = eventTone(eslesen, looksLikeInterview(it.event));
                                            return (
                                                <span key={`e-${i}`}
                                                    style={{ background: tone.bg, color: tone.fg }}
                                                    className="text-[10px] font-medium px-1 py-0.5 rounded truncate">
                                                    {it.time && `${it.time} `}{it.event.title}
                                                </span>
                                            );
                                        })}
                                        {items.length > 3 && (
                                            <span className="text-[10px] text-n400 px-1">+{items.length - 3} daha</span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Renk anahtarı — iki kaynağın farkı görünsün. */}
                    <div className="flex items-center gap-3 flex-wrap py-2 text-[10px] text-n500">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded" style={{ background: '#EEF1FF', border: '1px solid #5068FF' }} /> Planlı mülakat</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded" style={{ background: '#EEF2FF', border: '1px solid #4F46E5' }} /> Tamamlanmış</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded" style={{ background: '#FFFBEB', border: '1px solid #96590A' }} /> Mülakat olabilir (işaretlenmemiş)</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-n100 border border-n300" /> Diğer takvim etkinliği</span>
                    </div>
                </div>

                {/* ── Seçili günün ayrıntısı ── */}
                <div className="px-[18px] pb-4">
                    <div className="text-[11px] font-semibold text-n500 uppercase tracking-[0.08em] py-2 border-t border-n200">
                        {new Date(`${selected}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}
                    </div>

                    {seciliGun.length === 0 && (
                        <p className="text-[12px] text-n400 py-3 m-0">Bu günde kayıt yok.</p>
                    )}

                    {seciliGun.map((it, i) => {
                        if (it.kind === 'session') {
                            const s = it.session;
                            const isDone = s._effectiveCompleted || s.status === 'completed';
                            const isCancelled = s.status === 'cancelled';
                            const gecti = isSessionPast(s);
                            return (
                                <div key={`sd-${i}`} className="py-2.5 border-b border-n100 flex items-start gap-3 flex-wrap">
                                    <div className="text-[12px] font-semibold text-n700 w-[52px] shrink-0 tabular-nums">
                                        {it.time || '—'}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[12px] text-n900 truncate">{s.candidateName || 'Aday'}</div>
                                        <div className="text-[11px] text-n400 mt-0.5">
                                            {s.positionTitle || s.title || 'Mülakat'} · {isCancelled ? 'iptal' : isDone ? 'tamamlandı' : 'planlı'}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={() => onOpenSession(s)}
                                            className="h-7 px-[11px] rounded-md text-[12px] font-semibold bg-n0 text-n600 border border-n200 hover:bg-n50"
                                        >
                                            {isDone ? 'Rapor' : 'Aç'}
                                        </button>
                                        {!isDone && !isCancelled && gecti && (
                                            <button
                                                onClick={() => onSessionResult(s)}
                                                className="h-7 px-[11px] rounded-md text-[12px] font-semibold bg-brand hover:bg-brand-600 text-white flex items-center gap-1.5"
                                            >
                                                <ClipboardCheck className="w-3 h-3" /> Sonucu gir
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        }

                        const e = it.event;
                        const { candidate, source } = eslesme(e);
                        const kayit = candidate ? sessionForEvent(e, candidate) : null;
                        const muhtemel = looksLikeInterview(e);
                        return (
                            <div key={`ed-${i}`} className="py-2.5 border-b border-n100">
                                <div className="flex items-start gap-3 flex-wrap">
                                    <div className="text-[12px] font-semibold text-n700 w-[52px] shrink-0 tabular-nums">
                                        {it.time || 'Tüm gün'}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[12px] text-n900 truncate">{e.title}</div>
                                        <div className="text-[11px] text-n400 mt-0.5">
                                            {candidate
                                                ? <>
                                                    <span className="text-brand font-semibold">{candidate.name}</span>
                                                    {' · '}{MATCH_LABEL[source] || ''}
                                                    {kayit ? ' · mülakat kaydı var' : ' · henüz mülakat olarak işaretlenmedi'}
                                                </>
                                                : muhtemel
                                                    ? <span className="text-warn-text font-semibold">Mülakat olabilir — bir adaya işaretleyin</span>
                                                    : 'Adaya bağlı değil'}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                        {e.htmlLink && (
                                            <a href={e.htmlLink} target="_blank" rel="noopener noreferrer" title="Takvimde aç"
                                                className="w-7 h-7 flex items-center justify-center rounded-md text-n400 border border-n200 hover:bg-n50 hover:text-n700">
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
                                        )}
                                        {candidate && (
                                            <button onClick={() => onPrepare(candidate.id)}
                                                title="Bu adayın mülakat planına ve sorularına git"
                                                className="h-7 px-[11px] rounded-md text-[12px] font-semibold bg-n0 text-n600 border border-n200 hover:bg-n50">
                                                Hazırlık
                                            </button>
                                        )}
                                        {candidate && !kayit && (
                                            <button onClick={() => onEventResult(e, candidate)}
                                                className="h-7 px-[11px] rounded-md text-[12px] font-semibold bg-n0 text-n600 border border-n200 hover:bg-n50 flex items-center gap-1.5">
                                                <ClipboardCheck className="w-3 h-3" /> Sonucu gir
                                            </button>
                                        )}
                                        {/* MÜLAKAT OLARAK İŞARETLE — sadece bağlamak yetmiyordu.
                                            Bağlamak yalnızca eşleşmeyi kuruyor; mülakat listesinde,
                                            süreçte ve raporlarda hiçbir şey görünmüyordu. Bu düğme
                                            adayın altında GERÇEK bir planlı mülakat kaydı açıyor. */}
                                        {!kayit && (
                                            <button onClick={() => setLinkingId(linkingId === e.id ? null : e.id)}
                                                title={candidate
                                                    ? `${candidate.name} adına planlı bir mülakat kaydı oluşturur`
                                                    : 'Bu görüşmeyi sistemdeki bir adayın mülakatı olarak kaydeder'}
                                                className={`h-7 px-[11px] rounded-md text-[12px] font-semibold flex items-center gap-1.5 ${
                                                    muhtemel && !candidate
                                                        ? 'bg-warn-bg text-warn-text border border-warn'
                                                        : 'bg-brand hover:bg-brand-600 text-white'
                                                }`}>
                                                <UserPlus className="w-3 h-3" /> Mülakat olarak işaretle
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {linkingId === e.id && (
                                    candidate ? (
                                        // Eşleşen aday zaten belli; ikinci kez sormak gereksiz
                                        // bir adım olurdu. Yine de KİMİN adına kaydedileceği
                                        // yazıyor — sessizce kaydetmiyoruz.
                                        <div className="mt-2 border border-n200 rounded-md p-2.5 bg-n25 flex items-center gap-2 flex-wrap">
                                            <span className="text-[11px] text-n700">
                                                <strong>{candidate.name}</strong> adına planlı mülakat kaydı oluşturulacak.
                                            </span>
                                            <div className="ml-auto flex items-center gap-1.5">
                                                <button onClick={() => setLinkingId(null)}
                                                    className="h-7 px-3 rounded-md text-[11px] font-semibold text-n500 border border-n200 hover:bg-n50">
                                                    Vazgeç
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        setLinkingId(null);
                                                        try { await onMarkInterview(e, candidate); }
                                                        catch (err) { setError(err?.message || 'Kaydedilemedi.'); }
                                                    }}
                                                    className="h-7 px-3 rounded-md text-[11px] font-semibold bg-brand hover:bg-brand-600 text-white">
                                                    Oluştur
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <AdaySecici
                                            candidates={candidates}
                                            onCancel={() => setLinkingId(null)}
                                            onSelect={async (c) => {
                                                setLinkingId(null);
                                                try { await onMarkInterview(e, c); }
                                                catch (err) { setError(err?.message || 'Kaydedilemedi.'); }
                                            }}
                                        />
                                    )
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <p className="text-[10px] text-n400 px-[18px] py-2 border-t border-n200">
                Takvim salt okunur. Bu ekran hiçbir etkinliği değiştirmiyor, silmiyor ve takvime yeni kayıt eklemiyor.
            </p>
        </div>
    );
}
