// src/pages/InterviewReportPage.jsx
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCandidates } from '../context/CandidatesContext';
import { usePositions } from '../context/PositionsContext';
import { evaluateInterviewer } from '../services/ai/interview.js';
import { buildInterviewReport, hasCompetencyScores, hasStarScores } from '../utils/interviewReport';
import { splitTranscript } from '../services/ai/transcriptSplitter';
import { getAuth } from 'firebase/auth';
import {
    InterviewNarrative,
    InterviewResultCard,
    RequirementVerdicts,
} from '../components/InterviewReportSections';
// Kullanılmayan ikon adları çıkarıldı. Bunları eslint yakalamıyor:
// no-unused-vars kuralı büyük harfle başlayan adları muaf tutuyor
// (varsIgnorePattern /^[A-Z_]/), ikonların hepsi büyük harfle başlıyor.
import {
    ChevronLeft, ChevronDown, Share2, Download, Search,
    Brain, Star, MessageSquare, Award, Sparkles,
    Loader2, RefreshCw,
} from 'lucide-react';

/**
 * STAR satırları — canlı mülakatın yazdığı `session.starScores`.
 *
 * ÖLÇEK 0-100. Alanı `generateInterviewFinalReport` üretiyor ve şeması açıkça
 * 0-100 diyor. `utils/starDimensions.js`'teki 0-3'lük çapa ölçeği BAŞKA bir
 * ölçüme ait (CV analizinin `starAnalysis` alanı); ikisini aynı cetvelle
 * göstermek 83'ü "83/3" yapardı.
 *
 * Türkçe etiket ham anahtardan türetilmiyor: sayfa lang="tr" ve tarayıcı
 * 'Situation' kelimesini SİTUATİON diye büyütüyor (noktalı İ).
 */
const STAR_ROWS = [
    { key: 'S', label: 'Durum', color: 'var(--color-brand)' },
    { key: 'T', label: 'Görev', color: 'var(--color-brand)' },
    { key: 'A', label: 'Eylem', color: 'var(--color-brand-600)' },
    { key: 'R', label: 'Sonuç', color: 'var(--color-ok)' },
];

/**
 * Yetkinlik satırları.
 *
 * ETİKETLER DÜZELTİLDİ: radar köşelerinde `cultureFit` "Liderlik" diye
 * yazıyordu (öyle bir eksen yok) ve `adaptability` "Uyum" diye — oysa uyum
 * cultureFit'in karşılığı. Köşe etiketleri mutlak konumla yerleştirildiği
 * için hangi sayının hangi eksene ait olduğu da doğrulanamıyordu; çubukta
 * etiket sayının yanında duruyor.
 */
const COMPETENCY_ROWS = [
    { key: 'technical', label: 'Teknik' },
    { key: 'communication', label: 'İletişim' },
    { key: 'problemSolving', label: 'Problem çözme' },
    { key: 'cultureFit', label: 'Kültür uyumu' },
    { key: 'adaptability', label: 'Adaptasyon' },
];

