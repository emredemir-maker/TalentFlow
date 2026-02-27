// src/services/ai/communication.js
import { getModel } from './config.js';
import { parseAIJson, buildStructuredPrompt, sanitizeForPrompt } from './utils.js';

export async function generatePersonalizedDM(name, skills, position, company, purpose = 'interview', type = 'initial') {
    const instruction = `Sen kıdemli bir İşe Alım Uzmanısın. Aday için profesyonel ve sıcak bir mesaj yaz.
    
    ÖNEMLİ KURALLAR:
    1. Mesaj dili TÜRKÇE olmalıdır.
    2. Format JSON olmalıdır: { "subject": "...", "body": "..." }
    3. Eğer amaç 'interview' ise, mesajın içinde mutlaka tam olarak "[Takvim Linkiniz]" (köşeli parantezler dahil) ifadesini uygun bir yere yerleştir. 
    4. Samimi ama kurumsal bir ton kullan.
    5. Adayın yeteneklerine atıfta bulunarak neden ilgilendiğini belirt.
    
    Sadece JSON formatında yanıt ver.`;

    const prompt = buildStructuredPrompt(instruction, {
        "ADAY_NAME": name,
        "YETENEKLER": (skills || []).join(', '),
        "POZİSYON": position,
        "ŞİRKET": company,
        "AMAÇ": purpose === 'interview' ? 'Mülakat Daveti (' + type + ')' : purpose === 'reject' ? 'Kibarca Red' : 'Genel İletişim'
    });

    const model = await getModel();
    try {
        const result = await model.generateContent(prompt);
        return parseAIJson(result.response.text(), {
            subject: purpose === 'interview' ? 'Görüşme Talebi' : 'Başvurunuz Hakkında',
            body: `Merhabalar ${name},\n\nProfilinizi inceledik ve oldukça etkileyici bulduk.\n\n[Takvim Linkiniz]\n\nİyi günler.`
        });
    } catch (e) {
        console.error("DM Generation Error:", e);
        return {
            subject: 'Başvurunuz Hakkında',
            body: `Merhabalar ${name}, profiliniz için teşekkürler.`
        };
    }
}

export async function analyzeResponseEmail(emailText) {
    const instruction = `E-postayı analiz et ve aşağıdakileri belirle:
    - sentiment: Pozitif, Negatif, Nötr
    - decision: Adayın bir kararı veya yanıtı var mı?
    - summary: Kısa özet
    
    JSON formatında dön: { "sentiment": "...", "decision": "...", "summary": "..." }`;

    const prompt = buildStructuredPrompt(instruction, { "EMAIL_BODY": sanitizeForPrompt(emailText) });
    const model = await getModel();
    try {
        const result = await model.generateContent(prompt);
        return parseAIJson(result.response.text(), { sentiment: 'Belirsiz', summary: 'Manuel kontrol lazım.' });
    } catch (e) {
        return { sentiment: 'Belirsiz', summary: 'Analiz yapılamadı.' };
    }
}
