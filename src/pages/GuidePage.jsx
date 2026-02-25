import React, { useState } from 'react';
import {
    Zap, Rocket, Target, Users, Search,
    Sparkles, ShieldCheck, Mail, Calendar,
    BookOpen, ChevronRight, LayoutDashboard,
    GitBranch, ArrowRight, Star, Globe,
    BarChart3, Settings, Briefcase, Award,
    X, CheckCircle2, AlertCircle, MousePointer2,
    Database, Clock, Heart, MessageSquare,
    Upload, Brain, Layers, FileText
} from 'lucide-react';

const FEATURES_DETAIL = [
    {
        id: 'cv-upload',
        icon: Upload,
        title: "CV Ekleme & Ayrıştırma",
        desc: "Dosyalarınızı sisteme yükleyin, AI tüm veriyi (Deneyim, Eğitim, İletişim) otomatik olarak yapılandırılmış tabloya dönüştürsün.",
        color: "text-blue-400",
        bgColor: "bg-blue-400/10",
        howItWorks: [
            "Aday Görünümü sayfasındaki 'Aday Ekle' butonuna tıklayın.",
            "PDF veya Word formatındaki CV dosyasını sürükleyip bırakın.",
            "AI OCR ve NLP tekniklerini kullanarak metni analiz eder.",
            "Saniyeler içinde adayın tüm kariyer geçmişi 'Aday Kartı' olarak hazır hale gelir."
        ],
        preview: (
            <div className="space-y-4">
                <div className="border-2 border-dashed border-white/10 rounded-2xl p-6 text-center bg-white/[0.02]">
                    <Upload className="w-8 h-8 text-blue-400 mx-auto mb-2 animate-bounce" />
                    <div className="text-[10px] text-navy-400 font-bold uppercase tracking-widest">CV Dosyasını Buraya Bırakın</div>
                </div>
                <div className="flex items-center gap-3 bg-white/5 p-2 rounded-xl border border-white/10 animate-pulse">
                    <FileText className="w-4 h-4 text-navy-400" />
                    <div className="h-2 w-24 bg-white/10 rounded-full" />
                    <div className="ml-auto text-[8px] text-emerald-400 font-bold">%100 OKUNDU</div>
                </div>
            </div>
        )
    },
    {
        id: 'candidate-mgmt',
        icon: Layers,
        title: "Aday Yönetimi & Pipeline",
        desc: "Adayları süreçlerine göre kategorize edin, durumlarını güncelleyin ve tüm havuzu merkezi bir noktadan yönetin.",
        color: "text-emerald-400",
        bgColor: "bg-emerald-400/10",
        howItWorks: [
            "Aday Görünümü (Candidate Process) sayfasından tüm aday listesine erişin.",
            "Filtreleme araçlarını kullanarak pozisyon veya tecrübe yılına göre daraltma yapın.",
            "Adayların durumunu (Mülakat, Değerlendirme, Red) tek tıkla güncelleyin.",
            "Aday kartına girerek tüm geçmiş etkileşimleri ve AI analizlerini tek sayfada görün."
        ],
        preview: (
            <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                    <div className="h-1 rounded-full bg-emerald-500" />
                    <div className="h-1 rounded-full bg-navy-800" />
                    <div className="h-1 rounded-full bg-navy-800" />
                </div>
                <div className="space-y-2">
                    {[1, 2].map(i => (
                        <div key={i} className="bg-white/5 border border-white/10 p-2 rounded-lg flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-navy-700 to-navy-600" />
                            <div className="flex-1 space-y-1">
                                <div className="h-1.5 w-12 bg-white/10 rounded" />
                                <div className="h-1 w-20 bg-white/5 rounded" />
                            </div>
                            <div className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">Mülakat</div>
                        </div>
                    ))}
                </div>
            </div>
        )
    },
    {
        id: 'ai-principles',
        icon: Brain,
        title: "AI Analiz Esasları",
        desc: "Ham veri yerine 'somut kanıt' odaklı derin analiz. STAR metodolojisi ve yetkinlik skorlama mantığını keşfedin.",
        color: "text-purple-400",
        bgColor: "bg-purple-400/10",
        howItWorks: [
            "Kanıta Dayalı Analiz: AI, özgeçmişteki her iddiayı somut bir tecrübe cümlesiyle eşleştirir.",
            "STAR Puanlaması: Deneyimler (Situation, Task, Action, Result) çerçevesinde 5 üzerinden puanlanır.",
            "Kritik Eksik Tespiti: İş tanımıyla (JD) aday arasındaki uyumsuzluklar mülakat sorusu olarak önerilir.",
            "Bias-Free: AI sadece profesyonel yetkinliklere ve kanıtlanmış başarılara odaklanır."
        ],
        preview: (
            <div className="space-y-4">
                <div className="flex justify-between items-center px-2">
                    <span className="text-[10px] font-black text-white uppercase tracking-tighter">AI Reasoning Engine</span>
                    <Sparkles className="w-3 h-3 text-purple-400" />
                </div>
                <div className="bg-purple-500/5 border border-purple-500/20 p-3 rounded-xl space-y-2">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span className="text-[9px] text-navy-300">Evidence Found: Lead 12 people in AWS migration</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                        <span className="text-[9px] text-white font-bold tracking-tight">STAR SCORE: 4.8/5</span>
                    </div>
                </div>
            </div>
        )
    },
    {
        id: 'positions',
        icon: Briefcase,
        title: "Pozisyon Yönetimi",
        desc: "İşe alım yapmak istediğiniz roller için iş tanımları (JD) oluşturun. AI, bu tanımları analiz ederek adayları buna göre puanlar.",
        color: "text-amber-400",
        bgColor: "bg-amber-400/10",
        howItWorks: [
            "Pozisyonlar sayfasına gidin ve 'Yeni Pozisyon' butonuna tıklayın.",
            "İş unvanını ve detaylı iş tanımını (JD) girin.",
            "AI, bu metni analiz ederek 'Gerekli Yetenekler' ve 'Beklenen Tecrübe' listeleyecektir.",
            "Kaydettiğiniz pozisyon her aday kartında bir 'Hedef' olarak seçilebilir hale gelir."
        ],
        preview: (
            <div className="space-y-3">
                <div className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-400/20 flex items-center justify-center text-amber-400"><Briefcase className="w-4 h-4" /></div>
                        <div>
                            <div className="text-xs font-bold text-white">Senior Frontend Developer</div>
                            <div className="text-[10px] text-navy-500">Aktif • 12 Aday</div>
                        </div>
                    </div>
                    <div className="text-[10px] text-emerald-400 border border-emerald-400/20 px-2 py-0.5 rounded-full">Analiz Edildi</div>
                </div>
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-2">
                    <div className="h-2 w-1/3 bg-white/10 rounded-full" />
                    <div className="h-1.5 w-full bg-white/5 rounded-full" />
                    <div className="h-1.5 w-5/6 bg-white/5 rounded-full" />
                    <div className="h-1.5 w-4/6 bg-white/5 rounded-full" />
                </div>
            </div>
        )
    },
    {
        id: 'interview',
        icon: Zap,
        title: "Agentic Mülakat",
        desc: "AI asistanı ile canlı mülakatlar yapın. AI, adayın cevaplarına göre size anlık 'yeni' ve 'derinleşme' soruları önerir.",
        color: "text-violet-400",
        bgColor: "bg-violet-400/10",
        howItWorks: [
            "Aday kartındaki 'Mülakat Yap' butonuna basın.",
            "AI'ın sunduğu 3 farklı başlangıç rotasından birini seçin.",
            "Adayın cevaplarını sisteme girin; asistan bu cevaplardan teknik veya kültürel açıklar yakalamaya çalışır.",
            "Mülakat sırasında anlık olarak 'Stres Yönetimi', 'Teknik Derinlik' gibi modları kullanarak AI'dan spesifik sorular talep edin."
        ],
        preview: (
            <div className="space-y-3">
                <div className="bg-violet-500/10 border border-violet-500/20 p-3 rounded-xl">
                    <div className="text-[10px] text-violet-400 font-bold mb-1 italic">AI Önerisi:</div>
                    <div className="text-xs text-white leading-relaxed">"Projede kullandığınız mikroservis mimarisinde hata yönetimini (circuit breaker vb.) nasıl kurguladınız?"</div>
                </div>
                <div className="flex gap-2">
                    <div className="flex-1 h-7 bg-white/5 rounded-lg border border-white/5 flex items-center justify-center text-[10px] text-navy-300">Derinleş (+)</div>
                    <div className="flex-1 h-7 bg-white/5 rounded-lg border border-white/5 flex items-center justify-center text-[10px] text-navy-300">Yeni Soru (⚡)</div>
                </div>
            </div>
        )
    },
    {
        id: 'calendar',
        icon: Calendar,
        title: "Akıllı Takvim",
        desc: "Google Workspace entegrasyonu ile mülakatları planlayın, Meet linklerini oluşturun ve adaya davet e-postalarını otomatik gönderin.",
        color: "text-rose-400",
        bgColor: "bg-rose-400/10",
        howItWorks: [
            "Ayarlar > Entegrasyonlar kısmından Google hesabınızı bağlayın.",
            "Aday kartındaki 'Mesaj Gönder' butonuna tıklayın.",
            "Mülakat tarih ve saatini seçtiğinizde, takvimde bir etkinlik oluşur ve Meet linki otomatik atanır.",
            "Davet taslağınızdaki [Takvim Linki] alanı, oluşan Meet linki ile yer değiştirir."
        ],
        preview: (
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-lg p-1.5"><svg viewBox="0 0 24 24" className="w-full h-full"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg></div>
                    <div className="text-[11px] font-bold text-white uppercase tracking-wider">Takvime Ekle</div>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-lg flex items-center justify-center gap-2">
                    <Globe className="w-3 h-3 text-emerald-400" />
                    <span className="text-[9px] font-mono text-emerald-400">meet.google.com/abc-defg-hij</span>
                </div>
            </div>
        )
    },
    {
        id: 'gdpr',
        icon: ShieldCheck,
        title: "GDPR & KVKK",
        desc: "Ham CV verilerini analizden 15 gün sonra otomatik silerek yasal uyumunuzu garanti altına alın.",
        color: "text-cyan-400",
        bgColor: "bg-cyan-400/10",
        howItWorks: [
            "Adayların CV doyaları sisteme yüklendiğinde analiz süreci başlar.",
            "Analiz tamamlanıp aday kartı oluştuktan sonra, sistem geri sayımı (15 gün) başlatır.",
            "Ham dosya (PDF/Docx) süre dolduğunda kalıcı olarak sunucudan silinir.",
            "Adayın profesyonel verileri skorlama için anonymize edilerek saklanmaya devam eder."
        ],
        preview: (
            <div className="p-4 bg-navy-900/40 rounded-2xl border border-cyan-500/20 flex flex-col items-center gap-2 text-center">
                <ShieldCheck className="w-8 h-8 text-cyan-400" />
                <div className="text-[10px] font-bold text-white">Güvenli Veri Politikası</div>
                <div className="flex gap-1 mt-1">
                    <Clock className="w-3 h-3 text-cyan-500/60" />
                    <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full w-2/3 bg-cyan-500" />
                    </div>
                </div>
                <div className="text-[8px] text-navy-500 uppercase font-bold mt-2 tracking-tighter">İmha Tarihi: 12 Mart 2024</div>
            </div>
        )
    }
];

