// src/services/ai/interview.js
import { getModel } from './config.js';

export async function generateInterviewQuestions(candidate, starAnalysis, interviewType = 'technical') {
    const persona = interviewType === 'product' ? 'Product Manager' : (interviewType === 'culture' ? 'HR Director' : 'Technical Lead');
    const prompt = `Sen kıdemli bir ${persona}sın. Aday ${candidate?.name} için mülakat soruları hazırla.
    CV: ${JSON.stringify(candidate)}
    STAR Analizi: ${JSON.stringify(starAnalysis)}
    JSON array olarak dön ["soru1", "soru2", "soru3"]`;

    const model = getModel();
    const result = await model.generateContent(prompt);
    try {
        const clean = result.response.text().replace(/```json|```/gi, '').trim();
        return JSON.parse(clean);
    } catch (e) {
        return ["Deneyimlerinizi anlatın.", "Teknik zorlukları nasıl aşarsınız?"];
    }
}

export async function generateInterviewPaths(candidate, interviewType = 'technical') {
    const prompt = `Aday ${candidate?.name} için 3 farklı mülakat rotası hazırla.
    JSON formatında: { "paths": [{ "id": "p1", "title": "...", "description": "...", "questions": [...] }] }`;

    const model = getModel();
    const result = await model.generateContent(prompt);
    try {
        const parsed = JSON.parse(result.response.text().replace(/```json|```/gi, '').trim());
        return parsed.paths || parsed;
    } catch (e) {
        return [{ id: 'default', title: 'Genel Değerlendirme', questions: [] }];
    }
}

export async function scoreInterviewSession(candidate, interviewType, questionsAndAnswers) {
    const prompt = `Mülakatı değerlendir: Candidate: ${candidate?.name}, QA: ${JSON.stringify(questionsAndAnswers)}
    JSON: { "overallScore": 0, "summary": "...", "strengths": [], "weaknesses": [] }`;
    const model = getModel();
    const result = await model.generateContent(prompt);
    try {
        return JSON.parse(result.response.text().replace(/```json|```/gi, '').trim());
    } catch (e) {
        return { overallScore: 50, summary: 'Hata' };
    }
}

export async function generateFollowUpQuestion(candidate, interviewType, conversationHistory, mode = 'deepen') {
    const prompt = `Aday ${candidate?.name} için takip sorusu sor: ${JSON.stringify(conversationHistory)}
    JSON: { "question": "..." }`;
    const model = getModel();
    const result = await model.generateContent(prompt);
    try {
        return JSON.parse(result.response.text().replace(/```json|```/gi, '').trim());
    } catch (e) {
        return { question: "Biraz daha detaylandırır mısın?" };
    }
}
