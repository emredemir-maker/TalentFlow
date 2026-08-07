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
 * Kaçışsız çift tırnakları onarır.
 *
 * Model bir dizi DEĞERİNİN içinde ham `"` yazdığında JSON kırılır ve
 * sanitizeControlChars bunu kurtaramaz: o fonksiyon her `"` karakterini
 * dizi aç/kapa sayar, dolayısıyla kaçışsız bir tırnak durumu ters çevirip
 * yanıtın geri kalanını da bozar.
 *
 * Sezgi: dizi içindeyken bir `"` görürsek ileriye bakarız. Sonraki
 * boşluksuz karakter `,` `:` `}` `]` ya da metin sonuysa bu GERÇEK bir
 * kapanış tırnağıdır; değilse metnin içinde kalmış bir tırnaktır ve
 * kaçırılır.
 *
 * SINIR: `"o dedi ki: "tamam", sonra gitti"` gibi, içteki tırnağın hemen
 * ardından virgül gelen durumda sezgi yanılır ve orayı kapanış sayar. Tam
 * doğru çözüm değildir; son çare olarak, tamamen başarısız olmaktansa
 * kurtarma denemesidir. Bu yüzden parseAIJson'da EN SON denenir.
 */
export function repairUnescapedQuotes(text) {
    const CLOSERS = new Set([',', ':', '}', ']']);
    let inString = false;
    let escaped = false;
    let result = '';

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (escaped) {
            result += char;
            escaped = false;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            result += char;
            continue;
        }
        if (char === '"') {
            if (!inString) {
                inString = true;
                result += char;
                continue;
            }
            // Kapanış mı, metnin içinde kalmış tırnak mı?
            let j = i + 1;
            while (j < text.length && /\s/.test(text[j])) j++;
            if (j >= text.length || CLOSERS.has(text[j])) {
                inString = false;
                result += char;
            } else {
                result += '\\"';
            }
            continue;
        }
        result += char;
    }

    return result;
}

/**
 * JSON.parse hatasının GERÇEKTE nerede olduğunu gösterir.
 *
 * Yanıtın sonunu göstermek yetmiyordu: yanıt eksiksiz görünüp ortasındaki
 * tek bir karakter yüzünden kırılabiliyor. V8 hata mesajında konum verir;
 * o konumun etrafını kesip döndürmek teşhisi tek bakışta yapılır kılıyor.
 */
export function jsonFailureContext(text) {
    const raw = String(text || '');
    try {
        JSON.parse(raw);
        return null;
    } catch (err) {
        const message = err?.message || 'bilinmeyen ayrıştırma hatası';
        const match = /position (\d+)/i.exec(message);
        if (!match) return { message, snippet: raw.slice(-160), position: null };
        const pos = Number(match[1]);
        return {
            message,
            position: pos,
            snippet: raw.slice(Math.max(0, pos - 90), pos + 90),
        };
    }
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

    // Attempt 4 (son çare): metnin içinde kalmış kaçışsız tırnakları onar.
    // Sezgisel olduğu için EN SONA konuldu — yukarıdaki denemelerden biri
    // tutuyorsa buraya hiç gelinmez.
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const body = jsonMatch ? jsonMatch[0] : strip(text);
        return JSON.parse(repairUnescapedQuotes(sanitizeControlChars(body)));
    } catch {
        // Onarım da tutmadı — çağıran defaultValue ile ilerler
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
