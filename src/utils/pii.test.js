// Tests for PII masking + scrubbing — Phase 4c.
//
// Security-sensitive code: an undercaught regression here means candidate
// PII can leak into AI prompts (which become Gemini training data), or to
// department_user accounts that should not see real contact info.
import { describe, expect, it } from 'vitest';

import {
    applyPiiMask,
    extractNameFromText,
    extractPiiFromText,
    maskEmail,
    maskName,
    maskPhone,
    redactPiiFromText,
    shouldMaskPii,
    stripPiiForAI,
} from './pii.js';

describe('shouldMaskPii', () => {
    it('returns true only for department_user', () => {
        expect(shouldMaskPii('department_user')).toBe(true);
        expect(shouldMaskPii('recruiter')).toBe(false);
        expect(shouldMaskPii('admin')).toBe(false);
        expect(shouldMaskPii('super_admin')).toBe(false);
        expect(shouldMaskPii(undefined)).toBe(false);
        expect(shouldMaskPii(null)).toBe(false);
        expect(shouldMaskPii('')).toBe(false);
    });
});

describe('maskEmail', () => {
    it('preserves first 2 chars and the TLD, hides everything else', () => {
        expect(maskEmail('john.doe@example.com')).toBe('jo***@***.com');
    });

    it('handles short locals', () => {
        expect(maskEmail('a@b.io')).toBe('a***@***.io');
    });

    it('handles emails without a TLD-shape', () => {
        // No '@' → fallback to first-2 + ***
        expect(maskEmail('not-an-email')).toBe('no***');
    });

    it('returns ***@***.*** for empty/non-string input', () => {
        expect(maskEmail('')).toBe('***@***.***');
        expect(maskEmail(null)).toBe('***@***.***');
        expect(maskEmail(undefined)).toBe('***@***.***');
        expect(maskEmail(12345)).toBe('***@***.***');
    });
});

describe('maskPhone', () => {
    it('keeps last 2 digits, masks everything before', () => {
        // '+90 555 123 4567' → digits '905551234567' (12 chars) → '+' + 10 stars + '67'
        expect(maskPhone('+90 555 123 4567')).toBe('+**********67');
    });

    it('strips non-digits before processing', () => {
        // '555-123-4567' → digits '5551234567' (10) → '+' + 8 stars + '67'
        expect(maskPhone('555-123-4567')).toBe('+********67');
    });

    it('returns *** for falsy or non-string input', () => {
        expect(maskPhone('')).toBe('***');
        expect(maskPhone(null)).toBe('***');
        expect(maskPhone(undefined)).toBe('***');
    });
});

describe('maskName', () => {
    it('reduces each name part to its first letter + dot', () => {
        expect(maskName('John Doe')).toBe('J. D.');
        expect(maskName('Ada Lovelace Byron')).toBe('A. L. B.');
    });

    it('uppercases the initial', () => {
        expect(maskName('jane smith')).toBe('J. S.');
    });

    it('handles single-name input', () => {
        expect(maskName('Cher')).toBe('C.');
    });

    it('returns *** for falsy', () => {
        expect(maskName('')).toBe('***');
        expect(maskName(null)).toBe('***');
        expect(maskName(undefined)).toBe('***');
    });
});

describe('redactPiiFromText', () => {
    it('replaces email addresses with [E-POSTA]', () => {
        const out = redactPiiFromText('Contact me at john.doe@example.com today');
        expect(out).toBe('Contact me at [E-POSTA] today');
    });

    it('replaces phone numbers with [TELEFON]', () => {
        const out = redactPiiFromText('Phone: +90 555 123 4567');
        expect(out).toContain('[TELEFON]');
        expect(out).not.toContain('555');
    });

    it('replaces LinkedIn URLs with [LINKEDIN] (with or without scheme)', () => {
        expect(redactPiiFromText('https://linkedin.com/in/johndoe')).toBe('[LINKEDIN]');
        expect(redactPiiFromText('linkedin.com/in/janedoe')).toBe('[LINKEDIN]');
        expect(redactPiiFromText('www.linkedin.com/in/foo-bar')).toBe('[LINKEDIN]');
    });

    it('replaces GitHub URLs with [GITHUB]', () => {
        expect(redactPiiFromText('github.com/torvalds')).toBe('[GITHUB]');
    });

    it('does NOT redact Turkish job titles (no generic title-case match)', () => {
        // This is the bug the previous version had — \b word boundary fires
        // between ASCII and Turkish chars, so generic name-shaped regexes
        // mangle words like "Müdür". Confirm we kept the fix.
        const out = redactPiiFromText('Genel Müdür ve Direktörü');
        expect(out).toBe('Genel Müdür ve Direktörü');
    });

    it('redacts a known name (case-insensitive, all parts)', () => {
        const out = redactPiiFromText('Ada was here. Ada Lovelace too.', 'Ada Lovelace');
        // Both 'Ada' (first part) and 'Lovelace' (second part) should be replaced
        expect(out).toContain('[İSİM]');
        expect(out).not.toContain('Ada');
        expect(out).not.toContain('Lovelace');
    });

    it('skips short name parts to avoid over-redacting common words', () => {
        // Parts <= 2 chars are filtered (length > 2 check) — "B." is too short
        const out = redactPiiFromText('Bo Burnham talked to Bo today.', 'Bo B.');
        // "Bo" should NOT be replaced (too short, would clobber prepositions
        // and other common bigrams across the codebase). Full-name match also
        // doesn't fire since "Bo B." isn't a substring of the input.
        expect(out).toBe('Bo Burnham talked to Bo today.');
    });

    it('handles empty/non-string input gracefully', () => {
        expect(redactPiiFromText('')).toBe('');
        expect(redactPiiFromText(null)).toBe(null);
        expect(redactPiiFromText(undefined)).toBe(undefined);
    });
});

