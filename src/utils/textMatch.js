// Terim eşleşmesi — matchService ve skillGraph ortak kullanır.
//
// Buraya taşındı çünkü iki taraf da ihtiyaç duyuyor ve matchService zaten
// skillGraph'ı import ediyor; ters yönde bir import döngü yaratırdı.
// Davranış birebir korundu, kopyalanmadı — iki ayrı kopya kaçınılmaz olarak
// birbirinden ayrılırdı.

/**
 * Terim, metinde GERÇEKTEN geçiyor mu?
 *
 * Düz `text.includes(term)` üç somut hataya yol açıyordu:
 *   - 'coding' → "vibecoding" içinde eşleşip ürün ilanını Yazılım sayıyordu
 *   - 'deney'  → "deneyimi" içinde eşleşiyordu
 *   - 'go'/'ai'→ rastgele kelimelerin içinde eşleşiyordu
 *
 * Kural:
 *   - Boşluk/noktalama içeren terimler ('a/b test', 'node.js'): düz substring
 *   - ≤3 karakter ('ai', 'go', 'ui', 'sql'): tam kelime
 *   - Diğerleri: baştan sınır, sondan serbest — Türkçe ekleri korur
 *     ("aktivasyonu", "funnel'ı" eşleşir; "deneyimi" 'deney'e eşleşmez)
 */
export function termMatches(text, term) {
    if (!text || !term) return false;
    if (/[\s./+#-]/.test(term)) return text.includes(term);
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = term.length <= 3
        ? `(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`
        : `(^|[^\\p{L}\\p{N}])${escaped}`;
    return new RegExp(pattern, 'u').test(text);
}
