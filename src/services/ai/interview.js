// src/services/ai/interview.js
import { getModel } from './config.js';
import { parseAIJson, buildStructuredPrompt, sanitizeForPrompt } from './utils.js';

export async function generateInterviewQuestions(candidate, starAnalysis, interviewType = 'technical') {
    const persona = interviewType === 'product' ? 'Product Manager' : (interviewType === 'culture' ? 'HR Director' : 'Technical Lead');
    const instruction = `Sen kıdemli bir ${persona}sın. Aday için mülakat soruları hazırla.
    JSON array olarak dön ["soru1", "soru2", "soru3"]`;

    const prompt = buildStructuredPrompt(instruction, {
        "CANDIDATE": JSON.stringify(candidate),
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
    2. Her soru adayın CV'sindeki ${candidate.experience} yıllık tecrübesine ve başvurduğu ${candidate.position} pozisyonuna doğrudan atıfta bulunmalıdır.
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
        "TARGET_POSITION": candidate.matchedPositionTitle || candidate.position,
        "CANDIDATE_DATA": sanitizeForPrompt(JSON.stringify(candidate))
    });

    try {
        const model = await getModel();
        const result = await model.generateContent(prompt);
        const parsed = parseAIJson(result.response.text(), { paths: [] });
        let paths = parsed.paths || (Array.isArray(parsed) ? parsed : []);

        // Ensure we have 3 paths
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
    
    ÖNEMLİ KURALLAR:
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
        "CANDIDATE": candidate?.name,
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

export async function generateFollowUpQuestion(candidate, interviewType, conversationHistory, mode = 'deepen', category = null) {
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
    
    GÖREV: ${modeInstruction}
    
    ÖNEMLİ KURALLAR:
    1. Soru dili TÜRKÇE olmalıdır.
    2. Soru adayın CV'sindeki gerçek verilere dayanmalıdır.
    3. Daha önce sorulmuş soruların aynısını sorma.
    
    JSON formatında şu yapıda dön:
    { 
      "question": "Soru metni", 
      "category": "Kategori İsmi", 
      "evaluationHint": "Mülakatçı için bu soruda neye dikkat etmesi gerektiğine dair kısa ipucu" 
    }`;

    const prompt = buildStructuredPrompt(instruction, {
        "CANDIDATE_CV": JSON.stringify(candidate),
        "CONVERSATION_HISTORY": JSON.stringify(conversationHistory)
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
