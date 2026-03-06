// src/components/LiveObserverPanel.jsx
import { useState, useEffect, useRef } from 'react';
import {
    MicOff, Mic, Waves, LineChart,
    Sparkles, AlertTriangle, TrendingUp, RefreshCw,
    MessageSquare, CheckCircle, HelpCircle,
    ShieldCheck, Eye, Activity, Cpu, Loader2
} from 'lucide-react';
import { checkStarLogicGemini, checkAudioLogicGemini } from '../services/ai/gemini-logic';
import { getModel } from '../services/ai/config';

export default function LiveObserverPanel({ candidate, onTranscriptUpdate, onAiSuggest, onLogicUpdate, isActive = true }) {
    const [isListening, setIsListening] = useState(false);
    const [isJoining, setIsJoining] = useState(false);
    const [meetingUrl, setMeetingUrl] = useState('');
    const [botStatus, setBotStatus] = useState('idle'); // idle, joining, connected
    const [transcriptFeed, setTranscriptFeed] = useState([]);
    const [starScores, setStarScores] = useState({ S: 0, T: 0, A: 0, R: 0 });
    const [currentAiInsight, setCurrentAiInsight] = useState(null);
    const [logicIntegrity, setLogicIntegrity] = useState(0);
    const [lastTranscriptChunk, setLastTranscriptChunk] = useState('');
    const [botLogs, setBotLogs] = useState([]);
    const [presenceData, setPresenceData] = useState({ participantCount: 1, signalQuality: 'EXCELLENT' });
    const [captureInterviewer, setCaptureInterviewer] = useState(false);

    const mediaRecorderRef = useRef(null);
    const recognitionRef = useRef(null);
    const audioChunksRef = useRef([]);
    const isListeningRef = useRef(false);
    const activeStreamsRef = useRef([]);
    const interviewerGainRef = useRef(null);

    // Simulate waveform
    const [waveHeight, setWaveHeight] = useState([20, 40, 60, 30, 80, 40, 20]);

    useEffect(() => {
        let animationFrame;
        let audioContext;
        let analyser;

        if (isListening && mediaRecorderRef.current?.stream) {
            try {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const source = audioContext.createMediaStreamSource(mediaRecorderRef.current.stream);
                analyser = audioContext.createAnalyser();
                analyser.fftSize = 32;
                source.connect(analyser);

                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);

                const updateWave = () => {
                    analyser.getByteFrequencyData(dataArray);
                    const values = Array.from(dataArray).slice(0, 7).map(v => (v / 255) * 100);
                    setWaveHeight(values);
                    animationFrame = requestAnimationFrame(updateWave);
                };
                updateWave();
            } catch (e) {
                console.error("Visualizer error:", e);
            }
        }

        return () => {
            if (animationFrame) cancelAnimationFrame(animationFrame);
            if (audioContext) audioContext.close();
        };
    }, [isListening, botStatus]);

    useEffect(() => {
        if (interviewerGainRef.current) {
            interviewerGainRef.current.gain.value = captureInterviewer ? 1.0 : 0;
        }
    }, [captureInterviewer]);

    useEffect(() => {
        if (isActive === false && isListeningRef.current) {
            stopListening();
        }
    }, [isActive]);

    const handleJoinMeeting = async (isLocalTest = false) => {
        if (!isLocalTest && !meetingUrl) return alert("Lütfen mülakat (Meet/Zoom/Teams) linkini giriniz veya 'Hızlı Test' butonunu kullanın.");
        setIsJoining(true);
        setBotStatus('joining');

        let tempHostname = "REMOTE";
        try { if (meetingUrl) tempHostname = new URL(meetingUrl).hostname; } catch (e) { tempHostname = "EXTERNAL"; }

        const logSequence = isLocalTest ? [
            "Initializing Local Diagnostic Mode...",
            "Accessing System Audio Bridge...",
            "Establishing Local Neural Link...",
            "Diagnostic Success. Agent Ready."
        ] : [
            "Initializing Shadow Bot Protocol...",
            `Establishing connection to ${tempHostname}...`,
            "Searching for meeting room instance...",
            "Requesting admission to meeting...",
            "Awaiting Host approval (Waiting Room)..."
        ];

        let i = 0;
        const logInterval = setInterval(() => {
            if (i < logSequence.length) {
                setBotLogs(prev => [...prev.slice(-4), logSequence[i]]);
                i++;
            } else {
                clearInterval(logInterval);
                finishJoining();
            }
        }, 800);
    };

    const finishJoining = async () => {
        setBotLogs(prev => [...prev.slice(-4), "✅ BOT ADMITTED. Audio tunnel established."]);
        await startListening();
        setIsJoining(false);
        setBotStatus('connected');
        setPresenceData(prev => ({ ...prev, participantCount: 2 }));
    };

    const startListening = async () => {
        try {
            const displayStream = await navigator.mediaDevices.getDisplayMedia({
                video: { width: 1, height: 1 },
                audio: true
            });

            if (displayStream.getAudioTracks().length === 0) {
                alert("UYARI: Toplantı sesini yakalayamadım. Lütfen paylaşım yaparken 'Sekme Sesini Paylaş' kutucuğunu işaretleyin.");
            }

            const userMicStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            activeStreamsRef.current = [displayStream, userMicStream];

            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') await audioCtx.resume();

            const dest = audioCtx.createMediaStreamDestination();

            // GAIN STAGE: Boost audio for better Gemini recognition
            const gainNode1 = audioCtx.createGain(); // Candidate (Display)
            const gainNode2 = audioCtx.createGain(); // Interviewer (Mic)

            gainNode1.gain.value = 1.5;
            gainNode2.gain.value = captureInterviewer ? 1.0 : 0; // Controlled by toggle

            interviewerGainRef.current = gainNode2;

            const source1 = audioCtx.createMediaStreamSource(displayStream);
            const source2 = audioCtx.createMediaStreamSource(userMicStream);

            source1.connect(gainNode1);
            source2.connect(gainNode2);
            gainNode1.connect(dest);
            gainNode2.connect(dest);

            const mixedStream = dest.stream;

            isListeningRef.current = true;
            setIsListening(true);
            setBotStatus('connected');
            setBotLogs(prev => [...prev.slice(-3), "🤝 BI-DIRECTIONAL BRIDGE: Listening to both participants..."]);

            const recordCycle = () => {
                if (!isListeningRef.current) return;

                let mimeType = 'audio/webm;codecs=opus';
                if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/webm';

                const recorder = new MediaRecorder(mixedStream, { mimeType });
                mediaRecorderRef.current = recorder;
                const chunks = [];

                recorder.ondataavailable = (e) => {
                    if (e.data.size > 0) chunks.push(e.data);
                };

                recorder.onstop = async () => {
                    if (chunks.length > 0 && isListeningRef.current) {
                        const blob = new Blob(chunks, { type: mimeType });
                        const reader = new FileReader();
                        reader.readAsDataURL(blob);
                        reader.onloadend = async () => {
                            const base64Audio = reader.result.split(',')[1];
                            await processAudioSegment(base64Audio);
                        };
                    }
                    if (isListeningRef.current) recordCycle();
                };

                recorder.start();
                // Increased to 8 seconds for more stable processing
                setTimeout(() => {
                    if (recorder.state === 'recording') recorder.stop();
                }, 8000);
            };

            recordCycle();
        } catch (err) {
            console.error("Audio capture error:", err);
            setBotStatus('idle');
            setIsListening(false);
            if (err.name === 'NotAllowedError') {
                alert("Mülakatı analiz edebilmem için 'Toplantı Sekmesini' seçmeniz ve 'SİSTEM SESİNİ PAYLAŞ' kutucuğunu işaretlemeniz şarttır.");
            }
        }
    };

    const stopListening = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }

        // Comprehensive Cleanup
        activeStreamsRef.current.forEach(s => s.getTracks().forEach(t => t.stop()));
        activeStreamsRef.current = [];

        isListeningRef.current = false;
        setIsListening(false);
        setBotStatus('idle');
    };

    const processAudioSegment = async (base64Audio) => {
        if (!base64Audio || !isListeningRef.current) return;

        try {
            // PRO MODE: Use Gemini 2.0 Native Audio Modality
            // This is significantly more accurate than browser SpeechRecognition
            const analysis = await checkAudioLogicGemini(base64Audio, 'audio/webm', { candidate });

            if (analysis && analysis.transcript) {
                const text = analysis.transcript.trim();
                setTranscriptFeed(prev => [...prev.slice(-10), { text, id: Date.now() }]);
                setLastTranscriptChunk(text);
                onTranscriptUpdate?.(text);

                if (analysis.scores) {
                    const integrity = Math.round(Object.values(analysis.scores).reduce((a, b) => a + b, 0) / 4);
                    setStarScores(analysis.scores);
                    setCurrentAiInsight(analysis.feedback);
                    setLogicIntegrity(integrity);
                    onLogicUpdate?.({ scores: analysis.scores, integrity: integrity });
                    if (analysis.suggestedFollowUp) onAiSuggest?.(analysis.suggestedFollowUp);
                }
            }
        } catch (e) {
            console.error("Gemini Audio Analysis Error:", e);
        }
    };

    const processMockChunk = () => {
        const mockChunks = [
            "Müşteri deneyimini iyileştirmek için mikroservis mimarisinde Redis katmanını optimize ettik.",
            "Backend'de Node.js ve MongoDB kullanarak 100k+ kullanıcıya hizmet veren bir yapı kurdum.",
            "Anlık yük altında sistem performansını %40 oranında artırdık.",
            "Özellikle son çeyrekte teknik borçları azaltarak hızı iki katına çıkardık."
        ];
        const nextChunk = mockChunks[Math.floor(Math.random() * mockChunks.length)];
        setTranscriptFeed(prev => [...prev, { text: nextChunk, id: Date.now() }]);
        onTranscriptUpdate?.(nextChunk);
    };

    const STAR_LABELS = { S: 'Situation', T: 'Task', A: 'Action', R: 'Result' };
    const STAR_COLORS = {
        S: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
        T: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
        A: 'text-violet-600 dark:text-violet-400 bg-violet-500/10',
        R: 'text-amber-600 dark:text-amber-400 bg-amber-500/10'
    };

    return (
        <div className="flex flex-col h-full bg-bg-primary/60 backdrop-blur-md border-l border-border-subtle w-[360px] shadow-2xl overflow-hidden relative tech-grid shrink-0 animate-in slide-in-from-right duration-700">
            {/* Background Ornaments */}
            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-electric/5 to-transparent pointer-events-none" />

            {/* Header: Cyber Status */}
            <div className="p-5 border-b border-border-subtle flex items-center justify-between relative z-10 bg-bg-secondary/40 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${isListening ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)] animate-pulse' : 'bg-bg-secondary shadow-inner'}`} />
                    <h3 className="text-[11px] font-black text-text-primary tracking-[0.2em] uppercase opacity-90">OBSERVER HUD</h3>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-cyan-500 px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 shadow-sm">v2.4 PRO</span>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 relative z-10 custom-scrollbar">

                {/* Integration Panel */}
                <div className="p-5 rounded-3xl bg-bg-secondary border border-border-subtle space-y-4 relative group overflow-hidden shadow-inner">
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-violet-500/5 opacity-50" />
                    <div className="flex items-center justify-between mb-1 relative z-10 px-1">
                        <span className="text-[9px] text-text-muted font-black uppercase tracking-widest flex items-center gap-2">
                            <RefreshCw className={`w-3 h-3 ${isJoining ? 'animate-spin' : ''}`} /> SYNC CONNECTION
                        </span>
                        <div className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-sm ${botStatus === 'connected' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : botStatus === 'joining' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20' : 'bg-bg-primary text-text-muted border border-border-subtle'}`}>
                            {botStatus}
                        </div>
                    </div>

                    <div className="relative z-10">
                        <input
                            type="text"
                            placeholder="Mülakat Linki (Meet/Zoom/Teams)"
                            value={meetingUrl}
                            onChange={(e) => setMeetingUrl(e.target.value)}
                            className="w-full bg-bg-primary border border-border-subtle rounded-2xl p-3.5 text-[11px] text-text-primary placeholder-text-muted/40 focus:border-cyan-500/50 outline-none transition-all shadow-inner font-black"
                        />
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-2xl bg-bg-primary border border-border-subtle shadow-inner relative z-10">
                        <span className="text-[10px] font-black text-text-muted uppercase tracking-widest flex items-center gap-2">
                            Mülakatçı Sesini Ekle
                        </span>
                        <button
                            onClick={() => setCaptureInterviewer(!captureInterviewer)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${captureInterviewer ? 'bg-cyan-500' : 'bg-bg-secondary border-border-subtle'}`}
                        >
                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${captureInterviewer ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => handleJoinMeeting(false)}
                            disabled={isJoining || botStatus === 'connected'}
                            className={`p-3 rounded-2xl flex items-center justify-center gap-2 transition-all font-black text-[10px] uppercase tracking-widest relative z-10 shadow-sm 
                                ${botStatus === 'connected'
                                    ? 'bg-bg-primary text-text-muted border border-border-subtle opacity-50 cursor-not-allowed'
                                    : isJoining
                                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                        : 'bg-cyan-500 hover:shadow-lg hover:shadow-cyan-500/20 text-white'}`}
                        >
                            {isJoining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                            BAĞLAN
                        </button>

                        <button
                            onClick={botStatus === 'connected' ? stopListening : () => handleJoinMeeting(true)}
                            disabled={isJoining}
                            className={`p-3 rounded-2xl flex items-center justify-center gap-2 transition-all font-black text-[10px] uppercase tracking-widest relative z-10 shadow-sm 
                                ${botStatus === 'connected'
                                    ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 hover:bg-red-500/20'
                                    : 'bg-bg-primary border-border-subtle text-text-primary hover:bg-bg-secondary'}`}
                        >
                            {botStatus === 'connected' ? <MicOff className="w-4 h-4" /> : <Activity className="w-4 h-4 text-emerald-500" />}
                            {botStatus === 'connected' ? "AYRIL" : "TEST ET"}
                        </button>
                    </div>

                    {/* Bot Deployment Log */}
                    {(isJoining || botLogs.length > 0) && (
                        <div className="space-y-3">
                            <div className="p-3 bg-bg-primary border border-border-subtle rounded-2xl font-mono text-[9px] space-y-1.5 animate-in fade-in duration-500 shadow-inner">
                                {botLogs.map((log, i) => (
                                    <div key={i} className={`flex gap-3 leading-relaxed ${log && log.startsWith('✅') ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-text-muted/70'}`}>
                                        <span className="shrink-0 opacity-40">[{new Date().toLocaleTimeString('tr-TR', { hour12: false, second: '2-digit', minute: '2-digit' })}]</span>
                                        <span>{log || '...'}</span>
                                    </div>
                                ))}
                            </div>
                            {botStatus === 'connected' && meetingUrl && (
                                <div className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-500">
                                    <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-[1.5rem] flex items-start gap-3 shadow-sm">
                                        <ShieldCheck className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                        <div className="space-y-1.5">
                                            <p className="text-[10px] leading-relaxed text-emerald-700 dark:text-emerald-400 font-black uppercase tracking-tight italic">
                                                MÜLAKAT KÖPRÜSÜ AKTİF.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-[1.5rem] flex items-start gap-3 shadow-sm">
                                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                                        <p className="text-[10px] leading-relaxed text-amber-700 dark:text-amber-300 font-black uppercase tracking-tight italic">
                                            Yasal bilgilendirme yapıldı.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Status: Presence Control */}
                {botStatus === 'connected' && (
                    <div className="grid grid-cols-2 gap-3 px-1">
                        <div className="p-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 flex items-center justify-center gap-2 shadow-sm">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">LIVE: {presenceData.participantCount}</span>
                        </div>
                        <div className="p-3 rounded-2xl bg-cyan-500/5 border border-cyan-500/10 flex items-center justify-center gap-2 shadow-sm">
                            <Activity className="w-4 h-4 text-cyan-500" />
                            <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">{presenceData.signalQuality}</span>
                        </div>
                    </div>
                )}

                {/* STAR Reality Check */}
                <div className="space-y-4 px-1">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] text-text-muted font-black uppercase tracking-[0.2em] flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-emerald-500" /> STAR INTEGRITY
                        </span>
                        <div className="px-3 py-1 rounded-xl bg-bg-primary border border-border-subtle text-[11px] font-black text-text-primary tabular-nums">
                            {logicIntegrity}%
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {Object.entries(starScores).map(([key, score]) => (
                            <div key={key} className="p-4 rounded-[1.5rem] bg-bg-secondary border border-border-subtle space-y-2 relative overflow-hidden group hover:border-border-subtle/40 transition-all shadow-inner">
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-black text-text-muted uppercase tracking-widest group-hover:text-text-primary transition-colors">{STAR_LABELS[key]}</span>
                                    <span className={`text-[10px] font-black tabular-nums ${score > 70 ? 'text-emerald-600 dark:text-emerald-400' : score > 30 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>{score}</span>
                                </div>
                                <div className="h-1.5 bg-bg-primary rounded-full overflow-hidden border border-border-subtle/5">
                                    <div
                                        className={`h-full transition-all duration-1000 ease-out ${key === 'S' ? 'bg-emerald-500' : key === 'T' ? 'bg-blue-500' : key === 'A' ? 'bg-violet-600' : 'bg-amber-500'}`}
                                        style={{ width: `${score}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Feed Stream */}
                <div className="flex-1 flex flex-col min-h-0 space-y-3">
                    <span className="text-[9px] text-text-muted font-black hud-text tracking-widest flex items-center gap-1.5 px-1 uppercase">
                        <MessageSquare className="w-3 h-3 text-cyan-500" /> Intel Stream
                    </span>
                    <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar pr-1">
                        {transcriptFeed.length === 0 ? (
                            <div className="py-12 text-center rounded-xl bg-bg-primary border border-border-subtle">
                                <p className="text-[9px] text-text-muted hud-text uppercase tracking-tight">Listening for data pulse...</p>
                            </div>
                        ) : (
                            transcriptFeed.slice().reverse().map((t, idx) => (
                                <div key={t.id} className={`p-3 rounded-xl border transition-all duration-500 ${idx === 0 ? 'bg-cyan-500/5 border-cyan-500/30 scale-[1.02]' : 'bg-bg-primary border-border-subtle opacity-60'}`}>
                                    <p className="text-[10px] text-text-primary leading-relaxed font-black">"{t.text}"</p>
                                    <div className="mt-1.5 flex justify-end">
                                        <div className={`w-1 h-1 rounded-full ${idx === 0 ? 'bg-cyan-500 animate-ping' : 'bg-text-muted'}`} />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* AI Tactical Recommendations */}
                {currentAiInsight && (
                    <div className="p-6 rounded-[2rem] bg-bg-secondary border border-border-subtle relative overflow-hidden animate-in slide-in-from-bottom-5 duration-700 shadow-xl">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full blur-3xl" />
                        <div className="flex items-start gap-4 relative z-10">
                            <Sparkles className="w-5 h-5 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
                            <div>
                                <h4 className="text-[10px] font-black text-violet-600 dark:text-violet-400 mb-2 uppercase tracking-[0.2em]">TACTICAL ADVICE</h4>
                                <p className="text-[11px] text-text-primary leading-relaxed font-black italic">
                                    {currentAiInsight}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Visualizer Footer */}
            {botStatus === 'connected' && (
                <div className="p-4 bg-bg-secondary/60 border-t border-border-subtle backdrop-blur-md">
                    <div className="h-10 flex items-end justify-center gap-1.5 px-6">
                        {waveHeight.map((h, i) => (
                            <div key={i} className="flex-1 rounded-t-full bg-cyan-400 opacity-60 transition-all duration-150 shadow-[0_0_10px_rgba(96,165,250,0.3)]" style={{ height: `${h / 2.5}%` }} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
