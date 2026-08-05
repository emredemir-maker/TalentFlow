# Plan: Puanlama, Bakım/502, Adaylar Sayfası ve CV İşleme Düzeltmeleri

Tarih: 2026-08-05 (rev. 2 — hedef pozisyon bağlayıcılığı ve skor tutarlılığı bulguları eklendi)
Durum: Uygulama başladı — 2026-08-05

## İlerleme Günlüğü

**2026-08-05 — Tur 1 (Faz 1 tamamı + kritik puanlama düzeltmeleri):**
- ✅ Faz 1/1: `readCandidatesFlat` ve prescore endpoint'ine `.select()` projeksiyonu; prescore iki aşamalı okumaya geçti (skor alanları → yalnızca parti adayları `getAll` + fieldMask)
- ✅ Faz 1/2: `bulk-jobs` sorgusu sınırlandı (super_admin: orderBy+limit 20; recruiter: kendi işleri)
- ✅ Faz 1/3: `functions/index.js` → `concurrency: 8`, `maxInstances: 5`
- ✅ Faz 1/4: `MaintenancePanel` → `Promise.allSettled`, 55 sn AbortController, 502/503/504 için anlaşılır Türkçe mesajlar
- ✅ Faz 1/5: "Bakım" butonu rol kapısı (super_admin/recruiter)
- ✅ Faz 2A/1-2: her iki prompt kapalı listeye zorlandı; `matchOpenTitle` doğrulaması + `keywordPrescore` yedeği + null sentinel ("Uygun açık pozisyon bulunamadı.")
- ✅ Faz 2A/3: eşleşen başlıktan `positionId` çözümleme (bulk worker)
- ✅ Faz 2A/4: 25 açık pozisyon sınırı kaldırıldı (bulk worker + maintenance/prescore)
- ✅ Faz 2B/6: yüklemede seçilen pozisyon BAĞLAYICI (`resolvePreScore` öncelik ters çevrildi); yanlış davranışı assert eden testler düzeltildi + 7 yeni test
- ✅ Faz 3A/1: `extraction.js` → `cvData || cvText` (%90→%4 çöküşünün ana nedeni)
- ✅ Faz 3B/9: `if (!parsed)` guard'ı — AI ayrıştıramazsa içi boş aday yaratılmaz, item `error` olur
- ✅ Faz 3A/2: SystemScanner + CandidateDrawer'a kanıt kontrolü — CV gövdesi (cvData/cvText/experiences) boş adayda derin analiz atlanır, tamamlanma bildiriminde "N aday atlandı (yeniden ayrıştırma gerekli)" raporlanır
- ✅ Faz 3A/3: `rankedForce` NaN sıralama hatası düzeltildi (`calculateMatchScore(...).score`)
- ✅ Faz 3A/4: SystemScanner skor yazma kapıları — `scoringStage !== 'initial'` iken `matchScore` ezilmez; 0 puanlı sonuç `bestResult` kabul edilmez
- ✅ Faz 2B/9: SystemScanner ve CandidateDrawer `candidate.positionId`'ye saygı gösterir — atanan pozisyon her zaman analiz kümesine girer ve `matchedPositionTitle`'ı "en iyi eşleşme" ezemez
- Doğrulama: 197/197 vitest, eslint 0 hata (mevcut react-hooks uyarıları), tsc temiz, vite build başarılı
- ✅ Deploy edildi (2026-08-05): functions `api(us-central1)` + hosting yayında; `/api/health` → 200 (1.2 sn).
- ⚠️→✅ **Deploy olayı ve düzeltmesi:** Kök `.env` dosyasının TÜM değerleri şablonmuş ("your_api_key" vb.) — ilk deploy bu yüzden ön yüzü Firebase yapılandırmasız yayınladı ("Firebase yapılandırılmamış" hatası) ve `functions/.env.production` da şablon değerlerle gitti. Düzeltme: gerçek istemci yapılandırması `firebase apps:sdkconfig WEB`'den alınıp `.env`'e yazıldı (yedek: `.env.bak`), `functions/.env.production` yalnızca gerçek `VITE_FIREBASE_API_KEY` ile yeniden oluşturuldu, ikinci deploy yapıldı ve yayındaki pakette gerçek anahtar doğrulandı. Gemini anahtarı Firestore'dan okunuyor (`settings/api_keys` — env yalnızca yedek), etkilenmedi. **Açık konu:** `EMAIL_USER`/`EMAIL_PASS` gerçek değerleri hiçbir yerde bulunamadı — e-posta gönderimi kullanıcıdan değer gelene dek yapılandırmasız.

