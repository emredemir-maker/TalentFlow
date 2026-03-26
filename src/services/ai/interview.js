// src/services/ai/interview.js
import { getModel } from './config.js';
import { parseAIJson, buildStructuredPrompt, sanitizeForPrompt } from './utils.js';
import { stripPiiForAI } from '../../utils/pii.js';

// ─── PII Stripping ────────────────────────────────────────────────────────────
// Delegate to the centralized pii.js utility so stripping logic is maintained
// in a single place. Exported as `stripPII` for backward compatibility with
// callers in geminiService.js and LiveInterviewPage.jsx.
export function stripPII(candidate) {
    return stripPiiForAI(candidate);
}

// ─── Bias Guardrail Preamble ──────────────────────────────────────────────────
// Injected into every evaluation prompt.
const BIAS_GUARDRAIL = `
ZORUNLU DEĞERLENDİRME KURALLARI (Bias Guardrail):
1. Yalnızca gözlemlenebilir DAVRANIŞLARI ve somut KANITları değerlendir.
2. Cinsiyet, yaş, etnisite, aksanlı konuşma, isimleri veya kişisel özellikler hiçbir zaman puanlamayı ETKİLEMEZ.
3. İletişim tarzı (hızlı/yavaş konuşma, sözlü doldurucular) değil, içerik ve kanıt önemlidir.
4. Mülakatçı sorusunda demografik özellik ima eden ifade tespit edersen bias_warning: true döndür.
5. STAR çerçevesine (Durum, Görev, Eylem, Sonuç) göre değerlendir; çerçeve dışı çıkarım yapma.
6. Eğer aday yeterli bilgi vermemişse düşük puan VER, tahmin ETME.
`;

// ─── Real-time STAR Analysis ──────────────────────────────────────────────────
// Called automatically after each new ADAY transcript entry.
// Evaluates the 5 competency dimensions displayed in the radar chart and
// returns a recruiter-facing insight. Uses STAR as the evaluation framework.
export async function analyzeSTARRealTime(anonymizedProfile, recentTranscript, currentQuestion, positionContext = {}) {
    // Defense-in-depth: always strip PII inside the function regardless of caller.
    const safeProfile = stripPiiForAI(anonymizedProfile);
    const positionLine = positionContext?.title
        ? `\nHEDEF POZİSYON: ${positionContext.title}${positionContext.requirements ? ` — Gereksinimler: ${positionContext.requirements}` : ''}`
        : '';
    const instruction = `Sen tarafsız bir mülakat gözlemcisisin. Son aday konuşmasını STAR metodolojisini kullanarak 5 yetkinlik boyutunda değerlendir.${positionLine}

${BIAS_GUARDRAIL}

GÖREV:
- STAR çerçevesini (Durum, Görev, Eylem, Sonuç) rehber olarak kullanarak aday cevabında aşağıdaki 5 yetkinliği 0-100 arasında puanla.
- Puanları hedef pozisyon gereksinimleri ışığında yorumla; pozisyon belirtilmişse teknik yetkinliğe daha fazla ağırlık ver.
- Puanı sadece bu konuşma anına ait kanıtlara dayandır; geçmiş hakkında tahminde bulunma.
- Mülakatçıya kısa, eyleme geçirilebilir bir içgörü üret (Türkçe).
- Sonraki soru için somut bir öneri sun (Türkçe).
- Son recruiter sorusunda önyargı işareti varsa bias_warning: true yap ve bias_detail ile açıkla.

JSON formatında SADECE şu yapıda dön (başka hiçbir metin ekleme):
{
  "scores": {
    "technical": <0-100, Teknik bilgi/yetkinlik ne kadar güçlü sergilendi?>,
    "communication": <0-100, İfade netliği, yapılandırma, STAR akışı ne kadar kuruldu?>,
    "problemSolving": <0-100, Somut problem çözme adımları ve yaratıcılık ne kadar gösterildi?>,
    "cultureFit": <0-100, Ekip çalışması, değerler, empati kanıtları ne kadar açıklandı?>,
    "adaptability": <0-100, Belirsizlik, değişim, öğrenme esnekliği kanıtları ne kadar güçlüydü?>
  },
  "insight": "Tek cümle: adayın bu cevapta öne çıkan güçlü veya zayıf yönü",
  "suggestion": "Tek cümle: mülakatçıya bir sonraki soru için öneri",
  "bias_warning": false,
  "bias_detail": null
}`;

    const prompt = buildStructuredPrompt(instruction, {
        "ADAY_PROFİLİ": JSON.stringify(safeProfile),
        "GÜNCEL_SORU": currentQuestion || '(Recruiter tarafından sözlü soruldu)',
        "SON_KONUŞMALAR": JSON.stringify(
            recentTranscript.map(t => ({ rol: t.role, metin: t.text }))
        )
    });

    try {
        const model = await getModel();
        const result = await model.generateContent(prompt);
        return parseAIJson(result.response.text(), null);
    } catch (e) {
        console.error('[STAR RealTime]', e.message);
        return null;
    }
}

