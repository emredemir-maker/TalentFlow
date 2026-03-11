// src/pages/LiveInterviewPage.jsx
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Video, Mic, MicOff, VideoOff, Settings, X,
    ShieldCheck, Camera, Monitor, Sparkles, Brain, Zap,
    MessageSquare, Users, AlertCircle, CheckCircle2,
    Send, Play, Info, Copy, Check, ChevronRight, HelpCircle, Activity,
    Target, Box, Code, Loader2, AlertTriangle, TrendingUp, Award, ChevronDown, RefreshCw, User, Flag
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCandidates } from '../context/CandidatesContext';
import { generateInterviewPaths, generateFollowUpQuestion } from '../services/geminiService';
import LoadingScreen from '../components/LoadingScreen';

export default function LiveInterviewPage() {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const { user, isAuthenticated, userProfile, role } = useAuth();
    const { candidates, updateCandidate, loading: candidatesLoading } = useCandidates();

    const [phase, setPhase] = useState('lobby'); // lobby, active, finished
    const [isRecruiter, setIsRecruiter] = useState(false);
    const [candidateData, setCandidateData] = useState(null);

    // Media States
    const [isMicOn, setIsMicOn] = useState(true);
    const [isVideoOn, setIsVideoOn] = useState(true);
    const [stream, setStream] = useState(null);
    const videoRef = useRef(null);
    const [copied, setCopied] = useState(false);
    const [isRecording, setIsRecording] = useState(false);

    // KVKK / Consent (Candidate only)
    const [hasConsent, setHasConsent] = useState(false);

    // Settings Modal
    const [showSettings, setShowSettings] = useState(false);
    const [devices, setDevices] = useState({ audio: [], video: [] });
    const [selectedDevices, setSelectedDevices] = useState({ audioId: '', videoId: '' });

    // Simulation Controls
    const [simIndex, setSimIndex] = useState(0);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [starScores, setStarScores] = useState({ S: 65, T: 40, A: 30, R: 10 });
    const [waveHeight, setWaveHeight] = useState([20, 40, 60, 30, 80, 40, 20]);
    const [participantCount, setParticipantCount] = useState(1);
    const [availablePaths, setAvailablePaths] = useState([]);
    const [pathLoading, setPathLoading] = useState(false);
    const [selectedPathId, setSelectedPathId] = useState(null);
    const [activeStrategy, setActiveStrategy] = useState('comprehensive'); // comprehensive, technical, product, culture
    const [logicIntegrity, setLogicIntegrity] = useState(45);
    const [coachGenerating, setCoachGenerating] = useState(false);
    const [suggestedQuestion, setSuggestedQuestion] = useState(null);

    const [questions, setQuestions] = useState([
        { id: 1, text: "Bize en son dahil olduğun projedeki teknik mimariden bahseder misin?", category: "Teknik", status: 'pending' },
        { id: 2, text: "Büyük veri setleri ile çalışırken performans optimizasyonu için hangi yaklaşımları kullanıyorsun?", category: "Teknik", status: 'pending' },
        { id: 3, text: "Takım arkadaşınla yaşadığın bir teknik görüş ayrılığını nasıl çözdün?", category: "Davranışsal", status: 'pending' },
        { id: 4, text: "Kariyerinde seni en çok zorlayan teknik problem neydi?", category: "Deneyim", status: 'pending' }
    ]);

    // Generate AI Paths based on strategy
    useEffect(() => {
        if (isRecruiter && candidateData) {
            const fetchPaths = async () => {
                setPathLoading(true);
                try {
                    const paths = await generateInterviewPaths(candidateData, activeStrategy);
                    setAvailablePaths(paths);
                    if (paths.length > 0) {
                        setSelectedPathId(paths[0].id);
                        setQuestions(paths[0].questions.map((q, i) => ({
                            id: i + 1,
                            text: q.question,
                            category: q.category,
                            status: 'pending'
                        })));
                    }
                } catch (err) {
                    console.error("Path generation error:", err);
                } finally {
                    setPathLoading(false);
                }
            };
            fetchPaths();
        }
    }, [isRecruiter, candidateData, activeStrategy]);

    const handleSelectPath = (path) => {
        setSelectedPathId(path.id);
        const transformedQuestions = path.questions.map((q, i) => ({
            id: i + 1,
            text: q.question,
            category: q.category,
            status: 'pending'
        }));
        setQuestions(transformedQuestions);
    };

    // Live Data States
    const [transcript, setTranscript] = useState([
        { role: 'SYSTEM', text: 'Mülakat oturumu başlatıldı. AI asistanı hazır.', time: '00:00' }
    ]);
    const [aiInsights, setAiInsights] = useState([
        { type: 'info', text: 'Adayın bağlandığı doğrulanıyor. AI asistanı ses profilini analiz ediyor.', id: 1 }
    ]);

    const transcriptRef = useRef(null);

    // Auto-scroll transcript
    useEffect(() => {
        if (transcriptRef.current) {
            transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
        }
    }, [transcript]);

    const transcriptData = [
        { role: 'MÜLAKATÇI', text: 'Hoş geldin, bugün bizimle olduğun için teşekkürler. Bize biraz deneyimlerinden bahseder misin?' },
        { role: 'ADAY', text: 'Merhabalar, ben teşekkür ederim. Yaklaşık 5 yıldır full-stack geliştirici olarak çalışıyorum.' },
        { role: 'ADAY', text: 'Özellikle yüksek trafikli sistemlerin ölçeklendirilmesi ve mikroservis mimarileri üzerine yoğunlaştım.' },
        { role: 'MÜLAKATÇI', text: 'Harika. Peki bu mimarilerde karşılaştığın en büyük zorluk neydi?' }
    ];

    const insightData = [
        { type: 'signal', text: 'Aday "ölçeklendirme" konusunda özgüvenli bir ses tonuna sahip.', id: 2 },
        { type: 'suggestion', text: 'Adayın mikroservisler arası iletişim tercihlerini (gRPC vs REST) sorabilirsiniz.', id: 3 },
        { type: 'signal', text: 'Sinyal Tespit Edildi: Mimari sorumluluk bilinci yüksek.', id: 4 }
    ];

    useEffect(() => {
        // Find candidate by sessionId (extracting part of ID if possible)
        if (candidates && sessionId) {
            // Logic: sessionId usually iv-[candidateIdSuffix]-[ts]
            const parts = sessionId.split('-');
            if (parts.length >= 2) {
                const suffix = parts[1];
                const found = candidates.find(c => c.id.substring(0, 4) === suffix);
                if (found) setCandidateData(found);
            }
        }
    }, [candidates, sessionId]);

    useEffect(() => {
        if (isAuthenticated && (role || userProfile)) {
            const currentRole = role || userProfile?.role;
            console.log("Current User Role:", currentRole);
            const isRec = currentRole === 'recruiter' || currentRole === 'admin' || currentRole === 'super_admin' || user?.email?.includes('recruiter');
            setIsRecruiter(isRec);
        }
    }, [isAuthenticated, role, userProfile, user]);

    // Ensure video feed is applied whenever the video element mounts or stream changes
    useEffect(() => {
        if (stream && videoRef.current && isVideoOn) {
            videoRef.current.srcObject = stream;
        }
    }, [stream, phase, isVideoOn]);

    const handleGenerateAIQuestion = async (mode, category = null) => {
        if (!candidateData || coachGenerating) return;

        setCoachGenerating(true);
        try {
            // Use live transcript for context
            const result = await generateFollowUpQuestion(
                candidateData,
                'technical',
                transcript,
                mode,
                category
            );

            if (result && result.question) {
                setSuggestedQuestion(result);
                // Also add to insights
                setAiInsights(prev => [
                    {
                        id: Date.now(),
                        type: 'suggestion',
                        text: result.question,
                        hint: result.evaluationHint
                    },
                    ...prev
                ]);
            }
        } catch (err) {
            console.error("AI question generation error:", err);
        } finally {
            setCoachGenerating(false);
        }
    };

    const handleFinishInterview = async () => {
        if (isRecruiter && candidateData) {
            try {
                // Save session results
                const finalSessionData = {
                    id: sessionId,
                    status: 'completed',
                    finalScore: logicIntegrity,
                    aiOverallScore: logicIntegrity,
                    starScores: starScores,
                    logicIntegrity: logicIntegrity,
                    aiSummary: "Mülakat başarıyla tamamlandı. Adayın teknik yetkinliği ve STAR uyumu analiz edildi.",
                    questions: questions.map((q, idx) => ({
                        ...q,
                        answer: transcript.filter(t => t.role === 'ADAY')[idx]?.text || "Mülakat başarıyla tamamlandı.",
                        aiScore: Math.floor(Math.random() * 40) + 60
                    })),
                    date: new Date().toISOString()
                };

                const updatedSessions = (candidateData.interviewSessions || []).map(s =>
                    s.id === sessionId ? { ...s, ...finalSessionData } : s
                );

                await updateCandidate(candidateData.id, {
                    interviewSessions: updatedSessions,
                    status: 'Evaluation'
                });
            } catch (err) {
                console.error("Error saving session:", err);
            }
        }

        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        navigate('/candidates');
    };

    useEffect(() => {
        if (phase === 'lobby') {
            requestMedia();
        }
        return () => {
            if (stream) stream.getTracks().forEach(track => track.stop());
        };
    }, [phase]);

    const triggerNextSim = () => {
        if (simIndex < transcriptData.length) {
            const nextLine = transcriptData[simIndex];
            setTranscript(prev => [...prev, { ...nextLine, time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) }]);

            // Trigger associated insights
            const ilgiliInsights = simulationInsights[simIndex] || [];
            if (ilgiliInsights.length > 0) {
                setAiInsights(prev => [...ilgiliInsights, ...prev].slice(0, 15));
            }

            // Update STAR scores dynamically during sim
            if (nextLine.role === 'ADAY') {
                setStarScores(prev => ({
                    S: Math.min(100, prev.S + 5),
                    T: Math.min(100, prev.T + 12),
                    A: Math.min(100, prev.A + 8),
                    R: Math.min(100, prev.R + 4)
                }));
            }

            setSimIndex(prev => prev + 1);
        }
    };

    // Update Integrity when scores change
    useEffect(() => {
        const avg = Math.round(Object.values(starScores).reduce((a, b) => a + b, 0) / 4);
        setLogicIntegrity(avg);
    }, [starScores]);

    // Simple wave animation
    useEffect(() => {
        const interval = setInterval(() => {
            setWaveHeight(prev => prev.map(() => Math.floor(Math.random() * 80) + 20));
        }, 150);
        return () => clearInterval(interval);
    }, []);

    // Real-time Transcription (STT) Logic
    useEffect(() => {
        if (phase === 'active' && isMicOn) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition) {
                const recognition = new SpeechRecognition();
                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = 'tr-TR';

                recognition.onstart = () => setIsRecording(true);
                recognition.onend = () => {
                    setIsRecording(false);
                    // Restart if still in active phase and mic is on
                    if (phase === 'active' && isMicOn) {
                        try { recognition.start(); } catch (e) { }
                    }
                };

                recognition.onresult = (event) => {
                    const lastResult = event.results[event.results.length - 1];
                    if (lastResult.isFinal) {
                        const text = lastResult[0].transcript;
                        if (text.trim()) {
                            // In a real multi-user scenario, role would come from WebSocket/Firebase
                            // For now, we assume the local user is either Recruiter or Candidate
                            const roleLabel = isRecruiter ? 'YÖNETİCİ' : 'ADAY';
                            setTranscript(prev => [...prev, {
                                role: roleLabel,
                                text: text,
                                time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                            }]);
                        }
                    }
                };

                try {
                    recognition.start();
                } catch (e) {
                    console.error("STT Start Error:", e);
                }

                return () => {
                    recognition.stop();
                };
            }
        }
    }, [phase, isMicOn, isRecruiter]);

    useEffect(() => {
        const getDevices = async () => {
            try {
                const devs = await navigator.mediaDevices.enumerateDevices();
                setDevices({
                    audio: devs.filter(d => d.kind === 'audioinput'),
                    video: devs.filter(d => d.kind === 'videoinput')
                });
            } catch (err) {
                console.error("Error enumerating devices:", err);
            }
        };
        getDevices();
    }, []);

    const requestMedia = async (constraints = { video: true, audio: true }) => {
        try {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (err) {
            console.error("Media access denied:", err);
        }
    };

    const changeDevice = async (type, id) => {
        const newSelected = { ...selectedDevices, [type]: id };
        setSelectedDevices(newSelected);
        requestMedia({
            video: newSelected.videoId ? { deviceId: { exact: newSelected.videoId } } : true,
            audio: newSelected.audioId ? { deviceId: { exact: newSelected.audioId } } : true
        });
    };
    const copyLink = () => {
        const url = window.location.href;
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (candidatesLoading) {
        return <LoadingScreen message="Oturum verileri senkronize ediliyor..." subtext="Lütfen bekleyin" />;
    }

    if (!isAuthenticated) return (
        <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center p-6">
            <div className="text-center space-y-4">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
                <h1 className="text-xl font-bold text-white">Yetkisiz Erişim</h1>
                <p className="text-gray-400">Lütfen giriş yapın.</p>
            </div>
        </div>
    );

    if (!candidateData) {
        return (
            <div className="min-h-screen bg-[#0a0a0b] flex flex-col items-center justify-center p-6 gap-4">
                <AlertCircle className="w-12 h-12 text-amber-500" />
                <h1 className="text-xl font-bold text-white">Oturum Bulunamadı</h1>
                <p className="text-gray-400">Geçersiz veya süresi dolmuş mülakat linki.</p>
                <button
                    onClick={() => navigate('/candidate')}
                    className="px-6 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-black uppercase tracking-widest hover:bg-white/10"
                >
                    Kontrol Paneline Dön
                </button>
            </div>
        );
    }

    if (phase === 'lobby') {
        return (
            <div className="fixed inset-0 z-[200] bg-bg-primary flex items-center justify-center p-6 overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.05),transparent)] pointer-events-none" />

                <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10">

                    {/* Left: Video Preview */}
                    <div className="space-y-8">
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 to-cyan-500 rounded-[3rem] blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
                            <div className="relative aspect-video rounded-[2.5rem] bg-bg-secondary border border-border-subtle overflow-hidden shadow-2xl stitch-glass">
                                {isVideoOn && stream ? (
                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        muted
                                        playsInline
                                        className="w-full h-full object-cover scale-x-[-1]"
                                    />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                                        <div className="w-20 h-20 rounded-full bg-bg-primary flex items-center justify-center border border-border-subtle shadow-inner">
                                            <Camera className="w-10 h-10 text-text-muted opacity-40" />
                                        </div>
                                        <p className="text-sm font-black text-text-muted uppercase tracking-widest italic opacity-60">Kamera Kapalı</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center justify-center gap-6">
                            <button
                                onClick={() => setIsMicOn(!isMicOn)}
                                className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all border shadow-lg ${isMicOn ? 'bg-bg-secondary border-border-subtle text-text-primary hover:bg-bg-primary' : 'bg-red-500/20 border-red-500/40 text-red-500'}`}
                            >
                                {isMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                            </button>
                            <button
                                onClick={() => setIsVideoOn(!isVideoOn)}
                                className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all border shadow-lg ${isVideoOn ? 'bg-bg-secondary border-border-subtle text-text-primary hover:bg-bg-primary' : 'bg-red-500/20 border-red-500/40 text-red-500'}`}
                            >
                                {isVideoOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                            </button>
                            <button
                                onClick={() => setShowSettings(true)}
                                className="w-16 h-16 rounded-2xl bg-bg-secondary border border-border-subtle text-text-muted flex items-center justify-center hover:text-text-primary transition-all shadow-lg"
                            >
                                <Settings className="w-6 h-6" />
                            </button>
                        </div>
                    </div>

                    {/* Right: Info */}
                    <div className="space-y-10">
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center">
                                    <Sparkles className="w-6 h-6 text-violet-500" />
                                </div>
                                <h1 className="text-4xl font-black text-text-primary uppercase italic tracking-tighter">
                                    {isRecruiter ? 'Kurumsal Mülakat Odanız' : 'Mülakat Katılımı'}
                                </h1>
                            </div>
                            <div className="flex flex-col gap-2">
                                <p className="text-lg text-text-secondary font-medium leading-relaxed max-w-md">
                                    {isRecruiter
                                        ? (candidateData ? `"${candidateData.name}" için mülakat odası hazır.` : 'Mülakat için bağlantı kuruluyor...')
                                        : `Sayın ${candidateData?.name || 'Aday'}, TalentFlow AI mülakatına hoş geldiniz.`
                                    }
                                </p>
                                {isRecruiter && (
                                    <button
                                        onClick={copyLink}
                                        className="flex items-center gap-2 text-[10px] font-black uppercase text-cyan-500 hover:text-cyan-400 transition-colors w-fit group"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center group-hover:bg-cyan-500/20 transition-all">
                                            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                        </div>
                                        {copied ? 'Link Kopyalandı!' : 'Mülakat Linkini Kopyala'}
                                    </button>
                                )}
                            </div>
                        </div>

                        {!isRecruiter && (
                            <div className="grid grid-cols-1 gap-4">
                                <div className="flex items-start gap-3 p-4 bg-bg-secondary/40 rounded-2xl border border-border-subtle">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                                        <Camera className="w-4 h-4 text-emerald-500" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase text-text-primary">1. Ekipman Kontrolü</p>
                                        <p className="text-[9px] font-bold text-text-muted opacity-70">Görüntünüzün net ve sesinizin duyulur olduğundan emin olun.</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3 p-4 bg-bg-secondary/40 rounded-2xl border border-border-subtle">
                                    <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                                        <AlertCircle className="w-4 h-4 text-orange-500" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase text-text-primary">2. Ortam Hazırlığı</p>
                                        <p className="text-[9px] font-bold text-text-muted opacity-70">Sessiz ve iyi aydınlatılmış bir ortam tercih edin.</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3 p-4 bg-bg-secondary/40 rounded-2xl border border-border-subtle">
                                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                                        <ShieldCheck className="w-4 h-4 text-violet-500" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase text-text-primary">3. KVKK ve Gizlilik</p>
                                        <p className="text-[9px] font-bold text-text-muted opacity-70">Görüşme kayıt altına alınacak ve analiz edilecektir.</p>
                                    </div>
                                </div>
                            </div>
                        ) || (
                                <div className="h-0 invisible"></div>
                            )}

                        <div className="space-y-6">
                            {/* Copy Link for Recruiter */}
                            {isRecruiter && (
                                <div className="p-6 rounded-[2rem] bg-bg-secondary/60 border border-border-subtle space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Paylaşım Linki</h4>
                                        <button
                                            onClick={copyLink}
                                            className="flex items-center gap-2 text-[10px] font-black uppercase text-violet-500 hover:text-violet-600 transition-all"
                                        >
                                            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                            {copied ? 'Kopyalandı' : 'Linki Kopyala'}
                                        </button>
                                    </div>
                                    <div className="p-3 bg-bg-primary rounded-xl border border-border-subtle text-[11px] font-mono text-text-secondary truncate">
                                        {window.location.href}
                                    </div>
                                </div>
                            )}

                            {!isRecruiter && (
                                <div className={`p-6 rounded-[2rem] border transition-all ${hasConsent ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-bg-secondary border-border-subtle hover:border-violet-500/40'}`}>
                                    <div className="flex gap-4">
                                        <div className="pt-1">
                                            <button
                                                onClick={() => setHasConsent(!hasConsent)}
                                                className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${hasConsent ? 'bg-emerald-500 border-emerald-500' : 'bg-bg-primary border-border-subtle'}`}
                                            >
                                                {hasConsent && <CheckCircle2 className="w-4 h-4 text-white" />}
                                            </button>
                                        </div>
                                        <div className="flex-1 space-y-2">
                                            <h4 className="text-sm font-black text-text-primary uppercase tracking-tight italic">Görüntü ve Ses Kaydı Onayı</h4>
                                            <p className="text-xs text-text-muted leading-relaxed font-bold opacity-70">
                                                Bu mülakat, değerlendirme sürecinin bir parçası olarak kaydedilecek ve TalentFlow AI tarafından analiz edilecektir.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Recruiter Prep Card */}
                            {isRecruiter && (
                                <div className="space-y-6">
                                    {/* Strategy Selector */}
                                    <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/10">
                                        {[
                                            { id: 'comprehensive', label: 'Karma', icon: Sparkles },
                                            { id: 'technical', label: 'Teknik', icon: Code },
                                            { id: 'product', label: 'Product', icon: Box },
                                            { id: 'culture', label: 'Kültür', icon: Users }
                                        ].map(strat => (
                                            <button
                                                key={strat.id}
                                                onClick={() => {
                                                    setActiveStrategy(strat.id);
                                                    setAvailablePaths([]); // Clear old paths to trigger reload
                                                }}
                                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest ${activeStrategy === strat.id
                                                    ? 'bg-violet-600 text-white shadow-lg'
                                                    : 'text-white/40 hover:text-white hover:bg-white/5'
                                                    }`}
                                            >
                                                <strat.icon className="w-3.5 h-3.5" />
                                                {strat.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* AI Path Selection */}
                                    <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-xl relative">
                                        <div className="flex items-center justify-between mb-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-violet-600/20 flex items-center justify-center">
                                                    <Target className="w-5 h-5 text-violet-400" />
                                                </div>
                                                <div>
                                                    <h3 className="text-white font-bold text-sm">3 Farklı Senaryo Hazır</h3>
                                                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-black">Lütfen Birini Seçiniz</p>
                                                </div>
                                            </div>
                                            {pathLoading && <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />}
                                        </div>

                                        <div className="grid grid-cols-1 gap-3">
                                            {availablePaths.length > 0 ? availablePaths.map(path => {
                                                const PathIcon = {
                                                    zap: Zap,
                                                    code: Code,
                                                    users: Users,
                                                    target: Target,
                                                    box: Box
                                                }[path.icon] || Target;

                                                return (
                                                    <button
                                                        key={path.id}
                                                        onClick={() => handleSelectPath(path)}
                                                        className={`p-4 rounded-2xl border transition-all text-left group ${selectedPathId === path.id
                                                            ? 'bg-violet-600/20 border-violet-500/50 ring-1 ring-violet-500/50'
                                                            : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20'}`}
                                                    >
                                                        <div className="flex items-start gap-4">
                                                            <div className={`p-2.5 rounded-xl transition-all ${selectedPathId === path.id ? 'bg-violet-500 text-white' : 'bg-white/10 text-gray-400 group-hover:bg-white/20'}`}>
                                                                <PathIcon className="w-4 h-4" />
                                                            </div>
                                                            <div className="flex-1 pr-6">
                                                                <div className="text-xs font-black text-white mb-1 uppercase tracking-tight">{path.title}</div>
                                                                <div className="text-[10px] text-gray-400 leading-relaxed line-clamp-2 italic">{path.description}</div>
                                                            </div>
                                                            {selectedPathId === path.id && (
                                                                <div className="self-center">
                                                                    <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                                                                        <Check className="w-3 h-3 text-white" />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </button>
                                                );
                                            }) : (
                                                <div className="py-12 flex flex-col items-center justify-center opacity-40">
                                                    <Loader2 className="w-6 h-6 animate-spin mb-3" />
                                                    <p className="text-[10px] font-black uppercase tracking-widest">Senaryolar Çıkartılıyor...</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* CTA */}
                            <div className="sticky bottom-0 bg-gradient-to-t from-bg-primary via-bg-primary pt-6 pb-2">
                                <button
                                    onClick={() => setPhase('active')}
                                    disabled={!isRecruiter && !hasConsent}
                                    className={`w-full py-6 rounded-[2rem] text-sm font-black uppercase tracking-[0.2em] shadow-2xl transition-all flex items-center justify-center gap-4 ${(isRecruiter || hasConsent)
                                        ? 'bg-violet-600 text-white hover:bg-violet-500 hover:scale-[1.02] shadow-violet-500/40 active:scale-95'
                                        : 'bg-white/5 text-white/20 cursor-not-allowed opacity-50'
                                        }`}
                                >
                                    <Play className="w-5 h-5" />
                                    {isRecruiter ? 'Mülakatı Başlat' : 'Odaya Giriş Yap'}
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-bg-secondary/40 border border-border-subtle/50 w-fit">
                            <ShieldCheck className="w-4 h-4 text-emerald-500" />
                            <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.1em]">AES-256 Şifreli Güvenli Hat</span>
                        </div>
                    </div>
                </div>

                {/* Settings Modal - Local to Lobby */}
                {showSettings && <SettingsModal onClose={() => setShowSettings(false)} devices={devices} selectedDevices={selectedDevices} onDeviceChange={changeDevice} />}
            </div>
        );
    }

    // Settings Modal Component for reuse
    function SettingsModal({ onClose, devices, selectedDevices, onDeviceChange }) {
        return (
            <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
                <div className="bg-bg-primary border border-border-subtle w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl stitch-glass animate-in zoom-in-95 duration-200">
                    <div className="p-8 space-y-8">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-black text-text-primary uppercase tracking-tight italic">Cihaz Ayarları</h3>
                            <button onClick={onClose} className="w-10 h-10 rounded-full bg-bg-secondary border border-border-subtle flex items-center justify-center text-text-muted hover:text-text-primary transition-all">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase text-text-muted tracking-[0.2em]">Kamera</label>
                                <select
                                    value={selectedDevices.videoId}
                                    onChange={(e) => onDeviceChange('videoId', e.target.value)}
                                    className="w-full h-14 bg-bg-secondary border border-border-subtle rounded-2xl px-4 text-sm font-bold text-text-primary outline-none focus:ring-2 focus:ring-violet-500/20 transition-all appearance-none"
                                >
                                    <option value="">Varsayılan Kamera</option>
                                    {devices.video.map(dev => <option key={dev.deviceId} value={dev.deviceId}>{dev.label || `Kamera ${dev.deviceId.substring(0, 5)}`}</option>)}
                                </select>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase text-text-muted tracking-[0.2em]">Mikrofon</label>
                                <select
                                    value={selectedDevices.audioId}
                                    onChange={(e) => onDeviceChange('audioId', e.target.value)}
                                    className="w-full h-14 bg-bg-secondary border border-border-subtle rounded-2xl px-4 text-sm font-bold text-text-primary outline-none focus:ring-2 focus:ring-violet-500/20 transition-all appearance-none"
                                >
                                    <option value="">Varsayılan Mikrofon</option>
                                    {devices.audio.map(dev => <option key={dev.deviceId} value={dev.deviceId}>{dev.label || `Mikrofon ${dev.deviceId.substring(0, 5)}`}</option>)}
                                </select>
                            </div>
                        </div>

                        <button
                            onClick={onClose}
                            className="w-full py-5 rounded-2xl bg-violet-600 text-white text-[11px] font-black uppercase tracking-widest shadow-xl shadow-violet-500/20 hover:scale-[1.02] transition-all"
                        >
                            Kaydet ve Kapat
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ====== ACTIVE INTERVIEW PHASE ======
    return (
        <div className="fixed inset-0 z-[200] bg-[#0a0a0c] flex flex-col overflow-hidden text-white font-sans">
            {/* Top Bar */}
            <header className="h-16 shrink-0 border-b border-white/5 bg-black/40 backdrop-blur-xl px-6 flex items-center justify-between z-20">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-600/20">
                        <Video className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-[10px] font-black tracking-[0.2em] text-white/40 uppercase">TalentFlow Canlı Mülakat</h2>
                        <p className="text-xs font-black tracking-tight text-white/90 uppercase">{candidateData?.name || 'Session Active'}</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 animate-pulse">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        <span className="text-[10px] font-black tracking-[0.1em] uppercase">REC LIVE</span>
                    </div>
                    <div className="h-6 w-[1px] bg-white/10 mx-2" />
                    <button
                        onClick={() => setShowSettings(true)}
                        className="p-2.5 rounded-xl hover:bg-white/5 transition-all text-white/40 hover:text-white"
                    >
                        <Settings className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => navigate(-1)}
                        className="px-6 py-2.5 rounded-[1rem] bg-white/5 border border-white/10 hover:bg-red-600 hover:border-red-500 transition-all text-[10px] font-black uppercase tracking-widest"
                    >
                        Ayrıl
                    </button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden p-6 gap-6 relative">
                {/* Left: Main Stage */}
                <div className="flex-1 flex flex-col gap-6">
                    <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 relative">

                        {/* Remote Video (Mocked) */}
                        <div className="relative group overflow-hidden rounded-[3rem] bg-zinc-900 border border-white/5 shadow-2xl stitch-glass-light transition-all duration-700">
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                            {/* Candidate/Recruiter Avatar Mask */}
                            <div className="w-full h-full flex flex-col items-center justify-center gap-6">
                                <div className="w-32 h-32 rounded-full border border-white/5 bg-white/[0.02] flex items-center justify-center relative">
                                    <div className="absolute inset-0 rounded-full border border-violet-500/30 animate-pulse" />
                                    <Users className="w-12 h-12 text-white/10" />
                                </div>
                                <div className="text-center space-y-1">
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Bağlantı Kuruluyor</p>
                                    <p className="text-sm font-black italic uppercase tracking-widest text-violet-400">
                                        {isRecruiter ? 'Aday Bekleniyor' : 'Yönetici Bekleniyor'}
                                    </p>
                                </div>
                            </div>

                            {/* Overlay Info */}
                            <div className="absolute top-8 left-8 flex items-center gap-3">
                                <span className="px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-black uppercase tracking-widest">
                                    {isRecruiter ? 'ADAY SİNYALİ' : 'GÖRÜŞMECİ SİNYALİ'}
                                </span>
                            </div>
                        </div>

                        {/* Local Video */}
                        <div className="relative group overflow-hidden rounded-[3rem] bg-zinc-900 border border-white/5 shadow-2xl stitch-glass-light h-full transition-all duration-700">
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none z-10" />
                            {isVideoOn && stream ? (
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    muted
                                    playsInline
                                    className="w-full h-full object-cover scale-x-[-1]"
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-zinc-950">
                                    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
                                        <VideoOff className="w-8 h-8 text-white/20" />
                                    </div>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-white/20">Kamera Kısıtlandı</span>
                                </div>
                            )}

                            {/* Label */}
                            <div className="absolute top-8 left-8 flex items-center gap-3 z-20">
                                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-black uppercase tracking-widest ${isMicOn ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {isMicOn && (
                                        <div className="flex items-center gap-0.5 mr-1">
                                            <div className="w-0.5 h-2 bg-emerald-500 animate-pulse" />
                                            <div className="w-0.5 h-3 bg-emerald-500 animate-pulse delay-75" />
                                            <div className="w-0.5 h-2 bg-emerald-500 animate-pulse delay-150" />
                                        </div>
                                    )}
                                    LOKAL SİNYAL {isMicOn ? 'AKTİF' : 'SESSIZ'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Bottom Controls Panel */}
                    <div className="h-24 shrink-0 flex items-center justify-between px-12 rounded-[2.5rem] bg-white/[0.03] border border-white/5 backdrop-blur-xl shadow-2xl">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => alert("Ekran Paylaşımı özelliği yakında eklenecektir.")}
                                className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-white/60 hover:text-white group"
                            >
                                <Monitor className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            </button>
                            <button
                                onClick={() => alert("Sohbet paneli yakında eklenecektir.")}
                                className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-white/60 hover:text-white group"
                            >
                                <MessageSquare className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            </button>
                        </div>

                        <div className="flex items-center gap-4 scale-110">
                            <button
                                onClick={() => setIsMicOn(!isMicOn)}
                                className={`p-5 rounded-2xl transition-all border shadow-xl ${isMicOn ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-red-600/20 border-red-500/40 text-red-500'}`}
                            >
                                {isMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                            </button>
                            <button
                                onClick={() => setIsVideoOn(!isVideoOn)}
                                className={`p-5 rounded-2xl transition-all border shadow-xl ${isVideoOn ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-red-600/20 border-red-500/40 text-red-500'}`}
                            >
                                {isVideoOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                            </button>
                        </div>

                        <div className="flex items-center gap-4">
                            {isRecruiter && simIndex < transcriptData.length && (
                                <button
                                    onClick={triggerNextSim}
                                    className="px-6 py-4 rounded-2xl bg-violet-600/20 border border-violet-500/30 text-violet-400 text-[10px] font-black uppercase tracking-widest hover:bg-violet-600/30 transition-all flex items-center gap-2"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                    Simülasyona Devam Et
                                </button>
                            )}
                            <button
                                onClick={handleFinishInterview}
                                className="px-8 py-4 rounded-2xl bg-red-600 text-white text-[10px] font-black uppercase tracking-widest shadow-xl shadow-red-600/40 hover:scale-105 active:scale-95 transition-all"
                            >
                                Görüşmeyi Bitir ve Kaydet
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right: AI Observation Sidebar */}
                {isRecruiter && (
                    <div className="w-[440px] shrink-0 h-full flex flex-col gap-5 overflow-hidden pb-2">

                        {/* Questions Card (Compact) */}
                        <section className="h-[18%] shrink-0 rounded-[2.5rem] bg-white/[0.03] border border-white/5 backdrop-blur-2xl p-6 flex flex-col shadow-2xl overflow-hidden relative group stitch-glass">
                            <div className="flex items-center justify-between mb-3 shrink-0">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-400">
                                        <HelpCircle className="w-3.5 h-3.5" />
                                    </div>
                                    <span className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em] italic">Mülakat Planı</span>
                                </div>
                                <span className="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[8px] font-black text-emerald-500">HAZIR</span>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar-dark pr-2 space-y-2">
                                {questions.map((q, idx) => (
                                    <button
                                        key={q.id}
                                        onClick={() => setCurrentQuestionIndex(idx)}
                                        className={`w-full text-left p-3 rounded-xl border transition-all relative group/q ${currentQuestionIndex === idx
                                            ? 'bg-violet-600/20 border-violet-500/30'
                                            : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.03]'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className={`text-[8px] font-black ${currentQuestionIndex === idx ? 'text-violet-400' : 'text-white/20'}`}>0{idx + 1}</span>
                                            <p className={`text-[10px] font-bold truncate ${currentQuestionIndex === idx ? 'text-white' : 'text-white/40'}`}>{q.text}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Analitik Gözlem (Redesigned) */}
                        <section className="h-[24%] shrink-0 rounded-[2.5rem] bg-white/[0.03] border border-white/5 backdrop-blur-2xl p-6 space-y-4 relative overflow-hidden group shadow-2xl stitch-glass">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                                        <Activity className="w-3.5 h-3.5" />
                                    </div>
                                    <span className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">Analitik Radar</span>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                                    <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">STAR</span>
                                    <span className="text-xs font-black text-emerald-500">{logicIntegrity}%</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                {Object.entries(starScores).map(([key, value]) => (
                                    <div key={key} className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 group/star hover:bg-white/[0.04] transition-all">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-[8px] font-black text-white/40 uppercase tracking-widest group-hover:text-white transition-colors">
                                                {key === 'S' ? 'Situation' : key === 'T' ? 'Task' : key === 'A' ? 'Action' : 'Result'}
                                            </span>
                                            <span className={`text-[9px] font-black ${value > 70 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                %{value}
                                            </span>
                                        </div>
                                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full transition-all duration-1000 ${key === 'S' ? 'bg-emerald-500' :
                                                    key === 'T' ? 'bg-blue-500' :
                                                        key === 'A' ? 'bg-violet-500' : 'bg-amber-500'
                                                    }`}
                                                style={{ width: `${value}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="p-3 rounded-xl bg-white/[0.01] border border-white/5 flex items-center justify-between overflow-hidden">
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[7px] font-black text-white/30 uppercase tracking-widest">Ses & Enerji Seviyesi</span>
                                    <span className="text-[9px] font-bold text-cyan-400">STABIL SİNYAL</span>
                                </div>
                                <div className="h-4 flex items-end justify-center gap-0.5 w-24">
                                    {waveHeight.map((h, i) => (
                                        <div key={i} className="flex-1 rounded-t-sm bg-cyan-500/30 transition-all duration-300" style={{ height: `${h / 4}%` }} />
                                    ))}
                                </div>
                            </div>
                        </section>

                        {/* AI Coach (Main Interaction Hub) */}
                        <section className="flex-1 rounded-[2.5rem] bg-white/[0.02] border border-white/5 backdrop-blur-3xl p-6 overflow-hidden flex flex-col relative group shadow-2xl stitch-glass">
                            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-all pointer-events-none">
                                <Brain className="w-24 h-24 text-violet-500 blur-sm" />
                            </div>

                            <div className="relative z-10 flex flex-col h-full italic">
                                <header className="flex items-center justify-between mb-4 border-b border-white/5 pb-4">
                                    <div className="flex flex-col">
                                        <h3 className="text-[8px] font-black tracking-[0.3em] text-violet-400 uppercase opacity-60">Autonomous Intelligence</h3>
                                        <p className="text-sm font-black italic uppercase tracking-tighter text-white">Otonom Koç Paneli</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {isRecording && (
                                            <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20">
                                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                                <span className="text-[7px] font-black text-red-500 uppercase tracking-widest">Live STT</span>
                                            </div>
                                        )}
                                        <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center animate-pulse shadow-[0_0_15px_rgba(139,92,246,0.2)]">
                                            <Brain className="w-5 h-5 text-violet-400" />
                                        </div>
                                    </div>
                                </header>

                                <div className="flex-1 overflow-y-auto custom-scrollbar-dark pr-2 mb-4 space-y-3">
                                    {/* Action Content Area */}
                                    {suggestedQuestion ? (
                                        <div className="p-5 rounded-3xl bg-violet-600 border border-violet-400 shadow-[0_0_25px_rgba(139,92,246,0.25)] animate-in slide-in-from-top duration-500">
                                            <div className="flex items-center justify-between mb-2.5">
                                                <div className="flex items-center gap-2">
                                                    <Sparkles className="w-3.5 h-3.5 text-white" />
                                                    <span className="text-[8px] font-black uppercase text-violet-100 italic">AI Stratejik Soru</span>
                                                </div>
                                                <button onClick={() => setSuggestedQuestion(null)} className="text-white/60 hover:text-white transition-colors p-1">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                            <p className="text-[11px] font-black text-white leading-relaxed mb-3">
                                                {suggestedQuestion.question}
                                            </p>
                                            {suggestedQuestion.evaluationHint && (
                                                <div className="p-2.5 bg-white/10 rounded-xl border border-white/10 flex gap-2">
                                                    <Info className="w-3 h-3 text-violet-100 shrink-0 mt-0.5" />
                                                    <p className="text-[9px] text-violet-100/70 font-bold leading-normal italic">{suggestedQuestion.evaluationHint}</p>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="p-4 rounded-[2rem] bg-white/[0.02] border border-white/5 text-center flex flex-col items-center justify-center gap-2 min-h-[100px]">
                                            <Sparkles className="w-4 h-4 text-violet-400/40" />
                                            <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest leading-relaxed px-4">
                                                Adayı yönlendirmek için strateji butonlarını kullanın veya CV'den soru türetin
                                            </p>
                                        </div>
                                    )}

                                    {/* Insights List */}
                                    {aiInsights.map((insight) => (
                                        <div key={insight.id} className={`p-4 rounded-2xl border transition-all animate-fade-in ${insight.type === 'signal' ? 'bg-emerald-500/5 border-emerald-500/10' :
                                            insight.type === 'suggestion' ? 'bg-amber-500/5 border-amber-500/10' :
                                                'bg-white/[0.01] border-white/5'
                                            }`}>
                                            <div className="flex items-center gap-2 mb-2">
                                                {insight.type === 'signal' && <Zap className="w-3 h-3 text-emerald-400" />}
                                                {insight.type === 'suggestion' && <Sparkles className="w-3 h-3 text-amber-400" />}
                                                {insight.type === 'info' && <Info className="w-3 h-3 text-violet-400" />}
                                                <span className={`text-[8px] font-black uppercase tracking-widest ${insight.type === 'signal' ? 'text-emerald-400' :
                                                    insight.type === 'suggestion' ? 'text-amber-400' :
                                                        'text-violet-400'
                                                    }`}>
                                                    {insight.type === 'signal' ? 'Sinyal' : insight.type === 'suggestion' ? 'Öneri' : 'Bilgi'}
                                                </span>
                                            </div>
                                            <p className={`text-[10px] leading-relaxed font-bold ${insight.type === 'suggestion' ? 'text-white' : 'text-white/60'}`}>
                                                {insight.text}
                                            </p>
                                        </div>
                                    ))}
                                </div>

                                {/* Competency Generator Grid (Compact) */}
                                <div className="grid grid-cols-4 gap-2 mb-4">
                                    {[
                                        { id: 'tech', label: 'Teknik', icon: Code, color: 'text-blue-400' },
                                        { id: 'comm', label: 'İletişim', icon: MessageSquare, color: 'text-emerald-400' },
                                        { id: 'leader', label: 'Liderlik', icon: Award, color: 'text-amber-400' },
                                        { id: 'problem', label: 'Analitik', icon: Zap, color: 'text-violet-400' }
                                    ].map((cat) => (
                                        <button
                                            key={cat.id}
                                            onClick={() => handleGenerateAIQuestion('category', cat.label)}
                                            disabled={coachGenerating}
                                            className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all disabled:opacity-50"
                                        >
                                            <cat.icon className={`w-3 h-3 ${cat.color}`} />
                                            <span className="text-[7px] font-black uppercase tracking-tighter text-white/40">{cat.label}</span>
                                        </button>
                                    ))}
                                </div>

                                {/* AI Interaction Controls */}
                                <div className="flex items-center gap-2 mt-auto">
                                    <button
                                        onClick={() => handleGenerateAIQuestion('deepen')}
                                        disabled={coachGenerating}
                                        className="flex-1 h-11 rounded-xl bg-violet-600 border border-violet-400 text-[9px] font-black uppercase tracking-widest text-white shadow-lg shadow-violet-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        <Target className="w-3.5 h-3.5" />
                                        Derinleş
                                    </button>
                                    <button
                                        onClick={() => handleGenerateAIQuestion('resume')}
                                        disabled={coachGenerating}
                                        className="flex-1 h-11 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        <Box className="w-3.5 h-3.5" />
                                        CV Sorusu
                                    </button>
                                </div>
                            </div>
                        </section>

                        {/* Live Transcript (Compact Drawer at Bottom) */}
                        <section className="h-[12%] shrink-0 rounded-[2.5rem] bg-black/40 border border-white/5 backdrop-blur-3xl p-5 flex flex-col shadow-2xl overflow-hidden relative group">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                                    <span className="text-[8px] font-black text-cyan-400 uppercase tracking-[0.2em] italic">Canlı Transcript</span>
                                </div>
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/5 border border-white/10">
                                    <Activity className="w-2.5 h-2.5 text-white/20" />
                                    <span className="text-[7px] font-bold text-white/40 uppercase">Aktif Dinleme</span>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar-dark pr-2 space-y-2" ref={transcriptRef}>
                                {transcript.slice(-3).map((line, idx) => {
                                    const isSystem = line.role === 'SYSTEM';
                                    const isAday = line.role === 'ADAY';
                                    return (
                                        <div key={idx} className="animate-fade-in transition-all">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-1.5 py-0.5 rounded-md border text-[7px] font-black uppercase tracking-widest ${isSystem ? 'bg-white/5 border-white/10 text-white/40' :
                                                        isAday ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' :
                                                            'bg-violet-500/10 border-violet-500/20 text-violet-400'
                                                        }`}>
                                                        {line.role}
                                                    </span>
                                                    <span className="text-[7px] font-medium text-white/20">{line.time}</span>
                                                </div>
                                                <p className={`text-[10px] leading-relaxed font-bold ${isSystem ? 'text-white/30 italic' : 'text-white/70'}`}>
                                                    {line.text}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                                {isRecording && (
                                    <div className="animate-pulse flex items-center gap-2 italic">
                                        <span className="text-[7px] font-black text-cyan-500/50 uppercase">Dinleniyor...</span>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                )}
            </div>

            {/* Global Settings Modal for Active Phase */}
            {showSettings && <SettingsModal onClose={() => setShowSettings(false)} devices={devices} selectedDevices={selectedDevices} onDeviceChange={changeDevice} />}

            {/* Background elements */}
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-violet-600/5 rounded-full blur-[180px] pointer-events-none -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-cyan-600/5 rounded-full blur-[180px] pointer-events-none translate-y-1/2 -translate-x-1/2" />
        </div>
    );
}

