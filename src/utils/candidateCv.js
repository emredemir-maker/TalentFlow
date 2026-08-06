// Aday CV görüntüleme yardımcıları.
//
// CV verisi üç ayrı akıştan geldiği için tek bir alana güvenilemiyor:
//   - manuel yükleme  → cvUrl (orijinal dosya) + cvData (AI dökümü)
//   - başvuru formu   → cvText (çıkarılmış metin), cvUrl çoğu zaman boş
//   - toplu içe aktarma → cvText, bazen cvUrl
// Ekran bu yüzden "orijinal dosya varsa göster, yoksa metinden form kur"
// diye çalışıyor. Buradaki fonksiyonlar o kararı saf tutar.

/**
 * Dosya uzantısını URL'den ya da kayıtlı dosya adından çıkarır.
 * Firebase Storage bağlantıları `?alt=media&token=...` taşıdığı ve yolu
 * yüzde-kodladığı için sorgu dizisi atılıp çözülmeden bakmak yanlış sonuç
 * verir (".../cvs%2Fcv-1.pdf?alt=media" → uzantı bulunamaz).
 */
export function cvFileExtension(urlOrName) {
    if (!urlOrName || typeof urlOrName !== 'string') return '';
    let path = urlOrName.split('?')[0].split('#')[0];
    try {
        path = decodeURIComponent(path);
    } catch {
        // Bozuk yüzde kodlaması: ham hâliyle devam et, uzantı yine yakalanabilir
    }
    const match = path.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : '';
}

/**
 * Dosya tarayıcıda gömülü gösterilebilir mi?
 * Yalnızca PDF. DOCX bir iframe'de indirme diyaloğu açar ya da boş görünür —
 * kullanıcıya bozuk bir çerçeve göstermektense "indir" demek dürüst.
 */
export function isEmbeddableCv(candidate) {
    const url = candidate?.cvUrl || '';
    if (!url) return false;
    const ext = cvFileExtension(url) || cvFileExtension(candidate?.cvFileName || '');
    return ext === 'pdf';
}

/** Orijinal CV dosyası var mı (gösterilebilir olması şart değil). */
export function hasOriginalCvFile(candidate) {
    return Boolean(candidate?.cvUrl);
}

/**
 * Ham CV metni. cvData manuel akışın AI dökümü, cvText diğer akışların
 * çıkarılmış metni; ikisi de dolu olabilir, ikisi de boş olabilir.
 */
export function cvTextOf(candidate) {
    const data = String(candidate?.cvData || '').trim();
    const text = String(candidate?.cvText || '').trim();
    if (data && text) return data.length >= text.length ? data : text;
    return data || text;
}

/**
 * Açılışta hangi görünüm gelmeli?
 * Gömülebilir orijinal varsa o — kullanıcı "orijinal PDF" istediğinde
 * fazladan tıklama beklememeli. Yoksa form.
 */
export function defaultCvMode(candidate) {
    return isEmbeddableCv(candidate) ? 'pdf' : 'form';
}

/** Görüntülenecek hiçbir şey yok mu? */
export function hasNoCv(candidate) {
    return !hasOriginalCvFile(candidate) && !cvTextOf(candidate);
}

/**
 * Künye alanları — boş olanlar elenir ki ekranda "Belirtilmemiş" duvarı
 * oluşmasın. Sıra bilinçli: kimlik → iletişim → konum → rol.
 */
export function cvProfileFields(candidate) {
    if (!candidate) return [];
    const raw = [
        ['Ad Soyad', candidate.name],
        ['E-posta', candidate.email],
        ['Telefon', candidate.phone],
        ['Konum', candidate.location],
        ['Başvurduğu / Mevcut Rol', candidate.position],
        ['Departman', candidate.department],
        ['Toplam Deneyim', candidate.experience],
        ['Eğitim', candidate.education || candidate.educationDetail],
        ['Kaynak', candidate.sourceDetail ? `${candidate.source} → ${candidate.sourceDetail}` : candidate.source],
    ];
    return raw
        .map(([label, value]) => ({ label, value: typeof value === 'string' ? value.trim() : value }))
        .filter((f) => f.value !== undefined && f.value !== null && f.value !== '');
}

/**
 * Kariyer girdilerini tek bir biçime indirger. Akışlar farklı anahtar
 * kullanıyor: AI çıkarımı `title`, elle giriş `role`, eski kayıtlar `position`.
 */
export function normalizeExperiences(candidate) {
    const list = Array.isArray(candidate?.experiences) && candidate.experiences.length > 0
        ? candidate.experiences
        : (Array.isArray(candidate?.careerHistory) ? candidate.careerHistory : []);
    return list
        .filter((e) => e && typeof e === 'object')
        .map((e) => ({
            role: String(e.role || e.title || e.position || '').trim(),
            company: String(e.company || '').trim(),
            duration: String(e.duration || e.period || e.dates || '').trim(),
            desc: String(e.desc || e.description || '').trim(),
            milestones: Array.isArray(e.milestones) ? e.milestones.filter(Boolean) : [],
        }))
        .filter((e) => e.role || e.company || e.desc);
}
