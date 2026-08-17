# Plan: İK Asistanı — tek araçlı sorgudan yaşayan asistana

Tarih: 2026-08-14
Durum: Faz 0, 1, 2, 4 ve 5 yazıldı. Faz 3 (pozisyon teşhisi), Faz 6 (yetkinliğe
göre aday önerisi) ve Faz 7 (kurum hafızası) sırada. Faz 5'te yalnızca 5/4
(benzer ilanlarla karşılaştırma) kapsam dışı bırakıldı.

## Amaç

Asistan bugün yalnızca aday havuzunda filtre çalıştırabiliyor. Hedeflenen beş yetenek:

1. Pozisyon oluşturmaya yardım
2. Mülakat raporlarını (transcript dahil) inceleyip yorumlama
3. Pozisyon analizinde "neye odaklanmalıyım" sorusuna cevap
4. Maaş beklentisi ve yan haklar için piyasa araştırması (web kaynaklı)
5. Belli bir yetkinliğe göre aday önerisi

Hepsi doğal dilde yürümeli ve asistan kullanıldıkça iyileşmeli.

---

## Teşhis: bugün neden statik

Omurga doğru. `src/services/ai/hrAssistant.js` soruyu **sorguya** çeviriyor, sayıyı **kod**
hesaplıyor (`src/utils/candidateQuery.js`), model yalnızca yorumluyor. Bu disiplin korunmalı:
modele doğrudan "kaç aday var" diye sormak bu projede iki kez denendi ve iki kez uydurma
cevap üretti.

Statiklik üç somut kısıttan geliyor:

**1. Tek araç var.** Çevirmenin alan sözlüğü sabit: `score, requirement, gate, star, scan,
location, skill, stage, text` (`hrAssistant.js:27-36`). Yukarıdaki beş yeteneğin **hiçbiri**
bu sözlükle ifade edilemiyor; hepsi `unsupported` dalına düşüyor. Maaş sorusunun cevabı
prompt'ta birebir yazılı: *"Sistemde maaş beklentisi alanı tutulmuyor."* (`hrAssistant.js:74-75`)

**2. Konuşma belleği yok.** `HrAssistantPanel.jsx:31` `turns` tutuyor ama modele **geri
göndermiyor**. Her soru sıfırdan başlıyor. "Peki onlardan İstanbul'da olanlar?" çalışmıyor —
asistan "onlar"ın kim olduğunu bilmiyor. Sohbet hissini en çok kıran şey bu.

**3. Sadece okuyor.** Taslak üretemiyor, öneri sunamıyor.

**Hazır olan altyapı:** `functions/services/gemini.js` içindeki `generateGrounded`, Gemini +
Google Search çalıştırıp kaynakları döndürüyor ve arama yapılamazsa `grounded: false` diyerek
dürüstçe işaretliyor. Asistana **hiç bağlı değil** — yalnızca `/api/ai` ucu kullanıyor.
Madde 4'ün altyapısı fiilen hazır.

---

## Karar: "eğitim" değil, erişim + hafıza + geri bildirim

Fine-tuning bu ihtiyacı karşılamaz ve plana **alınmadı**. Gerekçe:

- İnce ayar **üslup ve biçim** öğretir, **olgu** öğretmez. Adayları, pozisyonları, dünkü
  mülakatı bilmesini sağlamaz.
- Veri her gün değişiyor; eğitilmiş model eğitildiği anda donar.
- Elde yüzlerce etiketli örnek yok.
- İşe alım ürününde **denetlenebilirlik** şart. İnce ayarda "model neden böyle dedi"
  sorusunun cevabı yoktur.

"Yaşayan, öğrenen" hissi üç mekanizmadan çıkar:

| Mekanizma | Ne yapar | Faz |
|---|---|---|
| **Erişim** | Güncel veriyi okur: mülakat kaydı, transcript, ilan, skor kırılımı | 2-6 |
| **Kurum hafızası** | Kullanıcının onayladığı kalıcı notlar — görünür, düzenlenebilir, silinebilir | 7 |
| **Geri bildirim izi** | Hangi öneri kabul edildi, hangisi reddedildi | 1'de toplanır, 7'de kullanılır |

Kurum hafızasının ayrı ve görünür durması, projenin baştan koyduğu ilkeyle aynı: *bir
şirketin yargısı skorlama motorunun içine gömülmez.*

## Karar: asistan yazmaz, önerir