export default function GuidePage() {
    const [selectedFeature, setSelectedFeature] = useState(null);

    return (
        <div className="flex flex-col min-h-screen bg-navy-950/20">
            {/* Header / Hero Section */}
            <header className="relative py-16 px-6 lg:px-12 overflow-hidden border-b border-white/[0.06] bg-navy-900/60 backdrop-blur-2xl">
                <div className="absolute top-0 right-0 p-24 opacity-10 blur-3xl bg-electric rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 p-32 opacity-5 blur-3xl bg-purple-500 rounded-full translate-y-1/2 -translate-x-1/2" />

                <div className="relative max-w-5xl mx-auto text-center space-y-6">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-electric/10 border border-electric/20 text-electric-light text-[10px] font-black uppercase tracking-[0.2em] animate-fade-in-up">
                        <Sparkles className="w-3 h-3" /> TalentFlow Rehberi
                    </div>
                    <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white leading-tight animate-fade-in-up delay-100">
                        Modern İşe Alımın <br />
                        <span className="bg-gradient-to-r from-electric-light via-cyan-accent to-purple-400 bg-clip-text text-transparent">Yapay Zeka Destekli</span> Yeni Nesli
                    </h1>
                    <p className="text-navy-400 text-lg max-w-2xl mx-auto leading-relaxed animate-fade-in-up delay-200">
                        TalentFlow, sıradan bir aday takip sisteminden çok daha fazlasıdır. Adayları saniyeler içinde analiz eden, mülakatlarda yanınızda olan ve takviminizi yöneten akıllı bir işe alım ortağıdır.
                    </p>
                </div>
            </header>

            <main className="flex-1 px-6 lg:px-12 py-16 max-w-6xl mx-auto w-full space-y-24">

                {/* 1. Temel Bileşenler */}
                <section className="space-y-12">
                    <div className="text-center">
                        <h2 className="text-2xl font-black text-white uppercase tracking-widest flex items-center justify-center gap-3">
                            <LayoutDashboard className="w-6 h-6 text-electric" /> Temel Özellikler
                        </h2>
                        <p className="text-[11px] text-navy-500 mt-2 font-bold uppercase tracking-widest italic animate-pulse">Detayları görmek için bir kutuya tıklayın</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {FEATURES_DETAIL.map((f) => (
                            <FeatureCard
                                key={f.id}
                                icon={f.icon}
                                title={f.title}
                                desc={f.desc}
                                color={f.color}
                                bgColor={f.bgColor}
                                onClick={() => setSelectedFeature(f)}
                                isActive={selectedFeature?.id === f.id}
                            />
                        ))}
                    </div>
                </section>

                {/* Detail Panel Area */}
                {selectedFeature && (
                    <section id="feature-detail" className="animate-fade-in-up">
                        <div className="glass rounded-[3rem] p-1 shadow-2xl overflow-hidden group relative">
                            <div className={`absolute top-0 right-0 p-32 opacity-10 blur-3xl ${selectedFeature.bgColor.replace('/10', '')} rounded-full -translate-y-1/2 translate-x-1/2`} />

                            <div className="bg-navy-950/60 rounded-[2.9rem] p-8 md:p-12">
                                <div className="flex items-center justify-between mb-12">
                                    <div className="flex items-center gap-5">
                                        <div className={`w-14 h-14 rounded-2xl ${selectedFeature.bgColor} flex items-center justify-center border border-white/5`}>
                                            <selectedFeature.icon className={`w-7 h-7 ${selectedFeature.color}`} />
                                        </div>
                                        <div>
                                            <h3 className="text-2xl md:text-3xl font-black text-white tracking-tight">{selectedFeature.title}</h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <div className={`h-1 w-1 rounded-full ${selectedFeature.bgColor.replace('/10', '')}`} />
                                                <span className="text-[10px] text-navy-500 font-black uppercase tracking-widest">Özellik Derin Analizi</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedFeature(null)}
                                        className="p-3 rounded-2xl bg-white/5 border border-white/10 text-navy-400 hover:text-white hover:bg-white/10 transition-all"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                                    <div className="space-y-8">
                                        <div className="space-y-4">
                                            <h4 className="text-sm font-black text-white/40 uppercase tracking-widest flex items-center gap-2">
                                                <MousePointer2 className="w-4 h-4" /> Nasıl Kullanılır?
                                            </h4>
                                            <div className="space-y-3">
                                                {selectedFeature.howItWorks.map((step, i) => (
                                                    <div key={i} className="flex gap-4 group/step">
                                                        <div className="text-[10px] font-black text-navy-600 group-hover/step:text-electric transition-colors mt-1">{String(i + 1).padStart(2, '0')}</div>
                                                        <p className="text-sm text-navy-300 leading-relaxed font-medium">{step}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/[0.04] space-y-4">
                                            <div className="flex items-center gap-2 text-[10px] font-black text-navy-500 uppercase tracking-widest">
                                                <AlertCircle className="w-3.5 h-3.5" /> İpucu
                                            </div>
                                            <p className="text-xs text-navy-400 italic leading-relaxed">
                                                Bu özelliği verimli kullanmak, işe alım maliyetlerini %40'a kadar azaltır ve aday deneyimini profesyonelleştirir.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <h4 className="text-sm font-black text-white/40 uppercase tracking-widest flex items-center gap-2">
                                            <Globe className="w-4 h-4" /> Arayüz Önizleme
                                        </h4>
                                        <div className="relative group/preview">
                                            <div className={`absolute -inset-4 bg-gradient-to-br from-white/10 to-transparent rounded-[2rem] blur-xl opacity-0 group-hover/preview:opacity-100 transition-opacity duration-700`} />
                                            <div className="relative border border-white/10 rounded-3xl bg-navy-900/60 p-8 shadow-2xl backdrop-blur-md">
                                                <div className="absolute top-4 right-6 flex gap-1">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                                                    <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                                                    <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                                                </div>
                                                {selectedFeature.preview}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* 2. Step by Step Guide (Workflow) */}
                <section className="space-y-12 bg-white/[0.02] border border-white/[0.06] rounded-[3rem] p-12 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none"><Rocket className="w-48 h-48 text-white" /></div>

                    <div className="max-w-3xl">
                        <h2 className="text-3xl font-black text-white mb-4 italic uppercase tracking-tighter">İş Akışı: İlk Adayınızı Nasıl Alırsınız?</h2>
                        <p className="text-navy-400 text-sm mb-12 italic">TalentFlow üzerinde uçtan uca bir kiralama süreci başlatmak oldukça basittir.</p>
                    </div>

                    <div className="space-y-8 relative">
                        <div className="absolute left-6 top-6 bottom-6 w-px bg-gradient-to-b from-electric via-white/10 to-transparent hidden md:block" />

                        <StepItem
                            num="01"
                            title="Pozisyon Oluşturun"
                            desc="Pozisyonlar sayfasından bir iş tanımı girin. Bu metin, AI'ın adaylarda ne arayacağını bilmesini sağlar."
                        />
                        <StepItem
                            num="02"
                            title="Adayları Ekleyin"
                            desc="Aday CV'lerini sisteme yükleyin. Sistem, adayın profesyonel geçmişini otomatik olarak ayrıştıracak ve saklayacaktır."
                        />
                        <StepItem
                            num="03"
                            title="Aday Analizini İnceleyin"
                            desc="Aday kartına girerek AI tarafından ayrıştırılmış verileri ve öz geçmiş özetini inceleyin."
                        />
                        <StepItem
                            num="04"
                            title="Canlı Mülakat Oturumu"
                            desc="Uygulama üzerinden bir mülakat modu seçin ve mülakata başlayın. AI asistanının önerdiği derinleşme sorularıyla adayı zorlayın."
                        />
                        <StepItem
                            num="05"
                            title="İletişimi Tamamlayın"
                            desc="'Mesaj Gönder' diyerek adaya Meet linkini gönderin ve takviminize işleyin. Tüm süreç tek bir ekranda biter."
                        />
                    </div>
                </section>

                {/* 3. Deep Dive: Agentic Interview */}
                <section className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                    <div className="space-y-6">
                        <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
                            <Zap className="w-6 h-6 text-violet-400" />
                        </div>
                        <h2 className="text-3xl font-black text-white tracking-tight">Agentic Mülakat: <br />Yanınızdaki Uzman</h2>
                        <p className="text-navy-400 leading-relaxed">
                            Mülakat sırasında not tutma stresiyle vedalaşın. TalentFlow AI asistanı mülakatın her aşamasında size rehberlik eder:
                        </p>
                        <ul className="space-y-4">
                            <li className="flex gap-3">
                                <Award className="w-5 h-5 text-violet-400 shrink-0" />
                                <div className="text-sm text-navy-200">
                                    <b>Yetkinlik Modları:</b> Stres yönetimi, ekip uyumu, aidiyet gibi can alıcı yetkinlikler için anlık sorular isteyin.
                                </div>
                            </li>
                            <li className="flex gap-3">
                                <GitBranch className="w-5 h-5 text-violet-400 shrink-0" />
                                <div className="text-sm text-navy-200">
                                    <b>Derinleşme (Deepen):</b> Adayın cevabı zayıf mı kaldı? 'Derinleş' butonuna basın, AI teknik açıkları bulmak için detay sorusu sorsun.
                                </div>
                            </li>
                            <li className="flex gap-3">
                                <Star className="w-5 h-5 text-violet-400 shrink-0" />
                                <div className="text-sm text-navy-200">
                                    <b>AI Puanlama:</b> Mülakat bitince aday her soru için ayrı ayrı puanlanır ve mülakatçı notlarıyla birleşir.
                                </div>
                            </li>
                        </ul>
                    </div>

                    <div className="relative group">
                        <div className="absolute -inset-4 bg-gradient-to-br from-violet-600/20 to-electric/20 rounded-[3rem] blur-2xl group-hover:opacity-100 transition-opacity opacity-50 duration-500" />
                        <div className="relative border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl bg-navy-900/40 p-1">
                            <div className="p-8 border-b border-white/5 bg-navy-950/40 flex items-center justify-between">
                                <div className="flex gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/40" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/40" />
                                </div>
                                <div className="text-[10px] text-navy-500 font-black uppercase tracking-widest">Mülakat Arayüzü Önizleme</div>
                            </div>
                            <div className="p-8 space-y-4">
                                <div className="h-4 w-3/4 bg-white/5 rounded-full" />
                                <div className="h-4 w-1/2 bg-white/5 rounded-full" />
                                <div className="pt-8 grid grid-cols-2 gap-3">
                                    <div className="h-10 rounded-xl bg-violet-600/20 border border-violet-500/30" />
                                    <div className="h-10 rounded-xl bg-electric/20 border border-electric/30" />
                                </div>
                                <div className="pt-4 space-y-2">
                                    <div className="h-2 w-full bg-white/[0.03] rounded-full" />
                                    <div className="h-2 w-full bg-white/[0.03] rounded-full" />
                                    <div className="h-2 w-2/3 bg-white/[0.03] rounded-full" />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Final CTA / Help */}
                <div className="p-12 rounded-[3.5rem] bg-gradient-to-br from-electric via-blue-600 to-indigo-700 text-center space-y-6 shadow-[0_0_80px_rgba(59,130,246,0.2)]">
                    <h3 className="text-3xl font-black text-white tracking-tighter">İşe Alımın Geleceğini Yönetmeye Hazır mısınız?</h3>
                    <p className="text-white/80 text-sm max-w-lg mx-auto leading-relaxed">
                        TalentFlow, işe alım süreçlerinizi bir angaryadan ziyade stratejik bir kazanıma dönüştürür. Başlamak için sol menüyü kullanın.
                    </p>
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'dashboard' }))}
                        className="px-8 py-4 rounded-2xl bg-white text-electric font-black text-sm uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all inline-flex items-center gap-2 group cursor-pointer"
                    >
                        Şimdi Başla <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            </main>

            {/* Footer Padding for Mobile */}
            <div className="h-24 md:hidden" />
        </div>
    );
}

