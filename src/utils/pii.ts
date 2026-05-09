/**
 * PII masking utilities for Talent-Inn.
 *
 * Rules:
 *  - `department_user` role → masked output
 *  - `recruiter` / `super_admin` / `admin` → full data
 *
 * Phase 4e — first TypeScript module. Migrated from pii.js to validate
 * the incremental TS migration toolchain end-to-end. Behavior is
 * preserved bit-for-bit (the existing 35 vitest tests pass unchanged);
 * the only new constraints are compile-time argument types.
 */

// ── Comprehensive list of PII field names to strip from candidate objects ──
const PII_OBJECT_FIELDS = [
    'name',
    'email',
    'phone',
    'mobile',
    'tel',
    'address',
    'city',
    'country',
    'nationality',
    'photo',
    'photoURL',
    'avatar',
    'image',
    'picture',
    'linkedin',
    'linkedIn',
    'linkedinUrl',
    'github',
    'website',
    'social',
    'socialLinks',
    'portfolio',
    'portfolioUrl',
    'url',
    'dateOfBirth',
    'birthDate',
    'age',
    'gender',
    'sex',
    'maritalStatus',
    'religion',
    'ethnicity',
    'race',
    'id',
    'uid',
    'cvUrl',
    'color',
    'interviewSessions',
    'createdAt',
    'updatedAt',
    'addedAt',
    'invitedAt',
] as const;

// Free-text fields on candidate objects that may contain embedded PII patterns
const FREE_TEXT_FIELDS = [
    'summary',
    'cvData',
    'cvText',
    'description',
    'about',
    'responsibilities',
    'notes',
    'hrComments',
] as const;

/**
 * User roles recognized by the auth layer. Anything outside this union
 * is treated as a non-privileged caller (no special behavior here, but
 * shouldMaskPii narrows on it).
 */
export type UserRole = 'department_user' | 'recruiter' | 'super_admin' | 'admin';

/**
 * Shape of contact PII the extractor recognizes in raw CV/profile text.
 */
export interface ExtractedPii {
    name: string | null;
    email: string | null;
    phone: string | null;
    linkedinUrl: string | null;
}

/**
 * Returns true when the given role should see masked PII.
 */
export function shouldMaskPii(role: string | null | undefined): boolean {
    return role === 'department_user';
}

/**
 * Masks an email address.
 * e.g. "john.doe@example.com" → "jo***@***.com"
 */
export function maskEmail(email: unknown): string {
    if (!email || typeof email !== 'string') return '***@***.***';
    const [local, domain] = email.split('@');
    if (!domain) return email.slice(0, 2) + '***';
    const domainParts = domain.split('.');
    const tld = domainParts.pop();
    const maskedLocal = local.slice(0, 2) + '***';
    const maskedDomain = '***';
    return `${maskedLocal}@${maskedDomain}.${tld}`;
}

/**
 * Masks a phone number, keeping only the last 2 digits visible.
 * e.g. "+90 555 123 4567" → "+** *** *** **67"
 */
export function maskPhone(phone: unknown): string {
    if (!phone || typeof phone !== 'string') return '***';
    const digits = phone.replace(/\D/g, '');
    const visible = digits.slice(-2);
    const masked = digits.slice(0, -2).replace(/\d/g, '*');
    return `+${masked}${visible}`;
}

/**
 * Masks a full name (keeps first name initial + last name initial).
 * e.g. "John Doe Smith" → "J. D. S."
 */
export function maskName(name: unknown): string {
    if (!name || typeof name !== 'string') return '***';
    const parts = name.trim().split(/\s+/);
    return parts.map((p) => p.charAt(0).toUpperCase() + '.').join(' ');
}

// Generic candidate object — the codebase has many shapes; treat as a
// loose record so callers can pass partial / full objects from
// Firestore, AI parsing, browser-extension scrape, etc.
type CandidateLike = Record<string, unknown>;

/**
 * Centralized PII stripper for candidate objects sent to any external AI.
 * 1. Removes all PII-carrying structured fields (name, email, phone, …).
 * 2. Applies text-level redaction on all free-text fields so embedded
 *    email addresses, phone numbers, or URLs in narrative text are replaced
 *    with safe placeholder tokens.
 */
