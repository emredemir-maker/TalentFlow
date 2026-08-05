import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGenerateText = vi.hoisted(() => vi.fn());
vi.mock('./gemini.js', () => ({ generateText: mockGenerateText }));
vi.mock('./pdf.js', () => ({ pdf: vi.fn() }));
vi.mock('../config/firebaseAdmin.js', () => ({
    db: {},
    admin: { firestore: { FieldValue: { serverTimestamp: () => ({}) } } },
}));

const { computePrescore, keywordPrescore } = await import('./prescore.js');

const CANDIDATE = {
    position: 'frontend developer',
    skills: ['react', 'javascript'],
    cvText: 'React ve JavaScript ile 5 yıllık frontend developer deneyimi. '.repeat(3),
};
const TITLES = ['Frontend Developer', 'İK Uzmanı'];

beforeEach(() => {
    mockGenerateText.mockReset();
});

describe('keywordPrescore', () => {
    it('picks the best-scoring open position', () => {
        const result = keywordPrescore(CANDIDATE, TITLES);
        expect(result.matchedTitle).toBe('Frontend Developer');
        expect(result.score).toBeGreaterThan(0);
        expect(result.method).toBe('keyword');
    });

    it('returns zero with a null title and an explanatory reason when nothing matches', () => {
        const result = keywordPrescore({ position: 'muhasebeci', skills: [] }, ['Frontend Developer']);
        expect(result.score).toBe(0);
        expect(result.matchedTitle).toBeNull();
        expect(result.matchReason).toBe('Uygun açık pozisyon bulunamadı.');
    });
});

describe('computePrescore', () => {
    it('uses the AI score when Gemini returns valid JSON', async () => {
        mockGenerateText.mockResolvedValue('{"matchScore": 130, "matchedPosition": "Frontend Developer", "matchReason": "Güçlü React deneyimi"}');
        const result = await computePrescore(CANDIDATE, TITLES);
        expect(result).toEqual({ score: 100, matchedTitle: 'Frontend Developer', matchReason: 'Güçlü React deneyimi', suggestedRole: '', method: 'ai' });
    });

    it('passes through the CV-based suggested role independently of the open-position match', async () => {
        mockGenerateText.mockResolvedValue('{"matchScore": 60, "matchedPosition": "Frontend Developer", "matchReason": "ok", "suggestedRole": "Senior UI Engineer"}');
        const result = await computePrescore(CANDIDATE, TITLES);
        expect(result.suggestedRole).toBe('Senior UI Engineer');
        expect(result.matchedTitle).toBe('Frontend Developer');
    });

    it('rejects an AI-invented position title and falls back to keyword scoring', async () => {
        mockGenerateText.mockResolvedValue('{"matchScore": 88, "matchedPosition": "Growth Hacker Ninja", "matchReason": "..."}');
        const result = await computePrescore(CANDIDATE, TITLES);
        expect(result.method).toBe('keyword');
        expect(result.matchedTitle).toBe('Frontend Developer'); // listedeki gerçek en iyi
    });

    it('accepts the AI title case-insensitively and returns the canonical spelling', async () => {
        mockGenerateText.mockResolvedValue('{"matchScore": 70, "matchedPosition": "frontend developer", "matchReason": "ok"}');
        const result = await computePrescore(CANDIDATE, TITLES);
        expect(result).toEqual({ score: 70, matchedTitle: 'Frontend Developer', matchReason: 'ok', suggestedRole: '', method: 'ai' });
    });

    it('falls back to keyword scoring when Gemini output is unparseable', async () => {
        mockGenerateText.mockResolvedValue('bu bir json değil');
        const result = await computePrescore(CANDIDATE, TITLES);
        expect(result.method).toBe('keyword');
        expect(result.matchedTitle).toBe('Frontend Developer');
    });

    it('falls back to keyword scoring when Gemini throws', async () => {
        mockGenerateText.mockRejectedValue(new Error('quota'));
        const result = await computePrescore(CANDIDATE, TITLES);
        expect(result.method).toBe('keyword');
    });

    it('skips the AI call entirely when cvText is missing', async () => {
        const result = await computePrescore({ position: 'frontend developer', skills: ['react'] }, TITLES);
        expect(result.method).toBe('keyword');
        expect(mockGenerateText).not.toHaveBeenCalled();
    });
});
