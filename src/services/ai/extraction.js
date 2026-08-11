// src/services/ai/extraction.js
import { getModel } from './config.js';
import { parseAIJson, buildStructuredPrompt, sanitizeForPrompt, jsonFailureContext } from './utils.js';

const EXTRACTOR_PROMPT = `
Sen kıdemli ve son derece analitik bir İşe Alım Yöneticisisin. Görevin, adayı İLANIN GEREKSİNİMLERİ karşısında değerlendirmek.

ÇOK ÖNEMLİ KURALLAR:
1. Gereksinim Karşılama (requirementCoverage): JOB_DESCRIPTION içinde
   gereksinimler NUMARALI bir liste olarak verilir; bazıları [ZORUNLU],
   bazıları [TERCİHEN] etiketlidir. Her maddeyi tek tek ele al ve YALNIZCA
   CV'deki kanıta dayanarak sınıflandır:
   - "met": CV'de açık kanıt var
   - "partial": Dolaylı/kısmi kanıt var
   - "missing": Kanıt yok
   "assessments" dizisinde her madde için maddenin NUMARASINI ("index"),
   durumunu ve TÜRÜNÜ ("kind") ver. Listedeki HER madde için tam olarak bir
   kayıt olmalı.
   "kind" iki değerden biridir:
   - "deneyim": adayın YAPTIĞI iş / sahiplendiği alan / ürettiği sonuç
     (örn. "funnel sahipliği", "A/B test kurgulama", "B2B SaaS ürün yönetimi")
   - "arac": belirli bir ürün, teknoloji, sertifika ya da dil bilgisi
     (örn. "GA4", "Amplitude", "SQL", "İngilizce")
   Emin olamazsan "deneyim" yaz. Araç maddeleri puanlamada daha az ağırlık
   taşır: bir aday işi yapmışsa, aracın adını CV'de anmamış olması onu
   diskalifiye etmez.

   NASIL KARŞILIYOR — "evidence" ve "gap".
   "met" ve "partial" damgası tek başına yetmez: işe alım uzmanı adayın bu
   maddeyi HANGİ İŞLE karşıladığını ve kendi ihtiyacıyla NEREDE ayrıştığını
   görmek zorunda. İki aday aynı damgayı alıp bambaşka insanlar olabilir.

   - "evidence": Bu damganın CV'deki SOMUT dayanağı. Rol, şirket ölçeği,
     süre, yapılan iş — CV'de YAZANI kullan. En fazla bir cümle.
     DOĞRU: 'X'te 3 yıl kayıt-aktivasyon akışının sahibi, haftalık deney
     döngüsü kurmuş.'
     YANLIŞ: 'Bu alanda güçlü deneyime sahip.' (CV'den hiçbir şey taşımıyor)
     "missing" ise BOŞ BIRAK — olmayan şeyin dayanağı olmaz.

   - "gap": Aday maddeyi karşılıyor ama ilanın istediğiyle TAM ÖRTÜŞMÜYORSA
     aradaki fark. En fazla bir cümle.
     DOĞRU: 'Deneyimi B2C ölçekte; ilan B2B SaaS istiyor.'
     DOĞRU: 'Akışı sahiplenmiş ama kurgulayan değil, devralan olarak.'
     Fark YOKSA BOŞ BIRAK. Zorlama fark uydurma — her maddeye bir kusur
     yazmak, gerçek farkların görünmesini engeller.

   İKİSİ DE CV'YE DAYANMAK ZORUNDA. CV'de olmayan bir şeyi çıkarsama yoluyla
   yazma; emin değilsen boş bırak. Boş alan, uydurulmuş alandan iyidir.
   Ayrıca "coverageScore": karşılanma oranını 0-100 arası tek sayı olarak ver
   (met tam, partial yarım sayılır; [ZORUNLU] maddeler çok daha ağır basar).
   İyi yazılmış ama ilanla ilgisiz bir CV DÜŞÜK coverageScore almalıdır —
   CV kalitesi bu alanı YÜKSELTMEZ.
2. STAR Analizi — KANIT ÖLÇEĞİ (0-3), tek yönlü.
   Bu bölüm adayın NİTELİĞİNİ değil, CV'de NE KADAR KANIT bulunduğunu ölçer.
   Bilginin CV'de olmaması bir KUSUR DEĞİLDİR: aday gizlilik yükümlülüğü,
   yer kısıtı ya da yazım alışkanlığı nedeniyle yazmamış olabilir.

   Her kategori (Situation, Task, Action, Result) için 0-3 arası puan ver.
   Çapalar (ARADA DEĞER YOK, tam olarak bu tanımlara bak):
     0 = CV'de bu boyuta dair hiçbir bilgi yok
     1 = anılmış — rol/görev adı geçiyor ama içerik yok
     2 = anlatılmış — ne yapıldığı somut biçimde yazılmış
     3 = ölçülmüş — büyüklük belirtilmiş

   "3 = ölçülmüş" İÇİN NELER SAYILIR (kesin rakam ŞART DEĞİL):
   - Aralık ya da yaklaşık değer: "%15-20 iyileştirdi", "yaklaşık 2 kat"
   - Göreli değişim: "dönüşümü iki katına çıkardı", "süreyi yarıya indirdi"
   - ÖLÇEK VEKİLLERİ — büyüklüğü gösteren her somut bilgi:
       kaç kişilik ekip yönetti / kaç kişiyle çalıştı
       kullanıcı, müşteri, işlem ya da ciro mertebesi ("milyonlarca kullanıcı")
       kaç ülke, kaç ekip, kaç ürün, kaç pazar
       görevin süresi ve rol ilerlemesi
       sistem/mimari karmaşıklığı
   Gizlilik yükümlülüğü olan adaylar kesin rakam yerine tam da bu biçimleri
   kullanır. Yalnızca kesin rakam arayıp bunları görmezden gelmek, en sıkı
   NDA'ye sahip — yani çoğu zaman en nitelikli — adayları cezalandırır.

   Her kategori için ŞU ALANLARI doldur:
   - "evidence": CV'de GERÇEKTEN yazan kanıt. Şirket adı, proje, rol, dönem,
     sayı ya da kısa alıntı geçir.
     ÖRNEK: "Trendyol'da checkout funnel'ını devralıp dönüşümü %2,1'den
     %3,4'e çıkardığını yazmış."
     Kanıt yoksa BOŞ BIRAK ("").
   - "missing": CV'de OLMAYAN ve mülakatta sorulması gereken bilgi. Bunu bir
     kusur gibi DEĞİL, bir SORU gibi yaz.
     ÖRNEK: "Getir'deki büyüme rolünde başlangıç metrikleri yazılmamış —
     devraldığında dönüşüm neydi?"
     Sorulacak bir şey yoksa BOŞ BIRAK ("").
   - "conflict": YALNIZCA gerçek bir tutarsızlık varsa doldur. Örnekler:
     tarihler çakışıyor, iddia ile sayı uyuşmuyor, aynı başarı iki farklı
     şirkette anlatılmış, açıklanmamış uzun boşluk.
     Neredeyse her CV'de bu alan BOŞ olacaktır ("") — bu normaldir.
   - "confidentiality": true/false. Aday bu boyutta gizlilik nedeniyle
     ayrıntı vermediğini AÇIKÇA belirtmişse true yaz — "NDA", "gizlilik
     sözleşmesi", "ticari sır", "müşteri adı paylaşılamaz", "isimsiz büyük
     müşteri", "detay paylaşamıyorum" gibi ifadeler.
     Yalnızca CV'de böyle bir ifade GEÇİYORSA true. Rakam yok diye tahmin
     yürütme; sessiz kalmak gizlilik beyanı değildir.
     Bu bayrak PUAN KAZANDIRMAZ — yalnızca "missing" sorusunun nasıl
     sorulacağını değiştirir (aşağıya bak).

   GİZLİLİK BEYANI VARSA (confidentiality: true):
   - Soruyu NDA-GÜVENLİ biçimde sor. Adaydan gizli bilgiyi ifşa etmesini
     ISTEME; büyüklük mertebesi, oran ya da ekip ölçeği iste.
     ÖRNEK: "Müşteri adını paylaşamadığını yazmış — projenin büyüklük
     mertebesini (kullanıcı sayısı, ekip boyutu) paylaşabilir mi?"
   - Gizliliği doğru yönetmek bir OLGUNLUK göstergesidir; bunu asla kusur
     gibi anlatma.
   - Yine de puanı "evidence" belirler: aday gizlilik altında bile ölçek
     vekili vermişse yüksek çapa alır, hiçbir şey vermemişse düşük.

   MUTLAK KURALLAR:
   - "missing" alanına yazdığın şey puanı düşürmez; yalnızca "evidence"ın
     zenginliği puanı belirler. Bilgi yokluğu zaten düşük çapa demektir,
     ayrıca cezalandırılmaz.
   - "conflict" alanını DOLDURMAK İÇİN ZORLAMA. Kusur icat etme.
   - Bir boyut hakkında hem "iyi anlatmış" hem "daha detaylı olabilirdi"
     yazma. Bu bir çelişkidir; çapa hangi seviyeyse onu yaz ve geç.
   - "Net bir şekilde ortaya koyuyor", "daha fazla vurgulanabilir",
     "zenginleştirilebilir", "detaylı ve somut" gibi HERHANGİ bir adaya
     yapıştırılabilecek kalıpları KULLANMA.
   - TEST: Yazdığın cümle BAŞKA bir adayın CV'sine de aynen uyuyorsa o cümle
     YANLIŞTIR, yeniden yaz.
   - KANIT UYDURMA.
   - STAR, ilana uygunluğu ölçmez; uygunluk requirementCoverage'ın işidir.
3. Öne Çıkan Tecrübeler: Adayın geçmişindeki spesifik projeleri, kullandığı teknolojileri veya başarılarını analizde mutlaka kullan.
4. Özet (Summary): Sadece genel cümleler kurma. Somut kanıtlar sun.
   ZORUNLU/TERCİHEN AYRIMINA UY:
   - Özete [ZORUNLU] maddelerin durumuyla BAŞLA: hangileri karşılanıyor,
     hangileri karşılanmıyor. Uygunluk yargısı YALNIZCA bunlara dayanır.
   - Tüm [ZORUNLU] maddeler karşılanıyorsa bunu AÇIKÇA söyle; tercih edilen
     maddelerdeki boşluklar yüzünden adayı "eksik/yetersiz" gösterme.
   - [TERCİHEN] maddeleri ASLA "eksiklik", "kanıt yok", "yetersiz" gibi
     ifadelerle anlatma. Karşılanıyorsa artı olarak yaz; karşılanmıyorsa en
     fazla ayrı bir cümlede "şu alanlar ek avantaj sağlayabilirdi" de.
   - Etiketsiz (ne [ZORUNLU] ne [TERCİHEN]) maddeler varsa onları nötr ele al.
5. TIRNAK KURALI (JSON'ı bozmamak için ZORUNLU): Hiçbir metin alanının
   İÇİNDE düz çift tırnak (") KULLANMA. Gereksinim adı, CV alıntısı ya da
   vurgu için TEK tırnak (') kullan.
   DOĞRU:  "note": "CV'de 'funnel sahipliği' açıkça yazılmış."
   YANLIŞ: "note": "CV'de "funnel sahipliği" açıkça yazılmış."
   Kaçışsız bir çift tırnak tüm yanıtı okunamaz hâle getirir ve analiz
   tamamen boşa gider.

ÇIKTI FORMATI (JSON):
{
  "extractedData": {
    "totalYearsOfExperience": <integer>,
    "matchedKeywords": ["keyword1"],
    "missingKeywords": ["keyword2"],
    "requirementCoverage": {
        "assessments": [{ "index": 1, "status": "met|partial|missing", "kind": "deneyim|arac", "note": "kısa gerekçe", "evidence": "CV'deki somut dayanak", "gap": "" }],
        "met": ["karşılanan gereksinim"],
        "partial": ["kısmen karşılanan gereksinim"],
        "missing": ["karşılanmayan gereksinim"],
        "coverageScore": <integer 0-100>
    },
    "starAnalysis": {
        "Situation": { "score": <0-3>, "evidence": "...", "missing": "...", "conflict": "", "confidentiality": false },
        "Task":      { "score": <0-3>, "evidence": "...", "missing": "...", "conflict": "", "confidentiality": false },
        "Action":    { "score": <0-3>, "evidence": "...", "missing": "...", "conflict": "", "confidentiality": false },
        "Result":    { "score": <0-3>, "evidence": "...", "missing": "...", "conflict": "", "confidentiality": false }
    }
  },
  "evidence": {
    "reasoning": ["Kanıt 1", "Kanıt 2"],
    "summary": "..."
  }
}
`;