// ─── Existing Functions (PII stripped) ───────────────────────────────────────

export async function generateInterviewQuestions(candidate, starAnalysis, interviewType = 'technical') {
    const persona = interviewType === 'product' ? 'Product Manager' : (interviewType === 'culture' ? 'HR Director' : 'Technical Lead');
    const instruction = `Sen kıdemli bir ${persona}sın. Aday için mülakat soruları hazırla.
    JSON array olarak dön ["soru1", "soru2", "soru3"]`;

    const prompt = buildStructuredPrompt(instruction, {
        "CANDIDATE": JSON.stringify(stripPII(candidate)),
        "STAR_ANALYSIS": JSON.stringify(starAnalysis)
    });

    try {
        const model = await getModel();
        const result = await model.generateContent(prompt);
        return parseAIJson(result.response.text(), ["Deneyimlerinizi anlatın.", "Teknik zorlukları nasıl aşarsınız?"]);
    } catch (e) {
        console.error("Interview questions error:", e);
        return ["Deneyimlerinizi anlatın.", "Teknik zorlukları nasıl aşarsınız?"];
    }
}

export async function generateInterviewPaths(candidate, interviewType = 'technical') {
    const safe = stripPII(candidate);
    const typeContexts = {
        technical: "Teknik Kültür / Mühendislik Lead personasıyla, mimari, derin teknik bilgi, problem çözme ve saha tecrübesine odaklan.",
        product: "Product Manager personasıyla, ürün vizyonu, kullanıcı deneyimi (UX), önceliklendirme, metrikler ve iş değerine odaklan.",
        culture: "İK Direktörü personasıyla, iletişim becerileri, ekip uyumu, çatışma yönetimi ve şirket değerlerine odaklan."
    };

    const instruction = `Sen kıdemli bir mülakat stratejistisin. Aday için tam olarak 3 farklı mülakat soru seti (rota) hazırla.
    Seçilen Mülakat Türü: ${interviewType.toUpperCase()}. 
    Odak Noktası: ${typeContexts[interviewType] || typeContexts.technical}
    
    KURALLAR:
    1. Her set (path) tam olarak 3 adet soru içermelidir. Toplam 9 benzersiz soru hazırlanmalıdır.
    2. Her soru adayın CV'sindeki ${safe.experience} yıllık tecrübesine ve başvurduğu ${safe.position} pozisyonuna doğrudan atıfta bulunmalıdır.
    3. Sorular 'Deneyimlerine göre...', 'CV'nde bahsettiğin X projesinde...' gibi kişiselleştirilmiş başlamalıdır.
    4. 1. Set: Isınma ve Temel Yetkinlikler (Mevcut CV verileri üzerinden).
    5. 2. Set: Derinlemesine Sorgulama ve Teknik/Ürün Senaryoları.
    6. 3. Set: Zorlayıcı Durumlar, Mimari Kararlar veya Vizyon.
    
    JSON formatında tam olarak şu yapıda dön:
    { 
      "paths": [
        { 
          "id": "set1", 
          "title": "Set Başlığı", 
          "description": "Bu setin mülakattaki amacı", 
          "icon": "zap", 
          "questions": [
            { "question": "Soru metni", "category": "Kategori", "evaluationHint": "Değerlendirme ipucu" }
          ] 
        }
      ] 
    }
    
    ÖNEMLİ: icon alanı "zap", "target", "users", "code", "brain", "activity" gibi Lucide ikon adları olabilir.`;

    const prompt = buildStructuredPrompt(instruction, {
        "TARGET_POSITION": safe.matchedPositionTitle || safe.position,
        "CANDIDATE_DATA": sanitizeForPrompt(JSON.stringify(safe))
    });

    try {
        const model = await getModel();
        const result = await model.generateContent(prompt);
        const parsed = parseAIJson(result.response.text(), { paths: [] });
        let paths = parsed.paths || (Array.isArray(parsed) ? parsed : []);

        if (paths.length > 3) paths = paths.slice(0, 3);
        
        const finalPaths = paths.map((p, i) => ({
            id: p.id || `set${i + 1}`,
            title: p.title || `Set ${i + 1}`,
            description: p.description || 'Aday değerlendirme süreci',
            icon: p.icon || (i === 0 ? 'zap' : i === 1 ? 'target' : 'users'),
            questions: (p.questions || []).slice(0, 3).map(q =>
                typeof q === 'string' ? { question: q, category: 'Genel' } :
                    { ...q, question: q.question || q.text || 'Soru bulunamadı' }
            )
        }));

        if (finalPaths.length === 0) throw new Error("No paths generated");
        return finalPaths;
    } catch (e) {
        console.error("Interview paths error:", e);
        return [{
            id: 'set1',
            title: 'Hızlı Başlangıç Seti',
            description: 'Adayın temel yetkinliklerini anlamaya yönelik hazır set.',
            icon: 'zap',
            questions: [
                { question: "Mevcut tecrübelerinizden ve projelerinizden bahseder misiniz?", category: "Deneyim" },
                { question: "CV'nizde bahsettiğiniz teknik araçları bu pozisyonda nasıl kullanırsınız?", category: "Yetkinlik" },
                { question: "Ekip çalışması ve problem çözme yaklaşımınız nasıldır?", category: "Kültür" }
            ]
        }];
    }
}

