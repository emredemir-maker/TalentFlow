import React, { useState } from 'react';
import {
    Zap, Rocket, Target, Users, Search,
    Sparkles, ShieldCheck, Mail, Calendar,
    BookOpen, ChevronRight, LayoutDashboard,
    GitBranch, ArrowRight, Star, Globe,
    BarChart3, Settings, Briefcase, Award,
    X, CheckCircle2, AlertCircle, MousePointer2, Activity,
    Database, Clock, Heart, MessageSquare,
    Upload, Brain, Layers, FileText,
    Building2, Unlock, Send, Eye, UserCog, Link2
} from 'lucide-react';

const FEATURES_DETAIL = [
    {
        id: 'cv-upload',
        icon: Upload,
        title: "Nöral CV Ayrıştırma (OCR+NLP)",
        desc: "Ham dosyaları saniyeler içinde yapılandırılmış stratejik veriye dönüştürün. AI, adayın tüm kariyer yolculuğunu otomatik olarak kronolojik bir başarı akışına çevirir.",
        color: "text-blue-400",
        bgColor: "bg-blue-400/10",
        howItWorks: [
            "Aday Görünümü sayfasındaki 'Aday Ekle' butonuna tıklayın.",
            "PDF veya Word formatındaki CV dosyasını sürükleyip bırakın.",
            "AI, gelişmiş NLP teknikleriyle metni ayrıştırı ve yetkinlikleri etiketler.",
            "Saniyeler içinde adayın tüm kariyer geçmişi 'Aday Kartı' olarak sistemde yerini alır."
        ],
        preview: (
            <div className="space-y-4">
                <div className="border-2 border-dashed border-text-primary/10 rounded-2xl p-6 text-center bg-text-primary/[0.02]">
                    <Upload className="w-8 h-8 text-blue-400 mx-auto mb-2 animate-bounce" />
                    <div className="text-[10px] text-navy-400 font-bold uppercase tracking-widest">Ayrıştırma Motoru Hazır</div>
                </div>
                <div className="flex items-center gap-3 bg-text-primary/5 p-2 rounded-xl border border-text-primary/10 animate-pulse">
                    <FileText className="w-4 h-4 text-navy-400" />
                    <div className="h-2 w-24 bg-text-primary/10 rounded-full" />
                    <div className="ml-auto text-[8px] text-emerald-400 font-bold">ANALİZ TAMAMLANDI</div>
                </div>
            </div>
        )
    },
    {
        id: 'candidate-mgmt',
        icon: Layers,
        title: "Aday Pipeline Yönetimi",
        desc: "Adayları süreçlerine göre kategorize edin. Dinamik filtreleme ve durum takibi ile tüm işe alım hunisini tek bir kontrol merkezinden yönetin.",
        color: "text-emerald-400",
        bgColor: "bg-emerald-400/10",
        howItWorks: [
            "Candidate Process sayfasından tüm aktif aday listesine erişin.",
            "Pozisyon bazlı veya tecrübe yılına göre gelişmiş filtreler uygulayın.",
            "Adayların durumunu (Mülakat, Değerlendirme, Red) anlık olarak güncelleyin.",
            "Pipeline üzerinden aday etkileşimlerini merkezi olarak izleyin."
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
                        <div key={i} className="bg-text-primary/5 border border-text-primary/10 p-2 rounded-lg flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-navy-700 to-navy-600" />
                            <div className="flex-1 space-y-1">
                                <div className="h-1.5 w-12 bg-text-primary/10 rounded" />
                                <div className="h-1 w-20 bg-text-primary/5 rounded" />
                            </div>
                            <div className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">Aktif Süreç</div>
                        </div>
                    ))}
                </div>
            </div>
        )
    },
    {
        id: 'ai-principles',
        icon: Brain,
        title: "Kanıta Dayalı Analiz Motoru",
        desc: "AI, ham veriler yerine 'somut kanıtlar' üzerinden skorlama yapar. STAR metodolojisini temel alan objektif değerlendirme algoritmasıyla tanışın.",
        color: "text-purple-400",
        bgColor: "bg-purple-400/10",
        howItWorks: [
            "Objektif Analiz: AI, özgeçmişteki iddiaları somut başarı cümleleriyle doğrular.",
            "STAR Puanlaması: Deneyimler (Situation, Task, Action, Result) çerçevesinde skorlanır.",
            "Gap Analysis: İş tanımı ile aday arasındaki kritik farklar otomatik raporlanır.",
            "Önyargısız Seçim: Sadece profesyonel yetkinliklere odaklanan 'Bias-Free' yaklaşım."
        ],
        preview: (
            <div className="space-y-4">
                <div className="flex justify-between items-center px-2">
                    <span className="text-[10px] font-black text-text-primary uppercase tracking-tighter">AI Reasoner V2</span>
                    <Sparkles className="w-3 h-3 text-purple-400" />
                </div>
                <div className="bg-purple-500/5 border border-purple-500/20 p-3 rounded-xl space-y-2">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span className="text-[9px] text-navy-300">Kanıt: AWS migrasyonunda %40 maliyet tasarrufu sağlandı</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                        <span className="text-[9px] text-text-primary font-bold tracking-tight">STAR SKORU: 4.9/5</span>
                    </div>
                </div>
            </div>
        )
    },
    {
        id: 'positions',
        icon: Briefcase,
        title: "Hedef Pozisyon & JD Analizi",
        desc: "İş tanımlarınızı (JD) sisteme tanıtın. AI, bu tanımları analiz ederek adayları spesifik pozisyon gereksinimlerinize göre hassas bir şekilde eşleştirir.",
        color: "text-amber-400",
        bgColor: "bg-amber-400/10",
        howItWorks: [
            "Pozisyonlar sayfasından detaylı iş tanımlarını sisteme girin.",
            "AI, metindeki kritik yetkinlikleri ve tecrübe beklentilerini ayıklar.",
            "Her yeni pozisyon, aday havuzunuz için otomatik bir 'karşılaştırma hedefi' olur.",
            "Dinamik skorlama sayesinde adayın her farklı role olan uygunluğunu ayrı görün."
        ],
        preview: (
            <div className="space-y-3">
                <div className="flex items-center justify-between bg-text-primary/5 p-3 rounded-xl border border-text-primary/10">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-400/20 flex items-center justify-center text-amber-400"><Briefcase className="w-4 h-4" /></div>
                        <div>
                            <div className="text-xs font-bold text-text-primary">Cloud Architecture Specialist</div>
                            <div className="text-[10px] text-navy-500">Stratejik Rol • 8 Aday</div>
                        </div>
                    </div>
                    <div className="text-[10px] text-emerald-400 border border-emerald-400/20 px-2 py-0.5 rounded-full">Optimize Edildi</div>
                </div>
                <div className="bg-text-primary/[0.02] border border-text-primary/5 rounded-xl p-4 space-y-2">
                    <div className="h-2 w-1/3 bg-text-primary/10 rounded-full" />
                    <div className="h-1.5 w-full bg-text-primary/5 rounded-full" />
                    <div className="h-1.5 w-5/6 bg-text-primary/5 rounded-full" />
                </div>
            </div>
        )
    },
    {
        id: 'shadow-observer',
        icon: Eye,
        title: "Shadow Observer: Canlı Y.Z. Gözlemcisi",
        desc: "Mülakatın her saniyesini dinleyen 'Gölge Gözlemci' ile tanışın. Gemini 2.0 Multimodal Audio altyapısıyla çalışır; hem sizin hem de adayın sesini dijital olarak analiz eder.",
        color: "text-emerald-400",
        bgColor: "bg-emerald-400/10",
        howItWorks: [
            "Interview Bridge: 'Botu Toplantıya Sok' diyerek Meet/Zoom sekmesini ve 'SİSTEM SESİNİ' paylaşın.",
            "Hibrit Miksaj: Sistem, mikrofonunuzu ve toplantı sesini AudioContext üzerinden birleştirerek kusursuz analiz yapar.",
            "Canlı STAR Denetimi: Adayın cevapları konuşma anında S-T-A-R kriterlerine ve mantık bütünlüğüne göre skorlanır.",
            "Taktiksel Rehberlik: AI asistanı mülakat sırasında yan panelden 'Derinleş' veya 'Soru Grubu Değiştir' gibi taktikler fısıldar."
        ],
        preview: (
            <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-black text-text-primary uppercase tracking-tighter">MÜLAKAT KÖPRÜSÜ AKTİF</span>
                    </div>
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                    {['S', 'T', 'A', 'R'].map(s => (
                        <div key={s} className="bg-text-primary/5 border border-text-primary/10 p-2 rounded-lg text-center">
                            <div className="text-[8px] text-navy-500 font-bold mb-1">{s}</div>
                            <div className="h-1 w-full bg-navy-800 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 w-3/4" />
                            </div>
                        </div>
                    ))}
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/20 p-2.5 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                        <Activity className="w-3 h-3 text-emerald-400" />
                        <span className="text-[9px] text-emerald-400 font-bold uppercase">Intel Stream</span>
                    </div>
                    <div className="h-1.5 w-full bg-text-primary/5 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 w-2/3 animate-[shimmer_2s_infinite]" />
                    </div>
                </div>
            </div>
        )
    },
    {
        id: 'calendar',
        icon: Calendar,
        title: "Google Workspace Entegrasyonu",
        desc: "İletişimi tek bir noktadan yönetin. Takvimde mülakat planlayın, otomatik Meet bağlantıları oluşturun ve adaya profesyonel davetler gönderin.",
        color: "text-rose-400",
        bgColor: "bg-rose-400/10",
        howItWorks: [
            "Ayarlar üzerinden Google/Gmail hesabınızı tek tıkla bağlayın.",
            "Mülakat planlarken takviminizdeki müsaitlik durumunu görün.",
            "Meet bağlantısı sisteme otomatik tanımlanır ve aday e-postasına eklenir.",
            "Tüm süreç sonunda takvim etkinliği ve aday dosyası senkronize edilir."
        ],
        preview: (
            <div className="bg-text-primary/[0.03] border border-text-primary/10 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-lg p-1.5"><svg viewBox="0 0 24 24" className="w-full h-full"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg></div>
                    <div className="text-[11px] font-bold text-text-primary uppercase tracking-wider">Sync Active</div>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-lg flex items-center justify-center gap-2">
                    <Globe className="w-3 h-3 text-emerald-400" />
                    <span className="text-[9px] font-mono text-emerald-400">meet.google.com/talentflow-room</span>
                </div>
            </div>
        )
    },
    {
        id: 'gdpr',
        icon: ShieldCheck,
        title: "KVKK & Tasfiye Politikası",
        desc: "Yasal uyumlulukta tam güvenlik. Ham CV verilerini analizden sonra belirlediğiniz takvimde otomatik imha ederek verinizi koruyun.",
        color: "text-cyan-400",
        bgColor: "bg-cyan-400/10",
        howItWorks: [
            "Dosya sisteme girdiği andan itibaren tasfiye saati işlemeye başlar.",
            "Analiz tamamlanıp dijital veri oluştuktan sonra dilediğiniz gün sayısını seçin.",
            "Sistem, ham PDF/Word dosyalarını kalıcı olarak sunucudan siler.",
            "Anonimize edilmiş analiz verileri uzun süreli raporlama için güvenle saklanır."
        ],
        preview: (
            <div className="p-4 bg-navy-900/40 rounded-2xl border border-cyan-500/20 flex flex-col items-center gap-2 text-center">
                <ShieldCheck className="w-8 h-8 text-cyan-400" />
                <div className="text-[10px] font-bold text-text-primary uppercase tracking-widest">Veri Koruma Kalkanı</div>
                <div className="flex gap-1 mt-1">
                    <div className="w-24 h-1.5 bg-text-primary/5 rounded-full overflow-hidden">
                        <div className="h-full w-4/5 bg-cyan-500" />
                    </div>
                </div>
            </div>
        )
    },
    {
        id: 'department-user',
        icon: Building2,
        title: "Departman İzolasyon Mimarisi",
        desc: "Çoklu ekip yönetiminde veri güvenliğini sağlayın. Her departmanın sadece kendine ait aday ve pozisyon havuzuna erişimini garanti edin.",
        color: "text-amber-400",
        bgColor: "bg-amber-400/10",
        howItWorks: [
            "Kullanıcı rollerini Departman bazlı olarak yapılandırın.",
            "Atanan kullanıcılar dışındaki verilerin tamamen gizlenmesini sağlayın.",
            "Ekibinizle sadece ilgili aday kayıtlarını paylaşarak odaklanmayı artırın.",
            "Global Recruiter yetkisiyle tüm operasyonu kuş bakışı koordine edin."
        ],
        preview: (
            <div className="space-y-3">
                <div className="flex items-center justify-between bg-text-primary/5 p-3 rounded-xl border border-text-primary/10">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-amber-400/20 flex items-center justify-center"><UserCog className="w-3.5 h-3.5 text-amber-400" /></div>
                        <div>
                            <div className="text-[10px] font-bold text-text-primary">Departman Yetkilisi</div>
                            <div className="text-[8px] text-navy-500 uppercase">Yazılım Direktörlüğü</div>
                        </div>
                    </div>
                </div>
                <div className="bg-amber-500/5 border border-amber-500/20 p-2 rounded-lg text-center">
                    <Eye className="w-3 h-3 text-amber-400 mx-auto mb-1" />
                    <div className="text-[8px] text-amber-300 font-bold uppercase tracking-widest">Sadece Atanmış Veriler Görünür</div>
                </div>
            </div>
        )
    },
    {
        id: 'source-mgmt',
        icon: Globe,
        title: "Kanal & Kaynak Analitiği",
        desc: "Birden fazla kanaldan gelen aday akışını merkezi olarak takip edin. Hangi kaynağın daha 'kaliteli' aday ürettiğini verilerle kanıtlayın.",
        color: "text-indigo-400",
        bgColor: "bg-indigo-400/10",
        howItWorks: [
            "Dinamik kaynak ve alt-kaynak kırılımlarını özelleştirin.",
            "İş ortakları veya sosyal mecralar için özel etiketler oluşturun.",
            "Analiz panelinden kaynak verimliliğini gerçek zamanlı izleyin.",
            "En verimli kanallara odaklanarak işe alım maliyetlerini optimize edin."
        ],
        preview: (
            <div className="space-y-2">
                {['LinkedIn', 'Referans', 'Headhunter'].map((s, i) => (
                    <div key={i} className="flex items-center justify-between bg-text-primary/5 p-2 rounded-lg border border-text-primary/5">
                        <span className="text-[9px] text-navy-300 font-bold uppercase">{s}</span>
                        <div className="flex items-center gap-1">
                            <div className="h-1.5 rounded-full bg-teal-500" style={{ width: `${60 - i * 15}px` }} />
                        </div>
                    </div>
                ))}
            </div>
        )
    },
    {
        id: 'position-request',
        icon: Send,
        title: "Dinamik Talep & Onay Akışı",
        desc: "Departmanlardan gelen yetenek taleplerini yönetin. Onay akışlarını dijitalleştirerek talepten ilana geçiş süresini minimize edin.",
        color: "text-indigo-400",
        bgColor: "bg-indigo-400/10",
        howItWorks: [
            "Departmanlar direkt olarak sistemden ihtiyaç bildiriminde bulunur.",
            "Recruiter ekranına düşen talepler tek tıkla onaylanır veya revize edilir.",
            "Onaylanan talepler otomatik olarak birer 'Hedef Pozisyon'a dönüşür.",
            "Operasyonel hızı artırmak için tüm süreç loglanır ve takibi kolaylaşır."
        ],
        preview: (
            <div className="space-y-3">
                <div className="bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-3 h-3 text-amber-400" />
                    <span className="text-[9px] text-amber-400 font-black uppercase">Talep Onayı Bekleniyor</span>
                </div>
                <div className="flex gap-2">
                    <div className="flex-1 py-1.5 rounded-lg bg-emerald-500/20 text-center text-[8px] text-emerald-400 font-black">ONAYLA</div>
                    <div className="flex-1 py-1.5 rounded-lg bg-red-500/20 text-center text-[8px] text-red-400 font-black">REDDET</div>
                </div>
            </div>
        )
    },
    {
        id: 'opportunity-hub',
        icon: Sparkles,
        title: "Yapay Zeka Fırsat Havuzu",
        desc: "Gizli yetenekleri keşfedin. Sistem, havuzunuzdaki yüksek potansiyelli adayları analiz ederek onları en uygun oldukları 'fırsatlara' otomatik yerleştirir.",
        color: "text-pink-400",
        bgColor: "bg-pink-400/10",
        howItWorks: [
            "Sistem, %80 ve üzeri skor alan adayları merkezi bir havuzda toplar.",
            "Bir adayın birden fazla pozisyonla olan gizli korelasyonları listelenir.",
            "Recruiter için 'İdeal Aday'lar tek bir ekranda önceliklendirilmiş olarak sunulur.",
            "Yüksek uyumluluk skorlarıyla mülakat başarı oranlarını garantileyin."
        ],
        preview: (
            <div className="space-y-2">
                <div className="bg-text-primary/5 p-2 rounded-xl border border-text-primary/10 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-[7px] font-bold text-text-primary">Y.Z</div>
                    <div className="flex-1">
                        <div className="text-[10px] font-black text-text-primary">POTANSİYEL EŞLEŞME</div>
                        <div className="flex gap-1 mt-0.5">
                            <span className="text-[7px] bg-emerald-500/20 text-emerald-400 px-1 rounded font-bold">MATCH %95</span>
                        </div>
                    </div>
                </div>
            </div>
        )
    }
];