**2026-08-14 tarihinde kullanıcı kararı:** Asistan pozisyonu doğrudan kaydetmez. Taslak
üretir ve öneri sunar; kullanıcı görür, düzenler, **onayıyla** kaydeder. Geri alınamaz hiçbir
işlem modele bırakılmaz. Bu kural Faz 5'i bağlar ve sonraki yazma yetenekleri için de
varsayılandır.

---

## Mimari: tek araçtan araç setine

Tek yapısal değişiklik bu. Çevirmen artık "hangi filtre" değil **"hangi araç"** seçer.

```
Soru → Yönlendirici → [araç seç] → kod hesaplar → anlatıcı yorumlar
                       ├─ aday_sorgusu        (mevcut)
                       ├─ mulakat_incelemesi  (Faz 2)
                       ├─ pozisyon_teshisi    (Faz 3)
                       ├─ piyasa_arastirmasi  (Faz 4)
                       ├─ pozisyon_taslagi    (Faz 5)
                       └─ yetkinlik_onerisi   (Faz 6)
```

Her aracın kendi şeması, kendi hesaplayıcısı, kendi anlatıcısı olur. Değişmeyen kural:

> **Ölçüm kodda, model yalnızca ifade eder.** Ham CV ve transcript hiçbir noktada talimat
> konumuna geçmez.

---

## Fazlar

### Faz 0 — Konuşma belleği

- 0/1 Son N turu (soru + üretilen sorgu + sonucun özeti) çevirmene bağlam olarak gönder
- 0/2 Sohbeti Firestore'da kullanıcı bazında sakla; sayfa yenilenince kaybolmasın
- 0/3 Bağlam penceresini sınırla (tur sayısı + karakter tavanı) ve tavana değince en eskiyi düşür
- 0/4 "Yeni konu" düğmesi — bağlamı bilerek temizleyebilmek

**Kabul:** "Growth PM'de 70 üstü adaylar" → "peki onlardan İstanbul'da olanlar" ikinci soruda
doğru çalışıyor.

### Faz 1 — Araç yönlendirici

- 1/1 Yönlendirici prompt'u: soru → `{ arac, parametreler }`
- 1/2 Mevcut aday sorgusu ilk araç olarak takılır (davranış birebir korunur)
- 1/3 Araç kaydı (registry): her araç `{ ad, şema, çalıştır, anlat }` sözleşmesini uygular
- 1/4 Tanınmayan/desteklenmeyen soru → **hangi araçların olduğunu söyleyen** dürüst cevap
- 1/5 Her cevaba 👍/👎 + serbest not; Firestore'a yazılır (**Faz 7 bunu kullanacak, şimdi
      yalnızca toplanır — toplanmamış geri bildirim sonradan üretilemez**)

**Kabul:** Mevcut tüm sorular eskisi gibi çalışıyor; yeni araç eklemek tek dosya + kayıt satırı.

### Faz 2 — Mülakat incelemesi

Transcript ve rapor zaten `interviews/{sessionId}` kaydında — yeni veri boru hattı gerekmiyor.

- 2/1 Araç: pozisyon ya da aday bazında mülakat kayıtlarını topla
- 2/2 Kodun hesapladığı çerçeve: damga dağılımı, zorunlu kapısı, kanıt oranı, cevapsız maddeler
- 2/3 Transcript'ten **alıntılı** yorum — her iddia bir alıntıya bağlanır, bağlanamıyorsa yazılmaz
- 2/4 **Damgala ve sakla:** inceleme `interviewReviewSchema` + transcript/ilan parmak izi ile
      kayda yazılır; girdiler değişmedikçe yeniden üretilmez (bkz. Riskler → Tutarlılık)
- 2/5 Damga tutmuyorsa "bu inceleme eski görüşme metnine ait" denir, sessizce yeniden üretilmez

**Kabul:** Aynı soru iki kez sorulduğunda **aynı** yorum döner.

### Faz 3 — Pozisyon teşhisi ("neye odaklanmalıyım")

Bu bir sorgu değil, ölçülebilir bulgular üzerine kurulu bir teşhis:

- 3/1 Hangi zorunlu madde havuzun çoğunu eliyor → *ilan gerçekçi mi?*
- 3/2 Hangi madde hiç ayrıştırmıyor (herkes karşılıyor) → *o madde bilgi taşımıyor*
- 3/3 Kaç aday hiç taranmamış / değerlendirmesi bayat
- 3/4 Skor dağılımı nerede yığılmış; zorunlu kapısını geçen kaç kişi var
- 3/5 Anlatıcı bunları yorumlar — **genel geçer İK tavsiyesi vermez**, yalnızca bu sayılara bakar

