// src/components/AddManualInterviewModal.jsx
//
// Manuel görüşme girişi modal'ı.
//
// Akış:
//   1. Aday seç (mevcut candidates listesinden, search'lü)
//   2. Pozisyon otomatik adaydan gelir (override edilebilir)
//   3. Görüşme metadata: tip / tarih / saat / süre / görüşmeci
//   4. Sorular ve Cevaplar — pozisyonun screeningQuestions'ı varsa
//      otomatik gelir; recruiter ekleyebilir/silebilir; AI öneri butonu
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

    const [aiSuggesting, setAiSuggesting] = useState(false);
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

    // Auto-load position's screeningQuestions when position changes (only if
    // recruiter hasn't already typed answers — never clobber typed input)
    useEffect(() => {
        if (!positionId) return;
        const pos = positions.find((p) => p.id === positionId);
        const screening = (pos?.screeningQuestions || []).filter(
            (q) => typeof q === 'string' && q.trim()
        );
        if (screening.length === 0) return;
        // Only seed if current questions are all empty
        const hasContent = questions.some((q) => q.question.trim() || q.answer.trim());
        if (hasContent) return;
        setQuestions(screening.map((q) => ({ question: q, answer: '' })));
    }, [positionId, positions]); // eslint-disable-line react-hooks/exhaustive-deps

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
                    questions: questions.filter(
                        (q) => q.question.trim() || q.answer.trim()
                    ),
                    transcript,
                    notes,
                    recruiterOutcome,
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
        transcript,
        setTranscript,
        notes,
        setNotes,
        recruiterOutcome,
        setRecruiterOutcome,
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
    const ai = result.aiAnalysis;
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

            {ai ? (
                <div className="space-y-4">
                    {ai.aggregateScore != null && (
                        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl p-4">
                            <div className="text-xs font-bold uppercase text-indigo-600 mb-1">
                                Genel Skor
                            </div>
                            <div className="text-3xl font-black text-slate-900">
                                {ai.aggregateScore}
                                <span className="text-base text-slate-400 font-bold">/100</span>
                            </div>
                            {ai.recommendedOutcome && (
                                <div className="text-xs text-slate-600 mt-1">
                                    AI önerisi:{' '}
                                    <strong>
                                        {ai.recommendedOutcome === 'positive'
                                            ? '✅ Olumlu'
                                            : ai.recommendedOutcome === 'negative'
                                              ? '❌ Olumsuz'
                                              : '⏳ Beklemede'}
                                    </strong>
                                </div>
                            )}
                        </div>
                    )}
                    {ai.summary && (
                        <div className="bg-white border border-slate-200 rounded-lg p-4">
                            <div className="text-xs font-bold uppercase text-slate-500 mb-2">
                                Özet
                            </div>
                            <p className="text-sm text-slate-700 leading-relaxed">{ai.summary}</p>
                        </div>
                    )}
                    {Array.isArray(ai.questions) && ai.questions.length > 0 && (
                        <div className="space-y-2">
                            <div className="text-xs font-bold uppercase text-slate-500">
                                Soru Skorları
                            </div>
                            {ai.questions.map((q, i) => (
                                <div
                                    key={i}
                                    className="bg-white border border-slate-200 rounded-lg p-3"
                                >
                                    <div className="flex items-start justify-between gap-3 mb-1">
                                        <div className="text-sm font-semibold text-slate-800 flex-1">
                                            {q.question}
                                        </div>
                                        <div className="text-sm font-black text-indigo-600 whitespace-nowrap">
                                            {q.score}/100
                                        </div>
                                    </div>
                                    {q.rationale && (
                                        <p className="text-xs text-slate-500 leading-relaxed">
                                            {q.rationale}
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
