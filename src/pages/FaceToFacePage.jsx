// src/pages/FaceToFacePage.jsx — Yüz Yüze Mülakat Modu
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Mic, MicOff, Square, Play, ChevronLeft, Clock, Users, Code, Target,
    Sparkles, Brain, CheckCircle2, ArrowRight, Loader2, AlertCircle,
    StickyNote, Volume2, Activity, Trophy, FileText
} from 'lucide-react';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import { useAuth } from '../context/AuthContext';
import {
    generateInterviewPaths, analyzeSTARRealTime, generateInterviewFinalReport, stripPII
} from '../services/geminiService';
import { doc, updateDoc, arrayUnion, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

// ── helpers ──────────────────────────────────────────────────────────────────

function formatTime(s) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
}

function getInitials(name = '') {
    const p = name.trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    if (p.length === 1) return p[0][0].toUpperCase();
    return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

const STAR_KEYS = [
    { key: 'technical',     label: 'Teknik' },
    { key: 'communication', label: 'İletişim' },
    { key: 'problemSolving',label: 'Problem Çözme' },
    { key: 'cultureFit',    label: 'Kültür Uyumu' },
    { key: 'adaptability',  label: 'Uyum' },
];

const STRATEGIES = [
    { id: 'technical', label: 'Teknik',   icon: Code },
    { id: 'product',   label: 'Ürün',     icon: Target },
    { id: 'culture',   label: 'Kültür',   icon: Users },
];

// ── component ─────────────────────────────────────────────────────────────────

export default function FaceToFacePage() {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const { candidates, updateCandidate } = useCandidates();
    const { positions } = usePositions();
    const { userProfile } = useAuth();

    // ── session / candidate lookup ────────────────────────────────────────────
    const candidateData = useMemo(() => {
        if (!candidates || !sessionId) return null;
        return candidates.find(c => c.interviewSessions?.some(s => s.id === sessionId)) || null;
    }, [candidates, sessionId]);

    const session = useMemo(() =>
        candidateData?.interviewSessions?.find(s => s.id === sessionId),
        [candidateData, sessionId]);

    // ── core state ────────────────────────────────────────────────────────────
    const [phase, setPhase] = useState('setup');    // setup | active | finishing | finished
    const [micError, setMicError] = useState(null);
    const [stream, setStream] = useState(null);
    const [isMicOn, setIsMicOn] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    const [elapsedTime, setElapsedTime] = useState(0);

    // transcript
    const [transcript, setTranscript] = useState([]);
    const transcriptRef = useRef(null);

    // AI
    const [activeStrategy, setActiveStrategy] = useState('technical');
    const [paths, setPaths] = useState([]);          // all 3 question sets from generateInterviewPaths
    const [activePathIdx, setActivePathIdx] = useState(0); // which set is selected (0/1/2)
    const [questions, setQuestions] = useState([]);
    const [currentQIndex, setCurrentQIndex] = useState(0);
    const [pathLoading, setPathLoading] = useState(false);
    const [starScores, setStarScores] = useState({ technical: 0, communication: 0, problemSolving: 0, cultureFit: 0, adaptability: 0 });
    const [aiInsights, setAiInsights] = useState([]);
    const [starAnalyzing, setStarAnalyzing] = useState(false);
    const [finishLoading, setFinishLoading] = useState(false);
    const [manualNote, setManualNote] = useState('');
    const [showNoteBox, setShowNoteBox] = useState(false);

    // waveform
    const [wave, setWave] = useState([20, 40, 60, 30, 80, 40, 20]);

    // refs
    const recognitionRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const sttIntervalRef = useRef(null);
    const phaseRef = useRef(phase);
    const isMicOnRef = useRef(isMicOn);
    const isFinishedRef = useRef(false);
    const timerRef = useRef(null);
    const lastStarLenRef = useRef(0);
    const questionsSyncedRef = useRef(false);

    // keep refs in sync
    useEffect(() => { phaseRef.current = phase; }, [phase]);
    useEffect(() => { isMicOnRef.current = isMicOn; }, [isMicOn]);

    // auto-scroll transcript
    useEffect(() => {
        if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }, [transcript]);

    // waveform animation when active
    useEffect(() => {
        if (phase !== 'active') return;
        const id = setInterval(() => {
            setWave(prev => prev.map(() => Math.floor(Math.random() * 70) + 15));
        }, 120);
        return () => clearInterval(id);
    }, [phase]);

    // elapsed timer
    useEffect(() => {
        if (phase !== 'active') return;
        timerRef.current = setInterval(() => setElapsedTime(t => t + 1), 1000);
        return () => clearInterval(timerRef.current);
    }, [phase]);

    // ── mic permission request ───────────────────────────────────────────────
    const requestMic = useCallback(async () => {
        setMicError(null);
        try {
            const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setStream(s);
            return s;
        } catch (err) {
            setMicError('Mikrofon erişimi reddedildi. Tarayıcı izinlerini kontrol edin.');
            return null;
        }
    }, []);

    // ── question generation ──────────────────────────────────────────────────
    const fetchQuestions = useCallback(async (strategy, candidate, pathIdx = 0) => {
        if (!candidate || pathLoading) return;
        setPathLoading(true);
        setQuestions([]);
        questionsSyncedRef.current = false;
        try {
            const generatedPaths = await generateInterviewPaths(candidate, strategy);
            setPaths(generatedPaths);
            const selectedPath = generatedPaths[pathIdx] || generatedPaths[0];
            if (selectedPath) {
                const qs = selectedPath.questions.map((q, i) => ({
                    id: i + 1, text: q.question, category: q.category, status: 'pending'
                }));
                setQuestions(qs);
                setCurrentQIndex(0);
                setActivePathIdx(pathIdx);
            }
        } catch (err) {
            console.error('[FaceToFace] Question generation error:', err);
        } finally {
            setPathLoading(false);
        }
    }, [pathLoading]);

    // Switch to a different set without re-generating
    const handlePathSwitch = useCallback((idx) => {
        if (pathLoading || idx === activePathIdx || !paths[idx]) return;
        setActivePathIdx(idx);
        const selectedPath = paths[idx];
        const qs = selectedPath.questions.map((q, i) => ({
            id: i + 1, text: q.question, category: q.category, status: 'pending'
        }));
        setQuestions(qs);
        setCurrentQIndex(0);
    }, [pathLoading, activePathIdx, paths]);

    // fetch questions when strategy changes (and candidate loaded)
    useEffect(() => {
        if (phase === 'active' && candidateData) {
            setActivePathIdx(0);
            setPaths([]);
            fetchQuestions(activeStrategy, candidateData, 0);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeStrategy, candidateData?.id, phase]);

    // ── STAR real-time analysis ──────────────────────────────────────────────
    useEffect(() => {
        const last = transcript[transcript.length - 1];
        if (!last || transcript.length <= lastStarLenRef.current) return;
        if (last.text?.trim().length < 40) return;

        const timer = setTimeout(async () => {
            lastStarLenRef.current = transcript.length;
            if (!candidateData) return;
            setStarAnalyzing(true);
            try {
                const safeProfile = stripPII(candidateData);
                const recentSlice = transcript.slice(-6);
                const linkedPos = positions?.find(p => p.id === (session?.positionId || candidateData?.positionId));
                const currentQ = questions[currentQIndex]?.text || null;
                const result = await analyzeSTARRealTime(safeProfile, recentSlice, currentQ, {
                    title: session?.positionTitle || linkedPos?.title || '',
                    requirements: linkedPos?.requirements?.join(', ') || null,
                });
                if (!result?.scores) return;
                setStarScores(prev => ({
                    technical:     Math.round(prev.technical     * 0.6 + (result.scores.technical     ?? prev.technical)     * 0.4),
                    communication: Math.round(prev.communication * 0.6 + (result.scores.communication ?? prev.communication) * 0.4),
                    problemSolving:Math.round(prev.problemSolving* 0.6 + (result.scores.problemSolving?? prev.problemSolving) * 0.4),
                    cultureFit:    Math.round(prev.cultureFit    * 0.6 + (result.scores.cultureFit    ?? prev.cultureFit)    * 0.4),
                    adaptability:  Math.round(prev.adaptability  * 0.6 + (result.scores.adaptability  ?? prev.adaptability)  * 0.4),
                }));
                if (result.insight) {
                    setAiInsights(prev => [{
                        id: Date.now(), type: result.bias_warning ? 'warning' : 'insight',
                        text: result.bias_warning ? `⚠️ ${result.bias_detail || result.insight}` : result.insight,
                        hint: result.suggestion || null
                    }, ...prev].slice(0, 10));
                }
            } catch (err) {
                console.error('[STAR RealTime]', err.message);
            } finally {
                setStarAnalyzing(false);
            }
        }, 2500);
        return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transcript]);

    // ── STT engine ───────────────────────────────────────────────────────────
    const pushTranscriptEntry = useCallback((text) => {
        if (!text || text.trim().length < 3) return;
        const BLOCKED = ['bu ses dosyasını', 'json formatında', 'sessizlik', 'ses yok', 'boş_ses'];
        if (BLOCKED.some(b => text.toLowerCase().includes(b))) return;

        const entry = {
            role: 'KONUŞMA',
            text: text.trim(),
            time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        };
        setTranscript(prev => [...prev, entry]);

        // Save to Firestore
        if (sessionId) {
            updateDoc(doc(db, 'interviews', sessionId), { transcript: arrayUnion(entry), sessionId })
                .catch(() => setDoc(doc(db, 'interviews', sessionId), { transcript: [entry], sessionId }, { merge: true }));
        }
    }, [sessionId]);

    // Gemini STT chunk sender
    const sendAudioChunk = useCallback(async (blob) => {
        if (blob.size < 1000) return;
        try {
            const ab = await blob.arrayBuffer();
            const bytes = new Uint8Array(ab);
            let bin = '';
            for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
            const base64 = btoa(bin);
            const res = await fetch('/api/ai/stt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audio: base64, mimeType: blob.type.split(';')[0] || 'audio/webm' }),
            });
            if (!res.ok) return;
            const { text } = await res.json();
            pushTranscriptEntry(text);
        } catch { /* silent */ }
    }, [pushTranscriptEntry]);

    // Start / stop STT
    useEffect(() => {
        if (phase !== 'active' || !isMicOn || !stream) {
            // stop everything
            if (recognitionRef.current) {
                recognitionRef.current.onend = null;
                try { recognitionRef.current.abort(); } catch { /* ignore */ }
                recognitionRef.current = null;
            }
            if (mediaRecorderRef.current?.state === 'recording') {
                mediaRecorderRef.current.onstop = null;
                mediaRecorderRef.current.stop();
            }
            if (sttIntervalRef.current) clearInterval(sttIntervalRef.current);
            setIsRecording(false);
            return;
        }

        const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechAPI) {
            const recognition = new SpeechAPI();
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.lang = 'tr-TR';
            recognition.maxAlternatives = 1;
            recognitionRef.current = recognition;
            let restartTimer = null;

            recognition.onresult = (e) => {
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    const r = e.results[i];
                    if (!r.isFinal) continue;
                    pushTranscriptEntry(r[0].transcript);
                }
            };
            recognition.onerror = (e) => {
                if (e.error === 'no-speech' || e.error === 'aborted') return;
                console.warn('[STT] Web Speech error:', e.error);
            };
            recognition.onend = () => {
                if (phaseRef.current === 'active' && isMicOnRef.current) {
                    restartTimer = setTimeout(() => { try { recognition.start(); } catch { /* ignore */ } }, 300);
                } else { setIsRecording(false); }
            };
            try { recognition.start(); setIsRecording(true); } catch (err) { console.error('[STT] start error:', err); }

            return () => {
                if (restartTimer) clearTimeout(restartTimer);
                recognition.onend = null;
                try { recognition.abort(); } catch { /* ignore */ }
                recognitionRef.current = null;
                setIsRecording(false);
            };
        } else {
            // Gemini audio-chunk fallback
            const audioTrack = stream.getAudioTracks()[0];
            if (!audioTrack) return;
            const audioStream = new MediaStream([audioTrack]);
            const options = {};
            for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']) {
                if (window.MediaRecorder?.isTypeSupported(type)) { options.mimeType = type; break; }
            }
            const recorder = new window.MediaRecorder(audioStream, options);
            mediaRecorderRef.current = recorder;
            recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
            recorder.onstop = () => {
                if (audioChunksRef.current.length > 0) {
                    const blob = new Blob(audioChunksRef.current, { type: options.mimeType });
                    audioChunksRef.current = [];
                    sendAudioChunk(blob);
                }
            };
            recorder.start();
            setIsRecording(true);
            sttIntervalRef.current = setInterval(() => {
                if (recorder.state === 'recording') {
                    recorder.stop();
                    recorder.start();
                }
            }, 3000);

            return () => {
                clearInterval(sttIntervalRef.current);
                recorder.onstop = null;
                if (recorder.state === 'recording') recorder.stop();
                setIsRecording(false);
            };
        }
    }, [phase, isMicOn, stream, pushTranscriptEntry, sendAudioChunk]);

    // ── start interview ──────────────────────────────────────────────────────
    const handleStart = async () => {
        const s = stream || await requestMic();
        if (!s) return;
        setPhase('active');
    };

    // ── finish interview ─────────────────────────────────────────────────────
    const handleFinish = async () => {
        if (isFinishedRef.current || finishLoading) return;
        isFinishedRef.current = true;
        setFinishLoading(true);
        setPhase('finishing');

        // stop STT
        if (recognitionRef.current) {
            recognitionRef.current.onend = null;
            try { recognitionRef.current.abort(); } catch { /* ignore */ }
        }
        if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
        if (stream) stream.getTracks().forEach(t => t.stop());
        clearInterval(timerRef.current);

        try {
            const avgScore = Math.round(Object.values(starScores).reduce((a, b) => a + b, 0) / 5);

            // Generate final report via Gemini
            let aiSummary = 'Mülakat tamamlandı.';
            let finalReport = null;
            try {
                if (candidateData && transcript.length > 0) {
                    const safeProfile = stripPII(candidateData);
                    finalReport = await generateInterviewFinalReport(
                        safeProfile,
                        transcript,
                        starScores,
                        {
                            positionTitle: session?.positionTitle || candidateData?.position || '',
                            questions,
                        }
                    );
                    if (finalReport?.summary) aiSummary = finalReport.summary;
                }
            } catch (repErr) {
                console.error('[FaceToFace] Report generation error:', repErr);
            }

            // Build completed session object
            const now = new Date().toISOString();
            const updatedSession = {
                ...session,
                status: 'completed',
                interviewScore: avgScore,
                finalScore: avgScore,
                aiOverallScore: avgScore,
                aiSummary,
                starScores,
                transcript,
                questions,
                duration: elapsedTime,
                completedAt: now,
                mode: 'face_to_face',
                ...(manualNote ? { recruiterNote: manualNote } : {}),
                ...(finalReport?.strengths ? { strengths: finalReport.strengths } : {}),
                ...(finalReport?.developmentAreas ? { developmentAreas: finalReport.developmentAreas } : {}),
                ...(finalReport?.criticalMoments ? { criticalMoments: finalReport.criticalMoments } : {}),
            };

            // Update candidate record
            const updatedSessions = (candidateData.interviewSessions || []).map(s =>
                s.id === sessionId ? updatedSession : s
            );
            await updateCandidate(candidateData.id, {
                interviewSessions: updatedSessions,
                status: 'Interview',
            });

            // Mark Firestore /interviews/{sessionId} as completed
            try {
                await updateDoc(doc(db, 'interviews', sessionId), {
                    status: 'completed',
                    completedAt: now,
                    interviewScore: avgScore,
                    aiSummary,
                });
            } catch {
                await setDoc(doc(db, 'interviews', sessionId), {
                    status: 'completed', completedAt: now, interviewScore: avgScore, aiSummary
                }, { merge: true });
            }

            navigate(`/interview-report/${sessionId}`);
        } catch (err) {
            console.error('[FaceToFace] Finish error:', err);
            setFinishLoading(false);
            setPhase('active');
            isFinishedRef.current = false;
        }
    };

    // ── UI helpers ────────────────────────────────────────────────────────────
    const avgScore = Math.round(Object.values(starScores).reduce((a, b) => a + b, 0) / 5);

    // ── render: setup phase ───────────────────────────────────────────────────
    if (phase === 'setup') {
        return (
            <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center p-6">
                <div className="w-full max-w-lg space-y-6 animate-in fade-in duration-500">
                    {/* Back */}
                    <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm transition-colors">
                        <ChevronLeft className="w-4 h-4" /> Mülakata Geri Dön
                    </button>

                    {/* Card */}
                    <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                                <Users className="w-6 h-6 text-cyan-400" />
                            </div>
                            <div>
                                <h1 className="text-xl font-black text-white">Yüz Yüze Mülakat</h1>
                                <p className="text-xs text-white/40 mt-0.5">Ses kaydı · Gerçek zamanlı AI analizi</p>
                            </div>
                        </div>

                        {/* Candidate info */}
                        {candidateData && (
                            <div className="bg-white/5 rounded-2xl p-4 flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-slate-700 border border-white/10 flex items-center justify-center text-white font-black text-lg shrink-0">
                                    {getInitials(candidateData.name)}
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-white">{candidateData.name}</p>
                                    <p className="text-xs text-white/40">{session?.positionTitle || candidateData.position || '—'}</p>
                                </div>
                            </div>
                        )}

                        {/* Mic check */}
                        <div className="space-y-3">
                            <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Mikrofon Kontrolü</p>
                            <button
                                onClick={requestMic}
                                className="w-full py-3 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all flex items-center justify-center gap-2 text-sm text-white/70 hover:text-white"
                            >
                                <Mic className="w-4 h-4" />
                                {stream ? '✓ Mikrofon hazır' : 'Mikrofon İzni Ver'}
                            </button>
                            {micError && (
                                <div className="flex items-start gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    {micError}
                                </div>
                            )}
                        </div>

                        <button
                            onClick={handleStart}
                            className="w-full py-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white font-black text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20"
                        >
                            <Play className="w-4 h-4 fill-white" />
                            Mülakatı Başlat
                        </button>
                    </div>

                    <p className="text-center text-xs text-white/20">Görüşme boyunca ses cihazınız kaydedilecek ve AI tarafından analiz edilecektir.</p>
                </div>
            </div>
        );
    }

    // ── render: finishing phase ───────────────────────────────────────────────
    if (phase === 'finishing') {
        return (
            <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center">
                <div className="text-center space-y-4 animate-in fade-in duration-500">
                    <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mx-auto">
                        <Brain className="w-8 h-8 text-cyan-400 animate-pulse" />
                    </div>
                    <p className="text-white font-black text-lg">Rapor Oluşturuluyor</p>
                    <p className="text-white/30 text-sm">AI mülakat transkriptini analiz ediyor…</p>
                </div>
            </div>
        );
    }

    // ── render: active phase ──────────────────────────────────────────────────
    return (
        <div className="h-screen bg-[#0A0F1E] flex flex-col overflow-hidden">

            {/* ── Top bar ─────────────────────────────────────────────────── */}
            <header className="h-14 bg-[#0D1426] border-b border-white/5 flex items-center justify-between px-5 shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all">
                        <ChevronLeft className="w-4 h-4 text-white/50" />
                    </button>
                    <div>
                        <p className="text-sm font-black text-white leading-none">{candidateData?.name || 'Aday'}</p>
                        <p className="text-[10px] text-white/30 mt-0.5">{session?.positionTitle || candidateData?.position || '—'}</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* Recording indicator */}
                    <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-full px-3 py-1">
                        <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-white/20'}`} />
                        <span className="text-[11px] font-bold text-red-400">{isRecording ? 'KAYIT' : 'DURDURULDU'}</span>
                    </div>
                    {/* Elapsed */}
                    <div className="flex items-center gap-1.5 text-white/50">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="text-sm font-mono font-bold text-white/70">{formatTime(elapsedTime)}</span>
                    </div>
                    {/* Mic toggle */}
                    <button
                        onClick={() => setIsMicOn(v => !v)}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isMicOn ? 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}
                    >
                        {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                    </button>
                    {/* Finish */}
                    <button
                        onClick={handleFinish}
                        disabled={finishLoading}
                        className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white font-black text-xs transition-all disabled:opacity-50"
                    >
                        {finishLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5 fill-white" />}
                        Mülakatı Bitir
                    </button>
                </div>
            </header>

            {/* ── Main ────────────────────────────────────────────────────── */}
            <div className="flex-1 flex overflow-hidden">

                {/* ── LEFT: Recording + Transcript ─────────────────────────── */}
                <div className="flex-1 flex flex-col min-w-0 border-r border-white/5">

                    {/* Waveform + mic status */}
                    <div className="bg-[#0D1426] border-b border-white/5 px-6 py-5 shrink-0">
                        <div className="flex items-end gap-1 h-12 justify-center">
                            {wave.map((h, i) => (
                                <div
                                    key={i}
                                    className={`w-1.5 rounded-full transition-all duration-150 ${isRecording && isMicOn ? 'bg-cyan-400' : 'bg-white/10'}`}
                                    style={{ height: `${isRecording && isMicOn ? h : 15}%` }}
                                />
                            ))}
                        </div>
                        <p className="text-center text-[10px] text-white/30 mt-2 font-medium">
                            {isMicOn ? (isRecording ? 'Ses algılanıyor · AI analiz ediyor' : 'Başlatılıyor…') : 'Mikrofon kapalı'}
                        </p>
                    </div>

                    {/* Transcript */}
                    <div className="flex-1 overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 shrink-0">
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Transkript</p>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-white/20">{transcript.length} satır</span>
                                <button
                                    onClick={() => setShowNoteBox(v => !v)}
                                    className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${showNoteBox ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-white/30 hover:text-white'}`}
                                    title="Not ekle"
                                >
                                    <StickyNote className="w-3 h-3" />
                                </button>
                            </div>
                        </div>

                        {showNoteBox && (
                            <div className="px-4 py-2 border-b border-white/5 shrink-0">
                                <textarea
                                    value={manualNote}
                                    onChange={e => setManualNote(e.target.value)}
                                    placeholder="Mülakata özel notlarınızı buraya yazın…"
                                    rows={2}
                                    className="w-full bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2 text-xs text-white/70 placeholder:text-white/20 resize-none focus:outline-none focus:border-amber-500/40"
                                />
                            </div>
                        )}

                        <div ref={transcriptRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                            {transcript.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center opacity-30 space-y-2">
                                    <Volume2 className="w-8 h-8 text-white/20" />
                                    <p className="text-xs text-white/30">Ses algılandıkça transkript burada görünecek</p>
                                </div>
                            ) : transcript.map((entry, i) => (
                                <div key={i} className="flex gap-2.5 group">
                                    <span className="text-[9px] text-white/20 font-mono pt-0.5 shrink-0 w-14 text-right">{entry.time}</span>
                                    <p className="text-[12px] text-white/80 leading-relaxed flex-1">{entry.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── RIGHT: Questions + AI Coach + STAR ───────────────────── */}
                <div className="w-[380px] shrink-0 flex flex-col overflow-hidden bg-[#0B1120]">

                    {/* Strategy selector */}
                    <div className="px-4 pt-4 pb-3 border-b border-white/5 shrink-0 space-y-2">
                        {/* Strateji (tip) butonları */}
                        <div className="flex gap-1.5">
                            {STRATEGIES.map(s => {
                                const Icon = s.icon;
                                return (
                                    <button
                                        key={s.id}
                                        onClick={() => {
                                            if (activeStrategy === s.id) return;
                                            setActiveStrategy(s.id);
                                        }}
                                        className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${activeStrategy === s.id ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/30 hover:text-white hover:bg-white/10'}`}
                                    >
                                        <Icon className="w-3 h-3" />{s.label}
                                    </button>
                                );
                            })}
                        </div>
                        {/* Set seçici (paths[0/1/2]) — yalnızca yüklenince görünür */}
                        {paths.length > 1 && (
                            <div className="flex gap-1.5">
                                {paths.map((p, i) => (
                                    <button
                                        key={p.id || i}
                                        onClick={() => handlePathSwitch(i)}
                                        title={p.description || p.title}
                                        className={`flex-1 py-1 rounded-md text-[10px] font-bold transition-all truncate px-1 ${activePathIdx === i ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-white/3 text-white/20 hover:text-white/50 hover:bg-white/8 border border-transparent'}`}
                                    >
                                        {p.title || `Set ${i + 1}`}
                                    </button>
                                ))}
                            </div>
                        )}
                        {pathLoading && paths.length === 0 && (
                            <p className="text-[9px] text-white/20 text-center animate-pulse">Sorular hazırlanıyor…</p>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">

                        {/* Active question */}
                        <div className="px-4 pt-4 pb-3">
                            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Aktif Soru</p>
                            {pathLoading ? (
                                <div className="bg-blue-600/10 border border-blue-500/20 rounded-xl p-3 flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
                                    <span className="text-xs text-white/40">Sorular üretiliyor…</span>
                                </div>
                            ) : questions.length > 0 ? (
                                <div className="bg-blue-600/10 border border-blue-500/30 rounded-xl p-3.5 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-md bg-blue-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">
                                            {currentQIndex + 1}
                                        </div>
                                        {questions[currentQIndex]?.category && (
                                            <span className="text-[8px] font-bold text-white/30 border border-white/10 px-1.5 py-0.5 rounded-full uppercase">{questions[currentQIndex].category}</span>
                                        )}
                                    </div>
                                    <p className="text-[13px] font-bold text-white leading-snug italic">
                                        {questions[currentQIndex]?.text}
                                    </p>
                                    <div className="flex gap-2 pt-1">
                                        <button
                                            onClick={() => setCurrentQIndex(i => Math.max(0, i - 1))}
                                            disabled={currentQIndex === 0}
                                            className="flex-1 py-1.5 rounded-lg bg-white/5 text-white/30 hover:text-white hover:bg-white/10 text-[10px] font-bold transition-all disabled:opacity-30"
                                        >← Önceki</button>
                                        <button
                                            onClick={() => setCurrentQIndex(i => Math.min(questions.length - 1, i + 1))}
                                            disabled={currentQIndex === questions.length - 1}
                                            className="flex-1 py-1.5 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-[10px] font-bold transition-all disabled:opacity-30"
                                        >Sonraki →</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white/3 border border-white/5 rounded-xl p-3 text-center">
                                    <p className="text-xs text-white/20">Soru seti bekleniyor…</p>
                                </div>
                            )}
                        </div>

                        {/* Question list */}
                        {questions.length > 1 && (
                            <div className="px-4 pb-3">
                                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Soru Listesi</p>
                                <div className="space-y-1">
                                    {questions.map((q, i) => (
                                        <button
                                            key={q.id}
                                            onClick={() => setCurrentQIndex(i)}
                                            className={`w-full text-left px-3 py-2 rounded-lg flex items-start gap-2 transition-all ${i === currentQIndex ? 'bg-blue-600/10 border border-blue-500/20' : 'bg-white/3 border border-transparent hover:border-white/10'}`}
                                        >
                                            <span className={`text-[9px] font-black shrink-0 mt-0.5 ${i === currentQIndex ? 'text-blue-400' : 'text-white/20'}`}>{i + 1}</span>
                                            <span className={`text-[11px] leading-snug line-clamp-2 ${i === currentQIndex ? 'text-white/90' : 'text-white/40'}`}>{q.text}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* AI Coach */}
                        <div className="px-4 pb-3 border-t border-white/5 pt-3">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">AI Coach</p>
                                {starAnalyzing && <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />}
                            </div>
                            {aiInsights.length === 0 ? (
                                <p className="text-[11px] text-white/20 italic">Transkript uzadıkça tespitler burada görünecek…</p>
                            ) : (
                                <div className="space-y-2">
                                    {aiInsights.slice(0, 4).map(ins => (
                                        <div key={ins.id} className={`rounded-lg p-2.5 border text-[12px] leading-relaxed ${ins.type === 'warning' ? 'bg-yellow-500/10 border-yellow-500/25 text-yellow-200' : 'bg-white/5 border-white/10 text-white/85'}`}>
                                            {ins.text}
                                            {ins.hint && <p className="mt-1.5 text-cyan-300 italic text-[11px] font-medium">→ {ins.hint}</p>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* STAR Scores */}
                        <div className="px-4 pb-5 border-t border-white/5 pt-3">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">STAR Skorları</p>
                                <div className="flex items-center gap-1.5">
                                    <Trophy className="w-3 h-3 text-amber-400" />
                                    <span className="text-xs font-black text-amber-400">%{avgScore}</span>
                                </div>
                            </div>
                            <div className="space-y-2.5">
                                {STAR_KEYS.map(({ key, label }) => (
                                    <div key={key}>
                                        <div className="flex justify-between mb-1">
                                            <span className="text-[11px] text-white/50">{label}</span>
                                            <span className="text-[11px] font-mono font-bold text-white/60">{starScores[key]}</span>
                                        </div>
                                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-all duration-700"
                                                style={{ width: `${starScores[key]}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