**Kabul:** Her cümle bir sayıya dayanıyor; sayısı olmayan tavsiye çıkmıyor.

### Faz 4 — Piyasa araştırması (maaş & yan haklar)

- 4/1 `generateGrounded`'ı asistana bağla (sunucu ucu üzerinden)
- 4/2 Sorgu pozisyon başlığı + seviye + konumdan kurulur
- 4/3 **Kaynaklar her zaman gösterilir.** Kaynaksız cevap gösterilmez
- 4/4 `grounded: false` ise açıkça "arama yapılamadı, bu modelin hatırladığı" etiketi
- 4/5 Sonuç bir bant olarak sunulur, tek sayı olarak değil; tarih ve para birimi yazılır

**Kabul:** Kaynak listesi boşken ekranda maaş rakamı **görünmüyor**.

### Faz 5 — Pozisyon taslağı (öneri, kayıt kullanıcıda)

- 5/1 Doğal dilden ilan taslağı: başlık, özet, zorunlu/tercihen maddeler
- 5/2 Maddeler **ölçülebilir** yazılır — mevcut damga motoru bunları değerlendirebilmeli
- 5/3 Taslak düzenlenebilir biçimde sunulur; kaydetme **kullanıcı eylemi**
- 5/4 Benzer açık ilanlarla karşılaştırma: çakışan maddeler, eksik kalanlar
      *(kapsam dışı bırakıldı — 2026-08-17 kullanıcı kararı)*
- 5/5 İsteğe bağlı: Faz 4 çıktısıyla maaş bandı önerisi (kaynaklarıyla)

**Kabul:** Asistan hiçbir koşulda `positions` koleksiyonuna kendi başına yazmıyor.

#### Yazılırken çıkan üç karar

**Her madde kaynağını taşıyor.** Bir taslak, tanımı gereği kullanıcının
söylemediği şeyler önerir — yoksa taslak değil dikte olurdu. Tehlike şu:
"3-5 yıl deneyim" gibi bir madde makul görünür, kullanıcı onu kendi yazdığı
sanır ve o madde GERÇEK ADAYLARI eler. Bu yüzden her madde `source` taşıyor
(`kullanici` / `oneri`) ve ekranda "öneri" rozetiyle ayrılıyor. Kaynağı
belirsiz madde ÖNERİ sayılıyor: kullanıcı fazladan bir maddeyi gözden geçirir,
eksik gözden geçirmez.

**Denetim modelde değil kodda.** Prompt'a "öncelik kelimesini metne yazma"
demek bir dilek. `lintDraft` onu ölçüyor: metinde kalmış bir "tercihen",
damgalama yapan modele işaretle ÇELİŞEN sinyal verir ve model metne inanır.
Aynı yerde uzun madde (birden çok şey soruyor), tekrar eden madde, hiç zorunlu
olmaması ve fazla zorunlu olması da ölçülüyor. Hiçbiri kaydetmeyi ENGELLEMİYOR
— engellemek, kullanıcının kendi ilanı hakkındaki kararını sisteme devretmek
olurdu.

**Bazı bilinmeyen band forma taşınmıyor.** İlan formundaki brüt/net seçicisinin
boş seçeneği yok ve varsayılanı brüt. Bazı bilinmeyen bir bandı oraya yazmak,
bilinmeyen bir şeyi BRÜT diye iddia etmek olur. Rakamı taşımamak, yanlış
etiketle taşımaktan iyi — ekran bunu söylüyor.

Maaş bandı iki kaynaktan gelebiliyor ve ikisi de kullanıcı eylemiyle taslağa
giriyor: **kendi ilanlarınız** (`utils/internalBand.js` — ücretsiz, aynı
birimden en az 3 ilan yoksa sayı vermez, çevrim yapmaz) ve **piyasa**
(Faz 4, kaynaklarıyla).

### Faz 6 — Yetkinliğe göre aday önerisi

- 6/1 Yetkinlik → gereksinim maddesi / STAR boyutu / beceri eşlemesi
- 6/2 Sıralama **kanıta** dayanır: hangi madde hangi cevapla kapandı
- 6/3 Her öneri gerekçesiyle gelir — "şu aday iyi" değil, "şu madde şu alıntıyla karşılandı"
- 6/4 Kanıtı olmayan aday listeye **girmez**; "değerlendirilmemiş" olarak ayrı sayılır

**Kabul:** Gerekçesiz tek bir öneri satırı yok.

### Faz 7 — Kurum hafızası + geri bildirimin kullanılması

