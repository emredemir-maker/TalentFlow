// src/pages/TechDocsPage.jsx
// Talent-Inn — Teknik Dokümantasyon Sayfası

import { useState } from 'react';
import {
    Code2, Shield, Database, Server, Globe, Key,
    Zap, Lock, Users, GitBranch, Terminal, FileText,
    ChevronDown, ChevronRight, ExternalLink, Copy,
    CheckCircle, AlertTriangle, Info, Layers, Cpu,
    Network, Activity, BookOpen, Hash, Mail, Video
} from 'lucide-react';

// ─── SECTION DATA ───────────────────────────────────────────────────────────

const SECTIONS = [
    {
        id: 'architecture',
        icon: Layers,
        color: '#3b82f6',
        title: 'Sistem Mimarisi',
        summary: '3 katmanlı mimari: React 19 Frontend → Express Backend → Firebase Cloud',
        content: <ArchitectureSection />,
    },
    {
        id: 'auth',
        icon: Users,
        color: '#10b981',
        title: 'Kimlik Doğrulama & Yetkilendirme',
        summary: 'Firebase Auth, rol tabanlı erişim kontrolü (RBAC), davet sistemi',
        content: <AuthSection />,
    },
    {
        id: 'security',
        icon: Shield,
        color: '#ef4444',
        title: 'Güvenlik Prensipleri',
        summary: 'API anahtar koruması, rate limiting, Firestore kuralları, session güvenliği',
        content: <SecuritySection />,
    },
    {
        id: 'datamodel',
        icon: Database,
        color: '#8b5cf6',
        title: 'Firestore Veri Modeli',
        summary: 'Koleksiyon yapısı, belge şemaları ve sorgulama stratejileri',
        content: <DataModelSection />,
    },
    {
        id: 'api',
        icon: Server,
        color: '#f59e0b',
        title: 'API Referansı',
        summary: 'Tüm Express endpoint\'leri — method, yol, auth ve açıklama',
        content: <ApiSection />,
    },
    {
        id: 'ai',
        icon: Cpu,
        color: '#06b6d4',
        title: 'Yapay Zeka Servisleri',
        summary: 'Gemini entegrasyonu, STAR analizi, STT, agentik iş akışı, eşleştirme motoru',
        content: <AiSection />,
    },
    {
        id: 'live-interview',
        icon: Activity,
        color: '#ec4899',
        title: 'Canlı Mülakat Sistemi',
        summary: 'Anonim aday akışı, gerçek zamanlı transkripsiyon, soru görünürlük kuralları, oturum yaşam döngüsü',
        content: <LiveInterviewSection />,
    },
    {
        id: 'face-interview',
        icon: Video,
        color: '#f59e0b',
        title: 'Yüz Yüze Mülakat & Oturum Yönetimi',
        summary: 'Tek mikrofon STT, 3 yollu soru setleri, STAR soru bağlamı, oturum iptal/askıya alma',
        content: <FaceInterviewSection />,
    },
    {
        id: 'state',
        icon: GitBranch,
        color: '#64748b',
        title: 'State Yönetimi & Context',
        summary: 'Context haritası, CandidatesContext mimarisi, enrichedCandidates',
        content: <StateSection />,
    },
    {
        id: 'email',
        icon: Mail,
        color: '#ec4899',
        title: 'E-posta Sistemi',
        summary: 'HTML şablon mimarisi, marka entegrasyonu, Gmail API thread takibi',
        content: <EmailSection />,
    },
    {
        id: 'deploy',
        icon: Globe,
        color: '#0ea5e9',
        title: 'Deploy & Ortam',
        summary: 'Replit Autoscale, ortam değişkenleri, production kritik notlar',
        content: <DeploySection />,
    },
];

// ─── SUB-COMPONENTS ─────────────────────────────────────────────────────────

function CodeBlock({ children, lang = 'bash' }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(children);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <div className="relative group my-3">
            <div className="bg-[#0f172a] rounded-xl overflow-hidden border border-slate-700/50">
                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700/50">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">{lang}</span>
                    <button onClick={copy} className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-white transition-colors">
                        {copied ? <CheckCircle className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copied ? 'Kopyalandı' : 'Kopyala'}
                    </button>
                </div>
                <pre className="p-4 text-xs text-slate-300 font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap">{children}</pre>
            </div>
        </div>
    );
}

