# Talent-Inn — AI-Powered HR Dashboard & ATS

## Proje Hakkında
Talent-Inn, modern işe alım süreçlerini yapay zeka ile otomatize eden stratejik bir İK platformu ve Aday Takip Sistemidir (ATS). Google Gemini AI entegrasyonu ile STAR analizi, otomatik mülakat planlama, gerçek zamanlı transkripsiyon ile canlı mülakat desteği ve analitik paneller sunar. Think-Inn marka ailesinin bir üyesidir.

---

## Teknoloji Yığını

### Frontend
- **Framework**: React 19
- **Build**: Vite 7
- **Styling**: Tailwind CSS 4.x (`@tailwindcss/vite` eklentisi)
- **State**: React Context API (`AuthContext`, `CandidatesContext`, `PositionsContext`, `NotificationContext`, `MessageQueueContext`, `UserSettingsContext`)
- **Routing**: React Router DOM 7
- **Charts**: Recharts
- **Icons**: Lucide React
- **Animasyonlar**: tailwindcss-animate

### Backend
- **Runtime**: Node.js (ES Modules)
- **Framework**: Express 5
- **AI**: Google Generative AI (`@google/generative-ai`) — Gemini 2.0 Flash
- **CV Ayrıştırma**: pdf-parse, pdfjs-dist, Mammoth (DOCX)
- **Web Scraping**: Puppeteer
- **Email**: Nodemailer (Gmail SMTP)
- **Güvenlik**: Helmet, express-rate-limit, xss-clean, hpp

### Cloud & Veritabanı
- **Veritabanı**: Firebase Firestore (gerçek zamanlı)
- **Auth**: Firebase Authentication (Email/Şifre + Google OAuth + Anonim)
- **Storage**: Firebase Storage
- **Admin**: Firebase Admin SDK (server-side, kuralları atlar)

---

## Proje Yapısı

```
talent-inn/
├── src/
│   ├── components/          # Paylaşılan UI bileşenleri
│   │   ├── Header.jsx
│   │   ├── TalentInnLogo.jsx
│   │   └── ...
│   ├── config/              # Firebase config, pozisyon verileri
│   ├── context/             # Global state yönetimi
│   │   ├── AuthContext.jsx
│   │   ├── CandidatesContext.jsx
│   │   ├── PositionsContext.jsx
│   │   └── ...
│   ├── pages/               # Route bazlı sayfalar
│   │   ├── Dashboard.jsx
│   │   ├── InterviewManagementPage.jsx   # Takvim-odaklı mülakat yönetimi
│   │   ├── LiveInterviewPage.jsx
│   │   ├── AnalyticsPage.jsx
│   │   ├── AIMatchPage.jsx
│   │   ├── SuperAdminPage.jsx
│   │   └── ...
│   ├── services/            # İş mantığı servisleri
│   │   ├── ai/              # Gemini AI servisleri
│   │   ├── agenticWorkflow.js
│   │   ├── cvParser.js
│   │   ├── firestoreService.js
│   │   ├── matchService.js
│   │   └── integrationService.js
│   ├── App.jsx              # Routing + korumalı rotalar
│   └── main.jsx             # Giriş noktası
├── artifacts/
│   └── mockup-sandbox/      # UI tasarım prototipleri (Vite sunucusu)
├── functions/               # Firebase Cloud Functions
├── public/
│   └── favicon.svg          # Talent-Inn marka ikonu (SVG)
├── server.js                # Express backend (port 3001) — geliştirme
├── functions/server.js      # Express backend — production (deploy)
├── firestore.rules          # Firestore güvenlik kuralları
├── storage.rules            # Firebase Storage güvenlik kuralları
├── vite.config.js           # Vite config (port 5000, proxy /api → 3001)
└── package.json
```

---

## Çalıştırma

### Geliştirme
```bash
npm run dev
```
Vite (port 5000) + Express (port 3001) eş zamanlı başlar. Webview port 5000'i gösterir.

### Production Build
```bash
npm run build
```
```bash
bash -c "node server.js & npx vite preview --port 5000 --host 0.0.0.0"
```

---

