# TalentFlow'u Hub-Inn platform projesine kurma (`agentinn-nyqpx`)

TalentFlow **veri taşınmadan** (Firestore, Auth kullanıcıları ve Storage dosyaları taşınmıyor) Hub-Inn'in
platform projesine temiz kuruluyor. Hub-Inn çatı platform; Firebase Auth ortak.

## Neden bu proje

1. Eski proje (`talentflow-84bb6`) eski şirketin Google organizasyonunda duruyor.
2. İlk hedef kişisel hesaptaki `deploy-n8n-local` projesiydi (PR #305). O projenin Hosting arka ucu Google
   tarafında bozuk: her Hosting API çağrısı 409 "Channel .../sites/deploy-n8n-local/channels/live already exists"
   dönüyor, `firebase hosting:sites:get` hiçbir siteyi bulamıyor. Elimizdeki tek yedek projede de aynı sorun var.
3. Karar (Emre): TalentFlow `agentinn-nyqpx`'e taşınıyor. Bu projede Hosting çalışıyor (CX-Inn `cxinn` sitesini
   aynı API ile oluşturdu).

## Paylaşılan proje: kurallar

Projede başka iki uygulama yaşıyor. Bunlara **dokunulmaz**:

| Uygulama | Kaynak                                                                           | Veri       |
| -------- | -------------------------------------------------------------------------------- | ---------- |
| Hub-Inn  | Varsayılan Hosting sitesi `agentinn-nyqpx`; Functions codebase `api` (`api`, `leadScan`, `europe-west1`) | Neon Postgres |
| CX-Inn   | Hosting sitesi `cxinn`; Cloud Run servisi `cx-inn-api`                           | Postgres   |

TalentFlow'un parçaları ayrı adlarla:

| Parça                | TalentFlow                                                                    |
| -------------------- | ----------------------------------------------------------------------------- |
| Hosting sitesi       | `talentinn` → `https://talentinn.web.app` (alınmışsa `talentinn-hub`, `talentflow-hub`) |
| Functions codebase   | `talentflow`                                                                  |
| Fonksiyon            | `talentflowApi`, `europe-west1` (Cloud Run servisi `talentflowapi`)           |
| Çalışma hesabı       | `talentflow-runtime@agentinn-nyqpx.iam.gserviceaccount.com`                   |
| Dağıtım hesabı       | `talentflow-deployer@agentinn-nyqpx.iam.gserviceaccount.com`                  |
| Web uygulaması       | "TalentFlow"                                                                  |
| Firestore            | `(default)`, `eur3` — Hub-Inn ve CX-Inn Firestore kullanmıyor                 |
| Storage              | varsayılan bucket — Hub-Inn ve CX-Inn Storage kullanmıyor                     |

Kurallar:

