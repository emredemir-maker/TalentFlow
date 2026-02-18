# 📘 TalentFlow - Teknik Dokümantasyon Rehberi

**Versiyon:** 1.0.0  
**Tarih:** 18 Şubat 2026

## 1. Proje Genel Bakış (Project Overview)

TalentFlow, modern işe alım süreçlerini yapay zeka ile güçlendiren, aday takip ve değerlendirme platformudur. İK uzmanları ve yöneticiler için geliştirilen bu sistem, adayların yetkinliklerini analiz eder, pozisyonlarla eşleştirir ve mülakat performanslarını şeffaf bir şekilde görselleştirir.

**Ana Hedefler:**

* **Otonom Analiz:** Adayların özgeçmiş ve mülakat verilerini AI (Google Gemini) ile analiz ederek insan yanlılığını azaltmak.
* **Hız:** İşe alım sürecini otomatikleştirerek (Puanlama, Eşleştirme) zaman tasarrufu sağlamak.
* **Şeffaflık:** Aday ve işveren için sürecin her aşamasını (Başvuru -> Mülakat -> Teklif) görünür kılmak.

---

## 2. Teknoloji Yığını (Tech Stack)

Uygulama, yüksek performanslı ve ölçeklenebilir bir mimari üzerine kurulmuştur:

* **Frontend (İstemci Tarafı):**
  * **React.js (Vite):** Hızlı ve modüler kullanıcı arayüzü geliştirme.
  * **Tailwind CSS:** Modern, esnek ve responsive tasarım.
  * **Lucide React:** Tutarlı ikon seti.
  * **Glassmorphism UI:** Premium ve modern bir görünüm için özel tasarım dili.
* **Backend & Veritabanı (Sunucu Tarafı):**
  * **Firebase Hosting:** Statik dosya barındırma ve küresel CDN.
  * **Cloud Firestore:** NoSQL tabanlı, gerçek zamanlı veri tabanı.
  * **Firebase Auth:** Güvenli kimlik doğrulama (E-posta, Anonim).
* **Yapay Zeka (AI & ML):**
  * **Google Gemini API:** Doğal dil işleme (NLP), aday-pozisyon eşleştirme ve STAR analizi.
* **Veri İşleme (Data Processing):**
  * **Node.js & Puppeteer:** Web sitelerinden veri kazıma (Scraping) işlemleri için sunucu tarafı betikleri.

---

## 3. Sistem Mimarisi ve Çalışma Mantığı (System Architecture & Logic)

TalentFlow, "Serverless" (Sunucusuz) mimariye yakın bir hibrit yapıda çalışır.

### 3.1. Veri Akışı (Data Flow)

1. **Kullanıcı Etkileşimi:** İK uzmanı sisteme aday ekler veya bir pozisyon tanımlar.
2. **Firestore Kaydı:** Veriler anlık olarak Cloud Firestore'a yazılır.
3. **Realtime Listener (`onSnapshot`):** `CandidatesContext` yapısı sayesinde, veritabanındaki herhangi bir değişiklik (örn. yeni başvuru), anında tüm bağlı kullanıcılara (Dashboard) yansıtılır. Sayfa yenilemeye gerek kalmaz.
4. **AI Analizi (Tetikleyici):**
    * Kullanıcı "Analizi Başlat" dediğinde, sistem aday verilerini (Yetkinlikler, Deneyim) ve İş Tanımını (Job Description) alır.
    * Bu veriler, özel bir **Prompt Engineering** katmanından geçirilerek Google Gemini API'ye gönderilir.
    * **Prompt Örneği:** *"Aşağıdaki aday profilini, X pozisyonu için 0-100 arasında puanla ve eksik/güçlü yönlerini analiz et."*
5. **Sonuç Görselleştirme:** API'den dönen JSON formatındaki analiz verisi, `CandidateCard` ve `StarScoreCard` bileşenlerinde işlenerek kullanıcıya grafiksel olarak sunulur.

### 3.2. Durum Yönetimi (State Management)

Uygulama genelinde veriler **Context API** ile yönetilir:

* **`AuthContext`**: Kullanıcının giriş durumunu takip eder.
* **`CandidatesContext`**: Tüm aday havuzunu ve filtreleme mantığını (Departman, Deneyim vb.) merkezi olarak yönetir.
* **`UserSettingsContext`**: Kullanıcının özel ayarlarını (Özel Pozisyonlar vb.) saklar.