export default function InterviewReportPage() {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const { enrichedCandidates, updateCandidate } = useCandidates();
    const { positions } = usePositions();
    const [activeTab, setActiveTab] = useState('overview'); // overview, transcript
    const [toast, setToast] = useState(null);

    // Find candidate and session - moved up to avoid TDZ for recruiterNotes
    const { candidate, session: mirrored } = useMemo(() => {
        for (const c of enrichedCandidates || []) {
            const s = Number.isInteger(Number(sessionId))
                ? c.interviewSessions?.[Number(sessionId)]
                : c.interviewSessions?.find(s => String(s.id) === String(sessionId));
            if (s) return { candidate: c, session: s };
        }
        return { candidate: null, session: null };
    }, [enrichedCandidates, sessionId]);

    // ASIL KAYIT ADAY BELGESİNDE DEĞİL.
    //
    // Aday belgesindeki `interviewSessions[]` yalnızca bir ÖZET taşıyor:
    // id, tarih, tip, sonuç, skor. Transkript, sorular, cevaplar ve
    // değerlendirme `/interviews/{sessionId}` altında duruyor.
    //
    // Bu sayfa yalnızca özete bakıyordu ve manuel görüşmelerde rapor HEP BOŞ
    // çıkıyordu — kullanıcı transkript girdiği hâlde. Canlı mülakatlarda
    // görünmemesinin sebebi o akışın özete daha çok alan yazması.
    //
    // Transkriptin tamamını aday belgesine kopyalamak çözüm değil: 50 bin
    // karakterlik metin her aday okumasında taşınır ve doküman sınırını
    // zorlar. Rapor açıldığında asıl kaydı okumak doğrusu.
    const [fullRecord, setFullRecord] = useState(null);
    useEffect(() => {
        let alive = true;
        setFullRecord(null);
        if (!sessionId) return undefined;
        (async () => {
            try {
                const { doc, getDoc } = await import('firebase/firestore');
                const { db } = await import('../config/firebase');
                const snap = await getDoc(doc(db, 'interviews', String(sessionId)));
                if (alive && snap.exists()) setFullRecord(snap.data());
            } catch {
                // Kayıt okunamazsa özetle devam edilir; rapor eksik görünür
                // ama sayfa çökmez.
            }
        })();
        return () => { alive = false; };
    }, [sessionId]);

    // Özet ile asıl kayıt birleşiyor. Asıl kayıt üstte: özet eskiyebilir,
    // kanonik olan /interviews altındaki.
    const session = useMemo(
        () => (mirrored || fullRecord ? { ...(mirrored || {}), ...(fullRecord || {}) } : null),
        [mirrored, fullRecord]
    );

    // TRANSKRİPTİN İKİ ŞEKLİ VAR ve karıştırmak sayfayı çökertir.
    //
    // Canlı mülakat rol etiketli bir MESAJ DİZİSİ tutuyor ([{role, text}]).
    // Manuel görüşme ise tek bir METİN — kullanıcının yapıştırdığı hâliyle.
    // Sayfa baştan beri diziyi varsayıyor ve `.find` / `.map` çağırıyor;
    // metin geldiğinde bunlar TypeError fırlatır.
    const transcriptMessages = useMemo(
        () => (Array.isArray(session?.transcript) ? session.transcript : []),
        [session]
    );
    const transcriptText = useMemo(
        () => (typeof session?.transcript === 'string' ? session.transcript : ''),
        [session]
    );
    // Transkript araması. Kutu vardı ama `value`/`onChange`'i yoktu —
    // yazılan hiçbir şey listeye ulaşmıyordu.
    const [transcriptSearch, setTranscriptSearch] = useState('');
    const visibleTranscript = useMemo(() => {
        const q = transcriptSearch.trim().toLocaleLowerCase('tr');
        if (!q) return transcriptMessages;
        return transcriptMessages.filter((m) => String(m?.text || '').toLocaleLowerCase('tr').includes(q));
    }, [transcriptMessages, transcriptSearch]);
    // RAPORUN İÇERİĞİ KAYITTAN GELİR.
    //
    // Bu sayfa canlı mülakat akışı için yazılmıştı ve yalnızca onun yazdığı
    // alanları okuyordu (starScores, aiSummary, finalScore). Manuel görüşme
    // bambaşka alanlar yazıyor: madde damgaları, kanıt oranı, soru gözlemleri.
    // Değerlendirme aynı belgenin içindeydi ve ekranda hiç görünmüyordu.
    const position = useMemo(() => {
        const list = positions || [];
        return (
            list.find((p) => String(p.id) === String(session?.positionId)) ||
            list.find((p) => p.title && p.title === session?.positionTitle) ||
            null
        );
    }, [positions, session]);
    const report = useMemo(() => buildInterviewReport(session, position), [session, position]);

    // YENİDEN DEĞERLENDİRME.
    //
    // Değerlendirme bugüne kadar YALNIZCA kayıt anında yapılıyordu. Cevabı
    // sonradan tamamlamak hiçbir şeyi değiştirmiyordu: rapor kendi kaydını
    // okuyor, kayıtta damga yok, ekran "sayısal sonuç üretilmedi" diyor.
    // Kullanıcının tek çıkışı görüşmeyi baştan girmekti ve canlıda bu döngüye
    // iki kez girildi.
    const [regrading, setRegrading] = useState(false);
    const [regradeNote, setRegradeNote] = useState('');

    const runReevaluate = useCallback(async () => {
        if (!session || regrading) return;
        setRegrading(true);
        setRegradeNote('');
        try {
            let questions = Array.isArray(session.questions) ? session.questions : [];

            // CEVAP BOŞSA ÖNCE ONU DOLDUR. Boş cevaba damga basılamaz; aynı
            // boş kaydı yeniden değerlendirmek parayı iki kez harcayıp aynı
            // sonucu verirdi.
            const empty = questions.filter((q) => !String(q?.answer || '').trim()).length;
            if (empty > 0 && transcriptText.trim()) {
                const out = await splitTranscript(transcriptText, questions);
                questions = out.questions;
                setRegradeNote(`Transkriptten ${out.filled} cevap dolduruldu.`);
            }

            const idToken = await getAuth().currentUser?.getIdToken();
            const res = await fetch('/api/reevaluate-interview', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
                },
                body: JSON.stringify({ sessionId, questions }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Yeniden değerlendirilemedi.');
            // Ekranı kaydın yeni hâliyle tazele — sayfayı yenilemeye gerek yok.
            setFullRecord((prev) => ({ ...(prev || {}), ...data, questions }));
        } catch (err) {
            setRegradeNote(err.message);
        } finally {
            setRegrading(false);
        }
    }, [session, sessionId, transcriptText, regrading]);

    const [recruiterNotes, setRecruiterNotes] = useState('');
    const [finalDecision, setFinalDecision] = useState('');
    const [isSavingNotes, setIsSavingNotes] = useState(false);
    const [isSavingDecision, setIsSavingDecision] = useState(false);
    const [recruiterEval, setRecruiterEval] = useState(null);
    const [evalLoading, setEvalLoading] = useState(false);
    const [evalOpen, setEvalOpen] = useState(false);

    React.useEffect(() => {
        if (session?.recruiterNotes) setRecruiterNotes(session.recruiterNotes);
        if (session?.finalDecision) setFinalDecision(session.finalDecision);
        if (session?.recruiterEval) setRecruiterEval(session.recruiterEval);
    }, [session]);

    // runEvaluateInterviewer must be declared BEFORE the auto-trigger useEffect
    // so that the ref is stable when it appears in the dependency array.
    const runEvaluateInterviewer = useCallback(async () => {
        if (!session || evalLoading) return;
        setEvalLoading(true);
        try {
            const result = await evaluateInterviewer({
                transcript: transcriptMessages.length > 0 ? transcriptMessages : (session.messages || []),
                questions:  (session.questions || []).map(q => q.question || q.text || q),
                positionTitle: session.positionTitle || candidate?.position || '',
            });
            if (result) {
                setRecruiterEval(result);
                setEvalOpen(true);
                // Persist to Firestore inside the session object
                if (candidate) {
                    const updatedSessions = (candidate.interviewSessions || []).map(s =>
                        String(s.id) === String(sessionId) ? { ...s, recruiterEval: result } : s
                    );
                    await updateCandidate(candidate.id, { interviewSessions: updatedSessions });
                }
            }
        } catch (err) {
            console.error('[RecruiterEval]', err);
        } finally {
            setEvalLoading(false);
        }
    }, [session, candidate, sessionId, evalLoading, updateCandidate, transcriptMessages]);

    // Auto-trigger evaluation once per completed session when no saved eval exists yet.
    // Reset the ref whenever sessionId changes so navigating to a different report works correctly.
    const autoEvalFiredRef = useRef(false);
    useEffect(() => {
        autoEvalFiredRef.current = false;
    }, [sessionId]);

    useEffect(() => {
        // Only trigger for sessions that are truly completed, have enough signal (transcript),
        // and haven't been evaluated yet.  All data fields are in deps so the effect retries
        // if transcript/messages arrive after status already changed to 'completed'.
        const isCompleted = session?.status === 'completed';
        const transcriptLen = session?.transcript?.length ?? 0;
        const messagesLen   = session?.messages?.length ?? 0;
        const hasTranscript = transcriptLen > 0 || messagesLen > 0;
        const alreadyDone   = Boolean(session?.recruiterEval);
        if (!session || !isCompleted || !hasTranscript || alreadyDone || autoEvalFiredRef.current) return;
        autoEvalFiredRef.current = true;
        // Small delay to let session data settle after Firestore write on session completion
        const timer = setTimeout(() => runEvaluateInterviewer(), 800);
        return () => clearTimeout(timer);
    }, [session, session?.id, session?.status, session?.transcript, session?.messages, session?.recruiterEval, runEvaluateInterviewer]);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleShare = () => {
        navigator.clipboard.writeText(window.location.href);
        showToast("Rapor bağlantısı panoya kopyalandı!");
    };

    const handleDownload = () => {
        window.print();
    };

    const handleSaveNotes = async () => {
        if (!candidate || !session) return;
        setIsSavingNotes(true);
        try {
            const updatedSessions = (candidate.interviewSessions || []).map(s => 
                String(s.id) === String(sessionId) ? { ...s, recruiterNotes } : s
            );
            await updateCandidate(candidate.id, { interviewSessions: updatedSessions });
            showToast("Değerlendirme notları kaydedildi.");
        } catch (err) {
            showToast("Notlar kaydedilirken bir hata oluştu.", "error");
        } finally {
            setIsSavingNotes(false);
        }
    };

    const handleSaveDecision = async (decision) => {
        if (!candidate || !session) return;
        setFinalDecision(decision);
        setIsSavingDecision(true);
        try {
            const updatedSessions = (candidate.interviewSessions || []).map(s =>
                String(s.id) === String(sessionId) ? { ...s, finalDecision: decision } : s
            );
            await updateCandidate(candidate.id, { interviewSessions: updatedSessions });
            showToast(`Karar kaydedildi: ${decision}`);
        } catch (err) {
            showToast("Karar kaydedilirken bir hata oluştu.", "error");
        } finally {
            setIsSavingDecision(false);
        }
    };


    if (!candidate || !session) {
        return (
            <div className="h-screen bg-slate-50 flex flex-col items-center justify-center">
                <Brain className="w-12 h-12 text-slate-300 animate-pulse mb-4" />
                <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Raporu Yükleniyor...</p>
                <button onClick={() => navigate('/')} className="mt-6 text-blue-600 font-black text-[10px] uppercase">Geri Dön</button>
            </div>
        );
    }

    // Real interview scores — no hardcoded fallbacks to avoid showing CV scores
    const starScores = session.starScores || {};

    const formattedDate = session.date 
        ? new Date(session.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
        : 'Tarih Belirtilmedi';

    return (
        <div className="infoset flex flex-col h-screen bg-n25 overflow-hidden">
            {/* ── Başlık (56px) ──────────────────────────────────────────── */}
            <header className="h-14 shrink-0 bg-n0 border-b border-n200 px-5 flex items-center gap-3 sticky top-0 z-40">
                <button
                    onClick={() => navigate('/')}
                    className="w-7 h-7 rounded-md text-n500 hover:bg-n50 hover:text-n900 flex items-center justify-center"
                    aria-label="Geri"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <div>
                    <h1 className="text-[15px] font-semibold tracking-[-0.02em] m-0">Mülakat Raporu</h1>
                    <span className="text-[11px] text-n400">
                        {candidate.name}
                        {candidate.position || candidate.bestTitle ? ` · ${candidate.position || candidate.bestTitle}` : ''}
                        {` · ${formattedDate}`}
                    </span>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    {report.mode === 'manual' && (
                        <span
                            title="Sistem dışında yapılmış görüşme — canlı transkript yok, değerlendirme girilen soru-cevaptan üretildi."
                            className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-n100 text-n600"
                        >
                            Manuel girildi
                        </span>
                    )}
                    <button
                        onClick={handleShare}
                        className="flex items-center gap-1.5 text-[12px] font-medium text-n600 bg-n50 border border-n200 hover:bg-n100 rounded-md px-[11px] py-[5px]"
                    >
                        <Share2 className="w-[13px] h-[13px]" /> Paylaş
                    </button>
                    <button
                        onClick={handleDownload}
                        className="flex items-center gap-1.5 text-[12px] font-medium text-n600 bg-n0 border border-n200 hover:bg-n50 rounded-md px-[11px] py-[5px]"
                    >
                        <Download className="w-[13px] h-[13px]" /> PDF
                    </button>
                    {finalDecision && (
                        <span className="text-[12px] font-semibold px-[11px] py-[5px] rounded-full bg-brand-50 text-brand">
                            {finalDecision}
                        </span>
                    )}
                </div>
            </header>

            <main className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="max-w-[1240px] mx-auto px-5 py-[18px]">

                    {/* Aday şeridi */}
                    <div className="flex items-center gap-3.5 bg-n0 border border-n200 rounded-[14px] shadow-sm p-3.5 mb-3.5">
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-brand-50 text-brand flex items-center justify-center shrink-0 text-[15px] font-semibold">
                            {candidate.photo || candidate.photoUrl || candidate.profileImage
                                ? <img src={candidate.photo || candidate.photoUrl || candidate.profileImage} alt={candidate.name} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }} />
                                : null}
                            <span className="w-full h-full items-center justify-center" style={{ display: (candidate.photo || candidate.photoUrl || candidate.profileImage) ? 'none' : 'flex' }}>
                                {candidate.name ? candidate.name.trim().split(/\s+/).filter(Boolean).map((p, i, a) => (i === 0 || i === a.length - 1 ? p[0] : '')).join('').toLocaleUpperCase('tr').slice(0, 2) : '?'}
                            </span>
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-[15px] font-semibold tracking-[-0.01em] m-0">{candidate.name}</h2>
                            <span className="text-[11px] text-n400">{candidate.position || candidate.bestTitle || 'Pozisyon atanmadı'}</span>
                        </div>

                        {/* SKOR ROZETLERİ — kayıtta ne varsa o.
                            Eskiden `finalScore` yoksa CV skoru "GENEL" etiketiyle
                            basılıyordu: mülakat raporunda, mülakattan gelmiş gibi.
                            Manuel görüşmede finalScore hiç yazılmıyor. */}
                        <div className="ml-auto flex flex-wrap items-center gap-2 justify-end">
                            {session.finalScore != null && (
                                <span
                                    title="Mülakat skoru (%70) + CV skoru (%30) ağırlıklı ortalaması"
                                    className="text-[12px] font-semibold px-2.5 py-1 rounded-md bg-brand-50 text-brand"
                                >
                                    Genel %{session.finalScore}
                                </span>
                            )}
                            {session.interviewScore != null && (
                                <span
                                    title="Bu mülakata özel skor"
                                    className="text-[12px] font-semibold px-2.5 py-1 rounded-md bg-n50 text-n600 border border-n200"
                                >
                                    Mülakat %{session.interviewScore}
                                </span>
                            )}
                            {report.evidence?.score != null && (
                                <span
                                    title={`Odada sorulan ${report.evidence.asked} maddede çıkan kanıt oranı`}
                                    className="text-[12px] font-semibold px-2.5 py-1 rounded-md bg-n50 text-n600 border border-n200"
                                >
                                    Kanıt %{report.evidence.score}
                                    <span className="text-n400 font-normal"> ({report.evidence.asked} madde)</span>
                                </span>
                            )}
                        </div>
                    </div>

                    {/* TOAST */}
                    {toast && (
                        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100]">
                            <div className="bg-n900 text-white px-4 py-2.5 rounded-md shadow-lg flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5" />
                                <span className="text-[12px] font-medium">{toast.message}</span>
                            </div>
                        </div>
                    )}

                    {/* Sekmeler */}
                    <div className="flex items-center gap-0.5 bg-n50 border border-n200 rounded-md p-0.5 w-fit mb-3.5">
                        {[
                            { id: 'overview', label: 'Genel bakış', icon: Brain },
                            { id: 'transcript', label: 'Transkript', icon: MessageSquare },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-1.5 text-[12px] font-semibold px-[11px] py-[5px] rounded ${
                                    activeTab === tab.id ? 'bg-n0 text-n900 shadow-sm' : 'text-n500 hover:text-n700'
                                }`}
                            >
                                <tab.icon className="w-[13px] h-[13px]" /> {tab.label}
                            </button>
                        ))}
                    </div>

                    {activeTab === 'overview' ? (
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3.5 items-start">

                            {/* ── SOL: değerlendirme ─────────────────────── */}
                            <div className="flex flex-col gap-3.5 min-w-0">
                                {/* SONUÇ — kanıt oranı damgalardan hesaplandı, modelden gelmedi */}
                                <InterviewResultCard
                                    report={report}
                                    onReevaluate={report.mode === 'manual' ? runReevaluate : null}
                                    regrading={regrading}
                                    regradeNote={regradeNote}
                                />

                                {/* GÖZLEMLER — sayı üretmeyen, yalnızca anlatan kısım */}
                                <InterviewNarrative report={report} />

                                {/* MADDE MADDE — adayın kendi sözüyle */}
                                <RequirementVerdicts report={report} />

                                {/* KRİTİK ANLAR — canlı akışın ürettiği alan.
                                    Kayıtta yoksa "kritik an tespit edilemedi" demek
                                    yanlış: tarama YAPILMADI, sonuç boş çıkmadı. */}
                                {(session.criticalMoments || []).length > 0 && (
                                    <section className="bg-n0 border border-n200 rounded-[14px] shadow-sm p-[18px] flex flex-col gap-3.5">
                                        <h3 className="text-[11px] font-semibold text-n500 tracking-[0.1em] uppercase m-0">Kritik anlar</h3>
                                        <div className="flex flex-col gap-3.5">
                                            {session.criticalMoments.map((moment, idx) => (
                                                <div key={idx} className="relative pl-4 border-l border-n200">
                                                    <div className={`absolute -left-[3.5px] top-1.5 w-1.5 h-1.5 rounded-full ${moment.color}`} />
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[11px] text-n400 tabular-nums">{moment.time}</span>
                                                        <span className={`text-[11px] font-semibold px-1.5 rounded text-white ${moment.color}`}>{moment.type}</span>
                                                    </div>
                                                    <p className="text-[12px] text-n700 leading-relaxed mt-1 m-0">{moment.text}</p>
                                                </div>
                                            ))}
                                        </div>
                                        <button
                                            onClick={() => setActiveTab('transcript')}
                                            className="text-[12px] font-medium text-brand text-left"
                                        >
                                            Tüm transkripti görüntüle →
                                        </button>
                                    </section>
                                )}
                            </div>

                            {/* ── SAĞ RAY (320px) ─────────────────────────── */}
                            <div className="flex flex-col gap-3.5 min-w-0">

                                {/* STAR — YALNIZCA canlı mülakatta üretiliyor.
                                    Manuel görüşmede dört boş kutu basıp "analiz
                                    edilmedi" yazmak, ölçülmeyen bir şeyi ölçülmüş
                                    gibi göstermenin yumuşak hâliydi.

                                    ÖLÇEK 0-100'DÜR, 0-3 DEĞİL. Bu alanı
                                    `generateInterviewFinalReport` yazıyor ve şeması
                                    açıkça 0-100 ("S": <0-100>). 0-3'lük çapa ölçeği
                                    (starDimensions.js) CV analizinin `starAnalysis`
                                    alanına ait — başka bir ölçüm. İkisini aynı
                                    cetvelle göstermek 83'ü "83/3" yapardı. */}
                                {hasStarScores(session) && (
                                    <section className="bg-n0 border border-n200 rounded-[14px] shadow-sm p-4">
                                        <div className="flex items-center gap-2.5 mb-0.5">
                                            <Star className="w-[15px] h-[15px] text-brand" />
                                            <h3 className="text-[13px] font-semibold m-0">STAR kanıt analizi</h3>
                                        </div>
                                        <p className="text-[11px] text-n400 mb-3 m-0">Görüşmede bulunan kanıtın yoğunluğu</p>
                                        {STAR_ROWS.map(row => {
                                            const score = session.starScores?.[row.key];
                                            if (!Number.isFinite(Number(score))) return null;
                                            return (
                                                <div key={row.key} className="py-1.5">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-[12px] text-n700">{row.label}</span>
                                                        <span className="text-[12px] font-semibold">
                                                            {score}<span className="text-n400 font-normal">/100</span>
                                                        </span>
                                                    </div>
                                                    <div className="h-[5px] bg-n100 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full"
                                                            style={{ width: `${Math.min(100, Math.max(0, Number(score)))}%`, background: row.color }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </section>
                                )}

                                {/* YETKİNLİK — beş eksenin BEŞİ de yoksa çizilmez.
                                    Eksik eksen NaN köşe üretiyordu: poligon sessizce
                                    kayboluyor, altındaki kutular "0.0 / 10" ve
                                    "undefined/100" yazıyordu.

                                    Radar yerine çubuk: beş eksenli poligonun köşe
                                    etiketleri konumlandırma yüzünden yanlış eksene
                                    denk geliyordu — `cultureFit` "Liderlik" diye
                                    etiketlenmişti. Çubukta etiket sayının yanında. */}
                                {hasCompetencyScores(session) && (
                                    <section className="bg-n0 border border-n200 rounded-[14px] shadow-sm p-4">
                                        <h3 className="text-[13px] font-semibold mb-3 m-0">Yetkinlik analizi</h3>
                                        {COMPETENCY_ROWS.map(row => (
                                            <div key={row.key} className="py-1.5">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[12px] text-n700">{row.label}</span>
                                                    <span className="text-[12px] font-semibold">
                                                        {starScores[row.key]}<span className="text-n400 font-normal">/100</span>
                                                    </span>
                                                </div>
                                                <div className="h-[5px] bg-n100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-brand rounded-full"
                                                        style={{ width: `${Math.min(100, Math.max(0, Number(starScores[row.key]) || 0))}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-n100">
                                            <span className="text-[12px] text-n500 flex-1">Ortalama</span>
                                            <span className="text-[13px] font-semibold text-brand tabular-nums">
                                                %{Math.round(COMPETENCY_ROWS.reduce((sum, r) => sum + (Number(starScores[r.key]) || 0), 0) / COMPETENCY_ROWS.length)}
                                            </span>
                                        </div>
                                    </section>
                                )}

                                {/* KARAR */}
                                <section className="bg-n0 border border-n200 rounded-[14px] shadow-sm p-4 flex flex-col gap-3">
                                    <h3 className="text-[11px] font-semibold text-n500 tracking-[0.08em] uppercase m-0">Karar</h3>

                                    <div>
                                        <textarea
                                            value={recruiterNotes}
                                            onChange={(e) => setRecruiterNotes(e.target.value)}
                                            rows={4}
                                            className="w-full bg-n50 border border-n200 rounded-md p-2.5 text-[12px] text-n800 leading-relaxed focus:outline-none focus:border-brand resize-none placeholder:text-n400"
                                            placeholder="Kararınızı ve gerekçesini yazın…"
                                        />
                                        <button
                                            onClick={handleSaveNotes}
                                            disabled={isSavingNotes}
                                            className="mt-2 text-[12px] font-medium text-n600 bg-n50 border border-n200 hover:bg-n100 rounded-md px-2.5 py-[5px] disabled:opacity-50"
                                        >
                                            {isSavingNotes ? 'Kaydediliyor…' : 'Notu kaydet'}
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { label: 'İşe Al', value: 'İşe Al', bg: 'var(--color-ok)' },
                                            { label: 'Beklemede', value: 'Beklemede', bg: 'var(--color-warn)' },
                                            { label: 'Uygun Değil', value: 'Uygun Değil', bg: 'var(--color-bad)' },
                                        ].map(opt => {
                                            const on = finalDecision === opt.value;
                                            return (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => handleSaveDecision(opt.value)}
                                                    disabled={isSavingDecision}
                                                    className={`text-[12px] font-semibold rounded-md py-2 border disabled:opacity-50 ${
                                                        on ? 'text-white border-transparent' : 'bg-n0 text-n600 border-n200 hover:bg-n50'
                                                    }`}
                                                    style={on ? { background: opt.bg } : undefined}
                                                >
                                                    {opt.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {finalDecision && (
                                        <p className="text-[11px] text-n400 text-center m-0">
                                            Mevcut karar: <span className="text-n700 font-semibold">{finalDecision}</span>
                                        </p>
                                    )}
                                </section>

                                {/* MÜLAKATÇI DEĞERLENDİRMESİ */}
                                <section className="bg-n0 border border-n200 rounded-[14px] shadow-sm p-4 flex flex-col gap-3">
                                    <div className="flex items-center gap-2">
                                        <Award className="w-[15px] h-[15px] text-brand" />
                                        <h3 className="text-[13px] font-semibold m-0">Mülakatçı değerlendirmesi</h3>
                                        <button
                                            onClick={runEvaluateInterviewer}
                                            disabled={evalLoading}
                                            className="ml-auto flex items-center gap-1.5 text-[12px] font-medium text-n600 bg-n50 border border-n200 hover:bg-n100 rounded-md px-2.5 py-[5px] disabled:opacity-50"
                                        >
                                            {evalLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                            {recruiterEval ? 'Yenile' : 'Analiz et'}
                                        </button>
                                    </div>
                                    {evalLoading && (
                                        <p className="text-[12px] text-n500 m-0">Mülakatçı performansı analiz ediliyor…</p>
                                    )}
                                    {!evalLoading && !recruiterEval && (
                                        <p className="text-[12px] text-n400 leading-relaxed m-0">
                                            "Analiz et" ile bu görüşmenin mülakatçı performans değerlendirmesini üretin.
                                        </p>
                                    )}
                                    {!evalLoading && recruiterEval && (
                                        <div className="flex flex-col gap-3">
                                            <div className="flex items-start gap-2.5 bg-n50 rounded-md p-2.5">
                                                <span className="text-[15px] font-semibold text-brand shrink-0">
                                                    {recruiterEval.overallScore}<span className="text-n400 text-[12px] font-normal">/5</span>
                                                </span>
                                                <p className="text-[12px] text-n700 leading-relaxed flex-1 m-0">{recruiterEval.summary}</p>
                                            </div>
                                            <button
                                                onClick={() => setEvalOpen(v => !v)}
                                                className="flex items-center justify-between text-[11px] font-semibold text-n500 tracking-[0.08em] uppercase hover:text-n700"
                                            >
                                                Boyut puanları
                                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${evalOpen ? 'rotate-180' : ''}`} />
                                            </button>
                                            {evalOpen && (
                                                <div className="flex flex-col gap-3">
                                                    {(recruiterEval.dimensions || []).map(dim => (
                                                        <div key={dim.key}>
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="text-[12px] font-semibold text-n700">{dim.label}</span>
                                                                <span className="flex items-center gap-1">
                                                                    {[1, 2, 3, 4, 5].map(n => (
                                                                        <span key={n} className={`w-2 h-2 rounded-full ${n <= dim.score ? 'bg-brand' : 'bg-n200'}`} />
                                                                    ))}
                                                                    <span className="text-[11px] font-semibold text-n500 ml-1">{dim.score}/5</span>
                                                                </span>
                                                            </div>
                                                            <p className="text-[12px] text-n600 leading-relaxed m-0">{dim.explanation}</p>
                                                            {dim.tip && (
                                                                <p className="text-[12px] text-brand leading-relaxed border-l-2 border-brand-100 pl-2 mt-1 m-0">{dim.tip}</p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </section>
                            </div>
                        </div>
                    ) : (
                        /* ── TRANSKRİPT ─────────────────────────────────── */
                        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-3.5 items-start">

                            <div className="flex flex-col gap-3.5 min-w-0">
                                <section className="bg-n0 border border-n200 rounded-[14px] shadow-sm p-4">
                                    <h3 className="text-[11px] font-semibold text-n500 tracking-[0.08em] uppercase mb-2.5 m-0">Oturum bilgileri</h3>
                                    {/* YALNIZCA KAYITTA OLAN ALANLAR.
                                        Eskiden dil alanı boşsa "Türkçe" yazıyordu ve
                                        süre boşsa "N/A" basılıyordu — biri hiç
                                        yapılmamış bir tespiti sonuç gibi gösteriyor,
                                        diğeri boş satır üretiyordu. */}
                                    {[
                                        { label: 'Tür', value: report.mode === 'manual' ? 'Manuel görüşme' : 'Canlı mülakat' },
                                        { label: 'Tarih', value: session.date ? formattedDate : null },
                                        { label: 'Süre', value: session.duration || null },
                                        { label: 'Dil', value: session.language || null },
                                    ].filter(item => item.value).map(item => (
                                        <div key={item.label} className="flex items-center justify-between py-1">
                                            <span className="text-[12px] text-n500">{item.label}</span>
                                            <span className="text-[12px] font-semibold text-n800">{item.value}</span>
                                        </div>
                                    ))}
                                </section>

                                {/* ANAHTAR KELİMELER — yalnızca kayıtta varsa.
                                    Eskiden yoksa adayın CV becerilerine düşüyordu:
                                    transkriptten çıkmamış kelimeler transkriptin
                                    anahtar kelimesi gibi görünüyordu. İkisi de yoksa
                                    'Yorumlanıyor...' diye hiç bitmeyen bir etiket
                                    basılıyordu. */}
                                {(session.keywords || []).length > 0 && (
                                    <section className="bg-n0 border border-n200 rounded-[14px] shadow-sm p-4">
                                        <h3 className="text-[11px] font-semibold text-n500 tracking-[0.08em] uppercase mb-2.5 m-0">Anahtar kelimeler</h3>
                                        <div className="flex flex-wrap gap-1.5">
                                            {session.keywords.map(tag => (
                                                <span key={tag} className="text-[11px] font-medium text-n600 bg-n50 border border-n200 rounded-full px-2 py-0.5">{tag}</span>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {/* BURADA BİR "DUYGU ANALİZİ" KARTI VARDI ve tamamen
                                    uydurmaydı: yükseklikleri koda gömülü yedi çubuk
                                    ve her mülakatta aynı cümle. Kaldırıldı. */}
                            </div>

                            <div className="flex flex-col gap-3.5 min-w-0">
                                <section className="bg-n0 border border-n200 rounded-[14px] shadow-sm p-[18px] flex flex-col h-[640px]">
                                    <div className="flex items-center gap-2 mb-3">
                                        <h3 className="text-[13px] font-semibold m-0">Tam transkript</h3>
                                        <button
                                            onClick={handleDownload}
                                            className="ml-auto flex items-center gap-1.5 text-[12px] font-medium text-n600 bg-n50 border border-n200 hover:bg-n100 rounded-md px-2.5 py-[5px]"
                                        >
                                            <Download className="w-3 h-3" /> PDF
                                        </button>
                                    </div>

                                    {/* Arama kutusu dekoratifti (value/onChange yoktu).
                                        Artık gerçekten süzüyor. */}
                                    <div className="relative mb-3">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-n400 pointer-events-none" />
                                        <input
                                            type="text"
                                            value={transcriptSearch}
                                            onChange={(e) => setTranscriptSearch(e.target.value)}
                                            placeholder="Transkript içinde ara…"
                                            className="w-full bg-n50 border border-n200 rounded-md pl-8 pr-3 py-2 text-[12px] focus:outline-none focus:border-brand"
                                        />
                                    </div>

                                    <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2.5 pr-1">
                                        {transcriptMessages.length === 0 && transcriptText ? (
                                            /* Manuel görüşme: rol etiketi yok, kullanıcının
                                               yapıştırdığı metin olduğu gibi gösteriliyor.
                                               Uydurma bir rol ataması yapmıyoruz. */
                                            <div className="bg-n50 border border-n200 rounded-md p-3.5 text-[13px] leading-relaxed text-n800 whitespace-pre-wrap">
                                                {transcriptText}
                                            </div>
                                        ) : visibleTranscript.length > 0 ? (
                                            visibleTranscript.map((msg, i) => {
                                                const isCandidate = msg.role === 'ADAY';
                                                return (
                                                    <div
                                                        key={i}
                                                        className={`rounded-md border px-3 py-2 ${
                                                            isCandidate ? 'bg-brand-50 border-brand-100' : 'bg-n50 border-n200 ml-8'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between mb-0.5">
                                                            <span className={`text-[11px] font-semibold tracking-[0.08em] uppercase ${isCandidate ? 'text-brand' : 'text-n400'}`}>
                                                                {msg.role}
                                                            </span>
                                                            {msg.time && <span className="text-[11px] text-n400 tabular-nums">{msg.time}</span>}
                                                        </div>
                                                        <p className="text-[13px] leading-relaxed text-n700 m-0">{msg.text}</p>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="flex-1 flex flex-col items-center justify-center text-center">
                                                <MessageSquare className="w-6 h-6 text-n300 mb-2" />
                                                <p className="text-[12px] text-n400 m-0">
                                                    {transcriptSearch && transcriptMessages.length > 0
                                                        ? 'Aramaya uyan satır yok.'
                                                        : 'Diyalog verisi bulunamadı.'}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                {/* ÖZET yalnızca kayıtta varsa. Eskiden yoksa
                                    "Adayın performansı ve cevapları gerçek zamanlı
                                    analiz edildi." yazıyordu — yapılmamış bir analizi
                                    yapılmış gibi gösteren sabit bir cümle. */}
                                {session.aiSummary && (
                                    <section className="bg-brand-50 border border-brand-100 rounded-[14px] p-4">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <Sparkles className="w-3.5 h-3.5 text-brand" />
                                            <h3 className="text-[11px] font-semibold text-brand tracking-[0.08em] uppercase m-0">Özet</h3>
                                        </div>
                                        <p className="text-[13px] text-n700 leading-relaxed m-0">{session.aiSummary}</p>
                                    </section>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
