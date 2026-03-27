// src/pages/ApplyPage.jsx — Public job application page (no auth required)
import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, getDocs, query, where, updateDoc, serverTimestamp, onSnapshot, orderBy } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../config/firebase';
import { extractTextFromFile } from '../services/cvParser';
import { parseCandidateFromText, analyzeCandidateMatch } from '../services/geminiService';
import { calculateMatchScore } from '../services/matchService';
import { detectSource } from '../services/applicationService';
import {
    Briefcase, Upload, CheckCircle2, Loader2, AlertCircle,
    User, Mail, Phone, Linkedin, FileText, Building2, X,
    ChevronRight, Shield, Globe, Layers, Link2, Share2, Users, Zap, Search as SearchIcon,
    ChevronDown
} from 'lucide-react';

const SOURCES_PATH = 'artifacts/talent-flow/public/data/sources';

const SOURCE_ICONS = {
    Globe, Layers, Link2, Share2, Users, Zap, Search: SearchIcon,
};

const POSITIONS_COLLECTION = 'artifacts/talent-flow/public/data/positions';
const APPLICATIONS_COLLECTION = 'artifacts/talent-flow/public/data/applications';
const CANDIDATES_COLLECTION = 'artifacts/talent-flow/public/data/candidates';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function InputField({ label, icon: Icon, required, autoFilled, ...props }) {
    return (
        <div>
            <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                {label} {required && <span className="text-indigo-500">*</span>}
                {autoFilled && (
                    <span className="ml-1 inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">
                        <CheckCircle2 size={8} /> CV'den
                    </span>
                )}
            </label>
            <div className="relative">
                <div className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${autoFilled ? 'text-emerald-400' : 'text-slate-300'}`}>
                    <Icon size={15} />
                </div>
                <input
                    {...props}
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border text-slate-800 text-sm font-semibold placeholder-slate-300 focus:outline-none focus:ring-2 transition-all bg-white
                        ${autoFilled
                            ? 'border-emerald-200 focus:ring-emerald-400/30 focus:border-emerald-400 bg-emerald-50/30'
                            : 'border-slate-200 focus:ring-indigo-400/30 focus:border-indigo-400'
                        }`}
                />
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────
export default function ApplyPage() {
    const { positionId } = useParams();
    const [searchParams] = useSearchParams();
    const refParam = searchParams.get('ref') || searchParams.get('utm_source') || '';
    const detectedSource = detectSource(refParam);

    const [position, setPosition] = useState(null);
    const [posLoading, setPosLoading] = useState(true);
    const [posError, setPosError] = useState(null);

    const [form, setForm] = useState({ name: '', email: '', phone: '', linkedin: '' });
    const [cvFile, setCvFile] = useState(null);
    const [kvkk, setKvkk] = useState(false);
    const [cvParsing, setCvParsing] = useState(false);
    const [autoFilled, setAutoFilled] = useState({ name: false, email: false, phone: false, linkedin: false });
    const [cvParseError, setCvParseError] = useState(false);
    const [cvParseNoData, setCvParseNoData] = useState(false);

    const [step, setStep] = useState('form');   // form | processing | success | error
    const [progress, setProgress] = useState('');
    const [aiScore, setAiScore] = useState(null);
    const [submitError, setSubmitError] = useState(null);

    // Screening answers — one entry per question
    const [screeningAnswers, setScreeningAnswers] = useState([]);

    // ── Source selection ──────────────────────────────────────────────────
    const [sources, setSources]                     = useState([]);
    const [selectedMainSource, setSelectedMainSource] = useState(null); // full source object
    const [selectedSubSource, setSelectedSubSource]   = useState('');   // sub-source string

    const fileInputRef = useRef(null);

    // Fetch position — sign in anonymously first so isAuthenticated() rule passes
    useEffect(() => {
        if (!positionId) { setPosError('Geçersiz başvuru linki.'); setPosLoading(false); return; }
        (async () => {
            try {
                // Anonymous sign-in satisfies isAuthenticated() Firestore rule
                if (auth && !auth.currentUser) {
                    await signInAnonymously(auth);
                }
                const snap = await getDoc(doc(db, POSITIONS_COLLECTION, positionId));
                if (!snap.exists()) { setPosError('Pozisyon bulunamadı.'); return; }
                const data = snap.data();
                if (data.status !== 'open') { setPosError('Bu pozisyon şu an başvuruya kapalı.'); return; }
                setPosition({ id: snap.id, ...data });
            } catch (err) {
                console.error('Position fetch error:', err);
                setPosError('Pozisyon yüklenirken hata oluştu.');
            } finally {
                setPosLoading(false);
            }
        })();
    }, [positionId]);

    // ── Load sources from Firestore — wait for auth before subscribing ───
    useEffect(() => {
        let sourceUnsub = null;

        // Subscribe to auth changes; start sources listener only when a user
        // (anonymous or real) is signed in to avoid a permission-denied race.
        const authUnsub = onAuthStateChanged(auth, (firebaseUser) => {
            if (!firebaseUser) return; // not yet signed in — wait
            if (sourceUnsub) return;  // already subscribed

            const q = query(collection(db, SOURCES_PATH), orderBy('createdAt', 'asc'));
            sourceUnsub = onSnapshot(q, (snap) => {
                const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setSources(loaded);

                // Auto-select based on URL-detected source
                if (loaded.length > 0 && detectedSource && detectedSource !== 'Direkt') {
                    const normalised = detectedSource.toLowerCase();
                    for (const main of loaded) {
                        const matchedSub = (main.subSources || []).find(
                            s => s.toLowerCase() === normalised || normalised.includes(s.toLowerCase())
                        );
                        if (matchedSub) {
                            setSelectedMainSource(main);
                            setSelectedSubSource(matchedSub);
                            break;
                        }
                        if (main.name.toLowerCase() === normalised || normalised.includes(main.name.toLowerCase())) {
                            setSelectedMainSource(main);
                            break;
                        }
                    }
                }
            }, (err) => {
                console.warn('Sources fetch error (non-blocking):', err.message);
            });
        });

        return () => {
            authUnsub();
            if (sourceUnsub) sourceUnsub();
        };
    }, [detectedSource]);

    // ── Derived: effective source values saved to Firestore ───────────────
    const effectiveSubSource  = selectedSubSource  || (selectedMainSource ? '' : detectedSource);
    const effectiveSource     = selectedSubSource  || selectedMainSource?.name || detectedSource;
    const effectiveCategory   = selectedMainSource?.name || null;

    function handleMainSourceSelect(src) {
        setSelectedMainSource(prev => prev?.id === src.id ? null : src);
        setSelectedSubSource('');
    }

    function handleField(e) {
        const { name, value } = e.target;
        setForm(f => ({ ...f, [name]: value }));
        // Clear auto-fill badge when user manually edits
        if (autoFilled[name]) setAutoFilled(af => ({ ...af, [name]: false }));
    }

    async function handleFileDrop(e) {
        e.preventDefault();
        const file = e.dataTransfer?.files[0] || e.target.files?.[0];
        if (!file) return;
        const ok = file.type === 'application/pdf' ||
            file.name.endsWith('.docx') ||
            file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        if (!ok) { alert('Lütfen PDF veya DOCX formatında CV yükleyin.'); return; }
        if (file.size > 10 * 1024 * 1024) { alert('Dosya 10 MB\'dan küçük olmalı.'); return; }
        setCvFile(file);
        setCvParsing(true);
        setCvParseError(false);
        setCvParseNoData(false);
        try {
            const text = await extractTextFromFile(file);
            console.log('[CV auto-fill] extracted text length:', text?.length);
            if (text && text.length >= 40) {
                const parsed = await parseCandidateFromText(text);
                console.log('[CV auto-fill] parsed result:', parsed);
                if (parsed) {
                    const newForm = {};
                    const filled = {};
                    const fields = [
                        { key: 'name', val: parsed.name },
                        { key: 'email', val: parsed.email },
                        { key: 'phone', val: parsed.phone },
                        { key: 'linkedin', val: parsed.linkedinUrl },
                    ];
                    for (const { key, val } of fields) {
                        const v = String(val || '').trim();
                        if (v && v !== '-' && v !== 'null' && v !== 'undefined' && v.length > 1) {
                            newForm[key] = v;
                            filled[key] = true;
                        }
                    }
                    if (Object.keys(newForm).length > 0) {
                        setForm(f => ({ ...f, ...newForm }));
                        setAutoFilled(af => ({ ...af, ...filled }));
                    } else {
                        setCvParseNoData(true);
                    }
                } else {
                    setCvParseNoData(true);
                }
            } else {
                setCvParseNoData(true);
            }
        } catch (err) {
            console.warn('[CV auto-fill] error:', err);
            setCvParseError(true);
        } finally {
            setCvParsing(false);
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!kvkk) { alert('Lütfen KVKK aydınlatma metnini onaylayın.'); return; }
        if (!cvFile) { alert('Lütfen CV dosyanızı yükleyin.'); return; }
        if (position?.screeningEnabled && (position?.screeningQuestions || []).length > 0) {
            const unanswered = (position.screeningQuestions || []).some((_, i) => !screeningAnswers[i]?.trim());
            if (unanswered) { alert('Lütfen tüm ön eleme sorularını yanıtlayın.'); return; }
        }

        setStep('processing');
        setSubmitError(null);

        try {
            // Ensure anonymous auth is active before any Firestore writes
            if (auth && !auth.currentUser) {
                await signInAnonymously(auth);
            }

            // Step 1 — Extract text from CV
            setProgress('CV okunuyor...');
            const cvText = await extractTextFromFile(cvFile);

            // Step 2 — Parse candidate data with AI
            setProgress('CV analiz ediliyor...');
            let parsedCandidate = null;
            try {
                const parseTimeout = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('CV parse timed out after 25s')), 25000)
                );
                parsedCandidate = await Promise.race([parseCandidateFromText(cvText), parseTimeout]);
            } catch {
                parsedCandidate = null;
            }

            // Step 3 — Score against position (Phase 1: fast deterministic)
            setProgress('Pozisyona uygunluk hesaplanıyor...');
            let score = 0;
            let scoreBreakdown = null;
            if (parsedCandidate && position) {
                try {
                    const result = calculateMatchScore(parsedCandidate, position);
                    score = result.score ?? result ?? 0;
                    scoreBreakdown = result.breakdown ?? null;
                } catch {
                    score = 0;
                }
            }

            // Step 3b — STAR Analysis (Phase 2: AI-powered deep CV evaluation)
            setProgress('CV STAR analizi yapılıyor...');
            let starAiAnalysis = null;
            if (parsedCandidate && position) {
                try {
                    const jobText = `${position.title}\n${(position.requirements || []).join(', ')}\n${position.description || ''}`;
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('STAR analysis timed out after 30s')), 30000)
                    );
                    const aiResult = await Promise.race([
                        analyzeCandidateMatch(jobText, parsedCandidate),
                        timeoutPromise,
                    ]);
                    starAiAnalysis = {
                        score: aiResult.score,
                        summary: aiResult.summary,
                        starAnalysis: aiResult.starAnalysis,
                        reasons: aiResult.reasons,
                        lastAnalyzedAt: new Date().toISOString(),
                    };
                    // Use the AI score as the primary score if available
                    if (aiResult.score > 0) score = aiResult.score;
                } catch (starErr) {
                    console.warn('Phase 2 STAR analysis failed (non-blocking):', starErr.message);
                }
            }

            // Step 3c — AI scoring of screening answers via backend (non-blocking)
            // Raw answers are always persisted; AI scoring augments them if available.
            const rawScreeningAnswers = (position?.screeningEnabled && (position?.screeningQuestions || []).length > 0)
                ? (position.screeningQuestions || []).map((q, i) => ({ question: q, answer: screeningAnswers[i] || '' }))
                : null;

            let screeningResult = null;
            if (rawScreeningAnswers && rawScreeningAnswers.some(a => a.answer.trim())) {
                setProgress('Ön eleme soruları değerlendiriliyor...');
                try {
                    const resp = await Promise.race([
                        fetch('/api/score-screening-answers', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                positionTitle: position.title,
                                answers: rawScreeningAnswers,
                            }),
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Screening AI timeout')), 20000)),
                    ]);
                    const respData = await resp.json();
                    if (respData && (respData.aggregateScore != null || (respData.scores || []).length > 0)) {
                        const agg = respData.aggregateScore != null
                            ? respData.aggregateScore
                            : Math.round((respData.scores || []).reduce((sum, s) => sum + (s.score || 0), 0) / Math.max((respData.scores || []).length, 1));
                        screeningResult = { ...respData, aggregateScore: agg, answers: rawScreeningAnswers };
                    }
                } catch (screenErr) {
                    console.warn('Screening AI error (non-blocking):', screenErr.message);
                }
            }

            // Step 4 — Save to applications + candidates
            setProgress('Başvuru kaydediliyor...');
            const appData = {
                positionId: position.id,
                positionTitle: position.title || '',
                name: form.name.trim(),
                email: form.email.trim().toLowerCase(),
                phone: form.phone.trim(),
                linkedin: form.linkedin?.trim() || '',
                cvFileName: cvFile.name,
                cvText: cvText ? cvText.slice(0, 6000) : '',
                source: effectiveSource,
                sourceCategory: effectiveCategory,
                aiScore: score,
                aiSummary: parsedCandidate?.summary || '',
                status: 'new',
                kvkkConsent: true,
                createdAt: serverTimestamp(),
            };
            if (rawScreeningAnswers) appData.screeningAnswers = rawScreeningAnswers;
            if (screeningResult) {
                appData.screeningResult = screeningResult;
                appData.screeningScore = screeningResult.aggregateScore ?? null;
            }
            if (parsedCandidate) appData.parsedCandidate = parsedCandidate;
            if (scoreBreakdown) appData.aiScoreBreakdown = scoreBreakdown;

            // Guard: block duplicate applications (same email + same position)
            const emailForDupCheck = form.email.trim().toLowerCase();
            try {
                const dupAppSnap = await getDocs(
                    query(
                        collection(db, APPLICATIONS_COLLECTION),
                        where('positionId', '==', position.id),
                        where('email', '==', emailForDupCheck)
                    )
                );
                if (!dupAppSnap.empty) {
                    setStep('duplicate');
                    return;
                }
            } catch (dupCheckErr) {
                console.warn('Duplicate application check failed (non-blocking):', dupCheckErr.message);
            }

            // Save application
            const appRef = await addDoc(collection(db, APPLICATIONS_COLLECTION), appData);

            // Also create a candidate entry so it appears in the HR dashboard
            // First: check for duplicates by email or phone
            const emailNorm = form.email.trim().toLowerCase();
            const phoneNorm = form.phone.trim();
            let existingCandidateId = null;
            try {
                const emailQuery = await getDocs(
                    query(collection(db, CANDIDATES_COLLECTION), where('email', '==', emailNorm))
                );
                if (!emailQuery.empty) {
                    existingCandidateId = emailQuery.docs[0].id;
                } else if (phoneNorm) {
                    const phoneQuery = await getDocs(
                        query(collection(db, CANDIDATES_COLLECTION), where('phone', '==', phoneNorm))
                    );
                    if (!phoneQuery.empty) {
                        existingCandidateId = phoneQuery.docs[0].id;
                    }
                }
            } catch (dupErr) {
                console.warn('Duplicate check failed (non-blocking):', dupErr.message);
            }

            if (existingCandidateId) {
                // Duplicate found — link new application to existing candidate record
                try {
                    await updateDoc(doc(db, CANDIDATES_COLLECTION, existingCandidateId), {
                        applicationId: appRef.id,
                        positionId: position.id,
                        position: position.title || '',
                        appliedDate: new Date().toISOString().split('T')[0],
                        matchScore: score,
                        combinedScore: score,
                        status: 'ai_analysis',
                        source: effectiveSource,
                        sourceCategory: effectiveCategory,
                        ...(starAiAnalysis ? { aiAnalysis: starAiAnalysis } : {}),
                        ...(rawScreeningAnswers ? { screeningAnswers: rawScreeningAnswers } : {}),
                        ...(screeningResult ? { screeningScore: screeningResult.aggregateScore ?? null, screeningResult } : {}),
                        updatedAt: serverTimestamp(),
                    });
                } catch (updErr) {
                    console.warn('Existing candidate update failed:', updErr.message);
                }
                setAiScore(score);
                setStep('duplicate');
            } else {
                // Brand-new candidate
                const candidateData = {
                    name: form.name.trim(),
                    email: emailNorm,
                    phone: phoneNorm,
                    linkedinUrl: form.linkedin?.trim() || '',
                    position: position.title || '',
                    company: parsedCandidate?.company || '',
                    location: parsedCandidate?.location || '',
                    skills: parsedCandidate?.skills || [],
                    experience: parsedCandidate?.experience || 0,
                    education: parsedCandidate?.education || '',
                    summary: parsedCandidate?.summary || '',
                    cvData: parsedCandidate?.cvData || '',
                    experiences: parsedCandidate?.experiences || [],
                    cvText: cvText ? cvText.slice(0, 6000) : '',
                    cvFileName: cvFile.name,
                    source: effectiveSource,
                    sourceCategory: effectiveCategory,
                    status: 'ai_analysis',
                    matchScore: score,
                    combinedScore: score,
                    aiAnalysis: starAiAnalysis || (score > 0 ? { score, summary: parsedCandidate?.summary || '' } : null),
                    applicationId: appRef.id,
                    positionId: position.id,
                    appliedDate: new Date().toISOString().split('T')[0],
                    interviewSessions: [],
                    ...(rawScreeningAnswers ? { screeningAnswers: rawScreeningAnswers } : {}),
                    ...(screeningResult ? { screeningScore: screeningResult.aggregateScore ?? null, screeningResult } : {}),
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                };
                try {
                    await addDoc(collection(db, CANDIDATES_COLLECTION), candidateData);
                } catch (candErr) {
                    console.warn('Candidate creation failed (rules not deployed?):', candErr.message);
                }
                setAiScore(score);
                setStep('success');
            }
            return; // avoid double setStep below
        } catch (err) {
            console.error('Application submit error:', err);
            setSubmitError(err.message || 'Bir hata oluştu.');
            setStep('error');
        }
    }

    // ── Loading ──
    if (posLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
        );
    }

    // ── Error ──
    if (posError) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="bg-white rounded-2xl shadow-lg p-10 max-w-sm w-full text-center border border-slate-100">
                    <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-7 h-7 text-red-400" />
                    </div>
                    <h2 className="text-xl font-black text-slate-800 mb-2">Hata</h2>
                    <p className="text-slate-500 text-sm">{posError}</p>
                </div>
            </div>
        );
    }

    // ── Processing ──
    if (step === 'processing') {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="bg-white rounded-2xl shadow-lg p-10 max-w-sm w-full text-center border border-slate-100">
                    <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-5">
                        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                    </div>
                    <h2 className="text-xl font-black text-slate-800 mb-2">Başvuru İşleniyor</h2>
                    <p className="text-slate-400 text-sm">{progress}</p>
                    <div className="mt-6 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full animate-pulse" style={{ width: '70%' }} />
                    </div>
                </div>
            </div>
        );
    }

    // ── Success ──
    if (step === 'success') {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="bg-white rounded-2xl shadow-lg p-10 max-w-sm w-full text-center border border-slate-100">
                    <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    </div>
                    <div className="text-[10px] font-black text-indigo-400 tracking-widest uppercase mb-1">Başvurunuz Alındı</div>
                    <h2 className="text-2xl font-black text-slate-800 mb-1">{position?.title}</h2>
                    <p className="text-slate-400 text-sm mb-6">{position?.department}</p>

                    <p className="text-slate-400 text-sm mb-6">Profiliniz değerlendirmeye alındı. Ekibimiz inceleyerek size dönüş yapacak.</p>

                    <div className="bg-slate-50 rounded-xl p-4 text-left border border-slate-100 text-[11px]">
                        <div className="font-black uppercase tracking-widest text-slate-400 mb-2">Başvuru Özeti</div>
                        <div className="space-y-1">
                            <div className="flex gap-2"><span className="text-slate-300 w-16 shrink-0">Ad</span><span className="font-bold text-slate-700 truncate">{form.name}</span></div>
                            <div className="flex gap-2"><span className="text-slate-300 w-16 shrink-0">E-posta</span><span className="font-bold text-slate-700 truncate">{form.email}</span></div>
                            <div className="flex gap-2"><span className="text-slate-300 w-16 shrink-0">CV</span><span className="font-bold text-slate-700 truncate">{cvFile?.name}</span></div>
                            <div className="flex gap-2"><span className="text-slate-300 w-16 shrink-0">Kaynak</span><span className="font-bold text-slate-700">{effectiveCategory ? `${effectiveCategory} · ${effectiveSource}` : effectiveSource}</span></div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── Duplicate Candidate ──
    if (step === 'duplicate') {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="bg-white rounded-2xl shadow-lg p-10 max-w-sm w-full text-center border border-slate-100">
                    <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-5">
                        <User className="w-8 h-8 text-amber-500" />
                    </div>
                    <div className="text-[10px] font-black text-amber-500 tracking-widest uppercase mb-1">Zaten Kayıtlısınız</div>
                    <h2 className="text-xl font-black text-slate-800 mb-2">Profil Güncellendi</h2>
                    <p className="text-slate-400 text-sm mb-6">
                        Bu e-posta veya telefon numarası sistemimizde kayıtlı. Başvurunuz mevcut profilinize bağlandı ve yeni pozisyon eklendi.
                    </p>
                    <div className="bg-amber-50 rounded-xl p-4 text-left border border-amber-100 text-[11px] mb-4">
                        <div className="font-black uppercase tracking-widest text-amber-600 mb-2">Başvuru Bilgileri</div>
                        <div className="space-y-1">
                            <div className="flex gap-2"><span className="text-amber-400 w-20 shrink-0">Ad</span><span className="font-bold text-slate-700 truncate">{form.name}</span></div>
                            <div className="flex gap-2"><span className="text-amber-400 w-20 shrink-0">E-posta</span><span className="font-bold text-slate-700 truncate">{form.email}</span></div>
                            <div className="flex gap-2"><span className="text-amber-400 w-20 shrink-0">Pozisyon</span><span className="font-bold text-slate-700 truncate">{position?.title}</span></div>
                        </div>
                    </div>
                    <p className="text-slate-400 text-xs">Ekibimiz başvurunuzu inceleyerek size dönüş yapacak.</p>
                </div>
            </div>
        );
    }

    // ── Submit Error ──
    if (step === 'error') {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="bg-white rounded-2xl shadow-lg p-10 max-w-sm w-full text-center border border-slate-100">
                    <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-7 h-7 text-red-400" />
                    </div>
                    <h2 className="text-xl font-black text-slate-800 mb-2">Başvuru Gönderilemedi</h2>
                    <p className="text-slate-500 text-sm mb-6">{submitError}</p>
                    <button onClick={() => setStep('form')}
                        className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition-colors">
                        Tekrar Dene
                    </button>
                </div>
            </div>
        );
    }

    // ── Form ──
    return (
        <div className="min-h-screen bg-slate-50">
            {/* Top bar */}
            <div className="bg-white border-b border-slate-100 px-6 py-3.5">
                <div className="max-w-lg mx-auto flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center shrink-0">
                        <span className="text-white text-[11px] font-black tracking-tight">TI</span>
                    </div>
                    <span className="text-slate-800 font-black text-sm">Talent-Inn</span>
                    {effectiveSource !== 'Direkt' && (
                        <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-slate-400 border border-slate-200 rounded-full px-2.5 py-1">
                            {effectiveCategory ? `${effectiveCategory} · ${effectiveSource}` : effectiveSource}
                        </span>
                    )}
                </div>
            </div>

            {/* Hero */}
            <div className="max-w-lg mx-auto px-6 pt-6 pb-4">
                <div className="relative overflow-hidden rounded-2xl p-6" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%)' }}>
                    {/* Subtle glow */}
                    <div className="absolute top-0 right-0 w-40 h-40 opacity-20 pointer-events-none" style={{ background: 'radial-gradient(circle, #818cf8 0%, transparent 70%)' }} />

                    <div className="relative">
                        <span className="inline-block text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: '#a5b4fc' }}>Açık Pozisyon</span>
                        <h1 className="text-[24px] font-black leading-tight mb-1" style={{ color: '#ffffff' }}>{position?.title}</h1>
                        <div className="flex items-center gap-1.5 mb-4">
                            <Building2 size={12} style={{ color: '#a5b4fc' }} />
                            <span className="text-[12px] font-semibold" style={{ color: '#a5b4fc' }}>{position?.department}</span>
                        </div>
                        {position?.requirements?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {position.requirements.slice(0, 5).map(r => (
                                    <span key={r} className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-indigo-200 bg-white/10 border border-white/10">{r}</span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Form */}
            <div className="max-w-lg mx-auto px-6 pb-12">
                <form onSubmit={handleSubmit} className="space-y-3">

                    {/* CV Upload — first so auto-fill can populate fields below */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                            CV / Özgeçmiş <span className="text-red-400">*</span>
                        </div>
                        <div
                            onDragOver={e => e.preventDefault()}
                            onDrop={handleFileDrop}
                            onClick={() => !cvParsing && fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${cvParsing ? 'cursor-wait border-indigo-200 bg-indigo-50/20' : cvFile ? 'cursor-pointer border-indigo-300 bg-indigo-50/40' : 'cursor-pointer border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/20'}`}
                        >
                            <input ref={fileInputRef} type="file" accept=".pdf,.docx" className="hidden" onChange={handleFileDrop} />
                            {cvParsing ? (
                                <div className="flex flex-col items-center gap-2">
                                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                                    <div className="font-bold text-slate-500 text-sm">CV okunuyor ve analiz ediliyor...</div>
                                    <div className="text-[11px] text-slate-400">Bilgileriniz otomatik doldurulacak</div>
                                </div>
                            ) : cvFile ? (
                                <div className="flex flex-col items-center gap-2">
                                    <FileText className="w-8 h-8 text-indigo-500" />
                                    <div className="font-bold text-slate-700 text-sm">{cvFile.name}</div>
                                    <div className="text-[11px] text-slate-400">{(cvFile.size / 1024).toFixed(0)} KB</div>
                                    {cvParseError && (
                                        <div className="text-[11px] text-amber-500 font-semibold mt-1">⚠ Belge okunamadı — lütfen bilgilerinizi manuel doldurun</div>
                                    )}
                                    {cvParseNoData && !cvParseError && (
                                        <div className="text-[11px] text-amber-500 font-semibold mt-1">Bu belgede kişisel bilgi bulunamadı — lütfen bilgilerinizi manuel doldurun</div>
                                    )}
                                    <button type="button" onClick={e => { e.stopPropagation(); setCvFile(null); setAutoFilled({ name: false, email: false, phone: false, linkedin: false }); setCvParseNoData(false); setCvParseError(false); }}
                                        className="flex items-center gap-1 text-red-400 text-[11px] font-bold hover:text-red-500 mt-1">
                                        <X size={12} /> Kaldır
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-2">
                                    <Upload className="w-8 h-8 text-slate-300" />
                                    <div className="font-bold text-slate-500 text-sm">CV'nizi sürükleyin veya tıklayın</div>
                                    <div className="text-[11px] text-slate-400">PDF veya DOCX • Maks. 10 MB</div>
                                    <div className="text-[11px] text-indigo-400 font-semibold mt-1">Bilgiler otomatik doldurulacak</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Personal info */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Kişisel Bilgiler</div>
                            {(autoFilled.name || autoFilled.email || autoFilled.phone || autoFilled.linkedin) && (
                                <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 flex items-center gap-1">
                                    <CheckCircle2 size={9} /> CV'den otomatik dolduruldu
                                </span>
                            )}
                        </div>
                        <InputField label="Ad Soyad" icon={User} name="name" required
                            autoFilled={autoFilled.name}
                            value={form.name} onChange={handleField}
                            placeholder="Adınız ve soyadınız" />
                        <InputField label="E-posta" icon={Mail} name="email" type="email" required
                            autoFilled={autoFilled.email}
                            value={form.email} onChange={handleField}
                            placeholder="ornek@email.com" />
                        <InputField label="Telefon" icon={Phone} name="phone" type="tel" required
                            autoFilled={autoFilled.phone}
                            value={form.phone} onChange={handleField}
                            placeholder="+90 5XX XXX XX XX" />
                        <InputField label="LinkedIn / Portfolyo" icon={Linkedin} name="linkedin" type="text"
                            autoFilled={autoFilled.linkedin}
                            value={form.linkedin} onChange={handleField}
                            placeholder="linkedin.com/in/kullanici (isteğe bağlı)" />
                    </div>

                    {/* Source selector — only shown when sources loaded from Firestore */}
                    {sources.length > 0 && (
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                Bize Nasıl Ulaştınız? <span className="text-slate-300 font-normal normal-case">(isteğe bağlı)</span>
                            </div>

                            {/* Main sources */}
                            <div className="flex flex-wrap gap-2">
                                {sources.map(src => {
                                    const Icon    = SOURCE_ICONS[src.icon] || Globe;
                                    const color   = src.color || '#06b6d4';
                                    const active  = selectedMainSource?.id === src.id;
                                    return (
                                        <button
                                            key={src.id}
                                            type="button"
                                            onClick={() => handleMainSourceSelect(src)}
                                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-semibold transition-all ${
                                                active
                                                    ? 'border-transparent shadow-sm'
                                                    : 'border-slate-200 text-slate-500 hover:border-slate-300 bg-slate-50'
                                            }`}
                                            style={active
                                                ? { background: `${color}15`, borderColor: `${color}40`, color }
                                                : {}
                                            }
                                        >
                                            <Icon size={14} />
                                            {src.name}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Sub-sources — shown when a main source is selected */}
                            {selectedMainSource && (selectedMainSource.subSources || []).length > 0 && (
                                <div className="pl-1 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <ChevronDown size={12} className="text-slate-300" style={{ color: selectedMainSource.color || '#06b6d4' }} />
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            {selectedMainSource.name} Alt Kanalı
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {(selectedMainSource.subSources || []).map(sub => {
                                            const active = selectedSubSource === sub;
                                            const color  = selectedMainSource.color || '#06b6d4';
                                            return (
                                                <button
                                                    key={sub}
                                                    type="button"
                                                    onClick={() => setSelectedSubSource(prev => prev === sub ? '' : sub)}
                                                    className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                                                        active
                                                            ? 'border-transparent shadow-sm'
                                                            : 'border-slate-200 text-slate-500 hover:border-slate-300 bg-slate-50'
                                                    }`}
                                                    style={active ? { background: `${color}15`, borderColor: `${color}40`, color } : {}}
                                                >
                                                    {sub}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Selection summary */}
                            {selectedMainSource && (
                                <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
                                    <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                                    <span>
                                        <span className="font-semibold text-slate-600">{selectedMainSource.name}</span>
                                        {selectedSubSource && (
                                            <> › <span className="font-semibold text-slate-600">{selectedSubSource}</span></>
                                        )}
                                        {' '}olarak kaydedilecek
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => { setSelectedMainSource(null); setSelectedSubSource(''); }}
                                        className="ml-auto text-slate-300 hover:text-slate-500 transition-colors"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Screening Questions — shown when position.screeningEnabled */}
                    {position?.screeningEnabled && (position?.screeningQuestions || []).length > 0 && (
                        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-6 space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                                    <span className="text-[11px]">🎯</span>
                                </div>
                                <div>
                                    <div className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Ön Eleme Soruları</div>
                                    <div className="text-[10px] text-slate-400">Lütfen tüm soruları yanıtlayın</div>
                                </div>
                            </div>
                            {(position.screeningQuestions || []).map((q, i) => (
                                <div key={i} className="space-y-1.5">
                                    <label className="text-[12px] font-semibold text-slate-700 block">
                                        <span className="text-indigo-400 font-black mr-1.5">{i + 1}.</span>{q}
                                    </label>
                                    <textarea
                                        value={screeningAnswers[i] || ''}
                                        onChange={e => {
                                            const next = [...screeningAnswers];
                                            next[i] = e.target.value;
                                            setScreeningAnswers(next);
                                        }}
                                        placeholder="Yanıtınızı buraya yazın..."
                                        rows={3}
                                        className="w-full border border-slate-200 rounded-xl p-3 text-[12px] text-slate-700 placeholder-slate-300 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 resize-none transition-all"
                                    />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* KVKK */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                        <label className="flex gap-3 cursor-pointer select-none">
                            <div className="relative mt-0.5 shrink-0">
                                <input type="checkbox" className="sr-only" checked={kvkk} onChange={e => setKvkk(e.target.checked)} />
                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${kvkk ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}>
                                    {kvkk && <CheckCircle2 size={12} className="text-white" />}
                                </div>
                            </div>
                            <div>
                                <div className="text-[12px] font-semibold text-slate-700 leading-relaxed">
                                    <span className="text-indigo-600 font-bold">KVKK Aydınlatma Metni</span>'ni okudum ve kişisel verilerimin Talent-Inn tarafından işlenmesine onay veriyorum.
                                </div>
                                <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                    <Shield size={10} />
                                    Verileriniz yalnızca işe alım sürecinde kullanılır.
                                </div>
                            </div>
                        </label>
                    </div>

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={!form.name || !form.email || !form.phone || !cvFile || !kvkk}
                        className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-[15px] flex items-center justify-center gap-2 transition-colors shadow-sm mt-1"
                    >
                        Başvuruyu Gönder <ChevronRight className="w-5 h-5" />
                    </button>

                    <p className="text-center text-[10px] text-slate-400 pb-4">
                        Başvurunuz AI destekli değerlendirmeye alınacak ve ekibimiz en kısa sürede sizinle iletişime geçecektir.
                    </p>
                </form>
            </div>
        </div>
    );
}
