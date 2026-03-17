// src/pages/CandidateExitPage.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, MessageSquare, Star, Send } from 'lucide-react';

export default function CandidateExitPage() {
    const navigate = useNavigate();
    const [rating, setRating] = useState(0);
    const [feedback, setFeedback] = useState('');
    const [submitted, setSubmitted] = useState(false);

    const handleSubmitFeedback = () => {
        if (rating === 0) return;
        setSubmitted(true);
        // In a real app, you'd save this to Firestore
        console.log("Feedback submitted:", { rating, feedback });
    };

    return (
        <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-6 font-inter">
            <div className="max-w-md w-full bg-[#1E293B] rounded-[2.5rem] p-10 shadow-2xl border border-white/10 text-center animate-in fade-in zoom-in duration-700">
                <div className="w-20 h-20 rounded-3xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto mb-8 shadow-lg shadow-emerald-500/10">
                    <CheckCircle2 className="w-10 h-10" />
                </div>
                
                <h1 className="text-2xl font-black text-slate-100 italic uppercase tracking-tighter mb-4">Mülakat Tamamlandı</h1>
                
                <p className="text-[13px] font-medium text-white/60 leading-relaxed italic mb-10">
                    Katılımınız için teşekkür ederiz. Görüşmeniz başarıyla sonlandırıldı. Deneyiminizi iyileştirmemize yardımcı olmak için kısa bir değerlendirme yapabilirsiniz.
                </p>

                {!submitted ? (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex flex-col gap-3">
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] italic">Görüşme Deneyimi</span>
                            <div className="flex items-center justify-center gap-2">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                        key={star}
                                        onClick={() => setRating(star)}
                                        className={`transition-all duration-300 transform hover:scale-110 ${rating >= star ? 'text-amber-400' : 'text-white/10 hover:text-white/20'}`}
                                    >
                                        <Star className={`w-8 h-8 ${rating >= star ? 'fill-current' : ''}`} />
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <textarea
                                value={feedback}
                                onChange={(e) => setFeedback(e.target.value)}
                                placeholder="Deneyiminizi kısaca paylaşın..."
                                className="w-full h-24 bg-black/20 border border-white/5 rounded-2xl p-4 text-[12px] font-medium text-white placeholder:text-white/10 outline-none focus:border-blue-500/50 transition-all resize-none italic"
                            />
                            <button 
                                onClick={handleSubmitFeedback}
                                disabled={rating === 0}
                                className={`w-full h-14 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 italic shadow-xl ${
                                    rating > 0 
                                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20' 
                                    : 'bg-white/5 text-white/20 cursor-not-allowed border border-white/5'
                                }`}
                            >
                                <Send className="w-4 h-4" /> GERİ BİLDİRİM GÖNDER
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="py-8 animate-in zoom-in duration-500">
                        <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <p className="text-[11px] font-black text-white uppercase tracking-widest italic">Geri bildiriminiz için teşekkürler!</p>
                    </div>
                )}
                
                <div className="pt-8 mt-4 border-t border-white/5 flex items-center justify-center gap-2 opacity-40">
                    <MessageSquare className="w-3 h-3 text-white" />
                    <span className="text-[9px] font-black text-white uppercase tracking-widest italic">TalentFlow Experience Center</span>
                </div>
            </div>
        </div>
    );
}