- **Asla düz `firebase deploy` çalıştırma.** Bu, projenin tüm Hosting'i ve tüm codebase'ler demek. Tek doğru komut
  (CI'ın çalıştırdığı):
  ```bash
  firebase deploy --only "hosting:talentinn,functions:talentflow,firestore,storage" --project agentinn-nyqpx --non-interactive --force
  ```
- `agentinn-nyqpx` ve `cxinn` sitelerine, `api` codebase'ine ve `api`/`leadScan` fonksiyonlarına dokunma.
  `npm run check:project` bunları reddediyor: site adı yoksa, birden fazla hosting girdisi varsa, site Hub-Inn'in ya
  da CX-Inn'in sitesiyse, codebase `talentflow` değilse, `/api/**` yönlendirmesi `talentflowApi@europe-west1`'e
  gitmiyorsa (ör. `api` yazılırsa istekler Hub-Inn'e giderdi).
- `--force` güvenli: Firebase CLI silme adaylarını codebase başına hesaplıyor. `functions:talentflow` filtresiyle
  yalnızca `talentflow` codebase'indeki fonksiyonlar silinebilir; Hub-Inn'in fonksiyonları plana hiç girmez.
  Bayrak CI'da Artifact Registry temizleme politikası sorusunu onaylamak için gerekli.
- **Firestore ve Storage kuralları proje geneli.** Bugün yalnızca TalentFlow kullanıyor. Hub-Inn ya da CX-Inn
  Firestore/Storage'a geçerse kuralların tek sahibi konuşulmalı.
- **Auth ortak.** TalentFlow anonim girişi açıyor (aday sayfaları). Hub-Inn ve CX-Inn sunucuları anonim ve
  e-postası doğrulanmamış jetonları reddediyor; bu doğrulandı. Hub-Inn kullanıcıları aynı havuzda görünür ama
  TalentFlow'a yalnızca davet ya da izinli alan adıyla girer. İzinli alan adlarına yalnızca TalentFlow'un sitesi
  eklenir; e-posta/şifre zaten açıksa ayarına dokunulmaz.
- **Hesap ayrımı.** Fonksiyon varsayılan compute hesabıyla değil `talentflow-runtime` ile çalışıyor; compute
  hesabının Hub-Inn/CX-Inn gizli değerlerine erişimi TalentFlow'a geçmiyor. Dağıtım da kendi hesabıyla
  (`talentflow-deployer`); Hub-Inn'in ya da CX-Inn'in hesabı kullanılmıyor. Bu hesaba `roles/firebase.admin` ya da
  `roles/editor` verilmiyor.

## Değerlerin tek yerleri

| Değer                                           | Nerede                                                    |
| ----------------------------------------------- | --------------------------------------------------------- |
| Proje kimliği                                   | `.firebaserc` → `projects.default`                        |
| Hosting site adı (uygulama adresi bundan türer) | `firebase.json` → `hosting.site`                          |
| Fonksiyon adı / bölge / hesap                   | `functions/index.js` (+ `firebase.json` yönlendirmesi)    |
| Web uygulaması numaraları, bucket adı           | GitHub repo değişkenleri (aşağıda)                        |
| Gizli değerler                                  | GitHub secret'ları (aşağıda), `functions/.env`'e CI yazar |

## Sıra

### 1. Konsol (betikten önce)

1. **Firestore**: betik `(default)` veritabanını `eur3`'te kendisi oluşturur. (Dağıtım da yoksa `eur3`'te açar —
   `firebase.json` → `firestore.location`.)
2. **Storage** → <https://console.firebase.google.com/project/agentinn-nyqpx/storage> → **Get started** → konum
   AB (ör. `EUROPE-WEST1`). Varsayılan bucket oluşur. Betik bucket yoksa bunu söyler; açtıktan sonra betiği yeniden
   çalıştır (CORS ve çalışma hesabının bucket yetkisi o zaman verilir).
3. **Authentication → Sign-in method → Google** açık olmalı (Hub-Inn için zaten açık). Betik anonim girişi ve
   gerekiyorsa e-posta/şifreyi açar.
4. Blaze planı zaten açık (Hub-Inn kullanıyor). Bütçe uyarısını TalentFlow'un ek yükü için gözden geçir.

### 2. Betiği çalıştır (Git Bash)

```bash
git pull
gcloud auth login            # emredemir@gmail.com
gh auth login                # isteğe bağlı: varsa secret'lar doğrudan GitHub'a yazılır
bash scripts/setup-new-project.sh
```

Betik her adımda ✓ ya da ! yazar. Tekrar çalıştırmak güvenli, hiçbir şey silmez. Yaptıkları:

- Gerekli servisleri açar (15'erli gruplar).
- `talentinn` sitesini oluşturur. Ad alınmışsa `talentinn-hub`, `talentflow-hub`'ı dener ve seçileni
  `firebase.json`'a yazar. Oluşturamazsa Google'ın mesajını gösterir.
- Firestore `(default)`'u `eur3`'te oluşturur ya da var olanı denetler.
- Bucket'ı bulur; CORS ayarı boşsa `cors.json`'ı uygular.
- "TalentFlow" web uygulamasını bulur ya da ekler (appId, gönderici no, apiKey). Tarayıcı anahtarında adres
  kısıtı varsa ve sitemiz listede yoksa uyarır (kısıtı değiştirmez).
- Auth: anonim giriş, gerekiyorsa e-posta/şifre, izinli alanlara yalnızca `talentinn.web.app` ve
  `talentinn.firebaseapp.com`.
- Çakışma denetimi: `europe-west1`'deki fonksiyonları listeler, `talentflowApi` adı başkasınınsa uyarır.
- `talentflow-runtime` ve `talentflow-deployer` hesaplarını ve rollerini kurar (aşağıda), yayın anahtarını
  `~/talentflow-deployer-agentinn-nyqpx.json`'a yazar.
- GitHub secret ve değişkenlerini yazar (önceki projenin değerlerinin üzerine). Durum dosyası projeye göre
  (`~/.talentflow-setup-agentinn-nyqpx.state`), yani önceki proje için girilenler bu projede yeniden sorulur.
  `EMAIL_USER`/`EMAIL_PASS` ve `AI_DAILY_*` için "yeniden girilsin mi?" sorar; varsayılan **hayır** (GitHub'daki
  değer kalır). Gemini için: bu projede yeni anahtar üret, yapıştır ya da atla.

Sonunda `firebase.json` ya da `.firebaserc` değiştiyse commit'le.

### Hesaplar ve roller

`talentflow-runtime` (fonksiyonun çalıştığı hesap):

| Rol                         | Neden                                                        |
| --------------------------- | ------------------------------------------------------------ |
| `roles/datastore.user`      | Firestore okuma/yazma (Admin SDK)                            |
| `roles/firebaseauth.admin`  | Kullanıcı oluşturma/silme, rol talepleri                     |
| `roles/logging.logWriter`   | Günlükler                                                    |
| `roles/storage.objectAdmin` | **Yalnızca varsayılan bucket üzerinde** — CV ve içe aktarma dosyaları |

`talentflow-deployer` (GitHub Actions):

| Rol                                     | Neden                                                    |
| --------------------------------------- | -------------------------------------------------------- |
| `roles/firebasehosting.admin`           | Site sürümü yükleme/yayınlama                            |
| `roles/cloudfunctions.admin`            | Fonksiyon oluşturma/güncelleme; herkese açık HTTPS için IAM ayarı |
| `roles/run.admin`                       | 2. nesil fonksiyonun Cloud Run servisi ve çağırıcı izni  |
| `roles/artifactregistry.writer`         | `gcf-artifacts` deposu ve temizleme politikası denetimi  |
| `roles/cloudbuild.builds.editor`        | Fonksiyon derlemesinin durumu/günlüğü                    |
| `roles/firebaserules.admin`             | Firestore ve Storage kurallarını yayınlama               |
| `roles/datastore.indexAdmin`            | Firestore dağıtımının veritabanı/indeks denetimi         |
| `roles/firebasestorage.viewer`          | Storage dağıtımı varsayılan bucket'ı bu API'den buluyor  |
| `roles/serviceusage.serviceUsageConsumer` | CLI'nin servis denetimleri                             |
| `roles/firebaseextensions.viewer`       | CLI'nin dağıtım öncesi eklenti listesi                   |
| `roles/iam.serviceAccountUser`          | **Yalnızca** `talentflow-runtime` üzerinde; Cloud Build'in varsayılan hesabı compute ise onun üzerinde de (derleme için şart) |

Proje düzeyindeki roller (ör. `run.admin`, `cloudfunctions.admin`) teknik olarak projedeki diğer servisleri de
kapsıyor; IAM bunları tek fonksiyona daraltmıyor. Bu yüzden anahtar yalnızca GitHub secret'ında durmalı.

### 3. Gmail uygulama şifresi (sistem e-postası)

Mevcut `EMAIL_USER`/`EMAIL_PASS` projeden bağımsız; betikte "hayır" deyip olduğu gibi bırakabilirsin. Yenisi
gerekirse: Google Hesabı → Güvenlik → **2 Adımlı Doğrulama** açık → **Uygulama şifreleri** → "TalentFlow".

### 4. GitHub (betik `gh` ile yazamadıysa elle)

`Settings → Secrets and variables → Actions`

| Tür      | Ad                             | Değer                                                    |
| -------- | ------------------------------ | -------------------------------------------------------- |
| Secret   | `FIREBASE_SERVICE_ACCOUNT`     | `~/talentflow-deployer-agentinn-nyqpx.json` içeriği       |
| Secret   | `VITE_FIREBASE_API_KEY`        | "TalentFlow" web uygulamasının `apiKey`'i                |
| Secret   | `VITE_GEMINI_API_KEY`          | Gemini anahtarı (mevcut kalabilir)                       |
| Secret   | `INTEGRATION_ENCRYPTION_KEY`   | Bu proje için yeni rastgele 32 bayt (betik üretir; sonra değiştirme) |
| Secret   | `EMAIL_USER`, `EMAIL_PASS`     | Gmail adresi ve uygulama şifresi (mevcut kalabilir)      |
| Secret   | `AI_DAILY_TOKEN_LIMIT`, `AI_DAILY_GROUNDED_LIMIT` | İsteğe bağlı günlük AI tavanları (mevcut kalabilir) |
| Variable | `FIREBASE_MESSAGING_SENDER_ID` | Web uygulaması yapılandırmasından                        |
| Variable | `FIREBASE_APP_ID`              | Web uygulaması yapılandırmasından (`1:<numara>:web:…`)    |
| Variable | `FIREBASE_STORAGE_BUCKET`      | `agentinn-nyqpx.firebasestorage.app` (ya da `….appspot.com`) |
| Variable | `APP_URL`                      | İsteğe bağlı; yalnızca özel alan adı bağlanırsa           |

Dağıtım, servis hesabı anahtarı başka projeye aitse kendini durduruyor. Anahtar dosyasını GitHub'a koyduktan sonra
sil.

### 5. İlk dağıtım

Dalı PR'la, CI yeşil olunca merge et. `firebase-deploy.yml` yalnızca şunları dağıtır:

- Hosting'i `talentinn` sitesine,
- `talentflow` codebase'ini (`talentflowApi`, `europe-west1`),
- Firestore ve Storage kurallarını.

Dağıtımdan sonra kontrol: `https://talentinn.web.app/api/health` → 200. Hub-Inn'in
`https://agentinn-nyqpx.web.app` ve CX-Inn'in `https://cxinn.web.app` adresleri değişmeden açılmalı.

### 6. İlk yönetici

Temiz kurulumda TalentFlow'da davet de izinli alan adı da yok:

1. `https://talentinn.web.app`'te Google ile bir kez giriş yap. "Erişim yetkiniz bulunmuyor" demesi normal; Auth
   kullanıcısı oluşur (Hub-Inn'de zaten varsan aynı kullanıcı kullanılır).
2. Git Bash'te:
   ```bash
   gcloud auth application-default login
   node scripts/grant-super-admin.mjs emredemir@gmail.com
   ```
   Betik projeyi `.firebaserc`'den okur, rolü verir ve TalentFlow kullanıcı belgesini oluşturur.
3. Çıkış yapıp tekrar gir. Süper Admin ekranından izinli alan adlarını ekle ve davetleri gönder.

### 7. Google OAuth (Gmail + Takvim entegrasyonu)

Recruiter'ın Gmail'inden aday yazışması ve takvim daveti için:

1. **Google Auth Platform → Branding**: proje Hub-Inn ile ortak, onay ekranı da ortak. Uygulama adı ve destek
   e-postası Hub-Inn için ayarlıysa değiştirme; yetkili alanlara `web.app` (yoksa) ekle.
2. **Audience**: External, **Testing**. **Test users**'a bağlanacak her recruiter'ın Gmail adresini ekle.
3. **Data access**: `gmail.modify` ve `calendar.events` kapsamlarını ekle.
4. **Clients → Create client → Web application** ("TalentFlow"):
   - Authorized JavaScript origins: `https://talentinn.web.app`
   - Authorized redirect URIs: `https://talentinn.web.app/auth/google/callback`
5. Client ID ve secret'ı uygulamada **Entegrasyon Merkezi**'ne gir.

**Sınır:** `gmail.modify` "restricted" bir kapsam. Uygulama doğrulanmadığı sürece (Testing) yalnızca test
kullanıcıları bağlanabilir, onay ekranında uyarı çıkar ve **yenileme jetonları 7 günde düşer**.

**Microsoft 365** kullanılıyorsa Azure uygulama kaydına redirect ekle:
`https://talentinn.web.app/auth/microsoft/callback`.

### 8. Demo kurulumu (ayrı proje)

Demo aynı fonksiyon kaynağını kullanıyor: fonksiyon artık `talentflowApi` (`europe-west1`) ve
`talentflow-runtime` hesabıyla çalışıyor. Demo projesinde bu hesap yoksa demo dağıtımı durur; bir kez oluşturup
dört çalışma rolünü ver (yukarıdaki tablo). Demo değişkenleri: `DEMO_FIREBASE_PROJECT_ID`,
`DEMO_FIREBASE_MESSAGING_SENDER_ID`, `DEMO_FIREBASE_APP_ID`. Kimlikte "demo" geçmeli.

### 9. Firestore PITR ve indeks dosyası (elle, Emre — çok şirketli geçiş PR 0)

Bu iki adım ajan oturumundan yapılamıyor (projeye erişim yok); gerçek müşteri verisi gelmeden önce bir kez yapılır.

**PITR (zamanda geri dönüş, 7 gün).** Silinen ya da bozulan veriyi son 7 gün içindeki herhangi bir dakikaya geri
almayı sağlar. Ücret: saklanan eski sürümler kadar ek depolama.

```bash
gcloud firestore databases update --database='(default)' --enable-pitr --project=agentinn-nyqpx
# doğrulama: POINT_IN_TIME_RECOVERY_ENABLED ve 604800s görünmeli
gcloud firestore databases describe --database='(default)' --project=agentinn-nyqpx \
  --format='value(pointInTimeRecoveryEnablement,versionRetentionPeriod)'
```

Konsoldan: Firebase/Cloud konsolu → Firestore → `(default)` → **Disaster recovery** → **Edit** → "Point-in-time
recovery" aç → Kaydet.

**İndeks dosyası.** Repoda `firestore.indexes.json` var; kodun sorgularından türetildi ve bileşik indeks gerektiren
sorgu bulunmadığı için boş (yalnız eşitlik süzgeçleri ve tek alanlı `orderBy`; Firestore bunları otomatik indekslerle
karşılıyor). Konsolda elle açılmış indeks olup olmadığını karşılaştır:

```bash
firebase firestore:indexes --project agentinn-nyqpx > /tmp/indexes-konsol.json
diff <(jq -S . /tmp/indexes-konsol.json) <(jq -S . firestore.indexes.json)
```

Fark varsa konsoldaki indeksleri dosyaya ekleyen bir PR aç. **Dosya şimdilik `firebase.json`'a bağlı değil**: dağıtım
`--only …,firestore` ve `--force` ile çalışıyor; dosya bağlanırsa CLI dosyada olmayan konsol indekslerini **siler**.
Karşılaştırma bitip dosya konsolla aynı olunca `firebase.json` → `firestore.indexes: "firestore.indexes.json"`
eklenir (çok şirketli geçişte işçinin collection group indeksi bu dosyaya girecek).

## Sonra

- `deploy-n8n-local`'de yarım kalan kurulum (servis hesabı, web uygulaması) zararsız; temizleme kararı Emre'nin.
  Gemini anahtarı o projeye bağlıysa, o proje kapatılmadan önce bu projede yenisini üret (betik, seçenek `o`).
- Eski proje (`talentflow-84bb6`) bir süre açık kalabilir, ama hiçbir şey ona yazmıyor. Kapatma kararı Emre'nin.
