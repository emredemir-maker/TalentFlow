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
    const source = detectSource(refParam);

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
                source,
                aiScore: score,
                aiSummary: parsedCandidate?.summary || '',
                status: 'new',
                kvkkConsent: true,
                createdAt: serverTimestamp(),
            };
            if (parsedCandidate) appData.parsedCandidate = parsedCandidate;
            if (scoreBreakdown) appData.aiScoreBreakdown = scoreBreakdown;

            // Save application
            const appRef = await addDoc(collection(db, APPLICATIONS_COLLECTION), appData);

            // Also create a candidate entry so it appears in the HR dashboard
            const candidateData = {
                name: form.name.trim(),
                email: form.email.trim().toLowerCase(),
                phone: form.phone.trim(),
                linkedinUrl: form.linkedin?.trim() || '',
                position: position.title || '',
                company: parsedCandidate?.company || '',
                location: parsedCandidate?.location || '',
                skills: parsedCandidate?.skills || [],
                experience: parsedCandidate?.experience || 0,
                education: parsedCandidate?.education || '',
                summary: parsedCandidate?.summary || '',
                cvText: cvText ? cvText.slice(0, 6000) : '',
                cvFileName: cvFile.name,
                source,
                status: 'new',
                matchScore: score,
                combinedScore: score,
                aiAnalysis: score > 0 ? { score, summary: parsedCandidate?.summary || '' } : null,
                applicationId: appRef.id,
                positionId: position.id,
                appliedDate: new Date().toISOString().split('T')[0],
                interviewSessions: [],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            };
            try {
                await addDoc(collection(db, CANDIDATES_COLLECTION), candidateData);
            } catch (candErr) {
                // Candidate save failing shouldn't block the application confirmation
                console.warn('Candidate creation failed (rules not deployed?):', candErr.message);
            }

            setAiScore(score);
            setStep('success');
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
                            <div className="flex gap-2"><span className="text-slate-300 w-16 shrink-0">Kaynak</span><span className="font-bold text-slate-700">{source}</span></div>
                        </div>
                    </div>
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
                    {source !== 'Direkt' && (
                        <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-slate-400 border border-slate-200 rounded-full px-2.5 py-1">
                            {source}
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
                        <span className="inline-block text-[10px] font-black uppercase tracking-widest text-indigo-300 mb-3">Açık Pozisyon</span>
                        <h1 className="text-[24px] font-black text-white leading-tight mb-1">{position?.title}</h1>
                        <div className="flex items-center gap-1.5 text-indigo-300 mb-4">
                            <Building2 size={12} className="text-indigo-300" />
                            <span className="text-[12px] font-semibold text-indigo-300">{position?.department}</span>
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
