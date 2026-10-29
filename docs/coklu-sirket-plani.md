# Clyro Talent — çok şirketli (multi-tenant) geçiş planı

> Durum: **plan** (kod değişikliği yok). Tarih: 2026-10-28 (K1–K12 kararlarıyla güncellendi). Kaynak: `origin/main` @ `697ea53`.
> Bağlam: Hub-Inn `docs/ROADMAP.md` → "Tam yayına hazırlık" → "Kiracıların uygulamalarda ayrılması"
> ("TalentFlow tek şirketlik: veri her şirket için ayrılır, mevcut veri taşınır") ve DECISIONS X6/X9.
> Bu belgede **tenant = şirket = Hub çalışma alanı**. Tenant kimliği olarak Hub'daki `tenants.id` (UUID) kullanılır.

---

## 0. Özet

> **2026-10-28 güncellemesi (K10, Emre):** Talent'ta bugün gerçek veri yok, yalnız test/demo verisi var.
> **Veri taşınmaz;** tenant yolları boş başlar, eski ortak yol dondurulur ve temizlenir. Taşıma provası, bakım penceresi
> ve iki yolu birden destekleyen "veri kökü çözücü" plandan çıkarıldı.
>
> **Tüm açık kararlar verildi (K1–K12, 2026-10-28, Emre; §7).** Öne çıkanlar: Talent yalnız Hub'dan açılır, Talent'ın
> kendi daveti ve alan adıyla kaydı kalkar; deneme bitince 14 gün salt okunur; aday e-postaları `noreply@clyrolabs.com`;
> şirket başına günde 2M token; destek erişimi admin konsolundan süreli destek üyeliğiyle.

- **Model:** yol tabanlı — her şirketin verisi `tenants/{tenantId}/…` altında. Yetki kaynağı
  `tenants/{tenantId}/members/{uid}` üyelik belgesi (rol + departmanlar). Kurallar her eşleşmede bu belgeye bakar.