export async function scoreInterviewSession(candidate, interviewType, questionsAndAnswers) {
    const instruction = `Sen bir mülakat değerlendirme asistanısın. Aday ile yapılan ${interviewType} mülakatını değerlendir.

${BIAS_GUARDRAIL}
    
    KURALLAR:
    1. Sadece sana gönderilen Soru-Cevap ikililerini değerlendir.
    2. Sorulmayan veya cevaplanmayan sorular için puan kırma, onları yok say. 
    3. Puanlamayı (0-100) sadece mevcut cevaplardaki kanıtlara göre yap.
    
    JSON formatında dön:
    { 
      "overallScore": <integer>, 
      "overallVerdict": "Güçlü Aday / Potansiyel / Uygun Değil", 
      "summary": "Genel değerlendirme özeti", 
      "strengths": ["Yetenek 1"], 
      "weaknesses": ["Eksiklik 1"],
      "questionScores": [
        { "questionId": <id>, "score": <0-100>, "feedback": "Cevap analizi" }
      ] 
    }`;

    const prompt = buildStructuredPrompt(instruction, {
        "QA_DATA": JSON.stringify(questionsAndAnswers)
    });

    try {
        const model = await getModel();
        const result = await model.generateContent(prompt);
        return parseAIJson(result.response.text(), { overallScore: 50, summary: 'Değerlendirme yapılamadı.' });
    } catch (e) {
        console.error("Scoring error:", e);
        return { overallScore: 50, overallVerdict: 'Nötr', summary: 'AI değerlendirmesi yapılamadı.', questionScores: [], strengths: [], weaknesses: [] };
    }
}

