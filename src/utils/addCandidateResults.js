// AYRIŞTIRMA SONUÇLARINDAN HAVUZA YAZILACAKLAR.
//
// Aday ekleme penceresinde üç yer aynı soruyu soruyor: "kaç aday kaydedilecek?"
// Başlık ("N yeni"), özet şeridi ("N Aday Kaydedilecek") ve kaydet düğmesi.
// Düğme eskiden `success` olanları sayıyordu, kaydetme ise mükerrerleri
// atlıyordu: mükerrer bir CV'de başlık "0 Aday Kaydedilecek" derken düğme
// "1 Adayı Havuza Ekle" diyor, tıklanınca hiçbir şey kaydetmiyordu. Süzgeç
// tek yerde durursa sayı ile yapılan iş birbirinden ayrılamaz.

/** Kaydetmenin gerçekten yazacağı sonuçlar: başarılı, aday çıkmış, mükerrer değil. */
export function saveableResults(results) {
    return (results || []).filter((r) => r && r.success && r.candidate && !r.isDuplicate);
}

/**
 * Kaydet düğmesinin etiketi ve durumu.
 * Demoda düğme havuza yazmıyor, yalnızca pencereyi kapatıyor; bu yüzden
 * mükerrer olsa da incelenmiş bir CV varken açık kalır.
 */
export function saveButtonState(results, { isDemo = false, loading = false } = {}) {
    const count = saveableResults(results).length;
    if (isDemo) {
        const anyParsed = (results || []).some((r) => r && r.success);
        return { count, label: 'Sonucu Kapat', disabled: loading || !anyParsed };
    }
    return { count, label: `${count} Adayı Havuza Ekle`, disabled: loading || count === 0 };
}
