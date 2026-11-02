// CANLI MÜLAKAT AI BÜTÇESİ — ne zaman, ne sıklıkla çağrı yapılır.
//
// Eskiden her aday cümlesinden 2,5 sn sonra bir STAR analizi gidiyordu: bir
// saatlik mülakatta 100+ çağrı, her birinde adayın TÜM profili. Yeni kural
// (Emre onaylı):
//   - Analiz 3 dakikada bir, o pencerenin konuşması üzerinden, ve yalnızca
//     pencerede 40+ karakterlik yeni bir aday cümlesi varsa.
//   - Mülakat başına saatte en çok 20 analiz. "Şimdi analiz et" düğmesi de
//     bu 20'ye dahil — düğme sınırın etrafından dolanma yolu olmamalı.
//   - Takip sorusu düğmede kalır: 60 sn bekleme, saatte en çok 10.
//
// Aynı sınırlar sunucuda da var (functions/services/interviewAiQuota.js);
// sayfa yenilenince buradaki sayaç sıfırlanır, oradaki sıfırlanmaz.
//
// Bu dosya saf mantık: zaman dışarıdan verilir, test edilebilir.

export const LIVE_ANALYSIS_INTERVAL_MS = 3 * 60 * 1000;
export const LIVE_ANALYSIS_MIN_CHARS = 40;
export const LIVE_ANALYSIS_HOURLY_CAP = 20;
export const FOLLOWUP_COOLDOWN_MS = 60 * 1000;
export const FOLLOWUP_HOURLY_CAP = 10;
export const HOUR_MS = 60 * 60 * 1000;

// Uzun bir sessizlikten sonra düğmeye basılırsa pencere büyüyebilir; çağrı
// maliyeti sınırsız büyümesin diye pencerenin SON kısmı gönderilir.
export const LIVE_WINDOW_MAX_CHARS = 6000;

const ADAY = 'ADAY';

/**
 * Son analizden bu yana biriken konuşmayı seçer.
 *
 * @param {Array<{role: string, text: string}>} transcript
 * @param {number} fromIndex — son analizin kapsadığı transkript uzunluğu
 * @returns {{window: Array, hasNewCandidateUtterance: boolean, nextIndex: number}}
 *   `nextIndex`: analiz yapılırsa bir sonraki pencere buradan başlar.
 */
export function selectAnalysisWindow(transcript, fromIndex = 0) {
    const list = Array.isArray(transcript) ? transcript : [];
    // Firestore birleştirmesi diziyi kısaltabilir; başlangıç sona taşmasın.
    const start = Math.min(Math.max(0, fromIndex | 0), list.length);
    const fresh = list.slice(start).filter((t) => t && typeof t.text === 'string' && t.text.trim());

    const hasNewCandidateUtterance = fresh.some(
        (t) => t.role === ADAY && t.text.trim().length >= LIVE_ANALYSIS_MIN_CHARS
    );

    // Sondan geriye doğru karakter bütçesine sığanı al.
    const window = [];
    let used = 0;
    for (let i = fresh.length - 1; i >= 0; i--) {
        const len = fresh[i].text.length;
        if (window.length > 0 && used + len > LIVE_WINDOW_MAX_CHARS) break;
        window.unshift(fresh[i]);
        used += len;
    }

    return { window, hasNewCandidateUtterance, nextIndex: list.length };
}

/**
 * Kayan pencereli sayaç + isteğe bağlı bekleme süresi.
 *
 * Kayan pencere seçildi çünkü sunucu sabit saat dilimiyle sayıyor: kayan
 * pencereye uyan istemci hiçbir sabit saatte sınırı aşamaz, yani dürüst
 * istemci sunucudan 429 görmez.
 *
 * @param {{cap: number, windowMs?: number, cooldownMs?: number}} config
 */
