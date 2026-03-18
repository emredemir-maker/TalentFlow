// src/services/ai/gemini-logic.js
import { getModel } from './config';
import { parseAIJson, buildStructuredPrompt } from './utils';

/**
 * STAR Logic Checker using Gemini 2.0 Flash.
 * Validates the transcript for Situation, Task, Action, and Result coverage.
 */
export async function checkStarLogicGemini(transcript, context) {
    const instruction = `Aşağıdaki mülakat transcript parçasını STAR (Situation, Task, Action, Result) metodolojisine göre analiz et.
    
    Transcript: "${transcript}"
    
    GÖREV:
    1. Her bir STAR bileşeninin (S, T, A, R) bu parçada ne kadar kapsandığını 0-100 arası puanla.
    2. Eğer bir bileşen eksikse (puan < 40), mülakatçıya o alanı sorması için kısa bir tavsiye ver.
    
    JSON formatında tam olarak şu yapıda dön:
    {
        "scores": { "S": 85, "T": 70, "A": 90, "R": 20 },
        "missingComponents": ["Result"],
        "feedback": "Aday durumu ve aksiyonları çok iyi anlattı ancak sonucu (Result) henüz belirtmedi.",
        "suggestedFollowUp": "Bu projenin sonunda somut olarak ne değişti veya ne gibi bir başarı elde ettiniz?"
    }`;

    try {
        const model = await getModel('gemini-2.0-flash');
        const result = await model.generateContent(instruction);
        return parseAIJson(result.response.text(), {
            scores: { S: 50, T: 50, A: 50, R: 50 },
            feedback: 'Analiz yapılamadı.',
            suggestedFollowUp: 'Biraz daha detay alabilir miyiz?'
        });
    } catch (error) {
        console.error("Gemini STAR check error:", error);
        return {
            scores: { S: 50, T: 50, A: 50, R: 50 },
            feedback: 'Hata oluştu.',
            suggestedFollowUp: 'Devam edebilirsiniz.'
        };
    }
}

/**
 * PRO MODE: Multimodal Audio Logic Checker
 * Sends raw audio to Gemini 2.0 for higher accuracy transcription + STAR analysis.
 */
export async function checkAudioLogicGemini(audioBase64, mimeType = 'audio/webm', context) {
    const instruction = `
    GÖREV: Sana gönderilen ses dosyasını dinle ve şunları yap:
    1. Konuşulanları HARFİYEN (verbatim) yazıya dök (transcript).
    2. Bu konuşmayı STAR (Situation, Task, Action, Result) metoduna göre analiz et.
    3. Her bir bileşen (S, T, A, R) için 0-100 arası skor ver.
    4. Mülakatçıya (kullanıcıya) taktiksel öneri (feedback) ve takip eden soru (suggestedFollowUp) hazırla.
    
    ÇIKTI FORMATI (JSON):
    {
        "transcript": "Konuşulanların tam metni...",
        "scores": { "S": 80, "T": 60, "A": 90, "R": 0 },
        "feedback": "Kullanıcıya kısa teknik geri bildirim...",
        "suggestedFollowUp": "Sorması gereken bir sonraki soru..."
    }`;

    try {
        const model = await getModel('gemini-2.0-flash');
        const parts = [
            { text: instruction },
            {
                inlineData: {
                    mimeType: mimeType,
                    data: audioBase64
                }
            }
        ];

        const result = await model.generateContent(parts);
        const text = result.response.text();

        return parseAIJson(text, {
            transcript: '',
            scores: { S: 0, T: 0, A: 0, R: 0 },
            feedback: 'Ses analizi yapılamadı.',
            suggestedFollowUp: ''
        });
    } catch (error) {
        console.error("Gemini Audio Analysis Error:", error);
        return null;
    }
}
