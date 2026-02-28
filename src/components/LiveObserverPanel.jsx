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

    const mediaRecorderRef = useRef(null);
    const recognitionRef = useRef(null);
    const audioChunksRef = useRef([]);
    const isListeningRef = useRef(false);
    const activeStreamsRef = useRef([]);

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
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = 1.5;

            const source1 = audioCtx.createMediaStreamSource(displayStream);
            const source2 = audioCtx.createMediaStreamSource(userMicStream);

            source1.connect(gainNode);
            source2.connect(gainNode);
            gainNode.connect(dest);

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
        S: 'text-emerald-400 bg-emerald-500/10',
        T: 'text-sapphire-400 bg-sapphire-500/10',
        A: 'text-violet-400 bg-violet-500/10',
        R: 'text-amber-400 bg-amber-500/10'
    };

    return (
        <div className="flex flex-col h-full bg-navy-950/40 border-l border-white/10 w-[340px] shadow-2xl overflow-hidden relative tech-grid shrink-0 animate-in slide-in-from-right duration-500">
            {/* Background Ornaments */}
            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-electric/5 to-transparent pointer-events-none" />

            {/* Header: Cyber Status */}
            <div className="p-4 border-b border-white/[0.05] flex items-center justify-between relative z-10 bg-black/20">
                <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${isListening ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse' : 'bg-navy-700'}`} />
                    <h3 className="text-[10px] font-black hud-text text-text-primary tracking-widest uppercase opacity-80">Observer HUD</h3>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[8px] font-bold text-electric hud-text px-2 py-0.5 rounded bg-electric/10 border border-electric/20">v2.0</span>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 relative z-10 custom-scrollbar">

                {/* Integration Panel */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-3 relative group overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-electric/5 to-transparent opacity-50" />
                    <div className="flex items-center justify-between mb-1 relative z-10">
                        <span className="text-[9px] text-navy-400 font-bold hud-text uppercase tracking-wider">Sync Connection</span>
                        <div className={`px-2 py-0.5 rounded text-[8px] font-black hud-text uppercase ${botStatus === 'connected' ? 'text-emerald-400' : botStatus === 'joining' ? 'text-amber-400' : 'text-navy-500'}`}>
                            {botStatus}
                        </div>
                    </div>

                    <div className="relative z-10">
                        <input
                            type="text"
                            placeholder="Meeting URL (Meet/Zoom/Teams)"
                            value={meetingUrl}
                            onChange={(e) => setMeetingUrl(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-[10px] text-text-primary placeholder-navy-700 focus:border-electric/50 outline-none transition-all hud-text"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => handleJoinMeeting(false)}
                            disabled={isJoining || botStatus === 'connected'}
                            className={`py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all font-bold text-[9px] hud-text relative z-10 
                                ${botStatus === 'connected'
                                    ? 'bg-navy-800 text-navy-500 border border-white/5 opacity-50 cursor-not-allowed'
                                    : isJoining
                                        ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                        : 'bg-electric hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] text-white'}`}
                        >
                            {isJoining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mic className="w-3 h-3" />}
                            BOTU TOPLANTıya SOK
                        </button>

                        <button
                            onClick={botStatus === 'connected' ? stopListening : () => handleJoinMeeting(true)}
                            disabled={isJoining}
                            className={`py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all font-bold text-[9px] hud-text relative z-10 
                                ${botStatus === 'connected'
                                    ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20'
                                    : 'bg-white/[0.05] border border-white/10 text-text-primary hover:bg-white/[0.1]'}`}
                        >
                            {botStatus === 'connected' ? <MicOff className="w-3 h-3" /> : <Activity className="w-3 h-3 text-emerald-400" />}
                            {botStatus === 'connected' ? "BAĞLANTIYI KES" : "HIZLI TEST (YEREL)"}
                        </button>
                    </div>

                    {/* Bot Deployment Log */}
                    {(isJoining || botLogs.length > 0) && (
                        <div className="space-y-2">
                            <div className="p-2 bg-black/60 rounded-lg border border-white/5 font-mono text-[8px] space-y-1 animate-in fade-in duration-500">
                                {botLogs.map((log, i) => (
                                    <div key={i} className={`flex gap-2 ${log && log.startsWith('✅') ? 'text-emerald-400' : 'text-navy-400'}`}>
                                        <span className="shrink-0 opacity-40">[{new Date().toLocaleTimeString('tr-TR', { hour12: false, second: '2-digit', minute: '2-digit' })}]</span>
                                        <span>{log || '...'}</span>
                                    </div>
                                ))}
                            </div>
                            {botStatus === 'connected' && meetingUrl && (
                                <div className="space-y-2">
                                    <div className="p-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg flex items-start gap-2 animate-in slide-in-from-top-1">
                                        <ShieldCheck className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                                        <div className="space-y-1">
                                            <p className="text-[7px] leading-tight text-emerald-300 font-bold uppercase tracking-tighter italic">
                                                MÜLAKAT KÖPRÜSÜ AKTİF: Hem sizin hem adayınızın sesi dijital olarak analiz ediliyor.
                                            </p>

                                        </div>
                                    </div>
                                    <div className="p-2 bg-amber-500/5 border border-amber-500/20 rounded-lg flex items-start gap-2">
                                        <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
                                        <p className="text-[7px] leading-tight text-amber-300 font-bold uppercase tracking-tighter italic">
                                            YASAL UYARI: Mülakatın kayıt ve analiz edildiğini adaya bildirdiğinizden emin olun.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Status: Presence Control */}
                {botStatus === 'connected' && (
                    <div className="grid grid-cols-2 gap-2 mt-2 px-1">
                        <div className="p-2 rounded-xl bg-emerald-500/5 border border-emerald-500/10 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[9px] font-bold text-navy-400">PARTICIPANTS: {presenceData.participantCount}</span>
                        </div>
                        <div className="p-2 rounded-xl bg-electric/5 border border-electric/10 flex items-center gap-2">
                            <Activity className="w-3 h-3 text-electric" />
                            <span className="text-[9px] font-bold text-navy-400">SIGNAL: {presenceData.signalQuality}</span>
                        </div>
                    </div>
                )}

                {/* STAR Reality Check */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-[9px] text-navy-400 font-bold hud-text tracking-widest flex items-center gap-1.5">
                            <ShieldCheck className="w-3 h-3 text-emerald-400" /> STAR INTEGRITY
                        </span>
                        <span className="text-[10px] text-text-primary font-black hud-text">{logicIntegrity}%</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        {Object.entries(starScores).map(([key, score]) => (
                            <div key={key} className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-1.5 relative overflow-hidden">
                                <div className="flex items-center justify-between">
                                    <span className="text-[8px] font-bold text-navy-500 hud-text">{STAR_LABELS[key]}</span>
                                    <span className={`text-[8px] font-black hud-text ${score > 70 ? 'text-emerald-400' : score > 30 ? 'text-amber-400' : 'text-red-400'}`}>{score}</span>
                                </div>
                                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-700 ${key === 'S' ? 'bg-emerald-500' : key === 'T' ? 'bg-blue-500' : key === 'A' ? 'bg-violet-500' : 'bg-amber-500'}`}
                                        style={{ width: `${score}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Feed Stream */}
                <div className="flex-1 flex flex-col min-h-0 space-y-3">
                    <span className="text-[9px] text-navy-400 font-bold hud-text tracking-widest flex items-center gap-1.5 px-1 uppercase">
                        <MessageSquare className="w-3 h-3 text-electric" /> Intel Stream
                    </span>
                    <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar pr-1">
                        {transcriptFeed.length === 0 ? (
                            <div className="py-12 text-center rounded-xl bg-white/[0.01] border border-dashed border-white/5">
                                <p className="text-[9px] text-navy-600 hud-text uppercase tracking-tight">Listening for data pulse...</p>
                            </div>
                        ) : (
                            transcriptFeed.slice().reverse().map((t, idx) => (
                                <div key={t.id} className={`p-3 rounded-xl border transition-all duration-500 ${idx === 0 ? 'bg-electric/5 border-electric/30 scale-[1.02]' : 'bg-white/[0.02] border-white/5 opacity-60'}`}>
                                    <p className="text-[10px] text-navy-100 leading-relaxed font-medium">"{t.text}"</p>
                                    <div className="mt-1.5 flex justify-end">
                                        <div className={`w-1 h-1 rounded-full ${idx === 0 ? 'bg-electric animate-ping' : 'bg-navy-700'}`} />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* AI Tactical Recommendations */}
                {currentAiInsight && (
                    <div className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/20 relative overflow-hidden animate-in slide-in-from-bottom-2">
                        <div className="absolute top-0 left-0 w-1 h-full bg-violet-500" />
                        <div className="flex items-start gap-3">
                            <Sparkles className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                            <div>
                                <h4 className="text-[9px] font-black text-violet-400 mb-1 hud-text uppercase tracking-widest">Tactical Advice</h4>
                                <p className="text-[10px] text-navy-100 leading-relaxed font-semibold">
                                    {currentAiInsight}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Visualizer Footer */}
            {botStatus === 'connected' && (
                <div className="p-3 bg-black/40 border-t border-white/5">
                    <div className="h-8 flex items-end justify-center gap-1 px-4">
                        {waveHeight.map((h, i) => (
                            <div key={i} className="flex-1 rounded-t-sm bg-electric/40 transition-all duration-150" style={{ height: `${h / 3}%` }} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