export function createRateGate({ cap, windowMs = HOUR_MS, cooldownMs = 0 }) {
    let stamps = [];
    // Sunucu "doldu" dediyse (ör. sayfa yenilendi, yerel sayaç sıfırlandı)
    // o zamana kadar kapalı kal.
    let blockedUntil = 0;

    const prune = (now) => {
        stamps = stamps.filter((t) => now - t < windowMs);
    };

    return {
        /**
         * `reason: 'server'`: sunucu 429 ile reddetti (blockUntilNextHour);
         * arayüz o durumda sunucunun kendi metnini gösterir.
         * @returns {{ok: boolean, reason?: 'cap'|'cooldown'|'server', retryAt?: number, remaining: number}}
         */
        check(now = Date.now()) {
            prune(now);
            const remaining = Math.max(0, cap - stamps.length);
            if (now < blockedUntil) return { ok: false, reason: 'server', retryAt: blockedUntil, remaining: 0 };
            if (stamps.length >= cap) {
                return { ok: false, reason: 'cap', retryAt: stamps[0] + windowMs, remaining: 0 };
            }
            const last = stamps[stamps.length - 1];
            if (cooldownMs > 0 && last !== undefined && now - last < cooldownMs) {
                return { ok: false, reason: 'cooldown', retryAt: last + cooldownMs, remaining };
            }
            return { ok: true, remaining };
        },
        /** Bir çağrı yapıldı (sonucu ne olursa olsun — sunucu da denemeyi sayıyor). */
        record(now = Date.now()) {
            prune(now);
            stamps.push(now);
        },
        /** Sunucu sınırın dolduğunu söyledi: bir sonraki UTC saat başına kadar kapalı. */
        blockUntilNextHour(now = Date.now()) {
            blockedUntil = Math.floor(now / HOUR_MS) * HOUR_MS + HOUR_MS;
        },
        used(now = Date.now()) {
            prune(now);
            return stamps.length;
        },
    };
}

/**
 * Bir analiz turu: otomatik zamanlayıcı da "Şimdi analiz et" düğmesi de
 * BURADAN geçer. Tek kapı olması, düğmenin saatlik 20'nin etrafından
 * dolanamamasının garantisi.
 *
 * Hak yalnızca gerçekten çağrı yapılacaksa düşülür: yeni aday cevabı yoksa
 * ne çağrı gider ne hak harcanır.
 *
 * @returns {{action: 'blocked', state: object}
 *   | {action: 'skip'}
 *   | {action: 'run', window: Array, nextIndex: number}}
 */
export function takeLiveAnalysisTurn({ gate, transcript, fromIndex, now = Date.now() }) {
    const state = gate.check(now);
    if (!state.ok) return { action: 'blocked', state };
    const { window, hasNewCandidateUtterance, nextIndex } = selectAnalysisWindow(transcript, fromIndex);
    if (!hasNewCandidateUtterance) return { action: 'skip' };
    gate.record(now);
    return { action: 'run', window, nextIndex };
}

/** "Son analiz 4 dk önce" — dakikanın altı "az önce". */
export function minutesAgoText(then, now = Date.now()) {
    if (then == null) return '';
    const mins = Math.floor((now - then) / 60000);
    return mins < 1 ? 'az önce' : `${mins} dk önce`;
}

/**
 * Sınır doldu/bekleme mesajı — düğmenin yanında ve title'ında gösterilir.
 *
 * Sunucu reddettiyse (`reason: 'server'`) sunucunun metni gösterilir:
 * sayfa yenilenmiş olabilir, yerel sayaç 1'de iken "sınır (20) doldu"
 * demek kullanıcıya yanlış bir sayı söylerdi. Sunucu sayacı mülakat
 * başına tutuyor; doğru açıklama onun.
 */
export function gateMessage(state, { capLabel, serverMessage = '', now = Date.now() } = {}) {
    if (!state || state.ok) return '';
    if (state.reason === 'cooldown') {
        const secs = Math.max(1, Math.ceil((state.retryAt - now) / 1000));
        return `${secs} sn sonra tekrar deneyebilirsin.`;
    }
    const at = new Date(state.retryAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    if (state.reason === 'server' && serverMessage) {
        const text = serverMessage.trim().replace(/[.!]?$/, '.');
        return `${text} ${at} itibarıyla yeniden açılır.`;
    }
    return `${capLabel} doldu; ${at} itibarıyla yeniden açılır.`;
}
