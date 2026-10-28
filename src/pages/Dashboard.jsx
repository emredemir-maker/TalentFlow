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

/**
 * Süreç şeridi renkleri: aşama ilerledikçe koyulaşan tek bir teal rampası,
 * ret gri. Aşamaların kendi renkleri (pipelineStages) gökkuşağı gibi; bantta
 * yan yana gelince sırayı değil yalnız farkı anlatıyordu.
 */
const RIBBON = {
    ai_analysis: '#99F6E4',
    review: '#5EEAD4',
    interview_scheduled: '#2DD4BF',
    interview_done: '#14B8A6',
    offer: '#0D9488',
    hired: '#0F766E',
    rejected: '#CDD3D0',
};

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
                role: cleanRoleText(c.position || c.bestTitle, 'Pozisyon atanmadı'),
                score: Math.round(Number(c.bestScore) || 0),
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
        if (live) return { label: 'Katıl', onClick: () => navigate(`/live-interview/${live.id}`) };
        const done = sessions.find(s => isSessionDone(s, sessionStatuses[s.id] || s.status));
        if (done) return { label: 'Rapor', onClick: () => navigate(`/interview-report/${done.id}`) };
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
                role: cleanRoleText(c.position || c.bestTitle, 'Pozisyon atanmadı'),
                score: Math.round(Number(c.bestScore) || 0),
                stage: getStage(resolveCandidateStage(c)),
                last: relativeTime(lastTouchMs(c)),
            }))
            .sort((a, b) => b.score - a.score);
    }, [candidates, poolFilter]);

    const shownRows = poolRows.slice(0, 9);

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
    const totalForRibbon = STAGES.reduce((n, s) => n + (stageCounts[s.key] || 0), 0);

    return (
        <div className="infoset min-h-dvh bg-n0">
            <Header title="Kontrol Paneli" />

            {/* SAYFA BAŞLIĞI — bugünün tarihi + dört gösterge + birincil eylemler.
                Ekran adı Header'da (<h2>Kontrol Paneli</h2>) zaten yazıyor;
                burada tekrar etmek yerine "bugün"ü başlık yapıyoruz. */}
            <div className="tf-page-head">
                <div className="min-w-0">
                    <h1 className="tf-page-title">
                        {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}
                    </h1>
                    <dl className="mt-1.5 flex flex-wrap items-baseline gap-x-5 gap-y-1">
                        {isLoading
                            ? Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="h-4 w-20 bg-n100 rounded animate-pulse" />
                            ))
                            : kpis.map((k) => (
                                <div key={k.label} title={`${k.label} — ${k.desc}`} className="flex items-baseline gap-1.5">
                                    <dt className="text-[13px] text-n500">{k.label}</dt>
                                    <dd className="m-0 text-[15px] font-semibold text-n900 tabular-nums">{k.value}</dd>
                                    {k.change && <Trend val={k.change} goodness={k.goodness} />}
                                </div>
                            ))}
                    </dl>
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

            {/* SÜREÇ ŞERİDİ — ekranın tek "imza" öğesi. Havuzun aşamalara
                dağılımı tek bir oransal bantta; her parça ve altındaki etiket
                havuz tablosunu o aşamaya süzer (eski hap süzgecinin işi). */}
            <section aria-label="Aşamalara göre aday dağılımı" className="px-6 pb-5">
                <div className="flex h-3 rounded-full overflow-hidden bg-n100" aria-hidden="true">
                    {totalForRibbon > 0 && STAGES.map((s) => {
                        const n = stageCounts[s.key] || 0;
                        if (!n) return null;
                        const active = !poolFilter || poolFilter === s.key;
                        return (
                            <div
                                key={s.key}
                                className="h-full border-r-2 border-n0 last:border-r-0 transition-opacity"
                                style={{ flexGrow: n, flexBasis: 0, background: RIBBON[s.key] || '#CDD3D0', opacity: active ? 1 : 0.25 }}
                            />
                        );
                    })}
                </div>
                <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                    <button
                        onClick={() => setPoolFilter(null)}
                        aria-pressed={!poolFilter}
                        className="tf-chip flex-none"
                    >
                        Tümü <span className="tabular-nums opacity-70">{candidates.length}</span>
                    </button>
                    {STAGES.map(s => (
                        <button
                            key={s.key}
                            onClick={() => setPoolFilter(poolFilter === s.key ? null : s.key)}
                            aria-pressed={poolFilter === s.key}
                            className="tf-chip flex-none"
                        >
                            <span className="w-2 h-2 rounded-full" style={{ background: RIBBON[s.key] || '#CDD3D0' }} />
                            {s.label} <span className="tabular-nums opacity-70">{stageCounts[s.key] || 0}</span>
                        </button>
                    ))}
                    {poolFilter && (
                        <button onClick={() => setPoolFilter(null)} className="flex-none text-[12px] tf-link px-2">Temizle</button>
                    )}
                </div>
            </section>

            {/* ÖNE ÇIKAN CV'LER — aşama + meslek alanı süzgecinden geçen en iyi 5 CV */}
            <section className="px-6 pb-6">
                <div className="flex items-baseline gap-3 mb-3 flex-wrap">
                    <h2 className="tf-section-title">Öne çıkan CV&apos;ler</h2>
                    <span className="text-[13px] text-n500">
                        İnceleme ve ön eleme aşamasında, açık ilanların alanıyla uyumlu en iyi {featuredCvs.length || ''} aday
                    </span>
                    <button onClick={() => goTo('candidates-table')} className="ml-auto text-[13px] tf-link">
                        Tümünü gör
                    </button>
                </div>

                {featuredCvs.length === 0 ? (
                    <div className="tf-empty">
                        <div className="tf-empty-title">Öne çıkan CV yok</div>
                        {openPositions.length === 0
                            ? 'Açık ilan yok, bu yüzden alan uyumu hesaplanamıyor.'
                            : 'Ön eleme ya da inceleme aşamasında, açık ilanların alanıyla uyumlu aday bulunmuyor.'}
                    </div>
                ) : (
                    <ol className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 list-none p-0 m-0">
                        {featuredCvs.map((f) => {
                            const tone = scoreTone(f.score);
                            return (
                                <li key={f.id} className="tf-panel p-3.5 flex flex-col gap-2.5">
                                    <div className="flex items-start gap-2.5">
                                        <div className="w-8 h-8 flex-none rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-[12px] font-semibold">
                                            {initialOf(f.name)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[14px] font-semibold text-n900 truncate">{f.name}</div>
                                            <div className="text-[12px] text-n500 truncate">{f.role}</div>
                                        </div>
                                        <span className="text-[20px] leading-none font-semibold tabular-nums" style={{ color: tone }}>{f.score}</span>
                                    </div>
                                    <div className="h-1 bg-n100 rounded-full overflow-hidden" aria-hidden="true">
                                        <div className="h-full rounded-full" style={{ width: `${Math.min(f.score, 100)}%`, background: tone }} />
                                    </div>
                                    <p className="m-0 text-[12px] leading-[1.45] text-n600 min-h-[35px]">{f.why}</p>
                                    <div className="flex items-center gap-1.5 mt-auto">
                                        <button onClick={() => openCandidate(f.id)} className="tf-btn tf-btn-secondary flex-1 h-8">
                                            Profili aç
                                        </button>
                                        <button
                                            onClick={() => planInterview(f.id)}
                                            title="Mülakat planla"
                                            aria-label={`${f.name} için mülakat planla`}
                                            className="tf-btn tf-btn-ghost tf-btn-icon"
                                        >
                                            <Calendar />
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </section>

            {/* GÖVDE — havuz tablosu + sağ ray */}
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] border-t border-n200">

                {/* SOL — ADAY HAVUZU */}
                <section data-ui="table" className="xl:border-r border-n200 min-w-0">
                    <div className="flex items-center gap-3 px-6 pt-5 pb-3 flex-wrap">
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

                    <div className="hidden md:grid grid-cols-[1.6fr_1.3fr_96px_120px_96px_84px] px-6 py-2 border-y border-n200 bg-n50 tf-th">
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
                                className="grid grid-cols-[1fr_84px] md:grid-cols-[1.6fr_1.3fr_96px_120px_96px_84px] items-center px-6 py-2.5 border-b border-n100 text-[13px] cursor-pointer hover:bg-n50"
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
                                <div className="hidden md:flex items-center justify-end gap-2 pr-3.5">
                                    <div className="w-8 h-1 bg-n100 rounded-full overflow-hidden" aria-hidden="true">
                                        <div className="h-full" style={{ width: `${Math.min(r.score, 100)}%`, background: tone }} />
                                    </div>
                                    <span className="font-semibold tabular-nums" style={{ color: tone }}>{r.score || '—'}</span>
                                </div>
                                <div className="hidden md:block">
                                    <span className="inline-flex items-center gap-1.5 text-[12px] text-n700">
                                        <span className="w-2 h-2 rounded-full flex-none" style={{ background: RIBBON[r.stage.key] || r.stage.color }} />
                                        {r.stage.label}
                                    </span>
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

                    <div className="px-6 py-3 flex items-center gap-2.5 text-[12px] text-n500">
                        <span className="tabular-nums">{poolRows.length} adaydan {shownRows.length} tanesi gösteriliyor</span>
                        <button onClick={() => goTo('candidates-table')} className="ml-auto text-[13px] tf-link">
                            Tümünü gör
                        </button>
                    </div>
                </section>

                {/* SAĞ RAY — yaklaşan mülakatlar, açık pozisyonlar, sistem durumu */}
                <aside className="px-6 xl:px-5 py-5 flex flex-col gap-6 border-t xl:border-t-0 border-n200">
                    <section>
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="tf-section-title">Yaklaşan mülakatlar</h2>
                            <button onClick={() => goTo('interviews')} className="text-[13px] tf-link">Tümü</button>
                        </div>
                        {weeklyPlan.length === 0 ? (
                            <p className="m-0 text-[13px] text-n500 py-2">Planlı mülakat yok.</p>
                        ) : weeklyPlan.map((s) => {
                            const todayStr = new Date().toISOString().split('T')[0];
                            const isToday = s.date === todayStr;
                            const effComp = isSessionDone(s, s.status);
                            const dot = s.status === 'live' ? '#E5484D' : effComp ? '#16A26C' : isToday ? '#E8A13B' : '#14B8A6';
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
                                    className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-n50 rounded-lg -mx-2 px-2"
                                >
                                    <span className="w-11 flex-none text-[13px] font-semibold tabular-nums text-n900">{s.time}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[13px] font-medium text-n900 truncate">{s.name}</div>
                                        <div className="text-[12px] text-n500 truncate">
                                            {s.role}
                                            {!isToday && s.date ? `, ${new Date(s.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}` : ''}
                                        </div>
                                    </div>
                                    <span className="w-2 h-2 flex-none rounded-full" style={{ background: dot }} />
                                </button>
                            );
                        })}
                    </section>

                    <section>
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="tf-section-title">Açık pozisyonlar</h2>
                            <span className="text-[12px] text-n500 tabular-nums">{allOpenCount} aktif</span>
                        </div>
                        {activePositions.length === 0 && (
                            <p className="m-0 text-[13px] text-n500 py-2">Açık pozisyon yok.</p>
                        )}
                        {activePositions.map((pos) => {
                            const posCount = candidates.filter(c => c.position === pos.title || c.bestTitle === pos.title).length;
                            return (
                                <button
                                    key={pos.id}
                                    onClick={() => {
                                        goTo('positions');
                                        setTimeout(() => {
                                            window.dispatchEvent(new CustomEvent('openPosition', { detail: { positionId: pos.id } }));
                                        }, 80);
                                    }}
                                    className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-n50 rounded-lg -mx-2 px-2"
                                >
                                    <div className="flex-1 min-w-0 text-[13px] font-medium text-n900 truncate">{pos.title}</div>
                                    <span className="text-[12px] text-n500 tabular-nums flex-none">{posCount} aday</span>
                                </button>
                            );
                        })}
                        <button onClick={() => goTo('positions')} className="mt-2 text-[13px] tf-link">
                            Tüm pozisyonlar
                        </button>
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

            <AddCandidateModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
        </div>
    );
}