function FeatureCard({ icon: Icon, title, desc, color, bgColor, onClick, isActive }) {
    return (
        <div
            onClick={onClick}
            className={`group p-8 rounded-3xl border transition-all duration-300 cursor-pointer relative overflow-hidden
                ${isActive
                    ? 'bg-white/10 border-white/20 scale-[1.02] shadow-[0_0_40px_rgba(255,255,255,0.05)]'
                    : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.05] hover:border-white/10'}`}
        >
            <div className={`w-14 h-14 rounded-2xl ${bgColor} flex items-center justify-center mb-6 ring-8 ring-transparent group-hover:ring-white/5 transition-all`}>
                <Icon className={`w-7 h-7 ${color}`} />
            </div>
            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                {title}
                <ChevronRight className={`w-4 h-4 text-navy-600 transition-all ${isActive ? 'opacity-100 translate-x-1 text-white' : 'opacity-0 group-hover:opacity-100 group-hover:translate-x-1'}`} />
            </h3>
            <p className="text-sm text-navy-400 leading-relaxed">{desc}</p>
            {isActive && (
                <div className="absolute top-4 right-4 animate-pulse">
                    <div className="w-2 h-2 rounded-full bg-electric" />
                </div>
            )}
        </div>
    );
}

function StepItem({ num, title, desc }) {
    return (
        <div className="relative pl-12 md:pl-16 group">
            <div className="absolute left-0 top-0 w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-xs font-black text-navy-400 group-hover:bg-electric group-hover:text-white group-hover:border-electric transition-all shadow-xl">
                {num}
            </div>
            <div className="space-y-1">
                <h4 className="text-base font-bold text-white group-hover:text-electric-light transition-colors">{title}</h4>
                <p className="text-sm text-navy-400 leading-relaxed max-w-2xl">{desc}</p>
            </div>
        </div>
    );
}