- 7/1 Kurum notları: kullanıcının onayladığı kalıcı kurallar (*"Growth PM'de SQL şart değil"*)
- 7/2 Notlar görünür bir ekranda listelenir, düzenlenir, silinir — gizli hafıza yok
- 7/3 İlgili notlar araç prompt'una bağlam olarak enjekte edilir (talimat olarak değil)
- 7/4 Faz 1'de toplanan 👍 cevaplardan few-shot örnek havuzu
- 7/5 "Asistan neyi öğrendi" ekranı — hangi not, hangi geri bildirim, ne zaman

**Kabul:** Asistanın davranışını değiştiren her şey bir ekranda görülebiliyor ve geri alınabiliyor.

---

## Ek: Maaş zinciri (2026-08-16 kararları)

Kullanıcının gözlemi: *"Adaylar genel olarak iyiler ancak maaş bütçemin çok
üzerindeler."* Bu cümle hiçbir yere yazılamıyordu — ne ilanın bütçesi ne
adayın beklentisi sistemde vardı.

| Adım | Durum |
|---|---|
| 1/4 İlana bütçe bandı | ✅ PR #161 |
| 2/4 Aday beklentisi (modal alanı) | ✅ PR #162 |
| 2/4b Transkriptten çıkarım (motor + bağlantı) | ✅ PR #163, #164 |
| Brüt/net ayrımı | ✅ PR #166 |
| 3/4 Fark raporu | ✅ PR #165 |
| Toplu geriye dönük tarama | ✅ yazıldı |
| 4/4 Bant önerisi | veri eşiğe ulaşınca |

### Değişmeyen kural: birim eksikse karşılaştırma yok

Bir maaş rakamı üç birim taşımadan ölçüm değildir: **para birimi, dönem,
brüt/net**. Üçünden biri eksik ya da iki taraf arasında farklıysa
`compareToBand` karşılaştırmayı REDDEDER ve sebebini yazar.

**Çevrim yapılmaz.** Ne kur (dalgalanır) ne brüt↔net (vergi dilimine,
kümülatif matraha ve yıla bağlı, kişiden kişiye değişir). Uydurma bir çevrim,
uydurma bir karşılaştırma üretir — ve bu zincirin çıktısı bir bütçe kararı.

**Bazın varsayılanı YOK.** Para birimi ve dönemde makul varsayılan var
(TRY / aylık); bazda yok ve olmamalı. Sebebi hatanın büyüklüğü değil
GÖRÜNÜRLÜĞÜ: yanlış dönem 12 kat sapar ve göze batar, yanlış baz 1.4 kat
sapar ve batmaz. Belirtilmemişse null kalır, karşılaştırmaya girmez.

### Beklentisi bilinmeyen aday "bandın içinde" sayılmaz

Ayrı kefede durur ve anlatıcı bunu söylemekle yükümlüdür. Saymak, tabloyu
olduğundan iyimser yapmak olurdu.

### Sıradaki iş: toplu geriye dönük tarama

Geçmiş görüşmelerin transkriptlerinde rakamlar zaten var ama `candidateSalary`
alanı onlar kaydedilirken yoktu. Tasarım:

- Tek ekran, satır başına bir görüşme
- Model bulduysa **alıntısıyla** öneri (kabul / reddet)
- Bulamadıysa **boş alan** — kullanıcı elle yazar (transkript orada okunabilir)
- **Brüt/net toplu işaretleme** düğmesi: bir işe alımcının havuzu genelde
  tutarlıdır ("hepsi net")
- Onay ritüele dönüşmesin diye alıntılar yan yana durur; 60 modal açtırmak
  herkesi "kabul, kabul, kabul" demeye iter ve onayı anlamsızlaştırır

Beklenti: 60 görüşmenin hepsinde rakam çıkmaz. Aday yalnızca "şu an 70
alıyorum" demişse motor bilerek boş döner — mevcut maaşı beklenti sanmak tüm
tabloyu kaydırırdı.

#### Yazılırken çıkan dört karar

**Tarama bilerek yavaş.** Sunucudaki `aiLimiter` dakikada 20 istek geçiriyor.
60 satırı olabildiğince hızlı sürmek, 20'nciden sonra 429 duvarı demek:
`fetchWithRetry` üç kez dener, üçü de aynı dakikaya düşer, satır "taranamadı"
ile kapanır — ve kullanıcı bunu *modelin bulamadığı* sanır. Çağrılar arasında
4 saniye var (15/dk), ekranda kalan süre yazıyor ve durdurma düğmesi var.
Bekleyen bir çubuk, sessizce yarısı düşmüş bir listeden iyidir.

