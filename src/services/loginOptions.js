// src/services/loginOptions.js
// Doğrudan giriş kapalı mı (HUB_ONLY_LOGIN=enforce). Sayfa başına bir kez sorulur; yalnız ekranı ayarlar, kapı sunucuda.
let cached = null;

export function fetchLoginOptions() {
    cached ??= fetch('/api/auth/login-options')
        .then((r) => (r.ok ? r.json() : { hubOnly: false }))
        .catch(() => {
            cached = null;
            return { hubOnly: false };
        });
    return cached;
}
