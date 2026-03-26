/**
 * PII masking utilities for Talent-Inn.
 *
 * Rules:
 *  - `department_user` role → masked output
 *  - `recruiter` / `super_admin` / `admin` → full data
 *
 * Usage:
 *   import { maskEmail, maskPhone, stripPiiForAI, redactPiiFromText } from '../utils/pii';
 */

// ── Comprehensive list of PII field names to strip from candidate objects ──
const PII_OBJECT_FIELDS = [
    'name', 'email', 'phone', 'mobile', 'tel',
    'address', 'city', 'country', 'nationality',
    'photo', 'photoURL', 'avatar', 'image', 'picture',
    'linkedin', 'linkedIn', 'linkedinUrl', 'github', 'website',
    'social', 'socialLinks', 'portfolio', 'portfolioUrl', 'url',
    'dateOfBirth', 'birthDate', 'age', 'gender', 'sex',
    'maritalStatus', 'religion', 'ethnicity', 'race',
    'id', 'uid', 'cvUrl', 'color', 'interviewSessions',
    'createdAt', 'updatedAt', 'addedAt', 'invitedAt',
];

/**
 * Returns true when the given role should see masked PII.
 * @param {string|undefined} role
 */
export function shouldMaskPii(role) {
    return role === 'department_user';
}

/**
 * Masks an email address.
 * e.g. "john.doe@example.com" → "jo***@***.com"
 * @param {string|undefined} email
 * @returns {string}
 */
export function maskEmail(email) {
    if (!email || typeof email !== 'string') return '***@***.***';
    const [local, domain] = email.split('@');
    if (!domain) return email.slice(0, 2) + '***';
    const domainParts = domain.split('.');
    const tld = domainParts.pop();
    const maskedLocal  = local.slice(0, 2) + '***';
    const maskedDomain = '***';
    return `${maskedLocal}@${maskedDomain}.${tld}`;
}

/**
 * Masks a phone number, keeping only the last 2 digits visible.
 * e.g. "+90 555 123 4567" → "+** *** *** **67"
 * @param {string|undefined} phone
 * @returns {string}
 */
export function maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return '***';
    const digits = phone.replace(/\D/g, '');
    const visible = digits.slice(-2);
    const masked = digits.slice(0, -2).replace(/\d/g, '*');
    return `+${masked}${visible}`;
}

/**
 * Masks a full name (keeps first name initial + last name initial).
 * e.g. "John Doe Smith" → "J. D. S."
 * @param {string|undefined} name
 * @returns {string}
 */
export function maskName(name) {
    if (!name || typeof name !== 'string') return '***';
    const parts = name.trim().split(/\s+/);
    return parts.map(p => p.charAt(0).toUpperCase() + '.').join(' ');
}

// Free-text fields on candidate objects that may contain embedded PII patterns
const FREE_TEXT_FIELDS = [
    'summary', 'cvData', 'cvText', 'description', 'about',
    'responsibilities', 'notes', 'hrComments',
];

/**
 * Centralized PII stripper for candidate objects sent to any external AI.
 * 1. Removes all PII-carrying structured fields (name, email, phone, …).
 * 2. Applies text-level redaction on all free-text fields so embedded
 *    email addresses, phone numbers, or URLs in narrative text are replaced
 *    with safe placeholder tokens.
 * @param {object} candidateData
 * @returns {object} sanitized copy safe to send to AI
 */
export function stripPiiForAI(candidateData) {
    if (!candidateData || typeof candidateData !== 'object') return {};
    const safe = { ...candidateData };
    for (const field of PII_OBJECT_FIELDS) {
        delete safe[field];
    }
    // Redact PII patterns embedded in every free-text field
    for (const field of FREE_TEXT_FIELDS) {
        if (safe[field] && typeof safe[field] === 'string') {
            safe[field] = redactPiiFromText(safe[field]);
        }
    }
    return safe;
}

