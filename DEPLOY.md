# TalentFlow Canlıya Alma (Deployment) Rehberi

Uygulamanız canlıya çıkmaya hazır! Build işlemi tamamlandı ve `dist/` klasörü oluşturuldu.
Aşağıdaki yöntemlerden birini seçerek yayına alabilirsiniz.

## Yöntem 1: Firebase Hosting (Önerilen)

Projeniz zaten Firebase ile yapılandırıldı. Terminalde şu komutu çalıştırın:

```powershell
npx firebase deploy --only hosting
```

Eğer giriş yapmanız istenirse:

1. `npx firebase login` komutunu çalıştırın.
2. Açılan tarayıcı penceresinden Google hesabınızla giriş yapın.
3. Tekrar `npx firebase deploy --only hosting` komutunu çalıştırın.

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
