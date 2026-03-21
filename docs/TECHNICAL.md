# Talent-Inn — Teknik Dokümantasyon

> **Sürüm**: 2.0 · **Güncelleme**: Mart 2026  
> **Platform**: React 19 + Vite 7 + Firebase + Express 5  
> **Repo**: https://github.com/emredemir-maker/TalentFlow

---

## İçindekiler

1. [Sistem Mimarisi](#1-sistem-mimarisi)  
2. [Kimlik Doğrulama & Yetkilendirme](#2-kimlik-doğrulama--yetkilendirme)  
3. [Güvenlik Prensipleri](#3-güvenlik-prensipleri)  
4. [Firestore Veri Modeli](#4-firestore-veri-modeli)  
5. [API Referansı](#5-api-referansı)  
6. [Yapay Zeka Servisleri](#6-yapay-zeka-servisleri)  
7. [Canlı Mülakat Sistemi](#7-canlı-mülakat-sistemi)  
8. [State Yönetimi](#8-state-yönetimi)  
9. [Servisler Katmanı](#9-servisler-katmanı)  
10. [Deploy & Ortam](#10-deploy--ortam)

---

## 1. Sistem Mimarisi

### Genel Bakış

Talent-Inn **üç katmanlı bir mimari** üzerine kurulmuştur:

```
┌─────────────────────────────────────────────────────┐
│                   TARAYICI (React 19)                │
│  Context API  ←→  Pages  ←→  Components             │
│  Vite Dev Server: port 5000                          │
└────────────────────┬────────────────────────────────┘
                     │  /api/* (HTTP — göreceli URL)
                     │  Vite proxy → localhost:3001
                     ▼
┌─────────────────────────────────────────────────────┐
│           EXPRESS BACKEND (Node.js ES Modules)       │
│  server.js (dev) / functions/server.js (prod)        │
│  Port 3001                                           │
│  - Gemini API çağrıları (anahtar gizli)              │
│  - CV ayrıştırma (PDF/DOCX)                          │
│  - Puppeteer scraping                                │
│  - Email gönderimi                                   │
│  - Firebase Admin SDK (Firestore kurallarını atlar)  │
└────────────────────┬────────────────────────────────┘
                     │  Firebase Admin SDK / REST
                     ▼
┌─────────────────────────────────────────────────────┐
│              FIREBASE (Google Cloud)                  │
│  Firestore (NoSQL, gerçek zamanlı)                   │
│  Firebase Auth (Email + Google + Anonim)             │
│  Firebase Storage (CV'ler, avatarlar)                │
└─────────────────────────────────────────────────────┘
```

### Frontend Mimari Prensipleri

- **Context-Provider Pattern**: Global state React Context ile yönetilir. Her context kendi sorumluluk alanına sahiptir (`Auth`, `Candidates`, `Positions`, `Notifications`, `MessageQueue`, `UserSettings`).
- **Korumalı Rotalar**: `App.jsx` içinde `PrivateRoute` ve `RoleRoute` bileşenleri; yetkisiz erişimi login sayfasına yönlendirir.
- **Göreceli API URL'leri**: Tüm `fetch` çağrıları `/api/...` formatındadır. Vite dev proxy (`/api → http://localhost:3001`) production'da Firebase rewrites ile çalışır.
- **Optimistik UI**: Firestore realtime listener'ları (`onSnapshot`) sayesinde UI verisi push tabanlı güncellenir; sayfa yenilemesi gerekmez.

---

## 2. Kimlik Doğrulama & Yetkilendirme

### Auth Akışı

```
Kullanıcı giriş yapar (Email/Google)
        │
        ▼
Firebase Auth token alınır
        │
        ▼
AuthContext: Firestore'dan kullanıcı profili okunur
(artifacts/talent-flow/public/data/users/{uid})
        │
        ▼
userProfile.role belirlenir → RBAC uygulanır
```

### Roller

| Rol | Tanım | Erişim |
|---|---|---|
| `super_admin` | Sistem yöneticisi | Tüm veriler + kullanıcı yönetimi + departman yönetimi |
| `recruiter` | İşe alım uzmanı | Tüm adaylar + pozisyonlar + mülakat yönetimi |
| `department_user` | Departman kullanıcısı | Yalnızca kendi departmanı adayları (DB katmanında) |
| `candidate` *(anonim)* | Adaylar | Yalnızca mülakat oturumu URL'si üzerinden erişim |

### Davet Sistemi

Yeni kullanıcılar **yalnızca davet ile** kayıt olabilir:

1. `super_admin`, `invitations` koleksiyonuna kayıt ekler (e-posta + rol + departman).
2. Kayıt sayfası, e-postayı `invitations` koleksiyonunda kontrol eder.
3. Eşleşme bulunursa kayıt tamamlanır; bulunamazsa hata döner.
4. **İstisna**: `INITIAL_SUPER_ADMIN_EMAIL` olarak tanımlanan ilk admin doğrudan kayıt olabilir.

### CandidatesContext DB İzolasyonu

`department_user` rolünde:
```javascript
// Firestore sorgusunda where koşulu — yalnızca kendi departmanları
query(ref, where('department', 'in', userDepts))
```
- Kural yalnızca istemci tarafında değil, **Firestore sorgusunda** uygulanır.
- Kullanıcının `departments` dizisi boşsa, liste listener başlatılmaz ve boş dizi döner.
- `enrichedCandidates` üzerindeki istemci tarafı filtre ikincil güvenlik katmanıdır.

---

## 3. Güvenlik Prensipleri

### 3.1 API Anahtar Koruması

**Prensip**: Gemini API anahtarı tarayıcı bundle'ına ASLA ulaşmaz.

```
Tarayıcı → POST /api/ai/generate (prompt)
              ↓
        Express backend
              ↓
        Gemini API (anahtar sunucuda)
              ↓
        Yanıt → Tarayıcı
```

- `VITE_GEMINI_API_KEY` ortam değişkeni yalnızca `server.js` tarafından okunur.
- İstemci tarafında `getGlobalGeminiKey()` her zaman `null` döner (geriye dönük uyumluluk için stub).

### 3.2 Rate Limiting

| Limiter | Endpoint'ler | Kısıt |
|---|---|---|
| `generalLimiter` | Tüm `/api/*` | Genel istek sınırı |
| `aiLimiter` | `/api/ai/*`, `/api/scrape`, `/api/process-cv` | 20 istek/dakika/IP |
| `sessionLimiter` | `/api/session/*`, `/api/init-interview-session`, `/api/update-candidate-status` | 60 istek/dakika/IP |

`app.set('trust proxy', 1)` Replit'in proxy ortamı için zorunludur.

### 3.3 HTTP Güvenlik Başlıkları

```javascript
helmet({
  contentSecurityPolicy: { ... },  // XSS koruması
  crossOriginEmbedderPolicy: false  // Firebase iframe uyumluluğu için
})
xss()        // XSS temizleme
hpp()        // HTTP parametre kirliliği koruması
```

### 3.4 CORS Politikası

Yalnızca izin verilen origins kabul edilir:
- `*.replit.dev`, `*.replit.app`, `*.pike.replit.dev`
- Firebase hosting domain'leri
- `localhost` (geliştirme)

### 3.5 Session ID Güvenliği

| Özellik | Eski (güvensiz) | Yeni (güvenli) |
|---|---|---|
| Format | `iv-{candidateId}-{timestamp}` | `iv-{uuid}` |
| Entropi | Tahmin edilebilir | 122-bit rastgele |
| Risk | ID enumeration | Bruteforce imkansız |

Session ID'leri `crypto.randomUUID()` ile üretilir.

### 3.6 Firestore Güvenlik Kuralları

**Auth yardımcı fonksiyonları:**
```javascript
function isStrictAuthenticated()        // Anonim hariç tüm auth kullanıcıları
function isAuthenticatedIncAnon()       // Anonim dahil tüm auth kullanıcıları
function isSuperAdmin()                 // super_admin rolü
function isRecruiter()                  // recruiter rolü
function isDepartmentUser()             // department_user rolü
function canAccessCandidate(candidateData) // dept_user için belge bazlı erişim
```

**Koleksiyon bazlı kurallar özeti:**

| Koleksiyon | Okuma | Yazma |
|---|---|---|
| `users` | Kendi kaydı, recruiter, super_admin | Kendi kaydı, super_admin |
| `candidates` | `canAccessCandidate()` (belge), recruiter/dept_user (liste) | Recruiter |
| `departments` | Herkese açık okuma | Yalnızca super_admin |
| `invitations` | Herkese açık okuma (kayıt doğrulaması için) | Yalnızca super_admin |
| `interviews` | Auth kullanıcısı (anonim dahil) | Yalnızca `isAuthenticatedIncAnon()` |
| `positions` | Herkese açık | Recruiter |

### 3.7 Firebase Storage Kuralları

```
/cvs/{candidateId}/     → Okuma: auth gerektirir
/avatars/{userId}/      → Okuma: herkese açık; Yazma: yalnızca kendi dosyası
/*                      → Tüm diğer yollar: erişim reddedildi
```

### 3.8 Alan Beyaz Listesi (Aday Güncelleme)

`POST /api/update-candidate-status` endpoint'i yalnızca şu alanları kabul eder:
```javascript
const ALLOWED_FIELDS = [
  'candidateStatus', 'candidateConnected', 'candidatePresence',
  'lastActive', 'hasConsent'
];
```
`aiScore`, `summary`, `matchScore` gibi kritik AI alanlarına dış yazma engellenir.

---

## 4. Firestore Veri Modeli

### Koleksiyon Yolu

```
artifacts/talent-flow/public/data/
├── users/           {uid}
├── candidates/      {candidateId}
├── positions/       {positionId}
├── departments/     {deptId}
├── invitations/     {email}
├── sources/         {sourceId}
└── interviews/      {sessionId}
```

### Aday Belgesi Şeması

```javascript
{
  id: string,                    // Firestore belge ID
  name: string,
  email: string,
  phone: string,
  position: string,
  department: string,
  status: 'new' | 'reviewing' | 'shortlisted' | 'hired' | 'rejected',
  matchScore: number,            // 0-100, AI hesaplar
  aiScore: number,               // Ağırlıklı skor
  summary: string,               // AI özet
  skills: string[],
  experience: string,
  education: string,
  source: string,                // 'manual' | 'scraper' | 'cv' | 'application'
  cvUrl: string,                 // Firebase Storage URL
  avatarUrl: string,
  interviewSessions: [           // Gömülü dizi
    {
      id: string,                // iv-{uuid}
      title: string,
      date: string,              // ISO 8601
      time: string,              // 'HH:MM'
      type: 'technical' | 'hr' | 'product',
      status: 'scheduled' | 'live' | 'completed' | 'postponed' | 'cancelled',
      interviewerName: string,
      interviewerId: string,
      meetLink: string,
      transcript: string,
      starAnalysis: object,      // AI STAR değerlendirmesi
      questions: object[],
    }
  ],
  createdAt: Timestamp,
  updatedAt: Timestamp,
}
```

### Kullanıcı Belgesi Şeması

```javascript
{
  uid: string,
  name: string,
  email: string,
  role: 'super_admin' | 'recruiter' | 'department_user',
  departments: string[],         // department_user için atanmış departmanlar
  department: string,            // Eski format (geriye dönük uyumluluk)
  googleAccessToken: string,     // Google Workspace entegrasyonu
  googleRefreshToken: string,
  createdAt: Timestamp,
}
```

---

## 5. API Referansı

Tüm endpoint'ler `http://localhost:3001` (geliştirme) veya Firebase Functions URL'si (production) üzerindedir.  
**Frontend'den çağırırken**: `/api/...` (göreceli URL — Vite proxy halleder)

### Sağlık

| Method | Endpoint | Açıklama |
|---|---|---|
| GET | `/api/health` | Sunucu durumu ve sürüm |

### AI & İçerik

| Method | Endpoint | Auth | Açıklama |
|---|---|---|---|
| POST | `/api/ai/generate` | — | Gemini metin üretimi (prompt → yanıt) |
| POST | `/api/ai/stt` | — | Ses base64 → transkripsiyon + duygu analizi |
| GET | `/api/scrape?q=` | — | Puppeteer ile aday profili bulma |
| POST | `/api/process-cv` | — | PDF/DOCX yükleme → metin + AI analizi |
| POST | `/api/direct-add` | — | Doğrudan aday ekleme + AI zenginleştirme |
| POST | `/api/check-duplicate` | — | Admin SDK ile aday tekrar kontrolü |

### Mülakat Oturumu

| Method | Endpoint | Auth | Açıklama |
|---|---|---|---|
| GET | `/api/session/:sessionId` | Anonim | Oturum verisi + yalnızca adaya görünür sorular |
| POST | `/api/init-interview-session` | — | Yeni oturum başlatma (permission-denied durumunda) |
| POST | `/api/update-candidate-status` | — | Alan beyaz listesiyle durum güncelleme |

### Google Workspace Entegrasyonu

| Method | Endpoint | Açıklama |
|---|---|---|
| POST | `/api/google/send-email` | Gmail üzerinden e-posta gönderimi |
| GET | `/api/google/check-messages` | Gmail inbox okuma |
| POST | `/api/google/create-calendar-event` | Google Takvim etkinliği oluşturma |

### Başvuru Sistemi

| Method | Endpoint | Açıklama |
|---|---|---|
| GET | `/api/positions/:positionId` | Pozisyon detayı (genel erişim) |
| POST | `/api/applications` | Başvuru formu gönderimi |
| POST | `/api/send-invite` | Mülakat davet e-postası |

---

## 6. Yapay Zeka Servisleri

### 6.1 Agentik İş Akışı (`agenticWorkflow.js`)

Aday verisini sıralı adımlarla işleyen orkestrasyon motoru:

```
1. Ham Veri Alımı    → Scraper / CV / Manuel giriş
2. Metin Çıkarımı   → cvParser.js (PDF/DOCX)
3. Yapısal Zenginleştirme → Gemini: skill çıkarımı, deneyim ayrıştırma
4. Yetenek Çıkarımı → matchService.js ile skill etiketleme
5. Açıklanabilir AI → Ağırlıklı skor + gerekçe oluşturma
6. Firestore Yazma  → Tamamlanmış aday belgesi
```

### 6.2 STAR Analizi (`src/services/ai/gemini-logic.js`)

Canlı mülakat sırasında gerçek zamanlı değerlendirme:

- **S**ituation — Durum tanımı
- **T**ask — Görev netliği
- **A**ction — Alınan aksiyon
- **R**esult — Ölçülebilir sonuç

Her yanıt 4 boyutta 0-10 arası puanlanır. Genel mülakat skoru ağırlıklı ortalama ile hesaplanır.

### 6.3 STT & Duygu Analizi (`POST /api/ai/stt`)

```
Ses (base64, WebM/Opus) → Gemini multimodal API
                        → Transkripsiyon metni
                        → Duygu etiketleri (pozitif/nötr/negatif/stresli)
                        → Güven skoru
```

### 6.4 Eşleştirme Servisi (`matchService.js`)

Aday-Pozisyon uyum hesaplama:
- Zorunlu beceri örtüşmesi (ağırlık: %40)
- Tercih edilen beceri örtüşmesi (ağırlık: %20)
- Deneyim seviyesi eşleşmesi (ağırlık: %25)
- Eğitim uyumu (ağırlık: %15)

### 6.5 CV Ayrıştırıcı (`cvParser.js`)

Tarayıcı tarafında çalışır (sunucu yükü olmadan):
- **PDF**: `pdfjs-dist` ile metin katmanı çıkarımı
- **DOCX**: `mammoth` ile paragraf dönüşümü
- Çıkarılan metin `/api/process-cv` üzerinden Gemini'ye gönderilir

---

## 7. Canlı Mülakat Sistemi

### Akış Diyagramı

```
Recruiter: Mülakat oluşturur → iv-{uuid} session ID üretilir
                │
                ▼
         Firestore: interviews/{sessionId} belgesi yazılır
                │
                ▼
Recruiter: /live-interview/{sessionId} açar → recruiter view
                │
                ▼
Aday: /join/{sessionId} bağlantısı → Firebase Anonim Auth
                │
                ▼
         Firebase Auth: anonim UID üretilir
                │
                ▼
         GET /api/session/{sessionId} polling (her 3 saniyede)
         (Admin SDK → Firestore kuralları atlanır)
                │
                ▼
         Yalnızca visibleToCandidate: true sorular gönderilir
```

### Soru Görünürlüğü

- Firestore'daki her sorunun `visibleToCandidate: boolean` alanı vardır.
- Recruiter tüm soruları görür.
- "ADAYA GÖNDER" butonu, `visibleToCandidate: true` yazar.
- Polling endpoint sunucu tarafında filtreler — aday asla gizli soruları göremez.

### Gerçek Zamanlı Transkripsiyon

- Tarayıcı: `MediaRecorder` API → 5 saniyelik ses parçaları
- Her parça base64'e çevrilir → `POST /api/ai/stt`
- Dönen transkript + duygu analizi Firestore'a yazılır
- Recruiter ekranında anlık güncellenir (`onSnapshot`)

### `effectiveSession` Paterni

```javascript
// Firestore okuma başarısız olursa (anonim kısıtı)
// API polling verisi fallback olarak kullanılır
const effectiveSession = session || apiSession;
```

---

## 8. State Yönetimi

### Context Haritası

```
App
├── AuthContext          → currentUser, userProfile, userId, rol bilgisi
├── CandidatesContext    → enrichedCandidates, addCandidate, updateCandidate
│   └── Firestore onSnapshot listener (rol bazlı filtreli)
├── PositionsContext     → positions, addPosition, updatePosition
├── NotificationContext  → bildirim kuyruğu, toast mesajları
├── MessageQueueContext  → asenkron mesaj kuyruğu
└── UserSettingsContext  → kullanıcı tercihleri (tema, dil vs.)
```

### `enrichedCandidates` Hesaplama

`CandidatesContext` içinde `useMemo` ile:
1. Ham Firestore adayları alınır
2. İlgili pozisyon verisi join edilir
3. `matchScore` normalize edilir
4. Aktif `interviewSessions` sayısı eklenir
5. Sonuç memoize edilir — gereksiz re-render engellenir

---

## 9. Servisler Katmanı

### `firestoreService.js`
Firestore CRUD wrapper'ı. Tüm koleksiyon path'leri burada tanımlıdır.  
Path: `artifacts/talent-flow/public/data/{collection}/{id}`

### `integrationService.js`
Google Workspace API köprüsü:
- `connectGoogleWorkspace()` — OAuth token yenileme
- `getCalendarEvents()` — Google Takvim sorgusu (müsaitlik kontrolü)
- `sendDirectEmail()` — Gmail API üzerinden mail
- `createDirectCalendarEvent()` — Takvim etkinliği oluşturma
- `ensureValidGoogleToken()` — Süresi dolmuş token yenileme

### `applicationService.js`
Dışarıdan başvuru akışı:
- `/apply/:positionId` genel sayfası
- Başvuru verisi Firestore'a yazılır
- `POST /api/applications` backend endpoint'i

### `messageQueueService.js`
Asenkron mesaj kuyruğu yönetimi. Birden fazla recruiter'ın aynı anda çalışabileceği senaryolar için optimistik güncelleme + çakışma çözümü.

---

## 10. Deploy & Ortam

### Geliştirme

```bash
npm run dev
# Vite (5000) + Express (3001) eş zamanlı
```

### Production (Replit Autoscale)

```bash
npm run build
# → dist/ klasörü oluşturulur

bash -c "node server.js & npx vite preview --port 5000 --host 0.0.0.0"
```

### Kritik Notlar

1. **İki sunucu dosyası**: `server.js` (geliştirme) ve `functions/server.js` (production Firebase Functions) aynı tutulmalıdır.
2. **Firestore kuralları deploy**: `firebase deploy --only firestore:rules` — Firebase CLI kimlik bilgileri gerektirir.
3. **Storage kuralları deploy**: `firebase deploy --only storage`
4. **Ortam değişkenleri**: Replit Secrets üzerinden yönetilir, asla kaynak koduna eklenmez.
5. **Port bağlaması**: Vite her zaman `0.0.0.0` üzerine bağlanmalıdır (Replit proxy için).
6. **Vite allowedHosts**: `server.allowedHosts: true` zorunludur (Replit proxy iframe uyumluluğu).

### GitHub Sync

```bash
TOKEN=$(printenv GITHUB_PERSONAL_ACCESS_TOKEN_NEW)
git push https://emredemir-maker:${TOKEN}@github.com/emredemir-maker/TalentFlow.git main
```

---

*Bu dokümantasyon Talent-Inn v2.0 ile günceldir. Mimari değişikliklerinde lütfen hem bu dosyayı hem `replit.md`'yi güncelleyin.*
