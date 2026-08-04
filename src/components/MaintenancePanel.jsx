// Bakım paneli — Aday Raporu sayfasından açılır.
//
// İki işlevi var:
//   1. Son toplu içe aktarma işlerinin GERÇEK durumunu gösterir (durum,
//      sayaçlar ve varsa hata mesajı) — modaldaki ilerleme görünümü iş
//      hata ile durduğunda da "bitti" gibi görünebildiği için buradan
//      doğrulanır.
//   2. Mükerrer aday taraması: aynı e-posta/telefonlu kayıtları gruplar,
//      her grupta EN ESKİ kayıt korunur, fazlalıklar seçilip silinebilir.
//      Sunucu silme isteğindeki her id'yi yeniden doğrular — korunan kayıt
//      istemci hatasında bile silinemez.
import { useState } from 'react';
import { Loader2, RefreshCw, Trash2, AlertTriangle, CheckCircle2, XCircle, Clock } from 'lucide-react';
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

export default function MaintenancePanel() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [cleaning, setCleaning] = useState(false);
    const [error, setError] = useState(null);
    const [jobs, setJobs] = useState(null);
    const [scan, setScan] = useState(null);
    const [selected, setSelected] = useState(new Set());
    const [lastCleanResult, setLastCleanResult] = useState(null);

    const authedFetch = async (url, init = {}) => {
        const tok = await user?.getIdToken?.() || '';
        const resp = await fetch(url, { ...init, headers: { ...(init.headers || {}), 'Authorization': `Bearer ${tok}` } });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || `İstek başarısız (HTTP ${resp.status})`);
        return data;
    };

    const runScan = async () => {
        if (loading) return;
        setLoading(true);
        setError(null);
        setLastCleanResult(null);
        try {
            const [jobsData, scanData] = await Promise.all([
                authedFetch('/api/maintenance/bulk-jobs'),
                authedFetch('/api/maintenance/duplicate-scan'),
            ]);
            setJobs(jobsData.jobs || []);
            setScan(scanData);
            // Varsayılan seçim: tüm fazlalıklar (korunanlar asla listede değil)
            setSelected(new Set((scanData.groups || []).flatMap(g => g.extras.map(e => e.id))));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const toggle = (id) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleClean = async () => {
        if (cleaning || selected.size === 0) return;
        const ok = window.confirm(`${selected.size} mükerrer kayıt silinecek. Her grubun en eski kaydı korunuyor. Devam edilsin mi?`);
        if (!ok) return;
        setCleaning(true);
        setError(null);
        try {
            const data = await authedFetch('/api/maintenance/duplicate-clean', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(selected) }),
            });
            setLastCleanResult(data);
            await runScan(); // güncel durumu yeniden çek
        } catch (err) {
            setError(err.message);
        } finally {
            setCleaning(false);
        }
    };

    const fmtDate = (ms) => ms ? new Date(ms).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

    return (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h2 className="text-[13px] font-black text-slate-800">Bakım — Toplu İşler & Mükerrer Temizliği</h2>
                    <p className="text-[10px] text-slate-400 mt-0.5">İş durumlarını doğrula, aynı e-posta/telefonlu kopya adayları temizle</p>
                </div>
                <button
                    onClick={runScan}
                    disabled={loading}
                    className="flex items-center gap-1.5 text-[11px] font-black text-white bg-[#13294E] hover:bg-[#1E3A6E] disabled:opacity-60 px-3.5 py-1.5 rounded-lg transition-colors"
                >
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    {scan ? 'Yeniden Tara' : 'Tara'}
                </button>
            </div>

            {error && (
                <div className="flex items-center gap-2 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
                </div>
            )}
            {lastCleanResult && (
                <div className="flex items-center gap-2 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    {lastCleanResult.deleted} kayıt silindi{lastCleanResult.skipped > 0 ? `, ${lastCleanResult.skipped} atlandı (fazlalık değildi)` : ''}.
                </div>
            )}

            {jobs && (
                <div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Son Toplu İşler</h3>
                    <div className="overflow-x-auto border border-slate-100 rounded-lg">
                        <table className="w-full text-[11px]">
                            <thead className="bg-slate-50 text-left">
                                <tr>
                                    <th className="px-2.5 py-1.5 font-black text-slate-500">Durum</th>
                                    <th className="px-2.5 py-1.5 font-black text-slate-500">İşlenen</th>
                                    <th className="px-2.5 py-1.5 font-black text-slate-500">Mükerrer</th>
                                    <th className="px-2.5 py-1.5 font-black text-slate-500">Hatalı</th>
                                    <th className="px-2.5 py-1.5 font-black text-slate-500">Tarih</th>
                                    <th className="px-2.5 py-1.5 font-black text-slate-500">Hata Mesajı</th>
                                </tr>
                            </thead>
                            <tbody>
                                {jobs.length === 0 && (
                                    <tr><td colSpan={6} className="px-2.5 py-3 text-center text-slate-400">Toplu iş bulunamadı.</td></tr>
                                )}
                                {jobs.map(j => (
                                    <tr key={j.jobId} className="border-t border-slate-50">
                                        <td className="px-2.5 py-1.5"><JobStatusChip status={j.status} /></td>
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

            {scan && (
                <div>
                    <div className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            Mükerrer Adaylar — {scan.duplicateGroups} grup, {scan.extrasCount} fazlalık
                        </h3>
                        {scan.extrasCount > 0 && (
                            <button
                                onClick={handleClean}
                                disabled={cleaning || selected.size === 0}
                                className="flex items-center gap-1.5 text-[11px] font-black text-white bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed px-3.5 py-1.5 rounded-lg transition-colors"
                            >
                                {cleaning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                Seçilenleri Sil ({selected.size})
                            </button>
                        )}
                    </div>
                    {scan.extrasCount === 0 ? (
                        <p className="text-[11px] text-emerald-600 font-semibold bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                            Mükerrer kayıt yok — havuz temiz. 🎉
                        </p>
                    ) : (
                        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
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
                                                    onChange={() => toggle(e.id)}
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
            )}

            {!jobs && !scan && !loading && (
                <p className="text-[11px] text-slate-400">Başlamak için "Tara" düğmesine basın — mevcut veriler değişmez, yalnızca rapor üretilir.</p>
            )}
        </div>
    );
}
