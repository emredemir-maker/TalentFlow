// src/services/ai/config.js
import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const DEFAULT_MODEL = 'gemini-2.0-flash';

let genAI = null;

/**
 * Initializes and returns a Gemini model with deterministic settings.
 */
export function getModel(modelId = DEFAULT_MODEL) {
    if (!API_KEY) {
        throw new Error('Gemini API anahtarı bulunamadı (VITE_GEMINI_API_KEY).');
    }

    if (!genAI) {
        genAI = new GoogleGenerativeAI(API_KEY);
    }

    return genAI.getGenerativeModel({
        model: modelId,
        generationConfig: {
            temperature: 0,
            topP: 0,
            topK: 1,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
        },
    });
}
