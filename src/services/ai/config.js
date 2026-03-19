import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../../config/firebase';
import { doc, getDoc } from 'firebase/firestore';

const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash'; // High speed Flash 2.0
const DEFAULT_CLAUDE_MODEL = 'claude-3-7-sonnet-latest';
let genAI = null;
let currentApiKey = null;

export async function getGlobalGeminiKey() {
    try {
        // Primary: SuperAdmin saves to settings/api_keys → gemini field
        const apiKeysRef = doc(db, 'artifacts/talent-flow/public/data/settings', 'api_keys');
        const apiKeysSnap = await getDoc(apiKeysRef);
        if (apiKeysSnap.exists() && apiKeysSnap.data().gemini) {
            return apiKeysSnap.data().gemini;
        }
        // Legacy fallback: settings/system → geminiApiKey
        const systemRef = doc(db, 'artifacts/talent-flow/public/data/settings', 'system');
        const systemSnap = await getDoc(systemRef);
        if (systemSnap.exists() && systemSnap.data().geminiApiKey) {
            return systemSnap.data().geminiApiKey;
        }
    } catch (e) {
        console.warn("Global API Key fetching error:", e);
    }
    return import.meta.env.VITE_GEMINI_API_KEY || '';
}

/**
 * Initializes and returns a Gemini model with deterministic settings.
 */
export async function getModel(modelId = DEFAULT_GEMINI_MODEL) {
    const apiKey = await getGlobalGeminiKey();
    if (!apiKey) {
        throw new Error('Gemini API anahtarı bulunamadı. Lütfen Sistem Ayarları üzerinden anahtarınızı ekleyin.');
    }

    if (!genAI || currentApiKey !== apiKey) {
        currentApiKey = apiKey;
        genAI = new GoogleGenerativeAI(apiKey);
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
