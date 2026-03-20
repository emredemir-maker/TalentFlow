// src/components/AddCandidateModal.jsx
import { useState, useRef } from 'react';
import {
    X, Upload, FileText, Check, AlertCircle, Loader2, Trash2, Files,
    Sparkles, Users, Building2, Briefcase, Globe, ChevronRight, ChevronLeft,
} from 'lucide-react';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import { calculateMatchScore } from '../services/matchService';
import { analyzeCandidateMatch, parseCandidateFromText } from '../services/geminiService';
import { extractTextFromFile } from '../services/cvParser';
import { storage } from '../config/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNotifications } from '../context/NotificationContext';

const SOURCES = [
    { id: 'İnsan Kaynakları', label: 'Doğrudan Başvuru', sub: 'İç havuz / doğrudan başvuru', icon: Users, color: '#3B82F6' },
    { id: 'Referans', label: 'Çalışan Referansı', sub: 'İç referans programı', icon: Users, color: '#8B5CF6' },
    { id: 'İşe Alım Firması', label: 'İşe Alım Firması', sub: 'Michael Page, Hays vb.', icon: Building2, color: '#F59E0B' },
    { id: 'Kariyer Portalı', label: 'Kariyer Portalı', sub: 'Kariyer.net, Yenibiriş vb.', icon: Briefcase, color: '#10B981' },
    { id: 'Sosyal Medya', label: 'Sosyal Medya', sub: 'LinkedIn, Twitter vb.', icon: Globe, color: '#EC4899' },
];

const STEPS = ['Dosya Yükleme', 'Kaynak Seçimi', 'Onayla'];

function ScoreRing({ score }) {
    const color = score >= 85 ? '#10B981' : score >= 70 ? '#3B82F6' : '#F59E0B';
    return (
        <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="20" fill="none" stroke="#F1F5F9" strokeWidth="4" />
                <circle
                    cx="24" cy="24" r="20" fill="none"
                    stroke={color} strokeWidth="4"
                    strokeDasharray={`${(score / 100) * 125.6} 125.6`}
                    strokeLinecap="round"
                />
            </svg>
            <span className="text-[11px] font-black" style={{ color }}>%{score}</span>
        </div>
    );
}

