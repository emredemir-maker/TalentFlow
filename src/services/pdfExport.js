// PDF ÜRETİMİ — kütüphane yalnızca indirme anında yükleniyor.
//
// Gömülü bir yazı tipi ŞART: PDF'in yerleşik yazı tipleri ş, ğ, ı, İ
// karakterlerini taşımaz ve gömülü font olmadan rapor "Yeniden
// deerlendirme" gibi çıkardı.
//
// Maliyet, raporu indirmeyen hiç kimseye ödetilmiyor: `import()` dinamik,
// yani pdfmake ayrı bir parçaya (chunk) düşüyor ve düğmeye basılana kadar
// indirilmiyor. Aynı desen Excel dışa aktarımında da kullanılıyor
// (CandidatesTablePage → `await import('xlsx')`).

// YAZI TİPİ: DÖRT DEĞİL İKİ AĞIRLIK.
//
// pdfmake'in hazır `vfs_fonts` paketi dört Roboto ağırlığı taşıyor
// (Regular, Medium, Italic, MediumItalic) ve tek başına 459 KB gzip
// tutuyordu — yarısından fazlası hiç kullanılmayan italik kesimler.
// Rapor yalnızca normal ve kalın kullanıyor.
//
// Italik istekleri de normale eşleniyor: eksik bir kesim istendiğinde
// pdfmake hata fırlatır ve indirme, sebebi görünmeyen bir şekilde
// başarısız olurdu.
import robotoRegular from 'pdfmake/build/fonts/Roboto/Roboto-Regular.ttf?inline';
import robotoMedium from 'pdfmake/build/fonts/Roboto/Roboto-Medium.ttf?inline';

/** `data:font/ttf;base64,AAAB...` → `AAAB...` */
const base64Of = (dataUrl) => String(dataUrl || '').split(',')[1] || '';

const VFS = {
    'Roboto-Regular.ttf': base64Of(robotoRegular),
    'Roboto-Medium.ttf': base64Of(robotoMedium),
};

const FONTS = {
    Roboto: {
        normal: 'Roboto-Regular.ttf',
        bold: 'Roboto-Medium.ttf',
        italics: 'Roboto-Regular.ttf',
        bolditalics: 'Roboto-Medium.ttf',
    },
};

let pdfMakeCache = null;

/** pdfmake'i bir kez yükler; ikinci indirmede ağ trafiği yok. */
async function loadPdfMake() {
    if (pdfMakeCache) return pdfMakeCache;
    // TARAYICI DERLEMESİ AÇIKÇA SEÇİLİYOR. Paketin `main` girdisi
    // (`js/index.js`) SUNUCU sürümü: `OutputDocumentServer` kullanıyor ve
    // Node modüllerine bağlı.
    const mod = await import('pdfmake/build/pdfmake.min.js');
    const pdfMake = mod?.default || mod;

    if (typeof pdfMake.addVirtualFileSystem === 'function') pdfMake.addVirtualFileSystem(VFS);
    else pdfMake.vfs = VFS;
    if (typeof pdfMake.addFonts === 'function') pdfMake.addFonts(FONTS);
    else pdfMake.fonts = FONTS;

    pdfMakeCache = pdfMake;
    return pdfMake;
}

/**
 * Belge tanımını PDF'e çevirir.
 *
 * ── API SÖZ TABANLI, GERİ ÇAĞRI DEĞİL ───────────────────────────────────────
 * pdfmake 0.2'de çıktı metotları geri çağrı alıyordu (`getBlob(cb)`); 0.3'te
 * `async getBlob()` oldu. Geri çağrı imzasıyla yazılan kod hata VERMİYOR:
 * fonksiyon parametreyi sessizce yok sayıyor, geri çağrı hiç çalışmıyor ve
 * bekleyen söz asla çözülmüyor. Ekranda görünen tek şey sonsuza kadar dönen
 * "Hazırlanıyor…" oluyordu. Tarayıcıda denenmeseydi bu haliyle yayına giderdi.
 *
 * `download()` yerine `getBlob()` kullanılıyor ki indirme bağlantısını kendimiz
 * tetikleyelim: üretim hatası ile indirmenin engellenmesi ayrı ayrı görünür
 * kalıyor.
 */
export async function buildPdfBlob(docDefinition) {
    const pdfMake = await loadPdfMake();
    return pdfMake.createPdf(docDefinition).getBlob();
}

/**
 * PDF'i üretir ve TARAYICIYA İNDİRTİR.
 *
 * Yazdırma penceresi açılmıyor: kullanıcı bir hedef seçmek, "Microsoft Print
 * to PDF" gibi bir sürücüyle uğraşmak zorunda kalmıyor ve çıktı o sürücünün
 * ürettiği resim yığını değil, gerçek metin katmanı olan bir belge oluyor.
 *
 * @param {object} docDefinition — utils/interviewReportDoc çıktısı
 * @param {string} fileName
 */
export async function downloadPdf(docDefinition, fileName) {
    const blob = await buildPdfBlob(docDefinition);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Hemen iptal etmek bazı tarayıcılarda indirmeyi yarıda kesiyor.
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}
