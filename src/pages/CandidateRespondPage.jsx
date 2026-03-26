// src/pages/CandidateRespondPage.jsx
// Public page — no auth required.
// Handles candidate responses to interview invitations and info requests.
import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { CheckCircle, XCircle, Loader2, AlertCircle, Send, FileText, Calendar, Clock } from 'lucide-react';

const API_BASE = import.meta.env.VITE_SERVER_URL || '';

export default function CandidateRespondPage() {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const type = searchParams.get('type') || 'invite'; // 'invite' | 'info'
    const actionParam = searchParams.get('action');     // 'confirm' | 'decline' (for invite)

    const [loading, setLoading]       = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone]             = useState(false);
    const [error, setError]           = useState(null);
    const [data, setData]             = useState(null);
    const [responseText, setResponseText] = useState('');
    const [selectedAction, setSelectedAction] = useState(actionParam || null);

    // Fetch the request/interview data
    useEffect(() => {
        if (!id) { setError('Geçersiz bağlantı.'); setLoading(false); return; }
        const fetchData = async () => {
            try {
                if (type === 'info') {
                    const snap = await getDoc(doc(db, `artifacts/talent-flow/public/data/infoRequests/${id}`));
                    if (!snap.exists()) throw new Error('Talep bulunamadı veya süresi doldu.');
                    const d = snap.data();
                    if (d.status === 'responded') {
                        setDone(true);
                        setData(d);
                    } else {
                        setData(d);
                    }
                } else {
                    // Interview invite
                    const snap = await getDoc(doc(db, `interviews/${id}`));
                    if (!snap.exists()) throw new Error('Mülakat daveti bulunamadı.');
                    const d = snap.data();
                    if (d.candidateResponse?.status) {
                        setDone(true);
                        setSelectedAction(d.candidateResponse.status);
                    }
                    setData(d);
                    // If action was in URL, auto-submit
                    if (actionParam && !d.candidateResponse?.status) {
                        setSelectedAction(actionParam);
                    }
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [id, type, actionParam]);

    // Auto-submit if action is in URL params (confirm/decline from email button)
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
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Yanıt kaydedilemedi.');
            }
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
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Yanıt gönderilemedi.');
            }
            setDone(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const companyName = data?.companyName || data?.branding?.companyName || 'Talent-Inn';
    const primaryColor = '#0E7490';

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-600 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">Yükleniyor...</p>
            </div>
        </div>
    );

    if (error && !data) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
            <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <h2 className="text-lg font-bold text-slate-800 mb-2">Bir sorun oluştu</h2>
                <p className="text-slate-500 text-sm">{error}</p>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-cyan-50/30 flex items-center justify-center px-4 py-12">
            <div className="bg-white rounded-3xl shadow-xl max-w-lg w-full overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-cyan-700 to-cyan-500 px-8 py-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                            {type === 'info' ? <FileText className="w-5 h-5 text-white" /> : <Calendar className="w-5 h-5 text-white" />}
                        </div>
                        <div>
                            <h1 className="text-white font-bold text-lg leading-tight">
                                {type === 'info' ? 'Bilgi Talebi' : 'Mülakat Daveti'}
                            </h1>
                            <p className="text-white/70 text-xs">{companyName}</p>
                        </div>
                    </div>
                </div>

                <div className="p-8">
                    {/* Done state */}
                    {done && (
                        <div className="text-center py-4">
                            {type === 'invite' ? (
                                selectedAction === 'confirm' ? (
                                    <>
                                        <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                                        <h2 className="text-xl font-bold text-slate-800 mb-2">Katılımınız Onaylandı!</h2>
                                        <p className="text-slate-500 text-sm">Mülakat davetini kabul ettiğiniz için teşekkür ederiz. Görüşmede görüşmek üzere!</p>
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                                        <h2 className="text-xl font-bold text-slate-800 mb-2">Yanıtınız Kaydedildi</h2>
                                        <p className="text-slate-500 text-sm">Katılamayacağınızı bildirdiğiniz için teşekkürler. İK ekibimiz en kısa sürede sizinle iletişime geçecektir.</p>
                                    </>
                                )
                            ) : (
                                <>
                                    <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                                    <h2 className="text-xl font-bold text-slate-800 mb-2">Bilgileriniz İletildi!</h2>
                                    <p className="text-slate-500 text-sm">Gönderdiğiniz bilgiler için teşekkür ederiz. İK ekibimiz inceleyip sizinle iletişime geçecektir.</p>
                                </>
                            )}
                        </div>
                    )}

                    {/* Interview invite — confirm/decline */}
                    {!done && type === 'invite' && data && !submitting && !actionParam && (
                        <>
                            <div className="mb-6">
                                <h2 className="text-lg font-bold text-slate-800 mb-1">
                                    Merhaba, {data.candidateName || 'Sayın Aday'}
                                </h2>
                                <p className="text-slate-500 text-sm">Mülakat davetine katılıp katılamayacağınızı lütfen belirtin.</p>
                            </div>
                            {(data.date || data.time) && (
                                <div className="bg-cyan-50 border border-cyan-200 rounded-2xl p-4 mb-6">
                                    {data.date && (
                                        <div className="flex items-center gap-2 text-cyan-700 text-sm mb-1">
                                            <Calendar className="w-4 h-4" />
                                            <span className="font-semibold">{data.date}</span>
                                        </div>
                                    )}
                                    {data.time && (
                                        <div className="flex items-center gap-2 text-cyan-700 text-sm">
                                            <Clock className="w-4 h-4" />
                                            <span className="font-semibold">{data.time}</span>
                                        </div>
                                    )}
                                    {data.positionTitle && (
                                        <p className="text-slate-500 text-xs mt-2">Pozisyon: {data.positionTitle}</p>
                                    )}
                                </div>
                            )}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => handleInviteResponse('confirm')}
                                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-2xl transition-colors flex items-center justify-center gap-2"
                                >
                                    <CheckCircle className="w-5 h-5" /> Katılıyorum
                                </button>
                                <button
                                    onClick={() => handleInviteResponse('decline')}
                                    className="flex-1 bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-600 font-bold py-3 rounded-2xl transition-colors flex items-center justify-center gap-2"
                                >
                                    <XCircle className="w-5 h-5" /> Katılamıyorum
                                </button>
                            </div>
                        </>
                    )}

                    {/* Auto-submitting from URL action */}
                    {!done && submitting && (
                        <div className="text-center py-8">
                            <Loader2 className="w-8 h-8 animate-spin text-cyan-600 mx-auto mb-3" />
                            <p className="text-slate-500 text-sm">Yanıtınız kaydediliyor...</p>
                        </div>
                    )}

                    {/* Info request form */}
                    {!done && type === 'info' && data && (
                        <>
                            <div className="mb-4">
                                <h2 className="text-lg font-bold text-slate-800 mb-1">
                                    Merhaba, {data.candidateName || 'Sayın Aday'}
                                </h2>
                                {data.position && <p className="text-slate-400 text-xs mb-1">Pozisyon: {data.position}</p>}
                                {data.requestMessage && (
                                    <div className="bg-slate-50 border-l-4 border-cyan-500 rounded-r-xl p-4 mt-3">
                                        <p className="text-slate-600 text-sm whitespace-pre-line">{data.requestMessage}</p>
                                    </div>
                                )}
                            </div>
                            {data.requestedItems?.length > 0 && (
                                <div className="mb-4">
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Talep Edilenler</p>
                                    <ul className="space-y-1">
                                        {data.requestedItems.map((item, i) => (
                                            <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                                                <span className="text-cyan-500">📎</span> {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            <div className="mb-4">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Yanıtınız</label>
                                <textarea
                                    value={responseText}
                                    onChange={e => setResponseText(e.target.value)}
                                    rows={5}
                                    placeholder="Talep edilen bilgileri buraya yazabilirsiniz..."
                                    className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                                />
                            </div>
                            {error && (
                                <p className="text-red-500 text-xs mb-3 flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5" /> {error}
                                </p>
                            )}
                            <button
                                onClick={handleInfoSubmit}
                                disabled={submitting}
                                className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white font-bold py-3 rounded-2xl transition-colors flex items-center justify-center gap-2"
                            >
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                Bilgileri Gönder
                            </button>
                        </>
                    )}
                </div>

                <div className="px-8 pb-6 text-center">
                    <p className="text-slate-300 text-xs">Bu sayfa {companyName} tarafından Talent-Inn platformu üzerinden oluşturulmuştur.</p>
                </div>
            </div>
        </div>
    );
}
