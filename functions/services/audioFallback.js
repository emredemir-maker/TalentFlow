// Gemini ses yedeği anahtarı (sunucu tarafı).
//
// NEDEN VAR: Uygulama içi mülakatta Chrome'un Web Speech API'si ücretsiz.
// Web Speech olmayan tarayıcılarda (ör. Firefox) istemci sesi ~3 saniyelik
// parçalar hâlinde Gemini'ye yolluyor: saatte ~1.200 çağrı, katılımcı-saat
// başına kabaca +54–200 TL. Bu yedek kâr marjını eksiye çevirebiliyor.
//
// KARAR (Emre): Pahalı ses yedeği VARSAYILAN KAPALI; yalnız "uygulama içi
// mülakat" ek paketini alan müşteride açılır. İstemcideki bayrak tek başına
// yetmez (eski paket ya da elle istek atan biri yine çağırabilir), bu yüzden
// sesi kabul eden uçlar bu anahtar kapalıyken isteği REDDEDER.
//
// NASIL AÇILIR: functions ortamında AUDIO_FALLBACK_ENABLED=true. Üretimde
// GitHub repo değişkeni (Settings → Secrets and variables → Actions →
// Variables) `AUDIO_FALLBACK_ENABLED` = true yapılır ve dağıtım yeniden
// çalıştırılır; workflow değeri functions/.env'e yazar. Her istekte okunur.
//
// GELECEK: Çok şirketli yapıya geçişte paket/ek paket altyapısı gelince
// anahtar şirket başına `inAppInterviewAddon` hakkından beslenecek; uçlar
// yine yalnızca isAudioFallbackEnabled() sonucuna bakacak.

const ACIK_DEGERLER = new Set(['1', 'true', 'yes', 'on', 'evet']);

export const AUDIO_FALLBACK_DISABLED_CODE = 'AUDIO_FALLBACK_DISABLED';

export function isAudioFallbackEnabled(env = process.env) {
    const raw = env.AUDIO_FALLBACK_ENABLED;
    if (typeof raw !== 'string') return false;
    return ACIK_DEGERLER.has(raw.trim().toLowerCase());
}

// Ses kabul eden uçların önüne konur. Gövde ayrıştırılmadan (multer'dan önce)
// ve Gemini çağrılmadan reddeder.
export function requireAudioFallback(req, res, next) {
    if (isAudioFallbackEnabled()) return next();
    return res.status(403).json({
        error: 'Bu özellik için Chrome kullanın',
        code: AUDIO_FALLBACK_DISABLED_CODE,
    });
}
