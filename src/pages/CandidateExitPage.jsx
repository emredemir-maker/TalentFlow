// src/pages/CandidateExitPage.jsx
import React, { useState } from 'react';
import { CheckCircle2, Star, Send, Sparkles } from 'lucide-react';

export default function CandidateExitPage() {
    const [rating, setRating]       = useState(0);
    const [feedback, setFeedback]   = useState('');
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = () => {
        if (rating === 0) return;
        setSubmitted(true);
        console.log('Feedback:', { rating, feedback });
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50 flex items-center justify-center p-6 font-sans">
            <div className="max-w-md w-full">
                {/* Card */}
                <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 p-10 text-center animate-in fade-in zoom-in duration-500">

                    {/* Icon */}
                    <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-6 shadow-sm">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    </div>

                    <h1 className="text-[22px] font-black text-slate-900 tracking-tight mb-2">
                        Mülakat Tamamlandı
                    </h1>
                    <p className="text-[13px] text-slate-500 leading-relaxed mb-8">
                        Katılımınız için teşekkür ederiz. Görüşmeniz başarıyla sonlandırıldı. Deneyiminizi değerlendirmeniz bizim için çok değerli.
                    </p>

                    {!submitted ? (
                        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-400">
                            {/* Star rating */}
                            <div className="space-y-2">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Görüşme Deneyimi</span>
                                <div className="flex items-center justify-center gap-2 pt-1">
                                    {[1, 2, 3, 4, 5].map(star => (
                                        <button
                                            key={star}
                                            onClick={() => setRating(star)}
                                            className="transition-all duration-200 hover:scale-110 focus:outline-none"
                                        >
                                            <Star
                                                className={`w-9 h-9 transition-colors ${
                                                    rating >= star
                                                        ? 'text-amber-400 fill-amber-400'
                                                        : 'text-slate-200 hover:text-amber-200'
                                                }`}
                                            />
                                        </button>
                                    ))}
                                </div>
                                {rating > 0 && (
                                    <p className="text-[10px] font-bold text-slate-400 animate-in fade-in duration-200">
                                        {['', 'Çok Kötü', 'Kötü', 'Orta', 'İyi', 'Çok İyi'][rating]}
                                    </p>
                                )}
                            </div>

                            {/* Feedback textarea */}
                            <textarea
                                value={feedback}
                                onChange={e => setFeedback(e.target.value)}
                                placeholder="Deneyiminizi kısaca paylaşın... (isteğe bağlı)"
                                className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl p-4 text-[12px] text-slate-700 placeholder-slate-400 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-50 transition-all resize-none"
                            />

                            {/* Submit button */}
                            <button
                                onClick={handleSubmit}
                                disabled={rating === 0}
                                className={`w-full h-12 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                                    rating > 0
                                        ? 'bg-cyan-500 hover:bg-cyan-600 text-white shadow-sm shadow-cyan-200'
                                        : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                                }`}
                            >
                                <Send className="w-3.5 h-3.5" /> Geri Bildirim Gönder
                            </button>
                        </div>
                    ) : (
                        <div className="py-6 animate-in zoom-in duration-400">
                            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-4">
                                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                            </div>
                            <p className="text-[13px] font-black text-slate-700 mb-1">Teşekkürler!</p>
                            <p className="text-[11px] text-slate-400">Geri bildiriminiz başarıyla alındı.</p>
                        </div>
                    )}
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