/**
 * Attempts to extract the candidate's full name from the CV header line.
 * Heuristic: the first non-empty line that consists of 2–4 title-cased words
 * is treated as the name.
 * @param {string} text
 * @returns {string|null}
 */
export function extractNameFromText(text) {
    if (!text || typeof text !== 'string') return null;
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines.slice(0, 5)) {
        if (/^[A-ZÇĞİÖŞÜ][a-zçğışöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğışöşü]+){1,3}$/.test(line)) {
            return line;
        }
    }
    return null;
}

/**
 * Extracts contact PII from raw CV/profile text using regex.
 * Used BEFORE redacting the text so the extracted values can be
 * merged back into the parsed candidate record after AI processing.
 * @param {string} text
 * @returns {{ name: string|null, email: string|null, phone: string|null, linkedinUrl: string|null }}
 */
export function extractPiiFromText(text) {
    if (!text || typeof text !== 'string') return { name: null, email: null, phone: null, linkedinUrl: null };
    const emailMatch = text.match(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/);
    const phoneMatch = text.match(/(?:\+?\d[\d\s\-().]{6,}\d)/);
    const linkedinMatch = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w\-]+/i);
    return {
        name: extractNameFromText(text),
        email: emailMatch?.[0] || null,
        phone: phoneMatch?.[0]?.trim() || null,
        linkedinUrl: linkedinMatch
            ? (linkedinMatch[0].startsWith('http') ? linkedinMatch[0] : `https://www.${linkedinMatch[0]}`)
            : null,
    };
}

// General Turkish/Latin full-name pattern (title-cased two-word sequences).
// Applied unconditionally so names are always redacted even without a known name.
const NAME_PATTERN = /\b(?:[A-ZÇĞİÖŞÜ][a-zçğışöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğışöşü]+){1,3})\b/g;

/**
 * Redacts PII patterns from raw text before sending to any external AI model.
 * Replaces:
 *  - Email addresses          → [E-POSTA]
 *  - Phone numbers            → [TELEFON]
 *  - LinkedIn profile URLs    → [LINKEDIN]
 *  - GitHub profile URLs      → [GITHUB]
 *  - Title-cased name strings → [İSİM]  (always, regardless of knownName)
 *  - Known name (if provided) → [İSİM]  (exact-match on top of pattern)
 * @param {string} text
 * @param {string|null} [knownName] - optional; exact occurrences also replaced
 * @returns {string}
 */
export function redactPiiFromText(text, knownName = null) {
    if (!text || typeof text !== 'string') return text;
    let result = text
        .replace(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, '[E-POSTA]')
        .replace(/(?:\+?\d[\d\s\-().]{6,}\d)/g, '[TELEFON]')
        .replace(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w\-]+/gi, '[LINKEDIN]')
        .replace(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w\-]+/gi, '[GITHUB]')
        .replace(NAME_PATTERN, '[İSİM]');
    // Also replace any exact occurrences of the supplied known name (handles
    // all-caps, atypical capitalizations that the pattern may miss).
    if (knownName) {
        const escaped = knownName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '[İSİM]');
    }
    return result;
}

/**
 * Returns a candidate object with PII fields masked for display.
 * Non-PII fields are returned as-is.
 * @param {object} candidate
 * @param {string|undefined} role  current user's role
 * @returns {object}
 */
export function applyPiiMask(candidate, role) {
    if (!shouldMaskPii(role) || !candidate) return candidate;
    return {
        ...candidate,
        name:  maskName(candidate.name),
        email: maskEmail(candidate.email),
        phone: candidate.phone ? maskPhone(candidate.phone) : candidate.phone,
        address: candidate.address ? '***' : candidate.address,
        linkedinUrl: candidate.linkedinUrl ? '***' : candidate.linkedinUrl,
        linkedIn:    candidate.linkedIn    ? '***' : candidate.linkedIn,
        linkedin:    candidate.linkedin    ? '***' : candidate.linkedin,
        portfolioUrl: candidate.portfolioUrl ? '***' : candidate.portfolioUrl,
    };
}
