// Geriye dönük ucuz ön skor üretimi (maintenance/prescore endpoint'i).
//
// Toplu içe aktarma ön skoru artık içe aktarma ANINDA üretiyor
// (bulkWorker.parseTextWithGemini) — bu modül, o özellikten ÖNCE içe
// aktarılmış 0 skorlu adaylar için aynı kalitede skoru sonradan basar.
//
// Maliyet sıralaması:
//   1. Kayıtlı cvText varsa: TEK hafif Gemini çağrısı — yalnızca skor +
//      pozisyon + 1 cümle gerekçe istenir (detaylı STAR analizi DEĞİL).
//   2. cvText yoksa ya da AI başarısız olursa: sıfır maliyetli
//      anahtar-kelime skoru (kayıtlı position/skills alanları açık
//      pozisyon başlıklarıyla karşılaştırılır) — kimse 0'da kalmaz.
import { generateText } from './gemini.js';
import { calculateSimpleMatchScore, matchOpenTitle, sanitizeSuggestedRole, positionTitleOf } from './bulkWorker.js';

/**
 * Anahtar-kelime yedeği: açık pozisyonlardan en iyi skoru seç. Hiçbiri
 * eşleşmezse matchedTitle null döner ("uygun açık pozisyon yok") — CV'deki
 * serbest pozisyon adı eşleşme diye yazılmaz.
 *
 * `openPositions` başlık dizisi ya da pozisyon dokümanı dizisi olabilir;
 * doküman verildiğinde skor gereksinimleri de dikkate alır.
 */
export function keywordPrescore(candidateData, openPositions) {
    let best = { score: 0, matchedTitle: null };
    for (const position of openPositions || []) {
        const s = calculateSimpleMatchScore(candidateData, position);
        if (s > best.score) best = { score: s, matchedTitle: positionTitleOf(position) };
    }
    if (!best.matchedTitle) {
        const reason = openPositions?.length ? 'Uygun açık pozisyon bulunamadı.' : '';
        return { score: 0, matchedTitle: null, matchReason: reason, method: 'keyword' };
    }
    return { ...best, matchReason: '', method: 'keyword' };
}

/**
 * Tek aday için ön skor üret. AI yanıtı geçersizse/patlarsa sessizce
 * anahtar-kelime yedeğine düşer — endpoint akışını asla durdurmaz.
 */
export async function computePrescore(candidateData, openPositions) {
    // AI prompt'u yalnızca başlık listesi ister; anahtar-kelime yedeği ise
    // gereksinimleri de kullanabilsin diye asıl liste olduğu gibi taşınır.
    const openPositionTitles = (openPositions || []).map(positionTitleOf).filter(Boolean);
    const cvText = (candidateData?.cvText || '').trim();
    if (cvText.length >= 40) {
        const scoreContext = openPositionTitles?.length
            ? `Şirketteki açık pozisyonlar: ${openPositionTitles.map((t) => `"${t}"`).join(', ')}. matchedPosition alanına SADECE bu listeden bir başlığı AYNEN yaz — listede olmayan bir başlık ASLA yazma. Aday hiçbirine uygun değilse matchedPosition alanına null yaz ve matchScore'u 0 ver.`
            : `Açık pozisyon listesi yok. Skoru adayın profil kalitesine ve istihdam edilebilirliğine göre ver; matchedPosition alanına null yaz.`;
        const prompt = `Sen bir işe alım ön değerlendirme uzmanısın. Aşağıdaki CV metni için bir ön uyum skoru ver.
${scoreContext}
Sadece şu JSON formatında yanıt ver (başka hiçbir şey yazma):
{
  "matchScore": 75,
  "matchedPosition": "Skorun verildiği pozisyon başlığı",
  "matchReason": "1-2 cümlelik skor gerekçesi (Türkçe)",
  "suggestedRole": "SADECE rol başlığı — yorum/cümle/açıklama YASAK. Eşit uygunlukta birden fazla rol varsa virgülle ayır (en fazla 3)"
}

CV:
${cvText.substring(0, 6000)}`;
        try {
            const raw = (await generateText(prompt)).replace(/```json|```/gi, '').trim();
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                const score = Number(parsed?.matchScore);
                if (!isNaN(score) && score > 0) {
                    // AI'nın başlığı yalnızca açık pozisyon listesinde birebir
                    // karşılığı varsa kabul edilir; listede yoksa skor uydurma
                    // bir pozisyona aittir → anahtar-kelime yedeğine düş.
                    const validated = matchOpenTitle(parsed?.matchedPosition, openPositionTitles || []);
                    if (validated) {
                        return {
                            score: Math.max(0, Math.min(100, Math.round(score))),
                            matchedTitle: validated,
                            matchReason: parsed?.matchReason || '',
                            suggestedRole: sanitizeSuggestedRole(parsed?.suggestedRole),
                            method: 'ai',
                        };
                    }
                    // Açık pozisyon listesi hiç yoksa skor profil kalitesini
                    // ölçer (prompt öyle ister) — başlıksız kabul edilir.
                    if (!openPositionTitles?.length) {
                        return {
                            score: Math.max(0, Math.min(100, Math.round(score))),
                            matchedTitle: null,
                            matchReason: parsed?.matchReason || '',
                            suggestedRole: sanitizeSuggestedRole(parsed?.suggestedRole),
                            method: 'ai',
                        };
                    }
                }
            }
        } catch {
            // AI hatası → anahtar-kelime yedeği
        }
    }
    return keywordPrescore(candidateData, openPositions);
}
