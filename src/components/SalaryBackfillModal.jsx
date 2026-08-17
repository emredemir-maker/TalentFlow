// TOPLU GERİYE DÖNÜK MAAŞ TARAMASI — tek ekran, satır başına bir görüşme.
//
// Neden var: maaş zincirinin halkaları (ilan bandı → aday beklentisi →
// fark raporu) bugünden itibaren çalışıyor. Geçmiş görüşmelerde rakam çoğu
// zaman transkriptte duruyor ama `candidateSalary` alanı o kayıtlar
// yazılırken yoktu. Fark raporu bu yüzden bugün açıldığında havuzun neredeyse
// tamamını "beklentisi bilinmiyor" kefesinde gösteriyor: elde veri var,
// hiçbir tabloya girmiyor.
//
// Ekranın üç kuralı:
//
//   1. MODEL ÖNERİR, KULLANICI KAYDEDER. Onay gelmeden tek bir rakam bile
//      yazılmaz. Yanlış okunmuş bir para rakamı bu zincirin sonunda bir
//      BÜTÇE KARARINA dönüşüyor.
//   2. ALINTI KARARIN YANINDA DURUR. 60 modal açtırmak herkesi "kabul, kabul,
//      kabul" demeye iter; dayanağı görünmeyen onay, onay değildir.
//   3. BULAMAMAK HATA DEĞİL. Aday yalnızca "şu an 70 alıyorum" demişse motor
//      bilerek boş döner — mevcut maaşı beklenti saymak tüm tabloyu kaydırır.
//      O satırlarda boş alan durur, kullanıcı transkripti okuyup elle yazar.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2, Search, Wallet, X } from 'lucide-react';

import SalaryBackfillRow from './SalaryBackfillRow';
import { extractSalaryFromTranscript } from '../services/ai/salaryExtractor';
import { loadBackfillRows, saveBackfill, MAX_READS } from '../services/salaryBackfillStore';
import { scanRows, estimateMs } from '../services/salaryScan';
import {
    applyBulkBasis, backfillTally, draftFromHint, emptyDraft, savableRows,
} from '../utils/salaryBackfill';
import { BASES, BASIS_LABEL } from '../utils/salaryBand';

/** '≈ 4 dk' / '≈ 40 sn' */
function humanDuration(ms) {
    if (ms <= 0) return '';
    const sec = Math.round(ms / 1000);
    return sec < 90 ? `≈ ${sec} sn` : `≈ ${Math.round(sec / 60)} dk`;
}