export async function extractCandidateEvidence(jobDescription, candidateProfile, modelId = 'gemini-2.5-flash') {
    const sanitizedCandidate = {
        position: candidateProfile.position,
        experience: candidateProfile.experience,
        skills: candidateProfile.skills,
        description: sanitizeForPrompt(candidateProfile.description || candidateProfile.about || ''),
        // cvData'yı yalnızca manuel yükleme akışı yazar; toplu içe aktarma ve
        // başvuru formu CV metnini cvText alanına koyar. cvText'e düşülmezse
        // bu adayların derin analizi BOŞ CV ile çalışır ve skorlar çöker.
        cvData: sanitizeForPrompt(candidateProfile.cvData || candidateProfile.cvText || ''),
        experiences: candidateProfile.experiences || []
    };

    const prompt = buildStructuredPrompt(EXTRACTOR_PROMPT, {
        "JOB_DESCRIPTION": jobDescription,
        "CANDIDATE_DATA": JSON.stringify(sanitizedCandidate, null, 2)
    });

    const model = await getModel(modelId);
    // Varsayılan 8192 token bu çıktı için artık dar: her gereksinim için
    // kind + note taşıyan assessments dizisi ve CV'den alıntı isteyen STAR
    // gerekçeleri toplamı büyüttü. Kesilen yanıt GEÇERSİZ JSON üretir ve
    // parseAIJson'ın son çaresi olan /\{[\s\S]*\}/ kapanış parantezi
    // bulamadığı için hiçbir kurtarma denemesi tutmaz — analiz sessizce
    // "sonuç üretmedi"ye düşerdi. Cap'tir, hedef değil: kısa yanıtlar için
    // maliyeti yok.
    const result = await model.generateContent(prompt, { maxOutputTokens: 16384 });
    const raw = result.response.text();
    const parsed = parseAIJson(raw);
    if (!parsed) {
        // Yanıtın SONUNU göstermek yetmiyordu: yanıt eksiksiz görünüp
        // ortasındaki tek bir karakter yüzünden kırılabiliyor (2026-08-07'de
        // tam olarak bu yaşandı — 7572 karakterlik, düzgün kapanmış bir
        // yanıt). Artık kırılmanın olduğu YER gösteriliyor.
        const ctx = jsonFailureContext(raw);
        throw new Error(
            `AI yanıtı JSON olarak okunamadı (uzunluk: ${String(raw || '').length}`
            + (ctx?.position != null ? `, kırılma: ${ctx.position}` : '')
            + `). ${ctx?.message || ''} Bozuk kısım: …${ctx?.snippet || ''}…`
        );
    }
    return parsed;
}

