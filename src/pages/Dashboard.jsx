// src/pages/Dashboard.jsx
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import Header from '../components/Header';
import AddCandidateModal from '../components/AddCandidateModal';
import { doc, getDoc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { STAGES, getStage } from '../utils/pipelineStages';
import { isSessionDone } from '../utils/interviewSession';
import {
    resolveCandidateStage,
    cleanRoleText,
    withCoherentScores,
} from '../utils/candidateTable';
import { calculateMatchScore, filterCandidatesByDomain } from '../services/matchService';
import {
    FLOW_TONE as RIBBON, STALE_DAYS, lastTouchMs, waitingDays,
    positionHealth, HEALTH_LABEL,
} from '../utils/candidateFlow';
import FlowTrace from '../components/flow/FlowTrace';
import {
    Users,
    Target,
    Clock,
    Star,
    Upload,
    Plus,
    Calendar,
    SlidersHorizontal,
    ArrowUpRight,
    ArrowDownRight,
    Check,
    AlertTriangle,
} from 'lucide-react';
import { tc, withTenantParam } from '../config/tenantPaths';

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
        <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${isGood ? 'text-ok' : 'text-bad'}`}>
            <Icon className="w-3 h-3" />
            {val}
        </span>
    );
}

/** Skor tonu: ≥85 Talent teal, ≥70 nötr mürekkep, altı amber (metin tonu). */
function scoreTone(score) {
    if (score >= 85) return '#0F766E';
    if (score >= 70) return '#4C524F';
    return '#96590A';
}

/**
 * Satırda gösterilen rol. Eşleşilen açık ilanın başlığı önce: o metin
 * sistemin kendi ilan adı ve temiz. Yoksa CV'den gelen serbest metin
 * `cleanRoleText` ile süzülüyor — ama o süzgeç noktada cümleyi kestiği için
 * "Backend Geliştirici (Node.js)" gibi başlıkları yarıda bırakıyordu.
 */
function roleOf(c) {
    if (typeof c?.matchedPositionTitle === 'string' && c.matchedPositionTitle.trim()) return c.matchedPositionTitle.trim();
    return cleanRoleText(c?.position || c?.bestTitle, 'Pozisyon atanmadı');
}

function initialOf(name) {
    const s = String(name || '').trim();
    return s ? s[0].toLocaleUpperCase('tr-TR') : '?';
}

/** Bekleme süresi: STALE_DAYS ve üstü amber — "bu aday bekletiliyor". */
function WaitText({ days }) {
    const stale = days != null && days >= STALE_DAYS;
    return (
        <span className={`text-[12px] tabular-nums whitespace-nowrap ${stale ? 'text-warn-text font-medium' : 'text-n500'}`}>
            {days == null ? '—' : days === 0 ? 'bugün' : `${days} gündür`}
        </span>
    );
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


/**
 * "Öne çıkan CV'ler" hangi aşamaları kapsar.
 *
 * Yalnızca CV'si okunmuş ama henüz görüşmeye geçmemiş adaylar: Ön Eleme ve
 * İnceleme. Mülakat/Teklif/İşe Alındı/Reddedildi aşamasındaki bir adayı
 * "öne çıkan CV" diye göstermek yanlış olurdu — o adayın CV'si zaten
 * değerlendirilmiş ve bir karara bağlanmış.
 */
const ONE_CIKAN_ASAMALAR = ['ai_analysis', 'review'];

/** Kuyruk satırı — kimlik, akış izi, bekleme, skor ve tek eylem. */
function QueueRow({ r, actions, onOpen }) {
    const tone = scoreTone(r.score);
    return (
        <li className="group grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_132px_48px_172px] items-center gap-x-4 gap-y-1 px-4 py-2.5 hover:bg-n50 rounded-xl">
            <button onClick={() => onOpen(r.id)} className="flex items-center gap-3 min-w-0 text-left">
                <span className="w-8 h-8 flex-none rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-[12px] font-semibold">
                    {initialOf(r.name)}
                </span>
                <span className="min-w-0">
                    <span className="block text-[14px] font-medium text-n900 truncate">{r.name}</span>
                    <span className="block text-[12px] text-n500 truncate">{r.role}</span>
                </span>
            </button>
            <span className="hidden sm:flex flex-col gap-1.5">
                <FlowTrace stageKey={r.stageKey} segment="w-[18px]" />
                <WaitText days={r.days} />
            </span>
            <span className="hidden sm:block text-right text-[16px] font-semibold tabular-nums" style={{ color: tone }}>
                {r.score || '—'}
            </span>
            <span className="flex items-center justify-end gap-1">{actions}</span>
            <span className="sm:hidden col-span-2 flex items-center gap-3 pl-11">
                <FlowTrace stageKey={r.stageKey} />
                <WaitText days={r.days} />
                <span className="ml-auto text-[13px] font-semibold tabular-nums" style={{ color: tone }}>{r.score || '—'}</span>
            </span>
        </li>
    );
}

function QueueGroup({ title, caption, rows, empty, renderActions, more, onOpen }) {
    return (
        <section className="py-3">
            <div className="flex items-baseline gap-3 px-4 pb-1.5 flex-wrap">
                <h3 className="m-0 text-[14px] font-semibold text-n900">
                    {title} <span className="text-n500 font-normal tabular-nums">{rows.length}</span>
                </h3>
                <span className="hidden sm:inline text-[12px] text-n500">{caption}</span>
                {more}
            </div>
            {rows.length === 0 ? (
                <p className="m-0 px-4 py-2 text-[13px] text-n500">{empty}</p>
            ) : (
                <ul className="list-none m-0 p-0">
                    {rows.slice(0, 5).map((r) => <QueueRow key={r.id} r={r} actions={renderActions(r)} onOpen={onOpen} />)}
                </ul>
            )}
        </section>
    );
}

export default function Dashboard() {
    const {
        enrichedCandidates,
        setViewCandidateId,
        setPreselectedInterviewData,
        error,
        loading: candidatesLoading,
    } = useCandidates();

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    // Havuzun aşama süzgeci — yalnızca görünüm durumu, hiçbir yere yazılmıyor.
    const [poolFilter, setPoolFilter] = useState(null);

    const [sessionStatuses, setSessionStatuses] = useState({});
    useEffect(() => {
        const unsubscribe = onSnapshot(
            collection(db, tc('interviews')),
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

    /**
     * Adayı GERÇEK detay sayfasında açar.
     *
     * Burası önce CandidateDrawer'ı açıyordu. O çekmece redesign öncesinde bu
     * ekranda hiç açılmıyordu (state vardı, hiçbir yer set etmiyordu) — havuz
     * tablosunu yazarken farkında olmadan kullanımdan kalkmış bir bileşeni
     * yeniden devreye sokmuşum. Kullanılan ekran Aday Süreci sayfası;
     * PipelinePage de aynı zinciri kullanıyor.
     */
    const openCandidate = useCallback((id) => {
        setViewCandidateId(id);
        window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }));
    }, [setViewCandidateId]);

    // Combined loading state — true while either context is doing its initial fetch.
    // Drives the skeleton placeholders below so KPIs don't flash 0 → real value.
    const isLoading = candidatesLoading || positionsLoading;

    const openPositions = useMemo(() => positions.filter(p => p.status === 'open'), [positions]);
    const allOpenCount = openPositions.length;

    /**
     * SKOR TUTARLILIĞI — havuzdaki "CV uyumu", Aday Detayı'ndaki CV Analizi ile
     * AYNI sayı olmak zorunda.
     *
     * `enrichedCandidates[].bestScore` ham hâliyle adayın TÜM pozisyon
     * analizlerinin maksimumu. Aday Detayı ise adayın atandığı pozisyonun
     * skorunu gösteriyor. En yüksek skoru başka bir pozisyonda olan adaylarda
     * iki ekran farklı sayı veriyordu.
     *
     * `withCoherentScores`, Adaylar tablosunun da kullandığı düzeltme:
     * bestScore'u `scoreForPositionDetail` ile adayın kendi pozisyonuna göre
     * yeniden hesaplıyor. Çağrı kalıbı CandidatesTablePage ile birebir aynı —
     * ikinci bir cetvel üretmemek için.
     */
    const candidates = useMemo(
        () => withCoherentScores(enrichedCandidates || [], openPositions, (c, p) => calculateMatchScore(c, p).score),
        [enrichedCandidates, openPositions]
    );

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
        { label: "Toplam aday",    short: "Aday",     value: String(candidates.length),     change: null, goodness: true, desc: "kayıtlı aday",  icon: Users  },
        { label: "Açık pozisyon", short: "Pozisyon", value: String(allOpenCount),          change: null, goodness: true, desc: "açık ilan",     icon: Target },
        { label: "Ortalama uyum",     short: "Uyum",     value: `${dynamicMetrics.avgMatch}%`, change: null, goodness: true, desc: "ortalama uyum", icon: Star   },
        { label: "İşe alım süresi",  short: "Hız",      value: dynamicMetrics.recruitSpeed,   change: null, goodness: true, desc: "ortalama süre", icon: Clock  },
    ], [candidates.length, allOpenCount, dynamicMetrics]);

    /**
     * ÖNE ÇIKAN CV'LER — "hangi CV'ye bugün bakmalıyım?"
     *
     * Kuyruğun yerine geçti. Kuyruk aciliyet kuralları işletiyordu (canlı
     * görüşme, bekleyen teklif…); bu blok ise tek bir soruya cevap veriyor:
     * elde okunmayı hak eden en iyi CV'ler hangileri.
     *
     * İKİ SÜZGEÇ BİRLİKTE:
     *  1) Aşama — yalnızca Ön Eleme ve İnceleme. Mülakata geçmiş, teklif
     *     almış, işe alınmış ya da reddedilmiş bir aday burada görünmez;
     *     onun CV'si zaten değerlendirilip karara bağlanmış.
     *  2) Meslek alanı — aday, AÇIK ilanlardan en az biriyle alan uyumlu
     *     olmalı. Uyum ölçüsü YENİDEN YAZILMADI: Açık İlanlar ekranının
     *     kullandığı `filterCandidatesByDomain` her açık ilan için
     *     çalıştırılıp sonuçlar birleştiriliyor. İkinci bir cetvel üretmek,
     *     aynı adayın iki ekranda farklı "uyumlu" sayılmasına yol açardı.
     *
     * SKOR KAYNAĞI havuz tablosuyla aynı: yukarıdaki `candidates`
     * (withCoherentScores'tan geçmiş bestScore). Burada yeniden hesaplansaydı
     * aynı aday için Kontrol Paneli ile Adaylar tablosu farklı sayı gösterirdi.
     *
     * GEREKÇE UYDURULMUYOR: satır, adayı buraya sokan iki olgunun okunabilir
     * hâli — aşaması ve eşleştiği ilan.
     */
    const featuredCvs = useMemo(() => {
        if (openPositions.length === 0) return [];
        const incelemedekiler = candidates.filter(
            (c) => ONE_CIKAN_ASAMALAR.includes(resolveCandidateStage(c))
        );
        const alanUyumlu = new Map();
        for (const pos of openPositions) {
            for (const c of filterCandidatesByDomain(pos, incelemedekiler)) alanUyumlu.set(c.id, c);
        }
        return Array.from(alanUyumlu.values())
            .sort((a, b) => (Number(b.bestScore) || 0) - (Number(a.bestScore) || 0))
            .slice(0, 5)
            .map((c) => ({
                id: c.id,
                name: c.name || 'Aday',
                role: roleOf(c),
                score: Math.round(Number(c.bestScore) || 0),
                stageKey: resolveCandidateStage(c),
                days: waitingDays(c),
                why: `${getStage(resolveCandidateStage(c)).label} aşamasında, ${
                    c.matchedPositionTitle
                        ? `${c.matchedPositionTitle} ilanıyla eşleşti`
                        : 'ilan atanmadı'
                }`,
            }));
    }, [candidates, openPositions]);

    /** Mülakat planlama akışı — Aday Detayı'ndaki "Mülakat planla" ile aynı zincir. */
    const planInterview = useCallback((id) => {
        setPreselectedInterviewData({ candidateId: id });
        window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }));
    }, [setPreselectedInterviewData]);

    /** Aşama süzgeci sayıları — havuzun kendisinden türetiliyor. */
    const stageCounts = useMemo(() => {
        const map = {};
        candidates.forEach(c => {
            const key = resolveCandidateStage(c);
            map[key] = (map[key] || 0) + 1;
        });
        return map;
    }, [candidates]);

    /**
     * Toplu yükleme: Aday Süreci sayfasına geç, ardından oradaki modalı aç.
     *
     * Yalnızca sayfaya yönlendirmek yetmiyordu — düğmede "Toplu Yükleme"
     * yazarken kullanıcıyı yükleme ekranının önüne bırakıp modalı açmamak,
     * düğmenin üzerinde yazan işi yapmaması demekti. Gecikme, hedef sayfa
     * mount olup dinleyicisini kurana kadar bekliyor; aynı kalıp aşağıdaki
     * openPosition zincirinde de kullanılıyor.
     */
    const openBulkUpload = () => {
        window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }));
        setTimeout(() => window.dispatchEvent(new CustomEvent('openBulkUpload')), 80);
    };

    /** Satırın aksiyon bağlantısı — mevcut navigasyon zincirlerini aynen kullanır. */
    const rowActionFor = (c) => {
        const sessions = Array.isArray(c.interviewSessions) ? c.interviewSessions : [];
        const live = sessions.find(s => (sessionStatuses[s.id] || s.status) === 'live');
        if (live) return { label: 'Katıl', onClick: () => navigate(withTenantParam(`/live-interview/${live.id}`)) };
        const done = sessions.find(s => isSessionDone(s, sessionStatuses[s.id] || s.status));
        if (done) return { label: 'Rapor', onClick: () => navigate(withTenantParam(`/interview-report/${done.id}`)) };
        return { label: 'İncele', onClick: () => openCandidate(c.id) };
    };

    const poolRows = useMemo(() => {
        return candidates
            .filter(c => !poolFilter || resolveCandidateStage(c) === poolFilter)
            .map(c => ({
                id: c.id,
                candidate: c,
                name: c.name || 'Aday',
                city: c.location || '—',
                role: roleOf(c),
                score: Math.round(Number(c.bestScore) || 0),
                stage: getStage(resolveCandidateStage(c)),
                last: relativeTime(lastTouchMs(c)),
            }))
            .sort((a, b) => b.score - a.score);
    }, [candidates, poolFilter]);

    const shownRows = poolRows.slice(0, 9);

    /**
     * BEKLEYENLER — "bugün kimi bekletiyoruz?" sorusunun cevabı.
     *
     * Üç kuyruk, üçü de topun kimde olduğuna göre:
     *  - CV'si okunacaklar  → yukarıdaki `featuredCvs` (aynı süzgeç, aynı sıra)
     *  - Karar bekleyenler  → mülakatı yapılmış, kararı verilmemiş adaylar
     *  - Teklif yanıtı      → top adayda; ekip yalnızca takip ediyor
     * Her kuyrukta en uzun bekleyen önce gelir: listenin işi bekletmeyi
     * görünür kılmak. Veri yazılmaz; yalnızca mevcut havuz okunur.
     */
    const queues = useMemo(() => {
        const byStage = (key) => candidates
            .filter((c) => resolveCandidateStage(c) === key)
            .map((c) => ({
                id: c.id,
                candidate: c,
                name: c.name || 'Aday',
                role: roleOf(c),
                score: Math.round(Number(c.bestScore) || 0),
                stageKey: key,
                days: waitingDays(c),
            }))
            .sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
        return { decision: byStage('interview_done'), offer: byStage('offer') };
    }, [candidates]);

    /** Bulgu cümlesi için en uzun bekleyen (ekipte bekleyenler arasından). */
    const longestWait = useMemo(() => {
        const pool = [...featuredCvs, ...queues.decision].filter((r) => r.days != null);
        return pool.sort((a, b) => b.days - a.days)[0] || null;
    }, [featuredCvs, queues.decision]);

    /**
     * Açık ilanların sağlığı. Aday sayımı eski "Açık pozisyonlar" listesiyle
     * AYNI kural (position ya da bestTitle ilan başlığına eşit); üstüne
     * akışın durup durmadığı ekleniyor. Riskli ilanlar önce.
     */
    const positionRows = useMemo(() => {
        const rank = { empty: 0, stalled: 1, thin: 2, ok: 3 };
        return openPositions
            .map((pos) => {
                const mine = candidates.filter(c => c.position === pos.title || c.bestTitle === pos.title);
                const health = positionHealth(mine.map((c) => ({ stage: resolveCandidateStage(c), candidate: c })));
                return { pos, count: mine.length, health };
            })
            .sort((a, b) => rank[a.health] - rank[b.health]);
    }, [openPositions, candidates]);
    const riskyCount = positionRows.filter((r) => r.health !== 'ok').length;


    if (error) {
        return (
            <div className="infoset min-h-dvh">
                <Header title="Kontrol Paneli" />
                <div className="p-6">
                    <div className="tf-empty max-w-lg mx-auto" role="alert">
                        <div className="tf-empty-title">Veriler eşitlenemedi</div>
                        Sayfayı yenileyin; sorun sürerse bağlantınızı kontrol edin.
                    </div>
                </div>
            </div>
        );
    }

    const goTo = (view) => window.dispatchEvent(new CustomEvent('changeView', { detail: view }));
    const openPositionById = (id) => {
        goTo('positions');
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('openPosition', { detail: { positionId: id } }));
        }, 80);
    };
    const maxStage = Math.max(1, ...STAGES.map((s) => stageCounts[s.key] || 0));
    const teamWaiting = featuredCvs.length + queues.decision.length;
    const todayLocal = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();

    /** Mülakat satırının tıklaması — eski "Yaklaşan mülakatlar" zinciri aynen. */
    const openSession = async (s) => {
        const effComp = isSessionDone(s, s.status);
        if (effComp) { navigate(withTenantParam(`/interview-report/${s.id}`)); return; }
        try {
            const snap = await getDoc(doc(db, tc('interviews'), s.id));
            if (snap.exists() && snap.data()?.status === 'completed') {
                navigate(withTenantParam(`/interview-report/${s.id}`));
            } else {
                navigate(withTenantParam(`/live-interview/${s.id}`));
            }
        } catch {
            navigate(withTenantParam(`/live-interview/${s.id}`));
        }
    };

    return (
        <div className="infoset min-h-dvh bg-n0">
            <Header title="Kontrol Paneli" />

            {/* BAŞLIK — ekranın sorusu ve bugünün bulgusu.
                Ekran adı Header'da yazıyor; burada ekranın cevapladığı soru
                başlık oluyor. Alt satır sorunun cevabı: kaç aday ekipten bir
                adım bekliyor ve en uzun bekleyen kim. */}
            <div className="tf-page-head !pb-5">
                <div className="min-w-0">
                    <p className="m-0 text-[13px] text-n500">
                        {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}
                    </p>
                    <h1 className="m-0 mt-0.5 text-[26px] leading-[32px] font-semibold tracking-[-0.02em] text-n900">
                        Bugün kimi bekletiyoruz?
                    </h1>
                    <p className="m-0 mt-1.5 text-[14px] text-n600 tabular-nums">
                        {isLoading ? 'Havuz okunuyor…' : teamWaiting === 0
                            ? 'Ekipten adım bekleyen aday yok.'
                            : `${teamWaiting} aday sizden bir adım bekliyor${
                                longestWait && longestWait.days > 0 ? `; en uzun bekleyen ${longestWait.name}, ${longestWait.days} gündür` : ''
                            }.`}
                        {queues.offer.length > 0 && ` ${queues.offer.length} teklif adayın yanıtında.`}
                    </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <button onClick={openBulkUpload} className="tf-btn tf-btn-secondary">
                        <Upload /> Toplu yükleme
                    </button>
                    <button onClick={() => setIsAddModalOpen(true)} className="tf-btn tf-btn-primary">
                        <Plus /> Yeni aday
                    </button>
                </div>
            </div>

            {/* GÖVDE — solda bekleyenler (ekranın odağı), sağda bugünün ajandası,
                riskteki ilanlar ve özet sayılar. */}
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] items-start gap-6 px-4 md:px-6 pb-8">
                <section aria-labelledby="bekleyenler" className="bg-n50 rounded-2xl p-2 min-w-0">
                    <h2 id="bekleyenler" className="sr-only">Bekleyen adaylar</h2>
                    <div className="bg-n0 rounded-xl divide-y divide-n100">
                        <QueueGroup
                            onOpen={openCandidate}
                            title="Öne çıkan CV'ler"
                            caption="Ön eleme ve incelemede, açık ilanların alanıyla uyumlu; okunmayı bekliyor"
                            rows={featuredCvs}
                            empty={openPositions.length === 0
                                ? 'Açık ilan yok, bu yüzden alan uyumu hesaplanamıyor.'
                                : 'Ön eleme ya da inceleme aşamasında, açık ilanların alanıyla uyumlu aday bulunmuyor.'}
                            more={<button onClick={() => goTo('candidates-table')} className="ml-auto text-[13px] tf-link">Tümünü gör</button>}
                            renderActions={(r) => (
                                <>
                                    <button onClick={() => openCandidate(r.id)} className="tf-btn tf-btn-secondary h-8">Profili aç</button>
                                    <button
                                        onClick={() => planInterview(r.id)}
                                        title="Mülakat planla"
                                        aria-label={`${r.name} için mülakat planla`}
                                        className="tf-btn tf-btn-ghost tf-btn-icon"
                                    >
                                        <Calendar />
                                    </button>
                                </>
                            )}
                        />
                        <QueueGroup
                            onOpen={openCandidate}
                            title="Karar bekleyenler"
                            caption="Mülakatı yapıldı, karar verilmedi"
                            rows={queues.decision}
                            empty="Kararı bekleyen aday yok."
                            renderActions={(r) => {
                                const a = rowActionFor(r.candidate);
                                return (
                                    <>
                                        {a.label === 'Rapor' && (
                                            <button onClick={a.onClick} className="tf-btn tf-btn-ghost h-8">Rapor</button>
                                        )}
                                        <button onClick={() => openCandidate(r.id)} className="tf-btn tf-btn-primary h-8">Karar ver</button>
                                    </>
                                );
                            }}
                        />
                        <QueueGroup
                            onOpen={openCandidate}
                            title="Teklif yanıtı bekleyenler"
                            caption="Top adayda; takip için"
                            rows={queues.offer}
                            empty="Yanıt bekleyen teklif yok."
                            renderActions={(r) => (
                                <button onClick={() => openCandidate(r.id)} className="tf-btn tf-btn-secondary h-8">İncele</button>
                            )}
                        />
                    </div>
                </section>

                <aside className="flex flex-col gap-6 min-w-0">
                    {/* AJANDA — eski "Yaklaşan mülakatlar": aynı veri (bu hafta,
                        en fazla 4), aynı tıklama zinciri. Bugünkü saat büyük. */}
                    <section>
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="tf-section-title">Yaklaşan mülakatlar</h2>
                            <button onClick={() => goTo('interviews')} className="text-[13px] tf-link">Tümü</button>
                        </div>
                        {weeklyPlan.length === 0 ? (
                            <p className="m-0 text-[13px] text-n500 py-2">Planlı mülakat yok.</p>
                        ) : (
                            <ol className="list-none m-0 p-0 flex flex-col gap-1.5">
                                {weeklyPlan.map((s) => {
                                    const isToday = s.date === todayLocal;
                                    const live = s.status === 'live';
                                    return (
                                        <li key={`${s.id}-${s.time}`}>
                                            <button
                                                onClick={() => openSession(s)}
                                                className={`w-full flex items-stretch gap-3 text-left rounded-xl px-3 py-2.5 ${isToday ? 'bg-brand-50 hover:bg-brand-100' : 'bg-n50 hover:bg-n100'}`}
                                            >
                                                <span className="w-12 flex-none flex flex-col">
                                                    <span className="text-[16px] leading-5 font-semibold tabular-nums text-n900">{s.time}</span>
                                                    <span className={`text-[12px] ${live ? 'text-bad-text font-medium' : 'text-n500'}`}>
                                                        {live ? 'Canlı' : isToday ? 'Bugün' : s.date
                                                            ? new Date(`${s.date}T00:00:00`).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' })
                                                            : '—'}
                                                    </span>
                                                </span>
                                                <span className="flex-1 min-w-0">
                                                    <span className="block text-[13px] font-medium text-n900 truncate">{s.name}</span>
                                                    <span className="block text-[12px] text-n500 truncate">{s.role}</span>
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ol>
                        )}
                    </section>

                    {/* İLANLAR — tüm açık ilanlar, riskli olanlar önde. Sayım eski
                        listeyle aynı; yanına akışın durumu eklendi. */}
                    <section>
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="tf-section-title">Açık pozisyonlar</h2>
                            <span className="text-[12px] text-n500 tabular-nums">
                                {allOpenCount} aktif{riskyCount > 0 ? `, ${riskyCount} dikkat istiyor` : ''}
                            </span>
                        </div>
                        {positionRows.length === 0 && (
                            <p className="m-0 text-[13px] text-n500 py-2">Açık pozisyon yok.</p>
                        )}
                        <ul className="list-none m-0 p-0">
                            {positionRows.slice(0, 6).map(({ pos, count, health }) => (
                                <li key={pos.id}>
                                    <button
                                        onClick={() => openPositionById(pos.id)}
                                        className="w-full flex items-center gap-3 py-2 text-left hover:bg-n50 rounded-lg -mx-2 px-2"
                                    >
                                        <span className="flex-1 min-w-0 text-[13px] font-medium text-n900 truncate">{pos.title}</span>
                                        {health !== 'ok' && (
                                            <span className={`flex-none text-[11px] font-medium px-2 py-0.5 rounded-full ${health === 'empty' || health === 'stalled' ? 'bg-warn-bg text-warn-text' : 'bg-n100 text-n600'}`}>
                                                {HEALTH_LABEL[health]}
                                            </span>
                                        )}
                                        <span className="w-14 text-right text-[12px] text-n500 tabular-nums flex-none">{count} aday</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <button onClick={() => goTo('positions')} className="mt-1 text-[13px] tf-link">
                            Tüm pozisyonlar
                        </button>
                    </section>

                    {/* ÖZET — eski dört gösterge, ikincil: tek kutu, ince bölmeler. */}
                    <section aria-label="Özet göstergeler">
                        <dl className="grid grid-cols-2 m-0 border border-n200 rounded-xl overflow-hidden">
                            {isLoading
                                ? Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="p-3 border-n200 [&:nth-child(odd)]:border-r [&:nth-child(-n+2)]:border-b">
                                        <div className="h-3 w-16 bg-n100 rounded animate-pulse" />
                                        <div className="h-5 w-10 bg-n100 rounded mt-2 animate-pulse" />
                                    </div>
                                ))
                                : kpis.map((k) => (
                                    <div key={k.label} title={`${k.label} — ${k.desc}`} className="p-3 border-n200 [&:nth-child(odd)]:border-r [&:nth-child(-n+2)]:border-b">
                                        <dt className="text-[12px] text-n500">{k.label}</dt>
                                        <dd className="m-0 mt-0.5 text-[18px] font-semibold text-n900 tabular-nums">
                                            {k.value} {k.change && <Trend val={k.change} goodness={k.goodness} />}
                                        </dd>
                                    </div>
                                ))}
                        </dl>
                    </section>

                    <section>
                        <h2 className="tf-section-title mb-2">Sistem durumu</h2>
                        {[
                            { label: 'Skorlama motoru', val: 98 },
                            { label: 'Önyargı denetimi', val: 100 },
                            { label: 'Veri eşitleme', val: 82 },
                        ].map((e) => {
                            const ok = e.val > 90;
                            const Icon = ok ? Check : AlertTriangle;
                            return (
                                <div key={e.label} className="flex items-center gap-2.5 py-1.5">
                                    <Icon className={`w-4 h-4 flex-none ${ok ? 'text-ok' : 'text-warn'}`} aria-hidden="true" />
                                    <span className="flex-1 text-[13px] text-n800">{e.label}</span>
                                    <span className="text-[12px] text-n500 tabular-nums">%{e.val}</span>
                                </div>
                            );
                        })}
                    </section>
                </aside>
            </div>

            {/* ADAY HAVUZU — akış hunisi tablonun süzgeci. Her sütun bir aşama;
                yüksekliği o aşamadaki aday sayısı. Sütuna basmak tabloyu o
                aşamaya süzer (eski hap süzgecinin işi), tekrar basmak kaldırır. */}
            <section data-ui="table" className="border-t border-n200 min-w-0">
                <div className="flex items-center gap-3 px-4 md:px-6 pt-5 pb-3 flex-wrap">
                    <h2 className="tf-section-title">Aday havuzu</h2>
                    <span className="text-[13px] text-n500 tabular-nums">
                        {poolFilter
                            ? `${poolRows.length} / ${candidates.length} aday, ${getStage(poolFilter).label} süzgeci`
                            : `${candidates.length} aday`}
                    </span>
                    <button onClick={() => goTo('candidates-table')} className="ml-auto tf-btn tf-btn-secondary">
                        <SlidersHorizontal /> Filtrele
                    </button>
                </div>

                <div className="px-4 md:px-6 pb-4 overflow-x-auto">
                    <div className="flex items-end gap-1.5 min-w-[640px]" role="group" aria-label="Aşamalara göre aday dağılımı">
                        <button
                            onClick={() => setPoolFilter(null)}
                            aria-pressed={!poolFilter}
                            className={`flex-none w-[84px] h-[92px] rounded-xl flex flex-col justify-end p-2.5 text-left transition-colors ${!poolFilter ? 'bg-n900 text-white' : 'bg-n50 text-n700 hover:bg-n100'}`}
                        >
                            <span className="text-[22px] leading-6 font-semibold tabular-nums">{candidates.length}</span>
                            <span className="text-[12px] opacity-80">Tümü</span>
                        </button>
                        {STAGES.map((s) => {
                            const n = stageCounts[s.key] || 0;
                            const on = poolFilter === s.key;
                            const dim = poolFilter && !on;
                            const h = n === 0 ? 4 : Math.max(10, Math.round((n / maxStage) * 44));
                            return (
                                <button
                                    key={s.key}
                                    onClick={() => setPoolFilter(on ? null : s.key)}
                                    aria-pressed={on}
                                    title={s.desc}
                                    className={`flex-1 min-w-0 h-[92px] rounded-xl flex flex-col justify-end p-2.5 text-left transition-[background-color,opacity] ${s.key === 'rejected' ? 'ml-3' : ''} ${on ? 'bg-n0 ring-2 ring-n900' : 'bg-n50 hover:bg-n100'} ${dim ? 'opacity-45' : ''}`}
                                >
                                    <span className="block w-full rounded-md" style={{ height: h, background: RIBBON[s.key] || '#CDD3D0' }} aria-hidden="true" />
                                    <span className="mt-1.5 flex items-baseline gap-1.5 min-w-0">
                                        <span className="text-[16px] font-semibold tabular-nums text-n900">{n}</span>
                                        <span className="text-[12px] text-n600 truncate">{s.label}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="hidden md:grid grid-cols-[1.6fr_1.3fr_96px_150px_96px_84px] px-6 py-2 border-y border-n200 bg-n50 tf-th">
                    <span>Aday</span>
                    <span>Pozisyon</span>
                    <span className="text-right pr-3.5">CV uyumu</span>
                    <span>Aşama</span>
                    <span>Son işlem</span>
                    <span className="text-right">Aksiyon</span>
                </div>

                {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="px-6 py-3 border-b border-n100 flex items-center gap-2.5 animate-pulse">
                            <div className="w-7 h-7 rounded-full bg-n100" />
                            <div className="h-3 w-40 bg-n100 rounded" />
                            <div className="ml-auto h-3 w-16 bg-n100 rounded" />
                        </div>
                    ))
                ) : shownRows.length === 0 ? (
                    <div className="px-6 py-12 text-center text-[13px] text-n500">
                        {poolFilter ? 'Bu aşamada aday yok.' : 'Havuzda aday yok. Yeni aday ekleyerek başlayın.'}
                    </div>
                ) : shownRows.map((r) => {
                    const action = rowActionFor(r.candidate);
                    const tone = scoreTone(r.score);
                    return (
                        <div
                            key={r.id}
                            onClick={() => openCandidate(r.id)}
                            className="grid grid-cols-[1fr_84px] md:grid-cols-[1.6fr_1.3fr_96px_150px_96px_84px] items-center px-4 md:px-6 py-2.5 border-b border-n100 text-[13px] cursor-pointer hover:bg-n50"
                        >
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 flex-none rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-[11px] font-semibold">
                                    {initialOf(r.name)}
                                </div>
                                <div className="min-w-0">
                                    <div className="font-medium text-n900 truncate">{r.name}</div>
                                    <div className="text-[12px] text-n500 truncate">{r.city}</div>
                                </div>
                            </div>
                            <div className="hidden md:block min-w-0 text-n600 truncate pr-3">{r.role}</div>
                            <div className="hidden md:block text-right pr-3.5">
                                <span className="font-semibold tabular-nums" style={{ color: tone }}>{r.score || '—'}</span>
                            </div>
                            <div className="hidden md:flex flex-col gap-1">
                                <span className="text-[12px] text-n700">{r.stage.label}</span>
                                <FlowTrace stageKey={r.stage.key} />
                            </div>
                            <div className="hidden md:block text-[12px] text-n500">{r.last}</div>
                            <button
                                onClick={(e) => { e.stopPropagation(); action.onClick(); }}
                                className="text-right text-[13px] tf-link"
                            >
                                {action.label}
                            </button>
                        </div>
                    );
                })}

                <div className="px-4 md:px-6 py-3 flex items-center gap-2.5 text-[12px] text-n500">
                    <span className="tabular-nums">{poolRows.length} adaydan {shownRows.length} tanesi gösteriliyor</span>
                    <button onClick={() => goTo('candidates-table')} className="ml-auto text-[13px] tf-link">
                        Tümünü gör
                    </button>
                </div>
            </section>

            <AddCandidateModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
        </div>
    );
}
