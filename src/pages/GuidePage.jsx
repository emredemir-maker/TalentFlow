// src/pages/GuidePage.jsx
// Platform Guide — Light theme, semantic search, all features documented

import { useState, useMemo } from 'react';
import {
    Search, BookOpen, ChevronDown, ChevronRight,
    LayoutDashboard, Users, Briefcase, Calendar,
    BarChart3, MessageSquare, Share2, Building2,
    Shield, Settings, Video, Upload, Brain, Star,
    Zap, Globe, Mail, Bell, Mic, Activity, UserPlus,
    CheckCircle, ArrowRight, Lightbulb, Play,
    FileText, Filter, RefreshCw, Plus, Eye,
    Clock, Target, Layers, AlertCircle, FileQuestion
} from 'lucide-react';

// ─── FEATURE DATA ──────────────────────────────────────────────────────────────
const FEATURES = [
    // ── ANA EKRANLAR ──
    {
        id: 'dashboard',
        category: 'genel',
        icon: LayoutDashboard,
        color: '#3b82f6',
        title: 'Kontrol Paneli',
        subtitle: 'Ana ekran & genel bakış',
        description: 'Tüm işe alım süreçlerinizin tek bakışta görüldüğü merkez ekrandır. Açık ilanlar, bekleyen mülakatlar, günlük aktivite özeti ve son aday hareketlerini buradan takip edebilirsiniz.',
        steps: [
            'Sol menüden "Kontrol Paneli" seçeneğine tıklayın.',
            'Üstteki KPI kartlarında toplam aday, açık pozisyon ve yaklaşan mülakat sayılarını görün.',
            'Aktivite akışından son eklenen adayları ve güncellemeleri takip edin.',
            'Hızlı erişim butonlarıyla doğrudan yeni aday ekleyebilir veya mülakat planlayabilirsiniz.',
        ],
        tip: 'Kontrol Paneli anlık güncellenir — sayfayı yenilemeden her değişiklik otomatik yansır.',
        tags: ['dashboard', 'ana ekran', 'özet', 'kpi', 'istatistik', 'hızlı erişim'],
        mockup: (
            <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                    {[{ l: 'Açık İlan', v: '12', c: '#3b82f6' }, { l: 'Aday', v: '48', c: '#10b981' }, { l: 'Bu Hafta', v: '5', c: '#f59e0b' }].map(k => (
                        <div key={k.l} className="bg-white border border-slate-100 rounded-xl p-2.5 text-center">
                            <div className="text-lg font-bold" style={{ color: k.c }}>{k.v}</div>
                            <div className="text-[9px] text-slate-400 font-medium">{k.l}</div>
                        </div>
                    ))}
                </div>
                <div className="space-y-1.5">
                    {['Ahmet Yılmaz eklenid • 2dk', 'Yazılım Müh. mülakatı planlandı • 1s'].map((t, i) => (
                        <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg p-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                            <span className="text-[10px] text-slate-500">{t}</span>
                        </div>
                    ))}
                </div>
            </div>
        )
    },
    {
        id: 'candidates',
        category: 'aday',
        icon: Users,
        color: '#10b981',
        title: 'Aday Pipeline Yönetimi',
        subtitle: 'Adaylar sayfası',
        description: 'Tüm adaylarınızı tek ekranda yönetin. Aday durumlarını güncelleyin, filtreler uygulayın ve her adayın detaylı AI analiz kartına ulaşın. CV yüklemeden mülakat raporuna kadar tüm süreç burada yönetilir.',
        steps: [
            '"Adaylar" menüsünden aday listesine erişin.',
            '"Aday Ekle" butonuna tıklayın ve PDF/Word CV yükleyin — AI otomatik ayrıştırır.',
            'Aday kartına tıklayarak AI tarafından çıkarılan beceriler, deneyim ve skorları inceleyin.',
            'Durum açılır menüsünden adayı "Mülakata Davet", "Değerlendirme" veya "Red" aşamasına taşıyın.',
            'Filtreler ile pozisyon, deneyim yılı veya uyum skoruna göre listeleyin.',
        ],
        tip: "AI, CV'yi yükler yüklemez STAR metodolojisiyle otomatik puan üretir. Manuel veri girişi gerekmez.",
        tags: ['aday', 'cv', 'upload', 'pipeline', 'durum', 'filtre', 'skor', 'ai analiz', 'özgeçmiş'],
        mockup: (
            <div className="space-y-2">
                {[
                    { name: 'Zeynep K.', pos: 'Frontend Dev', score: 91, status: 'Mülakat', sc: '#10b981' },
                    { name: 'Mert A.', pos: 'Backend Dev', score: 78, status: 'Değerlendirme', sc: '#f59e0b' },
                    { name: 'Selin Y.', pos: 'UX Designer', score: 85, status: 'Yeni', sc: '#3b82f6' },
                ].map((c, i) => (
                    <div key={i} className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl p-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                            {c.name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-700">{c.name}</div>
                            <div className="text-[9px] text-slate-400">{c.pos}</div>
                        </div>
                        <div className="text-xs font-bold" style={{ color: c.sc }}>{c.score}%</div>
                        <div className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: c.sc + '20', color: c.sc }}>{c.status}</div>
                    </div>
                ))}
            </div>
        )
    },
    {
        id: 'positions',
        category: 'aday',
        icon: Briefcase,
        color: '#8b5cf6',
        title: 'Açık İlanlar & Pozisyon Yönetimi',
        subtitle: 'Pozisyonlar sayfası',
        description: 'İşe alım yapacağınız pozisyonları tanımlayın. Her pozisyon için iş tanımı, departman, yetenek gereksinimleri ve beklentileri girin. AI bu bilgileri analiz ederek aday havuzunuzdan en uygun eşleşmeleri otomatik bulur.',
        steps: [
            '"Açık İlanlar" menüsünden "Yeni Pozisyon" butonuna tıklayın.',
            'Pozisyon adı, departman ve iş tanımı alanlarını doldurun.',
            'İsteğe bağlı olarak AI ile otomatik iş tanımı oluşturabilirsiniz — pozisyon başlığını yazıp AI\'a bırakın.',
            'Kaydet butonuna tıklayın — pozisyon aktif olur ve aday eşleştirmesi başlar.',
            'Pozisyon satırına tıklayarak eşleşen adayları, istatistikleri ve detayları görün.',
        ],
        tip: 'Detaylı iş tanımı yazdıkça AI eşleştirme skorları daha isabetli olur. En az 3-4 cümle girin.',
        tags: ['pozisyon', 'ilan', 'iş tanımı', 'jd', 'eşleştirme', 'departman', 'ai', 'yetenek'],
        mockup: (
            <div className="space-y-2">
                {[
                    { title: 'Yazılım Müh.', dept: 'Mühendislik', count: 8, status: 'Aktif' },
                    { title: 'UX Designer', dept: 'Ürün', count: 5, status: 'Aktif' },
                    { title: 'Data Analyst', dept: 'Analitik', count: 3, status: 'Pasif' },
                ].map((p, i) => (
                    <div key={i} className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl p-2.5">
                        <div className="w-8 h-8 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center">
                            <Briefcase className="w-4 h-4 text-violet-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-700">{p.title}</div>
                            <div className="text-[9px] text-slate-400">{p.dept} · {p.count} aday</div>
                        </div>
                        <div className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${p.status === 'Aktif' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{p.status}</div>
                    </div>
                ))}
            </div>
        )
    },
    // ── MÜLAKAT ──
    {
        id: 'interview-mgmt',
        category: 'mulakat',
        icon: Calendar,
        color: '#f59e0b',
        title: 'Mülakat Planlama & Davetler',
        subtitle: 'Mülakatlar sayfası',
        description: 'Mülakatları planlayın, adaylara kurumsal markalı HTML davetiyeler gönderin ve Google Calendar entegrasyonu ile takviminize ekleyin. Katılımcı listesine sistem dışı harici e-posta adresleri de ekleyebilirsiniz. Her mülakat için benzersiz bir katılım bağlantısı otomatik oluşturulur.',
        steps: [
            '"Mülakatlar" menüsünden "Yeni Mülakat Planla" butonuna tıklayın.',
            'Adım 1\'in üstündeki "Mülakat Pozisyonu" alanından hangi pozisyon için görüşme yapıldığını seçin (açık ilanlar listelenir) veya elle yazın.',
            'Adayı seçin; pozisyon seçimi aday değiştiğinde sıfırlanmaz, aynı pozisyona birden fazla aday görüşmesi planlanabilir.',
            'Katılımcı adımında sistem kullanıcılarını seçin; "Harici Katılımcı Ekle" alanından sistemde kayıtlı olmayan kişilerin e-posta adreslerini ekleyin.',
            '"E-posta Gönder" seçeneği ile adaya kurumsal markalı HTML davetiye ve mülakat bağlantısı gönderilir.',
            'Google Calendar bağlantısı varsa etkinlik otomatik takviminize eklenir; tüm katılımcılara davet gönderilir.',
            'Gönderilen e-postalar "Mesajlar → E-posta Yazışmaları" sekmesinden takip edilir. Yanıtları kontrol etmek için Gmail API\'si kullanılır.',
            'Mülakat günü, "Mülakatı Başlat" butonuyla Canlı Mülakat ekranına geçin.',
        ],
        tip: '"Hızlı Mülakat Başlat" modalında da pozisyon alanı mevcuttur — anlık görüşmelerde de doğru pozisyonu kaydedin. Harici katılımcılar (@ rozetiyle gösterilir) Google Takvim\'e eklenmez; sadece e-posta bildirimi alır.',
        tags: ['mülakat', 'planlama', 'takvim', 'google calendar', 'davet', 'email', 'link', 'zamanlama', 'harici katılımcı', 'html email', 'marka', 'e-posta takibi', 'pozisyon seçimi'],
        mockup: (
            <div className="space-y-2.5">
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-amber-700">Bugün — 14:00</span>
                        <span className="text-[9px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full">Bekliyor</span>
                    </div>
                    <div className="text-[11px] text-slate-700 font-medium">Ahmet Yılmaz — Teknik Mülakat</div>
                    <div className="text-[9px] text-slate-400 mt-0.5">Yazılım Müh. • meet.google.com/···</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {[{ l: 'Ahmet B.', ext: false }, { l: 'dış@partner.com', ext: true }].map((p, i) => (
                        <span key={i} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium border ${p.ext ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                            {p.ext ? '@' : '✓'} {p.l}
                        </span>
                    ))}
                </div>
                <div className="flex gap-2">
                    <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1.5 text-center">
                        <div className="text-[9px] text-emerald-600 font-semibold">Başlat →</div>
                    </div>
                    <div className="flex-1 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-center">
                        <div className="text-[9px] text-slate-500 font-semibold">E-posta Gönder</div>
                    </div>
                </div>
            </div>
        )
    },
    {
        id: 'live-interview',
        category: 'mulakat',
        icon: Video,
        color: '#06b6d4',
        title: 'Canlı AI Mülakat Oturumu',
        subtitle: 'Canlı Mülakat ekranı',
        description: 'WebRTC altyapısıyla adayla bağlantı kurun ve Gemini yapay zekasının gerçek zamanlı sesli analiz gücünden yararlanın. AI her konuşmayı dinler, STAR kriterlerine göre değerlendirir ve size anlık sorular önerir.',
        steps: [
            'Mülakatlar sayfasından "Mülakatı Başlat" butonuna tıklayın — recruiter ekranı açılır.',
            'Aday, size iletilen benzersiz bağlantıya girerek kendi cihazından katılır.',
            'WebRTC sayesinde video ve ses bağlantısı kurulur (kamera & mikrofon izni gerekir).',
            'Gemini STT motoru konuşmaları gerçek zamanlı dinler ve yazıya dönüştürür.',
            '"AI Soru Üret" butonuna tıklayarak seçtiğiniz yetkinlik moduna göre anlık soru alın.',
            'Mülakat bittiğinde "Sonlandır" butonuna basın — otomatik rapor oluşturulur.',
        ],
        tip: 'Mülakat sırasında "Derinleştir" modunu kullanın: adayın yüzeysel kalan cevabını derinlemesine sorgulayan çapraz sorular üretir.',
        tags: ['canlı mülakat', 'webrtc', 'video', 'ses', 'gemini', 'stt', 'ai soru', 'star', 'gerçek zamanlı', 'sesli analiz'],
        mockup: (
            <div className="space-y-2.5">
                <div className="bg-slate-800 rounded-xl p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
                        <Video className="w-5 h-5 text-white/60" />
                    </div>
                    <div>
                        <div className="text-[10px] text-white font-semibold">Aday Bağlı</div>
                        <div className="flex items-center gap-1 mt-0.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-[9px] text-emerald-400">Canlı · 00:14:32</span>
                        </div>
                    </div>
                </div>
                <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-2.5">
                    <div className="text-[9px] text-cyan-600 font-semibold mb-1 flex items-center gap-1">
                        <Brain className="w-3 h-3" /> AI Soru Önerisi
                    </div>
                    <div className="text-[10px] text-slate-700">"Bu projede karşılaştığınız en büyük teknik engel neydi?"</div>
                </div>
                <div className="grid grid-cols-4 gap-1">
                    {['S', 'T', 'A', 'R'].map((s, i) => (
                        <div key={s} className="bg-white border border-slate-100 rounded-lg p-1.5 text-center">
                            <div className="text-[8px] font-bold text-slate-500">{s}</div>
                            <div className="mt-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-cyan-400" style={{ width: `${[80, 60, 90, 70][i]}%` }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )
    },
    {
        id: 'interview-report',
        category: 'mulakat',
        icon: FileText,
        color: '#8b5cf6',
        title: 'Mülakat Raporu & STAR Analizi',
        subtitle: 'Otomatik mülakat raporlama',
        description: 'Mülakat tamamlandıktan sonra AI tüm konuşmayı analiz ederek STAR metodolojisine göre detaylı bir değerlendirme raporu üretir. Adayın güçlü ve zayıf yönleri, teknik yeterlilik ve kültürel uyum skorları raporlanır.',
        steps: [
            'Mülakat sona erdiğinde "Sonlandır" butonuna basın.',
            'AI, kaydedilen konuşmayı saniyeler içinde analiz eder.',
            'Rapor sayfasında STAR skorları, yetkinlik değerlendirmeleri ve önerilen takip soruları gösterilir.',
            'Raporu PDF olarak indirebilir veya adayın dosyasına ekleyebilirsiniz.',
        ],
        tip: 'Rapordaki "Önerilen Takip Soruları" bölümü bir sonraki mülakat turu için hazır sorular sunar.',
        tags: ['rapor', 'star', 'değerlendirme', 'analiz', 'skor', 'pdf', 'sonuç', 'yetkinlik'],
        mockup: (
            <div className="space-y-2">
                <div className="bg-violet-50 border border-violet-100 rounded-xl p-3">
                    <div className="text-[10px] font-semibold text-violet-700 mb-2">STAR Skoru — Zeynep K.</div>
                    {[['Durum Analizi', 85], ['Görev Yönetimi', 72], ['Aksiyon Gücü', 91], ['Sonuç Odaklılık', 88]].map(([l, v]) => (
                        <div key={l} className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] text-slate-500 w-28">{l}</span>
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-violet-400 rounded-full" style={{ width: v + '%' }} />
                            </div>
                            <span className="text-[9px] font-bold text-violet-600">{v}</span>
                        </div>
                    ))}
                </div>
            </div>
        )
    },
    {
        id: 'bulk-cv-upload',
        category: 'aday',
        icon: Upload,
        color: '#3b82f6',
        title: 'Toplu CV Yükleme & Sıralı İşleme',
        subtitle: 'Adaylar sayfası — Toplu Yükle',
        description: 'Birden fazla PDF veya DOCX CV dosyasını tek seferde sisteme yükleyin. Her dosya sırayla işlenir: AI ayrıştırma, beceri çıkarımı ve uyum skoru hesaplaması arka planda gerçekleşir. İşlem ilerleme durumu anlık takip edilebilir.',
        steps: [
            '"Adaylar" menüsüne gidin ve "Toplu Yükle" butonuna tıklayın.',
            'Açılan modalda "Dosya Seç" ile birden fazla CV dosyası seçin (maksimum 20 dosya, PDF/DOCX).',
            'İsteğe bağlı olarak tüm adaylar için ortak bir pozisyon atayın.',
            '"Yüklemeyi Başlat" butonuna tıklayın — dosyalar sıraya alınır ve işlem başlar.',
            'Ekranın sağında her dosya için ilerleme durumu anlık güncellenir: Bekliyor → İşleniyor → Tamamlandı / Hata.',
            'İşlem tamamlandığında özet gösterilir: kaç aday başarıyla eklendi, kaçında hata oluştu ve ortalama skor.',
        ],
        tip: 'Büyük dosyalarda veya birden fazla CV yüklenirken sabırlı olun — AI her CV için ayrı analiz yapar. Hata veren dosyalar listeye eklenmez ve yeniden denenebilir.',
        tags: ['toplu', 'batch', 'cv', 'yükleme', 'upload', 'sıralı', 'kuyruğu', 'işleme', 'pdf', 'docx', 'çoklu', 'aday ekle'],
        mockup: (
            <div className="space-y-2">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-semibold text-blue-700">Yükleme Kuyruğu</span>
                        <span className="text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">3/5</span>
                    </div>
                    {[
                        { name: 'ahmet_yilmaz.pdf', status: 'Tamamlandı', color: '#10b981' },
                        { name: 'zeynep_k.docx', status: 'İşleniyor...', color: '#f59e0b' },
                        { name: 'mert_a.pdf', status: 'Bekliyor', color: '#94a3b8' },
                    ].map((f, i) => (
                        <div key={i} className="flex items-center gap-2 mb-1">
                            <FileText className="w-3 h-3 text-blue-400 shrink-0" />
                            <span className="text-[9px] text-slate-600 flex-1 truncate">{f.name}</span>
                            <span className="text-[8px] font-medium" style={{ color: f.color }}>{f.status}</span>
                        </div>
                    ))}
                </div>
                <div className="flex gap-2 text-center">
                    <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-lg p-1.5">
                        <div className="text-xs font-bold text-emerald-600">3</div>
                        <div className="text-[8px] text-emerald-500">Eklendi</div>
                    </div>
                    <div className="flex-1 bg-amber-50 border border-amber-100 rounded-lg p-1.5">
                        <div className="text-xs font-bold text-amber-600">%78</div>
                        <div className="text-[8px] text-amber-500">Ort. Skor</div>
                    </div>
                </div>
            </div>
        )
    },
    {
        id: 'screening-questions',
        category: 'aday',
        icon: FileQuestion,
        color: '#8b5cf6',
        title: 'Ön Eleme Soruları & AI Skor Değerlendirmesi',
        subtitle: 'Pozisyon başvuru formu & skor filtresi',
        description: 'Pozisyonlarınıza ön eleme soruları ekleyin. Adaylar başvururken bu soruları yanıtlar; AI her yanıtı değerlendirerek 0-100 arasında bir skor üretir. Recruiter panelinde adayları Çok İyi / İyi / Orta / Zayıf filtresiyle listeleyin.',
        steps: [
            '"Açık İlanlar" menüsünden yeni pozisyon oluşturun veya mevcut bir pozisyonu düzenleyin.',
            'Pozisyon formunun sağ panelinde "Ön Eleme Soruları" bölümüne gidin.',
            '"Soru Ekle" butonuyla sorularınızı yazın. Her sorunun yanındaki "AI Düzenle" butonu, soruyu daha etkili hale getirir.',
            '"AI ile Otomatik Oluştur" butonuyla pozisyona özel soru seti saniyeler içinde üretilir.',
            'Ön eleme etkin olan pozisyonun başvuru sayfasını adayla paylaşın.',
            'Başvurular panelinde "Ön Eleme Skoru" sütununu göreceksiniz — renkli rozetler skora göre otomatik atanır.',
            '"Filtrele" menüsünden Çok İyi (≥85) / İyi (65-84) / Orta (40-64) / Zayıf (<40) filtresi uygulayın.',
        ],
        tip: 'AI Düzenle butonu sorunuzu STAR metodolojisine uygun, davranışsal bir yapıya dönüştürür. "Neden X?" yerine "Bir durumu anlatın..." formatına çevirir.',
        tags: ['ön eleme', 'screening', 'soru', 'başvuru', 'skor', 'filtre', 'ai', 'değerlendirme', 'çok iyi', 'zayıf', 'pozisyon', 'form'],
        mockup: (
            <div className="space-y-2">
                <div className="space-y-1">
                    {[
                        { q: 'Takım çalışmasında zorlandığınız bir durumu anlatın.', badge: 'AI ✓' },
                        { q: 'En büyük teknik başarınız neydi?', badge: 'Düzenlendi' },
                    ].map((q, i) => (
                        <div key={i} className="flex items-start gap-2 bg-violet-50 border border-violet-100 rounded-xl p-2">
                            <FileQuestion className="w-3 h-3 text-violet-400 mt-0.5 shrink-0" />
                            <span className="text-[9px] text-slate-600 flex-1 leading-relaxed">{q.q}</span>
                            <span className="text-[7px] bg-violet-200 text-violet-700 px-1.5 rounded-full shrink-0">{q.badge}</span>
                        </div>
                    ))}
                </div>
                <div className="flex gap-1 flex-wrap">
                    {[{ l: 'Çok İyi', c: '#10b981', v: 3 }, { l: 'İyi', c: '#3b82f6', v: 5 }, { l: 'Orta', c: '#f59e0b', v: 2 }, { l: 'Zayıf', c: '#ef4444', v: 1 }].map(b => (
                        <div key={b.l} className="flex items-center gap-1 px-2 py-0.5 rounded-full border text-[8px]" style={{ borderColor: b.c + '40', background: b.c + '10', color: b.c }}>
                            {b.l} <span className="font-bold">{b.v}</span>
                        </div>
                    ))}
                </div>
            </div>
        )
    },
    // ── ANALİTİK ──
    {
        id: 'analytics',
        category: 'analitik',
        icon: BarChart3,
        color: '#06b6d4',
        title: 'Analitik Raporlar',
        subtitle: '3 sekmeli analitik panel',
        description: "İşe alım performansınızı üç farklı perspektiften analiz edin. Genel Bakış'ta KPI'lar ve dönüşüm hunisi, Edinme'de kaynak verimliliği, Yanıt Takibi'nde ise aday iletişim durumlarını takip edin.",
        steps: [
            '"Analitik Raporlar" menüsünden ana panele erişin.',
            '"Genel Bakış" sekmesinde toplam aday, açık pozisyon, tamamlanan mülakat ve ortalama uyum skoru kartlarını inceleyin.',
            '"Edinme & Kaynak" sekmesinde hangi kanalın en iyi adayı getirdiğini görün.',
            '"Yanıt Takibi" sekmesinde gönderilen davetlerin açılma ve yanıtlanma oranlarını izleyin.',
            'Sağ üstteki zaman aralığı seçici ile haftalık/aylık/yıllık görünümler arasında geçiş yapın.',
        ],
        tip: "Edinme sekmesindeki \"Kanal/Detay\" toggle'ı kaynak bazlı ve alt kaynak bazlı görünümler arasında geçiş sağlar.",
        tags: ['analitik', 'rapor', 'kpi', 'grafik', 'kaynak', 'dönüşüm', 'huni', 'istatistik', 'performans'],
        mockup: (
            <div className="space-y-2">
                <div className="flex gap-1 mb-2">
                    {['Genel Bakış', 'Edinme', 'Yanıtlar'].map((t, i) => (
                        <div key={t} className={`px-2 py-1 rounded-lg text-[9px] font-medium ${i === 0 ? 'bg-cyan-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{t}</div>
                    ))}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                    {[{ l: 'Toplam Aday', v: '124', c: '#3b82f6' }, { l: 'Ort. Skor', v: '%82', c: '#10b981' }, { l: 'Mülakatlar', v: '31', c: '#8b5cf6' }, { l: 'İşe Alım', v: '8', c: '#f59e0b' }].map(k => (
                        <div key={k.l} className="bg-white border border-slate-100 rounded-lg p-2 text-center">
                            <div className="text-sm font-bold" style={{ color: k.c }}>{k.v}</div>
                            <div className="text-[9px] text-slate-400">{k.l}</div>
                        </div>
                    ))}
                </div>
                <div className="flex items-end gap-1 h-12 px-1">
                    {[40, 65, 55, 80, 70, 90, 75].map((h, i) => (
                        <div key={i} className="flex-1 bg-cyan-100 rounded-sm" style={{ height: h + '%' }} />
                    ))}
                </div>
            </div>
        )
    },
    // ── İLETİŞİM ──
    {
        id: 'messages',
        category: 'iletisim',
        icon: MessageSquare,
        color: '#ec4899',
        title: 'Mesaj Kuyruğu & E-posta Takibi',
        subtitle: 'Mesajlar sayfası — 2 sekme',
        description: 'Mesajlar ekranı iki sekmeden oluşur: "Mesaj Kuyruğu" LinkedIn Sales Navigator DM taslak ve gönderim akışını; "E-posta Yazışmaları" ise adaylara gönderilen tüm e-posta thread\'lerini ve yanıt durumlarını gösterir.',
        steps: [
            '"Mesajlar" menüsüne tıklayın.',
            '"Mesaj Kuyruğu" sekmesinde LinkedIn DM taslakları, hazır ve gönderilmiş mesajları filtreleyin.',
            '"E-posta Yazışmaları" sekmesine geçin — gönderilen tüm mülakat davetleri listede görünür.',
            'Bir e-posta thread\'ine tıklayarak genişletin, ardından "Yanıtları Kontrol Et" butonuna basın.',
            'Gmail API üzerinden thread\'deki tüm mesajlar çekilir — yanıt varsa "Yanıt Var" rozeti gösterilir.',
        ],
        tip: 'Yanıt Var rozeti (yeşil) olan thread\'ler adayın e-postanızı okuduğunu ve yanıtladığını gösterir. Google bağlantısı aktif olmalıdır.',
        tags: ['mesaj', 'kuyruk', 'linkedin', 'email', 'e-posta', 'yazışma', 'yanıt', 'thread', 'gmail', 'takip', 'bildirim'],
        mockup: (
            <div className="space-y-2">
                <div className="flex gap-1 p-0.5 bg-slate-100 rounded-lg">
                    <div className="flex-1 bg-white rounded-md px-2 py-1 text-center text-[8px] font-semibold text-pink-600 shadow-sm">Mesaj Kuyruğu</div>
                    <div className="flex-1 px-2 py-1 text-center text-[8px] text-slate-400">E-posta Yazışmaları</div>
                </div>
                {[
                    { name: 'Zeynep K.', sub: 'Teknik Mülakat Daveti', replied: true },
                    { name: 'Mert A.', sub: 'İK Mülakat Daveti', replied: false },
                ].map((t, i) => (
                    <div key={i} className="flex items-center gap-2 bg-white border border-slate-100 rounded-xl p-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold ${t.replied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{t.name[0]}</div>
                        <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-semibold text-slate-700">{t.name}</div>
                            <div className="text-[8px] text-slate-400 truncate">{t.sub}</div>
                        </div>
                        {t.replied && <span className="text-[7px] bg-emerald-50 text-emerald-600 border border-emerald-100 px-1.5 py-0.5 rounded-full font-bold">Yanıt Var</span>}
                    </div>
                ))}
            </div>
        )
    },
    {
        id: 'email-templates',
        category: 'iletisim',
        icon: Mail,
        color: '#3b82f6',
        title: 'Kurumsal HTML E-posta Şablonları',
        subtitle: 'Markaya özel e-posta tasarımı',
        description: 'Talent-Inn\'den gönderilen her e-posta, Kurumsal Kimlik ayarlarınızdaki logo, renk ve şirket adınızı yansıtan profesyonel HTML şablonlarla gönderilir. 3 farklı şablon tipi mevcuttur: kullanıcı daveti, mülakat daveti (adaya) ve katılımcı bildirimi.',
        steps: [
            'Ayarlar → "Kurumsal Kimlik" bölümünden logo, renk ve şirket bilgilerini doldurun.',
            'Canlı önizlemede e-postanın son halini görün.',
            'Mülakat daveti gönderdiğinizde e-posta otomatik olarak kurumsal kimliğinizle gider.',
            'Kullanıcı davet e-postası (sistem yönetimi), mülakat daveti (adaya) ve katılımcı bildirim e-postası ayrı tasarımlara sahiptir.',
        ],
        tip: 'Logo URL\'si Firebase Storage\'dan otomatik alınır. Logo yüklü değilse şirket adı metin olarak gösterilir.',
        tags: ['email', 'e-posta', 'şablon', 'html', 'marka', 'logo', 'tasarım', 'davet', 'kurumsal', 'bildirim'],
        mockup: (
            <div className="space-y-2">
                <div className="border border-slate-200 rounded-xl overflow-hidden text-[9px]">
                    <div className="bg-[#1E3A8A] px-3 py-2 text-center">
                        <div className="inline-block bg-white/20 rounded-lg px-2 py-0.5 text-white font-bold">Şirket Adı</div>
                        <div className="text-white/70 text-[7px] mt-0.5">Akıllı İK Platformu</div>
                    </div>
                    <div className="bg-white px-3 py-2 space-y-1.5">
                        <div className="font-bold text-slate-800 text-[10px]">Mülakat Davetiniz</div>
                        <div className="text-slate-500 leading-relaxed">Merhaba <strong>Zeynep K.</strong>, sizinle tanışmak isteriz.</div>
                        <div className="bg-blue-50 border-l-2 border-blue-500 pl-2 py-1 space-y-0.5">
                            <div className="text-slate-600">📋 Frontend Developer</div>
                            <div className="text-slate-600">📅 25 Mart 2026 · 14:00</div>
                        </div>
                        <div className="text-center">
                            <span className="bg-[#1E3A8A] text-white px-3 py-1 rounded text-[8px] font-bold inline-block">Mülakata Katıl →</span>
                        </div>
                    </div>
                    <div className="bg-slate-50 border-t border-slate-100 px-3 py-1.5 text-center text-slate-400 text-[7px]">Talent-Inn Platformu</div>
                </div>
            </div>
        )
    },
    {
        id: 'google-workspace',
        category: 'iletisim',
        icon: Mail,
        color: '#ef4444',
        title: 'Google Workspace Entegrasyonu',
        subtitle: 'Gmail & Google Calendar bağlantısı',
        description: 'Gmail hesabınızı bağlayarak adaylara doğrudan sistem üzerinden e-posta gönderin. Google Calendar entegrasyonu sayesinde mülakatlar takviminize otomatik eklenir ve Meet bağlantısı oluşturulur.',
        steps: [
            'Genel Ayarlar → "Entegrasyonlar" bölümüne gidin.',
            '"Google Workspace" kartındaki "Bağlan" butonuna tıklayın.',
            'Google hesabınızla oturum açın ve izinleri onaylayın.',
            'Bağlantı tamamlandıktan sonra e-posta ve takvim özellikleri otomatik aktif olur.',
            'Mülakat planlarken "E-posta Gönder" seçeneği artık Gmail üzerinden çalışır.',
        ],
        tip: 'Bağlantıyı kestikten sonra daha önce gönderilen e-postalar korunur, yalnızca yeni işlemler etkilenir.',
        tags: ['google', 'gmail', 'takvim', 'calendar', 'entegrasyon', 'meet', 'email', 'bağlantı'],
        mockup: (
            <div className="space-y-2.5">
                <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl p-3">
                    <div className="w-10 h-10 rounded-full bg-white border border-slate-100 shadow-sm flex items-center justify-center p-2">
                        <svg viewBox="0 0 24 24" className="w-full h-full"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
                    </div>
                    <div className="flex-1">
                        <div className="text-xs font-semibold text-slate-700">Google Workspace</div>
                        <div className="text-[9px] text-emerald-500 flex items-center gap-1">
                            <CheckCircle className="w-2.5 h-2.5" /> Bağlı
                        </div>
                    </div>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2 text-center text-[9px] text-emerald-600 font-medium">
                    meet.google.com/abc-def-ghi — Hazır
                </div>
            </div>
        )
    },
    // ── SİSTEM ──
    {
        id: 'sources',
        category: 'sistem',
        icon: Share2,
        color: '#06b6d4',
        title: 'Kaynak Yönetimi',
        subtitle: 'İşe alım kanalları',
        description: 'Adaylarınızın geldiği kaynakları (LinkedIn, Kariyer.net, Referans vb.) sisteme tanımlayın. Her kaynak için alt detaylar oluşturun. Analitik panelinde hangi kanalın en kaliteli adayı ürettiğini takip edin.',
        steps: [
            'Genel Ayarlar → "Kaynak Yönetimi" sekmesine gidin.',
            '"Ana Kaynak Ekle" ile yeni bir kanal (ör: Sosyal Medya) oluşturun. İkon ve renk seçin.',
            '"Alt Detay" ekleyerek kanalı detaylandırın (ör: LinkedIn, Instagram).',
            'Aday eklerken kaynak seçimi yaparak veri takibini başlatın.',
            'Analitik → Edinme sekmesinde kaynak performansını izleyin.',
        ],
        tip: 'Kaynakları sistematik tanımlamak, hangi kanalın en az maliyetle en iyi adayı getirdiğini ileride görmenizi sağlar.',
        tags: ['kaynak', 'kanal', 'linkedin', 'kariyer', 'referans', 'sosyal medya', 'analitik', 'performans'],
        mockup: (
            <div className="space-y-2">
                {[
                    { name: 'LinkedIn', subs: 3, color: '#3b82f6' },
                    { name: 'Kariyer Portalları', subs: 3, color: '#ec4899' },
                    { name: 'Referral / Öneri', subs: 3, color: '#10b981' },
                ].map((s, i) => (
                    <div key={i} className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl p-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: s.color + '20' }}>
                            <Share2 className="w-3.5 h-3.5" style={{ color: s.color }} />
                        </div>
                        <div className="flex-1 text-xs font-medium text-slate-700">{s.name}</div>
                        <div className="text-[9px] text-slate-400">{s.subs} alt detay</div>
                    </div>
                ))}
            </div>
        )
    },
    {
        id: 'departments',
        category: 'sistem',
        icon: Building2,
        color: '#f59e0b',
        title: 'Departman Yönetimi',
        subtitle: 'Çoklu ekip & izolasyon',
        description: 'Şirketinizdeki departmanları sisteme tanımlayın ve kullanıcıları departmanlarına atayın. Her departman kullanıcısı yalnızca kendi departmanına ait adayları ve pozisyonları görebilir — veri güvenliği otomatik sağlanır.',
        steps: [
            'Genel Ayarlar → "Departmanlar" sekmesine gidin.',
            '"Yeni Departman" butonuyla departman adı, açıklama ve renk belirleyin.',
            'Oluşturulan departman kartını genişleterek "Kullanıcı Ekle" ile üye atayın.',
            'Sistem Yönetimi\'nden kullanıcı rollerini "Departman Kullanıcısı" olarak ayarlayın.',
            'Departman kullanıcıları sisteme giriş yaptığında yalnızca kendi verilerini görür.',
        ],
        tip: 'Büyük ekiplerde her departmanın kendi işe alım sürecini bağımsız yönetmesi için Departman İzolasyonu mutlaka yapılandırılmalıdır.',
        tags: ['departman', 'izolasyon', 'yetki', 'ekip', 'rol', 'güvenlik', 'erişim', 'kullanıcı'],
        mockup: (
            <div className="space-y-2">
                {[
                    { name: 'Mühendislik', users: 4, open: 3, color: '#3b82f6' },
                    { name: 'Ürün', users: 2, open: 1, color: '#8b5cf6' },
                    { name: 'Satış', users: 3, open: 2, color: '#f59e0b' },
                ].map((d, i) => (
                    <div key={i} className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl p-2.5">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: d.color + '18', border: `1px solid ${d.color}30` }}>
                            <Building2 className="w-4 h-4" style={{ color: d.color }} />
                        </div>
                        <div className="flex-1 text-xs font-medium text-slate-700">{d.name}</div>
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] text-slate-400">{d.users} kullanıcı</span>
                            <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1 rounded">{d.open} açık</span>
                        </div>
                    </div>
                ))}
            </div>
        )
    },
    {
        id: 'branding',
        category: 'sistem',
        icon: Building2,
        color: '#8b5cf6',
        title: 'Kurumsal Kimlik',
        subtitle: 'Logo, renk & e-posta markalaması',
        description: 'Şirketinizin logosunu, ana rengini, etiket sloganını ve web adresini tanımlayın. Bu bilgiler tüm sistemden gönderilen e-postalarda otomatik kullanılır. Canlı önizleme ile e-postanın son halini kaydetmeden görebilirsiniz.',
        steps: [
            'Ayarlar → "Kurumsal Kimlik" sekmesine gidin (Süper Admin yetkisi gerekir).',
            'Şirket adı, web sitesi ve slogan alanlarını doldurun.',
            '"Logo Yükle" butonuyla görsel yükleyin — Firebase Storage\'a kaydedilir.',
            'Renk seçiciden şirket rengini seçin veya HEX kodunu yapıştırın. Hazır kurumsal paletler sunulur.',
            '"Canlı Önizleme" alanında e-postanın gerçek görünümünü inceleyin.',
            '"Kaydet" butonuyla ayarları Firestore\'a yazın — anında tüm yeni e-postalara yansır.',
        ],
        tip: 'Marka rengi sadece e-postalarda değil, ileride uygulama temasında da kullanılacaktır. Markaya özgü bir renk seçin.',
        tags: ['marka', 'logo', 'renk', 'kurumsal', 'kimlik', 'email', 'e-posta', 'ayarlar', 'şablon', 'slogan'],
        mockup: (
            <div className="space-y-2">
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-[#1E3A8A] p-2 text-center">
                        <div className="inline-block bg-white/20 rounded px-2 py-0.5 text-white text-[9px] font-bold">LOGO</div>
                    </div>
                    <div className="p-2 space-y-1.5 bg-white">
                        {[['Şirket Adı', 'BTC Türk A.Ş.'], ['Slogan', 'Kripto & Blockchain'], ['Ana Renk', '#1E3A8A']].map(([l, v]) => (
                            <div key={l} className="flex items-center gap-2">
                                <span className="text-[8px] text-slate-400 w-16">{l}</span>
                                <span className="text-[9px] font-medium text-slate-700">{v}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1.5 text-center text-[9px] text-emerald-600 font-medium">Canlı Önizleme Aktif</div>
            </div>
        )
    },
    {
        id: 'domain-whitelist',
        category: 'sistem',
        icon: Globe,
        color: '#06b6d4',
        title: 'Domain Beyaz Listesi',
        subtitle: 'Kurumsal e-posta ile otomatik erişim',
        description: 'Belirli e-posta alan adlarını (örn: şirket.com) sisteme tanımlayarak, bu domainlere sahip kullanıcıların davet gerekmeksizin sisteme kayıt olmasını sağlayın. Domain beyaz listesindeki kullanıcılar otomatik olarak "Recruiter" rolüyle kayıt olur.',
        steps: [
            'Sistem Yönetimi → "Domain Yönetimi" sekmesine gidin (Süper Admin yetkisi gerekir).',
            '"İzin Verilen Domain Ekle" alanına domain adını girin (ör: btcturk.com).',
            '"Ekle" butonuyla listeye kaydedin — anında aktif olur.',
            'Bu domainden kayıt olmaya çalışan kullanıcılar davet kontrolünü atlar.',
            'Artık istenmeyen bir domain varsa çöp kutusu ikonu ile silin.',
        ],
        tip: 'Kurumsal e-posta alanınızı eklemek, HR ekibinizin her üyesinin anında erişmesini sağlar. Harici domain\'leri (gmail.com gibi) eklemeyin.',
        tags: ['domain', 'whitelist', 'alan adı', 'erişim', 'otomatik', 'kayıt', 'güvenlik', 'recruiter', 'kurumsal email'],
        mockup: (
            <div className="space-y-2">
                {[{ d: 'btcturk.com', users: 12 }, { d: 'infoset.app', users: 5 }].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 bg-white border border-slate-100 rounded-xl p-2.5">
                        <div className="w-7 h-7 rounded-lg bg-cyan-50 border border-cyan-100 flex items-center justify-center">
                            <Globe className="w-3.5 h-3.5 text-cyan-500" />
                        </div>
                        <div className="flex-1 text-xs font-medium text-slate-700">@{item.d}</div>
                        <span className="text-[8px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full">{item.users} kullanıcı</span>
                    </div>
                ))}
                <div className="border border-dashed border-slate-200 rounded-xl px-3 py-2 flex items-center gap-2">
                    <span className="text-[9px] text-slate-400 flex-1">yenidomain.com ekle…</span>
                    <span className="text-[9px] bg-cyan-50 text-cyan-600 px-2 py-0.5 rounded font-medium">Ekle</span>
                </div>
            </div>
        )
    },
    {
        id: 'super-admin',
        category: 'sistem',
        icon: Shield,
        color: '#ef4444',
        title: 'Sistem Yönetimi',
        subtitle: 'Kullanıcı davet & rol yönetimi',
        description: 'Süper Admin yetkisiyle sisteme yeni kullanıcılar davet edin, rollerini belirleyin ve gerektiğinde hesapları yönetin. Recruiter, Departman Kullanıcısı ve Süper Admin olmak üzere 3 farklı yetki seviyesi mevcuttur.',
        steps: [
            'Genel Ayarlar → "Sistem Yönetimi" sekmesine gidin (Süper Admin yetkisi gerekir).',
            '"Kullanıcı Davet Et" butonuyla e-posta adresi ve rol belirleyin.',
            'Davetiye linki sisteme kayıt işlemi için gönderilir.',
            'Mevcut kullanıcıların rolünü düzenlemek için kullanıcı satırındaki Düzenle butonunu kullanın.',
            'İhtiyaç duyulduğunda kullanıcı hesabını devre dışı bırakabilir veya silebilirsiniz.',
        ],
        tip: 'Recruiter rolü tüm pozisyonları ve adayları görebilirken Departman Kullanıcısı yalnızca atandığı departmanı görür.',
        tags: ['süper admin', 'yetki', 'rol', 'kullanıcı', 'davet', 'sistem', 'güvenlik', 'izin'],
        mockup: (
            <div className="space-y-2">
                <div className="flex items-center justify-between bg-red-50 border border-red-100 rounded-xl p-2.5">
                    <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-red-500" />
                        <span className="text-xs font-medium text-slate-700">Süper Admin</span>
                    </div>
                    <span className="text-[9px] bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full">Tam Yetki</span>
                </div>
                {[{ role: 'Recruiter', color: '#3b82f6' }, { role: 'Dept. Kullanıcısı', color: '#f59e0b' }].map((r, i) => (
                    <div key={i} className="flex items-center justify-between bg-white border border-slate-100 rounded-xl p-2.5">
                        <span className="text-xs font-medium text-slate-600">{r.role}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: r.color + '15', color: r.color }}>Kısıtlı</span>
                    </div>
                ))}
            </div>
        )
    },
    {
        id: 'settings',
        category: 'sistem',
        icon: Settings,
        color: '#6366f1',
        title: 'Genel Ayarlar',
        subtitle: 'Kişisel tercihler & entegrasyonlar',
        description: 'Tema (koyu/açık), dil, bildirimler ve dashboard düzenini ayarlayın. Ses tanıma motorunu test edin ve Google Workspace entegrasyonunu yönetin. Tüm ayarlar hesabınıza bağlı olarak saklanır.',
        steps: [
            'Sol menü altındaki "Genel Ayarlar"a tıklayın.',
            '"Tercihler" bölümünden tema, dil ve bildirim ayarlarınızı yapın.',
            '"Ses Tanıma Motoru Testi" bölümünde mikrofon butonuna basarak STT motorunu test edin.',
            '"Entegrasyonlar" bölümünden Google Workspace bağlantısını yönetin.',
        ],
        tip: 'Ses tanıma testi başarısızsa mülakat sırasında AI sesli analiz çalışmayabilir. Ayarlar → STT testi ile doğrulayın.',
        tags: ['ayarlar', 'tema', 'dil', 'bildirim', 'ses tanıma', 'stt', 'entegrasyon', 'kişiselleştirme'],
        mockup: (
            <div className="space-y-2">
                {[['Tema', '🌙 Koyu'], ['Dil', '🇹🇷 Türkçe'], ['Bildirimler', '✅ Açık']].map(([l, v]) => (
                    <div key={l} className="flex items-center justify-between bg-white border border-slate-100 rounded-lg px-3 py-2">
                        <span className="text-xs text-slate-600">{l}</span>
                        <span className="text-[10px] font-medium text-slate-700">{v}</span>
                    </div>
                ))}
                <div className="bg-cyan-50 border border-cyan-100 rounded-lg px-3 py-2 flex items-center gap-2">
                    <Mic className="w-3.5 h-3.5 text-cyan-500" />
                    <span className="text-[10px] text-cyan-600 font-medium">STT Motoru — Hazır</span>
                </div>
            </div>
        )
    },
];

const CATEGORIES = [
    { id: 'all', label: 'Tümü', icon: Layers },
    { id: 'genel', label: 'Genel', icon: LayoutDashboard },
    { id: 'aday', label: 'Aday & İlan', icon: Users },
    { id: 'mulakat', label: 'Mülakat', icon: Video },
    { id: 'analitik', label: 'Analitik', icon: BarChart3 },
    { id: 'iletisim', label: 'İletişim', icon: MessageSquare },
    { id: 'sistem', label: 'Sistem', icon: Shield },
];

const QUICK_STEPS = [
    { num: '01', icon: Briefcase, color: '#8b5cf6', title: 'Pozisyon Oluşturun', desc: 'Açık İlanlar sayfasından işe almak istediğiniz pozisyonu ekleyin. İş tanımı ne kadar detaylı olursa AI eşleştirmesi o kadar isabetli olur.' },
    { num: '02', icon: Upload, color: '#3b82f6', title: 'Aday CV\'lerini Yükleyin', desc: 'Adaylar sayfasından PDF/Word CV dosyalarını yükleyin. AI anında ayrıştırır — isim, deneyim, beceriler otomatik çıkarılır.' },
    { num: '03', icon: Star, color: '#f59e0b', title: 'AI Eşleştirme Skorlarını İnceleyin', desc: 'Her aday için AI otomatik uyum skoru üretir. Skoru yüksek adayları mülakata davet edin.' },
    { num: '04', icon: Calendar, color: '#10b981', title: 'Mülakat Planlayın', desc: 'Mülakatlar sayfasından tarih ve saat belirleyin. Adaya otomatik davetiye gönderilir, Google Calendar\'a eklenir.' },
    { num: '05', icon: Video, color: '#06b6d4', title: 'Canlı AI Mülakatı Başlatın', desc: 'Mülakat günü "Başlat" butonuna basın. AI konuşmayı dinler, STAR skorlaması yapar ve anlık sorular önerir.' },
    { num: '06', icon: FileText, color: '#6366f1', title: 'Raporu İnceleyin', desc: 'Mülakat bitince otomatik STAR raporu hazırlanır. Adayı değerlendirerek süreci sonlandırın.' },
];

// ─── SEMANTIC SEARCH HELPER ────────────────────────────────────────────────────
function searchScore(feature, query) {
    if (!query.trim()) return 1;
    const q = query.toLowerCase().trim();
    const words = q.split(/\s+/);
    const searchableText = [
        feature.title, feature.subtitle, feature.description,
        ...feature.steps, feature.tip, ...feature.tags,
    ].join(' ').toLowerCase();

    let score = 0;
    for (const word of words) {
        if (searchableText.includes(word)) score += 1;
        if (feature.title.toLowerCase().includes(word)) score += 2;
        if (feature.tags.some(t => t.includes(word))) score += 1.5;
    }
    return score;
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function GuidePage() {
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('all');
    const [expanded, setExpanded] = useState(null);
    const [showQuickStart, setShowQuickStart] = useState(true);

    const filtered = useMemo(() => {
        let list = FEATURES;
        if (category !== 'all') list = list.filter(f => f.category === category);
        if (!query.trim()) return list;
        return list
            .map(f => ({ ...f, _score: searchScore(f, query) }))
            .filter(f => f._score > 0)
            .sort((a, b) => b._score - a._score);
    }, [query, category]);

    const toggle = (id) => setExpanded(prev => prev === id ? null : id);

    return (
        <div className="min-h-screen bg-slate-50">
            {/* ── HERO ── */}
            <div className="bg-white border-b border-slate-200 px-6 lg:px-10 py-10">
                <div className="max-w-3xl mx-auto text-center space-y-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-50 border border-cyan-100 text-cyan-600 text-xs font-semibold">
                        <BookOpen className="w-3.5 h-3.5" /> Platform Kılavuzu
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                        Talent-Inn'i Nasıl Kullanırsınız?
                    </h1>
                    <p className="text-slate-500 text-sm leading-relaxed max-w-xl mx-auto">
                        Aday yönetiminden canlı AI mülakatına, analitik raporlardan ekip izolasyonuna — tüm özellikleri adım adım öğrenin.
                    </p>
                    {/* Search Bar */}
                    <div className="relative max-w-lg mx-auto pt-2">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Özellik, kavram veya adım ara... (ör: 'mülakat planla', 'cv yükle', 'kaynak')"
                            className="w-full pl-11 pr-10 py-3 text-sm border border-slate-200 rounded-xl bg-white outline-none focus:border-cyan-400 focus:ring-3 focus:ring-cyan-50 transition-all shadow-sm"
                        />
                        {query && (
                            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 transition-all">
                                <span className="text-xs">×</span>
                            </button>
                        )}
                    </div>
                    {/* Stats */}
                    <div className="flex items-center justify-center gap-8 pt-2">
                        {[['13', 'Özellik'], ['6', 'Kategori'], ['75+', 'Adım']].map(([v, l]) => (
                            <div key={l} className="text-center">
                                <div className="text-xl font-bold text-slate-800">{v}</div>
                                <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{l}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-6 lg:px-10 py-8 space-y-8">

                {/* ── QUICK START ── */}
                {!query && (
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <button
                            onClick={() => setShowQuickStart(p => !p)}
                            className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-all"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-cyan-50 border border-cyan-100 flex items-center justify-center">
                                    <Play className="w-4 h-4 text-cyan-600" />
                                </div>
                                <div className="text-left">
                                    <h2 className="text-sm font-bold text-slate-800">Hızlı Başlangıç</h2>
                                    <p className="text-xs text-slate-400">İlk işe alımınızı 6 adımda tamamlayın</p>
                                </div>
                            </div>
                            <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${showQuickStart ? 'rotate-180' : ''}`} />
                        </button>

                        {showQuickStart && (
                            <div className="px-6 pb-6">
                                <div className="relative">
                                    <div className="absolute left-5 top-6 bottom-6 w-px bg-slate-100 hidden sm:block" />
                                    <div className="space-y-4">
                                        {QUICK_STEPS.map((step, i) => {
                                            const Icon = step.icon;
                                            return (
                                                <div key={i} className="flex gap-4 relative">
                                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 relative z-10 border" style={{ background: step.color + '15', borderColor: step.color + '30' }}>
                                                        <Icon className="w-4.5 h-4.5" style={{ color: step.color }} />
                                                    </div>
                                                    <div className="flex-1 pt-1.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-bold text-slate-300">ADIM {step.num}</span>
                                                            <h3 className="text-sm font-bold text-slate-800">{step.title}</h3>
                                                        </div>
                                                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{step.desc}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── CATEGORY FILTERS ── */}
                {!query && (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        {CATEGORIES.map(cat => {
                            const Icon = cat.icon;
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => setCategory(cat.id)}
                                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all border ${
                                        category === cat.id
                                            ? 'bg-cyan-500 text-white border-cyan-500 shadow-sm'
                                            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
                                    }`}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    {cat.label}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* ── SEARCH STATUS ── */}
                {query && (
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Search className="w-4 h-4 text-slate-400" />
                            <span>"{query}" için <span className="font-semibold text-slate-700">{filtered.length}</span> sonuç</span>
                        </div>
                        <button onClick={() => setQuery('')} className="text-xs text-cyan-600 hover:text-cyan-700 font-medium">Temizle</button>
                    </div>
                )}

                {/* ── FEATURES LIST ── */}
                {filtered.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
                        <Search className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                        <h3 className="text-base font-semibold text-slate-600">Sonuç bulunamadı</h3>
                        <p className="text-sm text-slate-400 mt-1 max-w-xs mx-auto">Farklı anahtar kelimeler deneyin: "mülakat", "aday", "rapor", "google"</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map(feature => {
                            const Icon = feature.icon;
                            const isOpen = expanded === feature.id;

                            return (
                                <div key={feature.id} className={`bg-white rounded-2xl border overflow-hidden transition-all duration-300 ${isOpen ? 'border-cyan-200 shadow-sm' : 'border-slate-200 hover:border-slate-300'}`}>
                                    {/* Card Header */}
                                    <button
                                        onClick={() => toggle(feature.id)}
                                        className="w-full flex items-center gap-4 px-5 py-4 text-left"
                                    >
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border" style={{ background: feature.color + '15', borderColor: feature.color + '25' }}>
                                            <Icon className="w-5 h-5" style={{ color: feature.color }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-sm font-bold text-slate-800">{feature.title}</h3>
                                                <span className="hidden sm:block text-[10px] text-slate-400 font-medium">{feature.subtitle}</span>
                                            </div>
                                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{feature.description}</p>
                                        </div>
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0 ${isOpen ? 'bg-cyan-50 text-cyan-500' : 'bg-slate-50 text-slate-300'}`}>
                                            <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                                        </div>
                                    </button>

                                    {/* Expanded Content */}
                                    {isOpen && (
                                        <div className="border-t border-slate-100 px-5 py-5">
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                {/* LEFT: Description + Steps + Tip */}
                                                <div className="space-y-5">
                                                    <p className="text-sm text-slate-600 leading-relaxed">{feature.description}</p>

                                                    {/* Steps */}
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-3">
                                                            <ArrowRight className="w-3.5 h-3.5 text-cyan-500" />
                                                            <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Nasıl Kullanılır?</span>
                                                        </div>
                                                        <div className="space-y-2.5">
                                                            {feature.steps.map((step, i) => (
                                                                <div key={i} className="flex gap-3">
                                                                    <div className="w-5 h-5 rounded-lg text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 border" style={{ background: feature.color + '15', borderColor: feature.color + '25', color: feature.color }}>
                                                                        {i + 1}
                                                                    </div>
                                                                    <p className="text-sm text-slate-600 leading-relaxed flex-1">{step}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Tip */}
                                                    <div className="flex gap-3 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                                                        <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                                        <div>
                                                            <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-1">Profesyonel İpucu</div>
                                                            <p className="text-xs text-amber-700 leading-relaxed">{feature.tip}</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* RIGHT: Visual Mockup */}
                                                <div>
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <Eye className="w-3.5 h-3.5 text-slate-400" />
                                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Arayüz Önizlemesi</span>
                                                    </div>
                                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                                        {/* Window chrome */}
                                                        <div className="flex items-center gap-1.5 mb-3">
                                                            <div className="w-2 h-2 rounded-full bg-red-300" />
                                                            <div className="w-2 h-2 rounded-full bg-amber-300" />
                                                            <div className="w-2 h-2 rounded-full bg-emerald-300" />
                                                            <div className="flex-1 mx-2 h-4 bg-white border border-slate-100 rounded-md" />
                                                        </div>
                                                        {feature.mockup}
                                                    </div>

                                                    {/* Navigate button */}
                                                    <button
                                                        onClick={() => {
                                                            const navMap = {
                                                                'dashboard': 'dashboard',
                                                                'candidates': 'candidate-process',
                                                                'positions': 'positions',
                                                                'interview-mgmt': 'interviews',
                                                                'live-interview': 'interviews',
                                                                'interview-report': 'interviews',
                                                                'analytics': 'analytics',
                                                                'messages': 'messages',
                                                                'google-workspace': 'settings',
                                                                'sources': 'settings',
                                                                'departments': 'settings',
                                                                'super-admin': 'settings',
                                                                'settings': 'settings',
                                                            };
                                                            const view = navMap[feature.id] || 'dashboard';
                                                            window.dispatchEvent(new CustomEvent('changeView', { detail: view }));
                                                        }}
                                                        className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold rounded-xl border transition-all hover:border-cyan-300 hover:text-cyan-600 hover:bg-cyan-50 text-slate-500 border-slate-200"
                                                    >
                                                        Sayfaya Git <ChevronRight className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── FOOTER CTA ── */}
                {!query && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4">
                        <div className="w-12 h-12 rounded-2xl bg-cyan-50 border border-cyan-100 flex items-center justify-center mx-auto">
                            <Zap className="w-6 h-6 text-cyan-600" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-800">Kullanmaya Hazır mısınız?</h3>
                            <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">Hızlı başlangıç kılavuzunu tamamladınız. Kontrol Paneli'nden ilk pozisyonunuzu oluşturmaya başlayın.</p>
                        </div>
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'dashboard' }))}
                            className="inline-flex items-center gap-2 px-6 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-semibold rounded-xl transition-all"
                        >
                            Kontrol Paneline Git <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
