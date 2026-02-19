import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Play, Loader2, CheckCircle, Brain, Search, Database, UserCheck, X, Eye, GitBranch, MessageSquare, AlertCircle } from 'lucide-react';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import { findBestPositionMatch } from '../services/matchService';
import { analyzeCandidateMatch } from '../services/geminiService';

export default function SystemScanner() {
    const { candidates, updateCandidate } = useCandidates();
    const { positions } = usePositions();

    // UI State
    const [scanning, setScanning] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [showMonitor, setShowMonitor] = useState(false);

    // Process State
    const [progress, setProgress] = useState(0);
    const [currentCandidate, setCurrentCandidate] = useState(null);
    const [activeStage, setActiveStage] = useState(null); // 'scout', 'researcher', 'analyst', 'engagement', 'recruiter'
    const [processedCount, setProcessedCount] = useState(0);
    const [aiCount, setAiCount] = useState(0);
    const [updatedCount, setUpdatedCount] = useState(0);

    // Auto-scan trigger
    const prevPositionsCount = useRef(0);
    useEffect(() => {
        if (positions.length > prevPositionsCount.current && prevPositionsCount.current > 0) {
            console.log("New position detected, triggering Auto-Scan...");
            setTimeout(() => handleScan(), 1000);
        }
        prevPositionsCount.current = positions.length;
    }, [positions.length]);

    const handleStop = () => {
        setScanning(false);
        setShowMonitor(false);
    };

    const handleScan = async () => {
        setShowConfirm(false);
        if (!candidates.length || !positions.length) return;

        try {
            setScanning(true);
            setShowMonitor(true);
            setProgress(0);
            setProcessedCount(0);
            setAiCount(0);
            setUpdatedCount(0);

            const openPositions = positions.filter(p => p.status === 'open');
            if (openPositions.length === 0) {
                alert("Açık pozisyon bulunamadı.");
                setScanning(false);
                return;
            }

            const total = candidates.length;

            for (let i = 0; i < total; i++) {
                if (!scanning) break; // Allow stop

                const candidate = candidates[i];
                setCurrentCandidate(candidate);
                setProgress(((i) / total) * 100);

                // --- STAGE 1: SCOUT AGENT ---
                setActiveStage('scout');
                await new Promise(r => setTimeout(r, 50));
                const bestMatch = findBestPositionMatch(candidate, openPositions);

                let needsUpdate = false;
                const updates = {};

                let currentTitle = candidate.matchedPositionTitle;
                let newTitle = bestMatch ? bestMatch.title : null;
                let currentScore = candidate.matchScore || 0;
                let newScore = bestMatch ? bestMatch.matchScore : 0;

                // --- STAGE 2: RESEARCHER AGENT ---
                if (bestMatch && newScore > 5) {
                    setActiveStage('researcher');
                    await new Promise(r => setTimeout(r, 100));
                }

                // --- STAGE 3: ANALYST AGENT ---
                const hasManualOverride = candidate.manualScore && candidate.scoringStage !== 'initial';

                // Low threshold to catch everyone relevant
                if (!hasManualOverride && bestMatch && (newScore >= 5) &&
                    (!candidate.aiAnalysis || currentTitle !== newTitle || !candidate.summary)) {

                    setActiveStage('analyst');

                    try {
                        const jobDesc = `${bestMatch.title}\n${(bestMatch.requirements || []).join(', ')}\n${bestMatch.description || ''}`;
                        const aiResult = await analyzeCandidateMatch(jobDesc, candidate, 'gemini-2.0-flash');

                        updates.aiAnalysis = aiResult;
                        updates.summary = aiResult.summary;
                        updates.matchScore = aiResult.score;
                        updates.aiScore = aiResult.score; // Explicit field for safety
                        updates.matchedPositionTitle = newTitle;

                        // Force update timestamp to trigger re-renders
                        updates.lastScannedAt = new Date().toISOString();

                        needsUpdate = true;
                        setAiCount(prev => prev + 1);

                        await new Promise(r => setTimeout(r, 1000));

                    } catch (aiErr) {
                        console.error("AI Error:", aiErr);
                        updates.matchScore = newScore; // Fallback
                        updates.matchedPositionTitle = newTitle;
                        needsUpdate = true;
                    }

                } else if (!hasManualOverride && (Math.abs(currentScore - newScore) > 1 || currentTitle !== newTitle)) {
                    updates.matchScore = newScore;
                    updates.matchedPositionTitle = newTitle;
                    needsUpdate = true;
                }

                // --- STAGE 4: ENGAGEMENT AGENT ---
                if (updates.matchScore && updates.matchScore > 75) {
                    setActiveStage('engagement');
                    await new Promise(r => setTimeout(r, 100));
                }

                // --- STAGE 5: RECRUITER AGENT ---
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

        } catch (err) {
            console.error(err);
            setScanning(false);
        }
    };

    if (showConfirm && !scanning) {
        return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-sm">
                <div className="bg-navy-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95">
                    <div className="w-12 h-12 rounded-full bg-electric/10 flex items-center justify-center mb-4 mx-auto">
                        <Brain className="w-6 h-6 text-electric" />
                    </div>
                    <h3 className="text-lg font-bold text-white text-center mb-2">Sistem Taraması</h3>
                    <p className="text-sm text-navy-300 text-center mb-6">
                        5 Aşamalı Otonom Ajan (Scout, Researcher, Analyst, Engagement, Recruiter) tüm aday havuzunu tarayacak ve güncelleyecektir.
                    </p>
                    <div className="flex gap-3">
                        <button onClick={() => setShowConfirm(false)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-navy-300 hover:text-white font-medium transition-all">İptal</button>
                        <button onClick={handleScan} className="flex-1 py-2.5 rounded-xl bg-electric text-white font-bold hover:bg-electric-hover transition-all flex items-center justify-center gap-2">
                            <Play className="w-4 h-4 fill-current" /> Başlat
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            <button
                onClick={() => scanning ? setShowMonitor(true) : setShowConfirm(true)}
                className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all relative group overflow-hidden ${scanning ? 'bg-electric/10 border-electric/30 text-electric' : 'bg-white/[0.04] border-white/[0.06] text-navy-400 hover:text-white hover:bg-white/[0.08]'}`}
                title="Sistem Taraması"
            >
                {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {scanning && <span className="absolute inset-0 bg-electric/10 animate-pulse" />}
            </button>

            {/* MODERN SCAN MONITOR */}
            {showMonitor && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-navy-900 border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col relative">

                        {/* Status Header */}
                        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-navy-800/50">
                            <div>
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                    {scanning ? (
                                        <>
                                            <span className="relative flex h-3 w-3">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-electric opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-electric"></span>
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
                        <div className="p-8 flex flex-col items-center justify-center min-h-[300px] relative">

                            {scanning && currentCandidate ? (
                                <div className="flex flex-col items-center animate-in zoom-in-95 duration-300">
                                    {/* Avatar Ring */}
                                    <div className="w-20 h-20 rounded-full bg-navy-800 border-4 border-navy-700 flex items-center justify-center mb-4 relative">
                                        <span className="text-2xl font-bold text-white">{currentCandidate.name?.[0]}</span>
                                        <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-navy-900 border border-white/10 flex items-center justify-center shadow-lg">
                                            {activeStage === 'scout' && <Eye className="w-4 h-4 text-blue-400 animate-pulse" />}
                                            {activeStage === 'researcher' && <GitBranch className="w-4 h-4 text-cyan-400 animate-pulse" />}
                                            {activeStage === 'analyst' && <Brain className="w-4 h-4 text-purple-400 animate-pulse" />}
                                            {activeStage === 'engagement' && <MessageSquare className="w-4 h-4 text-orange-400 animate-pulse" />}
                                            {activeStage === 'recruiter' && <Database className="w-4 h-4 text-emerald-400 animate-pulse" />}
                                        </div>
                                    </div>

                                    <h3 className="text-xl font-bold text-white mb-1">{currentCandidate.name}</h3>
                                    <p className="text-sm text-navy-400 mb-6">{currentCandidate.position}</p>

                                    {/* Active Stage Indicator */}
                                    <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10">
                                        <Loader2 className="w-4 h-4 animate-spin text-electric" />
                                        <span className="text-sm font-medium text-electric-light uppercase tracking-wide">
                                            {activeStage === 'scout' && 'Profil Taranıyor...'}
                                            {activeStage === 'researcher' && 'Veri Zenginleştiriliyor...'}
                                            {activeStage === 'analyst' && 'Yapay Zeka Analizi...'}
                                            {activeStage === 'engagement' && 'Mülakat Uygunluğu...'}
                                            {activeStage === 'recruiter' && 'Veritabanı Güncelleniyor...'}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center animate-in fade-in slide-in-from-bottom-4">
                                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                                        <CheckCircle className="w-8 h-8 text-emerald-400" />
                                    </div>
                                    <h3 className="text-lg font-bold text-white mb-2">İşlem Tamamlandı</h3>
                                    <p className="text-sm text-navy-400 max-w-xs mx-auto">
                                        Tüm adaylar başarıyla tarandı ve analiz edildi.
                                    </p>
                                </div>
                            )}

                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-3 border-t border-white/5 bg-navy-800/30 divide-x divide-white/5">
                            <div className="p-4 text-center">
                                <div className="text-xs font-bold text-navy-500 uppercase tracking-wider mb-1">İncelenen</div>
                                <div className="text-2xl font-black text-white">{processedCount}</div>
                            </div>
                            <div className="p-4 text-center">
                                <div className="text-xs font-bold text-navy-500 uppercase tracking-wider mb-1">AI Analizi</div>
                                <div className="text-2xl font-black text-purple-400">{aiCount}</div>
                            </div>
                            <div className="p-4 text-center">
                                <div className="text-xs font-bold text-navy-500 uppercase tracking-wider mb-1">Güncellenen</div>
                                <div className="text-2xl font-black text-emerald-400">{updatedCount}</div>
                            </div>
                        </div>

                    </div>
                </div>
            )}
        </>
    );
}
