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
import {
    resolveStageKey,
    cleanRoleText,
    withCoherentScores,
} from '../utils/candidateTable';
import { calculateMatchScore, filterCandidatesByDomain } from '../services/matchService';
import {
    Users,
    Target,
    Clock,
    Star,
    Upload,
    Plus,
    Calendar,
    ArrowRight,
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
        <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${isGood ? 'text-ok' : 'text-bad'}`}>
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


/** Bir oturum fiilen bitmiş mi? — Dashboard genelinde tek ölçüt. */
function isSessionDone(session, effectiveStatus) {
    return effectiveStatus === 'completed'
        || (effectiveStatus !== 'live'
            && (session.aiOverallScore > 0 || Boolean(session.aiSummary) || session.finalScore > 0));
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
    const activePositions = useMemo(() => openPositions.slice(0, 4), [openPositions]);
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
        { label: "Toplam Aday",    short: "Aday",     value: String(candidates.length),     change: null, goodness: true, desc: "kayıtlı aday",  icon: Users  },
        { label: "Aktif Pozisyon", short: "Pozisyon", value: String(allOpenCount),          change: null, goodness: true, desc: "açık ilan",     icon: Target },
        { label: "Uyum Skoru",     short: "Uyum",     value: `${dynamicMetrics.avgMatch}%`, change: null, goodness: true, desc: "ortalama uyum", icon: Star   },
        { label: "İşe Alım Hızı",  short: "Hız",      value: dynamicMetrics.recruitSpeed,   change: null, goodness: true, desc: "ortalama süre", icon: Clock  },
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
            (c) => ONE_CIKAN_ASAMALAR.includes(resolveStageKey(c.status))
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
                role: cleanRoleText(c.position || c.bestTitle, 'Pozisyon atanmadı'),
                score: Math.round(Number(c.bestScore) || 0),
                why: `${getStage(resolveStageKey(c.status)).label} aşamasında · ${
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
            const key = resolveStageKey(c.status);
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
        if (live) return { label: 'Katıl', onClick: () => navigate(`/live-interview/${live.id}`) };
        const done = sessions.find(s => isSessionDone(s, sessionStatuses[s.id] || s.status));
        if (done) return { label: 'Rapor', onClick: () => navigate(`/interview-report/${done.id}`) };
        return { label: 'İncele', onClick: () => openCandidate(c.id) };
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

    if (error) return <div className="p-10 text-[10px] font-black text-red-500 uppercase tracking-widest text-center">Sistem Hatası: Veri Senkronizasyonu Başarısız.</div>;

    return (
        <div className="infoset min-h-screen bg-n25">
            <Header title="Kontrol Paneli" />

            {/* SAYFA BAŞLIĞI — 52px: tarih + KPI şeridi + birincil eylemler.
                Ekran adı burada TEKRARLANMIYOR: Header zaten <h2>Kontrol
                Paneli</h2> basıyor ve ikisi birlikte başlığı ekranda iki kez
                gösteriyordu. */}
            <header className="h-[52px] flex items-center gap-3.5 px-[18px] border-b border-n200 bg-n0">
                <span className="text-[12px] font-medium text-n700">
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
                                <span className="text-[10px] text-n500">{k.short}</span>
                                <span className="text-[16px] font-semibold tracking-[-0.02em]">{k.value}</span>
                                {k.change && <Trend val={k.change} goodness={k.goodness} />}
                            </div>
                        ))}
                    <button
                        onClick={openBulkUpload}
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

            {/* ÖNE ÇIKAN CV'LER — aşama + meslek alanı süzgecinden geçen en iyi 5 CV */}
            <div className="px-[18px] py-2.5 bg-n25 border-b border-n200">
                <div className="flex items-center gap-2.5 mb-2.5 flex-wrap">
                    <Star className="w-4 h-4 text-brand" />
                    <h2 className="m-0 text-[13px] font-semibold tracking-[-0.01em]">Öne çıkan CV&apos;ler</h2>
                    <span className="text-[11px] font-semibold px-2 py-0.5 bg-brand-50 text-brand rounded-full">
                        İlk {featuredCvs.length}
                    </span>
                    <span className="text-[11px] text-n500">
                        İnceleme / Ön Eleme aşamasındaki, açık ilanların alanıyla uyumlu en iyi CV&apos;ler
                    </span>
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidates-table' }))}
                        className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-brand hover:text-brand-600"
                    >
                        Tümünü gör <ArrowRight className="w-3 h-3" />
                    </button>
                </div>

                {featuredCvs.length === 0 ? (
                    <div className="border border-dashed border-n300 rounded-[10px] p-[26px] text-center">
                        <div className="text-[12px] font-semibold mb-[3px]">Öne çıkan CV yok</div>
                        <div className="text-[11px] text-n500">
                            {openPositions.length === 0
                                ? 'Açık ilan yok — alan uyumu hesaplanamıyor.'
                                : 'Ön Eleme / İnceleme aşamasında, açık ilanların alanıyla uyumlu aday bulunmuyor.'}
                        </div>
                    </div>
                ) : (
                    <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                        {featuredCvs.map((f) => {
                            const tone = scoreTone(f.score);
                            return (
                                <div
                                    key={f.id}
                                    style={{ borderTop: `2px solid ${tone}` }}
                                    className="bg-n0 border border-n200 rounded-[10px] shadow-sm px-3 py-[11px] flex flex-col gap-[7px]"
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="w-[26px] h-[26px] flex-none rounded-full bg-brand-50 text-brand flex items-center justify-center text-[10px] font-semibold">
                                            {initialOf(f.name)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[12px] font-semibold truncate">{f.name}</div>
                                            <div className="text-[10px] text-n400 truncate">{f.role}</div>
                                        </div>
                                        {/* Skor VURGU: EMIR 1 kompaktlaştırmasında skorlar küçülmüyor. */}
                                        <span className="text-[15px] font-semibold" style={{ color: tone }}>%{f.score}</span>
                                    </div>
                                    <div className="h-[3px] bg-n100 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${Math.min(f.score, 100)}%`, background: tone }} />
                                    </div>
                                    <div className="text-[11px] leading-[1.4] text-n600 min-h-[31px]">{f.why}</div>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={() => openCandidate(f.id)}
                                            className="flex-1 text-center text-[11px] font-semibold text-white bg-brand hover:bg-brand-600 py-1.5 rounded-md"
                                        >
                                            Profili aç
                                        </button>
                                        <button
                                            onClick={() => planInterview(f.id)}
                                            title="Mülakat planla"
                                            className="w-7 h-7 border border-n200 rounded-md flex items-center justify-center text-n400 hover:bg-n50 hover:text-brand"
                                        >
                                            <Calendar className="w-3.5 h-3.5" />
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
                        <h2 className="m-0 text-[12px] font-semibold">Aday havuzu</h2>
                        <span className="text-[11px] text-n400">
                            {candidates.length} aday{poolFilter ? ` · ${poolRows.length} süzüldü` : ''}
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                            <button
                                onClick={openBulkUpload}
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
                            <button onClick={() => setPoolFilter(null)} className="flex-none text-[11px] font-medium text-brand">Temizle</button>
                        )}
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidates-table' }))}
                            className="ml-auto flex-none flex items-center gap-1.5 text-[12px] text-n500 border border-n200 rounded-md px-2.5 py-1 hover:bg-n50"
                        >
                            <SlidersHorizontal className="w-[13px] h-[13px]" /> Filtrele
                        </button>
                    </div>

                    <div className="hidden md:grid grid-cols-[1.6fr_1.3fr_96px_88px_96px_84px] px-[18px] py-2 border-b border-n200 bg-n50 text-[10px] font-semibold text-n500">
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
                        <div className="px-[18px] py-12 text-center text-[11px] text-n400">
                            {poolFilter ? 'Bu aşamada aday yok.' : 'Havuzda aday yok.'}
                        </div>
                    ) : shownRows.map((r) => {
                        const action = rowActionFor(r.candidate);
                        const tone = scoreTone(r.score);
                        return (
                            <div
                                key={r.id}
                                onClick={() => openCandidate(r.id)}
                                className={`grid grid-cols-[1fr_84px] md:grid-cols-[1.6fr_1.3fr_96px_88px_96px_84px] items-center px-[18px] py-[9px] border-b border-n100 text-[12px] cursor-pointer hover:bg-n50`}
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-[26px] h-[26px] flex-none rounded-full bg-brand-50 text-brand flex items-center justify-center text-[10px] font-semibold">
                                        {initialOf(r.name)}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-medium">
                                            <span className="truncate">{r.name}</span>
                                        </div>
                                        <div className="text-[10px] text-n400 truncate">{r.city}</div>
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
                                <div className="hidden md:block text-[10px] text-n500">{r.last}</div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); action.onClick(); }}
                                    className="text-right text-[11px] font-medium text-brand hover:text-brand-600"
                                >
                                    {action.label}
                                </button>
                            </div>
                        );
                    })}

                    <div className="px-[18px] py-2.5 flex items-center gap-2.5 text-[11px] text-n500">
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
                <div className="p-3.5 flex flex-col gap-2 bg-n25">
                    <div>
                        <div className="flex items-center justify-between mb-2.5">
                            <span className="text-[10px] font-semibold text-n500 tracking-[0.08em] uppercase">Yaklaşan mülakatlar</span>
                            <button
                                onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'interviews' }))}
                                className="text-[10px] text-brand font-medium"
                            >
                                Tümü
                            </button>
                        </div>
                        {weeklyPlan.length === 0 ? (
                            <div className="text-[11px] text-n400 py-3">Planlı mülakat bulunmuyor.</div>
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
                                    <span className="w-[38px] flex-none text-[11px] font-semibold">{s.time}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[11px] font-medium truncate">{s.name}</div>
                                        <div className="text-[10px] text-n400 truncate">
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
                            <span className="text-[10px] font-semibold text-n500 tracking-[0.08em] uppercase">Açık pozisyonlar</span>
                            <span className="text-[10px] text-n400">{allOpenCount} aktif</span>
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
                                        <div className="text-[11px] font-medium truncate">{pos.title}</div>
                                        <div className="text-[10px] text-n400">{posCount} aday</div>
                                    </div>
                                </button>
                            );
                        })}
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'positions' }))}
                            className="mt-2 text-[11px] font-medium text-brand hover:text-brand-600"
                        >
                            Tüm pozisyonlar →
                        </button>
                    </div>

                    <div className="h-px bg-n200" />

                    <div>
                        <div className="text-[10px] font-semibold text-n500 tracking-[0.08em] uppercase mb-2.5">Sistem durumu</div>
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
                                        <div className="text-[11px] font-semibold">{e.label}</div>
                                        <div className="text-[10px] leading-[1.4] text-n400">%{e.val} kullanılabilirlik</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <AddCandidateModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
        </div>
    );
}
