# Plan: Canlı Mülakat — aksayan noktaların revizyonu

Tarih: 2026-08-23
Kapsam: `src/pages/LiveInterviewPage.jsx` (~2.900 satır), `src/pages/FaceToFacePage.jsx`
Durum: inceleme bitti, uygulama bekliyor

Kullanıcının bildirdiği üç belirti incelendi; üçünün de kaynağı kodda
bulundu. İnceleme sırasında bildirilmeyen dört sorun daha çıktı.

---

## Bulgular

### 1. Mikrofon ve kamera kapatma KOZMETİK — bildirilen belirti

**En ciddi bulgu.** `setIsMicOn(!isMicOn)` yalnızca React state'ini
çeviriyor. Dosyada hiçbir yerde ses/görüntü parçası kapatılmıyor:

```
grep "\.enabled" LiveInterviewPage.jsx  →  hiç sonuç yok
```

`stream.getAudioTracks()` yalnızca BİR yerde geçiyor (satır 1117) ve
orada da STT yedeğine kaynak vermek için. Yani:

- Yerel ses parçası yakalamaya devam ediyor.
- **WebRTC karşı tarafa ses göndermeye devam ediyor.**
- Arayüz "kapalı" gösteriyor, karşı taraf duymaya devam ediyor.

Kamera aynı: `isVideoOn` yalnızca yerel `<video>` öğesinin `srcObject`'ini
boşaltıyor (satır 484). Karşı taraf görüntüyü almaya devam ediyor.

`isMicOn`'un tek gerçek etkisi STT motorunu durdurması — yani kendi
transkriptin kesiliyor ama sesin gitmeye devam ediyor. Kullanıcının
gördüğü tam olarak bu.

> Bu bir gizlilik sorunudur. Aday "mikrofonu kapattım" sanıp konuşuyor.

### 2. STT gecikmesi — bildirilen belirti

Gecikme tek bir yerden değil, beş ayrı yerden birikiyor:

| # | Kaynak | Etki |
|---|---|---|
| 1 | `interimResults = false` (satır 1027) | Yalnızca kesinleşmiş sonuç alınıyor; Türkçede kesinleşme konuşma bittikten saniyeler sonra geliyor |
| 2 | `onend` → 300 ms sonra `start()` (satır 1180) | Chrome sessizlikte tanımayı sık sık bitiriyor; her yeniden başlatmada o aralıktaki ses KAYBOLUYOR |
| 3 | Her kesin sonuç bir `updateDoc(arrayUnion)` | Her cümle için ayrı Firestore gidiş-dönüşü |
| 4 | Yedek yol: 3 sn'lik parçalar, `stop → yükle → start` | 3 sn tampon + model gidiş-dönüşü; üstelik yükleme sırasındaki ses kaydedilmiyor |
| 5 | STT efekti `[phase, isMicOn, stream, isRecruiter]`e bağlı | Mikrofona her dokunuşta motor komple yıkılıp yeniden kuruluyor |

### 3. Adayı içeri alma gecikmesi ve takılma — bildirilen belirti

WebRTC sinyalleşmesi Firestore üzerinden yürüyor ve dört ayrı kusuru var:

**a. ICE listeleri siliniyor.** Mülakatçı teklifi yazarken:

```js
setDoc(sessionRef, { webrtcOffer: …, webrtcAnswer: null,
                     recruiterIce: [], candidateIce: [] }, { merge: true })
```

Aday o ana kadar ICE adayı gönderdiyse **hepsi siliniyor**. Aday sayfayı
önce açtıysa bağlantı kurulamıyor ve yeniden denenmiyor.

**b. Erken gelen ICE düşüyor.** `addIceCandidate`, `remoteDescription`
atanmadan çağrılırsa hata fırlatıyor; hata boş `catch(e){}` ile
yutuluyor ve o aday **bir daha denenmiyor**. Bağlantı kurulma süresini
uzatan klasik hata.

**c. TURN sunucusu yok.** Yalnızca STUN tanımlı (satır 500). Simetrik
NAT ya da kurumsal ağ arkasındaki bir katılımcıda bağlantı **hiç
kurulmuyor** — ve ekranda bunu söyleyen bir şey yok.

