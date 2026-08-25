// ÜST ÇUBUKTAKİ GENEL ARAMANIN PUANLAMASI.
//
// ── NEDEN AYRI DOSYA ────────────────────────────────────────────────────────
// Bu üç fonksiyon saf: girdi kayıt + kelimeler, çıktı bir sayı. Header'ın
// içindeyken test edilemiyorlardı çünkü Header beş ayrı context'e bağlı.
// Aşağıdaki çökme tam da bu yüzden hiçbir testte yakalanamadı.
//
// ── HANGİ HATA ──────────────────────────────────────────────────────────────
// Canlıda arama kutusuna yazılan ilk harfte uygulama düşüyordu:
//
//     TypeError: (a.experience || "").toLowerCase is not a function
//
// `experience` DENEYİM YILI, yani bir SAYI. `|| ''` yalnızca alanın yokluğuna
// karşı koruyor; `5 || ''` sonucu `5` ve sayıda `.toLowerCase` yok. Header
// her ekranda render edildiği için hata tek bir sayfayı değil uygulamanın
// tamamını beyaz bırakıyordu.
//
// ── NEDEN normalizeCandidate DEĞİL ──────────────────────────────────────────
// Diğer alanlarda çözüm veriyi girişte metne çevirmekti. Burada OLMAZ:
// `experience` sayı olarak KULLANILIYOR — deneyim filtresi
// (`exp >= min && exp <= max`), tablo sıralaması ve `matchService` içindeki
// `parseInt` hep sayı bekliyor. Alanı metne çevirmek arama hatasını kapatıp
// filtreyi ve sıralamayı bozardı. Bu yüzden veri değil, OKUYAN taraf
// düzeltiliyor: aramada her alan metne indirgenerek karşılaştırılıyor.

import { normalizeSkills } from './normalizeSkills';

/**
 * Bir alanı arama için karşılaştırılabilir küçük harfli metne indirger.
 *
 * Sayı ve boolean metne çevrilir — "5" yazan kullanıcı 5 yıllık adayı
 * bulabilsin diye. Nesne/dizi boş metne düşer: aranacak anlamlı bir karşılığı
 * yok ve "[object Object]" eşleşmesi kullanıcıya yanlış sonuç gösterirdi.
 */
export function aranabilirMetin(value) {
    if (typeof value === 'string') return value.toLowerCase();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value).toLowerCase();
    return '';
}

/** Aday kaydı için anahtar kelime puanı. Ağırlıklar DEĞİŞMEDİ. */
export function kwScoreCandidate(c, words) {
    let s = 0;
    for (const w of words) {
        if (aranabilirMetin(c?.name).includes(w)) s += 5;
        if (aranabilirMetin(c?.position).includes(w)) s += 3;
        if (normalizeSkills(c?.skills).some((sk) => sk.toLowerCase().includes(w))) s += 4;
        if (aranabilirMetin(c?.summary).includes(w)) s += 2;
        if (aranabilirMetin(c?.email).includes(w)) s += 2;
        if (aranabilirMetin(c?.department).includes(w)) s += 1;
        if (aranabilirMetin(c?.experience).includes(w)) s += 1;
    }
    return s;
}

/** İlan kaydı için anahtar kelime puanı. Ağırlıklar DEĞİŞMEDİ. */
export function kwScorePosition(p, words) {
    let s = 0;
    for (const w of words) {
        if (aranabilirMetin(p?.title).includes(w)) s += 5;
        if (aranabilirMetin(p?.department).includes(w)) s += 3;
        if (aranabilirMetin(p?.description).includes(w)) s += 1;
    }
    return s;
}

/** Sayfa girdisi için anahtar kelime puanı. Ağırlıklar DEĞİŞMEDİ. */
export function kwScorePage(pg, words) {
    let s = 0;
    for (const w of words) {
        if (aranabilirMetin(pg?.label).includes(w)) s += 5;
        if (aranabilirMetin(pg?.desc).includes(w)) s += 2;
    }
    return s;
}
