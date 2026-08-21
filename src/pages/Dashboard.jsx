// src/pages/Dashboard.jsx
import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import Header from '../components/Header';
import CandidateDrawer from '../components/CandidateDrawer';
import AddCandidateModal from '../components/AddCandidateModal';
import { doc, getDoc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { STAGES, getStage } from '../utils/pipelineStages';
import { resolveStageKey, cleanRoleText, isDeepScanned } from '../utils/candidateTable';
import {
    Users,
    Target,
    Clock,
    Star,
    Upload,
    Plus,
    ListChecks,
    X,
    SlidersHorizontal,
    ArrowUpRight,
    ArrowDownRight,
    Check,
    AlertTriangle,
} from 'lucide-react';

/** Infoset accent — toplu yükleme eylemi tek başına mor taşır (tasarım tokenları). */
const VIOLET = '#6E59F2';

/**
 * Renders a KPI delta with semantically-correct arrow direction and colour.
 *
 * Two independent axes:
 *  - direction (↗ vs ↘): pure numerical sign — "+12" → up, "-22%" → down
 *  - goodness (green vs red): is this change good or bad for THIS metric?
 *    e.g. "Toplam Aday -5" is bad (red), "İşe Alım Hızı -22%" is GOOD (green —
 *    süre düştü), so direction and colour are independent.
 *
 * Bugün hiçbir KPI delta üretmiyor (`change: null`); bileşen, gerçek bir trend
 * kaynağı bağlandığında yeniden devreye girsin diye duruyor.
 *
 * @param {string}  val      Raw delta string with sign, e.g. "+12" or "-22%"
 * @param {boolean} goodness Is this delta a positive outcome? (default: derives
 *                           from sign — "+" → good, "-" → bad)
 */
function Trend({ val, goodness }) {
    const isDown = typeof val === 'string' && val.trim().startsWith('-');
    const Icon = isDown ? ArrowDownRight : ArrowUpRight;
    const isGood = typeof goodness === 'boolean' ? goodness : !isDown;
    return (
        <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${isGood ? 'text-ok' : 'text-bad'}`}>
            <Icon className="w-3 h-3" />
            {val}
        </span>
    );
}

/** Prototip skor eşikleri: ≥85 yeşil, ≥70 marka mavisi, altı amber. */
function scoreTone(score) {
    if (score >= 85) return '#16A26C';
    if (score >= 70) return '#5068FF';
    return '#E8A13B';
}

function initialOf(name) {
    const s = String(name || '').trim();
    return s ? s[0].toLocaleUpperCase('tr-TR') : '?';
}

/** Firestore Timestamp | ISO | ms → ms; çözülemezse 0. */
function toMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value === 'number') return value;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

/** Adaya en son ne zaman dokunulduğu — updatedAt yoksa createdAt. */
function lastTouchMs(candidate) {
    return toMillis(candidate?.updatedAt) || toMillis(candidate?.createdAt);
}

/**
 * "2 sa önce" / "Dün" / "5 gün önce".
 *
 * Zaman damgası YOKSA "—" döner, uydurma bir tarih değil: eski kayıtların bir
 * kısmında updatedAt da createdAt da bulunmuyor.
 */
function relativeTime(ms) {
    if (!ms) return '—';
    const diff = Date.now() - ms;
    if (diff < 0) return 'Az önce';
    const min = Math.floor(diff / 60000);
    if (min < 60) return min <= 1 ? 'Az önce' : `${min} dk önce`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} sa önce`;
    const day = Math.floor(hr / 24);
    if (day === 1) return 'Dün';
    if (day < 7) return `${day} gün önce`;
    const wk = Math.floor(day / 7);
    return wk === 1 ? '1 hafta önce' : `${wk} hafta önce`;
}

function daysSince(ms) {
    if (!ms) return null;
    return Math.floor((Date.now() - ms) / 86400000);
}

/** Bir oturum fiilen bitmiş mi? — Dashboard genelinde tek ölçüt. */
function isSessionDone(session, effectiveStatus) {
    return effectiveStatus === 'completed'
        || (effectiveStatus !== 'live'
            && (session.aiOverallScore > 0 || Boolean(session.aiSummary) || session.finalScore > 0));
}

const QUEUE_TONES = {
    danger: { accent: '#E5484D', avatarBg: '#FCEAEB' },
    warn: { accent: '#E8A13B', avatarBg: '#FDF4E4' },
    brand: { accent: '#5068FF', avatarBg: '#EEF1FF' },
    success: { accent: '#16A26C', avatarBg: '#E6F7EF' },
};

export default function Dashboard() {
    const {
        enrichedCandidates,
        updateCandidate,
        error,
        deleteCandidate,
        loading: candidatesLoading,
    } = useCandidates();

    // Sabit referans: enrichedCandidates yokken her render yeni bir [] üretmek
    // aşağıdaki tüm useMemo bağımlılıklarını geçersiz kılıyordu.
    const candidates = useMemo(() => enrichedCandidates || [], [enrichedCandidates]);
    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    // Havuzun aşama süzgeci ve kuyruktan elle çıkarılanlar — ikisi de yalnızca
    // görünüm durumu, hiçbir yere yazılmıyor.
    const [poolFilter, setPoolFilter] = useState(null);
    const [dismissed, setDismissed] = useState(() => new Set());

    const [sessionStatuses, setSessionStatuses] = useState({});
    useEffect(() => {
        const unsubscribe = onSnapshot(
            collection(db, 'interviews'),
            (snap) => {
                const map = {};
                snap.forEach(docSnap => { map[docSnap.id] = docSnap.data().status; });
                setSessionStatuses(map);
            },
            (err) => console.warn('[Dashboard] session status listener error:', err)
        );
        return () => unsubscribe();
    }, []);

    const { positions, loading: positionsLoading } = usePositions();
    const navigate = useNavigate();

    // Combined loading state — true while either context is doing its initial fetch.
    // Drives the skeleton placeholders below so KPIs don't flash 0 → real value.
    const isLoading = candidatesLoading || positionsLoading;

    const activePositions = useMemo(() => positions.filter(p => p.status === 'open').slice(0, 4), [positions]);
    const allOpenCount = useMemo(() => positions.filter(p => p.status === 'open').length, [positions]);

    const candidateById = useMemo(() => new Map(candidates.map(c => [c.id, c])), [candidates]);

    const weeklyPlan = useMemo(() => {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfWeek = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
        const sessionsMap = new Map();

        candidates.forEach(c => {
            if (c.interviewSessions && Array.isArray(c.interviewSessions)) {
                c.interviewSessions.forEach(s => {
                    const effectiveStatus = sessionStatuses[s.id] || s.status;
                    const effectivelyCompleted = isSessionDone(s, effectiveStatus);
                    if (effectiveStatus === 'cancelled' || effectivelyCompleted) return;

                    const sessionDatePart = s.date ? s.date.split('T')[0] : '';
                    const sessionDate = new Date(sessionDatePart);
                    const isLive = effectiveStatus === 'live';

                    if (isLive || (sessionDate >= startOfToday && sessionDate <= endOfWeek)) {
                        const key = `${c.id}-${sessionDatePart}-${s.time}`;
                        const sessionData = {
                            id: s.id,
                            candidateId: c.id,
                            name: c.name,
                            role: c.position || c.bestTitle || 'Aday',
                            time: s.time || '10:00',
                            date: sessionDatePart,
                            status: effectiveStatus,
                            aiOverallScore: s.aiOverallScore || 0,
                            aiSummary: s.aiSummary,
                            finalScore: s.finalScore || 0,
                            score: c.combinedScore || c.bestScore || 0,
                        };
                        if (!sessionsMap.has(key) || effectiveStatus === 'live' || effectiveStatus === 'completed') {
                            sessionsMap.set(key, sessionData);
                        }
                    }
                });
            }
        });

        return Array.from(sessionsMap.values()).sort((a, b) => {
            if (a.status === 'live' && b.status !== 'live') return -1;
            if (b.status === 'live' && a.status !== 'live') return 1;
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.time.localeCompare(b.time);
        }).slice(0, 4);
    }, [candidates, sessionStatuses]);

    const dynamicMetrics = useMemo(() => {
        const avgMatchArr = candidates.filter(c => (Number(c.bestScore) || 0) > 0);
        const avgMatch = avgMatchArr.length > 0
            ? Math.round(avgMatchArr.reduce((acc, curr) => acc + (Number(curr.bestScore) || 0), 0) / avgMatchArr.length)
            : 88;
        return { avgMatch, recruitSpeed: "12.4 Gün" };
    }, [candidates]);

    // KPI deltas removed: there is no historical/previous-period baseline yet,
    // so the previous "+12 / +2 / +5% / -22%" values were fabricated. We show the
    // real current values without a misleading trend until a real trend source
    // exists. (`change: null` → Trend chip hidden.)
    const kpis = useMemo(() => [
        { label: "Toplam Aday",    short: "Aday",     value: String(candidates.length),     change: null, goodness: true, desc: "kayıtlı aday",  icon: Users  },
        { label: "Aktif Pozisyon", short: "Pozisyon", value: String(allOpenCount),          change: null, goodness: true, desc: "açık ilan",     icon: Target },
        { label: "Uyum Skoru",     short: "Uyum",     value: `${dynamicMetrics.avgMatch}%`, change: null, goodness: true, desc: "ortalama uyum", icon: Star   },
        { label: "İşe Alım Hızı",  short: "Hız",      value: dynamicMetrics.recruitSpeed,   change: null, goodness: true, desc: "ortalama süre", icon: Clock  },
    ], [candidates.length, allOpenCount, dynamicMetrics]);

    /**
     * BUGÜN ÖNCE BUNLAR — kuyruğa giren her satır, o adayı oraya sokan KOŞULUN
     * kendisidir.
     *
     * Prototip bu bloğun başlığında "AI önceliklendirdi" diyor; öyle bir
     * mekanizma yok. Olmayan bir ölçümü varmış gibi sunmak bu projede tekrar
     * tekrar düzelttiğimiz hata olduğu için kuyruk deterministik kurallarla
     * kuruluyor; gerekçe metni tahmin değil, kuralın okunabilir hâli.
     *
     * Kurallar aciliyet sırasına göre denenir ve bir aday yalnızca İLK eşleştiği
     * kuralla kuyruğa girer — aynı kişi iki kart açmaz.
     */
    const queue = useMemo(() => {
        const out = [];
        const seen = new Set();
        const push = (candidate, rule) => {
            if (!candidate || seen.has(candidate.id)) return;
            seen.add(candidate.id);
            out.push({
                id: candidate.id,
                candidate,
                name: candidate.name || 'Aday',
                role: cleanRoleText(candidate.position || candidate.bestTitle, 'Pozisyon atanmadı'),
                // CV uyumu (bestScore) — combinedScore görüşme skorunu ortalamaya
                // katıyor ve o zaman havuzdaki sayı Aday Detayı'ndaki CV Analizi ile
                // tutmuyor. Kolon başlığı 'CV uyumu' olduğu sürece kaynak bestScore.
                score: Math.round(Number(candidate.bestScore) || 0),
                ...rule,
            });
        };

        // Aynı kurala giren çok aday varsa skoru yüksek olan öne geçsin.
        const byScore = [...candidates].sort(
            (a, b) => (Number(b.bestScore) || 0) - (Number(a.bestScore) || 0)
        );
        const todayStr = new Date().toISOString().split('T')[0];

        // 1 — Görüşme şu anda canlı.
        weeklyPlan.filter(s => s.status === 'live').forEach(s => {
            push(candidateById.get(s.candidateId), {
                why: 'Görüşme şu anda canlı.',
                cta: 'Katıl',
                tone: 'danger',
                onCta: () => navigate(`/live-interview/${s.id}`),
            });
        });

        // 2 — Görüşme bugün planlı, henüz başlamamış.
        weeklyPlan.filter(s => s.status !== 'live' && s.date === todayStr).forEach(s => {
            push(candidateById.get(s.candidateId), {
                why: `Görüşme bugün ${s.time}'da.`,
                cta: 'Görüntüle',
                tone: 'warn',
                onCta: () => navigate(`/live-interview/${s.id}`),
            });
        });

        // 3 — Görüşme bitmiş ama aday hâlâ Mülakat aşamasında: rapor hazır,
        //     aşama ilerletilmemiş.
        byScore.forEach(c => {
            if (resolveStageKey(c.status) !== 'interview') return;
            const done = (c.interviewSessions || []).find(
                s => isSessionDone(s, sessionStatuses[s.id] || s.status)
            );
            if (!done) return;
            push(c, {
                why: 'Görüşme tamamlandı, aşama ilerletilmedi.',
                cta: 'Rapor',
                tone: 'success',
                onCta: () => navigate(`/interview-report/${done.id}`),
            });
        });

        // 4 — Derin tarama bitmiş ama aday hâlâ Ön Eleme'de.
        byScore.forEach(c => {
            if (resolveStageKey(c.status) !== 'ai_analysis' || !isDeepScanned(c)) return;
            push(c, {
                why: 'Derin tarama bitti, inceleme bekliyor.',
                cta: 'İncele',
                tone: 'brand',
                onCta: () => setSelectedCandidate(c),
            });
        });

        // 5 — Teklif aşamasında bekleyen.
        byScore.forEach(c => {
            if (resolveStageKey(c.status) !== 'offer') return;
            const d = daysSince(lastTouchMs(c));
            push(c, {
                why: d && d > 0
                    ? `Teklif aşamasında, ${d} gündür güncellenmedi.`
                    : 'Teklif aşamasında, onay bekliyor.',
                cta: 'Onayla',
                tone: 'warn',
                onCta: () => setSelectedCandidate(c),
            });
        });

        return out;
    }, [candidates, weeklyPlan, candidateById, sessionStatuses, navigate]);

    const visibleQueue = useMemo(
        () => queue.filter(q => !dismissed.has(q.id)).slice(0, 5),
        [queue, dismissed]
    );
    const queueHiddenByUser = queue.length > 0 && visibleQueue.length === 0;
    const queuedIds = useMemo(() => new Set(visibleQueue.map(q => q.id)), [visibleQueue]);

    /** Aşama süzgeci sayıları — havuzun kendisinden türetiliyor. */
    const stageCounts = useMemo(() => {
        const map = {};
        candidates.forEach(c => {
            const key = resolveStageKey(c.status);
            map[key] = (map[key] || 0) + 1;
        });
        return map;
    }, [candidates]);

    /** Satırın aksiyon bağlantısı — mevcut navigasyon zincirlerini aynen kullanır. */
    const rowActionFor = (c) => {
        const sessions = Array.isArray(c.interviewSessions) ? c.interviewSessions : [];
        const live = sessions.find(s => (sessionStatuses[s.id] || s.status) === 'live');
        if (live) return { label: 'Katıl', onClick: () => navigate(`/live-interview/${live.id}`) };
        const done = sessions.find(s => isSessionDone(s, sessionStatuses[s.id] || s.status));
        if (done) return { label: 'Rapor', onClick: () => navigate(`/interview-report/${done.id}`) };
        return { label: 'İncele', onClick: () => setSelectedCandidate(c) };
    };

    const poolRows = useMemo(() => {
        return candidates
            .filter(c => !poolFilter || resolveStageKey(c.status) === poolFilter)
            .map(c => ({
                id: c.id,
                candidate: c,
                name: c.name || 'Aday',
                city: c.location || '—',
                role: cleanRoleText(c.position || c.bestTitle, 'Pozisyon atanmadı'),
                score: Math.round(Number(c.bestScore) || 0),
                stage: getStage(resolveStageKey(c.status)),
                last: relativeTime(lastTouchMs(c)),
            }))
            .sort((a, b) => b.score - a.score);
    }, [candidates, poolFilter]);

    const shownRows = poolRows.slice(0, 9);

    if (error) return <div className="p-10 text-[11px] font-black text-red-500 uppercase tracking-widest text-center">Sistem Hatası: Veri Senkronizasyonu Başarısız.</div>;

    return (
        <div className="infoset min-h-screen bg-n25">
            <Header title="Kontrol Paneli" />

            {/* SAYFA BAŞLIĞI — 52px: başlık + tarih + KPI şeridi + birincil eylemler */}
            <header className="h-[52px] flex items-center gap-3.5 px-[18px] border-b border-n200 bg-n0">
                <h2 className="text-[14px] font-semibold m-0 tracking-[-0.02em]">Kontrol Paneli</h2>
                <span className="text-[12px] text-n500">
                    {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}
                </span>
                <div className="ml-auto flex items-center gap-3.5">
                    {isLoading
                        ? Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="hidden md:block pl-3.5 border-l border-n200">
                                <div className="h-4 w-16 bg-n100 rounded animate-pulse" />
                            </div>
                        ))
                        : kpis.map((k) => (
                            <div
                                key={k.label}
                                title={`${k.label} — ${k.desc}`}
                                className="hidden md:flex items-baseline gap-1.5 pl-3.5 border-l border-n200"
                            >
                                <span className="text-[11px] text-n500">{k.short}</span>
                                <span className="text-[16px] font-semibold tracking-[-0.02em]">{k.value}</span>
                                {k.change && <Trend val={k.change} goodness={k.goodness} />}
                            </div>
                        ))}
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }))}
                        style={{ background: VIOLET }}
                        className="flex items-center gap-1.5 text-[12px] font-semibold text-white px-3 py-1.5 rounded-md hover:opacity-90"
                    >
                        <Upload className="w-[13px] h-[13px]" /> Toplu Yükleme
                    </button>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center gap-1.5 text-[13px] font-semibold text-white bg-brand hover:bg-brand-600 px-3 py-1.5 rounded-md"
                    >
                        <Plus className="w-3.5 h-3.5" /> Yeni Aday
                    </button>
                </div>
            </header>

            {/* BUGÜN ÖNCE BUNLAR — kural bazlı iş kuyruğu */}
            <div className="px-[18px] py-3.5 bg-n25 border-b border-n200">
                <div className="flex items-center gap-2.5 mb-2.5 flex-wrap">
                    <ListChecks className="w-4 h-4 text-brand" />
                    <span className="text-[14px] font-semibold tracking-[-0.01em]">Bugün önce bunlar</span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 bg-brand-50 text-brand rounded-full">
                        {visibleQueue.length} iş
                    </span>
                    <span className="text-[12px] text-n500">aciliyet kuralına göre sıralandı</span>
                    {dismissed.size > 0 && (
                        <button
                            onClick={() => setDismissed(new Set())}
                            className="ml-auto text-[12px] font-medium text-brand hover:text-brand-600"
                        >
                            Kuyruğu geri al
                        </button>
                    )}
                </div>

                {visibleQueue.length === 0 ? (
                    <div className="border border-dashed border-n300 rounded-[10px] p-[26px] text-center">
                        <div className="text-[13px] font-semibold mb-[3px]">Kuyruk boş</div>
                        <div className="text-[12px] text-n500">
                            {queueHiddenByUser
                                ? 'Bugünün işlerini kenara aldınız. "Kuyruğu geri al" ile geri getirebilirsiniz.'
                                : 'Bekleyen bir iş yok. Yeni iş çıktığında burada belirir.'}
                        </div>
                    </div>
                ) : (
                    <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                        {visibleQueue.map((q) => {
                            const tone = QUEUE_TONES[q.tone] || QUEUE_TONES.brand;
                            return (
                                <div
                                    key={q.id}
                                    style={{ borderTop: `2px solid ${tone.accent}` }}
                                    className="bg-n0 border border-n200 rounded-[10px] shadow-sm px-3 py-[11px] flex flex-col gap-[7px]"
                                >
                                    <div className="flex items-center gap-2">
                                        <div
                                            style={{ background: tone.avatarBg, color: tone.accent }}
                                            className="w-[26px] h-[26px] flex-none rounded-full flex items-center justify-center text-[11px] font-semibold"
                                        >
                                            {initialOf(q.name)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[13px] font-semibold truncate">{q.name}</div>
                                            <div className="text-[11px] text-n400 truncate">{q.role}</div>
                                        </div>
                                        {q.score > 0 && (
                                            <span className="text-[13px] font-semibold" style={{ color: tone.accent }}>%{q.score}</span>
                                        )}
                                    </div>
                                    <div className="text-[12px] leading-[1.4] text-n600 min-h-[34px]">{q.why}</div>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={q.onCta}
                                            className="flex-1 text-center text-[12px] font-semibold text-white bg-brand hover:bg-brand-600 py-1.5 rounded-md"
                                        >
                                            {q.cta}
                                        </button>
                                        <button
                                            onClick={() => setDismissed(prev => new Set(prev).add(q.id))}
                                            title="Bugünlük kenara al"
                                            className="w-7 h-7 border border-n200 rounded-md flex items-center justify-center text-n400 hover:bg-n50"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* GÖVDE — havuz tablosu + sağ ray */}
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_268px]">

                {/* SOL — ADAY HAVUZU */}
                <div className="xl:border-r border-n200 bg-n0">
                    <div className="flex items-center gap-2.5 px-[18px] pt-2.5 flex-wrap">
                        <span className="text-[13px] font-semibold">Aday havuzu</span>
                        <span className="text-[12px] text-n400">
                            {candidates.length} aday{poolFilter ? ` · ${poolRows.length} süzüldü` : ''}
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                            <button
                                onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }))}
                                style={{ color: '#6D28D9', background: '#F5F3FF', borderColor: '#DDD6FE' }}
                                className="flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold border rounded-md px-[11px] py-[5px]"
                            >
                                <Upload className="w-[13px] h-[13px]" /> Toplu yükleme
                            </button>
                            <button
                                onClick={() => setIsAddModalOpen(true)}
                                className="flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold text-white bg-brand hover:bg-brand-600 rounded-md px-[11px] py-[5px]"
                            >
                                <Plus className="w-[13px] h-[13px]" /> Yeni aday
                            </button>
                        </div>
                    </div>

                    {/* Aşama süzgeci — tek satır pill'ler */}
                    <div className="flex items-center gap-2 px-[18px] py-2.5 border-b border-n200 overflow-x-auto">
                        <button
                            onClick={() => setPoolFilter(null)}
                            className={`flex-none whitespace-nowrap flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full border ${!poolFilter ? 'bg-brand-50 text-brand border-brand-100' : 'bg-n0 text-n600 border-n200'}`}
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-n400" />
                            Tümü <span className="text-n400 font-medium">{candidates.length}</span>
                        </button>
                        {STAGES.map(s => (
                            <button
                                key={s.key}
                                onClick={() => setPoolFilter(poolFilter === s.key ? null : s.key)}
                                className={`flex-none whitespace-nowrap flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full border ${poolFilter === s.key ? 'bg-brand-50 text-brand border-brand-100' : 'bg-n0 text-n600 border-n200'}`}
                            >
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                                {s.label} <span className="text-n400 font-medium">{stageCounts[s.key] || 0}</span>
                            </button>
                        ))}
                        {poolFilter && (
                            <button onClick={() => setPoolFilter(null)} className="flex-none text-[12px] font-medium text-brand">Temizle</button>
                        )}
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidates-table' }))}
                            className="ml-auto flex-none flex items-center gap-1.5 text-[12px] text-n500 border border-n200 rounded-md px-2.5 py-1 hover:bg-n50"
                        >
                            <SlidersHorizontal className="w-[13px] h-[13px]" /> Filtrele
                        </button>
                    </div>

                    <div className="hidden md:grid grid-cols-[1.6fr_1.3fr_96px_88px_96px_84px] px-[18px] py-2 border-b border-n200 bg-n50 text-[11px] font-semibold text-n500">
                        <span>Aday</span>
                        <span>Pozisyon</span>
                        <span className="text-right pr-3.5">CV uyumu</span>
                        <span>Aşama</span>
                        <span>Son işlem</span>
                        <span className="text-right">Aksiyon</span>
                    </div>

                    {isLoading ? (
                        Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="px-[18px] py-[9px] border-b border-n100 flex items-center gap-2.5 animate-pulse">
                                <div className="w-[26px] h-[26px] rounded-full bg-n100" />
                                <div className="h-3 w-40 bg-n100 rounded" />
                                <div className="ml-auto h-3 w-16 bg-n100 rounded" />
                            </div>
                        ))
                    ) : shownRows.length === 0 ? (
                        <div className="px-[18px] py-12 text-center text-[12px] text-n400">
                            {poolFilter ? 'Bu aşamada aday yok.' : 'Havuzda aday yok.'}
                        </div>
                    ) : shownRows.map((r) => {
                        const action = rowActionFor(r.candidate);
                        const tone = scoreTone(r.score);
                        return (
                            <div
                                key={r.id}
                                onClick={() => setSelectedCandidate(r.candidate)}
                                className={`grid grid-cols-[1fr_84px] md:grid-cols-[1.6fr_1.3fr_96px_88px_96px_84px] items-center px-[18px] py-[9px] border-b border-n100 text-[13px] cursor-pointer hover:bg-n50 ${queuedIds.has(r.id) ? 'bg-brand-50/40' : ''}`}
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-[26px] h-[26px] flex-none rounded-full bg-brand-50 text-brand flex items-center justify-center text-[11px] font-semibold">
                                        {initialOf(r.name)}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-medium flex items-center gap-1.5">
                                            <span className="truncate">{r.name}</span>
                                            {queuedIds.has(r.id) && (
                                                <span className="flex-none text-[11px] font-semibold text-brand bg-brand-50 px-1.5 rounded-full">kuyrukta</span>
                                            )}
                                        </div>
                                        <div className="text-[11px] text-n400 truncate">{r.city}</div>
                                    </div>
                                </div>
                                <div className="hidden md:block min-w-0 text-n600 truncate">{r.role}</div>
                                <div className="hidden md:flex items-center justify-end gap-[7px] pr-3.5">
                                    <div className="w-[26px] h-[5px] bg-n100 rounded-full overflow-hidden">
                                        <div className="h-full" style={{ width: `${Math.min(r.score, 100)}%`, background: tone }} />
                                    </div>
                                    <span className="font-semibold" style={{ color: tone }}>{r.score || '—'}</span>
                                </div>
                                <div className="hidden md:block">
                                    <span
                                        className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                                        style={{ background: r.stage.bg, color: r.stage.color }}
                                    >
                                        {r.stage.label}
                                    </span>
                                </div>
                                <div className="hidden md:block text-[11px] text-n500">{r.last}</div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); action.onClick(); }}
                                    className="text-right text-[12px] font-medium text-brand hover:text-brand-600"
                                >
                                    {action.label}
                                </button>
                            </div>
                        );
                    })}

                    <div className="px-[18px] py-2.5 flex items-center gap-2.5 text-[12px] text-n500">
                        <span>{poolRows.length} adaydan {shownRows.length} tanesi gösteriliyor</span>
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidates-table' }))}
                            className="ml-auto text-brand font-medium hover:text-brand-600"
                        >
                            Tümünü gör →
                        </button>
                    </div>
                </div>

                {/* SAĞ RAY — yaklaşan mülakatlar · açık pozisyonlar · sistem durumu */}
                <div className="p-3.5 flex flex-col gap-3 bg-n25">
                    <div>
                        <div className="flex items-center justify-between mb-2.5">
                            <span className="text-[11px] font-semibold text-n500 tracking-[0.08em] uppercase">Yaklaşan mülakatlar</span>
                            <button
                                onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }))}
                                className="text-[11px] text-brand font-medium"
                            >
                                Tümü
                            </button>
                        </div>
                        {weeklyPlan.length === 0 ? (
                            <div className="text-[12px] text-n400 py-3">Planlı mülakat bulunmuyor.</div>
                        ) : weeklyPlan.map((s) => {
                            const todayStr = new Date().toISOString().split('T')[0];
                            const isToday = s.date === todayStr;
                            const effComp = isSessionDone(s, s.status);
                            const dot = s.status === 'live' ? '#E5484D' : effComp ? '#16A26C' : isToday ? '#E8A13B' : '#5068FF';
                            return (
                                <button
                                    key={`${s.id}-${s.time}`}
                                    onClick={async () => {
                                        if (effComp) { navigate(`/interview-report/${s.id}`); return; }
                                        try {
                                            const snap = await getDoc(doc(db, 'interviews', s.id));
                                            if (snap.exists() && snap.data()?.status === 'completed') {
                                                navigate(`/interview-report/${s.id}`);
                                            } else {
                                                navigate(`/live-interview/${s.id}`);
                                            }
                                        } catch {
                                            navigate(`/live-interview/${s.id}`);
                                        }
                                    }}
                                    className="w-full flex items-center gap-2.5 py-2 border-t border-n100 text-left hover:bg-n50"
                                >
                                    <span className="w-[38px] flex-none text-[12px] font-semibold">{s.time}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[12px] font-medium truncate">{s.name}</div>
                                        <div className="text-[11px] text-n400 truncate">
                                            {s.role}
                                            {!isToday && s.date ? ` · ${new Date(s.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}` : ''}
                                        </div>
                                    </div>
                                    <span className="w-[7px] h-[7px] flex-none rounded-full" style={{ background: dot }} />
                                </button>
                            );
                        })}
                    </div>

                    <div className="h-px bg-n200" />

                    <div>
                        <div className="flex items-center justify-between mb-2.5">
                            <span className="text-[11px] font-semibold text-n500 tracking-[0.08em] uppercase">Açık pozisyonlar</span>
                            <span className="text-[11px] text-n400">{allOpenCount} aktif</span>
                        </div>
                        {activePositions.map((pos) => {
                            const posCount = candidates.filter(c => c.position === pos.title || c.bestTitle === pos.title).length;
                            return (
                                <button
                                    key={pos.id}
                                    onClick={() => {
                                        window.dispatchEvent(new CustomEvent('changeView', { detail: 'positions' }));
                                        setTimeout(() => {
                                            window.dispatchEvent(new CustomEvent('openPosition', { detail: { positionId: pos.id } }));
                                        }, 80);
                                    }}
                                    className="w-full flex items-center gap-2.5 py-2 border-t border-n100 text-left hover:bg-n50"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[12px] font-medium truncate">{pos.title}</div>
                                        <div className="text-[11px] text-n400">{posCount} aday</div>
                                    </div>
                                </button>
                            );
                        })}
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'positions' }))}
                            className="mt-2 text-[12px] font-medium text-brand hover:text-brand-600"
                        >
                            Tüm pozisyonlar →
                        </button>
                    </div>

                    <div className="h-px bg-n200" />

                    <div>
                        <div className="text-[11px] font-semibold text-n500 tracking-[0.08em] uppercase mb-2.5">Sistem durumu</div>
                        {[
                            { label: 'Skorlama motoru', val: 98 },
                            { label: 'Önyargı denetimi', val: 100 },
                            { label: 'Veri eşitleme', val: 82 },
                        ].map((e) => {
                            const ok = e.val > 90;
                            const Icon = ok ? Check : AlertTriangle;
                            return (
                                <div key={e.label} className="flex gap-2.5 py-2 border-t border-n100">
                                    <div
                                        className="w-[18px] h-[18px] flex-none mt-px rounded-full flex items-center justify-center"
                                        style={{ background: ok ? '#E6F7EF' : '#FDF4E4', color: ok ? '#16A26C' : '#E8A13B' }}
                                    >
                                        <Icon className="w-[11px] h-[11px]" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[12px] font-semibold">{e.label}</div>
                                        <div className="text-[11px] leading-[1.4] text-n400">%{e.val} kullanılabilirlik</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {selectedCandidate && (
                <CandidateDrawer
                    candidate={selectedCandidate}
                    onClose={() => setSelectedCandidate(null)}
                    onUpdate={updateCandidate}
                    onDelete={deleteCandidate}
                    positions={positions}
                />
            )}
            <AddCandidateModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
        </div>
    );
}
