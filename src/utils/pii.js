/**
 * PII masking utilities for Talent-Inn.
 *
 * Rules:
 *  - `department_user` role → masked output
 *  - `recruiter` / `super_admin` / `admin` → full data
 *
 * Usage:
 *   import { maskEmail, maskPhone, stripPiiForAI } from '../utils/pii';
 */

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
 * e.g. "John Doe Smith" → "J. D."
 * @param {string|undefined} name
 * @returns {string}
 */
export function maskName(name) {
    if (!name || typeof name !== 'string') return '***';
    const parts = name.trim().split(/\s+/);
    return parts.map(p => p.charAt(0).toUpperCase() + '.').join(' ');
}

/**
 * Strips PII fields before sending a candidate profile to AI (Gemini).
 * Removes: name, email, phone, address, socialLinks, linkedinUrl, portfolioUrl.
 * @param {object} candidateData
 * @returns {object} sanitized copy safe to send to AI
 */
export function stripPiiForAI(candidateData) {
    if (!candidateData || typeof candidateData !== 'object') return {};
    const {
        name, email, phone, address,
        socialLinks, linkedinUrl, portfolioUrl,
        linkedIn, linkedin,
        ...safe
    } = candidateData;
    return safe;
}

/**
 * Returns a candidate object with PII fields masked.
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
