// Mülakat SORULARINI yazan servis.
//
// Neyin sorulacağına bu dosya karar VERMEZ — o iş utils/interviewPlan.js'in.
// Buraya önceden seçilmiş sondalar gelir ve modelden istenen tek şey her
// sondayı Türkçe bir soruya çevirmek.
//
// Ayrım neden bu kadar keskin: öncelik ve soru sayısı modele bırakılsaydı
// aynı tarama iki farklı plan verirdi. Bugün tam olarak bunu yaşadık —
// tek bir büyük çıktı isteyince aynı aday iki taramada 80 ve 65 aldı.
// Model ne kadar az karar verirse o kadar kararlı.
//
// MODELİN YAZMADIĞI ŞEYLER: kademe, süre, hangi madde sorulacak, adayın iyi
// olup olmadığı. Bunların hepsi kodda ölçülmüş ve prompt'a girdi olarak
// veriliyor — modelin yeniden karar vermesi istenmiyor.

import { getModel } from './config.js';
import { parseAIJson, buildStructuredPrompt, sanitizeForPrompt } from './utils.js';
import { stripPiiForAI } from '../../utils/pii.js';

const PLANNER_PROMPT = `
Sen kıdemli bir işe alım uzmanısın. Sana bir pozisyonun SONDA listesi veriliyor.
Her sonda, taramanın adayla ilgili AÇIK BIRAKTIĞI bir maddedir ve mülakatta
kapatılması gerekir.

Senin işin: her sonda için TAM OLARAK BİR soru yazmak. Başka bir şey yapma.

SANA AİT OLMAYAN KARARLAR — bunlara karışma:
- Hangi maddenin sorulacağı (zaten seçildi)
- Sıra ve öncelik (zaten belirlendi)
- Adayın iyi mi kötü mü olduğu (senin işin değil)
- Soru sayısı (sonda sayısı kadar, ne eksik ne fazla)

HER SONDA İÇİN ÜÇ ALAN:

- "question": Sorunun kendisi. Türkçe, "siz" diliyle, tek soru.
  * AÇIK UÇLU olmalı. "X yaptınız mı?" sorusu "evet" cevabı alır ve hiçbir şey
    öğretmez. Bunun yerine ÖRNEK İSTE: 'X'i yaptığınız somut bir işi anlatır
    mısınız?'
  * İşin KENDİSİNİ sor, ürün adını ya da sektör etiketini değil. Madde
    'CX/CRM ürünü geliştirmiş olmak' diyorsa soru CRM markası aramaz; bir
    hizmet ürününü uçtan uca geliştirme deneyimini sorar. Aday aynı işi başka
    bir kitle için yapmışsa bunu anlatabilmeli.
  * 3-5 dakikada cevaplanabilir olmalı. İki soruyu "ve" ile birleştirme.
  * CV'de yazan somut bir işe atıfta bulunabilirsen bulun — genel soru, genel
    cevap alır.

- "followUp": Cevap yüzeysel kalırsa sorulacak TEK derinleştirme sorusu.
  Ölçüye, sahipliğe ya da karara indirmeli: 'Bu kararı siz mi verdiniz?',
  'Sonuç ne kadar değişti?', 'Sizin yaptığınız kısım tam olarak neydi?'

- "listenFor": İYİ bir cevabın taşıdığı somut sinyaller. Değerlendirme buna
  göre yapılacak, o yüzden GÖZLENEBİLİR yaz. En fazla üç sinyal, tek cümle.
  YANLIŞ: 'Konuya hakim olduğunu göstermesi.' (ölçülemez)
  DOĞRU: 'Kendi sahip olduğu bir akış, aldığı bir ödünleşim kararı, sonucun
  ölçüsü.'

MUTLAK KURALLAR:
- Cinsiyet, yaş, medeni hâl, memleket, sağlık, inanç ya da bunları ima eden
  hiçbir soru üretme.
- Adayı KÖŞEYE SIKIŞTIRAN soru yazma. Eksik bir madde bile olsa soru, adayın
  varsa kanıtını göstermesine imkân vermeli: amaç yakalamak değil öğrenmek.
- Bir maddenin eksik olduğu YARGISINI soruya yazma. 'CV'nizde bu görünmüyor,
  neden?' değil; 'Bu alanda bir deneyiminiz olduysa anlatır mısınız?'.
- Sonda listesindeki HER sonda için tam olarak bir kayıt üret, gelen
  "requirementIndex" değerini AYNEN geri yaz.

TIRNAK KURALI: metin alanlarının içinde düz çift tırnak (") KULLANMA; tek
tırnak (') kullan. Kaçışsız tırnak tüm yanıtı okunamaz hâle getirir.

ÇIKTI FORMATI (yalnızca JSON, açıklama yok):
{
  "questions": [
    { "requirementIndex": 1, "question": "...", "followUp": "...", "listenFor": "..." }
  ]
}
`;