- **Hub köprüsü:** kod değişimi tarayıcıdan değil **Talent sunucusundan** yapılır (Signals'taki desen). Hub, kodun
  ait olduğu tenant'ı ve Hub rolünü sunucuya döner; Talent sunucusu tenant + üyelik belgesini yazar. Firebase jetonuna
  yetki taşıyan özel talep (custom claim) **eklenmez**.
- **Geçiş:** iş bir entegrasyon dalında birikir, `main`'e tek birleştirmeyle geçilir (kurallar + kod birlikte). Eski
  ortak yol aynı anda kurallarda kapanır; ilk şirket (Emre) Hub'dan ilk girişte boş alanla başlar. Geri dönüş = birleştirme
  commit'ini geri almak.
- **Maliyet:** Gemini kullanım ölçümü ve fren tenant başına; anonim (aday) AI çağrıları tenant'a bağlanır.
- **Yayın öncesi zorunlu:** PR 0–8'in tamamı (bkz. §6).
---

## 1. Envanter

Kısaltma: `D = artifacts/talent-flow/public/data`. "Kapsam" sütunu hedef modeldeki yerini gösterir:
**T** = şirkete ait (tenant altında yeniden başlar), **P** = platforma ait (global kalır), **U** = kullanıcıya ait ama şirket
içinde tutulur.

### 1.1 Firestore koleksiyonları

| Yol | Kural (firestore.rules) | Yazan / okuyan (örnek yerler) | Kapsam | Not |
|---|---|---|---|---|
| `D/candidates` | 142–167 | `src/context/CandidatesContext.jsx:49,143,252,270`, `src/services/firestoreService.js:16`, `src/pages/PositionsPage.jsx:127,169`, `functions/routes/cv.js:214–227`, `functions/routes/interview.js:51,173,706,939`, `functions/services/bulkWorker.js:353,359,689`, `functions/routes/maintenance.js:38,129,163,270,350,377,396,429`, `functions/routes/admin.js:225,297` | T | Mülakat oturumları aday belgesinde gömülü (`interviewSessions[]`). `GET /api/session/:id` **tüm adayları tarıyor** (`interview.js:51`) → tenant'lı modelde hem maliyet hem sızıntı riski. Mükerrer kontrolü (`cv.js:219,227`, `bulkWorker.js:353,359`) bugün tüm havuzda e-posta/telefon arıyor → tenant'a daraltılmazsa **başka şirketin adayını "mükerrer" diye ifşa eder**. |
| `D/positions` | 119–122 (`read: if true`) | `src/context/PositionsContext.jsx:18–159`, `src/pages/ApplyPage.jsx:105`, `src/pages/DepartmentManagementPage.jsx:117,168`, `functions/routes/positions.js:55` (REST + web anahtarı), `functions/routes/interview.js:500`, `bulkWorker.js:579`, `maintenance.js:180,265,342` | T | Bugün **liste dahil herkese açık** (kapalı ilanlar da). Tenant'lı modelde yalnız `status=='open'` tekil `get` açık olmalı. |
| `D/applications` | 126–129 (`create: if true`) | `src/pages/ApplyPage.jsx:385,399`, `src/services/applicationService.js:50–111`, `functions/routes/positions.js:75,105` | T | Anonim oluşturma; hedef tenant'ı **sunucu** belirlemeli. |
| `D/users` (+ `settings/preferences`, `assistantChats`, `assistantFeedback`, `assistantReviews`) | 181–205 | `src/context/AuthContext.jsx:27,130,168,352`, `src/context/UserSettingsContext.jsx:38,82`, `src/services/assistantChatStore.js:24`, `assistantFeedback.js:33`, `interviewReviewCache.js:37`, `src/pages/SuperAdminPage.jsx:65,114,136,247`, `DepartmentManagementPage.jsx:49,112,186`, `functions/middleware/auth.js:63`, `functions/routes/users.js:49,83` | T (üyelik) + U (alt koleksiyonlar) | Rol ve departman burada; kurallar `getUserProfile()` ile okuyor. Hedefte `tenants/{t}/members/{uid}`. `create` kuralı (185–191) istemcinin kendine profil yazmasına izin veriyor → hedefte **kaldırılır**, üyeliği yalnız sunucu yazar. |
| `D/invitations` | 112–115 | `src/pages/SuperAdminPage.jsx:68,106,116,167`, `functions/routes/auth.js:272,293–301` (kimliksiz `invitation-lookup`), `functions/routes/email.js:172` (`send-invite`) | — | **Kaldırılır** (K3): üyelik yalnız Hub'dan gelir; Hub hesabı olmayan kişi Hub'a davet edilir. |
| `D/departments` | 220–223 | `DepartmentManagementPage.jsx:45,93,128,178`, `PositionsPage.jsx:107,1263`, `SuperAdminPage.jsx:53`, `CandidatesTablePage.jsx:191` | T | |
| `D/sources` | 228–231 (anonim okur) | `ApplyPage.jsx:131`, `SourceManagementPage.jsx:59–160`, `CandidateDrawer.jsx:70`, `BulkUpdateModal.jsx:41`, `CandidatesContext.jsx:328` | T | Başvuru formu açılır listesi; anonim okuma tenant'a bağlı kalmalı. |
| `D/settings/system` | 261–268 | `AuthContext.jsx:178,297` (`allowedDomains`), `SuperAdminPage.jsx:79,152`, `functions/routes/admin.js:35,228,267` (saklama süresi) | T | `allowedDomains` bugün global: **herhangi bir şirketin alan adı tüm sistemi açar.** Hedefte `allowedDomains` **kaldırılır** (K4); saklama süresi tenant ayarı olarak kalır. |
| `D/settings/branding`, `emailTemplates` | 261–268 | `BrandingSettingsPage.jsx:13,41,74`, `src/services/orgProfile.js:26`, `EmailTemplateEditorPage.jsx:474–595`, `src/utils/templateService.js:9,18`, `CandidateProcessPage.jsx:175`, `InterviewManagementPage.jsx:425` | T | |
| `D/settings/api_keys` | 258–268 (istemciye kapalı) | `functions/services/gemini.js:119`, `functions/routes/admin.js:33,138,158` | **P** | Platformun Gemini anahtarı. İleride "kendi anahtarını getir" istenirse `tenants/{t}/secrets/ai` (sunucuya özel). |
| `D/settings/integrations` | 258–268 | `functions/config/integrations.js:14`, `functions/routes/admin.js:32,76–122` | **P** | Google/Microsoft OAuth uygulama bilgisi (tek uygulama, Google doğrulaması X8). Yönetimi platform yöneticisine geçer. |
| `D/integrationSecrets/{uid}` | 213–215 (kapalı) | `functions/services/integrationTokens.js:24–25` | T/U | Kullanıcının şifreli Gmail/Graph jetonları. Bir kişi iki şirkette olabilir → `tenants/{t}/integrationSecrets/{uid}` (şirket başına ayrı bağlantı). |
| `D/infoRequests` | 280–284 (`get: true`) | `functions/routes/email.js:381,444,654`, `CandidateRespondPage.jsx:34`, `CandidateProcessPage.jsx:521,817`, `MessagesPage.jsx:98,137` | T | Aday bağlantısı kimlikle açılıyor → genel bağlantı çözücüsü gerekir (§2.5). |
| `D/emailThreads` | 288–290 | `MessagesPage.jsx:153,193`, `InterviewManagementPage.jsx:884` | T | |
| `D/messageQueue` | 296–299 | `src/context/MessageQueueContext.jsx:11,21`, `src/services/messageQueueService.js:16–185` | T | Bugün **her iç kullanıcı tüm kuyruğu okuyor.** |
| `D/participantInvites` | 305–308 | `InterviewManagementPage.jsx:66,246,1259,1444,1474` | T | `array-contains` sorgusu. |
| `D/bulkImportJobs` (+ `items`) | 313–321 | `functions/services/bulkWorker.js:36,391,433,553,773`, `functions/routes/bulk.js:168,188`, `maintenance.js:30,66–67,313,493`, `CandidateProcessPage.jsx:243,313` | T | Arka plan işçisi **tüm** kuyruğu yokluyor (`bulkWorker.js:391`) → collection group sorgusu + iş belgesinde `tenantId`. |
| `D/companyIntel` | 243–247 | `src/services/companyIntelStore.js:26–189` | **P** | **Platformda ortak** (K6): `platform/companyIntel/{id}`, yalnız herkese açık kaynak bilgisi (ticaret sicili vb.). İstemci doğrudan okumaz; sunucu ucu üzerinden. Hangi şirketin hangi firmayı sorguladığı önbellekte tutulmaz (yan kanal yok). |
| `D/accessLogs` | 342–347 | `src/services/accessLog.js:36,72`, `functions/routes/admin.js:37,318` | T | Denetim defteri; şirket yöneticisi kendi defterini okur. Platform için ayrıca sunucu kaydı. |
| `D/usage/{day}` | kural yok (varsayılan red, yalnız Admin SDK) | `functions/services/usage.js:101`, `functions/services/aiBudget.js:102`, `functions/routes/admin.js:34,189` | T + P | Tenant başına ölçüm + platform toplamı (§5). |
| `interviews/{sessionId}` (**kök**) | 371–384 (`get: true`) | `LiveInterviewPage.jsx:359–1101`, `FaceToFacePage.jsx:265–467`, `Dashboard.jsx:139,651`, `PipelinePage.jsx:287`, `InterviewManagementPage.jsx:222`, `InterviewReportPage.jsx:102`, `CandidateDrawer.jsx:833`, `CandidatesContext.jsx:168`, `interviewReviewLoader.js:84`, `salaryBackfillStore.js:65,119`, `CandidateRespondPage.jsx:40`, `functions/routes/interview.js:123–135` (kimliksiz `init-interview-session`) | T | Bugün `list` her iç kullanıcıya açık: Dashboard/Pipeline **tüm mülakatları** dinliyor. |

Ek gözlemler:
- Depoda `firestore.indexes.json` yok; sorgular tek alan/eşitlik ağırlıklı (`where`+`orderBy` aynı alanda). Varsa
  konsoldan elle açılmış bileşik indeksler önce `firebase firestore:indexes` ile dışa alınıp repoya konmalı.
- `collectionGroup` kullanımı yok.
- `scripts/grant-super-admin.mjs` hem `token.role` talebini hem profil rolünü yazıyor; kurallar `token.role`'e güveniyor
  (`firestore.rules:34,41`, `storage.rules:102`). **Firebase Auth Hub ve CX ile ortak** (`functions/index.js:9–13`):
  global bir `role` talebi tüm uygulamalarda geçerli bir kimlik verisi demek. Hub bu yüzden jetona talep eklemiyor
  (Hub-Inn `apps/api/src/auth/firebase.ts:51–54`).
- `DELETE /api/admin/auth-user/:uid` (`functions/routes/admin.js:39–51`) Firebase Auth kullanıcısını **siliyor**. Ortak
  Auth'ta bu, kişinin Hub/CX hesabını da siler. Tenant'lı modelde şirket yöneticisi yalnız **üyeliği** kaldırabilir.

### 1.2 Storage yolları (`storage.rules`)

| Yol | Kural | Yazan | Kapsam | Hedef |
|---|---|---|---|---|
| `cvs/{file}`, `cvs/{id}/**` | 41–54 (her iç kullanıcı okur) | `src/components/AddCandidateModal.jsx:210–213`; silme `functions/routes/admin.js:292–307` | T | `tenants/{t}/cvs/**` |
| `bulk-imports/{uid}/**` | 68–77 | `src/services/bulkStorageUpload.js:59`; okuma/silme `bulkWorker.js:523,535`, `functions/services/bulkSources.js` | T | `tenants/{t}/bulk-imports/{uid}/**` |
| `branding/{file}` | 98–105 (yazma `token.role`) | `src/pages/BrandingSettingsPage.jsx:60` | T | `tenants/{t}/branding/**` |
| `avatars/{uid}/**` | 109–116 | (kullanıcı) | U (kişiye ait, şirketler arası ortak kalabilir) | değişmez |

Not: CV'ye kayıttaki `getDownloadURL` adresiyle ulaşılıyor (`cvUrl`). İndirme jetonlu adresler **kuralları atlar**;
tenant ayrımı yalnız adresi bilmeyenler için geçerli. Hedefte yeni dosyalar için jetonlu adres yerine kural denetimli
`getBlob`/kısa süreli imzalı adres (sunucudan) önerilir (PR 6).

### 1.3 Cloud Functions

Tek fonksiyon: `talentflowApi` (`functions/index.js`), Express (`functions/server.js:98–111`). Zamanlanmış iş ya da
Firestore tetikleyicisi yok; toplu içe aktarma işçisi süreç içinde döngü (`server.js:132`).

| Uç grubu | Kimlik | Tenant etkisi |
|---|---|---|
| `/api/admin/*` (`admin.js`) | `requireAuth(['super_admin'])` | İkiye ayrılır: **şirket yöneticisi** (saklama, kullanım, denetim defteri — kendi tenant'ı) ve **platform yöneticisi** (API anahtarı, OAuth uygulaması — global). |
| `/api/maintenance/*` | `requireAuth(ROLES)` | Tüm sorgular tenant köküne. |
| `/api/process-cv`, `/api/direct-add`, `/api/check-duplicate` (`cv.js`) | `requireAuth()` | Mükerrer kontrolü tenant içinde. |
| `/api/bulk-import*` (`bulk.js`) + işçi | `requireAuth()` | İş belgesi tenant altında; işçi collection group ile alır. |
| `/api/ai/*`, `/api/gemini-stt`, `/api/score-screening-answers` | `verifyFirebaseToken` (**anonim dahil**) | Anonim çağrı hangi tenant'ın bütçesinden? → oturum/ilan üzerinden sunucu çözer; serbest istemli (`prompt`) anonim çağrı kapatılır. |
| `/api/session/:id`, `/api/init-interview-session`, `/api/update-candidate-status` (`interview.js`) | kimliksiz + `sessionLimiter` | Genel bağlantı çözücüsüyle tenant bulunur. |
| `/api/positions/:id`, `/api/applications` (`positions.js`) | kimliksiz, REST + web anahtarı | Tenant yolu + bağlantı çözücü. |
| `/api/send-*`, `/api/candidate-respond`, `/api/check-info-replies` (`email.js`) | karışık | Gönderen SMTP hesabı (`EMAIL_USER`) bugün **global**. Hedef (K7): `noreply@clyrolabs.com`, gönderen adı şirket adı, yanıt adresi (`Reply-To`) işe alımcı. `send-invite` kaldırılır (K3). |
| `/api/google/*`, `/api/auth/*` (OAuth) | `requireAuth()` / `verifyFirebaseToken` | Jeton deposu tenant altında. |
| `/api/users` (`users.js:47`) | `requireAuth()` | Bugün **tüm kullanıcıları** döner → tenant üyeleri. |
| `requireAuth` (`middleware/auth.js:56–76`) | — | Rolü `D/users/{uid}`'den okuyor → `tenants/{t}/members/{uid}`; `req.tenant` eklenir. |

### 1.4 İstemci tarafı giriş/kayıt

- `src/context/AuthContext.jsx:160–220`: profil yoksa izinli alan adı ya da davetle istemci **kendi profilini yazıyor**. Hedefte iki akış da kalkar (K3, K4).
- `src/pages/HubLaunchPage.jsx:14–42`: kodu tarayıcıdan Hub'a gönderip özel jeton alıyor; Hub yalnız
  `{token, email}` dönüyor (Hub-Inn `apps/api/src/routes/apps.ts:86–89`), **tenant bilgisi dönmüyor** (oysa
  `app_launch_codes.tenant_id` Hub'da kayıtlı, `apps.ts:38`).
- Gemini istemciden doğrudan yalnız `src/pages/SettingsPage.jsx:13`'te (anahtar deneme ekranı) kullanılıyor; hedefte
  kaldırılır (anahtar zaten platformda).

---

## 2. Hedef model

### 2.1 Seçenekler

| Ölçüt | A) Yol tabanlı `tenants/{t}/…` | B) `tenantId` alanı + kurallar |
|---|---|---|
| Kural zorlaması | Eşleşme `match /tenants/{t}/{coll}/{id}` — tenant yolun parçası; her alt eşleşmede tek `isMember(t)` yeter. Liste sorgusu başka tenant'a **yapısal olarak** ulaşamaz. | Her kuralda `resource.data.tenantId == myTenant()` + her `create/update`'te `request.resource.data.tenantId` değişmezliği. Unutulan tek koşul = sızıntı. Liste kuralı istemcinin `where('tenantId')` koymasını zorunlu kılar (bugünkü departman kuralı gibi), ama `myTenant()` için yine üyelik okuması gerekir. |
| Sunucu (Admin SDK, kuralları atlar) | Tenant'sız yol eski köke gider; eski kök kapalı ve boş → **güvenli hata**. | Unutulan `where('tenantId')` → **tüm şirketlerin verisi** döner. Sunucuda koruma yalnız disipline kalır. |
| Sorgu maliyeti | Ek okuma yok; koleksiyonlar küçük kalır. | Her sorguya ek eşitlik filtresi; okuma sayısı aynı. |
| İndeksler | Bileşik indeks koleksiyon kimliğine bağlıdır (`candidates`), üst yoldan bağımsız → **mevcut indeksler aynen çalışır.** Yalnız sunucu işçisi için 1–2 collection group indeksi. | `tenantId` + `orderBy` / `array-contains-any` / `in` kombinasyonları için yeni bileşik indeksler (sources `orderBy createdAt`, candidates `department in`, `visibleToDepartments array-contains-any`, applications `positionId+email` …). |
| Storage | `tenants/{t}/cvs/**` — kural yoldaki `t` ile `firestore.exists(.../members/uid)` | Storage'da alan yok; yine yol tabanlı olmak zorunda → iki model karışır. |
| Şirket silme / dışa aktarma (KVKK, ayrılan müşteri) | `recursiveDelete(tenants/{t})` tek çağrı; dışa aktarma betikle tek ağaç. | Her koleksiyonda `where tenantId` ile tarama-silme. |
| Geçiş | Veri taşınmadığı için (K10) yeni yollar boş başlar; eski kök kapatılıp silinir. Taşıma gerekseydi de kopyala → çevir ile eski veri dokunulmadan kalırdı. | Yerinde alan ekleme; geri dönüşte ayırt etmek zor; indeksler hazır olmadan sorgular kırılır. |
| Hub köprüsü | Tenant kimliği = Hub UUID = yol parçası; hata ayıklaması kolay. | Aynı. |
| Dezavantaj | Tüm yol sabitleri değişir (geniş ama mekanik diff); kök `interviews` tenant altına alınır; genel bağlantılar için çözücü gerekir. | Diff daha küçük görünür ama her sorgu/kural elden geçer; risk dağınık. |

### 2.2 Öneri: A (yol tabanlı) + üyelik belgesi

```
tenants/{tenantId}                      # ad, durum (trial|active|readonly|closed|suspended), writeUntil, readUntil, plan, aiLimits, hubSyncedAt
tenants/{tenantId}/members/{uid}        # role (admin|recruiter|department_user|support), departments[], status, hubRole, email, expiresAt? (destek)
tenants/{tenantId}/candidates|positions|applications|departments|sources|settings|
                   infoRequests|emailThreads|messageQueue|participantInvites|bulkImportJobs(/items)|
                   accessLogs|usage|interviews|integrationSecrets
tenants/{tenantId}/members/{uid}/preferences|assistantChats|assistantFeedback|assistantReviews
userTenants/{uid}                       # {tenants: {<t>: {name, role}}} — yalnız sunucu yazar; şirket seçici için
publicLinks/{linkId}                    # {tenantId, kind: position|interview|infoRequest|participant, targetId} — yalnız sunucu yazar
platform/config, platform/secrets       # api_keys, integrations (OAuth uygulaması), global AI tavanı — istemciye kapalı
platform/companyIntel/{id}              # ortak şirket bilgisi önbelleği (K6) — yalnız sunucu
platformUsage/{day}                     # tüm şirketlerin toplamı
```

**Tenant ve rol nasıl öğrenilir — custom claims mı, üyelik belgesi mi?**

| | Özel talep (`tid`, `role` jetonda) | Üyelik belgesi (öneri) |
|---|---|---|
| Kural maliyeti | 0 okuma | İstek başına 1 `get` (istek içinde önbellekli; bugün de `users/{uid}` okunuyor → **net değişim yok**) |
| İptal / rol değişimi | Jeton yenilenene kadar (≤1 saat) eski yetki; `revokeRefreshTokens` gerekir | Anında |
| Birden çok şirket | Talep 1000 bayt sınırı; "etkin şirket" için jeton yeniden basılmalı | Doğal: yol hangi tenant'sa onun üyeliği |
| Ortak Firebase Auth | `setCustomUserClaims` kullanıcıya **global** yazılır, Hub/CX'e de taşınır; Hub talep basarsa Talent'ta yetki yükseltir (Hub bunu bilerek yapmıyor) | Talent'a özgü, başka uygulamayı etkilemez |

Karar: **yetki yalnız üyelik belgesinden.** Jetondaki `role` talebine güven kaldırılır (break-glass dahil; platform
yöneticisi sunucuda e-posta listesiyle — Hub'daki `PLATFORM_ADMIN_EMAILS` deseni — ve tenant verisini **üye olmadan
göremez**). İleride okuma maliyeti sorun olursa `tid` talebi yalnız *ipucu* olarak eklenebilir; kural yine üyeliği okur.

**Etkin şirket:** URL'de değil, istemci durumunda (`TenantContext`; `userTenants/{uid}` listesinden, son seçilen
`localStorage`'da). Hub'dan gelişte Hub'ın gönderdiği tenant seçilir. Tek şirketi olan kullanıcı seçici görmez.

### 2.3 Hub köprüsü (değişecek akış)

Bugün: tarayıcı → Hub `/api/apps/exchange` → `{token}` → `signInWithCustomToken`. Tenant kaybolur.

Hedef (Signals deseniyle aynı, Hub DECISIONS 2026-10-27):

1. Hub `/hub-giris#code=…` ile açar (değişmez).
2. Talent tarayıcısı kodu **Talent sunucusuna** gönderir: `POST /api/hub/exchange {code}`.
3. Talent sunucusu Hub'a sunucudan sunucuya çağırır: `POST {HUB}/api/apps/exchange {app:'talent', code}`;
   kimlik: Talent çalışma hesabının (`talentflow-runtime@`) Google OIDC kimlik jetonu (Hub `aud` + hesap e-postasını
   doğrular) — Origin başlığına güvenilmez (Hub `apps.ts:50–52` zaten bunu söylüyor).
4. Hub yanıtı: `{firebaseUid, email, tenant: {id, name, status, trialEndsAt, apps}, hubRole}` (+ isterse `token`).
   Hub'ın tarafı: launch kaydındaki `tenantId` + üyelik + "Talent bu alanda açık mı" denetimi (Hub-Inn PR'ı).
