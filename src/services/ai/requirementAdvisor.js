// Gereksinim önerisi — ÖLÇÜMÜN üstüne, onun yerine değil.
//
// Modele "bu gereksinim gerekli mi?" diye sormak işe yaramaz; bugün iki kez
// yaşadığımız gibi her ilana uyan cümleler üretir ("bu madde yeniden
// değerlendirilebilir"). Burada model yalnızca ÖLÇÜLMÜŞ bir bulgu için
// alternatif ifade önerir ve bulguya atıf yapmak zorundadır.
//
// Ölçüm requirementReview.js'te ve AI'sızdır. Bu dosya son adımdır.
import { getModel } from './config.js';
import { parseAIJson, buildStructuredPrompt, sanitizeForPrompt } from './utils.js';

const ADVISOR_PROMPT = `
Sen deneyimli bir işe alım danışmanısın. Sana bir iş ilanının gereksinimleri
ve her biri için ÖLÇÜLMÜŞ bulgular veriliyor. Görevin, işaretlenmiş maddeler
için daha iyi bir ifade önermek.

BULGU TÜRLERİ:
- "tool-must": zorunlu işaretlenmiş bir ARAÇ (ürün/teknoloji adı).
  Aracı bilmek işi yapmış olmakla aynı şey değildir ve araç öğrenilebilir.
- "over-restrictive": zorunlu madde, değerlendirilen adayların çoğunu eliyor.
- "no-signal": her aday karşılıyor; madde seçim yapmıyor.
- "redundant": başka bir madde adayları neredeyse aynı biçimde ayırıyor.

HER İŞARETLİ MADDE İÇİN ŞUNLARI ÜRET:
- "why": Bu madde ASLINDA neyi ölçmeye çalışıyor? İşin altındaki gerçek
  ihtiyacı bir cümleyle yaz.
  ÖRNEK: 'PLG deneyimi' için → 'Kullanıcının satış temsilcisi olmadan ürüne
  bağlanmasını sağlayabilme.'
- "suggestion": Maddenin YERİNE yazılabilecek somut alternatif metin. Sonuç
  odaklı ve araç bağımsız olsun; aday farklı bir sektörde aynı işi yapmışsa
  eleyecek biçimde daralttırma.
  ÖRNEK: 'PLG / self-servis akış deneyimi' →
  'Kullanıcının kendi kendine değer keşfettiği bir akış kurmuş olmak
  (self-servis, freemium ya da denemeden satın almaya geçiş)'
- "action": Şu üçünden biri — "tercihene-al", "yeniden-yaz", "kaldır".
- "rationale": Neden bu öneriyi verdiğin, VERİLEN BULGUYA atıfla.
  ÖRNEK: 'Değerlendirilen 34 adayın 31'i bu maddede eleniyor ve madde bir
  araç adı; yetkinliğe çevirmek havuzu daraltmadan aynı şeyi ölçer.'

MUTLAK KURALLAR:
- "rationale" içinde SANA VERİLEN SAYIYI kullan. Sayı uydurma.
- Genel geçer cümle YASAK. 'Bu madde gözden geçirilebilir', 'pozisyonun
  gereklilikleri doğrultusunda değerlendirilmelidir' gibi HERHANGİ bir ilana
  yapıştırılabilecek ifadeler kullanma.
- TEST: Yazdığın cümle BAŞKA bir ilana da aynen uyuyorsa YANLIŞTIR.
- Yalnızca sana verilen işaretli maddeler için üret; diğerlerine dokunma.
- "no-signal" bulgusunda madde gerçekten gereksiz olmayabilir (herkesin
  sahip olduğu temel bir şart olabilir); bu durumda "kaldır" yerine
  gerekçende bunu belirt.
- TIRNAK KURALI: metin alanlarının içinde düz çift tırnak (") KULLANMA;
  tek tırnak (') kullan. Kaçışsız tırnak tüm yanıtı okunamaz hâle getirir.

ÇIKTI FORMATI (JSON):
{
  "reviews": [
    { "index": 1, "why": "...", "suggestion": "...", "action": "tercihene-al|yeniden-yaz|kaldır", "rationale": "..." }
  ]
}
`;

/**
 * İşaretli gereksinimler için alternatif ifade önerisi.
 *
 * @param {object} position
 * @param {Array} flaggedItems — requirementReview.flaggedRequirements çıktısı
 * @returns {Promise<Array<{index:number, why:string, suggestion:string, action:string, rationale:string}>>}
 */
export async function suggestRequirementRewrites(position, flaggedItems) {
    if (!Array.isArray(flaggedItems) || flaggedItems.length === 0) return [];

    // Modele yalnızca ölçülmüş olgular gider; yorum ondan beklenir.
    const findings = flaggedItems.map((it) => ({
        index: it.index,
        madde: it.text,
        oncelik: it.must === true ? 'zorunlu' : it.must === false ? 'tercihen' : 'işaretsiz',
        tur: it.kind || 'bilinmiyor',
        degerlendirilen_aday: it.evaluated,
        elenen_aday: it.eliminated,
        bulgular: it.flags,
        ortusen_madde_numaralari: it.redundantWith,
    }));

    const prompt = buildStructuredPrompt(ADVISOR_PROMPT, {
        POZISYON: sanitizeForPrompt(position?.title || ''),
        TUM_GEREKSINIMLER: sanitizeForPrompt(
            (position?.requirementsMeta || position?.requirements || [])
                .map((r, i) => `${i + 1}. ${typeof r === 'string' ? r : r?.text || ''}`)
                .join('\n')
        ),
        ISARETLI_MADDELER: JSON.stringify(findings, null, 2),
    });

    const model = await getModel();
    const result = await model.generateContent(prompt, { maxOutputTokens: 8192 });
    const parsed = parseAIJson(result.response.text(), { reviews: [] });
    return Array.isArray(parsed?.reviews) ? parsed.reviews : [];
}
