// Tests for the interview routes' pure helpers.
//
// Scope: buildManualInterviewPrompt — the only pure exportable bit.
// The route handlers themselves are integration territory (Firestore +
// Gemini); covered by manual smoke for now.
import { describe, expect, it } from 'vitest';

import { buildManualInterviewPrompt } from './interview.js';

// Minimum-viable input shape — every other test reuses this with overrides
const baseInput = {
    positionTitle: 'Senior Backend Engineer',
    candidateName: 'Ada Lovelace',
    interviewType: 'phone',
    date: '2024-12-15',
    time: '14:30',
    questions: [
        { question: 'En zorlu sistem tasarımı projen neydi?', answer: 'Bir ödeme sistemi…' },
    ],
    transcript: '',
    notes: '',
};

describe('buildManualInterviewPrompt', () => {
    it('includes position, candidate name, type, and date in the header', () => {
        const prompt = buildManualInterviewPrompt(baseInput);
        expect(prompt).toContain('Senior Backend Engineer');
        expect(prompt).toContain('Ada Lovelace');
        expect(prompt).toContain('phone');
        expect(prompt).toContain('2024-12-15');
        expect(prompt).toContain('14:30');
    });

    it('formats Q&A pairs with numbered "Soru N:" / "Cevap:" labels', () => {
        const prompt = buildManualInterviewPrompt({
            ...baseInput,
            questions: [
                { question: 'Q1', answer: 'A1' },
                { question: 'Q2', answer: 'A2' },
            ],
        });
        expect(prompt).toContain('Soru 1: Q1');
        expect(prompt).toContain('Cevap: A1');
        expect(prompt).toContain('Soru 2: Q2');
        expect(prompt).toContain('Cevap: A2');
    });

    it('substitutes a placeholder for empty answers (so AI sees "no answer" explicitly)', () => {
        const prompt = buildManualInterviewPrompt({
            ...baseInput,
            questions: [{ question: 'Why?', answer: '' }],
        });
        expect(prompt).toContain('Cevap: (cevap girilmedi)');
    });

    it('includes optional transcript when provided', () => {
        const prompt = buildManualInterviewPrompt({
            ...baseInput,
            transcript: 'A: Hi\nB: Hello',
        });
        expect(prompt).toContain('Tam Transkript:');
        expect(prompt).toContain('A: Hi');
        expect(prompt).toContain('B: Hello');
    });

    it('includes optional recruiter notes when provided', () => {
        const prompt = buildManualInterviewPrompt({
            ...baseInput,
            notes: 'Aday hazırlıklı geldi, iletişim güçlü.',
        });
        expect(prompt).toContain('Görüşmeci Notları:');
        expect(prompt).toContain('hazırlıklı');
    });

    it('omits transcript section when blank or whitespace-only', () => {
        const prompt = buildManualInterviewPrompt({ ...baseInput, transcript: '   \n  ' });
        expect(prompt).not.toContain('Tam Transkript:');
    });

    it('omits notes section when blank or whitespace-only', () => {
        const prompt = buildManualInterviewPrompt({ ...baseInput, notes: '\t\t' });
        expect(prompt).not.toContain('Görüşmeci Notları:');
    });

    it('truncates oversized transcript to 12000 chars (defends prompt budget)', () => {
        const huge = 'X'.repeat(20000);
        const prompt = buildManualInterviewPrompt({ ...baseInput, transcript: huge });
        // The substring of X's in the prompt should be <= 12000
        const xRun = prompt.match(/X+/)?.[0] || '';
        expect(xRun.length).toBeLessThanOrEqual(12000);
    });

    it('truncates oversized notes to 4000 chars', () => {
        const huge = 'Y'.repeat(8000);
        const prompt = buildManualInterviewPrompt({ ...baseInput, notes: huge });
        const yRun = prompt.match(/Y+/)?.[0] || '';
        expect(yRun.length).toBeLessThanOrEqual(4000);
    });

    it('handles empty questions list with a placeholder line', () => {
        const prompt = buildManualInterviewPrompt({
            ...baseInput,
            questions: [],
            notes: 'sadece notlar',
        });
        expect(prompt).toContain('(soru-cevap girilmedi)');
    });

    it('falls back to "Genel Pozisyon" when positionTitle is missing', () => {
        const prompt = buildManualInterviewPrompt({ ...baseInput, positionTitle: '' });
        expect(prompt).toContain('Genel Pozisyon');
    });

    it('asks for the strict JSON output shape the route handler parses', () => {
        const prompt = buildManualInterviewPrompt(baseInput);
        // The parser in /api/create-manual-interview reads these keys —
        // pin the prompt's request shape so a tweak doesn't break the parser.
        expect(prompt).toContain('"questions"');
        expect(prompt).toContain('"score"');
        expect(prompt).toContain('"rationale"');
        expect(prompt).toContain('"aggregateScore"');
        expect(prompt).toContain('"summary"');
        expect(prompt).toContain('"recommendedOutcome"');
    });

    it('mentions all three valid recommendedOutcome values so the model knows the enum', () => {
        const prompt = buildManualInterviewPrompt(baseInput);
        expect(prompt).toContain('positive');
        expect(prompt).toContain('negative');
        expect(prompt).toContain('pending');
    });
});