**2026-08-05 — Tur 2 (Faz 4A tamamı):**
- ✅ 4A/1: `scoreForPosition(candidate, position, keywordScoreFn)` yardımcısı `candidateTable.js`'e eklendi (kayıtlı `positionAnalyses` skoru ↔ anahtar-kelime skoru, büyük olan; skor fonksiyonu dışarıdan enjekte — util bağımlılıksız kalır)
- ✅ 4A/2: `applyTableFilters` "pozisyon uygunluk modu" — açık pozisyon objesi verildiğinde adaylar etikete göre elenmez, her adaya seçili pozisyon için `positionScore` hesaplanır; min skor eşiği bu skora uygulanır. `CandidateProcessPage` filtresi de aynı semantiğe geçirildi (skorlar Map ile tek geçişte hesaplanır).
- ✅ 4A/3: Aday Raporu pozisyon dropdown'u aday-türevli `matchPositions` yerine `usePositions()` açık pozisyonlarından besleniyor
- ✅ 4A/4: `positionScore` sort accessor eklendi; pozisyon seçilince tablo otomatik "Poz. Uyum" azalan sıralamaya geçer (koşullu yeni kolon + Excel'e "Seçili Pozisyon Uyumu" sütunu); Adaylar sayfası listesi de pozisyon seçiliyken o skora göre azalan sıralanır
- ✅ 4A/5: Testler — `scoreForPosition` + pozisyon modu için 7 yeni test (eşiğin seçili pozisyon skoruna uygulandığını, eski yanlış davranışın gittiğini doğrular); 204/204 vitest
- ✅ Hosting deploy edildi (yalnızca ön yüz değişti)

**Kalan:** Faz 1.5 (opsiyonel kuyruk), Faz 2/5 (UI null etiketi), 2B/7-8+10-12 (modal, positionAnalyses hedef skoru, UI yüzeyleri, onarım aracı), Faz 3A/5-6 (provenance + %98 kırpması), 3B/7-8+10-14, Faz 4B (birleşik sayfa + toplu statü).

Bu plan, bildirilen 6 sorunun kod incelemesiyle doğrulanmış kök nedenlerine ve fazlara ayrılmış çözüm adımlarına dayanır.

---

## Kök Neden Özeti

| # | Sorun | Kök neden | Ana dosyalar |
|---|-------|-----------|--------------|
| 1 | Sistemde olmayan pozisyon atanıyor | Toplu içe aktarma ve bakım ön-puanlama prompt'ları Gemini'ye açık pozisyon listesini "öneri" olarak veriyor; dönen serbest metin `matchedPosition` hiçbir doğrulama yapılmadan `matchedPositionTitle` alanına yazılıyor. "Uygun pozisyon yok" durumu şemada hiç yok. | `functions/services/bulkWorker.js:43-92`, `functions/services/prescore.js:30-59`, `functions/routes/maintenance.js:161-169` |
| 2 | Bakım → Tara hatası, sonra 502 | `duplicate-scan` tüm adaylar koleksiyonunu (cvText + positionAnalyses dahil) sınırsız okuyor; Firebase Hosting rewrite 60 sn'de kesiyor (kod 300 sn varsayıyor); tekrar denemeler aynı 2GiB instance'a yığılıyor (concurrency ayarı yok) + aynı proseste sonsuz bulk worker döngüsü → OOM → SIGKILL → 502. | `functions/routes/maintenance.js:31-45`, `functions/index.js:7-12`, `functions/server.js:114-123`, `src/components/MaintenancePanel.jsx:48-75` |
| 3a | Adaylar sayfası kullanışsız | `CandidateProcessPage.jsx` (2659 satır) master-detail; çoklu seçim/toplu işlem yok. `CandidatesTablePage.jsx` (337 satır) tablo + filtre + sıralama + Excel var ama yazma aksiyonu yok. Hazır ama hiçbir yerde kullanılmayan `BulkUpdateModal.jsx` mevcut. | `src/pages/CandidateProcessPage.jsx`, `src/pages/CandidatesTablePage.jsx`, `src/components/BulkUpdateModal.jsx` |
| 3b | Pozisyon+skor filtresi yanlış | Filtre, seçilen pozisyonun skoru yerine adayın "en iyi eşleşme" skorunu (`bestScore`/`combinedScore`) kullanıyor. Pozisyon-bazlı skor verisi (`positionAnalyses` haritası) zaten mevcut → düzeltme frontend-only. | `src/utils/candidateTable.js:59-74`, `src/pages/CandidateProcessPage.jsx:758-764`, `src/context/CandidatesContext.jsx:315-379` |
| 4 | Kariyer geçmişi eksik adaylar | Toplu içe aktarma prompt'u `experiences` alanını hiç istemiyor; başvuru formundan aday oluşturmada `experiences` kopyalanmıyor; Gemini null dönse bile "içi boş" aday kaydediliyor; PDF hata mesajı CV metni sanılıyor; metin 6000 karaktere kesiliyor ve kaynak dosya siliniyor. | `functions/services/bulkWorker.js:64-84, 349, 372-398`, `src/pages/PositionsPage.jsx:121-151`, `functions/services/pdf.js:45-48`, `functions/routes/bulk.js:122-135` |
| 5 | Yüklenen hedef pozisyon yok sayılıyor | Toplu yükleme modalında pozisyon seçimi "İsteğe Bağlı" ve doğrulamasız; seçilse bile `resolvePreScore` AI'ın serbest metin pozisyonunu işe alım uzmanının seçiminin ÖNÜNE koyuyor (mevcut birim testi bu yanlış davranışı "doğru" diye assert ediyor). Hedef pozisyon aslında kaydediliyor (`candidate.positionId`, `bulkJobId` → job dokümanı) ama **hiçbir UI yüzeyi okumuyor**; SystemScanner `positionId`'yi tamamen yok sayıp her taramada `matchedPositionTitle`'ı "en iyi"yle eziyor. İçe aktarmada hedef pozisyona ait skor hiç yazılmıyor (`positionAnalyses` boş). | `src/pages/CandidateProcessPage.jsx:2516-2540`, `functions/services/bulkWorker.js:43-50, 371-398`, `functions/services/bulkWorker.test.js:132-135`, `src/components/SystemScanner.jsx` |
| 6 | Skor %90 → %4 düşüyor | **Derin analiz `candidate.cvData` okuyor ama tüm içe aktarma yolları `cvText` yazıyor** → toplu yüklenen adayın derin analizi BOŞ CV ile çalışıyor. Boş girdiyle model STAR üretemiyor; puan matematiği fallback dalına düşüp `0 tecrübe + %10 anahtar kelime = 4` üretiyor (4 değeri yalnızca bu daldan çıkabilir — adli kanıt). SystemScanner skoru kapısız/tabansız yazıyor; `CandidatesContext`'teki `aiScore \|\| matchScore \|\| initialAiScore` zinciri 4'ün 90'ı gölgelemesine yol açıyor (90 Firestore'da hâlâ duruyor). Ek hata: "en iyi 5 pozisyon" sıralaması obje-obje çıkarması yüzünden NaN karşılaştırıyor → rastgele pozisyonlara karşı analiz. | `src/services/ai/extraction.js:35-42`, `src/services/geminiService.js:161-186`, `src/components/SystemScanner.jsx:264-270, 296-310`, `src/context/CandidatesContext.jsx:321` |