5. Talent sunucusu tek koşullu yazımla `tenants/{id}` (yoksa oluşturur) ve `members/{uid}` (Hub rolü → Talent rolü
   eşlemesi, bkz. K2) belgelerini günceller, `userTenants/{uid}`'e ekler; özel jetonu döner (Hub basmaya devam eder ya da
   Talent hesabı `serviceAccountTokenCreator` ile kendi basar — Talent basarsa Hub'a jeton hiç gitmez, öneri bu).
6. İstemci `signInWithCustomToken` → `TenantContext` Hub'ın tenant'ını seçer.

Hub'da üyelik kaldırılınca: Hub, Talent'a `POST /api/hub/membership-revoked` (aynı OIDC kimliği) gönderir; Talent
üyeliği `status: removed` yapar. Ek güvence: her Hub girişinde senkron + günlük mutabakat (Hub'dan liste). Deneme süresi
biten tenant (K5): Hub'dan senkronla `writeUntil = trialEndsAt` ve `readUntil = trialEndsAt + 14 gün` yazılır;
`writeUntil` geçince kurallar ve sunucu yazmayı reddeder (402, salt okunur bant), `readUntil` geçince okuma da kapanır.
Ücretli plana geçişte Hub iki alanı ileri alır.

**Destek üyeliği (K11):** platform yöneticisi şirket verisini üye olmadan göremez. Destek gerektiğinde **admin
konsolundan** (Hub ROADMAP "Admin ekranı") gerekçe yazılarak istenir; konsol Talent'a `POST /api/hub/support-access`
(OIDC) gönderir; Talent `members/{uid}` belgesini `role: support` (salt okunur), `expiresAt = şimdi + 24 saat` ile yazar.
Kurallar `expiresAt`'i kendisi denetler (süre dolunca erişim kendiliğinden kapanır; temizlik ayrıca silinir). Açılış,
kapanış ve destek kullanıcısının her okuması tenant `accessLogs`'una ve Hub denetim kaydına düşer; şirket yöneticisi
kendi defterinde görür.

### 2.4 Talent'ın kendi girişleri

- **Talent yalnız Hub'dan açılır** (K3). Talent'ın kendi giriş/kayıt ekranı Hub'a yönlendirir; e-posta/şifre ve
  Google ile doğrudan giriş kapanır (aday tarafının anonim oturumu hariç).
- **İzinli alan adıyla kendiliğinden kayıt kaldırılır** (K4; global `allowedDomains`).
- **Talent'ın kendi daveti kaldırılır** (K3): `invitations` koleksiyonu, `POST /api/auth/invitation-lookup`,
  `POST /api/send-invite`, SuperAdmin davet ekranı. Hub hesabı olmayan kişi (ör. departman yöneticisi) Hub'a davet
  edilir; departman ataması Talent'ta yönetici tarafından yapılır.
- Üyelik belgesini yalnız sunucu yazar (Hub senkronu, destek erişimi, yönetici ekranının departman/rol API'si).
  İstemcinin profil/üyelik yazması tamamen kapanır. Yeni şirket yalnız Hub'dan açılır.

### 2.5 Herkese açık bağlantılar (aday tarafı)

`/apply/:positionId`, `/live-interview/:sessionId`, `/join/:id`, `/respond/:id`, `/interview-report/:id` bugün yalnız
kimlik taşıyor. Hedef:
- Sunucu, oluşturma anında `publicLinks/{rastgele 128 bit}` yazar → `{tenantId, kind, targetId}`.
- Aday sayfası önce `GET /api/public/resolve/:linkId` (hız sınırlı) ile tenant'ı ve hedefi alır; sonra
  `tenants/{t}/…/{targetId}` tekil `get` yapar (kural: `kind`'e göre ilgili alanlar).
- **Eski bağlantılar çalışmaz** (test verisine aitler, K10); `publicLinks` yalnız yeni kayıtlar için yazılır.
- Anonim aday `candidates`'e doğrudan `create` yapamaz (bugün `firestore.rules:143` izin veriyor → herhangi bir
  tenant'a çöp kayıt açılabilirdi); başvuru yalnız `/api/applications` üzerinden.

---

## 3. Güvenlik kuralları tasarımı

### 3.1 Firestore (taslak)

```
function signedIn()      { return request.auth != null && request.auth.token.firebase.sign_in_provider != 'anonymous'; }
function memberPath(t)   { return /databases/$(database)/documents/tenants/$(t)/members/$(request.auth.uid); }
function member(t)       { return get(memberPath(t)).data; }
function isMember(t)     { return signedIn() && exists(memberPath(t)) && member(t).status == 'active'
                                  && (member(t).get('expiresAt', null) == null || request.time < member(t).expiresAt); } // K11
function tenantDoc(t)    { return get(/databases/$(database)/documents/tenants/$(t)).data; }
function tenantReadable(t){ return request.time < tenantDoc(t).readUntil; }   // K5: deneme + 14 gün
function tenantWritable(t){ return request.time < tenantDoc(t).writeUntil && hasRole(t, ['admin','recruiter','department_user']); } // support yazamaz
function hasRole(t, roles){ return isMember(t) && member(t).role in roles; }
function isAdmin(t)      { return hasRole(t, ['admin']); }
function isRecruiter(t)  { return hasRole(t, ['admin','recruiter']); }
function canReadAll(t)   { return tenantReadable(t) && hasRole(t, ['admin','recruiter','support']); } // okuma kurallarında isRecruiter yerine
function isDeptUser(t)   { return hasRole(t, ['department_user']); }

match /tenants/{t} {
  allow get: if isMember(t);          // ad, durum, plan — sırlar burada YOK
  allow list, write: if false;        // yalnız sunucu

  match /members/{uid} {
    allow get:  if isMember(t) && (request.auth.uid == uid || isRecruiter(t));
    allow list: if isRecruiter(t);
    // rol/departman/durum yalnız sunucu (Hub senkronu, destek erişimi, yönetici ekranı API'si)
    allow update: if isMember(t) && request.auth.uid == uid &&
                  !request.resource.data.diff(resource.data).affectedKeys()
                    .hasAny(['role','departments','status','email','hubRole']);
    allow create, delete: if false;
    match /{sub=**} { allow read, write: if isMember(t) && request.auth.uid == uid; }
  }

  match /candidates/{id} {
    allow get:  if isRecruiter(t) || (isDeptUser(t) && deptVisible(t, resource.data));
    allow list: if isRecruiter(t) || (isDeptUser(t) && deptVisible(t, resource.data));
    allow create, update, delete: if isRecruiter(t) && tenantWritable(t);
    // anonim aday: yalnız sunucu üzerinden; mülakat alanları interviews belgesinde
  }
  match /positions/{id} {
    allow get:  if resource.data.status == 'open' || isMember(t);   // genel ilan
    allow list: if isMember(t);
    allow write: if isRecruiter(t) && tenantWritable(t);
  }
  match /interviews/{sid} {
    allow get: if true;                               // 128 bit kimlik = yetki anahtarı (bugünkü gibi)
    allow list: if isMember(t);
    allow create: if isRecruiter(t) && tenantWritable(t);
    allow update: if isRecruiter(t) || (request.auth != null && !protectedFieldsTouched());
  }
  match /settings/{s} { allow get: if isMember(t); allow list: if false; allow write: if isAdmin(t) && tenantWritable(t); }
  match /accessLogs/{id} { allow read: if isAdmin(t); allow create: if isMember(t) && request.resource.data.uid == request.auth.uid; allow update, delete: if false; }
  match /integrationSecrets/{uid} { allow read, write: if false; }
  match /usage/{d} { allow read: if isAdmin(t); allow write: if false; }
  // … diğer koleksiyonlar bugünkü rol mantığıyla, her biri isMember(t)/isRecruiter(t) ile
}

match /userTenants/{uid}   { allow get: if signedIn() && request.auth.uid == uid; allow list, write: if false; }
match /publicLinks/{id}    { allow get, list, write: if false; }   // yalnız /api/public/resolve
match /platform/{doc=**}   { allow read, write: if false; }
match /platformUsage/{d}   { allow read, write: if false; }

// ESKİ KÖK: artifacts/talent-flow/** ve kök interviews/** → allow read, write: if false (veri taşınmaz, K10).
```

İlkeler:
- Her tenant eşleşmesinin ilk koşulu `isMember(t)`; varsayılan red (alt satır) korunur.
- `get()` sınırı: tekil istekte 10, toplu/sorguda 20. Tipik kural `member(t)` (1) + `tenants/{t}` (1, yalnız yazmada) +
  departman denetimi (aynı belge, önbellekte) → 2 okuma. Bugünkü `users/{uid}` + `settings/system` ile aynı düzey.
- `deptVisible()` bugünkü `department in departments || hasAny(visibleToDepartments)` mantığı, `member(t)` üzerinden.
- `token.role` hiçbir kuralda kullanılmaz.
- Okuma kurallarında `isRecruiter(t)` yerine `canReadAll(t)` (destek rolü salt okunur görür); her okuma ayrıca
  `tenantReadable(t)` ister, her yazma `tenantWritable(t)`. Bu, yazma isteğinde 1 ek `get` (tenant belgesi) demek; sınırın
  (10/20) altında.

### 3.2 Storage (taslak)

```
function isMember(t) { return request.auth != null && request.auth.token.firebase.sign_in_provider != 'anonymous'
  && firestore.exists(/databases/(default)/documents/tenants/$(t)/members/$(request.auth.uid)); }
function role(t) { return firestore.get(/databases/(default)/documents/tenants/$(t)/members/$(request.auth.uid)).data.role; }

match /tenants/{t}/cvs/{all=**}              { allow get: if isMember(t); allow list: if false; allow write: if isMember(t) && role(t) in ['admin','recruiter'] && request.resource.size < 20*1024*1024; }
match /tenants/{t}/bulk-imports/{uid}/{all=**} { allow read: if false; allow write: if isMember(t) && request.auth.uid == uid && request.resource.size < 200*1024*1024; }
match /tenants/{t}/branding/{f}              { allow get: if request.auth != null; allow list: if false; allow write: if isMember(t) && role(t) == 'admin' && isSafeImageType() && request.resource.size < 10*1024*1024; }
// eski cvs/**, branding/**, bulk-imports/** → kapalı (veri taşınmaz, silinir).
```

Storage → Firestore çapraz kuralları için ilk dağıtımda Firebase CLI, Storage hizmet hesabına Firestore okuma rolü
verilmesini ister (paylaşılan projede Emre onayıyla, tek seferlik). Sunucu tarafı `bulkSources.js` yol doğrulaması
(`parseSources`) `tenants/{req.tenant.id}/bulk-imports/{uid}/` önekine göre güncellenir.

### 3.3 Test planı (emülatör)

Mevcut: Playwright + emülatör (`playwright.config.emulator.js`, CI `e2e-emulator` işi). Eklenecek:

1. **Kural birim testleri** — `@firebase/rules-unit-testing` + vitest, `firebase emulators:exec --only firestore,storage`
   ile; CI'da ayrı iş (`rules-test`). Tohum: iki tenant (A, B), her birinde admin / recruiter / department_user
   (departmanlı ve departmansız), A'da `removed` üye, A'da süresi geçerli ve süresi dolmuş `support` üyesi, salt okunur
   (yazma süresi dolmuş) tenant C, tamamen kapanmış tenant D, anonim kullanıcı, hiçbir yere üye olmayan oturum.
   Matris: her koleksiyon × her kimlik × {get, list, create, update, delete} → beklenen (tablo test verisi olarak
   repoda; yeni koleksiyon tabloya eklenmeden test geçmez).
   Zorunlu kritik durumlar:
   - A recruiter, B'nin aday/ilan/mülakat/ayar belgesine `get` ve `list` → red.
   - Kendi üyelik belgesinde `role`/`departments`/`status` değiştirme → red; başka tenant'a kendine üyelik yazma → red.
   - `removed` üye → tüm okuma red. Tenant C (salt okunur) → okuma izin, yazma red; tenant D → okuma da red (K5).
   - `support` üyesi süre içinde → okuma izin, her yazma red; süresi dolunca → her şey red (K11).
   - department_user süzgeçsiz aday listesi → red; kendi departmanı → izin.
   - Anonim: kapalı ilan `get` → red; açık ilan `get` → izin; `list` → red; `candidates` `create` → red;
     mülakat korumalı alanları → red.
   - `userTenants`, `publicLinks`, `platform/*`, `integrationSecrets` → istemciden her şey red.
   - Eski kök (`artifacts/talent-flow/**`, kök `interviews`): herkes için red.
   - Storage: B üyesi A'nın `cvs` dosyasına `get` → red; başkasının `bulk-imports/{uid}` klasörüne yazma → red.
   - Her koruma için bir kez "koşulu kaldır → test düşüyor mu" denemesi (Hub-Inn kuralı).
2. **Sunucu izolasyon testleri** — `functions/` testlerine emülatöre bağlı süit: her uç A kullanıcısıyla çağrılır, B'nin
   kimliği gövdeye/parametreye konur → 404; mükerrer kontrolü B'nin adayını bulmaz; işçi yalnız kendi tenant'ına yazar;
   `/api/public/resolve` bilinmeyen kimlikte 404 ve hız sınırı.
3. **Statik denetim** — `scripts/check-tenant-paths.mjs` (CI): `artifacts/talent-flow` ve kök `interviews` dizgileri
   yalnız yol modülünde ve temizlik betiğinde geçebilir; `db.collection('`/`collection(db, '` ile sabit yol yasak.
4. **E2E (Playwright emülatör)** — iki tenant tohumlanır; A ile girişte panoda yalnız A'nın adayları; şirket seçicide
   iki şirketi olan kullanıcı geçiş yapınca liste değişir; Hub giriş akışı sahte Hub sunucusuyla.

---

## 4. Veri: taşıma yok, eski yol dondurulur ve temizlenir

Karar (K10, 2026-10-28): mevcut veri test/demo verisi, **taşınmaz**. Yeni tenant yolları boş başlar.

### 4.1 Neden çözücü ve prova gerekmiyor

- Korunacak veri olmadığı için iki kökü birden destekleyen ara katmana (`dataRoot: legacy|tenant`) gerek yok; kod
  doğrudan `tenants/{t}/…` yollarını kullanır (yine tek bir yol modülünden: `functions/services/tenantPaths.js`,
  `src/config/tenantPaths.js` — statik denetim için).
- `main` otomatik yayınlandığı için yarım geçiş canlıyı bozar. Bu yüzden PR 1–7 **entegrasyon dalında**
  (`claude/talent-mt`) incelenip birleşir; dal emülatör E2E'si ve kural testleriyle yeşil tutulur; `main`'e tek
  birleştirmeyle geçilir (kurallar + sunucu + istemci aynı yayında).
- Önyükleme betiği yok: Emre'nin şirketi ve yönetici üyeliği Hub'dan ilk girişte (§2.3) kendiliğinden oluşur.

### 4.2 Geçiş günü sırası

| Adım | Ne |
|---|---|
| 1 | (İsteğe bağlı) Eski yolun tek seferlik dışa aktarımı: `gcloud firestore export gs://<yedek-kovası>/talent-legacy-<tarih>` — demo verisi olsa da geri dönüş için ucuz güvence. |
| 2 | Entegrasyon dalı `main`'e birleşir → otomatik yayın: yeni kurallar (eski kök `allow read, write: if false`), yeni sunucu ve istemci. |
| 3 | Emre Hub'dan Talent'ı açar → `tenants/{hubTenantId}` + yönetici üyeliği oluşur; boş alanda duman testi (ilan aç, başvuru yap, aday ekle, mülakat bağlantısı). İkinci bir deneme şirketiyle izolasyon kontrolü. |
| 4 | Sonucu STATUS'a yaz. |

Kesinti: yalnız yayının kendisi (birkaç dakika); bakım penceresi yok. Eski bağlantılar (eski ilan/mülakat adresleri)
bilerek çalışmaz — test verisine aitler.

### 4.3 Eski yolun temizliği (PR 8 içinde)

- Kurallar: `artifacts/talent-flow/public/data/**` ve kök `interviews/**` için açık red (varsayılan red zaten kapsar;
  açık kural niyeti belgeler). Storage: eski `cvs/**`, `branding/**`, `bulk-imports/**` kapalı.
- Kod: eski yol sabitleri, kayıt/izinli alan adı akışı, `scripts/grant-super-admin.mjs`, `TechDocsPage` yol metinleri
  kaldırılır; `docs/YETKI-MATRISI.md` yeni modele göre güncellenir.
- Veri: geçişten ~7 gün sonra `firebase firestore:delete --recursive artifacts/talent-flow` ve kök `interviews`; Storage
  `gcloud storage rm -r gs://<bucket>/cvs gs://<bucket>/branding gs://<bucket>/bulk-imports`. Kullanıcıların eski
  Firebase `role` talepleri (`token.role`) `setCustomUserClaims(uid, null)` ile temizlenir (ortak Auth'ta başka
  uygulamayı yanıltmasın). Silme Emre'nin onayıyla.
- Firestore PITR (7 gün) gerçek müşteri verisi gelmeden önce açılır (PR 0); düzenli yedek Hub ROADMAP "Operasyon" işinde.

### 4.4 Geri dönüş

- Geçiş sonrası sorun: `main`'deki birleştirme commit'i geri alınır (revert) → otomatik yayın eski kodu **ve** eski
  kuralları geri getirir; eski veri 7 gün silinmeden durduğu için uygulama eski hâline döner. Bu sürede yeni yollara
  yazılan deneme verisi kaybedilebilir (önemli değil).
- Eski veri silindikten sonra geri dönüş yalnız ileri düzeltmedir (dışa aktarım varsa ondan geri yükleme).

---

## 5. Tenant başına AI maliyet sınırı ve hız sınırı

### 5.1 Bugün

- `functions/services/usage.js:101` günlük toplamı `D/usage/{day}`'e yazar; `functions/services/aiBudget.js` aynı belgeden
  **global** günlük token ve aramalı çağrı tavanı uygular (varsayılan kapalı, ortam değişkeni), süreç içi önbellek 60 sn.
- Hız sınırları (`functions/middleware/rateLimit.js`) bellek içi ve **IP başına**; `maxInstances: 5` olduğu için gerçek
  sınır 5 katına kadar çıkabilir.
- Anonim oturum `/api/ai/generate`'e serbest istemle (`prompt`) erişebiliyor (`functions/routes/ai.js:26–29`).

### 5.2 Hedef

- **Ölçüm:** her AI çağrısı `req.tenant.id` ile; `tenants/{t}/usage/{day}` (raporlama için `month-{YYYY-MM}` toplamı da)
  (`FieldValue.increment`), ayrıca `platformUsage/{day}`. Etiket kırılımı (cv, interview, grounded …) korunur.
- **Fren (sıra ile):** (1) global güvenlik tavanı (bugünkü ortam değişkenleri, platformu korur); (2) tenant günlük
  token tavanı; (3) tenant günlük aramalı çağrı adedi; (4) kullanıcı başına günlük pay (tek kullanıcının tenant
  bütçesini tüketmesine karşı). Sınırlar `tenants/{t}.aiLimits` (plan varsayılanı + platform yöneticisi istisnası).
  **Başlangıç değerleri (K8):** şirket başına günde **2M token**, günde 200 aramalı çağrı, kullanıcı başına şirket
  payının %40'ı; aylık tavan şimdilik yok. **Aşılınca durur, ertesi gün kendiliğinden devam eder** (ücretli ek yok).
  Gün sınırı mevcut `dayKey` ile UTC gece yarısı (Türkiye saatiyle 03:00). Aşımda 429 + `AI_DAILY_BUDGET_EXCEEDED`;
  arayüz "şirketinizin bugünkü AI kotası doldu, yarın 03:00'te yenilenir".
- **Sapma:** önbellek tenant anahtarlı, 60 sn → en fazla bir dakikalık trafik kadar aşım (bugünküyle aynı kabul). Toplu
  içe aktarma işi başlamadan önce tahmini maliyet (`dosya sayısı × ortalama`) kalan bütçeyle karşılaştırılır; yetmiyorsa
  iş reddedilir (yarım iş bırakmamak için).
- **Anonim çağrılar:** serbest istemli anonim AI kapatılır; aday tarafı yalnız amaca özel uçlar (ör.
  `/api/interview/:linkId/answer-eval`) — tenant `publicLinks`'ten, istem sunucuda kurulur, oturum başına çağrı tavanı.
- **Hız sınırları:** IP sınırları kalır (kimliksiz uçlar için). Kimlikli uçlarda `keyGenerator` = `tenantId:uid`;
  tenant genelinde dakikalık sayaç Firestore'da (`tenants/{t}/rate/{dakika}` artırımı, 2 dk TTL) — yalnız AI ve toplu
  uçlarda (her istekte Firestore yazımı istemiyoruz). Kimliksiz `/api/public/resolve` ve `/api/session` için mevcut
  `sessionLimiter`.
- **Görünürlük:** şirket yöneticisine "AI kullanımı" paneli (mevcut `AiUsagePanel` tenant'a daraltılır); platform
  yöneticisine tüm şirketler (ileride Hub admin ekranı, Hub ROADMAP "Admin ekranı" → kullanım ve AI maliyeti).

---

## 6. PR'lara bölünmüş plan

Boyut: S ≤ 1 gün, M 2–3 gün, L 4–6 gün (tek geliştirici + ajan, test dahil).
PR 0 doğrudan `main`'e (davranış değişmez); PR 1–7b entegrasyon dalına (`claude/talent-mt`); geçiş tek birleştirme.

| # | PR | İçerik | Boyut | Risk | Yayın öncesi şart mı |
|---|---|---|---|---|---|
| 0 | Hazırlık (`main`) | `firestore.indexes.json` konsoldan dışa alınıp repoya; PITR açılır; kural test altyapısı (`@firebase/rules-unit-testing`, CI işi) bugünkü kurallarla yeşil; entegrasyon dalı açılır. | S | Düşük | Evet |
| 1 | Kurallar | §3.1/§3.2 tenant eşleşmeleri; eski kök kapalı; `token.role` güveni kaldırılır; tam test matrisi. | M | Orta (kural hatası = ya erişim kaybı ya sızıntı; matris bunu yakalar) | Evet |
| 2 | Sunucu tenant bağlamı | `requireAuth` → `requireTenant(roles)` (üyelikten rol, `req.tenant`, 402/askı); `tenantPaths.js`; tüm `functions/` yolları; mükerrer kontrolü/işçi/bakım/saklama tenant içinde; `/api/users` tenant üyeleri; `auth-user` silme → üyelik kaldırma; `invitation-lookup` ve `send-invite` kaldırılır (K3); `companyIntel` platform önbelleğine ve sunucu ucuna (K6); işçi collection group. Sunucu izolasyon testleri + statik yol denetimi. | M–L | Orta (geniş ama mekanik diff) | Evet |
| 3 | İstemci tenant bağlamı | `TenantContext` + `userTenants`; tüm `src/` yolları; şirket seçici; Talent giriş/kayıt ekranı Hub'a yönlenir; profil/kayıt yazımı, alan adıyla kayıt ve davet ekranları kaldırılır (K3, K4); salt okunur bant (K5); `SettingsPage` istemci Gemini kaldırılır. | L | Orta (birçok ekran). E2E iki tenant. | Evet |
| 4 | Hub köprüsü | Talent `POST /api/hub/exchange` (sunucudan sunucuya, OIDC), tenant/üyelik oluşturma ve senkron, rol eşlemesi (K2), deneme süresi senkronu (`writeUntil`/`readUntil`, K5), `membership-revoked` ve `support-access` uçları (K11). **Eşlik eden Hub-Inn PR'ları:** exchange yanıtına tenant + rol + uygulama hakkı + deneme bitişi; OIDC doğrulama; üyelik değişince Talent'a bildirim; **admin konsolunda destek erişimi isteme ekranı** (gerekçe, 24 saat, denetim kaydı). Bağımsız güvenlik incelemesi. | M (+ Hub M) | **Yüksek** (kimlik). Signals desenini birebir izle. | Evet |
| 5 | Herkese açık bağlantılar | `publicLinks` + `/api/public/resolve`; apply/interview/respond/join sayfaları; anonim `candidates` create kapanır; `positions` liste kapanır; `init-interview-session` tenant'ı bağlantıdan alır; `/api/session` tam taramadan kurtulur. | M | Orta (aday deneyimi) | Evet |
| 6 | Storage tenant yolları | Yüklemeler `tenants/{t}/…`; Storage kuralları çapraz Firestore; `bulkSources` önek denetimi; jetonlu adres yerine kural denetimli indirme. | S–M | Orta (CLI'nin Storage→Firestore rol onayı) | Evet |
| 7 | AI bütçesi ve hız sınırları | §5.2; şirket başına günde 2M token, aşınca dur / ertesi gün devam (K8); tenant/kullanıcı payı; anonim serbest istem kapanır; panel. | M | Düşük-orta (yanlış sınır = hizmet durması; varsayılanlar cömert başlar) | Evet |
| 7b | Aday e-postaları (K7) | Gönderim `noreply@clyrolabs.com`; `From` adı şirket adı, `Reply-To` işe alımcının e-postası; şablonlar tenant ayarından; `EMAIL_USER` tek hesabı kalkar. Ön koşul: clyrolabs.com için gönderim hizmeti + SPF/DKIM/DMARC (Emre). Yanıtlar işe alımcının kutusuna gittiği için `check-info-replies` yalnız Gmail/Microsoft bağlayan kullanıcıda çalışır (ekranda belirtilir). | S–M | Orta (teslim edilebilirlik) | Evet |
| 8 | Geçiş + eski yolu temizleme | Entegrasyon dalı → `main` (§4.2); duman testi; 7 gün sonra eski veri, eski kod ve eski `role` talepleri temizlenir (§4.3). | S | Düşük (geri dönüş = revert) | Evet (temizlik ikinci şirketten önce) |
| 9 | Sonra | Tenant dışa aktarma/silme (KVKK talebi, ayrılan müşteri); şirket kendi alan adından gönderim (isterse); ayrı Firestore veritabanı ihtiyacı yeniden değerlendirilir (K12); dış sızma testi. | — | — | Sızma testi yayın öncesi (Hub ROADMAP) |

### 6.1 PR 2 sonrası sunucu sözleşmesi (PR 3–5 buna göre)

- **Etkin şirket:** iç kullanıcı uçları `X-Tenant-Id` başlığını ister (yoksa 400 `TENANT_REQUIRED`). Yetki başlıktan
  değil `tenants/{t}/members/{uid}` belgesinden: üye değil/şirket yok → 403 `NOT_A_MEMBER` (varlık sızmaz), rol
  yetmiyor → 403 `FORBIDDEN`, askı → 403 `TENANT_SUSPENDED`, salt okunur bantta yazma → 402 `TENANT_READ_ONLY`,
  kapalı → 402 `TENANT_CLOSED` (`functions/middleware/auth.js` → `requireTenant`).
- **Roller:** eski `super_admin` → `admin`. Aday yazan uçlar (CV, toplu içe aktarma, bakım, e-posta) admin/recruiter;
  OAuth bağlama department_user'a da açık; `support` hiçbir yazma ucunu açamaz.
- **Platform yöneticisi:** `PLATFORM_ADMIN_EMAILS` (her istekte okunur, e-posta doğrulanmış olmalı) yalnız
  `/api/admin/api-keys`, `/api/admin/integrations`, `/api/platform/usage`; şirket verisi için üyelik şart.
- **Aday tarafı (geçici, PR 5'e kadar):** `/api/positions/:id`, `/api/applications`, `/api/session/:id`,
  `/api/init-interview-session`, `/api/update-candidate-status`, `/api/candidate-respond` şirketi sorgu/gövdedeki
  `tenantId`'den alır; kayıt kimliği yetki anahtarı olarak kalır, şirket kimliği aramayı o şirketin ağacına daraltır.
  Yeni mülakat belgesini yalnız şirketin admin/recruiter'ı açar. PR 5'te `publicLinks` çözücüsü bunun yerini alır.
- **Kaldırılanlar (K3):** `POST /api/auth/invitation-lookup`, `POST /api/send-invite`. `DELETE /api/admin/auth-user/:uid`
  (ve `DELETE /api/admin/members/:uid`) artık üyeliği kaldırır (`status: removed`, son yönetici kilidi), Firebase
  hesabına dokunmaz.
- **`companyIntel` (K6):** `POST /api/company-intel/resolve {name, force?}` (önce şirketin elle kaydı, sonra ortak
  önbellek `platform/companyIntel/entries/{id}`, yoksa sunucuda kaynaklı arama; aday bağlamı/`hint` sorguya ve
  önbelleğe girmez), `PUT|DELETE /api/company-intel/manual` (şirkete özel `tenants/{t}/companyIntelManual`).
  Yanıt ham kaynaklı yanıt (`answer`); ayrıştırma istemcide (PR 3).
- **AI ölçümü:** platform toplamı `platformUsage/{day}`; şirket başına ölçüm PR 7. Storage: CV yüklemesi
  `tenants/{t}/cvs/`, toplu kaynak öneki `tenants/{t}/bulk-imports/{uid}/`.

Toplam kaba efor: **~3–4 hafta** (PR 0–8; davet/kayıt akışlarının kalkması PR 3'ü küçültüyor, e-posta (7b) ve destek
üyeliği ekleniyor — toplam değişmedi), Hub tarafı ek ~1–1,5 hafta (köprü + admin konsolunda destek erişimi). Kritik yol:
0 → 1 → 2 → (3, 4, 5, 6, 7, 7b paralel olabilir) → 8.

**Clyro genel açılışından önce mutlaka:** PR 0–8'in tamamı (7b dahil) + bağımsız güvenlik incelemesi (kimlik/tenant/yetki
dokunan her PR'da) + iki tenant'lı uçtan uca deneme (Hub ROADMAP "Uçtan uca deneme") + sızma testi.

---

## 7. Kararlar (hepsi verildi: Emre, 2026-10-28)

| # | Konu | Karar |
|---|---|---|
| K1 | Model | **Şirket klasörü + üyelik belgesi**; jetonda rol yok (§2.2). |
| K2 | Hub rolü → Talent rolü | `tenant_admin` → admin; `manager` → recruiter; `member` → department_user (departmansız = aday görmez; yönetici departman atar). Hub rolü başlangıç değeri; Talent'taki elle değişiklik Hub senkronunda ezilmez. |
| K3 | Talent'a giriş | **Yalnız Hub'dan.** Talent'ın kendi daveti ve doğrudan girişi kapanır; Hub hesabı olmayan kişi Hub'a davet edilir (§2.4). |
| K4 | İzinli alan adıyla kayıt | **Kaldırılır.** |
| K5 | Deneme süresi biten şirket | **14 gün salt okunur, sonra kapalı** (`writeUntil`/`readUntil`, §2.3, §3.1). |
| K6 | `companyIntel` | **Platformda ortak**, yalnız herkese açık bilgi; istemci doğrudan okumaz, kimin sorguladığı tutulmaz (§1.1). |
| K7 | Aday e-postaları | **`noreply@clyrolabs.com`**, gönderen adı şirket, yanıt adresi işe alımcı (PR 7b). |
| K8 | AI kotası | **Şirket başına günde 2M token; aşılınca durur, ertesi gün devam** (§5.2). |
| K9 | Bakım penceresi | **Gerek yok** (K10). |
| K10 | Mevcut veri | **Taşınmaz, sıfırdan başlanır** (§4). |
| K11 | Destek erişimi | **Admin konsolundan süreli (ör. 24 saat), denetim kayıtlı, kendiliğinden kapanan destek üyeliği**; salt okunur (§2.3). |
| K12 | Ayrı Firestore veritabanı | **Şimdi yok**; kurallar proje geneli kalır, Hub/CX Firestore kullanmaya başlarsa yeniden konuşulur. |

Kalan dış bağımlılıklar (karar değil, Emre'nin hesap işleri): clyrolabs.com için e-posta gönderim hizmeti ve DNS
kayıtları (PR 7b); Hub admin konsolu (Hub ROADMAP) destek erişimi için ön koşul.
