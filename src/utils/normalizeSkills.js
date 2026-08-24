// YETENEK LİSTESİ HER ZAMAN DİZİ OLMALI.
//
// ── NEDEN VAR ───────────────────────────────────────────────────────────────
// Canlıda bir adayın detayına girildiğinde uygulama BEYAZ EKRAN veriyordu.
// Sebep: o adayın `skills` alanı dizi değil METİNDİ ve kod sekiz ayrı yerde
// dizi olduğunu varsayıyordu:
//
//   components/Header.jsx:51    (skills || []).some(...)
//   components/Header.jsx:192   (skills || []).slice(0, 6).join(',')
//   services/matchService.js    (skills || []).join(' ')
//   components/CandidateDrawer  (skills || []).join(' ')
//   pages/AnalyticsPage         (skills || []).forEach(...)
//   components/CandidateComparisonModal, SendMessageModal, ai/communication
//
// `|| []` yalnızca alanın YOK olmasına karşı koruyor; YANLIŞ TİPTE olmasına
// değil. Metin geldiğinde `.join` yok ve çağrı `TypeError` fırlatıyor.
// Header her sayfada render edildiği için hata tek bir ekranı değil
// uygulamanın tamamını düşürüyordu.
//
// ── NEDEN TEK TEK YAMA DEĞİL ────────────────────────────────────────────────
// Sekiz çağrı noktasını ayrı ayrı korumak, dokuzuncusu eklendiğinde aynı
// hatayı geri getirir. Alan bir kez, veri uygulamaya girerken düzeltiliyor.
//
// ── HESAP DEĞİŞMİYOR ────────────────────────────────────────────────────────
// Bu bir onarım değil, bir okuma kuralı: metni diziye çevirmek skorlamanın
// gördüğü içeriği DEĞİŞTİRMİYOR — zaten dizi bekliyordu ve metin geldiğinde
// çalışamıyordu. Boş/geçersiz değerler boş diziye düşüyor.

/** Ayraçlar: virgül, noktalı virgül, dikey çizgi, satır sonu. */
const SEPARATORS = /[,;|\n]+/;

/**
 * Ham `skills` değerini diziye çevirir.
 *
 * @param {unknown} raw — dizi, metin, null, undefined ya da başka bir şey
 * @returns {string[]} her zaman dizi; içindekiler kırpılmış, boşlar atılmış
 */
export function normalizeSkills(raw) {
    if (Array.isArray(raw)) {
        return raw
            .map((s) => (typeof s === 'string' ? s.trim() : String(s ?? '').trim()))
            .filter(Boolean);
    }
    if (typeof raw === 'string') {
        return raw.split(SEPARATORS).map((s) => s.trim()).filter(Boolean);
    }
    // Sayı, nesne, null, undefined: yetenek listesi sayılabilecek bir şey yok.
    return [];
}
