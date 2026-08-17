// src/components/AddManualInterviewModal.jsx
//
// Manuel görüşme girişi modal'ı.
//
// Akış:
//   1. Aday seç (mevcut candidates listesinden, search'lü)
//   2. Pozisyon otomatik adaydan gelir (override edilebilir)
//   3. Görüşme metadata: tip / tarih / saat / süre / görüşmeci
//   4. Sorular ve Cevaplar — iki kaynaktan biriyle önceden dolar:
//        a) Adayın MÜLAKAT PLANI (varsa ve güncel gereksinim listesine aitse).
//           Bu sorular taramada açık kalmış maddelerden çıkarıldı ve her biri
//           `requirementIndex` taşır — cevap o gereksinime bağlanabilir.
//        b) Pozisyonun screeningQuestions'ı — jenerik, herkese aynı.
//      Recruiter ekleyebilir/silebilir; AI öneri butonu
//      mevcut /api/suggest-screening-questions endpoint'ini kullanır
//   5. Opsiyonel: transcript dump + recruiter notları
//   6. Outcome: olumlu / olumsuz / beklemede
//   7. Submit → /api/create-manual-interview (sync, ~5-15s AI eval dahil)
//   8. Sonuç ekranı: AI skor + aggregate + summary + outcome önerisi
//
// Davranış: kayıt başarılı olduğunda parent'a `onCreated(sessionId)`
// callback'i bildirim için çağrılır. Modal kapanır sadece kullanıcı
// "Kapat"a basınca (sonuç ekranını incelemek için).
import { useEffect, useMemo, useState } from 'react';
import { getAuth } from 'firebase/auth';
import { savedPlanFor, planStatus, PLAN_STATUS_TEXT } from '../utils/interviewPlan';
import { extractSalaryFromTranscript } from '../services/ai/salaryExtractor';
import { normalizeBand, formatBand, CURRENCIES, CURRENCY_LABEL, PERIODS, PERIOD_LABEL, BASES, BASIS_LABEL } from '../utils/salaryBand';
import { NO_SCORE_TEXT } from '../utils/interviewReport';
import { splitTranscript } from '../services/ai/transcriptSplitter';
import {
    AlertCircle,
    CheckCircle2,
    Clock,
    Loader2,
    Phone,
    Plus,
    Search,
    Sparkles,
    Trash2,
    Users,
    Video,
    X,
} from 'lucide-react';

// Backend'le aynı listeyi tutuyoruz — değişiklik olursa iki yer de güncellenmeli
const INTERVIEW_TYPES = [
    { id: 'phone', label: 'Telefon', icon: Phone },
    { id: 'in-person', label: 'Yüz Yüze', icon: Users },
    { id: 'teams', label: 'Microsoft Teams', icon: Video },
    { id: 'zoom', label: 'Zoom', icon: Video },
    { id: 'meet', label: 'Google Meet', icon: Video },
    { id: 'other', label: 'Diğer', icon: Clock },
];

const OUTCOME_OPTIONS = [
    { id: 'positive', label: '✅ Olumlu', color: '#10B981' },
    { id: 'negative', label: '❌ Olumsuz', color: '#EF4444' },
    { id: 'pending', label: '⏳ Beklemede', color: '#F59E0B' },
];

