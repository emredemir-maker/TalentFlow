// src/services/ai/communication.js
import { getModel } from './config.js';

export async function generatePersonalizedDM(name, skills, position, company, purpose = 'interview', type = 'initial') {
    const prompt = `Aday ${name} için ${position} pozisyonuna özel DM mesajı yaz. JSON: { "subject": "...", "body": "..." }`;
    const model = await getModel();
    try {
        const result = await model.generateContent(prompt);
        return JSON.parse(result.response.text().replace(/```json|```/gi, '').trim());
    } catch (e) {
        return { subject: 'Başvurunuz', body: '...' };
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
