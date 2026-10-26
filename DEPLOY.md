# TalentFlow Canlıya Alma (Deployment) Rehberi

Uygulamanız canlıya çıkmaya hazır! Build işlemi tamamlandı ve `dist/` klasörü oluşturuldu.
Aşağıdaki yöntemlerden birini seçerek yayına alabilirsiniz.

## Yöntem 1: Firebase (GitHub Actions — önerilen)

Üretim, Hub-Inn ile **paylaşılan** `agentinn-nyqpx` projesinde. `main`'e merge edilen her değişikliği
`.github/workflows/firebase-deploy.yml` dağıtır. Elle dağıtmak gerekirse yalnızca TalentFlow'un parçaları:

```powershell
npx firebase deploy --only "hosting:talentinn,functions:talentflow,firestore,storage" --project agentinn-nyqpx
```

Düz `firebase deploy` ya da filtresiz `--only functions` kullanmayın — ayrıntı: `docs/yeni-proje-kurulumu.md`.

## Yöntem 2: Vercel (Alternatif)

Vercel kullanmak isterseniz:

1. Terminalde şu komutu çalıştırın:

```powershell
npx vercel
```

2. Sorulan sorularda varsayılan seçenekleri (Enter tuşu) kabul ederek ilerleyin.
2. Giriş yapmanız gerekirse tarayıcı açılacaktır.

## Yöntem 3: Netlify (Sürükle-Bırak)

Kod yazmadan yayına almak için:

1. [Netlify Drop](https://app.netlify.com/drop) sayfasına gidin.
2. Proje klasörünüzdeki **`dist`** klasörünü bu sayfaya sürükleyip bırakın.
3. Siteniz saniyeler içinde yayında olacaktır!

## Notlar

- `dist/` klasörü, uygulamanızın son halini (production build) içerir.
- Eğer değişiklik yaparsanız, önce `npm run build` komutunu çalıştırıp `dist/` klasörünü güncellemeyi unutmayın.