export default function AddCandidateModal({ isOpen, onClose }) {
    const { addCandidate } = useCandidates();
    const { addNotification } = useNotifications();
    const { positions } = usePositions();
    const openPositions = positions.filter(p => p.status === 'open');

    const [step, setStep] = useState(1);
    const [files, setFiles] = useState([]);
    const [sourceType, setSourceType] = useState('İnsan Kaynakları');
    const [sourceDetail, setSourceDetail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [results, setResults] = useState(null);
    const fileInputRef = useRef(null);

    if (!isOpen) return null;

    const handleClose = () => {
        onClose();
        setTimeout(() => {
            setStep(1);
            setFiles([]);
            setSourceType('İnsan Kaynakları');
            setSourceDetail('');
            setError(null);
            setResults(null);
        }, 300);
    };

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

        try {
            const resultsData = [];

            for (const file of files) {
                try {
                    const text = await extractTextFromFile(file);
                    if (!text || text.length < 50) {
                        resultsData.push({ fileName: file.name, error: 'İçerik okunamadı veya çok kısa', success: false });
                        continue;
                    }
                    const candidate = await parseCandidateFromText(text, 'gemini-2.0-flash');
                    if (!candidate) {
                        resultsData.push({ fileName: file.name, error: 'AI ayrıştırma hatası', success: false });
                        continue;
                    }
                    try {
                        const fileExtension = file.name.split('.').pop();
                        const uniqueName = `cvs/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExtension}`;
                        const storageRef = ref(storage, uniqueName);
                        await uploadBytes(storageRef, file);
                        candidate.cvUrl = await getDownloadURL(storageRef);
                    } catch (uploadError) {
                        console.error('Firebase Storage Upload Error:', uploadError);
                    }
                    resultsData.push({ fileName: file.name, candidate, success: true });
                } catch (err) {
                    console.error(`Error processing ${file.name}:`, err);
                    resultsData.push({ fileName: file.name, error: err.message, success: false });
                }
            }

            const processedResults = await Promise.all(resultsData.map(async (res) => {
                if (!res.success) return res;
                const candidates = openPositions.map(pos => ({
                    pos,
                    static: calculateMatchScore(res.candidate, pos),
                })).sort((a, b) => b.static.score - a.static.score);

                const topCandidate = candidates[0];
                if (topCandidate && topCandidate.static.score > 0) {
                    try {
                        const jobText = `${topCandidate.pos.title}\n${topCandidate.pos.requirements?.join(', ')}`;
                        const aiQuick = await analyzeCandidateMatch(jobText, res.candidate);
                        return {
                            ...res,
                            match: { ...topCandidate.pos, score: aiQuick.score, aiInsight: aiQuick.summary },
                        };
                    } catch {
                        return { ...res, match: { ...topCandidate.pos, score: topCandidate.static.score } };
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
                            summary: r.match.aiInsight || 'Ön AI taraması yapıldı.',
                        } : null,
                        appliedDate: new Date().toISOString().split('T')[0],
                        source: sourceType,
                        sourceDetail: sourceDetail || '',
                    };
                    await addCandidate(candidateData);
                } catch (candidateErr) {
                    console.error(`[AddCandidateModal] Failed to save candidate #${idx + 1}:`, candidateErr);
                    throw candidateErr;
                }
            }));
            handleClose();
        } catch (err) {
            setError('Adaylar kaydedilirken hata oluştu: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const selectedSource = SOURCES.find(s => s.id === sourceType);
    const needsDetail = ['İşe Alım Firması', 'Kariyer Portalı', 'Sosyal Medya', 'Referans'].includes(sourceType);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />

            <div className="relative w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl shadow-slate-300/40 border border-slate-100 animate-in fade-in zoom-in-95 duration-200">

                {/* HEADER */}
                <div className="px-7 pt-6 pb-0">
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h2 className="text-[17px] font-black text-[#0F172A] tracking-tight">
                                {results ? 'Analiz Tamamlandı' : 'Aday Ekle'}
                            </h2>
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                                {results
                                    ? `${results.filter(r => r.success).length} başarılı · ${results.filter(r => !r.success).length} hatalı`
                                    : `Adım ${step} / ${STEPS.length}`}
                            </p>
                        </div>
                        <button
                            onClick={handleClose}
                            className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* STEP INDICATOR */}
                    {!results && (
                        <div className="flex items-center gap-2 pb-5 border-b border-slate-100">
                            {STEPS.map((s, i) => {
                                const idx = i + 1;
                                const done = idx < step;
                                const active = idx === step;
                                return (
                                    <div key={i} className="flex items-center gap-2 flex-1">
                                        <div className="flex items-center gap-2 flex-1">
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 transition-all ${done ? 'bg-emerald-500 text-white' : active ? 'bg-[#1E3A8A] text-white' : 'bg-slate-100 text-slate-400'}`}>
                                                {done ? '✓' : idx}
                                            </div>
                                            <span className={`text-[10px] font-bold whitespace-nowrap ${active ? 'text-[#0F172A]' : done ? 'text-emerald-600' : 'text-slate-400'}`}>{s}</span>
                                        </div>
                                        {i < STEPS.length - 1 && (
                                            <div className={`flex-1 h-0.5 rounded-full mx-1 ${done ? 'bg-emerald-200' : 'bg-slate-100'}`} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* RESULTS SUMMARY BAR */}
                    {results && (
                        <div className="grid grid-cols-3 gap-3 pb-5 border-b border-slate-100">
                            {[
                                {
                                    label: 'Ort. Uyum Skoru',
                                    value: results.filter(r => r.success).length > 0
                                        ? `%${Math.round(results.filter(r => r.success).reduce((a, r) => a + (r.match?.score || 0), 0) / results.filter(r => r.success).length)}`
                                        : '—',
                                    color: 'text-blue-700',
                                },
                                { label: 'AI Tarama', value: 'Tamamlandı', color: 'text-emerald-600' },
                                { label: 'Kaydedilecek', value: `${results.filter(r => r.success).length} Aday`, color: 'text-violet-700' },
                            ].map((s, i) => (
                                <div key={i} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-center">
                                    <div className={`text-[12px] font-black ${s.color}`}>{s.value}</div>
                                    <div className="text-[8px] text-slate-400 font-medium mt-0.5">{s.label}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* BODY */}
                <div className="p-7 max-h-[60vh] overflow-y-auto space-y-5">

                    {/* RESULTS VIEW */}
                    {results && (
                        <div className="space-y-3">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">Sonuçlar</p>
                            {results.map((res, i) => (
                                <div key={i} className={`rounded-2xl border p-4 ${res.success ? 'bg-white border-slate-100 hover:border-slate-200' : 'bg-red-50/50 border-red-100'} transition-all`}>
                                    {res.success ? (
                                        <div className="flex items-start gap-4">
                                            <ScoreRing score={res.match?.score || 0} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2 mb-1">
                                                    <div>
                                                        <p className="text-[13px] font-bold text-[#0F172A]">{res.candidate.name}</p>
                                                        <p className="text-[10px] text-slate-500 font-medium">{res.candidate.position}</p>
                                                    </div>
                                                    <span className="inline-flex items-center gap-1 text-[8px] font-black px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full shrink-0">
                                                        <Sparkles className="w-2.5 h-2.5" />Otonom Tarama ✓
                                                    </span>
                                                </div>
                                                {res.match?.aiInsight && (
                                                    <p className="text-[10px] text-slate-400 leading-relaxed mb-2">{res.match.aiInsight}</p>
                                                )}
                                                {res.match && (
                                                    <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-600">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                                                        {res.match.title} eşleşmesi
                                                    </div>
                                                )}
                                                {!res.match && (
                                                    <p className="text-[9px] text-slate-400 italic">Uygun pozisyon bulunamadı</p>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 bg-red-100 border border-red-200 rounded-xl flex items-center justify-center shrink-0">
                                                <X className="w-4 h-4 text-red-500" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[11px] font-semibold text-red-700 truncate">{res.fileName}</p>
                                                <p className="text-[9px] text-red-400 font-medium mt-0.5">{res.error}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {error && (
                                <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-[11px]">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <p>{error}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 1: FILE UPLOAD */}
                    {!results && step === 1 && (
                        <div className="space-y-5">
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all text-center group
                                    ${files.length > 0 ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200 hover:border-blue-200 hover:bg-blue-50/20'}`}
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    accept=".pdf,.docx"
                                    multiple
                                    className="hidden"
                                />
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${files.length > 0 ? 'bg-blue-600' : 'bg-white border border-slate-200 group-hover:border-blue-200'} shadow-sm`}>
                                    {files.length > 0
                                        ? <Files className="w-6 h-6 text-white" />
                                        : <Upload className="w-6 h-6 text-slate-300 group-hover:text-blue-400 transition-colors" />}
                                </div>
                                <div>
                                    <p className="text-[13px] font-bold text-[#0F172A]">
                                        {files.length > 0 ? `${files.length} Dosya Seçildi` : 'Dosyaları Seçin veya Sürükleyin'}
                                    </p>
                                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">PDF, DOCX · Maksimum 30MB/dosya</p>
                                </div>
                                {files.length === 0 && (
                                    <span className="text-[11px] font-bold text-blue-600 border border-blue-200 bg-white px-4 py-1.5 rounded-full hover:bg-blue-50 transition-colors">
                                        Dosya Seç
                                    </span>
                                )}
                            </div>

                            {files.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">Yüklenecek Dosyalar</p>
                                    {files.map((f, idx) => (
                                        <div key={idx} className="flex items-center gap-3 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl group hover:border-slate-200 transition-all">
                                            <div className="w-8 h-8 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-center shrink-0">
                                                <FileText className="w-4 h-4 text-blue-600" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[12px] font-semibold text-[#0F172A] truncate">{f.name}</p>
                                                <p className="text-[9px] text-slate-400 font-medium">{(f.size / 1024 / 1024).toFixed(2)} MB</p>
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                                                className="w-7 h-7 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full text-center text-[10px] font-bold text-blue-600 hover:underline py-1"
                                    >
                                        + Daha fazla dosya ekle
                                    </button>
                                </div>
                            )}

                            {error && (
                                <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-[11px]">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <p>{error}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 2: SOURCE */}
                    {!results && step === 2 && (
                        <div className="space-y-2">
                            <p className="text-[12px] font-semibold text-slate-500 mb-4">Bu adayları nereden buldunuz?</p>
                            {SOURCES.map((s) => {
                                const isActive = sourceType === s.id;
                                return (
                                    <button
                                        key={s.id}
                                        onClick={() => { setSourceType(s.id); setSourceDetail(''); }}
                                        className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${isActive ? 'border-[#1E3A8A] bg-blue-50/40' : 'border-slate-100 bg-slate-50/50 hover:border-slate-200'}`}
                                    >
                                        <div
                                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all"
                                            style={{ backgroundColor: isActive ? s.color : '#F1F5F9' }}
                                        >
                                            <s.icon className="w-4 h-4" style={{ color: isActive ? '#fff' : '#94A3B8' }} />
                                        </div>
                                        <div className="flex-1">
                                            <p className={`text-[12px] font-bold ${isActive ? 'text-[#1E3A8A]' : 'text-[#0F172A]'}`}>{s.label}</p>
                                            <p className="text-[9px] text-slate-400 font-medium mt-0.5">{s.sub}</p>
                                        </div>
                                        {isActive && (
                                            <div className="w-5 h-5 rounded-full bg-[#1E3A8A] flex items-center justify-center shrink-0">
                                                <Check className="w-3 h-3 text-white" strokeWidth={3} />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                            {needsDetail && (
                                <div className="pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <input
                                        type="text"
                                        placeholder={
                                            sourceType === 'İşe Alım Firması' ? 'Firma adı (örn: Michael Page)' :
                                            sourceType === 'Referans' ? 'Referans veren kişi adı' :
                                            'Platform / mecra adı (örn: LinkedIn)'
                                        }
                                        className="w-full px-4 py-3 text-[12px] bg-slate-50 border border-slate-200 rounded-xl text-[#0F172A] placeholder-slate-300 focus:outline-none focus:border-blue-400 transition-colors"
                                        value={sourceDetail}
                                        onChange={(e) => setSourceDetail(e.target.value)}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 3: REVIEW */}
                    {!results && step === 3 && (
                        <div className="space-y-5">
                            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Dosyalar</span>
                                    <span className="text-[11px] font-bold text-blue-600">{files.length} dosya</span>
                                </div>
                                <div className="space-y-1.5">
                                    {files.map((f, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                            <span className="text-[11px] text-slate-700 font-medium truncate">{f.name}</span>
                                            <span className="text-[9px] text-slate-400 ml-auto shrink-0">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Kaynak</span>
                                    <div className="text-right">
                                        <span className="text-[11px] font-bold text-[#0F172A]">{selectedSource?.label}</span>
                                        {sourceDetail && (
                                            <p className="text-[9px] text-slate-400 mt-0.5">{sourceDetail}</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
                                <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-[11px] font-bold text-blue-800">AI Analizi Başlayacak</p>
                                    <p className="text-[10px] text-blue-600/80 mt-0.5 leading-relaxed">Her CV ayrıştırılacak, pozisyon eşleşmesi yapılacak ve otonom tarama gerçekleştirilecek.</p>
                                </div>
                            </div>

                            {error && (
                                <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-[11px]">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <p>{error}</p>
                                </div>
                            )}

                            <button
                                onClick={handleUpload}
                                disabled={loading}
                                className="w-full py-3.5 rounded-2xl bg-[#1E3A8A] hover:bg-blue-800 text-white font-bold text-[13px] transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/30 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Yapay Zeka Analiz Ediyor...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-4 h-4" />
                                        {files.length} Adayı Analiz Et
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>

                {/* FOOTER NAV */}
                {!results ? (
                    <div className="px-7 py-4 border-t border-slate-100 flex items-center justify-between">
                        <button
                            onClick={() => setStep(s => Math.max(1, s - 1))}
                            disabled={step === 1}
                            className={`flex items-center gap-1.5 text-[11px] font-bold transition-all ${step === 1 ? 'text-slate-200 cursor-not-allowed' : 'text-slate-500 hover:text-[#0F172A]'}`}
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Geri
                        </button>
                        <div className="flex gap-1.5">
                            {STEPS.map((_, i) => (
                                <div
                                    key={i}
                                    className={`h-1.5 rounded-full transition-all duration-300 ${i + 1 === step ? 'w-5 bg-[#1E3A8A]' : i + 1 < step ? 'w-3 bg-emerald-400' : 'w-3 bg-slate-200'}`}
                                />
                            ))}
                        </div>
                        {step < 3 ? (
                            <button
                                onClick={() => {
                                    if (step === 1 && files.length === 0) {
                                        setError('Lütfen en az bir dosya seçin.');
                                        return;
                                    }
                                    setError(null);
                                    setStep(s => s + 1);
                                }}
                                className="flex items-center gap-1.5 text-[11px] font-bold text-[#1E3A8A] hover:text-blue-700 transition-all"
                            >
                                İleri
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        ) : (
                            <div className="w-12" />
                        )}
                    </div>
                ) : (
                    <div className="px-7 py-4 border-t border-slate-100 flex items-center gap-3">
                        <button
                            onClick={() => { setResults(null); setStep(1); }}
                            className="flex-1 py-3 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[12px] font-bold text-slate-600 transition-all"
                        >
                            Geri Dön
                        </button>
                        <button
                            onClick={handleSaveAll}
                            disabled={loading || !results.some(r => r.success)}
                            className="flex-[2] py-3 rounded-2xl bg-[#1E3A8A] hover:bg-blue-800 text-white text-[12px] font-bold transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                            {results.filter(r => r.success).length} Adayı Havuza Ekle
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