function InfoBox({ type = 'info', children }) {
    const styles = {
        info:    { bg: 'bg-blue-50 border-blue-200', icon: Info, iconColor: 'text-blue-500', text: 'text-blue-800' },
        warning: { bg: 'bg-amber-50 border-amber-200', icon: AlertTriangle, iconColor: 'text-amber-500', text: 'text-amber-800' },
        success: { bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle, iconColor: 'text-emerald-500', text: 'text-emerald-800' },
    };
    const s = styles[type];
    const Icon = s.icon;
    return (
        <div className={`flex gap-3 p-3.5 rounded-xl border my-3 ${s.bg}`}>
            <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${s.iconColor}`} />
            <p className={`text-xs leading-relaxed ${s.text}`}>{children}</p>
        </div>
    );
}

function SectionTitle({ children }) {
    return <h3 className="text-sm font-bold text-slate-800 mb-2 mt-5 first:mt-0">{children}</h3>;
}

function Table({ headers, rows }) {
    return (
        <div className="my-3 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs">
                <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                        {headers.map(h => (
                            <th key={h} className="text-left px-4 py-2.5 font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={i} className={`border-b border-slate-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                            {row.map((cell, j) => (
                                <td key={j} className="px-4 py-2.5 text-slate-600 align-top">
                                    {typeof cell === 'string' ? (
                                        cell.startsWith('`') ? (
                                            <code className="font-mono text-[11px] bg-slate-100 text-violet-700 px-1.5 py-0.5 rounded">{cell.replace(/`/g, '')}</code>
                                        ) : cell
                                    ) : cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── SECTION CONTENT ────────────────────────────────────────────────────────

function ArchitectureSection() {
    return (
        <div>
            <SectionTitle>Genel Bakış</SectionTitle>
            <p className="text-xs text-slate-600 leading-relaxed mb-3">
                Talent-Inn, üç katmanlı bir mimari üzerine kurulmuştur. React 19 tabanlı tarayıcı uygulaması, tüm hassas işlemleri Express 5 backend'e devreder; backend ise Firebase Admin SDK ile Firestore'a güvenli erişim sağlar.
            </p>
            <CodeBlock lang="mimari">{`TARAYICI (React 19 + Vite 7)
  Context API ↔ Pages ↔ Components
  Port: 5000 (Vite Dev Server)
       │
       │  /api/* — göreceli URL (Vite proxy)
       ▼
EXPRESS BACKEND (Node.js ES Modules)
  server.js (dev) / functions/server.js (prod)
  Port: 3001
  - Gemini API çağrıları (anahtar gizli)
  - CV ayrıştırma (PDF / DOCX)
  - Puppeteer web scraping
  - Email (Nodemailer / Gmail SMTP)
  - Firebase Admin SDK
       │
       │  Firebase Admin SDK / Firestore REST
       ▼
FIREBASE (Google Cloud)
  Firestore — NoSQL, gerçek zamanlı
  Firebase Auth — Email + Google + Anonim
  Firebase Storage — CV'ler + Avatarlar`}</CodeBlock>

            <SectionTitle>Frontend Prensipleri</SectionTitle>
            <Table
                headers={['Prensip', 'Uygulama']}
                rows={[
                    ['Context-Provider Pattern', 'Her context kendi domain\'ine aittir: Auth, Candidates, Positions, Notifications, MessageQueue, UserSettings'],
                    ['Korumalı Rotalar', 'App.jsx içinde PrivateRoute + RoleRoute — yetkisiz erişimi login\'e yönlendirir'],
                    ['Göreceli API URL\'leri', 'Tüm fetch çağrıları /api/... formatı — Vite proxy halleder, production\'da Firebase rewrites'],
                    ['Optimistik UI', 'Firestore onSnapshot listener\'ları ile push tabanlı güncelleme — sayfa yenilemesi gerekmez'],
                ]}
            />
        </div>
    );
}

function AuthSection() {
    return (
        <div>
            <SectionTitle>Auth Akışı</SectionTitle>
            <CodeBlock lang="akış">{`1. Kullanıcı giriş yapar (Email/Password veya Google OAuth)
2. Firebase Auth → ID Token üretilir
3. AuthContext: Firestore'dan kullanıcı profili okunur
   → artifacts/talent-flow/public/data/users/{uid}
4. userProfile.role belirlenir
5. RBAC uygulanır (korumalı rota bileşenleri)`}</CodeBlock>

            <SectionTitle>Rol Tablosu</SectionTitle>
            <Table
                headers={['Rol', 'Tanım', 'Erişim Kapsamı']}
                rows={[
                    ['`super_admin`', 'Sistem yöneticisi', 'Tüm veriler + kullanıcı yönetimi + departman yönetimi'],
                    ['`recruiter`', 'İşe alım uzmanı', 'Tüm adaylar + pozisyonlar + mülakat yönetimi'],
                    ['`department_user`', 'Departman kullanıcısı', 'Yalnızca kendi departmanı adayları (Firestore sorgu katmanında zorunlu)'],
                    ['`candidate` (anonim)', 'Aday', 'Yalnızca /join/:sessionId URL üzerinden mülakat oturumuna erişim'],
                ]}
            />

            <SectionTitle>Davet & Domain Beyaz Listesi Sistemi</SectionTitle>
            <InfoBox type="warning">
                Yeni kullanıcılar yalnızca davet ile kayıt olabilir — ANCAK e-posta domain'i settings/system.allowedDomains listesindeyse davet kontrolü atlanır.
            </InfoBox>
            <CodeBlock lang="akış">{`Kayıt akışı (AuthContext → RegisterPage):

1. Kullanıcı e-posta girer → domain çıkarılır (@ sonrası)
2. Firestore: settings/system.allowedDomains okunur
   a. Domain listede varsa → davet kontrolü ATLANIR
      → Kullanıcı otomatik 'recruiter' rolüyle kaydolur
   b. Domain listede yoksa → invitations koleksiyonu sorgulanır
      → Eşleşme varsa kayıt tamamlanır
      → Eşleşme yoksa → "Davet bulunamadı" hatası
3. İstisna: INITIAL_SUPER_ADMIN_EMAIL her zaman kayıt olabilir`}</CodeBlock>

            <InfoBox type="info">
                allowedDomains listesi Süper Admin tarafından settings/system belgesi üzerinden yönetilir. Domain ekleme/silme anında aktif olur.
            </InfoBox>

            <SectionTitle>Departman DB İzolasyonu</SectionTitle>
            <CodeBlock lang="javascript">{`// department_user rolünde Firestore sorgu katmanında filtre
query(candidatesRef, where('department', 'in', userDepts))

// Kullanıcının departments dizisi boşsa → listener başlatılmaz
if (userDepts.length === 0) return [];

// enrichedCandidates üzerindeki istemci filtresi → ikincil güvenlik katmanı`}</CodeBlock>
        </div>
    );
}

function SecuritySection() {
    return (
        <div>
            <SectionTitle>1 — API Anahtar Koruması</SectionTitle>
            <InfoBox type="success">
                Gemini API anahtarı hiçbir zaman tarayıcı bundle'ına ulaşmaz. Tüm AI çağrıları Express backend üzerinden geçer.
            </InfoBox>
            <CodeBlock lang="akış">{`Tarayıcı → POST /api/ai/generate { prompt }
              ↓
        Express backend (VITE_GEMINI_API_KEY sunucuda)
              ↓
        Gemini API çağrısı
              ↓
        Yanıt → Tarayıcı

Not: getGlobalGeminiKey() → her zaman null döner (istemci stub)`}</CodeBlock>

            <SectionTitle>2 — Rate Limiting</SectionTitle>
            <Table
                headers={['Limiter', 'Endpoint\'ler', 'Kısıt']}
                rows={[
                    ['`generalLimiter`', 'Tüm /api/*', 'Genel istek sınırı'],
                    ['`aiLimiter`', '/api/ai/*, /api/scrape, /api/process-cv', '20 istek / dakika / IP'],
                    ['`sessionLimiter`', '/api/session/*, /api/init-interview-session, /api/update-candidate-status', '60 istek / dakika / IP'],
                ]}
            />
            <InfoBox type="info">
                app.set('trust proxy', 1) Replit proxy ortamı için zorunludur — aksi hâlde rate limit IP tespiti çalışmaz.
            </InfoBox>

            <SectionTitle>3 — HTTP Güvenlik Başlıkları</SectionTitle>
            <CodeBlock lang="javascript">{`helmet({ contentSecurityPolicy: {...}, crossOriginEmbedderPolicy: false })
xss()    // XSS girdi temizleme
hpp()    // HTTP parametre kirliliği koruması`}</CodeBlock>

            <SectionTitle>4 — CORS Politikası</SectionTitle>
            <CodeBlock lang="javascript">{`// İzin verilen origins:
*.replit.dev
*.replit.app
*.pike.replit.dev
*.firebaseapp.com
*.web.app
localhost (geliştirme)`}</CodeBlock>

            <SectionTitle>5 — Session ID Güvenliği</SectionTitle>
            <Table
                headers={['', 'Eski (güvensiz)', 'Yeni (güvenli)']}
                rows={[
                    ['Format', '`iv-{candidateId}-{timestamp}`', '`iv-{uuid}`'],
                    ['Entropi', 'Tahmin edilebilir', '122-bit rastgele'],
                    ['Risk', 'ID enumeration / tahmin', 'Bruteforce imkansız'],
                ]}
            />
            <CodeBlock lang="javascript">{`// Tüm yeni session ID'leri:
const sessionId = 'iv-' + crypto.randomUUID();`}</CodeBlock>

            <SectionTitle>6 — Firestore Güvenlik Kuralları</SectionTitle>
            <Table
                headers={['Koleksiyon', 'Okuma', 'Yazma']}
                rows={[
                    ['`users`', 'Kendi kaydı, recruiter, super_admin', 'Kendi kaydı, super_admin'],
                    ['`candidates`', 'canAccessCandidate() (belge), recruiter/dept_user (liste)', 'Recruiter'],
                    ['`departments`', 'Herkese açık', 'Yalnızca super_admin'],
                    ['`invitations`', 'Herkese açık (kayıt doğrulaması)', 'Yalnızca super_admin'],
                    ['`interviews`', 'Auth kullanıcısı (anonim dahil)', 'isAuthenticatedIncAnon()'],
                    ['`positions`', 'Herkese açık', 'Recruiter'],
                ]}
            />

            <SectionTitle>7 — Firebase Storage Kuralları</SectionTitle>
            <CodeBlock lang="rules">{`/cvs/{candidateId}/     → Okuma: auth zorunlu
/avatars/{userId}/      → Okuma: herkese açık; Yazma: yalnızca kendi
/*                      → Erişim reddedildi`}</CodeBlock>

            <SectionTitle>8 — Alan Beyaz Listesi</SectionTitle>
            <CodeBlock lang="javascript">{`// POST /api/update-candidate-status — kabul edilen alanlar:
const ALLOWED_FIELDS = [
    'candidateStatus', 'candidateConnected',
    'candidatePresence', 'lastActive', 'hasConsent'
];
// aiScore, summary, matchScore gibi kritik alanlara dış yazma engellenir`}</CodeBlock>
        </div>
    );
}

function DataModelSection() {
    return (
        <div>
            <SectionTitle>Koleksiyon Yolları</SectionTitle>
            <CodeBlock lang="firestore">{`artifacts/talent-flow/public/data/
├── users/           {uid}
├── candidates/      {candidateId}
├── positions/       {positionId}
├── departments/     {deptId}
├── invitations/     {email}
├── sources/         {sourceId}
├── interviews/      {sessionId}
├── emailThreads/    {autoId}       ← Gmail thread takibi
├── bulkImportJobs/  {jobId}        ← Toplu CV yükleme iş kuyruğu
└── settings/
    ├── branding     (tek belge)    ← Kurumsal kimlik
    └── system       (tek belge)   ← Domain beyaz listesi`}</CodeBlock>

            <SectionTitle>Aday Belgesi Şeması</SectionTitle>
            <CodeBlock lang="javascript">{`{
  id: string,               // Firestore belge ID
  name: string,
  email: string,
  phone: string,
  position: string,
  positionId: string,       // Bağlı pozisyon Firestore ID (opsiyonel)
  department: string,
  status: 'new' | 'reviewing' | 'shortlisted' | 'hired' | 'rejected',
  matchScore: number,       // 0-100, AI hesaplar
  aiScore: number,          // Ağırlıklı skor
  summary: string,          // AI özet
  skills: string[],
  experience: string,
  source: 'manual' | 'scraper' | 'cv' | 'application',
  cvUrl: string,            // Firebase Storage URL
  interviewSessions: [{
    id: string,             // iv-{uuid}
    title: string,
    date: string,           // ISO 8601
    time: string,           // 'HH:MM'
    type: 'technical' | 'hr' | 'product',
    status: 'scheduled' | 'live' | 'completed' | 'postponed' | 'cancelled',
    positionId: string,     // Mülakat için seçilen pozisyon ID (opsiyonel)
    positionTitle: string,  // Mülakat için seçilen pozisyon başlığı
    interviewerName: string,
    interviewerId: string,
    meetLink: string,
    transcript: string,
    starAnalysis: object,   // AI STAR değerlendirmesi
    questions: object[],
    visibleToCandidate: boolean,
  }],
  createdAt: Timestamp,
  updatedAt: Timestamp,
}`}</CodeBlock>

            <SectionTitle>Kullanıcı Belgesi Şeması</SectionTitle>
            <CodeBlock lang="javascript">{`{
  uid: string,
  name: string,
  email: string,
  role: 'super_admin' | 'recruiter' | 'department_user',
  departments: string[],    // department_user için atanmış departmanlar
  department: string,       // Eski format (geriye dönük uyumluluk)
  googleAccessToken: string,
  googleRefreshToken: string,
  createdAt: Timestamp,
}`}</CodeBlock>

            <SectionTitle>Pozisyon Belgesi Şeması (Ek Alanlar)</SectionTitle>
            <CodeBlock lang="javascript">{`// artifacts/talent-flow/public/data/positions/{positionId}
{
  title: string,
  department: string,
  description: string,       // AI tarafından üretilen kısa özet (max 320 karakter)
  requirements: string[],
  minExperience: number,
  status: 'open' | 'closed',
  screeningEnabled: boolean, // true → başvuru formunda ön eleme soruları gösterilir
  screeningQuestions: string[],  // Ön eleme soru metinleri
  matchedCandidates: [{id, name, score, reason}],
  createdAt: Timestamp,
}`}</CodeBlock>
            <InfoBox type="info">
                description alanı artık extractPositionFromJD() tarafından üretilen kısa özettir — iş ilanının ham metni değil. İş akışı: Pozisyon formu → "AI Doldur" → Gemini max 280 karakter özet üretir → description alanına yazılır.
            </InfoBox>

            <SectionTitle>bulkImportJobs Belgesi Şeması</SectionTitle>
            <CodeBlock lang="javascript">{`// artifacts/talent-flow/public/data/bulkImportJobs/{jobId}
{
  status: 'queued' | 'processing' | 'done' | 'error',
  total: number,          // Toplam dosya sayısı
  completed: number,      // Başarıyla işlenen
  failed: number,         // Hata veren
  items: [{
    originalName: string, // Orijinal dosya adı
    status: 'queued' | 'processing' | 'done' | 'error',
    candidateId: string,  // Oluşturulan aday Firestore ID
    score: number,        // AI uyum skoru
    error: string,        // Hata mesajı (varsa)
  }],
  positionId: string,     // Tüm adaylar için ortak pozisyon (opsiyonel)
  createdAt: Timestamp,
  updatedAt: Timestamp,
}`}</CodeBlock>

            <SectionTitle>settings/branding Belgesi Şeması</SectionTitle>
            <CodeBlock lang="javascript">{`// artifacts/talent-flow/public/data/settings/branding
{
  companyName: string,    // Şirket adı
  logoUrl: string,        // Firebase Storage download URL
  primaryColor: string,   // HEX renk kodu (örn: '#1E3A8A')
  tagline: string,        // E-posta başlığı altı slogan
  website: string,        // Footer linki
  updatedAt: Timestamp,
}`}</CodeBlock>

            <SectionTitle>settings/system Belgesi Şeması</SectionTitle>
            <CodeBlock lang="javascript">{`// artifacts/talent-flow/public/data/settings/system
{
  allowedDomains: string[],  // Davet gerektirmeyen e-posta domain'leri
                              // ör: ['btcturk.com', 'infoset.app']
  updatedAt: Timestamp,
}`}</CodeBlock>
        </div>
    );
}

function ApiSection() {
    return (
        <div>
            <InfoBox type="info">
                Frontend'den çağırırken her zaman göreceli URL kullanın: /api/... — asla http://localhost:3001/... değil.
            </InfoBox>

            <SectionTitle>Sağlık & Genel</SectionTitle>
            <Table
                headers={['Method', 'Endpoint', 'Açıklama']}
                rows={[
                    ['GET', '`/api/health`', 'Sunucu durumu ve sürüm kontrolü'],
                ]}
            />

            <SectionTitle>AI & İçerik</SectionTitle>
            <Table
                headers={['Method', 'Endpoint', 'Rate Limit', 'Açıklama']}
                rows={[
                    ['POST', '`/api/ai/generate`', 'aiLimiter', 'Gemini metin üretimi (prompt → yanıt)'],
                    ['POST', '`/api/ai/stt`', 'aiLimiter', 'Ses base64 → transkripsiyon + duygu analizi'],
                    ['GET', '`/api/scrape?q=`', 'aiLimiter', 'Puppeteer ile aday profili bulma'],
                    ['POST', '`/api/process-cv`', 'aiLimiter', 'PDF/DOCX yükleme → metin + AI analizi (Multer)'],
                    ['POST', '`/api/direct-add`', 'aiLimiter', 'Doğrudan aday ekleme + AI zenginleştirme'],
                    ['POST', '`/api/check-duplicate`', '—', 'Admin SDK ile aday tekrar kontrolü'],
                ]}
            />

            <SectionTitle>Mülakat Oturumu</SectionTitle>
            <Table
                headers={['Method', 'Endpoint', 'Rate Limit', 'Açıklama']}
                rows={[
                    ['GET', '`/api/session/:sessionId`', 'sessionLimiter', 'Oturum verisi + yalnızca adaya görünür sorular'],
                    ['POST', '`/api/init-interview-session`', 'sessionLimiter', 'Yeni oturum başlatma (permission-denied durumunda)'],
                    ['POST', '`/api/update-candidate-status`', 'sessionLimiter', 'Alan beyaz listesiyle durum güncelleme'],
                ]}
            />

            <SectionTitle>Google Workspace</SectionTitle>
            <Table
                headers={['Method', 'Endpoint', 'Açıklama']}
                rows={[
                    ['POST', '`/api/google/send-email`', 'Gmail üzerinden e-posta gönderimi'],
                    ['GET', '`/api/google/check-messages`', 'Gmail inbox okuma'],
                    ['POST', '`/api/google/create-calendar-event`', 'Google Takvim etkinliği oluşturma'],
                ]}
            />

            <SectionTitle>Başvuru Sistemi</SectionTitle>
            <Table
                headers={['Method', 'Endpoint', 'Açıklama']}
                rows={[
                    ['GET', '`/api/positions/:positionId`', 'Pozisyon detayı (genel erişim)'],
                    ['POST', '`/api/applications`', 'Başvuru formu gönderimi'],
                    ['POST', '`/api/send-invite`', 'Mülakat davet e-postası gönderimi'],
                ]}
            />

            <SectionTitle>Toplu CV Yükleme</SectionTitle>
            <Table
                headers={['Method', 'Endpoint', 'Rate Limit', 'Açıklama']}
                rows={[
                    ['POST', '`/api/bulk-import`', 'requireAuth', 'Çoklu CV yükleme (max 20 dosya) — Multer bulkUpload middleware; job ID döner'],
                    ['GET', '`/api/bulk-import/:jobId`', 'requireAuth', 'İş kuyruğu durumu sorgulama (Firestore bulkImportJobs belgesi)'],
                ]}
            />
            <InfoBox type="info">
                Dosyalar sunucuya yüklenir, sırayla işlenir ve her biri için ayrı Gemini AI çağrısı yapılır. İlerleme durumu Firestore bulkImportJobs koleksiyonu üzerinden onSnapshot ile canlı takip edilir.
            </InfoBox>

            <SectionTitle>Ön Eleme Sorusu İyileştirme</SectionTitle>
            <Table
                headers={['Method', 'Endpoint', 'Rate Limit', 'Açıklama']}
                rows={[
                    ['POST', '`/api/improve-screening-question`', 'aiLimiter', 'Verilen soruyu STAR-uyumlu davranışsal formata dönüştürür; { question } → { improved }'],
                ]}
            />
        </div>
    );
}

function AiSection() {
    return (
        <div>
            <SectionTitle>Agentik İş Akışı</SectionTitle>
            <p className="text-xs text-slate-600 leading-relaxed mb-2">
                <code className="font-mono text-[11px] bg-slate-100 text-violet-700 px-1.5 py-0.5 rounded">agenticWorkflow.js</code> — Aday verisini sıralı adımlarla işleyen orkestrasyon motoru.
            </p>
            <CodeBlock lang="akış">{`1. Ham Veri Alımı    → Scraper / CV yükleme / Manuel giriş
2. Metin Çıkarımı   → cvParser.js (PDF: pdfjs-dist, DOCX: mammoth)
3. Yapısal Zenginleştirme → Gemini: skill çıkarımı, deneyim ayrıştırma
4. Yetenek Etiketleme → matchService.js
5. Açıklanabilir AI → Ağırlıklı skor + gerekçe metni
6. Firestore Yazma  → Tamamlanmış aday belgesi`}</CodeBlock>

            <SectionTitle>STAR Analizi</SectionTitle>
            <p className="text-xs text-slate-600 leading-relaxed mb-2">
                Canlı mülakat sırasında gerçek zamanlı değerlendirme. Her yanıt 4 boyutta 0-10 arası puanlanır.
            </p>
            <Table
                headers={['Boyut', 'Açıklama']}
                rows={[
                    ['**S** — Situation', 'Durum tanımı netliği ve bağlam kurma'],
                    ['**T** — Task', 'Görev netliği ve kişisel sorumluluk'],
                    ['**A** — Action', 'Alınan aksiyon ve karar kalitesi'],
                    ['**R** — Result', 'Ölçülebilir sonuç ve öğrenilen ders'],
                ]}
            />

            <SectionTitle>STT & Duygu Analizi</SectionTitle>
            <CodeBlock lang="akış">{`Ses (base64, WebM/Opus)
  → POST /api/ai/stt
  → Gemini multimodal API
  → Transkripsiyon metni
  → Duygu etiketleri (pozitif / nötr / negatif / stresli)
  → Güven skoru
  → Firestore'a yazılır → recruiter ekranında anlık güncellenir`}</CodeBlock>

            <SectionTitle>Eşleştirme Motoru</SectionTitle>
            <Table
                headers={['Kriter', 'Ağırlık']}
                rows={[
                    ['Zorunlu beceri örtüşmesi', '%40'],
                    ['Tercih edilen beceri örtüşmesi', '%20'],
                    ['Deneyim seviyesi eşleşmesi', '%25'],
                    ['Eğitim uyumu', '%15'],
                ]}
            />
        </div>
    );
}

function LiveInterviewSection() {
    return (
        <div>
            <SectionTitle>Mülakat Akışı</SectionTitle>
            <CodeBlock lang="akış">{`Recruiter: Mülakat oluşturur
  → crypto.randomUUID() → "iv-{uuid}" session ID
  → Firestore: interviews/{sessionId} belgesi yazılır
  → /live-interview/{sessionId} → Recruiter görünümü

Aday: /join/{sessionId} bağlantısı
  → Firebase Anonim Auth → anonim UID
  → Firestore kuralları anonim okumayı engeller!
  → GET /api/session/{sessionId} polling (her 3 saniye)
     Admin SDK kullanır → kuralları atlar
  → Yalnızca visibleToCandidate: true sorular döner`}</CodeBlock>

            <SectionTitle>effectiveSession Paterni</SectionTitle>
            <CodeBlock lang="javascript">{`// Firestore okuma başarısız olursa (anonim kısıtı)
// API polling verisi fallback olarak kullanılır
const effectiveSession = session || apiSession;`}</CodeBlock>

            <SectionTitle>Soru Görünürlüğü</SectionTitle>
            <InfoBox type="warning">
                Aday hiçbir zaman gizli soruları göremez. Filtreleme sunucu tarafında yapılır — istemci kodu güvenlik katmanı değildir.
            </InfoBox>
            <Table
                headers={['Kullanıcı', 'Gördüğü Sorular']}
                rows={[
                    ['Recruiter', 'Tüm sorular (gizli + görünür)'],
                    ['Aday', 'Yalnızca visibleToCandidate: true olanlar (sunucu filtreli)'],
                ]}
            />

            <SectionTitle>Gerçek Zamanlı Transkripsiyon</SectionTitle>
            <CodeBlock lang="akış">{`Tarayıcı (MediaRecorder API)
  → 5 saniyelik ses parçaları → base64
  → POST /api/ai/stt
  → Transkript + duygu analizi
  → Firestore'a yazılır
  → Recruiter ekranında onSnapshot ile anlık güncellenir`}</CodeBlock>

            <SectionTitle>Oturum Yaşam Döngüsü</SectionTitle>
            <Table
                headers={['Durum', 'Anlamı', 'Görünürlük']}
                rows={[
                    ['`scheduled`', 'Planlandı, henüz başlamadı', 'Aktif listede görünür'],
                    ['`live`', 'Hazırlık/mülakat devam ediyor', 'Aktif listede, takvimde görünür'],
                    ['`completed`', 'Mülakat tamamlandı', 'Geçmiş listede görünür'],
                    ['`cancelled`', 'İptal edildi', 'Hiçbir listede gösterilmez'],
                ]}
            />
            <InfoBox type="warning">
                İptal edilen oturumlar <code className="font-mono text-[11px] bg-amber-100 text-amber-800 px-1 rounded">InterviewManagementPage</code>, <code className="font-mono text-[11px] bg-amber-100 text-amber-800 px-1 rounded">Dashboard</code> ve takvim görünümünden tamamen filtrelenir. Firestore belgesi silinmez — durum <code className="font-mono text-[11px] bg-amber-100 text-amber-800 px-1 rounded">status: 'cancelled'</code> olarak kalır.
            </InfoBox>
            <SectionTitle>persistSessionData — Kanonik Yazma Fonksiyonu</SectionTitle>
            <p className="text-xs text-slate-600 leading-relaxed mb-2">
                Tüm oturum durumu değişiklikleri doğrudan <code className="font-mono text-[11px] bg-slate-100 text-violet-700 px-1.5 py-0.5 rounded">updateDoc</code> yerine bu fonksiyon üzerinden yapılır. İki belgeyi atomik olarak günceller: <code className="font-mono text-[11px] bg-slate-100 text-violet-700 px-1.5 py-0.5 rounded">interviews/{'{'}sessionId{'}'}</code> kök belgesi ve aday üzerindeki <code className="font-mono text-[11px] bg-slate-100 text-violet-700 px-1.5 py-0.5 rounded">interviewSessions</code> dizisi.
            </p>
            <CodeBlock lang="javascript">{`// LiveInterviewPage.jsx — handleCancelSession
const handleCancelSession = async () => {
    await persistSessionData({ status: 'cancelled' });
    // Artık tüm listeler bu oturumu otomatik filtreler
};

// "Askıya Al" — durum değiştirmez, sadece yönlendirir
const handleSuspendSession = () => {
    navigate('/dashboard');  // Oturum 'live' kalır
};`}</CodeBlock>
        </div>
    );
}

function FaceInterviewSection() {
    return (
        <div>
            <SectionTitle>Genel Bakış</SectionTitle>
            <p className="text-xs text-slate-600 leading-relaxed mb-3">
                Yüz yüze mülakat modu, recruiter ve adayın aynı fiziksel ortamda bulunduğu senaryolar için tasarlanmıştır. Tek bir cihaz ve mikrofon kullanılarak her iki tarafın sesi kaydedilir; WebRTC bağlantısı gerekmez.
            </p>
            <Table
                headers={['Özellik', 'Canlı Mülakat (Remote)', 'Yüz Yüze Mülakat']}
                rows={[
                    ['Bağlantı', 'WebRTC (2 cihaz)', 'Tek cihaz, tek mikrofon'],
                    ['Rota', '`/live-interview/:id`', '`/face-interview/:id`'],
                    ['Aday erişimi', 'Benzersiz join linki', 'Gerekmiyor'],
                    ['Soru setleri', 'Tek set', '3 paralel set (aynı strateji)'],
                    ['Strateji', 'Dinamik mod seçimi', 'Davranışsal / Teknik / Karma'],
                ]}
            />

            <SectionTitle>Çok Yollu Soru Setleri (Multi-Path)</SectionTitle>
            <p className="text-xs text-slate-600 leading-relaxed mb-2">
                AI, hazırlık ekranında seçilen stratejiye göre tek bir Gemini çağrısıyla 3 farklı soru seti üretir. Setler <code className="font-mono text-[11px] bg-slate-100 text-violet-700 px-1.5 py-0.5 rounded">paths</code> state'inde tutulur; geçiş anlıktır ve yeniden API çağrısı gerektirmez.
            </p>
            <CodeBlock lang="javascript">{`// FaceToFacePage.jsx — generateInterviewPaths
const generateInterviewPaths = async (strategy) => {
    const result = await callGemini(prompt);
    // Gemini yanıtı 3 ayrı soru seti içerir
    setPaths([set1, set2, set3]);   // paths[0..2]
    setActivePathIdx(0);            // her zaman Set 1'den başlar
};

// Set değiştirme — AI çağrısı YOK
const handlePathSwitch = (idx) => {
    setActivePathIdx(idx);          // paths[idx] anında aktif olur
};

// Strateji değiştirme — yeni AI çağrısı başlatır
const handleStrategyChange = (newStrategy) => {
    setStrategy(newStrategy);
    generateInterviewPaths(newStrategy);  // 3 yeni set
};`}</CodeBlock>
            <InfoBox type="info">
                Strateji değiştirildiğinde <code className="font-mono text-[11px] bg-blue-100 text-blue-800 px-1 rounded">generateInterviewPaths</code> yeniden çağrılır ve <code className="font-mono text-[11px] bg-blue-100 text-blue-800 px-1 rounded">activePathIdx</code> 0'a döner. Salt set değiştirme hiçbir zaman Gemini çağrısı yapmaz.
            </InfoBox>

            <SectionTitle>STAR Analizi — Soru Bağlamı</SectionTitle>
            <p className="text-xs text-slate-600 leading-relaxed mb-2">
                Gerçek zamanlı STAR skorlaması, aktif soruyu Gemini prompt'una ekler. Bu sayede AI adayın cevabını soruya özgü bağlamda değerlendirir.
            </p>
            <CodeBlock lang="javascript">{`// FaceToFacePage.jsx — analyzeSTARRealTime
await analyzeSTARRealTime(
    transcript,
    questions[currentQIndex]?.text   // ← soru bağlamı (daha önce null'dı)
);

// Prompt içinde kullanımı (server.js)
// "Soru: ${currentQuestion}\\nAday cevabı: ${transcript}\\nSTAR..."
`}</CodeBlock>
            <InfoBox type="success">
                Soru bağlamı eklenmeden önce tüm cevaplar aynı genel prompt'a gönderiliyordu. Şimdi her STAR skoru o soruya özgü kriterlere göre hesaplanır.
            </InfoBox>

            <SectionTitle>Oturum İptal & Askıya Alma Akışı</SectionTitle>
            <p className="text-xs text-slate-600 leading-relaxed mb-2">
                Hazırlık (lobby) ekranında recruiter iki farklı kontrol eylemine sahiptir:
            </p>
            <CodeBlock lang="akış">{`"Mülakatı İptal Et" butonu (kırmızı)
  → Onay penceresi açılır
  → Onaylanırsa: persistSessionData({ status: 'cancelled' })
  → interviews/{sessionId}.status = 'cancelled'
  → candidate.interviewSessions[n].status = 'cancelled'
  → InterviewManagementPage: isCancelled → aktif + geçmiş listeden atlar
  → Dashboard: cancelled filtresiyle zaten görünmüyor
  → Takvim: allCalSessions useMemo sessionStatuses'dan filtreler

"Askıya Al" butonu (gri)
  → Oturum durumu değişmez (status: 'live' kalır)
  → navigate('/dashboard') — recruiter ana sayfaya yönlenir
  → Mülakatlar sayfasından "Devam Et" ile geri dönülebilir`}</CodeBlock>
        </div>
    );
}

function StateSection() {
    return (
        <div>
            <SectionTitle>Context Haritası</SectionTitle>
            <CodeBlock lang="tree">{`App
├── AuthContext
│   └── currentUser, userProfile, userId, logout, isAuthenticated
├── CandidatesContext
│   ├── enrichedCandidates (memoized)
│   ├── addCandidate, updateCandidate, deleteCandidate
│   └── Firestore onSnapshot listener (rol bazlı filtreli)
├── PositionsContext
│   └── positions, addPosition, updatePosition, deletePosition
├── NotificationContext
│   └── bildirim kuyruğu, toast mesajları
├── MessageQueueContext
│   └── asenkron mesaj kuyruğu
└── UserSettingsContext
    └── kullanıcı tercihleri (tema, dil, panel düzeni)`}</CodeBlock>

            <SectionTitle>enrichedCandidates Hesaplama</SectionTitle>
            <CodeBlock lang="javascript">{`// CandidatesContext içinde useMemo ile hesaplanır
const enrichedCandidates = useMemo(() => {
    return rawCandidates
        .map(candidate => ({
            ...candidate,
            // İlgili pozisyon join edilir
            positionData: positions.find(p => p.id === candidate.positionId),
            // matchScore normalize edilir (0-100)
            matchScore: normalizeScore(candidate.matchScore),
            // Aktif oturum sayısı hesaplanır
            activeSessionCount: (candidate.interviewSessions || [])
                .filter(s => s.status === 'live' || s.status === 'scheduled').length,
        }))
        // İstemci tarafı ikincil filtre (DB izolasyonuna ek)
        .filter(c => canAccess(c, userProfile));
}, [rawCandidates, positions, userProfile]);`}</CodeBlock>
        </div>
    );
}

function EmailSection() {
    return (
        <div>
            <SectionTitle>Genel Bakış</SectionTitle>
            <p className="text-xs text-slate-600 leading-relaxed mb-3">
                Talent-Inn iki farklı e-posta kanalı kullanır: sistem davetleri için Nodemailer (Gmail SMTP), mülakat yazışmaları için Gmail API (OAuth 2.0 — recruiter hesabı üzerinden). Tüm e-postalar branding nesnesiyle kişiselleştirilebilen HTML şablonlarıyla gönderilir.
            </p>
            <Table
                headers={['Kanal', 'Kullanım', 'Kimlik Doğrulama']}
                rows={[
                    ['Nodemailer / Gmail SMTP', 'Kullanıcı davet e-postası (sistem → yeni kullanıcı)', 'EMAIL_USER + EMAIL_PASS secret'],
                    ['Gmail API (OAuth 2.0)', 'Mülakat daveti (recruiter → aday/katılımcı)', 'googleAccessToken / googleRefreshToken (Firestore\'da saklı)'],
                ]}
            />

            <SectionTitle>Şablon Mimarisi</SectionTitle>
            <p className="text-xs text-slate-600 leading-relaxed mb-2">
                <code className="font-mono text-[11px] bg-slate-100 text-violet-700 px-1.5 py-0.5 rounded">src/utils/emailTemplates.js</code> — Frontend ve backend tarafında ortak kullanılan şablon üreticisi. Tüm fonksiyonlar <code className="font-mono text-[11px] bg-slate-100 text-violet-700 px-1.5 py-0.5 rounded">branding</code> nesnesini parametre olarak alır.
            </p>
            <Table
                headers={['Fonksiyon', 'Tipi', 'Alıcı', 'İçerik']}
                rows={[
                    ['`buildInviteEmail()`', 'Sistem daveti', 'Yeni kullanıcı', 'Hoş geldiniz, rol bilgisi, davet linki'],
                    ['`buildInterviewInviteEmail()`', 'Mülakat daveti', 'Aday', 'Pozisyon, tarih/saat, mülakat türü, "Mülakata Katıl" butonu'],
                    ['`buildParticipantNotificationEmail()`', 'Katılımcı bildirimi', 'İç/harici katılımcı', 'Aday bilgisi, mülakat detayları, Meet linki'],
                ]}
            />

            <SectionTitle>Branding Nesnesi</SectionTitle>
            <CodeBlock lang="javascript">{`// Firestore: artifacts/talent-flow/public/data/settings/branding
const branding = {
    companyName: string,    // Şirket adı (fallback: 'Talent-Inn')
    logoUrl: string,        // Firebase Storage URL veya boş
    primaryColor: string,   // HEX — başlık arka planı ve buton rengi
    tagline: string,        // Slogan (başlık altında)
    website: string,        // Footer web sitesi linki
};

// Varsayılan (branding kayıtlı değilse):
DEFAULT_BRANDING = { companyName: 'Talent-Inn', primaryColor: '#1E3A8A', ... }`}</CodeBlock>

            <SectionTitle>HTML Şablon Yapısı</SectionTitle>
            <CodeBlock lang="html">{`<!-- baseLayout() her şablona sarılır -->
<table width="600">
  <!-- HEADER: primaryColor arka plan, logo veya şirket adı -->
  <tr><td style="background:{primaryColor}">
    <img src="{logoUrl}" /> | <span>{companyName}</span>
    <p>{tagline}</p>
  </td></tr>

  <!-- CONTENT: şablona özgü içerik (branding rengi accent olarak) -->
  <tr><td style="padding:40px">
    {content}   ← buildInterviewInviteEmail() vb. tarafından doldurulur
  </td></tr>

  <!-- FOOTER: şirket adı + web sitesi -->
  <tr><td style="background:#F8FAFC">
    Bu e-posta {companyName} tarafından gönderilmiştir.
  </td></tr>
</table>`}</CodeBlock>

            <SectionTitle>Gmail API — Mülakat Daveti Gönderimi</SectionTitle>
            <CodeBlock lang="akış">{`1. InterviewManagementPage → buildInterviewInviteEmail(branding, {...})
   → HTML string üretilir
2. POST /api/google/send-email  { to, subject, html, threadId? }
   → server.js: Gmail API messages.send (multipart/mixed, base64url)
   → Yanıt: { messageId, threadId }
3. Firestore: emailThreads/{autoId} belgesi yazılır
   { threadId, messageId, candidateId, candidateName,
     candidateEmail, subject, recruiterId, recruiterName,
     sentAt, hasReply: false }
4. Katılımcı döngüsü → buildParticipantNotificationEmail() ile tekrarlanır`}</CodeBlock>

            <SectionTitle>Gmail API — Thread Yanıt Takibi</SectionTitle>
            <CodeBlock lang="akış">{`1. MessagesPage → "E-posta Yazışmaları" sekmesi
2. Firestore: emailThreads — recruiterId == currentUser.uid filtreli
3. Kullanıcı "Yanıtları Kontrol Et" butonuna basar
4. POST /api/google/send-email (fetchThread: true, threadId)
   → GET https://gmail.googleapis.com/gmail/v1/users/me/threads/{threadId}
   → Thread mesajları döner
5. messages.length > 1 → yanıt var
6. Firestore: emailThreads/{docId}.hasReply = true güncellenir
7. UI: "Yanıt Var" rozeti yeşil olarak gösterilir`}</CodeBlock>

            <SectionTitle>emailThreads Koleksiyon Şeması</SectionTitle>
            <CodeBlock lang="javascript">{`// artifacts/talent-flow/public/data/emailThreads/{autoId}
{
    threadId: string,         // Gmail thread ID
    messageId: string,        // Gmail message ID (ilk mesaj)
    candidateId: string,      // Aday Firestore ID
    candidateName: string,
    candidateEmail: string,
    subject: string,          // E-posta konusu
    recruiterId: string,      // Gönderen recruiter uid
    recruiterName: string,
    sentAt: Timestamp,
    hasReply: boolean,        // false → true (yanıt gelince güncellenir)
}`}</CodeBlock>

            <SectionTitle>Harici Katılımcı Akışı</SectionTitle>
            <InfoBox type="info">
                Harici katılımcılar sistemde kayıtlı değildir; id alanı "external_{`{email}`}" formatıyla üretilir ve isExternal: true ile işaretlenir.
            </InfoBox>
            <Table
                headers={['Özellik', 'Sistem Kullanıcısı', 'Harici Katılımcı']}
                rows={[
                    ['id formatı', '`{firestoreUid}`', '`external_{email}`'],
                    ['Müsaitlik kontrolü', 'Google Takvim sorgulanır', 'Kontrol edilmez'],
                    ['E-posta bildirimi', 'buildParticipantNotificationEmail()', 'Aynı şablon'],
                    ['Google Takvim daveti', 'Evet', 'Hayır'],
                    ['UI rozeti', 'Mavi (dahili)', 'Amber (@ rozeti)'],
                ]}
            />
        </div>
    );
}

function DeploySection() {
    return (
        <div>
            <SectionTitle>Ortam Değişkenleri</SectionTitle>
            <Table
                headers={['Değişken', 'Açıklama', 'Taraf']}
                rows={[
                    ['`VITE_FIREBASE_API_KEY`', 'Firebase Web API anahtarı', 'Frontend'],
                    ['`VITE_FIREBASE_AUTH_DOMAIN`', 'Firebase auth domain', 'Frontend'],
                    ['`VITE_FIREBASE_PROJECT_ID`', 'Firebase proje ID', 'Frontend'],
                    ['`VITE_FIREBASE_STORAGE_BUCKET`', 'Firebase storage bucket', 'Frontend'],
                    ['`VITE_FIREBASE_MESSAGING_SENDER_ID`', 'FCM sender ID', 'Frontend'],
                    ['`VITE_FIREBASE_APP_ID`', 'Firebase app ID', 'Frontend'],
                    ['`VITE_GEMINI_API_KEY`', 'Gemini API anahtarı (VITE_ prefix ama backend okur)', 'Backend'],
                    ['`EMAIL_USER`', 'Gmail hesabı (Nodemailer)', 'Backend'],
                    ['`EMAIL_PASS`', 'Gmail uygulama şifresi', 'Backend'],
                    ['`GITHUB_PERSONAL_ACCESS_TOKEN_NEW`', 'GitHub push tokeni', 'CI/CD'],
                ]}
            />

            <SectionTitle>Geliştirme</SectionTitle>
            <CodeBlock lang="bash">{`npm run dev
# Vite (port 5000) + Express (port 3001) eş zamanlı başlar
# concurrently "vite" "node server.js"`}</CodeBlock>

            <SectionTitle>Production (Replit Autoscale)</SectionTitle>
            <CodeBlock lang="bash">{`npm run build
# → dist/ oluşturulur

bash -c "node server.js & npx vite preview --port 5000 --host 0.0.0.0"`}</CodeBlock>

            <SectionTitle>GitHub Sync</SectionTitle>
            <CodeBlock lang="bash">{`TOKEN=$(printenv GITHUB_PERSONAL_ACCESS_TOKEN_NEW)\ngit push https://emredemir-maker:\${TOKEN}@github.com/emredemir-maker/TalentFlow.git main`}</CodeBlock>

            <SectionTitle>Kritik Notlar</SectionTitle>
            <div className="space-y-2">
                <InfoBox type="warning">
                    İki sunucu dosyası: server.js (geliştirme) VE functions/server.js (production Firebase Functions) — her değişikliği her ikisine de uygulamak gerekir.
                </InfoBox>
                <InfoBox type="warning">
                    Firestore kuralları deploy: firebase deploy --only firestore:rules — Firebase CLI kimlik bilgileri gerektirir (Replit Secrets'ta tanımlanmamış).
                </InfoBox>
                <InfoBox type="info">
                    Vite allowedHosts: true zorunludur. Replit proxy iframe üzerinden geldiğinden host doğrulaması devre dışı bırakılmalıdır.
                </InfoBox>
            </div>
        </div>
    );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

export default function TechDocsPage() {
    const [expanded, setExpanded] = useState(null);

    const toggle = (id) => setExpanded(prev => prev === id ? null : id);

    return (
        <div className="min-h-screen bg-slate-50 font-inter">

            {/* Hero */}
            <div className="bg-white border-b border-slate-200 px-6 lg:px-10 py-10">
                <div className="max-w-3xl mx-auto text-center space-y-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-50 border border-violet-100 text-violet-600 text-xs font-semibold">
                        <Code2 className="w-3.5 h-3.5" /> Teknik Dokümantasyon
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                        Talent-Inn — Sistem Kılavuzu
                    </h1>
                    <p className="text-slate-500 text-sm leading-relaxed max-w-xl mx-auto">
                        Mimari, güvenlik prensipleri, API referansı, veri modeli ve deploy notları — geliştiriciler için kapsamlı teknik başvuru kaynağı.
                    </p>
                    <div className="flex items-center justify-center gap-8 pt-2">
                        {[['10', 'Bölüm'], ['8', 'Güvenlik Katmanı'], ['21', 'API Endpoint']].map(([v, l]) => (
                            <div key={l} className="text-center">
                                <div className="text-xl font-bold text-slate-800">{v}</div>
                                <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{l}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-4xl mx-auto px-6 lg:px-10 py-8 space-y-3">

                {/* Version badge */}
                <div className="flex items-center gap-3 pb-2">
                    <span className="text-xs text-slate-400">v2.0 · Mart 2026</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    <a
                        href="https://github.com/emredemir-maker/TalentFlow"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 font-medium"
                    >
                        GitHub <ExternalLink className="w-3 h-3" />
                    </a>
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    <span className="text-xs text-slate-400">React 19 + Vite 7 + Firebase + Express 5</span>
                </div>

                {/* Sections accordion */}
                {SECTIONS.map((section, idx) => {
                    const Icon = section.icon;
                    const isOpen = expanded === section.id;
                    return (
                        <div
                            key={section.id}
                            className={`bg-white rounded-2xl border overflow-hidden transition-all duration-300 ${isOpen ? 'border-violet-200 shadow-sm' : 'border-slate-200 hover:border-slate-300'}`}
                        >
                            <button
                                onClick={() => toggle(section.id)}
                                className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-slate-50/50 transition-all"
                            >
                                <div
                                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                                    style={{ background: section.color + '15', border: `1px solid ${section.color}30` }}
                                >
                                    <Icon className="w-4.5 h-4.5" style={{ color: section.color }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold text-slate-300">{String(idx + 1).padStart(2, '0')}</span>
                                        <h2 className="text-sm font-bold text-slate-800">{section.title}</h2>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-0.5 truncate">{section.summary}</p>
                                </div>
                                {isOpen
                                    ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                                    : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                                }
                            </button>

                            {isOpen && (
                                <div className="px-6 pb-6 pt-2 border-t border-slate-100 animate-in fade-in slide-in-from-top-1 duration-200">
                                    {section.content}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Footer */}
                <div className="text-center py-8 text-xs text-slate-400">
                    Bu dokümantasyon Talent-Inn v2.0 ile günceldir. Mimari değişikliklerinde lütfen
                    <span className="font-mono mx-1 text-violet-600">docs/TECHNICAL.md</span>
                    ve
                    <span className="font-mono mx-1 text-violet-600">replit.md</span>
                    dosyalarını da güncelleyin.
                </div>
            </div>
        </div>
    );
}
