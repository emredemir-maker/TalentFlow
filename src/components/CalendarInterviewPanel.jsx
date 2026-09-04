// TAKVİMİM — işin başladığı yer.
//
// ── NEDEN ───────────────────────────────────────────────────────────────────
// Takvim bugüne kadar yalnızca boş slot bulmak ve çakışma denetlemek için
// okunuyordu; hiçbir yerde gösterilmiyordu. Oysa günlük akış takvimden
// başlıyor: kullanıcı gününe bakıyor, "bu görüşmeye ne soracağım" diye
// hazırlanıyor, görüşme bitince sonucunu giriyor.
//
// Görüşmenin NEREDE yapıldığı bu ekranı ilgilendirmiyor. Takvimde Google Meet
// yazsa bile görüşme Teams'ten ya da yüz yüze olabilir; bağlantı takvim
// KAYDIYLA kuruluyor, toplantı aracıyla değil.
//
// ── EŞLEŞMEYEN KAYIT DA LİSTELENİYOR ────────────────────────────────────────
// Kullanıcı görüşmeyi Teams'ten kendisi açmış ve adayın e-postasını davete
// eklememiş olabilir. O kaydı listeden düşürmek, elle bağlayabileceği tek
// fırsatı da yok ederdi. Kişisel toplantılar da görünür — yalnızca kullanıcının
// kendisine, salt okunur.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    CalendarDays, Link2, Loader2, RefreshCw, Search, ClipboardCheck,
    ExternalLink, AlertCircle, X,
} from 'lucide-react';

import { getCalendarEvents, ensureValidGoogleToken } from '../services/integrationService';
import {
    normalizeCalendarEvent, matchCandidate, sessionForEvent, MATCH_LABEL,
} from '../utils/calendarMatch';

/** Kaç gün geriye ve ileriye bakılıyor. */
const GERI_GUN = 7;
const ILERI_GUN = 21;

const gunEtiketi = (d) => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
const saatEtiketi = (d) => d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