// ─── Recruiter / Interviewer Evaluation (Task #8) ─────────────────────────────
// Analyses the recruiter's performance from a completed session transcript.
// Returns dimension scores (1-5) with explanations and improvement tips.
export async function evaluateInterviewer({ transcript = [], questions = [], positionTitle = '' } = {}) {
    const instruction = `Sen kıdemli bir mülakat koçusun. Mülakatçının (recruiter) performansını aşağıdaki dört boyutta değerlendir.

KURALLAR:
1. Sadece mülakatçı MÜLAKATÇI satırlarına bak (ADAY satırlarını yok say).
2. Her boyutu 1-5 arasında puan ver (5 = mükemmel).
3. Her boyut için kısa (1-2 cümle) Türkçe açıklama ve somut iyileştirme önerisi yaz.
4. Puanlamayı kanıta dayandır; tahmin etme.
5. Mülakatçı yeterli soru sormamışsa veya transcript kısaysa bunu yansıt.

BOYUTLAR:
- question_variety: Soru çeşitliliği ve derinliği — farklı kategorilerde (teknik, davranışsal, kültürel) soru soruldu mu?
- star_adherence: STAR metodolojisine uyum — adayı Durum-Görev-Eylem-Sonuç çerçevesinde yönlendirdi mi?
- active_listening: Aktif dinleme — önceki cevaplara dayalı takip soruları sordu mu?
- bias_free_language: Önyargısız dil — demografik veya önyargılı ifade var mıydı?

JSON formatında SADECE şu yapıda dön:
{
  "dimensions": [
    {
      "key": "question_variety",
      "label": "Soru Çeşitliliği",
      "score": <1-5>,
      "explanation": "...",
      "tip": "..."
    },
    {
      "key": "star_adherence",
      "label": "STAR Metodolojisi",
      "score": <1-5>,
      "explanation": "...",
      "tip": "..."
    },
    {
      "key": "active_listening",
      "label": "Aktif Dinleme",
      "score": <1-5>,
      "explanation": "...",
      "tip": "..."
    },
    {
      "key": "bias_free_language",
      "label": "Önyargısız Dil",
      "score": <1-5>,
      "explanation": "...",
      "tip": "..."
    }
  ],
  "overallScore": <1-5, ortalama>,
  "summary": "Mülakatçıya 2-3 cümle genel geri bildirim (Türkçe)"
}`;

    const recruiterLines = (transcript || [])
        .filter(t => t.role === 'MÜLAKATÇI' || t.role === 'RECRUITER' || t.role === 'interviewer')
        .map(t => t.text || t.content || '');

    const prompt = buildStructuredPrompt(instruction, {
        "POZİSYON": positionTitle || 'Belirtilmemiş',
        "SORULAR": JSON.stringify((questions || []).map(q => typeof q === 'string' ? q : q.question || q.text || q)),
        "MÜLAKATÇI_SATILARI": JSON.stringify(recruiterLines),
    });

    try {
        const model = await getModel();
        const result = await model.generateContent(prompt);
        const parsed = parseAIJson(result.response.text(), null);
        if (!parsed || !Array.isArray(parsed.dimensions)) throw new Error('Invalid response');
        return parsed;
    } catch (e) {
        console.error('[evaluateInterviewer]', e.message);
        return null;
    }
}

export async function generateFollowUpQuestion(candidate, interviewType, conversationHistory, mode = 'deepen', category = null) {
    const safe = stripPII(candidate);
    const persona = interviewType === 'product' ? 'Product Manager' : (interviewType === 'culture' ? 'İK Direktörü' : 'Technical Lead');

    let modeInstruction = "";
    if (mode === 'deepen') {
        modeInstruction = "Önceki cevaptaki teknik veya davranışsal bir detayı derinlemesine sorgula. 'Nasıl?', 'Neden?', 'Hangi yöntemle?' gibi sorularla adayı zorla.";
    } else if (mode === 'category' && category) {
        modeInstruction = `Özellikle '${category}' yetkinliğine odaklanan, adayın CV'sindeki deneyimlerle bağdaştırılmış yeni bir soru sor.`;
    } else {
        modeInstruction = "Adayın CV'sine ve şu ana kadarki mülakat akışına göre, henüz sorulmamış önemli bir alandan yeni bir soru sor.";
    }

    const instruction = `Sen kıdemli bir ${persona}sın. Aday ile mülakat yapıyorsun.

${BIAS_GUARDRAIL}
    
    GÖREV: ${modeInstruction}
    
    KURALLAR:
    1. Soru dili TÜRKÇE olmalıdır.
    2. Soru adayın CV'sindeki gerçek verilere dayanmalıdır.
    3. Daha önce sorulmuş soruların aynısını sorma.
    4. Demografik özellik veya kişisel bilgi içeren soru üretme.
    
    JSON formatında şu yapıda dön:
    { 
      "question": "Soru metni", 
      "category": "Kategori İsmi", 
      "evaluationHint": "Mülakatçı için bu soruda neye dikkat etmesi gerektiğine dair kısa ipucu" 
    }`;

    const prompt = buildStructuredPrompt(instruction, {
        "CANDIDATE_PROFILE": JSON.stringify(safe),
        "CONVERSATION_HISTORY": JSON.stringify(
            conversationHistory.map(t => ({ rol: t.role, metin: t.text }))
        )
    });

    try {
        const model = await getModel();
        const result = await model.generateContent(prompt);
        return parseAIJson(result.response.text(), {
            question: category ? `${category} ile ilgili bir deneyiminden bahseder misin?` : "Biraz daha detaylandırır mısın?",
            category: category || 'Genel'
        });
    } catch (e) {
        console.error("Follow up error:", e);
        return {
            question: "Biraz daha detaylandırır mısın?",
            category: 'Genel'
        };
    }
}
