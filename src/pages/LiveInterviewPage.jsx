// src/pages/LiveInterviewPage.jsx
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Video, Mic, MicOff, VideoOff, Settings, X,
    ShieldCheck, Camera, Monitor, Sparkles, Brain, Zap,
    MessageSquare, Users, AlertCircle, CheckCircle2,
    Send, Play, Info, Copy, Check, ChevronRight, HelpCircle, Activity, ArrowRight,
    Target, Box, Code, Loader2, AlertTriangle, TrendingUp, Award, ChevronDown, RefreshCw, User, Flag, Star, FileText, ExternalLink
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
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-white font-sans">
            <div className="text-center space-y-4">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto animate-pulse" />
                <h1 className="text-2xl font-black italic uppercase tracking-tighter">Oturum Doğrulanamadı</h1>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Lütfen giriş yaparak tekrar deneyin.</p>
                <button 
                  onClick={() => navigate('/')}
                  className="mt-6 px-8 py-3 bg-white text-black rounded-2xl font-black text-[11px] uppercase tracking-widest"
                >
                  Ana Sayfaya Dön
                </button>
            </div>
        </div>
    );

    if (!candidateData && !candidatesLoading) {
        return (
            <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-6 gap-6 text-white font-sans italic">
                <div className="w-20 h-20 rounded-3xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                    <AlertCircle className="w-10 h-10 text-amber-500" />
                </div>
                <div className="text-center space-y-2">
                    <h1 className="text-2xl font-black italic uppercase tracking-tighter">Oturum Geçersiz</h1>
                    <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest max-w-xs mx-auto">
                        Mülakat kaydı bulunamadı veya bu seans için yetkiniz yok.
                    </p>
                </div>
                <button
                    onClick={() => navigate('/')}
                    className="px-10 py-4 rounded-2xl bg-white text-black text-[11px] font-black uppercase tracking-widest shadow-2xl hover:scale-105 transition-all"
                >
                    Kontrol Paneline Dön
                </button>
            </div>
        );
    }

    if (!candidateData) return <LoadingScreen message="Oturum doğrulanıyor..." />;

    if (phase === 'lobby') {
        if (isRecruiter) {
            return (
                <div className="min-h-screen bg-[#F0F2F5] font-sans flex flex-col text-[#1E293B] overflow-hidden">
                    <header className="h-[72px] bg-white border-b border-slate-200 flex items-center justify-between px-10 shrink-0 z-20">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-[#0F172A] flex items-center justify-center shadow-2xl shadow-[#0F172A]/20">
                                <Video className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] leading-none mb-1">Mülakatlar</h1>
                                <h2 className="text-[15px] font-black text-[#0F172A] uppercase tracking-tighter italic">Pre-flight Kontrolü</h2>
                            </div>
                        </div>
                        <div className="flex items-center gap-8">
                            <div className="flex items-center gap-6">
                                <button onClick={() => setShowSettings(true)} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 hover:bg-slate-100 transition-all"><Settings className="w-5 h-5" /></button>
                                <button className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 hover:bg-slate-100 transition-all"><HelpCircle className="w-5 h-5" /></button>
                            </div>
                            <div className="h-10 w-px bg-slate-200" />
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <p className="text-[13px] font-black text-[#0F172A] uppercase tracking-tight">{userProfile?.name || 'Ahmet Yılmaz'}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Senior Recruiter</p>
                                </div>
                                <div className="w-12 h-12 rounded-2xl bg-slate-100 border-2 border-white shadow-lg flex items-center justify-center overflow-hidden">
                                     <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Ahmet" alt="User" />
                                </div>
                            </div>
                        </div>
                    </header>

                    <main className="flex-1 p-10 flex gap-10 max-w-[1800px] mx-auto w-full overflow-hidden">
                        {/* Sol Panel: Kamera ve Aday Özeti */}
                        <div className="w-[450px] flex flex-col gap-8 shrink-0">
                            <div className="relative aspect-[4/3] rounded-[3rem] bg-[#0F172A] overflow-hidden shadow-2xl group border-4 border-white">
                                {isVideoOn && stream ? (
                                    <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                                        <Camera className="w-12 h-12 text-white/10" />
                                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Cihaz Bekleniyor</span>
                                    </div>
                                )}
                                <div className="absolute top-4 right-4 px-4 py-2 bg-emerald-500/90 backdrop-blur-md rounded-2xl flex items-center gap-2 border border-emerald-400/50">
                                    <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                    <span className="text-[9px] font-black text-white uppercase tracking-widest">Sistem Hazır</span>
                                </div>
                                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/40 backdrop-blur-2xl p-2.5 rounded-[2rem] border border-white/10 opacity-0 group-hover:opacity-100 transition-all duration-500">
                                    <button onClick={() => setIsVideoOn(!isVideoOn)} className={"w-12 h-12 rounded-xl flex items-center justify-center " + (isVideoOn ? 'bg-white/10 text-white' : 'bg-red-500 text-white')}>
                                        {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                                    </button>
                                    <button onClick={() => setIsMicOn(!isMicOn)} className={"w-12 h-12 rounded-xl flex items-center justify-center " + (isMicOn ? 'bg-white/10 text-white' : 'bg-red-500 text-white')}>
                                        {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white rounded-[3rem] p-8 border border-slate-200 shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-bl-[5rem] -mr-10 -mt-10" />
                                <div className="flex items-center gap-5 relative z-10 mb-8">
                                    <div className="w-20 h-20 rounded-[2rem] bg-slate-100 overflow-hidden border-4 border-white shadow-xl">
                                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${candidateData?.name}`} alt="Candidate" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <h3 className="text-2xl font-black text-[#0F172A] tracking-tighter italic uppercase">{candidateData?.name}</h3>
                                            <div className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full flex items-center gap-1.5 border border-emerald-100">
                                                <Sparkles className="w-3 h-3" />
                                                <span className="text-[9px] font-black uppercase tracking-widest">AI SKOR: 88</span>
                                            </div>
                                        </div>
                                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none">Senior Product Designer</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-100">
                                    <div>
                                        <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] mb-1">Tecrübe</p>
                                        <p className="text-[13px] font-black text-[#0F172A] italic uppercase">8+ Yıl</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] mb-1">Lokasyon</p>
                                        <p className="text-[13px] font-black text-[#0F172A] italic uppercase">İstanbul (Remote)</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="bg-[#F0FDF4] rounded-[2.5rem] p-6 border border-emerald-100 flex items-start gap-4">
                                <div className="w-10 h-10 rounded-2xl bg-white border border-emerald-200 flex items-center justify-center shrink-0">
                                    <Brain className="w-5 h-5 text-emerald-500" />
                                </div>
                                <div>
                                    <h4 className="text-[10px] font-black text-emerald-800 uppercase tracking-widest mb-1 italic">AI Mülakat Notu</h4>
                                    <p className="text-[11px] font-bold text-emerald-600/80 leading-snug italic">
                                        Aday, kompleks sistem tasarımı konusunda teknik olarak çok güçlü ancak kriz yönetimi senaryolarında daha derinlemesine sorgulanması önerilir.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Orta/Sağ Panel: Strateji ve Başlat */}
                        <div className="flex-1 flex flex-col gap-8 overflow-hidden">
                            <div className="bg-white rounded-[3.5rem] p-10 border border-slate-200 shadow-2xl flex-1 flex flex-col overflow-hidden">
                                <div className="flex items-center justify-between mb-8 pb-8 border-b border-slate-100">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                                            <FileText className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black text-[#0F172A] tracking-tighter italic uppercase">Seçilen Soru Seti: Ürün Tasarımı - Senior</h3>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Eşleşme Oranı %92 • 12 Soru Tanımlı</p>
                                        </div>
                                    </div>
                                    <button className="text-[10px] font-black text-blue-600 uppercase tracking-widest border-b-2 border-blue-600 pb-1 hover:text-blue-700 transition-colors">Seti Değiştir</button>
                                </div>

                                <div className="flex-1 overflow-y-auto space-y-4 pr-4">
                                    {questions.map((q, idx) => (
                                        <div key={q.id} className="group flex items-center gap-6 p-6 rounded-[2rem] border-2 border-slate-50 hover:border-blue-100 hover:bg-blue-50/30 transition-all">
                                            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-[15px] font-black text-[#0F172A] group-hover:bg-white transition-all shadow-sm">
                                                {String(idx + 1).padStart(2, '0')}
                                            </div>
                                            <p className="flex-1 text-[13px] font-bold text-[#475569] leading-relaxed italic line-clamp-2">
                                                {q.text}
                                            </p>
                                            <div className="px-4 py-1.5 rounded-xl bg-white border border-slate-100 text-[9px] font-black text-slate-400 uppercase tracking-widest">{q.category}</div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-8 pt-8 flex items-center gap-8 border-t border-slate-100">
                                    <div className="flex-1 bg-blue-50/50 rounded-[2.5rem] p-6 border border-blue-100 flex items-center gap-6">
                                        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white shrink-0">
                                            <Info className="w-5 h-5" />
                                        </div>
                                        <p className="text-[11px] font-bold text-blue-800 italic leading-snug">
                                            Mülakat süresi <span className="font-black">45 dakika</span> olarak planlanmıştır. Butona tıkladığınızda aday bekleme odasından görüşmeye alınacaktır.
                                        </p>
                                    </div>
                                    <button 
                                        onClick={() => setPhase('active')}
                                        disabled={!selectedPathId || pathLoading}
                                        className="h-[80px] px-12 rounded-[2.5rem] bg-[#0F172A] hover:bg-black text-white font-black text-base transition-all shadow-2xl flex items-center gap-6 italic group min-w-[300px]"
                                    >
                                        Mülakatı Başlat <Play className="w-6 h-6 fill-current group-hover:translate-x-2 transition-transform" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            );
        } else {
            // Aday Hazırlık Odası
            return (
                <div className="min-h-screen bg-[#F0F2F5] font-sans flex flex-col items-center justify-center p-8 text-[#1E293B] italic overflow-hidden">
                    <div className="max-w-[1400px] w-full flex flex-col gap-12">
                        <div className="flex flex-col items-center text-center">
                            <h1 className="text-[64px] font-black text-[#0F172A] tracking-tighter uppercase italic leading-[0.9] mb-4">Mülakata <span className="text-blue-600 underline underline-offset-8">Hazır Mısın?</span></h1>
                            <p className="text-lg font-bold text-slate-400 max-w-2xl">Cihazlarınızı kontrol edin ve hazır olduğunuzda giriş yapın. Mülakat odasına bağlanmadan önceki son adımdasınız.</p>
                        </div>

                        <div className="grid grid-cols-12 gap-10">
                            <div className="col-span-12 lg:col-span-7 flex flex-col gap-6">
                                <div className="relative aspect-video rounded-[3.5rem] bg-slate-200 overflow-hidden shadow-2xl border-4 border-white group">
                                    {isVideoOn && stream ? (
                                        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950">
                                            <Camera className="w-20 h-20 text-white/10" />
                                        </div>
                                    )}
                                    <div className="absolute top-8 right-8 px-5 py-2.5 bg-emerald-500 rounded-3xl flex items-center gap-2 border border-emerald-400 shadow-xl">
                                        <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                                        <span className="text-[10px] font-black text-white uppercase tracking-widest">SİNYAL GÜÇLÜ</span>
                                    </div>
                                    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white/10 backdrop-blur-3xl p-3 rounded-[2.5rem] border border-white/20">
                                        <button onClick={() => setIsMicOn(!isMicOn)} className={"w-14 h-14 rounded-2xl flex items-center justify-center transition-all " + (isMicOn ? 'bg-white text-black shadow-xl' : 'bg-red-500 text-white')}>
                                            {isMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                                        </button>
                                        <button onClick={() => setIsVideoOn(!isVideoOn)} className={"w-14 h-14 rounded-2xl flex items-center justify-center transition-all " + (isVideoOn ? 'bg-white text-black shadow-xl' : 'bg-red-500 text-white')}>
                                            {isVideoOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                                        </button>
                                        <button onClick={() => setShowSettings(true)} className="w-14 h-14 rounded-2xl bg-white/20 text-white flex items-center justify-center hover:bg-white hover:text-black transition-all">
                                            <Settings className="w-6 h-6" />
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-6">
                                    <div className="bg-white/40 backdrop-blur-md rounded-[2.5rem] p-6 border border-white border-white/50 flex items-center gap-4 shadow-sm">
                                        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100"><Mic className="w-6 h-6" /></div>
                                        <div>
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">MİKROFON</p>
                                            <p className="text-[12px] font-black text-[#0F172A] italic uppercase truncate">MacBook Pro Mic</p>
                                        </div>
                                    </div>
                                    <div className="bg-white/40 backdrop-blur-md rounded-[2.5rem] p-6 border border-white border-white/50 flex items-center gap-4 shadow-sm">
                                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100"><Camera className="w-6 h-6" /></div>
                                        <div>
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">KAMERA</p>
                                            <p className="text-[12px] font-black text-[#0F172A] italic uppercase truncate">FaceTime HD</p>
                                        </div>
                                    </div>
                                    <div className="bg-white/40 backdrop-blur-md rounded-[2.5rem] p-6 border border-white border-white/50 flex items-center gap-4 shadow-sm">
                                        <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100"><Zap className="w-6 h-6" /></div>
                                        <div>
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">BAĞLANTI</p>
                                            <p className="text-[12px] font-black text-[#0F172A] italic uppercase truncate">120 Mbps (Fiber)</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="col-span-12 lg:col-span-5 flex flex-col gap-6">
                                <div className="bg-white rounded-[3.5rem] p-10 border border-slate-200 shadow-2xl relative overflow-hidden flex-1">
                                    <div className="flex items-center gap-5 mb-10">
                                        <div className="w-16 h-16 rounded-[1.5rem] bg-indigo-950 overflow-hidden shadow-xl border-4 border-white flex items-center justify-center">
                                             <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Caner" alt="Recruiter" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black text-[#0F172A] tracking-tighter italic uppercase">Caner Yıldırım</h3>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Kıdemli İK Yöneticisi</p>
                                            <div className="flex gap-1.5 mt-2">
                                                <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md text-[8px] font-black uppercase">Teknoloji</span>
                                                <span className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded-md text-[8px] font-black uppercase">10+ Yıl Deneyim</span>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-[13px] font-bold text-slate-500 leading-relaxed italic border-l-4 border-blue-600 pl-6 py-4 mb-10">
                                        "Geleceğin liderlerini arıyoruz. Bugün sizinle teknik yetkinliklerinizin yanı sıra problem çözme yaklaşımınızı konuşacağız."
                                    </p>
                                    
                                    <div className="bg-slate-50/80 rounded-[2rem] p-8 border border-slate-100 mb-10">
                                        <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                                            <ShieldCheck className="w-5 h-5 text-emerald-500" /> MÜLAKAT KURALLARI
                                        </h4>
                                        <div className="space-y-4">
                                            {[
                                                "Sessiz ve iyi aydınlatılmış bir ortamda bulunduğunuzdan emin olun.",
                                                "Mülakat süresince internet tarayıcınızda başka sekme açmayın.",
                                                "Mülakat kaydedilecektir. Gizlilik sözleşmesi geçerlidir."
                                            ].map((rule, idx) => (
                                                <div key={idx} className="flex gap-4 items-start">
                                                    <div className="w-6 h-6 rounded-full bg-black text-white text-[10px] font-black flex items-center justify-center shrink-0">{idx + 1}</div>
                                                    <p className="text-[12px] font-bold text-slate-500 leading-tight italic">{rule}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3 px-6">
                                            <input type="checkbox" checked={hasConsent} onChange={(e) => setHasConsent(e.target.checked)} id="kvkk" className="w-5 h-5 accent-blue-600 cursor-pointer" />
                                            <label htmlFor="kvkk" className="text-[11px] font-black text-slate-500 uppercase italic cursor-pointer">KVKK Şartlarını Onaylıyorum</label>
                                        </div>
                                        <button 
                                            onClick={() => setPhase('active')}
                                            disabled={!hasConsent}
                                            className="w-full h-20 rounded-[2.5rem] bg-indigo-950 hover:bg-black text-white font-black text-lg transition-all shadow-2xl flex items-center justify-center gap-6 italic group disabled:opacity-20"
                                        >
                                            <span className="relative z-10">MÜLAKATA KATIL</span>
                                            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all">
                                                <Zap className="w-6 h-6" />
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
    }

    return (
        <div className="fixed inset-0 z-[200] bg-slate-50 flex flex-col overflow-hidden text-slate-900 font-sans italic">
            <header className="h-[64px] shrink-0 border-b border-slate-200 bg-white px-8 flex items-center justify-between z-20">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
                            <Video className="w-5 h-5 text-white" />
                        </div>
                        <h2 className="text-[13px] font-black text-slate-900 uppercase tracking-tighter italic">Live Interview</h2>
                    </div>
                </div>
                <button
                    onClick={handleFinishInterview}
                    className="px-8 py-3 rounded-[1.2rem] bg-red-600 text-white hover:bg-red-700 font-black text-[11px] tracking-widest uppercase transition-all italic"
                >
                    Mülakatı Sonlandır
                </button>
            </header>
            <div className="flex-1 flex p-6 gap-6 overflow-hidden">
                <div className="flex-1 bg-slate-900 rounded-[3.5rem] relative overflow-hidden shadow-2xl border-[6px] border-white group/video transition-all">
                     <div className="absolute inset-0 bg-zinc-950">
                         {(stream || !isRecruiter) ? (
                            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                         ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                 <User className="w-40 h-40 text-white/5 blur-sm" />
                            </div>
                         )}
                     </div>
                     
                     <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 z-30 opacity-0 group-hover/video:opacity-100 transition-all bg-black/40 backdrop-blur-3xl px-6 py-4 rounded-[2.5rem] border border-white/10">
                         <button onClick={() => setIsMicOn(!isMicOn)} className={"w-14 h-14 rounded-2xl flex items-center justify-center transition-all " + (isMicOn ? 'bg-white/10 text-white' : 'bg-red-600 text-white')}>
                             {isMicOn ? <Mic className="w-6 h-6"/> : <MicOff className="w-6 h-6"/>}
                         </button>
                         <button onClick={() => setIsVideoOn(!isVideoOn)} className={"w-14 h-14 rounded-2xl flex items-center justify-center transition-all " + (isVideoOn ? 'bg-white/10 text-white' : 'bg-red-600 text-white')}>
                             {isVideoOn ? <Video className="w-6 h-6"/> : <VideoOff className="w-6 h-6"/>}
                         </button>
                         <button onClick={handleFinishInterview} className="w-14 h-14 rounded-2xl bg-red-600 text-white flex items-center justify-center hover:scale-110 transition-all">
                             <X className="w-6 h-6"/>
                         </button>
                     </div>
                </div>

                {isRecruiter ? (
                    <div className="w-[420px] flex flex-col gap-6 shrink-0 relative z-30">
                        <section className="bg-white rounded-[3rem] p-8 border border-slate-200 shadow-2xl flex-1 flex flex-col overflow-hidden">
                             <div className="flex items-center justify-between mb-6">
                                <h3 className="text-[14px] font-black text-slate-900 uppercase italic tracking-tighter">Analytical Radar</h3>
                                <div className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[9px] font-black uppercase">Canlı Analiz</div>
                             </div>
                             <div className="flex-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
                                 {Object.entries(starScores).map(([key, value]) => (
                                     <div key={key} className="space-y-2">
                                         <div className="flex items-center justify-between text-[11px] font-black text-slate-400">
                                             <span className="uppercase">{key}</span>
                                             <span className="text-blue-600 font-black">{value}%</span>
                                         </div>
                                         <div className="h-2 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
                                              <div 
                                                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-1000" 
                                                style={{width: value + '%' }} 
                                              />
                                         </div>
                                     </div>
                                 ))}
                             </div>
                             <div className="mt-8 pt-6 border-t border-slate-100">
                                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                       <p className="text-[10px] font-black text-slate-400 uppercase mb-2">AI Özet Önerisi</p>
                                       <p className="text-[11px] font-bold text-slate-600 italic leading-relaxed">
                                            Adayın deneyimi teorik olarak güçlü, şimdi teknik mimari detaylarına odaklanın.
                                       </p>
                                  </div>
                             </div>
                        </section>

                        <section className="bg-slate-900 rounded-[3rem] border border-white/10 h-[35%] flex flex-col overflow-hidden shadow-2xl p-8">
                             <div className="flex items-center gap-3 mb-6">
                                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                                    <Brain className="w-4 h-4 text-white" />
                                </div>
                                <h3 className="text-[12px] font-black text-white uppercase italic tracking-widest">AI Recruiter Assistant</h3>
                             </div>
                             <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar" ref={transcriptRef}>
                                  {transcript.slice(-3).map((line, idx) => (
                                       <div key={idx} className="p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all">
                                            <p className="text-[12px] font-medium text-white/90 italic leading-relaxed">"{line.text}"</p>
                                       </div>
                                  ))}
                                  {transcript.length === 0 && (
                                      <div className="flex flex-col items-center justify-center h-full text-center opacity-30">
                                          <Mic className="w-8 h-8 text-white mb-2 animate-pulse" />
                                          <p className="text-[10px] font-black text-white uppercase">Dinleniyor...</p>
                                      </div>
                                  )}
                             </div>
                        </section>
                    </div>
                ) : (
                    <div className="w-[420px] flex flex-col gap-6 shrink-0 relative z-30">
                        <section className="bg-white rounded-[3.5rem] border border-slate-200 flex-1 flex flex-col overflow-hidden shadow-2xl p-8">
                             <h3 className="text-[14px] font-black text-slate-900 uppercase italic tracking-tighter mb-8 border-l-4 border-blue-600 pl-4">Mülakat Akışı</h3>
                             <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                                  {questions.map((q, idx) => (
                                      <div key={idx} className={"p-6 rounded-3xl border transition-all duration-500 " + (idx === currentQuestionIndex ? 'border-blue-600 bg-blue-50/50 shadow-lg scale-[1.02]' : 'opacity-30 grayscale border-slate-100')}>
                                           <div className="flex items-center gap-3 mb-2">
                                                <div className={"w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black " + (idx === currentQuestionIndex ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400')}>
                                                    {idx + 1}
                                                </div>
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Soru</span>
                                           </div>
                                           <p className="text-[14px] font-black text-[#0F172A] italic tracking-tight leading-snug">"{q.text}"</p>
                                      </div>
                                  ))}
                             </div>
                             <div className="mt-8 p-6 bg-slate-950 rounded-[2.5rem] text-white flex items-center justify-between">
                                 <div>
                                     <p className="text-[9px] font-black text-slate-500 uppercase mb-1">Kalan Süre</p>
                                     <p className="text-xl font-black italic tracking-tighter">24:15</p>
                                 </div>
                                 <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                                     <Zap className="w-6 h-6 text-emerald-400 animate-pulse" />
                                 </div>
                             </div>
                        </section>
                    </div>
                )}
            </div>

            {showSettings && (
                <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-3xl flex items-center justify-center p-8">
                    <div className="bg-white w-full max-w-2xl rounded-[4rem] p-12 shadow-2xl border border-white/20">
                        <div className="flex items-center justify-between mb-10">
                            <h2 className="text-3xl font-black text-[#0F172A] italic uppercase tracking-tighter">Cihaz Ayarları</h2>
                            <button onClick={() => setShowSettings(false)} className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-black hover:text-white transition-all">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="space-y-8">
                            <div className="space-y-4">
                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-4">Kamera Seçimi</label>
                                <select className="w-full h-16 bg-slate-50 border border-slate-200 rounded-3xl px-8 font-bold italic outline-none focus:border-blue-600 transition-all appearance-none cursor-pointer">
                                    {devices.filter(d => d.kind === 'videoinput').map(d => (
                                        <option key={d.deviceId} value={d.deviceId}>{d.label || `Kamera ${d.deviceId.slice(0,5)}`}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-4">
                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-4">Mikrofon Seçimi</label>
                                <select className="w-full h-16 bg-slate-50 border border-slate-200 rounded-3xl px-8 font-bold italic outline-none focus:border-blue-600 transition-all appearance-none cursor-pointer">
                                    {devices.filter(d => d.kind === 'audioinput').map(d => (
                                        <option key={d.deviceId} value={d.deviceId}>{d.label || `Mikrofon ${d.deviceId.slice(0,5)}`}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <button onClick={() => setShowSettings(false)} className="w-full h-20 rounded-[2.5rem] bg-blue-600 hover:bg-blue-700 text-white font-black text-lg mt-12 transition-all shadow-xl shadow-blue-500/20 italic">
                            AYARLARI KAYDET
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