/** Aday seçici — eşleşmeyen kaydı elle bağlamak için. */
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
            ) : (
                <div className="flex flex-col">
                    {sonuc.map((c) => (
                        <button
                            key={c.id}
                            onClick={() => onSelect(c)}
                            className="text-left px-2 py-1.5 rounded hover:bg-n50 text-[12px] text-n700"
                        >
                            {c.name || 'İsimsiz'}
                            {c.email && <span className="text-n400"> · {c.email}</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * @param {object} props
 * @param {Array} props.candidates
 * @param {boolean} props.isGoogleConnected
 * @param {string} props.userId
 * @param {object} props.userProfile
 * @param {(candidateId: string) => void} props.onPrepare — hazırlık: aday sayfası
 * @param {(event: object, candidate: object) => void} props.onEnterResult
 * @param {(candidate: object, eventId: string) => Promise<void>} props.onLink
 * @param {() => void} props.onConnect
 */
export default function CalendarInterviewPanel({
    candidates = [],
    isGoogleConnected,
    userId,
    userProfile,
    onPrepare,
    onEnterResult,
    onLink,
    onConnect,
}) {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [linkingId, setLinkingId] = useState(null);
    const [yalnizEslesen, setYalnizEslesen] = useState(false);

    const load = useCallback(async () => {
        if (!isGoogleConnected) return;
        setLoading(true);
        setError('');
        try {
            const token = await ensureValidGoogleToken(userId, userProfile);
            if (!token) {
                setError('Google bağlantısı doğrulanamadı. Ayarlar → Sistem bölümünden yeniden bağlanın.');
                return;
            }
            const min = new Date();
            min.setDate(min.getDate() - GERI_GUN);
            const max = new Date();
            max.setDate(max.getDate() + ILERI_GUN);
            const result = await getCalendarEvents(token, min.toISOString(), max.toISOString());
            if (!result?.success) {
                setError(result?.error || 'Takvim okunamadı.');
                return;
            }
            const list = (result.events || [])
                .map(normalizeCalendarEvent)
                .filter(Boolean)
                .filter((e) => e.status !== 'cancelled')
                .sort((a, b) => a.start - b.start);
            setEvents(list);
        } catch (err) {
            setError(err?.message || 'Takvim okunamadı.');
        } finally {
            setLoading(false);
        }
    }, [isGoogleConnected, userId, userProfile]);

    useEffect(() => { load(); }, [load]);

    // Eşleşme her render'da yeniden kurulmuyor: aday listesi Firestore
    // dinleyicisinden her güncellemede yeni referans üretiyor.
    const satirlar = useMemo(() => events.map((e) => {
        const { candidate, source } = matchCandidate(e, candidates);
        return { event: e, candidate, source, session: candidate ? sessionForEvent(e, candidate) : null };
    }), [events, candidates]);

    const gorunen = yalnizEslesen ? satirlar.filter((r) => r.candidate) : satirlar;
    const eslesenSayisi = satirlar.filter((r) => r.candidate).length;

    if (!isGoogleConnected) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
                <CalendarDays className="w-8 h-8 text-n300" />
                <p className="text-[12px] text-n600 max-w-sm leading-relaxed">
                    Takvimindeki görüşmeleri burada görmek için Google hesabını bağlaman gerekiyor.
                    Takvim yalnızca <strong>okunuyor</strong>; bu ekran hiçbir etkinliği değiştirmiyor.
                </p>
                <button
                    onClick={onConnect}
                    className="h-8 px-4 rounded-md text-[12px] font-semibold bg-brand hover:bg-brand-600 text-white"
                >
                    Google hesabını bağla
                </button>
            </div>
        );
    }

    let sonGun = '';

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-[18px] py-[11px] border-b border-n200 flex-shrink-0 flex-wrap">
                <span className="text-[12px] font-semibold text-n900">Takvimim</span>
                <span className="text-[11px] text-n400">
                    son {GERI_GUN} gün · önümüzdeki {ILERI_GUN} gün
                </span>
                <button
                    onClick={() => setYalnizEslesen((v) => !v)}
                    className={`ml-auto flex items-center gap-1.5 text-[12px] font-medium border rounded-md px-[11px] py-[5px] ${
                        yalnizEslesen ? 'bg-brand-50 text-brand border-brand-100' : 'bg-n50 text-n600 border-n200 hover:bg-n100'
                    }`}
                >
                    Yalnızca adaylar ({eslesenSayisi})
                </button>
                <button
                    onClick={load}
                    disabled={loading}
                    className="flex items-center gap-1.5 text-[12px] font-medium text-n600 bg-n0 border border-n200 hover:bg-n50 rounded-md px-[11px] py-[5px] disabled:opacity-60"
                >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Yenile
                </button>
            </div>

            {error && (
                <div className="mx-[18px] mt-3 bg-warn-bg rounded-md px-3 py-2 flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-warn mt-0.5 shrink-0" />
                    <p className="text-[11px] text-n700 m-0">{error}</p>
                </div>
            )}

            <div className="flex-1 overflow-y-auto">
                {loading && events.length === 0 && (
                    <p className="text-[12px] text-n400 px-[18px] py-4">Takvim okunuyor…</p>
                )}
                {!loading && gorunen.length === 0 && (
                    <p className="text-[12px] text-n400 px-[18px] py-6">
                        {yalnizEslesen
                            ? 'Bu aralıkta adayla eşleşen bir takvim kaydı yok.'
                            : 'Bu aralıkta takvim kaydı yok.'}
                    </p>
                )}

                {gorunen.map(({ event, candidate, source, session }) => {
                    const gun = gunEtiketi(event.start);
                    const gunBasligi = gun !== sonGun;
                    sonGun = gun;
                    return (
                        <div key={event.id}>
                            {gunBasligi && (
                                <div className="px-[18px] pt-3 pb-1 text-[10px] font-semibold text-n400 uppercase tracking-[0.08em]">
                                    {gun}
                                </div>
                            )}
                            <div className="px-[18px] py-2.5 border-b border-n100 hover:bg-n25">
                                <div className="flex items-start gap-3 flex-wrap">
                                    <div className="text-[12px] font-semibold text-n700 w-[52px] shrink-0 tabular-nums">
                                        {event.allDay ? 'Tüm gün' : saatEtiketi(event.start)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[12px] text-n900 truncate">{event.title}</div>
                                        <div className="text-[11px] text-n400 mt-0.5">
                                            {candidate ? (
                                                <>
                                                    <span className="text-brand font-semibold">{candidate.name}</span>
                                                    {' · '}{MATCH_LABEL[source] || ''}
                                                    {session && ' · sonucu girilmiş'}
                                                </>
                                            ) : 'Adaya bağlı değil'}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                        {event.htmlLink && (
                                            <a
                                                href={event.htmlLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title="Takvimde aç"
                                                className="w-7 h-7 flex items-center justify-center rounded-md text-n400 border border-n200 hover:bg-n50 hover:text-n700"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
                                        )}
                                        {candidate && (
                                            <button
                                                onClick={() => onPrepare(candidate.id)}
                                                title="Bu adayın mülakat planına ve sorularına git"
                                                className="h-7 px-[11px] rounded-md text-[12px] font-semibold bg-n0 text-n600 border border-n200 hover:bg-n50"
                                            >
                                                Hazırlık
                                            </button>
                                        )}
                                        {candidate && !session && (
                                            <button
                                                onClick={() => onEnterResult(event, candidate)}
                                                className="h-7 px-[11px] rounded-md text-[12px] font-semibold bg-brand hover:bg-brand-600 text-white flex items-center gap-1.5"
                                            >
                                                <ClipboardCheck className="w-3 h-3" /> Sonucu gir
                                            </button>
                                        )}
                                        {!candidate && (
                                            <button
                                                onClick={() => setLinkingId(linkingId === event.id ? null : event.id)}
                                                className="h-7 px-[11px] rounded-md text-[12px] font-semibold bg-n0 text-n600 border border-n200 hover:bg-n50 flex items-center gap-1.5"
                                            >
                                                <Link2 className="w-3 h-3" /> Adaya bağla
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {linkingId === event.id && (
                                    <AdaySecici
                                        candidates={candidates}
                                        onCancel={() => setLinkingId(null)}
                                        onSelect={async (c) => {
                                            setLinkingId(null);
                                            try {
                                                await onLink(c, event.id);
                                            } catch (err) {
                                                setError(err?.message || 'Bağlantı kaydedilemedi.');
                                            }
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <p className="text-[10px] text-n400 px-[18px] py-2 border-t border-n200">
                Takvim salt okunur. Bu ekran hiçbir etkinliği değiştirmiyor, silmiyor ve
                takvime yeni kayıt eklemiyor.
            </p>
        </div>
    );
}
