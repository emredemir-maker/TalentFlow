import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    RefreshCw, Play, Loader2, CheckCircle, Brain, Database,
    X, Eye, GitBranch, MessageSquare, Search, Users, Zap, CheckSquare, Square, Target
} from 'lucide-react';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import { findBestPositionMatch, filterPositionsByDomain, calculateMatchScore } from '../services/matchService';
import { analyzeCandidateMatch } from '../services/geminiService';
import { buildJobDescription, requirementsOf, requirementsFingerprint } from '../utils/positionRequirements';
import { COVERAGE_SCHEMA } from '../utils/coverageDetail';
import { useNotifications } from '../context/NotificationContext';

/**
 * Recursively replace undefined values with null so Firestore's updateDoc()
 * doesn't reject the write. Firestore treats `undefined` as an unsupported
 * field value, but happily accepts `null` (preserves the field as
 * "explicitly empty"). This is the third bug we've hit from AI returning
 * partial objects — defensive at the boundary now.
 */
function sanitizeForFirestore(value) {
    if (value === undefined) return null;
    if (value === null) return null;
    if (Array.isArray(value)) return value.map(sanitizeForFirestore);
    if (typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = sanitizeForFirestore(v);
        }
        return out;
    }
    return value;
}

// ─── Scope option definitions ──────────────────────────────────────────────
const SCOPE_OPTIONS = [
    {
        id: 'unanalyzed',
        label: 'Analiz Edilmemiş',
        desc: 'Yalnızca detaylı STAR analizi henüz yapılmamış adaylar',
        icon: Zap,
        color: 'text-cyan-400',
        bg: 'bg-cyan-400/10',
        border: 'border-cyan-400/30',
    },
    {
        id: 'all',
        label: 'Tüm Adaylar',
        desc: 'Daha önce analiz edilmiş adaylar dahil tüm havuz yeniden taranır',
        icon: Users,
        color: 'text-orange-400',
        bg: 'bg-orange-400/10',
        border: 'border-orange-400/30',
    },
    {
        id: 'selected',
        label: 'Seçili Adaylar',
        desc: 'Listeden seçtiğiniz adaylar üzerinde analiz çalıştırın',
        icon: CheckSquare,
        color: 'text-violet-400',
        bg: 'bg-violet-400/10',
        border: 'border-violet-400/30',
    },
    {
        id: 'filtered',
        label: 'Hedefli Tarama',
        desc: 'Seçtiğiniz pozisyon için, ön uyum skoru belirlediğiniz eşiğin üzerindeki adayları detaylı analiz edin',
        icon: Target,
        color: 'text-emerald-400',
        bg: 'bg-emerald-400/10',
        border: 'border-emerald-400/30',
    },
];

