// src/pages/PlaceholderPage.jsx
// Placeholder page for features under development

import { Globe, Sparkles, MessageSquare, BarChart3, Construction } from 'lucide-react';

const PAGE_INFO = {
    scraper: {
        title: 'Scraper',
        icon: Globe,
        description: 'LinkedIn, GitHub ve kariyer sitelerinden aday profillerini otomatik olarak tarayın ve aday havuzunuza ekleyin.',
        color: 'text-cyan-400',
        bg: 'bg-cyan-500/10',
    },
    'ai-match': {
        title: 'AI Match',
        icon: Sparkles,
        description: 'Yapay zeka ile açık pozisyonlarınıza en uygun adayları otomatik eşleştirin ve uyumluluk skorları alın.',
        color: 'text-violet-400',
        bg: 'bg-violet-500/10',
    },
    messages: {
        title: 'Messages',
        icon: MessageSquare,
        description: 'Adaylarla doğrudan iletişim kurun. Otomatik mesaj şablonları ve toplu iletişim özellikleri.',
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
    },
    analytics: {
        title: 'Analytics',
        icon: BarChart3,
        description: 'İşe alım süreçlerinizi analiz edin. Time-to-hire, kaynak verimliliği ve pipeline metrikleri.',
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
    },
};

export default function PlaceholderPage({ pageId }) {
    const info = PAGE_INFO[pageId] || {
        title: pageId,
        icon: Construction,
        description: 'Bu sayfa geliştirilmektedir.',
        color: 'text-navy-400',
        bg: 'bg-navy-800',
    };
    const Icon = info.icon;

    return (
        <>
            <header className="sticky top-0 z-40 px-6 lg:px-8 h-16 flex items-center border-b border-white/[0.06] bg-navy-900/80 backdrop-blur-xl">
                <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white to-navy-300 bg-clip-text text-transparent">
                    {info.title}
                </h1>
            </header>

            <div className="flex flex-col items-center justify-center py-32 px-6 text-center animate-fade-in-up">
                <div className={`w-24 h-24 rounded-3xl ${info.bg} border border-white/[0.06] flex items-center justify-center mb-6`}
                    style={{ animation: 'float-subtle 3s ease-in-out infinite' }}
                >
                    <Icon className={`w-10 h-10 ${info.color}`} />
                </div>

                <h2 className="text-2xl font-bold text-white mb-2">{info.title}</h2>
                <p className="text-sm text-navy-400 max-w-md mb-8 leading-relaxed">
                    {info.description}
                </p>

                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <Construction className="w-4 h-4 text-navy-500" />
                    <span className="text-[12px] text-navy-500 font-medium">Geliştirme Aşamasında</span>
                </div>
            </div>
        </>
    );
}