---

## Faz 1 — Acil Stabilizasyon: 502'yi Durdur (Sorun 2)

En yüksek öncelik; uygulamayı çökerten tek sorun bu.

1. **Firestore okumalarına projeksiyon** — `functions/routes/maintenance.js:32` `readCandidatesFlat()` içine `.select('name','email','phone','source','bulkJobId','createdAt')` ekle (cvText/positionAnalyses/aiAnalysis tel üzerinden hiç gelmesin). Aynı tedaviyi `prescore` endpoint'ine uygula (`maintenance.js:136`): sadece skor alanları + cvText'i gerektiği anda tekil okumayla al; tam snapshot'ı Gemini çağrıları boyunca bellekte tutma.
2. **bulk-jobs sorgusu** — `maintenance.js:49` → `.orderBy('createdAt','desc').limit(20)` (recruiter filtresi için gerekiyorsa composite index).
3. **Fonksiyon konfigürasyonu** — `functions/index.js:7-12`: `concurrency` düşür (ör. 4–8), `maxInstances` tanımla; tek ağır isteğin diğer 79 isteği düşürmesini engelle.
4. **Frontend dayanıklılık** — `src/components/MaintenancePanel.jsx`: `Promise.all` → `Promise.allSettled` (tek uç başarısızsa diğerinin sonucu çöpe gitmesin); `authedFetch`'e ~55 sn AbortController timeout; 502/504 için kullanıcıya anlamlı Türkçe mesaj.
5. **Rol kapısı** — "Bakım" butonu yalnızca `super_admin`/`recruiter` rollerine görünsün (`CandidatesTablePage.jsx:154-159`); backend zaten 403 veriyor.
6. **(Faz 1.5, opsiyonel)** `duplicate-scan`'i mevcut `bulkImportJobs` kuyruk desenine taşı veya cursor'lu sayfalama ekle; bulk worker'ı istek servis eden prosesten çıkarıp Cloud Scheduler/Tasks'a taşı (`functions/server.js:114-123`). Projeksiyon düzeltmesi tek başına yeterli olursa ertelenebilir.

