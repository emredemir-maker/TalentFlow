# TalentFlow 🚀 - Yapay Zeka Destekli Stratejik İK Paneli

TalentFlow, modern işe alım süreçlerini otomatize eden, Google Gemini AI tabanlı, yüksek etkileşimli ve stratejik bir aday yönetim sistemidir (ATS). Adayların özgeçmişlerini analiz eder, STAR tekniği ile puanlar, mülakat süreçlerini yönetir ve Google Workspace (Gmail & Takvim) entegrasyonu ile uçtan uca bir deneyim sunar.

---

## 🎨 Tasarım Estetiği (Battle Station HUD)

Uygulama, "Strategic Command Center" (Stratejik Komuta Merkezi) estetiği ile tasarlanmıştır. 
- **Stitch UI & Glassmorphism**: Saydam katmanlar, projenin derinliğini yansıtan neon efektler ve projenin her iki modda (Açık/Koyu) kusursuz görünmesini sağlayan **Stitch UI** mimarisi.
- **HUD (Head-Up Display) & Compact Design**: Veri yoğunluğunu maksimize eden, beyaz boşlukları minimize edilmiş, tek ekranda kritik bilgileri sunan ultra-kompakt grid yapısı.
- **Dynamic Theme Engine**: CSS değişkenleri tabanlı `navy` renk sistemi ile aydınlık ve karanlık modlar arasında yumuşak, görsel kalıntı bırakmayan geçişler.
- **Vibrant UX**: Mikro-animasyonlar ve dinamik hover efektleri ile premium bir "Battle Station" deneyimi.

---

## 🛠️ Teknik Altyapı & Mimari

TalentFlow, modern bir Full-Stack mimarisine sahiptir:

### Frontend
- **Framework**: React 19 (Vite)
- **Styling**: Tailwind CSS 4.x + Global CSS Variables (Theme-aware navy color system)
- **State Management**: React Context API & UserSettingsContext (Theme & Layout preferences)
- **Routing**: React Router DOM 7
- **Grafikler**: Recharts (HUD tarzı analitik kartlar)
- **İkonlar**: Lucide React

### Backend & AI
- **Runtime**: Node.js (V3 Express Server)
- **AI Engine**: Google Generative AI (Gemini Flash/Pro Modelleri)
- **Middleware**: Puppeteer (Web Kazıma), Multer (Dosya Yükleme), Mammoth/PDF-parse (Döküman İşleme)
- **Security**: Helmet, XSS-Clean, Rate-Limit, HPP

### Bulut Servisleri (Firebase)
- **Database**: Cloud Firestore (Gerçek zamanlı aday ve pozisyon takibi)
- **Authentication**: Firebase Auth (Email/Password & Google Login)
- **Hosting**: Firebase Hosting
- **Serverless**: Firebase Cloud Functions (Opsiyonel backend dağıtımı)

---

## ✨ Fonksiyonel Özellikler

### 1. Stratejik Analitik (Analytics HUD)
- **Genel Bakış**: Performans matrisi, kanal verimliliği ve aday dönüşüm oranları.
- **Aday Kazanımı**: Hangi kaynaklardan ne kadar verim alındığının (LinkedIn, Kariyer.net vb.) analizi.
- **Yanıt Oranları**: Mesajlaşma kuyruğu ve aday geri dönüş istatistikleri.

### 2. Akıllı Aday Yönetimi (Candidate Portal)
- **AI STAR Analizi**: Özgeçmişleri S (Situation), T (Task), A (Action), R (Result) bazında 100 üzerinden puanlama.
- **Dinamik Mülakat Planlama**: Google Takvim üzerinden Meet linki oluşturarak otomatik mülakat planlama.
- **Mesaj Kuyruğu**: Adaylara gönderilen e-postaların ve hatırlatıcıların merkezi yönetimi.

### 3. Pozisyon & Departman İş Akışı
- **Talep Yönetimi**: Departman yöneticilerinin yeni pozisyon taleplerini İK ekibine iletmesi ve onay süreci.
- **AI Eşleştirme**: Pozisyon gereksinimleri ile mevcut aday havuzunun anlık "Match" skorlaması.

### 4. Google Workspace Entegrasyonu
- **Gmail**: Tek tıklamayla adaylara doğrudan e-posta gönderimi.
- **Calendar**: Mülakatların takvime işlenmesi ve katılımcı davetleri.

---

## 🚀 Kurulum ve Çalıştırma

### Gereksinimler
- Node.js (v18+)
- Firebase Projesi
- Google AI (Gemini) API Key

### Adım Adım Kurulum

1.  **Projeyi Klonlayın:**
    ```bash
    git clone [repository-url]
    cd TalentFlow
    ```

2.  **Bağımlılıkları Yükleyin:**
    ```bash
    npm install
    # Firestore ve Server taraflı işlemler için root dizinde npm install yeterlidir.
    ```

3.  **Ortam Değişkenlerini Ayarlayın:**
    - `.env.example` dosyasını `.env` olarak kopyalayın.
    - Gerekli Firebase config ve API anahtarlarını doldurun:
    ```env
    VITE_FIREBASE_API_KEY=your_key
    VITE_GEMINI_API_KEY=your_key
    VITE_APP_URL=http://localhost:5174
    ```

4.  **Uygulamayı Çalıştırın:**
    ```bash
    # Frontend (Vite) ve Backend (Express) eşzamanlı çalışır
    npm run dev
    ```

### Portlar
- **Frontend**: `localhost:5174`
- **Backend**: `localhost:3000`

---

## 📂 Proje Dizin Yapısı

```text
TalentFlow/
├── src/                # Frontend Kaynak Kodları
│   ├── components/     # UI Bileşenleri (Modallar, Kartlar, Navigasyon)
│   ├── context/        # Global State Management (Auth, Candidate, Positions)
│   ├── pages/          # Sayfa Görünümleri (Dashboard, Analytics, Process)
│   ├── services/       # İş Mantığı & API Servisleri (Gemini, Integration, Match)
│   ├── config/         # Firebase ve Global Ayarlar
│   └── assets/         # Statik Görseller ve CSS Tokenları
├── functions/          # Firebase Cloud Functions (Backend Logic)
├── server.js           # Ana Express Sunucusu (PDF Parsing & Scraper logic)
├── firestore.rules     # Güvenlik Kuralları
├── firebase.json       # Dağıtım Yapılandırması
├── package.json        # Paket ve Script Tanımları
└── .env                # Gizli Anahtarlar (Commit edilmez!)
```

---

## 🔒 Güvenlik Notları
- **Frontend Veri İşleme**: Veriler Rule 2 gereği `onSnapshot` ile dinlenir ve istemci tarafında filtrelenir.
- **Hassas Veriler**: API anahtarları asla kod içine gömülmez, `.env` dosyası üzerinden `import.meta.env` ile çekilir.

---

**TalentFlow** - *Recruiting the future, today.*
Powered by **Gemini AI**
