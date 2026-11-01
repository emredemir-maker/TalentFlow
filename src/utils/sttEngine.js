// Uygulama içi mülakatta hangi konuşma tanıma motorunun kullanılacağı.
//
// - Web Speech varsa (Chrome): her zaman o — ücretsiz, değişmedi.
// - Yoksa Gemini ses yedeği yalnız sunucuda açıksa (uygulama içi mülakat ek
//   paketi). Yedek, saatte ~1.200 Gemini çağrısı demek; varsayılan kapalı.
// - Sunucunun cevabı henüz gelmediyse 'pending': yedeği "belki açıktır" diye
//   başlatmıyoruz, cevabı bekliyoruz.
// - Aksi hâlde 'unsupported': ekranda "Bu özellik için Chrome kullanın".

export const STT_UNSUPPORTED_TITLE = 'Bu özellik için Chrome kullanın';
export const STT_UNSUPPORTED_DETAIL = 'Uygulama içi mülakat bu tarayıcıda desteklenmiyor.';

export function hasWebSpeech(win = typeof window !== 'undefined' ? window : undefined) {
    return Boolean(win && (win.SpeechRecognition || win.webkitSpeechRecognition));
}

/**
 * @param {{ webSpeech: boolean, audioFallbackEnabled: boolean | null }} opts
 *   audioFallbackEnabled: null = sunucudan henüz öğrenilmedi
 * @returns {'webspeech' | 'gemini' | 'pending' | 'unsupported'}
 */
export function chooseSttEngine({ webSpeech, audioFallbackEnabled }) {
    if (webSpeech) return 'webspeech';
    if (audioFallbackEnabled === true) return 'gemini';
    if (audioFallbackEnabled === null || audioFallbackEnabled === undefined) return 'pending';
    return 'unsupported';
}

/**
 * Sunucudaki anahtarı okur.
 * - Sunucu açıkça "açık" derse true, açıkça "kapalı" ya da tuhaf bir cevap
 *   verirse false — pahalı yolu şüpheyle açmayız.
 * - Öğrenilemediyse (oturum henüz hazır değil → 401, ağ hatası) null: çağıran
 *   sonra yeniden sorabilir; bu arada yedek başlatılmaz.
 * @param {() => Promise<Record<string,string>>} getAuthHeaders
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<boolean | null>}
 */
export async function fetchAudioFallbackEnabled(getAuthHeaders, fetchImpl = fetch) {
    try {
        const res = await fetchImpl('/api/ai/stt-config', { headers: { ...(await getAuthHeaders()) } });
        if (!res.ok) return null;
        const data = await res.json();
        return data?.audioFallbackEnabled === true;
    } catch {
        return null;
    }
}
