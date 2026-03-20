import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    RefreshCw, Play, Loader2, CheckCircle, Brain, Database,
    X, Eye, GitBranch, MessageSquare, Search, Users, Zap, CheckSquare, Square
} from 'lucide-react';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import { findBestPositionMatch, filterPositionsByDomain } from '../services/matchService';
import { analyzeCandidateMatch } from '../services/geminiService';
import { useNotifications } from '../context/NotificationContext';

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
    const [scanScope, setScanScope]         = useState('unanalyzed'); // 'unanalyzed' | 'all' | 'selected'
    const [selectedIds, setSelectedIds]     = useState(new Set());
    const [candidateSearch, setCandidateSearch] = useState('');

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

    const queuedCount =
        scanScope === 'unanalyzed' ? unanalyzedCandidates.length :
        scanScope === 'all'        ? candidates.length :
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

            for (let i = 0; i < queue.length; i++) {
                if (!isScanningRef.current) break;

                const candidate = queue[i];
                setCurrentCandidate(candidate);
                setProgress((i / queue.length) * 100);

                // ── Stage 1: Scout ─────────────────────────────────────────
                setActiveStage('scout');
                await new Promise(r => setTimeout(r, 50));
                const compatiblePositions = filterPositionsByDomain(candidate, openPositions);
                const bestMatch = findBestPositionMatch(candidate, compatiblePositions);

                const updates = {};
                let needsUpdate = false;

                // ── Stage 2: Researcher ────────────────────────────────────
                if (bestMatch && (bestMatch.matchScore || 0) > 5) {
                    setActiveStage('researcher');
                    await new Promise(r => setTimeout(r, 80));
                }

                // ── Stage 3: Analyst ───────────────────────────────────────
                const hasManualOverride = candidate.manualScore && candidate.scoringStage !== 'initial';
                const shouldAnalyze = forceAnalyze || !hasManualOverride;

                if (shouldAnalyze) {
                    setActiveStage('analyst');

                    try {
                        const updatedAnalyses = { ...(candidate.positionAnalyses || {}) };
                        let highestScore = -1;
                        let bestResult   = null;
                        let bestTitle    = candidate.matchedPositionTitle;

                        const positionsToAnalyze = forceAnalyze
                            ? compatiblePositions
                            : [bestMatch || compatiblePositions[0]].filter(Boolean);

                        for (const pos of positionsToAnalyze) {
                            if (!pos) continue;
                            const jobDesc = `${pos.title}\n${(pos.requirements || []).join(', ')}\n${pos.description || ''}`;
                            try {
                                const result = await analyzeCandidateMatch(jobDesc, candidate, 'gemini-2.0-flash');
                                updatedAnalyses[pos.title] = result;
                                setAiCount(prev => prev + 1);

                                if (result.score > highestScore) {
                                    highestScore = result.score;
                                    bestResult   = result;
                                    bestTitle    = pos.title;
                                }
                            } catch (e) {
                                console.error('AI Error for pos', pos.title, e);
                            }
                        }

                        if (bestResult) {
                            updates.aiAnalysis = {
                                ...bestResult,
                                lastAnalyzedAt:      new Date().toISOString(),
                                analyzedForPosition: bestTitle,
                            };
                            updates.summary              = bestResult.summary;
                            updates.matchScore           = bestResult.score;
                            updates.aiScore              = bestResult.score;
                            updates.matchedPositionTitle = bestTitle;
                            updates.positionAnalyses     = updatedAnalyses;
                        }

                        updates.lastScannedAt = new Date().toISOString();
                        needsUpdate = true;

                        await new Promise(r => setTimeout(r, 800));

                    } catch (aiErr) {
                        console.error('AI Error:', aiErr);
                        if (bestMatch) {
                            updates.matchScore           = bestMatch.matchScore;
                            updates.matchedPositionTitle = bestMatch.title;
                            needsUpdate = true;
                        }
                    }
                }

                // ── Stage 4: Engagement ────────────────────────────────────
                if (updates.matchScore && updates.matchScore > 75) {
                    setActiveStage('engagement');
                    await new Promise(r => setTimeout(r, 80));
                }

                // ── Stage 5: Recruiter ─────────────────────────────────────
                if (needsUpdate) {
                    setActiveStage('recruiter');
                    await updateCandidate(candidate.id, updates);
                    setUpdatedCount(prev => prev + 1);
                }

                setProcessedCount(prev => prev + 1);
            }

            setProgress(100);
            setActiveStage(null);
            setCurrentCandidate(null);
            setScanning(false);
            isScanningRef.current = false;

            addNotification({
                title: 'Sistem Taraması Tamamlandı',
                message: `${queue.length} aday tarandı, ${aiCount} AI analizi gerçekleştirildi.`,
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
        const canStart    = scanScope !== 'selected' || selectedIds.size > 0;

        return createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-sm">
                <div className="bg-navy-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 mx-auto flex flex-col max-h-[90vh]">

                    {/* Header */}
                    <div className="p-5 border-b border-white/5 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-electric/10 flex items-center justify-center">
                                <Brain className="w-5 h-5 text-electric" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-text-primary">Sistem Taraması</h3>
                                <p className="text-xs text-navy-400">5 Aşamalı Otonom Ajan Sistemi</p>
                            </div>
                        </div>
                        <button onClick={() => setShowConfirm(false)} className="p-1.5 hover:bg-white/5 rounded-lg text-navy-400 hover:text-text-primary transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Scrollable body */}
                    <div className="overflow-y-auto flex-1 p-5 space-y-4">

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
                                        selectedIds.size;

                                    return (
                                        <button
                                            key={opt.id}
                                            onClick={() => setScanScope(opt.id)}
                                            className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
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
                                        className="text-[10px] font-bold text-navy-400 hover:text-text-primary transition-colors"
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
                                        className="w-full pl-9 pr-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-text-primary placeholder:text-navy-500 outline-none focus:border-violet-400/40 transition-colors"
                                    />
                                </div>

                                {/* Candidate list */}
                                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                    {filteredForSelection.length === 0 && (
                                        <p className="text-center text-navy-500 text-xs py-4">Aday bulunamadı</p>
                                    )}
                                    {filteredForSelection.map(c => {
                                        const checked  = selectedIds.has(c.id);
                                        const hasStars = !!c.aiAnalysis?.starAnalysis;
                                        return (
                                            <button
                                                key={c.id}
                                                onClick={() => toggleCandidate(c.id)}
                                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-all ${
                                                    checked
                                                        ? 'bg-violet-400/10 border-violet-400/30'
                                                        : 'bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.05]'
                                                }`}
                                            >
                                                <div className={`w-4 h-4 shrink-0 ${checked ? 'text-violet-400' : 'text-navy-500'}`}>
                                                    {checked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                                </div>
                                                <div className="w-7 h-7 rounded-full bg-navy-800 flex items-center justify-center shrink-0 text-xs font-bold text-text-primary">
                                                    {c.name?.[0] || '?'}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-text-primary truncate">{c.name}</p>
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
                                <span className="text-xs text-navy-400">İşlenecek aday</span>
                                <span className="text-sm font-bold text-text-primary">{queuedCount} / {candidates.length}</span>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-5 border-t border-white/5 flex gap-3 shrink-0">
                        <button
                            onClick={() => setShowConfirm(false)}
                            className="flex-1 py-2.5 rounded-xl border border-white/10 text-navy-300 hover:text-text-primary font-medium transition-all"
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
                        : 'bg-white/[0.04] border-white/[0.06] text-navy-400 hover:text-text-primary hover:bg-white/[0.08]'
                }`}
                title="Sistem Taraması"
            >
                {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {scanning && <span className="absolute inset-0 bg-electric/10 animate-pulse" />}
            </button>

            {/* Scan Monitor Modal */}
            {showMonitor && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-navy-900 border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col relative mx-auto my-auto">

                        {/* Status Header */}
                        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-navy-800/50">
                            <div>
                                <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
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
                            <button onClick={handleStop} className="p-2 hover:bg-white/5 rounded-lg text-navy-400 hover:text-text-primary transition-colors">
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
                                        <span className="text-2xl font-bold text-text-primary">{currentCandidate.name?.[0]}</span>
                                        <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-navy-900 border border-white/10 flex items-center justify-center shadow-lg">
                                            {activeStage === 'scout'      && <Eye         className="w-4 h-4 text-blue-400 animate-pulse" />}
                                            {activeStage === 'researcher' && <GitBranch   className="w-4 h-4 text-cyan-400 animate-pulse" />}
                                            {activeStage === 'analyst'    && <Brain       className="w-4 h-4 text-purple-400 animate-pulse" />}
                                            {activeStage === 'engagement' && <MessageSquare className="w-4 h-4 text-orange-400 animate-pulse" />}
                                            {activeStage === 'recruiter'  && <Database    className="w-4 h-4 text-emerald-400 animate-pulse" />}
                                        </div>
                                    </div>
                                    <h3 className="text-xl font-bold text-text-primary mb-1">{currentCandidate.name}</h3>
                                    <p className="text-sm text-navy-400 mb-6">{currentCandidate.position}</p>
                                    <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10">
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
                                    <h3 className="text-2xl font-bold text-text-primary mb-2">İşlem Tamamlandı</h3>
                                    <p className="text-navy-400 mb-8 max-w-sm">
                                        {totalQueued} aday tarandı. {aiCount} yeni AI analizi yapıldı ve {updatedCount} profil güncellendi.
                                    </p>
                                    <button
                                        onClick={handleStop}
                                        className="px-8 py-3 rounded-xl bg-white/5 border border-white/10 text-text-primary font-bold hover:bg-white/10 transition-all"
                                    >
                                        Kapat
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Stats Footer */}
                        <div className="grid grid-cols-3 divide-x divide-white/5 border-t border-white/5 bg-navy-950/30">
                            <div className="p-4 text-center">
                                <div className="text-xs text-navy-500 uppercase font-bold tracking-wider mb-1">Taranan</div>
                                <div className="text-xl font-bold text-text-primary">{processedCount} / {totalQueued}</div>
                            </div>
                            <div className="p-4 text-center">
                                <div className="text-xs text-navy-500 uppercase font-bold tracking-wider mb-1">AI Analiz</div>
                                <div className="text-xl font-bold text-electric">{aiCount}</div>
                            </div>
                            <div className="p-4 text-center">
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