export async function extractPositionFromJD(jdText) {
    const instruction = `Lütfen aşağıdaki iş tanımı metnini analiz et ve bilgileri ayıkla.
    Sadece JSON olarak dön:
    { "title": "Pozisyon Adı", "requirements": ["şart1", "şart2"], "description": "Pozisyonu 1-2 cümleyle özetleyen kısa açıklama (max 280 karakter, iş ilanı metni değil, özet)" }
    ÖNEMLİ: description alanı kesinlikle 280 karakteri geçmemeli ve iş ilanının ham metni olmamalı.`;

    const prompt = buildStructuredPrompt(instruction, { "JD_METNI": sanitizeForPrompt(jdText) });

    const model = await getModel();
    const result = await model.generateContent(prompt);
    return parseAIJson(result.response.text(), { title: "Bilinmeyen Pozisyon", requirements: [], description: "" });
}

export async function quickCandidateScreening(candidateProfile, openPositions) {
    const sanitizedCandidate = {
        position: candidateProfile.position,
        experience: candidateProfile.experience,
        skills: candidateProfile.skills,
        description: sanitizeForPrompt(candidateProfile.description || candidateProfile.about || ''),
        cvData: sanitizeForPrompt(candidateProfile.cvData || ''),
    };

    const positionsText = openPositions.map(p => `- ${p.title}: ${p.requirements?.join(', ')}`).join('\n');

    const instruction = `Sen bir Yetenek Yönetimi Uzmanısın. Amacın, adayı sistemdeki AÇIK POZİSYONLARLA genel bir bakış açısıyla kıyaslamaktır.
    
    Sadece JSON formatında çıktı ver:
    {
      "suitability": "Uygun" | "Potansiyel" | "Uygun Değil",
      "suggestedOpenPosition": "Açık pozisyon adı veya null",
      "potentialPosition": "Önerilen rol",
      "reasoning": "Açıklama"
    }`;

    const prompt = buildStructuredPrompt(instruction, {
        "OPEN_POSITIONS": positionsText || "Sistemde açık pozisyon bulunmuyor.",
        "CANDIDATE_DATA": JSON.stringify(sanitizedCandidate, null, 2)
    });

    const model = await getModel();
    const result = await model.generateContent(prompt);
    return parseAIJson(result.response.text(), { suitability: "Potansiyel", reasoning: "Analiz tamamlanamadı." });
}