export function stripPiiForAI(candidateData: unknown): Record<string, unknown> {
    if (!candidateData || typeof candidateData !== 'object') return {};
    const safe: Record<string, unknown> = { ...(candidateData as CandidateLike) };
    for (const field of PII_OBJECT_FIELDS) {
        delete safe[field];
    }
    // Redact PII patterns embedded in every free-text field
    for (const field of FREE_TEXT_FIELDS) {
        const value = safe[field];
        if (value && typeof value === 'string') {
            safe[field] = redactPiiFromText(value);
        }
    }
    return safe;
}

/**
 * Attempts to extract the candidate's full name from the CV header line.
 * Heuristic: the first non-empty line that consists of 2–4 title-cased words
 * is treated as the name.
 */
export function extractNameFromText(text: unknown): string | null {
    if (!text || typeof text !== 'string') return null;
    const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
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
 */
export function extractPiiFromText(text: unknown): ExtractedPii {
    if (!text || typeof text !== 'string')
        return { name: null, email: null, phone: null, linkedinUrl: null };
    const emailMatch = text.match(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/);
    const phoneMatch = text.match(/(?:\+?\d[\d\s\-().]{6,}\d)/);
    const linkedinMatch = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w\-]+/i);
    return {
        name: extractNameFromText(text),
        email: emailMatch?.[0] || null,
        phone: phoneMatch?.[0]?.trim() || null,
        linkedinUrl: linkedinMatch
            ? linkedinMatch[0].startsWith('http')
                ? linkedinMatch[0]
                : `https://www.${linkedinMatch[0]}`
            : null,
    };
}

/**
 * Redacts PII patterns from raw text before sending to any external AI model.
 * Replaces:
 *  - Email addresses          → [E-POSTA]
 *  - Phone numbers            → [TELEFON]
 *  - LinkedIn profile URLs    → [LINKEDIN]
 *  - GitHub profile URLs      → [GITHUB]
 *  - Known name (if provided) → [İSİM]  (exact match on each name part and full name)
 *
 * NOTE: The previous version used a generic title-cased word regex to redact
 * "any name-like string". This was removed because JavaScript's \b word boundary
 * is ASCII-only — it fires mid-word between ASCII chars (e.g. "r") and
 * Turkish suffix chars (e.g. "ü"), causing job titles like "Müdür" → "[İSİM]ü"
 * and "Direktörü" → "[İSİM]ü". The specific known-name match is sufficient.
 */
export function redactPiiFromText<T extends string | null | undefined>(
    text: T,
    knownName: string | null = null
): T {
    if (!text || typeof text !== 'string') return text;
    let result = text
        .replace(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, '[E-POSTA]')
        .replace(/(?:\+?\d[\d\s\-().]{6,}\d)/g, '[TELEFON]')
        .replace(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w\-]+/gi, '[LINKEDIN]')
        .replace(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w\-]+/gi, '[GITHUB]');
    // Redact each word of the known name individually (handles partial appearances
    // like first-name-only) then the full name, using case-insensitive matching.
    if (knownName && knownName.trim()) {
        const parts = knownName
            .trim()
            .split(/\s+/)
            .filter((p) => p.length > 2);
        for (const part of parts) {
            const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            result = result.replace(new RegExp(escaped, 'gi'), '[İSİM]');
        }
        // Full name exact match as a safety net
        const escapedFull = knownName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(escapedFull, 'gi'), '[İSİM]');
    }
    return result as T;
}

/**
 * Returns a candidate object with PII fields masked for display.
 * Non-PII fields are returned as-is.
 */
export function applyPiiMask<T extends CandidateLike | null | undefined>(
    candidate: T,
    role: string | null | undefined
): T {
    if (!shouldMaskPii(role) || !candidate) return candidate;
    const c = candidate as CandidateLike;
    // Cast through unknown — T is a caller-provided subtype of
    // CandidateLike, so TS can't statically prove that the masked shape
    // is assignable. The intent is "mask the known PII keys, leave the
    // rest". Behavior matches the pre-TS .js implementation 1:1.
    const masked = {
        ...c,
        name: maskName(c.name),
        email: maskEmail(c.email),
        phone: c.phone ? maskPhone(c.phone) : c.phone,
        address: c.address ? '***' : c.address,
        linkedinUrl: c.linkedinUrl ? '***' : c.linkedinUrl,
        linkedIn: c.linkedIn ? '***' : c.linkedIn,
        linkedin: c.linkedin ? '***' : c.linkedin,
        portfolioUrl: c.portfolioUrl ? '***' : c.portfolioUrl,
    };
    return masked as unknown as T;
}
