import { useState, useEffect, useMemo } from 'react';
import { useCandidates } from '../context/CandidatesContext';
import { useUserSettings } from '../context/UserSettingsContext';
import { analyzeCandidateMatch, getAvailableModels } from '../services/geminiService';
import { PREDEFINED_POSITIONS } from '../config/positions';
import Header from '../components/Header';
import {
    TrendingUp,
    FileText,
    Loader2,
    Users,
    Layers,
    Play,
    MoreVertical,
    Plus,
    X,
    Briefcase,
    Zap,
    PlusCircle,
    Globe,
    Clock
} from 'lucide-react';
import MatchScoreRing from '../components/MatchScoreRing';
import CandidateDrawer from '../components/CandidateDrawer';
import AgentThoughtPanel from '../components/AgentThoughtPanel';

export default function AIMatchPage() {
    const { filteredCandidates, updateCandidate } = useCandidates();
    const { settings, saveCustomPosition } = useUserSettings();

    // Position & Skills State
    const [selectedPositionId, setSelectedPositionId] = useState('frontend');
    const [selectedSkills, setSelectedSkills] = useState([]);
    const [selectedWorkTypes, setSelectedWorkTypes] = useState(['Full-time']);
    const [extraRequirements, setExtraRequirements] = useState('');
    const [isAddingNewPosition, setIsAddingNewPosition] = useState(false);
    const [newPositionName, setNewPositionName] = useState('');
    const [selectedCandidate, setSelectedCandidate] = useState(null);

    // Process State
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [processedCount, setProcessedCount] = useState(0);
    const [matches, setMatches] = useState([]);

    // Model Selection
    const [availableModels, setAvailableModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState('');

    // Combine Predefined and Custom Positions
    const allPositions = useMemo(() => {
        return [...PREDEFINED_POSITIONS, ...(settings.customPositions || [])];
    }, [settings.customPositions]);

    const activePosition = useMemo(() => {
        return allPositions.find(p => p.id === selectedPositionId) || allPositions[0];
    }, [selectedPositionId, allPositions]);

    // Update skills when position changes
    useEffect(() => {
        if (activePosition) {
            setSelectedSkills(activePosition.skills || []);
        }
    }, [selectedPositionId, allPositions]);

    useEffect(() => {
        getAvailableModels().then(models => {
            setAvailableModels(models);
            if (models.length > 0) setSelectedModel(models[0].id);
            else setSelectedModel('gemini-pro');
        });
    }, []);

    const toggleSkill = (skill) => {
        setSelectedSkills(prev =>
            prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
        );
    };

    const handleAddNewPosition = async () => {
        if (!newPositionName.trim()) return;
        const newPos = {
            id: 'custom-' + Date.now(),
            title: newPositionName,
            skills: []
        };
        await saveCustomPosition(newPos);
        setSelectedPositionId(newPos.id);
        setNewPositionName('');
        setIsAddingNewPosition(false);
    };

    const generatedJobDescription = useMemo(() => {
        const skillsText = selectedSkills.length > 0 ? `Aranan Yetkinlikler: ${selectedSkills.join(', ')}.` : '';
        const workTypeText = selectedWorkTypes.length > 0 ? `Çalışma Şekli: ${selectedWorkTypes.join(' veya ')}.` : '';
        return `${activePosition?.title} pozisyonu için ${workTypeText.toLowerCase()} çalışabilecek bir aday arıyoruz. ${skillsText} ${extraRequirements}`.trim();
    }, [activePosition, selectedSkills, selectedWorkTypes, extraRequirements]);

    const handleStartMatching = async () => {
        if (!generatedJobDescription.trim() || filteredCandidates.length === 0) return;

        setIsProcessing(true);
        setProcessedCount(0);
        setProgress(0);
        setMatches([]);

        const total = filteredCandidates.length;
        const currentMatches = [];

        for (let i = 0; i < total; i++) {
            const candidate = filteredCandidates[i];
            try {
                const result = await analyzeCandidateMatch(generatedJobDescription, candidate, selectedModel);
                await updateCandidate(candidate.id, {
                    matchScore: result.score,
                    aiAnalysis: result
                });
                currentMatches.push({
                    ...candidate,
                    matchScore: result.score,
                    aiAnalysis: result
                });
            } catch (error) {
                console.error(`Error matching candidate ${candidate.id}:`, error);
            }
            setProcessedCount(i + 1);
            setProgress(((i + 1) / total) * 100);
            setMatches([...currentMatches].sort((a, b) => b.score - (a.score || b.matchScore)));
        }
        setIsProcessing(false);
    };

    return (
        <div className="min-h-screen pb-20">
            <Header title="Zeki Aday Eşleşme (AI Match Engine)" />

            <div className="max-w-6xl mx-auto px-6 lg:px-8 py-8">

                {/* Configuration Panel */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">

                    {/* 1. Position Selection */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="glass rounded-3xl p-6 border border-white/[0.06] h-full">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-white font-bold flex items-center gap-2">
                                    <Briefcase className="w-5 h-5 text-electric" />
                                    Pozisyon Seçimi
                                </h3>
                                {!isAddingNewPosition ? (
                                    <button
                                        onClick={() => setIsAddingNewPosition(true)}
                                        className="text-[11px] font-bold text-electric hover:text-white transition-colors flex items-center gap-1 uppercase tracking-wider"
                                    >
                                        <PlusCircle className="w-3.5 h-3.5" />
                                        Yeni Pozisyon
                                    </button>
                                ) : (
                                    <button onClick={() => setIsAddingNewPosition(false)} className="text-navy-500 hover:text-white transition-colors">
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            {isAddingNewPosition && (
                                <div className="mb-6 flex gap-2 animate-in fade-in slide-in-from-top-2">
                                    <input
                                        type="text"
                                        value={newPositionName}
                                        onChange={(e) => setNewPositionName(e.target.value)}
                                        placeholder="Pozisyon adı girin (örn: CTO)"
                                        className="flex-1 px-4 py-2 rounded-xl bg-navy-950/50 border border-white/[0.06] text-sm text-white outline-none focus:border-electric/40"
                                    />
                                    <button
                                        onClick={handleAddNewPosition}
                                        className="px-4 py-2 rounded-xl bg-electric text-white text-sm font-bold shadow-lg shadow-electric/20"
                                    >
                                        Ekle
                                    </button>
                                </div>
                            )}

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {allPositions.map(pos => (
                                    <button
                                        key={pos.id}
                                        onClick={() => setSelectedPositionId(pos.id)}
                                        className={`p-4 rounded-2xl border text-left transition-all group ${selectedPositionId === pos.id
                                            ? 'bg-electric/10 border-electric/50 ring-1 ring-electric/20'
                                            : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04]'
                                            }`}
                                    >
                                        <p className={`text-[13px] font-bold truncate ${selectedPositionId === pos.id ? 'text-white' : 'text-navy-300'}`}>
                                            {pos.title}
                                        </p>
                                        <p className="text-[10px] text-navy-500 font-medium mt-1">
                                            {pos.skills?.length || 0} Yetkinlik
                                        </p>
                                    </button>
                                ))}
                            </div>

                            <div className="mt-8 flex flex-col md:flex-row gap-6">
                                <div className="flex-1 space-y-4">
                                    <label className="text-sm font-bold text-navy-200 flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-electric" />
                                        Çalışma Şekli (Çoklu Seçim)
                                    </label>
                                    <div className="flex gap-2">
                                        {['Full-time', 'Freelance', 'Part-time'].map(type => (
                                            <button
                                                key={type}
                                                onClick={() => {
                                                    setSelectedWorkTypes(prev => {
                                                        if (prev.includes(type)) {
                                                            return prev.filter(t => t !== type);
                                                        } else {
                                                            return [...prev, type];
                                                        }
                                                    });
                                                }}
                                                className={`flex-1 py-2 px-3 rounded-xl text-[12px] font-bold border transition-all ${selectedWorkTypes.includes(type)
                                                    ? 'bg-electric/10 border-electric/40 text-electric-light shadow-[0_0_16px_rgba(59,130,246,0.1)]'
                                                    : 'bg-white/[0.03] border-white/5 text-navy-500 hover:text-navy-300'
                                                    }`}
                                            >
                                                {type === 'Full-time' ? 'Tam Zamanlı' : type === 'Freelance' ? 'Freelance' : 'Yarı Zamanlı'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 space-y-4">
                                <label className="text-sm font-bold text-navy-200 flex items-center gap-2">
                                    <Zap className="w-4 h-4 text-amber-400" />
                                    Aranan Yetkinlikler (Skills)
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {activePosition?.skills?.map(skill => (
                                        <button
                                            key={skill}
                                            onClick={() => toggleSkill(skill)}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${selectedSkills.includes(skill)
                                                ? 'bg-electric text-white border-electric shadow-lg shadow-electric/20'
                                                : 'bg-white/5 border-white/5 text-navy-400 hover:text-white hover:border-white/10'
                                                }`}
                                        >
                                            {skill}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-8">
                                <label className="text-sm font-bold text-navy-200 flex items-center gap-2 mb-3">
                                    <FileText className="w-4 h-4 text-navy-400" />
                                    Ek Özellikler / Notlar
                                </label>
                                <textarea
                                    value={extraRequirements}
                                    onChange={(e) => setExtraRequirements(e.target.value)}
                                    rows={3}
                                    className="w-full px-4 py-3 rounded-2xl bg-navy-950/50 border border-white/[0.06] text-sm text-navy-200 placeholder:text-navy-500 outline-none focus:border-electric/40 focus:ring-1 focus:ring-electric/40 resize-none leading-relaxed"
                                    placeholder="Belirtmek istediğiniz diğer kriterler (örn: 5 yıl deneyim, ileri seviye İngilizce...)"
                                />
                            </div>
                        </div>
                    </div>

                    {/* 2. Model & Action */}
                    <div className="space-y-6">
                        <div className="glass rounded-3xl p-6 border border-white/[0.06]">
                            <h3 className="text-white font-bold flex items-center gap-2 mb-6">
                                <Layers className="w-5 h-5 text-electric" />
                                Analiz Kontrolü
                            </h3>

                            {/* Agent Thought Process Visualization */}
                            {isProcessing && (
                                <div className="mb-6">
                                    <AgentThoughtPanel isProcessing={true} />
                                </div>
                            )}

                            <div className="space-y-6">
                                <div>
                                    <label className="text-xs font-bold text-navy-500 mb-2 block uppercase tracking-widest">AI Engine</label>
                                    <div className="flex items-center gap-2 px-3 py-3 rounded-xl bg-navy-950/50 border border-white/[0.06]">
                                        <select
                                            value={selectedModel}
                                            onChange={(e) => setSelectedModel(e.target.value)}
                                            disabled={isProcessing}
                                            className="bg-transparent text-sm text-navy-200 outline-none w-full cursor-pointer disabled:opacity-50 font-bold"
                                        >
                                            {availableModels.map(m => (
                                                <option key={m.id} value={m.id} className="bg-navy-900 text-navy-200">{m.displayName}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10">
                                    <p className="text-[11px] text-navy-400 leading-relaxed font-medium">
                                        <span className="text-blue-400 font-bold">Zeki Sistem Notu:</span> Analiz motoru objeltiflik ilkesine göre çalışır. Demografik veriler (yaş, cinsiyet, uyruk vb.) değerlendirmeye alınmaz.
                                    </p>
                                </div>

                                <button
                                    onClick={handleStartMatching}
                                    disabled={isProcessing || !generatedJobDescription.trim() || filteredCandidates.length === 0}
                                    className={`w-full py-5 rounded-2xl flex flex-col items-center justify-center gap-2 font-bold text-white shadow-xl transition-all ${isProcessing
                                        ? 'bg-navy-700 cursor-not-allowed'
                                        : 'bg-gradient-to-br from-electric to-blue-600 hover:shadow-electric/30 hover:-translate-y-1 active:scale-95'
                                        }`}
                                >
                                    {isProcessing ? (
                                        <>
                                            <Loader2 className="w-6 h-6 animate-spin" />
                                            <span className="text-sm">Analiz Ediliyor ({processedCount}/{filteredCandidates.length})</span>
                                        </>
                                    ) : (
                                        <>
                                            <Play className="w-6 h-6 fill-current" />
                                            <span className="text-lg">Analizi Başlat</span>
                                        </>
                                    )}
                                </button>

                                <p className="text-center text-[10px] text-navy-500 font-medium">
                                    {filteredCandidates.length} aday filtrelere göre listelendi.
                                </p>
                            </div>
                        </div>

                        {isProcessing && (
                            <div className="glass rounded-3xl p-6 border border-white/[0.06] animate-in fade-in zoom-in duration-500">
                                <div className="flex justify-between text-xs text-navy-400 mb-3 font-bold uppercase tracking-widest">
                                    <span>İlerleme: %{Math.round(progress)}</span>
                                    <span>{processedCount} / {filteredCandidates.length}</span>
                                </div>
                                <div className="h-3 bg-navy-800 rounded-full overflow-hidden p-0.5">
                                    <div
                                        className="h-full bg-gradient-to-r from-electric to-blue-400 rounded-full transition-all duration-300 ease-out relative overflow-hidden"
                                        style={{ width: `${progress}%` }}
                                    >
                                        <div className="absolute inset-0 bg-white/20 animate-[shimmer_1.5s_infinite]" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Results List */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-electric-light" />
                            Eşleşme Sonuçları
                        </h3>
                        {matches.length > 0 && (
                            <span className="text-xs font-bold text-navy-500 uppercase tracking-wider bg-white/5 px-3 py-1 rounded-full">
                                SKOR SIRALAMALI
                            </span>
                        )}
                    </div>

                    {matches.length > 0 ? (
                        <div className="grid grid-cols-1 gap-4">
                            {matches.map((match, index) => (
                                <div
                                    key={match.id}
                                    onClick={() => setSelectedCandidate(match)}
                                    className="glass rounded-2xl p-4 border border-white/[0.06] flex items-center gap-5 hover:bg-white/[0.03] transition-all group animate-in fade-in slide-in-from-bottom-4 cursor-pointer"
                                    style={{ animationDelay: `${index * 50}ms` }}
                                >
                                    <div className="text-base font-black text-navy-700 w-8 text-center bg-white/5 py-2 rounded-xl group-hover:text-electric transition-colors">#{index + 1}</div>

                                    <MatchScoreRing score={match.score || match.matchScore} size={56} />

                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-lg font-bold text-white group-hover:text-electric-light transition-colors">{match.name}</h4>
                                        <p className="text-sm text-navy-400 font-medium">{match.position}</p>
                                        <p className="text-xs text-navy-300 mt-2 line-clamp-1 opacity-70 italic">"{match.summary || match.aiAnalysis?.summary}"</p>
                                    </div>

                                    <div className="flex items-center gap-6">
                                        <div className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg ${(match.score || match.matchScore) >= 85 ? 'bg-emerald-500/10 text-emerald-400 shadow-emerald-500/5' :
                                            (match.score || match.matchScore) >= 70 ? 'bg-blue-500/10 text-blue-400 shadow-blue-500/5' :
                                                (match.score || match.matchScore) >= 50 ? 'bg-amber-500/10 text-amber-400 shadow-amber-500/5' :
                                                    'bg-red-500/10 text-red-400 shadow-red-500/5'
                                            }`}>
                                            {(match.score || match.matchScore) >= 85 ? 'Liyakatli' : (match.score || match.matchScore) >= 70 ? 'Uygun' : (match.score || match.matchScore) >= 50 ? 'Gelişebilir' : 'Eksik'}
                                        </div>
                                        <button className="p-3 rounded-xl hover:bg-white/[0.06] text-navy-500 hover:text-white transition-all">
                                            <MoreVertical className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-24 text-navy-500 opacity-60 rounded-3xl border-2 border-dashed border-white/5 bg-white/[0.01]">
                            <div className="w-20 h-20 rounded-full bg-navy-950 flex items-center justify-center mb-6 border border-white/5">
                                <Users className="w-10 h-10 opacity-30" />
                            </div>
                            <h4 className="text-white font-bold text-lg mb-2">Simülasyon Bekleniyor</h4>
                            <p className="text-sm text-center max-w-sm px-4">
                                Pozisyon ve yetkinlikleri seçtikten sonra analizi başlatarak en uygun adayları listeleyebilirsiniz.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* ===== DRAWER ===== */}
            {selectedCandidate && (
                <CandidateDrawer
                    candidate={selectedCandidate}
                    onClose={() => setSelectedCandidate(null)}
                />
            )}
        </div>
    );
}
