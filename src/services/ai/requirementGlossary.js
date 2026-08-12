// Gereksinim sözlüğünü ÜRETEN servis.
//
// Soru şuydu: "GA4 hakimiyeti" maddesi bu işte ne için isteniyor? Madde metni
// bunu söylemez; herkes kafasında farklı bir şey anlar ve "karşılıyor" damgası
// olduğundan fazlasını ifade etmeye başlar.
//
// Modelden istenen tek şey TANIM. Aday verisi buraya girmez, puan buraya
// girmez, "bu madde gereksiz" yorumu buraya girmez — o iş requirementAdvisor'ın
// ve ölçüm katmanının.
//
// Sözlük pozisyon başına BİR KEZ üretilir ve saklanır: her açılışta yeniden
// üretmek hem pahalı hem de tutarsız olurdu (aynı maddeye her seferinde biraz
// farklı tanım). Metin değişince parmak izi tutmaz ve eskidiği söylenir.

import { getModel } from './config.js';
import { parseAIJson, buildStructuredPrompt, sanitizeForPrompt } from './utils.js';

const GLOSSARY_PROMPT = `
Sen deneyimli bir işe alım uzmanısın. Sana bir iş ilanının başlığı ve NUMARALI
gereksinim listesi veriliyor. Her madde için, o maddenin BU İŞTE ne işe
yaradığını açıkla.

HER MADDE İÇİN ÜÇ ALAN ÜRET:

- "olcut": Bu madde aslında hangi yetkinliği ölçmeye çalışıyor? Maddeyi
  TEKRARLAMA, altındaki gerçek ihtiyacı yaz. Tek cümle.
  YANLIŞ: 'GA4 hakimiyeti, GA4 aracına hakim olmayı ölçer.' (tekrar)
  DOĞRU: 'Ürün verisini kendi başına okuyup karar verebilme.'

- "sinyaller": Bir CV'de bunun kanıtı olarak NEYE bakılır? Somut yaz, en fazla
  üç örnek, tek cümle.
  DOĞRU: 'Kendi kurduğu izleme planı, düzenli baktığı rapor, veriyle
  gerekçelendirdiği bir karar.'

- "olcmez": Bu maddenin ölçMEDİĞİ ama ölçüyor SANILAN şey ne? Bu alan en
  önemlisi — yazılmazsa madde olduğundan fazlasını ifade eder ve haksız eleme
  yapılır. Tek cümle.
  DOĞRU: 'Veri altyapısı kurmayı ya da SQL ile modelleme yapmayı ölçmez.'
  DOĞRU: 'Kaç yıl kullandığını değil, veriyle karar verip vermediğini ölçer.'

MUTLAK KURALLAR:
- İLANA ÖZEL yaz. Yazdığın cümle BAŞKA bir ilana da aynen uyuyorsa YANLIŞTIR.
  Başlığı ve diğer maddeleri okuyup bağlamı kullan: aynı 'SQL' maddesi bir veri
  analisti ilanında başka, bir ürün müdürü ilanında başka şey ölçer.
- Genel geçer cümle YASAK: 'pozisyonun gereklilikleri doğrultusunda
  değerlendirilir', 'adayın yetkinliğini gösterir' gibi ifadeler kullanma.
- Maddenin GEREKLİ olup olmadığını TARTIŞMA. 'Bu madde tercihene alınabilir',
  'havuzu daraltır' gibi yorum YAPMA — senin işin tanımlamak, değerlendirmek
  değil.
- ADAY hakkında hiçbir şey yazma; sana aday verisi verilmedi.
- Emin olmadığın bir maddede kısa ve temkinli yaz; uydurma.
- Listedeki HER madde için tam olarak bir kayıt üret, madde numarasıyla.

TIRNAK KURALI: metin alanlarının içinde düz çift tırnak (") KULLANMA; tek
tırnak (') kullan. Kaçışsız tırnak tüm yanıtı okunamaz hâle getirir.

ÇIKTI FORMATI (JSON):
{
  "entries": [
    { "index": 1, "olcut": "...", "sinyaller": "...", "olcmez": "..." }
  ]
}
`;

/**
 * İlanın her gereksinimi için sözlük girdisi üretir.
 *
 * Modele YALNIZCA ilan metni gider — aday verisi, CV, puan girmez.
 *
 * @param {object} position
 * @returns {Promise<Array<{index:number, olcut:string, sinyaller:string, olcmez:string}>>}
 */
export async function buildRequirementGlossary(position) {
    const reqs = (position?.requirementsMeta || position?.requirements || [])
        .map((r, i) => {
            const text = typeof r === 'string' ? r : r?.text || '';
            const label = typeof r === 'object' && r?.must === true ? '[ZORUNLU] '
                : typeof r === 'object' && r?.must === false ? '[TERCİHEN] ' : '';
            return text ? `${i + 1}. ${label}${text}` : '';
        })
        .filter(Boolean);
    if (reqs.length === 0) return [];

    const prompt = buildStructuredPrompt(GLOSSARY_PROMPT, {
        POZISYON: sanitizeForPrompt(position?.title || ''),
        ILAN_ACIKLAMASI: sanitizeForPrompt(String(position?.description || '').slice(0, 1500)),
        GEREKSINIMLER: sanitizeForPrompt(reqs.join('\n')),
    });

    const model = await getModel();
    const result = await model.generateContent(prompt, { maxOutputTokens: 8192, label: 'requirement' });
    const parsed = parseAIJson(result.response.text(), { entries: [] });
    return Array.isArray(parsed?.entries) ? parsed.entries : [];
}
