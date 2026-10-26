# TalentFlow'u kişisel Firebase projesine kurma

Eski proje (`talentflow-84bb6`) eski şirketin Google organizasyonunda duruyor. TalentFlow **veri taşınmadan**
(Firestore, Auth kullanıcıları ve Storage dosyaları taşınmıyor) kişisel hesaptaki bir projeye temiz kuruluyor.

- **Proje:** `deploy-n8n-local`. Proje kotası dolduğu için yeni değil, var olan bir proje yeniden kullanılıyor.
  İçinde başka işler olabilir.
- **Hosting sitesi:** `talentinn-app` (adres `https://talentinn-app.web.app`). Projenin varsayılan sitesi
  (`deploy-n8n-local.web.app`) kullanılmıyor ve hiç değiştirilmiyor.

## Değerlerin tek yerleri

| Değer                                               | Nerede                                                 |
| --------------------------------------------------- | ------------------------------------------------------ |
| Proje kimliği                                       | `.firebaserc` → `projects.default`                     |
| Hosting site adı (uygulama adresi bundan türer)     | `firebase.json` → `hosting.site`                       |
| Web uygulaması numaraları, bucket adı               | GitHub repo değişkenleri (aşağıda)                     |
| Gizli değerler                                      | GitHub secret'ları (aşağıda), `functions/.env`'e CI yazar |

