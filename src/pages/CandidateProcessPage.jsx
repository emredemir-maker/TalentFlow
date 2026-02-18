// src/pages/CandidateProcessPage.jsx
// Transparent Dashboard for Candidates

import Header from '../components/Header';
import StarScoreCard from '../components/StarScoreCard';
import {
    Activity,
    Briefcase,
    CheckCircle,
    Calendar,
    MessageSquare,
    Link,
    Clock,
    User,
    Mail,
    Phone
} from 'lucide-react';

const MOCK_CANDIDATE = {
    name: 'Emre Demir',
    position: 'Full Stack Developer',
    status: 'Mülakat Aşamasında',
    timeline: [
        { title: 'Başvuru Alındı', date: '10 Şubat 2026', status: 'completed' },
        { title: 'AI Ön Değerlendirme', date: '11 Şubat 2026', status: 'completed' },
        { title: 'Teknik Mülakat', date: 'Bekleniyor', status: 'upcoming' },
        { title: 'Teklif', date: '-', status: 'pending' },
    ],
    feedback: {
        ai_summary: "Aday teknik konularda oldukça yetkin. STAR tekniğine uygun cevaplar vererek problem çözme yeteneğini net bir şekilde ortaya koydu. Takım çalışması konusunda örnekleri güçlendirilebilir.",
        star_scores: {
            Situation: 9,
            Task: 8,
            Action: 9,
            Result: 7
        }
    }
};

export default function CandidateProcessPage() {
    return (
        <div className="min-h-screen pb-20">
            <Header title="Aday Süreç Portalı" />

            <div className="max-w-6xl mx-auto px-6 lg:px-8 py-8 space-y-8">

                {/* Status Header */}
                <div className="glass rounded-3xl p-8 border border-white/[0.06] flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-electric/5 rounded-full blur-[100px] -z-10" />

                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-electric to-blue-600 flex items-center justify-center text-2xl font-bold text-white shadow-xl shadow-electric/20">
                            ED
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-1">{MOCK_CANDIDATE.name}</h2>
                            <div className="flex items-center gap-2 text-navy-300 text-sm">
                                <Briefcase className="w-4 h-4 text-electric" />
                                {MOCK_CANDIDATE.position}
                                <span className="text-navy-600">•</span>
                                <span className="bg-electric/10 text-electric px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider">
                                    {MOCK_CANDIDATE.status}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 w-full md:w-auto">
                        <button className="flex-1 md:flex-none px-5 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/[0.06] font-semibold text-sm transition-all flex items-center justify-center gap-2">
                            <Mail className="w-4 h-4" />
                            Mesaj Gönder
                        </button>
                        <button className="flex-1 md:flex-none px-5 py-2.5 rounded-xl bg-electric hover:bg-electric-light text-white font-bold text-sm shadow-lg shadow-electric/20 transition-all flex items-center justify-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Mülakat Planla
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Timeline & Info */}
                    <div className="space-y-6">
                        {/* Timeline */}
                        <div className="glass rounded-3xl p-6 border border-white/[0.06]">
                            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                                <Activity className="w-5 h-5 text-emerald-400" />
                                Süreç Takibi
                            </h3>
                            <div className="relative pl-4 border-l-2 border-navy-800 space-y-8">
                                {MOCK_CANDIDATE.timeline.map((step, index) => (
                                    <div key={index} className="relative group">
                                        <span className={`absolute -left-[21px] top-1.5 w-3 h-3 rounded-full border-2 transition-all ${step.status === 'completed'
                                            ? 'bg-emerald-500 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                                            : step.status === 'upcoming'
                                                ? 'bg-navy-900 border-electric animate-pulse'
                                                : 'bg-navy-900 border-navy-700'
                                            }`} />

                                        <div>
                                            <h4 className={`text-sm font-bold ${step.status === 'completed' ? 'text-white' : step.status === 'upcoming' ? 'text-electric' : 'text-navy-500'}`}>
                                                {step.title}
                                            </h4>
                                            <p className="text-xs text-navy-400 mt-1">{step.date}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Contact Info */}
                        <div className="glass rounded-3xl p-6 border border-white/[0.06]">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <User className="w-5 h-5 text-blue-400" />
                                İletişim Bilgileri
                            </h3>
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02]">
                                    <Mail className="w-4 h-4 text-navy-400" />
                                    <span className="text-sm text-navy-200">emre.demir@example.com</span>
                                </div>
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02]">
                                    <Phone className="w-4 h-4 text-navy-400" />
                                    <span className="text-sm text-navy-200">+90 555 123 45 67</span>
                                </div>
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02]">
                                    <Link className="w-4 h-4 text-navy-400" />
                                    <a href="#" className="text-sm text-electric hover:underline">linkedin.com/in/emredemir</a>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: AI Feedback & Scorecard */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* STAR Scorecard */}
                        <StarScoreCard
                            analysis={{
                                ...MOCK_CANDIDATE.feedback.star_scores,
                                Summary: MOCK_CANDIDATE.feedback.ai_summary
                            }}
                        />

                        {/* Detailed Feedback */}
                        <div className="glass rounded-3xl p-6 border border-white/[0.06]">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <MessageSquare className="w-5 h-5 text-amber-400" />
                                Detaylı Geri Bildirim
                            </h3>
                            <div className="space-y-4 text-sm text-navy-300 leading-relaxed">
                                <p>
                                    Aday, özellikle <strong className="text-white">Situation (Durum)</strong> ve <strong className="text-white">Action (Eylem)</strong> aşamalarında çok güçlü bir performans sergiledi.
                                    Geçmiş projelerinde karşılaştığı zorlukları net bir şekilde ifade etti ve aldığı aksiyonların teknik detaylarına hakim olduğunu gösterdi.
                                </p>
                                <p>
                                    Ancak, <strong className="text-white">Result (Sonuç)</strong> kısmında sayısal verilerle (KPI, % artış vb.) destekleme konusunda daha somut örnekler verebilirdi.
                                    Gelecek mülakatlarda bu konunun üzerine gidilmesi önerilir.
                                </p>
                                <div className="mt-4 p-4 rounded-xl bg-electric/5 border border-electric/10 text-electric-light text-xs font-medium">
                                    <span className="font-bold block mb-1">💡 İpucu:</span>
                                    Teknik mülakatta adayın sistem tasarımı yeteneğini ölçecek bir case study verilmesi faydalı olacaktır.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
