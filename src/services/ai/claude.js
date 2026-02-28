// src/services/ai/claude.js
import { db } from '../../config/firebase';
import { doc, getDoc } from 'firebase/firestore';

/**
 * Fetches the Anthropic API Key from Firestore.
 */
export async function getClaudeKey() {
    try {
        const docRef = doc(db, 'artifacts/talent-flow/public/data/settings', 'system');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().claudeApiKey) {
            return docSnap.data().claudeApiKey;
        }
    } catch (e) {
        console.warn("Claude API Key fetching error:", e);
    }
    return import.meta.env.VITE_CLAUDE_API_KEY || '';
}

/**
 * STAR Logic Checker using Claude 3.7.
 * Validates the transcript for Situation, Task, Action, and Result coverage.
 */
export async function checkStarLogic(transcript, context) {
    const apiKey = await getClaudeKey();
    if (!apiKey) {
        return {
            isValid: false,
            message: 'Claude API Key missing.',
            scores: { S: 0, T: 0, A: 0, R: 0 }
        };
    }

    const prompt = `En son Claude 3.7 modelisin. Aşağıdaki mülakat cevabını STAR (Situation, Task, Action, Result) metodolojisine göre analiz et.
    
    Transcript: "${transcript}"
    Context: ${JSON.stringify(context || {})}
    
    Cevapta her bir STAR bileşeninin (S, T, A, R) varlığını ve derinliğini 0-100 arası puanla.
    Eğer bir bileşen eksikse, mülakatçıya o alanı sorması için bir tavsiye ver.
    
    JSON formatında tam olarak şu yapıda dön:
    {
        "scores": { "S": 85, "T": 70, "A": 90, "R": 40 },
        "missingComponents": ["Result"],
        "feedback": "Aday durumu ve aksiyonları çok iyi anlattı ancak sonucun işe etkisini (Result) tam açıklamadı.",
        "suggestedFollowUp": "Sonuçta elde ettiğiniz başarıyı sayısal verilerle veya somut çıktılarla detaylandırır mısın?"
    }`;

    try {
        // Note: For now, we simulate the fetch or use a fetch call to Claude API directly if SDK is not yet available globally.
        // In a real environment, we'd use @anthropic-ai/sdk.
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: 'claude-3-7-sonnet-latest',
                max_tokens: 1024,
                messages: [{ role: 'user', content: prompt }],
                response_format: { type: 'json_object' }
            })
        });

        const data = await response.json();
        const content = data.content[0].text;
        return JSON.parse(content);
    } catch (error) {
        console.error("Claude STAR check error:", error);
        return {
            scores: { S: 50, T: 50, A: 50, R: 50 },
            feedback: 'Analiz sırasında bir hata oluştu.',
            suggestedFollowUp: 'Biraz daha detay alabilir miyiz?'
        };
    }
}