**d. Sinyalleşme Firestore gidiş-dönüşüne bağlı.** Her ICE adayı bir
belge yazımı + karşı tarafa bir snapshot. Gerçek bir sinyalleşme
kanalına göre saniyeler ekliyor.

### 4. Aynı belgeye üç ayrı dinleyici — bildirilmedi

`/interviews/{sessionId}` belgesine aynı anda:
- aday dinleyicisi (satır 388),
- mülakatçı dinleyicisi (satır 355),
- WebRTC dinleyicisi (satır 530 / 551)

bağlanıyor. Her yazım üç geri çağırmayı birden tetikliyor; her biri
state güncelliyor ve 2.900 satırlık bileşeni yeniden render ediyor.

### 5. Saniyede ~7 kez tüm ekranı yeniden render eden süs — bildirilmedi

```js
setInterval(() => setWaveHeight(prev => prev.map(() => Math.random()…)), 150)
```

Ses dalgası animasyonu **görüşme boyunca** her 150 ms'de bir state
güncelliyor. Bileşende 60'tan fazla hook ve devasa bir ağaç var; bu tek
başına görüşme süresince sürekli bir CPU yükü. Üstelik çubuklar gerçek
ses seviyesini ölçmüyor — `Math.random()`.

### 6. Sinyalleşme hataları görünmez — bildirilmedi

Sinyalleşme yolundaki her `catch` boş: `catch(e){}`. Teklif/cevap
yazılamadıysa, ICE eklenemediyse, bağlantı düştüyse ne kullanıcı ne de
kayıt bunu görüyor. `pc.connectionState` ve `pc.iceConnectionState` hiç
okunmuyor — ekranda "bağlanıyor" ile "bağlanamadı" ayrımı yok.

### 7. Tek dosyada beş ekran — bildirilmedi

`LiveInterviewPage.jsx` şunların hepsini taşıyor: mülakatçı lobisi, aday
lobisi, aday bekleme ekranı, aktif görüşme (iki ayrı görünüm), bitiş
ekranı, WebRTC, STT, AI koç, soru yönetimi, cihaz yönetimi, sayaçlar.
60'tan fazla `useState`. Bu, yukarıdaki hataların hepsinin neden bir
arada yaşadığını da açıklıyor: bir yerdeki state değişimi her şeyi
yeniden çalıştırıyor.

---

## Revizyon planı

Sıra **etki/risk** oranına göre. Her faz ayrı PR.

### Faz 1 — Mikrofon ve kamera gerçekten kapansın

**Neden ilk:** gizlilik sorunu ve düzeltmesi en küçük olan madde.

- `isMicOn` değiştiğinde `stream.getAudioTracks().forEach(t => t.enabled = false/true)`.
- `isVideoOn` için `getVideoTracks()` aynısı.
- Yerel `srcObject` boşaltma davranışı korunur (kendi görüntüsünü görmemek ayrı bir tercih).
- Karşı tarafta "mikrofon kapalı" göstergesi: durum zaten `/interviews/{id}` üzerinden yazılabilir.

**Doğrulama:** iki sekme aç, birinde mikrofonu kapat, diğerinde ses
kesiliyor mu bak. Bugün kesilmiyor.

**Risk:** düşük. Parça kapatmak akışı bozmuyor, `addTrack` aynı kalıyor.

### Faz 2 — İçeri alma takılmalarını gider

- **ICE listelerini sıfırlama.** Teklif yazarken `recruiterIce`/`candidateIce` alanlarına dokunma; temizlik yeni oturum açılışında sunucu tarafında yapılsın.
- **Erken ICE'i kuyruğa al.** `remoteDescription` yokken gelen adayları bir dizide tut, `setRemoteDescription` başarılı olunca sırayla uygula.
- **TURN ekle.** STUN tek başına kurumsal ağda yetmiyor. Ücretli bir TURN ya da kendi `coturn` sunucumuz — bu bir altyapı kararı, kullanıcıya sorulacak.
- **Bağlantı durumu ekranda.** `pc.connectionState` okunup "bağlanıyor / bağlandı / bağlanamadı (yeniden dene)" gösterilsin.
- **Boş `catch`'leri kaldır.** En azından `console.error` + kullanıcıya görünür durum.

