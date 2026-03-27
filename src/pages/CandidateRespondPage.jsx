// src/pages/CandidateRespondPage.jsx
// Public page — no auth required.
// Handles candidate responses to interview invitations and info requests.
import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
    CheckCircle2, XCircle, Loader2, AlertCircle, Send,
    FileText, Calendar, Clock, Paperclip, Sparkles
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_SERVER_URL || '';

export default function CandidateRespondPage() {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const type = searchParams.get('type') || 'invite'; // 'invite' | 'info'
    const actionParam = searchParams.get('action');     // 'confirm' | 'decline' (for invite)

    const [loading, setLoading]           = useState(true);
    const [submitting, setSubmitting]     = useState(false);
    const [done, setDone]                 = useState(false);
    const [error, setError]               = useState(null);
    const [data, setData]                 = useState(null);
    const [responseText, setResponseText] = useState('');
    const [selectedAction, setSelectedAction] = useState(actionParam || null);

    useEffect(() => {
        if (!id) { setError('Geçersiz bağlantı.'); setLoading(false); return; }
        const fetchData = async () => {
            try {
                if (type === 'info') {
                    const snap = await getDoc(doc(db, `artifacts/talent-flow/public/data/infoRequests/${id}`));
                    if (!snap.exists()) throw new Error('Talep bulunamadı veya süresi doldu.');
                    const d = snap.data();
                    if (d.status === 'responded') { setDone(true); }
                    setData(d);
                } else {
                    const snap = await getDoc(doc(db, `interviews/${id}`));
                    if (!snap.exists()) throw new Error('Mülakat daveti bulunamadı.');
                    const d = snap.data();
                    if (d.candidateResponse?.status) {
                        setDone(true);
                        setSelectedAction(d.candidateResponse.status);
                    }
                    setData(d);
                    if (actionParam && !d.candidateResponse?.status) setSelectedAction(actionParam);
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [id, type, actionParam]);

    useEffect(() => {
        if (!loading && !done && !error && actionParam && type === 'invite' && data) {
            handleInviteResponse(actionParam);
        }
    }, [loading, done, error, actionParam, data]);

    const handleInviteResponse = async (action) => {
        if (submitting || done) return;
        setSubmitting(true);
        setSelectedAction(action);
        try {
            const res = await fetch(`${API_BASE}/api/candidate-respond`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, type: 'invite', action }),
            });
            if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Yanıt kaydedilemedi.'); }
            setDone(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleInfoSubmit = async () => {
        if (!responseText.trim()) { setError('Lütfen bilgilerinizi girin.'); return; }
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/api/candidate-respond`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, type: 'info', responseData: responseText }),
            });
            if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Yanıt gönderilemedi.'); }
            setDone(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const companyName = data?.companyName || data?.branding?.companyName || 'Talent-Inn';

    // ── Loading ────────────────────────────────────────────────────────────────
    if (loading) return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50 flex items-center justify-center p-6">
            <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-500 mx-auto mb-3" />
                <p className="text-slate-400 text-sm font-medium">Yükleniyor...</p>
            </div>
        </div>
    );

    // ── Hard error (no data at all) ────────────────────────────────────────────
    if (error && !data) return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50 flex items-center justify-center p-6">
            <div className="max-w-md w-full">
                <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 p-10 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-6">
                        <AlertCircle className="w-8 h-8 text-red-400" />
                    </div>
                    <h2 className="text-lg font-black text-slate-800 mb-2 tracking-tight">Bir sorun oluştu</h2>
                    <p className="text-slate-400 text-sm">{error}</p>
                </div>
                <div className="mt-6 flex items-center justify-center gap-2 text-slate-400">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-[9px] font-black uppercase tracking-widest">Talent-Inn Experience Center</span>
                </div>
            </div>
        </div>
    );

    // ── Auto-submitting from URL ───────────────────────────────────────────────
    if (!done && submitting) return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50 flex items-center justify-center p-6">
            <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-500 mx-auto mb-3" />
                <p className="text-slate-400 text-sm font-medium">Yanıtınız kaydediliyor...</p>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50 flex items-center justify-center p-6 font-sans">
            <div className="max-w-md w-full">

                {/* ── CARD ─────────────────────────────────────────────────── */}
                <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-500">

                    {/* Thin accent bar */}
                    <div className="h-1 w-full bg-gradient-to-r from-cyan-400 to-blue-500" />

                    <div className="p-10">

                        {/* ── SUCCESS STATE ────────────────────────────────── */}
                        {done && (
                            <div className="text-center py-2 animate-in fade-in zoom-in duration-400">
                                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm ${
                                    type === 'invite' && selectedAction === 'decline'
                                        ? 'bg-slate-50 border border-slate-200'
                                        : 'bg-emerald-50 border border-emerald-100'
                                }`}>
                                    {type === 'invite' && selectedAction === 'decline'
                                        ? <XCircle className="w-8 h-8 text-slate-400" />
                                        : <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                                    }
                                </div>
                                <h1 className="text-[22px] font-black text-slate-900 tracking-tight mb-2">
                                    {type === 'info'
                                        ? 'Bilgileriniz İletildi!'
                                        : selectedAction === 'confirm'
                                            ? 'Katılımınız Onaylandı!'
                                            : 'Yanıtınız Kaydedildi'
                                    }
                                </h1>
                                <p className="text-[13px] text-slate-500 leading-relaxed">
                                    {type === 'info'
                                        ? 'Gönderdiğiniz bilgiler için teşekkür ederiz. İK ekibimiz inceleyip sizinle iletişime geçecektir.'
                                        : selectedAction === 'confirm'
                                            ? 'Mülakat davetini kabul ettiğiniz için teşekkür ederiz. Görüşmede görüşmek üzere!'
                                            : 'Katılamayacağınızı bildirdiğiniz için teşekkürler. İK ekibimiz en kısa sürede sizinle iletişime geçecektir.'
                                    }
                                </p>
                            </div>
                        )}

                        {/* ── INFO REQUEST — Reply via Email ────────────────── */}
                        {!done && type === 'info' && data && (
                            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-400">

                                {/* Icon + title */}
                                <div className="text-center mb-2">
                                    <div className="w-16 h-16 rounded-2xl bg-cyan-50 border border-cyan-100 flex items-center justify-center mx-auto mb-5 shadow-sm">
                                        <FileText className="w-8 h-8 text-cyan-500" />
                                    </div>
                                    <h1 className="text-[22px] font-black text-slate-900 tracking-tight mb-1">Bilgi Talebi</h1>
                                    <p className="text-[13px] text-slate-500">
                                        Merhaba, <span className="font-bold text-slate-700">{data.candidateName || 'Sayın Aday'}</span>
                                    </p>
                                    {data.position && (
                                        <span className="inline-block mt-1 text-[10px] font-black text-cyan-600 uppercase tracking-widest bg-cyan-50 border border-cyan-100 rounded-full px-3 py-0.5">
                                            {data.position}
                                        </span>
                                    )}
                                </div>

                                {/* Recruiter message */}
                                {data.requestMessage && (
                                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Mesaj</p>
                                        <p className="text-[13px] text-slate-600 leading-relaxed whitespace-pre-line">{data.requestMessage}</p>
                                    </div>
                                )}

                                {/* Requested items */}
                                {data.requestedItems?.length > 0 && (
                                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Talep Edilenler</p>
                                        <ul className="space-y-2">
                                            {data.requestedItems.map((item, i) => (
                                                <li key={i} className="flex items-center gap-2 text-[13px] text-slate-600">
                                                    <Paperclip className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                                    {item}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Instruction */}
                                <div className="bg-cyan-50 border border-cyan-100 rounded-2xl p-4 text-center space-y-1">
                                    <p className="text-[11px] font-black text-cyan-700 uppercase tracking-widest">Nasıl yanıtlarsınız?</p>
                                    <p className="text-[12px] text-slate-500 leading-relaxed">
                                        Aldığınız e-postayı <span className="font-bold text-slate-700">doğrudan yanıtlayarak</span> belge veya bilgilerinizi ekleyebilirsiniz.
                                    </p>
                                </div>

                                {/* mailto reply button */}
                                <a
                                    href={`mailto:${data.recruiterEmail || 'emre.demir@infoset.app'}?subject=${encodeURIComponent(`Re: Bilgi Talebi — ${data.position || 'Başvurunuz'}`)}&body=${encodeURIComponent(`Sayın ${data.recruiterName || 'İK Ekibi'},\n\nAşağıda talep ettiğiniz bilgileri iletiyorum:\n\n`)}`}
                                    className="w-full h-12 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white shadow-sm shadow-cyan-200"
                                >
                                    <Send className="w-3.5 h-3.5" />
                                    E-posta ile Yanıtla
                                </a>
                            </div>
                        )}

                        {/* ── INTERVIEW INVITE ──────────────────────────────── */}
                        {!done && type === 'invite' && data && !submitting && !actionParam && (
                            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-400">

                                <div className="text-center mb-2">
                                    <div className="w-16 h-16 rounded-2xl bg-cyan-50 border border-cyan-100 flex items-center justify-center mx-auto mb-5 shadow-sm">
                                        <Calendar className="w-8 h-8 text-cyan-500" />
                                    </div>
                                    <h1 className="text-[22px] font-black text-slate-900 tracking-tight mb-1">Mülakat Daveti</h1>
                                    <p className="text-[13px] text-slate-500">
                                        Merhaba, <span className="font-bold text-slate-700">{data.candidateName || 'Sayın Aday'}</span>
                                    </p>
                                </div>

                                {(data.date || data.time) && (
                                    <div className="bg-cyan-50 border border-cyan-100 rounded-2xl p-4 space-y-2">
                                        {data.date && (
                                            <div className="flex items-center gap-2 text-cyan-700 text-sm font-semibold">
                                                <Calendar className="w-4 h-4 text-cyan-400" /> {data.date}
                                            </div>
                                        )}
                                        {data.time && (
                                            <div className="flex items-center gap-2 text-cyan-700 text-sm font-semibold">
                                                <Clock className="w-4 h-4 text-cyan-400" /> {data.time}
                                            </div>
                                        )}
                                        {data.positionTitle && (
                                            <p className="text-[11px] text-slate-400 font-medium">Pozisyon: {data.positionTitle}</p>
                                        )}
                                    </div>
                                )}

                                <p className="text-[13px] text-slate-500 text-center">Mülakat davetine katılıp katılamayacağınızı lütfen belirtin.</p>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => handleInviteResponse('confirm')}
                                        className="flex-1 h-12 rounded-xl font-black text-[10px] uppercase tracking-widest bg-emerald-500 hover:bg-emerald-600 text-white transition-all flex items-center justify-center gap-2 shadow-sm shadow-emerald-100"
                                    >
                                        <CheckCircle2 className="w-4 h-4" /> Katılıyorum
                                    </button>
                                    <button
                                        onClick={() => handleInviteResponse('decline')}
                                        className="flex-1 h-12 rounded-xl font-black text-[10px] uppercase tracking-widest bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-500 border border-slate-200 hover:border-red-200 transition-all flex items-center justify-center gap-2"
                                    >
                                        <XCircle className="w-4 h-4" /> Katılamıyorum
                                    </button>
                                </div>
                            </div>
                        )}

                    </div>
                </div>

                {/* Footer branding */}
                <div className="mt-6 flex items-center justify-center gap-2 text-slate-400">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-[9px] font-black uppercase tracking-widest">Talent-Inn Experience Center</span>
                </div>

            </div>
        </div>
    );
}