---

## 4. Modül Detayları

### 4.1. AI Match Engine (Eşleştirme Motoru)

Bu modül, adayları belirli bir pozisyona göre sıralayan "akıllı" bir algoritmadır.

* **Çoklu Kriter Analizi:** Sadece anahtar kelime eşleşmesine bakmaz; adayın deneyim süresi, yetkinlik derinliği ve çalışma şekli tercihlerini de (Full-time, Freelance vb.) anlamsal olarak değerlendirir.
* **Skorlama:** Her aday için 0-100 arasında bir uyum puanı üretir.
  * **85-100:** Liyakatli (Mükemmel eşleşme)
  * **70-84:** Uygun
  * **50-69:** Gelişebilir
  * **0-49:** Eksik

### 4.2. STAR Analiz Modülü (Otonom Mülakat)

Mülakat simülasyonlarında veya notlarında adayın verdiği cevapları **STAR Tekniği**'ne göre parçalar:

1. **S (Situation - Durum):** Aday sorunu ne kadar net tanımladı?
2. **T (Task - Görev):** Hedefleri ve sorumluluğunu ne kadar iyi açıkladı?
3. **A (Action - Eylem):** Hangi aksiyonları aldı, hangi yetkinlikleri kullandı?
4. **R (Result - Sonuç):** Sonucu sayısal verilerle (KPI) destekledi mi?

Her bir katman için ayrı bir puan üretilir ve `StarScoreCard` bileşeninde görselleştirilir.

### 4.3. Dashboard & Filtreleme

* **Client-Side Filtering:** Performans için, aday verileri bir kez çekildikten sonra tüm filtreleme (Departman, Statü, Arama) işlemleri tarayıcı üzerinde (istemci tarafında) yapılır. Bu, veritabanı okuma maliyetlerini düşürür ve arayüzü hızlandırır.
* **Toplu İşlemler:** Kullanıcılar birden fazla adayı seçip (`Multi-Select`) toplu silme işlemi yapabilir.

---

## 5. Veritabanı Şeması (Database Schema)

Firestore veritabanı **NoSQL** yapısındadır. Temel koleksiyon: `candidates`

**Örnek Aday Dokümanı (JSON):**

```json
{
  "id": "unique_doc_id",
  "name": "Emre Demir",
  "position": "Frontend Developer",
  "department": "Engineering",
  "status": "interview", // new, review, interview, offer, hired, rejected
  "experience": 5,
  "skills": ["React", "TypeScript", "Tailwind"],
  "matchScore": 88, // AI tarafından hesaplanan son skor
  "aiAnalysis": {
    "summary": "Teknik yetkinlikler güçlü, liderlik potansiyeli var.",
    "pros": ["Güçlü React bilgisi", "Problemlere analitik yaklaşım"],
    "cons": ["AWS deneyimi eksik"]
  },
  "contact": {
    "email": "emre@example.com",
    "phone": "+90 555 ..."
  },
  "createdAt": "Timestamp",
  "updatedAt": "Timestamp"
}
```

---

## 6. Güvenlik (Security)

* **API Güvenliği:** Google Gemini ve Firebase API anahtarları `.env` dosyasında saklanır ve Git reposuna (`.gitignore` sayesinde) gönderilmez.
* **Firebase Kuralları:**
  * Veriye sadece yetkilendirilmiş (Giriş yapmış) kullanıcılar erişebilir.
  * Anonim giriş özelliği geliştirme sürecini hızlandırmak için aktiftir ancak prodüksiyonda kısıtlanabilir.

---

## 7. Kurulum ve Çalıştırma

Projeyi yerel ortamda çalıştırmak için:

1. **Depoyu Klonlayın:**

    ```bash
    git clone https://github.com/emredemir-maker/TalentFlow.git
    cd TalentFlow
    ```

2. **Bağımlılıkları Yükleyin:**

    ```bash
    npm install
    ```

3. **Çevresel Değişkenleri Ayarlayın:**
    `.env` dosyasını oluşturun ve gerekli Firebase/Gemini API anahtarlarını ekleyin.

4. **Uygulamayı Başlatın:**

    ```bash
    npm run dev
    ```

    Tarayıcıda `http://localhost:5173` adresine gidin.

---

## 8. Lisans

Bu proje özel mülkiyettir. İzinsiz kopyalanamaz veya dağıtılamaz.
