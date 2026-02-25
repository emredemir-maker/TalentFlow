// src/services/ai/communication.js
import { getModel } from './config.js';

export async function generatePersonalizedDM(name, skills, position, company, purpose = 'interview', type = 'initial') {
    const prompt = `Sen kıdemli bir İşe Alım Uzmanısın. Aday ${name} için ${position} pozisyonuna özel, profesyonel ve sıcak bir mesaj yaz.
    
    PARAMETRELER:
    - Amaç: ${purpose === 'interview' ? 'Mülakat Daveti (' + type + ')' : purpose === 'reject' ? 'Kibarca Red' : 'Genel İletişim'}
    - Şirket: ${company}
    - Aday Yetenekleri: ${skills.join(', ')}
    
    ÖNEMLİ KURALLAR:
    1. Mesaj dili TÜRKÇE olmalıdır.
    2. Format JSON olmalıdır: { "subject": "...", "body": "..." }
    3. Eğer amaç 'interview' ise, mesajın içinde mutlaka tam olarak "[Takvim Linkiniz]" (köşeli parantezler dahil) ifadesini uygun bir yere yerleştir. 
    4. Samimi ama kurumsal bir ton kullan.
    5. Adayın yeteneklerine atıfta bulunarak neden ilgilendiğini belirt (örneğin: "${skills[0]} konusundaki tecrübeniz dikkatimizi çekti").

    Sadece JSON formatında yanıt ver.`;

    const model = getModel();
    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json|```/gi, '').trim();
        return JSON.parse(text);
    } catch (e) {
        console.error("DM Generation Error:", e);
        return {
            subject: purpose === 'interview' ? 'Görüşme Talebi' : 'Başvurunuz Hakkında',
            body: `Merhabalar ${name},\n\nProfilinizi inceledik ve oldukça etkileyici bulduk.\n\n[Takvim Linkiniz]\n\nİyi günler.`
        };
    }
}

export async function analyzeResponseEmail(emailText) {
    const prompt = `E-postayı analiz et: ${emailText} JSON: { "sentiment": "...", "decision": "...", "summary": "..." }`;
    const model = await getModel();
    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        return JSON.parse(text.replace(/```json|```/gi, '').trim());
    } catch (e) {
        return { sentiment: 'Belirsiz', summary: 'Manuel kontrol lazım.' };
    }
}