**Doğrulama:** Emulator'da 1000+ sahte adayla `duplicate-scan` < 2 sn; art arda 5 "Tara" tıklamasında bellek artışı sınırlı; deploy sonrası prod'da Tara → sonuç dönüyor, 502 yok.

---

## Faz 2 — Puanlama Doğruluğu: Pozisyon Doğrulama + Hedef Pozisyon Bağlayıcılığı (Sorun 1 ve 5)

### 2A. AI'ın pozisyon uydurmasını engelle (Sorun 1)

1. **Prompt sıkılaştırma (2 kopya)** — `bulkWorker.js:59-84` ve `prescore.js:33-46`: açık pozisyon listesini kapalı küme olarak ver ("SADECE bu listeden seç"), hiçbiri uygun değilse `matchedPosition: null` iste. Repo'da doğru desen zaten var: `src/services/ai/extraction.js:80-88` (`suggestedOpenPosition: "... veya null"`). Ortak prompt/parse mantığını tek modüle çıkar — kopya sürüklenmesini bitir.
2. **Sunucu tarafı üyelik doğrulaması** — `resolvePreScore` (`bulkWorker.js:43`) ve `computePrescore` (`prescore.js:30`): dönen başlık `openPositionTitles` içinde değilse (büyük/küçük harf ve boşluk duyarsız) → `keywordPrescore`'un en iyi gerçek pozisyonuna düş; o da 0 ise `matchedPositionTitle: null` + `matchReason: "Uygun açık pozisyon bulunamadı"` yaz. AI serbest metni asla doğrudan persist edilmesin.
3. **`positionId` çözümleme** — doğrulanan başlıktan pozisyon doc id'sini bul ve yaz.
4. **25 pozisyon sınırı** — `bulkWorker.js:297` `.slice(0, 25)` kaldır veya belirgin şekilde yükselt/logla.
5. **UI: "Uygun açık pozisyon yok" durumu** — `matchedPositionTitle === null` için görünen etiket: `CandidateProcessPage.jsx:1160-1167`, `CandidatesTablePage` pozisyon kolonu, `CandidateComparisonModal`, `AnalyticsPage:483`. Kritik: `SendMessageModal.jsx:60,118,259` — adaya giden e-postaya uydurma pozisyon adı gitmesin.

### 2B. İşe alım uzmanının seçtiği pozisyon bağlayıcı olsun (Sorun 5)

