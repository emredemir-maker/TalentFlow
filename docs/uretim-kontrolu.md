# Üretim Kontrolü — TalentFlow (Talent-Inn)

Tarih: 2026-10-02 · İncelenen: `main` dalının son hâli (`469805c`, PR #288) · Yöntem: yalnızca okuma; koda dokunulmadı.

**Bu rapor neye dayanıyor:** kodun ve belgelerin okunması. Uygulamayı çalıştırmadım, canlı Firebase/Google Cloud konsoluna bakmadım. Testleri çalıştırmayı denedim ama bağımlılık kurulumu başarısız oldu (muhtemelen `xlsx` paketinin dış adresten inmesi); bu yüzden "testler geçiyor" demiyorum, yalnızca "test dosyaları var" diyorum. Konsoldaki ayarlar (yedek, alarm, Cloud Run erişimi) kodda görünmez; "kodda yok" yazdığım yerde konsolda olabilir, sorulması gerekir.

---

## Özet

**Kullanılan altyapı:** React 19 + Vite (tarayıcı uygulaması) · Express 5 sunucusu, Firebase Cloud Functions (v2, `us-central1`) üzerinde · Firestore (veritabanı) · Firebase Authentication · Firebase Storage (CV dosyaları) · Google Gemini (yapay zekâ) · e-posta için tek bir Gmail hesabı (nodemailer) · GitHub Actions ile dağıtım.

**Genel karar:** Ürün tek bir şirket için yazılmış (müşteri ayrımı kodda hiç yok); her müşteriye **ayrı kurulum** yaparak ilk 2 müşteriye yetişmek orta uzaklıkta (aşağıdaki sekiz şart kapanırsa), **tek ortak kurulumda** iki müşteriyi birlikte barındırmak ise büyük bir yeniden yazım demek.

### "Müşteri açılmadan önce şart" maddeleri (🔴) ve büyüklük tahmini

Büyüklük: **küçük** = bir iki gün · **orta** = bir iki hafta · **büyük** = haftalar ve tasarım kararı gerektirir. Bunlar tahmindir, taahhüt değil.

| # | Madde | Büyüklük |
|---|---|---|
| 1 | Müşteri ayrımı yok: tek kiracılı yapı (karar: her müşteriye ayrı kurulum) | Ayrı kurulum: **orta** · Ortak kurulum: **büyük** |
| 2 | Giriş yapmamış bir ziyaretçi, şirketin e-posta hesabından istediği adrese istediği içerikle e-posta attırabiliyor | **küçük** |
| 3 | Bir işe alım uzmanı, diğer personelin Gmail/Outlook hesabına bağlanma anahtarlarını okuyabiliyor | **orta** |
| 4 | Departman kullanıcısı, departman sınırını aşıp bütün mülakat kayıtlarını ve mesajları okuyabiliyor | **orta** |
| 5 | Veritabanı yedeği kodda/belgede tarif edilmemiş | **küçük** (konsol ayarı) |
| 6 | KVKK: adaya gösterilen "aydınlatma metni" yok; onay kutusu var ama sunucu onayı zaten "evet" yazıyor | **küçük** teknik + hukuk metni bekler |
| 7 | KVKK: aday silme eksik (CV dosyası, mülakat kaydı kalıyor); aday talep kanalı yok | **orta** |
| 8 | Yeni müşteri kurulumu yazılı ve denenmiş değil; proje adı ve marka koda gömülü | **orta** |

---

## Bu raporda geçen terimler

- **Firestore:** Google'ın bulut veritabanı; bütün veri burada durur.
- **Güvenlik kuralları (`firestore.rules`, `storage.rules`):** tarayıcıdan veritabanına/dosya deposuna gelen her isteğin "izin var mı" kontrolü.
- **Admin SDK:** sunucunun veritabanına bu kuralları **atlayarak** erişmesini sağlayan araç. Sunucu tarafındaki her uç, kuralların yaptığı kontrolü kendisi yapmak zorunda.
- **Anonim oturum:** kullanıcı adı/şifre olmadan, başvuru veya mülakat sayfasını açan herkese otomatik verilen geçici kimlik. Yani "giriş yapmış" demek "personel" demek değil.
- **Jeton (token):** bir hesaba adına işlem yapabilme anahtarı. Google/Microsoft jetonu, uygulamaya o kişinin postasını okuma/gönderme yetkisi verir.
- **KVKK:** Kişisel Verilerin Korunması Kanunu.
- **Gemini:** Google'ın yapay zekâ servisi; CV analizi, puanlama, mülakat analizi bunu kullanır.
- **CI:** kod değişince otomatik çalışan kontrol ve test düzeni (burada GitHub Actions).
- **Kiracı:** yazılımı kullanan her bağımsız müşteri şirket.

---

## 1. Müşteri verisi ayrımı, kimlik doğrulama ve yetkiler

### Nasıl çalışıyor (kısa)

- Roller: `super_admin` (sistem yöneticisi), `recruiter` (işe alım uzmanı), `department_user` (departman yöneticisi), anonim (aday). Yetki matrisi: `docs/YETKI-MATRISI.md`.
- Sunucu uçlarında kimlik denetimi iki şekilde yapılıyor (`functions/middleware/auth.js`): `requireAuth([roller])` rolü veritabanından okuyup kontrol ediyor; `verifyFirebaseToken` ise **yalnızca** "geçerli bir oturum var mı" bakıyor ve **anonim oturumu da kabul ediyor**.
- Veritabanına tarayıcıdan erişimin sınırı `firestore.rules`'ta; bu dosya özenle yazılmış, çoğu açığın geçmişi yorumlarda anlatılmış.

### 1.1 Müşteri kimliği hiçbir yerde yok (tek kiracılı yapı) — 🔴

- **Sorun:** Hiçbir kayıtta, sorguda veya kuralda "hangi müşteriye ait" bilgisi yok. Bütün aday, pozisyon, kullanıcı, ayar verisi tek bir sabit yolun altında duruyor ve mülakat kayıtları kök dizinde ortak koleksiyonda.
- **Nerede:** `artifacts/talent-flow/public/data/...` yolu 53 dosyada sabit yazılı (`firestore.rules`, `functions/routes/*.js`, `src/context/*.jsx`, `src/services/*.js`); mülakatlar `interviews/{oturum}` (`firestore.rules:359`). Kodda "tenant/orgId/companyId" ile müşteri ayıran bir kavram yok (aramada çıkanlar yalnızca Microsoft hesabının kendi "tenant" alanı). Belgede de kabul edilmiş: `docs/YETKI-MATRISI.md` "Tek kiracılı mimari… birden fazla şirket aynı kuruluma alınırsa bu matris geçersizdir".
- **Neden önemli:** İki müşteri aynı kurulumu paylaşırsa, bir müşterinin işe alım uzmanı diğerinin bütün adaylarını görür (`recruiter` rolü bilinçli olarak "tüm havuzu" görüyor, `firestore.rules:159`).
- **Nasıl düzelir:** İlk iki müşteri için her birine ayrı Firebase projesi/kurulum aç (kod buna büyük ölçüde elverişli, bkz. 2. bölüm); ortak kurulum istenirse her kayda müşteri kimliği ekleyip kuralları, sunucu uçlarını ve ekranları buna göre baştan yazmak gerekir.
- **Durum:** 🔴 (ayrı kurulum yoluyla **orta**, ortak kurulumla **büyük**)

### 1.2 Anonim oturumla e-posta gönderilebiliyor — 🔴

- **Sorun:** Üç e-posta ucu yalnızca "geçerli oturum var mı" diye bakıyor; anonim oturum da geçiyor. Başvuru sayfasını açan herkes anonim oturum alıyor. Böylece herhangi biri, şirketin Gmail hesabından, istediği alıcıya, istediği HTML içerikle ("gönderen adı" dâhil) e-posta attırabilir.
- **Nerede:** `functions/routes/email.js:236` (`/api/send-feedback`), `:309` (`/api/send-interview-invite`), `:349` (`/api/send-info-request`); `verifyFirebaseToken` → `functions/middleware/auth.js:21-40`. Genel sınır: 15 dakikada 200 istek (`functions/middleware/rateLimit.js`) — saatte yüzlerce e-posta için yeterince geniş. `send-info-request` ayrıca `candidateName`, `requestMessage` gibi alanları temizlemeden HTML'e koyuyor (`email.js:393-405`).
- **Neden önemli:** Oltalama (phishing) e-postası müşterinin alan adı/hesabı adına gider; Gmail hesabı spam nedeniyle kapatılabilir, müşterinin itibarı zarar görür. (Demo modu bunu `functions/middleware/demoMode.js` ile kapatıyor — yani ekip riski biliyor; üretimde bu kilit yok.)
- **Nasıl düzelir:** Bu üç uca `requireAuth()` (rol kontrollü) koy, anonim oturumu reddet; gönderilen e-postaları günlük adetle sınırla ve HTML alanlarını temizle.
- **Durum:** 🔴 (**küçük**)

### 1.3 Başkasının Gmail/Outlook hesabına bağlanma anahtarları okunabiliyor — 🔴

- **Sorun:** Personel kendi Google/Microsoft hesabını bağladığında, hesabın erişim ve yenileme jetonları **açık metin olarak** kendi kullanıcı kaydına yazılıyor. Kural, kullanıcı kayıtlarını "her işe alım uzmanı" okuyabilsin diye açıyor. Yani bir işe alım uzmanı, meslektaşının jetonunu okuyup onun adına işlem yapabilir.
- **Nerede:** jetonların yazılması `functions/routes/auth.js:122` (Microsoft) ve `:271` (Google); okuma izni `firestore.rules:180-183` (`isRecruiter()`). İstenen yetkiler çok geniş: Google için `gmail.modify` = bütün posta kutusunu okuma/silme/gönderme (`auth.js:189-193`); Microsoft için `Mail.Send Calendars.ReadWrite` (`auth.js:35`).
- **Neden önemli:** Müşteri tarafındaki bir çalışan, başka bir çalışanın bütün postasına erişebilir; bu hem güvenlik hem KVKK ihlali.
- **Nasıl düzelir:** Jetonları kullanıcı kaydından çıkarıp yalnızca sunucunun okuyabildiği ayrı bir koleksiyona (veya Secret Manager'a) taşı, kural olarak istemciye tamamen kapat; `gmail.modify` yerine yalnızca gerekli en dar yetkiyi iste.
- **Durum:** 🔴 (**orta**; mevcut bağlantılar yeniden kurulur)

### 1.4 Departman kullanıcısı departman sınırını aşabiliyor — 🔴

- **Sorun:** Aday kaydında departman kısıtı kuralla uygulanıyor (iyi), ama aynı adayların mülakat dökümü, bilgi talepleri ve mesaj kuyruğu **giriş yapmış her personele** (departman kullanıcısı dâhil) listelenebilir durumda.
- **Nerede:** `firestore.rules:361` (`interviews` → `list: isStrictAuthenticated()`; içinde transkript, skor, aday kimliği), `:270` (`infoRequests` list), `:285` (`messageQueue` read), `:294` (`participantInvites` read). Kuralın kendi yorumu bunu bilinçli gösteriyor, ama `docs/YETKI-MATRISI.md` aday listesini "yalnızca kendi departmanları" diye anlatıyor; mülakat kayıtları için bu doğru değil.
- **Neden önemli:** Departman yöneticisi, kendi departmanı dışındaki adayların mülakat konuşma metnini ve puanlarını tarayıcı konsolundan okuyabilir.
- **Nasıl düzelir:** Mülakat oturumuna ve bilgi talebine departman/katılımcı alanı koyup listelemeyi buna göre kısıtla (ya da departman kullanıcısı için listelemeyi sunucudan, yetki süzerek yap).
- **Durum:** 🔴 (**orta**)

### 1.5 Giriş gerektirmeyen uçlar — 🟡

- **Sorun:** Üç uç kimlik istemiyor ve yönetici yetkisiyle (kuralları atlayarak) yazıyor; yalnızca "oturum kimliğini bilen girer" mantığına ve hız sınırına dayanıyor.
  - `POST /api/init-interview-session` (`functions/routes/interview.js:123`): `iv-` ile başlayan her kimlikle yeni mülakat kaydı açıyor; kayıt **yeni** ise gönderilen içerik süzülmeden yazılıyor (süzme yalnızca var olan kayıtta, `:134-143`). Sahte mülakat kaydı listelere girebilir.
  - `POST /api/candidate-respond` (`email.js:427`): kayıt yoksa bile `interviews/{id}` altında boş belge oluşturuyor (`set ... merge`), yanıt metnini sınırsız uzunlukta yazıyor.
  - `GET /api/session/:id` (`interview.js:47`): her çağrıda **bütün aday koleksiyonunu** okuyup içinde oturumu arıyor.
- **Neden önemli:** Sahte kayıt, depolama maliyeti ve aday sayısı arttıkça her mülakat sayfası yenilemesinde yavaşlayan/pahalı okuma.
- **Nasıl düzelir:** Oturum kimliğini doğrudan belge adresi yap (tarama yerine tek okuma), yeni kayıtta da alan süzmesi uygula, `candidate-respond`'da kayıt yoksa 404 dön ve metin uzunluğuna sınır koy.
- **Durum:** 🟡

### 1.6 Herkese açık yazma kapıları — 🟡

- **Sorun:** `applications` koleksiyonuna **herkes** yazabiliyor ve içerik doğrulanmıyor (`firestore.rules:127`, `allow create: if true`); `candidates` koleksiyonuna **anonim oturum** doğrudan aday kaydı ekleyebiliyor, alan sınırı yok (`:143`). Kötü niyetli biri aday havuzuna sahte, yüksek puanlı kayıtlar ekleyebilir ya da depolama doldurabilir. Sunucudaki `/api/applications` ucu da kimliksiz ve `kvkkConsent: true`'yu kendisi yazıyor (bkz. 4.3).
- **Neden önemli:** Havuz bozulur; işe alım uzmanı sahte kaydı gerçek aday sanabilir.
- **Nasıl düzelir:** Başvuruyu yalnızca sunucu ucundan kabul et, kurallarda yazma alanlarını ve boyutunu kısıtla (örn. `status`, `aiScore` alanlarını adaydan alma), bot koruması (CAPTCHA) ekle.
- **Durum:** 🟡

### 1.7 Sunucu tarafı genel ayarlar — 🟡

- **Sorun (a):** Hız sınırı sunucunun belleğinde tutuluyor; Cloud Functions birden çok kopya (en çok 5, `functions/index.js`) açtığında her kopya kendi sayacını tutuyor — sınır beklenenden gevşek.
- **Sorun (b):** Sunucu kodundaki izinli kaynak listesi ve `*.web.app` / `*.firebaseapp.com` genişliği, üstüne `functions/index.js:17` `cors: true` (her kaynağa açık) var; yani liste fiilen devrede değil. Uçlar çerezle değil Bearer jetonuyla çalıştığı için risk düşük.
- **Sorun (c):** İçerik güvenlik politikası (CSP) yalnızca "rapor" modunda, engellemiyor (`functions/middleware/security.js`).
- **Nasıl düzelir:** Hız sınırını Firestore/Redis'e al; `cors: true`'yu kaldırıp tek bir izin listesi kullan; rapor temizse CSP'yi zorlayıcı yap.
- **Durum:** 🟡

### 1.8 Yönetici uçları ve rol kontrolü — 🟢

- Bütün `/api/admin/*` uçları `requireAuth(['super_admin'])` arkasında (`functions/routes/admin.js`); API anahtarı ve entegrasyon sırları `firestore.rules:249-256` ile istemciden tamamen kapalı; en alttaki "varsayılan reddet" kuralı yerinde (`:375`); kullanıcı kimliği (uid) artık istemciden değil jetondan alınıyor (`auth.js` yorumunda geçmiş IDOR düzeltmesi); canlı mülakat değerlendirme alanları aday tarafından yazılamıyor (hem kuralda hem `PROTECTED_SESSION_FIELDS` ile sunucuda). Davet sorgusu sunucuya taşınmış ve hız sınırlı (`inviteLimiter`). **Bu kısım iyi.**
- Kayıt: davet ya da izinli e-posta alan adı olmadan hesap açılamıyor (`firestore.rules:183-189`); `super_admin` yalnızca betikle atanıyor.

---

## 2. Kurulum: sabit yazılmış değerler, yeni müşteri adımları, açıktaki sırlar

### 2.1 Koda gömülü şirket/proje/marka bilgileri — 🔴 (kurulum maddesinin parçası)

- **Sorun:** Proje adı `talentflow-84bb6`, ön yüz adresi, depolama alanı ve mesaj gönderen kimliği gibi değerler birçok yere yazılı; "Talent-Inn" markası e-posta şablonlarında ve sayfa başlığında sabit.
- **Nerede:** `.firebaserc`, `firebase.json:21` (site adı), `.github/workflows/firebase-deploy.yml:65-71,135` (proje kimliği, uygulama kimliği), `.github/workflows/demo-deploy.yml`, `.replit:73-75`, `functions/routes/email.js:52-149,193-199,366` (marka adı ve yedek adres `https://talentflow-84bb6.web.app`), `index.html:7-9`, `src/pages/ApplyPage.jsx:781` (onay metni "Talent-Inn tarafından"). Marka e-posta/arayüzde `branding` ayarından okunuyor ama yedek değer hep "Talent-Inn".
- **Neden önemli:** Her yeni müşteri için bu dosyalar elle düzenlenmeli; bir tanesi unutulursa müşteri e-postası başka şirketin adresine/markasına işaret eder ya da dağıtım yanlış projeye gider.
- **Nasıl düzelir:** Proje kimliği, site adı, uygulama adresi ve marka adını tek bir ayar dosyasına/ortam değişkenine çıkar; dağıtım iş akışını müşteri başına parametreli hâle getir.
- **Durum:** 🔴 (**orta**)

### 2.2 Yeni müşteri kurulum adımları (bugünkü hâl)

Kodda bütünlüklü bir kurulum rehberi yok. `DEPLOY.md` eski ve yanıltıcı: "Netlify'a `dist` klasörünü sürükle" ve "Vercel" yöntemlerini öneriyor — bunlar yalnızca ön yüzü yayınlar; sunucu (yapay zekâ, e-posta, CV işleme) çalışmaz. Koddan çıkarabildiğim gerçek adımlar:

| Adım | Elle mi? |
|---|---|
| Yeni Firebase/Google Cloud projesi aç, Authentication (e-posta, Google, anonim), Firestore, Storage, Functions'ı etkinleştir | Elle |
| Proje kimliği/adresleri 2.1'deki dosyalarda değiştir | Elle |
| GitHub'da gizli değerleri tanımla: `EMAIL_USER`, `EMAIL_PASS`, `VITE_GEMINI_API_KEY`, `VITE_FIREBASE_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, günlük yapay zekâ tavanları | Elle |
| Müşteri için ayrı Gmail hesabı + "uygulama şifresi" üret | Elle |
| Kuralları ve fonksiyonları dağıt (`firebase deploy`) | Otomatik (GitHub Actions, `main`'e itince) |
| İlk yönetici: `node scripts/grant-super-admin.mjs <e-posta>` — önce o kişi bir kez giriş yapıp kaydı oluşturmalı | Elle (betik) |
| Panelden: Gemini anahtarını gir (Ayarlar → API), izinli e-posta alan adlarını yaz, marka/logo, departmanlar, kaynaklar, Google/Microsoft OAuth bilgileri (Entegrasyonlar) | Elle |
| KVKK saklama süresi ayarı (varsayılan kapalı) | Elle |
| Hizmetin ayakta olduğunu denetle (`/api/health`) | Elle |

- **Nasıl düzelir:** Bu tablo bir kurulum kontrol listesine ve mümkün olduğunca bir betiğe dönüşmeli; bir deneme müşterisiyle baştan sona denenmeli.
- **Durum:** 🔴 (2.1 ile birlikte **orta**)

### 2.3 Açıkta kalan gizli anahtar — 🟡

- **Güncel dosyalarda ve bu klondaki 116 commitlik geçmişte** gerçek bir anahtar, parola veya özel anahtar **bulamadım** (anahtar kalıplarıyla hem güncel dosyalarda hem bütün geçmişte taradım). Gerçek `.env` dosyası depoda değil; `.env.e2e-*` dosyalarındaki değerler açıkça sahte; Firebase "web API anahtarı" gizli sayılmaz (tasarım gereği tarayıcıya gider).
- **Ama:** `.gitignore` içindeki yorum, daha önce `.env.bak` adlı bir dosyanın içinde **gerçek `GEMINI_API_KEY` ve `EMAIL_PASS` ile commit'e girdiğini** söylüyor. Bu klondaki geçmişte o dosyayı bulamadım (geçmiş temizlenmiş olabilir ya da başka bir dalda/kopyada kalmış olabilir). Depo genel (README "Public Prototype" diyor) ise bu anahtarlar yanmış sayılmalı.
- **Nasıl düzelir:** Eski kurulumun Gemini anahtarını ve Gmail uygulama şifresini döndürdüğünü (yenilediğini) doğrula. Yeni müşteri kurulumlarında zaten yeni anahtar üretilecek.
- **Durum:** 🟡 (**küçük**)

### 2.4 Gizli değerlerin tutulma biçimi — 🟡

- **Sorun:** Gemini anahtarı ve Google/Microsoft OAuth gizli anahtarları Firestore'da düz metin olarak duruyor (`artifacts/.../settings/api_keys` ve `settings/integrations`; `functions/routes/admin.js:136-170`, `functions/config/integrations.js`). İstemci okuyamıyor (iyi), ama veritabanı yedeğini/dışa aktarımını okuyan herkes görür.
- **Nasıl düzelir:** Google Secret Manager'a taşı.
- **Durum:** 🟡
- Ayrıca e-posta tek bir Gmail hesabından gidiyor (`EMAIL_USER`/`EMAIL_PASS`, `email.js`): Gmail günlük gönderim sınırı var, müşteri kendi alan adından gönderemiyor ve gelen yanıtlar aynı kutudan okunuyor. 🟡

### 2.5 Depo temizliği — 🟡

- `scripts/legacy/` (115 dosya, 26 MB): eski ekran görüntüleri, yapıştırılmış konsol çıktıları, eski güvenlik kuralları kopyası. Bunlarda iç altyapı bilgisi var (Cloud Run ekranı, proje adı, bir kişi e-postası). `artifacts/mockup-sandbox/` tasarım denemeleri; `dist/` içindeki bazı dosyalar `.gitignore`'a rağmen depoda.
- Müşteriye kod verilecekse ya da depo genelse temizlenmeli. **Durum:** 🟡

---

## 3. Bozulursa: hata izleme, yedek, geri dönüş, otomatik test

| Konu | Bulgu | Durum |
|---|---|---|
| **Hata izleme / alarm** | Hata izleme servisi (Sentry gibi) yok. Sunucu günlükleri Cloud Logging'e yazılıyor (`functions/services/logger.js`, kişisel veri alanlarını gizleyen ayar var) ama kodda alarm kuralı yok. Tarayıcı tarafında hata sınırı beyaz ekranı önlüyor ve hata metnini kopyalatıyor (`src/components/ErrorBoundary.jsx`), ama hatayı kimseye **göndermiyor**; kullanıcı elle iletmeli. Üretimde tarayıcı günlüğü yalnızca "uyarı" düzeyinde. | 🟡 (**küçük**) |
| **Yedek** | Firestore/Storage yedeği ya da geri yükleme prosedürü için kodda, belgede, iş akışında hiçbir iz yok. Firestore'da otomatik zamanlanmış yedek ve "belirli andaki durumu geri yükleme" konsoldan açılabilir; açık olup olmadığını bilmiyorum. | 🔴 (**küçük**; müşteri verisi girmeden önce açılmalı ve bir geri yükleme denenmeli) |
| **Geri dönüş** | Hosting'de önceki sürüme dönmek konsoldan mümkün; kodda yazılı bir geri dönüş adımı yok. Ortam tek: ayrı deneme (staging) ortamı yok, `main`'e her itiş **doğrudan canlıya** gidiyor. | 🟡 |
| **Dağıtım öncesi test kapısı** | Test ve kontroller `ci.yml`'de var (lint, tip kontrolü, birim testler, build, 3 ayrı uçtan uca test), ama canlıya dağıtan `firebase-deploy.yml` bu kontrollere **bağlı değil**: `main`'e itildiği anda, testler kırmızı olsa bile dağıtım çalışır. Dalı koruyan kuralın (testler geçmeden birleştirme yok) GitHub'da açık olup olmadığı kodda görünmez. | 🟡 (**küçük**) |
| **Otomatik test** | 119 test dosyası; sunucu hizmetleri (puanlama, maskeleme, bütçe, saklama süresi, toplu yükleme vb.) iyi kapsanmış; kapsam eşiği %50 ama yalnızca hizmet katmanı için; sayfalar/bileşenler ağırlıkla testsiz. Uçtan uca testler 3 dosya (açılış, giriş, panel; gerçek yapay zekâ/CV yükleme/canlı mülakat akışı **testte yok**, `tests/e2e/smoke.spec.js` yorumu da bunu söylüyor). **Güvenlik kuralları için otomatik test yok** (emülatör testi yalnızca giriş/panel). | 🟢 temel var · 🟡 kural testi yok |
| **Maliyet freni** | Günlük yapay zekâ tavanı var (`functions/services/aiBudget.js`), ama **varsayılan kapalı**; canlıda aylık 2.000 dolarlık tavanın dolup servisin durduğu yazılı. Dağıtım iş akışı tavan tanımlı değilse yalnızca uyarı veriyor. | 🟡 (her müşteri kurulumunda tavan şart koşulmalı) |
| **Ağır işler** | Toplu CV yükleme işçisi, istek karşılayan aynı fonksiyonun içinde çalışıyor (`functions/server.js:123`); bu ortamda istek bitince işlemci kısılır, işler yarım kalabilir. Belgelerde 502 hataları ve çökmelerin bu yüzden yaşandığı yazılı (`docs/PLAN-puanlama-ve-aday-yonetimi.md`); eşzamanlılık düşürülerek hafifletilmiş. Ayrıca yalnızca 5 kopya (`maxInstances: 5`). | 🟡 |
| **Aday listesi tarayıcıda** | İşe alım uzmanı ekranı bütün aday koleksiyonunu tarayıcıya canlı dinleyiciyle indiriyor (`src/context/CandidatesContext.jsx:293-300`). Birkaç yüz adayda sorun yok; binlerce adayda yavaşlar ve Firestore okuma maliyeti artar. | 🟡 |

---

## 4. Kişisel veri (KVKK)

### 4.1 Hangi veri tutuluyor

Aday: ad, e-posta, telefon, LinkedIn adresi, CV metni ve **CV dosyasının kendisi** (Storage), yapay zekâ puanları ve özetleri, mülakat konuşma metni (canlı mülakatta ses kaydından üretiliyor), mülakat değerlendirmeleri, aday ile e-posta yazışmaları, başvuru kaynağı. Personel: ad, e-posta, rol, departman, bağlı Google/Microsoft hesabı jetonları. Sistem: kim hangi adaya baktı kaydı (erişim defteri). Kayıt yolları: `candidates`, `applications`, `interviews`, `infoRequests`, `emailThreads`, `companyIntel` (şirket kurucu adları), `accessLogs`.

### 4.2 Dış yapay zekâ servislerine ne gidiyor

| Ne | Nereye | Maskeleme |
|---|---|---|
| CV metni (ayrıştırma) | Google Gemini | **Var**: ad, e-posta, telefon, LinkedIn, GitHub ayıklanıp `[E-POSTA]` gibi imlerle değiştiriliyor (hem tarayıcıda `src/utils/pii.ts`, hem sunucuda `functions/services/pii.js`). Metin kalıplarına dayalı olduğu için **kusursuz değil**; belge de bunu açıkça yazıyor. |
| Aday profili (puanlama, mülakat soruları, özet) | Google Gemini | Var (`stripPiiForAI`) |
| **Mülakat konuşma metni** (STAR kontrolü, değerlendirme) | Google Gemini | Kodda maskeleme **görmedim**: `src/services/ai/gemini-logic.js` metni olduğu gibi gönderiyor. Adayın kendi konuşması içinde geçen ad/şirket gider. |
| **Canlı mülakat ses kaydı** (parçalar hâlinde) | Google Gemini | **Yok**, ses maskelenemez. Üstelik istem yalnızca yazıya çevirmiyor, **stres/heyecan/güven gibi duygu puanı** da üretiyor (`functions/routes/ai.js:116-130,180-196`). Bu, adayın sesinden duygu çıkarımı; hukuken ayrıca değerlendirilmeli. |
| Şirket adı doğrulaması | Google Gemini + Google Arama | Şirket adları (ve kurucu adları, `companyIntel`) |
| Bütün veri | Google Firebase (ABD sunucuları) | Yurt dışı aktarımı |
| Aday e-postaları | Gmail (Google) | — |

- **Nerede:** `functions/services/gemini.js:421-422`, `src/services/geminiService.js:49-50`, `src/services/ai/gemini-logic.js`, `functions/routes/ai.js`.
- **Neden önemli:** Kullanıcılar "kimlik bilgileri modele gitmez" sözünü yalnızca CV ve profil için verebilir; mülakat konuşması ve ses için veremez.
- **Nasıl düzelir:** Hukuk kararına göre ya mülakat metnine de maskeleme uygula ya da müşteriye açıkça "ses ve konuşma metni Google'a gider" de; duygu puanı özelliğini hukuk onayına kadar kapat.
- **Durum:** 🟡 (müşteri sözleşmesinde açıkça yazılmalı)

### 4.3 Aydınlatma metni ve onay — 🔴

- **Sorun:** Başvuru formunda "KVKK Aydınlatma Metni'ni okudum…" yazıyor ama **gösterilecek bir metin yok**, tıklanabilir bağlantı da yok; belge de bunu doğruluyor (`docs/HUKUK-BIRIMINE-SORULAR.md` madde 3). Onay metni verinin "Talent-Inn" tarafından işleneceğini söylüyor (müşteri şirketin adı değil). Ayrıca sunucu, onay kutusundan bağımsız olarak kayda `kvkkConsent: true` yazıyor; onay anı ve metin sürümü saklanmıyor. Hangi hukuki sebeple (açık rıza mı, meşru menfaat mi) işlendiği de karara bağlanmamış.
- **Nerede:** `src/pages/ApplyPage.jsx:239,363,781`; `functions/routes/positions.js:100`; `src/services/applicationService.js:65`.
- **Neden önemli:** Veri alınmadan önce adaya ne işlendiğini söylemek yasal zorunluluk; müşteri (veri sorumlusu) bu hâliyle üretimi yasal olarak başlatamaz.
- **Nasıl düzelir:** Müşterinin hukuk birimi metni yazar; formda metni göster, onayı ve sürümünü kayda yaz, sunucuda onaysız başvuruyu reddet.
- **Durum:** 🔴 (teknik kısmı **küçük**; metin hukuktan gelir)

### 4.4 Silme yolu — 🔴 (eksik)

- **Var olan:** Süper yönetici için toplu "saklama süresi imhası" (ayarlanabilir süre, varsayılan 6 ay, **varsayılan kapalı**, işe alınanlar korunur, her imha erişim defterine yazılır, CV dosyası da silinir; `functions/services/retention.js`, `functions/routes/admin.js:281-335`).
- **Eksik olan:**
  1. Tek adayı silme yalnızca tarayıcıdan aday belgesini siliyor (`src/context/CandidatesContext.jsx:76-85`); **CV dosyası Storage'da kalıyor**.
  2. Toplu imha da yalnızca aday belgesi ve CV dosyasını siliyor; **mülakat kayıtları** (`interviews`, konuşma metni + yapay zekâ analizi), **başvurular** (`applications`, CV metni dâhil), **bilgi talepleri**, **e-posta yazışmaları**, **toplu yükleme dosyaları** ve şirket önbelleği **silinmiyor**.
  3. Adayın "verimi göster/sil" demesi için kanal tanımlı değil; yasal cevap süresi 30 gün (`docs/HUKUK-BIRIMINE-SORULAR.md` madde 9).
  4. Erişim kaydının ne kadar saklanacağı belirsiz; erişim defteri zorlayıcı değil (tarayıcıdan doğrudan okuma kayıt bırakmayabiliyor, `docs/YETKI-MATRISI.md` "Bilinen sınırlar").
- **Nasıl düzelir:** "Aday sil" işlemini sunucuya taşı; adaya bağlı her kaydı (mülakat, başvuru, bilgi talebi, yazışma, dosyalar) tek işlemde sil; imha da aynısını yapsın; aday talepleri için bir e-posta adresi ve süreç tanımla.
- **Durum:** 🔴 (**orta**)

### 4.5 Hukuk tarafında açık konular (kodla çözülmez) — 🔴 müşteri sözleşmesi için

`docs/HUKUK-BIRIMINE-SORULAR.md`'de on soru listelenmiş ve çoğu cevapsız: yurt dışına aktarım için standart sözleşme ve Kurul bildirimi (belge: "bildiğimiz kadarıyla yapılmadı"), Google ile veri işleme sözleşmeleri, VERBİS kaydı, geçmişte kapatılan açığın (giriş yapmadan mülakat kayıtları ve **bütün CV dosyalarının** okunabilmesi) ihlal bildirimi gerektirip gerektirmediği, ihlal olursa kim ne yapacak planı. Müşteri açıldığında veri sorumlusu müşteri, siz veri işleyen olursunuz: müşteri başına bir **veri işleme sözleşmesi** de gerekecek.

### 4.6 Repoda gerçek kişi verisi var mı — 🟢 (büyük ölçüde temiz)

- Aday CV'si, telefon numarası, kimlik numarası, gerçek aday listesi **bulamadım**: demo veri seti açıkça uydurma (`scripts/demo-seed/dataset.mjs` başındaki not), mockup dosyalarındaki adlar kurgusal, testler sahte veriyle çalışıyor, CV/PDF/Excel dosyası depoda yok.
- Kişi bilgisi olarak yalnızca geliştiricinin adı ve kurumsal e-postası (commit yazarı, `scripts/grant-super-admin.mjs` örnek komutu, eski kurallar kopyası `scripts/legacy/attached_assets/`) var.
- **Sınır:** `scripts/legacy/attached_assets/` altındaki yüze yakın dosyadan (çoğu ekran görüntüsü) yalnızca iki görsele baktım (başvuru formu ekranı ve Cloud Run ayar ekranı; aday verisi yok); geri kalanı tek tek incelemedim. Canlı sistemden alınmış ekran görüntüsü olabileceği için silmeden önce göz atılmalı.

### 4.7 Tamam olan kısımlar — 🟢

Erişim defteri (kim hangi adayı/CV'yi gördü, dışa aktarma) yalnızca eklenebilir, değiştirilemez/silinemez; CV dosyalarına anonim erişim ve klasör listeleme kapatılmış; saklama süresi mekanizması hazır (açık değil); yapay zekâya giden CV'den kimlik bilgisi ayıklanıyor; `docs/YETKI-MATRISI.md` kimin neyi gördüğünü ve sınırlarını dürüstçe yazıyor.

---

## 5. Ürün olgunluğu

### 5.1 Baştan sona çalışan ana akış

Belgelerde "yazıldı" denen ve koddaki sayfalardan doğrulanan akış (ben çalıştırıp denemedim):

1. Yönetici daveti ile personel kaydı → rol/departman atama.
2. **İlan açma** (Pozisyonlar; gereksinim maddeleri, yapay zekâ ile taslak).
3. Aday **başvuru sayfası** (`/apply/:ilan`) → CV yükleme → CV'den yapay zekâ ile ayrıştırma ve ön puan.
4. Aday havuzu: tek tek ekleme, **toplu CV yükleme** (ZIP/PDF/DOCX), mükerrer tarama, filtre/kıyas.
5. Yapay zekâ analizi: pozisyon uyumu puanı, STAR analizi, **CV doğrulama** (şirket/tarih tutarlılığı).
6. Mülakat: plan ve soru üretimi, takvim, **canlı mülakat** (görüntülü + canlı yazıya çevirme), yüz yüze mülakat, elle mülakat girişi.
7. Mülakat raporu → karar, adaya **geri bildirim e-postası**, bilgi talebi e-postası.
8. Panel/analitik, İK Asistanı (sohbetle sorgulama), tanıtım sayfası, demo modu.

Otomatik testlerin kapsadığı kısım dar (bkz. 3. bölüm): bu akışın yapay zekâ, CV yükleme ve canlı mülakat adımları otomatik uçtan uca testte yok.

### 5.2 Yarım kalan / sahte / henüz olmayan

| Ne | Durum |
|---|---|
| Entegrasyonlar sayfasında Slack, LinkedIn, Greenhouse/Workday | Yalnızca "Yakında" kartı; arkasında kod yok (`src/pages/IntegrationsPage.jsx:644-690`) |
| LinkedIn'den aday çekme | Bilinçli olarak kaldırıldı (`docs/PLAN-cv-dogrulama.md`) |
| İK Asistanı | Faz 0,1,2,4,5 yazıldı; pozisyon teşhisi, yetkinliğe göre sorgu, benzer ilan karşılaştırması, öğrenme katmanı **kapsam dışı/yapılmadı** (`docs/PLAN-ik-asistani.md`) |
| `docs/PLAN-canli-mulakat-revizyon.md` | "Uygulama bekliyor" yazıyor; kodda mikrofon/kamera kapatma düzeltmesi var gibi (`LiveInterviewPage.jsx:513,518`) — belge eski kalmış olabilir; canlı denemeyle doğrulanmalı (bu, adayın "kapattım" dediği hâlde sesin gitmesi gibi gizlilik sorunu olduğu için önemli) |
| Tanıtım ekranları ve demo havuzu | Tamamen uydurma veri (`scripts/demo-seed/dataset.mjs`); gerçek müşteri verisi değil, bilerek öyle |
| `artifacts/mockup-sandbox/` | Tasarım denemeleri (sahte verili); ürünün parçası değil |
| Eski belgeler | `README.md` "Public Prototype / portföy projesi" diyor; `docs/TECHNICAL.md` Mart 2026 tarihli, "Puppeteer kazıma" gibi kaldırılmış özellikleri anlatıyor; `DEPLOY.md` yanlış yönlendiriyor |
| Birden fazla müşteri | **Yok** (bkz. 1.1) |
| Sözleşme/fatura, kullanım ölçümü, müşteri paneli, e-posta alan adı kurulumu | Yok (ürün değil iş süreci; ama müşteriye vermeden önce cevabı olmalı) |

### 5.3 Gerçek bir kullanıcı bugün ne yapabilir, ne yapamaz

**Yapabilir (tek bir şirketin içinde):** Davetle hesap açıp giriş yapar; ilan açar; adaylardan CV toplar ya da toplu yükler; yapay zekâ puanı ve doğrulama raporu görür; mülakat planlar, canlı/yüz yüze mülakat yapar, rapor alır; adaya e-posta ile geri bildirim/bilgi talebi gönderir; Google/Microsoft takvimine mülakat yazar; kimin neye baktığını süper yönetici olarak görür.

**Yapamaz / güvenle yapamaz:**
- İkinci bir şirketi aynı kuruluma almak.
- Adayın verisini silme/dışa aktarma talebini tek işlemle yerine getirmek (4.4).
- Adaya yasal aydınlatma metni göstermek (4.3).
- Kendi alan adından e-posta göndermek; müşteri başına ayrı gönderen kimliği.
- Yedekten geri dönmek (bilinmiyor).
- Departman yöneticisini, kendi departmanı dışındaki mülakat kayıtlarından gerçekten ayırmak (1.4).
- Entegrasyonlar sayfasındaki Slack/LinkedIn/ATS'i kullanmak.

---

## Öncelik sırası (öneri)

1. **Önce karar:** ilk iki müşteri için "ayrı kurulum" yolunu seç (kod buna daha yakın); bu, 1.1'i **orta** büyüklüğe indirir.
2. **Bu hafta (küçük işler):** e-posta uçlarını rol kontrolüne bağla (1.2); yedeği aç ve bir geri yükleme dene (3); aydınlatma metni alanı + sunucuda onay doğrulaması (4.3); `.env.bak` kaynaklı anahtarların döndürüldüğünü doğrula (2.3).
3. **İlk müşteriden önce (orta işler):** jetonları kullanıcı kaydından çıkar (1.3); departman sınırını mülakat/bilgi talebi/mesaj kayıtlarına uzat (1.4); tam silme + aday talep kanalı (4.4); sabit değerleri ayara çıkar ve kurulum kılavuzunu bir deneme müşterisiyle sına (2.1–2.2); hukuk maddelerini (4.5) müşteri sözleşmesine bağla.
4. **İlk ay (🟡):** hata izleme + alarm, dağıtım öncesi test kapısı + deneme ortamı, yazma kapılarını sıkılaştırma, Secret Manager, hız sınırını paylaşılan hâle getirme, ağır işleri ayrı çalıştırma, depo temizliği.

---

*Bu rapor yalnızca okuma ile hazırlandı; depoda bu dosya dışında hiçbir değişiklik yapılmadı.*
