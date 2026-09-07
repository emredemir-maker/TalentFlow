# Yetki Matrisi

Kimin hangi kişisel veriye erişebildiği ve **neden**. KVKK md. 12/1 kapsamında
istenen "erişim yetkilerinin belirlenmiş olması" belgesidir; hukuk birimiyle
yapılacak görüşmenin dayanağı budur.

Bu belge kodun tarifi değil, kodun **kaynağı**: burada yazan bir kısıt
`firestore.rules` ve `storage.rules` içinde uygulanıyor olmalı. Bir kısıt
belgede var ama kuralda yoksa, o kısıt yoktur.

Son güncelleme: 2026-09-07

---

## Roller

| Rol | Kim | Nasıl atanır |
|---|---|---|
| `super_admin` | Sistem sorumlusu | Yalnızca `scripts/grant-super-admin.mjs` ile; istemciden atanamaz |
| `recruiter` | İşe alım uzmanı | Davet ya da izinli e-posta alan adı |
| `department_user` | Departman yöneticisi / işe alım talep eden | Yalnızca davetle; davette departmanları da yazılı |
| anonim | Aday | Otomatik; yalnızca herkese açık sayfalarda |

Kayıt **davet ya da izin listesi olmadan mümkün değil**. İnternetten gelen biri
kendi başına hesap açamıyor.

---

## Aday verisine erişim

| Rol | Aday listesi | Aday detayı | CV dosyası | Değiştirme | Silme |
|---|---|---|---|---|---|
| `super_admin` | Tümü | Tümü | Evet | Evet | Evet |
| `recruiter` | **Tümü** | Tümü | Evet | Evet | Evet |
| `department_user` | Yalnızca kendi departmanları + kendisine açılanlar | Aynı kısıt | Evet | Hayır | Hayır |
| anonim (aday) | Hayır | Yalnızca kendi kaydı, link ile | Hayır | Hayır | Hayır |

### İşe alım uzmanının tüm adayları görmesi — bilinçli tercih

`recruiter` rolü havuzun tamamını görüyor. Bu bir eksiklik değil, verilmiş bir
karardır:

- İşe alım uzmanının işi havuzun tamamı üzerinde çalışmak: bir ilana uygun aday
  başka bir ilanın başvurusundan çıkabiliyor, adaylar ilanlar arasında
  taşınıyor, mükerrer kayıt taraması havuzun tamamına bakıyor.
- Ekip küçük ve herkes aynı süreçte çalışıyor.
- İlan bazlı kısıt, ürünün temel akışını (aday havuzu, kıyaslama, mükerrer
  tespiti) çalışmaz hâle getirirdi.

Ekip büyüdüğünde ya da farklı şirketler/markalar aynı kuruluma alındığında bu
karar yeniden değerlendirilmelidir. Alternatifler: ilan bazlı kısıt ya da
`department_user` kısıtının uzmanlara da uygulanması.

### Departman kullanıcısının kısıtı NEREDE uygulanıyor

Kuralın kendisinde. Firestore, listeleme kurallarını dönecek her belgeye karşı
değerlendiriyor ve biri bile geçemezse sorgunun tamamını reddediyor;
dolayısıyla süzgeçsiz bir sorgu reddediliyor.

> **Geçmiş durum:** bu kısıt bir dönem yalnızca istemcinin koyduğu süzgeçle
> sağlanıyordu. Departman kullanıcısı tarayıcı konsolundan süzgeçsiz bir sorgu
> atarak bütün adayları okuyabiliyordu. Kural düzeyine taşındı.

---

## Diğer veri türleri

| Veri | Kim okuyabilir | Not |
|---|---|---|
| CV dosyaları (Storage) | Anonim olmayan her iç kullanıcı | Klasör **listeleme kapalı**; dosyaya yalnızca kayıttaki adresle ulaşılıyor |
| Mülakat oturumları | Tekil: link sahibi (aday); listeleme: iç kullanıcı | Oturum kimliği yetki anahtarı |
| E-posta yazışmaları | `recruiter` | |
| Şirket istihbaratı önbelleği | `recruiter` | Kurucu adları taşıyor; listeleme kapalı |
| Davetiyeler | `super_admin` | Kayıt sırasındaki sorgu sunucuda yapılıyor |
| API anahtarları, entegrasyon sırları | **Hiçbir istemci** | Yalnızca sunucu, Admin SDK ile |
| AI kullanım raporu | `super_admin` | İşletme bilgisi |
| Erişim kayıtları (denetim defteri) | `super_admin` | Yazma herkese açık, **değiştirme ve silme kapalı** |
| Departman yapısı | Her iç kullanıcı | Kişisel veri içermiyor |

---

## Kişisel verinin sistem dışına çıktığı yerler

| Nereye | Ne | Kısıt |
|---|---|---|
| Google Gemini | CV'nin **mesleki içeriği** | Ad, e-posta, telefon, LinkedIn, GitHub gönderilmeden önce maskeleniyor |
| Google Firebase (ABD) | Bütün veri | Barındırma; yurt dışına aktarım kapsamında |
| E-posta sağlayıcısı | Adayla yazışma | |
| Excel dışa aktarma | Liste hâlinde aday verisi | Erişim defterine **aday sayısıyla** yazılıyor |

Maskeleme regex tabanlıdır ve **kusursuz değildir**: alışılmadık biçimde
yazılmış bir e-posta ya da ad kalıbı kaçabilir. Gönderilen veriyi asgariye
indiren bir tedbirdir, garanti değildir.

---

## Bilinen sınırlar

Bunlar açıkça yazılıdır ki denetimde "bilmiyorduk" durumuna düşülmesin.

**Erişim kaydı zorlayıcı değil.** Uygulama Firestore'u tarayıcıdan doğrudan
okuyor; SDK'yı doğrudan kullanan bir iç kullanıcı kayıt bırakmadan veri
okuyabilir. Kayıt normal kullanımın izini tutuyor, kötü niyetli bir iç
kullanıcıyı durdurmuyor. Zorlayıcı hâle getirmek bütün okumaları sunucudan
geçirmeyi gerektirir.

**Departman kullanıcısı CV dosyasına erişebilir.** Storage kuralı dosya
düzeyinde departman ayrımı yapmıyor; ancak dosyanın adresini öğrenmek için
aday kaydını okuyabilmek gerekiyor, o da kısıtlı.

**Tek kiracılı mimari.** Kurulum tek bir organizasyona ait. Birden fazla
şirketin aynı kuruluma alınması durumunda bu matris geçersizdir.
