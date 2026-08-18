# Plan: CV Doğrulama ve Sektör Uyumu

Durum: Katman 1, Katman 2 ve sektör ölçümü yazıldı; arayüz bağlandı.
Gerçek sicil/RDAP sağlayıcıları ve ilan bazında sektör geçersiz kılma açık.

## Neden

İki gözlem tetikledi:

1. **İki yıllık deneyime 90 puan.** Bu sahtecilik değil, ölçüm eksikliğiydi:
   `experiences[]` dizisinden toplam süre hiç hesaplanmıyordu, dolayısıyla
   beyan edilen deneyim yılı ile kayıtlar hiçbir yerde karşılaştırılmıyordu.
2. **Kendi şirketinde "Growth Manager".** Bir aday en yüksek skoru almıştı
   ama şirketin adayın kendi şirketi olabileceği fark edildi. Sistem şirketler
   hakkında hiçbir şey bilmiyordu.

İkisi ayrı problem ve ayrı çözüm gerektiriyor: birincisi deterministik hesap,
ikincisi dış kaynak doğrulaması.

## Karar: üç hüküm, ve hiçbiri "yalan" değil

| Hüküm | Anlamı |
|---|---|
| `dogrulandi` | Bağımsız kaynak iddiayla uyuşuyor |
| `dogrulanamadi` | Kaynak bulunamadı — **suçlama değil** |
| `celiski` | Bulunan kaynak iddiayla çelişiyor — kırmızı bayrak yalnızca bu |

"Doğrulanamadı"yı şüphe gibi göstermek bu aracın yapabileceği en büyük
haksızlık olurdu: küçük şehirdeki bir aile şirketinde çalışmış adayı,
kurumsal geçmişli adaya göre sistematik olarak cezalandırırdı. Türkiye'de
dijital izi olmayan gerçek şirket sayısı çok.

## Karar: rapor skoru değiştirmez, soru üretir

`verifyCandidate()` hiçbir skoru güncellemez ve bir "güvenilirlik notu"
üretmez. Ürettiği şey **Mülakat Öncesi Sorulacaklar** listesi. Bir bayrağın
değeri, insanı elemesinde değil, doğru soruyu sordurmasında.

Bu, projenin her yerindeki kuralın aynısı: sistem önerir, insan karar verir
(bkz. `PLAN-ik-asistani.md` — "asistan yazmaz, önerir").

KVKK açısından da doğru taraf: otomatik karar verme yok, her bulgu bir insan
tarafından okunuyor ve kaynağı gösteriliyor.

## Karar: bilinmeyen, olumsuz değildir

Her ölçümde **kapsam (coverage)** taşınıyor:

- `experiences` alanı CV'den AI ile çıkarılıyor ve havuzun büyük kısmında
  eksik (bkz. `functions/services/enrich.js`). Eksik veriden hesaplanan toplam
  adayın beyanından küçük çıkar ve tam da "deneyimini şişirmiş" bayrağını
  tetikler. **Yani bizim ayrıştırıcı hatamız, adayın yalanı gibi görünür.**
  Bu yüzden tarihlerin bir kısmı okunamadıysa bayrak `celiski`den `dikkat`e
  düşüyor; hiç ölçüm yoksa ağır bayrak hiç üretilmiyor.
- Sektörü çözümlenemeyen şirket, sektör ölçümünde **paydaya girmiyor**.
  "İlgisiz sektör" saymak adayın kariyerinin yarısını sessizce aleyhine
  yazardı.

## Karar: istihdam boşlukları bayraklanmıyor

Teknik olarak kolay, bilerek dışarıda bırakıldı. Boşluklar sahtecilik
göstergesi değil — doğum izni, hastalık, bakım yükümlülüğü, askerlik. Bu yükü
orantısız biçimde belirli gruplar taşıyor. Sahteciliği aramak için kurulan bir
aracın, aramadığı bir şeyi cezalandıran bir ayrımcılık aracına dönüşmesinin en
kısa yolu bu olurdu.

## Karar: LinkedIn kazıma yok

