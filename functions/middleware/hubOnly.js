// functions/middleware/hubOnly.js
//
// Girişler Clyro Hub'dan: iki aşamalı doğrulama yalnız Hub'da olduğu için Google ya da şifreyle doğrudan alınan jeton MFA'yı
// atlar. Özel jetonu yalnız Hub basar (Talent basmaz).
//
// Geri alınabilir, üç adımlı ayar HUB_ONLY_LOGIN (functions/.env):
//   off (varsayılan): bugünkü davranış.
//   report: reddetmez, yalnız kaydeder. Kapatmadan önce hangi yolun kullanıldığını gösterir.
//   enforce: doğrudan jeton 403. Sorun çıkarsa ayarı geri almak yeter.
// Tanınmayan değer `report` sayılır: yanlış yazım kapıyı ne sessizce kapatır ne açık bırakır. Kayda kişi bilgisi yazılmaz.
//
// Adayların anonim oturumu giriş değildir, ayrı kurallarla sınırlıdır; bu kapıdan etkilenmez.

export const HUB_ONLY_ERROR = { error: 'Clyro Talent\'e Clyro Hub üzerinden girilir.', code: 'hub_only' };

/** Hub oturumu 14 gün; Firebase oturumu kendiliğinden bitmediği için kimlik yaşı burada sınırlanır. */
export const MAX_IDENTITY_AGE_SECONDS = 14 * 24 * 60 * 60;

export function hubOnlyMode(env = process.env) {
    const v = (env.HUB_ONLY_LOGIN || '').trim();
    if (!v || v === 'off') return 'off';
    return v === 'enforce' ? 'enforce' : 'report';
}

/**
 * @param {{ auth_time?: number, firebase?: { sign_in_provider?: string } }} decoded
 * @returns {boolean} true: bu jeton reddedilmeli
 */
export function blockDirectToken(decoded, env = process.env, nowSeconds = Math.floor(Date.now() / 1000)) {
    const mode = hubOnlyMode(env);
    if (mode === 'off') return false;
    const provider = decoded.firebase?.sign_in_provider || '';
    if (provider === 'anonymous') return false;
    const stale = provider === 'custom' && !(nowSeconds - (decoded.auth_time ?? 0) <= MAX_IDENTITY_AGE_SECONDS);
    if (provider === 'custom' && !stale) return false;
    console.warn(`[hub-only] doğrudan jeton (${mode}): sağlayıcı=${provider || 'yok'} eski=${stale}`);
    return mode === 'enforce';
}