**Beklentisi kayıtlı görüşme listeye girmiyor.** Girseydi tarama, insanın odada
duyup yazdığı rakamın üstüne modelin okuduğu rakamı öneriyor olurdu.

**Toplu brüt/net yalnızca BOŞ olanı doldurur.** Bir satırda baz doluysa o damga
adayın kendi sözünden geldi ("net 95 bin isterim"); havuz geneline dair bir
kabulün onu ezmesi, ölçülmüş bir şeyi varsayımla değiştirmek olurdu.

**Yazma yalnızca `interviews/{sessionId}`'e.** Fark raporu beklentiyi oradan
okuyor. Aday belgesindeki `interviewSessions[]` kopyasına dokunulmuyor: o alanı
bugün hiçbir ekran okumuyor ve diziyi istemciden yeniden yazmak, bu projede bir
kez yaşanmış "hayalet yazım" yarışını geri getirirdi.

Rakamın kaynağı (`candidateSalaryMeta`: alıntı mı, elle mi, kim, ne zaman)
kayda geçiyor — altı ay sonra "bu sayıyı kim koydu" sorusunun cevabı olmadan
bir bütçe raporunun dayanağı da olmaz.

### 4/4 için eşik

Bant önerisi ("şu deneyim ve şu puan aralığına bakın") ancak bandın İÇİNDE
kalan aday sayısı **5 veya daha fazlaysa** kurulabilir. Altındaysa model sayıyı
söyleyip öneri vermediğini belirtir. Az veriden bant üretmek istatistik değil,
kılık değiştirmiş tahmindir — ve çıktısı bir bütçe kararıdır. Kural prompt'ta
yazılı (services/ai/interviewReviewer.js).

---

## Riskler

**Enjeksiyon yüzeyi büyüyor.** Transcript adayın **kendi sözleri** — CV'den bile açık bir
enjeksiyon kanalı. Faz 2'de "adayın cevabı" ile "sistem talimatı" arasındaki duvar bugünkü
kadar sert kalmalı: veri hiçbir zaman talimat konumuna geçmez.

**Yanlılık.** Aday öneren bir asistan ayrımcılık üretebilir. Öneri her zaman gerekçesiyle ve
kanıtıyla gelir; kanıtı olmayan aday listeye girmez.

**Tutarlılık.** Aynı transcript iki kez incelenirse iki farklı yorum çıkar. Bu projede tam
olarak yaşandı: aynı aday iki taramada 80 ile 65 aldı. Asistan salı "iletişimi güçlü" deyip
perşembe "iletişimde kanıt zayıf" derse, kullanıcı hangisine güveneceğini bilemez ve
asistanın **tamamına** olan güven gider. Çözüm mevcut düzenin aynısı: `evalSchema` /
`requirementsFingerprint` / `coverageSchema` gibi **damgala ve sakla** — girdi değişmedikçe
yeniden üretme, değiştiğinde damga tutmasın ve bunu söyle.

**Maliyet — risk değil.** Transcript yalnızca gerçekten görüşülen adaylarda var ve zaten
mülakat kaydının içinde; hacim aday havuzuyla değil mülakat sayısıyla sınırlı. 45 dakikalık
bir görüşme kabaca 12-15 bin token, bir inceleme 1 kuruşun altında, 100 mülakat ≈ 1 dolar.
Bu hacimde maliyet kısıt değil. (Tahmindir; `recordUsage` verisiyle doğrulanmalı.)

---

## Sıralama önerisi

**Faz 0 + Faz 1 birlikte.** İkisi tek başına yeni yetenek getirmiyor ama sonraki beş fazın
hepsi bunların üstüne oturuyor — ve konuşma belleği tek başına "statik" hissinin yarısını
çözüyor.

Sonra öncelik sırasına göre 2 / 3 / 4.

**Faz 7 sona bırakılmaz ama başa da alınmaz:** geri bildirim düğmesi Faz 1'de eklenir ve veri
baştan birikir; kullanan katman sonra yazılır. Toplanmamış geri bildirim sonradan üretilemez.

## Açık konular

- `recordUsage` verisini okuyan bir uç/ekran yok — maliyet tahminleri doğrulanamıyor
- Ön skor `temperature` ayarsız çalışıyor (derin tarama `temperature: 0` kullanıyor); aynı CV
  yeniden ayrıştırılırsa ön skoru oynayabilir