export default function SystemScanner() {
    const { candidates, updateCandidate } = useCandidates();
    const { positions } = usePositions();
    const { addNotification } = useNotifications();

    // ── UI State ────────────────────────────────────────────────────────────
    const [scanning, setScanning]       = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [showMonitor, setShowMonitor] = useState(false);

    // ── Scope / filter state ────────────────────────────────────────────────
    const [scanScope, setScanScope]         = useState('unanalyzed'); // 'unanalyzed' | 'all' | 'selected' | 'filtered'
    const [selectedIds, setSelectedIds]     = useState(new Set());
    const [candidateSearch, setCandidateSearch] = useState('');
    // 'filtered' (Hedefli Tarama) kapsamı: pozisyon + minimum ön skor eşiği.
    // Amaç: ucuz ön skor üzerinden filtreleyip pahalı detaylı AI analizini
    // yalnızca barajı geçen adaylara koşturmak.
    const [targetPositionId, setTargetPositionId] = useState('');
    const [minPreScore, setMinPreScore]           = useState(60);
    // Hedefli taramaya kimler dahil edilecek?
    //   'never_analyzed'   — hiç detaylı analizi olmayanlar (varsayılan):
    //                        eski otonom taramadan geçmiş kayıtlar tekrar
    //                        analiz edilmez, kota yalnızca yeni adaylara gider
    //   'not_for_position' — seçilen pozisyon için analiz edilmemiş herkes
    //   'all'              — eşiği geçen herkes (yeniden analiz dahil)
    const [filteredInclusion, setFilteredInclusion] = useState('never_analyzed');
    // Akıllı pozisyon sınırı: 'Tüm Adaylar'/'Seçili' kapsamlarında aday
    // başına HER uyumlu pozisyonu AI'a göndermek yerine, ücretsiz
    // anahtar-kelime ön sıralamasıyla en iyi 5 pozisyon seçilir ve yalnızca
    // onlar detaylı analize girer. Bariz alakasız pozisyonlara AI çağrısı
    // harcanmaz; analiz kalitesi (model + prompt) değişmez.
    const [smartPositionLimit, setSmartPositionLimit] = useState(true);

    // ── Process state ───────────────────────────────────────────────────────
    const isScanningRef   = useRef(false);
    const [progress, setProgress]               = useState(0);
    const [currentCandidate, setCurrentCandidate] = useState(null);
    const [activeStage, setActiveStage]         = useState(null);
    const [processedCount, setProcessedCount]   = useState(0);
    const [aiCount, setAiCount]                 = useState(0);
    const [updatedCount, setUpdatedCount]       = useState(0);
    const [totalQueued, setTotalQueued]         = useState(0);

    // ── Derived counts for modal ────────────────────────────────────────────
    const unanalyzedCandidates = candidates.filter(c => !c.aiAnalysis?.starAnalysis);
    const analyzedCandidates   = candidates.filter(c =>  c.aiAnalysis?.starAnalysis);

    const filteredForSelection = candidates.filter(c => {
        const q = candidateSearch.toLowerCase();
        return !q || c.name?.toLowerCase().includes(q) || c.position?.toLowerCase().includes(q);
    });

    // Ön skor: içe aktarma/başvuru anında hesaplanan ilk uyum puanı.
    const preScoreOf = (c) => Number(c.initialAiScore ?? c.matchScore ?? c.aiScore ?? 0) || 0;

    const targetPosition = positions.find(p => p.id === targetPositionId) || null;
    const filteredQueue = targetPosition
        ? candidates.filter(c => {
            if (preScoreOf(c) < Number(minPreScore || 0)) return false;
            if (filteredInclusion === 'never_analyzed') {
                return !c.aiAnalysis?.starAnalysis && !c.positionAnalyses?.[targetPosition.title];
            }
            if (filteredInclusion === 'not_for_position') {
                return !c.positionAnalyses?.[targetPosition.title];
            }
            return true; // 'all'
        })
        : [];

    const queuedCount =
        scanScope === 'unanalyzed' ? unanalyzedCandidates.length :
        scanScope === 'all'        ? candidates.length :
        scanScope === 'filtered'   ? filteredQueue.length :
        selectedIds.size;

    // ── Auto-scan on new position ───────────────────────────────────────────
    const prevPositionsCount = useRef(0);
    useEffect(() => {
        if (positions.length > prevPositionsCount.current && prevPositionsCount.current > 0) {
            setTimeout(() => handleScan('unanalyzed', new Set()), 1000);
        }
        prevPositionsCount.current = positions.length;
    }, [positions.length]);

    const handleStop = () => {
        setScanning(false);
        isScanningRef.current = false;
        setShowMonitor(false);
    };

    const toggleCandidate = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (selectedIds.size === filteredForSelection.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredForSelection.map(c => c.id)));
        }
    };

    // ── Main scan handler ───────────────────────────────────────────────────
    const handleScan = async (scope = scanScope, ids = selectedIds) => {
        setShowConfirm(false);

        if (!candidates.length || !positions.length) return;

        const openPositions = positions.filter(p => p.status === 'open');
        if (openPositions.length === 0) {
            alert('Açık pozisyon bulunamadı.');
            return;
        }

        // Build the candidate queue based on scope
        let queue;
        if (scope === 'unanalyzed') {
            queue = candidates.filter(c => !c.aiAnalysis?.starAnalysis);
        } else if (scope === 'all') {
            queue = [...candidates];
        } else if (scope === 'filtered') {
            if (!targetPosition) {
                addNotification({ title: 'Pozisyon Seçilmedi', message: 'Hedefli tarama için önce bir pozisyon seçin.', type: 'info' });
                return;
            }
            queue = filteredQueue;
        } else {
            queue = candidates.filter(c => ids.has(c.id));
        }

        if (queue.length === 0) {
            addNotification({ title: 'Taranacak Aday Yok', message: 'Seçilen kriterlere uygun aday bulunamadı.', type: 'info' });
            return;
        }

        const forceAnalyze = scope !== 'unanalyzed'; // 'all' and 'selected' always re-analyze

        try {
            setScanning(true);
            isScanningRef.current = true;
            setShowMonitor(true);
            setProgress(0);
            setProcessedCount(0);
            setAiCount(0);
            setUpdatedCount(0);
            setTotalQueued(queue.length);

            // Tek adayı uçtan uca işler. Eskiden sıralı for-döngüsüydü ve her
            // adayda ~1 sn yapay bekleme (50+80+800+80 ms sahne animasyonu)
            // vardı; artık beklemeler kaldırıldı ve adaylar 3'lü havuzda
            // paralel işleniyor — model ve prompt aynı, kalite değişmez.
            let skippedNoCvCount = 0;
            const processOne = async (candidate) => {
                if (!isScanningRef.current) return;
                setCurrentCandidate(candidate);

                // Kanıt kontrolü: CV gövdesi ve deneyim listesi boşsa derin
                // analiz BOŞ girdiyle çalışır ve tek haneli skor üretir
                // (%90'ın %4'e düşmesinin nedeni). Skoru çökertmek yerine
                // adayı atla — yeniden ayrıştırma gerekiyor.
                const cvBody = `${candidate.cvData || ''}${candidate.cvText || ''}`.trim();
                const hasEvidence = cvBody.length >= 40 || (candidate.experiences?.length > 0);
                if (!hasEvidence) {
                    skippedNoCvCount += 1;
                    return;
                }

                // ── Stage 1: Scout ─────────────────────────────────────────
                setActiveStage('scout');
                const compatiblePositions = filterPositionsByDomain(candidate, openPositions);
                const bestMatch = findBestPositionMatch(candidate, compatiblePositions);

                const updates = {};
                let needsUpdate = false;

                // ── Stage 2: Researcher ────────────────────────────────────
                if (bestMatch && (bestMatch.matchScore || 0) > 5) {
                    setActiveStage('researcher');
                }

                // ── Stage 3: Analyst ───────────────────────────────────────
                const hasManualOverride = candidate.manualScore && candidate.scoringStage !== 'initial';
                const shouldAnalyze = forceAnalyze || !hasManualOverride;

                // İşe alım uzmanının atadığı pozisyon (positionId) her zaman
                // analiz kümesine dahil edilir ve başlık yazımında bağlayıcıdır.
                const assignedPos = candidate.positionId
                    ? openPositions.find(p => p.id === candidate.positionId) || null
                    : null;

                if (shouldAnalyze) {
                    setActiveStage('analyst');

                    try {
                        const updatedAnalyses = { ...(candidate.positionAnalyses || {}) };
                        let highestScore = -1;
                        let bestResult   = null;
                        let bestTitle    = candidate.matchedPositionTitle;

                        // Hedefli taramada YALNIZCA seçilen pozisyon analiz
                        // edilir — amaç zaten kotayı tek pozisyona odaklamak.
                        // Force kapsamlarında akıllı sınır açıksa, ücretsiz
                        // anahtar-kelime skoruyla ön-sıralanıp yalnızca en iyi
                        // 5 pozisyon AI'a gönderilir.
                        // calculateMatchScore bir OBJE döndürür ({score, ...});
                        // .score alınmazsa sıralama NaN karşılaştırır ve "en iyi
                        // 5" fiilen rastgele 5 olur.
                        const rankedForce = smartPositionLimit && compatiblePositions.length > 5
                            ? [...compatiblePositions]
                                .map(p => ({ p, s: calculateMatchScore(candidate, p)?.score || 0 }))
                                .sort((a, b) => b.s - a.s)
                                .slice(0, 5)
                                .map(x => x.p)
                            : compatiblePositions;
                        let positionsToAnalyze =
                            scope === 'filtered' ? [targetPosition]
                            : forceAnalyze ? rankedForce
                            : [assignedPos || bestMatch || compatiblePositions[0]].filter(Boolean);
                        if (assignedPos && !positionsToAnalyze.some(p => p?.id === assignedPos.id)) {
                            positionsToAnalyze = [assignedPos, ...positionsToAnalyze];
                        }

                        for (const pos of positionsToAnalyze) {
                            if (!pos) continue;
                            // İlan metni gereksinimleri NUMARALI ve
                            // [ZORUNLU]/[TERCİHEN] etiketli verir; requirements
                            // ayrıca geçilir ki kapsama skoru ağırlıklı
                            // hesaplansın. Bu satırlar eskiden düz birleştirme
                            // yapıyordu: otonom tarama zorunlu/tercihen ayrımını
                            // NE skorda NE de anlatımda kullanabiliyordu —
                            // scanService güncellenirken burası atlanmıştı.
                            const jobDesc = buildJobDescription(pos);
                            try {
                                const result = await analyzeCandidateMatch(jobDesc, candidate, 'gemini-2.5-flash', {
                                    requirements: requirementsOf(pos),
                                });
                                // Sanitize undefined → null at the write boundary; the AI
                                // sometimes omits fields and Firestore rejects undefined.
                                //
                                // DAMGA da burada yazılır. Madde yargıları madde
                                // NUMARASINA bağlı: ilan sonradan değişirse eski
                                // yargı yanlış maddeye yapışır ve skor sessizce
                                // yanlış olur. scanService bu damgayı yazıyordu,
                                // otonom tarama yazmıyordu — yani kullanıcının
                                // FİİLEN kullandığı yol damgasız analiz üretiyordu.
                                updatedAnalyses[pos.title] = sanitizeForFirestore({
                                    ...result,
                                    requirementsFingerprint: requirementsFingerprint(pos),
                                    coverageSchema: COVERAGE_SCHEMA,
                                    analyzedAt: new Date().toISOString(),
                                });
                                setAiCount(prev => prev + 1);

                                // 0 puanlı sonuç "en iyi" kabul edilmez — tek
                                // pozisyonluk taramada 0'ın skor alanlarını
                                // ezmesini engeller (positionAnalyses yine kaydeder).
                                if (result.score > highestScore && result.score > 0) {
                                    highestScore = result.score;
                                    bestResult   = result;
                                    bestTitle    = pos.title;
                                }
                            } catch (e) {
                                console.error('AI Error for pos', pos.title, e);
                            }
                        }

                        if (bestResult) {
                            updates.aiAnalysis = sanitizeForFirestore({
                                ...bestResult,
                                lastAnalyzedAt:      new Date().toISOString(),
                                analyzedForPosition: bestTitle,
                            });
                            updates.summary          = bestResult.summary ?? null;
                            updates.aiScore          = bestResult.score;
                            updates.positionAnalyses = updatedAnalyses;
                            // CandidateDrawer ile aynı kural: ortak matchScore
                            // yalnızca 'initial' aşamada AI tarafından ezilebilir
                            // (manuel/ileri aşama skorları korunur).
                            if ((candidate.scoringStage || 'initial') === 'initial') {
                                updates.matchScore = bestResult.score;
                            }
                            // İşe alım uzmanı ataması bağlayıcı: atanmış pozisyon
                            // varken "en iyi eşleşme" başlığı onu ezemez.
                            updates.matchedPositionTitle = assignedPos ? assignedPos.title : bestTitle;
                        }

                        updates.lastScannedAt = new Date().toISOString();
                        needsUpdate = true;
                    } catch (aiErr) {
                        console.error('AI Error:', aiErr);
                        if (bestMatch) {
                            if ((candidate.scoringStage || 'initial') === 'initial') {
                                updates.matchScore = bestMatch.matchScore;
                            }
                            updates.matchedPositionTitle = assignedPos ? assignedPos.title : bestMatch.title;
                            needsUpdate = true;
                        }
                    }
                }

                // ── Stage 4: Engagement ────────────────────────────────────
                if (updates.matchScore && updates.matchScore > 75) {
                    setActiveStage('engagement');
                }

                // ── Stage 5: Recruiter ─────────────────────────────────────
                if (needsUpdate) {
                    setActiveStage('recruiter');
                    await updateCandidate(candidate.id, updates);
                    setUpdatedCount(prev => prev + 1);
                }
            };

            // 3'lü paralel havuz. JS tek iş parçacıklı olduğundan sayaç
            // yarışsızdır; durdurma bayrağı her adaydan önce kontrol edilir.
            // Bir adayın hatası diğerlerini durdurmaz.
            let completedCount = 0;
            const bumpProgress = () => {
                completedCount += 1;
                setProcessedCount(completedCount);
                setProgress((completedCount / queue.length) * 100);
            };
            const CONCURRENCY = 3;
            let nextIdx = 0;
            await Promise.all(
                Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
                    while (isScanningRef.current && nextIdx < queue.length) {
                        const candidate = queue[nextIdx];
                        nextIdx += 1;
                        try {
                            await processOne(candidate);
                        } catch (oneErr) {
                            console.error('Scan item error:', candidate?.name, oneErr);
                        }
                        bumpProgress();
                    }
                })
            );

            setProgress(100);
            setActiveStage(null);
            setCurrentCandidate(null);
            setScanning(false);
            isScanningRef.current = false;

            addNotification({
                title: 'Sistem Taraması Tamamlandı',
                message: `${queue.length} aday tarandı, ${aiCount} AI analizi gerçekleştirildi.`
                    + (skippedNoCvCount > 0 ? ` ${skippedNoCvCount} aday CV metni olmadığı için atlandı (yeniden ayrıştırma gerekli).` : ''),
                type: 'success',
            });

        } catch (err) {
            console.error('Scan Error:', err);
            setScanning(false);
            isScanningRef.current = false;
            addNotification({ title: 'Tarama Hatası', message: 'Sistem taraması sırasında bir hata oluştu.', type: 'error' });
        }
    };

    // ── Confirm Modal ───────────────────────────────────────────────────────
    if (showConfirm && !scanning) {
        const allSelected = filteredForSelection.length > 0 && selectedIds.size === filteredForSelection.length;
        const canStart    = (scanScope !== 'selected' || selectedIds.size > 0)
            && (scanScope !== 'filtered' || (targetPosition && filteredQueue.length > 0));

        return createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 bg-navy-950/80 backdrop-blur-sm">
                <div className="bg-navy-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 mx-auto flex flex-col max-h-[90vh]">

                    {/* Header */}
                    <div className="p-3.5 border-b border-white/5 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-xl bg-electric/10 flex items-center justify-center">
                                <Brain className="w-5 h-5 text-electric" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-white">Sistem Taraması</h3>
                                <p className="text-xs text-navy-400">5 Aşamalı Otonom Ajan Sistemi</p>
                            </div>
                        </div>
                        <button onClick={() => setShowConfirm(false)} className="p-1.5 hover:bg-white/5 rounded-lg text-navy-400 hover:text-white transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Scrollable body */}
                    <div className="overflow-y-auto flex-1 p-3.5 space-y-4">

                        {/* Scope selector */}
                        <div>
                            <p className="text-[10px] font-black text-navy-400 uppercase tracking-widest mb-2">Tarama Kapsamı</p>
                            <div className="space-y-2">
                                {SCOPE_OPTIONS.map(opt => {
                                    const Icon    = opt.icon;
                                    const active  = scanScope === opt.id;
                                    const count   =
                                        opt.id === 'unanalyzed' ? unanalyzedCandidates.length :
                                        opt.id === 'all'        ? candidates.length :
                                        opt.id === 'filtered'   ? filteredQueue.length :
                                        selectedIds.size;

                                    return (
                                        <button
                                            key={opt.id}
                                            onClick={() => setScanScope(opt.id)}
                                            className={`w-full flex items-start gap-2 p-3 rounded-xl border text-left transition-all ${
                                                active
                                                    ? `${opt.bg} ${opt.border}`
                                                    : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.05]'
                                            }`}
                                        >
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active ? opt.bg : 'bg-white/[0.04]'}`}>
                                                <Icon className={`w-4 h-4 ${active ? opt.color : 'text-navy-400'}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-sm font-bold ${active ? opt.color : 'text-navy-300'}`}>{opt.label}</span>
                                                    {opt.id !== 'selected' && (
                                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${active ? `${opt.bg} ${opt.color}` : 'bg-white/[0.04] text-navy-500'}`}>
                                                            {count} aday
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-navy-500 mt-0.5 leading-relaxed">{opt.desc}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Smart position cap — applies to force-analyze scopes */}
                        {(scanScope === 'all' || scanScope === 'selected') && (
                            <label className="flex items-start gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={smartPositionLimit}
                                    onChange={e => setSmartPositionLimit(e.target.checked)}
                                    className="accent-emerald-400 mt-0.5"
                                />
                                <span className="text-xs text-navy-300 leading-relaxed">
                                    <span className="font-bold text-navy-200">Akıllı pozisyon sınırı (önerilen).</span>{' '}
                                    Aday başına tüm uyumlu pozisyonlar yerine, ön eşleşmeye göre en iyi 5 pozisyon detaylı analize girer — süre ve AI maliyeti belirgin düşer, analiz kalitesi değişmez.
                                </span>
                            </label>
                        )}

                        {/* Targeted scan controls — shown only for 'filtered' scope */}
                        {scanScope === 'filtered' && (
                            <div className="space-y-2.5">
                                <p className="text-[10px] font-black text-navy-400 uppercase tracking-widest">Hedef Pozisyon & Skor Eşiği</p>
                                <select
                                    value={targetPositionId}
                                    onChange={e => setTargetPositionId(e.target.value)}
                                    className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white outline-none focus:border-emerald-400/40 transition-colors"
                                >
                                    <option value="" className="bg-navy-900">— Pozisyon seçin —</option>
                                    {positions.filter(p => p.status === 'open').map(p => (
                                        <option key={p.id} value={p.id} className="bg-navy-900">{p.title}</option>
                                    ))}
                                </select>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <label className="flex items-center gap-2 text-xs text-navy-400">
                                        Min. ön skor
                                        <input
                                            type="number" min="0" max="100"
                                            value={minPreScore}
                                            onChange={e => setMinPreScore(e.target.value)}
                                            className="w-20 px-2 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white outline-none focus:border-emerald-400/40 transition-colors"
                                        />
                                    </label>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-navy-400 uppercase tracking-widest mb-1.5">Kimler Dahil Edilsin?</p>
                                    <div className="space-y-1">
                                        {[
                                            { id: 'never_analyzed', label: 'Hiç detaylı analizi olmayanlar (önerilen)', desc: 'Daha önce otonom taramadan geçmiş kayıtlar tekrar analiz edilmez' },
                                            { id: 'not_for_position', label: 'Bu pozisyon için analiz edilmemişler', desc: 'Başka pozisyon için analiz edilmiş olsa bile bu pozisyon için analiz edilir' },
                                            { id: 'all', label: 'Eşiği geçen herkes', desc: 'Önceki analizler dahil hepsi yeniden analiz edilir — en yüksek maliyet' },
                                        ].map(opt => (
                                            <label key={opt.id} className={`flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${filteredInclusion === opt.id ? 'bg-emerald-400/10 border-emerald-400/30' : 'bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.05]'}`}>
                                                <input
                                                    type="radio"
                                                    name="filtered-inclusion"
                                                    checked={filteredInclusion === opt.id}
                                                    onChange={() => setFilteredInclusion(opt.id)}
                                                    className="accent-emerald-400 mt-0.5"
                                                />
                                                <span className="text-xs leading-relaxed">
                                                    <span className={`font-bold ${filteredInclusion === opt.id ? 'text-emerald-400' : 'text-navy-300'}`}>{opt.label}</span>
                                                    <span className="block text-navy-500">{opt.desc}</span>
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <p className="text-xs text-navy-500">
                                    {targetPosition
                                        ? `${filteredQueue.length} aday kriterlere uyuyor (ön skor ≥ ${minPreScore || 0}). Yalnızca "${targetPosition.title}" pozisyonu için detaylı analiz yapılacak.`
                                        : 'Uyan aday sayısını görmek için bir pozisyon seçin.'}
                                </p>
                            </div>
                        )}

                        {/* Candidate checklist — shown only for 'selected' scope */}
                        {scanScope === 'selected' && (
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] font-black text-navy-400 uppercase tracking-widest">
                                        Aday Seçimi
                                        {selectedIds.size > 0 && (
                                            <span className="ml-2 text-violet-400">{selectedIds.size} seçili</span>
                                        )}
                                    </p>
                                    <button
                                        onClick={toggleAll}
                                        className="text-[10px] font-bold text-navy-400 hover:text-white transition-colors"
                                    >
                                        {allSelected ? 'Tümünü Kaldır' : 'Tümünü Seç'}
                                    </button>
                                </div>

                                {/* Search */}
                                <div className="relative mb-2">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-navy-500" />
                                    <input
                                        type="text"
                                        placeholder="Aday ara..."
                                        value={candidateSearch}
                                        onChange={e => setCandidateSearch(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white placeholder:text-navy-500 outline-none focus:border-violet-400/40 transition-colors"
                                    />
                                </div>

                                {/* Candidate list */}
                                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                    {filteredForSelection.length === 0 && (
                                        <p className="text-center text-navy-500 text-xs py-3">Aday bulunamadı</p>
                                    )}
                                    {filteredForSelection.map(c => {
                                        const checked  = selectedIds.has(c.id);
                                        const hasStars = !!c.aiAnalysis?.starAnalysis;
                                        return (
                                            <button
                                                key={c.id}
                                                onClick={() => toggleCandidate(c.id)}
                                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all ${
                                                    checked
                                                        ? 'bg-violet-400/10 border-violet-400/30'
                                                        : 'bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.05]'
                                                }`}
                                            >
                                                <div className={`w-4 h-4 shrink-0 ${checked ? 'text-violet-400' : 'text-navy-500'}`}>
                                                    {checked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                                </div>
                                                <div className="w-7 h-7 rounded-full bg-navy-800 flex items-center justify-center shrink-0 text-xs font-bold text-white">
                                                    {c.name?.[0] || '?'}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-white truncate">{c.name}</p>
                                                    <p className="text-xs text-navy-400 truncate">{c.position || '—'}</p>
                                                </div>
                                                <div className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                                                    hasStars
                                                        ? 'bg-emerald-400/10 text-emerald-400'
                                                        : 'bg-white/[0.04] text-navy-500'
                                                }`}>
                                                    {hasStars ? '✓ Analiz' : 'Yeni'}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Summary strip */}
                        {queuedCount > 0 && (
                            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 flex items-center justify-between">
                                <span className="text-xs text-navy-300">İşlenecek aday</span>
                                <span className="text-sm font-bold text-white">{queuedCount} / {candidates.length}</span>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-3.5 border-t border-white/5 flex gap-2 shrink-0">
                        <button
                            onClick={() => setShowConfirm(false)}
                            className="flex-1 py-2.5 rounded-xl border border-white/10 text-navy-300 hover:text-white font-medium transition-all"
                        >
                            İptal
                        </button>
                        <button
                            onClick={() => handleScan(scanScope, selectedIds)}
                            disabled={!canStart}
                            className="flex-1 py-2.5 rounded-xl bg-electric text-text-primary font-bold hover:bg-electric-hover transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Play className="w-4 h-4 fill-current" /> Başlat
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        );
    }

    // ── Trigger button ──────────────────────────────────────────────────────
    return (
        <>
            <button
                onClick={() => scanning ? setShowMonitor(true) : setShowConfirm(true)}
                className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all relative group overflow-hidden ${
                    scanning
                        ? 'bg-electric/10 border-electric/30 text-electric'
                        : 'bg-white/[0.04] border-white/[0.06] text-navy-400 hover:text-white hover:bg-white/[0.08]'
                }`}
                title="Sistem Taraması"
            >
                {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {scanning && <span className="absolute inset-0 bg-electric/10 animate-pulse" />}
            </button>

            {/* Scan Monitor Modal */}
            {showMonitor && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-navy-900 border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col relative mx-auto my-auto">

                        {/* Status Header */}
                        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-navy-800/50">
                            <div>
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                    {scanning ? (
                                        <>
                                            <span className="relative flex h-3 w-3">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-electric opacity-75" />
                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-electric" />
                                            </span>
                                            Sistem Taraması Sürüyor...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle className="w-5 h-5 text-emerald-400" />
                                            Tarama Tamamlandı
                                        </>
                                    )}
                                </h2>
                                <p className="text-xs text-navy-400 mt-1">
                                    {scanning ? 'Ajanlar aktif olarak analiz yapıyor.' : 'Tüm işlemler başarıyla tamamlandı.'}
                                </p>
                            </div>
                            <button onClick={handleStop} className="p-2 hover:bg-white/5 rounded-lg text-navy-400 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Progress Bar */}
                        <div className="h-1 bg-navy-950 w-full">
                            <div
                                className="h-full bg-gradient-to-r from-electric to-emerald-400 transition-all duration-300 ease-out"
                                style={{ width: `${progress}%` }}
                            />
                        </div>

                        {/* Main Content */}
                        <div className="p-8 flex flex-col items-center justify-center min-h-[280px]">
                            {scanning && currentCandidate ? (
                                <div className="flex flex-col items-center animate-in zoom-in-95 duration-300">
                                    <div className="w-20 h-20 rounded-full bg-navy-800 border-4 border-navy-700 flex items-center justify-center mb-4 relative">
                                        <span className="text-2xl font-bold text-white">{currentCandidate.name?.[0]}</span>
                                        <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-navy-900 border border-white/10 flex items-center justify-center shadow-lg">
                                            {activeStage === 'scout'      && <Eye         className="w-4 h-4 text-blue-400 animate-pulse" />}
                                            {activeStage === 'researcher' && <GitBranch   className="w-4 h-4 text-cyan-400 animate-pulse" />}
                                            {activeStage === 'analyst'    && <Brain       className="w-4 h-4 text-purple-400 animate-pulse" />}
                                            {activeStage === 'engagement' && <MessageSquare className="w-4 h-4 text-orange-400 animate-pulse" />}
                                            {activeStage === 'recruiter'  && <Database    className="w-4 h-4 text-emerald-400 animate-pulse" />}
                                        </div>
                                    </div>
                                    <h3 className="text-xl font-bold text-white mb-1">{currentCandidate.name}</h3>
                                    <p className="text-sm text-navy-400 mb-6">{currentCandidate.position}</p>
                                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
                                        <Loader2 className="w-4 h-4 animate-spin text-electric" />
                                        <span className="text-sm font-medium text-electric-light uppercase tracking-wide">
                                            {activeStage === 'scout'      && 'Profil Taranıyor...'}
                                            {activeStage === 'researcher' && 'Veri Zenginleştiriliyor...'}
                                            {activeStage === 'analyst'    && 'Yapay Zeka Analizi...'}
                                            {activeStage === 'engagement' && 'Mülakat Uygunluğu...'}
                                            {activeStage === 'recruiter'  && 'Veritabanı Güncelleniyor...'}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center animate-in fade-in slide-in-from-bottom-4">
                                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                                        <CheckCircle className="w-8 h-8 text-emerald-400" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-white mb-2">İşlem Tamamlandı</h3>
                                    <p className="text-navy-400 mb-8 max-w-sm">
                                        {totalQueued} aday tarandı. {aiCount} yeni AI analizi yapıldı ve {updatedCount} profil güncellendi.
                                    </p>
                                    <button
                                        onClick={handleStop}
                                        className="px-8 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-all"
                                    >
                                        Kapat
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Stats Footer */}
                        <div className="grid grid-cols-3 divide-x divide-white/5 border-t border-white/5 bg-navy-950/30">
                            <div className="p-3 text-center">
                                <div className="text-xs text-navy-500 uppercase font-bold tracking-wider mb-1">Taranan</div>
                                <div className="text-xl font-bold text-white">{processedCount} / {totalQueued}</div>
                            </div>
                            <div className="p-3 text-center">
                                <div className="text-xs text-navy-500 uppercase font-bold tracking-wider mb-1">AI Analiz</div>
                                <div className="text-xl font-bold text-electric">{aiCount}</div>
                            </div>
                            <div className="p-3 text-center">
                                <div className="text-xs text-navy-500 uppercase font-bold tracking-wider mb-1">Güncellenen</div>
                                <div className="text-xl font-bold text-emerald-400">{updatedCount}</div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
