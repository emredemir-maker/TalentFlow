# Infoset Redesign — Devir Teslim

TalentFlow'un 9 çekirdek ekranının Infoset Design System diliyle yeniden
üretilmesi. Bu belge yeni bir oturumun sıfırdan bağlam kurmadan devam
edebilmesi için yazıldı.

## Kaynak dosyalar

Hepsi `Incomplete mockup request/design_handoff_talentflow/` altında:

| Dosya | Ne işe yarar |
|---|---|
| `README.md` | Görev tanımı, ekran→dosya tablosu, onaylanmış kararlar |
| `TalentFlow Prototip.dc.html` | 2005 satır, tıklanabilir hifi prototip |
| `pdata.js` | 638 satır, prototip verisi — **canlı mülakat ekranının spec'i burada** |
| `_ds/…/colors_and_type.css` | Token kaynağı |

## Kullanıcının kuralları (değişmez)

1. HTML kopyalanmaz; ekranlar mevcut React bileşenlerinde yeniden üretilir.
   Renk/spacing/tipografi prototipin inline stillerinden birebir alınır.
2. **Hiçbir uygulama özelliği bozulmaz.** `src/utils/`, `src/services/`,
   `src/config/` DEĞİŞTİRİLMEZ. State, route, onClick ve veri akışları korunur.
   Sadece JSX yapısı ve stiller değişir.
3. Ekran ekran ilerlenir; her ekrandan sonra uygulama açılıp doğrulanır ve
   **ayrı commit** atılır.
4. Doğrulama: Aday Detayı'nda CV Analizi ile havuz listesindeki sayı **eşleşmeli**.
   STAR ölçeği 0–3, etiketler `starDimensions.js`'ten.
5. README'deki onaylanmış kararların tamamı uygulanır.
6. Emin olunmayan davranışta mevcut kod korunur ve **sonunda sorulur** —
   tahminle değiştirilmez.
7. Bitince ekran başına tek satırlık değişiklik özeti çıkarılır.

### Kullanıcının çalışma tercihleri

- **PR akışı:** ekran ekran ayrı PR, **doğrudan `main` tabanlı**. Kullanıcı
  dakikalar içinde merge ediyor; açık PR'a sonradan iş eklenmez.
- Açıklamalar sade ve yönlendirici olmalı.
- Anahtar/parola paylaşılmaz; güvenlik ayarlarını kullanıcı kendi yapar.

## Durum

