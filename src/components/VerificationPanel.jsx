// DOĞRULAMA PANELİ — CV istihbaratının tek ekranı.
//
// Gösterdiği şey bir puan değil: bayraklar, sektör ölçümü, şirket şirket
// doğrulama sonucu ve MÜLAKAT ÖNCESİ SORULACAKLAR listesi.
//
// ── EKRANIN TAŞIMAK ZORUNDA OLDUĞU ÜÇ CÜMLE ─────────────────────────────────
// 1. "Doğrulanamadı" suçlama değildir — küçük şirket, yurtdışı, dijital izi
//    olmayan işletme de bu sonucu verir.
// 2. Taranmayan şirket varsa YAZILIR; rapor "her şeye baktım" diye okunmamalı.
// 3. Kaynak listesi görünür. Kaynağı gösterilmeyen bir iddia, bu ekranda
//    zaten üretilmiyor (services/ai/companyIntel.js) ama gösterilen her
//    bulgunun nereden geldiği tıklanabilir olmalı.

import { useState, useEffect, useCallback } from 'react';
import {
    ShieldCheck, ShieldAlert, AlertTriangle, Info, CheckCircle2, Search,
    Building2, ExternalLink, Loader2, HelpCircle, Target, RefreshCw, Settings2, TrendingDown,
} from 'lucide-react';

import { verifyCandidate, buildVerificationSummary, buildStoredReport } from '../services/cvVerification';
import { readOrgProfile } from '../services/orgProfile';
import { useCandidates } from '../context/CandidatesContext';
import { describeSectorFit, VERDICT } from '../utils/sectorFit';
import { modelLabel, typeLabel } from '../utils/sectorTaxonomy';
import { CLAIM_VERDICT } from '../utils/companyClaims';
import { formatMonths } from '../utils/cvDates';
import { verificationEffect } from '../utils/verificationScore';
import { analysisScoreDetail } from '../utils/positionScore';

/** Ağırlık → görsel dil. Renk keyfi değil: yalnızca çelişki kırmızı. */
const SEVERITY_STYLE = {
    celiski: {
        label: 'Çelişki',
        icon: ShieldAlert,
        box: 'bg-rose-50 border-rose-200',
        chip: 'bg-rose-100 text-rose-700 border-rose-200',
        iconColor: 'text-rose-500',
    },
    dikkat: {
        label: 'Dikkat',
        icon: AlertTriangle,
        box: 'bg-amber-50 border-amber-200',
        chip: 'bg-amber-100 text-amber-700 border-amber-200',
        iconColor: 'text-amber-500',
    },
    bilgi: {
        label: 'Bilgi',
        icon: Info,
        box: 'bg-slate-50 border-slate-200',
        chip: 'bg-slate-100 text-slate-600 border-slate-200',
        iconColor: 'text-slate-400',
    },
};