## Ortam Değişkenleri

| Değişken | Açıklama |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Web API anahtarı |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase proje ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | FCM sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_GEMINI_API_KEY` | Google Gemini API anahtarı (VITE_ ile başlar ama yalnızca server.js okur) |
| `EMAIL_USER` | Gmail hesabı (Nodemailer) |
| `EMAIL_PASS` | Gmail uygulama şifresi |
| `GITHUB_PERSONAL_ACCESS_TOKEN_NEW` | GitHub push tokeni |

---

## Deployment
- **Platform**: Replit Autoscale
- **Build**: `npm run build`
- **Start**: `bash -c "node server.js & npx vite preview --port 5000 --host 0.0.0.0"`
- **GitHub**: `https://github.com/emredemir-maker/TalentFlow`

---

## Güvenlik Mimarisi (Özet)

### API Anahtar Koruması
- Tüm Gemini çağrıları Express backend üzerinden geçer — API anahtarı tarayıcı bundle'ına asla ulaşmaz
- `POST /api/ai/generate` — metin/prompt tabanlı AI çağrıları (rate-limit: 20 istek/dk)
- `POST /api/ai/stt` — ses → transkripsiyon + duygu analizi

### Rate Limiting
- `generalLimiter`: Tüm rotalar için genel sınır
- `aiLimiter`: AI endpoint'leri için 20 istek/dakika
- `sessionLimiter`: Mülakat oturumu endpoint'leri için 60 istek/dakika

### Firestore Kuralları
- **Rol tabanlı erişim**: `super_admin`, `recruiter`, `department_user`, anonim aday
- **Departman izolasyonu**: `department_user` yalnızca kendi departmanındaki adayları görür (DB katmanında zorunlu)
- **Aday verileri**: Anonim kullanıcılar Firestore'u okuyamaz — canlı mülakat sayfası server polling kullanır

### Session Güvenliği
- Tüm session ID'leri `crypto.randomUUID()` ile üretilir → `iv-<uuid>` formatı (122-bit rastgele)
- Tahmin edilebilir eski format (`iv-candidateId-timestamp`) kaldırıldı

---

## Temel Sayfalar

| Sayfa | Rota | Açıklama |
|---|---|---|
| Dashboard | `/` | Genel KPI paneli |
| Mülakat Yönetimi | `/interviews` | Takvim-odaklı mülakat planlama ve takip |
| Canlı Mülakat | `/live-interview/:id` | Gerçek zamanlı mülakat + transkripsiyon |
| Aday Katılım | `/join/:sessionId` | Anonim aday girişi |
| AI Eşleştirme | `/ai-match` | Aday-pozisyon uyum analizi |
| Analitik | `/analytics` | Grafik ve raporlar |
| Ayarlar | `/settings` | Kullanıcı ve sistem ayarları |
| Süper Admin | `/super-admin` | Kullanıcı ve departman yönetimi |

---

## Kritik Geliştirici Notları

1. **İki sunucu dosyası**: `server.js` (geliştirme) VE `functions/server.js` (production) — her değişikliği her ikisine de uygulamak gerekir.
2. **Göreceli URL'ler**: Tüm frontend → backend çağrıları `/api/...` kullanmalıdır, asla `http://localhost:3001/...` değil. Vite proxy halletir.
3. **CandidatesContext DB izolasyonu**: `department_user` rolünde Firestore `where('department', 'in', userDepts)` sorgusu yapılır; istemci tarafı filtre ikincil güvenlik katmanıdır.
4. **Anonim aday akışı**: `/join/:sessionId` → Firebase anonim auth → `GET /api/session/:sessionId` polling (3 sn aralıklı) — Firestore kuralları anonim okumayı engeller.
5. **Mockup sandbox**: `artifacts/mockup-sandbox/` altındaki tasarım prototipleri ayrı bir Vite sunucusunda çalışır — kanvasta iframe olarak gösterilir.
6. **Tema renkleri**: bg `#F8FAFC`, kart `#FFFFFF`, kenarlık `#E2E8F0`, primary `#1E3A8A`, metin `#0F172A`, ikincil `#64748B`.
