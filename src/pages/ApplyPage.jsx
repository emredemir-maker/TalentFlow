// src/pages/ApplyPage.jsx — Public job application page (no auth required)
import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth } from '../config/firebase';
import { extractTextFromFile } from '../services/cvParser';
import { parseCandidateFromText } from '../services/geminiService';
import { calculateMatchScore } from '../services/matchService';
import { detectSource } from '../services/applicationService';
import {
    Briefcase, Upload, CheckCircle2, Loader2, AlertCircle,
    User, Mail, Phone, Linkedin, FileText, Building2, X,
    ChevronRight, Shield
} from 'lucide-react';

const POSITIONS_COLLECTION = 'artifacts/talent-flow/public/data/positions';
const APPLICATIONS_COLLECTION = 'artifacts/talent-flow/public/data/applications';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function InputField({ label, icon: Icon, required, ...props }) {
    return (
        <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                {label} {required && <span className="text-violet-500">*</span>}
            </label>
            <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300">
                    <Icon size={15} />
                </div>
                <input
                    {...props}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm font-semibold placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400 transition-all bg-white"
                />
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────
// Score ring
// ──────────────────────────────────────────────
function ScoreRing({ score }) {
    const r = 40, c = 2 * Math.PI * r;
    const dash = (score / 100) * c;
    const color = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
    return (
        <svg width="96" height="96" viewBox="0 0 96 96" className="drop-shadow-lg">
            <circle cx="48" cy="48" r={r} fill="none" stroke="#f1f5f9" strokeWidth="10" />
            <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="10"
                strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
                transform="rotate(-90 48 48)" style={{ transition: 'stroke-dasharray 1s ease' }} />
            <text x="48" y="53" textAnchor="middle" fill={color}
                fontSize="20" fontWeight="900" fontFamily="sans-serif">{score}%</text>
        </svg>
    );
}

// ──────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────
export default function ApplyPage() {
    const { positionId } = useParams();
    const [searchParams] = useSearchParams();
    const refParam = searchParams.get('ref') || searchParams.get('utm_source') || '';
    const source = detectSource(refParam);

    const [position, setPosition] = useState(null);
    const [posLoading, setPosLoading] = useState(true);
    const [posError, setPosError] = useState(null);

    const [form, setForm] = useState({ name: '', email: '', phone: '', linkedin: '' });
    const [cvFile, setCvFile] = useState(null);
    const [kvkk, setKvkk] = useState(false);

    const [step, setStep] = useState('form');   // form | processing | success | error
    const [progress, setProgress] = useState('');
    const [aiScore, setAiScore] = useState(null);
    const [submitError, setSubmitError] = useState(null);

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

    function handleField(e) {
        setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    }

    function handleFileDrop(e) {
        e.preventDefault();
        const file = e.dataTransfer?.files[0] || e.target.files?.[0];
        if (!file) return;
        const ok = file.type === 'application/pdf' ||
            file.name.endsWith('.docx') ||
            file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        if (!ok) { alert('Lütfen PDF veya DOCX formatında CV yükleyin.'); return; }
        if (file.size > 10 * 1024 * 1024) { alert('Dosya 10 MB\'dan küçük olmalı.'); return; }
        setCvFile(file);
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!kvkk) { alert('Lütfen KVKK aydınlatma metnini onaylayın.'); return; }
        if (!cvFile) { alert('Lütfen CV dosyanızı yükleyin.'); return; }

        setStep('processing');
        setSubmitError(null);

        try {
            // Step 1 — Extract text from CV
            setProgress('CV okunuyor...');
            const cvText = await extractTextFromFile(cvFile);

            // Step 2 — Parse candidate data with AI
            setProgress('CV analiz ediliyor...');
            let parsedCandidate = null;
            try {
                parsedCandidate = await parseCandidateFromText(cvText);
            } catch {
                parsedCandidate = null;
            }

            // Step 3 — Score against position
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

            // Step 4 — Save directly to Firestore (anonymous auth satisfies isAuthenticated() rule)
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
                source,
                aiScore: score,
                aiSummary: parsedCandidate?.summary || '',
                status: 'new',
                kvkkConsent: true,
                createdAt: serverTimestamp(),
            };
            if (parsedCandidate) appData.parsedCandidate = parsedCandidate;
            if (scoreBreakdown) appData.aiScoreBreakdown = scoreBreakdown;
            await addDoc(collection(db, APPLICATIONS_COLLECTION), appData);

            setAiScore(score);
            setStep('success');
        } catch (err) {
            console.error('Application submit error:', err);
            setSubmitError(err.message || 'Bir hata oluştu.');
            setStep('error');
        }
    }

    const pageBg = 'min-h-screen bg-[#f6f5ff]';

    // ── Loading ──
    if (posLoading) {
        return (
            <div className={`${pageBg} flex items-center justify-center`}>
                <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
            </div>
        );
    }

    // ── Error ──
    if (posError) {
        return (
            <div className={`${pageBg} flex items-center justify-center p-6`}>
                <div className="bg-white rounded-3xl shadow-xl p-10 max-w-sm w-full text-center">
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
            <div className={`${pageBg} flex items-center justify-center p-6`}>
                <div className="bg-white rounded-3xl shadow-xl p-10 max-w-sm w-full text-center">
                    <div className="w-16 h-16 rounded-full bg-violet-50 flex items-center justify-center mx-auto mb-5">
                        <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
                    </div>
                    <h2 className="text-xl font-black text-slate-800 mb-2">Başvuru İşleniyor</h2>
                    <p className="text-slate-400 text-sm">{progress}</p>
                    <div className="mt-6 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full animate-pulse" style={{ width: '70%' }} />
                    </div>
                </div>
            </div>
        );
    }

    // ── Success ──
    if (step === 'success') {
        return (
            <div className={`${pageBg} flex items-center justify-center p-6`}>
                <div className="bg-white rounded-3xl shadow-xl p-10 max-w-sm w-full text-center">
                    <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    </div>
                    <div className="text-[10px] font-black text-violet-400 tracking-widest uppercase mb-1">Başvurunuz Alındı</div>
                    <h2 className="text-2xl font-black text-slate-800 mb-1">{position?.title}</h2>
                    <p className="text-slate-400 text-sm mb-6">{position?.department}</p>

                    {aiScore !== null && (
                        <div className="mb-6">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">AI Uyum Skoru</div>
                            <div className="flex justify-center">
                                <ScoreRing score={aiScore} />
                            </div>
                            <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
                                {aiScore >= 75
                                    ? 'Profiliniz bu pozisyonla yüksek uyum gösteriyor. Ekibimiz kısa sürede sizinle iletişime geçecek.'
                                    : aiScore >= 50
                                        ? 'Profiliniz değerlendirmeye alındı. Ekibimiz inceleyerek size dönüş yapacak.'
                                        : 'Başvurunuz kaydedildi. Ekibimiz inceleyerek size dönüş yapacak.'}
                            </p>
                        </div>
                    )}

                    <div className="bg-slate-50 rounded-2xl p-4 text-left border border-slate-100 text-[11px] text-slate-500">
                        <div className="font-black uppercase tracking-widest text-slate-400 mb-2">Başvuru Özeti</div>
                        <div className="space-y-1">
                            <div className="flex gap-2"><span className="text-slate-300 w-16 shrink-0">Ad</span><span className="font-bold text-slate-600 truncate">{form.name}</span></div>
                            <div className="flex gap-2"><span className="text-slate-300 w-16 shrink-0">E-posta</span><span className="font-bold text-slate-600 truncate">{form.email}</span></div>
                            <div className="flex gap-2"><span className="text-slate-300 w-16 shrink-0">CV</span><span className="font-bold text-slate-600 truncate">{cvFile?.name}</span></div>
                            <div className="flex gap-2"><span className="text-slate-300 w-16 shrink-0">Kaynak</span><span className="font-bold text-slate-600">{source}</span></div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── Submit Error ──
    if (step === 'error') {
        return (
            <div className={`${pageBg} flex items-center justify-center p-6`}>
                <div className="bg-white rounded-3xl shadow-xl p-10 max-w-sm w-full text-center">
                    <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-7 h-7 text-red-400" />
                    </div>
                    <h2 className="text-xl font-black text-slate-800 mb-2">Başvuru Gönderilemedi</h2>
                    <p className="text-slate-500 text-sm mb-6">{submitError}</p>
                    <button onClick={() => setStep('form')}
                        className="w-full py-3 rounded-xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 transition-colors">
                        Tekrar Dene
                    </button>
                </div>
            </div>
        );
    }

    // ── Form ──
    return (
        <div className={pageBg}>
            {/* Top bar */}
            <div className="bg-white/80 backdrop-blur-sm border-b border-violet-100/60 px-6 py-3.5 sticky top-0 z-10">
                <div className="max-w-lg mx-auto flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shrink-0 shadow-sm shadow-violet-300">
                        <span className="text-white text-[11px] font-black tracking-tight">TI</span>
                    </div>
                    <span className="text-slate-700 font-black text-sm tracking-tight">Talent-Inn</span>
                    {source !== 'Direkt' && (
                        <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-violet-400 border border-violet-200 bg-violet-50 rounded-full px-2.5 py-1">
                            {source}
                        </span>
                    )}
                </div>
            </div>

            {/* Hero */}
            <div className="max-w-lg mx-auto px-6 pt-7 pb-4">
                <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-violet-700 to-purple-800 rounded-3xl p-6 text-white shadow-2xl shadow-violet-400/30">
                    {/* Decorative blobs */}
                    <div className="absolute -top-6 -right-6 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                    <div className="absolute -bottom-8 -left-4 w-24 h-24 bg-purple-500/30 rounded-full blur-xl pointer-events-none" />

                    <div className="relative flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0 backdrop-blur-sm">
                            <Briefcase className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-black uppercase tracking-widest text-violet-200 mb-1">Açık Pozisyon</div>
                            <h1 className="text-[22px] font-black leading-tight">{position?.title}</h1>
                            <div className="flex items-center gap-1.5 mt-1.5 text-violet-200">
                                <Building2 size={12} />
                                <span className="text-[12px] font-semibold">{position?.department}</span>
                            </div>
                        </div>
                    </div>
                    {position?.requirements?.length > 0 && (
                        <div className="relative flex flex-wrap gap-1.5 mt-4">
                            {position.requirements.slice(0, 5).map(r => (
                                <span key={r} className="px-2.5 py-1 bg-white/15 border border-white/20 rounded-xl text-[10px] font-bold backdrop-blur-sm">{r}</span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Form */}
            <div className="max-w-lg mx-auto px-6 pb-12">
                <form onSubmit={handleSubmit} className="space-y-4">

                    {/* Personal info */}
                    <div className="bg-white rounded-3xl border border-violet-100/80 shadow-sm shadow-violet-100 p-6 space-y-4">
                        <div className="text-[10px] font-black text-violet-400 uppercase tracking-widest">Kişisel Bilgiler</div>
                        <InputField label="Ad Soyad" icon={User} name="name" required
                            value={form.name} onChange={handleField}
                            placeholder="Adınız ve soyadınız" />
                        <InputField label="E-posta" icon={Mail} name="email" type="email" required
                            value={form.email} onChange={handleField}
                            placeholder="ornek@email.com" />
                        <InputField label="Telefon" icon={Phone} name="phone" type="tel" required
                            value={form.phone} onChange={handleField}
                            placeholder="+90 5XX XXX XX XX" />
                        <InputField label="LinkedIn Profili" icon={Linkedin} name="linkedin" type="url"
                            value={form.linkedin} onChange={handleField}
                            placeholder="linkedin.com/in/kullanici (isteğe bağlı)" />
                    </div>

                    {/* CV Upload */}
                    <div className="bg-white rounded-3xl border border-violet-100/80 shadow-sm shadow-violet-100 p-6">
                        <div className="text-[10px] font-black text-violet-400 uppercase tracking-widest mb-4">
                            CV / Özgeçmiş <span className="text-violet-500">*</span>
                        </div>
                        <div
                            onDragOver={e => e.preventDefault()}
                            onDrop={handleFileDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${cvFile ? 'border-violet-400 bg-violet-50/60' : 'border-violet-200 hover:border-violet-400 hover:bg-violet-50/40'}`}
                        >
                            <input ref={fileInputRef} type="file" accept=".pdf,.docx" className="hidden" onChange={handleFileDrop} />
                            {cvFile ? (
                                <div className="flex flex-col items-center gap-2">
                                    <FileText className="w-8 h-8 text-violet-500" />
                                    <div className="font-bold text-slate-700 text-sm">{cvFile.name}</div>
                                    <div className="text-[11px] text-slate-400">{(cvFile.size / 1024).toFixed(0)} KB</div>
                                    <button type="button" onClick={e => { e.stopPropagation(); setCvFile(null); }}
                                        className="flex items-center gap-1 text-red-400 text-[11px] font-bold hover:text-red-500 mt-1">
                                        <X size={12} /> Kaldır
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-2">
                                    <Upload className="w-8 h-8 text-violet-300" />
                                    <div className="font-bold text-slate-500 text-sm">CV'nizi sürükleyin veya tıklayın</div>
                                    <div className="text-[11px] text-slate-400">PDF veya DOCX • Maks. 10 MB</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* KVKK */}
                    <div className="bg-white rounded-3xl border border-violet-100/80 shadow-sm shadow-violet-100 p-6">
                        <label className="flex gap-3 cursor-pointer select-none">
                            <div className="relative mt-0.5 shrink-0">
                                <input type="checkbox" className="sr-only" checked={kvkk} onChange={e => setKvkk(e.target.checked)} />
                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${kvkk ? 'bg-violet-600 border-violet-600' : 'border-slate-200 bg-white'}`}>
                                    {kvkk && <CheckCircle2 size={12} className="text-white" />}
                                </div>
                            </div>
                            <div>
                                <div className="text-[12px] font-bold text-slate-700 leading-relaxed">
                                    <span className="text-violet-600">KVKK Aydınlatma Metni</span>'ni okudum ve kişisel verilerimin Talent-Inn tarafından işlenmesine onay veriyorum.
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
                        className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-[15px] shadow-lg shadow-violet-300/50 flex items-center justify-center gap-2 transition-all"
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