function todayIsoDate() {
    const d = new Date();
    const fmt = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${fmt(d.getMonth() + 1)}-${fmt(d.getDate())}`;
}

export default function AddManualInterviewModal({
    open,
    onClose,
    onCreated,
    candidates = [],
    positions = [],
    currentUser,
}) {
    // ── Form state
    const [step, setStep] = useState('form'); // form | submitting | result | error
    const [searchTerm, setSearchTerm] = useState('');
    const [candidateId, setCandidateId] = useState('');
    const [positionId, setPositionId] = useState('');
    const [interviewType, setInterviewType] = useState('phone');
    const [date, setDate] = useState(todayIsoDate());
    const [time, setTime] = useState('14:00');
    const [durationMinutes, setDurationMinutes] = useState(45);
    const [interviewerName, setInterviewerName] = useState(
        currentUser?.displayName || currentUser?.email || ''
    );
    const [questions, setQuestions] = useState([{ question: '', answer: '' }]);
    const [transcript, setTranscript] = useState('');
    const [notes, setNotes] = useState('');
    const [recruiterOutcome, setRecruiterOutcome] = useState('pending');
    // ADAYIN MAAŞ BEKLENTİSİ — odada duyulan rakam. En güvenilir kaynak bu:
    // sayıyı siz duydunuz, kimse yorumlamadı. Boş bırakılabilir; boş beklentiyi
    // sıfır sanmak, sorulmamış bir soruyu cevaplanmış göstermek olurdu.
    const [salaryMin, setSalaryMin] = useState('');
    const [salaryMax, setSalaryMax] = useState('');
    const [salaryCurrency, setSalaryCurrency] = useState('TRY');
    const [salaryPeriod, setSalaryPeriod] = useState('monthly');
    // BAZIN VARSAYILANI YOK. Aday "net" ya da "brüt" demediyse boş kalır ve
    // karşılaştırmaya girmez; varsaymak %30-40'lık hatayı makul görünen bir
    // sayının içine gömmek olurdu.
    const [salaryBasis, setSalaryBasis] = useState('');

    const [aiSuggesting, setAiSuggesting] = useState(false);
    const [splitting, setSplitting] = useState(false);
    // Transkriptten çıkarılan maaş ÖNERİSİ. Doğrudan alanlara yazılmaz:
    // alıntısıyla gösterilir ve ancak kullanıcı kabul ederse alanlara geçer.
    // Yanlış okunmuş bir para rakamı bu zincirin sonunda bütçe kararına
    // dönüşüyor; onaysız kabul en pahalı hata olurdu.
    const [salaryHint, setSalaryHint] = useState(null);
    const [salaryHintState, setSalaryHintState] = useState('idle'); // idle|busy|none|error
    const [splitNote, setSplitNote] = useState('');
    const [submitError, setSubmitError] = useState('');
    const [createdResult, setCreatedResult] = useState(null);

    // Reset state every time the modal is opened — prevents stale data on re-open
    useEffect(() => {
        if (open) {
            setStep('form');
            setSubmitError('');
            setCreatedResult(null);
        }
    }, [open]);

    // Auto-fill position when candidate is picked
    const selectedCandidate = useMemo(
        () => candidates.find((c) => c.id === candidateId),
        [candidates, candidateId]
    );
    const selectedPosition = useMemo(
        () => positions.find((p) => p.id === positionId),
        [positions, positionId]
    );

    useEffect(() => {
        if (!candidateId) return;
        const cand = candidates.find((c) => c.id === candidateId);
        if (!cand) return;
        // Pre-fill position from candidate.positionId or candidate.position name
        if (cand.positionId && positions.find((p) => p.id === cand.positionId)) {
            setPositionId(cand.positionId);
        }
    }, [candidateId, candidates, positions]);

    // Soru listesini önceden doldur — iki kaynak, biri diğerinden çok üstün.
    //
    //   1. MÜLAKAT PLANI (varsa): adayın taramasında açık kalan maddelerden
    //      çıkarılmış sorular. Her soru hangi gereksinimi kapattığını taşır
    //      (`requirementIndex`), yani cevap geldiğinde o maddeye bağlanabilir.
    //   2. Pozisyonun ön eleme soruları: aynı ilana başvuran herkes için aynı.
    //
    // Plan yalnızca GÜNCEL gereksinim listesine aitse kullanılır — savedPlanFor
    // parmak izini kontrol eder. Eski bir planın soruları, artık var olmayan
    // maddeleri sorar ve cevaplar yanlış maddeye yazılırdı.
    //
    // Yazılmış içeriğin üzerine hiçbir koşulda yazılmaz.
    useEffect(() => {
        if (!positionId) return;
        const pos = positions.find((p) => p.id === positionId);
        const cand = candidates.find((c) => c.id === candidateId);
        const hasContent = questions.some((q) => q.question.trim() || q.answer.trim());
        if (hasContent) return;

        const plan = savedPlanFor(cand, pos);
        if (plan) {
            setQuestions(
                plan.probes.map((p) => ({
                    question: p.question || p.text,
                    answer: '',
                    requirementIndex: p.requirementIndex,
                    listenFor: p.listenFor || '',
                    must: Boolean(p.must),
                }))
            );
            return;
        }

        const screening = (pos?.screeningQuestions || []).filter(
            (q) => typeof q === 'string' && q.trim()
        );
        if (screening.length === 0) return;
        setQuestions(screening.map((q) => ({ question: q, answer: '' })));
    }, [positionId, candidateId, positions, candidates]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sorular plandan mı geldi? SAKLANMIYOR, türetiliyor.
    //
    // Ayrı bir bayrak tutmuştum ve bayatlıyordu: modal kapanıp başka bir adayla
    // açıldığında, yeni adayın ne planı ne de ön eleme sorusu varsa doldurma
    // etkisi erken dönüyor ve bayrak önceki adaydan kalıyordu — ekran jenerik
    // sorulara "plandan geldi" diyordu. Gereksinim bağı zaten soruların
    // içinde; ikinci bir yerde tutmak onu yanlış olabilecek hâle getiriyor.
    const planLoaded = questions.some((q) => Number.isFinite(Number(q.requirementIndex)));

    // KAYDETMEDEN ÖNCE UYAR.
    //
    // Canlıda oldu: kullanıcı görüşmeyi kaydetti, AI çağrıları yapıldı, para
    // gitti ve ancak SONUNDA "sorular ilanın maddelerine bağlı değil" yazısını
    // gördü. Üstelik hangi sebeple bağlı olmadığı da yazmıyordu.
    //
    // Dört durum var ve dördü de farklı bir eylem gerektiriyor; hangisi
    // olduğunu şimdi söylüyoruz.
    const planState = useMemo(
        () => planStatus(
            candidates.find((c) => c.id === candidateId),
            positions.find((p) => p.id === positionId)
        ),
        [candidates, candidateId, positions, positionId]
    );
    // Aday seçilmeden uyarı göstermek anlamsız; henüz form doldurulmuyor.
    const planWarning = candidateId && !planLoaded ? PLAN_STATUS_TEXT[planState.reason] : '';

    // PLAN VAR AMA CEVAPLAR BOŞ — bu da ölçümü engelliyor ve uyarısı yoktu.
    //
    // Canlıda oldu: kullanıcı plandan soruları üretti, sorular modalda
    // göründü, transkripti yapıştırdı ve kaydetti. Sonuç: "sayısal sonuç
    // üretilmedi — sorular ilanın maddelerine bağlı değil". Oysa bağlıydı;
    // eksik olan cevaptı. Sunucu cevapsız soruyu değerlendirmeye almıyor
    // (boş cevaba damga basmak token harcamaktan başka bir şey yapmaz) ve
    // ekran yanlış sebebi yazıyordu.
    //
    // Transkripti kutuya yapıştırmak YETMİYOR: ölçüm soru bazında yapılıyor,
    // cevapların kutulara dağıtılması gerekiyor.
    const linkedUnanswered = questions.filter(
        (q) => Number.isFinite(Number(q.requirementIndex)) && !String(q.answer || '').trim()
    ).length;
    const answerWarning = planLoaded && linkedUnanswered > 0;

    // ── Derived: filtered candidate list for the search dropdown
    const filteredCandidates = useMemo(() => {
        const q = searchTerm.toLowerCase().trim();
        if (!q) return candidates.slice(0, 10);
        return candidates
            .filter(
                (c) =>
                    c.name?.toLowerCase().includes(q) ||
                    c.email?.toLowerCase().includes(q) ||
                    c.position?.toLowerCase().includes(q)
            )
            .slice(0, 10);
    }, [candidates, searchTerm]);

    // ── Question list helpers
    const updateQuestion = (idx, field, value) => {
        setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, [field]: value } : q)));
    };
    const addQuestion = () => setQuestions((prev) => [...prev, { question: '', answer: '' }]);
    const removeQuestion = (idx) =>
        setQuestions((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

    // ── Transkripti sorulara dağıt
    //
    // Model YALNIZCA ayırıyor: hangi bölüm hangi soruya ait. Damga, puan ve
    // yorum başka çağrıların işi.
    //
    // SONUÇ DOĞRUDAN KAYDEDİLMEZ. Kutular doldurulur, kullanıcı okur ve
    // düzeltir; kaydetme yine onun eylemi. Bir AI çıkarımını insan onayından
    // geçirmeden değerlendirmeye sokmak, adayın söylemediği bir şeyi ona mal
    // etme riski taşır.
    const handleSplitTranscript = async () => {
        if (!transcript.trim()) {
            setSubmitError('Önce transkripti yapıştırın.');
            return;
        }
        const asked = questions.filter((q) => q.question.trim());
        if (asked.length === 0) {
            setSubmitError('Önce soruların yüklenmesi gerekiyor — adayı ve pozisyonu seçin.');
            return;
        }
        setSubmitError('');
        setSplitNote('');
        setSplitting(true);
        try {
            const out = await splitTranscript(transcript, questions);
            setQuestions(out.questions);
            setSplitNote(
                out.filled === 0
                    ? 'Transkriptte bu soruların cevabı bulunamadı — cevapları elle girebilirsiniz.'
                    : `${out.filled} soru dolduruldu${out.empty > 0 ? `, ${out.empty} soru boş kaldı` : ''}. `
                      + 'Kaydetmeden önce okuyup düzeltin.'
            );
        } catch (err) {
            setSubmitError(err.message);
        } finally {
            setSplitting(false);
        }
    };

    // ── AI question suggestions (reuses existing backend endpoint)
    const handleAiSuggest = async () => {
        if (!selectedPosition?.title) {
            setSubmitError('Önce bir pozisyon seç ki AI öneri verebilsin.');
            return;
        }
        setSubmitError('');
        setAiSuggesting(true);
        try {
            const idToken = await getAuth().currentUser?.getIdToken();
            const res = await fetch('/api/suggest-screening-questions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
                },
                body: JSON.stringify({
                    positionTitle: selectedPosition.title,
                    requirements: (selectedPosition.requirements || []).join(', '),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'AI önerisi alınamadı');
            const suggested = (data.questions || []).filter((q) => q && q.trim());
            if (suggested.length === 0) {
                setSubmitError('AI öneri üretemedi.');
                return;
            }
            // Append to existing list (don't clobber what recruiter already typed)
            setQuestions((prev) => {
                const existingTexts = new Set(prev.map((q) => q.question.trim()));
                const newOnes = suggested
                    .filter((q) => !existingTexts.has(q.trim()))
                    .map((q) => ({ question: q, answer: '' }));
                // Drop trailing empty rows so newly-added ones aren't behind blanks
                const trimmedPrev = prev.filter((q) => q.question.trim() || q.answer.trim());
                return [...trimmedPrev, ...newOnes];
            });
        } catch (err) {
            setSubmitError(err.message);
        } finally {
            setAiSuggesting(false);
        }
    };

    // ── Submit
    const isFormValid =
        candidateId &&
        date &&
        interviewType &&
        (questions.some((q) => q.question.trim() && q.answer.trim()) ||
            transcript.trim() ||
            notes.trim());

    /** Transkriptten maaş beklentisi ARA — bulursa öner, kaydetme. */
    const findSalaryInTranscript = async () => {
        setSalaryHintState('busy');
        setSalaryHint(null);
        try {
            const hint = await extractSalaryFromTranscript(transcript);
            setSalaryHint(hint);
            // Bulamamak bir HATA DEĞİL: çoğu görüşmede maaş konuşulmaz.
            setSalaryHintState(hint ? 'idle' : 'none');
        } catch {
            setSalaryHintState('error');
        }
    };

    /** Öneriyi alanlara geçir — bu, KULLANICI eylemidir. */
    const acceptSalaryHint = () => {
        if (!salaryHint) return;
        setSalaryMin(String(salaryHint.min ?? ''));
        setSalaryMax(String(salaryHint.max ?? salaryHint.min ?? ''));
        setSalaryCurrency(salaryHint.currency);
        setSalaryPeriod(salaryHint.period);
        setSalaryBasis(salaryHint.basis || '');
        setSalaryHint(null);
        setSalaryHintState('idle');
    };

    const handleSubmit = async () => {
        if (!isFormValid) {
            setSubmitError(
                'Aday, tarih, görüşme tipi zorunlu. Ek olarak en az bir soru-cevap, transcript veya not girilmeli.'
            );
            return;
        }
        setSubmitError('');
        setStep('submitting');
        try {
            const idToken = await getAuth().currentUser?.getIdToken();
            const cand = candidates.find((c) => c.id === candidateId);
            const pos = positions.find((p) => p.id === positionId);
            const res = await fetch('/api/create-manual-interview', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
                },
                body: JSON.stringify({
                    candidateId,
                    candidateName: cand?.name || '',
                    positionId: positionId || null,
                    positionTitle: pos?.title || cand?.position || null,
                    interviewerName,
                    date,
                    time,
                    durationMinutes: Number(durationMinutes) || null,
                    interviewType,
                    // requirementIndex plandan gelen sorularda dolu: cevabın
                    // HANGİ gereksinime dair olduğunu kayda geçirir. Bu bağ
                    // olmadan mülakat skoru CV skoruyla kıyaslanamaz — yalnızca
                    // havada duran bir 0-100 olur.
                    questions: questions
                        .filter((q) => q.question.trim() || q.answer.trim())
                        .map((q) => ({
                            question: q.question,
                            answer: q.answer,
                            ...(Number.isFinite(Number(q.requirementIndex))
                                ? { requirementIndex: Number(q.requirementIndex) }
                                : {}),
                        })),
                    transcript,
                    notes,
                    recruiterOutcome,
                    candidateSalary: normalizeBand({
                        min: salaryMin, max: salaryMax,
                        currency: salaryCurrency, period: salaryPeriod, basis: salaryBasis,
                    }),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Görüşme kaydedilemedi.');
            setCreatedResult(data);
            setStep('result');
            if (typeof onCreated === 'function') onCreated(data.sessionId);
        } catch (err) {
            setSubmitError(err.message);
            setStep('error');
        }
    };

    if (!open) return null;

    // ── Render
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-8 py-5 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-blue-50">
                    <div>
                        <h2 className="text-xl font-black text-slate-900 tracking-tight">
                            Manuel Görüşme Ekle
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Sistem dışında yapılmış görüşmeyi kaydet — AI değerlendirmesi
                            otomatik çalışır.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
                        aria-label="Kapat"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body — switches by step */}
                <div className="flex-1 overflow-y-auto">
                    {step === 'submitting' && (
                        <div className="p-12 flex flex-col items-center justify-center text-center">
                            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
                            <h3 className="text-lg font-bold text-slate-800 mb-1">
                                AI değerlendirme çalışıyor
                            </h3>
                            <p className="text-sm text-slate-500 max-w-sm">
                                Sorular puanlanıyor, özet üretiliyor. Bu işlem yaklaşık
                                10-15 saniye sürer.
                            </p>
                        </div>
                    )}

                    {step === 'result' && createdResult && (
                        <ResultPanel
                            result={createdResult}
                            onClose={onClose}
                        />
                    )}

                    {step === 'error' && (
                        <div className="p-12 flex flex-col items-center justify-center text-center">
                            <AlertCircle className="w-10 h-10 text-red-500 mb-4" />
                            <h3 className="text-lg font-bold text-slate-800 mb-1">
                                Görüşme kaydedilemedi
                            </h3>
                            <p className="text-sm text-slate-500 mb-4">{submitError}</p>
                            <button
                                onClick={() => setStep('form')}
                                className="px-5 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition"
                            >
                                Geri Dön
                            </button>
                        </div>
                    )}

                    {step === 'form' && (
                        <FormBody
                            // candidate
                            searchTerm={searchTerm}
                            setSearchTerm={setSearchTerm}
                            filteredCandidates={filteredCandidates}
                            candidateId={candidateId}
                            setCandidateId={setCandidateId}
                            selectedCandidate={selectedCandidate}
                            // position
                            positions={positions}
                            positionId={positionId}
                            setPositionId={setPositionId}
                            selectedPosition={selectedPosition}
                            // maaş beklentisi
                            salaryHint={salaryHint} salaryHintState={salaryHintState}
                            onFindSalary={findSalaryInTranscript} onAcceptSalary={acceptSalaryHint}
                            transcriptFilled={Boolean(transcript.trim())}
                            salaryMin={salaryMin} setSalaryMin={setSalaryMin}
                            salaryMax={salaryMax} setSalaryMax={setSalaryMax}
                            salaryCurrency={salaryCurrency} setSalaryCurrency={setSalaryCurrency}
                            salaryBasis={salaryBasis} setSalaryBasis={setSalaryBasis}
                            salaryPeriod={salaryPeriod} setSalaryPeriod={setSalaryPeriod}
                            // metadata
                            interviewType={interviewType}
                            setInterviewType={setInterviewType}
                            date={date}
                            setDate={setDate}
                            time={time}
                            setTime={setTime}
                            durationMinutes={durationMinutes}
                            setDurationMinutes={setDurationMinutes}
                            interviewerName={interviewerName}
                            setInterviewerName={setInterviewerName}
                            // questions
                            questions={questions}
                            updateQuestion={updateQuestion}
                            addQuestion={addQuestion}
                            removeQuestion={removeQuestion}
                            handleAiSuggest={handleAiSuggest}
                            aiSuggesting={aiSuggesting}
                            planLoaded={planLoaded}
                            planWarning={planWarning}
                            answerWarning={answerWarning}
                            linkedUnanswered={linkedUnanswered}
                            handleSplitTranscript={handleSplitTranscript}
                            splitting={splitting}
                            splitNote={splitNote}
                            // free-text
                            transcript={transcript}
                            setTranscript={setTranscript}
                            notes={notes}
                            setNotes={setNotes}
                            // outcome
                            recruiterOutcome={recruiterOutcome}
                            setRecruiterOutcome={setRecruiterOutcome}
                            // error
                            submitError={submitError}
                        />
                    )}
                </div>

                {/* Footer — only on form step */}
                {step === 'form' && (
                    <div className="px-8 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
                        <div className="text-xs text-slate-500">
                            {!isFormValid ? (
                                <span className="text-amber-600">
                                    ⚠️ Aday + tarih + görüşme tipi zorunlu, ayrıca en az
                                    bir içerik (soru, transcript, not) girilmeli.
                                </span>
                            ) : (
                                <span>✓ Form geçerli — kaydedilebilir.</span>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={onClose}
                                className="px-5 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-200 transition"
                            >
                                İptal
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={!isFormValid}
                                className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <Sparkles className="w-4 h-4" />
                                Kaydet ve AI Değerlendir
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Form body — extracted for readability ────────────────────────────────
function FormBody(props) {
    const {
        searchTerm,
        setSearchTerm,
        filteredCandidates,
        candidateId,
        setCandidateId,
        selectedCandidate,
        positions,
        positionId,
        setPositionId,
        selectedPosition,
        interviewType,
        setInterviewType,
        date,
        setDate,
        time,
        setTime,
        durationMinutes,
        setDurationMinutes,
        interviewerName,
        setInterviewerName,
        questions,
        updateQuestion,
        addQuestion,
        removeQuestion,
        handleAiSuggest,
        aiSuggesting,
        planLoaded,
        planWarning,
        answerWarning,
        linkedUnanswered,
        handleSplitTranscript,
        splitting,
        splitNote,
        transcript,
        setTranscript,
        notes,
        setNotes,
        recruiterOutcome,
        setRecruiterOutcome,
        salaryHint, salaryHintState, onFindSalary, onAcceptSalary, transcriptFilled,
        salaryMin, setSalaryMin, salaryMax, setSalaryMax,
        salaryCurrency, setSalaryCurrency, salaryPeriod, setSalaryPeriod,
        salaryBasis, setSalaryBasis,
        submitError,
    } = props;

    return (
        <div className="p-6 space-y-6">
            {/* Aday + Pozisyon */}
            <Section title="Aday ve Pozisyon" required>
                {!candidateId ? (
                    <div>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Aday adı veya e-posta ile ara…"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                            />
                        </div>
                        {filteredCandidates.length > 0 && (
                            <div className="mt-2 max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                                {filteredCandidates.map((c) => (
                                    <button
                                        key={c.id}
                                        onClick={() => setCandidateId(c.id)}
                                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition"
                                    >
                                        <div className="text-sm font-semibold text-slate-800">
                                            {c.name}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {c.position || '—'} · {c.email || ''}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                        <div>
                            <div className="text-sm font-bold text-slate-800">
                                {selectedCandidate?.name}
                            </div>
                            <div className="text-xs text-slate-500">
                                {selectedCandidate?.email}
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                setCandidateId('');
                                setSearchTerm('');
                            }}
                            className="text-xs text-indigo-600 font-semibold hover:underline"
                        >
                            Değiştir
                        </button>
                    </div>
                )}

                <select
                    value={positionId}
                    onChange={(e) => setPositionId(e.target.value)}
                    className="w-full mt-3 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                >
                    <option value="">— Pozisyon seç (opsiyonel) —</option>
                    {positions.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.title} {p.department ? `· ${p.department}` : ''}
                        </option>
                    ))}
                </select>
            </Section>

            {/* Görüşme detayları */}
            <Section title="Görüşme Detayları" required>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block">
                            Görüşme Tipi
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {INTERVIEW_TYPES.map((t) => {
                                const Icon = t.icon;
                                const active = interviewType === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => setInterviewType(t.id)}
                                        className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition ${
                                            active
                                                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        <Icon className="w-3.5 h-3.5" />
                                        {t.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block">
                            Görüşmeci
                        </label>
                        <input
                            type="text"
                            value={interviewerName}
                            onChange={(e) => setInterviewerName(e.target.value)}
                            placeholder="Senin adın veya görüşmeyi yapan kişinin adı"
                            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                        />
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3">
                    <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block">
                            Tarih
                        </label>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block">
                            Saat
                        </label>
                        <input
                            type="time"
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block">
                            Süre (dk)
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="600"
                            value={durationMinutes}
                            onChange={(e) => setDurationMinutes(e.target.value)}
                            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                        />
                    </div>
                </div>
            </Section>

            {/* Sorular ve Cevaplar */}
            <Section title="Sorular ve Cevaplar">
                {/* Plandan gelen sorular jenerik değil: her biri taramada açık
                    kalmış bir gereksinime bağlı ve cevap o maddeye yazılacak.
                    Kullanıcının bu farkı görmesi gerekiyor — aksi hâlde
                    soruları silip yerine kendi jenerik sorularını yazar ve
                    bağ sessizce kopar. */}
                {/* Sorular plandan GELMEDİ. Sebebi ve çözümü burada yazıyor;
                    kullanıcı kaydetmeden önce düzeltebilsin. */}
                {planWarning && (
                    <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800 leading-relaxed">
                            <strong>Madde bazlı sonuç çıkmayacak.</strong> {planWarning}
                            {' '}Yine de kaydedebilirsiniz — gözlemler ve özet üretilir, yalnızca
                            sayısal sonuç ve madde damgaları olmaz.
                        </p>
                    </div>
                )}
                {answerWarning && (
                    <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800 leading-relaxed">
                            <strong>{linkedUnanswered} sorunun cevabı boş.</strong> Boş cevap ölçüme
                            girmez — o maddeler değerlendirilmeden kalır. Transkripti aşağıya
                            yapıştırdıysanız <strong>"Transkriptten cevapları doldur"</strong> düğmesine
                            basın; transkriptin kendisi soru bazında ölçülmüyor.
                        </p>
                    </div>
                )}
                {planLoaded && (
                    <div className="mb-3 flex items-start gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-cyan-800 leading-relaxed">
                            Sorular bu adayın <strong>mülakat planından</strong> geldi — her biri
                            taramada açık kalmış bir gereksinime bağlı. Soru metnini
                            değiştirebilirsiniz, bağ korunur; <strong>silerseniz</strong> o madde
                            değerlendirmesiz kalır.
                        </p>
                    </div>
                )}
                <div className="space-y-3">
                    {questions.map((q, idx) => (
                        <div
                            key={idx}
                            className="border border-slate-200 rounded-lg p-3 bg-slate-50/40"
                        >
                            <div className="flex items-start gap-2 mb-2">
                                <span className="text-xs font-bold text-slate-500 mt-2 min-w-[24px]">
                                    Q{idx + 1}
                                </span>
                                {q.must && (
                                    <span
                                        title="Bu soru zorunlu bir gereksinime bağlı"
                                        className="mt-2 px-1.5 py-0.5 rounded border border-red-200 bg-red-50 text-red-600 text-[9px] font-black shrink-0"
                                    >
                                        zorunlu
                                    </span>
                                )}
                                <input
                                    type="text"
                                    placeholder="Soru…"
                                    value={q.question}
                                    onChange={(e) =>
                                        updateQuestion(idx, 'question', e.target.value)
                                    }
                                    className="flex-1 px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                                />
                                {questions.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => removeQuestion(idx)}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            {/* "İyi cevapta ne olmalı" — plan yazarken üretildi
                                ve cevabı yazarken en çok işe yaradığı yer
                                burası: mülakatçı neyi kaçırdığını görür. */}
                            {q.listenFor && (
                                <p className="ml-6 mb-1.5 text-[11px] text-emerald-700 leading-relaxed">
                                    <span className="font-bold">İyi cevapta:</span> {q.listenFor}
                                </p>
                            )}
                            <textarea
                                placeholder="Adayın cevabı…"
                                value={q.answer}
                                onChange={(e) => updateQuestion(idx, 'answer', e.target.value)}
                                rows={2}
                                className="w-full ml-6 px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:ring-2 focus:ring-indigo-400 focus:outline-none resize-y"
                                style={{ width: 'calc(100% - 1.5rem)' }}
                            />
                        </div>
                    ))}
                </div>
                <div className="flex gap-2 mt-3">
                    <button
                        type="button"
                        onClick={addQuestion}
                        className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded transition flex items-center gap-1"
                    >
                        <Plus className="w-3.5 h-3.5" /> Soru Ekle
                    </button>
                    <button
                        type="button"
                        onClick={handleAiSuggest}
                        disabled={aiSuggesting || !selectedPosition}
                        className="text-xs font-semibold text-purple-600 hover:bg-purple-50 px-3 py-1.5 rounded transition flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {aiSuggesting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                        )}
                        AI ile Soru Öner
                    </button>
                </div>
            </Section>

            {/* Opsiyonel transcript + notlar */}
            <Section title="Opsiyonel: Transcript ve Notlar">
                <label className="text-xs font-semibold text-slate-600 mb-1 block">
                    Tam transcript (görüşmenin tamamı)
                </label>
                <textarea
                    placeholder="Eğer transcript çıkardıysan veya tüm konuşmayı yazdıysan buraya yapıştır…"
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none resize-y"
                />
                {/* Transkripti sorulara dağıt.
                    Yalnızca BOŞ kutuları doldurur — elle yazdığınız cevaba
                    dokunmaz. Sonuç doğrudan kaydedilmez; okuyup düzeltmeniz
                    için kutulara yazılır. */}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                    <button
                        type="button"
                        onClick={handleSplitTranscript}
                        disabled={splitting || !transcript.trim()}
                        className="text-xs font-semibold text-cyan-700 hover:bg-cyan-50 px-3 py-1.5 rounded transition flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {splitting
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Dağıtılıyor…</>
                            : <><Sparkles className="w-3.5 h-3.5" /> Transkriptten cevapları doldur</>}
                    </button>
                    <span className="text-[11px] text-slate-400">
                        Yalnızca boş kutuları doldurur, yazdıklarınıza dokunmaz.
                    </span>
                </div>
                {splitNote && (
                    <p className="mt-1.5 text-[11px] text-cyan-700 leading-relaxed">{splitNote}</p>
                )}
                <label className="text-xs font-semibold text-slate-600 mb-1 mt-3 block">
                    Görüşmeci notları (izlenimler, gözlemler)
                </label>
                <textarea
                    placeholder="Adayın iletişim, davranış, motivasyonu hakkında notların…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none resize-y"
                />
            </Section>

            {/* Outcome */}
            <Section title="Senin Değerlendirmen">
                <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Adayın Maaş Beklentisi <span className="text-slate-300">(isteğe bağlı)</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <input type="text" inputMode="numeric" placeholder="Alt" value={salaryMin}
                        onChange={(e) => setSalaryMin(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[12px] outline-none focus:border-violet-300" />
                    <input type="text" inputMode="numeric" placeholder="Üst" value={salaryMax}
                        onChange={(e) => setSalaryMax(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[12px] outline-none focus:border-violet-300" />
                    <select value={salaryCurrency} onChange={(e) => setSalaryCurrency(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[12px] outline-none focus:border-violet-300">
                        {CURRENCIES.map((c) => <option key={c} value={c}>{c} {CURRENCY_LABEL[c]}</option>)}
                    </select>
                    <select value={salaryPeriod} onChange={(e) => setSalaryPeriod(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[12px] outline-none focus:border-violet-300">
                        {PERIODS.map((x) => <option key={x} value={x}>{PERIOD_LABEL[x]}</option>)}
                    </select>
                    <select value={salaryBasis} onChange={(e) => setSalaryBasis(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[12px] outline-none focus:border-violet-300">
                        <option value="">brüt/net?</option>
                        {BASES.map((x) => <option key={x} value={x}>{BASIS_LABEL[x]}</option>)}
                    </select>
                </div>
                {transcriptFilled && (
                    <button
                        type="button"
                        onClick={onFindSalary}
                        disabled={salaryHintState === 'busy'}
                        className="text-[10px] font-black uppercase tracking-wider text-violet-600 hover:text-violet-700 disabled:opacity-50"
                    >
                        {salaryHintState === 'busy' ? 'Transkript taranıyor…' : 'Transkriptten bul'}
                    </button>
                )}
                {salaryHintState === 'none' && (
                    <p className="text-[10px] text-slate-500">
                        Transkriptte maaş beklentisi geçmiyor. Bu bir hata değil — çoğu görüşmede
                        konuşulmaz.
                    </p>
                )}
                {salaryHintState === 'error' && (
                    <p className="text-[10px] text-amber-700">Tarama yapılamadı; alanı elle doldurabilirsiniz.</p>
                )}
                {/* ÖNERİ ALINTISIYLA GELİR ve onaysız hiçbir yere yazılmaz.
                    Dayanağı görünmeyen bir sayıyı onaylatmak, onayı
                    anlamsızlaştırır. */}
                {salaryHint && (
                    <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 space-y-1.5">
                        <p className="text-[11px] text-violet-900">
                            Transkriptte bulundu:{' '}
                            <strong>{formatBand(salaryHint)}</strong>
                        </p>
                        <p className="text-[10px] text-violet-700 italic">&ldquo;{salaryHint.quote}&rdquo;</p>
                        {salaryHint.uncertain && (
                            <p className="text-[10px] text-amber-700">Emin değil: {salaryHint.uncertain}</p>
                        )}
                        <div className="flex gap-2">
                            <button type="button" onClick={onAcceptSalary}
                                className="px-2.5 py-1 rounded-lg bg-violet-500 text-white text-[10px] font-black uppercase tracking-wider">
                                Kabul et
                            </button>
                            <button type="button" onClick={onFindSalary}
                                className="px-2.5 py-1 rounded-lg border border-violet-200 text-violet-700 text-[10px] font-black uppercase tracking-wider">
                                Yeniden ara
                            </button>
                        </div>
                    </div>
                )}
                {/* Boş bırakmak SIFIR demek değil, "sorulmadı" demek. Sıfır sanmak,
                    sorulmamış bir soruyu cevaplanmış göstermek olurdu. */}
                <p className="text-[10px] text-slate-400">
                    {formatBand({ min: salaryMin, max: salaryMax, currency: salaryCurrency, period: salaryPeriod })
                        || 'Boş bırakırsanız "sorulmadı" olarak kaydedilir — sıfır sayılmaz.'}
                </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
                    {OUTCOME_OPTIONS.map((o) => {
                        const active = recruiterOutcome === o.id;
                        return (
                            <button
                                key={o.id}
                                type="button"
                                onClick={() => setRecruiterOutcome(o.id)}
                                className={`px-3 py-2.5 rounded-lg border text-sm font-bold transition ${
                                    active
                                        ? 'border-2'
                                        : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                                }`}
                                style={
                                    active
                                        ? {
                                              borderColor: o.color,
                                              backgroundColor: `${o.color}15`,
                                              color: o.color,
                                          }
                                        : undefined
                                }
                            >
                                {o.label}
                            </button>
                        );
                    })}
                </div>
            </Section>

            {submitError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                    {submitError}
                </div>
            )}
        </div>
    );
}

function Section({ title, required, children }) {
    return (
        <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">
                {title}
                {required && <span className="text-red-500 ml-1">*</span>}
            </h3>
            {children}
        </div>
    );
}

// ─── Result panel — shown after successful submit ─────────────────────────
function ResultPanel({ result, onClose }) {
    const ai = result?.aiAnalysis;
    // Sayı ve öneri artık SUNUCUDA damgalardan hesaplanıyor, aiAnalysis
    // içinden değil: modelin ürettiği puan canlıda ters sıralama üretti.
    const evidence = result?.evidence;
    const recommendedOutcome = result?.recommendedOutcome;
    return (
        <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                    <h3 className="text-lg font-black text-slate-900">Görüşme Kaydedildi</h3>
                    <p className="text-xs text-slate-500">
                        ID: <code className="font-mono">{result.sessionId}</code>
                    </p>
                </div>
            </div>

            {ai || evidence ? (
                <div className="space-y-4">
                    {/* KANIT ORANI — payda her zaman yanında.
                        Eskiden burada modelin ürettiği çıpasız bir "Genel Skor"
                        vardı ve canlıda ters sıralama üretti: kötü geçmiş bir
                        görüşme 90, daha uygun aday 80 aldı. Sayı artık madde
                        damgalarından kodda hesaplanıyor ve tek başına değil,
                        kaç maddeden çıktığıyla birlikte gösteriliyor. */}
                    {evidence?.score != null ? (
                        <div className="bg-white border border-slate-200 rounded-xl p-4">
                            <div className="text-xs font-bold uppercase text-slate-500 mb-1">
                                Kanıt oranı
                            </div>
                            <div className="text-3xl font-black text-slate-900">
                                %{evidence.score}
                            </div>
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                Odada sorulan <strong>{evidence.asked} maddenin</strong>{' '}
                                {evidence.met} tanesinde tam, {evidence.partial} tanesinde kısmi
                                kanıt çıktı; {evidence.missing} tanesinde çıkmadı.
                                {evidence.inconclusive > 0 && (
                                    <> {evidence.inconclusive} madde için karar verilemedi — skora girmedi.</>
                                )}
                            </p>
                            {evidence.mustMissing > 0 && (
                                <p className="text-xs text-red-600 font-bold mt-1.5">
                                    {evidence.mustMissing} zorunlu madde odada karşılanmadı.
                                </p>
                            )}
                            {recommendedOutcome && (
                                <div className="text-xs text-slate-600 mt-2 pt-2 border-t border-slate-100">
                                    Öneri:{' '}
                                    <strong>
                                        {recommendedOutcome === 'positive'
                                            ? '✅ Olumlu'
                                            : recommendedOutcome === 'negative'
                                              ? '❌ Olumsuz'
                                              : '⏳ Beklemede'}
                                    </strong>
                                    <span className="text-slate-400"> · karar sizin</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Sayı YOK ve bu dürüst bir sonuç. Ama SEBEBİ tek değil:
                           burada sabit bir cümle vardı ("sorular maddeye bağlı
                           değil") ve canlıda yanlış çıktı — sorular plandan
                           gelmişti, bağ vardı, eksik olan cevaptı. Kullanıcı
                           zaten yaptığı işi tekrar yapmaya gönderildi. Sebebi
                           artık sunucu söylüyor. */
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                            <div className="text-xs font-bold uppercase text-slate-500 mb-1">
                                Sayısal sonuç üretilmedi
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                {NO_SCORE_TEXT[result?.noScoreReason] || NO_SCORE_TEXT['no-link']}
                                {' '}Aşağıdaki gözlemler ve özet yine kaydedildi.
                            </p>
                        </div>
                    )}
                    {ai?.summary && (
                        <div className="bg-white border border-slate-200 rounded-lg p-4">
                            <div className="text-xs font-bold uppercase text-slate-500 mb-2">
                                Özet
                            </div>
                            <p className="text-sm text-slate-700 leading-relaxed">{ai.summary}</p>
                        </div>
                    )}
                    {(ai?.strengths?.length > 0 || ai?.concerns?.length > 0) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {ai.strengths?.length > 0 && (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                                    <div className="text-xs font-bold uppercase text-emerald-700 mb-1.5">
                                        Öne çıkanlar
                                    </div>
                                    <ul className="space-y-1">
                                        {ai.strengths.map((t, i) => (
                                            <li key={i} className="text-xs text-emerald-800 leading-relaxed">· {t}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {ai.concerns?.length > 0 && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <div className="text-xs font-bold uppercase text-amber-700 mb-1.5">
                                        Dikkat edilecekler
                                    </div>
                                    <ul className="space-y-1">
                                        {ai.concerns.map((t, i) => (
                                            <li key={i} className="text-xs text-amber-800 leading-relaxed">· {t}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                    {/* Soru başına GÖZLEM — puan değil. Cevap başına 0-100
                        vermek aynı şişme sorununu satır satır tekrarlıyordu. */}
                    {Array.isArray(ai?.questions) && ai.questions.length > 0 && (
                        <div className="space-y-2">
                            <div className="text-xs font-bold uppercase text-slate-500">
                                Soru bazlı gözlemler
                            </div>
                            {ai.questions.map((q, i) => (
                                <div
                                    key={i}
                                    className="bg-white border border-slate-200 rounded-lg p-3"
                                >
                                    <div className="text-sm font-semibold text-slate-800 mb-1">
                                        {q.question}
                                    </div>
                                    {q.observation && (
                                        <p className="text-xs text-slate-500 leading-relaxed">
                                            {q.observation}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                    ⚠️ AI değerlendirme başarısız oldu. Görüşme kaydedildi; daha sonra
                    yeniden değerlendirme yapılabilir.
                </div>
            )}

            <div className="flex justify-end mt-6">
                <button
                    onClick={onClose}
                    className="px-5 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition"
                >
                    Tamam
                </button>
            </div>
        </div>
    );
}
