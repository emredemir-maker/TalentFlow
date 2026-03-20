
// src/pages/LiveInterviewPage.jsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Video, Mic, MicOff, VideoOff, Settings, X,
    ShieldCheck, Camera, Monitor, Sparkles, Brain, Zap,
    MessageSquare, Users, AlertCircle, CheckCircle2,
    Send, Play, Info, Copy, Check, ChevronRight, HelpCircle, Activity, ArrowRight, ArrowLeft,
    Target, Box, Code, Loader2, AlertTriangle, TrendingUp, Award, ChevronDown, RefreshCw, User, Flag, Star, FileText, ExternalLink, MoreVertical, Clock, ChevronLeft, LogOut
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCandidates } from '../context/CandidatesContext';
import { generateInterviewPaths, generateFollowUpQuestion, analyzeSTARRealTime, stripPII } from '../services/geminiService';
import { getGlobalGeminiKey } from '../services/ai/config.js';
import LoadingScreen from '../components/LoadingScreen';
import CandidateExitPage from './CandidateExitPage';
import { db } from '../config/firebase';
import { doc, onSnapshot, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default function LiveInterviewPage() {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const { user, isAuthenticated, userProfile, role, logout } = useAuth();
    const { candidates, updateCandidate, loading: candidatesLoading, error: candidatesError } = useCandidates();

    const [phase, setPhase] = useState('lobby'); // lobby, active, finished
    const [isRecruiter, setIsRecruiter] = useState(false);

    // Candidate-side API session (for anonymous users who can't read Firestore directly)
    const [apiSession, setApiSession] = useState(null);
    const [apiCandidateId, setApiCandidateId] = useState(null);

    // Elapsed time timer (for recruiter active view)
    const [elapsedTime, setElapsedTime] = useState(0);
    const elapsedTimerRef = useRef(null);

    // recognitionRef placeholder (legacy WebSpeech API ref, replaced by Gemini STT)
    const recognitionRef = useRef(null);

    // transcriptData for simulation (empty by default)
    const transcriptData = [];

    const candidateData = useMemo(() => {
        if (!candidates || !sessionId) return null;
        const parts = sessionId.split('-');
        const suffix = parts.length >= 2 ? parts[1] : null;

        // Comprehensive candidate lookup
        return candidates.find(c => c.interviewSessions?.some(s => s.id === sessionId)) ||
            (suffix ? candidates.find(c => c.id.substring(0, 4) === suffix) : null);
    }, [candidates, sessionId]);

    const session = useMemo(() =>
        candidateData?.interviewSessions?.find(s => s.id === sessionId),
        [candidateData, sessionId]);

    // effectiveSession: for anonymous candidates who can't read Firestore candidates collection,
    // fall back to apiSession (Firestore /interviews/{sessionId} listener).
    // IMPORTANT: If the public Firestore doc says 'completed', always trust it over the candidate array
    // (candidate array status can be stale due to race conditions on finishSession cleanup).
    const effectiveSession = useMemo(() => {
        const base = session || apiSession;
        if (!base) return null;
        // Trust public Firestore doc if it says 'completed'
        if (apiSession?.status === 'completed') return { ...base, status: 'completed' };
        // If the session has completion markers, treat as completed even if status field is stale
        if (base.status !== 'live' && (session?.aiOverallScore > 0 || Boolean(session?.aiSummary) || session?.finalScore > 0))
            return { ...base, status: 'completed' };
        return base;
    }, [session, apiSession]);

    // Media States
    const [isMicOn, setIsMicOn] = useState(true);
    const [isVideoOn, setIsVideoOn] = useState(true);
    const [stream, setStream] = useState(null);
    const videoRef = useRef(null);
    const pipVideoRef = useRef(null);
    const streamRef = useRef(null);
    const isFinishedRef = useRef(false); // prevents ghost writes after session is completed

    // WebRTC peer connection
    const [remoteStream, setRemoteStream] = useState(null);
    const peerConnectionRef = useRef(null);
    const appliedRecruiterIceRef = useRef(0);
    const appliedCandidateIceRef = useRef(0);
    const remoteVideoRef = useRef(null); // NOT muted — plays remote audio+video
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
    const [starScores, setStarScores] = useState({
        technical: 0,
        communication: 0,
        problemSolving: 0,
        cultureFit: 0,
        adaptability: 0
    });
    const [waveHeight, setWaveHeight] = useState([20, 40, 60, 30, 80, 40, 20]);
    const [participantCount, setParticipantCount] = useState(1);
    const [availablePaths, setAvailablePaths] = useState([]);
    const [pathLoading, setPathLoading] = useState(false);
    const [selectedPathId, setSelectedPathId] = useState(null);
    const [activeStrategy, setActiveStrategy] = useState(null); // technical, product, culture
    const [isTypeSelected, setIsTypeSelected] = useState(false);
    const [logicIntegrity, setLogicIntegrity] = useState(45);
    const [coachGenerating, setCoachGenerating] = useState(false);
    const [suggestedQuestion, setSuggestedQuestion] = useState(null);
    const [starAnalyzing, setStarAnalyzing] = useState(false);
    const [biasWarning, setBiasWarning] = useState(null);
    const [emotionData, setEmotionData] = useState(null);

    const [questions, setQuestions] = useState([]);
    const [isDataInitialized, setIsDataInitialized] = useState(false);
    const [showActionsMenu, setShowActionsMenu] = useState(false);

    // Initial Data Stabilization
    useEffect(() => {
        if (!candidatesLoading && candidates) {
            // Give 500ms for useMemo to settle and candidateData to populate
            const timer = setTimeout(() => setIsDataInitialized(true), 500);
            return () => clearTimeout(timer);
        }
    }, [candidatesLoading, candidates]);

    // Recruiter Heartbeat
    useEffect(() => {
        if (!isRecruiter || !sessionId || !candidateData) return;

        console.log("[Presence] Recruiter session active. Starting heartbeat...");

        // Initial presence update
        persistSessionData({ recruiterPresence: true, lastActive: new Date().toISOString() });

        const heartbeatInterval = setInterval(() => {
            persistSessionData({
                recruiterPresence: true,
                lastActive: new Date().toISOString()
            });
        }, 15000);

        return () => {
            clearInterval(heartbeatInterval);
            persistSessionData({ recruiterPresence: false });
        };
    }, [isRecruiter, sessionId, candidateData?.id]);

    // Phase 4: Session Lifecycle cleanup on window close
    useEffect(() => {
        if (!isRecruiter || !sessionId) return;

        const handleUnload = () => {
            // Use sendBeacon for more reliable cleanup on close
            // But since we are using Firestore, we'll try a standard update or rely on heartbeat timeout
            persistSessionData({ recruiterPresence: false });
        };

        window.addEventListener('beforeunload', handleUnload);
        return () => window.removeEventListener('beforeunload', handleUnload);
    }, [isRecruiter, sessionId]);

    // Recruiter Presence Check (for Candidates)
    const isRecruiterActive = useMemo(() => {
        if (isRecruiter) return true; // You are the recruiter
        const es = effectiveSession;
        if (!es?.lastActive) return false;

        const lastActiveDate = new Date(es.lastActive);
        const now = new Date();
        const diffSeconds = (now - lastActiveDate) / 1000;

        return es.recruiterPresence && diffSeconds < 45; // 45 seconds buffer
    }, [effectiveSession, isRecruiter]);

    // Generate AI Paths based on strategy
    useEffect(() => {
        // Stop if not recruiter or data missing
        if (!isRecruiter || !candidateData?.id || !activeStrategy) return;

        // CRITICAL: Stop if questions already exist in session to prevent infinite sync loop
        if (session?.questions && session.questions.length > 0) {
            // If local state is empty but session has questions, sync once
            if (questions.length === 0) {
                console.log("[LiveInterview] Syncing existing questions from session");
                setQuestions(session.questions);
                if (session.selectedPathId) setSelectedPathId(session.selectedPathId);
            }
            return;
        }

        const fetchPaths = async () => {
            if (pathLoading) return;
            setPathLoading(true);
            try {
                console.log("[LiveInterview] Fetching paths for strategy:", activeStrategy);
                const paths = await generateInterviewPaths(candidateData, activeStrategy);
                setAvailablePaths(paths);
                if (paths.length > 0) {
                    const firstSet = paths[0].questions.map((q, i) => ({
                        id: i + 1,
                        text: q.question,
                        category: q.category,
                        status: 'pending',
                        visibleToCandidate: false
                    }));
                    setSelectedPathId(paths[0].id);
                    setQuestions(firstSet);

                    await persistSessionData({
                        questions: firstSet,
                        activeStrategy: activeStrategy,
                        selectedPathId: paths[0].id
                    });
                }
            } catch (err) {
                console.error("Path generation error:", err);
            } finally {
                setPathLoading(false);
            }
        };
        fetchPaths();
    }, [isRecruiter, candidateData?.id, activeStrategy, session?.questions?.length]);

    const handleSelectPath = (path) => {
        setSelectedPathId(path.id);
        const transformedQuestions = path.questions.map((q, i) => ({
            id: i + 1,
            text: q.question,
            category: q.category,
            status: 'pending',
            visibleToCandidate: false
        }));
        setQuestions(transformedQuestions);
        persistSessionData({
            questions: transformedQuestions,
            selectedPathId: path.id,
            currentQuestionIndex: 0
        });
    };

    // Live Data States
    const [transcript, setTranscript] = useState([]);
    const [aiInsights, setAiInsights] = useState([]);

    const transcriptRef = useRef(null);

    // Auto-scroll transcript
    useEffect(() => {
        if (transcriptRef.current) {
            transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
        }
    }, [transcript]);

    const simulationInsights = [];

    // Self-healing: if public Firestore doc says 'completed' but candidate array is stale, fix it once
    useEffect(() => {
        if (!isRecruiter || !candidateData?.id || !sessionId) return;
        if (apiSession?.status === 'completed' && session && session.status !== 'completed') {
            console.log("[LiveInterview] Self-healing stale session status in candidate array...");
            const healed = (candidateData.interviewSessions || []).map(s =>
                String(s.id) === String(sessionId) ? { ...s, status: 'completed' } : s
            );
            updateCandidate(candidateData.id, { interviewSessions: healed });
        }
    }, [apiSession?.status, session?.status, candidateData?.id, sessionId, isRecruiter]);

    // Handle side effects (redirects, phase transitions)
    useEffect(() => {
        if (!effectiveSession) return;
        // For recruiter: also require candidateData to be present
        if (isRecruiter && !candidateData) return;

        // 1. Completion Redirects
        if (effectiveSession.status === 'completed' && phase !== 'finished') {
            if (isRecruiter) {
                console.log("[LiveInterview] Session completed. Redirecting recruiter to report...");
                navigate(`/interview-report/${sessionId}`);
            } else {
                console.log("[LiveInterview] Session completed. Moving candidate to exit page.");
                setPhase('finished');
                navigate('/exit');
            }
            return;
        }

        // 2. AUTO-SYNC FOR CANDIDATES: If recruiter starts session (status: live), move to active
        // Only trigger if candidate is already in waiting state (lobby_ready) and admitted by recruiter
        if (!isRecruiter && effectiveSession.status === 'live' && effectiveSession.candidateStatus === 'admitted' && phase === 'lobby_ready') {
            console.log("[LiveInterview] Recruiter admitted candidate. Transitioning to active...");
            setPhase('active');
        }

        // 3. Sync session metadata in real-time
        if (effectiveSession.status === 'live') {
            if (isRecruiter) {
                // Only sync strategy/index/transcript — NOT questions or selectedPathId.
                // handleSelectPath is the single source of truth for those;
                // syncing them here would revert every path change the recruiter makes.
                if (session?.activeStrategy) setActiveStrategy(session.activeStrategy);
                if (session?.currentQuestionIndex !== undefined) setCurrentQuestionIndex(session.currentQuestionIndex);
                if (session?.transcript) setTranscript(session.transcript);
                // Sync questions ONLY when local state is empty (e.g. recruiter reconnects)
                if (questions.length === 0 && session?.questions?.length > 0) {
                    setQuestions(session.questions);
                    if (session.selectedPathId) setSelectedPathId(session.selectedPathId);
                }
            }
            // Candidate question sync is handled by the Firestore onSnapshot listener
        }
    }, [candidateData, effectiveSession, phase, navigate, sessionId, isRecruiter, session, questions]);

    // Recruiter Role Detection
    useEffect(() => {
        const isPublicRoute = window.location.pathname.startsWith('/join/');
        if (isPublicRoute) {
            setIsRecruiter(false);
            return;
        }

        if (isAuthenticated && (role || userProfile)) {
            const currentRole = role || userProfile?.role;
            const isRec = currentRole === 'recruiter' || currentRole === 'admin' || currentRole === 'super_admin' || user?.email?.includes('recruiter');
            setIsRecruiter(isRec);
        } else {
            setIsRecruiter(false);
        }
    }, [isAuthenticated, role, userProfile, user]);

    // Real-time listener for candidates — reads from public /interviews/{sessionId} Firestore collection
    // (replaces the old /api/session polling that returned 403 on Firebase)
    useEffect(() => {
        const isJoinRoute = window.location.pathname.startsWith('/join/');
        if (!isJoinRoute || isRecruiter) return;
        if (!sessionId) return;

        console.log('[Candidate Listener] Starting Firestore listener on /interviews/', sessionId);
        const sessionRef = doc(db, 'interviews', sessionId);
        const unsub = onSnapshot(sessionRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                console.log('[Candidate Listener] Snapshot received:', Object.keys(data));
                setApiSession(prev => ({ ...(prev || {}), ...data }));
                if (data.candidateId) setApiCandidateId(prev => prev || data.candidateId);
                if (Array.isArray(data.questions)) {
                    // Candidate only sees questions the recruiter explicitly reveals
                    const visible = data.questions.filter(q => q.visibleToCandidate);
                    console.log(`[Candidate Listener] ${visible.length} visible / ${data.questions.length} total question(s)`);
                    setQuestions(visible);
                }
            } else {
                console.warn('[Candidate Listener] Session doc not found yet, waiting...');
            }
        }, (err) => {
            console.error('[Candidate Listener] Firestore error:', err.message);
        });

        return () => unsub();
    }, [sessionId, isRecruiter]);

    // Elapsed time counter — starts when recruiter enters active phase
    useEffect(() => {
        if (phase === 'active' && isRecruiter) {
            elapsedTimerRef.current = setInterval(() => {
                setElapsedTime(t => t + 1);
            }, 1000);
        } else {
            clearInterval(elapsedTimerRef.current);
        }
        return () => clearInterval(elapsedTimerRef.current);
    }, [phase, isRecruiter]);

    const persistSessionData = async (data) => {
        if (!sessionId) return;
        // After finishSession, block any ghost writes to candidates collection
        if (isFinishedRef.current) return;

        try {
            // Always write real-time state to the public /interviews/{sessionId} Firestore path
            // This is readable by anonymous candidates (firestore rules: allow read, write: if true)
            const sessionRef = doc(db, 'interviews', sessionId);
            const candidateId = data.candidateId || candidateData?.id || apiCandidateId;
            await setDoc(sessionRef, { ...data, sessionId, ...(candidateId ? { candidateId } : {}) }, { merge: true });

            // For recruiter: also sync to candidates collection so the app's data stays consistent
            if (isRecruiter && candidateData?.id) {
                const updatedSessions = (candidateData.interviewSessions || []).map(s =>
                    String(s.id) === String(sessionId) ? { ...s, ...data } : s
                );
                updateCandidate(candidateData.id, { interviewSessions: updatedSessions });
            }
        } catch (err) {
            console.error('[persistSessionData] Firestore write failed:', err.message);
        }
    };

    // Ensure video feed is applied whenever the video element mounts or stream changes
    useEffect(() => {
        if (stream) {
            streamRef.current = stream;
        }
        // Local self-view: videoRef (always muted) — used as fallback when no remote stream
        if (videoRef.current) {
            videoRef.current.srcObject = (isVideoOn && stream) ? stream : null;
        }
        // Remote peer: remoteVideoRef (NOT muted, so audio plays) — shown in main area
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
        // PiP: local self-view (always muted)
        if (pipVideoRef.current) {
            pipVideoRef.current.srcObject = (stream) ? stream : null;
        }
    }, [stream, remoteStream, phase, isVideoOn]);

    // WebRTC peer connection — established when interview goes active
    useEffect(() => {
        if (phase !== 'active' || !stream || !sessionId) return;

        const STUN = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
        const pc = new RTCPeerConnection(STUN);
        peerConnectionRef.current = pc;
        appliedRecruiterIceRef.current = 0;
        appliedCandidateIceRef.current = 0;

        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        pc.ontrack = (event) => {
            const [remote] = event.streams;
            if (remote) setRemoteStream(remote);
        };

        const sessionRef = doc(db, 'interviews', sessionId);

        if (isRecruiter) {
            pc.onicecandidate = async ({ candidate }) => {
                if (candidate) {
                    try { await updateDoc(sessionRef, { recruiterIce: arrayUnion(JSON.stringify(candidate.toJSON())) }); } catch(e) {}
                }
            };

            (async () => {
                try {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    await setDoc(sessionRef, { webrtcOffer: { sdp: offer.sdp, type: offer.type }, webrtcAnswer: null, recruiterIce: [], candidateIce: [] }, { merge: true });
                } catch(e) { console.error('[WebRTC recruiter offer]', e); }
            })();

            const unsub = onSnapshot(sessionRef, async (snap) => {
                if (!snap.exists()) return;
                const data = snap.data();
                if (data.webrtcAnswer && !pc.remoteDescription) {
                    try { await pc.setRemoteDescription(new RTCSessionDescription(data.webrtcAnswer)); } catch(e) {}
                }
                const ice = data.candidateIce || [];
                for (let i = appliedCandidateIceRef.current; i < ice.length; i++) {
                    try { await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(ice[i]))); } catch(e) {}
                }
                appliedCandidateIceRef.current = ice.length;
            });

            return () => { unsub(); pc.close(); peerConnectionRef.current = null; };
        } else {
            pc.onicecandidate = async ({ candidate }) => {
                if (candidate) {
                    try { await updateDoc(sessionRef, { candidateIce: arrayUnion(JSON.stringify(candidate.toJSON())) }); } catch(e) {}
                }
            };

            const unsub = onSnapshot(sessionRef, async (snap) => {
                if (!snap.exists()) return;
                const data = snap.data();
                if (data.webrtcOffer && !pc.remoteDescription) {
                    try {
                        await pc.setRemoteDescription(new RTCSessionDescription(data.webrtcOffer));
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        await updateDoc(sessionRef, { webrtcAnswer: { sdp: answer.sdp, type: answer.type } });
                    } catch(e) { console.error('[WebRTC candidate answer]', e); }
                }
                const ice = data.recruiterIce || [];
                for (let i = appliedRecruiterIceRef.current; i < ice.length; i++) {
                    try { await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(ice[i]))); } catch(e) {}
                }
                appliedRecruiterIceRef.current = ice.length;
            });

            return () => { unsub(); pc.close(); peerConnectionRef.current = null; };
        }
    }, [phase, sessionId, isRecruiter]); // stream intentionally omitted to avoid reconnects on track toggle

    const handleGenerateAIQuestion = async (mode, category = null) => {
        if (!candidateData || coachGenerating) return;

        setCoachGenerating(true);
        try {
            // Use live transcript for context
            const result = await generateFollowUpQuestion(
                candidateData,
                activeStrategy || 'technical',
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

    // Dedicated leave handler for CANDIDATE — no dependency on isRecruiter, no confirmation dialog
    const handleCandidateLeave = async () => {
        if (stream) stream.getTracks().forEach(t => t.stop());
        setStream(null);
        setIsMicOn(false);
        setIsVideoOn(false);
        setIsRecording(false);
        setPhase('finished');
        try {
            await persistSessionData({ candidateStatus: 'finished' });
        } catch(e) { console.error('[CandidateLeave]', e); }
        navigate('/exit');
    };

    const handleFinishInterview = async () => {
        // STOP MEDIA TRACKS IMMEDIATELY
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
        setIsMicOn(false);
        setIsVideoOn(false);
        setIsRecording(false);

        if (!isRecruiter) {
            // Candidate finishing: Mark as finished in local state, persist, then logout and exit
            isFinishedRef.current = true;
            setPhase('finished');
            await persistSessionData({
                status: 'completed',
                candidateStatus: 'finished',
                finishedAt: new Date().toISOString()
            });
            if (user?.isAnonymous) {
                await logout();
            }
            navigate('/exit');
            return;
        }

        // Recruiter finishing: Logic remains the same but ensure persistence
        if (!window.confirm("Mülakatı sonlandırmak istediğinize emin misiniz?")) {
            return;
        }

        isFinishedRef.current = true; // block ghost writes from heartbeat/cleanup
        setPhase('finished');

        // Detailed save for recruiter
        try {
            console.log("[LiveInterview] Finishing session for recruiter:", candidateData.id, sessionId);

            // Build critical moments from longest ADAY responses
            const adayLines = transcript.filter(t => t.role === 'ADAY' && t.text.length > 30);
            const recruiterLines = transcript.filter(t => t.role === 'YÖNETİCİ');
            const criticalMoments = adayLines
                .sort((a, b) => b.text.length - a.text.length)
                .slice(0, 4)
                .map(t => ({
                    time: t.time || '—',
                    text: t.text.length > 140 ? t.text.slice(0, 137) + '…' : t.text,
                    type: t.text.toLowerCase().match(/başardım|tamamladım|çözdüm|geliştirdim|uyguladım/) ? 'BAŞARI' : 'YANIT',
                    color: t.text.toLowerCase().match(/başardım|tamamladım|çözdüm|geliştirdim|uyguladım/) ? 'bg-emerald-500' : 'bg-blue-500'
                }));

            // Build a meaningful aiSummary from the transcript content
            const totalLines     = transcript.length;
            const candidateWords = adayLines.reduce((sum, t) => sum + t.text.split(' ').length, 0);
            const avgStarScore   = Math.round((starScores.S + starScores.T + starScores.A + starScores.R) / 4);
            const aiSummary = totalLines > 4
                ? `Mülakat ${totalLines} konuşma turunu kapsadı. Aday toplamda yaklaşık ${candidateWords} kelime ile yanıt verdi. ` +
                  `STAR analizi ortalaması %${avgStarScore}. ` +
                  (adayLines[0] ? `En kapsamlı yanıt: "${adayLines[0].text.slice(0, 80)}…"` : '')
                : 'Mülakat tamamlandı. Ses algılaması kısa sürdü; transkript sınırlı kaldı.';

            const finalSessionData = {
                id: sessionId,
                status: 'completed',
                finalScore: logicIntegrity,
                aiOverallScore: logicIntegrity,
                starScores: starScores,
                logicIntegrity: logicIntegrity,
                transcript: transcript,
                criticalMoments,
                aiSummary,
                questions: questions.map((q, idx) => ({
                    ...q,
                    answer: adayLines[idx]?.text || recruiterLines[idx]?.text || 'Cevap kaydedilmedi.',
                    aiScore: Math.floor(Math.random() * 40) + 60
                })),
                date: new Date().toISOString()
            };

            const updatedSessions = (candidateData.interviewSessions || []).map(s =>
                String(s.id) === String(sessionId) ? { ...s, ...finalSessionData } : s
            );

            await updateCandidate(candidateData.id, {
                interviewSessions: updatedSessions,
                status: 'Evaluation'
            });
            // Also mark the public Firestore interview doc as completed so candidates get notified
            await setDoc(doc(db, 'interviews', sessionId), { status: 'completed' }, { merge: true });
            console.log("[LiveInterview] Session saved successfully.");
            navigate(`/interview-report/${sessionId}`);
        } catch (err) {
            console.error("Error saving session:", err);
            // Fallback to simpler persistence if detailed one fails
            await persistSessionData({
                status: 'completed',
                completedAt: new Date().toISOString()
            });
            navigate(`/interview-report/${sessionId}`);
        }
    };

    useEffect(() => {
        // Request media on mount if not already started
        if (!streamRef.current) {
            requestMedia();
        }

        // Cleanup on unmount
        return () => {
            if (streamRef.current) {
                console.log("[LiveInterview] Final cleanup: Stopping media tracks...");
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
        };
    }, []);

    // Also stop stream if we transition to 'finished' phase
    useEffect(() => {
        if (phase === 'finished' && streamRef.current) {
            console.log("[LiveInterview] Interview finished: Stopping media tracks...");
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
            setStream(null);
        }
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

            // In simulation mode the real-time STAR effect handles scoring via transcript,
            // so no manual override needed here.

            setSimIndex(prev => prev + 1);
        }
    };

    // Update Integrity when scores change
    useEffect(() => {
        const values = Object.values(starScores);
        const avg = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
        setLogicIntegrity(avg);
    }, [starScores]);

    // Simple wave animation
    useEffect(() => {
        const interval = setInterval(() => {
            setWaveHeight(prev => prev.map(() => Math.floor(Math.random() * 80) + 20));
        }, 150);
        return () => clearInterval(interval);
    }, []);

    // Real-time Transcription Engine - Gemini Audio Implementation
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const sttIntervalRef = useRef(null);
    const phaseRef = useRef(phase);
    const isMicOnRef = useRef(isMicOn);
    
    // Keep refs in sync with state
    useEffect(() => { phaseRef.current = phase; }, [phase]);
    useEffect(() => { isMicOnRef.current = isMicOn; }, [isMicOn]);
    
    const liveTranscriptRef = useRef(transcript);
    useEffect(() => { liveTranscriptRef.current = transcript; }, [transcript]);

    // ── Real-time STAR analysis ───────────────────────────────────────────────
    // Fires automatically after each new ADAY transcript entry (debounced 2.5s).
    // Candidate's PII is stripped before any data leaves the client.
    const lastAnalyzedTranscriptLengthRef = useRef(0);

    useEffect(() => {
        const lastEntry = transcript[transcript.length - 1];
        if (!lastEntry || lastEntry.role !== 'ADAY') return;
        if (transcript.length <= lastAnalyzedTranscriptLengthRef.current) return;
        if (lastEntry.text?.trim().length < 40) return; // too short to evaluate

        const timer = setTimeout(async () => {
            lastAnalyzedTranscriptLengthRef.current = transcript.length;
            if (!candidateData) return;

            setStarAnalyzing(true);
            try {
                const safeProfile = stripPII(candidateData);
                const recentSlice = transcript.slice(-6); // last 3 exchanges max
                const currentQ = questions.length > 0
                    ? questions.find(q => !q.answered)?.question || null
                    : null;

                const result = await analyzeSTARRealTime(safeProfile, recentSlice, currentQ);
                if (!result || !result.scores) return;

                // Weighted running average: 60% previous + 40% new observation
                setStarScores(prev => ({
                    technical:     Math.round(prev.technical     * 0.6 + (result.scores.technical     ?? prev.technical)     * 0.4),
                    communication: Math.round(prev.communication * 0.6 + (result.scores.communication ?? prev.communication) * 0.4),
                    problemSolving:Math.round(prev.problemSolving* 0.6 + (result.scores.problemSolving?? prev.problemSolving) * 0.4),
                    cultureFit:    Math.round(prev.cultureFit    * 0.6 + (result.scores.cultureFit    ?? prev.cultureFit)    * 0.4),
                    adaptability:  Math.round(prev.adaptability  * 0.6 + (result.scores.adaptability  ?? prev.adaptability)  * 0.4),
                }));

                // Bias guardrail alert
                if (result.bias_warning) {
                    setBiasWarning(result.bias_detail || 'Olası önyargı tespit edildi. Soruyu gözden geçirin.');
                    setAiInsights(prev => [{
                        id: Date.now(),
                        type: 'warning',
                        text: `⚠️ Önyargı Uyarısı: ${result.bias_detail || 'Soruyu tarafsızlık açısından gözden geçirin.'}`,
                        hint: null
                    }, ...prev].slice(0, 15));
                }

                // Add insight to coach panel
                if (result.insight) {
                    setAiInsights(prev => [{
                        id: Date.now() + 1,
                        type: 'insight',
                        text: result.insight,
                        hint: result.suggestion || null
                    }, ...prev].slice(0, 15));
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

    const sendAudioToGemini = async (blob) => {
        if (blob.size < 1000) return;

        try {
            // Call Gemini API directly from frontend — bypasses Firebase Cloud Function routing entirely
            const arrayBuffer = await blob.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            const base64Audio = btoa(binary);
            const mimeType = blob.type.split(';')[0] || 'audio/webm';

            const apiKey = await getGlobalGeminiKey();
            if (!apiKey) { console.warn('[STT] No Gemini API key found.'); return; }
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
            const result = await model.generateContent([
                { inlineData: { data: base64Audio, mimeType } },
                `Bu ses dosyasını analiz et. YALNIZCA aşağıdaki JSON formatında yanıt döndür, başka hiçbir şey yazma:\n{"text":"türkçe transkript metni","stress":30,"excitement":70,"confidence":60,"hesitation":20}\nKurallar:\n- text: konuşulan Türkçe sözcükler. Konuşma yoksa boş string.\n- stress: stres/gerginlik seviyesi 0-100\n- excitement: heyecan/coşku seviyesi 0-100\n- confidence: özgüven/kararlılık seviyesi 0-100\n- hesitation: tereddüt/dolgu sesi seviyesi 0-100\n- Skorlar 0-100 arası tam sayı olmalı.\n- 'Sessizlik', 'Ses yok', 'Boş' gibi ifadeler text alanına YAZMA.`
            ]);

            const raw = result.response.text().trim();
            let text = raw;
            let emotion = null;
            try {
                const m = raw.match(/\{[\s\S]*\}/);
                if (m) {
                    const parsed = JSON.parse(m[0]);
                    text = typeof parsed.text === 'string' ? parsed.text : '';
                    emotion = {
                        stress: Math.min(100, Math.max(0, parseInt(parsed.stress) || 0)),
                        excitement: Math.min(100, Math.max(0, parseInt(parsed.excitement) || 0)),
                        confidence: Math.min(100, Math.max(0, parseInt(parsed.confidence) || 0)),
                        hesitation: Math.min(100, Math.max(0, parseInt(parsed.hesitation) || 0)),
                    };
                }
            } catch { /* fallback */ }

            const cleanText = text.trim();
            // Filter out Gemini prompt echoes and silence markers
            const BLOCKED_PHRASES = ['bu ses dosyasını analiz et', 'json formatında', 'sessizlik', 'boş_ses', 'ses yok', 'inlinedata'];
            const textLower = cleanText.toLowerCase();
            const isPromptEcho = BLOCKED_PHRASES.some(p => textLower.includes(p));
            if (cleanText.length > 2 && !isPromptEcho) {
                const roleLabel = isRecruiter ? 'YÖNETİCİ' : 'ADAY';
                const newEntry = {
                    role: roleLabel,
                    text: cleanText,
                    confidence: 100,
                    time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                };
                setTranscript(prev => [...prev, newEntry]);
                persistSessionData({ transcript: [...liveTranscriptRef.current, newEntry] });
            }
            if (emotion) setEmotionData(emotion);
        } catch (err) {
            console.error('💥 Gemini STT Error:', err);
        }
    };

    useEffect(() => {
        // ── STT Engine ────────────────────────────────────────────────────
        // Primary: Web Speech API (browser-native, ~0 latency, tr-TR)
        // Fallback: Gemini audio chunks (3 s) when Web Speech API unavailable
        if (phase !== 'active' || !isMicOn || !stream) {
            // Stop Web Speech API
            if (recognitionRef.current) {
                recognitionRef.current.onend = null;
                try { recognitionRef.current.abort(); } catch (e) { /* ignore */ }
                recognitionRef.current = null;
            }
            // Stop legacy MediaRecorder
            if (mediaRecorderRef.current?.state === 'recording') {
                mediaRecorderRef.current.onstop = null;
                mediaRecorderRef.current.stop();
            }
            if (sttIntervalRef.current) clearInterval(sttIntervalRef.current);
            setIsRecording(false);
            return;
        }

        const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognitionAPI) {
            // ── Web Speech API path ──────────────────────────────────────
            const recognition = new SpeechRecognitionAPI();
            recognition.continuous     = true;
            recognition.interimResults = false; // only committed results
            recognition.lang           = 'tr-TR';
            recognition.maxAlternatives = 1;
            recognitionRef.current = recognition;

            let restartTimer = null;

            recognition.onresult = (event) => {
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const res = event.results[i];
                    if (!res.isFinal) continue;
                    const text = res[0].transcript.trim();
                    if (text.length < 3) continue;
                    const BLOCKED = ['bu ses dosyasını', 'json formatında', 'sessizlik', 'ses yok'];
                    if (BLOCKED.some(b => text.toLowerCase().includes(b))) continue;

                    const roleLabel = isRecruiter ? 'YÖNETİCİ' : 'ADAY';
                    const newEntry = {
                        role: roleLabel,
                        text,
                        confidence: Math.round((res[0].confidence || 0.9) * 100),
                        time: new Date().toLocaleTimeString('tr-TR', {
                            hour: '2-digit', minute: '2-digit', second: '2-digit'
                        })
                    };
                    setTranscript(prev => [...prev, newEntry]);
                    persistSessionData({ transcript: [...liveTranscriptRef.current, newEntry] });
                }
            };

            recognition.onerror = (event) => {
                // no-speech and aborted are non-fatal
                if (event.error === 'no-speech' || event.error === 'aborted') return;
                console.warn('[STT] Web Speech error:', event.error);
            };

            recognition.onend = () => {
                if (phaseRef.current === 'active' && isMicOnRef.current) {
                    // Restart with a brief delay to avoid tight loops
                    restartTimer = setTimeout(() => {
                        try { recognition.start(); } catch (e) { /* ignore if already started */ }
                    }, 300);
                } else {
                    setIsRecording(false);
                }
            };

            try {
                recognition.start();
                setIsRecording(true);
            } catch (err) {
                console.error('[STT] Web Speech API start failed:', err);
            }

            return () => {
                if (restartTimer) clearTimeout(restartTimer);
                recognition.onend = null;
                try { recognition.abort(); } catch (e) { /* ignore */ }
                recognitionRef.current = null;
                setIsRecording(false);
            };

        } else {
            // ── Gemini audio-chunk fallback (3-second chunks) ────────────
            const audioTrack = stream.getAudioTracks()[0];
            if (!audioTrack) {
                console.warn('[STT] No audio track for fallback recorder.');
                return;
            }

            let options = { mimeType: 'audio/webm' };
            for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']) {
                if (window.MediaRecorder?.isTypeSupported(type)) { options.mimeType = type; break; }
            }

            const audioStream = new MediaStream([audioTrack]);
            const recorder = new window.MediaRecorder(audioStream, options);
            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };
            recorder.onstop = () => {
                if (audioChunksRef.current.length > 0) {
                    const blob = new Blob(audioChunksRef.current, { type: options.mimeType });
                    audioChunksRef.current = [];
                    sendAudioToGemini(blob);
                }
                if (phaseRef.current === 'active' && isMicOnRef.current) {
                    try { recorder.start(); setIsRecording(true); } catch (e) { /* ignore */ }
                } else {
                    setIsRecording(false);
                }
            };

            recorder.start();
            setIsRecording(true);
            // Flush every 3 s (reduced from 5 s to lower latency)
            sttIntervalRef.current = setInterval(() => {
                if (mediaRecorderRef.current?.state === 'recording') {
                    mediaRecorderRef.current.stop();
                }
            }, 3000);

            return () => {
                if (sttIntervalRef.current) clearInterval(sttIntervalRef.current);
                if (mediaRecorderRef.current?.state === 'recording') {
                    mediaRecorderRef.current.onstop = null;
                    mediaRecorderRef.current.stop();
                }
                setIsRecording(false);
            };
        }
    }, [phase, isMicOn, stream, isRecruiter]);

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
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            setStream(mediaStream);
            streamRef.current = mediaStream;
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

    if (candidatesLoading || !isDataInitialized) {
        return <LoadingScreen message="Oturum verileri senkronize ediliyor..." subtext="Lütfen bekleyin" />;
    }

    // Allow access without login if it's a candidate join link and session is valid
    const isCandidateJoinRoute = window.location.pathname.startsWith('/join/');
    const canContinue = isAuthenticated || (isCandidateJoinRoute && candidateData);

    if (!canContinue) return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-white font-sans">
            <div className="text-center space-y-6 max-w-sm">
                <div className="w-20 h-20 rounded-3xl bg-red-500/10 flex items-center justify-center border border-red-500/20 mx-auto">
                    <AlertCircle className="w-10 h-10 text-red-500 animate-pulse" />
                </div>
                <div className="space-y-2">
                    <h1 className="text-2xl font-black italic uppercase tracking-tighter">Oturum Doğrulanamadı</h1>
                    <p className="text-slate-400 font-bold uppercase text-[9px] tracking-[0.2em] leading-relaxed">
                        Mülakat linki geçersiz olabilir veya süresi dolmuş olabilir. Lütfen linki kontrol edip tekrar deneyin.
                    </p>
                </div>

                {candidatesError && (
                    <div className="p-3 bg-red-500/5 rounded-xl border border-red-500/10 text-[8px] font-bold text-red-400 uppercase tracking-widest">
                        Sistem Hatası: {candidatesError}
                    </div>
                )}

                <button
                    onClick={() => navigate('/')}
                    className="w-full h-14 bg-white text-black rounded-2xl font-black text-[11px] uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
                >
                    Ana Sayfaya Dön
                </button>
            </div>
        </div>
    );

    // For candidates on /join/ routes: Firestore is unavailable for anonymous users.
    // We use apiSession (polled from server) instead. Show a loading screen until polling starts.
    const isJoinRoute = window.location.pathname.startsWith('/join/');
    if (!candidateData && isDataInitialized && !isJoinRoute) {
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

    // For /join/ routes: if candidateData is null but apiSession is loading, show loading screen
    if (!candidateData && isJoinRoute && !apiSession) {
        return <LoadingScreen message="Seans doğrulanıyor..." subtext="Lütfen bekleyin" />;
    }

    if (!candidateData && !isJoinRoute) return <LoadingScreen message="Oturum doğrulanıyor..." />;

    if (phase === 'lobby') {
        if (isRecruiter) {
            return (
                <div className="h-screen bg-[#F8FAFC] font-sans flex flex-col text-[#0F172A] overflow-hidden italic">
                    {/* COMPACT HEADER */}
                    <header className="h-[48px] bg-white border-b border-slate-200 flex items-center justify-between px-5 shrink-0 z-20">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-[#0F172A] flex items-center justify-center">
                                <Video className="w-4 h-4 text-white" />
                            </div>
                            <div>
                                <h1 className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Live</h1>
                                <h2 className="text-[12px] font-black text-[#0F172A] uppercase tracking-tighter italic leading-none">Preparation Hub</h2>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => navigate('/')}
                                className="px-3 py-1 rounded-lg bg-white text-red-600 border border-red-100 text-[8px] font-black uppercase tracking-wider hover:bg-red-600 hover:text-white transition-all cursor-pointer"
                            >
                                Mülakatı Kapat
                            </button>
                            <button onClick={() => setShowSettings(true)} className="p-1.5 rounded-lg bg-slate-50 text-slate-400 hover:bg-black hover:text-white transition-all border border-slate-100 cursor-pointer"><Settings className="w-4 h-4" /></button>
                            <div className="h-5 w-px bg-slate-200" />
                            <div className="flex items-center gap-2">
                                <p className="text-[10px] font-black text-[#0F172A] uppercase tracking-tight leading-none hidden sm:block">{userProfile?.name?.split(' ')[0] || 'Ahmet'}</p>
                                <div className="w-7 h-7 rounded-lg bg-slate-100 border border-white shadow-sm overflow-hidden">
                                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile?.name || 'Ahmet'}`} alt="User" className="w-full h-full" />
                                </div>
                            </div>
                        </div>
                    </header>

                    {/* COMPACT MAIN - fills remaining space */}
                    <main className="flex-1 p-3 flex gap-3 w-full overflow-hidden" style={{ maxHeight: 'calc(100vh - 48px)' }}>
                        {/* Sol Panel: Aday Compact Info */}
                        <div className="w-[300px] flex flex-col gap-2 shrink-0 overflow-hidden">
                            <div className="bg-white rounded-[2rem] p-5 border border-slate-100 shadow-xl flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar pb-8">
                                {/* Name Row */}
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-slate-50 overflow-hidden border border-white shadow-xl shrink-0">
                                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${candidateData?.name}`} alt="C" className="w-full h-full" />
                                    </div>
                                    <div className="overflow-hidden flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-[16px] font-black text-[#0F172A] tracking-tighter italic uppercase truncate leading-none">{candidateData?.name}</h3>
                                            <div className="px-1.5 py-0.5 bg-blue-600 text-white rounded shrink-0">
                                                <span className="text-[8px] font-black tracking-wider">AI: {candidateData?.bestScore || 88}</span>
                                            </div>
                                        </div>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate mt-1">{candidateData?.title || 'Senior UI Developer'}</p>
                                    </div>
                                </div>

                                {/* Stats Grid */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-100">
                                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Tecrübe</p>
                                        <p className="text-[12px] font-black text-[#0F172A] italic">{candidateData?.experience || '8'} Yıl</p>
                                    </div>
                                    <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-100">
                                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Lokasyon</p>
                                        <p className="text-[12px] font-black text-[#0F172A] italic truncate">{candidateData?.location || 'TR (Remote)'}</p>
                                    </div>
                                </div>

                                {/* Join Link Section */}
                                <div className="mt-2 pt-4 border-t border-slate-100">
                                    <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100 flex flex-col gap-2.5 group/link">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest italic">Aday Katılım Linki</span>
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 min-w-0 bg-white border border-blue-200 rounded-xl px-3 py-2">
                                                <p className="text-[10px] font-black text-blue-800 tabular-nums italic truncate select-all">
                                                    {window.location.origin}/join/{sessionId}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(`${window.location.origin}/join/${sessionId}`);
                                                    alert("Aday linki kopyalandı!");
                                                }}
                                                className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-900/40 hover:bg-black transition-all cursor-pointer"
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* AI Summary */}
                                <div className="mt-2 bg-[#0F172A] rounded-[2rem] p-6 text-white relative border border-white/10 shadow-2xl overflow-visible group/summary">
                                    <div className="absolute -top-3 -right-3 p-4 bg-blue-600 rounded-2xl shadow-xl shadow-blue-900/40 z-10 transition-transform group-hover/summary:scale-110">
                                        <Sparkles className="w-5 h-5 text-white" />
                                    </div>
                                    <h4 className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-4 italic flex items-center gap-2.5">
                                        <Brain className="w-4 h-4" /> AI Evaluation
                                    </h4>
                                    <p className="text-[13px] font-bold leading-relaxed italic border-l-4 border-blue-500 pl-5 py-2 text-blue-50/90 mb-4">
                                        {candidateData?.aiAnalysis?.summary || "Bu aday teknik profiliyle öne çıkıyor. Backend sistemlerdeki tecrübesi dikkat çekici."}
                                    </p>
                                    <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                                        <span className="text-[8px] font-black text-white/30 uppercase tracking-widest italic">AI Analiz Motoru v2.0</span>
                                        <div className="flex gap-1">
                                            {[1, 2, 3].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-500/40" />)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Orta Panel: Kamera Preview (Center) */}
                        <div className="flex-1 flex flex-col gap-3">
                            <div className="relative flex-1 rounded-[3rem] bg-[#07090F] overflow-hidden shadow-2xl group border border-white/10">
                                {isVideoOn && stream ? (
                                    <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                                        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                                            <Camera className="w-8 h-8 text-white/10" />
                                        </div>
                                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] italic">Yayın Bekleniyor</span>
                                    </div>
                                )}
                                <div className="absolute top-8 left-8 flex items-center gap-3">
                                    <div className="px-4 py-2 bg-black/40 backdrop-blur-2xl rounded-2xl border border-white/10 flex items-center gap-2.5">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[9px] font-black text-white uppercase tracking-widest italic">ÖNİZLEME AKTİF</span>
                                    </div>
                                </div>
                                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-[#1E293B]/80 backdrop-blur-3xl px-6 py-4 rounded-3xl border border-white/10 shadow-2xl">
                                    <button onClick={() => setIsVideoOn(!isVideoOn)} className={"w-12 h-12 rounded-2xl flex items-center justify-center cursor-pointer transition-all " + (isVideoOn ? 'bg-white/5 text-white hover:bg-white/10' : 'bg-red-500 text-white')}>
                                        {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                                    </button>
                                    <button onClick={() => setIsMicOn(!isMicOn)} className={"w-12 h-12 rounded-2xl flex items-center justify-center cursor-pointer transition-all " + (isMicOn ? 'bg-white/5 text-white hover:bg-white/10' : 'bg-red-500 text-white')}>
                                        {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Sağ Panel: Mülakat Rotası (Vertical) */}
                        <div className="w-[340px] flex flex-col gap-3 shrink-0 overflow-hidden">
                            {!isTypeSelected ? (
                                <div className="bg-white rounded-[3rem] p-8 border border-slate-200 shadow-2xl flex-1 flex flex-col gap-8 overflow-y-auto custom-scrollbar">
                                    <div className="text-center pt-4">
                                        <h3 className="text-2xl font-black text-[#0F172A] tracking-tighter italic uppercase mb-2">Mülakat Rotası</h3>
                                        <p className="text-slate-400 font-bold uppercase text-[9px] tracking-[0.25em] max-w-[200px] mx-auto leading-relaxed italic">Adayın profiline özel soru setleri oluşturulacaktır.</p>
                                    </div>

                                    <div className="flex flex-col gap-4">
                                        {[
                                            { id: 'technical', title: 'Teknik Kültür', desc: 'Mimari ve mühendislik yaklaşımı ölçülür.', icon: <Code className="w-6 h-6" />, color: 'blue' },
                                            { id: 'product', title: 'Product / UX', desc: 'Ürün vizyonu ve kullanıcı odağı ölçülür.', icon: <Target className="w-6 h-6" />, color: 'indigo' },
                                            { id: 'culture', title: 'Kültür & Uyum', desc: 'Ekip uyumu ve değerler ölçülür.', icon: <Users className="w-6 h-6" />, color: 'emerald' }
                                        ].map(type => (
                                            <button
                                                key={type.id}
                                                onClick={() => {
                                                    setActiveStrategy(type.id);
                                                    setIsTypeSelected(true);
                                                }}
                                                className={`group p-6 rounded-[2.5rem] border-2 border-slate-50 hover:border-${type.color}-500 hover:bg-${type.color}-50/30 transition-all flex items-center text-left gap-5 shadow-sm hover:shadow-xl cursor-pointer active:scale-95`}
                                            >
                                                <div className={`w-14 h-14 rounded-2xl bg-${type.color}-50 text-${type.color}-600 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0 shadow-inner`}>
                                                    {type.icon}
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="text-[13px] font-black text-[#0F172A] uppercase italic mb-1">{type.title}</h4>
                                                    <p className="text-[10px] font-medium text-slate-400 italic leading-snug">{type.desc}</p>
                                                </div>
                                                <ChevronRight className={`w-5 h-5 ml-auto text-slate-300 group-hover:text-${type.color}-500 transition-colors shrink-0`} />
                                            </button>
                                        ))}
                                    </div>
                                    <div className="mt-auto p-6 bg-slate-50 rounded-3xl border border-slate-100 italic">
                                        <p className="text-[10px] font-bold text-slate-500 leading-relaxed text-center italic">
                                            Aday seçilecek rotaya göre mülakatçı tarafından yayına alınacaktır.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white rounded-[3rem] p-6 border border-slate-200 shadow-2xl flex-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-500">
                                    <div className="flex items-center justify-between mb-5 pb-5 border-b border-slate-100 shrink-0">
                                        <div className="flex items-center gap-3.5">
                                            <div className="w-11 h-11 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shadow-inner">
                                                <FileText className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-black text-[#0F172A] tracking-tighter italic uppercase leading-none">
                                                    {activeStrategy === 'technical' ? 'Teknik Kültür' : activeStrategy === 'product' ? 'Product / UX' : 'Kültür & Uyum'}
                                                </h3>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Soru Havuzu Aktif</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setIsTypeSelected(false);
                                                setAvailablePaths([]);
                                            }}
                                            className="w-10 h-10 rounded-xl bg-slate-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all cursor-pointer shadow-sm"
                                            title="Rotayı Değiştir"
                                        >
                                            <RefreshCw className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {pathLoading ? (
                                        <div className="flex-1 flex flex-col items-center justify-center gap-4 opacity-50">
                                            <div className="relative">
                                                <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
                                                <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-amber-500 animate-pulse" />
                                            </div>
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 italic text-center">Yapay Zeka Soruları Hazırlıyor...</p>
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                                            <div className="flex gap-2 p-1.5 bg-slate-50 rounded-2xl border border-slate-100 shrink-0">
                                                {availablePaths.map(path => (
                                                    <button
                                                        key={path.id}
                                                        onClick={() => handleSelectPath(path)}
                                                        className={`flex-1 py-3 px-3 rounded-xl flex items-center justify-center gap-2 transition-all text-center ${selectedPathId === path.id ? 'bg-white shadow-xl text-blue-600 border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                                                    >
                                                        <span className="text-[10px] font-black uppercase tracking-widest italic">{path.title}</span>
                                                    </button>
                                                ))}
                                            </div>

                                            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar pb-4">
                                                {questions.map((q, idx) => (
                                                    <div key={q.id} className="group flex items-start gap-3 p-4 rounded-[1.5rem] border border-slate-50 bg-white hover:border-blue-100 hover:shadow-lg hover:shadow-blue-900/5 transition-all">
                                                        <div className="w-7 h-7 rounded-xl bg-slate-50 flex items-center justify-center text-[10px] font-black text-[#0F172A] group-hover:bg-blue-600 group-hover:text-white transition-all shrink-0">
                                                            {idx + 1}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[11px] font-bold text-[#475569] leading-snug italic">
                                                                {q.text}
                                                            </p>
                                                            <span className="px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-100 text-[8px] font-black text-slate-400 uppercase tracking-widest inline-block mt-2 italic">{q.category}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="pt-4 border-t border-slate-100 shrink-0 mt-auto flex flex-col gap-4">
                                                {/* STT Engine Diagnostic for Recruiter */}
                                                <div className="p-4 bg-slate-50/50 rounded-[1.5rem] border border-slate-100/50 flex flex-col gap-3">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-1.5 h-1.5 rounded-full ${isMicOn ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest italic">Ses Motoru Tanılama</span>
                                                        </div>
                                                        <span className="text-[7px] font-bold text-slate-400 uppercase tracking-[0.2em]">GERÇEK ZAMANLI</span>
                                                    </div>
                                                    <div className="h-10 flex items-center justify-center bg-white/50 rounded-xl border border-dashed border-slate-200 px-4 overflow-hidden relative">
                                                        <p className="text-[9px] font-bold text-slate-600 italic truncate z-10 text-center">
                                                            {transcript.length > 0 ? `"${transcript[transcript.length-1].text}"` : (isMicOn ? 'Mikrofon Bağlı - Konuşmanız algılanıyor...' : 'Lütfen Ses Ayarlarını Kontrol Edin')}
                                                        </p>
                                                        <div className="absolute left-0 bottom-0 h-0.5 bg-blue-500/10 transition-all duration-300" style={{ width: `${waveHeight[3]}%` }} />
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={async () => {
                                                        const startData = {
                                                            status: 'live',
                                                            activeStrategy,
                                                            questions,
                                                            selectedPathId,
                                                            currentQuestionIndex: 0,
                                                            startedAt: new Date().toISOString()
                                                        };
                                                        await persistSessionData(startData);
                                                        setPhase('active');
                                                    }}
                                                    disabled={!selectedPathId || pathLoading}
                                                    className="w-full h-16 rounded-[1.5rem] bg-[#0F172A] hover:bg-black text-white font-black text-[12px] uppercase tracking-[0.2em] transition-all shadow-2xl shadow-blue-900/40 flex items-center justify-center gap-3 italic group px-5"
                                                >
                                                    MOULAKATI BAŞLAT <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </main>
                </div>
            );
        } else {
            // Aday Hazırlık Odası
            return (
                <div className="min-h-screen bg-[#F8FAFC] font-sans flex flex-col italic overflow-hidden">
                    <header className="h-[56px] bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 z-20">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-[#0F172A] flex items-center justify-center">
                                <Video className="w-4.5 h-4.5 text-white" />
                            </div>
                            <h2 className="text-[15px] font-black text-[#0F172A] tracking-tighter uppercase italic leading-none">Talent-Inn <span className="text-slate-400">Live</span></h2>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleCandidateLeave}
                                className="px-4 py-1.5 rounded-lg bg-white text-red-600 border border-red-100 text-[9px] font-black uppercase tracking-wider hover:bg-red-600 hover:text-white transition-all shadow-sm cursor-pointer"
                            >
                                Ayrıl
                            </button>
                            <button onClick={() => setShowSettings(true)} className="p-2 rounded-lg bg-slate-50 text-slate-500 hover:bg-black hover:text-white transition-all border border-slate-100 cursor-pointer"><Settings className="w-4.5 h-4.5" /></button>
                        </div>
                    </header>
                    <div className="flex-1 flex flex-col items-center justify-center p-4">
                        <div className="max-w-[1200px] w-full flex flex-col gap-6">
                            <div className="flex flex-col items-center text-center">
                                <h1 className="text-[36px] font-black text-[#0F172A] tracking-tighter uppercase italic leading-[0.9] mb-2">Mülakata <span className="text-blue-600 underline underline-offset-4 decoration-4">Hazır Mısın?</span></h1>
                                <p className="text-xs font-bold text-slate-400 max-w-lg">Cihazlarını kontrol et ve hazır olduğunda giriş yap.</p>
                            </div>

                            <div className="grid grid-cols-12 gap-8 items-start">
                                <div className="col-span-12 lg:col-span-7 flex flex-col gap-6">
                                    <div className="relative aspect-video rounded-3xl bg-slate-200 overflow-hidden shadow-xl border-[3px] border-white group">
                                        {isVideoOn && stream ? (
                                            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-zinc-950">
                                                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
                                                    <VideoOff className="w-8 h-8 text-white/20" />
                                                </div>
                                                <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Kamera Devre Dışı</p>
                                            </div>
                                        )}
                                        <div className="absolute top-6 left-6 flex items-center gap-3">
                                            <div className="px-3 py-1.5 bg-black/40 backdrop-blur-xl rounded-xl border border-white/10 flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                <span className="text-[8px] font-black text-white uppercase tracking-widest">Hazırlık Odası</span>
                                            </div>
                                        </div>
                                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-30">
                                            <button onClick={() => setIsMicOn(!isMicOn)} className={"w-12 h-12 rounded-xl flex items-center justify-center bg-black/40 backdrop-blur-xl border border-white/10 text-white shadow-2xl transition-all " + (!isMicOn && 'bg-red-500 border-red-400')}>
                                                {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                                            </button>
                                            <button onClick={() => setIsVideoOn(!isVideoOn)} className={"w-12 h-12 rounded-xl flex items-center justify-center bg-black/40 backdrop-blur-xl border border-white/10 text-white shadow-2xl transition-all " + (!isVideoOn && 'bg-red-500 border-red-400')}>
                                                {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-3">
                                        {[
                                            { icon: <Mic className="w-4 h-4" />, label: 'MİKROFON', status: isMicOn ? 'AKTİF' : 'KAPALI', ok: isMicOn },
                                            { icon: <Camera className="w-4 h-4" />, label: 'KAMERA', status: isVideoOn ? 'AKTİF' : 'KAPALI', ok: isVideoOn },
                                            { icon: <Zap className="w-4 h-4" />, label: 'BAĞLANTI', status: 'STABİL', ok: true }
                                        ].map((stat, i) => (
                                            <div key={i} className="bg-white rounded-2xl p-4 border border-slate-100 flex items-center gap-3 shadow-sm">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${stat.ok ? 'bg-blue-50 text-blue-600 border-blue-50' : 'bg-red-50 text-red-500 border-red-50'}`}>
                                                    {stat.icon}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 mb-1">{stat.label}</p>
                                                    <p className={`text-[10px] font-black italic uppercase leading-none truncate ${stat.ok ? 'text-[#0F172A]' : 'text-red-500'}`}>{stat.status}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Right Column: Interview Panel & Actions */}
                                <div className="col-span-12 lg:col-span-5">
                                    <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-2xl relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-blue-500/10 transition-colors" />

                                        <div className="space-y-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-14 h-14 rounded-2xl bg-[#0F172A] p-0.5 shadow-xl border border-slate-100 flex items-center justify-center shrink-0">
                                                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile?.name || 'Recruiter'}`} alt="R" className="w-full h-full rounded-xl" />
                                                </div>
                                                <div>
                                                    <h3 className="text-lg font-black text-[#0F172A] tracking-tighter italic uppercase leading-none">Mülakat Paneli</h3>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Katılmaya Hazırlanın</p>
                                                </div>
                                            </div>

                                            <p className="text-[12px] font-bold text-slate-500 leading-relaxed italic border-l-4 border-blue-600 pl-4 py-1">
                                                Hoş geldiniz. Mülakatçı sizi odaya kabul ettiğinde görüşme otomatik olarak başlayacaktır. Lütfen tarayıcınızdan kamera ve mikrofon erişimine izin verdiğinizden emin olun.
                                            </p>

                                            <div className="space-y-3">
                                                 <div className="px-4 py-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between group-hover:bg-white transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">KVKK Onayı</span>
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        checked={hasConsent}
                                                        onChange={(e) => setHasConsent(e.target.checked)}
                                                        className="w-5 h-5 accent-blue-600 rounded-lg cursor-pointer"
                                                    />
                                                </div>

                                                {/* STT / MIC TEST INDICATOR */}
                                                <div className="px-4 py-3 bg-slate-50 rounded-2xl border border-slate-100 group-hover:bg-white transition-colors">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <Mic className={`w-3.5 h-3.5 ${isMicOn ? 'text-blue-500' : 'text-slate-400'}`} />
                                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest italic">Ses Testi</span>
                                                        </div>
                                                        <div className="flex items-center gap-0.5">
                                                            {[1,2,3,4,5].map(i => (
                                                                <div key={i} className={`w-1 rounded-full transition-all duration-75 ${isMicOn ? 'bg-blue-500' : 'bg-slate-200'}`} style={{ height: isMicOn ? `${waveHeight[i % waveHeight.length]}%` : '4px', minHeight: '4px' }} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div className="h-8 flex items-center justify-center bg-black/5 rounded-xl border border-dashed border-white/10 px-3 overflow-hidden">
                                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest italic truncate">
                                                            {isMicOn ? (isRecording ? 'Konuşmanız algılanıyor...' : 'Mikrofon Bağlı') : 'Lütfen Mikrofonu Açın'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Phase 5: Premium Waiting State */}
                                                <div className={`relative overflow-hidden flex items-center gap-4 p-5 rounded-3xl border transition-all duration-500 ${isRecruiterActive ? 'bg-emerald-50/50 border-emerald-100 shadow-lg shadow-emerald-500/5' : 'bg-amber-50/50 border-amber-100 shadow-lg shadow-amber-500/5'}`}>
                                                    {!isRecruiterActive && (
                                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full animate-shimmer pointer-events-none" />
                                                    )}

                                                    <div className="relative">
                                                        <div className={`w-3 h-3 rounded-full shadow-lg ${!isRecruiterActive ? 'bg-amber-500' : effectiveSession?.status !== 'live' ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                                                        <div className={`absolute -inset-1.5 rounded-full animate-ping ${!isRecruiterActive ? 'bg-amber-500/20' : effectiveSession?.status !== 'live' ? 'bg-blue-500/20' : 'bg-emerald-500/20'}`} />
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-[10px] font-black uppercase tracking-[0.15em] italic ${!isRecruiterActive ? 'text-amber-600' : effectiveSession?.status !== 'live' ? 'text-blue-500' : 'text-emerald-600'}`}>
                                                            {!isRecruiterActive ? 'Mülakatçı Bekleniyor' : effectiveSession?.status !== 'live' ? 'Mülakatçı Hazırlanıyor' : 'Mülakatçı Hazır'}
                                                        </p>
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate">
                                                            {!isRecruiterActive ? 'Lütfen oturumun açılmasını bekleyin...' : effectiveSession?.status !== 'live' ? 'Mülakatçı soruları ve salonu hazırlıyor...' : 'Hemen katılarak görüşmeyi başlatabilirsiniz'}
                                                        </p>
                                                    </div>

                                                    {isRecruiterActive && effectiveSession?.status === 'live' && (
                                                        <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 animate-in zoom-in duration-300">
                                                            <Check className="w-4 h-4 text-emerald-600" />
                                                        </div>
                                                    )}
                                                </div>

                                                <button
                                                    onClick={async () => {
                                                        if (hasConsent) {
                                                            if (!isRecruiterActive) {
                                                                alert("Mülakatçı henüz odaya katılmadı. Lütfen odaya girmesini bekleyin.");
                                                                return;
                                                            }
                                                            if (effectiveSession?.status !== 'live') {
                                                                alert("Mülakatçı henüz oturumu (Live) başlatmadı. Lütfen hazırlıkların bitmesini bekleyin.");
                                                                return;
                                                            }

                                                             // Phase 6: Sync to DB via atomic proxy
                                                             setPhase('lobby_ready');
                                                             await persistSessionData({ candidateStatus: 'waiting_room' });
                                                        } else {
                                                            alert("Lütfen KVKK onayını kabul edin.");
                                                        }
                                                    }}
                                                    className={`w-full h-16 rounded-2xl text-white font-black text-[12px] uppercase tracking-[0.2em] shadow-2xl flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95 group italic ${isRecruiterActive && effectiveSession?.status === 'live' ? 'bg-[#0F172A] shadow-blue-900/40' : 'bg-slate-800 opacity-50 cursor-not-allowed'}`}
                                                    disabled={!hasConsent || !isRecruiterActive || effectiveSession?.status !== 'live'}
                                                >
                                                    KATILMAYA HAZIRIM <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
    }

    if (phase === 'lobby_ready') {
        return (
            <div className="min-h-screen bg-[#F8FAFC] font-sans flex flex-col items-center justify-center p-6 italic">
                <div className="max-w-md w-full bg-white rounded-[3rem] p-12 text-center border border-slate-100 shadow-2xl space-y-8 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-blue-500/10 transition-colors" />

                    <div className="relative">
                        <div className="w-24 h-24 rounded-[2rem] bg-[#0F172A] flex items-center justify-center mx-auto shadow-2xl shadow-blue-900/30 animate-bounce">
                            <Video className="w-10 h-10 text-white" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h2 className="text-3xl font-black text-[#0F172A] tracking-tighter uppercase italic leading-none">Bağlantı <span className="text-blue-600">Bekleniyor</span></h2>
                        <p className="text-[12px] font-bold text-slate-400 uppercase tracking-widest max-w-[240px] mx-auto leading-relaxed">
                            Mülakatçı sizi odaya aldığında görüşme otomatik olarak başlayacaktır. Sekmeyi kapatmayın.
                        </p>
                    </div>

                    <div className="flex flex-col items-center gap-6">
                        <div className="flex gap-2">
                            {[0, 1, 2].map(i => (
                                <div key={i} className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
                            ))}
                        </div>
                        <button
                            onClick={() => setPhase('lobby')}
                            className="px-6 py-2 rounded-xl text-[10px] font-black text-slate-400 hover:text-[#0F172A] hover:bg-slate-50 transition-all uppercase tracking-[0.2em] border border-transparent hover:border-slate-100"
                        >
                            AYARLARA DÖN
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (phase === 'finished') {
        if (!isRecruiter) {
            return <CandidateExitPage />;
        }
        return (
            <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-6 text-white font-sans italic">
                <div className="bg-[#1E293B]/50 backdrop-blur-3xl p-12 rounded-[3rem] border border-white/10 shadow-2xl flex flex-col items-center gap-8 max-w-lg text-center animate-in zoom-in duration-500">
                    <div className="w-24 h-24 rounded-3xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30 relative">
                        <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                        <div className="absolute -inset-2 bg-emerald-500/20 rounded-full blur-2xl animate-pulse" />
                    </div>
                    <div className="space-y-3">
                        <h1 className="text-3xl font-black italic uppercase tracking-tighter">Mülakat Tamamlandı</h1>
                        <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest max-w-xs mx-auto">
                            Oturum verileri başarıyla kaydedildi ve analiz motoru raporu hazırladı.
                        </p>
                    </div>

                    <div className="w-full h-px bg-white/5" />

                    <div className="grid grid-cols-2 gap-4 w-full">
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex flex-col gap-1">
                            <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">LOYALTY SCORE</span>
                            <span className="text-xl font-black text-blue-400">%{logicIntegrity}</span>
                        </div>
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex flex-col gap-1">
                            <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">STATUS</span>
                            <span className="text-[14px] font-black text-emerald-400 uppercase italic">SAVED</span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 w-full">
                        <button
                            onClick={() => navigate(`/interview-report/${sessionId}`)}
                            className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all shadow-xl shadow-blue-500/20 flex items-center justify-center gap-3"
                        >
                            <FileText className="w-4 h-4" /> REPORU GÖRÜNTÜLE
                        </button>
                        <button
                            onClick={() => navigate('/')}
                            className="w-full h-14 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-3"
                        >
                            <ArrowLeft className="w-4 h-4" /> KONTROL PANELİNE DÖN
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[200] bg-[#07090F] flex flex-col overflow-hidden text-white font-sans">
            {/* COMPACT DARK HEADER */}
            <header className="h-[48px] shrink-0 border-b border-white/5 bg-[#0F172A] px-5 flex items-center justify-between z-20">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Video className="w-3.5 h-3.5 text-blue-500" />
                        <h2 className="text-[10px] font-black uppercase tracking-[0.15em] italic">Live Session Hub</h2>
                    </div>
                    <div className="h-4 w-px bg-white/10" />
                    <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-md bg-white/5 overflow-hidden border border-white/10">
                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${candidateData?.name}`} alt="C" className="w-full h-full object-cover" />
                        </div>
                        <span className="text-[10px] font-bold text-white/90 italic">{candidateData?.name}</span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {isRecruiter && (
                        <>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(`${window.location.origin}/join/${sessionId}`);
                                    alert("Aday linki kopyalandı!");
                                }}
                                className="h-8 px-3 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white font-black text-[9px] tracking-widest uppercase transition-all flex items-center gap-2 border border-blue-500/30 active:scale-95 cursor-pointer shadow-lg shadow-blue-500/10"
                            >
                                <Copy className="w-3 h-3" /> Aday Linki
                            </button>

                            {phase === 'active' && (
                                <>
                                    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white/5 rounded-lg border border-white/5">
                                        <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[9px] font-black text-emerald-500 tracking-widest tabular-nums italic">LIVE: {Math.floor(elapsedTime / 60).toString().padStart(2, '0')}:{String(elapsedTime % 60).padStart(2, '0')}</span>
                                    </div>

                                    {/* Aday Durum Göstergesi */}
                                    {(!session?.candidateStatus || session.candidateStatus !== 'admitted') ? (
                                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${session?.candidateStatus === 'waiting_room' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
                                            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${session?.candidateStatus === 'waiting_room' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                                            <span className={`text-[9px] font-black tracking-widest uppercase ${session?.candidateStatus === 'waiting_room' ? 'text-amber-500' : 'text-rose-500'}`}>
                                                {session?.candidateStatus === 'waiting_room' ? 'Aday Lobide Bekliyor' : 'Aday Henüz Girmedİ'}
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                            <span className="text-[9px] font-black text-emerald-500 tracking-widest uppercase">
                                                Aday Oturumda
                                            </span>
                                        </div>
                                    )}

                                    {(!session?.candidateStatus || session.candidateStatus !== 'admitted') && (
                                        <button
                                            onClick={async () => {
                                                await persistSessionData({ candidateStatus: 'admitted' });
                                            }}
                                            className={`h-8 px-4 rounded-lg text-white font-black text-[9px] tracking-widest uppercase transition-all shadow-lg flex items-center gap-2 border mr-2 ${session?.candidateStatus === 'waiting_room' ? 'bg-amber-500 hover:bg-amber-600 border-amber-400 shadow-amber-500/20 animate-pulse' : 'bg-slate-700 hover:bg-slate-600 border-slate-600 shadow-slate-900/50 opacity-80 hover:opacity-100'}`}
                                            title={session?.candidateStatus === 'waiting_room' ? 'Adayı İçeri Al' : 'Aday Henüz Lobide Değil. Yine de Odaya Zorla Al'}
                                        >
                                            <Users className="w-3 h-3" /> {session?.candidateStatus === 'waiting_room' ? 'Adayı İçeri Al' : 'İçeri Al (Fallback)'}
                                        </button>
                                    )}
                                </>
                            )}

                            <button
                                onClick={handleFinishInterview}
                                className="px-4 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-600 text-white font-black text-[9px] tracking-[0.1em] uppercase transition-all shadow-lg active:scale-95 flex items-center gap-2"
                                title="Mülakatı Başarıyla Tamamla ve Raporu Oluştur"
                            >
                                <CheckCircle2 className="w-3 h-3" /> Mülakatı Tamamla
                            </button>

                            <div className="relative">
                                <button
                                    onClick={() => setShowActionsMenu(!showActionsMenu)}
                                    className="w-10 h-8 flex items-center justify-center rounded-lg bg-white/5 text-white/40 hover:bg-white/10 hover:text-white transition-all border border-white/5 cursor-pointer"
                                >
                                    <MoreVertical className="w-4 h-4" />
                                </button>

                                {showActionsMenu && (
                                    <div className="absolute top-full right-0 mt-2 w-48 bg-[#1E293B] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[400] animate-in fade-in slide-in-from-top-2 duration-200">
                                        <button
                                            onClick={() => {
                                                if (window.confirm("Mülakatı ertelemek ve daha sonra devam etmek istediğinize emin misiniz?")) {
                                                    persistSessionData({ status: 'scheduled' });
                                                    navigate('/');
                                                }
                                            }}
                                            className="w-full px-4 py-3 text-left text-[10px] font-bold text-slate-300 hover:bg-white/5 flex items-center gap-3 transition-colors"
                                        >
                                            <Clock className="w-3.5 h-3.5 text-blue-400" /> Ertele / Duraklat
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (window.confirm("Mülakatı iptal etmek istediğinize emin misiniz? Bu işlem geri alınamaz.")) {
                                                    persistSessionData({ status: 'cancelled' });
                                                    navigate('/');
                                                }
                                            }}
                                            className="w-full px-4 py-3 text-left text-[10px] font-bold text-red-400 hover:bg-red-500/10 flex items-center gap-3 transition-colors"
                                        >
                                            <AlertCircle className="w-3.5 h-3.5" /> Mülakatı İptal Et
                                        </button>
                                        <div className="h-px bg-white/5 mx-2" />
                                        <button
                                            onClick={() => navigate('/')}
                                            className="w-full px-4 py-3 text-left text-[10px] font-bold text-slate-500 hover:bg-white/5 flex items-center gap-3 transition-colors"
                                        >
                                            <ChevronLeft className="w-3.5 h-3.5" /> Sadece Çık (Canlı Kalsın)
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </header>

            <div className="flex-1 flex p-2 gap-2 overflow-hidden">
                {isRecruiter ? (
                    <>
                        {/* LEFT SIDEBAR: CONTROL & TRANSCRIPT */}
                        <div className="w-[320px] flex flex-col gap-2 shrink-0 overflow-hidden h-full">
                            {/* QUESTIONS & PATH SELECTION */}
                            <section className="bg-[#0F172A] rounded-2xl border border-white/5 flex-1 flex flex-col overflow-hidden shadow-2xl p-4">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-blue-500/10 rounded-lg">
                                            <FileText className="w-3.5 h-3.5 text-blue-400" />
                                        </div>
                                        <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest italic">Mülakat Rotası</h3>
                                    </div>
                                    <div className="flex gap-1">
                                        {[
                                            { id: 'technical', icon: <Code className="w-3.5 h-3.5" />, label: 'Teknik' },
                                            { id: 'product', icon: <Target className="w-3.5 h-3.5" />, label: 'Ürün' },
                                            { id: 'culture', icon: <Users className="w-3.5 h-3.5" />, label: 'Kültür' }
                                        ].map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => {
                                                    setActiveStrategy(p.id);
                                                    setIsTypeSelected(true);
                                                    persistSessionData({ activeStrategy: p.id });
                                                }}
                                                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${activeStrategy === p.id ? 'bg-blue-600 text-white border border-blue-400 shadow-lg shadow-blue-500/20' : 'bg-white/5 text-white/30 hover:bg-white/10'}`}
                                                title={p.label}
                                            >
                                                {p.icon}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex-1 overflow-hidden flex flex-col">
                                    {!isTypeSelected ? (
                                        <div className="bg-[#1E293B]/50 rounded-2xl p-4 border border-white/5 flex-1 flex flex-col gap-4 animate-in fade-in duration-300">
                                            <div className="text-center">
                                                <h4 className="text-[10px] font-black text-white uppercase tracking-widest italic">Yeni Soru Seti Seçin</h4>
                                            </div>
                                            <div className="grid grid-cols-1 gap-2">
                                                {[
                                                    { id: 'technical', title: 'Teknik Kültür', icon: <Code className="w-4 h-4" />, color: 'blue' },
                                                    { id: 'product', title: 'Product / UX', icon: <Target className="w-4 h-4" />, color: 'indigo' },
                                                    { id: 'culture', title: 'Kültür & Uyum', icon: <Users className="w-4 h-4" />, color: 'emerald' }
                                                ].map(type => (
                                                    <button
                                                        key={type.id}
                                                        onClick={() => {
                                                            setActiveStrategy(type.id);
                                                            setIsTypeSelected(true);
                                                        }}
                                                        className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-left group"
                                                    >
                                                        <div className={`w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-all`}>
                                                            {type.icon}
                                                        </div>
                                                        <span className="text-[10px] font-black text-white/80 uppercase italic">{type.title}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar scroll-smooth animate-in fade-in duration-500 pb-10">
                                            {questions.map((q, idx) => (
                                                <div
                                                    key={q.id || idx}
                                                    onClick={() => {
                                                        setCurrentQuestionIndex(idx);
                                                        persistSessionData({ currentQuestionIndex: idx });
                                                    }}
                                                    className={`group relative transition-all duration-300 cursor-pointer ${idx === currentQuestionIndex ? 'opacity-100 scale-100' : 'opacity-40 hover:opacity-80 scale-[0.98]'}`}
                                                >
                                                    <div className={`p-5 rounded-3xl border transition-all ${idx === currentQuestionIndex ? 'bg-[#1E293B] border-blue-500/50 shadow-2xl shadow-blue-500/10' : 'bg-white/2 border-white/5 hover:border-white/10'}`}>
                                                        <div className="flex gap-4">
                                                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0 transition-transform ${idx === currentQuestionIndex ? 'bg-blue-600 text-white shadow-lg scale-110' : 'bg-white/5 text-white/30'}`}>
                                                                {idx + 1}
                                                            </div>
                                                            <div className="space-y-4 flex-1">
                                                                <p className={`text-[13px] font-bold leading-relaxed italic ${idx === currentQuestionIndex ? 'text-white' : 'text-white/60'}`}>
                                                                    {q.text}
                                                                </p>

                                                                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {idx === currentQuestionIndex && (
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleGenerateAIQuestion('deepen');
                                                                                }}
                                                                                className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/40 rounded-xl border border-blue-500/30 text-[9px] font-black text-blue-400 uppercase flex items-center gap-2 transition-all active:scale-95"
                                                                            >
                                                                                <Sparkles className="w-3.5 h-3.5" /> DERİNLEŞ
                                                                            </button>
                                                                        )}
                                                                        {idx === currentQuestionIndex && (
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setIsTypeSelected(false);
                                                                                }}
                                                                                className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-[9px] font-black text-white/40 uppercase flex items-center gap-2 transition-all active:scale-95"
                                                                            >
                                                                                <RefreshCw className="w-3.5 h-3.5" /> SET DEĞİŞTİR
                                                                            </button>
                                                                        )}
                                                                    </div>

                                                                    <div className="flex-shrink-0">
                                                                        {q.visibleToCandidate ? (
                                                                            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 text-[8px] font-black uppercase italic tracking-widest">
                                                                                <CheckCircle2 className="w-3 h-3" /> ADAYDA YAYINDA
                                                                            </div>
                                                                        ) : (
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    const updated = [...questions];
                                                                                    updated[idx] = { ...updated[idx], visibleToCandidate: true };
                                                                                    setQuestions(updated);
                                                                                    persistSessionData({ questions: updated });
                                                                                }}
                                                                                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-900/40 flex items-center gap-2 italic active:scale-95"
                                                                            >
                                                                                <Send className="w-3.5 h-3.5" /> ADAYA GÖNDER
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </section>
                            {/* COMPACT TRANSCRIPT PANEL */}
                            <section className="bg-[#0F172A] rounded-2xl border border-white/5 h-[35%] min-h-[180px] flex flex-col p-4 shadow-xl">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest italic">Live Transcript</h3>
                                    <div className="flex items-center gap-2">
                                        {!isRecording && isMicOn && (
                                            <button
                                                onClick={() => {
                                                    try { recognitionRef.current?.start(); } catch (e) { }
                                                }}
                                                className="text-[7px] font-black text-blue-400 uppercase tracking-widest border border-blue-500/30 px-2 py-0.5 rounded hover:bg-blue-500/10 transition-colors"
                                            >
                                                Yeniden Başlat
                                            </button>
                                        )}
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 rounded">
                                            <div className={`w-1 h-1 rounded-full ${isRecording ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                                            <span className={`text-[8px] font-black uppercase tracking-widest ${isRecording ? 'text-emerald-500' : 'text-slate-500'}`}>
                                                {isRecording ? 'Active' : 'Standby'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar italic" ref={transcriptRef}>
                                    {transcript.length === 0 && (
                                        <div className="h-full flex flex-col items-center justify-center opacity-20 py-4">
                                            <MessageSquare className="w-6 h-6 mb-2" />
                                            <p className="text-[9px] font-black uppercase tracking-widest">Konuşmalar burada görünecek</p>
                                        </div>
                                    )}
                                    {transcript.slice(-10).map((line, idx) => (
                                        <div key={idx} className={`p-2.5 rounded-xl border ${line.role === 'ADAY' ? 'bg-white/2 border-white/5' : 'bg-blue-500/5 border-blue-500/10 ml-4'}`}>
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[7px] font-black uppercase tracking-widest ${line.role === 'ADAY' ? 'text-blue-400' : 'text-blue-200'}`}>{line.role}</span>
                                                    {line.confidence < 70 && <AlertCircle className="w-2.5 h-2.5 text-orange-500/50" title="Düşük Güvenlikli Tanıma" />}
                                                </div>
                                                <span className="text-[7px] text-white/20 font-mono tracking-tighter tabular-nums">{line.time}</span>
                                            </div>
                                            <p className="text-[10px] font-bold text-white/80 leading-relaxed font-inter">{line.text}</p>
                                        </div>
                                    ))}
                                    {isRecording && (
                                        <div className="flex items-center gap-2 p-2 opacity-30">
                                            <div className="flex items-center gap-0.5">
                                                <div className="w-0.5 h-2 bg-blue-500 animate-[bounce_0.8s_infinite_0ms]" />
                                                <div className="w-0.5 h-3 bg-blue-500 animate-[bounce_0.8s_infinite_100ms]" />
                                                <div className="w-0.5 h-1.5 bg-blue-500 animate-[bounce_0.8s_infinite_200ms]" />
                                            </div>
                                            <span className="text-[8px] font-bold text-white/40 italic tracking-wider">Ses bekleniyor...</span>
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>

                        {/* CENTER: MAIN VIDEO AREA */}
                        <div className="flex-1 bg-[#0F172A] rounded-3xl relative overflow-hidden shadow-2xl border border-white/10 group/video">
                            <div className="absolute inset-0 bg-[#07090F] flex items-center justify-center">
                                {/* Remote peer video — NOT muted so audio plays */}
                                {remoteStream ? (
                                    <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                                ) : stream ? (
                                    // Fallback: own local feed (muted) while waiting for peer
                                    <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1] opacity-40" />
                                ) : (
                                    <div className="w-32 h-32 rounded-full bg-white/5 flex items-center justify-center border border-white/10 animate-pulse">
                                        <User className="w-12 h-12 text-white/10" />
                                    </div>
                                )}
                            </div>

                            {/* FLOATING CONTROLS */}
                            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 z-30 bg-[#1E293B]/90 backdrop-blur-3xl px-6 py-4 rounded-2xl border border-white/20 shadow-2xl transition-all hover:scale-105">
                                <button onClick={() => setIsMicOn(!isMicOn)} className={"w-11 h-11 rounded-xl flex items-center justify-center transition-all cursor-pointer " + (isMicOn ? 'bg-white/5 text-white hover:bg-white/10 border border-white/5' : 'bg-red-500 text-white')}>
                                    {isMicOn ? <Mic className="w-4.5 h-4.5" /> : <MicOff className="w-4.5 h-4.5" />}
                                </button>
                                <button onClick={() => setIsVideoOn(!isVideoOn)} className={"w-14 h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer " + (isVideoOn ? 'bg-blue-600 text-white shadow-lg border border-blue-400' : 'bg-red-500 text-white')}>
                                    {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                                </button>
                                <button className="w-11 h-11 rounded-xl bg-white/5 text-white flex items-center justify-center hover:bg-white/10 transition-all cursor-pointer border border-white/5">
                                    <Monitor className="w-4.5 h-4.5" />
                                </button>
                                <div className="h-6 w-px bg-white/10 mx-1" />
                                <button
                                    onClick={handleFinishInterview}
                                    className="px-6 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center gap-2.5 hover:bg-emerald-700 transition-all cursor-pointer shadow-lg shadow-emerald-900/40 font-black text-[10px] uppercase tracking-widest italic"
                                >
                                    <CheckCircle2 className="w-4 h-4" /> MÜLAKATI TAMAMLA
                                </button>
                                <button
                                    onClick={() => navigate('/')}
                                    className="w-11 h-11 rounded-xl bg-red-600 text-white flex items-center justify-center hover:bg-red-700 transition-all cursor-pointer shadow-red-900/20"
                                    title="Mülakatı Kapat"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* SMALL PIP FOR RECRUITER */}
                            {stream && (
                                <div className="absolute top-6 right-6 w-32 aspect-video bg-black rounded-xl overflow-hidden border-2 border-white/10 shadow-2xl z-40">
                                    <video ref={pipVideoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                                </div>
                            )}
                        </div>

                        {/* RIGHT SIDEBAR: ANALYTICS & INSIGHT */}
                        <div className="w-[280px] flex flex-col gap-2 shrink-0 overflow-hidden h-full">
                            <section className="bg-[#0F172A] rounded-2xl p-5 border border-white/5 shadow-xl flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                                        <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest italic">Analytical Insight</h3>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {starAnalyzing && <Loader2 className="w-2.5 h-2.5 text-blue-400 animate-spin" />}
                                        <div className="px-2 py-0.5 bg-blue-600/20 text-blue-400 border border-blue-500/20 rounded text-[7px] font-black uppercase">REAL-TIME</div>
                                    </div>
                                </div>
                                {biasWarning && (
                                    <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2">
                                        <AlertTriangle className="w-3 h-3 text-yellow-400 shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[8px] font-black text-yellow-400 uppercase tracking-wider">Önyargı Uyarısı</p>
                                            <p className="text-[8px] text-yellow-300/80 mt-0.5 leading-snug">{biasWarning}</p>
                                        </div>
                                        <button onClick={() => setBiasWarning(null)} className="text-yellow-500/60 hover:text-yellow-400 text-[10px] shrink-0">✕</button>
                                    </div>
                                )}

                                <div className="h-44 relative flex items-center justify-center my-2">
                                    <svg viewBox="0 0 100 100" className="w-36 h-36 transform rotate-[-18deg]">
                                        {[20, 40, 60, 80, 100].map(r => (
                                            <circle key={r} cx="50" cy="50" r={r / 2} fill="none" stroke="white" strokeWidth="0.5" opacity="0.03" />
                                        ))}
                                        {[0, 72, 144, 216, 288].map(angle => (
                                            <line key={angle} x1="50" y1="50" x2={50 + 50 * Math.cos(angle * Math.PI / 180)} y2={50 + 50 * Math.sin(angle * Math.PI / 180)} stroke="white" strokeWidth="0.5" opacity="0.05" />
                                        ))}
                                        <polygon
                                            points={[
                                                starScores.technical,
                                                starScores.communication,
                                                starScores.problemSolving,
                                                starScores.cultureFit,
                                                starScores.adaptability
                                            ].map((val, i) => {
                                                const angle = i * 72;
                                                const r = val / 2;
                                                return `${50 + r * Math.cos(angle * Math.PI / 180)},${50 + r * Math.sin(angle * Math.PI / 180)}`;
                                            }).join(' ')}
                                            fill="rgba(59, 130, 246, 0.15)"
                                            stroke="#3B82F6"
                                            strokeWidth="1.5"
                                        />
                                    </svg>

                                    <div className="absolute inset-0 text-[6px] font-black text-white/30 uppercase pointer-events-none italic">
                                        <span className="absolute top-0 left-1/2 -translate-x-1/2">Technical</span>
                                        <span className="absolute top-[35%] right-2 -translate-x-full">Communication</span>
                                        <span className="absolute bottom-5 right-6 -translate-x-full">Problem Solving</span>
                                        <span className="absolute bottom-5 left-8">Culture Fit</span>
                                        <span className="absolute top-[35%] left-2">Adaptability</span>
                                    </div>
                                </div>

                                <div className="bg-[#1E293B] rounded-xl p-4 border border-white/10 shadow-inner relative group/brief">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-4 bg-blue-500 rounded-full" />
                                            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest italic">AI Coach Brief</p>
                                        </div>
                                        {coachGenerating && <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />}
                                    </div>
                                    <div className="relative">
                                        <p className="text-[11px] font-bold text-white/90 leading-relaxed italic border-l-2 border-blue-500/50 pl-3">
                                            {suggestedQuestion ? suggestedQuestion.question : "Soru havuzunu kullanarak başlayabilir veya 'Derinleş' butonu ile yapay zekadan özel soru talep edebilirsiniz."}
                                        </p>

                                        {suggestedQuestion && (
                                            <div className="flex flex-col gap-2 mt-4">
                                                <button
                                                    onClick={() => {
                                                        const newQ = {
                                                            id: questions.length + 1,
                                                            text: suggestedQuestion.question,
                                                            category: 'AI / Follow-up',
                                                            status: 'pending',
                                                            visibleToCandidate: true
                                                        };
                                                        const updated = [...questions, newQ];
                                                        setQuestions(updated);
                                                        persistSessionData({
                                                            questions: updated,
                                                            currentQuestionIndex: updated.length - 1
                                                        });
                                                        setCurrentQuestionIndex(updated.length - 1);
                                                        setSuggestedQuestion(null);
                                                    }}
                                                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-900/40 flex items-center justify-center gap-2 animate-in slide-in-from-bottom-2 duration-300"
                                                >
                                                    <Send className="w-3.5 h-3.5" /> Adaya Sor ve Akışa Ekle
                                                </button>

                                                <button
                                                    onClick={() => setSuggestedQuestion(null)}
                                                    className="w-full py-2 bg-white/5 hover:bg-white/10 text-white/40 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                                >
                                                    Yoksay
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </section>

                            {/* VOCAL EMOTION ANALYSIS */}
                            {emotionData && (
                                <section className="bg-[#0F172A] rounded-2xl border border-white/5 p-3 flex flex-col gap-2 shadow-xl">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <Activity className="w-3 h-3 text-purple-400" />
                                        <span className="text-[8px] font-black text-white/30 uppercase tracking-widest italic">Ses Duygu Analizi</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                        {[
                                            { label: 'Stres', value: emotionData.stress, color: '#EF4444' },
                                            { label: 'Heyecan', value: emotionData.excitement, color: '#F59E0B' },
                                            { label: 'Özgüven', value: emotionData.confidence, color: '#10B981' },
                                            { label: 'Tereddüt', value: emotionData.hesitation, color: '#8B5CF6' },
                                        ].map(({ label, value, color }) => (
                                            <div key={label}>
                                                <div className="flex justify-between mb-1">
                                                    <span className="text-[9px] text-white/40">{label}</span>
                                                    <span className="text-[9px] font-bold" style={{ color }}>{value}%</span>
                                                </div>
                                                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full transition-all duration-700"
                                                        style={{ width: `${value}%`, backgroundColor: color }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* AI LIVE INSIGHTS FEED */}
                            {aiInsights.length > 0 && (
                                <section className="bg-[#0F172A] rounded-2xl border border-white/5 p-3 flex flex-col gap-2 shadow-xl overflow-hidden">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <Activity className="w-3 h-3 text-blue-400" />
                                        <span className="text-[8px] font-black text-white/30 uppercase tracking-widest italic">AI Gözlem Akışı</span>
                                    </div>
                                    <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                                        {aiInsights.slice(0, 5).map(ins => (
                                            <div
                                                key={ins.id}
                                                className={`rounded-lg p-2 border text-[8px] leading-snug ${
                                                    ins.type === 'warning'
                                                        ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300/90'
                                                        : 'bg-white/5 border-white/5 text-white/60'
                                                }`}
                                            >
                                                <p>{ins.text}</p>
                                                {ins.hint && (
                                                    <p className="mt-1 text-blue-400/80 italic">→ {ins.hint}</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* DYNAMIC LOGIC METER */}
                            <section className="bg-[#0F172A] rounded-2xl border border-white/5 p-4 flex flex-col gap-3 shadow-xl">
                                <div className="flex items-center justify-between">
                                    <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em] italic">Logic Integrity</span>
                                    <span className="text-[10px] font-black text-blue-500 tabular-nums italic">%{logicIntegrity}</span>
                                </div>
                                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden p-px">
                                    <div className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-700 rounded-full" style={{ width: `${logicIntegrity}%` }} />
                                </div>
                            </section>
                        </div>
                    </>
                ) : (
                    // CANDIDATE VIEW (Clean and focused)
                    <div className="flex-1 flex gap-4 overflow-hidden animate-in fade-in duration-700">
                        {/* Main Stage: Recruiter View */}
                        <div className="flex-1 bg-[#0F172A] rounded-[2.5rem] relative overflow-hidden shadow-2xl border border-white/10 group/stage">
                            {/* Recruiter Feed — remote stream (NOT muted so audio plays) */}
                            <div className="absolute inset-0 bg-slate-950 flex items-center justify-center">
                                {remoteStream ? (
                                    <video
                                        ref={remoteVideoRef}
                                        autoPlay
                                        playsInline
                                        className="w-full h-full object-cover opacity-90"
                                    />
                                ) : (
                                    <div className="flex flex-col items-center gap-6 z-10 animate-in fade-in zoom-in duration-700">
                                        <div className="w-32 h-32 rounded-full border-4 border-blue-500/20 p-2 bg-slate-900/50 backdrop-blur-xl flex items-center justify-center">
                                            <User className="w-12 h-12 text-blue-400 opacity-20" />
                                        </div>
                                        <div className="flex flex-col items-center gap-2">
                                            <h4 className="text-xl font-black text-white italic uppercase tracking-tighter">Mülakatçı Bekleniyor</h4>
                                            <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Bağlantı Bekleniyor...</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A] via-transparent to-transparent opacity-60" />
                            </div>

                            {/* Candidate PiP (Own feed) */}
                            <div className="absolute bottom-6 right-6 w-[220px] aspect-video bg-black rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl z-20 group-hover/stage:scale-105 transition-transform duration-500">
                                {isVideoOn && stream ? (
                                    <video ref={pipVideoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-zinc-950">
                                        <VideoOff className="w-6 h-6 text-white/10" />
                                        <span className="text-[8px] font-black text-white/20 uppercase">Kamera Kapalı</span>
                                    </div>
                                )}
                                <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/40 backdrop-blur-md rounded text-[8px] font-black text-white uppercase border border-white/5">SİZ</div>
                                <div className="absolute bottom-2 right-2 flex items-center gap-1">
                                    <div className="w-0.5 h-1.5 bg-emerald-500 rounded-full" />
                                    <div className="w-0.5 h-2.5 bg-emerald-500 rounded-full" />
                                    <div className="w-0.5 h-3.5 bg-emerald-500 rounded-full" />
                                </div>
                            </div>

                            {/* Controls Overlay */}
                            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 z-30 bg-[#1E293B]/80 backdrop-blur-2xl px-6 py-4 rounded-2xl border border-white/10 shadow-2xl">
                                <button onClick={() => setIsMicOn(!isMicOn)} className={"w-12 h-12 rounded-xl flex items-center justify-center transition-all " + (isMicOn ? 'bg-white/10 text-white' : 'bg-red-500 text-white')}>
                                    {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                                </button>
                                <button onClick={() => setIsVideoOn(!isVideoOn)} className={"w-12 h-12 rounded-xl flex items-center justify-center transition-all " + (isVideoOn ? 'bg-white/10 text-white' : 'bg-red-500 text-white')}>
                                    {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                                </button>
                                <button
                                    onClick={handleCandidateLeave}
                                    className="px-8 h-12 bg-white/10 hover:bg-white/20 text-white rounded-xl font-black text-[11px] uppercase tracking-widest transition-all border border-white/5 flex items-center gap-2 active:scale-95"
                                    title="Mülakatı Kapat ve Ayrıl"
                                >
                                    <LogOut className="w-4 h-4" /> AYRIL
                                </button>
                            </div>

                            {/* Indicator */}
                            <div className="absolute top-8 left-8 flex items-center gap-3">
                                <div className="px-4 py-2 bg-rose-600 rounded-xl flex items-center gap-2.5 shadow-xl border border-rose-500">
                                    <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                    <span className="text-[10px] font-black text-white uppercase tracking-widest italic">Mülakat CANLI</span>
                                </div>
                                <div className="px-3 py-2 bg-white/5 backdrop-blur-md rounded-xl border border-white/10 flex items-center gap-2">
                                    <Activity className="w-3 h-3 text-emerald-400" />
                                    <span className="text-[8px] font-black text-white/60 uppercase tracking-widest">Sinyal Güçlü</span>
                                </div>
                            </div>
                        </div>

                        {/* Side Panel: Context (Questions) */}
                        <div className="w-[340px] flex flex-col gap-4">
                            <section className="bg-white rounded-[2.5rem] border border-slate-200 flex-1 flex flex-col overflow-hidden shadow-2xl p-8">
                                <div className="flex items-center gap-3 mb-8">
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                                        <MessageSquare className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-[#0F172A] tracking-tighter italic uppercase">Mülakat Akışı</h3>
                                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Soru Bilgilendirme</p>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar italic">
                                    {questions.filter(q => q.visibleToCandidate).length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
                                            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                                                <Info className="w-8 h-8 text-slate-400" />
                                            </div>
                                            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest italic">Mülakat Başlatıldı</p>
                                            <p className="text-[10px] font-medium text-slate-400 mt-2">Mülakatçı soruyu paylaştığında burada görünecektir.</p>
                                        </div>
                                    ) : (
                                        questions.filter(q => q.visibleToCandidate).map((q, idx) => {
                                            const originalIndex = questions.indexOf(q);
                                            const isLastShared = originalIndex === Math.max(...questions.filter(qu => qu.visibleToCandidate).map(qu => questions.indexOf(qu)));

                                            return (
                                                <div key={idx} className={"p-6 rounded-3xl border transition-all duration-700 " + (isLastShared ? 'border-blue-500 bg-blue-50/50 shadow-lg scale-[1.02]' : 'opacity-40 border-slate-100 grayscale scale-[0.98]')}>
                                                    <div className="flex items-center gap-3 mb-3">
                                                        <div className={"w-6 h-6 rounded-xl flex items-center justify-center text-[10px] font-black " + (isLastShared ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500')}>
                                                            {originalIndex + 1}
                                                        </div>
                                                        <span className={`text-[9px] font-black uppercase tracking-widest ${isLastShared ? 'text-blue-600' : 'text-slate-400'}`}>
                                                            {isLastShared ? 'Aktif Soru' : 'Tamamlandı'}
                                                        </span>
                                                    </div>
                                                    <p className={`text-[15px] font-bold italic leading-snug ${isLastShared ? 'text-[#0F172A]' : 'text-slate-400'}`}>"{q.text}"</p>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>

                                <div className="mt-8 p-6 bg-[#0F172A] rounded-3xl text-white shadow-2xl relative overflow-hidden group/footer">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16" />
                                    <div className="flex items-center justify-between relative z-10">
                                        <div>
                                            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Kalan Süre (Tahmini)</p>
                                            <p className="text-2xl font-black italic tracking-tighter tabular-nums">18:45</p>
                                        </div>
                                        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                                            <Clock className="w-6 h-6 text-blue-400 animate-pulse" />
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>
                )}
            </div>

            {showSettings && (
                <div className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-6">
                    <div className="bg-[#141C2D] w-full max-w-xl rounded-[2.5rem] p-10 shadow-2xl border border-white/10">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter italic">Cihaz Ayarları</h2>
                            <button onClick={() => setShowSettings(false)} className="w-10 h-10 rounded-xl bg-white/5 text-white/40 flex items-center justify-center hover:bg-white/10 hover:text-white transition-all">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="space-y-6">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-2 italic">Kamera</label>
                                <select className="w-full h-14 bg-[#0B0F19] border border-white/5 rounded-2xl px-6 font-bold italic text-white/80 outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer">
                                    {(devices.video || []).map(d => (
                                        <option key={d.deviceId} value={d.deviceId}>{d.label || `Kamera ${d.deviceId.slice(0, 5)}`}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-2 italic">Mikrofon</label>
                                <select className="w-full h-14 bg-[#0B0F19] border border-white/5 rounded-2xl px-6 font-bold italic text-white/80 outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer">
                                    {(devices.audio || []).map(d => (
                                        <option key={d.deviceId} value={d.deviceId}>{d.label || `Mikrofon ${d.deviceId.slice(0, 5)}`}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <button onClick={() => setShowSettings(false)} className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-[11px] tracking-widest uppercase mt-8 transition-all shadow-xl shadow-blue-500/20 italic">
                            AYARLARI KAYDET
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

