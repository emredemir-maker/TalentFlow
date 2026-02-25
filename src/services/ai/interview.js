// src/services/ai/interview.js
import { getModel } from './config.js';

export async function generateInterviewQuestions(candidate, starAnalysis, interviewType = 'technical') {
    const persona = interviewType === 'product' ? 'Product Manager' : (interviewType === 'culture' ? 'HR Director' : 'Technical Lead');
    const prompt = `Sen kıdemli bir ${persona}sın. Aday ${candidate?.name} için mülakat soruları hazırla.
    CV: ${JSON.stringify(candidate)}
    STAR Analizi: ${JSON.stringify(starAnalysis)}
    JSON array olarak dön ["soru1", "soru2", "soru3"]`;

    const model = await getModel();
    const result = await model.generateContent(prompt);
    try {
        const clean = result.response.text().replace(/```json|```/gi, '').trim();
        return JSON.parse(clean);
    } catch (e) {
        return ["Deneyimlerinizi anlatın.", "Teknik zorlukları nasıl aşarsınız?"];
    }
}

export async function generateInterviewPaths(candidate, interviewType = 'technical') {
    const typeContexts = {
        technical: "Uzmanlık Lead personasıyla, mimari, derin bilgi, problem çözme ve saha tecrübesine odaklan.",
        product: "Product Manager personasıyla, sadece ürün vizyonu, kullanıcı deneyimi (UX), önceliklendirme, metrikler ve iş değerine odaklan. Satış veya operasyon rolü ise iş geliştirme perspektifini ölçün.",
        culture: "İK Direktörü personasıyla, iletişim becerileri, ekip uyumu, çatışma yönetimi ve şirket değerlerine odaklan."
    };

    const prompt = `Sen kıdemli bir mülakatçısın. Aday ${candidate?.name} için 3 farklı mülakat rotası hazırla.
    Tür: ${interviewType.toUpperCase()}. 
    Odak Noktası: ${typeContexts[interviewType] || typeContexts.technical}
    
    JSON formatında tam olarak şu yapıda dön:
    { 
      "paths": [
        { 
          "id": "p1", 
          "title": "Rota Başlığı", 
          "description": "Rota Açıklaması", 
          "icon": "zap", 
          "questions": [
            { "question": "Soru metni", "category": "Kategori", "evaluationHint": "Değerlendirme ipucu" }
          ] 
        }
      ] 
    }

    ÖNEMLİ: icon alanı "zap", "code", "users", "target", "box" değerlerinden biri olmalı. 
    İş Tanımı: ${candidate.matchedPositionTitle || candidate.position}
    Aday Verisi: ${JSON.stringify(candidate)}`;

    const model = await getModel();
    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const cleanJson = text.replace(/```json|```/gi, '').trim();
        const parsed = JSON.parse(cleanJson);
        const paths = parsed.paths || (Array.isArray(parsed) ? parsed : []);

        // Yapıyı garantiye al
        return paths.map((p, i) => ({
            id: p.id || `p${i}`,
            title: p.title || 'Mülakat Rotası',
            description: p.description || 'Aday değerlendirme süreci',
            icon: p.icon || 'target',
            questions: (p.questions || []).map(q =>
                typeof q === 'string' ? { question: q, category: 'Genel' } :
                    { ...q, question: q.question || q.text || 'Soru bulunamadı' }
            )
        }));
    } catch (e) {
        console.error("Interview paths error:", e);
        return [{
            id: 'default',
            title: 'Genel Tanışma ve Değerlendirme',
            description: 'Adayın genel yetkinliklerini ve deneyimini anlamaya yönelik standart rota.',
            icon: 'users',
            questions: [
                { question: "Kariyer yolculuğunuzdan ve son dönemdeki projelerinizden bahseder misiniz?", category: "Deneyim" },
                { question: "Sizi bu pozisyon için en güçlü aday yapan özellikleriniz nelerdir?", category: "Yetkinlik" },
                { question: "Gelecek 2-3 yıl için kariyer hedefleriniz nelerdir?", category: "Vizyon" }
            ]
        }];
    }
}

export async function scoreInterviewSession(candidate, interviewType, questionsAndAnswers) {
    const prompt = `Sen bir mülakat değerlendirme asistanısın. Aday ${candidate?.name} ile yapılan ${interviewType} mülakatını değerlendir.
    
    ÖNEMLİ KURALLAR:
    1. Sadece sana gönderilen Soru-Cevap ikililerini değerlendir.
    2. Sorulmayan veya cevaplanmayan sorular için puan kırma, onları yok say. 
    3. Puanlamayı (0-100) sadece mevcut cevaplardaki kanıtlara göre yap.
    
    MÜLAKAT VERİSİ (QA):
    ${JSON.stringify(questionsAndAnswers)}
    
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
    const model = await getModel();
    const result = await model.generateContent(prompt);
    try {
        return JSON.parse(result.response.text().replace(/```json|```/gi, '').trim());
    } catch (e) {
        return { overallScore: 50, summary: 'Hata' };
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

    const prompt = `Sen kıdemli bir ${persona}sın. Aday ${candidate?.name} ile mülakat yapıyorsun.
    
    ADAY CV: ${JSON.stringify(candidate)}
    MÜLAKAT GEÇMİŞİ: ${JSON.stringify(conversationHistory)}
    
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

    const model = getModel();
    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const cleanJson = text.replace(/```json|```/gi, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        console.error("Follow up error:", e);
        return {
            question: category ? `${category} ile ilgili bir deneyiminden bahseder misin?` : "Biraz daha detaylandırır mısın?",
            category: category || 'Genel'
        };
    }
}