const CLAIM_STYLE = {
    [CLAIM_VERDICT.VERIFIED]: { label: 'Doğrulandı', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
    [CLAIM_VERDICT.UNVERIFIED]: { label: 'Doğrulanamadı', cls: 'bg-slate-100 text-slate-600 border-slate-200', icon: HelpCircle },
    [CLAIM_VERDICT.CONTRADICTED]: { label: 'Çelişki', cls: 'bg-rose-100 text-rose-700 border-rose-200', icon: ShieldAlert },
};

const SECTOR_STYLE = {
    [VERDICT.STRONG]: { label: 'Güçlü', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    [VERDICT.PARTIAL]: { label: 'Kısmi', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
    [VERDICT.NEAR]: { label: 'Komşu sektör', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    [VERDICT.NONE]: { label: 'Yok', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
    [VERDICT.UNMEASURED]: { label: 'Ölçülemedi', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
    [VERDICT.NO_TARGET]: { label: 'Hedef yok', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

function SectionHeader({ icon: Icon, title, right = null }) {
    return (
        <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-cyan-500" />
                <h3 className="text-[12px] font-black text-slate-800 uppercase tracking-widest">{title}</h3>
            </div>
            {right}
        </div>
    );
}

function FlagCard({ flag }) {
    const style = SEVERITY_STYLE[flag.severity] || SEVERITY_STYLE.bilgi;
    const Icon = style.icon;
    return (
        <div className={`rounded-2xl border p-4 ${style.box}`}>
            <div className="flex items-start gap-3">
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${style.iconColor}`} />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[12px] font-black text-slate-800">{flag.title}</span>
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${style.chip}`}>
                            {style.label}
                        </span>
                    </div>
                    <p className="text-[12px] text-slate-600 leading-relaxed">{flag.detail}</p>
                </div>
            </div>
        </div>
    );
}

function SourceList({ sources }) {
    if (!sources?.length) return null;
    return (
        <div className="flex flex-wrap gap-1.5 mt-2">
            {sources.slice(0, 6).map((s, i) => (
                <a
                    key={`${s.uri}-${i}`}
                    href={s.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-cyan-600 bg-white border border-slate-200 rounded-lg px-2 py-1 transition-colors max-w-[220px]"
                    title={s.title || s.uri}
                >
                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">{s.title || s.uri}</span>
                </a>
            ))}
        </div>
    );
}

function CompanyRow({ item }) {
    const style = CLAIM_STYLE[item.verdict] || CLAIM_STYLE[CLAIM_VERDICT.UNVERIFIED];
    const Icon = style.icon;
    const ev = item.evidence;
    const facts = [
        ev?.sectorRaw && `Sektör: ${ev.sectorRaw}`,
        ev?.sizeBand && `Ölçek: ${ev.sizeBand}`,
        ev?.registry?.foundedYear && `Sicil kuruluş: ${ev.registry.foundedYear}`,
        !ev?.registry?.foundedYear && ev?.foundedYear && `Kuruluş: ${ev.foundedYear}`,
        ev?.headquarters && `Merkez: ${ev.headquarters}`,
    ].filter(Boolean);

    return (
        <div className="border border-slate-200 rounded-2xl p-4 bg-white">
            <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                    <div className="text-[13px] font-black text-slate-800 truncate">{item.company}</div>
                    <div className="text-[11px] text-slate-500">
                        {item.claim?.role || 'Rol belirtilmemiş'} · {item.claim?.duration || 'Tarih yok'}
                    </div>
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border ${style.cls}`}>
                    <Icon className="w-3 h-3" /> {style.label}
                </span>
            </div>

            {facts.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    {facts.map((f) => <span key={f}>{f}</span>)}
                </div>
            )}

            {ev?.withheld && (
                <p className="text-[11px] text-slate-500 mt-2 italic">
                    {ev.withheldReason === 'searched-uncited'
                        ? 'Arama yapıldı ama hiçbir sayfa kaynak olarak gösterilemedi — bulgular gizlendi.'
                        : 'Arama yapılamadı — bu şirket için hiçbir bilgi gösterilmiyor.'}
                </p>
            )}

            <SourceList sources={ev?.sources} />
        </div>
    );
}

function SectorFitBlock({ fit, onOpenSettings }) {
    const style = SECTOR_STYLE[fit?.verdict] || SECTOR_STYLE[VERDICT.UNMEASURED];
    const noTarget = fit?.verdict === VERDICT.NO_TARGET;

    return (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
            <SectionHeader
                icon={Target}
                title="Sektör Uyumu"
                right={
                    <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border ${style.cls}`}>
                        {style.label}
                    </span>
                }
            />

            <p className="text-[12px] text-slate-600 leading-relaxed">{describeSectorFit(fit)}</p>

            {noTarget ? (
                <button
                    onClick={onOpenSettings}
                    className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-cyan-600 hover:text-cyan-700"
                >
                    <Settings2 className="w-3.5 h-3.5" /> Kurumsal Kimlik ayarlarından hedef sektörü tanımla
                </button>
            ) : (
                <>
                    <div className="grid grid-cols-3 gap-2 mt-4">
                        {[
                            { label: 'Hedef sektörde', value: formatMonths(fit.exactMonths) },
                            { label: 'Komşu sektörde', value: formatMonths(fit.nearMonths) },
                            { label: `Son 5 yılda`, value: formatMonths(fit.recentExactMonths) },
                        ].map((s) => (
                            <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                                <div className="text-[13px] font-black text-slate-800">{s.value}</div>
                                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">{s.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* İş modeli ve gelir tipi AYRI eksenler — sektör tutmasa da
                        bunlar tutuyorsa aday tanıdık bir dünyadan geliyordur. */}
                    {(fit.modelMonths > 0 || fit.typeMonths > 0) && (
                        <div className="flex flex-wrap gap-2 mt-3">
                            {fit.modelMonths > 0 && (
                                <span className="text-[10px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-1">
                                    {modelLabel(fit.target.model)} deneyimi: {formatMonths(fit.modelMonths)}
                                </span>
                            )}
                            {fit.typeMonths > 0 && (
                                <span className="text-[10px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-1">
                                    {typeLabel(fit.target.type)} deneyimi: {formatMonths(fit.typeMonths)}
                                </span>
                            )}
                        </div>
                    )}

                    {fit.breakdown?.length > 0 && (
                        <div className="mt-4 space-y-1.5">
                            {fit.breakdown.map((b, i) => (
                                <div key={`${b.company}-${i}`} className="flex items-center justify-between gap-2 text-[11px] bg-white border border-slate-200 rounded-lg px-3 py-2">
                                    <span className="font-bold text-slate-700 truncate">{b.company}</span>
                                    <span className="text-slate-500 shrink-0">
                                        {b.sectorLabel || 'sektör çözümlenemedi'} · {formatMonths(b.months)}
                                        {b.affinity === 1 && ' · hedef'}
                                        {b.affinity === 0.5 && ' · komşu'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

/**
 * BU BULGULAR SKORA NE YAPTI?
 *
 * Panel bayrakları gösteriyordu ama kaça mal olduklarını göstermiyordu:
 * kullanıcı 4 dikkat maddesi ve bir sektör hükmü görüyor, skorun neden
 * düştüğünü ise başka bir sekmedeki katlanır panelden öğreniyordu.
 *
 * Etki RAPORUN KENDİSİNDEN hesaplanıyor, adayın kayıtlı özetinden değil:
 * ekranda duran bulgularla gösterilen sayı aynı şeyi anlatmalı. İkisi
 * yalnızca kaydetme başarısız olduğunda ayrışır ve o durumda zaten uyarı
 * gösteriliyor.
 */
function ScoreImpactBlock({ report, candidate, position }) {
    const summary = buildVerificationSummary(report);
    const effect = verificationEffect(summary);
    const reasons = [...effect.verification.reasons, ...effect.sector.reasons];

    // Somut sayı ancak bu adayın bu ilanda taranmış bir analizi varsa
    // gösterilebilir. Yoksa yalnızca oran gösterilir — uydurma bir taban
    // skor üzerinden "şu kadar puan kaybetti" demek yanlış olurdu.
    const detail = position ? analysisScoreDetail(candidate, position) : null;
    const hasConcrete = Boolean(detail?.scanned && detail.preVerificationScore > 0);
    const lostPoints = hasConcrete ? detail.preVerificationScore - detail.score : 0;

    if (!effect.applied) {
        return (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                <p className="text-[12px] text-slate-700">
                    <strong>Bu bulgular skoru düşürmedi.</strong> Dikkat maddeleri mülakatta sorulacak
                    soru üretir ama tek başlarına puan kesmez; kaynak bulunamaması da ceza değildir.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5">
            <SectionHeader
                icon={TrendingDown}
                title="Skora Etkisi"
                right={
                    hasConcrete ? (
                        <span className="text-[12px] font-black text-rose-700">
                            {detail.preVerificationScore} → {detail.score}
                            <span className="text-[10px] font-bold text-rose-500 ml-1.5">−{lostPoints} puan</span>
                        </span>
                    ) : (
                        <span className="text-[12px] font-black text-rose-700">
                            ×{effect.multiplier.toFixed(2)}
                        </span>
                    )
                }
            />

            <ul className="space-y-1.5">
                {reasons.map((r) => (
                    <li key={r.code} className="flex items-start justify-between gap-3 text-[12px] text-slate-700 bg-white border border-rose-100 rounded-xl px-3 py-2">
                        <span className="leading-relaxed">{r.label}</span>
                        <span className="font-black text-rose-600 shrink-0">×{r.factor}</span>
                    </li>
                ))}
            </ul>

            <p className="text-[10px] text-slate-500 mt-2.5 leading-relaxed">
                {hasConcrete
                    ? `"${position.title}" ilanındaki skora uygulandı. Diğer ilanlarda da aynı oran geçerli.`
                    : 'Bu oran, adayın taranmış olduğu her ilandaki skoruna uygulanır.'}
                {' '}Kesinti yalnızca ÖLÇÜLMÜŞ bulgulardan doğar — kaynak bulunamaması tek başına puan düşürmez.
            </p>
        </div>
    );
}

export default function VerificationPanel({ candidate, position = null }) {
    const [report, setReport] = useState(null);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState('');
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [target, setTarget] = useState(null);
    const [targetLoaded, setTargetLoaded] = useState(false);
    const { updateCandidate } = useCandidates();

    useEffect(() => {
        let alive = true;
        readOrgProfile().then((p) => {
            if (!alive) return;
            setTarget(p);
            setTargetLoaded(true);
        });
        return () => { alive = false; };
    }, []);

    // KAYITLI RAPORU GÖSTER. Önceden her sekme açılışında boş ekran ve
    // "Doğrulamayı başlat" düğmesi çıkıyordu; kullanıcı daha önce taradığı
    // adayı yeniden taramak zorunda kalıyordu ve "bu adayı taramış mıydım?"
    // sorusunun cevabı hiçbir yerde yoktu.
    //
    // Aday değişince state SIFIRLANIR ve yeni adayın kaydı yüklenir —
    // başka birinin bayrakları bu adaya aitmiş gibi okunmamalı.
    //
    // Bağımlılık YALNIZCA aday kimliği. Rapor nesnesini de bağımlılığa
    // koymak cazip ama zararlı: Firestore dinleyicisi her doküman
    // güncellemesinde yeni bir nesne üretir, dolayısıyla efekt alakasız bir
    // değişiklikte de koşar. Kaydetme başarısız olduğu senaryoda bu, az önce
    // üretilmiş raporu ekrandan siler — kullanıcı taramayı yaptı ve sonucu
    // kaybeder. Taze rapor zaten run() içinde state'e yazılıyor.
    useEffect(() => {
        setReport(candidate?.verificationReport || null);
        setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [candidate?.id]);

    const run = useCallback(async (force = false) => {
        setRunning(true);
        setError('');
        setProgress({ done: 0, total: 0 });
        try {
            const result = await verifyCandidate(candidate, {
                targetProfile: target,
                position,
                force,
                onProgress: (done, total) => setProgress({ done, total }),
            });
            setReport(result);

            // ÖZET ADAY BELGESİNE YAZILIR. Rapor saklanmıyor (yeniden üretmek
            // bedava, şirket verisi zaten önbellekte) ama listedeki rozetler
            // ve skor kesintisi senkron okunmak zorunda — o yüzden özet
            // kalıcı olmalı.
            //
            // Yazma başarısız olursa rapor EKRANDA KALIR: kullanıcı taramayı
            // yaptı, sonucu görmeyi hak ediyor. Yalnızca liste/skor tarafı
            // güncellenmemiş olur ve bunu söylüyoruz.
            if (candidate?.id) {
                try {
                    await updateCandidate(candidate.id, {
                        verification: buildVerificationSummary(result),
                        // Raporun kendisi de saklanıyor ki sekmeye her
                        // girişte yeniden taramak gerekmesin.
                        verificationReport: buildStoredReport(result),
                    });
                } catch (err) {
                    setError('Rapor üretildi ama adaya kaydedilemedi — listedeki rozetler ve skor güncellenmeyecek: '
                        + (err?.message || 'bilinmeyen hata'));
                }
            }
        } catch (err) {
            setError(err?.message || 'Doğrulama tamamlanamadı.');
        } finally {
            setRunning(false);
        }
    }, [candidate, position, target, updateCandidate]);

    const openSettings = () => window.dispatchEvent(new CustomEvent('changeView', { detail: 'settings' }));

    if (!candidate) return null;

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* ── Başlık + çalıştır ── */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                        <SectionHeader icon={ShieldCheck} title="CV Doğrulama" />
                        <p className="text-[12px] text-slate-600 leading-relaxed max-w-2xl">
                            CV&apos;deki tarihleri kendi içinde tutarlılık için denetler, şirketleri kamuya açık
                            kaynaklardan doğrular ve sektör uyumunu ölçer. Mülakatta sorulacak sorular üretir ve{' '}
                            <strong className="text-slate-700">ölçülmüş bulgular skoru düşürebilir</strong> —
                            kaynak bulunamaması tek başına ceza değildir.
                        </p>
                        {report?.verifiedAt && (
                            <p className="text-[11px] text-slate-400 mt-1.5">
                                Son tarama: {new Date(report.verifiedAt).toLocaleString('tr-TR')}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {report && (
                            <button
                                onClick={() => run(true)}
                                disabled={running}
                                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 px-3 py-2 rounded-xl disabled:opacity-50 transition-colors"
                                title="Önbelleği yok say, şirketleri yeniden ara"
                            >
                                <RefreshCw className="w-3.5 h-3.5" /> Yeniden ara
                            </button>
                        )}
                        <button
                            onClick={() => run(false)}
                            disabled={running || !targetLoaded}
                            className="inline-flex items-center gap-1.5 text-[11px] font-black text-white bg-cyan-600 hover:bg-cyan-700 px-4 py-2 rounded-xl disabled:opacity-50 transition-colors"
                        >
                            {running
                                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Taranıyor…</>
                                : <><Search className="w-3.5 h-3.5" /> {report ? 'Tekrar çalıştır' : 'Doğrulamayı başlat'}</>}
                        </button>
                    </div>
                </div>

                {running && progress.total > 0 && (
                    <p className="text-[11px] text-slate-500 mt-3">
                        Şirketler çözümleniyor: {progress.done} / {progress.total}
                    </p>
                )}
                {error && (
                    <p className="text-[11px] text-rose-600 font-bold mt-3">{error}</p>
                )}
            </div>

            {!report && !running && (
                <div className="text-center py-10 text-slate-400">
                    <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="text-[12px] font-bold">Bu aday için henüz doğrulama çalıştırılmadı.</p>
                </div>
            )}

            {report && (
                <>
                    {/* ── Özet sayaçları ── */}
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { key: 'celiski', label: 'Çelişki', value: report.counts.celiski, cls: 'text-rose-600' },
                            { key: 'dikkat', label: 'Dikkat', value: report.counts.dikkat, cls: 'text-amber-600' },
                            { key: 'bilgi', label: 'Bilgi', value: report.counts.bilgi, cls: 'text-slate-500' },
                        ].map((c) => (
                            <div key={c.key} className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
                                <div className={`text-[22px] font-black ${c.cls}`}>{c.value}</div>
                                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{c.label}</div>
                            </div>
                        ))}
                    </div>

                    <ScoreImpactBlock report={report} candidate={candidate} position={position} />

                    {/* ── Mülakat soruları: raporun ASIL çıktısı, o yüzden en üstte ── */}
                    {report.questions.length > 0 && (
                        <div className="bg-cyan-50 border border-cyan-200 rounded-2xl p-5">
                            <SectionHeader icon={HelpCircle} title="Mülakat Öncesi Sorulacaklar" />
                            <ol className="space-y-2">
                                {report.questions.map((q, i) => (
                                    <li key={q} className="flex gap-2.5 text-[12px] text-slate-700 leading-relaxed">
                                        <span className="shrink-0 w-5 h-5 rounded-lg bg-white border border-cyan-200 text-cyan-700 text-[10px] font-black flex items-center justify-center">
                                            {i + 1}
                                        </span>
                                        <span>{q}</span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}

                    {/* ── Bayraklar ── */}
                    {report.flags.length > 0 ? (
                        <div className="space-y-2">
                            <SectionHeader icon={AlertTriangle} title="Bulgular" />
                            {report.flags.map((f, i) => <FlagCard key={`${f.id}-${i}`} flag={f} />)}
                        </div>
                    ) : (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-3">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                            <p className="text-[12px] text-slate-700">
                                Tutarsızlık ya da çelişki bulunmadı. Bu, her iddianın doğrulandığı anlamına gelmez —
                                yalnızca denetlenen noktalarda sorun çıkmadı.
                            </p>
                        </div>
                    )}

                    <SectorFitBlock fit={report.sectorFit} onOpenSettings={openSettings} />

                    {/* ── Şirket şirket ── */}
                    {report.companies.length > 0 && (
                        <div>
                            <SectionHeader
                                icon={Building2}
                                title="Şirket Doğrulaması"
                                right={
                                    <span className="text-[10px] font-bold text-slate-400">
                                        {report.lookup.fromCache > 0 && `${report.lookup.fromCache} önbellekten · `}
                                        {report.lookup.looked} arama
                                    </span>
                                }
                            />
                            <div className="space-y-2">
                                {report.companies.map((c, i) => <CompanyRow key={`${c.company}-${i}`} item={c} />)}
                            </div>
                        </div>
                    )}

                    {/* Google'ın gösterim şartı: arama önerileri bloğu OLDUĞU GİBİ
                        gösterilmek zorunda. Süs değil, kullanım şartı. */}
                    {report.companies.map((c, i) => (
                        c.evidence?.searchSuggestionHtml
                            ? <div key={`sg-${i}`} className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: c.evidence.searchSuggestionHtml }} />
                            : null
                    ))}

                    <p className="text-[10px] text-slate-400 text-center">
                        Bu rapor bir karar değil, bir başlangıç noktasıdır. &quot;Doğrulanamadı&quot; bulgusu
                        adayın beyanının yanlış olduğunu göstermez.
                    </p>
                </>
            )}

            {targetLoaded && !target && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                    <Info className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-slate-600">
                        Kurumun hedef sektörü tanımlı değil; sektör uyumu ölçülemeyecek.{' '}
                        <button onClick={openSettings} className="font-bold text-cyan-600 hover:underline">
                            Ayarlar → Kurumsal Kimlik
                        </button>{' '}
                        ekranından tanımlayın.
                    </p>
                </div>
            )}
        </div>
    );
}
