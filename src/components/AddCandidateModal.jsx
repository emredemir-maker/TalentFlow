// src/components/AddCandidateModal.jsx
import { useState, useRef } from 'react';
import { X, Upload, FileText, Check, AlertCircle, Loader2, Trash2, Files, Sparkles } from 'lucide-react';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import { calculateMatchScore } from '../services/matchService';
import { analyzeCandidateMatch } from '../services/geminiService';
import { useNotifications } from '../context/NotificationContext';


export default function AddCandidateModal({ isOpen, onClose }) {
    const { addCandidate } = useCandidates();
    const { addNotification } = useNotifications();
    const { positions } = usePositions();
    const openPositions = positions.filter(p => p.status === 'open');
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [results, setResults] = useState(null); // { results: [{fileName, candidate, success, error}] }
    const fileInputRef = useRef(null);

    if (!isOpen) return null;

    const handleFileChange = (e) => {
        const selectedFiles = Array.from(e.target.files);
        if (selectedFiles.length > 0) {
            const validFiles = selectedFiles.filter(file => {
                if (file.size > 30 * 1024 * 1024) {
                    setError(`"${file.name}" 30MB'dan büyük olduğu için elendi.`);

                    return false;
                }
                return true;
            });
            setFiles(prev => [...prev, ...validFiles]);
            setError(null);
        }
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleUpload = async () => {
        if (files.length === 0) return;

        setLoading(true);
        setError(null);
        setResults(null);

        const formData = new FormData();
        files.forEach(file => {
            formData.append('cvs', file);
        });

        try {
            const response = await fetch('http://localhost:3001/api/process-cv', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'CV\'ler işlenirken bir hata oluştu.');
            }

            // --- Otonom AI Matching Start ---
            const processedResults = await Promise.all(data.results.map(async (res) => {
                if (!res.success) return res;


                // 1. First, find candidate candidates using semantic logic to save tokens/time
                let candidates = openPositions.map(pos => ({
                    pos,
                    static: calculateMatchScore(res.candidate, pos)
                })).sort((a, b) => b.static.score - a.static.score);

                // 2. Take the best static match and confirm with Otonom AI (Quick Score)
                const topCandidate = candidates[0];
                if (topCandidate && topCandidate.static.score > 0) {
                    try {
                        const jobText = `${topCandidate.pos.title}\n${topCandidate.pos.requirements?.join(', ')}`;
                        const aiQuick = await analyzeCandidateMatch(jobText, res.candidate);

                        return {
                            ...res,
                            match: {
                                ...topCandidate.pos,
                                score: aiQuick.score,
                                aiInsight: aiQuick.summary
                            }
                        };
                    } catch (aiErr) {
                        console.warn('[AddCandidateModal] Otonom AI Hatası, statik veriye dönülüyor:', aiErr);
                        return {
                            ...res,
                            match: { ...topCandidate.pos, score: topCandidate.static.score }
                        };
                    }
                }

                return { ...res, match: null };
            }));

            setResults(processedResults);

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveAll = async () => {
        if (!results) return;

        setLoading(true);
        try {
            const successfulOnes = results.filter(r => r.success && r.candidate);

            await Promise.all(successfulOnes.map(async (r, idx) => {
                try {
                    const candidateData = {
                        ...r.candidate,
                        status: 'ai_analysis',

                        matchScore: r.match ? r.match.score : 0,
                        matchedPositionTitle: r.match ? r.match.title : null,
                        initialAiScore: r.match ? r.match.score : 0,
                        scoringStage: 'initial',
                        aiAnalysis: r.match ? {
                            score: r.match.score,
                            summary: r.match.aiInsight || 'Ön AI taraması yapıldı.'
                        } : null,

                        appliedDate: new Date().toISOString().split('T')[0],
                        source: 'Bulk CV Upload'
                    };

                    await addCandidate(candidateData);

                } catch (candidateErr) {
                    console.error(`[AddCandidateModal] Failed to save candidate #${idx + 1}:`, candidateErr);
                    throw candidateErr;
                }
            }));

            onClose();
            // Reset state
            setFiles([]);
            setResults(null);
        } catch (err) {
            setError('Adaylar kaydedilirken hata oluştu: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

            <div className="relative w-full max-w-2xl bg-navy-900 rounded-3xl overflow-hidden shadow-2xl border border-border-subtle animate-in fade-in zoom-in duration-300">
                <div className="p-6 border-b border-border-subtle flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-text-primary">Toplu Aday Ekle</h2>
                        <p className="text-sm text-text-muted">Birden fazla PDF veya Word CV yükleyin.</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-navy-800/20 text-text-muted transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    {!results ? (
                        <div className="space-y-6">
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className={`group relative border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer
                                    ${files.length > 0 ? 'border-electric/50 bg-electric/5' : 'border-border-subtle hover:border-electric/30 hover:bg-navy-800/10'}`}
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    accept=".pdf,.docx"
                                    multiple
                                    className="hidden"
                                />
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${files.length > 0 ? 'bg-electric text-white' : 'bg-navy-800/20 text-text-muted group-hover:text-electric'}`}>
                                    {files.length > 0 ? <Files className="w-7 h-7" /> : <Upload className="w-7 h-7" />}
                                </div>
                                <div className="text-center">
                                    <p className="text-text-primary font-medium">{files.length > 0 ? `${files.length} Dosya Seçildi` : 'Dosyaları Seçin veya Sürükleyin'}</p>
                                    <p className="text-xs text-text-muted mt-1">PDF, DOCX (Max 30MB/Dosya)</p>
                                </div>

                            </div>

                            {files.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs font-bold text-text-muted uppercase tracking-widest pl-1">Yüklenecek Dosyalar</p>
                                    <div className="grid grid-cols-1 gap-2">
                                        {files.map((f, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-navy-800/10 border border-border-subtle group">
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <FileText className="w-4 h-4 text-electric shrink-0" />
                                                    <span className="text-sm text-text-secondary truncate">{f.name}</span>
                                                    <span className="text-[10px] text-text-muted shrink-0">({(f.size / 1024 / 1024).toFixed(2)} MB)</span>
                                                </div>
                                                <button onClick={(e) => { e.stopPropagation(); removeFile(idx); }} className="p-1.5 rounded-lg hover:bg-red-500/20 text-text-muted hover:text-red-400 transition-all opacity-0 group-hover:opacity-100">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {error && (
                                <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                    <AlertCircle className="w-5 h-5 shrink-0" />
                                    <p>{error}</p>
                                </div>
                            )}

                            <button
                                onClick={handleUpload}
                                disabled={files.length === 0 || loading}
                                className="w-full py-4 rounded-2xl bg-gradient-to-r from-electric to-blue-600 text-white font-bold shadow-xl shadow-electric/20 hover:shadow-electric/40 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>Yapay Zeka Hepsi Üzerinde Çalışıyor...</span>
                                    </>
                                ) : (
                                    <>
                                        <Check className="w-5 h-5" />
                                        <span>Seçilenleri Analiz Et</span>
                                    </>
                                )}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="space-y-3">
                                <p className="text-xs font-bold text-text-muted uppercase tracking-widest pl-1">Analiz Sonuçları</p>
                                <div className="grid grid-cols-1 gap-3">
                                    {results.map((res, idx) => (
                                        <div key={idx} className={`p-4 rounded-2xl border transition-all ${res.success ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${res.success ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                                                        {res.success ? <Check className="w-5 h-5 stroke-[3]" /> : <X className="w-5 h-5" />}
                                                    </div>
                                                    <div className="overflow-hidden">
                                                        <p className="text-sm font-bold text-text-primary truncate">{res.success ? res.candidate.name : res.fileName}</p>
                                                        <p className="text-xs text-text-muted truncate">{res.success ? res.candidate.position : res.error}</p>
                                                    </div>
                                                </div>
                                                {res.success && (
                                                    <div className="flex flex-col items-end gap-2 shrink-0">
                                                        <span className="px-2 py-0.5 rounded-md bg-electric/10 border border-electric/20 text-[10px] text-electric-light font-bold">Otonom Tarama Ok</span>
                                                        {res.match ? (
                                                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                                                                <Sparkles className="w-3 h-3 text-emerald-400" />
                                                                <span className="text-[10px] font-bold text-emerald-400">%{res.match.score} {res.match.title} Uyumu</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-[10px] text-text-muted italic">Uygun Pozisyon Bulunamadı</span>
                                                        )}
                                                    </div>

                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setResults(null)}
                                    className="flex-1 py-4 rounded-2xl bg-navy-800/10 hover:bg-navy-800/20 text-text-primary font-bold transition-all border border-border-subtle"
                                >
                                    Geri Dön
                                </button>
                                <button
                                    onClick={handleSaveAll}
                                    disabled={loading || !results.some(r => r.success)}
                                    className="flex-1 py-4 rounded-2xl bg-electric text-white font-bold shadow-xl shadow-electric/20 hover:shadow-electric/40 transition-all flex items-center justify-center gap-2"
                                >
                                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                                    <span>Tümünü Havuza Ekle</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
