// src/services/ai/utils.js

/**
 * Robustly cleans and parses JSON from AI responses.
 * Handles markdown code blocks and various formatting inconsistencies.
 */
export function parseAIJson(text, defaultValue = null) {
    if (!text) return defaultValue;

    try {
        // Remove markdown code blocks (```json ... ``` or ``` ... ```)
        const clean = text.replace(/```json|```/gi, '').trim();
        return JSON.parse(clean);
    } catch (e) {
        console.warn('AI JSON Parse Registry:', e.message, 'Raw text snippet:', text.substring(0, 100));

        // Fallback: Try regex extraction if standard parse fails
        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (innerE) {
            console.error('Critical AI JSON Parsing Failure');
        }

        return defaultValue;
    }
}

/**
 * Sanitizes input text to be used in AI prompts.
 * Prevents basic prompt injection by providing a clear boundary.
 */
export function sanitizeForPrompt(text, maxLength = 15000) {
    if (!text) return '';
    const truncated = text.toString().substring(0, maxLength);
    // Replace characters that might be used to break out of delimiters
    return truncated.replace(/#{2,}/g, '#');
}

/**
 * Creates a structured prompt with clear instruction vs data boundaries.
 */
export function buildStructuredPrompt(instruction, dataMap) {
    let prompt = `INSTRUCTION:\n${instruction}\n\n`;

    for (const [key, value] of Object.entries(dataMap)) {
        prompt += `### START ${key.toUpperCase()} ###\n${value}\n### END ${key.toUpperCase()} ###\n\n`;
    }

    prompt += "FINAL INSTRUCTION: Provide ONLY the requested JSON output format.";
    return prompt;
}
