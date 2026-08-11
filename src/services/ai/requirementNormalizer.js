// Düz metni DÜZENLİ gereksinim maddelerine çevirir.
//
// Canlıda görülen sorun: tek bir madde üç ayrı şey soruyordu —
//   "PLG/self-servis akış, fiyatlandırma-paketleme, CX-helpdesk-CRM ürün geçmişi"
// Aday bunlardan birine sahipse model "kısmen" diyor ve YARIM puan veriyor.
// Kritik bir eksiğin bedeli tavanda ~4 puanda kalıyor, zorunlu kapısı da hiç
// yanmıyor çünkü "kısmen" knockout sayılmaz.
//
// Bölme işi dile ait, yani modelin. Ama modelin ilan metnine gereksinim
// EKLEMESİ kabul edilemez — uydurulmuş bir şart gerçek adayları eler.
// O yüzden bu servisin çıktısı doğrudan uygulanmaz: requirementNormalize.js
// uydurma ve kayıp denetimi yapar, kullanıcı önce/sonra görüp onaylar.

import { getModel } from './config.js';
import { parseAIJson, buildStructuredPrompt, sanitizeForPrompt } from './utils.js';

const NORMALIZER_PROMPT = `
Sen deneyimli bir işe alım uzmanısın. Sana bir iş ilanının serbest metin
gereksinimleri veriliyor. Görevin bunları PUANLANABİLİR maddelere ayırmak.

NEDEN: Sistem her maddeye tek bir damga veriyor (karşılıyor / kısmen /
karşılamıyor). Bir madde üç ayrı şey soruyorsa, adayın birine sahip olması
"kısmen" üretir ve diğer ikisinin eksikliği yarım puanla geçiştirilir.
Kritik bir eksik bu yüzden görünmez olur.

KURALLAR:

1. BÖL — bir madde birbirinden BAĞIMSIZ alanlar soruyorsa ayır.
   BÖLÜNMELİ: 'PLG/self-servis akış, fiyatlandırma-paketleme, CX-helpdesk-CRM
   ürün geçmişi' → üç ayrı madde. Bunlar üç farklı uzmanlık.

2. BÖLME — ikinci parça birinciyi NİTELİYORSA tek madde kalsın.
   BÖLÜNMEMELİ: '3-5 yıl ürün yönetimi deneyimi, en az 1-2 yılı growth odaklı'
   İkinci parça ayrı bir yetkinlik değil, birincinin şartı.
   BÖLÜNMEMELİ: 'Funnel sahipliği: kayıt, aktivasyon, elde tutma, gelir'
   Buradakiler tek bir funnel'ın adımları, ayrı alanlar değil.
   Test: parçalardan biri tek başına bir iş ilanı maddesi olabiliyor mu?
   Olamıyorsa bölme.

3. ÖNCELİĞİ METİNDEN ÇIKAR, İŞARETE TAŞI.
   'tercih sebebi', 'tercihen', 'artı olur', 'zorunlu', 'şart' gibi ifadeler
   madde metninde KALMAMALI; bunun yerine "must" alanını ayarla.
   Bu ifadeyi metinde bırakmak sisteme çelişkili sinyal verir: değerlendirme
   yapan model metni okur ve işarete değil metne inanır.
   ÖRNEK: 'CX-CRM ürün geçmişi (tercih sebebi)' [zorunlu kutusunda]
        → { "text": "CX, helpdesk veya CRM ürün geçmişi", "must": false }

4. KULLANICININ SÖZCÜKLERİNİ KORU. Bu onun ilanı; yeniden yazma, sadece
   ayır ve temizle. Anlaşılmaz kısalık varsa en az müdahaleyle düzelt.

5. HİÇBİR ŞEY EKLEME. Girdide olmayan bir gereksinim, nitelik, yıl sayısı,
   araç adı ya da sektör YAZMA. Metin ne diyorsa o.
   Bu kural mutlaktır: uydurulmuş bir şart gerçek adayları eler.

6. HİÇBİR ŞEY DÜŞÜRME. Girdideki her konu çıktıda bir maddeye girmeli.
   Aynı şey iki kez yazılmışsa birleştir ve bunu "notes" içinde söyle.

7. Her maddeye "must" ver: kaynağı hangi kutuysa onu koru; ancak metinde
   açık bir öncelik ifadesi varsa (kural 3) ona uy.

8. En fazla 30 madde üret.

TIRNAK KURALI: metin alanlarının içinde düz çift tırnak (") KULLANMA; tek
tırnak (') kullan. Kaçışsız tırnak tüm yanıtı okunamaz hâle getirir.

ÇIKTI FORMATI (JSON):
{
  "items": [{ "text": "...", "must": true, "from": 1 }],
  "notes": ["3. madde üç ayrı alana bölündü", "'(tercih sebebi)' ibaresi metinden çıkarılıp tercihen işaretlendi"]
}
"from": maddenin geldiği KAYNAK satır numarası (1 tabanlı, zorunlu kutusu
önce sayılır). Bilinmiyorsa 0 yaz.
`;

/**
 * Serbest metin gereksinimleri atomik maddelere çevirir.
 *
 * Çıktı DOĞRUDAN UYGULANMAZ: çağıran taraf verifyNormalization ile uydurma
 * ve kayıp denetimi yapar, kullanıcı önce/sonra görüp onaylar.
 *
 * @param {{mustText?: string, niceText?: string, title?: string}} input
 * @returns {Promise<{items: Array<{text:string, must:boolean, from:number}>, notes: string[]}>}
 */
export async function normalizeRequirements({ mustText = '', niceText = '', title = '' } = {}) {
    const must = String(mustText || '').trim();
    const nice = String(niceText || '').trim();
    if (!must && !nice) return { items: [], notes: [] };

    const numbered = (text, offset) => text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l, i) => `${offset + i + 1}. ${l}`)
        .join('\n');

    const mustLines = must ? numbered(must, 0) : '';
    const mustCount = must ? must.split(/\r?\n/).filter((l) => l.trim()).length : 0;

    const prompt = buildStructuredPrompt(NORMALIZER_PROMPT, {
        POZISYON: sanitizeForPrompt(title),
        ZORUNLU_KUTUSU: sanitizeForPrompt(mustLines || 'boş'),
        TERCIHEN_KUTUSU: sanitizeForPrompt(nice ? numbered(nice, mustCount) : 'boş'),
    });

    const model = await getModel();
    const result = await model.generateContent(prompt, { maxOutputTokens: 8192 });
    const parsed = parseAIJson(result.response.text(), { items: [], notes: [] });

    const items = (Array.isArray(parsed?.items) ? parsed.items : [])
        .map((r) => ({
            text: String(r?.text || '').trim(),
            must: Boolean(r?.must),
            from: Number.isFinite(Number(r?.from)) ? Number(r.from) : 0,
        }))
        .filter((r) => r.text)
        .slice(0, 30);

    const notes = (Array.isArray(parsed?.notes) ? parsed.notes : [])
        .map((n) => String(n || '').trim())
        .filter(Boolean);

    return { items, notes };
}
