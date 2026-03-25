// src/services/ai/utils.js

/**
 * Escapes raw control characters (newlines, tabs, etc.) that appear inside
 * JSON string values. AI models sometimes emit literal \n inside strings
 * instead of the escaped form, making JSON.parse fail with
 * "Bad control character in string literal".
 */
function sanitizeControlChars(text) {
    let inString = false;
    let escaped = false;
    let result = '';

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const code = text.charCodeAt(i);

        if (escaped) {
            result += char;
            escaped = false;
            continue;
        }

        if (char === '\\' && inString) {
            escaped = true;
            result += char;
            continue;
        }

        if (char === '"') {
            inString = !inString;
            result += char;
            continue;
        }

        if (inString && code < 0x20) {
            switch (char) {
                case '\n': result += '\\n'; break;
                case '\r': result += '\\r'; break;
                case '\t': result += '\\t'; break;
                default:   result += '\\u' + code.toString(16).padStart(4, '0');
            }
            continue;
        }

        result += char;
    }

    return result;
}

/**
 * Robustly cleans and parses JSON from AI responses.
 * Handles markdown code blocks, control characters, and various
 * formatting inconsistencies.
 */
export function parseAIJson(text, defaultValue = null) {
    if (!text) return defaultValue;

    const strip = (raw) => raw.replace(/```json|```/gi, '').trim();

    // Attempt 1: strip markdown, parse directly
    try {
        return JSON.parse(strip(text));
    } catch (_) {}

    // Attempt 2: sanitize control characters, then parse
    try {
        return JSON.parse(sanitizeControlChars(strip(text)));
    } catch (e) {
        console.warn('AI JSON Parse Registry:', e.message, 'Raw text snippet:', text.substring(0, 100));
    }

    // Attempt 3: extract first {...} block, sanitize, parse
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(sanitizeControlChars(jsonMatch[0]));
        }
    } catch (innerE) {
        console.error('Critical AI JSON Parsing Failure');
    }

    return defaultValue;
}

/**
 * Sanitizes input text to be used in AI prompts.
 * Prevents basic prompt injection by providing a clear boundary.
 */
export function sanitizeForPrompt(text, maxLength = 15000) {
    if (!text) return '';
    const truncated = text.toString().substring(0, maxLength);
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