describe('extractPiiFromText', () => {
    it('extracts email, phone, and LinkedIn URL from CV-shaped text', () => {
        const text = `Ada Lovelace
            ada@example.com
            +90 555 123 4567
            https://linkedin.com/in/ada-lovelace`;
        const out = extractPiiFromText(text);
        expect(out.email).toBe('ada@example.com');
        expect(out.phone).toContain('555');
        expect(out.linkedinUrl).toBe('https://linkedin.com/in/ada-lovelace');
    });

    it('prepends https://www. when LinkedIn URL has no scheme', () => {
        const out = extractPiiFromText('linkedin.com/in/foo');
        expect(out.linkedinUrl).toBe('https://www.linkedin.com/in/foo');
    });

    it('returns null for missing fields rather than throwing', () => {
        const out = extractPiiFromText('just some plain text without contacts');
        expect(out.email).toBeNull();
        expect(out.linkedinUrl).toBeNull();
    });

    it('returns the all-null shape on falsy input', () => {
        expect(extractPiiFromText('')).toEqual({
            name: null,
            email: null,
            phone: null,
            linkedinUrl: null,
        });
    });
});

describe('extractNameFromText', () => {
    it('finds a 2-4 word title-cased name in the first 5 lines', () => {
        const cv = `\n\nAda Lovelace\nMatematikçi\nBaşka satır\n`;
        expect(extractNameFromText(cv)).toBe('Ada Lovelace');
    });

    it('skips lines that are not name-shaped', () => {
        const cv = `email@example.com\n+90 555 1234 5678\nMühendis\nAda Lovelace\n`;
        expect(extractNameFromText(cv)).toBe('Ada Lovelace');
    });

    it('returns null when no name-shaped line is present in the first 5', () => {
        const cv = 'phone: 555-1234\nemail: x@y.com\n';
        expect(extractNameFromText(cv)).toBeNull();
    });

    it('handles Turkish-cased characters', () => {
        // Capital Ş and ü/ş in the test
        expect(extractNameFromText('Şener Ünal')).toBe('Şener Ünal');
    });
});

describe('stripPiiForAI', () => {
    it('removes all PII structured fields', () => {
        const input = {
            name: 'Ada',
            email: 'ada@x.com',
            phone: '555',
            address: 'Somewhere',
            id: 'abc',
            // these should be kept
            position: 'Engineer',
            skills: ['python', 'rust'],
            experience: 5,
        };
        const out = stripPiiForAI(input);
        expect(out.name).toBeUndefined();
        expect(out.email).toBeUndefined();
        expect(out.phone).toBeUndefined();
        expect(out.address).toBeUndefined();
        expect(out.id).toBeUndefined();
        expect(out.position).toBe('Engineer');
        expect(out.skills).toEqual(['python', 'rust']);
        expect(out.experience).toBe(5);
    });

    it('redacts free-text fields (summary, cvText, etc.) for embedded PII', () => {
        const out = stripPiiForAI({
            position: 'Engineer',
            summary: 'Reach me at ada@x.com or +90 555 1234567 — also linkedin.com/in/ada',
        });
        expect(out.summary).not.toContain('ada@x.com');
        expect(out.summary).toContain('[E-POSTA]');
        expect(out.summary).toContain('[TELEFON]');
        expect(out.summary).toContain('[LINKEDIN]');
    });

    it('returns {} for non-object input', () => {
        expect(stripPiiForAI(null)).toEqual({});
        expect(stripPiiForAI(undefined)).toEqual({});
        expect(stripPiiForAI('string')).toEqual({});
    });
});

describe('applyPiiMask', () => {
    const candidate = {
        id: 'abc',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '+90 555 123 4567',
        address: 'London',
        linkedinUrl: 'https://linkedin.com/in/ada',
        portfolioUrl: 'https://example.com',
        position: 'Engineer',
        skills: ['python'],
    };

    it('returns the candidate untouched for non-masked roles', () => {
        expect(applyPiiMask(candidate, 'recruiter')).toBe(candidate);
        expect(applyPiiMask(candidate, 'super_admin')).toBe(candidate);
        expect(applyPiiMask(candidate, undefined)).toBe(candidate);
    });

    it('masks PII fields for department_user role', () => {
        const masked = applyPiiMask(candidate, 'department_user');
        expect(masked.name).toBe('A. L.');
        expect(masked.email).toBe('ad***@***.com');
        expect(masked.phone).not.toContain('1234');
        expect(masked.address).toBe('***');
        expect(masked.linkedinUrl).toBe('***');
        expect(masked.portfolioUrl).toBe('***');
    });

    it('preserves non-PII fields when masking', () => {
        const masked = applyPiiMask(candidate, 'department_user');
        expect(masked.id).toBe('abc'); // not masked
        expect(masked.position).toBe('Engineer');
        expect(masked.skills).toEqual(['python']);
    });

    it('returns the input as-is when candidate is falsy', () => {
        expect(applyPiiMask(null, 'department_user')).toBe(null);
        expect(applyPiiMask(undefined, 'department_user')).toBe(undefined);
    });
});