| # | Ekran | Dosya | Durum |
|---|---|---|---|
| — | Token temeli | `src/index.css` | ✅ merged (#194) |
| 1 | Kontrol Paneli | `Dashboard.jsx` | ✅ merged (#194) |
| 2 | Pipeline | `PipelinePage.jsx` | ✅ merged (#197) |
| 3 | AI Match | `AIMatchPage.jsx` | ⛔ **atlandı** (aşağıda) |
| 4 | Mülakat Listesi + Planlama | `InterviewManagementPage.jsx` | ✅ merged (#199) |
| 5 | Canlı Mülakat | `LiveInterviewPage.jsx` | 🟡 **PR #201 açık** |
| 6 | Rapor | `InterviewReportPage.jsx`, `InterviewReportSections.jsx` | 🟡 **PR #203 açık** |
| 7 | İK Asistanı | `HrAssistantPanel.jsx`, `PositionDraftCard.jsx` | ✅ merged (#205) |
| 8 | Aday Detayı | `CandidateProcessPage.jsx` + 6 panel | 🟡 **PR #207 açık — SON EKRAN** |

Ek olarak merged: #196 (yerel giriş COOP düzeltmesi), #198 (havuz skor
tutarlılığı + aday tıklaması doğru sayfaya).
Ekran 4 merged (#199), belge #200 ile `main`'e taşındı.
**Açık PR: #207** (Ekran 8). Diğer sekiz ekranın hepsi merge edildi.

> ⚠️ Bu belge #198 merge edildikten SONRA o dala işlendiği için `main`'e
> hiç girmemişti; buraya cherry-pick ile taşındı. Belge güncellemeleri
> ekran PR'ından ayrı ve kendi PR'ında gitmeli.

Merge sonrası silinebilecek dallar: `redesign/01-kontrol-paneli`,
`redesign/02-pipeline`, `redesign/02-pipeline-main`.

## İşe yarayan döngü

Her ekran için sırayla:

```
1. Prototip bloğunu oku (satır haritası aşağıda)
2. Mevcut dosyayı TAMAMEN oku — hangi state/handler korunacak, çıkar
3. SKOR gösteren her yer için: withCoherentScores çağrılıyor mu? (bkz. Ders 1)
4. Yaz
5. npx eslint <dosya>
6. npm run build
7. npx vitest run
8. npm run build:e2e-auth && npx vite preview --port 4173
   → tarayıcıda render + konsol hatası kontrolü
9. npm run build   ← dist'i üretim derlemesine geri al (ÖNEMLİ)
10. git checkout -- dist/   ← derleme çıktısı PR'a girmesin
11. commit → main tabanlı dal → PR
```

**8. adım neden:** yerel giriş Google popup'ı gerektiriyor ve Claude
şifre giremiyor. `VITE_E2E_MOCK_AUTH` modu auth'u tamamen atlıyor, böylece
ekranın çöküp çökmediği doğrulanabiliyor. Veri boş gelir — layout ve konsol
hatası için yeterli, skor doğrulaması için değil.

**9–10. adım neden:** mock-auth derlemesi `dist/`'i eziyor. Bırakılırsa
auth'u baypas eden bir derleme repoda kalır. `dist` hem `.gitignore`'da hem
izleniyor (eski bir kalıntı), o yüzden elle geri alınmalı.

### Token kontrolü (tarayıcıda)

```js
getComputedStyle(document.querySelector('.infoset')).fontFamily  // Poppins
// header 52px, canvas #FBFBFD, kenarlık #E2E5EE, marka #5068FF, radius 6px
```

## Prototip satır haritası

`TalentFlow Prototip.dc.html` içinde:

| Ekran | Satırlar |
|---|---|
| Kontrol Paneli (`isDash`) | 57–175 |
| Aday Detayı (`isCand`) | 178–689 |
| Pipeline (`isPipe`) | 692–760 |
| AI Match (`isMatch`) | 763–861 |
| Mülakat Listesi (`isIv`) | 864–940 |
| Planlama (`isSch`) | 943–1015 |
| Rapor (`isRep`) | 1018–1119 |
| Modaller (elle mülakat, maaş bandı, aday yükleme, red, HR asistanı, toast) | 1123–1313 |

**Canlı Mülakat ekranının render bloğu HTML'de YOK.** Ama tam veri modeli
`pdata.js` satır 364–410'da duruyor ve export ediliyor: `transcript`
(konuşma balonları, mülakatçı/aday renkleri), `wave` (30 çubuk ses dalgası),
`liveAgentSteps` (Veri Ayıklama → Semantik Eşleşme → Risk Analizi → Otonom
Karar), `qSets` (Derinleştir/Doğrula/Kapanış), `suggested` (3 soru önerisi),
`starDims` (0–3, `ANCHOR_LABELS`). Ekran 5 bu spec'ten kurulacak — uydurma
olmaz, veri kesin.

## Onaylanmış tasarım kararları

| Karar | Durum |
|---|---|
| Funnel chart kaldırıldı | ✅ Ekran 1 |
| Mülakat takvimi düz listeye | ✅ Ekran 1 · ✅ Ekran 4 |
| Toplu Yükleme / Yeni Aday Kontrol Paneli'ne + havuz başlığına | ✅ Ekran 1 |
| Mülakat oluşturma menüsü (Adımlı/Hızlı/Manuel/Maaş) | ✅ **zaten vardı** |
| Menüde "Maaş Aralığı Tanımla" | ✅ Ekran 4 (#199) |
| Manuel mülakatlarda "transkript yok" uyarısı | ✅ Ekran 4 (#199) |
| Maaş modalı kendi pozisyon state'ini kullanır | ✅ Ekran 4 (#199) |
| Aday Detayı sekmeler + zorunlu kapısı + skor kırılımı + alt aksiyon çubuğu | ✅ Ekran 8 (#207) · sekme sayısı 8 kaldı, aşağıda |
| Toolbar tek satır 28px pill | ✅ Ekran 8 (#207) |
| STAR ölçeği her yerde 0–3 | ⚠️ Ekran 5'te veri yok · ⚠️ Ekran 6'da alan zaten 0–100 · ✅ Ekran 8'de **zaten uygulanmıştı** |

## Bu oturumda alınan kararlar

| Soru | Karar |
|---|---|
| Kuyruk gerekçeleri nereden gelecek? | **Gerçek kurallardan** — uydurma "AI önceliklendirdi" yok |
| ROI kartı / Açık Pozisyonlar | ROI kaldırıldı, Açık Pozisyonlar sağ rayda korundu |
| Pipeline'daki Mülakatlar sekmesi | **Korundu** (prototipte yok ama çalışan görünüm) |
| "Süreçten çıkar" | Mevcut red akışını açar — sebepsiz ikinci yol açılmaz |
| AI Match ekranı | **Atlandı** (aşağıda) |
| "Maaş Aralığı Tanımla" | Redesign işine dahil, Ekran 4 PR'ında |
| PR biçimi | Ekran ekran, doğrudan `main` tabanlı |

## Ekran 3 (AI Match) neden atlandı

`AIMatchPage.jsx` (426 satır) `App.jsx`'te **hiçbir route'a bağlı değil**;
`analysisCallSites.test.js` onu `DEAD_FILES` listesinde tutuyor. Menüye
bağlamak tasarım işi değil, **veri bozan bir düğme** eklemek olurdu:

1. `analyzeCandidateMatch(jd, candidate, model)` — **4. argümanı geçmiyor.**
   Canlı çağrı noktalarının hepsi `{ requirements }` geçiyor
   (`scanService.js:98,202`, `CandidateDrawer:234`, `SystemScanner:313`,
   `AddCandidateModal:207`, `ApplyPage:295`). Argüman gelmeyince
   `calculateHybridScore` "eski davranış" dalına düşüyor — zorunlu/tercihen
   ağırlıklı kapsama devre dışı.
2. Sonucu **eski şemayla** yazıyor: düz `matchScore` + `aiAnalysis`.
   Canlı akış `positionAnalyses[positionTitle]` yazıyor.
3. `PREDEFINED_POSITIONS` kullanan **tek dosya** — uygulama pozisyonları
   Firestore'dan alıyor.
4. Bunu `filteredCandidates` üzerinde **döngüyle** yapıyor.

Yani "Eşleştir" düğmesine basan biri, süzülmüş tüm adayların analizini eski
cetvelle hesaplanmış, yanlış şemaya yazılmış sonuçlarla ezer.

İstenirse ayrı bir iş olarak mevcut mimari üzerine yeniden yazılabilir.
`agenticWorkflow.js` de aynı `DEAD_FILES` listesinde ve o da
`analyzeCandidateMatch` çağırıyor.

## Ekran 4 — ne yapıldı (#199)

`InterviewManagementPage.jsx` + yeni `src/components/SalaryBandModal.jsx`.

| Parça | Sonuç |
|---|---|
| **A. Liste** | Ay takvimi ve seçili gün kartları kalktı, yerine 7 kolonlu tablo. Sekmeler Tümü/Yaklaşan/Tamamlanan/İptal. Arama gerçekten süzüyor (eskiden `value`/`onChange` yoktu), sayfalama 12 satır. Ertele/İptal/Sil/Yeniden Planla satır menüsü korundu — bu üç işlem başka hiçbir ekranda yok |
| **B. Sağ ray (280px)** | "Bugün" düz listesi + "Değerlendirici yükü" (= tamamlanmamış mülakat sayısı; uydurma kapasite yüzdesi yok) |
| **C. Maaş bandı** | Menüde 6. madde, kendi pozisyon seçicili modal, **yalnız üst sınır**, recruiter'a özel |

Ek karar: iptal edilen mülakatlar eskiden hem takvimden hem aktif/geçmiş
kovalarından atılıyordu, yani hiçbir yerde görünmüyorlardı — "İptal"
sekmesi onları geri getirdi.

**Yalnız üst sınır neden:** `PositionsPage` aynı alanı `{ max, currency,
period, basis }` yazıyor. Buraya alt sınır koysaydık pozisyon ekranından
yapılan ilk düzenlemede sessizce silinirdi.

**Satırdaki ★ skor** Pipeline ile aynı kaynak: `finalScore ||
aiOverallScore`. Manuel görüşmenin `aggregateScore`'u başka bir cetvel
(damgalardan hesaplanan kanıt oranı) — o yüzden manuel satırlarda ★ yok.

Silinen ölü kod: `selectedCalDate`, `calYear`, `calMonth`,
`allCalSessions`, `dayCalSessions`, `navigateCal`, `calDaysInMonth`,
`calFirstDow`, `getCalStatusConfig`, `openWizardWithDate`, `viewTab`.
Sihirbazın 3. adımının **kendi** takvimi var — tarih seçimi kaybolmadı.

**Canlıda doğrulanmadı:** mock-auth'ta veri boş geliyor. Dolu tablo
(durum rozetleri, ★ skor, satır menüsü, departman dışı davetler)
kullanıcının hesabında bir kez gözle görülmeli.

**Kullanıcıya sorulacak:** prototip bekleyen mülakatta CTA'yı "Devam Et"
diyor; seans henüz başlamadığı ve Kontrol Paneli (#194) "Görüntüle"
kullandığı için "Görüntüle" seçildi.

## Ekran 5 — ne yapıldı (#201)

`LiveInterviewPage.jsx`. Mülakatçının aktif oturum ekranı **kendi
`return`'üne alındı** (`if (isRecruiter) { … }`) ve Infoset diline
çevrildi. Aday görünümü koyu hâliyle dokunulmadan kaldı: prototipte
karşılığı yok ve WebRTC + onay akışı orada.

Değişenler: 52px açık başlık (süre, aday durumu, İçeri al, aday linki,
Mülakatı tamamla, ⋮), sorular paneli, transkript (balon renkleri
prototipin `transcript` bloğundan — mülakatçı nötr, aday marka tonu),
"Mülakat tamamlandı" ekranı. Video karesi koyu bırakıldı.

### Prototipte olup KONMAYANLAR — kasten

| Prototip | Neden yok |
|---|---|
| **STAR 0–3, dört çubuk** | Canlı analiz `analyzeSTARRealTime` (`services/ai/interview.js`) **beş yetkinliği 0–100** döndürüyor: technical, communication, problemSolving, cultureFit, adaptability. S/T/A/R ÜRETMİYOR — STAR yalnızca prompt'ta yol gösterici olarak geçiyor. Dört çubuk basmak uydurma ölçüm olurdu |
| 30 çubuklu ses dalgası | Mevcut dalga `Math.random()`; mikrofonun yanında ses seviyesi ölçer gibi okunur |
| 3 soru kipi | Servis yalnızca `deepen` ve "henüz sorulmamış alan" dallarını destekliyor. İki gerçek kip kondu |
| Ajan adımları | `AgentThoughtPanel.jsx`'in tek kullanıcısı `AIMatchPage` (DEAD_FILES) ve adımları 1.5sn'lik sahte `setInterval` |

**Kullanıcıya sorulacak:** canlı ekranda STAR paneli isteniyorsa
`services/ai/interview.js` prompt+şema değişmeli — ayrı bir iş.

### Dürüstleştirilen etiketler

"Logic Integrity" ve "LOYALTY SCORE" → **"Yetkinlik ortalaması"**.
Hesaplanan şey beş yetkinliğin düz ortalaması. "REPORU" → "Raporu".

### Silinen ölü kod

Aday `return`'ündeki `isRecruiter && (…)` başlık bloğu (mülakatçı dalı
ayrılınca erişilemez oldu) ve aktif ekrandaki cihaz ayarları modalı
(`setShowSettings` yalnızca lobiden çağrılıyor; içindeki `<select>`'lerin
`value`/`onChange`'i de yok).

### ⚠️ Doğrulama boşluğu

**Aktif mülakatçı ekranı tarayıcıda görülemedi.** Canlı seans kaydı ve
kamera izni gerekiyor; mock-auth önizlemesinde ikisi de yok. eslint/build/
vitest temiz ama Ekran 1/2/4'teki render doğrulaması burada yapılamadı.
Bir kez gerçek seansla açılıp bakılmalı.

## Ekran 6 — ne yapıldı (#203)

`InterviewReportPage.jsx` + `InterviewReportSections.jsx`. Prototipin
düzeni: 56px başlık, aday şeridi, sekmeler, `1fr / 320px` ızgara; sağ
rayda STAR kartı, yetkinlik, karar, mülakatçı değerlendirmesi.

Üç bölüm bileşeni yalnızca STİL olarak değişti — hangi koşulda hangi
cümlenin çıktığı o dosyanın asıl işi, mantık aynı.

### Kaldırılan uydurma ölçümler

| Ne | Neden |
|---|---|
| STAR alıntıları | "Durum" kutusuna 50 karakterden uzun İLK aday cümlesi, "Eylem" kutusuna içinde **"yaptım" geçen** ilk cümle, o boyutun kanıtıymış gibi basılıyordu |
| Anahtar kelimeler | Kayıtta yoksa adayın **CV becerilerine** düşüyordu; ikisi de yoksa `'Yorumlanıyor...'` diye hiç bitmeyen etiket |
| "AI ÖZET" kutusu | `aiSummary` yoksa "…gerçek zamanlı analiz edildi." sabit cümlesi |
| Dil alanı | Boşsa "Türkçe" yazıyordu — hiç tespit edilmemiş bilgi |

### Düzeltilen etiketler

Radar köşesinde `cultureFit` **"Liderlik"** diye etiketlenmişti (öyle bir
eksen yok), `adaptability` ise "Uyum" (o cultureFit'in karşılığı). Radar
çubuklara çevrildi: mutlak konumlu köşe etiketlerinde hangi sayının hangi
eksene ait olduğu doğrulanamıyordu. STAR boyutları Türkçeleşti
(Durum/Görev/Eylem/Sonuç) — ham `'Situation'` `lang="tr"` sayfada CSS ile
büyütülünce **SİTUATİON** oluyor.

Transkript araması dekoratifti (`value`/`onChange` yoktu), artık süzüyor.

### ⚠️ STAR ölçeği: burada 0–3 YAPILMADI

**Kodbazda iki ayrı STAR var, karıştırmayın:**

| Alan | Ölçek | Kim yazıyor | Nerede gösteriliyor |
|---|---|---|---|
| `session.starScores.{S,T,A,R}` | **0–100** | `generateInterviewFinalReport` (şeması açıkça `"S": <0-100>`) | Mülakat raporu (Ekran 6) |
| `candidate.starAnalysis` | **0–3** + `ANCHOR_LABELS` | CV analizi | Aday Detayı (Ekran 8) |

`utils/starDimensions.js` (`STAR_MAX = 3`) **ikincisine** ait. Raporda
0–3 cetveli uygulamak 83'ü "83/3" yapardı — belgedeki "3/10" hatasının
ters yönden aynısı. **Onaylanmış "STAR 0–3" kararının asıl yeri
Ekran 8.**

### `StarScoreCard.jsx` ölü

Plan bu ekranın dosyaları arasında sayıyordu ama **hiçbir yerden import
edilmiyor** — yalnızca `starLabels.test.js` metnini okuyor. İçinde hâlâ
`/10` ve `* 10` var. Dokunulmadı; testi kırmadan silmek ayrı bir iş.

### Doğrulama

Ekran **tarayıcıda açıldı ve doğrulandı**: sayfaya geçici bir fixture
enjekte edip (`sessionStorage`) kanıt kartı, zorunlu madde kapısı, madde
kartları, özet, STAR/yetkinlik çubukları, transkript sekmesi ve arama
görüldü; fixture geri alındı, commit'e girmedi. Ekran 5'teki doğrulama
boşluğu burada YOK.

> Bu yöntem Ekran 5 için de denenebilir ama orada kamera izni de
> gerekiyor; önizleme penceresi medya erişimini engelliyor.

## Ekran 7 — ne yapıldı (#205)

`HrAssistantPanel.jsx` + `PositionDraftCard.jsx` (taslak kartı panelin
içinde render ediliyor, yarısı eski dilde kalmasın diye o da çevrildi).

Tetikleyici hap biçimli marka düğme; panel 440px → **400px**, 14px
yarıçap, başlıkta 26px yuvarlak marka ikonu ve prototipin alt başlığı
("havuzdaki veriye bakar, karar vermez"). Örnek sorular hap biçimli.
cyan/teal aksanlar markaya, slate/amber/emerald/violet tonları
n/warn/ok/bad tokenlarına indi. Eylem düğmelerinde VERSAL kalktı.

**Metinlerin hiçbiri değişmedi.** Bu dosyalarda asıl iş hangi koşulda
hangi cümlenin çıktığı: kaynaksız maaş rakamını gizlemek, "arama
yapılamadı" ile "arama yapıldı ama kaynak gösterilmedi"yi ayırmak,
ölçülemeyen görüşmeyi ortalamaya katmamak, modelin eklediği maddeyi
"öneri" rozetiyle ayırmak.

## ⚠️ `.infoset` sınıfını zemini olan öğeye koymayın

Ekran 7'de canlıya çıkmadan yakalandı, **sonraki ekranlar için de
geçerli**:

`.infoset` kuralı `background` (kısayol) yazıyor ve `index.css`'te
`@import "tailwindcss"`ten SONRA geliyor. İkisi de sınıf seçici, yani
aynı özgüllükte — sonraki kazanıyor. Sınıfı doğrudan `bg-brand` taşıyan
bir düğmeye koyunca düğme marka mavisi yerine `#FBFBFD` çıktı.

**Kural:** `.infoset` sarmalayıcıda durur, zemin çocuk öğede. Zorunlu
kalırsan `style={{ background: … }}` sınıf kuralını yener.

## Ekran 8 — ne yapıldı (#207)

`CandidateProcessPage.jsx` + içinde render edilen **altı panel**
(`CandidateCvPanel`, `ScoreBreakdownPanel`, `StarEvidenceCards`,
`MustHaveBadge`, `InterviewPlanPanel`, `InterviewOutcomePanel`,
`VerificationPanel`). Tek dosya bırakılsa ekranın yarısı eski dilde
kalırdı.

Araç çubuğu tek satır + 28px hap düğmeler; aday başlığı 44px avatar ve
tek satır rozetler; sekme şeridi 12px / 2px alt çizgi, VERSAL kalktı;
alt aksiyon çubuğu 28px'e indi; detay paneli kart olmaktan çıkıp tam
genişliğe yayıldı.

**"%X Uyum" → "Endeks %X".** Ölçtüğü şey CV analizi ile mülakat
kanıtının birleşimi; "uyum" tek kaynak varmış gibi okunuyordu.

### Doğrulama sekmesi KORUNDU

README 7 sekme sayıyor ve listede "Doğrulama" yok — ama o liste
`VerificationPanel` (576 satır) yazılmadan önce hazırlanmış. CV
istihbaratı, sektör uyumu, şirket doğrulama ve mülakat öncesi sorular
orada. Tasarım listesi öyle diyor diye kaldırmak çalışan bir özelliğe
erişimi silmek olurdu. **Sekme sayısı 8; kullanıcıya soruldu.**

### STAR 0–3 zaten uygulanmıştı

Kararın asıl yeri burasıydı ve kod hâlihazırda doğruydu:
`ScoreBreakdownPanel` → `STAR_MAX` + `anchorLabel`, `StarEvidenceCards` →
`normalizeStarAnalysis`, sayfa → `starPercent`. Tarayıcıda 3/3 · 2/3 ve
ÖLÇÜLMÜŞ / ANLATILMIŞ çapalarıyla görüldü. **Değiştirilecek bir şey
yoktu.**

### ⚠️ Toplu sınıf eşlemesinde önek çarpışması

Ekran 7 ve 8'de kullanılan toplu `className` dönüşümü hızlı ve
denetlenebilir ama **bir tuzağı var**: `bg-amber-50` kuralı
`bg-amber-500`'ün de önekini yer ve `bg-warn-bg0` gibi **geçersiz** bir
sınıf üretir. Tailwind bunları sessizce yok sayar — düğme zeminsiz kalır
ve build/eslint hiçbir şey söylemez.

**Kural:** eşleme listesinde uzun adı kısa addan ÖNCE koy
(`bg-amber-500` → `bg-amber-50`), sonra dosyaları kalıntı için tara.
Ekran 8'de yedi yerde oluştu ve elle düzeltildi.

## Redesign bitti — bundan sonrası

Dokuz ekranın **sekizi** Infoset diline geçti; Ekran 3 (AI Match)
kalıcı olarak atlandı (gerekçe yukarıda).

**Kapsam artık `body`'ye taşınabilir.** `src/index.css`'teki `.infoset`
bloğunun başındaki not bunu söylüyordu: kapsam ekran ekran doğrulama
bitene kadar dardı. Bitti. Taşımadan önce dokunulmamış ekranlar
(Ayarlar, Pozisyonlar, Analitik, Rehber, ApplyPage…) tek tek açılıp
bakılmalı — hepsi eski dilde ve `body`'ye taşımak onları da değiştirir.

Ayrıca hâlâ açık: aday görünümü (Ekran 5) koyu hâliyle duruyor ve
prototipte karşılığı yok.

## Dersler — bunlar tekrar edilmemeli

### 1. Skor kaynağı üç kez kaydı

Bu kodbazda "hangi skor" sorusunun **tek doğru cevabı** var:

```js
withCoherentScores(enrichedCandidates, openPositions, (c, p) => calculateMatchScore(c, p).score)
```

Kalıp `CandidatesTablePage.jsx:399`'da. Skor gösteren her yeni ekranda
**önce bu çağrılmalı.** Kayma geçmişi:

| Yanlış kaynak | Neden yanlış |
|---|---|
| `combinedScore` | Görüşme skorunu CV skoruyla ortalıyor `(bestAiScore + interviewScore) / 2` |
| ham `candidates` | `bestScore` alanı hiç yok — enrichment ekliyor |
| ham `bestScore` | Adayın **tüm** pozisyon analizlerinin maksimumu; Aday Detayı **atandığı** pozisyonu gösteriyor |

`withCoherentScores` içindeki not zaten uyarıyor: *"Math.max KALKTI… Üç
cetveli yarıştırıp en cömerdini seçmek, sıralamayı anlamsız kılıyordu."*

### 2. Var olan state, kullanılıyor demek değil

Kontrol Paneli'nde `selectedCandidate` state'i vardı ama **hiçbir yer set
etmiyordu** — `CandidateDrawer` ölü koddu. "Mevcut state'i koruyorum" diye
havuz satırını ona bağlayınca kullanımdan kalkmış bir ekran geri geldi.

Kullanıcı o çekmeceyi kullanmıyor. Aday detayı için doğru zincir:

```js
setViewCandidateId(id);
window.dispatchEvent(new CustomEvent('changeView', { detail: 'candidate-process' }));
```

Bir bileşene bağlanmadan önce: **bugün gerçekten açılıyor mu?**

### 3. Yaptığını iddia eden ama yapmayan düğme koyma

"Toplu Yükleme" düğmesi sayfaya yönlendirip modalı açmıyordu. Çözüm kalıbı:
hedef sayfada olay dinleyicisi + kaynakta `changeView` sonrası `setTimeout(…, 80)`
ile olay. Bugün iki tane var: `openBulkUpload`, `openAddCandidate`
(ikisi de `CandidateProcessPage.jsx`).

Aynı sebeple **eklenmeyenler:** dekoratif satır seçim kutusu (toplu seçim
davranışı yok), prototipin "AI Match" düğmesi (hedef ekran ölü).

### 4. Uydurma ölçüm sunma

Prototip kuyruk başlığında "AI önceliklendirdi" diyor — öyle bir mekanizma
yok. Kuyruk beş deterministik kuralla kuruldu ve karttaki gerekçe, adayı
oraya sokan koşulun okunabilir hâli. KPI trend chip'leri de (`+12`, `+5`)
geri getirilmedi: gerçek bir trend kaynağı yok, `change: null` duruyor.

### 5. PR tabanı

Bir PR'ın tabanı başka bir PR'ın dalıysa, taban merge edilse bile GitHub
hedefi otomatik `main`'e **çevirmiyor** — bunu yalnızca taban dal
silindiğinde yapıyor. #195 bu yüzden `main`'i ıskaladı ve #197 ile yeniden
gönderildi. **Ekran PR'ları doğrudan `main` tabanlı açılmalı.**

### 6. Dev sunucusu açıkken dal değiştirme

Vite HMR dal atlamalarında eski modülleri tutabiliyor ve ekran "ne yeni ne
eski" bir karışıma dönüyor. Dal değiştirdikten sonra:

```
rm -rf node_modules/.vite && npm run dev
```

ve tarayıcıda sert yenileme (Ctrl+Shift+R).

## Redesign dışı, hâlâ açık

- **Gemini API anahtarı + OAuth `clientSecret` rotasyonu** — sızıntı sonrası
  hâlâ yapılmadı. Sıra: yeni anahtar → Ayarlar ekranından kaydet → GitHub
  Secret `VITE_GEMINI_API_KEY` → sonra eskisini sil.
- **`.env.bak`** proje kökünde ve `.gitignore`'da değil.
- **`dist/`** hem `.gitignore`'da hem git'te izleniyor — tutarsız.
- **"1 analizi eskimiş" hatası** — kalıcı; hipotez (analizi olup CV gövdesi
  olmayan aday tarayıcı tarafından atlanıyor) **doğrulanmadı**.
- **`interviewCoverage[position]`** yalnızca TEK kayıt tutuyor.
- **Mülakat raporunda maaş beklentisi düğmesi yok** — mevcut mülakatlara
  beklenti girilemiyor. Toplu geriye dönük tarama tasarımı
  `docs/PLAN-ik-asistani.md`'de.

## Asla yapılmayacaklar

- `firebase deploy` elle çalıştırılmaz — `functions/.env.production`'ı şablon
  değerlerle ezer. Yalnızca CI deploy'u secret'ları doğru yazıyor.
- Faturalandırma tavanı yükseltilmez, yeni fatura hesabı açılmaz.
- API anahtarları sohbete yazılmaz.