6. **Öncelik ters çevrilir** — `resolvePreScore` (`bulkWorker.js:43-50`): işe alım uzmanı yüklemede pozisyon seçtiyse `positionTitle` KAZANIR; AI'ın `matchedPosition`'ı yalnızca pozisyon seçilmediğinde (ve 2A doğrulamasından geçerse) kullanılır. Bu yanlış davranışı "doğru" diye assert eden `bulkWorker.test.js:132-135` güncellenir. Prompt'ta pozisyon verildiğinde skor SADECE o pozisyona göre istenir.
7. **Modal iyileştirmesi** — `CandidateProcessPage.jsx:2516-2540`: "Pozisyon (İsteğe Bağlı)" seçimi ya zorunlu yapılır ya da seçilmediğinde "adaylar genel havuza alınacak, seçtiğiniz bir pozisyona göre puanlanmayacak" uyarısı gösterilir. Modal kapanışında sıfırlanmayan `bulkPositionId` kalıntısı temizlenir (`:903-911, 2615` reset yollarına eklenir).
8. **Hedef pozisyon skoru içe aktarmada yazılır** — bulk worker, iş dokümanındaki hedef pozisyon için skoru `positionAnalyses[hedefBaşlık] = {score, ...}` olarak da persist eder; böylece "yüklediğim pozisyona uygunluk" sayısı en baştan var olur.
9. **Taramalar `positionId`'ye saygı gösterir** — `SystemScanner.jsx`: adayın `positionId`'si varsa o pozisyon analiz kümesine her zaman dahil edilir ve `matchedPositionTitle` işe alım uzmanı atamasını ezmez (yerleşik doğru desen: `CandidateProcessPage.jsx:637-640`). `CandidateDrawer.handleRunAnalysis` için aynı kural.
10. **UI: "Yüklendiği pozisyon" görünür olur** — "Pozisyon Eşleşmeleri" sekmesinde (`CandidateProcessPage.jsx:1500-1614`) adayın yüklendiği pozisyon en üste sabitlenir ve "Hedef Pozisyon" rozetiyle işaretlenir; aday başlığında AI eşleşmesi hedef pozisyonun yerine değil yanında gösterilir. `MaintenancePanel` iş listesine ve toplu yükleme toast'ına zaten API'den gelen ama render edilmeyen `positionTitle` kolonu eklenir.
11. **Yanıltıcı iş özeti düzeltilir** — `bulkWorker.js:451-467` `avgScoreByPosition`: hedef pozisyon başlığı altında, farklı pozisyonlara karşı hesaplanmış skorların ortalaması raporlanıyor; 6-8. adımlar sonrası skorlar zaten hedef pozisyona ait olacağından etiket doğrulanır.
12. **Mevcut bozuk verinin onarımı** — Bakım paneline "Eşleşmeleri Doğrula" aksiyonu: `matchedPositionTitle`'ı açık pozisyonlarda olmayan adayları bul, `positionId`/`bulkJobId` üzerinden hedef pozisyonunu kurtar, yeniden puanla veya null'a çek (Faz 1'in güvenli okuma/batch desenleriyle).

**Doğrulama:** Birim testler (öncelik sırası, üyelik doğrulaması, null sentinel); emulator'da pozisyon seçili toplu yükleme → tüm adaylarda `matchedPositionTitle === hedef` ve `positionAnalyses[hedef]` dolu; pozisyonsuz yüklemede liste dışı başlık asla persist edilmiyor.

---

## Faz 3 — Skor Tutarlılığı ve CV Bütünlüğü (Sorun 4 ve 6)

Veri kalitesi UI'dan önce gelmeli; birleşik aday sayfası bozuk veriyle açılmasın.

### 3A. %90 → %4 düşüşünün kök nedenleri (Sorun 6)

1. **`cvData`/`cvText` uyumsuzluğu — tek satırlık en etkili düzeltme** — `src/services/ai/extraction.js:40`: `cvData: sanitizeForPrompt(candidateProfile.cvData || candidateProfile.cvText || '')`. Derin analiz artık toplu yüklenen adayların CV metnini gerçekten görür.
2. **Kanıt yoksa skor yazma** — `analyzeCandidateMatch`/`SystemScanner`: CV gövdesi (cvData+cvText+experiences) boşsa derin analiz çalıştırılmaz; aday "veri eksik — yeniden ayrıştırma gerekli" olarak işaretlenir. Mevcut prescore'daki desen örnek alınır (`prescore.js:31-32` 40 karakter alt sınırı).
3. **`rankedForce` NaN hatası** — `SystemScanner.jsx:266`: `calculateMatchScore(candidate, p)` obje döndürür; `.score || 0` kullanılmalı. Şu an sıralama NaN karşılaştırmasıyla no-op → adaylar fiilen rastgele 5 pozisyona karşı analiz ediliyor.
4. **Skor yazma kapısı** — `SystemScanner.jsx:296-310`: `CandidateDrawer.jsx:200-205`'teki `scoringStage` kapısı SystemScanner'a da uygulanır; `matchScore`/`aiScore` koşulsuz ezilmez. `highestScore = -1` başlangıcı yüzünden 0 puanın "en iyi sonuç" kabul edilmesi engellenir (makul taban/`bestResult` doğrulaması).
5. **Skor kaynağı (provenance) ayrışır** — `CandidatesContext.jsx:321`'deki `aiScore || matchScore || initialAiScore` zinciri yerine açık alanlar: ön skor (`initialAiScore`) ve derin analiz skoru (`aiScore`) ayrı taşınır, UI hangisini gösterdiğini etiketler (bkz. Faz 4). Basit bir `scoreHistory` append'i (önceki değer + kaynak + zaman) eklenir — şu an repo'da hiçbir skor geçmişi yok.
6. **Kozmetik tutarsızlık** — `CandidateProcessPage.jsx:1188`'deki belgesiz `* 0.98` kırpması kaldırılır.

### 3B. CV içeriği bütünlüğü (Sorun 4)

7. **Toplu içe aktarma şemasını zenginleştir** — `bulkWorker.js:64-84` prompt'una `experiences[{role,company,duration,desc}]` ekle; `:372-398` yazımına dahil et. (Alan sırasında `experiences`'ı büyük `cvData`'dan önce iste — çıktı token sınırında ilk kaybolan son alan oluyor.)
8. **Başvuru → aday terfisinde alan kaybı** — `src/pages/PositionsPage.jsx:121-151` allow-list'ine `experiences` ekle.
9. **Boş kayıt guard'ı** — `bulkWorker.js:349` sonrası `if (!parsed)` → item `failed` işaretlenir (şu an `done` olup PDF dosya adı aday ismi oluyor), iş raporunda gösterilir.
10. **PDF hata sentineli** — `functions/services/pdf.js:45-48` hata string'i döndürmek yerine throw/boş dön + bayrak; `bulkWorker.js:330` `length > 5` kapısı anlamlı eşiğe (ör. 200) çekilir ve "PDF Error" öneki reddedilir.
11. **Kesme politikası** — `functions/routes/bulk.js:127` 6000 → en az 15000 karakter; temp dosya silme başarılı çıkarıma bağlanır. Orta vade: ham dosya Storage'a kaydedilir, `cvText` yeniden üretilebilir olur.
12. **Parse hatasında yeniden deneme** — `gemini.js:107,151` + `bulkWorker.js:405-411`: JSON parse başarısızlığında 1 tekrar; başarısız/boş yanıtlar 1 saatlik cache'e yazılmaz (`gemini.js:38-74`).
13. **Duplicate clean stratejisi** — `duplicateScan.js:33-37` "en eskiyi tut" → "en zengin kaydı tut" (dolu alan sayısı/`experiences` varlığına göre).
14. **Backfill aracı** — Bakım paneline "Eksik Profilleri Tamamla": `cvText`'i olup `experiences`'ı olmayan adayları partiler halinde yeniden ayrıştır.

**Doğrulama:** Birim testler; emulator'da 20 CV'lik toplu içe aktarma → sonra SystemScanner taraması → skorlar ön skorla aynı büyüklük mertebesinde (boş girdi kaynaklı çökme yok); bozuk PDF → item `failed`; backfill eksik adayları tamamlıyor.

---

## Faz 4 — Birleşik Adaylar Sayfası + Filtre Düzeltmesi (Sorun 3)

### 4A. Filtre/sıralama düzeltmesi (küçük, bağımsız — istenirse Faz 2 ile paralel)

1. **Ortak yardımcı** — `scoreForPosition(candidate, position) = max(positionAnalyses[position.title]?.score ?? 0, calculateMatchScore(candidate, position).score)`; repo'da yerleşik desen (`PositionsPage.jsx:65-68`). Bu düzeltme, "seçtiğim aday benim pozisyonuma uygun mu?" sorusunun doğrudan cevabıdır: pozisyon filtresi artık "AI bu adayı o pozisyona etiketlemiş mi"ye değil, "adayın O pozisyondaki skoru"na bakar.
2. **Uygulama noktaları** — `src/utils/candidateTable.js:63` (pozisyon filtresi) ve `:73` (min skor seçili pozisyonun skoruna bakar); `CandidateProcessPage.jsx:763-764` aynı düzeltme.
3. **Dropdown kaynağı** — pozisyon seçenekleri `matchPositions` (aday türevli) yerine `usePositions()` açık pozisyonlarından gelir.
4. **Sıralama** — `SORT_ACCESSORS`'a seçili pozisyona bağlı `positionScore` erişimcisi; ada göre sıralama zaten `localeCompare('tr')` ile mevcut.
5. **Test** — `candidateTable.test.js:85-88` (yanlış davranışı assert ediyor) güncellenir + pozisyon-bazlı testler eklenir.

### 4B. Sayfa birleşimi

6. **Taban:** `CandidatesTablePage.jsx` (tablo, filtre çubuğu, sıralama, sayfalama, Excel mevcut).
7. **Çoklu seçim:** başa checkbox kolonu + tümünü seç; `selectedIds` `Set` deseni (`SystemScanner.jsx:86,173` referans).
8. **Toplu statü değişikliği:** orphan `BulkUpdateModal.jsx` açık temaya uyarlanıp bağlanır; `Promise.all(ids.map(id => updateCandidate(id, updates)))` (şablon: `CandidateProcessPage.jsx:282-292`); `statusChangedAt/By`, `rejectedAt/By`, `hiredAt/By` damgaları tekil değişiklikle tutarlı.
9. **Statü kaynağı tekilleştirme:** 4 kopya stage listesi → tek kaynak `src/utils/pipelineStages.js`; kayıt dışı `'final'` statüsü ya eklenir ya kaldırılır.
10. **Skor kolonları etiketlenir:** tabloda "Ön Skor" ve "AI Analiz" ayrı kolonlar (Faz 3A/5 provenance ayrımını kullanır); tek "AI" kolonunda kaynağı belirsiz sayı gösterilmez.
11. **Detay görünümü:** satır tıklaması `CandidateProcessPage` detayına gitmeye devam eder; Sidebar'da tek "Adaylar" girişi kalır, "Aday Raporu" girişi kaldırılır.

**Doğrulama:** Vitest (candidateTable); Playwright akışı: pozisyon + eşik filtrele → o pozisyonun skoruna göre doğru adaylar; 3 aday seç → toplu statü → Firestore'da 3 kayıt güncellendi; sıralama pozisyon skoruna göre azalan.

---

## Mevcut Verinin Kurtarılması (kullanıcı için önemli not)

- **%90'lık ön skorlar kaybolmadı:** SystemScanner `initialAiScore` alanına dokunmuyor; düşük derin analiz skoru onu yalnızca UI'da gölgeliyor. Faz 3A/5 sonrası iki skor ayrı görünür olacak.
- **"Hangi pozisyon için yüklendi" bilgisi kurtarılabilir:** pozisyon seçilerek yüklenen her adayda `positionId` dolu; seçilmemiş olsa bile `bulkJobId` → `bulkImportJobs` iş dokümanındaki `positionTitle` üzerinden geri kazanılabilir. Faz 2B/12 onarım aracı bunu kullanır.
- **CV'lerin yeniden yüklenmesi gerekmez:** her adayda ilk 6000 karakterlik `cvText` kayıtlı; Faz 3 düzeltmeleri sonrası yeniden tarama/backfill mevcut metin üzerinden çalışır. (6000 karakteri aşan CV'lerin kesilen kısmı geri getirilemez — bunlar için isteğe bağlı yeniden yükleme listelenebilir.)

---

## Sıra ve Bağımlılıklar

```
Faz 1 (stabilizasyon)  → bağımsız, İLK
Faz 2 (puanlama doğruluğu) → Faz 1'in güvenli okuma desenlerini kullanır (onarım aracı)
Faz 3 (skor tutarlılığı + CV bütünlüğü) → Faz 2 ile aynı dosyalara dokunur; art arda
Faz 4A (filtre)        → tamamen frontend, Faz 2/3 ile paralel yürüyebilir
Faz 4B (birleşik sayfa)→ 4A'dan sonra; veri onarımları (F2/F3) bitince en iyi sonucu verir
```

Her fazın sonunda: `npm run lint`, `npm run test`, ilgili Playwright senaryoları; backend değişikliklerinde emulator doğrulaması + `firebase deploy --only functions` (DEPLOY.md şu an sadece hosting'i belgeliyor — functions deploy adımı da eklenecek).