export default function GuidePage() {
    const [selectedFeature, setSelectedFeature] = useState(null);

    return (
        <div className="flex flex-col min-h-screen bg-navy-950/20 relative isolate">


            {/* Header / Hero Section */}
            <header className="relative pt-24 pb-16 px-6 lg:px-12 overflow-hidden bg-navy-950/20 backdrop-blur-sm">
                <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
                    <div className="absolute top-0 right-[-10%] w-[50%] h-[50%] bg-electric/20 blur-[150px] rounded-full" />
                    <div className="absolute bottom-0 left-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full" />
                </div>

                <div className="relative max-w-5xl mx-auto text-center space-y-8 animate-fade-in">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-electric/5 border border-electric/10 text-electric-light text-[11px] font-black uppercase tracking-[0.3em] backdrop-blur-md">
                        <Sparkles className="w-3.5 h-3.5" /> Gelişmiş Yetenek Kontrol Merkezi
                    </div>

                    <div className="space-y-4">
                        <h1 className="text-5xl md:text-7xl font-black tracking-tight text-text-primary leading-[1.05]">
                            İşe Alımın <br />
                            <span className="bg-gradient-to-r from-electric via-cyan-400 to-emerald-400 bg-clip-text text-transparent">Yapay Zeka Mimarı</span>
                        </h1>
                        <p className="text-text-muted text-lg md:text-xl max-w-3xl mx-auto leading-relaxed font-medium">
                            TalentFlow, sıradan bir aday takip sisteminden çok daha fazlasıdır. Veriyi stratejiye,
                            adayları ise yetkinlik kanıtlarına dönüştüren uçtan uca bir <span className="text-text-primary font-bold">Yapay Zeka Ekosistemidir.</span>
                        </p>
                    </div>

                    <div className="flex items-center justify-center gap-6 pt-4">
                        <div className="flex flex-col items-center gap-2">
                            <div className="text-2xl font-black text-text-primary">3s</div>
                            <div className="text-[9px] text-text-muted font-bold uppercase tracking-widest">CV Analizi</div>
                        </div>
                        <div className="w-px h-10 bg-text-primary/10" />
                        <div className="flex flex-col items-center gap-2">
                            <div className="text-2xl font-black text-text-primary">%90</div>
                            <div className="text-[9px] text-text-muted font-bold uppercase tracking-widest">Tahmin Skoru</div>
                        </div>
                        <div className="w-px h-10 bg-text-primary/10" />
                        <div className="flex flex-col items-center gap-2">
                            <div className="text-2xl font-black text-text-primary">24/7</div>
                            <div className="text-[9px] text-text-muted font-bold uppercase tracking-widest">Akıllı Asistan</div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-1 px-6 lg:px-12 py-8 max-w-6xl mx-auto w-full space-y-24">

                {/* Agentic Interview (Previously at bottom) */}
                <section className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center bg-navy-900/40 p-12 rounded-[3.5rem] border border-white/[0.05] relative overflow-hidden backdrop-blur-xl group">
                    <div className="absolute top-0 right-0 p-32 opacity-10 blur-[100px] bg-electric rounded-full -translate-y-1/2 translate-x-1/2 group-hover:opacity-20 transition-opacity" />

                    <div className="space-y-8 relative">
                        <div className="w-16 h-16 rounded-[1.5rem] bg-electric/10 flex items-center justify-center border border-electric/20 shadow-lg shadow-electric/5">
                            <Zap className="w-8 h-8 text-electric" />
                        </div>
                        <div className="space-y-4">
                            <h2 className="text-4xl font-black text-text-primary tracking-tight leading-tight">Agentic Mülakat:<br /><span className="text-electric">Yanınızdaki Uzman</span></h2>
                            <p className="text-text-muted leading-relaxed text-base font-medium">
                                Mülakat sırasında not tutma stresiyle vedalaşın. TalentFlow AI asistanı mülakatın her aşamasında size rehberlik eder, adaydan gelen ham cevapları teknik derinlik ve kültürel uyum testlerine tabi tutar.
                            </p>
                        </div>
                        <ul className="space-y-4">
                            <li className="flex gap-4">
                                <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 mt-1 shrink-0"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /></div>
                                <div className="text-sm text-text-secondary leading-relaxed"><b className="text-text-primary">Yetkinlik Modları:</b> Stres yönetimi, ekip uyumu, aidiyet gibi can alıcı yetkinlikler için asistanınızdan anlık olarak derinleşme soruları talep edin.</div>
                            </li>
                            <li className="flex gap-4">
                                <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20 mt-1 shrink-0"><Target className="w-3.5 h-3.5 text-blue-400" /></div>
                                <div className="text-sm text-text-secondary leading-relaxed"><b className="text-text-primary">Derinleşme (Deepen):</b> Adayın cevabı yüzeysel mi kaldı? AI, teknik boşlukları yakalamak için çapraz sorgu soruları üretir.</div>
                            </li>
                            <li className="flex gap-4">
                                <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20 mt-1 shrink-0"><Star className="w-3.5 h-3.5 text-amber-400" /></div>
                                <div className="text-sm text-text-secondary leading-relaxed"><b className="text-text-primary">AI Skorlama Matrixi:</b> Mülakat sonunda her bir cevap STAR metodolojisine göre puanlanır ve mülakatçı notlarıyla konsolide edilir.</div>
                            </li>
                        </ul>
                    </div>

                    <div className="relative">
                        <div className="absolute -inset-10 bg-electric/10 blur-[100px] rounded-full" />
                        <div className="relative border border-text-primary/10 rounded-[2.5rem] overflow-hidden shadow-2xl bg-navy-950/80 p-1 backdrop-blur-2xl">
                            <div className="p-6 border-b border-text-primary/5 bg-text-primary/[0.02] flex items-center justify-between">
                                <div className="flex gap-1.5 pt-1">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/40" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/40" />
                                </div>
                                <div className="text-[10px] text-text-muted font-black uppercase tracking-widest pl-10 flex items-center gap-2">
                                    <LayoutDashboard className="w-3 h-3" /> Mülakat Kontrol Paneli
                                </div>
                                <div className="w-10" />
                            </div>
                            <div className="p-8 space-y-6">
                                <div className="space-y-3">
                                    <div className="h-4 w-3/4 bg-text-primary/10 rounded-full animate-pulse" />
                                    <div className="h-4 w-1/2 bg-text-primary/5 rounded-full" />
                                </div>
                                <div className="grid grid-cols-2 gap-4 pt-4">
                                    <div className="h-12 rounded-2xl bg-electric/20 border border-electric/30 flex items-center justify-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-electric animate-ping" />
                                        <div className="w-12 h-2 bg-white/20 rounded-full" />
                                    </div>
                                    <div className="h-12 rounded-2xl bg-text-primary/5 border border-text-primary/10" />
                                </div>
                                <div className="pt-6 space-y-3">
                                    <div className="h-2 w-full bg-text-primary/[0.04] rounded-full" />
                                    <div className="h-2 w-full bg-text-primary/[0.04] rounded-full" />
                                    <div className="h-2 w-2/3 bg-text-primary/[0.04] rounded-full" />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Interactive Features Explorer */}
                <section className="space-y-12">
                    <div className="flex flex-col md:flex-row items-end justify-between gap-6 px-4">
                        <div className="space-y-2">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-electric/10 border border-electric/20 text-electric text-[10px] font-black uppercase tracking-widest">
                                <Layers className="w-3 h-3" /> Özellik Kaşifi
                            </div>
                            <h2 className="text-3xl font-black text-text-primary tracking-tight">Platform Yetenekleri</h2>
                        </div>
                        <p className="text-navy-400 text-sm max-w-sm text-right hidden md:block">
                            TalentFlow'un sunduğu otonom özellikleri keşfetmek için soldaki menüden seçim yapın.
                        </p>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-8 min-h-[600px]">
                        {/* Left Sidebar List */}
                        <div className="w-full lg:w-80 flex flex-col gap-3 shrink-0">
                            {FEATURES_DETAIL.map((f) => (
                                <button
                                    key={f.id}
                                    onClick={() => setSelectedFeature(f)}
                                    className={`flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 text-left relative group overflow-hidden
                                        ${selectedFeature?.id === f.id
                                            ? 'bg-gradient-to-r from-navy-800 to-navy-900 border-white/20 shadow-xl shadow-black/20'
                                            : 'bg-text-primary/[0.02] border-white/[0.05] hover:bg-text-primary/[0.04] hover:border-text-primary/10'}`}
                                >
                                    {selectedFeature?.id === f.id && (
                                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${f.bgColor.replace('/10', '')}`} />
                                    )}
                                    <div className={`w-10 h-10 rounded-xl ${f.bgColor} flex items-center justify-center transition-transform group-hover:scale-110`}>
                                        <f.icon className={`w-5 h-5 ${f.color}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-xs font-bold truncate transition-colors ${selectedFeature?.id === f.id ? 'text-text-primary' : 'text-navy-300 group-hover:text-text-primary'}`}>
                                            {f.title}
                                        </div>
                                        <div className="text-[10px] text-navy-500 font-medium truncate">Detayları incele</div>
                                    </div>
                                    <ChevronRight className={`w-4 h-4 text-navy-600 transition-all ${selectedFeature?.id === f.id ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'}`} />
                                </button>
                            ))}
                        </div>

                        {/* Right Detail Panel */}
                        <div className="flex-1 relative">
                            {!selectedFeature ? (
                                <div className="h-full rounded-[3rem] border-2 border-dashed border-text-primary/5 flex flex-col items-center justify-center text-center p-12 space-y-6 animate-pulse">
                                    <div className="w-20 h-20 rounded-full bg-text-primary/[0.02] flex items-center justify-center">
                                        <MousePointer2 className="w-8 h-8 text-navy-600" />
                                    </div>
                                    <div className="space-y-2">
                                        <h3 className="text-xl font-bold text-navy-400">Bir Özellik Seçin</h3>
                                        <p className="text-sm text-navy-600 max-w-xs">
                                            Detaylı çalışma prensibi ve önizlemeleri görmek için soldaki menüyü kullanın.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="animate-fade-in-up h-full">
                                    <div className="glass h-full rounded-[3rem] p-1 shadow-2xl overflow-hidden group relative">
                                        <div className={`absolute top-0 right-0 p-32 opacity-10 blur-3xl ${selectedFeature.bgColor.replace('/10', '')} rounded-full -translate-y-1/2 translate-x-1/2`} />

                                        <div className="bg-navy-950/60 rounded-[2.9rem] p-8 md:p-12 h-full flex flex-col">
                                            <div className="flex items-start justify-between mb-10">
                                                <div className="flex items-center gap-5">
                                                    <div className={`w-14 h-14 rounded-2xl ${selectedFeature.bgColor} flex items-center justify-center border border-text-primary/5 shadow-lg`}>
                                                        <selectedFeature.icon className={`w-7 h-7 ${selectedFeature.color}`} />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-2xl md:text-3xl font-black text-text-primary tracking-tight leading-none">{selectedFeature.title}</h3>
                                                        <div className="flex items-center gap-2 mt-3">
                                                            <div className={`h-1.5 w-1.5 rounded-full ${selectedFeature.bgColor.replace('/10', '')} animate-pulse`} />
                                                            <span className="text-[10px] text-navy-400 font-black uppercase tracking-[0.2em]">Stratejik Modül Analizi</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-12 flex-1">
                                                <div className="space-y-10">
                                                    <div className="space-y-4">
                                                        <p className="text-lg text-navy-200 leading-relaxed font-medium">
                                                            {selectedFeature.desc}
                                                        </p>
                                                    </div>

                                                    <div className="space-y-6">
                                                        <h4 className="text-xs font-black text-electric/60 uppercase tracking-widest flex items-center gap-3">
                                                            <Rocket className="w-4 h-4" /> Çalışma Prensibi
                                                        </h4>
                                                        <div className="space-y-4">
                                                            {selectedFeature.howItWorks.map((step, i) => (
                                                                <div key={i} className="flex gap-5 group/step">
                                                                    <div className="w-6 h-6 rounded-lg bg-navy-800 border border-text-primary/10 flex items-center justify-center text-[10px] font-black text-navy-400 group-hover/step:text-electric transition-colors shrink-0">
                                                                        {i + 1}
                                                                    </div>
                                                                    <p className="text-sm text-navy-300 leading-relaxed font-medium">{step}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="p-6 rounded-3xl bg-text-primary/[0.02] border border-white/[0.04] flex gap-4 items-start">
                                                        <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                                                        <div className="space-y-1">
                                                            <div className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Profesyonel İpucu</div>
                                                            <p className="text-xs text-navy-400 italic leading-relaxed">
                                                                Bu özellik, standart işleyişe kıyasla zamandan %60 tasarruf sağlar.
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-6">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="text-xs font-black text-navy-500 uppercase tracking-widest flex items-center gap-3">
                                                            <Eye className="w-4 h-4" /> Arayüz Simülasyonu
                                                        </h4>
                                                        <div className="flex gap-1">
                                                            <div className="h-1 w-8 rounded-full bg-electric-light/20" />
                                                            <div className="h-1 w-4 rounded-full bg-text-primary/10" />
                                                        </div>
                                                    </div>
                                                    <div className="relative group/preview mt-4">
                                                        <div className={`absolute -inset-4 bg-gradient-to-br from-white/5 to-transparent rounded-[2.5rem] blur-2xl opacity-0 group-hover/preview:opacity-100 transition-opacity duration-700`} />
                                                        <div className="relative border border-text-primary/10 rounded-[2.5rem] bg-navy-900/60 p-10 shadow-3xl backdrop-blur-md">
                                                            <div className="absolute top-6 right-8 flex gap-2">
                                                                <div className="w-2 h-2 rounded-full bg-text-primary/[0.05]" />
                                                                <div className="w-2 h-2 rounded-full bg-text-primary/[0.05]" />
                                                                <div className="w-2 h-2 rounded-full bg-text-primary/[0.05]" />
                                                            </div>
                                                            <div className="animate-in fade-in zoom-in-95 duration-500">
                                                                {selectedFeature.preview}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* 2. Step by Step Guide (Workflow) */}
                <section className="space-y-12 bg-text-primary/[0.02] border border-white/[0.06] rounded-[3rem] p-12 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none"><Rocket className="w-48 h-48 text-text-primary" /></div>

                    <div className="max-w-3xl">
                        <h2 className="text-3xl font-black text-text-primary mb-4 italic uppercase tracking-tighter">İş Akışı: İlk Adayınızı Nasıl Alırsınız?</h2>
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
                            title="Gölge Gözlemci & Mülakat Köprüsü"
                            desc="İçerideki 'Botu Toplantıya Sok' butonunu kullanarak mülakat sekmesini paylaşın. AI, adayı ve sizi eş zamanlı dinleyerek STAR denetimi yapmaya başlar."
                        />
                        <StepItem
                            num="05"
                            title="Veda ve Raporlama"
                            desc="Mülakat bittiğinde dinleme anında durur. AI, konuşulanları saniyeler içinde analiz eder ve STAR metodolojisine göre puanlanmış raporu önünüze sürer."
                        />
                    </div>
                </section>

                {/* Final Help / System Support */}
                <div className="p-10 rounded-[3rem] bg-navy-900 border border-white/[0.05] text-center space-y-6 shadow-2xl">
                    <div className="w-16 h-16 rounded-full bg-electric/10 border border-electric/20 flex items-center justify-center mx-auto mb-4">
                        <Globe className="w-8 h-8 text-electric" />
                    </div>
                    <h3 className="text-2xl font-black text-text-primary tracking-tight">Kurumsal Entegrasyona Başlayın</h3>
                    <p className="text-text-muted text-sm max-w-lg mx-auto leading-relaxed">
                        TalentFlow, işe alım süreçlerinizi bir angaryadan ziyade stratejik bir kazanıma dönüştürür.
                        Tüm modülleri test etmek için <span className="text-text-primary font-bold">Dashboard</span> ekranından başlayabilirsiniz.
                    </p>
                    <div className="flex items-center justify-center gap-4 pt-4">
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'dashboard' }))}
                            className="px-10 py-4 rounded-2xl bg-electric text-text-primary font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-electric/20 hover:scale-105 active:scale-95 transition-all inline-flex items-center gap-2 group cursor-pointer"
                        >
                            Sisteme Giriş Yap <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
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
                    ? 'bg-text-primary/10 border-white/20 scale-[1.02] shadow-[0_0_40px_rgba(255,255,255,0.05)]'
                    : 'bg-text-primary/[0.03] border-white/[0.06] hover:bg-text-primary/[0.05] hover:border-text-primary/10'}`}
        >
            <div className={`w-14 h-14 rounded-2xl ${bgColor} flex items-center justify-center mb-6 ring-8 ring-transparent group-hover:ring-white/5 transition-all`}>
                <Icon className={`w-7 h-7 ${color}`} />
            </div>
            <h3 className="text-lg font-bold text-text-primary mb-3 flex items-center gap-2">
                {title}
                <ChevronRight className={`w-4 h-4 text-navy-600 transition-all ${isActive ? 'opacity-100 translate-x-1 text-text-primary' : 'opacity-0 group-hover:opacity-100 group-hover:translate-x-1'}`} />
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
            <div className="absolute left-0 top-0 w-12 h-12 rounded-2xl bg-text-primary/5 border border-text-primary/10 flex items-center justify-center text-xs font-black text-navy-400 group-hover:bg-electric group-hover:text-text-primary group-hover:border-electric transition-all shadow-xl">
                {num}
            </div>
            <div className="space-y-1">
                <h4 className="text-base font-bold text-text-primary group-hover:text-electric-light transition-colors">{title}</h4>
                <p className="text-sm text-navy-400 leading-relaxed max-w-2xl">{desc}</p>
            </div>
        </div>
    );
}