**Doğrulama:** adayı mülakatçıdan ÖNCE bağla (bugün bozulan senaryo),
bağlantı kuruluyor mu bak.

**Risk:** orta. Sinyalleşme sırası değişiyor; iki taraflı test şart.

### Faz 3 — STT gecikmesini düşür

- **`interimResults = true`.** Ara sonuçlar ekranda soluk gösterilsin, kesinleşince koyulaşsın. Algılanan gecikme en çok bundan düşer.
- **Firestore yazımını topla.** Her cümlede değil, ~2 sn'lik pencerede biriktirip tek `arrayUnion` ile yaz.
- **Yeniden başlatma boşluğunu kapat.** 300 ms'lik gecikme yerine `onend`de anında `start()`; hata olursa geri çekilerek yeniden dene.
- **Yedek yolda çift kayıt.** `stop → start` arasındaki kaybı önlemek için `MediaRecorder`ı `timeslice` ile çalıştır (`start(3000)`), durdurmadan parça al.
- **Mikrofon toggle motoru yıkmasın.** `isMicOn` STT efektinin bağımlılığından çıkarılıp ref üzerinden okunsun (ref zaten var: `isMicOnRef`).

**Risk:** orta. Transkript içeriği değişmiyor ama akış değişiyor;
manuel görüşme ve rapor yollarına dokunulmuyor.

### Faz 4 — Görüşme sırasındaki gereksiz yükü kaldır

- **Ses dalgasını gerçek ölçüme bağla ya da kaldır.** `AnalyserNode` ile gerçek seviye okunabilir; istenmiyorsa `Math.random()` animasyonu kaldırılır. Her iki durumda da 150 ms'lik state güncellemesi biter (gerçek ölçümde `requestAnimationFrame` + ref ile render'sız çizim).
- **Tek belge, tek dinleyici.** Üç ayrı `onSnapshot` yerine bir dinleyici ve türetilmiş değerler.
- **Kalp atışı 15 sn → 30 sn** ve yalnızca değer değiştiyse yaz.

**Risk:** düşük–orta.

### Faz 5 — Ekranı parçalara ayır

Faz 1–4 bittikten SONRA, davranış sabitlenmişken:

- `LiveInterviewRecruiter`, `LiveInterviewCandidate`, `InterviewLobby`,
  `InterviewFinished` ayrı dosyalara.
- WebRTC bir `useWebRTC(sessionId, isRecruiter, stream)` hook'una.
- STT bir `useSpeechToText(...)` hook'una.

**Neden en sona:** bugünkü hataların çoğu tek dosyada iç içe geçmiş
state'ten geliyor, ama önce hataları düzeltmek gerekiyor — yoksa
taşıma sırasında hangi davranışın kasıtlı olduğu bilinemez.

---

## Sorulacaklar

1. **TURN sunucusu.** Faz 2'nin tam çözümü buna bağlı. Ücretli servis mi
   (Twilio/Xirsys) yoksa kendi `coturn` sunucumuz mu? Bu bir maliyet ve
   işletme kararı.
2. **Ara sonuç gösterimi.** Transkriptte soluk "yazılıyor" metni kabul
   edilebilir mi, yoksa yalnızca kesinleşmiş cümleler mi görünsün?
3. **Ses dalgası.** Gerçek seviye ölçümüne bağlansın mı, yoksa kaldırılsın mı?

## Dokunulmayacaklar

- Skorlama, damgalama ve rapor üretme yolları. Bu plan yalnızca canlı
  görüşmenin taşıma katmanını (medya, sinyalleşme, transkript aktarımı)
  ele alıyor.
- `FaceToFacePage` yalnızca aynı kusurları paylaştığı ölçüde (mikrofon
  parçası, TURN) kapsamda.