export default function SalaryBackfillModal({ open, onClose, candidates = [], uid = null }) {
    const [phase, setPhase] = useState('loading'); // loading | ready | error
    const [loadError, setLoadError] = useState('');
    const [rows, setRows] = useState([]);
    const [meta, setMeta] = useState({ read: 0, failed: 0, remaining: 0 });

    // Taslaklar HER SATIR için baştan kurulur (boş olanlar dahil): toplu
    // brüt/net işaretinin daha hiç dokunulmamış satırlara da ulaşması gerek.
    const [drafts, setDrafts] = useState({});
    const [hints, setHints] = useState({});
    const [statuses, setStatuses] = useState({});
    const [errors, setErrors] = useState({});
    const [savedIds, setSavedIds] = useState(() => new Set());

    const [scanning, setScanning] = useState(false);
    const [progress, setProgress] = useState(null);
    const stopRef = useRef(false);

    const [positionFilter, setPositionFilter] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [savedCount, setSavedCount] = useState(0);

    // ── Yükleme
    const load = useCallback(async () => {
        setPhase('loading');
        setLoadError('');
        try {
            const result = await loadBackfillRows({ candidates });
            setRows(result.rows);
            setMeta({ read: result.read, failed: result.failed, remaining: result.remaining });
            setDrafts(Object.fromEntries(result.rows.map((r) => [r.sessionId, emptyDraft()])));
            setStatuses(Object.fromEntries(result.rows.map((r) => [r.sessionId, r.scannable ? 'idle' : 'skipped'])));
            setHints({});
            setErrors({});
            setSavedIds(new Set());
            setSavedCount(0);
            setPhase('ready');
        } catch (err) {
            setLoadError(err?.message || 'Görüşmeler okunamadı.');
            setPhase('error');
        }
    }, [candidates]);

    useEffect(() => {
        if (!open) return;
        load();
        // Modal her açılışta taze okur: başka bir ekranda beklenti girilmiş
        // olabilir ve o satırın burada durması gereksiz bir AI çağrısı demek.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => () => { stopRef.current = true; }, []);

    // ── Süzgeç (yalnızca GÖRÜNÜMÜ daraltır; kaydetme tüm satırlara bakar)
    const positionOptions = useMemo(() => {
        const seen = new Map();
        for (const row of rows) {
            const title = row.positionTitle || '';
            if (!title) continue;
            seen.set(title, (seen.get(title) || 0) + 1);
        }
        return [...seen.entries()].sort((a, b) => b[1] - a[1]);
    }, [rows]);

    const visibleRows = useMemo(
        () => (positionFilter ? rows.filter((r) => (r.positionTitle || '') === positionFilter) : rows),
        [rows, positionFilter]
    );

    // Taranacaklar: transkripti olan ve daha önce taranmamış (ya da hata
    // almış) satırlar. Bulunamamış bir satırı tekrar taramak aynı cevabı
    // aynı parayla getirir.
    const scanTargets = useMemo(
        () => visibleRows.filter((r) => r.scannable && !savedIds.has(r.sessionId)
            && (statuses[r.sessionId] === 'idle' || statuses[r.sessionId] === 'error')),
        [visibleRows, statuses, savedIds]
    );

    const pendingRows = useMemo(() => rows.filter((r) => !savedIds.has(r.sessionId)), [rows, savedIds]);
    const tally = useMemo(() => backfillTally(pendingRows, drafts), [pendingRows, drafts]);
    const savable = useMemo(() => savableRows(pendingRows, drafts, hints), [pendingRows, drafts, hints]);

    // ── Eylemler
    const patchDraft = (sessionId, patch) => {
        setDrafts((prev) => ({ ...prev, [sessionId]: { ...prev[sessionId], ...patch } }));
    };

    const acceptHint = (sessionId) => {
        const hint = hints[sessionId];
        if (!hint) return;
        setDrafts((prev) => ({ ...prev, [sessionId]: draftFromHint(hint) }));
    };

    // REDDET: öneri ekrandan kalkar, alan boşalır. Kullanıcı "bu rakam yanlış"
    // dedi; yanlış bir öneriyi ekranda tutmak onu tekrar tıklatmaya davet eder.
    const rejectHint = (sessionId) => {
        setHints((prev) => ({ ...prev, [sessionId]: null }));
        setDrafts((prev) => ({ ...prev, [sessionId]: emptyDraft() }));
        setStatuses((prev) => ({ ...prev, [sessionId]: 'rejected' }));
    };

    const runScan = async () => {
        if (scanning || scanTargets.length === 0) return;
        stopRef.current = false;
        setScanning(true);
        setProgress({ done: 0, total: scanTargets.length });
        try {
            await scanRows(scanTargets, {
                extract: (row) => extractSalaryFromTranscript(row.transcript),
                shouldStop: () => stopRef.current,
                onProgress: setProgress,
                onStart: (row) => setStatuses((prev) => ({ ...prev, [row.sessionId]: 'busy' })),
                onResult: (row, result) => {
                    setStatuses((prev) => ({ ...prev, [row.sessionId]: result.status }));
                    if (result.status === 'found') {
                        // ÖNERİ ALANLARA KENDİLİĞİNDEN GEÇMEZ. Kullanıcı
                        // "kabul et" demeden hiçbir rakam taslağa girmiyor.
                        setHints((prev) => ({ ...prev, [row.sessionId]: result.hint }));
                    } else if (result.status === 'error') {
                        setErrors((prev) => ({ ...prev, [row.sessionId]: result.error }));
                    }
                },
            });
        } finally {
            // Durdurulduysa sırası gelmemiş satırlar 'busy' kalmasın.
            setStatuses((prev) => {
                const next = { ...prev };
                for (const key of Object.keys(next)) if (next[key] === 'busy') next[key] = 'idle';
                return next;
            });
            setScanning(false);
            setProgress(null);
        }
    };

    const markAllBasis = (basis) => setDrafts((prev) => applyBulkBasis(prev, basis));

    const save = async () => {
        if (saving || savable.length === 0) return;
        setSaving(true);
        setSaveError('');
        try {
            const count = await saveBackfill(savable, { uid });
            setSavedIds((prev) => {
                const next = new Set(prev);
                for (const item of savable) next.add(item.row.sessionId);
                return next;
            });
            setSavedCount((prev) => prev + count);
        } catch (err) {
            setSaveError(err?.message || 'Kaydedilemedi.');
        } finally {
            setSaving(false);
        }
    };

    const close = () => {
        stopRef.current = true;
        onClose?.();
    };

    if (!open) return null;

    const eta = humanDuration(estimateMs(scanTargets.length));

    return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={saving ? undefined : close} />
            <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-white rounded-2xl border border-slate-100 shadow-2xl">
                {/* Başlık */}
                <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#13294E] flex items-center justify-center shrink-0">
                            <Wallet className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h3 className="text-[14px] font-black text-slate-900">Geçmiş Görüşmelerde Maaş Beklentisi</h3>
                            <p className="text-[11px] text-slate-500">
                                Beklentisi kayıtlı olmayan görüşmeler — en yeni önce
                            </p>
                        </div>
                    </div>
                    <button onClick={close} disabled={saving}
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 disabled:opacity-40">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Araç çubuğu */}
                {phase === 'ready' && rows.length > 0 && (
                    <div className="px-5 py-3 border-b border-slate-100 space-y-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={scanning ? () => { stopRef.current = true; } : runScan}
                                disabled={!scanning && scanTargets.length === 0}
                                className="px-3 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-600 text-white text-[11px] font-black uppercase tracking-wider disabled:opacity-40 flex items-center gap-1.5">
                                {scanning
                                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Durdur</>
                                    : <><Search className="w-3.5 h-3.5" /> {scanTargets.length} görüşmeyi tara</>}
                            </button>
                            {!scanning && eta && (
                                <span className="text-[10px] text-slate-400">{eta}</span>
                            )}
                            {scanning && progress && (
                                <span className="text-[11px] font-semibold text-blue-700 tabular-nums">
                                    {progress.done} / {progress.total}
                                </span>
                            )}

                            <span className="flex-1" />

                            {/* TOPLU BRÜT/NET — bir işe alımcının havuzu genelde
                                tutarlıdır. Dolu olanı EZMEZ: o damga adayın
                                kendi sözünden geldi. */}
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Boş kalanları işaretle:</span>
                            {BASES.map((b) => (
                                <button key={b} type="button" onClick={() => markAllBasis(b)}
                                    className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-wider hover:bg-slate-50">
                                    Hepsi {BASIS_LABEL[b]}
                                </button>
                            ))}
                        </div>

                        {positionOptions.length > 1 && (
                            <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-violet-300">
                                <option value="">Tüm pozisyonlar ({rows.length})</option>
                                {positionOptions.map(([title, count]) => (
                                    <option key={title} value={title}>{title} ({count})</option>
                                ))}
                            </select>
                        )}

                        <p className="text-[10px] text-slate-400 leading-snug">
                            Model yalnızca adayın AÇIKÇA söylediği beklentiyi alır ve alıntısını gösterir.
                            Mevcut maaşı beklenti saymaz — çoğu görüşmede rakam çıkmaz, bu bir hata değil.
                        </p>
                    </div>
                )}

                {/* Gövde */}
                <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                    {phase === 'loading' && (
                        <div className="flex items-center gap-2 py-8 justify-center text-slate-500">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-[12px] font-semibold">Görüşme kayıtları okunuyor…</span>
                        </div>
                    )}

                    {phase === 'error' && (
                        <div className="flex gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-amber-700">{loadError}</p>
                        </div>
                    )}

                    {phase === 'ready' && rows.length === 0 && (
                        <p className="py-8 text-center text-[12px] text-slate-500">
                            Beklentisi eksik görüşme bulunamadı.
                        </p>
                    )}

                    {phase === 'ready' && visibleRows.map((row) => (
                        <SalaryBackfillRow
                            key={row.sessionId}
                            row={row}
                            draft={drafts[row.sessionId] || emptyDraft()}
                            hint={hints[row.sessionId] || null}
                            status={statuses[row.sessionId] || 'idle'}
                            error={errors[row.sessionId] || ''}
                            saved={savedIds.has(row.sessionId)}
                            onDraft={(patch) => patchDraft(row.sessionId, patch)}
                            onAccept={() => acceptHint(row.sessionId)}
                            onReject={() => rejectHint(row.sessionId)}
                        />
                    ))}

                    {/* NE OKUNMADI: kesme olduğunda ekrandaki liste bütünün
                        tamamı değildir ve bunu söylemek zorundayız. */}
                    {phase === 'ready' && meta.remaining > 0 && (
                        <p className="pt-2 text-[10px] text-slate-400 leading-snug">
                            Bu turda en yeni {rows.length} görüşme listelendi
                            (en fazla {MAX_READS} kayıt okunur). Bakılmayan {meta.remaining} görüşme var —
                            kaydettikleriniz listeden düşeceği için ekranı yeniden açtığınızda sıradakiler gelir.
                        </p>
                    )}
                    {phase === 'ready' && meta.failed > 0 && (
                        <p className="text-[10px] text-amber-700">{meta.failed} görüşme kaydı okunamadı.</p>
                    )}
                </div>

                {/* Alt bar */}
                {phase === 'ready' && rows.length > 0 && (
                    <div className="px-5 py-3 border-t border-slate-100 space-y-2">
                        {savedCount > 0 && (
                            <p className="text-[11px] font-semibold text-emerald-700">
                                {savedCount} görüşmeye beklenti yazıldı.
                            </p>
                        )}
                        {saveError && (
                            <p className="text-[11px] text-amber-700">{saveError}</p>
                        )}
                        {/* Bazsız kaydedilenler AYRI sayılır: rakam kayda geçer
                            ama fark raporunda "bilinmiyor" kefesinde kalır. */}
                        {tally.withoutBasis > 0 && (
                            <p className="text-[10px] text-amber-700">
                                {tally.withoutBasis} satırda brüt/net yok — kaydedilir ama bütçe
                                karşılaştırmasına girmez.
                            </p>
                        )}
                        <div className="flex items-center gap-3">
                            <p className="flex-1 text-[11px] text-slate-500">
                                <strong className="tabular-nums">{tally.filled}</strong> satır kaydedilmeye hazır,{' '}
                                <span className="tabular-nums">{tally.empty}</span> satır boş.
                                {' '}Boş bırakılan satır <strong>sıfır değil, &ldquo;sorulmadı&rdquo;</strong> sayılır.
                            </p>
                            <button onClick={close} disabled={saving}
                                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[11px] disabled:opacity-50">
                                Kapat
                            </button>
                            <button onClick={save} disabled={saving || scanning || savable.length === 0}
                                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-[11px] uppercase tracking-wider flex items-center gap-2 disabled:opacity-40">
                                {saving
                                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Kaydediliyor…</>
                                    : <>{savable.length} beklentiyi kaydet</>}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