/** Model çökerse ya da bir sondayı atlarsa kullanılacak soru. */
export function fallbackQuestion(probe) {
    const subject = String(probe?.text || 'bu alan').trim();
    if (probe?.status === 'missing') {
        return `${subject} konusunda — başka bir sektörde ya da başka bir kitle için de olabilir — çalıştığınız somut bir işi anlatır mısınız?`;
    }
    if (probe?.status === 'partial') {
        return `${subject} alanındaki deneyiminizin kapsamını anlatır mısınız: neyin sahibiydiniz, neye katkı verdiniz?`;
    }
    return `${subject} konusunda yaptığınız işi ve ulaştığınız sonucu anlatır mısınız?`;
}

const FALLBACK_FOLLOW_UP = 'Bu işin sizin yaptığınız kısmı tam olarak neydi ve sonuç ne kadar değişti?';

function clean(raw, max = 600) {
    return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Üretilen soruları sondalarla birleştirir — madde NUMARASINA göre.
 *
 * Sıraya göre eşleştirmek cazip ama yanlış: model bir sondayı atlar ya da
 * sırayı bozarsa soru yanlış maddeye yapışır. Bugün aynı sınıf hatayı üç
 * ayrı yerde bulduk; burada baştan numarayla eşleştiriyoruz.
 *
 * Karşılığı olmayan sonda DÜŞMEZ — yedek soruyla planda kalır. Bir maddenin
 * sessizce kaybolması, kötü yazılmış bir sorudan kötüdür.
 *
 * @param {Array} probes — interviewPlan.buildInterviewPlan(...).probes
 * @param {Array} generated — modelin döndürdüğü kayıtlar
 */
export function mergeProbeQuestions(probes, generated) {
    const byIndex = new Map(
        (Array.isArray(generated) ? generated : [])
            .filter((q) => Number.isFinite(Number(q?.requirementIndex)))
            .map((q) => [Number(q.requirementIndex), q])
    );

    return (Array.isArray(probes) ? probes : []).map((probe) => {
        const g = byIndex.get(probe.requirementIndex) || {};
        const question = clean(g.question);
        return {
            ...probe,
            question: question || fallbackQuestion(probe),
            followUp: clean(g.followUp) || FALLBACK_FOLLOW_UP,
            listenFor: clean(g.listenFor),
            generated: Boolean(question),
        };
    });
}

/** Modele giden aday özeti — CV'nin tamamı değil, işe yarayan kısmı. */
function candidateBrief(candidate) {
    const safe = stripPiiForAI(candidate || {});
    return {
        unvan: safe.position || safe.title || '',
        deneyimYili: safe.experience ?? safe.totalYearsOfExperience ?? null,
        yetkinlikler: Array.isArray(safe.skills) ? safe.skills.slice(0, 25) : [],
        ozet: String(safe.summary || '').slice(0, 900),
    };
}

/**
 * Plandaki her sonda için mülakat sorusu üretir.
 *
 * Bayat ya da boş planda model HİÇ ÇAĞRILMAZ: sorulacak madde yoksa harcanacak
 * çağrı da yok.
 *
 * @param {object} plan — buildInterviewPlan çıktısı
 * @param {object} candidate
 * @param {object} position
 * @returns {Promise<Array>} soru metni eklenmiş sondalar
 */
/**
 * Sondalar için soru metinleri üretir.
 *
 * @returns {Promise<{probes: Array, error: string}>}
 *   HER ZAMAN AYNI ŞEKİL. Eskiden düz dizi dönüyordu ve başarısızlık sessizdi:
 *   ekran yalnızca "sorular yazılamadı" diyor, sebebi tarayıcı konsolunda
 *   kalıyordu. Sebep artık çağırana da veriliyor.
 */
export async function generateProbeQuestions(plan, candidate, position) {
    const probes = plan?.probes || [];
    if (plan?.stale || probes.length === 0) return { probes: [], error: '' };

    // Modele giden sonda listesi: madde metni, durum ve NEDEN sorulduğu.
    // Kademe ve dakika bilinçli olarak GÖNDERİLMİYOR — modelin uzunluğu ya da
    // tonu önceliğe göre değiştirmesini istemiyoruz, o karar kodda verildi.
    const probeLines = probes.map((p) => ({
        requirementIndex: p.requirementIndex,
        madde: p.text,
        tur: p.must ? 'zorunlu' : 'tercihen',
        taramaDurumu: p.status === 'missing' ? 'CV\'de karşılığı bulunamadı'
            : p.status === 'partial' ? 'kısmen karşılanıyor'
                : 'karşılanıyor, fark notu var',
        taramaNotu: p.gap || p.note || '',
    }));

    const prompt = buildStructuredPrompt(PLANNER_PROMPT, {
        POZISYON: sanitizeForPrompt(position?.title || ''),
        ADAY_OZETI: sanitizeForPrompt(JSON.stringify(candidateBrief(candidate))),
        SONDALAR: sanitizeForPrompt(JSON.stringify(probeLines, null, 2)),
    });

    try {
        const model = await getModel();
        // 4096 → 16384. Canlıda cevap bir dizenin ortasında kesildi
        // ("Unterminated string in JSON at position 979") ve TÜM sorular
        // yedek kalıba düştü. Sebep bütçenin küçüklüğü değil, Gemini 2.5'te
        // DÜŞÜNME TOKEN'LARININ da bu bütçeden yemesi: 4096'nın çoğu düşünmeye
        // gidince cevaba birkaç yüz token kalıyor. Aynı ders companyIntel ve
        // marketResearch'te de yaşandı.
        //
        // 10 madde için soru + takip sorusu + dinlenecek nokta yazılıyor;
        // anlatım üreten çağrı (extraction) da 16384 kullanıyor.
        const result = await model.generateContent(prompt, { maxOutputTokens: 16384, label: 'interview-plan' });
        const parsed = parseAIJson(result.response.text(), { questions: [] });
        const yazilan = Array.isArray(parsed?.questions) ? parsed.questions : [];
        return {
            probes: mergeProbeQuestions(probes, yazilan),
            // SEBEP EKRANA ÇIKIYOR. Cevap okunamadığında hata FIRLAMIYOR —
            // ayrıştırıcı sessizce varsayılana düşüyor ve kullanıcı yalnızca
            // "sorular yazılamadı" görüyordu. Canlıda sebep, cevabın çıktı
            // bütçesi bitince bir dizenin ortasında kesilmesiydi; bunu
            // ancak tarayıcı konsolundan görmek mümkündü.
            error: yazilan.length === 0
                ? 'Modelin cevabı okunamadı — yanıt yarıda kesilmiş olabilir.'
                : '',
        };
    } catch (e) {
        // Model çökerse plan boş dönMEZ: yedek sorularla çalışır bir plan
        // çıkar. Mülakatçının eli boş kalmasındansa jenerik soru iyidir.
        console.error('[interviewPlanner]', e.message);
        return { probes: mergeProbeQuestions(probes, []), error: e?.message || 'Sorular yazılamadı.' };
    }
}