`npm run check:project` (CI'da ve dağıtımda da çalışır) şu durumlarda işi durdurur: yer tutucu ya da eski proje
kimliği yazılıysa, `firebase.json`'da site adı yoksa, ya da eski kimlik koda geri sızmışsa.

## Sıra

### 1. Projeyi kontrol et (konsol)

- <https://console.cloud.google.com/home/dashboard?project=deploy-n8n-local>. Proje seçicide **"No organization"**
  altında olmalı. Bir organizasyonun (özellikle Infoset) altındaysa dur.
- IAM'de sahip (Owner) `emredemir@gmail.com` olmalı.
- Proje henüz Firebase'e eklenmediyse <https://console.firebase.google.com> → **Add project** → var olan
  `deploy-n8n-local`'i seç. (Bunu betik de deniyor.)

### 2. Blaze planı (konsol)

Firebase Console → ⚙ → **Usage and billing** → **Details & settings** → **Modify plan** → **Blaze**.
Functions ve Storage bu plan olmadan çalışmaz. **Budget alerts** ile aylık bir bütçe uyarısı koy (ör. 20 USD).

### 3. Firestore, Storage ve Authentication'ı başlat (konsol)

Betik bu üçünü kendisi açamıyor ya da kısmen açabiliyor:

1. **Firestore Database** → **Create database**: varsa dokunma (aşağıdaki "Paylaşılan proje" bölümüne bak).
   Yoksa betik soruyor; **konum sonradan değiştirilemez**. Eski projenin konumunu betik okuyup öneriyor.
2. **Storage** → **Get started**: varsayılan bucket'ı oluşturur. Konumu Firestore ile aynı bölgede seç.
3. **Authentication** → **Get started**.

### 4. Google ile girişi aç (konsol)

**Authentication → Sign-in method → Google → Enable**. Destek e-postası olarak `emredemir@gmail.com` seç. Konsol
bunun için bir OAuth istemcisi ("Web client (auto created by Google Service)") üretir. E-posta/şifre ve anonim
girişi betik açıyor.

### 5. Betiği çalıştır (Git Bash)

```bash
gcloud auth login            # emredemir@gmail.com
gh auth login                # isteğe bağlı: varsa secret'lar doğrudan GitHub'a yazılır
bash scripts/setup-new-project.sh
```

Betik her adımda ✓ ya da ! yazar. Tekrar çalıştırmak güvenli, hiçbir şey silmez. Yaptıkları:

- Gerekli servisleri açar.
- `talentinn-app` sitesini oluşturur. Ad alınmışsa yedek bir ad seçer ve `firebase.json`'a yazar.
- Firestore'u oluşturur ya da var olanı denetler.
- Bucket'ı bulur; CORS ayarı boşsa `cors.json`'ı uygular.
- "TalentFlow" adlı web uygulamasını bulur ya da ekler.
- Auth'ta izinli alan adlarını ekler (var olanlar korunur).
- Çakışma denetimi yapar.
- `github-deployer` servis hesabını ve yetkilerini kurar, yayın anahtarını `~` altına yazar.
- Secret'ları gizli sorar ve GitHub'a yazar.

Sonunda `firebase.json` ya da `.firebaserc` değiştiyse commit'le.

### 6. Gmail uygulama şifresi (sistem e-postası)

Davetleri ve aday bildirimlerini `EMAIL_USER` hesabı Gmail SMTP üzerinden gönderiyor. Eski kurulumdaki hesap
şirket hesabıysa yeni bir hesap gerekiyor:

1. Google Hesabı → Güvenlik → **2 Adımlı Doğrulama** açık olmalı.
2. Google Hesabı → **Uygulama şifreleri** → "TalentFlow" → 16 haneli şifreyi betiğin sorusuna yapıştır.

Gönderen adres `@gmail.com` olacak. Adaylara giden postalar şirket alan adından değil, bu adresten çıkar.

### 7. Gemini anahtarı

Betik soruyor. Boş bırakırsan bu projede yalnızca Generative Language API'ye açık bir anahtar üretir.
Eski anahtar eski organizasyondaki projeye bağlı; onu kullanma.

### 8. GitHub (betik `gh` ile yazamadıysa elle)

`Settings → Secrets and variables → Actions`

| Tür      | Ad                             | Değer                                                  |
| -------- | ------------------------------ | ------------------------------------------------------ |
| Secret   | `FIREBASE_SERVICE_ACCOUNT`     | `~/talentflow-deployer-deploy-n8n-local.json` içeriği   |
| Secret   | `VITE_FIREBASE_API_KEY`        | Web uygulaması yapılandırmasındaki `apiKey`            |
| Secret   | `VITE_GEMINI_API_KEY`          | Gemini anahtarı                                        |
| Secret   | `INTEGRATION_ENCRYPTION_KEY`   | Yeni rastgele 32 bayt (betik üretir; sonra değiştirme) |
| Secret   | `EMAIL_USER`, `EMAIL_PASS`     | Gmail adresi ve uygulama şifresi                       |
| Secret   | `AI_DAILY_TOKEN_LIMIT`, `AI_DAILY_GROUNDED_LIMIT` | İsteğe bağlı günlük AI tavanları    |
| Variable | `FIREBASE_MESSAGING_SENDER_ID` | Web uygulaması yapılandırmasından                      |
| Variable | `FIREBASE_APP_ID`              | Web uygulaması yapılandırmasından (`1:<numara>:web:…`)  |
| Variable | `FIREBASE_STORAGE_BUCKET`      | `deploy-n8n-local.appspot.com` ya da `….firebasestorage.app` |
| Variable | `APP_URL`                      | İsteğe bağlı; yalnızca özel alan adı bağlanırsa         |

Bu secret'larda şu an **eski projenin değerleri** duruyor. Hepsi yenisiyle değiştirilmeli. Dağıtım, servis hesabı
anahtarı başka projeye aitse kendini durduruyor. Anahtar dosyasını GitHub'a koyduktan sonra sil.

### 9. İlk dağıtım

Dalı PR'la, CI yeşil olunca merge et. `firebase-deploy.yml` şunları dağıtır:

- Hosting'i yalnızca `talentinn-app` sitesine.
- Yalnızca `api` fonksiyonunu.
- Firestore ve Storage kurallarını.

### 10. İlk yönetici

Boş projede davet de izinli alan adı da yok. Bu yüzden:

1. `https://talentinn-app.web.app`'te Google ile bir kez giriş yap. "Erişim yetkiniz bulunmuyor" demesi normal;
   Auth kullanıcısı oluşur.
2. Git Bash'te:
   ```bash
   gcloud auth application-default login
   node scripts/grant-super-admin.mjs emredemir@gmail.com
   ```
   Betik rolü verir ve kullanıcı belgesini oluşturur.
3. Çıkış yapıp tekrar gir. Süper Admin ekranından izinli alan adlarını ekle ve davetleri gönder.

### 11. Google OAuth (Gmail + Takvim entegrasyonu)

Recruiter'ın Gmail'inden aday yazışması ve takvim daveti için:

1. **Google Auth Platform → Branding**:
   - Uygulama adı: TalentFlow.
   - Destek e-postası: `emredemir@gmail.com`.
   - Yetkili alan: `web.app`, gerekirse `firebaseapp.com`.
2. **Audience**: User type **External** (kişisel hesapta "Internal" yok). Yayın durumu **Testing**.
   **Test users**'a bağlanacak her recruiter'ın Gmail adresini ekle (en fazla 100).
3. **Data access**: `gmail.modify` ve `calendar.events` kapsamlarını ekle.
4. **Clients → Create client → Web application**:
   - Authorized JavaScript origins: `https://talentinn-app.web.app`
   - Authorized redirect URIs: `https://talentinn-app.web.app/auth/google/callback`
5. Client ID ve secret'ı uygulamada **Entegrasyon Merkezi**'ne gir. Bu değerler Firestore'da duruyor ve eski
   projeden taşınmadı.

**Sınır:** `gmail.modify` "restricted" bir kapsam. Uygulama doğrulanmadığı sürece (Testing):

- yalnızca test kullanıcıları bağlanabilir,
- onay ekranında "Google bu uygulamayı doğrulamadı" uyarısı çıkar,
- **yenileme jetonları 7 günde düşer**; kullanıcı haftada bir yeniden bağlanır.

Kalıcı çözüm "In production" + Google doğrulaması. Restricted kapsam için bu, yıllık bir CASA güvenlik
değerlendirmesi demek.

**Microsoft 365** kullanılıyorsa Azure'daki uygulama kaydına yeni redirect'i ekle:
`https://talentinn-app.web.app/auth/microsoft/callback`. Kayıt eski şirketin Azure kiracısındaysa yeni bir
kayıt gerekir.

### 12. Demo kurulumu (ayrı proje)

Demo workflow'ları artık proje kimliğini `DEMO_FIREBASE_PROJECT_ID` repo değişkeninden okuyor; yanına
`DEMO_FIREBASE_MESSAGING_SENDER_ID` ve `DEMO_FIREBASE_APP_ID` gerekiyor. Değişken tanımlı değilken:

- gece sıfırlaması uyarıyla atlanır,
- elle dağıtım durur.

Demo projesi (`talentflow-demo-6b894`) eski organizasyonda mı? Kontrol için:

```bash
gcloud projects describe talentflow-demo-6b894 --format="value(parent.type,parent.id)"
```

- **Kişiselse** üç değişkeni eski değerlerle tanımla.
- **Organizasyondaysa** yeni bir demo projesi gerekiyor. Kimliğinde "demo" geçmeli; tohumlama betiği başka
  projeyi reddediyor.

## Paylaşılan proje: konsolda kontrol et

`deploy-n8n-local` başka işler için de kullanılıyorsa:

- **Firestore (default) veritabanı**:
  - Datastore modundaysa TalentFlow çalışmaz; dur.
  - Native moddaysa ve başka koleksiyonlar varsa: TalentFlow'un `firestore.rules`'u **tüm veritabanının**
    kurallarını değiştirir ve diğer koleksiyonlara istemci erişimini kapatır.
- **Storage kuralları**: `storage.rules` varsayılan bucket'ın kurallarının yerine geçer. Mevcut kuralları
  Firestore/Storage → Rules'tan yedekle.
- **Authentication**: kullanıcı havuzu ortak olur. Giriş yöntemleri ve izinli alan adları eklenir, var olan
  hiçbir şey kapatılmaz. Başka bir uygulama Google sağlayıcısını farklı bir istemciyle kullanıyorsa dikkat et.
- **Fonksiyonlar / Cloud Run**: `us-central1`'de `api` adlı bir fonksiyon ya da servis varsa ilk dağıtım onun
  üzerine yazar. Betik bunu denetliyor.
- **Hosting**: varsayılan site ve diğer siteler değişmez; dağıtım yalnızca `talentinn-app`'e gider.
- **Servis hesabı**: `github-deployer` projede `firebase.admin` gibi geniş roller alır. Anahtarı yalnızca GitHub
  secret'ında tut.

## Sonra

- Eski projedeki Cloud Run `api` servisinde elle girilmiş ortam değişkenleri olabilir; yeni kurulumda bunlar yok.
  Adlarını görmek için (değerleri basmaz):
  ```bash
  gcloud run services describe api --region us-central1 --project talentflow-84bb6 \
    --format="value(spec.template.spec.containers[0].env[].name)"
  ```
- Eski proje bir süre açık kalabilir, ama hiçbir şey ona yazmıyor. Kapatma kararı Emre'nin.
