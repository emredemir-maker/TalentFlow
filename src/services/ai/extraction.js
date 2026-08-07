// src/services/ai/extraction.js
import { getModel } from './config.js';
import { parseAIJson, buildStructuredPrompt, sanitizeForPrompt } from './utils.js';

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
   Ayrıca "coverageScore": karşılanma oranını 0-100 arası tek sayı olarak ver
   (met tam, partial yarım sayılır; [ZORUNLU] maddeler çok daha ağır basar).
   İyi yazılmış ama ilanla ilgisiz bir CV DÜŞÜK coverageScore almalıdır —
   CV kalitesi bu alanı YÜKSELTMEZ.
2. STAR Analizi: Her kategori (S, T, A, R) için 1-10 arası puan ver.
   - "reason" biçimi: "Pozitif (+): ..., Negatif (-): ...".
   - HER İKİ TARAF DA CV'DEN SOMUT KANIT İÇERMELİ. Şirket adı, proje/ürün
     adı, rol, dönem, sayı ya da CV'den kısa bir alıntı geçir.
     ÖRNEK (iyi): "Pozitif (+): Trendyol'da checkout funnel'ını devraldığında
     dönüşümün %2,1 olduğunu ve 8 kişilik ekiple çalıştığını yazmış."
     ÖRNEK (kötü, YASAK): "Aday, üstlendiği sorumlulukların bağlamını net bir
     şekilde ortaya koyuyor."
   - TEST: Yazdığın cümle BAŞKA bir adayın CV'sine de aynen uyuyorsa o cümle
     YANLIŞTIR, yeniden yaz. "Net bir şekilde ortaya koyuyor", "detaylı ve
     somut", "daha fazla vurgulanabilir", "zenginleştirilebilir" gibi
     herhangi bir adaya yapıştırılabilecek kalıpları KULLANMA.
   - Negatif tarafta da somut ol: HANGİ deneyimde NEYİN eksik olduğunu söyle
     ("Getir'deki büyüme rolünde hiçbir sonuç sayısal verilmemiş" gibi),
     soyut tavsiye verme.
   - KANIT UYDURMA. CV'de gerçekten yoksa bunu somut biçimde yaz:
     "CV'de X rolü için başlangıç durumu hiç anlatılmamış". Kanıt yokluğu da
     bir bulgudur; uydurulmuş örnekten iyidir.
   - Negatif için gerçekten söylenecek bir şey yoksa "Yok." yaz; kusur icat
     etme.
   - STAR, anlatım/kanıt KALİTESİNİ ölçer; ilana uygunluğu değil.
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

ÇIKTI FORMATI (JSON):
{
  "extractedData": {
    "totalYearsOfExperience": <integer>,
    "matchedKeywords": ["keyword1"],
    "missingKeywords": ["keyword2"],
    "requirementCoverage": {
        "assessments": [{ "index": 1, "status": "met|partial|missing", "kind": "deneyim|arac", "note": "kısa gerekçe" }],
        "met": ["karşılanan gereksinim"],
        "partial": ["kısmen karşılanan gereksinim"],
        "missing": ["karşılanmayan gereksinim"],
        "coverageScore": <integer 0-100>
    },
    "starAnalysis": {
        "Situation": { "score": <integer>, "reason": "..." },
        "Task": { "score": <integer>, "reason": "..." },
        "Action": { "score": <integer>, "reason": "..." },
        "Result": { "score": <integer>, "reason": "..." }
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
        // Ham yanıtın kuyruğu teşhis için kritik: kesilme mi, güvenlik
        // engeli mi, boş yanıt mı olduğu ancak buradan anlaşılıyor.
        const tail = String(raw || '').slice(-160);
        throw new Error(
            `AI yanıtı JSON olarak okunamadı (uzunluk: ${String(raw || '').length}). Yanıt sonu: …${tail}`
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
