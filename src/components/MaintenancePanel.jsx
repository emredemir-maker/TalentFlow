// Bakım paneli — Adaylar sayfasından açılır.
//
// Tek tek butonlar yerine YÖNLENDİRMELİ bir süreç sunar: "Durum Tespiti"
// tüm sayaçları tek seferde çıkarır (takılı işler, mükerrerler, geçersiz
// pozisyon eşleşmeleri, 0 skorlular) ve panel sıradaki gerekli adımı
// kendisi işaret eder. Sayacı 0 olan adımlar "Gerek yok" olarak kapanır;
// kullanıcı yalnızca vurgulanan adımın butonunu görür, isterse atlar.
//
// Adım sırası bilinçli: takılı işler (etiket düzeltme) → mükerrer temizliği
// (AI maliyeti mükerrerlere harcanmasın) → eşleşme onarımı (bedava,
// deterministik) → ön skor basma (hafif AI). Son öneri: Sistem Taraması.
import { useEffect, useRef, useState } from 'react';
import {
    Loader2, RefreshCw, Trash2, AlertTriangle, CheckCircle2, XCircle, Clock,
    Gauge, Wrench, ClipboardCheck, ChevronRight, SkipForward, Sparkles, FileText,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const JOB_STATUS = {
    completed:  { label: 'Tamamlandı', color: '#059669', bg: '#ECFDF5' },
    error:      { label: 'Hata',       color: '#DC2626', bg: '#FEF2F2' },
    processing: { label: 'İşleniyor',  color: '#7C3AED', bg: '#F5F3FF' },
    queued:     { label: 'Sırada',     color: '#64748B', bg: '#F1F5F9' },
};

function JobStatusChip({ status }) {
    const cfg = JOB_STATUS[status] || JOB_STATUS.queued;
    const Icon = status === 'completed' ? CheckCircle2 : status === 'error' ? XCircle : Clock;
    return (
        <span style={{ color: cfg.color, background: cfg.bg }} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
            <Icon className="w-3 h-3" /> {cfg.label}
        </span>
    );
}

const STEP_DEFS = [
    {
        key: 'stuck',
        title: 'Takılı İşleri Kapat',
        icon: ClipboardCheck,
        desc: 'Tüm CV\'leri işlenmiş ama özet yazımı hatası yüzünden "Hata" etiketinde kalmış toplu işler "Tamamlandı" yapılır — veri kaybı yoktur.',
        countLabel: (n) => `${n} takılı iş`,
        action: 'Kapat',
    },
    {
        key: 'dup',
        title: 'Mükerrer Temizliği',
        icon: Trash2,
        desc: 'Aynı e-posta/telefonlu kopya kayıtlar silinir; her grubun EN DOLU kaydı (kariyer geçmişi/yetenek/özet açısından en zengin, eşitse en eski) korunur. Önce bunu yapmak, sonraki AI puanlamasının kopyalara harcanmasını önler.',
        countLabel: (n) => `${n} fazlalık kayıt`,
        action: 'Seçilenleri Sil',
    },
    {
        key: 'match',
        title: 'Eşleşme Onarımı',
        icon: Wrench,
        desc: 'Sistemde olmayan (AI\'nın uydurduğu) pozisyon başlıkları açık pozisyonlara bağlanır; bağlanamayanlar "uygun açık pozisyon yok" olarak işaretlenir. AI çağrısı yapmaz, skorlara dokunmaz.',
        countLabel: (n) => `${n} geçersiz eşleşme`,
        action: 'Onar',
    },
    {
        key: 'enrich',
        title: 'Eksik Profilleri Tamamla',
        icon: FileText,
        desc: 'CV metni kayıtlı olduğu hâlde kariyer geçmişi boş kalan adaylar için AI ile deneyim listesi çıkarılır (eski içe aktarma bu alanı hiç doldurmuyordu). Yalnızca boş olanlara dokunur.',
        countLabel: (n) => `${n} eksik profil`,
        action: 'Tamamla',
    },
    {
        key: 'score',
        title: 'Ön Skor Basma',
        icon: Gauge,
        desc: 'Skoru hiç olmayan adaylar hafif bir AI çağrısıyla puanlanır (CV metni yoksa anahtar-kelime skoru). Dolu skorların üzerine yazılmaz.',
        countLabel: (n) => `${n} skorsuz aday`,
        action: 'Puanla',
    },
];

export default function MaintenancePanel() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [jobs, setJobs] = useState(null);
    const [scan, setScan] = useState(null);
    const [health, setHealth] = useState(null);
    const [selected, setSelected] = useState(new Set());
    // Adım durumları: counts sıfırlanmasa bile "bu oturumda çalıştırıldı"
    // bilgisiyle süreç ilerler (ör. anahtar-kelime skoru 0 kalan adaylar).
    const [doneSteps, setDoneSteps] = useState(new Set());
    const [skippedSteps, setSkippedSteps] = useState(new Set());
    const [running, setRunning] = useState(null); // çalışan adımın key'i
    const [stepResults, setStepResults] = useState({});
    const [prescoreProgress, setPrescoreProgress] = useState(null);
    const [enrichProgress, setEnrichProgress] = useState(null);
    // Bileşen kapanınca zincirleme prescore döngüsünü durdur
    const unmountedRef = useRef(false);
    useEffect(() => () => { unmountedRef.current = true; }, []);

    // Hosting rewrite istekleri 60 sn'de kesilir — 55 sn'de istemci tarafında
    // iptal edip anlaşılır bir mesaj gösteriyoruz.
    const FETCH_TIMEOUT_MS = 55000;
    const authedFetch = async (url, init = {}) => {
        const tok = await user?.getIdToken?.() || '';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        let resp;
        try {
            resp = await fetch(url, { ...init, signal: controller.signal, headers: { ...(init.headers || {}), 'Authorization': `Bearer ${tok}` } });
        } catch (err) {
            if (err.name === 'AbortError') {
                throw new Error('İstek 55 saniyede yanıt vermedi ve iptal edildi. Sunucu yoğun olabilir — biraz bekleyip tekrar deneyin.');
            }
            throw new Error('Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.');
        } finally {
            clearTimeout(timer);
        }
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            if (resp.status === 502 || resp.status === 503 || resp.status === 504) {
                throw new Error(`Sunucu geçici olarak yanıt veremiyor (HTTP ${resp.status}). Birkaç dakika bekleyip tekrar deneyin.`);
            }
            throw new Error(data.error || `İstek başarısız (HTTP ${resp.status})`);
        }
        return data;
    };

    const refreshHealth = async () => {
        try { setHealth(await authedFetch('/api/maintenance/health-check')); } catch { /* sayaç tazeleme kritik değil */ }
    };

    // ── Adım 0: Durum tespiti ────────────────────────────────────────────
    const runScan = async () => {
        if (loading) return;
        setLoading(true);
        setError(null);
        try {
            const [jobsRes, scanRes, healthRes] = await Promise.allSettled([
                authedFetch('/api/maintenance/bulk-jobs'),
                authedFetch('/api/maintenance/duplicate-scan'),
                authedFetch('/api/maintenance/health-check'),
            ]);
            if (jobsRes.status === 'fulfilled') setJobs(jobsRes.value.jobs || []);
            if (scanRes.status === 'fulfilled') {
                setScan(scanRes.value);
                // Varsayılan seçim: tüm fazlalıklar (korunanlar asla listede değil)
                setSelected(new Set((scanRes.value.groups || []).flatMap(g => g.extras.map(e => e.id))));
            }
            if (healthRes.status === 'fulfilled') setHealth(healthRes.value);
            const failures = [jobsRes, scanRes, healthRes].filter(r => r.status === 'rejected');
            if (failures.length > 0) {
                setError([...new Set(failures.map(f => f.reason?.message || 'Bilinmeyen hata'))].join(' · '));
            }
        } finally {
            setLoading(false);
        }
    };

    // ── Adım eylemleri ───────────────────────────────────────────────────
    const markDone = (key, result) => {
        setDoneSteps(prev => new Set(prev).add(key));
        if (result !== undefined) setStepResults(prev => ({ ...prev, [key]: result }));
    };

    const runStuck = async () => {
        setRunning('stuck');
        setError(null);
        try {
            const data = await authedFetch('/api/maintenance/close-stuck-jobs', { method: 'POST' });
            markDone('stuck', `${data.closed} iş "Tamamlandı" olarak işaretlendi`);
            const jobsData = await authedFetch('/api/maintenance/bulk-jobs');
            setJobs(jobsData.jobs || []);
            await refreshHealth();
        } catch (err) {
            setError(err.message);
        } finally {
            setRunning(null);
        }
    };

    const runDupClean = async () => {
        if (selected.size === 0) return;
        const ok = window.confirm(`${selected.size} mükerrer kayıt silinecek. Her grubun en dolu kaydı korunuyor. Devam edilsin mi?`);
        if (!ok) return;
        setRunning('dup');
        setError(null);
        try {
            const data = await authedFetch('/api/maintenance/duplicate-clean', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(selected) }),
            });
            markDone('dup', `${data.deleted} kayıt silindi${data.skipped > 0 ? `, ${data.skipped} atlandı` : ''}`);
            const scanData = await authedFetch('/api/maintenance/duplicate-scan');
            setScan(scanData);
            setSelected(new Set((scanData.groups || []).flatMap(g => g.extras.map(e => e.id))));
            await refreshHealth();
        } catch (err) {
            setError(err.message);
        } finally {
            setRunning(null);
        }
    };

    const runMatchRepair = async () => {
        setRunning('match');
        setError(null);
        try {
            const RULE_LABELS = { assignment: 'atamadan', canonical: 'yazım düzeltme', job: 'iş hedefinden', keyword: 'anahtar-kelime', none: '"uygun pozisyon yok"' };
            const data = await authedFetch('/api/maintenance/validate-matches', { method: 'POST' });
            const detail = Object.entries(data.byRule || {}).map(([r, n]) => `${n} ${RULE_LABELS[r] || r}`).join(', ');
            markDone('match', `${data.repaired} kayıt onarıldı${detail ? ` (${detail})` : ''}${data.remaining > 0 ? ` · ${data.remaining} kaldı — adımı tekrar çalıştırın` : ''}`);
            await refreshHealth();
        } catch (err) {
            setError(err.message);
        } finally {
            setRunning(null);
        }
    };

    // Geçici hatalarda (zaman aşımı / 5xx / ağ) kısa bekleyip yeniden dener —
    // uzun zincirli işlemler tek aksaklıkta ölmesin.
    const fetchWithRetry = async (url, init, tries = 3) => {
        for (let attempt = 1; ; attempt++) {
            try {
                return await authedFetch(url, init);
            } catch (err) {
                const transient = /55 saniyede|geçici olarak|ulaşılamadı/.test(err.message || '');
                if (!transient || attempt >= tries || unmountedRef.current) throw err;
                await new Promise(r => setTimeout(r, 4000 * attempt));
            }
        }
    };

    // Sunucu her çağrıda küçük bir partiyi puanlayıp kalanı döndürür; kalan
    // 0 olana dek zincirleme çağrılır. Parti küçük tutulur (Gemini kota
    // beklemeleri tek çağrıyı 30+ sn'ye taşıyabiliyor) ve sunucu ayrıca
    // 40 sn'lik süre bütçesiyle kendini korur — 55 sn'lik istemci iptaline
    // takılmaz. Puanlanan her aday kalıcıdır: yarıda kalırsa tekrar
    // basıldığında kaldığı yerden devam eder.
    const PRESCORE_BATCH = 15;
    const runPrescore = async () => {
        setRunning('score');
        setError(null);
        let totals = { updated: 0, aiUsed: 0, failed: 0, remaining: 1 };
        try {
            let prevRemaining = Infinity;
            while (totals.remaining > 0 && !unmountedRef.current) {
                const data = await fetchWithRetry('/api/maintenance/prescore', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ batchSize: PRESCORE_BATCH }),
                });
                totals = {
                    updated: totals.updated + (data.updated || 0),
                    aiUsed: totals.aiUsed + (data.aiUsed || 0),
                    failed: totals.failed + (data.failed || 0),
                    remaining: data.remaining || 0,
                };
                setPrescoreProgress({ ...totals });
                if ((data.processed || 0) === 0) break; // ilerleme yoksa sonsuz döngüye girme
                // Kalan azalmıyorsa (sürekli başarısız olan kayıtlar) durup bildir
                if (totals.remaining >= prevRemaining) break;
                prevRemaining = totals.remaining;
            }
            const summary = `${totals.updated} aday puanlandı (${totals.aiUsed} AI, ${totals.updated - totals.aiUsed} anahtar-kelime)`
                + (totals.failed > 0 ? ` · ${totals.failed} hata` : '')
                + (totals.remaining > 0 ? ` · ${totals.remaining} aday puanlanamadı — adımı tekrar çalıştırabilirsiniz` : '');
            markDone('score', summary);
            await refreshHealth();
        } catch (err) {
            // Yarıda kesilme: o ana kadarki ilerleme kalıcı — kullanıcıya söyle
            setError(`${err.message}${totals.updated > 0 ? ` — Şu ana kadar ${totals.updated} aday puanlandı; ilerleme kayıtlı, "Puanla"ya tekrar basınca kaldığı yerden devam eder.` : ''}`);
            await refreshHealth();
        } finally {
            setRunning(null);
            setPrescoreProgress(null);
        }
    };

    // Eksik profil tamamlama — prescore ile aynı zincirleme desen: küçük
    // parti, süre bütçeli sunucu, geçici hatada retry, kalan azalmazsa dur.
    const runEnrich = async () => {
        setRunning('enrich');
        setError(null);
        let totals = { updated: 0, failed: 0, remaining: 1 };
        try {
            let prevRemaining = Infinity;
            while (totals.remaining > 0 && !unmountedRef.current) {
                const data = await fetchWithRetry('/api/maintenance/enrich-profiles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ batchSize: 10 }),
                });
                totals = {
                    updated: totals.updated + (data.updated || 0),
                    failed: totals.failed + (data.failed || 0),
                    remaining: data.remaining || 0,
                };
                setEnrichProgress({ ...totals });
                if ((data.processed || 0) === 0) break;
                if (totals.remaining >= prevRemaining) break;
                prevRemaining = totals.remaining;
            }
            markDone('enrich', `${totals.updated} adayın kariyer geçmişi tamamlandı`
                + (totals.failed > 0 ? ` · ${totals.failed} hata` : '')
                + (totals.remaining > 0 ? ` · ${totals.remaining} kaldı — adımı tekrar çalıştırabilirsiniz` : ''));
            await refreshHealth();
        } catch (err) {
            setError(`${err.message}${totals.updated > 0 ? ` — Şu ana kadar ${totals.updated} profil tamamlandı; tekrar basınca kaldığı yerden devam eder.` : ''}`);
            await refreshHealth();
        } finally {
            setRunning(null);
            setEnrichProgress(null);
        }
    };

    const STEP_RUNNERS = { stuck: runStuck, dup: runDupClean, match: runMatchRepair, enrich: runEnrich, score: runPrescore };
    const toggleDup = (id) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    // ── Adım durum türetme (sayaç odaklı, kendi kendini yönlendirir) ─────
    const countOf = {
        stuck: health?.stuckJobs ?? 0,
        dup: scan?.extrasCount ?? 0,
        match: health?.invalidMatches ?? 0,
        enrich: health?.missingExperiences ?? 0,
        score: health?.zeroScore ?? 0,
    };
    const statusOf = (key) => {
        if (doneSteps.has(key)) return 'done';
        if (skippedSteps.has(key)) return 'skipped';
        return countOf[key] > 0 ? 'needed' : 'clear';
    };
    const currentStep = health ? STEP_DEFS.find(s => statusOf(s.key) === 'needed')?.key || null : null;
    const allHandled = health && !currentStep;

    const fmtDate = (ms) => ms ? new Date(ms).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

    return (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h2 className="text-[13px] font-black text-slate-800">Bakım Süreci</h2>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                        {health
                            ? `${health.totalCandidates} aday · ${health.openPositions} açık pozisyon — panel sıradaki gerekli adımı işaret eder`
                            : 'Durum tespiti tüm sayaçları çıkarır; panel sizi adım adım yönlendirir — tespit veri değiştirmez'}
                    </p>
                </div>
                <button
                    onClick={runScan}
                    disabled={loading || Boolean(running)}
                    className="flex items-center gap-1.5 text-[11px] font-black text-white bg-[#13294E] hover:bg-[#1E3A6E] disabled:opacity-60 px-3.5 py-1.5 rounded-lg transition-colors"
                >
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    {health ? 'Durumu Yenile' : 'Durum Tespitini Başlat'}
                </button>
            </div>

            {error && (
                <div className="flex items-center gap-2 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
                </div>
            )}

            {/* ── Yönlendirmeli adım listesi ───────────────────────────────── */}
            {health && (
                <div className="space-y-1.5">
                    {STEP_DEFS.map((s, i) => {
                        const st = statusOf(s.key);
                        const isCurrent = currentStep === s.key;
                        const Icon = s.icon;
                        return (
                            <div
                                key={s.key}
                                className={`rounded-xl border px-3 py-2.5 transition-colors ${isCurrent ? 'border-[#13294E] bg-[#13294E]/[0.03] shadow-sm' : 'border-slate-100'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black ${
                                        st === 'done' ? 'bg-emerald-100 text-emerald-700'
                                        : st === 'clear' ? 'bg-slate-100 text-slate-400'
                                        : st === 'skipped' ? 'bg-slate-100 text-slate-400'
                                        : isCurrent ? 'bg-[#13294E] text-white'
                                        : 'bg-amber-100 text-amber-700'
                                    }`}>
                                        {st === 'done' || st === 'clear' ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                                    </div>
                                    <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[12px] font-bold text-slate-800">
                                            {s.title}
                                            <span className={`ml-2 text-[10px] font-black ${
                                                st === 'clear' ? 'text-emerald-600'
                                                : st === 'done' ? 'text-emerald-600'
                                                : st === 'skipped' ? 'text-slate-400'
                                                : 'text-amber-600'
                                            }`}>
                                                {st === 'clear' ? 'Gerek yok ✓'
                                                    : st === 'done' ? 'Tamamlandı ✓'
                                                    : st === 'skipped' ? 'Atlandı'
                                                    : s.countLabel(countOf[s.key])}
                                            </span>
                                        </p>
                                        {isCurrent && <p className="text-[10px] text-slate-400 mt-0.5">{s.desc}</p>}
                                        {stepResults[s.key] && (
                                            <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">{stepResults[s.key]}</p>
                                        )}
                                        {s.key === 'score' && running === 'score' && prescoreProgress && (
                                            <p className="text-[10px] text-violet-600 font-semibold mt-0.5">
                                                {prescoreProgress.updated} puanlandı · {prescoreProgress.remaining} kaldı…
                                            </p>
                                        )}
                                        {s.key === 'enrich' && running === 'enrich' && enrichProgress && (
                                            <p className="text-[10px] text-violet-600 font-semibold mt-0.5">
                                                {enrichProgress.updated} profil tamamlandı · {enrichProgress.remaining} kaldı…
                                            </p>
                                        )}
                                    </div>
                                    {isCurrent && (
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                                onClick={STEP_RUNNERS[s.key]}
                                                disabled={Boolean(running) || (s.key === 'dup' && selected.size === 0)}
                                                className="flex items-center gap-1.5 text-[11px] font-black text-white bg-[#13294E] hover:bg-[#1E3A6E] disabled:opacity-60 px-3.5 py-1.5 rounded-lg transition-colors"
                                            >
                                                {running === s.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                                {running === s.key ? 'Çalışıyor…' : s.key === 'dup' ? `${s.action} (${selected.size})` : s.action}
                                            </button>
                                            <button
                                                onClick={() => setSkippedSteps(prev => new Set(prev).add(s.key))}
                                                disabled={Boolean(running)}
                                                title="Bu adımı atla"
                                                className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-600 px-2 py-1.5 transition-colors"
                                            >
                                                <SkipForward className="w-3 h-3" /> Atla
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Mükerrer adımı aktifken grup seçimi gösterilir */}
                                {s.key === 'dup' && isCurrent && scan && scan.extrasCount > 0 && (
                                    <div className="mt-2 space-y-1.5 max-h-56 overflow-y-auto pr-1">
                                        {scan.groups.map(g => (
                                            <div key={g.key} className="border border-slate-100 rounded-lg px-3 py-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-[11px] font-bold text-slate-700 truncate">
                                                        {g.keep.name || 'İsimsiz'}
                                                        <span className="text-slate-400 font-medium ml-1.5">{g.keep.email || g.keep.phone}</span>
                                                    </p>
                                                    <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full shrink-0">
                                                        {g.extras.length + 1} kopya
                                                    </span>
                                                </div>
                                                <div className="mt-1 space-y-0.5">
                                                    <p className="text-[10px] text-emerald-600 font-semibold">
                                                        ✓ Korunacak: {fmtDate(g.keep.createdAtMs)} ({g.keep.source || 'kaynak yok'})
                                                    </p>
                                                    {g.extras.map(e => (
                                                        <label key={e.id} className="flex items-center gap-2 text-[10px] text-slate-500 cursor-pointer hover:text-slate-700">
                                                            <input
                                                                type="checkbox"
                                                                checked={selected.has(e.id)}
                                                                onChange={() => toggleDup(e.id)}
                                                                className="w-3 h-3 accent-red-600"
                                                            />
                                                            Silinecek: {fmtDate(e.createdAtMs)} ({e.source || 'kaynak yok'})
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Süreç bitti — önerilen son adım */}
                    {allHandled && (
                        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50 px-3.5 py-3">
                            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-[12px] font-black text-emerald-800">Bakım süreci tamamlandı 🎉</p>
                                <p className="text-[11px] text-emerald-700 mt-0.5">
                                    Önerilen son adım: <strong>Detay & Yükleme</strong> görünümündeki <strong>Sistem Taraması</strong>'nı
                                    "Tüm Adaylar" kapsamıyla çalıştırın — adaylar CV içerikleriyle derinlemesine yeniden puanlanır
                                    (eksik CV'liler atlanıp raporlanır).
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Son toplu işler (bilgi) ──────────────────────────────────── */}
            {jobs && (
                <div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Son Toplu İşler</h3>
                    <div className="overflow-x-auto border border-slate-100 rounded-lg">
                        <table className="w-full text-[11px]">
                            <thead className="bg-slate-50 text-left">
                                <tr>
                                    <th className="px-2.5 py-1.5 font-black text-slate-500">Durum</th>
                                    <th className="px-2.5 py-1.5 font-black text-slate-500">Pozisyon</th>
                                    <th className="px-2.5 py-1.5 font-black text-slate-500">İşlenen</th>
                                    <th className="px-2.5 py-1.5 font-black text-slate-500">Mükerrer</th>
                                    <th className="px-2.5 py-1.5 font-black text-slate-500">Hatalı</th>
                                    <th className="px-2.5 py-1.5 font-black text-slate-500">Tarih</th>
                                    <th className="px-2.5 py-1.5 font-black text-slate-500">Hata Mesajı</th>
                                </tr>
                            </thead>
                            <tbody>
                                {jobs.length === 0 && (
                                    <tr><td colSpan={7} className="px-2.5 py-3 text-center text-slate-400">Toplu iş bulunamadı.</td></tr>
                                )}
                                {jobs.map(j => (
                                    <tr key={j.jobId} className="border-t border-slate-50">
                                        <td className="px-2.5 py-1.5"><JobStatusChip status={j.status} /></td>
                                        <td className="px-2.5 py-1.5 text-slate-600 whitespace-nowrap max-w-[160px] truncate" title={j.positionTitle || ''}>{j.positionTitle || 'Genel havuz'}</td>
                                        <td className="px-2.5 py-1.5 font-bold text-slate-700 whitespace-nowrap">{j.processedCount} / {j.totalCount}</td>
                                        <td className="px-2.5 py-1.5 text-amber-600 font-bold">{j.duplicateCount || 0}</td>
                                        <td className="px-2.5 py-1.5 text-red-500 font-bold">{j.failedCount || 0}</td>
                                        <td className="px-2.5 py-1.5 text-slate-500 whitespace-nowrap">{fmtDate(j.createdAtMs)}</td>
                                        <td className="px-2.5 py-1.5 text-red-500 max-w-[280px] truncate" title={j.errorMessage || ''}>{j.errorMessage || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {!health && !loading && (
                <p className="text-[11px] text-slate-400">Başlamak için "Durum Tespitini Başlat" düğmesine basın — tespit hiçbir veriyi değiştirmez, yalnızca rapor üretir.</p>
            )}
        </div>
    );
}
