# TalentFlow 🚀

**TalentFlow**, modern işe alım süreçlerini yapay zeka ile optimize eden, premium özelliklere sahip bir **AI Destekli İK Yönetim Paneli**'dir. Gemini AI entegrasyonu sayesinde aday analizlerini saniyeler içinde yapar, pozisyonlarla eşleştirir ve tüm iletişim sürecini akıllıca takip eder.

![TalentFlow Banner](https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?auto=format&fit=crop&q=80&w=2072&ixlib=rb-4.0.3)

---

## 🌟 Öne Çıkan Özellikler

### 🧠 1. Yapay Zeka Destekli Aday Analizi
*   **Gemini AI Entegrasyonu:** Adayların özgeçmişlerini ve yeteneklerini analiz ederek güçlü/zayıf yönlerini belirler.
*   **Akıllı Puanlama:** Adayları açık pozisyonlarla % bazlı eşleştirir ve teknik uygunluk skoru üretir.
*   **Otomatik Geri Bildirim:** Mülakat notlarından ve aday yanıtlarından otomatik özetler ve aksiyon planları oluşturur.

### 🔐 2. Güvenli Davetiye Sistemi (White-list Auth)
*   **Süper Admin Yönetimi:** Uygulama sadece yöneticilerin davet ettiği kullanıcılara açıktır.
*   **Rol Tabanlı Erişim:** Süper Admin ve Recruiter rolleri ile yetki yönetimi.
*   **Email & Google Login:** Güvenli oturum açma yöntemleri ve davetiye kontrolü ile yetkisiz erişimi engelleme.

### 📧 3. Akıllı Mesaj ve E-posta Takibi
*   **Unique Tracking IDs:** Gönderilen her e-postaya özel bir takip kodu (TF-XXXXX) ekleyerek yanıtları otomatik olarak aday profiliyle eşleştirir.
*   **Hazır Şablonlar:** Pozisyon tipine göre AI tarafından optimize edilmiş mülakat daveti ve ret mektubu şablonları.
*   **Gmail & Mailto Entegrasyonu:** Tek tıkla adaylara ulaşma ve durumu güncelleme.

### 📊 4. Gelişmiş Analitik Dashboard
*   **Aday Hunisi:** Başvurudan işe alıma kadar tüm süreci görselleştirir.
*   **Performans Metrikleri:** Mesaj yanıt oranları, AI analiz sayıları ve süreç hızlarını takip eder.
*   **Sektörel Dağılım:** Aday havuzunun yetenek ve kıdem dağılımını analiz eder.

---

## 🛠️ Teknik Altyapı

*   **Frontend:** React.js, Tailwind CSS, Lucide Icons
*   **Backend & DB:** Firebase (Firestore, Authentication, Hosting)
*   **AI Engine:** Google Gemini AI (Vertex AI / Generative AI SDK)
*   **State Management:** React Context API
*   **Real-time:** Cloud Firestore Snapshot Listeners

---

## 🚀 Kurulum ve Başlangıç

1.  **Repoyu Klonlayın:**
    ```bash
    git clone https://github.com/emredemir-maker/TalentFlow.git
    cd TalentFlow
    ```

2.  **Bağımlılıkları Yükleyin:**
    ```bash
    npm install
    ```

3.  **Çevre Değişkenlerini Ayarlayın:**
    `.env` dosyası oluşturup aşağıdaki anahtarları ekleyin:
    ```env
    VITE_FIREBASE_API_KEY=your_api_key
    VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
    VITE_FIREBASE_PROJECT_ID=your_id
    VITE_GEMINI_API_KEY=your_gemini_key
    ```

4.  **Uygulamayı Çalıştırın:**
    ```bash
    npm run dev
    ```

---

## 👔 Admin Notu
Uygulama ilk kez kurulduğunda `emre.demir@infoset.app` adresi veya ilk kayıt olan kullanıcı otomatik olarak **Süper Admin** tanımlanır. Bu aşamadan sonra sisteme girişler sadece admin panelinden gönderilen davetiyeler ile mümkündür.

---

Designed with ❤️ by **Antigravity AI** for **TalentFlow**.
