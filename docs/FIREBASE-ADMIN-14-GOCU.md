# firebase-admin 14 Göçü (bekliyor)

`functions/package.json` içinde **`firebase-admin` 13'te tutuluyor.** Sebebi
ve göçün ne gerektirdiği burada.

## Ne oldu

Bir bağımlılık güncellemesiyle `firebase-admin` 14.3.0'a çıktı ve ana dal
kırıldı. Sürüm 14, eski "namespace" API'sini kaldırmış:

| Kalkan | Yerine gelen |
|---|---|
| `admin.apps` | `admin.getApps()` |
| `admin.firestore()` | `getFirestore()` — `firebase-admin/firestore` |
| `admin.firestore.FieldValue` | `FieldValue` — `firebase-admin/firestore` |
| `admin.auth()` | `getAuth()` — `firebase-admin/auth` |
| `admin.storage()` | `getStorage()` — `firebase-admin/storage` |

İlk satır `functions/config/firebaseAdmin.js` içinde patlıyordu ve **sunucudaki
her dosya bu modülden geçiyor**: API hiç açılmıyordu. Testlerde de aynı hata
"0 test" olarak görünüyordu — süit yüklenemiyordu.

## Neden hemen göç edilmedi

Kod tabanında **38 kullanım, 13 dosya** var. Bunların bir kısmı yazma
işlemlerinde (`FieldValue.serverTimestamp`, `FieldValue.delete`,
`FieldValue.increment`) ve yanlış göç edilirse sessizce bozuk veri yazar —
zamanı `null` geçilen bir kayıt, saklama süresi hesabında "tarihi okunamadı"
kovasına düşer.

Ana dal kırıkken yapılacak iş bu değildi: önce çalışır hâle getirmek, sonra
göçü planlı yapmak.

## Göç yapılırken

1. Tek tek değil, dosya dosya: her dosya kendi testiyle birlikte geçirilmeli
2. `FieldValue` kullanımlarına özellikle dikkat — sessiz veri bozulması riski
   burada
3. `functions/config/firebaseAdmin.js` en son: diğer her şey ondan geçiyor
4. Göç bitmeden sürüm sabiti kaldırılmamalı

## Bu arada

Dependabot 14'ü tekrar önerecek. O PR, göç yapılana kadar kapatılmalı —
merge edilirse API yine açılmaz.