LinkedIn'in aday profili sorgulayan resmî bir API'si yok (2015'te kapandı).
Bugün açık olanlar:

- **Sign In with LinkedIn (OIDC)** — yalnızca giriş yapan kişinin kendi adı,
  fotoğrafı, e-postası. İş geçmişi vermiyor.
- **Marketing Developer Platform** — reklam ve şirket sayfası; kişi araması yok.
- **Recruiter System Connect** — gerçek işe alım API'si ama LinkedIn ile iş
  ortaklığı sözleşmesi ve müşterinin Recruiter lisansı gerektiriyor.
- RapidAPI'deki "LinkedIn Data API"ler resmî değil; faturası olan scraper'lar.

Epistemik gerekçe hukukiden daha önemli: **LinkedIn profili bağımsız bir
kaynak değil, aynı kişinin aynı iddiayı ikinci kez yazdığı yer.** Fake şirket
LinkedIn'de de fake şirket olarak görünür.

"Bu şirketin kurucusu aday mı" sorusunun cevabı LinkedIn'de değil ticaret
sicilinde: biri kişinin kendi yazdığı pazarlama metni, diğeri hukuken
yayımlanmak üzere üretilmiş resmî kayıt.

## Mimari

```
utils/cvDates.js          serbest metin tarih → ölçülebilir aralık
utils/cvConsistency.js    Katman 1 — CV'nin kendi içindeki çelişkiler
utils/sectorTaxonomy.js   33 sektör + komşuluk grafı, 3 eksen
utils/sectorFit.js        kariyerin ne kadarı hedef sektörde
utils/companyClaims.js    kanıt ↔ iddia karşılaştırması, üç hüküm
services/ai/companyIntel.js    grounded şirket çözümleme
services/companyIntelStore.js  Firestore önbelleği (şirket bazlı)
services/orgProfile.js         kurumun hedef sektör profili
services/cvVerification.js     orkestratör — üçünü tek raporda birleştirir
components/VerificationPanel.jsx  aday kartındaki "Doğrulama" sekmesi
```

Şirket çözümlemesi **tek kez** yapılıyor ve hem doğrulamayı hem sektör
ölçümünü besliyor. İkinci arama saf israf olurdu.

## Sektör uyumu: neden üç eksen

Trendyol da Infoset de "yazılım" sayılabilir ama biri B2C pazaryeri, diğeri
B2B SaaS. İşe alımda ayırt eden çoğu zaman dikey sektör değil, **kime ve nasıl
satıldığı**.

```
sector — hangi dikey alan   (Infoset: müşteri deneyimi / CX)
model  — kime satılıyor     (b2b)
type   — nasıl kazanılıyor  (saas)
```

Üçü ayrı ölçülüp ayrı raporlanıyor. Tek bir "sektör uyumu %72" sayısına ezmek
hangi eksende uyduğunu görünmez kılardı — ve arayüzde zaten `industryFit` diye
üretilmeyen bir alanı okuyan boş bir halka vardı; yerine yeni bir uydurma sayı
koymak aynı hatanın süslüsü olurdu.

Ölçüm **ay ay** yapılıyor, süre toplayarak değil: paralel görevler toplandığında
4 yıllık kariyer 8 yıl görünür.

Ayrıca `stale` ayrımı var: sektör deneyimi **var ama tamamı eski** — "hiç yok"
ile aynı şey değil.

## Maliyet kontrolü

- Önbellek **şirket** bazlı, aday bazlı değil: "Trendyol" bir kez çözümlenir,
  tüm adaylara hizmet eder.
- Bulunan kayıt 180 gün, bulunamayan 30 gün taze. Negatifi altı ay dondurmak
  yanlış — şirket bu arada web sitesi açmış olabilir.
- Tek çalıştırmada en fazla 8 canlı arama. **Tavana takılan şirketler rapora
  "taranmadı" olarak yazılır** — sessiz kısıtlama yok.
- Rapor saklanmıyor; pahalı olan şirket çözümlemesi saklanıyor. Raporu yeniden
  üretmek bedava.

## Açık konular

- `registry` verisi doğrudan MERSİS/Ticaret Sicil Gazetesi'nden değil,
  **grounded aramanın "sicilde şunu buldum" demesinden** geliyor. Zincirin en
  zayıf halkası burası. Gerçek sağlayıcı bağlanmalı.
- **RDAP domain yaşı** bağlanmadı — ücretsiz, kimlik doğrulaması gerektirmiyor,
  bağımsız kanıt. Tarayıcıdan CORS engelli olduğu için bir backend ucu gerekiyor.
- **İlan bazında sektör geçersiz kılma** yok. Bir ilan kurumun ana sektöründen
  farklı bir dikeye bakıyor olabilir (fintech ekibine alım). Hedef profil tek
  yerden okunuyor (`services/orgProfile.js`), sonradan tek noktadan eklenebilir.
- Kıdem merdiveni (`cvConsistency.seniorityBand`) kaba ve şirketten şirkete
  değişiyor: startup'ta "Head of Growth" üç kişilik ekibin başı. Bu yüzden
  yalnızca iki basamak ve üzeri sıçramalar bayraklanıyor ve ağırlık hep
  `dikkat`.
- Toplu doğrulama (havuzun tamamı) yok — tetikleme aday kartından elle.
